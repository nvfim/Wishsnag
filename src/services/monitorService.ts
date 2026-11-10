import type { CheckStatus, ObservationSource, RetailerOffer } from '@/core/types';
import { collectFromHtml, looksLikeBotChallenge } from '@/core/extraction/htmlString';
import { extractProduct } from '@/core/extraction/extractProduct';
import type { ExtractionResult } from '@/core/types';
import { normaliseGtin } from '@/core/matching/identifiers';
import { hostnameOf } from '@/core/util/url';
import { db } from '@/db/schema';
import { recordObservation, updateOffer } from '@/db/repo';
import { loadSettings } from '@/db/settingsStore';
import { kv, STORAGE_KEYS } from '@/platform/storage';
import { hasOriginAccess } from './permissions';
import { processObservation } from './alertsService';

const HOUR = 3600_000;
const FETCH_TIMEOUT_MS = 20_000;
const SAME_ORIGIN_GAP_MS = 3_000;
const MAX_CHECKS_PER_RUN = 20;
const MIN_MANUAL_GAP_MS = 60_000;

export interface CheckOutcome {
  offerId: string;
  status: CheckStatus;
  price?: number;
  currency?: string;
  changed?: boolean;
  notifications?: number;
  error?: string;
}

type Backoff = Record<string, number>;

async function originBlockedUntil(host: string): Promise<number> {
  const map = (await kv().get<Backoff>(STORAGE_KEYS.originBackoff)) ?? {};
  return map[host] ?? 0;
}

async function setOriginBackoff(host: string, until: number): Promise<void> {
  const map = (await kv().get<Backoff>(STORAGE_KEYS.originBackoff)) ?? {};
  const now = Date.now();
  for (const [k, v] of Object.entries(map)) if (v < now) delete map[k];
  map[host] = until;
  await kv().set({ [STORAGE_KEYS.originBackoff]: map });
}

/**
 * Decides whether an extracted page price can be recorded as a genuine observation.
 * Structured prices are accepted; visible-text heuristics are only accepted when the
 * offer was originally captured with the same retailer adapter and the page shows the
 * same product (identifier check).
 */
export function acceptObservedPrice(offer: RetailerOffer, result: ExtractionResult): { ok: true; price: number; currency: string } | { ok: false; reason: CheckStatus; error?: string } {
  const { price, currency } = result.offer;
  if (price === null || !currency) return { ok: false, reason: 'no_price' };
  if (result.offer.priceIsFrom) return { ok: false, reason: 'no_price', error: 'Only a “from” price is shown' };
  const heuristic = result.heuristicFields.includes('price');
  if (heuristic && !(offer.extractionMethods.includes('retailer_adapter') && result.methods.includes('retailer_adapter'))) return { ok: false, reason: 'no_price', error: 'Price found only in page text' };
  const a = normaliseGtin(offer.identifiers.gtin);
  const b = normaliseGtin(result.product.identifiers.gtin);
  if (a && b && a !== b) return { ok: false, reason: 'no_price', error: 'The page now shows a different product' };
  return { ok: true, price, currency };
}

async function fetchPage(url: string, fetchImpl: typeof fetch): Promise<{ status: number; text: string; finalUrl: string; contentType: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      // No cookies: WishSnag never acts as the logged-in user or reads account data.
      credentials: 'omit',
      redirect: 'follow',
      cache: 'no-store',
      headers: { Accept: 'text/html,application/xhtml+xml' },
      signal: controller.signal,
    });
    const contentType = res.headers.get('content-type') ?? '';
    const text = /html|xml/.test(contentType) || !contentType ? (await res.text()).slice(0, 3_000_000) : '';
    return { status: res.status, text, finalUrl: res.url || url, contentType };
  } finally {
    clearTimeout(timer);
  }
}

/** Checks one offer's listing for its current price using its published structured data. */
export async function checkOffer(offerId: string, source: Extract<ObservationSource, 'background_check' | 'manual_refresh'>, deps: { fetchImpl?: typeof fetch; now?: number } = {}): Promise<CheckOutcome> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now();
  const settings = await loadSettings();
  const offer = await db().offers.get(offerId);
  if (!offer) return { offerId, status: 'not_html', error: 'Offer not found' };
  const interval = settings.monitoring.intervalHours * HOUR;
  const fail = async (status: CheckStatus, error: string | undefined, retryAfter: number, countFailure = true): Promise<CheckOutcome> => {
    const failures = countFailure ? offer.check.failures + 1 : offer.check.failures;
    await updateOffer(offerId, { check: { ...offer.check, lastStatus: status, lastError: error, lastCheckedAt: now, failures, nextCheckAt: offer.check.enabled ? now + retryAfter : null } });
    return { offerId, status, error };
  };

  if (!offer.url) return fail('not_html', 'No product link', interval, false);
  if (!(await hasOriginAccess(offer.url))) return fail('needs_permission', undefined, interval, false);
  const host = hostnameOf(offer.url);
  const blockedUntil = await originBlockedUntil(host);
  if (blockedUntil > now && source === 'background_check') return fail('rate_limited', undefined, Math.max(blockedUntil - now, HOUR), false);
  if (source === 'manual_refresh' && offer.check.lastCheckedAt && now - offer.check.lastCheckedAt < MIN_MANUAL_GAP_MS) return { offerId, status: 'rate_limited' };

  let page: Awaited<ReturnType<typeof fetchPage>>;
  try {
    page = await fetchPage(offer.url, fetchImpl);
  } catch (err) {
    const backoff = Math.min(interval * 2 ** offer.check.failures, 7 * 24 * HOUR);
    return fail('network_error', err instanceof Error ? err.message : String(err), backoff);
  }
  if (looksLikeBotChallenge(page.text, page.status)) {
    // Respect the store's protection: back off this origin for at least a day; never retry aggressively.
    await setOriginBackoff(host, now + 24 * HOUR);
    return fail('blocked', `HTTP ${page.status}`, Math.max(24 * HOUR, interval * 2 ** offer.check.failures));
  }
  if (page.status >= 400) return fail('http_error', `HTTP ${page.status}`, Math.min(interval * 2 ** offer.check.failures, 7 * 24 * HOUR));
  if (!page.text) return fail('not_html', page.contentType, interval * 4);

  const result = extractProduct(collectFromHtml(page.text, page.finalUrl));
  const accepted = acceptObservedPrice(offer, result);
  if (!accepted.ok) return fail(accepted.reason, accepted.error, interval * 2);

  const rec = await recordObservation(offerId, { price: accepted.price, currency: accepted.currency, availability: result.offer.availability, source, observedAt: now });
  const quotes = result.offer.shippingQuotes.length ? [...rec.offer.shippingQuotes.filter((q) => q.source !== 'page'), ...result.offer.shippingQuotes.map((q) => ({ ...q, recordedAt: now }))] : rec.offer.shippingQuotes;
  await updateOffer(offerId, {
    shippingQuotes: quotes,
    listPrice: result.offer.listPrice,
    check: { ...rec.offer.check, lastStatus: 'ok', lastError: undefined, lastCheckedAt: now, failures: 0, nextCheckAt: rec.offer.check.enabled ? now + interval : null },
  });
  const notes = await processObservation(rec, now);
  return { offerId, status: 'ok', price: accepted.price, currency: accepted.currency, changed: rec.changed, notifications: notes.length };
}

export interface RunSummary {
  checked: number;
  updated: number;
  failed: number;
  skipped: number;
  outcomes: CheckOutcome[];
}

/** Runs due background checks: gentle pacing, per-origin spacing, bounded per run. */
export async function runScheduledChecks(deps: { fetchImpl?: typeof fetch; now?: number; force?: boolean; sleep?: (ms: number) => Promise<void> } = {}): Promise<RunSummary> {
  const now = deps.now ?? Date.now();
  const settings = await loadSettings();
  const summary: RunSummary = { checked: 0, updated: 0, failed: 0, skipped: 0, outcomes: [] };
  if (!settings.monitoring.enabled && !deps.force) return summary;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return summary;
  const due = await db().offers.where('check.nextCheckAt').belowOrEqual(deps.force ? Number.MAX_SAFE_INTEGER : now).toArray();
  const items = new Map((await db().items.bulkGet([...new Set(due.map((o) => o.itemId))])).filter((i) => !!i).map((i) => [i!.id, i!]));
  const candidates = due
    .filter((o) => o.check.enabled && o.url)
    .filter((o) => {
      const it = items.get(o.itemId);
      return it && !it.archived && it.status !== 'purchased';
    })
    .sort((a, b) => (a.check.nextCheckAt ?? 0) - (b.check.nextCheckAt ?? 0))
    .slice(0, MAX_CHECKS_PER_RUN);
  const lastByHost = new Map<string, number>();
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  for (const offer of candidates) {
    const host = hostnameOf(offer.url);
    const last = lastByHost.get(host);
    if (last !== undefined) await sleep(Math.max(0, SAME_ORIGIN_GAP_MS - (Date.now() - last)));
    const outcome = await checkOffer(offer.id, 'background_check', { fetchImpl: deps.fetchImpl, now: deps.now });
    lastByHost.set(host, Date.now());
    summary.outcomes.push(outcome);
    if (outcome.status === 'ok') {
      summary.checked++;
      if (outcome.changed) summary.updated++;
    } else if (outcome.status === 'needs_permission' || outcome.status === 'rate_limited') summary.skipped++;
    else {
      summary.checked++;
      summary.failed++;
    }
  }
  await kv().set({ [STORAGE_KEYS.monitorStatus]: { lastRunAt: now, ...summary, outcomes: undefined } });
  return summary;
}
