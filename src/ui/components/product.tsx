import { useState, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, BadgeCheck, Clock, PackageX, Radar, ShoppingBag, Target } from 'lucide-react';
import type { MatchConfidence } from '@/core/types';
import type { ItemSummary } from '@/core/summary';
import { safeUrl } from '@/core/util/url';
import { useApp } from '../app/AppContext';
import { Badge, Card, cn } from './primitives';

const PLACEHOLDER_GRADIENTS = [
  'from-lilac-200 to-pop-300',
  'from-mint-200 to-lilac-200',
  'from-pop-300 to-lilac-300',
  'from-lilac-100 to-mint-300',
];

/** Product image with lazy loading, no referrer leakage and a branded fallback. */
export function ProductImage({ src, alt, className, rounded = 'rounded-2xl' }: { src?: string; alt: string; className?: string; rounded?: string }) {
  const [failed, setFailed] = useState(false);
  const url = safeUrl(src);
  const g = PLACEHOLDER_GRADIENTS[(alt.charCodeAt(0) || 0) % PLACEHOLDER_GRADIENTS.length];
  if (!url || failed) {
    return (
      <div aria-hidden className={cn('grid place-items-center bg-gradient-to-br text-white/90', g, rounded, className)}>
        <ShoppingBag className="size-1/3 max-h-10 max-w-10 drop-shadow" />
      </div>
    );
  }
  return <img src={url} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={cn('bg-white object-contain', rounded, className)} />;
}

export function PriceTag({ summary, size = 'md', showApprox = true }: { summary: ItemSummary; size?: 'sm' | 'md' | 'lg'; showApprox?: boolean }) {
  const { f, t } = useApp();
  if (!summary.latest) return <span className="text-sm text-muted">{t('card_no_price')}</span>;
  const { price, currency } = summary.latest;
  const approx = showApprox ? f.approx(price, currency) : null;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2">
        <span className={cn('tabular font-display font-extrabold text-fg', size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-[15px]' : 'text-lg')}>{f.money(price, currency)}</span>
        {summary.saved && summary.change && summary.change.amount < 0 && <span className="tabular text-[12.5px] text-muted line-through">{f.money(summary.saved.price, currency)}</span>}
      </div>
      {approx && <div className="tabular text-[11.5px] text-muted">{approx}</div>}
    </div>
  );
}

export function ChangeBadge({ summary }: { summary: ItemSummary }) {
  const { t, f } = useApp();
  const c = summary.change;
  if (!c || Math.abs(c.percent) < 0.5) return null;
  if (c.amount < 0) return <Badge tone="savings" icon={<ArrowDownRight className="size-3.5" />}>{t('badge_drop', { percent: f.percent(-c.percent) })}</Badge>;
  return <Badge tone="neutral" icon={<ArrowUpRight className="size-3.5" />}>{t('badge_rise', { percent: f.percent(c.percent) })}</Badge>;
}

export function StatusBadges({ summary, max = 3 }: { summary: ItemSummary; max?: number }) {
  const { t } = useApp();
  const out: ReactNode[] = [];
  if (summary.targetReached) out.push(<Badge key="t" tone="hot" icon={<Target className="size-3.5" />}>{t('badge_target_reached')}</Badge>);
  const change = <ChangeBadge key="c" summary={summary} />;
  if (summary.change && summary.change.amount < 0) out.push(change);
  if (summary.inStock === false) out.push(<Badge key="o" tone="warn" icon={<PackageX className="size-3.5" />}>{t('badge_out_of_stock')}</Badge>);
  if (summary.item.status === 'purchased') out.push(<Badge key="p" tone="lilac">{t('badge_purchased')}</Badge>);
  if (summary.item.archived) out.push(<Badge key="a">{t('badge_archived')}</Badge>);
  if (summary.stale && summary.latest && !summary.item.archived) out.push(<Badge key="s" tone="outline" icon={<Clock className="size-3" />}>{t('badge_stale')}</Badge>);
  return <>{out.slice(0, max)}</>;
}

const PRIORITY_DOT = { high: 'bg-pop-500', medium: 'bg-lilac-400', low: 'bg-ink-300' } as const;

export function ProductCard({ summary, onOpen, selected, onSelect }: { summary: ItemSummary; onOpen: () => void; selected?: boolean; onSelect?: (v: boolean) => void }) {
  const { t, f } = useApp();
  const it = summary.item;
  return (
    <Card interactive className={cn('group relative flex flex-col overflow-hidden', selected && 'ring-2 ring-lilac-500')}>
      {onSelect && (
        <input
          type="checkbox"
          aria-label={it.title}
          checked={!!selected}
          onChange={(e) => onSelect(e.target.checked)}
          className={cn('absolute top-3 left-3 z-10 size-4 accent-[#6a45f0] transition-opacity', selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100')}
        />
      )}
      <button type="button" onClick={onOpen} className="flex flex-1 flex-col text-left focus-visible:outline-none">
        <div className="relative m-2 mb-0 aspect-square overflow-hidden rounded-2xl bg-surface-2">
          <ProductImage src={it.imageUrl} alt={it.title} className="size-full p-3 transition-transform duration-300 group-hover:scale-[1.04]" />
          <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
            <StatusBadges summary={summary} max={2} />
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3.5">
          <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted">
            <span className={cn('size-1.5 shrink-0 rounded-full', PRIORITY_DOT[it.priority])} title={t(`priority_${it.priority}`)} />
            <span className="truncate">{summary.primary?.retailerName ?? '—'}</span>
            {summary.tracking && <Radar className="ml-auto size-3.5 shrink-0 text-accent" aria-label={t('badge_tracking')} />}
          </div>
          <h3 className="line-clamp-2 text-[14px] leading-snug font-semibold text-fg">{it.title}</h3>
          <div className="mt-auto flex items-end justify-between gap-2">
            <PriceTag summary={summary} size="sm" />
            {it.targetPrice !== null && !summary.targetReached && (
              <span className="tabular shrink-0 text-[11px] text-muted" title={t('field_target_price')}>
                <Target className="mr-0.5 inline size-3" />
                {f.money(it.targetPrice, it.targetCurrency ?? summary.latest?.currency ?? 'USD')}
              </span>
            )}
          </div>
        </div>
      </button>
    </Card>
  );
}

export function ProductRow({ summary, onOpen, right, compact }: { summary: ItemSummary; onOpen: () => void; right?: ReactNode; compact?: boolean }) {
  const it = summary.item;
  return (
    <div className={cn('group flex items-center gap-3 rounded-2xl transition-colors hover:bg-surface-2', compact ? 'p-1.5' : 'p-2')}>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <ProductImage src={it.imageUrl} alt={it.title} className={cn('shrink-0 border border-line p-1', compact ? 'size-11' : 'size-14')} rounded="rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className={cn('truncate font-semibold text-fg', compact ? 'text-[13px]' : 'text-sm')}>{it.title}</div>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
            <span className="truncate">{summary.primary?.retailerName}</span>
            <StatusBadges summary={summary} max={2} />
          </div>
        </div>
      </button>
      {right ?? <PriceTag summary={summary} size="sm" showApprox={!compact} />}
    </div>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: MatchConfidence | 'source' }) {
  const { t } = useApp();
  const tone = confidence === 'verified_exact' || confidence === 'source' ? 'savings' : confidence === 'high' ? 'lilac' : confidence === 'possible' ? 'warn' : 'neutral';
  return (
    <Badge tone={tone} icon={confidence === 'verified_exact' ? <BadgeCheck className="size-3.5" /> : undefined}>
      {t(`conf_${confidence}`)}
    </Badge>
  );
}

export function StatCard({ label, value, hint, icon, tone = 'lilac' }: { label: string; value: ReactNode; hint?: ReactNode; icon: ReactNode; tone?: 'lilac' | 'hot' | 'savings' | 'warn' }) {
  const toneCls = { lilac: 'bg-accent-soft text-accent', hot: 'bg-hot-soft text-hot', savings: 'bg-savings-soft text-savings', warn: 'bg-warn-soft text-warn' }[tone];
  return (
    <Card className="flex items-center gap-3.5 p-4">
      <div className={cn('grid size-11 shrink-0 place-items-center rounded-2xl', toneCls)}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-muted">{label}</div>
        <div className="tabular truncate font-display text-xl font-extrabold text-fg">{value}</div>
        {hint && <div className="truncate text-[11px] text-muted">{hint}</div>}
      </div>
    </Card>
  );
}
