import { useMemo } from 'react';
import { ArrowRight, Folder, Heart, PiggyBank, Plus, Radar, Sparkles, Target, TrendingDown } from 'lucide-react';
import { dashboardStats } from '@/core/summary';
import { useApp } from '@/ui/app/AppContext';
import { useCollections, useSummaries } from '@/ui/hooks/data';
import { Button, Card, EmptyState, SectionHeader, Skeleton } from '@/ui/components/primitives';
import { ProductCard, ProductRow, StatCard } from '@/ui/components/product';
import { navigate } from '../router';
import { InsightsSummary } from './Insights';

export function Home() {
  const { t, f, settings, fx } = useApp();
  const summaries = useSummaries();
  const collections = useCollections();
  const active = useMemo(() => (summaries ?? []).filter((s) => !s.item.archived && s.item.status !== 'purchased'), [summaries]);
  const stats = useMemo(() => (summaries ? dashboardStats(summaries, settings.displayCurrency, fx) : null), [summaries, settings.displayCurrency, fx]);
  const drops = useMemo(() => active.filter((s) => s.change && s.change.amount < 0).sort((a, b) => a.change!.percent - b.change!.percent).slice(0, 4), [active]);
  const worth = useMemo(() => active.filter((s) => s.targetReached || s.potentialSavings).slice(0, 4), [active]);
  const recent = useMemo(() => [...active].sort((a, b) => b.item.createdAt - a.item.createdAt).slice(0, 8), [active]);

  if (!summaries) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="relative overflow-hidden rounded-[2rem] brand-gradient px-6 py-8 text-white shadow-[var(--shadow-lift)] sm:px-10">
        <div className="relative z-10 max-w-2xl">
          <p className="text-sm font-semibold text-white/80">{t('home_greeting')}</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{t('tagline')}</h1>
          <p className="mt-2 text-[15px] text-white/85">{t('promise')}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="secondary" className="border-white/30 bg-white text-lilac-700 hover:bg-white/90" icon={<Plus className="size-4" />} onClick={() => navigate('/add')}>
              {t('nav_add')}
            </Button>
            <Button variant="ghost" className="text-white hover:bg-white/15" onClick={() => navigate('/compare')}>
              {t('nav_find_cheaper')} <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
        <Heart aria-hidden className="absolute -right-6 -bottom-10 size-56 fill-white/10 text-white/10" />
        <Sparkles aria-hidden className="absolute top-6 right-16 size-10 text-mint-300/80" />
      </section>

      <section aria-label={t('home_insights')} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label={t('stat_saved')} value={f.number(stats!.saved)} icon={<Heart className="size-5" />} />
        <StatCard label={t('stat_tracked')} value={f.number(stats!.tracked)} icon={<Radar className="size-5" />} />
        <StatCard label={t('stat_drops')} value={f.number(stats!.drops)} icon={<TrendingDown className="size-5" />} tone="savings" />
        <StatCard label={t('stat_targets')} value={f.number(stats!.targetsReached)} icon={<Target className="size-5" />} tone="hot" />
        <StatCard label={t('stat_savings')} value={`${stats!.savings.approximate ? '≈ ' : ''}${f.money(stats!.savings.amount, stats!.savings.currency)}`} hint={t('stat_savings_hint')} icon={<PiggyBank className="size-5" />} tone="savings" />
      </section>

      {active.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Heart className="size-8" />}
            title={t('wishlist_empty_title')}
            body={
              <ol className="mt-3 flex flex-col gap-1.5 text-left">
                <li>1. {t('gs_step1')}</li>
                <li>2. {t('gs_step2')}</li>
                <li>3. {t('gs_step3')}</li>
              </ol>
            }
            action={
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => navigate('/add')}>
                {t('wishlist_empty_cta')}
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <section>
            <SectionHeader title={t('home_your_wishlist')} action={<SeeAll to="/wishlist" />} />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {recent.slice(0, 4).map((s) => (
                <ProductCard key={s.item.id} summary={s} onOpen={() => navigate(`/item/${s.item.id}`)} />
              ))}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <SectionHeader title={t('home_price_drops')} action={<SeeAll to="/drops" />} />
              <Card className="p-2">{drops.length ? drops.map((s) => <ProductRow key={s.item.id} summary={s} onOpen={() => navigate(`/item/${s.item.id}`)} />) : <EmptyState compact icon={<TrendingDown className="size-6" />} title={t('drops_empty')} body={t('drops_empty_hint')} />}</Card>
            </section>
            <section>
              <SectionHeader title={t('home_worth_snagging')} />
              <Card className="p-2">{worth.length ? worth.map((s) => <ProductRow key={s.item.id} summary={s} onOpen={() => navigate(`/item/${s.item.id}`)} />) : <EmptyState compact icon={<Target className="size-6" />} title={t('home_worth_empty')} />}</Card>
            </section>
          </div>

          <section>
            <SectionHeader title={t('home_recent')} action={<SeeAll to="/wishlist" />} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              {recent.map((s) => (
                <button key={s.item.id} type="button" onClick={() => navigate(`/item/${s.item.id}`)} className="group text-left" title={s.item.title}>
                  <div className="aspect-square overflow-hidden rounded-2xl border border-line bg-surface p-2 transition-transform group-hover:-translate-y-0.5">
                    <img src={s.item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-contain" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                  </div>
                  <p className="mt-1 truncate text-[12px] font-semibold">{s.item.title}</p>
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      <section>
        <SectionHeader title={t('home_collections')} action={<SeeAll to="/collections" />} />
        <div className="flex flex-wrap gap-2">
          {(collections ?? []).map((c) => (
            <button key={c.id} type="button" onClick={() => navigate(`/collections/${c.id}`)} className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-left font-semibold transition-colors hover:border-lilac-300">
              <span className="text-xl">{c.emoji}</span>
              <span>
                <span className="block text-sm">{c.name}</span>
                <span className="block text-[11.5px] font-medium text-muted">{t('collection_items_other', { count: (summaries ?? []).filter((s) => s.item.collectionIds.includes(c.id)).length })}</span>
              </span>
            </button>
          ))}
          <Button icon={<Folder className="size-4" />} onClick={() => navigate('/collections')}>
            {t('collection_new')}
          </Button>
        </div>
      </section>

      {active.length > 0 && (
        <section>
          <SectionHeader title={t('home_insights')} action={<SeeAll to="/insights" />} />
          <InsightsSummary summaries={summaries} />
        </section>
      )}
    </div>
  );
}

function SeeAll({ to }: { to: string }) {
  const { t } = useApp();
  return (
    <a href={`#${to}`} className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent hover:underline">
      {t('see_all')} <ArrowRight className="size-3.5" />
    </a>
  );
}
