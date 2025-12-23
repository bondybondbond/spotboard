# Image Sizing Project - Future Enhancement

## Problem Statement
Images display at wrong sizes after refresh because capture-time and refresh-time use different classification methods.

## Root Cause Analysis

### Capture Time (content.ts)
- Uses `getBoundingClientRect()` to calculate **actual rendered image-to-container ratio**
- Classification rules:
  - Area < 2500px² OR ratio < 10% → **icon (48px)**
  - Ratio < 40% OR area < 20000px² → **thumbnail (120px)**
  - Ratio ≥ 40% AND area ≥ 20000px² → **preview (280px)**
- Sets `data-scale-context` attribute on images

### Refresh Time (dom-cleanup.js - classifyImagesForRefresh)
- DOMParser has **NO CSS layout** (getBoundingClientRect returns 0)
- Falls back to heuristics:
  1. HTML width/height attributes
  2. Class name patterns (icon, logo, thumb, card, hero, etc.)
  3. Article text length (>200 chars → preview)
- Often produces **different classification** than capture

### Example: HotUKDeals
| Factor | Capture | Refresh |
|--------|---------|---------|
| Method | Visual ratio 13-18% | Text heuristics |
| Article text | N/A | 276 chars > 200 |
| **Result** | **thumbnail (120px)** | **preview (280px)** |

## Proposed Solution (B2 from PRD)

**Preserve capture-time classification** - don't reclassify if `data-scale-context` already exists.

### Code Change in `classifyImagesForRefresh()`:
```javascript
// Skip if already classified (from capture)
if (img.hasAttribute('data-scale-context')) {
  return;  // Already exists - this code IS there but may not be working
}
```

### Investigation Needed:
1. Verify `data-scale-context` survives through the refresh pipeline
2. Check if HTML storage/retrieval strips custom attributes
3. Ensure all refresh paths preserve the attribute

## Files to Modify
- `public/utils/dom-cleanup.js` - `classifyImagesForRefresh()` function (line ~624)
- Verify attribute preservation in:
  - `public/utils/refresh-engine.js` - all refresh paths
  - `src/content.ts` - capture flow
  - Storage read/write operations

## Alternative Enhancement (B3 from PRD)
Store original **size ratio** at capture time, apply same ratio on refresh. More complex but more accurate for proportional sizing.

## Related PRD Items
- B1: Logo classification patterns (logo, avatar, brand)
- B2: Preserve capture classification (this task)
- B3: Proportional sizing preservation

## Testing Sites
- HotUKDeals (large product images → should be thumbnail)
- Zoopla (property images → good reference for correct sizing)
- Product Hunt (logos should be icon, not thumbnail)
- Yahoo Fantasy (avatars should be icon)
