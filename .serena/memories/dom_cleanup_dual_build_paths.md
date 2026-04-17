# dom-cleanup.ts — Dual Build Paths

`src/utils/dom-cleanup.ts` compiles to **two separate artifacts**:

1. **IIFE** → `public/utils/dom-cleanup.js` (used by dashboard + refresh-engine.js direct-fetch path)
   - Built by: `node scripts/build-shared.js`
   - Must be manually copied: `cp public/utils/dom-cleanup.js dist/utils/dom-cleanup.js`

2. **Vite ES module bundle** → `dist/assets/content.js` (used by content script's `sanitizeHTML` + tab-refresh path)
   - Built by: `npx tsc -b && npx vite build`

**Critical gotcha**: Running only `node scripts/build-shared.js` does NOT update `content.js`. If a fix in `dom-cleanup.ts` isn't working in the tab-refresh path, it's likely because only the IIFE was rebuilt. Always run the full build when editing `dom-cleanup.ts`.

Full build command:
```bash
cd /c/apps/spotboard && node scripts/build-shared.js && npx tsc -b && npx vite build
```

See also: LEARNINGS.md §85
