// #164: "Retry failed cards" must retry exactly the cards listed as failed in the banner —
// by id, through refreshAll(), without touching the cards that already worked and without
// counting as a fresh Refresh All click in GA4.
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'
import { installFastTimers, restoreFastTimers } from './helpers/fast-timers.js'

const g = await loadRefreshEngine()
const out = await build({ entryPoints: ['src/utils/exclusion-storage.ts'], bundle: true, write: false, format: 'esm', platform: 'node' })
const ES = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'))
const realChrome = global.chrome
const nativeSetTimeout = global.setTimeout

const html = '<div class="card"><h2>T</h2><p>Content that is long enough to matter for the card here.</p></div>'
const okResult = { success: true, html_cache: html, last_refresh: '2026-10-05T00:00:00.000Z', rawCaptureLength: 999 }

let sync, local, session, refreshedIds, clickCount, ga4Events, waits
// Cards that fail; a Set so a test can change who fails on the retry.
let failing

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

function seed(id, name, extra = {}) {
  sync[`comp-${id}`] = {
    id, name, url: 'https://example.com/' + id, favicon: 'f.png', selector: 'div.card',
    headingFingerprint: 'fp', positionBased: false, excludedSelectors: [], exclusionsStorage: 'sync',
    cardSize: '1x1', board: 'b1', created_at: '2026-01-01T00:00:00.000Z', last_refresh: 'old',
    lastOutcome: 'success', ...extra
  }
  local[id] = { selector: 'div.card', html_cache: html, last_refresh: 'old', excludedSelectors: [] }
}

beforeEach(() => {
  sync = {}; local = {}; session = {}; refreshedIds = []; clickCount = 0; ga4Events = []
  failing = new Set()
  g.refreshComponent = async (comp) => {
    refreshedIds.push(comp.id)
    return failing.has(comp.id) ? { success: false, error: 'Network error: timeout' } : okResult
  }
  window.ExclusionStorage = ES
  g.trackRefreshClick = () => { clickCount++ }
  window.GA4 = { sendEvent: async (name) => { ga4Events.push(name) } }
  document.body.replaceChildren()
  const btn = document.createElement('button')
  btn.id = 'refresh-all-btn'
  btn.addEventListener('click', () => { clickCount += 100 }) // a full Refresh All via the button
  document.body.appendChild(btn)
  installStorage()
  // #235: the 2 s button reset, 3.5 s reload and 10 s banner dismiss are logged, not run (the last two kept the process alive ~12 s; holding the 2 s reset keeps the "Nothing to retry" label readable)
  waits = installFastTimers({ hold: [2000, 3500, 10000] })
})

afterEach(restoreFastTimers)

// The five-card board: a + b("Same") + c("Same") + d + e — b and c share a name on purpose
function seedBoard() {
  seed('a', 'Alpha'); seed('b', 'Same'); seed('c', 'Same'); seed('d', 'Delta'); seed('e', 'Echo')
}

async function firstRunWithFailures(failIds) {
  failing = new Set(failIds)
  await g.refreshAll()
  document.getElementById('refresh-all-btn').disabled = false // the real page reloads here
  return session.pendingRefreshFailureToast
}

test('Refresh All stashes the failed card ids (not just names) for the banner', async () => {
  seedBoard()
  const stash = await firstRunWithFailures(['b', 'd'])
  assert.deepEqual(stash.failed.map(f => f.id).sort(), ['b', 'd'])
  assert.equal(stash.successCount, 3)
  assert.equal(clickCount, 1) // the real Refresh All counted once
})

test('#235 timing guards: Refresh All reloads after 3.5 s, and the failure banner auto-dismisses after 10 s', async () => {
  seedBoard()
  const stash = await firstRunWithFailures(['b'])
  assert.ok(waits.includes(3500), 'refreshAll schedules its reload at REFRESH_RELOAD_DELAY_MS (3.5 s)')
  waits.length = 0
  g.showRefreshFailureToast(stash.failed, stash.successCount)
  assert.deepEqual(waits, [10000], 'the banner schedules exactly one 10 s auto-dismiss')
})

test('retry refreshes only the failed ids; the cards that worked are not touched', async () => {
  seedBoard()
  const stash = await firstRunWithFailures(['b', 'd'])
  const snap = () => JSON.stringify({ a: sync['comp-a'], c: sync['comp-c'], e: sync['comp-e'], la: local.a, lc: local.c, le: local.e })
  const before = snap()
  refreshedIds = []; failing = new Set()

  await g.retryFailedComponents(stash.failed)

  assert.deepEqual(refreshedIds.sort(), ['b', 'd'])
  assert.equal(snap(), before)
  assert.equal(sync['comp-b'].lastOutcome, 'success')
  assert.equal(sync['comp-d'].lastOutcome, 'success')
})

test('retry is not counted as a fresh Refresh All (no click metric, no refresh_completed, button not clicked)', async () => {
  seedBoard()
  const stash = await firstRunWithFailures(['b'])
  clickCount = 0; ga4Events = []; failing = new Set()
  await g.retryFailedComponents(stash.failed)
  assert.equal(clickCount, 0)
  assert.equal(ga4Events.includes('refresh_completed'), false)
})

test('two cards with the same name: only the one that failed is retried', async () => {
  seedBoard()
  const stash = await firstRunWithFailures(['b']) // c shares b's name and worked
  refreshedIds = []; failing = new Set()
  await g.retryFailedComponents(stash.failed)
  assert.deepEqual(refreshedIds, ['b'])
})

test('a failed card deleted or paused since the failure is skipped without error', async () => {
  seedBoard()
  const stash = await firstRunWithFailures(['b', 'd', 'e'])
  delete sync['comp-b']; delete local.b
  sync['comp-d'].refreshPaused = true
  refreshedIds = []; failing = new Set()
  await g.retryFailedComponents(stash.failed)
  assert.deepEqual(refreshedIds, ['e'])
  assert.equal('comp-b' in sync, false) // not resurrected
})

test('everything to retry was deleted: nothing refreshes, button says so', async () => {
  seedBoard()
  const stash = await firstRunWithFailures(['b'])
  delete sync['comp-b']; delete local.b
  refreshedIds = []
  await g.retryFailedComponents(stash.failed)
  assert.deepEqual(refreshedIds, [])
  assert.equal(document.getElementById('refresh-all-btn').textContent, '✅ Nothing to retry')
})

test('negative case: a card that fails again is the only one re-listed', async () => {
  seedBoard()
  const stash = await firstRunWithFailures(['b', 'd'])
  failing = new Set(['d'])
  delete session.pendingRefreshFailureToast
  await g.retryFailedComponents(stash.failed)
  const second = session.pendingRefreshFailureToast
  assert.deepEqual(second.failed.map(f => f.id), ['d'])
  assert.equal(second.successCount, 1) // b recovered; a/c/e are not re-listed or re-counted
})

test('entries without an id (pre-#164 stash) never fall back to a full Refresh All', async () => {
  seedBoard()
  await g.retryFailedComponents([{ name: 'Same', errorCode: 'network_error' }])
  assert.deepEqual(refreshedIds, [])
  assert.equal(clickCount, 0)
})

test('the banner Retry button runs the id-scoped retry', async () => {
  seedBoard()
  const stash = await firstRunWithFailures(['d'])
  refreshedIds = []; failing = new Set()
  g.showRefreshFailureToast(stash.failed, stash.successCount)
  document.querySelector('.toast-retry-btn').click()
  await new Promise(r => nativeSetTimeout(r, 50))
  assert.deepEqual(refreshedIds, ['d'])
})

test('banner Retry click while a refresh is running keeps the banner and does nothing', async () => {
  seedBoard()
  const stash = await firstRunWithFailures(['d'])
  refreshedIds = []
  document.getElementById('refresh-all-btn').disabled = true
  g.showRefreshFailureToast(stash.failed, stash.successCount)
  document.querySelector('.toast-retry-btn').click()
  await new Promise(r => nativeSetTimeout(r, 50))
  assert.deepEqual(refreshedIds, [])
  assert.ok(document.querySelector('.refresh-toast--warning'), 'banner still on screen')
})

// ---- #168: the banner says when Retry won't help and points at Re-capture ----

const FAIL_ERRORS = {
  network: 'Network error: timeout',
  layout: 'Selector not found on page',
  excluded: 'Excluded content came back',
  pattern: 'Exclusion pattern no longer matches'
}
async function runWithErrors(map) {
  failing = new Set(Object.keys(map))
  g.refreshComponent = async (comp) => {
    refreshedIds.push(comp.id)
    return map[comp.id] ? { success: false, error: map[comp.id] } : okResult
  }
  await g.refreshAll()
  document.getElementById('refresh-all-btn').disabled = false
  return session.pendingRefreshFailureToast
}
const toastText = () => document.querySelector('.refresh-toast--warning').textContent

test('#168 negative: only retry-fixable failures -> banner unchanged (no Re-capture group, Retry button)', async () => {
  seedBoard()
  const stash = await runWithErrors({ b: FAIL_ERRORS.network, d: FAIL_ERRORS.network })
  g.showRefreshFailureToast(stash.failed, stash.successCount)
  assert.ok(!toastText().includes('Re-capture'))
  assert.match(toastText(), /Failed \(2\):/)
  assert.ok(document.querySelector('.toast-retry-btn'))
})

test('#168 mixed: Re-capture group lists its cards; Retry retries ONLY the retry-fixable ones', async () => {
  seedBoard()
  const stash = await runWithErrors({ b: FAIL_ERRORS.network, d: FAIL_ERRORS.layout, e: FAIL_ERRORS.excluded })
  g.showRefreshFailureToast(stash.failed, stash.successCount)
  const t = toastText()
  assert.match(t, /Failed \(1\):/)
  assert.match(t, /Re-capture needed/)
  assert.ok(t.includes('Delta') && t.includes('Echo') && t.includes('Same'))
  assert.ok(t.includes('Excluded content came back') && !t.includes('re-capture this card') && !t.includes('re-capture (')) // no repeated advice inside the group (#205: trimmed tail must not leak per item)
  assert.equal(t.split('resets this card\'s exclusions').length - 1, 1) // #205: said once, in the hint, not per item
  assert.equal(document.querySelectorAll('.toast-failure-list ul')[1].querySelectorAll('li').length, 2)
  assert.equal(document.querySelector('.toast-retry-btn').textContent.trim(), 'Retry failed card') // 1 retryable, not 3
  refreshedIds = []
  g.refreshComponent = async (comp) => { refreshedIds.push(comp.id); return okResult }
  document.querySelector('.toast-retry-btn').click()
  await new Promise(r => nativeSetTimeout(r, 50))
  assert.deepEqual(refreshedIds, ['b']) // d (layout) and e (excluded) are not re-run
})

test('#205 banner labels: the two exclusion failures always tell the user re-capturing resets exclusions', () => {
  for (const code of ['exclusions_unapplied', 'pattern_unapplied']) {
    assert.ok(g.getErrorLabel(code).endsWith('re-capture (resets its exclusions)'), code)
    assert.ok(g.getErrorLabel(code, { excludedSelectors: [] }).endsWith('re-capture (resets its exclusions)'), code)
  }
  for (const code of ['network', 'skeleton', 'content_drift', 'render_degraded', 'content_shrunk', 'unknown']) {
    assert.ok(!/exclusion/i.test(g.getErrorLabel(code)), code)
    assert.ok(!/exclusion/i.test(g.getErrorLabel(code, { excludedSelectors: ['div'], exclusionPatterns: [{}] })), code) // #219: never added to a code that does not offer Re-capture
  }
})

// #219: layout_changed / content_lost offer Re-capture too, so their label carries the same tail,
// but only on a card that has exclusions (or keeps them on another device).
const TAIL = 're-capture (resets its exclusions)'
const cardWith = {
  selectors: { excludedSelectors: ['div > p'], exclusionsStorage: 'sync' },
  patterns: { excludedSelectors: [], exclusionPatterns: [{ tag: 'div' }], exclusionsStorage: 'sync' },
  unknown: { exclusionsStorage: 'local' }, // kept on another device, list not readable here
  none: { excludedSelectors: [], exclusionPatterns: [], exclusionsStorage: 'sync' },
  legacy: {} // old record with no exclusion fields
}

test('#219 layout_changed + content_lost labels carry the reset note when the card has exclusions or they are unreadable here', () => {
  global.window.ExclusionStorage = ES
  for (const code of ['layout_changed', 'content_lost']) {
    for (const kind of ['selectors', 'patterns', 'unknown']) {
      assert.ok(g.getErrorLabel(code, cardWith[kind]).endsWith(TAIL), `${code} / ${kind}`)
    }
  }
  assert.equal(g.getErrorLabel('layout_changed', cardWith.selectors), 'Site layout changed — re-capture (resets its exclusions)')
  assert.equal(g.getErrorLabel('content_lost', cardWith.selectors), 'Card came back empty — re-capture (resets its exclusions)')
})

test('#219 negative: a card with no exclusions keeps today\'s label, and so does a call without the card', () => {
  global.window.ExclusionStorage = ES
  for (const code of ['layout_changed', 'content_lost']) {
    for (const kind of ['none', 'legacy']) {
      assert.ok(!/exclusion|re-capture/i.test(g.getErrorLabel(code, cardWith[kind])), `${code} / ${kind}`)
    }
    assert.ok(!/exclusion|re-capture/i.test(g.getErrorLabel(code)), code)
  }
})

test('#219 the failure toast still says the reset once, in its hint, never per item', () => {
  g.showRefreshFailureToast([
    { id: 'p', name: 'Alpha', errorCode: 'layout_changed' },
    { id: 'q', name: 'Bravo', errorCode: 'content_lost' }
  ])
  const t = toastText()
  assert.equal(t.split("resets this card's exclusions").length - 1, 1)
  assert.ok(!t.includes('re-capture ('))
})

test('#205 Re-capture offering is unchanged', () => {
  const offers = (code) => g.shouldOfferRecapture({ lastOutcome: 'failed', lastErrorCode: code })
  for (const code of ['layout_changed', 'content_lost', 'exclusions_unapplied', 'pattern_unapplied']) assert.equal(offers(code), true, code)
  for (const code of ['network', 'skeleton', 'content_drift', 'render_degraded', 'content_shrunk', 'unknown']) assert.equal(offers(code), false, code)
})

test('#168 every failure needs Re-capture: no Retry button at all', async () => {
  seedBoard()
  const stash = await runWithErrors({ d: FAIL_ERRORS.layout, e: FAIL_ERRORS.pattern })
  g.showRefreshFailureToast(stash.failed, stash.successCount)
  assert.equal(document.querySelector('.toast-retry-btn'), null)
  assert.match(toastText(), /Re-capture needed/)
  assert.ok(!/Failed \(/.test(toastText()))
})

test('#168 entries with an unknown / missing code stay retryable', async () => {
  g.showRefreshFailureToast([{ id: 'x', name: 'Mystery', errorCode: 'unknown' }, { id: 'y', name: 'Old' }])
  assert.ok(!toastText().includes('Re-capture'))
  assert.ok(document.querySelector('.toast-retry-btn'))
})

test('#205 the Re-capture button hover text carries the same note (source guard: dashboard.js is not loadable in node)', () => {
  const src = readFileSync(new URL('../public/dashboard.js', import.meta.url), 'utf8')
  const line = src.split('\n').find(l => l.startsWith('const RECAPTURE_BUTTON_HTML'))
  assert.ok(line && line.includes('RECAPTURE_NOTE') && line.includes('class="error-recapture-btn"'))
  assert.match(readFileSync(new URL('../public/utils/refresh-engine.js', import.meta.url), 'utf8'), /const RECAPTURE_NOTE = "Re-capture resets this card's exclusions\."/)
})
