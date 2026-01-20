# Rolling Window Metrics Pattern

## Problem Solved
**Hard resets every 7 days broke metrics across version updates:**
```javascript
// OLD (BROKEN): Counter with reset date
board_opens: 3
lastResetDate: "2026-01-13"
// Every Monday → reset to 0 (data lost!)
```

## Solution: Timestamp Arrays
**Store activity log, calculate on-demand:**
```javascript
// NEW (CORRECT): Timestamp array
board_open_timestamps: [1737025800000, 1737112200000, 1737198600000]

// Calculate any window on-demand
function countEventsInWindow(key, days) {
  const timestamps = JSON.parse(localStorage.getItem(key) || '[]');
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  return timestamps.filter(t => t > cutoff).length;
}
```

## Benefits
1. **Survives version updates** - localStorage persists, timestamps never reset
2. **True rolling window** - always shows EXACT last 7 days (not "since Monday")
3. **Flexible** - calculate 1d, 7d, 30d windows anytime
4. **Debuggable** - can see exact activity history
5. **Storage efficient** - auto-cleanup keeps last 30 days max

## Implementation Files
- `public/dashboard.js` - Tracking functions (addEventTimestamp)
- `src/feedback-data.js` - Calculator (countEventsInWindow) 
- `public/utils/feedback-data.js` - Dashboard version (no exports)

## Usage Pattern
```javascript
// Track event
function trackBoardOpen() {
  addEventTimestamp('board_open_timestamps');
}

// Read metric
const opens7d = countEventsInWindow('board_open_timestamps', 7);
```

## Migration from Old Counters
Old keys are abandoned (no cleanup needed - they're harmless):
- `board_opens_7days` (counter) → `board_open_timestamps` (array)
- `refresh_clicks_7days` (counter) → `refresh_click_timestamps` (array)  
- `board_opens_reset` (not needed)
- `refresh_clicks_reset` (not needed)

New users start with empty arrays. Existing users start fresh (but that's okay - no data loss since old counters reset weekly anyway).

## Why This Fixes Everything
**Scenario that now works:**
```
Day 1 (Mon): Install v1.2.0 → board_open_timestamps: [ts1]
Day 2 (Tue): v1.2.1 releases → timestamps PERSIST ✅
Day 3 (Wed): Open 3x → timestamps: [ts1, ts2, ts3, ts4]  
Day 8 (Mon): No artificial reset! Still shows all 4 opens
Day 15: ts1 falls outside 7-day window naturally → shows 3 opens
```

**The magic:** Old data naturally ages out (sliding window), no manual resets needed.
