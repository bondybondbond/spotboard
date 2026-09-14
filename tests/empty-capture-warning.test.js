// Regression coverage for #9: the "capture looks empty" gate (looksEmptyCapture(), extracted
// unchanged from content.ts's save-path click handler) must fire only on genuinely useless
// captures, never on legitimately tiny ones (a bare price/percent/score) or playground captures.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { looksEmptyCapture } = await import('../.test-build/content.js')

test('a genuinely empty capture (no text, no structural/media nodes) is flagged', () => {
  assert.equal(looksEmptyCapture('<div></div>', false), true)
})

test('a capture with real text is NOT flagged', () => {
  assert.equal(looksEmptyCapture('<div><p>Deal title with real text</p></div>', false), false)
})

test('a capture with no text but a structural node (e.g. a lone <img>) is NOT flagged', () => {
  assert.equal(looksEmptyCapture('<div><img src="x.jpg"></div>', false), false)
})

test('a legitimately tiny value (Kalshi-style bare "54%") is NOT flagged (volatile-fingerprint exemption)', () => {
  assert.equal(looksEmptyCapture('<div><span>54%</span></div>', false), false)
})

test('an empty playground capture is NOT flagged (playground intentionally allows empty test captures)', () => {
  assert.equal(looksEmptyCapture('<div></div>', true), false)
})
