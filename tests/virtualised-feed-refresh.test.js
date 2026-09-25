// #111: react-virtuoso feeds (Peerlist Scroll) mount only the rows that fit the viewport AT LOAD:
// measured 911px -> 2 rows / 13 imgs, 300px -> 1 row / 6 imgs, ~1px -> 0 rows (an empty list div).
// So a thin or blank capture is normal for this class, and the existing guards must (a) reject the
// blank against a saved copy and keep the last good one, (b) NOT reject a legit thinner render.
// This pins that behaviour with an anonymised real fragment (tests/fixtures/virtuoso-feed.html).
// No new gate was added: viewport-driven variation (ratio 0.35-0.5) can't be separated from
// degradation by any threshold.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
const { isContentLost } = await import('../.test-build/utils/dom-cleanup.js')

const full = fs.readFileSync(new URL('./fixtures/virtuoso-feed.html', import.meta.url), 'utf8')
const holder = document.createElement('div')
holder.innerHTML = full
const list = holder.firstElementChild
const oneRow = list.cloneNode(false)
oneRow.appendChild(list.children[0].cloneNode(true))
const empty = list.cloneNode(false)
const imgs = html => (html.match(/<img/gi) || []).length

test('fixture is a 2-row virtualised list with images', () => {
  assert.equal(list.children.length, 2)
  assert.ok(imgs(full) >= 5)
})

test('blank list (zero-size viewport) vs full saved copy is rejected -> last good kept', () => {
  assert.equal(isContentLost(empty.outerHTML, full), true)
})

test('blank list vs a 1-row saved copy is also rejected', () => {
  assert.equal(isContentLost(empty.outerHTML, oneRow.outerHTML), true)
})

test('legit thinner render (1 row vs 2 saved) is accepted by the content-loss guard', () => {
  assert.equal(isContentLost(oneRow.outerHTML, full), false)
})

test('#101 image gate: 1-row candidate vs 2-row saved passes even hidden (ratio above 0.4)', () => {
  const r = g.assessCaptureQuality(oneRow.outerHTML, full, false)
  assert.equal(r.ok, true)
  assert.ok(r.ratio >= 0.4)
})

test('#101 image gate: blank candidate captured hidden is rejected', () => {
  assert.equal(g.assessCaptureQuality(empty.outerHTML, full, false).ok, false)
})
