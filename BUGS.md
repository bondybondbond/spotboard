# 🪲 Known Bugs

## 🐛 Cursor Shows Default Instead of Pointer on Links

**Status:** Open  
**Severity:** Low (Polish issue, not functional blocker)  
**Date Reported:** 26 Nov 2025

**Problem:**
- Links in captured components are fully clickable and functional
- However, cursor shows default arrow everywhere, even when hovering over links
- Expected: Pointer (hand) cursor on links, default cursor elsewhere

**What Works:**
- ✅ All links are clickable
- ✅ Links go to correct URLs (relative → absolute fixed)
- ✅ No cursor pollution from capture styles

**Attempted Fixes:**
1. CSS `!important` overrides - didn't work
2. JavaScript inline style removal - removed too much
3. CSS class-based targeting - still didn't work
4. Specific element selectors - no effect

**Theory:**
Captured HTML from websites (HotUKDeals, BBC) has deeply nested DOM with complex cursor inheritance that's fighting our CSS/JS overrides.

**Impact:**
Minor UX issue - users can still click links, they just don't get the visual affordance of the pointer cursor.

**Workaround:**
None needed - core functionality works.

**Future Investigation:**
- Try using CSS `cursor: inherit` on links
- Investigate if Shadow DOM would isolate captured HTML better
- Check if specific website CSS is overriding (e.g., HotUKDeals utility classes)

---

## 🎯 Fixed Bugs (Archive)

### ✅ Yahoo Fantasy Hockey Refresh Failure
**Fixed:** 29 Nov 2025  
**Solution:** 
- Implemented dynamic ID detection to skip auto-generated IDs (yui_, react-, ember, UUIDs, timestamps)
- Added universal consent dialog handler to auto-dismiss GDPR/cookie banners
- Improved background tab refresh with proper wait times (2s + 3s + 3s = 8s)
- Added comprehensive diagnostic logging for debugging refresh failures

### ✅ Links Going to Wrong URLs
**Fixed:** 26 Nov 2025  
**Solution:** Transform relative URLs to absolute when displaying

### ✅ Cursor Crosshair Pollution
**Fixed:** 26 Nov 2025  
**Solution:** Sanitize HTML before storing to remove capture artifacts

### ✅ Card-Level Click Handler Blocking Links
**Fixed:** 26 Nov 2025  
**Solution:** Removed card click handler, let individual links handle clicks
