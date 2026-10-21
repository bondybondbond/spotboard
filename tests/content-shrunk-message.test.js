// #218: when the focused popup's list-size check (#202) rejects a capture on the shell-page path, the card says the page shows
// much less than the saved card and that the last good copy was kept, instead of "Site didn't load completely". Words only: the
// same failure, the same kept copy, the same retry behaviour, the same analytics value, no new tier step. Every OTHER path that
// can see a null popup result keeps exactly the result it had (cold review: the drift-guard rescue must stay reachable).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
const real = {
  tryBackgroundWithSpoof: g.tryBackgroundWithSpoof,
  tryOffscreenWindow: g.tryOffscreenWindow,
  tryActiveTab: g.tryActiveTab
}
beforeEach(() => Object.assign(g, real))

const WORDS = 'Page shows much less content than your saved card. Kept your last good copy'
const list = n => `<ul class="deals">${Array.from({ length: n }, (_, i) => `<li><a href="/c/${i}">Comment number ${i} with some words</a></li>`).join('')}</ul>`
const SAVED = list(38)
const card = (extra = {}) => ({ id: 'k1', name: 'House', url: 'https://example.com/house', selector: 'ul.deals', html_cache: SAVED, excludedSelectors: [], positionBased: true, ...extra })
// what a React page serves before it hydrates: the block exists but is a loading shell
const SHELL = '<html><body><ul class="deals"><li class="skeleton">&nbsp;</li></ul></body></html>'
const serve = html => { global.fetch = async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => html }) }

// tiers: bg / offscreen return nothing; the popup returns nothing and (optionally) says its list-size check was the reason
function stubTiers({ stub, active = null }) {
  const calls = []
  g.tryBackgroundWithSpoof = async () => { calls.push('bg'); return null }
  g.tryOffscreenWindow = async () => { calls.push('off'); return null }
  g.tryActiveTab = async (url, sel, fp, meta = {}) => {
    calls.push('active')
    if (stub) meta.structureStub = { count: 14, expected: 38 }
    return active
  }
  return calls
}

test('words: the error classifies as content_shrunk and the label is the approved sentence (no trailing period: the toast adds its own)', () => {
  const r = g._contentShrunkResult()
  assert.equal(r.success, false)
  assert.equal(r.keepOriginal, true)
  assert.equal(g.classifyError(r.error), 'content_shrunk')
  assert.equal(g.getErrorLabel('content_shrunk'), WORDS)
  assert.doesNotMatch(g.getErrorLabel('content_shrunk'), /\.$/)
  assert.doesNotMatch(g.getErrorLabel('content_shrunk'), /site|kalshi/i, 'describes the condition, does not blame the site')
})

test('unchanged: the degraded result and the skeleton message keep their code and words', () => {
  assert.equal(g._renderDegradedResult().error, 'Page did not fully load')
  assert.equal(g.classifyError(g._renderDegradedResult().error), 'render_degraded')
  assert.equal(g.classifyError('Page returned skeleton content (JS not loaded)'), 'skeleton')
  assert.equal(g.getErrorLabel('skeleton'), "Site didn't load completely")
  assert.equal(g.getErrorLabel('render_degraded'), "Page didn't fully load — kept your last good copy")
})

test('unchanged: no Re-capture button for content_shrunk (it would wipe the exclusions); Retry behaves as for skeleton', () => {
  assert.equal(g.shouldOfferRecapture({ lastOutcome: 'failed', lastErrorCode: 'content_shrunk' }), false)
  assert.equal(g.shouldOfferRecapture({ lastOutcome: 'failed', lastErrorCode: 'skeleton' }), false)
  assert.ok(!/exclusion|re-capture/i.test(g.getErrorLabel('content_shrunk')))
})

test('unchanged analytics: the shell path reported skeleton_content before, and content_shrunk reports the same value', () => {
  const ga4 = vm.runInThisContext('_GA4_ERROR_LABEL') // a script-scope const, not a property of the global object
  assert.equal(ga4.skeleton, 'skeleton_content')
  assert.equal(ga4.content_shrunk, ga4.skeleton)
})

test('tabBasedRefresh, last-resort path: popup nothing + list-size reason -> shrunk, html still null, NOT renderDegraded; without the reason nothing new', async () => {
  let calls = stubTiers({ stub: true })
  let r = await g.tabBasedRefresh('https://example.com/house', 'ul.deals', null, 0, 0, false, false, {})
  assert.deepEqual(calls, ['bg', 'off', 'active'], 'same tiers, same order')
  assert.equal(r.html, null)
  assert.equal(r.shrunk, true)
  assert.equal(r.renderDegraded, undefined, 'callers other than the shell path see the same null result as before')

  calls = stubTiers({ stub: false })
  r = await g.tabBasedRefresh('https://example.com/house', 'ul.deals', null, 0, 0, false, false, {})
  assert.deepEqual(calls, ['bg', 'off', 'active'])
  assert.equal(r.html, null)
  assert.equal(r.shrunk, undefined, 'a popup that returned nothing for another reason is not relabelled')
  assert.equal(r.renderDegraded, undefined)
})

test('tabBasedRefresh, straight-to-popup path (flagged card): same marker, same negative', async () => {
  let calls = stubTiers({ stub: true })
  let r = await g.tabBasedRefresh('https://example.com/house', 'ul.deals', null, 0, 0, true, false, {})
  assert.deepEqual(calls, ['active'])
  assert.equal(r.html, null)
  assert.equal(r.shrunk, true)
  assert.equal(r.renderDegraded, undefined)

  calls = stubTiers({ stub: false })
  r = await g.tabBasedRefresh('https://example.com/house', 'ul.deals', null, 0, 0, true, false, {})
  assert.deepEqual(calls, ['active'])
  assert.equal(r.shrunk, undefined)
})

test('a popup capture that passes still wins (the words never replace a success)', async () => {
  stubTiers({ stub: false, active: list(30) })
  const r = await g.tabBasedRefresh('https://example.com/house', 'ul.deals', null, 0, 0, true, false, {})
  assert.equal(r.html, list(30))
  assert.equal(r.shrunk, undefined)
})

test('shell page end to end: shrunk popup -> content_shrunk failure, last good copy byte-identical, no success stamped', async () => {
  serve(SHELL)
  stubTiers({ stub: true })
  const c = card()
  const r = await g.refreshComponent(c)
  assert.equal(r.success, false)
  assert.equal(r.keepOriginal, true)
  assert.equal(g.classifyError(r.error), 'content_shrunk')
  const { localEntry, syncEntry } = g.applyRefreshResult(c, r)
  assert.equal(localEntry.html_cache, SAVED, 'saved copy untouched')
  assert.equal(syncEntry.lastErrorCode, 'content_shrunk')
  assert.equal(syncEntry.lastOutcome, 'failed')
})

test('shell page end to end, negative: popup nothing for another reason keeps the old skeleton message', async () => {
  serve(SHELL)
  stubTiers({ stub: false })
  const r = await g.refreshComponent(card())
  assert.equal(r.success, false)
  assert.equal(r.error, 'Page returned skeleton content (JS not loaded)')
  assert.equal(g.classifyError(r.error), 'skeleton')
})

test('other paths are untouched: fetch failed + shrunk popup gives the same result as without the reason', async () => {
  global.fetch = async () => { throw new Error('offline') }
  stubTiers({ stub: true })
  const withReason = await g.refreshComponent(card())
  stubTiers({ stub: false })
  const without = await g.refreshComponent(card())
  assert.deepEqual({ success: withReason.success, error: withReason.error }, { success: without.success, error: without.error })
  assert.notEqual(g.classifyError(withReason.error), 'content_shrunk')
})

test('other paths are untouched: the drift guard keeps its direct-fetch rescue when the popup was shrunk', async () => {
  const c = () => card({ rawCaptureLength: 1000 })
  const drifted = '<ul class="deals">' + '<li>Server text item long enough to count</li>'.repeat(60) + '</ul>' // > 1.5x raw baseline
  let calls = stubTiers({ stub: true })
  const withReason = await g._runDriftGuard(drifted, c(), 0, 0)
  assert.ok(calls.includes('active'), 'the popup tier really ran (the comparison is not vacuous)')
  calls = stubTiers({ stub: false })
  const without = await g._runDriftGuard(drifted, c(), 0, 0)
  assert.ok(calls.includes('active'))
  assert.equal(withReason.success, without.success, 'same outcome (the rescue from the direct fetch stays reachable)')
  assert.equal(withReason.error, without.error)
  if (withReason.error) assert.notEqual(g.classifyError(withReason.error), 'content_shrunk')
})

test('source: exactly one path reads shrunk; every renderDegraded site is unchanged', () => {
  const src = fs.readFileSync(new URL('../public/utils/refresh-engine.js', import.meta.url), 'utf8')
  assert.equal((src.match(/_contentShrunkResult\(\)/g) || []).length, 2, 'the definition comment-free call + the one call site: definition is "function _contentShrunkResult()"')
  assert.equal((src.match(/return _contentShrunkResult\(\)/g) || []).length, 1, 'only the shell-page path')
  assert.equal((src.match(/return _renderDegradedResult\(\)/g) || []).length, 6, 'the six #101 sites keep their call as it was')
})

test('source: thresholds and the settle are untouched by #218', () => {
  const lazy = fs.readFileSync(new URL('../public/utils/lazy-load.js', import.meta.url), 'utf8')
  assert.match(lazy, /var MIN_SAVED_STRUCTURE = 3;/)
  assert.match(lazy, /count >= Math\.max\(MIN_SAVED_STRUCTURE, Math\.ceil\(expected \/ 2\)\)/)
  assert.match(lazy, /const maxSteps = opts\.maxSteps \?\? 30;\s*const maxMs = opts\.maxMs \?\? 1e4;\s*const stepWaitMs = opts\.stepWaitMs \?\? 350;\s*const finalSettleMs = opts\.finalSettleMs \?\? 500;/)
})
