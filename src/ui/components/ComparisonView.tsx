import { useMemo, useState } from 'react';
import { BadgeCheck, Bell, CloudOff, ExternalLink, Globe, Link2, MoreHorizontal, Plus, RefreshCw, Search, Star, Trash2, Trophy, Truck } from 'lucide-react';
import type { ComparisonMode, RetailerOffer, WishlistItem } from '@/core/types';
import type { ComparisonEntry } from '@/core/pricing/compare';
import { compareForItem } from '@/core/summary';
import { RETAILERS, deliveryEligibility, searchLink } from '@/core/retailers/registry';
import { matchProducts } from '@/core/matching/match';
import { draftFromInput, retailerInfoForUrl, type ProductDraft } from '@/core/draft';
import { currencyOptions } from '@/core/pricing/currency';
import { countryOptions } from '@/core/geo/countries';
import { addDraftAsOffer, deleteOffer, setPrimaryOffer, setUserShippingQuote } from '@/db/repo';
import { send } from '@/services/messages';
import { describeReport, summariseOutcomes } from '@/services/checkReport';
import { hasOriginAccess, requestOriginAccess } from '@/services/permissions';
import { useCloudState, searchProviderOffers, type ProviderOffer } from '@/cloud/client';
import { useApp } from '../app/AppContext';
import { openDashboard, openExternal } from '../lib/nav';
import { Badge, Button, Card, EmptyState, IconButton, Spinner, cn } from './primitives';
import { Dialog, useConfirm, useToast } from './overlay';
import { Checkbox, Field, Input, Segmented, Select, parseNumberInput } from './forms';
import { ConfidenceBadge, ProductImage } from './product';

const GROUP_LABEL = { ranked: 'group_ranked', incomplete: 'group_incomplete', stale: 'group_stale', possible: 'group_possible', variant: 'group_variant', ineligible: 'group_ineligible', unpriced: 'group_unpriced' } as const;

export function buildQuery(item: Pick<WishlistItem, 'title' | 'brand' | 'model' | 'identifiers'>): string {
  if (item.brand && (item.model || item.identifiers.mpn)) return `${item.brand} ${item.model ?? item.identifiers.mpn}`;
  return item.title.split(/\s[-|–(]\s?/)[0]!.split(' ').slice(0, 8).join(' ');
}

export function ComparisonView({ item, offers, otherItems = [], compact = false }: { item: WishlistItem; offers: RetailerOffer[]; otherItems?: { item: WishlistItem; offer?: RetailerOffer }[]; compact?: boolean }) {
  const { t, f, settings, fx, updateSettings } = useApp();
  const toast = useToast();
  const [mode, setMode] = useState<ComparisonMode>(settings.comparison.defaultMode);
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [shipFor, setShipFor] = useState<RetailerOffer | null>(null);
  const result = useMemo(() => compareForItem(item, offers, { settings, fx, now: Date.now() }, mode), [item, offers, settings, fx, mode]);

  async function refreshAll() {
    const urls = offers.map((o) => o.url).filter(Boolean);
    const missing: string[] = [];
    for (const u of urls) if (!(await hasOriginAccess(u))) missing.push(u);
    if (missing.length) await requestOriginAccess(missing); // user gesture: this click
    setRefreshing(true);
    try {
      const res = await send({ type: 'offer:refresh', offerIds: offers.filter((o) => o.url).map((o) => o.id) });
      const { message, tone } = describeReport(summariseOutcomes(res.outcomes), t);
      toast.show(message, { tone, duration: 8000 });
    } catch (err) {
      toast.show(t('state_error_detail', { error: err instanceof Error ? err.message : String(err) }), { tone: 'error' });
    } finally {
      setRefreshing(false);
    }
  }

  const groups = (['ranked', 'incomplete', 'stale', 'unpriced', 'possible', 'variant', 'ineligible'] as const).map((g) => ({ g, entries: result.entries.filter((e) => e.group === g) })).filter((x) => x.entries.length);
  const headline =
    result.headline === 'lowest_verified'
      ? t('compare_headline_lowest', { count: result.verifiedCount })
      : result.headline === 'only_one_verified'
        ? t('compare_headline_one')
        : result.headline === 'none_verified'
          ? t('compare_headline_none')
          : t('compare_no_offers');

  const matches = otherItems
    .filter((o) => o.item.id !== item.id && o.offer && o.offer.price !== null)
    .map((o) => ({ ...o, r: matchProducts(item, o.item) }))
    .filter((o) => o.r.confidence === 'verified_exact' || o.r.confidence === 'high')
    .filter((o) => !offers.some((x) => x.urlKey && x.urlKey === o.offer!.urlKey))
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented<ComparisonMode>
          label={t('compare_title')}
          value={mode}
          onChange={setMode}
          size={compact ? 'sm' : 'md'}
          options={[
            { value: 'local', label: t('mode_local') },
            { value: 'global', label: t('mode_global') },
            { value: 'all', label: t('mode_all') },
          ]}
        />
        <div className="flex gap-1.5">
          <Button size="sm" icon={<RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />} onClick={() => void refreshAll()} disabled={refreshing}>
            {t('detail_refresh_prices')}
          </Button>
          {!compact && (
            <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setAddOpen(true)}>
              {t('compare_add_offer')}
            </Button>
          )}
        </div>
      </div>

      {settings.deliveryCountry !== settings.shoppingCountry && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-accent-soft px-3 py-2 text-[12.5px] text-accent">
          <span>{t('compare_mode_mismatch', { delivery: f.country(settings.deliveryCountry), shopping: f.country(settings.shoppingCountry) })}</span>
          <button type="button" className="font-semibold underline" onClick={() => void updateSettings({ shoppingCountry: settings.deliveryCountry })}>
            {t('compare_switch_market', { country: f.country(settings.deliveryCountry) })}
          </button>
        </div>
      )}

      <Card className={cn('overflow-hidden', result.cheapest ? 'border-mint-400/40' : '')}>
        <div className={cn('flex flex-col gap-3 p-4', result.cheapest && 'bg-[linear-gradient(120deg,var(--ws-savings-soft),transparent_70%)]')}>
          <div className={cn('flex items-start gap-3', compact && 'flex-wrap')}>
            <div className={cn('grid size-10 shrink-0 place-items-center rounded-2xl', result.cheapest ? 'bg-mint-500 text-white' : 'bg-surface-2 text-muted')}>
              <Trophy className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-muted">{headline}</p>
              {result.cheapest ? (
                <>
                  <p className={cn('tabular font-display font-extrabold text-fg', compact ? 'text-xl' : 'text-2xl')}>
                    {result.cheapest.comparable!.approximate ? '≈ ' : ''}
                    {f.money(result.cheapest.comparable!.amount, result.comparisonCurrency)}
                    <span className={cn('text-sm font-semibold text-muted', compact ? 'block' : 'ml-2')}>{compact ? '' : '· '}{result.cheapest.offer.retailerName}</span>
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {result.savingsVsOriginal && result.savingsVsOriginal.amount > 0 && (
                      <Badge tone="savings">{result.savingsVsOriginal.basis === 'total' ? t('compare_savings', { amount: f.money(result.savingsVsOriginal.amount, result.savingsVsOriginal.currency) }) : t('compare_savings_listing', { amount: f.money(result.savingsVsOriginal.amount, result.savingsVsOriginal.currency) })}</Badge>
                    )}
                    {result.cheapest.isOriginal && <Badge tone="lilac">{t('compare_already_cheapest')}</Badge>}
                    {result.diffToNext && result.diffToNext.amount > 0 && <Badge>{t('compare_diff_next', { amount: f.money(result.diffToNext.amount, result.diffToNext.currency) })}</Badge>}
                    <Badge tone="outline" icon={<BadgeCheck className="size-3" />}>
                      {t('compare_verified_count', { count: result.verifiedCount })}
                    </Badge>
                  </div>
                </>
              ) : (
                <p className="mt-0.5 text-[13px] text-muted">{offers.length > 1 ? t('compare_no_offers_hint') : t('compare_no_offers')}</p>
              )}
            </div>
            {result.cheapest && (
              <Button size="sm" variant="savings" className={cn(compact && 'w-full')} icon={<ExternalLink className="size-3.5" />} onClick={() => openExternal(result.cheapest!.offer.url)}>
                {t('act_view_deal')}
              </Button>
            )}
          </div>
          <p className="text-[11.5px] text-muted">
            {t('compare_last_compared', { time: f.relative(result.generatedAt) })}
            {result.usesConversion && result.fxDate && <> · {t('compare_fx_note', { date: result.fxDate })}</>}
            {!fx && offers.some((o) => o.currency && o.currency !== settings.displayCurrency) && <> · {t('compare_fx_unavailable')}</>}
            {result.hiddenByMode > 0 && <> · {t('compare_hidden_by_mode', { count: result.hiddenByMode })}</>}
          </p>
        </div>
      </Card>

      {groups.map(({ g, entries }) => (
        <section key={g} aria-label={t(GROUP_LABEL[g], { country: f.country(settings.deliveryCountry) })}>
          <h3 className="mb-2 text-[12px] font-bold tracking-wide text-muted uppercase">{t(GROUP_LABEL[g], { country: f.country(settings.deliveryCountry) })}</h3>
          <div className="flex flex-col gap-2">
            {entries.map((e) => (
              <OfferCard key={e.offer.id} entry={e} item={item} isCheapest={result.cheapest?.offer.id === e.offer.id} compact={compact} onAddShipping={() => setShipFor(e.offer)} />
            ))}
          </div>
        </section>
      ))}

      {matches.length > 0 && (
        <section>
          <h3 className="mb-2 text-[12px] font-bold tracking-wide text-muted uppercase">{t('compare_matches_in_wishlist')}</h3>
          <div className="flex flex-col gap-2">
            {matches.map((m) => (
              <Card key={m.item.id} className="flex items-center gap-3 p-3">
                <ProductImage src={m.item.imageUrl} alt={m.item.title} className="size-12 border border-line p-1" rounded="rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold">{m.item.title}</p>
                  <p className="text-[12px] text-muted">
                    {m.offer!.retailerName} · {f.money(m.offer!.price!, m.offer!.currency!)}
                  </p>
                </div>
                <ConfidenceBadge confidence={m.r.confidence!} />
                <Button
                  size="sm"
                  icon={<Link2 className="size-3.5" />}
                  onClick={async () => {
                    await addDraftAsOffer(item.id, offerToDraft(m.offer!), settings, { match: m.r });
                    toast.show(t('compare_offer_saved'));
                  }}
                >
                  {t('compare_link_offer')}
                </Button>
              </Card>
            ))}
          </div>
        </section>
      )}

      {!compact && <CloudOffers item={item} mode={mode} />}
      <SearchLinks item={item} mode={mode} compact={compact} />

      <AddOfferDialog open={addOpen} onClose={() => setAddOpen(false)} item={item} />
      <ShippingDialog offer={shipFor} onClose={() => setShipFor(null)} />
    </div>
  );
}

function offerToDraft(o: RetailerOffer): ProductDraft {
  return {
    title: o.title,
    brand: o.brand,
    model: o.model,
    imageUrl: o.imageUrl,
    identifiers: o.identifiers,
    variant: o.variant,
    condition: o.condition,
    url: o.url,
    price: o.price,
    currency: o.currency,
    listPrice: o.listPrice,
    availability: o.availability,
    taxIncluded: o.taxIncluded,
    shippingQuotes: o.shippingQuotes,
    seller: o.seller,
    paymentMethods: o.paymentMethods,
    retailer: { id: o.retailerId, name: o.retailerName, domain: o.retailerDomain, country: o.retailerCountry },
    methods: o.extractionMethods,
    targetPrice: null,
    priority: 'medium',
    collectionIds: [],
    tags: [],
    notes: '',
    status: 'wanted',
  };
}

function OfferCard({ entry, item, isCheapest, compact, onAddShipping }: { entry: ComparisonEntry; item: WishlistItem; isCheapest: boolean; compact: boolean; onAddShipping: () => void }) {
  const { t, f, settings } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const [menu, setMenu] = useState(false);
  const { offer, cost } = entry;
  const delivery = f.country(settings.deliveryCountry);
  const elig = cost?.eligibility;
  return (
    <Card className={cn('p-3', isCheapest && 'ring-2 ring-mint-400/70')}>
      <div className="flex gap-3">
        {!compact && <ProductImage src={offer.imageUrl ?? item.imageUrl} alt={offer.title} className="size-16 shrink-0 border border-line p-1" rounded="rounded-xl" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {entry.rank !== null && <Badge tone={isCheapest ? 'savings' : 'neutral'}>{t('compare_rank', { rank: entry.rank })}</Badge>}
            <span className="truncate text-[13.5px] font-bold text-fg">{offer.retailerName}</span>
            {offer.retailerCountry && <span className="text-[11.5px] text-muted">{f.country(offer.retailerCountry)}</span>}
            <ConfidenceBadge confidence={offer.matchConfidence} />
          </div>
          <p className="mt-0.5 line-clamp-1 text-[12.5px] text-muted" title={offer.title}>
            {offer.title}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
            {offer.price !== null && offer.currency ? (
              <span className="tabular font-semibold text-fg">
                {t('compare_listing')}: {f.money(offer.price, offer.currency)}
                {entry.display?.approximate && <span className="ml-1 font-normal text-muted">({t('compare_approx', { amount: f.money(entry.display.amount, entry.display.currency) })})</span>}
              </span>
            ) : (
              <span className="text-muted">{t('card_no_price')}</span>
            )}
            {cost && (
              <span className="inline-flex items-center gap-1 text-muted">
                <Truck className="size-3.5" />
                {cost.shipping.status === 'free' ? t('compare_shipping_free') : cost.shipping.status === 'known' ? t('compare_shipping', { amount: f.money(cost.shipping.amount!, cost.currency) }) : t('compare_missing_shipping')}
                {cost.shipping.quote?.source === 'user' && <span className="italic">({t('compare_shipping_user')})</span>}
              </span>
            )}
            {cost?.tax.status === 'included' && <span className="text-muted">{t('compare_tax_included')}</span>}
            <span className="text-muted">{t(`availability_${offer.availability}`)}</span>
            {offer.condition !== 'unknown' && offer.condition !== 'new' && <Badge tone="warn">{t(`condition_${offer.condition}`)}</Badge>}
          </div>
          {cost && (
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
              {cost.complete ? (
                <span className="tabular font-bold text-fg">
                  {t('compare_total')}: {f.money(cost.knownTotal, cost.currency)}
                  {entry.comparable?.approximate && <span className="ml-1 font-normal text-muted">{t('compare_approx', { amount: f.money(entry.comparable.amount, entry.comparable.currency) })}</span>}
                </span>
              ) : (
                <span className="text-warn">
                  <b>{t('compare_total_incomplete')}</b> — {cost.missing.map((m) => t(`compare_missing_${m}` as 'compare_missing_shipping')).join(', ')}
                </span>
              )}
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
            {elig && (
              <span className={cn(elig === 'ineligible' && 'text-danger', elig === 'unknown' && 'text-warn')}>
                {elig === 'domestic' ? t('elig_domestic', { country: delivery }) : elig === 'international' ? t('elig_international', { country: delivery }) : elig === 'ineligible' ? t('elig_ineligible', { country: delivery }) : t('elig_unknown', { country: delivery })}
              </span>
            )}
            <span>· {offer.lastVerifiedAt ? t('compare_verified_at', { time: f.relative(offer.lastVerifiedAt) }) : offer.source === 'manual' ? t('source_manual_entry') : t('badge_stale')}</span>
            {offer.matchReasons
              .filter((r) => r.startsWith('conflict:'))
              .slice(0, 3)
              .map((r) => (
                <Badge key={r} tone="warn">
                  {t(`conflict_${r.slice(9)}` as 'conflict_storage')}
                </Badge>
              ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Button size="sm" variant={isCheapest ? 'savings' : 'secondary'} icon={<ExternalLink className="size-3.5" />} onClick={() => openExternal(offer.url)} disabled={!offer.url}>
            {compact ? '' : t('act_view_deal')}
          </Button>
          <div className="relative">
            <IconButton label={t('act_edit')} size="sm" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
              <MoreHorizontal className="size-4" />
            </IconButton>
            {menu && (
              <div role="menu" className="absolute right-0 z-20 mt-1 w-56 rounded-2xl border border-line bg-surface p-1 shadow-[var(--shadow-lift)] animate-pop-in" onMouseLeave={() => setMenu(false)}>
                <MenuItem icon={<Truck className="size-4" />} onClick={() => (setMenu(false), onAddShipping())}>
                  {t('compare_enter_shipping')}
                </MenuItem>
                <MenuItem icon={<Bell className="size-4" />} onClick={() => (setMenu(false), openDashboard(`/item/${item.id}?section=alerts`))}>
                  {t('compare_set_alert')}
                </MenuItem>
                {!entry.isOriginal && (
                  <MenuItem
                    icon={<Star className="size-4" />}
                    onClick={async () => {
                      setMenu(false);
                      await setPrimaryOffer(item.id, offer.id);
                      toast.show(t('settings_saved'));
                    }}
                  >
                    {t('compare_make_primary')}
                  </MenuItem>
                )}
                {!entry.isOriginal && (
                  <MenuItem
                    danger
                    icon={<Trash2 className="size-4" />}
                    onClick={async () => {
                      setMenu(false);
                      if (await confirm({ title: t('compare_remove_offer'), body: offer.retailerName, confirmLabel: t('act_remove'), cancelLabel: t('act_cancel'), danger: true })) await deleteOffer(offer.id);
                    }}
                  >
                    {t('compare_remove_offer')}
                  </MenuItem>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function MenuItem({ icon, children, onClick, danger }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={cn('flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] font-medium hover:bg-surface-2', danger ? 'text-danger' : 'text-fg')}>
      {icon}
      {children}
    </button>
  );
}

function SearchLinks({ item, mode, compact }: { item: WishlistItem; mode: ComparisonMode; compact: boolean }) {
  const { t, f, settings } = useApp();
  const query = buildQuery(item);
  const retailers = RETAILERS.filter((r) => r.searchUrl)
    .filter((r) => {
      const local = r.country === settings.shoppingCountry;
      if (mode === 'local' && !local) return false;
      if (mode === 'global' && local) return false;
      return deliveryEligibility(r, r.country, settings.deliveryCountry) !== 'ineligible';
    })
    .sort((a, b) => Number(b.country === settings.deliveryCountry) - Number(a.country === settings.deliveryCountry) || Number(a.launchPriority !== 'launch') - Number(b.launchPriority !== 'launch'))
    .slice(0, compact ? 6 : 12);
  return (
    <section>
      <h3 className="mb-1 flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-muted uppercase">
        <Search className="size-3.5" /> {t('compare_search_links')}
      </h3>
      <p className="mb-2 text-[12px] text-muted">{t('compare_search_links_hint')}</p>
      <div className="flex flex-wrap gap-1.5">
        {retailers.map((r) => (
          <button key={r.id} type="button" onClick={() => openExternal(searchLink(r, query))} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-semibold text-fg hover:border-lilac-400 hover:bg-accent-soft">
            {r.name}
            {r.country && <span className="font-normal text-muted">· {r.country}</span>}
          </button>
        ))}
        <button type="button" onClick={() => openExternal(`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(query)}&gl=${settings.deliveryCountry.toLowerCase()}`)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2.5 py-1 text-[12px] font-semibold text-muted hover:text-fg">
          <Globe className="size-3.5" /> {t('compare_search_web')}
        </button>
      </div>
      {!retailers.length && <p className="text-[12px] text-muted">{f.country(settings.shoppingCountry)}: —</p>}
    </section>
  );
}

function CloudOffers({ item, mode }: { item: WishlistItem; mode: ComparisonMode }) {
  const { t, settings } = useApp();
  const toast = useToast();
  const cloud = useCloudState();
  const [state, setState] = useState<{ loading: boolean; offers: ProviderOffer[]; error?: string; provider?: string } | null>(null);
  if (!cloud.configured || !cloud.signedIn) {
    return (
      <div className="flex items-start gap-2 rounded-2xl border border-dashed border-line px-3 py-2.5 text-[12.5px] text-muted">
        <CloudOff className="mt-0.5 size-4 shrink-0" />
        <span>
          <b className="text-fg">{t('compare_cloud_title')}.</b> {t('compare_cloud_not_configured')}
        </span>
      </div>
    );
  }
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[12px] font-bold tracking-wide text-muted uppercase">{t('compare_cloud_title')}</h3>
        <Button
          size="sm"
          icon={<Search className="size-3.5" />}
          loading={state?.loading}
          onClick={async () => {
            setState({ loading: true, offers: [] });
            try {
              const res = await searchProviderOffers(settings, { query: buildQuery(item), gtin: item.identifiers.gtin, brand: item.brand, mode });
              setState({ loading: false, offers: res.offers, provider: res.providers.join(', '), error: res.errors.join('; ') || undefined });
            } catch (err) {
              setState({ loading: false, offers: [], error: err instanceof Error ? err.message : String(err) });
            }
          }}
        >
          {t('compare_button')}
        </Button>
      </div>
      {state?.loading && <Spinner label={t('state_loading_compare')} />}
      {state?.error && <p className="text-[12.5px] text-danger">{t('compare_cloud_error', { error: state.error })}</p>}
      {state && !state.loading && <p className="mb-2 text-[12px] text-muted">{t('compare_cloud_results', { count: state.offers.length, provider: state.provider ?? '—' })}</p>}
      <div className="flex flex-col gap-2">
        {state?.offers.map((po) => {
          const m = matchProducts(item, { title: po.title, brand: po.brand, identifiers: { gtin: po.gtin, mpn: po.mpn }, variant: {}, condition: po.condition });
          return (
            <Card key={po.url} className="flex items-center gap-3 p-3">
              <ProductImage src={po.imageUrl} alt={po.title} className="size-12 border border-line p-1" rounded="rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{po.title}</p>
                <p className="text-[12px] text-muted">
                  {po.retailerName} · {po.price} {po.currency}
                </p>
              </div>
              {m.confidence && <ConfidenceBadge confidence={m.confidence} />}
              <Button
                size="sm"
                onClick={async () => {
                  const res = draftFromInput({ title: po.title, url: po.url, price: po.price, currency: po.currency, imageUrl: po.imageUrl, condition: po.condition, brand: po.brand, gtin: po.gtin, mpn: po.mpn, retailerName: po.retailerName, retailerCountry: po.retailerCountry ?? undefined });
                  if (!res.ok) return;
                  res.draft.methods = ['retailer_adapter'];
                  res.draft.retailer = { ...retailerInfoForUrl(po.url, po.retailerName), id: po.retailerId ?? null, country: po.retailerCountry ?? null };
                  if (po.shipping) res.draft.shippingQuotes = [{ destinationCountry: settings.deliveryCountry, amount: po.shipping.amount, currency: po.shipping.currency, source: 'provider' }];
                  await addDraftAsOffer(item.id, res.draft, settings, { source: 'cloud_provider', match: m });
                  toast.show(t('compare_offer_saved'));
                }}
              >
                {t('compare_save_offer')}
              </Button>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function AddOfferDialog({ open, onClose, item }: { open: boolean; onClose: () => void; item: WishlistItem }) {
  const { t, settings } = useApp();
  const toast = useToast();
  const [v, setV] = useState({ url: '', retailer: '', country: settings.shoppingCountry, price: '', currency: settings.displayCurrency, shipping: '', taxIncluded: true });
  const [error, setError] = useState<string | null>(null);
  const currencies = useMemo(() => currencyOptions(settings.language), [settings.language]);
  const countries = useMemo(() => countryOptions(settings.language), [settings.language]);
  async function save() {
    const price = parseNumberInput(v.price);
    const shipping = parseNumberInput(v.shipping);
    const res = draftFromInput({ title: item.title, url: v.url, price: Number.isNaN(price) ? null : price, currency: v.currency, brand: item.brand, model: item.model, retailerName: v.retailer || undefined, retailerCountry: v.country, condition: item.condition });
    if (!res.ok || price === null || Number.isNaN(price)) {
      setError(res.ok ? t('field_invalid_price') : t(Object.values(res.errors)[0] as 'field_required'));
      return;
    }
    const d = res.draft;
    d.identifiers = { ...item.identifiers };
    d.variant = { ...item.variant };
    d.taxIncluded = v.taxIncluded;
    if (shipping !== null && !Number.isNaN(shipping)) d.shippingQuotes = [{ destinationCountry: settings.deliveryCountry, amount: shipping, currency: v.currency, source: 'user' }];
    await addDraftAsOffer(item.id, d, settings, { source: 'manual', match: { confidence: 'high', score: 0.8, reasons: [], conflicts: [], titleSimilarity: 1 } });
    toast.show(t('compare_offer_saved'));
    onClose();
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('offer_form_title')}
      footer={
        <>
          <Button onClick={onClose}>{t('act_cancel')}</Button>
          <Button variant="primary" onClick={() => void save()}>
            {t('compare_save_offer')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[12.5px] text-muted">{t('offer_form_hint')}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('field_url')} className="col-span-2" error={error}>
          {(p) => <Input {...p} type="url" placeholder="https://" value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} />}
        </Field>
        <Field label={t('field_retailer')}>{(p) => <Input {...p} value={v.retailer} onChange={(e) => setV({ ...v, retailer: e.target.value })} />}</Field>
        <Field label={t('offer_retailer_country')}>
          {(p) => (
            <Select {...p} value={v.country} onChange={(e) => setV({ ...v, country: e.target.value })}>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('field_price')}>{(p) => <Input {...p} inputMode="decimal" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} />}</Field>
        <Field label={t('field_currency')}>
          {(p) => (
            <Select {...p} value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value })}>
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('offer_shipping_cost', { country: settings.deliveryCountry })} hint={t('offer_shipping_unknown')} className="col-span-2">
          {(p) => <Input {...p} inputMode="decimal" value={v.shipping} onChange={(e) => setV({ ...v, shipping: e.target.value })} />}
        </Field>
        <Checkbox className="col-span-2" checked={v.taxIncluded} onChange={(c) => setV({ ...v, taxIncluded: c })} label={t('offer_tax_included')} />
      </div>
    </Dialog>
  );
}

function ShippingDialog({ offer, onClose }: { offer: RetailerOffer | null; onClose: () => void }) {
  const { t, f, settings } = useApp();
  const [value, setValue] = useState('');
  if (!offer) return null;
  const currency = offer.currency ?? settings.displayCurrency;
  return (
    <Dialog
      open
      onClose={onClose}
      title={t('compare_enter_shipping')}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>{t('act_cancel')}</Button>
          <Button
            variant="primary"
            onClick={async () => {
              const n = parseNumberInput(value);
              if (Number.isNaN(n)) return;
              await setUserShippingQuote(offer.id, { destinationCountry: settings.deliveryCountry, amount: n, currency });
              onClose();
            }}
          >
            {t('act_save')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[12.5px] text-muted">{t('offer_shipping_hint')}</p>
      <Field label={`${t('offer_shipping_cost', { country: f.country(settings.deliveryCountry) })} (${currency})`} hint={t('offer_shipping_unknown')}>
        {(p) => <Input {...p} autoFocus inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />}
      </Field>
    </Dialog>
  );
}

export function ComparisonEmpty() {
  const { t } = useApp();
  return <EmptyState icon={<Search className="size-7" />} title={t('compare_pick_item')} body={t('compare_subtitle')} />;
}
