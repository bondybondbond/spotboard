# SpotBoard Private - Project Memory

## Onboarding Polish v1.3.2c + Round 2 — Complete ✅ (2026-02-28)

### What Was Done
9-fix onboarding polish pass + Round 2 tour polish (5 fixes) + reload race bug fix.

**Key architectural changes:**

**1. Onboarding re-trigger: tabId pull model** (`src/background.ts`, `src/content.ts`, `public/dashboard.js`)
- Pills click → `btn.disabled = true` → `chrome.tabs.create({ url })` → store `pendingOnboardingTabId: tab.id` in session storage
- Content script on boot sends `{ type: 'CHECK_ONBOARDING' }` (pull model — guaranteed alive)
- Background matches `sender.tab.id` vs stored tabId → clears on match → `sendResponse(true/false)`
- `return true` + async IIFE + try/catch in background handler (prevents channel-closed errors on redirect)

**2. Completion overlay: shadow DOM + dynamic re-append** (`src/content.ts`)
- `document.body.appendChild(shadowHost)` → detaches and reattaches host as last sibling
- Later DOM position + equal z-index 2147483647 = guaranteed win over capture modal

**3. Infinite reload fix** (`public/dashboard.js` ~line 870)
- `if (onboardingCompleted && metadata.length === 0 && !dashboardTourShown) { location.reload() }`

**4. Dashboard tour — current state** (`public/dashboard.js`, `public/dashboard.html`)
- Viewport-centred (`top:50%` / `translate(-50%,-50%)`) — NOT bottom-center
- SVG icons in `.icon-circle-wrapper` CSS class circles (no `style.cssText` inline strings)
- Refresh All SVG: viewBox `0 0 1200 1200`, fill `#2BB5AD`
- Completion card: dark `#1c1c1e`, white ring shadow
- Step 2 title: "Changed your mind?" / body: "Simply delete the card by pressing the [bin] button. / Try that now to continue."
- `dashboardTourShown: true` written at **card-delete time** (inside `chrome.storage.local.set` callback, before `showDashboardTourCompletion`) — not at "Let's go →" click. Prevents ~20% reload race restarting tour at step 1.
- "Let's go →" button: just calls `location.reload()` (state already committed)

**5. Confetti shared module** (`src/utils/confetti.ts` + `scripts/build-shared.js`)
- Single source for both `content.ts` (import) and `dashboard.js` (`window.sbConfetti.fireConfetti`)

**6. Info modal 'Need practice?' pill** — Amazon Deals → Wikipedia (more stable target)

**7. 'You did it!' coach card** — removed `position:relative` from `.coach-card.completion` shadow CSS; `position:fixed` (inherited) already creates containing block for X button

### Patterns → LEARNINGS.md
- §25: Shadow DOM z-index — DOM order as tiebreaker
- §26: Chrome MV3 pull model messaging + async IIFE + spam-click prevention
- §27: Lifecycle state guards for unconditional fallback reloads
- §28: CSS classes over inline style.cssText for dynamic UI
- §29: Early state commit for multi-step flow completion (write flag at logical completion, not at UX button)

---

## Cricbuzz Name Detection + Refresh Drift Fix (2026-02-22)

### Complete ✅
**Bug 1 — Wrong name "Featured Videos"**: Strategy 2 (`querySelector h1-h6`) found "FEATURED VIDEOS" before the article heading. Fixed with `isAllCapsLabel()` filter on Strategy 2 + Strategy 3 TreeWalker loop.

**`isAllCapsLabel(text)` contract** (`src/content.ts`, just before `let name = ''`):
- `if (/\d/.test(t)) return false` — "T20 WORLD CUP, 2026" kept ✅
- `if (!/[A-Z]/i.test(t)) return false` — punctuation/emoji-only not treated as labels
- `t === t.toUpperCase() && t.length <= 50` — pure all-caps labels skipped

**Bug 2 — Refresh fetches live scores**: Direct-fetch Strategy A fell back to `matches[0]` (live scores strip) when fingerprint failed on dynamic content. Fixed with `headingFingerprint` tiebreaker + whitespace-norm exact match before `matches[0]` (`public/utils/refresh-engine.js` ~line 1125).

---

## NOSCRIPT + innerHTML XSS Fix (2026-02-22)

### Complete ✅
- **Strategy 3 TreeWalker**: `SHOW_ELEMENT | SHOW_TEXT` + `FILTER_REJECT` on NOSCRIPT/SCRIPT/STYLE/TEMPLATE/SVG. See LEARNINGS.md §23.
- **innerHTML → textContent**: All 3 card name render sites now use `element.textContent`/`setAttribute`.
- **Files**: `src/content.ts` (TreeWalker ~line 1023, modal ~line 1316), `public/dashboard.js` (card header ~line 835, practice card ~line 626)

---

## Capture Preview Implementation (2026-02-07 → 2026-02-08)

### All Phases Complete ✅
- **Shared module**: `src/utils/dom-cleanup.ts` is single source of truth, esbuild pre-build generates IIFE for dashboard
- **Static Preview**: iframe preview in purple confirmation modal with dashboard-parity CSS
- **Live Exclusion Updates**: Debounced 300ms `updatePreview()`, scroll position preserved
- Build pipeline: `node scripts/build-shared.js && tsc -b && vite build`

### Serena Gotcha
- `replace_content` with `mode: regex` using `\n` in the `repl` string inserts literal `\n`. Use native `Edit` tool for multi-line inserts.

---

## Sentiment Coloring (2026-02-10) + Refresh Single Card (2026-02-11)

### Both Complete ✅
- **Sentiment**: TreeWalker + regex, `data-sb-sentiment` attributes, all 3 refresh paths, preview modal parity
- **Per-card refresh**: [Info][Pause][Refresh][Delete] in top bar; spinning SVG; direct sync write; `card-timestamp` class for DOM targeting
- **Key**: `showToast(message)` — 3-arg version shadowed by 2-arg at ~line 1108 (use `showStyledToast` for 3-arg)

---

## GitHub Pages Landing Site (2026-02-14)

### Complete ✅
- https://bondybondbond.github.io/spotboard/
- `docs/index.html` — problem-first, 3-image carousel, How It Works section
- UTM: `utm_source=github&utm_medium=pages&utm_campaign=homepage`
- YouTube Error 153: host demo on GitHub Pages HTTPS, open in new tab
