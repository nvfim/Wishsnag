import { useEffect, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, ArrowLeft, CircleCheck, ExternalLink, PackageCheck, Pencil, Plus, Radar, ShieldCheck, Trash2, Undo2 } from 'lucide-react';
import type { Condition, RetailerOffer, WishlistItem } from '@/core/types';
import { summarise } from '@/core/summary';
import { computeStats, historyInsights, priceChanges } from '@/core/history/stats';
import { normaliseGtin } from '@/core/matching/identifiers';
import { safeUrl } from '@/core/util/url';
import { cleanOptional, cleanText } from '@/core/util/text';
import { deleteItems, recordObservation, setItemCollections, updateItem, updateOffer } from '@/db/repo';
import { db } from '@/db/schema';
import { processObservation } from '@/services/alertsService';
import { hasOriginAccess, requestOriginAccess, siteLabel } from '@/services/permissions';
import { useApp } from '@/ui/app/AppContext';
import { useCollections, useItemBundle, useItems, useOffers } from '@/ui/hooks/data';
import { Field, Input, Segmented, Select, TextArea, Toggle, parseNumberInput } from '@/ui/components/forms';
import { Badge, Button, Card, EmptyState, SectionHeader, Skeleton, cn } from '@/ui/components/primitives';
import { ProductImage, StatusBadges } from '@/ui/components/product';
import { PriceChart } from '@/ui/components/PriceChart';
import { ComparisonView } from '@/ui/components/ComparisonView';
import { AlertsEditor, TargetPriceEditor } from '@/ui/components/AlertsEditor';
import { Dialog, useConfirm, useToast } from '@/ui/components/overlay';
import { openExternal } from '@/ui/lib/nav';
import { navigate, type Route } from '../router';

export function ItemDetail({ id, route }: { id: string; route: Route }) {
  const { t, f, settings, fx } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const bundle = useItemBundle(id);
  const collections = useCollections() ?? [];
  const allItems = useItems();
  const allOffers = useOffers();
  const [editing, setEditing] = useState(false);
  const [recording, setRecording] = useState(false);
  const summary = useMemo(() => (bundle ? summarise(bundle.item, bundle.offers, { settings, fx, now: Date.now() }) : null), [bundle, settings, fx]);

  useEffect(() => {
    if (route.query.get('section') === 'alerts') setTimeout(() => document.getElementById('alerts')?.scrollIntoView({ behavior: 'smooth' }), 200);
  }, [route.query]);

  if (bundle === undefined) return <Skeleton className="h-96" />;
  if (bundle === null || !summary) return <EmptyState icon={<Trash2 className="size-7" />} title={t('state_error')} action={<Button onClick={() => navigate('/wishlist')}>{t('detail_back')}</Button>} />;

  const { item, offers, observations, alerts } = bundle;
  const primary = summary.primary;
  const primaryObs = observations.filter((o) => o.offerId === primary?.id);
  const stats = computeStats(primaryObs);
  const insights = historyInsights(primaryObs, Date.now());
  const changes = priceChanges(primaryObs).slice(0, 12);
  const otherItems = (allItems ?? []).map((it) => ({ item: it, offer: (allOffers ?? []).find((o) => o.id === it.primaryOfferId) }));
  const cur = summary.latest?.currency ?? primary?.currency ?? settings.displayCurrency;

  return (
    <div className="flex flex-col gap-6">
      <a href="#/wishlist" className="inline-flex items-center gap-1 self-start text-[13px] font-semibold text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> {t('detail_back')}
      </a>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <Card className="overflow-hidden p-3">
          <ProductImage src={item.imageUrl} alt={item.title} className="aspect-square w-full p-6" />
        </Card>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadges summary={summary} max={4} />
            {summary.tracking && (
              <Badge tone="lilac" icon={<Radar className="size-3.5" />}>
                {t('badge_tracking')}
              </Badge>
            )}
          </div>
          <div>
            <p className="text-[13px] font-semibold text-muted">{[item.brand, item.model].filter(Boolean).join(' · ')}</p>
            <h1 className="font-display text-2xl leading-tight font-extrabold text-fg sm:text-3xl">{item.title}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(item.variant)
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <Badge key={k} tone="outline">
                    {t(`field_${k === 'colour' ? 'colour' : k === 'memory' ? 'memory' : k === 'size' ? 'size' : k === 'storage' ? 'storage' : 'variant'}` as 'field_colour')}: {v}
                  </Badge>
                ))}
              {item.condition !== 'unknown' && <Badge tone="outline">{t(`condition_${item.condition}`)}</Badge>}
              {item.identifiers.gtin && <Badge tone="outline">GTIN {item.identifiers.gtin.replace(/^0+(?=\d{8,})/, '')}</Badge>}
            </div>
          </div>

          <Card className="flex flex-wrap items-end justify-between gap-4 p-4">
            <div>
              <p className="text-[12px] font-semibold text-muted">{t('detail_latest_observed')}</p>
              {summary.latest ? (
                <>
                  <p className="tabular font-display text-3xl font-extrabold">{f.money(summary.latest.price, summary.latest.currency)}</p>
                  {f.approx(summary.latest.price, summary.latest.currency) && <p className="tabular text-[12px] text-muted">{f.approx(summary.latest.price, summary.latest.currency)}</p>}
                </>
              ) : (
                <p className="text-sm text-muted">{t('detail_no_price_hint')}</p>
              )}
              <p className="mt-1 text-[12px] text-muted">
                {t('detail_saved_from')} <b className="text-fg">{primary?.retailerName}</b> · {t('detail_saved_on')} {f.date(item.createdAt)}
                {primary?.lastVerifiedAt && <> · {t('detail_last_checked', { time: f.relative(primary.lastVerifiedAt) })}</>}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {primary?.url && (
                <Button variant="primary" icon={<ExternalLink className="size-4" />} onClick={() => openExternal(primary.url)}>
                  {t('act_view_deal')}
                </Button>
              )}
              <Button icon={<Plus className="size-4" />} onClick={() => setRecording(true)}>
                {t('detail_record_price')}
              </Button>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MiniStat label={t('detail_first_observed')} value={stats ? f.money(stats.first.price, stats.currency) : '—'} />
            <MiniStat
              label={t('detail_change')}
              value={summary.change ? `${summary.change.amount > 0 ? '+' : ''}${f.money(summary.change.amount, summary.change.currency)} (${f.percent(summary.change.percent, 1)})` : '—'}
              tone={summary.change && summary.change.amount < 0 ? 'savings' : undefined}
            />
            <MiniStat label={t('detail_lowest_observed')} value={stats ? f.money(stats.lowest.price, stats.currency) : '—'} tone="savings" />
            <MiniStat label={t('detail_highest_observed')} value={stats ? f.money(stats.highest.price, stats.currency) : '—'} />
            <MiniStat label={t('detail_average_observed')} value={stats ? f.money(stats.average, stats.currency) : '—'} />
            <MiniStat label={t('history_observations')} value={stats ? f.number(stats.count) : '0'} />
          </div>

          <Card className="flex flex-col gap-3 p-4">
            <h2 className="text-sm font-bold">{t('field_target_price')}</h2>
            <TargetPriceEditor item={item} currency={summary.latest?.currency ?? null} latest={summary.latest?.price ?? null} />
          </Card>

          <Card className="grid gap-4 p-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold">{t('field_priority')}</span>
              <Segmented label={t('field_priority')} value={item.priority} onChange={(p) => void updateItem(item.id, { priority: p })} options={(['low', 'medium', 'high'] as const).map((p) => ({ value: p, label: t(`priority_${p}`) }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold">{t('field_collections')}</span>
              <div className="flex flex-wrap gap-1.5">
                {collections.map((c) => {
                  const on = item.collectionIds.includes(c.id);
                  return (
                    <button key={c.id} type="button" aria-pressed={on} onClick={() => void setItemCollections([item.id], [c.id], on ? 'remove' : 'add')} className={cn('rounded-full border px-2.5 py-1 text-[12.5px] font-semibold', on ? 'border-lilac-500 bg-accent-soft text-accent' : 'border-line text-muted hover:text-fg')}>
                      {c.emoji} {c.name}
                    </button>
                  );
                })}
                {!collections.length && <a href="#/collections" className="text-[12.5px] font-semibold text-accent">{t('collection_new')}</a>}
              </div>
            </div>
            <Toggle checked={item.inBudgetPlan} onChange={(v) => void updateItem(item.id, { inBudgetPlan: v })} label={t('detail_budget_plan')} />
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Button size="sm" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                {t('act_edit')}
              </Button>
              {item.status === 'purchased' ? (
                <Button size="sm" icon={<Undo2 className="size-4" />} onClick={() => void updateItem(item.id, { status: 'wanted' })}>
                  {t('detail_mark_wanted')}
                </Button>
              ) : (
                <Button size="sm" variant="savings" icon={<PackageCheck className="size-4" />} onClick={() => void updateItem(item.id, { status: 'purchased' })}>
                  {t('detail_mark_purchased')}
                </Button>
              )}
              <Button size="sm" icon={item.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />} onClick={() => void updateItem(item.id, { archived: !item.archived })}>
                {item.archived ? t('detail_unarchive') : t('detail_archive')}
              </Button>
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 className="size-4" />}
                onClick={async () => {
                  if (!(await confirm({ title: t('detail_delete'), body: t('detail_delete_confirm', { name: item.title }), confirmLabel: t('act_delete'), cancelLabel: t('act_cancel'), danger: true }))) return;
                  await deleteItems([item.id]);
                  toast.show(t('detail_deleted'));
                  navigate('/wishlist');
                }}
              >
                {t('act_delete')}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <section>
        <SectionHeader title={t('detail_history')} subtitle={t('history_subtitle')} />
        <Card className="p-4">
          <PriceChart observations={primaryObs} target={item.targetCurrency === cur ? item.targetPrice : null} height={280} />
          {insights.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {insights.map((i) => (
                <li key={i.key}>
                  <Badge tone={i.key === 'above_30_day_average' ? 'neutral' : 'savings'}>{t(`insight_${i.key}`, i.params)}</Badge>
                </li>
              ))}
            </ul>
          )}
          {changes.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-[13px] font-semibold text-accent">{t('history_changes')}</summary>
              <table className="mt-2 w-full text-left text-[12.5px]">
                <tbody className="divide-y divide-line">
                  {changes.map((c) => (
                    <tr key={c.at}>
                      <td className="py-1.5 text-muted">{f.dateTime(c.at)}</td>
                      <td className="tabular py-1.5 text-right font-semibold">{c.from !== null ? t('drops_from_to', { old: f.money(c.from, c.currency), new: f.money(c.to, c.currency) }) : f.money(c.to, c.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </Card>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section>
          <SectionHeader title={t('detail_offers')} subtitle={t('compare_subtitle')} />
          <ComparisonView item={item} offers={offers} otherItems={otherItems} />
        </section>
        <div className="flex flex-col gap-6">
          <section id="alerts">
            <SectionHeader title={t('detail_alerts')} />
            <Card className="p-4">
              <AlertsEditor item={item} alerts={alerts} currency={summary.latest?.currency ?? null} />
            </Card>
          </section>
          <section>
            <SectionHeader title={t('detail_monitoring')} subtitle={t('monitoring_cloud_note')} />
            <Card className="flex flex-col divide-y divide-line">
              {offers.map((o) => (
                <MonitorRow key={o.id} offer={o} />
              ))}
            </Card>
          </section>
          <NotesCard item={item} />
        </div>
      </div>

      {editing && <EditDialog item={item} onClose={() => setEditing(false)} />}
      {recording && primary && <RecordPriceDialog offer={primary} onClose={() => setRecording(false)} />}
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'savings' }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-3 py-2.5">
      <p className="text-[11.5px] font-semibold text-muted">{label}</p>
      <p className={cn('tabular truncate text-[15px] font-bold', tone === 'savings' ? 'text-savings' : 'text-fg')}>{value}</p>
    </div>
  );
}

function MonitorRow({ offer }: { offer: RetailerOffer }) {
  const { t, f, settings } = useApp();
  const toast = useToast();
  const [access, setAccess] = useState<boolean | null>(null);
  useEffect(() => {
    if (offer.url) void hasOriginAccess(offer.url).then(setAccess);
  }, [offer.url]);
  const status = offer.check.lastStatus;
  return (
    <div className="flex flex-col gap-2 p-4">
      <Toggle
        checked={offer.check.enabled}
        disabled={!offer.url}
        onChange={async (v) => {
          if (v && offer.url && !access) {
            const ok = await requestOriginAccess([offer.url]);
            setAccess(ok);
            if (!ok) return toast.show(t('permissions_denied'), { tone: 'error' });
          }
          await updateOffer(offer.id, { check: { ...offer.check, enabled: v, nextCheckAt: v ? Date.now() + 60_000 : null, failures: 0 } });
        }}
        label={offer.retailerName}
        description={offer.check.enabled ? t('detail_monitoring_on', { hours: settings.monitoring.intervalHours }) : t('detail_monitoring_off')}
      />
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
        {status && <Badge tone={status === 'ok' ? 'savings' : status === 'needs_permission' || status === 'rate_limited' ? 'neutral' : 'warn'}>{t(`detail_check_status_${status}`)}</Badge>}
        {offer.check.lastCheckedAt && <span>{t('detail_last_checked', { time: f.relative(offer.check.lastCheckedAt) })}</span>}
        {offer.check.lastError && <span className="truncate">({offer.check.lastError})</span>}
      </div>
      {offer.url && access === false && (
        <Button
          size="sm"
          variant="soft"
          icon={<ShieldCheck className="size-4" />}
          className="self-start"
          onClick={async () => {
            const ok = await requestOriginAccess([offer.url]);
            setAccess(ok);
            toast.show(ok ? t('permissions_granted', { site: siteLabel(offer.url) }) : t('permissions_denied'), { tone: ok ? 'success' : 'error' });
          }}
        >
          {t('detail_monitoring_permission', { site: siteLabel(offer.url) })}
        </Button>
      )}
    </div>
  );
}

function NotesCard({ item }: { item: WishlistItem }) {
  const { t } = useApp();
  const [notes, setNotes] = useState(item.notes);
  const [tags, setTags] = useState(item.tags.join(', '));
  const dirty = notes !== item.notes || tags !== item.tags.join(', ');
  return (
    <section>
      <SectionHeader title={t('field_notes')} />
      <Card className="flex flex-col gap-3 p-4">
        <TextArea aria-label={t('field_notes')} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Input aria-label={t('field_tags')} placeholder={t('field_tags_hint')} value={tags} onChange={(e) => setTags(e.target.value)} />
        {dirty && (
          <Button
            size="sm"
            variant="primary"
            className="self-end"
            onClick={() =>
              void updateItem(item.id, {
                notes: cleanText(notes, 2000),
                tags: [...new Set(tags.split(',').map((x) => cleanText(x, 30).toLowerCase()).filter(Boolean))],
              })
            }
          >
            {t('act_save')}
          </Button>
        )}
      </Card>
    </section>
  );
}

function EditDialog({ item, onClose }: { item: WishlistItem; onClose: () => void }) {
  const { t } = useApp();
  const [v, setV] = useState({ title: item.title, brand: item.brand ?? '', model: item.model ?? '', category: item.category ?? '', imageUrl: item.imageUrl ?? '', gtin: item.identifiers.gtin?.replace(/^0+(?=\d{8,})/, '') ?? '', mpn: item.identifiers.mpn ?? '', colour: item.variant.colour ?? '', size: item.variant.size ?? '', storage: item.variant.storage ?? '', condition: item.condition });
  const [error, setError] = useState<Record<string, string>>({});
  const set = (k: keyof typeof v, value: string) => setV((s) => ({ ...s, [k]: value }));
  async function save() {
    const errs: Record<string, string> = {};
    if (!cleanText(v.title, 300)) errs.title = t('field_required');
    if (v.gtin && !normaliseGtin(v.gtin)) errs.gtin = t('field_invalid_gtin');
    if (v.imageUrl && !safeUrl(v.imageUrl)) errs.imageUrl = t('field_invalid_url');
    setError(errs);
    if (Object.keys(errs).length) return;
    await updateItem(item.id, {
      title: cleanText(v.title, 300),
      brand: cleanOptional(v.brand, 80),
      model: cleanOptional(v.model, 80),
      category: cleanOptional(v.category, 60),
      imageUrl: safeUrl(v.imageUrl),
      identifiers: { ...item.identifiers, gtin: normaliseGtin(v.gtin) ?? undefined, mpn: cleanOptional(v.mpn, 60) },
      variant: { ...item.variant, colour: cleanOptional(v.colour, 40), size: cleanOptional(v.size, 40), storage: cleanOptional(v.storage, 20) },
      condition: v.condition as Condition,
    });
    onClose();
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={t('act_edit')}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>{t('act_cancel')}</Button>
          <Button variant="primary" icon={<CircleCheck className="size-4" />} onClick={() => void save()}>
            {t('act_save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('field_title')} error={error.title} className="sm:col-span-2">
          {(p) => <TextArea {...p} rows={2} value={v.title} onChange={(e) => set('title', e.target.value)} />}
        </Field>
        <Field label={t('field_brand')}>{(p) => <Input {...p} value={v.brand} onChange={(e) => set('brand', e.target.value)} />}</Field>
        <Field label={t('field_model')}>{(p) => <Input {...p} value={v.model} onChange={(e) => set('model', e.target.value)} />}</Field>
        <Field label={t('field_gtin')} error={error.gtin}>{(p) => <Input {...p} value={v.gtin} onChange={(e) => set('gtin', e.target.value)} />}</Field>
        <Field label={t('field_mpn')}>{(p) => <Input {...p} value={v.mpn} onChange={(e) => set('mpn', e.target.value)} />}</Field>
        <Field label={t('field_colour')}>{(p) => <Input {...p} value={v.colour} onChange={(e) => set('colour', e.target.value)} />}</Field>
        <Field label={t('field_size')}>{(p) => <Input {...p} value={v.size} onChange={(e) => set('size', e.target.value)} />}</Field>
        <Field label={t('field_storage')}>{(p) => <Input {...p} value={v.storage} onChange={(e) => set('storage', e.target.value)} />}</Field>
        <Field label={t('field_category')}>{(p) => <Input {...p} value={v.category} onChange={(e) => set('category', e.target.value)} />}</Field>
        <Field label={t('field_condition')}>
          {(p) => (
            <Select {...p} value={v.condition} onChange={(e) => set('condition', e.target.value)}>
              {(['new', 'used', 'refurbished', 'damaged', 'unknown'] as const).map((c) => (
                <option key={c} value={c}>
                  {t(`condition_${c}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('field_image')} error={error.imageUrl}>{(p) => <Input {...p} type="url" value={v.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} />}</Field>
      </div>
    </Dialog>
  );
}

function RecordPriceDialog({ offer, onClose }: { offer: RetailerOffer; onClose: () => void }) {
  const { t } = useApp();
  const toast = useToast();
  const [price, setPrice] = useState(offer.price === null ? '' : String(offer.price));
  const [stock, setStock] = useState(offer.availability);
  const [error, setError] = useState<string | null>(null);
  const currency = offer.currency;
  return (
    <Dialog
      open
      onClose={onClose}
      title={t('detail_record_price')}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>{t('act_cancel')}</Button>
          <Button
            variant="primary"
            onClick={async () => {
              const n = parseNumberInput(price);
              if (n === null || Number.isNaN(n) || !currency) return setError(t('field_invalid_price'));
              const rec = await recordObservation(offer.id, { price: n, currency, availability: stock, source: 'manual_entry' });
              await processObservation(rec);
              toast.show(t('alert_saved'));
              onClose();
            }}
          >
            {t('act_save')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[12.5px] text-muted">{t('detail_record_price_hint')}</p>
      <div className="grid gap-3">
        <Field label={`${t('field_price')} (${currency ?? '—'})`} error={error}>
          {(p) => <Input {...p} autoFocus inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />}
        </Field>
        <Field label={t('field_availability')}>
          {(p) => (
            <Select {...p} value={stock} onChange={(e) => setStock(e.target.value as RetailerOffer['availability'])}>
              {(['in_stock', 'out_of_stock', 'preorder', 'limited', 'unknown'] as const).map((a) => (
                <option key={a} value={a}>
                  {t(`availability_${a}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Dialog>
  );
}

export async function itemExists(id: string): Promise<boolean> {
  return !!(await db().items.get(id));
}
