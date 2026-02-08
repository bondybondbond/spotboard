# Exclusion Mode - Feature Complete

## Overview
Users can click child elements within captured components to exclude them from the saved HTML. Excluded elements are stored as CSS selectors and persist across refreshes and devices.

## Implementation Status
✅ Visual feedback (red highlighting)
✅ Toggle exclusion on/off
✅ Selector persistence in sync storage
✅ Cross-device sync support
✅ Applied across all refresh paths (4 locations)
✅ Warning for heading exclusions

## Key Patterns

### Defense in Depth (4 Code Paths)
Exclusions must be applied in ALL refresh scenarios:
1. Direct fetch background refresh
2. Tab-based refresh (3 instances: normal, skeleton fallback, fingerprint fallback)
3. Missing any path = excluded elements reappear

### Selector Storage Not Element References
- Element references break when DOM recreates during refresh
- CSS selectors can be re-queried against fresh HTML
- Storage: ~20-50 bytes per selector (10 exclusions = ~200-500 bytes)
- Well under 8KB sync storage limit per component

### Warning System
Warns users when excluding heading elements that may affect refresh:
- Detects h1-h6 tags
- Detects heading/title/header class patterns
- Detects data-testid heading attributes
- Shows orange warning tooltip: "⚠️ Excluding heading may affect refresh. Keep section labels for best results."
- Prevents silent refresh failures for headingless sites (YouTube Shorts pattern)

### Ultra-Generic Selector Protection
Blocks exclusion of elements with bare tag selectors (e.g., "div", "span"):
- Shows red warning: "⚠️ Too generic - will be skipped!"
- Prevents accidental removal of legitimate content during refresh

## Cross-Device Sync
- `excludedSelectors` array in sync storage alongside metadata
- Automatically applies across devices: Device A excludes → Device B syncs → First refresh applies
- No additional user action needed

## User Experience
- Exclusions persist through refresh, browser restart, and cross-device sync
- "Set and forget" - no repeated action needed
- Works for both simple (1-2 exclusions) and complex (10+ exclusions) captures

## Files
- src/content.ts (lines 342-647) - Capture + exclusion UI
- public/dashboard.js - Apply exclusions during refresh
- src/utils/dom-cleanup.ts - Shared applyExclusions() function (compiled to public/utils/dom-cleanup.js via esbuild)

## Known Limitations
- Headingless sites (YouTube Shorts) may fail refresh if heading excluded
- Users warned during exclusion but can override
- Acceptable tradeoff: 85-90% of sites have stable headings
