import type { CountryCode } from '../types';
import { isCountryCode } from '../geo/countries';
import { hostnameOf } from '../util/url';
import type { RetailerCapabilities, RetailerDefinition } from './types';

/**
 * Retailer registry.
 *
 * IMPORTANT — honesty rules for this file:
 * - "partial" product extraction means WishSnag's generic layered extractor
 *   (schema.org JSON-LD → microdata → Open Graph → visible page hints → manual entry)
 *   is used. It has NOT been verified against each live site in this build.
 * - No retailer below offers a public, key-less product search API that WishSnag uses.
 *   Search links are convenience shortcuts that open the retailer's own search page.
 * - eBay offer retrieval is implemented server-side (Supabase Edge Function, eBay Browse API)
 *   and needs the operator's eBay developer credentials ("requires_credentials").
 * - Delivery coverage below is conservative; "unknown" is used whenever we are not sure.
 */

const GENERIC: RetailerCapabilities = {
  productExtraction: 'partial',
  wishlistImport: 'partial',
  productSearch: 'unsupported',
  offerRetrieval: 'unsupported',
  priceMonitoring: 'partial',
  stockMonitoring: 'partial',
  deliveryInfo: 'partial',
};

const EBAY: RetailerCapabilities = { ...GENERIC, productSearch: 'requires_credentials', offerRetrieval: 'requires_credentials' };
const AMAZON: RetailerCapabilities = { ...GENERIC, productSearch: 'planned', offerRetrieval: 'planned' };

function r(def: Omit<RetailerDefinition, 'capabilities' | 'launchPriority'> & Partial<Pick<RetailerDefinition, 'capabilities' | 'launchPriority'>>): RetailerDefinition {
  return { capabilities: GENERIC, launchPriority: 'launch', ...def };
}

const AU_ONLY = { domestic: true, international: 'none' } as const;
const AU_UNKNOWN_INTL = { domestic: true, international: 'unknown' } as const;
const BD_ONLY = { domestic: true, international: 'none' } as const;
const BD_UNKNOWN_INTL = { domestic: true, international: 'unknown' } as const;

export const RETAILERS: readonly RetailerDefinition[] = [
  // ---------------------------------------------------------------- Australia
  r({ id: 'amazon-au', name: 'Amazon Australia', country: 'AU', currency: 'AUD', domains: ['amazon.com.au'], categories: ['marketplace'], pricesIncludeTax: true, delivery: AU_ONLY, searchUrl: 'https://www.amazon.com.au/s?k={q}', capabilities: AMAZON, notes: 'Offer retrieval needs Amazon Associates API access (planned, server-side only).' }),
  r({ id: 'ebay-au', name: 'eBay Australia', country: 'AU', currency: 'AUD', domains: ['ebay.com.au'], categories: ['marketplace'], pricesIncludeTax: true, delivery: AU_UNKNOWN_INTL, searchUrl: 'https://www.ebay.com.au/sch/i.html?_nkw={q}', capabilities: EBAY, apiProvider: 'ebay_browse', notes: 'Seller-dependent shipping. Live offers via eBay Browse API (EBAY_AU) when the cloud backend has credentials.' }),
  r({ id: 'jb-hifi', name: 'JB Hi-Fi', country: 'AU', currency: 'AUD', domains: ['jbhifi.com.au'], categories: ['electronics'], pricesIncludeTax: true, delivery: AU_ONLY, searchUrl: 'https://www.jbhifi.com.au/search?query={q}' }),
  r({ id: 'harvey-norman', name: 'Harvey Norman', country: 'AU', currency: 'AUD', domains: ['harveynorman.com.au'], categories: ['electronics', 'home'], pricesIncludeTax: true, delivery: AU_ONLY, searchUrl: 'https://www.harveynorman.com.au/search?q={q}' }),
  r({ id: 'the-good-guys', name: 'The Good Guys', country: 'AU', currency: 'AUD', domains: ['thegoodguys.com.au'], categories: ['electronics', 'home'], pricesIncludeTax: true, delivery: AU_ONLY, searchUrl: 'https://www.thegoodguys.com.au/SearchDisplay?searchTerm={q}' }),
  r({ id: 'officeworks', name: 'Officeworks', country: 'AU', currency: 'AUD', domains: ['officeworks.com.au'], categories: ['electronics', 'general'], pricesIncludeTax: true, delivery: AU_ONLY, searchUrl: 'https://www.officeworks.com.au/shop/officeworks/search?q={q}' }),
  r({ id: 'the-iconic', name: 'THE ICONIC', country: 'AU', currency: 'AUD', domains: ['theiconic.com.au'], categories: ['fashion', 'sport', 'beauty'], pricesIncludeTax: true, delivery: AU_UNKNOWN_INTL, searchUrl: 'https://www.theiconic.com.au/catalog/?q={q}' }),
  r({ id: 'myer', name: 'Myer', country: 'AU', currency: 'AUD', domains: ['myer.com.au'], categories: ['department', 'fashion', 'beauty', 'home'], pricesIncludeTax: true, delivery: AU_UNKNOWN_INTL, searchUrl: 'https://www.myer.com.au/search?query={q}' }),
  r({ id: 'david-jones', name: 'David Jones', country: 'AU', currency: 'AUD', domains: ['davidjones.com'], categories: ['department', 'fashion', 'beauty', 'home'], pricesIncludeTax: true, delivery: AU_UNKNOWN_INTL, searchUrl: 'https://www.davidjones.com/search?q={q}' }),
  r({ id: 'kmart-au', name: 'Kmart Australia', country: 'AU', currency: 'AUD', domains: ['kmart.com.au'], categories: ['general', 'home', 'fashion'], pricesIncludeTax: true, delivery: AU_ONLY, searchUrl: 'https://www.kmart.com.au/search/?searchTerm={q}' }),
  r({ id: 'target-au', name: 'Target Australia', country: 'AU', currency: 'AUD', domains: ['target.com.au'], categories: ['general', 'home', 'fashion'], pricesIncludeTax: true, delivery: AU_ONLY, searchUrl: 'https://www.target.com.au/search?text={q}' }),
  r({ id: 'big-w', name: 'BIG W', country: 'AU', currency: 'AUD', domains: ['bigw.com.au'], categories: ['general', 'home', 'electronics'], pricesIncludeTax: true, delivery: AU_ONLY, searchUrl: 'https://www.bigw.com.au/search?text={q}' }),
  r({ id: 'nike-au', name: 'Nike Australia', country: 'AU', currency: 'AUD', domains: ['nike.com'], pathPrefix: '/au', categories: ['sport', 'fashion'], pricesIncludeTax: true, delivery: AU_ONLY, searchUrl: 'https://www.nike.com/au/w?q={q}' }),
  r({ id: 'adidas-au', name: 'adidas Australia', country: 'AU', currency: 'AUD', domains: ['adidas.com.au'], categories: ['sport', 'fashion'], pricesIncludeTax: true, delivery: AU_ONLY, searchUrl: 'https://www.adidas.com.au/search?q={q}' }),
  r({ id: 'asos-au', name: 'ASOS (Australia)', country: 'AU', currency: 'AUD', domains: ['asos.com'], pathPrefix: '/au', categories: ['fashion', 'beauty'], pricesIncludeTax: true, delivery: AU_ONLY, searchUrl: 'https://www.asos.com/au/search/?q={q}', notes: 'ASOS is UK-based and runs regional storefronts; this entry covers the Australian storefront.' }),
  r({ id: 'uniqlo-au', name: 'UNIQLO Australia', country: 'AU', currency: 'AUD', domains: ['uniqlo.com'], pathPrefix: '/au', categories: ['fashion'], pricesIncludeTax: true, delivery: AU_ONLY, searchUrl: 'https://www.uniqlo.com/au/en/search?q={q}' }),

  // ---------------------------------------------------------------- Bangladesh
  r({ id: 'daraz-bd', name: 'Daraz Bangladesh', country: 'BD', currency: 'BDT', domains: ['daraz.com.bd'], categories: ['marketplace'], pricesIncludeTax: true, delivery: BD_ONLY, searchUrl: 'https://www.daraz.com.bd/catalog/?q={q}', reportedPaymentMethods: ['Cash on delivery', 'bKash', 'Nagad', 'Card'], notes: 'Marketplace: price, delivery fee and warranty vary by seller. A page-specific adapter adds visible-price hints (unverified selectors).' }),
  r({ id: 'pickaboo', name: 'Pickaboo', country: 'BD', currency: 'BDT', domains: ['pickaboo.com'], categories: ['electronics'], pricesIncludeTax: true, delivery: BD_ONLY, searchUrl: 'https://www.pickaboo.com/search?q={q}', reportedPaymentMethods: ['Cash on delivery', 'bKash', 'Card', 'EMI'] }),
  r({ id: 'rokomari', name: 'Rokomari', country: 'BD', currency: 'BDT', domains: ['rokomari.com'], categories: ['books', 'general'], pricesIncludeTax: true, delivery: BD_UNKNOWN_INTL, searchUrl: 'https://www.rokomari.com/search?term={q}', reportedPaymentMethods: ['Cash on delivery', 'bKash', 'Nagad', 'Card'] }),
  r({ id: 'star-tech', name: 'Star Tech', country: 'BD', currency: 'BDT', domains: ['startech.com.bd'], categories: ['electronics'], pricesIncludeTax: true, delivery: BD_ONLY, searchUrl: 'https://www.startech.com.bd/product/search?search={q}', reportedPaymentMethods: ['Cash on delivery', 'bKash', 'Card', 'EMI'], notes: 'A page-specific adapter adds visible-price hints (unverified selectors).' }),
  r({ id: 'ryans', name: 'Ryans Computers', country: 'BD', currency: 'BDT', domains: ['ryans.com'], categories: ['electronics'], pricesIncludeTax: true, delivery: BD_ONLY, searchUrl: 'https://www.ryans.com/search?q={q}' }),
  r({ id: 'gadget-and-gear', name: 'Gadget & Gear', country: 'BD', currency: 'BDT', domains: ['gadgetandgear.com'], categories: ['electronics'], pricesIncludeTax: true, delivery: BD_ONLY, searchUrl: 'https://gadgetandgear.com/search?q={q}' }),
  r({ id: 'aarong', name: 'Aarong', country: 'BD', currency: 'BDT', domains: ['aarong.com'], categories: ['fashion', 'home'], pricesIncludeTax: true, delivery: BD_UNKNOWN_INTL, searchUrl: 'https://www.aarong.com/catalogsearch/result/?q={q}' }),
  r({ id: 'othoba', name: 'Othoba', country: 'BD', currency: 'BDT', domains: ['othoba.com'], categories: ['marketplace'], pricesIncludeTax: true, delivery: BD_ONLY, launchPriority: 'expansion' }),
  r({ id: 'ajkerdeal', name: 'AjkerDeal', country: 'BD', currency: 'BDT', domains: ['ajkerdeal.com'], categories: ['marketplace'], pricesIncludeTax: true, delivery: BD_ONLY, launchPriority: 'expansion' }),
  r({ id: 'techland-bd', name: 'Techland BD', country: 'BD', currency: 'BDT', domains: ['techlandbd.com'], categories: ['electronics'], pricesIncludeTax: true, delivery: BD_ONLY, launchPriority: 'expansion' }),
  r({ id: 'apple-gadgets-bd', name: 'Apple Gadgets', country: 'BD', currency: 'BDT', domains: ['applegadgetsbd.com'], categories: ['electronics'], pricesIncludeTax: true, delivery: BD_ONLY, launchPriority: 'expansion' }),
  r({ id: 'chaldal', name: 'Chaldal', country: 'BD', currency: 'BDT', domains: ['chaldal.com'], categories: ['grocery'], pricesIncludeTax: true, delivery: BD_ONLY, launchPriority: 'expansion' }),

  // ---------------------------------------------------------------- International
  r({ id: 'amazon-us', name: 'Amazon.com', country: 'US', currency: 'USD', domains: ['amazon.com'], categories: ['marketplace'], pricesIncludeTax: false, delivery: { domestic: true, international: 'unknown' }, searchUrl: 'https://www.amazon.com/s?k={q}', capabilities: AMAZON, launchPriority: 'expansion', notes: 'International delivery and import charges depend on the item and destination.' }),
  r({ id: 'amazon-uk', name: 'Amazon UK', country: 'GB', currency: 'GBP', domains: ['amazon.co.uk'], categories: ['marketplace'], pricesIncludeTax: true, delivery: { domestic: true, international: 'unknown' }, searchUrl: 'https://www.amazon.co.uk/s?k={q}', capabilities: AMAZON, launchPriority: 'expansion' }),
  r({ id: 'amazon-in', name: 'Amazon India', country: 'IN', currency: 'INR', domains: ['amazon.in'], categories: ['marketplace'], pricesIncludeTax: true, delivery: { domestic: true, international: 'none' }, searchUrl: 'https://www.amazon.in/s?k={q}', capabilities: AMAZON, launchPriority: 'expansion' }),
  r({ id: 'amazon-ca', name: 'Amazon Canada', country: 'CA', currency: 'CAD', domains: ['amazon.ca'], categories: ['marketplace'], pricesIncludeTax: false, delivery: { domestic: true, international: 'unknown' }, searchUrl: 'https://www.amazon.ca/s?k={q}', capabilities: AMAZON, launchPriority: 'expansion' }),
  r({ id: 'amazon-de', name: 'Amazon Germany', country: 'DE', currency: 'EUR', domains: ['amazon.de'], categories: ['marketplace'], pricesIncludeTax: true, delivery: { domestic: true, international: 'unknown' }, searchUrl: 'https://www.amazon.de/s?k={q}', capabilities: AMAZON, launchPriority: 'expansion' }),
  r({ id: 'amazon-jp', name: 'Amazon Japan', country: 'JP', currency: 'JPY', domains: ['amazon.co.jp'], categories: ['marketplace'], pricesIncludeTax: true, delivery: { domestic: true, international: 'unknown' }, searchUrl: 'https://www.amazon.co.jp/s?k={q}', capabilities: AMAZON, launchPriority: 'expansion' }),
  r({ id: 'amazon-sg', name: 'Amazon Singapore', country: 'SG', currency: 'SGD', domains: ['amazon.sg'], categories: ['marketplace'], pricesIncludeTax: true, delivery: { domestic: true, international: 'unknown' }, searchUrl: 'https://www.amazon.sg/s?k={q}', capabilities: AMAZON, launchPriority: 'expansion' }),
  r({ id: 'amazon-ae', name: 'Amazon UAE', country: 'AE', currency: 'AED', domains: ['amazon.ae'], categories: ['marketplace'], pricesIncludeTax: true, delivery: { domestic: true, international: 'unknown' }, searchUrl: 'https://www.amazon.ae/s?k={q}', capabilities: AMAZON, launchPriority: 'expansion' }),
  r({ id: 'ebay-us', name: 'eBay (US)', country: 'US', currency: 'USD', domains: ['ebay.com'], categories: ['marketplace'], pricesIncludeTax: false, delivery: { domestic: true, international: 'unknown' }, searchUrl: 'https://www.ebay.com/sch/i.html?_nkw={q}', capabilities: EBAY, apiProvider: 'ebay_browse', launchPriority: 'expansion' }),
  r({ id: 'ebay-uk', name: 'eBay UK', country: 'GB', currency: 'GBP', domains: ['ebay.co.uk'], categories: ['marketplace'], pricesIncludeTax: true, delivery: { domestic: true, international: 'unknown' }, searchUrl: 'https://www.ebay.co.uk/sch/i.html?_nkw={q}', capabilities: EBAY, apiProvider: 'ebay_browse', launchPriority: 'expansion' }),
  r({ id: 'aliexpress', name: 'AliExpress', country: null, currency: 'USD', domains: ['aliexpress.com', 'aliexpress.us'], categories: ['marketplace'], pricesIncludeTax: null, delivery: { domestic: false, international: 'worldwide' }, searchUrl: 'https://www.aliexpress.com/wholesale?SearchText={q}', launchPriority: 'expansion', notes: 'Prices display in the visitor’s chosen currency; delivery and import charges vary by seller and destination.' }),
  r({ id: 'etsy', name: 'Etsy', country: null, currency: 'USD', domains: ['etsy.com'], categories: ['marketplace', 'home', 'fashion'], pricesIncludeTax: null, delivery: { domestic: false, international: 'unknown' }, searchUrl: 'https://www.etsy.com/search?q={q}', launchPriority: 'expansion' }),
  r({ id: 'walmart', name: 'Walmart', country: 'US', currency: 'USD', domains: ['walmart.com'], categories: ['general', 'electronics', 'home'], pricesIncludeTax: false, delivery: { domestic: true, international: 'none' }, searchUrl: 'https://www.walmart.com/search?q={q}', launchPriority: 'expansion' }),
  r({ id: 'best-buy', name: 'Best Buy', country: 'US', currency: 'USD', domains: ['bestbuy.com'], categories: ['electronics'], pricesIncludeTax: false, delivery: { domestic: true, international: 'none' }, searchUrl: 'https://www.bestbuy.com/site/searchpage.jsp?st={q}', launchPriority: 'expansion' }),
  r({ id: 'zalando', name: 'Zalando', country: 'DE', currency: 'EUR', domains: ['zalando.de', 'zalando.fr', 'zalando.it', 'zalando.nl', 'zalando.es', 'zalando.pl', 'zalando.at'], categories: ['fashion'], pricesIncludeTax: true, delivery: { domestic: true, international: 'unknown' }, launchPriority: 'expansion' }),
  r({ id: 'shein', name: 'SHEIN', country: null, currency: 'USD', domains: ['shein.com', 'au.shein.com'], categories: ['fashion'], pricesIncludeTax: null, delivery: { domestic: false, international: 'unknown' }, launchPriority: 'expansion' }),
  r({ id: 'asos-uk', name: 'ASOS', country: 'GB', currency: 'GBP', domains: ['asos.com'], categories: ['fashion', 'beauty'], pricesIncludeTax: true, delivery: { domestic: true, international: 'unknown' }, searchUrl: 'https://www.asos.com/search/?q={q}', launchPriority: 'expansion' }),
  r({ id: 'argos', name: 'Argos', country: 'GB', currency: 'GBP', domains: ['argos.co.uk'], categories: ['general', 'electronics', 'home'], pricesIncludeTax: true, delivery: { domestic: true, international: 'none' }, searchUrl: 'https://www.argos.co.uk/search/{q}/', launchPriority: 'expansion' }),
  r({ id: 'currys', name: 'Currys', country: 'GB', currency: 'GBP', domains: ['currys.co.uk'], categories: ['electronics'], pricesIncludeTax: true, delivery: { domestic: true, international: 'none' }, launchPriority: 'expansion' }),
  r({ id: 'flipkart', name: 'Flipkart', country: 'IN', currency: 'INR', domains: ['flipkart.com'], categories: ['marketplace'], pricesIncludeTax: true, delivery: { domestic: true, international: 'none' }, searchUrl: 'https://www.flipkart.com/search?q={q}', launchPriority: 'expansion' }),
  r({ id: 'noon', name: 'noon', country: 'AE', currency: 'AED', domains: ['noon.com'], categories: ['marketplace'], pricesIncludeTax: true, delivery: { domestic: true, international: 'unknown' }, launchPriority: 'expansion' }),
  r({ id: 'uniqlo-global', name: 'UNIQLO', country: null, currency: 'USD', domains: ['uniqlo.com'], categories: ['fashion'], pricesIncludeTax: null, delivery: { domestic: false, international: 'unknown' }, launchPriority: 'expansion' }),
  r({ id: 'nike-global', name: 'Nike', country: null, currency: 'USD', domains: ['nike.com'], categories: ['sport', 'fashion'], pricesIncludeTax: null, delivery: { domestic: false, international: 'unknown' }, launchPriority: 'expansion' }),
];

const BY_ID = new Map(RETAILERS.map((rt) => [rt.id, rt]));

export function getRetailer(id: string | null | undefined): RetailerDefinition | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** Finds the registry entry for a URL, honouring regional path prefixes (nike.com/au). */
export function retailerForUrl(url: string): RetailerDefinition | undefined {
  const host = hostnameOf(url);
  if (!host) return undefined;
  let path = '/';
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    /* ignore */
  }
  const candidates = RETAILERS.filter((rt) => rt.domains.some((d) => host === d || host.endsWith(`.${d}`)));
  const withPrefix = candidates.find((rt) => rt.pathPrefix && (path === rt.pathPrefix || path.startsWith(`${rt.pathPrefix}/`)));
  if (withPrefix) return withPrefix;
  const regionalHost = candidates.find((rt) => !rt.pathPrefix && rt.domains.includes(host));
  return regionalHost ?? candidates.find((rt) => !rt.pathPrefix);
}

const GENERIC_TLDS = new Set(['co', 'io', 'ai', 'me', 'tv', 'ly', 'fm', 'gg', 'to', 'cc', 'ws', 'la', 'so', 'sh', 'ac', 'im', 'vc', 'st', 'gl', 'xyz']);

/** Country implied by a country-code TLD (".com.au" → AU, ".co.uk" → GB). */
export function countryFromHostname(hostname: string): CountryCode | null {
  const labels = hostname.toLowerCase().split('.');
  const tld = labels[labels.length - 1] ?? '';
  if (tld === 'uk') return 'GB';
  if (tld.length === 2 && !GENERIC_TLDS.has(tld) && isCountryCode(tld.toUpperCase())) return tld.toUpperCase();
  return null;
}

export function retailersForCountry(country: CountryCode): RetailerDefinition[] {
  return RETAILERS.filter((rt) => rt.country === country);
}

export function searchLink(retailer: RetailerDefinition, query: string): string | null {
  if (!retailer.searchUrl || !query.trim()) return null;
  return retailer.searchUrl.replace('{q}', encodeURIComponent(query.trim()));
}

export type DeliveryEligibility = 'domestic' | 'international' | 'ineligible' | 'unknown';

/** Whether a retailer can deliver to `deliveryCountry`, based only on registry knowledge. */
export function deliveryEligibility(retailer: RetailerDefinition | undefined, retailerCountry: CountryCode | null, deliveryCountry: CountryCode): DeliveryEligibility {
  const home = retailer?.country ?? retailerCountry;
  if (home && home === deliveryCountry) return retailer && !retailer.delivery.domestic ? 'unknown' : 'domestic';
  if (!retailer) return 'unknown';
  const intl = retailer.delivery.international;
  if (intl === 'none') return home ? 'ineligible' : 'unknown';
  if (intl === 'worldwide') return 'international';
  if (intl === 'unknown') return 'unknown';
  return intl.includes(deliveryCountry) ? 'international' : 'ineligible';
}
