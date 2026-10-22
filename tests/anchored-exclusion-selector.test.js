// #221: a block with no stable hook of its own (Tailwind-only, a same-class sibling) used to be stored as a
// :nth-child chain from the card root. Kalshi's "Combo" block sits above it: in the live DOM when the user
// clicks, stripped as hidden before every refresh -- so the chain's index shifted and the rule matched
// nothing on every refresh (fail closed since #220), and Re-capture stored the same chain again.
// The exclusion generator now anchors on the nearest classed ancestor inside the card, with a
// class-qualified :nth-child tail. Fixture: the Kalshi House-winner card's structure, text shortened.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { __generateExclusionSelectorForTest: generateExclusionSelector } = await import('../.test-build/content.js')
const { applyExclusionsWithStats } = await import('../.test-build/utils/dom-cleanup.js')

beforeEach(() => { document.body.innerHTML = '' })

const CARD = 'div.flex.flex-col.gap-4'
const OLD_CHAIN = 'div:nth-child(1) > div:nth-child(1) > section:nth-child(1) > div:nth-child(1) > div:nth-child(4) > div:nth-child(2) > div:nth-child(2)'
const ANCHORED = 'div.min-w-0.w-full.flex > div.flex.flex-col.w-full:nth-child(2) > div.flex.flex-col:nth-child(2)'

// `combo`: the md:block widget above the market block. `extraUnderAnchor`: the 390 px layout renders a
// <section> between the chart and the strip (real markup). `sameClassBefore`: a same-class sibling inserted right before the strip.
function kalshiCard({ combo = true, extraUnderAnchor = false, sameClassBefore = false, bannerAboveAnchor = false } = {}) {
  const section = (body) => `<div class="flex flex-col w-full"><div class="w-full self-center"><section class="w-full py-0 p-3">${body}</section></div></div>`
  const strip = '<div class="flex flex-col"><div class="flex gap-2">Events Balance of Power Margin of Victory Search</div><div class="flex flex-col">Republicans win 58%</div></div>'
  const chart = '<div class="flex flex-col"><div class="flex flex-col">Chance Democratic Party 91%</div></div>'
  const market = `<div class="min-w-0 w-full flex flex-col"><div class="flex min-h-[32px] pt-0.5">Chance</div><div class="flex flex-col w-full gap-7">${chart}${extraUnderAnchor ? '<section class="flex flex-col gap-1.5 rounded-x40">General election</section>' : ''}${sameClassBefore ? '<div class="flex flex-col">Inserted market</div>' : ''}${strip}</div></div>`
  const top = `<div class="flex flex-col"><div class="flex flex-col w-full">Democrat Nov 3 Republican</div><div class="transition-all duration-300"></div>${combo ? '<div class="mb-3 hidden md:block">Combo</div>' : ''}${bannerAboveAnchor ? '<div class="rounded bg-yellow">New</div>' : ''}${market}</div>`
  return `<div class="flex flex-col gap-4">${section(top)}${section('<div class="flex flex-col">People are also trading</div>')}${section('<div class="flex flex-col">Who will win the House?</div>')}</div>`
}

function mount(html) {
  document.body.innerHTML = `<main>${html}</main>`
  return document.querySelector(CARD)
}

// found by text: a marker attribute would give it a stable hook of its own (data-t is one)
const strip = (root) => [...root.querySelectorAll('div')].find(d => d.firstElementChild?.textContent.startsWith('Events Balance'))
const refresh = (html, sel) => applyExclusionsWithStats(html, [sel], CARD)

test('#221 premise: the old position chain finds the strip at capture and nothing once the Combo block is stripped', () => {
  const live = mount(kalshiCard())
  assert.equal(live.querySelector(':scope > ' + OLD_CHAIN), strip(live))
  const refreshed = mount(kalshiCard({ combo: false }))
  assert.equal(refreshed.querySelectorAll(':scope > ' + OLD_CHAIN).length, 0)
})

test('#221: the strip is stored anchored inside the card, and still found once the Combo block is gone', () => {
  const root = mount(kalshiCard())
  const sel = generateExclusionSelector(strip(root), root)
  assert.equal(sel, ANCHORED)
  for (const html of [kalshiCard(), kalshiCard({ combo: false })]) {
    const r = refresh(html, sel)
    assert.deepEqual(r.unresolved, [])
    assert.ok(!r.html.includes('Margin of Victory'), 'strip removed')
    assert.ok(r.html.includes('Chance Democratic Party') && r.html.includes('People are also trading'), 'neighbours kept')
  }
})

test('#221: a different-class block appearing above the anchor does not move the rule', () => {
  const root = mount(kalshiCard())
  const sel = generateExclusionSelector(strip(root), root)
  const r = refresh(kalshiCard({ bannerAboveAnchor: true }), sel)
  assert.deepEqual(r.unresolved, [])
  assert.ok(!r.html.includes('Margin of Victory'))
})

test('#221 negative: a layout with an extra child under the anchor matches nothing -- visible failure, no neighbour removed', () => {
  const root = mount(kalshiCard())
  const sel = generateExclusionSelector(strip(root), root)
  const html = kalshiCard({ extraUnderAnchor: true })
  const r = refresh(html, sel)
  assert.deepEqual(r.unresolved, [sel], 'reported as not applied, so the refresh fails closed upstream')
  assert.equal(r.html.replace(/\s+/g, ''), applyExclusionsWithStats(html, [], CARD).html.replace(/\s+/g, ''), 'nothing removed')
})

test('#221 known limit: a same-class block inserted right before the strip takes its place (the old chain had the same exposure)', () => {
  const root = mount(kalshiCard())
  const sel = generateExclusionSelector(strip(root), root)
  const r = refresh(kalshiCard({ sameClassBefore: true }), sel)
  assert.ok(!r.html.includes('Inserted market') && r.html.includes('Margin of Victory'))
})

// Real Kalshi: once the comments load, five comment rows carry the market block's classes in another order
// (`flex w-full min-w-0 ...`), so the anchor alone is not unique -- the whole path still is.
const comments = '<div class="flex flex-col w-full"><div class="w-full self-center"><section class="w-full py-0 p-3"><div class="flex w-full min-w-0 max-w-full flex-col"><div class="flex">skeletrocity</div></div><div class="flex w-full min-w-0 items-center gap-0.5"><div class="flex">JMO</div><div class="flex flex-col">Wow, that dime</div></div></section></div></div>'

test('#221: with comment rows sharing the anchor\'s classes, the strip is still stored anchored (whole path unique)', () => {
  const root = mount(kalshiCard().replace(/<\/div>$/, comments + '</div>'))
  assert.equal(root.querySelectorAll('div.min-w-0.w-full.flex').length, 3, 'premise: anchor classes not unique')
  const sel = generateExclusionSelector(strip(root), root)
  assert.equal(sel, ANCHORED)
  const r = refresh(kalshiCard({ combo: false }).replace(/<\/div>$/, comments + '</div>'), sel)
  assert.deepEqual(r.unresolved, [])
  assert.ok(!r.html.includes('Margin of Victory') && r.html.includes('Wow, that dime') && r.html.includes('skeletrocity'))
})

test('#221 negative: a copy of a repeated component (feed post preview) is never the anchor -- position chain as before', () => {
  // Real Reddit: only one post's preview had an 11th paragraph at capture; after a reload a second one did,
  // and `div.preview > p:nth-child(11)` matched both posts.
  const post = (n) => `<article class="post"><div class="md preview">${Array.from({ length: n }, (_, i) => `<p>post${n} para ${i + 1}</p>`).join('')}</div></article>`
  // the <aside> copy keeps p:nth-of-type(3) from being page-unique (an earlier rung)
  document.body.innerHTML = `<div class="feed">${post(1)}${post(3)}${post(2)}</div><aside>${post(4)}</aside>`
  const root = document.querySelector('div.feed')
  const el = root.querySelectorAll('article')[1].querySelectorAll('p')[2]
  const sel = generateExclusionSelector(el, root)
  assert.ok(!sel.startsWith('div.md.preview'), sel)
  assert.equal(sel, 'article:nth-child(2) > div:nth-child(1) > p:nth-child(3)')
})

test('#221 negative: an anchor unique in the card but repeated elsewhere on the page is not used (deal-tile swatches)', () => {
  // Real Amazon: one tile in the card had a swatch list at capture; at another width three did.
  const tile = (swatches) => `<div class="tile"><span class="t">deal</span>${swatches ? '<ul class="swatches has"><li><a>s1</a></li><li><a>s2</a></li></ul>' : ''}</div>`
  document.body.innerHTML = `<div class="grid">${tile(true)}${tile(false)}</div><aside>${tile(true)}</aside>`
  const root = document.querySelector('div.grid')
  const el = root.querySelectorAll('li')[1]
  const sel = generateExclusionSelector(el, root)
  assert.ok(!sel.startsWith('ul.swatches'), sel)
})

test('#221 negative: build-hash classes (renamed on a deploy) are never part of the path -- position chain as before', () => {
  // Real Guardian markup: every class is an emotion hash (dcr-...)
  const block = '<div class="dcr-mgshf5"><h3 class="card-headline dcr-10aa6d"><div class="dcr-1kw5ykz">Football</div><span>Headline</span></h3></div>'
  // the second copy outside the card keeps the earlier ancestor-path rung from resolving it (that rung is unchanged)
  const list = `<ul class="dcr-e76yd7"><li class="dcr-jq2eac">${block}</li><li class="dcr-jq2eac">${block}</li></ul>`
  document.body.innerHTML = `<div id="sport">${list}</div><div id="news">${list}</div>`
  const root = document.querySelector('#sport')
  const el = root.querySelectorAll('div.dcr-1kw5ykz')[1]
  assert.equal(generateExclusionSelector(el, root), 'ul:nth-child(1) > li:nth-child(2) > div:nth-child(1) > h3:nth-child(1) > div:nth-child(1)')
})

test('#221: a unique anchor is preferred over a nearer one that is only unique as a whole path', () => {
  // the nearer anchor (div.row) repeats but its path is unique; div.panel above it is unique on its own.
  // The <p> outside the card keeps span.t:nth-of-type(2) from being page-unique (an earlier rung).
  document.body.innerHTML = '<p><span class="t">x</span><span class="t">y</span></p><div class="card"><div class="panel"><div class="row"><span class="t">a</span><span class="t">b</span></div></div><div class="row"><span class="t">c</span></div></div>'
  const root = document.querySelector('div.card')
  const el = root.querySelectorAll('span')[1]
  assert.equal(generateExclusionSelector(el, root), 'div.panel > div.row:nth-child(1) > span.t:nth-child(2)')
})

test('#221 negative: an anchor that is only unique outside the card is never used -- position chain as before', () => {
  // two identical bare blocks, so no earlier rung can pin the second one; only div.page-shell is unique
  const block = '<div><div><span>a</span><span>b</span></div></div>'
  document.body.innerHTML = `<div class="page-shell"><div class="card">${block}${block}</div></div>`
  const root = document.querySelector('div.card')
  const el = root.querySelectorAll('span')[3]
  assert.equal(generateExclusionSelector(el, root), 'div:nth-child(2) > div:nth-child(1) > span:nth-child(2)')
})

test('#221 negative: an anchor shaped like the card root itself is skipped (refresh would read it as the card)', () => {
  document.body.innerHTML = '<div class="box"><div><div class="box"><span>a</span><span>b</span></div></div></div>'
  const root = document.querySelector('div.box')
  const el = root.querySelectorAll('span')[1]
  const sel = generateExclusionSelector(el, root)
  assert.ok(!sel.startsWith('div.box'), sel)
  const r = applyExclusionsWithStats(root.outerHTML, [sel], 'div.box')
  assert.deepEqual(r.unresolved, [])
  assert.ok(r.html.includes('>a<') && !r.html.includes('>b<'))
})

test('#221 negative: an element with its own unique class keeps its class selector (earlier rungs unchanged)', () => {
  const root = mount(kalshiCard())
  const el = root.querySelector('div.transition-all')
  assert.equal(generateExclusionSelector(el, root), 'div.transition-all.duration-300')
})
