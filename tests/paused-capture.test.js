// Coverage for #156: an auto-started capture (picker, Re-capture) opens paused so the site's consent
// pop-up stays clickable. While paused nothing is intercepted; Start arms today's capture mode; the
// toolbar icon (TOGGLE_CAPTURE) while paused means Start and keeps a re-capture's card link. The
// panel's closed shadow DOM and the consent-reload re-offer are exercised in the real-run E2E.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const sent = []
let onMessage = null
global.chrome.runtime.sendMessage = (msg, cb) => { sent.push(msg); if (typeof cb === 'function') cb() }
global.chrome.runtime.onMessage.addListener = fn => { onMessage = fn }

const {
  startPausedCapture,
  cancelPausedCapture,
  __showPausedCaptureForTest,
  __getCaptureStateForTest,
} = await import('../.test-build/content.js')

const RECAPTURE = { cardId: 'c1', sessionId: 's1', label: 'Top stories' }
const clicksIntercepted = () => {
  const target = document.createElement('button')
  document.body.appendChild(target)
  const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true })
  target.dispatchEvent(ev)
  target.remove()
  return ev.defaultPrevented
}
const toggleFromToolbar = () => onMessage({ type: 'TOGGLE_CAPTURE' }, {}, () => {})
const reset = () => {
  const s = __getCaptureStateForTest()
  if (s.paused) cancelPausedCapture()
  if (__getCaptureStateForTest().isCapturing) toggleFromToolbar()
  sent.length = 0
}

test('paused: panel up, capture off, page clicks are not intercepted', () => {
  reset()
  __showPausedCaptureForTest()
  const s = __getCaptureStateForTest()
  assert.equal(s.paused, true)
  assert.equal(s.isCapturing, false)
  assert.equal(document.getElementById('spotboard-capture-banner'), null, 'no capture strip while paused')
  assert.equal(clicksIntercepted(), false, 'a consent button click must reach the page')
})

test('Start: panel gone, capture armed, background told to stop re-offering', () => {
  reset()
  __showPausedCaptureForTest()
  startPausedCapture()
  const s = __getCaptureStateForTest()
  assert.equal(s.paused, false)
  assert.equal(s.isCapturing, true)
  assert.ok(document.getElementById('spotboard-capture-banner'), 'capture strip shows once started')
  assert.equal(clicksIntercepted(), true, 'armed capture takes page clicks, as today')
  assert.ok(sent.some(m => m.type === 'CAPTURE_PAUSE_END'))
})

test('Cancel (×): panel gone, nothing armed, re-capture link dropped', () => {
  reset()
  __showPausedCaptureForTest(RECAPTURE)
  cancelPausedCapture()
  const s = __getCaptureStateForTest()
  assert.equal(s.paused, false)
  assert.equal(s.isCapturing, false)
  assert.equal(s.recaptureCtx, null)
  assert.equal(clicksIntercepted(), false)
  assert.ok(sent.some(m => m.type === 'CAPTURE_PAUSE_END'))
})

test('toolbar icon while paused starts the paused capture and keeps the re-capture link', () => {
  reset()
  __showPausedCaptureForTest(RECAPTURE)
  toggleFromToolbar()
  const s = __getCaptureStateForTest()
  assert.equal(s.paused, false)
  assert.equal(s.isCapturing, true)
  assert.deepEqual(s.recaptureCtx, RECAPTURE, 'must not become a normal capture (duplicate card)')
})

test('negative: toolbar icon with no paused panel is today\'s normal toggle', () => {
  reset()
  toggleFromToolbar()
  let s = __getCaptureStateForTest()
  assert.equal(s.isCapturing, true)
  assert.equal(s.recaptureCtx, null)
  assert.ok(!sent.some(m => m.type === 'CAPTURE_PAUSE_END'), 'no pause bookkeeping on a toolbar start')
  toggleFromToolbar()
  s = __getCaptureStateForTest()
  assert.equal(s.isCapturing, false)
})
