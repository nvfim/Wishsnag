import type { ExtractionResult } from '@/core/types';
import { collectFromDocument } from '@/core/extraction/domCollector';
import { extractProduct } from '@/core/extraction/extractProduct';
import { looksLikeBotChallenge } from '@/core/extraction/htmlString';
import { adapterFor } from '@/core/retailers/adapters';
import { retailerForUrl } from '@/core/retailers/registry';
import { safeUrl } from '@/core/util/url';

export type FetchExtractOutcome = { ok: true; result: ExtractionResult } | { ok: false; reason: 'invalid_url' | 'blocked' | 'http_error' | 'network_error' | 'not_html'; message?: string };

/**
 * Fetches a product page from an extension page (requires host access for that store,
 * requested by the caller after a user click) and extracts it with the full DOM collector.
 * Cookies are never sent.
 */
export async function fetchAndExtract(rawUrl: string, fetchImpl: typeof fetch = fetch): Promise<FetchExtractOutcome> {
  const url = safeUrl(rawUrl);
  if (!url) return { ok: false, reason: 'invalid_url' };
  let res: Response;
  try {
    res = await fetchImpl(url, { credentials: 'omit', redirect: 'follow', headers: { Accept: 'text/html' } });
  } catch (err) {
    return { ok: false, reason: 'network_error', message: err instanceof Error ? err.message : String(err) };
  }
  const type = res.headers.get('content-type') ?? '';
  if (type && !/html|xml/.test(type)) return { ok: false, reason: 'not_html', message: type };
  const html = (await res.text()).slice(0, 3_000_000);
  if (looksLikeBotChallenge(html, res.status)) return { ok: false, reason: 'blocked', message: `HTTP ${res.status}` };
  if (!res.ok) return { ok: false, reason: 'http_error', message: `HTTP ${res.status}` };
  const finalUrl = res.url || url;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = doc.createElement('base');
  base.href = finalUrl;
  doc.head.prepend(base);
  // Scripts in a DOMParser document never execute; remove them anyway except JSON-LD.
  doc.querySelectorAll('script:not([type="application/ld+json" i])').forEach((s) => s.remove());
  const raw = collectFromDocument(doc, { url: finalUrl, adapter: adapterFor(retailerForUrl(finalUrl)?.id) });
  return { ok: true, result: extractProduct(raw) };
}
