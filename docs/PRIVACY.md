# WishSnag Privacy Policy

_Last updated: 9 November 2026 · Applies to WishSnag version 0.1.0_

WishSnag is a wishlist, price-tracking and price-comparison browser extension. We built it to be
**local-first**: by default, everything stays in your browser.

## What WishSnag stores, and where

| Data | Where | Why |
|---|---|---|
| Products you save (name, brand, image link, product link, identifiers, variants) | Your browser (IndexedDB) | Your wishlist |
| Prices WishSnag observes, with time and source | Your browser | Price history, drops, alerts |
| Collections, tags, notes, target prices, priorities, budget | Your browser | Organising your wishlist |
| Settings (countries, currency, language, theme, alert preferences, optional delivery location) | Your browser (chrome.storage) | Personalisation and comparisons |
| Exchange rates | Your browser | Approximate currency conversion |

Nothing above leaves your device unless **you** turn on optional cloud sync.

## What WishSnag reads from web pages

- WishSnag reads a page **only** when you ask it to (toolbar button, right-click menu, keyboard
  shortcut), or on stores you explicitly allow in Chrome's permission prompt.
- It reads **product information the page publishes** (structured product data, metadata, and the
  visible product price/title). It does **not** read forms, passwords, payment details, messages,
  or your account pages, and it never collects cookies or authentication tokens.
- Price checks fetch product pages **without your cookies**, so stores don't see them as you.
- WishSnag does not track your browsing. It only recognises pages you've already saved, and only
  on stores you allowed.

## Network requests WishSnag makes

| Request | When | What is sent |
|---|---|---|
| Product pages you saved | Price checks on stores you allowed | A normal page request, no cookies |
| `cdn.jsdelivr.net` / `currency-api.pages.dev` | Once a day | Nothing about you — downloads public exchange rates |
| Product images | When displaying your wishlist | Image request to the store's image server (no referrer) |
| Your Supabase project | Only if you enable cloud sync | Your synced wishlist data, over HTTPS |

## Optional cloud sync

If you sign in (with an email code), your wishlist data is stored in the Supabase project
configured in the extension, protected by row-level security so only your account can access it.
You can sync, sign out, or **delete your cloud account and all its data** from Settings.
If you enable email alerts, your email address is used to send price alerts.

## What we never do

- No selling or sharing of personal data. No advertising trackers or analytics in the extension.
- No changing, adding or rewriting affiliate links. WishSnag opens the store link you saved.
- No automatic purchasing or checkout.
- No bypassing of logins, captchas or anti-bot protections.

## Your controls

- **Export** everything (JSON) or your wishlist (CSV): Settings → Your data.
- **Delete** all local data: Settings → Your data → Delete all WishSnag data (or remove the extension).
- **Revoke** store access: Settings → Store access, or Chrome's extension settings.

## Contact

Questions or requests: please contact the publisher listed on the Chrome Web Store page.
