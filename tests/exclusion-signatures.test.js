// #96: exclusion signatures answer "did the content the user excluded come back?" -- the actual
// promise -- instead of "did the same CSS selector still match?". Covers the intended catches,
// the false-positive/collision cases, and the documented v1 limitation (icon/image-only
// exclusions have no text, so they cannot be verified and are never a failure).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const {
  buildExclusionSignatures,
  findLeakedExclusions,
  exclusionSignatureOf,
  applySanitizationPipeline,
} = await import('../.test-build/utils/dom-cleanup.js')

const YESNO = 'div.row > div.pills'

test('signature: digits stripped, lowercased, whitespace collapsed', () => {
  assert.equal(exclusionSignatureOf('<div>Yes  90¢ <b>No</b> 11¢</div>'), 'yes ¢ no ¢')
  assert.equal(exclusionSignatureOf('<div>YES 12¢ NO 88¢</div>'), 'yes ¢ no ¢') // price churn == same signature
})

test('limitation: icon-only / image-only / tiny-text exclusions have no signature', () => {
  assert.equal(exclusionSignatureOf('<span><svg><path d="M0 0"/></svg></span>'), null)
  assert.equal(exclusionSignatureOf('<span><img src="a.png"></span>'), null)
  assert.equal(exclusionSignatureOf('<span>90¢</span>'), null)   // no letters
  assert.equal(exclusionSignatureOf('<span>Go</span>'), null)    // < 3 letters: too generic to prove anything
})

test('leak: excluded Yes/No content back in the card while its selector no longer matches', () => {
  const sigs = buildExclusionSignatures(
    [{ sel: YESNO, elementHtml: '<div class="pills"><button>Yes 90¢</button><button>No 11¢</button></div>' }],
    '<div>Democratic Party 89%</div>'
  )
  const refreshed = '<div>Democratic Party 89%<div><button>Yes 91¢</button><button>No 10¢</button></div></div>'
  const check = findLeakedExclusions(refreshed, [YESNO], sigs)
  assert.deepEqual(check.leaked, [YESNO])
  assert.deepEqual(check.unverified, [])
})

test('no leak: the excluded banner is genuinely gone from the site (selector unresolved, text absent)', () => {
  const sigs = buildExclusionSignatures(
    [{ sel: 'div.promo', elementHtml: '<div class="promo">Summer sale ends soon</div>' }],
    '<div>Headline</div>'
  )
  const check = findLeakedExclusions('<div>Headline</div>', ['div.promo'], sigs)
  assert.deepEqual(check.leaked, [])
})

test('no leak: content that was never in the tier at all (Live chat absent from server HTML)', () => {
  const sigs = buildExclusionSignatures(
    [{ sel: 'button.live', elementHtml: '<button class="live">Live chat</button>' }],
    '<div>Market</div>'
  )
  assert.deepEqual(findLeakedExclusions('<div>Market</div>', ['button.live'], sigs).leaked, [])
})

test('no leak when the exclusion selector DID resolve (only unresolved selectors are checked)', () => {
  const sigs = buildExclusionSignatures(
    [{ sel: 'p.x', elementHtml: '<p class="x">Something excluded here</p>' }],
    '<div>rest</div>'
  )
  // selector resolved -> not in the unresolved list -> nothing to check even if similar text exists
  assert.deepEqual(findLeakedExclusions('<div>something excluded here</div>', [], sigs).leaked, [])
})

test('collision: same words legitimately appear in NON-excluded content (keep count) -- no false alarm', () => {
  // Excluded the Dem/Rep pills ("Yes 90¢"); three OTHER rows also read "Yes 22¢" and stay visible.
  const cleanedCapture = '<div><p>Yes 22¢</p><p>Yes 25¢</p><p>Yes 23¢</p></div>'
  const sigs = buildExclusionSignatures(
    [{ sel: 'div.pillA', elementHtml: '<div class="pillA">Yes 90¢</div>' }],
    cleanedCapture
  )
  assert.equal(sigs[0].keep, 3)
  // refreshed: same 3 other rows, excluded pill correctly absent -> fine
  assert.deepEqual(findLeakedExclusions(cleanedCapture, ['div.pillA'], sigs).leaked, [])
  // refreshed: a 4th copy appears (the excluded pill is back) -> leak
  const withBack = '<div><p>Yes 22¢</p><p>Yes 25¢</p><p>Yes 23¢</p><p>Yes 90¢</p></div>'
  assert.deepEqual(findLeakedExclusions(withBack, ['div.pillA'], sigs).leaked, ['div.pillA'])
})

test('known v1 weakness: if the non-excluded copies rotate away, an excluded copy coming back can hide behind them', () => {
  // Documents the limit of a text-only signature (see devil's-advocate in #96): count-based
  // detection compares totals, so 3 kept copies -> 2 kept + 1 leaked is indistinguishable.
  const sigs = [{ sel: 's', sig: 'yes ¢', keep: 3 }]
  const rotated = '<div><p>Yes 1¢</p><p>Yes 2¢</p><p>Yes 3¢</p></div>' // 3 copies again, one may be the leaked one
  assert.deepEqual(findLeakedExclusions(rotated, ['s'], sigs).leaked, [])
})

test('limitation: icon-only exclusion that did not resolve is "unverified", never a failure', () => {
  const sigs = buildExclusionSignatures(
    [{ sel: 'span.icon', elementHtml: '<span class="icon"><svg></svg></span>' }],
    '<div>x</div>'
  )
  assert.deepEqual(sigs, [])
  const check = findLeakedExclusions('<div>x <svg></svg></div>', ['span.icon'], sigs)
  assert.deepEqual(check.leaked, [])
  assert.deepEqual(check.unverified, ['span.icon'])
})

test('legacy card (no stored signatures): every unresolved selector is unverified, nothing fails', () => {
  const check = findLeakedExclusions('<div>Yes 90¢</div>', ['a', 'b'], undefined)
  assert.deepEqual(check.leaked, [])
  assert.deepEqual(check.unverified, ['a', 'b'])
})

test('duplicate selectors (Kalshi stored the same chain 4x) are checked once', () => {
  const sigs = [{ sel: 'dup', sig: 'live chat', keep: 0 }]
  const check = findLeakedExclusions('<div>Live chat</div>', ['dup', 'dup', 'dup'], sigs)
  assert.deepEqual(check.leaked, ['dup'])
})

test('pipeline: verdict is left on the component, non-enumerable, and never serialised', () => {
  const component = {
    selector: 'div.card',
    html_cache: '<div class="card">old</div>',
    excludedSelectors: ['div.does-not-exist'],
    exclusionSignatures: [{ sel: 'div.does-not-exist', sig: 'excluded words here', keep: 0 }],
  }
  const html = applySanitizationPipeline('<div class="card"><p>Keep</p><p>Excluded words here</p></div>', component)
  assert.ok(html.includes('Excluded words here')) // selector matched nothing -> left visible ...
  assert.deepEqual(component.__exclusionCheck.leaked, ['div.does-not-exist']) // ... and now detected
  assert.ok(!Object.keys(component).includes('__exclusionCheck'))
  assert.ok(!JSON.stringify(component).includes('__exclusionCheck'))
})

test('pipeline: card with resolving exclusions reports a clean check', () => {
  const component = {
    selector: 'div.card',
    html_cache: '<div class="card">old</div>',
    excludedSelectors: ['p.gone'],
    exclusionSignatures: [{ sel: 'p.gone', sig: 'remove this text', keep: 0 }],
  }
  applySanitizationPipeline('<div class="card"><p class="gone">Remove this text</p><p>Keep</p></div>', component)
  assert.deepEqual(component.__exclusionCheck.leaked, [])
  assert.deepEqual(component.__exclusionCheck.unverified, [])
})
