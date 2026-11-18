// #248: CNN's lead zone and "More top stories" are built from one template, so both pass the shape check (0.67/0.63 and
// 0.59/0.74, #246). A card saved with `zone:nth-of-type(2)` therefore refreshed the NEIGHBOUR as a success and stored it as
// the new reference. The fix reads a positive identity signal from the saved copy itself: CNN's Clay CMS zone/stack
// instance ids (`data-uri=".../_components/stack/instances/<id>@published"`), identical in 5 dated copies over ~5.5 weeks
// while card-level ids churn daily. No new stored field. Real data: the saved copy is the owner's CNN card from 16 Nov, the
// page is CNN's front page fetched 17 Nov (scripts/styles/svg removed; product zone, lead zone and "More top stories" kept).
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
// The 16 Nov layout: no product zone, so the lead zone is the first div and "More top stories" the second.
const PAGE_LEAD_FIRST = (() => {
  const doc = new DOMParser().parseFromString(PAGE_PRODUCT_ZONE_FIRST, 'text/html')
  doc.querySelector('div.product-zone').remove()
  return '<html>' + doc.documentElement.innerHTML + '</html>'
})()

const SEL_1 = 'div.zone.zone--t-light.visual-cues:nth-of-type(1) > div.zone__inner.has-pseudo-class-fix-layout--wide-center > div.zone__items.layout--wide-center'
const SEL_2 = SEL_1.replace('nth-of-type(1)', 'nth-of-type(2)')
const FINGERPRINT = 'Democrats will win more than 250 House seats, CNN projects\n          Show all'
const card = (selector, extra = {}) => ({
  id: 'c248', name: 'CNN lead zone', url: 'https://edition.cnn.com/', selector, headingFingerprint: FINGERPRINT, positionBased: false,
  html_cache: SAVED, rawCaptureLength: 105900, structureMarker: { attr: 'data-testid', value: 'VideoElement' },
  excludedSelectors: [], exclusionSignatures: [], exclusionPatterns: [], ...extra
})
const serve = html => { global.fetch = async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => html }) }
const noBrowserTier = () => { const calls = []; g.tabBasedRefresh = async (...a) => { calls.push(a[1]); return { html: null } }; return calls }
// The zone content as the refresh would extract it, sanitized like a stored copy.
const zoneHtml = (page, selector) => {
  const doc = new DOMParser().parseFromString(page, 'text/html')
  const el = doc.querySelector(selector)
  return g.applySanitizationPipeline(g.stripEventHandlers(el.outerHTML), card(selector))
}
const STACK = n => `cms.cnn.com/_components/stack/instances/${n}`
const withIds = (...ids) => '<div class="wrap">' + ids.map(i => `<div data-uri="${i}@published"><ul><li>x</li></ul></div>`).join('') + '</div>'

test('#248 reproduction: position now lands on "More top stories" -> fails visibly, last copy kept, Re-capture offered', async () => {
  serve(PAGE_LEAD_FIRST)
  const doc = new DOMParser().parseFromString(PAGE_LEAD_FIRST, 'text/html')
  assert.match(doc.querySelector(SEL_2).textContent, /More top stories/, 'sanity: this is the neighbouring zone')
  const tabCalls = noBrowserTier()
  const r = await g.refreshComponent(card(SEL_2))
  assert.equal(r.success, false)
  assert.equal(r.keepOriginal, true)
  assert.equal(r.html_cache, undefined, 'nothing is stored, so the wrong zone can never become the reference')
  assert.equal(r.rawCaptureLength, undefined, 'a rejected result never moves the drift baseline')
  assert.equal(g.classifyError(r.error), 'layout_changed')
  assert.equal(g.getErrorLabel('layout_changed', card(SEL_2)), 'Site layout changed')
  assert.equal(g.shouldOfferRecapture({ lastOutcome: 'failed', lastErrorCode: g.classifyError(r.error) }), true)
  assert.ok(tabCalls.length <= 3, 'the existing escalation ran at most as before')
})

test('#248: the position that lands on the lead zone still refreshes (no behaviour change)', async () => {
  serve(PAGE_LEAD_FIRST)
  const tabCalls = noBrowserTier()
  const r = await g.refreshComponent(card(SEL_1))
  assert.equal(r.success, true, r.error)
  assert.equal(tabCalls.length, 0, 'direct fetch, no browser tier')
  assert.match(r.html_cache, /container_lead-plus-headlines/)
  assert.doesNotMatch(r.html_cache, /More top stories/)
})

test('#248: the 17 Nov product-zone-first layout, selector 2 = lead zone, still refreshes', async () => {
  serve(PAGE_PRODUCT_ZONE_FIRST)
  noBrowserTier()
  const r = await g.refreshComponent(card(SEL_2))
  assert.equal(r.success, true, r.error)
  assert.doesNotMatch(r.html_cache, /More top stories/)
})

test('#248: the real zones: lead zone shares all 3 stack ids with the saved copy, "More top stories" none', () => {
  const saved = g.sectionIdentityIds(SAVED)
  assert.equal(saved.size, 3)
  const lead = g.sectionIdentityIds(zoneHtml(PAGE_LEAD_FIRST, SEL_1))
  const more = g.sectionIdentityIds(zoneHtml(PAGE_LEAD_FIRST, SEL_2))
  assert.ok(more.size >= 1)
  assert.deepEqual([...lead].filter(i => saved.has(i)).length, 3)
  assert.deepEqual([...more].filter(i => saved.has(i)).length, 0)
})

test('#248: rejected in both directions, and the shape check alone would have passed it (the reason for the rule)', () => {
  const lead = zoneHtml(PAGE_LEAD_FIRST, SEL_1)
  const more = zoneHtml(PAGE_LEAD_FIRST, SEL_2)
  assert.equal(g.isDifferentSection(more, lead), true)
  assert.equal(g.isDifferentSection(lead, more), true)
  assert.equal(g.isDifferentSection(lead, lead), false)
  const m = g.sectionMatch(more, SAVED)
  assert.ok(m.kept >= 0.5 && m.own >= 0.5, `shape check passes it: kept ${m.kept} own ${m.own}`)
})

test('#248: the identity veto runs even when the shape check accepts the candidate (so nothing downstream can rescue it)', () => {
  // Same shapes, other zone ids: stage 1 accepts it on shape alone, and the identity rule still rejects it. Ordering in isDifferentSection
  // (identity first, before sectionMatch) is what keeps the folded stage (#243) from ever seeing it.
  // >= 8 shapes (SECTION_MIN_SHAPES) so sectionMatch really runs, with per-item row classes so the folded stage is in play.
  const rows = n => Array.from({ length: n }, (_, i) => `<li class="row row--i${i}"><a class="row__a" href="/a${i}"><span class="row__t">T${i}</span><em class="row__k">k</em></a></li>`).join('')
  const page = (...ids) => `<section class="z"><header class="z__h"><h2 class="z__t">Top</h2></header>${ids.map(i => `<div data-uri="${i}@published" class="stack"><ul class="list">${rows(5)}</ul></div>`).join('')}<footer class="z__f"><p class="z__p">more</p></footer></section>`
  const saved = page(STACK('a1'), STACK('a2'), STACK('a3'))
  const other = page(STACK('b1'), STACK('b2'), STACK('b3'))
  const m = g.sectionMatch(other, saved)
  assert.ok(m !== null && m.kept >= 0.5 && m.own >= 0.5, 'sanity: the shape check (stage 1 or folded) accepts the other-id candidate on its own')
  assert.equal(g.isDifferentSection(saved, saved), false)
  assert.equal(g.isDifferentSection(other, saved), true, 'identical shapes, disjoint ids: still different')
  assert.equal(g.isDifferentSection(saved, other), true, 'and the other way')
})

test('#248: identity is only judged when it can be: < 3 saved ids, or no ids in the candidate = unchanged behaviour', () => {
  const body = '<ul class="l">' + Array.from({ length: 9 }, (_, i) => `<li class="r"><a class="r__a" href="/x${i}"><span class="r__t">t${i}</span></a></li>`).join('') + '</ul>'
  const mk = (...ids) => ids.map(i => `<div data-uri="${i}@published" class="s">${body}</div>`).join('')
  const three = mk(STACK('a1'), STACK('a2'), STACK('a3'))
  assert.equal(g.isDifferentSection(mk(STACK('b1'), STACK('b2'), STACK('b3')), mk(STACK('a1'), STACK('a2'))), false, 'saved holds only 2 ids')
  assert.equal(g.isDifferentSection(body.replace(/^/, '<div class="s">') + '</div>'.repeat(1), three), false, 'candidate has no ids: unknown is not different')
  assert.equal(g.isDifferentSection(mk(STACK('b1'), STACK('b2'), STACK('b3')), three), true)
  assert.equal(g.isDifferentSection(mk(STACK('a1'), STACK('b2'), STACK('b3')), three), false, 'one shared id is enough')
})

test('#248: malformed, non-Clay and duplicate values never count toward the threshold', () => {
  const ids = g.sectionIdentityIds(
    '<div data-uri="cms.cnn.com/_components/stack/instances/a1@published"></div>' +
    '<div data-uri="cms.cnn.com/_components/stack/instances/a1@published"></div>' +
    '<div data-uri="cms.cnn.com/_components/card/instances/c1@published"></div>' +
    '<div data-uri="javascript:alert(1)"></div><div data-uri="cms.cnn.com/_components/stack/instances/"></div>' +
    '<div data-uri="x/_components/zone/instances/z 1@published"></div><div id="stack-1"></div>')
  assert.deepEqual([...ids], ['cms.cnn.com/_components/stack/instances/a1'])
  assert.equal(g.sectionIdentityIds(undefined).size, 0)
})

test('#248 known limit: a recreated zone (every id new) fails visibly with Re-capture, never silently', () => {
  const saved = withIds(STACK('a1'), STACK('a2'), STACK('a3'))
  const r = g._finalizeSuccess(withIds(STACK('n1'), STACK('n2'), STACK('n3')), { name: 'CNN', html_cache: saved })
  // too small for the shape check; the identity rule alone decides, and nothing is stored
  assert.equal(r.success, false)
  assert.equal(r.keepOriginal, true)
  assert.equal(r.html_cache, undefined)
  assert.equal(g.classifyError(r.error), 'layout_changed')
})

test('#248 known limit: a result without ids is accepted, after which the card has none to judge by (unprotected, not blocked)', () => {
  const saved = withIds(STACK('a1'), STACK('a2'), STACK('a3'))
  const idless = '<div class="wrap"><ul><li>x</li></ul></div>'
  assert.equal(g._finalizeSuccess(idless, { name: 'CNN', html_cache: saved }).success, true)
  // the stored copy is now idless: a different section is no longer detected by this rule, and a correct one is not rejected
  assert.equal(g.isDifferentSection(withIds(STACK('b1'), STACK('b2'), STACK('b3')), idless), false)
  assert.equal(g.isDifferentSection(saved, idless), false)
})

test('#248: a card with no Clay ids at all is untouched (25 of 26 cards on the 7 Nov board)', () => {
  const kalshi = fixture('kalshi-212-saved.html')
  assert.equal(g.sectionIdentityIds(kalshi).size, 0)
  assert.equal(g._finalizeSuccess(kalshi, { name: 'Kalshi', html_cache: kalshi }).success, true)
})
