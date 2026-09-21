// Coverage for #42's refinement stage (the state between the first capture click and the
// previewer): Grow/Shrink history, re-select, cancel/detach teardown, and the capture_refine
// event. The click/keyboard wiring around it is exercised in the real-run E2E (closed shadow
// overlays can't be driven from jsdom); these tests pin the state machine those handlers drive.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'
import { el } from './helpers/fixtures.js'

installDomEnv()
const sent = []
global.chrome.runtime.sendMessage = msg => { sent.push(msg) }

const {
  startRefinement,
  growRefinement,
  shrinkRefinement,
  endRefinement,
  __getRefineStateForTest,
} = await import('../.test-build/content.js')

function box(node, left, top, width, height) {
  node.getBoundingClientRect = () => ({
    left, top, width, height, right: left + width, bottom: top + height, x: left, y: top,
  })
  return node
}

// column(320x900) > card(300x400) > leaf(100x50); a sibling leaf2 inside card for re-select.
function fixture() {
  const leaf = box(el('span', 'story one'), 10, 10, 100, 50)
  const leaf2 = box(el('span', 'story two'), 10, 100, 100, 50)
  const card = box(el('div', null, [leaf, leaf2]), 5, 5, 300, 400)
  const column = box(el('section', null, [card]), 0, 0, 320, 900)
  document.body.appendChild(column)
  return { leaf, leaf2, card, column }
}

function reset() {
  endRefinement('cancel')
  document.body.replaceChildren()
  sent.length = 0
}

const hasGreen = node => node.style.getPropertyValue('outline').includes('rgb(0, 255, 0)') || node.style.getPropertyValue('outline').includes('#00ff00')
const barUp = () => !!document.getElementById('spotboard-refine-bar')

test('startRefinement outlines the proposed root, raises the bar, and does not lock exclusion mode', () => {
  reset()
  const { leaf } = fixture()
  startRefinement(leaf, leaf, false)
  const state = __getRefineStateForTest()
  assert.equal(state.index, 0)
  assert.equal(state.chain[0], leaf)
  assert.ok(hasGreen(leaf))
  assert.ok(barUp())
  reset()
})

test('Grow walks up one level per press, moving the outline; stops when nothing larger remains', () => {
  reset()
  const { leaf, card, column } = fixture()
  startRefinement(leaf, leaf, false)
  growRefinement()
  assert.equal(__getRefineStateForTest().chain[1], card)
  assert.ok(hasGreen(card) && !hasGreen(leaf))
  growRefinement()
  assert.equal(__getRefineStateForTest().index, 2)
  assert.ok(hasGreen(column) && !hasGreen(card))
  growRefinement() // column's parent is <body>: boundary, nothing changes
  assert.equal(__getRefineStateForTest().index, 2)
  assert.equal(__getRefineStateForTest().growCount, 2)
  reset()
})

test('Shrink steps back through the recorded history and Grow replays it', () => {
  reset()
  const { leaf, card } = fixture()
  startRefinement(leaf, leaf, false)
  growRefinement()
  shrinkRefinement()
  assert.equal(__getRefineStateForTest().index, 0)
  assert.ok(hasGreen(leaf) && !hasGreen(card))
  shrinkRefinement() // already at the original: no-op
  assert.equal(__getRefineStateForTest().index, 0)
  growRefinement()
  assert.equal(__getRefineStateForTest().chain[1], card)
  reset()
})

test('re-select replaces the proposed root and resets history but keeps attempt totals', () => {
  reset()
  const { leaf, leaf2, card } = fixture()
  startRefinement(leaf, leaf, false)
  growRefinement()
  startRefinement(leaf2, leaf2, false)
  const state = __getRefineStateForTest()
  assert.equal(state.chain.length, 1)
  assert.equal(state.chain[0], leaf2)
  assert.equal(state.reselects, 1)
  assert.equal(state.growCount, 1)
  assert.ok(hasGreen(leaf2) && !hasGreen(card) && !hasGreen(leaf))
  assert.equal(document.querySelectorAll('#spotboard-refine-bar').length, 1)
  reset()
})

test('endRefinement(cancel) leaves no outline, bar or state, and reports one capture_refine event', () => {
  reset()
  const { leaf } = fixture()
  startRefinement(leaf, leaf, false)
  growRefinement()
  endRefinement('cancel')
  assert.equal(__getRefineStateForTest(), null)
  assert.ok(!barUp())
  assert.equal([...document.querySelectorAll('*')].filter(n => n.style && n.style.getPropertyValue('outline')).length, 0)
  const events = sent.filter(m => m.eventName === 'capture_refine')
  assert.equal(events.length, 1)
  assert.equal(events[0].params.outcome, 'cancel')
  assert.equal(events[0].params.grew, true)
  assert.equal(events[0].params.grow_count, 1)
  assert.equal(events[0].params.final_tag, 'div')
  assert.equal(events[0].params.path, 'span:100x50>div:300x400')
  reset()
})

test('endRefinement with nothing in progress is a silent no-op (safe on every teardown path)', () => {
  reset()
  endRefinement('cancel')
  assert.equal(sent.filter(m => m.eventName === 'capture_refine').length, 0)
})

test('if the proposed root is removed from the page, Grow fails safely and ends the refinement', () => {
  reset()
  const { leaf, column } = fixture()
  startRefinement(leaf, leaf, false)
  column.remove()
  growRefinement()
  assert.equal(__getRefineStateForTest(), null)
  assert.ok(!barUp())
  const events = sent.filter(m => m.eventName === 'capture_refine')
  assert.equal(events.length, 1)
  assert.equal(events[0].params.outcome, 'detached')
  reset()
})
