// #191: the uninstall-survey link (src/background.ts setUninstallSurveyURL), driven through its real source
// (transpiled in-memory, same approach as ga4-dev-routing.test.js).
//   - the two rolling 7-day counters are read from chrome.storage.local, not hardcoded to 0
//   - active/paused and card-age use the real card field names (refreshPaused, created_at)
//   - hostnames never reach the survey provider: a `unique_sites` count replaces the old list
//   - the URL stays under chrome's 1023-char limit however many cards there are
//   - the failure fallback (bare survey URL) still works
// Limit: proves the URL the extension builds. It cannot prove Tally's form maps `unique_sites` (owner adds the
// hidden field in Tally) or that Tally stores nothing for an opened-but-unsubmitted form.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const BACKGROUND_JS = ts.transpileModule(
  fs.readFileSync(new URL('../src/background.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: 'ES2022', module: 'None' } },
).outputText

const BASE = 'https://tally.so/r/A7vEPN'
const DAY = 24 * 60 * 60 * 1000
const MAX_URL = 1023 // chrome.runtime.setUninstallURL limit

// Loads the real background.ts and resolves with every URL it passed to setUninstallURL.
async function loadSurveyUrls({ sync = {}, local = {}, throwOnLongUrl = true, syncGetFails = false, throwFirstCall = false }) {
  const urls = []
  let calls = 0
  const store = { sync: { ...sync }, local: { user_id: 'install-uuid-0001', install_date: String(Date.now() - 3 * DAY), ...local }, session: {} }
  const area = (name) => ({
    get: async (k) => {
      if (name === 'sync' && syncGetFails) throw new Error('sync unavailable')
      if (k === null || k === undefined) return { ...store[name] }
      const keys = Array.isArray(k) ? k : typeof k === 'string' ? [k] : Object.keys(k)
      const out = {}
      keys.forEach((x) => { if (store[name][x] !== undefined) out[x] = store[name][x] })
      return out
    },
    set: async (o) => { Object.assign(store[name], o) },
    remove: async () => {},
  })
  const noop = { addListener() {} }
  const chrome = {
    runtime: {
      getManifest: () => ({ version: '9.9.9' }),
      onMessage: noop, onInstalled: noop, onStartup: noop, onMessageExternal: noop,
      getURL: (p) => p, lastError: null,
      setUninstallURL(url) {
        calls++
        if (throwFirstCall && calls === 1) throw new Error('simulated failure')
        if (throwOnLongUrl && url.length > MAX_URL) throw new Error('URL too long')
        urls.push(url)
      },
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
    navigator: { userAgent: 'Mozilla/5.0 Chrome/150', language: 'en-GB' },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, addEventListener() {}, URL, URLSearchParams,
    exports: {},
  }
  ctx.self = ctx; ctx.window = ctx; ctx.globalThis = ctx
  vm.runInContext(BACKGROUND_JS, vm.createContext(ctx))
  await new Promise((r) => setTimeout(r, 30)) // background.ts runs setUninstallSurveyURL() at load
  return urls
}

const card = (host, extra = {}) => ({ url: `https://${host}/news/article-1?x=1`, selector: '.main', ...extra })
const cards = (entries) => Object.fromEntries(entries.map((c, i) => [`comp-${i}`, c]))
const params = (url) => new URL(url).searchParams

test('rolling counters come from chrome.storage.local and respect the 7-day window', async () => {
  const now = Date.now()
  const urls = await loadSurveyUrls({
    local: {
      // 2 inside the window, 2 outside (one just past the cutoff, one old)
      board_opens_events: [now - 7 * DAY - 60_000, now - 6 * DAY, now - 1000, now - 30 * DAY],
      refresh_clicks_events: [now - 7 * DAY + 60_000, now - 2 * DAY, now - 7 * DAY - 1000],
    },
  })
  const p = params(urls.at(-1))
  assert.equal(p.get('board_opens_7days'), '2')
  assert.equal(p.get('refresh_clicks_7days'), '2')
})

test('counters are 0 when never recorded, and a malformed value does not break the link', async () => {
  const none = params((await loadSurveyUrls({})).at(-1))
  assert.equal(none.get('board_opens_7days'), '0')
  assert.equal(none.get('refresh_clicks_7days'), '0')
  const bad = params((await loadSurveyUrls({ local: { board_opens_events: 'oops', refresh_clicks_events: { a: 1 } } })).at(-1))
  assert.equal(bad.get('board_opens_7days'), '0')
  assert.equal(bad.get('refresh_clicks_7days'), '0')
})

test('active cards, paused rate and card age use the real stored field names', async () => {
  const now = Date.now()
  const iso = (daysAgo) => new Date(now - daysAgo * DAY).toISOString()
  const urls = await loadSurveyUrls({
    sync: cards([
      card('a.com', { refreshPaused: true, created_at: iso(10) }),
      card('b.com', { created_at: iso(20) }),
      card('c.com', {}), // legacy card with no created_at: counted as a card, left out of the age average
    ]),
  })
  const p = params(urls.at(-1))
  assert.equal(p.get('total_cards'), '3')
  assert.equal(p.get('active_cards'), '2')
  assert.equal(p.get('paused_card_rate_%'), '33')
  assert.equal(p.get('avg_card_age_days'), '15')
})

test('only comp-* records count as cards (boards / cardOrder / isOwner are ignored)', async () => {
  const urls = await loadSurveyUrls({
    sync: { ...cards([card('a.com'), card('b.com')]), boards: [{ id: 'x', url: 'https://nope.com', selector: '.x' }], cardOrder: ['comp-0'], isOwner: true, stray: card('stray.com') },
  })
  const p = params(urls.at(-1))
  assert.equal(p.get('total_cards'), '2')
  assert.equal(p.get('unique_sites'), '2')
})

test('unique_sites counts distinct raw hostnames; invalid URLs are not counted', async () => {
  const urls = await loadSurveyUrls({
    sync: cards([card('www.bbc.com'), card('www.bbc.com'), card('bbc.com'), card('news.ycombinator.com'), { url: 'not a url', selector: '.x' }, {}]),
  })
  const p = params(urls.at(-1))
  assert.equal(p.get('total_cards'), '6')
  assert.equal(p.get('unique_sites'), '3') // www.bbc.com, bbc.com, news.ycombinator.com (www is not merged, matching GA4 url_domain)
})

test('no hostname and no all_tracked_sites field reach the survey link', async () => {
  const hosts = ['www.espn.com', 'en.wikipedia.org', 'news.ycombinator.com']
  const urls = await loadSurveyUrls({ sync: cards(hosts.map((h) => card(h))) })
  const url = urls.at(-1)
  assert.ok(!params(url).has('all_tracked_sites'))
  for (const h of hosts) {
    assert.ok(!url.includes(h), `raw hostname ${h} leaked`)
    assert.ok(!decodeURIComponent(url).includes(h), `decoded hostname ${h} leaked`)
  }
  assert.ok(!decodeURIComponent(url).includes('/news/'), 'a path leaked')
  assert.equal(params(url).get('unique_sites'), '3')
})

for (const n of [0, 2, 200]) {
  test(`URL length stays within the 1023 limit with ${n} cards on distinct sites`, async () => {
    const hosts = Array.from({ length: n }, (_, i) => `very-long-subdomain-number-${i}.example-site-${i}.co.uk`)
    const urls = await loadSurveyUrls({ sync: cards(hosts.map((h) => card(h))) })
    assert.equal(urls.length, 1, 'the full URL must be accepted, not the bare fallback')
    assert.ok(urls[0].length <= MAX_URL, `length ${urls[0].length}`)
    const p = params(urls[0])
    assert.equal(p.get('total_cards'), String(n))
    assert.equal(p.get('unique_sites'), String(n))
    assert.ok(urls[0].startsWith(`${BASE}?`))
  })
}

test('all fields the Tally form expects are present, with the right names', async () => {
  const p = params((await loadSurveyUrls({})).at(-1))
  assert.deepEqual([...p.keys()].sort(), [
    'active_cards', 'avg_card_age_days', 'board_opens_7days', 'browser_language', 'days_since_install',
    'extension_version', 'paused_card_rate_%', 'refresh_clicks_7days', 'total_cards', 'unique_sites', 'user_id',
  ])
  assert.equal(p.get('user_id'), 'install-uuid-0001')
  assert.equal(p.get('extension_version'), '9.9.9')
  assert.equal(p.get('days_since_install'), '3')
})

test('fallback: if building the link fails, the bare survey URL is still registered', async () => {
  const urls = await loadSurveyUrls({ syncGetFails: true })
  assert.deepEqual(urls, [BASE])
})

test('fallback: if setUninstallURL rejects the full URL, the bare survey URL is registered', async () => {
  const urls = await loadSurveyUrls({ sync: cards([card('a.com')]), throwFirstCall: true })
  assert.deepEqual(urls, [BASE])
})
