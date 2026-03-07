# `<picture>` Child `<img>` — Never Strip by Empty Src

## Rule
Any code that strips `<img>` elements with null/empty `src` MUST add `&& !img.closest('picture')`.

## Why
`<picture>` children intentionally have no `src` attribute — the browser selects the best URL from sibling `<source srcset>` elements. Stripping the `<img>` leaves `<picture>` with sources but no render target → completely invisible image.

## Pattern
```javascript
// WRONG — strips <picture> children
if ((img.getAttribute('src') ?? '').trim() === '') img.remove();

// CORRECT
if ((img.getAttribute('src') ?? '').trim() === '' && !img.closest('picture')) img.remove();
```

## Also applies to `data-spotboard-hidden` marking:
```javascript
if ((img.getAttribute('src') ?? '').trim() === '' && !img.closest('picture')) {
  img.setAttribute('data-spotboard-hidden', 'true');
}
```

## Three Locations in Codebase
1. `src/content.ts` — sanitizeHTML empty-src clone strip
2. `public/utils/refresh-engine.js` ~line 653 — background tab path
3. `public/utils/refresh-engine.js` ~line 937 — active tab path

## Affected Sites
Zoopla (and any site using `<picture><source srcset="..."><img></picture>` responsive images — extremely common pattern).
