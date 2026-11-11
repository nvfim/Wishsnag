# WishSnag — implemented vs planned, and final audit

_Version 0.1.0 · audit date 9 November 2026_

**Legend:** ✅ implemented & automatically tested · 🟢 implemented, exercised manually/indirectly
· 🟡 implemented, **not verified against the live service** · 🗓 planned · ❌ not possible / out of scope

## How this build was verified

| Check | Result |
|---|---|
| `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) | ✅ 0 errors |
| ESLint (typescript-eslint + react-hooks) | ✅ 0 problems |
| Vitest unit + component tests | ✅ **144 passed** (10 files) |
| Playwright end-to-end, real unpacked extension in Chromium | ✅ **8 passed** (7 scenarios + axe accessibility scan); 1 opt-in screenshot spec |
| Deno: Edge Functions type-check + helper tests | ✅ 3 functions checked, **5 tests passed** |
| RLS: real migration in PostgreSQL (PGlite) | ✅ 11 tests (inside the 144) |
| Production build + Web Store zip | ✅ `release/wishsnag-0.1.0.zip` (~0.9 MB) |

**Environment limitation:** this build machine had **no network access to retailer websites,
exchange-rate hosts, eBay, Supabase or Resend**. All store pages in tests are **synthetic
fixtures** served locally (clearly labelled in `tests/fixtures/pages`). Nothing here claims a live
store works until verified.

## Phase 1 — Functional MVP

| Feature | Status | Evidence |
|---|---|---|
| Manifest V3, service worker (ES module), popup, side panel, dashboard | ✅ | E2E loads `dist-e2e`; no console errors |
| Branding, logo (SVG), icons 16/32/48/128 + store art | ✅ | `assets/brand`, `public/icons`, `assets/store` |
| Save current product (toolbar popup / side panel / right-click / Alt+Shift+S) | 🟢 | Extraction path E2E-tested via side panel; popup/context-menu/shortcut call the same `tab:extract` but rely on Chrome's `activeTab` grant, which Playwright can't trigger (toolbar & context-menu clicks aren't automatable) |
| Layered metadata extraction (JSON-LD → microdata → OG → adapters → visible hints → manual) | ✅ | `tests/unit/extraction.test.ts` (AU, BD-English, BD-Bangla, UK, microdata, variants, lists, XSS) |
| Review/correct before saving; heuristic fields flagged | ✅ | component tests + E2E |
| Manual product entry | ✅ | Scenario E |
| Persistent local wishlist (IndexedDB) incl. after browser restart | ✅ | Scenario C restarts Chrome with the same profile |
| Collections (create/rename/emoji/colour/budget/delete, quick-start) | ✅ | DB tests + Scenario C |
| Search (instant, Bangla-aware), filters (category/brand/store/priority/target/in-stock/drop/status/collection), 8 sorts | 🟢 | `filterAndSort` unit-covered via summaries; UI exercised in screenshots |
| Product details page (overview, pricing stats, chart, comparison, alerts, monitoring, notes, purchased/archive/delete, edit, record price) | ✅ | Scenario A + screenshots |
| Target prices | ✅ | Scenario A/B |
| Country of residence / shopping market / delivery country / currency / language / delivery location — independent | ✅ | Scenario C, settings tests |
| Currency preferences, locale-aware formatting (ISO 4217 via Intl) | ✅ | pricing tests (AUD, BDT incl. Bengali digits & lakh grouping, GBP, USD, JPY, KWD) |
| CSV / JSON import & export (formula-injection safe, validated, orphan-safe) | ✅ | misc-core + db tests |
| Notification infrastructure (in-app centre, badge, desktop) | ✅ | db tests; E2E checks in-app notifications (headless Chrome can't display OS pop-ups) |
| Dark & light mode | ✅ | screenshots + axe in both themes |

## Phase 2 — Price intelligence

| Feature | Status | Notes |
|---|---|---|
| Modular retailer registry (truthful per-capability status) + adapters | ✅ | 47 retailers; nothing marked Operational |
| Product identity matching (GTIN check digits, MPN, model numbers, storage/RAM/colour/size/generation/condition, Pro/Max lines, regional models, Bangla) | ✅ | `matching.test.ts` |
| AU & BD retailer integration research | ✅ | [RETAILERS.md](RETAILERS.md) |
| ≥1 genuine comparison integration per priority market | 🟡/❌ | **AU:** eBay Browse API (`EBAY_AU`) implemented server-side, needs credentials, not live-tested. **BD:** no public product API is known for Daraz/Star Tech/Ryans/Pickaboo etc. — comparisons use offers you capture from real BD pages, plus store search links. This requirement is **not met by a live API** for Bangladesh. |
| Verified offer retrieval | 🟢 | From pages the user opens (with GTIN guard); background re-verification on allowed stores |
| Price comparison, delivery-aware totals, tax handling, honest headline | ✅ | `pricing.test.ts`, E2E “Find It Cheaper” |
| Currency conversion with dated source | 🟡 | Parsing/conversion/fallback tested with mocked responses and the real dataset format; **live fetch from extension not verified** (relies on jsDelivr CORS) |
| Price observations, history chart (7D/30D/90D/6M/1Y/All), stats, insights | ✅ | history tests; Scenario A |
| Price-drop logic | ✅ | alert tests |
| Comparison caching | 🟢 | Local comparisons are computed instantly from stored offers; a provider cache table exists for cloud results (the client UI doesn't persist provider results yet — “Save Offer” stores chosen ones) |

## Phase 3 — Imports & alerts

| Feature | Status | Notes |
|---|---|---|
| Wishlist import from an open page (ItemList data + product-card detection), preview, select, duplicates, results | ✅ | E2E import scenario. Private retailer wishlists behind login are **not** read (by design). Retailer-specific wishlist parsers: 🗓 |
| Product-link (URL list) import with per-store permission | 🟢 | Implemented in dashboard; not E2E-tested (Chrome permission prompt can't be automated) |
| Duplicate detection (same listing / same product; variants kept separate) | ✅ | db + matching tests |
| Automatic price checks (alarms, pacing, back-off, permission-aware) | ✅ | db tests + Scenario A |
| Passive observation when revisiting saved pages | 🟢 | Side-panel path E2E-covered; tab-update listener path untested |
| Price-drop / target / back-in-stock / lowest-in-period / cheaper-offer alerts | ✅ | rules + db tests + E2E |
| Quiet hours, daily digest, per-item cooldown, dedupe | ✅ | unit + db tests |

## Phase 4 — Cloud (optional)

| Feature | Status | Notes |
|---|---|---|
| Schema, constraints, indexes, triggers, RLS | ✅ | PGlite tests prove isolation, no cross-user linking, anon denied, cascade delete |
| Email OTP sign-in, sync engine (LWW + tombstones) | 🟡 | Mapping/merge unit-tested; **not run against a live Supabase project** |
| Scheduled server monitoring (`monitor-prices` + pg_cron) | 🟡 | Type-checked; parser + SSRF guard tested; not deployed |
| Email alerts (Resend) | 🟡 | Implemented, untested |
| Live eBay offers (`compare-offers`) | 🟡 | Response mapping tested with a mocked API shaped per eBay docs |
| Account & data deletion | 🟡 | Function implemented; cascade verified in SQL |

## Phase 5 — Polish

| Feature | Status | Notes |
|---|---|---|
| Accessibility (labels, roles, focus, reduced motion, contrast) | ✅ | axe-core: 0 serious/critical on dashboard, wishlist, settings, onboarding, insights, popup, item detail — light & dark |
| Performance (lazy images, deferred search, “show more” pagination, denormalised stats, lazy-loaded Supabase, bounded background work) | 🟢 | Not load-tested with 1,000+ items; no list virtualisation yet |
| Bengali localisation | 🟢 | Complete key coverage (tested) — **drafted by the dev team, needs native copy-editing** |
| Further languages | 🗓 | Add a dictionary in `src/core/i18n/` |
| Chrome Web Store assets & listing copy | ✅ | `assets/store/`, [STORE_LISTING.md](STORE_LISTING.md) |
| Privacy policy | ✅ | [PRIVACY.md](PRIVACY.md) |

## Unsupported / planned retailer integrations

- **Amazon** (all marketplaces): live offers need Associates API approval → 🗓.
- **All Bangladeshi retailers**: no public product/search APIs known → live offers ❌ (page capture + search links only).
- **AU non-marketplace retailers** (JB Hi-Fi, Harvey Norman, …): live offers need affiliate/licensed feeds → ❌ today.
- **Retailer adapters** (Daraz, Star Tech): selectors written without live verification.
- **Search links**: retailer search URL formats were not verified live; a generic “Search the web” link is always offered.

## Security review

| Area | Assessment |
|---|---|
| Permissions | Minimal required set; host access only via optional per-store grants. `optional_host_permissions: https://*/*, http://*/*` must be justified in Web Store review. |
| Untrusted page data | Tags stripped, entities decoded, lengths capped; only http(s) URLs stored/rendered/fetched; React escaping; no `dangerouslySetInnerHTML`; strict extension CSP. |
| Messaging | Background accepts runtime messages only from WishSnag's own extension pages. |
| Secrets | None in the extension. Supabase anon key is public by design; service-role, eBay, Resend and cron secrets live in Edge Function secrets. |
| Cookies / auth | Price checks use `credentials: 'omit'`; no cookies/tokens collected; no login or captcha bypass. |
| CSV export | Formula injection neutralised. |
| Server SSRF | `monitor-prices` refuses non-public hosts and re-checks redirect targets. **Residual risk:** DNS rebinding (a public name resolving to a private IP) is not fully preventable at this layer; Supabase Edge runtime isolation is the backstop. |
| Rate limiting | Edge Function limiter is per-instance (best effort); add platform-level limits for production. |
| Images | Product images load from store CDNs (IP visible to the store); `referrerPolicy=no-referrer`. |

## Potential performance issues

- Summaries are recomputed in memory for every list render; fine for hundreds of items, consider
  virtualisation and memoised per-item summaries beyond ~2,000.
- `checkDuplicates` loads all items/offers per save (O(n)); fine for personal wishlists.
- The dashboard bundle (~430 KB gzip across chunks, Recharts + fonts) loads in an extension page
  from disk; the popup and side panel share chunks — could be split further.
- Background runs are bounded (20 checks/run, 3 s per store) to stay within MV3 lifetimes.

## Required release work (before publishing)

1. Verify extraction on real AU and BD product pages; promote verified capabilities to *Operational*
   in the registry; fix/verify the Daraz and Star Tech adapters and search URLs.
2. Verify exchange-rate fetching from the installed extension (CORS) on Windows/macOS Chrome.
3. Deploy the Supabase backend to a staging project; test OTP sign-in, two-device sync, server
   monitoring, email alerts, account deletion; obtain and test eBay credentials.
4. Native Bangla copy review.
5. Manual QA of toolbar popup snag, right-click menu, keyboard shortcut, side-panel auto-open,
   and OS-level desktop notifications on Windows, macOS and ChromeOS.
6. Publisher details, support contact and a hosted copy of the privacy policy for the Web Store;
   permission justifications (see [STORE_LISTING.md](STORE_LISTING.md)).
7. Decide on affiliate/licensed data partnerships for live offers (with clear disclosure — WishSnag
   currently never modifies links).
