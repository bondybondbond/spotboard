// Coverage for #61 (Grow/Shrink exclusion boundary in the Previewer): the chain-building /
// active-swap invariant that keeps `excludedElements` (and its live styling) in lockstep with
// the active exclusion's ancestor-chain position, and the "active exclusion stays visible,
// committed exclusions are removed" preview-rendering split that replaced the original
// full-removal-only behavior of sanitizeHTML's exclusion marker mechanism.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'
import { el } from './helpers/fixtures.js'

installDomEnv()
const {
  sanitizeHTML,
  toggleExclusion,
  growExclusion,
  shrinkExclusion,
  resetExclusions,
  __getActiveExclusionChainForTest,
  __getExcludedElementsForTest,
} = await import('../.test-build/content.js')

function buildNestedCard() {
  // <div id=root><section id=section><article id=article><p id=p>Ad text</p></article></section><p id=sibling>Keep me</p></div>
  const p = el('p', 'Ad text'); p.id = 'p'
  const article = el('article', null, [p]); article.id = 'article'
  const section = el('section', null, [article]); section.id = 'section'
  const sibling = el('p', 'Keep me'); sibling.id = 'sibling'
  const root = el('div', null, [section, sibling]); root.id = 'root'
  document.body.appendChild(root)
  return { root, section, article, p, sibling }
}

test('excluding a fresh element starts a 1-element chain at index 0', () => {
  resetExclusions()
  const { p } = buildNestedCard()
  toggleExclusion(p)
  const chain = __getActiveExclusionChainForTest()
  assert.equal(chain.chainLength, 1)
  assert.equal(chain.activeIndex, 0)
  assert.equal(chain.activeElement, p)
})

test('growExclusion steps to the parent and keeps excludedElements in lockstep (active-swap invariant)', () => {
  resetExclusions()
  const { root, article, p } = buildNestedCard()
  toggleExclusion(p)

  const result = growExclusion(root)
  assert.equal(result.ok, true)

  const chain = __getActiveExclusionChainForTest()
  assert.equal(chain.activeElement, article)
  assert.equal(chain.chainLength, 2)

  // Exactly one entry for the active exclusion at every step -- no stale, no duplicate.
  const excluded = __getExcludedElementsForTest()
  assert.equal(excluded.length, 1)
  assert.equal(excluded[0], article)

  // Old active element's styling is cleared, new active element's is applied. (outline, not
  // background, is asserted for "cleared" -- jsdom's CSSOM doesn't fully unwind the `background`
  // shorthand's expanded longhands on removeProperty(), a test-environment quirk confirmed
  // harmless in a real browser during #61's manual re-test, not a bug in setActiveExclusionIndex.)
  assert.equal(p.style.outline, '')
  assert.equal(article.style.background, 'rgba(255, 0, 0, 0.3)')
  assert.equal(article.style.outline, '2px solid #ff0000')
})

test('growExclusion is hard-capped at the capture root', () => {
  resetExclusions()
  const { root, section, article, p } = buildNestedCard()
  toggleExclusion(p)

  assert.equal(growExclusion(root).ok, true) // -> article
  assert.equal(growExclusion(root).ok, true) // -> section
  assert.equal(__getActiveExclusionChainForTest().activeElement, section)

  // section's parent is root itself -- Grow must refuse to reach/include the capture root.
  const blocked = growExclusion(root)
  assert.equal(blocked.ok, false)
  assert.equal(blocked.reason, 'reached-capture-root')
  assert.equal(__getActiveExclusionChainForTest().activeElement, section)
  assert.equal(__getExcludedElementsForTest().length, 1)
})

test('shrinkExclusion replays the stored chain back down, never re-deriving', () => {
  resetExclusions()
  const { root, article, p } = buildNestedCard()
  toggleExclusion(p)
  growExclusion(root) // -> article

  const result = shrinkExclusion()
  assert.equal(result.ok, true)
  assert.equal(__getActiveExclusionChainForTest().activeElement, p)
  assert.equal(__getExcludedElementsForTest()[0], p)
  assert.equal(article.style.outline, '')
})

test('shrinkExclusion at the original element refuses to go further', () => {
  resetExclusions()
  const { p } = buildNestedCard()
  toggleExclusion(p)

  const result = shrinkExclusion()
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'already-at-original')
  assert.equal(__getActiveExclusionChainForTest().activeElement, p)
})

test('re-growing after a shrink discards the stale higher chain level and re-walks fresh', () => {
  resetExclusions()
  const { root, section, article, p } = buildNestedCard()
  toggleExclusion(p)
  growExclusion(root) // -> article
  growExclusion(root) // -> section
  shrinkExclusion() // -> article
  const result = growExclusion(root) // -> section again, freshly walked
  assert.equal(result.ok, true)
  assert.equal(__getActiveExclusionChainForTest().activeElement, section)
  assert.equal(__getActiveExclusionChainForTest().chainLength, 3)
})

test('excluding a new element commits the previous active exclusion (no reactivation in v1)', () => {
  resetExclusions()
  const { p, sibling } = buildNestedCard()
  toggleExclusion(p)
  toggleExclusion(sibling)

  const chain = __getActiveExclusionChainForTest()
  assert.equal(chain.activeElement, sibling, 'the newly-excluded element becomes active')

  const excluded = __getExcludedElementsForTest()
  assert.equal(excluded.length, 2, 'the previous exclusion is committed, not dropped')
  assert.ok(excluded.includes(p))
  assert.ok(excluded.includes(sibling))
})

test('preview rendering: the active exclusion stays visible with its marker, a committed exclusion is fully removed', () => {
  // Mirrors updatePreview()'s own approach: exclude the active element from the removal list
  // passed to sanitizeHTML, and mark it so the Previewer's CSS can render it subtly instead of
  // hiding it -- this is the mechanism that replaced always fully removing every exclusion.
  resetExclusions()
  const { root, p, sibling } = buildNestedCard()
  toggleExclusion(p)       // will be "committed" (fully removed)
  toggleExclusion(sibling) // active

  const excludedElements = __getExcludedElementsForTest()
  const active = __getActiveExclusionChainForTest().activeElement
  const elementsToRemove = excludedElements.filter(e => e !== active)

  active.setAttribute('data-spotboard-active-exclusion', 'true')
  let html
  try {
    html = sanitizeHTML(root, elementsToRemove)
  } finally {
    active.removeAttribute('data-spotboard-active-exclusion')
  }

  assert.doesNotMatch(html, /Ad text/, 'committed exclusion (p) is fully removed')
  assert.match(html, /Keep me/, 'active exclusion (sibling) stays in the rendered preview')
  assert.match(html, /data-spotboard-active-exclusion/, 'active exclusion carries its marker for the subtle-highlight CSS rule')
})
