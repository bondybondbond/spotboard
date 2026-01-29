# Feedback Modal Fix (v1.2.1 → v1.2.2)

## Problems Fixed

### v1.2.0 Issues:
1. **Flash on load**: Modal appeared briefly then vanished
2. **Unresponsive buttons**: Click handlers never attached when criteria not met

### v1.2.2 Fixes (28 Jan 2026):

**Issue 1 - Flash**: CSS had `display: flex` → bubble visible before JS runs
- **Fix**: Changed CSS to `display: none`, JS sets `display: flex` when criteria met

**Issue 2 - Click handlers**: Event listeners were attached AFTER criteria checks with early `return`
- **Fix**: Restructured `initFeedbackBubble()` to attach listeners FIRST, then check visibility

**Issue 3 - Empty board flash**: Same pattern - visible by default in HTML
- **Fix**: Added `display: none` to `.empty-state` CSS, JS shows when board is actually empty

## Key Pattern Learned
**Separate setup (listeners) from state (visibility)**:
```javascript
// BAD: return early = listeners never attached
function init() {
  if (!shouldShow) return;  // ← exits before listeners
  element.addEventListener(...)  // ← never reached
}

// GOOD: attach first, then control visibility
function init() {
  element.addEventListener(...)  // ← always runs
  element.style.display = shouldShow ? 'flex' : 'none';
}
```

## Files Modified
- `public/dashboard.html`: CSS changes for `#feedback-bubble` and `.empty-state`
- `public/dashboard.js`: Restructured `initFeedbackBubble()`, updated empty state logic

## Snooze Durations (unchanged)
- Completed: 45 days
- Remind later: 7 days
- Dismissed: 7 days
- Partial completion: 3 days