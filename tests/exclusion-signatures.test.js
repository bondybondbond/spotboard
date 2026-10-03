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
  const html = applySanitizationPipeline('<div class="card"><p>Keep</p><p>Excluded words here today</p></div>', component)
  assert.ok(html.includes('Excluded words here today')) // selector matched nothing -> left visible ...
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

// ---------- #145: exclusions with no saved text, judged against the saved card ----------

const { exclusionTailOf } = await import('../.test-build/utils/dom-cleanup.js')

test('#145 tail: drops ids and positions, keeps what the element IS (last two levels)', () => {
  assert.equal(exclusionTailOf('#igami-3963212349 > a.a2t-link > img.no-lazyload'), 'a.a2t-link > img.no-lazyload')
  assert.equal(exclusionTailOf('section:nth-child(19) > div:nth-child(2) > ul:nth-child(1) > li:nth-child(3) > p:nth-child(2)'), 'li > p')
  assert.equal(exclusionTailOf('button.icon-button.modal-dialog__close-button[data-type="bleed"]'), 'button.icon-button.modal-dialog__close-button[data-type="bleed"]')
  assert.equal(exclusionTailOf('div:nth-child(2) > p:nth-child(1)'), 'div > p')
  assert.equal(exclusionTailOf('div.a div.b'), 'div.a div.b')           // descendant combinator kept
  assert.equal(exclusionTailOf('div.a + p.b'), 'div.a + p.b')            // sibling combinators are kept, not loosened to descendant
  assert.equal(exclusionTailOf('ul:nth-child(2) ~ li:nth-child(1)'), 'ul ~ li')
})

test('#145 tail: nothing identifying left -> null; a lone bare tag is too generic to count', () => {
  assert.equal(exclusionTailOf(':nth-child(2)'), null)
  assert.equal(exclusionTailOf('div:nth-child(2)'), null)
  assert.equal(exclusionTailOf('#modal > button:nth-child(1)'), null)   // id stripped, only a bare <button> left
  assert.equal(exclusionTailOf('#x > p'), null)
  assert.equal(exclusionTailOf(String.raw`#a\:b > p.c`), 'p.c')                    // escaped id is skipped whole, the class survives
})

test('#145 tail: escapes, quotes and brackets do not split the selector; # inside values is kept', () => {
  assert.equal(exclusionTailOf(''), null)
  assert.equal(exclusionTailOf(String.raw`div.md\:flex > a.w-\[200px\]`), String.raw`div.md\:flex > a.w-\[200px\]`)
  assert.equal(exclusionTailOf(String.raw`#\31 23abc > p.k`), 'p.k')           // CSS.escape of a leading digit: hex escape + its space is ONE token
  assert.equal(exclusionTailOf(String.raw`ul.\31 x > li.k`), String.raw`ul.\31 x > li.k`)
  assert.equal(exclusionTailOf('a[href="x > y"] > b.k'), 'a[href="x > y"] > b.k')
  assert.equal(exclusionTailOf('a[href="#top"] > b.k'), 'a[href="#top"] > b.k')
  assert.equal(exclusionTailOf('li:not(#x) > p.k'), 'li:not(#x) > p.k')
})

test('#145 evidence: unsigned bylines back in the card (saved card kept none) -> leaked', () => {
  // next.io shape: positional selectors that no longer match; their <li><p> bylines are visible again
  const sel = 'section:nth-child(19) > div:nth-child(2) > ul:nth-child(1) > li:nth-child(1) > p:nth-child(2)'
  const saved = '<section><h3>Story</h3></section>'
  const refreshed = '<section><h3>Story</h3><ul><li><p>By A</p></li><li><p>By B</p></li></ul></section>'
  const check = findLeakedExclusions(refreshed, [sel], undefined, saved)
  assert.deepEqual(check.leaked, [sel])
  assert.deepEqual(check.unverified, [])
})

test('#145 evidence: a digit-leading id (CSS.escape hex escape) above the tail does not break the check', () => {
  const sel = String.raw`#\31 23abc > p.k`
  const saved = '<div></div>'
  assert.deepEqual(findLeakedExclusions('<div><p class="k">back</p></div>', [sel], undefined, saved).leaked, [sel])
})

test('#145 evidence: element legitimately absent (yr.no modal Close button) -> no evidence, stays unverified, not a failure', () => {
  const sel = 'button.icon-button.modal-dialog__close-button[data-type="bleed"]'
  const saved = '<div><p>Forecast</p></div>'
  const check = findLeakedExclusions('<div><p>Forecast today</p></div>', [sel], undefined, saved)
  assert.deepEqual(check.leaked, [])
  assert.deepEqual(check.unverified, [sel])
})

test('#145 evidence: same or fewer matching elements than the saved card -> not leaked', () => {
  const sel = 'ul:nth-child(1) > li:nth-child(2) > p:nth-child(1)'
  const saved = '<ul><li><p>kept</p></li><li><p>kept</p></li></ul>'
  assert.deepEqual(findLeakedExclusions(saved, [sel], undefined, saved).leaked, [])
  assert.deepEqual(findLeakedExclusions('<ul><li><p>kept</p></li></ul>', [sel], undefined, saved).leaked, [])
})

test('#145 evidence: no saved card to compare against -> unverified, never a guess', () => {
  const sel = 'ul > li:nth-child(1) > p:nth-child(1)'
  const refreshed = '<ul><li><p>x</p></li></ul>'
  assert.deepEqual(findLeakedExclusions(refreshed, [sel], undefined, undefined).unverified, [sel])
  assert.deepEqual(findLeakedExclusions(refreshed, [sel], undefined, '').unverified, [sel])
})

test('#145 evidence: a selector with no usable tail, or one the DOM rejects, is unverified (never throws)', () => {
  const saved = '<div>x</div>'
  const check = findLeakedExclusions('<div>x</div><div>y</div>', [':nth-child(1)', 'div[[bad'], undefined, saved)
  assert.deepEqual(check.leaked, [])
  assert.deepEqual(check.unverified, [':nth-child(1)', 'div[[bad'])
})

test('#145 evidence: a signed exclusion is still judged by its text, not the tail count', () => {
  const sigs = [{ sel: 'p.x', sig: 'excluded words here', keep: 0 }]
  // many more <p.x> than saved, but the signed text is absent -> not leaked
  const check = findLeakedExclusions('<p class="x">other</p><p class="x">other</p>', ['p.x'], sigs, '<div>old</div>')
  assert.deepEqual(check.leaked, [])
})

test('#145 pipeline: unsigned positional exclusions that miss while their content is back leave a leak verdict', () => {
  const component = {
    selector: 'div.card',
    html_cache: '<div class="card"><h3>Story</h3><p>lead</p></div>',
    excludedSelectors: ['div:nth-child(3) > ul:nth-child(1) > li:nth-child(1) > span:nth-child(1)'],
  }
  const html = applySanitizationPipeline('<div class="card"><h3>Story</h3><p>lead</p><ul><li><span>By A. Writer</span></li></ul></div>', component)
  assert.ok(html.includes('By A. Writer'))
  assert.equal(component.__exclusionCheck.leaked.length, 1)
})

test('#145 pipeline: unsigned exclusion that misses with nothing of its kind in the card keeps the card clean', () => {
  const component = {
    selector: 'div.card',
    html_cache: '<div class="card"><h3>Story</h3><p>lead</p></div>',
    excludedSelectors: ['button.modal__close'],
  }
  applySanitizationPipeline('<div class="card"><h3>Story</h3><p>lead today</p></div>', component)
  assert.deepEqual(component.__exclusionCheck.leaked, [])
  assert.deepEqual(component.__exclusionCheck.unverified, ['button.modal__close'])
})

test('#145 evidence: a lone bare tag is never counted, even if the card grew (a new unrelated button is not a leak)', () => {
  const sel = '#modal > button:nth-child(1)'
  const saved = '<div><button>a</button><button>b</button></div>'
  const refreshed = '<div><button>a</button><button>b</button><button>c</button></div>'
  const check = findLeakedExclusions(refreshed, [sel], undefined, saved)
  assert.deepEqual(check.leaked, [])
  assert.deepEqual(check.unverified, [sel])
})

test('#145 evidence: # inside an attribute value does not break the selector (still judged)', () => {
  const sel = 'a[href="#top"] > b.k'
  const saved = '<div><a href="#top"></a></div>'
  const refreshed = '<div><a href="#top"><b class="k">back</b></a></div>'
  assert.deepEqual(findLeakedExclusions(refreshed, [sel], undefined, saved).leaked, [sel])
})

test('known edge: a saved card that already holds the leaked elements gives equal counts, so nothing is flagged', () => {
  const sel = 'ul:nth-child(2) > li:nth-child(1) > p:nth-child(1)'
  const savedWithLeak = '<ul><li><p>By A</p></li></ul>'
  assert.deepEqual(findLeakedExclusions(savedWithLeak, [sel], undefined, savedWithLeak).leaked, [])
})

test('#145 evidence: a tail the saved card also holds is shared with kept content -> a feed that grew is NOT flagged', () => {
  const sel = 'ul:nth-child(2) > li:nth-child(1) > p:nth-child(1)'
  const saved = '<ul><li><p>one</p></li></ul>'
  const grown = '<ul><li><p>one</p></li><li><p>two</p></li></ul>'
  const check = findLeakedExclusions(grown, [sel], undefined, saved)
  assert.deepEqual(check.leaked, [])
  assert.deepEqual(check.unverified, [sel])
})

test('#145 evidence (HotUKDeals regression): 39 positional exclusions sharing `span > span`, 231 in the saved card and 235 today -> nothing flagged', () => {
  const spans = n => '<div>' + '<span><span>x</span></span>'.repeat(n) + '</div>'
  const sels = Array.from({ length: 39 }, (_, i) => `article:nth-child(${i + 3}) > div:nth-child(2) > span:nth-child(2) > span:nth-child(1)`)
  const check = findLeakedExclusions(spans(235), sels, undefined, spans(231))
  assert.deepEqual(check.leaked, [])
  assert.equal(check.unverified.length, 39)
})
