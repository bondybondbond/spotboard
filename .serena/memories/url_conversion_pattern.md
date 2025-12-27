# URL Conversion Pattern - Defense in Depth

## Problem
Captured HTML from websites contains relative URLs (`/img/logo.png`) that resolve incorrectly when displayed in extension context (`chrome-extension://...`).

## Solution: Two-Layer Defense
Both capture AND display code must convert relative URLs to absolute.

### Layer 1: Capture (content.ts)
- Runs during initial component capture
- Converts URLs at source using `window.location.href` as base
- Handles: img src, img srcset, link href, CSS background-image

### Layer 2: Display (utils/refresh-engine.js)  
- Runs on initial render AND after every refresh
- Function: `fixRelativeUrls(container, sourceUrl)`
- Same conversions as Layer 1
- **Critical:** Dashboard refresh fetches fresh HTML that may have relative URLs

## Why Both Layers Are Needed
- Content.ts fixes URLs during capture ✅
- But refresh-engine.js refresh fetches fresh HTML from source (bypasses capture code)
- Without refresh-engine.js fix, refreshed components show broken images ❌

## Lesson Learned (Dec 2024)
Missing URL conversion in `utils/refresh-engine.js` caused SlotCatalog images to:
- Work on initial capture (content.ts fixed them)
- Break after refresh (refresh-engine.js didn't fix them)

Fix: Enhanced `fixRelativeUrls()` in refresh-engine.js to handle all resource types (was only fixing links).

## Code Pattern - Complete URL Handling
```javascript
// 1. Protocol-relative URLs (Dec 2024 - Wikipedia fix)
if (url && url.startsWith('//')) {
  absoluteUrl = 'https:' + url;  // //cdn.com/x.png → https://cdn.com/x.png
}
// 2. Relative URLs
else if (url && !url.startsWith('http') && !url.startsWith('data:') && !url.startsWith('blob:')) {
  if (url.startsWith('/')) {
    absoluteUrl = origin + url;  // /img/x.png → https://site.com/img/x.png
  } else {
    absoluteUrl = origin + basePath + '/' + url;  // Relative to current path
  }
}
```

See `protocol_relative_urls_pattern` memory for detailed Wikipedia fix (Dec 2024).

## Progressive Loading Side Effect
Progressive loading classes (`.blurring`, `.skeleton`) are removed by:
1. content.ts during capture
2. cleanupDuplicates() in utils/dom-cleanup.js

This means initial capture may show blurred images (before JS removes blur class), but refresh shows clear images (our code removes blur class). This is acceptable.
