// @vitest-environment node
/**
 * Runs the real Supabase migration in PGlite (PostgreSQL compiled to WASM) with a minimal
 * stand-in for Supabase's `auth` schema and roles, then proves Row Level Security keeps
 * every user's wishlist private.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
let db: PGlite;

async function as(user: string | null, sql: string, params: unknown[] = []) {
  await db.exec(user ? `set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);` : `set role anon; select set_config('request.jwt.claim.sub', '', false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role;');
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users values ('${A}', 'a@example.com'), ('${B}', 'b@example.com');
  `);
  await db.exec(readFileSync(join(process.cwd(), 'supabase/migrations/20261109000000_wishsnag_init.sql'), 'utf8'));

  const now = new Date().toISOString();
  await as(A, `insert into public.collections (id, name, updated_at) values ('c1', 'Gift Ideas', '${now}')`);
  await as(A, `insert into public.wishlist_items (id, title, priority, status, created_at, updated_at, source_url) values ('i1', 'Secret gift', 'high', 'wanted', '${now}', '${now}', 'https://shop.example/p')`);
  await as(A, `insert into public.collection_items (collection_id, wishlist_item_id) values ('c1', 'i1')`);
  await as(A, `insert into public.retailer_offers (id, wishlist_item_id, product_url, price, currency, updated_at) values ('o1', 'i1', 'https://shop.example/p', 349, 'AUD', '${now}')`);
  await as(A, `insert into public.price_observations (id, offer_id, wishlist_item_id, price, currency, source, observed_at) values ('ob1', 'o1', 'i1', 349, 'AUD', 'save', '${now}')`);
  await as(A, `insert into public.price_alerts (id, wishlist_item_id, alert_type, updated_at) values ('al1', 'i1', 'below_target', '${now}')`);
  await as(A, `insert into public.notifications (id, type, title, message, dedupe_key, created_at) values ('n1', 'below_target', 't', 'm', 'k1', '${now}')`);
});

const TABLES = ['collections', 'wishlist_items', 'collection_items', 'retailer_offers', 'price_observations', 'price_alerts', 'notifications'];

describe('cloud schema & row level security', () => {
  it('owners can read their own rows (user_id defaults to auth.uid())', async () => {
    for (const t of TABLES) {
      const r = await as(A, `select user_id from public.${t}`);
      expect(r.rows, t).toHaveLength(1);
      expect((r.rows[0] as { user_id: string }).user_id).toBe(A);
    }
  });

  it("another user can't see any of them", async () => {
    for (const t of TABLES) expect((await as(B, `select * from public.${t}`)).rows, t).toHaveLength(0);
  });

  it("another user can't update or delete them", async () => {
    const upd = await as(B, `update public.wishlist_items set title = 'pwned' where id = 'i1'`);
    expect(upd.affectedRows).toBe(0);
    const del = await as(B, `delete from public.retailer_offers where id = 'o1'`);
    expect(del.affectedRows).toBe(0);
    expect((await as(A, `select title from public.wishlist_items where id = 'i1'`)).rows[0]).toEqual({ title: 'Secret gift' });
  });

  it("can't insert rows on someone else's behalf", async () => {
    await expect(as(B, `insert into public.wishlist_items (id, user_id, title, created_at, updated_at) values ('x', '${A}', 'x', now(), now())`)).rejects.toThrow(/row-level security/);
  });

  it("can't attach offers or observations to another user's item", async () => {
    await expect(as(B, `insert into public.retailer_offers (id, wishlist_item_id, updated_at) values ('o2', 'i1', now())`)).rejects.toThrow(/foreign key/);
  });

  it("can't move a row to another user by updating user_id", async () => {
    await expect(as(A, `update public.collections set user_id = '${B}' where id = 'c1'`)).rejects.toThrow(/row-level security/);
  });

  it('anonymous visitors get no access at all', async () => {
    await expect(as(null, 'select * from public.wishlist_items')).rejects.toThrow(/permission denied/);
  });

  it('the shared catalog is read-only for users', async () => {
    expect((await as(A, 'select * from public.canonical_products')).rows).toHaveLength(0);
    await expect(as(A, `insert into public.canonical_products (title) values ('x')`)).rejects.toThrow(/permission denied|row-level security/);
  });

  it('validates data with constraints', async () => {
    await expect(as(A, `insert into public.wishlist_items (id, title, priority, created_at, updated_at) values ('bad', 'x', 'urgent', now(), now())`)).rejects.toThrow(/check constraint/);
    await expect(as(A, `insert into public.price_observations (id, offer_id, wishlist_item_id, price, currency, source, observed_at) values ('neg', 'o1', 'i1', -1, 'AUD', 'save', now())`)).rejects.toThrow(/check constraint/);
    await expect(as(A, `insert into public.wishlist_items (id, title, created_at, updated_at, source_url) values ('js', 'x', now(), now(), 'javascript:alert(1)')`)).rejects.toThrow(/check constraint/);
  });

  it('maintains the server_updated_at sync cursor', async () => {
    const before = (await as(A, `select server_updated_at from public.collections where id = 'c1'`)).rows[0] as { server_updated_at: Date };
    await new Promise((r) => setTimeout(r, 15));
    await as(A, `update public.collections set name = 'Gifts' where id = 'c1'`);
    const after = (await as(A, `select server_updated_at from public.collections where id = 'c1'`)).rows[0] as { server_updated_at: Date };
    expect(after.server_updated_at.getTime()).toBeGreaterThan(before.server_updated_at.getTime());
  });

  it('deleting an account removes all of its data (cascade)', async () => {
    await db.exec(`delete from auth.users where id = '${A}'`);
    for (const t of TABLES) expect((await db.query(`select * from public.${t}`)).rows, t).toHaveLength(0);
  });
});
