// Regression coverage for #131: NPR cards came back from a refresh with square images where the
// card was captured wide. Every NPR story renders its image twice (figure.square / figure.wide),
// CSS shows one. Capture drops the hidden twin; tier-1 refresh has no CSS, both twins are in the
// markup, and dedup kept the FIRST twin (square). Now the twin that matches the saved card wins --
// scored by the *variant* features that tell the twins apart (class tokens + short data-* values),
// not by per-story URLs, so stories new since capture follow the card's variant too.
// Fixture: one real npr.org homepage story (2026-09-28); more stories are derived from it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { sanitizeHTML } = await import('../.test-build/content.js')
const { applySanitizationPipeline, cleanupDuplicates } = await import('../.test-build/utils/dom-cleanup.js')

const story = fs.readFileSync(new URL('./fixtures/npr-story-twin-figures.html', import.meta.url), 'utf8')
const story2 = story
  .replaceAll('Seth Wenig/AP', 'Evan Vucci/AP')
  .replaceAll('nx-s1-5983480/cornell-fraternity-rape-chi-phi-case-updates', 'nx-s1-1111111/senate-vote')
  .replaceAll('ap26271556664976.jpg', 'ap26270000000000.jpg')
  .replace('Prosecutors are reexamining a Cornell fraternity rape case', 'The Senate votes on the spending bill')
  .replace('/sections/national/"> National <', '/sections/politics/"> Politics <')
const story3 = story
  .replaceAll('Seth Wenig/AP', 'Jane Doe/Reuters')
  .replaceAll('nx-s1-5983480/cornell-fraternity-rape-chi-phi-case-updates', 'nx-s1-2222222/new-story')
  .replaceAll('ap26271556664976.jpg', 'reuters-brand-new.jpg')
  .replace('Prosecutors are reexamining a Cornell fraternity rape case', 'A story that was not on the page at capture')
  .replace('/sections/national/"> National <', '/sections/world/"> World <')

const wrap = (...stories) => `<div id="contentWrap">${stories.join('')}</div>`
const npr = (html_cache, extra = {}) => ({ selector: '#contentWrap', url: 'https://www.npr.org/', html_cache, ...extra })

// The saved card as capture stores it: live page, square twin hidden by the site's CSS.
function capturedCard(...stories) {
  document.body.innerHTML = ''
  const root = document.createElement('div')
  root.id = 'contentWrap'
  root.innerHTML = stories.join('')
  root.querySelectorAll('figure.square').forEach(f => { f.style.display = 'none' })
  document.body.appendChild(root)
  return sanitizeHTML(root, [])
}

const kinds = html => {
  const d = document.createElement('div')
  d.innerHTML = html
  return [...d.querySelectorAll('figure')].map(f => (f.classList.contains('wide') ? 'wide' : 'square'))
}

test('#131 premise: without a saved card dedup keeps the first (square) twin of every story', () => {
  assert.deepEqual(kinds(cleanupDuplicates(wrap(story, story2))), ['square', 'square'])
})

test('#131: a card captured wide stays wide after refresh (stories the saved card has)', () => {
  const saved = capturedCard(story, story2)
  assert.deepEqual(kinds(saved), ['wide', 'wide'], 'premise: capture really stored the wide twins')
  const result = applySanitizationPipeline(wrap(story, story2), npr(saved))
  assert.deepEqual(kinds(result), ['wide', 'wide'])
  assert.match(result, /crop\/6000x3375/, 'the kept image is the wide crop')
  assert.doesNotMatch(result, /crop\/4000x4000/, 'no square crop survives')
})

test('#131: stories new since capture follow the saved card\'s variant (no URL overlap needed)', () => {
  const saved = capturedCard(story, story2) // story3 is not in the saved card at all
  const result = applySanitizationPipeline(wrap(story, story3, story2), npr(saved))
  assert.deepEqual(kinds(result), ['wide', 'wide', 'wide'])
  assert.match(result, /A story that was not on the page at capture/)
})

test('#131: a second refresh is stable (refreshing the refreshed card changes nothing)', () => {
  const saved = capturedCard(story, story2)
  const once = applySanitizationPipeline(wrap(story, story2), npr(saved))
  const twice = applySanitizationPipeline(wrap(story, story2), npr(once))
  assert.deepEqual(kinds(twice), ['wide', 'wide'])
})

test('#131: the saved card decides, not a built-in preference (a square card stays square)', () => {
  const saved = '<div id="contentWrap"><figure class="thumb-image square"><div data-crop-type="square"></div></figure></div>'
  assert.deepEqual(kinds(applySanitizationPipeline(wrap(story, story2), npr(saved))), ['square', 'square'])
})

test('#131 negatives: no saved card, or a saved card with neither variant, fall back to the first twin', () => {
  const neither = '<div id="contentWrap"><p>Some unrelated text</p><div class="foo" data-x="1"></div></div>'
  assert.deepEqual(kinds(applySanitizationPipeline(wrap(story, story2), npr(undefined))), ['square', 'square'])
  assert.deepEqual(kinds(applySanitizationPipeline(wrap(story, story2), npr(neither))), ['square', 'square'])
  assert.equal(cleanupDuplicates(wrap(story, story2), neither), cleanupDuplicates(wrap(story, story2)), 'byte-identical to the no-saved-card output')
})

test('#131 negative: twins with no distinguishing feature keep the first twin whatever the saved card holds', () => {
  const twin = '<div class="t"><a href="/x">Same Headline</a><img src="https://cdn.example/img.png"></div>'
  const html = `<div class="card">${twin}${twin}</div>`
  const saved = '<div class="t wide" data-crop-type="wide"></div>'
  assert.equal(cleanupDuplicates(html, saved), cleanupDuplicates(html))
  assert.equal((cleanupDuplicates(html, saved).match(/class="t"/g) || []).length, 1)
})

test('#131: three candidates for one story collapse to exactly one, the saved variant', () => {
  const figures = story.match(/<figure[\s\S]*?<\/figure>/g)
  const extraWide = figures[1].replace('resg-s1-145269', 'resg-s1-999999')
  const html = story.replace(figures[1], figures[1] + extraWide)
  const saved = capturedCard(story)
  assert.deepEqual(kinds(applySanitizationPipeline(wrap(html), npr(saved))), ['wide'])
})

test('#131: twins that differ only in a state-like token follow the state the saved card holds (deliberate, not accidental)', () => {
  const twin = cls => `<div class="${cls}"><a href="/x">Same Headline</a><img src="https://cdn.example/img.png"></div>`
  const html = `<div class="card">${twin('slide')}${twin('slide is-loaded')}</div>`
  assert.match(cleanupDuplicates(html, '<div class="slide is-loaded"></div>'), /is-loaded/, 'the twin matching the saved card\'s state survives')
  assert.doesNotMatch(cleanupDuplicates(html, '<div class="slide"></div>'), /is-loaded/, 'saved card without the state keeps the first twin')
})

test('#131: SpotBoard\'s own marks never count as a distinguishing feature', () => {
  const twin = extra => `<div class="t"${extra}><a href="/x">Same Headline</a><img src="https://cdn.example/img.png"></div>`
  const html = `<div class="card">${twin('')}${twin(' data-sb-excluded="1"')}</div>`
  // If the mark counted, the saved card's identical mark would pull the later twin forward.
  assert.equal(cleanupDuplicates(html, '<div class="t" data-sb-excluded="1"></div>'), cleanupDuplicates(html))
})

test('#131: exclusions still hold when the later (wide) twin is the one kept', () => {
  const saved = capturedCard(story, story2)
  const component = npr(saved, { excludedSelectors: ['#contentWrap div.slug-wrap'] })
  const result = applySanitizationPipeline(wrap(story, story2), component)
  assert.deepEqual(kinds(result), ['wide', 'wide'])
  assert.doesNotMatch(result.replace(/<[^>]+>/g, ' '), /Politics|National/, 'the excluded topic labels stay excluded')
  assert.doesNotMatch(result, /data-sb-excluded/, 'refresh-time marks never reach stored HTML')
})

test('#131: a token both twins carry (a different number of times) never decides', () => {
  const twin = byline => `<div class="t"><a href="/x">Same Headline</a><img src="https://cdn.example/img.png">${byline}</div>`
  const one = '<span class="byline">A</span>'
  const two = '<span class="byline">A</span><span class="byline">A</span>'
  const saved = `<div>${one.repeat(30)}</div>`
  assert.equal(cleanupDuplicates(`<div class="card">${twin(one)}${twin(two)}</div>`, saved), cleanupDuplicates(`<div class="card">${twin(one)}${twin(two)}</div>`), 'first twin kept, as without a saved card')
})

test('#131: SpotBoard\'s own image stamp (data-scale-context) never decides', () => {
  const twin = ctx => `<div class="t"><a href="/x">Same Headline</a><img src="https://cdn.example/img.png" data-scale-context="${ctx}"></div>`
  const html = `<div class="card">${twin('icon')}${twin('preview')}</div>`
  const saved = '<div><img data-scale-context="preview"><img data-scale-context="preview"></div>'
  assert.equal(cleanupDuplicates(html, saved), cleanupDuplicates(html))
})
