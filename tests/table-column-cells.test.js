// Coverage for #62: getTableColumnCells() finds every row's cell in a table column, used to
// make table-cell exclusion group by column instead of by same-row/same-class matching. Real
// motivation (verified live on yr.no, 14 Sep 2026): utility-class-styled tables (e.g. a shared
// "align-right" class on Temp/Precip/Wind-speed cells) made the old sibling-matching group
// cells WITHIN a row instead of DOWN a column -- these tests pin the column-only behavior.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installDomEnv } from './helpers/env.js'
import { el } from './helpers/fixtures.js'

installDomEnv()
const { getTableColumnCells } = await import('../.test-build/content.js')

function buildTable(rows, tableClass = 'wx-table') {
  const table = document.createElement('table')
  table.className = tableClass
  rows.forEach(cells => {
    const tr = document.createElement('tr')
    cells.forEach(({ text, className }) => {
      const td = el('td', text)
      if (className) td.className = className
      tr.appendChild(td)
    })
    table.appendChild(tr)
  })
  const root = el('div', null, [table])
  document.body.appendChild(root)
  return { root, table }
}

test('returns every row\'s cell in the clicked column, not same-row/same-class cells', () => {
  // Mirrors yr.no's real structure: Temp/Precip/Wind-speed share one utility class within a
  // row -- the bug this fix targets is that used to make them look like "similar siblings".
  const { root, table } = buildTable([
    [{ text: '17°', className: 'align-right' }, { text: '0', className: 'align-right' }, { text: '4 m/s', className: 'align-right' }],
    [{ text: '17°', className: 'align-right' }, { text: '0', className: 'align-right' }, { text: '4 m/s', className: 'align-right' }],
  ])
  const windCell = table.rows[0].children[2]

  const cells = getTableColumnCells(windCell, root)

  assert.equal(cells.length, 2)
  assert.equal(cells[0].textContent, '4 m/s')
  assert.equal(cells[1].textContent, '4 m/s')
  // The same-row Temp/Precip cells (identical class, wrong grouping) must not be included.
  assert.ok(!cells.includes(table.rows[0].children[0]))
  assert.ok(!cells.includes(table.rows[0].children[1]))
})

test('resolves through nested wrapper spans to find the containing cell -- real click target, not the bare <td>', () => {
  // Real sites rarely render a bare <td>text</td>. yr.no (14 Sep 2026) wraps every cell's
  // value in 3+ levels of <span> for styling (<td><span class="cell-content"><span><span
  // class="text-4">value</span></span></span>), and a real mouse click almost always lands
  // on one of those inner spans, never the <td> itself. Passing the deepest span here must
  // still resolve to that cell's column -- this is the bug that made every real click fail
  // even though every synthetic test dispatched directly on the <td> and "passed".
  const table = document.createElement('table')
  table.className = 'wx-table'
  ;[['Hour 0', '4 m/s'], ['Hour 1', '5 m/s']].forEach(([time, wind]) => {
    const tr = document.createElement('tr')
    tr.appendChild(el('td', time))
    const outer = document.createElement('span')
    outer.className = 'cell-content'
    const middle = document.createElement('span')
    const inner = document.createElement('span')
    inner.className = 'text-4'
    inner.appendChild(document.createTextNode(wind))
    middle.appendChild(inner)
    outer.appendChild(middle)
    const td = document.createElement('td')
    td.appendChild(outer)
    tr.appendChild(td)
    table.appendChild(tr)
  })
  const root = el('div', null, [table])
  document.body.appendChild(root)

  const deepestSpan = table.rows[0].children[1].querySelector('.text-4')
  const cells = getTableColumnCells(deepestSpan, root)

  assert.equal(cells.length, 2)
  assert.equal(cells[0].textContent, '4 m/s')
  assert.equal(cells[1].textContent, '5 m/s')
  // Returned cells are the actual <td> elements, not the nested spans clicked into.
  assert.equal(cells[0].tagName, 'TD')
})

test('returns null when the table has a colspan anywhere (index alignment unsafe)', () => {
  const { root, table } = buildTable([
    [{ text: 'Hour 0' }, { text: '10°C' }],
    [{ text: 'Hour 1' }, { text: '11°C' }],
  ])
  table.rows[0].children[0].setAttribute('colspan', '2')

  assert.equal(getTableColumnCells(table.rows[1].children[1], root), null)
})

test('returns null when rows have differing cell counts', () => {
  const { root, table } = buildTable([
    [{ text: 'Hour 0' }, { text: '10°C' }],
    [{ text: 'Hour 1' }],
  ])

  assert.equal(getTableColumnCells(table.rows[0].children[1], root), null)
})

test('returns null when the table class matches more than one table in root', () => {
  const { root, table } = buildTable([[{ text: 'Hour 0' }, { text: '10°C' }]])
  const dupe = table.cloneNode(true)
  root.appendChild(dupe)

  assert.equal(getTableColumnCells(table.rows[0].children[1], root), null)
})

test('returns null for an element outside any table', () => {
  const root = el('div', null, [el('span', 'not a table cell')])
  document.body.appendChild(root)

  assert.equal(getTableColumnCells(root.querySelector('span'), root), null)
})

test('works when the capture root IS the table itself, not a wrapping container', () => {
  // A real user's most natural click target is the table itself, not some ancestor div --
  // querySelectorAll(tableBase) on root never matches root itself, so this used to silently
  // fail to find "the one table" and return null even though the table plainly qualifies.
  const table = document.createElement('table')
  table.className = 'wx-table'
  ;[['Hour 0', '10°C'], ['Hour 1', '11°C']].forEach(([time, temp]) => {
    const tr = document.createElement('tr')
    tr.appendChild(el('td', time))
    tr.appendChild(el('td', temp))
    table.appendChild(tr)
  })
  document.body.appendChild(table)

  const cells = getTableColumnCells(table.rows[0].children[1], table)

  assert.equal(cells.length, 2)
  assert.equal(cells[0].textContent, '10°C')
  assert.equal(cells[1].textContent, '11°C')
})

test('includes the column header (<th>) alongside its <td> data cells', () => {
  // A header sits alone in its own row (one <th> per column), so tag-matched grouping could
  // never bulk-select it: the header is still part of "the column" for selection purposes,
  // even though the persisted/refresh selector (#67, buildTableColumnSelector) still scopes
  // each excluded element to its own tag when generating what actually gets stored.
  const table = document.createElement('table')
  table.className = 'wx-table'
  const headerRow = document.createElement('tr')
  headerRow.appendChild(el('th', 'Time'))
  headerRow.appendChild(el('th', 'Wind speed m/s'))
  table.appendChild(headerRow)
  ;[['Hour 0', '4 m/s'], ['Hour 1', '5 m/s']].forEach(([time, wind]) => {
    const tr = document.createElement('tr')
    tr.appendChild(el('td', time))
    tr.appendChild(el('td', wind))
    table.appendChild(tr)
  })
  const root = el('div', null, [table])
  document.body.appendChild(root)

  const fromHeader = getTableColumnCells(headerRow.children[1], root)
  assert.equal(fromHeader.length, 3)
  assert.equal(fromHeader[0].textContent, 'Wind speed m/s')
  assert.equal(fromHeader[1].textContent, '4 m/s')
  assert.equal(fromHeader[2].textContent, '5 m/s')

  const fromDataCell = getTableColumnCells(table.rows[1].children[1], root)
  assert.equal(fromDataCell.length, 3)
  assert.equal(fromDataCell[0].textContent, 'Wind speed m/s')
})
