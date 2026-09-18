// Coverage for #87: getSimilarSiblings() widens to the captured container for repeated
// per-article furniture (byline, date, headline) in separate parents. Fixtures mirror the
// real markup measured on The Verge + Daily Faceoff (18 Sep 2026). Exact-class only, plus
// <time>; never outside the locked section.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { __getSimilarSiblingsForTest } = await import('../.test-build/content.js')

// Verge-shaped card: headline link whose PARENT class varies per card, a classless byline
// nested 2 deep inside a stable wrapper span, and a <time> inside a variant-class wrapper.
const card = ({ hlParent = 'hp-a', hlCls = 'hl', name = 'Ann', tsCls = 'ts ts-a' } = {}) =>
  `<article><div class="${hlParent}"><a class="${hlCls}">Headline ${name}</a></div>` +
  `<div class="meta"><span class="by-wrap by-1"><span><span>${name}</span></span></span>` +
  `<span class="${tsCls}"><time>5:35 PM</time></span></div></article>`

function build(html, outside = '') {
  document.body.innerHTML = `${outside}<section id="root">${html}</section>`
  return document.getElementById('root')
}
const sib = (el, root) => __getSimilarSiblingsForTest(el, root)

test('headlines group across cards even when the parent class differs', () => {
  const root = build(card({ hlParent: 'hp-a', name: 'A' }) + card({ hlParent: 'hp-b', name: 'B' }) + card({ hlParent: 'hp-c', name: 'C' }))
  assert.equal(sib(root.querySelector('a.hl'), root).length, 3)
})

test('headline with a modifier class is not pulled into the group', () => {
  const root = build(card({ name: 'A' }) + card({ name: 'B' }) + card({ hlCls: 'hl hl--feat', name: 'C' }))
  assert.equal(sib(root.querySelector('a.hl'), root).length, 2)
})

test('classless byline groups via its nearest classed ancestor + path', () => {
  const root = build(card({ name: 'A' }) + card({ name: 'B' }) + card({ name: 'C' }))
  const first = root.querySelector('.by-wrap span span')
  const group = sib(first, root)
  assert.equal(group.length, 3)
  assert.deepEqual(group.map(e => e.textContent), ['A', 'B', 'C'])
})

test('classless element with no classed ancestor within 3 levels never widens', () => {
  const root = build('<article><div><div><div><div><span>A</span></div></div></div></div></article>'.repeat(2))
  const first = root.querySelector('span')
  assert.deepEqual(sib(first, root), [first])
})

test('<time> elements in the captured section all group, despite wrapper variants', () => {
  const root = build(card({ name: 'A', tsCls: 'ts ts-a' }) + card({ name: 'B', tsCls: 'ts ts-b' }) + card({ name: 'C', tsCls: 'ts ts-c' }))
  assert.equal(sib(root.querySelector('time'), root).length, 3)
})

test('<time> outside the captured section is not included', () => {
  const root = build(card({ name: 'A' }) + card({ name: 'B' }), '<header><time>Sep 18</time></header><footer><time>2026</time></footer>')
  const group = sib(root.querySelector('time'), root)
  assert.equal(group.length, 2)
  assert.ok(group.every(t => root.contains(t)))
})

test('date-looking text that is not a <time> is not grouped with <time>', () => {
  const root = build(card({ name: 'A' }) + card({ name: 'B' }) + '<p class="note"><span>Sep 17</span></p>')
  const group = sib(root.querySelector('time'), root)
  assert.equal(group.length, 2)
  assert.ok(group.every(el => el.tagName === 'TIME'))
})

test('a lone <time> in the section stays a group of 1', () => {
  const root = build(card({ name: 'A' }))
  const t = root.querySelector('time')
  assert.deepEqual(sib(t, root), [t])
})

test('generated per-instance classes fail safe', () => {
  const root = build(card({ hlCls: 'x1', name: 'A' }) + card({ hlCls: 'y2', name: 'B' }))
  const first = root.querySelector('a')
  assert.deepEqual(sib(first, root), [first])
})

test('nothing widens for the locked element itself or outside it', () => {
  const root = build(card({ name: 'A' }) + card({ name: 'B' }))
  assert.deepEqual(sib(root, root), [root])
  const outsideEl = document.createElement('a')
  outsideEl.className = 'hl'
  document.body.appendChild(outsideEl)
  assert.deepEqual(sib(outsideEl, root), [outsideEl])
})

test('classed ancestor exactly 3 levels up anchors; 4 levels up does not', () => {
  const three = '<article class="card"><div><div><span>A</span></div></div></article>'
  const four = '<article class="card"><div><div><div><span>A</span></div></div></div></article>'
  let root = build(three.repeat(2))
  assert.equal(sib(root.querySelector('span'), root).length, 2)
  root = build(four.repeat(2))
  const first = root.querySelector('span')
  assert.deepEqual(sib(first, root), [first])
})
