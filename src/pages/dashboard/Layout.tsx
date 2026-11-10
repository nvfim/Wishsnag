import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bell, ChartNoAxesCombined, Folder, Heart, House, LineChart, Menu, Moon, Plus, Scale, Search, Settings, Sun, TrendingDown, Upload, X } from 'lucide-react';
import { useApp } from '@/ui/app/AppContext';
import { useNotifications, useUnreadCount } from '@/ui/hooks/data';
import { Logo } from '@/ui/components/Logo';
import { Button, IconButton, cn } from '@/ui/components/primitives';
import { markNotificationsRead } from '@/db/repo';
import { send } from '@/services/messages';
import { NotificationList } from './routes/Notifications';
import { navigate, type Route } from './router';

const NAV = [
  { path: '/', key: 'nav_home', icon: House },
  { path: '/wishlist', key: 'nav_wishlist', icon: Heart },
  { path: '/collections', key: 'nav_collections', icon: Folder },
  { path: '/drops', key: 'nav_price_drops', icon: TrendingDown },
  { path: '/compare', key: 'nav_find_cheaper', icon: Scale },
  { path: '/history', key: 'nav_price_history', icon: LineChart },
  { path: '/insights', key: 'nav_insights', icon: ChartNoAxesCombined },
  { path: '/settings', key: 'nav_settings', icon: Settings },
] as const;

export function Layout({ route, children }: { route: Route; children: ReactNode }) {
  const { t, settings, updateSettings } = useApp();
  const [navOpen, setNavOpen] = useState(false);
  const [query, setQuery] = useState(route.query.get('q') ?? '');
  const active = '/' + (route.segments[0] ?? '');
  const isActive = (p: string) => (p === '/' ? active === '/' : active === p || (p === '/wishlist' && active === '/item'));
  const dark = document.documentElement.classList.contains('dark');

  useEffect(() => setNavOpen(false), [route.path]);

  return (
    <div className="min-h-screen bg-bg text-fg">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-xl focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className={cn('fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-surface px-3 py-5 transition-transform lg:translate-x-0', navOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full')}>
        <div className="mb-6 flex items-center justify-between px-2">
          <button type="button" onClick={() => navigate('/')} className="text-left">
            <Logo size={30} showTagline tagline={t('tagline')} />
          </button>
          <IconButton label={t('act_close')} size="sm" className="lg:hidden" onClick={() => setNavOpen(false)}>
            <X className="size-4" />
          </IconButton>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {NAV.map((n) => (
            <a
              key={n.path}
              href={`#${n.path}`}
              aria-current={isActive(n.path) ? 'page' : undefined}
              className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-colors', isActive(n.path) ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg')}
            >
              <n.icon className="size-[18px]" />
              {t(n.key)}
            </a>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 px-1">
          <Button size="sm" icon={<Upload className="size-4" />} onClick={() => navigate('/import')}>
            {t('nav_import')}
          </Button>
          <p className="px-2 text-[11px] leading-relaxed text-muted">{t('promise')}</p>
        </div>
      </aside>
      {navOpen && <div className="fixed inset-0 z-30 bg-ink-950/40 backdrop-blur-sm lg:hidden" onClick={() => setNavOpen(false)} />}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg/85 px-4 py-3 backdrop-blur-md sm:px-6">
          <IconButton label="Menu" className="lg:hidden" onClick={() => setNavOpen(true)}>
            <Menu className="size-5" />
          </IconButton>
          <form
            role="search"
            className="relative max-w-xl flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/wishlist?q=${encodeURIComponent(query)}`);
            }}
          >
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              aria-label={t('act_search')}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (active === '/wishlist') navigate(`/wishlist?q=${encodeURIComponent(e.target.value)}`);
              }}
              placeholder={t('search_placeholder')}
              className="h-10 w-full rounded-xl border border-line bg-surface pr-3 pl-9 text-sm outline-none focus:border-lilac-400 focus:ring-4 focus:ring-lilac-500/15"
            />
          </form>
          <div className="ml-auto flex items-center gap-1">
            <IconButton label={t('nav_toggle_theme')} onClick={() => void updateSettings({ theme: dark ? 'light' : 'dark' })}>
              {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </IconButton>
            <NotificationBell />
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => navigate('/add')} className="hidden sm:inline-flex">
              {t('nav_add')}
            </Button>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
          {!settings.onboarded && route.segments[0] !== 'welcome' && (
            <button type="button" onClick={() => navigate('/welcome')} className="mb-5 w-full rounded-2xl bg-accent-soft px-4 py-3 text-left text-sm font-semibold text-accent">
              {t('popup_finish_setup')} →
            </button>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

function NotificationBell() {
  const { t } = useApp();
  const unread = useUnreadCount();
  const list = useNotifications(12);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <IconButton label={t('nav_notifications')} onClick={() => setOpen((o) => !o)} aria-expanded={open} className="relative">
        <Bell className="size-[18px]" />
        {unread > 0 && <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-pop-500 px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
      </IconButton>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-3xl border border-line bg-surface p-2 shadow-[var(--shadow-lift)] animate-pop-in">
          <div className="flex items-center justify-between px-3 py-2">
            <h2 className="font-display text-sm font-bold">{t('notif_title')}</h2>
            <button
              type="button"
              className="text-[12px] font-semibold text-accent hover:underline"
              onClick={async () => {
                await markNotificationsRead();
                await send({ type: 'badge:refresh' }).catch(() => undefined);
              }}
            >
              {t('notif_mark_all_read')}
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            <NotificationList notifications={list ?? []} compact onNavigate={() => setOpen(false)} />
          </div>
          <a href="#/notifications" onClick={() => setOpen(false)} className="block rounded-2xl px-3 py-2 text-center text-[13px] font-semibold text-accent hover:bg-surface-2">
            {t('see_all')}
          </a>
        </div>
      )}
    </div>
  );
}
