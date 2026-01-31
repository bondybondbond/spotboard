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
  ├── dashboard.html   → loads scripts in order below
  ├── dashboard.js     → NOT compiled, edit directly ✓
  ├── ga4.js           → NOT compiled, edit directly ✓ (references constants.js for credentials)
  └── utils/
      ├── constants.js       → shared config (GA4 creds, DEBUG flag) — loaded FIRST ✓
      ├── dom-cleanup.js     → edit directly ✓
      ├── feedback-data.js   → edit directly ✓
      ├── fingerprint.js     → edit directly ✓
      └── refresh-engine.js  → edit directly ✓

dist/          → Build output (NEVER EDIT)
  ├── assets/          → Compiled TypeScript output
  │   ├── background.js   ← from src/background.ts
  │   ├── content.js      ← from src/content.ts
  │   └── main.js         ← from src/App.tsx
  └── [public files]   → Copied from public/
```

## dashboard.html Script Load Order

**Order matters — constants.js MUST load first:**

1. `constants.js` — shared config (GA4 credentials, DEBUG flag)
2. `dom-cleanup.js` — sanitization pipeline
3. `fingerprint.js` — component fingerprinting
4. `refresh-engine.js` — refresh logic
5. `feedback-data.js` — feedback/metrics
6. `ga4.js` — analytics (reads credentials from constants.js)
7. `dashboard.js` — main dashboard logic

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

### Rule 4: GA4 credentials live in constants.js
`public/utils/constants.js` is the single source of truth for GA4_MEASUREMENT_ID, GA4_API_SECRET, GA4_ENDPOINT, SESSION_TIMEOUT_MS, and DEBUG flag. `ga4.js` references these at runtime (no longer hardcoded). `src/background.ts` keeps its own copy (service worker can't load script tags) with a comment pointing to constants.js.

## File Type Quick Reference

| File | Edit Location | Why |
|------|---------------|-----|
| background.js | src/background.ts | Manifest: assets/background.js |
| content.js | src/content.ts | Compiled TypeScript |
| constants.js | public/utils/constants.js | Shared config, loaded first |
| dashboard.js | public/dashboard.js | Static file, loaded directly |
| ga4.js | public/ga4.js | Static file, reads from constants.js |
| refresh-engine.js | public/utils/ | Static file, loaded directly |

## Common Mistakes to Avoid

1. **DON'T** create `public/background.js` - it won't be used (manifest points to assets/)
2. **DON'T** edit `dist/` files directly
3. **DON'T** define same function in multiple files loaded by same HTML page
4. **DON'T** hardcode GA4 credentials in ga4.js — use constants.js
5. **DO** grep for existing storage keys before creating new ones
6. **DO** rebuild (`npm run build`) after editing `src/*.ts` files
7. **DO** update BOTH constants.js AND background.ts when changing GA4 credentials

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
*Updated: 2026-01-31 — added constants.js, updated script load order, GA4 credential rules*
