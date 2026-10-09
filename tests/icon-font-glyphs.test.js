// Regression coverage for #172: Yahoo Fantasy draws its icons as ONE private-use character inside an empty-looking
// <span class="F-icon"> (shown by Yahoo's own web font). The font isn't loaded on extension pages, so the character
// rendered as an empty box in the preview and in saved cards. cleanupDuplicates() now drops leaf elements whose whole
// text is private-use characters. Markup shape is the real Yahoo one; names/text are placeholders.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { cleanupDuplicates, applySanitizationPipeline } = await import('../.test-build/utils/dom-cleanup.js')

const ADD = '\uE035'   // + on Yahoo
const DROP = '\uE033'  // - on Yahoo

const row = (n) => `
  <tr>
    <td class="Grid-u-1-12 Ta-c"><span class="F-icon Block Fz-lg F-positive Cur-h" title="Added Player">${ADD}</span><span class="F-icon Block Fz-lg F-negative Ptop-med Cur-h" title="Dropped Player">${DROP}</span></td>
    <td class="Grid-u-1-2"><a href="/p/${n}">Player ${n}</a><span>Free Agent</span><a href="/q/${n}">Player ${n}b</a><span>To Waivers</span></td>
    <td class="Ta-end">Team ${n}</td>
  </tr>`
const table = (rows) => `<table><tbody>${rows}</tbody></table>`

test('#172: Yahoo F-icon glyph spans are removed, row text is untouched', () => {
  const out = cleanupDuplicates(table(row(1) + row(2)))
  assert.doesNotMatch(out, /[\uE000-\uF8FF]/u)
  assert.doesNotMatch(out, /F-icon/)
  assert.equal(new DOMParser().parseFromString(out, 'text/html').querySelectorAll('tr')[0].children.length, 3, 'row keeps its 3 cells')
  for (const t of ['Player 1', 'Player 2', 'Free Agent', 'To Waivers', 'Team 1', 'Team 2']) assert.match(out, new RegExp(t))
})

test('#172: an icon-only anchor (Yahoo Football badge) is removed with its glyph; sibling text stays', () => {
  const out = cleanupDuplicates(`<div><a class="Badge F-icon" href="/x">\uE00C</a><span>Keep me</span></div>`)
  assert.doesNotMatch(out, /[\uE000-\uF8FF]/u)
  assert.match(out, /Keep me/)
})

test('#172 negatives: ordinary + / - / minus signs, mixed text, Apple logo and <img> icons all survive', () => {
  const html = `<div>
    <span class="plus">+</span><span class="dash">-</span><span class="minus">−</span>
    <a href="/m">${ADD} Add player</a>
    <span class="apple">\uF8FF</span>
    <img src="https://example.com/i.png" alt="icon">
  </div>`
  const out = cleanupDuplicates(html)
  assert.match(out, /class="plus">\+</)
  assert.match(out, /class="dash">-</)
  assert.match(out, /class="minus">−</)
  assert.match(out, /Add player/)            // glyph mixed with real text: left alone (documented limit)
  assert.match(out, /class="apple">\uF8FF</u) // U+F8FF is a real character (Apple logo), not an icon-font glyph
  assert.match(out, /<img/)
})

test('#172: Material Icons handling is unchanged (still stripped by class)', () => {
  const out = cleanupDuplicates('<div><span class="material-icons">check_circle</span><span>Price</span></div>')
  assert.doesNotMatch(out, /check_circle/)
  assert.match(out, /Price/)
})

test('#172: supplementary-plane private-use glyphs are removed too', () => {
  const out = cleanupDuplicates(`<div><i class="icon-x">${String.fromCodePoint(0xF0001)}</i><span>Label</span></div>`)
  assert.doesNotMatch(out, /icon-x/)
  assert.match(out, /Label/)
})

test('#172: a positional exclusion that counts the glyph spans still hits the right element on refresh', () => {
  // Stored selectors are generated on the live page, where the glyph spans exist. They are resolved on the raw
  // markup BEFORE cleanupDuplicates (#125), so removing the glyphs must not shift them.
  const html = `<div class="card"><p><span class="F-icon" title="Added Player">${ADD}</span><b>Remove me</b><i>Keep me</i></p></div>`
  const component = {
    url: 'https://example.com/',
    selector: 'div.card',
    excludedSelectors: ['div.card > p > *:nth-child(2)'],
  }
  const out = applySanitizationPipeline(html, component)
  assert.doesNotMatch(out, /Remove me/)
  assert.match(out, /Keep me/)
  assert.doesNotMatch(out, /[\uE000-\uF8FF]/u)
})

test('#172: a stored exclusion on the glyph span itself resolves and the refresh verdict is clean', () => {
  // The verdict the refresh engine reads is component.__exclusionCheck (set by the pipeline), not lastOutcome.
  const html = `<div class="card"><p><span class="F-icon" title="Added Player">${ADD}</span><b>Name</b></p></div>`
  const component = { url: 'https://example.com/', selector: 'div.card', excludedSelectors: ['div.card > p > span'] }
  const out = applySanitizationPipeline(html, component)
  assert.match(out, /Name/)
  assert.doesNotMatch(out, /F-icon/)
  const check = component.__exclusionCheck
  assert.ok(check, 'pipeline recorded an exclusion verdict')
  assert.deepEqual(check.leaked, [])
  assert.deepEqual(check.unverified, [])
})

test('#172: a selector that matches nothing is still reported (the clean verdict above is not vacuous)', () => {
  const html = `<div class="card"><p><span class="F-icon">${ADD}</span><b>Name</b></p></div>`
  const component = { url: 'https://example.com/', selector: 'div.card', excludedSelectors: ['div.card > p > em'] }
  applySanitizationPipeline(html, component)
  const check = component.__exclusionCheck
  assert.ok(check.leaked.length + check.unverified.length > 0, 'a selector that cannot resolve shows up in the verdict')
})

test('#172: an icon-only table cell is emptied, not deleted, so later cells keep their column', () => {
  const out = cleanupDuplicates(`<table><thead><tr><th>${ADD}</th><th>Player</th><th>Team</th></tr></thead><tbody><tr><td>${ADD}</td><td>Alpha</td><td>One</td></tr><tr><td>${DROP}</td><td>Bravo</td><td>Two</td></tr></tbody></table>`)
  assert.doesNotMatch(out, /[\uE000-\uF8FF]/u)
  const doc = new DOMParser().parseFromString(out, 'text/html')
  for (const tr of doc.querySelectorAll('tr')) assert.equal(tr.children.length, 3, 'every row still has 3 cells')
  assert.equal(doc.querySelectorAll('tbody tr')[1].children[1].textContent, 'Bravo')
})

test('#172: a glyph-only child span next to real text in its parent is removed and the text stays', () => {
  const out = cleanupDuplicates(`<p>Added <span class="F-icon">${ADD}</span> Alpha Skater</p>`)
  assert.doesNotMatch(out, /[\uE000-\uF8FF]/u)
  assert.match(out, /Added\s+Alpha Skater/)
})

test('#172: glyph text inside a renderable SVG is left alone (SVG guard)', () => {
  const out = cleanupDuplicates(`<div><svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#08c"/><text x="6" y="16" fill="#fff">${ADD}</text></svg><span>Keep me</span></div>`)
  assert.match(out, /<svg/)
  assert.match(out, new RegExp('<text[^>]*>' + ADD + '</text>'))
})
