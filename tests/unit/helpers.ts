import type { PriceObservation, RetailerOffer, WishlistItem } from '@/core/types';
import type { FxSnapshot } from '@/core/pricing/exchangeRates';

export const NOW = Date.UTC(2026, 10, 9, 3, 0, 0);
export const DAY = 24 * 3600_000;

export function makeItem(over: Partial<WishlistItem> = {}): WishlistItem {
  return {
    id: 'item1',
    title: 'Sony WH-1000XM5 Wireless Headphones Black',
    brand: 'Sony',
    identifiers: {},
    variant: {},
    condition: 'new',
    primaryOfferId: 'o1',
    collectionIds: [],
    tags: [],
    notes: '',
    priority: 'medium',
    status: 'wanted',
    archived: false,
    targetPrice: null,
    targetCurrency: null,
    inBudgetPlan: false,
    createdAt: NOW - 30 * DAY,
    updatedAt: NOW - 30 * DAY,
    purchasedAt: null,
    ...over,
  };
}

export function makeOffer(over: Partial<RetailerOffer> = {}): RetailerOffer {
  return {
    id: 'o1',
    itemId: 'item1',
    retailerId: null,
    retailerName: 'Store',
    retailerDomain: 'store.example',
    retailerCountry: 'AU',
    url: 'https://store.example/p',
    urlKey: 'https://store.example/p',
    title: 'Sony WH-1000XM5',
    price: 449,
    currency: 'AUD',
    listPrice: null,
    shippingQuotes: [],
    taxIncluded: true,
    availability: 'in_stock',
    condition: 'new',
    identifiers: {},
    variant: {},
    matchConfidence: 'source',
    matchReasons: [],
    source: 'saved_page',
    extractionMethods: ['json_ld'],
    lastVerifiedAt: NOW - 3600_000,
    check: { enabled: false, nextCheckAt: null, failures: 0, lastStatus: null, lastCheckedAt: null },
    history: null,
    createdAt: NOW - 30 * DAY,
    updatedAt: NOW,
    ...over,
  };
}

let obsCounter = 0;
export function obs(price: number, daysAgo: number, over: Partial<PriceObservation> = {}): PriceObservation {
  obsCounter++;
  return { id: `obs${String(obsCounter).padStart(4, '0')}`, offerId: 'o1', itemId: 'item1', price, currency: 'AUD', availability: 'in_stock', source: 'background_check', observedAt: NOW - daysAgo * DAY, ...over };
}

/** A fixed, clearly synthetic rate table for tests only (units per USD). */
export const TEST_FX: FxSnapshot = {
  base: 'USD',
  rates: { USD: 1, AUD: 1.5, BDT: 120, GBP: 0.8, EUR: 0.9, INR: 85 },
  date: '2026-11-08',
  fetchedAt: NOW - 3600_000,
  provider: 'test fixture',
  sourceUrl: 'test://fx',
};
