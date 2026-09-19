// Regression coverage for #96: applyExclusionsWithStats() reports which stored exclusions did
// NOT take effect (so the refresh engine can stop silently re-showing excluded content), and a
// pure :nth-child chain that is not rooted at the card's direct children must still apply.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { applyExclusions, applyExclusionsWithStats } = await import('../.test-build/utils/dom-cleanup.js')

const card = `<div class="card"><h2>Title</h2><p class="promo">Big sale</p><section><div><div><span><button><span></span></button></span></div></div></section><p>Keep me</p></div>`

test('#96: resolved selectors are removed and not reported unresolved', () => {
  const { html, unresolved } = applyExclusionsWithStats(card, ['p.promo'], 'div.card')
  assert.ok(!html.includes('Big sale'))
  assert.deepEqual(unresolved, [])
})

test('#96: a selector matching nothing is reported unresolved and its content stays', () => {
  const { html, unresolved } = applyExclusionsWithStats(card, ['p.gone', 'p.promo'], 'div.card')
  assert.deepEqual(unresolved, ['p.gone'])
  assert.ok(!html.includes('Big sale'))
  assert.ok(html.includes('Keep me'))
})

test('#96: bare-tag selectors (skipped as too generic) are reported unresolved', () => {
  const { html, unresolved } = applyExclusionsWithStats(card, ['p'], 'div.card')
  assert.deepEqual(unresolved, ['p'])
  assert.ok(html.includes('Keep me'))
})

test('#96: budget-refused multi-match selectors are reported unresolved', () => {
  const big = `<div class="card"><p class="x">aaaaaaaaaa</p><p class="x">bbbbbbbbbb</p><p class="y">c</p></div>`
  const { html, unresolved } = applyExclusionsWithStats(big, ['p.x'], 'div.card')
  assert.deepEqual(unresolved, ['p.x'])
  assert.ok(html.includes('aaaaaaaaaa'))
})

test('#96: applyExclusions keeps returning a plain string (signature unchanged)', () => {
  const out = applyExclusions(card, ['p.promo'], 'div.card')
  assert.equal(typeof out, 'string')
  assert.ok(!out.includes('Big sale'))
})

test('#96: pure :nth-child chain NOT rooted at the card root still applies (no :scope > dead-end)', () => {
  // section > div > div > span > button > span is 5 levels below a direct child of the card,
  // so ':scope > div:nth-child(1) > ...' finds nothing; the verbatim chain does.
  const chain = 'div:nth-child(1) > div:nth-child(1) > span:nth-child(1) > button:nth-child(1) > span:nth-child(1)'
  const { html, unresolved } = applyExclusionsWithStats(card, [chain], 'div.card')
  assert.deepEqual(unresolved, [])
  assert.ok(html.includes('<button></button>')) // inner span removed, button kept
})

test('#96: a chain rooted at a direct child still anchors with :scope (unchanged behaviour)', () => {
  const chain = 'p:nth-child(2)'
  const { html, unresolved } = applyExclusionsWithStats(card, [chain], 'div.card')
  assert.deepEqual(unresolved, [])
  assert.ok(!html.includes('Big sale'))
})

// ---- #99: text-anchor fallback for exclusions no selector resolves ----
const sigOf = (sel, sig, keep = 0) => ({ sel, sig, keep })
const kalshi = `<div class="card"><h2>House</h2><div><div><span>Yes ¢</span><span>No ¢</span></div></div><div><div><span>Yes ¢</span><span>No ¢</span></div></div><p>Keep me</p></div>`
const yesNo = ['a > b:nth-child(1)', 'a > b:nth-child(2)']
const yesNoSigs = yesNo.map(s => sigOf(s, 'yes ¢no ¢'))

test('#99: unresolved position chains are removed by their text signature', () => {
  const { html, unresolved } = applyExclusionsWithStats(kalshi, yesNo, 'div.card', yesNoSigs)
  assert.ok(!html.includes('Yes'))
  assert.ok(html.includes('Keep me') && html.includes('House'))
  assert.deepEqual(unresolved, [])
})

test('#99: without signatures nothing changes (stays unresolved)', () => {
  const { html, unresolved } = applyExclusionsWithStats(kalshi, yesNo, 'div.card')
  assert.ok(html.includes('Yes'))
  assert.deepEqual(unresolved, yesNo)
})

test('#99: more copies than exclusions fails safe (nothing removed)', () => {
  const three = kalshi.replace('<p>Keep', '<div><div><span>Yes ¢</span><span>No ¢</span></div></div><p>Keep')
  const { html, unresolved } = applyExclusionsWithStats(three, yesNo, 'div.card', yesNoSigs)
  assert.equal((html.match(/Yes/g) || []).length, 3)
  assert.deepEqual(unresolved, yesNo)
})

test('#99: hidden duplicate inflates the count -> fails safe', () => {
  const dup = kalshi.replace('<p>Keep', '<div hidden><div><span>Yes ¢</span><span>No ¢</span></div></div><p>Keep')
  const { unresolved } = applyExclusionsWithStats(dup, yesNo, 'div.card', yesNoSigs)
  assert.deepEqual(unresolved, yesNo)
})

test('#99: nested equal-text wrappers count as one chain (outermost removed)', () => {
  const nested = `<div class="card"><h2>T</h2><div class="w"><div><span>Yes ¢No ¢</span></div></div><p>Keep me</p></div>`
  const { html, unresolved } = applyExclusionsWithStats(nested, ['x:nth-child(9)'], 'div.card', [sigOf('x:nth-child(9)', 'yes ¢no ¢')])
  assert.ok(!html.includes('Yes'))
  assert.ok(!html.includes('class="w"'))
  assert.deepEqual(unresolved, [])
})

test('#99: keep > 0 (kept copy in the captured card) stays selector-only', () => {
  const { html, unresolved } = applyExclusionsWithStats(kalshi, ['x:nth-child(9)'], 'div.card', [sigOf('x:nth-child(9)', 'yes ¢no ¢', 1)])
  assert.ok(html.includes('Yes'))
  assert.deepEqual(unresolved, ['x:nth-child(9)'])
})

test('#99: truncated (>=80 char) signatures are never text-anchored', () => {
  const long = 'a'.repeat(80)
  const c = `<div class="card"><h2>T</h2><p>${long}</p><p>Keep me</p></div>`
  const { html, unresolved } = applyExclusionsWithStats(c, ['x:nth-child(9)'], 'div.card', [sigOf('x:nth-child(9)', long)])
  assert.ok(html.includes(long))
  assert.deepEqual(unresolved, ['x:nth-child(9)'])
})

test('#99: a signature equal to the whole card never erases the card', () => {
  const c = `<div class="card"><p>Only text</p></div>`
  const { html, unresolved } = applyExclusionsWithStats(c, ['x:nth-child(9)'], 'div.card', [sigOf('x:nth-child(9)', 'only text')])
  assert.ok(html.includes('Only text'))
  assert.deepEqual(unresolved, ['x:nth-child(9)'])
})

test('#99: excluded element absent on this render is benign (no removal, no crash)', () => {
  const c = `<div class="card"><h2>T</h2><p>Keep me</p></div>`
  const { html } = applyExclusionsWithStats(c, ['x:nth-child(9)'], 'div.card', [sigOf('x:nth-child(9)', 'yes ¢no ¢')])
  assert.ok(html.includes('Keep me'))
})

test('#99: exactly the expected number of copies is removed', () => {
  // 1 excluded copy expected, 1 present -> removed. (kept copy case is guarded by keep>0 above)
  const c = `<div class="card"><h2>T</h2><p>Live chat</p><p>Keep me</p></div>`
  const { html, unresolved } = applyExclusionsWithStats(c, ['x:nth-child(9)'], 'div.card', [sigOf('x:nth-child(9)', 'live chat')])
  assert.ok(!html.includes('Live chat') && html.includes('Keep me'))
  assert.deepEqual(unresolved, [])
})

test('#99: the pipeline passes component signatures through', async () => {
  const { applySanitizationPipeline } = await import('../.test-build/utils/dom-cleanup.js')
  const out = applySanitizationPipeline(kalshi, { excludedSelectors: yesNo, selector: 'div.card', exclusionSignatures: yesNoSigs })
  assert.ok(!out.includes('Yes'))
})

test('#99: does not remove the wrapper of an element another selector already claimed', () => {
  const c = `<div class="card"><h2>T</h2><div class="wrap"><span class="a">Foo</span></div><p>Keep me</p></div>`
  const { html, unresolved } = applyExclusionsWithStats(c, ['span.a', 'x:nth-child(9)'], 'div.card', [sigOf('x:nth-child(9)', 'foo')])
  assert.ok(html.includes('class="wrap"'))
  assert.ok(!html.includes('Foo'))
  assert.deepEqual(unresolved, ['x:nth-child(9)'])
})

test('#99: never leaves the card with no text after earlier removals', () => {
  const c = `<div class="card"><p class="a">Alpha</p><p>Beta words</p></div>`
  const { html } = applyExclusionsWithStats(c, ['p.a', 'x:nth-child(9)'], 'div.card', [sigOf('x:nth-child(9)', 'beta words')])
  assert.ok(html.includes('Beta words'))
})

test('#99: zero-width characters in the page text do not defeat the signature match', () => {
  const c = `<div class="card"><h2>T</h2><p>Li​ve ch‍at</p><p>Keep me</p></div>`
  const { html, unresolved } = applyExclusionsWithStats(c, ['x:nth-child(9)'], 'div.card', [sigOf('x:nth-child(9)', 'live chat')])
  assert.ok(html.includes('Keep me') && !/Li.?ve/.test(html))
  assert.deepEqual(unresolved, [])
})

test('#99: an exclusion with no stored signature (icon-only) stays selector-only and does not crash', () => {
  const { html, unresolved } = applyExclusionsWithStats(kalshi, ['x:nth-child(9)'], 'div.card', [sigOf('other:nth-child(1)', 'live chat')])
  assert.ok(html.includes('Yes'))
  assert.deepEqual(unresolved, ['x:nth-child(9)'])
})

test('#99: fewer equal-text chains than exclusions still resolves all of them (one is gone from the site)', () => {
  const c = `<div class="card"><h2>T</h2><p>Live chat</p><p>Keep me</p></div>`
  const sels = ['x:nth-child(8)', 'x:nth-child(9)']
  const { html, unresolved } = applyExclusionsWithStats(c, sels, 'div.card', sels.map(s => sigOf(s, 'live chat')))
  assert.ok(!html.includes('Live chat') && html.includes('Keep me'))
  assert.deepEqual(unresolved, [])
})
