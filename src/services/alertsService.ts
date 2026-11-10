import type { AppNotification, DesktopStatus, Settings } from '@/core/types';
import { evaluateCheaperOffer, evaluateObservationAlerts, type AlertEvent } from '@/core/alerts/rules';
import { buildNotificationText } from '@/core/alerts/messages';
import { decideDesktopDelivery, isQuietTime } from '@/core/alerts/schedule';
import { createTranslator } from '@/core/i18n';
import { resolveLocale } from '@/core/pricing/currency';
import { compareForItem } from '@/core/summary';
import { db } from '@/db/schema';
import { addNotification, alertsForItem, applyAlertUpdates, lastDesktopNotificationFor, observationsForOffer, type RecordedObservation } from '@/db/repo';
import { loadFx, loadSettings } from '@/db/settingsStore';
import { kv, STORAGE_KEYS } from '@/platform/storage';

function hasNotificationsApi(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.notifications?.create;
}

export async function showDesktopNotification(n: Pick<AppNotification, 'id' | 'title' | 'message' | 'ctaLabel' | 'url'>): Promise<boolean> {
  if (!hasNotificationsApi()) return false;
  try {
    await chrome.notifications.create(n.id, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title: n.title,
      message: n.message,
      buttons: n.url ? [{ title: n.ctaLabel }] : undefined,
      priority: 1,
    });
    return true;
  } catch (err) {
    console.warn('[WishSnag] notification failed', err);
    return false;
  }
}

export async function updateBadge(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.action?.setBadgeText) return;
  const unread = await db().notifications.filter((n) => n.readAt === null).count();
  await chrome.action.setBadgeText({ text: unread ? String(Math.min(unread, 99)) : '' });
  await chrome.action.setBadgeBackgroundColor?.({ color: '#7C5CFF' });
}

/** Turns genuine alert events into in-app notifications and (if allowed) desktop pop-ups. */
export async function dispatchAlertEvents(events: AlertEvent[], settings: Settings, now = Date.now()): Promise<AppNotification[]> {
  const created: AppNotification[] = [];
  const locale = resolveLocale(settings.language, settings.residenceCountry, settings.formatLocale);
  for (const event of events) {
    const item = await db().items.get(event.itemId);
    if (!item) continue;
    const offer = await db().offers.get(event.offerId);
    const text = buildNotificationText(event, item, offer, { language: settings.language, locale, homeCurrency: settings.displayCurrency });
    const decision = decideDesktopDelivery({
      now: new Date(now),
      desktopEnabled: settings.alerts.desktop,
      frequency: settings.alerts.frequency,
      quietHours: settings.alerts.quietHours,
      cooldownHours: settings.alerts.cooldownHours,
      lastSentForItem: await lastDesktopNotificationFor(event.itemId),
    });
    const status: DesktopStatus = decision === 'send' ? 'pending' : decision === 'hold' ? 'held' : decision === 'suppress' ? 'suppressed' : 'disabled';
    const record = await addNotification({ itemId: item.id, offerId: offer?.id ?? null, kind: event.type, ...text, url: offer?.url || null, dedupeKey: event.dedupeKey, desktopStatus: status, createdAt: now });
    if (!record) continue; // duplicate
    if (status === 'pending') {
      const ok = await showDesktopNotification(record);
      await db().notifications.update(record.id, { desktopStatus: ok ? 'sent' : 'disabled' });
      record.desktopStatus = ok ? 'sent' : 'disabled';
    }
    created.push(record);
  }
  if (created.length) await updateBadge();
  return created;
}

/** Evaluates the "cheaper verified offer" rule for an item using local offers. */
export async function evaluateCheaperForItem(itemId: string, settings: Settings, now = Date.now()): Promise<AlertEvent[]> {
  const item = await db().items.get(itemId);
  if (!item) return [];
  const offers = await db().offers.where('itemId').equals(itemId).toArray();
  if (offers.length < 2) return [];
  const fx = await loadFx();
  const cmp = compareForItem(item, offers, { settings, fx, now }, 'all');
  const alert = (await alertsForItem(itemId)).find((a) => a.type === 'cheaper_offer');
  const original = cmp.original;
  const verified = !!cmp.cheapest && original?.group === 'ranked' && !cmp.cheapest.comparable?.approximate && !original.comparable?.approximate;
  const { event, update } = evaluateCheaperOffer({
    item,
    alert,
    cheapestOfferId: cmp.cheapest?.offer.id ?? null,
    cheapestTotal: cmp.cheapest?.comparable?.amount ?? null,
    originalTotal: original?.comparable?.amount ?? null,
    currency: cmp.comparisonCurrency,
    verified,
    settings: settings.alerts,
    now,
  });
  if (update) await applyAlertUpdates([update]);
  return event ? [event] : [];
}

/** Call after every genuine new observation. */
export async function processObservation(rec: RecordedObservation, now = Date.now()): Promise<AppNotification[]> {
  if (!rec.observation) return [];
  const settings = await loadSettings();
  const item = await db().items.get(rec.offer.itemId);
  if (!item) return [];
  const alerts = await alertsForItem(item.id);
  const history = await observationsForOffer(rec.offer.id);
  const isPrimary = item.primaryOfferId === rec.offer.id;
  // Price-movement rules apply to the saved offer; other offers feed the cheaper-offer rule.
  const { events, updates } = isPrimary
    ? evaluateObservationAlerts({ item, offer: rec.offer, alerts, history, current: rec.observation, settings: settings.alerts, now })
    : { events: [], updates: [] };
  if (updates.length) await applyAlertUpdates(updates);
  const cheaper = await evaluateCheaperForItem(item.id, settings, now);
  return dispatchAlertEvents([...events, ...cheaper], settings, now);
}

/** Delivers held desktop notifications once quiet hours end, or as a daily digest. */
export async function flushHeldNotifications(now = Date.now()): Promise<number> {
  const settings = await loadSettings();
  const held = await db().notifications.where('desktopStatus').equals('held').toArray();
  if (!held.length) return 0;
  const date = new Date(now);
  if (!settings.alerts.desktop || !settings.alerts.enabled) {
    await db().notifications.bulkPut(held.map((n) => ({ ...n, desktopStatus: 'disabled' as const })));
    return 0;
  }
  if (settings.alerts.quietHours.enabled && isQuietTime(date, settings.alerts.quietHours.start, settings.alerts.quietHours.end)) return 0;
  if (settings.alerts.frequency === 'daily') {
    const last = (await kv().get<number>(STORAGE_KEYS.lastDigestAt)) ?? 0;
    const sameDay = new Date(last).toDateString() === date.toDateString();
    if (date.getHours() < settings.alerts.digestHour || sameDay) return 0;
    await kv().set({ [STORAGE_KEYS.lastDigestAt]: now });
  }
  const fresh = held.filter((n) => now - n.createdAt < 3 * 24 * 3600_000);
  if (fresh.length === 1) {
    await showDesktopNotification(fresh[0]!);
  } else if (fresh.length > 1) {
    const t = createTranslator(settings.language, resolveLocale(settings.language, settings.residenceCountry, settings.formatLocale));
    await showDesktopNotification({ id: `digest-${now}`, title: t('notif_digest_title'), message: t('notif_digest_body', { count: fresh.length }), ctaLabel: t('nav_open_dashboard'), url: null });
  }
  await db().notifications.bulkPut(held.map((n) => ({ ...n, desktopStatus: 'sent' as const })));
  return fresh.length;
}
