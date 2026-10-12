// #201: HotUKDeals' server HTML is 30 deal shells of Vue placeholders: 30 empty image slots and ONE real <img>
// (a promo banner). The old tier-1 guard only read "slots >= 3 AND zero images", so that lone banner let the shell
// through, the hydrated-only "exclude all like this" rules matched nothing, and the refresh failed closed forever.
// The placeholder signal is now "empty image slots at least twice the real images" (strict), so a stray image
// cannot hide a shell, while healthy pages with a few empty thumbnails among many real ones stay on tier 1.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
g.LazyLoad = await import('../.test-build/utils/lazy-load.js')
const realTabRefresh = g.tabBasedRefresh
beforeEach(() => { g.tabBasedRefresh = realTabRefresh })

const TITLE = 'Hottest deals right now'
const item = (i, { img = false, slot = false, rule = false } = {}) =>
  `<article><a href="/deals/${i}">Deal number ${i} with a long enough title to count as real text</a>` +
  `${img ? `<img src="https://x.test/${i}.jpg">` : ''}${slot ? '<div class="thumbnail-box"></div>' : ''}` +
  `${rule ? `<span class="meta-hydrated">posted ${i} hours ago by someone</span>` : ''}</article>`
const list = items => `<div class="list"><h2>${TITLE}</h2>${items.join('')}</div>`
const page = region => `<html><body>${region}</body></html>`
const range = n => Array.from({ length: n }, (_, i) => i)

// What a rendered tab returns: every item has its image and the hydrated-only span the owner's rule targets.
const rendered = list(range(10).map(i => item(i, { img: true, rule: true })))
const RULE = [{ a: 'SPAN', c: 'meta-hydrated', n: 10, p: [], t: 'SPAN' }]

// Server HTML with `imgs` real images and `slots` empty thumbnail slots among 12 text items
function serverRegion({ imgs, slots }) {
  return list(range(12).map(i => item(i, { img: i < imgs, slot: i >= imgs && i < imgs + slots })))
}

async function refresh({ imgs, slots, saved = rendered, patterns = [] }) {
  let tabCalls = 0
  global.fetch = async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => page(serverRegion({ imgs, slots })) })
  g.tabBasedRefresh = async () => { tabCalls++; return { html: rendered, activeFocusNeeded: false } }
  const r = await g.refreshComponent({ id: 'c201', name: TITLE, url: 'https://example.com/hottest', selector: 'div.list',
    headingFingerprint: TITLE, positionBased: false, html_cache: saved, rawCaptureLength: saved.length,
    excludedSelectors: [], exclusionSignatures: [], exclusionPatterns: patterns })
  return { r, tabCalls }
}

test('#201: 12 empty slots + one stray promo image escalates to the tab and the hydrated-only rule then applies', async () => {
  const { r, tabCalls } = await refresh({ imgs: 1, slots: 12, patterns: RULE })
  assert.equal(tabCalls, 1, 'the shell must not be accepted from the server HTML')
  assert.equal(r.success, true, r.error)
  assert.doesNotMatch(r.html_cache, /posted \d+ hours ago/, 'the exclusion rule matched the rendered copy and removed its target')
})

test('old behaviour kept: zero images + >= 3 empty slots still escalates (saved copy has no images, so only the slot clause can fire)', async () => {
  assert.equal((await refresh({ imgs: 0, slots: 3, saved: list(range(12).map(i => item(i))) })).tabCalls, 1)
})

test('boundary is strict: 1 image + 3 slots flips (documented accepted edge), 2 images + 4 slots stays', async () => {
  assert.equal((await refresh({ imgs: 1, slots: 3 })).tabCalls, 1)
  const stays = await refresh({ imgs: 2, slots: 4 })
  assert.equal(stays.tabCalls, 0)
  assert.equal(stays.r.success, true, stays.r.error)
})

test('CNN shape (many real images, 3 empty slots) stays on tier 1', async () => {
  const { r, tabCalls } = await refresh({ imgs: 12, slots: 0 })
  assert.equal(tabCalls, 0)
  assert.equal(r.success, true, r.error)
  // 14 images + 3 empty slots, 12 items: slots live in extra items so use markup directly
  const html = list([...range(12).map(i => item(i, { img: true })), item(12, { slot: true }), item(13, { slot: true }), item(14, { slot: true })])
  let tabs = 0
  global.fetch = async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => page(html) })
  g.tabBasedRefresh = async () => { tabs++; return { html: rendered, activeFocusNeeded: false } }
  const r2 = await g.refreshComponent({ id: 'c201b', name: TITLE, url: 'https://example.com/', selector: 'div.list', headingFingerprint: TITLE,
    positionBased: false, html_cache: rendered, rawCaptureLength: rendered.length, excludedSelectors: [], exclusionSignatures: [], exclusionPatterns: [] })
  assert.equal(tabs, 0)
  assert.equal(r2.success, true, r2.error)
})

test('text-only card (no images, no slots, nothing saved) stays on tier 1', async () => {
  const textOnly = list(range(12).map(i => item(i)))
  const { r, tabCalls } = await refresh({ imgs: 0, slots: 0, saved: textOnly })
  assert.equal(tabCalls, 0)
  assert.equal(r.success, true, r.error)
})

// Look-alikes the slot definition must not mistake for a shell. Outcomes recorded as observed.
function lookAlike(extra) {
  const html = list(range(12).map(i => item(i)).concat([extra]))
  global.fetch = async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => page(html) })
  let tabs = 0
  g.tabBasedRefresh = async () => { tabs++; return { html: rendered, activeFocusNeeded: false } }
  return g.refreshComponent({ id: 'c201c', name: TITLE, url: 'https://example.com/', selector: 'div.list', headingFingerprint: TITLE,
    positionBased: false, html_cache: html, rawCaptureLength: html.length, excludedSelectors: [], exclusionSignatures: [], exclusionPatterns: [] })
    .then(r => ({ r, tabs }))
}

test('lazy <img data-src> (an <img> exists, blank src) counts as a real image: stays on tier 1', async () => {
  const lazy = Array.from({ length: 6 }, (_, i) => `<div class="thumbnail-box"><img data-src="https://x.test/${i}.jpg" src=""></div>`).join('')
  const { r, tabs } = await lookAlike(lazy)
  assert.equal(tabs, 0)
  assert.equal(r.success, true, r.error)
})

test('CSS background-image thumbnails (no <img>, no text) read as empty slots: 0 images + 4 slots escalates (same as before #201)', async () => {
  const bg = Array.from({ length: 4 }, (_, i) => `<div class="thumbnail-box" style="background-image:url(https://x.test/${i}.jpg)"></div>`).join('')
  const { tabs } = await lookAlike(bg)
  assert.equal(tabs, 1)
})

test('<noscript><img> fallbacks are counted as images (raw <img match): stays on tier 1', async () => {
  const ns = Array.from({ length: 6 }, (_, i) => `<div class="thumbnail-box"><noscript><img src="https://x.test/${i}.jpg"></noscript></div>`).join('')
  const { r, tabs } = await lookAlike(ns)
  assert.equal(tabs, 0)
  assert.equal(r.success, true, r.error)
})
