// Regression coverage for #138: on NPR, older "evergreen" stories render their square and wide crops as
// DIFFERENT image files (`..._sq-<hash>.jpg` / `..._wide-<hash>.jpg`). The refresh dedup keys twins on the
// lead image, so those pairs were never compared and tier-1 refresh (no CSS) showed both pictures.
// Fixture: one real npr.org homepage story (2026-10-07) with exactly that shape.
// The rule (isVariantTwin) is generic -- same link, text and alt, different class set, different image --
// and only collapses a pair when the saved card clearly favours one variant (>= 3x, and at least 6 in absolute terms;
// a toss-up, no saved card, or a lone state class leaves the pair alone: a gallery must never lose a picture).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { cleanupDuplicates } = await import('../.test-build/utils/dom-cleanup.js')

const story = fs.readFileSync(new URL('./fixtures/npr-legacy-different-file-twins.html', import.meta.url), 'utf8')

const dropFigure = (html, cls) => {
  const t = document.createElement('div')
  t.innerHTML = html
  t.querySelectorAll(`figure.c-promo-card__image--${cls}`).forEach(f => f.remove())
  return t.innerHTML
}
const variants = html => {
  const t = document.createElement('div')
  t.innerHTML = html
  return {
    square: t.querySelectorAll('figure.c-promo-card__image--square').length,
    wide: t.querySelectorAll('figure.c-promo-card__image--wide').length,
    imgs: t.querySelectorAll('img').length,
  }
}

test('fixture is the failing shape: two figures, different image files, same alt', () => {
  const t = document.createElement('div')
  t.innerHTML = story
  const imgs = Array.from(t.querySelectorAll('figure')).map(f => f.querySelector('img'))
  assert.equal(imgs.length, 2)
  assert.notEqual(imgs[0].getAttribute('src'), imgs[1].getAttribute('src'))
  assert.equal(imgs[0].alt, imgs[1].alt)
})

test('#138: saved card holds the square -> refresh keeps one picture, the square', () => {
  const out = variants(cleanupDuplicates(story, dropFigure(story, 'wide').repeat(3)))
  assert.deepEqual([out.square, out.wide], [1, 0])
})

test('#138: saved card holds the wide -> refresh keeps one picture, the wide (saved variant wins, not document order)', () => {
  const out = variants(cleanupDuplicates(story, dropFigure(story, 'square').repeat(3)))
  assert.deepEqual([out.square, out.wide], [0, 1])
})

test('#138: saved card is mostly wide AND still holds this very pair doubled (what the bug itself saved) -> collapses to the wide', () => {
  const saved = dropFigure(story, 'square').repeat(9) + story
  const out = variants(cleanupDuplicates(story, saved))
  assert.deepEqual([out.square, out.wide], [0, 1])
})

test('#138 safety net: saved card is a toss-up (as many square-only as wide-only stories) -> pair left alone', () => {
  const saved = dropFigure(story, 'square').repeat(3) + dropFigure(story, 'wide').repeat(3)
  const out = variants(cleanupDuplicates(story, saved))
  assert.deepEqual([out.square, out.wide], [1, 1])
})

test('#138 safety net: saved card holds BOTH variants -> pair left alone', () => {
  const out = variants(cleanupDuplicates(story, story))
  assert.deepEqual([out.square, out.wide], [1, 1])
})

const savedMix = (wide, square) => dropFigure(story, 'square').repeat(wide) + dropFigure(story, 'wide').repeat(square)

test('#138 safety net: dominance boundary -- saved favours the wide 3:1 -> collapses, 2.5:1 -> left alone', () => {
  assert.equal(variants(cleanupDuplicates(story, savedMix(6, 2))).square, 0)
  assert.equal(variants(cleanupDuplicates(story, savedMix(5, 2))).square, 1)
})

test('#138 safety net: evidence floor -- one-sided saved evidence needs a pattern (3 stories), not one or two', () => {
  assert.equal(variants(cleanupDuplicates(story, savedMix(3, 0))).square, 0)
  assert.equal(variants(cleanupDuplicates(story, savedMix(2, 0))).square, 1)
})

test('#138 safety net: no saved card -> pair left alone (pre-#138 behaviour)', () => {
  const out = variants(cleanupDuplicates(story))
  assert.deepEqual([out.square, out.wide], [1, 1])
})

const gallery = ({ alt = () => 'Same alt', caption = () => 'Same caption', cls = i => `slide s${i}`, link = () => '/story', extra = () => '' } = {}) =>
  `<div class="gallery">${[1, 2, 3].map(i => `<figure class="${cls(i)}"${extra(i)}><a href="${link(i)}"><img src="https://img.example/gallery-photo-${i}-full.jpg" alt="${alt(i)}"></a><figcaption>${caption(i)}</figcaption></figure>`).join('')}</div>`
// Saved card = the gallery's first slide + 6 elements carrying slide 1's distinguishing marker, i.e. STRONG saved-card
// evidence (score 6 vs 0, past the floor and the dominance ratio). With it, only the structural conditions of the
// twin rule itself stand between the pair and a collapse -- which is what each negative below pins.
const firstFigureOnly = html => html.replace(/<figure[\s\S]*?<\/figure>/g, (m, off, s) => (s.indexOf('<figure') === off ? m : ''))
const strongEvidence = (html, marker) => firstFigureOnly(html) + `<i ${marker}></i>`.repeat(6)
const imgsAfter = (html, marker) => variants(cleanupDuplicates(html, strongEvidence(html, marker))).imgs

test('#138 control: the same gallery shape DOES collapse when every condition holds (proves the negatives below are not vacuous)', () => {
  const html = gallery()
  assert.equal(imgsAfter(html, 'class="s1"'), 1)
})

test('#138 negative: different ALT per image is not collapsed (caption, link, classes all match)', () => {
  assert.equal(imgsAfter(gallery({ alt: i => `Photo ${i}` }), 'class="s1"'), 3)
})

test('#138 negative: different CAPTION per image is not collapsed (alt, link, classes all match)', () => {
  assert.equal(imgsAfter(gallery({ caption: i => `Caption ${i}` }), 'class="s1"'), 3)
})

test('#138 negative: carousel whose first slide carries a state class (is-active) but captions differ is not collapsed', () => {
  const html = gallery({ cls: i => (i === 1 ? 'slide is-active' : 'slide'), caption: i => `Caption ${i}` })
  assert.equal(imgsAfter(html, 'class="is-active"'), 3)
})

test('#138 negative: empty ALT never qualifies, even with the same caption and different classes', () => {
  assert.equal(imgsAfter(gallery({ alt: () => '' }), 'class="s1"'), 3)
})

test('#138 negative: empty CAPTION (no text) never qualifies, even with the same alt and different classes', () => {
  assert.equal(imgsAfter(gallery({ caption: () => '' }), 'class="s1"'), 3)
})

test('#138 negative: IDENTICAL classes, only a data-* attribute differs -> no class-level variant marker, not collapsed', () => {
  const html = gallery({ cls: () => 'slide', extra: i => ` data-crop="v${i}"` })
  assert.equal(imgsAfter(html, 'data-crop="v1"'), 3)
})

test('#138 negative: same alt + caption + different classes but DIFFERENT links are not collapsed', () => {
  assert.equal(imgsAfter(gallery({ link: i => `/story-${i}` }), 'class="s1"'), 3)
})

test('#138 negative: a lone state class in the saved card (score 1) cannot license a collapse (evidence floor)', () => {
  const html = gallery()
  assert.equal(variants(cleanupDuplicates(html, html)).imgs, 3)
  const lone = firstFigureOnly(html) + '<i class="s1"></i>'
  assert.equal(variants(cleanupDuplicates(html, lone)).imgs, 3)
})

test('#138 negative: images with no link of their own are not bucketed on a link elsewhere in the parent', () => {
  const fig = (cls, n) => `<figure class="${cls}"><img src="https://img.example/own-photo-${n}-full.jpg" alt="Same alt">Same credit</figure>`
  const a = 'a1 a2 a3 a4 a5 a6 a7', b = 'b1 b2 b3 b4 b5 b6 b7'
  const html = `<div>${fig(a, 1)}${fig(b, 2)}<a href="/elsewhere">more</a></div>`
  const saved = `<div>${fig(a, 1)}</div>`.repeat(4)
  assert.equal(variants(cleanupDuplicates(html, saved)).imgs, 2)
})
