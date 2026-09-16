// #40 ask #3 spike + fixture: does jsdom's Shadow DOM support (attachShadow + innerHTML
// read-back) behave well enough to test cloneWithShadow() / sanitizeHTML()'s exclusion marker
// across an open shadow boundary? Per the approved plan: if fidelity is bad, this test file is
// the structural-only fallback ("marker reaches into an open shadow root"), not full behavioral
// coverage — a real-Chrome Shadow DOM smoke check is out of scope for #40 (owner's call).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'
import { el } from './helpers/fixtures.js'

installDomEnv()
const { sanitizeHTML } = await import('../.test-build/content.js')

test('spike: jsdom attachShadow + innerHTML read-back works on a plain open shadow root', () => {
  const host = document.createElement('div')
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.appendChild(el('p', 'ShadowText'))
  document.body.appendChild(host)

  assert.ok(host.shadowRoot, 'jsdom exposes shadowRoot on an open-mode host')
  assert.match(host.shadowRoot.innerHTML, /ShadowText/, 'innerHTML read-back reflects shadow content')
})

test('open-shadow-DOM exclusion: marker set before clone reaches into an open shadow root', () => {
  // Mirrors sanitizeHTML's real ordering requirement (comment at content.ts's exclusion-marker
  // block): the marker attribute MUST be set on the live node before cloneWithShadow() reads
  // the shadow root as an HTML string, or the marker is lost.
  const host = document.createElement('div')
  const shadow = host.attachShadow({ mode: 'open' })
  const shadowPara = el('p', 'ShadowText')
  shadow.appendChild(shadowPara)

  const root = el('div', null, [host, el('p', 'LightDomSibling')])
  document.body.appendChild(root)

  const out = sanitizeHTML(root, [shadowPara])
  assert.doesNotMatch(out, /ShadowText/, 'excluded shadow-DOM element removed')
  assert.match(out, /LightDomSibling/, 'unrelated light-DOM sibling survives')
})

// #80: Reddit's shreddit-post ships two custom elements inside its shadow root that are
// invisible-by-JS-behavior (0x0 while closed, or sr-only-by-convention) rather than
// invisible-by-simple-CSS-property, so no visibility check catches them pre-clone. The fix
// is cleanupDuplicates()'s duplicateSelectors list (dom-cleanup.ts), which sanitizeHTML runs
// internally on the clone after cloneWithShadow() flattens the shadow root into light DOM.
test('#80: faceplate-menu (closed 3-dot dropdown) inside a shadow root is stripped', () => {
  const host = document.createElement('div')
  const shadow = host.attachShadow({ mode: 'open' })
  const menu = document.createElement('faceplate-menu')
  menu.append(el('li', 'Follow'), el('li', 'Award this post'), el('li', 'Save'), el('li', 'Hide'), el('li', 'Report'))
  shadow.appendChild(menu)
  shadow.appendChild(el('p', 'VisiblePostBody'))

  const root = el('div', null, [host])
  document.body.appendChild(root)

  const out = sanitizeHTML(root, [])
  assert.doesNotMatch(out, /Award this post/, 'closed dropdown menu text removed')
  assert.doesNotMatch(out, /Report/, 'closed dropdown menu text removed')
  assert.match(out, /VisiblePostBody/, 'unrelated shadow-DOM sibling content survives')
})

test('#80: faceplate-screen-reader-content (duplicate headline) inside a shadow root is stripped', () => {
  const host = document.createElement('div')
  const shadow = host.attachShadow({ mode: 'open' })
  const srDup = document.createElement('faceplate-screen-reader-content')
  srDup.textContent = 'Where did sonar 2 go?'
  shadow.appendChild(srDup)
  shadow.appendChild(el('a', 'Where did sonar 2 go?'))

  const root = el('div', null, [host])
  document.body.appendChild(root)

  const out = sanitizeHTML(root, [])
  const matches = out.match(/Where did sonar 2 go\?/g) || []
  assert.equal(matches.length, 1, 'headline appears exactly once, sr-only duplicate removed')
})
