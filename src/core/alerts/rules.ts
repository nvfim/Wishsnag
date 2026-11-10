import type { AlertType, PriceAlert, PriceObservation, RetailerOffer, Settings, WishlistItem } from '../types';
import { percentChange, subtractMoney, toMinor } from '../pricing/money';

export interface AlertEvent {
  alertId: string;
  type: AlertType;
  itemId: string;
  offerId: string;
  dedupeKey: string;
  price: number;
  currency: string;
  /** Reference price the change is measured against (where meaningful). */
  previousPrice: number | null;
  savings: number | null;
  periodDays?: number;
}

export interface AlertUpdate {
  id: string;
  armed?: boolean;
  lastTriggeredAt?: number;
  lastTriggeredPrice?: number | null;
}

export interface ObservationAlertContext {
  item: WishlistItem;
  offer: RetailerOffer;
  alerts: readonly PriceAlert[];
  /** All observations for this offer, including `current`. */
  history: readonly PriceObservation[];
  current: PriceObservation;
  settings: Settings['alerts'];
  now: number;
}

const DAY = 24 * 3600_000;
const IN_STOCK = new Set(['in_stock', 'limited']);
const OUT = new Set(['out_of_stock', 'discontinued', 'backorder']);

/**
 * Evaluates price alerts after a genuine new observation. Pure: returns the events to
 * notify and the alert-state updates to persist. Duplicate suppression happens at two
 * levels: rule state (armed / last triggered price) here, and dedupe keys in the dispatcher.
 */
export function evaluateObservationAlerts(ctx: ObservationAlertContext): { events: AlertEvent[]; updates: AlertUpdate[] } {
  const { item, offer, current, settings, now } = ctx;
  const events: AlertEvent[] = [];
  const updates: AlertUpdate[] = [];
  if (!settings.enabled || item.archived || item.status === 'purchased') return { events, updates };

  const sorted = [...ctx.history].filter((o) => o.currency === current.currency).sort((a, b) => a.observedAt - b.observedAt || a.id.localeCompare(b.id));
  const prior = sorted.filter((o) => o.id !== current.id && o.observedAt <= current.observedAt);
  const previous = prior[prior.length - 1] ?? null;
  const saved = sorted[0] && sorted[0].id !== current.id ? sorted[0] : null;
  const minor = toMinor(current.price, current.currency);
  const key = (type: AlertType) => `${type}:${offer.id}:${current.currency}:${minor}`;

  for (const alert of ctx.alerts) {
    if (!alert.enabled || alert.itemId !== item.id) continue;
    switch (alert.type) {
      case 'below_target': {
        if (item.targetPrice === null || (item.targetCurrency ?? current.currency) !== current.currency) break;
        if (current.price <= item.targetPrice) {
          if (alert.armed) {
            events.push(ev(alert, key('below_target'), previous?.price ?? null, previous ? subtractMoney(previous.price, current.price, current.currency) : null));
            updates.push({ id: alert.id, armed: false, lastTriggeredAt: now, lastTriggeredPrice: current.price });
          }
        } else if (!alert.armed) {
          updates.push({ id: alert.id, armed: true });
        }
        break;
      }
      case 'percent_drop':
      case 'amount_drop': {
        const baseline = alert.lastTriggeredPrice ?? saved?.price ?? null;
        if (baseline === null || current.price >= baseline) break;
        const dropPct = -percentChange(baseline, current.price);
        const dropAmount = subtractMoney(baseline, current.price, current.currency);
        if (dropPct < settings.minDropPercent) break;
        const threshold = alert.threshold ?? settings.defaultDropPercent;
        const hit = alert.type === 'percent_drop' ? dropPct >= threshold : dropAmount >= threshold;
        if (hit) {
          events.push(ev(alert, key(alert.type), baseline, dropAmount));
          updates.push({ id: alert.id, lastTriggeredAt: now, lastTriggeredPrice: current.price });
        }
        break;
      }
      case 'lowest_in_period': {
        const days = alert.periodDays ?? 30;
        const window = prior.filter((o) => o.observedAt >= current.observedAt - days * DAY);
        if (window.length < 2) break;
        const min = Math.min(...window.map((o) => o.price));
        if (current.price < min && -percentChange(min, current.price) >= Math.min(1, settings.minDropPercent) && (alert.lastTriggeredPrice === null || current.price < alert.lastTriggeredPrice)) {
          events.push({ ...ev(alert, key('lowest_in_period'), min, subtractMoney(min, current.price, current.currency)), periodDays: days });
          updates.push({ id: alert.id, lastTriggeredAt: now, lastTriggeredPrice: current.price });
        }
        break;
      }
      case 'back_in_stock': {
        if (previous && OUT.has(previous.availability) && IN_STOCK.has(current.availability)) {
          events.push(ev(alert, `back_in_stock:${offer.id}:${current.observedAt}`, null, null));
          updates.push({ id: alert.id, lastTriggeredAt: now, lastTriggeredPrice: current.price });
        }
        break;
      }
      default:
        break;
    }
  }
  return { events, updates };

  function ev(alert: PriceAlert, dedupeKey: string, previousPrice: number | null, savings: number | null): AlertEvent {
    return { alertId: alert.id, type: alert.type, itemId: item.id, offerId: offer.id, dedupeKey, price: current.price, currency: current.currency, previousPrice, savings };
  }
}

export interface CheaperOfferContext {
  item: WishlistItem;
  alert: PriceAlert | undefined;
  cheapestOfferId: string | null;
  cheapestTotal: number | null;
  originalTotal: number | null;
  currency: string;
  /** True when both totals are complete and in the same currency (no conversion). */
  verified: boolean;
  settings: Settings['alerts'];
  now: number;
}

/** "New cheaper verified retailer offer" — only for complete, verified, same-currency totals. */
export function evaluateCheaperOffer(ctx: CheaperOfferContext): { event: AlertEvent | null; update: AlertUpdate | null } {
  const { alert, item } = ctx;
  if (!ctx.settings.enabled || !alert?.enabled || !ctx.verified || item.archived || item.status === 'purchased') return { event: null, update: null };
  if (!ctx.cheapestOfferId || ctx.cheapestOfferId === item.primaryOfferId || ctx.cheapestTotal === null || ctx.originalTotal === null) return { event: null, update: null };
  const savings = subtractMoney(ctx.originalTotal, ctx.cheapestTotal, ctx.currency);
  if (savings <= 0 || -percentChange(ctx.originalTotal, ctx.cheapestTotal) < ctx.settings.minDropPercent) return { event: null, update: null };
  if (alert.lastTriggeredPrice !== null && ctx.cheapestTotal >= alert.lastTriggeredPrice) return { event: null, update: null };
  return {
    event: {
      alertId: alert.id,
      type: 'cheaper_offer',
      itemId: item.id,
      offerId: ctx.cheapestOfferId,
      dedupeKey: `cheaper_offer:${ctx.cheapestOfferId}:${ctx.currency}:${toMinor(ctx.cheapestTotal, ctx.currency)}`,
      price: ctx.cheapestTotal,
      currency: ctx.currency,
      previousPrice: ctx.originalTotal,
      savings,
    },
    update: { id: alert.id, lastTriggeredAt: ctx.now, lastTriggeredPrice: ctx.cheapestTotal },
  };
}
