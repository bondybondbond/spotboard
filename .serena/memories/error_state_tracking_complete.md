# Error State Tracking & Surface Refresh Status (v1.3.2)

**Completed**: 2026-02-14
**Status**: ✅ COMPLETE - Trust regression fix deployed

## Problem
v1.3.1 created trust regression by moving timestamp to hover-only tooltip. Users couldn't see which cards failed to refresh without hovering over the clock icon. This hid critical failure state.

## Solution: Multi-Layer Error Visibility
1. **Warning triangle icon** - Swaps in place of clock icon when `lastOutcome === 'failed'`
2. **Error banner** - Appears below card title with retry/open actions
3. **Toast notifications** - Dual system:
   - Single-card: Brief orange toast (4s auto-dismiss)
   - Batch: Persistent toast with retry button (survives until reload)
4. **Tooltip context** - "Last attempt failed 2m ago" vs "Last refresh: 2m ago"
5. **Storage persistence** - 5 new fields track error history

## Storage Schema Expansion
```javascript
lastAttemptAt: ISO-8601 timestamp,     // When last refresh attempted
lastSuccessAt: ISO-8601 timestamp,     // When last successful refresh
lastOutcome: 'success' | 'failed',     // Result of last attempt
lastErrorCode: 'skeleton' | 'network' | 'layout_changed' | 'unknown',
lastErrorAt: ISO-8601 timestamp | null // When last failure occurred
```

## Error Classification System
```javascript
classifyError(errorString) → 'skeleton' | 'network' | 'layout_changed' | 'unknown'
getErrorLabel(errorCode) → User-friendly message
```

**Mapping**:
- `skeleton` → "Site didn't load completely"
- `network` → "Network error"
- `layout_changed` → "Site layout changed"
- `unknown` → "Refresh failed"

## Auto-Reload Pattern (Key Learning)
**Problem**: After failed refresh, button UI showed old styling. Manual CSS reconstruction caused weird green colors.

**Solution**: Automatic page reload restores clean state naturally:
- Success: 3.5s delay (quick feedback)
- Failures: 10s delay (time to read errors and click retry)

**Why this works**: Reload rebuilds entire DOM from storage → button always in correct state. Simpler and more reliable than manual style resets.

## WCAG Accessibility
- Icon + aria-label + tooltip (not color-only)
- Screen reader announces "Last attempt failed"
- Keyboard navigable (retry button gets focus)

## Files Modified
1. `public/utils/refresh-engine.js`:
   - Error classification helpers (lines 90-115)
   - RefreshToastManager tracks failures
   - Storage writes include new fields (lines 1690-1702)
   - Auto-reload logic (10s on failures, 3.5s on success)

2. `public/dashboard.js`:
   - Card template with conditional icon swap
   - Error banner HTML
   - Enhanced showToast() with multiple parameters
   - Single-card refresh handler updates error fields

3. `public/dashboard.html`:
   - CSS for .card-error-banner
   - CSS for .refresh-toast--warning (full orange background)
   - CSS for .clock-btn.failed-state hover

4. `THIRD_PARTY_NOTICES.md`:
   - Octicons MIT license attribution for warning triangle

## Impact
- Fixes trust regression from v1.3.1
- 100% of users with failed refreshes can now see error state
- Enables future analytics on failure patterns (error codes tracked)
- Balances user feedback (10s to retry) with UI cleanliness (auto-reload)

## Pattern Reusability
When adding error states to any UI:
1. Classify errors with enum codes (technical → user-friendly)
2. Surface errors in multiple ways (icon + banner + toast)
3. Use auto-reload for state management when manual reconstruction is complex
4. Always include WCAG accessibility (not color-only)
5. Distinguish transient (auto-dismiss) vs actionable (persistent) errors
