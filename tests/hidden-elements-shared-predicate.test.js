// #130: capture and the three tab-based refresh tiers used to disagree on "hidden" -- capture ran the
// full computed-style check, each tab tier ran its own display:none-only copy -- so content captured
// out came back on refresh. Both now call markHiddenElements() in dom-snapshot.ts. Covered here:
// the predicate (both profiles + negatives), the carousel-transform strip/restore around it, the
// three call sites, and the known-site NPR rules that fix the tier-1 (direct fetch) leak.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { markHiddenElements } = await import('../.test-build/utils/dom-snapshot.js')
const { cleanupDuplicates } = await import('../.test-build/utils/dom-cleanup.js')

// jsdom lays nothing out (every rect is 0x0), so geometry is stubbed per element: a `data-rect`
// attribute "left,width" places it; unmarked elements sit inside the 0..1000 root.
const realRect = window.Element.prototype.getBoundingClientRect
window.Element.prototype.getBoundingClientRect = function () {
  if (this.id === 'root') return { left: 0, right: 1000, top: 0, bottom: 800, width: 1000, height: 800 }
  const spec = this.getAttribute('data-rect')
  if (spec) {
    const [left, width] = spec.split(',').map(Number)
    return { left, right: left + width, top: 0, bottom: 20, width, height: 20 }
  }
  // A translate3d carousel slide is only off-screen WHILE its transform is applied.
  if (this.style.transform.includes('translate3d')) return { left: -5000, right: -4000, top: 0, bottom: 20, width: 1000, height: 20 }
  return { left: 10, right: 110, top: 0, bottom: 20, width: 100, height: 20 }
}
test.after(() => { window.Element.prototype.getBoundingClientRect = realRect })

// Fixtures are literal strings below; parsed with DOMParser (inert) and adopted into the document.
function mount(html) {
  const parsed = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  document.body.replaceChildren(document.adoptNode(parsed.getElementById('root')))
  return document.getElementById('root')
}
const hiddenIds = (root, profile) => {
  const { marked, restoreTransforms } = markHiddenElements(root, profile)
  const ids = marked.map(el => el.id).sort()
  marked.forEach(el => el.removeAttribute('data-spotboard-hidden'))
  restoreTransforms()
  return ids
}

test('both profiles drop display:none, visibility:hidden, off-screen and empty aria-hidden', () => {
  const root = mount(`
    <p id="shown">kept</p>
    <p id="dn" style="display:none">x</p>
    <p id="vh" style="visibility:hidden">x</p>
    <h1 id="offscreen" data-rect="-9809,1">NPR - Breaking News</h1>
    <span id="deco" aria-hidden="true"></span>`)
  for (const profile of ['capture', 'tab']) {
    assert.deepEqual(hiddenIds(root, profile), ['deco', 'dn', 'offscreen', 'vh'], profile)
  }
})

test('negative: non-empty aria-hidden text and aria-hidden images are kept', () => {
  const root = mount(`
    <span id="score" aria-hidden="true">2-1</span>
    <img id="badge" aria-hidden="true" src="x.png">
    <span id="withimg" aria-hidden="true"><img src="y.png"></span>`)
  for (const profile of ['capture', 'tab']) assert.deepEqual(hiddenIds(root, profile), [], profile)
})

test('documented residual: inline opacity:0 and loaded display:none images differ between profiles', () => {
  const root = mount(`
    <p id="fade" style="opacity:0">appearing</p>
    <img id="slide" style="display:none" src="s.png">`)
  Object.defineProperty(root.querySelector('#slide'), 'naturalWidth', { value: 300 })
  assert.deepEqual(hiddenIds(root, 'capture'), ['fade'])         // loaded image kept, opacity dropped
  assert.deepEqual(hiddenIds(root, 'tab'), ['slide'])            // inline opacity = possible reveal, kept
})

// #165: Amazon's screen-reader copies are hidden by stylesheet opacity:0 alone (absolute, no fade) and
// came back doubled on every tab refresh. A <head> stylesheet stands in for Amazon's CSS; longhands
// only, because jsdom does not expand the transition/animation shorthands.
function withSheet(css, fn) {
  const style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)
  try { fn() } finally { style.remove() }
}

test('tab drops resting out-of-flow stylesheet opacity:0 (Amazon .a-offscreen), keeps every fade-in shape', () => {
  withSheet(`
    .a-offscreen { position: absolute; left: 0; opacity: 0; }
    .sr-fixed { position: fixed; opacity: 0; }
    .reveal-fade { position: absolute; opacity: 0; transition-property: opacity; transition-duration: 0.4s; }
    .reveal-all { position: absolute; opacity: 0; transition-property: all; transition-duration: 0.3s; }
    .reveal-anim { position: absolute; opacity: 0; animation-name: fadeIn; animation-duration: 1s; }
    .reveal-zero-anim { position: absolute; opacity: 0; animation-name: none; animation-duration: 0s; }
    .in-flow { opacity: 0; }
    .other-transition { position: absolute; opacity: 0; transition-property: transform; transition-duration: 0.4s; }`, () => {
    const root = mount(`
      <span id="offscreen" class="a-offscreen">With Deal: $21.41</span>
      <span id="fixed" class="sr-fixed">Skip to content</span>
      <span id="inline-abs" style="position:absolute;opacity:0">Framer Motion initial</span>
      <div id="fade" class="reveal-fade">AOS block</div>
      <div id="all" class="reveal-all">Tailwind transition-all</div>
      <div id="anim" class="reveal-anim">animate.css</div>
      <div id="noanim" class="reveal-zero-anim">resting</div>
      <div id="inflow" class="in-flow">in-flow reveal</div>
      <div id="transform-only" class="other-transition">slides in</div>`)
    assert.deepEqual(hiddenIds(root, 'tab'), ['fixed', 'noanim', 'offscreen', 'transform-only'])
    // capture is unchanged: every opacity:0 goes
    assert.deepEqual(hiddenIds(root, 'capture'),
      ['all', 'anim', 'fade', 'fixed', 'inflow', 'inline-abs', 'noanim', 'offscreen', 'transform-only'])
  })
})

// Durations, not names, decide: Chrome reports `transition: all 0s` on every element by default
// (Amazon's .a-offscreen included), and a named 0s animation is no fade either.
test('tab treats zero-duration transitions/animations as resting, and matches durations per property', () => {
  withSheet(`
    .browser-default { position: absolute; opacity: 0; transition-property: all; transition-duration: 0s; }
    .instant-anim { position: absolute; opacity: 0; animation-name: fadeIn; animation-duration: 0s; }
    .opacity-instant { position: absolute; opacity: 0; transition-property: transform, opacity; transition-duration: 0.4s, 0s; }
    .opacity-fades { position: absolute; opacity: 0; transition-property: transform, opacity; transition-duration: 0s, 0.4s; }`, () => {
    const root = mount(`
      <span id="default" class="browser-default">With Deal: $21.41</span>
      <span id="instant" class="instant-anim">x</span>
      <span id="opacity-instant" class="opacity-instant">x</span>
      <span id="opacity-fades" class="opacity-fades">x</span>`)
    assert.deepEqual(hiddenIds(root, 'tab'), ['default', 'instant', 'opacity-instant'])
  })
})

test('tab keeps opacity just above 0 (Framer appear animations use 0.001) and partial opacity', () => {
  withSheet('.appear { position: absolute; opacity: 0.001; } .dim { position: absolute; opacity: 0.5; }', () => {
    const root = mount(`<div id="appear" class="appear">Hero</div><div id="dim" class="dim">Dimmed</div>`)
    assert.deepEqual(hiddenIds(root, 'tab'), [])
  })
})

test('carousel slides moved off-screen by an inline transform are NOT dropped, and the transform is restored', () => {
  const root = mount(`<div id="slide" style="transform: translate3d(-5000px, 0, 0); will-change: transform">slide</div>`)
  const slide = root.querySelector('#slide')
  for (const profile of ['capture', 'tab']) {
    const { marked, restoreTransforms } = markHiddenElements(root, profile)
    assert.deepEqual(marked.map(e => e.id), [], profile)
    assert.equal(slide.style.transform, '', 'stripped while checking')
    restoreTransforms()
    assert.match(slide.style.transform, /translate3d\(-5000px/, 'restored after')
    assert.equal(slide.style.willChange, 'transform')
  }
})

test('the three tab tiers call the shared predicate and no display-only copy is left', () => {
  const src = fs.readFileSync(new URL('../public/utils/refresh-engine.js', import.meta.url), 'utf8')
  assert.equal(src.split("window.DomSnapshot.markHiddenElements(element, 'tab')").length - 1, 3)
  assert.equal(src.split('_hid.restoreTransforms()').length - 1, 3)
  assert.doesNotMatch(src, /computed\.display === 'none'\)\s*\{\s*el\.setAttribute\('data-spotboard-hidden'/)
  // order at every call site: mark -> clone -> restore (restoring before the clone would re-expose
  // the off-screen transform to the clone; skipping the restore would leave the live page altered)
  const parts = src.split("window.DomSnapshot.markHiddenElements(element, 'tab')").slice(1)
  assert.equal(parts.length, 3)
  for (const rest of parts) {
    const clone = rest.indexOf('cloneWithShadow(element)')
    const restore = rest.indexOf('_hid.restoreTransforms()')
    assert.ok(clone > 0 && restore > clone, 'restoreTransforms must follow cloneWithShadow')
  }
  const capture = fs.readFileSync(new URL('../src/content.ts', import.meta.url), 'utf8')
  assert.match(capture, /markHiddenElements\(element, 'capture'\)/)
})

// ---- known-site layer (tier 1 cannot see CSS) --------------------------------------------------
const nprCard = `
  <div id="contentWrap">
    <h1 class="homepage-h1">NPR - Breaking News, Analysis, Music, Arts &amp; Podcasts</h1>
    <article class="item"><div class="caption-wrap">
      <button class="toggle-caption" aria-label="toggle caption"><b>toggle caption</b><abbr title="Toggle Caption" class="toggle-caption__info">i</abbr></button>
      <button class="hide-caption"><b>hide caption</b></button>
      <figure><img src="a.jpg" alt=""><figcaption>Photo caption <span class="credit">Jane Doe/AP</span></figcaption></figure>
      <h2 class="title"><a href="/story/1">Real headline one</a></h2>
    </div></article>
  </div>`

test('#130: NPR toggle/hide-caption buttons and the off-screen page H1 no longer survive cleanup', () => {
  const out = cleanupDuplicates(nprCard)
  assert.doesNotMatch(out, /toggle-caption|toggle caption|hide caption|homepage-h1/)
  assert.match(out, /Real headline one/)
  assert.match(out, /Photo caption/)
  assert.match(out, /Jane Doe\/AP/)
})

test('#130 negatives: other buttons and other headings are untouched', () => {
  const out = cleanupDuplicates(`
    <div><h1 class="page-title">Visible page heading</h1>
    <button class="subscribe-btn">Subscribe</button>
    <button class="toggle-menu">Menu</button>
    <p class="toggle-caption-note">not a button</p></div>`)
  assert.match(out, /Visible page heading/)
  assert.match(out, /Subscribe/)
  assert.match(out, /Menu/)
  assert.match(out, /not a button/)
})

test('#130: cleanup is idempotent on an already-clean NPR card (second refresh stable)', () => {
  const once = cleanupDuplicates(nprCard)
  assert.equal(cleanupDuplicates(once), once)
})
