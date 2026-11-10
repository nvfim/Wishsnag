import type { CountryCode, CurrencyCode, LanguageCode } from '../types';

/**
 * ISO 3166-1 alpha-2 → default ISO 4217 currency. Covers every inhabited country/territory.
 * Display names come from Intl.DisplayNames so they are localised (English, Bangla, …).
 * Updated for Bulgaria's euro adoption (2026) and the Caribbean guilder (XCG, 2025).
 */
const COUNTRY_CURRENCY_SOURCE =
  'AD:EUR AE:AED AF:AFN AG:XCD AI:XCD AL:ALL AM:AMD AO:AOA AR:ARS AS:USD AT:EUR AU:AUD AW:AWG AX:EUR AZ:AZN ' +
  'BA:BAM BB:BBD BD:BDT BE:EUR BF:XOF BG:EUR BH:BHD BI:BIF BJ:XOF BL:EUR BM:BMD BN:BND BO:BOB BQ:USD BR:BRL ' +
  'BS:BSD BT:BTN BW:BWP BY:BYN BZ:BZD CA:CAD CC:AUD CD:CDF CF:XAF CG:XAF CH:CHF CI:XOF CK:NZD CL:CLP CM:XAF ' +
  'CN:CNY CO:COP CR:CRC CU:CUP CV:CVE CW:XCG CX:AUD CY:EUR CZ:CZK DE:EUR DJ:DJF DK:DKK DM:XCD DO:DOP DZ:DZD ' +
  'EC:USD EE:EUR EG:EGP EH:MAD ER:ERN ES:EUR ET:ETB FI:EUR FJ:FJD FK:FKP FM:USD FO:DKK FR:EUR GA:XAF GB:GBP ' +
  'GD:XCD GE:GEL GF:EUR GG:GBP GH:GHS GI:GIP GL:DKK GM:GMD GN:GNF GP:EUR GQ:XAF GR:EUR GT:GTQ GU:USD GW:XOF ' +
  'GY:GYD HK:HKD HN:HNL HR:EUR HT:HTG HU:HUF ID:IDR IE:EUR IL:ILS IM:GBP IN:INR IO:USD IQ:IQD IR:IRR IS:ISK ' +
  'IT:EUR JE:GBP JM:JMD JO:JOD JP:JPY KE:KES KG:KGS KH:KHR KI:AUD KM:KMF KN:XCD KP:KPW KR:KRW KW:KWD KY:KYD ' +
  'KZ:KZT LA:LAK LB:LBP LC:XCD LI:CHF LK:LKR LR:LRD LS:LSL LT:EUR LU:EUR LV:EUR LY:LYD MA:MAD MC:EUR MD:MDL ' +
  'ME:EUR MF:EUR MG:MGA MH:USD MK:MKD ML:XOF MM:MMK MN:MNT MO:MOP MP:USD MQ:EUR MR:MRU MS:XCD MT:EUR MU:MUR ' +
  'MV:MVR MW:MWK MX:MXN MY:MYR MZ:MZN NA:NAD NC:XPF NE:XOF NF:AUD NG:NGN NI:NIO NL:EUR NO:NOK NP:NPR NR:AUD ' +
  'NU:NZD NZ:NZD OM:OMR PA:PAB PE:PEN PF:XPF PG:PGK PH:PHP PK:PKR PL:PLN PM:EUR PN:NZD PR:USD PS:ILS PT:EUR ' +
  'PW:USD PY:PYG QA:QAR RE:EUR RO:RON RS:RSD RU:RUB RW:RWF SA:SAR SB:SBD SC:SCR SD:SDG SE:SEK SG:SGD SH:SHP ' +
  'SI:EUR SJ:NOK SK:EUR SL:SLE SM:EUR SN:XOF SO:SOS SR:SRD SS:SSP ST:STN SV:USD SX:XCG SY:SYP SZ:SZL TC:USD ' +
  'TD:XAF TF:EUR TG:XOF TH:THB TJ:TJS TK:NZD TL:USD TM:TMT TN:TND TO:TOP TR:TRY TT:TTD TV:AUD TW:TWD TZ:TZS ' +
  'UA:UAH UG:UGX UM:USD US:USD UY:UYU UZ:UZS VA:EUR VC:XCD VE:VES VG:USD VI:USD VN:VND VU:VUV WF:XPF WS:WST ' +
  'XK:EUR YE:YER YT:EUR ZA:ZAR ZM:ZMW ZW:ZWG';

export const COUNTRY_CURRENCY: Readonly<Record<CountryCode, CurrencyCode>> = Object.freeze(
  Object.fromEntries(COUNTRY_CURRENCY_SOURCE.split(' ').map((pair) => pair.split(':') as [string, string])),
);

export const ALL_COUNTRY_CODES: readonly CountryCode[] = Object.freeze(Object.keys(COUNTRY_CURRENCY).sort());

/** Initial priority markets — shown first in pickers and given first-class support. */
export const PRIORITY_COUNTRIES: readonly CountryCode[] = ['AU', 'BD'];
/** Commonly used markets shown right after the priority ones. */
export const POPULAR_COUNTRIES: readonly CountryCode[] = ['GB', 'US', 'IN', 'CA', 'SG', 'AE', 'NZ', 'DE', 'JP', 'MY'];

export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === 'string' && value.toUpperCase() in COUNTRY_CURRENCY;
}

export function defaultCurrencyFor(country: CountryCode): CurrencyCode {
  return COUNTRY_CURRENCY[country.toUpperCase()] ?? 'USD';
}

const displayNameCache = new Map<string, Intl.DisplayNames | null>();
function regionNames(language: string): Intl.DisplayNames | null {
  if (!displayNameCache.has(language)) {
    try {
      displayNameCache.set(language, new Intl.DisplayNames([language, 'en'], { type: 'region' }));
    } catch {
      displayNameCache.set(language, null);
    }
  }
  return displayNameCache.get(language) ?? null;
}

export function countryName(code: CountryCode, language: LanguageCode | string = 'en'): string {
  const upper = code.toUpperCase();
  try {
    return regionNames(language)?.of(upper) ?? upper;
  } catch {
    return upper;
  }
}

/** Ordered country options: priority markets, popular markets, then everything else alphabetically. */
export function countryOptions(language: LanguageCode | string = 'en'): { code: CountryCode; name: string; group: 'priority' | 'popular' | 'all' }[] {
  const seen = new Set<string>();
  const out: { code: CountryCode; name: string; group: 'priority' | 'popular' | 'all' }[] = [];
  for (const code of PRIORITY_COUNTRIES) {
    seen.add(code);
    out.push({ code, name: countryName(code, language), group: 'priority' });
  }
  for (const code of POPULAR_COUNTRIES) {
    seen.add(code);
    out.push({ code, name: countryName(code, language), group: 'popular' });
  }
  const rest = ALL_COUNTRY_CODES.filter((c) => !seen.has(c))
    .map((code) => ({ code, name: countryName(code, language), group: 'all' as const }))
    .sort((a, b) => a.name.localeCompare(b.name, language));
  return out.concat(rest);
}

/** Time zones that map unambiguously to a country (used only to pre-fill onboarding). */
const TIMEZONE_COUNTRY: Record<string, CountryCode> = {
  'Asia/Dhaka': 'BD', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Singapore': 'SG', 'Asia/Dubai': 'AE',
  'Asia/Tokyo': 'JP', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Karachi': 'PK', 'Asia/Kathmandu': 'NP', 'Asia/Colombo': 'LK',
  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Berlin': 'DE', 'Europe/Paris': 'FR', 'Europe/Madrid': 'ES',
  'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL', 'Pacific/Auckland': 'NZ', 'America/Toronto': 'CA', 'America/Vancouver': 'CA',
};

/**
 * Best-effort guess of the user's country from the browser's time zone and language.
 * Used only as an onboarding default — the user always confirms or changes it.
 */
export function guessCountry(timeZone?: string, languages: readonly string[] = []): CountryCode | null {
  if (timeZone) {
    if (timeZone.startsWith('Australia/')) return 'AU';
    const tz = TIMEZONE_COUNTRY[timeZone];
    if (tz) return tz;
  }
  for (const lang of languages) {
    const region = lang.split('-')[1]?.toUpperCase();
    if (region && isCountryCode(region)) return region;
    if (lang.toLowerCase().startsWith('bn')) return 'BD';
  }
  return null;
}
