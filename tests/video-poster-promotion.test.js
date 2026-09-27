// Regression coverage for #119: captured <video> rendered as a tiny 25px box because the
// image sizing pipeline (data-scale-context) never classified <video>. First pass converted
// <video poster="URL"> into <img src="URL"> so it gets sized like a normal image. Real-world
// testing on cnn.com found the deeper problem: many sites ship <video autoplay muted loop> with
// NO poster at all, so that first pass correctly did nothing — leaving a live, playable video
// tag in the dashboard, just small enough to go unnoticed. The invariant is now stronger: no
// captured <video> tag survives this pipeline, period — it becomes an <img> (real poster), the
// site's own <img> fallback (unwrapped), or a static text placeholder. Exercised on BOTH the
// capture path (dom-snapshot.ts, live rects) and the refresh path (dom-cleanup.ts, string
// heuristics via applySanitizationPipeline).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { applySanitizationPipeline } = await import('../.test-build/utils/dom-cleanup.js')
const { promoteVideoPosters } = await import('../.test-build/utils/dom-snapshot.js')

// --- Refresh path (extractVideoPosters, via the full pipeline) ---

const run = (html, component = {}) => applySanitizationPipeline(html, component)

test('#119: video with absolute poster URL is converted to <img> with a real size tier', () => {
  // classifyImagesForRefresh's string heuristics classify this some real tier (not the video's
  // own dropped width/height) — the point is it's no longer the old hardcoded 'icon'/tiny tier
  const html = '<div><video poster="https://cdn.cnn.com/thumb.jpg" width="360" height="240"><source src="https://cdn.cnn.com/clip.mp4"></video></div>'
  const out = run(html, { url: 'https://www.cnn.com/section' })
  assert.equal(/<video/i.test(out), false, 'video tag should be gone')
  assert.match(out, /<img[^>]+src="https:\/\/cdn\.cnn\.com\/thumb\.jpg"/)
  assert.match(out, /data-spotboard-source="video-poster"/)
  assert.match(out, /data-scale-context="(?!icon")[a-z]+"/, 'must not be classified as the old hardcoded tiny tier')
})

test('#119: relative poster URL resolves against component.url', () => {
  const html = '<div><video poster="/img/thumb.jpg"></video></div>'
  const out = run(html, { url: 'https://www.cnn.com/section/page' })
  assert.match(out, /src="https:\/\/www\.cnn\.com\/img\/thumb\.jpg"/)
})

test('#119: data-poster lazy-load fallback is used when poster attribute is absent', () => {
  const html = '<div><video data-poster="https://cdn.cnn.com/lazy-thumb.jpg"></video></div>'
  const out = run(html, { url: 'https://www.cnn.com/section' })
  assert.match(out, /src="https:\/\/cdn\.cnn\.com\/lazy-thumb\.jpg"/)
})

test('#119: video with no poster or data-poster (e.g. CNN autoplay-loop clips) becomes a static placeholder, never a <video> tag', () => {
  const html = '<div><video autoplay muted loop><source src="https://cdn.cnn.com/clip.mp4"></video></div>'
  const out = run(html, { url: 'https://www.cnn.com/section' })
  assert.equal(/<video/i.test(out), false, 'no captured video may ever survive as a live <video> tag')
  assert.equal(/autoplay|loop/i.test(out), false, 'no autoplay/loop attribute may survive in any form')
  assert.match(out, /data-spotboard-source="video-placeholder"/)
})

test('#119: malformed poster URL falls back to the static placeholder, not a live video tag', () => {
  const html = '<div><video poster="not a url::" autoplay></video></div>'
  const out = run(html) // no component.url — relative/malformed poster can't resolve
  assert.equal(/<video/i.test(out), false)
  assert.match(out, /data-spotboard-source="video-placeholder"/)
})

test('#119: video with a real <img> fallback child is unwrapped to just that <img> (site-provided fallback wins, video tag still removed)', () => {
  const html = '<div><video poster="https://cdn.cnn.com/thumb.jpg" autoplay><img src="https://cdn.cnn.com/site-fallback.jpg"></video></div>'
  const out = run(html, { url: 'https://www.cnn.com/section' })
  assert.equal(/<video/i.test(out), false)
  assert.match(out, /<img[^>]+src="https:\/\/cdn\.cnn\.com\/site-fallback\.jpg"/)
})

test('#119: a wrapping <a> link back to the source survives the conversion', () => {
  const html = '<a href="https://www.cnn.com/2026/09/27/cctv-clip"><video poster="https://cdn.cnn.com/thumb.jpg"></video></a>'
  const out = run(html, { url: 'https://www.cnn.com/section' })
  assert.match(out, /<a href="https:\/\/www\.cnn\.com\/2026\/09\/27\/cctv-clip">\s*<img/)
})

test('#119: a wrapping <a> link back to the source survives the existing-<img>-fallback unwrap path', () => {
  const html = '<a href="https://www.cnn.com/2026/09/27/cctv-clip"><video poster="https://cdn.cnn.com/thumb.jpg" autoplay><img src="https://cdn.cnn.com/site-fallback.jpg"></video></a>'
  const out = run(html, { url: 'https://www.cnn.com/section' })
  assert.match(out, /<a href="https:\/\/www\.cnn\.com\/2026\/09\/27\/cctv-clip">\s*<img/)
  assert.match(out, /site-fallback\.jpg/)
})

test('#119: a wrapping <a> link back to the source survives even the no-poster placeholder path', () => {
  const html = '<a href="https://www.cnn.com/2026/09/27/cctv-clip"><video autoplay muted loop></video></a>'
  const out = run(html, { url: 'https://www.cnn.com/section' })
  assert.match(out, /<a href="https:\/\/www\.cnn\.com\/2026\/09\/27\/cctv-clip">\s*<span/)
})

// --- Capture path (promoteVideoPosters, live DOM rects) ---

function capture(html, height) {
  const root = document.createElement('div')
  root.innerHTML = html
  const video = root.querySelector('video')
  video.getBoundingClientRect = () => ({ width: 300, height, top: 0, left: 0, right: 300, bottom: height })
  promoteVideoPosters(root, 'capture')
  return root
}

test('#119 capture path: tall poster (>=200px live rect) classifies as preview', () => {
  const root = capture('<video poster="https://cdn.cnn.com/thumb.jpg"></video>', 220)
  const img = root.querySelector('img')
  assert.ok(img, 'video should have been promoted to img')
  assert.equal(img.getAttribute('data-scale-context'), 'preview')
  assert.equal(img.getAttribute('src'), 'https://cdn.cnn.com/thumb.jpg')
})

test('#119 capture path: medium-height poster (100-199px) classifies as medium, not the old tiny tier', () => {
  const root = capture('<video poster="https://cdn.cnn.com/thumb.jpg"></video>', 150)
  assert.equal(root.querySelector('img').getAttribute('data-scale-context'), 'medium')
})

test('#119 capture path: small poster (<100px) classifies as thumbnail', () => {
  const root = capture('<video poster="https://cdn.cnn.com/thumb.jpg"></video>', 60)
  assert.equal(root.querySelector('img').getAttribute('data-scale-context'), 'thumbnail')
})

test('#119 capture path: detached clone with no live rect falls back to data-bg-h (pre-clone stamp)', () => {
  const root = document.createElement('div')
  root.innerHTML = '<video poster="https://cdn.cnn.com/thumb.jpg" data-bg-h="210"></video>'
  const video = root.querySelector('video')
  video.getBoundingClientRect = () => ({ width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 })
  promoteVideoPosters(root, 'capture')
  assert.equal(root.querySelector('img').getAttribute('data-scale-context'), 'preview')
})

test('#119 capture path: video with an existing <img> fallback child is unwrapped to just that <img>', () => {
  const root = capture('<video poster="https://cdn.cnn.com/thumb.jpg"><img src="https://cdn.cnn.com/site-fallback.jpg"></video>', 220)
  assert.equal(root.querySelector('video'), null)
  assert.equal(root.querySelectorAll('img').length, 1)
  assert.equal(root.querySelector('img').getAttribute('src'), 'https://cdn.cnn.com/site-fallback.jpg')
})

test('#119 capture path: a wrapping <a> link survives the existing-<img>-fallback unwrap path', () => {
  const root = document.createElement('div')
  root.innerHTML = '<a href="https://www.cnn.com/2026/09/27/cctv-clip"><video poster="https://cdn.cnn.com/thumb.jpg" autoplay><img src="https://cdn.cnn.com/site-fallback.jpg"></video></a>'
  root.querySelector('video').getBoundingClientRect = () => ({ width: 300, height: 220, top: 0, left: 0, right: 300, bottom: 220 })
  promoteVideoPosters(root, 'capture')
  assert.equal(root.querySelector('video'), null)
  const a = root.querySelector('a')
  assert.equal(a.getAttribute('href'), 'https://www.cnn.com/2026/09/27/cctv-clip')
  assert.equal(a.querySelector('img')?.getAttribute('src'), 'https://cdn.cnn.com/site-fallback.jpg')
})

test('#119 capture path: no-poster autoplay video (CNN pattern) becomes a static placeholder, never a <video> tag', () => {
  const root = capture('<video autoplay muted loop><source src="https://media.cnn.com/clip.mp4"></video>', 364)
  assert.equal(root.querySelector('video'), null, 'no captured video may ever survive as a live <video> tag')
  const placeholder = root.querySelector('[data-spotboard-source="video-placeholder"]')
  assert.ok(placeholder, 'a static placeholder must replace the unconvertible video')
  assert.equal(placeholder.tagName, 'SPAN')
})
