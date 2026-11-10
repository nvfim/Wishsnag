// Deno unit tests for server-side helpers: `deno test supabase/functions/tests/`
import { assertEquals } from 'jsr:@std/assert@1';
import { looksBlocked, readPagePrice } from '../_shared/jsonldPrice.ts';
import { searchEbay } from '../_shared/ebay.ts';

Deno.test('readPagePrice reads schema.org Product offers (incl. Bengali digits)', () => {
  const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"X","gtin13":"4548736132610","offers":{"@type":"Offer","price":"৪৫৯৯৯","priceCurrency":"bdt","availability":"https://schema.org/InStock"}}]}</script>`;
  assertEquals(readPagePrice(html), { price: 45999, currency: 'BDT', availability: 'in_stock', gtin: '4548736132610' });
});

Deno.test('readPagePrice falls back to product meta tags and returns null when nothing is published', () => {
  assertEquals(readPagePrice('<meta property="product:price:amount" content="59.99"><meta property="product:price:currency" content="GBP">'), { price: 59.99, currency: 'GBP', availability: 'unknown' });
  assertEquals(readPagePrice('<html><h1>Blog</h1></html>'), null);
});

Deno.test('looksBlocked detects bot challenges', () => {
  assertEquals(looksBlocked('please complete the captcha', 200), true);
  assertEquals(looksBlocked('fine', 429), true);
  assertEquals(looksBlocked('fine', 200), false);
});

Deno.test('searchEbay maps Browse API item summaries (mocked API)', async () => {
  Deno.env.set('EBAY_CLIENT_ID', 'id');
  Deno.env.set('EBAY_CLIENT_SECRET', 'secret');
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: Object.fromEntries(new Headers(init?.headers).entries()) });
    if (url.includes('/oauth2/token')) return Promise.resolve(new Response(JSON.stringify({ access_token: 'tok', expires_in: 7200 })));
    return Promise.resolve(
      new Response(
        JSON.stringify({
          itemSummaries: [
            { title: 'Sony WH-1000XM5 Black', itemWebUrl: 'https://www.ebay.com.au/itm/1', price: { value: '399.00', currency: 'AUD' }, condition: 'New', seller: { username: 'audio_au' }, itemLocation: { country: 'AU' }, shippingOptions: [{ shippingCost: { value: '0.00', currency: 'AUD' } }], image: { imageUrl: 'https://i.ebayimg.com/x.jpg' } },
            { title: 'No price', itemWebUrl: 'https://www.ebay.com.au/itm/2' },
          ],
        }),
      ),
    );
  }) as typeof fetch;
  try {
    const offers = await searchEbay({ query: 'Sony WH-1000XM5', gtin: '04548736132610', marketplaceCountry: 'AU', deliveryCountry: 'AU', postcode: '3000' });
    assertEquals(offers.length, 1);
    assertEquals(offers[0]!.price, 399);
    assertEquals(offers[0]!.shipping, { amount: 0, currency: 'AUD' });
    assertEquals(offers[0]!.retailerName, 'eBay Australia · audio_au');
    const search = calls.find((c) => c.url.includes('item_summary/search'))!;
    assertEquals(search.headers['x-ebay-c-marketplace-id'], 'EBAY_AU');
    assertEquals(new URL(search.url).searchParams.get('gtin'), '4548736132610');
    assertEquals(await searchEbay({ query: 'x', marketplaceCountry: 'BD', deliveryCountry: 'BD' }), []);
  } finally {
    globalThis.fetch = realFetch;
  }
});

import { isSafePublicUrl } from '../_shared/safeUrl.ts';

Deno.test('isSafePublicUrl blocks internal addresses (SSRF guard)', () => {
  for (const ok of ['https://www.jbhifi.com.au/products/x', 'https://www.startech.com.bd/p?x=1', 'http://8.8.8.8/x']) assertEquals(isSafePublicUrl(ok), true, ok);
  for (const bad of ['http://localhost/x', 'http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data', 'http://10.0.0.5/', 'http://192.168.1.1/', 'http://172.20.0.1/', 'http://[::1]/', 'http://2130706433/', 'http://0x7f000001/', 'file:///etc/passwd', 'http://api.internal/x', 'http://user:pw@shop.example.com/', 'http://shop.example.com:6379/', 'http://intranet/'])
    assertEquals(isSafePublicUrl(bad), false, bad);
});
