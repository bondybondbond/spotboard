# Capture Preview Feature — Complete (v1.3.4, Feb 2026)

## What Was Built
Live WYSIWYG preview in the purple capture confirmation modal. Shows exactly how the card will appear on the dashboard before user confirms.

## Architecture
- **Shared module**: `src/utils/dom-cleanup.ts` is single TypeScript source of truth (10 functions)
- **esbuild pre-build**: `scripts/build-shared.js` generates IIFE → `public/utils/dom-cleanup.js` for dashboard globals
- **Vite import**: `content.ts` imports `cleanupDuplicates` from shared module (ES module)
- **Build pipeline**: `node scripts/build-shared.js && tsc -b && vite build`

## Preview Details
- iframe with `sandbox="allow-same-origin"` — blocks scripts, allows scroll position access
- `getPreviewCSS()` returns static CSS string (dashboard-parity rules)
- `generatePreviewSrcdoc()` wraps HTML in full document
- `updatePreview()` called on each exclusion toggle (300ms debounce)
- Scroll position saved/restored across srcdoc replacements via `contentDocument`
- Collapsible preview toggle (auto-collapses on <600px viewport)
- GA4 `capture_cancelled` event on Cancel/Escape

## Key Files
- `src/utils/dom-cleanup.ts` — TS source (~640 lines, 10 exported functions)
- `scripts/build-shared.js` — esbuild IIFE config (17 lines, uses `.js` not `.mjs`)
- `src/content.ts` — preview functions, modal restructuring, debounce, scroll preservation
- `public/utils/dom-cleanup.js` — AUTO-GENERATED (gitignored)

## Gotchas Learned
- `.gitignore` has `*.mjs` — use `.js` for build scripts (`"type": "module"` makes .js files ESM)
- Serena `replace_content` regex mode inserts literal `\n` not newlines — use native Edit tool for multi-line replacements
