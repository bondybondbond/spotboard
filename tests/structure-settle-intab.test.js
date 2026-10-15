// #202: runs the REAL extractFromTab (the function tryActiveTab injects into the popup) against a jsdom page, so the
// in-tab gating is pinned: the settle fires only for 0 live structure vs a structured saved copy, never for healthy cards
// or cards without saved structure, never stacks with the #72 image scroll, and follows a block the site replaced.
// jsdom has no layout and no site (a scroll handler stands in for the lazy loader); the real-site proof is the e2e.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
const LL = await import('../.test-build/utils/lazy-load.js')
window.DomSnapshot = await import('../.test-build/utils/dom-snapshot.js')

const realSetTimeout = globalThis.setTimeout
let scrollCalls, ensureCalls, onScroll

beforeEach(() => {
  scrollCalls = 0
  ensureCalls = 0
  onScroll = () => {}
  window.LazyLoad = { ...LL, ensureLazyContentLoaded: async (...a) => { ensureCalls++; return LL.ensureLazyContentLoaded(...a) } }
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, get: () => 20000 })
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => 0 })
  Object.defineProperty(window, 'scrollX', { configurable: true, get: () => 0 })
  window.scrollTo = () => { scrollCalls++; onScroll(scrollCalls) }
  // the fixed 2s/3s/4s popup waits are not under test; the settle's own 350 ms / 500 ms waits shrink to 1 ms
  globalThis.setTimeout = (fn, ms, ...a) => (ms === 2000 || ms === 3000 || ms === 4000) ? (queueMicrotask(fn), 0) : realSetTimeout(fn, ms === 350 || ms === 500 ? 1 : ms, ...a)
  globalThis.screen = { availLeft: 0, availWidth: 1920, availTop: 0, availHeight: 1040 }
  globalThis.chrome = {
    windows: { create: async () => ({ id: 1, tabs: [{ id: 7 }] }), getLastFocused: async () => ({ id: 99 }), update: async () => {}, remove: async () => {} },
    scripting: {
      executeScript: async (opts) => {
        if (opts.files) return []
        if (Array.isArray(opts.args)) return [{ result: await opts.func(...opts.args) }] // the REAL extraction
        if (opts.world === 'MAIN') return /visibilityState/.test(String(opts.func)) ? [{ result: true }] : []
        return [{ result: { found: false } }]
      }
    }
  }
})

const page = (inner = '') => { document.body.innerHTML = `<div id="b"><h2>Breaking News</h2><ul id="l">${inner}</ul></div>` }
const lis = n => '<li>story</li>'.repeat(n)
const mountOnScroll = (n) => (calls) => { if (calls >= 2) document.getElementById('l').innerHTML = lis(n) }
const run = async (meta) => {
  try { return await g.tryActiveTab('https://example.com/', '#b', null, meta) } finally { globalThis.setTimeout = realSetTimeout }
}

test('0 live structure vs a structured saved copy: the real extraction settles, then returns the mounted list', async () => {
  page()
  onScroll = mountOnScroll(30)
  const meta = { expectedStructure: 4 }
  const html = await run(meta)
  assert.ok(scrollCalls >= 2)
  assert.equal(meta.structureSettle.triggered, true)
  assert.equal((html.match(/<li>/g) || []).length, 30)
})

test('healthy card (block already has list items): zero scroll calls', async () => {
  page(lis(5))
  const meta = { expectedStructure: 36 }
  await run(meta)
  assert.equal(scrollCalls, 0)
  assert.equal(meta.structureSettle, null)
})

test('card without saved structure (expectedStructure 0, e.g. a price card): zero scroll calls even with an empty block', async () => {
  page()
  await run({ expectedStructure: 0 })
  assert.equal(scrollCalls, 0)
})

test('saved copy with fewer than 3 structure elements never settles', async () => {
  page()
  await run({ expectedStructure: 2 })
  assert.equal(scrollCalls, 0)
})

test('#72 image scroll is skipped after a triggered settle (the two caps never stack), and still runs without one', async () => {
  const slots = '<div class="thumbnail-a"></div>'.repeat(2) // below MIN_EMPTY_SLOTS so no widen retry muddies the count
  page()
  document.getElementById('b').insertAdjacentHTML('beforeend', slots)
  await run({ expectedStructure: 4 })
  assert.equal(ensureCalls, 0, 'settle ran, so the #72 pass is skipped')
  globalThis.setTimeout = (fn, ms, ...a) => (ms === 2000 || ms === 3000 || ms === 4000) ? (queueMicrotask(fn), 0) : realSetTimeout(fn, ms === 350 || ms === 500 ? 1 : ms, ...a)
  page(lis(3))
  document.getElementById('b').insertAdjacentHTML('beforeend', slots)
  await run({ expectedStructure: 4 })
  assert.equal(ensureCalls, 1, 'no settle (block has structure): the #72 pass runs as before')
})

test('the site replaces the block while mounting: the settle follows the new node', async () => {
  page()
  onScroll = (calls) => {
    if (calls === 2) { document.body.innerHTML = `<div id="b"><h2>Breaking News</h2><ul id="l">${lis(12)}</ul></div>` }
  }
  const meta = { expectedStructure: 4 }
  const html = await run(meta)
  assert.equal(meta.structureSettle.triggered, true)
  assert.equal(meta.structureSettle.count, 12, 'counted on the replacement node, not the detached one')
  assert.equal((html.match(/<li>/g) || []).length, 12)
})

test('a settle that throws still counts as settled, so the recovery check judges the capture (no fail-open)', async () => {
  page()
  window.LazyLoad = { ...window.LazyLoad, settleStructure: async () => { document.getElementById('l').innerHTML = lis(2); throw new Error('boom') } }
  const meta = { expectedStructure: 36, structureCheck: html => { const count = (html.match(/<li>/g) || []).length; return { count, ok: count >= 18 } } }
  assert.equal(await run(meta), null, 'a 2-item stub is rejected')
  assert.equal(meta.structureSettle.triggered, true)
})
