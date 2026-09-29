// #72: scroll-through lazy loading for a selected block. jsdom has no layout, so the block's
// rect and the site's lazy loader are simulated: the "site" fills one batch of empty
// thumbnail slots per scroll step, exactly the shape CNBC's react-lazyload shows live
// (3 of 21 mounted at scrollY=0, all 21 after stepping through the block).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { countEmptyImageSlots, ensureLazyContentLoaded, MIN_EMPTY_SLOTS } = await import('../.test-build/utils/lazy-load.js')

let scrollY, scrollCalls, block

const slot = (filled) => filled
  ? '<div class="RiverThumbnail-thumbnailContainer"><img src="https://x.test/a.jpg"></div>'
  : '<div class="RiverThumbnail-thumbnailContainer"><div class="lazyload-placeholder"></div></div>'

// fillPerStep: how many empty slots the simulated site mounts on each scrollTo.
// growPerStep: new empty slots the site appends per scrollTo (infinite feed).
function setup({ empty = 12, filled = 3, fillPerStep = 5, growPerStep = 0, blockTop = 1000, blockHeight = 2500 } = {}) {
  document.body.innerHTML = `<div id="b">${slot(true).repeat(filled)}${slot(false).repeat(empty)}</div>`
  block = document.getElementById('b')
  scrollY = 0
  scrollCalls = []
  window.scrollTo = (arg) => {
    scrollY = arg.top
    scrollCalls.push(arg.top)
    let toFill = fillPerStep
    for (const el of block.querySelectorAll('.lazyload-placeholder')) {
      if (toFill-- <= 0) break
      el.parentElement.innerHTML = '<img src="https://x.test/a.jpg">'
    }
    for (let i = 0; i < growPerStep; i++) block.insertAdjacentHTML('beforeend', slot(false))
  }
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY })
  Object.defineProperty(window, 'scrollX', { configurable: true, get: () => 0 })
  block.getBoundingClientRect = () => ({ top: blockTop - scrollY, bottom: blockTop + blockHeight - scrollY, height: blockHeight })
}

const fast = { stepWaitMs: 1 }

beforeEach(() => setup())

test('countEmptyImageSlots: counts empty thumbnail containers, not the <img> elements themselves', () => {
  document.body.innerHTML = '<div id="r"><img class="image__dam-img" src="a.jpg"><img class="sdc-site-tile__image" src="b.jpg"><div class="thumbnail-x"></div><div class="thumbnail-y">caption</div><div class="pic-image"><img src="c.jpg"></div></div>'
  assert.equal(countEmptyImageSlots(document.getElementById('r')), 1)
})

test('below MIN_EMPTY_SLOTS the block is left alone (no scroll at all)', async () => {
  setup({ empty: MIN_EMPTY_SLOTS - 1 })
  const r = await ensureLazyContentLoaded(block, fast)
  assert.equal(r.steps, 0)
  assert.deepEqual(scrollCalls, [])
})

test('mounts the placeholders and restores the original scroll position', async () => {
  scrollY = 400
  const r = await ensureLazyContentLoaded(block, fast)
  assert.equal(r.emptyBefore, 12)
  assert.equal(r.emptyAfter, 0)
  assert.equal(block.querySelectorAll('img').length, 15)
  assert.equal(scrollCalls[scrollCalls.length - 1], 400, 'last scrollTo restores the origin')
  assert.equal(r.aborted, false)
  assert.equal(r.stalled, false)
})

test('stops early when scrolling fills nothing (slots were never lazy placeholders)', async () => {
  setup({ fillPerStep: 0 })
  const r = await ensureLazyContentLoaded(block, fast)
  assert.equal(r.stalled, true)
  assert.equal(r.steps, 2)
  assert.equal(scrollCalls[scrollCalls.length - 1], 0, 'still restores')
})

test('stops when the site appends slots as fast as they fill (infinite feed)', async () => {
  setup({ fillPerStep: 2, growPerStep: 4 })
  const r = await ensureLazyContentLoaded(block, fast)
  assert.equal(r.stalled, true)
  assert.ok(r.steps <= 2)
})

test('partial progress that then stops filling is detected as a stall (not chased to the block bottom)', async () => {
  let calls = 0
  setup({ empty: 12, fillPerStep: 0, blockHeight: 100000 })
  const realScroll = window.scrollTo
  window.scrollTo = (arg) => { calls++; if (calls === 1) { block.querySelectorAll('.lazyload-placeholder').forEach((el, i) => { if (i < 4) el.parentElement.innerHTML = '<img src="a.jpg">' }) } realScroll(arg) }
  const r = await ensureLazyContentLoaded(block, fast)
  assert.equal(r.stalled, true)
  assert.equal(r.steps, 3, 'step 1 fills 4, steps 2 and 3 fill nothing')
})

test('step cap ends a slow-filling block and still restores', async () => {
  setup({ empty: 30, fillPerStep: 1, blockHeight: 100000 })
  const r = await ensureLazyContentLoaded(block, { ...fast, maxSteps: 3 })
  assert.equal(r.capped, true)
  assert.equal(r.steps, 3)
  assert.equal(scrollCalls[scrollCalls.length - 1], 0)
})

test('user input during the scroll aborts it and does NOT fight the user by restoring', async () => {
  setup({ fillPerStep: 1 })
  // Event.isTrusted is unforgeable in jsdom, so capture the listener and call it directly.
  const handlers = {}
  const realAdd = window.addEventListener.bind(window)
  window.addEventListener = (type, fn, opts) => { handlers[type] = fn; return realAdd(type, fn, opts) }
  const pending = ensureLazyContentLoaded(block, { stepWaitMs: 20 })
  await new Promise(r => setTimeout(r, 5))
  handlers.wheel({ isTrusted: false })
  handlers.wheel({ isTrusted: true })
  const r = await pending
  window.addEventListener = realAdd
  assert.equal(r.aborted, true)
  assert.equal(scrollCalls.length, 1, 'no restore scroll after an abort')
})
