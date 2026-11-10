import AxeBuilder from '@axe-core/playwright';
import { AU_SETTINGS, expect, test } from './fixtures';

const SNAG = { name: 'Snag to Wishlist' };

test('accessibility: no serious axe violations on key screens (light & dark)', async ({ ext, store }) => {
  test.setTimeout(120_000);
  await ext.setSettings(AU_SETTINGS);
  const { panel } = await ext.openPanelFor(store.url('au-headphones'));
  await panel.getByRole('button', SNAG).click();
  await panel.getByRole('button', SNAG).click();
  await expect(panel.getByText('Snagged! Added to your wishlist.')).toBeVisible();

  const page = await ext.context.newPage();
  const results: string[] = [];
  const routes = ['dashboard.html#/', 'dashboard.html#/wishlist', 'dashboard.html#/settings', 'dashboard.html#/welcome', 'dashboard.html#/insights', 'popup.html'];
  for (const theme of ['light', 'dark'] as const) {
    for (const r of routes) {
      await page.goto(ext.page(r));
      await page.waitForTimeout(600);
      await page.evaluate((t) => document.documentElement.classList.toggle('dark', t === 'dark'), theme);
      await page.waitForTimeout(600); // let colour transitions and entrance animations finish
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      for (const v of axe.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')) {
        results.push(`[${theme}] ${r} ${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      }
    }
  }
  const item = await ext.context.newPage();
  await item.goto(ext.page('dashboard.html#/wishlist'));
  await item.getByRole('button', { name: /Sony WH-1000XM5/ }).first().click();
  await expect(item.getByRole('heading', { level: 1 })).toBeVisible();
  await item.waitForTimeout(800);
  const axe = await new AxeBuilder({ page: item }).withTags(['wcag2a', 'wcag2aa']).analyze();
  for (const v of axe.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')) results.push(`item-detail ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  console.log(results.join('\n') || 'no serious violations');
  expect(results).toEqual([]);
});
