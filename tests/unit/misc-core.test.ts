import { describe, expect, it } from 'vitest';
import { en } from '@/core/i18n/en';
import { bn } from '@/core/i18n/bn';
import { createTranslator } from '@/core/i18n';
import { parseCsv, escapeCell, toCsv } from '@/core/importExport/csv';
import { csvTemplate, csvToDrafts, itemsToCsv } from '@/core/importExport/wishlistCsv';
import { buildExportBundle, parseExportBundle } from '@/core/importExport/json';
import { defaultSettings, normaliseSettings } from '@/core/settings';
import { COUNTRY_CURRENCY, countryOptions, defaultCurrencyFor, guessCountry } from '@/core/geo/countries';
import { BD_DIVISIONS, addressFormat, isValidPostcode } from '@/core/geo/regions';
import { RETAILERS, retailerForUrl, countryFromHostname, deliveryEligibility, getRetailer, searchLink } from '@/core/retailers/registry';
import { draftFromInput } from '@/core/draft';
import { normaliseProductUrl, safeUrl } from '@/core/util/url';
import { makeItem, makeOffer, obs } from './helpers';

describe('i18n', () => {
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  it('Bangla covers every English key with matching placeholders', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(bn[key], key).toBeTruthy();
      expect(placeholders(bn[key]), key).toEqual(placeholders(en[key]));
    }
  });
  it('interpolates and pluralises, using Bengali digits in Bangla', () => {
    expect(createTranslator('en').plural('items_count', 1)).toBe('1 item');
    expect(createTranslator('en').plural('items_count', 3)).toBe('3 items');
    expect(createTranslator('bn').plural('items_count', 3)).toBe('৩টি আইটেম');
  });
});

describe('global country & region support', () => {
  it('maps every country to a currency, with AU/BD first', () => {
    expect(defaultCurrencyFor('AU')).toBe('AUD');
    expect(defaultCurrencyFor('BD')).toBe('BDT');
    expect(defaultCurrencyFor('GB')).toBe('GBP');
    expect(Object.keys(COUNTRY_CURRENCY).length).toBeGreaterThan(240);
    expect(countryOptions('en').slice(0, 2).map((c) => c.code)).toEqual(['AU', 'BD']);
    expect(countryOptions('bn')[0]!.name).toBe('অস্ট্রেলিয়া');
  });
  it('has 8 divisions and 64 districts for Bangladesh', () => {
    expect(BD_DIVISIONS).toHaveLength(8);
    expect(BD_DIVISIONS.flatMap((d) => d.districts)).toHaveLength(64);
  });
  it('validates postcodes per country', () => {
    expect(isValidPostcode('AU', '3000')).toBe(true);
    expect(isValidPostcode('AU', '30000')).toBe(false);
    expect(isValidPostcode('BD', '1207')).toBe(true);
    expect(isValidPostcode('GB', 'SW1A 1AA')).toBe(true);
    expect(addressFormat('BD').fields).toContain('zone');
  });
  it('guesses (never hard-codes) the country for onboarding', () => {
    expect(guessCountry('Australia/Melbourne')).toBe('AU');
    expect(guessCountry('Asia/Dhaka')).toBe('BD');
    expect(guessCountry('Europe/London')).toBe('GB');
    expect(guessCountry('America/Chicago', ['en-US'])).toBe('US');
    expect(defaultSettings({ timeZone: 'Asia/Dhaka', languages: ['bn-BD'] })).toMatchObject({ residenceCountry: 'BD', displayCurrency: 'BDT', language: 'bn', onboarded: false });
    expect(defaultSettings({ timeZone: 'Europe/London', languages: ['en-GB'] })).toMatchObject({ residenceCountry: 'GB', displayCurrency: 'GBP' });
  });
  it('repairs invalid stored settings section by section', () => {
    const s = normaliseSettings({ residenceCountry: 'ZZ', displayCurrency: 'BDT', alerts: { minDropPercent: 3 } });
    expect(s.displayCurrency).toBe('BDT');
    expect(s.alerts.minDropPercent).toBe(3);
    expect(s.residenceCountry).not.toBe('ZZ');
  });
});

describe('retailer registry', () => {
  it('distinguishes regional storefronts on shared domains', () => {
    expect(retailerForUrl('https://www.nike.com/au/t/air-max')?.id).toBe('nike-au');
    expect(retailerForUrl('https://www.nike.com/gb/t/air-max')?.id).toBe('nike-global');
    expect(retailerForUrl('https://www.asos.com/au/men/')?.id).toBe('asos-au');
    expect(retailerForUrl('https://www.asos.com/men/')?.id).toBe('asos-uk');
    expect(retailerForUrl('https://www.daraz.com.bd/products/x.html')?.id).toBe('daraz-bd');
    expect(retailerForUrl('https://unknown-store.example/p')).toBeUndefined();
  });
  it('covers the launch retailers for both priority markets', () => {
    const au = RETAILERS.filter((r) => r.country === 'AU').map((r) => r.id);
    const bdIds = RETAILERS.filter((r) => r.country === 'BD').map((r) => r.id);
    for (const id of ['amazon-au', 'ebay-au', 'jb-hifi', 'harvey-norman', 'the-good-guys', 'officeworks', 'the-iconic', 'myer', 'david-jones', 'kmart-au', 'target-au', 'big-w', 'nike-au', 'adidas-au', 'asos-au', 'uniqlo-au']) expect(au).toContain(id);
    for (const id of ['daraz-bd', 'pickaboo', 'rokomari', 'star-tech', 'ryans', 'gadget-and-gear', 'aarong']) expect(bdIds).toContain(id);
  });
  it('never marks an unverified capability as operational', () => {
    for (const r of RETAILERS) for (const status of Object.values(r.capabilities)) expect(status).not.toBe('operational');
  });
  it('infers countries from ccTLDs and computes delivery eligibility', () => {
    expect(countryFromHostname('shop.example.com.au')).toBe('AU');
    expect(countryFromHostname('example.co.uk')).toBe('GB');
    expect(countryFromHostname('example.io')).toBeNull();
    expect(deliveryEligibility(getRetailer('jb-hifi'), 'AU', 'AU')).toBe('domestic');
    expect(deliveryEligibility(getRetailer('jb-hifi'), 'AU', 'BD')).toBe('ineligible');
    expect(deliveryEligibility(getRetailer('aliexpress'), null, 'BD')).toBe('international');
    expect(deliveryEligibility(undefined, null, 'BD')).toBe('unknown');
    expect(searchLink(getRetailer('star-tech')!, 'Galaxy A55')).toBe('https://www.startech.com.bd/product/search?search=Galaxy%20A55');
  });
});

describe('URLs & drafts', () => {
  it('normalises product URLs for duplicate detection', () => {
    expect(normaliseProductUrl('https://www.Shop.com.au/p/x/?utm_source=a&color=red&fbclid=1#reviews')).toBe('https://shop.com.au/p/x?color=red');
    expect(normaliseProductUrl('https://www.amazon.com.au/Sony-Headphones/dp/B09XS7JWHH/ref=sr_1_1?keywords=x')).toBe('https://amazon.com.au/dp/B09XS7JWHH');
    expect(safeUrl('javascript:alert(1)')).toBeUndefined();
  });
  it('validates manual entries (Scenario E — unsupported retailer)', () => {
    const bad = draftFromInput({ title: '  ', url: 'not a url', price: 10, currency: null });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors)).toEqual(expect.arrayContaining(['title', 'url']));
    const good = draftFromInput({ title: 'Handmade mug', url: 'https://tiny-pottery.example/mug', price: 35, currency: 'nzd', targetPrice: 30, tags: ['Gift', 'gift', ' home '] });
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.draft.currency).toBe('NZD');
      expect(good.draft.tags).toEqual(['gift', 'home']);
      expect(good.draft.retailer).toMatchObject({ id: null, domain: 'tiny-pottery.example' });
    }
  });
});

describe('CSV & JSON import/export', () => {
  it('round-trips CSV including quotes, commas, newlines and Bangla', () => {
    const csv = toCsv(['a', 'b'], [['x, "y"', 'লাইন ১\nলাইন ২']]);
    expect(parseCsv(csv)).toEqual([['a', 'b'], ['x, "y"', 'লাইন ১\nলাইন ২']]);
  });
  it('neutralises spreadsheet formula injection', () => {
    expect(escapeCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(escapeCell('-12.5')).toBe('-12.5');
  });
  it('imports the CSV template and reports row errors', () => {
    const rows = csvToDrafts(csvTemplate());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.draft).toMatchObject({ title: 'Sony WH-1000XM5 Wireless Headphones', price: 449, currency: 'AUD', targetPrice: 379, priority: 'high', tags: ['audio', 'gift'] });
    expect(rows[0]!.collectionNames).toEqual(['Tech I Want']);
    const bad = csvToDrafts('title,price,currency\n,10,AUD\nOk,abc,AUD\n');
    expect(bad.map((r) => !!r.error)).toEqual([true, true]);
  });
  it('exports items to CSV', () => {
    const csv = itemsToCsv([makeItem()], new Map([['o1', makeOffer()]]), []);
    expect(csv.split('\r\n')[1]).toContain('Sony WH-1000XM5 Wireless Headphones Black');
  });
  it('validates JSON backups and drops orphans and unsafe URLs', () => {
    const bundle = buildExportBundle({ items: [makeItem()], offers: [makeOffer({ url: 'javascript:alert(1)' }), makeOffer({ id: 'orphan', itemId: 'nope' })], observations: [obs(449, 1), obs(1, 1, { offerId: 'zzz' })], collections: [], alerts: [] }, '0.1.0');
    const parsed = parseExportBundle(JSON.parse(JSON.stringify(bundle)));
    expect(parsed.items).toHaveLength(1);
    expect(parsed.offers).toHaveLength(1);
    expect(parsed.offers[0]!.url).toBe('');
    expect(parsed.observations).toHaveLength(1);
    expect(() => parseExportBundle({ format: 'other' })).toThrow();
  });
});
