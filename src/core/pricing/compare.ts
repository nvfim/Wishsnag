import type { ComparisonMode, CountryCode, CurrencyCode, RetailerOffer, WishlistItem } from '../types';
import { getRetailer } from '../retailers/registry';
import type { RetailerDefinition } from '../retailers/types';
import { isRankableConfidence } from '../matching/match';
import { convert, type FxSnapshot } from './exchangeRates';
import { roundMoney, subtractMoney } from './money';
import { computeTotalCost, type CostBreakdown } from './totalCost';

export type EntryGroup = 'ranked' | 'incomplete' | 'stale' | 'possible' | 'variant' | 'ineligible' | 'unpriced';

export interface MoneyValue {
  amount: number;
  currency: CurrencyCode;
  approximate: boolean;
}

export interface ComparisonEntry {
  offer: RetailerOffer;
  retailer?: RetailerDefinition;
  cost: CostBreakdown | null;
  /** Known total converted into the comparison currency (null if no rate). */
  comparable: MoneyValue | null;
  /** Listing price converted into the user's display currency. */
  display: MoneyValue | null;
  group: EntryGroup;
  stale: boolean;
  isOriginal: boolean;
  rank: number | null;
}

export interface ComparisonResult {
  mode: ComparisonMode;
  generatedAt: number;
  comparisonCurrency: CurrencyCode;
  usesConversion: boolean;
  fxDate: string | null;
  entries: ComparisonEntry[];
  ranked: ComparisonEntry[];
  cheapest: ComparisonEntry | null;
  nextCheapest: ComparisonEntry | null;
  original: ComparisonEntry | null;
  /** Positive = cheapest is cheaper than your saved offer. */
  savingsVsOriginal: (MoneyValue & { basis: 'total' | 'listing' }) | null;
  diffToNext: MoneyValue | null;
  verifiedCount: number;
  hiddenByMode: number;
  headline: 'lowest_verified' | 'only_one_verified' | 'none_verified' | 'no_offers';
}

export interface ComparisonInput {
  item: Pick<WishlistItem, 'primaryOfferId'>;
  offers: readonly RetailerOffer[];
  mode: ComparisonMode;
  shoppingCountry: CountryCode;
  deliveryCountry: CountryCode;
  displayCurrency: CurrencyCode;
  fx: FxSnapshot | null;
  now: number;
  staleAfterMs: number;
}

export function inMode(offer: RetailerOffer, mode: ComparisonMode, shoppingCountry: CountryCode, retailer?: RetailerDefinition): boolean {
  if (mode === 'all') return true;
  const country = offer.retailerCountry ?? retailer?.country ?? null;
  const local = country === shoppingCountry;
  return mode === 'local' ? local : !local;
}

/**
 * Builds a transparent comparison. Only offers that are (a) an exact or high-confidence
 * match, (b) deliverable to the delivery country, (c) recently verified and (d) have a
 * complete total can be ranked as "lowest verified". Everything else is shown separately
 * with the reason it was not ranked.
 */
export function compareOffers(input: ComparisonInput): ComparisonResult {
  const { offers, mode, shoppingCountry, deliveryCountry, displayCurrency, fx, now, staleAfterMs } = input;
  let hiddenByMode = 0;
  const prepared: ComparisonEntry[] = [];

  for (const offer of offers) {
    const retailer = getRetailer(offer.retailerId);
    const isOriginal = offer.id === input.item.primaryOfferId;
    if (!inMode(offer, mode, shoppingCountry, retailer)) {
      hiddenByMode++;
      if (!isOriginal) continue;
    }
    const cost = computeTotalCost(offer, deliveryCountry, retailer);
    const stale = offer.lastVerifiedAt === null || now - offer.lastVerifiedAt > staleAfterMs;
    let group: EntryGroup;
    if (offer.matchConfidence === 'possible') group = 'possible';
    else if (offer.matchConfidence === 'different_variant') group = 'variant';
    else if (!cost) group = 'unpriced';
    else if (cost.eligibility === 'ineligible') group = 'ineligible';
    else if (stale) group = 'stale';
    else if (cost.complete && isRankableConfidence(offer.matchConfidence) && (cost.eligibility === 'domestic' || cost.eligibility === 'international')) group = 'ranked';
    else group = 'incomplete';
    const display = offer.price !== null && offer.currency ? toMoney(convert(offer.price, offer.currency, displayCurrency, fx)) : null;
    prepared.push({ offer, retailer, cost, comparable: null, display, group, stale, isOriginal, rank: null });
  }

  // Original offer outside the selected mode is kept only as a reference point.
  const visible = prepared.filter((e) => e.isOriginal || inMode(e.offer, mode, shoppingCountry, e.retailer));
  const candidates = visible.filter((e) => e.group === 'ranked' && inMode(e.offer, mode, shoppingCountry, e.retailer));
  const currencies = new Set(candidates.map((e) => e.cost!.currency));
  const comparisonCurrency = currencies.size === 1 ? [...currencies][0]! : displayCurrency;

  for (const e of visible) {
    if (e.cost) e.comparable = toMoney(convert(e.cost.knownTotal, e.cost.currency, comparisonCurrency, fx));
    // A ranked offer without an exchange rate cannot be compared — demote it.
    if (e.group === 'ranked' && !e.comparable) e.group = 'incomplete';
  }

  const ranked = visible
    .filter((e) => e.group === 'ranked' && inMode(e.offer, mode, shoppingCountry, e.retailer))
    .sort((a, b) => a.comparable!.amount - b.comparable!.amount || Number(b.isOriginal) - Number(a.isOriginal) || (b.offer.lastVerifiedAt ?? 0) - (a.offer.lastVerifiedAt ?? 0));
  ranked.forEach((e, i) => (e.rank = i + 1));

  const groupOrder: EntryGroup[] = ['ranked', 'incomplete', 'stale', 'unpriced', 'possible', 'variant', 'ineligible'];
  const entries = [...visible].sort((a, b) => {
    const g = groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group);
    if (g) return g;
    if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
    return (a.comparable?.amount ?? Infinity) - (b.comparable?.amount ?? Infinity);
  });

  const cheapest = ranked[0] ?? null;
  const nextCheapest = ranked[1] ?? null;
  const original = visible.find((e) => e.isOriginal) ?? null;

  let savingsVsOriginal: ComparisonResult['savingsVsOriginal'] = null;
  if (cheapest && original && cheapest !== original) {
    if (original.group === 'ranked' && original.comparable) {
      savingsVsOriginal = { ...difference(original.comparable, cheapest.comparable!), basis: 'total' };
    } else if (original.offer.price !== null && original.offer.currency && cheapest.offer.price !== null && cheapest.offer.currency) {
      const a = toMoney(convert(original.offer.price, original.offer.currency, comparisonCurrency, fx));
      const b = toMoney(convert(cheapest.offer.price, cheapest.offer.currency, comparisonCurrency, fx));
      if (a && b) savingsVsOriginal = { ...difference(a, b), basis: 'listing' };
    }
  }
  const diffToNext = cheapest && nextCheapest ? difference(nextCheapest.comparable!, cheapest.comparable!) : null;

  const headline: ComparisonResult['headline'] = !visible.length ? 'no_offers' : ranked.length >= 2 ? 'lowest_verified' : ranked.length === 1 ? 'only_one_verified' : 'none_verified';

  return {
    mode,
    generatedAt: now,
    comparisonCurrency,
    usesConversion: ranked.some((e) => e.comparable?.approximate),
    fxDate: fx?.date ?? null,
    entries,
    ranked,
    cheapest,
    nextCheapest,
    original,
    savingsVsOriginal,
    diffToNext,
    verifiedCount: ranked.length,
    hiddenByMode,
    headline,
  };
}

function toMoney(c: ReturnType<typeof convert>): MoneyValue | null {
  return c ? { amount: c.amount, currency: c.currency, approximate: c.approximate } : null;
}

function difference(higher: MoneyValue, lower: MoneyValue): MoneyValue {
  return {
    amount: roundMoney(subtractMoney(higher.amount, lower.amount, higher.currency), higher.currency),
    currency: higher.currency,
    approximate: higher.approximate || lower.approximate,
  };
}
