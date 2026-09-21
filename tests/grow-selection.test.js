// Coverage for #42 (Grow Selection for the capture root): getGrowCandidate()'s conservative
// parentElement walk. jsdom has no layout engine, so every test stubs getBoundingClientRect
// explicitly and drives paint-related rules through inline styles.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'
import { el } from './helpers/fixtures.js'

installDomEnv()
const { getGrowCandidate } = await import('../.test-build/content.js')

function box(node, left, top, width, height) {
  node.getBoundingClientRect = () => ({
    left, top, width, height, right: left + width, bottom: top + height, x: left, y: top,
  })
  return node
}

// levels: outermost first. Nests them and attaches the outermost to <body>.
function tree(...levels) {
  levels.reduce((parent, child) => { parent.appendChild(child); return child }, document.body)
  return levels
}

function reset() {
  document.body.replaceChildren()
}

test('grows to the immediate parent when its box differs from the child', () => {
  reset()
  const child = box(el('div', 'story'), 10, 10, 100, 50)
  const parent = box(el('section'), 0, 0, 300, 400)
  tree(parent, child)
  assert.equal(getGrowCandidate(child), parent)
})

test('skips a same-size transparent wrapper and lands on the next real ancestor', () => {
  reset()
  const child = box(el('div', 'story'), 10, 10, 100, 50)
  const wrapper = box(el('div'), 10, 10, 100, 50)
  wrapper.style.backgroundColor = 'rgba(0, 0, 0, 0)'
  const outer = box(el('section'), 0, 0, 300, 400)
  tree(outer, wrapper, child)
  assert.equal(getGrowCandidate(child), outer)
})

test('within 1px counts as the same box; a bigger difference does not', () => {
  reset()
  const child = box(el('div', 'story'), 10, 10, 100, 50)
  const near = box(el('div'), 10.5, 10, 100.8, 50)
  const outer = box(el('section'), 0, 0, 300, 400)
  tree(outer, near, child)
  assert.equal(getGrowCandidate(child), outer)

  reset()
  const child2 = box(el('div', 'story'), 10, 10, 100, 50)
  const far = box(el('div'), 8, 10, 102.5, 50)
  const outer2 = box(el('section'), 0, 0, 300, 400)
  tree(outer2, far, child2)
  assert.equal(getGrowCandidate(child2), far)
})

for (const [label, prop, value] of [
  ['a background colour', 'backgroundColor', 'rgb(240, 240, 240)'],
  ['a box-shadow', 'boxShadow', '0 1px 4px rgba(0,0,0,0.3)'],
  ['a border', 'borderTopStyle', 'solid'],
  ['overflow clipping', 'overflowX', 'hidden'],
  ['reduced opacity', 'opacity', '0.5'],
  ['a transform', 'transform', 'translateZ(0)'],
]) {
  test(`does NOT skip a same-size ancestor that paints its own box (${label})`, () => {
    reset()
    const child = box(el('div', 'story'), 10, 10, 100, 50)
    const wrapper = box(el('div'), 10, 10, 100, 50)
    wrapper.style[prop] = value
    if (prop === 'borderTopStyle') wrapper.style.borderTopWidth = '1px'
    const outer = box(el('section'), 0, 0, 300, 400)
    tree(outer, wrapper, child)
    assert.equal(getGrowCandidate(child), wrapper)
  })
}

test('skips display:contents and zero-size wrappers (no box of their own)', () => {
  reset()
  const child = box(el('div', 'story'), 10, 10, 100, 50)
  const contents = box(el('div'), 0, 0, 0, 0)
  contents.style.display = 'contents'
  const zero = box(el('div'), 0, 0, 0, 0)
  const outer = box(el('section'), 0, 0, 300, 400)
  tree(outer, contents, zero, child)
  assert.equal(getGrowCandidate(child), outer)
})

test('a fixed-position ancestor is a boundary: no candidate', () => {
  reset()
  const child = box(el('div', 'story'), 10, 10, 100, 50)
  const fixed = box(el('header'), 0, 0, 1200, 80)
  fixed.style.position = 'fixed'
  tree(fixed, child)
  assert.equal(getGrowCandidate(child), null)
})

test('a fixed-position selection cannot grow', () => {
  reset()
  const fixed = box(el('div', 'chat'), 0, 0, 200, 80)
  fixed.style.position = 'fixed'
  const outer = box(el('section'), 0, 0, 300, 400)
  tree(outer, fixed)
  assert.equal(getGrowCandidate(fixed), null)
})

test('a sticky ancestor is an ordinary candidate (sticky rails are real containers)', () => {
  reset()
  const child = box(el('div', 'story'), 10, 10, 100, 50)
  const sticky = box(el('aside'), 0, 0, 200, 600)
  sticky.style.position = 'sticky'
  tree(sticky, child)
  assert.equal(getGrowCandidate(child), sticky)
})

test('<main> and <body> are boundaries', () => {
  reset()
  const child = box(el('div', 'story'), 10, 10, 100, 50)
  const main = box(el('main'), 0, 0, 900, 900)
  tree(main, child)
  assert.equal(getGrowCandidate(child), null)

  reset()
  const top = box(el('div', 'top'), 0, 0, 900, 900)
  tree(top)
  assert.equal(getGrowCandidate(top), null)
})

test('a shadow-root top has no parentElement, so Grow stops there', () => {
  reset()
  const host = box(el('div'), 0, 0, 500, 500)
  document.body.appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })
  const inner = box(el('div', 'in shadow'), 10, 10, 100, 50)
  shadow.appendChild(inner)
  assert.equal(getGrowCandidate(inner), null)
})

test('a node removed from the page cannot grow (fails safely)', () => {
  reset()
  const child = box(el('div', 'story'), 10, 10, 100, 50)
  const parent = box(el('section'), 0, 0, 300, 400)
  tree(parent, child)
  parent.remove()
  assert.equal(getGrowCandidate(child), null)
})

test('an unrecognised/opaque background is treated as painted (do not skip when unsure)', () => {
  reset()
  const child = box(el('div', 'story'), 10, 10, 100, 50)
  const wrapper = box(el('div'), 10, 10, 100, 50)
  wrapper.style.backgroundColor = 'rgb(0, 0, 0)'
  const outer = box(el('section'), 0, 0, 300, 400)
  tree(outer, wrapper, child)
  assert.equal(getGrowCandidate(child), wrapper)
})
