// Pre-build step: Compiles shared utils → public/utils/*.js
// Output: IIFE format accessible via window globals in dashboard.html
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

await build({
  entryPoints: ['src/utils/confetti.ts'],
  outfile: 'public/utils/confetti.js',
  bundle: true,
  format: 'iife',
  globalName: 'SbConfetti',
  footer: { js: 'window.sbConfetti = SbConfetti;' },
  target: 'chrome120',
  banner: { js: '// AUTO-GENERATED from src/utils/confetti.ts — DO NOT EDIT' },
});

console.log('✅ Built public/utils/confetti.js from src/utils/confetti.ts');
