// #246: CNN moves its lead zone between 1st and 2nd div position (a `div.product-zone` promo is sometimes first). A saved
// `...:nth-of-type(1)` selector then matches nothing; the heading fallback lands on an unrelated "Show all" block, the drift
// guard rejects it and the card said "Content changed significantly" with no Re-capture button. The card cannot recover by
// itself: with the position dropped, the lead zone and "More top stories" both pass the section check, so nothing in the
// page or the saved copy says which one the user captured (decided 18 Nov: fail visibly, never rescue by position).
// What changed: a card whose saved selector matched NOTHING reports "Site layout changed" (which offers Re-capture) instead.
// Real data: the saved copy is the owner's CNN card from 16 Nov; the page is CNN's front page fetched 17 Nov (scripts, styles
// and svg removed, only the product zone, lead zone and "More top stories" kept).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
const realRefresh = g.refreshComponent
const realTabRefresh = g.tabBasedRefresh
beforeEach(() => { g.refreshComponent = realRefresh; g.tabBasedRefresh = realTabRefresh })

const fixture = name => fs.readFileSync(new URL(`./fixtures/section-identity/${name}`, import.meta.url), 'utf8')
const SAVED = fixture('cnn-246-saved-lead-zone-16nov.html')
const PAGE_PRODUCT_ZONE_FIRST = fixture('cnn-246-layout-product-zone-first.html')
// The 16 Nov layout: no product zone, the lead zone is the first div.
const PAGE_LEAD_FIRST = (() => {
  const doc = new DOMParser().parseFromString(PAGE_PRODUCT_ZONE_FIRST, 'text/html')
  doc.querySelector('div.product-zone').remove()
  return '<html>' + doc.documentElement.innerHTML + '</html>'
})()

const SEL_1 = 'div.zone.zone--t-light.visual-cues:nth-of-type(1) > div.zone__inner.has-pseudo-class-fix-layout--wide-center > div.zone__items.layout--wide-center'
const SEL_2 = SEL_1.replace('nth-of-type(1)', 'nth-of-type(2)')
// As stored on the card: the capture took the heading text including the "Show all" button label, with a no-break space.
const FINGERPRINT = 'Democrats will win more than 250 House seats, CNN projects\n          Show all'
const card = (selector, extra = {}) => ({
  id: 'c246', name: 'CNN lead zone', url: 'https://edition.cnn.com/', selector, headingFingerprint: FINGERPRINT, positionBased: false,
  html_cache: SAVED, rawCaptureLength: 105900, structureMarker: { attr: 'data-testid', value: 'VideoElement' },
  excludedSelectors: [], exclusionSignatures: [], exclusionPatterns: [], ...extra
})
const serve = html => { global.fetch = async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => html }) }
const noBrowserTier = () => { const calls = []; g.tabBasedRefresh = async (...a) => { calls.push(a[1]); return { html: null } }; return calls }

test('#246: saved selector matches nothing (product zone is first) -> fails closed as "Site layout changed" with Re-capture offered', async () => {
  serve(PAGE_PRODUCT_ZONE_FIRST)
  noBrowserTier()
  const doc = new DOMParser().parseFromString(PAGE_PRODUCT_ZONE_FIRST, 'text/html')
  assert.equal(doc.querySelectorAll(SEL_1).length, 0, 'sanity: the saved selector matches nothing in this layout')
  const r = await g.refreshComponent(card(SEL_1))
  assert.equal(r.success, false)
  assert.equal(r.keepOriginal, true)
  assert.equal(r.html_cache, undefined, 'the last good copy is untouched')
  // #247: the fingerprint's trailing "Show all" (no-break space) no longer selects CNN's unrelated "Show all" block, so the
  // heading fallback finds nothing and the card ends here instead of in the drift guard. The user sees the same label.
  assert.match(r.error, /^Cannot extract component - selector too generic or not found$/)
  assert.equal(g.classifyError(r.error), 'layout_changed')
  assert.equal(g.getErrorLabel('layout_changed', card(SEL_1)), 'Site layout changed')
  assert.equal(g.shouldOfferRecapture({ lastOutcome: 'failed', lastErrorCode: g.classifyError(r.error) }), true)
})

test('#246: the "Show all" block the heading fallback lands on is rejected by the section check on its own', () => {
  // The fallback climbs 3 parents up from the heading that matches the fingerprint's trailing UI text ("Show all").
  const doc = new DOMParser().parseFromString(PAGE_PRODUCT_ZONE_FIRST, 'text/html')
  const fp = FINGERPRINT.toLowerCase()
  const heading = g._queryHeadingCandidates(doc).find(h => { const t = h.textContent.trim().toLowerCase(); return t.includes(fp) || (t.length >= 8 && fp.includes(t)) })
  assert.ok(heading, 'the unrelated heading is found')
  const block = heading.parentElement.parentElement.parentElement
  const sanitized = g.applySanitizationPipeline(g.stripEventHandlers(block.outerHTML), card(SEL_1))
  const m = g.sectionMatch(sanitized, SAVED)
  assert.ok(m.kept < 0.2 && m.own < 0.5, `kept ${m.kept} own ${m.own}`)
  assert.equal(g.isDifferentSection(sanitized, SAVED), true)
})

test('#246: the 16 Nov layout (lead zone first) still refreshes by direct fetch, nothing changed for it', async () => {
  serve(PAGE_LEAD_FIRST)
  const tabCalls = noBrowserTier()
  const r = await g.refreshComponent(card(SEL_1))
  assert.equal(r.success, true, r.error)
  assert.equal(tabCalls.length, 0)
  assert.match(r.html_cache, /container_lead-plus-headlines/)
})

test('#246: a stored position that still matches the lead zone keeps working (no rung, no behaviour change)', async () => {
  serve(PAGE_PRODUCT_ZONE_FIRST)
  const tabCalls = noBrowserTier()
  const r = await g.refreshComponent(card(SEL_2))
  assert.equal(r.success, true, r.error)
  assert.equal(tabCalls.length, 0)
})

test('#246: drift wording WITHOUT a dead selector is unchanged (still "Content changed significantly")', () => {
  assert.equal(g.classifyError('Content drift detected but tab refresh failed'), 'content_drift')
  assert.equal(g.getErrorLabel('content_drift', card(SEL_1)), 'Content changed significantly')
  assert.equal(g.shouldOfferRecapture({ lastOutcome: 'failed', lastErrorCode: 'content_drift' }), false)
})

// A card whose selector still matches but whose content shrank a lot hits the SAME drift-guard failure. It must keep its own
// wording: Retry is the right button there, and only a dead selector earns "Site layout changed". (Reviewer: without this,
// deleting the dead-selector condition would relabel every drift failure and the suite would stay green.)
const SMALL_LIVE = '<html><body><div class="live-block"><p>' + 'A short block of plain text with no list rows at all. '.repeat(4) + '</p></div></body></html>'
// The same block after a site move: its heading is still there (so the heading fallback finds it) but the saved selector is not.
const MOVED = '<html><body><div><div><div class=\"card-x\"><h2>Moved heading</h2><p>' + 'A short block of plain text with no list rows at all. '.repeat(4) + '</p></div></div></div></body></html>'
const smallCard = (selector, extra = {}) => card(selector, { html_cache: '<div class="live-block"><p>' + 'x'.repeat(1200) + '</p></div>', headingFingerprint: null, rawCaptureLength: 60000, ...extra })

test('#246: a LIVE selector whose content drifted keeps content_drift and no Re-capture button', async () => {
  serve(SMALL_LIVE)
  noBrowserTier()
  const r = await g.refreshComponent(smallCard('div.live-block'))
  assert.equal(r.success, false)
  assert.match(r.error, /^Content drift detected but tab refresh failed$/, 'no suffix: the selector matched')
  assert.equal(g.classifyError(r.error), 'content_drift')
  assert.equal(g.shouldOfferRecapture({ lastOutcome: 'failed', lastErrorCode: 'content_drift' }), false)
})

test('#246: the same drift with a DEAD selector reads "Site layout changed" (the only difference is the selector)', async () => {
  serve(MOVED)
  noBrowserTier()
  const r = await g.refreshComponent(smallCard('div.moved-block', { headingFingerprint: 'Moved heading' }))
  assert.equal(r.success, false)
  assert.match(r.error, /drift/i)
  assert.match(r.error, /saved selector matched nothing$/)
  assert.equal(g.classifyError(r.error), 'layout_changed')
})

test('#246: a dead-selector card with no stored baseline (older capture) fails through the no-baseline branch with the same label', async () => {
  // Reaches the no-baseline branch via a moved block with a real heading (#247: CNN's "Show all" no longer gets there).
  serve(MOVED)
  noBrowserTier()
  const r = await g.refreshComponent(smallCard('div.moved-block', { headingFingerprint: 'Moved heading', rawCaptureLength: undefined }))
  assert.equal(r.success, false)
  assert.match(r.error, /^No-baseline proxy check failed and tab refresh failed; saved selector matched nothing$/)
  assert.equal(g.classifyError(r.error), 'layout_changed')
})
