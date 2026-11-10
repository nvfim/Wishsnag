import Dexie, { type Table } from 'dexie';
import type { AppNotification, Collection, PriceAlert, PriceObservation, RetailerOffer, WishlistItem } from '@/core/types';

/** Cached results from (optional) server-side offer providers, to deduplicate API requests. */
export interface ProviderCacheEntry {
  key: string;
  itemId: string;
  providerId: string;
  createdAt: number;
  offers: RetailerOffer[];
  error?: string;
}

/** Deleted record markers for optional cloud sync. */
export interface Tombstone {
  key: string;
  table: SyncedTable;
  id: string;
  deletedAt: number;
}

export type SyncedTable = 'items' | 'offers' | 'observations' | 'collections' | 'alerts';

/**
 * Local-first database (IndexedDB via Dexie), shared by the popup, side panel,
 * dashboard and background service worker (same extension origin).
 *
 * Index notes: IndexedDB cannot index booleans, so boolean fields are filtered in memory.
 * `check.nextCheckAt` is null for offers that aren't scheduled, so only due candidates
 * appear in that index.
 */
export class WishSnagDB extends Dexie {
  items!: Table<WishlistItem, string>;
  offers!: Table<RetailerOffer, string>;
  observations!: Table<PriceObservation, string>;
  collections!: Table<Collection, string>;
  alerts!: Table<PriceAlert, string>;
  notifications!: Table<AppNotification, string>;
  providerCache!: Table<ProviderCacheEntry, string>;
  tombstones!: Table<Tombstone, string>;

  constructor(name = 'wishsnag') {
    super(name);
    this.version(1).stores({
      items: 'id, createdAt, updatedAt, priority, status, category, brand, *collectionIds, *tags',
      offers: 'id, itemId, urlKey, retailerId, retailerDomain, check.nextCheckAt, updatedAt',
      observations: 'id, offerId, itemId, observedAt, [offerId+observedAt], [itemId+observedAt]',
      collections: 'id, sortOrder, name, updatedAt',
      alerts: 'id, itemId, type, [itemId+type], updatedAt',
      notifications: 'id, createdAt, itemId, dedupeKey, desktopStatus',
      providerCache: 'key, itemId, createdAt',
      tombstones: 'key, table, deletedAt',
    });
  }
}

let instance: WishSnagDB | null = null;

export function db(): WishSnagDB {
  if (!instance) instance = new WishSnagDB();
  return instance;
}

/** Test hook: use a fresh database (e.g. with fake-indexeddb). */
export function setDb(next: WishSnagDB | null): void {
  instance = next;
}
