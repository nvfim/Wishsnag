import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Archive, Folder, Heart, LayoutGrid, List, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { EMPTY_FILTERS, filterAndSort, type SortKey, type WishlistFilters } from '@/core/summary';
import { deleteItems, setItemCollections, updateItem } from '@/db/repo';
import { useApp } from '@/ui/app/AppContext';
import { useCollections, useSummaries } from '@/ui/hooks/data';
import { Checkbox, Segmented, Select } from '@/ui/components/forms';
import { Badge, Button, Card, EmptyState, IconButton, SectionHeader, Skeleton, cn } from '@/ui/components/primitives';
import { ProductCard, ProductRow } from '@/ui/components/product';
import { useConfirm, useToast } from '@/ui/components/overlay';
import { navigate, type Route } from '../router';

const SORTS: SortKey[] = ['recent', 'price_low', 'price_high', 'discount', 'drop', 'priority', 'savings', 'name'];
const PAGE = 48;
const VIEW_KEY = 'wishsnag.view';

export function Wishlist({ route, collectionId, title, subtitle }: { route: Route; collectionId?: string; title?: string; subtitle?: string }) {
  const { t } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const summaries = useSummaries();
  const collections = useCollections() ?? [];
  const [filters, setFilters] = useState<WishlistFilters>(() => ({ ...EMPTY_FILTERS, query: route.query.get('q') ?? '', targetReached: route.query.get('target') === '1', collectionId: collectionId ?? null }));
  const [sort, setSort] = useState<SortKey>('recent');
  const [view, setView] = useState<'grid' | 'list'>(() => {
    try {
      return (localStorage.getItem(VIEW_KEY) as 'grid' | 'list') ?? 'grid';
    } catch {
      return 'grid';
    }
  });
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const deferredQuery = useDeferredValue(filters.query);

  useEffect(() => setFilters((f) => ({ ...f, query: route.query.get('q') ?? f.query })), [route.query]);
  useEffect(() => setFilters((f) => ({ ...f, collectionId: collectionId ?? null })), [collectionId]);

  const options = useMemo(() => {
    const s = summaries ?? [];
    const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
    return { categories: uniq(s.map((x) => x.item.category)), brands: uniq(s.map((x) => x.item.brand)), retailers: uniq(s.map((x) => x.primary?.retailerName)) };
  }, [summaries]);
  const results = useMemo(() => (summaries ? filterAndSort(summaries, { ...filters, query: deferredQuery }, sort) : []), [summaries, filters, deferredQuery, sort]);
  const activeFilterCount = [filters.category, filters.brand, filters.retailer, filters.priority, filters.targetReached || null, filters.inStock || null, filters.hasDrop || null, filters.status !== 'active' ? filters.status : null].filter(Boolean).length;

  const setF = <K extends keyof WishlistFilters>(k: K, v: WishlistFilters[K]) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setLimit(PAGE);
  };
  const ids = [...selected];

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title={title ?? t('wishlist_title')}
        subtitle={subtitle ?? (summaries ? t(results.length === 1 ? 'items_count_one' : 'items_count_other', { count: results.length }) : undefined)}
        action={
          <div className="flex items-center gap-2">
            <Button icon={<SlidersHorizontal className="size-4" />} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
              {t('filter_label')}
              {activeFilterCount > 0 && <Badge tone="lilac">{activeFilterCount}</Badge>}
            </Button>
            <Select aria-label={t('sort_label')} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="w-auto min-w-44">
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {t(`sort_${s}`)}
                </option>
              ))}
            </Select>
            <Segmented
              label="View"
              value={view}
              onChange={(v) => {
                setView(v);
                try {
                  localStorage.setItem(VIEW_KEY, v);
                } catch {
                  /* ignore */
                }
              }}
              options={[
                { value: 'grid', label: <span className="sr-only">{t('view_grid')}</span>, icon: <LayoutGrid className="size-4" /> },
                { value: 'list', label: <span className="sr-only">{t('view_list')}</span>, icon: <List className="size-4" /> },
              ]}
            />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label={t('filter_status')}
          size="sm"
          value={filters.status}
          onChange={(v) => setF('status', v)}
          options={[
            { value: 'active', label: t('filter_active') },
            { value: 'purchased', label: t('filter_purchased') },
            { value: 'archived', label: t('filter_archived') },
            { value: 'all', label: t('filter_all') },
          ]}
        />
        {(['targetReached', 'hasDrop', 'inStock'] as const).map((k) => (
          <button key={k} type="button" aria-pressed={filters[k]} onClick={() => setF(k, !filters[k])} className={cn('h-8 rounded-full border px-3 text-[12.5px] font-semibold', filters[k] ? 'border-lilac-500 bg-accent-soft text-accent' : 'border-line bg-surface text-muted hover:text-fg')}>
            {t(k === 'targetReached' ? 'filter_target_reached' : k === 'hasDrop' ? 'filter_has_drop' : 'filter_in_stock')}
          </button>
        ))}
        {!collectionId && collections.length > 0 && (
          <Select aria-label={t('field_collection')} className="h-8 w-auto text-[12.5px]" value={filters.collectionId ?? ''} onChange={(e) => setF('collectionId', e.target.value || null)}>
            <option value="">{t('nav_collections')}: {t('filter_any')}</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </Select>
        )}
        {activeFilterCount > 0 && (
          <button type="button" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent" onClick={() => setFilters({ ...EMPTY_FILTERS, collectionId: collectionId ?? null })}>
            <X className="size-3.5" /> {t('filter_clear')}
          </button>
        )}
      </div>

      {showFilters && (
        <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 animate-fade-up">
          {(
            [
              ['category', t('filter_category'), options.categories],
              ['brand', t('filter_brand'), options.brands],
              ['retailer', t('filter_retailer'), options.retailers],
            ] as const
          ).map(([key, label, opts]) => (
            <label key={key} className="flex flex-col gap-1 text-[12.5px] font-semibold">
              {label}
              <Select value={filters[key] ?? ''} onChange={(e) => setF(key, e.target.value || null)}>
                <option value="">{t('filter_any')}</option>
                {opts.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            </label>
          ))}
          <label className="flex flex-col gap-1 text-[12.5px] font-semibold">
            {t('filter_priority')}
            <Select value={filters.priority ?? ''} onChange={(e) => setF('priority', (e.target.value || null) as WishlistFilters['priority'])}>
              <option value="">{t('filter_any')}</option>
              {(['high', 'medium', 'low'] as const).map((p) => (
                <option key={p} value={p}>
                  {t(`priority_${p}`)}
                </option>
              ))}
            </Select>
          </label>
        </Card>
      )}

      {selected.size > 0 && (
        <div className="sticky top-[4.25rem] z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-lilac-300/60 bg-surface px-4 py-2.5 shadow-[var(--shadow-lift)] animate-pop-in">
          <Checkbox checked onChange={() => setSelected(new Set())} label={<b>{t('selected_count', { count: selected.size })}</b>} />
          <div className="ml-auto flex flex-wrap gap-2">
            <Select
              aria-label={t('bulk_move')}
              className="h-8 w-48 text-[13px]"
              value=""
              onChange={async (e) => {
                if (!e.target.value) return;
                await setItemCollections(ids, [e.target.value], 'add');
                toast.show(t('settings_saved'));
                setSelected(new Set());
              }}
            >
              <option value="">{t('bulk_move')}…</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </option>
              ))}
            </Select>
            <Button size="sm" icon={<Archive className="size-4" />} onClick={async () => (await Promise.all(ids.map((id) => updateItem(id, { archived: true }))), setSelected(new Set()))}>
              {t('bulk_archive')}
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={<Trash2 className="size-4" />}
              onClick={async () => {
                if (!(await confirm({ title: t('bulk_delete'), body: t('bulk_delete_confirm', { count: ids.length }), confirmLabel: t('act_delete'), cancelLabel: t('act_cancel'), danger: true }))) return;
                await deleteItems(ids);
                setSelected(new Set());
                toast.show(t('detail_deleted'));
              }}
            >
              {t('bulk_delete')}
            </Button>
            <IconButton size="sm" label={t('act_close')} onClick={() => setSelected(new Set())}>
              <X className="size-4" />
            </IconButton>
          </div>
        </div>
      )}

      {!summaries ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/4]" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <Card>
          {summaries.length === 0 ? (
            <EmptyState icon={<Heart className="size-8" />} title={t('wishlist_empty_title')} body={t('wishlist_empty_body')} action={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => navigate('/add')}>{t('wishlist_empty_cta')}</Button>} />
          ) : collectionId ? (
            <EmptyState icon={<Folder className="size-8" />} title={t('collection_empty')} />
          ) : (
            <EmptyState icon={<SlidersHorizontal className="size-8" />} title={t('wishlist_no_matches')} action={<Button onClick={() => setFilters(EMPTY_FILTERS)}>{t('filter_clear')}</Button>} />
          )}
        </Card>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {results.slice(0, limit).map((s) => (
            <ProductCard
              key={s.item.id}
              summary={s}
              onOpen={() => navigate(`/item/${s.item.id}`)}
              selected={selected.has(s.item.id)}
              onSelect={(v) => {
                const next = new Set(selected);
                if (v) next.add(s.item.id);
                else next.delete(s.item.id);
                setSelected(next);
              }}
            />
          ))}
        </div>
      ) : (
        <Card className="divide-y divide-line p-2">
          {results.slice(0, limit).map((s) => (
            <div key={s.item.id} className="flex items-center gap-2 pl-2">
              <input
                type="checkbox"
                aria-label={s.item.title}
                className="size-4 accent-[#6a45f0]"
                checked={selected.has(s.item.id)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(s.item.id);
                  else next.delete(s.item.id);
                  setSelected(next);
                }}
              />
              <div className="min-w-0 flex-1">
                <ProductRow summary={s} onOpen={() => navigate(`/item/${s.item.id}`)} />
              </div>
            </div>
          ))}
        </Card>
      )}
      {results.length > limit && (
        <Button className="self-center" onClick={() => setLimit((l) => l + PAGE)}>
          {t('load_more')} ({results.length - limit})
        </Button>
      )}
    </div>
  );
}
