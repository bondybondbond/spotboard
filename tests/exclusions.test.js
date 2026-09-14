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
