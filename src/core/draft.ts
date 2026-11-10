import { z } from 'zod';
import type {
  Availability,
  Condition,
  CountryCode,
  CurrencyCode,
  ExtractionMethod,
  ExtractionResult,
  ItemStatus,
  Priority,
  ProductIdentifiers,
  ShippingQuote,
  VariantAttributes,
} from './types';
import { cleanOptional, cleanText } from './util/text';
import { hostnameOf, safeUrl } from './util/url';
import { isCurrencyCode } from './pricing/currency';
import { normaliseGtin } from './matching/identifiers';
import { inferVariant } from './matching/attributes';
import { countryFromHostname, retailerForUrl } from './retailers/registry';
import { isCountryCode } from './geo/countries';

/** Everything needed to create a wishlist item + its first offer + first observation. */
export interface ProductDraft {
  title: string;
  brand?: string;
  model?: string;
  category?: string;
  description?: string;
  imageUrl?: string;
  identifiers: ProductIdentifiers;
  variant: VariantAttributes;
  condition: Condition;
  url: string;
  price: number | null;
  currency: CurrencyCode | null;
  listPrice: number | null;
  availability: Availability;
  taxIncluded: boolean | null;
  shippingQuotes: Omit<ShippingQuote, 'recordedAt'>[];
  seller?: string;
  paymentMethods?: string[];
  retailer: { id: string | null; name: string; domain: string; country: CountryCode | null };
  methods: ExtractionMethod[];
  targetPrice: number | null;
  priority: Priority;
  collectionIds: string[];
  tags: string[];
  notes: string;
  status: ItemStatus;
  /** For imports that carry an original saved date. */
  savedAt?: number;
}

export function draftFromExtraction(result: ExtractionResult): ProductDraft {
  return {
    ...result.product,
    url: result.canonicalUrl || result.url,
    price: result.offer.price,
    currency: result.offer.currency,
    listPrice: result.offer.listPrice,
    availability: result.offer.availability,
    taxIncluded: result.offer.taxIncluded,
    shippingQuotes: result.offer.shippingQuotes,
    seller: result.offer.seller,
    paymentMethods: result.offer.paymentMethods,
    retailer: result.retailer,
    methods: result.methods,
    targetPrice: null,
    priority: 'medium',
    collectionIds: [],
    tags: [],
    notes: '',
    status: 'wanted',
  };
}

export function emptyDraft(url = ''): ProductDraft {
  return {
    title: '',
    identifiers: {},
    variant: {},
    condition: 'new',
    url,
    price: null,
    currency: null,
    listPrice: null,
    availability: 'unknown',
    taxIncluded: null,
    shippingQuotes: [],
    retailer: retailerInfoForUrl(url),
    methods: ['manual'],
    targetPrice: null,
    priority: 'medium',
    collectionIds: [],
    tags: [],
    notes: '',
    status: 'wanted',
  };
}

export function retailerInfoForUrl(url: string, fallbackName?: string): ProductDraft['retailer'] {
  const def = url ? retailerForUrl(url) : undefined;
  const domain = url ? hostnameOf(url) : '';
  return { id: def?.id ?? null, name: def?.name ?? fallbackName ?? domain, domain, country: def?.country ?? (domain ? countryFromHostname(domain) : null) };
}

const AVAILABILITY = ['in_stock', 'out_of_stock', 'preorder', 'backorder', 'limited', 'discontinued', 'unknown'] as const;
const CONDITION = ['new', 'used', 'refurbished', 'damaged', 'unknown'] as const;

/** Validation for drafts entered by users or imported from files. */
export const draftInputSchema = z
  .object({
    title: z.string().transform((s) => cleanText(s, 300)).pipe(z.string().min(1, 'field_required')),
    brand: z.string().optional().transform((s) => cleanOptional(s, 80)),
    model: z.string().optional().transform((s) => cleanOptional(s, 80)),
    category: z.string().optional().transform((s) => cleanOptional(s, 60)),
    description: z.string().optional().transform((s) => cleanOptional(s, 500)),
    imageUrl: z.string().optional().transform((s) => (s ? safeUrl(s) : undefined)),
    url: z
      .string()
      .transform((s) => s.trim())
      .refine((s) => s === '' || !!safeUrl(s), 'field_invalid_url')
      .transform((s) => (s ? safeUrl(s)! : '')),
    price: z.number().min(0).max(1e11).nullable(),
    currency: z.string().nullable().refine((c) => c === null || isCurrencyCode(c.toUpperCase()), 'Unknown currency').transform((c) => c?.toUpperCase() ?? null),
    gtin: z.string().optional().refine((g) => !g || !!normaliseGtin(g), 'field_invalid_gtin'),
    mpn: z.string().optional().transform((s) => cleanOptional(s, 60)),
    colour: z.string().optional().transform((s) => cleanOptional(s, 40)),
    size: z.string().optional().transform((s) => cleanOptional(s, 40)),
    storage: z.string().optional().transform((s) => cleanOptional(s, 20)),
    condition: z.enum(CONDITION).default('new'),
    availability: z.enum(AVAILABILITY).default('unknown'),
    targetPrice: z.number().min(0).max(1e11).nullable().default(null),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
    tags: z.array(z.string()).default([]).transform((tags) => [...new Set(tags.map((t) => cleanText(t, 30).toLowerCase()).filter(Boolean))].slice(0, 20)),
    notes: z.string().default('').transform((s) => cleanText(s, 2000)),
    status: z.enum(['wanted', 'purchased']).default('wanted'),
    retailerName: z.string().optional().transform((s) => cleanOptional(s, 80)),
    retailerCountry: z.string().optional().refine((c) => !c || isCountryCode(c), 'Unknown country'),
    collectionIds: z.array(z.string()).default([]),
    savedAt: z.number().optional(),
  })
  .refine((d) => d.price === null || d.currency !== null, { message: 'Currency required with a price', path: ['currency'] });

export type DraftInput = z.input<typeof draftInputSchema>;

/** Validates user/import input and turns it into a draft. Returns field errors (message keys). */
export function draftFromInput(input: DraftInput, base?: ProductDraft): { ok: true; draft: ProductDraft } | { ok: false; errors: Record<string, string> } {
  const parsed = draftInputSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? 'form')] ??= issue.message;
    return { ok: false, errors };
  }
  const d = parsed.data;
  const retailer = base?.retailer && base.url === d.url ? { ...base.retailer } : retailerInfoForUrl(d.url, d.retailerName);
  if (d.retailerName) retailer.name = d.retailerName;
  if (d.retailerCountry) retailer.country = d.retailerCountry.toUpperCase();
  const variant = inferVariant(`${d.title} ${d.model ?? ''}`, { ...base?.variant, colour: d.colour ?? base?.variant.colour, size: d.size ?? base?.variant.size, storage: d.storage ?? base?.variant.storage });
  for (const k of Object.keys(variant) as (keyof VariantAttributes)[]) if (variant[k] === undefined) delete variant[k];
  const draft: ProductDraft = {
    ...(base ?? emptyDraft(d.url)),
    title: d.title,
    brand: d.brand,
    model: d.model,
    category: d.category,
    description: d.description ?? base?.description,
    imageUrl: d.imageUrl,
    url: d.url,
    price: d.price,
    currency: d.currency,
    identifiers: { ...base?.identifiers, gtin: d.gtin ? normaliseGtin(d.gtin)! : undefined, mpn: d.mpn },
    variant,
    condition: d.condition,
    availability: d.availability,
    targetPrice: d.targetPrice,
    priority: d.priority,
    tags: d.tags,
    notes: d.notes,
    status: d.status,
    retailer,
    collectionIds: d.collectionIds,
    savedAt: d.savedAt,
  };
  if (!draft.identifiers.gtin) delete draft.identifiers.gtin;
  if (!draft.identifiers.mpn) delete draft.identifiers.mpn;
  return { ok: true, draft };
}

export function isValidCountry(c: unknown): c is CountryCode {
  return isCountryCode(c);
}
