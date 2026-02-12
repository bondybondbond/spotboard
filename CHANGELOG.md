# SpotBoard Changelog

## [1.3.1] - 2026-02-12

### Added

- **Live Capture Preview**: WYSIWYG iframe preview in confirmation modal shows exactly how card will appear on dashboard
  - Updates live as user toggles exclusions (300ms debounce)
  - Scroll position preserved across updates
  - Collapsible on small viewports (<600px)
  - GA4 `capture_cancelled` event tracking

- **Semantic Sentiment Coloring**: Finance cards now scannable at a glance with color-coded deltas
  - Positive changes (+2.45%, +150) display in green (#16a34a)
  - Negative changes (-1.50%, -24.75) in red (#dc2626)
  - Works across all refresh paths (initial capture, tab-based, direct-fetch)
  - Preview modal shows sentiment colors with dashboard parity

- **Refresh Single Card**: Per-card refresh button in top bar [Info] [Pause] [**Refresh**] [Delete]
  - Inline DOM update (no page reload)
  - Spinning icon animation, toast notification
  - Works on paused cards

- **Card Title Bar Redesign**: Complete visual overhaul of card header
  - Circular icon buttons with accessible CSS tooltips
  - Pink paused header (#FCD1DE)
  - Larger favicons (24px)
  - Title bar background #EEEEEE with black bottom border

- **THIRD_PARTY_NOTICES.md**: MIT attribution file for third-party SVG icons

### Fixed

- **Fetch errors bypassing tab fallback**: HTTP errors (403 anti-bot) now route to tab fallback instead of immediate failure
  - Zoopla `network_error` was 52% of all failures

### Technical

- **Shared module refactor**: `src/utils/dom-cleanup.ts` is single TypeScript source of truth for all 10 DOM cleanup functions
  - esbuild pre-build generates IIFE for dashboard globals
  - Eliminates code duplication between content.ts and dom-cleanup.js
  - Build pipeline: `node scripts/build-shared.js && tsc -b && vite build`
- Added `esbuild` as devDependency
- New files: `src/utils/dom-cleanup.ts`, `scripts/build-shared.js`
- `public/utils/dom-cleanup.js` now auto-generated (gitignored)

---

## [1.3.0] - 2026-02-10

### Added

- **Uninstall Survey**: Tally.so form triggers when users uninstall to collect diagnostic feedback
  - Pre-populated with 11 anonymous analytics fields (user_id, days_since_install, total_cards, etc.)
  - Conditional logic: "Which websites failed?" shown only if reliability issue selected
  - Enables cohort analysis (early churners vs late churners, heavy users vs light users)

- **Per-Card Grid Sizing**: Resize individual cards to 1×1, 2×1, 1×2, or 2×2 grid units
  - Resize button in bottom-right corner of each card shows current size
  - Flyout menu with visual 2×2 grid preview icons for each size option
  - Size persists across browser refresh, reopen, and Refresh All

### Fixed

- **Feedback bubble never appearing for upgraded users**: `install_date` only set on fresh install, not update
  - Backfill `install_date` and `user_id` on extension update if missing

- **Card size persistence on Refresh All**: Sizes no longer reset when clicking Refresh All button

### Changed

- Dashboard grid: 300×250px → 355×370px cards
- Card overflow: Hidden to prevent double scrollbars

---

## [1.2.1] - 2026-02-04

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
