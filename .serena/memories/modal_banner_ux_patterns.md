# Modal & Capture Banner UX Patterns (Dec 31, 2024)

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
