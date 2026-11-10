import { useEffect, useMemo, useState } from 'react';
import { Download, Layers } from 'lucide-react';
import type { ListItemCandidate } from '@/core/types';
import { emptyDraft, retailerInfoForUrl, type ProductDraft } from '@/core/draft';
import { normaliseGtin } from '@/core/matching/identifiers';
import { normaliseProductUrl } from '@/core/util/url';
import { findDuplicates } from '@/core/matching/match';
import { db } from '@/db/schema';
import { saveDraftAsNewItem } from '@/db/repo';
import { useApp } from '../app/AppContext';
import { useCollections } from '../hooks/data';
import { Checkbox, Select } from './forms';
import { Badge, Button, Card, cn } from './primitives';
import { ProductImage } from './product';

export interface ImportCandidate {
  key: string;
  draft: ProductDraft;
  error?: string;
}

export function candidateToDraft(c: ListItemCandidate): ProductDraft {
  const d = emptyDraft(c.url);
  d.title = c.title;
  d.imageUrl = c.imageUrl;
  d.price = c.price;
  d.currency = c.price !== null ? c.currency : null;
  d.brand = c.brand;
  d.identifiers = { gtin: normaliseGtin(c.gtin) ?? undefined, mpn: c.mpn };
  if (!d.identifiers.gtin) delete d.identifiers.gtin;
  if (!d.identifiers.mpn) delete d.identifiers.mpn;
  d.methods = [c.method];
  d.retailer = retailerInfoForUrl(c.url);
  return d;
}

type Status = 'new' | 'duplicate' | 'possible' | 'invalid';

/** Import preview: select items, see duplicates, choose a collection, import, and see results. */
export function ImportPreview({ candidates, onDone, compact }: { candidates: ImportCandidate[]; onDone?: (r: { imported: number; skipped: number; failed: number }) => void; compact?: boolean }) {
  const { t, f, settings } = useApp();
  const collections = useCollections() ?? [];
  const [statuses, setStatuses] = useState<Map<string, Status>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collectionId, setCollectionId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; failed: number } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [items, offers] = await Promise.all([db().items.toArray(), db().offers.toArray()]);
      const keys = new Map<string, string[]>();
      for (const o of offers) if (o.urlKey) (keys.get(o.itemId) ?? keys.set(o.itemId, []).get(o.itemId)!).push(o.urlKey);
      const withKeys = items.map((i) => ({ ...i, urlKeys: keys.get(i.id) ?? [] }));
      const next = new Map<string, Status>();
      for (const c of candidates) {
        if (c.error || !c.draft.title) {
          next.set(c.key, 'invalid');
          continue;
        }
        const dupes = findDuplicates({ ...c.draft, urlKey: c.draft.url ? normaliseProductUrl(c.draft.url) : undefined }, withKeys);
        next.set(c.key, dupes.some((d) => d.sameListing) ? 'duplicate' : dupes.length ? 'possible' : 'new');
      }
      if (!alive) return;
      setStatuses(next);
      setSelected(new Set(candidates.filter((c) => next.get(c.key) === 'new').map((c) => c.key)));
    })();
    return () => {
      alive = false;
    };
  }, [candidates]);

  const selectable = useMemo(() => candidates.filter((c) => statuses.get(c.key) !== 'invalid'), [candidates, statuses]);

  async function run() {
    setBusy(true);
    let imported = 0;
    let failed = 0;
    for (const c of candidates) {
      if (!selected.has(c.key)) continue;
      try {
        await saveDraftAsNewItem({ ...c.draft, collectionIds: collectionId ? [collectionId] : c.draft.collectionIds }, settings, { source: 'import' });
        imported++;
      } catch {
        failed++;
      }
    }
    const invalid = candidates.filter((c) => statuses.get(c.key) === 'invalid').length;
    const r = { imported, skipped: candidates.length - imported - failed - invalid, failed: failed + invalid };
    setResult(r);
    setBusy(false);
    onDone?.(r);
  }

  if (result) {
    return (
      <Card className="p-4 text-center animate-pop-in">
        <p className="font-display text-base font-bold text-fg">{t('import_result', result)}</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Checkbox
          checked={selected.size > 0 && selected.size === selectable.length}
          indeterminate={selected.size > 0 && selected.size < selectable.length}
          onChange={(v) => setSelected(v ? new Set(selectable.map((c) => c.key)) : new Set())}
          label={<span className="font-semibold">{t('import_selected', { count: selected.size })}</span>}
        />
        <div className="flex items-center gap-2">
          <Select aria-label={t('import_into_collection')} className="h-8 w-44 text-[13px]" value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
            <option value="">{t('collection_none')}</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <ul className={cn('flex flex-col gap-1.5 overflow-y-auto pr-1', compact ? 'max-h-[50vh]' : 'max-h-[60vh]')}>
        {candidates.map((c) => {
          const st = statuses.get(c.key);
          const disabled = st === 'invalid';
          return (
            <li key={c.key}>
              <label className={cn('flex cursor-pointer items-center gap-3 rounded-2xl border border-line bg-surface p-2', disabled && 'cursor-not-allowed opacity-60', selected.has(c.key) && 'border-lilac-400 bg-accent-soft/40')}>
                <input
                  type="checkbox"
                  className="size-4 accent-[#6a45f0]"
                  disabled={disabled}
                  checked={selected.has(c.key)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(c.key);
                    else next.delete(c.key);
                    setSelected(next);
                  }}
                />
                <ProductImage src={c.draft.imageUrl} alt={c.draft.title || '?'} className="size-12 shrink-0 border border-line p-1" rounded="rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-fg">{c.draft.title || c.draft.url}</p>
                  <p className="truncate text-[11.5px] text-muted">
                    {c.draft.price !== null && c.draft.currency ? f.money(c.draft.price, c.draft.currency) : t('card_no_price')} · {c.draft.retailer.name || c.draft.retailer.domain}
                  </p>
                </div>
                {st === 'duplicate' && <Badge tone="lilac">{t('import_duplicate')}</Badge>}
                {st === 'possible' && (
                  <Badge tone="warn" icon={<Layers className="size-3" />}>
                    {t('import_possible_duplicate')}
                  </Badge>
                )}
                {st === 'invalid' && <Badge tone="danger">{c.error ?? t('import_unsupported')}</Badge>}
              </label>
            </li>
          );
        })}
      </ul>
      <Button variant="primary" block icon={<Download className="size-4" />} loading={busy} disabled={!selected.size} onClick={() => void run()}>
        {t('import_button')}
      </Button>
    </div>
  );
}
