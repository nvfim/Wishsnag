// POST /functions/v1/compare-offers
// Returns live offers from licensed/official store APIs that are configured server-side.
// Store credentials live only in Edge Function secrets — never in the extension.
import { HttpError, handle, json, rateLimit, requireUser } from '../_shared/http.ts';
import { EBAY_MARKETPLACES, searchEbay, type ProviderOffer } from '../_shared/ebay.ts';

interface Body {
  query?: string;
  gtin?: string;
  brand?: string;
  mode?: 'local' | 'global' | 'all';
  shoppingCountry?: string;
  deliveryCountry?: string;
  postcode?: string;
}

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'POST only');
    const user = await requireUser(req);
    rateLimit(`compare:${user.id}`, 10);
    const body = (await req.json().catch(() => ({}))) as Body;
    const query = String(body.query ?? '').trim().slice(0, 120);
    const shopping = String(body.shoppingCountry ?? '').toUpperCase();
    const delivery = String(body.deliveryCountry ?? '').toUpperCase();
    if (!query || !/^[A-Z]{2}$/.test(shopping) || !/^[A-Z]{2}$/.test(delivery)) throw new HttpError(400, 'query, shoppingCountry and deliveryCountry are required');
    const gtin = body.gtin && /^\d{8,14}$/.test(body.gtin) ? body.gtin : undefined;

    const providers: { id: string; status: 'ok' | 'not_configured' | 'unsupported_market' | 'error'; error?: string }[] = [];
    const offers: ProviderOffer[] = [];

    // eBay Browse API: local marketplace and/or global marketplaces depending on mode.
    if (!Deno.env.get('EBAY_CLIENT_ID') || !Deno.env.get('EBAY_CLIENT_SECRET')) {
      providers.push({ id: 'ebay_browse', status: 'not_configured' });
    } else {
      const markets = new Set<string>();
      if (body.mode !== 'global' && EBAY_MARKETPLACES[shopping]) markets.add(shopping);
      if (body.mode !== 'local') ['US', 'GB'].forEach((m) => m !== shopping && markets.add(m));
      if (!markets.size) providers.push({ id: 'ebay_browse', status: 'unsupported_market', error: `No eBay marketplace for ${shopping}` });
      for (const m of markets) {
        try {
          offers.push(...(await searchEbay({ query, gtin, marketplaceCountry: m, deliveryCountry: delivery, postcode: body.postcode })));
          providers.push({ id: `ebay_browse:${m}`, status: 'ok' });
        } catch (err) {
          providers.push({ id: `ebay_browse:${m}`, status: 'error', error: err instanceof Error ? err.message : String(err) });
        }
      }
    }
    return json({ offers, providers, generatedAt: new Date().toISOString() });
  }),
);
