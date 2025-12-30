# SVG Cross-Origin and Table Caption Fixes (30 Dec 2024)

## Problem 1: SVG Images Broken in Extension Context
yr.no weather icons (SVG format) showed broken image placeholders despite correct absolute URLs.

**Root Cause:** Browser blocks cross-origin SVG loading when server lacks CORS headers. SVGs can contain scripts, so security is stricter than PNG/JPG.

**Solution:** Added `crossorigin="anonymous"` to all img elements in `fixRelativeUrls()` (public/utils/dom-cleanup.js). Applies at display time - existing captures benefit without re-capture.

**Impact:** ~10-15% of sites use SVG icons. Universal fix.

## Problem 2: Table Headings Not Detected
yr.no uses `<caption>` for table titles, but fingerprint selector only matched h1-h6 and class-based patterns. Result: `<th>` "Time" matched instead of caption "Detailed hour-by-hour forecast."

**Solution:** Added `caption` to heading selector in 4 locations:
- src/content.ts (capture fingerprint)
- public/utils/fingerprint.js (fallback extraction)
- public/utils/refresh-engine.js (self-healing, 2 locations)

## Problem 3: Local Storage Save Failures
New captures existed in sync storage but not local storage - HTML cache missing.

**Root Causes:**
1. Silent failures in chrome.storage.local.set() callback chain
2. Refresh engine started with empty {} object, deleting unloaded components

**Solutions:**
1. Added verification read-back after local save with user warning notification
2. Refresh engine now loads existing local data first, then updates

## Content Script Reload Requirement
After extension reload, already-open tabs still run old content script. User must hard refresh (Ctrl+Shift+R) or close/reopen tabs for new capture logic.

Display-layer fixes work without re-capture because they process stored HTML at render time.

## Files Modified
- src/content.ts - caption selector, storage verification logging
- public/utils/dom-cleanup.js - crossorigin attribute
- public/utils/fingerprint.js - caption selector
- public/utils/refresh-engine.js - caption selector, preserve existing local data
