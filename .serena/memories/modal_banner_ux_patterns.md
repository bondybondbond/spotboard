# Modal & Capture Banner UX Patterns (Updated Jan 17, 2025)

Long site names break modal layouts, site CSS hides extension UI elements, and dismissible tooltips add complexity without value.

## Modal Sizing Pattern

**Fixed Width > Min-Width:**
- Long headlines (60+ chars on Wired.com) expanded modal horizontally when using `min-width: 300px`
- **Solution:** `width: 340px; max-width: 90vw` - absolute constraint prevents overflow
- **Name truncation:** `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` with `title` attribute for hover
- **Impact:** Works across all sites regardless of headline length

## CSS Hardening for Extension UI

**Nuclear !important Required:**
- Site CSS (Wired.com) hid radio buttons via global styles
- **Pattern:** `display: inline-block !important; opacity: 1 !important; position: static !important`
- Wrap text in `<span>` elements to maintain inline layout
- **Principle:** Extension UI must override ALL site styles, not just most

## Pre-Capture UX Evolution

**Persistent Banner > Dismissible Tooltip:**
- Original: Complex tooltip with sessionStorage, timers, fade animations (53 lines)
- **Replaced with:** Static yellow banner at top (20 lines)
- **Why better:** Users need constant reminder they're in special mode, not disappearing message
- **Banner specs:** Pure yellow (#FFFF00), black text, flexbox layout, [Esc] reminder

## Banner Implementation - RESOLVED (Jan 1, 2025)

**Three issues fixed:**
1. **Icon path:** Added `web_accessible_resources` to manifest.json - content scripts can now load extension icons
2. **Non-interactive banner:** Added `pointer-events: none` + `data-spotboard-ignore` attribute, plus ignore checks in handleHover/handleClick/handleExit
3. **Text styling:** Only "Capture Mode Active" bold (`<strong>`), rest normal weight. Changed button to static "Press [Esc] to cancel capture"

**Key pattern:** Extension UI injected into pages needs `web_accessible_resources` in manifest for any assets (icons, images) to load correctly.

## Success Modal with Smart Navigation - IMPLEMENTED (Jan 18, 2026)

**Problem:** Users clicking "View Board" would open duplicate dashboard tabs, cluttering their browser. Generic "Component captured" messaging didn't align with "SpotBoard" brand.

**Solution - Smart Tab Management:**
- Background script finds existing dashboard tab before opening new one
- `chrome.tabs.query()` searches all tabs for dashboard URL
- If found: `chrome.tabs.update()` focuses existing tab
- If not found: Opens new dashboard tab
- **Result:** Single dashboard tab stays clean, users land on familiar tab

**Branding Enhancement:**
- Changed "Component captured" → "Spotted!" ✂️ (matches SpotBoard brand)
- Primary CTA: "View on SpotBoard" (calls smart navigation)
- Secondary CTA: "Close" (dismisses modal)
- **Visual hierarchy:** Green button primary, grey button secondary

**Auto-Refresh Integration:**
- Dashboard listens for new `comp-*` keys via chrome.storage.onChanged
- Auto-reloads when new component detected
- Eliminates manual "reload page" step for first-time users
- **Impact:** Capture flow reduced from 4-5 clicks to 2 clicks (Spot → View)

**Files:**
- `public/content.ts` - Success modal UI + message sending
- `src/background.ts` - Tab search/focus handler
- `public/dashboard.js` - Auto-refresh listener

**Key Pattern:** Extension background scripts can manage tab state across extension components. Use message passing to coordinate between content scripts (modal) and background script (tab management).

## Welcome Modal Visual Hierarchy - RESOLVED (Jan 17, 2025)

**Problem:** Purple modal header competed with purple dashboard header visible in blurred background - two focal points fighting for attention.

**Solution - Maximum Contrast Backdrop:**
- Changed from `rgba(0, 0, 0, 0.5)` to `rgba(50, 50, 60, 0.85)`
- **85% opacity** dense grey overlay completely neutralizes background colors
- Reduced blur from 4px to 3px (better context visibility without distraction)
- **Result:** Modal becomes ONLY colorful element on screen

**Info Button Evolution:**
- **Before:** White border + light background + box-shadow (decorative but cluttered)
- **After:** Clean SVG icon only - no chrome, just the blue circle with "i"
- **Hover:** Scale 1.1x + 80% opacity (no background changes)
- **Impact:** Cleaner, more professional appearance that matches modern UX patterns

**Key principle:** When showing branded modal over branded background, aggressive backdrop dimming (80%+ opacity) creates single focal point. Icon-only buttons work better than decorated buttons in minimal UI contexts.
