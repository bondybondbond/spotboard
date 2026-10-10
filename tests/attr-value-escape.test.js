// #182: a data-testid / data-* / role value holding `"` or `\` used to make generateSelector throw
// (capture refused) or, for `\x`, silently mean something else. Only those two characters are escaped,
// so every value that worked before must give the identical selector (the old template is the oracle).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const {
  __generateSelectorForTest,
  __generateCaptureSelectorForTest,
  selectorFindsElement,
} = await import('../.test-build/content.js')

beforeEach(() => { document.body.innerHTML = '' })

const BAD = ['say "hi" now', 'back\\slash', 'a\\"b', '"', '\\', 'ends with \\', 'x\\\\y']
// Values that worked with the old unescaped template (measured: valid inside a double-quoted string).
const WORKED = ['plain', 'news card, top (1) & more', 'a b', "it's", 'a-b_c.d', 'é-ü', '[x]', 'a:b/c', '#hash', '100%']

const make = (value, { twin = false, attr = 'data-testid' } = {}) => {
  const el = document.createElement('p')
  el.setAttribute(attr, value)
  el.textContent = 'x'
  document.body.append(el)
  if (twin) { const t = el.cloneNode(true); document.body.append(t) }
  return el
}
const parsedCopy = () => new DOMParser().parseFromString('<!doctype html>' + document.documentElement.outerHTML, 'text/html')

test('each bad value (direct attribute) yields a selector that finds the element, live and on a parsed copy', () => {
  for (const v of BAD) {
    document.body.replaceChildren()
    const el = make(v)
    const sel = __generateSelectorForTest(el)
    assert.equal(document.querySelectorAll(sel).length, 1, `${v}: "${sel}"`)
    assert.equal(document.querySelector(sel), el, v)
    assert.notEqual(__generateCaptureSelectorForTest(el), null, v)
    assert.equal(parsedCopy().querySelectorAll(sel).length, 1, `${v}: parsed copy`)
  }
})

test('the same holds for other tracked attributes (role, data-component)', () => {
  for (const attr of ['role', 'data-test', 'data-component', 'data-section', 'data-module', 'data-type', 'data-t', 'data-card-metrics-id']) {
    document.body.replaceChildren()
    const el = make('a "b" \\c', { attr })
    const sel = __generateSelectorForTest(el)
    assert.equal(document.querySelector(sel), el, attr)
  }
})

test('ancestor-path variant: a bad value on a wrapper still resolves to the right row', () => {
  for (const v of BAD) {
    document.body.innerHTML = ''
    const mk = (val) => {
      const w = document.createElement('div'); w.setAttribute('data-testid', val)
      const p = document.createElement('p'); p.className = 'row'; p.textContent = 'row'
      w.append(p); document.body.append(w); return p
    }
    const target = mk(v)
    mk(v + ' two')
    const sel = __generateSelectorForTest(target)
    assert.equal(document.querySelectorAll(sel).length, 1, `${v}: "${sel}" is not unique`)
    assert.equal(document.querySelector(sel), target, v)
    assert.equal(parsedCopy().querySelectorAll(sel).length, 1, `${v}: parsed copy`)
  }
})

test('negative: every value that worked before gives the identical selector (direct and ancestor path)', () => {
  for (const v of WORKED) {
    document.body.replaceChildren()
    const el = make(v)
    assert.equal(__generateSelectorForTest(el), `p[data-testid="${v}"]`, v)

    document.body.replaceChildren()
    const mk = (val) => {
      const w = document.createElement('div'); w.setAttribute('data-testid', val)
      const p = document.createElement('p'); p.className = 'row'; w.append(p); document.body.append(w); return p
    }
    const target = mk(v); mk(v + ' two')
    assert.equal(__generateSelectorForTest(target), `div[data-testid="${v}"] > p.row`, v)
    assert.ok(selectorFindsElement(`div[data-testid="${v}"] > p.row`, target), v)
  }
})
