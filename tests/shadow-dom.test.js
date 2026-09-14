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
