import type { ComparisonMode, CurrencyCode, RetailerOffer, Settings, WishlistItem } from './types';
import { compareOffers, type ComparisonResult } from './pricing/compare';
import { convert, type FxSnapshot } from './pricing/exchangeRates';
import { percentChange, subtractMoney } from './pricing/money';
import { searchableText } from './matching/normalize';

export interface ItemSummary {
  item: WishlistItem;
  primary: RetailerOffer | undefined;
  offers: RetailerOffer[];
  latest: { price: number; currency: CurrencyCode } | null;
  /** First observed price of the saved offer (in the latest currency). */
  saved: { price: number; currency: CurrencyCode } | null;
  /** Change from saved → latest (negative = cheaper). */
  change: { amount: number; percent: number; currency: CurrencyCode } | null;
  /** Drop from the highest observed price (verified by WishSnag's own observations). */
  discountPercent: number;
  /** Change between the last two observations. */
  lastChange: { amount: number; percent: number; at: number | null } | null;
  lowest: number | null;
  targetReached: boolean;
  inStock: boolean | null;
  stale: boolean;
  tracking: boolean;
  /** Savings from a verified, complete, same-currency comparison (or approximate if converted). */
  potentialSavings: { amount: number; currency: CurrencyCode; approximate: boolean } | null;
  /** Latest price converted into the display currency (approximate when converted). */
  display: { amount: number; currency: CurrencyCode; approximate: boolean } | null;
  searchText: string;
}

export interface SummaryContext {
  settings: Pick<Settings, 'shoppingCountry' | 'deliveryCountry' | 'displayCurrency' | 'comparison' | 'monitoring'>;
  fx: FxSnapshot | null;
  now: number;
}

export function compareForItem(item: WishlistItem, offers: RetailerOffer[], ctx: SummaryContext, mode: ComparisonMode = ctx.settings.comparison.defaultMode): ComparisonResult {
  return compareOffers({
    item,
    offers,
    mode,
    shoppingCountry: ctx.settings.shoppingCountry,
    deliveryCountry: ctx.settings.deliveryCountry,
    displayCurrency: ctx.settings.displayCurrency,
    fx: ctx.fx,
    now: ctx.now,
    staleAfterMs: ctx.settings.comparison.staleAfterHours * 3600_000,
  });
}

export function summarise(item: WishlistItem, offers: RetailerOffer[], ctx: SummaryContext): ItemSummary {
  const primary = offers.find((o) => o.id === item.primaryOfferId) ?? offers[0];
  const latest = primary && primary.price !== null && primary.currency ? { price: primary.price, currency: primary.currency } : null;
  const h = primary?.history;
  const saved = h && latest && h.currency === latest.currency ? { price: h.firstPrice, currency: h.currency } : null;
  const change = saved && latest ? { amount: subtractMoney(latest.price, saved.price, latest.currency), percent: percentChange(saved.price, latest.price), currency: latest.currency } : null;
  const discountPercent = h && latest && h.currency === latest.currency && h.maxPrice > latest.price ? -percentChange(h.maxPrice, latest.price) : 0;
  const lastChange = h && latest && h.previousPrice !== null && h.currency === latest.currency ? { amount: subtractMoney(latest.price, h.previousPrice, latest.currency), percent: percentChange(h.previousPrice, latest.price), at: h.lastChangeAt } : null;
  const targetReached = item.targetPrice !== null && latest !== null && (item.targetCurrency ?? latest.currency) === latest.currency && latest.price <= item.targetPrice;
  const inStock = primary ? (primary.availability === 'unknown' ? null : primary.availability === 'in_stock' || primary.availability === 'limited') : null;
  const staleMs = ctx.settings.comparison.staleAfterHours * 3600_000;
  const stale = !!primary && (primary.lastVerifiedAt === null || ctx.now - primary.lastVerifiedAt > staleMs);
  const tracking = offers.some((o) => o.check.enabled) && ctx.settings.monitoring.enabled;

  let potentialSavings: ItemSummary['potentialSavings'] = null;
  if (offers.length > 1) {
    const cmp = compareForItem(item, offers, ctx, 'all');
    if (cmp.savingsVsOriginal && cmp.savingsVsOriginal.basis === 'total' && cmp.savingsVsOriginal.amount > 0) {
      potentialSavings = { amount: cmp.savingsVsOriginal.amount, currency: cmp.savingsVsOriginal.currency, approximate: cmp.savingsVsOriginal.approximate };
    }
  }
  const conv = latest ? convert(latest.price, latest.currency, ctx.settings.displayCurrency, ctx.fx) : null;
  return {
    item,
    primary,
    offers,
    latest,
    saved,
    change,
    discountPercent,
    lastChange,
    lowest: h && latest && h.currency === latest.currency ? h.minPrice : null,
    targetReached,
    inStock,
    stale,
    tracking,
    potentialSavings,
    display: conv ? { amount: conv.amount, currency: conv.currency, approximate: conv.approximate } : null,
    searchText: searchableText([item.title, item.brand, item.model, item.category, primary?.retailerName, ...item.tags, item.notes]),
  };
}

export type SortKey = 'recent' | 'price_low' | 'price_high' | 'discount' | 'drop' | 'priority' | 'savings' | 'name';

export interface WishlistFilters {
  query: string;
  category: string | null;
  brand: string | null;
  retailer: string | null;
  priority: WishlistItem['priority'] | null;
  collectionId: string | null;
  targetReached: boolean;
  inStock: boolean;
  hasDrop: boolean;
  status: 'active' | 'purchased' | 'archived' | 'all';
}

export const EMPTY_FILTERS: WishlistFilters = { query: '', category: null, brand: null, retailer: null, priority: null, collectionId: null, targetReached: false, inStock: false, hasDrop: false, status: 'active' };

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

export function filterAndSort(summaries: ItemSummary[], filters: WishlistFilters, sort: SortKey): ItemSummary[] {
  const terms = searchableText([filters.query]).split(' ').filter(Boolean);
  const filtered = summaries.filter((s) => {
    const it = s.item;
    if (filters.status === 'active' && (it.archived || it.status === 'purchased')) return false;
    if (filters.status === 'purchased' && it.status !== 'purchased') return false;
    if (filters.status === 'archived' && !it.archived) return false;
    if (filters.category && it.category !== filters.category) return false;
    if (filters.brand && (it.brand ?? '').toLowerCase() !== filters.brand.toLowerCase()) return false;
    if (filters.retailer && s.primary?.retailerName !== filters.retailer) return false;
    if (filters.priority && it.priority !== filters.priority) return false;
    if (filters.collectionId && !it.collectionIds.includes(filters.collectionId)) return false;
    if (filters.targetReached && !s.targetReached) return false;
    if (filters.inStock && s.inStock !== true) return false;
    if (filters.hasDrop && !(s.change && s.change.amount < 0)) return false;
    if (terms.length && !terms.every((t) => s.searchText.includes(t))) return false;
    return true;
  });
  const displayPrice = (s: ItemSummary) => s.display?.amount ?? null;
  const cmpNullLast = (a: number | null, b: number | null, dir: 1 | -1) => (a === null && b === null ? 0 : a === null ? 1 : b === null ? -1 : (a - b) * dir);
  return filtered.sort((a, b) => {
    switch (sort) {
      case 'price_low':
        return cmpNullLast(displayPrice(a), displayPrice(b), 1);
      case 'price_high':
        return cmpNullLast(displayPrice(a), displayPrice(b), -1);
      case 'discount':
        return b.discountPercent - a.discountPercent;
      case 'drop':
        return (a.change?.percent ?? 0) - (b.change?.percent ?? 0);
      case 'priority':
        return PRIORITY_RANK[a.item.priority] - PRIORITY_RANK[b.item.priority] || b.item.createdAt - a.item.createdAt;
      case 'savings':
        return (b.potentialSavings?.amount ?? 0) - (a.potentialSavings?.amount ?? 0);
      case 'name':
        return a.item.title.localeCompare(b.item.title);
      default:
        return b.item.createdAt - a.item.createdAt;
    }
  });
}

export interface DashboardStats {
  saved: number;
  tracked: number;
  drops: number;
  targetsReached: number;
  /** Sum of verified potential savings in display currency, plus a count of items that couldn't be converted. */
  savings: { amount: number; currency: CurrencyCode; approximate: boolean; excluded: number };
}

export function dashboardStats(summaries: ItemSummary[], displayCurrency: CurrencyCode, fx: FxSnapshot | null): DashboardStats {
  const active = summaries.filter((s) => !s.item.archived && s.item.status !== 'purchased');
  let total = 0;
  let approximate = false;
  let excluded = 0;
  for (const s of active) {
    if (!s.potentialSavings) continue;
    const c = convert(s.potentialSavings.amount, s.potentialSavings.currency, displayCurrency, fx);
    if (!c) {
      excluded++;
      continue;
    }
    total += c.amount;
    approximate ||= c.approximate || s.potentialSavings.approximate;
  }
  return {
    saved: active.length,
    tracked: active.filter((s) => s.tracking).length,
    drops: active.filter((s) => s.change && s.change.amount < 0).length,
    targetsReached: active.filter((s) => s.targetReached).length,
    savings: { amount: Math.round(total * 100) / 100, currency: displayCurrency, approximate, excluded },
  };
}
