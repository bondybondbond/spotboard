// #179: class names are escaped with CSS.escape, so a leading digit (Tailwind `2xl:flex`), quotes, `|`,
// braces, `;` and a lone `-` no longer make generateSelector throw. For every class the old hand-kept
// chain handled, the output must be byte-identical (the chain is kept here as the oracle).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv, cssEscape } from './helpers/env.js'

installDomEnv()
const {
  __generateSelectorForTest,
  __generateCaptureSelectorForTest,
  __generateExclusionSelectorForTest,
  selectorFindsElement,
} = await import('../.test-build/content.js')

beforeEach(() => { document.body.innerHTML = '' })

const legacyChain = (c) => c
  .replace(/:/g, '\\:').replace(/\//g, '\\/').replace(/\[/g, '\\[').replace(/\]/g, '\\]')
  .replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/\./g, '\\.').replace(/#/g, '\\#')
  .replace(/!/g, '\\!').replace(/@/g, '\\@').replace(/\$/g, '\\$').replace(/%/g, '\\%')
  .replace(/\^/g, '\\^').replace(/&/g, '\\&').replace(/\*/g, '\\*').replace(/\+/g, '\\+')
  .replace(/=/g, '\\=').replace(/,/g, '\\,').replace(/</g, '\\<').replace(/>/g, '\\>')
  .replace(/\?/g, '\\?').replace(/~/g, '\\~')

// Every class the old chain turned into a working selector (measured in real Chrome, #179).
const VALID_BEFORE = [
  'xl:mt-0', 'w-3/12', 'btn-primary', 'col-md-6', '[&_svg]:size-4', 'hover:bg-red-500/50',
  'sm:w-[calc(100%-2px)]', 'tw-2xl:flex', 'h-1.5', '!p-2', '@container', 'group-hover/item:flex',
  '*:p-2', 'é-ü', '_a', '--x',
]
// Classes that made the old chain throw.
const THREW_BEFORE = ['2xl:flex', '3xl:grid-cols-4', '1/2', '2', '-2', '-', 'a|b', "content-['x']", 'content-["x"]', 'a{b}', 'a;b']

test('negative: the escape is byte-identical to the old chain for every class that worked before', () => {
  for (const c of VALID_BEFORE) assert.equal(cssEscape(c), legacyChain(c), c)
})

test('each class that used to throw now yields a selector that finds the element', () => {
  for (const c of THREW_BEFORE) {
    document.body.replaceChildren()
    const el = document.createElement('div')
    el.setAttribute('class', c)
    const twin = document.createElement('div')
    twin.setAttribute('class', c)
    document.body.append(el, twin)
    const sel = __generateSelectorForTest(el)
    assert.ok(selectorFindsElement(sel, el), `${c}: "${sel}" does not find the element`)
    assert.notEqual(__generateCaptureSelectorForTest(el), null, c)
  }
})

test('a digit-leading class among the first three still resolves on a parsed copy of the page (the refresh path)', () => {
  document.body.innerHTML = '<section><div class="card 2xl:flex shadow">a</div></section>'
  const el = document.querySelector('.card')
  const sel = __generateCaptureSelectorForTest(el)
  assert.notEqual(sel, null)
  const parsed = new DOMParser().parseFromString('<!doctype html>' + document.documentElement.outerHTML, 'text/html')
  assert.ok(parsed.querySelectorAll(sel).length >= 1, `"${sel}" does not resolve on the parsed copy`)
})

test('an exclusion selector for an element with a digit-leading class resolves inside the capture root', () => {
  document.body.innerHTML = '<section id="root"><p class="intro">x</p><div class="2xl:flex ad">ad</div></section>'
  const root = document.getElementById('root')
  const ad = root.querySelector('.ad')
  const sel = __generateExclusionSelectorForTest(ad, root)
  assert.ok(root.querySelectorAll(sel).length >= 1, `"${sel}" finds nothing in the root`)
  assert.ok([...root.querySelectorAll(sel)].includes(ad), `"${sel}" does not find the ad`)
})

test('refresh-time applyExclusions resolves a stored exclusion whose class starts with a digit (the stored-selector round trip)', async () => {
  const { applyExclusionsWithStats } = await import('../.test-build/utils/dom-cleanup.js')
  const html = '<p class="2xl:mt-0">First <a class="2xl:underline" href="/x">link text</a> rest</p>'
  const card = String.raw`p.\32 xl\:mt-0`
  const link = String.raw`a.\32 xl\:underline`
  const bare = applyExclusionsWithStats(html, [link], card)
  assert.ok(!bare.html.includes('link text'), 'excluded link text still present')
  assert.deepEqual(bare.unresolved, [])
  const scoped = applyExclusionsWithStats(html, [`${card} > ${link}`], card)
  assert.ok(!scoped.html.includes('link text'), 'card-scoped exclusion did not apply')
  assert.deepEqual(scoped.unresolved, [])
})
