// #103: per-card list format is a render-time transform. These pin the detector on the shapes
// the plan named (real Daily Faceoff markup, text rows, image+title cards, existing lists,
// nothing repeated) plus idempotence and the invalid-value fallback.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { installDomEnv } from './helpers/env.js'

installDomEnv()
const out = await build({
  entryPoints: ['src/utils/list-format.ts'], bundle: true, write: false, format: 'esm', platform: 'node'
})
const { applyListFormat, hasListableItems, normaliseListFormat } =
  await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'))

// Static fixture strings only (jsdom), never untrusted input
const parse = html => {
  const div = document.createElement('div')
  div.innerHTML = html
  return div
}

// #229: runs averaging under 25 characters per row are dropped, so a test that pins ANOTHER rule (template matching,
// MIN_RUN, skip rules) pads its row text; otherwise the floor alone would make it pass whatever that rule does.
const padded = html => html.replace(/>([^<>]+)</g, (m, t) => '>' + t + ' padded so the row clears the tiny-run floor<')

// Real Daily Faceoff capture shape (sidebar news): wrapper of sibling <a class="canvas-link"> rows
const dfoRow = t => `<a href="https://www.dailyfaceoff.com/news/x" target="_blank" class="canvas-link"><div class="flex min-h-32 flex-col justify-between border-b border-gray-200 p-2"><span class="text-lg">${t}</span></div></a>`
const DFO = `\n  <div class="flex w-full shrink-0 flex-col p-2"><div class="static top-0 mb-10 w-full lg:sticky">` +
  ['18 NHL players placed on waivers', 'Red Wings, Predators claim players', 'What should Toronto expect from McKenna'].map(dfoRow).join('') +
  `</div></div>\n`

test('Daily Faceoff link rows become a bulleted list, each row wrapped intact in an li', () => {
  const root = parse(DFO)
  assert.equal(applyListFormat(root, 'bullets'), 1)
  const lis = root.querySelectorAll('ul.sb-list > li')
  assert.equal(lis.length, 3)
  assert.equal(lis[0].firstElementChild.tagName, 'A')
  assert.equal(lis[0].querySelector('a').getAttribute('href'), 'https://www.dailyfaceoff.com/news/x')
})

test('numbered uses ol', () => {
  const root = parse(DFO)
  assert.equal(applyListFormat(root, 'numbered'), 1)
  assert.equal(root.querySelectorAll('ol.sb-list > li').length, 3)
  assert.equal(root.querySelector('ul'), null)
})

test('off (and any invalid value) leaves the DOM exactly as it was', () => {
  for (const v of ['off', undefined, null, 'garbage', 42, {}]) {
    const root = parse(DFO)
    const before = root.innerHTML
    assert.equal(applyListFormat(root, v), 0)
    assert.equal(root.innerHTML, before)
  }
})

test('normaliseListFormat: only bullets/numbered survive', () => {
  assert.equal(normaliseListFormat('bullets'), 'bullets')
  assert.equal(normaliseListFormat('numbered'), 'numbered')
  for (const v of ['off', 'Bullets', '', undefined, null, 7, ['bullets']]) assert.equal(normaliseListFormat(v), 'off')
})

test('applying twice is a no-op the second time (idempotent)', () => {
  const root = parse(DFO)
  applyListFormat(root, 'bullets')
  const once = root.innerHTML
  assert.equal(applyListFormat(root, 'bullets'), 0)
  assert.equal(applyListFormat(root, 'numbered'), 0)
  assert.equal(root.innerHTML, once)
})

test('switching format re-derives from the source html (bullets -> numbered -> off)', () => {
  const render = fmt => { const r = parse(DFO); applyListFormat(r, fmt); return r.innerHTML }
  assert.match(render('bullets'), /<ul class="sb-list">/)
  assert.match(render('numbered'), /<ol class="sb-list">/)
  assert.equal(render('off'), DFO)
})

test('plain text rows (div per row) are listed', () => {
  const root = parse('<div><div class="row">£4.99 Chicken breast fillets 1kg</div><div class="row">£12 Winter duvet double size</div><div class="row">£1 Dark chocolate bar multipack</div></div>')
  assert.equal(applyListFormat(root, 'bullets'), 1)
  assert.equal(root.querySelectorAll('li').length, 3)
})

test('image + title + price cards: the whole card stays intact inside the li', () => {
  const card = t => `<div class="deal"><img src="a.jpg" alt=""><a href="#">${t}</a><span>£5</span></div>`
  const root = parse(`<div>${card('Cordless drill with two batteries')}${card('Garden hose with spray nozzle')}${card('Oak shoe rack with three shelves')}</div>`)
  assert.equal(applyListFormat(root, 'bullets'), 1)
  const li = root.querySelector('li')
  assert.ok(li.querySelector('img') && li.querySelector('a') && li.querySelector('span'))
})

test('an existing ul/ol is left alone and not searched (no nested lists)', () => {
  const root = parse('<div><ul><li>a</li><li>b</li></ul><ol><li>c</li><li>d</li></ol></div>')
  const before = root.innerHTML
  assert.equal(applyListFormat(root, 'bullets'), 0)
  assert.equal(root.innerHTML, before)
})

test('no repeated siblings: nothing detected, DOM untouched, hint says so', () => {
  const root = parse('<div><h2>Title</h2><p>One paragraph of text.</p><a href="#">a link</a></div>')
  const before = root.innerHTML
  assert.equal(hasListableItems(root), false)
  assert.equal(applyListFormat(root, 'bullets'), 0)
  assert.equal(root.innerHTML, before)
})

test('long prose paragraphs are not turned into a list', () => {
  const para = 'word '.repeat(80)
  const root = parse(`<div><p>${para}</p><p>${para}</p></div>`)
  assert.equal(applyListFormat(root, 'bullets'), 0)
})

test('headings and tables are never list items', () => {
  const root = parse('<div><h3>A</h3><h3>B</h3></div><table><tbody><tr><td>x</td></tr><tr><td>y</td></tr></tbody></table>')
  assert.equal(applyListFormat(root, 'bullets'), 0)
})

test('only two lookalike siblings is layout, not a list', () => {
  const root = parse(padded('<div><div class="kv">Label</div><div class="kv">Value</div></div>'))
  assert.equal(applyListFormat(root, 'bullets'), 0)
})

test('items with different classes are not grouped', () => {
  const root = parse(padded('<div><div class="a">one</div><div class="b">two</div><div class="c">three</div></div>'))
  assert.equal(applyListFormat(root, 'bullets'), 0)
})

// #228: The i Paper "Most Popular" shape. Every row carries per-article WordPress classes after the root
// `inews__post`, so no two class strings match, yet the rows are one template (same inner structure).
const inewsRow = (id, extra, t) => `<div class="inews__post inews__post-small post-${id} post type-post status-publish category-news ${extra}"><div class="inews__post__image"><img src="x.jpg" alt=""></div><div class="inews__post__content"><div class="inews__post__content__group"><div class="inews__post__content-headline">${t}</div></div></div></div>`
const INEWS_ROWS = [
  inewsRow(4855575, 'tag-features tag-food', 'Eight middle-class stockpile meals'),
  inewsRow(4857786, 'tag-education tag-vat post_label-explained', 'Private schools and VAT'),
  inewsRow(4852670, 'tag-budget', 'What the Budget means for pensions'),
  inewsRow(4861432, 'tag-property inews__post-visited', 'Landlords and the Budget'),
]
const INEWS = `<div class="inews__post-section__body">${INEWS_ROWS.join('')}</div>`

test('#228 rows with per-item classes but one template are listed, in order (bullets and numbered)', () => {
  for (const [fmt, tag] of [['bullets', 'ul'], ['numbered', 'ol']]) {
    const root = parse(INEWS)
    assert.equal(hasListableItems(root), true)
    assert.equal(applyListFormat(root, fmt), 1)
    const lis = root.querySelectorAll(`${tag}.sb-list > li`)
    assert.equal(lis.length, 4)
    assert.match(lis[0].textContent, /^Eight middle-class/)
    assert.match(lis[3].textContent, /^Landlords/)
  }
})

test('#228 off still renders the per-item-class rows exactly as captured', () => {
  const root = parse(INEWS)
  assert.equal(applyListFormat(root, 'off'), 0)
  assert.equal(root.innerHTML, INEWS)
})

test('#228 same first class but different inner structure is not one template', () => {
  const root = parse(padded('<div>' +
    '<div class="card a1"><span>one</span></div>' +
    '<div class="card a2"><span>two</span><em>x</em></div>' +
    '<div class="card a3"><p>three</p></div></div>'))
  assert.equal(applyListFormat(root, 'bullets'), 0)
})

test('#228 same top-level structure that diverges deeper is not one template', () => {
  const row = (inner, t) => `<div class="card x${t}"><div><div><div>${inner}</div></div></div><p>${t}</p></div>`
  const root = parse(padded('<div>' + row('<span>a</span>', 'a') + row('<a href="#">b</a>', 'b') + row('<span>c</span>', 'c') + '</div>'))
  assert.equal(applyListFormat(root, 'bullets'), 0)
})

test('#228 button / tab / badge variants are not grouped, with or without an inner element', () => {
  const leaf = parse(padded('<nav><a class="btn btn-primary" href="#">Buy</a><a class="btn btn-ghost" href="#">Learn</a><a class="btn" href="#">Share</a></nav>'))
  assert.equal(hasListableItems(leaf), false)
  const withIcon = parse(padded('<nav><a class="btn btn-primary" href="#"><span>Buy</span></a><a class="btn btn-ghost" href="#"><span>Learn</span></a><a class="btn" href="#"><span>Share</span></a></nav>'))
  assert.equal(hasListableItems(withIcon), false)
  const tabs = parse(padded('<div><div class="tab active"><svg><path></path></svg><span>One</span></div><div class="tab"><svg><path></path></svg><span>Two</span></div><div class="tab disabled"><svg><path></path></svg><span>Three</span></div></div>'))
  assert.equal(hasListableItems(tabs), false)
})

test('#228 a multi-path svg icon does not make a tab look like a template', () => {
  const tab = (c, t) => `<div class="${c}"><svg><path></path><path></path><path></path></svg><span>${t}</span></div>`
  const root = parse(padded('<div>' + tab('tab active', 'One') + tab('tab', 'Two') + tab('tab disabled', 'Three') + '</div>'))
  assert.equal(hasListableItems(root), false)
})

test('#228 the structure threshold: 4 elements per row stays unlisted, 5 is listed', () => {
  const rows = inner => '<div>' + [1, 2, 3].map(n => `<div class="item v${n}">${inner}</div>`).join('') + '</div>'
  assert.equal(hasListableItems(parse(rows('<b>alpha item</b><i>beta item</i><u>gamma item</u>'))), false)
  assert.equal(hasListableItems(parse(rows('<b>alpha item</b><i>beta item</i><u>gamma item</u><s>delta item</s>'))), true)
})

test('#228 utility-class chips are not grouped, even when they share the first class', () => {
  const chip = (c, t) => `<span class="${c}"><b>${t}</b></span>`
  const root = parse(padded('<div>' +
    chip('flex items-center gap-1 px-2 rounded-full bg-success-50', '100%') +
    chip('flex items-center gap-1 px-2 rounded-full bg-warning-50', 'Be first') +
    chip('flex items-center gap-1 px-2 bg-neutral-50', '35%') + '</div>'))
  assert.equal(applyListFormat(root, 'bullets'), 0)
})

test('#228 same inner structure but different root class is layout, not a list', () => {
  const cell = (c, t) => `<div class="${c}"><span>${t}</span></div>`
  const root = parse(padded('<div>' + cell('left', 'a') + cell('middle', 'b') + cell('right', 'c') + '</div>'))
  assert.equal(applyListFormat(root, 'bullets'), 0)
})

test('#228 only two per-item-class rows is still layout (MIN_RUN unchanged)', () => {
  const root = parse(`<div>${INEWS_ROWS.slice(0, 2).join('')}</div>`)
  assert.equal(applyListFormat(root, 'bullets'), 0)
})

test('#228 per-item-class rows over the one-liner limit stay prose', () => {
  const long = 'word '.repeat(60)
  const root = parse(`<div>${[1, 2, 3].map(n => inewsRow(n, `tag-${n}`, long)).join('')}</div>`)
  assert.equal(applyListFormat(root, 'bullets'), 0)
})

test('#228 a run still ends where the template changes', () => {
  const root = parse(`<div>${INEWS_ROWS.join('')}<div class="inews__post foo-1"><span>odd one</span></div></div>`)
  assert.equal(applyListFormat(root, 'bullets'), 1)
  assert.equal(root.querySelectorAll('li').length, 4)
})

test('hasListableItems is true before formatting, false after (so the menu hint must be read first)', () => {
  const root = parse(DFO)
  assert.equal(hasListableItems(root), true)
  applyListFormat(root, 'bullets')
  assert.equal(hasListableItems(root), false)
})

// #229: runs of short labels (job tags, percentages, dates) are incidental, not a list worth offering.
const tagRow = t => `<div class="flex space-x-1 items-center"><p class="font-bold">${t}</p></div>`
const headlineRow = t => `<div class="pt-1 pb-0 w-full"><a href="https://example.com/x">${t}</a></div>`

test('#229 a run of short tag labels is not a list, and the menu hint says so', () => {
  const root = parse('<div>' + ['£40ph', 'London', 'Part-time'].map(tagRow).join('') + '</div>')
  assert.equal(hasListableItems(root), false)
  assert.equal(applyListFormat(root, 'numbered'), 0)
  assert.equal(root.querySelectorAll('ol, ul').length, 0)
})

test('#229 label / percentage / date runs (Kalshi-style) are not lists', () => {
  const root = parse('<div>' + ['0%', '12%', '40%', '8%', '1%'].map(tagRow).join('') + '</div>')
  assert.equal(hasListableItems(root), false)
  const dates = parse('<div>' + ['Nov 2024', 'Dec 2024', 'Jan 2025', 'Feb 2025', 'Mar 2025'].map(tagRow).join('') + '</div>')
  assert.equal(hasListableItems(dates), false)
})

test('#229 a real headline run next to tag runs is the only list formatted', () => {
  const heads = ['Fresh job opportunities open in Richmond this week', 'Children can profoundly change their world', 'Football For Women - No Experience Needed']
  // differently tagged wrappers, so the wrappers are not themselves a run of lookalike siblings
  const root = parse('<div><section>' + heads.map(headlineRow).join('') + '</section>' +
    '<aside>' + ['£40ph', 'London', 'Part-time'].map(tagRow).join('') + '</aside>' +
    '<footer>' + ['£35 - £45 ph', 'Wimbledon', 'Part-time'].map(tagRow).join('') + '</footer></div>')
  assert.equal(applyListFormat(root, 'numbered'), 1)
  const lis = [...root.querySelectorAll('ol.sb-list > li')]
  assert.deepEqual(lis.map(li => li.textContent.trim()), heads)
  assert.equal(root.querySelectorAll('aside li, footer li').length, 0)
})

test('#229 short real headlines (about 35 characters each) still make a list', () => {
  const root = parse('<div>' + ['Clayface Review - a mixed bag film', 'Doom: The Dark Ages Review - bold', 'Hades 2 Review - an instant classic'].map(headlineRow).join('') + '</div>')
  assert.equal(hasListableItems(root), true)
  assert.equal(applyListFormat(root, 'bullets'), 1)
})

test('#229 the floor is on the average item text of whitespace-collapsed rows', () => {
  const pad = '\n        '
  const at = n => 'xx' + pad + 'x'.repeat(n - 3)
  // each row is "xx" + whitespace + (n-3) x, i.e. exactly n characters once collapsed; trim-only counts the whitespace and lands on the wrong side of 25
  const make = lens => parse('<div>' + lens.map(n => `<div class="r">${pad}<span>${pad}${at(n)}${pad}</span>${pad}</div>`).join('') + '</div>')
  assert.equal(hasListableItems(make([24, 24, 24])), false)
  assert.equal(hasListableItems(make([25, 25, 25])), true)
  // one short row among longer ones averages above the floor, so the run stays a list
  assert.equal(hasListableItems(make([10, 30, 40])), true)
})

// #231: stored cards keep the page's HTML indentation, so lengths are measured on whitespace-collapsed text.
// A real row is several pieces of text (headline, time, topic) each on its own indented line, so the whitespace
// between them is interior to the row's textContent and counts toward a raw length.
const indent = '\n' + ' '.repeat(60)
const indentedRow = t => '<div class="pt-1 pb-0 w-full">' + indent + '<a href="https://example.com/x">' + t + '</a>' + indent + '<span>2 hours ago</span>' + indent + '<span>Richmond</span>' + indent + '<span>News</span>' + indent + '</div>'

test('#231 an indented row of ~90 visible characters is listed even though its raw text is far over the limit', () => {
  const heads = [
    'Empty Richmond unit to be turned into a community hub after council vote',
    'Residents react to plans for new cycle lanes along the riverside route',
    'Local school wins national award for its outdoor learning programme',
  ]
  const root = parse('<div>' + heads.map(indentedRow).join('') + '</div>')
  const row = root.firstElementChild.firstElementChild
  assert.ok(row.textContent.trim().length > 240, 'fixture: one row of raw text is over the one-liner limit')
  assert.ok(row.textContent.replace(/\s+/g, ' ').trim().length < 120, 'fixture: the same row is a one-liner once collapsed')
  assert.equal(hasListableItems(root), true)
  assert.equal(applyListFormat(root, 'numbered'), 1)
  assert.deepEqual([...root.querySelectorAll('ol.sb-list > li')].map(li => li.querySelector('a').textContent.trim()), heads)
})

test('#231 indented prose rows (over 240 characters once collapsed) are still not listed', () => {
  const prose = 'word '.repeat(60)
  const root = parse('<div>' + [1, 2, 3].map(() => indentedRow(prose)).join('') + '</div>')
  assert.equal(hasListableItems(root), false)
  assert.equal(applyListFormat(root, 'numbered'), 0)
})

test('#231 the one-liner limit is 240 collapsed characters: 240 lists, 241 does not', () => {
  // each row collapses to exactly n characters: (n - 5) x, one space, "abcd"
  const row = n => '<div class="r">' + indent + '<a href="#">' + 'x'.repeat(n - 5) + '</a>' + indent + '<span>abcd</span>' + indent + '</div>'
  const rows = n => '<div>' + [1, 2, 3].map(() => row(n)).join('') + '</div>'
  assert.equal(hasListableItems(parse(rows(240))), true)
  assert.equal(hasListableItems(parse(rows(241))), false)
})

test('#231 off leaves indented rows exactly as captured', () => {
  const html = '<div>' + [1, 2, 3].map(n => indentedRow('Headline number ' + n + ' is a reasonably long row of text')).join('') + '</div>'
  const root = parse(html)
  assert.equal(hasListableItems(root), true, 'fixture: these rows are listable, so Off is really leaving them alone')
  assert.equal(applyListFormat(root, 'off'), 0)
  assert.equal(root.innerHTML, parse(html).innerHTML)
})
