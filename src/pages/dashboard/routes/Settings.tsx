import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BellRing, Cloud, Database, Download, Globe, Info, LogOut, MapPin, Palette, Radar, RefreshCw, ShieldCheck, Store, Trash2, Upload } from 'lucide-react';
import type { Settings as SettingsT } from '@/core/types';
import { RETAILERS } from '@/core/retailers/registry';
import type { CapabilityStatus, RetailerCapabilities } from '@/core/retailers/types';
import { buildExportBundle } from '@/core/importExport/json';
import { itemsToCsv } from '@/core/importExport/wishlistCsv';
import { isFxStale } from '@/core/pricing/exchangeRates';
import { deleteAllData, exportAll } from '@/db/repo';
import { kv } from '@/platform/storage';
import { send } from '@/services/messages';
import { describeReport, summariseOutcomes } from '@/services/checkReport';
import { listGrantedOrigins, removeOriginAccess, siteLabel } from '@/services/permissions';
import { deleteCloudAccount, sendOtp, signOut, useCloudState, verifyOtp } from '@/cloud/client';
import { lastSyncAt, syncNow } from '@/cloud/sync';
import { useApp } from '@/ui/app/AppContext';
import { Field, Input, Segmented, Select, Toggle } from '@/ui/components/forms';
import { Badge, Button, Card, cn, type BadgeTone } from '@/ui/components/primitives';
import { DeliveryLocationFields, RegionFields } from '@/ui/components/RegionFields';
import { useConfirm, useToast } from '@/ui/components/overlay';
import { downloadText, stamp } from '@/ui/lib/download';
import pkg from '../../../../package.json';
import { navigate } from '../router';

const SECTIONS = [
  ['region', 'settings_region', Globe],
  ['delivery', 'settings_delivery_location', MapPin],
  ['appearance', 'settings_appearance', Palette],
  ['alerts', 'settings_alerts', BellRing],
  ['monitoring', 'settings_monitoring', Radar],
  ['permissions', 'settings_permissions', ShieldCheck],
  ['rates', 'settings_rates', RefreshCw],
  ['retailers', 'settings_retailers', Store],
  ['data', 'settings_data', Database],
  ['cloud', 'settings_cloud', Cloud],
  ['about', 'settings_about', Info],
] as const;

function Section({ id, title, icon, children, hint }: { id: string; title: string; icon: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <section id={`s-${id}`} className="scroll-mt-24">
      <Card className="p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">{icon}</span>
          <div>
            <h2 className="font-display text-base font-bold">{title}</h2>
            {hint && <p className="mt-0.5 text-[12.5px] text-muted">{hint}</p>}
          </div>
        </div>
        {children}
      </Card>
    </section>
  );
}

export function SettingsPage() {
  const { t, settings, updateSettings } = useApp();
  const toast = useToast();
  const save = async (patch: Partial<SettingsT> | ((s: SettingsT) => SettingsT)) => {
    await updateSettings(patch);
    toast.show(t('settings_saved'));
  };
  const alerts = settings.alerts;
  const setAlerts = (patch: Partial<SettingsT['alerts']>) => void save((s) => ({ ...s, alerts: { ...s.alerts, ...patch } }));

  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label={t('settings_title')} className="hidden lg:block">
        <div className="sticky top-24 flex flex-col gap-0.5">
          <h1 className="mb-2 px-3 font-display text-xl font-extrabold">{t('settings_title')}</h1>
          {SECTIONS.map(([id, key, Icon]) => (
            <a key={id} href={`#/settings?s=${id}`} onClick={(e) => (e.preventDefault(), document.getElementById(`s-${id}`)?.scrollIntoView({ behavior: 'smooth' }))} className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold text-muted hover:bg-surface-2 hover:text-fg">
              <Icon className="size-4" /> {t(key)}
            </a>
          ))}
        </div>
      </nav>
      <div className="flex flex-col gap-5">
        <Section id="region" title={t('settings_region')} icon={<Globe className="size-5" />} hint={t('settings_region_hint')}>
          <RegionFields value={settings} onChange={(patch) => void save(patch)} />
        </Section>

        <Section id="delivery" title={`${t('settings_delivery_location')} · ${settings.deliveryCountry}`} icon={<MapPin className="size-5" />} hint={t('settings_delivery_location_hint')}>
          <DeliveryLocationFields country={settings.deliveryCountry} value={settings.deliveryLocation} onChange={(deliveryLocation) => void updateSettings({ deliveryLocation })} />
        </Section>

        <Section id="appearance" title={t('settings_appearance')} icon={<Palette className="size-5" />}>
          <div className="flex flex-col gap-4">
            <Segmented label={t('settings_appearance')} value={settings.theme} onChange={(theme) => void save({ theme })} options={(['system', 'light', 'dark'] as const).map((v) => ({ value: v, label: t(`theme_${v}`) }))} />
            <Field label={t('settings_format_locale')}>
              {(p) => (
                <Select {...p} value={settings.formatLocale} onChange={(e) => void save({ formatLocale: e.target.value })} className="max-w-xs">
                  <option value="auto">{t('settings_format_auto', { locale: `${settings.language}-${settings.residenceCountry}` })}</option>
                  {['en-AU', 'en-BD', 'bn-BD', 'en-IN', 'en-GB', 'en-US', 'en-CA', 'en-SG', 'de-DE', 'fr-FR', 'ja-JP'].map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </Section>

        <Section id="alerts" title={t('settings_alerts')} icon={<BellRing className="size-5" />}>
          <div className="flex flex-col gap-4">
            <Toggle checked={alerts.enabled} onChange={(enabled) => setAlerts({ enabled })} label={t('alerts_enabled')} />
            <Toggle checked={alerts.desktop} onChange={(desktop) => setAlerts({ desktop })} label={t('alerts_desktop')} disabled={!alerts.enabled} />
            <div className="grid gap-3 sm:grid-cols-3">
              <NumberSetting label={t('alerts_min_drop')} suffix="%" value={alerts.minDropPercent} min={0} max={50} onSave={(minDropPercent) => setAlerts({ minDropPercent })} />
              <NumberSetting label={t('alerts_default_drop')} suffix="%" value={alerts.defaultDropPercent} min={1} max={90} onSave={(defaultDropPercent) => setAlerts({ defaultDropPercent })} />
              <NumberSetting label={t('alerts_cooldown')} suffix="h" value={alerts.cooldownHours} min={0} max={168} onSave={(cooldownHours) => setAlerts({ cooldownHours })} />
            </div>
            <Toggle checked={alerts.quietHours.enabled} onChange={(enabled) => setAlerts({ quietHours: { ...alerts.quietHours, enabled } })} label={t('alerts_quiet_hours')} description={t('alerts_quiet_hint')} />
            {alerts.quietHours.enabled && (
              <div className="flex gap-3">
                <Field label={t('alerts_from')}>{(p) => <Input {...p} type="time" value={alerts.quietHours.start} onChange={(e) => setAlerts({ quietHours: { ...alerts.quietHours, start: e.target.value } })} className="w-32" />}</Field>
                <Field label={t('alerts_to')}>{(p) => <Input {...p} type="time" value={alerts.quietHours.end} onChange={(e) => setAlerts({ quietHours: { ...alerts.quietHours, end: e.target.value } })} className="w-32" />}</Field>
              </div>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold">{t('alerts_frequency')}</span>
                <Segmented label={t('alerts_frequency')} value={alerts.frequency} onChange={(frequency) => setAlerts({ frequency })} options={[{ value: 'instant', label: t('freq_instant') }, { value: 'daily', label: t('freq_daily') }]} />
              </div>
              {alerts.frequency === 'daily' && (
                <Field label={t('alerts_digest_hour')}>
                  {(p) => (
                    <Select {...p} value={alerts.digestHour} onChange={(e) => setAlerts({ digestHour: Number(e.target.value) })} className="w-28">
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, '0')}:00
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}
            </div>
            <Button
              className="self-start"
              size="sm"
              icon={<BellRing className="size-4" />}
              onClick={async () => {
                const res = await send({ type: 'notify:test' }).catch(() => ({ ok: false }));
                toast.show(res.ok ? t('alerts_test_sent') : t('state_error'), { tone: res.ok ? 'success' : 'error' });
              }}
            >
              {t('alerts_test')}
            </Button>
          </div>
        </Section>

        <Section id="monitoring" title={t('settings_monitoring')} icon={<Radar className="size-5" />} hint={t('monitoring_explainer')}>
          <MonitoringSettings />
        </Section>

        <Section id="permissions" title={t('settings_permissions')} icon={<ShieldCheck className="size-5" />} hint={t('permissions_explainer')}>
          <PermissionList />
        </Section>

        <Section id="rates" title={t('settings_rates')} icon={<RefreshCw className="size-5" />} hint={t('rates_disclaimer')}>
          <RatesSettings />
        </Section>

        <Section id="retailers" title={t('settings_retailers')} icon={<Store className="size-5" />} hint={t('settings_retailers_hint')}>
          <RetailerSupport />
        </Section>

        <Section id="data" title={t('settings_data')} icon={<Database className="size-5" />} hint={t('data_local_note')}>
          <DataSettings />
        </Section>

        <Section id="cloud" title={t('settings_cloud')} icon={<Cloud className="size-5" />} hint={t('cloud_explainer')}>
          <CloudSettings />
        </Section>

        <Section id="about" title={t('settings_about')} icon={<Info className="size-5" />}>
          <p className="text-sm font-semibold">
            WishSnag · {t('about_version', { version: pkg.version })} · {t('tagline')}
          </p>
          <p className="mt-2 text-[13px] text-muted">{t('about_privacy')}</p>
        </Section>
      </div>
    </div>
  );
}

function NumberSetting({ label, value, onSave, min, max, suffix }: { label: string; value: number; onSave: (v: number) => void; min: number; max: number; suffix?: string }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => {
    const n = Number(v);
    if (Number.isFinite(n) && n >= min && n <= max && n !== value) onSave(n);
    else setV(String(value));
  };
  return (
    <Field label={label}>
      {(p) => (
        <div className="relative">
          <Input {...p} type="number" min={min} max={max} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} className="tabular pr-8" />
          {suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-muted">{suffix}</span>}
        </div>
      )}
    </Field>
  );
}

function MonitoringSettings() {
  const { t, f, settings, updateSettings } = useApp();
  const toast = useToast();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<{ lastRunAt?: number } | null>(null);
  useEffect(() => {
    void kv().get<{ lastRunAt?: number }>('wishsnag.monitorStatus').then((s) => setStatus(s ?? null));
  }, [running]);
  const set = (patch: Partial<SettingsT['monitoring']>) => void updateSettings((s) => ({ ...s, monitoring: { ...s.monitoring, ...patch } }));
  return (
    <div className="flex flex-col gap-4">
      <Toggle checked={settings.monitoring.enabled} onChange={(enabled) => set({ enabled })} label={t('monitoring_enabled')} />
      <Toggle checked={settings.monitoring.checkOnVisit} onChange={(checkOnVisit) => set({ checkOnVisit })} label={t('monitoring_on_visit')} />
      <Field label={t('monitoring_interval')}>
        {(p) => (
          <Select {...p} value={settings.monitoring.intervalHours} onChange={(e) => set({ intervalHours: Number(e.target.value) })} className="w-40">
            {[3, 6, 12, 24, 48, 72, 168].map((h) => (
              <option key={h} value={h}>
                {t('hours_value', { count: h })}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          icon={<RefreshCw className={cn('size-4', running && 'animate-spin')} />}
          disabled={running}
          onClick={async () => {
            setRunning(true);
            try {
              const r = await send({ type: 'monitor:run' });
              const { message, tone } = describeReport(summariseOutcomes(r.summary.outcomes), t);
              toast.show(message, { tone, duration: 8000 });
            } catch (err) {
              toast.show(t('state_error_detail', { error: String(err) }), { tone: 'error' });
            } finally {
              setRunning(false);
            }
          }}
        >
          {running ? t('monitoring_running') : t('monitoring_run_now')}
        </Button>
        {status?.lastRunAt && <span className="text-[12px] text-muted">{t('detail_last_checked', { time: f.relative(status.lastRunAt) })}</span>}
      </div>
      <p className="text-[12px] text-muted">{t('monitoring_cloud_note')}</p>
    </div>
  );
}

function PermissionList() {
  const { t } = useApp();
  const [origins, setOrigins] = useState<string[] | null>(null);
  const refresh = () => void listGrantedOrigins().then(setOrigins);
  useEffect(refresh, []);
  if (!origins) return null;
  if (!origins.length) return <p className="text-[13px] text-muted">{t('permissions_none')}</p>;
  return (
    <ul className="flex flex-col divide-y divide-line">
      {origins.map((o) => (
        <li key={o} className="flex items-center justify-between py-2 text-sm">
          <span className="font-semibold">{siteLabel(o)}</span>
          <Button size="sm" variant="ghost" onClick={async () => (await removeOriginAccess(o), refresh())}>
            {t('act_remove')}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function RatesSettings() {
  const { t, f, fx, settings, updateSettings } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      {fx ? (
        <div className="text-[13px]">
          <p className="font-semibold">{t('rates_info', { date: fx.date, time: f.relative(fx.fetchedAt) })}</p>
          <p className="text-muted">{t('rates_source', { provider: fx.provider })}</p>
          {isFxStale(fx) && <Badge tone="warn">{t('rates_stale')}</Badge>}
          <p className="tabular mt-1 text-[12px] text-muted">
            1 {settings.displayCurrency} ={' '}
            {['AUD', 'BDT', 'USD', 'GBP', 'EUR']
              .filter((c) => c !== settings.displayCurrency && fx.rates[c] && fx.rates[settings.displayCurrency])
              .map((c) => `${f.number(fx.rates[c]! / fx.rates[settings.displayCurrency]!, 4)} ${c}`)
              .join(' · ')}
          </p>
        </div>
      ) : (
        <p className="text-[13px] text-muted">{t('rates_none')}</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          icon={<RefreshCw className={cn('size-4', busy && 'animate-spin')} />}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await send({ type: 'rates:refresh' }).catch((e: unknown) => ({ ok: false as const, message: String(e) }));
            setBusy(false);
            if (r.ok) toast.show(t('settings_saved'));
            else toast.show(t('rates_error', { error: r.message }), { tone: 'error' });
          }}
        >
          {t('rates_refresh')}
        </Button>
        <Toggle checked={settings.exchangeRates.autoRefresh} onChange={(autoRefresh) => void updateSettings({ exchangeRates: { autoRefresh } })} label={t('rates_auto')} />
      </div>
    </div>
  );
}

const STATUS_TONE: Record<CapabilityStatus, BadgeTone> = { operational: 'savings', partial: 'lilac', requires_credentials: 'warn', unavailable: 'danger', unsupported: 'neutral', planned: 'outline' };

function RetailerSupport() {
  const { t, f, settings } = useApp();
  const countries = useMemo(() => [...new Set(RETAILERS.map((r) => r.country ?? 'GLOBAL'))], []);
  const [country, setCountry] = useState<string>(countries.includes(settings.shoppingCountry) ? settings.shoppingCountry : 'AU');
  const list = RETAILERS.filter((r) => (r.country ?? 'GLOBAL') === country);
  const caps = Object.keys(list[0]?.capabilities ?? {}) as (keyof RetailerCapabilities)[];
  return (
    <div className="flex flex-col gap-3">
      <Field label={t('retailers_filter_country')}>
        {(p) => (
          <Select {...p} value={country} onChange={(e) => setCountry(e.target.value)} className="w-56">
            {countries.map((c) => (
              <option key={c} value={c}>
                {c === 'GLOBAL' ? 'Global' : f.country(c)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t('settings_retailers')}>
        <table className="w-full min-w-[640px] text-left text-[12px]">
          <thead className="text-muted">
            <tr>
              <th className="py-2 pr-2 font-semibold">{t('field_retailer')}</th>
              {caps.map((c) => (
                <th key={c} className="py-2 pr-2 font-semibold">
                  {t(`cap_${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((r) => (
              <tr key={r.id}>
                <td className="py-2 pr-2">
                  <span className="font-semibold text-fg">{r.name}</span>
                  {r.notes && <span className="block max-w-56 text-[11px] text-muted">{r.notes}</span>}
                  {r.reportedPaymentMethods && <span className="block text-[11px] text-muted" title={t('retailer_payment')}>💳 {r.reportedPaymentMethods.join(', ')}</span>}
                </td>
                {caps.map((c) => (
                  <td key={c} className="py-2 pr-2">
                    <Badge tone={STATUS_TONE[r.capabilities[c]]}>{t(`retailer_status_${r.capabilities[c]}`)}</Badge>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DataSettings() {
  const { t, settings } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        icon={<Download className="size-4" />}
        onClick={async () => {
          const data = await exportAll();
          const { cloud: _cloud, ...safeSettings } = settings;
          downloadText(`wishsnag-backup-${stamp()}.json`, JSON.stringify(buildExportBundle({ ...data, settings: safeSettings }, pkg.version), null, 2), 'application/json');
        }}
      >
        {t('data_export_json')}
      </Button>
      <Button
        icon={<Download className="size-4" />}
        onClick={async () => {
          const data = await exportAll();
          downloadText(`wishsnag-wishlist-${stamp()}.csv`, itemsToCsv(data.items, new Map(data.offers.map((o) => [o.id, o])), data.collections), 'text/csv');
        }}
      >
        {t('data_export_csv')}
      </Button>
      <Button icon={<Upload className="size-4" />} onClick={() => navigate('/import')}>
        {t('data_import')}
      </Button>
      <Button
        variant="danger"
        icon={<Trash2 className="size-4" />}
        onClick={async () => {
          if (!(await confirm({ title: t('data_delete_all'), body: t('data_delete_confirm'), confirmLabel: t('act_delete'), cancelLabel: t('act_cancel'), danger: true }))) return;
          await deleteAllData();
          await kv().clear();
          void send({ type: 'badge:refresh' }).catch(() => undefined);
          toast.show(t('data_deleted'));
          setTimeout(() => location.reload(), 600);
        }}
      >
        {t('data_delete_all')}
      </Button>
    </div>
  );
}

function CloudSettings() {
  const { t, f, settings, updateSettings } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const cloud = useCloudState(settings);
  const [url, setUrl] = useState(settings.cloud.url);
  const [key, setKey] = useState(settings.cloud.anonKey);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<number | null>(null);
  useEffect(() => void lastSyncAt().then(setLast), [busy]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.show(t('cloud_unavailable', { error: err instanceof Error ? err.message : String(err) }), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('cloud_url')}>{(p) => <Input {...p} value={url} placeholder="https://xyzcompany.supabase.co" onChange={(e) => setUrl(e.target.value)} />}</Field>
        <Field label={t('cloud_anon_key')}>{(p) => <Input {...p} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} />}</Field>
      </div>
      <p className="text-[12px] text-muted">{t('cloud_config_hint')}</p>
      {(url !== settings.cloud.url || key !== settings.cloud.anonKey) && (
        <Button size="sm" className="self-start" onClick={() => void updateSettings({ cloud: { url: url.trim(), anonKey: key.trim() } })}>
          {t('act_save')}
        </Button>
      )}
      {!cloud.configured ? (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-muted">{t('cloud_not_configured')}</p>
      ) : cloud.signedIn ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold">{t('cloud_signed_in_as', { email: cloud.email ?? '' })}</p>
          {last && <p className="text-[12px] text-muted">{t('cloud_last_sync', { time: f.relative(last) })}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" loading={busy} icon={<RefreshCw className="size-4" />} onClick={() => void run(async () => toast.show(t('cloud_sync_result', await syncNow(settings) as unknown as Record<string, number>)))}>
              {t('cloud_sync_now')}
            </Button>
            <Button size="sm" icon={<LogOut className="size-4" />} onClick={() => void run(() => signOut(settings))}>
              {t('cloud_sign_out')}
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={<Trash2 className="size-4" />}
              onClick={async () => {
                if (await confirm({ title: t('cloud_delete_account'), body: t('cloud_delete_confirm'), confirmLabel: t('act_delete'), cancelLabel: t('act_cancel'), danger: true })) await run(() => deleteCloudAccount(settings));
              }}
            >
              {t('cloud_delete_account')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t('cloud_email')} className="min-w-64 flex-1">
              {(p) => <Input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
            </Field>
            <Button loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(email)} onClick={() => void run(async () => (await sendOtp(settings, email), setSent(true), toast.show(t('cloud_code_sent'))))}>
              {t('cloud_send_code')}
            </Button>
          </div>
          {sent && (
            <div className="flex flex-wrap items-end gap-2">
              <Field label={t('cloud_code')}>{(p) => <Input {...p} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className="w-40 tabular" />}</Field>
              <Button variant="primary" loading={busy} onClick={() => void run(() => verifyOtp(settings, email, code))}>
                {t('cloud_verify')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
