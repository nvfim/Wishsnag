import { useMemo } from 'react';
import type { DeliveryLocation, Settings } from '@/core/types';
import { countryOptions, defaultCurrencyFor } from '@/core/geo/countries';
import { addressFormat, BD_DELIVERY_ZONES, districtsFor, isValidPostcode, regionLabel } from '@/core/geo/regions';
import { currencyOptions } from '@/core/pricing/currency';
import { LANGUAGES } from '@/core/i18n';
import { useApp } from '../app/AppContext';
import { Field, Input, Select } from './forms';

type RegionValue = Pick<Settings, 'residenceCountry' | 'shoppingCountry' | 'deliveryCountry' | 'displayCurrency' | 'language'>;

function CountrySelect({ value, onChange, id, ...rest }: { value: string; onChange: (v: string) => void; id: string }) {
  const { settings } = useApp();
  const options = useMemo(() => countryOptions(settings.language), [settings.language]);
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
      <optgroup label="★">
        {options
          .filter((o) => o.group === 'priority')
          .map((o) => (
            <option key={o.code} value={o.code}>
              {o.name}
            </option>
          ))}
      </optgroup>
      <optgroup label="—">
        {options
          .filter((o) => o.group === 'popular')
          .map((o) => (
            <option key={o.code} value={o.code}>
              {o.name}
            </option>
          ))}
      </optgroup>
      <optgroup label="A–Z">
        {options
          .filter((o) => o.group === 'all')
          .map((o) => (
            <option key={o.code} value={o.code}>
              {o.name}
            </option>
          ))}
      </optgroup>
    </Select>
  );
}

/** Residence, shopping market, delivery country, currency and language — all independent. */
export function RegionFields({ value, onChange }: { value: RegionValue; onChange: (patch: Partial<RegionValue>) => void }) {
  const { t, settings } = useApp();
  const currencies = useMemo(() => currencyOptions(settings.language), [settings.language]);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t('settings_residence')}>
        {(p) => (
          <CountrySelect
            {...p}
            value={value.residenceCountry}
            onChange={(c) => {
              // Changing residence pre-fills the others only if they still match the old residence.
              const patch: Partial<RegionValue> = { residenceCountry: c };
              if (value.shoppingCountry === value.residenceCountry) patch.shoppingCountry = c;
              if (value.deliveryCountry === value.residenceCountry) patch.deliveryCountry = c;
              if (value.displayCurrency === defaultCurrencyFor(value.residenceCountry)) patch.displayCurrency = defaultCurrencyFor(c);
              onChange(patch);
            }}
          />
        )}
      </Field>
      <Field label={t('settings_shopping')}>{(p) => <CountrySelect {...p} value={value.shoppingCountry} onChange={(c) => onChange({ shoppingCountry: c })} />}</Field>
      <Field label={t('settings_delivery')}>{(p) => <CountrySelect {...p} value={value.deliveryCountry} onChange={(c) => onChange({ deliveryCountry: c })} />}</Field>
      <Field label={t('settings_currency')}>
        {(p) => (
          <Select {...p} value={value.displayCurrency} onChange={(e) => onChange({ displayCurrency: e.target.value })}>
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t('settings_language')} hint={value.language === 'bn' ? t('settings_language_beta') : undefined} className="sm:col-span-2">
        {(p) => (
          <Select {...p} value={value.language} onChange={(e) => onChange({ language: e.target.value as RegionValue['language'] })}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.nativeName} {l.code !== 'en' ? `(${l.name})` : ''}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </div>
  );
}

/** Country-aware delivery location (AU state/postcode, BD division/district/zone, generic elsewhere). */
export function DeliveryLocationFields({ country, value, onChange }: { country: string; value: DeliveryLocation; onChange: (v: DeliveryLocation) => void }) {
  const { t, f, settings } = useApp();
  const fmt = addressFormat(country);
  const lang = settings.language;
  const set = (patch: Partial<DeliveryLocation>) => onChange({ ...value, ...patch });
  const postcodeOk = isValidPostcode(country, value.postcode ?? '');
  const regionKey = `addr_${fmt.regionLabel}` as const;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fmt.fields.includes('region') && (
        <Field label={t(regionKey)}>
          {(p) =>
            fmt.regionOptions ? (
              <Select {...p} value={value.region ?? ''} onChange={(e) => set({ region: e.target.value || undefined, district: undefined })}>
                <option value="">{t('addr_select')}</option>
                {fmt.regionOptions.map((r) => (
                  <option key={r.code} value={r.code}>
                    {regionLabel(r, lang)}
                  </option>
                ))}
              </Select>
            ) : (
              <Input {...p} value={value.region ?? ''} onChange={(e) => set({ region: e.target.value })} />
            )
          }
        </Field>
      )}
      {fmt.fields.includes('district') && (
        <Field label={t('addr_district')}>
          {(p) => (
            <Select {...p} value={value.district ?? ''} onChange={(e) => set({ district: e.target.value || undefined })}>
              <option value="">{t('addr_select')}</option>
              {districtsFor(value.region).map((d) => (
                <option key={d.code} value={d.code}>
                  {regionLabel(d, lang)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      {fmt.fields.includes('city') && <Field label={t('addr_city')}>{(p) => <Input {...p} value={value.city ?? ''} onChange={(e) => set({ city: e.target.value })} />}</Field>}
      {fmt.fields.includes('area') && <Field label={t(`addr_${fmt.areaLabel}`)}>{(p) => <Input {...p} value={value.area ?? ''} onChange={(e) => set({ area: e.target.value })} />}</Field>}
      {fmt.fields.includes('postcode') && (
        <Field label={t(`addr_${fmt.postcodeLabel}`)} error={postcodeOk ? null : t('addr_invalid_postcode', { country: f.country(country) })}>
          {(p) => <Input {...p} value={value.postcode ?? ''} onChange={(e) => set({ postcode: e.target.value.toUpperCase() })} inputMode={country === 'GB' || country === 'CA' ? 'text' : 'numeric'} />}
        </Field>
      )}
      {fmt.fields.includes('zone') && (
        <Field label={t('addr_zone')}>
          {(p) => (
            <Select {...p} value={value.zone ?? ''} onChange={(e) => set({ zone: e.target.value || undefined })}>
              <option value="">{t('addr_select')}</option>
              {BD_DELIVERY_ZONES.map((z) => (
                <option key={z.code} value={z.code}>
                  {regionLabel(z, lang)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
    </div>
  );
}
