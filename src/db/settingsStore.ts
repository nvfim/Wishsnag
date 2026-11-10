import type { Settings } from '@/core/types';
import { normaliseSettings, type BrowserHints } from '@/core/settings';
import { kv, STORAGE_KEYS } from '@/platform/storage';
import type { FxSnapshot } from '@/core/pricing/exchangeRates';

export function browserHints(): BrowserHints {
  let timeZone: string | undefined;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timeZone = undefined;
  }
  const languages = typeof navigator !== 'undefined' ? [...(navigator.languages ?? [navigator.language])].filter(Boolean) : [];
  return { timeZone, languages };
}

export async function loadSettings(): Promise<Settings> {
  return normaliseSettings(await kv().get(STORAGE_KEYS.settings), browserHints());
}

export async function saveSettings(patch: Partial<Settings> | ((current: Settings) => Settings)): Promise<Settings> {
  const current = await loadSettings();
  const next = normaliseSettings(typeof patch === 'function' ? patch(current) : { ...current, ...patch }, browserHints());
  await kv().set({ [STORAGE_KEYS.settings]: next });
  return next;
}

export function onSettingsChanged(listener: (settings: Settings) => void): () => void {
  return kv().onChanged((changes) => {
    const change = changes[STORAGE_KEYS.settings];
    if (change) listener(normaliseSettings(change.newValue, browserHints()));
  });
}

export async function loadFx(): Promise<FxSnapshot | null> {
  return (await kv().get<FxSnapshot>(STORAGE_KEYS.fx)) ?? null;
}

export async function saveFx(fx: FxSnapshot): Promise<void> {
  await kv().set({ [STORAGE_KEYS.fx]: fx });
}

export function onFxChanged(listener: (fx: FxSnapshot | null) => void): () => void {
  return kv().onChanged((changes) => {
    const change = changes[STORAGE_KEYS.fx];
    if (change) listener((change.newValue as FxSnapshot | undefined) ?? null);
  });
}
