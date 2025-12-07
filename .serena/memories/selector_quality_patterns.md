# Selector Quality Patterns & Learnings

## Priority Hierarchy for Selectors

**Tier 1 - Highly Reliable (Use These First):**
- Data attributes: `data-test`, `data-testid`, `data-component`, `data-section`, `data-module`, `data-type`, `data-t`
- Unique IDs (non-auto-generated only): `#main-content`, `#article-body`

**Tier 2 - Structure-Based (Use When Tier 1 Unavailable):**
- `:has()` pseudo-selectors: `div:has(> h1)`, `section:has(> [data-*])`
- Specific semantic elements with unique children: `article header`, `main section`

**Tier 3 - Class-Based (Use Carefully):**
- Site-specific classes: `[class*="MostRead"]`, `[class*="TopStories"]`
- Framework-specific patterns (BBC): `[class*="ssrcss-"][class*="MostRead"]`

**Tier 4 - Generic (High Risk of Multiple Matches):**
- Utility classes: `.flex`, `.grid`, `.container` (AVOID unless combined with Tier 1-2)
- Generic tags: `div`, `section`, `article` (only with strong qualifiers)

## Site-Specific Patterns

### Tailwind CSS Sites
- **Problem:** Utility classes (`flex`, `flex-col`, `grid`) appear hundreds of times
- **Solution:** Always check for data attributes first
- **Example:** Product Hunt used `data-test="homepage-section-today"` (perfect selector)

### Modern JavaScript Frameworks
- **React/Vue:** Auto-generated IDs contain timestamps/UUIDs → skip them
- **Pattern:** Look for `data-testid` or semantic structure instead

### News Sites (BBC, Guardian, NYT)
- Often use framework-specific classes with patterns
- BBC: `[class*="ssrcss-"]` + semantic suffix
- Guardian: Multiple nested divs, use `:has()` for structure matching

## Debugging Checklist

When a component fails to refresh properly:

1. **Check selector specificity:** Does it match multiple elements?
   - Use browser console: `document.querySelectorAll(selector).length`
   - If > 1, selector is too generic

2. **Verify data attributes:** Did we miss `data-test` or similar?
   - Check element in DevTools for any `data-*` attributes
   - Add to `usefulAttrs` list in content.ts if new pattern found

3. **Test in Playwright:** Don't assume - inspect actual DOM
   - Open site in Playwright
   - Count matches for selector
   - Check what first match actually contains

4. **Only then consider tab-based refresh** if content truly needs JavaScript

## Case Study: Product Hunt

**Initial Problem:**
- Component showing "Launch archive" instead of product list
- Toast said "opening tab" but we thought it was JavaScript issue

**Root Cause:**
- Generic selector `div.flex.flex-col` matched 171 elements
- First match was navigation menu, not product list
- Container had `data-test="homepage-section-today"` we didn't capture

**Fix:**
- Added `data-test` to `usefulAttrs` in content.ts
- Recaptured with proper selector
- Background refresh now works perfectly (no tab needed)

**Learning:** 90% of "site requires tab refresh" issues are actually "bad selector" issues

## Implementation Status

**Currently Checking:**
- `data-testid`, `data-test`, `data-component`, `data-section`, `data-module`, `data-type`, `data-t`, `role`

**Future Improvements (Backlog):**
- Debug mode: Validate selector uniqueness during capture
- Selector quality score: Warn user if selector is too generic
- Auto-suggest better selectors based on available attributes
