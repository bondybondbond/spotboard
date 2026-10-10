// Dev/test (unpacked) builds must NEVER reach GA4's recording endpoint (/mp/collect): they send to the
// validation endpoint (/debug/mp/collect), which checks the payload and records nothing. Web Store builds
// (manifest has update_url) keep recording exactly as before. Both senders are covered with their real
// source: public/ga4.js (dashboard/popup) and src/background.ts (service worker, transpiled in-memory).
//
// Limit of this test: it proves SpotBoard's ROUTING. It cannot prove GA4 ingests production events or that
// the validation endpoint records nothing on Google's side. After each Web Store release, confirm in GA4
// that a real event still arrives, because dev-build testing no longer exercises the recording endpoint.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const CWS_UPDATE_URL = 'https://clients2.google.com/service/update2/crx'
const REAL = '/mp/collect'
const VALIDATE = '/debug/mp/collect'

function makeEnv({ updateUrl, isOwner = false, validationMessages = null, jsonThrows = false }) {
  const calls = []
  const warns = []
  const store = { sync: isOwner ? { isOwner: true } : {}, local: { user_id: 'real-install-uuid-0001', clientId: 'cid-1' }, session: {} }
  const area = (name) => ({
    get: async (k) => {
      const keys = Array.isArray(k) ? k : typeof k === 'string' ? [k] : Object.keys(k || {})
      const out = {}
      keys.forEach((x) => { if (store[name][x] !== undefined) out[x] = store[name][x] })
      return out
    },
    set: async (o) => { Object.assign(store[name], o) },
    remove: async () => {},
  })
  const listeners = { onMessage: [], onInstalled: [], onStartup: [] }
  const hook = (n) => ({ addListener: (f) => listeners[n].push(f) })
  const noop = { addListener() {} }
  const chrome = {
    runtime: {
      getManifest: () => ({ version: '9.9.9', ...(updateUrl ? { update_url: CWS_UPDATE_URL } : {}) }),
      onMessage: hook('onMessage'), onInstalled: hook('onInstalled'), onStartup: hook('onStartup'),
      onMessageExternal: noop, getURL: (p) => p, setUninstallURL() {}, lastError: null,
    },
    storage: { sync: area('sync'), local: area('local'), session: area('session'), onChanged: noop },
    action: { getUserSettings: async () => ({ isOnToolbar: true }) },
    tabs: { onRemoved: noop, onUpdated: noop, create: async () => ({}), query: async () => [] },
    i18n: { getUILanguage: () => 'en-GB' },
  }
  const ctx = {
    chrome,
    console: { log() {}, error() {}, info() {}, warn: (...a) => warns.push(a) },
    crypto: globalThis.crypto,
    navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/150', language: 'en-GB' },
    fetch: async (url, opts) => {
      calls.push({ url: String(url), body: JSON.parse(opts.body) })
      return {
        ok: true, status: 200,
        json: async () => { if (jsonThrows) throw new Error('not json'); return validationMessages ? { validationMessages } : { validationMessages: [] } },
      }
    },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, addEventListener() {}, URL, URLSearchParams,
    exports: {}, // background.ts ends in `export {}`, which transpiles to a CommonJS marker
  }
  ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx
  return { ctx: vm.createContext(ctx), calls, warns, listeners }
}

// Each sender is driven through its real entry point and resolves once its one request is made.
async function sendViaGa4Js(env) {
  vm.runInContext(read('public/utils/constants.js'), env.ctx)
  vm.runInContext(read('public/ga4.js') + '\n;globalThis.__send = sendEvent;', env.ctx)
  await new Promise((r) => setTimeout(r, 20))
  await env.ctx.__send('board_opened', { x: 1 })
}
async function sendViaBackground(env) {
  const js = ts.transpileModule(read('src/background.ts'), { compilerOptions: { target: 'ES2022', module: 'None' } }).outputText
  vm.runInContext(js, env.ctx)
  const handler = env.listeners.onMessage[0]
  assert.ok(handler, 'background.ts must register its onMessage listener')
  const reply = await new Promise((resolve) => { handler({ type: 'GA4_EVENT', eventName: 'board_opened', params: {} }, {}, resolve) })
  assert.equal(reply.success, true)
}

const SENDERS = [['public/ga4.js', sendViaGa4Js], ['src/background.ts', sendViaBackground]]
const pathOf = (u) => new URL(u).pathname

for (const [name, send] of SENDERS) {
  test(`${name}: DEV build sends only to the validation endpoint, never to the recording endpoint`, async () => {
    const env = makeEnv({ updateUrl: false })
    await send(env)
    assert.equal(env.calls.length, 1)
    assert.equal(pathOf(env.calls[0].url), VALIDATE)
    assert.ok(!env.calls.some((c) => pathOf(c.url) === REAL), 'a dev request reached the production collection endpoint')
    assert.equal(env.calls[0].body.events[0].params.traffic_type, 'internal')
    assert.equal(env.calls[0].body.user_id, 'owner')
  })

  test(`${name}: DEV build stays on the validation endpoint even with the owner flag unset or set`, async () => {
    for (const isOwner of [false, true]) {
      const env = makeEnv({ updateUrl: false, isOwner })
      await send(env)
      assert.deepEqual(env.calls.map((c) => pathOf(c.url)), [VALIDATE], `isOwner=${isOwner}`)
    }
  })

  test(`${name}: PRODUCTION (update_url) build still records to the real endpoint, payload unchanged`, async () => {
    const env = makeEnv({ updateUrl: true })
    await send(env)
    assert.equal(env.calls.length, 1)
    assert.equal(pathOf(env.calls[0].url), REAL)
    const p = env.calls[0].body
    assert.equal(p.user_id, 'real-install-uuid-0001')
    assert.equal(p.events[0].params.traffic_type, undefined)
    assert.equal(p.events[0].name, 'board_opened')
    assert.equal(p.events[0].params.extension_version, '9.9.9')
    assert.equal(env.warns.length, 0, 'production must not run the validation-report path')
  })

  test(`${name}: owner flag on a PRODUCTION build is unchanged (still recorded, tagged internal)`, async () => {
    const env = makeEnv({ updateUrl: true, isOwner: true })
    await send(env)
    assert.deepEqual(env.calls.map((c) => pathOf(c.url)), [REAL])
    assert.equal(env.calls[0].body.user_id, 'owner')
    assert.equal(env.calls[0].body.events[0].params.traffic_type, 'internal')
  })

  test(`${name}: DEV build reports validation problems to the console`, async () => {
    const messages = [{ fieldPath: 'events', description: 'Event at index: [0] has invalid name', validationCode: 'NAME_INVALID' }]
    const env = makeEnv({ updateUrl: false, validationMessages: messages })
    await send(env)
    assert.equal(env.warns.length, 1)
    assert.deepEqual(env.warns[0][1], messages)
  })

  test(`${name}: DEV build survives an unreadable validation response and stays quiet when valid`, async () => {
    const bad = makeEnv({ updateUrl: false, jsonThrows: true })
    await send(bad) // must not throw
    assert.deepEqual(bad.calls.map((c) => pathOf(c.url)), [VALIDATE])
    const ok = makeEnv({ updateUrl: false })
    await send(ok)
    assert.equal(ok.warns.length, 0)
  })
}

test('no other file in src/ or public/ posts to the GA4 recording endpoint (a third sender would bypass the dev guard)', () => {
  const found = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`
      if (e.isDirectory()) walk(p)
      else if (/\.(js|ts|html)$/.test(e.name) && fs.readFileSync(p, 'utf8').includes('mp/collect')) found.push(p.replace(/\\/g, '/'))
    }
  }
  const root = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
  walk(`${root}src`); walk(`${root}public`)
  const rel = found.map((p) => p.slice(root.length)).sort()
  assert.deepEqual(rel, ['public/utils/constants.js', 'src/background.ts'])
})
