// Minimal, dependency-free schema.org price reader for server-side monitoring.
// Mirrors the extension's structured-data rules: only JSON-LD / product meta tags are trusted.

export interface PagePrice {
  price: number;
  currency: string;
  availability: string;
  gtin?: string;
}

const AVAIL: [RegExp, string][] = [
  [/outofstock|soldout/i, 'out_of_stock'],
  [/preorder|presale/i, 'preorder'],
  [/backorder/i, 'backorder'],
  [/limited/i, 'limited'],
  [/discontinued/i, 'discontinued'],
  [/instock|onlineonly|instoreonly/i, 'in_stock'],
];

function availability(v: unknown): string {
  const s = String(v ?? '');
  for (const [re, val] of AVAIL) if (re.test(s)) return val;
  return 'unknown';
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v !== 'string') return null;
  const ascii = v.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6)).replace(/[^\d.]/g, '');
  const n = Number(ascii);
  return ascii && Number.isFinite(n) ? n : null;
}

function* nodes(value: unknown): Generator<Record<string, unknown>> {
  const stack = [value];
  let guard = 0;
  while (stack.length && guard++ < 5000) {
    const v = stack.pop();
    if (Array.isArray(v)) stack.push(...v);
    else if (v && typeof v === 'object') {
      yield v as Record<string, unknown>;
      stack.push(...Object.values(v as Record<string, unknown>));
    }
  }
}

function isType(n: Record<string, unknown>, t: string): boolean {
  const ty = n['@type'];
  return (Array.isArray(ty) ? ty : [ty]).some((x) => typeof x === 'string' && x.replace(/^https?:\/\/schema\.org\//, '') === t);
}

export function readPagePrice(html: string): PagePrice | null {
  for (const m of html.matchAll(/<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1]!.trim());
    } catch {
      continue;
    }
    for (const n of nodes(data)) {
      if (!isType(n, 'Product')) continue;
      const offers = Array.isArray(n.offers) ? n.offers : [n.offers];
      for (const o of offers) {
        if (!o || typeof o !== 'object') continue;
        const offer = o as Record<string, unknown>;
        const price = num(offer.price ?? offer.lowPrice);
        const currency = String(offer.priceCurrency ?? '').toUpperCase();
        if (price !== null && /^[A-Z]{3}$/.test(currency)) {
          const gtin = String(n.gtin13 ?? n.gtin12 ?? n.gtin ?? n.gtin14 ?? '') || undefined;
          return { price, currency, availability: availability(offer.availability), gtin };
        }
      }
    }
  }
  const meta = (k: string) => html.match(new RegExp(`<meta[^>]+property=["']${k}["'][^>]+content=["']([^"']+)`, 'i'))?.[1];
  const p = num(meta('product:price:amount') ?? meta('og:price:amount'));
  const c = (meta('product:price:currency') ?? meta('og:price:currency') ?? '').toUpperCase();
  return p !== null && /^[A-Z]{3}$/.test(c) ? { price: p, currency: c, availability: availability(meta('product:availability')) } : null;
}

export function looksBlocked(html: string, status: number): boolean {
  return status === 403 || status === 429 || status === 503 || /captcha|cf-chl|are you a robot|access denied/i.test(html.slice(0, 20000));
}
