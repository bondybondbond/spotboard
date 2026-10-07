// #101 capture-quality gate: a browser capture is rejected only when it BOTH collapsed vs the
// card's saved copy AND the page was genuinely hidden while captured. Rejected tier 1/2 captures
// escalate; a rejected focused-popup capture keeps the last good copy (render_degraded).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
const real = {
  tryBackgroundWithSpoof: g.tryBackgroundWithSpoof,
  tryOffscreenWindow: g.tryOffscreenWindow,
  tryActiveTab: g.tryActiveTab,
  tabBasedRefresh: g.tabBasedRefresh,
  refreshComponent: g.refreshComponent,
  requiresVisibleTab: g.requiresVisibleTab
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

// ---------- #152: a requiresActiveFocus card tries a QUIET attempt first and keeps it only if it matches the saved copy ----------
// Fixtures are numeric only (images, large images): the repo is public, so no real page content or URLs go in here.

const flaggedBar = vm.runInThisContext('FLAGGED_PROBE_MIN_RATIO')
const phases = vm.runInThisContext('_refreshPhase') // WeakMap: which lane refreshAll has a flagged card in
const withUrlGate = vm.runInThisContext('_withUrlGate')
const urlKey = vm.runInThisContext('_urlKey')
const spreadByUrl = vm.runInThisContext('_spreadByUrl')
// n images, the first l of them "large" (data-scale-context medium)
const pic = (n, l = 0) => `<ul class="deals">${Array.from({ length: n }, (_, i) =>
  `<li><img src="https://cdn.example.com/p-${i}.jpg" data-scale-context="${i < l ? 'medium' : 'small'}" alt="p${i}">Item ${i} with enough text to count as real content</li>`).join('')}</ul>`
const strictOk = (cand, saved, visible = false) => g.assessCaptureQuality(pic(...cand), pic(...saved), visible, true).ok

test('assess strict: the bar is 0.85 and sits exactly on the boundary (17 of 20 passes, 16 of 20 does not)', () => {
  assert.equal(flaggedBar, 0.85)
  assert.equal(strictOk([17, 0], [20, 0]), true)
  assert.equal(strictOk([16, 0], [20, 0]), false)
})

test('assess strict: large images must match too once the saved copy has >= 5 of them (4 is noise)', () => {
  assert.equal(strictOk([20, 9], [20, 10]), true)
  assert.equal(strictOk([20, 8], [20, 10]), false)
  assert.equal(strictOk([20, 0], [20, 4]), true)
  assert.equal(strictOk([20, 0], [20, 5]), false)
})

test('assess strict: the page-visibility exemption never applies to the quiet probe (default callers keep it)', () => {
  assert.equal(g.assessCaptureQuality(pic(10), pic(20), true, true).ok, false)
  assert.equal(g.assessCaptureQuality(pic(10), pic(20), true).ok, true)
  assert.equal(g.assessCaptureQuality(pic(10), pic(20), false).ok, true) // 0.5: the default bar still accepts it
})

test('assess strict: a saved copy under 5 images is never judged', () => {
  assert.equal(strictOk([0, 0], [4, 0]), true)
})

test('regression fixtures (numeric tuples from measured quiet probes, [images, large] candidate vs saved)', () => {
  const degraded = [[[51, 20], [71, 29]], [[46, 18], [71, 29]], [[31, 10], [70, 29]], [[11, 0], [71, 29]], [[2, 0], [16, 0]], [[0, 0], [15, 0]]]
  for (const [cand, saved] of degraded) assert.equal(strictOk(cand, saved), false, `degraded ${cand} vs ${saved}`)
  const valid = [[[71, 29], [61, 29]], [[16, 1], [16, 1]], [[16, 1], [15, 0]], [[19, 1], [17, 2]], [[16, 0], [16, 0]], [[70, 29], [71, 29]], [[71, 29], [71, 29]]]
  for (const [cand, saved] of valid) assert.equal(strictOk(cand, saved), true, `valid ${cand} vs ${saved}`)
})

test('the old 0.4 bar accepted the degraded 51/20 vs 71/29 capture; the strict comparison rejects it', () => {
  assert.equal(g.assessCaptureQuality(pic(51, 20), pic(71, 29), false).ok, true)
  assert.equal(strictOk([51, 20], [71, 29]), false)
})

test('known residual (documented): repeated near-bar acceptances can thin a card step by step — no stateless guard', () => {
  const steps = [100, 85, 73, 63] // each step is >= 0.85 of the previous saved copy, so each is accepted and becomes the baseline
  for (let i = 0; i < steps.length - 1; i++) assert.equal(strictOk([steps[i + 1], 0], [steps[i], 0]), true)
  assert.equal(strictOk([63, 0], [100, 0]), false) // against the original copy the same capture would have been rejected
})

const flaggedCard = (extra = {}) => ({ id: 'f1', name: 'Deals', url: 'https://example.com/hot', selector: 'ul.deals', html_cache: feed(24), excludedSelectors: [], positionBased: true, requiresActiveFocus: true, ...extra })
const probe = (c = flaggedCard()) => g._tabRefreshForComponent(c, null, 24, 24)

test('flagged (single-card refresh): a quiet capture that matches the saved copy is accepted — no focused popup, background tab skipped', async () => {
  const calls = stubTiers({ bg: { html: feed(24), visible: true }, off: { html: feed(22), visible: false }, active: { html: feed(24), visible: true } })
  const r = await probe()
  assert.deepEqual(calls, ['off'])
  assert.equal(r.html, feed(22))
  assert.equal(r.activeFocusNeeded, false)
})

test('flagged: 21 of 24 (0.875) is kept, 20 of 24 (0.83) falls through to the focused popup', async () => {
  let calls = stubTiers({ off: { html: feed(21), visible: false }, active: { html: feed(24), visible: true } })
  assert.equal((await probe()).html, feed(21))
  assert.deepEqual(calls, ['off'])
  calls = stubTiers({ off: { html: feed(20), visible: false }, active: { html: feed(24), visible: true } })
  const r = await probe()
  assert.deepEqual(calls, ['off', 'active'])
  assert.equal(r.html, feed(24))
  assert.equal(r.activeFocusNeeded, true)
})

test('flagged: an unfocused window that happens to read as visible does not earn the exemption', async () => {
  const calls = stubTiers({ off: { html: feed(5), visible: true }, active: { html: feed(24), visible: true } })
  const r = await probe()
  assert.deepEqual(calls, ['off', 'active'])
  assert.equal(r.html, feed(24))
})

test('flagged: quiet attempt fails outright -> focused popup, as before', async () => {
  const calls = stubTiers({ active: { html: feed(24), visible: true } })
  const r = await probe()
  assert.deepEqual(calls, ['off', 'active'])
  assert.equal(r.html, feed(24))
})

test('flagged: the focused popup keeps the normal bar and its visible exemption (a hidden 0.417 there still passes)', async () => {
  stubTiers({ off: { html: feed(3), visible: false }, active: { html: feed(10), visible: false } })
  assert.equal((await probe()).html, feed(10))
  stubTiers({ off: { html: feed(3), visible: false }, active: { html: feed(10), visible: true } })
  assert.equal((await probe()).html, feed(10))
})

test('flagged: quiet attempt rejected AND popup hidden + collapsed -> renderDegraded, no html (last good copy kept)', async () => {
  stubTiers({ off: { html: feed(3), visible: false }, active: { html: feed(2), visible: false } })
  const r = await probe()
  assert.equal(r.html, null)
  assert.equal(r.renderDegraded, true)
})

test('flagged with a saved copy under 5 images: no quiet attempt (the gate has nothing to judge), straight to the focused popup', async () => {
  const calls = stubTiers({ off: { html: feed(1), visible: false }, active: { html: feed(3), visible: true } })
  const r = await probe(flaggedCard({ html_cache: feed(3) }))
  assert.deepEqual(calls, ['active'])
  assert.equal(r.html, feed(3))
})

test('unflagged card: unchanged ladder (background tab first, default 0.4 bar at offscreen)', async () => {
  const calls = stubTiers({ bg: { html: feed(5), visible: false }, off: { html: feed(10), visible: false } })
  const r = await probe(flaggedCard({ requiresActiveFocus: false }))
  assert.deepEqual(calls, ['bg', 'off'])
  assert.equal(r.html, feed(10)) // 0.417 accepted at offscreen by the default bar
})

test('requiresVisibleTab sites still go straight to the focused popup, flagged or not', async () => {
  g.requiresVisibleTab = () => true
  for (const flagged of [true, false]) {
    const calls = stubTiers({ active: { html: feed(24), visible: true } })
    const r = await probe(flaggedCard({ requiresActiveFocus: flagged }))
    assert.deepEqual(calls, ['active'])
    assert.equal(r.html, feed(24))
  }
})

test("refreshAll lane 'probe': a good quiet capture is the result, a rejected one comes back probeRejected with NO focused popup", async () => {
  let calls = stubTiers({ off: { html: feed(22), visible: false }, active: { html: feed(24), visible: true } })
  const c = flaggedCard(); phases.set(c, 'probe')
  assert.equal((await probe(c)).html, feed(22))
  assert.deepEqual(calls, ['off'])
  calls = stubTiers({ off: { html: feed(10), visible: false }, active: { html: feed(24), visible: true } })
  const c2 = flaggedCard(); phases.set(c2, 'probe')
  const r = await probe(c2)
  assert.deepEqual(calls, ['off'])
  assert.equal(r.html, null)
  assert.equal(r.probeRejected, true)
  assert.equal(r.renderDegraded, undefined)
})

test("refreshAll lane 'probe': a layout the stored rules do not fit is also handed to the focus lane, not returned half-accepted", async () => {
  const c = flaggedCard({ selector: 'div.board', html_cache: boardP({ imgs: 24, ctx: 'medium' }), exclusionPatterns: [ruleP] }); phases.set(c, 'probe')
  stubTiers({ off: { html: narrowP, visible: false }, active: { html: narrowP, visible: true } })
  const r = await probe(c)
  assert.equal(r.probeRejected, true)
})

test("refreshAll lane 'focus': straight to the focused popup, no quiet attempt", async () => {
  const calls = stubTiers({ off: { html: feed(24), visible: false }, active: { html: feed(24), visible: true } })
  const c = flaggedCard(); phases.set(c, 'focus')
  const r = await probe(c)
  assert.deepEqual(calls, ['active'])
  assert.equal(r.html, feed(24))
})

// A remembered unfocused capture can be settled under the 'layout-match' tier name (stored-rule layout fits the unfocused render
// but not the popup's). For a flagged card that capture is the quiet attempt, so it must face the strict comparison too.
const ruleP = { a: 'DIV', c: 'price-row', p: [], t: 'DIV', n: 3 }
const boardP = ({ rowClass = 'price-row', imgs = 8, ctx = 'small' } = {}) =>
  `<div class="board"><h2>Which party will win</h2><p>Chart and odds text that is long enough to be real content.</p>${
    Array.from({ length: 3 }, (_, i) => `<div class="${rowClass}">Yes ${60 + i}c No ${40 - i}c</div>`).join('')
  }<div class="imgs">${Array.from({ length: imgs }, (_, i) => `<img src="https://cdn.example.com/m-${i}.jpg" data-scale-context="${ctx}" alt="m${i}">`).join('')}</div></div>`
const patternCard = () => flaggedCard({ selector: 'div.board', html_cache: boardP({ imgs: 24, ctx: 'medium' }), exclusionPatterns: [ruleP] })
const narrowP = boardP({ rowClass: 'narrow-row', imgs: 24, ctx: 'medium' })

test("flagged + stored rules: a remembered quiet capture settled as 'layout-match' faces the strict comparison (11 of 24 rejected, 21 of 24 kept)", async () => {
  // raw large count is 0 (Gate 2 remembers it as a layout match); the strict check judges the CLEANED capture, where the
  // sanitising step labels the images like the saved copy's
  const thin = boardP({ imgs: 11 }), full = boardP({ imgs: 21 })
  stubTiers({ off: { html: thin, visible: true }, active: { html: narrowP, visible: true } })
  assert.notEqual((await probe(patternCard())).html, thin)
  stubTiers({ off: { html: full, visible: true }, active: { html: narrowP, visible: true } })
  assert.equal((await probe(patternCard())).html, full)
})

test('the same-URL gate: two quiet probes on one URL never overlap; probes on different URLs still do', async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
  const track = async (url) => { let live = 0, peak = 0; const fn = async () => { live++; peak = Math.max(peak, live); await wait(20); live-- }; await Promise.all([withUrlGate(url, fn), withUrlGate(url, fn), withUrlGate(url, fn)]); return peak }
  assert.equal(await track('https://same.example/a'), 1)
  let live = 0, peak = 0
  const fn = async () => { live++; peak = Math.max(peak, live); await wait(20); live-- }
  await Promise.all([withUrlGate('https://x.example/1', fn), withUrlGate('https://x.example/2', fn)])
  assert.equal(peak, 2)
})

test('the same-URL gate key ignores the fragment and host case, so those cards still take turns', async () => {
  assert.equal(urlKey('https://Example.com/hot#top'), urlKey('https://example.com/hot'))
  assert.notEqual(urlKey('https://example.com/hot?a=1'), urlKey('https://example.com/hot?a=2'))
  assert.equal(urlKey('not a url'), 'not a url')
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
  let live = 0, peak = 0
  const fn = async () => { live++; peak = Math.max(peak, live); await wait(20); live-- }
  await Promise.all([withUrlGate(urlKey('https://x.example/a#1'), fn), withUrlGate(urlKey('https://X.example/a#2'), fn)])
  assert.equal(peak, 1)
})

test('same-URL cards are spread apart in the pool queue (a waiting sibling holds a slot), order otherwise stable', () => {
  const cards = [{ id: 1, url: 'https://a.example/p' }, { id: 2, url: 'https://a.example/p#x' }, { id: 3, url: 'https://a.example/p' }, { id: 4, url: 'https://b.example/p' }, { id: 5, url: 'https://c.example/p' }]
  assert.deepEqual(spreadByUrl(cards).map(c => c.id), [1, 4, 5, 2, 3])
  assert.deepEqual(spreadByUrl([]).map(c => c.id), [])
  assert.deepEqual(spreadByUrl([cards[3], cards[4]]).map(c => c.id), [4, 5])
})

test('a failed refresh keeps the last good copy', async () => {
  global.fetch = async () => { throw new Error('offline') }
  stubTiers({ off: { html: feed(3), visible: false }, active: { html: feed(1), visible: false } })
  const c = flaggedCard()
  const r = await g.refreshComponent(c)
  assert.equal(r.success, false)
  const { localEntry } = g.applyRefreshResult(c, r)
  assert.equal(localEntry.html_cache, feed(24))
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
