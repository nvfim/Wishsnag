import { useState } from 'react';
import { FileJson, FileSpreadsheet, Link2, PanelRight } from 'lucide-react';
import { draftFromExtraction } from '@/core/draft';
import { csvTemplate, csvToDrafts } from '@/core/importExport/wishlistCsv';
import { parseExportBundle } from '@/core/importExport/json';
import { safeUrl } from '@/core/util/url';
import { createCollection, importBundle } from '@/db/repo';
import { db } from '@/db/schema';
import { fetchAndExtract } from '@/services/pageFetch';
import { hasOriginAccess, requestOriginAccess, siteLabel } from '@/services/permissions';
import { useApp } from '@/ui/app/AppContext';
import { TextArea } from '@/ui/components/forms';
import { Button, Card, SectionHeader, Spinner } from '@/ui/components/primitives';
import { ImportPreview, type ImportCandidate } from '@/ui/components/ImportPreview';
import { useToast } from '@/ui/components/overlay';
import { downloadText, readFileText } from '@/ui/lib/download';
import { openSidePanel } from '@/ui/lib/nav';

export function ImportPage() {
  const { t, settings } = useApp();
  const toast = useToast();
  const [candidates, setCandidates] = useState<ImportCandidate[] | null>(null);
  const [urls, setUrls] = useState('');
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [notes, setNotes] = useState<string[]>([]);

  async function readUrls() {
    const list = [...new Set(urls.split(/\s+/).map((u) => safeUrl(u.trim())).filter((u): u is string => !!u))].slice(0, 100);
    if (!list.length) return;
    const missing: string[] = [];
    for (const u of list) if (!(await hasOriginAccess(u))) missing.push(u);
    // One permission prompt for all stores in the list (user gesture: this click).
    if (missing.length) await requestOriginAccess(missing);
    const out: ImportCandidate[] = [];
    const skipped: string[] = [];
    for (const [i, u] of list.entries()) {
      setProgress({ current: i + 1, total: list.length });
      if (!(await hasOriginAccess(u))) {
        skipped.push(t('import_permission_skipped', { site: siteLabel(u) }));
        out.push({ key: u, draft: { ...draftFromExtraction(emptyResult(u)), title: '' }, error: t('state_permission_denied') });
        continue;
      }
      const res = await fetchAndExtract(u);
      if (res.ok && res.result.product.title) out.push({ key: u, draft: draftFromExtraction(res.result) });
      else out.push({ key: u, draft: { ...draftFromExtraction(emptyResult(u)), title: '' }, error: res.ok ? t('import_unsupported') : `${t('import_unsupported')} (${res.reason})` });
    }
    setProgress(null);
    setNotes(skipped);
    setCandidates(out);
  }

  async function readCsv(file: File) {
    try {
      const rows = csvToDrafts(await readFileText(file));
      const collections = await db().collections.toArray();
      const byName = new Map(collections.map((c) => [c.name.toLowerCase(), c.id]));
      const out: ImportCandidate[] = [];
      for (const r of rows) {
        if (!r.draft) {
          out.push({ key: `row-${r.row}`, draft: { ...draftFromExtraction(emptyResult('')), title: '' }, error: t('import_row_error', { row: r.row, error: r.error ?? '' }) });
          continue;
        }
        const ids: string[] = [];
        for (const name of r.collectionNames) {
          let id = byName.get(name.toLowerCase());
          if (!id) {
            id = (await createCollection({ name })).id;
            byName.set(name.toLowerCase(), id);
          }
          ids.push(id);
        }
        out.push({ key: `row-${r.row}`, draft: { ...r.draft, collectionIds: ids } });
      }
      setCandidates(out);
    } catch (err) {
      toast.show(t('import_error', { error: err instanceof Error ? err.message : String(err) }), { tone: 'error' });
    }
  }

  async function readJson(file: File) {
    try {
      const bundle = parseExportBundle(JSON.parse(await readFileText(file)));
      const r = await importBundle(bundle, settings);
      toast.show(t('import_json_result', r));
    } catch (err) {
      toast.show(t('import_error', { error: err instanceof Error ? err.message.slice(0, 200) : String(err) }), { tone: 'error' });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title={t('import_title')} subtitle={t('import_subtitle')} />
      {candidates ? (
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base font-bold">{t('import_preview')}</h2>
            <Button size="sm" variant="ghost" onClick={() => setCandidates(null)}>
              {t('act_back')}
            </Button>
          </div>
          {notes.map((n) => (
            <p key={n} className="mb-1 text-[12.5px] text-warn">
              {n}
            </p>
          ))}
          <ImportPreview candidates={candidates} onDone={(r) => toast.show(t('import_result', r))} />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="flex items-center gap-2 font-display text-base font-bold">
              <PanelRight className="size-5 text-accent" /> {t('import_from_page')}
            </h2>
            <p className="text-[13px] text-muted">{t('import_from_page_hint')}</p>
            <Button className="self-start" size="sm" onClick={() => void openSidePanel()}>
              {t('nav_open_sidepanel')}
            </Button>
          </Card>
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="flex items-center gap-2 font-display text-base font-bold">
              <Link2 className="size-5 text-accent" /> {t('import_urls')}
            </h2>
            <p className="text-[13px] text-muted">{t('import_urls_hint')}</p>
            <TextArea aria-label={t('import_urls')} rows={5} value={urls} onChange={(e) => setUrls(e.target.value)} placeholder={'https://www.example.com.au/products/…\nhttps://www.example.com.bd/product/…'} />
            {progress ? <Spinner label={t('import_reading', progress)} /> : <Button variant="primary" className="self-start" disabled={!urls.trim()} onClick={() => void readUrls()}>{t('import_urls_read')}</Button>}
          </Card>
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="flex items-center gap-2 font-display text-base font-bold">
              <FileSpreadsheet className="size-5 text-accent" /> {t('import_csv')}
            </h2>
            <p className="text-[13px] text-muted">{t('import_csv_hint')}</p>
            <div className="flex flex-wrap gap-2">
              <FileButton accept=".csv,text/csv" label={t('import_choose_file')} onFile={(f) => void readCsv(f)} />
              <Button size="sm" variant="ghost" onClick={() => downloadText('wishsnag-template.csv', csvTemplate(), 'text/csv')}>
                {t('import_csv_template')}
              </Button>
            </div>
          </Card>
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="flex items-center gap-2 font-display text-base font-bold">
              <FileJson className="size-5 text-accent" /> {t('import_json')}
            </h2>
            <p className="text-[13px] text-muted">{t('import_json_hint')}</p>
            <FileButton accept=".json,application/json" label={t('import_choose_file')} onFile={(f) => void readJson(f)} />
          </Card>
        </div>
      )}
    </div>
  );
}

function FileButton({ accept, label, onFile }: { accept: string; label: string; onFile: (f: File) => void }) {
  return (
    <label className="inline-flex h-8 cursor-pointer items-center rounded-xl border border-line bg-surface px-3 text-[13px] font-semibold hover:bg-surface-2 focus-within:ring-2 focus-within:ring-lilac-500">
      {label}
      <input
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </label>
  );
}

function emptyResult(url: string) {
  return {
    status: 'none' as const,
    url,
    canonicalUrl: url,
    product: { title: '', identifiers: {}, variant: {}, condition: 'unknown' as const },
    offer: { price: null, currency: null, listPrice: null, priceIsFrom: false, availability: 'unknown' as const, condition: 'unknown' as const, shippingQuotes: [], taxIncluded: null },
    variants: [],
    methods: ['manual' as const],
    heuristicFields: [],
    priceCandidates: [],
    retailer: { id: null, name: '', domain: '', country: null },
    warnings: [],
    listItems: [],
  };
}
