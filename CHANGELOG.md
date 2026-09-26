# SpotBoard Changelog

## [Unreleased] - targeting 1.4.3+

### Added

- **Capture mode now shows what a click will capture** (#106): hovering in capture mode pins a small label to the outlined box, over a very pale green wash — "Click to capture" — so you can see the scope before you click. The same pale wash stays on the selected area while you Grow or Shrink it. The top bar now says "hover to preview, click on any content you want to add".
- **First screen now says what SpotBoard is for** (#105): a new user's empty board opens with "Check all your usual sites in one glance", a one-line explanation, and a labelled example board showing four sites side by side (news, a league table, deals, market movers). The practice button still opens Wikipedia, now with a hint to capture "In the news", which changes every day. The (?) help window gains the same one-line explanation above the how-to steps. The contrast check's dark-theme sync check, which had been silently skipped, runs again.
- **Re-capture a broken card in place** (#52): when a card's site changes and the card shows "Site layout changed", "Card came back empty" or "Excluded content came back", it now has a **Re-capture** button. It opens the original page in capture mode with a banner naming the card; pick the section again and the card is fixed in place, keeping its title, position, size and pause setting. Cancelling leaves the card untouched, and an empty pick never replaces your old content.
- **Dashboard sort + filter pills** (#76): two new pills next to the board tabs — "Sort" (A-Z alphabetical) and "Filter" (show active and/or paused cards, both selectable at once). Click a pill to open a small dropdown and pick an option; the pill lights up gold while a non-default choice is active. Applies globally across every tab, including All (`public/dashboard.html`, `public/dashboard.js`).
- **Board export/import** (#59): a low-profile "advanced options" menu in the dashboard header now lets you export your whole board (every card, including its captured content) to a file, and import it back — a way to recover from an accidental storage wipe, or move your board between profiles. Manual only; not an automatic backup.
- **Bulk exclusion — exclude all similar siblings in one action** (#34): while excluding elements during capture, Shift+hovering a list-style item now previews its whole group of matching siblings (same repeated card/row type) instead of just the one you're pointing at, and Shift+click excludes the whole group at once. A plain click still excludes just one element, as before. Narrow by design — only catches siblings that share the exact same styling class, so it won't help on every site (a more general fix shipped under #61, below).
- **Grow/Shrink exclusion boundary in the Previewer** (#61): when the thing you just excluded is too small (or #34's sibling-matching doesn't find a useful group), the preview panel now shows "Shrink" / "Grow exclusion" buttons that step the excluded area up to a containing section or back down, one level at a time, with a live preview of what would be removed at each step. Only the exclusion you're currently adjusting stays visible (with a subtle highlight) while you work on it — everything else looks like a normal, finished preview, same as before.

- **Grow selection while capturing** (#42): clicking an element in capture mode no longer jumps straight to the preview. A bar appears with "Shrink", "Grow" and "Continue" (or press Enter): Grow widens the green outline to the next larger container (skipping wrappers that look identical), Shrink steps back, and clicking a different element starts the selection again. Press Continue and everything after that, including exclusion, works exactly as before. Growth never goes past the page's main content area. Capture mode now has its own colour, lime (top bar and the small control panel), so it is clearly different from purple exclusion mode; the box that follows your cursor while picking is now dashed green instead of red, since red always means "excluded" (`src/content.ts`, `src/onboarding-coach.ts`).

- **Shift+click now bulk-excludes repeated bylines, dates and headlines across articles** (#87): on news pages where each article carries its own byline, timestamp and headline in a separate container, Shift+click on one now selects the matching ones across the whole captured section, not just siblings. Matches are exact (same styling class, or a real `<time>` date tag), stay inside the captured section, and headlines styled as a "featured" variant are deliberately left out. You still see every match outlined before you confirm (`src/content.ts`).
- **Bulk exclusion no longer breaks saving a card** (#90): excluding a very large number of repeated items (e.g. every photo credit on NPR) used to fail with a storage-quota error. Exclusions still sync between devices as before; if a card's list is too large for Chrome's sync limit, that card's exclusions are kept on this device only (other devices show a small note), and export/import carries them either way. A genuine can't-fit now shows a plain explanation instead of a raw error (`src/utils/exclusion-storage.ts`, `src/content.ts`, `public/utils/refresh-engine.js`, `public/dashboard.js`).

### Fixed

- **Refreshing a card no longer erases its capture date, or undoes edits made while it refreshes** (#116): a single-card refresh used to delete the card's capture date (so the "order captured" sort quietly stopped working for it). Both refresh paths now update only the refresh result (time, status, content) and leave everything else on the card as it is, so a rename, pause or board move made mid-refresh is kept and a card you delete mid-refresh stays deleted. Cards that already lost their capture date keep the old ordering fallback.
- **Your exclusions now stick on endlessly-scrolling pages** (#112): on sites that only keep the posts near your screen (e.g. Peerlist Scroll), scrolling while excluding used to leave the preview blank, and the items you'd already excluded seemed to reset. Exclusions (including Shift+click groups) are now remembered and re-applied whenever the same kind of content scrolls back into view, and the preview refreshes as you scroll so it always shows the posts currently on screen. A single exclusion only returns to identical content, never to a different post that took its place. Capturing more than the few posts on screen is still a separate limitation (#111) (`src/content.ts`).
- **A refresh can no longer silently save a broken card** (#101): when a site is captured in a hidden browser tab and comes back with far fewer images than the card's saved copy (e.g. HotUKDeals dropping from 24 deals to 1), SpotBoard now retries in a visible popup instead of saving it. If even the popup can't load the page properly, the card keeps its last good copy and says "Page didn't fully load — kept your last good copy". A page captured while genuinely visible is trusted even if it has fewer images, so real site redesigns still come through (`public/utils/refresh-engine.js`).
- **Excluded items now stay gone on cards whose page layout changes between refreshes** (#99): when SpotBoard could not re-find an excluded block by its position (e.g. the Yes/No buttons on a Kalshi market), it now recognises it by its own text and removes it, so the refresh completes in one normal attempt instead of stopping with "Excluded content came back". It only does this when it is unambiguous; otherwise the card still fails safe.
- **Excluded items no longer silently reappear after a refresh** (#96): SpotBoard now remembers what each excluded element contained, and on refresh checks that the content you removed hasn't come back. If it has (a site rendered differently on the refresh), it keeps your last good card and shows "Excluded content came back — re-capture this card" instead of quietly showing what you removed. A promo you excluded that has genuinely disappeared from the site does not cause a failure. Also fixes refresh picking an empty loading placeholder instead of the real card on some sites, and position-based exclusions that stopped applying. Cards captured before this update keep working exactly as before (`src/utils/dom-cleanup.ts`, `public/utils/refresh-engine.js`, `src/content.ts`).

- **Excluded items coming back after a refresh** (#89): if you excluded several things in one card (e.g. a heading, then the rank numbers, then the bylines on The Verge's "Most Popular"), some of them could quietly reappear on refresh because removing the first ones shifted the positions the later ones were found by. Exclusions are now all located first and removed together, so what you excluded stays excluded whatever order you clicked in (`src/utils/dom-cleanup.ts`).

- **Sky Sports card images turning into tiny "." placeholders after a refresh** (#86): Sky (and similar sites) ship a 1x1 dummy image alongside the real image address and rely on the page's own scripts to swap it in. Refresh reads the page without running those scripts, so the dummy won. SpotBoard now treats a dummy image as "not set" and uses the real address (`src/utils/dom-cleanup.ts`).
- **Sky Sports tile groups captured as blank and refreshed as "Card came back empty"** (#70): the cleanup step that strips mobile-only duplicate copies removed any element whose class name merely contained "mobile-", and Sky marks every tile with a layout class (`glints-box--mobile-edge`) that matched, so every tile was deleted and nothing was left to save. Layout-modifier classes (`--mobile-…`) are no longer treated as duplicates, while genuine ones like `mobile-content` or `card__mobile-title` are still removed. Known limit: modifiers such as `--is-mobile-hidden` are still treated as duplicates. Sky's tile images may still show as empty slots (Sky loads them lazily) (`src/utils/dom-cleanup.ts`).
- **DailyFaceoff news card failed every refresh with "Card came back empty"** (#75): the site sends a bare grey loading placeholder and fills in the headlines afterwards with JavaScript, so the fast refresh path only ever saw the placeholder and never tried the slower tab-based refresh that lets the page finish loading. Refresh now recognises a block made only of empty grey filler shapes as "not loaded yet" and falls back to the tab refresh, so these cards update again (`public/utils/refresh-engine.js`, `src/utils/dom-cleanup.ts`).
- **Dragging a card onto a board tab silently stopped working while Sort was set to A-Z** (#76): the fix that disables manual drag-reordering under A-Z sort was cancelling the whole drag instead of just the reorder, so dragging a card onto a tab to move it to another board did nothing either. Sort no longer interferes with drag-to-tab (`public/dashboard.js`).
- **Excluding a section's heading reappeared after every refresh** (#71): on sites where a heading's styling class is shared by more than one section (e.g. theverge.com's "Most Popular" and "Most Discussed" both use the same heading style), the stored exclusion for that heading was accidentally anchored to a page-wide position rather than to the captured section itself — a position that a refresh's isolated, single-section content can never match, so the exclusion silently failed to reapply, every time. Also hardened: the excluded heading's own text was independently being stored as the card's "refresh anchor," which could let a self-healing refresh rebuild the section around exactly the heading you'd hidden. Excluding a heading now survives refresh reliably (`src/content.ts`). Existing cards captured before this fix keep their old, still-broken exclusion — re-capture (or re-exclude) the heading to pick up the fix.
- **Reddit cards showed a duplicate headline and leftover menu text** (#80): capturing a Reddit post pulled in invisible content from its closed "more options" menu (Follow / Award this post / Save / Hide / Report) plus a second, invisible copy of the headline meant only for screen readers — both are now stripped, so Reddit cards show just the real headline and content (`src/utils/dom-cleanup.ts`).
- **Guardian capture: preview stayed blank and exclusion did nothing** (#81): on Guardian's card-based pages (and similarly-built sites), the whole card is covered by an invisible click-through link with no content of its own, so clicking anywhere on the card captured that invisible link instead of the real content — an empty preview, with nothing to click for exclusion either. Capture now recognizes when the clicked spot has nothing in it and widens to the nearest content it's actually covering, and exclusion clicks now see past that same invisible layer to whatever's really underneath (`src/content.ts`).
- **Capture exclusion panel hogged the screen and its own instructions blended into the page** (#60): the purple panel duplicated its own instructions and only let you collapse the embedded preview, not the panel itself. The "what to do" instructions now live in a single persistent bar across the top (brand purple with highlighted key actions, so it doesn't blend into the host site's own colors), and the panel moved to sit mid-right instead of overlapping it — collapsing to just "Add to board?" plus Confirm/Cancel, restoring the preview exactly as you left it when expanded. The panel's header/position capture-mode toggle ("Advanced") was also removed as unnecessary UI surface; capture mode now always follows auto-detection (`src/content.ts`).
- **Can't deselect a whole excluded table column** (#73): Shift+click excludes a whole table column (or matching sibling group) in one go, but Shift+click on an already-excluded one used to un-exclude only the single cell you clicked — you had to click every cell individually to undo it. Shift+click now un-excludes the whole group again too, mirroring the exclude direction. On real sites that wrap each cell's value in nested styling elements (e.g. yr.no), the first attempt at this fix didn't actually work — a real click lands on that nested element, not the cell itself, so the un-exclude logic never recognized the cell as already excluded. Fixed to resolve up to the real excluded cell regardless of what was literally clicked (`src/content.ts`). The capture panel's help text now also mentions that un-excluding is possible, not just excluding.
- **CNBC news card permanently failing to refresh** (#77): once the headline captured at the time you added a live news-feed card scrolled off the site's feed, refresh would fail forever with "Site layout changed" — the internal check verifying the card hadn't moved was comparing against that one specific (now-gone) headline, and news feeds are excluded from the existing "content just rotated" recovery because a link-heavy news section can't be told apart from a link-heavy wrong section by link count alone. Cards now also remember a stable identity marker from when you captured them, so refresh can recognize "same feed, new headlines" without needing the exact original headline to still be there (`src/content.ts`, `public/utils/refresh-engine.js`).
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
- **Shift+click bulk exclusion could group the wrong table cells together** (#62): on tables that style columns with a shared class (e.g. right-aligned numbers), Shift+click's bulk exclusion could group unrelated columns from the same row together instead of down the intended column. Shift+click on a table cell — including its column header — now correctly selects that whole column; a plain click still excludes just the one cell, as before (`src/content.ts`).
- **A correctly-excluded table column could still come back after a refresh** (#74): on tables whose header row legitimately has fewer cells than its data rows (e.g. a merged or sub-labeled header, no colspan/rowspan involved), the safety check meant to trust a whole-column exclusion compared the header row's cell count too and rejected the column every time — so the excluded content reappeared on every refresh, not just occasionally. That check now only compares data rows against each other, and also catches a couple of table shapes it was silently missing before (`src/content.ts`, `src/utils/dom-cleanup.ts`).
- **CNBC news card lost its article thumbnails after a refresh, text only** (#72, partial): the popup window used for the last-resort refresh method renders narrower than a normal browser window, and CNBC only mounts its article thumbnails once the page is wide enough — at that narrower width they never appeared at all, and the refresh's own "did we lose the images?" safety check had gotten stuck comparing against an already-broken capture, so it stopped trying to fix it. The popup now temporarily widens itself when this happens, and the safety check no longer gets stuck on a bad baseline (`public/utils/refresh-engine.js`). Not fully fixed — only the first ~5 articles in the feed reliably get their thumbnail back; the rest still come back text-only. Good enough to ship now, revisit if it turns out to matter more than expected.
- **A card's title could turn invisible on hover in dark mode** (#79): hovering over any card's title briefly highlighted it with a background color that was hardcoded from before dark mode existed — light grey against dark-mode's near-white title text, making the title unreadable until you moved the mouse away. The highlight now uses a proper theme-aware color; also darkened the light-mode version, since the first pass was barely visible there (`public/dashboard.js`, `public/dashboard.html`).

### Internal

- **Automated tests for the capture/exclusion logic** (#40): the project's automated test files hadn't actually run in a long time — they required a full browser and silently failed when run any other way. Replaced with a real, runnable test suite covering multiple-element exclusion, nested exclusions, table-column exclusions, the empty-capture warning, and content captured from an open shadow DOM. No user-visible change.
- **Peerlist-style scrolling feeds: refresh behaviour pinned by tests** (#111): feeds that only load the posts on screen (Peerlist Scroll) capture just a couple of posts, and a blank result on refresh is already rejected so your last good card is kept. Added regression tests using a real (anonymised) example; no behaviour change. No user-visible change.

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
