// Ported from the old root-level test-content-loss-invariant.js — that file was never a real
// automated test (its own header said "paste into the dashboard console"; running it under
// node threw ReferenceError). This is the same case matrix, now actually executable via
// `npm test`, against the real exported isContentLost(). See dom-cleanup.ts's own doc comment
// for the guard's rationale (STRUCTURAL vs. absolute-emptiness vs. legitimate-shrink).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const { isContentLost } = await import('../.test-build/utils/dom-cleanup.js')

const CASES = [
  {
    name: 'Total erasure',
    cached: '<ul><li>Item one with real text</li><li>Item two with real text</li><li>Item three with real text</li></ul>',
    fresh: '<div></div>',
    expectLost: true,
  },
  {
    name: 'Empty shell (Suspense skeleton shape)',
    cached: '<ul><li>Item one with real text</li><li>Item two with real text</li><li>Item three with real text</li></ul>',
    fresh: '<div><div><div></div></div></div>',
    expectLost: true,
  },
  {
    name: 'Structural collapse (8 li -> 0 li, some text remains)',
    cached: '<ul>' + Array.from({ length: 8 }, (_, i) => `<li>Row ${i} with enough text to not be trivial</li>`).join('') + '</ul>',
    fresh: '<div>Some leftover text but no list items survived the refresh</div>',
    expectLost: true,
  },
  {
    name: 'Legitimate shrink (24-row table -> 1-row table, yr.no shape)',
    cached: '<table>' + Array.from({ length: 24 }, (_, i) => `<tr><td>Hour ${i}</td><td>${10 + i} deg C</td></tr>`).join('') + '</table>',
    fresh: '<table><tr><td>Hour 0</td><td>10 deg C</td></tr></table>',
    expectLost: false,
  },
  {
    name: 'Image-only loss (6 img + text -> same text, 0 img)',
    cached: '<div>' + Array.from({ length: 6 }, (_, i) => `<img src="pic${i}.jpg" alt="pic ${i}">`).join('') + '<p>Deal title with real descriptive text about the offer</p></div>',
    fresh: '<div><p>Deal title with real descriptive text about the offer</p></div>',
    expectLost: false,
  },
  {
    name: 'Tiny-but-valid (price tick, no structural nodes either side)',
    cached: '<div><span>GBP 412,000</span></div>',
    fresh: '<div><span>GBP 415,000</span></div>',
    expectLost: false,
  },
]

for (const { name, cached, fresh, expectLost } of CASES) {
  test(`isContentLost: ${name}`, () => {
    assert.equal(isContentLost(fresh, cached), expectLost)
  })
}
