# Image Sizing Project - COMPLETE (Known Limitation)

## Status: ACCEPTED AS MVP LIMITATION

## What Was Implemented

- 5-tier CSS system (icon 25px, small 48px, thumbnail 80px, medium 100px, preview 150px)
- Capture-time classification based on rendered size and container ratio
- Preservation function to maintain classifications through refresh
- All 4 refresh pipelines updated

## What Works

- Icons/logos consistently 25px ✅
- Preservation system correctly maintains capture-time classification ✅
- Content refresh, click-through, exclusions all functional ✅
- `<picture>`-only images (Zoopla, Next.js responsive) correctly classified via class heuristics after refresh ✅ (v1.3.5)
- BBC `<picture>` images (real dims 240×135) correctly classified as `medium` after refresh ✅ (v1.3.5)

## Next.js Fill-Layout Padding-Top Fix (v1.3.6)

`padding-top: calc(X%)` aspect-ratio container must be stripped alongside img fill styles. Applied in content.ts (capture) and both refresh paths in refresh-engine.js. See LEARNINGS.md §57.

## HEURISTIC 4 — srcset upgrade (v1.3.6)

`getMaxSrcsetWidth(img)` parses srcset for highest `w` descriptor. If `context === 'thumbnail'` and max-w >= 400w → upgrade to `preview`. See LEARNINGS.md §52.

## `<picture>` Hero Preservation Fix (v1.3.7)

`classifyImagesForRefresh` was unconditionally clearing ALL `<picture>` classifications before heuristics, wiping correct `preview` stamps from `preserveImageClassifications`. Narrowed: only reclassify `small`/`icon` picture images (BBC alt-text bug tiers). `getMaxSrcsetWidth` type broadened to `Element`. Added `getMaxSourceWidth(img)` helper checking img srcset + `<source>` srcset + CDN `&w=N` query params (ESPN combiner: `?img=...&w=660`) — used in heuristic 4 for unpreserved picture images. See LEARNINGS.md §62.

## `<source data-srcset>` Lazyload Fix (v1.3.7)

Sites using intersection-observer lazyload (ESPN) store URLs in `<source data-srcset>`; JS copies to `srcset` at runtime. Direct-fetch HTML has empty `srcset` → dashboard renders nothing. Fixed in `normalizeAndConvertUrls`: after existing `<img data-src>` → `src` pass, copy `data-srcset` → `srcset` on source elements when srcset absent. Also enables heuristic 4 `getMaxSourceWidth` to read these widths. See LEARNINGS.md §63.

## Known Limitation

Capture-time classification depends on page state (window size, responsive breakpoint). Same element at different times may get different size tiers. Cosmetic, not functional.

## Files Modified

- public/dashboard.html - 5-tier CSS
- src/content.ts - capture classification
- public/utils/refresh-engine.js - 4 pipeline locations
- src/utils/dom-cleanup.ts → public/utils/dom-cleanup.js - preservation + heuristics + getMaxSourceWidth + data-srcset fix
