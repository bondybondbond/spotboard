// #177: capturing a region whose root IS a <td>/<th> saved `td:nth-child(N) td` -- "a td inside
// a td" -- which can never match the captured cell, so the card failed its first refresh with
// "came back empty" (Hacker News). generateSelector's table-cell step used element.closest(),
// which includes the element itself. A captured cell must get a selector that resolves to it.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { __generateSelectorForTest, __generateExclusionSelectorForTest } = await import('../.test-build/content.js')

beforeEach(() => { document.body.innerHTML = '' })

function assertResolvesToOnly(el) {
  const sel = __generateSelectorForTest(el)
  const found = document.querySelectorAll(sel)
  assert.equal(found.length, 1, `"${sel}" matched ${found.length} elements`)
  assert.equal(found[0], el, `"${sel}" matched a different element`)
  return sel
}

// Hacker News shape: the story list is a <tbody> inside a table inside <td> of <tr id="bigbox">.
const HN = `
<table id="hnmain"><tbody>
  <tr id="pagespace"><td></td></tr>
  <tr><td><table class="header"><tbody><tr><td><a href="/">Hacker News</a></td></tr></tbody></table></td></tr>
  <tr id="bigbox"><td><table><tbody>
    <tr class="athing"><td class="title"><span class="rank">1.</span></td><td class="title"><a href="/a">Story one</a></td></tr>
    <tr class="athing"><td class="title"><span class="rank">2.</span></td><td class="title"><a href="/b">Story two</a></td></tr>
  </tbody></table></td></tr>
</tbody></table>`

test('HN: the td holding the story list resolves to itself (the #177 repro)', () => {
  document.body.innerHTML = HN
  const td = document.querySelector('#bigbox > td')
  const sel = assertResolvesToOnly(td)
  assert.notEqual(sel, 'td:nth-child(1) td')
})

test('a td in a repeated, id-less data table resolves to that one td', () => {
  document.body.innerHTML = `<table class="data"><tbody>
    <tr><td>a1</td><td>b1</td></tr>
    <tr><td>a2</td><td>b2</td></tr>
    <tr><td>a3</td><td>b3</td></tr>
  </tbody></table>`
  const target = document.querySelectorAll('tr')[1].children[1]
  assert.equal(target.textContent, 'b2')
  assertResolvesToOnly(target)
})

test('a th resolves to itself', () => {
  document.body.innerHTML = `<table class="data"><tbody>
    <tr><th>Time</th><th>Wind</th></tr>
    <tr><td>00</td><td>4</td></tr>
  </tbody></table>`
  assertResolvesToOnly(document.querySelectorAll('th')[1])
})

test('a td nested inside another td resolves to the inner td, not just any td in that column', () => {
  document.body.innerHTML = `<table class="outer"><tbody>
    <tr><td><table class="inner"><tbody>
      <tr><td>x1</td><td>y1</td></tr>
      <tr><td>x2</td><td>y2</td></tr>
    </tbody></table></td><td>side</td></tr>
  </tbody></table>`
  assertResolvesToOnly(document.querySelectorAll('.inner tr')[1].children[1])
})

// Negatives: captures that are NOT a cell keep exactly the selector they had before the fix.
test('negative: the tbody inside a td keeps its column-context selector', () => {
  document.body.innerHTML = HN
  const tbody = document.querySelector('#bigbox > td > table > tbody')
  assert.equal(__generateSelectorForTest(tbody), 'td:nth-child(1) tbody')
})

test('negative: an element inside a cell keeps its column-context selector', () => {
  document.body.innerHTML = `<table class="data"><tbody>
    <tr><td><span class="v">a1</span></td><td><span class="v">b1</span></td></tr>
    <tr><td><span class="v">a2</span></td><td><span class="v">b2</span></td></tr>
  </tbody></table>`
  const span = document.querySelectorAll('tr')[1].children[1].querySelector('span')
  assert.equal(__generateSelectorForTest(span), 'td:nth-child(2) > span.v')
})

test('negative: a plain div among repeated divs keeps its pre-fix selector', () => {
  document.body.innerHTML = '<section><div class="card">a</div><div class="card">b</div><div class="card">c</div></section>'
  const second = document.querySelectorAll('.card')[1]
  assert.equal(__generateSelectorForTest(second), 'div.card:nth-of-type(2)')
})

// A directly-excluded cell must still get the whole-column rule (#67); the capture fix must not
// route it to a single-row positional path instead.
test('exclusion: a directly-excluded td in a repeated-row table still gets the table-column selector', () => {
  document.body.innerHTML = `<div id="root"><table class="wx-table"><tbody>
    <tr><td>00</td><td>4 m/s</td></tr>
    <tr><td>01</td><td>5 m/s</td></tr>
    <tr><td>02</td><td>6 m/s</td></tr>
  </tbody></table></div>`
  const root = document.getElementById('root')
  const cell = root.querySelectorAll('tr')[1].children[1]
  assert.equal(__generateExclusionSelectorForTest(cell, root), 'table.wx-table tr > td:nth-child(2)')
})

test('exclusion: a directly-excluded td with a stable id is still excluded by that id, not the whole column', () => {
  document.body.innerHTML = `<div id="root"><table class="wx-table"><tbody>
    <tr><td>00</td><td id="wind-1">4 m/s</td></tr>
    <tr><td>01</td><td id="wind-2">5 m/s</td></tr>
  </tbody></table></div>`
  const root = document.getElementById('root')
  assert.equal(__generateExclusionSelectorForTest(root.querySelector('#wind-2'), root), '#wind-2')
})
