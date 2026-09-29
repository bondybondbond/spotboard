// #72: a refresh that comes back with fewer images than the card holds AND still shows unfilled
// thumbnail slots is a lazy-load miss -- keep the richer stored card.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
g.LazyLoad = await import('../.test-build/utils/lazy-load.js')

const body = '<p>Enough headline text here to keep the card well clear of the empty-content guard.</p>'
const filled = n => Array.from({ length: n }, (_, i) => `<div class="thumb-container"><img src="https://x.test/${i}.jpg"></div>`).join('')
const emptySlots = n => '<div class="thumbnail-box"></div>'.repeat(n)
const card = html => ({ name: 'CNBC', html_cache: html })

test('fewer images + unfilled slots -> refresh rejected, original kept', () => {
  const r = g._finalizeSuccess(`<div>${body}${filled(3)}${emptySlots(18)}</div>`, card(`<div>${body}${filled(21)}</div>`))
  assert.equal(r.success, false)
  assert.equal(r.keepOriginal, true)
  assert.equal(r.error, 'Refresh returned fewer images')
})

test('fewer images but no unfilled slots is ordinary churn -> accepted', () => {
  const r = g._finalizeSuccess(`<div>${body}${filled(2)}</div>`, card(`<div>${body}${filled(21)}</div>`))
  assert.equal(r.success, true)
})

test('equal image count with unfilled slots is not a regression -> accepted (no lock-out of an already-degraded card)', () => {
  const r = g._finalizeSuccess(`<div>${body}${filled(3)}${emptySlots(18)}</div>`, card(`<div>${body}${filled(3)}${emptySlots(18)}</div>`))
  assert.equal(r.success, true)
})

test('small cached image count (< 3) never triggers the guard', () => {
  const r = g._finalizeSuccess(`<div>${body}${filled(1)}${emptySlots(5)}</div>`, card(`<div>${body}${filled(2)}</div>`))
  assert.equal(r.success, true)
})

test('a cache that already has unfilled slots is not protected (no lock-out of a degraded card)', () => {
  const r = g._finalizeSuccess(`<div>${body}${filled(4)}${emptySlots(18)}</div>`, card(`<div>${body}${filled(6)}${emptySlots(12)}</div>`))
  assert.equal(r.success, true)
})
