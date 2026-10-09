// #180: the capture preview (getPreviewCSS in src/content.ts) must size images exactly like the dashboard card
// (public/dashboard.html). Commit 2c66640 raised the dashboard's "preview" tier to 280x200 but left the preview at
// 150x150, so a Cricbuzz hero image looked small in the preview and the headline wrapped beside it.
// Text-level parity check: the two stylesheets are hand-kept copies, so compare their image-tier size rules.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const content = readFileSync(new URL('../src/content.ts', import.meta.url), 'utf8')
const dashboard = readFileSync(new URL('../public/dashboard.html', import.meta.url), 'utf8')

const TIERS = ['icon', 'small', 'thumbnail', 'medium', 'preview']

// Returns { 'max-width': '280px', 'max-height': '200px' } for the first rule whose selector ends with `selector`.
function sizeRule(css, selector) {
  const at = css.indexOf(selector + ' {')
  assert.notEqual(at, -1, `rule not found: ${selector}`)
  const body = css.slice(at, css.indexOf('}', at))
  const size = {}
  for (const prop of ['max-width', 'max-height']) {
    const m = body.match(new RegExp(`${prop}:\\s*(\\d+px)`))
    assert.ok(m, `${prop} missing in ${selector}`)
    size[prop] = m[1]
  }
  return size
}

for (const tier of TIERS) {
  test(`#180: preview and dashboard agree on the "${tier}" image tier`, () => {
    const sel = `img[data-scale-context="${tier}"]`
    assert.deepEqual(sizeRule(content, sel), sizeRule(dashboard, `.component-content ${sel}`))
  })
}

test('#180: preview and dashboard agree on the unclassified-image fallback', () => {
  assert.deepEqual(sizeRule(content, 'img:not([data-scale-context])'), sizeRule(dashboard, '.component-content img:not([data-scale-context])'))
})

test('#180: the Cricbuzz-style hero tier is the 280x200 the board card uses', () => {
  assert.deepEqual(sizeRule(content, 'img[data-scale-context="preview"]'), { 'max-width': '280px', 'max-height': '200px' })
})
