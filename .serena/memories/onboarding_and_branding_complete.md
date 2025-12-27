# Onboarding & Branding - COMPLETE (MVP Launch Ready)

## Status: CHROME WEB STORE SUBMISSION READY

## What Was Implemented (27/12/2025)

### Minimal Onboarding Approach
- First-time user tooltip in popup: Shows when `components.length === 0`
- Empty board state with clear instructions + examples
- Orange/bold reload reminder for user education
- Decision: Ship with tooltips FIRST, gather real user feedback, iterate based on actual confusion points

### Logo Implementation (5 Touchpoints)
1. **Extension icons** (manifest.json): 16px, 48px, 128px for different Chrome contexts
2. **Popup button** (App.tsx): Logo in "Open Board" button
3. **Dashboard header** (dashboard.html): Logo next to "SpotBoard" title
4. All sourced from: public/logo.png + public/icon-*.png files

### Empty State Messaging
- Consistent across dashboard.html (initial) and dashboard.js (after delete)
- Examples: BBC "Most Read", Product Hunt launches, Wikipedia "In the news"
- Reload reminder emphasized: "❗ Remember to reload this page after you have captured something new!"

## Build System Understanding (Critical)
- **public/** = source files (committed to git)
- **dist/** = compiled output (gitignored, regenerated each build)
- Duplication is CORRECT: public/ is recipe, dist/ is baked cake
- Static files auto-copy from public/ to dist/ on `npm run build`

## Chrome Extension Icon Requirements
```json
"icons": {
  "16": "icon-16.png",   // Toolbar, favicon
  "48": "icon-48.png",   // Extensions management page
  "128": "icon-128.png"  // Chrome Web Store
},
"action": {
  "default_icon": {
    "16": "icon-16.png",
    "48": "icon-48.png"
  }
}
```

## Key Design Decisions
1. **No interactive demos** - Target users are "Chrome power users with 5+ extensions", they understand extension UX
2. **Tooltips over tutorials** - Minimal friction, gather real feedback before building onboarding materials
3. **Consistent font sizing** - Removed inline `font-size: 14px` for visual consistency
4. **Examples over instructions** - Showing "BBC Most Read" more effective than explaining abstract concepts

## Files Modified
- src/App.tsx - Popup tooltip + logo in button
- public/dashboard.html - Header logo + empty state
- public/dashboard.js - Empty state after deletion
- public/manifest.json - Icon configuration
- public/logo.png, icon-16.png, icon-48.png, icon-128.png - Brand assets

## Launch Readiness Checklist
- ✅ Tooltips for first-time users
- ✅ Logo across all touchpoints
- ✅ Empty state messaging with examples
- ✅ Reload reminder prominent
- ✅ Icon files for Chrome Web Store
- ✅ Build system verified (public/ → dist/)
- 🎯 Ready for 10-user testing within 48h of launch

## Next Steps (Post-Launch)
- Gather feedback: "What was confusing on first use?"
- Measure: "% of first 10 users who successfully capture ≥1 component" (target 70%+)
- Iterate: Build onboarding based on ACTUAL user confusion patterns
