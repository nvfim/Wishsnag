/**
 * Thin wrapper over chrome.storage.local with an in-memory fallback so the same code
 * runs in unit tests and in a plain browser tab during development.
 */
type Listener = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>) => void;

interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set(values: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
  onChanged(listener: Listener): () => void;
}

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

function chromeStore(): KeyValueStore {
  return {
    async get<T>(key: string) {
      const res = await chrome.storage.local.get(key);
      return res[key] as T | undefined;
    },
    set: (values) => chrome.storage.local.set(values),
    remove: (keys) => chrome.storage.local.remove(keys),
    clear: () => chrome.storage.local.clear(),
    onChanged(listener) {
      const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
        if (area === 'local') listener(changes);
      };
      chrome.storage.onChanged.addListener(handler);
      return () => chrome.storage.onChanged.removeListener(handler);
    },
  };
}

function memoryStore(): KeyValueStore {
  const data = new Map<string, unknown>();
  const listeners = new Set<Listener>();
  const emit = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>) => listeners.forEach((l) => l(changes));
  return {
    async get<T>(key: string) {
      const v = data.get(key);
      return v === undefined ? undefined : (structuredClone(v) as T);
    },
    async set(values) {
      const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
      for (const [k, v] of Object.entries(values)) {
        changes[k] = { oldValue: data.get(k), newValue: v };
        data.set(k, structuredClone(v));
      }
      emit(changes);
    },
    async remove(keys) {
      const changes: Record<string, { oldValue?: unknown }> = {};
      for (const k of Array.isArray(keys) ? keys : [keys]) {
        changes[k] = { oldValue: data.get(k) };
        data.delete(k);
      }
      emit(changes);
    },
    async clear() {
      data.clear();
      emit({});
    },
    onChanged(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

let store: KeyValueStore | null = null;
export function kv(): KeyValueStore {
  if (!store) store = hasChromeStorage() ? chromeStore() : memoryStore();
  return store;
}

/** Test hook. */
export function resetKv(): void {
  store = null;
}

export const STORAGE_KEYS = {
  settings: 'wishsnag.settings',
  fx: 'wishsnag.fx',
  pendingDraft: 'wishsnag.pendingDraft',
  monitorStatus: 'wishsnag.monitorStatus',
  lastDigestAt: 'wishsnag.lastDigestAt',
  cloudSession: 'wishsnag.cloud.session',
  cloudSync: 'wishsnag.cloud.sync',
  originBackoff: 'wishsnag.originBackoff',
} as const;
