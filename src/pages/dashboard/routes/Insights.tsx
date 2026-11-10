import { useMemo, useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartNoAxesCombined, Flame, PiggyBank, Target, TrendingDown, Wallet } from 'lucide-react';
import type { ItemSummary } from '@/core/summary';
import { convert } from '@/core/pricing/exchangeRates';
import { useApp } from '@/ui/app/AppContext';
import { useSummaries } from '@/ui/hooks/data';
import { Input, parseNumberInput } from '@/ui/components/forms';
import { Button, Card, EmptyState, SectionHeader, cn } from '@/ui/components/primitives';
import { ProductRow, StatCard } from '@/ui/components/product';
import { navigate } from '../router';

interface Totals {
  value: number;
  highPriority: number;
  savings: number;
  savingsApprox: boolean;
  excluded: number;
  approximate: boolean;
}

function useTotals(summaries: ItemSummary[]): Totals {
  const { settings, fx } = useApp();
  return useMemo(() => {
    const cur = settings.displayCurrency;
    let value = 0;
    let highPriority = 0;
    let savings = 0;
    let excluded = 0;
    let approximate = false;
    let savingsApprox = false;
    for (const s of summaries) {
      if (s.item.archived || s.item.status === 'purchased') continue;
      if (!s.latest) {
        excluded++;
        continue;
      }
      const c = convert(s.latest.price, s.latest.currency, cur, fx);
      if (!c) {
        excluded++;
        continue;
      }
      approximate ||= c.approximate;
      value += c.amount;
      if (s.item.priority === 'high') highPriority += c.amount;
      if (s.potentialSavings) {
        const sv = convert(s.potentialSavings.amount, s.potentialSavings.currency, cur, fx);
        if (sv) {
          savings += sv.amount;
          savingsApprox ||= sv.approximate || s.potentialSavings.approximate;
        }
      }
    }
    return { value, highPriority, savings, savingsApprox, excluded, approximate };
  }, [summaries, settings.displayCurrency, fx]);
}

export function InsightsSummary({ summaries }: { summaries: ItemSummary[] }) {
  const { t, f, settings } = useApp();
  const totals = useTotals(summaries);
  const active = summaries.filter((s) => !s.item.archived && s.item.status !== 'purchased');
  const approx = (a: boolean) => (a ? '≈ ' : '');
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label={t('insights_total_value')} value={`${approx(totals.approximate)}${f.money(totals.value, settings.displayCurrency)}`} hint={totals.excluded ? t('insights_excluded', { count: totals.excluded }) : undefined} icon={<Wallet className="size-5" />} />
      <StatCard label={t('insights_high_priority')} value={`${approx(totals.approximate)}${f.money(totals.highPriority, settings.displayCurrency)}`} icon={<Flame className="size-5" />} tone="hot" />
      <StatCard label={t('insights_potential_savings')} value={`${approx(totals.savingsApprox)}${f.money(totals.savings, settings.displayCurrency)}`} hint={t('insights_potential_savings_hint')} icon={<PiggyBank className="size-5" />} tone="savings" />
      <StatCard label={t('insights_below_target')} value={f.number(active.filter((s) => s.targetReached).length)} icon={<Target className="size-5" />} tone="hot" />
    </div>
  );
}

export function Insights() {
  const { t, f, settings, fx, updateSettings } = useApp();
  const summaries = useSummaries();
  const active = useMemo(() => (summaries ?? []).filter((s) => !s.item.archived && s.item.status !== 'purchased'), [summaries]);
  const categories = useMemo(() => countBy(active.map((s) => s.item.category ?? '—')), [active]);
  const retailers = useMemo(() => countBy(active.map((s) => s.primary?.retailerName ?? '—')), [active]);
  const recentDiscounts = useMemo(() => active.filter((s) => s.lastChange && s.lastChange.amount < 0 && s.lastChange.at && Date.now() - s.lastChange.at < 14 * 86400_000), [active]);
  const planned = active.filter((s) => s.item.inBudgetPlan);
  const [budgetInput, setBudgetInput] = useState(settings.budget.monthly === null ? '' : String(settings.budget.monthly));
  const budgetCur = settings.budget.currency ?? settings.displayCurrency;
  const plannedTotal = planned.reduce((sum, s) => {
    if (!s.latest) return sum;
    const c = convert(s.latest.price, s.latest.currency, budgetCur, fx);
    return c ? sum + c.amount : sum;
  }, 0);

  if (!summaries) return null;
  if (!active.length) return <EmptyState icon={<ChartNoAxesCombined className="size-8" />} title={t('insights_title')} body={t('insights_empty')} />;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title={t('insights_title')} subtitle={t('insights_subtitle')} />
      <InsightsSummary summaries={summaries} />
      <div className="grid gap-6 lg:grid-cols-2">
        <CountChart title={t('insights_categories')} data={categories} />
        <CountChart title={t('insights_retailers')} data={retailers} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeader title={t('insights_recent_discounts')} />
          <Card className="p-2">{recentDiscounts.length ? recentDiscounts.map((s) => <ProductRow key={s.item.id} summary={s} onOpen={() => navigate(`/item/${s.item.id}`)} />) : <EmptyState compact icon={<TrendingDown className="size-6" />} title={t('drops_empty')} />}</Card>
        </section>
        <section>
          <SectionHeader title={t('budget_title')} subtitle={t('no_checkout_note')} />
          <Card className="flex flex-col gap-4 p-4">
            <div className="flex items-end gap-2">
              <label className="flex flex-1 flex-col gap-1 text-[13px] font-semibold">
                {t('budget_monthly')} ({budgetCur})
                <Input inputMode="decimal" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} className="tabular" />
              </label>
              <Button
                variant="soft"
                onClick={() => {
                  const n = parseNumberInput(budgetInput);
                  if (Number.isNaN(n)) return;
                  void updateSettings((s) => ({ ...s, budget: { monthly: n, currency: n === null ? null : budgetCur } }));
                }}
              >
                {t('act_save')}
              </Button>
            </div>
            {settings.budget.monthly === null ? (
              <p className="text-[13px] text-muted">{t('budget_none')}</p>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-[13px]">
                  <span className="font-semibold">{t('budget_planned')}</span>
                  <span className="tabular font-bold">
                    {f.money(plannedTotal, budgetCur)} / {f.money(settings.budget.monthly, budgetCur)}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                  <div className={cn('h-full rounded-full transition-all', plannedTotal > settings.budget.monthly ? 'bg-pop-500' : 'bg-mint-500')} style={{ width: `${Math.min(100, (plannedTotal / Math.max(1, settings.budget.monthly)) * 100)}%` }} />
                </div>
                <p className={cn('text-[13px] font-semibold', plannedTotal > settings.budget.monthly ? 'text-hot' : 'text-savings')}>
                  {plannedTotal > settings.budget.monthly ? t('budget_over', { amount: f.money(plannedTotal - settings.budget.monthly, budgetCur) }) : t('budget_remaining', { amount: f.money(settings.budget.monthly - plannedTotal, budgetCur) })}
                </p>
              </div>
            )}
            {planned.length ? planned.map((s) => <ProductRow key={s.item.id} summary={s} compact onOpen={() => navigate(`/item/${s.item.id}`)} />) : <p className="text-[12.5px] text-muted">{t('budget_plan_hint')}</p>}
          </Card>
        </section>
      </div>
    </div>
  );
}

function countBy(values: string[]): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
}

const BAR_COLORS = ['#6a45f0', '#8b6cff', '#e8336c', '#18c08a', '#b9a6ff', '#ff6b9a', '#3edca6', '#5733d1'];

function CountChart({ title, data }: { title: string; data: { name: string; count: number }[] }) {
  return (
    <section>
      <SectionHeader title={title} />
      <Card className="p-4">
        <div style={{ height: Math.max(140, data.length * 34) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" allowDecimals={false} hide />
              <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12, fill: 'var(--ws-muted)' }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: 'var(--ws-surface-2)' }} contentStyle={{ background: 'var(--ws-surface)', border: '1px solid var(--ws-border)', borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey="count" radius={[0, 8, 8, 0]} isAnimationActive={false}>
                {data.map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </section>
  );
}
