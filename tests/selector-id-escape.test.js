// #126: CNBC's news river has id="Home Page International-riverPlus". An unescaped `#Home Page ...`
// selector is a descendant chain that matches nothing, so every refresh failed "layout changed".
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { __generateSelectorForTest } = await import('../.test-build/content.js')

beforeEach(() => { document.body.innerHTML = '' })

test('an id with spaces yields a selector that resolves to that element', () => {
  document.body.innerHTML = '<div id="Home Page International-riverPlus"><p>a</p></div><div id="other"></div>'
  const el = document.getElementById('Home Page International-riverPlus')
  const sel = __generateSelectorForTest(el)
  assert.equal(document.querySelectorAll(sel).length, 1)
  assert.equal(document.querySelector(sel), el)
})

test('an ordinary id is unchanged (#main-content)', () => {
  document.body.innerHTML = '<main id="main-content"><p>a</p></main>'
  assert.equal(__generateSelectorForTest(document.getElementById('main-content')), '#main-content')
})

test('an id-less element under a spaced-id ancestor gets a path that resolves', () => {
  document.body.innerHTML = '<div id="Home Page International-riverPlus"><section><p class="x">a</p></section></div><section><p class="x">b</p></section>'
  const el = document.getElementById('Home Page International-riverPlus').querySelector('p')
  const sel = __generateSelectorForTest(el)
  assert.equal(document.querySelectorAll(sel).length, 1)
  assert.equal(document.querySelector(sel), el)
})
