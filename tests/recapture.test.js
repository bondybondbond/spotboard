// Coverage for #52: re-capture replaces a broken card in place. The merge must keep every
// non-capture field (a partial sync write silently strips metadata) and the button must only
// appear for failures a fresh capture actually fixes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
const { mergeRecapture } = await import('../.test-build/utils/recapture.js')

const NOW = '2026-09-26T10:00:00.000Z'
const oldSync = () => ({
  id: 'c1', url: 'https://example.com/original', name: 'Old name', customLabel: 'My label', favicon: 'f.png',
  selector: 'div.old', headingFingerprint: 'old heading', structureMarker: 'old-marker', positionBased: false,
  excludedSelectors: ['div.old-excl'], exclusionsStorage: 'sync', refreshPaused: true, cardSize: '2x1', board: 'news',
  requiresActiveFocus: true, created_at: '2026-01-01T00:00:00.000Z', last_refresh: '2026-02-01T00:00:00.000Z',
  lastAttemptAt: '2026-09-25T00:00:00.000Z', lastSuccessAt: '2026-02-01T00:00:00.000Z',
  lastOutcome: 'failed', lastErrorCode: 'layout_changed', lastErrorAt: '2026-09-25T00:00:00.000Z'
})
const oldLocal = () => ({ selector: 'div.old', html_cache: '', last_refresh: 'x', excludedSelectors: ['div.old-excl'], rawCaptureLength: 5, originalCaptureLength: 9, exclusionSignatures: [{ sel: 'a' }] })
const capture = () => ({
  selector: 'div.new', headingFingerprint: 'new heading', structureMarker: null, positionBased: true,
  excludedSelectors: ['div.new-excl'], html_cache: '<div>fresh</div>', rawCaptureLength: 99, exclusionSignatures: [{ sel: 'b' }]
})

test('merge keeps id, ORIGINAL url, label, position/pause/board and other non-capture fields', () => {
  const { sync } = mergeRecapture(oldSync(), oldLocal(), capture(), NOW)
  for (const k of ['id', 'url', 'name', 'customLabel', 'favicon', 'refreshPaused', 'cardSize', 'board', 'requiresActiveFocus', 'created_at']) {
    assert.deepEqual(sync[k], oldSync()[k], k)
  }
})

test('merge overwrites capture-derived fields and clears the failure state', () => {
  const { sync, local } = mergeRecapture(oldSync(), oldLocal(), capture(), NOW)
  assert.equal(sync.selector, 'div.new')
  assert.equal(sync.headingFingerprint, 'new heading')
  assert.equal(sync.positionBased, true)
  assert.deepEqual(sync.excludedSelectors, ['div.new-excl'])
  assert.equal('structureMarker' in sync, false, 'stale marker must not survive a capture without one')
  assert.equal(sync.lastOutcome, 'success')
  assert.equal(sync.lastErrorCode, null)
  assert.equal(sync.lastErrorAt, null)
  assert.equal(sync.lastSuccessAt, NOW)
  assert.equal(local.html_cache, '<div>fresh</div>')
  assert.equal(local.selector, 'div.new')
  assert.equal(local.rawCaptureLength, 99)
  assert.deepEqual(local.exclusionSignatures, [{ sel: 'b' }])
  assert.equal('originalCaptureLength' in local, false, 'old drift baseline is dropped')
})

test('merge does not mutate the stored records it was given', () => {
  const s = oldSync(); const l = oldLocal()
  mergeRecapture(s, l, capture(), NOW)
  assert.deepEqual(s, oldSync()); assert.deepEqual(l, oldLocal())
})

test('merge works when the card has no local record yet', () => {
  const { local } = mergeRecapture(oldSync(), undefined, capture(), NOW)
  assert.equal(local.html_cache, '<div>fresh</div>')
})

test('a new structureMarker is kept', () => {
  const { sync } = mergeRecapture(oldSync(), oldLocal(), { ...capture(), structureMarker: 'm2' }, NOW)
  assert.equal(sync.structureMarker, 'm2')
})

test('button: shown for layout_changed / content_lost / exclusions_unapplied failures', () => {
  for (const code of ['layout_changed', 'content_lost', 'exclusions_unapplied']) {
    assert.equal(g.shouldOfferRecapture({ lastOutcome: 'failed', lastErrorCode: code, html_cache: '<p>x</p>' }), true, code)
  }
})

test('button: NOT shown for network / skeleton / render_degraded / drift / unknown failures', () => {
  for (const code of ['network', 'skeleton', 'render_degraded', 'content_drift', 'unknown', null]) {
    assert.equal(g.shouldOfferRecapture({ lastOutcome: 'failed', lastErrorCode: code, html_cache: '' }), false, String(code))
  }
})

test('button: shown for a finished-but-empty card, not for a brand-new card mid first capture', () => {
  assert.equal(g.shouldOfferRecapture({ lastOutcome: 'success', lastAttemptAt: NOW, html_cache: '' }), true)
  assert.equal(g.shouldOfferRecapture({ html_cache: '' }), false)
  assert.equal(g.shouldOfferRecapture({ html_cache: '   ' }), false)
})

test('button: not shown for a healthy card', () => {
  assert.equal(g.shouldOfferRecapture({ lastOutcome: 'success', lastAttemptAt: NOW, html_cache: '<p>ok</p>' }), false)
})
