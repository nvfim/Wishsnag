import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { collectFromDocument } from '@/core/extraction/domCollector';
import { collectFromHtml, looksLikeBotChallenge } from '@/core/extraction/htmlString';
import { extractProduct } from '@/core/extraction/extractProduct';
import { parseJsonLdBlock } from '@/core/extraction/jsonld';
import { adapterFor } from '@/core/retailers/adapters';
import { retailerForUrl } from '@/core/retailers/registry';

const fixture = (name: string) => readFileSync(join(process.cwd(), 'tests/fixtures/pages', name), 'utf8');

function fromDom(name: string, url: string, mode: 'product' | 'list' = 'product') {
  const dom = new JSDOM(fixture(name), { url });
  const retailer = retailerForUrl(url);
  return extractProduct(collectFromDocument(dom.window.document, { mode, adapter: adapterFor(retailer?.id) }));
}

describe('layered extraction — Australia', () => {
  const url = 'https://www.fixture-electronics.com.au/products/sony-wh1000xm5-black?utm_source=newsletter';
  const result = fromDom('au-headphones.html', url);

  it('reads the product from schema.org JSON-LD (@graph)', () => {
    expect(result.status).toBe('product');
    expect(result.methods).toContain('json_ld');
    expect(result.product.title).toBe('Sony WH-1000XM5 Wireless Noise Cancelling Headphones (Black)');
    expect(result.product.brand).toBe('Sony');
    expect(result.product.identifiers.gtin).toBe('04548736132610');
    expect(result.product.identifiers.mpn).toBe('WH1000XM5B');
    expect(result.product.category).toBe('Headphones');
    expect(result.product.variant.colour).toBe('black');
  });

  it('reads price, list price, stock, condition, tax and shipping', () => {
    expect(result.offer.price).toBe(449);
    expect(result.offer.currency).toBe('AUD');
    expect(result.offer.listPrice).toBe(549);
    expect(result.offer.availability).toBe('in_stock');
    expect(result.offer.condition).toBe('new');
    expect(result.offer.taxIncluded).toBe(true);
    expect(result.offer.shippingQuotes).toEqual([{ destinationCountry: 'AU', amount: 0, currency: 'AUD', source: 'page' }]);
    expect(result.offer.seller).toBe('Fixture Electronics AU');
  });

  it('resolves relative URLs and infers the country from the .com.au domain', () => {
    expect(result.canonicalUrl).toBe('https://www.fixture-electronics.com.au/products/sony-wh1000xm5-black');
    expect(result.product.imageUrl).toBe('https://www.fixture-electronics.com.au/img/wh1000xm5.jpg');
    expect(result.retailer.country).toBe('AU');
    expect(result.retailer.name).toBe('Fixture Electronics AU');
    expect(result.heuristicFields).toEqual([]);
  });

  it('gives the same structured result from an HTML string (service-worker path)', () => {
    const s = extractProduct(collectFromHtml(fixture('au-headphones.html'), url));
    expect(s.product.title).toBe(result.product.title);
    expect(s.offer.price).toBe(449);
    expect(s.offer.currency).toBe('AUD');
    expect(s.product.identifiers.gtin).toBe('04548736132610');
    expect(s.canonicalUrl).toBe(result.canonicalUrl);
  });

  it('recognises registry retailers by domain', () => {
    const jb = fromDom('au-headphones.html', 'https://www.jbhifi.com.au/products/sony-wh1000xm5');
    expect(jb.retailer.id).toBe('jb-hifi');
    expect(jb.retailer.name).toBe('JB Hi-Fi');
  });
});

describe('layered extraction — Bangladesh', () => {
  it('parses Bengali digits in a structured price and reads BDT, payment methods and delivery', () => {
    const r = fromDom('bd-phone.html', 'https://www.fixture-tech.com.bd/samsung-galaxy-a55');
    expect(r.status).toBe('product');
    expect(r.offer.price).toBe(45999);
    expect(r.offer.currency).toBe('BDT');
    expect(r.offer.paymentMethods).toEqual(['Cash on delivery', 'bKash']);
    expect(r.offer.shippingQuotes[0]).toMatchObject({ destinationCountry: 'BD', amount: 60, currency: 'BDT' });
    expect(r.product.variant).toMatchObject({ memory: '8GB', storage: '256GB' });
    expect(r.product.model).toBe('SM-A556E');
    expect(r.retailer.country).toBe('BD');
  });

  it('falls back to visible page text for a Bangla-only page and flags it for review', () => {
    const r = fromDom('bd-bangla-title.html', 'https://shop.fixture.com.bd/p/123');
    expect(r.status).toBe('partial');
    expect(r.product.title).toBe('স্যামসাং গ্যালাক্সি A55 5G ৮/২৫৬ জিবি - নীল');
    expect(r.offer.price).toBe(45999);
    expect(r.offer.currency).toBe('BDT');
    expect(r.heuristicFields).toEqual(expect.arrayContaining(['title', 'price']));
    expect(r.product.variant).toMatchObject({ storage: '256GB', memory: '8GB', colour: 'blue' });
    expect(r.methods).toContain('visible_page');
  });

  it('uses the Daraz adapter selectors only as a heuristic layer', () => {
    const html = '<html><head><title>x</title></head><body><h1 class="pdp-mod-product-badge-title">Xiaomi Redmi Note 13 (8/256)</h1><span class="pdp-price pdp-price_type_normal">৳ 24,999</span><span class="pdp-price_type_deleted">৳ 27,999</span></body></html>';
    const dom = new JSDOM(html, { url: 'https://www.daraz.com.bd/products/redmi-note-13-i123.html' });
    const r = extractProduct(collectFromDocument(dom.window.document, { adapter: adapterFor('daraz-bd') }));
    expect(r.retailer.id).toBe('daraz-bd');
    expect(r.methods).toContain('retailer_adapter');
    expect(r.offer.price).toBe(24999);
    expect(r.offer.listPrice).toBe(27999);
    expect(r.offer.currency).toBe('BDT');
    expect(r.heuristicFields).toContain('price');
  });
});

describe('layered extraction — other markets & fallbacks', () => {
  it('reads Open Graph product tags (United Kingdom, GBP)', () => {
    const r = fromDom('uk-og-only.html', 'https://www.fixture-fashion.co.uk/linen-overshirt');
    expect(r.methods).toContain('open_graph');
    expect(r.status).toBe('product');
    expect(r.offer.price).toBe(59.99);
    expect(r.offer.currency).toBe('GBP');
    expect(r.offer.availability).toBe('in_stock');
    expect(r.product.brand).toBe('Fixture Label');
    expect(r.retailer.country).toBe('GB');
  });

  it('reads schema.org microdata including nested brand and offer', () => {
    const r = fromDom('microdata.html', 'https://fixture-home.example/lamp');
    expect(r.methods).toContain('microdata');
    expect(r.product.title).toBe('Halo LED Desk Lamp');
    expect(r.product.brand).toBe('Fixture Home');
    expect(r.product.identifiers.gtin).toBe('04006381333931');
    expect(r.offer.price).toBe(39.5);
    expect(r.offer.currency).toBe('USD');
    expect(r.offer.availability).toBe('out_of_stock');
  });

  it('does not invent a product on an unsupported page but pre-fills manual entry', () => {
    const r = fromDom('unsupported.html', 'https://blog.example.com/reading-nooks');
    expect(r.status).toBe('none');
    expect(r.offer.price).toBeNull();
    expect(r.offer.currency).toBeNull();
    expect(r.methods).toContain('manual');
    expect(r.product.title).toBe("10 cosy reading nooks you'll love");
    expect(r.product.imageUrl).toBe('https://fixture-cdn.example/nook.jpg');
  });

  it('lists ProductGroup variants and does not pick a price when variants differ', () => {
    const r = fromDom('variants.html', 'https://fixture.example/er2');
    expect(r.variants).toHaveLength(2);
    expect(r.variants[0]).toMatchObject({ label: 'Everyday Runner 2 - White / US 9', price: 159.95, availability: 'in_stock' });
    expect(r.offer.price).toBeNull();
    expect(r.warnings).toContain('variant_price_differs');
  });

  it('selects the variant matching the page URL', () => {
    const r = fromDom('variants.html', 'https://fixture.example/er2?variant=b9');
    expect(r.offer.price).toBe(139.95);
    expect(r.offer.availability).toBe('out_of_stock');
    expect(r.product.variant.colour).toBe('black');
  });

  it('finds list items for wishlist import from ItemList + product cards, without nav links', () => {
    const r = fromDom('wishlist.html', 'https://fixture.example/wishlist/abc', 'list');
    expect(r.status).toBe('none'); // a list page is not itself a product
    const titles = r.listItems.map((i) => i.title);
    expect(titles).toEqual(['Nintendo Switch OLED Console', 'Logitech MX Master 3S Mouse', 'Kindle Paperwhite (16 GB)']);
    expect(r.listItems[0]).toMatchObject({ price: 539, currency: 'AUD', method: 'json_ld' });
    expect(r.listItems[2]).toMatchObject({ price: 269, currency: 'AUD', method: 'visible_page', url: 'https://fixture.example/p/kindle-paperwhite' });
  });
});

describe('JSON-LD robustness & safety', () => {
  it('repairs trailing commas and raw newlines', () => {
    expect(parseJsonLdBlock('{"@type":"Product","name":"A\nB",}')).toEqual([{ '@type': 'Product', name: 'A\nB' }]);
  });
  it('ignores invalid JSON', () => {
    expect(parseJsonLdBlock('{not json')).toEqual([]);
  });
  it('strips markup from names and refuses javascript: URLs', () => {
    const html = `<html><head><script type="application/ld+json">{"@type":"Product","name":"<img src=x onerror=alert(1)>Nice &amp; Cheap","image":"javascript:alert(1)","offers":{"price":"10","priceCurrency":"USD"}}</script></head><body></body></html>`;
    const r = extractProduct(collectFromHtml(html, 'https://evil.example/p'));
    expect(r.product.title).toBe('Nice & Cheap');
    expect(r.product.imageUrl).toBeUndefined();
  });
  it('detects bot challenges so checks back off', () => {
    expect(looksLikeBotChallenge('<html>Please complete the captcha</html>', 200)).toBe(true);
    expect(looksLikeBotChallenge('<html>ok</html>', 429)).toBe(true);
    expect(looksLikeBotChallenge('<html>product</html>', 200)).toBe(false);
  });
});
