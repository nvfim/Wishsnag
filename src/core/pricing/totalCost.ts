import type { CountryCode, CurrencyCode, RetailerOffer, ShippingQuote } from '../types';
import type { RetailerDefinition } from '../retailers/types';
import { deliveryEligibility, type DeliveryEligibility } from '../retailers/registry';
import { sumMoney } from './money';

export type CostPart = 'price' | 'shipping' | 'tax' | 'import_charges';

export interface CostBreakdown {
  currency: CurrencyCode;
  price: number;
  shipping: { status: 'known' | 'free' | 'unknown'; amount: number | null; quote?: ShippingQuote };
  /** 'included' = listed price already includes GST/VAT (never added twice). */
  tax: { status: 'included' | 'unknown' | 'not_applicable' };
  importCharges: { status: 'not_applicable' | 'unknown' };
  /** Verified discounts only (none are assumed). */
  discounts: number;
  /** Sum of the parts that are known. Equals the total only when `complete`. */
  knownTotal: number;
  complete: boolean;
  missing: CostPart[];
  eligibility: DeliveryEligibility;
}

/** Picks the most recent shipping quote that applies to the delivery country. */
export function resolveShipping(offer: RetailerOffer, deliveryCountry: CountryCode, eligibility: DeliveryEligibility): ShippingQuote | undefined {
  const sameCurrency = offer.shippingQuotes.filter((q) => q.currency === offer.currency);
  const sorted = [...sameCurrency].sort((a, b) => b.recordedAt - a.recordedAt);
  const exact = sorted.find((q) => q.destinationCountry === deliveryCountry);
  if (exact) return exact;
  // A quote without a destination is only trusted for domestic deliveries.
  if (eligibility === 'domestic') return sorted.find((q) => q.destinationCountry === null);
  return undefined;
}

/**
 * Comparable total cost of an offer delivered to `deliveryCountry`:
 *   price + applicable shipping + mandatory taxes not already included + import charges − verified discounts.
 * Unknown mandatory parts make the total incomplete; they are never guessed.
 */
export function computeTotalCost(offer: RetailerOffer, deliveryCountry: CountryCode, retailer?: RetailerDefinition): CostBreakdown | null {
  if (offer.price === null || !offer.currency) return null;
  const currency = offer.currency;
  const eligibility = deliveryEligibility(retailer, offer.retailerCountry, deliveryCountry);
  const missing: CostPart[] = [];

  const quote = resolveShipping(offer, deliveryCountry, eligibility);
  const shipping: CostBreakdown['shipping'] = quote
    ? { status: quote.amount === 0 ? 'free' : 'known', amount: quote.amount, quote }
    : { status: 'unknown', amount: null };
  if (shipping.status === 'unknown') missing.push('shipping');

  const international = eligibility === 'international' || (eligibility !== 'domestic' && (offer.retailerCountry ?? retailer?.country ?? null) !== deliveryCountry);
  let tax: CostBreakdown['tax'];
  let importCharges: CostBreakdown['importCharges'];
  if (international) {
    // Destination GST/VAT and duties are collected as import charges; origin tax treatment varies.
    tax = { status: 'not_applicable' };
    importCharges = { status: 'unknown' };
    missing.push('import_charges');
  } else {
    const included = offer.taxIncluded ?? retailer?.pricesIncludeTax ?? null;
    tax = { status: included === true ? 'included' : 'unknown' };
    if (tax.status === 'unknown') missing.push('tax');
    importCharges = { status: 'not_applicable' };
  }

  const knownTotal = sumMoney([offer.price, shipping.amount ?? 0], currency);
  return {
    currency,
    price: offer.price,
    shipping,
    tax,
    importCharges,
    discounts: 0,
    knownTotal,
    complete: missing.length === 0,
    missing,
    eligibility,
  };
}
