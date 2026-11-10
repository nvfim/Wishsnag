import { describe, expect, it } from 'vitest';
import { computeStats, filterRange, historyInsights, priceChanges } from '@/core/history/stats';
import { evaluateCheaperOffer, evaluateObservationAlerts } from '@/core/alerts/rules';
import { decideDesktopDelivery, isQuietTime, nextQuietEnd } from '@/core/alerts/schedule';
import { buildNotificationText } from '@/core/alerts/messages';
import { defaultSettings } from '@/core/settings';
import type { PriceAlert } from '@/core/types';
import { DAY, NOW, makeItem, makeOffer, obs } from './helpers';

const alertsSettings = defaultSettings().alerts;
const alert = (type: PriceAlert['type'], over: Partial<PriceAlert> = {}): PriceAlert => ({ id: `a-${type}`, itemId: 'item1', type, threshold: null, periodDays: null, enabled: true, lastTriggeredAt: null, lastTriggeredPrice: null, armed: true, createdAt: NOW - 30 * DAY, updatedAt: NOW - 30 * DAY, ...over });

describe('price history statistics', () => {
  const history = [obs(349, 40), obs(349, 30), obs(329, 20), obs(299, 10), obs(319, 5), obs(299, 1)];
  it('computes first / latest / lowest / highest / average from real observations', () => {
    const s = computeStats(history)!;
    expect(s.first.price).toBe(349);
    expect(s.latest.price).toBe(299);
    expect(s.lowest.price).toBe(299);
    expect(s.highest.price).toBe(349);
    expect(s.average).toBe(324);
    expect(s.changes).toBe(4);
    expect(s.decreases).toBe(3);
  });
  it('filters date ranges', () => {
    expect(filterRange(history, '7d', NOW)).toHaveLength(2);
    expect(filterRange(history, 'all', NOW)).toHaveLength(6);
  });
  it('lists changes newest first without repeating unchanged prices', () => {
    expect(priceChanges(history).map((c) => c.to)).toEqual([299, 319, 299, 329, 349]);
  });
  it('produces grounded insights and none for thin data', () => {
    const keys = historyInsights(history, NOW).map((i) => i.key);
    expect(keys).toContain('near_90_day_low');
    expect(keys).toContain('below_30_day_average');
    expect(keys).toContain('decreased_recently');
    expect(historyInsights([obs(10, 2), obs(9, 1)], NOW)).toEqual([]);
    expect(computeStats([])).toBeNull();
  });
});

describe('alert rules', () => {
  const item = makeItem({ targetPrice: 300, targetCurrency: 'AUD' });
  const offer = makeOffer();

  it('Scenario A — target price alert fires once when a genuine observation crosses the target', () => {
    const current = obs(299, 0);
    const history = [obs(349, 10), current];
    const r = evaluateObservationAlerts({ item, offer, alerts: [alert('below_target')], history, current, settings: alertsSettings, now: NOW });
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ type: 'below_target', price: 299, previousPrice: 349, savings: 50 });
    expect(r.updates[0]).toMatchObject({ armed: false, lastTriggeredPrice: 299 });
    // Same condition again → no duplicate (alert disarmed)
    const again = evaluateObservationAlerts({ item, offer, alerts: [alert('below_target', { armed: false })], history: [...history, obs(295, 0)], current: obs(295, 0), settings: alertsSettings, now: NOW });
    expect(again.events).toHaveLength(0);
  });

  it('re-arms the target alert when the price goes back above target', () => {
    const current = obs(320, 0);
    const r = evaluateObservationAlerts({ item, offer, alerts: [alert('below_target', { armed: false })], history: [obs(299, 3), current], current, settings: alertsSettings, now: NOW });
    expect(r.events).toHaveLength(0);
    expect(r.updates).toEqual([{ id: 'a-below_target', armed: true }]);
  });

  it('ignores targets in a different currency', () => {
    const current = obs(250, 0, { currency: 'USD' });
    const r = evaluateObservationAlerts({ item, offer, alerts: [alert('below_target')], history: [current], current, settings: alertsSettings, now: NOW });
    expect(r.events).toHaveLength(0);
  });

  it('percentage drop alerts compare with the saved price and never repeat for the same or higher price', () => {
    const saved = obs(10000, 20, { currency: 'BDT' });
    const current = obs(8500, 0, { currency: 'BDT' });
    const a = alert('percent_drop', { threshold: 10 });
    const r = evaluateObservationAlerts({ item: makeItem(), offer, alerts: [a], history: [saved, current], current, settings: alertsSettings, now: NOW });
    expect(r.events[0]).toMatchObject({ type: 'percent_drop', previousPrice: 10000, price: 8500, savings: 1500 });
    const repeat = evaluateObservationAlerts({ item: makeItem(), offer, alerts: [{ ...a, lastTriggeredPrice: 8500 }], history: [saved, current, obs(8500, 0, { currency: 'BDT' })], current: obs(8500, 0, { currency: 'BDT' }), settings: alertsSettings, now: NOW });
    expect(repeat.events).toHaveLength(0);
  });

  it('respects the global minimum drop and amount thresholds', () => {
    const current = obs(445, 0);
    const r = evaluateObservationAlerts({ item: makeItem(), offer, alerts: [alert('amount_drop', { threshold: 2 })], history: [obs(449, 5), current], current, settings: { ...alertsSettings, minDropPercent: 2 }, now: NOW });
    expect(r.events).toHaveLength(0); // <1% drop is below the 2% minimum
    const big = obs(399, 0);
    const r2 = evaluateObservationAlerts({ item: makeItem(), offer, alerts: [alert('amount_drop', { threshold: 40 })], history: [obs(449, 5), big], current: big, settings: alertsSettings, now: NOW });
    expect(r2.events[0]).toMatchObject({ savings: 50 });
  });

  it('lowest-in-period needs real prior history in the window', () => {
    const current = obs(280, 0);
    const r = evaluateObservationAlerts({ item: makeItem(), offer, alerts: [alert('lowest_in_period', { periodDays: 30 })], history: [obs(320, 20), obs(300, 10), current], current, settings: alertsSettings, now: NOW });
    expect(r.events[0]).toMatchObject({ type: 'lowest_in_period', periodDays: 30, previousPrice: 300 });
    const thin = evaluateObservationAlerts({ item: makeItem(), offer, alerts: [alert('lowest_in_period', { periodDays: 30 })], history: [obs(300, 10), current], current, settings: alertsSettings, now: NOW });
    expect(thin.events).toHaveLength(0);
  });

  it('back-in-stock fires only on a real out-of-stock → in-stock transition', () => {
    const current = obs(449, 0, { availability: 'in_stock' });
    const r = evaluateObservationAlerts({ item: makeItem(), offer, alerts: [alert('back_in_stock')], history: [obs(449, 2, { availability: 'out_of_stock' }), current], current, settings: alertsSettings, now: NOW });
    expect(r.events).toHaveLength(1);
    const none = evaluateObservationAlerts({ item: makeItem(), offer, alerts: [alert('back_in_stock')], history: [obs(449, 2), current], current, settings: alertsSettings, now: NOW });
    expect(none.events).toHaveLength(0);
  });

  it('no alerts for purchased/archived items or when alerts are disabled', () => {
    const current = obs(100, 0);
    const ctx = { offer, alerts: [alert('percent_drop', { threshold: 5 })], history: [obs(449, 5), current], current, now: NOW };
    expect(evaluateObservationAlerts({ ...ctx, item: makeItem({ status: 'purchased' }), settings: alertsSettings }).events).toHaveLength(0);
    expect(evaluateObservationAlerts({ ...ctx, item: makeItem({ archived: true }), settings: alertsSettings }).events).toHaveLength(0);
    expect(evaluateObservationAlerts({ ...ctx, item: makeItem(), settings: { ...alertsSettings, enabled: false } }).events).toHaveLength(0);
  });

  it('cheaper-offer alerts require verified complete totals in one currency and do not repeat', () => {
    const ctx = { item: makeItem(), alert: alert('cheaper_offer'), cheapestOfferId: 'o2', cheapestTotal: 399, originalTotal: 449, currency: 'AUD', verified: true, settings: alertsSettings, now: NOW };
    expect(evaluateCheaperOffer(ctx).event).toMatchObject({ savings: 50, offerId: 'o2' });
    expect(evaluateCheaperOffer({ ...ctx, verified: false }).event).toBeNull();
    expect(evaluateCheaperOffer({ ...ctx, alert: alert('cheaper_offer', { lastTriggeredPrice: 399 }) }).event).toBeNull();
    expect(evaluateCheaperOffer({ ...ctx, cheapestOfferId: 'o1' }).event).toBeNull();
  });
});

describe('notification scheduling', () => {
  it('handles overnight quiet hours', () => {
    expect(isQuietTime(new Date(2026, 10, 9, 23, 0), '22:00', '08:00')).toBe(true);
    expect(isQuietTime(new Date(2026, 10, 9, 7, 59), '22:00', '08:00')).toBe(true);
    expect(isQuietTime(new Date(2026, 10, 9, 8, 0), '22:00', '08:00')).toBe(false);
    expect(isQuietTime(new Date(2026, 10, 9, 13, 0), '12:00', '14:00')).toBe(true);
    expect(nextQuietEnd(new Date(2026, 10, 9, 23, 0), '08:00').getDate()).toBe(10);
  });
  it('decides desktop delivery with cooldowns, digests and quiet hours', () => {
    const base = { now: new Date(2026, 10, 9, 12, 0), desktopEnabled: true, frequency: 'instant' as const, quietHours: { enabled: true, start: '22:00', end: '08:00' }, cooldownHours: 6, lastSentForItem: null };
    expect(decideDesktopDelivery(base)).toBe('send');
    expect(decideDesktopDelivery({ ...base, lastSentForItem: base.now.getTime() - 3600_000 })).toBe('suppress');
    expect(decideDesktopDelivery({ ...base, frequency: 'daily' })).toBe('hold');
    expect(decideDesktopDelivery({ ...base, now: new Date(2026, 10, 9, 23, 30) })).toBe('hold');
    expect(decideDesktopDelivery({ ...base, desktopEnabled: false })).toBe('disabled');
  });
});

describe('notification copy (generated from genuine events)', () => {
  const event = { alertId: 'a', type: 'percent_drop' as const, itemId: 'i', offerId: 'o', dedupeKey: 'percent_drop:o:AUD:29900', price: 299, currency: 'AUD', previousPrice: 349, savings: 50 };
  it('writes the English price-drop message with real numbers', () => {
    const t = buildNotificationText(event, { title: 'Sony WH-1000XM5 headphones' }, { retailerName: 'JB Hi-Fi' }, { language: 'en', locale: 'en-AU', homeCurrency: 'AUD' });
    expect(['Your wishlist just got cheaper!', 'Price drop spotted!']).toContain(t.title);
    expect(t.message).toBe('Your saved Sony WH-1000XM5 headphones dropped from $349 to $299. You could save $50.');
  });
  it('formats Bangladesh taka examples', () => {
    const bd = { ...event, currency: 'BDT', price: 8500, previousPrice: 10000, savings: 1500, dedupeKey: 'x' };
    const t = buildNotificationText(bd, { title: 'phone' }, undefined, { language: 'en', locale: 'en-BD', homeCurrency: 'BDT' });
    expect(t.message).toContain('৳10,000');
    expect(t.message).toContain('৳8,500');
    const tb = buildNotificationText(bd, { title: 'ফোন' }, undefined, { language: 'bn', locale: 'bn-BD', homeCurrency: 'BDT' });
    expect(tb.message).toContain('৮,৫০০৳');
  });
  it('target reached copy', () => {
    const t = buildNotificationText({ ...event, type: 'below_target' }, { title: 'Headphones' }, undefined, { language: 'en', locale: 'en-AU', homeCurrency: 'AUD' });
    expect(t).toEqual({ title: 'That’s a snag!', message: 'Headphones just hit your target price: $299.', ctaLabel: 'Check It Out' });
  });
});
