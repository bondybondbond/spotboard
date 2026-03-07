# Content Drift Guard — Complete (2026-02-22)

## Problem
Direct-fetch refresh uses `fetch()` + `DOMParser` which has NO CSS engine. Sites with responsive-hide CSS classes (Tailwind `wb:hidden`, Bootstrap `d-none`, etc.) render those sections as visible DOM in DOMParser, bloating extracted HTML with content that's invisible on the live page.

Discovered on cricbuzz: original capture 23KB, direct-fetch 42KB (1.81x), included hidden "Featured Videos" section.

## Solution: Content Drift Guard
**File**: `public/utils/refresh-engine.js` (~line 1290)

After skeleton detection passes, compares `extractedHtml.length` against `component.originalCaptureLength || html_cache.length`. If ratio > 1.5x:
1. Rejects direct-fetch result
2. Falls back to `tabBasedRefresh()` where CSS is active
3. Tab-based refresh marks `display:none` elements via `getComputedStyle()`, removes them from clone

### Baseline Persistence
`originalCaptureLength` is set in-memory on first drift detection and persisted to local storage's `componentsData[id]` via 4 write locations:
- `dashboard.js` single-card refresh (~line 1029)
- `refresh-engine.js` refreshAll: paused (~line 1732), success (~line 1777), failed (~line 1786)

### Fingerprint Threading
`tryBackgroundWithSpoof(url, selector, fingerprint)` now accepts fingerprint for multi-match disambiguation (matching `tryActiveTab()` capability). `tabBasedRefresh()` passes fingerprint through to both functions.

## Related Fixes (Same Session)
- **Bug 1 (wrong name)**: TreeWalker Strategy 2+3 reject 0×0 hidden headings + `isAllCapsLabel()` filter (`content.ts`)
- **Bug 2a (live scores)**: `headingFingerprint` tiebreaker runs before `positionBased` shortcut (`refresh-engine.js`)

## Key Insight
DOMParser and live browser render fundamentally different DOMs for CSS-responsive sites. Any heuristic that works on DOMParser output (skeleton detection, duplicate detection) cannot detect CSS-hidden content. Size comparison is the only reliable signal without a CSS engine.
