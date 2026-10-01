// #132: tab-tier arbitration for cards with stored "exclude all like this" rules. Kalshi shape:
// the wide background-tab render fits the rule (and the saved copy) but trips the large-image
// heuristic (the saved copy holds volatile chat GIFs); the ~300px popups then serve a different
// layout where the rule matches nothing. The pattern guard stays the gate -- these tests prove the
// arbitration steers to the compatible candidate, never to one that faults, and fails closed otherwise.
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
beforeEach(() => { Object.assign(g, real); global.fetch = async () => { throw new Error('offline') } })

const rule = { a: 'DIV', c: 'price-row', p: [], t: 'DIV', n: 3 }

// One Kalshi-shaped board: price rows under `rowClass`, n images tagged with a scale context.
function board({ rowClass = 'price-row', rows = 3, imgs = 8, ctx = 'small' } = {}) {
  const priceRows = Array.from({ length: rows }, (_, i) => `<div class="${rowClass}">Yes ${60 + i}c No ${40 - i}c</div>`).join('')
  const images = Array.from({ length: imgs }, (_, i) =>
    `<img src="https://cdn.example.com/m-${i}.jpg" data-scale-context="${ctx}" alt="m${i}">`).join('')
  return `<div class="board"><h2>Which party will win the Senate</h2><p>Chart and odds text that is long enough to be real content.</p>${priceRows}<div class="imgs">${images}</div></div>`
}
const wide = board()                                  // fits the rule, but 0 large images
const narrow = board({ rowClass: 'narrow-row' })      // rule matches nothing
const saved = board({ imgs: 24, ctx: 'medium' })      // saved copy: lots of "large" (volatile) images
const wideFaults = html => g.markPatternExclusions(g.stripEventHandlers(html), [rule]).faults.length

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
const assess = (html, visible) => g.assessCaptureQuality(html, saved, visible)
const layoutOk = html => !wideFaults(html)
const run = (opts = { assess, layoutOk }) =>
  g.tabBasedRefresh('https://example.com/', 'div.board', null, 24, 24, false, false, opts)

test('fixture sanity: wide fits the rule, narrow does not', () => {
  assert.equal(wideFaults(wide), 0)
  assert.ok(wideFaults(narrow) > 0)
})

test('Kalshi shape: wide render rejected by the image heuristic, both popups fault -> wide returned', async () => {
  const calls = stubTiers({ bg: { html: wide, visible: true }, off: { html: narrow, visible: true }, active: { html: narrow, visible: true } })
  const r = await run()
  assert.deepEqual(calls, ['bg', 'off', 'active'])
  assert.equal(r.html, wide)
  assert.equal(r.activeFocusNeeded, false, 'must not learn requiresActiveFocus from a compatible background render')
})

test('invariant: with patterns, anything returned alongside a layout match never faults', async () => {
  stubTiers({ bg: { html: wide, visible: true }, off: { html: narrow, visible: true }, active: { html: narrow, visible: true } })
  const r = await run()
  assert.equal(wideFaults(r.html), 0)
})

test('no positive evidence: later tiers merely time out -> wide is NOT forced through the image gate', async () => {
  const calls = stubTiers({ bg: { html: wide, visible: true } })
  const r = await run()
  assert.deepEqual(calls, ['bg', 'off', 'active'])
  assert.equal(r.html, null)
})

test('"every image gone" is never overridable by a layout match', async () => {
  const bare = board({ imgs: 0 })
  stubTiers({ bg: { html: bare, visible: true }, off: { html: narrow, visible: true }, active: { html: narrow, visible: true } })
  const r = await run()
  assert.notEqual(r.html, bare)
})

test('#101 still judges the layout match: hidden + collapsed fallback is not returned', async () => {
  const thin = board({ imgs: 2 })
  stubTiers({ bg: { html: thin, visible: false }, off: { html: narrow, visible: false }, active: { html: narrow, visible: false } })
  const r = await run()
  assert.notEqual(r.html, thin)
})

test('negative: every tier faults -> first otherwise-acceptable faulting candidate comes back (cause stays "rule no longer fits")', async () => {
  const narrowLarge = board({ rowClass: 'narrow-row', ctx: 'medium' })
  const calls = stubTiers({ bg: { html: narrowLarge, visible: true }, off: { html: narrow, visible: true }, active: { html: narrow, visible: true } })
  const r = await run()
  assert.deepEqual(calls, ['bg', 'off', 'active'])
  assert.equal(r.html, narrowLarge)
  assert.ok(wideFaults(r.html) > 0)
})

test('without patterns (hook absent) arbitration is exactly as before: last tier result is taken as-is', async () => {
  const calls = stubTiers({ bg: { html: wide, visible: true }, off: { html: narrow, visible: true }, active: { html: narrow, visible: true } })
  const r = await run({ assess })
  assert.deepEqual(calls, ['bg', 'off', 'active'])
  assert.equal(r.html, narrow)
  assert.equal(r.activeFocusNeeded, true)
})

test('compatible wide render that clears the image gate is accepted straight away (no extra tiers)', async () => {
  const good = board({ ctx: 'medium', imgs: 24 })
  const calls = stubTiers({ bg: { html: good, visible: true } })
  const r = await run()
  assert.deepEqual(calls, ['bg'])
  assert.equal(r.html, good)
})

test('offscreen tier can also hold the layout match (background gave nothing, popup faults)', async () => {
  const calls = stubTiers({ off: { html: wide, visible: true }, active: { html: narrow, visible: true } })
  const r = await run()
  assert.deepEqual(calls, ['bg', 'off', 'active'])
  assert.equal(r.html, wide)
  assert.equal(r.activeFocusNeeded, false)
})

test('wide held, offscreen proved a different layout, focused popup times out -> wide still returned', async () => {
  stubTiers({ bg: { html: wide, visible: true }, off: { html: narrow, visible: true } })
  const r = await run()
  assert.equal(r.html, wide)
})

test('a faulting popup that is also hidden + collapsed stays render_degraded, not "re-capture"', async () => {
  const thin = board({ rowClass: 'narrow-row', imgs: 2 })
  stubTiers({ active: { html: thin, visible: false } })
  const r = await run()
  assert.equal(r.html, null)
  assert.equal(r.renderDegraded, true)
})

// ---------- refreshComponent end to end ----------

const card = (extra = {}) => ({ id: 'k1', name: 'Senate', url: 'https://example.com/senate', selector: 'div.board', html_cache: saved, excludedSelectors: [], exclusionPatterns: [rule], positionBased: true, ...extra })

test('refreshComponent: Kalshi shape refreshes successfully, rule applied, price rows excluded', async () => {
  stubTiers({ bg: { html: wide, visible: true }, off: { html: narrow, visible: true }, active: { html: narrow, visible: true } })
  const r = await g.refreshComponent(card())
  assert.equal(r.success, true, r.error)
  assert.doesNotMatch(r.html_cache, /price-row/)
  assert.match(r.html_cache, /Which party will win the Senate/)
})

test('refreshComponent: narrow-only world still fails closed as pattern_unapplied, last copy kept', async () => {
  stubTiers({ bg: { html: narrow, visible: true }, off: { html: narrow, visible: true }, active: { html: narrow, visible: true } })
  const r = await g.refreshComponent(card({ html_cache: board({ rowClass: 'narrow-row', imgs: 8 }) }))
  assert.equal(r.success, false)
  assert.equal(r.keepOriginal, true)
  assert.equal(g.classifyError(r.error), 'pattern_unapplied')
})
