import type { ExtractionResult } from '@/core/types';
import { extractProduct } from '@/core/extraction/extractProduct';
import type { RawPageData } from '@/core/extraction/rawPage';
import { isRestrictedUrl, type ExtractError, type TabInfo } from '@/services/messages';

export function toTabInfo(tab: chrome.tabs.Tab): TabInfo {
  return {
    id: tab.id ?? -1,
    windowId: tab.windowId,
    url: tab.url ?? null,
    title: tab.title ?? null,
    favIconUrl: tab.favIconUrl ?? null,
    restricted: tab.url ? isRestrictedUrl(tab.url) : false,
  };
}

export type TabExtraction = { ok: true; result: ExtractionResult; tab: TabInfo } | { ok: false; error: ExtractError; message?: string; tab?: TabInfo | null };

/**
 * Reads the product on a tab. Requires either an activeTab grant (the user just clicked
 * the toolbar icon / context menu / shortcut) or optional host access for that store.
 */
export async function extractFromTab(tabId: number, mode: 'product' | 'list' = 'product'): Promise<TabExtraction> {
  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return { ok: false, error: 'no_tab' };
  }
  const info = toTabInfo(tab);
  if (tab.url && isRestrictedUrl(tab.url)) return { ok: false, error: 'restricted', tab: info };
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content/extractor.js'] });
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (m: 'product' | 'list') => (globalThis as unknown as { __wishsnagCollect?: (mode: 'product' | 'list') => unknown }).__wishsnagCollect?.(m) ?? null,
      args: [mode],
    });
    const raw = injection?.result as RawPageData | null | undefined;
    if (!raw) return { ok: false, error: 'no_access', tab: info };
    const result = extractProduct(raw);
    return { ok: true, result, tab: { ...info, url: info.url ?? raw.url, title: info.title ?? raw.documentTitle } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/cannot be scripted|chrome:\/\/|extensions gallery|Cannot access a chrome/i.test(message)) return { ok: false, error: 'restricted', message, tab: info };
    if (/permission|Cannot access contents|host/i.test(message)) return { ok: false, error: 'no_access', message, tab: info };
    return { ok: false, error: 'failed', message, tab: info };
  }
}
