// #103: per-card list format is a render-time transform. These pin the detector on the shapes
// the plan named (real Daily Faceoff markup, text rows, image+title cards, existing lists,
// nothing repeated) plus idempotence and the invalid-value fallback.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const out = await build({
  entryPoints: ['src/utils/list-format.ts'], bundle: true, write: false, format: 'esm', platform: 'node'
})
const { applyListFormat, hasListableItems, normaliseListFormat } =
  await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'))

// Static fixture strings only (jsdom), never untrusted input
const parse = html => {
  const div = document.createElement('div')
  div.innerHTML = html
  return div
}

// Real Daily Faceoff capture shape (sidebar news): wrapper of sibling <a class="canvas-link"> rows
const dfoRow = t => `<a href="https://www.dailyfaceoff.com/news/x" target="_blank" class="canvas-link"><div class="flex min-h-32 flex-col justify-between border-b border-gray-200 p-2"><span class="text-lg">${t}</span></div></a>`
const DFO = `\n  <div class="flex w-full shrink-0 flex-col p-2"><div class="static top-0 mb-10 w-full lg:sticky">` +
  ['18 NHL players placed on waivers', 'Red Wings, Predators claim players', 'What should Toronto expect from McKenna'].map(dfoRow).join('') +
  `</div></div>\n`

test('Daily Faceoff link rows become a bulleted list, each row wrapped intact in an li', () => {
  const root = parse(DFO)
  assert.equal(applyListFormat(root, 'bullets'), 1)
  const lis = root.querySelectorAll('ul.sb-list > li')
  assert.equal(lis.length, 3)
  assert.equal(lis[0].firstElementChild.tagName, 'A')
  assert.equal(lis[0].querySelector('a').getAttribute('href'), 'https://www.dailyfaceoff.com/news/x')
})

test('numbered uses ol', () => {
  const root = parse(DFO)
  assert.equal(applyListFormat(root, 'numbered'), 1)
  assert.equal(root.querySelectorAll('ol.sb-list > li').length, 3)
  assert.equal(root.querySelector('ul'), null)
})

test('off (and any invalid value) leaves the DOM exactly as it was', () => {
  for (const v of ['off', undefined, null, 'garbage', 42, {}]) {
    const root = parse(DFO)
    const before = root.innerHTML
    assert.equal(applyListFormat(root, v), 0)
    assert.equal(root.innerHTML, before)
  }
})

test('normaliseListFormat: only bullets/numbered survive', () => {
  assert.equal(normaliseListFormat('bullets'), 'bullets')
  assert.equal(normaliseListFormat('numbered'), 'numbered')
  for (const v of ['off', 'Bullets', '', undefined, null, 7, ['bullets']]) assert.equal(normaliseListFormat(v), 'off')
})

test('applying twice is a no-op the second time (idempotent)', () => {
  const root = parse(DFO)
  applyListFormat(root, 'bullets')
  const once = root.innerHTML
  assert.equal(applyListFormat(root, 'bullets'), 0)
  assert.equal(applyListFormat(root, 'numbered'), 0)
  assert.equal(root.innerHTML, once)
})

test('switching format re-derives from the source html (bullets -> numbered -> off)', () => {
  const render = fmt => { const r = parse(DFO); applyListFormat(r, fmt); return r.innerHTML }
  assert.match(render('bullets'), /<ul class="sb-list">/)
  assert.match(render('numbered'), /<ol class="sb-list">/)
  assert.equal(render('off'), DFO)
})

test('plain text rows (div per row) are listed', () => {
  const root = parse('<div><div class="row">£4.99 Chicken</div><div class="row">£12 Duvet</div><div class="row">£1 Chocolate</div></div>')
  assert.equal(applyListFormat(root, 'bullets'), 1)
  assert.equal(root.querySelectorAll('li').length, 3)
})

test('image + title + price cards: the whole card stays intact inside the li', () => {
  const card = t => `<div class="deal"><img src="a.jpg" alt=""><a href="#">${t}</a><span>£5</span></div>`
  const root = parse(`<div>${card('One')}${card('Two')}${card('Three')}</div>`)
  assert.equal(applyListFormat(root, 'bullets'), 1)
  const li = root.querySelector('li')
  assert.ok(li.querySelector('img') && li.querySelector('a') && li.querySelector('span'))
})

test('an existing ul/ol is left alone and not searched (no nested lists)', () => {
  const root = parse('<div><ul><li>a</li><li>b</li></ul><ol><li>c</li><li>d</li></ol></div>')
  const before = root.innerHTML
  assert.equal(applyListFormat(root, 'bullets'), 0)
  assert.equal(root.innerHTML, before)
})

test('no repeated siblings: nothing detected, DOM untouched, hint says so', () => {
  const root = parse('<div><h2>Title</h2><p>One paragraph of text.</p><a href="#">a link</a></div>')
  const before = root.innerHTML
  assert.equal(hasListableItems(root), false)
  assert.equal(applyListFormat(root, 'bullets'), 0)
  assert.equal(root.innerHTML, before)
})

test('long prose paragraphs are not turned into a list', () => {
  const para = 'word '.repeat(80)
  const root = parse(`<div><p>${para}</p><p>${para}</p></div>`)
  assert.equal(applyListFormat(root, 'bullets'), 0)
})

test('headings and tables are never list items', () => {
  const root = parse('<div><h3>A</h3><h3>B</h3></div><table><tbody><tr><td>x</td></tr><tr><td>y</td></tr></tbody></table>')
  assert.equal(applyListFormat(root, 'bullets'), 0)
})

test('only two lookalike siblings is layout, not a list', () => {
  const root = parse('<div><div class="kv">Label</div><div class="kv">Value</div></div>')
  assert.equal(applyListFormat(root, 'bullets'), 0)
})

test('items with different classes are not grouped', () => {
  const root = parse('<div><div class="a">one</div><div class="b">two</div><div class="c">three</div></div>')
  assert.equal(applyListFormat(root, 'bullets'), 0)
})

test('hasListableItems is true before formatting, false after (so the menu hint must be read first)', () => {
  const root = parse(DFO)
  assert.equal(hasListableItems(root), true)
  applyListFormat(root, 'bullets')
  assert.equal(hasListableItems(root), false)
})
