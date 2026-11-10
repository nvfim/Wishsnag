import type { CurrencyCode, PriceObservation } from '../types';
import { fromMinor, toMinor } from '../pricing/money';

export type HistoryRange = '7d' | '30d' | '90d' | '6m' | '1y' | 'all';
export const HISTORY_RANGES: readonly HistoryRange[] = ['7d', '30d', '90d', '6m', '1y', 'all'];
const DAY = 24 * 3600_000;

export function rangeStart(range: HistoryRange, now: number): number {
  switch (range) {
    case '7d':
      return now - 7 * DAY;
    case '30d':
      return now - 30 * DAY;
    case '90d':
      return now - 90 * DAY;
    case '6m':
      return now - 182 * DAY;
    case '1y':
      return now - 365 * DAY;
    default:
      return -Infinity;
  }
}

export function filterRange(observations: readonly PriceObservation[], range: HistoryRange, now: number): PriceObservation[] {
  const start = rangeStart(range, now);
  return observations.filter((o) => o.observedAt >= start).sort((a, b) => a.observedAt - b.observedAt);
}

export interface HistoryStats {
  currency: CurrencyCode;
  count: number;
  first: PriceObservation;
  latest: PriceObservation;
  lowest: PriceObservation;
  highest: PriceObservation;
  /** Mean of observed prices (each observation weighted equally). */
  average: number;
  /** Number of times the observed price changed. */
  changes: number;
  decreases: number;
  increases: number;
  lastChangeAt: number | null;
  spanDays: number;
}

/** Statistics over observations of a single currency (the latest observation's currency). */
export function computeStats(observations: readonly PriceObservation[]): HistoryStats | null {
  if (!observations.length) return null;
  const sorted = [...observations].sort((a, b) => a.observedAt - b.observedAt);
  const currency = sorted[sorted.length - 1]!.currency;
  const obs = sorted.filter((o) => o.currency === currency);
  const first = obs[0]!;
  const latest = obs[obs.length - 1]!;
  let lowest = first;
  let highest = first;
  let sumMinor = 0;
  let changes = 0;
  let decreases = 0;
  let increases = 0;
  let lastChangeAt: number | null = null;
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i]!;
    if (o.price < lowest.price || (o.price === lowest.price && o.observedAt > lowest.observedAt)) lowest = o;
    if (o.price > highest.price) highest = o;
    sumMinor += toMinor(o.price, currency);
    const prev = obs[i - 1];
    if (prev && prev.price !== o.price) {
      changes++;
      lastChangeAt = o.observedAt;
      if (o.price < prev.price) decreases++;
      else increases++;
    }
  }
  return {
    currency,
    count: obs.length,
    first,
    latest,
    lowest,
    highest,
    average: fromMinor(Math.round(sumMinor / obs.length), currency),
    changes,
    decreases,
    increases,
    lastChangeAt,
    spanDays: (latest.observedAt - first.observedAt) / DAY,
  };
}

/** Collapses consecutive identical prices for change tables, keeping the first and the latest of each run. */
export function priceChanges(observations: readonly PriceObservation[]): { from: number | null; to: number; at: number; currency: CurrencyCode }[] {
  const sorted = [...observations].sort((a, b) => a.observedAt - b.observedAt);
  const out: { from: number | null; to: number; at: number; currency: CurrencyCode }[] = [];
  let prev: PriceObservation | undefined;
  for (const o of sorted) {
    if (!prev || prev.price !== o.price || prev.currency !== o.currency) out.push({ from: prev && prev.currency === o.currency ? prev.price : null, to: o.price, at: o.observedAt, currency: o.currency });
    prev = o;
  }
  return out.reverse();
}

export type InsightKey = 'near_90_day_low' | 'below_30_day_average' | 'decreased_recently' | 'lowest_observed' | 'above_30_day_average';

export interface Insight {
  key: InsightKey;
  params: Record<string, number | string>;
}

/**
 * Observational insights grounded in recorded history. Each requires enough data:
 * no insight is produced from fewer than 3 observations, and nothing predicts the future.
 */
export function historyInsights(observations: readonly PriceObservation[], now: number): Insight[] {
  const stats = computeStats(observations);
  if (!stats || stats.count < 3) return [];
  const out: Insight[] = [];
  const cur = stats.currency;
  const latest = stats.latest;
  const within = (days: number) => observations.filter((o) => o.currency === cur && o.observedAt >= now - days * DAY);

  const last90 = within(90);
  const span90 = last90.length ? (latest.observedAt - Math.min(...last90.map((o) => o.observedAt))) / DAY : 0;
  if (last90.length >= 3 && span90 >= 14) {
    const min90 = Math.min(...last90.map((o) => o.price));
    const max90 = Math.max(...last90.map((o) => o.price));
    if (max90 > min90 && latest.price <= min90 * 1.02) out.push({ key: 'near_90_day_low', params: { days: 90 } });
  }
  const last30 = within(30);
  if (last30.length >= 3) {
    const avg30 = last30.reduce((s, o) => s + o.price, 0) / last30.length;
    if (latest.price < avg30 * 0.99) out.push({ key: 'below_30_day_average', params: { days: 30 } });
    else if (latest.price > avg30 * 1.01) out.push({ key: 'above_30_day_average', params: { days: 30 } });
    const s30 = computeStats(last30);
    if (s30 && s30.decreases >= 2) out.push({ key: 'decreased_recently', params: { count: s30.decreases, days: 30 } });
  }
  if (stats.changes > 0 && latest.price === stats.lowest.price && stats.highest.price > stats.lowest.price && !out.some((i) => i.key === 'near_90_day_low')) {
    out.push({ key: 'lowest_observed', params: {} });
  }
  return out;
}
