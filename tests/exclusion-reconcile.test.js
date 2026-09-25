// Coverage for #112: exclusions must persist through a page that unmounts/re-mounts nodes
// (virtualised lists), never land on a different row that recycled the same DOM position, and
// the virtualiser's spacer padding must not blank the preview.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'
import { el } from './helpers/fixtures.js'

installDomEnv()
const { reconcileLedger, similarSignature, isSpacerPadding } = await import('../.test-build/content.js')

function feed(...rows) {
  // <div root> <div class=row> <span class=name>text</span> <button class=follow>Follow</button> </div> ... </div>
  const root = el('div', null, rows.map(name => {
    const n = el('span', name); n.className = 'name'
    const f = el('button', 'Follow'); f.className = 'follow'
    const row = el('div', null, [n, f]); row.className = 'row'
    return row
  }))
  document.body.appendChild(root)
  return root
}
const entry = (node, sig = null) => ({ el: node, tag: node.tagName, text: node.textContent.toLowerCase().replace(/[0-9]+/g, '').trim(), sig })

test('a still-attached exclusion is kept untouched', () => {
  const root = feed('Alice Anderson')
  const name = root.querySelector('.name')
  const r = reconcileLedger([entry(name)], root)
  assert.deepEqual(r.ledger.map(e => e.el), [name]); assert.equal(r.revived.length, 0)
})

test('a single exclusion comes back when the same text re-mounts (new node)', () => {
  const root = feed('Alice Anderson', 'Bob Brown')
  const old = root.querySelector('.name'); const dormant = entry(old)
  root.firstChild.remove()                       // row unmounted
  const r1 = reconcileLedger([dormant], root)    // page shows only Bob -> stays dormant, not lost
  assert.equal(r1.ledger.length, 1); assert.equal(r1.ledger[0].el, null); assert.equal(r1.revived.length, 0)
  root.insertBefore(feed('Alice Anderson').firstChild, root.firstChild)  // scrolled back: Alice re-mounts
  const r2 = reconcileLedger(r1.ledger, root)
  assert.equal(r2.revived.length, 1); assert.equal(r2.revived[0].textContent, 'Alice Anderson')
})

test('NEGATIVE: a recycled row with different text is never excluded', () => {
  const root = feed('Alice Anderson')
  const dormant = { el: null, tag: 'SPAN', text: 'bob brown', sig: null }
  const r = reconcileLedger([dormant], root)
  assert.equal(r.revived.length, 0); assert.equal(r.ledger[0].el, null)
})

test('NEGATIVE: identical text on several nodes makes a single exclusion ambiguous -> stays dormant', () => {
  const root = feed('Same Name', 'Same Name')
  const dormant = { el: null, tag: 'SPAN', text: 'same name', sig: null }
  const r = reconcileLedger([dormant], root)
  assert.equal(r.revived.length, 0)
})

test('a Shift+click group re-applies to every matching node when rows re-mount', () => {
  const root = feed('Alice Anderson', 'Bob Brown', 'Cara Clark')
  const follows = [...root.querySelectorAll('.follow')]
  const sig = similarSignature(follows[0])
  const dormant = { el: null, tag: 'BUTTON', text: 'follow', sig }
  const r = reconcileLedger([dormant], root)
  assert.equal(r.revived.length, 3); assert.ok(r.revived.every(n => n.className === 'follow'))
})

test('a group re-applies only to nodes in the same structural place, not any node sharing a tag', () => {
  const root = feed('Alice Anderson')
  const stray = el('button', 'Follow'); stray.className = 'follow'; root.appendChild(stray) // different parent chain
  const sig = similarSignature(root.querySelector('.follow'))
  const r = reconcileLedger([{ el: null, tag: 'BUTTON', text: 'follow', sig }], root)
  assert.equal(r.revived.length, 1); assert.notEqual(r.revived[0], stray)
})

test('a node that is already excluded is not adopted twice', () => {
  const root = feed('Alice Anderson')
  const name = root.querySelector('.name')
  const r = reconcileLedger([entry(name), { el: null, tag: 'SPAN', text: 'alice anderson', sig: null }], root)
  assert.equal(r.ledger.filter(e => e.el).length, 1)
})

test('nested wrappers with identical text count as ONE candidate, and the closest-sized one is chosen', () => {
  const inner = el('div', 'Michael Andreuzza reshared')
  const outer = el('div', null, [inner])
  const root = el('div', null, [outer]); document.body.appendChild(root)
  const dormant = { el: null, tag: 'DIV', text: 'michael andreuzza reshared', sig: null, size: 0 }
  const r = reconcileLedger([dormant], root)
  assert.equal(r.revived.length, 1); assert.equal(r.revived[0], inner)   // size 0 matches the leaf
  const r2 = reconcileLedger([{ ...dormant, size: 1 }], root)
  assert.equal(r2.revived[0], outer)                                     // size 1 matches the wrapper
})

test('spacer padding is inline padding taller than the screen', () => {
  assert.equal(isSpacerPadding(2367, 700), true)
  assert.equal(isSpacerPadding(1624, 911), true)
  assert.equal(isSpacerPadding(120, 700), false)
  assert.equal(isSpacerPadding(0, 700), false)
  assert.equal(isSpacerPadding(500, 0), false)
})
