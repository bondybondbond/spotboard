// #213: a capture whose selector matches several elements must be stopped when refresh's tie-break (heading
// fingerprint, else the first match) would pick a different element than the one the user locked. #178 only
// proved the selector INCLUDES the element. Kalshi: `div.flex.flex-col` matched 67 blocks, the card name
// "Democrat" was in 36 and the largest was a page wrapper around the locked block, so every refresh took it.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { refreshPicksElement } = await import('../.test-build/content.js')
const { pickByHeadingFingerprint } = await import('../.test-build/utils/dom-cleanup.js')

beforeEach(() => { document.body.innerHTML = '' })

const filler = (n, word) => Array.from({ length: n }, (_, i) => `<p>${word} line ${i}</p>`).join('')

test('Kalshi shape: nested generic matches, card-name fingerprint -> the larger wrapper wins, so the capture is stopped', () => {
  document.body.innerHTML = `<div class="flex flex-col" id="page">
    <div class="flex flex-col"><span>US Elections</span>${filler(30, 'header')}<p>Democrat odds summary</p></div>
    <div class="flex flex-col" id="locked"><span>Democrat</span><span>Nov 3</span><span>Republican</span><svg></svg></div>
  </div>`
  const locked = document.getElementById('locked')
  assert.equal(refreshPicksElement('div.flex.flex-col', 'Democrat', locked), false)
  assert.equal(pickByHeadingFingerprint(document.querySelectorAll('div.flex.flex-col'), 'Democrat').id, 'page', 'sanity: the wrapper is what refresh takes')
})

test('a unique selector passes (the common case: one match)', () => {
  document.body.innerHTML = '<section id="news"><h2>Top stories</h2></section><section><h2>Other</h2></section>'
  assert.equal(refreshPicksElement('#news', 'Top stories', document.getElementById('news')), true)
})

test('several matches, the heading fingerprint resolves to the locked one -> passes', () => {
  document.body.innerHTML = `<div class="box"><h3>Weather</h3>${filler(20, 'w')}</div><div class="box" id="locked"><h3>Scores</h3><p>1-0</p></div>`
  assert.equal(refreshPicksElement('div.box', 'Scores', document.getElementById('locked')), true)
})

test('several sibling matches, only the locked one contains the card name -> passes', () => {
  document.body.innerHTML = `<div class="box">${filler(20, 'a')}</div><div class="box" id="locked"><p>Sponsored Links</p></div>`
  assert.equal(refreshPicksElement('div.box', 'Sponsored Links', document.getElementById('locked')), true)
})

test('no fingerprint: refresh takes the first match -> passes only when the locked element is first', () => {
  document.body.innerHTML = '<div class="box" id="a"><p>x</p></div><div class="box" id="b"><p>y</p></div>'
  assert.equal(refreshPicksElement('div.box', null, document.getElementById('a')), true)
  assert.equal(refreshPicksElement('div.box', null, document.getElementById('b')), false)
})

test('fingerprint that resolves nothing falls back to the first match, as refresh does', () => {
  document.body.innerHTML = '<div class="box" id="a"><p>x</p></div><div class="box" id="b"><p>y</p></div>'
  assert.equal(refreshPicksElement('div.box', 'Not on the page', document.getElementById('a')), true)
  assert.equal(refreshPicksElement('div.box', 'Not on the page', document.getElementById('b')), false)
})

test('fingerprint resolves nothing, an empty placeholder comes first: direct fetch skips it and lands on the locked one -> passes', () => {
  document.body.innerHTML = '<div class="box" id="shell"></div><div class="box" id="locked"><p>x</p></div><div class="box"><p>y</p></div>'
  const locked = document.getElementById('locked')
  assert.equal(refreshPicksElement('div.box', 'Not on the page', locked), true)
  assert.equal(refreshPicksElement('div.box', null, locked), true)
  assert.equal(refreshPicksElement('div.box', null, document.querySelectorAll('div.box')[2]), false, 'neither tier lands on the third')
})

test('a check that cannot run is not a pass: invalid selector or zero matches -> false', () => {
  document.body.innerHTML = '<div id="a"></div>'
  const a = document.getElementById('a')
  assert.equal(refreshPicksElement('div[', null, a), false)
  assert.equal(refreshPicksElement('#nope', null, a), false)
})

test('an element inside a shadow root is not judged (a document query cannot reach it; same as #178)', () => {
  document.body.innerHTML = '<div id="host"></div>'
  const root = document.getElementById('host').attachShadow({ mode: 'open' })
  root.innerHTML = '<div class="x">a</div>'
  assert.equal(refreshPicksElement('div.x', null, root.querySelector('.x')), true)
})

// Capture and direct-fetch refresh must run the same tie-break, not two copies that can drift.
test('direct-fetch refresh and the capture check share one picker', () => {
  const engine = fs.readFileSync(new URL('../public/utils/refresh-engine.js', import.meta.url), 'utf8')
  assert.match(engine, /function _pickByHeadingFingerprint\(matches, fingerprint\) \{\s*return pickByHeadingFingerprint\(matches, fingerprint\);\s*\}/)
  const content = fs.readFileSync(new URL('../src/content.ts', import.meta.url), 'utf8')
  assert.match(content, /pickByHeadingFingerprint\(matches, fingerprint\)/)
  assert.doesNotMatch(content, /_p2\.reduce/, 'no private copy of pass 2 in content.ts')
})

// The stop runs at lock time, before the confirmation modal, with the fingerprint Confirm will save.
test('the lock flow stops before the confirmation modal, and Confirm saves the fingerprint the check used', () => {
  const src = fs.readFileSync(new URL('../src/content.ts', import.meta.url), 'utf8')
  const check = src.indexOf('if (!refreshPicksElement(selector, lockFingerprint, captureTarget))')
  const modal = src.indexOf('showCaptureConfirmation(captureTarget, name, selector, positionBased, clickBranch)')
  assert.ok(check > 0 && modal > check)
  assert.match(src, /const lockFingerprint = captureFingerprint\(rawHeading,/)
  assert.match(src, /const headingFingerprint = captureFingerprint\(fpText, fallbackName\);/)
})

// Every way into Confirm passes the check: first lock, Continue after Grow/Shrink (button or Enter) and
// Re-capture all go continueRefinement -> proceedToPreviewer -> the check -> the modal. A second caller of
// the modal would skip it. The stop leaves recaptureCtx alone, so a retry is still the same Re-capture.
test('one path into the confirmation modal, and it runs through the check', () => {
  const src = fs.readFileSync(new URL('../src/content.ts', import.meta.url), 'utf8')
  assert.equal((src.match(/(?<!function )\bshowCaptureConfirmation\(\w/g) || []).length, 1, 'one caller of the modal')
  assert.equal((src.match(/(?<!function )\bproceedToPreviewer\(\w/g) || []).length, 1, 'one caller of proceedToPreviewer')
  assert.match(src, /continueRefinement\(\) \{[\s\S]*?proceedToPreviewer\(root,/)
  const stop = src.slice(src.indexOf('const stopUnfindable = '), src.indexOf('const selector = generateCaptureSelector(captureTarget);'))
  assert.doesNotMatch(stop, /recaptureCtx/)
})
