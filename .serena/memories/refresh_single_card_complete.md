# Refresh Single Card — Completed 11 Feb 2026

## What
Per-card refresh button in card top bar. Calls `refreshComponent()` for one card, updates DOM inline (no page reload).

## Files Modified
- `public/dashboard.html` — CSS: `.refresh-single-btn` hover/active/focus-visible/disabled/spinning rules + `@keyframes spinRefresh`
- `public/dashboard.js` — Template: `card-timestamp` class on timestamp span, refresh button between pause and delete. Handler: ~80 lines after pause handler.
- `THIRD_PARTY_NOTICES.md` — New file, MIT attribution for instructure-ui reload SVG

## Button Order
[Clock] [Pause] [Refresh Single] [Delete]
(All buttons use shared `.iconBtn` circular base class, 26px diameter)

## Key Patterns
- Inline DOM update: `contentDiv.innerHTML = cleanupDuplicates(html)` + `fixRelativeUrls` + `removeCursorStyles`
- Direct sync write (no get-then-set race): writes full metadata object
- Local storage: read-then-merge for html_cache
- `card-timestamp` class for robust timestamp targeting
- Uses simple `showToast(message)` (2-arg version at line ~1210). The 3-arg version was renamed to `showStyledToast()` to fix shadowing bug.
- Spinning SVG via CSS animation class `.spinning`
- Works on paused cards

## Safety
- `type="button"`, `e.stopPropagation()`, null guard, `aria-label`, `:focus-visible`
- `chrome.runtime.lastError` logged on both storage writes

## Resolved Issues
- ~~Two `showToast` functions~~ **FIXED**: 3-arg version renamed to `showStyledToast()` (line ~953). Shadowing eliminated.
