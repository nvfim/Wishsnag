import { decodeEntities, stripTags } from '../util/text';
import { RAW_LIMITS, emptyRawPage, type RawPageData } from './rawPage';

/**
 * Collects structured product signals from an HTML string without a DOM
 * (MV3 service workers have no DOMParser). Only structured sources are read here —
 * JSON-LD, meta tags and itemprop attributes — so background price checks never rely
 * on visible-text heuristics.
 */
export function collectFromHtml(html: string, url: string): RawPageData {
  const raw = emptyRawPage(url);
  const doc = html.length > 3_000_000 ? html.slice(0, 3_000_000) : html;

  let total = 0;
  for (const m of doc.matchAll(/<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    const content = m[1] ?? '';
    total += content.length;
    if (total > RAW_LIMITS.jsonLdChars || raw.jsonLd.length >= RAW_LIMITS.jsonLdBlocks) break;
    raw.jsonLd.push(content);
  }

  for (const m of doc.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g)) {
    if (raw.meta.length >= RAW_LIMITS.metaTags) break;
    const tag = (m[1] ?? '').toLowerCase();
    const attrSource = m[2] ?? '';
    if (tag !== 'meta' && tag !== 'link' && !/itemprop/i.test(attrSource)) continue;
    const attrs = parseAttributes(attrSource);
    if (tag === 'meta') {
      const key = attrs.property ?? attrs.name;
      if (key && attrs.content) raw.meta.push({ key: key.toLowerCase(), value: decodeEntities(attrs.content).slice(0, RAW_LIMITS.textChars) });
    }
    if (tag === 'link' && attrs.rel?.toLowerCase() === 'canonical' && attrs.href) raw.canonicalUrl = decodeEntities(attrs.href);
    if (attrs.itemprop) {
      const value = attrs.content ?? attrs.href ?? attrs.value;
      if (value) raw.meta.push({ key: `itemprop:${attrs.itemprop.toLowerCase()}`, value: decodeEntities(value).slice(0, RAW_LIMITS.textChars) });
    }
  }

  const title = doc.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) raw.documentTitle = decodeEntities(stripTags(title)).replace(/\s+/g, ' ').trim().slice(0, 300);
  const h1 = doc.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  if (h1) raw.h1 = decodeEntities(stripTags(h1)).replace(/\s+/g, ' ').trim().slice(0, 300) || undefined;
  const lang = doc.match(/<html\b[^>]*\blang\s*=\s*["']?([a-zA-Z-]+)/i)?.[1];
  if (lang) raw.lang = lang;
  return raw;
}

export function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of source.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    const name = (m[1] ?? '').toLowerCase();
    if (!name || name in attrs) continue;
    attrs[name] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

/** Heuristic bot-challenge / access-denied detection so blocked checks are never retried aggressively. */
export function looksLikeBotChallenge(html: string, status: number): boolean {
  if (status === 403 || status === 429 || status === 503) return true;
  const head = html.slice(0, 20000).toLowerCase();
  return /captcha|cf-chl|challenge-platform|are you a robot|access denied|bot detection|px-captcha|perimeterx|distil_r_captcha|unusual traffic/.test(head);
}
