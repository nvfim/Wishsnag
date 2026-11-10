# Retailer integrations

WishSnag works on **any** shopping website — you can always save a product manually. What
differs per store is how much WishSnag can do *automatically*. This page is the honest map.

> **Verification note (important).** This build was developed in an environment with **no
> network access to retailer websites**. Every retailer capability below is therefore marked
> at most **Partial**: it relies on WishSnag's generic, tested extraction layers, not on a
> per-site check against the live store. Nothing is marked *Operational* until it has been
> verified against the real site or API. See [STATUS.md](STATUS.md).

## How product data is obtained (legitimate sources only)

| Layer | Source | Used for | Trust |
|---|---|---|---|
| 1 | schema.org **JSON-LD** (`Product`, `ProductGroup`, `Offer`, `AggregateOffer`, `ItemList`, `BreadcrumbList`) | name, brand, GTIN/MPN, price, currency, stock, condition, shipping, variants | Structured — accepted for price history |
| 2 | schema.org **microdata** (`itemprop`) | same as above | Structured |
| 3 | **Open Graph / product meta** tags (`product:price:amount`, …) | title, image, price, stock | Structured |
| 4 | **Retailer adapters** — CSS selectors for a few stores (`src/core/retailers/adapters.ts`) | fills gaps when structured data is missing | Heuristic — flagged “please check” |
| 5 | **Visible page hints** — prices near the product title | shown as *suggestions* the user can tap | Heuristic — never auto-trusted for monitoring |
| — | **Manual entry** | anything else | Marked “entered by you” |

Rules enforced in code (`src/services/monitorService.ts → acceptObservedPrice`):
- Background checks record a price **only** from structured data (or from the same retailer
  adapter that captured the item), and never if the page now shows a different GTIN.
- WishSnag never logs in, never sends your cookies (`credentials: 'omit'`), never solves or
  bypasses captchas, and **backs off for ≥ 24 h** when a store blocks automated requests.
- Store access is opt-in per store (Chrome optional host permissions).

## Status legend

| Status | Meaning |
|---|---|
| ✅ Operational | Implemented and verified against the live site/API. *(none yet — see note above)* |
| 🟣 Partial | Works through generic mechanisms; accuracy depends on what the store publishes. |
| 🔑 Needs credentials | Implemented server-side; needs the operator's API keys (e.g. eBay). |
| 🗓 Planned | On the roadmap; not implemented. |
| — Unsupported | No legitimate data access method known to WishSnag today. |
| ⛔ Unavailable | Set at runtime when a store blocks checks (back-off in effect). |

## Support matrix (generated from `src/core/retailers/registry.ts`)

Regenerate with `node scripts/retailer-table.mjs`.

### Australia (16)

| Store | Country | Saving products | Price/stock checks | Live offers (API) | Search link | Delivery coverage (registry) | Prices incl. tax |
|---|---|---|---|---|---|---|---|
| Amazon Australia | AU | 🟣 Partial | 🟣 Partial | 🗓 Planned | Yes | Domestic only | Yes |
| eBay Australia | AU | 🟣 Partial | 🟣 Partial | 🔑 Needs credentials | Yes | Domestic; international not confirmed | Yes |
| JB Hi-Fi | AU | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic only | Yes |
| Harvey Norman | AU | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic only | Yes |
| The Good Guys | AU | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic only | Yes |
| Officeworks | AU | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic only | Yes |
| THE ICONIC | AU | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic; international not confirmed | Yes |
| Myer | AU | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic; international not confirmed | Yes |
| David Jones | AU | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic; international not confirmed | Yes |
| Kmart Australia | AU | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic only | Yes |
| Target Australia | AU | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic only | Yes |
| BIG W | AU | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic only | Yes |
| Nike Australia | AU | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic only | Yes |
| adidas Australia | AU | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic only | Yes |
| ASOS (Australia) | AU | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic only | Yes |
| UNIQLO Australia | AU | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic only | Yes |

### Bangladesh (12)

| Store | Country | Saving products | Price/stock checks | Live offers (API) | Search link | Delivery coverage (registry) | Prices incl. tax |
|---|---|---|---|---|---|---|---|
| Daraz Bangladesh | BD | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic only | Yes |
| Pickaboo | BD | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic only | Yes |
| Rokomari | BD | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic; international not confirmed | Yes |
| Star Tech | BD | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic only | Yes |
| Ryans Computers | BD | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic only | Yes |
| Gadget & Gear | BD | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic only | Yes |
| Aarong | BD | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic; international not confirmed | Yes |
| Othoba | BD | 🟣 Partial | 🟣 Partial | — Unsupported | — | Domestic only | Yes |
| AjkerDeal | BD | 🟣 Partial | 🟣 Partial | — Unsupported | — | Domestic only | Yes |
| Techland BD | BD | 🟣 Partial | 🟣 Partial | — Unsupported | — | Domestic only | Yes |
| Apple Gadgets | BD | 🟣 Partial | 🟣 Partial | — Unsupported | — | Domestic only | Yes |
| Chaldal | BD | 🟣 Partial | 🟣 Partial | — Unsupported | — | Domestic only | Yes |

### International (23)

| Store | Country | Saving products | Price/stock checks | Live offers (API) | Search link | Delivery coverage (registry) | Prices incl. tax |
|---|---|---|---|---|---|---|---|
| Amazon.com | US | 🟣 Partial | 🟣 Partial | 🗓 Planned | Yes | Domestic; international not confirmed | No (added at checkout) |
| Amazon UK | GB | 🟣 Partial | 🟣 Partial | 🗓 Planned | Yes | Domestic; international not confirmed | Yes |
| Amazon India | IN | 🟣 Partial | 🟣 Partial | 🗓 Planned | Yes | Domestic only | Yes |
| Amazon Canada | CA | 🟣 Partial | 🟣 Partial | 🗓 Planned | Yes | Domestic; international not confirmed | No (added at checkout) |
| Amazon Germany | DE | 🟣 Partial | 🟣 Partial | 🗓 Planned | Yes | Domestic; international not confirmed | Yes |
| Amazon Japan | JP | 🟣 Partial | 🟣 Partial | 🗓 Planned | Yes | Domestic; international not confirmed | Yes |
| Amazon Singapore | SG | 🟣 Partial | 🟣 Partial | 🗓 Planned | Yes | Domestic; international not confirmed | Yes |
| Amazon UAE | AE | 🟣 Partial | 🟣 Partial | 🗓 Planned | Yes | Domestic; international not confirmed | Yes |
| eBay (US) | US | 🟣 Partial | 🟣 Partial | 🔑 Needs credentials | Yes | Domestic; international not confirmed | No (added at checkout) |
| eBay UK | GB | 🟣 Partial | 🟣 Partial | 🔑 Needs credentials | Yes | Domestic; international not confirmed | Yes |
| AliExpress | Global | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Worldwide | Varies |
| Etsy | Global | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic; international not confirmed | Varies |
| Walmart | US | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic only | No (added at checkout) |
| Best Buy | US | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic only | No (added at checkout) |
| Zalando | DE | 🟣 Partial | 🟣 Partial | — Unsupported | — | Domestic; international not confirmed | Yes |
| SHEIN | Global | 🟣 Partial | 🟣 Partial | — Unsupported | — | Domestic; international not confirmed | Varies |
| ASOS | GB | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic; international not confirmed | Yes |
| Argos | GB | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic only | Yes |
| Currys | GB | 🟣 Partial | 🟣 Partial | — Unsupported | — | Domestic only | Yes |
| Flipkart | IN | 🟣 Partial | 🟣 Partial | — Unsupported | Yes | Domestic only | Yes |
| noon | AE | 🟣 Partial | 🟣 Partial | — Unsupported | — | Domestic; international not confirmed | Yes |
| UNIQLO | Global | 🟣 Partial | 🟣 Partial | — Unsupported | — | Domestic; international not confirmed | Varies |
| Nike | Global | 🟣 Partial | 🟣 Partial | — Unsupported | — | Domestic; international not confirmed | Varies |

“Delivery coverage” is conservative registry knowledge used for comparison eligibility.
Where we are not sure, it says *not confirmed* and the comparison shows “Delivery to … not
confirmed” instead of guessing. Shipping **costs** are never invented: they come from the
page's structured data, a store API, or the delivery fee you type in from checkout.

## Research notes — priority markets

### Australia
- **Amazon Australia** — product data via Amazon's Associates/Product Advertising programme
  requires an approved Associates account and server-side keys; not implemented (*Planned*).
- **eBay Australia** — official **eBay Browse API** (`EBAY_AU` marketplace) is implemented in
  the optional backend (`supabase/functions/_shared/ebay.ts`) and needs eBay developer keys.
- **JB Hi-Fi, Harvey Norman, The Good Guys, Officeworks, THE ICONIC, Myer, David Jones,
  Kmart, Target, BIG W, Nike, adidas, ASOS, UNIQLO** — no public product APIs known to us.
  WishSnag uses the structured product data these sites publish on their pages (common on
  modern e-commerce platforms) when the *user* saves or revisits a product. Affiliate networks
  (e.g. Commission Factory, Partnerize, Rakuten) may provide licensed product feeds for some of
  these stores — a commercial agreement would be needed.
- Australian consumer law requires displayed prices to include GST, so totals for domestic
  AU offers treat GST as **included** (it is never added twice).

### Bangladesh
- **Daraz** — Daraz's Open Platform is for sellers, not for third-party price comparison.
  WishSnag reads the product page when you save it, with an adapter for the visible price
  (selectors **not verified** in this build). Marketplace prices/delivery vary by seller.
- **Star Tech, Ryans, Pickaboo, Rokomari, Gadget & Gear, Aarong, Othoba, AjkerDeal, Techland,
  Apple Gadgets, Chaldal** — no public product APIs known to us. Generic extraction + manual
  entry + store search links. A Star Tech adapter exists (selectors **not verified**).
- Many Bangladeshi pages lack structured data. In that case WishSnag still saves the product
  (you confirm the price), and records new prices **when you revisit the page** with the side
  panel open or with store access enabled — background checks need structured data.
- Delivery fees (inside/outside Dhaka) differ by store and seller: add the fee you see at
  checkout to an offer (“Add delivery cost”) to make totals comparable. Payment methods shown
  in Settings → Store support are *reported* by the retailers — confirm at checkout.

### International
- **eBay US/UK/DE/CA** — eBay Browse API (needs credentials) — used for *Global Deals*.
- **AliExpress, Etsy, Walmart, Best Buy, Zalando, SHEIN, Argos, Currys, Flipkart, noon** —
  generic extraction; affiliate/licensed feeds would be needed for live offers.

## Adding a retailer

1. Add an entry to `RETAILERS` in `src/core/retailers/registry.ts` (domains, country, currency,
   tax inclusion, delivery coverage, search URL, **truthful** capability statuses).
2. Only if the store lacks structured data: add selectors in `src/core/retailers/adapters.ts`
   with `verified: false` until you have checked them against the live site.
3. Add a fixture page under `tests/fixtures/pages/` and a test in `tests/unit/extraction.test.ts`.
4. For an official API, add a provider under `supabase/functions/_shared/` and call it from
   `compare-offers` — credentials go in Supabase secrets, never in the extension.
5. Regenerate the table above (`node scripts/retailer-table.mjs`).
