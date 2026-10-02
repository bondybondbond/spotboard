// #128: exclusion patterns -- "every element of this kind in the captured region is excluded".
// Fixtures mirror the NPR front page measured on 30 Sep 2026: one credit span per story, a topic
// label per story, stories reshuffled / added / removed between days. Covers capture-time pattern
// derivation (only when it is faithful to what the user did), refresh-time resolution across a
// changed page, and the fail-closed behaviour when a pattern cannot be trusted.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'
import { el } from './helpers/fixtures.js'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
const {
  toggleExclusion,
  resetExclusions,
  undoLastExclusion,
  __bulkExcludeForTest,
  __computeExclusionPatternsForTest,
} = await import('../.test-build/content.js')
const {
  deriveCrossParentPattern, resolveExclusionPattern, markPatternExclusions, isUtilityOnlyClass, patternFault,
  applySanitizationPipeline,
} = await import('../.test-build/utils/dom-cleanup.js')
const { mergeRecapture } = await import('../.test-build/utils/recapture.js')

const cls = (tag, className, children = [], text = null) => { const n = el(tag, text, children); if (className) n.className = className; return n }
// one NPR-shaped story: thumbnail credit + topic label + headline
const story = (i, { credit = `Photographer ${i}/AP`, slug = `Topic ${i}` } = {}) =>
  cls('article', 'story', [
    cls('figure', 'thumb', [cls('div', 'credit-caption', [cls('span', 'credit', [], credit)])]),
    cls('div', 'story-text', [cls('div', 'slug-wrap', [], slug), cls('h3', 'title', [], `Headline number ${i} about something that happened`)]),
  ])
function page(n, opts) {
  document.body.textContent = ''
  const root = cls('div', 'content-wrap', Array.from({ length: n }, (_, i) => story(i + 1, opts)))
  document.body.appendChild(root)
  return root
}
const all = (root, sel) => Array.from(root.querySelectorAll(sel))
const reset = () => { resetExclusions() }

// ---------- capture: a pattern is stored only when it is faithful to what the user did ----------

test('capture: Shift+click group on every credit -> one pattern, all members covered', () => {
  reset(); const root = page(6)
  __bulkExcludeForTest(all(root, 'span.credit'))
  const { patterns, covered } = __computeExclusionPatternsForTest(root)
  assert.equal(patterns.length, 1)
  assert.deepEqual({ a: patterns[0].a, c: patterns[0].c, p: patterns[0].p, t: patterns[0].t, n: patterns[0].n }, { a: 'SPAN', c: 'credit', p: [], t: 'SPAN', n: 6 })
  assert.equal(covered.size, 6)
})

test('capture: two different kinds excluded in bulk -> two patterns', () => {
  reset(); const root = page(5)
  __bulkExcludeForTest(all(root, 'span.credit'))
  __bulkExcludeForTest(all(root, 'div.slug-wrap'))
  const { patterns, covered } = __computeExclusionPatternsForTest(root)
  assert.deepEqual(patterns.map(p => p.c).sort(), ['credit', 'slug-wrap'])
  assert.equal(covered.size, 10)
})

test('capture: plain clicks (no Shift group) never become a pattern', () => {
  reset(); const root = page(6)
  all(root, 'span.credit').forEach(c => toggleExclusion(c))
  assert.equal(__computeExclusionPatternsForTest(root).patterns.length, 0)
})

test('capture: a match left visible means no pattern (excluded set must equal the rule\'s match set)', () => {
  reset(); const root = page(6)
  __bulkExcludeForTest(all(root, 'span.credit').slice(0, 5)) // sixth credit stays
  assert.equal(__computeExclusionPatternsForTest(root).patterns.length, 0)
})

test('capture: un-excluding one member after the Shift+click cancels the pattern', () => {
  reset(); const root = page(6)
  const credits = all(root, 'span.credit')
  __bulkExcludeForTest(credits)
  assert.equal(__computeExclusionPatternsForTest(root).patterns.length, 1)
  toggleExclusion(credits[2]) // un-exclude one
  assert.equal(__computeExclusionPatternsForTest(root).patterns.length, 0)
})

test('capture: undoing the bulk exclusion leaves no pattern', () => {
  reset(); const root = page(6)
  __bulkExcludeForTest(all(root, 'span.credit'))
  assert.equal(undoLastExclusion(), true)
  assert.equal(__computeExclusionPatternsForTest(root).patterns.length, 0)
})

test('capture: fewer than 3 matches is a handful of clicks, not a pattern', () => {
  reset(); const root = page(2)
  __bulkExcludeForTest(all(root, 'span.credit'))
  assert.equal(__computeExclusionPatternsForTest(root).patterns.length, 0)
})

test('capture: styling-only class tokens never form a pattern (stays individual, as before)', () => {
  reset(); document.body.textContent = ''
  const root = cls('div', 'wrap', Array.from({ length: 4 }, (_, i) => cls('section', 'box', [cls('div', 'flex items-center gap-2', [], `row ${i}`)])))
  document.body.appendChild(root)
  __bulkExcludeForTest(all(root, 'div.flex'))
  assert.equal(__computeExclusionPatternsForTest(root).patterns.length, 0)
  for (const c of ['flex items-center', 'size--all-s', 'text-xs font-bold', 'hover:underline', 'mob:gap-0', 'cursor-default', '']) assert.equal(isUtilityOnlyClass(c), true, c)
  for (const c of ['credit', 'slug-wrap', 'audio-module', 'credit flex', 'category__header', 'cept-vote-temp']) assert.equal(isUtilityOnlyClass(c), false, c)
})

test('capture: <time> group is a pattern', () => {
  reset(); document.body.textContent = ''
  const root = cls('div', 'wrap', Array.from({ length: 4 }, (_, i) => cls('article', 'a', [cls('span', 'meta', [el('time', `${i}:00 PM`)])])))
  document.body.appendChild(root)
  __bulkExcludeForTest(all(root, 'time'))
  const { patterns } = __computeExclusionPatternsForTest(root)
  assert.equal(patterns.length, 1)
  assert.equal(patterns[0].a, 'time')
})

test('capture: an unmounted node of a virtualised list (ledger entry with no element) blocks patterns', () => {
  reset(); const root = page(6)
  __bulkExcludeForTest(all(root, 'span.credit'))
  root.querySelector('span.credit').remove() // the site unmounts a row; ledger keeps the decision
  // the pattern cannot claim a complete match set while a bulk entry has no live node
  const r = __computeExclusionPatternsForTest(root)
  assert.equal(r.patterns.length, 0)
})

test('capture: derive + resolve agree with each other and with the serialized capture', () => {
  reset(); const root = page(7)
  const d = deriveCrossParentPattern(root.querySelector('span.credit'), root)
  assert.equal(d.matches.length, 7)
  assert.deepEqual(resolveExclusionPattern(root, d.rule), d.matches)
  const proof = markPatternExclusions(root.outerHTML, [d.rule])
  assert.deepEqual(proof.counts, [7])
  assert.deepEqual(proof.faults, [])
})

// ---------- refresh: the pattern follows a page that changed ----------

const rule = n => ({ a: 'SPAN', c: 'credit', p: [], t: 'SPAN', n })
const cardOf = (root) => root.outerHTML
const comp = (extra = {}) => ({ id: 'c1', name: 'NPR', url: 'https://www.npr.org/', selector: 'div.content-wrap', html_cache: '<div class="content-wrap"><p>x</p></div>', exclusionPatterns: [rule(6)], ...extra })
const creditsIn = html => (html.match(/class="credit"/g) || []).length

test('refresh: a reshuffled page with NEW stories still loses every credit, headlines survive', () => {
  // day 1 had 6 stories; day 2 drops 3, adds 4 brand-new ones (different photographers), plus a banner on top
  const root = page(0)
  const banner = cls('div', 'breaking', [], 'Breaking banner text')
  root.appendChild(banner)
  ;[4, 5, 6, 11, 12, 13, 14].forEach(i => root.appendChild(story(i)))
  const out = applySanitizationPipeline(cardOf(root), comp())
  assert.equal(creditsIn(out), 0)
  assert.match(out, /Headline number 11/)
  assert.match(out, /Breaking banner text/)
  assert.match(out, /slug-wrap/) // labels were NOT part of this pattern
})

test('refresh: pattern + legacy selectors coexist, and a legacy card with no pattern is unchanged', () => {
  const root = page(5)
  const both = applySanitizationPipeline(cardOf(root), comp({ exclusionPatterns: [rule(5)], excludedSelectors: ['div.slug-wrap'], selector: 'div.content-wrap' }))
  assert.equal(creditsIn(both), 0)
  assert.doesNotMatch(both, /slug-wrap/)
  const legacy = applySanitizationPipeline(cardOf(root), comp({ exclusionPatterns: undefined, excludedSelectors: ['div.slug-wrap'] }))
  assert.equal(creditsIn(legacy), 5)
  assert.doesNotMatch(legacy, /slug-wrap/)
})

test('refresh: pattern-only card (zero legacy selectors) still removes its matches', () => {
  const out = applySanitizationPipeline(cardOf(page(6)), comp({ excludedSelectors: [] }))
  assert.equal(creditsIn(out), 0)
})

test('refresh gate: pattern passes -> success', () => {
  const c = comp()
  const html = applySanitizationPipeline(cardOf(page(6)), c)
  assert.equal(g._finalizeSuccess(html, c, {}).success, true)
})

// ---------- refresh: fail CLOSED when a pattern cannot be trusted ----------

function failed(c, raw) {
  const html = applySanitizationPipeline(raw, c)
  return { r: g._finalizeSuccess(html, c, {}), html }
}

test('fail-closed: site renamed the class (matches nothing) keeps the last copy and names the cause', () => {
  const root = page(6)
  root.querySelectorAll('span.credit').forEach(s => { s.className = 'photo-credit' })
  const { r } = failed(comp(), cardOf(root))
  assert.equal(r.success, false)
  assert.equal(r.keepOriginal, true)
  assert.equal(r.patternFault, true)
  assert.equal(r.error, 'Exclusion pattern stopped matching')
  assert.equal(g.classifyError(r.error), 'pattern_unapplied')
  assert.match(g.getErrorLabel('pattern_unapplied'), /re-capture/i)
})

test('fail-closed: class repurposed so it matches far more than at capture -> no mass deletion', () => {
  const root = page(6)
  for (let i = 0; i < 20; i++) root.appendChild(cls('span', 'credit', [], `Extra ${i}`)) // 26 matches vs n=6 (> 3x)
  const c = comp()
  const { r, html } = failed(c, cardOf(root))
  assert.equal(r.success, false)
  assert.equal(r.patternFault, true)
  assert.equal(creditsIn(html), 26) // nothing was removed by a pattern we do not trust
})

test('growth inside the tolerance is normal turnover, not a fault', () => {
  assert.equal(patternFault(rule(6), 6), null)
  assert.equal(patternFault(rule(6), 18), null)   // exactly 3x
  assert.ok(patternFault(rule(6), 19))            // beyond 3x
  assert.equal(patternFault(rule(100), 40), null) // far fewer stories today is fine
  assert.ok(patternFault(rule(100), 0))           // nothing at all is not
})

test('fail-closed: malformed stored rule is a fault, never a thrown error', () => {
  const bad = applySanitizationPipeline(cardOf(page(3)), comp({ exclusionPatterns: [{ a: 'SPAN' }, null, { a: '???(', c: 'x', p: [], t: 'SPAN', n: 3 }] }))
  assert.equal(typeof bad, 'string')
  const c = comp({ exclusionPatterns: [{ a: 'SPAN' }] })
  const html = applySanitizationPipeline(cardOf(page(3)), c)
  assert.equal(g._finalizeSuccess(html, c, {}).patternFault, true)
})

test('pattern failure gets the Re-capture button; other pattern-free cards are unaffected', () => {
  assert.equal(g.shouldOfferRecapture({ lastOutcome: 'failed', lastErrorCode: 'pattern_unapplied' }), true)
  assert.equal(g.shouldOfferRecapture({ lastOutcome: 'failed', lastErrorCode: 'network' }), false)
})

test('existing leak gate and content-loss guard still run (unchanged order and behaviour)', () => {
  const c = comp({ exclusionPatterns: undefined, excludedSelectors: ['div.pills'], exclusionSignatures: [{ sel: 'div.pills', sig: 'yes ¢ no ¢', keep: 0 }] })
  const html = applySanitizationPipeline('<div class="content-wrap"><h2>T</h2><p>Body text for the card here long enough</p><div>Yes 90¢ No 11¢ tap</div></div>', c)
  assert.equal(g._finalizeSuccess(html, c, {}).exclusionLeak, true)
  const longCache = '<div class="content-wrap"><h2>Title</h2><p>Some real content that is long enough to matter here, well over the floor.</p><ul><li>a</li><li>b</li><li>c</li></ul></div>'
  assert.equal(g._finalizeSuccess('<div></div>', comp({ html_cache: longCache }), {}).error, 'Refresh returned empty content')
})

// ---------- storage: patterns travel with the card ----------

test('re-capture replaces patterns (never inherits a stale set) and clears them when the new capture has none', () => {
  const sync = { id: 'c1', selector: 'div.old', exclusionPatterns: [rule(9)], excludedSelectors: [] }
  const local = { selector: 'div.old', exclusionPatterns: [rule(9)] }
  const cap = (extra) => ({ selector: 'div.new', headingFingerprint: null, positionBased: false, excludedSelectors: [], html_cache: '<div/>', rawCaptureLength: 1, ...extra })
  const withP = mergeRecapture(sync, local, cap({ exclusionPatterns: [rule(4)] }), 'now')
  assert.deepEqual(withP.sync.exclusionPatterns, [rule(4)])
  assert.deepEqual(withP.local.exclusionPatterns, [rule(4)])
  const without = mergeRecapture(sync, local, cap({}), 'now')
  assert.equal('exclusionPatterns' in without.sync, false)
  assert.equal('exclusionPatterns' in without.local, false)
})

// ---------- cold-review follow-ups (#128) ----------
import fs from 'node:fs'
const { patternsResolveOnMarkup } = await import('../.test-build/utils/dom-cleanup.js')

test('capture: a same-parent sibling group is NOT widened into a pattern (stays individual)', () => {
  reset(); document.body.textContent = ''
  const root = cls('div', 'wrap', [
    cls('ul', 'list-a', Array.from({ length: 5 }, (_, i) => cls('li', 'item', [], `a${i}`))),
    cls('ul', 'list-b', Array.from({ length: 3 }, (_, i) => cls('li', 'item', [], `b${i}`))),
  ])
  document.body.appendChild(root)
  __bulkExcludeForTest(all(root, 'ul.list-a li.item')) // the user's group is list A only
  assert.equal(__computeExclusionPatternsForTest(root).patterns.length, 0)
})

test('capture: even when every same-parent item in the region is excluded, it stays individual', () => {
  reset(); document.body.textContent = ''
  const root = cls('div', 'wrap', [cls('ul', 'only', Array.from({ length: 6 }, (_, i) => cls('li', 'item', [], `x${i}`)))])
  document.body.appendChild(root)
  __bulkExcludeForTest(all(root, 'li.item'))
  assert.equal(__computeExclusionPatternsForTest(root).patterns.length, 0)
})

test('capture: a table-column group is NOT turned into a pattern', () => {
  reset(); document.body.textContent = ''
  const row = (i) => cls('tr', null, [cls('td', 'num', [], `${i}`), cls('td', 'other', [], `${i * 2}`), cls('td', 'label', [], `r${i}`)])
  const table = cls('table', 'data', [cls('tbody', null, [1, 2, 3, 4, 5].map(row))])
  const root = cls('div', 'wrap', [table])
  document.body.appendChild(root)
  __bulkExcludeForTest(all(root, 'tr td:first-child'))
  assert.equal(__computeExclusionPatternsForTest(root).patterns.length, 0)
})

test('fail-closed: a corrupt pattern field is a fault, never read as "no patterns"', () => {
  for (const bad of [{}, 'x', 5, true]) {
    const c = comp({ exclusionPatterns: bad })
    const html = applySanitizationPipeline(cardOf(page(3)), c)
    const r = g._finalizeSuccess(html, c, {})
    assert.equal(r.success, false, JSON.stringify(bad))
    assert.equal(r.patternFault, true)
  }
  for (const none of [undefined, null, []]) {
    const c = comp({ exclusionPatterns: none })
    const html = applySanitizationPipeline(cardOf(page(3)), c)
    assert.equal(g._finalizeSuccess(html, c, {}).success, true)
  }
})

test('fail-closed: a non-numeric / non-positive n cannot silently disable the growth guard', () => {
  for (const n of ['6', NaN, Infinity, 0, -1, undefined]) {
    const c = comp({ exclusionPatterns: [{ a: 'SPAN', c: 'credit', p: [], t: 'SPAN', n }] })
    const root = page(6)
    for (let i = 0; i < 40; i++) root.appendChild(cls('span', 'credit', [], `x${i}`))
    const html = applySanitizationPipeline(cardOf(root), c)
    assert.equal(g._finalizeSuccess(html, c, {}).patternFault, true, String(n))
  }
})

test('capture proof: patterns must re-resolve to EXACTLY their capture count on the serialized markup', () => {
  const root = page(6)
  const html = root.outerHTML
  assert.equal(patternsResolveOnMarkup(html, [rule(6)]), true)
  assert.equal(patternsResolveOnMarkup(html, [rule(7)]), false)  // count differs -> fall back to individual selectors
  assert.equal(patternsResolveOnMarkup(html, [rule(5)]), false)
  assert.equal(patternsResolveOnMarkup(html.replace(/class="credit"/g, 'class="c2"'), [rule(6)]), false)
})

test('source guards: confirm path uses the proof + drops covered elements; import validates and keeps patterns', () => {
  const content = fs.readFileSync(new URL('../src/content.ts', import.meta.url), 'utf8')
  assert.match(content, /proveExclusionPatterns\(target, exclusionPatterns\)/)           // #141: the confirm path goes through the capture proof...
  assert.match(content, /patternsResolveOnMarkup\(markup, patterns\)/)                     // ...which still re-resolves on the serialized capture HTML
  assert.match(content, /individualElements\.forEach\(el =>/)          // selectors only for elements no pattern covers
  assert.match(content, /individualElements\.map\(\(el, i\) => \(\{ sel: excludedSelectors\[i\]/) // signatures likewise
  assert.match(content, /sanitizeHTML\(target, excludedElements\)/)    // but ALL excluded elements still leave the stored HTML
  const dash = fs.readFileSync(new URL('../public/dashboard.js', import.meta.url), 'utf8')
  assert.match(dash, /exclusionPatterns is not a list/)
  assert.match(dash, /Array\.isArray\(card\.exclusionPatterns\)/)
})

test('a pattern-marked twin that cannot carry its mark never becomes a fake unresolved selector', () => {
  const c = comp({ excludedSelectors: [] })
  applySanitizationPipeline(cardOf(page(6)), c)
  assert.deepEqual(c.__exclusionCheck.unverified, [])
  assert.deepEqual(c.__exclusionCheck.leaked, [])
})

test('multi-root markup (leading <style>) never lets a rule match the region root itself', () => {
  const root = cls('div', 'credit', [cls('div', 'inner', [cls('span', 'credit', [], 'A/AP')]), cls('div', 'inner', [cls('span', 'credit', [], 'B/AP')]), cls('div', 'inner', [cls('span', 'credit', [], 'C/AP')])])
  const html = '<style>.x{}</style>' + root.outerHTML
  const out = markPatternExclusions(html, [{ a: 'DIV', c: 'credit', p: [], t: 'DIV', n: 1 }])
  assert.deepEqual(out.counts, [0]) // the region root carries the anchor class; it must not count
  assert.ok(out.faults.length > 0)
})

test('a card never stores more than PATTERN_MAX_RULES rules (the rest stay individual)', () => {
  reset(); document.body.textContent = ''
  const kinds = Array.from({ length: 13 }, (_, k) => 'kind-' + String.fromCharCode(97 + k))
  const root = cls('div', 'wrap', Array.from({ length: 3 }, (_, i) => cls('article', 'story', kinds.map(k => cls('div', 'box', [cls('span', k, [], k + i)])))))
  document.body.appendChild(root)
  kinds.forEach(k => __bulkExcludeForTest(all(root, 'span.' + k)))
  const { patterns } = __computeExclusionPatternsForTest(root)
  assert.equal(patterns.length, 10)
})
