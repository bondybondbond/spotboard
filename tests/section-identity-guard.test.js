// #212: a refresh must never store a DIFFERENT section as success. Kalshi repro: the card selector `div.flex.flex-col`
// matches 67 elements, the background-tab tier picked a page-header block that also contains the fingerprint text, and it
// replaced the saved party rows + chart. sectionMatch() compares the candidate with the saved copy by element shape
// (tag + class tokens, hash-like class segments folded): how much of the card is still there (kept) and how much of the
// result is the card (own); _finalizeSuccess() rejects a result that lost the card or is mostly something else.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
const { sectionMatch, isDifferentSection, _finalizeSuccess, classifyError, shouldOfferRecapture } = g
// Real refresh output (throwaway profile, 18 Oct 2026), kept in a subfolder: capture-selector-roundtrip scans
// fixtures/*.html, and jsdom cannot parse the escaped Tailwind class `[&_*]:select-none` that Chrome matches fine.
const fixture = name => fs.readFileSync(new URL(`./fixtures/section-identity/${name}`, import.meta.url), 'utf8')
const SAVED = fixture('kalshi-212-saved.html')
const WRONG = fixture('kalshi-212-wrong-block.html')

// A feed-shaped card: n rows of the same shape inside a list.
const feed = (n, cls = 'story', head = 'River') =>
  `<section class="river"><h2 class="river__title">${head}</h2><ul class="river__list">` +
  Array.from({ length: n }, (_, i) => `<li class="${cls}"><a class="${cls}__link" href="/a${i}"><span class="${cls}__kicker">K${i}</span><span class="${cls}__headline">Headline number ${i}</span></a><time class="${cls}__time">${i}h</time><img class="${cls}__img" src="/i${i}.jpg"></li>`).join('') +
  `</ul><footer class="river__more"><a class="river__more-link" href="/more">More</a><span class="river__count">${n}</span></footer></section>`

test('#212 real Kalshi pair: the header block is judged a different section and the refresh fails closed', () => {
  const m = sectionMatch(WRONG, SAVED)
  assert.ok(m.kept < 0.5, `kept ${m.kept}`)
  assert.equal(isDifferentSection(WRONG, SAVED), true)
  const r = _finalizeSuccess(WRONG, { name: 'Kalshi', html_cache: SAVED }, { rawCaptureLength: 36404 })
  assert.equal(r.success, false)
  assert.equal(r.keepOriginal, true)
  assert.equal(r.html_cache, undefined, 'nothing to store')
  assert.equal(r.rawCaptureLength, undefined, 'a rejected result never moves the drift baseline')
  const code = classifyError(r.error)
  assert.equal(code, 'layout_changed')
  assert.equal(shouldOfferRecapture({ lastOutcome: 'failed', lastErrorCode: code }), true)
})

test('#212 second site, Cricbuzz (#181): the news column is a different section from a saved scoreline card, both ways', () => {
  // Same card selector `div.my-2 > div` matches both (18 matches). Real refresh output, 18 Oct 2026 (ad block removed).
  const scoreline = fixture('cricbuzz-181-scoreline-saved.html'), news = fixture('cricbuzz-181-news-column.html')
  assert.equal(isDifferentSection(news, scoreline), true)
  assert.equal(isDifferentSection(scoreline, news), true)
  assert.equal(isDifferentSection(scoreline, scoreline), false)
})

test('#212 real Kalshi first refresh after a fresh capture: the whole card plus a section the page mounts while loading passes', () => {
  // `div.flex.flex-col.gap-4` card; the refresh kept every saved shape and gained Kalshi's lazily mounted news block (#202).
  // Text and links blanked (the block holds other users' comments); shapes are untouched.
  const saved = fixture('kalshi-202-fresh-capture.html'), grown = fixture('kalshi-202-first-refresh-grown.html')
  const m = sectionMatch(grown, saved)
  assert.equal(m.kept, 1)
  assert.ok(m.own > 0.5 && m.own < 0.6, `own ${m.own}: the lowest legit own measured; passes the symmetric 0.5 bar (#244) by about 0.06`)
  assert.equal(isDifferentSection(grown, saved), false)
  assert.equal(_finalizeSuccess(grown, { name: 'Kalshi', html_cache: saved }).success, true)
})

test('#212 the saved copy against itself is the same section', () => {
  assert.deepEqual(sectionMatch(SAVED, SAVED), { kept: 1, own: 1 })
  assert.equal(_finalizeSuccess(SAVED, { name: 'Kalshi', html_cache: SAVED }).success, true)
})

test('#212 new headlines in the same feed are the same section (text overlap is irrelevant)', () => {
  const later = feed(12).replace(/Headline number/g, 'Completely different story')
  assert.equal(isDifferentSection(later, feed(12)), false)
})

test('#212 a feed that grows or shrinks is the same section', () => {
  assert.equal(isDifferentSection(feed(30), feed(10)), false)
  assert.equal(isDifferentSection(feed(3), feed(10)), false)
})

test('#212 hash-like class names rotating on a site deploy are the same section', () => {
  // Guardian/Emotion `dcr-17m0c6q` -> `dcr-1qhf2b0`, BBC `ssrcss-1lj0qhb-Promo` -> `ssrcss-9xk2pq1-Promo`, styled-jsx `jsx-3547261442`
  const v = (a, b, c) => `<div class="dcr-${a}"><ul class="ssrcss-${b}-PromoList">` +
    Array.from({ length: 6 }, (_, i) => `<li class="ssrcss-${b}-PromoItem"><a class="jsx-${c} link"><span class="dcr-${a}x title">T${i}</span><p class="dcr-${a}y">S${i}</p></a><img class="ssrcss-${b}-Img"></li>`).join('') +
    `</ul><nav class="dcr-${a}z"><a class="jsx-${c} more">More</a></nav></div>`
  assert.equal(isDifferentSection(v('1qhf2b0', '9xk2pq1', '1180044521'), v('17m0c6q', '1lj0qhb', '3547261442')), false)
})

test('#212 styled-components and CSS-module hashes rotating on a deploy are the same section', () => {
  // styled-components: letters-only hashes (`sc-bdVaJa kGfFJb`); CSS modules: `[name]__[5-char hash]` that may hold `-`/`_`
  const v = (sc, gen, mod) => `<div class="sc-${sc} ${gen}"><ul class="List_list__${mod}">` +
    Array.from({ length: 6 }, (_, i) => `<li class="Item_row__${mod}"><a class="Item_link__${mod}"><span class="Item_title__${mod}">T${i}</span></a><time class="Item_time__${mod}">1h</time></li>`).join('') +
    `</ul><footer class="List_more__${mod}"><a class="sc-${sc}x ${gen}y">More</a></footer><span class="List_count__${mod}">6</span></div>`
  assert.equal(isDifferentSection(v('kGfFJb', 'bdVaJa', 'a-B3x'), v('hKqWpz', 'fXlNmR', 'Q_9zt')), false)
})

test('#212 same tags, different readable class names: still different sections (folding must not erase names)', () => {
  // Tags identical on both sides, so only the class names can tell them apart: if readable names (NavList, promo__count,
  // story1-free words) were folded to `#`, every shape would match and this would pass as the same section.
  const block = (p, sub) => `<div class="${p}Group"><ul class="${p}List">` +
    Array.from({ length: 5 }, (_, i) => `<li class="${p}Item"><a class="${p}Link"><span class="${sub}__title">T${i}</span><span class="${sub}__meta">M</span></a></li>`).join('') +
    `</ul><span class="${sub}__count">5</span><a class="${sub}__more">More</a></div>`
  assert.equal(isDifferentSection(block('Nav', 'nav'), block('Promo', 'promo')), true)
  assert.equal(isDifferentSection(block('Promo', 'promo'), block('Promo', 'promo')), false)
})

test('#212 a real partial restyle (about 4 in 10 element shapes changed) is still the same section', () => {
  // Pins the "card still there" bar from the legit side: the owner's live refreshes went as low as 0.64 kept.
  const card = v => `<section class="hub"><h2 class="hub__title">H</h2><ul class="hub__list">` +
    Array.from({ length: 6 }, (_, i) => `<li class="hub__row${v}"><a class="hub__link"><span class="hub__kicker${v}">K${i}</span><span class="hub__headline">H${i}</span></a><time class="hub__time${v}">1h</time><img class="hub__img${v}"></li>`).join('') +
    `</ul><footer class="hub__more"><a class="hub__more-link">More</a><span class="hub__count">6</span></footer></section>`
  const m = sectionMatch(card('--v2'), card(''))
  assert.ok(m.kept > 0.5 && m.kept < 0.75, `kept ${m.kept}`)
  assert.equal(isDifferentSection(card('--v2'), card('')), false)
})

test('#212 each hash family on its own must fold: a rotation of only that family is the same section', () => {
  // Every element's only class is one family's hash, so without that family's fold nothing matches (kept 0) and the
  // rotation would fail as a different section. Tags differ per element to keep >= 8 distinct shapes.
  const TAGS = ['div', 'ul', 'li', 'a', 'span', 'time', 'img', 'footer', 'p']
  const card = cls => TAGS.map(t => `<${t} class="${cls(t)}"></${t}>`).join('')
  const families = {
    'digits + letters (Emotion)': [t => `dcr-17m0c6q`, t => `dcr-1qhf2b0`],
    'all digits (styled-jsx)': [t => `jsx-3547261442`, t => `jsx-1180044521`],
    'letters only (styled-components)': [t => `sc-bdVaJa`, t => `sc-kGfFJb`],
    'CSS-module suffix with - and _': [t => `Card_${t}__a-B3x`, t => `Card_${t}__Q_9zt`],
  }
  for (const [name, [before, after]] of Object.entries(families)) {
    const m = sectionMatch(card(after), card(before))
    assert.notEqual(m, null, name)
    assert.equal(m.kept, 1, `${name}: kept ${m.kept}`)
    assert.equal(isDifferentSection(card(after), card(before)), false, name)
  }
})

test('#212 the "card still there" bar sits at 0.5: a result keeping 6 of 10 saved shapes passes', () => {
  // Pins the bar below the lowest legit kept measured on the owner's board (0.64): raising it past 0.6 fails here.
  const saved = Array.from({ length: 10 }, (_, i) => `<div class="part-${'abcdefghij'[i]}"></div>`).join('')
  const result = Array.from({ length: 10 }, (_, i) => `<div class="part-${'abcdefklmn'[i]}"></div>`).join('')
  const m = sectionMatch(result, saved)
  assert.equal(m.kept, 0.6)
  assert.equal(isDifferentSection(result, saved), false)
})

test('#212 grow then shrink back: the real Kalshi card refreshed without its late-loaded block passes the section check', () => {
  // Saved copy = the grown refresh (card + the news block Kalshi mounts while loading, #202); the next refresh does not
  // get the block. kept = S/(S+N) = 0.56 on this real pair, so the section check passes, by about 0.06.
  const grown = fixture('kalshi-202-first-refresh-grown.html'), card = fixture('kalshi-202-fresh-capture.html')
  const m = sectionMatch(card, grown)
  assert.equal(m.own, 1)
  assert.ok(m.kept > 0.5 && m.kept < 0.6, `kept ${m.kept}`)
  assert.equal(isDifferentSection(card, grown), false)
  // That block is a 25-item list, so the older content-loss guard (list rows 25 -> 0) already rejects this shrink-back,
  // before and after #212: it reports content_lost, never #212's layout_changed. #202's scroll settle exists to mount it.
  const r = _finalizeSuccess(card, { name: 'Kalshi', html_cache: grown })
  assert.equal(r.success, false)
  assert.equal(classifyError(r.error), 'content_lost')
})

// Flipped deliberately by #244 (owner approved 7 Nov 2026). Until then this was "#212 KNOWN LIMIT: grow then shrink back
// fails": growth of N > S new kinds of element was accepted (own S/(S+N) >= 1/3), became the saved copy, and the next
// refresh without the block kept only S/(S+N) < 0.5 -> stuck on "Site layout changed" (the Product Hunt card, #244).
// The bar is now the same both ways, so that growth is rejected at the start and the saved copy stays the card.
test('#244 grow then shrink back: growth the old copy could not pass against is rejected, so the shrink-back has nothing to fail', () => {
  const shapes = (prefix, n) => Array.from({ length: n }, (_, i) => `<div class="${prefix}-${'abcdefghijklmnop'[i]}"></div>`).join('')
  const card = shapes('card', 8), grown = card + shapes('lazy', 9)
  assert.equal(isDifferentSection(grown, card), true, 'own 8/17 < 0.5: not adopted as the saved copy')
  assert.equal(isDifferentSection(card, card), false, 'the card itself, next day, still matches the untouched saved copy')
  const even = card + shapes('lazy', 8)
  assert.equal(isDifferentSection(even, card), false, 'N = S passes (own 0.5)')
  assert.equal(isDifferentSection(card, even), false, '... and so does the shrink-back against it (kept 0.5)')
})

test('#212 the direct-fetch drift check does not write a baseline onto the card before the result is judged', async () => {
  const component = { name: 'Kalshi', html_cache: SAVED }
  assert.equal(await g._runDriftGuard('<div>' + 'x'.repeat(SAVED.length) + '</div>', component, 0, 0), null)
  assert.equal(component.rawCaptureLength, undefined)
})

test('#212 a rejected result on the content-drift tab path carries no size baseline', async () => {
  // _runDriftGuard sends a drifted direct fetch to the tab tiers; the tab result here is the wrong Kalshi block.
  const realTab = g._tabRefreshForComponent
  g._tabRefreshForComponent = async () => ({ html: WRONG, activeFocusNeeded: false, renderDegraded: false })
  try {
    const component = { name: 'Kalshi', url: 'https://kalshi.com/x', selector: 'div.flex.flex-col', positionBased: true, excludedSelectors: [], html_cache: SAVED, rawCaptureLength: 1000 }
    const r = await g._runDriftGuard('<div>' + 'x'.repeat(2000) + '</div>', component, 0, 0)
    assert.equal(r.success, false)
    assert.equal(classifyError(r.error), 'layout_changed')
    assert.equal(r.rawCaptureLength, undefined)
  } finally { g._tabRefreshForComponent = realTab }
})

test('#212 readable mixed-case and BEM names are NOT folded: different components still differ', () => {
  const a = `<nav class="NavList"><ul class="NavMenu">` + Array.from({ length: 6 }, (_, i) => `<li class="NavItem"><a class="NavLink">N${i}</a></li>`).join('') + `</ul><form class="nav__search"><input class="nav__field"><button class="nav__go">Go</button></form><span class="nav__badge">1</span></nav>`
  const b = `<div class="PromoGroup"><ol class="PromoList">` + Array.from({ length: 6 }, (_, i) => `<li class="PromoItem"><h3 class="promo__headline">P${i}</h3><p class="promo__summary">S</p></li>`).join('') + `</ol><a class="promo__more-link">More</a><span class="promo__count">6</span><img class="promo__img"></div>`
  assert.notEqual(sectionMatch(a, b), null, 'big enough to judge')
  assert.equal(isDifferentSection(a, b), true)
})

test('#212 readable class names are NOT folded: a different section on a hashed site still fails', () => {
  const nav = `<nav class="ssrcss-1lj0qhb-NavWrapper"><ul class="ssrcss-1lj0qhb-NavList">` +
    Array.from({ length: 6 }, (_, i) => `<li class="ssrcss-1lj0qhb-NavItem"><a class="ssrcss-1lj0qhb-NavLink">N${i}</a></li>`).join('') +
    `</ul><button class="ssrcss-1lj0qhb-Menu">Menu</button><form class="ssrcss-1lj0qhb-Search"><input class="ssrcss-1lj0qhb-SearchInput"></form></nav>`
  const promos = `<div class="ssrcss-1lj0qhb-PromoGroup"><ol class="ssrcss-1lj0qhb-PromoList">` +
    Array.from({ length: 6 }, (_, i) => `<li class="ssrcss-1lj0qhb-PromoItem"><h3 class="ssrcss-1lj0qhb-Headline">P${i}</h3><p class="ssrcss-1lj0qhb-Summary">S</p><time class="ssrcss-1lj0qhb-Time">1h</time></li>`).join('') +
    `</ol><a class="ssrcss-1lj0qhb-MoreLink">More</a><span class="ssrcss-1lj0qhb-Count">6</span></div>`
  assert.equal(isDifferentSection(nav, promos), true)
})

test('#212 a page-level container that wraps the real card plus much more is a different section', () => {
  const page = `<div class="page"><header class="masthead"><nav class="nav"><a class="nav__a">A</a><a class="nav__b">B</a><a class="nav__c">C</a></nav><form class="search"><input class="search__q"><button class="search__go">Go</button></form></header>` +
    `<aside class="rail"><div class="ad"><span class="ad__label">Ad</span></div><ol class="popular"><li class="popular__item"><a class="popular__link">X</a></li></ol><div class="promo"><p class="promo__text">P</p></div></aside>` +
    `<main class="main">${feed(10)}</main><footer class="site-foot"><p class="legal">L</p><a class="privacy">Privacy</a><a class="terms">Terms</a><a class="cookies">Cookies</a><a class="contact">Contact</a></footer>` +
    `<section class="trending"><h2 class="trending__title">T</h2>${feed(4, 'trend', 'Trending')}</section><div class="newsletter"><form class="newsletter__form"><input class="newsletter__email"><button class="newsletter__go">Go</button></form></div></div>`
  const m = sectionMatch(page, feed(10))
  assert.equal(m.kept, 1, 'the card is inside it')
  assert.ok(m.own < 1 / 3, `own ${m.own}: well under the 0.5 bar (#244; the bar was 1/3 when this was measured)`)
  assert.equal(isDifferentSection(page, feed(10)), true)
})

test('#212 a thin wrapper around the same content is the same section', () => {
  assert.equal(isDifferentSection(`<div class="wrap">${feed(10)}</div>`, feed(10)), false)
})

test('#212 a card too small to judge by shape (fewer than 8 distinct elements) is not judged', () => {
  const tiny = '<div class="price"><span class="value">54%</span><span class="delta">+1</span></div>'
  const other = '<p class="note"><b class="x">Totally</b> unrelated</p>'
  assert.equal(sectionMatch(other, tiny), null)
  assert.equal(isDifferentSection(other, tiny), false)
  assert.equal(_finalizeSuccess(other, { name: 'tiny', html_cache: tiny }).success, true)
})

test('#212 no saved copy yet: nothing to compare, not judged', () => {
  assert.equal(isDifferentSection(feed(5), ''), false)
  assert.equal(isDifferentSection(feed(5), undefined), false)
})

// #214: the rescues that accept a tab result despite a fingerprint mismatch (structure marker, feed rotation) used to
// overwrite component.headingFingerprint BEFORE the final gate ran, so a rejected candidate still changed what the next
// refresh of the same in-memory card was judged against. The fingerprint now moves only with an accepted result.
const RESCUE_WRONG = `<h2>Wrong block heading</h2><div data-sb-marker="m1">${WRONG}</div>`
const driftCard = () => ({ name: 'Kalshi', url: 'https://kalshi.com/x', selector: 'div.flex.flex-col', positionBased: false, excludedSelectors: [], html_cache: SAVED, rawCaptureLength: 1000, headingFingerprint: 'Original saved heading', structureMarker: { attr: 'data-sb-marker', value: 'm1' } })

test('#214 a structure-marker rescue that the final gate rejects leaves the card fingerprint as it was, and the retry judges against it', async () => {
  const realTab = g._tabRefreshForComponent
  const seen = []
  g._tabRefreshForComponent = async (c, fingerprint) => { seen.push(fingerprint); return { html: RESCUE_WRONG, activeFocusNeeded: false, renderDegraded: false } }
  try {
    const component = driftCard()
    const r1 = await g._runDriftGuard('<div>' + 'x'.repeat(2000) + '</div>', component, 0, 0)
    assert.equal(r1.success, false, 'the wrong block is rejected by the final gate')
    assert.equal(r1.error, 'Refresh found a different element on the page', 'reached the rescue, then failed the final gate')
    assert.equal(component.headingFingerprint, 'Original saved heading')
    await g._runDriftGuard('<div>' + 'x'.repeat(2000) + '</div>', component, 0, 0)
    assert.deepEqual(seen, ['Original saved heading', 'Original saved heading'], 'the second refresh starts from the saved fingerprint, as on a freshly loaded dashboard')
  } finally { g._tabRefreshForComponent = realTab }
})

test('#214 a structure-marker rescue that is accepted still moves the card fingerprint to the new heading', async () => {
  const realTab = g._tabRefreshForComponent
  const accepted = `<h2>Rotated heading</h2><div data-sb-marker="m1">${SAVED}</div>`
  g._tabRefreshForComponent = async () => ({ html: accepted, activeFocusNeeded: false, renderDegraded: false })
  try {
    const component = driftCard()
    const r = await g._runDriftGuard('<div>' + 'x'.repeat(2000) + '</div>', component, 0, 0)
    assert.equal(r.success, true)
    assert.equal(component.headingFingerprint, g.extractFingerprint(r.html_cache))
    assert.notEqual(component.headingFingerprint, 'Original saved heading')
  } finally { g._tabRefreshForComponent = realTab }
})

// ─── #243: per-item class tokens in a repeated template ─────────────────────────────────────────────────────────────
// The i Paper "Most Popular" card: ten rows, each carrying per-article WordPress classes (category-*, tag-*, post_label-*,
// inews__section--*), so the ten row shapes change whenever the ranking rotates. Strict score of the owner's saved copy
// vs the live section on 6 Nov 2026: 0.47 / 0.47 -> "Site layout changed" although nothing changed. Fixtures are the real
// saved copy and the real live section (text and attributes other than class removed).
const IPAPER_SAVED = fixture('ipaper-243-saved.html')
const rowsOf = (html, n) => { const d = document.createElement('div'); d.innerHTML = html; [...d.firstElementChild.children].slice(n).forEach(r => r.remove()); return d.innerHTML }

test('#243: i Paper live section vs the saved copy is the same section (strict was 0.47 / 0.47)', () => {
  const live = fixture('ipaper-243-live.html')
  const m = sectionMatch(live, IPAPER_SAVED)
  assert.equal(m.folded, true, 'rescued by the per-item fold, not by moving a bar')
  assert.ok(m.kept >= 0.62 && m.own >= 0.60, `CPO bar: the guard's documented legit minima, got ${m.kept} / ${m.own}`)
  assert.equal(isDifferentSection(live, IPAPER_SAVED), false)
})

test('#243: a rotated ranking (ten other articles in the same template) is the same section', () => {
  const rotated = fixture('ipaper-243-rotated.html')
  const m = sectionMatch(rotated, IPAPER_SAVED)
  assert.equal(m.folded, true)
  assert.ok(m.kept >= 0.62 && m.own >= 0.60, `got ${m.kept} / ${m.own}`)
  assert.equal(isDifferentSection(rotated, IPAPER_SAVED), false)
})

test('#243: fewer rows is still the same section down to 3 (a template group); 2 rows is judged strictly as before', () => {
  const live = fixture('ipaper-243-live.html')
  for (const n of [5, 3]) assert.equal(isDifferentSection(rowsOf(live, n), IPAPER_SAVED), false, `${n} rows`)
  assert.equal(isDifferentSection(rowsOf(live, 2), IPAPER_SAVED), true, 'under 3 rows there is no template group: status quo')
})

test('#243: a different block of the same site (the lead story) is still a different section', () => {
  const lead = fixture('ipaper-243-lead-block.html')
  const m = sectionMatch(lead, IPAPER_SAVED)
  assert.equal(m.folded, undefined)
  assert.equal(isDifferentSection(lead, IPAPER_SAVED), true)
})

// Known limit, pinned so a change to it is deliberate: the check recognises the TEMPLATE, not the instance. Another
// list of the same site built from the same row template (4 rows) looks like the card by shape, as any two uniform-class
// feeds always have. The card's own selector is data-type scoped (one match), so nothing hands refresh this block.
test('#243: residual limit - a different list built from the same row template passes by shape', () => {
  assert.equal(isDifferentSection(fixture('ipaper-243-sibling-list.html'), IPAPER_SAVED), false)
})

const tplRow = (cls) => `<div class="${cls}"><div class="a"><span class="b"><i class="c"></i><i class="c"></i></span><span class="b"></span></div></div>`
const tplCard = (...classes) => `<section>${classes.map(tplRow).join('')}</section>`

test('#243: a token every row carries stays in the shape; only tokens missing from some row are per-item', () => {
  const saved = tplCard('r k1 shared', 'r k2 shared', 'r k3 shared', 'r k4 shared', 'r k5 shared')
  assert.equal(isDifferentSection(tplCard('r k6 shared', 'r k7 shared', 'r k8 shared', 'r k9 shared', 'r k0 shared'), saved), false)
  // the shared token is part of the identity: rows that lost it are not the same template
  assert.equal(isDifferentSection(tplCard('r k6', 'r k7', 'r k8', 'r k9', 'r k0'), saved), true)
})

test('#243: the 8-shape floor is counted before folding, so folding never switches the guard off', () => {
  const saved = tplCard('r k1', 'r k2', 'r k3', 'r k4', 'r k5')
  const m = sectionMatch(tplCard('r k6', 'r k7', 'r k8', 'r k9', 'r k0'), saved)
  assert.notEqual(m, null, '3 inner + 5 row shapes = 8 before folding, 4 after: still judged')
  assert.equal(m.folded, true)
  // a wrong block is still rejected on such a thin card
  assert.equal(isDifferentSection(feed(10), saved), true)
})

test('#243: stage 2 never touches a result that passes stage 1, and a card with no template group is judged as before', () => {
  assert.deepEqual(sectionMatch(IPAPER_SAVED, IPAPER_SAVED), { kept: 1, own: 1 })
  assert.equal(sectionMatch(feed(30), feed(10)).folded, undefined)
  assert.equal(isDifferentSection(WRONG, SAVED), true)
  assert.equal(sectionMatch(WRONG, SAVED).folded, undefined)
})

// #243 follow-up (cold-review note): stage 2 drops a class token that is NOT on every row of a group. A token that only
// some rows carry (`featured`, `col-span-2`) is folded on purpose: one featured row does not make another section. A
// token EVERY row carries (the group's layout, `flex-col`) stays in the shape, so a block with another layout is not accepted.
test('#243: a different group-wide layout is not accepted just because per-row classes are ignored', () => {
  const saved = tplCard('r flex-col k1', 'r flex-col k2', 'r flex-col k3', 'r flex-col k4', 'r flex-col k5')
  const otherLayout = tplCard('r flex-row k6', 'r flex-row k7', 'r flex-row k8', 'r flex-row k9', 'r flex-row k0')
  assert.equal(sectionMatch(otherLayout, saved).folded, undefined, 'stage 2 did not rescue it')
  assert.equal(isDifferentSection(otherLayout, saved), true)
})

test('#243: modifiers on only some rows (featured, col-span-2) are per-item and folded: still the same section', () => {
  const saved = tplCard('r flex-col k1', 'r flex-col k2 featured', 'r flex-col k3', 'r flex-col k4', 'r flex-col k5 col-span-2')
  const later = tplCard('r flex-col k6', 'r flex-col k7', 'r flex-col k8 col-span-2', 'r flex-col k9', 'r flex-col k0 featured')
  assert.equal(sectionMatch(later, saved).folded, true)
  assert.equal(isDifferentSection(later, saved), false)
})

// Real second day (7 Nov 2026, fetched from inews.co.uk the day after the saved copy): the ranking rotated again. Strict
// scored 0.53 / 0.53 against the 6 Nov copy: over the 0.5 bar by one shared row shape, the margin that failed (0.47) on 6 Nov.
test('#243: the real next-day ranking is accepted against the saved copy, in both directions', () => {
  const day2 = fixture('ipaper-243-day2-live.html')
  assert.equal(isDifferentSection(day2, IPAPER_SAVED), false)
  assert.equal(isDifferentSection(fixture('ipaper-243-live.html'), day2), false)
  assert.equal(isDifferentSection(IPAPER_SAVED, day2), false)
})

// ─── #244: a one-day larger section must not become the saved copy ─────────────────────────────────────────────────
// The owner's Product Hunt "Top Products Launching Today" card. Real copies (the card's own capture pipeline output):
// the 22 Oct saved copy, the 6 Nov copy a refresh stored on a day the site served a much larger section (Hypership Day:
// 60 sections, product-update rows), and the live section on 7 Nov (throwaway headed profile). Text replaced with x's,
// attributes other than class removed (img src / a href set to placeholders): every element and class is kept, so the
// scores are the originals'. Before #244 the 6 Nov copy
// was accepted (0.89 / 0.36) and every normal day after it failed (kept 0.34). A rule that holds both ways rejects it.
const PH_22OCT = fixture('producthunt-244-saved-22oct.html')
const PH_6NOV = fixture('producthunt-244-saved-6nov-oversized.html')
const PH_LIVE = fixture('producthunt-244-live-7nov.html')

test('#244 real Product Hunt cycle: normal saved, oversized day rejected with nothing stored, next normal day accepted', () => {
  const card = { name: 'Top Products Launching Today', html_cache: PH_22OCT, excludedSelectors: ['section.relative.rounded-xl.border[data-test="newsletter-banner"]'], rawCaptureLength: 47856 }
  const before = structuredClone(card)
  const m = sectionMatch(PH_6NOV, PH_22OCT)
  assert.ok(m.kept > 0.8 && m.own < 0.4, `the larger day keeps the card but is mostly other parts: ${m.kept} / ${m.own}`)
  const oversized = _finalizeSuccess(PH_6NOV, card, { rawCaptureLength: 320143 })
  assert.equal(oversized.success, false)
  assert.equal(oversized.keepOriginal, true)
  assert.equal(oversized.html_cache, undefined, 'nothing to store')
  assert.equal(oversized.rawCaptureLength, undefined, 'the size baseline does not move')
  assert.equal(classifyError(oversized.error), 'layout_changed')
  assert.deepEqual(card, before, 'the card, its saved copy and its exclusions are untouched')
  const nextDay = _finalizeSuccess(PH_LIVE, card)
  assert.equal(nextDay.success, true, 'the normal page passes against the untouched saved copy')
  assert.equal(isDifferentSection(PH_22OCT, PH_LIVE), false, 'and both ways round (0.83 / 1.00)')
})

test('#244 known residual: a card that already holds an oversized copy stays stuck until re-capture (no automatic repair)', () => {
  assert.equal(isDifferentSection(PH_LIVE, PH_6NOV), true, 'kept 0.34: the state the owner card and 1.4.6 users can be in')
})

test('#244 KNOWN LIMIT: growth in steps, each under 2x, can still trap a card (the rule compares consecutive copies only)', () => {
  // Accepted 7 Nov 2026 (owner). Each step passes both ways, but the first and last copies do not. Revisit if a real card
  // is seen stuck this way; the principled fix is a pinned reference (a stored-schema change, T3).
  const shapes = (prefix, n) => Array.from({ length: n }, (_, i) => `<div class="${prefix}-${'abcdefghijklmnop'[i]}"></div>`).join('')
  const card = shapes('card', 8), mid = card + shapes('more', 5), big = mid + shapes('most', 7)
  for (const [a, b] of [[mid, card], [card, mid], [big, mid], [mid, big]]) assert.equal(isDifferentSection(a, b), false)
  assert.equal(isDifferentSection(card, big), true, 'the return to normal fails against the twice-grown copy')
})

test('#244 shapes are counted once each: a section repeating its own parts many more times is the same section', () => {
  assert.deepEqual(sectionMatch(feed(40), feed(10)), { kept: 1, own: 1 })
  assert.deepEqual(sectionMatch(feed(10), feed(40)), { kept: 1, own: 1 })
})

test('#244 two page variants that alternate (an A/B block) keep refreshing in either order', () => {
  const base = feed(10), a = base + '<aside class="promo-a"><b class="promo-a__x">A</b></aside>', b = base + '<aside class="promo-b"><b class="promo-b__x">B</b></aside>'
  for (const [x, y] of [[a, base], [b, a], [a, b], [base, b]]) assert.equal(isDifferentSection(x, y), false)
})

test('#244 the #243 per-item fold cannot admit an oversized result: the same bar applies in stage 2', () => {
  const saved = tplCard('r k1', 'r k2', 'r k3', 'r k4', 'r k5')
  const rotated = tplCard('r k6', 'r k7', 'r k8', 'r k9', 'r k0')
  assert.equal(sectionMatch(rotated, saved).folded, true, 'control: a rotation alone is rescued')
  const extra = Array.from({ length: 6 }, (_, i) => `<p class="extra-${'abcdef'[i]}"></p>`).join('')
  const oversized = rotated.replace('</section>', extra + '</section>')
  const m = sectionMatch(oversized, saved)
  assert.equal(m.folded, undefined, 'folded own 5/11 used to clear 1/3; it does not clear 0.5')
  assert.equal(isDifferentSection(oversized, saved), true)
})

test('#244 cold review: stage 2 is symmetric too - a result bringing an extra repeated-row group is not rescued, so it cannot lock out the normal page', () => {
  const saved = tplCard('r k1', 'r k2', 'r k3', 'r k4', 'r k5')
  const extraGroup = ['q m1', 'q m2', 'q m3'].map(tplRow).join('')
  const grownDay = tplCard('r k6', 'r k7', 'r k8', 'r k9', 'r k0').replace('</section>', extraGroup + '</section>')
  assert.equal(isDifferentSection(grownDay, saved), true, 'the day with an extra group is not stored')
  const nextDay = tplCard('r j1', 'r j2', 'r j3', 'r j4', 'r j5')
  assert.equal(isDifferentSection(nextDay, saved), false, 'the next normal (rotated) day still passes against the untouched copy')
  assert.equal(isDifferentSection(nextDay, grownDay), true, 'had the grown day been stored, the normal day would fail: the trap the rule prevents')
})

// Review note on #244, pinned so a change to it is deliberate (owner, 7 Nov 2026: document, do not solve now). Stage 2
// needs the same repeated-row templates both ways, so on a ranking card whose articles rotate, a result where one row
// gains a block of 3+ structured items the saved copy never had (here a "related" strip) is not rescued: the card keeps
// its last copy for that refresh. One row with an extra tag chip still passes (it adds one shape, not a new template).
// Minimal pair: the same strip with 2 items (same new shapes, no group of 3) is rescued, so the template group is the cause.
test('#244 KNOWN LIMIT: a rotated ranking where one row gains a new nested repeated block is refused, not rescued', () => {
  const rel = '<div class="rel"><a class="rel__a"><img class="rel__img"><span class="rel__t"><b class="rel__b"></b></span></a></div>'
  const row = (cls, chips, related) => `<div class="${cls}"><div class="a"><span class="b"><i class="c"></i><i class="c"></i></span>` +
    `<span class="tags">${'<em class="chip"></em>'.repeat(chips)}</span>${related ? `<div class="related">${rel.repeat(related)}</div>` : ''}</div></div>`
  const ranking = (prefix, rowFn) => `<section>${Array.from({ length: 10 }, (_, i) => rowFn(`r ${prefix}${i}`, i)).join('')}</section>`
  const saved = ranking('k', cls => row(cls, 2, 0))
  assert.equal(sectionMatch(ranking('j', cls => row(cls, 2, 0)), saved).folded, true, 'control: a plain rotation is rescued')
  assert.equal(sectionMatch(ranking('j', (cls, i) => row(cls, i === 4 ? 3 : 2, 0)), saved).folded, true, 'one extra tag chip: rescued by stage 2')
  assert.equal(sectionMatch(ranking('j', (cls, i) => row(cls, 2, i === 4 ? 2 : 0)), saved).folded, true, 'minimal pair: a 2-item strip (no template group) is rescued')
  const nested = ranking('j', (cls, i) => row(cls, 2, i === 4 ? 3 : 0))
  assert.equal(sectionMatch(nested, saved).folded, undefined, 'stage 2 does not rescue it')
  assert.equal(isDifferentSection(nested, saved), true, 'refused: the card keeps its last copy for this refresh')
})
