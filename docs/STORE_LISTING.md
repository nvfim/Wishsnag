# Chrome Web Store listing (draft)

**Name:** WishSnag — Wishlist & Price Tracker
**Summary (≤132 chars):** Wishlist it. Wait for it. Snag it. Save products from any store, track real prices, get drop alerts and compare offers.
**Category:** Shopping · **Language:** English (Bangla UI included, beta)

## Description

All your wants. One place. Better prices.

WishSnag is a universal wishlist for every online store. Save products from any shopping site,
organise them into collections, set target prices, and let WishSnag tell you when something you
want genuinely gets cheaper.

• Snag to Wishlist from the toolbar, right-click menu, side panel or Alt+Shift+S
• Works on any site — reads the product details stores publish, or add products manually
• Real price history — every point is an actual observed price, never simulated
• Smart alerts: target price, % or amount drops, lowest in N days, back in stock, cheaper offer
• Find It Cheaper — compare offers for the same product with honest delivered totals
  (unknown delivery or import costs are shown as incomplete, never guessed)
• Local, Global and All Deals; separate residence, shopping market and delivery country
• Built for Australia and Bangladesh first, usable worldwide — AUD, BDT and all ISO currencies,
  English and বাংলা
• Collections, tags, notes, priorities, budgets and shopping insights
• Dark and light mode
• Private by default: your wishlist stays in your browser; optional cloud sync

WishSnag never buys anything for you, never changes affiliate links, and never bypasses store
logins or protections.

## Assets

- Icon: `public/icons/icon-128.png` · Promo tile 440×280: `assets/store/promo-440x280.png`
- Screenshots 1280×800: `assets/store/screenshots/` (captured from the real extension with
  synthetic fixture stores — replace with real-store captures before publishing if preferred)

## Permission justifications

| Permission | Justification |
|---|---|
| `activeTab` | Read the product on the current tab only when the user clicks WishSnag, the context menu or the shortcut. |
| `scripting` | Inject the on-demand product reader into that tab (no always-on content scripts). |
| `storage`, `unlimitedStorage` | Store the user's wishlist and price history locally. |
| `alarms` | Schedule optional price checks, exchange-rate refresh and quiet-hour notification delivery. |
| `notifications` | Price-drop and target-price alerts. |
| `contextMenus` | “Snag to Wishlist” in the right-click menu. |
| `sidePanel` | Shopping companion panel beside the store. |
| Optional host permissions | Requested per store, only when the user enables automatic price checks or auto-detection for that store. |

**Single purpose:** save products into a personal wishlist and track/compare their prices.
**Remote code:** none. **Data use:** see [PRIVACY.md](PRIVACY.md) — no sale or transfer of user data.
