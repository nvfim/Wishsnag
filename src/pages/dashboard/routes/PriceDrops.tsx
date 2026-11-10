import { useMemo } from 'react';
import { TrendingDown } from 'lucide-react';
import { useApp } from '@/ui/app/AppContext';
import { useSummaries } from '@/ui/hooks/data';
import { Badge, Card, EmptyState, SectionHeader } from '@/ui/components/primitives';
import { ProductImage } from '@/ui/components/product';
import { navigate } from '../router';

/** Only genuinely observed reductions (saved price → latest observed price). */
export function PriceDrops() {
  const { t, f } = useApp();
  const summaries = useSummaries();
  const drops = useMemo(() => (summaries ?? []).filter((s) => s.change && s.change.amount < 0 && !s.item.archived).sort((a, b) => a.change!.percent - b.change!.percent), [summaries]);
  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('drops_title')} subtitle={t('drops_subtitle')} />
      {!drops.length ? (
        <Card>
          <EmptyState icon={<TrendingDown className="size-8" />} title={t('drops_empty')} body={t('drops_empty_hint')} />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {drops.map((s) => (
            <Card key={s.item.id} interactive className="p-0">
              <button type="button" onClick={() => navigate(`/item/${s.item.id}`)} className="flex w-full items-center gap-4 p-4 text-left">
                <ProductImage src={s.item.imageUrl} alt={s.item.title} className="size-20 shrink-0 border border-line p-1.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-muted">{s.primary?.retailerName}</p>
                  <h3 className="line-clamp-2 text-[14px] font-bold">{s.item.title}</h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="tabular text-[15px] font-extrabold text-savings">{t('drops_from_to', { old: f.money(s.saved!.price, s.saved!.currency), new: f.money(s.latest!.price, s.latest!.currency) })}</span>
                    <Badge tone="savings">{t('badge_drop', { percent: f.percent(-s.change!.percent) })}</Badge>
                    {s.targetReached && <Badge tone="hot">{t('badge_target_reached')}</Badge>}
                  </div>
                  <p className="mt-1 text-[11.5px] text-muted">
                    {t('drops_since_saved')} · {s.lastChange?.at ? t('detail_last_checked', { time: f.relative(s.lastChange.at) }) : ''}
                  </p>
                </div>
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
