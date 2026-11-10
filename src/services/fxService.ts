import { fetchFxSnapshot, isFxStale, type FxSnapshot } from '@/core/pricing/exchangeRates';
import { loadFx, loadSettings, saveFx } from '@/db/settingsStore';

let inflight: Promise<FxSnapshot> | null = null;

/** Fetches fresh exchange rates (deduplicated across concurrent callers). */
export async function refreshRates(fetchImpl: typeof fetch = fetch): Promise<FxSnapshot> {
  if (!inflight) {
    inflight = fetchFxSnapshot(fetchImpl)
      .then(async (fx) => {
        await saveFx(fx);
        return fx;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Refreshes rates only when they are missing or older than a day and auto-refresh is on. */
export async function ensureRates(fetchImpl: typeof fetch = fetch): Promise<FxSnapshot | null> {
  const [settings, current] = await Promise.all([loadSettings(), loadFx()]);
  const dayOld = !current || Date.now() - current.fetchedAt > 20 * 3600_000;
  if (!settings.exchangeRates.autoRefresh || (!dayOld && !isFxStale(current))) return current;
  try {
    return await refreshRates(fetchImpl);
  } catch (err) {
    console.warn('[WishSnag] exchange rates unavailable:', err instanceof Error ? err.message : err);
    return current;
  }
}
