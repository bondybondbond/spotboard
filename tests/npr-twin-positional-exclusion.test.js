// Regression coverage for #125: NPR cards failed their very first refresh with "Excluded content
// came back". Every NPR story renders its image twice (figure.square / figure.wide -- one hidden
// by CSS), and per-story exclusions (photo credits, topic labels) need positional :nth-child
// selectors because every story reuses the same classes. The hidden twin is still in the DOM at
// capture, so those selectors count it; the refresh pipeline used to dedupe the twins BEFORE
// resolving exclusions (#117), shifting every later sibling so the selectors missed.
// Fixture: one real npr.org homepage story (2026-09-28), image <source> tags and tracking
// attributes stripped; a second story is derived from it with different text/link/image.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { __generateExclusionSelectorForTest: generateExclusionSelector, sanitizeHTML } = await import('../.test-build/content.js')
const { applySanitizationPipeline, buildExclusionSignatures, cleanupDuplicates } = await import('../.test-build/utils/dom-cleanup.js')

const story = fs.readFileSync(new URL('./fixtures/npr-story-twin-figures.html', import.meta.url), 'utf8')
const story2 = story
  .replaceAll('Seth Wenig/AP', 'Evan Vucci/AP')
  .replaceAll('nx-s1-5983480/cornell-fraternity-rape-chi-phi-case-updates', 'nx-s1-1111111/senate-vote')
  .replaceAll('ap26271556664976.jpg', 'ap26270000000000.jpg')
  .replace('Prosecutors are reexamining a Cornell fraternity rape case', 'The Senate votes on the spending bill')
  .replace('/sections/national/"> National <', '/sections/politics/"> Politics <')

// Live page as the user saw it at capture: square twin hidden by the site's CSS.
function liveCard() {
  document.body.innerHTML = ''
  const root = document.createElement('div')
  root.id = 'contentWrap'
  root.innerHTML = story + story2
  root.querySelectorAll('figure.square').forEach(f => { f.style.display = 'none' })
  document.body.appendChild(root)
  return root
}

// Capture exactly as content.ts does: selector per clicked element, signatures vs sanitized HTML.
function capture(root, clicked) {
  const excludedSelectors = clicked.map(el => generateExclusionSelector(el, root))
  const cleaned = sanitizeHTML(root, clicked)
  const exclusionSignatures = buildExclusionSignatures(clicked.map((el, i) => ({ sel: excludedSelectors[i], elementHtml: el.outerHTML })), cleaned)
  return { selector: '#contentWrap', excludedSelectors, exclusionSignatures, html_cache: cleaned, url: 'https://www.npr.org/' }
}

test('#125 premise: dedup really does drop the hidden NPR twin figure (otherwise this test proves nothing)', () => {
  const root = liveCard()
  const d = document.createElement('div')
  d.innerHTML = cleanupDuplicates(root.outerHTML)
  assert.equal(d.querySelectorAll('figure').length, 2, 'one figure per story after dedup')
})

test('#125: positional credit + topic-label exclusions survive refresh on NPR twin-figure stories', () => {
  const root = liveCard()
  // What the owner clicked: the visible (wide) figure's credit and the topic label, in both stories
  const clicked = [
    ...root.querySelectorAll('figure.wide span.credit'),
    ...root.querySelectorAll('div.slug-wrap'),
  ]
  const component = capture(root, clicked)
  assert.ok(component.excludedSelectors.some(s => /figure:nth-child\(2\)/.test(s)),
    'the credit selector is positional and counts the hidden twin (figure 2 of 2)')

  // Refresh hands the pipeline the raw markup: no CSS, both twins present
  const result = applySanitizationPipeline(root.outerHTML, component)
  const text = result.replace(/<[^>]+>/g, ' ')
  assert.doesNotMatch(text, /Politics|National/, 'excluded topic labels must stay excluded')
  assert.doesNotMatch(result, /<span class="credit">/, 'excluded credit spans must stay excluded (incl. the kept twin\'s copy)')
  assert.match(text, /Prosecutors are reexamining/, 'story 1 headline kept')
  assert.match(text, /The Senate votes/, 'story 2 headline kept')
  assert.equal((result.match(/<figure/g) || []).length, 2, 'twins still deduped to one per story')
  assert.deepEqual(component.__exclusionCheck.leaked, [], 'the #96 gate sees no leaked exclusion')
})

test('#125: excluding the whole visible twin (second in DOM) removes its hidden first twin too', () => {
  const root = liveCard()
  const component = capture(root, [root.querySelector('figure.wide')])
  const result = applySanitizationPipeline(root.outerHTML, component)
  const d = document.createElement('div')
  d.innerHTML = result
  const firstStory = d.querySelector('article')
  assert.equal(firstStory.querySelectorAll('figure').length, 0, 'neither twin of the excluded image survives')
  assert.equal(d.querySelectorAll('figure').length, 1, 'the other story keeps its image')
  assert.doesNotMatch(result, /data-sb-excluded/, 'refresh-time marks never reach stored HTML')
})

// Twins as dedup sees them: same image, same link, same full text -- but twin A (hidden, kept by
// dedup because it comes first) may wrap its content differently from twin B.
const twin = (cls, inner) => `<div class="${cls}"><a href="/x">Same Headline</a><img src="https://cdn.example/img.png">${inner}</div>`

test('#125: a mark on the dropped twin reaches the kept twin even when the twins are structured differently', () => {
  const html = `<div class="card">${twin('a', '<div class="wrap"><span class="credit">Seth Wenig/AP</span></div>')}${twin('b', '<span class="credit">Seth Wenig/AP</span>')}<p>Keep me</p></div>`
  const sel = 'div:nth-child(2) > span:nth-child(3)' // the visible twin B's credit, positional
  // keep: 1 puts the #99 text-anchor out of play, so only the mark transfer can remove the copy
  const component = { selector: 'div.card', excludedSelectors: [sel], exclusionSignatures: [{ sel, sig: 'seth wenig/ap', keep: 1 }] }
  const result = applySanitizationPipeline(html, component)
  assert.doesNotMatch(result, /Seth Wenig/, 'the kept twin\'s copy is matched by tag + text and removed')
  assert.match(result, /Keep me/)
  assert.deepEqual(component.__exclusionCheck.leaked, [])
})

test('#125: a mark that cannot be carried onto the kept twin is reported to the leak gate, never dropped silently', () => {
  // Kept twin A has TWO identical spans at other positions -> no single safe match for the mark
  const inner = '<span class="credit">Credit Name</span><span class="credit">Credit Name</span>'
  const html = `<div class="card">${twin('a', `<div class="wrap">${inner}</div>`)}${twin('b', inner)}<p>Keep me</p></div>`
  const sel = 'div:nth-child(2) > span:nth-child(4)'
  const component = { selector: 'div.card', excludedSelectors: [sel], exclusionSignatures: [{ sel, sig: 'credit name', keep: 1 }] }
  const result = applySanitizationPipeline(html, component)
  assert.equal((result.match(/Credit Name/g) || []).length, 2, 'ambiguous: nothing guessed away')
  assert.deepEqual(component.__exclusionCheck.leaked, [sel], 'the #96 gate sees the excluded text back and keeps the last good card')
})

test('#125: the #99 text-anchor still runs on deduped markup (a drifted selector is recovered by text, not doubled by the twin)', () => {
  const html = `<div class="card">${twin('a', '<span class="credit">Seth Wenig/AP</span>')}${twin('b', '<span class="credit">Seth Wenig/AP</span>')}<p>Keep me</p></div>`
  const sel = 'div:nth-child(9) > span:nth-child(3)' // drifted: matches nothing on this render
  const component = { selector: 'div.card', excludedSelectors: [sel], exclusionSignatures: [{ sel, sig: 'seth wenig/ap', keep: 0 }] }
  const result = applySanitizationPipeline(html, component)
  assert.doesNotMatch(result, /Seth Wenig/, 'one copy left after dedup, so the text-anchor can claim it')
  assert.deepEqual(component.__exclusionCheck.leaked, [])
  assert.doesNotMatch(result, /data-sb-excluded/)
})
