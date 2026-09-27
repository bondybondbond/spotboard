// Regression coverage for #93: a JW Player-style video poster (CNN, NPR "Watch" carousel) is
// rendered as a sibling <div style="background-image:url(...)"> next to a posterless <video
// src="blob:...">, not as the <video>'s own poster/data-poster attribute or an <img> child.
// extractBackgroundImages() (dom-cleanup.ts) already exists to promote exactly this pattern to a
// real <img> -- its own doc comment names "JW Player .jw-preview" as a target use case -- but
// cleanupDuplicates()'s "is this wrapper empty, safe to remove" heuristic ran BEFORE it in the
// pipeline and only checked for img/a/svg/video children, not a CSS background-image. A
// background-image-only div has none of those, so it read as "just a spacing wrapper" and was
// deleted whole, stranding extractBackgroundImages with nothing left to promote. Confirmed live
// against npr.org's and cnn.com's actual JW Player markup (not just this synthetic fixture) --
// both sites' real poster div vanished from the stored capture before this fix, leaving only the
// #119 "Video (preview unavailable)" placeholder with no image at all.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { cleanupDuplicates, applySanitizationPipeline } = await import('../.test-build/utils/dom-cleanup.js')
const { promoteBackgroundImages, promoteVideoPosters } = await import('../.test-build/utils/dom-snapshot.js')

test('#93: a background-image-only div (JW Player .jw-preview pattern) survives cleanupDuplicates\' empty-wrapper removal', () => {
  const html = '<div class="jw-preview" style="background-image: url(&quot;https://npr.brightspotcdn.com/thumb.jpg&quot;); background-size: cover;"></div>'
  const out = cleanupDuplicates(html)
  assert.match(out, /class="jw-preview"/, 'the background-image div must not be deleted as an empty wrapper')
})

test('#93: multi-layer background-image (gradient + photo) is still treated as empty by cleanupDuplicates, matching extractBackgroundImages\' own promotion guard', () => {
  const html = '<div class="overlay" style="background-image: linear-gradient(rgba(0,0,0,.4),rgba(0,0,0,.4)), url(https://cdn.example.com/bg.jpg);"></div>'
  const out = cleanupDuplicates(html)
  assert.equal(/class="overlay"/.test(out), false, 'multi-layer backgrounds are not promotable, so the existing empty-wrapper removal still applies')
})

// Real npr.org JW Player nesting, confirmed live (not a flat sibling guess): <video> and its
// .jw-preview poster div are COUSINS -- both sit two levels up, under a shared .jw-wrapper --
// <div class="jw-wrapper"><div class="jw-media"><video></video></div><div class="jw-preview" .../></div></div>
const JW_PLAYER_HTML = '<div class="jw-wrapper"><div class="jw-media"><video class="jw-video" src="blob:https://www.npr.org/abc"></video></div><div class="jw-preview" style="background-image: url(https://npr.brightspotcdn.com/thumb.jpg);"></div></div>'

test('#93 end-to-end: JW Player video (posterless <video>, cousin .jw-preview poster div) promotes the real poster instead of losing it', () => {
  const out = applySanitizationPipeline(JW_PLAYER_HTML, { url: 'https://www.npr.org/section' })
  assert.equal(/<video/i.test(out), false, 'no <video> tag may survive (#119 invariant)')
  assert.match(out, /<img[^>]+src="https:\/\/npr\.brightspotcdn\.com\/thumb\.jpg"/, 'the real poster must be promoted to a real <img>, not lost')
  assert.equal(/preview unavailable/.test(out), false, 'no redundant placeholder text when a real poster is already showing alongside the video')
})

test('#93 capture path: JW Player video (posterless <video>, cousin .jw-preview poster div) promotes the real poster instead of a redundant placeholder', () => {
  const root = document.createElement('div')
  root.innerHTML = JW_PLAYER_HTML
  promoteBackgroundImages(root, 'capture')
  promoteVideoPosters(root, 'capture')
  assert.equal(root.querySelector('video'), null, 'no <video> tag may survive (#119 invariant)')
  assert.equal(root.querySelector('img')?.getAttribute('src'), 'https://npr.brightspotcdn.com/thumb.jpg', 'the real poster must be promoted to a real <img>, not lost')
  assert.equal(root.querySelector('[data-spotboard-source="video-placeholder"]'), null, 'no redundant placeholder text when a real poster is already showing alongside the video')
})

test('#93: an unrelated image far outside the video\'s nearby ancestors does NOT suppress the placeholder (bounded search, not unbounded)', () => {
  const html = '<div class="card"><div class="sidebar"><img src="https://cdn.example.com/other-item-thumb.jpg"></div><div class="jw-wrapper"><div class="jw-media"><video autoplay muted loop><source src="https://cdn.example.com/clip.mp4"></video></div></div></div>'
  const out = applySanitizationPipeline(html, { url: 'https://www.npr.org/section' })
  assert.equal(/<video/i.test(out), false, 'no <video> tag may survive (#119 invariant)')
  assert.match(out, /preview unavailable/, 'a genuinely unavailable poster still gets the placeholder -- an unrelated far-away image must not suppress it')
})

// Cold-review catch #1: a shorthand-authored poster (`background: url(...) center/cover no-repeat`)
// contains the substring "background" but not "background-image" -- the old gates/selectors and the
// strip-dangerous-backgrounds exemption regex all silently dropped it, reproducing #93 via a
// different spelling of the exact same CSS property.
const JW_PLAYER_SHORTHAND_HTML = '<div class="jw-wrapper"><div class="jw-media"><video class="jw-video" src="blob:https://www.npr.org/abc"></video></div><div class="jw-preview" style="background: url(https://npr.brightspotcdn.com/thumb.jpg) center / cover no-repeat;"></div></div>'

test('#93: a shorthand `background:` poster (not `background-image:`) survives cleanupDuplicates\' dangerous-background strip', () => {
  const out = cleanupDuplicates('<div class="jw-preview" style="background: url(https://npr.brightspotcdn.com/thumb.jpg) center / cover no-repeat;"></div>')
  assert.match(out, /background/i, 'a promotable shorthand background must not be stripped just because it is not the background-image longhand')
})

test('#93 end-to-end: shorthand `background:` JW Player poster still promotes to a real <img>', () => {
  const out = applySanitizationPipeline(JW_PLAYER_SHORTHAND_HTML, { url: 'https://www.npr.org/section' })
  assert.equal(/<video/i.test(out), false, 'no <video> tag may survive (#119 invariant)')
  assert.match(out, /<img[^>]+src="https:\/\/npr\.brightspotcdn\.com\/thumb\.jpg"/, 'the shorthand-authored poster must still be promoted to a real <img>')
  assert.equal(/preview unavailable/.test(out), false, 'no redundant placeholder text when a real poster is already showing alongside the video')
})

// Cold-review catch #2: hasNearbyPromotedPoster() matched ANY <img> within 2 ancestor levels, not
// specifically the poster THIS video owns -- in a multi-video container (a grid of tiles, exactly
// #93's own "Watch carousel" shape), one tile's real poster silently covered for every OTHER
// posterless tile within range, and those were removed with NO placeholder at all: a worse
// content-loss regression than the bug being fixed. The claimed-marker fix must keep each promoted
// poster tied to exactly one video.
// Both tiles' <video>s share the SAME grandparent .jw-wrapper -- this is what actually reproduces the
// bug: video B's own 2-level ancestor walk reaches into the shared wrapper and would find tile A's
// promoted poster there, if the search weren't scoped to a claimed marker.
const MULTI_VIDEO_TILE_HTML = [
  '<div class="jw-wrapper">',
  '  <div class="jw-media"><video src="blob:https://www.npr.org/a"></video></div>',
  '  <div class="jw-preview" style="background-image: url(https://npr.brightspotcdn.com/a-thumb.jpg);"></div>',
  '  <div class="jw-media"><video autoplay muted loop><source src="https://cdn.example.com/b-clip.mp4"></video></div>',
  '</div>',
].join('')

test('#93: a second, genuinely posterless video tile sharing a nearby ancestor with a FIRST tile\'s real poster still gets its own placeholder, not silent removal', () => {
  const out = applySanitizationPipeline(MULTI_VIDEO_TILE_HTML, { url: 'https://www.npr.org/section' })
  assert.equal(/<video/i.test(out), false, 'no <video> tag may survive (#119 invariant)')
  assert.match(out, /<img[^>]+src="https:\/\/npr\.brightspotcdn\.com\/a-thumb\.jpg"/, 'tile A\'s real poster must still be promoted')
  assert.match(out, /preview unavailable/, 'tile B has no poster of its own -- it must fall back to the placeholder, not silently disappear because tile A\'s poster is nearby')
})

test('#93 capture path: same multi-tile ambiguity holds on the capture path', () => {
  const root = document.createElement('div')
  root.innerHTML = MULTI_VIDEO_TILE_HTML
  promoteBackgroundImages(root, 'capture')
  promoteVideoPosters(root, 'capture')
  assert.equal(root.querySelector('video'), null, 'no <video> tag may survive (#119 invariant)')
  const imgs = [...root.querySelectorAll('img')].map(i => i.getAttribute('src'))
  assert.ok(imgs.includes('https://npr.brightspotcdn.com/a-thumb.jpg'), 'tile A\'s real poster must still be promoted')
  assert.ok(root.querySelector('[data-spotboard-source="video-placeholder"]'), 'tile B must fall back to the placeholder, not silently disappear because tile A\'s poster is nearby')
})
