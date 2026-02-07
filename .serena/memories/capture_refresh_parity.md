# Capture/Refresh Parity Principle

## Core Rule
**Any DOM processing logic added to capture (content.ts) must also be considered for ALL refresh paths:**

1. **Direct fetch** (DOMParser in refresh-engine.js) - No CSS, no JavaScript
2. **Background tab with spoof** (tryBackgroundWithSpoof) - Has CSS/JS but visibility spoofed
3. **Active visible tab** (tryActiveTab) - Full CSS/JS, real visibility
4. **Fetch-error fallback** (inner try/catch in refreshComponent) - When direct fetch returns HTTP error or network failure, routes to tabBasedRefresh() with fingerprint verification

## Why This Matters
- Capture runs in live page with full CSS → can detect visibility, computed styles, getBoundingClientRect
- Direct fetch has NO CSS → can only see HTML attributes, not computed styles
- Tab refreshes have CSS but may behave differently than capture

## Checklist for New Features
When adding to capture (content.ts sanitizeHTML):
- [ ] Does this need CSS? → Won't work in direct fetch
- [ ] Does this use getBoundingClientRect? → Won't work in direct fetch
- [ ] Is this in tryActiveTab? → Add if uses live DOM
- [ ] Is this in tryBackgroundWithSpoof? → Add if uses live DOM
- [ ] Is this in cleanupDuplicates? → Add if HTML-attribute-only

## Current Gaps (Dec 2024)
- Capture has comprehensive visibility checks (display, visibility, opacity, aria-hidden, off-screen)
- tryActiveTab only checks display:none
- Carousel clipping detection only in capture, not in refresh

## Files to Update Together
- src/content.ts (capture)
- public/utils/refresh-engine.js (tryActiveTab, tryBackgroundWithSpoof)
- public/utils/dom-cleanup.js (cleanupDuplicates - HTML-only processing)
