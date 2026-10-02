// #141: an "exclude all like this" rule is anchored to the layout the user captured in. Some sites render
// BOTH layouts and hide one with CSS (Kalshi's Yes/No rows, CNBC's bylines); a 300px tab refresh sees only
// the other layout, the rule matches nothing and the card is rejected forever. The rule can now carry ONE
// optional `alt` for the hidden twin, proven one-to-one at capture. Fixtures mirror the live pages measured
// on 2 Oct 2026 (wide copy visible, narrow copy display:none; Kalshi twin 3 levels deep, CNBC twin has a
// same-text child). The negatives matter most: any doubt must store NO alternate.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { el } from './helpers/fixtures.js'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
const {
  resetExclusions, __bulkExcludeForTest, __computeExclusionPatternsForTest, __proveExclusionPatternsForTest,
} = await import('../.test-build/content.js')
const { markPatternExclusions, patternsResolveOnMarkup, applySanitizationPipeline } = await import('../.test-build/utils/dom-cleanup.js')
const { mergeRecapture } = await import('../.test-build/utils/recapture.js')

const cls = (tag, className, children = [], text = null) => { const n = el(tag, text, children); if (className) n.className = className; return n }
const hide = n => { n.style.display = 'none'; return n }
const all = (root, sel) => Array.from(root.querySelectorAll(sel))

const KALSHI_WIDE = 'flex gap-1 items-center justify-end flex-1 min-w-[320px]'
const KALSHI_NARROW = 'flex flex-wrap justify-end w-full gap-1 mt-2'
const yesNo = (yes, no) => [cls('button', 'btn-yes', [], `Yes ${yes}¢`), cls('button', 'btn-no', [], `No ${no}¢`)]

/** One Kalshi-shaped market row: wide Yes/No wrapper visible; the narrow wrapper sits inside a
 *  hidden section that also holds other text (so the wrapper is the outermost element with exactly the match's text). */
function kalshiRow(i, { yes = 50 + i, no = 50 - i, twin = true, narrowClass = KALSHI_NARROW } = {}) {
  return cls('div', 'market-row', [
    cls('div', 'market-name', [], `Candidate ${i} wins the seat`),
    cls('div', KALSHI_WIDE, yesNo(yes, no)),
    ...(twin ? [hide(cls('div', 'narrow-section', [cls('span', 'section-label', [], 'Trade'), cls('div', narrowClass, yesNo(yes, no))]))] : []),
  ])
}
function kalshiPage(rows = 4, opts) {
  document.body.textContent = ''
  const root = cls('div', 'market-list', Array.from({ length: rows }, (_, i) => kalshiRow(i + 1, opts)))
  document.body.appendChild(root)
  return root
}

/** CNBC-shaped river: byline wrapper visible, mobile byline wrapper hidden; each holds a same-text child. */
const byline = (i, wrapClass) => cls('div', wrapClass, [cls('div', 'RiverByline-authorBylineContainer', [cls('span', 'RiverByline-datePublished', [], `${i} hours ago`), cls('span', 'RiverByline-separator', [], '•'), cls('span', 'RiverByline-authorByline', [], `Author ${i}`)])])
function cnbcPage(rows = 5) {
  document.body.textContent = ''
  const root = cls('div', 'river', Array.from({ length: rows }, (_, i) => cls('div', 'RiverPlusCard-container', [
    cls('div', 'RiverHeadline-headline', [], `Headline ${i + 1} about the markets`),
    byline(i + 1, 'RiverByline-bylineContainer RiverByline-hasSeparator'),
    hide(byline(i + 1, 'RiverByline-mobileBylineContainer RiverByline-hasSeparator')),
  ])))
  document.body.appendChild(root)
  return root
}

/** Shift+click the visible rule members, derive the pattern, run the capture proof. */
function capture(root, selector) {
  resetExclusions()
  __bulkExcludeForTest(all(root, selector).filter(n => n.style.display !== 'none'))
  const { patterns } = __computeExclusionPatternsForTest(root)
  return { derived: patterns, stored: __proveExclusionPatternsForTest(root, patterns) }
}
const KALSHI_SEL = 'div.market-row > div:nth-child(2)'
const CNBC_SEL = 'div.RiverByline-bylineContainer'

// ---------- the bug, and the fix, on both sites ----------

test('Kalshi: capture stores the hidden narrow twin as alt of the same rule', () => {
  const root = kalshiPage(4)
  const { stored } = capture(root, KALSHI_SEL)
  assert.equal(stored.length, 1)
  assert.equal(stored[0].c, KALSHI_WIDE)
  assert.deepEqual({ c: stored[0].alt.c, t: stored[0].alt.t, n: stored[0].alt.n }, { c: KALSHI_NARROW, t: 'DIV', n: 4 })
})

test('Kalshi: the narrow-only markup (what a 300px tab hands back) faults WITHOUT alt and refreshes WITH it', () => {
  const root = kalshiPage(4)
  const { stored } = capture(root, KALSHI_SEL)
  // 300px tab tier: hidden wide wrappers stripped, narrow twins visible
  const narrow = kalshiPage(4)
  all(narrow, `div.${KALSHI_WIDE.split(' ')[0]}.items-center`).forEach(n => n.remove())
  all(narrow, 'div.narrow-section').forEach(n => { n.style.display = '' })
  const plain = stored.map(({ alt, ...rest }) => rest)
  assert.match(markPatternExclusions(narrow.outerHTML, plain).faults.join(), /matched nothing/) // the bug
  assert.deepEqual(markPatternExclusions(narrow.outerHTML, stored).faults, [])
  const c = { id: 'k', name: 'Kalshi', url: 'https://kalshi.com/', selector: 'div.market-list', html_cache: '<div class="market-list"><p>x</p></div>', exclusionPatterns: stored }
  const out = applySanitizationPipeline(narrow.outerHTML, c)
  assert.equal((out.match(/btn-yes|btn-no/g) || []).length, 0)
  assert.match(out, /Candidate 2 wins the seat/) // informational content untouched
  assert.equal(g._finalizeSuccess(out, c, {}).success, true)
})

test('Kalshi: wide-only markup (background tab, hidden twin stripped) still refreshes through the primary', () => {
  const root = kalshiPage(4)
  const { stored } = capture(root, KALSHI_SEL)
  const wide = kalshiPage(4)
  all(wide, 'div.narrow-section').forEach(n => n.remove())
  const proof = markPatternExclusions(wide.outerHTML, stored)
  assert.deepEqual(proof.faults, [])
  assert.deepEqual([proof.counts, proof.altCounts], [[4], [0]])
})

test('direct fetch (no CSS, both renderings present): both twins are removed, nothing else', () => {
  const root = kalshiPage(4)
  const { stored } = capture(root, KALSHI_SEL)
  const fetched = kalshiPage(4)
  all(fetched, 'div.narrow-section').forEach(n => { n.style.display = '' })
  const c = { id: 'k', name: 'Kalshi', url: 'https://kalshi.com/', selector: 'div.market-list', html_cache: '<div class="market-list"><p>x</p></div>', exclusionPatterns: stored }
  const out = applySanitizationPipeline(fetched.outerHTML, c)
  assert.equal((out.match(/btn-yes|btn-no/g) || []).length, 0)
  assert.equal((out.match(/market-name/g) || []).length, 4)
})

test('CNBC: bylines get the mobile byline wrapper as alt, nested same-text child collapsed to one twin', () => {
  const root = cnbcPage(5)
  const { stored } = capture(root, CNBC_SEL)
  assert.equal(stored.length, 1)
  assert.equal(stored[0].alt.c, 'RiverByline-mobileBylineContainer RiverByline-hasSeparator')
  assert.equal(stored[0].alt.n, 5)
})

test('CNBC: a mobile-only refresh removes every byline and keeps the headlines', () => {
  const root = cnbcPage(5)
  const { stored } = capture(root, CNBC_SEL)
  const mobile = cnbcPage(5)
  all(mobile, CNBC_SEL).forEach(n => n.remove())
  all(mobile, 'div.RiverByline-mobileBylineContainer').forEach(n => { n.style.display = '' })
  const c = { id: 'n', name: 'CNBC', url: 'https://www.cnbc.com/world/', selector: 'div.river', html_cache: '<div class="river"><p>x</p></div>', exclusionPatterns: stored }
  const out = applySanitizationPipeline(mobile.outerHTML, c)
  assert.doesNotMatch(out, /hours ago|Author \d/)
  assert.match(out, /Headline 3 about the markets/)
})

// ---------- negatives: any doubt stores NO alternate (today's behaviour) ----------

const noAlt = (root, selector) => capture(root, selector).stored.every(p => p.alt === undefined)

test('negative: one row has no hidden twin -> partial pairing -> no alt (the rule itself is still stored)', () => {
  const root = kalshiPage(4)
  root.children[2].querySelector('div.narrow-section').remove()
  const { stored } = capture(root, KALSHI_SEL)
  assert.equal(stored.length, 1)
  assert.equal(stored[0].alt, undefined)
})

test('negative: identical text in a DIFFERENT item is never a twin (locality)', () => {
  // every row says the same thing; row 2 has no twin of its own, but row 3's hidden copy has identical text
  const root = kalshiPage(4, { yes: 50, no: 50 })
  root.children[1].querySelector('div.narrow-section').remove()
  assert.equal(noAlt(root, KALSHI_SEL), true)
})

test('negative: a look-alike whose derived rule matches extra elements is refused (the 33-vs-4 case)', () => {
  const root = kalshiPage(4)
  // 3 unrelated elements share the narrow twin class elsewhere in the section
  for (let i = 0; i < 3; i++) root.appendChild(cls('div', 'footer-bit', [cls('div', KALSHI_NARROW, [], `unrelated ${i}`)]))
  assert.equal(noAlt(root, KALSHI_SEL), true)
})

test('negative: two hidden candidates for one match -> ambiguous -> no alt', () => {
  const root = kalshiPage(4)
  root.children[0].appendChild(hide(cls('div', 'second-copy', yesNo(51, 49)))) // same text as row 1's match, a sibling not a nest
  assert.equal(noAlt(root, KALSHI_SEL), true)
})

test('negative: twin text differs (a digit) -> not the same thing -> no alt', () => {
  const root = kalshiPage(4)
  root.children[3].querySelector('div.narrow-section button.btn-yes').textContent = 'Yes 99¢'
  assert.equal(noAlt(root, KALSHI_SEL), true)
})

test('negative: matches with no text are never paired', () => {
  document.body.textContent = ''
  const root = cls('div', 'list', Array.from({ length: 4 }, () => cls('div', 'row', [cls('div', 'icon-wrap', [cls('i', 'ic')]), hide(cls('div', 'icon-alt', [cls('i', 'ic')]))])))
  document.body.appendChild(root)
  assert.equal(noAlt(root, 'div.icon-wrap'), true)
})

test('negative: a rule that already reaches hidden copies (NPR shape, shared class) gets no alt', () => {
  document.body.textContent = ''
  const root = cls('div', 'list', Array.from({ length: 4 }, (_, i) => cls('div', 'story', [cls('span', 'credit', [], `Photo ${i}/AP`), hide(cls('span', 'credit', [], `Photo ${i}/AP`))])))
  document.body.appendChild(root)
  resetExclusions()
  const { patterns } = __computeExclusionPatternsForTest(root) // nothing excluded -> nothing derived
  assert.equal(patterns.length, 0)
  // and a hand-built rule that matches visible + hidden copies is refused by the twin step directly
  const rule = { a: 'SPAN', c: 'credit', p: [], t: 'SPAN', n: 8 }
  const stored = __proveExclusionPatternsForTest(root, [rule])
  assert.equal(stored[0]?.alt, undefined)
})

test('negative: a whole duplicate list parked elsewhere (twins not local to their matches) is refused, even in order', () => {
  document.body.textContent = ''
  const rows = [1, 2, 3, 4].map(i => cls('div', 'market-row', [cls('div', 'market-name', [], `Candidate ${i}`), cls('div', KALSHI_WIDE, yesNo(50 + i, 50 - i))]))
  const parked = hide(cls('div', 'mobile-list', [1, 2, 3, 4].map(i => cls('div', KALSHI_NARROW, yesNo(50 + i, 50 - i)))))
  const root = cls('div', 'market-list', [...rows, parked])
  document.body.appendChild(root)
  assert.equal(noAlt(root, KALSHI_SEL), true)
})

test('negative: a rule whose matches already include a hidden member gets no alt', () => {
  const root = kalshiPage(4)
  hide(root.children[3].querySelector(`div.${KALSHI_WIDE.split(' ')[0]}.items-center`)) // 4th wide wrapper is itself hidden
  const rule = { a: 'DIV', c: KALSHI_WIDE, p: [], t: 'DIV', n: 4 }
  const stored = __proveExclusionPatternsForTest(root, [rule])
  assert.equal(stored[0]?.alt, undefined)
})

test('negative: different tag, same text -> not a twin', () => {
  const root = kalshiPage(4)
  all(root, 'div.narrow-section > div').forEach(n => n.replaceWith(cls('p', 'para', [], n.textContent)))
  assert.equal(noAlt(root, KALSHI_SEL), true)
})

// ---------- refresh semantics of a rule WITH alt ----------

const kalshiStored = () => capture(kalshiPage(4), KALSHI_SEL).stored

test('refresh: both renderings gone -> still fails closed with the specific cause', () => {
  const stored = kalshiStored()
  const gone = cls('div', 'market-list', [cls('p', null, [], 'redesigned page')])
  assert.match(markPatternExclusions(gone.outerHTML, stored).faults.join(), /matched nothing/)
})

test('refresh: an alt whose class matches far more than at capture faults rather than strips (waived utility guard stays bounded)', () => {
  const stored = kalshiStored()
  const narrow = kalshiPage(4)
  all(narrow, `div.items-center`).forEach(n => n.remove())
  for (let i = 0; i < 20; i++) narrow.appendChild(cls('div', KALSHI_NARROW, [], `layout block ${i}`))
  const proof = markPatternExclusions(narrow.outerHTML, stored)
  assert.equal(proof.faults.length, 1)
  assert.match(proof.faults[0], /matched 24 elements \(was 4 at capture\)/)
  assert.doesNotMatch(proof.html, /data-sb-excluded/) // nothing claimed
})

test('refresh: a malformed alt fails closed instead of being ignored', () => {
  const [rule] = kalshiStored()
  for (const alt of [null, 'x', { a: 'DIV' }, { ...rule.alt, n: 0 }, { ...rule.alt, p: 'no' }]) {
    const faults = markPatternExclusions(kalshiPage(4).outerHTML, [{ ...rule, alt }]).faults
    assert.deepEqual(faults, ['invalid rule'], JSON.stringify(alt))
  }
})

test('#132 layout compatibility: a narrow candidate is compatible with an alt rule, incorrect without one', () => {
  const stored = kalshiStored()
  const narrow = kalshiPage(4)
  all(narrow, 'div.items-center').forEach(n => n.remove())
  assert.equal(markPatternExclusions(narrow.outerHTML, stored).faults.length, 0)
  assert.equal(markPatternExclusions(narrow.outerHTML, stored.map(({ alt, ...r }) => r)).faults.length, 1)
})

test('rules without alt behave exactly as before (counts + faults identical, altCounts null)', () => {
  const rule = { a: 'DIV', c: 'RiverByline-bylineContainer RiverByline-hasSeparator', p: [], t: 'DIV', n: 5 }
  const proof = markPatternExclusions(cnbcPage(5).outerHTML, [rule])
  assert.deepEqual([proof.counts, proof.altCounts, proof.faults], [[5], [null], []])
})

// ---------- capture-time proof is strict; the cap never costs the user's rule ----------

test('capture proof: an alt that does not hit its recorded count fails the strict proof (primary alone still passes)', () => {
  const root = kalshiPage(4)
  const [rule] = capture(root, KALSHI_SEL).stored
  const markup = root.outerHTML
  assert.equal(patternsResolveOnMarkup(markup, [rule]), true)
  assert.equal(patternsResolveOnMarkup(markup, [{ ...rule, alt: { ...rule.alt, n: rule.alt.n + 1 } }]), false)
  const { alt, ...plain } = rule
  assert.equal(patternsResolveOnMarkup(markup, [plain]), true)
})

test('capture proof: an alt that fails the serialized re-check is dropped, the plain rule is kept', () => {
  // the twin sits in a <p> that wraps a <div>: legal in the live DOM, but re-parsing the serialized HTML closes
  // the <p> early, so the alt's path no longer resolves on the markup refresh will see
  document.body.textContent = ''
  const rows = [1, 2, 3, 4].map(i => cls('div', 'market-row', [cls('div', 'market-name', [], `Candidate ${i}`), cls('div', KALSHI_WIDE, yesNo(50 + i, 50 - i)), hide(cls('p', 'hidewrap', [cls('div', null, yesNo(50 + i, 50 - i))]))]))
  const root = cls('div', 'market-list', rows)
  document.body.appendChild(root)
  resetExclusions()
  __bulkExcludeForTest(all(root, KALSHI_SEL))
  const { patterns } = __computeExclusionPatternsForTest(root)
  const stored = __proveExclusionPatternsForTest(root, patterns)
  assert.equal(stored.length, 1)
  assert.equal(stored[0].c, KALSHI_WIDE)
  assert.equal(stored[0].alt, undefined)
})

test('capture: an unusual target tag (o:p) keeps the rule (smoke only: jsdom does not throw here, the try/catch guards the browser stricter selector parser)', () => {
  document.body.textContent = ''
  const root = cls('div', 'list', [1, 2, 3, 4].map(i => cls('div', 'cell', [el('o:p', `Word paste ${i}`)])))
  document.body.appendChild(root)
  const rule = { a: 'DIV', c: 'cell', p: [0], t: 'O:P', n: 4 }
  const stored = __proveExclusionPatternsForTest(root, [rule]) // would throw SyntaxError without the guard
  assert.equal(stored.length, 1)
  assert.equal(stored[0].alt, undefined)
})

test('cap: an alt weighs one extra rule against PATTERN_MAX_RULES; at the cap the rule is kept and only the alt is skipped', () => {
  const root = kalshiPage(4)
  const [rule] = capture(root, KALSHI_SEL).stored
  const { alt, ...plain } = rule
  const copies = n => Array.from({ length: n }, () => ({ ...plain }))
  const withAlts = patterns => patterns.filter(p => p.alt).length
  assert.equal(withAlts(__proveExclusionPatternsForTest(root, copies(9))), 1)   // 9 rules + 1 alt = 10
  const atCap = __proveExclusionPatternsForTest(root, copies(10))
  assert.equal(atCap.length, 10)                                                  // no rule refused
  assert.equal(withAlts(atCap), 0)
})

test('no patterns: capture proof is a no-op (cards without rules unchanged)', () => {
  assert.deepEqual(__proveExclusionPatternsForTest(kalshiPage(4), []), [])
})

// ---------- the alt rides with the rule through every writer ----------

test('Re-capture stores the new alt; a capture without one drops the old (no stale inheritance)', () => {
  const [rule] = kalshiStored()
  const capture1 = { selector: 's', headingFingerprint: null, positionBased: false, excludedSelectors: [], exclusionPatterns: [rule], html_cache: '<p>x</p>', rawCaptureLength: 1 }
  const { sync, local } = mergeRecapture({ id: 'a', exclusionPatterns: [] }, {}, capture1, '2026-10-02T00:00:00Z')
  assert.deepEqual(sync.exclusionPatterns[0].alt, rule.alt)
  assert.deepEqual(local.exclusionPatterns[0].alt, rule.alt)
  const again = mergeRecapture(sync, local, { ...capture1, exclusionPatterns: [] }, '2026-10-03T00:00:00Z')
  assert.equal('exclusionPatterns' in again.sync, false)
})

test('export -> import round trip keeps alt (the rule array is plain JSON)', () => {
  const stored = kalshiStored()
  assert.deepEqual(JSON.parse(JSON.stringify(stored)), stored)
})
