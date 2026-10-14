// #194: the dashboard feedback buttons open the Tally survey in a NEW TAB and send the minimum.
//   - the link carries exactly extension_version, days_since_install (banded) and total_cards (clamped at
//     10): no hostnames, no paused rate, no average age, no language, no exact count, no id
//   - no frame is embedded (no iframe, no message listener, no CSP dependency) and nothing opens before a click
//   - a click opens the link, snoozes the prompt for 45 days and does NOT claim a submission
// feedback-data.js is run in a vm with a fake chrome; the click handler is cut out of dashboard.js (which
// cannot be loaded whole), as dashboard-tour-gating.test.js does.
// Limit: proves what SpotBoard puts in the link and what a click does. It cannot prove what Tally stores or
// what its page loads: that is the real-run capture on the issue.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const DAY = 24 * 60 * 60 * 1000

function loadBuilder({ cardUrls, installedDaysAgo }) {
  const sync = {}
  cardUrls.forEach((url, i) => { sync[`comp-${i}`] = { url, label: `Card ${i}`, refreshPaused: i % 2 === 0, created_at: '2026-01-01' } })
  sync.settings = { theme: 'dark' }
  const local = installedDaysAgo === undefined ? {} : { install_date: String(Date.now() - installedDaysAgo * DAY) }
  const ctx = {
    chrome: {
      runtime: { getManifest: () => ({ version: '9.9.9' }) },
      storage: {
        sync: { get: async () => ({ ...sync }) },
        local: { get: async () => ({ ...local }) },
      },
    },
    navigator: { language: 'en-GB' },
    URLSearchParams,
    console,
  }
  vm.createContext(ctx)
  vm.runInContext(read('public/utils/feedback-data.js') + '\nthis.buildTallyURL = buildTallyURL', ctx)
  return ctx.buildTallyURL
}

const HOSTS = ['www.bbc.co.uk', 'news.ycombinator.com', 'kalshi.com', 'www.hotukdeals.com']

test('positive and negative URLs carry exactly three fields and no site names', async () => {
  const build = loadBuilder({ cardUrls: HOSTS.map((h) => `https://${h}/x`), installedDaysAgo: 12 })
  for (const [sentiment, base] of [['positive', 'https://tally.so/r/GxppGe'], ['negative', 'https://tally.so/r/7RKNlZ']]) {
    const url = new URL(await build(sentiment))
    assert.equal(`${url.origin}${url.pathname}`, base)
    assert.deepEqual([...url.searchParams.keys()].sort(), ['days_since_install', 'extension_version', 'total_cards'])
    assert.equal(url.searchParams.get('extension_version'), '9.9.9')
    assert.equal(url.searchParams.get('total_cards'), '4')
    for (const h of HOSTS) assert.ok(!url.href.includes(h), `URL leaks ${h}`)
    assert.ok(!/paused|avg_card|active_cards|language|tracked/.test(url.search), `unexpected field in ${url.search}`)
  }
})

test('card count is clamped at 10 and install age is a band', async () => {
  const many = Array.from({ length: 37 }, (_, i) => `https://site${i}.example/`)
  const cases = [[0, '0'], [0.5, '0'], [1, '1'], [6, '1'], [7, '7'], [29, '7'], [30, '30'], [400, '30']]
  for (const [days, band] of cases) {
    const url = new URL(await loadBuilder({ cardUrls: many, installedDaysAgo: days })('positive'))
    assert.equal(url.searchParams.get('total_cards'), '10', 'count must be clamped')
    assert.equal(url.searchParams.get('days_since_install'), band, `age ${days}d`)
  }
})

test('no install date stored -> band 0, no cards -> 0, still only three fields', async () => {
  const url = new URL(await loadBuilder({ cardUrls: [], installedDaysAgo: undefined })('negative'))
  assert.equal(url.searchParams.get('total_cards'), '0')
  assert.equal(url.searchParams.get('days_since_install'), '0')
  assert.equal([...url.searchParams.keys()].length, 3)
})

test('source guard: feedback-data.js never reads card URLs or builds a site list', () => {
  const src = read('public/utils/feedback-data.js').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')
  assert.ok(!/\.url\b|hostname|all_tracked_sites|refreshPaused|created_at|navigator\./.test(src), 'feedback-data.js reads card urls, paused state, ages or language')
})

// ---- link flow ----
function loadOpener() {
  const src = read('public/dashboard.js')
  const from = src.indexOf('async function openFeedbackSurvey(')
  const to = src.indexOf('function attachFeedbackButtonListeners', from)
  assert.ok(from > 0 && to > from, 'openFeedbackSurvey markers moved in dashboard.js')
  const calls = { tabs: [], snooze: [], toast: [], display: {} }
  const el = (id) => ({ style: { set display(v) { calls.display[id] = v } } })
  const ctx = {
    buildTallyURL: async (sentiment) => `https://tally.so/r/${sentiment}?total_cards=1`,
    chrome: { tabs: { create: (o) => { calls.tabs.push(o); return Promise.resolve({}) } } },
    snoozeFeedback: (days, reason) => calls.snooze.push([days, reason]),
    showToast: (m) => calls.toast.push(m),
    document: { getElementById: (id) => el(id) },
  }
  vm.createContext(ctx)
  vm.runInContext(`${src.slice(from, to)}
this.openFeedbackSurvey = openFeedbackSurvey`, ctx)
  return { ctx, calls }
}

test('clicking a sentiment opens the survey in a new tab, snoozes 45 days, hides the prompt, claims no submission', async () => {
  for (const sentiment of ['positive', 'negative']) {
    const { ctx, calls } = loadOpener()
    await ctx.openFeedbackSurvey(sentiment)
    assert.deepEqual(JSON.parse(JSON.stringify(calls.tabs)), [{ url: `https://tally.so/r/${sentiment}?total_cards=1` }])
    assert.deepEqual(JSON.parse(JSON.stringify(calls.snooze)), [[45, 'opened_survey']])
    assert.equal(calls.display['sentiment-picker'], 'none')
    assert.equal(calls.display['feedback-bubble'], 'none')
    assert.ok(calls.toast.length === 1 && !/submitted|received/i.test(calls.toast[0]), 'toast must not claim a submission')
  }
})

test('no embedded frame remains: no iframe, no Tally message listener, no thank-you overlay, no frame-src dependency', () => {
  const js = read('public/dashboard.js')
  const html = read('public/dashboard.html')
  assert.ok(!/createElement\(['"]iframe/.test(js) && !/<iframe[^>]*tally/i.test(js + html), 'a Tally iframe is still created')
  assert.ok(!/Tally\.Form|isTallySubmitMessage|feedbackFrame|survey-embedded|showThankYouOverlay/.test(js + html), 'embed-era feedback code is still present')
  assert.ok(!/tally\.so/.test(read('public/manifest.json')), 'the manifest must not mention Tally (link-out needs no CSP change)')
})

test('dashboard.html loads nothing from Tally before a click and discloses what the link shares', () => {
  const html = read('public/dashboard.html')
  const note = (html.match(/<p class="drawer-note">([^<]+)<\/p>/) || [])[1]
  assert.ok(note && /new tab/.test(note) && /Tally/.test(note) && /IP address/.test(note), 'disclosure line missing or incomplete')
  assert.ok(!/<(iframe|script|link|img)[^>]*tally\.so/i.test(html), 'dashboard.html loads something from Tally up front')
})
