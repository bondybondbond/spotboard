// #66: exclude from the preview. sanitizeHTML can build a preview-only clone -> live map, so a
// click in the preview resolves to the exact live element. These tests pin the three things the
// feature relies on: the map points at live nodes, the stamp never changes what the preview
// renders, and neither the live page nor the saved (no-map) HTML ever carries the stamp.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'
import { el } from './helpers/fixtures.js'

installDomEnv()
const { sanitizeHTML, PREVIEW_PID_ATTR } = await import('../.test-build/content.js')

const stripPids = html => html.replace(/ data-sb-pid="\d+"/g, '')
const parse = html => new DOMParser().parseFromString(html, 'text/html')

function buildRoot() {
  const caption = el('p', 'Display for hour-by-hour forecast')
  const cell = el('span', '12°')
  const root = el('div', null, [
    el('h2', 'Forecast'),
    caption,
    el('table', null, [el('tbody', null, [el('tr', null, [el('td', null, [cell])])])])
  ])
  document.body.appendChild(root)
  return { root, caption, cell }
}

test('every stamped preview node maps to the live element it was cloned from', () => {
  const { root, caption, cell } = buildRoot()
  const map = new Map()
  const stamped = parse(sanitizeHTML(root, [], map)).querySelectorAll(`[${PREVIEW_PID_ATTR}]`)
  assert.ok(stamped.length > 0, 'preview carries pids')
  stamped.forEach(node => {
    const live = map.get(node.getAttribute(PREVIEW_PID_ATTR))
    assert.ok(live, 'pid resolves')
    assert.ok(live === root || root.contains(live), 'maps into the live capture root')
    assert.equal(live.tagName, node.tagName, 'same element kind as the preview node')
  })
  const captionPreview = Array.from(stamped).find(n => n.textContent === 'Display for hour-by-hour forecast')
  assert.equal(map.get(captionPreview.getAttribute(PREVIEW_PID_ATTR)), caption)
  const cellPreview = Array.from(stamped).find(n => n.tagName === 'SPAN')
  assert.equal(map.get(cellPreview.getAttribute(PREVIEW_PID_ATTR)), cell)
  root.remove()
})

test('the stamp does not change what the preview renders, and the save path never carries it', () => {
  const { root, caption } = buildRoot()
  const withMap = sanitizeHTML(root, [caption], new Map())
  const saved = sanitizeHTML(root, [caption])
  assert.equal(stripPids(withMap), saved, 'identical once pids are stripped')
  assert.ok(!saved.includes(PREVIEW_PID_ATTR), 'saved HTML has no pid')
  assert.doesNotMatch(saved, /hour-by-hour/, 'exclusion still applied')
  root.remove()
})

test('the live page is never stamped', () => {
  const { root } = buildRoot()
  sanitizeHTML(root, [], new Map())
  assert.equal(root.querySelectorAll(`[${PREVIEW_PID_ATTR}]`).length, 0)
  assert.ok(!root.hasAttribute(PREVIEW_PID_ATTR))
  root.remove()
})

test('negative: flattened open-shadow content has no pid of its own, so it resolves to its host', () => {
  const host = document.createElement('div')
  host.attachShadow({ mode: 'open' }).appendChild(el('p', 'ShadowText'))
  const root = el('div', null, [host, el('p', 'Light')])
  document.body.appendChild(root)
  const map = new Map()
  const doc = parse(sanitizeHTML(root, [], map))
  const shadowPara = Array.from(doc.querySelectorAll('p')).find(p => p.textContent === 'ShadowText')
  assert.ok(!shadowPara.hasAttribute(PREVIEW_PID_ATTR), 'shadow-internal node is unstamped')
  const owner = shadowPara.closest(`[${PREVIEW_PID_ATTR}]`)
  assert.equal(map.get(owner.getAttribute(PREVIEW_PID_ATTR)), host, 'nearest stamped ancestor is the shadow host')
  root.remove()
})

test('slotted light-DOM children keep their own mapping through the shadow flatten', () => {
  const host = document.createElement('div')
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.appendChild(el('section', null, [document.createElement('slot')]))
  const slotted = el('p', 'SlottedText')
  host.appendChild(slotted)
  const root = el('div', null, [host])
  document.body.appendChild(root)
  const map = new Map()
  const doc = parse(sanitizeHTML(root, [], map))
  const para = Array.from(doc.querySelectorAll('p')).find(p => p.textContent === 'SlottedText')
  assert.equal(map.get(para.getAttribute(PREVIEW_PID_ATTR)), slotted)
  root.remove()
})
