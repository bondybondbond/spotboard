// #154: the "Capture a site" placeholder count (1 card -> 2, 2 -> 1, 3+ -> 0) must be re-derived
// when a card is deleted. dashboard.js is a UI script that can't be loaded whole, so: (1) run the
// real renderGhostCards against jsdom for the rule, (2) guard the delete handler's wiring from source
// (the bug was the handler never calling it; the full click path is covered by the real-Chrome run).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'

const src = fs.readFileSync(new URL('../public/dashboard.js', import.meta.url), 'utf8')

function sliceFunction(name) {
  const from = src.indexOf(`function ${name}(`)
  const to = src.indexOf('\nfunction ', from + 1)
  assert.ok(from > 0 && to > from, `${name} markers moved in dashboard.js`)
  return src.slice(from, to)
}

function ghostsFor(cardCount) {
  const dom = new JSDOM('<div class="components-grid"></div>')
  const { document } = dom.window
  const grid = document.querySelector('.components-grid')
  const sandbox = { document, window: { GA4: null }, showAddCardModal() {} }
  vm.runInContext(sliceFunction('renderGhostCards') + '\n;this.renderGhostCards = renderGhostCards', vm.createContext(sandbox))
  sandbox.renderGhostCards(grid, new Array(cardCount).fill({}))
  return grid.querySelectorAll('.ghost-card').length
}

test('placeholder rule: 1 card -> 2, 2 cards -> 1, 3+ -> none', () => {
  assert.deepEqual([1, 2, 3, 4, 10].map(ghostsFor), [2, 1, 0, 0, 0])
})

test('delete handler re-derives the placeholders after removing the card, and not for an empty board', () => {
  const handler = src.slice(src.indexOf("card.querySelector('.card-menu-delete')"))
  const removed = handler.indexOf('card.remove()')
  const rerender = handler.indexOf('renderGhostCards(grid, components)')
  const filtered = handler.indexOf('filterCardsToBoard(activeBoard)')
  assert.ok(removed > 0 && rerender > removed, 'renderGhostCards must run after card.remove()')
  assert.ok(filtered > rerender, 'filterCardsToBoard (hides them off the All tab) must run after the re-render')
  assert.match(handler.slice(removed, filtered), /querySelectorAll\('\.ghost-card'\)\.forEach\(g => g\.remove\(\)\)/)
  assert.match(handler.slice(removed, filtered), /if \(components\.length > 0\) renderGhostCards/)
})
