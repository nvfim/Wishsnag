import { AU_SETTINGS, HOSTS, expect, launch, test } from './fixtures';

const SNAG = { name: 'Snag to Wishlist' };

test('Scenario A — Australian shopper: snag, target price, genuine drop → alert, history', async ({ ext, store }) => {
  await ext.setSettings(AU_SETTINGS);
  const { panel } = await ext.openPanelFor(store.url('au-headphones'));
  await expect(panel.getByRole('heading', { name: /Sony WH-1000XM5/ })).toBeVisible();
  await expect(panel.getByText('$449').first()).toBeVisible();
  await panel.getByRole('button', SNAG).click();
  await panel.getByLabel('Target price').fill('420');
  await panel.getByRole('button', SNAG).click();
  await expect(panel.getByText('Snagged! Added to your wishlist.')).toBeVisible();

  // The store drops its price; a background check records the genuine observation.
  store.setPrice('au-headphones', '399.00');
  const summary = await ext.sw.evaluate(() => (globalThis as unknown as { wishsnag: { runScheduledChecks: (o: object) => Promise<{ checked: number; updated: number }> } }).wishsnag.runScheduledChecks({ force: true }));
  expect(summary).toMatchObject({ checked: 1, updated: 1 });

  const dash = await ext.context.newPage();
  await dash.goto(ext.page('dashboard.html#/notifications'));
  await expect(dash.getByText('That’s a snag!')).toBeVisible();
  await expect(dash.getByText(/just hit your target price: \$399/)).toBeVisible();
  await expect(dash.getByText(/dropped from \$449 to \$399/)).toBeVisible();

  await dash.goto(ext.page('dashboard.html#/wishlist'));
  await dash.getByRole('button', { name: /Sony WH-1000XM5/ }).first().click();
  await expect(dash.getByRole('heading', { level: 1, name: /Sony WH-1000XM5/ })).toBeVisible();
  await expect(dash.getByText('Your patience paid off. It’s at your target price!')).toBeVisible();
  await expect(dash.getByRole('img', { name: /Price history: 2 Observations/ })).toBeVisible();
});

test('Find It Cheaper — same product at another store is matched and ranked by verified total', async ({ ext, store }) => {
  await ext.setSettings(AU_SETTINGS);
  const first = await ext.openPanelFor(store.url('au-headphones'));
  await first.panel.getByRole('button', SNAG).click();
  await first.panel.getByRole('button', SNAG).click();
  await expect(first.panel.getByText('Snagged! Added to your wishlist.')).toBeVisible();

  store.setPrice('cheaper-headphones', '399.00');
  const second = await ext.openPanelFor(store.url('cheaper-headphones', HOSTS.auBudget));
  await expect(second.panel.getByText('Related saved items')).toBeVisible();
  await expect(second.panel.getByText('Verified Exact Match')).toBeVisible();
  await second.panel.getByRole('button', { name: 'Link as offer' }).click();
  await expect(second.panel.getByText('In your wishlist')).toBeVisible();

  const dash = await ext.context.newPage();
  await dash.goto(ext.page('dashboard.html#/compare'));
  await dash.getByRole('button', { name: /Sony WH-1000XM5/ }).first().click();
  await expect(dash.getByText('Lowest verified total among 2 compared offers')).toBeVisible();
  await expect(dash.getByText('You could save $50')).toBeVisible();
  await expect(dash.getByText(/\$399\s*· Budget Audio AU/)).toBeVisible();
});

test('Scenario B — Bangladeshi shopper in Bangla: BDT prices, target alert in Bangla', async ({ ext, store }) => {
  await ext.setSettings({ ...AU_SETTINGS, residenceCountry: 'BD', shoppingCountry: 'BD', deliveryCountry: 'BD', displayCurrency: 'BDT', language: 'bn' });
  const { panel } = await ext.openPanelFor(store.url('bd-phone', HOSTS.bd));
  await expect(panel.getByRole('heading', { name: /Samsung Galaxy A55/ })).toBeVisible();
  await expect(panel.getByText('৪৫,৯৯৯৳').first()).toBeVisible();
  await panel.getByRole('button', { name: 'উইশলিস্টে স্ন্যাগ করুন' }).click();
  await panel.getByLabel('টার্গেট দাম').fill('৪৪০০০');
  await panel.getByRole('button', { name: 'উইশলিস্টে স্ন্যাগ করুন' }).click();
  await expect(panel.getByText('স্ন্যাগড! আপনার উইশলিস্টে যোগ হয়েছে।')).toBeVisible();

  store.setPrice('bd-phone', '৪৩৯৯৯');
  await ext.sw.evaluate(() => (globalThis as unknown as { wishsnag: { runScheduledChecks: (o: object) => Promise<unknown> } }).wishsnag.runScheduledChecks({ force: true }));
  const dash = await ext.context.newPage();
  await dash.goto(ext.page('dashboard.html#/notifications'));
  await expect(dash.getByText('দারুণ সুযোগ!')).toBeVisible();
  await expect(dash.getByText(/৪৩,৯৯৯৳/).first()).toBeVisible();
});

test('Scenario E — unsupported site: no fake product, manual save still works', async ({ ext, store }) => {
  await ext.setSettings({ ...AU_SETTINGS, residenceCountry: 'GB', shoppingCountry: 'GB', deliveryCountry: 'GB', displayCurrency: 'GBP' });
  const { panel } = await ext.openPanelFor(store.url('unsupported', HOSTS.uk));
  await expect(panel.getByText('No product detected on this page.')).toBeVisible();
  await panel.getByRole('button', { name: 'Add manually' }).click();
  await panel.getByLabel('Product name').fill('Reading nook armchair');
  await panel.getByLabel(/^Price/).fill('299');
  await panel.getByLabel('Currency').selectOption('GBP');
  await panel.getByRole('button', SNAG).click();
  await expect(panel.getByText('Snagged! Added to your wishlist.')).toBeVisible();

  const dash = await ext.context.newPage();
  await dash.goto(ext.page('dashboard.html#/wishlist'));
  await expect(dash.getByText('Reading nook armchair')).toBeVisible();
  await expect(dash.getByText('£299').first()).toBeVisible();
});

test('Wishlist import from a list page with preview and results', async ({ ext, store }) => {
  await ext.setSettings(AU_SETTINGS);
  const { panel } = await ext.openPanelFor(store.url('wishlist'));
  await expect(panel.getByText('No product detected on this page.')).toBeVisible();
  await panel.getByRole('button', { name: 'Import products on this page' }).first().click();
  await expect(panel.getByText('Nintendo Switch OLED Console')).toBeVisible();
  await expect(panel.getByText('Kindle Paperwhite (16 GB)')).toBeVisible();
  await expect(panel.getByText('3 selected')).toBeVisible();
  await panel.getByRole('button', { name: 'Import selected' }).click();
  await expect(panel.getByText('Imported 3 · skipped 0 · couldn’t read 0').first()).toBeVisible();
});

test('Scenario C — onboarding with cross-border delivery, collections, and data surviving a browser restart', async ({ userDataDir }) => {
  let { context, sw, extensionId } = await launch(userDataDir);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/dashboard.html`);
  await expect(page.getByRole('heading', { name: 'Welcome to WishSnag' })).toBeVisible();
  await page.getByRole('button', { name: 'Let’s go' }).click();
  await page.getByLabel('Country of residence').selectOption('AU');
  await page.getByLabel('Preferred shopping market').selectOption('BD');
  await page.getByLabel('Delivery country').selectOption('BD');
  await page.getByLabel('Display currency').selectOption('AUD');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Division').selectOption('DHA');
  await page.getByLabel('District').selectOption('Dhaka');
  await page.getByLabel('Delivery zone').selectOption('inside_dhaka');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Start snagging' }).click();
  await expect(page.getByText('Wishlist it. Wait for it. Snag it.').first()).toBeVisible();

  const settings = await sw.evaluate(async () => (await chrome.storage.local.get('wishsnag.settings'))['wishsnag.settings']);
  expect(settings).toMatchObject({ onboarded: true, residenceCountry: 'AU', shoppingCountry: 'BD', deliveryCountry: 'BD', displayCurrency: 'AUD', deliveryLocation: { region: 'DHA', district: 'Dhaka', zone: 'inside_dhaka' } });

  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/collections`);
  await page.getByRole('button', { name: /Gift Ideas/ }).click();
  await expect(page.getByRole('heading', { name: /Gift Ideas/ })).toBeVisible();
  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/add`);
  await page.getByLabel('Product name').fill('Nakshi kantha quilt');
  await page.getByLabel(/^Price/).fill('4500');
  await page.getByLabel('Currency').selectOption('BDT');
  await page.getByRole('button', { name: /Gift Ideas/ }).click();
  await page.getByRole('button', SNAG).click();
  await expect(page.getByText('Snagged! Added to your wishlist.')).toBeVisible();
  await context.close();

  // Restart Chrome with the same profile — everything is still there.
  ({ context, sw, extensionId } = await launch(userDataDir));
  const again = await context.newPage();
  await again.goto(`chrome-extension://${extensionId}/dashboard.html#/collections`);
  await expect(again.getByRole('heading', { name: /Gift Ideas/ })).toBeVisible();
  await again.getByRole('button', { name: /Gift Ideas/ }).first().click();
  await expect(again.getByText('Nakshi kantha quilt')).toBeVisible();
  // Display currency is AUD (en-AU), so a foreign BDT price is shown with its code, not a bare symbol.
  await expect(again.getByText(/BDT\s4,500/).first()).toBeVisible();
  await context.close();
});

test('Check now explains skipped stores instead of "0 · 0 · 0"', async ({ ext }) => {
  await ext.setSettings(AU_SETTINGS);
  const dash = await ext.context.newPage();
  await dash.goto(ext.page('dashboard.html#/settings'));
  await dash.getByRole('button', { name: 'Check now' }).click();
  await expect(dash.getByText(/Nothing to check yet/)).toBeVisible();

  // A saved listing on a store WishSnag has no permission for, with checks switched on.
  await dash.goto(ext.page('dashboard.html#/add'));
  await dash.getByLabel('Product name').fill('Galaxy S25 256GB');
  await dash.getByLabel(/^Price/).fill('1399');
  // The Add page opens with “More details” already expanded.
  await dash.getByLabel('Product link').fill('https://shop.not-allowed.example/galaxy-s25');
  await dash.getByRole('button', SNAG).click();
  await expect(dash.getByText('Snagged! Added to your wishlist.')).toBeVisible();
  await ext.sw.evaluate(async () => {
    const { db } = (globalThis as unknown as { wishsnag: { db: () => { offers: { toCollection: () => { modify: (f: (o: { check: { enabled: boolean; nextCheckAt: number | null } }) => void) => Promise<number> } } } } }).wishsnag;
    await db().offers.toCollection().modify((o) => {
      o.check.enabled = true;
      o.check.nextCheckAt = Date.now();
    });
  });
  await dash.goto(ext.page('dashboard.html#/settings'));
  await dash.getByRole('button', { name: 'Check now' }).click();
  await expect(dash.getByText(/1 listing was skipped because WishSnag needs your permission for that store/)).toBeVisible();
});
