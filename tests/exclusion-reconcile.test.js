// Coverage for #112: exclusions must survive a page that unmounts/re-mounts nodes (virtualised
// lists), never silently exclude a different row that recycled the same DOM position, and the
// virtualiser's spacer padding must not blank the preview.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'
import { el } from './helpers/fixtures.js'

installDomEnv()
const { reconcileExclusions, isSpacerPadding } = await import('../.test-build/content.js')

function list(...texts) {
  const root = el('div', null, texts.map((t, i) => { const row = el('p', t); row.className = `row-${i}`; return row }))
  document.body.appendChild(root)
  return root
}
const rec = (sel, text) => ({ sel, text })

test('a still-attached exclusion is kept untouched', () => {
  const root = list('Buy now', 'News story')
  const row = root.children[0]
  const r = reconcileExclusions([row], new Map([[row, rec('.row-0', 'buy now')]]), root)
  assert.deepEqual(r.kept, [row]); assert.equal(r.lost.length, 0); assert.equal(r.revived.size, 0)
})

test('a detached exclusion is revived when the same content re-mounts at its selector', () => {
  const root = list('Buy now', 'News story')
  const old = root.children[0]
  old.remove()
  const remounted = el('p', 'Buy now'); remounted.className = 'row-0'
  root.insertBefore(remounted, root.firstChild)
  const r = reconcileExclusions([old], new Map([[old, rec('.row-0', 'buy now')]]), root)
  assert.deepEqual(r.kept, [remounted]); assert.equal(r.revived.get(old), remounted)
})

test('NEGATIVE: a recycled row with different text at the same selector is NOT excluded', () => {
  const root = list('Buy now', 'News story')
  const old = root.children[0]
  old.remove()
  const recycled = el('p', 'A post the user wants to keep'); recycled.className = 'row-0'
  root.insertBefore(recycled, root.firstChild)
  const r = reconcileExclusions([old], new Map([[old, rec('.row-0', 'buy now')]]), root)
  assert.equal(r.kept.length, 0); assert.deepEqual(r.lost, [old])
})

test('a detached exclusion whose selector matches nothing, or several nodes, is lost', () => {
  const root = list('Buy now', 'Buy now')
  const gone = el('p', 'Buy now')
  assert.deepEqual(reconcileExclusions([gone], new Map([[gone, rec('.nope', 'buy now')]]), root).lost, [gone])
  const two = el('p', 'Buy now')
  assert.deepEqual(reconcileExclusions([two], new Map([[two, rec('p', 'buy now')]]), root).lost, [two])
})

test('a detached exclusion with no comparable text (icon/image only) is lost, never guessed', () => {
  const root = list('x', 'News story')
  const old = el('p', '')
  const r = reconcileExclusions([old], new Map([[old, rec('.row-0', '')]]), root)
  assert.deepEqual(r.lost, [old])
})

test('spacer padding is inline padding taller than the screen', () => {
  assert.equal(isSpacerPadding(2367, 700), true)
  assert.equal(isSpacerPadding(1624, 911), true)
  assert.equal(isSpacerPadding(120, 700), false)   // ordinary design padding on a small block
  assert.equal(isSpacerPadding(0, 700), false)
  assert.equal(isSpacerPadding(500, 0), false)     // unmeasurable viewport: never strip
})

test('a re-mounted node is not adopted twice when it is already an attached exclusion', () => {
  const root = list('Buy now', 'News story')
  const attachedRow = root.children[0]
  const stale = el('p', 'Buy now')
  const r = reconcileExclusions([attachedRow, stale], new Map([[stale, rec('.row-0', 'buy now')]]), root)
  assert.deepEqual(r.kept, [attachedRow]); assert.deepEqual(r.lost, [stale])
})

test('NEGATIVE: identical text elsewhere in the card makes revival ambiguous -> lost', () => {
  const root = list('Sponsored', 'Sponsored', 'News story')
  const stale = el('p', 'Sponsored')
  const r = reconcileExclusions([stale], new Map([[stale, rec('.row-0', 'sponsored')]]), root)
  assert.deepEqual(r.lost, [stale])
})
