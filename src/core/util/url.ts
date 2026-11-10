/** URL helpers. Only http(s) URLs are ever stored, rendered as links or fetched. */

const TRACKING_PARAMS = [
  /^utm_/i, /^fbclid$/i, /^gclid$/i, /^gbraid$/i, /^wbraid$/i, /^msclkid$/i, /^mc_[a-z]+$/i,
  /^spm$/i, /^scm$/i, /^_branch/i, /^ref$/i, /^ref_$/i, /^pf_rd_/i, /^pd_rd_/i, /^psc$/i, /^th$/i,
  /^tag$/i, /^ascsubtag$/i, /^linkCode$/i, /^creative/i, /^camp$/i, /^clickid$/i, /^irclickid$/i,
  /^affid$/i, /^aff_/i, /^from$/i, /^search$/i, /^mp$/i, /^trk/i, /^_trkparms$/i, /^hash$/i,
  /^epik$/i, /^srsltid$/i, /^sr$/i, /^qid$/i, /^keywords$/i, /^crid$/i, /^sprefix$/i, /^dib/i,
];

export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Returns a safe absolute http(s) URL or undefined. Resolves relative URLs against `base`. */
export function safeUrl(value: unknown, base?: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 4000) return undefined;
  try {
    const u = base ? new URL(trimmed, base) : new URL(trimmed);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function originPattern(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return null;
  }
}

/**
 * Normalises a product URL so the same listing is recognised across visits:
 * lower-cases the host, drops "www.", the fragment and known tracking parameters,
 * sorts the remaining query parameters and removes trailing slashes.
 * Amazon product URLs are reduced to /dp/{ASIN}.
 */
export function normaliseProductUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url.trim();
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  let path = u.pathname.replace(/\/+$/, '') || '/';
  const amazon = /(^|\.)amazon\.[a-z.]+$/.test(host) ? path.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i) : null;
  if (amazon?.[1]) {
    return `https://${host}/dp/${amazon[1].toUpperCase()}`;
  }
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAMS.some((re) => re.test(k)))
    .sort(([a], [b]) => a.localeCompare(b));
  path = path.replace(/\/{2,}/g, '/');
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : '';
  return `https://${host}${path}${query}`;
}
