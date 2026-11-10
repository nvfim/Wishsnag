import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, ExternalLink, Heart, Keyboard, LayoutDashboard, Link2, MousePointerClick, PencilLine, RefreshCw, ShieldCheck, Store } from 'lucide-react';
import type { ExtractionResult, RetailerOffer } from '@/core/types';
import { draftFromExtraction } from '@/core/draft';
import { summarise } from '@/core/summary';
import type { MatchResult } from '@/core/matching/match';
import { addDraftAsOffer, findOffersByUrl, recordObservation, relatedItems } from '@/db/repo';
import { kv, STORAGE_KEYS } from '@/platform/storage';
import { send, type ExtractError, type TabInfo } from '@/services/messages';
import { requestOriginAccess, siteLabel } from '@/services/permissions';
import { acceptObservedPrice } from '@/services/monitorService';
import { processObservation } from '@/services/alertsService';
import type { PendingDraft } from '@/background/index';
import { useApp } from '@/ui/app/AppContext';
import { useItemBundle, useSummaries } from '@/ui/hooks/data';
import { useSnagFlow } from '@/ui/hooks/useSnagFlow';
import { openDashboard, openExternal } from '@/ui/lib/nav';
import { Logo } from '@/ui/components/Logo';
import { Badge, Button, Card, EmptyState, IconButton, Kbd, cn } from '@/ui/components/primitives';
import { ConfidenceBadge, PriceTag, ProductImage, ProductRow, StatusBadges } from '@/ui/components/product';
import { DetectingState, SnagFlowView } from '@/ui/components/SnagFlowView';
import { ImportPreview, candidateToDraft, type ImportCandidate } from '@/ui/components/ImportPreview';
import { PriceChart } from '@/ui/components/PriceChart';
import { AlertsEditor, TargetPriceEditor } from '@/ui/components/AlertsEditor';
import { ComparisonView } from '@/ui/components/ComparisonView';
import { useToast } from '@/ui/components/overlay';

type Detection = { status: 'idle' | 'loading' } | { status: 'done'; result: ExtractionResult } | { status: 'error'; error: ExtractError };
type View = 'companion' | 'snag' | 'import';

/** Optional `?tab=<id>` lets the panel be opened in a normal tab for development and E2E tests. */
const FIXED_TAB = Number(new URLSearchParams(location.search).get('tab')) || undefined;

export function SidePanel() {
  const { t } = useApp();
  const toast = useToast();
  const flow = useSnagFlow();
  const [tab, setTab] = useState<TabInfo | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [detection, setDetection] = useState<Detection>({ status: 'idle' });
  const [view, setView] = useState<View>('companion');
  const [importCandidates, setImportCandidates] = useState<ImportCandidate[]>([]);
  const lastUrl = useRef<string | null>(null);

  const detect = useCallback(async (force = false) => {
    let info: TabInfo | null = null;
    let access = false;
    try {
      if (FIXED_TAB) {
        const tb = await chrome.tabs.get(FIXED_TAB);
        info = { id: tb.id!, windowId: tb.windowId, url: tb.url ?? null, title: tb.title ?? null, favIconUrl: tb.favIconUrl ?? null, restricted: false };
        access = true;
      } else {
        const res = await send({ type: 'tab:active' });
        info = res.tab;
        access = res.hasAccess;
      }
    } catch {
      info = null;
    }
    setTab(info);
    setHasAccess(access);
    if (!info) return setDetection({ status: 'idle' });
    if (!force && info.url && info.url === lastUrl.current) return;
    lastUrl.current = info.url;
    if (info.restricted) return setDetection({ status: 'error', error: 'restricted' });
    setDetection({ status: 'loading' });
    const res = await send({ type: 'tab:extract', tabId: info.id }).catch(() => ({ ok: false as const, error: 'failed' as const }));
    if (res.ok) {
      if (res.tab) setTab((cur) => ({ ...(cur ?? res.tab!), url: res.tab!.url, title: res.tab!.title }));
      setDetection({ status: 'done', result: res.result });
    } else setDetection({ status: 'error', error: res.error });
  }, []);

  // Follow the active tab.
  useEffect(() => {
    void detect(true);
    if (typeof chrome === 'undefined' || !chrome.tabs?.onActivated) return;
    const onActivated = () => void detect();
    const onUpdated = (_id: number, info: { status?: string }, tb: chrome.tabs.Tab) => {
      if (info.status === 'complete' && tb.active) void detect(true);
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [detect]);

  // Pick up snags started from the right-click menu or keyboard shortcut.
  useEffect(() => {
    const consume = async (p: PendingDraft | undefined) => {
      if (!p || Date.now() - p.createdAt > 3 * 60_000) return;
      if (p.status === 'extracting') {
        setView(p.mode === 'list' ? 'import' : 'snag');
        flow.reset();
        return;
      }
      await kv().remove(STORAGE_KEYS.pendingDraft);
      if (p.manual) {
        flow.manual(p.manual);
        setView('snag');
      } else if (p.extraction) {
        if (p.mode === 'list' && p.extraction.ok) {
          setImportCandidates(p.extraction.result.listItems.map((c, i) => ({ key: `${i}-${c.url}`, draft: candidateToDraft(c) })));
          setView('import');
        } else {
          flow.loadExtraction(p.extraction);
          setView('snag');
        }
      }
    };
    void kv().get<PendingDraft>(STORAGE_KEYS.pendingDraft).then(consume);
    return kv().onChanged((changes) => {
      const c = changes[STORAGE_KEYS.pendingDraft];
      if (c?.newValue) void consume(c.newValue as PendingDraft);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startImport = async () => {
    setView('import');
    setImportCandidates([]);
    const res = await send({ type: 'tab:extract', tabId: tab?.id, mode: 'list' }).catch(() => null);
    if (res?.ok) setImportCandidates(res.result.listItems.map((c, i) => ({ key: `${i}-${c.url}`, draft: candidateToDraft(c) })));
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          {view !== 'companion' && (
            <IconButton label={t('act_back')} size="sm" onClick={() => (setView('companion'), flow.reset())}>
              <ArrowLeft className="size-4" />
            </IconButton>
          )}
          <Logo size={24} />
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton label={t('sp_rescan')} size="sm" onClick={() => void detect(true)}>
            <RefreshCw className={cn('size-4', detection.status === 'loading' && 'animate-spin')} />
          </IconButton>
          <IconButton label={t('nav_open_dashboard')} size="sm" onClick={() => openDashboard('/')}>
            <LayoutDashboard className="size-4" />
          </IconButton>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4 p-4">
        {view === 'snag' && (flow.state.phase === 'idle' ? <DetectingState label={t('snag_detecting')} /> : <SnagFlowView flow={flow} onDone={() => (setView('companion'), flow.reset(), void detect(true))} />)}

        {view === 'import' && (
          <section>
            <h2 className="mb-2 font-display text-base font-bold">{t('import_title')}</h2>
            {importCandidates.length ? <ImportPreview compact candidates={importCandidates} onDone={(r) => toast.show(t('import_result', r))} /> : <EmptyState compact icon={<Download className="size-6" />} title={t('import_none_found')} body={t('import_from_page_hint')} />}
          </section>
        )}

        {view === 'companion' && (
          <>
            <Companion
              tab={tab}
              hasAccess={hasAccess}
              detection={detection}
              onSnag={(r) => {
                flow.loadExtraction({ ok: true, result: r, tab });
                setView('snag');
              }}
              onManual={() => {
                flow.manual({ url: tab?.url && !tab.restricted ? tab.url : '', title: tab?.title ?? '' });
                setView('snag');
              }}
              onGranted={() => void detect(true)}
              onImport={() => void startImport()}
            />
            <RecentlySaved />
          </>
        )}
      </main>
      <footer className="px-4 pb-4 text-center text-[11px] text-muted">{t('tagline')}</footer>
    </div>
  );
}

function Companion(props: { tab: TabInfo | null; hasAccess: boolean; detection: Detection; onSnag: (r: ExtractionResult) => void; onManual: () => void; onGranted: () => void; onImport: () => void }) {
  const { t } = useApp();
  const toast = useToast();
  const { tab: tb, detection: d } = props;
  if (!tb) return <EmptyState compact icon={<Store className="size-6" />} title={t('sp_no_tab')} />;
  if (d.status === 'loading') return <DetectingState label={t('sp_detecting')} />;
  if (d.status === 'error') {
    if (d.error === 'restricted') return <EmptyState compact icon={<ShieldCheck className="size-6" />} title={t('sp_restricted')} action={<Button size="sm" icon={<PencilLine className="size-4" />} onClick={props.onManual}>{t('sp_add_manually')}</Button>} />;
    return (
      <Card className="flex flex-col gap-3 p-4">
        <h2 className="font-display text-[15px] font-bold">{tb.url ? t('sp_no_access_title') : t('sp_title')}</h2>
        {tb.url ? <p className="text-[13px] text-muted">{t('sp_no_access_body', { site: siteLabel(tb.url) })}</p> : null}
        {tb.url && (
          <Button
            variant="primary"
            icon={<ShieldCheck className="size-4" />}
            onClick={async () => {
              const ok = await requestOriginAccess([tb.url!]);
              toast.show(ok ? t('permissions_granted', { site: siteLabel(tb.url!) }) : t('permissions_denied'), { tone: ok ? 'success' : 'error' });
              if (ok) props.onGranted();
            }}
          >
            {t('sp_allow_site', { site: siteLabel(tb.url) })}
          </Button>
        )}
        <div className="flex flex-col gap-1.5 rounded-2xl bg-surface-2 p-3 text-[12.5px] text-muted">
          <span className="flex items-center gap-2">
            <MousePointerClick className="size-4 shrink-0 text-accent" /> {t('sp_or_click')}
          </span>
          <span className="flex items-center gap-2">
            <Keyboard className="size-4 shrink-0 text-accent" /> <Kbd>Alt</Kbd>+<Kbd>Shift</Kbd>+<Kbd>S</Kbd>
          </span>
        </div>
        <Button size="sm" icon={<PencilLine className="size-4" />} onClick={props.onManual}>
          {t('sp_add_manually')}
        </Button>
      </Card>
    );
  }
  if (d.status !== 'done') return null;
  return <DetectedProduct result={d.result} hasAccess={props.hasAccess} tabUrl={tb.url} onSnag={() => props.onSnag(d.result)} onManual={props.onManual} onImport={props.onImport} />;
}

function DetectedProduct({ result, hasAccess: access, tabUrl, onSnag, onManual, onImport }: { result: ExtractionResult; hasAccess: boolean; tabUrl: string | null; onSnag: () => void; onManual: () => void; onImport: () => void }) {
  const { f, t, settings } = useApp();
  const toast = useToast();
  const [saved, setSaved] = useState<RetailerOffer[] | null>(null);
  const [related, setRelated] = useState<{ itemId: string; title: string; image?: string; result: MatchResult }[]>([]);
  const recorded = useRef(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const offers = [...(await findOffersByUrl(result.url)), ...(result.canonicalUrl !== result.url ? await findOffersByUrl(result.canonicalUrl) : [])];
      if (!alive) return;
      setSaved(offers);
      if (!offers.length && result.status !== 'none') {
        const rel = await relatedItems(draftFromExtraction(result));
        if (alive) setRelated(rel.map((r) => ({ itemId: r.item.id, title: r.item.title, image: r.item.imageUrl, result: r.result })));
      }
      // Revisiting a saved listing records a genuine observation of the price on the page.
      if (offers.length && !recorded.current) {
        recorded.current = true;
        for (const o of offers) {
          const ok = acceptObservedPrice(o, result);
          if (ok.ok && (!o.lastVerifiedAt || Date.now() - o.lastVerifiedAt > 5 * 60_000)) {
            const rec = await recordObservation(o.id, { price: ok.price, currency: ok.currency, availability: result.offer.availability, source: 'page_visit' });
            await processObservation(rec);
          }
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [result]);

  if (saved === null) return <DetectingState label={t('sp_detecting')} />;
  if (saved.length) return <SavedCompanion itemId={saved[0]!.itemId} />;

  if (result.status === 'none') {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <p className="text-[13px] font-semibold text-fg">{t('sp_not_product')}</p>
        <p className="text-[12.5px] text-muted">{t('snag_unsupported_body')}</p>
        <div className="flex gap-2">
          <Button block size="sm" icon={<PencilLine className="size-4" />} onClick={onManual}>
            {t('sp_add_manually')}
          </Button>
          {result.listItems.length > 0 && (
            <Button block size="sm" icon={<Download className="size-4" />} onClick={onImport}>
              {t('sp_import_page')}
            </Button>
          )}
        </div>
      </Card>
    );
  }
  const { product, offer } = result;
  return (
    <div className="flex flex-col gap-3 animate-fade-up">
      <p className="text-[12px] font-bold tracking-wide text-muted uppercase">{t('sp_on_this_page')}</p>
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex gap-3">
          <ProductImage src={product.imageUrl} alt={product.title} className="size-20 shrink-0 border border-line p-1.5" />
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-muted">{result.retailer.name}</p>
            <h2 className="line-clamp-3 text-[14px] leading-snug font-bold text-fg">{product.title}</h2>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {offer.price !== null && offer.currency ? (
            <span className="tabular font-display text-2xl font-extrabold">
              {offer.priceIsFrom ? '≥ ' : ''}
              {f.money(offer.price, offer.currency)}
            </span>
          ) : (
            <span className="text-sm text-muted">{t('card_no_price')}</span>
          )}
          {offer.listPrice && offer.currency && <span className="tabular text-sm text-muted line-through">{f.money(offer.listPrice, offer.currency)}</span>}
          <Badge tone={offer.availability === 'in_stock' ? 'savings' : offer.availability === 'out_of_stock' ? 'warn' : 'neutral'}>{t(`availability_${offer.availability}`)}</Badge>
          {result.heuristicFields.includes('price') && <Badge tone="warn">{t('snag_heuristic_hint')}</Badge>}
        </div>
        {offer.price !== null && offer.currency && f.approx(offer.price, offer.currency) && <p className="tabular -mt-2 text-[12px] text-muted">{f.approx(offer.price, offer.currency)}</p>}
        {result.variants.length > 0 && (
          <div>
            <p className="mb-1 text-[12px] font-semibold text-muted">{t('sp_variants')}</p>
            <div className="flex flex-wrap gap-1.5">
              {result.variants.slice(0, 8).map((v) => (
                <Badge key={v.label} tone={v.availability === 'out_of_stock' ? 'outline' : 'neutral'}>
                  {v.attributes.colour ?? v.attributes.size ?? v.label}
                  {v.price != null && v.currency ? ` · ${f.money(v.price, v.currency)}` : ''}
                </Badge>
              ))}
            </div>
          </div>
        )}
        <Button variant="primary" size="lg" block icon={<Heart className="size-5 fill-current" />} onClick={onSnag} aria-description={t('snag_button_aria')}>
          {t('snag_button')}
        </Button>
        {!access && tabUrl && (
          <button
            type="button"
            className="text-[12px] font-semibold text-accent hover:underline"
            onClick={async () => {
              const ok = await requestOriginAccess([tabUrl]);
              toast.show(ok ? t('permissions_granted', { site: siteLabel(tabUrl) }) : t('permissions_denied'), { tone: ok ? 'success' : 'error' });
            }}
          >
            <ShieldCheck className="mr-1 inline size-3.5" />
            {t('sp_allow_site', { site: siteLabel(tabUrl) })}
          </button>
        )}
      </Card>
      {related.length > 0 && (
        <section>
          <p className="mb-1.5 text-[12px] font-bold tracking-wide text-muted uppercase">{t('sp_related')}</p>
          <div className="flex flex-col gap-1.5">
            {related.map((r) => (
              <Card key={r.itemId} className="flex items-center gap-2.5 p-2">
                <ProductImage src={r.image} alt={r.title} className="size-11 shrink-0 border border-line p-1" rounded="rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold">{r.title}</p>
                  <ConfidenceBadge confidence={r.result.confidence!} />
                </div>
                <Button
                  size="sm"
                  icon={<Link2 className="size-3.5" />}
                  onClick={async () => {
                    await addDraftAsOffer(r.itemId, draftFromExtraction(result), settings, { match: r.result });
                    toast.show(t('sp_linked'));
                    setSaved(await findOffersByUrl(result.url));
                  }}
                >
                  {t('sp_link_as_offer')}
                </Button>
              </Card>
            ))}
          </div>
        </section>
      )}
      {result.listItems.length > 1 && (
        <Button size="sm" icon={<Download className="size-4" />} onClick={onImport}>
          {t('sp_import_page')}
        </Button>
      )}
    </div>
  );
}

function SavedCompanion({ itemId }: { itemId: string }) {
  const { fx, t, f, settings } = useApp();
  const bundle = useItemBundle(itemId);
  const summary = useMemo(() => (bundle ? summarise(bundle.item, bundle.offers, { settings, fx, now: Date.now() }) : null), [bundle, settings, fx]);
  if (!bundle || !summary) return <DetectingState label={t('loading')} />;
  const primary = summary.primary;
  return (
    <div className="flex flex-col gap-3 animate-fade-up">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <Badge tone="lilac" icon={<Heart className="size-3 fill-current" />}>
            {t('sp_in_wishlist')}
          </Badge>
          <StatusBadges summary={summary} max={2} />
        </div>
        <div className="flex gap-3">
          <ProductImage src={bundle.item.imageUrl} alt={bundle.item.title} className="size-16 shrink-0 border border-line p-1" />
          <div className="min-w-0">
            <h2 className="line-clamp-2 text-[14px] font-bold">{bundle.item.title}</h2>
            <PriceTag summary={summary} />
          </div>
        </div>
        {summary.saved && <p className="tabular text-[12px] text-muted">{t('detail_saved_price')}: {f.money(summary.saved.price, summary.saved.currency)}</p>}
        <div className="flex gap-2">
          <Button block size="sm" icon={<ExternalLink className="size-3.5" />} onClick={() => openDashboard(`/item/${itemId}`)}>
            {t('act_open')}
          </Button>
          {primary?.url && (
            <Button block size="sm" onClick={() => openExternal(primary.url)}>
              {t('detail_open_listing')}
            </Button>
          )}
        </div>
      </Card>
      <Card className="p-4">
        <h3 className="mb-2 text-[13px] font-bold">{t('sp_history_preview')}</h3>
        <PriceChart observations={bundle.observations.filter((o) => o.offerId === primary?.id)} target={bundle.item.targetPrice} height={110} compact />
      </Card>
      <Card className="flex flex-col gap-3 p-4">
        <h3 className="text-[13px] font-bold">{t('field_target_price')}</h3>
        <TargetPriceEditor item={bundle.item} currency={summary.latest?.currency ?? null} latest={summary.latest?.price ?? null} compact />
      </Card>
      <Card className="p-4">
        <h3 className="mb-3 text-[13px] font-bold">{t('detail_alerts')}</h3>
        <AlertsEditor item={bundle.item} alerts={bundle.alerts} currency={summary.latest?.currency ?? null} compact />
      </Card>
      <Card className="p-4">
        <h3 className="mb-3 text-[13px] font-bold">{t('sp_compare_preview')}</h3>
        <ComparisonView item={bundle.item} offers={bundle.offers} compact />
      </Card>
    </div>
  );
}

function RecentlySaved() {
  const { t } = useApp();
  const summaries = useSummaries();
  const recent = (summaries ?? []).filter((s) => !s.item.archived).sort((a, b) => b.item.createdAt - a.item.createdAt).slice(0, 5);
  if (!recent.length) return null;
  return (
    <section>
      <p className="mb-1.5 text-[12px] font-bold tracking-wide text-muted uppercase">{t('home_recent')}</p>
      <div className="flex flex-col">
        {recent.map((s) => (
          <ProductRow key={s.item.id} summary={s} compact onOpen={() => openDashboard(`/item/${s.item.id}`)} />
        ))}
      </div>
    </section>
  );
}
