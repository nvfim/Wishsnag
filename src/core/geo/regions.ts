import type { CountryCode, LanguageCode } from '../types';

export interface RegionOption {
  code: string;
  en: string;
  bn?: string;
}

export const AU_STATES: readonly RegionOption[] = [
  { code: 'NSW', en: 'New South Wales', bn: 'নিউ সাউথ ওয়েলস' },
  { code: 'VIC', en: 'Victoria', bn: 'ভিক্টোরিয়া' },
  { code: 'QLD', en: 'Queensland', bn: 'কুইন্সল্যান্ড' },
  { code: 'WA', en: 'Western Australia', bn: 'ওয়েস্টার্ন অস্ট্রেলিয়া' },
  { code: 'SA', en: 'South Australia', bn: 'সাউথ অস্ট্রেলিয়া' },
  { code: 'TAS', en: 'Tasmania', bn: 'তাসমানিয়া' },
  { code: 'ACT', en: 'Australian Capital Territory', bn: 'অস্ট্রেলিয়ান ক্যাপিটাল টেরিটরি' },
  { code: 'NT', en: 'Northern Territory', bn: 'নর্দার্ন টেরিটরি' },
];

/** Bangladesh: 8 divisions → 64 districts (English + Bangla names). */
export const BD_DIVISIONS: readonly (RegionOption & { districts: readonly RegionOption[] })[] = [
  {
    code: 'BAR', en: 'Barishal', bn: 'বরিশাল',
    districts: d([['Barguna', 'বরগুনা'], ['Barishal', 'বরিশাল'], ['Bhola', 'ভোলা'], ['Jhalokati', 'ঝালকাঠি'], ['Patuakhali', 'পটুয়াখালী'], ['Pirojpur', 'পিরোজপুর']]),
  },
  {
    code: 'CTG', en: 'Chattogram', bn: 'চট্টগ্রাম',
    districts: d([['Bandarban', 'বান্দরবান'], ['Brahmanbaria', 'ব্রাহ্মণবাড়িয়া'], ['Chandpur', 'চাঁদপুর'], ['Chattogram', 'চট্টগ্রাম'], ["Cox's Bazar", 'কক্সবাজার'], ['Cumilla', 'কুমিল্লা'], ['Feni', 'ফেনী'], ['Khagrachhari', 'খাগড়াছড়ি'], ['Lakshmipur', 'লক্ষ্মীপুর'], ['Noakhali', 'নোয়াখালী'], ['Rangamati', 'রাঙ্গামাটি']]),
  },
  {
    code: 'DHA', en: 'Dhaka', bn: 'ঢাকা',
    districts: d([['Dhaka', 'ঢাকা'], ['Faridpur', 'ফরিদপুর'], ['Gazipur', 'গাজীপুর'], ['Gopalganj', 'গোপালগঞ্জ'], ['Kishoreganj', 'কিশোরগঞ্জ'], ['Madaripur', 'মাদারীপুর'], ['Manikganj', 'মানিকগঞ্জ'], ['Munshiganj', 'মুন্সীগঞ্জ'], ['Narayanganj', 'নারায়ণগঞ্জ'], ['Narsingdi', 'নরসিংদী'], ['Rajbari', 'রাজবাড়ী'], ['Shariatpur', 'শরীয়তপুর'], ['Tangail', 'টাঙ্গাইল']]),
  },
  {
    code: 'KHU', en: 'Khulna', bn: 'খুলনা',
    districts: d([['Bagerhat', 'বাগেরহাট'], ['Chuadanga', 'চুয়াডাঙ্গা'], ['Jashore', 'যশোর'], ['Jhenaidah', 'ঝিনাইদহ'], ['Khulna', 'খুলনা'], ['Kushtia', 'কুষ্টিয়া'], ['Magura', 'মাগুরা'], ['Meherpur', 'মেহেরপুর'], ['Narail', 'নড়াইল'], ['Satkhira', 'সাতক্ষীরা']]),
  },
  {
    code: 'MYM', en: 'Mymensingh', bn: 'ময়মনসিংহ',
    districts: d([['Jamalpur', 'জামালপুর'], ['Mymensingh', 'ময়মনসিংহ'], ['Netrokona', 'নেত্রকোনা'], ['Sherpur', 'শেরপুর']]),
  },
  {
    code: 'RAJ', en: 'Rajshahi', bn: 'রাজশাহী',
    districts: d([['Bogura', 'বগুড়া'], ['Chapai Nawabganj', 'চাঁপাইনবাবগঞ্জ'], ['Joypurhat', 'জয়পুরহাট'], ['Naogaon', 'নওগাঁ'], ['Natore', 'নাটোর'], ['Pabna', 'পাবনা'], ['Rajshahi', 'রাজশাহী'], ['Sirajganj', 'সিরাজগঞ্জ']]),
  },
  {
    code: 'RAN', en: 'Rangpur', bn: 'রংপুর',
    districts: d([['Dinajpur', 'দিনাজপুর'], ['Gaibandha', 'গাইবান্ধা'], ['Kurigram', 'কুড়িগ্রাম'], ['Lalmonirhat', 'লালমনিরহাট'], ['Nilphamari', 'নীলফামারী'], ['Panchagarh', 'পঞ্চগড়'], ['Rangpur', 'রংপুর'], ['Thakurgaon', 'ঠাকুরগাঁও']]),
  },
  {
    code: 'SYL', en: 'Sylhet', bn: 'সিলেট',
    districts: d([['Habiganj', 'হবিগঞ্জ'], ['Moulvibazar', 'মৌলভীবাজার'], ['Sunamganj', 'সুনামগঞ্জ'], ['Sylhet', 'সিলেট']]),
  },
];

function d(pairs: [string, string][]): RegionOption[] {
  return pairs.map(([en, bn]) => ({ code: en, en, bn }));
}

/** Delivery zones commonly used by Bangladeshi retailers to price delivery. */
export const BD_DELIVERY_ZONES: readonly RegionOption[] = [
  { code: 'inside_dhaka', en: 'Inside Dhaka city', bn: 'ঢাকা শহরের ভেতরে' },
  { code: 'dhaka_suburbs', en: 'Dhaka suburbs', bn: 'ঢাকার আশেপাশে' },
  { code: 'outside_dhaka', en: 'Outside Dhaka', bn: 'ঢাকার বাইরে' },
];

export function regionLabel(option: RegionOption, language: LanguageCode): string {
  return language === 'bn' && option.bn ? option.bn : option.en;
}

export type AddressField = 'region' | 'district' | 'city' | 'area' | 'postcode' | 'zone';

export interface AddressFormat {
  fields: AddressField[];
  regionLabel: 'state' | 'division' | 'province' | 'county' | 'region';
  postcodeLabel: 'postcode' | 'zip' | 'pin' | 'postal_code';
  areaLabel: 'suburb' | 'area' | 'locality';
  postcodePattern?: RegExp;
  regionOptions?: readonly RegionOption[];
}

const GENERIC: AddressFormat = { fields: ['region', 'city', 'postcode'], regionLabel: 'region', postcodeLabel: 'postal_code', areaLabel: 'locality' };

export function addressFormat(country: CountryCode): AddressFormat {
  switch (country.toUpperCase()) {
    case 'AU':
      return { fields: ['region', 'area', 'postcode'], regionLabel: 'state', postcodeLabel: 'postcode', areaLabel: 'suburb', postcodePattern: /^\d{4}$/, regionOptions: AU_STATES };
    case 'BD':
      return { fields: ['region', 'district', 'city', 'area', 'postcode', 'zone'], regionLabel: 'division', postcodeLabel: 'postcode', areaLabel: 'area', postcodePattern: /^\d{4}$/, regionOptions: BD_DIVISIONS };
    case 'US':
      return { ...GENERIC, regionLabel: 'state', postcodeLabel: 'zip', postcodePattern: /^\d{5}(-\d{4})?$/ };
    case 'GB':
      return { fields: ['city', 'postcode'], regionLabel: 'county', postcodeLabel: 'postcode', areaLabel: 'locality', postcodePattern: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i };
    case 'IN':
      return { ...GENERIC, regionLabel: 'state', postcodeLabel: 'pin', postcodePattern: /^\d{6}$/ };
    case 'CA':
      return { ...GENERIC, regionLabel: 'province', postcodePattern: /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i };
    default:
      return GENERIC;
  }
}

export function districtsFor(divisionCode: string | undefined): readonly RegionOption[] {
  if (!divisionCode) return BD_DIVISIONS.flatMap((dv) => dv.districts);
  return BD_DIVISIONS.find((dv) => dv.code === divisionCode)?.districts ?? [];
}

export function isValidPostcode(country: CountryCode, postcode: string): boolean {
  const pattern = addressFormat(country).postcodePattern;
  if (!postcode.trim()) return true;
  return pattern ? pattern.test(postcode.trim()) : postcode.trim().length <= 12;
}
