// Regression coverage for #2: sanitizeHTML() used to match excluded elements to the clone by
// a live-DOM child-index path applied sequentially, so a 2nd+ exclusion removed the wrong
// element. The fix (data-spotboard-excluded marker, set pre-clone) is exercised directly here
// against the real function, not a reimplementation of its logic.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'
import { el } from './helpers/fixtures.js'

installDomEnv()
const { sanitizeHTML } = await import('../.test-build/content.js')
const { cleanupDuplicates } = await import('../.test-build/utils/dom-cleanup.js')

function buildCard() {
  // <div id=root><p id=a>Alpha</p><p id=b>Bravo</p><p id=c>Charlie</p><p id=d>Delta</p></div>
  const a = el('p', 'Alpha'); a.id = 'a'
  const b = el('p', 'Bravo'); b.id = 'b'
  const c = el('p', 'Charlie'); c.id = 'c'
  const d = el('p', 'Delta'); d.id = 'd'
  const root = el('div', null, [a, b, c, d])
  document.body.appendChild(root)
  return { root, a, b, c, d }
}

test('zero exclusions: all four items survive', () => {
  const { root, a, b, c, d } = buildCard()
  const out = sanitizeHTML(root, [])
  for (const node of [a, b, c, d]) assert.match(out, new RegExp(node.textContent))
})

test('single exclusion: removes exactly that one item', () => {
  const { root, a, b, c, d } = buildCard()
  const out = sanitizeHTML(root, [b])
  assert.match(out, /Alpha/)
  assert.doesNotMatch(out, /Bravo/)
  assert.match(out, /Charlie/)
  assert.match(out, /Delta/)
})

test('N>=2 exclusions removes exactly N (the literal #2 regression)', () => {
  const { root, a, b, c, d } = buildCard()
  const out = sanitizeHTML(root, [b, d])
  assert.match(out, /Alpha/)
  assert.doesNotMatch(out, /Bravo/)
  assert.match(out, /Charlie/)
  assert.doesNotMatch(out, /Delta/)
})

test('first-child and last-child exclusion together', () => {
  const { root, a, b, c, d } = buildCard()
  const out = sanitizeHTML(root, [a, d])
  assert.doesNotMatch(out, /Alpha/)
  assert.match(out, /Bravo/)
  assert.match(out, /Charlie/)
  assert.doesNotMatch(out, /Delta/)
})

test('nested-pair exclusion: excluding an ancestor and its own descendant removes both, no error', () => {
  const inner = el('span', 'InnerText')
  const outer = el('div', null, [inner]); outer.id = 'outer'
  const sibling = el('p', 'SiblingText')
  const root = el('div', null, [outer, sibling])
  document.body.appendChild(root)

  const out = sanitizeHTML(root, [outer, inner])
  assert.doesNotMatch(out, /InnerText/)
  assert.match(out, /SiblingText/)
})

test('preview-vs-stored parity: same input produces the same output on both call paths', () => {
  // Mirrors content.ts exactly: updatePreview() does cleanupDuplicates(sanitizeHTML(...)),
  // the save path stores sanitizeHTML(...) directly (sanitizeHTML already runs
  // cleanupDuplicates internally on the clone — see dom-cleanup.ts). If that internal call
  // ever stops happening, this test is what would catch preview and stored drifting apart.
  const { root, b, d } = buildCard()
  const stored = sanitizeHTML(root, [b, d])
  const previewRoot = buildCard()
  const preview = cleanupDuplicates(sanitizeHTML(previewRoot.root, [previewRoot.b, previewRoot.d]))
  assert.equal(preview, stored)
})

// #89: applyExclusions (refresh path) must resolve every selector against the SAME untouched
// markup and only then remove. Positional selectors are computed at capture time on the
// unmutated DOM, so an earlier removal must never shift what a later one resolves to.
const { applyExclusions } = await import('../.test-build/utils/dom-cleanup.js')

function popularHtml() {
  const row = i => `<li><div class="rank">${i}</div><div class="ttl"><a href="#">Title ${i}</a></div><div class="by">By ${i}</div></li>`
  return `<div class="sec"><h2 class="hd">Most Popular</h2><ol>${[1, 2, 3].map(row).join('')}</ol></div>`
}
const rankSel = i => `ol:nth-child(2) > li:nth-child(${i}) > div:nth-child(1)`
const byline = i => `ol:nth-child(2) > li:nth-child(${i}) > div:nth-child(3)`

function textOf(html) {
  const d = document.createElement('div')
  d.innerHTML = html
  return d.textContent
}

test('#89 no shift: heading + numbers + bylines all removed, in any order', () => {
  const heading = 'h2.hd'
  const ranks = [1, 2, 3].map(rankSel)
  const bys = [1, 2, 3].map(byline)
  const orders = [
    [heading, ...ranks, ...bys],
    [...ranks, ...bys, heading],
    [...bys, heading, ...ranks],
    [...ranks, heading, ...bys]
  ]
  for (const order of orders) {
    const out = applyExclusions(popularHtml(), order, 'div.sec')
    const t = textOf(out)
    assert.ok(!t.includes('Most Popular'), 'heading gone')
    assert.ok(!/By \d/.test(t), `bylines gone (${order[0]}...)`)
    assert.ok(!out.includes('class="rank"'), 'rank numbers gone')
    for (const i of [1, 2, 3]) assert.ok(t.includes(`Title ${i}`), 'titles kept')
  }
})

test('#89 no wrong-element deletion: shifted siblings are never removed by a stale position', () => {
  // Exclude ONLY row 1's number and row 2's title. Old sequential logic: after the number is
  // removed, `div:nth-child(2)` in row 1 now points at the byline and deleted the wrong thing.
  const out = applyExclusions(
    popularHtml(),
    [rankSel(1), 'ol:nth-child(2) > li:nth-child(1) > div:nth-child(2)'],
    'div.sec'
  )
  const t = textOf(out)
  assert.ok(!t.includes('Title 1'), 'row 1 title (the intended target) removed')
  assert.ok(t.includes('By 1'), 'row 1 byline (shifted into that slot) survives')
  assert.ok(t.includes('Title 2') && t.includes('By 2'), 'other rows untouched')
})

test('#89 removal budget still applies to a multi-match selector', () => {
  const out = applyExclusions(popularHtml(), ['div.ttl, div.by, div.rank, h2.hd'], 'div.sec')
  assert.ok(textOf(out).includes('Title 1'), 'over-budget multi-match skipped, content kept')
})

test('#89 budget is evaluated against earlier claimed removals (same as old sequential behaviour)', () => {
  // two multi-match selectors each under 20% of text, together over it: second must be skipped
  const rows = Array.from({ length: 10 }, (_, i) => `<li><span class="a">${"a".repeat(19)}${i}</span><span class="b">${"b".repeat(19)}${i}</span><span class="c">${"c".repeat(60)}${i}</span></li>`).join('')
  const html = `<div class="sec"><ol>${rows}</ol></div>`
  const out = applyExclusions(html, ['span.a', 'span.b'], 'div.sec')
  assert.ok(!out.includes('class="a"'), 'first within budget -> removed')
  assert.ok(out.includes('class="b"'), 'second is over budget relative to what remains -> skipped')
})

test('#89 structural budget ignores the card root itself (root is an <article>)', () => {
  // 4 <li>, a multi-match selector removes 2 = 50% > 40% budget. If the root <article> were
  // counted in the tally it would read 2/5 = 40% (not > 40%) and wrongly slip under budget.
  const long = 'filler text '.repeat(200)
  const html = `<article class="card"><p>${long}</p><ul><li class="x">one</li><li class="x">two</li><li>three</li><li>four</li></ul></article>`
  const out = applyExclusions(html, ['li.x'], 'article.card')
  assert.ok(out.includes('one') && out.includes('two'), 'over structural budget -> skipped, content kept')
})
