import { originPattern } from '@/core/util/url';

/** Optional, per-store host access. Requested only after a user action and only for one origin. */
export function hasPermissionsApi(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.permissions;
}

export async function hasOriginAccess(url: string): Promise<boolean> {
  const origin = originPattern(url);
  if (!origin || !hasPermissionsApi()) return false;
  try {
    return await chrome.permissions.contains({ origins: [origin] });
  } catch {
    return false;
  }
}

/** Must be called from a user gesture (click handler) in an extension page. */
export async function requestOriginAccess(urls: string[]): Promise<boolean> {
  const origins = [...new Set(urls.map(originPattern).filter((o): o is string => !!o))];
  if (!origins.length || !hasPermissionsApi()) return false;
  try {
    return await chrome.permissions.request({ origins });
  } catch {
    return false;
  }
}

export async function listGrantedOrigins(): Promise<string[]> {
  if (!hasPermissionsApi()) return [];
  const all = await chrome.permissions.getAll();
  return (all.origins ?? []).filter((o) => o !== '<all_urls>');
}

export async function removeOriginAccess(origin: string): Promise<boolean> {
  if (!hasPermissionsApi()) return false;
  try {
    return await chrome.permissions.remove({ origins: [origin] });
  } catch {
    return false;
  }
}

export function siteLabel(url: string): string {
  try {
    return new URL(url.replace('/*', '/')).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
