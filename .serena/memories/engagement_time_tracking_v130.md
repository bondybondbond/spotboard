# Dashboard Engagement Time Tracking (v1.3.0)

## Feature Complete: Feb 3, 2026

### Problem Solved
GA4 showed 0s average engagement time because all events sent hardcoded `engagement_time_msec: 100`. This blocked retention analysis - couldn't correlate engagement with user return rates.

### Solution Implemented
Page Visibility API + focus/blur tracking to measure actual "eyeballs on dashboard" time.

## Implementation Details

### Files Modified
1. **public/dashboard.js** (~50 lines added):
   - Engagement timer variables at module scope (lines ~111-160)
   - 5 helper functions: persistEngagementTime(), updateEngagementTime(), startEngagementTimer(), pauseEngagementTimer(), getEngagementTime()
   - Page Visibility listener (visibilitychange event)
   - Window focus/blur listeners
   - Updated beforeunload handler to clear sessionStorage
   - Updated 7 sendEvent calls to pass dynamic engagement time

2. **public/ga4.js** (2 lines modified):
   - sendEvent() signature: `function sendEvent(eventName, customParams = {}, engagementTimeMs = 100)`
   - engagement_time_msec now uses parameter instead of hardcoded 100

3. **public/utils/constants.js** (1 line):
   - DEBUG flag comment updated to include dashboard.js

### Key Features
- **sessionStorage persistence**: Cumulative time survives F5 refreshes within same 30-min session
- **30-minute cap**: Math.min(cumulative + elapsed, MAX_ENGAGEMENT_MS) prevents left-open-tab inflation
- **Page Visibility API**: Pauses timer when tab hidden
- **Focus/blur detection**: Pauses when browser window loses focus
- **Cumulative tracking**: Each event receives running total, not reset
- **Backward compatible**: Default 100ms for background.ts and content.ts callers

### Events Tracked (7 total)
1. welcome_viewed (first-time users)
2. board_opened (fresh navigation, new session)
3. board_refreshed (manual F5/Ctrl+R)
4. component_clicked (card content click)
5. component_deleted (card deletion)
6. refresh_clicked ("Refresh All" button)
7. first_refresh_24h (activation funnel)

## Critical Bug Fixed During Implementation
**Scoping issue**: Initial implementation placed timer code inside `if (!isReloadFromRefresh) { }` block, causing:
- "ReferenceError: Cannot access 'engagementStartTime' before initialization"
- "pauseEngagementTimer is not defined"

**Fix**: Moved timer variables and functions BEFORE async IIFE (line ~111), at module/global scope.

## Testing
**Manual scenarios validated:**
- Basic timer (30s wait → refresh → shows ~30000ms)
- Tab switching (10s active → switch away → back → shows ~10s, not 20s)
- Refresh persistence (10s → F5 → 5s → shows ~15s cumulative)
- Window blur (5s → click outside → shows ~5s)

**DEBUG mode**: Set `const DEBUG = true` in constants.js → console logs engagement time on every event.

## Production Validation (W06: Feb 3-9)

### BigQuery Distribution Query
```sql
SELECT
  event_name,
  APPROX_QUANTILES(engagement_time_msec/1000, 100)[OFFSET(50)] AS median_sec,
  APPROX_QUANTILES(engagement_time_msec/1000, 100)[OFFSET(90)] AS p90_sec,
  COUNTIF(engagement_time_msec > 900000) AS over_15min_count,  -- AFK red flag
  COUNTIF(engagement_time_msec = 100) AS legacy_100ms_count    -- v1.2 events
FROM `spotboard-486022.analytics_521351620.events_*`
WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY))
  AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
  AND event_name IN ('board_opened', 'refresh_clicked', 'component_clicked')
GROUP BY event_name;
```

### Expected Healthy Metrics
- board_opened: 0-30s median (early event)
- refresh_clicked: 30-300s median (users read before refresh)
- component_clicked: 60-600s median (highest engagement before click-through)
- over_15min_count: <10% (if higher → need inactivity detection in v1.4)
- legacy_100ms_count: Decreases daily as users upgrade

### Red Flags
- Median = 0s → Timer broken
- over_15min_count >10% → AFK inflation, add mousemove/keydown/scroll listeners
- legacy_100ms_count >5% after Feb 10 → Version param not working
- P90 > 1800s → Cap not working

## Deferred to v1.4
**Inactivity detection**: Only needed if W06 data shows >10% events with >15-min engagement.
- Would add: mousemove, keydown, scroll listeners
- Pause timer after 5 minutes idle
- Resume on next activity

## Technical Patterns Used
- **sessionStorage** for cross-refresh persistence (not chrome.storage to avoid async complexity)
- **Page Visibility API** (document.hidden, visibilitychange event)
- **Window focus/blur events** for browser window state
- **Math.min() cap** to prevent unbounded growth
- **Default parameters** for backward compatibility

## Impact
- Enables retention correlation analysis (do engaged users return more?)
- Enables engagement time by event type (which actions keep users engaged?)
- Provides north star engagement metric for feature prioritization
- ICE score: 336 (Impact 6, Confidence 7, Ease 8)
