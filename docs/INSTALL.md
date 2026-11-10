# Installing and using WishSnag (beginner-friendly)

This guide assumes no developer experience. It takes about 10 minutes.

## 1. Install Node.js (one time)

WishSnag is built from source with Node.js.

1. Go to **https://nodejs.org** and download the **LTS** version (20 or newer).
2. Run the installer and accept the defaults.
3. Check it worked — open a terminal (macOS: *Terminal*; Windows: *PowerShell*; Linux: your
   terminal app) and type:

```bash
node --version
```

You should see something like `v22.x.x`.

## 2. Get the project and install its dependencies

1. Put the `wishsnag` folder somewhere convenient (for example your Documents folder).
2. In the terminal, go into that folder. Example (adjust the path to where you put it):

```bash
cd ~/Documents/wishsnag
```

3. Install the dependencies (downloads the libraries WishSnag uses; needs internet):

```bash
npm install
```

## 3. Build WishSnag

```bash
npm run build
```

This creates a folder called **`dist`** — that folder *is* the Chrome extension.

## 4. Load it into Google Chrome

1. Open Chrome and type **`chrome://extensions`** in the address bar, then press Enter.
2. Turn on **Developer mode** (switch in the top-right corner).
3. Click **Load unpacked** (top-left).
4. Choose the **`dist`** folder inside the `wishsnag` folder and click *Select*.
5. WishSnag appears in the list. Click the **puzzle-piece icon** in Chrome's toolbar and the
   **pin** next to WishSnag so its icon is always visible.

A welcome page opens automatically. Pick:
- **Country of residence**, **preferred shopping market**, **delivery country** — these can all
  be different (e.g. live in Australia, shop in Bangladesh, deliver to family in Dhaka);
- **display currency** and **language** (English or বাংলা).

## 5. Save your first product

On any product page (any online store):

- Click the **WishSnag icon** → **Snag to Wishlist**, check the details, then **Snag to Wishlist**
  again. Or
- **Right-click** the page → **Snag to Wishlist** (opens the side panel), or
- Press **Alt + Shift + S**.

WishSnag reads the product details the page publishes. If it can't find something it leaves the
field empty (it never makes details up) — you can type it in. On pages that aren't product pages,
you can still add a product manually.

## 6. Open your dashboard

Click the WishSnag icon → **Open Dashboard**. From there you can browse your wishlist, organise
**Collections**, see **Price Drops**, use **Find It Cheaper**, view **Price History**, read
**Shopping Insights** and change **Settings**.

The **side panel** (WishSnag icon → **Open Side Panel**) stays open beside the store while you
shop: it shows the product on the current page, your target price, alerts and comparisons.

## 7. Turn on automatic price checks (optional, per store)

WishSnag only reads pages when you click it — unless you allow a store:

1. Open an item in the dashboard → **Automatic price checks**.
2. Switch it on for the listing and click **Allow** when Chrome asks for access to that store.

Checks run about every 12 hours (change it in **Settings → Price checks**) **while Chrome is
open**. To keep monitoring while Chrome is closed, set up the optional cloud backend
([CLOUD.md](CLOUD.md)).

## 8. Test price alerts

- **Settings → Alerts & notifications → Send a test notification** shows a sample desktop
  notification (clearly labelled as a test).
- To test a real alert on an item: set a **target price** on the item, then use
  **Record a price** on the item page and enter a price at or below the target (this is saved in
  the price history as “Entered by you”). You'll get a “That's a snag!” notification and it
  appears in the notification bell.
- Real alerts otherwise come only from genuine price observations (background checks, revisiting
  the page, or your own recorded prices).

If you see no desktop pop-up: check **quiet hours** (on by default 22:00–08:00 — alerts wait
until they end) and your operating system's notification settings for Chrome.

## 9. Optional integrations

- **Exchange rates** load automatically once a day from a free public dataset (no key).
- **Cloud sync, server-side monitoring, email alerts and live eBay offers** need your own
  Supabase project — see [CLOUD.md](CLOUD.md). WishSnag works fully without it.

## Updating after code changes

```bash
npm run build
```

Then open `chrome://extensions` and click the **reload** (↻) icon on the WishSnag card.

## Troubleshooting

| Problem | What to do |
|---|---|
| “WishSnag can't read this kind of page” | Chrome doesn't let extensions read browser pages, the Chrome Web Store or PDFs. Add the product manually. |
| Side panel says “Let WishSnag see this store?” | Click the WishSnag toolbar icon on the page (one-time read) or **Allow on …** for automatic detection on that store. |
| Price check says “The store blocked the automated check” | Some stores block automated requests. WishSnag backs off for a day. Open the product page with the side panel to record the price. |
| Converted prices are missing | Exchange rates couldn't load (offline?). Try **Settings → Exchange rates → Refresh rates**. |
| `npm` is not recognised | Restart the terminal after installing Node.js. |

## For developers

```bash
npm run check        # type-check + lint + unit tests + production build
npm run test:e2e     # builds a test variant and runs the Playwright end-to-end suite
npm run dev          # rebuilds dist/ on every change (then reload the extension)
npm run package      # creates release/wishsnag-<version>.zip for the Chrome Web Store
```
