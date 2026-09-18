// Regression coverage for #70: cleanupDuplicates() removed every element whose class merely
// CONTAINED "mobile-". Sky Sports tiles carry the BEM modifier "glints-box--mobile-edge", so
// capturing a tile group deleted every tile (42k chars -> an empty <div>). A "mobile-*" token
// is now a duplicate marker only when "mobile-" is not directly preceded by "--".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { cleanupDuplicates } = await import('../.test-build/utils/dom-cleanup.js')

// Sky Sports tile structure (real class names, placeholder text/urls).
const skyTile = (n) => `
  <div class="sdc-site-tiles__item sdc-site-tile glints-box glints-box-hover glints-box--mobile-edge sdc-site-tile--has-link" data-testid="sitewide-tiles-item">
    <div class="sdc-site-tile__body">
      <h3 class="sdc-site-tile__headline"><a class="sdc-site-tile__headline-link" href="/story/${n}"><span>Headline ${n}</span></a></h3>
    </div>
  </div>`

test('#70: Sky tiles carrying glints-box--mobile-edge are retained (whole tile group)', () => {
  const out = cleanupDuplicates(`${skyTile(1)}${skyTile(2)}${skyTile(3)}`)
  for (const n of [1, 2, 3]) assert.match(out, new RegExp(`Headline ${n}`))
  assert.match(out, /glints-box--mobile-edge/)
})

test('#70: an element that IS the modifier-classed tile (capture root inside subtree) is retained', () => {
  const out = cleanupDuplicates(`<div class="wrap">${skyTile(1)}</div>`)
  assert.match(out, /Headline 1/)
})

test('genuine mobile duplicates are still removed (mobile-content, mobile-title)', () => {
  const out = cleanupDuplicates(
    '<div><p class="mobile-content">Short mobile copy</p><p class="mobile-title">Mobile title</p><p class="desktop-copy">Full copy</p></div>'
  )
  assert.doesNotMatch(out, /Short mobile copy/)
  assert.doesNotMatch(out, /Mobile title/)
  assert.match(out, /Full copy/)
})

test('BEM element and mid-token forms are still removed (card__mobile-title, foo-mobile-x)', () => {
  const out = cleanupDuplicates(
    '<div><span class="card__mobile-title">Mobile A</span><span class="foo-mobile-x">Mobile B</span><span class="card__title">Desktop</span></div>'
  )
  assert.doesNotMatch(out, /Mobile A/)
  assert.doesNotMatch(out, /Mobile B/)
  assert.match(out, /Desktop/)
})

test('a mixed class list with one genuine token is still removed (foo--mobile-edge mobile-content)', () => {
  const out = cleanupDuplicates('<div><p class="foo--mobile-edge mobile-content">Mixed</p><p>Keep</p></div>')
  assert.doesNotMatch(out, /Mixed/)
  assert.match(out, /Keep/)
})

test('known limit: a modifier like x--is-mobile-hidden is still treated as a mobile duplicate', () => {
  const out = cleanupDuplicates('<div><p class="x--is-mobile-hidden">Hidden variant</p><p>Keep</p></div>')
  assert.doesNotMatch(out, /Hidden variant/)
})
