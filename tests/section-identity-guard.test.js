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
  assert.ok(m.own > 0.5 && m.own < 0.6, `own ${m.own}: the near-miss that set the second bar below 0.5`)
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

test('#212 KNOWN LIMIT: grow then shrink back fails when the late-loaded block has more kinds of element than the card', () => {
  // Accepted 20 Oct 2026 (owner): growth is accepted while N <= 2S, but a later refresh without the block keeps only
  // S/(S+N) < 0.5 once N > S -> "Site layout changed", last good copy kept, recovers when the block loads again.
  // Revisit trigger on #212. If a redesign fixes this, flip the expectation here deliberately.
  const shapes = (prefix, n) => Array.from({ length: n }, (_, i) => `<div class="${prefix}-${'abcdefghijklmnop'[i]}"></div>`).join('')
  const card = shapes('card', 8), grown = card + shapes('lazy', 9)
  assert.equal(isDifferentSection(grown, card), false, 'the growth itself is accepted (own 8/17)')
  assert.equal(isDifferentSection(card, grown), true, 'the shrink-back is the stated false failure')
  assert.equal(isDifferentSection(card, card + shapes('lazy', 8)), false, 'N = S still passes (kept 0.5)')
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
  assert.ok(m.own < 1 / 3, `own ${m.own}`)
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
