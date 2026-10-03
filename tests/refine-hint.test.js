// #109: the refine panel hint only names Grow/Shrink when they are actually available.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { refineHintText, refineStripParts } = await import('../.test-build/content.js')

test('neither Grow nor Shrink available: short neutral hint', () => {
  assert.equal(refineHintText(false, false), 'Continue, or click another element to re-select.')
})

test('only Grow available: no mention of Shrink', () => {
  const text = refineHintText(true, false)
  assert.match(text, /Grow for a bigger area/)
  assert.doesNotMatch(text, /shrink/i)
})

test('only Shrink available: no mention of Grow at all', () => {
  const text = refineHintText(false, true)
  assert.match(text, /Shrink to undo/)
  assert.doesNotMatch(text, /grow/i)
  assert.equal(text, 'Shrink to undo. Click another element to re-select.')
})

test('both available: names both and re-select', () => {
  const text = refineHintText(true, true)
  assert.match(text, /Grow for a bigger area/)
  assert.match(text, /Shrink to undo/)
  assert.match(text, /re-select/)
})

// #127: the top strip follows the same rule as the hint.
const stripText = canGrow => refineStripParts(canGrow).map(p => p.text).join('')

test('strip with Grow available: names Grow, re-select, Enter and Esc', () => {
  assert.equal(stripText(true), 'Grow to include more, or click another element to re-select · Enter to continue · Esc to cancel')
})

test('strip with Grow unavailable: never mentions Grow, still offers re-select/Enter/Esc', () => {
  const text = stripText(false)
  assert.doesNotMatch(text, /grow/i)
  assert.equal(text, 'Click another element to re-select · Enter to continue · Esc to cancel')
})

// #151: Esc is ignored during onboarding, so the strip must not promise it there.
test('strip with canCancel=false (onboarding): no Esc promise, everything else unchanged', () => {
  const text = canGrow => refineStripParts(canGrow, false).map(p => p.text).join('')
  assert.equal(text(true), 'Grow to include more, or click another element to re-select · Enter to continue')
  assert.equal(text(false), 'Click another element to re-select · Enter to continue')
})
