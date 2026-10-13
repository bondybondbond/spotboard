// #196: the service worker's unhandled-rejection report carries no free text. Only `error_type` (a class
// name from a fixed allowlist, else 'other') and a fixed `error_where` reach GA4: never the message or stack,
// which can hold hostnames, paths, selectors and card names that the old URL/email scrubber let through.
// The real handler is driven: src/background.ts is transpiled in-memory and its 'unhandledrejection'
// listener is called, as stateless-analytics.test.js / ga4-dev-routing.test.js do for the senders.
// Limit: proves what SpotBoard sends. It cannot prove which errors occur in production (0 seen in the
// 14 Aug - 12 Oct 2026 BigQuery export).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const CWS_UPDATE_URL = 'https://clients2.google.com/service/update2/crx'

// The 10 representative messages from the #196 audit: shapes the old scrubber passed through unchanged.
const SAMPLES = [
  'Failed to fetch www.bbc.co.uk/news/uk-politics-12345',
  'Cannot read properties of null (reading \'file:///C:/Users/jane/Documents/secret-plans.html\')',
  'Failed to execute \'querySelector\' on \'Document\': \'div.article > a[href="/account/jane-doe/orders"]\' is not a valid selector',
  'Could not load kalshi.com',
  'Card "My Mortgage Rate Tracker" has no html_cache',
  'No element for selector #nationwide-savings-rates on Page: Savings Accounts | Nationwide',
  'Invalid recipient jane.doe@localhost',
  'tabs.sendMessage failed for https-less host news.ycombinator.com/item?id=424242',
  'Unexpected token < in JSON at position 0 (app.slickdeals.net/deals/laptop-gaming)',
  'Quota exceeded writing component comp-3f2a1b9c-hotukdeals.com-front-page',
]

function loadHandler() {
  const calls = []
  const handlers = []
  const area = () => ({ get: async () => ({}), set: async () => {}, remove: async () => {} })
  const noop = { addListener() {} }
  const chrome = {
    runtime: {
      getManifest: () => ({ version: '9.9.9', update_url: CWS_UPDATE_URL }),
      onMessage: noop, onInstalled: noop, onStartup: noop, onMessageExternal: noop,
      getURL: (p) => p, setUninstallURL() {}, lastError: null,
    },
    storage: { sync: area(), local: area(), session: area(), onChanged: noop },
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
      calls.push({ url: String(url), raw: opts.body, body: JSON.parse(opts.body) })
      return { ok: true, status: 200, json: async () => ({ validationMessages: [] }) }
    },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, URL, URLSearchParams,
    addEventListener: (type, fn) => { if (type === 'unhandledrejection') handlers.push(fn) },
    exports: {},
  }
  ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx
  vm.createContext(ctx)
  const js = ts.transpileModule(read('src/background.ts'), { compilerOptions: { target: 'ES2022', module: 'None' } }).outputText
  vm.runInContext(js, ctx)
  assert.equal(handlers.length, 1, 'exactly one unhandledrejection listener')
  return {
    calls,
    reject: async (reason) => {
      const before = calls.length
      await handlers[0]({ reason })
      return calls.slice(before).filter((c) => c.body.events?.[0]?.name === 'extension_error')
    },
  }
}

const errorParams = (call) => call.body.events[0].params

test('#196: the 10 audit messages never reach the request, as Error or as a plain string', async () => {
  const env = loadHandler()
  for (const msg of SAMPLES) {
    const asError = new TypeError(msg)
    asError.stack = `TypeError: ${msg}\n    at https://example.com/x.js:1:1`
    for (const reason of [asError, msg, { message: msg, stack: msg }]) {
      const sent = await env.reject(reason)
      assert.equal(sent.length, 1, 'one extension_error event per rejection')
      // Compare against the whole serialized body, so no field (incl. any new one) can smuggle the text.
      const fragments = msg.split(/[\s"'()<>]+/).filter((w) => w.length >= 6)
      for (const f of fragments) {
        assert.ok(!sent[0].raw.includes(f), `"${f}" leaked from: ${msg}`)
      }
    }
  }
})

test('#196: payload is exactly error_type + error_where', async () => {
  const env = loadHandler()
  const [call] = await env.reject(new RangeError(SAMPLES[0]))
  const params = errorParams(call)
  assert.equal(params.error_type, 'RangeError')
  assert.equal(params.error_where, 'background_unhandled_rejection')
  assert.equal(params.error_message, undefined)
  assert.equal(params.error_source, undefined)
  // Everything else is the standard envelope added by sendGA4Event, so the full key set is pinned: a new
  // error-derived param would have to be added here on purpose.
  const ENVELOPE = ['engagement_time_msec', 'extension_version', 'browser_language', 'days_since_install', 'browser', 'device_os', 'device_type', 'traffic_type']
  const unexpected = Object.keys(params).filter((k) => !['error_type', 'error_where', ...ENVELOPE].includes(k))
  assert.deepEqual(unexpected, [], 'unexpected param(s) on extension_error')
})

test('#196: error_type is allowlisted: unknown, hostile or missing names collapse to "other"', async () => {
  const env = loadHandler()
  const cases = [
    [new Error('x'), 'Error'],
    [new TypeError('x'), 'TypeError'],
    [new SyntaxError('x'), 'SyntaxError'],
    [new ReferenceError('x'), 'ReferenceError'],
    [{ name: 'www.bbc.co.uk/news' }, 'other'],
    [{ name: 'QuotaExceededError' }, 'other'],
    [{ name: 'TypeError ' }, 'other'],
    [{ name: { toString: () => 'TypeError' } }, 'other'],
    ['just a string', 'other'],
    [42, 'other'],
    [null, 'other'],
    [undefined, 'other'],
  ]
  for (const [reason, expected] of cases) {
    const [call] = await env.reject(reason)
    assert.equal(errorParams(call).error_type, expected, `reason ${String(reason && reason.name || reason)}`)
  }
})

test('#196: reliability unchanged: a reason whose getters throw still reports and does not reject', async () => {
  const env = loadHandler()
  const hostile = { get name() { throw new Error('boom www.bbc.co.uk') }, get message() { throw new Error('boom') } }
  const sent = await env.reject(hostile)
  assert.equal(sent.length, 1)
  assert.equal(errorParams(sent[0]).error_type, 'other')
  assert.ok(!sent[0].raw.includes('bbc'))
})
