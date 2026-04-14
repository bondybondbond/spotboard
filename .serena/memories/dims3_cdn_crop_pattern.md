# NPR Brightspot dims3 CDN — /crop/WxH/ as image size signal

NPR Brightspot dims3 CDN URLs format:
`/dims3/default/strip/false/crop/3889x3889+offset/resize/300/quality/100/format/jpeg/?url=...`

- `/resize/300/` = output size — gives NO useful HEURISTIC 4 signal (below 400w threshold)
- `/crop/3889x3889/` = SOURCE image dimensions — large editorial photo

Pattern added to `extractWidthFromCdnUrl` in `src/utils/dom-cleanup.ts`:
```typescript
const crop = url.match(/\/crop\/(\d{3,5})x\d/);
if (crop) return parseInt(crop[1], 10);
```

Returns source width (3889) → HEURISTIC 4 fires → `preview` classification.

Rule: when a CDN URL contains both a crop stage and a resize stage, crop encodes original size.
