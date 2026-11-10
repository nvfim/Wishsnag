-- WishSnag optional cloud backend — initial schema.
--
-- Design:
--  * Every user-owned table has (user_id, id) as its primary key, user_id defaulting to
--    auth.uid(), and Row Level Security that only ever exposes the caller's own rows.
--  * Client-generated ids (local-first) are kept, so offline edits sync without remapping.
--  * `data jsonb` keeps the complete client record for lossless sync; typed columns
--    are what the server (monitoring, email alerts) and indexes use.
--  * `server_updated_at` is set by a trigger and is the sync cursor; `deleted_at` is a
--    soft-delete marker so other devices learn about deletions.
--  * canonical_products / product_variants / retailers are a shared catalog: readable by
--    signed-in users, writable only by server-side functions (service role).

-- gen_random_uuid() is built into PostgreSQL 13+; no extension needed.

-- ------------------------------------------------------------------ helpers

create or replace function public.ws_touch_server_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.server_updated_at := now();
  return new;
end $$;

-- ------------------------------------------------------------------ shared catalog

create table public.retailers (
  id text primary key check (id ~ '^[a-z0-9-]{2,60}$'),
  name text not null,
  country char(2),
  currency char(3) not null,
  domains text[] not null default '{}',
  capabilities jsonb not null default '{}',
  delivery jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.canonical_products (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 300),
  brand text,
  model text,
  gtin14 char(14) unique check (gtin14 ~ '^[0-9]{14}$'),
  mpn text,
  category text,
  created_at timestamptz not null default now()
);
create index canonical_products_brand_model_idx on public.canonical_products (lower(brand), lower(model));

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.canonical_products (id) on delete cascade,
  colour text,
  size text,
  capacity text,
  regional_model text,
  specifications jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique nulls not distinct (product_id, colour, size, capacity, regional_model)
);

-- ------------------------------------------------------------------ users

create table public.user_preferences (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  residence_country char(2) check (residence_country ~ '^[A-Z]{2}$'),
  shopping_country char(2) check (shopping_country ~ '^[A-Z]{2}$'),
  delivery_country char(2) check (delivery_country ~ '^[A-Z]{2}$'),
  preferred_currency char(3) check (preferred_currency ~ '^[A-Z]{3}$'),
  language text check (language in ('en', 'bn')),
  theme text check (theme in ('system', 'light', 'dark')),
  email_alerts boolean not null default false,
  settings jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ wishlist data

create table public.collections (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 300),
  emoji text,
  color text,
  budget numeric(14, 2) check (budget >= 0),
  budget_currency char(3),
  sort_order integer not null default 0,
  data jsonb not null default '{}',
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create table public.wishlist_items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  product_variant_id uuid references public.product_variants (id) on delete set null,
  title text not null check (char_length(title) between 1 and 300),
  brand text,
  model text,
  gtin14 char(14) check (gtin14 ~ '^[0-9]{14}$'),
  source_retailer text,
  source_url text check (source_url is null or source_url = '' or source_url ~* '^https?://'),
  saved_price numeric(14, 2) check (saved_price >= 0),
  currency char(3),
  target_price numeric(14, 2) check (target_price >= 0),
  target_currency char(3),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  notes text not null default '' check (char_length(notes) <= 2000),
  status text not null default 'wanted' check (status in ('wanted', 'purchased')),
  archived boolean not null default false,
  data jsonb not null default '{}',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);
create index wishlist_items_gtin_idx on public.wishlist_items (user_id, gtin14);

create table public.collection_items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  collection_id text not null,
  wishlist_item_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, collection_id, wishlist_item_id),
  foreign key (user_id, collection_id) references public.collections (user_id, id) on delete cascade,
  foreign key (user_id, wishlist_item_id) references public.wishlist_items (user_id, id) on delete cascade
);

create table public.retailer_offers (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  wishlist_item_id text not null,
  product_variant_id uuid references public.product_variants (id) on delete set null,
  retailer_id text,
  retailer_name text,
  retailer_country char(2),
  product_url text check (product_url is null or product_url = '' or product_url ~* '^https?://'),
  price numeric(14, 2) check (price >= 0),
  currency char(3),
  shipping_cost numeric(14, 2) check (shipping_cost >= 0),
  availability text,
  condition text,
  match_confidence text check (match_confidence in ('source', 'verified_exact', 'high', 'possible', 'different_variant')),
  verified_at timestamptz,
  monitor_enabled boolean not null default false,
  next_check_at timestamptz,
  check_failures integer not null default 0,
  data jsonb not null default '{}',
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id),
  foreign key (user_id, wishlist_item_id) references public.wishlist_items (user_id, id) on delete cascade
);
create index retailer_offers_item_idx on public.retailer_offers (user_id, wishlist_item_id);
create index retailer_offers_due_idx on public.retailer_offers (next_check_at) where monitor_enabled and deleted_at is null;

create table public.price_observations (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  offer_id text not null,
  wishlist_item_id text not null,
  price numeric(14, 2) not null check (price >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  availability text not null default 'unknown',
  source text not null check (source in ('save', 'page_visit', 'background_check', 'manual_refresh', 'manual_entry', 'import', 'cloud_monitor', 'provider')),
  observed_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id),
  foreign key (user_id, offer_id) references public.retailer_offers (user_id, id) on delete cascade
);
create index price_observations_offer_time_idx on public.price_observations (user_id, offer_id, observed_at);

create table public.price_alerts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  wishlist_item_id text not null,
  alert_type text not null check (alert_type in ('below_target', 'percent_drop', 'amount_drop', 'lowest_in_period', 'cheaper_offer', 'back_in_stock')),
  threshold numeric(14, 2) check (threshold >= 0),
  period_days integer check (period_days between 1 and 3650),
  enabled boolean not null default true,
  last_triggered_at timestamptz,
  last_triggered_price numeric(14, 2),
  data jsonb not null default '{}',
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id),
  foreign key (user_id, wishlist_item_id) references public.wishlist_items (user_id, id) on delete cascade
);

create table public.notifications (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  wishlist_item_id text,
  type text not null,
  title text not null,
  message text not null,
  dedupe_key text not null,
  created_at timestamptz not null,
  read_at timestamptz,
  emailed_at timestamptz,
  data jsonb not null default '{}',
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id),
  unique (user_id, dedupe_key)
);

-- Sync cursors
create index collections_sync_idx on public.collections (user_id, server_updated_at);
create index wishlist_items_sync_idx on public.wishlist_items (user_id, server_updated_at);
create index retailer_offers_sync_idx on public.retailer_offers (user_id, server_updated_at);
create index price_observations_sync_idx on public.price_observations (user_id, server_updated_at);
create index price_alerts_sync_idx on public.price_alerts (user_id, server_updated_at);
create index notifications_sync_idx on public.notifications (user_id, server_updated_at);

do $$
declare t text;
begin
  foreach t in array array['user_preferences', 'collections', 'wishlist_items', 'retailer_offers', 'price_observations', 'price_alerts', 'notifications'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.ws_touch_server_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- ------------------------------------------------------------------ row level security

alter table public.retailers enable row level security;
alter table public.canonical_products enable row level security;
alter table public.product_variants enable row level security;
alter table public.user_preferences enable row level security;
alter table public.collections enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.collection_items enable row level security;
alter table public.retailer_offers enable row level security;
alter table public.price_observations enable row level security;
alter table public.price_alerts enable row level security;
alter table public.notifications enable row level security;

-- Catalog: read-only for signed-in users; writes only via the service role (bypasses RLS).
create policy "catalog readable" on public.retailers for select to authenticated using (true);
create policy "catalog readable" on public.canonical_products for select to authenticated using (true);
create policy "catalog readable" on public.product_variants for select to authenticated using (true);

-- Private data: owners only. `(select auth.uid())` is evaluated once per statement.
do $$
declare t text;
begin
  foreach t in array array['user_preferences', 'collections', 'wishlist_items', 'collection_items', 'retailer_offers', 'price_observations', 'price_alerts', 'notifications'] loop
    execute format('create policy "owner select" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "owner insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "owner update" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "owner delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Anonymous visitors get nothing.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on public.user_preferences, public.collections, public.wishlist_items, public.collection_items, public.retailer_offers, public.price_observations, public.price_alerts, public.notifications to authenticated;
grant select on public.retailers, public.canonical_products, public.product_variants to authenticated;
