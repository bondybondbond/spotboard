# SpotBoard Changelog

## [Unreleased] - targeting 1.4.3+

### Added

- **Board export/import** (#59): a low-profile "advanced options" menu in the dashboard header now lets you export your whole board (every card, including its captured content) to a file, and import it back — a way to recover from an accidental storage wipe, or move your board between profiles. Manual only; not an automatic backup.
- **Bulk exclusion — exclude all similar siblings in one action** (#34): while excluding elements during capture, Shift+hovering a list-style item now previews its whole group of matching siblings (same repeated card/row type) instead of just the one you're pointing at, and Shift+click excludes the whole group at once. A plain click still excludes just one element, as before. Narrow by design — only catches siblings that share the exact same styling class, so it won't help on every site (a more general fix is being explored under #61).

### Fixed

- **Kalshi concurrent-refresh starvation** (#33): Refresh All's active-focus lane (`requiresActiveFocus` cards — sites needing a real OS-focused popup to render, e.g. Kalshi) ran up to 3 cards concurrently via `chrome.windows.create({focused:true})`. Since Chrome only has one truly OS-focused window at a time, concurrent focus-tier workers (or a finishing worker's focus-restore step) could steal focus from a sibling mid-extraction, causing that card to fail to refresh. Serialized the focus lane to one card at a time (`public/utils/refresh-engine.js`) — trades back some of issue #11's measured concurrency speedup for correctness on this small, already-visible-flash tier.
- **Low-contrast "Capture a site" ghost-card text** (#32): the placeholder hint shown on empty board slots (until you have 3 real cards) was too faint to read comfortably. Bumped its contrast and size in both light and dark mode (`public/dashboard.html`).
- **Inconsistent Kalshi chart layout across refreshes** (#43): depending on which refresh tier captured a card, Kalshi's chart came back in two different layouts (a small chart squeezed next to the buy panel, or a large chart-only view) because the background-tab tier didn't render at the same width as the other two tiers. Cards can now opt into a fixed capture width so every tier renders the same layout (`public/utils/refresh-engine.js`, `public/dashboard.js`).
- **Empty-state modal's "open popup" outcome never reached analytics** (#26): those events were wired to Google's `gtag()`, which the dashboard never loads, so every click was silently dropped. Switched to the dashboard's real analytics path; two related clicks that overlapped existing onboarding tracking were dropped rather than fixed (`public/dashboard.js`).
- **HotUKDeals card stuck showing only a banner and merchant logos, no deal images** (#41): once a background-tab refresh returned a near-empty image set (the site's per-deal images don't render without a focused browser tab), the refresh engine's own degradation check compared each new attempt against that same degraded result instead of a real baseline, so it never noticed anything was wrong and never tried the more reliable capture method. Now it recognizes when a feed-sized card is stuck with almost no images and tries harder (`public/utils/refresh-engine.js`).
- **Captured cards sometimes named just a stray digit** (#55): sites that render a live value (a clock, a population counter) as separate digit-per-character or digit-group elements could get a card name like "2" or "8" — just the first fragment of the real value, not the value itself. Card naming now recognizes when a candidate is only part of a split value and looks past it for something that stands on its own, falling back to the existing site-name label when nothing does (`src/content.ts`).
- **Some captures rendered blank or as one giant clipped character** (#56): sites that inline an oversized font-size sized for their own full-width page (e.g. time.is's clock) broke both the preview and the dashboard card once shown at SpotBoard's much narrower size. Now recognized and normalized so the content renders at a sane size, on capture, refresh, and display alike (`src/utils/dom-cleanup.ts`).
- **"View on SpotBoard" could bring up a window you never noticed** (#53): after confirming a capture, clicking the CTA could switch focus to a separate browser window (e.g. one left open on another monitor) instead of showing the dashboard in the window you were actually looking at — easy to mistake for the capture having vanished. It now always brings the dashboard into your current window, with a fallback check for the rarer case of a window left at stale coordinates after a monitor is disconnected or reconfigured (`src/background.ts`).
- **Confirmation popup buttons rendered squashed on time.is** (#58): time.is applies a site-wide CSS rule that floats every `<div>`, which collapsed the "View on SpotBoard"/"Close" buttons down to their text width instead of filling the popup, unlike on most other sites. Now explicitly guarded against on the popup itself (`src/content.ts`).
- **Excluding an element during capture could exclude the wrong one on Kalshi** (#1): on Kalshi's live-updating odds table, clicking the Yes/No buttons to exclude them could instead exclude the "Chance" header, because the page's real-time updates could shift content between the moment it was highlighted and the moment it was clicked. Exclusion clicks now only take effect when they land on the exact element that was highlighted; if content shifted in that instant, nothing gets excluded rather than the wrong thing (`src/content.ts`).
- **Capture confirmation, "Spotted" notification, and empty-capture warning could render faded or washed out on some sites** (#13): these popups lived in the page's own styling context, so a site's CSS rules for generic elements (buttons, boxes) could bleed into them — dimming them, blending their text into the background, or forcing odd casing. Isolated them from the site's CSS rules that were causing this, so they render correctly regardless of the site (`src/content.ts`).
- **Excluded table content (e.g. a weather site's wind column) could come back after a refresh** (#67): when the excluded content was one column of a table, the stored exclusion could be tied to its row's position in the table's internal grouping — which some sites reshuffle over time as content ages — so refresh silently failed to remove it again. Excluding a table cell now targets the whole column directly instead of a position, which isn't affected by that kind of reshuffling (`src/content.ts`, `src/utils/dom-cleanup.ts`). Already-excluded cards from before this fix need excluding once more to pick up the more durable version.

## [1.3.4] - 2026-03-05

### Fixed

- **Blank capture on BBC Sport / yr.no**: `isAriaHiddenDecorative` guard in `sanitizeHTML` — only strips `aria-hidden` elements with no visible content (no text, no media children); never strips by aria-hidden alone
- **Sportskeeda dark overlay**: Strip inline `<style>` and `<link rel="stylesheet">` tags at top of `cleanupDuplicates` — prevents site CSS injected via captured HTML from applying globally to the dashboard
- **HotUKDeals "Site layout changed"**: `getDominantTag` feed fallback — falls back to most-common tag when no single tag exceeds threshold, fixing sites with mixed list structures
- **Groupon images not loading**: `crossOrigin` attribute now set only for SVG images (was incorrectly applied to all `<img>` elements, breaking CORS on raster images)

### Changed

- **Manifest description**: Scoped "stays local" claim to captured content only — removes absolute "data never leaves your browser" phrasing that contradicted GA4 analytics

---

## [1.3.3] - 2026-03-05

CWS compliance update — description-only change (no code changes from v1.3.1). Updated store listing to document card resizing, Smart Exclusion Mode, and Sentiment Coloring. Updated GA4 analytics disclosure.

---

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
