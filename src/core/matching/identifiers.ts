import { normaliseDigits } from './normalize';

/**
 * Validates a GTIN (GTIN-8, UPC-A/GTIN-12, EAN-13/GTIN-13, GTIN-14) using the GS1
 * mod-10 check digit and returns it zero-padded to 14 digits, or null if invalid.
 * ISBN-13 values are EAN-13 and validate the same way.
 */
export function normaliseGtin(raw: unknown): string | null {
  if (raw == null) return null;
  const digits = normaliseDigits(String(raw)).replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  if (![8, 12, 13, 14].includes(digits.length)) return null;
  if (/^0+$/.test(digits)) return null;
  const padded = digits.padStart(14, '0');
  return isValidGtinChecksum(padded) ? padded : null;
}

export function isValidGtinChecksum(gtin14: string): boolean {
  if (!/^\d{14}$/.test(gtin14)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    const digit = Number(gtin14[i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(gtin14[13]);
}

/** Manufacturer part numbers compare case-insensitively without spaces, dashes, dots or slashes. */
export function normaliseMpn(raw: unknown): string | null {
  if (raw == null) return null;
  const s = normaliseDigits(String(raw)).toUpperCase().replace(/[\s\-_./]/g, '');
  if (s.length < 3 || s.length > 40) return null;
  if (!/\d/.test(s) && s.length < 5) return null;
  return s;
}

const MODEL_STOP = new Set(['5G', '4G', 'LTE', 'USB', 'HDMI', 'WIFI', 'WI-FI', 'NFC', 'GPS', 'ANC', 'OLED', 'QLED', 'LED', 'HD', 'FHD', 'UHD', '4K', '8K', 'TWS', 'RGB']);

/**
 * Extracts model-number-like tokens from a title: mixed letters+digits with at least
 * 4 characters (e.g. "WH-1000XM5", "SM-S928B", "A2894", "MU7A3ZP/A"), excluding
 * capacities ("256GB"), dimensions and common tech abbreviations.
 */
export function extractModelNumbers(title: string): string[] {
  const text = normaliseDigits(title.normalize('NFKC'));
  const found = new Set<string>();
  const re = /\b([A-Z0-9]+(?:[-/][A-Z0-9]+)*)\b/gi;
  for (const m of text.matchAll(re)) {
    const token = m[1] ?? '';
    const upper = token.toUpperCase();
    if (upper.length < 4 || upper.length > 24) continue;
    if (!/\d/.test(upper) || !/[A-Z]/.test(upper)) continue;
    if (MODEL_STOP.has(upper)) continue;
    if (/^\d+(GB|TB|MB|MAH|W|HZ|MM|CM|INCH|IN|MP|K|ML|L|G|KG|V)$/i.test(upper)) continue;
    // Capacity pairs such as "8/256GB" or "12+512GB" are variant attributes, not model numbers.
    if (/^\d{1,3}[/+]\d{2,4}(GB|TB)?$/i.test(upper)) continue;
    if (/^\d+(ST|ND|RD|TH)$/i.test(upper)) continue;
    if (/^(19|20)\d{2}$/.test(upper)) continue;
    const n = normaliseMpn(upper);
    if (n) found.add(n);
  }
  return [...found];
}

export function sameGtin(a?: string | null, b?: string | null): boolean {
  const na = normaliseGtin(a);
  const nb = normaliseGtin(b);
  return !!na && na === nb;
}
