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