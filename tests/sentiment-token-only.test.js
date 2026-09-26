// #113: +/- colouring must wrap only the signed token, on every refresh tier. The tab-based
// tiers (background / offscreen / active-tab) used to carry three inline copies of the old
// logic that tagged the whole parent <p>/<span>; they now run the shared tagSentimentData
// extension-side via _tagSentimentHtml.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()

// Polymarket comment markup: prose inside <p>/<span> wrappers (real wording, placeholder classes)
const html = '<div><p class="c">…generic ballot RCP polling average for the 2026 midterms is currently Dems +8.7.</p>' +
  '<span class="c">Average Monthly Manufacturing Jobs: -300 jobs a month (woah… guess we\'re losing)</span></div>'

const tagged = (out) => {
  const box = document.createElement('div')
  box.innerHTML = out
  return [...box.querySelectorAll('[data-sb-sentiment]')].map(el => [el.tagName, el.textContent, el.getAttribute('data-sb-sentiment')])
}

test('#113: only the signed token is tagged, not the surrounding paragraph/span', () => {
  assert.deepEqual(tagged(g._tagSentimentHtml(html)), [['SPAN', '+8.7', 'positive'], ['SPAN', '-300', 'negative']])
})

test('#113: re-tagging already-tagged HTML (e.g. old ancestor-tagged card) stays token-only', () => {
  const old = html.replace('<p class="c">', '<p class="c" data-sb-sentiment="positive">')
  assert.deepEqual(tagged(g._tagSentimentHtml(old)), [['SPAN', '+8.7', 'positive'], ['SPAN', '-300', 'negative']])
})

test('#113: source guard — no inline ancestor-tagging copies left in refresh-engine.js', () => {
  const src = fs.readFileSync(new URL('../public/utils/refresh-engine.js', import.meta.url), 'utf8')
  assert.equal(/setAttribute\('data-sb-sentiment'/.test(src), false)
})
