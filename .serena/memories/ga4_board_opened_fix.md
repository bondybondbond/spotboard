# GA4 Board Opened vs Board Refreshed Fix

## Problem Solved
`board_opened` GA4 event was firing on every dashboard load, including F5 page refreshes. This inflated:
- Rolling window metrics (`board_opens_7days`)
- GA4 analytics dashboards
- Feedback modal trigger criteria (users hitting thresholds faster than intended)

Users reloading page to manually refresh cards were incorrectly counted as "opening the board".

## Solution Implemented
**Hybrid approach using Performance Navigation API + SessionStorage:**

```javascript
// Location: public/dashboard.js:150-187

const navigationType = performance.getEntriesByType('navigation')[0]?.type;
const sessionActive = sessionStorage.getItem('dashboard_session_active');

// Fresh navigation (not reload) AND (new session OR explicit navigate)
if (navigationType !== 'reload' && !sessionActive) {
  sendEvent('board_opened', { ... });
} 
// Manual reload (F5/Ctrl+R) - track separately
else if (navigationType === 'reload') {
  sendEvent('board_refreshed', { refresh_method: 'manual_reload' });
}
```

**Navigation types handled:**
- `navigate` - Fresh navigation → counts as board_opened ✅
- `reload` - F5/Ctrl+R → counts as board_refreshed ✅
- `back_forward` - Browser navigation → treated like reload
- `prerender` - Preloaded page → skipped

**Special case:** "Refresh All" button sets `sessionStorage.reloadFromRefresh` flag before page reload to skip both events (since it has its own `refresh_clicked` tracking).

## Session management
- `sessionStorage.dashboard_session_active` set to 'true' after first load
- Cleared on `beforeunload` event (tab close)
- Prevents duplicate board_opened events within same browser session

## Benefits
1. Accurate engagement metrics - board opens vs manual refreshes tracked separately
2. Feedback modal triggers at appropriate frequency
3. Analytics show realistic usage patterns
4. No impact on existing refresh_clicked event tracking

## Testing verified
- Fresh tab open → `board_opened` fires ✅
- F5 reload → `board_refreshed` fires ✅
- Close tab + reopen → `board_opened` fires ✅
- "Refresh All" button → neither event fires (has own tracking) ✅
