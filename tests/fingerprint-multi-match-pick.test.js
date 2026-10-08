// #181: when a card's selector matches several elements in the direct-fetch HTML, the heading-fingerprint
// tiebreaker must not hand the card to an earlier section that merely MENTIONS the fingerprint. Cricbuzz:
// `div.my-2 > div` matches 18 elements; a scoreline carousel (earlier in the DOM) has a "1st Test • Australia
// tour of South Africa, 2026" line, the real news column (later, larger) starts with that heading. The old
// first-wins pass 2 picked the carousel and the refresh was stored as success.
// Pass 2 now matches the three tab tiers: collect every containing candidate, take the largest.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
const realRefresh = g.refreshComponent
const realTabRefresh = g.tabBasedRefresh
beforeEach(() => { g.refreshComponent = realRefresh; g.tabBasedRefresh = realTabRefresh })

const TOUR = 'AUSTRALIA TOUR OF SOUTH AFRICA, 2026'
const words = (prefix, n) => Array.from({ length: n }, (_, i) => `<p>${prefix} headline number ${i} with enough words to count as real article text.</p>`).join('')
const carousel = `<div class="carousal"><p>2nd T20I • West Indies tour of India, 2026</p><p>1st Test • Australia tour of South Africa, 2026</p>${words('Score', 6)}</div>`
const chip = name => `<div class="chip">${name}</div>`
const news = (heading = TOUR, n = 40) => `<div class="news"><span class="lbl">${heading}</span>${words('Story', n)}</div>`
const page = (...blocks) => `<html><body><div class="my-2">${blocks.join('')}</div></body></html>`
const cricbuzz = (n) => page(carousel, chip('India'), chip('West Indies'), news(TOUR, n))
const parse = html => new DOMParser().parseFromString(html, 'text/html')
const sel = 'div.my-2 > div'
const pick = (html, fp) => g._pickByHeadingFingerprint(parse(html).querySelectorAll(sel), fp)

// The pre-#181 picker, kept here as the reference for "existing cards keep selecting the same content".
function legacyPick(matches, fingerprint) {
  const norm = s => s.trim().replace(/\s+/g, ' ').toLowerCase()
  const fp = norm(fingerprint)
  for (const c of matches) for (const h of c.querySelectorAll('h1,h2,h3,h4,caption,[class*="heading"],[class*="title"],[class*="header"]')) if (norm(h.textContent || '') === fp) return c
  for (const c of matches) if (norm(c.textContent || '').includes(fp)) return c
  return null
}

test('#181: the news column wins over the scoreline carousel that mentions the tour', () => {
  const el = pick(cricbuzz(40), TOUR)
  assert.equal(el.className, 'news')
  assert.equal(legacyPick(parse(cricbuzz(40)).querySelectorAll(sel), TOUR).className, 'carousal', 'sanity: the old picker took the carousel')
})

test('#181: refreshComponent end to end (direct fetch) keeps the news column, not the scorelines', async () => {
  const html = cricbuzz(40)
  global.fetch = async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => html })
  g.tabBasedRefresh = async () => { throw new Error('direct fetch must be enough for this card') }
  const saved = news(TOUR, 38)
  const r = await g.refreshComponent({ id: 'c181', name: TOUR, url: 'https://example.com/', selector: sel, headingFingerprint: TOUR,
    positionBased: false, html_cache: saved, rawCaptureLength: saved.length, excludedSelectors: [], exclusionSignatures: [], exclusionPatterns: [] })
  assert.equal(r.success, true, r.error)
  assert.match(r.html_cache, /Story headline number 39/)
  assert.doesNotMatch(r.html_cache, /West Indies tour of India/)
})

test('#181: headlines changing between refreshes does not change the pick (the section heading is the identity)', () => {
  const a = pick(page(carousel, news(TOUR, 40)), TOUR)
  const b = pick(page(carousel, news(TOUR, 55).replaceAll('Story headline', 'Different headline')), TOUR)
  assert.equal(a.className, 'news')
  assert.equal(b.className, 'news')
})

test('existing behaviour kept: a heading-element match (pass 1) still wins even when a larger candidate also mentions the fingerprint', () => {
  const small = `<div class="small"><h3>${TOUR}</h3><p>short</p></div>`
  const big = `<div class="big"><p>${TOUR} appears in passing here</p>${words('Filler', 60)}</div>`
  const html = page(big, small)
  const m = parse(html).querySelectorAll(sel)
  assert.equal(g._pickByHeadingFingerprint(m, TOUR).className, 'small')
  assert.equal(g._pickByHeadingFingerprint(m, TOUR), legacyPick(m, TOUR))
})

// Parity: wherever the old picker had no ambiguity to resolve (pass 1 hit, exactly one containing candidate,
// or none), the new picker returns the very same element -- so cards that already worked keep their content.
const parityCases = {
  'single containing candidate, not first': [page(chip('x'), `<div class="plain">${words('Score', 6)}</div>`, news()), TOUR],
  'single containing candidate, first': [page(news(), chip('x'), chip('y')), TOUR],
  'no candidate contains the fingerprint': [page(carousel, chip('x')), TOUR],
  'case and whitespace variants of the fingerprint': [page(chip('x'), news('australia   tour of south africa, 2026')), '  Australia Tour   of South Africa, 2026 '],
  'pass 1 hit in the second candidate': [page(`<div class="a"><p>nothing</p></div>`, `<div class="b"><h2>Top stories</h2><p>x</p></div>`), 'Top stories'],
  'non-heading fingerprint present in one card only': [page(`<div class="a"><p>Sponsored Links</p></div>`, `<div class="b"><p>other</p></div>`), 'Sponsored Links'],
}
for (const [name, [html, fp]] of Object.entries(parityCases)) {
  test(`parity with the old picker: ${name}`, () => {
    const m = parse(html).querySelectorAll(sel)
    assert.equal(g._pickByHeadingFingerprint(m, fp), legacyPick(m, fp))
  })
}

test('several containing candidates: the largest wins (the intended change; same as the tab tiers)', () => {
  const html = page(`<div class="s"><p>${TOUR}</p></div>`, `<div class="m"><p>${TOUR}</p>${words('M', 5)}</div>`, `<div class="l"><p>${TOUR}</p>${words('L', 30)}</div>`)
  assert.equal(pick(html, TOUR).className, 'l')
})

test('equal-size ties keep the earlier candidate (stable, matches the tab tiers)', () => {
  const html = page(`<div class="first"><p>${TOUR}</p></div>`, `<div class="secnd"><p>${TOUR}</p></div>`)
  assert.equal(pick(html, TOUR).className, 'first')
})

test('last good copy stays safe: a blocked fetch with a failed tab refresh fails closed and applyRefreshResult keeps the card', async () => {
  global.fetch = async () => ({ ok: false, status: 403, statusText: 'Forbidden', text: async () => '' })
  g.tabBasedRefresh = async () => null
  const saved = news(TOUR, 38)
  const comp = { id: 'c181b', name: TOUR, url: 'https://example.com/', selector: sel, headingFingerprint: TOUR, positionBased: false,
    html_cache: saved, rawCaptureLength: saved.length, last_refresh: '2026-10-08T21:39:36.445Z', excludedSelectors: [], exclusionSignatures: [], exclusionPatterns: [] }
  const r = await g.refreshComponent(comp)
  assert.equal(r.success, false)
  const { localEntry, syncEntry } = g.applyRefreshResult(comp, r)
  assert.equal(localEntry.html_cache, saved)
  assert.equal(localEntry.last_refresh, '2026-10-08T21:39:36.445Z')
  assert.equal(syncEntry.lastOutcome, 'failed')
})

// The three tab-tier copies of pass 2 run inside executeScript, so they cannot call _pickByHeadingFingerprint.
// This is the drift that caused #181 (tier 1 first-wins vs tiers 2/3 largest-wins): fail if any copy changes shape.
test('all three tab-tier copies of pass 2 still use the collect-all, take-largest rule', async () => {
  const fs = await import('node:fs')
  const src = fs.readFileSync(new URL('../public/utils/refresh-engine.js', import.meta.url), 'utf8')
  const largest = /_p2\.reduce\(\(a, b\) => a\.outerHTML\.length >= b\.outerHTML\.length \? a : b\)/g
  assert.equal((src.match(largest) || []).length, 3)
  assert.equal((src.match(/Keep in step with _pickByHeadingFingerprint \(#181\)/g) || []).length, 3)
})
