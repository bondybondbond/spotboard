# Sanitization Pipeline Refactoring (31 Jan 2026)

## Note (Feb 2026)
As of v1.3.4, `dom-cleanup.js` is now auto-generated from `src/utils/dom-cleanup.ts` via esbuild. Edit the TypeScript source, not the JS file.

## What Changed
- Extracted `applySanitizationPipeline(inputHtml, component)` wrapper in `public/utils/dom-cleanup.js`
- Consolidates 4-step sequence: applyExclusions → preserveImageClassifications → classifyImagesForRefresh → cleanupDuplicates
- Replaced 4 identical call sites in `public/utils/refresh-engine.js` (lines ~783, ~954, ~1115, ~1146)
- Created `public/utils/constants.js` — single source of truth for GA4_MEASUREMENT_ID, GA4_API_SECRET, GA4_ENDPOINT, SESSION_TIMEOUT_MS, DEBUG flag
- `public/ga4.js` now references constants.js (no longer hardcodes credentials)
- `src/background.ts` keeps its own copy (service worker can't load script tags) with comment pointing to constants.js
- All `console.log` in refresh-engine.js and background.ts gated behind `if (DEBUG)`
- `public/dashboard.html` script load order: constants.js → dom-cleanup.js → fingerprint.js → refresh-engine.js → feedback-data.js → ga4.js → dashboard.js

## DEBUG Flag Pattern
- `public/utils/constants.js`: `const DEBUG = false;` — shared by all dashboard-context files
- `src/background.ts`: `const DEBUG = false;` — service worker context (separate)
- `src/content.ts`: `const DEBUG = false;` — content script context (already existed, unchanged)
- `console.error` and `console.warn` remain always visible

## cleanupDuplicates() — Passes Added (Feb 2026)
- **UI Chrome Button Stripping** (v1.3.2): Removes `button`/`[role="button"]` with < 2 chars visible text (after cloning + stripping `.sr-only`/`[hidden]`). Secondary ARIA exact-match for 2-4 char ambiguous buttons. Preserves "Go", "Buy", "Add".
- **SVG Size Cap** (v1.3.2): CSS `.component-content svg { max-width: 24px !important; max-height: 24px !important; width: auto; height: auto; display: inline-block !important; }` in dashboard.html + getPreviewCSS(). Fixes location pins, rating stars.
- **Detached DOM text rule**: Never use `innerText` in cleanupDuplicates() — detached DOM has no layout. Clone + strip hidden selectors, then read `textContent`.

## Key Rules
- When adding new sanitization steps, add them to `applySanitizationPipeline()` in dom-cleanup.js
- When changing GA4 credentials, update BOTH constants.js AND background.ts
- Script load order in dashboard.html matters — constants.js MUST load first
