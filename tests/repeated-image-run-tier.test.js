// #110: identical list images (HotUKDeals deals) came out as a random mix of thumbnail/medium because
// the container-area rule flips at the 1.3x ancestor-walk edge. harmonizeRepeatedImageRuns gives a
// same-role run of >=3 large images one shared tier (>= medium). jsdom has no layout, so rects are stubbed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { harmonizeRepeatedImageRuns, classifyImages } = await import('../.test-build/utils/dom-snapshot.js')

function img(cls, w, h, tier, parentCls = 'frame') {
  return `<span class="${parentCls}"><img class="${cls}" data-w="${w}" data-h="${h}" data-scale-context="${tier}"></span>`
}

function run(html) {
  const root = document.createElement('div')
  root.innerHTML = html
  root.querySelectorAll('img').forEach(el => {
    const w = Number(el.dataset.w), h = Number(el.dataset.h)
    el.getBoundingClientRect = () => ({ width: w, height: h, top: 0, left: 0, right: w, bottom: h })
  })
  harmonizeRepeatedImageRuns(root)
  return [...root.querySelectorAll('img')].map(el => el.getAttribute('data-scale-context'))
}

test('deal list, 27 thumbnail + 3 medium at the same 108px size → all medium', () => {
  const tiers = ['thumbnail', 'medium', 'thumbnail', 'thumbnail', 'medium', 'thumbnail']
  const html = tiers.map(t => img('thread-image', 108, 108, t)).join('')
  assert.deepEqual(run(html), tiers.map(() => 'medium'))
})

test('a run already containing a preview lifts everyone to preview, never downgrades', () => {
  assert.deepEqual(
    run(img('thread-image', 150, 150, 'preview') + img('thread-image', 150, 150, 'thumbnail') + img('thread-image', 150, 150, 'thumbnail')),
    ['preview', 'preview', 'preview']
  )
})

test('avatar run (<100px) is untouched', () => {
  const html = [1, 2, 3, 4].map(() => img('avatar', 18, 18, 'icon')).join('')
  assert.deepEqual(run(html), ['icon', 'icon', 'icon', 'icon'])
})

test('mid-size 60-90px thumbnail list is untouched', () => {
  const html = [1, 2, 3, 4].map(() => img('thumb', 80, 80, 'thumbnail')).join('')
  assert.deepEqual(run(html), ['thumbnail', 'thumbnail', 'thumbnail', 'thumbnail'])
})

test('sponsor/logo runs (Next.io: 130x54 sponsor logos) are untouched', () => {
  const html = [1, 2, 3, 4].map(() => img('sponsorship-block__sponsors-swiper-img', 130, 54, 'small')).join('')
  assert.deepEqual(run(html), ['small', 'small', 'small', 'small'])
})

test('two-item run is below the minimum group size', () => {
  assert.deepEqual(run(img('x', 120, 120, 'thumbnail') + img('x', 120, 120, 'thumbnail')), ['thumbnail', 'thumbnail'])
})

test('hero + thumbnail list: different role signature, list is not inflated by the hero', () => {
  const html = img('hero', 600, 340, 'preview', 'hero-frame') +
    [1, 2, 3].map(() => img('row-thumb', 80, 80, 'thumbnail', 'row')).join('')
  assert.deepEqual(run(html), ['preview', 'thumbnail', 'thumbnail', 'thumbnail'])
})

test('letterboxed deal images (108x61, 72x108, 108x87) join the run', () => {
  const html = img('thread-image', 108, 108, 'medium') + img('thread-image', 108, 61, 'small') +
    img('thread-image', 72, 108, 'small') + img('thread-image', 108, 87, 'thumbnail')
  assert.deepEqual(run(html), ['medium', 'medium', 'medium', 'medium'])
})

test('same class but very different sizes are not one run', () => {
  const html = img('x', 100, 400, 'thumbnail') + img('x', 100, 120, 'thumbnail') + img('x', 100, 110, 'thumbnail')
  assert.deepEqual(run(html), ['thumbnail', 'thumbnail', 'thumbnail'])
})

test('classifyImages itself applies the run rule (wiring): container-area rule alone gives thumbnails', () => {
  const root = document.createElement('div')
  root.innerHTML = [1, 2, 3, 4].map(() => '<span class="frame"><img class="deal" data-w="108" data-h="108"></span>').join('')
  const orig = window.Element.prototype.getBoundingClientRect
  window.Element.prototype.getBoundingClientRect = function () {
    // images 108x108 inside a 304x264 card-sized container → area ratio 0.15 → 'thumbnail' before the run rule
    const w = this.tagName === 'IMG' ? 108 : 304, h = this.tagName === 'IMG' ? 108 : 264
    return { width: w, height: h, top: 0, left: 0, right: w, bottom: h }
  }
  try {
    classifyImages(root)
  } finally {
    window.Element.prototype.getBoundingClientRect = orig
  }
  assert.deepEqual([...root.querySelectorAll('img')].map(e => e.getAttribute('data-scale-context')), ['medium', 'medium', 'medium', 'medium'])
})
