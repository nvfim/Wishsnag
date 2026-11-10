import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ComparisonMode, Condition, Settings } from '@/core/types';
import { kv } from '@/platform/storage';

/**
 * Optional cloud backend (Supabase). Everything here is opt-in: WishSnag works fully
 * without it. The project URL and anon key are public by design — data access is
 * protected by Row Level Security in supabase/migrations. No secret keys ever ship
 * in the extension; store API credentials live in Edge Function secrets.
 */
export interface CloudConfig {
  url: string;
  anonKey: string;
}

export function cloudConfig(settings: Pick<Settings, 'cloud'>): CloudConfig | null {
  const url = (settings.cloud.url || import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const anonKey = (settings.cloud.anonKey || import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!url || !anonKey || !/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(url)) return null;
  return { url, anonKey };
}

const AUTH_PREFIX = 'wishsnag.cloud.auth.';
const authStorage = {
  getItem: async (key: string) => (await kv().get<string>(AUTH_PREFIX + key)) ?? null,
  setItem: async (key: string, value: string) => kv().set({ [AUTH_PREFIX + key]: value }),
  removeItem: async (key: string) => kv().remove(AUTH_PREFIX + key),
};

let cached: { key: string; client: SupabaseClient } | null = null;

export async function getSupabase(settings: Pick<Settings, 'cloud'>): Promise<SupabaseClient | null> {
  const cfg = cloudConfig(settings);
  if (!cfg) return null;
  const key = `${cfg.url}|${cfg.anonKey}`;
  if (cached?.key === key) return cached.client;
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(cfg.url, cfg.anonKey, {
    auth: { storage: authStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
    global: { headers: { 'x-client-info': 'wishsnag-extension' } },
  });
  cached = { key, client };
  return client;
}

export async function sendOtp(settings: Settings, email: string): Promise<void> {
  const sb = await getSupabase(settings);
  if (!sb) throw new Error('Cloud is not configured');
  const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyOtp(settings: Settings, email: string, token: string): Promise<void> {
  const sb = await getSupabase(settings);
  if (!sb) throw new Error('Cloud is not configured');
  const { error } = await sb.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
  if (error) throw error;
}

export async function signOut(settings: Settings): Promise<void> {
  const sb = await getSupabase(settings);
  await sb?.auth.signOut();
}

export async function deleteCloudAccount(settings: Settings): Promise<void> {
  const sb = await getSupabase(settings);
  if (!sb) throw new Error('Cloud is not configured');
  const { error } = await sb.functions.invoke('delete-account', { method: 'POST' });
  if (error) throw error;
  await sb.auth.signOut();
}

export interface CloudState {
  configured: boolean;
  signedIn: boolean;
  email: string | null;
  loading: boolean;
}

export function useCloudState(settings?: Pick<Settings, 'cloud'>): CloudState {
  const [state, setState] = useState<CloudState>({ configured: false, signedIn: false, email: null, loading: true });
  const url = settings?.cloud.url;
  const key = settings?.cloud.anonKey;
  useEffect(() => {
    let alive = true;
    let unsub: (() => void) | undefined;
    void (async () => {
      const s = settings ?? (await import('@/db/settingsStore')).loadSettings();
      const resolved = await s;
      const sb = await getSupabase(resolved);
      if (!alive) return;
      if (!sb) return setState({ configured: false, signedIn: false, email: null, loading: false });
      const { data } = await sb.auth.getSession();
      if (!alive) return;
      setState({ configured: true, signedIn: !!data.session, email: data.session?.user.email ?? null, loading: false });
      const sub = sb.auth.onAuthStateChange((_e, session) => setState({ configured: true, signedIn: !!session, email: session?.user.email ?? null, loading: false }));
      unsub = () => sub.data.subscription.unsubscribe();
    })().catch(() => alive && setState({ configured: false, signedIn: false, email: null, loading: false }));
    return () => {
      alive = false;
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, key]);
  return state;
}

/** A live offer returned by a server-side store API (e.g. eBay Browse). */
export interface ProviderOffer {
  providerId: string;
  retailerId?: string;
  retailerName: string;
  retailerCountry?: string | null;
  title: string;
  url: string;
  imageUrl?: string;
  price: number;
  currency: string;
  shipping: { amount: number; currency: string } | null;
  condition: Condition;
  brand?: string;
  gtin?: string;
  mpn?: string;
  observedAt: number;
}

export interface ProviderSearchResult {
  offers: ProviderOffer[];
  providers: string[];
  errors: string[];
}

export async function searchProviderOffers(settings: Settings, input: { query: string; gtin?: string; brand?: string; mode: ComparisonMode }): Promise<ProviderSearchResult> {
  const sb = await getSupabase(settings);
  if (!sb) throw new Error('Cloud is not configured');
  const { data, error } = await sb.functions.invoke('compare-offers', {
    body: { query: input.query, gtin: input.gtin, brand: input.brand, mode: input.mode, shoppingCountry: settings.shoppingCountry, deliveryCountry: settings.deliveryCountry, postcode: settings.deliveryLocation.postcode },
  });
  if (error) throw error;
  const res = data as { offers?: ProviderOffer[]; providers?: { id: string; status: string; error?: string }[] };
  return {
    offers: (res.offers ?? []).filter((o) => /^https?:\/\//.test(o.url) && Number.isFinite(o.price)),
    providers: (res.providers ?? []).filter((p) => p.status === 'ok').map((p) => p.id),
    errors: (res.providers ?? []).filter((p) => p.error).map((p) => `${p.id}: ${p.error}`),
  };
}
