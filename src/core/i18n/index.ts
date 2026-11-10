import type { LanguageCode } from '../types';
import { formatNumber } from '../pricing/currency';
import { en, type MessageKey } from './en';
import { bn } from './bn';

export type { MessageKey };
export type TranslateParams = Record<string, string | number | null | undefined>;
export type Translator = ((key: MessageKey, params?: TranslateParams) => string) & {
  language: LanguageCode;
  locale: string;
  plural: (base: string, count: number, params?: TranslateParams) => string;
  has: (key: string) => key is MessageKey;
};

export const DICTIONARIES: Record<LanguageCode, Record<MessageKey, string>> = { en, bn };

export const LANGUAGES: { code: LanguageCode; name: string; nativeName: string; status: 'complete' | 'beta' }[] = [
  { code: 'en', name: 'English', nativeName: 'English', status: 'complete' },
  { code: 'bn', name: 'Bangla (Bengali)', nativeName: 'বাংলা', status: 'beta' },
];

export function interpolate(template: string, params: TranslateParams | undefined, locale: string): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = params[name];
    if (v === undefined || v === null) return match;
    return typeof v === 'number' ? formatNumber(v, locale, { maximumFractionDigits: 2 }) : v;
  });
}

export function createTranslator(language: LanguageCode, locale?: string): Translator {
  const dict = DICTIONARIES[language] ?? en;
  const loc = locale ?? (language === 'bn' ? 'bn-BD' : 'en');
  const rules = new Intl.PluralRules(loc);
  const t = ((key: MessageKey, params?: TranslateParams) => interpolate(dict[key] ?? en[key] ?? key, params, loc)) as Translator;
  t.language = language;
  t.locale = loc;
  t.has = (key: string): key is MessageKey => key in en;
  t.plural = (base: string, count: number, params?: TranslateParams) => {
    const category = rules.select(count);
    const key = (`${base}_${category}` in en ? `${base}_${category}` : `${base}_other`) as MessageKey;
    return t(key, { count, ...params });
  };
  return t;
}
