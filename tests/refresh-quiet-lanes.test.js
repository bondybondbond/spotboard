// #152: Refresh All runs a flagged card's QUIET attempt in the concurrent pool (cap 3) and only re-queues a rejected one
// for the serial focus lane. Drives the real refreshAll() + refreshComponent() with stubbed windows (numeric fixtures only).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { build } from 'esbuild'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
const out = await build({ entryPoints: ['src/utils/exclusion-storage.ts'], bundle: true, write: false, format: 'esm', platform: 'node' })
const ES = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'))
const realChrome = global.chrome
const real = { tryBackgroundWithSpoof: g.tryBackgroundWithSpoof, tryOffscreenWindow: g.tryOffscreenWindow, tryActiveTab: g.tryActiveTab, refreshComponent: g.refreshComponent }
const phases = vm.runInThisContext('_refreshPhase')
const outcomes = vm.runInThisContext('_probeOutcome')

const pic = (n, tag = 'p') => `<ul class="deals">${Array.from({ length: n }, (_, i) =>
  `<li><img src="https://cdn.example.com/${tag}-${i}.jpg" data-scale-context="medium" alt="p${i}">Item ${i} with enough text to count as real content</li>`).join('')}</ul>`

let sync, local, session, windows
let offHtml, activeHtml

function installStorage() {
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
        set: (v, cb) => { for (const [k, val] of Object.entries(v)) sync[k] = JSON.parse(JSON.stringify(val)); cb && cb() }
      },
      local: {
        get: (_k, cb) => cb({ componentsData: JSON.parse(JSON.stringify(local)) }),
        set: (v, cb) => { local = JSON.parse(JSON.stringify(v.componentsData)); cb && cb() }
      },
      session: {
        set: async (v) => { Object.assign(session, JSON.parse(JSON.stringify(v))) },
        get: async (k) => ({ [k]: session[k] })
      }
    }
  }
}

function seed(id, url, extra = {}, saved = pic(24, id)) {
  sync[`comp-${id}`] = {
    id, name: 'Card ' + id, url, favicon: 'f.png', selector: 'ul.deals',
    headingFingerprint: 'fp', positionBased: true, excludedSelectors: [], exclusionsStorage: 'sync',
    cardSize: '1x1', board: 'b1', created_at: '2026-01-01T00:00:00.000Z', last_refresh: 'old',
    lastOutcome: 'success', ...extra
  }
  local[id] = { selector: 'ul.deals', html_cache: saved, last_refresh: 'old', excludedSelectors: [] }
}

const okResult = () => ({ success: true, html_cache: pic(24, 'direct'), last_refresh: '2026-10-08T00:00:00.000Z', rawCaptureLength: 999 })
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const maxOverlap = ws => { const ev = []; ws.forEach(w => ev.push([w.t0, 1], [w.t1, -1])); ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]); let c = 0, m = 0; for (const e of ev) { c += e[1]; m = Math.max(m, c) } return m }

beforeEach(() => {
  sync = {}; local = {}; session = {}; windows = []
  offHtml = {}; activeHtml = {}
  Object.assign(g, real)
  g.tryBackgroundWithSpoof = async () => null
  g.tryOffscreenWindow = async (url, sel, fp, meta = {}) => {
    const w = { kind: 'off', url, t0: Date.now() }; windows.push(w)
    await wait(30); w.t1 = Date.now()
    meta.pageVisible = false
    return offHtml[url] ?? null
  }
  g.tryActiveTab = async (url, sel, fp, meta = {}) => {
    const w = { kind: 'active', url, t0: Date.now() }; windows.push(w)
    await wait(30); w.t1 = Date.now()
    meta.pageVisible = true
    return activeHtml[url] ?? null
  }
  global.fetch = async () => { throw new Error('offline') } // direct fetch fails -> the tab path, like the real flagged sites
  window.ExclusionStorage = ES
  g.trackRefreshClick = () => {}
  window.GA4 = { sendEvent: async () => {} }
  document.body.replaceChildren()
  const btn = document.createElement('button')
  btn.id = 'refresh-all-btn'
  document.body.appendChild(btn)
  installStorage()
})

const url = id => 'https://' + id + '.example/page'
const kinds = (k, id) => windows.filter(w => w.kind === k && (!id || w.url === url(id)))

test('quiet attempts run in the concurrent pool; only a rejected one gets a focused window, one at a time, after the pool drains', async () => {
  seed('a', url('a'), { requiresActiveFocus: true }) // quiet capture matches -> accepted
  seed('b', url('b'), { requiresActiveFocus: true }) // quiet capture collapsed -> rejected -> focus lane
  seed('c', url('c'), { requiresActiveFocus: true })
  seed('d', url('d'), { requiresActiveFocus: true }, pic(3, 'd')) // saved copy under 5 images -> straight to focus
  seed('e', url('e')) // unflagged
  offHtml = { [url('a')]: pic(24, 'a'), [url('b')]: pic(10, 'b'), [url('c')]: pic(24, 'c'), [url('e')]: pic(24, 'e') }
  activeHtml = { [url('b')]: pic(24, 'b'), [url('d')]: pic(3, 'd') }

  await g.refreshAll()

  assert.equal(kinds('off', 'a').length, 1)
  assert.equal(kinds('off', 'b').length, 1)
  assert.equal(kinds('off', 'c').length, 1)
  assert.equal(kinds('off', 'e').length, 1)
  assert.equal(kinds('off', 'd').length, 0, 'a flagged card with a thin saved copy does not probe')
  assert.deepEqual(kinds('active').map(w => w.url).sort(), [url('b'), url('d')], 'only the rejected card and the thin-copy card use a focused window')
  assert.equal(maxOverlap(kinds('active')), 1, 'focused windows stay one at a time (#33)')
  assert.ok(maxOverlap(kinds('off')) >= 2 && maxOverlap(kinds('off')) <= 3, 'quiet attempts overlap, capped at 3')
  const lastOffEnd = Math.max(...kinds('off').map(w => w.t1)), firstActive = Math.min(...kinds('active').map(w => w.t0))
  assert.ok(firstActive >= lastOffEnd, 'the focus lane starts only after the pool has drained')
  for (const id of ['a', 'b', 'c', 'd', 'e']) assert.equal(sync[`comp-${id}`].lastOutcome, 'success', id)
  assert.equal(session.pendingRefreshFailureToast, undefined, 'a rejected quiet attempt rescued by the focus lane shows no failure')
})

test('the flag is never cleared, and an accepted quiet capture does not learn anything new', async () => {
  seed('a', url('a'), { requiresActiveFocus: true })
  offHtml = { [url('a')]: pic(24, 'a') }
  await g.refreshAll()
  assert.equal(sync['comp-a'].requiresActiveFocus, true)
  assert.equal(kinds('active').length, 0)
})

test('same-URL flagged cards take turns for their quiet attempt (never two windows on one URL at once)', async () => {
  seed('h1', url('same'), { requiresActiveFocus: true })
  seed('h2', url('same'), { requiresActiveFocus: true })
  seed('x', url('x'), { requiresActiveFocus: true })
  offHtml = { [url('same')]: pic(24, 'h1'), [url('x')]: pic(24, 'x') }
  await g.refreshAll()
  assert.equal(kinds('off', 'same').length, 2)
  assert.equal(maxOverlap(kinds('off', 'same')), 1)
  assert.equal(kinds('active').length, 0)
})

test('same page written two ways (fragment, host case) is still one page: those cards take turns too', async () => {
  seed('h1', 'https://same.example/page', { requiresActiveFocus: true })
  seed('h2', 'https://SAME.example/page#top', { requiresActiveFocus: true })
  offHtml = { 'https://same.example/page': pic(24, 'h1'), 'https://SAME.example/page#top': pic(24, 'h2') }
  await g.refreshAll()
  assert.equal(kinds('off').length, 2)
  assert.equal(maxOverlap(kinds('off')), 1)
})

test('quiet attempt rejected AND focused popup also fails: one failure is reported, the last good copy stays', async () => {
  seed('b', url('b'), { requiresActiveFocus: true })
  const before = local.b.html_cache
  offHtml = { [url('b')]: pic(10, 'b') }
  activeHtml = {} // focused popup returns nothing
  await g.refreshAll()
  assert.equal(sync['comp-b'].lastOutcome, 'failed')
  assert.equal(local.b.html_cache, before)
  assert.deepEqual(session.pendingRefreshFailureToast.failed.map(f => f.id), ['b'])
  assert.equal(kinds('active').length, 1)
})

test('no lane marker or probe outcome is left on the card objects refreshAll actually used (a later single-card refresh is inline)', async () => {
  seed('a', url('a'), { requiresActiveFocus: true })
  seed('b', url('b'), { requiresActiveFocus: true })
  offHtml = { [url('a')]: pic(24, 'a'), [url('b')]: pic(10, 'b') }
  activeHtml = { [url('b')]: pic(24, 'b') }
  const seen = []
  g.refreshComponent = async comp => { seen.push(comp); return real.refreshComponent(comp) }
  await g.refreshAll()
  assert.ok(seen.length >= 3, 'a probed once, b probed then focused')
  for (const comp of seen) {
    assert.equal(phases.has(comp), false)
    assert.equal(outcomes.has(comp), false)
  }
})

test('a rejected quiet attempt is re-queued even when refreshComponent still reports success (drift-guard fallback made of direct-fetch content)', async () => {
  seed('b', url('b'), { requiresActiveFocus: true })
  offHtml = { [url('b')]: pic(10, 'b') } // quiet attempt rejected
  activeHtml = { [url('b')]: pic(24, 'b') }
  let calls = 0
  g.refreshComponent = async comp => {
    calls++
    await g._tabRefreshForComponent(comp, null, 24, 24)
    return okResult() // the drift guard's "tab fallback failed -> use the direct-fetch content" success
  }
  const events = []
  window.GA4 = { sendEvent: async (name, params) => { events.push({ name, params }) } }
  await g.refreshAll()
  assert.equal(calls, 2, 'the card is refreshed again in the focus lane instead of committing the first result')
  assert.equal(kinds('active', 'b').length, 1)
  const done = events.find(e => e.name === 'refresh_completed')
  assert.equal(done.params.quiet_accepted, 0)
  assert.equal(done.params.quiet_to_focus, 1)
})

test('quiet_accepted counts only real quiet captures, not a flagged card that a direct fetch refreshed without any window', async () => {
  seed('a', url('a'), { requiresActiveFocus: true }) // quiet capture accepted
  seed('dd', url('dd'), { requiresActiveFocus: true }) // refreshed from a working direct fetch: no window at all
  offHtml = { [url('a')]: pic(24, 'a') }
  g.refreshComponent = async comp => comp.id === 'dd' ? okResult() : real.refreshComponent(comp)
  const events = []
  window.GA4 = { sendEvent: async (name, params) => { events.push({ name, params }) } }
  await g.refreshAll()
  const done = events.find(e => e.name === 'refresh_completed')
  assert.equal(done.params.quiet_accepted, 1)
  assert.equal(done.params.quiet_to_focus, 0)
  assert.equal(kinds('off', 'dd').length, 0)
})

test('unflagged cards are untouched by the lanes: no focused window, ordinary pool', async () => {
  seed('n1', url('n1')); seed('n2', url('n2'))
  offHtml = { [url('n1')]: pic(24, 'n1'), [url('n2')]: pic(24, 'n2') }
  await g.refreshAll()
  assert.equal(kinds('active').length, 0)
  assert.equal(kinds('off').length, 2)
})
