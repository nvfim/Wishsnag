import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { AppNotification, Collection, PriceAlert, PriceObservation, RetailerOffer, WishlistItem } from '@/core/types';
import { summarise, type ItemSummary } from '@/core/summary';
import { db } from '@/db/schema';
import { useApp } from '../app/AppContext';

/** Live (auto-updating) queries over the local database — changes from any extension context propagate. */
export function useItems(): WishlistItem[] | undefined {
  return useLiveQuery(() => db().items.toArray(), []);
}

export function useOffers(): RetailerOffer[] | undefined {
  return useLiveQuery(() => db().offers.toArray(), []);
}

export function useCollections(): Collection[] | undefined {
  return useLiveQuery(async () => (await db().collections.toArray()).sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt), []);
}

export function useNotifications(limit = 100): AppNotification[] | undefined {
  return useLiveQuery(() => db().notifications.orderBy('createdAt').reverse().limit(limit).toArray(), [limit]);
}

export function useUnreadCount(): number {
  return useLiveQuery(() => db().notifications.filter((n) => n.readAt === null).count(), []) ?? 0;
}

export interface ItemBundle {
  item: WishlistItem;
  offers: RetailerOffer[];
  observations: PriceObservation[];
  alerts: PriceAlert[];
}

export function useItemBundle(id: string | null | undefined): ItemBundle | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null;
    const item = await db().items.get(id);
    if (!item) return null;
    const [offers, observations, alerts] = await Promise.all([
      db().offers.where('itemId').equals(id).toArray(),
      db().observations.where('[itemId+observedAt]').between([id, -Infinity], [id, Infinity]).toArray(),
      db().alerts.where('itemId').equals(id).toArray(),
    ]);
    offers.sort((a, b) => (a.id === item.primaryOfferId ? -1 : b.id === item.primaryOfferId ? 1 : a.createdAt - b.createdAt));
    return { item, offers, observations, alerts };
  }, [id]);
}

/** Derived per-item summaries (prices, drops, targets, savings) for lists and stats. */
export function useSummaries(): ItemSummary[] | undefined {
  const items = useItems();
  const offers = useOffers();
  const { settings, fx } = useApp();
  return useMemo(() => {
    if (!items || !offers) return undefined;
    const byItem = new Map<string, RetailerOffer[]>();
    for (const o of offers) (byItem.get(o.itemId) ?? byItem.set(o.itemId, []).get(o.itemId)!).push(o);
    const ctx = { settings, fx, now: Date.now() };
    return items.map((it) => summarise(it, byItem.get(it.id) ?? [], ctx));
  }, [items, offers, settings, fx]);
}
