import { describe, expect, it } from 'vitest';
import { matchProducts, findDuplicates, type Matchable } from '@/core/matching/match';
import { normaliseGtin, extractModelNumbers } from '@/core/matching/identifiers';
import { normaliseDigits, tokenSimilarity, transliterateBengali, searchableText } from '@/core/matching/normalize';
import { extractCapacities, extractColour } from '@/core/matching/attributes';

const p = (title: string, extra: Partial<Matchable> = {}): Matchable => ({ title, identifiers: {}, variant: {}, condition: 'unknown', ...extra });

describe('identifiers', () => {
  it('validates GTIN check digits and pads to GTIN-14', () => {
    expect(normaliseGtin('4548736132610')).toBe('04548736132610');
    expect(normaliseGtin('4548736132611')).toBeNull();
    expect(normaliseGtin('036000291452')).toBe('00036000291452'); // UPC-A
    expect(normaliseGtin('৪৫৪৮৭৩৬১৩২৬১০')).toBe('04548736132610'); // Bengali digits
    expect(normaliseGtin('0000000000000')).toBeNull();
  });
  it('extracts model numbers but not capacities or tech words', () => {
    expect(extractModelNumbers('Sony WH-1000XM5 Wireless 5G 256GB (2024)')).toEqual(['WH1000XM5']);
    expect(extractModelNumbers('Samsung Galaxy S24 Ultra SM-S928B 12GB/256GB')).toEqual(expect.arrayContaining(['SMS928B']));
  });
});

describe('normalisation (Bangla & mixed scripts)', () => {
  it('normalises Bengali digits', () => {
    expect(normaliseDigits('৳ ৪৫,৯৯৯')).toBe('৳ 45,999');
  });
  it('transliterates common Bangla shopping words via the dictionary', () => {
    expect(transliterateBengali('স্যামসাং')).toBe('samsung');
    expect(transliterateBengali('কালো')).toBe('black');
    expect(transliterateBengali('জিবি')).toBe('gb');
  });
  it('makes Bangla titles comparable with English ones', () => {
    expect(tokenSimilarity('স্যামসাং গ্যালাক্সি A55 5G ৮/২৫৬ জিবি', 'Samsung Galaxy A55 5G 8/256GB')).toBeGreaterThan(0.5);
    expect(searchableText(['স্যামসাং ফোন'])).toContain('samsung');
  });
  it('reads capacities and colours in both scripts', () => {
    expect(extractCapacities('iPhone 15 Pro 256GB')).toEqual({ storage: '256GB' });
    expect(extractCapacities('Redmi Note 13 (8+256GB)')).toEqual({ memory: '8GB', storage: '256GB' });
    expect(extractCapacities('MacBook Air 16GB unified memory 512GB SSD')).toEqual({ memory: '16GB', storage: '512GB' });
    expect(extractCapacities('ফোন ৮/২৫৬ জিবি')).toEqual({ memory: '8GB', storage: '256GB' });
    expect(extractColour('Linen Overshirt in Space Gray')).toBe('space grey');
    expect(extractColour('স্যামসাং ফোন নীল')).toBe('blue');
  });
});

describe('product matching confidence', () => {
  const xm5 = p('Sony WH-1000XM5 Wireless Noise Cancelling Headphones - Black', { brand: 'Sony', identifiers: { gtin: '4548736132610', mpn: 'WH1000XM5B' }, condition: 'new' });

  it('same GTIN → Verified Exact Match', () => {
    const other = p('WH1000XM5 Headphones Black', { brand: 'SONY', identifiers: { gtin: '04548736132610' }, condition: 'new' });
    expect(matchProducts(xm5, other).confidence).toBe('verified_exact');
  });

  it('same brand + model number → High-Confidence Match', () => {
    const other = p('Sony WH-1000XM5 Over-Ear Bluetooth Headphones (Black)', { brand: 'Sony' });
    const r = matchProducts(xm5, other);
    expect(r.confidence).toBe('high');
    expect(r.reasons).toContain('model_in_title');
  });

  it('never ranks an older generation as identical', () => {
    const xm4 = p('Sony WH-1000XM4 Wireless Noise Cancelling Headphones - Black', { brand: 'Sony' });
    expect(matchProducts(xm5, xm4).confidence).not.toBe('high');
    expect(matchProducts(xm5, xm4).confidence).not.toBe('verified_exact');
  });

  it('different storage → Different Variant', () => {
    const a = p('Apple iPhone 15 Pro 256GB Natural Titanium', { brand: 'Apple' });
    const b = p('Apple iPhone 15 Pro 512GB Natural Titanium', { brand: 'Apple' });
    const r = matchProducts(a, b);
    expect(r.confidence).toBe('different_variant');
    expect(r.conflicts).toContain('storage');
  });

  it('Pro vs non-Pro → not the same product', () => {
    const a = p('Apple iPhone 15 Pro 256GB Blue', { brand: 'Apple' });
    const b = p('Apple iPhone 15 256GB Blue', { brand: 'Apple' });
    const r = matchProducts(a, b);
    expect(r.confidence).toBe('different_variant');
    expect(r.conflicts).toContain('line_qualifier');
  });

  it('regional model codes → Different Variant', () => {
    const a = p('Samsung Galaxy S24 Ultra SM-S928B 12/256GB Titanium Black', { brand: 'Samsung' });
    const b = p('Samsung Galaxy S24 Ultra SM-S928U 12/256GB Titanium Black', { brand: 'Samsung' });
    const r = matchProducts(a, b);
    expect(r.confidence).toBe('different_variant');
    expect(r.conflicts).toContain('regional_model');
  });

  it('refurbished vs new → Different Variant even with the same GTIN', () => {
    const refurb = p('Sony WH-1000XM5 (Renewed)', { identifiers: { gtin: '4548736132610' }, condition: 'refurbished' });
    expect(matchProducts(xm5, refurb).confidence).toBe('different_variant');
  });

  it('different brand → no match', () => {
    const bose = p('Bose QuietComfort Ultra Headphones Black', { brand: 'Bose' });
    expect(matchProducts(xm5, bose).confidence).toBeNull();
  });

  it('Bangla title vs English title of the same phone → a match (not exact)', () => {
    const bn = p('স্যামসাং গ্যালাক্সি A55 5G ৮/২৫৬ জিবি নীল');
    const en = p('Samsung Galaxy A55 5G (8/256GB) Blue', { brand: 'Samsung' });
    const r = matchProducts(en, bn);
    expect(['high', 'possible']).toContain(r.confidence);
    expect(r.confidence).not.toBe('verified_exact');
  });

  it('Bangla title with different storage → Different Variant', () => {
    const bn = p('স্যামসাং গ্যালাক্সি A55 5G ৮/১২৮ জিবি নীল');
    const en = p('Samsung Galaxy A55 5G (8/256GB) Blue', { brand: 'Samsung' });
    expect(matchProducts(en, bn).confidence).toBe('different_variant');
  });

  it('duplicate detection reports same listing and exact matches, not variants', () => {
    const existing = [
      { ...xm5, id: '1', urlKeys: ['https://shop.example/xm5'] },
      { ...p('Sony WH-1000XM5 - Silver', { brand: 'Sony', variant: { colour: 'silver' } }), id: '2', urlKeys: [] },
    ];
    const dupes = findDuplicates({ ...xm5, urlKey: 'https://shop.example/xm5' }, existing);
    expect(dupes.map((d) => d.item.id)).toEqual(['1']);
    expect(dupes[0]!.sameListing).toBe(true);
  });
});
