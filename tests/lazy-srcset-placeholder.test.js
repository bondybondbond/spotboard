// Regression coverage for #86: Sky Sports ships <source srcset="data:image/png;base64,..."> (a 1x1
// placeholder) next to the real data-srcset. The old "copy data-srcset only when srcset is empty"
// guard skipped it, so refreshed cards rendered 1x1 dots instead of images.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { fixRelativeUrls, classifyImagesForRefresh } = await import('../.test-build/utils/dom-cleanup.js')

const PLACEHOLDER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII='
const REAL = 'https://e0.365dm.com/26/09/384x216/a.jpg 400w, https://e0.365dm.com/26/09/768x432/a.jpg 1000w'

// Static fixture markup only — parsed via DOMParser, never injected into a live page.
const run = (html) => {
  const container = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html').body.firstElementChild
  fixRelativeUrls(container, 'https://www.skysports.com/football')
  return container
}

test('#86: <source> with data: placeholder srcset gets the real data-srcset', () => {
  const c = run(`<picture><source srcset="${PLACEHOLDER}" data-srcset="${REAL}"><img src="https://e0.365dm.com/a.jpg"></picture>`)
  assert.equal(c.querySelector('source').getAttribute('srcset'), REAL)
})

test('#86: <img> with data: placeholder srcset gets the real data-srcset', () => {
  const c = run(`<img src="https://e0.365dm.com/a.jpg" srcset="${PLACEHOLDER}" data-srcset="${REAL}">`)
  assert.equal(c.querySelector('img').getAttribute('srcset'), REAL)
})

test('an already-real srcset is never overwritten by data-srcset', () => {
  const c = run(`<picture><source srcset="https://x.com/keep.jpg" data-srcset="${REAL}"><img src="https://x.com/keep.jpg"></picture>`)
  assert.equal(c.querySelector('source').getAttribute('srcset'), 'https://x.com/keep.jpg')
})

test('empty srcset still gets data-srcset (ESPN behaviour preserved)', () => {
  const c = run(`<picture><source data-srcset="${REAL}"><img src="https://x.com/a.jpg"></picture>`)
  assert.equal(c.querySelector('source').getAttribute('srcset'), REAL)
})

// The real regression path: the refresh pipeline flattens <picture> BEFORE the dashboard runs
// fixRelativeUrls, and used to flatten to the data: placeholder while deleting the real sources.
const skyPicture = `<div><picture><source srcset="${PLACEHOLDER}" data-srcset="${REAL}" sizes="100vw"><img src="${PLACEHOLDER}" class="sdc-site-tile__image" data-lazy></picture></div>`

test('#86: refresh pipeline flattens a Sky <picture> to the real URL, never the placeholder', () => {
  const out = classifyImagesForRefresh(skyPicture)
  assert.match(out, /src="https:\/\/e0\.365dm\.com\/26\/09\/\d+x\d+\/a\.jpg"/)
  assert.doesNotMatch(out, /<img[^>]*src="data:/)
})

test('#86: a <picture> with only placeholder sources is left untouched, not flattened to data:', () => {
  const html = `<div><picture><source srcset="${PLACEHOLDER}"><img src="https://x.com/real.jpg"></picture></div>`
  const out = classifyImagesForRefresh(html)
  assert.match(out, /<img[^>]*src="https:\/\/x\.com\/real\.jpg"/)
})
