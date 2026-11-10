import type {
  Availability,
  Condition,
  CountryCode,
  CurrencyCode,
  ExtractionMethod,
  ExtractionResult,
  ExtractedOffer,
  ListItemCandidate,
  ProductIdentifiers,
  ShippingQuote,
  VariantAttributes,
  VariantOption,
} from '../types';
import { cleanOptional, cleanText } from '../util/text';
import { hostnameOf, normaliseProductUrl, safeUrl } from '../util/url';
import { normaliseCurrency } from '../pricing/currency';
import { detectCurrency, parsePrice, parseStructuredPrice } from '../pricing/parsePrice';
import { normaliseGtin } from '../matching/identifiers';
import { inferVariant, extractCondition } from '../matching/attributes';
import { countryFromHostname, retailerForUrl } from '../retailers/registry';
import { defaultCurrencyFor, isCountryCode } from '../geo/countries';
import { asArray, hasType, imageUrls, indexJsonLd, str, type JsonNode } from './jsonld';
import type { RawPageData } from './rawPage';

export interface ExtractContext {
  now?: number;
}

const AVAILABILITY_MAP: [RegExp, Availability][] = [
  [/out ?of ?stock|soldout|sold out|oos|unavailable|নেই/i, 'out_of_stock'],
  [/discontinued/i, 'discontinued'],
  [/pre ?order|presale/i, 'preorder'],
  [/back ?order/i, 'backorder'],
  [/limited/i, 'limited'],
  [/in ?stock|instoreonly|onlineonly|available|স্টকে আছে/i, 'in_stock'],
];

export function mapAvailability(raw: unknown): Availability {
  const s = str(raw);
  if (!s) return 'unknown';
  const key = s.replace(/^https?:\/\/schema\.org\//i, '');
  for (const [re, value] of AVAILABILITY_MAP) if (re.test(key)) return value;
  return 'unknown';
}

export function mapCondition(raw: unknown): Condition {
  const s = str(raw)?.replace(/^https?:\/\/schema\.org\//i, '').toLowerCase();
  if (!s) return 'unknown';
  if (s.includes('new')) return 'new';
  if (s.includes('refurb') || s.includes('renewed')) return 'refurbished';
  if (s.includes('used') || s.includes('pre-owned')) return 'used';
  if (s.includes('damaged')) return 'damaged';
  return 'unknown';
}

function metaMap(raw: RawPageData): Map<string, string> {
  const m = new Map<string, string>();
  for (const tag of raw.meta) if (!m.has(tag.key) && tag.value) m.set(tag.key, tag.value);
  return m;
}

function firstDefined<T>(...values: (T | undefined | null)[]): T | undefined {
  for (const v of values) if (v !== undefined && v !== null && v !== '') return v;
  return undefined;
}

/** Strips " | Store Name" / " - Buy online" style suffixes from document titles. */
export function cleanDocumentTitle(title: string, siteName?: string): string {
  let t = cleanText(title, 300);
  if (siteName) t = t.replace(new RegExp(`\\s*[|\\-–—:]\\s*${escapeRegExp(siteName)}.*$`, 'i'), '');
  t = t.replace(/\s*[|–—]\s*[^|–—]{2,40}$/, '');
  return t.replace(/^(buy|shop)\s+/i, '').trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface OfferPick {
  price: number | null;
  currency: CurrencyCode | null;
  listPrice: number | null;
  priceIsFrom: boolean;
  availability: Availability;
  condition: Condition;
  url?: string;
  seller?: string;
  shipping: Omit<ShippingQuote, 'recordedAt'>[];
  paymentMethods?: string[];
  taxIncluded: boolean | null;
}

function readPriceSpec(spec: unknown): { price: number | null; currency: CurrencyCode | null; listPrice: number | null; taxIncluded: boolean | null } {
  let price: number | null = null;
  let currency: CurrencyCode | null = null;
  let listPrice: number | null = null;
  let taxIncluded: boolean | null = null;
  for (const s of asArray(spec)) {
    if (!s || typeof s !== 'object') continue;
    const n = s as JsonNode;
    const value = parseStructuredPrice(n.price ?? n.minPrice);
    const type = str(n.priceType)?.toLowerCase() ?? '';
    const cur = normaliseCurrency(n.priceCurrency);
    if (typeof n.valueAddedTaxIncluded === 'boolean') taxIncluded = n.valueAddedTaxIncluded;
    if (value === null) continue;
    if (/strikethrough|listprice|msrp|srp/.test(type)) listPrice = listPrice ?? value;
    else if (price === null) {
      price = value;
      currency = cur ?? currency;
    }
  }
  return { price, currency, listPrice, taxIncluded };
}

function readShipping(details: unknown): Omit<ShippingQuote, 'recordedAt'>[] {
  const quotes: Omit<ShippingQuote, 'recordedAt'>[] = [];
  for (const d of asArray(details)) {
    if (!d || typeof d !== 'object') continue;
    const n = d as JsonNode;
    if (n.doesNotShip === true || n.doesNotShip === 'true') continue;
    const rate = (Array.isArray(n.shippingRate) ? n.shippingRate[0] : n.shippingRate) as JsonNode | undefined;
    if (!rate || typeof rate !== 'object') continue;
    const amount = parseStructuredPrice(rate.value ?? rate.price ?? rate.minValue);
    const currency = normaliseCurrency(rate.currency ?? rate.priceCurrency);
    if (amount === null || !currency) continue;
    const destinations: (CountryCode | null)[] = [];
    for (const dest of asArray(n.shippingDestination)) {
      const country = dest && typeof dest === 'object' ? asArray((dest as JsonNode).addressCountry) : [];
      for (const c of country) {
        const code = (typeof c === 'string' ? c : str((c as JsonNode)?.name) ?? '').toUpperCase();
        if (isCountryCode(code)) destinations.push(code);
      }
    }
    for (const destinationCountry of destinations.length ? destinations : [null]) {
      quotes.push({ destinationCountry, amount, currency, source: 'page' });
    }
  }
  return quotes;
}

function readOffer(node: JsonNode): OfferPick & { isAggregate: boolean } {
  const isAggregate = hasType(node, 'AggregateOffer');
  const spec = readPriceSpec(node.priceSpecification);
  let price = parseStructuredPrice(node.price) ?? spec.price;
  let priceIsFrom = false;
  if (isAggregate) {
    const low = parseStructuredPrice(node.lowPrice);
    const high = parseStructuredPrice(node.highPrice);
    if (price === null && low !== null) {
      price = low;
      priceIsFrom = high !== null && high !== low;
    }
  }
  const sellerNode = node.seller as JsonNode | undefined;
  const methods = asArray(node.acceptedPaymentMethod)
    .map((m) => cleanText(str(m)?.replace(/^https?:\/\/[^#]+#/, '') ?? '', 40))
    .filter(Boolean);
  return {
    isAggregate,
    price,
    currency: normaliseCurrency(node.priceCurrency) ?? spec.currency,
    listPrice: spec.listPrice,
    priceIsFrom,
    availability: mapAvailability(node.availability),
    condition: mapCondition(node.itemCondition),
    url: str(node.url),
    seller: cleanOptional(str(sellerNode), 80),
    shipping: readShipping(node.shippingDetails),
    paymentMethods: methods.length ? methods : undefined,
    taxIncluded: spec.taxIncluded,
  };
}

function pickOffer(offersValue: unknown, pageUrl: string): (OfferPick & { others: OfferPick[] }) | null {
  const offers: (OfferPick & { isAggregate: boolean })[] = [];
  for (const o of asArray(offersValue)) {
    if (!o || typeof o !== 'object') continue;
    const node = o as JsonNode;
    const read = readOffer(node);
    offers.push(read);
    if (read.isAggregate && node.offers) {
      for (const inner of asArray(node.offers)) if (inner && typeof inner === 'object') offers.push(readOffer(inner as JsonNode));
    }
  }
  const priced = offers.filter((o) => o.price !== null);
  if (!priced.length) return offers[0] ? { ...offers[0], others: [] } : null;
  const pageKey = normaliseProductUrl(pageUrl);
  const byUrl = priced.find((o) => o.url && normaliseProductUrl(safeUrl(o.url, pageUrl) ?? '') === pageKey);
  const chosen = byUrl ?? priced.find((o) => !o.isAggregate && o.availability === 'in_stock') ?? priced.find((o) => !o.isAggregate) ?? priced[0]!;
  return { ...chosen, others: priced.filter((o) => o !== chosen) };
}

function identifiersFrom(node: JsonNode): ProductIdentifiers {
  const gtinRaw = firstDefined(str(node.gtin14), str(node.gtin13), str(node.gtin12), str(node.gtin8), str(node.gtin), str(node.isbn), str(node.ean), str(node.upc));
  const productId = str(node.productID);
  const gtin = normaliseGtin(gtinRaw) ?? (productId ? normaliseGtin(productId.replace(/^(isbn|ean|upc|gtin\d*):/i, '')) : null);
  return {
    gtin: gtin ?? undefined,
    mpn: cleanOptional(str(node.mpn), 60),
    sku: cleanOptional(str(node.sku), 60),
    isbn: hasType(node, 'Book') ? cleanOptional(str(node.isbn), 20) : undefined,
  };
}

function variantFrom(node: JsonNode): VariantAttributes {
  return {
    colour: cleanOptional(str(node.color) ?? str(node.colour), 40),
    size: cleanOptional(str(node.size), 40),
  };
}

function categoryFrom(node: JsonNode | undefined, breadcrumbs: JsonNode[]): string | undefined {
  const cat = node ? str(node.category) : undefined;
  if (cat) {
    const parts = cat.split(/\s*[>/|›»]\s*/).filter(Boolean);
    return cleanOptional(parts[parts.length - 1] ?? cat, 60);
  }
  for (const bc of breadcrumbs) {
    const items = asArray(bc.itemListElement)
      .map((li) => (li && typeof li === 'object' ? str((li as JsonNode).name) ?? str((li as JsonNode).item) : undefined))
      .filter((x): x is string => !!x && !/^https?:/.test(x));
    // Last element is usually the product itself; take the one before it.
    const candidate = items.length >= 2 ? items[items.length - 2] : items[0];
    if (candidate && !/^home$/i.test(candidate)) return cleanOptional(candidate, 60);
  }
  return undefined;
}

function variantOptions(group: JsonNode, pageUrl: string): VariantOption[] {
  const out: VariantOption[] = [];
  for (const v of asArray(group.hasVariant)) {
    if (!v || typeof v !== 'object') continue;
    const node = v as JsonNode;
    const offer = pickOffer(node.offers, pageUrl);
    const label = cleanText(str(node.name) ?? [str(node.color), str(node.size)].filter(Boolean).join(' / '), 120);
    if (!label) continue;
    out.push({
      label,
      url: safeUrl(str(node.url) ?? offer?.url, pageUrl),
      price: offer?.price ?? null,
      currency: offer?.currency ?? null,
      availability: offer?.availability,
      attributes: variantFrom(node),
      gtin: identifiersFrom(node).gtin,
      sku: cleanOptional(str(node.sku), 60),
    });
    if (out.length >= 50) break;
  }
  return out;
}

function resolveImage(candidates: (string | undefined)[], base: string): string | undefined {
  for (const c of candidates) {
    const u = safeUrl(c, base);
    if (u && !/\.svg(\?|$)/i.test(u) && !u.startsWith('data:')) return u;
  }
  return undefined;
}

/**
 * Turns raw page signals into a product + offer, using layers in this order:
 * 1. schema.org JSON-LD  2. microdata  3. Open Graph / product meta tags
 * 4. retailer adapter selectors  5. visible page hints (heuristic)  → manual entry fallback.
 * Fields are never invented: anything not found stays empty for the user to fill in.
 */
export function extractProduct(raw: RawPageData, _ctx: ExtractContext = {}): ExtractionResult {
  const methods = new Set<ExtractionMethod>();
  const heuristicFields = new Set<string>();
  const warnings: string[] = [];
  const meta = metaMap(raw);
  const pageUrl = safeUrl(raw.url) ?? raw.url;
  const canonicalUrl = safeUrl(raw.canonicalUrl, pageUrl) ?? safeUrl(meta.get('og:url'), pageUrl) ?? pageUrl;
  const retailerDef = retailerForUrl(pageUrl);
  const domain = hostnameOf(pageUrl);
  const country = retailerDef?.country ?? countryFromHostname(domain);
  const siteName = cleanOptional(meta.get('og:site_name'), 60);

  // ---- Layer 1: JSON-LD -------------------------------------------------------------
  const index = indexJsonLd(raw.jsonLd.slice(0, 30));
  let product: JsonNode | undefined = index.products[0];
  const group = index.productGroups[0];
  let variants: VariantOption[] = [];
  let offer: (OfferPick & { others: OfferPick[] }) | null = null;

  if (index.products.length > 1) {
    // Prefer the product whose url matches the page or that carries offers.
    const pageKey = normaliseProductUrl(canonicalUrl);
    product =
      index.products.find((p) => str(p.url) && normaliseProductUrl(safeUrl(str(p.url), pageUrl) ?? '') === pageKey) ??
      index.products.find((p) => p.offers) ??
      product;
  }
  if (!product && index.standaloneOffers[0]) {
    const so = index.standaloneOffers[0];
    product = { ...(so.itemOffered as JsonNode), offers: so };
  }
  if (group) {
    variants = variantOptions(group, pageUrl);
    const pageKey = normaliseProductUrl(pageUrl);
    const selectedVariant = asArray(group.hasVariant).find((v) => {
      const u = v && typeof v === 'object' ? str((v as JsonNode).url) : undefined;
      return u && normaliseProductUrl(safeUrl(u, pageUrl) ?? '') === pageKey;
    }) as JsonNode | undefined;
    if (selectedVariant) product = { ...group, ...selectedVariant };
    else if (!product) {
      product = group;
      const prices = new Set(variants.map((v) => v.price).filter((p) => p != null));
      if (prices.size > 1) warnings.push('variant_price_differs');
    }
  }
  if (product) {
    methods.add('json_ld');
    offer = pickOffer(product.offers, pageUrl);
    if (!offer && group && variants.length) {
      const prices = [...new Set(variants.map((v) => v.price).filter((p): p is number => p != null))];
      const currency = variants.find((v) => v.currency)?.currency ?? null;
      if (prices.length === 1) offer = { price: prices[0]!, currency, listPrice: null, priceIsFrom: false, availability: 'unknown', condition: 'unknown', shipping: [], taxIncluded: null, others: [] };
    }
  }

  // ---- Layer 2: microdata -------------------------------------------------------------
  const md = raw.microdata.find((m) => /schema\.org\/(Product|IndividualProduct|ProductModel)$/i.test(m.type));
  const mdp = (k: string) => md?.props[k]?.[0];
  const mdOffer = md?.offers[0];
  const mdo = (k: string) => mdOffer?.[k]?.[0];
  if (md && (mdp('name') || mdo('price'))) methods.add('microdata');

  // ---- Layer 3: Open Graph & product meta ---------------------------------------------
  const ogType = meta.get('og:type')?.toLowerCase();
  const ogPrice = firstDefined(meta.get('product:sale_price:amount'), meta.get('product:price:amount'), meta.get('og:price:amount'), meta.get('itemprop:price'));
  const ogCurrency = firstDefined(meta.get('product:sale_price:currency'), meta.get('product:price:currency'), meta.get('og:price:currency'), meta.get('itemprop:pricecurrency'));
  const isOgProduct = !!ogType && /product/.test(ogType);
  if (isOgProduct || ogPrice || meta.get('og:title')) methods.add('open_graph');

  // ---- Layer 4: retailer adapter --------------------------------------------------------
  const adapter = raw.adapter?.fields ?? {};
  const usedAdapter = Object.keys(adapter).length > 0;
  if (usedAdapter) methods.add('retailer_adapter');

  // ---- Merge: identity fields ---------------------------------------------------------
  let title = cleanText(str(product?.name), 300);
  if (!title) title = cleanText(mdp('name'), 300);
  if (!title && isOgProduct) title = cleanText(meta.get('og:title'), 300);
  if (!title && adapter.title) {
    title = cleanText(adapter.title, 300);
    heuristicFields.add('title');
  }
  if (!title) {
    const fallback = cleanText(raw.h1, 300) || cleanText(meta.get('og:title'), 300) || cleanDocumentTitle(raw.documentTitle, siteName);
    if (fallback) {
      title = fallback;
      heuristicFields.add('title');
      methods.add('visible_page');
    }
  }

  const brand = firstDefined(cleanOptional(str(product?.brand), 80), cleanOptional(mdp('brand'), 80), cleanOptional(meta.get('product:brand') ?? meta.get('og:brand'), 80), cleanOptional(adapter.brand, 80));
  if (brand && !product?.brand && !mdp('brand') && !meta.get('product:brand') && adapter.brand) heuristicFields.add('brand');

  const productIds = product ? identifiersFrom(product) : {};
  const identifiers: ProductIdentifiers = {
    gtin: firstDefined(productIds.gtin, normaliseGtin(mdp('gtin13') ?? mdp('gtin12') ?? mdp('gtin') ?? mdp('gtin14') ?? mdp('gtin8')) ?? undefined, normaliseGtin(meta.get('product:ean') ?? meta.get('product:upc') ?? meta.get('product:gtin')) ?? undefined),
    mpn: firstDefined(productIds.mpn, cleanOptional(mdp('mpn'), 60), cleanOptional(meta.get('product:mfr_part_no'), 60)),
    sku: firstDefined(productIds.sku, cleanOptional(mdp('sku'), 60), cleanOptional(meta.get('product:retailer_item_id'), 60), cleanOptional(adapter.sku, 60)),
    isbn: productIds.isbn,
  };
  const asin = pageUrl.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1];
  if (asin && /amazon\./.test(domain)) identifiers.asin = asin.toUpperCase();

  const modelRaw = product ? str(product.model) : mdp('model');
  const model = cleanOptional(modelRaw, 80);

  const imageUrl = resolveImage(
    [...(product ? imageUrls(product.image) : []), mdp('image'), meta.get('og:image:secure_url'), meta.get('og:image'), meta.get('twitter:image'), adapter.image, ...raw.images],
    pageUrl,
  );
  if (imageUrl && !product?.image && !mdp('image') && !meta.get('og:image') && !meta.get('twitter:image')) heuristicFields.add('imageUrl');

  const description = firstDefined(cleanOptional(str(product?.description), 500), cleanOptional(mdp('description'), 500), cleanOptional(meta.get('og:description') ?? meta.get('description'), 500));
  const category = categoryFrom(product, index.breadcrumbs) ?? cleanOptional(mdp('category'), 60);

  // ---- Merge: offer fields --------------------------------------------------------------
  let price: number | null = offer?.price ?? null;
  let currency: CurrencyCode | null = offer?.currency ?? null;
  const priceIsFrom = offer?.priceIsFrom ?? false;
  let listPrice = offer?.listPrice ?? null;
  let availability: Availability = offer?.availability ?? 'unknown';
  let condition: Condition = offer?.condition !== 'unknown' && offer ? offer.condition : mapCondition(product?.itemCondition);

  if (price === null && mdo('price')) {
    price = parseStructuredPrice(mdo('price'));
    currency = currency ?? normaliseCurrency(mdo('pricecurrency') ?? mdo('priceCurrency'));
  }
  if (price === null && mdp('price')) price = parseStructuredPrice(mdp('price'));
  if (availability === 'unknown' && mdo('availability')) availability = mapAvailability(mdo('availability'));
  if (availability === 'unknown' && meta.get('itemprop:availability')) availability = mapAvailability(meta.get('itemprop:availability'));
  if (price === null && ogPrice) {
    price = parseStructuredPrice(ogPrice);
    currency = currency ?? normaliseCurrency(ogCurrency);
  }
  if (listPrice === null && meta.get('product:original_price:amount')) listPrice = parseStructuredPrice(meta.get('product:original_price:amount'));
  if (availability === 'unknown' && meta.get('product:availability')) availability = mapAvailability(meta.get('product:availability'));
  if (condition === 'unknown' && meta.get('product:condition')) condition = mapCondition(meta.get('product:condition'));

  if (price === null && adapter.price) {
    const parsed = parsePrice(adapter.price, country, retailerDef?.currency);
    if (parsed) {
      price = parsed.amount;
      currency = currency ?? parsed.currency;
      heuristicFields.add('price');
    }
  }
  if (listPrice === null && adapter.listPrice) listPrice = parsePrice(adapter.listPrice, country)?.amount ?? null;
  if (availability === 'unknown' && adapter.availability) availability = mapAvailability(adapter.availability);

  // ---- Layer 5: visible-page price candidates (suggestions only) ------------------------
  const priceCandidates: ExtractionResult['priceCandidates'] = [];
  const seenAmounts = new Set<string>();
  for (const text of raw.priceTexts.slice(0, 30)) {
    if (!/\p{Nd}/u.test(text) || text.length > 60) continue;
    const parsed = parsePrice(text, country, null);
    if (!parsed || parsed.amount <= 0) continue;
    const cur = parsed.currency;
    if (!cur && !/[$৳£€₹¥]|tk|rs|aud|bdt/i.test(text)) continue;
    const key = `${parsed.amount}|${cur}`;
    if (seenAmounts.has(key)) continue;
    seenAmounts.add(key);
    priceCandidates.push({ amount: parsed.amount, currency: cur, text: cleanText(text, 60) });
    if (priceCandidates.length >= 8) break;
  }
  if (price === null && priceCandidates.length === 1) {
    price = priceCandidates[0]!.amount;
    currency = currency ?? priceCandidates[0]!.currency;
    heuristicFields.add('price');
    methods.add('visible_page');
  }

  if (price !== null && !currency) {
    const fromText = raw.priceTexts.map((t) => detectCurrency(t, country)).find(Boolean) ?? null;
    currency = fromText ?? retailerDef?.currency ?? (country ? defaultCurrencyFor(country) : null);
    if (currency) heuristicFields.add('currency');
  }
  if (price !== null && price <= 0) {
    warnings.push('zero_price');
    price = null;
  }
  if (priceIsFrom) warnings.push('price_is_from');
  if (condition === 'unknown') condition = extractCondition(title) ?? 'unknown';

  const variant = inferVariant(`${title} ${model ?? ''}`, {
    ...(product ? variantFrom(product) : {}),
    colour: firstDefined(product ? variantFrom(product).colour : undefined, cleanOptional(mdp('color'), 40), cleanOptional(meta.get('product:color'), 40)),
    size: firstDefined(product ? variantFrom(product).size : undefined, cleanOptional(mdp('size'), 40), cleanOptional(meta.get('product:size'), 40)),
  });
  for (const k of Object.keys(variant) as (keyof VariantAttributes)[]) if (variant[k] === undefined) delete variant[k];

  const extractedOffer: ExtractedOffer = {
    price,
    currency,
    listPrice: listPrice !== null && price !== null && listPrice > price ? listPrice : null,
    priceIsFrom,
    availability,
    condition,
    shippingQuotes: offer?.shipping ?? [],
    seller: offer?.seller,
    paymentMethods: offer?.paymentMethods,
    taxIncluded: offer?.taxIncluded ?? retailerDef?.pricesIncludeTax ?? null,
  };

  const isProductPage = !!product || !!md || isOgProduct || !!ogPrice || usedAdapter;
  const status: ExtractionResult['status'] = isProductPage && title && price !== null && currency ? 'product' : isProductPage || price !== null ? 'partial' : 'none';
  if (status === 'none') methods.add('manual');

  return {
    status,
    url: pageUrl,
    canonicalUrl,
    product: {
      title,
      brand,
      model,
      category,
      description,
      imageUrl,
      identifiers: stripUndefined(identifiers),
      variant,
      condition,
    },
    offer: extractedOffer,
    variants,
    methods: [...methods],
    heuristicFields: [...heuristicFields],
    priceCandidates,
    retailer: {
      id: retailerDef?.id ?? null,
      name: retailerDef?.name ?? siteName ?? domain,
      domain,
      country,
    },
    warnings,
    listItems: extractListItems(raw, index, pageUrl, country),
  };
}

function stripUndefined<T extends object>(obj: T): T {
  const out = { ...obj };
  for (const k of Object.keys(out) as (keyof T)[]) if (out[k] === undefined) delete out[k];
  return out;
}

/** Products listed on the page (wishlists, category pages) for import previews. */
export function extractListItems(raw: RawPageData, index: ReturnType<typeof indexJsonLd>, pageUrl: string, country: CountryCode | null): ListItemCandidate[] {
  const out: ListItemCandidate[] = [];
  const seen = new Set<string>();
  const push = (c: ListItemCandidate) => {
    const key = normaliseProductUrl(c.url);
    if (!c.title || seen.has(key) || key === normaliseProductUrl(pageUrl)) return;
    seen.add(key);
    out.push(c);
  };
  for (const list of index.itemLists) {
    for (const el of asArray(list.itemListElement)) {
      if (!el || typeof el !== 'object') continue;
      const li = el as JsonNode;
      const item = (li.item && typeof li.item === 'object' ? li.item : li) as JsonNode;
      const url = safeUrl(str(item.url) ?? str(li.url) ?? (typeof li.item === 'string' ? li.item : undefined), pageUrl);
      const title = cleanText(str(item.name) ?? str(li.name), 300);
      if (!url || !title) continue;
      const offer = pickOffer(item.offers, url);
      push({ title, url, imageUrl: resolveImage(imageUrls(item.image), pageUrl), price: offer?.price ?? null, currency: offer?.currency ?? null, brand: cleanOptional(str(item.brand), 80), gtin: identifiersFrom(item).gtin, mpn: cleanOptional(str(item.mpn), 60), method: 'json_ld' });
    }
  }
  if (index.products.length > 1) {
    for (const p of index.products) {
      const url = safeUrl(str(p.url), pageUrl);
      const title = cleanText(str(p.name), 300);
      if (!url || !title) continue;
      const offer = pickOffer(p.offers, url);
      push({ title, url, imageUrl: resolveImage(imageUrls(p.image), pageUrl), price: offer?.price ?? null, currency: offer?.currency ?? null, brand: cleanOptional(str(p.brand), 80), gtin: identifiersFrom(p).gtin, mpn: cleanOptional(str(p.mpn), 60), method: 'json_ld' });
    }
  }
  // Ambiguous symbols ("$") fall back to the store's currency, or the single currency the
  // page's own structured list uses. These items are always shown in a preview for review.
  const structuredCurrencies = new Set(out.map((i) => i.currency).filter(Boolean));
  const pageCurrency = structuredCurrencies.size === 1 ? ([...structuredCurrencies][0] as string) : null;
  const retailerCurrency = retailerForUrl(pageUrl)?.currency ?? (country ? defaultCurrencyFor(country) : null) ?? pageCurrency;
  // A visible card repeating a structured entry (same title) is the same product.
  const structuredTitles = new Set(out.map((i) => i.title.toLowerCase()));
  for (const c of raw.listCandidates.slice(0, 300)) {
    const url = safeUrl(c.url, pageUrl);
    if (!url || structuredTitles.has(cleanText(c.title, 300).toLowerCase())) continue;
    const parsed = c.priceText ? parsePrice(c.priceText, country, retailerCurrency) : null;
    push({ title: cleanText(c.title, 300), url, imageUrl: safeUrl(c.imageUrl, pageUrl), price: parsed?.amount ?? null, currency: parsed?.currency ?? null, method: 'visible_page' });
  }
  return out.slice(0, 300);
}
