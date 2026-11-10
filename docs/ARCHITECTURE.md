# WishSnag architecture

```
┌──────────────────────── Chrome (Manifest V3) ─────────────────────────┐
│  Popup (React)      Side panel (React)       Dashboard (React, hash   │
│  popup.html         sidepanel.html           router) dashboard.html   │
│        │                   │                         │                │
│        └──── typed runtime messages (src/services/messages.ts) ───┐   │
│                                                                   ▼   │
│  Background service worker (background.js, ES module, event-driven)   │
│   • context menus, keyboard command, notifications & clicks           │
│   • chrome.alarms: price checks (hourly tick, per-offer schedule),    │
│     exchange rates (12 h), held-notification flush (15 min)           │
│   • on-demand page reading via chrome.scripting + content/extractor.js│
│   • passive observation when you revisit a saved page (allowed stores)│
│                                                                       │
│  IndexedDB (Dexie, shared by all contexts) + chrome.storage.local     │
└───────────────────────────────────────────────────────────────────────┘
          │ optional, opt-in
          ▼
  Supabase: Postgres + RLS · Auth (email OTP) · Edge Functions
  (compare-offers → eBay Browse API · monitor-prices (pg_cron) · delete-account)
```

## Source layout

| Path | Purpose |
|---|---|
| `src/core/` | Pure, framework-free domain logic (fully unit-tested). |
| `src/core/extraction/` | Raw page signals → product + offer. `domCollector` (live DOM), `htmlString` (service worker, no DOMParser), `jsonld`, `extractProduct` (layered merge). |
| `src/core/matching/` | Text normalisation (Bengali digits, Bangla dictionary + phonetic transliteration), GTIN check digits, model numbers, variant attributes, confidence levels, duplicate detection. |
| `src/core/pricing/` | Price parsing, currency formatting (Intl, ISO 4217 minor units), money maths in minor units, exchange rates, total-cost model, comparison engine. |
| `src/core/history/` | Stats (first/latest/low/high/average), ranges, data-backed insights. |
| `src/core/alerts/` | Alert rules (pure), quiet hours / digest / cooldown decisions, notification copy. |
| `src/core/retailers/` | Retailer registry with truthful per-capability status, adapters, delivery eligibility. |
| `src/core/geo/` | ISO countries → currency, AU states, BD divisions/districts/zones, address formats. |
| `src/core/i18n/` | English + Bangla dictionaries (Bangla typed against English keys). |
| `src/db/` | Dexie schema, repository (CRUD, observations, alerts, notifications, import/merge), settings store. |
| `src/services/` | Messaging, permissions, price checks, alert dispatch, exchange-rate refresh, page fetch for URL imports. |
| `src/background/` | Service worker entry and tab extraction. |
| `src/content/extractor.ts` | IIFE injected on demand; reads the page, returns JSON. |
| `src/ui/` | Design tokens (Tailwind v4), components, hooks (live queries), app context. |
| `src/pages/` | Popup, side panel, dashboard (routes). |
| `src/cloud/` | Optional Supabase client (lazy-loaded), OTP auth, sync engine. |
| `supabase/` | Migration (schema + RLS), Edge Functions, cron example. |

## Key design decisions

- **On-demand, least-privilege page access.** No always-on content scripts. `activeTab` +
  `scripting` read the current page after a user action; `optional_host_permissions` are requested
  per store only when the user enables monitoring/auto-detection.
- **One extraction pipeline, two collectors.** The DOM collector (content script) and the HTML
  string collector (service worker) produce the same `RawPageData`, so extraction logic is shared
  and tested once. Background checks accept **structured prices only**.
- **Honest comparisons.** `computeTotalCost` = price + applicable shipping + mandatory tax not
  included + import charges − verified discounts. Unknown mandatory parts → *incomplete*.
  `compareOffers` ranks only fresh, deliverable, exact/high-confidence matches with complete
  totals, and words the headline as “Lowest verified total among N compared offers”.
- **Genuine history only.** Observations come from saves, page visits, background/cloud checks,
  store APIs, or explicit manual entries (labelled). Identical consecutive observations within an
  hour are collapsed; nothing is interpolated or simulated.
- **Alert deduplication** at two levels: rule state (armed/last-triggered price) and dedupe keys
  on notifications; plus per-item desktop cooldown, quiet hours and daily digest.
- **Denormalised offer stats** (`offer.history`) keep the wishlist grid fast with hundreds of
  items without loading every observation.
- **Global by design.** No market is hard-coded: country/currency come from onboarding (guessed
  from time zone/language only as defaults), currencies are ISO 4217 via `Intl`, and AU/BD get
  first-class region data, retailers, fixtures and tests.
- **Local-first, cloud optional.** Sync is last-write-wins on `updatedAt` with tombstones for
  deletions and a server-maintained `server_updated_at` cursor.

## Price monitoring lifecycle

1. Save → offer gets `check.enabled` (if monitoring is on and the price came from the page) and
   `nextCheckAt = now + interval`.
2. Hourly alarm → `runScheduledChecks`: due offers (index on `check.nextCheckAt`), max 20 per run,
   3 s spacing per store, skips stores without permission.
3. `checkOffer` → fetch without cookies → bot-challenge detection (403/429/503/captcha) →
   24 h+ store back-off → structured extraction → `acceptObservedPrice` (GTIN guard) →
   `recordObservation` → `processObservation` (alert rules + cheaper-offer rule) → dispatch.
4. Failures back off exponentially (capped at 7 days).
