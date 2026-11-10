import { useMemo, useState } from 'react';
import { LineChart, Scale, Search } from 'lucide-react';
import { useApp } from '@/ui/app/AppContext';
import { useItemBundle, useItems, useOffers, useSummaries } from '@/ui/hooks/data';
import { Card, EmptyState, SectionHeader, cn } from '@/ui/components/primitives';
import { ProductImage } from '@/ui/components/product';
import { ComparisonView } from '@/ui/components/ComparisonView';
import { PriceChart } from '@/ui/components/PriceChart';
import { computeStats, historyInsights, priceChanges } from '@/core/history/stats';
import { Badge } from '@/ui/components/primitives';
import { searchableText } from '@/core/matching/normalize';
import { navigate, type Route } from '../router';

function ItemPicker({ selected, base }: { selected?: string; base: string }) {
  const { t } = useApp();
  const summaries = useSummaries() ?? [];
  const [q, setQ] = useState('');
  const terms = searchableText([q]).split(' ').filter(Boolean);
  const list = summaries.filter((s) => !s.item.archived && (!terms.length || terms.every((tt) => s.searchText.includes(tt)))).sort((a, b) => b.item.updatedAt - a.item.updatedAt);
  return (
    <Card className="flex max-h-[75vh] flex-col overflow-hidden">
      <label className="relative border-b border-line p-2">
        <Search className="pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search_placeholder')} aria-label={t('history_pick_item')} className="h-9 w-full rounded-xl bg-surface-2 pr-3 pl-9 text-sm outline-none" />
      </label>
      <ul className="overflow-y-auto p-1.5">
        {list.map((s) => (
          <li key={s.item.id}>
            <button type="button" onClick={() => navigate(`${base}/${s.item.id}`)} aria-current={selected === s.item.id} className={cn('flex w-full items-center gap-2.5 rounded-xl p-2 text-left hover:bg-surface-2', selected === s.item.id && 'bg-accent-soft')}>
              <ProductImage src={s.item.imageUrl} alt={s.item.title} className="size-10 shrink-0 border border-line p-0.5" rounded="rounded-lg" />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold">{s.item.title}</span>
                <span className="block truncate text-[11.5px] text-muted">
                  {s.primary?.retailerName}
                  {s.offers.length > 1 && ` · ${t('card_offers', { count: s.offers.length })}`}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function FindCheaper({ route }: { route: Route }) {
  const { t } = useApp();
  const id = route.segments[1];
  const bundle = useItemBundle(id);
  const items = useItems();
  const offers = useOffers();
  const otherItems = useMemo(() => (items ?? []).map((it) => ({ item: it, offer: (offers ?? []).find((o) => o.id === it.primaryOfferId) })), [items, offers]);
  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('compare_title')} subtitle={t('compare_subtitle')} />
      <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <ItemPicker selected={id} base="/compare" />
        {bundle ? (
          <div className="flex flex-col gap-3">
            <a href={`#/item/${bundle.item.id}`} className="flex items-center gap-3">
              <ProductImage src={bundle.item.imageUrl} alt={bundle.item.title} className="size-14 border border-line p-1" />
              <h2 className="font-display text-lg font-bold hover:underline">{bundle.item.title}</h2>
            </a>
            <ComparisonView item={bundle.item} offers={bundle.offers} otherItems={otherItems} />
          </div>
        ) : (
          <Card>
            <EmptyState icon={<Scale className="size-8" />} title={t('compare_pick_item')} body={t('compare_subtitle')} />
          </Card>
        )}
      </div>
    </div>
  );
}

export function PriceHistory({ route }: { route: Route }) {
  const { t, f } = useApp();
  const id = route.segments[1];
  const bundle = useItemBundle(id);
  const [offerId, setOfferId] = useState<string | null>(null);
  const offer = bundle?.offers.find((o) => o.id === (offerId ?? bundle.item.primaryOfferId)) ?? bundle?.offers[0];
  const obs = bundle?.observations.filter((o) => o.offerId === offer?.id) ?? [];
  const stats = computeStats(obs);
  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('history_title')} subtitle={t('history_subtitle')} />
      <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <ItemPicker selected={id} base="/history" />
        {bundle && offer ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <a href={`#/item/${bundle.item.id}`} className="font-display text-lg font-bold hover:underline">
                {bundle.item.title}
              </a>
              {bundle.offers.length > 1 && (
                <select aria-label={t('history_offer')} className="h-9 rounded-xl border border-line bg-surface px-2 text-sm" value={offer.id} onChange={(e) => setOfferId(e.target.value)}>
                  {bundle.offers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.retailerName}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <Card className="p-4">
              <PriceChart observations={obs} target={bundle.item.targetCurrency === offer.currency ? bundle.item.targetPrice : null} height={320} />
            </Card>
            {stats && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  [t('detail_latest_observed'), stats.latest.price],
                  [t('detail_first_observed'), stats.first.price],
                  [t('detail_lowest_observed'), stats.lowest.price],
                  [t('detail_highest_observed'), stats.highest.price],
                  [t('detail_average_observed'), stats.average],
                ].map(([label, v]) => (
                  <Card key={label as string} className="p-3">
                    <p className="text-[11.5px] font-semibold text-muted">{label}</p>
                    <p className="tabular font-bold">{f.money(v as number, stats.currency)}</p>
                  </Card>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {historyInsights(obs, Date.now()).map((i) => (
                <Badge key={i.key} tone="savings">
                  {t(`insight_${i.key}`, i.params)}
                </Badge>
              ))}
            </div>
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-bold">{t('history_observations')}</h3>
              {obs.length ? (
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-left text-[12.5px]">
                    <thead className="text-muted">
                      <tr>
                        <th className="py-1 font-semibold">{t('detail_saved_on')}</th>
                        <th className="py-1 font-semibold">{t('field_price')}</th>
                        <th className="py-1 font-semibold">{t('field_availability')}</th>
                        <th className="py-1 font-semibold">{t('history_offer')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {[...obs].reverse().map((o) => (
                        <tr key={o.id}>
                          <td className="py-1.5 text-muted">{f.dateTime(o.observedAt)}</td>
                          <td className="tabular py-1.5 font-semibold">{f.money(o.price, o.currency)}</td>
                          <td className="py-1.5">{t(`availability_${o.availability}`)}</td>
                          <td className="py-1.5 text-muted">{t(`source_${o.source}`)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted">{t('detail_history_empty')}</p>
              )}
              {priceChanges(obs).length > 1 && <p className="mt-2 text-[12px] text-muted">{t('history_changes')}: {priceChanges(obs).length - 1}</p>}
            </Card>
          </div>
        ) : (
          <Card>
            <EmptyState icon={<LineChart className="size-8" />} title={t('history_pick_item')} body={t('history_subtitle')} />
          </Card>
        )}
      </div>
    </div>
  );
}
