// POST /functions/v1/monitor-prices  (called by pg_cron; see supabase/schedule.example.sql)
// Server-side price monitoring for signed-in users who enabled it — works while Chrome is closed.
// Respects stores: gentle pacing per host, no cookies, and long back-off when a store blocks checks.
import { HttpError, adminClient, env, handle, json } from '../_shared/http.ts';
import { looksBlocked, readPagePrice } from '../_shared/jsonldPrice.ts';
import { isSafePublicUrl } from '../_shared/safeUrl.ts';

const MAX_PER_RUN = 40;
const HOST_GAP_MS = 3000;
const HOUR = 3600_000;

interface OfferRow {
  user_id: string;
  id: string;
  wishlist_item_id: string;
  product_url: string;
  price: number | null;
  currency: string | null;
  availability: string | null;
  check_failures: number;
  data: Record<string, unknown>;
}

Deno.serve(
  handle(async (req) => {
    if (req.headers.get('x-cron-secret') !== env('CRON_SECRET')) throw new HttpError(401, 'Unauthorized');
    const db = adminClient();
    const now = new Date();
    const { data: due, error } = await db
      .from('retailer_offers')
      .select('user_id,id,wishlist_item_id,product_url,price,currency,availability,check_failures,data')
      .eq('monitor_enabled', true)
      .is('deleted_at', null)
      .lte('next_check_at', now.toISOString())
      .not('product_url', 'is', null)
      .order('next_check_at', { ascending: true })
      .limit(MAX_PER_RUN);
    if (error) throw error;

    const lastByHost = new Map<string, number>();
    const results: { id: string; status: string }[] = [];
    for (const offer of (due ?? []) as OfferRow[]) {
      if (!isSafePublicUrl(offer.product_url)) {
        // Never fetch internal/private addresses supplied by users (SSRF guard); stop checking it.
        await db.from('retailer_offers').update({ monitor_enabled: false }).eq('user_id', offer.user_id).eq('id', offer.id);
        results.push({ id: offer.id, status: 'unsafe_url' });
        continue;
      }
      const host = new URL(offer.product_url).hostname;
      const wait = HOST_GAP_MS - (Date.now() - (lastByHost.get(host) ?? 0));
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastByHost.set(host, Date.now());
      const intervalH = Number((offer.data?.check as { intervalHours?: number } | undefined)?.intervalHours ?? 12);
      try {
        const res = await fetch(offer.product_url, { redirect: 'follow', headers: { accept: 'text/html' } });
        if (!isSafePublicUrl(res.url || offer.product_url)) throw new Error('Redirected to a non-public address');
        const html = (await res.text()).slice(0, 3_000_000);
        if (looksBlocked(html, res.status)) {
          await db.from('retailer_offers').update({ check_failures: offer.check_failures + 1, next_check_at: new Date(Date.now() + Math.max(24, intervalH * 2 ** offer.check_failures) * HOUR).toISOString(), updated_at: new Date().toISOString() }).eq('user_id', offer.user_id).eq('id', offer.id);
          results.push({ id: offer.id, status: 'blocked' });
          continue;
        }
        const found = res.ok ? readPagePrice(html) : null;
        const savedGtin = (offer.data?.identifiers as { gtin?: string } | undefined)?.gtin;
        if (!found || (savedGtin && found.gtin && savedGtin.replace(/^0+/, '') !== found.gtin.replace(/^0+/, ''))) {
          await db.from('retailer_offers').update({ check_failures: offer.check_failures + 1, next_check_at: new Date(Date.now() + intervalH * 2 * HOUR).toISOString() }).eq('user_id', offer.user_id).eq('id', offer.id);
          results.push({ id: offer.id, status: res.ok ? 'no_price' : `http_${res.status}` });
          continue;
        }
        const observedAt = new Date().toISOString();
        await db.from('price_observations').insert({ user_id: offer.user_id, id: `ob_cloud_${crypto.randomUUID()}`, offer_id: offer.id, wishlist_item_id: offer.wishlist_item_id, price: found.price, currency: found.currency, availability: found.availability, source: 'cloud_monitor', observed_at: observedAt });
        // Keep the client-shaped record in `data` complete so synced devices get a valid offer.
        const prevHistory = offer.data?.history as { currency?: string; firstPrice?: number; firstAt?: number; minPrice?: number; maxPrice?: number; count?: number; lastChangeAt?: number | null } | null | undefined;
        const sameCur = prevHistory && prevHistory.currency === found.currency;
        const history = sameCur
          ? { ...prevHistory, minPrice: Math.min(prevHistory!.minPrice ?? found.price, found.price), maxPrice: Math.max(prevHistory!.maxPrice ?? found.price, found.price), previousPrice: offer.price, lastChangeAt: offer.price !== found.price ? Date.now() : (prevHistory!.lastChangeAt ?? null), count: (prevHistory!.count ?? 0) + 1 }
          : { currency: found.currency, firstPrice: found.price, firstAt: Date.now(), minPrice: found.price, maxPrice: found.price, previousPrice: null, lastChangeAt: null, count: 1 };
        const data = { ...offer.data, price: found.price, currency: found.currency, availability: found.availability, lastVerifiedAt: Date.now(), updatedAt: Date.now(), history };
        await db
          .from('retailer_offers')
          .update({ price: found.price, currency: found.currency, availability: found.availability, verified_at: observedAt, check_failures: 0, next_check_at: new Date(Date.now() + intervalH * HOUR).toISOString(), data, updated_at: observedAt })
          .eq('user_id', offer.user_id)
          .eq('id', offer.id);
        await evaluateAlerts(db, offer, found);
        results.push({ id: offer.id, status: 'ok' });
      } catch (err) {
        await db.from('retailer_offers').update({ check_failures: offer.check_failures + 1, next_check_at: new Date(Date.now() + intervalH * 2 * HOUR).toISOString() }).eq('user_id', offer.user_id).eq('id', offer.id);
        results.push({ id: offer.id, status: `error: ${err instanceof Error ? err.message : String(err)}` });
      }
    }
    return json({ checked: results.length, results });
  }),
);

type Db = ReturnType<typeof adminClient>;

/** Server-side subset of the extension's alert rules: target price, % drop and back-in-stock. */
async function evaluateAlerts(db: Db, offer: OfferRow, found: { price: number; currency: string; availability: string }) {
  const { data: item } = await db.from('wishlist_items').select('id,title,target_price,target_currency,status,archived,data').eq('user_id', offer.user_id).eq('id', offer.wishlist_item_id).maybeSingle();
  if (!item || item.status === 'purchased' || item.archived) return;
  if ((item.data as { primaryOfferId?: string })?.primaryOfferId !== offer.id) return;
  const { data: alerts } = await db.from('price_alerts').select('id,alert_type,threshold,enabled,last_triggered_price,data').eq('user_id', offer.user_id).eq('wishlist_item_id', item.id).eq('enabled', true);
  const events: { type: string; title: string; message: string; key: string; alertId: string }[] = [];
  const money = (n: number) => `${found.currency} ${n.toLocaleString('en', { maximumFractionDigits: 2 })}`;
  const saved = Number((offer.data?.history as { firstPrice?: number } | undefined)?.firstPrice ?? offer.price ?? found.price);
  for (const a of alerts ?? []) {
    const armed = (a.data as { armed?: boolean } | null)?.armed !== false;
    if (a.alert_type === 'below_target' && item.target_price !== null && (item.target_currency ?? found.currency) === found.currency && found.price <= Number(item.target_price) && armed) {
      events.push({ type: 'below_target', alertId: a.id, title: 'That’s a snag!', message: `${item.title} just hit your target price: ${money(found.price)}.`, key: `below_target:${offer.id}:${found.currency}:${Math.round(found.price * 100)}` });
    }
    if (a.alert_type === 'percent_drop' && found.price < saved) {
      const base = a.last_triggered_price !== null ? Number(a.last_triggered_price) : saved;
      const pct = ((base - found.price) / base) * 100;
      if (found.price < base && pct >= Number(a.threshold ?? 10)) events.push({ type: 'percent_drop', alertId: a.id, title: 'Your wishlist just got cheaper!', message: `Your saved ${item.title} dropped from ${money(base)} to ${money(found.price)}. You could save ${money(base - found.price)}.`, key: `percent_drop:${offer.id}:${found.currency}:${Math.round(found.price * 100)}` });
    }
    if (a.alert_type === 'back_in_stock' && ['out_of_stock', 'discontinued'].includes(offer.availability ?? '') && ['in_stock', 'limited'].includes(found.availability)) {
      events.push({ type: 'back_in_stock', alertId: a.id, title: 'Back in stock!', message: `${item.title} is available again.`, key: `back_in_stock:${offer.id}:${Date.now()}` });
    }
  }
  if (!events.length) return;
  const { data: prefs } = await db.from('user_preferences').select('email_alerts').eq('user_id', offer.user_id).maybeSingle();
  const emailTo = prefs?.email_alerts ? (await db.auth.admin.getUserById(offer.user_id)).data.user?.email : undefined;
  for (const e of events) {
    const createdAt = new Date().toISOString();
    const id = `nt_cloud_${crypto.randomUUID()}`;
    const record = { id, itemId: item.id, offerId: offer.id, kind: e.type, title: e.title, message: e.message, ctaLabel: 'View Deal', url: offer.product_url, dedupeKey: e.key, createdAt: Date.now(), readAt: null, desktopStatus: 'sent' };
    const { error } = await db.from('notifications').insert({ user_id: offer.user_id, id, wishlist_item_id: item.id, type: e.type, title: e.title, message: e.message, dedupe_key: e.key, created_at: createdAt, data: record });
    if (error) continue; // unique (user_id, dedupe_key) → already notified
    const alertData = ((alerts ?? []).find((x) => x.id === e.alertId)?.data ?? {}) as Record<string, unknown>;
    await db
      .from('price_alerts')
      .update({ last_triggered_at: createdAt, last_triggered_price: found.price, updated_at: createdAt, data: { ...alertData, armed: e.type === 'below_target' ? false : (alertData.armed ?? true), lastTriggeredAt: Date.now(), lastTriggeredPrice: found.price, updatedAt: Date.now() } })
      .eq('user_id', offer.user_id)
      .eq('id', e.alertId);
    if (emailTo && Deno.env.get('RESEND_API_KEY')) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: Deno.env.get('ALERT_FROM_EMAIL') ?? 'WishSnag <alerts@example.com>', to: emailTo, subject: e.title, text: `${e.message}\n\n${offer.product_url}\n\nYou can turn off email alerts in WishSnag → Settings → Cloud sync.` }),
      }).catch(() => undefined);
      await db.from('notifications').update({ emailed_at: new Date().toISOString() }).eq('user_id', offer.user_id).eq('dedupe_key', e.key);
    }
  }
}
