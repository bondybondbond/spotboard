// #183: the board tour must be SEEN before it counts as shown. It used to render (and burn
// dashboardTourShown) in the hidden dashboard tab while the user was still capturing, then the
// "Go to SpotBoard" reload wiped it — so most new users never saw it. dashboard.js can't be loaded
// whole, so the real showDashboardTourWhenVisible + renderDashboardTour run against jsdom.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'

const src = fs.readFileSync(new URL('../public/dashboard.js', import.meta.url), 'utf8')

function sliceFunction(name) {
  const from = src.indexOf(`function ${name}(`)
  const to = src.indexOf('\nfunction ', from + 1)
  assert.ok(from > 0 && to > from, `${name} markers moved in dashboard.js`)
  return src.slice(from, to)
}

// One "page load" of the dashboard against a shared storage object (storage survives reloads, the page does not).
function loadPage(store, { visible, cards = 1, session = {}, size = null, deferGet = false }) {
  const dom = new JSDOM('<body><button id="refresh-all-btn"></button></body>', { pretendToBeVisual: true })
  const { document, window } = dom.window
  let state = visible ? 'visible' : 'hidden'
  Object.defineProperty(document, 'visibilityState', { get: () => state })
  // Mutable per-button rects + a call counter, so tests can move a button and see whether placement still listens.
  const scrolls = { n: 0 }
  window.HTMLElement.prototype.scrollIntoView = () => { scrolls.n++ } // jsdom has none
  const rects = []
  const rectCalls = { n: 0 }
  for (let i = 0; i < cards; i++) {
    const b = document.createElement('button')
    b.className = 'refresh-single-btn'
    rects[i] = { left: 300, right: 326, top: 120 + i * 154, bottom: 146 + i * 154, width: 26, height: 26 }
    b.getBoundingClientRect = () => { rectCalls.n++; return rects[i] }
    document.body.appendChild(b)
  }
  if (size) {
    window.innerWidth = size.w
    window.innerHeight = size.h
    Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { get: () => size.cardW })
    Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', { get: () => size.cardH })
    Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', { get: () => size.cardH })
  }
  const writes = []
  const queued = []
  const events = []
  window.GA4 = { sendEvent: (name, params) => events.push({ name, params }) }
  const chrome = {
    storage: {
      local: {
        get(keys, cb) { const run = () => cb(Object.fromEntries(keys.map(k => [k, store[k]]))); if (deferGet) queued.push(run); else run() },
        set(obj) { writes.push(obj); Object.assign(store, obj) },
      },
      session: { get(key, cb) { cb({ [key]: session[key] }) } },
    },
  }
  const sandbox = { document, window, chrome, requestAnimationFrame: fn => fn() }
  const ctx = vm.createContext(sandbox)
  vm.runInContext(
    sliceFunction('showDashboardTourWhenVisible') + '\n' + sliceFunction('renderDashboardTour') +
      '\n;this.showDashboardTourWhenVisible = showDashboardTourWhenVisible',
    ctx,
  )
  const show = () => document.getElementById('sb-dashboard-tour')
  const setVisible = v => {
    state = v ? 'visible' : 'hidden'
    document.dispatchEvent(new window.Event('visibilitychange'))
  }
  return { sandbox, document, window, writes, events, show, setVisible, rects, rectCalls, scrolls, flush: () => queued.splice(0).forEach(f => f()) }
}

test('hidden tab: nothing rendered, nothing written, no started event', () => {
  const store = {}
  const page = loadPage(store, { visible: false })
  page.sandbox.showDashboardTourWhenVisible()
  assert.equal(page.show(), null)
  assert.deepEqual(page.writes, [])
  assert.equal(store.dashboardTourShown, undefined)
  assert.deepEqual(page.events, [])
})

test('hidden tab that becomes visible: shows once, flag written then, listener removed', () => {
  const store = {}
  const page = loadPage(store, { visible: false })
  page.sandbox.showDashboardTourWhenVisible()
  page.setVisible(true)
  assert.ok(page.show(), 'tour appears when the tab becomes visible')
  assert.equal(store.dashboardTourShown, true)
  assert.deepEqual(page.events.map(e => e.name), ['dashboard_tour_started'])
  // hide + show again with the flag cleared: only a LEFTOVER listener could render it a second time
  page.show().remove()
  delete store.dashboardTourShown
  page.setVisible(false)
  page.setVisible(true)
  assert.equal(page.show(), null, 'the single-shot visibilitychange listener was removed')
  assert.equal(page.events.length, 1)
})

test('the real sequence: hidden render -> "Go to SpotBoard" reload -> visible render shows exactly once', () => {
  const store = {}
  const hiddenLoad = loadPage(store, { visible: false })
  hiddenLoad.sandbox.showDashboardTourWhenVisible()
  assert.equal(store.dashboardTourShown, undefined, 'a background render must not burn the flag')
  // reload: a fresh page, now visible, same storage
  const visibleLoad = loadPage(store, { visible: true })
  visibleLoad.sandbox.showDashboardTourWhenVisible()
  assert.ok(visibleLoad.show(), 'the tour is on screen after the reload')
  assert.equal(store.dashboardTourShown, true)
  assert.equal(visibleLoad.events.filter(e => e.name === 'dashboard_tour_started').length, 1)
  // a later reload never brings it back
  const later = loadPage(store, { visible: true })
  later.sandbox.showDashboardTourWhenVisible()
  assert.equal(later.show(), null)
})

test('"Go to SpotBoard": the tab turns visible while a reload with a highlight handoff is pending -> no render, flag untouched; the reloaded page then shows it', () => {
  const store = {}
  const session = { pendingHighlightCard: { id: 'c1', ts: Date.now() } }
  const old = loadPage(store, { visible: false, session })
  old.sandbox.showDashboardTourWhenVisible()
  old.setVisible(true) // focusDashboard activates the tab, then reloads it
  assert.equal(old.show(), null, 'must not render into a page that is about to be reloaded')
  assert.equal(store.dashboardTourShown, undefined, 'must not burn the flag')
  const reloaded = loadPage(store, { visible: true }) // handoff consumed by the reloaded render
  reloaded.sandbox.showDashboardTourWhenVisible()
  assert.ok(reloaded.show())
  assert.equal(store.dashboardTourShown, true)
})

test('a stale handoff (>60s) does not block the tour on a manual switch to the tab', () => {
  const store = {}
  const page = loadPage(store, { visible: false, session: { pendingHighlightCard: { id: 'c1', ts: Date.now() - 61000 } } })
  page.sandbox.showDashboardTourWhenVisible()
  page.setVisible(true)
  assert.ok(page.show())
})

test('flag already set (another dashboard tab showed it) -> nothing, even when the tab turns visible', () => {
  const store = { dashboardTourShown: true }
  const page = loadPage(store, { visible: false })
  page.sandbox.showDashboardTourWhenVisible()
  page.setVisible(true)
  assert.equal(page.show(), null)
  assert.deepEqual(page.writes, [])
})

test('callout is anchored to the first Refresh button; falls back to centred when there is none', () => {
  const withBtn = loadPage({}, { visible: true })
  withBtn.sandbox.showDashboardTourWhenVisible()
  const card = withBtn.show()
  assert.ok(card.classList.contains('dashboard-tour-card--anchored'))
  assert.equal(card.style.top, '160px') // button bottom 146 + 14
  assert.ok(withBtn.document.querySelector('.refresh-single-btn').classList.contains('tour-highlight-btn'))
  assert.ok(withBtn.document.getElementById('refresh-all-btn').classList.contains('tour-highlight-btn'))
  const noBtn = loadPage({}, { visible: true, cards: 0 })
  noBtn.sandbox.showDashboardTourWhenVisible()
  assert.ok(noBtn.show(), 'still shown')
  assert.ok(!noBtn.show().classList.contains('dashboard-tour-card--anchored'))
})

test('Got it / ✕ / Esc each dismiss, write only dashboardTourShown, and report the method', () => {
  for (const [how, reason] of [['got_it', 'got_it'], ['close', 'close'], ['esc', 'esc']]) {
    const store = {}
    const page = loadPage(store, { visible: true })
    page.sandbox.showDashboardTourWhenVisible()
    page.writes.length = 0
    if (how === 'got_it') page.document.querySelector('.dashboard-tour-btn').click()
    if (how === 'close') page.document.querySelector('.dashboard-tour-close').click()
    if (how === 'esc') page.document.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Escape' }))
    assert.equal(page.show(), null, how)
    assert.equal(page.document.querySelectorAll('.tour-highlight-btn').length, 0, how)
    assert.ok(page.writes.every(w => Object.keys(w).join() === 'dashboardTourShown'), `${how}: only the flag is written`)
    const dismissed = page.events.filter(e => e.name === 'dashboard_tour_dismissed')
    assert.equal(dismissed.length, 1, how)
    assert.equal(dismissed[0].params.reason, reason)
  }
})

test('copy: complete sentences, says links inside a card (not the title), no Delete/Pause screen', () => {
  const page = loadPage({}, { visible: true })
  page.sandbox.showDashboardTourWhenVisible()
  const text = page.show().textContent
  assert.match(text, /saved copies and do not update by themselves/)
  assert.match(text, /Refresh All at the top/)
  assert.match(text, /Links inside a card open the original page\./)
  assert.doesNotMatch(text, /title|Delete|Pause|Two quick things/i)
})

test('wiring: the board render calls the visibility gate, never renders the tour or writes the flag directly', () => {
  const site = src.slice(src.indexOf("chrome.storage.local.get(['onboardingCompleted', 'dashboardTourShown', 'hasExistingCards']"))
  const block = site.slice(0, site.indexOf('Issue #12'))
  assert.match(block, /showDashboardTourWhenVisible\(\)/)
  assert.doesNotMatch(block, /renderDashboardTour\(/)
  assert.doesNotMatch(block.slice(block.indexOf('components.length > 0')), /dashboardTourShown: true/)
})

test('narrow + short window: the callout is clamped inside the viewport (Got it stays reachable)', () => {
  const page = loadPage({}, { visible: true, size: { w: 360, h: 200, cardW: 336, cardH: 220 } })
  page.sandbox.showDashboardTourWhenVisible()
  const card = page.show()
  assert.equal(page.scrolls.n, 1, 'asked to bring the button into view first (no room for the callout below it)')
  assert.equal(card.style.left, '12px') // button at x 300-326 would push a 336px card off the left; kept at the 12px gutter
  assert.equal(card.style.top, '12px') // 146+14 = 160 would put a 220px card past a 200px window; clamped to the top gutter
  assert.equal(card.style.maxHeight, '176px') // window 200 - 24: the card can never be taller than the window ...
  assert.equal(card.style.overflowY, 'auto') // ... and scrolls inside instead, so Got it is always reachable
  const arrow = parseFloat(card.style.getPropertyValue('--tour-arrow-left'))
  assert.ok(arrow >= 16 && arrow <= 336 - 30, 'arrow stays inside the card')
})

test('follows the button on scroll/resize, re-finds the next visible button when its card is hidden', () => {
  const page = loadPage({}, { visible: true, cards: 2 })
  page.sandbox.showDashboardTourWhenVisible()
  const card = page.show()
  assert.equal(card.style.top, '160px')
  page.rects[0] = { ...page.rects[0], top: 70, bottom: 96 } // page scrolled 50px
  page.window.dispatchEvent(new page.window.Event('scroll'))
  assert.equal(card.style.top, '110px')
  page.rects[0] = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 } // board-tab switch hid card 1
  page.window.dispatchEvent(new page.window.Event('resize'))
  assert.equal(card.style.top, '314px') // card 2's button: bottom 300 + 14
  assert.ok(card.classList.contains('dashboard-tour-card--anchored'))
})

test('after dismissal nothing listens any more: no placement on scroll/resize, a second Esc sends nothing', () => {
  const page = loadPage({}, { visible: true })
  page.sandbox.showDashboardTourWhenVisible()
  page.document.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Escape' }))
  assert.equal(page.show(), null)
  const callsAfterExit = page.rectCalls.n
  page.window.dispatchEvent(new page.window.Event('scroll'))
  page.window.dispatchEvent(new page.window.Event('resize'))
  page.document.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Escape' }))
  assert.equal(page.rectCalls.n, callsAfterExit, 'resize/scroll listeners were removed')
  assert.equal(page.events.filter(e => e.name === 'dashboard_tour_dismissed').length, 1, 'keydown listener was removed')
})

test('horizontal upper clamp: a button near the right edge does not push the callout past the window', () => {
  const page = loadPage({}, { visible: true, size: { w: 800, h: 700, cardW: 336, cardH: 220 } })
  page.rects[0] = { left: 764, right: 790, top: 120, bottom: 146, width: 26, height: 26 }
  page.sandbox.showDashboardTourWhenVisible()
  assert.equal(page.show().style.left, '452px') // 800 - 336 - 12, not the button-aligned 454
  assert.equal(page.show().style.overflowY, '') // fits: no inner scroll
})

test('the tab flips back to hidden while the flag is being read -> nothing rendered or written, shows on the next visible', () => {
  const store = {}
  const page = loadPage(store, { visible: true, deferGet: true })
  page.sandbox.showDashboardTourWhenVisible()
  page.setVisible(false)
  page.flush()
  assert.equal(page.show(), null)
  assert.deepEqual(page.writes, [])
  page.setVisible(true)
  page.flush()
  assert.ok(page.show())
  assert.equal(store.dashboardTourShown, true)
})

test('CSS guard: the anchored callout stays inside the window (border-box, viewport-capped width)', () => {
  const css = fs.readFileSync(new URL('../public/dashboard.html', import.meta.url), 'utf8')
  const block = css.slice(css.indexOf('.dashboard-tour-card--anchored {'), css.indexOf('}', css.indexOf('.dashboard-tour-card--anchored {')))
  assert.match(block, /box-sizing:\s*border-box/)
  assert.match(block, /max-width:\s*calc\(100vw - 24px\)/)
})
