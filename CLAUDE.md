# SpotBoard - Chrome Extension

Chrome extension that captures live website sections (news, deals, scores) into a personal dashboard. Manual refresh model — designed for 2-3 daily check-ins.

**Private docs** (PRD, backlog, learnings, metrics): `C:\apps\spotboard-private\` — read CONTEXT.md there first every session.

---

## Architecture

**Tech**: Vanilla JS + TypeScript + React (popup only) · Manifest V3

**Key files**:

| File                          | Role                                              |
| ----------------------------- | ------------------------------------------------- |
| `src/background.ts`           | Service worker → compiles to `dist/assets/`       |
| `src/content.ts`              | Content script (capture, DOM cleanup, preview)    |
| `src/App.tsx`                 | Popup UI (React)                                  |
| `src/utils/dom-cleanup.ts`    | Shared cleanup functions (source of truth)        |
| `public/dashboard.js`         | Dashboard logic — loaded directly, NOT compiled   |
| `public/dashboard.html`       | Dashboard page — loads ga4.js, dashboard.js, refresh-engine.js |
| `public/utils/refresh-engine.js` | 3-tier refresh fallback — loaded directly      |
| `public/ga4.js`               | GA4 analytics                                     |
| `public/utils/constants.js`   | Shared constants (GA4 credentials, SESSION_TIMEOUT_MS) |
| `scripts/build-shared.js`     | esbuild pre-build for dom-cleanup.ts → IIFE       |

**NEVER edit** `dist/` — build output only.

**Build**: `node scripts/build-shared.js && tsc -b && vite build`

**Dev**: `npm start`

---

## Storage Model

- **Chrome Sync** (`comp-{uuid}`): Metadata — URL, selector, label, fingerprint, excludedSelectors, positionBased, pauseRefresh, lastAttemptAt, lastSuccessAt, lastOutcome, lastErrorCode, lastErrorAt
- **Chrome Local** (`{uuid}`): HTML content — device-specific, no size limit

**Critical**: ALL code paths writing to `chrome.storage.sync` MUST spread ALL fields — partial writes silently strip metadata.

---

## Refresh Tiers

1. Direct fetch (~70% of sites, fastest)
2. Background tab with Page Visibility API spoofing (~20%)
3. Active tab refresh (guaranteed fallback, 2-3s flash)

When adding HTML enrichment (data attributes, classes), apply it in **all three paths** — see `refresh-engine.js`.

---

## Code Style

- ES6+, no semicolons, 2-space indent
- Descriptive variable names, comments for non-obvious logic only
- `const DEBUG = false` in constants.js / background.ts — gate verbose logs with `if (DEBUG)`

---

## Tool Preferences

- Use **Serena MCP tools** (`read_file`, `replace_content`, `find_symbol`, etc.) for file operations — more efficient than native tools
- **Exception**: Use native `Edit` tool for multi-line inserts — Serena `replace_content` regex mode inserts literal `\n` instead of newlines
- **Browser/DOM debugging**: Use `evaluate_script` on specific elements, not full-page `take_snapshot`

---

## Git

- Public repo — no API keys, no strategy docs, no private docs
- Branch naming: `feature/`, `fix/`, `refactor/`
- Commits focused and atomic · Version tags: `v1.x.x`
- Dev traffic filter: GA4 events send `user_id: "owner"` (v1.3.1+) — filter in BigQuery with `WHERE user_id != 'owner'`
