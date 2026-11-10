import { useMemo, useState, type FormEvent } from 'react';
import { ChevronDown, Heart, Plus, Sparkles } from 'lucide-react';
import type { Availability, Condition, ExtractionResult, Priority } from '@/core/types';
import { draftFromInput, type ProductDraft } from '@/core/draft';
import { currencyOptions } from '@/core/pricing/currency';
import { createCollection } from '@/db/repo';
import { useApp } from '../app/AppContext';
import { useCollections } from '../hooks/data';
import { Field, Input, Segmented, Select, TextArea, parseNumberInput } from './forms';
import { Badge, Button, cn } from './primitives';
import { ProductImage } from './product';

export interface ProductFormProps {
  initial: ProductDraft;
  extraction?: Pick<ExtractionResult, 'heuristicFields' | 'priceCandidates' | 'variants' | 'warnings' | 'methods'>;
  compact?: boolean;
  submitLabel?: string;
  busy?: boolean;
  onSubmit: (draft: ProductDraft) => void;
  onCancel?: () => void;
}

const CONDITIONS: Condition[] = ['new', 'used', 'refurbished', 'damaged', 'unknown'];
const AVAILABILITY: Availability[] = ['in_stock', 'out_of_stock', 'preorder', 'backorder', 'limited', 'discontinued', 'unknown'];

function numStr(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : String(n);
}

export function ProductForm({ initial, extraction, compact, submitLabel, busy, onSubmit, onCancel }: ProductFormProps) {
  const { t, settings } = useApp();
  const collections = useCollections() ?? [];
  const [v, setV] = useState(() => ({
    title: initial.title,
    brand: initial.brand ?? '',
    model: initial.model ?? '',
    category: initial.category ?? '',
    imageUrl: initial.imageUrl ?? '',
    url: initial.url,
    price: numStr(initial.price),
    currency: initial.currency ?? settings.displayCurrency,
    targetPrice: numStr(initial.targetPrice),
    gtin: initial.identifiers.gtin?.replace(/^0+(?=\d{8,})/, '') ?? '',
    mpn: initial.identifiers.mpn ?? '',
    colour: initial.variant.colour ?? '',
    size: initial.variant.size ?? '',
    storage: initial.variant.storage ?? '',
    condition: initial.condition,
    availability: initial.availability,
    priority: initial.priority,
    tags: initial.tags.join(', '),
    notes: initial.notes,
    retailerName: initial.retailer.name,
    collectionIds: initial.collectionIds,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showMore, setShowMore] = useState(!compact && !initial.title);
  const [newCollection, setNewCollection] = useState('');
  const currencies = useMemo(() => currencyOptions(settings.language), [settings.language]);
  const heuristic = new Set(extraction?.heuristicFields ?? []);
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV((s) => ({ ...s, [k]: value }));
  const err = (k: string) => (errors[k] ? (t.has(errors[k]!) ? t(errors[k] as 'field_required') : errors[k]) : null);
  const warn = (k: string) => (heuristic.has(k) ? t('snag_heuristic_hint') : null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const price = parseNumberInput(v.price);
    const target = parseNumberInput(v.targetPrice);
    const local: Record<string, string> = {};
    if (Number.isNaN(price)) local.price = 'field_invalid_price';
    if (Number.isNaN(target)) local.targetPrice = 'field_invalid_price';
    const res = draftFromInput(
      {
        title: v.title,
        brand: v.brand,
        model: v.model,
        category: v.category,
        imageUrl: v.imageUrl,
        url: v.url,
        price: Number.isNaN(price) ? null : price,
        currency: price === null || Number.isNaN(price) ? null : v.currency,
        gtin: v.gtin || undefined,
        mpn: v.mpn,
        colour: v.colour,
        size: v.size,
        storage: v.storage,
        condition: v.condition,
        availability: v.availability,
        targetPrice: Number.isNaN(target) ? null : target,
        priority: v.priority,
        tags: v.tags.split(','),
        notes: v.notes,
        retailerName: v.retailerName,
        collectionIds: v.collectionIds,
      },
      initial,
    );
    if (!res.ok || Object.keys(local).length) {
      setErrors({ ...(res.ok ? {} : res.errors), ...local });
      if (!res.ok && ['gtin', 'mpn', 'colour', 'size', 'storage', 'url', 'imageUrl'].some((k) => k in res.errors)) setShowMore(true);
      return;
    }
    setErrors({});
    const draft = res.draft;
    // A user-confirmed form keeps the original extraction methods so provenance stays honest.
    draft.methods = initial.methods;
    onSubmit(draft);
  }

  async function addCollection() {
    const name = newCollection.trim();
    if (!name) return;
    const c = await createCollection({ name });
    set('collectionIds', [...v.collectionIds, c.id]);
    setNewCollection('');
  }

  const gap = compact ? 'gap-3' : 'gap-4';
  return (
    <form onSubmit={submit} className={cn('flex flex-col', gap)} noValidate>
      <div className="flex gap-3">
        <ProductImage src={v.imageUrl} alt={v.title || 'product'} className={cn('shrink-0 border border-line p-1.5', compact ? 'size-20' : 'size-28')} />
        <div className="min-w-0 flex-1">
          <Field label={t('field_title')} error={err('title')} warning={warn('title')}>
            {(p) => <TextArea {...p} rows={compact ? 2 : 3} value={v.title} onChange={(e) => set('title', e.target.value)} className="min-h-0" required maxLength={300} />}
          </Field>
        </div>
      </div>

      {extraction?.warnings.includes('price_is_from') && <p className="rounded-xl bg-warn-soft px-3 py-2 text-[12.5px] text-warn">{t('snag_price_from')}</p>}
      {extraction?.warnings.includes('variant_price_differs') && <p className="rounded-xl bg-warn-soft px-3 py-2 text-[12.5px] text-warn">{t('snag_variant_prices_differ')}</p>}

      {!!extraction?.variants.length && (
        <Field label={t('sp_variants')}>
          {(p) => (
            <Select
              {...p}
              defaultValue=""
              onChange={(e) => {
                const variant = extraction.variants[Number(e.target.value)];
                if (!variant) return;
                setV((s) => ({
                  ...s,
                  price: numStr(variant.price ?? null) || s.price,
                  currency: variant.currency ?? s.currency,
                  availability: variant.availability ?? s.availability,
                  colour: variant.attributes.colour ?? s.colour,
                  size: variant.attributes.size ?? s.size,
                  url: variant.url ?? s.url,
                  gtin: variant.gtin?.replace(/^0+(?=\d{8,})/, '') ?? s.gtin,
                  title: variant.label || s.title,
                }));
              }}
            >
              <option value="" disabled>
                {t('addr_select')}
              </option>
              {extraction.variants.map((vo, i) => (
                <option key={i} value={i}>
                  {vo.label}
                  {vo.price != null && vo.currency ? ` — ${vo.price} ${vo.currency}` : ''}
                  {vo.availability === 'out_of_stock' ? ` (${t('availability_out_of_stock')})` : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      <div className="grid grid-cols-[1fr_7.5rem] gap-2">
        <Field label={t('field_price')} error={err('price')} warning={warn('price')} optional={t('optional')}>
          {(p) => <Input {...p} inputMode="decimal" value={v.price} onChange={(e) => set('price', e.target.value)} placeholder="0.00" className="tabular" />}
        </Field>
        <Field label={t('field_currency')} error={err('currency')} warning={warn('currency')}>
          {(p) => (
            <Select {...p} value={v.currency} onChange={(e) => set('currency', e.target.value)}>
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {!!extraction?.priceCandidates.length && (
        <div>
          <div className="mb-1.5 flex items-center gap-1 text-[12px] font-semibold text-muted">
            <Sparkles className="size-3.5" /> {t('snag_price_candidates')}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {extraction.priceCandidates.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setV((s) => ({ ...s, price: String(c.amount), currency: c.currency ?? s.currency }))}
                className="tabular rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-semibold text-fg hover:border-lilac-400 hover:bg-accent-soft"
              >
                {c.text}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={cn('grid gap-2', compact ? 'grid-cols-1' : 'grid-cols-2')}>
        <Field label={t('field_target_price')} error={err('targetPrice')} optional={t('optional')} hint={compact ? undefined : v.currency}>
          {(p) => <Input {...p} inputMode="decimal" value={v.targetPrice} onChange={(e) => set('targetPrice', e.target.value)} placeholder={v.price ? String(Math.round(Number(v.price) * 0.85)) : ''} className="tabular" />}
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-fg">{t('field_priority')}</span>
          <Segmented<Priority>
            label={t('field_priority')}
            value={v.priority}
            onChange={(p) => set('priority', p)}
            options={(['low', 'medium', 'high'] as Priority[]).map((p) => ({ value: p, label: t(`priority_${p}`) }))}
            className="w-full [&>button]:flex-1"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-fg">{t('field_collections')}</span>
        <div className="flex flex-wrap gap-1.5">
          {collections.map((c) => {
            const on = v.collectionIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => set('collectionIds', on ? v.collectionIds.filter((x) => x !== c.id) : [...v.collectionIds, c.id])}
                className={cn('rounded-full border px-2.5 py-1 text-[12.5px] font-semibold transition-colors', on ? 'border-lilac-500 bg-accent-soft text-accent' : 'border-line bg-surface text-muted hover:text-fg')}
              >
                {c.emoji} {c.name}
              </button>
            );
          })}
          <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-line pr-1 pl-2.5">
            <input
              aria-label={t('collection_new')}
              value={newCollection}
              onChange={(e) => setNewCollection(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void addCollection();
                }
              }}
              placeholder={t('collection_new')}
              className="w-28 bg-transparent py-1 text-[12.5px] outline-none placeholder:text-muted"
            />
            <button type="button" onClick={() => void addCollection()} className="grid size-5 place-items-center rounded-full text-accent hover:bg-accent-soft" aria-label={t('act_create')}>
              <Plus className="size-3.5" />
            </button>
          </span>
        </div>
      </div>

      {!compact && (
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('field_tags')} hint={t('field_tags_hint')} optional={t('optional')}>
            {(p) => <Input {...p} value={v.tags} onChange={(e) => set('tags', e.target.value)} placeholder="gift, birthday" />}
          </Field>
          <Field label={t('field_retailer')}>{(p) => <Input {...p} value={v.retailerName} onChange={(e) => set('retailerName', e.target.value)} />}</Field>
        </div>
      )}
      {!compact && <Field label={t('field_notes')} optional={t('optional')}>{(p) => <TextArea {...p} rows={2} value={v.notes} onChange={(e) => set('notes', e.target.value)} />}</Field>}

      <button type="button" onClick={() => setShowMore((s) => !s)} aria-expanded={showMore} className="inline-flex items-center gap-1 self-start text-[13px] font-semibold text-accent hover:underline">
        <ChevronDown className={cn('size-4 transition-transform', showMore && 'rotate-180')} /> {t('field_details')}
      </button>
      {showMore && (
        <div className="grid grid-cols-2 gap-2 animate-fade-up">
          <Field label={t('field_url')} error={err('url')} className="col-span-2">
            {(p) => <Input {...p} type="url" value={v.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" />}
          </Field>
          <Field label={t('field_brand')} warning={warn('brand')}>{(p) => <Input {...p} value={v.brand} onChange={(e) => set('brand', e.target.value)} />}</Field>
          <Field label={t('field_model')}>{(p) => <Input {...p} value={v.model} onChange={(e) => set('model', e.target.value)} />}</Field>
          <Field label={t('field_gtin')} error={err('gtin')}>{(p) => <Input {...p} inputMode="numeric" value={v.gtin} onChange={(e) => set('gtin', e.target.value)} />}</Field>
          <Field label={t('field_mpn')}>{(p) => <Input {...p} value={v.mpn} onChange={(e) => set('mpn', e.target.value)} />}</Field>
          <Field label={t('field_colour')}>{(p) => <Input {...p} value={v.colour} onChange={(e) => set('colour', e.target.value)} />}</Field>
          <Field label={t('field_size')}>{(p) => <Input {...p} value={v.size} onChange={(e) => set('size', e.target.value)} />}</Field>
          <Field label={t('field_storage')}>{(p) => <Input {...p} value={v.storage} onChange={(e) => set('storage', e.target.value)} placeholder="256GB" />}</Field>
          <Field label={t('field_category')}>{(p) => <Input {...p} value={v.category} onChange={(e) => set('category', e.target.value)} />}</Field>
          <Field label={t('field_condition')}>
            {(p) => (
              <Select {...p} value={v.condition} onChange={(e) => set('condition', e.target.value as Condition)}>
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {t(`condition_${c}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('field_availability')}>
            {(p) => (
              <Select {...p} value={v.availability} onChange={(e) => set('availability', e.target.value as Availability)}>
                {AVAILABILITY.map((a) => (
                  <option key={a} value={a}>
                    {t(`availability_${a}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('field_image')} error={err('imageUrl')} warning={warn('imageUrl')} className="col-span-2">
            {(p) => <Input {...p} type="url" value={v.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} placeholder="https://" />}
          </Field>
          {compact && (
            <>
              <Field label={t('field_tags')} hint={t('field_tags_hint')} className="col-span-2">
                {(p) => <Input {...p} value={v.tags} onChange={(e) => set('tags', e.target.value)} />}
              </Field>
              <Field label={t('field_notes')} className="col-span-2">
                {(p) => <TextArea {...p} rows={2} value={v.notes} onChange={(e) => set('notes', e.target.value)} />}
              </Field>
            </>
          )}
        </div>
      )}

      {!!extraction?.methods.length && (
        <div className="flex flex-wrap items-center gap-1 text-[11.5px] text-muted">
          {t('snag_methods', { methods: '' }).replace(/\s*$/, '')}
          {extraction.methods.map((m) => (
            <Badge key={m} tone="outline">
              {t(`method_${m}`)}
            </Badge>
          ))}
        </div>
      )}

      <div className={cn('flex gap-2', compact ? 'sticky bottom-0 -mx-1 bg-surface/95 px-1 pt-1 pb-1 backdrop-blur' : '')}>
        {onCancel && (
          <Button onClick={onCancel} disabled={busy}>
            {t('act_cancel')}
          </Button>
        )}
        <Button type="submit" variant="primary" block size={compact ? 'md' : 'lg'} loading={busy} icon={<Heart className="size-4 fill-current" />} aria-description={t('snag_button_aria')}>
          {submitLabel ?? t('snag_button')}
        </Button>
      </div>
    </form>
  );
}
