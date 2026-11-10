import { describe, expect, it } from 'vitest';
import { alertToRow, itemToRow, offerToRow, rowToLocal, shouldApplyRemote } from '@/cloud/sync';
import { cloudConfig } from '@/cloud/client';
import { defaultSettings } from '@/core/settings';
import { makeItem, makeOffer } from './helpers';

describe('cloud sync mapping & conflict resolution', () => {
  it('maps local records to typed rows with the full record kept in data', () => {
    const row = itemToRow(makeItem({ targetPrice: 300, targetCurrency: 'AUD', identifiers: { gtin: '4548736132610' } }), 'u1', 449, 'AUD', 'https://s.example/p', 'Store');
    expect(row).toMatchObject({ user_id: 'u1', id: 'item1', gtin14: '04548736132610', saved_price: 449, target_price: 300, priority: 'medium' });
    expect(rowToLocal('wishlist_items', row)).toMatchObject({ id: 'item1', title: makeItem().title });
    const offer = offerToRow(makeOffer({ shippingQuotes: [{ destinationCountry: 'AU', amount: 9.95, currency: 'AUD', source: 'page', recordedAt: 1 }] }), 'u1', 'AU');
    expect(offer).toMatchObject({ wishlist_item_id: 'item1', shipping_cost: 9.95, match_confidence: 'source' });
    expect(alertToRow({ id: 'a', itemId: 'item1', type: 'percent_drop', threshold: 10, periodDays: null, enabled: true, lastTriggeredAt: null, lastTriggeredPrice: null, armed: true, createdAt: 1, updatedAt: 2 }, 'u1')).toMatchObject({ alert_type: 'percent_drop', threshold: 10 });
  });

  it('observations are rebuilt from typed columns', () => {
    expect(rowToLocal('price_observations', { id: 'o', offer_id: 'of', wishlist_item_id: 'i', price: '12.50', currency: 'GBP', availability: 'in_stock', source: 'cloud_monitor', observed_at: '2026-11-09T00:00:00Z' })).toEqual({ id: 'o', offerId: 'of', itemId: 'i', price: 12.5, currency: 'GBP', availability: 'in_stock', source: 'cloud_monitor', observedAt: Date.parse('2026-11-09T00:00:00Z') });
  });

  it('newest edit wins; remote deletions remove local copies', () => {
    const remote = { id: 'x', updated_at: '2026-11-09T10:00:00Z' };
    expect(shouldApplyRemote(undefined, remote)).toBe('put');
    expect(shouldApplyRemote({ updatedAt: Date.parse('2026-11-09T09:00:00Z') }, remote)).toBe('put');
    expect(shouldApplyRemote({ updatedAt: Date.parse('2026-11-09T11:00:00Z') }, remote)).toBe('skip');
    expect(shouldApplyRemote({ updatedAt: 0 }, { ...remote, deleted_at: '2026-11-09T12:00:00Z' })).toBe('delete');
    expect(shouldApplyRemote(undefined, { ...remote, deleted_at: '2026-11-09T12:00:00Z' })).toBe('skip');
  });

  it('cloud is opt-in and only accepts https project URLs', () => {
    const s = defaultSettings();
    expect(cloudConfig(s)).toBeNull();
    expect(cloudConfig({ ...s, cloud: { url: 'http://insecure.example', anonKey: 'k' } })).toBeNull();
    expect(cloudConfig({ ...s, cloud: { url: 'https://abc.supabase.co/', anonKey: 'k' } })).toEqual({ url: 'https://abc.supabase.co', anonKey: 'k' });
  });
});
