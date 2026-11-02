#!/usr/bin/env node
/* SpotBoard #22 dark-mode contrast + hierarchy audit.
 *
 * Two things it checks, both straight out of public/dashboard.html so it can't
 * drift from what ships:
 *
 *   1. TEXT / UI  — WCAG 2.x contrast ratio for every foreground/background
 *                   pair that actually renders. 4.5 for body text, 3.0 for
 *                   large text and UI components. Hard gate in dark.
 *
 *   2. SEPARATION — adjacency contrast between the stacked dark surfaces
 *                   (page < paused card < active card < header, plus the
 *                   captured-content well and its media wells). Elevation in
 *                   dark mode is carried by lightness, not shadow, so if two
 *                   stacked surfaces are within ~1.2:1 AND the border between
 *                   them is also weak, a dense board turns into one blob.
 *                   This is the "make a dense board legible" gate (issue #22).
 *
 * Usage:  node scripts/contrast-check.js [path-to-dashboard.html]
 * Exit:   non-zero if any dark TEXT/UI pair fails or any SEPARATION pair is
 *         below its floor with no border rescuing it.
 */
'use strict';
const fs = require('fs');
const path = process.argv[2] || require('path').join(__dirname, '..', 'public', 'dashboard.html');
const html = fs.readFileSync(path, 'utf8');

// ---------- parse a :root-style token block by selector ----------
function parseBlock(selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = html.match(new RegExp(esc + '\\s*\\{([\\s\\S]*?)\\n\\s*\\}'));
  if (!m) throw new Error('token block not found: ' + selector);
  const out = {};
  for (const line of m[1].split('\n')) {
    const t = line.match(/(--[\w-]+)\s*:\s*([^;]+);/);
    if (t) out[t[1].trim()] = t[2].trim();
  }
  return out;
}
const LIGHT = parseBlock(':root');
let DARK = {};
try { DARK = parseBlock(':root[data-theme="dark"]'); }
catch (e) { console.warn('!! ' + e.message + ' — dark checks skipped\n'); }

// ---------- gate: the two dark blocks must be identical ----------
// :root[data-theme="dark"] (explicit toggle) and the @media(prefers-color-scheme:dark)
// :root:not([data-theme]) block (first-load) are hand-duplicated. Drift = a bug that
// only shows for one class of users. Assert token-for-token equality.
let SYNC_FAIL = 0;
try {
  const media = parseBlock(':root:not([data-theme])'); // parseBlock escapes — pass the raw selector
  const keys = new Set([...Object.keys(DARK), ...Object.keys(media)]);
  const diffs = [...keys].filter(k => DARK[k] !== media[k]);
  if (diffs.length) {
    SYNC_FAIL = diffs.length;
    console.log('\n!! DARK BLOCK DRIFT — [data-theme="dark"] vs @media block disagree on:');
    for (const k of diffs) console.log('     ' + k + ':  toggle=' + (DARK[k] ?? '(absent)') + '   media=' + (media[k] ?? '(absent)'));
  }
} catch (e) { console.warn('!! dark-block sync check skipped: ' + e.message); }

// ---------- colour maths ----------
function parse(str, tokens, seen) {
  str = String(str).trim();
  if (str.startsWith('var(')) {
    const name = str.slice(4, -1).split(',')[0].trim();
    if (seen && seen.has(name)) throw new Error('cyclic var ' + name);
    return parse(tokens[name], tokens, (seen || new Set()).add(name));
  }
  let m = str.match(/^#([0-9a-f]{3})$/i);
  if (m) return [0, 1, 2].map(i => parseInt(m[1][i] + m[1][i], 16)).concat(1);
  m = str.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map(i => parseInt(m[1].substr(i, 2), 16)).concat(1);
  m = str.match(/^rgba?\(([^)]+)\)$/i);
  if (m) { const p = m[1].split(',').map(s => parseFloat(s)); return [p[0], p[1], p[2], p[3] == null ? 1 : p[3]]; }
  throw new Error('unparseable colour: ' + str);
}
const over = (fg, bg) => { const a = fg[3]; return [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a)).concat(1); };
const lum = ([r, g, b]) => { const f = c => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

// ---------- 1. TEXT / UI pairs ----------
// [label, fgToken, bgToken, baseToken|null (what an alpha bg sits on), target]
const TEXT = [
  ['card title on header strip',     '--text-heading',       '--surface-raised',      '--surface-card', 4.5],
  ['card meta row on header strip',   '--text-muted',         '--surface-raised',      '--surface-card', 4.5],
  ['primary text on card',            '--text-primary',       '--surface-card',        null,             4.5],
  ['muted text on card',              '--text-muted',         '--surface-card',        null,             4.5],
  ['muted text on menu',              '--text-muted',         '--surface-menu',        null,             4.5],
  ['faint text on page',              '--text-faint',         '--bg-page',             null,             4.5],
  ['template badge text',             '--text-muted',         '--surface-inset',       '--surface-card', 4.5],
  ['chrome link on menu',             '--link-chrome',        '--surface-menu',        null,             4.5],
  ['chrome link on card',             '--link-chrome',        '--surface-card',        null,             4.5],
  ['card size label (11px, #240)',    '--accent-strong',      '--surface-menu',        null,             4.5],
  ['focus ring on card',              '--accent',             '--surface-card',        null,             3.0],
  ['focus ring on page',              '--accent',             '--bg-page',             null,             3.0],
  ['text on accent-strong fill (modal buttons, #237)', '--accent-text', '--accent-strong', null,           4.5],
  ['danger text on card',             '--danger',             '--surface-card',        null,             4.5],
  ['danger text on menu',             '--danger',             '--surface-menu',        null,             4.5],
  // light 2.16 is accepted (decorative rule, #237); light never gates the exit code, dark still does
  ['warn accent rule (UI)',           '--warn-accent',        '--surface-card',        null,             3.0],
  ['text on warn-accent button',      '--warn-accent-text',   '--warn-accent',         null,             4.5],
  ['text on warn-accent button hover', '--warn-accent-text',  '--warn-accent-hover',   null,             4.5],  // #237
  ['warn ink text on card (Open site)', '--warn-accent-ink',  '--surface-card',        null,             4.5],  // #237
  ['warn ink text on open-btn hover', '--warn-accent-ink',    '--warn-open-bg',        '--surface-card', 4.5],  // #237
  // #237 light fixes. INFO = light-only: dark was not changed here (dark 4.48 on the delete hover tint, pre-existing;
  // the practice footer sits in the always-light modal island, so dark faint-on-card never renders).
  ['danger text on hover tint',       '--danger',             '--danger-tint',         '--surface-menu', 4.5, true],
  ['faint text on card/white (practice footer)', '--text-faint', '--surface-card',     null,             4.5, true],
  // #238 failure toast: fixed orange in both themes. Retry label on its fill, and the fill as a control against the toast (UI 3.0)
  ['toast Retry text on its fill',    '--toast-retry-text',   '--toast-retry-bg',      null,             4.5],
  ['toast Retry text on its hover',   '--toast-retry-text',   '--toast-retry-bg-hover', null,            4.5],
  ['toast Retry fill vs toast (UI)',  '--toast-retry-bg',     '--toast-warn-bg',       null,             3.0],
  ['toast Retry hover fill vs toast (UI)', '--toast-retry-bg-hover', '--toast-warn-bg', null,            3.0],
  ['warn banner text',              '--warn-banner-text',   '--warn-banner-bg',      '--surface-card', 4.5],
  ['tooltip text',                    '--tooltip-text',       '--tooltip-bg',          null,             4.5],
  ['inactive pill label',             '--pill-inactive-text', '--pill-inactive',       null,             4.5],
  ['inactive pill label (hover)',     '--pill-inactive-text', '--pill-inactive-hover', null,             4.5],
  ['active pill label (gold)',        '--pill-active-text',   '--pill-active',          null,             4.5],
  ['pill count text',                 '--pill-inactive-text', '--pill-count-bg',       null,             4.5],
  ['add-board glyph on page',         '--pill-add-text',      '--bg-page',             null,             3.0],
  ['add-board glyph on page (hover, #237)', '--pill-add-hover',  '--bg-page',             null,             3.0],
  ['card-header icon glyph',         '--iconbtn-ink',        '--iconbtn-bg',          '--surface-raised', 3.0],
  ['ghost-card label on page',        '--ghost-label',        '--bg-page',             null,             4.5],
  // --- #236 card ⋯ menu row hover: fill + frame, both must read against the menu surface ---
  ['menu hover fill vs menu surface', '--menu-hover-bg',      '--surface-menu',        null,             1.3],
  ['menu hover frame vs menu surface (UI)', '--menu-hover-frame', '--surface-menu',    null,             3.0],
  ['menu text on hover fill',         '--text-primary',       '--menu-hover-bg',       '--surface-menu', 4.5],
  // --- #105 first-run example board (cards sit on the content well) ---
  ['example card text on content well', '--text-heading',   '--surface-content',     null,             4.5],
  ['example gain on content well',    '--example-up',         '--surface-content',     null,             4.5],
  ['example loss on content well',    '--example-down',       '--surface-content',     null,             4.5],
  ['example card time on header',     '--text-muted',         '--surface-raised',      null,             4.5],
  ['example badge label',             '--example-badge-text', '--danger-tint',         '--bg-page',      4.5],
  // --- C-lite: captured content goes dark ---
  ['captured text on content well',   '--text-on-content',    '--surface-content',     null,             4.5],
  ['captured link on content well',   '--link-content',       '--surface-content',     null,             4.5],
  // INFO only: link-vs-body colour contrast is intentionally low; WCAG 1.4.1 is met
  // by `text-decoration: underline` on `.component-content a` in the dark blocks.
  ['captured link vs body text (info — underline carries 1.4.1)', '--link-content', '--text-on-content', null, 3.0, true],
];

// ---------- 2. SEPARATION pairs (elevation ladder) ----------
// [label, surfA, surfB, borderToken|null, floor]  — ratio(surfA,surfB) should be
// >= floor, OR the border between them should clear 1.5:1 against the lighter side.
const SEP = [
  ['active card vs board',         '--surface-card',        '--bg-page',        '--border-card',   1.30],
  ['header strip vs card body',    '--surface-raised',      '--surface-card',   null,              1.25],
  ['paused card vs board',         '--paused-shell',        '--bg-page',        '--border-card',   1.10],
  ['paused card vs active card',   '--surface-card',        '--paused-shell',   null,              1.15],
  ['content well vs card body',    '--surface-content',     '--surface-card',   null,              1.12],
  ['content well vs board',        '--surface-content',     '--bg-page',        null,              1.00],
  ['media well vs content well',   '--media-well',          '--surface-content', null,             3.00],
  ['card border vs board',         '--border-card',         '--bg-page',        null,              1.40],
];

function resolve(tok, tokens) {
  try { return parse(tokens[tok] != null ? tokens[tok] : LIGHT[tok], { ...LIGHT, ...tokens }); }
  catch (e) { return null; }
}

function runText(name, tokens) {
  console.log('\n=== TEXT / UI — ' + name + ' ===');
  let fail = 0, missing = 0;
  for (const [label, fgT, bgT, baseT, target, info] of TEXT) {
    const base = baseT ? resolve(baseT, tokens) : [255, 255, 255, 1];
    let bg = resolve(bgT, tokens), fg = resolve(fgT, tokens);
    if (!bg || !fg || !base) { console.log('   --   n/a    (token not wired)  ' + label); missing++; continue; }
    if (bg[3] < 1) bg = over(bg, base);
    if (fg[3] < 1) fg = over(fg, bg);
    const r = ratio(fg, bg), pass = r >= target;
    if (!pass && !info) fail++;
    console.log('  ' + target.toFixed(1) + '  ' + r.toFixed(2).padStart(6) + '  ' +
      (info ? 'INFO' : pass ? ' ok ' : r >= target - 0.7 ? 'NEAR' : 'FAIL') + '   ' + label);
  }
  console.log('  -> ' + fail + ' fail, ' + missing + ' not yet wired');
  return fail;
}

function runSep(name, tokens) {
  console.log('\n=== SEPARATION (elevation ladder) — ' + name + ' ===');
  // print the ladder
  const ladder = ['--bg-page', '--paused-shell', '--surface-content', '--surface-card', '--surface-raised', '--media-well']
    .map(t => { const c = resolve(t, tokens); return c ? [t, lum(c)] : null; }).filter(Boolean)
    .sort((a, b) => a[1] - b[1]);
  console.log('  ladder (dark→light):  ' + ladder.map(([t, l]) => t.replace('--', '') + ' ' + l.toFixed(3)).join('  <  '));
  let fail = 0, missing = 0;
  for (const [label, aT, bT, borderT, floor] of SEP) {
    const a = resolve(aT, tokens), b = resolve(bT, tokens);
    if (!a || !b) { console.log('   --    n/a   (token not wired)   ' + label); missing++; continue; }
    const r = ratio(a, b);
    let ok = r >= floor, rescue = '';
    if (!ok && borderT) {
      const bd = resolve(borderT, tokens);
      if (bd) {
        const bdc = bd[3] < 1 ? over(bd, lum(a) > lum(b) ? a : b) : bd;
        const br = ratio(bdc, lum(a) > lum(b) ? a : b);
        if (br >= 1.5) { ok = true; rescue = ' (border ' + br.toFixed(2) + ':1 rescues)'; }
      }
    }
    if (!ok) fail++;
    console.log('  ' + floor.toFixed(2) + '  ' + r.toFixed(2).padStart(6) + '  ' +
      (ok ? ' ok ' : 'THIN') + '   ' + label + rescue);
  }
  console.log('  -> ' + fail + ' too thin, ' + missing + ' not yet wired');
  return fail;
}

// ---------- 3. MENU HOVER RULES (#239 tripwire) ----------
// Reads every menu/dropdown/picker `:hover` rule out of the stylesheet and checks that a token-coloured
// background is visibly different from BOTH surfaces a menu can sit on. #236/#237/#239 were each the same
// defect (hover token ~= menu surface) found by eye per menu; this makes the next one fail here instead.
// Only the --danger-tint fill is exempt (a state colour; the row also gets a danger frame). A non-token background is
// printed as a skip; a token that does not resolve is a failure.
const MENU_HOVER_FLOOR = 1.3;
function runMenuHover(name, tokens) {
  console.log('\n=== MENU HOVER RULES — ' + name + ' (each token fill vs --surface-menu and --surface-card, floor ' + MENU_HOVER_FLOOR + ') ===');
  const css = html.slice(html.indexOf('<style'), html.indexOf('</style>'));
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  let fail = 0, seen = 0;
  for (const [, selRaw, body] of rules) {
    const sel = selRaw.replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/\s+/g, ' ');
    // menu-btn = the ☰ trigger sitting on the purple header, not a row inside a menu
    if (!/:hover\b/.test(sel) || !/menu|dropdown|picker/.test(sel) || /menu-btn\b/.test(sel)) continue;
    const bg = body.match(/(?:^|[\s;])background(?:-color)?\s*:\s*([^;]+)/);
    if (!bg) continue;
    const value = bg[1].replace(/!important/i, '').trim();
    const isVar = value.startsWith('var(')
    const token = isVar ? value.slice(4).split(/[,)]/)[0].trim() : null;
    if (token === '--danger-tint') continue; // state colour; the row also gets a danger frame
    let fill = null;
    try { fill = isVar ? resolve(token, tokens) : parse(value, tokens); } catch (e) { /* keyword such as none / transparent */ }
    if (!fill && !isVar) { console.log('  --   skip   no colour to measure  ' + sel + '  ' + value); continue; }
    seen++;
    if (!fill) { fail++; console.log('  !! FAIL   token not resolvable (browser would drop it)  ' + sel + '  ' + value); continue; }
    const m = [null, value];
    const worst = Math.min(...['--surface-menu', '--surface-card'].map(s => {
      const base = resolve(s, tokens);
      return ratio(fill[3] < 1 ? over(fill, base) : fill, base);
    }));
    const ok = worst >= MENU_HOVER_FLOOR;
    if (!ok) fail++;
    console.log('  ' + MENU_HOVER_FLOOR.toFixed(1) + '  ' + worst.toFixed(2).padStart(6) + '  ' + (ok ? ' ok ' : 'FAIL') + '   ' + sel + '  ' + m[1]);
  }
  if (!seen) { console.log('  !! no menu :hover rules found — the scan itself is broken'); fail++; }
  console.log('  -> ' + fail + ' fail over ' + seen + ' rules');
  return fail;
}

const lf = runText('LIGHT', LIGHT);
let df = 0, ds = 0, mhl = 0, mhd = 0;
mhl = runMenuHover('LIGHT', LIGHT);
if (Object.keys(DARK).length) { df = runText('DARK', DARK); ds = runSep('DARK', DARK); mhd = runMenuHover('DARK', DARK); }
console.log('\nTOTAL — light text/ui fail: ' + lf + '   dark text/ui fail: ' + df +
  '   dark separation thin: ' + ds + '   dark-block drift: ' + SYNC_FAIL + '   menu-hover thin: ' + (mhl + mhd));
process.exit(df + ds + SYNC_FAIL + mhl + mhd > 0 ? 1 : 0);
