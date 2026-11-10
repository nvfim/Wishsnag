import { useMemo, useState } from 'react';
import { Bell, Heart, LayoutDashboard, PanelRight, Search, Settings2, Sparkles, Target, TrendingDown } from 'lucide-react';
import { dashboardStats, filterAndSort, EMPTY_FILTERS } from '@/core/summary';
import { useApp } from '@/ui/app/AppContext';
import { useCollections, useSummaries, useUnreadCount } from '@/ui/hooks/data';
import { useSnagFlow } from '@/ui/hooks/useSnagFlow';
import { openDashboard, openSidePanel } from '@/ui/lib/nav';
import { Logo } from '@/ui/components/Logo';
import { Badge, Button, IconButton, Skeleton, cn } from '@/ui/components/primitives';
import { ProductRow } from '@/ui/components/product';
import { SnagFlowView } from '@/ui/components/SnagFlowView';
import { useToast } from '@/ui/components/overlay';

export function Popup() {
  const { t, settings, fx, f } = useApp();
  const summaries = useSummaries();
  const collections = useCollections();
  const unread = useUnreadCount();
  const flow = useSnagFlow();
  const toast = useToast();
  const [query, setQuery] = useState('');

  const stats = useMemo(() => (summaries ? dashboardStats(summaries, settings.displayCurrency, fx) : null), [summaries, settings.displayCurrency, fx]);
  const results = useMemo(() => (summaries && query.trim() ? filterAndSort(summaries, { ...EMPTY_FILTERS, status: 'all', query }, 'recent').slice(0, 6) : []), [summaries, query]);
  const drops = useMemo(() => (summaries ?? []).filter((s) => s.change && s.change.amount < 0 && !s.item.archived && s.item.status !== 'purchased').sort((a, b) => (b.lastChange?.at ?? 0) - (a.lastChange?.at ?? 0)).slice(0, 3), [summaries]);
  const atTarget = useMemo(() => (summaries ?? []).filter((s) => s.targetReached && !s.item.archived && s.item.status !== 'purchased').slice(0, 3), [summaries]);

  const inFlow = flow.state.phase !== 'idle';

  return (
    <div className="flex max-h-[600px] w-[380px] flex-col bg-bg">
      <header className="flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-3">
        <Logo size={26} />
        <div className="flex items-center gap-0.5">
          <IconButton label={t('nav_notifications')} size="sm" onClick={() => openDashboard('/notifications')} className="relative">
            <Bell className="size-4" />
            {unread > 0 && <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-pop-500 px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
          </IconButton>
          <IconButton label={t('nav_settings')} size="sm" onClick={() => openDashboard('/settings')}>
            <Settings2 className="size-4" />
          </IconButton>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        {inFlow ? (
          <SnagFlowView
            flow={flow}
            onDone={() => {
              if (flow.state.phase === 'saved') toast.show(t('snag_success'));
              flow.reset();
            }}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {!settings.onboarded && (
              <button type="button" onClick={() => openDashboard('/welcome')} className="flex items-center gap-2 rounded-2xl bg-accent-soft px-3 py-2.5 text-left text-[13px] font-semibold text-accent">
                <Sparkles className="size-4 shrink-0" /> {t('popup_finish_setup')}
              </button>
            )}

            <Button variant="primary" size="lg" block icon={<Heart className="size-5 fill-current" />} onClick={() => void flow.detect()} aria-description={t('snag_button_aria')}>
              {t('snag_button')}
            </Button>

            <label className="relative block">
              <span className="sr-only">{t('act_search')}</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('search_placeholder')}
                className="h-10 w-full rounded-xl border border-line bg-surface pr-3 pl-9 text-sm outline-none focus:border-lilac-400 focus:ring-4 focus:ring-lilac-500/15"
              />
            </label>

            {query.trim() ? (
              <div className="flex flex-col">
                {results.length ? results.map((s) => <ProductRow key={s.item.id} summary={s} compact onOpen={() => openDashboard(`/item/${s.item.id}`)} />) : <p className="py-4 text-center text-sm text-muted">{t('popup_no_results')}</p>}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-2" aria-label={t('home_insights')}>
                  {[
                    { label: t('popup_saved'), value: stats?.saved, route: '/wishlist' },
                    { label: t('popup_tracked'), value: stats?.tracked, route: '/wishlist' },
                    { label: t('popup_drops'), value: stats?.drops, route: '/drops', hot: true },
                    { label: t('popup_targets'), value: stats?.targetsReached, route: '/wishlist?target=1', hot: true },
                  ].map((s) => (
                    <button key={s.label} type="button" onClick={() => openDashboard(s.route)} className="rounded-2xl border border-line bg-surface px-2 py-2.5 text-center transition-colors hover:border-lilac-300">
                      {stats ? <div className={cn('tabular font-display text-lg font-extrabold', s.hot && s.value ? 'text-hot' : 'text-fg')}>{f.number(s.value ?? 0)}</div> : <Skeleton className="mx-auto h-6 w-8" />}
                      <div className="truncate text-[10.5px] font-semibold text-muted">{s.label}</div>
                    </button>
                  ))}
                </div>

                <section>
                  <h2 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-muted uppercase">
                    <TrendingDown className="size-3.5" /> {t('popup_recent_drops')}
                  </h2>
                  {drops.length ? drops.map((s) => <ProductRow key={s.item.id} summary={s} compact onOpen={() => openDashboard(`/item/${s.item.id}`)} />) : <p className="rounded-2xl bg-surface-2 px-3 py-3 text-[12.5px] text-muted">{t('popup_no_drops')}</p>}
                </section>

                {atTarget.length > 0 && (
                  <section>
                    <h2 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-muted uppercase">
                      <Target className="size-3.5" /> {t('popup_at_target')}
                    </h2>
                    {atTarget.map((s) => (
                      <ProductRow key={s.item.id} summary={s} compact onOpen={() => openDashboard(`/item/${s.item.id}`)} />
                    ))}
                  </section>
                )}

                {!!collections?.length && (
                  <section>
                    <h2 className="mb-1.5 text-[12px] font-bold tracking-wide text-muted uppercase">{t('popup_collections')}</h2>
                    <div className="flex flex-wrap gap-1.5">
                      {collections.slice(0, 8).map((c) => (
                        <button key={c.id} type="button" onClick={() => openDashboard(`/collections/${c.id}`)} className="rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-semibold text-fg hover:border-lilac-400">
                          {c.emoji} {c.name}
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                {stats && stats.saved === 0 && <Badge tone="lilac">{t('wishlist_empty_body')}</Badge>}
              </>
            )}
          </div>
        )}
      </main>

      <footer className="grid grid-cols-2 gap-2 border-t border-line bg-surface p-3">
        <Button size="sm" icon={<LayoutDashboard className="size-4" />} onClick={() => openDashboard('/')}>
          {t('nav_open_dashboard')}
        </Button>
        <Button
          size="sm"
          icon={<PanelRight className="size-4" />}
          onClick={async () => {
            if (await openSidePanel()) window.close();
          }}
        >
          {t('nav_open_sidepanel')}
        </Button>
      </footer>
    </div>
  );
}
