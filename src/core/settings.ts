import { z } from 'zod';
import type { CountryCode, LanguageCode, Settings } from './types';
import { defaultCurrencyFor, guessCountry, isCountryCode } from './geo/countries';
import { isCurrencyCode } from './pricing/currency';

const clock = z.string().regex(/^\d{1,2}:\d{2}$/);
const country = z.string().refine((c) => isCountryCode(c), 'Unknown country').transform((c) => c.toUpperCase());
const currency = z.string().refine((c) => isCurrencyCode(c.toUpperCase()), 'Unknown currency').transform((c) => c.toUpperCase());

export const settingsSchema = z.object({
  schemaVersion: z.literal(1),
  onboarded: z.boolean(),
  residenceCountry: country,
  shoppingCountry: country,
  deliveryCountry: country,
  displayCurrency: currency,
  language: z.enum(['en', 'bn']),
  formatLocale: z.string().max(20),
  deliveryLocation: z.object({
    region: z.string().max(60).optional(),
    district: z.string().max(60).optional(),
    city: z.string().max(80).optional(),
    area: z.string().max(80).optional(),
    postcode: z.string().max(12).optional(),
    zone: z.string().max(30).optional(),
  }),
  theme: z.enum(['system', 'light', 'dark']),
  alerts: z.object({
    enabled: z.boolean(),
    desktop: z.boolean(),
    defaultDropPercent: z.number().min(1).max(90),
    minDropPercent: z.number().min(0).max(50),
    quietHours: z.object({ enabled: z.boolean(), start: clock, end: clock }),
    frequency: z.enum(['instant', 'daily']),
    digestHour: z.number().int().min(0).max(23),
    cooldownHours: z.number().min(0).max(168),
  }),
  monitoring: z.object({
    enabled: z.boolean(),
    intervalHours: z.number().min(3).max(168),
    checkOnVisit: z.boolean(),
  }),
  comparison: z.object({
    defaultMode: z.enum(['local', 'global', 'all']),
    staleAfterHours: z.number().min(1).max(24 * 60),
  }),
  exchangeRates: z.object({ autoRefresh: z.boolean() }),
  budget: z.object({ monthly: z.number().min(0).nullable(), currency: currency.nullable() }),
  cloud: z.object({ url: z.string().max(300), anonKey: z.string().max(2000) }),
}) satisfies z.ZodType<Settings, unknown>;

export interface BrowserHints {
  timeZone?: string;
  languages?: readonly string[];
}

/**
 * Initial settings. Country/currency are only *guessed* from the browser (time zone,
 * language) — onboarding always asks the user to confirm. Nothing defaults to a single
 * hard-coded market.
 */
export function defaultSettings(hints: BrowserHints = {}): Settings {
  const guessed: CountryCode = guessCountry(hints.timeZone, hints.languages ?? []) ?? 'US';
  const language: LanguageCode = (hints.languages ?? []).some((l) => l.toLowerCase().startsWith('bn')) ? 'bn' : 'en';
  return {
    schemaVersion: 1,
    onboarded: false,
    residenceCountry: guessed,
    shoppingCountry: guessed,
    deliveryCountry: guessed,
    displayCurrency: defaultCurrencyFor(guessed),
    language,
    formatLocale: 'auto',
    deliveryLocation: {},
    theme: 'system',
    alerts: {
      enabled: true,
      desktop: true,
      defaultDropPercent: 10,
      minDropPercent: 2,
      quietHours: { enabled: true, start: '22:00', end: '08:00' },
      frequency: 'instant',
      digestHour: 18,
      cooldownHours: 6,
    },
    monitoring: { enabled: true, intervalHours: 12, checkOnVisit: true },
    comparison: { defaultMode: 'all', staleAfterHours: 72 },
    exchangeRates: { autoRefresh: true },
    budget: { monthly: null, currency: null },
    cloud: { url: '', anonKey: '' },
  };
}

/** Validates stored settings, filling any missing/invalid section from defaults (forward-compatible). */
export function normaliseSettings(stored: unknown, hints: BrowserHints = {}): Settings {
  const defaults = defaultSettings(hints);
  if (!stored || typeof stored !== 'object') return defaults;
  const merged = deepMerge(defaults as unknown as Record<string, unknown>, stored as Record<string, unknown>);
  const parsed = settingsSchema.safeParse(merged);
  if (parsed.success) return parsed.data;
  // Repair section by section.
  const repaired: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof Settings)[]) {
    const candidate = { ...defaults, [key]: (merged as Record<string, unknown>)[key] };
    if (settingsSchema.safeParse(candidate).success) repaired[key] = (merged as Record<string, unknown>)[key];
  }
  return settingsSchema.parse(repaired);
}

function deepMerge<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    const b = (base as Record<string, unknown>)[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' && !Array.isArray(b)) out[k] = deepMerge(b as Record<string, unknown>, v as Record<string, unknown>);
    else if (v !== undefined) out[k] = v;
  }
  return out as T;
}
