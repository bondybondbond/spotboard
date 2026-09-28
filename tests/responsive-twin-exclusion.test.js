// Regression coverage for #117: applySanitizationPipeline() ran applyExclusionsWithStats()
// BEFORE cleanupDuplicates(). At capture time the live page's CSS has already hidden a
// responsive/mobile twin before the user can click exclude, so dedup has nothing to do there.
// At refresh (raw fetch, no CSS) both twins are present, and dedup's structural heuristic is the
// only thing that can remove the hidden one -- but running exclusions first removed the visible
// (excluded) twin before dedup ever compared the pair, so the once-hidden twin lost its partner
// and survived. Fix: dedupe before exclusions are REMOVED (#125: but resolve them before
// dedup). Fixture card in this file is a structural clone
// of a real responsive-twin pair found live on theverge.com's homepage hero (2026-09-27) --
// same image URL, same link, same headline text, one wrapper `display:grid` (visible) and one
// `display:none` (hidden) -- query strings on the real image URL stripped, everything else real.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { applySanitizationPipeline } = await import('../.test-build/utils/dom-cleanup.js')

const cardA = '<div class="_1msrjwf1 duet--content-cards--content-card _1ismqj2 _1ismqj0 _7uluu53"><div class="_1ismqj8 _1ismqj6 _1ismqjc _1ismqjh _1cnxcye3"><img class="_1ismqjf i7ks070" src="https://platform.theverge.com/wp-content/uploads/sites/2/2026/06/CTRL_R_Story_04.png"></img></div><div class="_1ismqji"><a class="_7uluu50 _7uluu54" href="/games/1000818/control-resonant-reading-collectibles-documents-logs">Control Resonant is a great game</a></div></div>'
const cardB = cardA
  .replace('_1msrjwf1 duet--content-cards--content-card', 'duet--content-cards--content-card')
  .replace('_7uluu53"', '_7uluu53 _1ismqjj"')

const twinHtml = `<div class="_1e7jslxm"><div class="_1rdp8jb0">${cardA}</div><div class="_1rdp8jb2">${cardB}</div></div>`

test('#117: excluding the visible responsive twin stays excluded after refresh', () => {
  const component = { selector: '._1e7jslxm', excludedSelectors: ['._1rdp8jb0 ._1msrjwf1'] }
  const result = applySanitizationPipeline(twinHtml, component)
  assert.doesNotMatch(result, /Control Resonant/, 'excluded twin must not reappear via its hidden pair')
})

test('#117: an ordinary exclusion with no responsive twin is unaffected by the reorder', () => {
  const html = '<div class="card"><h2>Keep me</h2><p class="promo">Remove me</p></div>'
  const component = { selector: 'div.card', excludedSelectors: ['p.promo'] }
  const result = applySanitizationPipeline(html, component)
  assert.match(result, /Keep me/)
  assert.doesNotMatch(result, /Remove me/)
})

test('#117/#125: a positional (:nth-child) exclusion on a card with a responsive twin resolves against the RAW (capture-shaped) sibling set', () => {
  // #125 corrected this test's premise. CSS hides a responsive twin, it does not remove it, and
  // the capture-time positional path counts every child -- hidden twin included. So at capture
  // the children are [twinA, twinB(hidden), target, other] and the target is the 3rd child.
  // (The old version asserted p:nth-child(2), i.e. positions counted AFTER dedup; that ordering
  // broke ~100 of 143 real NPR exclusions on the first refresh.)
  const twinA = '<div class="twinA"><a href="/x">Same Headline</a><img src="https://cdn.example/img.png"></div>'
  const twinB = '<div class="twinB"><a href="/x">Same Headline</a><img src="https://cdn.example/img.png"></div>'
  const target = '<p>Unrelated promo text to exclude</p>'
  const other = '<p>Keep this one</p>'
  const html = `<div class="card">${twinA}${twinB}${target}${other}</div>`
  const component = { selector: 'div.card', excludedSelectors: ['p:nth-child(3)'] }
  const result = applySanitizationPipeline(html, component)
  assert.doesNotMatch(result, /Unrelated promo/, 'positional selector must resolve against the raw sibling set, matching capture-time position')
  assert.match(result, /Keep this one/)
  assert.equal((result.match(/Same Headline/g) || []).length, 1, 'the surviving twin must still be deduped to one')
})

test('#117: two distinct look-alike elements are not merged by dedup running ahead of exclusions', () => {
  // Same image, but DIFFERENT link + DIFFERENT text -- isResponsiveDuplicate() requires either
  // (same link AND same full text) or (no link AND same opening text); this pair satisfies
  // neither, so dedup must never treat them as a twin regardless of pipeline order.
  const itemA = '<div class="item"><a href="/one">First unrelated headline</a><img src="https://cdn.example/shared.png"></div>'
  const itemB = '<div class="item"><a href="/two">Second unrelated headline</a><img src="https://cdn.example/shared.png"></div>'
  const html = `<div class="card">${itemA}${itemB}</div>`
  const component = { selector: 'div.card', excludedSelectors: ['a[href="/one"]'] }
  const result = applySanitizationPipeline(html, component)
  assert.doesNotMatch(result, /First unrelated headline/, 'excluded item must be gone')
  assert.match(result, /Second unrelated headline/, 'the distinct sibling must survive -- must not be silently merged away as a false duplicate')
})
