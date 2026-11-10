/**
 * Text normalisation for product matching across English, Bangla (Bengali script) and
 * mixed-language titles.
 *
 * Strategy:
 * 1. Unicode NFKC, lower-case, and digit normalisation (Bengali ০-৯, Devanagari ०-९,
 *    Arabic-Indic ٠-٩ → 0-9).
 * 2. A curated dictionary transliterates common Bangla shopping vocabulary — brand
 *    names, units, colours, product words — into their English equivalents
 *    ("স্যামসাং" → "samsung", "জিবি" → "gb", "কালো" → "black").
 * 3. Remaining Bengali-script words are transliterated phonetically to Latin so that
 *    loose similarity still works; these tokens are flagged as low-weight.
 * Identifiers and model numbers are always matched separately (see identifiers.ts),
 * so matching never relies solely on title similarity.
 */

const DIGIT_RANGES: [number, number][] = [
  [0x09e6, 0x09ef], // Bengali
  [0x0966, 0x096f], // Devanagari
  [0x0660, 0x0669], // Arabic-Indic
  [0x06f0, 0x06f9], // Extended Arabic-Indic
  [0xff10, 0xff19], // Fullwidth
];

export function normaliseDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    const range = DIGIT_RANGES.find(([start, end]) => code >= start && code <= end);
    out += range ? String(code - range[0]) : ch;
  }
  return out;
}

export function containsBengali(input: string): boolean {
  return /[ঀ-৿]/.test(input);
}

/** Curated Bangla → English shopping vocabulary (brands, units, colours, product words). */
export const BANGLA_DICTIONARY: Readonly<Record<string, string>> = {
  // Brands
  'স্যামসাং': 'samsung', 'স্যামসাঙ': 'samsung', 'অ্যাপল': 'apple', 'এপল': 'apple', 'আইফোন': 'iphone', 'আইপ্যাড': 'ipad',
  'ম্যাকবুক': 'macbook', 'এয়ারপডস': 'airpods', 'এয়ারপড': 'airpods', 'শাওমি': 'xiaomi', 'শাওমির': 'xiaomi', 'রেডমি': 'redmi',
  'পোকো': 'poco', 'রিয়েলমি': 'realme', 'অপো': 'oppo', 'ভিভো': 'vivo', 'ওয়ানপ্লাস': 'oneplus', 'হুয়াওয়ে': 'huawei',
  'অনার': 'honor', 'নোকিয়া': 'nokia', 'মটোরোলা': 'motorola', 'গুগল': 'google', 'পিক্সেল': 'pixel', 'সনি': 'sony',
  'ওয়ালটন': 'walton', 'সিম্ফনি': 'symphony', 'টেকনো': 'tecno', 'ইনফিনিক্স': 'infinix', 'আইটেল': 'itel',
  'আসুস': 'asus', 'এসার': 'acer', 'লেনোভো': 'lenovo', 'ডেল': 'dell', 'এইচপি': 'hp', 'এমএসআই': 'msi', 'এলজি': 'lg',
  'শার্প': 'sharp', 'প্যানাসনিক': 'panasonic', 'ফিলিপস': 'philips', 'জেবিএল': 'jbl', 'বোস': 'bose', 'অ্যাংকার': 'anker',
  'নাইকি': 'nike', 'নাইক': 'nike', 'অ্যাডিডাস': 'adidas', 'পুমা': 'puma', 'বাটা': 'bata', 'আড়ং': 'aarong', 'ক্যানন': 'canon', 'নিকন': 'nikon',
  'ইউনিক্লো': 'uniqlo', 'লজিটেক': 'logitech', 'রেজার': 'razer', 'প্লেস্টেশন': 'playstation', 'এক্সবক্স': 'xbox', 'নিনটেন্ডো': 'nintendo',
  // Product words
  'ফোন': 'phone', 'মোবাইল': 'mobile', 'স্মার্টফোন': 'smartphone', 'ল্যাপটপ': 'laptop', 'ট্যাবলেট': 'tablet', 'ঘড়ি': 'watch',
  'স্মার্টওয়াচ': 'smartwatch', 'হেডফোন': 'headphones', 'ইয়ারফোন': 'earphones', 'ইয়ারবাড': 'earbuds', 'স্পিকার': 'speaker',
  'টিভি': 'tv', 'মনিটর': 'monitor', 'কিবোর্ড': 'keyboard', 'কীবোর্ড': 'keyboard', 'মাউস': 'mouse', 'ক্যামেরা': 'camera',
  'চার্জার': 'charger', 'ক্যাবল': 'cable', 'কেবল': 'cable', 'পাওয়ার': 'power', 'ব্যাংক': 'bank', 'রাউটার': 'router',
  'ফ্রিজ': 'fridge', 'রেফ্রিজারেটর': 'refrigerator', 'এসি': 'ac', 'ওয়াশিং': 'washing', 'মেশিন': 'machine', 'ব্লেন্ডার': 'blender',
  'জুতা': 'shoes', 'জুতো': 'shoes', 'স্নিকার': 'sneaker', 'স্নিকার্স': 'sneakers', 'শার্ট': 'shirt', 'টি-শার্ট': 't-shirt',
  'প্যান্ট': 'pants', 'জিন্স': 'jeans', 'শাড়ি': 'saree', 'পাঞ্জাবি': 'panjabi', 'কুর্তা': 'kurta', 'ব্যাগ': 'bag',
  'বই': 'book', 'প্রো': 'pro', 'ম্যাক্স': 'max', 'আল্ট্রা': 'ultra', 'প্লাস': 'plus', 'মিনি': 'mini', 'লাইট': 'lite', 'এজ': 'edge',
  'ওয়্যারলেস': 'wireless', 'ব্লুটুথ': 'bluetooth', 'গেমিং': 'gaming', 'নতুন': 'new', 'রিফার্বিশড': 'refurbished', 'ব্যবহৃত': 'used',
  'অরিজিনাল': 'original', 'অফিসিয়াল': 'official', 'ইন্টারন্যাশনাল': 'international', 'ভার্সন': 'version', 'সংস্করণ': 'version',
  // Units
  'জিবি': 'gb', 'টিবি': 'tb', 'এমবি': 'mb', 'ইঞ্চি': 'inch', 'মিমি': 'mm', 'এমএএইচ': 'mah', 'ওয়াট': 'w', 'র‍্যাম': 'ram', 'র্যাম': 'ram',
  'রম': 'rom', 'স্টোরেজ': 'storage', 'সাইজ': 'size', 'রং': 'colour', 'রঙ': 'colour', 'কালার': 'colour', 'প্রজন্ম': 'generation', 'জেনারেশন': 'generation',
  // Colours
  'কালো': 'black', 'সাদা': 'white', 'নীল': 'blue', 'লাল': 'red', 'সবুজ': 'green', 'হলুদ': 'yellow', 'গোলাপি': 'pink',
  'বেগুনি': 'purple', 'ধূসর': 'grey', 'ছাই': 'grey', 'সোনালি': 'gold', 'সোনালী': 'gold', 'রুপালি': 'silver', 'রূপালী': 'silver',
  'কমলা': 'orange', 'বাদামি': 'brown', 'আকাশি': 'sky blue', 'নেভি': 'navy', 'মিডনাইট': 'midnight', 'টাইটানিয়াম': 'titanium',
};

// Phonetic fallback (very approximate; used only for low-weight similarity tokens).
const CONSONANTS: Record<string, string> = {
  'ক': 'k', 'খ': 'kh', 'গ': 'g', 'ঘ': 'gh', 'ঙ': 'ng', 'চ': 'ch', 'ছ': 'chh', 'জ': 'j', 'ঝ': 'jh', 'ঞ': 'n',
  'ট': 't', 'ঠ': 'th', 'ড': 'd', 'ঢ': 'dh', 'ণ': 'n', 'ত': 't', 'থ': 'th', 'দ': 'd', 'ধ': 'dh', 'ন': 'n',
  'প': 'p', 'ফ': 'f', 'ব': 'b', 'ভ': 'bh', 'ম': 'm', 'য': 'j', 'র': 'r', 'ল': 'l', 'শ': 'sh', 'ষ': 'sh',
  'স': 's', 'হ': 'h', 'ড়': 'r', 'ঢ়': 'rh', 'য়': 'y', 'ৎ': 't', 'ং': 'ng', 'ঃ': 'h', 'ঁ': '',
};
const VOWELS: Record<string, string> = { 'অ': 'o', 'আ': 'a', 'ই': 'i', 'ঈ': 'i', 'উ': 'u', 'ঊ': 'u', 'ঋ': 'ri', 'এ': 'e', 'ঐ': 'oi', 'ও': 'o', 'ঔ': 'ou' };
const SIGNS: Record<string, string> = { 'া': 'a', 'ি': 'i', 'ী': 'i', 'ু': 'u', 'ূ': 'u', 'ৃ': 'ri', 'ে': 'e', 'ৈ': 'oi', 'ো': 'o', 'ৌ': 'ou', '্': '' };

export function transliterateBengali(word: string): string {
  const nfc = word.normalize('NFC');
  const dict = BANGLA_DICTIONARY[nfc];
  if (dict) return dict;
  let out = '';
  const chars = [...nfc];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] ?? '';
    const next = chars[i + 1] ?? '';
    if (CONSONANTS[ch] !== undefined) {
      out += CONSONANTS[ch];
      // Inherent vowel unless followed by a vowel sign, virama or end of word.
      if (next && SIGNS[next] === undefined && CONSONANTS[next] !== undefined && i + 1 < chars.length - 1) out += 'o';
    } else if (VOWELS[ch] !== undefined) out += VOWELS[ch];
    else if (SIGNS[ch] !== undefined) out += SIGNS[ch];
    else if (/[a-z0-9]/i.test(ch)) out += ch.toLowerCase();
  }
  return out;
}

export function normaliseText(input: string): string {
  return normaliseDigits(input.normalize('NFKC'))
    .toLowerCase()
    .replace(/[’'`´]/g, '')
    .replace(/[^\p{L}\p{N}\p{M}+.\-/ ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Token {
  value: string;
  /** Lower weight for phonetic Bengali fallbacks. */
  weight: number;
}

const STOPWORDS = new Set([
  'the', 'and', 'with', 'for', 'of', 'a', 'an', 'in', 'by', 'to', 'new', 'original', 'official', 'genuine', 'brand', 'free',
  'shipping', 'delivery', 'sale', 'best', 'price', 'buy', 'online', 'bd', 'australia', 'au', 'bangladesh', 'edition', 'version',
  'international', 'warranty', 'year', 'years', 'authentic', '-', '/', 'এবং', 'সহ', 'জন্য',
]);

/** Splits a title into normalised tokens, transliterating Bengali words. */
export function tokenize(input: string): Token[] {
  const text = normaliseText(input);
  const tokens: Token[] = [];
  for (const raw of text.split(' ')) {
    if (!raw) continue;
    if (containsBengali(raw)) {
      const fromDict = BANGLA_DICTIONARY[raw.normalize('NFC')];
      const value = fromDict ?? transliterateBengali(raw);
      for (const part of value.split(' ')) if (part && !STOPWORDS.has(part)) tokens.push({ value: part, weight: fromDict ? 1 : 0.4 });
      continue;
    }
    // Split joined units like "256gb" → keep as is (attributes.ts handles capacity), but split "a/b".
    for (const part of raw.split(/[/]+/)) {
      const v = part.replace(/^[.\-+]+|[.\-+]+$/g, '');
      if (v && !STOPWORDS.has(v)) tokens.push({ value: v, weight: 1 });
    }
  }
  return tokens;
}

/** Weighted Dice coefficient between two token sets (0..1). */
export function tokenSimilarity(a: string, b: string): number {
  const ta = dedupeTokens(tokenize(a));
  const tb = dedupeTokens(tokenize(b));
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  let totalA = 0;
  let totalB = 0;
  for (const [, w] of ta) totalA += w;
  for (const [, w] of tb) totalB += w;
  for (const [v, w] of ta) {
    const wb = tb.get(v);
    if (wb !== undefined) overlap += Math.min(w, wb);
  }
  return (2 * overlap) / (totalA + totalB);
}

function dedupeTokens(tokens: Token[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t.value, Math.max(m.get(t.value) ?? 0, t.weight));
  return m;
}

/** Text used for searching (title, brand, model, tags) with Bengali transliterations appended. */
export function searchableText(parts: (string | undefined | null)[]): string {
  const base = parts.filter(Boolean).join(' ');
  const tokens = tokenize(base).map((t) => t.value);
  return `${normaliseText(base)} ${tokens.join(' ')}`;
}
