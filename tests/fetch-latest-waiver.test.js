// #226: the failure banner's "Fetch latest" (second content_shrunk failure) waives ONLY the size ratio of the list-size check
// (#202/#218) for that one refresh. Pinned here: the accept rule becomes the 3-item minimum (2 rejected, 3 accepted); the wide-vs-narrow
// choice is never stricter under the waiver; the waiver is one call wide and keyed to the component object; and the banner ladder
// (Retry only -> Retry + Fetch latest, content_shrunk only) with its runtime marker. dashboard.js is not loadable in node, so the
// ladder is source-extracted (#118 / #205 precedent). The live proof on the real page is the e2e.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
const LL = await import('../.test-build/utils/lazy-load.js')
window.LazyLoad = { ...LL } // the engine judges with the real rule (structureRecovered); without it the check degrades to count > 0
const real = { tryBackgroundWithSpoof: g.tryBackgroundWithSpoof, tryOffscreenWindow: g.tryOffscreenWindow, tryActiveTab: g.tryActiveTab }
beforeEach(() => Object.assign(g, real))

const list = n => `<ul class="deals">${Array.from({ length: n }, (_, i) => `<li><a href="/c/${i}">Comment number ${i} with some words</a></li>`).join('')}</ul>`
const card = (extra = {}) => ({ id: 'k1', name: 'House', url: 'https://example.com/house', selector: 'ul.deals', html_cache: list(38), excludedSelectors: [], positionBased: true, ...extra })
const SHELL = '<html><body><ul class="deals"><li class="skeleton">&nbsp;</li></ul></body></html>'
const waiverSet = () => vm.runInThisContext('_fetchLatestComponents')

// Runs a real refreshComponent through the shell-page path with the tiers stubbed, and hands back the structureCheck the
// focused popup was given (plus what the waiver set held while the popup ran).
async function popupCheck(component, opts) {
  global.fetch = async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => SHELL })
  let check = null
  let expectedSeen = null
  let heldDuring = null
  g.tryBackgroundWithSpoof = async () => null
  g.tryOffscreenWindow = async () => null
  g.tryActiveTab = async (url, sel, fp, meta = {}) => {
    check = meta.structureCheck
    expectedSeen = meta.expectedStructure
    heldDuring = { own: waiverSet().has(component), sameIdOtherObject: waiverSet().has({ ...component }) }
    return null
  }
  await g.refreshComponent(component, opts)
  return { check, heldDuring, expectedSeen }
}

test('ordinary refresh: the saved copy is the baseline (14 of a saved 38 is rejected, half of it passes)', async () => {
  const { check } = await popupCheck(card())
  const low = check(list(14))
  assert.deepEqual({ count: low.count, ok: low.ok, expected: low.expected }, { count: 14, ok: false, expected: 38 })
  assert.equal(check(list(19)).ok, true)
})

test('Fetch latest: the ratio is waived down to the 3-item minimum (0 and 2 rejected, 3 and 14 accepted)', async () => {
  const { check } = await popupCheck(card(), { fetchLatest: true })
  assert.equal(check(list(14)).ok, true)
  assert.equal(check(list(3)).ok, true)
  assert.equal(check(list(2)).ok, false, 'a 2-item capture is still thrown away')
  assert.equal(check(list(0)).ok, false)
  assert.equal(check(list(14)).expected, 0, 'the baseline judged against is reported back for the wide-pass choice')
})

test('the saved-copy count that drives the settle scroll is NOT touched by the waiver (the capture this feature exists for needs the settle)', async () => {
  const ordinary = await popupCheck(card())
  const waived = await popupCheck(card(), { fetchLatest: true })
  assert.equal(ordinary.expectedSeen, 38)
  assert.equal(waived.expectedSeen, 38)
})

test('the waiver is one call wide, keyed to the component object, and never leaks to the next refresh', async () => {
  const c = card()
  const first = await popupCheck(c, { fetchLatest: true })
  assert.deepEqual(first.heldDuring, { own: true, sameIdOtherObject: false }, 'held for the call; a second object with the same id (what Refresh All builds) does not inherit it')
  assert.equal(waiverSet().has(c), false, 'cleared when the call returns')
  const next = await popupCheck(c)
  assert.equal(next.check(list(14)).ok, false, 'a failed Fetch latest followed by an ordinary Retry enforces the ratio again')
  assert.equal(next.heldDuring.own, false)
})

test('the waiver is cleared even when the refresh throws', async () => {
  const c = card()
  const real = g._refreshComponentCore
  g._refreshComponentCore = async () => { assert.equal(waiverSet().has(c), true); throw new Error('boom') }
  try {
    await assert.rejects(() => g.refreshComponent(c, { fetchLatest: true }), /boom/)
    assert.equal(waiverSet().has(c), false)
  } finally { g._refreshComponentCore = real }
})

test('the waiver reaches the focused popup on a single-card refresh (the tier that holds the check)', async () => {
  global.fetch = async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => SHELL })
  const calls = []
  g.tryBackgroundWithSpoof = async () => { calls.push('bg'); return null }
  g.tryOffscreenWindow = async () => { calls.push('off'); return null }
  g.tryActiveTab = async () => { calls.push('active'); return null }
  await g.refreshComponent(card(), { fetchLatest: true })
  assert.ok(calls.includes('active'))
})

// wide pass (#186): under the waiver the saved copy is not the baseline, so the choice is never stricter than today
const cnt = html => (html.match(/<li>/g) || []).length
const LIST = n => '<ul>' + '<li>x</li>'.repeat(n) + '</ul>'
const checkWith = expected => html => { const count = cnt(html); return { count, expected, ok: count >= Math.max(3, Math.ceil(expected / 2)) } }
const better = (narrow, wide, expected) => g._wideCaptureBetter(narrow, wide, { expectedStructure: 32, structureCheck: checkWith(expected) })

test('wide pass: a narrow capture that passes the saved-copy test no longer forces the wide one up to the saved copy under the waiver', () => {
  assert.equal(better(LIST(20), LIST(10), 32), false, 'ordinary refresh: narrow 20 passes 16 of 32, wide 10 would fail it')
  assert.equal(better(LIST(20), LIST(10), 0), true, 'Fetch latest: judged against the narrow list only (10 is half of 20)')
  assert.equal(better(LIST(14), LIST(12), 0), true, '14 narrow / 12 wide still takes the wide capture (never stricter than before)')
  assert.equal(better(LIST(14), LIST(6), 0), false, 'a wide capture that collapsed the narrow list is still refused')
  // never stricter than an ordinary refresh, even when the narrow capture is more than twice the saved copy (cold review 2)
  const small = (narrow, wide, expected, waived) => g._wideCaptureBetter(narrow, wide, { expectedStructure: expected, structureCheck: checkWith(waived ? 0 : expected) })
  assert.equal(small(LIST(20), LIST(6), 4, false), true, 'ordinary: narrow 20 passes 2 of a saved 4, wide 6 is as complete as the saved copy')
  assert.equal(small(LIST(20), LIST(6), 4, true), true, 'Fetch latest takes it too (the relative rule alone would keep the narrow capture)')
})

// ladder: source-extracted from dashboard.js
const src = fs.readFileSync(new URL('../public/dashboard.js', import.meta.url), 'utf8')
const body = src.slice(src.indexOf('const shrunkRetryIds'), src.indexOf('function startRecapture'))
const RECAPTURE_BUTTON_HTML = '<button type="button" class="error-recapture-btn">Re-capture</button>'
const ladder = new Function('getErrorLabel', 'shouldOfferRecapture', 'RECAPTURE_BUTTON_HTML', body + '; return { shrunkRetryIds, shrunkLadderStep, updateShrunkMarker, buildErrorBannerHTML, FETCH_LATEST_WARNING }')(g.getErrorLabel, g.shouldOfferRecapture, RECAPTURE_BUTTON_HTML)
const failed = code => ({ id: 'c1', url: 'https://example.com/', lastOutcome: 'failed', lastErrorCode: code })
const ok = { id: 'c1', url: 'https://example.com/', lastOutcome: 'success', lastErrorCode: null }
beforeEach(() => ladder.shrunkRetryIds.clear())

test('banner step 1 (first content_shrunk failure): Retry only, no Open site, no Fetch latest, no warning', () => {
  const html = ladder.buildErrorBannerHTML(failed('content_shrunk'), 'content_shrunk')
  assert.ok(html.includes('error-retry-btn'))
  assert.doesNotMatch(html, /error-open-btn|error-fetch-btn|error-fetch-warning|error-recapture-btn/)
})

test('banner step 2: warning above Retry (primary) + Fetch latest, approved sentence, still no Open site', () => {
  ladder.shrunkRetryIds.add('c1')
  const html = ladder.buildErrorBannerHTML(failed('content_shrunk'), 'content_shrunk')
  assert.ok(html.includes(ladder.FETCH_LATEST_WARNING))
  assert.equal(ladder.FETCH_LATEST_WARNING, "Fetches the page again and replaces your saved copy with whatever it shows now. This may contain fewer items and can't be undone.")
  assert.ok(html.indexOf('error-message') < html.indexOf('error-fetch-warning') && html.indexOf('error-fetch-warning') < html.indexOf('error-actions'), 'message, then warning, then the buttons')
  const actions = html.slice(html.indexOf('class="error-actions"'))
  assert.ok(actions.indexOf('error-retry-btn') < actions.indexOf('error-fetch-btn'), 'Retry first')
  assert.doesNotMatch(html, /error-open-btn/)
  assert.match(html, />Fetch latest and replace<\/button>/, 'the label says the consequence; it fits the 159 px half-row at 12 px (measured: 128 px of 137 px)')
})

test('every other failure code keeps its banner exactly as before, marker or not (Retry + Open site, never Fetch latest)', () => {
  ladder.shrunkRetryIds.add('c1')
  for (const code of ['network', 'skeleton', 'render_degraded', 'layout_changed', 'content_lost', 'exclusions_unapplied', 'pattern_unapplied', 'unknown']) {
    const html = ladder.buildErrorBannerHTML(failed(code), code)
    assert.ok(html.includes('error-retry-btn') && html.includes('error-open-btn'), code)
    assert.doesNotMatch(html, /error-fetch/, code)
  }
})

test('marker: the first failure never shows step 2; only the banner Retry of the card itself failing content_shrunk AGAIN arms it', () => {
  const c = failed('content_shrunk')
  ladder.updateShrunkMarker(c, { fromBannerRetry: false, previousCode: null }) // first failure / Refresh All / refresh button
  assert.equal(ladder.shrunkLadderStep(c, 'content_shrunk'), 1)
  ladder.updateShrunkMarker(c, { fromBannerRetry: true, previousCode: 'content_shrunk' })
  assert.equal(ladder.shrunkLadderStep(c, 'content_shrunk'), 2)
  ladder.updateShrunkMarker(c, { fromBannerRetry: false, previousCode: 'content_shrunk' }) // a later non-banner failure with the same code keeps it
  assert.equal(ladder.shrunkLadderStep(c, 'content_shrunk'), 2)
})

test('marker: a banner Retry that STARTED from another failure code and ends in content_shrunk is a first content_shrunk failure: step 1, not 2', () => {
  for (const previousCode of ['network', 'skeleton', 'layout_changed', null]) {
    ladder.shrunkRetryIds.clear()
    const c = failed('content_shrunk')
    ladder.updateShrunkMarker(c, { fromBannerRetry: true, previousCode })
    assert.equal(ladder.shrunkLadderStep(c, 'content_shrunk'), 1, String(previousCode))
  }
})

test('marker: cleared by a success and by any other failure code', () => {
  for (const next of [ok, failed('network'), failed('skeleton')]) {
    ladder.shrunkRetryIds.add('c1')
    ladder.updateShrunkMarker(next, { fromBannerRetry: true, previousCode: 'content_shrunk' })
    assert.equal(ladder.shrunkRetryIds.has('c1'), false, String(next.lastErrorCode))
  }
})

test('marker: a banner Retry that ends in another code does not arm step 2', () => {
  ladder.updateShrunkMarker(failed('network'), { fromBannerRetry: true, previousCode: 'content_shrunk' })
  assert.equal(ladder.shrunkRetryIds.has('c1'), false)
})

test('wiring in dashboard.js: a banner button pressed while the card is refreshing sets no one-shot flag (a click on a disabled button does nothing, so the flag would leak to the next refresh)', () => {
  const all = [...src.matchAll(/dataset\.(retry|fetchLatest) = '1'/g)]
  const guarded = [...src.matchAll(/(?:if \(refreshSingleBtn\.disabled\) return;[^\n]*\n\s*refreshSingleBtn|if \(refreshBtn && !refreshBtn\.disabled\) \{\s*refreshBtn)\.dataset\.(retry|fetchLatest) = '1'/g)]
  assert.equal(all.length, 4, 'retry x2 + fetchLatest x2 call sites (new banner, first-render banner)')
  assert.equal(guarded.length, all.length, 'every site is guarded by the statement directly above it')
})

test('wiring in dashboard.js: the marker is updated BEFORE the storage write (a throwing write must not leave a stale marker), and a banner that enters, moves within or leaves the ladder is rebuilt, not relabelled', () => {
  const handler = src.slice(src.indexOf("const isFetchLatest"), src.indexOf("// Error banner retry button"))
  assert.ok(handler.indexOf('updateShrunkMarker(component') > 0 && handler.indexOf('updateShrunkMarker(component') < handler.indexOf('await persistRefreshOutcomes('))
  assert.match(handler, /shrunkLadderStep\(component, errorCode\) !== 0 \|\| !existingBanner\.querySelector\('\.error-open-btn'\)/)
  assert.match(handler, /restoreBannerFocus = existingBanner\.contains\(document\.activeElement\)/)
  assert.ok(handler.indexOf('restoreBannerFocus = existingBanner') < handler.indexOf('existingBanner.remove()'), 'focus is read BEFORE the old banner is detached (contains() on a detached node is always false)')
  assert.match(handler, /if \(restoreBannerFocus\) retryBtn\.focus\(\)/)
})

test('wiring in dashboard.js: Fetch latest rides its own one-shot flag into refreshComponent, is consumed whatever the outcome, and the delete branch clears the marker', () => {
  assert.match(src, /dataset\.fetchLatest === '1'/)
  assert.match(src, /delete refreshSingleBtn\.dataset\.fetchLatest/)
  assert.match(src, /refreshComponent\(component, \{ fetchLatest: isFetchLatest \}\)/)
  assert.match(src, /if \(isFetchLatest\) shrunkRetryIds\.delete\(component\.id\)/)
  assert.match(src, /updateShrunkMarker\(component, \{ fromBannerRetry: isRetry, previousCode \}\)/)
  assert.match(src, /const previousCode = component\.lastOutcome === 'failed' \? component\.lastErrorCode : null/)
  assert.match(src, /\} finally \{\s*if \(isFetchLatest\) shrunkRetryIds\.delete\(component\.id\)/, 'consumed in the finally, so a throw cannot leave step 2 armed')
  assert.match(src, /shouldDelete\) \{\s*shrunkRetryIds\.delete\(component\.id\)/)
})
