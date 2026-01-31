# Sanitization Pipeline Refactoring (31 Jan 2026)

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

## Key Rules
- When adding new sanitization steps, add them to `applySanitizationPipeline()` in dom-cleanup.js
- When changing GA4 credentials, update BOTH constants.js AND background.ts
- Script load order in dashboard.html matters — constants.js MUST load first
