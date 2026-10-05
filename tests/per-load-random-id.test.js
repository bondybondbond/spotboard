// #160: Amazon tiles use id="CardInstance<22 random chars>", new on every page load
// (their widget wrappers also carry per-load classes like pd_rd_w-H2Gay). A saved selector holding
// one can never match after a reload, so the card never refreshes.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { __generateSelectorForTest, __isPerLoadIdForTest } = await import('../.test-build/content.js')

beforeEach(() => { document.body.innerHTML = '' })

const AMAZON = readFileSync(new URL('./fixtures/amazon-widgets.html', import.meta.url), 'utf8')
const PER_LOAD_TOKEN = /CardInstance|pd_rd_|pf_rd_|content-id-/

// Re-mint every per-load token the way a reload does, keeping the markup identical.
function reloaded(html) {
  const rand = (n) => Array.from({ length: n }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 54)]).join('')
  return html
    .replace(/CardInstance[A-Za-z0-9_-]{22}/g, () => 'CardInstance' + rand(22))
    .replace(/pd_rd_w-\w{5}/g, () => 'pd_rd_w-' + rand(5))
    .replace(/pf_rd_r-\w{20}/g, () => 'pf_rd_r-' + rand(20))
}

test('real Amazon tiles: selector holds no per-load token and still finds the same tile after a reload', () => {
  document.body.innerHTML = AMAZON
  const tiles = [...document.querySelectorAll('.a-cardui')]
  assert.ok(tiles.length >= 4)
  const saved = tiles.map(t => ({ sel: __generateSelectorForTest(t), slot: t.getAttribute('data-card-metrics-id') }))
  for (const { sel } of saved) assert.ok(!PER_LOAD_TOKEN.test(sel), `selector holds a per-load token: ${sel}`)

  document.body.innerHTML = reloaded(AMAZON)
  for (const { sel, slot } of saved) {
    const found = document.querySelectorAll(sel)
    assert.equal(found.length, 1, `${sel} should match exactly one tile after reload`)
    assert.equal(found[0].getAttribute('data-card-metrics-id'), slot)
  }
})

test('real Amazon tiles: every CardInstance id is flagged per-load; the neighbouring stable ids are not', () => {
  document.body.innerHTML = AMAZON
  const tiles = [...document.querySelectorAll('[id^=CardInstance]')]
  assert.ok(tiles.length >= 4)
  for (const t of tiles) assert.equal(__isPerLoadIdForTest(t), true, t.id)
  assert.equal(__isPerLoadIdForTest(document.getElementById('gwm-row')), false)
})

test('a per-load id is not saved as the selector, and the fallback resolves to that element', () => {
  const ids = ['CardInstancemDpWRz7WO0TBIyzbwVkZIg', 'CardInstance3oSGOPJbdAZ_4qGPyHLbig', 'CardInstanceqGdFxLRTJvjRu1jdwc98CA', 'CardInstance6oYeHmG2bYq9rqsGsZgArA']
  document.body.innerHTML = '<main>' + ids.map((id, i) => `<div class="row" id="wd-shoppable-${i + 1}"><div class="tile" id="${id}"><h2>Shop ${i}</h2></div></div>`).join('') + '</main>'
  const el = document.getElementById(ids[1])
  const sel = __generateSelectorForTest(el)
  assert.ok(!sel.includes('CardInstance'), `got ${sel}`)
  assert.equal(document.querySelector(sel), el)
})

test('an id-less element under a per-load-id ancestor is not anchored on that id', () => {
  const ids = ['CardInstancemDpWRz7WO0TBIyzbwVkZIg', 'CardInstance3oSGOPJbdAZ_4qGPyHLbig', 'CardInstanceqGdFxLRTJvjRu1jdwc98CA']
  document.body.innerHTML = '<main>' + ids.map(id => `<div id="${id}"><span class="x">a</span></div>`).join('') + '</main>'
  const el = document.querySelector('span.x')
  const sel = __generateSelectorForTest(el)
  assert.ok(!sel.includes('CardInstance'), `got ${sel}`)
  assert.equal(document.querySelector(sel), el)
})

test('negative: ordinary ids stay as the selector', () => {
  document.body.innerHTML = '<section id="nations-news-uk"></section><div id="contentWrap"></div><main id="main-content"></main>'
  for (const id of ['nations-news-uk', 'contentWrap', 'main-content']) {
    assert.equal(__generateSelectorForTest(document.getElementById(id)), `#${id}`)
  }
})

test('negative: long camelCase and spaced human ids stay trusted', () => {
  document.body.innerHTML = '<div id="globalNavigationHeaderContainer"></div><div id="Home Page International-riverPlus"></div><div id="isOnTopOfAllTheMenuItems"></div>'
  assert.equal(__generateSelectorForTest(document.getElementById('globalNavigationHeaderContainer')), '#globalNavigationHeaderContainer')
  assert.equal(__generateSelectorForTest(document.getElementById('isOnTopOfAllTheMenuItems')), '#isOnTopOfAllTheMenuItems')
  const spaced = document.getElementById('Home Page International-riverPlus')
  assert.equal(document.querySelector(__generateSelectorForTest(spaced)), spaced)
})

test('negative: families of counter / database ids stay trusted (short or digit-only tails)', () => {
  document.body.innerHTML = ['1001', '1002', '1003', '1004'].map(n => `<article id="product-card-${n}"></article>`).join('')
    + ['48211', '90177', '31559', '20674'].map(n => `<article id="storyid-slot-${n}-x"></article>`).join('')
  assert.equal(__generateSelectorForTest(document.getElementById('product-card-1002')), '#product-card-1002')
  assert.equal(__isPerLoadIdForTest(document.getElementById('storyid-slot-48211-x')), false)
})

test('negative: long ids whose tail is digits-only or all lower-case words stay trusted (rule is exercised, not skipped by the length gate)', () => {
  document.body.innerHTML = ['482109374', '901773482', '315592048', '206748190'].map(n => `<div id="article-body-${n}"></div>`).join('')
    + ['introduction', 'conclusionss', 'sidebarwidget', 'footerlinksss'].map(w => `<div id="page-section-${w}"></div>`).join('')
  assert.equal(__isPerLoadIdForTest(document.getElementById('article-body-901773482')), false)
  assert.equal(__isPerLoadIdForTest(document.getElementById('page-section-conclusionss')), false)
  assert.equal(__generateSelectorForTest(document.getElementById('article-body-315592048')), '#article-body-315592048')
})

test('negative: same-length counter ids with a shared long stem are not mistaken for random (CNBC-style)', () => {
  document.body.innerHTML = ['0', '1', '2', '3'].map(n => `<li id="HomePageInternational-latestNews-7-${n}"></li>`).join('')
    + '<section id="HomePageInternational-MarketsBanner-1"></section><section id="HomePageInternational-Newsletter--3x"></section>'
  for (const id of ['HomePageInternational-latestNews-7-2', 'HomePageInternational-MarketsBanner-1']) {
    assert.equal(__generateSelectorForTest(document.getElementById(id)), '#' + id)
  }
})

test('negative: stable id ancestors still anchor paths (NPR-style story ids)', () => {
  document.body.innerHTML = '<div id="res1210580321"><div class="audio-module"><div class="audio-module-tools"></div></div></div><div id="res1231503763"><div class="audio-module"><div class="audio-module-tools"></div></div></div>'
  const el = document.querySelector('#res1231503763 .audio-module-tools')
  const sel = __generateSelectorForTest(el)
  assert.ok(sel.startsWith('#res1231503763'), sel)
  assert.equal(document.querySelector(sel), el)
})

test('negative: word-class siblings keep their classes in the selector', () => {
  document.body.innerHTML = '<button class="btn-primary col-md-6 text-center"></button><button class="btn-success col-md-4 text-right"></button><button class="btn-warning col-md-3 text-left"></button><button class="btn-danger col-md-2 text-xs"></button>'
  assert.equal(__generateSelectorForTest(document.querySelector('button')), 'button.btn-primary.col-md-6.text-center')
})

test('negative: fewer than 3 same-shaped ids is not enough evidence', () => {
  document.body.innerHTML = '<div id="CardInstancemDpWRz7WO0TBIyzbwVkZIg"></div><div id="CardInstance3oSGOPJbdAZ_4qGPyHLbig"></div>'
  assert.equal(__isPerLoadIdForTest(document.querySelector('div')), false)
})
