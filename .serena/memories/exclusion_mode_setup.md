# Exclusion Mode - Steps 1-2 Complete: Hover Preview + Toggle

## Goal
Enable users to exclude unwanted elements from captured DOMs before saving. Implementation complete through Step 2.

## Step 1: Confirmation Modal (✅ Complete)
- Purple modal top-right (20px from edges)
- Green "Confirm Spot" + Red "Cancel" buttons
- Instructions: "Click elements inside the green box to exclude them. They'll turn red. Click again to undo."
- Unlock triggers: Confirm/Cancel/Escape → all reset exclusions

## Step 2: Click + Hover Preview (✅ Complete)

**State Management:**
- `excludedElements: HTMLElement[]` tracks red-marked children
- `resetExclusions()` clears both visual marks and array

**Visual States:**
1. **Hover preview (not excluded):** 2px dashed red border (`outline: 2px dashed #ff0000`)
2. **Excluded (clicked):** Light red fill (`rgba(255, 0, 0, 0.3)`) + solid 2px border
3. **Hover over excluded:** Maintains solid red styling (no change)
4. **Modal hover:** No styling applied (modal check is FIRST in handlers)

**Click Detection:**
```typescript
if (lockedElement.contains(target) && target !== lockedElement) {
  toggleExclusion(target); // Add/remove from array + toggle red styling
}
```

**Hover Logic:**
```typescript
// CRITICAL: Modal check must be FIRST before any other logic
if (target.closest('#spotboard-capture-confirmation')) return;

if (isAlreadyExcluded) {
  // Keep solid red
} else {
  // Show dashed red preview
}
```

**Key Learning:**
- Modal check must be FIRST in both `handleHover()` and `handleExit()`
- Without this, hover styling gets applied to modal buttons/background
- Bug manifested as transparent modal when hovering

## Current Flow
1. User clicks element → green lock + modal
2. Hover child → dashed red preview appears
3. Click child → solid red fill (excluded)
4. Click again → remove red (un-excluded)
5. Hover over modal → stays visible (no styling applied)
6. Confirm/Cancel/Escape → saves/exits + resets all exclusions

## Step 3: Track Excluded Elements in Save Flow (✅ Complete)

**Modified `sanitizeHTML()` signature:**
- Now accepts `excludedElements: HTMLElement[] = []` parameter
- Logs count of excluded elements on entry

**Exclusion removal logic (added after clone creation):**
```typescript
if (excludedElements.length > 0) {
  excludedElements.forEach(excludedEl => {
    const path = getElementPath(excludedEl, element);
    const elementInClone = getElementByPath(clone, path);
    if (elementInClone) {
      elementInClone.remove();
    }
  });
}
```

**Updated sanitizeHTML() call (line ~735):**
- Changed from: `sanitizeHTML(target)`
- Changed to: `sanitizeHTML(target, excludedElements)`

## Step 4: Persist Exclusions for Refresh (✅ Complete)

**Goal:** Excluded elements stay removed after dashboard refresh

**Pattern:** Store exclusions as CSS selectors, apply during all refresh paths

**Implementation in 3 Batches:**

**BATCH 1 - Generate Selectors (content.ts ~line 758):**
```typescript
const excludedSelectors: string[] = [];
excludedElements.forEach(el => {
  const selector = generateSelector(el);
  excludedSelectors.push(selector);
});
console.log('🎯 Generated', excludedSelectors.length, 'exclusion selectors');
```

**BATCH 2 - Store in Metadata (content.ts ~line 790, 822):**
```typescript
// Sync storage (cross-device)
const metadata = {
  id, url, name, favicon, selector,
  excludedSelectors: excludedSelectors  // NEW: Syncs to other devices
};

// Local storage
localData[component.id] = {
  selector, html_cache, last_refresh,
  excludedSelectors: excludedSelectors  // NEW: Backup in local
};
```

**BATCH 3 - Apply During Refresh (utils/dom-cleanup.js + utils/refresh-engine.js):**
```javascript
// Helper function in utils/dom-cleanup.js
function applyExclusions(html, excludedSelectors) {
  if (!excludedSelectors?.length) return html;
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  excludedSelectors.forEach(selector => {
    tempDiv.querySelectorAll(selector).forEach(el => el.remove());
  });
  return tempDiv.innerHTML;
}

// Applied in 4 refresh code paths in utils/refresh-engine.js:
html_cache: cleanupDuplicates(applyExclusions(extractedHtml, component.excludedSelectors))
```

**Critical Locations (utils/refresh-engine.js):**
1. After willNeedActiveTab (session-dependent sites)
2. After skeleton fallback detection
3. After selector-not-found fallback
4. After direct fetch extraction success

**Selector Persistence Pattern:**
- **CRITICAL:** Store as selectors, NOT element references
- Element references break when DOM is recreated during refresh
- Selectors can be re-queried against fresh HTML
- Storage cost: ~20-50 bytes per selector (minimal impact on 8KB sync limit)

**Cross-Device Behavior:**
- Device A: Captures + excludes → `excludedSelectors` syncs to cloud ✅
- Device B: Opens dashboard → sees component list from synced metadata ✅
- Device B: Clicks "Refresh All" → `applyExclusions()` runs automatically ✅
- Result: Excluded elements stay gone on all devices after first refresh

**Defense in Depth:**
Missing even ONE refresh path = excluded elements reappear in that scenario. All 4 paths required for reliability.

## CRITICAL BUG FIX: Storage Persistence (✅ Fixed Dec 14)

**Symptom:** Exclusions worked on first refresh, disappeared on second/third refresh

**Root Cause (utils/refresh-engine.js):**
- After each refresh, we updated storage with new HTML
- But we FORGOT to save `excludedSelectors` back to storage
- Result: Exclusions lived in memory (first refresh OK) then lost forever

**Note (Dec 20, 2024):** Storage later migrated to per-component keys. Pattern still applies: always save ALL metadata fields when updating storage.

**The Fix:**
Added `excludedSelectors` to BOTH storage locations during refresh cycle:

```javascript
// Sync storage (metadata)
updatedMetadata.push({
  id, name, url, favicon, customLabel, selector,
  excludedSelectors: comp.excludedSelectors || []  // ADDED
});

// Local storage (full data)
updatedLocalData[comp.id] = {
  selector, html_cache, last_refresh,
  excludedSelectors: comp.excludedSelectors || []  // ADDED (2 places: success + failure branches)
};
```

**Why This Matters:**
- Exclusions now persist across UNLIMITED refresh cycles
- Without this, users had to re-exclude elements every single refresh
- Classic "apply but don't save" bug pattern

**Testing:**
1. Exclude elements → First refresh ✅ (works from memory)
2. Refresh again → Second refresh ✅ (works from storage)
3. Refresh 5 more times → All persist ✅

## Next Steps (Optional Polish)
**Step 5:** Drag box multi-select (for excluding 10+ elements efficiently)
**Step 6:** Grow/Reduce buttons (Visualping-style expansion)
**Step 7:** Comprehensive testing across multiple sites
**Step 8:** Update PRD with complete feature documentation