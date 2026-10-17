// #201: HotUKDeals hides one of the owner's "exclude all like this" rules' targets (hide--toW3) below its W3
// breakpoint, and the tab extraction strips hidden elements, so at the 300px refresh popup that rule matches 0
// (fault) while at 1400px all three match. tryActiveTab already widened-and-retried for unresolved image slots
// (#72); it now also does so when the narrow capture fails the card's own layoutOk check (#132).
// #186: that was a detector, and no detector separates a narrow-only module (Kalshi Combo / Live chat) from ordinary
// drift, so EVERY popup capture now gets a wide pass (1 s settle unless a signal above asks for 4 s); the wide capture is
// taken unless it is worse than the narrow one (empty, or collapsed list structure), and a popup Chrome did not widen
// is not re-extracted. The two tests that asserted "never widens" are replaced below (declared in the #186 record).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
window.LazyLoad = await import('../.test-build/utils/lazy-load.js') // loaded by dashboard.html in production; the #186 keep-better rule reads it
const realSetTimeout = globalThis.setTimeout
const NARROW = '<div id="list"><p>narrow capture without rule three</p></div>'
const WIDE = '<div id="list"><p>wide capture</p><span class="R3">rule three target</span></div>'
const fitsRules = html => html.includes('R3')

let extractions, updates, extractResults

beforeEach(() => {
  extractions = 0
  updates = []
  extractResults = []
  // the fixed 2s/3s/4s settle waits are not what is under test
  globalThis.setTimeout = (fn, ms, ...a) => (ms === 1000 || ms === 2000 || ms === 3000 || ms === 4000) ? (queueMicrotask(fn), 0) : realSetTimeout(fn, ms, ...a)
  globalThis.screen = { availLeft: 0, availWidth: 1920, availTop: 0, availHeight: 1040 }
  globalThis.chrome = {
    windows: {
      create: async () => ({ id: 1, tabs: [{ id: 7 }] }),
      getLastFocused: async () => ({ id: 99 }),
      update: async (id, info) => { if (info.width) updates.push({ id, ...info }) }, // ignores the focus-restore update
      remove: async () => {}
    },
    scripting: {
      executeScript: async (opts) => {
        if (opts.files) return []
        if (Array.isArray(opts.args)) { // the extraction (selector, fingerprint)
          const r = extractResults[Math.min(extractions, extractResults.length - 1)]
          extractions++
          return [{ result: r }]
        }
        if (opts.world === 'MAIN') return /visibilityState/.test(String(opts.func)) ? [{ result: true }] : []
        return [{ result: { found: false } }] // consent dialog probe
      }
    }
  }
})
const restore = () => { globalThis.setTimeout = realSetTimeout }

const run = async (layoutOk) => {
  try { return await g.tryActiveTab('https://example.com/', '#list', null, { layoutOk }) } finally { restore() }
}

test('#201: narrow capture breaks the stored rules -> widen to 1400 once, return the compatible wide capture', async () => {
  extractResults = [{ html: NARROW, hasEmptyImageSlots: false }, { html: WIDE, hasEmptyImageSlots: false }]
  const html = await run(fitsRules)
  assert.equal(extractions, 2)
  assert.equal(updates.length, 1)
  assert.equal(updates[0].width, 1400)
  assert.match(html, /rule three target/)
})

const settleWaits = []
const withWaitLog = async fn => { const o = globalThis.setTimeout; globalThis.setTimeout = (cb, ms, ...a) => { settleWaits.push(ms); return o(cb, ms, ...a) }; try { return await fn() } finally { globalThis.setTimeout = o } }
const LIST = n => '<ul>' + '<li>item</li>'.repeat(n) + '</ul>'
const structureCheck = html => { const count = (html.match(/<li/g) || []).length; return { count, ok: count > 0 } }

test('#186: narrow capture already fits the rules -> still ONE wide pass (1 s settle, two extractions), wide capture returned', async () => {
  extractResults = [{ html: WIDE, hasEmptyImageSlots: false }, { html: WIDE + '<i>wide-only</i>', hasEmptyImageSlots: false }]
  const meta = { layoutOk: fitsRules }
  const html = await run(fitsRules)
  assert.equal(extractions, 2)
  assert.equal(updates.length, 1)
  assert.equal(updates[0].width, 1400)
  assert.match(html, /wide-only/)
})

test('#186: card without exclusion rules (layoutOk null) gets the wide pass too, and the wide capture wins', async () => {
  extractResults = [{ html: NARROW, hasEmptyImageSlots: false }, { html: WIDE, hasEmptyImageSlots: false }]
  const html = await run(null)
  assert.equal(extractions, 2)
  assert.equal(updates.length, 1)
  assert.match(html, /rule three target/)
})

test('#186: the wide pass settles for 1 s; only the #72 / #201 signals keep the 4 s wait', async () => {
  extractResults = [{ html: NARROW, hasEmptyImageSlots: false }, { html: WIDE, hasEmptyImageSlots: false }]
  settleWaits.length = 0
  await withWaitLog(() => g.tryActiveTab('https://example.com/', '#list', null, { layoutOk: null }))
  assert.ok(settleWaits.includes(1000) && !settleWaits.includes(4000), JSON.stringify(settleWaits))
  extractions = 0
  extractResults = [{ html: NARROW, hasEmptyImageSlots: true }, { html: WIDE, hasEmptyImageSlots: false }]
  settleWaits.length = 0
  await withWaitLog(() => g.tryActiveTab('https://example.com/', '#list', null, { layoutOk: null }))
  assert.ok(settleWaits.includes(4000), JSON.stringify(settleWaits))
})

test('#186: a wide capture that is empty keeps the narrow one', async () => {
  extractResults = [{ html: NARROW, hasEmptyImageSlots: false }, { html: null }]
  const meta = {}
  const html = await g.tryActiveTab('https://example.com/', '#list', null, meta).finally(restore)
  assert.match(html, /narrow capture/)
  assert.equal(meta.widenPass.kept, 'narrow')
})

test('#186: a wide capture that collapsed the list structure keeps the narrow one; one with equal structure is taken', async () => {
  extractResults = [{ html: LIST(20), hasEmptyImageSlots: false }, { html: LIST(2), hasEmptyImageSlots: false }]
  let meta = { structureCheck }
  let html = await g.tryActiveTab('https://example.com/', '#list', null, meta).finally(restore)
  assert.equal((html.match(/<li/g) || []).length, 20)
  assert.equal(meta.widenPass.kept, 'narrow')
  extractions = 0
  extractResults = [{ html: LIST(20) }, { html: LIST(20) + '<p>wide</p>' }]
  meta = { structureCheck }
  html = await g.tryActiveTab('https://example.com/', '#list', null, meta).finally(restore)
  assert.match(html, /wide/)
  assert.equal(meta.widenPass.kept, 'wide')
})

test('#186: image counts are not compared (the narrow-only mobile block is itself an image)', async () => {
  extractResults = [{ html: LIST(20) + '<img src="a"><img src="b"><img src="map">' }, { html: LIST(20) + '<img src="a"><img src="b">' }]
  const html = await g.tryActiveTab('https://example.com/', '#list', null, { structureCheck }).finally(restore)
  assert.equal((html.match(/<img/g) || []).length, 2)
})

test('#186: Chrome did not widen the popup (inner width below desktop) -> no second extraction for the wide pass', async () => {
  const prev = globalThis.chrome.scripting.executeScript
  globalThis.chrome.scripting.executeScript = async (opts) => (!opts.world && !opts.files && !Array.isArray(opts.args) && /innerWidth/.test(String(opts.func))) ? [{ result: 640 }] : prev(opts)
  extractResults = [{ html: NARROW }, { html: WIDE }]
  const meta = {}
  const html = await g.tryActiveTab('https://example.com/', '#list', null, meta).finally(restore)
  assert.equal(extractions, 1)
  assert.match(html, /narrow capture/)
  assert.equal(meta.widenPass.innerWidth, 640)
})

test('still faulting after the one retry -> returns the wide markup, widens exactly once (caller fails closed)', async () => {
  extractResults = [{ html: NARROW, hasEmptyImageSlots: false }, { html: '<div id="list"><p>wide but still no R-three</p></div>', hasEmptyImageSlots: false }]
  const html = await run(fitsRules)
  assert.equal(extractions, 2)
  assert.equal(updates.length, 1)
  assert.equal(fitsRules(html), false)
})

test('existing #72 trigger kept: unresolved image slots still widen with no rules', async () => {
  extractResults = [{ html: NARROW, hasEmptyImageSlots: true }, { html: WIDE, hasEmptyImageSlots: false }]
  const html = await run(null)
  assert.equal(updates.length, 1)
  assert.match(html, /rule three target/)
})

test('wiring: tabBasedRefresh hands its layoutOk to the focused popup on both routes (active-first and last-resort)', async () => {
  const realBg = g.tryBackgroundWithSpoof, realOff = g.tryOffscreenWindow
  try {
    for (const skipToActive of [true, false]) {
      extractions = 0; updates = []
      extractResults = [{ html: NARROW, hasEmptyImageSlots: false }, { html: WIDE, hasEmptyImageSlots: false }]
      g.tryBackgroundWithSpoof = async () => null
      g.tryOffscreenWindow = async () => null
      const r = await g.tabBasedRefresh('https://example.com/', '#list', null, 0, 0, skipToActive, false, { layoutOk: fitsRules })
      assert.match(r.html, /rule three target/, `skipToActive=${skipToActive}`)
      assert.equal(updates.length, 1, `skipToActive=${skipToActive}`)
    }
  } finally { g.tryBackgroundWithSpoof = realBg; g.tryOffscreenWindow = realOff; restore() }
})

// ── review round 1 (cold review of #186): the keep-better rule judges against the SAVED copy and the card's own rules ──
const better = (narrow, wide, meta = {}) => g._wideCaptureBetter(narrow, wide, { structureCheck, ...meta })

test('keep-better, direct: empty wide is never better (so the empty-capture tests really exercise the rule)', () => {
  assert.equal(better(LIST(20), null), false)
  assert.equal(better(LIST(20), ''), false)
  assert.equal(better(null, LIST(5)), true)
})

test('keep-better vs the saved copy: a narrow capture that passes the saved-copy test is only replaced by one at least as complete', () => {
  const meta = { expectedStructure: 36 }
  assert.equal(better(LIST(30), LIST(15), meta), false, 'settled narrow 30 of 36, wide 15: the accept check would fail the wide one')
  assert.equal(better(LIST(36), LIST(18), meta), false, 'unsettled narrow 36 of 36, wide only half')
  assert.equal(better(LIST(30), LIST(30), meta), true)
  assert.equal(better(LIST(30), LIST(36), meta), true)
  assert.equal(better(LIST(10), LIST(30), meta), true, 'a narrow capture that is itself a stub is replaced by a better wide one')
  assert.equal(better(LIST(40), LIST(36), meta), true, 'narrow-only list items (a mobile block) must not make the correct wide capture look smaller than the narrow one')
  assert.equal(better(LIST(40), LIST(30), meta), false, 'wide below the saved copy')
})

test('keep-better without a saved list: collapse vs the narrow list decides; a structure-less narrow capture is replaced', () => {
  assert.equal(better(LIST(20), LIST(9)), false)
  assert.equal(better(LIST(20), LIST(10)), true)
  assert.equal(better(LIST(2), '<p>wide</p>'), true)
})

test('keep-better: a throwing structure check keeps the narrow capture', () => {
  assert.equal(g._wideCaptureBetter(LIST(20), LIST(20), { structureCheck: () => { throw new Error('cleaning failed') } }), false)
})

test('keep-better: the wide capture that breaks stored rules the narrow one fits keeps the narrow one; the reverse takes the wide one', () => {
  const fits = html => html.includes('R3')
  assert.equal(g._wideCaptureBetter('<p>R3 narrow</p>', '<p>wide, no rule target</p>', { layoutOk: fits }), false)
  assert.equal(g._wideCaptureBetter('<p>narrow, no rule target</p>', '<p>R3 wide</p>', { layoutOk: fits }), true)
})

test('tryActiveTab: a settled-narrow-looking capture is not replaced by a wide capture that fails the saved-copy test', async () => {
  extractResults = [{ html: LIST(30) }, { html: LIST(15) }]
  const meta = { structureCheck, expectedStructure: 36 }
  const html = await g.tryActiveTab('https://example.com/', '#list', null, meta).finally(restore)
  assert.equal((html.match(/<li/g) || []).length, 30)
  assert.equal(meta.widenPass.kept, 'narrow')
})

test('older signalled retries keep their unconditional rule: signalled + inner width 640 still re-extracts, and a collapsed wide capture still replaces the narrow one', async () => {
  const prev = globalThis.chrome.scripting.executeScript
  globalThis.chrome.scripting.executeScript = async (opts) => (!opts.world && !opts.files && !Array.isArray(opts.args) && /innerWidth/.test(String(opts.func))) ? [{ result: 640 }] : prev(opts)
  extractResults = [{ html: NARROW, hasEmptyImageSlots: true }, { html: WIDE, hasEmptyImageSlots: false }]
  const html = await g.tryActiveTab('https://example.com/', '#list', null, {}).finally(restore)
  assert.equal(extractions, 2)
  assert.match(html, /rule three target/)
  extractions = 0
  extractResults = [{ html: LIST(20), hasEmptyImageSlots: true }, { html: LIST(2) }]
  const html2 = await g.tryActiveTab('https://example.com/', '#list', null, { structureCheck }).finally(restore)
  assert.equal((html2.match(/<li/g) || []).length, 2, 'signalled retry: replaced like before #186')
})

test('#101 input: meta.pageVisible is the visibility read for the capture that was kept', async () => {
  const prev = globalThis.chrome.scripting.executeScript
  let reads = 0
  globalThis.chrome.scripting.executeScript = async (opts) => (opts.world === 'MAIN' && /visibilityState/.test(String(opts.func))) ? [{ result: (reads++ === 0) }] : prev(opts) // narrow visible, wide hidden
  extractResults = [{ html: NARROW }, { html: WIDE }]
  let meta = {}
  await g.tryActiveTab('https://example.com/', '#list', null, meta).finally(restore)
  assert.equal(meta.widenPass.kept, 'wide')
  assert.equal(meta.pageVisible, false, 'wide kept -> the wide read')
  reads = 0; extractions = 0
  extractResults = [{ html: NARROW }, { html: null }]
  meta = {}
  await g.tryActiveTab('https://example.com/', '#list', null, meta).finally(restore)
  assert.equal(meta.widenPass.kept, 'narrow')
  assert.equal(meta.pageVisible, true, 'narrow kept -> the narrow read')
})
