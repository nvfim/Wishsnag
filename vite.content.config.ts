/**
 * Builds the on-demand page extractor as a single self-contained IIFE.
 * It is injected with chrome.scripting.executeScript only after a user action
 * (activeTab) or on stores where the user granted access.
 */
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const e2e = process.env.WISHSNAG_E2E === '1';

export default defineConfig({
  publicDir: false,
  resolve: { alias: { '@': `${root}src` } },
  build: {
    outDir: `${root}${e2e ? 'dist-e2e' : 'dist'}/content`,
    emptyOutDir: false,
    target: 'chrome116',
    minify: true,
    lib: {
      entry: `${root}src/content/extractor.ts`,
      formats: ['iife'],
      name: 'WishSnagExtractor',
      fileName: () => 'extractor.js',
    },
  },
});
