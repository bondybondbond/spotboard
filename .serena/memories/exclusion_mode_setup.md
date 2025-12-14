# Exclusion Mode - Step 1: Confirmation Modal

## Goal
Enable users to exclude unwanted elements from captured DOMs before saving. First step: create confirmation workflow that locks capture and shows top-right modal.

## Implementation (Completed)
- Moved confirmation modal from center to top-right corner (20px from top/right)
- Purple background (#6b46c1) matching dashboard aesthetic
- Two buttons: "Confirm Spot" (green #48bb78) and "Cancel" (red #f56565)
- Element locking system prevents selecting other elements while confirming

## Technical Details

**Lock State Management:**
- Added `lockedElement: HTMLElement | null` variable to track captured element
- Lock prevents hover highlights and new captures until user confirms/cancels
- Green outline (#00ff00) applied and maintained on locked element

**Event Handling Challenges:**
- Button event listeners use capture phase `addEventListener('click', handler, true)` to fire BEFORE main handleClick
- handleClick explicitly allows modal clicks through (early return on `closest('#spotboard-capture-confirmation')`)
- handleHover reapplies green outline on every hover event to keep it visible

**Unlock Triggers:**
1. Confirm button → saves component → unlocks
2. Cancel button → exits capture mode → unlocks  
3. Escape key → closes modal → unlocks

## Current Flow
1. User clicks element → green outline locks on element
2. Top-right modal appears immediately
3. Hover other elements → nothing happens (locked)
4. Click Confirm → waits 2s → sanitizes → saves → unlocks
5. Click Cancel/Escape → unlocks → exits capture mode

## Next Steps (Not Started)
- Add exclusion functionality: clicking child elements marks them red
- Track excluded elements in array
- Sanitize HTML to remove excluded elements before saving
- Toggle exclusion on/off (click again to undo red marking)
