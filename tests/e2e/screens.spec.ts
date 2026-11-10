/**
 * Visual QA + Chrome Web Store screenshots. Seeds realistic data through the real UI
 * (synthetic fixture stores — no live retailer data), then captures key screens.
 * Run: npx playwright test screens --trace off   (outputs to test-results/screens)
 */
import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { AU_SETTINGS, HOSTS, expect, productIllustration, test } from './fixtures';

const OUT = 'test-results/screens';
const SNAG = { name: 'Snag to Wishlist' };

test.skip(!process.env.WS_SCREENS, 'Set WS_SCREENS=1 to capture screenshots');

async function shot(page: Page, name: string, theme: 'light' | 'dark' = 'light') {
  await page.evaluate((t) => document.documentElement.classList.toggle('dark', t === 'dark'), theme);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}-${theme}.png` });
}

test('capture screens', async ({ ext, store }) => {
  test.setTimeout(180_000);
  mkdirSync(OUT, { recursive: true });
  await ext.context.route('https://fixture-cdn.example/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: productIllustration(route.request().url()) }));
  await ext.setSettings({ ...AU_SETTINGS });

  // Seed: AU headphones with target + a genuine drop, a cheaper store, a UK shirt, a lamp, imports.
  const snag = async (url: string, target?: string) => {
    const { panel, store: tab } = await ext.openPanelFor(url);
    await panel.getByRole('button', SNAG).click();
    if (target) await panel.getByLabel('Target price').fill(target);
    await panel.getByRole('button', SNAG).click();
    await expect(panel.getByText(/Snagged!|Already snagged|Looks like/).first()).toBeVisible();
    await tab.close();
    return panel;
  };
  const p1 = await snag(store.url('au-headphones'), '420');
  await p1.close();
  store.setPrice('cheaper-headphones', '409.00');
  const second = await ext.openPanelFor(store.url('cheaper-headphones', HOSTS.auBudget));
  await second.panel.getByRole('button', { name: 'Link as offer' }).click();
  await expect(second.panel.getByText('In your wishlist')).toBeVisible();
  store.setPrice('au-headphones', '399.00');
  await ext.sw.evaluate(() => (globalThis as unknown as { wishsnag: { runScheduledChecks: (o: object) => Promise<unknown> } }).wishsnag.runScheduledChecks({ force: true }));
  await (await snag(store.url('uk-og-only', HOSTS.uk))).close();
  await (await snag(store.url('microdata'))).close();
  await (await snag(store.url('bd-phone', HOSTS.bd), '44000')).close();
  const list = await ext.openPanelFor(store.url('wishlist'));
  await list.panel.getByRole('button', { name: 'Import products on this page' }).first().click();
  await list.panel.getByRole('button', { name: 'Import selected' }).click();
  await expect(list.panel.getByText(/Imported 3/).first()).toBeVisible();

  const dash = await ext.context.newPage();
  await dash.setViewportSize({ width: 1280, height: 800 });
  await dash.goto(ext.page('dashboard.html#/collections'));
  for (const name of ['Tech I Want', 'Gift Ideas', 'Sneaker Wishlist']) await dash.getByRole('button', { name: new RegExp(name) }).first().click();
  await dash.waitForTimeout(4200); // let toasts disappear

  await dash.goto(ext.page('dashboard.html#/'));
  await expect(dash.getByText('Price Drops You Should See').first()).toBeVisible();
  await shot(dash, 'dashboard-home');
  await shot(dash, 'dashboard-home', 'dark');
  await dash.goto(ext.page('dashboard.html#/wishlist'));
  await shot(dash, 'wishlist');
  await shot(dash, 'wishlist', 'dark');
  await dash.getByRole('button', { name: /Sony WH-1000XM5/ }).first().click();
  await expect(dash.getByRole('heading', { level: 1 })).toBeVisible();
  await shot(dash, 'item-detail');
  await dash.mouse.wheel(0, 900);
  await shot(dash, 'item-detail-scrolled', 'dark');
  await dash.goto(ext.page('dashboard.html#/compare'));
  await dash.getByRole('button', { name: /Sony WH-1000XM5/ }).first().click();
  await expect(dash.getByText(/Lowest verified total/)).toBeVisible();
  await shot(dash, 'find-it-cheaper');
  await dash.goto(ext.page('dashboard.html#/insights'));
  await shot(dash, 'insights');
  await dash.goto(ext.page('dashboard.html#/settings'));
  await shot(dash, 'settings', 'dark');
  await dash.goto(ext.page('dashboard.html#/notifications'));
  await shot(dash, 'notifications');

  const popup = await ext.context.newPage();
  await popup.setViewportSize({ width: 380, height: 600 });
  await popup.goto(ext.page('popup.html'));
  await expect(popup.getByText('Recent price drops')).toBeVisible();
  await shot(popup, 'popup');
  await shot(popup, 'popup', 'dark');

  const { panel } = await ext.openPanelFor(store.url('au-headphones'));
  await expect(panel.getByText('In your wishlist')).toBeVisible();
  await panel.setViewportSize({ width: 400, height: 1100 });
  await shot(panel, 'sidepanel-saved');
  const fresh = await ext.openPanelFor(store.url('variants'));
  await expect(fresh.panel.getByRole('heading', { name: /Everyday Runner/ })).toBeVisible();
  await shot(fresh.panel, 'sidepanel-detected', 'dark');

  await ext.setSettings({ language: 'bn', residenceCountry: 'BD', displayCurrency: 'BDT' });
  await dash.goto(ext.page('dashboard.html#/'));
  await expect(dash.getByText('হোম').first()).toBeVisible();
  await shot(dash, 'dashboard-bangla');
});
