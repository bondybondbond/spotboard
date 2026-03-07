# Placeholder Dimension Detection Pattern

## Problem
Sites like AS.com use HTML attributes `width="4" height="3"` as aspect ratio markers (4:3 ratio), NOT actual pixel dimensions. The browser renders these literally as 4x3 pixels, and CSS `max-height: 25px` doesn't expand small images (it only sets maximums).

## Solution
Detect dimensions < 10px as aspect ratio markers and remove those HTML attributes entirely, allowing CSS sizing rules to work properly.

```javascript
// Detect placeholder dimensions (< 10px = aspect ratio markers)
if ((height > 0 && height < 10) || (width > 0 && width < 10)) {
  img.removeAttribute('width');
  img.removeAttribute('height');
}
```

## Extended: Zero-Dimension Attrs (v1.3.5)
Rightmove SSR fallback `<img>` elements have `width="0" height="0"` (exact zero, not < 10). The `h > 0 && h < 10` check missed these. Extended guard:
```javascript
if (wAttr === '0' || hAttr === '0' || (h > 0 && h < 10) || (w > 0 && w < 10)) {
  img.removeAttribute('width'); img.removeAttribute('height');
}
```

## Critical Order: Must Run BEFORE Early-Return
In `classifyImagesForRefresh`, there is an early-return for already-classified images (`if hasAttribute('data-scale-context') return`). Attr cleanup MUST be placed before this return — already-classified images from capture hit the early-return and skip cleanup. Stale `width="0"` attrs persist → 0×0 invisible images on refresh.

## Implementation Locations
Applied in TWO places (URL fixing location removed — redundant):
1. **Capture** - `src/content.ts` sanitizeHTML clone step
2. **Refresh classification** - `src/utils/dom-cleanup.ts` `classifyImagesForRefresh` — BEFORE the `data-scale-context` early-return

## Affected Sites
- AS.com (Spanish sports news)
- Potentially other Spanish/European media sites using similar responsive image patterns
- ~5% of sites

## Key Insight
When HTML specifies tiny dimensions AND CSS uses `max-*` rules, the image stays tiny. The fix must remove the HTML attributes so CSS can properly size the images.