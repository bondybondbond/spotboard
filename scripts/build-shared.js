// Pre-build step: Compiles shared utils → public/utils/*.js
// Output: IIFE format accessible via window globals in dashboard.html
//
// Run: node scripts/build-shared.js (runs before tsc and vite build)

import { build } from 'esbuild';
import fs from 'fs';

// dom-cleanup
await build({
  entryPoints: ['src/utils/dom-cleanup.ts'],
  outfile: 'public/utils/dom-cleanup.js',
  bundle: true,
  format: 'iife',
  globalName: 'DomCleanup',
  // footer spreads named exports as window globals (tagSentimentData, cleanupDuplicates, etc.)
  // used directly by refresh-engine.js — NOT redundant with globalName
  footer: { js: 'Object.assign(window, DomCleanup);' },
  target: 'chrome120',
  banner: { js: '// AUTO-GENERATED from src/utils/dom-cleanup.ts — DO NOT EDIT' },
});
fs.copyFileSync('public/utils/dom-cleanup.js', 'dist/utils/dom-cleanup.js');
console.log('✅ Built public/utils/dom-cleanup.js from src/utils/dom-cleanup.ts');

// confetti
await build({
  entryPoints: ['src/utils/confetti.ts'],
  outfile: 'public/utils/confetti.js',
  bundle: true,
  format: 'iife',
  globalName: 'SbConfetti',
  footer: { js: 'window.sbConfetti = SbConfetti;' }, // intentional lowercase alias — keep
  target: 'chrome120',
  banner: { js: '// AUTO-GENERATED from src/utils/confetti.ts — DO NOT EDIT' },
});
fs.copyFileSync('public/utils/confetti.js', 'dist/utils/confetti.js');
console.log('✅ Built public/utils/confetti.js from src/utils/confetti.ts');

// dom-snapshot
await build({
  entryPoints: ['src/utils/dom-snapshot.ts'],
  outfile: 'public/utils/dom-snapshot.js',
  bundle: true,
  format: 'iife',
  globalName: 'DomSnapshot',
  // footer explicitly sets window.DomSnapshot so it's accessible across
  // separate chrome.scripting.executeScript injections in the same tab
  footer: { js: 'window.DomSnapshot = DomSnapshot;' },
  target: 'chrome120',
  banner: { js: '// AUTO-GENERATED from src/utils/dom-snapshot.ts — DO NOT EDIT' },
});
fs.copyFileSync('public/utils/dom-snapshot.js', 'dist/utils/dom-snapshot.js');
console.log('✅ Built public/utils/dom-snapshot.js from src/utils/dom-snapshot.ts');
