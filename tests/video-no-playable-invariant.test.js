// #119 invariant test: no captured <video> tag may ever survive into persisted SpotBoard
// content, through either the capture path (dom-snapshot.ts, live DOM) or the refresh path
// (dom-cleanup.ts, string heuristics) -- under ANY input, not just the specific CNN/Reddit
// patterns exercised in video-poster-promotion.test.js. This file asserts the invariant
// directly against the final persisted string/DOM (case-insensitive <video> scan), rather than
// asserting which branch fired, so it can't pass by coincidence.
//
// Cold-review note: an earlier version of this file had a "javascript: URL" case that
// coincidentally passed on the refresh path without actually exercising the intended rejection
// branch there -- applySanitizationPipeline runs stripEventHandlers() BEFORE extractVideoPosters,
// which neuters poster="javascript:..." to poster="#" first; resolving "#" against sourceUrl
// produces a string starting with "http", which used to slip past the "reject non-http" check
// as if it were a real image URL. Fixed in extractVideoPosters (dom-cleanup.ts) by rejecting
// that specific "#" sentinel outright. The capture path never had this problem (no
// stripEventHandlers step runs before promoteVideoPosters sees the live poster attribute).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { applySanitizationPipeline } = await import('../.test-build/utils/dom-cleanup.js')
const { promoteVideoPosters } = await import('../.test-build/utils/dom-snapshot.js')

const NO_VIDEO_TAG = /<video\b/i

// --- Refresh path: arbitrary/malformed <video> markup must never survive ---

const refreshCases = [
  ['no poster, autoplay/muted/loop (CNN pattern)', '<video autoplay muted loop><source src="https://cdn.example.com/clip.mp4"></video>'],
  ['poster is whitespace-only', '<video poster="   "></video>'],
  ['poster is a javascript: URL — neutered to "#" by stripEventHandlers upstream, must still reject', '<video poster="javascript:alert(1)" autoplay></video>'],
  ['poster is a data: URI (not http)', '<video poster="data:image/png;base64,abc"></video>'],
  ['only a <track> child, no poster, no img fallback', '<video autoplay><track kind="captions" src="https://cdn.example.com/cap.vtt"></video>'],
  ['img fallback child with no src attribute', '<video poster="https://cdn.example.com/thumb.jpg" autoplay><img alt="fallback"></video>'],
  ['two independent videos, one with poster one without', '<div><video poster="https://cdn.example.com/a.jpg"></video><video autoplay loop></video></div>'],
  ['video with poster AND an unrelated existing <img> sibling (not a child)', '<div><video autoplay></video><img src="https://cdn.example.com/sibling.jpg"></div>'],
  ['video nested inside a <template> (inert content, not live-queryable the normal way)', '<template><video autoplay muted loop><source src="https://cdn.example.com/clip.mp4"></video></template>'],
  ['video nested inside a <noscript> block', '<noscript><video autoplay muted loop><source src="https://cdn.example.com/clip.mp4"></video></noscript>'],
]

for (const [label, html] of refreshCases) {
  test(`#119 invariant (refresh path): ${label} -> no <video> tag survives`, () => {
    const out = applySanitizationPipeline(html, { url: 'https://www.example.com/section' })
    assert.equal(NO_VIDEO_TAG.test(out), false, `persisted HTML still contains a <video> tag:\n${out}`)
    assert.equal(/\bautoplay\b|\bloop\b/i.test(out), false, 'no autoplay/loop attribute may survive in any form')
  })
}

// KNOWN, PRE-EXISTING, OUT-OF-SCOPE-FOR-#119 LIMITATION (found by cold review, documented not
// fixed here): cleanupDuplicates()'s "is this wrapper/<li> empty, safe to remove" heuristic
// (dom-cleanup.ts's hasVideo checks) uses plain querySelector('video'), which can't see inside a
// <template>'s inert .content either -- and cleanupDuplicates runs BEFORE extractVideoPosters in
// the pipeline. So a wrapper whose ONLY content is a template-wrapped video reads as "empty" and
// is deleted whole, template and video included, before #119's video-safety logic ever runs.
// This does NOT violate the safety invariant (no <video> tag survives -- there's no video at
// all, playable or not), it's a silent content-loss bug in a different, pre-existing function,
// and it already existed before #119 touched anything (querySelector's template-blindness is
// not new). Fixing cleanupDuplicates's empty-detection to be template-aware is a separate,
// higher-risk change to an already-intricate function with many site-specific special cases --
// tracked as a follow-up issue rather than folded into this fix.
test('#119 KNOWN LIMITATION (not fixed here, tracked separately): a template-wrapped video with no other content in its wrapper is silently deleted by cleanupDuplicates before the video-safety pass ever sees it', () => {
  const html = '<li class="slide"><template><video autoplay poster="https://cdn.example.com/thumb.jpg"><source src="https://cdn.example.com/clip.mp4"></video></template></li>'
  const out = applySanitizationPipeline(html, { url: 'https://www.example.com/section' })
  assert.equal(NO_VIDEO_TAG.test(out), false, 'still safe: no <video> tag survives')
  assert.equal(/<template/i.test(out), false, 'documents the actual (lossy) behavior: the whole <li> is gone, not converted')
})

test('#119 invariant (refresh path): a <video> inside a <template> NESTED inside another <template> still cannot survive', () => {
  const html = '<template><div><template><video autoplay muted loop><source src="https://cdn.example.com/clip.mp4"></video></template></div></template>'
  const out = applySanitizationPipeline(html, { url: 'https://www.example.com/section' })
  assert.equal(NO_VIDEO_TAG.test(out), false, `persisted HTML still contains a <video> tag:\n${out}`)
})

test('#119 invariant (refresh path): existing <img> fallback branch preserves the SPECIFIC site-provided img, not a generic placeholder', () => {
  const html = '<video poster="https://cdn.example.com/thumb.jpg" autoplay><img alt="fallback" data-marker="site-provided"></video>'
  const out = applySanitizationPipeline(html, { url: 'https://www.example.com/section' })
  // may also pick up a data-scale-context from the normal image-classification pass that runs
  // afterwards — that's expected, it's now a real <img> like any other
  assert.match(out, /<img alt="fallback" data-marker="site-provided"[^>]*>/, 'the exact site-provided fallback img must be what survives, not a placeholder or a different element')
  assert.equal(/data-spotboard-source="video-placeholder"/.test(out), false, 'must not fall through to the placeholder when a real fallback exists')
})

test('#119 invariant (refresh path): poster-bearing video still becomes a sized <img>, not swallowed by the invariant check', () => {
  const html = '<video poster="https://cdn.example.com/thumb.jpg" width="360" height="240"><source src="https://cdn.example.com/clip.mp4"></video>'
  const out = applySanitizationPipeline(html, { url: 'https://www.example.com/section' })
  assert.equal(NO_VIDEO_TAG.test(out), false)
  assert.match(out, /<img[^>]+src="https:\/\/cdn\.example\.com\/thumb\.jpg"/)
  assert.match(out, /data-scale-context="[a-z]+"/, 'must enter the normal image sizing pipeline, not just disappear')
})

test('#119 invariant (refresh path): existing image/non-video content is unaffected (no regression)', () => {
  const html = '<div><img src="https://cdn.example.com/pic.jpg" data-scale-context="thumbnail"><p>Some text</p></div>'
  const out = applySanitizationPipeline(html, { url: 'https://www.example.com/section' })
  assert.match(out, /<img src="https:\/\/cdn\.example\.com\/pic\.jpg" data-scale-context="thumbnail">/)
  assert.match(out, /<p>Some text<\/p>/)
})

// --- Capture path: same battery, live DOM (rects stubbed since jsdom has no real layout) ---

function runCapture(html) {
  const root = document.createElement('div')
  root.innerHTML = html
  root.querySelectorAll('video').forEach(v => {
    v.getBoundingClientRect = () => ({ width: 300, height: 150, top: 0, left: 0, right: 300, bottom: 150 })
  })
  promoteVideoPosters(root, 'capture')
  return root.innerHTML
}

for (const [label, html] of refreshCases) {
  test(`#119 invariant (capture path): ${label} -> no <video> tag survives`, () => {
    const out = runCapture(html)
    assert.equal(NO_VIDEO_TAG.test(out), false, `persisted HTML still contains a <video> tag:\n${out}`)
    assert.equal(/\bautoplay\b|\bloop\b/i.test(out), false, 'no autoplay/loop attribute may survive in any form')
  })
}

test('#119 invariant (capture path): a <video> inside a <template> NESTED inside another <template> still cannot survive', () => {
  const root = document.createElement('div')
  root.innerHTML = '<template><div><template><video autoplay muted loop><source src="https://cdn.example.com/clip.mp4"></video></template></div></template>'
  promoteVideoPosters(root, 'capture')
  assert.equal(NO_VIDEO_TAG.test(root.innerHTML), false, `persisted HTML still contains a <video> tag:\n${root.innerHTML}`)
})

test('#119 invariant (capture path): existing <img> fallback branch preserves the SPECIFIC site-provided img, not a generic placeholder', () => {
  const out = runCapture('<video poster="https://cdn.example.com/thumb.jpg" autoplay><img alt="fallback" data-marker="site-provided"></video>')
  assert.match(out, /<img alt="fallback" data-marker="site-provided"[^>]*>/, 'the exact site-provided fallback img must be what survives, not a placeholder or a different element')
  assert.equal(/data-spotboard-source="video-placeholder"/.test(out), false, 'must not fall through to the placeholder when a real fallback exists')
})

test('#119 invariant (capture path): poster-bearing video still becomes a sized <img>', () => {
  const out = runCapture('<video poster="https://cdn.example.com/thumb.jpg"></video>')
  assert.equal(NO_VIDEO_TAG.test(out), false)
  assert.match(out, /<img[^>]+src="https:\/\/cdn\.example\.com\/thumb\.jpg"/)
  assert.match(out, /data-scale-context="medium"/) // 150px stubbed height -> medium tier
})

test('#119 invariant (capture path): existing image/non-video content is unaffected (no regression)', () => {
  const root = document.createElement('div')
  root.innerHTML = '<img src="https://cdn.example.com/pic.jpg" data-scale-context="thumbnail"><p>Some text</p>'
  promoteVideoPosters(root, 'capture')
  assert.equal(root.innerHTML, '<img src="https://cdn.example.com/pic.jpg" data-scale-context="thumbnail"><p>Some text</p>')
})
