// #178: a capture must never save a selector that cannot find the element it was generated for
// (#126 spaced id, #177 `td:nth-child(N) td`). The check is generic: any candidate that does not
// resolve to the captured element is skipped for the next one; if none resolves, no selector.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { JSDOM } from 'jsdom'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const {
  __generateSelectorForTest,
  __generateCaptureSelectorForTest,
  __pickResolvingSelectorForTest,
  selectorFindsElement,
} = await import('../.test-build/content.js')

beforeEach(() => { document.body.innerHTML = '' })

const HN = `
<table id="hnmain"><tbody>
  <tr id="pagespace"><td></td></tr>
  <tr id="bigbox"><td><table><tbody>
    <tr class="athing"><td class="title"><span class="rank">1.</span></td><td class="title"><a href="/a">Story one</a></td></tr>
    <tr class="athing"><td class="title"><span class="rank">2.</span></td><td class="title"><a href="/b">Story two</a></td></tr>
  </tbody></table></td></tr>
</tbody></table>`

test('selectorFindsElement: true when the element is among the matches (not required to be unique)', () => {
  document.body.innerHTML = '<ul><li class="x">a</li><li class="x">b</li></ul>'
  const li = document.querySelectorAll('li')[1]
  assert.equal(selectorFindsElement('li.x', li), true)
})

test('selectorFindsElement: false for zero matches, a different element, or an invalid selector', () => {
  document.body.innerHTML = '<div id="a"></div><div id="b"></div>'
  const a = document.getElementById('a')
  assert.equal(selectorFindsElement('td:nth-child(1) td', a), false) // the #177 dead shape
  assert.equal(selectorFindsElement('#b', a), false)
  assert.equal(selectorFindsElement('#Home Page International-riverPlus', a), false) // unescaped spaced id (#126)
  assert.equal(selectorFindsElement('div[', a), false) // invalid
})

test('pick: a dead first candidate falls through to the next that resolves', () => {
  document.body.innerHTML = HN
  const td = document.querySelector('#bigbox > td')
  const picked = __pickResolvingSelectorForTest(td, [() => 'td:nth-child(1) td', () => '#bigbox > td'])
  assert.equal(picked, '#bigbox > td')
})

test('pick: a candidate that throws or returns null is skipped', () => {
  document.body.innerHTML = '<div id="a"></div>'
  const a = document.getElementById('a')
  const picked = __pickResolvingSelectorForTest(a, [() => { throw new Error('boom') }, () => null, () => '#a'])
  assert.equal(picked, '#a')
})

test('pick: every candidate dead -> null (caller stops the capture)', () => {
  document.body.innerHTML = HN
  const td = document.querySelector('#bigbox > td')
  assert.equal(__pickResolvingSelectorForTest(td, [() => 'td:nth-child(1) td', () => '#nope']), null)
})

test('pick: candidates after the first winner are never evaluated (no extra cost on the normal path)', () => {
  document.body.innerHTML = '<div id="a"></div>'
  const a = document.getElementById('a')
  let later = 0
  __pickResolvingSelectorForTest(a, [() => '#a', () => { later++; return '#a' }])
  assert.equal(later, 0)
})

// Negative: the wrapper never changes a selector that already works.
test('negative: generateCaptureSelector returns exactly generateSelector for every fixture element', () => {
  const dir = new URL('./fixtures/', import.meta.url)
  const tags = 'div,section,article,ul,ol,li,table,tbody,tr,td,th,aside,main,nav,header,footer,figure,a,p,span,h1,h2,h3'
  let checked = 0
  for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.html'))) {
    document.body.innerHTML = fs.readFileSync(new URL(f, dir), 'utf8')
    for (const el of document.body.querySelectorAll(tags)) {
      assert.equal(__generateCaptureSelectorForTest(el), __generateSelectorForTest(el), `${f}: ${el.tagName}.${el.className}`)
      checked++
    }
  }
  assert.ok(checked > 500, `only ${checked} elements checked`)
})

// Negative: elements a document-level query cannot see are never refused (today's captures of them are untouched).
test('negative: an element inside a shadow root is not refused', () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = '<section class="s"><p>x</p></section>'
  const inner = shadow.querySelector('section')
  assert.equal(selectorFindsElement('section.s', inner), true)
  assert.equal(__pickResolvingSelectorForTest(inner, [() => 'nothing-matches-this']), 'nothing-matches-this')
})

test('negative: an element in another document (iframe) is checked against ITS document', () => {
  const other = new JSDOM('<body><div class="k" id="q"></div></body>').window.document
  const el = other.getElementById('q')
  assert.equal(selectorFindsElement('div.k', el), true)
  assert.equal(selectorFindsElement('div.zzz', el), false)
})

// #178 done-when 4: the refresh representation. Refresh hands the saved selector a freshly
// PARSED copy of the page, not the live DOM.
test('parsed copy: the picked selector also resolves on a freshly DOMParser-parsed copy of the page', () => {
  document.body.innerHTML = HN
  const td = document.querySelector('#bigbox > td')
  const sel = __generateCaptureSelectorForTest(td)
  assert.notEqual(sel, null)
  const parsed = new DOMParser().parseFromString('<!doctype html>' + document.documentElement.outerHTML, 'text/html')
  assert.ok(parsed.querySelectorAll(sel).length >= 1, `"${sel}" does not resolve on the parsed copy`)
})

// The wrapper's own rungs (a real DOM, a stand-in for a generateSelector that returned something dead).
test('wrapper: dead primary on the HN td is rescued by the ancestor-path rung (the #177 shape)', () => {
  document.body.innerHTML = HN
  const td = document.querySelector('#bigbox > td')
  const sel = __generateCaptureSelectorForTest(td, () => 'td:nth-child(1) td')
  assert.notEqual(sel, null)
  assert.notEqual(sel, 'td:nth-child(1) td')
  assert.ok(selectorFindsElement(sel, td), `"${sel}" does not find the td`)
})

test('wrapper: dead primary on a td in a repeated id-less table is rescued by the cell-pinned rung', () => {
  document.body.innerHTML = `<table class="data"><tbody>
    <tr><td>a1</td><td>b1</td></tr>
    <tr><td>a2</td><td>b2</td></tr>
  </tbody></table>`
  const td = document.querySelectorAll('tr')[1].children[1]
  const sel = __generateCaptureSelectorForTest(td, () => 'td:nth-child(2) td')
  assert.notEqual(sel, null)
  assert.ok(selectorFindsElement(sel, td), `"${sel}" does not find the td`)
})

test('wrapper: a digit-leading class (Tailwind `2xl:flex`) now captures instead of returning null (#179)', () => {
  // Before #179 the class escape left `.2xl\:flex` invalid, generateSelector threw, and #178 turned that into null.
  // Declared test edit (invariant 6): the requirement changed from "refuse cleanly" to "capture".
  document.body.innerHTML = '<div class="2xl:flex">x</div><div class="2xl:flex">y</div>'
  const el = document.querySelector('div')
  const sel = __generateCaptureSelectorForTest(el)
  assert.notEqual(sel, null)
  assert.ok(selectorFindsElement(sel, el), `"${sel}" does not find the div`)
})

test('wrapper: a data-testid containing quotes now captures instead of returning null (#182)', () => {
  // Before #182 the unescaped `"` made the attribute selector invalid, generateSelector threw, and #178 turned that into null.
  // Declared test edit (invariant 6): the requirement changed from "refuse cleanly" to "capture".
  // The clean-refusal behaviour itself stays covered by the `pick:` tests above.
  document.body.innerHTML = '<div data-testid=\'say "hi" now\'>x</div>'
  const el = document.querySelector('div')
  const sel = __generateCaptureSelectorForTest(el)
  assert.notEqual(sel, null)
  assert.ok(selectorFindsElement(sel, el), `"${sel}" does not find the div`)
})
