// #186 Stage 2: the unfocused offscreen window renders the narrow layout too, and used to ACCEPT a capture carrying
// narrow-only modules (Kalshi Combo / Live chat / ballot block), so the focused popup (which has the wide pass) never ran.
// tryOffscreenWindow now takes the same wide pass: widen once (1 s settle), re-extract, keep the wide capture unless it is
// empty or collapsed the list structure, skip it when Chrome did not give a desktop-width popup. The #101 / #152 gates
// then judge the ONE capture chosen here (tabBasedRefresh, unchanged). jsdom != Chrome: the real-site proof is the e2e.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
window.LazyLoad = await import('../.test-build/utils/lazy-load.js') // loaded by dashboard.html in production
const realSetTimeout = globalThis.setTimeout
const NARROW = '<div id="list"><p>narrow capture with Combo</p></div>'
const WIDE = '<div id="list"><p>wide capture</p></div>'
const LIST = n => '<ul>' + '<li>item</li>'.repeat(n) + '</ul>'
const structureCheck = html => { const count = (html.match(/<li/g) || []).length; return { count, ok: count > 0 } }

let extractions, updates, extractResults, innerWidth, waits

beforeEach(() => {
  extractions = 0
  updates = []
  extractResults = []
  innerWidth = 1384
  waits = []
  globalThis.setTimeout = (fn, ms, ...a) => { waits.push(ms); return (ms === 1000 || ms === 2000 || ms === 3000) ? (queueMicrotask(fn), 0) : realSetTimeout(fn, ms, ...a) }
  globalThis.screen = { availLeft: 0, availWidth: 1920, availTop: 0, availHeight: 1040 }
  globalThis.chrome = {
    windows: {
      create: async () => ({ id: 1, tabs: [{ id: 7 }] }),
      update: async (id, info) => { updates.push({ id, ...info }) },
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
        if (/innerWidth/.test(String(opts.func))) return [{ result: innerWidth }]
        if (opts.world === 'MAIN') return /visibilityState/.test(String(opts.func)) ? [{ result: true }] : []
        return [{ result: { found: false } }] // consent dialog probe
      }
    }
  }
})
const run = async (meta = {}) => {
  try { return { html: await g.tryOffscreenWindow('https://example.com/', '#list', null, meta), meta } } finally { globalThis.setTimeout = realSetTimeout }
}

test('#186: the offscreen window widens once to 1400 after the first extraction and returns the wide capture', async () => {
  extractResults = [NARROW, WIDE]
  const { html, meta } = await run()
  assert.equal(extractions, 2)
  assert.equal(updates.length, 1)
  assert.equal(updates[0].width, 1400)
  assert.ok(waits.includes(1000), 'the wide pass settles for 1 s')
  assert.match(html, /wide capture/)
  assert.deepEqual({ kept: meta.widenPass.kept, w: meta.widenPass.innerWidth }, { kept: 'wide', w: 1384 })
})

test('#186: an empty wide capture keeps the narrow one', async () => {
  extractResults = [NARROW, null]
  const { html, meta } = await run()
  assert.match(html, /narrow capture/)
  assert.equal(meta.widenPass.kept, 'narrow')
})

test('#186: a wide capture that collapsed the list structure keeps the narrow one; equal structure takes the wide one', async () => {
  extractResults = [LIST(20), LIST(2)]
  let r = await run({ structureCheck })
  assert.equal((r.html.match(/<li/g) || []).length, 20)
  assert.equal(r.meta.widenPass.kept, 'narrow')
  extractions = 0
  extractResults = [LIST(20), LIST(20) + '<p>wide</p>']
  r = await run({ structureCheck })
  assert.match(r.html, /wide/)
  assert.equal(r.meta.widenPass.kept, 'wide')
})

test('#186: images are not compared (the narrow-only mobile block is itself an image)', async () => {
  extractResults = [LIST(20) + '<img src="a"><img src="map">', LIST(20) + '<img src="a">']
  const { html } = await run({ structureCheck })
  assert.equal((html.match(/<img/g) || []).length, 1)
})

test('#186: Chrome did not widen the popup (inner width below desktop) -> the narrow capture, one extraction', async () => {
  innerWidth = 640
  extractResults = [NARROW, WIDE]
  const { html, meta } = await run()
  assert.equal(extractions, 1)
  assert.match(html, /narrow capture/)
  assert.equal(meta.widenPass.innerWidth, 640)
})

test('#186: a failing widen is best-effort: the narrow capture is returned, the window is still closed', async () => {
  extractResults = [NARROW, WIDE]
  let removed = 0
  globalThis.chrome.windows.update = async () => { throw new Error('Invalid value for bounds') }
  globalThis.chrome.windows.remove = async () => { removed++ }
  const { html } = await run()
  assert.match(html, /narrow capture/)
  assert.equal(extractions, 1)
  assert.equal(removed, 1)
})

test('#186: no first capture (element not found) -> no widen at all', async () => {
  extractResults = [null]
  const { html } = await run()
  assert.equal(html, null)
  assert.deepEqual(updates, [])
})

test('wiring: tabBasedRefresh hands its structureCheck, layoutOk and expectedStructure to the offscreen window', async () => {
  const realBg = g.tryBackgroundWithSpoof, realOff = g.tryOffscreenWindow, realAct = g.tryActiveTab
  let seen = null
  const check = () => ({ count: 1, ok: true })
  try {
    g.tryBackgroundWithSpoof = async () => null
    g.tryOffscreenWindow = async (url, sel, fp, meta) => { seen = meta; return null }
    g.tryActiveTab = async () => null
    const lay = () => true
    await g.tabBasedRefresh('https://example.com/', '#list', null, 0, 0, false, false, { structureCheck: check, layoutOk: lay, expectedStructure: 36 })
    assert.equal(seen.structureCheck, check)
    assert.equal(seen.layoutOk, lay)
    assert.equal(seen.expectedStructure, 36)
  } finally { g.tryBackgroundWithSpoof = realBg; g.tryOffscreenWindow = realOff; g.tryActiveTab = realAct }
})

test('review round 1: the offscreen pass honours the saved-copy test and the stored rules, and keeps the visibility read of the kept capture', async () => {
  extractResults = [LIST(30), LIST(15)]
  let r = await run({ structureCheck, expectedStructure: 36 })
  assert.equal((r.html.match(/<li/g) || []).length, 30)
  assert.equal(r.meta.widenPass.kept, 'narrow')
  extractions = 0
  const fits = html => html.includes('R3')
  extractResults = ['<p>R3 narrow</p>', '<p>wide without the rule target</p>']
  r = await run({ layoutOk: fits })
  assert.match(r.html, /R3 narrow/)
  extractions = 0
  const prev = globalThis.chrome.scripting.executeScript
  let reads = 0
  globalThis.chrome.scripting.executeScript = async (opts) => (opts.world === 'MAIN' && /visibilityState/.test(String(opts.func))) ? [{ result: (reads++ === 0) }] : prev(opts)
  extractResults = [NARROW, WIDE]
  r = await run()
  assert.equal(r.meta.widenPass.kept, 'wide')
  assert.equal(r.meta.pageVisible, false)
})
