import { useMemo, useState } from 'react';
import { Folder, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Collection, CollectionColor } from '@/core/types';
import { createCollection, deleteCollection, updateCollection } from '@/db/repo';
import { convert } from '@/core/pricing/exchangeRates';
import { useApp } from '@/ui/app/AppContext';
import { useCollections, useSummaries } from '@/ui/hooks/data';
import { Field, Input, Select, TextArea, parseNumberInput } from '@/ui/components/forms';
import { Button, Card, EmptyState, IconButton, SectionHeader, cn } from '@/ui/components/primitives';
import { ProductImage } from '@/ui/components/product';
import { Dialog, useConfirm, useToast } from '@/ui/components/overlay';
import { navigate, type Route } from '../router';
import { Wishlist } from './Wishlist';

const COLORS: Record<CollectionColor, string> = {
  lilac: 'from-lilac-200 to-lilac-400',
  pink: 'from-pop-300 to-pop-500',
  mint: 'from-mint-200 to-mint-400',
  amber: 'from-amber-200 to-amber-400',
  sky: 'from-sky-200 to-sky-400',
  slate: 'from-ink-200 to-ink-400',
};
const SUGGESTIONS = [
  ['collection_s_fashion', '👗', 'pink'],
  ['collection_s_sneakers', '👟', 'lilac'],
  ['collection_s_tech', '🎧', 'sky'],
  ['collection_s_gaming', '🎮', 'lilac'],
  ['collection_s_beauty', '🧴', 'pink'],
  ['collection_s_home', '🏡', 'mint'],
  ['collection_s_gifts', '🎁', 'amber'],
  ['collection_s_future', '🔮', 'slate'],
] as const;

export function Collections({ route }: { route: Route }) {
  const id = route.segments[1];
  const collections = useCollections();
  if (id) {
    const c = collections?.find((x) => x.id === id);
    if (!collections) return null;
    if (!c) return <EmptyState icon={<Folder className="size-7" />} title="—" />;
    return <CollectionDetail collection={c} route={route} />;
  }
  return <CollectionsIndex collections={collections ?? []} />;
}

function CollectionsIndex({ collections }: { collections: Collection[] }) {
  const { t } = useApp();
  const toast = useToast();
  const summaries = useSummaries() ?? [];
  const [editing, setEditing] = useState<Collection | 'new' | null>(null);
  const existing = new Set(collections.map((c) => c.name.toLowerCase()));
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={t('collections_title')}
        subtitle={t('collections_subtitle')}
        action={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            {t('collection_new')}
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-semibold text-muted">{t('collection_suggestions')}:</span>
        {SUGGESTIONS.filter(([key]) => !existing.has(t(key).toLowerCase())).map(([key, emoji, color]) => (
          <button
            key={key}
            type="button"
            onClick={async () => {
              await createCollection({ name: t(key), emoji, color });
              toast.show(t('collection_created'));
            }}
            className="rounded-full border border-dashed border-line px-3 py-1.5 text-[12.5px] font-semibold text-fg hover:border-lilac-400 hover:bg-accent-soft"
          >
            {emoji} {t(key)}
          </button>
        ))}
      </div>
      {collections.length === 0 ? (
        <Card>
          <EmptyState icon={<Folder className="size-8" />} title={t('collection_new')} body={t('collections_subtitle')} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((c) => {
            const items = summaries.filter((s) => s.item.collectionIds.includes(c.id));
            return (
              <Card key={c.id} interactive className="group relative overflow-hidden">
                <button type="button" onClick={() => navigate(`/collections/${c.id}`)} className="block w-full text-left">
                  <div className={cn('relative grid h-32 grid-cols-3 gap-1 bg-gradient-to-br p-2', COLORS[c.color])}>
                    {items.slice(0, 3).map((s) => (
                      <ProductImage key={s.item.id} src={s.item.imageUrl} alt={s.item.title} className="size-full p-1.5" rounded="rounded-xl" />
                    ))}
                    {!items.length && <span className="col-span-3 grid place-items-center text-5xl">{c.emoji}</span>}
                  </div>
                  <div className="p-4">
                    <h3 className="font-display text-base font-bold">
                      {c.emoji} {c.name}
                    </h3>
                    <p className="text-[12.5px] text-muted">{t(items.length === 1 ? 'collection_items_one' : 'collection_items_other', { count: items.length })}</p>
                    {c.description && <p className="mt-1 line-clamp-2 text-[12.5px] text-muted">{c.description}</p>}
                  </div>
                </button>
                <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <IconButton label={t('act_edit')} variant="secondary" size="sm" onClick={() => setEditing(c)}>
                    <Pencil className="size-4" />
                  </IconButton>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {editing && <CollectionDialog collection={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CollectionDetail({ collection, route }: { collection: Collection; route: Route }) {
  const { t, f, settings, fx } = useApp();
  const summaries = useSummaries() ?? [];
  const [editing, setEditing] = useState(false);
  const items = summaries.filter((s) => s.item.collectionIds.includes(collection.id) && !s.item.archived && s.item.status !== 'purchased');
  const budget = useMemo(() => {
    if (collection.budget === null) return null;
    const cur = collection.budgetCurrency ?? settings.displayCurrency;
    let used = 0;
    for (const s of items) {
      if (!s.latest) continue;
      const c = convert(s.latest.price, s.latest.currency, cur, fx);
      if (c) used += c.amount;
    }
    return { used, cur, budget: collection.budget };
  }, [collection, items, fx, settings.displayCurrency]);
  return (
    <div className="flex flex-col gap-4">
      <a href="#/collections" className="text-[13px] font-semibold text-muted hover:text-fg">
        ← {t('collections_title')}
      </a>
      {budget && (
        <Card className="flex flex-col gap-2 p-4">
          <div className="flex justify-between text-[13px] font-semibold">
            <span>{t('collection_budget')}</span>
            <span className="tabular">{t('collection_budget_used', { used: f.money(budget.used, budget.cur), budget: f.money(budget.budget, budget.cur) })}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className={cn('h-full rounded-full', budget.used > budget.budget ? 'bg-pop-500' : 'bg-mint-500')} style={{ width: `${Math.min(100, (budget.used / Math.max(1, budget.budget)) * 100)}%` }} />
          </div>
        </Card>
      )}
      <Wishlist
        route={route}
        collectionId={collection.id}
        title={`${collection.emoji} ${collection.name}`}
        subtitle={collection.description || undefined}
      />
      <Button className="self-start" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
        {t('act_edit')}
      </Button>
      {editing && <CollectionDialog collection={collection} onClose={() => setEditing(false)} />}
    </div>
  );
}

function CollectionDialog({ collection, onClose }: { collection: Collection | null; onClose: () => void }) {
  const { t, settings } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const [v, setV] = useState({ name: collection?.name ?? '', description: collection?.description ?? '', emoji: collection?.emoji ?? '✨', color: collection?.color ?? ('lilac' as CollectionColor), budget: collection?.budget === null || !collection ? '' : String(collection.budget) });
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (!v.name.trim()) return setError(t('field_required'));
    const budget = parseNumberInput(v.budget);
    const data = { name: v.name, description: v.description, emoji: v.emoji.trim().slice(0, 4) || '✨', color: v.color, budget: Number.isNaN(budget) ? null : budget, budgetCurrency: budget ? (collection?.budgetCurrency ?? settings.displayCurrency) : null };
    if (collection) await updateCollection(collection.id, data);
    else await createCollection(data);
    toast.show(collection ? t('settings_saved') : t('collection_created'));
    onClose();
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={collection ? t('act_edit') : t('collection_new')}
      footer={
        <>
          {collection && (
            <Button
              variant="danger"
              className="mr-auto"
              icon={<Trash2 className="size-4" />}
              onClick={async () => {
                if (!(await confirm({ title: t('act_delete'), body: t('collection_delete_confirm', { name: collection.name }), confirmLabel: t('act_delete'), cancelLabel: t('act_cancel'), danger: true }))) return;
                await deleteCollection(collection.id);
                onClose();
                navigate('/collections');
              }}
            >
              {t('act_delete')}
            </Button>
          )}
          <Button onClick={onClose}>{t('act_cancel')}</Button>
          <Button variant="primary" onClick={() => void save()}>
            {t('act_save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[5rem_1fr] gap-3">
        <Field label={t('collection_emoji')}>{(p) => <Input {...p} value={v.emoji} onChange={(e) => setV({ ...v, emoji: e.target.value })} className="text-center text-xl" />}</Field>
        <Field label={t('collection_name')} error={error}>
          {(p) => <Input {...p} autoFocus value={v.name} maxLength={60} onChange={(e) => setV({ ...v, name: e.target.value })} />}
        </Field>
        <Field label={t('collection_description')} className="col-span-2" optional={t('optional')}>
          {(p) => <TextArea {...p} rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />}
        </Field>
        <Field label={t('collection_color')} className="col-span-2">
          {(p) => (
            <Select {...p} value={v.color} onChange={(e) => setV({ ...v, color: e.target.value as CollectionColor })}>
              {(Object.keys(COLORS) as CollectionColor[]).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={`${t('collection_budget')} (${collection?.budgetCurrency ?? settings.displayCurrency})`} className="col-span-2" optional={t('optional')}>
          {(p) => <Input {...p} inputMode="decimal" value={v.budget} onChange={(e) => setV({ ...v, budget: e.target.value })} />}
        </Field>
      </div>
    </Dialog>
  );
}
