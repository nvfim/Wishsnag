// Shared helpers for WishSnag Edge Functions (Deno, Supabase Edge Runtime).
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}

export function env(name: string, required = true): string {
  const v = Deno.env.get(name) ?? '';
  if (required && !v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

/** Client acting as the calling user (RLS applies). */
export function userClient(req: Request): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
}

/** Service-role client — server-side only, bypasses RLS. Never exposed to the extension. */
export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

export async function requireUser(req: Request): Promise<User> {
  const { data, error } = await userClient(req).auth.getUser();
  if (error || !data.user) throw new HttpError(401, 'Not signed in');
  return data.user;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Tiny per-instance rate limiter (best effort; pair with Supabase's own limits in production). */
const buckets = new Map<string, { tokens: number; at: number }>();
export function rateLimit(key: string, perMinute: number): void {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: perMinute, at: now };
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60_000) * perMinute);
  b.at = now;
  if (b.tokens < 1) throw new HttpError(429, 'Too many requests — please try again in a minute.');
  b.tokens -= 1;
  buckets.set(key, b);
}

export function handle(fn: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    try {
      return await fn(req);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Internal error' }, 500);
    }
  };
}
