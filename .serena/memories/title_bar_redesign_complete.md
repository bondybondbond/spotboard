# Card Title Bar Redesign — Completed 12 Feb 2026

## What
Complete visual overhaul of card header for Chrome Web Store submission. Replaced old button system with consistent circular `.iconBtn` design, added clock tooltip, redesigned Refresh All button.

## Final Button Order
[Clock] [Pause] [Refresh] [Delete]

## Key CSS
- `.iconBtn`: 26px circular, `border-radius: 50%`, shared hover/active/focus-visible
- `.pause-btn.active-state`: inset shadow, gray background (pressed look)
- `.component-card.paused .card-header`: `background: #FCD1DE !important`
- Card header: `background: #EEEEEE`, `border-bottom: 1px solid #000`, `padding: 5px 12px`
- Title: `font-size: 15px; color: #000`
- Favicon: 24px × 24px
- Per-button SVG overrides: `.pause-btn svg`, `.delete-btn svg` at 18px

## Clock Tooltip
- CSS-only via `transition-delay` (1s hidden, 0s visible)
- Positioned BELOW button (`top: calc(100% + 6px)`) to avoid `overflow: hidden` clipping
- Arrow points up: `bottom: 100%; border-bottom-color: #333`
- `pointer-events: none` when hidden, `auto` when visible
- `.dismissed` class on Escape key, removed on `mouseenter`/`focus`
- ARIA: `role="tooltip"`, `aria-describedby`, tooltip as sibling of trigger

## Toast Fix
- `showToast` (3-arg) renamed to `showStyledToast` to fix shadowing by 2-arg `showToast`
- Pause = red gradient (`rgba(239, 68, 68, 0.90)`), Resume = green, 2s duration

## Refresh All Button
- Elusive Icons SVG, `fill="#2BB5AD"`, 16px font, `color: #1B2344`
- Hover: `translateY(-1px)` + deeper shadow, Active: `translateY(0)` + lighter shadow

## Files
- `public/dashboard.html` — All CSS
- `public/dashboard.js` — Template + handlers + `showStyledToast`
- `THIRD_PARTY_NOTICES.md` — 5 SVG attributions

## SVG Sources
1. instructure-ui (refresh single, MIT)
2. Elusive Icons (refresh all, MIT)
3. Radix UI (pause, MIT)
4. Teeny Icons (clock, MIT)
5. Mono Icons (bin, Public Domain)
