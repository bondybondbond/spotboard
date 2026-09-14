// Regression coverage for #67: a table-column exclusion selector
// (`<table-selector> tr > td:nth-child(N)`) stopped matching after yr.no pruned past-hour
// row-groups, shifting the remaining rows' tbody position. applyExclusions() is the
// refresh-time function that resolves these selectors against freshly-fetched markup.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'
import { el } from './helpers/fixtures.js'

installDomEnv()
const { applyExclusions } = await import('../.test-build/utils/dom-cleanup.js')

function buildCard(rows) {
  // A captured/refreshed fragment is a card element CONTAINING the table, not the bare table
  // — isTrustedTableColumn() resolves "table.hourly" as a querySelectorAll descendant of the
  // card root, so the table can't be the root itself (matches applyExclusions' real callers,
  // which always hand it a card element's outerHTML).
  const table = document.createElement('table')
  table.className = 'hourly'
  rows.forEach(cells => {
    const tr = document.createElement('tr')
    cells.forEach(text => tr.appendChild(el('td', text)))
    table.appendChild(tr)
  })
  const card = el('div', null, [table])
  card.className = 'card'
  document.body.appendChild(card)
  return card
}

test('#67: table-column selector still removes the column after row-group pruning shifts row count', () => {
  // "Before" shape had more rows; "after" (refreshed) shape has fewer — the selector is
  // column-indexed, not row-position-indexed, so it must still resolve.
  const card = buildCard([
    ['Hour 0', '10°C'],
    ['Hour 1', '11°C'],
    ['Hour 2', '12°C'],
  ])
  const selector = 'table.hourly tr > td:nth-child(2)'
  const out = applyExclusions(card.outerHTML, [selector], 'div.card')

  assert.match(out, /Hour 0/)
  assert.doesNotMatch(out, /10°C/)
  assert.match(out, /Hour 2/)
  assert.doesNotMatch(out, /12°C/)
})

test('table-column selector is rejected when the table gains a colspan on refresh (index would misalign)', () => {
  // Needs >1 row so td:nth-child(2) matches >1 element -- otherwise a single match is always
  // trusted regardless of colspan (dom-cleanup.ts's own always-trust-one-match rule) and this
  // test would pass without ever reaching isTrustedTableColumn's colspan check at all.
  const table = document.createElement('table')
  table.className = 'hourly'
  const tr1 = document.createElement('tr')
  tr1.appendChild(el('td', 'Hour 0'))
  const wide = el('td', 'Spans two')
  wide.setAttribute('colspan', '2')
  tr1.appendChild(wide)
  const tr2 = document.createElement('tr')
  tr2.appendChild(el('td', 'Hour 1'))
  tr2.appendChild(el('td', 'Normal cell'))
  table.appendChild(tr1)
  table.appendChild(tr2)
  const card = el('div', null, [table]); card.className = 'card'
  document.body.appendChild(card)

  const selector = 'table.hourly tr > td:nth-child(2)'
  const out = applyExclusions(card.outerHTML, [selector], 'div.card')
  // Colspan present -> isTrustedTableColumn correctly returns false (confirmed: 2 matches
  // logged, not the 1-match always-trust shortcut) -> falls to the generic multi-match
  // removal-budget check instead, which rejects this small table's 63% text removal as
  // over-broad -> the whole selector is safely skipped rather than risking a misaligned
  // removal. This is the fail-safe behavior the colspan guard exists to trigger.
  assert.match(out, /Spans two/)
  assert.match(out, /Normal cell/)
  assert.match(out, /Hour 0/)
  assert.match(out, /Hour 1/)
})

test('zero exclusions passed through unchanged', () => {
  const card = buildCard([['Hour 0', '10°C']])
  const out = applyExclusions(card.outerHTML, [], 'div.card')
  assert.match(out, /10°C/)
})
