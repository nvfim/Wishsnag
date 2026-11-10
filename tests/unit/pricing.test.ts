import { describe, expect, it } from 'vitest';
import { parseAmount, parsePrice, detectCurrency } from '@/core/pricing/parsePrice';
import { formatMoney, currencyDigits, isCurrencyCode, resolveLocale } from '@/core/pricing/currency';
import { roundMoney, sumMoney, toMinor, subtractMoney } from '@/core/pricing/money';
import { convert, parseFxResponse, isFxStale, fetchFxSnapshot } from '@/core/pricing/exchangeRates';
import { computeTotalCost } from '@/core/pricing/totalCost';
import { compareOffers } from '@/core/pricing/compare';
import { getRetailer } from '@/core/retailers/registry';
import { DAY, NOW, TEST_FX, makeItem, makeOffer } from './helpers';

describe('price parsing', () => {
  it.each([
    ['$1,299.00', 1299],
    ['1.299,00 €', 1299],
    ['৳ ৮,৫০,০০০', 850000],
    ['Tk 8,50,000', 850000],
    ['A$349.95', 349.95],
    ['12,50', 12.5],
    ['1 299 kr', 1299],
    ['From $10', 10],
  ])('parses %s', (text, amount) => {
    expect(parseAmount(text)).toBe(amount);
  });
  it('uses the country to resolve ambiguous symbols', () => {
    expect(detectCurrency('$299', 'AU')).toBe('AUD');
    expect(detectCurrency('$299', 'US')).toBe('USD');
    expect(detectCurrency('$299', null)).toBeNull();
    expect(detectCurrency('৳ 8,500', null)).toBe('BDT');
    expect(detectCurrency('Tk. 8,500', null)).toBe('BDT');
    expect(detectCurrency('AU$ 10', 'US')).toBe('AUD');
    expect(detectCurrency('Rs 500', 'IN')).toBe('INR');
    expect(parsePrice('1.299', 'DE')).toEqual({ amount: 1299, currency: 'EUR' === detectCurrency('1.299', 'DE') ? 'EUR' : null });
  });
});

describe('currency formatting (locale-aware, not hard-coded)', () => {
  it('formats AUD and BDT the way local shoppers expect', () => {
    expect(formatMoney(299, 'AUD', { locale: 'en-AU', homeCurrency: 'AUD' })).toBe('$299');
    expect(formatMoney(349.95, 'AUD', { locale: 'en-AU', homeCurrency: 'AUD' })).toBe('$349.95');
    expect(formatMoney(8500, 'BDT', { locale: 'en-BD', homeCurrency: 'BDT' })).toBe('৳8,500');
    expect(formatMoney(850000, 'BDT', { locale: 'bn-BD', homeCurrency: 'BDT' })).toBe('৮,৫০,০০০৳');
  });
  it('disambiguates foreign dollars', () => {
    expect(formatMoney(10, 'USD', { locale: 'en-AU', homeCurrency: 'AUD' }).replace(/\u00a0/g, ' ')).toBe('USD 10');
    expect(formatMoney(100, 'AUD', { locale: 'en-GB', homeCurrency: 'GBP' })).toBe('A$100');
    expect(formatMoney(12.5, 'GBP', { locale: 'en-GB', homeCurrency: 'GBP' })).toBe('£12.50');
  });
  it('knows minor units and validates ISO codes', () => {
    expect(currencyDigits('JPY')).toBe(0);
    expect(currencyDigits('BDT')).toBe(2);
    expect(currencyDigits('KWD')).toBe(3);
    expect(isCurrencyCode('AUD')).toBe(true);
    expect(isCurrencyCode('XYZ')).toBe(false);
    expect(resolveLocale('bn', 'BD')).toBe('bn-BD');
    expect(resolveLocale('en', 'GB')).toBe('en-GB');
  });
  it('does money maths in minor units', () => {
    expect(sumMoney([0.1, 0.2], 'AUD')).toBe(0.3);
    expect(toMinor(19.99, 'AUD')).toBe(1999);
    expect(roundMoney(1.005, 'AUD')).toBe(1.01);
    expect(subtractMoney(349, 299, 'AUD')).toBe(50);
  });
});

describe('exchange rates', () => {
  const sample = { date: '2026-11-09', usd: { usd: 1, aud: 1.45, bdt: 124.57, gbp: 0.79, eur: 0.92, inr: 88.1, btc: 0.00001, ...Object.fromEntries(['cad', 'sgd', 'aed', 'jpy', 'nzd', 'myr', 'chf', 'cny', 'hkd', 'krw', 'thb', 'php', 'idr', 'pkr', 'lkr', 'npr'].map((c) => [c, 2])) } };
  it('parses the dataset, keeps only ISO currencies and upper-cases codes', () => {
    const fx = parseFxResponse(sample, 'test://x', NOW);
    expect(fx.rates.BDT).toBe(124.57);
    expect(fx.rates.BTC).toBeUndefined();
    expect(fx.date).toBe('2026-11-09');
  });
  it('rejects malformed data instead of guessing', () => {
    expect(() => parseFxResponse({ date: 'yesterday', usd: {} }, 'x')).toThrow();
    expect(() => parseFxResponse({ date: '2026-11-09', usd: { usd: 1, aud: 1.4 } }, 'x')).toThrow(/incomplete/);
  });
  it('converts via USD and marks conversions as approximate', () => {
    const c = convert(150, 'AUD', 'BDT', TEST_FX)!;
    expect(c.amount).toBe(12000);
    expect(c.approximate).toBe(true);
    expect(c.rateDate).toBe('2026-11-08');
    expect(convert(10, 'AUD', 'AUD', null)).toMatchObject({ amount: 10, approximate: false });
    expect(convert(10, 'AUD', 'BDT', null)).toBeNull();
    expect(convert(10, 'AUD', 'XAF', TEST_FX)).toBeNull();
  });
  it('flags stale rates', () => {
    expect(isFxStale(TEST_FX, NOW)).toBe(false);
    expect(isFxStale({ ...TEST_FX, date: '2026-10-01', fetchedAt: NOW - 40 * DAY }, NOW)).toBe(true);
    expect(isFxStale(null, NOW)).toBe(true);
  });
  it('tries the fallback mirror when the primary source fails', async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      if (calls.length === 1) return new Response('nope', { status: 503 });
      return new Response(JSON.stringify(sample), { status: 200 });
    }) as unknown as typeof fetch;
    const fx = await fetchFxSnapshot(fake, NOW);
    expect(calls).toHaveLength(2);
    expect(fx.sourceUrl).toContain('currency-api.pages.dev');
  });
});

describe('comparable total cost', () => {
  it('does not double-count GST that is already included', () => {
    const offer = makeOffer({ price: 449, shippingQuotes: [{ destinationCountry: 'AU', amount: 0, currency: 'AUD', source: 'page', recordedAt: NOW }] });
    const cost = computeTotalCost(offer, 'AU', getRetailer('jb-hifi'))!;
    expect(cost.tax.status).toBe('included');
    expect(cost.knownTotal).toBe(449);
    expect(cost.complete).toBe(true);
  });
  it('marks unknown shipping as incomplete', () => {
    const cost = computeTotalCost(makeOffer({ shippingQuotes: [] }), 'AU')!;
    expect(cost.complete).toBe(false);
    expect(cost.missing).toEqual(['shipping']);
  });
  it('treats international offers as incomplete because import charges are unknown', () => {
    const offer = makeOffer({ retailerId: 'aliexpress', retailerCountry: null, currency: 'USD', price: 200, shippingQuotes: [{ destinationCountry: 'BD', amount: 5, currency: 'USD', source: 'page', recordedAt: NOW }] });
    const cost = computeTotalCost(offer, 'BD', getRetailer('aliexpress'))!;
    expect(cost.eligibility).toBe('international');
    expect(cost.knownTotal).toBe(205);
    expect(cost.missing).toEqual(['import_charges']);
    expect(cost.complete).toBe(false);
  });
  it('treats US listings (tax added at checkout) as incomplete', () => {
    const offer = makeOffer({ retailerId: 'best-buy', retailerCountry: 'US', currency: 'USD', taxIncluded: null, shippingQuotes: [{ destinationCountry: 'US', amount: 0, currency: 'USD', source: 'page', recordedAt: NOW }] });
    expect(computeTotalCost(offer, 'US', getRetailer('best-buy'))!.missing).toEqual(['tax']);
  });
  it('knows domestic-only stores do not deliver abroad', () => {
    expect(computeTotalCost(makeOffer({ retailerId: 'jb-hifi' }), 'BD', getRetailer('jb-hifi'))!.eligibility).toBe('ineligible');
  });
});

describe('cross-retailer comparison', () => {
  const ship = (country: string, amount: number, currency: string) => [{ destinationCountry: country, amount, currency, source: 'user' as const, recordedAt: NOW }];
  const base = { item: makeItem(), shoppingCountry: 'AU', deliveryCountry: 'AU', displayCurrency: 'AUD', fx: TEST_FX, now: NOW, staleAfterMs: 3 * DAY } as const;

  it('ranks only complete, verified, deliverable exact/high matches and words the headline honestly', () => {
    const offers = [
      makeOffer({ id: 'o1', price: 449, shippingQuotes: ship('AU', 0, 'AUD') }),
      makeOffer({ id: 'o2', itemId: 'item1', retailerName: 'Cheaper AU', price: 399, shippingQuotes: ship('AU', 10, 'AUD'), matchConfidence: 'high' }),
      makeOffer({ id: 'o3', retailerName: 'Unknown shipping', price: 350, shippingQuotes: [], matchConfidence: 'verified_exact' }),
      makeOffer({ id: 'o4', retailerName: 'Possible', price: 300, shippingQuotes: ship('AU', 0, 'AUD'), matchConfidence: 'possible' }),
      makeOffer({ id: 'o5', retailerName: 'Variant', price: 250, shippingQuotes: ship('AU', 0, 'AUD'), matchConfidence: 'different_variant' }),
      makeOffer({ id: 'o6', retailerName: 'Stale', price: 380, shippingQuotes: ship('AU', 0, 'AUD'), matchConfidence: 'high', lastVerifiedAt: NOW - 10 * DAY }),
    ];
    const r = compareOffers({ ...base, mode: 'all', offers });
    expect(r.ranked.map((e) => e.offer.id)).toEqual(['o2', 'o1']);
    expect(r.headline).toBe('lowest_verified');
    expect(r.verifiedCount).toBe(2);
    expect(r.cheapest!.offer.id).toBe('o2');
    expect(r.savingsVsOriginal).toMatchObject({ amount: 40, currency: 'AUD', approximate: false, basis: 'total' });
    expect(r.diffToNext).toMatchObject({ amount: 40 });
    const groups = Object.fromEntries(r.entries.map((e) => [e.offer.id, e.group]));
    expect(groups).toMatchObject({ o3: 'incomplete', o4: 'possible', o5: 'variant', o6: 'stale' });
  });

  it('Scenario C — Australian resident delivering to Bangladesh prioritises BD offers and discloses unknown import costs', () => {
    const offers = [
      makeOffer({ id: 'o1', retailerId: 'jb-hifi', retailerCountry: 'AU', price: 449, currency: 'AUD', shippingQuotes: ship('AU', 0, 'AUD') }),
      makeOffer({ id: 'bd1', retailerId: 'star-tech', retailerCountry: 'BD', currency: 'BDT', price: 42000, matchConfidence: 'high', shippingQuotes: ship('BD', 100, 'BDT') }),
      makeOffer({ id: 'ali', retailerId: 'aliexpress', retailerCountry: null, currency: 'USD', price: 230, matchConfidence: 'high', shippingQuotes: ship('BD', 8, 'USD') }),
    ];
    const r = compareOffers({ ...base, deliveryCountry: 'BD', shoppingCountry: 'BD', displayCurrency: 'BDT', mode: 'all', offers });
    expect(r.cheapest!.offer.id).toBe('bd1');
    expect(r.headline).toBe('only_one_verified');
    const ali = r.entries.find((e) => e.offer.id === 'ali')!;
    expect(ali.group).toBe('incomplete');
    expect(ali.cost!.missing).toContain('import_charges');
    expect(r.entries.find((e) => e.offer.id === 'o1')!.group).toBe('ineligible');
  });

  it('uses approximate conversions when ranked offers have mixed currencies', () => {
    const offers = [
      makeOffer({ id: 'o1', retailerCountry: 'GB', currency: 'GBP', price: 80, taxIncluded: true, shippingQuotes: ship('GB', 0, 'GBP') }),
      makeOffer({ id: 'o2', retailerCountry: 'GB', currency: 'EUR', price: 85, taxIncluded: true, matchConfidence: 'high', shippingQuotes: ship('GB', 0, 'EUR') }),
    ];
    const r = compareOffers({ ...base, shoppingCountry: 'GB', deliveryCountry: 'GB', displayCurrency: 'GBP', mode: 'local', offers });
    expect(r.comparisonCurrency).toBe('GBP');
    expect(r.usesConversion).toBe(true);
    expect(r.cheapest!.offer.id).toBe('o2'); // €85 ≈ £75.56 at the test rate
    expect(r.cheapest!.comparable!.approximate).toBe(true);
  });

  it('cannot rank other-currency offers without exchange rates', () => {
    const offers = [
      makeOffer({ id: 'o1', price: 449, shippingQuotes: ship('AU', 0, 'AUD') }),
      makeOffer({ id: 'o2', currency: 'USD', price: 250, matchConfidence: 'high', shippingQuotes: ship('AU', 0, 'USD') }),
    ];
    const r = compareOffers({ ...base, fx: null, mode: 'all', offers });
    expect(r.entries.find((e) => e.offer.id === 'o2')!.group).toBe('incomplete');
  });

  it('filters by Local / Global mode and reports hidden offers', () => {
    const offers = [makeOffer({ id: 'o1', shippingQuotes: ship('AU', 0, 'AUD') }), makeOffer({ id: 'us', retailerCountry: 'US', currency: 'USD', matchConfidence: 'high' })];
    expect(compareOffers({ ...base, mode: 'local', offers }).hiddenByMode).toBe(1);
    const global = compareOffers({ ...base, mode: 'global', offers });
    expect(global.ranked).toHaveLength(0);
    expect(global.original!.offer.id).toBe('o1');
  });

  it('prefers your saved offer on an exact tie', () => {
    const offers = [makeOffer({ id: 'o1', price: 399, shippingQuotes: ship('AU', 0, 'AUD') }), makeOffer({ id: 'o2', price: 399, matchConfidence: 'high', shippingQuotes: ship('AU', 0, 'AUD'), lastVerifiedAt: NOW })];
    const r = compareOffers({ ...base, mode: 'all', offers });
    expect(r.cheapest!.isOriginal).toBe(true);
    expect(r.savingsVsOriginal).toBeNull();
  });

  it('reports no offers truthfully', () => {
    expect(compareOffers({ ...base, mode: 'all', offers: [] }).headline).toBe('no_offers');
  });
});
