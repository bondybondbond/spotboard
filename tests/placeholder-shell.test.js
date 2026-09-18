// #75: DailyFaceoff's sidebar feed SSRs plain grey filler divs (no "skeleton" class, no heading,
// no animation) that the older skeleton heuristics miss. looksLikePlaceholderShell() must catch
// that shape without flagging real or text-only content.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { looksLikePlaceholderShell } = await import('../.test-build/utils/dom-cleanup.js')

// Static fixture strings only (jsdom), never untrusted input
const parse = html => {
  const div = document.createElement('div')
  div.innerHTML = html
  return div
}

const DFO_PLACEHOLDER = `<div class="static top-0 mb-10 w-full lg:sticky">` +
  Array.from({ length: 3 }, () =>
    `<div class="flex h-32 flex-col justify-between"><div class="flex flex-col gap-1">` +
    `<div class="h-4 w-full rounded-lg bg-gray-200"></div>` +
    `<div class="h-4 w-3/4 rounded-lg bg-gray-200"></div></div>` +
    `<div class="h-4 w-1/2 rounded-lg bg-gray-200"></div></div>`).join('') +
  `</div>`

test('DFO grey-filler placeholder is a shell', () => {
  assert.equal(looksLikePlaceholderShell(parse(DFO_PLACEHOLDER)), true)
})

test('real link list is not a shell', () => {
  const html = '<ul>' + Array.from({ length: 5 }, (_, i) =>
    `<li><a href="/n/${i}">Headline number ${i} with real text</a></li>`).join('') + '</ul>'
  assert.equal(looksLikePlaceholderShell(parse(html)), false)
})

test('text-only card with no grey fillers is not a shell', () => {
  assert.equal(looksLikePlaceholderShell(parse('<div><p>54%</p></div>')), false)
})

test('grey decorative divs alongside real text/links are not a shell', () => {
  const html = `<div><div class="bg-gray-200"></div><div class="bg-gray-200"></div>` +
    `<div class="bg-gray-200"></div><a href="/x">Real headline that is long enough to count</a></div>`
  assert.equal(looksLikePlaceholderShell(parse(html)), false)
})

test('fewer than 3 grey fillers is not a shell', () => {
  assert.equal(looksLikePlaceholderShell(parse('<div><div class="bg-gray-200"></div><div class="bg-gray-100"></div></div>')), false)
})
