// #222: small logos styled `w-11 h-11 object-cover` came back from a refresh as `preview` (200px) because
// the class-name guess read "cover" inside `object-cover` as a hero signal. A small size the page declares
// through Tailwind utilities on the image itself is now a ceiling on that guess: it can lower a tier, never raise one.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { classifyImagesForRefresh } = await import('../.test-build/utils/dom-cleanup.js')

// Static fixture markup only. Returns the tier the refresh classifier gives the single <img>.
const tier = (imgHtml, wrapper = '<div class="flex items-center gap-3">') => {
  const out = classifyImagesForRefresh(`${wrapper}${imgHtml}</div>`)
  return out.match(/data-scale-context="(\w+)"/)?.[1]
}
const img = (cls, extra = '') => `<img src="https://example.com/photos/a.jpg" alt="" class="${cls}" ${extra}>`

test('#222: the reported logo (w-11 h-11 object-cover, no size attrs) is small, not preview', () => {
  assert.equal(tier(img('w-11 h-11 rounded-lg object-cover border border-gray-200')), 'small')
})

test('#222: size formats - plain scale, size-N, arbitrary px/rem, important, responsive growth within small', () => {
  assert.equal(tier(img('h-8 w-8 object-cover')), 'icon')           // 32px, capture says icon (< 40)
  assert.equal(tier(img('size-10 object-cover')), 'small')          // 40px, capture says small (not < 40)
  assert.equal(tier(img('size-11 object-cover')), 'small')
  assert.equal(tier(img('w-[44px] h-[44px] object-cover')), 'small')
  assert.equal(tier(img('w-[2.75rem] h-[2.75rem] object-cover')), 'small')
  assert.equal(tier(img('!w-11 !h-11 object-cover')), 'small')
  assert.equal(tier(img('w-16 h-16 object-cover')), 'small')        // 64px
  assert.equal(tier(img('h-11 w-11 sm:h-14 sm:w-14 object-cover')), 'small') // 44 -> 56, still small
  assert.equal(tier(img('h-8 w-auto object-cover')), 'icon')        // logo sized by height only
  assert.equal(tier(img('w-8 h-11 object-cover')), 'icon')          // 32x44 = 1408px area < 1600, like capture
  assert.equal(tier(img('w-14 h-11 object-cover')), 'small')        // 56x44
  assert.equal(tier(img('w-11 object-cover')), 'small')             // width only
})

test('#222: negative - an image the page does not clearly size small keeps its tier (still preview)', () => {
  assert.equal(tier(img('w-full h-64 object-cover')), 'preview')
  assert.equal(tier(img('aspect-video w-full object-cover rounded-xl')), 'preview')
  assert.equal(tier(img('w-full h-10 object-cover')), 'preview')          // thin strip: width is not small
  assert.equal(tier(img('w-1/2 h-8 object-cover')), 'preview')
  assert.equal(tier(img('w-24 h-24 object-cover')), 'preview')            // 96px is not small
  assert.equal(tier(img('w-[70px] h-[70px] object-cover')), 'preview')    // boundary: 70px is not < 70
  assert.equal(tier(img('w-11 h-11 sm:h-24 sm:w-24 object-cover')), 'preview') // grows large on wider screens
  assert.equal(tier(img('w-11 md:w-full object-cover')), 'preview')
  assert.equal(tier(img('w-11 h-11 md:w-auto md:h-auto object-cover')), 'preview') // reverts to natural size on wider screens
  assert.equal(tier(img('w-11 h-11 md:size-auto object-cover')), 'preview')
  assert.equal(tier(img('w-11 h-full object-cover')), 'preview')          // height not a fixed number: no opinion
  assert.equal(tier(img('w-11! h-11! object-cover')), 'preview')          // Tailwind v4 trailing-! form is not read
  assert.equal(tier(img('hero-img object-cover w-11')), 'small')          // explicit small size wins over the word
  assert.equal(tier(img('hero-img')), 'preview')
  assert.equal(tier(img('object-cover')), 'preview')                      // no size -> unchanged
  assert.equal(tier(img('w-px h-px object-cover')), 'preview')            // < 8px is a spacer, not read
})

test('#222: only lowers - icon/thumbnail/other guesses are not raised, other size classes are ignored', () => {
  assert.equal(tier(img('avatar w-11 h-11')), 'icon')          // class-name icon stays icon (not raised to small)
  assert.equal(tier(img('max-w-8 max-h-8 min-w-8 object-cover')), 'preview') // max/min are not a fixed size
  assert.equal(tier(img('w-11 h-11 object-cover'), '<article class="card">'), 'small')
  assert.equal(tier(img('thumb-img')), 'thumbnail')
})

test('#222: real width/height attributes still take priority over class sizes', () => {
  assert.equal(tier(img('w-11 h-11 object-cover', 'width="300" height="300"')), 'preview')
  assert.equal(tier(img('w-full h-64 object-cover', 'width="30" height="30"')), 'icon')
})

test('#222: a tier captured as small survives a refresh on the reported markup; other captured tiers untouched', () => {
  assert.equal(tier(img('w-11 h-11 object-cover', 'data-scale-context="small"')), 'small')
  assert.equal(tier(img('w-full h-64 object-cover', 'data-scale-context="preview"')), 'preview')
  assert.equal(tier(img('w-11 h-11 object-cover', 'data-scale-context="medium"')), 'medium')
})

test('#222: HotUKDeals-style product images (no Tailwind sizing) are unchanged', () => {
  const huk = '<img src="https://images.hotukdeals.com/threads/raw/abc/1_1/re/300x300/qt/60/abc.jpg" alt="Deal" class="thread-image img--responsive" data-scale-context="thumbnail">'
  assert.equal(tier(huk, '<article class="thread">'), 'thumbnail')
  const hukBare = '<img src="https://images.hotukdeals.com/threads/raw/abc/1_1/re/300x300/qt/60/abc.jpg" alt="Deal" class="thread-image img--responsive">'
  assert.equal(tier(hukBare, '<article class="thread">'), 'medium') // HEURISTIC 5, same as before the change
})
