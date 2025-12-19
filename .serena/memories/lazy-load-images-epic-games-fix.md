# Lazy-Load Image Pattern (Epic Games Fix - Dec 2024)

**Context:** Epic Games Store "Free Games" component displayed images on initial capture but lost them on refresh.

**Root Cause:** Modern sites use lazy-loading pattern where images have:
- Placeholder in `src` attribute (tiny base64 gif or data URI)
- Real image URL in custom attributes (`data-image`, `data-src`, `data-lazy-src`, `data-original`, `data-lazy`)
- JavaScript swaps the attributes at runtime

**On capture:** JavaScript has already swapped → images display ✅
**On refresh:** Direct fetch captures HTML before JS runs → src has placeholder, real URL in data-* → blank images ❌

**Universal Solution Implemented:**
Added lazy-load image converter to 3 code paths that runs BEFORE URL fixing:

1. **Capture path** (src/content.ts ~line 360):
   - Runs in sanitizeContent before cloning
   - Converts data-* to src while CSS is loaded

2. **Direct fetch refresh** (public/utils/refresh-engine.js):
   - Runs in fixRelativeUrls before URL conversion
   - Catches lazy-loaded images in fetched HTML

3. **Tab-based refresh** (public/utils/refresh-engine.js):
   - Runs in both background and active tab injection
   - Converts while live DOM is available

**Code Pattern:**
```javascript
const lazyAttrs = ['data-image', 'data-src', 'data-lazy-src', 'data-original', 'data-lazy'];
for (const attr of lazyAttrs) {
  const lazyUrl = img.getAttribute(attr);
  if (lazyUrl && lazyUrl.startsWith('http')) {
    img.setAttribute('src', lazyUrl);
    console.log(`  ✅ Converted ${attr} to src:`, lazyUrl.substring(0, 80));
    break; // Stop after first match
  }
}
```

**Why Epic Games Uses Background Tab:**
Epic Games selector is `div.css-cdosd6` - a CSS-in-JS generated class that only exists AFTER JavaScript runs.
- Direct fetch gets static HTML → class doesn't exist → selector not found
- Automatic fallback to background tab (line 1470-1491) → JS runs → class created → selector works ✅
- This is **universal pattern detection** (NOT site-specific hack)

**Sites Affected:**
- Epic Games Store
- Any site using lazy-loading libraries (lozad.js, lazysizes, native loading="lazy" with polyfills)
- Image-heavy sites (game stores, e-commerce, media galleries)

**Testing Verified:**
- Images persist on both capture and refresh ✅
- Works across direct fetch AND tab-based refresh paths ✅
- No site-specific code required ✅

**Key Principle:** Universal pattern recognition - handles lazy-loading across all sites using standard attribute patterns rather than hardcoding per-site fixes.
