# SpotBoard Changelog

## [1.3.0] - 2026-02-04

### Added
- **Dashboard Engagement Time Tracking**: Accurate measurement of user engagement for retention analysis
  - Page Visibility API integration (pauses when tab hidden)
  - Window focus/blur tracking (pauses when browser loses focus)
  - sessionStorage persistence across page refreshes within same session
  - 30-minute cap per session to prevent inflated metrics
  - All 7 GA4 events now send dynamic engagement_time_msec instead of hardcoded 100ms
  - Optional DEBUG logging for testing (gated by constants.js flag)

### Fixed
- **Material Icons text artifacts**: Remove "check_circle_filled", "more_vert" text when icon fonts don't load (affects Google Finance, Material Design sites)

### Changed
- Enhanced GA4 analytics with accurate engagement duration metrics
- Improved refresh_failed event tracking (includes selector_type, has_exclusions params)

### Technical
- 2 files modified: public/dashboard.js (+50 lines), public/ga4.js (signature update)
- Zero new dependencies - uses native browser APIs only
- Backward compatible - non-dashboard callers continue using default 100ms

---

## [1.2.1] - 2026-01-29

### Added
- **Analytics Implementation**: Google Analytics 4 integration for anonymous usage metrics
  - Tracks feature usage (captures, refreshes, opens) to improve product
  - Rolling 7-day activity windows (board opens, refresh clicks)
  - Toolbar pin status detection
  - Anonymous client_id only - no personal data collected
  - Full disclosure in privacy.md

### Changed
- Updated privacy policy with comprehensive GA4 disclosure
- Removed debug console logs for cleaner production experience

---

## [1.2.0] - 2026-01-25

### Added
- **Feedback System**: Integrated Tally.so form for user feedback collection
- **Pause/Resume**: Toggle individual components without deleting
- **Enhanced Welcome Modal**: Improved first-run experience with clearer instructions

### Fixed
- Image sizing consistency across different component types
- Modal z-index conflicts with page content
- Dashboard realtime sync improvements

---

## [1.1.0] - 2026-01-20

### Added
- **Self-Healing Refresh**: Automatic fallback when page structure changes
- **Skeleton Content Detection**: Identifies and retries JavaScript-heavy sites
- **Exclusion Mode**: Remove unwanted elements from captures
- **Position-Based Capture**: Capture elements by screen position when selectors fail

### Fixed
- Duplicate content removal for mobile/desktop responsive layouts
- Lazy-loaded image handling
- Protocol-relative URL conversion
- SVG cross-origin issues

---

## [1.0.0] - 2026-01-10

### Initial Release
- Capture website sections with visual selector
- Personal dashboard for all captures
- Manual refresh with "Refresh All" button
- Cross-device sync via Chrome storage
- Privacy-first: zero servers, local storage only
