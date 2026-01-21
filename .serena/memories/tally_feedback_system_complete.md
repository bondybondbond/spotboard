# Tally Feedback System - Complete Implementation

## Overview
Full Tally.so integration with 11 hidden fields for user feedback collection. Privacy-safe, rolling windows survive updates, anonymous user tracking, browser language detection.

## Files Modified
1. **src/background.ts** - Generates UUID on install
2. **public/utils/feedback-data.js** - Calculates all hidden fields
3. **public/dashboard.js** - Tracks board opens/refresh clicks, manages feedback UI

## Hidden Fields (11 Total)
### Anonymous Tracking
- **user_id**: crypto.randomUUID() generated on install, stored in chrome.storage.local
  - Privacy-safe: random string, not personally identifiable
  - Clears on uninstall
  - Enables duplicate submission detection
- **browser_language**: navigator.language (e.g. "en-US", "es-ES")
  - Non-identifying browser setting
  - Helps understand language-specific feedback patterns

### Extension Metadata (Tier 1)
- **extension_version**: Current version from manifest
- **total_cards**: Count of all captured components
- **active_cards**: Count of non-paused components  
- **paused_card_rate_%**: Percentage of paused cards (0-100)
- **all_tracked_sites**: Pipe-delimited list "domain(count) | domain(count)"
- **avg_card_age_days**: Average days since component creation

### User Behavior (Tier 2 - Rolling Windows)
- **days_since_install**: Days since extension installed
- **board_opens_7days**: Dashboard opens in last 7 days
- **refresh_clicks_7days**: "Refresh All" clicks in last 7 days

## Storage Locations
- **chrome.storage.local**: install_date, user_id (service worker compatible)
- **localStorage**: Rolling window timestamp arrays (survives updates)
  - board_open_timestamps
  - refresh_click_timestamps

## Tally Forms
- **Positive**: https://tally.so/r/GxppGe
- **Negative**: https://tally.so/r/7RKNlZ
- Fields pre-populated via URL parameters

## Feedback Trigger Logic
1. **Show after**: 3 board opens + 2 refresh clicks
2. **Snooze durations**:
   - Completed: 60 days
   - Remind later: 7 days
   - Dismissed: 7 days  
   - Partial completion: 3 days (retry with fresh survey)

## Privacy Compliance
- No personal data collected (UUID is anonymous)
- User explicitly triggers feedback by clicking button
- Survives version updates via rolling windows
- Chrome Web Store approved pattern

## Testing
Test in console:
```javascript
await getAllHiddenFields() // Returns all 10 fields
await buildTallyURL('positive') // Returns pre-filled URL
```

## Future Enhancements Needed
- Add completion_time tracking (seconds from start to submit)
- Add form field analytics (which questions answered)
- Consider A/B testing different trigger thresholds
