// Coverage for #175: the capture/refine/exclusion strips are a solid capsule (logo + 1-2-3 trail)
// over a helper bar. Pins the copy, which step is current per screen, the legibility maths (fill
// composited over the worst-case black and white pages), and that the #108 fade now applies per
// piece with a small margin. The real rendering, both-theme screenshots and fixed-header behaviour are
// exercised in the real-run E2E.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
global.chrome.runtime.sendMessage = (_m, cb) => { if (typeof cb === 'function') cb() }
let onMessage = null
global.chrome.runtime.onMessage.addListener = fn => { onMessage = fn }

const {
  STRIP_THEMES,
  STRIP_STEP_NAMES,
  glassCss,
  exclusionStripParts,
  startPausedCapture,
  __showPausedCaptureForTest,
  __getCaptureStateForTest,
  cancelPausedCapture,
  endRefinement,
  startRefinement,
  __showExclusionBannerForTest,
} = await import('../.test-build/content.js')

// WCAG relative luminance / contrast on 0-255 sRGB triples
const lin = c => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const mix = (fg, bg, a) => fg.map((c, i) => a * c + (1 - a) * bg[i])
const BACKDROPS = { black: [0, 0, 0], white: [255, 255, 255] }

for (const theme of ['lime', 'purple']) {
  const t = STRIP_THEMES[theme]
  for (const [name, backdrop] of Object.entries(BACKDROPS)) {
    const fill = mix(t.rgb, backdrop, t.alpha)
    test(`${theme} glass over a ${name} page: text, dimmed steps and highlight stay >= 4.5:1`, () => {
      assert.ok(contrast(hex(t.text), fill) >= 4.5, 'helper / capsule text')
      assert.ok(contrast(mix(hex(t.text), fill, t.dim), fill) >= 4.5, 'dimmed (non-current) steps')
      assert.ok(contrast(hex(t.hl), fill) >= 4.5, 'emphasis colour')
    })
  }
  test(`${theme}: the filled current-step pill is >= 4.5:1 on its own fill`, () => {
    assert.ok(contrast(hex(t.activeText), hex(t.activeBg)) >= 4.5)
  })
}

test('trail names are Choose / Adjust / Exclude, in that order', () => {
  assert.deepEqual([...STRIP_STEP_NAMES], ['Choose', 'Adjust', 'Exclude'])
})

test('glassCss: normal state is a solid fill with a 2px rim; faded state is transparent with only an outline', () => {
  const on = glassCss('lime', 'capsule', false)
  assert.match(on, /background: rgba\(163,230,53,1\)/)
  assert.match(on, /border: 2px solid #4d7c0f/)
  const off = glassCss('lime', 'capsule', true)
  assert.match(off, /background: transparent/)
  assert.match(off, /border: 2px solid transparent/)
  assert.match(off, /box-shadow: 0 0 0 1px/)
  assert.match(glassCss('purple', 'help', false), /rgba\(107,70,193,1\)/)
})

test('trail steps are bold, current and dimmed alike', () => {
  document.body.replaceChildren()
  __showExclusionBannerForTest()
  const steps = [...document.querySelectorAll('#spotboard-exclusion-banner [data-sb-step]')]
  assert.equal(steps.length, 3)
  steps.forEach(s => assert.match(s.getAttribute('style'), /font-weight: 700/))
  document.body.replaceChildren()
})

test('exclusion helper leads with Confirm Spot and marks excluding optional', () => {
  const text = exclusionStripParts().map(p => p.text).join('')
  assert.match(text, /^Press Confirm Spot to save · optional: click an element to exclude it, \[Shift\] \+ click for similar areas$/)
})

const stepOf = bannerId => {
  const strip = document.getElementById(bannerId)
  const current = strip.querySelectorAll('[aria-current="step"]')
  assert.equal(current.length, 1, 'exactly one current step')
  return current[0].textContent
}
const reset = () => {
  endRefinement('cancel')
  if (__getCaptureStateForTest().paused) cancelPausedCapture()
  if (__getCaptureStateForTest().isCapturing) onMessage({ type: 'TOGGLE_CAPTURE' }, {}, () => {}) // the toolbar icon
  document.body.replaceChildren()
}

test('screen 1 (capture strip): trail shows all three steps with "1 Choose" current, lime', () => {
  reset()
  __showPausedCaptureForTest()
  startPausedCapture()
  const strip = document.getElementById('spotboard-capture-banner')
  assert.equal(stepOf('spotboard-capture-banner'), '1 Choose')
  assert.deepEqual([...strip.querySelectorAll('[data-sb-step]')].map(s => s.textContent), ['1 Choose', '2 Adjust', '3 Exclude'])
  assert.equal(strip.querySelectorAll('[data-sb-glass]').length, 2, 'capsule + helper')
  assert.equal(strip.querySelector('[data-sb-glass="capsule"]').dataset.sbTheme, 'lime')
  assert.match(strip.textContent, /Hover to preview, click on any content you want to add/)
  assert.ok(strip.querySelector('img').src.endsWith('icon-48.png'), 'the SpotBoard logo leads the capsule')
  reset()
})

test('pointer over the capsule fades only that piece; the gap beside it and the helper stay', () => {
  reset()
  __showPausedCaptureForTest()
  startPausedCapture()
  const strip = document.getElementById('spotboard-capture-banner')
  const [capsule, help] = strip.querySelectorAll('[data-sb-glass]')
  const rect = (l, t, r, b) => () => ({ left: l, top: t, right: r, bottom: b, width: r - l, height: b - t, x: l, y: t })
  capsule.getBoundingClientRect = rect(400, 8, 700, 40)
  help.getBoundingClientRect = rect(300, 46, 800, 78)
  const move = (x, y) => document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }))

  move(500, 20)
  assert.equal(capsule.dataset.sbFaded, '1', 'over the capsule: faded')
  assert.match(capsule.style.cssText, /transparent/)
  assert.notEqual(help.dataset.sbFaded, '1', 'the helper bar is not touched')

  move(150, 20) // the empty gap to the left of both pieces: nothing fades, capsule restores
  assert.equal(capsule.dataset.sbFaded, '', 'pointer left the capsule: restored')

  move(395, 20) // inside the 6px margin
  assert.equal(capsule.dataset.sbFaded, '1')
  move(380, 20) // outside the margin
  assert.equal(capsule.dataset.sbFaded, '')
  reset()
})

const rect = (l, t, r, b) => () => ({ left: l, top: t, right: r, bottom: b, width: r - l, height: b - t, x: l, y: t })
const move = (x, y) => document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }))

test('the helper bar fades on its own, and leaving the page (mouseout with no relatedTarget) restores everything', () => {
  reset()
  __showPausedCaptureForTest()
  startPausedCapture()
  const [capsule, help] = document.getElementById('spotboard-capture-banner').querySelectorAll('[data-sb-glass]')
  capsule.getBoundingClientRect = rect(400, 8, 700, 40)
  help.getBoundingClientRect = rect(300, 46, 800, 78)
  move(500, 60)
  assert.equal(help.dataset.sbFaded, '1')
  assert.notEqual(capsule.dataset.sbFaded, '1')
  move(500, 30)
  assert.equal(capsule.dataset.sbFaded, '1')
  document.dispatchEvent(new window.MouseEvent('mouseout', { relatedTarget: null, bubbles: true }))
  assert.equal(capsule.dataset.sbFaded, '')
  assert.equal(help.dataset.sbFaded, '')
  reset()
})

test('a strip hidden with display:none (empty rect at 0,0) is never faded by a pointer near the corner', () => {
  reset()
  __showPausedCaptureForTest()
  startPausedCapture()
  const pieces = document.getElementById('spotboard-capture-banner').querySelectorAll('[data-sb-glass]')
  pieces.forEach(p => { p.getBoundingClientRect = rect(0, 0, 0, 0) })
  move(2, 2)
  pieces.forEach(p => assert.notEqual(p.dataset.sbFaded, '1'))
  reset()
})

test('screen 3 strip: purple, "3 Exclude" current, ignored by capture, torn down with capture', () => {
  reset()
  __showPausedCaptureForTest()
  startPausedCapture()
  __showExclusionBannerForTest()
  const strip = document.getElementById('spotboard-exclusion-banner')
  assert.equal(stepOf('spotboard-exclusion-banner'), '3 Exclude')
  assert.equal(strip.getAttribute('data-spotboard-ignore'), 'true')
  assert.equal(strip.querySelector('[data-sb-glass="capsule"]').dataset.sbTheme, 'purple')
  assert.match(strip.textContent, /Press Confirm Spot to save/)
  assert.doesNotMatch(strip.textContent, /Esc/)
  reset()
  assert.equal(document.getElementById('spotboard-exclusion-banner'), null)
})

test('re-capture keeps its own label text on step 1, with Esc offered outside onboarding', () => {
  reset()
  __showPausedCaptureForTest({ cardId: 'c1', sessionId: 's1', label: 'Top stories' })
  startPausedCapture()
  const text = document.getElementById('spotboard-capture-banner').textContent
  assert.match(text, /Click on the section to re-capture for “Top stories”/)
  assert.match(text, /Esc to cancel/)
  reset()
})

test('the capture strip comes back as a flex column after the refine bar closes (not a collapsed block)', () => {
  reset()
  __showPausedCaptureForTest()
  startPausedCapture()
  const banner = document.getElementById('spotboard-capture-banner')
  const box = n => { n.getBoundingClientRect = rect(10, 100, 110, 150); return n }
  const root = box(document.createElement('div')); const leaf = box(document.createElement('div'))
  root.appendChild(leaf); document.body.appendChild(root)
  startRefinement(leaf, leaf, false)
  assert.equal(banner.style.getPropertyValue('display'), 'none', 'hidden while the refine strip is up')
  endRefinement('cancel')
  assert.equal(banner.style.getPropertyValue('display'), 'flex')
  assert.equal(banner.style.getPropertyPriority('display'), 'important')
  reset()
})
