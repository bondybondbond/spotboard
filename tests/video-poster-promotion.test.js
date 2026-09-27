// Regression coverage for #119: captured <video> rendered as a tiny 25px box because the
// image sizing pipeline (data-scale-context) never classified <video>. Fix converts a captured
// <video poster="URL"> into a plain <img src="URL"> before that pipeline runs, so it gets the
// same sizing treatment as a normal image, on BOTH the capture path (dom-snapshot.ts, live rects)
// and the refresh path (dom-cleanup.ts, string heuristics via applySanitizationPipeline).
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

test('#119: video with no poster or data-poster is left untouched (existing fallback)', () => {
  const html = '<div><video><source src="https://cdn.cnn.com/clip.mp4"></video></div>'
  const out = run(html, { url: 'https://www.cnn.com/section' })
  assert.equal(/<video/i.test(out), true, 'video tag should remain — no usable poster')
  assert.equal(/<img/i.test(out), false)
})

test('#119: malformed poster URL is left untouched rather than promoted', () => {
  const html = '<div><video poster="not a url::"></video></div>'
  const out = run(html) // no component.url — relative/malformed poster can't resolve
  assert.equal(/<video/i.test(out), true)
})

test('#119: video that already has a real <img> fallback child is left untouched (site-provided fallback wins)', () => {
  const html = '<div><video poster="https://cdn.cnn.com/thumb.jpg"><img src="https://cdn.cnn.com/site-fallback.jpg"></video></div>'
  const out = run(html, { url: 'https://www.cnn.com/section' })
  assert.equal(/<video/i.test(out), true)
  assert.match(out, /site-fallback\.jpg/)
})

test('#119: a wrapping <a> link back to the source survives the conversion', () => {
  const html = '<a href="https://www.cnn.com/2026/09/27/cctv-clip"><video poster="https://cdn.cnn.com/thumb.jpg"></video></a>'
  const out = run(html, { url: 'https://www.cnn.com/section' })
  assert.match(out, /<a href="https:\/\/www\.cnn\.com\/2026\/09\/27\/cctv-clip">\s*<img/)
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

test('#119 capture path: video with an existing <img> fallback child is left untouched', () => {
  const root = capture('<video poster="https://cdn.cnn.com/thumb.jpg"><img src="https://cdn.cnn.com/site-fallback.jpg"></video>', 220)
  assert.equal(root.querySelector('video') !== null, true)
  assert.equal(root.querySelectorAll('img').length, 1)
})
