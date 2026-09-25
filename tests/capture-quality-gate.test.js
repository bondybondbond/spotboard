// #101 capture-quality gate: a browser capture is rejected only when it BOTH collapsed vs the
// card's saved copy AND the page was genuinely hidden while captured. Rejected tier 1/2 captures
// escalate; a rejected focused-popup capture keeps the last good copy (render_degraded).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
const real = {
  tryBackgroundWithSpoof: g.tryBackgroundWithSpoof,
  tryOffscreenWindow: g.tryOffscreenWindow,
  tryActiveTab: g.tryActiveTab,
  tabBasedRefresh: g.tabBasedRefresh,
  refreshComponent: g.refreshComponent
}
beforeEach(() => Object.assign(g, real))

// A feed card with n distinct image items (distinct so cleanupDuplicates keeps them all).
function feed(n) {
  const items = Array.from({ length: n }, (_, i) =>
    `<li><a href="/deal/${i}"><img src="https://cdn.example.com/deal-${i}.jpg" data-scale-context="medium" alt="Deal ${i}">Deal number ${i} with a real description</a></li>`)
  return `<ul class="deals">${items.join('')}</ul>`
}
const imgs = html => (html.match(/<img/gi) || []).length

// ---------- assessCaptureQuality ----------

test('assess: #100 HotUKDeals collapse (24 -> 1) captured hidden is rejected', () => {
  assert.equal(g.assessCaptureQuality(feed(1), feed(24), false).ok, false)
})

test('assess: same collapse captured genuinely visible is trusted (site redesign recovers)', () => {
  assert.equal(g.assessCaptureQuality(feed(1), feed(24), true).ok, true)
})

test('assess: unknown visibility (probe failed) is treated as hidden', () => {
  assert.equal(g.assessCaptureQuality(feed(1), feed(24), null).ok, false)
})

test('assess: worst healthy variation in the #100 traces (33 -> 23, 0.70) passes even hidden', () => {
  assert.equal(g.assessCaptureQuality(feed(23), feed(33), false).ok, true)
})

test('assess: a legitimate 50% shrink passes even hidden', () => {
  assert.equal(g.assessCaptureQuality(feed(10), feed(20), false).ok, true)
})

test('assess: exactly 0.4 passes, just below is rejected', () => {
  assert.equal(g.assessCaptureQuality(feed(4), feed(10), false).ok, true)
  assert.equal(g.assessCaptureQuality(feed(3), feed(10), false).ok, false)
})

test('assess: more images than the saved copy always passes', () => {
  assert.equal(g.assessCaptureQuality(feed(40), feed(24), false).ok, true)
})

test('assess: text-only / tiny cards (saved < 5 images) are never judged', () => {
  const text = '<div><h2>Most read</h2><ol><li>One</li><li>Two</li></ol></div>'
  assert.equal(g.assessCaptureQuality(text, text, false).ok, true)
  assert.equal(g.assessCaptureQuality('<div>x</div>', feed(4), false).ok, true)
  assert.equal(g.assessCaptureQuality('<div>x</div>', '', false).ok, true)
})

test('assess: replay of every #100 refresh with saved >= 5 images (cleaned counts) — only the two HUKD collapses reject', () => {
  // [saved, candidate] pairs from issue100 traces (refreshComponent baseline/result img counts).
  const healthy = [[20, 20], [14, 14], [13, 13], [97, 98], [10, 10], [19, 19], [30, 33], [33, 23], [23, 29],
    [98, 90], [90, 98], [29, 24], [14, 15], [98, 97], [10, 11], [19, 14], [24, 19], [14, 11], [19, 17],
    [11, 15], [17, 20], [20, 17], [17, 16], [113, 114], [16, 15], [18, 15], [1, 23], [1, 29]]
  for (const [saved, cand] of healthy) {
    assert.equal(g.assessCaptureQuality(feed(cand), feed(saved), false).ok, true, `${saved} -> ${cand}`)
  }
  for (const [saved, cand] of [[24, 1], [61, 1]]) {
    assert.equal(g.assessCaptureQuality(feed(cand), feed(saved), false).ok, false, `${saved} -> ${cand}`)
  }
})

// ---------- tabBasedRefresh escalation (tier functions stubbed; real gate) ----------

function stubTiers({ bg, off, active }) {
  const calls = []
  const mk = (name, spec) => async (url, sel, fp, meta = {}) => {
    calls.push(name)
    if (!spec) return null
    meta.pageVisible = spec.visible
    return spec.html
  }
  g.tryBackgroundWithSpoof = mk('bg', bg)
  g.tryOffscreenWindow = mk('off', off)
  g.tryActiveTab = mk('active', active)
  return calls
}
const saved = feed(24)
const assess = (html, visible) => g.assessCaptureQuality(html, saved, visible)
const run = (opts = { assess }, skipToActive = false) =>
  g.tabBasedRefresh('https://example.com/', 'ul.deals', null, 24, 24, skipToActive, false, opts)

test('escalation: hidden collapse on background + offscreen -> visible popup succeeds and learns focus', async () => {
  const calls = stubTiers({ bg: { html: feed(6), visible: false }, off: { html: feed(6), visible: false }, active: { html: feed(24), visible: true } })
  const r = await run()
  assert.deepEqual(calls, ['bg', 'off', 'active'])
  assert.equal(r.html, feed(24))
  assert.equal(r.activeFocusNeeded, true)
})

test('escalation: popup also hidden + collapsed -> renderDegraded, no html', async () => {
  stubTiers({ bg: { html: feed(6), visible: false }, off: { html: feed(6), visible: false }, active: { html: feed(2), visible: false } })
  const r = await run()
  assert.equal(r.html, null)
  assert.equal(r.renderDegraded, true)
})

test('escalation: visible smaller capture on background is accepted, no popup', async () => {
  const calls = stubTiers({ bg: { html: feed(6), visible: true } })
  const r = await run()
  assert.deepEqual(calls, ['bg'])
  assert.equal(r.html, feed(6))
})

test('escalation: healthy hidden background capture is accepted, no popup', async () => {
  const calls = stubTiers({ bg: { html: feed(22), visible: false } })
  const r = await run()
  assert.deepEqual(calls, ['bg'])
  assert.equal(r.html, feed(22))
})

test('escalation: learned-focus card (skipToActive) with hidden collapsed popup -> renderDegraded', async () => {
  stubTiers({ active: { html: feed(2), visible: false } })
  const r = await run({ assess }, true)
  assert.equal(r.renderDegraded, true)
  assert.equal(r.html, null)
})

test('escalation: without assess the pre-#101 behaviour is unchanged', async () => {
  const calls = stubTiers({ bg: { html: feed(22), visible: false } })
  const r = await run({})
  assert.deepEqual(calls, ['bg'])
  assert.equal(r.html, feed(22))
})

// ---------- refreshComponent end to end (fetch fails -> tab fallback) ----------

function card(extra = {}) {
  return { id: 'h1', name: 'Deals', url: 'https://example.com/hot', selector: 'ul.deals', html_cache: feed(24), excludedSelectors: [], positionBased: true, ...extra }
}

test('refreshComponent: every tier hidden + collapsed -> render_degraded failure, last good copy kept', async () => {
  global.fetch = async () => { throw new Error('offline') }
  stubTiers({ bg: { html: feed(5), visible: false }, off: { html: feed(6), visible: false }, active: { html: feed(1), visible: false } })
  const c = card()
  const r = await g.refreshComponent(c)
  assert.equal(r.success, false)
  assert.equal(r.keepOriginal, true)
  assert.equal(g.classifyError(r.error), 'render_degraded')
  assert.match(g.getErrorLabel('render_degraded'), /kept your last good copy/)
  const { localEntry, syncEntry } = g.applyRefreshResult(c, r)
  assert.equal(localEntry.html_cache, feed(24))
  assert.equal(syncEntry.lastErrorCode, 'render_degraded')
})

test('refreshComponent: hidden collapse escalates to a good visible popup capture and commits it', async () => {
  global.fetch = async () => { throw new Error('offline') }
  const calls = stubTiers({ bg: { html: feed(5), visible: false }, off: { html: feed(6), visible: false }, active: { html: feed(25), visible: true } })
  const r = await g.refreshComponent(card())
  assert.deepEqual(calls, ['bg', 'off', 'active'])
  assert.equal(r.success, true, r.error)
  assert.equal(r.requiresActiveFocus, true)
  assert.equal(imgs(r.html_cache), 25)
})

test('refreshComponent: text-only card is never judged by the gate', async () => {
  global.fetch = async () => { throw new Error('offline') }
  const text = '<ul class="deals"><li>Headline one is here</li><li>Headline two is here</li><li>Headline three</li></ul>'
  const calls = stubTiers({ bg: { html: text, visible: false } })
  const r = await g.refreshComponent(card({ html_cache: text }))
  assert.deepEqual(calls, ['bg'])
  assert.equal(r.success, true, r.error)
})

// ---------- drift-guard entry (direct fetch drifted -> tab fallback) ----------

test('drift guard: every tier hidden + collapsed -> render_degraded, drifted server HTML NOT committed', async () => {
  stubTiers({ bg: { html: feed(5), visible: false }, off: { html: feed(6), visible: false }, active: { html: feed(1), visible: false } })
  const c = card({ rawCaptureLength: 1000 })
  const drifted = '<ul class="deals">' + '<li>Server text item long enough to count</li>'.repeat(60) + '</ul>' // > 1.5x raw baseline
  const r = await g._runDriftGuard(drifted, c, 24, 24)
  assert.equal(r.success, false)
  assert.equal(g.classifyError(r.error), 'render_degraded')
})

const ownerOf = (obj, key) => { let o = Object.getPrototypeOf(obj); while (o && !Object.getOwnPropertyDescriptor(o, key)) o = Object.getPrototypeOf(o); return o }

// ---------- real visibility read is not fooled by the tier-1/2 spoof ----------

test('visibility probe reads Document.prototype, so an own-property spoof on document cannot mask hidden', async () => {
  const saved = { chrome: global.chrome, Document: global.Document }
  global.Document = global.Document || ownerOf(document, 'visibilityState').constructor // jsdom doesn't expose it
  Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true })
  Object.defineProperty(document, 'hasFocus', { value: () => true, configurable: true })
  const protoVis = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')
  Object.defineProperty(Document.prototype, 'visibilityState', { get: () => 'hidden', configurable: true })
  global.chrome = { scripting: { executeScript: async ({ func }) => [{ result: func() }] } }
  try {
    assert.equal(document.visibilityState, 'visible') // the spoof is in place...
    assert.equal(await g.readPageVisible(1), false) // ...but the probe still sees hidden
    Object.defineProperty(Document.prototype, 'visibilityState', { get: () => 'visible', configurable: true })
    const protoFocus = Document.prototype.hasFocus
    Document.prototype.hasFocus = () => true
    try { assert.equal(await g.readPageVisible(1), true) } finally { Document.prototype.hasFocus = protoFocus } // genuinely visible + focused
  } finally {
    delete document.visibilityState
    delete document.hasFocus
    Object.defineProperty(Document.prototype, 'visibilityState', protoVis)
    global.chrome = saved.chrome
    global.Document = saved.Document
  }
})
