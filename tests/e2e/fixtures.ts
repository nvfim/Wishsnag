import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EXT = join(process.cwd(), 'dist-e2e');
const PAGES = join(process.cwd(), 'tests/fixtures/pages');

/** Synthetic store hostnames, resolved to the local fixture server by the test browser. */
export const HOSTS = {
  au: 'electronics.wishsnag-fixture.com.au',
  auBudget: 'budget.wishsnag-fixture.com.au',
  bd: 'tech.wishsnag-fixture.com.bd',
  uk: 'blog.wishsnag-fixture.co.uk',
} as const;

/** Local "store" serving the synthetic fixture pages; prices can be changed by tests. */
export interface FixtureStore {
  url: (page: string, host?: string) => string;
  setPrice: (page: string, price: string) => void;
  reset: () => void;
}

/** Simple vector "product photos" for screenshots (test assets only). */
export function productIllustration(path: string): string {
  const p = path.toLowerCase();
  const wrap = (body: string, bg = '#f4f1ff') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="${bg}"/>${body}</svg>`;
  if (p.includes('wh1000') || p.includes('headphone')) return wrap('<path d="M110 220v-40a90 90 0 0 1 180 0v40" fill="none" stroke="#2b2836" stroke-width="22" stroke-linecap="round"/><rect x="80" y="200" width="70" height="120" rx="30" fill="#2b2836"/><rect x="250" y="200" width="70" height="120" rx="30" fill="#2b2836"/><rect x="92" y="215" width="20" height="90" rx="10" fill="#5b566b"/>');
  if (p.includes('a55')) return wrap('<rect x="135" y="60" width="130" height="280" rx="26" fill="#1f2a5c"/><rect x="147" y="78" width="106" height="230" rx="14" fill="#3f6fd8"/><circle cx="200" cy="322" r="7" fill="#9fb4ff"/>', '#eef3ff');
  if (p.includes('overshirt')) return wrap('<path d="M140 90l60 30 60-30 70 40-25 60-30-12v152H125V178l-30 12-25-60z" fill="#9db29a"/><path d="M200 120v190" stroke="#7d9479" stroke-width="4"/>', '#f3f6f0');
  if (p.includes('lamp')) return wrap('<path d="M150 120h100l35 90H115z" fill="#f5a524"/><rect x="194" y="210" width="12" height="110" fill="#5b566b"/><rect x="140" y="318" width="120" height="16" rx="8" fill="#2b2836"/>', '#fff8e8');
  if (p.includes('switch')) return wrap('<rect x="80" y="140" width="240" height="120" rx="20" fill="#2b2836"/><rect x="60" y="140" width="40" height="120" rx="20" fill="#e8336c"/><rect x="300" y="140" width="40" height="120" rx="20" fill="#18c08a"/><rect x="110" y="155" width="180" height="90" rx="8" fill="#3b3748"/>');
  if (p.includes('kindle')) return wrap('<rect x="125" y="70" width="150" height="260" rx="18" fill="#2b2836"/><rect x="140" y="90" width="120" height="200" rx="6" fill="#eceaf0"/>');
  return wrap('<path d="M120 150h160l-12 170H132z" fill="#7c5cff"/><path d="M160 150v-20a40 40 0 0 1 80 0v20" fill="none" stroke="#7c5cff" stroke-width="14"/>');
}

const PRICE_TOKENS: Record<string, RegExp> = { 'au-headphones': /"449\.00"|\$449\.00/g, 'cheaper-headphones': /"449\.00"|\$449\.00/g, 'bd-phone': /৪৫৯৯৯/g };

function startStore(): Promise<{ server: Server; store: FixtureStore }> {
  const prices = new Map<string, string>();
  const server = createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (/\.(jpe?g|png)$/i.test(u.pathname)) {
      res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'max-age=3600' }).end(productIllustration(u.pathname));
      return;
    }
    const ALIASES: Record<string, string> = { 'products/sony-wh1000xm5-black': 'au-headphones' };
    const raw = u.pathname.replace(/^\/(p\/)?/, '').replace(/\.html$/, '');
    const name = ALIASES[raw] ?? raw;
    const file = name === 'cheaper-headphones' ? 'au-headphones.html' : `${name}.html`;
    let html: string;
    try {
      html = readFileSync(join(PAGES, file), 'utf8');
    } catch {
      res.writeHead(404).end('not found');
      return;
    }
    const price = prices.get(name);
    const token = PRICE_TOKENS[name];
    if (price && token) html = html.replace(token, (m) => (m.startsWith('"') ? `"${price}"` : m.startsWith('$') ? `$${price}` : price));
    if (name === 'cheaper-headphones') html = html.replace(/Fixture Electronics AU/g, 'Budget Audio AU').replace(/\/products\/sony-wh1000xm5-black/g, '/p/cheaper-headphones');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(html);
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolve({ server, store: { url: (p, host = HOSTS.au) => `http://${host}:${port}/p/${p}`, setPrice: (p, v) => prices.set(p, v), reset: () => prices.clear() } });
    }),
  );
}

export async function launch(userDataDir: string): Promise<{ context: BrowserContext; sw: Worker; extensionId: string }> {
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 860 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, `--host-resolver-rules=MAP *.wishsnag-fixture.com.au 127.0.0.1, MAP *.wishsnag-fixture.com.bd 127.0.0.1, MAP *.wishsnag-fixture.co.uk 127.0.0.1`],
  });
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker');
  return { context, sw, extensionId: new URL(sw.url()).host };
}

export interface Ext {
  context: BrowserContext;
  sw: Worker;
  extensionId: string;
  page: (path: string) => string;
  /** Merge settings straight into storage (normalised by the app on read). */
  setSettings: (patch: Record<string, unknown>) => Promise<void>;
  /** Opens a store page and the side panel UI (as a tab bound to that store tab). */
  openPanelFor: (url: string) => Promise<{ store: Page; panel: Page }>;
}

export const test = base.extend<{ userDataDir: string; ext: Ext }, { store: FixtureStore }>({
  store: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const { server, store } = await startStore();
      await use(store);
      server.close();
    },
    { scope: 'worker' },
  ],
  // eslint-disable-next-line no-empty-pattern
  userDataDir: async ({}, use) => {
    await use(mkdtempSync(join(tmpdir(), 'wishsnag-e2e-')));
  },
  ext: async ({ userDataDir, store }, use) => {
    store.reset();
    const { context, sw, extensionId } = await launch(userDataDir);
    const page = (path: string) => `chrome-extension://${extensionId}/${path}`;
    const setSettings = async (patch: Record<string, unknown>) => {
      await sw.evaluate(async (p) => {
        const key = 'wishsnag.settings';
        const cur = ((await chrome.storage.local.get(key))[key] ?? {}) as Record<string, unknown>;
        await chrome.storage.local.set({ [key]: { ...cur, ...p } });
      }, patch);
    };
    const openPanelFor = async (url: string) => {
      const store = await context.newPage();
      await store.goto(url);
      const tabId = await sw.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)?.id ?? -1, store.url());
      const panel = await context.newPage();
      await panel.setViewportSize({ width: 420, height: 900 });
      await panel.goto(page(`sidepanel.html?tab=${tabId}`));
      return { store, panel };
    };
    await use({ context, sw, extensionId, page, setSettings, openPanelFor });
    await context.close();
  },
});

export const expect = test.expect;

export const AU_SETTINGS = { onboarded: true, residenceCountry: 'AU', shoppingCountry: 'AU', deliveryCountry: 'AU', displayCurrency: 'AUD', language: 'en', alerts: { enabled: true, desktop: true, defaultDropPercent: 10, minDropPercent: 2, quietHours: { enabled: false, start: '22:00', end: '08:00' }, frequency: 'instant', digestHour: 18, cooldownHours: 6 } };
