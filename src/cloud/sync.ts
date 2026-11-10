import type { AppNotification, Collection, PriceAlert, PriceObservation, RetailerOffer, Settings, WishlistItem } from '@/core/types';
import { normaliseGtin } from '@/core/matching/identifiers';
import { db } from '@/db/schema';
import { kv, STORAGE_KEYS } from '@/platform/storage';
import { getSupabase } from './client';

/**
 * Local-first, last-write-wins sync between IndexedDB and Supabase.
 *   push: local records changed since the last push (+ deletions from tombstones)
 *   pull: remote rows with server_updated_at after the last pull cursor
 * Conflicts resolve by the record's own updatedAt (the newest edit wins).
 */

export type CloudTable = 'collections' | 'wishlist_items' | 'retailer_offers' | 'price_observations' | 'price_alerts' | 'notifications';
type Row = Record<string, unknown> & { id: string; user_id?: string; data?: unknown; updated_at?: string | null; deleted_at?: string | null; server_updated_at?: string };

const iso = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString() : null);
const ms = (s: unknown) => (typeof s === 'string' ? Date.parse(s) : 0);

export function itemToRow(i: WishlistItem, userId: string, savedPrice: number | null, currency: string | null, url: string | null, retailer: string | null): Row {
  return {
    user_id: userId, id: i.id, title: i.title, brand: i.brand ?? null, model: i.model ?? null, gtin14: normaliseGtin(i.identifiers.gtin), source_retailer: retailer, source_url: url,
    saved_price: savedPrice, currency, target_price: i.targetPrice, target_currency: i.targetCurrency, priority: i.priority, notes: i.notes, status: i.status, archived: i.archived,
    data: i, created_at: iso(i.createdAt), updated_at: iso(i.updatedAt), deleted_at: null,
  };
}

export function offerToRow(o: RetailerOffer, userId: string, deliveryCountry: string): Row {
  const ship = o.shippingQuotes.find((q) => q.destinationCountry === deliveryCountry);
  return {
    user_id: userId, id: o.id, wishlist_item_id: o.itemId, retailer_id: o.retailerId, retailer_name: o.retailerName, retailer_country: o.retailerCountry, product_url: o.url || null,
    price: o.price, currency: o.currency, shipping_cost: ship?.amount ?? null, availability: o.availability, condition: o.condition, match_confidence: o.matchConfidence,
    verified_at: iso(o.lastVerifiedAt), monitor_enabled: o.check.enabled, next_check_at: iso(o.check.nextCheckAt), check_failures: o.check.failures, data: o, updated_at: iso(o.updatedAt), deleted_at: null,
  };
}

export function observationToRow(o: PriceObservation, userId: string): Row {
  return { user_id: userId, id: o.id, offer_id: o.offerId, wishlist_item_id: o.itemId, price: o.price, currency: o.currency, availability: o.availability, source: o.source, observed_at: iso(o.observedAt), deleted_at: null };
}

export function collectionToRow(c: Collection, userId: string): Row {
  return { user_id: userId, id: c.id, name: c.name, description: c.description, emoji: c.emoji, color: c.color, budget: c.budget, budget_currency: c.budgetCurrency, sort_order: c.sortOrder, data: c, updated_at: iso(c.updatedAt), deleted_at: null };
}

export function alertToRow(a: PriceAlert, userId: string): Row {
  return { user_id: userId, id: a.id, wishlist_item_id: a.itemId, alert_type: a.type, threshold: a.threshold, period_days: a.periodDays, enabled: a.enabled, last_triggered_at: iso(a.lastTriggeredAt), last_triggered_price: a.lastTriggeredPrice, data: a, updated_at: iso(a.updatedAt), deleted_at: null };
}

export function notificationToRow(n: AppNotification, userId: string): Row {
  return { user_id: userId, id: n.id, wishlist_item_id: n.itemId, type: n.kind, title: n.title, message: n.message, dedupe_key: n.dedupeKey, created_at: iso(n.createdAt), read_at: iso(n.readAt), data: n, deleted_at: null };
}

/** Last-write-wins decision for a pulled row. */
export function shouldApplyRemote(local: { updatedAt?: number } | undefined, remote: Row): 'put' | 'delete' | 'skip' {
  const remoteUpdated = ms(remote.updated_at) || ms(remote.server_updated_at);
  if (remote.deleted_at) return local ? 'delete' : 'skip';
  if (!local) return 'put';
  return (local.updatedAt ?? 0) < remoteUpdated ? 'put' : 'skip';
}

export function rowToLocal<T>(table: CloudTable, row: Row): T | null {
  if (table === 'price_observations') {
    return { id: row.id, offerId: row.offer_id, itemId: row.wishlist_item_id, price: Number(row.price), currency: row.currency, availability: row.availability, source: row.source, observedAt: ms(row.observed_at) } as T;
  }
  if (!row.data || typeof row.data !== 'object') return null;
  return row.data as T;
}

interface SyncState {
  userId: string;
  lastPushAt: number;
  pulledUntil: Partial<Record<CloudTable, string>>;
  lastSyncAt: number;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
}

const TABLE_ORDER: CloudTable[] = ['collections', 'wishlist_items', 'retailer_offers', 'price_observations', 'price_alerts', 'notifications'];
const LOCAL: Record<CloudTable, 'collections' | 'items' | 'offers' | 'observations' | 'alerts' | 'notifications'> = {
  collections: 'collections', wishlist_items: 'items', retailer_offers: 'offers', price_observations: 'observations', price_alerts: 'alerts', notifications: 'notifications',
};
const TOMBSTONE_TABLE: Partial<Record<CloudTable, string>> = { collections: 'collections', wishlist_items: 'items', retailer_offers: 'offers', price_observations: 'observations', price_alerts: 'alerts' };

export async function syncNow(settings: Settings): Promise<SyncResult> {
  const sb = await getSupabase(settings);
  if (!sb) throw new Error('Cloud is not configured');
  const { data: auth } = await sb.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('Not signed in');
  const prev = (await kv().get<SyncState>(STORAGE_KEYS.cloudSync)) ?? null;
  const state: SyncState = prev && prev.userId === userId ? prev : { userId, lastPushAt: 0, pulledUntil: {}, lastSyncAt: 0 };
  const startedAt = Date.now();
  const d = db();
  let pushed = 0;
  let pulled = 0;

  // ---------------- push
  const [items, offers, observations, collections, alerts, notifications, tombstones] = await Promise.all([
    d.items.where('updatedAt').above(state.lastPushAt).toArray(),
    d.offers.where('updatedAt').above(state.lastPushAt).toArray(),
    d.observations.where('observedAt').above(state.lastPushAt - 60_000).toArray(),
    d.collections.where('updatedAt').above(state.lastPushAt).toArray(),
    d.alerts.where('updatedAt').above(state.lastPushAt).toArray(),
    d.notifications.where('createdAt').above(state.lastPushAt - 60_000).toArray(),
    d.tombstones.where('deletedAt').above(state.lastPushAt).toArray(),
  ]);
  const primaryById = new Map((await d.offers.toArray()).map((o) => [o.id, o]));
  const upsert = async (table: CloudTable, rows: Row[], onConflict = 'user_id,id', ignoreDuplicates = false) => {
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } = await sb.from(table).upsert(chunk, { onConflict, ignoreDuplicates });
      if (error) throw new Error(`${table}: ${error.message}`);
      pushed += chunk.length;
    }
  };
  await upsert('collections', collections.map((c) => collectionToRow(c, userId)));
  await upsert(
    'wishlist_items',
    items.map((i) => {
      const p = i.primaryOfferId ? primaryById.get(i.primaryOfferId) : undefined;
      return itemToRow(i, userId, p?.history?.firstPrice ?? p?.price ?? null, p?.currency ?? null, p?.url || null, p?.retailerName ?? null);
    }),
  );
  if (items.length) {
    const ids = items.map((i) => i.id);
    await sb.from('collection_items').delete().in('wishlist_item_id', ids);
    const joins = items.flatMap((i) => i.collectionIds.map((c) => ({ user_id: userId, collection_id: c, wishlist_item_id: i.id })));
    if (joins.length) await upsert('collection_items' as CloudTable, joins as unknown as Row[], 'user_id,collection_id,wishlist_item_id', true);
  }
  await upsert('retailer_offers', offers.map((o) => offerToRow(o, userId, settings.deliveryCountry)));
  await upsert('price_observations', observations.map((o) => observationToRow(o, userId)), 'user_id,id', true);
  await upsert('price_alerts', alerts.map((a) => alertToRow(a, userId)));
  await upsert('notifications', notifications.map((n) => notificationToRow(n, userId)), 'user_id,dedupe_key', true);
  for (const ts of tombstones) {
    const table = (Object.keys(TOMBSTONE_TABLE) as CloudTable[]).find((k) => TOMBSTONE_TABLE[k] === ts.table);
    if (!table) continue;
    const { error } = await sb.from(table).update({ deleted_at: new Date(ts.deletedAt).toISOString(), updated_at: new Date(ts.deletedAt).toISOString() }).eq('id', ts.id);
    if (error) throw new Error(`${table}: ${error.message}`);
    pushed++;
  }

  // ---------------- pull
  for (const table of TABLE_ORDER) {
    let cursor = state.pulledUntil[table] ?? '1970-01-01T00:00:00Z';
    for (;;) {
      const { data, error } = await sb.from(table).select('*').gt('server_updated_at', cursor).order('server_updated_at', { ascending: true }).limit(500);
      if (error) throw new Error(`${table}: ${error.message}`);
      const rows = (data ?? []) as Row[];
      if (!rows.length) break;
      const localTable = d.table(LOCAL[table]);
      await d.transaction('rw', localTable, async () => {
        for (const row of rows) {
          const local = (await localTable.get(row.id)) as { updatedAt?: number; observedAt?: number; createdAt?: number } | undefined;
          const localStamp = local ? { updatedAt: local.updatedAt ?? local.observedAt ?? local.createdAt } : undefined;
          const decision = shouldApplyRemote(localStamp, row);
          if (decision === 'delete') await localTable.delete(row.id);
          else if (decision === 'put') {
            const rec = rowToLocal(table, row);
            if (rec) await localTable.put(rec);
          }
          if (decision !== 'skip') pulled++;
        }
      });
      cursor = rows[rows.length - 1]!.server_updated_at as string;
      state.pulledUntil[table] = cursor;
      if (rows.length < 500) break;
    }
  }

  state.lastPushAt = startedAt;
  state.lastSyncAt = Date.now();
  await kv().set({ [STORAGE_KEYS.cloudSync]: state });
  return { pushed, pulled };
}

export async function lastSyncAt(): Promise<number | null> {
  return (await kv().get<SyncState>(STORAGE_KEYS.cloudSync))?.lastSyncAt ?? null;
}
