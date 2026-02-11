# Refresh Single Card — Completed 11 Feb 2026

## What
Per-card refresh button in card top bar. Calls `refreshComponent()` for one card, updates DOM inline (no page reload).

## Files Modified
- `public/dashboard.html` — CSS: `.refresh-single-btn` hover/active/focus-visible/disabled/spinning rules + `@keyframes spinRefresh`
- `public/dashboard.js` — Template: `card-timestamp` class on timestamp span, refresh button between pause and delete. Handler: ~80 lines after pause handler.
- `THIRD_PARTY_NOTICES.md` — New file, MIT attribution for instructure-ui reload SVG

## Button Order
[Info] [Pause] [Refresh Single] [Delete]

## Key Patterns
- Inline DOM update: `contentDiv.innerHTML = cleanupDuplicates(html)` + `fixRelativeUrls` + `removeCursorStyles`
- Direct sync write (no get-then-set race): writes full metadata object
- Local storage: read-then-merge for html_cache
- `card-timestamp` class for robust timestamp targeting
- Uses simple `showToast(message)` (2-arg version at line ~1108, not the shadowed 3-arg at ~851)
- Spinning SVG via CSS animation class `.spinning`
- Works on paused cards

## Safety
- `type="button"`, `e.stopPropagation()`, null guard, `aria-label`, `:focus-visible`
- `chrome.runtime.lastError` logged on both storage writes

## Known Issue (pre-existing)
- Two `showToast` functions in dashboard.js — 3-arg fancy version (line ~851) shadowed by 2-arg simple version (line ~1108). Pause button's 3-arg calls silently degrade.
