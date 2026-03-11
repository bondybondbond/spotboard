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
- BBC `<picture>` images (real dims 240×135) correctly classified as `medium` after refresh ✅ (v1.3.5) — removed `!inPicture` guard; sites with no dims still fall through to class heuristics

## HEURISTIC 4 — srcset upgrade (v1.3.6)

`getMaxSrcsetWidth(img)` helper parses srcset for highest `w` descriptor (returns 0 for density-only or missing). Added after heuristic 3 in `classifyImagesForRefresh()`: if `context === 'thumbnail'` and max-w ≥ 400w → upgrade to `preview`. Threshold safe: AS.com floor 488w, Vox/Verge/SBNation 2400w. False-positive guard: `context === 'thumbnail'` means icon/small/medium never overridden; avatar images already classified by upstream src heuristic. Validated 20 sessions, 0 false positives.

## Known Limitation

Capture-time classification depends on page state (browser window size, responsive breakpoint, container dimensions). Same element captured at different times may get different size tiers. This is cosmetic, not functional.

## Future Fix Options (v1.1+)

1. Store original pixel dimensions at capture, calculate ratio
2. Use filename pattern heuristics (hero, thumbnail, product)
3. Let user manually set size tier per component
4. Accept thumbnail (80px) as universal default for non-icons

## Files Modified

- public/dashboard.html - 5-tier CSS
- src/content.ts - capture classification
- public/utils/refresh-engine.js - 4 pipeline locations
- public/utils/dom-cleanup.js - preservation function + heuristics