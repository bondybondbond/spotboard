// #170: the green selected-region frame is a fixed overlay (an outline on the page element is clipped by
// any overflow:auto/hidden ancestor -- Yahoo Fantasy's transactions table showed only its top edge). It must
// show in step 2, stay through step 3 (exclusion), and vanish when capture ends. Its placement/clipping-proofness
// in a real browser is covered by the throwaway-profile E2E (repro170.mjs); here we pin the lifecycle.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'
import { el } from './helpers/fixtures.js'

installDomEnv()
global.chrome.runtime.sendMessage = () => {}

const {
  startRefinement,
  growRefinement,
  endRefinement,
  __getRegionFrameForTest,
  __toggleCaptureForTest,
} = await import('../.test-build/content.js')

function box(node, left, top, width, height) {
  node.getBoundingClientRect = () => ({
    left, top, width, height, right: left + width, bottom: top + height, x: left, y: top,
  })
  return node
}

function fixture() {
  const leaf = box(el('span', 'story one'), 10, 10, 100, 50)
  const card = box(el('div', null, [leaf]), 5, 5, 300, 400)
  const column = box(el('section', null, [card]), 0, 0, 320, 900)
  document.body.appendChild(column)
  return { leaf, card, column }
}

function reset() {
  endRefinement('cancel')
  __toggleCaptureForTest(false)
  document.body.replaceChildren()
}

const frameHostUp = () => !!document.getElementById('spotboard-region-frame')

test('no frame while capture is off', () => {
  reset()
  const { leaf } = fixture()
  startRefinement(leaf, leaf, false)
  assert.equal(__getRegionFrameForTest(), null)
  assert.equal(frameHostUp(), false)
  reset()
})

test('frame hugs the selected region (+5px each side) and follows Grow', () => {
  reset()
  const { leaf } = fixture()
  __toggleCaptureForTest(true)
  startRefinement(leaf, leaf, false)
  let f = __getRegionFrameForTest()
  assert.ok(f, 'frame is drawn in step 2')
  assert.equal(f.style.getPropertyValue('top'), '5px')
  assert.equal(f.style.getPropertyValue('left'), '5px')
  assert.equal(f.style.getPropertyValue('width'), '110px')
  assert.equal(f.style.getPropertyValue('height'), '60px')
  assert.match(f.style.cssText, /00ff00|rgb\(0, 255, 0\)/)
  assert.match(f.style.cssText, /pointer-events: none/)
  growRefinement()
  f = __getRegionFrameForTest()
  assert.equal(f.style.getPropertyValue('width'), '310px')
  assert.equal(f.style.getPropertyValue('height'), '410px')
  assert.equal(document.querySelectorAll('#spotboard-region-frame').length, 1, 'one frame, not one per step')
  reset()
})

test('frame goes when refinement is cancelled and when capture ends', () => {
  reset()
  const { leaf } = fixture()
  __toggleCaptureForTest(true)
  startRefinement(leaf, leaf, false)
  assert.ok(__getRegionFrameForTest())
  endRefinement('cancel')
  assert.equal(__getRegionFrameForTest(), null, 'nothing selected -> no frame (cancel/Esc path)')
  __toggleCaptureForTest(false)
  assert.equal(frameHostUp(), false)
  reset()
})

test('frame is removed when the selected node leaves the page', () => {
  reset()
  const { leaf, column } = fixture()
  __toggleCaptureForTest(true)
  startRefinement(leaf, leaf, false)
  assert.ok(__getRegionFrameForTest())
  column.remove()
  assert.equal(__getRegionFrameForTest(), null)
  assert.equal(frameHostUp(), false)
  reset()
})
