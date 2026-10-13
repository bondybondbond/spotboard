// #194: the in-dashboard Tally feedback form sends the minimum, and only trusts its own iframe.
//   - the iframe URL carries exactly extension_version, days_since_install (banded) and total_cards (clamped at
//     10): no hostnames, no paused rate, no average age, no language, no exact count, no id
//   - a submit message counts only from https://tally.so AND from the iframe we injected
// feedback-data.js is run in a vm with a fake chrome; the listener helper is cut out of dashboard.js (which
// cannot be loaded whole), as dashboard-tour-gating.test.js does.
// Limit: proves what SpotBoard puts in the URL and which messages it accepts. It cannot prove what Tally
// stores or what the frame contacts: that is the real-run capture on the issue.
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

// ---- submit message trust ----
function loadListener() {
  const src = read('public/dashboard.js')
  const from = src.indexOf('function isTallySubmitMessage(')
  const to = src.indexOf("window.addEventListener('message'", from)
  assert.ok(from > 0 && to > from, 'isTallySubmitMessage markers moved in dashboard.js')
  const ctx = { feedbackFrame: null }
  vm.createContext(ctx)
  vm.runInContext(`${src.slice(from, to)}\nthis.isTallySubmitMessage = isTallySubmitMessage`, ctx)
  return ctx
}

test('submit message: accepted only from tally.so AND our own iframe', () => {
  const ctx = loadListener()
  const ourWindow = {}
  ctx.feedbackFrame = { contentWindow: ourWindow }
  const ok = { origin: 'https://tally.so', source: ourWindow, data: JSON.stringify({ event: 'Tally.FormSubmitted', payload: {} }) }
  assert.equal(ctx.isTallySubmitMessage(ok), true)
  assert.equal(ctx.isTallySubmitMessage({ ...ok, data: { event: 'Tally.FormSubmitted' } }), true, 'object form')
  assert.equal(ctx.isTallySubmitMessage({ ...ok, data: { type: 'Tally.FormSubmitted' } }), true, 'legacy .type form')

  assert.equal(ctx.isTallySubmitMessage({ ...ok, origin: 'https://evil.example' }), false, 'wrong origin')
  assert.equal(ctx.isTallySubmitMessage({ ...ok, origin: 'chrome-extension://abc' }), false, 'page spoofing itself')
  assert.equal(ctx.isTallySubmitMessage({ ...ok, source: {} }), false, 'another window')
  assert.equal(ctx.isTallySubmitMessage({ ...ok, data: 'please run Tally.FormSubmitted now' }), false, 'loose substring')
  assert.equal(ctx.isTallySubmitMessage({ ...ok, data: JSON.stringify({ event: 'Tally.FormLoaded' }) }), false, 'other tally event')
  assert.equal(ctx.isTallySubmitMessage({ ...ok, data: null }), false, 'null data')

  ctx.feedbackFrame = null
  assert.equal(ctx.isTallySubmitMessage(ok), false, 'no form open')
})

// ---- nothing before the click, disclosure present and in sync, form-open behaviour ----
test('dashboard.html loads nothing from Tally before a click, and the disclosure matches the reset copy', () => {
  const html = read('public/dashboard.html')
  assert.ok(!/<iframe[^>]*tally/i.test(html) && !/tally\.so/.test(html.replace(/hosted by Tally \(tally\.so\)/, '')), 'dashboard.html frames or links Tally before any click')
  const note = (t) => (t.match(/<p class="drawer-note">([^<]+)<\/p>/) || [])[1]
  assert.ok(note(html) && /Tally/.test(note(html)) && /IP address/.test(note(html)), 'disclosure line missing or incomplete')
  assert.equal(note(read('public/dashboard.js')), note(html), 'ORIGINAL_DRAWER_HTML and dashboard.html disclosure drifted')
})

test('openFeedbackForm: tracks before the URL is built, keeps the same suffix, remembers its own frame; reset forgets it', async () => {
  const src = read('public/dashboard.js')
  const from = src.indexOf('let feedbackFrame = null')
  const to = src.indexOf('// PHASE 2: Reattach button listeners')
  assert.ok(from > 0 && to > from, 'openFeedbackForm markers moved in dashboard.js')
  const order = []
  const appended = []
  const drawer = { classList: { add: (c) => order.push('class:' + c) }, textContent: 'old', appendChild: (n) => appended.push(n) }
  const ctx = {
    surveyCompleted: true,
    trackSurveyStarted: () => order.push('track'),
    buildTallyURL: async (s) => { order.push('build:' + s); return `https://tally.so/r/X?total_cards=1` },
    document: { querySelector: () => drawer, createElement: () => ({ style: {}, setAttribute() {} }) },
  }
  vm.createContext(ctx)
  vm.runInContext(`${src.slice(from, to)}
this.openFeedbackForm = openFeedbackForm; this.getFrame = () => feedbackFrame`, ctx)
  await ctx.openFeedbackForm('negative')
  assert.deepEqual(order.slice(0, 2), ['track', 'build:negative'], 'tracking must happen before the iframe URL is built')
  assert.equal(ctx.surveyCompleted, false)
  assert.equal(appended.length, 1)
  assert.equal(appended[0].src, 'https://tally.so/r/X?total_cards=1&hideTitle=1&transparentBackground=1&alignLeft=1')
  assert.equal(ctx.getFrame(), appended[0], 'listener must trust exactly the injected frame')
  assert.ok(/function resetDrawerToOriginal\(\)[\s\S]*?feedbackFrame = null[\s\S]*?ORIGINAL_DRAWER_HTML/.test(src), 'reset must forget the frame before restoring the drawer')
})
