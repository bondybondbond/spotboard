// Ported from the old root-level test-svg-chart-classification.js — same problem as the
// content-loss one: never node-runnable, its own header said "paste into the dashboard
// console." Same case matrix (built from STUDY-kalshi-charts.md §4's real measured
// attributes), now run against the real exported cleanupDuplicates() via `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { cleanupDuplicates } = await import('../.test-build/utils/dom-cleanup.js')

function longPath(len) {
  const unit = 'L12.3,45.6 '
  let d = 'M0,0 '
  while (d.length < len) d += unit
  return d.slice(0, len)
}

function nestedAxisLabels(count) {
  return Array.from({ length: count }, (_, i) =>
    `<svg><text fill="currentColor" x="${i * 10}" y="10">${i * 10}%</text></svg>`
  ).join('')
}

test('Kalshi chart (912x250, long paths, 12 nested axis labels): stamped + viewBox synthesized', () => {
  const html = `<svg width="912" height="250" style="background-color: var(--surface-x10)">
    <rect fill="var(--surface-x10)"></rect>
    <path stroke="var(--surface-x10)" d="${longPath(11223)}"></path>
    <path stroke="rgba(217,22,22,1)" d="${longPath(11223)}"></path>
    <path stroke="var(--surface-x10)" d="${longPath(11968)}"></path>
    <path stroke="rgba(38,92,255,1)" d="${longPath(11968)}"></path>
    ${nestedAxisLabels(12)}
  </svg>`
  const out = cleanupDuplicates(html)

  assert.match(out, /<svg/)
  assert.match(out, /data-sb-svg="chart"/)
  assert.match(out, /viewBox="0 0 912 250"/)
  assert.match(out, /width="100%"/)
  assert.doesNotMatch(out, /<svg[^>]*\sheight="250"/)
  assert.equal((out.match(/<svg><text/g) || []).length, 12)
})

test('Small icon (Kalshi wordmark, 55x16, no <text>): survives, NOT stamped', () => {
  const html = `<svg width="55" height="16"><path fill="rgba(0,0,0,1)" d="${longPath(1938)}"></path></svg>`
  const out = cleanupDuplicates(html)
  assert.match(out, /<svg/)
  assert.doesNotMatch(out, /data-sb-svg/)
})

test('Small icon WITH large internal viewBox: still not stamped, viewBox left untouched', () => {
  const html = `<svg width="55" height="16" viewBox="0 0 772 226"><path fill="rgba(0,0,0,1)" d="${longPath(1938)}"></path></svg>`
  const out = cleanupDuplicates(html)
  assert.doesNotMatch(out, /data-sb-svg/)
  assert.match(out, /viewBox="0 0 772 226"/)
})

test('Guardian-style broken SVG (no fill/stroke/currentColor): removed entirely', () => {
  const html = `<svg width="40" height="40"><path d="${longPath(1200)}"></path></svg>`
  const out = cleanupDuplicates(html)
  assert.doesNotMatch(out, /<svg/)
})

test('Bonus: nested <svg><text> (no own dims) inside a real parent <svg> survives', () => {
  const html = `<svg width="100" height="100"><rect fill="rgba(0,0,0,1)"></rect><svg><text fill="currentColor" x="0" y="10">50%</text></svg></svg>`
  const out = cleanupDuplicates(html)
  assert.match(out, /<svg/)
  assert.match(out, /<svg><text/)
})

test('Issue #3: fallback-less var() fill/stroke neutralized, valid paints untouched', () => {
  const html = `<svg width="912" height="250">
    <rect id="chart-bg" fill="var(--surface-x10)" width="912" height="250"></rect>
    <path class="gridline" stroke="var(--surface-x10)" d="${longPath(400)}"></path>
    <path class="gridline" stroke="var(--surface-x10)" d="${longPath(400)}"></path>
    <path class="series" stroke="rgba(217,22,22,1)" d="${longPath(11223)}"></path>
    <path class="series-var" stroke="var(--accent, #2266ee)" d="${longPath(400)}"></path>
    <g fill="var(--surface-x10)"><path class="inherits-fill" d="${longPath(400)}"></path></g>
  </svg>`
  const out = cleanupDuplicates(html)
  const box = new DOMParser().parseFromString(out, 'text/html')
  const q = sel => box.querySelector(sel)
  const gridlines = [...box.querySelectorAll('path.gridline')]
  const gFill = [...box.querySelectorAll('g')].find(g => g.querySelector('path.inherits-fill'))

  assert.equal(q('#chart-bg').getAttribute('fill'), 'none')
  assert.ok(gridlines.length === 2 && gridlines.every(p => p.getAttribute('stroke') === 'transparent'))
  assert.ok(box.querySelector('path.series[stroke="rgba(217,22,22,1)"]'))
  assert.equal(q('path.series-var').getAttribute('stroke'), 'var(--accent, #2266ee)')
  assert.equal(gFill.getAttribute('fill'), 'none')
  assert.equal(gFill.querySelector('path.inherits-fill').hasAttribute('fill'), false)
})
