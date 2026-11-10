import type { CountryCode, CurrencyCode, LanguageCode } from '../types';

/** Currencies shown first in pickers. AUD and BDT are the launch priorities. */
export const PRIORITY_CURRENCIES: readonly CurrencyCode[] = ['AUD', 'BDT', 'USD', 'GBP', 'EUR', 'INR', 'CAD', 'SGD', 'AED', 'JPY', 'NZD', 'MYR'];

let supported: Set<string> | null = null;
function supportedCurrencies(): Set<string> {
  if (!supported) {
    let list: string[] = [];
    try {
      list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('currency') ?? [];
    } catch {
      list = [];
    }
    supported = new Set([...list, ...PRIORITY_CURRENCIES, 'XCG', 'ZWG', 'SLE']);
  }
  return supported;
}

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value) && supportedCurrencies().has(value);
}

export function normaliseCurrency(value: unknown): CurrencyCode | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return isCurrencyCode(code) ? code : null;
}

const digitsCache = new Map<string, number>();
/** Number of minor-unit digits (AUD 2, BDT 2, JPY 0, KWD 3). */
export function currencyDigits(currency: CurrencyCode): number {
  const cached = digitsCache.get(currency);
  if (cached !== undefined) return cached;
  let digits = 2;
  try {
    digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    digits = 2;
  }
  digitsCache.set(currency, digits);
  return digits;
}

export function resolveLocale(language: LanguageCode, residenceCountry: CountryCode, formatLocale = 'auto'): string {
  if (formatLocale && formatLocale !== 'auto') return formatLocale;
  const candidate = `${language}-${residenceCountry.toUpperCase()}`;
  try {
    return Intl.NumberFormat.supportedLocalesOf([candidate]).length ? candidate : language;
  } catch {
    return 'en';
  }
}

export interface FormatMoneyOptions {
  locale?: string;
  /**
   * 'auto' uses the narrow symbol (৳, $) for the user's home currency and the
   * disambiguating symbol (A$, US$) for others. 'code' always shows ISO codes.
   */
  display?: 'auto' | 'symbol' | 'narrow' | 'code';
  homeCurrency?: CurrencyCode;
  /** Show cents even for whole amounts. */
  keepTrailingZeros?: boolean;
  compact?: boolean;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: number, currency: CurrencyCode, options: FormatMoneyOptions = {}): string {
  const locale = options.locale ?? 'en';
  const display = options.display ?? 'auto';
  const currencyDisplay: Intl.NumberFormatOptions['currencyDisplay'] =
    display === 'code' ? 'code' : display === 'narrow' ? 'narrowSymbol' : display === 'symbol' ? 'symbol' : options.homeCurrency === currency ? 'narrowSymbol' : 'symbol';
  const key = `${locale}|${currency}|${currencyDisplay}|${options.keepTrailingZeros ? 1 : 0}|${options.compact ? 1 : 0}`;
  let fmt = formatterCache.get(key);
  if (!fmt) {
    const base: Intl.NumberFormatOptions = { style: 'currency', currency, currencyDisplay };
    if (options.compact) {
      base.notation = 'compact';
      base.maximumFractionDigits = 1;
    } else if (!options.keepTrailingZeros) {
      (base as Intl.NumberFormatOptions & { trailingZeroDisplay?: string }).trailingZeroDisplay = 'stripIfInteger';
    }
    try {
      fmt = new Intl.NumberFormat(locale, base);
    } catch {
      fmt = new Intl.NumberFormat('en', { style: 'currency', currency: isCurrencyCode(currency) ? currency : 'USD' });
    }
    formatterCache.set(key, fmt);
  }
  return fmt.format(amount);
}

export function formatNumber(value: number, locale = 'en', options: Intl.NumberFormatOptions = {}): string {
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return String(value);
  }
}

export function formatPercent(value: number, locale = 'en', digits = 0): string {
  return formatNumber(value / 100, locale, { style: 'percent', maximumFractionDigits: digits });
}

let currencyNames: Map<string, Intl.DisplayNames | null> = new Map();
export function currencyName(code: CurrencyCode, language: string = 'en'): string {
  if (!currencyNames.has(language)) {
    try {
      currencyNames.set(language, new Intl.DisplayNames([language, 'en'], { type: 'currency' }));
    } catch {
      currencyNames.set(language, null);
    }
  }
  try {
    return currencyNames.get(language)?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Test hook. */
export function resetCurrencyCaches(): void {
  supported = null;
  digitsCache.clear();
  formatterCache.clear();
  currencyNames = new Map();
}

export function currencyOptions(language = 'en'): { code: CurrencyCode; name: string; priority: boolean }[] {
  const all = [...supportedCurrencies()].filter((c) => /^[A-Z]{3}$/.test(c));
  const priority = PRIORITY_CURRENCIES.filter((c) => supportedCurrencies().has(c));
  const rest = all.filter((c) => !priority.includes(c)).sort();
  return [
    ...priority.map((code) => ({ code, name: currencyName(code, language), priority: true })),
    ...rest.map((code) => ({ code, name: currencyName(code, language), priority: false })),
  ];
}
