# Onboarding Redesign — v1.3.2 (2026-02-24)

## Status: Implemented, awaiting feedback/fixes

---

## What Was Built

Full guided first-capture onboarding replacing the old purple welcome modal.

### Phase 1 — First-Run Modal (`public/dashboard.html` + `public/dashboard.js`)

- New `#first-run-modal` replaces the old `#welcome-modal` show logic
- Shows only when: `!hasSeenWelcome && !onboardingCompleted && !hasCards`
- "Let's go →" button: sets `hasSeenWelcome`, reloads (no DOM cleanup needed)
- "I already know how it works" skip link → confirmation row → "Yes, skip" sets `onboardingCompleted: true` + reloads
- `#welcome-modal` retained as-is (still accessible via ? info button)

### Phase 2 — First-Capture Empty State (`public/dashboard.js`)

- Subtitle updated: "Pick a site below to try your first capture — SpotBoard opens it and guides you through."
- URL param changed: `?spotboard_capture=1` → `?spotboard_onboarding=1`
- ESPN replaced with NPR (ESPN CSP blocks auto-capture): `{ name: 'NPR', url: 'https://www.npr.org', ... }`
- Skip link row added below `.practice-fallback` div (lets user skip to empty dashboard)
- Font sizes bumped +2px for interactive directory elements

### Phase 3 — Subsequent Empty State (`public/dashboard.js` + `public/dashboard.html`)

- `SUBSEQUENT_EMPTY_CATEGORIES` constant (News/Sports/Tech/Deals/Weather × 3 domains each)
- `renderSubsequentEmptyState(container)` — DOM methods only (no innerHTML — security hook)
- Both `renderEmptyState(container)` call sites wrapped with `onboardingCompleted` check:
  
  ```js
  chrome.storage.local.get(['onboardingCompleted'], ({ onboardingCompleted }) => {
    if (onboardingCompleted) renderSubsequentEmptyState(container);
    else renderEmptyState(container);
  });
  ```

### Phase 4 — Guided Tour (`src/content.ts`)

**All new code is in the first ~310 lines of content.ts**

**4a — `isOnboardingMode` (L18-19):**

```ts
let isOnboardingMode = sessionStorage.getItem('sb_onboarding') === '1'
  && sessionStorage.getItem('sb_onboarding_url') === window.location.pathname;
```

- Pathname-scoped: prevents same-origin navigation (e.g. NPR article → NPR homepage) from keeping mode active

**4b — URL param detection (L285-306):**

- Detects `?spotboard_onboarding=1`, sets sessionStorage, strips param via `history.replaceState`
- Separate `if (isOnboardingMode)` block injects coach (runs on hard refresh too, after param is gone)

**4c — Confetti (L68-133):**

- Lazy canvas (`_ensureConfettiCanvas()`) — created on first call, appended to body
- Module vars: `_confettiCanvas`, `_confettiCtx`, `_confettiPieces`, `_confettiFrame`
- `fireConfetti(count)` + `animateConfetti()` — ported from `docs/sandbox.html`
- Respects `prefers-reduced-motion`

**4d — Shadow DOM Coach Card (L136-283):**

- `injectOnboardingCoach()` — creates `#sb-coach-host` with `attachShadow({ mode: 'closed' })`
- Host: `pointer-events:none`, `z-index:2147483646`, `data-spotboard-ignore="true"` (prevents accidental capture)
- Cards inside shadow have `pointer-events:auto` override
- **CRITICAL**: Uses `shadow.querySelector('#id')` — ShadowRoot has NO `getElementById`
- `_makeCard()` helper inside function, uses DOM methods only
- Step 1 shown immediately on inject; steps advance via `advanceOnboardingCoach(stage)`
- `advanceOnboardingCoach('completed')`: shows completion overlay, fires 150 confetti, sets `onboardingCompleted: true` in storage, clears sessionStorage

**4e — Guards (three sites):**

- `advanceOnboardingCoach('selected')` at L1238 (after isPlaygroundPage selected beacon)
- `advanceOnboardingCoach('capturing')` at L2115 (after isPlaygroundPage capturing beacon)
- `advanceOnboardingCoach('completed')` at L1849 (after the `return; // Skip normal sync+local save flow` block)

**4f — Hide Cancel button:**

- `#cancelSpot` hidden when `isOnboardingMode` (user should complete the flow)

**4g — Abort cleanup (`_clearOnboardingState()`):**

- Called in: Cancel click handler, modal Escape handler, `handleKeydown` Escape
- Clears `sb_onboarding` + `sb_onboarding_url` from sessionStorage, removes coach host

### Phase 5 — Sandbox Beacon Diagnostics

- `console.log('[SB] beacon: selected/capturing/completed, isPlaygroundPage=', ...)` added before each `dataset.stage` assignment

---

## Key State Flags

| Flag                  | Storage                | Purpose                                              |
| --------------------- | ---------------------- | ---------------------------------------------------- |
| `hasSeenWelcome`      | `localStorage`         | Suppress first-run modal after first view            |
| `onboardingCompleted` | `chrome.storage.local` | Show subsequent empty state instead of first-capture |
| `sb_onboarding`       | `sessionStorage`       | Persist guided tour across hard refresh              |
| `sb_onboarding_url`   | `sessionStorage`       | Scope tour to original page pathname                 |

---

## Key Patterns / Gotchas

- **ShadowRoot.querySelector not getElementById** — critical, getElementById doesn't exist on ShadowRoot
- **`pointer-events:none` on host + `:auto` on children** — host is transparent, buttons inside shadow work
- **`_clearOnboardingState()` in ALL abort paths** — Escape key trap bug if missed
- **Same-origin ghosting fix** — pathname-scoped sessionStorage prevents NPR homepage triggering tour if user navigated
- **`advanceOnboardingCoach('completed')` fires BEFORE async storage saves** — 2s setTimeout means saves are concurrent; by user-click-to-dashboard time, save is complete
- **No innerHTML anywhere** — security hook blocks all innerHTML assignments in dashboard.js/content.ts

---

## Files Modified

- `src/content.ts` — Phases 4 + 5 (large additions at top, guards at 3 sites, abort cleanup)
- `public/dashboard.js` — Phases 1, 2, 3
- `public/dashboard.html` — CSS for first-run modal, subsequent empty state, font bumps

## Build

`npm run build` passes clean (0 TS errors, content.js 46.76 kB).
