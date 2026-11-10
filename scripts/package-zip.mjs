// Zips dist/ into release/wishsnag-<version>.zip for the Chrome Web Store (run after `npm run build`).
import archiver from 'archiver';
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(readFileSync(`${root}package.json`, 'utf8'));
const manifest = JSON.parse(readFileSync(`${root}dist/manifest.json`, 'utf8'));
if (manifest.host_permissions?.length) {
  console.error('Refusing to package: dist/manifest.json has host_permissions (is this an E2E build?).');
  process.exit(1);
}
if (!existsSync(`${root}dist/content/extractor.js`)) {
  console.error('Refusing to package: dist/content/extractor.js is missing. Run `npm run build`.');
  process.exit(1);
}
mkdirSync(`${root}release`, { recursive: true });
const out = `${root}release/wishsnag-${version}.zip`;
const archive = archiver('zip', { zlib: { level: 9 } });
archive.pipe(createWriteStream(out));
archive.directory(`${root}dist/`, false);
await archive.finalize();
console.log(`Packaged ${out} (${(archive.pointer() / 1024).toFixed(0)} KB)`);
