// #201: HotUKDeals hides one of the owner's "exclude all like this" rules' targets (hide--toW3) below its W3
// breakpoint, and the tab extraction strips hidden elements, so at the 300px refresh popup that rule matches 0
// (fault) while at 1400px all three match. tryActiveTab already widened-and-retried for unresolved image slots
// (#72); it now also does so when the narrow capture fails the card's own layoutOk check (#132). Cards with no
// rules, and cards whose narrow capture already fits, never widen.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
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
  globalThis.setTimeout = (fn, ms, ...a) => (ms === 2000 || ms === 3000 || ms === 4000) ? (queueMicrotask(fn), 0) : realSetTimeout(fn, ms, ...a)
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

test('narrow capture already fits the rules -> no widen, no second extraction', async () => {
  extractResults = [{ html: WIDE, hasEmptyImageSlots: false }]
  const html = await run(fitsRules)
  assert.equal(extractions, 1)
  assert.deepEqual(updates, [])
  assert.match(html, /rule three target/)
})

test('card without exclusion rules (layoutOk null) never widens for layout', async () => {
  extractResults = [{ html: NARROW, hasEmptyImageSlots: false }]
  const html = await run(null)
  assert.equal(extractions, 1)
  assert.deepEqual(updates, [])
  assert.match(html, /narrow capture/)
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
