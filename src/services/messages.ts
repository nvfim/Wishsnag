import type { ExtractionResult } from '@/core/types';
import type { CheckOutcome, RunSummary } from './monitorService';

/** Typed runtime messages between extension pages and the background service worker. */
export type Request =
  | { type: 'tab:active' }
  | { type: 'tab:extract'; tabId?: number; mode?: 'product' | 'list' }
  | { type: 'offer:refresh'; offerIds: string[] }
  | { type: 'monitor:run' }
  | { type: 'rates:refresh' }
  | { type: 'notify:test' }
  | { type: 'badge:refresh' }
  | { type: 'alarms:sync' }
  | { type: 'sidepanel:open'; tabId?: number; windowId?: number };

export interface TabInfo {
  id: number;
  windowId: number;
  url: string | null;
  title: string | null;
  favIconUrl: string | null;
  /** Restricted pages (chrome://, Web Store, PDFs) can't be read by any extension. */
  restricted: boolean;
}

export type ExtractError = 'restricted' | 'no_access' | 'no_tab' | 'failed';

export type ResponseFor<R extends Request> = R extends { type: 'tab:active' }
  ? { ok: true; tab: TabInfo | null; hasAccess: boolean }
  : R extends { type: 'tab:extract' }
    ? { ok: true; result: ExtractionResult; tab: TabInfo | null } | { ok: false; error: ExtractError; message?: string; tab?: TabInfo | null }
    : R extends { type: 'offer:refresh' }
      ? { ok: true; outcomes: CheckOutcome[] }
      : R extends { type: 'monitor:run' }
        ? { ok: true; summary: RunSummary }
        : R extends { type: 'rates:refresh' }
          ? { ok: true } | { ok: false; message: string }
          : { ok: boolean; message?: string };

export async function send<R extends Request>(request: R): Promise<ResponseFor<R>> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) throw new Error('Extension runtime unavailable');
  const res = (await chrome.runtime.sendMessage(request)) as ResponseFor<R> | undefined;
  if (!res) throw new Error('No response from the WishSnag background worker');
  return res;
}

export function isRestrictedUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  if (!/^https?:/i.test(url)) return true;
  try {
    const u = new URL(url);
    if (u.hostname === 'chromewebstore.google.com' || (u.hostname === 'chrome.google.com' && u.pathname.startsWith('/webstore'))) return true;
    if (/\.pdf($|\?)/i.test(u.pathname)) return true;
  } catch {
    return true;
  }
  return false;
}
