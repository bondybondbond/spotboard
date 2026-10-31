// #234: the fixed popup / window waits in refresh-engine.js (page load 2 s, consent 3 s, JS load 3 s, widen settle 1 s or 4 s,
// window close 3 s) are not what the page-flow tests exercise, so they resolve on a microtask. The stub lives for the WHOLE
// test (install in beforeEach, restore in afterEach); removing it after the first call made every later call in the same
// test wait the real 6-12 s. Every requested wait is logged, so a test can still assert WHICH wait the code asked for.
//
//   beforeEach(() => { waits = installFastTimers() })      // optional { shrink: [350, 500] } -> real 1 ms timers
//   afterEach(restoreFastTimers)
//
// restoreFastTimers throws if a wait of 1 s or more reached a real timer, so a new wait value the stub does not cover fails
// loudly instead of silently costing seconds in the suite.
const realSetTimeout = globalThis.setTimeout
const INSTANT_MS = [1000, 2000, 3000, 4000]

let realLongWaits = []

export function installFastTimers({ shrink = [] } = {}) {
  const waits = []
  realLongWaits = []
  globalThis.setTimeout = (fn, ms, ...args) => {
    waits.push(ms)
    if (INSTANT_MS.includes(ms)) { queueMicrotask(fn); return 0 }
    if (ms >= 1000) realLongWaits.push(ms)
    return realSetTimeout(fn, shrink.includes(ms) ? 1 : ms, ...args)
  }
  return waits
}

export function restoreFastTimers() {
  globalThis.setTimeout = realSetTimeout
  const leaked = realLongWaits
  realLongWaits = []
  if (leaked.length) throw new Error(`real wait(s) of ${leaked.join(', ')} ms reached a real timer; add them to INSTANT_MS in tests/helpers/fast-timers.js (or fix the test)`)
}
