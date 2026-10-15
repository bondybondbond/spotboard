// #202: Kalshi mounts its Breaking News + comments only after a scroll in the 300px refresh popup, so the selected
// block arrives with no list items while the saved copy has some. tryActiveTab runs ONE bounded, structure-driven
// settle in that case (no site constants) and accepts the result only if the cleaned capture is comparable to the
// saved copy. jsdom has no layout and no site, so the site is simulated: it mounts a batch of <li> per scrollTo like
// Kalshi (15 Oct: 0, 0, 0, then 22 -> 31 -> 36). jsdom != Chrome: the real-site proof is the e2e, these pin the rules.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
const LL = await import('../.test-build/utils/lazy-load.js')
const { settleStructure, needsStructureSettle, structureRecovered, countStructure } = LL
window.LazyLoad = LL // loaded by dashboard.html in production; _tabRefreshForComponent's recovery check reads it

let block, scrollCalls

// mounts[i] = items present after the i-th scrollTo (the last value repeats). Dropping values model a virtualised
// list that unmounts what scrolled away.
function setup(mounts, { head = '<p>page head only</p>', pageHeight = 20000 } = {}) {
  document.body.innerHTML = `<div id="b">${head}<ul id="l"></ul></div>`
  block = document.getElementById('b')
  scrollCalls = []
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, get: () => pageHeight })
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => 0 })
  Object.defineProperty(window, 'scrollX', { configurable: true, get: () => 0 })
  block.getBoundingClientRect = () => ({ top: 100, bottom: 400, height: 300 })
  window.scrollTo = (arg) => {
    const n = mounts[Math.min(scrollCalls.length, mounts.length - 1)]
    scrollCalls.push(arg.top)
    document.getElementById('l').innerHTML = '<li>item</li>'.repeat(n)
  }
}
const fast = { stepWaitMs: 1, finalSettleMs: 1 }

test('predicate: only a block with NO structure against a structured saved copy is settled', () => {
  assert.equal(needsStructureSettle(0, 36), true)
  assert.equal(needsStructureSettle(0, 3), true)
  assert.equal(needsStructureSettle(0, 2), false, 'saved copy without real structure: nothing to recover')
  assert.equal(needsStructureSettle(0, 0), false, 'no saved structure at all (e.g. a price card)')
  assert.equal(needsStructureSettle(1, 36), false, 'a partial block is NOT settled (known limit)')
  assert.equal(needsStructureSettle(36, 36), false, 'healthy card')
})

test('recovery rule: at least half of the saved structure, never below the floor', () => {
  assert.equal(structureRecovered(18, 36), true)
  assert.equal(structureRecovered(17, 36), false)
  assert.equal(structureRecovered(2, 36), false)
  assert.equal(structureRecovered(3, 4), true, 'floor of 3 wins over half of 4')
  assert.equal(structureRecovered(2, 4), false)
})

test('Kalshi shape (15 Oct): flat steps only count once it has grown, then stops after 2; no scroll-back', async () => {
  setup([0, 0, 0, 22, 31, 31, 31, 31])
  const r = await settleStructure(block, 36, fast)
  assert.equal(r.triggered, true)
  assert.equal(r.before, 0)
  assert.equal(r.peak, 31)
  assert.equal(r.count, 31)
  assert.equal(r.steps, 7, '3 steps before the first mount + 2 growing + exactly 2 flat')
  assert.equal(scrollCalls.length, 7, 'no scroll-back after the settle')
  assert.equal(r.capped, false)
})

test('stops as soon as the block holds as much structure as the saved copy (no chasing an endless comments feed)', async () => {
  setup([0, 0, 0, 22, 31, 36, 68, 99])
  const r = await settleStructure(block, 4, fast)
  assert.equal(r.steps, 4)
  assert.equal(r.count, 22)
  assert.equal(r.capped, false)
})

test('healthy block (already has structure) is left alone: zero scroll calls', async () => {
  setup([5])
  document.getElementById('l').innerHTML = '<li>a</li><li>b</li><li>c</li>'
  const r = await settleStructure(block, 36, fast)
  assert.equal(r.triggered, false)
  assert.equal(r.steps, 0)
  assert.deepEqual(scrollCalls, [])
})

test('negative: the list is truly gone -> one walk down the page (bounded by the page bottom), nothing mounted', async () => {
  setup([0], { pageHeight: 3000 })
  const r = await settleStructure(block, 36, fast)
  assert.equal(r.triggered, true)
  assert.ok(r.steps >= 2 && r.steps <= 8, 'steps=' + r.steps)
  assert.equal(r.count, 0)
  assert.equal(r.capped, false)
})

test('negative on a very long page: the 30-step cap ends the walk', async () => {
  setup([0], { pageHeight: 1000000 })
  const r = await settleStructure(block, 36, fast)
  assert.equal(r.steps, 30)
  assert.equal(r.capped, true)
})

test('partial mount that stalls at 2 of 36: the settle just reports what is left (the verdict is the extension\'s)', async () => {
  setup([2])
  const r = await settleStructure(block, 36, fast)
  assert.equal(r.count, 2)
  assert.equal(r.steps, 3, 'grew once, then 2 flat steps')
})

test('virtualised list: peak is tracked, and count is what is LEFT for extraction', async () => {
  setup([20, 30, 12, 12, 12])
  const r = await settleStructure(block, 36, fast)
  assert.equal(r.peak, 30)
  assert.equal(r.count, 12)
})

test('trusted user input aborts the walk (their scroll or typing wins); untrusted events are ignored', async () => {
  setup([0])
  const handlers = []
  const realAdd = window.addEventListener
  window.addEventListener = (type, fn, ...rest) => { if (type === 'wheel') handlers.push(fn); return realAdd.call(window, type, fn, ...rest) }
  const origScrollTo = window.scrollTo
  window.scrollTo = (arg) => {
    origScrollTo(arg)
    if (scrollCalls.length === 1) handlers.forEach(h => h({ isTrusted: false })) // our own synthetic event: ignored
    if (scrollCalls.length === 2) handlers.forEach(h => h({ isTrusted: true }))
  }
  try {
    const r = await settleStructure(block, 36, fast)
    assert.equal(r.aborted, true)
    assert.equal(r.steps, 2, 'no further scroll after the user took over')
  } finally { window.addEventListener = realAdd }
})

test('the time cap ends the walk', async () => {
  setup([0], { pageHeight: 1000000 })
  const r = await settleStructure(block, 36, { stepWaitMs: 5, finalSettleMs: 1, maxMs: 20 })
  assert.equal(r.capped, true)
  assert.ok(r.steps < 30)
})

test('endless feed is bounded by the step cap', async () => {
  setup(Array.from({ length: 100 }, (_, i) => (i + 1) * 5))
  const r = await settleStructure(block, 36, { ...fast, maxSteps: 6 })
  assert.equal(r.steps, 6)
  assert.equal(r.capped, true)
})

test('page bottom stops the walk even when nothing mounted', async () => {
  setup([0], { pageHeight: 400 })
  const r = await settleStructure(block, 36, fast)
  assert.ok(r.steps <= 2)
})

test('countStructure counts li, tr and article only', () => {
  document.body.innerHTML = '<div id="r"><ul><li>a</li></ul><table><tbody><tr><td>x</td></tr></tbody></table><article>z</article><p>no</p></div>'
  assert.equal(countStructure(document.getElementById('r')), 3)
})

// ── tryActiveTab / _tabRefreshForComponent wiring ─────────────────────────────────────────────────
const realSetTimeout = globalThis.setTimeout
const THIN = '<div id="list"><p>page head only</p></div>'
const FULL = `<div id="list">${'<li>item</li>'.repeat(36)}</div>`
const STUB = '<div id="list"><li>item</li><li>item</li></div>'
const SETTLED = { triggered: true, count: 36, peak: 36, steps: 8 }
let extractArgs, extractResults

beforeEach(() => {
  extractArgs = []
  extractResults = []
  globalThis.setTimeout = (fn, ms, ...a) => (ms === 2000 || ms === 3000 || ms === 4000) ? (queueMicrotask(fn), 0) : realSetTimeout(fn, ms, ...a)
  globalThis.screen = { availLeft: 0, availWidth: 1920, availTop: 0, availHeight: 1040 }
  globalThis.chrome = {
    windows: { create: async () => ({ id: 1, tabs: [{ id: 7 }] }), getLastFocused: async () => ({ id: 99 }), update: async () => {}, remove: async () => {} },
    scripting: {
      executeScript: async (opts) => {
        if (opts.files) return []
        if (Array.isArray(opts.args)) {
          extractArgs.push(opts.args)
          return [{ result: extractResults[Math.min(extractArgs.length - 1, extractResults.length - 1)] }]
        }
        if (opts.world === 'MAIN') return /visibilityState/.test(String(opts.func)) ? [{ result: true }] : []
        return [{ result: { found: false } }]
      }
    }
  }
})
const run = async (meta) => {
  try { return await g.tryActiveTab('https://example.com/', '#list', null, meta) } finally { globalThis.setTimeout = realSetTimeout }
}
const result = (html, structure) => ({ html, hasEmptyImageSlots: false, structure })
// the check _tabRefreshForComponent builds: counts the CLEANED capture against the saved copy
const checkFor = expected => html => { const count = g._countStructure(html); return { count, ok: structureRecovered(count, expected) } }

test('tryActiveTab hands the saved structure count to the extraction', async () => {
  extractResults = [result(FULL, null)]
  await run({ expectedStructure: 36 })
  assert.deepEqual(extractArgs[0], ['#list', null, 36])
})

test('no saved structure (expectedStructure absent) -> 0 is passed, so the extraction never settles', async () => {
  extractResults = [result(FULL, null)]
  await run({})
  assert.equal(extractArgs[0][2], 0)
})

test('settle recovered the list -> the capture is returned', async () => {
  extractResults = [result(FULL, SETTLED)]
  assert.equal(await run({ expectedStructure: 36, structureCheck: checkFor(36) }), FULL)
})

test('settle stalled at a partial count -> rejected (null), last good copy kept by the caller', async () => {
  extractResults = [result(STUB, { ...SETTLED, count: 2 })]
  const meta = { expectedStructure: 36, structureCheck: checkFor(36) }
  assert.equal(await run(meta), null)
  assert.equal(meta.structureSettle.cleanedCount, 2, 'the cleaned count is reported for diagnostics')
})

test('settle ran but the cleaned capture is still at zero -> html returned, so the existing isContentLost gate fails it as before', async () => {
  extractResults = [result(THIN, { ...SETTLED, count: 0 })]
  assert.equal(await run({ expectedStructure: 36, structureCheck: checkFor(36) }), THIN)
})

test('a shrunken healthy card (no settle ran, 10 of 36) is NOT touched by the recovery rule', async () => {
  const ten = '<div id="list">' + '<li>i</li>'.repeat(10) + '</div>'
  extractResults = [result(ten, null)]
  assert.equal(await run({ expectedStructure: 36, structureCheck: checkFor(36) }), ten)
})

test('widen retry after a settle: the FINAL capture is the one checked', async () => {
  extractResults = [
    { html: STUB, hasEmptyImageSlots: true, structure: { ...SETTLED, count: 2 } },
    result(FULL, null)
  ]
  assert.equal(await run({ expectedStructure: 36, structureCheck: checkFor(36) }), FULL)
  assert.equal(extractArgs.length, 2)
  assert.equal(extractArgs[1][2], 0, 'the retry must not pay a second settle')
})

test('widen retry after a settle that left a stub: a retry capture still far below the saved copy is rejected too', async () => {
  const ten = '<div id="list">' + '<li>i</li>'.repeat(10) + '</div>'
  extractResults = [
    { html: STUB, hasEmptyImageSlots: true, structure: { ...SETTLED, count: 2 } },
    result(ten, null)
  ]
  assert.equal(await run({ expectedStructure: 36, structureCheck: checkFor(36) }), null)
})

test('wiring: _tabRefreshForComponent counts the saved copy and builds a check on the cleaned capture', async () => {
  const realTab = g.tabBasedRefresh
  let opts
  g.tabBasedRefresh = async (...a) => { opts = a[7]; return { html: null, activeFocusNeeded: false } }
  try {
    const component = { url: 'https://example.com/', selector: '#list', html_cache: '<div id="list"><li>a</li><li>b</li><li>c</li><li>d</li></div>' }
    await g._tabRefreshForComponent(component, null, 0, 0)
    assert.equal(opts.expectedStructure, 4)
    const fine = opts.structureCheck('<div id="list"><li>a</li><li>b</li><li>c</li></div>')
    assert.deepEqual([fine.count, fine.ok], [3, true])
    const stub = opts.structureCheck('<div id="list"><li>a</li></div>')
    assert.deepEqual([stub.count, stub.ok], [1, false])
  } finally { g.tabBasedRefresh = realTab }
})

test('_countStructure counts li/tr/article of a saved copy (inert parse)', () => {
  assert.equal(g._countStructure('<ul><li>a</li><li>b</li></ul><table><tr><td>x</td></tr></table><article>y</article>'), 4)
  assert.equal(g._countStructure('<p>54%</p>'), 0)
  assert.equal(g._countStructure(''), 0)
  assert.equal(g._countStructure(undefined), 0)
})
