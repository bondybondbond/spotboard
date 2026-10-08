// #171: a captured region rooted at a table section (<tbody>, <tr>, <td>, ...) must survive the refresh
// route's sentiment-tagging step. That step used to parse the region through a <div>, whose HTML parser
// drops every table tag -- the cells' contents became top-level nodes, which markPatternExclusions ignores,
// so stored "exclude all like this" rules matched nothing (Yahoo Fantasy: fail-closed, never refreshes) or
// only the few nested ones (Wikipedia: refresh reported SUCCESS with 239 of 240 excluded icons back).
// The tests drive the real refreshComponent() end to end and compare matcher results, not HTML strings.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
const realRefresh = g.refreshComponent
const realTabRefresh = g.tabBasedRefresh
beforeEach(() => { g.refreshComponent = realRefresh; g.tabBasedRefresh = realTabRefresh })

const ICON = 'F-icon Block F-positive'
const row = i => `<tr><td class="c1"><span class="${ICON}" title="Added"></span></td><td class="c2"><a href="/p/${i}">Player number ${i}</a> some team text ${i} - W</td></tr>`
const rows = n => Array.from({ length: n }, (_, i) => row(i + 1)).join('')
const pageWith = tbody => `<html><body><table class="t">${tbody}</table></body></html>`
const rule = n => ({ a: 'SPAN', c: ICON, p: [], t: 'SPAN', n })
const iconsLeft = html => (html.match(/class="F-icon Block F-positive"/g) || []).length

function card(extra = {}) {
  const saved = `<tbody>${rows(25)}</tbody>`
  return { id: 'c171', name: 'Free Agent', url: 'https://example.com/transactions', selector: 'tbody', positionBased: true,
    html_cache: saved, excludedSelectors: [], exclusionSignatures: [], exclusionPatterns: [rule(25)], ...extra }
}
function serve(page) {
  global.fetch = async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => page })
  g.tabBasedRefresh = async () => { throw new Error('direct fetch must be enough for this card') }
}

test('#171: tbody-rooted card with stored rules refreshes on direct fetch and the excluded icons are gone', async () => {
  serve(pageWith(`<tbody>${rows(25)}</tbody>`))
  const r = await g.refreshComponent(card())
  assert.equal(r.success, true, r.error)
  assert.equal(iconsLeft(r.html_cache), 0, 'every excluded icon must be gone')
  assert.deepEqual((r.html_cache.match(/Player number \d+/g) || []), Array.from({ length: 25 }, (_, i) => `Player number ${i + 1}`), 'content and row order kept')
})

test('#171: no silent partial leak -- a success must not leave excluded icons behind', async () => {
  // Live page has 40 icons vs 25 at capture: within the 3x bound, so the refresh may succeed -- but then ALL must go.
  serve(pageWith(`<tbody>${rows(40)}</tbody>`))
  const r = await g.refreshComponent(card())
  assert.equal(r.success, true, r.error)
  assert.equal(iconsLeft(r.html_cache), 0)
})

test('#171: negative -- a genuinely broadened rule still fails closed and keeps the last good copy', async () => {
  serve(pageWith(`<tbody>${rows(40)}</tbody>`))
  const r = await g.refreshComponent(card({ exclusionPatterns: [rule(5)] })) // 40 > 3 x 5
  assert.equal(r.success, false)
  assert.equal(r.patternFault, true)
  assert.equal(r.keepOriginal, true)
  // refreshComponent only reports the generic message, and a flattened table would also "match nothing", so prove the
  // 3x branch itself fires on the table-rooted markup the refresh now hands to the guard
  const guard = g.markPatternExclusions(g._tagSentimentHtml(`<tbody>${rows(40)}</tbody>`), [rule(5)])
  assert.equal(guard.faults.length, 1)
  assert.match(guard.faults[0], /matched 40 elements \(was 5 at capture\)/)
})

test('#171: negative -- a rule that really matches nothing on the page still fails closed', async () => {
  serve(pageWith(`<tbody>${rows(25).replaceAll(ICON, 'other-class')}</tbody>`))
  const r = await g.refreshComponent(card())
  assert.equal(r.success, false)
  assert.equal(r.patternFault, true)
})

test('#171: the tab-tier tagging step keeps table-section roots intact (rules still resolve on its output)', () => {
  for (const [label, html] of [
    ['tbody', `<tbody>${rows(3)}</tbody>`],
    ['thead', '<thead><tr><th>h</th><th>j</th></tr></thead>'],
    ['tr', row(1)],
    ['td', `<td class="c1"><span class="${ICON}"></span>a</td>`],
    ['tfoot', '<tfoot><tr><td>f</td></tr></tfoot>'],
    ['th', '<th class="h">h</th>'],
    ['caption', '<caption>c</caption>'],
    ['colgroup', '<colgroup><col><col></colgroup>'],
    ['col', '<col>'],
    ['leading whitespace', `\n  <tbody>${rows(3)}</tbody>`],
    ['nested table', '<tbody><tr><td><table><tbody><tr><td>n</td></tr></tbody></table></td></tr></tbody>'],
  ]) {
    assert.equal(g._tagSentimentHtml(html), html, `${label}: nothing to tag, so the markup must come back unchanged`)
  }
  const faults = g.markPatternExclusions(g._tagSentimentHtml(`<tbody>${rows(3)}</tbody>`), [rule(3)])
  assert.deepEqual(faults.faults, [])
  assert.deepEqual(faults.counts, [3])
})

test('#171: tagging still wraps only the signed token inside a table cell', () => {
  const out = g._tagSentimentHtml('<tbody><tr><td>Net <b>+8.7</b> and -300 jobs</td></tr></tbody>')
  assert.match(out, /^<tbody><tr><td>/)
  assert.match(g._tagSentimentHtml(out), /^<tbody><tr><td>/, 're-tagging already-tagged table markup keeps the table root')
  const box = document.createElement('template'); box.innerHTML = out
  assert.deepEqual([...box.content.querySelectorAll('[data-sb-sentiment]')].map(e => [e.textContent, e.getAttribute('data-sb-sentiment')]),
    [['+8.7', 'positive'], ['-300', 'negative']])
})

test('#171: non-table regions are byte-identical to what the old <div> parse produced', () => {
  const oldWay = html => { const d = document.createElement('div'); d.innerHTML = html; g.tagSentimentData(d); return d.innerHTML }
  for (const html of [
    '<div class="card"><h2>T</h2><p>Dems +8.7 and -300 jobs</p><ul><li><a href="/a?x=1&amp;y=2">one</a></li></ul></div>',
    '<ol><li>a</li><li>b</li></ol>',
    '<span>x</span>',
    // (inline <svg> text is left out: jsdom matches closest('SVG') differently inside a template's inert document;
    //  real Chrome skips it identically in both -- probed 8 Oct)
    '<section><style>.a{color:red}</style><img src="a.png" srcset="a.png 1x, b.png 2x"><p>-5</p></section>',
    '<main><table><tbody><tr><td>+1.5%</td></tr></tbody></table></main>',
    '<div>text &amp; entities &lt;b&gt; &nbsp; &copy;</div>',
    // (<noscript> is left out for the same reason: jsdom's template document has a different scripting flag; Chrome is identical)
    '<div><template><p>+3</p></template></div>',
  ]) assert.equal(g._tagSentimentHtml(html), oldWay(html), html)
})
