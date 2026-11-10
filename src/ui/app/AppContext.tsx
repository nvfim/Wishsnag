import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CountryCode, CurrencyCode, Settings } from '@/core/types';
import { createTranslator, type Translator } from '@/core/i18n';
import { formatMoney, formatNumber, formatPercent, resolveLocale } from '@/core/pricing/currency';
import { convert, type FxSnapshot } from '@/core/pricing/exchangeRates';
import { countryName } from '@/core/geo/countries';
import { loadFx, loadSettings, onFxChanged, onSettingsChanged, saveSettings } from '@/db/settingsStore';
import { ConfirmProvider, ToastProvider } from '../components/overlay';

export interface Formatters {
  locale: string;
  money: (amount: number, currency: CurrencyCode, opts?: { code?: boolean }) => string;
  /** Converts to the display currency; returns "≈ ৳…" or null when no rate exists. */
  approx: (amount: number, currency: CurrencyCode, to?: CurrencyCode) => string | null;
  number: (n: number, digits?: number) => string;
  percent: (p: number, digits?: number) => string;
  relative: (ts: number | null | undefined) => string;
  date: (ts: number, style?: 'short' | 'medium' | 'long') => string;
  dateTime: (ts: number) => string;
  country: (code: CountryCode | null | undefined) => string;
}

export interface AppState {
  settings: Settings;
  fx: FxSnapshot | null;
  t: Translator;
  f: Formatters;
  updateSettings: (patch: Partial<Settings> | ((s: Settings) => Settings)) => Promise<Settings>;
}

const Ctx = createContext<AppState | null>(null);

const THEME_CACHE_KEY = 'wishsnag.theme';

export function applyTheme(theme: Settings['theme']): void {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', !!dark);
  try {
    localStorage.setItem(THEME_CACHE_KEY, theme);
  } catch {
    /* ignore */
  }
}

/** Applies the last known theme synchronously before React renders (avoids a flash). */
export function applyCachedTheme(): void {
  try {
    const cached = localStorage.getItem(THEME_CACHE_KEY) as Settings['theme'] | null;
    applyTheme(cached ?? 'system');
  } catch {
    applyTheme('system');
  }
}

export function makeFormatters(settings: Settings, fx: FxSnapshot | null): Formatters {
  const locale = resolveLocale(settings.language, settings.residenceCountry, settings.formatLocale);
  const home = settings.displayCurrency;
  const rtf = (() => {
    try {
      return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    } catch {
      return new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    }
  })();
  return {
    locale,
    money: (amount, currency, opts) => formatMoney(amount, currency, { locale, homeCurrency: home, display: opts?.code ? 'code' : 'auto' }),
    approx: (amount, currency, to = home) => {
      if (currency === to) return null;
      const c = convert(amount, currency, to, fx);
      return c ? `≈ ${formatMoney(c.amount, to, { locale, homeCurrency: home })}` : null;
    },
    number: (n, digits = 0) => formatNumber(n, locale, { maximumFractionDigits: digits }),
    percent: (p, digits = 0) => formatPercent(p, locale, digits),
    relative: (ts) => {
      if (!ts) return '—';
      const diff = ts - Date.now();
      const abs = Math.abs(diff);
      if (abs < 60_000) return rtf.format(0, 'second');
      if (abs < 3600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
      if (abs < 86400_000) return rtf.format(Math.round(diff / 3600_000), 'hour');
      if (abs < 30 * 86400_000) return rtf.format(Math.round(diff / 86400_000), 'day');
      return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(ts);
    },
    date: (ts, style = 'medium') => new Intl.DateTimeFormat(locale, { dateStyle: style }).format(ts),
    dateTime: (ts) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(ts),
    country: (code) => (code ? countryName(code, settings.language) : ''),
  };
}

export function AppProvider({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [fx, setFx] = useState<FxSnapshot | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([loadSettings(), loadFx()]).then(([s, rates]) => {
      if (!alive) return;
      setSettings(s);
      setFx(rates);
    });
    const offS = onSettingsChanged(setSettings);
    const offF = onFxChanged(setFx);
    return () => {
      alive = false;
      offS();
      offF();
    };
  }, []);

  useEffect(() => {
    if (!settings) return;
    applyTheme(settings.theme);
    document.documentElement.lang = settings.language === 'bn' ? 'bn' : 'en';
    if (settings.theme !== 'system') return;
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq?.addEventListener('change', handler);
    return () => mq?.removeEventListener('change', handler);
  }, [settings]);

  const updateSettings = useCallback(async (patch: Partial<Settings> | ((s: Settings) => Settings)) => {
    const next = await saveSettings(patch);
    setSettings(next);
    return next;
  }, []);

  const value = useMemo<AppState | null>(() => {
    if (!settings) return null;
    const f = makeFormatters(settings, fx);
    return { settings, fx, t: createTranslator(settings.language, f.locale), f, updateSettings };
  }, [settings, fx, updateSettings]);

  if (!value) return <>{fallback ?? null}</>;
  return (
    <Ctx.Provider value={value}>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}

/** For tests and previews. */
export const AppContextForTests = Ctx;
