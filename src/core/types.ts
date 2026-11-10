/**
 * WishSnag core domain types.
 *
 * These types are shared by the extension UI, the background service worker, the
 * content extractor and (in mirrored form) the optional Supabase backend.
 * All prices are stored in major currency units (e.g. 299.95 AUD); arithmetic goes
 * through `core/pricing/money.ts`, which works in integer minor units.
 */

/** ISO 3166-1 alpha-2, upper case (e.g. "AU", "BD", "GB"). */
export type CountryCode = string;
/** ISO 4217 currency code, upper case (e.g. "AUD", "BDT"). */
export type CurrencyCode = string;
export type LanguageCode = 'en' | 'bn';

export type Availability =
  | 'in_stock'
  | 'out_of_stock'
  | 'preorder'
  | 'backorder'
  | 'limited'
  | 'discontinued'
  | 'unknown';

export type Condition = 'new' | 'used' | 'refurbished' | 'damaged' | 'unknown';
export type Priority = 'low' | 'medium' | 'high';
export type ItemStatus = 'wanted' | 'purchased';

/** Matching confidence between a saved product and another listing. */
export type MatchConfidence = 'verified_exact' | 'high' | 'possible' | 'different_variant';

export interface ProductIdentifiers {
  /** Normalised GTIN-14 (check digit validated). EAN-13 / UPC-A / GTIN-8 are padded. */
  gtin?: string;
  /** Manufacturer part / model number as published. */
  mpn?: string;
  /** Retailer SKU (retailer-specific; never used alone for cross-retailer matching). */
  sku?: string;
  asin?: string;
  isbn?: string;
}

export interface VariantAttributes {
  colour?: string;
  size?: string;
  /** Storage capacity, normalised e.g. "256GB", "1TB". */
  storage?: string;
  /** RAM, normalised e.g. "8GB". */
  memory?: string;
  /** e.g. "2nd gen", "2024". */
  generation?: string;
  /** Regional model code where published (e.g. "SM-S928B"). */
  regionalModel?: string;
  edition?: string;
}

export interface ProductSnapshot {
  title: string;
  brand?: string;
  model?: string;
  category?: string;
  description?: string;
  imageUrl?: string;
  identifiers: ProductIdentifiers;
  variant: VariantAttributes;
  condition: Condition;
}

export interface WishlistItem extends ProductSnapshot {
  id: string;
  /** The offer the user originally saved (the "saved offer"). */
  primaryOfferId: string | null;
  collectionIds: string[];
  tags: string[];
  notes: string;
  priority: Priority;
  status: ItemStatus;
  archived: boolean;
  targetPrice: number | null;
  targetCurrency: CurrencyCode | null;
  /** Included in the "this month" budget plan. */
  inBudgetPlan: boolean;
  createdAt: number;
  updatedAt: number;
  purchasedAt: number | null;
}

export type OfferSource = 'saved_page' | 'linked_page' | 'manual' | 'import' | 'cloud_provider';
export type ObservationSource =
  | 'save'
  | 'page_visit'
  | 'background_check'
  | 'manual_refresh'
  | 'manual_entry'
  | 'import'
  | 'cloud_monitor'
  | 'provider';

export type ExtractionMethod =
  | 'json_ld'
  | 'microdata'
  | 'open_graph'
  | 'retailer_adapter'
  | 'visible_page'
  | 'manual';

export type CheckStatus =
  | 'ok'
  | 'no_price'
  | 'blocked'
  | 'http_error'
  | 'network_error'
  | 'needs_permission'
  | 'not_html'
  | 'rate_limited';

export interface ShippingQuote {
  /** Destination this quote applies to. `null` = not stated (assumed domestic for domestic retailers only). */
  destinationCountry: CountryCode | null;
  amount: number;
  currency: CurrencyCode;
  source: 'page' | 'user' | 'provider';
  note?: string;
  recordedAt: number;
}

export interface OfferCheckState {
  enabled: boolean;
  nextCheckAt: number | null;
  failures: number;
  lastStatus: CheckStatus | null;
  lastCheckedAt: number | null;
  lastError?: string;
}

/** Denormalised summary of an offer's observations (kept in sync by the repository). */
export interface OfferHistoryStats {
  currency: CurrencyCode;
  firstPrice: number;
  firstAt: number;
  minPrice: number;
  maxPrice: number;
  /** Price of the observation before the latest one (null if only one). */
  previousPrice: number | null;
  lastChangeAt: number | null;
  count: number;
}

export interface RetailerOffer {
  id: string;
  itemId: string;
  retailerId: string | null;
  retailerName: string;
  retailerDomain: string;
  retailerCountry: CountryCode | null;
  url: string;
  /** Normalised URL used to recognise the same listing (tracking params removed). */
  urlKey: string;
  title: string;
  imageUrl?: string;
  price: number | null;
  currency: CurrencyCode | null;
  /** Strike-through / "was" price as displayed by the retailer (not used as a WishSnag observation). */
  listPrice: number | null;
  shippingQuotes: ShippingQuote[];
  /** Whether the listed price includes mandatory sales tax (GST/VAT). null = unknown. */
  taxIncluded: boolean | null;
  availability: Availability;
  condition: Condition;
  brand?: string;
  model?: string;
  identifiers: ProductIdentifiers;
  variant: VariantAttributes;
  /** 'source' = the listing the item was saved from. */
  matchConfidence: MatchConfidence | 'source';
  matchReasons: string[];
  source: OfferSource;
  providerId?: string;
  extractionMethods: ExtractionMethod[];
  /** When a price was last actually observed on the listing. */
  lastVerifiedAt: number | null;
  seller?: string;
  paymentMethods?: string[];
  deliveryEstimate?: string;
  returnPolicy?: string;
  warranty?: string;
  check: OfferCheckState;
  history: OfferHistoryStats | null;
  createdAt: number;
  updatedAt: number;
}

export interface PriceObservation {
  id: string;
  offerId: string;
  itemId: string;
  price: number;
  currency: CurrencyCode;
  availability: Availability;
  source: ObservationSource;
  observedAt: number;
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  emoji: string;
  color: CollectionColor;
  budget: number | null;
  budgetCurrency: CurrencyCode | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export type CollectionColor = 'lilac' | 'pink' | 'mint' | 'amber' | 'sky' | 'slate';

export type AlertType =
  | 'below_target'
  | 'percent_drop'
  | 'amount_drop'
  | 'lowest_in_period'
  | 'cheaper_offer'
  | 'back_in_stock';

export interface PriceAlert {
  id: string;
  itemId: string;
  type: AlertType;
  /** percent for percent_drop, amount for amount_drop (in item currency), unused otherwise. */
  threshold: number | null;
  /** lookback for lowest_in_period. */
  periodDays: number | null;
  enabled: boolean;
  lastTriggeredAt: number | null;
  /** Price at the last trigger — used to avoid re-alerting for the same or a higher price. */
  lastTriggeredPrice: number | null;
  /** Rule-specific memory (e.g. "armed" flag for crossing-based rules). */
  armed: boolean;
  createdAt: number;
  updatedAt: number;
}

export type NotificationKind = AlertType | 'system';
export type DesktopStatus = 'pending' | 'sent' | 'suppressed' | 'held' | 'disabled';

export interface AppNotification {
  id: string;
  itemId: string | null;
  offerId: string | null;
  kind: NotificationKind;
  title: string;
  message: string;
  ctaLabel: string;
  /** Deep link target (retailer URL) for the CTA button. */
  url: string | null;
  dedupeKey: string;
  createdAt: number;
  readAt: number | null;
  desktopStatus: DesktopStatus;
}

export type ThemePreference = 'system' | 'light' | 'dark';
export type ComparisonMode = 'local' | 'global' | 'all';
export type AlertFrequency = 'instant' | 'daily';

export interface DeliveryLocation {
  /** AU state / BD division / generic region. */
  region?: string;
  /** BD district. */
  district?: string;
  city?: string;
  /** Suburb / area / thana. */
  area?: string;
  postcode?: string;
  /** Delivery zone used by many Bangladeshi retailers (e.g. inside/outside Dhaka). */
  zone?: string;
}

export interface Settings {
  schemaVersion: 1;
  onboarded: boolean;
  residenceCountry: CountryCode;
  shoppingCountry: CountryCode;
  deliveryCountry: CountryCode;
  displayCurrency: CurrencyCode;
  language: LanguageCode;
  /** 'auto' → `${language}-${residenceCountry}`. */
  formatLocale: string;
  deliveryLocation: DeliveryLocation;
  theme: ThemePreference;
  alerts: {
    enabled: boolean;
    desktop: boolean;
    /** Default percentage used for new per-item percent_drop alerts. */
    defaultDropPercent: number;
    /** Ignore drops smaller than this percentage (applies to all drop alerts). */
    minDropPercent: number;
    quietHours: { enabled: boolean; start: string; end: string };
    frequency: AlertFrequency;
    /** Local hour (0-23) when the daily digest is delivered. */
    digestHour: number;
    /** Minimum hours between desktop notifications for the same item. */
    cooldownHours: number;
  };
  monitoring: {
    enabled: boolean;
    intervalHours: number;
    checkOnVisit: boolean;
  };
  comparison: {
    defaultMode: ComparisonMode;
    staleAfterHours: number;
  };
  exchangeRates: { autoRefresh: boolean };
  budget: { monthly: number | null; currency: CurrencyCode | null };
  cloud: { url: string; anonKey: string };
}

/** Result shape of the layered extractor. */
export interface ExtractedOffer {
  price: number | null;
  currency: CurrencyCode | null;
  listPrice: number | null;
  /** True when the price is a "from" price (e.g. AggregateOffer lowPrice with a range). */
  priceIsFrom: boolean;
  availability: Availability;
  condition: Condition;
  shippingQuotes: Omit<ShippingQuote, 'recordedAt'>[];
  seller?: string;
  paymentMethods?: string[];
  taxIncluded: boolean | null;
}

export interface VariantOption {
  label: string;
  url?: string;
  price?: number | null;
  currency?: CurrencyCode | null;
  availability?: Availability;
  attributes: VariantAttributes;
  gtin?: string;
  sku?: string;
}

export type FieldConfidence = 'structured' | 'heuristic';

export interface ExtractionResult {
  status: 'product' | 'partial' | 'none';
  url: string;
  canonicalUrl: string;
  product: ProductSnapshot;
  offer: ExtractedOffer;
  variants: VariantOption[];
  methods: ExtractionMethod[];
  /** Which fields came from heuristics and should be double-checked by the user. */
  heuristicFields: string[];
  /** Price strings found in visible page text (shown as suggestions, never auto-trusted). */
  priceCandidates: { amount: number; currency: CurrencyCode | null; text: string }[];
  retailer: { id: string | null; name: string; domain: string; country: CountryCode | null };
  warnings: string[];
  /** Multiple products (e.g. wishlist / list pages) found on the page. */
  listItems: ListItemCandidate[];
}

export interface ListItemCandidate {
  title: string;
  url: string;
  imageUrl?: string;
  price: number | null;
  currency: CurrencyCode | null;
  brand?: string;
  gtin?: string;
  mpn?: string;
  method: ExtractionMethod;
}
