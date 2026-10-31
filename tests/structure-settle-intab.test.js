// #202 / #208: runs the REAL extractFromTab (the function tryActiveTab injects into the popup) against a jsdom page.
// Pinned here: the walk ops (begin / scroll / end) and the trusted-input abort live in the tab; the settle fires only
// for 0 CLEANED structure vs a structured saved copy, never for healthy cards or cards without saved structure; the #72
// image scroll never stacks with it; repeated extraction (30 steps of it) is idempotent; and the walk follows a block the
// site replaced. jsdom has no layout and no site (a scroll handler stands in for the lazy loader); the real-site proof
// is the e2e. The loop itself is tested in structure-settle.test.js.
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'
import { installFastTimers, restoreFastTimers } from './helpers/fast-timers.js'

const g = await loadRefreshEngine()
const LL = await import('../.test-build/utils/lazy-load.js')
window.DomSnapshot = await import('../.test-build/utils/dom-snapshot.js')

let scrollCalls, scrollTops, ensureCalls, onScroll

beforeEach(() => {
  scrollCalls = 0
  scrollTops = []
  ensureCalls = 0
  onScroll = () => {}
  delete window.__sbSettle
  window.LazyLoad = { ...LL, ensureLazyContentLoaded: async (...a) => { ensureCalls++; return LL.ensureLazyContentLoaded(...a) } }
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, get: () => 20000 })
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => 0 })
  Object.defineProperty(window, 'scrollX', { configurable: true, get: () => 0 })
  window.scrollTo = (arg) => { scrollCalls++; scrollTops.push(arg && arg.top); onScroll(scrollCalls) }
  // the fixed 2s/3s/4s popup waits are not under test; the settle's own 350 ms / 500 ms waits shrink to 1 ms
  installFastTimers({ shrink: [350, 500] })
  globalThis.screen = { availLeft: 0, availWidth: 1920, availTop: 0, availHeight: 1040 }
  globalThis.chrome = {
    windows: { create: async () => ({ id: 1, tabs: [{ id: 7 }] }), getLastFocused: async () => ({ id: 99 }), update: async () => {}, remove: async () => {} },
    scripting: {
      executeScript: async (opts) => {
        if (opts.files) return []
        if (Array.isArray(opts.args)) { return [{ result: await opts.func(...opts.args) }] } // the REAL extraction / walk op
        if (opts.world === 'MAIN') return /visibilityState/.test(String(opts.func)) ? [{ result: true }] : []
        return [{ result: { found: false } }]
      }
    }
  }
})
afterEach(restoreFastTimers)

const page = (inner = '') => { document.body.innerHTML = `<div id="b"><h2>Breaking News</h2><ul id="l">${inner}</ul></div>` }
const lis = n => '<li>story</li>'.repeat(n)
const mountOnScroll = (n) => (calls) => { if (calls >= 2) document.getElementById('l').innerHTML = lis(n) }
const cleaned = html => (html.match(/<li>/g) || []).length
// the check _tabRefreshForComponent builds, without a pipeline: every <li> counts
const check = expected => html => { const count = cleaned(html); return { count, ok: LL.structureRecovered(count, expected) } }
const run = (meta) => g.tryActiveTab('https://example.com/', '#b', null, meta)

test('0 cleaned structure vs a structured saved copy: the real extraction settles, then returns the mounted list', async () => {
  page()
  onScroll = mountOnScroll(30)
  const meta = { expectedStructure: 4, structureCheck: check(4) }
  const html = await run(meta)
  assert.ok(scrollCalls >= 2)
  assert.equal(meta.structureSettle.triggered, true)
  assert.equal(cleaned(html), 30)
})

test('#218 a settled capture below half of the saved list is thrown away AND the reason is remembered on the call meta', async () => {
  page()
  onScroll = mountOnScroll(3) // 3 of a saved 8: floor is 4
  const meta = { expectedStructure: 8, structureCheck: check(8) }
  const html = await run(meta)
  assert.equal(html, null)
  assert.deepEqual(meta.structureStub, { count: 3, expected: 8 })
})

test('#218 no reason is recorded when the capture passes, or when the page stayed at zero (the old messages keep those)', async () => {
  page()
  onScroll = mountOnScroll(30)
  let meta = { expectedStructure: 8, structureCheck: check(8) }
  assert.ok(await run(meta))
  assert.equal(meta.structureStub, undefined, 'passed the floor')

  page()
  onScroll = () => {} // nothing ever mounts: count stays 0
  meta = { expectedStructure: 8, structureCheck: check(8) }
  await run(meta)
  assert.equal(meta.structureStub, undefined, 'zero is left to the existing gates (isContentLost / skeleton)')
})

test('healthy card (block already has list items): zero scroll calls, no settle', async () => {
  page(lis(5))
  const meta = { expectedStructure: 36, structureCheck: check(36) }
  await run(meta)
  assert.equal(scrollCalls, 0)
  assert.equal(meta.structureSettle, null)
  assert.equal(window.__sbSettle, undefined, 'no listeners installed')
})

test('card without saved structure (expectedStructure 0, e.g. a price card): zero scroll calls even with an empty block', async () => {
  page()
  await run({ expectedStructure: 0, structureCheck: check(0) })
  assert.equal(scrollCalls, 0)
})

test('saved copy with fewer than 3 structure elements never settles', async () => {
  page()
  await run({ expectedStructure: 2, structureCheck: check(2) })
  assert.equal(scrollCalls, 0)
})

test('the walk scrolls the popup from the block downwards, in 0.6 x viewport steps, and cleans up its listeners', async () => {
  page()
  onScroll = mountOnScroll(30)
  Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => 900 })
  document.getElementById('b').getBoundingClientRect = () => ({ top: 400 })
  await run({ expectedStructure: 4, structureCheck: check(4) })
  assert.equal(scrollTops[0], 400 - 225, 'starts a quarter viewport above the block')
  assert.equal(scrollTops[1] - scrollTops[0], 540, '0.6 x viewport')
  assert.equal(window.__sbSettle, undefined, 'listeners removed at the end')
})

test('#72 image scroll never stacks with the settle: a settled card pays none, a healthy one still gets it', async () => {
  const slots = '<div class="thumbnail-a"></div>'.repeat(3) // MIN_EMPTY_SLOTS: the #72 pass would run (and a widen retry follows)
  page()
  document.getElementById('b').insertAdjacentHTML('beforeend', slots)
  // the list mounts only once the settle's own walk is scrolling (the #72 pass scrolls too, and must not be what mounts it here)
  onScroll = (calls) => { if (window.__sbSettle && calls >= 4) document.getElementById('l').innerHTML = lis(30) }
  await run({ expectedStructure: 4, structureCheck: check(4) })
  assert.equal(ensureCalls, 0, 'saved structure + empty block: the first extraction holds #72 back, the settle steps and the widen retry skip it')
  ensureCalls = 0
  onScroll = () => {}
  page(lis(3))
  document.getElementById('b').insertAdjacentHTML('beforeend', slots)
  await run({ expectedStructure: 4, structureCheck: check(4) })
  assert.ok(ensureCalls >= 1, 'no settle (block has structure): the #72 pass still runs, after the first look')
})

test('the site replaces the block while mounting: every step looks the block up again and counts the new node', async () => {
  page()
  onScroll = (calls) => {
    if (calls === 2) { document.body.innerHTML = `<div id="b"><h2>Breaking News</h2><ul id="l">${lis(12)}</ul></div>` }
  }
  const meta = { expectedStructure: 4, structureCheck: check(4) }
  const html = await run(meta)
  assert.equal(meta.structureSettle.triggered, true)
  assert.equal(meta.structureSettle.count, 12, 'counted on the replacement node, not the detached one')
  assert.equal(cleaned(html), 12)
})

test('a walk step on a page that lost the block fails closed (no listeners left, capture judged by the accept check)', async () => {
  page()
  onScroll = () => { document.body.innerHTML = '<p>gone</p>' }
  const meta = { expectedStructure: 36, structureCheck: check(36) }
  const html = await run(meta)
  assert.equal(meta.structureSettle.triggered, true)
  assert.ok(html === null || cleaned(html) === 0)
  assert.equal(window.__sbSettle, undefined)
})

test('trusted user input during the walk is reported as an abort; untrusted (our own synthetic) events are ignored', async () => {
  page()
  const handlers = []
  const realAdd = window.addEventListener
  window.addEventListener = (type, fn, ...rest) => { if (type === 'wheel') handlers.push(fn); return realAdd.call(window, type, fn, ...rest) }
  onScroll = (calls) => {
    if (calls === 1) handlers.forEach(h => h({ isTrusted: false }))
    if (calls === 2) handlers.forEach(h => h({ isTrusted: true }))
  }
  try {
    const meta = { expectedStructure: 36, structureCheck: check(36) }
    await run(meta)
    assert.equal(meta.structureSettle.aborted, true)
    assert.equal(scrollCalls, 2, 'no scrollTo after the user took over (the next step reports the abort without moving the page)')
  } finally { window.addEventListener = realAdd }
})

test('repeated extraction is idempotent: the same unchanged page extracted 30 times gives byte-identical output (image promotion included)', async () => {
  document.body.innerHTML = '<div id="b"><h2>Breaking News</h2><ul><li><img data-src="https://example.com/a.jpg" width="40" height="40"><span style="background-image:url(https://example.com/bg.png)">x</span></li></ul><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" srcset="https://example.com/s1.jpg 1x, https://example.com/s2.jpg 2x"></div>'
  let fn
  const real = globalThis.chrome.scripting.executeScript
  globalThis.chrome.scripting.executeScript = async (o) => { if (Array.isArray(o.args)) fn = o.func; return real(o) }
  await g.tryActiveTab('https://example.com/', '#b', null, {})
  const first = (await fn('#b', null, { skipLazy: true })).html
  for (let i = 0; i < 29; i++) assert.equal((await fn('#b', null, { skipLazy: true })).html, first, 'extraction ' + (i + 2))
})

test('a user input that arrives BETWEEN steps stops the next scroll: the walk does not move their page again', async () => {
  page()
  const handlers = []
  const realAdd = window.addEventListener
  window.addEventListener = (type, fn, ...rest) => { if (type === 'wheel') handlers.push(fn); return realAdd.call(window, type, fn, ...rest) }
  let fn
  const real = globalThis.chrome.scripting.executeScript
  globalThis.chrome.scripting.executeScript = async (o) => { if (Array.isArray(o.args)) fn = o.func; return real(o) }
  try {
    await g.tryActiveTab('https://example.com/', '#b', null, {})
    restoreFastTimers() // the in-tab walk ops below run on real timers, as before
    await fn('#b', null, { walk: { op: 'begin' } })
    const callsBefore = scrollCalls
    assert.deepEqual(await fn('#b', null, { walk: { op: 'scroll', y: 100 } }), { aborted: false })
    assert.equal(scrollCalls, callsBefore + 1)
    handlers.forEach(h => h({ isTrusted: true })) // the user scrolls while the extraction runs
    assert.deepEqual(await fn('#b', null, { walk: { op: 'scroll', y: 700 } }), { aborted: true })
    assert.equal(scrollCalls, callsBefore + 1, 'no scrollTo after the user took over')
    await fn('#b', null, { walk: { op: 'end' } })
    assert.equal(window.__sbSettle, undefined)
  } finally { window.addEventListener = realAdd }
})
