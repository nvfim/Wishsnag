import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LineChart } from 'lucide-react';
import type { PriceObservation } from '@/core/types';
import { computeStats, filterRange, HISTORY_RANGES, type HistoryRange } from '@/core/history/stats';
import { useApp } from '../app/AppContext';
import { Segmented } from './forms';
import { EmptyState } from './primitives';

interface Point {
  t: number;
  price: number;
  source: string;
}

/**
 * Interactive price-history chart. Every point is a genuine recorded observation;
 * a step line is used because prices hold until the next observation.
 */
export function PriceChart({ observations, target, height = 240, compact = false, defaultRange = 'all' }: { observations: PriceObservation[]; target?: number | null; height?: number; compact?: boolean; defaultRange?: HistoryRange }) {
  const { f, t } = useApp();
  const [range, setRange] = useState<HistoryRange>(defaultRange);
  const currency = observations.length ? [...observations].sort((a, b) => b.observedAt - a.observedAt)[0]!.currency : null;
  const data = useMemo<Point[]>(() => filterRange(observations.filter((o) => o.currency === currency), range, Date.now()).map((o) => ({ t: o.observedAt, price: o.price, source: o.source })), [observations, range, currency]);
  const stats = computeStats(data.length ? observations.filter((o) => o.currency === currency && o.observedAt >= (data[0]?.t ?? 0)) : []);

  if (!currency || observations.filter((o) => o.currency === currency).length < 2) {
    return compact ? (
      <p className="py-3 text-center text-[12.5px] text-muted">{t('detail_history_empty')}</p>
    ) : (
      <EmptyState compact icon={<LineChart className="size-6" />} title={t('detail_history_empty')} body={t('detail_history_empty_hint')} />
    );
  }

  const prices = data.map((d) => d.price);
  const min = Math.min(...prices, target ?? Infinity);
  const max = Math.max(...prices, target ?? -Infinity);
  const pad = (max - min) * 0.15 || max * 0.05 || 1;
  const gradientId = `ws-area-${compact ? 'c' : 'f'}`;

  return (
    <div>
      {!compact && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Segmented size="sm" label={t('detail_history')} value={range} onChange={setRange} options={HISTORY_RANGES.map((r) => ({ value: r, label: t(`range_${r}`) }))} />
          {stats && (
            <div className="tabular text-[12px] text-muted">
              {t('detail_lowest_observed')} <b className="text-savings">{f.money(stats.lowest.price, currency)}</b> · {t('detail_highest_observed')} <b className="text-fg">{f.money(stats.highest.price, currency)}</b>
            </div>
          )}
        </div>
      )}
      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{t('history_no_changes')}</p>
      ) : (
        <div style={{ height }} role="img" aria-label={`${t('detail_history')}: ${data.length} ${t('history_observations')}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: compact ? 0 : 4 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7c5cff" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#7c5cff" stopOpacity={0} />
                </linearGradient>
              </defs>
              {!compact && <CartesianGrid strokeDasharray="3 6" stroke="var(--ws-border)" vertical={false} />}
              <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} hide={compact} tickFormatter={(v: number) => f.date(v, 'short')} tick={{ fontSize: 11, fill: 'var(--ws-muted)' }} axisLine={false} tickLine={false} minTickGap={40} />
              <YAxis domain={[Math.max(0, min - pad), max + pad]} hide={compact} width={72} tickFormatter={(v: number) => f.money(v, currency)} tick={{ fontSize: 11, fill: 'var(--ws-muted)' }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ stroke: 'var(--ws-accent)', strokeDasharray: '4 4' }}
                content={({ active, payload }) => {
                  const p = active && payload?.[0] ? (payload[0].payload as Point) : null;
                  if (!p) return null;
                  return (
                    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-[12px] shadow-[var(--shadow-lift)]">
                      <div className="tabular font-bold text-fg">{f.money(p.price, currency)}</div>
                      <div className="text-muted">{f.dateTime(p.t)}</div>
                      <div className="text-muted">{t(`source_${p.source}` as 'source_save')}</div>
                    </div>
                  );
                }}
              />
              {target != null && <ReferenceLine y={target} stroke="#e8336c" strokeDasharray="5 5" label={compact ? undefined : { value: t('detail_target'), fill: '#e8336c', fontSize: 11, position: 'insideTopRight' }} />}
              <Area type="stepAfter" dataKey="price" stroke="#6a45f0" strokeWidth={2.25} fill={`url(#${gradientId})`} dot={data.length < 40 ? { r: compact ? 2 : 3, fill: '#6a45f0', strokeWidth: 0 } : false} activeDot={{ r: 5, fill: '#e8336c', stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
