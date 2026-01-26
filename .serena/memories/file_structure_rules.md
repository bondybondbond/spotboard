# File Structure Rules - SpotBoard

**CRITICAL: Prevents editing wrong files**

## Directory Structure

```
src/           → TypeScript source (EDIT THESE)
  ├── background.ts    → compiles to dist/assets/background.js
  ├── content.ts       → compiles to dist/assets/content.js
  ├── App.tsx          → compiles to dist/assets/main.js
  └── main.tsx         → React entry point

public/        → Static files (copied as-is to dist/)
  ├── dashboard.html   → loads ga4.js, dashboard.js, refresh-engine.js
  ├── dashboard.js     → NOT compiled, edit directly ✓
  ├── ga4.js           → NOT compiled, edit directly ✓
  └── utils/
      ├── dom-cleanup.js      → edit directly ✓
      ├── feedback-data.js    → edit directly ✓
      ├── fingerprint.js      → edit directly ✓
      └── refresh-engine.js   → edit directly ✓

dist/          → Build output (NEVER EDIT)
  ├── assets/          → Compiled TypeScript output
  │   ├── background.js   ← from src/background.ts
  │   ├── content.js      ← from src/content.ts
  │   └── main.js         ← from src/App.tsx
  └── [public files]   → Copied from public/
```

## Rules

### Rule 1: Check for .ts version first
Before editing ANY `.js` file, ask: "Is there a `.ts` source in `src/`?"
- If YES → edit `src/*.ts`, never the output
- If NO → edit `public/*.js` directly

### Rule 2: Never edit dist/
The `dist/` folder is regenerated on every `npm run build`. Changes will be overwritten.

### Rule 3: Manifest determines what's loaded
Check `public/manifest.json` to see which files are actually used:
- `"service_worker": "assets/background.js"` → from src/background.ts
- dashboard.html script tags → from public/

## File Type Quick Reference

| File | Edit Location | Why |
|------|---------------|-----|
| background.js | src/background.ts | Manifest: assets/background.js |
| content.js | src/content.ts | Compiled TypeScript |
| dashboard.js | public/dashboard.js | Static file, loaded directly |
| ga4.js | public/ga4.js | Static file, loaded directly |
| refresh-engine.js | public/utils/ | Static file, loaded directly |

## Common Mistakes to Avoid

1. **DON'T** create `public/background.js` - it won't be used (manifest points to assets/)
2. **DON'T** edit `dist/` files directly
3. **DON'T** define same function in multiple files loaded by same HTML page
4. **DO** grep for existing storage keys before creating new ones
5. **DO** rebuild (`npm run build`) after editing `src/*.ts` files

## Storage Key Consistency

Always check existing keys before creating new ones:
- `install_date` (not firstInstallDate) - stored by background.ts
- `clientId` - GA4 anonymous ID
- `sessionData` - GA4 session tracking
- `hasSeenWelcome` - welcome_viewed flag
- `firstCaptureCompleted` - first_capture flag
- `firstRefreshCompleted` - first_refresh_24h flag

---
*Created: 2026-01-26 after Batch 3 debugging revealed file location confusion*
