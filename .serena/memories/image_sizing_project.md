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

## `<picture>` Early-Return Guard + Actual Pixel Width Fix (v1.3.7 — NBC session)

Two bugs in `classifyImagesForRefresh` compounded for NBC News:

1. **Early-return guard** (`!inPicture || (ctx !== 'small' && ctx !== 'icon')`) skipped picture images with ANY existing non-small/icon classification (e.g. `'medium'`). This prevented `resolveLargestPictureSourceForCard` and HEURISTIC 4 from ever running. Fix: `!inPicture && ctx !== 'small' && ctx !== 'icon'` — picture images ALWAYS reclassified. See LEARNINGS.md §64.

2. **`resolveLargestPictureSourceForCard`** used highest `min-width` breakpoint to select source. NBC Cloudinary pattern: `(min-width:758px)→t_focal-1000x563` is larger than `(min-width:1240px)→t_focal-860x484`. Fix: use actual pixel width via `extractWidthFromCdnUrl` + `w`-descriptor + `&w=` param, with min-width as last-resort fallback only. See LEARNINGS.md §65.

Result: NBC editorial pictures upgraded from `medium` (100px) to `preview` (280px) on refresh. Initial capture image-missing on NBC — deferred (root cause unconfirmed).

## Known Limitation

Capture-time classification depends on page state (window size, responsive breakpoint). Same element at different times may get different size tiers. Cosmetic, not functional.

Initial capture images missing on NBC News (hero picture in CSS Grid + JW Player stack) — fixes exist in compiled code but user reports no improvement. Suspected root cause: captured section may not include the hero element, or CSS Grid hiding at capture time. Deferred — revisit only on user complaints.

## Files Modified

- public/dashboard.html - 5-tier CSS
- src/content.ts - capture classification
- public/utils/refresh-engine.js - 4 pipeline locations
- src/utils/dom-cleanup.ts → public/utils/dom-cleanup.js - preservation + heuristics + getMaxSourceWidth + data-srcset fix
