import type { CountryCode, CurrencyCode } from '../types';

/**
 * Truthful integration status for each capability of a retailer integration.
 * - operational: implemented and verified against the live site/API.
 * - partial: works through generic mechanisms (structured data, user-granted page checks);
 *   accuracy depends on what the retailer publishes. Manual correction is always possible.
 * - requires_credentials: implemented, but needs API credentials configured server-side.
 * - unavailable: temporarily not working (set at runtime when checks are blocked).
 * - unsupported: not available (no legitimate data access method known).
 * - planned: on the roadmap, not implemented.
 */
export type CapabilityStatus = 'operational' | 'partial' | 'requires_credentials' | 'unavailable' | 'unsupported' | 'planned';

export interface RetailerCapabilities {
  productExtraction: CapabilityStatus;
  wishlistImport: CapabilityStatus;
  productSearch: CapabilityStatus;
  offerRetrieval: CapabilityStatus;
  priceMonitoring: CapabilityStatus;
  stockMonitoring: CapabilityStatus;
  deliveryInfo: CapabilityStatus;
}

export interface RetailerDelivery {
  /** Delivers within its home country. */
  domestic: boolean;
  /** International delivery: none, unknown, worldwide, or a list of destination countries. */
  international: 'none' | 'unknown' | 'worldwide' | readonly CountryCode[];
}

export type RetailerCategory = 'marketplace' | 'electronics' | 'fashion' | 'department' | 'books' | 'home' | 'general' | 'sport' | 'beauty' | 'grocery';

export interface RetailerDefinition {
  id: string;
  name: string;
  /** Home country. null = global marketplace without a single home market. */
  country: CountryCode | null;
  currency: CurrencyCode;
  /** Host names (without www.). Subdomains match too. */
  domains: readonly string[];
  /** For regional stores on a shared domain (e.g. nike.com/au). */
  pathPrefix?: string;
  categories: readonly RetailerCategory[];
  /** Listed prices include mandatory sales tax (GST/VAT). null = unknown / varies. */
  pricesIncludeTax: boolean | null;
  delivery: RetailerDelivery;
  /** Search results page; `{q}` is replaced by the URL-encoded query. Shortcut only — not an API. */
  searchUrl?: string;
  capabilities: RetailerCapabilities;
  /** Server-side provider that can retrieve offers when credentials are configured. */
  apiProvider?: 'ebay_browse';
  /** Payment methods the retailer advertises publicly (informational; confirm at checkout). */
  reportedPaymentMethods?: readonly string[];
  launchPriority: 'launch' | 'expansion';
  notes?: string;
}
