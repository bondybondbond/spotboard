// Pre-build step: Compiles src/utils/dom-cleanup.ts → public/utils/dom-cleanup.js
// Output: IIFE format with all exports assigned to window globals
// This allows dashboard.html to continue loading dom-cleanup.js via <script> tag
//
// Run: node scripts/build-shared.js (runs before tsc and vite build)

import { build } from 'esbuild';

await build({
  entryPoints: ['src/utils/dom-cleanup.ts'],
  outfile: 'public/utils/dom-cleanup.js',
  bundle: true,
  format: 'iife',
  globalName: 'DomCleanup',
  footer: { js: 'Object.assign(window, DomCleanup);' },
  target: 'chrome120',
  banner: { js: '// AUTO-GENERATED from src/utils/dom-cleanup.ts — DO NOT EDIT' },
});

console.log('✅ Built public/utils/dom-cleanup.js from src/utils/dom-cleanup.ts');
