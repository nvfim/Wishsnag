/**
 * Retailer-specific *visible page* hints (extraction layer 3).
 *
 * These are CSS selectors read by the content extractor only when structured data
 * (JSON-LD / microdata / Open Graph) is missing a field. They are best-effort and were
 * written from public page structure knowledge WITHOUT live verification in this build
 * (`verified: false`). Values found here are always flagged in the review form as
 * "detected from page text — please check", and a broken selector simply finds nothing:
 * site layout changes can never break the rest of the extractor.
 */
export interface RetailerAdapter {
  retailerId: string;
  verified: boolean;
  lastReviewed: string | null;
  selectors: Partial<Record<AdapterField, readonly string[]>>;
}

export type AdapterField = 'title' | 'price' | 'listPrice' | 'brand' | 'image' | 'availability' | 'sku';

export const RETAILER_ADAPTERS: readonly RetailerAdapter[] = [
  {
    retailerId: 'daraz-bd',
    verified: false,
    lastReviewed: null,
    selectors: {
      title: ['.pdp-mod-product-badge-title', 'h1'],
      price: ['.pdp-price_type_normal', '.pdp-product-price .pdp-price'],
      listPrice: ['.pdp-price_type_deleted'],
      brand: ['.pdp-product-brand__brand-link'],
      image: ['.gallery-preview-panel__image', '.pdp-mod-common-image'],
    },
  },
  {
    retailerId: 'star-tech',
    verified: false,
    lastReviewed: null,
    selectors: {
      title: ['h1.product-name', '.product-short-info h1', 'h1'],
      price: ['.product-price ins', 'td.product-price', '.product-info-item.product-price', '.price-new'],
      listPrice: ['.product-regular-price', '.price-old'],
      brand: ['.product-brand', 'td.product-brand'],
      image: ['.product-img-holder img', 'img.main-img'],
    },
  },
];

export function adapterFor(retailerId: string | null | undefined): RetailerAdapter | undefined {
  return retailerId ? RETAILER_ADAPTERS.find((a) => a.retailerId === retailerId) : undefined;
}
