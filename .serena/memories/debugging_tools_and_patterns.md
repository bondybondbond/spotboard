# Debugging Tools & Patterns

## Tool Selection

**Chrome DevTools Click Issues**
- `chrome-devtools:click` tool DOES NOT WORK reliably in this environment
- ALWAYS use `Windows-MCP:Click-Tool` for clicking UI elements instead
- Windows-MCP click takes pixel coordinates like `[x, y]`

## Console Debugging Pattern

**Dashboard Refresh Behavior**
- After clicking "Refresh All", the dashboard.html page RELOADS automatically
- Page reload CLEARS all console messages
- To debug console logs during refresh:
  1. Add `alert('Check console now')` BEFORE the `location.reload()` call
  2. This pauses execution and preserves console logs
  3. User clicks OK to continue, then console resets
  4. Remove alert after debugging complete

**Where to Add Debug Alert**
In `dashboard.js`, the `refreshAll()` function has:
```javascript
// Auto-reload after success toast displays
setTimeout(() => {
  location.reload();
}, 3500);
```

Change to:
```javascript
setTimeout(() => {
  alert('🔍 DEBUG: Check console now! Click OK to reload.');
  location.reload();
}, 3500);
```

This adds temporary friction but enables proper debugging of refresh operations.