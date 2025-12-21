# Batch 3: Image Classification for Refresh

## What Was Done
Added heuristic-based image classification for refresh (when CSS layout unavailable).

### New Function: `classifyImagesForRefresh(html)` in dom-cleanup.js
Uses heuristics since DOMParser has no CSS:
1. HTML width/height attributes
2. Class name keywords (icon/logo/badge → icon; thumb/card → thumbnail; hero/preview → preview)
3. Parent context (nav → icon; article → thumbnail/preview)
4. Default: "thumbnail" (120px)

### Updated Paths in refresh-engine.js
All 4 refresh return paths now call `classifyImagesForRefresh()`:
- Line 640: Tab-based refresh (willNeedActiveTab)
- Line 787: Skeleton fallback tab refresh
- Line 938: Self-healing tab refresh
- Line 968: Direct fetch success

## Known Issues (To Fix in Future)
1. **Product Hunt / Yahoo Fantasy**: Logos classified as "thumbnail" (120px) instead of "icon" (48px)
   - Need to add more icon class patterns: avatar, brand, app-icon, product-icon
   
2. **Rightmove**: Images disappear on refresh (blank space)
   - Need to debug - likely lazy-load data-src issue
   
3. **Amazon**: Refresh now failing entirely (regression)
   - Was working before with direct fetch

## Folder Structure Cleanup
- Extension now loads from `dist/` not `public/`
- Removed `public/assets/` (was duplicate compiled files)
- Workflow: Edit source → `npm run build` → reload extension

## CSS Size Tiers (dashboard.html)
- Icon: 48px (data-scale-context="icon")
- Thumbnail: 120px (data-scale-context="thumbnail") 
- Preview: 280px (data-scale-context="preview")
- Fallback: 25px (no data-scale-context)
