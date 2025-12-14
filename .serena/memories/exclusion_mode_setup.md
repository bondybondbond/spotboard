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

## Next Steps (Pending)
**Step 3:** Track excluded elements in save flow
- Pass `excludedElements` to `sanitizeHTML()` function
- Modify function signature to accept exclusions parameter

**Step 4:** Remove excluded elements from HTML
- Loop through `excludedElements` array before cloning
- Remove each element from DOM
- Verify excluded content not in saved HTML

**Step 5:** Testing and refinement
- Test various exclusion scenarios
- Update PRD with exclusion mode feature
