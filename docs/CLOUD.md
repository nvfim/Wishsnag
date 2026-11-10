# Optional cloud backend (Supabase)

WishSnag is **local-first**: saving products, collections, target prices, local price checks,
comparisons of offers you've saved, alerts, import/export — all work with **no account**.

The optional backend adds:

| Feature | How |
|---|---|
| Cross-device sync & cloud backup | OTP email sign-in → last-write-wins sync of items, offers, price history, collections, alerts, notifications |
| Monitoring while Chrome is closed | `monitor-prices` Edge Function on a `pg_cron` schedule |
| Email alerts | `monitor-prices` sends via [Resend](https://resend.com) when the user enables it |
| Live store offers (eBay) | `compare-offers` Edge Function calling the official eBay Browse API |
| Account & data deletion | `delete-account` Edge Function (cascades all rows) |

> **Status:** schema + Row Level Security are tested (PGlite, see `tests/unit/cloud-rls.test.ts`);
> Edge Functions are type-checked and their helpers unit-tested with Deno
> (`supabase/functions/tests`). The full flow has **not** been run against a live Supabase
> project or live eBay/Resend accounts in this build — do that before relying on it.

## 1. Create the project

1. Create a free project at **https://supabase.com** → note the **Project URL** and the
   **anon public key** (Project Settings → API).
2. Install the Supabase CLI (https://supabase.com/docs/guides/cli) and log in:

```bash
npx supabase login
```

3. Link this folder to your project (the project ref is in the URL):

```bash
npx supabase link --project-ref <your-project-ref>
```

## 2. Create the database schema

```bash
npx supabase db push
```

This applies `supabase/migrations/20261109000000_wishsnag_init.sql`: tables, constraints,
indexes, sync triggers and Row Level Security (users can only ever access their own rows).

Enable **Email OTP** sign-in: Authentication → Providers → Email (keep "Confirm email" on).
Make sure the email template includes the `{{ .Token }}` code (WishSnag asks for the 6-digit code).

## 3. Deploy the Edge Functions

```bash
npx supabase functions deploy compare-offers
```

```bash
npx supabase functions deploy monitor-prices --no-verify-jwt
```

```bash
npx supabase functions deploy delete-account
```

(`monitor-prices` is called by the scheduler with a shared secret instead of a user token.)

## 4. Set server-side secrets (never put these in the extension)

```bash
npx supabase secrets set CRON_SECRET=<a-long-random-string>
```

Optional — live eBay offers (create an app at https://developer.ebay.com, production keyset):

```bash
npx supabase secrets set EBAY_CLIENT_ID=<app-id> EBAY_CLIENT_SECRET=<cert-id>
```

Optional — email alerts via Resend (verified sending domain required):

```bash
npx supabase secrets set RESEND_API_KEY=<key> ALERT_FROM_EMAIL="WishSnag <alerts@yourdomain.com>"
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions
automatically by Supabase.

## 5. Schedule server-side monitoring

Store the project URL and the same `CRON_SECRET` in Vault, then run
[`supabase/schedule.example.sql`](../supabase/schedule.example.sql) in the SQL editor. It calls
`monitor-prices` every 3 hours; each run checks up to 40 due listings with per-store pacing and
back-off when a store blocks requests.

## 6. Connect the extension

Either enter the values in **WishSnag → Settings → Cloud sync** (Project URL + anon key), or
bake them into your build:

```bash
cp .env.example .env.local
```

…then edit `.env.local` and rebuild (`npm run build`). The anon key is public by design; the
service-role key must **never** be put in the extension.

Then: Settings → Cloud sync → enter email → **Email me a sign-in code** → enter the code →
**Sync now**.

## Data model (summary)

`user_preferences`, `collections`, `wishlist_items`, `collection_items`, `retailer_offers`,
`price_observations`, `price_alerts`, `notifications` (all private, RLS-protected, keyed by
`(user_id, id)`), plus a shared read-only catalog: `retailers`, `canonical_products`,
`product_variants` (writable only by the service role).
