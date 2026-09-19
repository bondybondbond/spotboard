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
