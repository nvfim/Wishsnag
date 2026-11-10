import { z } from 'zod';
import type { CurrencyCode } from '../types';
import { isCurrencyCode } from './currency';
import { roundMoney } from './money';

/**
 * Exchange-rate data comes from the open, CC0-licensed "exchange-api" dataset by
 * Fawaz Ahmed (daily rates, includes BDT and AUD), served via jsDelivr with the
 * project's documented Cloudflare Pages mirror as a fallback. No API key needed.
 * Rates are never invented: if none can be fetched, conversions are reported as unavailable.
 */
export const FX_SOURCES = [
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
  'https://latest.currency-api.pages.dev/v1/currencies/usd.json',
] as const;

export const FX_PROVIDER_NAME = 'exchange-api by Fawaz Ahmed (CC0), via jsDelivr';
/** Rates older than this are shown as stale. */
export const FX_STALE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

export interface FxSnapshot {
  base: 'USD';
  /** Units of currency per 1 USD, upper-case ISO codes only. */
  rates: Record<CurrencyCode, number>;
  /** Publication date of the rates (YYYY-MM-DD). */
  date: string;
  fetchedAt: number;
  provider: string;
  sourceUrl: string;
}

const responseSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  usd: z.record(z.string(), z.number().positive().finite()),
});

export function parseFxResponse(json: unknown, sourceUrl: string, now = Date.now()): FxSnapshot {
  const parsed = responseSchema.parse(json);
  const rates: Record<string, number> = {};
  for (const [code, rate] of Object.entries(parsed.usd)) {
    const upper = code.toUpperCase();
    if (isCurrencyCode(upper)) rates[upper] = rate;
  }
  if (rates.USD !== 1 && rates.USD !== undefined && Math.abs(rates.USD - 1) > 1e-9) {
    throw new Error('Exchange-rate data is inconsistent (USD base is not 1).');
  }
  rates.USD = 1;
  if (Object.keys(rates).length < 20) throw new Error('Exchange-rate data looks incomplete.');
  return { base: 'USD', rates, date: parsed.date, fetchedAt: now, provider: FX_PROVIDER_NAME, sourceUrl };
}

export interface Conversion {
  amount: number;
  currency: CurrencyCode;
  /** Always true for cross-currency conversions — never a guaranteed purchase price. */
  approximate: boolean;
  rate: number;
  rateDate: string | null;
}

export function getRate(from: CurrencyCode, to: CurrencyCode, fx: FxSnapshot | null): number | null {
  if (from === to) return 1;
  if (!fx) return null;
  const f = fx.rates[from];
  const t = fx.rates[to];
  if (!f || !t) return null;
  return t / f;
}

export function convert(amount: number, from: CurrencyCode, to: CurrencyCode, fx: FxSnapshot | null): Conversion | null {
  if (from === to) return { amount, currency: to, approximate: false, rate: 1, rateDate: null };
  const rate = getRate(from, to, fx);
  if (rate === null) return null;
  return { amount: roundMoney(amount * rate, to), currency: to, approximate: true, rate, rateDate: fx?.date ?? null };
}

export function isFxStale(fx: FxSnapshot | null, now = Date.now()): boolean {
  if (!fx) return true;
  const published = Date.parse(`${fx.date}T00:00:00Z`);
  const reference = Number.isFinite(published) ? Math.max(published, fx.fetchedAt - 24 * 3600_000) : fx.fetchedAt;
  return now - reference > FX_STALE_AFTER_MS;
}

export async function fetchFxSnapshot(fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<FxSnapshot> {
  const errors: string[] = [];
  for (const url of FX_SOURCES) {
    try {
      const res = await fetchImpl(url, { credentials: 'omit', cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseFxResponse(await res.json(), url, now);
    } catch (err) {
      errors.push(`${new URL(url).hostname}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`Could not load exchange rates (${errors.join('; ')})`);
}
