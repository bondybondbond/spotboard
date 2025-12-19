# Sync Storage Data Integrity Pattern

## Critical Bug Fixed (Dec 14, 2024)

**Problem:** Popup delete handler and dashboard edit/delete handlers stripped `customLabel` and `excludedSelectors` when saving to sync storage, causing silent data loss across all components.

**Root Cause:** Partial update anti-pattern - only mapping subset of fields when writing to `chrome.storage.sync.set()`.

**Universal Fix Pattern:**

```javascript
// When updating sync storage, ALWAYS map ALL metadata fields:
const syncData = updated.map(c => ({
  id: c.id,
  name: c.name,
  url: c.url,
  favicon: c.favicon,
  customLabel: c.customLabel,              // User's custom label
  selector: c.selector,                    // CSS selector
  excludedSelectors: c.excludedSelectors || []  // Excluded elements
}));
chrome.storage.sync.set({ components: syncData });
```

**Prevention Rule:** 
Any code writing to `chrome.storage.sync.set({ components: ... })` MUST map ALL metadata fields. Grep for `chrome.storage.sync.set` to audit.

**Locations Fixed:**
1. `public/dashboard-new.js` - delete handler
2. `public/dashboard-new.js` - edit label handler
3. `src/App.tsx` - popup delete handler

**Note (Dec 20, 2024):** Storage format migrated to per-component keys (`comp-{uuid}`). Pattern still applies - always map ALL metadata fields when updating individual component keys.

**Testing:**
- Edit label → delete other component → label persists ✅
- Exclude elements → delete other component → exclusions persist ✅
- Cross-device sync preserves all metadata ✅
