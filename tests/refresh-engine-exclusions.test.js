// #96 engine-level coverage: the exclusion-integrity gate in _finalizeSuccess, the tier
// escalation in refreshComponent, local-field persistence in applyRefreshResult, the empty-shell
// filter on direct fetch, and (source guard) keeping the local-only field out of the sync record
// on import. refresh-engine.js is a plain browser script; the helper loads it into the jsdom
// test environment the way dashboard.html does.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
const realRefresh = g.refreshComponent
const realTabRefresh = g.tabBasedRefresh

beforeEach(() => { g.refreshComponent = realRefresh; g.tabBasedRefresh = realTabRefresh })

const SIGS = [{ sel: 'div.pills', sig: 'yes ¢ no ¢', keep: 0 }]
const goodHtml = '<div class="card"><h2>Title</h2><p>Some real content that is long enough to matter here.</p><ul><li>a</li><li>b</li><li>c</li></ul></div>'

function comp(extra = {}) {
  return { id: 'c1', name: 'Card', url: 'https://example.com/', selector: 'div.card', html_cache: goodHtml, excludedSelectors: ['div.pills'], exclusionSignatures: SIGS, ...extra }
}

// ---------- _finalizeSuccess gate ----------

test('gate: leaked exclusion rejects the refresh, keeps original, flags exclusionLeak', () => {
  const c = comp()
  const html = g.applySanitizationPipeline('<div class="card"><h2>T</h2><p>Body text here for the card</p><ul><li>a</li><li>b</li><li>c</li></ul><div>Yes 90¢ No 11¢</div></div>', c)
  const r = g._finalizeSuccess(html, c, {})
  assert.equal(r.success, false)
  assert.equal(r.exclusionLeak, true)
  assert.equal(r.keepOriginal, true)
  assert.equal(g.classifyError(r.error), 'exclusions_unapplied')
  assert.match(g.getErrorLabel('exclusions_unapplied'), /re-capture/i)
})

test('gate: no leak (excluded text absent) commits normally', () => {
  const c = comp()
  const html = g.applySanitizationPipeline('<div class="card"><h2>T</h2><p>Body text here for the card, long enough</p><ul><li>a</li><li>b</li><li>c</li></ul></div>', c)
  const r = g._finalizeSuccess(html, c, {})
  assert.equal(r.success, true)
})

test('gate: a verdict computed for a DIFFERENT html string is ignored (no cross-pass contamination)', () => {
  const c = comp()
  g.applySanitizationPipeline('<div class="card"><p>Body here</p><div>Yes 90¢ No 11¢</div></div>', c) // leaking pass
  assert.ok(c.__exclusionCheck.leaked.length > 0)
  const r = g._finalizeSuccess(goodHtml, c, {}) // finalising some other, clean html
  assert.equal(r.success, true)
})

test('gate: legacy card with no signatures never fails on this gate', () => {
  const c = comp({ exclusionSignatures: undefined })
  const html = g.applySanitizationPipeline('<div class="card"><p>Body text for card, long enough</p><ul><li>a</li><li>b</li><li>c</li></ul><div>Yes 90¢ No 11¢</div></div>', c)
  assert.equal(g._finalizeSuccess(html, c, {}).success, true)
})

test('gate: content-loss guard still runs first and is unchanged', () => {
  const c = comp({ excludedSelectors: [], exclusionSignatures: [] })
  const r = g._finalizeSuccess('<div></div>', c, {})
  assert.equal(r.success, false)
  assert.equal(r.error, 'Refresh returned empty content')
  assert.equal(r.exclusionLeak, undefined)
})

// ---------- a leak fails safe in ONE attempt (no tier rotation) ----------

test('leak: refreshComponent fails safe immediately -- no extra tab/popup attempts', async () => {
  // direct fetch returns a card whose excluded text is back and whose selector no longer matches
  const page = '<html><body><div class="card"><h2>Title</h2><p>Body text for the card, long enough to count.</p><ul><li><a href="/1">one</a></li><li><a href="/2">two</a></li><li><a href="/3">three</a></li></ul><div>Yes 90¢ No 11¢</div></div></body></html>'
  global.fetch = async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => page })
  let tabCalls = 0
  g.tabBasedRefresh = async () => { tabCalls++; return { html: null, activeFocusNeeded: false } }
  const r = await g.refreshComponent(comp())
  assert.equal(r.success, false)
  assert.equal(r.exclusionLeak, true)
  assert.equal(r.keepOriginal, true)
  assert.equal(tabCalls, 0, 'a leak must not open background/offscreen/active tabs')
})

test('no leak: healthy card with signatures refreshes on direct fetch with no tabs', async () => {
  const page = '<html><body><div class="card"><h2>Title</h2><p>Body text for the card, long enough to count.</p><ul><li><a href="/1">one</a></li><li><a href="/2">two</a></li><li><a href="/3">three</a></li></ul></div></body></html>'
  global.fetch = async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => page })
  let tabCalls = 0
  g.tabBasedRefresh = async () => { tabCalls++; return { html: null, activeFocusNeeded: false } }
  const r = await g.refreshComponent(comp())
  assert.equal(r.success, true, r.error)
  assert.equal(tabCalls, 0)
})

// ---------- applyRefreshResult ----------

test('applyRefreshResult keeps the local-only signatures on success AND on failure, never in the sync entry', () => {
  const c = comp()
  const ok = g.applyRefreshResult(c, { success: true, html_cache: goodHtml, last_refresh: '2026-01-01T00:00:00Z' })
  assert.deepEqual(ok.localEntry.exclusionSignatures, SIGS)
  assert.ok(!('exclusionSignatures' in ok.syncEntry))
  const bad = g.applyRefreshResult(c, { success: false, error: 'Excluded content came back', keepOriginal: true, exclusionLeak: true })
  assert.deepEqual(bad.localEntry.exclusionSignatures, SIGS)
  assert.equal(bad.syncEntry.lastErrorCode, 'exclusions_unapplied')
  assert.equal(bad.localEntry.html_cache, c.html_cache) // last good content preserved
})

test('applyRefreshResult: legacy card stays legacy (no field invented)', () => {
  const ok = g.applyRefreshResult(comp({ exclusionSignatures: undefined }), { success: true, html_cache: goodHtml, last_refresh: 'x' })
  assert.ok(!('exclusionSignatures' in ok.localEntry))
})

// ---------- direct-fetch empty-shell filter ----------

test('direct fetch: selector matching 2 empty loading shells + 1 real element picks the real one', async () => {
  const shell = '<div class="flex min-w-0"><div class="bg-gradient"></div><div class="bg-gradient"></div></div>'
  const real = `<div class="flex min-w-0"><h2>Real card heading</h2><p>${'Real content sentence. '.repeat(20)}</p><ul><li><a href="/1">one</a></li><li><a href="/2">two</a></li><li><a href="/3">three</a></li></ul></div>`
  const page = `<html><body>${shell}${shell}${real}</body></html>`
  global.fetch = async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => page })
  // cached card's identity text has drifted (Kalshi's was a price), so the fingerprint tiebreakers
  // cannot rescue the pick -- only skipping the empty shells can
  const cached = '<div class="flex min-w-0"><h2>Yesterday heading</h2><ul><li>a</li><li>b</li><li>c</li></ul></div>'
  const c = comp({ selector: 'div.flex.min-w-0', excludedSelectors: [], exclusionSignatures: [], html_cache: cached })
  const r = await g.refreshComponent(c)
  assert.equal(r.success, true, r.error)
  assert.match(r.html_cache, /Real card heading/)
})

test('direct fetch: a background-art candidate is not mistaken for an empty shell', async () => {
  const art = '<div class="hero" style="background-image:url(a.png)"></div>'
  const text = `<div class="hero"><p>${'Some text content here. '.repeat(20)}</p><ul><li>a</li><li>b</li><li>c</li></ul></div>`
  global.fetch = async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => `<html><body>${art}${text}</body></html>` })
  const c = comp({ selector: 'div.hero', excludedSelectors: [], exclusionSignatures: [], html_cache: text })
  const r = await g.refreshComponent(c)
  assert.equal(r.success, true, r.error)
})

// ---------- import keeps the local-only field out of sync ----------

test('source guard: import splits exclusionSignatures out of the sync record and into local storage', () => {
  const src = fs.readFileSync(new URL('../public/dashboard.js', import.meta.url), 'utf8')
  assert.match(src, /const \{ html_cache, rawCaptureLength, exclusionSignatures, \.\.\.syncFields \} = card/)
  assert.match(src, /Array\.isArray\(exclusionSignatures\) \? \{ exclusionSignatures \}/)
})

// ---------- refreshAll: every local-record writer keeps the field ----------

test('refreshAll: a PAUSED card keeps its signatures in the rewritten local record (and an active one keeps them too)', async () => {
  document.body.innerHTML = '<button id="refresh-all-btn"></button>'
  const sync = {
    'comp-paused': { id: 'paused', name: 'P', url: 'https://p.example/', refreshPaused: true },
    'comp-active': { id: 'active', name: 'A', url: 'https://a.example/' },
  }
  const local = {
    paused: { selector: 'div.card', html_cache: goodHtml, last_refresh: 'x', excludedSelectors: ['div.pills'], exclusionSignatures: SIGS },
    active: { selector: 'div.card', html_cache: goodHtml, last_refresh: 'x', excludedSelectors: ['div.pills'], exclusionSignatures: SIGS },
  }
  let written = null
  const prevChrome = global.chrome
  global.chrome = {
    ...prevChrome,
    runtime: { ...prevChrome.runtime, lastError: null },
    storage: {
      sync: { get: (_k, cb) => cb(JSON.parse(JSON.stringify(sync))), set: (_v, cb) => cb && cb() },
      local: {
        get: (_k, cb) => cb({ componentsData: JSON.parse(JSON.stringify(local)) }),
        set: (v, cb) => { written = v.componentsData; cb && cb() },
      },
    },
  }
  window.ExclusionStorage = {
    fitSyncRecord: (_key, record) => ({ record, fits: true }),
    exclusionsAreUnknown: () => false,
  }
  g.refreshComponent = async () => ({ success: true, html_cache: goodHtml, last_refresh: '2026-01-01T00:00:00Z', status: 'active' })
  g.trackRefreshClick = () => {} // ga4.js globals: not under test
  window.GA4 = { sendEvent: async () => {} }
  try {
    await g.refreshAll()
  } finally {
    global.chrome = prevChrome
  }
  assert.ok(written, 'refreshAll wrote componentsData')
  assert.deepEqual(written.paused.exclusionSignatures, SIGS)
  assert.deepEqual(written.active.exclusionSignatures, SIGS)
})
