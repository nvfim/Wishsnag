import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WishSnagDB, setDb, db } from '@/db/schema';
import {
  saveDraftAsNewItem, addDraftAsOffer, updateItem, deleteItems, createCollection, deleteCollection, setItemCollections,
  recordObservation, checkDuplicates, exportAll, importBundle, deleteAllData, alertsForItem, upsertAlert, deleteOffer,
} from '@/db/repo';
import { saveSettings, loadSettings } from '@/db/settingsStore';
import { resetKv } from '@/platform/storage';
import { draftFromExtraction, draftFromInput, type ProductDraft } from '@/core/draft';
import { extractProduct } from '@/core/extraction/extractProduct';
import { collectFromHtml } from '@/core/extraction/htmlString';
import { processObservation, flushHeldNotifications } from '@/services/alertsService';
import { checkOffer, runScheduledChecks } from '@/services/monitorService';
import { parseExportBundle, buildExportBundle } from '@/core/importExport/json';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixture = (name: string) => readFileSync(join(process.cwd(), 'tests/fixtures/pages', name), 'utf8');
const AU_URL = 'https://www.fixture-electronics.com.au/products/sony-wh1000xm5-black';

const created: string[] = [];
function installChromeMock(opts: { permitted?: boolean } = {}) {
  const notifications: unknown[] = [];
  (globalThis as unknown as { chrome: unknown }).chrome = {
    permissions: { contains: vi.fn(async () => opts.permitted ?? true) },
    notifications: { create: vi.fn(async (id: string, o: unknown) => { notifications.push({ id, ...(o as object) }); return id; }) },
    runtime: { getURL: (p: string) => `chrome-extension://test/${p}` },
    action: { setBadgeText: vi.fn(async () => undefined), setBadgeBackgroundColor: vi.fn(async () => undefined) },
  };
  return notifications as { id: string; title: string; message: string }[];
}

function auDraft(): ProductDraft {
  return draftFromExtraction(extractProduct(collectFromHtml(fixture('au-headphones.html'), AU_URL)));
}

let dbName = '';
beforeEach(async () => {
  resetKv();
  dbName = `test-${Math.random().toString(36).slice(2)}`;
  setDb(new WishSnagDB(dbName));
  created.push(dbName);
  await saveSettings({ onboarded: true, residenceCountry: 'AU', shoppingCountry: 'AU', deliveryCountry: 'AU', displayCurrency: 'AUD', alerts: { ...(await loadSettings()).alerts, quietHours: { enabled: false, start: '22:00', end: '08:00' } } });
});
afterEach(() => {
  db().close();
  setDb(null);
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe('wishlist persistence & CRUD', () => {
  it('saves a product with offer, first observation and default alerts', async () => {
    const settings = await loadSettings();
    const { item, offer, observation } = await saveDraftAsNewItem({ ...auDraft(), targetPrice: 399 }, settings);
    expect(item.title).toContain('WH-1000XM5');
    expect(item.targetCurrency).toBe('AUD');
    expect(offer).toMatchObject({ price: 449, currency: 'AUD', matchConfidence: 'source', source: 'saved_page', urlKey: 'https://fixture-electronics.com.au/products/sony-wh1000xm5-black' });
    expect(offer.check.enabled).toBe(true);
    expect(offer.lastVerifiedAt).not.toBeNull();
    expect(observation).toMatchObject({ price: 449, source: 'save' });
    const alerts = await alertsForItem(item.id);
    expect(alerts.find((a) => a.type === 'below_target')).toMatchObject({ enabled: true, armed: true });
  });

  it('keeps data after the database is closed and reopened (like restarting Chrome)', async () => {
    const { item } = await saveDraftAsNewItem(auDraft(), await loadSettings());
    db().close();
    setDb(new WishSnagDB(dbName));
    expect((await db().items.get(item.id))?.title).toBe(item.title);
    expect(await db().offers.where('itemId').equals(item.id).count()).toBe(1);
  });

  it('manual entries are not treated as verified observations', async () => {
    const res = draftFromInput({ title: 'Handmade mug', url: 'https://tiny-pottery.example/mug', price: 35, currency: 'NZD' });
    if (!res.ok) throw new Error('invalid');
    const { offer, observation } = await saveDraftAsNewItem(res.draft, await loadSettings());
    expect(offer.source).toBe('manual');
    expect(offer.lastVerifiedAt).toBeNull();
    expect(offer.check.enabled).toBe(false);
    expect(observation?.source).toBe('manual_entry');
  });

  it('edits items and re-arms the target alert', async () => {
    const { item } = await saveDraftAsNewItem(auDraft(), await loadSettings());
    const next = await updateItem(item.id, { targetPrice: 500, priority: 'high', notes: 'birthday', tags: ['audio'] });
    expect(next).toMatchObject({ targetPrice: 500, targetCurrency: 'AUD', priority: 'high', notes: 'birthday' });
    const alert = (await alertsForItem(item.id)).find((a) => a.type === 'below_target')!;
    expect(alert).toMatchObject({ enabled: true, armed: false }); // already below 500
    await updateItem(item.id, { status: 'purchased' });
    expect((await db().items.get(item.id))?.purchasedAt).not.toBeNull();
  });

  it('deletes items with all their offers, history, alerts and notifications', async () => {
    const { item } = await saveDraftAsNewItem(auDraft(), await loadSettings());
    await deleteItems([item.id]);
    expect(await db().items.count()).toBe(0);
    expect(await db().offers.count()).toBe(0);
    expect(await db().observations.count()).toBe(0);
    expect(await db().alerts.count()).toBe(0);
    expect(await db().tombstones.where('table').equals('items').count()).toBe(1);
  });

  it('manages collections', async () => {
    const { item } = await saveDraftAsNewItem(auDraft(), await loadSettings());
    const tech = await createCollection({ name: 'Tech I Want', emoji: '🎧' });
    const gifts = await createCollection({ name: 'Gift Ideas' });
    await setItemCollections([item.id], [tech.id, gifts.id]);
    expect((await db().items.get(item.id))?.collectionIds).toEqual([tech.id, gifts.id]);
    await deleteCollection(gifts.id);
    expect((await db().items.get(item.id))?.collectionIds).toEqual([tech.id]);
    await expect(createCollection({ name: '   ' })).rejects.toThrow();
  });

  it('detects duplicates by listing and by product identity, but keeps variants separate', async () => {
    const settings = await loadSettings();
    await saveDraftAsNewItem(auDraft(), settings);
    const same = await checkDuplicates(auDraft());
    expect(same.sameListing).not.toBeNull();
    const otherStore = { ...auDraft(), url: 'https://other-store.example/xm5', retailer: { id: null, name: 'Other', domain: 'other-store.example', country: 'AU' } };
    const identity = await checkDuplicates(otherStore);
    expect(identity.sameListing).toBeNull();
    expect(identity.candidates[0]?.result.confidence).toBe('verified_exact');
    const variant = { ...otherStore, title: 'Sony WH-1000XM5 Headphones (Silver)', identifiers: {}, variant: { colour: 'silver' } };
    expect((await checkDuplicates(variant)).candidates).toHaveLength(0);
  });

  it('the saved offer cannot be deleted on its own', async () => {
    const { offer } = await saveDraftAsNewItem(auDraft(), await loadSettings());
    await expect(deleteOffer(offer.id)).rejects.toThrow(/saved offer/);
  });
});

describe('observations → alerts → notifications', () => {
  it('Scenario A: a genuine drop below target creates one in-app + desktop notification, never duplicated', async () => {
    const desktop = installChromeMock();
    const settings = await loadSettings();
    const { item, offer } = await saveDraftAsNewItem({ ...auDraft(), targetPrice: 400 }, settings);
    const t0 = Date.now();
    const rec = await recordObservation(offer.id, { price: 379, currency: 'AUD', availability: 'in_stock', source: 'background_check', observedAt: t0 + 7200_000 });
    expect(rec.offer.history).toMatchObject({ firstPrice: 449, minPrice: 379, previousPrice: 449, count: 2 });
    const notes = await processObservation(rec, t0 + 7200_000);
    expect(notes.map((n) => n.kind).sort()).toEqual(['below_target', 'percent_drop']);
    const target = notes.find((n) => n.kind === 'below_target')!;
    expect(target.message).toBe(`${item.title.length > 60 ? item.title.slice(0, 57).trimEnd() + '…' : item.title} just hit your target price: $379.`);
    expect(desktop.length).toBe(1); // cooldown suppresses the second pop-up for the same item
    // Processing the same observation again doesn't duplicate.
    expect(await processObservation(rec, t0 + 7200_000)).toHaveLength(0);
    expect(await db().notifications.count()).toBe(2);
  });

  it('holds desktop pop-ups during quiet hours and flushes them afterwards', async () => {
    const desktop = installChromeMock();
    await saveSettings((s) => ({ ...s, alerts: { ...s.alerts, quietHours: { enabled: true, start: '00:00', end: '23:59' } } }));
    const { offer } = await saveDraftAsNewItem(auDraft(), await loadSettings());
    const rec = await recordObservation(offer.id, { price: 299, currency: 'AUD', availability: 'in_stock', source: 'background_check', observedAt: Date.now() + 7200_000 });
    const notes = await processObservation(rec);
    expect(notes[0]?.desktopStatus).toBe('held');
    expect(desktop).toHaveLength(0);
    await saveSettings((s) => ({ ...s, alerts: { ...s.alerts, quietHours: { enabled: false, start: '22:00', end: '08:00' } } }));
    expect(await flushHeldNotifications()).toBe(1);
    expect(desktop).toHaveLength(1);
  });

  it('a cheaper verified offer from another store triggers a cheaper-offer alert', async () => {
    installChromeMock();
    const settings = await loadSettings();
    const base = auDraft();
    const { item } = await saveDraftAsNewItem(base, settings);
    const other: ProductDraft = { ...base, url: 'https://cheaper.example.com.au/xm5', price: 399, retailer: { id: null, name: 'Cheaper AU', domain: 'cheaper.example.com.au', country: 'AU' }, shippingQuotes: [{ destinationCountry: 'AU', amount: 0, currency: 'AUD', source: 'page' }], taxIncluded: true };
    const { offer } = await addDraftAsOffer(item.id, other, settings);
    expect(offer.matchConfidence).toBe('verified_exact');
    const rec = await recordObservation(offer.id, { price: 389, currency: 'AUD', availability: 'in_stock', source: 'manual_refresh', observedAt: Date.now() + 7200_000 });
    const notes = await processObservation(rec);
    expect(notes.map((n) => n.kind)).toEqual(['cheaper_offer']);
    expect(notes[0]!.message).toContain('Cheaper AU');
    expect(notes[0]!.message).toContain('$60');
  });

  it('per-item alert settings can be changed', async () => {
    const { item } = await saveDraftAsNewItem(auDraft(), await loadSettings());
    await upsertAlert(item.id, 'amount_drop', { enabled: true, threshold: 25 });
    expect((await alertsForItem(item.id)).find((a) => a.type === 'amount_drop')).toMatchObject({ enabled: true, threshold: 25 });
  });
});

describe('background price checks', () => {
  const page = (price: string) => fixture('au-headphones.html').replace(/"449\.00"/g, `"${price}"`);
  const fetchReturning = (status: number, body: string) => vi.fn(async () => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })) as unknown as typeof fetch;

  it('records a new structured price and updates history', async () => {
    installChromeMock();
    const { offer } = await saveDraftAsNewItem(auDraft(), await loadSettings());
    const out = await checkOffer(offer.id, 'manual_refresh', { fetchImpl: fetchReturning(200, page('399.00')), now: Date.now() + 2 * 3600_000 });
    expect(out).toMatchObject({ status: 'ok', price: 399, currency: 'AUD', changed: true });
    expect(await db().observations.count()).toBe(2);
  });

  it('skips stores without granted access instead of fetching', async () => {
    installChromeMock({ permitted: false });
    const { offer } = await saveDraftAsNewItem(auDraft(), await loadSettings());
    const fetchImpl = fetchReturning(200, page('399.00'));
    expect((await checkOffer(offer.id, 'background_check', { fetchImpl })).status).toBe('needs_permission');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('backs off when a store blocks automated checks (no retry storm)', async () => {
    installChromeMock();
    const { offer } = await saveDraftAsNewItem(auDraft(), await loadSettings());
    const now = Date.now() + 3600_000;
    const out = await checkOffer(offer.id, 'background_check', { fetchImpl: fetchReturning(403, 'Access denied'), now });
    expect(out.status).toBe('blocked');
    const after = await db().offers.get(offer.id);
    expect(after!.check.nextCheckAt! - now).toBeGreaterThanOrEqual(24 * 3600_000);
    const fetchImpl = fetchReturning(200, page('1.00'));
    expect((await checkOffer(offer.id, 'background_check', { fetchImpl, now: now + 1000 })).status).toBe('rate_limited');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a page that now shows a different product', async () => {
    installChromeMock();
    const { offer } = await saveDraftAsNewItem(auDraft(), await loadSettings());
    const out = await checkOffer(offer.id, 'manual_refresh', { fetchImpl: fetchReturning(200, page('10.00').replace('4548736132610', '5012345678900')), now: Date.now() + 2 * 3600_000 });
    expect(out.status).toBe('no_price');
    expect(await db().observations.count()).toBe(1);
  });

  it('runs scheduled checks only for due, active items', async () => {
    installChromeMock();
    const settings = await loadSettings();
    const a = await saveDraftAsNewItem(auDraft(), settings);
    const b = await saveDraftAsNewItem({ ...auDraft(), url: `${AU_URL}?v=2` }, settings);
    await updateItem(b.item.id, { status: 'purchased' });
    const later = Date.now() + 13 * 3600_000;
    const summary = await runScheduledChecks({ fetchImpl: fetchReturning(200, page('429.00')), now: later, sleep: async () => undefined });
    expect(summary.checked).toBe(1);
    expect(summary.outcomes[0]!.offerId).toBe(a.offer.id);
  });
});

describe('backup import / export & deletion', () => {
  it('round-trips a JSON backup into a fresh database and recomputes history', async () => {
    const settings = await loadSettings();
    const { offer } = await saveDraftAsNewItem(auDraft(), settings);
    await recordObservation(offer.id, { price: 399, currency: 'AUD', availability: 'in_stock', source: 'background_check', observedAt: Date.now() + 7200_000 });
    await createCollection({ name: 'Tech I Want' });
    const bundle = JSON.parse(JSON.stringify(buildExportBundle(await exportAll(), '0.1.0')));
    setDb(new WishSnagDB(`${dbName}-restore`));
    const res = await importBundle(parseExportBundle(bundle), settings);
    expect(res).toEqual({ items: 1, collections: 1, observations: 2 });
    expect((await db().offers.get(offer.id))?.history).toMatchObject({ firstPrice: 449, minPrice: 399, previousPrice: 449 });
    // Importing again is idempotent.
    expect(await importBundle(parseExportBundle(bundle), settings)).toEqual({ items: 0, collections: 0, observations: 0 });
  });

  it('deletes all local data', async () => {
    await saveDraftAsNewItem(auDraft(), await loadSettings());
    await deleteAllData();
    expect(await db().items.count()).toBe(0);
  });
});
