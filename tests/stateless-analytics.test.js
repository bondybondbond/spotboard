// #199: analytics are stateless. No stored or persistent identifier reaches GA4 or Tally:
//   - client_id is a fresh random value per event and is stored nowhere; no session_id, no user_id for real
//     installs (internal traffic keeps the constant 'owner' marker), no raw user_agent override
//   - install age is a coarse bucket (0 / 1 / 7 / 30), never an exact day count
//   - board stats are clamped at 10 and carry no paused rate, tracked-site list or average age
//   - the uninstall survey is a plain link with no query string
//   - legacy keys (clientId, user_id, rolling counters) are removed on install, update and startup
// Both senders are driven through their real source (public/ga4.js in a vm; src/background.ts transpiled
// in-memory), the same approach as ga4-dev-routing.test.js.
// Limit: proves what SpotBoard sends. It cannot prove how GA4 treats a different client_id on every event
// (verify against the validation endpoint and with a BigQuery check after release), or what Tally stores for
// an opened-but-unsubmitted form.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const CWS_UPDATE_URL = 'https://clients2.google.com/service/update2/crx'
const DAY = 24 * 60 * 60 * 1000
const SURVEY = 'https://tally.so/r/A7vEPN'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function makeEnv({ local = {}, sync = {}, updateUrl = true } = {}) {
  const calls = []
  const uninstallUrls = []
  const store = { sync: { ...sync }, local: { ...local }, session: {} }
  const writes = { local: [], session: [], sync: [] }
  const area = (name) => ({
    get: async (k) => {
      if (k === null || k === undefined) return { ...store[name] }
      const keys = Array.isArray(k) ? k : typeof k === 'string' ? [k] : Object.keys(k || {})
      const out = {}
      keys.forEach((x) => { if (store[name][x] !== undefined) out[x] = store[name][x] })
      return out
    },
    set: async (o) => { writes[name].push(...Object.keys(o)); Object.assign(store[name], o) },
    remove: async (k) => { (Array.isArray(k) ? k : [k]).forEach((x) => { delete store[name][x] }) },
  })
  const listeners = { onMessage: [], onInstalled: [], onStartup: [] }
  const hook = (n) => ({ addListener: (f) => listeners[n].push(f) })
  const noop = { addListener() {} }
  const chrome = {
    runtime: {
      getManifest: () => ({ version: '9.9.9', ...(updateUrl ? { update_url: CWS_UPDATE_URL } : {}) }),
      onMessage: hook('onMessage'), onInstalled: hook('onInstalled'), onStartup: hook('onStartup'),
      onMessageExternal: noop, getURL: (p) => p, setUninstallURL: (u) => { uninstallUrls.push(u) }, lastError: null,
    },
    storage: { sync: area('sync'), local: area('local'), session: area('session'), onChanged: noop },
    action: { getUserSettings: async () => ({ isOnToolbar: true }) },
    tabs: { onRemoved: noop, onUpdated: noop, create: async () => ({}), query: async () => [] },
    i18n: { getUILanguage: () => 'en-GB' },
  }
  const ctx = {
    chrome,
    console: { log() {}, error() {}, info() {}, warn() {} },
    crypto: globalThis.crypto,
    navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/150', language: 'en-GB' },
    fetch: async (url, opts) => {
      calls.push({ url: String(url), body: JSON.parse(opts.body) })
      return { ok: true, status: 200, json: async () => ({ validationMessages: [] }) }
    },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, addEventListener() {}, URL, URLSearchParams,
    exports: {},
  }
  ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx
  return { ctx: vm.createContext(ctx), calls, store, writes, listeners, uninstallUrls }
}

async function loadGa4(env) {
  vm.runInContext(read('public/utils/constants.js'), env.ctx)
  vm.runInContext(read('public/ga4.js'), env.ctx)
  await new Promise((r) => setTimeout(r, 20))
  return { send: (name, params) => env.ctx.window.GA4.sendEvent(name, params) }
}
async function loadBackground(env) {
  const js = ts.transpileModule(read('src/background.ts'), { compilerOptions: { target: 'ES2022', module: 'None' } }).outputText
  vm.runInContext(js, env.ctx)
  await new Promise((r) => setTimeout(r, 30)) // startup work (survey link, legacy key cleanup) runs at load
  const handler = env.listeners.onMessage[0]
  return {
    send: (name, params) => new Promise((resolve) => { handler({ type: 'GA4_EVENT', eventName: name, params: params || {} }, {}, resolve) }),
  }
}

const SENDERS = [['public/ga4.js', loadGa4], ['src/background.ts', loadBackground]]
const LEGACY = { clientId: 'cid-legacy', user_id: 'uuid-legacy', board_opens_events: [Date.now()], refresh_clicks_events: [Date.now()] }

for (const [name, load] of SENDERS) {
  test(`${name}: client_id is a fresh random value per event and is never stored`, async () => {
    const env = makeEnv({ local: { install_date: String(Date.now() - 3 * DAY) } })
    const s = await load(env)
    await s.send('board_opened', {}); await s.send('board_opened', {}); await s.send('refresh_clicked', {})
    const ids = env.calls.map((c) => c.body.client_id)
    assert.equal(ids.length, 3)
    ids.forEach((id) => assert.match(id, UUID))
    assert.equal(new Set(ids).size, 3, 'every event needs its own client_id')
    for (const area of ['local', 'session', 'sync']) {
      assert.ok(!env.writes[area].includes('clientId'), `clientId written to ${area}`)
    }
    assert.ok(!Object.values(env.store).some((a) => JSON.stringify(a).includes(ids[0])), 'a client_id was persisted')
  })

  test(`${name}: no session_id, no user_id for a real install, no raw user_agent override, nothing identifying stored`, async () => {
    const env = makeEnv({ local: { ...LEGACY, install_date: String(Date.now() - 40 * DAY) } })
    const s = await load(env)
    await s.send('board_opened', { total_cards: 4 })
    const p = env.calls[0].body
    assert.equal(p.user_id, undefined)
    assert.equal(p.user_agent, undefined)
    const params = p.events[0].params
    assert.equal(params.session_id, undefined)
    assert.equal(params.traffic_type, undefined)
    assert.equal(params.total_cards, 4)
    for (const area of ['local', 'session', 'sync']) {
      for (const k of ['user_id', 'sessionData', 'board_opens_events', 'refresh_clicks_events']) {
        assert.ok(!env.writes[area].includes(k), `${k} written to ${area}`)
      }
    }
  })

  test(`${name}: internal traffic keeps only the constant 'owner' marker and traffic_type`, async () => {
    const env = makeEnv({ updateUrl: false, local: { ...LEGACY } })
    const s = await load(env)
    await s.send('board_opened', {})
    const p = env.calls[0].body
    assert.equal(p.user_id, 'owner')
    assert.equal(p.events[0].params.traffic_type, 'internal')
  })

  test(`${name}: install age is a coarse bucket, never an exact day count`, async () => {
    const cases = [[null, 0], [0, 0], [0.5, 0], [1, 1], [6, 1], [7, 7], [29, 7], [30, 30], [400, 30]]
    for (const [days, expected] of cases) {
      const env = makeEnv({ local: days === null ? {} : { install_date: String(Date.now() - days * DAY - 1000) } })
      const s = await load(env)
      await s.send('board_opened', {})
      assert.equal(env.calls[0].body.events[0].params.days_since_install, expected, `age ${days} days`)
    }
  })

  test(`${name}: two events from the same install differ only by client_id`, async () => {
    const env = makeEnv({ local: { ...LEGACY, install_date: String(Date.now() - 12 * DAY) } })
    const s = await load(env)
    await s.send('capture_completed', { url_domain: 'example.com' }); await s.send('capture_completed', { url_domain: 'example.com' })
    const [a, b] = env.calls.map((c) => c.body)
    assert.notEqual(a.client_id, b.client_id)
    const strip = (p) => ({ ...p, client_id: undefined })
    assert.deepEqual(strip(a), strip(b))
  })
}

test('background.ts: the uninstall survey is a plain link, set at startup, install and update', async () => {
  const env = makeEnv({ local: { ...LEGACY, install_date: String(Date.now() - 3 * DAY) }, sync: { 'comp-1': { url: 'https://example.com/a?b=1', selector: '.x' } } })
  await loadBackground(env)
  for (const reason of ['install', 'update']) await env.listeners.onInstalled[0]({ reason })
  assert.ok(env.uninstallUrls.length >= 3)
  env.uninstallUrls.forEach((u) => assert.equal(u, SURVEY))
})

test('background.ts: legacy identifiers and counters are removed on startup, update and install; install_date is kept', async () => {
  const KEEP = { install_date: '1700000000000', dashboardTourShown: true, onboardingCompleted: true, hasSeenWelcome: true, hasExistingCards: true, firstCaptureCompleted: true }
  const env = makeEnv({ local: { ...LEGACY, ...KEEP }, sync: { isOwner: true, 'comp-1': { url: 'https://a.example/' } } })
  await loadBackground(env)
  for (const k of Object.keys(LEGACY)) assert.equal(env.store.local[k], undefined, `${k} survived startup cleanup`)
  for (const [k, v] of Object.entries(KEEP)) assert.equal(env.store.local[k], v, `${k} must not be removed by the cleanup`)
  assert.equal(env.store.sync.isOwner, true)
  assert.ok(env.store.sync['comp-1'], 'cards in sync storage must be untouched')

  const upd = makeEnv({ local: { ...LEGACY, install_date: '1700000000000' } })
  await loadBackground(upd)
  Object.assign(upd.store.local, LEGACY) // re-seed to prove the update handler itself cleans
  await upd.listeners.onInstalled[0]({ reason: 'update' })
  for (const k of Object.keys(LEGACY)) assert.equal(upd.store.local[k], undefined, `${k} survived update`)

  const fresh = makeEnv({})
  await loadBackground(fresh)
  Object.assign(fresh.store.local, LEGACY) // re-seed after startup to prove the install handler itself cleans
  await fresh.listeners.onInstalled[0]({ reason: 'install' })
  for (const k of Object.keys(LEGACY)) assert.equal(fresh.store.local[k], undefined, `${k} survived install`)
  assert.ok(fresh.store.local.install_date, 'install_date is still recorded for onboarding timing')
  assert.equal(fresh.store.local.user_id, undefined)
  assert.equal(fresh.store.local.clientId, undefined)
})

test('public/ga4.js: board stats are clamped at 10 and carry nothing else', async () => {
  const sync = {}
  for (let i = 0; i < 15; i++) sync[`comp-${i}`] = { url: `https://site${i}.example/`, refreshPaused: i < 2 }
  const env = makeEnv({ sync })
  await loadGa4(env)
  const stats = JSON.parse(JSON.stringify(await env.ctx.window.GA4.getBoardStats()))
  assert.deepEqual(stats, { total: 10, active: 10 })
  const small = makeEnv({ sync: { 'comp-a': { url: 'https://a.example/' }, 'comp-b': { url: 'https://b.example/', refreshPaused: true } } })
  await loadGa4(small)
  assert.deepEqual(JSON.parse(JSON.stringify(await small.ctx.window.GA4.getBoardStats())), { total: 2, active: 1 })
})

test('public/ga4.js no longer exposes a persistent id, a session id or rolling counters', async () => {
  const env = makeEnv({})
  await loadGa4(env)
  const api = Object.keys(env.ctx.window.GA4).sort()
  assert.deepEqual(api, ['ageBandFromDays', 'getBoardStats', 'getBrowserLanguage', 'getDaysSinceInstall', 'getExtensionVersion', 'getToolbarPinStatus', 'sendEvent'])
})

test('public/ga4.js ageBandFromDays: bands 0 / 1 / 7 / 30 and anything that is not a number >= 1 is 0', async () => {
  const env = makeEnv({})
  await loadGa4(env)
  const band = (d) => env.ctx.window.GA4.ageBandFromDays(d)
  const cases = [[0, 0], [0.9, 0], [1, 1], [6, 1], [7, 7], [29, 7], [30, 30], [4000, 30], [NaN, 0], [-5, 0], [undefined, 0]]
  for (const [d, expected] of cases) assert.equal(band(d), expected, `ageBandFromDays(${d})`)
})

test('source guard: nothing writes a client id, user id or session record to storage; dashboard sends no per-install counters', () => {
  const files = ['public/ga4.js', 'src/background.ts', 'public/dashboard.js', 'public/utils/feedback-data.js', 'public/utils/refresh-engine.js']
  for (const f of files) {
    const src = read(f)
    assert.ok(!/storage\.(local|session|sync)\.set\(\s*\{[^}]*\b(clientId|user_id|sessionData)\b/.test(src), `${f} stores an identifier`)
  }
  const dash = read('public/dashboard.js')
  for (const dead of ['incrementRollingMetric', 'board_opens_7days', 'refresh_clicks_7days', 'paused_card_rate_pct']) {
    assert.ok(!dash.includes(dead), `dashboard.js still references ${dead}`)
  }
  // no persistent card or board id in any event; card age is banded; small counts are clamped
  assert.ok(!/\b(card_id|board_id)\s*:/.test(dash), 'dashboard.js sends a card or board id (both persist across days)')
  assert.equal((dash.match(/card_age_days:\s*cardAgeDays/g) || []).length, 2)
  assert.equal((dash.match(/ageBandFromDays\(/g) || []).length, 2, 'both card_age_days values must be banded')
  assert.ok(!/\b(card_count|board_count|total_boards)[ \t]*:[ \t]*(?=\S)(?!Math\.min)/.test(dash), 'an exact card or board count is sent unclamped')
  const feedback = read('public/utils/feedback-data.js')
  assert.ok(!/user_id\s*:/.test(feedback), 'feedback-data.js still builds a user_id field')
})
