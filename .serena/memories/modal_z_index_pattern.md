# Modal Z-Index Pattern (Media Sites)

## Problem Discovered: Dec 2024 - ESPN

Sites with video players or ad overlays use extremely high z-index values that cover extension modals.

## Symptoms
- Modal exists in DOM (confirmed via Elements inspector)
- Console logs show modal created successfully
- Modal briefly visible when navigating away from page
- Users stuck with green outline, no confirmation popup

## Root Cause
Media sites (ESPN, Sky Sports, CNN) use z-index values >1,000,000 on:
- Video players
- Ad overlays
- Sticky navigation bars
- Cookie consent popups

Our original z-index: 999999 was insufficient.

## Universal Fix Applied

**Both modals updated:**
1. Capture confirmation modal (purple, top-right)
2. Success notification modal (blue, center overlay)

**CSS Pattern:**
```css
position: fixed !important;
z-index: 2147483647 !important;  /* Max 32-bit integer */
isolation: isolate !important;   /* Independent stacking context */
/* ... all other styles also get !important ... */
```

## Files Modified
- `src/content.ts` - showCaptureConfirmation() function (~line 940)
- `src/content.ts` - showStyledNotification() function (~line 295)

## Impact
- Affects ~5-10% of sites (media platforms with video content)
- Universal fix prevents future issues
- No performance impact
- Works across all sites tested

## Sites Confirmed Working After Fix
- ✅ ESPN (original failure case)
- ✅ BBC, Guardian, Telegraph (no video conflicts)
- ✅ Product Hunt, Yahoo Finance (no media overlays)

## Prevention Rule
"Always use max z-index (2147483647) with !important for extension UI elements to prevent site CSS conflicts"
