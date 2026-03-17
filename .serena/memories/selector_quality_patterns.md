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

## Runtime Class Filters in `buildBaseSelector`

Classes added by JS after page load must be stripped before building the selector — they don't exist in server/fetched HTML and cause dead selectors on refresh.

**Currently filtered** (`src/content.ts` `buildBaseSelector`):
- `hover`, `active` — transient state
- `owl-loaded`, `owl-drag`, `owl-grabbing`, `owl-grab` — Owl Carousel init
- `swiper-initialized`, `swiper-pointer*`, `swiper-backface-hidden` — Swiper init
- `/^is-(initialized|loaded|ready|dragging|draggable)$/` — generic JS state
- `/^\d+[-_]observer$/` — **IntersectionObserver numbered classes** (e.g. CNN `zone-2-observer`, `product-zone-1-observer`) — added in v1.3.7

**Rule**: When adding a new filter, also add a `normalizeSelector` regex in `refreshComponent` if existing stored cards might already contain the bad class.

## JS-Injected Observer Classes (v1.3.7)

**Pattern**: News/media sites using IntersectionObserver add numbered classes (`zone-2-observer`, `product-zone-1-observer`) to zone containers after load. These classes: (1) don't exist in server HTML, (2) make the element appear uniquely selectable on the live page so `nth-of-type` is skipped, (3) cause dead selectors on direct-fetch refresh.

**Failure mode**: Dead selector → heading-based fallback → walks only 5 levels up → extracts a single article card instead of the full news zone.

**Two-layer fix**:
1. `buildBaseSelector` filters `/^\d+[-_]observer$/` (forward fix — new captures)
2. `refreshComponent` `normalizeSelector` step strips observer tokens when `querySelector` returns 0 matches (backward fix — heals stored cards silently)

**Diagnosis**: CNN card showing single article on refresh instead of full zone. Check selector in storage via dashboard evaluate_script. If selector contains `zone-N-observer` or similar, this is the issue.

## Site-Specific Patterns

### Tailwind CSS Sites
- **Problem:** Utility classes (`flex`, `flex-col`, `grid`) appear hundreds of times
- **Solution:** Always check for data attributes first
- **Example:** Product Hunt used `data-test="homepage-section-today"` (perfect selector)

### Modern JavaScript Frameworks
- **React/Vue:** Auto-generated IDs contain timestamps/UUIDs → skip them
- **Pattern:** Look for `data-testid` or semantic structure instead

### News Sites (BBC, Guardian, NYT, CNN)
- Often use framework-specific classes with patterns
- BBC: `[class*="ssrcss-"]` + semantic suffix
- Guardian: Multiple nested divs, use `:has()` for structure matching
- CNN: Zone-based layout (`div.zone.zone--t-light`) — nth-of-type selectors work in SSR HTML; `zone-N-observer` classes are JS-only

## Debugging Checklist

When a component fails to refresh properly:

1. **Check selector specificity:** Does it match multiple elements?
   - Use browser console: `document.querySelectorAll(selector).length`
   - If > 1, selector is too generic

2. **Check for runtime classes in selector:**
   - Look for `*-observer`, `*-loaded`, `*-initialized` suffixed classes
   - These are likely JS-injected and absent in server HTML

3. **Verify data attributes:** Did we miss `data-test` or similar?
   - Check element in DevTools for any `data-*` attributes
   - Add to `usefulAttrs` list in content.ts if new pattern found

4. **Only then consider tab-based refresh** if content truly needs JavaScript

## `:nth-of-type` Index Gotcha (generateSelector)

**Rule**: `:nth-of-type(N)` counts by **tag type only** — NOT by tag+class.

**Bug pattern**: Counting siblings that match `tag.class` gives wrong index when non-matching-class siblings exist between matching ones.

**Fix applied (v1.3.7)**: Count `child.tagName === element.tagName` (tag only) for index.

## Implementation Status

**Currently Checking (usefulAttrs):**
- `data-testid`, `data-test`, `data-component`, `data-section`, `data-module`, `data-type`, `data-t`, `role`
