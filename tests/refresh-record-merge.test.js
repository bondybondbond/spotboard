// #116: a refresh owns only the outcome fields. Both refresh paths persist through
// persistRefreshOutcomes(), which re-reads the stored record right before writing, so
// fields the refresh doesn't own (created_at, unknown fields, mid-refresh edits) survive.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { build } from 'esbuild'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
const out = await build({ entryPoints: ['src/utils/exclusion-storage.ts'], bundle: true, write: false, format: 'esm', platform: 'node' })
const ES = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'))
const realRefresh = g.refreshComponent

const oldHtml = '<div class="card"><h2>Old</h2><p>Old content that is long enough to matter for the card here.</p></div>'
const newHtml = '<div class="card"><h2>New</h2><p>New content that is long enough to matter for the card here, fresh.</p></div>'

let sync, local, syncSetCalls
const realChrome = global.chrome

function installStorage() {
  syncSetCalls = 0
  global.chrome = {
    ...realChrome,
    runtime: { ...realChrome.runtime, lastError: null },
    storage: {
      sync: {
        get: (k, cb) => {
          const keys = k === null ? Object.keys(sync) : [].concat(k)
          const res = {}
          for (const key of keys) if (key in sync) res[key] = JSON.parse(JSON.stringify(sync[key]))
          cb(res)
        },
        set: (v, cb) => { syncSetCalls++; for (const [k, val] of Object.entries(v)) sync[k] = JSON.parse(JSON.stringify(val)); cb && cb() }
      },
      local: {
        get: (_k, cb) => cb({ componentsData: JSON.parse(JSON.stringify(local)) }),
        set: (v, cb) => { local = JSON.parse(JSON.stringify(v.componentsData)); cb && cb() }
      }
    }
  }
}

function seed(id, extra = {}) {
  sync[`comp-${id}`] = {
    id, name: 'Card ' + id, url: 'https://example.com/' + id, favicon: 'f.png', selector: 'div.card',
    headingFingerprint: 'fp', positionBased: false, excludedSelectors: [], exclusionsStorage: 'sync',
    cardSize: '1x1', board: 'b1', created_at: '2026-01-01T00:00:00.000Z', last_refresh: 'old',
    lastOutcome: 'success', unknownFutureField: { keep: 'me' }, ...extra
  }
  local[id] = { selector: 'div.card', html_cache: oldHtml, last_refresh: 'old', excludedSelectors: [] }
}
// the in-memory component both refresh paths start from: sync + local merged at load time
const load = id => ({ ...sync[`comp-${id}`], ...local[id] })
const okResult = { success: true, html_cache: newHtml, last_refresh: '2026-09-26T00:00:00.000Z', rawCaptureLength: 999 }

beforeEach(() => {
  sync = {}; local = {}
  g.refreshComponent = realRefresh
  window.ExclusionStorage = ES
  g.trackRefreshClick = () => {}
  window.GA4 = { sendEvent: async () => {} }
  document.body.innerHTML = '<button id="refresh-all-btn"></button>'
  installStorage()
})

test('write path keeps created_at and unknown fields, updates only outcome fields', async () => {
  seed('a')
  const written = await g.persistRefreshOutcomes([{ component: load('a'), result: okResult }])
  const rec = sync['comp-a']
  assert.equal(rec.created_at, '2026-01-01T00:00:00.000Z')
  assert.deepEqual(rec.unknownFutureField, { keep: 'me' })
  assert.equal(rec.board, 'b1')
  assert.equal(rec.lastOutcome, 'success')
  assert.equal(rec.last_refresh, okResult.last_refresh)
  assert.equal(local.a.html_cache, newHtml)
  assert.equal(local.a.rawCaptureLength, 999)
  assert.equal(written.get('a').created_at, '2026-01-01T00:00:00.000Z')
})

test('success clears a previous error; failure keeps html and last_refresh, records the error', async () => {
  seed('a', { lastOutcome: 'failed', lastErrorCode: 'timeout', lastErrorAt: 'x', lastSuccessAt: 'earlier' })
  await g.persistRefreshOutcomes([{ component: load('a'), result: okResult }])
  assert.equal(sync['comp-a'].lastErrorCode, null)
  assert.equal(sync['comp-a'].lastOutcome, 'success')

  seed('b', { lastSuccessAt: 'earlier' })
  await g.persistRefreshOutcomes([{ component: load('b'), result: { success: false, error: 'boom' } }])
  assert.equal(sync['comp-b'].lastOutcome, 'failed')
  assert.equal(sync['comp-b'].lastSuccessAt, 'earlier')
  assert.equal(sync['comp-b'].last_refresh, 'old')
  assert.equal(local.b.html_cache, oldHtml)
})

test('requiresActiveFocus is sticky once set', async () => {
  seed('a', { requiresActiveFocus: true })
  await g.persistRefreshOutcomes([{ component: load('a'), result: okResult }])
  seed('b')
  await g.persistRefreshOutcomes([{ component: load('b'), result: { ...okResult, requiresActiveFocus: true } }])
  assert.equal(sync['comp-a'].requiresActiveFocus, true)
  assert.equal(sync['comp-b'].requiresActiveFocus, true)
})

test('an edit made while the refresh was running is not reverted (rename, pause, board move, size)', async () => {
  seed('a')
  const snapshot = load('a') // taken when the refresh started
  sync['comp-a'] = { ...sync['comp-a'], customLabel: 'Renamed', refreshPaused: true, board: 'b2', cardSize: '2x1' }
  await g.persistRefreshOutcomes([{ component: snapshot, result: okResult }])
  const rec = sync['comp-a']
  assert.equal(rec.customLabel, 'Renamed')
  assert.equal(rec.refreshPaused, true)
  assert.equal(rec.board, 'b2')
  assert.equal(rec.cardSize, '2x1')
  assert.equal(rec.lastOutcome, 'success')
})

test('an exclusion edit made mid-refresh survives in sync and local', async () => {
  seed('a')
  const snapshot = load('a')
  sync['comp-a'].excludedSelectors = ['div.new-ex']
  local.a.excludedSelectors = ['div.new-ex']
  local.a.exclusionSignatures = [{ sel: 'div.new-ex', sig: 's', keep: 0 }]
  await g.persistRefreshOutcomes([{ component: snapshot, result: okResult }])
  assert.deepEqual(sync['comp-a'].excludedSelectors, ['div.new-ex'])
  assert.deepEqual(local.a.excludedSelectors, ['div.new-ex'])
  assert.equal(local.a.exclusionSignatures.length, 1)
})

test('exclusions kept local (oversized) stay local and are not lost', async () => {
  const many = Array.from({ length: 400 }, (_, i) => `div.story > div.credit:nth-child(${i + 1}) > span.photo-credit`)
  seed('a', { exclusionsStorage: 'local' })
  delete sync['comp-a'].excludedSelectors
  local.a.excludedSelectors = many
  await g.persistRefreshOutcomes([{ component: load('a'), result: okResult }])
  assert.equal(sync['comp-a'].exclusionsStorage, 'local')
  assert.equal('excludedSelectors' in sync['comp-a'], false)
  assert.equal(local.a.excludedSelectors.length, 400)
})

test('a card deleted mid-refresh is not resurrected (sync or local)', async () => {
  seed('a'); seed('b')
  const ca = load('a'), cb = load('b')
  delete sync['comp-b']; delete local.b
  const written = await g.persistRefreshOutcomes([{ component: ca, result: okResult }, { component: cb, result: okResult }])
  assert.equal('comp-b' in sync, false)
  assert.equal('b' in local, false)
  assert.equal(written.has('b'), false)
  assert.equal(sync['comp-a'].lastOutcome, 'success')
})

test('nothing is written when every card was deleted', async () => {
  seed('a')
  const c = load('a')
  delete sync['comp-a']
  await g.persistRefreshOutcomes([{ component: c, result: okResult }])
  assert.equal(syncSetCalls, 0)
})

test('Refresh All: one batched sync write; paused and out-of-scope cards are left untouched', async () => {
  seed('a'); seed('p', { refreshPaused: true }); seed('o')
  const snap = () => JSON.stringify({ p: sync['comp-p'], o: sync['comp-o'], lp: local.p, lo: local.o })
  const before = snap()
  g.refreshComponent = async () => okResult
  await g.refreshAll(['a', 'p'])
  assert.equal(syncSetCalls, 1)
  assert.equal(snap(), before)
  assert.equal(sync['comp-a'].created_at, '2026-01-01T00:00:00.000Z')
  assert.deepEqual(sync['comp-a'].unknownFutureField, { keep: 'me' })
  assert.equal(sync['comp-a'].lastOutcome, 'success')
})

test('Refresh All: a rename made while cards refresh is not reverted', async () => {
  seed('a'); seed('b')
  g.refreshComponent = async (comp) => {
    if (comp.id === 'a') sync['comp-b'] = { ...sync['comp-b'], customLabel: 'Renamed mid-run', refreshPaused: true }
    return okResult
  }
  await g.refreshAll()
  assert.equal(sync['comp-b'].customLabel, 'Renamed mid-run')
  assert.equal(sync['comp-b'].refreshPaused, true)
})

test('source guard: neither refresh path keeps a hand-typed sync field list', () => {
  const eng = fs.readFileSync('public/utils/refresh-engine.js', 'utf8')
  const dash = fs.readFileSync('public/dashboard.js', 'utf8')
  const refreshAll = eng.slice(eng.indexOf('async function refreshAll'))
  assert.equal(/fitCompForSync\(/.test(refreshAll), false)
  const start = dash.indexOf("refreshSingleBtn.addEventListener('click'")
  const single = dash.slice(start, dash.indexOf('---- SUCCESS UI ----', start))
  assert.ok(single.length > 100)
  assert.equal(/fitCompForSync\(|storage\.sync\.set/.test(single), false)
})

test('a legacy card whose exclusions no longer fit inline gets them written to local, not lost', async () => {
  const many = Array.from({ length: 400 }, (_, i) => `div.story > div.credit:nth-child(${i + 1}) > span.photo-credit`)
  seed('a')
  sync['comp-a'].excludedSelectors = many
  delete local.a.excludedSelectors
  await g.persistRefreshOutcomes([{ component: load('a'), result: okResult }])
  assert.equal(sync['comp-a'].exclusionsStorage, 'local')
  assert.equal(local.a.excludedSelectors.length, 400)
})
