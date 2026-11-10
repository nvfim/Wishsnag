/**
 * WishSnag background service worker (Manifest V3, ES module).
 * Event-driven: it wakes for clicks, messages, alarms and tab updates, does its work and
 * goes back to sleep. All state lives in IndexedDB / chrome.storage, never in memory.
 */
import { createTranslator } from '@/core/i18n';
import { resolveLocale } from '@/core/pricing/currency';
import { emptyDraft } from '@/core/draft';
import { db } from '@/db/schema';
import { findOffersByUrl, markNotificationsRead, recordObservation } from '@/db/repo';
import { loadSettings, onSettingsChanged } from '@/db/settingsStore';
import { kv, STORAGE_KEYS } from '@/platform/storage';
import { flushHeldNotifications, processObservation, showDesktopNotification, updateBadge } from '@/services/alertsService';
import { acceptObservedPrice, checkOffer, runScheduledChecks } from '@/services/monitorService';
import { ensureRates, refreshRates } from '@/services/fxService';
import { hasOriginAccess } from '@/services/permissions';
import { isRestrictedUrl, type Request } from '@/services/messages';
import { extractFromTab, toTabInfo } from './extract';

const ALARMS = { monitor: 'wishsnag-monitor', fx: 'wishsnag-fx', flush: 'wishsnag-flush' } as const;
const MENU = { page: 'wishsnag-snag-page', link: 'wishsnag-snag-link', importList: 'wishsnag-import-page' } as const;

export interface PendingDraft {
  createdAt: number;
  tabId: number | null;
  source: 'context_menu' | 'command' | 'link';
  status: 'extracting' | 'ready' | 'error';
  extraction?: Awaited<ReturnType<typeof extractFromTab>>;
  manual?: ReturnType<typeof emptyDraft>;
  mode?: 'product' | 'list';
}

async function setupMenus(): Promise<void> {
  const settings = await loadSettings();
  const t = createTranslator(settings.language);
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: MENU.page, title: t('snag_button'), contexts: ['page', 'image', 'selection'] });
  chrome.contextMenus.create({ id: MENU.link, title: `${t('snag_button')} (link)`, contexts: ['link'] });
  chrome.contextMenus.create({ id: MENU.importList, title: t('sp_import_page'), contexts: ['page'] });
}

async function setupAlarms(): Promise<void> {
  const existing = new Set((await chrome.alarms.getAll()).map((a) => a.name));
  if (!existing.has(ALARMS.monitor)) await chrome.alarms.create(ALARMS.monitor, { delayInMinutes: 5, periodInMinutes: 60 });
  if (!existing.has(ALARMS.fx)) await chrome.alarms.create(ALARMS.fx, { delayInMinutes: 1, periodInMinutes: 12 * 60 });
  if (!existing.has(ALARMS.flush)) await chrome.alarms.create(ALARMS.flush, { delayInMinutes: 15, periodInMinutes: 15 });
}

function dashboardUrl(hash = ''): string {
  return chrome.runtime.getURL(`dashboard.html${hash ? `#${hash}` : ''}`);
}

async function setPending(p: PendingDraft): Promise<void> {
  await kv().set({ [STORAGE_KEYS.pendingDraft]: p });
}

/** Opens the side panel (must run synchronously inside the user-gesture handler). */
function openPanel(windowId: number | undefined): Promise<boolean> {
  if (windowId === undefined || !chrome.sidePanel?.open) return Promise.resolve(false);
  return chrome.sidePanel
    .open({ windowId })
    .then(() => true)
    .catch(() => false);
}

async function snagFromTab(tab: chrome.tabs.Tab, source: PendingDraft['source'], mode: 'product' | 'list', opened: Promise<boolean>): Promise<void> {
  const tabId = tab.id ?? null;
  await setPending({ createdAt: Date.now(), tabId, source, status: 'extracting', mode });
  const extraction = tabId !== null ? await extractFromTab(tabId, mode) : ({ ok: false, error: 'no_tab' } as const);
  await setPending({ createdAt: Date.now(), tabId, source, status: extraction.ok ? 'ready' : 'error', extraction, mode });
  if (!(await opened)) {
    // Side panel unavailable — fall back to the dashboard's add page.
    await chrome.tabs.create({ url: dashboardUrl('/add?pending=1') });
  }
}

// ---------------------------------------------------------------------------- lifecycle

chrome.runtime.onInstalled.addListener(async (details) => {
  await setupMenus();
  await setupAlarms();
  await chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false }).catch(() => undefined);
  if (details.reason === 'install' && !__WISHSNAG_E2E__) await chrome.tabs.create({ url: dashboardUrl('/welcome') });
  await updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await setupAlarms();
  await updateBadge();
});

onSettingsChanged(() => {
  void setupMenus();
});

// ---------------------------------------------------------------------------- user entry points

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab) return;
  const opened = openPanel(tab.windowId);
  if (info.menuItemId === MENU.link && info.linkUrl) {
    const manual = emptyDraft(info.linkUrl);
    manual.title = (info.selectionText ?? '').trim().slice(0, 300);
    void setPending({ createdAt: Date.now(), tabId: tab.id ?? null, source: 'link', status: 'ready', manual });
    void opened.then((ok) => (ok ? undefined : chrome.tabs.create({ url: dashboardUrl('/add?pending=1') })));
    return;
  }
  void snagFromTab(tab, 'context_menu', info.menuItemId === MENU.importList ? 'list' : 'product', opened);
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'snag-current-page' || !tab) return;
  const opened = openPanel(tab.windowId);
  void snagFromTab(tab, 'command', 'product', opened);
});

chrome.notifications.onClicked.addListener(async (id) => {
  chrome.notifications.clear(id);
  if (id.startsWith('digest-')) {
    await chrome.tabs.create({ url: dashboardUrl('/notifications') });
    return;
  }
  if (id.startsWith('test-')) return;
  const n = await db().notifications.get(id);
  await markNotificationsRead([id]);
  await updateBadge();
  await chrome.tabs.create({ url: dashboardUrl(n?.itemId ? `/item/${n.itemId}` : '/notifications') });
});

chrome.notifications.onButtonClicked.addListener(async (id) => {
  chrome.notifications.clear(id);
  const n = await db().notifications.get(id);
  if (n?.url && /^https?:/i.test(n.url)) await chrome.tabs.create({ url: n.url });
  if (n) await markNotificationsRead([id]);
  await updateBadge();
});

// ---------------------------------------------------------------------------- alarms

chrome.alarms.onAlarm.addListener(async (alarm) => {
  switch (alarm.name) {
    case ALARMS.monitor:
      await runScheduledChecks();
      break;
    case ALARMS.fx:
      await ensureRates();
      break;
    case ALARMS.flush:
      await flushHeldNotifications();
      break;
  }
});

// ---------------------------------------------------------------------------- passive observation on revisit

const recentVisits = new Map<string, number>();

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url || isRestrictedUrl(tab.url)) return;
  const settings = await loadSettings();
  if (!settings.monitoring.checkOnVisit) return;
  const offers = await findOffersByUrl(tab.url);
  if (!offers.length || !(await hasOriginAccess(tab.url))) return;
  const now = Date.now();
  const key = offers.map((o) => o.id).join(',');
  if (now - (recentVisits.get(key) ?? 0) < 10 * 60_000) return;
  recentVisits.set(key, now);
  const extraction = await extractFromTab(tabId);
  if (!extraction.ok) return;
  for (const offer of offers) {
    if (offer.lastVerifiedAt && now - offer.lastVerifiedAt < 30 * 60_000) continue;
    const accepted = acceptObservedPrice(offer, extraction.result);
    if (!accepted.ok) continue;
    const rec = await recordObservation(offer.id, { price: accepted.price, currency: accepted.currency, availability: extraction.result.offer.availability, source: 'page_visit' });
    await processObservation(rec);
  }
});

// ---------------------------------------------------------------------------- messages

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function handle(request: Request, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (request.type) {
    case 'tab:active': {
      const tab = await activeTab();
      if (!tab) return { ok: true, tab: null, hasAccess: false };
      const info = toTabInfo(tab);
      return { ok: true, tab: info, hasAccess: !!info.url && !info.restricted && (await hasOriginAccess(info.url)) };
    }
    case 'tab:extract': {
      const tabId = request.tabId ?? (await activeTab())?.id;
      if (tabId === undefined) return { ok: false, error: 'no_tab' };
      return extractFromTab(tabId, request.mode);
    }
    case 'offer:refresh': {
      const outcomes = [];
      for (const id of request.offerIds.slice(0, 20)) outcomes.push(await checkOffer(id, 'manual_refresh'));
      return { ok: true, outcomes };
    }
    case 'monitor:run':
      return { ok: true, summary: await runScheduledChecks({ force: true }) };
    case 'rates:refresh':
      try {
        await refreshRates();
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
    case 'notify:test': {
      const settings = await loadSettings();
      const t = createTranslator(settings.language, resolveLocale(settings.language, settings.residenceCountry, settings.formatLocale));
      const ok = await showDesktopNotification({ id: `test-${Date.now()}`, title: t('alerts_test_title'), message: t('alerts_test_message'), ctaLabel: '', url: null });
      return { ok };
    }
    case 'badge:refresh':
      await updateBadge();
      return { ok: true };
    case 'alarms:sync':
      await setupAlarms();
      return { ok: true };
    case 'sidepanel:open': {
      const windowId = request.windowId ?? sender.tab?.windowId ?? (await activeTab())?.windowId;
      return { ok: await openPanel(windowId) };
    }
    default:
      return { ok: false, message: 'Unknown request' };
  }
}

chrome.runtime.onMessage.addListener((request: Request, sender, sendResponse) => {
  // Only accept messages from WishSnag's own pages.
  if (sender.id !== chrome.runtime.id || (sender.url && !sender.url.startsWith(chrome.runtime.getURL('')))) return false;
  handle(request, sender)
    .then(sendResponse)
    .catch((err: unknown) => sendResponse({ ok: false, error: 'failed', message: err instanceof Error ? err.message : String(err) }));
  return true;
});

// Test hooks for the Playwright end-to-end suite (only in the E2E build).
if (__WISHSNAG_E2E__) {
  (globalThis as unknown as Record<string, unknown>).wishsnag = { extractFromTab, runScheduledChecks, checkOffer, flushHeldNotifications, db, loadSettings };
}
