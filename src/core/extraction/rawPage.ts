/**
 * Raw, untrusted page signals collected either from a live DOM (content script) or
 * from an HTML string (background price checks — service workers have no DOMParser).
 * Both collectors produce this same shape, which `extractProduct` turns into a
 * validated product. Everything here is size-capped by the collectors.
 */
export interface RawMetaTag {
  /** Lower-cased property/name/itemprop, e.g. "og:title", "product:price:amount", "itemprop:price". */
  key: string;
  value: string;
}

export interface RawMicrodataItem {
  /** e.g. "https://schema.org/Product" */
  type: string;
  props: Record<string, string[]>;
  offers: Record<string, string[]>[];
}

export interface RawListCandidate {
  title: string;
  url: string;
  imageUrl?: string;
  priceText?: string;
}

export interface RawPageData {
  url: string;
  canonicalUrl?: string;
  documentTitle: string;
  lang?: string;
  /** Raw text content of <script type="application/ld+json"> blocks. */
  jsonLd: string[];
  meta: RawMetaTag[];
  microdata: RawMicrodataItem[];
  h1?: string;
  /** Short visible text snippets from price-like elements near the main content. */
  priceTexts: string[];
  /** Large images in the main content (absolute URLs). */
  images: string[];
  /** Fields read with retailer-specific selectors (see retailers/adapters.ts). */
  adapter?: { retailerId: string; fields: Record<string, string> };
  /** Repeated product cards (wishlist / category pages) for import previews. */
  listCandidates: RawListCandidate[];
}

export const RAW_LIMITS = {
  jsonLdBlocks: 30,
  jsonLdChars: 400_000,
  metaTags: 400,
  priceTexts: 30,
  images: 12,
  listCandidates: 300,
  textChars: 600,
} as const;

export function emptyRawPage(url: string, title = ''): RawPageData {
  return { url, documentTitle: title, jsonLd: [], meta: [], microdata: [], priceTexts: [], images: [], listCandidates: [] };
}
