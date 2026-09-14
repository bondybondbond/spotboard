// Bundles the capture-path source files used by tests/*.test.js into plain ESM under
// .test-build/ so Node's built-in test runner can import them directly under jsdom.
// Test-only — never referenced by the real extension build (build-shared.js / vite build).
import * as esbuild from 'esbuild'

const entries = ['src/content.ts', 'src/utils/dom-cleanup.ts']

await esbuild.build({
  entryPoints: entries,
  outdir: '.test-build',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
})
