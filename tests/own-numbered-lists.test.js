// #102: <ol> keeps decimal markers unless the source already printed its own numbers.
// cleanupDuplicates() tags own-numbered lists so the CSS suppresses SpotBoard's markers.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { cleanupDuplicates } = await import('../.test-build/utils/dom-cleanup.js')

const tagged = (html) => /<ol[^>]*data-sb-own-numbers/.test(cleanupDuplicates(html))

test('BBC-style: number in its own element before each link -> tagged', () => {
  assert.ok(tagged('<ol><li><span>1</span><a href="#">Story A</a></li><li><span>2</span><a href="#">Story B</a></li></ol>'))
})

test('bare text number followed by link -> tagged', () => {
  assert.ok(tagged('<ol><li>1<a href="#">Story A</a></li><li>2<a href="#">Story B</a></li></ol>'))
})

test('"1. Story" text lead -> tagged', () => {
  assert.ok(tagged('<ol><li>1. Story A</li><li>2. Story B</li></ol>'))
})

test('ranked list with no printed numbers (Guardian-style) -> NOT tagged, keeps decimal', () => {
  assert.equal(tagged('<ol><li><a href="#">Story A</a></li><li><a href="#">Story B</a></li></ol>'), false)
})

test('headlines that merely start with a number/year are not mistaken for numbering', () => {
  assert.equal(tagged('<ol><li>2026 election polls</li><li>10 bold predictions</li></ol>'), false)
})

test('owner excluded the numbers -> list no longer tagged, decimal comes back', () => {
  assert.equal(tagged('<ol><li><span></span><a href="#">Story A</a></li><li><span></span><a href="#">Story B</a></li></ol>'), false)
})

test('ul is never tagged', () => {
  assert.equal(/data-sb-own-numbers/.test(cleanupDuplicates('<ul><li>1. A</li></ul>')), false)
})
