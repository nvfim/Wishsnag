import type {
  AlertType,
  AppNotification,
  Availability,
  Collection,
  CollectionColor,
  MatchConfidence,
  ObservationSource,
  OfferHistoryStats,
  OfferSource,
  PriceAlert,
  PriceObservation,
  RetailerOffer,
  Settings,
  ShippingQuote,
  WishlistItem,
} from '@/core/types';
import type { ProductDraft } from '@/core/draft';
import { newId } from '@/core/util/id';
import { normaliseProductUrl } from '@/core/util/url';
import { findDuplicates, matchProducts, type MatchResult } from '@/core/matching/match';
import type { ParsedBundle } from '@/core/importExport/json';
import { db, type SyncedTable } from './schema';

const HOUR = 3600_000;

// ----------------------------------------------------------------------------- helpers

function defaultCheck(enabled: boolean, now: number, intervalHours: number): RetailerOffer['check'] {
  return { enabled, nextCheckAt: enabled ? now + intervalHours * HOUR : null, failures: 0, lastStatus: null, lastCheckedAt: null };
}

export function historyWith(stats: OfferHistoryStats | null, price: number, currency: string, at: number): OfferHistoryStats {
  if (!stats || stats.currency !== currency) {
    return { currency, firstPrice: price, firstAt: at, minPrice: price, maxPrice: price, previousPrice: null, lastChangeAt: null, count: 1 };
  }
  return {
    ...stats,
    minPrice: Math.min(stats.minPrice, price),
    maxPrice: Math.max(stats.maxPrice, price),
    count: stats.count + 1,
  };
}

async function tombstone(table: SyncedTable, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const now = Date.now();
  await db().tombstones.bulkPut(ids.map((id) => ({ key: `${table}:${id}`, table, id, deletedAt: now })));
}

function isExtracted(draft: ProductDraft): boolean {
  return draft.methods.some((m) => m !== 'manual');
}

export function defaultAlertsFor(item: WishlistItem, settings: Settings, latestPrice: number | null, now: number): PriceAlert[] {
  const make = (type: AlertType, enabled: boolean, over: Partial<PriceAlert> = {}): PriceAlert => ({
    id: newId('al_'),
    itemId: item.id,
    type,
    threshold: null,
    periodDays: null,
    enabled,
    lastTriggeredAt: null,
    lastTriggeredPrice: null,
    armed: true,
    createdAt: now,
    updatedAt: now,
    ...over,
  });
  return [
    make('below_target', item.targetPrice !== null, { armed: latestPrice === null || item.targetPrice === null || latestPrice > item.targetPrice }),
    make('percent_drop', true, { threshold: settings.alerts.defaultDropPercent }),
    make('amount_drop', false),
    make('lowest_in_period', false, { periodDays: 30 }),
    make('cheaper_offer', true),
    make('back_in_stock', true),
  ];
}

function offerFromDraft(draft: ProductDraft, itemId: string, now: number, settings: Settings, opts: { source: OfferSource; confidence: MatchConfidence | 'source'; reasons?: string[] }): RetailerOffer {
  const extracted = isExtracted(draft) && opts.source !== 'import';
  // Imported items with a link can be verified later by a price check of the listing itself.
  const canMonitor = settings.monitoring.enabled && !!draft.url && (extracted || opts.source === 'import');
  return {
    id: newId('of_'),
    itemId,
    retailerId: draft.retailer.id,
    retailerName: draft.retailer.name || draft.retailer.domain || 'Store',
    retailerDomain: draft.retailer.domain,
    retailerCountry: draft.retailer.country,
    url: draft.url,
    urlKey: draft.url ? normaliseProductUrl(draft.url) : '',
    title: draft.title,
    imageUrl: draft.imageUrl,
    price: draft.price,
    currency: draft.currency,
    listPrice: draft.listPrice,
    shippingQuotes: draft.shippingQuotes.map((q) => ({ ...q, recordedAt: now })),
    taxIncluded: draft.taxIncluded,
    availability: draft.availability,
    condition: draft.condition,
    brand: draft.brand,
    model: draft.model,
    identifiers: { ...draft.identifiers },
    variant: { ...draft.variant },
    matchConfidence: opts.confidence,
    matchReasons: opts.reasons ?? [],
    source: opts.source,
    extractionMethods: draft.methods,
    // Only prices read from the listing itself count as verified by WishSnag.
    lastVerifiedAt: extracted && draft.price !== null ? now : null,
    seller: draft.seller,
    paymentMethods: draft.paymentMethods,
    check: defaultCheck(canMonitor, now, settings.monitoring.intervalHours),
    history: draft.price !== null && draft.currency ? historyWith(null, draft.price, draft.currency, now) : null,
    createdAt: now,
    updatedAt: now,
  };
}

function observationSourceFor(draft: ProductDraft, offerSource: OfferSource): ObservationSource {
  if (offerSource === 'import') return 'import';
  return isExtracted(draft) ? 'save' : 'manual_entry';
}

// ----------------------------------------------------------------------------- items

export interface SaveResult {
  item: WishlistItem;
  offer: RetailerOffer;
  observation: PriceObservation | null;
}

export async function saveDraftAsNewItem(draft: ProductDraft, settings: Settings, opts: { source?: OfferSource; now?: number } = {}): Promise<SaveResult> {
  const now = opts.now ?? Date.now();
  const savedAt = draft.savedAt && draft.savedAt < now ? draft.savedAt : now;
  const source: OfferSource = opts.source ?? (isExtracted(draft) ? 'saved_page' : 'manual');
  const itemId = newId('it_');
  const offer = offerFromDraft(draft, itemId, now, settings, { source, confidence: 'source' });
  const item: WishlistItem = {
    id: itemId,
    title: draft.title,
    brand: draft.brand,
    model: draft.model,
    category: draft.category,
    description: draft.description,
    imageUrl: draft.imageUrl,
    identifiers: { ...draft.identifiers },
    variant: { ...draft.variant },
    condition: draft.condition,
    primaryOfferId: offer.id,
    collectionIds: [...new Set(draft.collectionIds)],
    tags: draft.tags,
    notes: draft.notes,
    priority: draft.priority,
    status: draft.status,
    archived: false,
    targetPrice: draft.targetPrice,
    targetCurrency: draft.targetPrice !== null ? (draft.currency ?? settings.displayCurrency) : null,
    inBudgetPlan: false,
    createdAt: savedAt,
    updatedAt: now,
    purchasedAt: draft.status === 'purchased' ? now : null,
  };
  const observation: PriceObservation | null =
    draft.price !== null && draft.currency
      ? { id: newId('ob_'), offerId: offer.id, itemId, price: draft.price, currency: draft.currency, availability: draft.availability, source: observationSourceFor(draft, source), observedAt: now }
      : null;
  const alerts = defaultAlertsFor(item, settings, draft.price, now);
  await db().transaction('rw', [db().items, db().offers, db().observations, db().alerts], async () => {
    await db().items.add(item);
    await db().offers.add(offer);
    if (observation) await db().observations.add(observation);
    await db().alerts.bulkAdd(alerts);
  });
  return { item, offer, observation };
}

/** Adds another retailer's listing to an existing item (e.g. same product at a different store). */
export async function addDraftAsOffer(itemId: string, draft: ProductDraft, settings: Settings, opts: { source?: OfferSource; match?: MatchResult; now?: number } = {}): Promise<{ offer: RetailerOffer; observation: PriceObservation | null }> {
  const now = opts.now ?? Date.now();
  const item = await db().items.get(itemId);
  if (!item) throw new Error('Item not found');
  const match = opts.match ?? matchProducts(item, { ...draft, identifiers: draft.identifiers, variant: draft.variant });
  const confidence: MatchConfidence = match.confidence ?? 'possible';
  const source: OfferSource = opts.source ?? (isExtracted(draft) ? 'linked_page' : 'manual');
  const offer = offerFromDraft(draft, itemId, now, settings, { source, confidence, reasons: [...match.reasons, ...match.conflicts.map((c) => `conflict:${c}`)] });
  const observation: PriceObservation | null =
    draft.price !== null && draft.currency
      ? { id: newId('ob_'), offerId: offer.id, itemId, price: draft.price, currency: draft.currency, availability: draft.availability, source: observationSourceFor(draft, source), observedAt: now }
      : null;
  await db().transaction('rw', [db().offers, db().observations, db().items], async () => {
    await db().offers.add(offer);
    if (observation) await db().observations.add(observation);
    await db().items.update(itemId, { updatedAt: now });
  });
  return { offer, observation };
}

export async function updateItem(id: string, patch: Partial<Omit<WishlistItem, 'id' | 'createdAt'>>): Promise<WishlistItem | undefined> {
  const now = Date.now();
  return db().transaction('rw', [db().items, db().alerts, db().offers], async () => {
    const current = await db().items.get(id);
    if (!current) return undefined;
    const next: WishlistItem = { ...current, ...patch, updatedAt: now };
    if (patch.status === 'purchased' && current.status !== 'purchased') next.purchasedAt = now;
    if (patch.status === 'wanted') next.purchasedAt = null;
    if ('targetPrice' in patch && patch.targetPrice !== current.targetPrice) {
      const primary = current.primaryOfferId ? await db().offers.get(current.primaryOfferId) : undefined;
      if (patch.targetPrice !== null && !patch.targetCurrency) next.targetCurrency = current.targetCurrency ?? primary?.currency ?? null;
      const alert = await db().alerts.where('[itemId+type]').equals([id, 'below_target']).first();
      const latest = primary?.price ?? null;
      const armed = latest === null || patch.targetPrice == null || latest > patch.targetPrice;
      if (alert) await db().alerts.update(alert.id, { enabled: patch.targetPrice !== null, armed, updatedAt: now });
    }
    await db().items.put(next);
    return next;
  });
}

export async function deleteItems(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const d = db();
  await d.transaction('rw', [d.items, d.offers, d.observations, d.alerts, d.notifications, d.providerCache, d.tombstones], async () => {
    const offers = await d.offers.where('itemId').anyOf(ids).primaryKeys();
    const observations = await d.observations.where('itemId').anyOf(ids).primaryKeys();
    const alerts = await d.alerts.where('itemId').anyOf(ids).primaryKeys();
    await d.items.bulkDelete(ids);
    await d.offers.bulkDelete(offers);
    await d.observations.bulkDelete(observations);
    await d.alerts.bulkDelete(alerts);
    await d.notifications.where('itemId').anyOf(ids).delete();
    await d.providerCache.where('itemId').anyOf(ids).delete();
    await tombstone('items', ids);
    await tombstone('offers', offers);
    await tombstone('observations', observations);
    await tombstone('alerts', alerts);
  });
}

export async function deleteOffer(offerId: string): Promise<void> {
  const d = db();
  await d.transaction('rw', [d.items, d.offers, d.observations, d.tombstones], async () => {
    const offer = await d.offers.get(offerId);
    if (!offer) return;
    const item = await d.items.get(offer.itemId);
    if (item?.primaryOfferId === offerId) throw new Error('The saved offer cannot be removed. Delete the item instead, or make another offer the saved one first.');
    const obsIds = await d.observations.where('offerId').equals(offerId).primaryKeys();
    await d.observations.bulkDelete(obsIds);
    await d.offers.delete(offerId);
    await tombstone('offers', [offerId]);
    await tombstone('observations', obsIds);
  });
}

export async function setPrimaryOffer(itemId: string, offerId: string): Promise<void> {
  const d = db();
  await d.transaction('rw', [d.items, d.offers], async () => {
    const offer = await d.offers.get(offerId);
    const item = await d.items.get(itemId);
    if (!offer || !item || offer.itemId !== itemId) throw new Error('Offer not found');
    if (item.primaryOfferId) await d.offers.update(item.primaryOfferId, { matchConfidence: 'verified_exact', updatedAt: Date.now() });
    await d.offers.update(offerId, { matchConfidence: 'source', updatedAt: Date.now() });
    await d.items.update(itemId, { primaryOfferId: offerId, updatedAt: Date.now() });
  });
}

export async function updateOffer(id: string, patch: Partial<Omit<RetailerOffer, 'id' | 'itemId' | 'createdAt'>>): Promise<void> {
  await db().offers.update(id, { ...patch, updatedAt: Date.now() });
}

/** Records a delivery cost the user saw at checkout (marked as user-entered). */
export async function setUserShippingQuote(offerId: string, quote: { destinationCountry: string; amount: number | null; currency: string; note?: string }): Promise<void> {
  const offer = await db().offers.get(offerId);
  if (!offer) return;
  const others = offer.shippingQuotes.filter((q) => !(q.source === 'user' && q.destinationCountry === quote.destinationCountry));
  const next: ShippingQuote[] = quote.amount === null ? others : [...others, { destinationCountry: quote.destinationCountry, amount: quote.amount, currency: quote.currency, source: 'user', note: quote.note, recordedAt: Date.now() }];
  await updateOffer(offerId, { shippingQuotes: next });
}

// ----------------------------------------------------------------------------- observations

export interface RecordedObservation {
  observation: PriceObservation | null;
  previous: PriceObservation | null;
  offer: RetailerOffer;
  changed: boolean;
}

/**
 * Records a genuine price observation for an offer and updates its denormalised state.
 * Identical consecutive observations within an hour are collapsed (the offer is still
 * marked as verified) to avoid flooding history.
 */
export async function recordObservation(
  offerId: string,
  data: { price: number; currency: string; availability: Availability; source: ObservationSource; observedAt?: number },
): Promise<RecordedObservation> {
  const d = db();
  const now = data.observedAt ?? Date.now();
  return d.transaction('rw', [d.offers, d.observations, d.items], async () => {
    const offer = await d.offers.get(offerId);
    if (!offer) throw new Error('Offer not found');
    const previous = (await d.observations.where('[offerId+observedAt]').between([offerId, -Infinity], [offerId, Infinity]).last()) ?? null;
    const verified = data.source !== 'manual_entry' && data.source !== 'import';
    const same = previous && previous.price === data.price && previous.currency === data.currency && previous.availability === data.availability;
    let observation: PriceObservation | null = null;
    let history = offer.history;
    if (!(same && now - previous.observedAt < HOUR)) {
      observation = { id: newId('ob_'), offerId, itemId: offer.itemId, price: data.price, currency: data.currency, availability: data.availability, source: data.source, observedAt: now };
      await d.observations.add(observation);
      history = historyWith(offer.history, data.price, data.currency, now);
      if (previous && previous.currency === data.currency) {
        history = { ...history, previousPrice: previous.price, lastChangeAt: previous.price !== data.price ? now : history.lastChangeAt };
      }
    }
    const next: RetailerOffer = {
      ...offer,
      price: data.price,
      currency: data.currency,
      availability: data.availability,
      lastVerifiedAt: verified ? now : offer.lastVerifiedAt,
      history,
      updatedAt: now,
    };
    await d.offers.put(next);
    await d.items.update(offer.itemId, { updatedAt: now });
    return { observation, previous, offer: next, changed: !!previous && (previous.price !== data.price || previous.availability !== data.availability) };
  });
}

export async function observationsForOffer(offerId: string): Promise<PriceObservation[]> {
  return db().observations.where('[offerId+observedAt]').between([offerId, -Infinity], [offerId, Infinity]).toArray();
}

export async function observationsForItem(itemId: string): Promise<PriceObservation[]> {
  return db().observations.where('[itemId+observedAt]').between([itemId, -Infinity], [itemId, Infinity]).toArray();
}

// ----------------------------------------------------------------------------- lookups

export async function findOffersByUrl(url: string): Promise<RetailerOffer[]> {
  const key = normaliseProductUrl(url);
  return key ? db().offers.where('urlKey').equals(key).toArray() : [];
}

export interface DuplicateReport {
  sameListing: { item: WishlistItem; offer: RetailerOffer } | null;
  candidates: { item: WishlistItem; result: MatchResult }[];
}

export async function checkDuplicates(draft: ProductDraft): Promise<DuplicateReport> {
  const [items, offers] = await Promise.all([db().items.toArray(), db().offers.toArray()]);
  const urlKeys = new Map<string, string[]>();
  for (const o of offers) if (o.urlKey) (urlKeys.get(o.itemId) ?? urlKeys.set(o.itemId, []).get(o.itemId)!).push(o.urlKey);
  const urlKey = draft.url ? normaliseProductUrl(draft.url) : undefined;
  const dupes = findDuplicates({ ...draft, urlKey }, items.map((i) => ({ ...i, urlKeys: urlKeys.get(i.id) ?? [] })));
  const same = dupes.find((d) => d.sameListing);
  const sameOffer = same && urlKey ? offers.find((o) => o.itemId === same.item.id && o.urlKey === urlKey) : undefined;
  return {
    sameListing: same && sameOffer ? { item: same.item, offer: sameOffer } : null,
    candidates: dupes.filter((d) => !d.sameListing).map((d) => ({ item: d.item, result: d.result })),
  };
}

/** Saved items that look like the product on the current page (for "Related saved items"). */
export async function relatedItems(draft: ProductDraft, limit = 5): Promise<{ item: WishlistItem; result: MatchResult }[]> {
  const items = await db().items.toArray();
  return items
    .map((item) => ({ item, result: matchProducts(draft, item) }))
    .filter((r) => r.result.confidence !== null)
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, limit);
}

// ----------------------------------------------------------------------------- collections

export async function createCollection(input: { name: string; description?: string; emoji?: string; color?: CollectionColor; budget?: number | null; budgetCurrency?: string | null }): Promise<Collection> {
  const now = Date.now();
  const count = await db().collections.count();
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new Error('Collection name is required');
  const c: Collection = {
    id: newId('co_'),
    name,
    description: (input.description ?? '').trim().slice(0, 300),
    emoji: input.emoji || '✨',
    color: input.color ?? 'lilac',
    budget: input.budget ?? null,
    budgetCurrency: input.budgetCurrency ?? null,
    sortOrder: count,
    createdAt: now,
    updatedAt: now,
  };
  await db().collections.add(c);
  return c;
}

export async function updateCollection(id: string, patch: Partial<Omit<Collection, 'id' | 'createdAt'>>): Promise<void> {
  if (patch.name !== undefined && !patch.name.trim()) throw new Error('Collection name is required');
  await db().collections.update(id, { ...patch, ...(patch.name ? { name: patch.name.trim().slice(0, 60) } : {}), updatedAt: Date.now() });
}

export async function deleteCollection(id: string): Promise<void> {
  const d = db();
  await d.transaction('rw', [d.collections, d.items, d.tombstones], async () => {
    const items = await d.items.where('collectionIds').equals(id).toArray();
    const now = Date.now();
    await d.items.bulkPut(items.map((i) => ({ ...i, collectionIds: i.collectionIds.filter((c) => c !== id), updatedAt: now })));
    await d.collections.delete(id);
    await tombstone('collections', [id]);
  });
}

export async function reorderCollections(ids: string[]): Promise<void> {
  const now = Date.now();
  await db().transaction('rw', db().collections, async () => {
    for (const [i, id] of ids.entries()) await db().collections.update(id, { sortOrder: i, updatedAt: now });
  });
}

export async function setItemCollections(itemIds: string[], collectionIds: string[], mode: 'replace' | 'add' | 'remove' = 'replace'): Promise<void> {
  const now = Date.now();
  await db().transaction('rw', db().items, async () => {
    const items = await db().items.bulkGet(itemIds);
    const next = items.filter((i): i is WishlistItem => !!i).map((i) => {
      let ids = i.collectionIds;
      if (mode === 'replace') ids = collectionIds;
      else if (mode === 'add') ids = [...new Set([...ids, ...collectionIds])];
      else ids = ids.filter((c) => !collectionIds.includes(c));
      return { ...i, collectionIds: ids, updatedAt: now };
    });
    await db().items.bulkPut(next);
  });
}

// ----------------------------------------------------------------------------- alerts

export async function alertsForItem(itemId: string): Promise<PriceAlert[]> {
  return db().alerts.where('itemId').equals(itemId).toArray();
}

export async function upsertAlert(itemId: string, type: AlertType, patch: Partial<Pick<PriceAlert, 'enabled' | 'threshold' | 'periodDays'>>): Promise<void> {
  const now = Date.now();
  const existing = await db().alerts.where('[itemId+type]').equals([itemId, type]).first();
  if (existing) {
    const reset = patch.threshold !== undefined && patch.threshold !== existing.threshold;
    await db().alerts.update(existing.id, { ...patch, ...(reset ? { lastTriggeredPrice: null } : {}), updatedAt: now });
  } else {
    await db().alerts.add({ id: newId('al_'), itemId, type, threshold: patch.threshold ?? null, periodDays: patch.periodDays ?? (type === 'lowest_in_period' ? 30 : null), enabled: patch.enabled ?? true, lastTriggeredAt: null, lastTriggeredPrice: null, armed: true, createdAt: now, updatedAt: now });
  }
}

export async function applyAlertUpdates(updates: { id: string; armed?: boolean; lastTriggeredAt?: number; lastTriggeredPrice?: number | null }[]): Promise<void> {
  const now = Date.now();
  await db().transaction('rw', db().alerts, async () => {
    for (const u of updates) {
      const { id, ...rest } = u;
      await db().alerts.update(id, { ...rest, updatedAt: now });
    }
  });
}

// ----------------------------------------------------------------------------- notifications

export async function addNotification(n: Omit<AppNotification, 'id' | 'createdAt' | 'readAt'> & { createdAt?: number }): Promise<AppNotification | null> {
  return db().transaction('rw', db().notifications, async () => {
    const dupe = await db().notifications.where('dedupeKey').equals(n.dedupeKey).first();
    if (dupe) return null;
    const record: AppNotification = { ...n, id: newId('nt_'), createdAt: n.createdAt ?? Date.now(), readAt: null };
    await db().notifications.add(record);
    return record;
  });
}

export async function markNotificationsRead(ids?: string[]): Promise<void> {
  const now = Date.now();
  const list = ids ? await db().notifications.bulkGet(ids) : await db().notifications.toArray();
  await db().notifications.bulkPut(list.filter((n): n is AppNotification => !!n && n.readAt === null).map((n) => ({ ...n, readAt: now })));
}

export async function clearNotifications(): Promise<void> {
  await db().notifications.clear();
}

export async function lastDesktopNotificationFor(itemId: string): Promise<number | null> {
  const list = await db().notifications.where('itemId').equals(itemId).toArray();
  const sent = list.filter((n) => n.desktopStatus === 'sent').map((n) => n.createdAt);
  return sent.length ? Math.max(...sent) : null;
}

// ----------------------------------------------------------------------------- bulk data

export async function exportAll(): Promise<Omit<ParsedBundle, 'settings'>> {
  const d = db();
  const [items, offers, observations, collections, alerts] = await Promise.all([d.items.toArray(), d.offers.toArray(), d.observations.toArray(), d.collections.toArray(), d.alerts.toArray()]);
  return { items, offers, observations, collections, alerts };
}

/** Merges a validated backup: unknown records are added; for known ids the newer `updatedAt` wins. */
export async function importBundle(bundle: ParsedBundle, settings: Settings): Promise<{ items: number; collections: number; observations: number }> {
  const d = db();
  let items = 0;
  let collections = 0;
  let observations = 0;
  await d.transaction('rw', [d.items, d.offers, d.observations, d.collections, d.alerts], async () => {
    for (const c of bundle.collections) {
      const existing = await d.collections.get(c.id);
      if (!existing || existing.updatedAt < c.updatedAt) {
        await d.collections.put(c);
        collections++;
      }
    }
    for (const it of bundle.items) {
      const existing = await d.items.get(it.id);
      if (!existing || existing.updatedAt < it.updatedAt) {
        await d.items.put(it);
        items++;
      }
    }
    const obsByOffer = new Map<string, PriceObservation[]>();
    for (const o of bundle.observations) (obsByOffer.get(o.offerId) ?? obsByOffer.set(o.offerId, []).get(o.offerId)!).push(o);
    for (const of of bundle.offers) {
      const existing = await d.offers.get(of.id);
      if (existing && existing.updatedAt >= of.updatedAt) continue;
      let history: OfferHistoryStats | null = null;
      const list = (obsByOffer.get(of.id) ?? []).sort((a, b) => a.observedAt - b.observedAt);
      let prev: PriceObservation | undefined;
      for (const o of list) {
        history = historyWith(history, o.price, o.currency, o.observedAt);
        if (prev && prev.currency === o.currency) history = { ...history, previousPrice: prev.price, lastChangeAt: prev.price !== o.price ? o.observedAt : history.lastChangeAt };
        prev = o;
      }
      const check = { ...of.check, nextCheckAt: of.check.enabled && settings.monitoring.enabled ? Date.now() + settings.monitoring.intervalHours * HOUR : null };
      await d.offers.put({ ...of, history, check });
    }
    const existingObs = new Set(await d.observations.where('id').anyOf(bundle.observations.map((o) => o.id)).primaryKeys());
    const fresh = bundle.observations.filter((o) => !existingObs.has(o.id));
    await d.observations.bulkPut(fresh);
    observations = fresh.length;
    for (const a of bundle.alerts) {
      const existing = await d.alerts.get(a.id);
      if (!existing || existing.updatedAt < a.updatedAt) await d.alerts.put(a);
    }
  });
  return { items, collections, observations };
}

export async function deleteAllData(): Promise<void> {
  const d = db();
  await d.transaction('rw', d.tables, async () => {
    await Promise.all(d.tables.map((t) => t.clear()));
  });
}
