# Sentiment Coloring: TreeWalker Filter + Heading Fallback Patterns

## TreeWalker: Filtering Non-Rendered DOM Content

### Problem
`createTreeWalker(element, NodeFilter.SHOW_TEXT, null)` visits ALL text nodes including those
inside `<noscript>`, `<style>`, `<script>`, `<template>`, `<svg>` — which contain:
- Lazy-load fallback `<img>` HTML with timestamp filenames (e.g. `17717636291704-1920.jpg` → `-1920` triggers negative regex)
- CSS property values (-10px, -50%)
- Script strings with numeric patterns

**Sportskeeda**: 91 `<noscript>` elements, each with img filenames matching `/^-\d/` → ALL article links tagged red.

### Solution: SHOW_TEXT + `.closest()` NodeFilter

```javascript
const SKIP_SELECTOR = 'SCRIPT, STYLE, NOSCRIPT, TEMPLATE, SVG';
const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
  acceptNode(node) {
    if (node.parentElement?.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
    return NodeFilter.FILTER_ACCEPT;
  }
});
```

**Why not SHOW_ELEMENT|SHOW_TEXT + FILTER_REJECT?**
- JS callback fires for every DOM element (5000+ on heavy pages)
- SHOW_TEXT + native C++ `.closest()` on ~500 text nodes is faster
- NOSCRIPT has ~1 text node — subtree pruning saves almost nothing

### Architecture: Where to Define the Filter

| Path | Context | Approach |
|------|---------|----------|
| `content.ts` (initial capture) | Extension page | Import `tagSentimentData` from `dom-cleanup.ts` |
| `refresh-engine.js` direct-fetch (~1413) | Dashboard window | Call `tagSentimentData(tempContainer)` as global |
| `refresh-engine.js` executeScript (~634, ~868) | Injected into tab page | Must define filter inline (cannot cross page boundary) |

### Key Invariant
Sentiment tagging must happen BEFORE sanitization in ALL paths (data attributes survive cleanup).

---

## Heading Detection Fallback Strategies

When `textContent` is empty (image-only headings):

### Strategy 3.5: `img[alt]`
```typescript
const images = Array.from(element.querySelectorAll('img[alt]'));
const bestImg = images.find(img => {
  const alt = img.getAttribute('alt')?.trim() || '';
  if (alt.length <= 10) return false;
  if (/author|avatar|share|facebook|twitter|logo/i.test(alt)) return false;
  // Off-DOM safe: use getAttribute not clientWidth (always 0 for detached DOM)
  const wAttr = img.getAttribute('width');
  const hAttr = img.getAttribute('height');
  if (wAttr && parseInt(wAttr, 10) < 10) return false;  // 1x1 tracker pixel
  if (hAttr && parseInt(hAttr, 10) < 10) return false;
  // Missing attributes = unknown size, trust heuristics above
  return true;
});
```
**Key**: Only reject if attribute **exists** AND < 10. `getAttribute()` returns `null` for absent,
`parseInt(null, 10)` = NaN, so `null` defaults passing is wrong.

### Strategy 3.6: `aria-label` with vanity guard
```typescript
const label = element.querySelector('[aria-label]')?.getAttribute('aria-label')?.trim() || '';
const isVanity = /^(read more|link to article|share|continue reading)[.\s>»→]*$/i.test(label);
if (label.length > 10 && !isVanity) { title = label; }
```
**Trailing chars**: `[.\s>»→]*` handles UI arrows (>, », →) and punctuation after vanity phrases.
**i18n note**: Regex is English-only; acceptable since these specific vanity phrases are typically English
even on non-English sites.

---

## False Positive Patterns to Watch

| Pattern | Source | How matched | Fix |
|---------|--------|-------------|-----|
| `17717636291704-1920.jpg` | Sportskeeda noscript img src | `-1920` → `/^-\d/` | NOSCRIPT filter |
| `-10px`, `-50%` | Inline CSS style blocks | matches negative regex | STYLE filter |
| `var(--spacing-2)` | CSS custom props in STYLE | `-2` at start | STYLE filter |
