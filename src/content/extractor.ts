/**
 * WishSnag on-demand page reader.
 *
 * Injected with chrome.scripting.executeScript only after a user action (activeTab:
 * toolbar click, right-click menu, keyboard shortcut) or on stores the user explicitly
 * allowed. It runs in Chrome's isolated world, never modifies the page, never reads
 * cookies, form fields or account data, and returns plain JSON to the extension.
 */
import { collectFromDocument } from '@/core/extraction/domCollector';
import { adapterFor } from '@/core/retailers/adapters';
import { retailerForUrl } from '@/core/retailers/registry';
import type { RawPageData } from '@/core/extraction/rawPage';

function collect(mode: 'product' | 'list' = 'product'): RawPageData {
  const retailer = retailerForUrl(location.href);
  return collectFromDocument(document, { mode, adapter: adapterFor(retailer?.id) });
}

(globalThis as unknown as { __wishsnagCollect: typeof collect }).__wishsnagCollect = collect;
