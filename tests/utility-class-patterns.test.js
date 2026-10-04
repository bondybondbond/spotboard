// #161: "exclude all like this" on an all-Tailwind site (Product Hunt). Before this, a rule whose anchor
// class was only styling utilities was refused, so every Shift+click group fell back to one positional
// selector per element -- and those decay when the site injects or removes ad rows. Fixture: a trimmed
// structural skeleton of Product Hunt's "Top Products Launching Today" list (4 Oct 2026; real tags, classes
// and attributes, all text replaced, 26 products + 4 ad-slot rows between them). Static local markup,
// parsed with DOMParser (inert) and adopted into the document.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

await loadRefreshEngine()
const {
  resetExclusions, __bulkExcludeForTest, __computeExclusionPatternsForTest, __getSimilarSiblingsForTest,
} = await import('../.test-build/content.js')
const { markPatternExclusions, patternFault, PATTERN_MAX_RULES } = await import('../.test-build/utils/dom-cleanup.js')
const { __proveExclusionPatternsForTest } = await import('../.test-build/content.js')

const SKELETON = readFileSync(new URL('./fixtures/producthunt-list-skeleton.html', import.meta.url), 'utf8')
const parse = (markup) => new DOMParser().parseFromString(markup, 'text/html')
const load = () => {
  resetExclusions()
  const root = document.adoptNode(parse(SKELETON).querySelector('[data-test="homepage-section-today"]'))
  document.body.replaceChildren(root)
  return root
}
const all = (root, sel) => Array.from(root.querySelectorAll(sel))
// the three kinds the owner removed on their real card
const KINDS = {
  vote: 'section > button[data-test="vote-button"]',
  comment: 'section > button.hidden',
  share: 'section svg.cursor-pointer',
}
// exactly what a Shift+click on the first element of a kind selects
const shiftGroup = (root, sel) => __getSimilarSiblingsForTest(all(root, sel)[0], root)
function captureThreeKinds() {
  const root = load()
  for (const sel of Object.values(KINDS)) __bulkExcludeForTest(shiftGroup(root, sel))
  const { patterns, covered } = __computeExclusionPatternsForTest(root)
  return { root, patterns, covered }
}
const marked = (html) => parse(html).querySelectorAll('[data-sb-excluded]').length
// capture on the page, then refresh against a (possibly changed) copy of the same markup
function refreshOn(mutate) {
  const { root, patterns } = captureThreeKinds()
  const copy = root.cloneNode(true)
  if (mutate) mutate(copy)
  return markPatternExclusions(copy.outerHTML, patterns)
}

test('capture: one Shift+click per kind (vote button, comment button, share icon) -> 3 rules, nothing left positional', () => {
  const { patterns, covered } = captureThreeKinds()
  assert.equal(patterns.length, 3)
  assert.ok(patterns.length < PATTERN_MAX_RULES)
  assert.deepEqual(patterns.map(p => p.n), [26, 26, 26])
  assert.equal(covered.size, 78) // every excluded element is covered by a rule -> no individual selector is stored
  for (const p of patterns) assert.ok(p.p.length <= 1) // no child-index path through the list: immune to ad rows
})

test('capture proof: the three utility-only rules re-resolve on the serialized capture HTML (the production gate)', () => {
  const { root, patterns } = captureThreeKinds()
  assert.equal(__proveExclusionPatternsForTest(root, patterns).length, 3)
})

test('refresh: same page -> every element of every kind is excluded', () => {
  const out = refreshOn()
  assert.deepEqual(out.faults, [])
  assert.equal(marked(out.html), 78)
})

test('refresh: the 4 ad-slot rows removed -> still excluded (position-independent)', () => {
  const out = refreshOn(copy => all(copy, ':scope > div').forEach(d => d.remove()))
  assert.deepEqual(out.faults, [])
  assert.equal(marked(out.html), 78)
})

test('refresh: extra ad rows inserted at new positions -> still excluded', () => {
  const out = refreshOn(copy => {
    const secs = all(copy, ':scope > section')
    for (const i of [2, 5, 9, 14]) {
      const ad = document.createElement('div'); ad.className = 'ad-slot-placeholder'
      secs[i].before(ad)
    }
  })
  assert.deepEqual(out.faults, [])
  assert.equal(marked(out.html), 78)
})

test('refresh: products added and removed (26 -> 28, and 26 -> 24) -> the new/remaining ones are excluded too', () => {
  const grown = refreshOn(copy => { const secs = all(copy, ':scope > section'); secs[3].after(secs[3].cloneNode(true)); secs[10].after(secs[10].cloneNode(true)) })
  assert.deepEqual(grown.faults, [])
  assert.equal(marked(grown.html), 84)
  const shrunk = refreshOn(copy => { const secs = all(copy, ':scope > section'); secs[1].remove(); secs[7].remove() })
  assert.deepEqual(shrunk.faults, [])
  assert.equal(marked(shrunk.html), 72)
})

test('refresh: class tokens reordered on the share-icon rule anchor (the title wrapper span) -> that rule fails closed with a visible reason', () => {
  // asserts the real behaviour on purpose: a reorder fails closed (last good copy kept by the caller); it is not "still matches".
  // The share icon is an <svg> (className is not a string), so its rule anchors on the parent span; that is the rule faulted here.
  const out = refreshOn(copy => all(copy, 'section span.flex-wrap').forEach(s => { s.className = s.className.split(' ').reverse().join(' ') }))
  assert.equal(out.faults.length, 1)
  assert.match(out.faults[0], /matched nothing/)
  assert.equal(marked(out.html), 52) // the untrusted rule claims nothing; the other two still do. Any fault fails the whole refresh closed (refresh-engine), so the last good copy is kept
})

test('refresh: the utility class suddenly lands on far more elements than at capture -> fails closed (2x bound)', () => {
  const out = refreshOn(copy => {
    for (let i = 0; i < 30; i++) { const b = document.createElement('button'); b.className = 'relative'; copy.appendChild(b) }
  })
  assert.equal(out.faults.length, 1)
  assert.match(out.faults[0], /matched 56 elements \(was 26 at capture\)/)
  assert.equal(marked(out.html), 52) // the over-matching rule claims nothing; the fault fails the refresh closed
})

test('capture: the same utility class on a kind the user did NOT exclude -> no rule (stays individual)', () => {
  const root = load()
  // vote counts and comment counts share one <p> class string; excluding only the vote ones is not "every match"
  __bulkExcludeForTest(all(root, 'section > button[data-test="vote-button"] p'))
  const { patterns, covered } = __computeExclusionPatternsForTest(root)
  assert.equal(patterns.length, 0)
  assert.equal(covered.size, 0)
})

test('growth bound: utility-only rule gets 2x, a semantic rule keeps 3x, <time> keeps 3x', () => {
  const rule = (a, c, n) => ({ a, c, p: [], t: a, n })
  assert.equal(patternFault(rule('BUTTON', 'relative', 26), 52), null)
  assert.match(patternFault(rule('BUTTON', 'relative', 26), 53), /matched 53 elements/)
  assert.equal(patternFault(rule('SPAN', 'credit', 6), 18), null)
  assert.match(patternFault(rule('SPAN', 'credit', 6), 19), /matched 19 elements/)
  assert.equal(patternFault(rule('time', '', 4), 12), null)
  assert.match(patternFault(rule('time', '', 4), 13), /matched 13 elements/)
  assert.equal(patternFault(rule('BUTTON', 'relative', 26), 0), 'matched nothing')
})

test('growth bound (declared consequence): stored #141 alternate rules with a utility-only class are held to 2x too (was 3x)', () => {
  // Kalshi-shaped alt rule, n=4: 8 passes, 9 faults (3x would have allowed 12). Chosen on purpose in #161; the owner's Kalshi cards hold 4 markets.
  const alt = { a: 'DIV', c: 'flex flex-wrap justify-end w-full gap-1 mt-2', p: [], t: 'DIV', n: 4 }
  assert.equal(patternFault(alt, 8), null)
  assert.match(patternFault(alt, 9), /matched 9 elements \(was 4 at capture\)/)
})
