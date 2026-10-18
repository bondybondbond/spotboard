// #137: a chart svg inside a site-pinned pixel-width wrapper (Kalshi: 912px) is stamped so the
// dashboard can clamp the wrapper to the card. Everything that already fits must be untouched.
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
const axisLabels = Array.from({ length: 4 }, (_, i) => `<svg><text fill="currentColor" x="${i * 10}" y="10">${i * 25}%</text></svg>`).join('')
const chart = (attrs) => `<svg ${attrs}>
  <rect fill="none" width="10" height="10"></rect>
  <path stroke="rgba(38,92,255,1)" d="${longPath(2000)}"></path>
  ${axisLabels}
</svg>`

const parse = (html) => {
  const box = document.createElement('div')
  box.innerHTML = html
  return box
}

test('Kalshi shape (fluid svg, viewBox 912x250, inline 912px wrapper): svg + wrapper stamped', () => {
  const out = cleanupDuplicates(`<div style="position: relative; width: 912px; height: 250px; flex: 0 0 auto">${chart('width="100%" viewBox="0 0 912 250" preserveAspectRatio="xMidYMid meet"')}</div>`)
  const box = parse(out)
  const svg = box.querySelector('svg[data-sb-svg="chart"]')
  assert.equal(svg.getAttribute('data-sb-fit'), 'wide')
  assert.equal(svg.getAttribute('preserveAspectRatio'), 'none')
  assert.equal(svg.style.getPropertyValue('height'), '250px')
  assert.equal(svg.style.getPropertyPriority('height'), 'important')
  assert.ok(svg.parentElement.hasAttribute('data-sb-fit-wrap'))
  assert.equal(box.querySelectorAll('[data-sb-fit-wrap]').length, 1)
})

test('wrapper two levels above the svg is the one stamped', () => {
  const out = cleanupDuplicates(`<div style="width: 912px"><div><div>${chart('width="100%" viewBox="0 0 912 250"')}</div></div></div>`)
  const box = parse(out)
  assert.equal(box.querySelector('[data-sb-fit-wrap]').getAttribute('style').includes('912px'), true)
  assert.equal(box.querySelector('svg[data-sb-svg="chart"]').getAttribute('data-sb-fit'), 'wide')
})

test('idempotent: a stored copy re-run through the sanitizer is unchanged', () => {
  const once = cleanupDuplicates(`<div style="width: 912px; height: 250px">${chart('width="100%" viewBox="0 0 912 250"')}</div>`)
  assert.equal(cleanupDuplicates(once), once)
})

test('narrow copy (viewBox 269, wrapper 269px): untouched', () => {
  const box = parse(cleanupDuplicates(`<div style="width: 269px; height: 250px">${chart('width="100%" viewBox="0 0 269 250"')}</div>`))
  assert.equal(box.querySelector('svg[data-sb-svg="chart"]').hasAttribute('data-sb-fit'), false)
  assert.equal(box.querySelector('[data-sb-fit-wrap]'), null)
  assert.notEqual(box.querySelector('svg[data-sb-svg="chart"]').getAttribute('preserveAspectRatio'), 'none')
})

test('wide chart in a fluid container (no inline pixel width): untouched', () => {
  const box = parse(cleanupDuplicates(`<div style="width: 100%">${chart('width="100%" viewBox="0 0 912 250"')}</div>`))
  assert.equal(box.querySelector('svg[data-sb-svg="chart"]').hasAttribute('data-sb-fit'), false)
  assert.equal(box.querySelector('[data-sb-fit-wrap]'), null)
})

test('pixel-dimension chart (width/height attributes, no pinned wrapper): untouched by the fit', () => {
  const box = parse(cleanupDuplicates(chart('width="912" height="250"')))
  const svg = box.querySelector('svg[data-sb-svg="chart"]')
  assert.equal(svg.getAttribute('viewBox'), '0 0 912 250')
  assert.equal(svg.hasAttribute('data-sb-fit'), false)
})

test('short wide strip (viewBox height under 100) and small wrapper: untouched', () => {
  const strip = parse(cleanupDuplicates(`<div style="width: 912px">${chart('width="100%" viewBox="0 0 912 60"')}</div>`))
  assert.equal(strip.querySelector('svg[data-sb-svg="chart"]').hasAttribute('data-sb-fit'), false)
  const small = parse(cleanupDuplicates(`<div style="width: 500px">${chart('width="100%" viewBox="0 0 500 250"')}</div>`))
  assert.equal(small.querySelector('svg[data-sb-svg="chart"]').hasAttribute('data-sb-fit'), false)
})

test('nested axis svgs and icons are never stamped', () => {
  const box = parse(cleanupDuplicates(`<div style="width: 912px">${chart('width="100%" viewBox="0 0 912 250"')}</div><svg width="55" height="16"><path fill="rgba(0,0,0,1)" d="${longPath(1938)}"></path></svg>`))
  assert.equal(box.querySelectorAll('[data-sb-fit]').length, 1)
  assert.equal(box.querySelectorAll('svg[data-sb-svg="chart"] svg[data-sb-fit]').length, 0)
})

test('two pinned ancestors: both are clamped, so the outer one cannot keep the sideways scroll', () => {
  const box = parse(cleanupDuplicates(`<div style="width: 912px"><div style="width: 650px">${chart('width="100%" viewBox="0 0 912 250"')}</div></div>`))
  assert.equal(box.querySelectorAll('[data-sb-fit-wrap]').length, 2)
})

test('thresholds: a wide viewBox in a small wrapper, and the exact 600 / 100 edges', () => {
  const fits = (wrapperPx, vb) => parse(cleanupDuplicates(`<div style="width: ${wrapperPx}px">${chart(`width="100%" viewBox="${vb}"`)}</div>`))
    .querySelector('svg[data-sb-svg="chart"]').hasAttribute('data-sb-fit')
  assert.equal(fits(500, '0 0 912 250'), false, 'wide viewBox but wrapper under 600')
  assert.equal(fits(912, '0 0 599 250'), false, 'viewBox 599 wide')
  assert.equal(fits(912, '0 0 600 250'), true, 'viewBox 600 wide')
  assert.equal(fits(912, '0 0 912 99'), false, 'viewBox 99 tall')
  assert.equal(fits(912, '0 0 912 100'), true, 'viewBox 100 tall')
  assert.equal(fits(599, '0 0 912 250'), false, 'wrapper 599px')
  assert.equal(fits(600, '0 0 912 250'), true, 'wrapper 600px')
})

test('pixel-dimension chart INSIDE a pinned wrapper is fitted too (same clip, older Kalshi shape)', () => {
  const box = parse(cleanupDuplicates(`<div style="width: 912px">${chart('width="912" height="250"')}</div>`))
  assert.equal(box.querySelector('svg[data-sb-svg="chart"]').getAttribute('data-sb-fit'), 'wide')
  assert.ok(box.querySelector('[data-sb-fit-wrap]'))
})

test('the CSS that clamps the wrapper exists in BOTH the dashboard and the capture preview', async () => {
  const { readFileSync } = await import('node:fs')
  const rule = /\[data-sb-fit-wrap\]\s*\{\s*max-width:\s*100%\s*!important;?\s*\}/
  assert.match(readFileSync(new URL('../public/dashboard.html', import.meta.url), 'utf8'), rule)
  assert.match(readFileSync(new URL('../src/content.ts', import.meta.url), 'utf8'), rule)
})

test('reach: a pinned wrapper 3 levels up is stamped, 4 levels up is not; an icon inside a pinned wrapper is never stamped', () => {
  const near = parse(cleanupDuplicates(`<div style="width: 912px"><div><div>${chart('width="100%" viewBox="0 0 912 250"')}</div></div></div>`))
  assert.ok(near.querySelector('[data-sb-fit-wrap]'))
  const far = parse(cleanupDuplicates(`<div style="width: 912px"><div><div><div>${chart('width="100%" viewBox="0 0 912 250"')}</div></div></div></div>`))
  assert.equal(far.querySelector('[data-sb-fit-wrap]'), null)
  const icon = parse(cleanupDuplicates(`<div style="width: 912px"><svg width="55" height="16"><path fill="rgba(0,0,0,1)" d="${longPath(1938)}"></path></svg></div>`))
  assert.equal(icon.querySelectorAll('[data-sb-fit],[data-sb-fit-wrap]').length, 0)
})
