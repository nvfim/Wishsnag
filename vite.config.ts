import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { buildManifest } from './manifest.config';

const root = fileURLToPath(new URL('.', import.meta.url));
const e2e = process.env.WISHSNAG_E2E === '1';
export const outDir = `${root}${e2e ? 'dist-e2e' : 'dist'}`;

function manifestPlugin(): Plugin {
  return {
    name: 'wishsnag-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(buildManifest({ e2e }), null, 2),
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  root: `${root}src`,
  publicDir: `${root}public`,
  base: '',
  plugins: [react(), tailwindcss(), manifestPlugin()],
  resolve: { alias: { '@': `${root}src` } },
  define: {
    __WISHSNAG_E2E__: JSON.stringify(e2e),
  },
  build: {
    outDir,
    emptyOutDir: true,
    target: 'chrome116',
    sourcemap: mode === 'development' ? 'inline' : false,
    minify: mode !== 'development',
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        popup: `${root}src/popup.html`,
        sidepanel: `${root}src/sidepanel.html`,
        dashboard: `${root}src/dashboard.html`,
        background: `${root}src/background/index.ts`,
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
}));
