// Coverage for #156's real entry point: when the background answers CHECK_CAPTURE (SpotBoard opened
// this tab from the picker or Re-capture), the content script must open PAUSED -- not arm capture
// mode, which would eat the clicks on the site's consent pop-up. Own file: the CHECK_CAPTURE answer
// is handled once, at module load.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const RECAPTURE = { cardId: 'c1', sessionId: 's1', label: 'Top stories' }
global.chrome.runtime.sendMessage = (msg, cb) => {
  // Real chrome answers asynchronously; answer like a Re-capture tab would.
  if (msg.type === 'CHECK_CAPTURE' && typeof cb === 'function') setTimeout(() => cb({ recapture: RECAPTURE }), 0)
}

const { __getCaptureStateForTest } = await import('../.test-build/content.js')

test('CHECK_CAPTURE answer opens paused with the re-capture link, capture not armed', async () => {
  await new Promise(r => setTimeout(r, 20))
  const s = __getCaptureStateForTest()
  assert.equal(s.paused, true)
  assert.equal(s.isCapturing, false)
  assert.deepEqual(s.recaptureCtx, RECAPTURE)
  assert.ok(document.getElementById('spotboard-paused-capture'), 'panel host is on the page')
  assert.equal(document.getElementById('spotboard-capture-banner'), null, 'no capture strip')
})
