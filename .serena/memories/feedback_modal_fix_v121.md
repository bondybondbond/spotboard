# Feedback Modal Fix (v1.2.1)

## Problem in v1.2.0
Modal appeared briefly (0.5s flash) then disappeared. Code only checked basic conditions (>3 days install, 1+ card, not snoozed) but missing actual trigger thresholds.

## Root Cause
`initFeedbackBubble()` function incomplete - never checked:
- Board open counts
- Refresh click counts  
- Different days activity
- Minimum 2 cards requirement
- First-time vs returning user distinction

## Fix Implemented (25 Jan 2026)

**First-Time Showing Criteria (ALL must be met):**
1. 3+ board opens (last 7 days)
2. 2+ refresh clicks (last 7 days)
3. At least 3 days since install
4. At least 2 cards captured
5. Opened on 2+ different days
6. Not snoozed

**Returning User Logic:**
- After first showing, set `first_feedback_shown = true` 
- Future showings ONLY check: Is snooze expired?
- No need to re-check activity criteria

**Snooze Durations:**
- Completed: 45 days (reduced from 60)
- Remind later: 7 days
- Dismissed: 7 days
- Partial completion: 3 days

**Code Changes:**
- Added `countEventsInWindow(storageKey, windowDays)` helper
- Added `checkDifferentDays(storageKey, minDays, windowDays)` helper  
- Rewrote `initFeedbackBubble()` trigger logic (lines 1070-1110)

## Files Modified
- public/dashboard.js (lines 760-790, 1070-1110)

## Testing
Both scenarios verified:
1. First-time user (all criteria met) → Modal appears ✅
2. Returning user (snooze expired) → Modal appears immediately ✅

## Impact
100% of users - modal non-functional in v1.2.0, now works correctly for qualified users.
