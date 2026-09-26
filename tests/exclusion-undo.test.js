// #66 follow-up (owner ask): Undo reverts the last exclusion action exactly -- a single click,
// one Grow/Shrink step, or an un-exclude -- restoring the excluded list, the live red styling and
// the Grow/Shrink chain, so a mistaken click on a too-big block can be taken back.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'
import { el } from './helpers/fixtures.js'

installDomEnv()
const {
  toggleExclusion,
  growExclusion,
  resetExclusions,
  undoLastExclusion,
  __getActiveExclusionChainForTest,
  __getExcludedElementsForTest,
} = await import('../.test-build/content.js')

function buildCard() {
  const p = el('p', 'Ad text')
  const article = el('article', null, [p])
  const other = el('p', 'Other')
  const root = el('div', null, [el('section', null, [article]), other])
  document.body.appendChild(root)
  return { root, article, p, other }
}

test('nothing to undo is a no-op', () => {
  resetExclusions()
  assert.equal(undoLastExclusion(), false)
})

test('undo reverts a single exclusion, including its live red mark', () => {
  resetExclusions()
  const { p } = buildCard()
  toggleExclusion(p)
  assert.equal(p.style.outline.includes('solid'), true)
  assert.equal(undoLastExclusion(), true)
  assert.deepEqual(__getExcludedElementsForTest(), [])
  assert.equal(p.style.outline, '')
  assert.equal(__getActiveExclusionChainForTest(), null)
})

test('undo steps back one Grow, then the original click, in order', () => {
  resetExclusions()
  const { root, article, p } = buildCard()
  toggleExclusion(p)
  growExclusion(root)
  assert.deepEqual(__getExcludedElementsForTest(), [article])

  undoLastExclusion()
  assert.deepEqual(__getExcludedElementsForTest(), [p], 'back to the clicked element')
  assert.equal(article.style.outline, '', 'grown-to ancestor un-marked')
  assert.equal(p.style.outline.includes('solid'), true, 'original re-marked')
  assert.equal(__getActiveExclusionChainForTest().activeElement, p)

  undoLastExclusion()
  assert.deepEqual(__getExcludedElementsForTest(), [])
})

test('undo of an un-exclude brings the exclusion back; a second exclusion undoes to the first', () => {
  resetExclusions()
  const { p, other } = buildCard()
  toggleExclusion(p)
  toggleExclusion(other)
  undoLastExclusion()
  assert.deepEqual(__getExcludedElementsForTest(), [p], 'only the later exclusion undone')
  assert.equal(__getActiveExclusionChainForTest().activeElement, p, 'p is active again, so Grow/Shrink act on it')

  toggleExclusion(p) // un-exclude
  assert.deepEqual(__getExcludedElementsForTest(), [])
  undoLastExclusion()
  assert.deepEqual(__getExcludedElementsForTest(), [p])
})

test('resetExclusions clears the undo history', () => {
  resetExclusions()
  const { p } = buildCard()
  toggleExclusion(p)
  resetExclusions()
  assert.equal(undoLastExclusion(), false)
})

test('undoing a Grow restores the chain exactly: Shrink is disabled again and Grow re-walks', () => {
  resetExclusions()
  const { root, article, p } = buildCard()
  toggleExclusion(p)
  growExclusion(root)
  undoLastExclusion()
  const chain = __getActiveExclusionChainForTest()
  assert.equal(chain.chainLength, 1, 'grown-to level is not left behind in the chain')
  assert.equal(chain.activeIndex, 0)
  growExclusion(root)
  assert.deepEqual(__getExcludedElementsForTest(), [article])
})
