// Prints the retailer support matrix (Markdown) straight from src/core/retailers/registry.ts,
// so docs/RETAILERS.md never drifts from the code. Usage: node scripts/retailer-table.mjs
import { buildSync } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(mkdtempSync(join(tmpdir(), 'ws-reg-')), 'registry.mjs');
buildSync({ entryPoints: [join(root, 'src/core/retailers/registry.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, alias: { '@': join(root, 'src') }, logLevel: 'silent' });
const { RETAILERS } = await import(pathToFileURL(out).href);
const label = { operational: '✅ Operational', partial: '🟣 Partial', requires_credentials: '🔑 Needs credentials', unavailable: '⛔ Unavailable', unsupported: '— Unsupported', planned: '🗓 Planned' };
const intl = (d) => (d.international === 'none' ? 'Domestic only' : d.international === 'worldwide' ? 'Worldwide' : d.international === 'unknown' ? 'Domestic; international not confirmed' : `Domestic + ${d.international.join(', ')}`);
const groups = [['Australia', 'AU'], ['Bangladesh', 'BD'], ['International', null]];
for (const [title, cc] of groups) {
  const list = RETAILERS.filter((r) => (cc ? r.country === cc : r.country !== 'AU' && r.country !== 'BD'));
  console.log(`\n### ${title} (${list.length})\n`);
  console.log('| Store | Country | Saving products | Price/stock checks | Live offers (API) | Search link | Delivery coverage (registry) | Prices incl. tax |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const r of list) {
    const c = r.capabilities;
    console.log(`| ${r.name} | ${r.country ?? 'Global'} | ${label[c.productExtraction]} | ${label[c.priceMonitoring]} | ${label[c.offerRetrieval]} | ${r.searchUrl ? 'Yes' : '—'} | ${intl(r.delivery)} | ${r.pricesIncludeTax === null ? 'Varies' : r.pricesIncludeTax ? 'Yes' : 'No (added at checkout)'} |`);
  }
}
