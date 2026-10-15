// #204: a stored "exclude all like this" rule that matches NOTHING in a healthy-looking direct-fetch page may target
// elements a script adds after load (NPR's video-player controls). Refresh then tries the QUIET browser tiers before
// failing closed. These tests pin the safety contract: escalation only supplies a candidate; the same final pattern guard
// judges it; a rule that is gone everywhere still fails closed; over-growth and passing cards never escalate; the focused
// popup is never opened by this path. Drives the real refreshComponent() with stubbed fetch and tiers.
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
const { patternsMatchNothing } = await import('../.test-build/utils/dom-cleanup.js')

const credit = { a: 'SPAN', c: 'credit', p: [], t: 'SPAN', n: 6 }
const player = { a: 'DIV', c: 'jw-controls', p: [], t: 'DIV', n: 3 }
const story = i => `<article class="story"><figure class="thumb"><div class="credit-caption"><span class="credit">Photographer ${i}/AP</span></div></figure><div class="story-text"><h3 class="title">Headline number ${i} about something that happened today</h3></div></article>`
// the captured region as the page serves it; `controls` = the script-injected player nodes (only a rendered page has them)
const region = (n, { controls = 0, extraCredits = 0, offset = 0 } = {}) =>
  `<div class="content-wrap">${Array.from({ length: n }, (_, i) => story(i + 1 + offset)).join('')}` +
  Array.from({ length: controls }, (_, i) => `<div class="jw-controls">Volume ${i}</div>`).join('') +
  Array.from({ length: extraCredits }, (_, i) => `<span class="credit">Extra ${i}</span>`).join('') + '</div>'
const comp = (extra = {}) => ({ id: 'c1', name: 'NPR', url: 'https://www.npr.org/', selector: 'div.content-wrap', positionBased: true, html_cache: '<div class="content-wrap"><p>old saved copy long enough</p></div>', exclusionPatterns: [credit, player], ...extra })

const real = { fetch: global.fetch, bg: g.tryBackgroundWithSpoof, off: g.tryOffscreenWindow, active: g.tryActiveTab }
let calls
// `rendered` = what the quiet tiers return (null = nothing usable); the focused popup must never be reached
function stub(serverHtml, rendered) {
  calls = { bg: 0, off: 0, active: 0 }
  global.fetch = async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => `<html><body>${serverHtml}</body></html>` })
  g.tryBackgroundWithSpoof = async (url, sel, fp, meta = {}) => { calls.bg++; meta.pageVisible = false; return rendered }
  g.tryOffscreenWindow = async (url, sel, fp, meta = {}) => { calls.off++; meta.pageVisible = false; return rendered }
  g.tryActiveTab = async () => { calls.active++; return rendered }
}
const tierCalls = () => calls.bg + calls.off + calls.active
beforeEach(() => { calls = { bg: 0, off: 0, active: 0 } })
afterEach(() => {
  global.fetch = real.fetch
  g.tryBackgroundWithSpoof = real.bg; g.tryOffscreenWindow = real.off; g.tryActiveTab = real.active
})

test('the trigger is only the zero-match fault', () => {
  assert.equal(patternsMatchNothing(region(6), [credit, player]), true)               // controls absent -> a rule matches nothing
  assert.equal(patternsMatchNothing(region(6, { controls: 3 }), [credit, player]), false)
  assert.equal(patternsMatchNothing(region(6, { controls: 3, extraCredits: 20 }), [credit, player]), false) // over-growth is not a zero match
  assert.equal(patternsMatchNothing(region(6), undefined), false)
  assert.equal(patternsMatchNothing(region(6), []), false)
  assert.equal(patternsMatchNothing(region(6), [{ a: 'SPAN' }]), false)               // a malformed rule is a different fault
})

test('NEW NPR CARD: direct fetch lacks the player controls, a quiet tier renders them -> refresh succeeds, exclusions applied', async () => {
  stub(region(6), region(6, { controls: 3 }))
  const r = await g.refreshComponent(comp())
  assert.equal(r.success, true, JSON.stringify(r).slice(0, 300))
  assert.equal(calls.bg, 1)
  assert.equal(calls.active, 0, 'the focused popup is never used by this path')
  assert.doesNotMatch(r.html_cache, /class="credit"/)      // every credit removed
  assert.doesNotMatch(r.html_cache, /jw-controls/)         // every player control removed
  assert.match(r.html_cache, /Headline number 3/)          // real content survives
})

test('GENUINE ZERO MATCH: the quiet tiers also lack the rule -> escalates once, still fails closed, last copy kept', async () => {
  stub(region(6), region(6)) // rendered page has no controls either
  const r = await g.refreshComponent(comp())
  assert.equal(r.success, false)
  assert.equal(r.keepOriginal, true)
  assert.equal(r.patternFault, true)
  assert.equal(r.error, 'Exclusion pattern stopped matching')
  assert.equal(g.classifyError(r.error), 'pattern_unapplied')
  assert.equal(calls.bg, 1)
  assert.equal(calls.off, 1)
  assert.equal(calls.active, 0, 'no focused popup for a dead rule')
})

test('quiet tiers return nothing usable -> the direct-fetch candidate faces the guard and fails closed with the real cause', async () => {
  stub(region(6), null)
  const r = await g.refreshComponent(comp())
  assert.equal(r.success, false)
  assert.equal(r.patternFault, true)
  assert.equal(g.classifyError(r.error), 'pattern_unapplied')
  assert.equal(calls.active, 0)
})

test('a rendered candidate that still violates the 3x bound is not accepted', async () => {
  stub(region(6), region(6, { controls: 3, extraCredits: 20 })) // 26 credits vs n=6
  const r = await g.refreshComponent(comp())
  assert.equal(r.success, false)
  assert.equal(r.patternFault, true)
})

test('COUNT GROWTH ("Exclusive"): over-growth in the direct fetch makes ZERO browser calls and fails closed as before', async () => {
  stub(region(6, { controls: 3, extraCredits: 20 }), region(6, { controls: 3 }))
  const r = await g.refreshComponent(comp())
  assert.equal(r.success, false)
  assert.equal(r.patternFault, true)
  assert.equal(r.error, 'Exclusion pattern stopped matching')
  assert.equal(tierCalls(), 0)
})

test('rules that already resolve on the direct fetch -> no browser work, success', async () => {
  stub(region(6, { controls: 3 }), null)
  const r = await g.refreshComponent(comp())
  assert.equal(r.success, true)
  assert.equal(tierCalls(), 0)
})

test('cards without stored rules never escalate through this path', async () => {
  stub(region(6), region(6, { controls: 3 }))
  const r = await g.refreshComponent(comp({ exclusionPatterns: undefined }))
  assert.equal(tierCalls(), 0)
  assert.equal(r.success, true)
})

test('cards lane-scheduled by Refresh All (flagged quiet probe / focus phase) keep their own routing', async () => {
  const phases = (await import('node:vm')).default.runInThisContext('_refreshPhase')
  stub(region(6), region(6, { controls: 3 }))
  const c = comp()
  phases.set(c, 'focus')
  const r = await g.refreshComponent(c)
  assert.equal(tierCalls(), 0)
  assert.equal(r.success, false)
  assert.equal(r.patternFault, true)
})

// ---------- cold-review follow-ups ----------

test('a card flagged requiresActiveFocus keeps its own routing: no quiet escalation, fails closed', async () => {
  stub(region(6), region(6, { controls: 3 }))
  const r = await g.refreshComponent(comp({ requiresActiveFocus: true }))
  assert.equal(tierCalls(), 0)
  assert.equal(r.success, false)
  assert.equal(r.patternFault, true)
})

test('quietOnly never reaches the focused popup, even for a flagged card that cannot quiet-probe', async () => {
  stub(region(6), region(6)) // nothing resolves anywhere
  const c = comp({ requiresActiveFocus: true }) // flagged, and too few saved images to quiet-probe
  const r = await g._tabRefreshForComponent(c, null, 0, 0, true)
  assert.equal(r.html, null)
  assert.equal(calls.active, 0)
  assert.equal(calls.bg + calls.off >= 1, true)
})

test('non-position-based card: a quiet candidate for a different element is not committed', async () => {
  const saved = '<div class="content-wrap"><h3>Headline number 1 about something that happened today</h3><p>old saved copy long enough</p></div>'
  stub(region(6), region(6, { controls: 3, offset: 100 })) // renders fine and resolves every rule, but it is another page's stories
  const r = await g.refreshComponent(comp({ positionBased: false, html_cache: saved }))
  assert.equal(r.success, false)
  assert.equal(r.patternFault, true)
  assert.equal(g.classifyError(r.error), 'pattern_unapplied')
})

test('non-position-based card: a quiet candidate carrying the saved fingerprint is committed', async () => {
  const saved = '<div class="content-wrap"><h3>Headline number 1 about something that happened today</h3><p>old saved copy long enough</p></div>'
  stub(region(6), region(6, { controls: 3 }))
  const r = await g.refreshComponent(comp({ positionBased: false, html_cache: saved }))
  assert.equal(r.success, true, JSON.stringify(r).slice(0, 200))
  assert.equal(calls.active, 0)
})

test('an escalation that throws changes nothing: the real pattern fault is still reported', async () => {
  stub(region(6), region(6, { controls: 3 }))
  const realTab = g.tabBasedRefresh
  g.tabBasedRefresh = async () => { throw new Error('boom') }
  try {
    const r = await g.refreshComponent(comp())
    assert.equal(r.success, false)
    assert.equal(r.patternFault, true)
  } finally { g.tabBasedRefresh = realTab }
})

test('one zero-match rule among other faults still counts as a zero match (documented reading of the trigger)', async () => {
  stub(region(6, { extraCredits: 20 }), region(6, { controls: 3 })) // credits over-grown AND controls absent on tier 1
  const r = await g.refreshComponent(comp())
  assert.equal(calls.bg >= 1, true)
  assert.equal(r.success, true) // the rendered page is healthy, so the same guard accepts it
})
