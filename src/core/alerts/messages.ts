import type { AppNotification, LanguageCode, NotificationKind, RetailerOffer, WishlistItem } from '../types';
import { createTranslator } from '../i18n';
import { formatMoney } from '../pricing/currency';
import { hashString } from '../util/id';
import type { AlertEvent } from './rules';

export interface MessageContext {
  language: LanguageCode;
  locale: string;
  homeCurrency: string;
}

export interface NotificationText {
  title: string;
  message: string;
  ctaLabel: string;
}

function shortName(title: string): string {
  const t = title.trim();
  return t.length > 60 ? `${t.slice(0, 57).trimEnd()}…` : t;
}

/**
 * Builds notification copy from a genuine alert event. Short, informative and a little
 * playful — the numbers always come from the observation that triggered the alert.
 */
export function buildNotificationText(event: AlertEvent, item: Pick<WishlistItem, 'title'>, offer: Pick<RetailerOffer, 'retailerName'> | undefined, ctx: MessageContext): NotificationText {
  const t = createTranslator(ctx.language, ctx.locale);
  const money = (amount: number | null) => (amount === null ? '' : formatMoney(amount, event.currency, { locale: ctx.locale, homeCurrency: ctx.homeCurrency }));
  const name = shortName(item.title);
  const variant = hashString(event.dedupeKey) % 2;
  switch (event.type) {
    case 'percent_drop':
    case 'amount_drop':
      return {
        title: t(variant ? 'notif_drop_title_2' : 'notif_drop_title_1'),
        message: t('notif_drop_body', { name, old: money(event.previousPrice), new: money(event.price), savings: money(event.savings) }),
        ctaLabel: t(variant ? 'notif_drop_cta_2' : 'notif_drop_cta_1'),
      };
    case 'below_target':
      return { title: t('notif_target_title'), message: t('notif_target_body', { name, price: money(event.price) }), ctaLabel: t('notif_target_cta') };
    case 'lowest_in_period':
      return {
        title: t('notif_lowest_title', { days: event.periodDays ?? 30 }),
        message: t('notif_lowest_body', { name, price: money(event.price), days: event.periodDays ?? 30 }),
        ctaLabel: t('notif_drop_cta_1'),
      };
    case 'cheaper_offer':
      return {
        title: t('notif_cheaper_title'),
        message: t('notif_cheaper_body', { retailer: offer?.retailerName ?? '', name, price: money(event.price), savings: money(event.savings) }),
        ctaLabel: t('notif_drop_cta_2'),
      };
    case 'back_in_stock':
      return { title: t('notif_stock_title'), message: t('notif_stock_body', { name, retailer: offer?.retailerName ?? '' }), ctaLabel: t('notif_stock_cta') };
  }
}

export function notificationKindIcon(kind: NotificationKind): 'drop' | 'target' | 'stock' | 'cheaper' | 'system' {
  switch (kind) {
    case 'below_target':
      return 'target';
    case 'back_in_stock':
      return 'stock';
    case 'cheaper_offer':
      return 'cheaper';
    case 'system':
      return 'system';
    default:
      return 'drop';
  }
}

export type NewNotification = Omit<AppNotification, 'id' | 'createdAt' | 'readAt' | 'desktopStatus'>;
