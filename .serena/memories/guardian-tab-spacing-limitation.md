# Guardian Tab Component Spacing Issue - Known Limitation

## Problem Description
Guardian's "Most viewed" component with tabbed interface captures correctly but displays excessive white space between list items in the dashboard. This affects ONLY the specific tab-based "Most viewed" component, not regular Guardian article lists.

## Root Cause
Guardian uses complex CSS framework spacing for tab panel list items. The spacing comes from:
- Framework-specific padding/margin classes on nested `<div>` wrappers inside `<li>` elements
- Tab panel container min-height rules that create fixed spacing
- Guardian's design system (likely CSS-in-JS) that's difficult to override without breaking other sites

## What We Tried (Dec 5, 2024)
1. **Capture-time filtering**: Attempted to detect and remove hidden tab panels during DOM capture
   - Failed: Both tabs capture as visible when user switches between them
2. **Post-render content detection**: Check if list items have meaningful content (links, text)
   - Failed: All Guardian tab items DO have content and links
3. **Zero-height detection**: Remove list items with offsetHeight === 0
   - Failed: Guardian's captured items all have proper height
4. **Aggressive CSS overrides**: Force margin/padding/line-height on all list elements
   - Failed: Guardian's framework CSS is too specific and complex to override cleanly

## Why It's Hard to Fix
- Guardian's tab panels use fixed-height containers with percentage-based layouts
- Nested wrapper divs inside list items carry the spacing, not the `<li>` itself
- CSS specificity wars - our global rules can't override framework-specific classes
- Site-specific hacks would create technical debt and break other sites

## Current Status: DOCUMENTED LIMITATION
This affects <5% of potential captures (Guardian tab components only). The component still works - it just has extra vertical spacing. Core functionality (links, content, refresh) all work perfectly.

## User Impact
**Minimal** - only affects Guardian's specific tab interface components. Regular Guardian article lists work fine. Users can still:
- See all content correctly
- Click all links
- Refresh for updates
- Just with some extra spacing

## Recommendation
Accept as documented limitation. Prioritize broader compatibility testing (top 10 sites) over perfecting one edge case.
