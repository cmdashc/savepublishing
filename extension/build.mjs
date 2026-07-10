// Builds the loadable extension into dist/: bundles the service worker and
// content script, copies static assets, then checks that every file the
// manifest references actually landed. `node build.mjs`.

import { build } from 'esbuild';
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
rmSync(dist, { recursive: true, force: true });

await build({
  entryPoints: ['src/background.ts'],
  bundle: true,
  format: 'esm',
  outfile: join(dist, 'background.js'),
});

await build({
  entryPoints: ['src/content.ts'],
  bundle: true,
  format: 'iife',
  outfile: join(dist, 'content.js'),
});

cpSync('manifest.json', join(dist, 'manifest.json'));
cpSync('icons', join(dist, 'icons'), { recursive: true });

// Fail the build if the manifest points at anything missing from dist/.
const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
const referenced = [
  manifest.background?.service_worker,
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
  'content.js', // injected by background.js, not named in the manifest
].filter(Boolean);

const missing = referenced.filter((f) => !existsSync(join(dist, f)));
if (missing.length > 0) {
  console.error(`build: manifest references missing files: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`built ${dist}/ (${referenced.length} manifest-referenced files verified)`);
