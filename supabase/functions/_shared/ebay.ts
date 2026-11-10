// eBay Browse API provider (official API; requires the operator's eBay developer keys).
// Docs: https://developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/search
import { env } from './http.ts';

export interface ProviderOffer {
  providerId: string;
  retailerId?: string;
  retailerName: string;
  retailerCountry?: string | null;
  title: string;
  url: string;
  imageUrl?: string;
  price: number;
  currency: string;
  shipping: { amount: number; currency: string } | null;
  condition: 'new' | 'used' | 'refurbished' | 'unknown';
  gtin?: string;
  observedAt: number;
}

/** eBay marketplaces WishSnag maps shopping countries to. Bangladesh has no eBay marketplace. */
export const EBAY_MARKETPLACES: Record<string, { id: string; retailerId: string; name: string }> = {
  AU: { id: 'EBAY_AU', retailerId: 'ebay-au', name: 'eBay Australia' },
  US: { id: 'EBAY_US', retailerId: 'ebay-us', name: 'eBay (US)' },
  GB: { id: 'EBAY_GB', retailerId: 'ebay-uk', name: 'eBay UK' },
  DE: { id: 'EBAY_DE', retailerId: 'ebay-de', name: 'eBay Germany' },
  CA: { id: 'EBAY_CA', retailerId: 'ebay-ca', name: 'eBay Canada' },
};

let token: { value: string; expiresAt: number } | null = null;

async function appToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const id = env('EBAY_CLIENT_ID');
  const secret = env('EBAY_CLIENT_SECRET');
  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${btoa(`${id}:${secret}`)}` },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'https://api.ebay.com/oauth/api_scope' }),
  });
  if (!res.ok) throw new Error(`eBay auth failed (${res.status})`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return token.value;
}

function mapCondition(c: string | undefined): ProviderOffer['condition'] {
  const s = (c ?? '').toLowerCase();
  if (s.startsWith('new')) return 'new';
  if (s.includes('refurb')) return 'refurbished';
  if (s.includes('used') || s.includes('pre-owned')) return 'used';
  return 'unknown';
}

export async function searchEbay(input: { query: string; gtin?: string; marketplaceCountry: string; deliveryCountry: string; postcode?: string }): Promise<ProviderOffer[]> {
  const mp = EBAY_MARKETPLACES[input.marketplaceCountry];
  if (!mp) return [];
  const params = new URLSearchParams({ limit: '20' });
  if (input.gtin) params.set('gtin', input.gtin.replace(/^0+(?=\d{12,13}$)/, ''));
  else params.set('q', input.query.slice(0, 100));
  params.set('filter', `deliveryCountry:${input.deliveryCountry},buyingOptions:{FIXED_PRICE}`);
  const ctx = [`country=${input.deliveryCountry}`, input.postcode ? `zip=${encodeURIComponent(input.postcode)}` : ''].filter(Boolean).join(',');
  const res = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, {
    headers: {
      authorization: `Bearer ${await appToken()}`,
      'X-EBAY-C-MARKETPLACE-ID': mp.id,
      'X-EBAY-C-ENDUSERCTX': `contextualLocation=${encodeURIComponent(ctx)}`,
    },
  });
  if (!res.ok) throw new Error(`eBay search failed (${res.status})`);
  const data = (await res.json()) as { itemSummaries?: Record<string, unknown>[] };
  const now = Date.now();
  const out: ProviderOffer[] = [];
  for (const it of data.itemSummaries ?? []) {
    const price = it.price as { value?: string; currency?: string } | undefined;
    const url = String(it.itemWebUrl ?? '');
    if (!price?.value || !price.currency || !/^https:\/\//.test(url)) continue;
    const ship = (it.shippingOptions as { shippingCost?: { value?: string; currency?: string }; shippingCostType?: string }[] | undefined)?.[0];
    const shippingCost = ship?.shippingCost?.value !== undefined ? { amount: Number(ship.shippingCost.value), currency: ship.shippingCost.currency ?? price.currency } : null;
    out.push({
      providerId: 'ebay_browse',
      retailerId: mp.retailerId,
      retailerName: `${mp.name}${(it.seller as { username?: string } | undefined)?.username ? ` · ${(it.seller as { username: string }).username}` : ''}`,
      retailerCountry: (it.itemLocation as { country?: string } | undefined)?.country ?? input.marketplaceCountry,
      title: String(it.title ?? '').slice(0, 300),
      url,
      imageUrl: (it.image as { imageUrl?: string } | undefined)?.imageUrl,
      price: Number(price.value),
      currency: price.currency,
      shipping: shippingCost,
      condition: mapCondition(it.condition as string | undefined),
      gtin: input.gtin,
      observedAt: now,
    });
  }
  return out;
}
