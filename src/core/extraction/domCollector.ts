import type { RetailerAdapter } from '../retailers/adapters';
import { RAW_LIMITS, type RawListCandidate, type RawMicrodataItem, type RawPageData } from './rawPage';

/**
 * Collects raw product signals from a live document. Runs inside the page (isolated
 * world) only after a user action or on stores the user granted. It reads — never
 * modifies — the page, and returns plain JSON-serialisable data.
 */
export function collectFromDocument(doc: Document, options: { mode?: 'product' | 'list'; adapter?: RetailerAdapter; url?: string } = {}): RawPageData {
  const url = options.url ?? doc.location?.href ?? doc.URL;
  const text = (el: Element | null | undefined, max: number = RAW_LIMITS.textChars) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

  const jsonLd: string[] = [];
  let total = 0;
  for (const s of Array.from(doc.querySelectorAll('script[type="application/ld+json" i]')).slice(0, RAW_LIMITS.jsonLdBlocks)) {
    const content = s.textContent ?? '';
    total += content.length;
    if (total > RAW_LIMITS.jsonLdChars) break;
    jsonLd.push(content);
  }

  const meta: RawPageData['meta'] = [];
  for (const m of Array.from(doc.querySelectorAll('meta')).slice(0, RAW_LIMITS.metaTags)) {
    const value = m.getAttribute('content');
    if (!value) continue;
    const prop = m.getAttribute('property') ?? m.getAttribute('name');
    if (prop) meta.push({ key: prop.toLowerCase(), value: value.slice(0, RAW_LIMITS.textChars) });
    const itemprop = m.getAttribute('itemprop');
    if (itemprop) meta.push({ key: `itemprop:${itemprop.toLowerCase()}`, value: value.slice(0, RAW_LIMITS.textChars) });
  }

  const canonicalUrl = doc.querySelector('link[rel="canonical" i]')?.getAttribute('href') ?? undefined;

  const microdata: RawMicrodataItem[] = [];
  for (const scope of Array.from(doc.querySelectorAll('[itemscope][itemtype]')).slice(0, 20)) {
    const type = scope.getAttribute('itemtype') ?? '';
    if (!/schema\.org\/(Product|IndividualProduct|ProductModel)\b/i.test(type)) continue;
    if (scope.parentElement?.closest('[itemscope][itemtype*="Product" i]')) continue;
    const props: Record<string, string[]> = {};
    const offers: Record<string, string[]>[] = [];
    for (const el of Array.from(scope.querySelectorAll('[itemprop]')).slice(0, 200)) {
      const owner = el.parentElement?.closest('[itemscope]');
      const name = el.getAttribute('itemprop') ?? '';
      if (!name) continue;
      if (owner === scope) {
        if (name === 'offers' && el.hasAttribute('itemscope')) {
          const offer: Record<string, string[]> = {};
          for (const oe of Array.from(el.querySelectorAll('[itemprop]')).slice(0, 50)) {
            const on = oe.getAttribute('itemprop');
            if (on) (offer[on] ??= []).push(microValue(oe));
          }
          offers.push(offer);
        } else if (!el.hasAttribute('itemscope') || name === 'brand') {
          (props[name] ??= []).push(el.hasAttribute('itemscope') ? text(el.querySelector('[itemprop="name"]') ?? el, 120) : microValue(el));
        }
      }
    }
    microdata.push({ type, props, offers });
  }

  const h1 = text(doc.querySelector('h1'), 300) || undefined;

  const priceTexts: string[] = [];
  const priceEls = Array.from(doc.querySelectorAll('[itemprop="price"], [class*="price" i], [id*="price" i], [data-testid*="price" i], [data-price]')).slice(0, 200);
  const main = doc.querySelector('main, [role="main"], #main, .main') ?? doc.body;
  const ordered = [...priceEls.filter((e) => main?.contains(e)), ...priceEls.filter((e) => !main?.contains(e))];
  for (const el of ordered) {
    if (el.closest('[hidden], [aria-hidden="true"], script, style, noscript, del, s, strike')) continue;
    const t = (el.getAttribute('content') ?? text(el, 80)).trim();
    if (t && t.length <= 60 && /\p{Nd}/u.test(t) && !priceTexts.includes(t)) priceTexts.push(t);
    if (priceTexts.length >= RAW_LIMITS.priceTexts) break;
  }

  const images: string[] = [];
  for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>('main img, [class*="gallery" i] img, [class*="product" i] img, [id*="product" i] img')).slice(0, 60)) {
    const src = img.currentSrc || img.src || img.getAttribute('data-src') || '';
    const w = img.naturalWidth || Number(img.getAttribute('width')) || 0;
    if (src && !src.startsWith('data:') && (w === 0 || w >= 150) && !images.includes(src)) images.push(src);
    if (images.length >= RAW_LIMITS.images) break;
  }

  let adapter: RawPageData['adapter'];
  if (options.adapter) {
    const fields: Record<string, string> = {};
    for (const [field, selectors] of Object.entries(options.adapter.selectors)) {
      for (const sel of selectors ?? []) {
        let el: Element | null = null;
        try {
          el = doc.querySelector(sel);
        } catch {
          el = null;
        }
        if (!el) continue;
        const value = field === 'image' ? (el as HTMLImageElement).currentSrc || el.getAttribute('src') || el.getAttribute('data-src') || '' : text(el, 300);
        if (value) {
          fields[field] = value;
          break;
        }
      }
    }
    if (Object.keys(fields).length) adapter = { retailerId: options.adapter.retailerId, fields };
  }

  const listCandidates = options.mode === 'list' ? collectListCandidates(doc) : [];

  return {
    url,
    canonicalUrl,
    documentTitle: (doc.title ?? '').slice(0, 300),
    lang: doc.documentElement?.lang || undefined,
    jsonLd,
    meta,
    microdata,
    h1,
    priceTexts,
    images,
    adapter,
    listCandidates,
  };
}

function microValue(el: Element): string {
  const v = el.getAttribute('content') ?? el.getAttribute('href') ?? el.getAttribute('src') ?? el.getAttribute('datetime') ?? el.getAttribute('value') ?? el.textContent ?? '';
  return v.replace(/\s+/g, ' ').trim().slice(0, RAW_LIMITS.textChars);
}

const PRICE_RE = /(?:[$৳£€₹¥]|\b(?:tk|rs|aud|bdt|usd|gbp|eur|inr)\b)\s?[\d০-৯][\d০-৯.,]*|[\d০-৯][\d০-৯.,]*\s?(?:৳|tk|aud|bdt|usd|€)/i;

/** Detects repeated product cards (image + link + price) for wishlist/list imports. */
export function collectListCandidates(doc: Document): RawListCandidate[] {
  const out: RawListCandidate[] = [];
  const seen = new Set<string>();
  const anchors = Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]')).slice(0, 3000);
  for (const a of anchors) {
    const href = a.href;
    if (!href || !/^https?:/i.test(href) || seen.has(href)) continue;
    if (a.closest('header, footer, nav, [role="navigation"]')) continue;
    let card: Element | null = a;
    let priceText: string | undefined;
    let img: HTMLImageElement | null = a.querySelector('img');
    for (let depth = 0; depth < 5 && card; depth++) {
      img = img ?? card.querySelector('img');
      const match = (card.textContent ?? '').match(PRICE_RE);
      if (match && img) {
        priceText = match[0];
        break;
      }
      card = card.parentElement;
      if (card && card.querySelectorAll('a[href]').length > 12) break;
    }
    if (!img || !priceText) continue;
    const title = (a.getAttribute('title') ?? a.getAttribute('aria-label') ?? img.getAttribute('alt') ?? a.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (title.length < 3 || title.length > 300 || PRICE_RE.test(title) && title.length < 12) continue;
    seen.add(href);
    out.push({ title, url: href, imageUrl: img.currentSrc || img.src || img.getAttribute('data-src') || undefined, priceText });
    if (out.length >= RAW_LIMITS.listCandidates) break;
  }
  return out;
}
