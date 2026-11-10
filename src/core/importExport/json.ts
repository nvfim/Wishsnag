import { z } from 'zod';
import type { Collection, PriceAlert, PriceObservation, RetailerOffer, Settings, WishlistItem } from '../types';
import { cleanOptional, cleanText } from '../util/text';
import { normaliseProductUrl, safeUrl } from '../util/url';
import { isCurrencyCode } from '../pricing/currency';

export const EXPORT_FORMAT = 'wishsnag-export';
export const EXPORT_VERSION = 1;

export interface ExportBundle {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  app: { name: 'WishSnag'; version: string };
  settings?: Partial<Settings>;
  items: WishlistItem[];
  offers: RetailerOffer[];
  observations: PriceObservation[];
  collections: Collection[];
  alerts: PriceAlert[];
}

const id = z.string().min(1).max(80).regex(/^[\w-]+$/);
const ts = z.number().int().min(0).max(4102444800000);
const text = (max: number) => z.string().transform((s) => cleanText(s, max));
const optText = (max: number) => z.string().optional().transform((s) => cleanOptional(s, max));
const url = z.string().transform((s) => safeUrl(s) ?? '');
const optUrl = z.string().optional().transform((s) => (s ? safeUrl(s) : undefined));
const currency = z.string().refine((c) => isCurrencyCode(c), 'Unknown currency');
const price = z.number().min(0).max(1e11);
const availability = z.enum(['in_stock', 'out_of_stock', 'preorder', 'backorder', 'limited', 'discontinued', 'unknown']);
const condition = z.enum(['new', 'used', 'refurbished', 'damaged', 'unknown']);
const identifiers = z.object({ gtin: optText(14), mpn: optText(60), sku: optText(60), asin: optText(12), isbn: optText(20) }).prefault({});
const variant = z.object({ colour: optText(40), size: optText(40), storage: optText(20), memory: optText(20), generation: optText(30), regionalModel: optText(40), edition: optText(60) }).prefault({});

const itemSchema = z.object({
  id,
  title: text(300),
  brand: optText(80),
  model: optText(80),
  category: optText(60),
  description: optText(500),
  imageUrl: optUrl,
  identifiers,
  variant,
  condition: condition.default('unknown'),
  primaryOfferId: id.nullable(),
  collectionIds: z.array(id).max(50).default([]),
  tags: z.array(text(30)).max(20).default([]),
  notes: text(2000).default(''),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  status: z.enum(['wanted', 'purchased']).default('wanted'),
  archived: z.boolean().default(false),
  targetPrice: price.nullable().default(null),
  targetCurrency: currency.nullable().default(null),
  inBudgetPlan: z.boolean().default(false),
  createdAt: ts,
  updatedAt: ts,
  purchasedAt: ts.nullable().default(null),
});

const shippingSchema = z.object({
  destinationCountry: z.string().length(2).nullable(),
  amount: price,
  currency,
  source: z.enum(['page', 'user', 'provider']),
  note: optText(120),
  recordedAt: ts,
});

const offerSchema = z.object({
  id,
  itemId: id,
  retailerId: z.string().max(60).nullable(),
  retailerName: text(80),
  retailerDomain: text(120),
  retailerCountry: z.string().length(2).nullable(),
  url,
  urlKey: z.string().max(4000).optional(),
  title: text(300),
  imageUrl: optUrl,
  price: price.nullable(),
  currency: currency.nullable(),
  listPrice: price.nullable().default(null),
  shippingQuotes: z.array(shippingSchema).max(20).default([]),
  taxIncluded: z.boolean().nullable().default(null),
  availability: availability.default('unknown'),
  condition: condition.default('unknown'),
  brand: optText(80),
  model: optText(80),
  identifiers,
  variant,
  matchConfidence: z.enum(['source', 'verified_exact', 'high', 'possible', 'different_variant']),
  matchReasons: z.array(z.string().max(40)).max(20).default([]),
  source: z.enum(['saved_page', 'linked_page', 'manual', 'import', 'cloud_provider']),
  providerId: optText(40),
  extractionMethods: z.array(z.enum(['json_ld', 'microdata', 'open_graph', 'retailer_adapter', 'visible_page', 'manual'])).default([]),
  lastVerifiedAt: ts.nullable(),
  seller: optText(80),
  paymentMethods: z.array(text(40)).max(10).optional(),
  deliveryEstimate: optText(120),
  returnPolicy: optText(200),
  warranty: optText(200),
  check: z
    .object({
      enabled: z.boolean(),
      nextCheckAt: ts.nullable(),
      failures: z.number().int().min(0).max(100),
      lastStatus: z.enum(['ok', 'no_price', 'blocked', 'http_error', 'network_error', 'needs_permission', 'not_html', 'rate_limited']).nullable(),
      lastCheckedAt: ts.nullable(),
      lastError: optText(200),
    })
    .prefault({ enabled: false, nextCheckAt: null, failures: 0, lastStatus: null, lastCheckedAt: null }),
  history: z.unknown().optional().transform(() => null),
  createdAt: ts,
  updatedAt: ts,
});

const observationSchema = z.object({
  id,
  offerId: id,
  itemId: id,
  price,
  currency,
  availability: availability.default('unknown'),
  source: z.enum(['save', 'page_visit', 'background_check', 'manual_refresh', 'manual_entry', 'import', 'cloud_monitor', 'provider']),
  observedAt: ts,
});

const collectionSchema = z.object({
  id,
  name: text(60).pipe(z.string().min(1)),
  description: text(300).default(''),
  emoji: text(8).default('✨'),
  color: z.enum(['lilac', 'pink', 'mint', 'amber', 'sky', 'slate']).default('lilac'),
  budget: price.nullable().default(null),
  budgetCurrency: currency.nullable().default(null),
  sortOrder: z.number().default(0),
  createdAt: ts,
  updatedAt: ts,
});

const alertSchema = z.object({
  id,
  itemId: id,
  type: z.enum(['below_target', 'percent_drop', 'amount_drop', 'lowest_in_period', 'cheaper_offer', 'back_in_stock']),
  threshold: z.number().min(0).nullable(),
  periodDays: z.number().int().min(1).max(3650).nullable(),
  enabled: z.boolean(),
  lastTriggeredAt: ts.nullable(),
  lastTriggeredPrice: price.nullable(),
  armed: z.boolean().default(true),
  createdAt: ts,
  updatedAt: ts,
});

const bundleSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.number().int().min(1).max(EXPORT_VERSION),
  exportedAt: z.string(),
  items: z.array(itemSchema).max(20000),
  offers: z.array(offerSchema).max(100000),
  observations: z.array(observationSchema).max(1_000_000),
  collections: z.array(collectionSchema).max(1000),
  alerts: z.array(alertSchema).max(100000).default([]),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export interface ParsedBundle {
  items: WishlistItem[];
  offers: RetailerOffer[];
  observations: PriceObservation[];
  collections: Collection[];
  alerts: PriceAlert[];
  settings?: Record<string, unknown>;
}

/** Validates and sanitises a WishSnag JSON backup. Orphaned records are dropped. */
export function parseExportBundle(json: unknown): ParsedBundle {
  const parsed = bundleSchema.parse(json);
  const itemIds = new Set(parsed.items.map((i) => i.id));
  const offers = parsed.offers
    .filter((o) => itemIds.has(o.itemId))
    .map((o) => ({ ...o, urlKey: o.url ? normaliseProductUrl(o.url) : '' }) as RetailerOffer);
  const offerIds = new Set(offers.map((o) => o.id));
  const collectionIds = new Set(parsed.collections.map((c) => c.id));
  return {
    items: parsed.items.map((i) => ({ ...i, collectionIds: i.collectionIds.filter((c) => collectionIds.has(c)), primaryOfferId: i.primaryOfferId && offerIds.has(i.primaryOfferId) ? i.primaryOfferId : null }) as WishlistItem),
    offers,
    observations: parsed.observations.filter((o) => offerIds.has(o.offerId) && itemIds.has(o.itemId)) as PriceObservation[],
    collections: parsed.collections as Collection[],
    alerts: parsed.alerts.filter((a) => itemIds.has(a.itemId)) as PriceAlert[],
    settings: parsed.settings,
  };
}

export function buildExportBundle(data: Omit<ExportBundle, 'format' | 'version' | 'exportedAt' | 'app'>, appVersion: string, now = new Date()): ExportBundle {
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: now.toISOString(), app: { name: 'WishSnag', version: appVersion }, ...data };
}
