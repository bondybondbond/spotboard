// #247: the heading fallback's reverse rule (fingerprint contains heading) must not accept generic UI text.
// CNN repro (17 Nov 2026): fingerprint "<headline>\n Show all" matched an unrelated "Show all" heading ("Show all" is
// exactly 8 chars, so it passed the >= 8 floor); only the drift guard (0.128) stopped it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
const { _headingMatchesFingerprint: match } = g

// The rule as it was before #247, for the "nothing else changes" comparison.
const before = (h, fp) => h.toLowerCase().includes(fp.toLowerCase()) || (h.length >= 8 && fp.toLowerCase().includes(h.toLowerCase()))

const CNN_FP = 'Democrats will win more than 250 House seats, CNN projects\n Show all'

test('#247 a bare generic heading no longer matches a fingerprint that ends in the same text', () => {
  assert.equal(before('Show all', CNN_FP), true, 'documents the old defect')
  for (const h of ['Show all', 'See all', 'View more', 'Read more', 'Load more', 'Show more', 'See more', 'View all', 'Show all\n  Show all'])
    assert.equal(match(h, CNN_FP + ' ' + h), false, h)
})

test('#247 the real heading still matches in both directions', () => {
  assert.equal(match(CNN_FP, CNN_FP), true)
  assert.equal(match('Democrats will win more than 250 House seats, CNN projects', CNN_FP), true, 'reverse rule, distinctive heading')
  assert.equal(match('Top offers', 'Top offersTop offers'), true, 'duplicated-text fingerprint (Amazon pattern)')
  assert.equal(match('Top offersTop offers extra', 'Top offers'), true, 'forward rule untouched')
})

test('#247 a distinctive heading that merely contains a generic word still matches; the word is matched whole', () => {
  assert.equal(match('More top stories', 'More top stories today'), true)
  assert.equal(match('Kenmore appliances', 'Kenmore appliances deals'), true)
  assert.equal(match('Furthermore trending', 'Furthermore trending now'), true)
})

test('#247 short distinctive headings that contain a generic word keep matching (only generic-only headings are refused)', () => {
  assert.equal(match('More Sport', 'More Sport latest'), true)
  assert.equal(match('Markets close', 'Markets close today'), true)
  assert.equal(match('See all deals', 'See all deals today'), true)
})

test('#247 each listed phrase is refused on its own', () => {
  for (const h of ['show all', 'see all', 'view all', 'show more', 'see more', 'view more', 'read more', 'load more'])
    assert.equal(match(h, 'Some headline text ' + h), false, h)
})

test('#247 the no-break space CNN really stores inside "Show all" is folded (real fingerprint)', () => {
  const fp = 'Democrats will win more than 250 House seats, CNN projects\n          Show\u00a0all'
  assert.equal(match('Show\u00a0all', fp), false)
  assert.equal(match('Show all', fp), false)
})

test('#247 a generic phrase plus only punctuation or a count is still generic', () => {
  for (const h of ['See all ›', 'View all (24)', 'Show all »', 'Read more …', 'See more →', 'more more more', 'Show all more'])
    assert.equal(match(h, 'Some headline text ' + h), false, h)
  assert.equal(match('See all deals ›', 'Some headline text See all deals ›'), true, 'a real word beside the phrase keeps it eligible')
})

// The call site is covered by tests/dead-selector-classification.test.js: with the real CNN page and the real stored
// fingerprint, the heading fallback finds nothing (old rule: it landed on the "Show all" block and reached the drift guard).

test('#247 the 8-character floor is unchanged', () => {
  assert.equal(match('Deals', 'Today Deals here'), false)
  assert.equal(match('Deal day', 'Today Deal day here'), true)
})

test('#247 census: the new rule differs from the old one only for generic-text headings', () => {
  const fps = [CNN_FP, 'Top offersTop offers', 'T20 WORLD CUP, 2026', 'Trump suggests AI doesn’t need any more guardrails\n          Show all', 'Hot deals']
  const heads = ['Show all', 'See more', 'Top offers', 'T20 WORLD CUP', 'Hot deals', 'Latest news', 'More top stories', 'Trump suggests AI doesn’t need any more guardrails']
  for (const fp of fps) for (const h of heads) {
    if (match(h, fp) !== before(h, fp)) assert.match(h, /^(show all|see more)$/i, `${h} vs ${fp}`)
  }
})
