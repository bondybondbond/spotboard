// #213 in the real capture flow (not just the decision function): Continue on a locked section that refresh
// would not find again shows the "Couldn't lock onto that section" hint and opens no confirmation modal, and a
// re-capture keeps its card link so the retry still replaces that card. A section that does resolve opens the
// modal as before. The closed-shadow modal and real clicks are exercised in the real-run E2E (Kalshi).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
let onMessage = null
global.chrome.runtime.sendMessage = (msg, cb) => { if (typeof cb === 'function') cb() }
global.chrome.runtime.onMessage.addListener = fn => { onMessage = fn }

const {
  startRefinement,
  endRefinement,
  __showPausedCaptureForTest,
  startPausedCapture,
  __getCaptureStateForTest,
} = await import('../.test-build/content.js')

const toggleFromToolbar = () => onMessage({ type: 'TOGGLE_CAPTURE' }, {}, () => {})
const pressEnter = () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
const modal = () => document.getElementById('spotboard-capture-confirmation')
const hint = () => document.getElementById('spotboard-capture-hint')?.textContent || null
const HINT = 'Couldn’t lock onto that section — pick a slightly bigger or different one. Your board is unchanged.'

function reset() {
  endRefinement('cancel')
  modal()?.remove()
  hint() && document.getElementById('spotboard-capture-hint').remove()
  if (__getCaptureStateForTest().isCapturing) toggleFromToolbar()
  document.body.innerHTML = ''
}

// The Kalshi shape: utility-class blocks repeated deeper than the ancestor path search goes (4 levels), so the
// only selector SpotBoard can write is the bare `div.flex.flex-col`; the card name is also inside the larger
// wrapper, so refresh's tie-break takes the wrapper.
function kalshiPage() {
  const chain = inner => `<div class="a"><div class="r2"><div class="row"><div class="col"><div class="cell">${inner}</div></div></div></div></div>`
  document.body.innerHTML = `<div class="flex flex-col"><p>Elections header</p>${'<p>filler line</p>'.repeat(30)}
    ${chain('<div class="flex flex-col"><span>Democrat</span><span>Nov 3</span><span>Republican</span></div>')}
    ${chain('<div class="flex flex-col"><span>Balance of power</span></div>')}</div>`
  return document.querySelectorAll('div.flex.flex-col')[1] // the Democrat block (no id: an id would make it unique)
}

test('Continue on a section refresh would not find again: hint, no modal, still capturing', () => {
  reset()
  const locked = kalshiPage()
  toggleFromToolbar()
  startRefinement(locked, locked.querySelector('span'), false)
  pressEnter()
  assert.equal(modal(), null, 'no confirmation modal')
  assert.equal(hint(), HINT)
  assert.equal(__getCaptureStateForTest().isCapturing, true, 'back to picking, as after the #178 stop')
  assert.equal(locked.style.outline, '', 'lock outline cleared')
})

test('a re-capture stopped by the check keeps its card link (the retry still replaces that card)', () => {
  reset()
  const locked = kalshiPage()
  const RECAPTURE = { cardId: 'c1', sessionId: 's1', label: 'Democrat' }
  __showPausedCaptureForTest(RECAPTURE)
  startPausedCapture()
  startRefinement(locked, locked.querySelector('span'), false)
  pressEnter()
  assert.equal(modal(), null)
  assert.equal(hint(), HINT)
  assert.deepEqual(__getCaptureStateForTest().recaptureCtx, RECAPTURE)
})

test('negative: a section refresh does find again opens the confirmation modal as before', () => {
  reset()
  document.body.innerHTML = '<section id="news"><h2>Top stories</h2><p>One</p><p>Two</p></section><section><h2>Other</h2></section>'
  const locked = document.getElementById('news')
  toggleFromToolbar()
  startRefinement(locked, locked.querySelector('p'), false)
  pressEnter()
  assert.notEqual(modal(), null, 'modal opened')
  assert.equal(hint(), null)
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })) // cancel, as a user would
  assert.equal(modal(), null, 'Esc closed the modal')
})
