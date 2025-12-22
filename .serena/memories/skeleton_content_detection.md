# Skeleton Content Detection System

## Overview
Some websites (10-15%) use JavaScript to load content progressively, sending skeleton placeholders in initial HTML. Direct fetch captures empty skeletons, so we automatically fallback to tab-based refresh.

## Detected Patterns

### 1. MarketWatch Pattern (Empty Container)
**Characteristics:**
- Has heading (h1-h6) but minimal content
- linkCount ≤ 1 AND articleCount ≤ 1
- Example: Container with "Latest News" heading but 0 actual links

**Detection Logic:**
```javascript
hasHeading && linkCount <= 1 && articleCount <= 1
```

### 2. Wired Pattern (Pure Wrapper Skeleton)
**Characteristics:**
- Container with 10+ children
- 80%+ of children are empty (no text/links/images)
- Total content <2000 characters
- Example: ListWrapper with 13 empty DividerWrapper children (1233 chars)

**Detection Logic:**
```javascript
wrapper.children >= 10 && emptyRatio >= 0.8 && contentLength < 2000
```

**Why these thresholds:**
- **10+ children:** Separates scaffolding (10-20 dividers) from real content (2-8 items)
- **80% empty:** Allows skeletons with loading spinners or "Please wait" text
- **<2000 chars:** Real content has text (500-800 chars per article snippet)

### 3. IGN Pattern (Empty Content Containers)
**Characteristics:**
- Multiple content/details/title containers present
- 2+ containers are completely empty (no text, no children)
- Indicates bot detection or lazy loading

**Detection Logic:**
```javascript
emptyContainers.length >= 2
```

### 4. Duplicate Content Pattern
**Characteristics:**
- CSS-based responsive hiding (desktop + mobile versions in same DOM)
- 5+ duplicate links AND duplicates >= unique count
- Example: BBC has DesktopValue + MobileValue for each item

**Detection Logic:**
```javascript
duplicateCount >= 5 && duplicateCount >= uniqueTexts.size
```

## Why Tab Refresh is Necessary

**Technical limitation:**
- **Direct fetch** uses `fetch()` API → `DOMParser` → NO JavaScript execution environment
- JavaScript in fetched HTML never runs (no browser APIs, no DOM manipulation)
- Skeleton remains skeleton forever, regardless of delays

**Tab refresh solution:**
- Opens real browser tab → Full page load → JavaScript executes → Skeleton replaced with content
- Brief 2-3s tab flash is unavoidable trade-off
- Only used for ~10-15% of sites that fail direct fetch

## Implementation Location

**File:** `public/utils/refresh-engine.js` (~lines 722-795)
**Function:** Direct fetch path, before calling `cleanupDuplicates()`

**Flow:**
1. Direct fetch HTML
2. Check for skeleton patterns (all 4 types)
3. If detected → Extract fingerprint → Tab-based refresh
4. Verify fingerprint match → Return real content

## Site Coverage

**Working with direct fetch (85-90%):**
- BBC, ESPN, Product Hunt, Gumtree, Yahoo Finance, most static sites

**Requiring tab refresh (10-15%):**
- Wired (pure wrapper skeleton)
- MarketWatch (empty container skeleton)
- IGN (bot detection)
- The Verge (CSS duplicates trigger fallback)

## Future Considerations

**Not implemented (and why):**
- ❌ **Headless browser emulation:** Too heavy (Puppeteer = 200MB+)
- ❌ **Wait-for-JavaScript delays:** JavaScript doesn't execute in DOMParser
- ❌ **Pre-render services:** Costs money, adds complexity
- ✅ **Current approach:** Hybrid system (direct fetch first, tab fallback) provides best speed/coverage balance
