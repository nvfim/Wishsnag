import type { CountryCode, CurrencyCode } from '../types';
import { defaultCurrencyFor } from '../geo/countries';
import { normaliseCurrency } from './currency';
import { normaliseDigits } from '../matching/normalize';

/**
 * Currency markers → ISO code. Ordered longest-first so "A$" wins over "$".
 * Ambiguous markers ("$", "¥", "kr", "Rs") resolve via the country hint.
 */
const MARKERS: [RegExp, CurrencyCode | 'DOLLAR' | 'YEN' | 'RUPEE' | 'KRONA'][] = [
  [/AU\$|A\$/i, 'AUD'],
  [/US\$/i, 'USD'],
  [/NZ\$/i, 'NZD'],
  [/CA\$|C\$/i, 'CAD'],
  [/S\$|SG\$/i, 'SGD'],
  [/HK\$/i, 'HKD'],
  [/R\$/i, 'BRL'],
  [/MX\$/i, 'MXN'],
  [/৳|টাকা|\bTk\.?(?=\s|\d|$)|\bTaka\b/i, 'BDT'],
  [/£/, 'GBP'],
  [/€/, 'EUR'],
  [/₹/, 'INR'],
  [/د\.إ|\bDhs?\.?(?=\s|\d)/i, 'AED'],
  [/₩/, 'KRW'],
  [/₱/, 'PHP'],
  [/₫/, 'VND'],
  [/฿/, 'THB'],
  [/₺/, 'TRY'],
  [/₦/, 'NGN'],
  [/zł/i, 'PLN'],
  [/\bRM(?=\s|\d)/, 'MYR'],
  [/円/, 'JPY'],
  [/元|CN¥|RMB/i, 'CNY'],
  [/¥|￥/, 'YEN'],
  [/\bRs\.?(?=\s|\d)/i, 'RUPEE'],
  [/\bkr\.?(?=\s|\d|$)/i, 'KRONA'],
  [/\$/, 'DOLLAR'],
];

const DOLLAR_COUNTRIES: Record<string, CurrencyCode> = { AU: 'AUD', US: 'USD', CA: 'CAD', SG: 'SGD', NZ: 'NZD', HK: 'HKD', MX: 'MXN', TW: 'TWD', EC: 'USD', SV: 'USD', PR: 'USD' };
const RUPEE_COUNTRIES: Record<string, CurrencyCode> = { IN: 'INR', PK: 'PKR', LK: 'LKR', NP: 'NPR', MU: 'MUR' };
const KRONA_COUNTRIES: Record<string, CurrencyCode> = { SE: 'SEK', NO: 'NOK', DK: 'DKK', IS: 'ISK' };

export interface ParsedPrice {
  amount: number;
  currency: CurrencyCode | null;
}

export function detectCurrency(text: string, countryHint?: CountryCode | null): CurrencyCode | null {
  const iso = text.match(/\b([A-Z]{3})\b/);
  if (iso?.[1]) {
    const code = normaliseCurrency(iso[1]);
    if (code) return code;
  }
  for (const [re, marker] of MARKERS) {
    if (!re.test(text)) continue;
    const hint = countryHint?.toUpperCase();
    switch (marker) {
      case 'DOLLAR':
        return hint ? (DOLLAR_COUNTRIES[hint] ?? null) : null;
      case 'YEN':
        return hint === 'CN' ? 'CNY' : 'JPY';
      case 'RUPEE':
        return hint ? (RUPEE_COUNTRIES[hint] ?? null) : null;
      case 'KRONA':
        return hint ? (KRONA_COUNTRIES[hint] ?? null) : null;
      default:
        return marker;
    }
  }
  return null;
}

/**
 * Parses a human-formatted number. Handles "1,299.00", "1.299,00", Indian/Bangladeshi
 * lakh grouping ("8,50,000"), Bengali/Devanagari/Arabic-Indic digits and spaces.
 */
export function parseAmount(raw: string, decimalHint?: '.' | ','): number | null {
  const text = normaliseDigits(raw).replace(/[\u00A0\u202F\u2009\s']/g, '');
  const match = text.match(/\d[\d.,]*/);
  if (!match) return null;
  let num = match[0].replace(/[.,]+$/, '');
  const lastDot = num.lastIndexOf('.');
  const lastComma = num.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    num = num.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma >= 0) {
    // "1,299" / "8,50,000" → grouping; "12,50" → decimal comma.
    const parts = num.split(',');
    const tail = parts[parts.length - 1] ?? '';
    num = tail.length === 3 || parts.length > 2 ? parts.join('') : `${parts[0]}.${tail}`;
  } else if (lastDot >= 0) {
    // "1.299.000" or (in comma-decimal markets) "1.299" → grouping; otherwise a decimal point.
    const parts = num.split('.');
    const tail = parts[parts.length - 1] ?? '';
    if (tail.length === 3 && (parts.length > 2 || decimalHint === ',')) num = parts.join('');
    else if (parts.length > 2) num = `${parts.slice(0, -1).join('')}.${tail}`;
  }
  const value = Number(num);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

const COMMA_DECIMAL_COUNTRIES = new Set(['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'AT', 'PT', 'PL', 'SE', 'NO', 'DK', 'FI', 'BR', 'TR', 'RU', 'ID', 'VN', 'AR', 'CL', 'CO', 'CZ', 'HU', 'RO', 'GR']);

export function parsePrice(raw: unknown, countryHint?: CountryCode | null, currencyHint?: CurrencyCode | null): ParsedPrice | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? { amount: raw, currency: currencyHint ?? null } : null;
  }
  if (typeof raw !== 'string') return null;
  const text = raw.trim().slice(0, 120);
  if (!text) return null;
  const decimalHint = countryHint && COMMA_DECIMAL_COUNTRIES.has(countryHint.toUpperCase()) ? ',' : undefined;
  const amount = parseAmount(text, decimalHint);
  if (amount === null) return null;
  const currency = detectCurrency(text, countryHint) ?? currencyHint ?? null;
  return { amount, currency };
}

/** Parses a schema.org price value (which should be a plain decimal like "1299.00"). */
export function parseStructuredPrice(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? raw : null;
  if (typeof raw !== 'string') return null;
  const t = normaliseDigits(raw.trim());
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  return parseAmount(t);
}

export function fallbackCurrencyForCountry(country: CountryCode | null | undefined): CurrencyCode | null {
  return country ? defaultCurrencyFor(country) : null;
}
