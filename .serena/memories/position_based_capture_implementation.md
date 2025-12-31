# Position-Based Capture Feature - Implementation Plan

## Overview
Auto-detect headerless captures and use position-based refresh (skip fingerprint verification). Users unaware of mechanics unless they check info modal or Advanced settings.

## Data Model Change
Add to component metadata:
- `positionBased: boolean` (default: false)
- Stored in sync storage alongside other metadata

---

## BATCH 1: Data Model + Storage (20 mins)

### Files:
1. `src/App.tsx` - Add `positionBased?: boolean` to Component interface (line ~13)
2. `src/content.ts` - Add `positionBased` to metadata object and syncData (lines ~1072, ~1087)

### Logic:
```javascript
// After fingerprint extraction (~line 1041)
const hasStableHeading = !!heading; // heading already extracted
const positionBased = !hasStableHeading;
```

### Storage:
```javascript
syncData = {
  [syncKey]: {
    ...existingFields,
    positionBased: positionBased
  }
}
```

---

## BATCH 2: Advanced Settings UI in Capture Modal (25 mins)

### Files:
1. `src/content.ts` - Modify `showCaptureConfirmation()` function (~line 958)

### Changes:
1. Pass `positionBased` detection result to modal
2. Add collapsible "⚙️ Advanced" section at bottom of modal
3. Add radio buttons for capture mode (pre-selected based on detection)
4. Read selected value on Confirm click

### HTML to add (inside modal.innerHTML):
```html
<div style="margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 12px;">
  <div id="advancedToggle" style="cursor: pointer; font-size: 13px; opacity: 0.8;">
    ⚙️ Advanced
  </div>
  <div id="advancedPanel" style="display: none; margin-top: 8px; font-size: 13px;">
    <div style="margin-bottom: 4px;">Capture mode:</div>
    <label style="display: block; margin: 4px 0; cursor: pointer;">
      <input type="radio" name="captureMode" value="header" ${!positionBased ? 'checked' : ''}>
      Header-based (uses section title)
    </label>
    <label style="display: block; margin: 4px 0; cursor: pointer;">
      <input type="radio" name="captureMode" value="position" ${positionBased ? 'checked' : ''}>
      Position-based (uses position of spot on the page)
    </label>
  </div>
</div>
```

### JavaScript to add:
```javascript
// Toggle Advanced panel
document.getElementById('advancedToggle').addEventListener('click', () => {
  const panel = document.getElementById('advancedPanel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
});

// On confirm, read selected mode
const selectedMode = document.querySelector('input[name="captureMode"]:checked').value;
const finalPositionBased = selectedMode === 'position';
```

---

## BATCH 3: Skip Fingerprint Check in Refresh (20 mins)

### Files:
1. `public/utils/refresh-engine.js` - Multiple locations

### Location 1: Direct fetch fingerprint mismatch (~line 830-850)
Add early check:
```javascript
// Before fingerprint matching logic
if (component.positionBased) {
  console.log('📍 Position-based capture - skipping fingerprint verification');
  // Continue with refresh without fingerprint check
}
```

### Location 2: Skeleton fallback fingerprint check (~line 938-945)
```javascript
// Modify existing check
if (!component.positionBased && originalFingerprint && !tabHtml.toLowerCase().includes(originalFingerprint.toLowerCase())) {
  console.warn('[Skeleton Fallback] Fingerprint mismatch - rejecting update');
  return { success: false, keepOriginal: true };
}
// If positionBased, skip this rejection
```

### Location 3: Self-healing heading fallback (~line 1005-1020)
Skip heading-based detection for position-based captures:
```javascript
if (!component.positionBased && component.headingFingerprint) {
  // Existing heading fallback logic
}
```

---

## BATCH 4: Info Modal Update on Dashboard (15 mins)

### Files:
1. `public/dashboard.js` - Info modal creation (~line 580-650)

### Changes:
Add new row to info modal content:

```javascript
// Inside info modal HTML generation
<div style="margin-bottom: 12px;">
  <div style="font-weight: 600; margin-bottom: 4px;">Capture method:</div>
  <div>${component.positionBased ? 'Position-based' : 'Header-based'}</div>
</div>
```

Insert after "Last updated:" section, before "OK" button.

---

## BATCH 5: Dashboard Data Loading (10 mins)

### Files:
1. `public/dashboard.js` - Component loading (~line 30-40)

### Changes:
Ensure `positionBased` is loaded from storage:
```javascript
// In loadComponents or similar
positionBased: comp.positionBased || false,
```

Also update any places that map component data to preserve the field.

---

## Testing Checklist

### Capture Tests:
- [ ] BBC Most Read → Header detected → positionBased = false
- [ ] HotUKDeals deals → No header → positionBased = true (auto)
- [ ] Gumtree search results → Check detection
- [ ] Advanced toggle works and overrides detection

### Refresh Tests:
- [ ] Header-based component → Fingerprint verified as before
- [ ] Position-based component → Fingerprint check skipped
- [ ] Position-based + content rotated → Still refreshes successfully
- [ ] Direct fetch path works
- [ ] Tab-based fallback path works

### Dashboard Tests:
- [ ] Info modal shows "Capture method: Header-based" or "Position-based"
- [ ] No visible indicator in card header (clean UI)

---

## Files Summary

| File | Changes |
|------|---------|
| `src/App.tsx` | Add `positionBased` to interface |
| `src/content.ts` | Detection logic + Advanced UI + storage |
| `public/utils/refresh-engine.js` | Skip fingerprint check if positionBased |
| `public/dashboard.js` | Load positionBased + info modal row |

---

## Estimated Total: 90 mins (5 batches)

## Recommendation: Sonnet
- Logic is straightforward (boolean flag, conditional checks)
- No complex architectural decisions
- Clear pattern: detect → store → skip check → display
- Opus better reserved for debugging complex issues
