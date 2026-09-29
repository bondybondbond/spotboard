// #123: capturing an inline <svg> directly must not save the green capture outline / crosshair cursor
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'
import { el } from './helpers/fixtures.js'

installDomEnv()
const { sanitizeHTML } = await import('../.test-build/content.js')

const SVG_NS = 'http://www.w3.org/2000/svg'

test('directly captured svg drops capture outline and crosshair cursor', () => {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.appendChild(document.createElementNS(SVG_NS, 'path'))
  document.body.appendChild(el('div', null, [svg]))
  svg.style.setProperty('outline', '5px solid #00ff00', 'important')
  svg.style.cursor = 'crosshair'

  const out = sanitizeHTML(svg, [])
  assert.doesNotMatch(out, /outline/, 'outline stripped from svg root')
  assert.doesNotMatch(out, /crosshair/, 'cursor stripped from svg root')
  assert.match(out, /<path/, 'svg content kept')
})

test('html element capture still strips outline and cursor', () => {
  const d = el('div', null, [el('p', 'Hello')])
  document.body.appendChild(d)
  d.style.setProperty('outline', '5px solid #00ff00', 'important')
  d.style.cursor = 'crosshair'

  const out = sanitizeHTML(d, [])
  assert.doesNotMatch(out, /outline|crosshair/)
  assert.match(out, /Hello/)
})
