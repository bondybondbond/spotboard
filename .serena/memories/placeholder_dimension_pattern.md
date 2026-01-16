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

## Implementation Locations
Applied in THREE places for full coverage:
1. **Capture** - `src/content.ts` lines 655-666
2. **Refresh URL fixing** - `public/utils/dom-cleanup.js` lines 343-355 (in `fixRelativeUrls`)
3. **Refresh classification** - `public/utils/dom-cleanup.js` lines 786-792 (in `classifyImagesForRefresh`)

## Affected Sites
- AS.com (Spanish sports news)
- Potentially other Spanish/European media sites using similar responsive image patterns
- ~5% of sites

## Key Insight
When HTML specifies tiny dimensions AND CSS uses `max-*` rules, the image stays tiny. The fix must remove the HTML attributes so CSS can properly size the images.