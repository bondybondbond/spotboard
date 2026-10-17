// #202 / #208: Kalshi mounts its Breaking News + comments only after a scroll in the 300px refresh popup, so the
// capture arrives with no list items while the saved copy has some. tryActiveTab runs ONE bounded, structure-driven
// settle in that case (no site constants) and accepts the result only if the cleaned capture is comparable to the
// saved copy. #208: every number in that decision (trigger, early stop, accept) is the CLEANED capture's count, one
// measure, because the raw block lied in both directions (breadcrumb <li> hid an empty capture; an excluded rules
// list made a thin one look complete). The loop lives in the extension page; the tab only scrolls and extracts.
// jsdom has no layout and no site, so the site is simulated. jsdom != Chrome: the real-site proof is the e2e,
// these pin the rules.
//
// #186 (invariant 6, declared in the issue record): the popup now takes one unconditional wide pass, so the tests that
// counted extractions for a healthy card gain that one extra extraction. The signalled-retry tests (layoutOk false / empty
// image slots) are untouched: that path keeps its old rule. Nothing was loosened.
//
// Behaviour map from the #202 version of this file (invariant 6: rewritten because the loop moved, nothing weakened):
//   predicate / recovery rule / Kalshi growth shape / stop at saved count / healthy untouched / truly gone / 30-step cap /
//   partial mount / virtualised peak / trusted-input abort / time cap / endless-feed cap / page bottom
//     -> same tests below, now against the io-driven loop.
//   countStructure (raw, in-tab) -> removed with the raw loop; the cleaned measure is covered by the wiring tests.
//   tryActiveTab wiring (recovered / stalled / zero / shrunken healthy / widen retry / saved-structure count) -> kept,
//     rebuilt on the walk ops. New: raw-lie both directions, one-measure drift, failed walk is fail-closed.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
const LL = await import('../.test-build/utils/lazy-load.js')
const { settleStructure, needsStructureSettle, structureRecovered } = LL
window.LazyLoad = LL // loaded by dashboard.html in production; tryActiveTab and the recovery check read it

// The measure: cleaned li (the card's own exclusions strip <li class="x">, which stands for breadcrumb / rules-list items).
const cleanedCount = html => (html.match(/<li>/g) || []).length

// A simulated page for the loop. mounts[i] = cleaned items after the i-th scroll (last value repeats); a dropping value
// models a virtualised list. raws[i] = excluded (raw-only) items present after the i-th scroll.
function fakeIO(mounts, { pageHeight = 20000, abortAt = null, raws = [0], failExtractAt = null } = {}) {
  const calls = { begin: 0, scroll: [], extract: 0, end: 0 }
  let cleaned = 0
  let raw = raws[0]
  return {
    calls,
    io: {
      begin: async () => { calls.begin++; return { y: 100, step: 540 } },
      scroll: async y => {
        calls.scroll.push(y)
        const i = Math.min(calls.scroll.length - 1, mounts.length - 1)
        cleaned = mounts[i]
        raw = raws[Math.min(calls.scroll.length - 1, raws.length - 1)]
        return { aborted: abortAt === calls.scroll.length }
      },
      extract: async () => {
        calls.extract++
        if (failExtractAt === calls.extract) return null
        return { html: '<ul>' + '<li class="x">raw</li>'.repeat(raw) + '<li>item</li>'.repeat(cleaned) + '</ul>', pageBottom: pageHeight }
      },
      measure: cleanedCount,
      end: async () => { calls.end++ }
    }
  }
}
const fast = { stepWaitMs: 1, finalSettleMs: 1 }

test('predicate: only a capture with NO cleaned structure against a structured saved copy is settled', () => {
  assert.equal(needsStructureSettle(0, 36), true)
  assert.equal(needsStructureSettle(0, 3), true)
  assert.equal(needsStructureSettle(0, 2), false, 'saved copy without real structure: nothing to recover')
  assert.equal(needsStructureSettle(0, 0), false, 'no saved structure at all (e.g. a price card)')
  assert.equal(needsStructureSettle(1, 36), false, 'a partial capture is NOT settled (known limit)')
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
  const { io, calls } = fakeIO([0, 0, 0, 22, 31, 31, 31, 31])
  const r = await settleStructure(36, 0, io, fast)
  assert.equal(r.triggered, true)
  assert.equal(r.before, 0)
  assert.equal(r.peak, 31)
  assert.equal(r.count, 31)
  assert.equal(r.steps, 7, '3 steps before the first mount + 2 growing + exactly 2 flat')
  assert.equal(calls.scroll.length, 7, 'no scroll-back after the settle')
  assert.equal(calls.extract, 8, 'one extraction per step + the final one after the short settle')
  assert.equal(calls.end, 1, 'listeners removed')
  assert.equal(r.capped, false)
  assert.equal(cleanedCount(r.html), 31, 'the returned capture is the last extraction')
})

test('stops as soon as the cleaned capture holds as much structure as the saved copy (no chasing an endless comments feed)', async () => {
  const { io } = fakeIO([0, 0, 0, 22, 31, 36, 68, 99])
  const r = await settleStructure(4, 0, io, fast)
  assert.equal(r.steps, 4)
  assert.equal(r.count, 22)
  assert.equal(r.capped, false)
})

test('healthy capture (already has structure) is left alone: no begin, no scroll, no extraction', async () => {
  const { io, calls } = fakeIO([5])
  const r = await settleStructure(36, 3, io, fast)
  assert.equal(r.triggered, false)
  assert.equal(r.steps, 0)
  assert.deepEqual([calls.begin, calls.scroll.length, calls.extract, calls.end], [0, 0, 0, 0])
})

test('negative: the list is truly gone -> one walk down the page (bounded by the page bottom), nothing mounted', async () => {
  const { io } = fakeIO([0], { pageHeight: 3000 })
  const r = await settleStructure(36, 0, io, fast)
  assert.equal(r.triggered, true)
  assert.ok(r.steps >= 2 && r.steps <= 8, 'steps=' + r.steps)
  assert.equal(r.count, 0)
  assert.equal(r.capped, false)
})

test('negative on a very long page: the 30-step cap ends the walk', async () => {
  const { io } = fakeIO([0], { pageHeight: 1000000 })
  const r = await settleStructure(36, 0, io, fast)
  assert.equal(r.steps, 30)
  assert.equal(r.capped, true)
})

test('partial mount that stalls at 2 of 36: the settle just reports what is left (the verdict is the accept check)', async () => {
  const { io } = fakeIO([2])
  const r = await settleStructure(36, 0, io, fast)
  assert.equal(r.count, 2)
  assert.equal(r.steps, 3, 'grew once, then 2 flat steps')
})

test('virtualised list: peak is tracked, and count is what is LEFT for the capture', async () => {
  const { io } = fakeIO([20, 30, 12, 12, 12])
  const r = await settleStructure(36, 0, io, fast)
  assert.equal(r.peak, 30)
  assert.equal(r.count, 12)
})

test('trusted user input aborts the walk (their scroll or typing wins): no further scroll, listeners removed', async () => {
  const { io, calls } = fakeIO([0], { abortAt: 2 })
  const r = await settleStructure(36, 0, io, fast)
  assert.equal(r.aborted, true)
  assert.equal(r.steps, 2, 'no further scroll after the user took over')
  assert.equal(calls.end, 1)
})

test('the time cap ends the walk (and counts extraction time, not just the waits)', async () => {
  const { io } = fakeIO([0], { pageHeight: 1000000 })
  const r = await settleStructure(36, 0, io, { stepWaitMs: 5, finalSettleMs: 1, maxMs: 20 })
  assert.equal(r.capped, true)
  assert.ok(r.steps < 30)
})

test('endless feed is bounded by the step cap', async () => {
  const { io } = fakeIO(Array.from({ length: 100 }, (_, i) => (i + 1) * 5))
  const r = await settleStructure(36, 0, io, { ...fast, maxSteps: 6 })
  assert.equal(r.steps, 6)
  assert.equal(r.capped, true)
})

test('page bottom stops the walk even when nothing mounted', async () => {
  const { io } = fakeIO([0], { pageHeight: 400 })
  const r = await settleStructure(36, 0, io, fast)
  assert.ok(r.steps <= 2)
})

test('#208 raw lies, thin side: 25 excluded rules-list items must NOT end the walk at the saved count', async () => {
  // fresh Senate shape: saved 22; the block holds 25+ raw items that the card strips. Cleaned 0, 0, 0, 8, 16, 16, 16.
  const { io } = fakeIO([0, 0, 0, 8, 16, 16, 16, 16], { raws: [0, 0, 0, 25, 25, 25, 25, 25] })
  const r = await settleStructure(22, 0, io, fast)
  assert.equal(r.count, 16, 'walked past the raw count (>= 22) to the cleaned plateau')
  assert.equal(r.steps, 7, 'stops on flat-after-growth, not on the raw count')
  assert.equal(structureRecovered(r.count, 22), true, '16 >= max(3, 11): accepted by the unchanged floor')
})

test('#208 raw lies, thin side with a cleaned stall: a plateau below the floor is reported, not hidden', async () => {
  const { io } = fakeIO([0, 0, 0, 8, 8, 8], { raws: [0, 0, 0, 25] })
  const r = await settleStructure(22, 0, io, fast)
  assert.equal(r.count, 8)
  assert.equal(structureRecovered(r.count, 22), false, 'the accept check still rejects it')
})

test('an extraction that returns nothing at one step keeps the previous capture and the walk goes on', async () => {
  const { io } = fakeIO([0, 22, 22, 22], { failExtractAt: 1 })
  const r = await settleStructure(36, 0, io, fast)
  assert.equal(r.count, 22)
  assert.equal(cleanedCount(r.html), 22)
})

test('the block is gone for good (every extraction returns nothing): the walk gives up after two misses instead of scrolling blind to the cap', async () => {
  const { io } = fakeIO([0], { pageHeight: 1000000 })
  io.extract = async () => null
  const r = await settleStructure(36, 0, io, fast)
  assert.equal(r.steps, 2)
  assert.equal(r.html, null)
  assert.equal(r.capped, false)
})

test('a throwing step propagates (the caller fails closed) and the listeners are still removed', async () => {
  const { io, calls } = fakeIO([0])
  io.extract = async () => { throw new Error('popup closed') }
  await assert.rejects(settleStructure(36, 0, io, fast), /popup closed/)
  assert.equal(calls.end, 1)
})

// ── tryActiveTab / _tabRefreshForComponent wiring ─────────────────────────────────────────────────
const realSetTimeout = globalThis.setTimeout
const ONE_DIV = inner => `<div id="list">${inner}</div>`
const li = n => '<li>item</li>'.repeat(n)
const xli = n => '<li class="x">raw</li>'.repeat(n)
let execCalls, site

// site.first = capture before any scroll; site.after(scrollCount) = capture after that many scrolls (default: unchanged).
beforeEach(() => {
  execCalls = []
  site = { first: ONE_DIV(''), after: () => null, scrolls: 0, hasEmptyImageSlots: false, failScroll: false, widened: false, wide: null, scrollsAtWiden: 0, retryOpts: null, retryIdx: -1 }
  globalThis.setTimeout = (fn, ms, ...a) => (ms === 1000 || ms === 2000 || ms === 3000 || ms === 4000) ? (queueMicrotask(fn), 0) : realSetTimeout(fn, (ms === 350 || ms === 500) ? 1 : ms, ...a)
  globalThis.screen = { availLeft: 0, availWidth: 1920, availTop: 0, availHeight: 1040 }
  globalThis.chrome = {
    windows: { create: async () => ({ id: 1, tabs: [{ id: 7 }] }), getLastFocused: async () => ({ id: 99 }), update: async (id, info) => { if (info && info.width) { site.widened = true; site.scrollsAtWiden = site.scrolls } }, remove: async () => {} },
    scripting: {
      executeScript: async (opts) => {
        if (opts.files) return []
        if (Array.isArray(opts.args)) {
          const o = opts.args[2] || {}
          execCalls.push(o)
          if (site.widened && !o.walk && site.retryOpts === null) { site.retryOpts = o; site.retryIdx = execCalls.length - 1 }
          if (o.walk) {
            if (o.walk.op === 'begin') return [{ result: { y: 100, step: 540 } }]
            if (o.walk.op === 'scroll') {
              if (site.failScroll) throw new Error('popup closed')
              site.scrolls++
              return [{ result: { aborted: false } }]
            }
            return [{ result: { ended: true } }]
          }
          const base = site.widened && site.wide != null ? site.wide : site.first
          const html = site.scrolls > (site.widened ? site.scrollsAtWiden : 0) ? (site.after(site.scrolls) ?? base) : base
          return [{ result: { html, hasEmptyImageSlots: site.hasEmptyImageSlots, pageBottom: 20000 } }]
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
// the check _tabRefreshForComponent builds: counts the CLEANED capture against the saved copy
const checkFor = expected => html => { const count = cleanedCount(html); return { count, ok: structureRecovered(count, expected) } }
const walkOps = () => execCalls.filter(o => o.walk).map(o => o.walk.op)

test('healthy card (cleaned structure on the first extraction): no settle walk, only the first extraction and the #186 wide pass, both without the #72 scroll', async () => {
  site.first = ONE_DIV(li(5))
  const html = await run({ expectedStructure: 36, structureCheck: checkFor(36) })
  assert.equal(html, site.first)
  // #186: the popup now also takes ONE wide pass after the first extraction; the settle itself still never starts for a healthy card
  assert.deepEqual(walkOps(), [], 'no settle walk')
  assert.deepEqual(execCalls, [{ skipLazy: true }, { skipLazy: true }], 'first extraction (the #72 pass is held back) + the #186 wide pass, nothing else')
})

test('card without saved structure (expectedStructure absent/0/2, e.g. a price card): never settles even when empty', async () => {
  for (const meta of [{}, { expectedStructure: 0, structureCheck: checkFor(0) }, { expectedStructure: 2, structureCheck: checkFor(2) }]) {
    execCalls = []
    await run(meta)
    assert.deepEqual(walkOps(), [], 'never settles') // #186: plus the one wide pass
    assert.deepEqual(execCalls, [{}, { skipLazy: false }])
  }
})

test('old Kalshi card (#208 case A): 3 breadcrumb items that the card strips are NOT structure -> the settle starts', async () => {
  site.first = ONE_DIV(xli(3))
  site.after = n => n >= 3 ? ONE_DIV(xli(3) + li(16)) : null
  const meta = { expectedStructure: 4, structureCheck: checkFor(4) }
  const html = await run(meta)
  assert.equal(meta.structureSettle.triggered, true)
  assert.equal(cleanedCount(html), 16)
  assert.equal(meta.structureSettle.cleanedCount, 16)
})

test('fresh Senate (#208 case B): the excluded rules list does not end the walk; the cleaned plateau (16 of 22) is accepted', async () => {
  site.first = ONE_DIV('')
  site.after = n => n < 3 ? null : n === 3 ? ONE_DIV(xli(25) + li(8)) : ONE_DIV(xli(25) + li(16))
  const meta = { expectedStructure: 22, structureCheck: checkFor(22) }
  const html = await run(meta)
  assert.equal(cleanedCount(html), 16)
  assert.ok(site.scrolls >= 5, 'walked past the step where raw reached 28 >= 22')
})

test('settle stalled at a partial cleaned count -> rejected (null), last good copy kept by the caller', async () => {
  site.first = ONE_DIV('')
  site.after = n => n >= 2 ? ONE_DIV(xli(25) + li(8)) : null
  const meta = { expectedStructure: 22, structureCheck: checkFor(22) }
  assert.equal(await run(meta), null)
  assert.equal(meta.structureSettle.cleanedCount, 8, 'the cleaned count is reported for diagnostics')
})

test('negative: the list is truly gone -> walk ends, capture still at zero -> returned for the existing gates to fail it as before', async () => {
  site.first = ONE_DIV(xli(3))
  const meta = { expectedStructure: 36, structureCheck: checkFor(36) }
  const html = await run(meta)
  assert.equal(html, ONE_DIV(xli(3)))
  assert.equal(meta.structureSettle.triggered, true)
  assert.equal(meta.structureSettle.count, 0)
})

test('a shrunken healthy card (10 of 36 on the first extraction) is NOT touched: no walk, accepted as today', async () => {
  site.first = ONE_DIV(li(10))
  assert.equal(await run({ expectedStructure: 36, structureCheck: checkFor(36) }), site.first)
  assert.deepEqual(walkOps(), [])
})

test('walk steps extract with skipLazy (the #72 image scroll never stacks with the settle) and the walk is bracketed by begin/end', async () => {
  site.first = ONE_DIV('')
  site.after = n => n >= 2 ? ONE_DIV(li(30)) : null
  await run({ expectedStructure: 36, structureCheck: checkFor(36) })
  assert.deepEqual(walkOps().filter(op => op !== 'scroll'), ['begin', 'end'])
  const stepExtractions = execCalls.filter(o => !o.walk).slice(1)
  assert.ok(stepExtractions.length >= 2)
  assert.ok(stepExtractions.every(o => o.skipLazy === true))
  assert.deepEqual(execCalls[0], { skipLazy: true }, 'the first extraction holds the #72 pass back')
  assert.ok(execCalls.filter(o => !o.walk).every(o => o.skipLazy === true), 'no extraction of a settled card pays the #72 scroll')
})

test('widen retry after a settle: the FINAL capture is the one checked, and the retry pays neither a second #72 scroll nor a second settle', async () => {
  site.first = ONE_DIV('')
  site.hasEmptyImageSlots = true // every extraction reports empty image slots, so the popup is widened after the settle
  site.after = n => n >= 2 ? ONE_DIV(xli(25) + li(2)) : null // the settle leaves a stub at 300px
  site.wide = ONE_DIV(li(36)) // the widened capture holds the full list
  const meta = { expectedStructure: 36, structureCheck: checkFor(36) }
  const html = await run(meta)
  assert.equal(site.widened, true, 'the widen retry really ran')
  assert.equal(cleanedCount(html), 36)
  assert.deepEqual(site.retryOpts, { skipLazy: true })
  assert.equal(walkOps().filter(op => op === 'begin').length, 1, 'one settle per popup')
})

test('widen retry after a settle that left a stub: a widened capture still far below the saved copy is rejected too', async () => {
  site.first = ONE_DIV('')
  site.hasEmptyImageSlots = true
  site.after = n => n >= 2 ? ONE_DIV(li(2)) : null
  site.wide = ONE_DIV(li(10))
  assert.equal(await run({ expectedStructure: 36, structureCheck: checkFor(36) }), null)
  assert.equal(site.widened, true)
})

test('healthy at 300px but the stored rules do not fit (widen) and the widened capture is empty: the settle runs AFTER the retry, once', async () => {
  site.first = ONE_DIV(li(5))
  site.wide = ONE_DIV('')
  site.after = n => n >= 2 ? ONE_DIV(li(30)) : null
  const meta = { expectedStructure: 36, structureCheck: checkFor(36), layoutOk: () => false }
  const html = await run(meta)
  assert.equal(site.widened, true)
  assert.equal(meta.structureSettle.triggered, true)
  assert.equal(cleanedCount(html), 30)
  assert.equal(walkOps().filter(op => op === 'begin').length, 1)
})

test('#72 no-stack on the widen retry: empty image slots + a widened capture judged empty -> ONE settle, no #72 pass anywhere after the first look', async () => {
  site.first = ONE_DIV(li(5))
  site.hasEmptyImageSlots = true // every extraction reports empty image slots
  site.wide = ONE_DIV('')
  site.after = n => n >= 2 ? ONE_DIV(li(30)) : null
  const meta = { expectedStructure: 36, structureCheck: checkFor(36), layoutOk: () => false }
  const html = await run(meta)
  assert.equal(cleanedCount(html), 30)
  assert.equal(meta.structureSettle.triggered, true)
  assert.deepEqual(site.retryOpts, { skipLazy: true }, 'the retry holds #72 back')
  assert.ok(execCalls.slice(site.retryIdx).filter(o => !o.walk).every(o => o.skipLazy === true), 'no #72 pass after the widen, settle steps included')
})

test('#72 no-stack on the widen retry: a widened capture that is fine and shows empty slots still gets the held-back #72 pass, once', async () => {
  site.first = ONE_DIV(li(5))
  site.hasEmptyImageSlots = true
  site.wide = ONE_DIV(li(5))
  await run({ expectedStructure: 36, structureCheck: checkFor(36), layoutOk: () => false })
  assert.deepEqual(site.retryOpts, { skipLazy: true })
  const afterWiden = execCalls.slice(site.retryIdx)
  assert.deepEqual(afterWiden, [{ skipLazy: true }, {}], 'retry without the scroll, then the held-back pass')
})

test('#72 no-stack: a card with saved structure holds the image scroll back; it runs afterwards only when no settle did', async () => {
  site.first = ONE_DIV(li(5)) // healthy, so no settle
  site.hasEmptyImageSlots = true
  await run({ expectedStructure: 36, structureCheck: checkFor(36) })
  assert.deepEqual(execCalls.slice(0, 2), [{ skipLazy: true }, {}], 'first look without the scroll, then the held-back #72 pass')
})

test('a failed walk (popup closed mid-way) is fail-closed: it still counts as settled, so a partial capture is judged, not slipped through', async () => {
  site.first = ONE_DIV('')
  site.failScroll = true
  const meta = { expectedStructure: 36, structureCheck: checkFor(36) }
  const html = await run(meta)
  assert.equal(meta.structureSettle.error, true)
  assert.equal(html, ONE_DIV(''), 'still at zero: left to the existing isContentLost gate, like before')
})

test('#208 one measure: the trigger, every walk step and the final accept call the SAME structureCheck', async () => {
  site.first = ONE_DIV(xli(3))
  site.after = n => n >= 2 ? ONE_DIV(xli(3) + li(30)) : null
  const seen = []
  const meta = { expectedStructure: 4, structureCheck: html => { seen.push(html); return checkFor(4)(html) } }
  await run(meta)
  assert.equal(seen[0], ONE_DIV(xli(3)), 'trigger measured the first extraction')
  assert.ok(seen.some(h => cleanedCount(h) === 30), 'steps were measured')
  assert.equal(seen[seen.length - 1], ONE_DIV(xli(3) + li(30)), 'accept measured the final capture')
  assert.ok(seen.length >= 4)
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
