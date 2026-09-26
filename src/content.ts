console.log("🚀 SpotBoard: Content Script Loaded");
import { cleanupDuplicates, tagSentimentData, isColumnSafeToTarget, applyExclusions, buildExclusionSignatures, normalizeSignatureText, effectiveSrcset } from './utils/dom-cleanup';
import { cloneWithShadow, promoteLazyImages, promoteBackgroundImages, classifyImages } from './utils/dom-snapshot';
import { initOnboarding, advanceOnboardingCoach, getIsOnboardingMode, getIsPlaygroundPage } from './onboarding-coach';
import { fitSyncRecord, SAVE_TOO_BIG_MESSAGE, friendlySaveError } from './utils/exclusion-storage';
import { mergeRecapture } from './utils/recapture';

// Debug mode - set to true for detailed logging
const DEBUG = false;
const log = (...args: any[]) => DEBUG && console.log(...args);

// A fingerprint that is just a number/price/percent (leading or trailing symbol) is the
// tracked VALUE, not a stable identity — it can never re-match once the value moves (e.g.
// Kalshi odds "54%" -> "53%"). Shared with the same-named constant in refresh-engine.js
// (separate runtime, kept in sync manually — single regex, not worth a shared module).
// See LEARNINGS.md REF-16 / STUDY-kalshi-charts.md Phase 2 item 8.
const VOLATILE_FINGERPRINT_RE = /^[+-]?[$€£¢]?\s*[\d,]+(\.\d+)?\s*[%¢$]?\s*(k|m|b|pts?|p)?$/i;

/**
 * Structural-identity marker for the feed-rotation rescue (issue #77). Finds a capture-time
 * data-testid/data-test value inside the capture root, kept only if it's globally unique on
 * the whole page right now -- positive per-instance identity, not a generic class-name
 * convention (a class token can legitimately repeat across similar-but-different widgets,
 * e.g. a "related stories" rail reusing the same design-system prefix -- rejected from this
 * mechanism after a product-proxy objection during #77's design). Consumed at refresh time by
 * _structureMarkerMatches() in refresh-engine.js, scoped to the already-resolved refresh
 * candidate's own subtree, not a fresh page-wide search.
 */
function extractStructureMarker(root: Element): { attr: string; value: string } | null {
  // Breadth-first by depth, not document order: a shallow, deliberately-authored container id
  // represents the captured region far better than a deeply-nested leaf badge/button that only
  // happens to be unique right now (e.g. a single "Exclusive" article badge with a reused
  // data-testid, vs. the region's own container-level data-test one level below its wrapper --
  // live-reproduced on CNBC during #77's build: document-order search picked the badge). At each
  // depth level, data-testid is checked before data-test on the same element.
  let level: Element[] = [root];
  while (level.length) {
    // Attr tier is the outer loop so, at a given depth, every data-testid candidate is checked
    // before any data-test candidate -- an explicit, deterministic tie-break across different
    // elements at the same depth, not just within one element.
    for (const attr of ['data-testid', 'data-test']) {
      for (const el of level) {
        const value = el.getAttribute(attr);
        if (!value) continue;
        try {
          if (document.querySelectorAll(`[${attr}="${CSS.escape(value)}"]`).length === 1) {
            return { attr, value };
          }
        } catch (_) {
          // Malformed attribute value for a CSS selector -- skip this candidate, keep looking.
        }
      }
    }
    level = level.flatMap(el => Array.from(el.children));
  }
  return null;
}

let isCapturing = false;
// #52: set only when this tab was opened by a card's "Re-capture" button. While set, a save
// replaces that card in place instead of creating a new one. Cleared on every cancel path.
let recaptureCtx: { cardId: string; sessionId: string; label: string } | null = null;
let lockedElement: HTMLElement | null = null; // Track element waiting for confirmation

// #42: capture-root refinement. Between the first click and the previewer, the clicked element is
// only a *proposed* capture root the user can Grow/Shrink (or replace by clicking elsewhere).
// `lockedElement` deliberately stays null for this whole stage -- it is the signal every hover/
// click handler uses for "exclusion mode", which must not start until Continue.
type RefineState = {
  chain: HTMLElement[]; // [initial click target, ...grown ancestors]; index points at the current root
  index: number;
  clickTarget: HTMLElement; // raw element the user clicked, kept for name/fingerprint narrowing
  widened: boolean; // click landed on an empty overlay and was already widened (#81)
  startedAt: number;
  growCount: number; // accepted Grow presses, cumulative across re-selects
  reselects: number;
  path: string[]; // every element visited, in order, e.g. ["div:100x50", "ul:320x560"]
};
let refineState: RefineState | null = null;
let excludedElements: HTMLElement[] = []; // Track child elements marked for exclusion (red)
let previewDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// #13: updatePreview() is a separate function from showCaptureConfirmation() and needs to
// reach the confirmation modal's iframe -- document.querySelector can't see into a shadow
// root, so it needs its own reference (mirrors onboarding-coach.ts's _coachShadow pattern).
let _confirmationShadow: ShadowRoot | null = null;

// Element handleHover last showed the dashed-red exclusion preview on. A live-updating page
// (e.g. Kalshi's real-time odds table) can reflow between the user hovering a child (correct
// preview shown) and the click landing -- event.target at click time then reflects post-reflow
// content, which can be a different element than what was previewed (issue #1: excluded
// Kalshi's "Chance" header instead of the Yes/No button the user actually hovered/clicked).
// handleClick only honors an exclusion when its target matches this -- a mismatch is direct
// evidence content shifted mid-click, so it fails safe (excludes nothing) rather than trusting
// a possibly-stale target.
let hoveredExclusionCandidate: HTMLElement | null = null;

// The sibling group (including hoveredExclusionCandidate) last previewed for a Shift+hover
// bulk exclusion. handleClick recomputes the group fresh at click time and requires it to
// exactly match this before committing a bulk exclusion -- extends the same fail-safe
// reasoning as hoveredExclusionCandidate (issue #1) to a set instead of a single element.
let hoveredSimilarGroup: HTMLElement[] = [];

// #61: Grow/Shrink chain state for the single currently-active exclusion (the one most
// recently toggled). `chain[0]` is always the originally-clicked element and is never
// discarded, so Shrink can always get back to it exactly. There is deliberately no
// reactivation of an older, already-committed exclusion in v1 (considered and rejected --
// see #61's decision log: not a proven-common-enough need to justify edit-history UI).
// Excluding a new element replaces this outright, which is exactly "committing" the old one.
type ExclusionChainState = { chain: HTMLElement[]; activeIndex: number };
let activeExclusionChain: ExclusionChainState | null = null;

// Test-only introspection (jsdom unit tests -- see tests/grow-shrink-exclusion.test.js):
// production code never reads state through these, only through the module-scoped variables.
export function __getActiveExclusionChainForTest(): { chainLength: number; activeIndex: number; activeElement: HTMLElement } | null {
  if (!activeExclusionChain) return null;
  return {
    chainLength: activeExclusionChain.chain.length,
    activeIndex: activeExclusionChain.activeIndex,
    activeElement: activeExclusionChain.chain[activeExclusionChain.activeIndex],
  };
}
export function __getExcludedElementsForTest(): HTMLElement[] {
  return excludedElements;
}

// Direct siblings sharing the same parent, tag, and exact className as `element` (element
// included). Exact class-signature match by design -- see issue #34 decision log: loose
// tag/class-only matching has a documented over-match failure mode in other tools' element
// pickers, so a BEM-modifier variant (e.g. "item item--featured") intentionally falls
// outside the group rather than risk excluding something the user didn't mean to.
function getSimilarSiblings(element: HTMLElement): HTMLElement[] {
  // Table-column exclusion (#62): a table cell's real "similar group" is its column, not
  // same-row siblings sharing a class -- on tables that style columns with a shared utility
  // class (e.g. a right-align class used by Temp/Precip/Wind-speed alike), same-row/class
  // matching used to group unrelated columns together instead of down one column. Checked
  // first, ahead of the generic same-parent+class fallback below.
  if (lockedElement) {
    const columnCells = getTableColumnCells(element, lockedElement);
    if (columnCells && columnCells.length > 1) return columnCells;
  }

  const parent = element.parentElement;
  if (!parent) return [element];
  const siblings = Array.from(parent.children).filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement &&
      el.tagName === element.tagName &&
      el.className === element.className
  );
  if (siblings.length > 1) return siblings

  // Cross-parent fallback (#87): repeated per-article furniture (byline, date, headline) sits
  // one-per-article in separate parents, so the same-parent group above is a group of 1.
  // Widen to the captured container only (never the whole page), still exact-match -- no
  // text/regex signals (#63). See getCrossParentGroup for the two signals.
  if (lockedElement) {
    const group = getCrossParentGroup(element, lockedElement)
    if (group.length > 1) return group
  }
  return siblings
}

// Cross-parent matching inside the locked section (#87). Two narrow signals only:
//  1. <time>: a semantic "this is a date" tag -- every <time> in the section.
//  2. Nearest classed anchor: the element itself (or, if classless, the nearest ancestor within
//     3 levels that has a class) matched by tag + EXACT className, then the same child-index path
//     down to the clicked element. The parent's class is deliberately NOT required (sites
//     vary it per article); exact class on the anchor is the fail-safe.
// Anything with no classed anchor, or a group of 1, returns [element].
function getCrossParentGroup(element: HTMLElement, locked: HTMLElement): HTMLElement[] {
  if (!locked.contains(element) || element === locked) return [element]

  if (element.tagName === 'TIME') {
    const times = Array.from(locked.querySelectorAll<HTMLElement>('time'))
    return times.length > 1 && times.includes(element) ? times : [element]
  }

  const indexPath: number[] = []
  let anchor: HTMLElement | null = element
  for (let depth = 0; anchor && anchor !== locked && depth <= 3; depth++) {
    if (typeof anchor.className === 'string' && anchor.className.trim()) break
    const par: HTMLElement | null = anchor.parentElement
    if (!par) return [element]
    indexPath.unshift(Array.from(par.children).indexOf(anchor))
    anchor = par
  }
  if (indexPath.length > 3 || !anchor || anchor === locked || typeof anchor.className !== 'string' || !anchor.className.trim()) return [element]

  const matches: HTMLElement[] = []
  locked.querySelectorAll<HTMLElement>(anchor.tagName).forEach(candidate => {
    if (candidate.className !== anchor!.className) return
    let node: HTMLElement | undefined = candidate
    for (const idx of indexPath) {
      node = node?.children[idx] as HTMLElement | undefined
      if (!node) return
    }
    if (node && node.tagName === element.tagName) matches.push(node)
  })
  const outermost = matches.filter(el => !matches.some(other => other !== el && other.contains(el)))
  return outermost.length > 1 && outermost.includes(element) ? outermost : [element]
}

export function __getSimilarSiblingsForTest(element: HTMLElement, locked: HTMLElement): HTMLElement[] {
  const prev = lockedElement
  lockedElement = locked
  try {
    return getSimilarSiblings(element)
  } finally {
    lockedElement = prev
  }
}

// Initialize onboarding module — stores toggleCapture reference via dependency injection.
// toggleCapture is a hoisted function declaration, available here before its definition.
// It's only called later on user action, not during init.
initOnboarding({ toggleCapture });

// Auto-trigger capture mode when opened from the Interactive Directory
// Dashboard opens tabs with ?spotboard_capture=1 — this detects and acts on it.
const _captureParam = new URLSearchParams(window.location.search).get('spotboard_capture');
if (_captureParam === '1') {
  // Strip our param cleanly using URL object (safe for SPA routers)
  try {
    const _cleanUrl = new URL(window.location.href);
    _cleanUrl.searchParams.delete('spotboard_capture');
    history.replaceState(null, '', _cleanUrl.toString());
  } catch (e) {
    console.warn('[SpotBoard] Could not strip URL param:', e);
    // Non-fatal: crosshair still activates, param stays in URL but won't re-trigger
  }
  // Wait for DOM to be interactive before activating crosshair
  const _doCapture = () => setTimeout(() => toggleCapture(true), 800);
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    _doCapture();
  } else {
    window.addEventListener('DOMContentLoaded', _doCapture);
  }
}

// Pull model for capture auto-start (from guided site picker / practice pills)
// More reliable than ?spotboard_capture=1 param which SPAs can strip before document_idle
chrome.runtime.sendMessage({ type: 'CHECK_CAPTURE' }, (shouldCapture: boolean | { recapture: { cardId: string; sessionId: string; label: string } }) => {
  if (chrome.runtime.lastError) return;
  if (!shouldCapture) return;
  if (typeof shouldCapture === 'object' && shouldCapture.recapture) recaptureCtx = shouldCapture.recapture;
  const _doCapture = () => setTimeout(() => toggleCapture(true), 800);
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    _doCapture();
  } else {
    window.addEventListener('DOMContentLoaded', _doCapture);
  }
});

// Check if an ID looks auto-generated and should be avoided
function isAutoGeneratedId(id: string): boolean {
  if (!id) return false;
  
  // Patterns for auto-generated IDs:
  // - Starts with "yui_" (Yahoo UI framework)
  // - Contains long sequences of numbers (10+ digits, likely timestamps)
  // - Contains UUID patterns (hex-hex-hex-hex-hex)
  // - React/Vue generated IDs
  const patterns = [
    /^yui_/i,                    // Yahoo UI: yui_3_18_1_1_1764458743229_1180
    /\d{10,}/,                   // Long numbers (timestamps): id_1234567890123
    /[a-f0-9]{8}-[a-f0-9]{4}/i,  // UUID-like: 12345678-1234-...
    /^react-/i,                  // React: react-select-2-option-1
    /^__BVID__/i,                // Vue Bootstrap
    /^ember\d+/i                 // Ember: ember123
  ];
  
  return patterns.some(pattern => pattern.test(id));
}

// Generate a specific CSS selector for an element
function generateSelector(element: HTMLElement): string {
  log('🎯 Starting selector generation for:', element.tagName, element.className);
  
  // Priority 1: ID (only if NOT auto-generated)
  if (element.id && !isAutoGeneratedId(element.id)) {
    log('✅ Found stable ID selector:', `#${element.id}`);
    return `#${element.id}`;
  } else if (element.id && isAutoGeneratedId(element.id)) {
    log('⚠️ Skipping auto-generated ID:', element.id);
  }
  
  // Build base selector: tag + classes + data attributes
  let baseSelector = buildBaseSelector(element);
  log('📋 Base selector:', baseSelector);
  
  // Check if selector is unique on the page
  const matches = document.querySelectorAll(baseSelector);
  log(`🔍 Base selector matches ${matches.length} elements`);
  
  if (matches.length === 1) {
    log('🎯 Generated unique selector:', baseSelector);
    return baseSelector;
  }
  
  log(`⚠️ Selector "${baseSelector}" matches ${matches.length} elements, adding context...`);
  
  // 🆕 TABLE CELL DETECTION: Prepend column selector to make it unique
  const cellElement = element.closest('td, th') as HTMLTableCellElement | null;
  if (cellElement) {
    const columnIndex = cellElement.cellIndex; // 0-based
    if (columnIndex !== undefined && columnIndex >= 0) {
      const cellTag = cellElement.tagName.toLowerCase();
      // Check if element is direct child of cell or nested
      const isDirectChild = element.parentElement === cellElement;
      const combinator = isDirectChild ? ' > ' : ' ';
      const columnSelector = `${cellTag}:nth-child(${columnIndex + 1})${combinator}${baseSelector}`;
      
      const columnMatches = document.querySelectorAll(columnSelector);
      log(`🔍 Table column selector matches ${columnMatches.length} elements`);
      
      if (columnMatches.length <= matches.length) {
        log('🎯 Generated unique selector with column context:', columnSelector);
        return columnSelector;
      }
    }
  }
  
  // For very generic selectors, go straight to path-based approach
  if (baseSelector === element.tagName.toLowerCase() && matches.length > 50) {
    log('🔤 Element is too generic, skipping to path-based selector...');
  }
  
  // Not unique - try adding nth-of-type
  // IMPORTANT: :nth-of-type counts by TAG TYPE only (not tag+class), so we must
  // count siblings by tag to get the correct index. Counting by tag.class would give
  // wrong indices (e.g. 3rd .brand section ≠ 3rd section — they diverge when non-.brand
  // sections exist between .brand ones).
  const parent = element.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children).filter(
      child => child.tagName === element.tagName // :nth-of-type counts by tag only
    );
    const index = siblings.indexOf(element) + 1;
    
    if (index > 0) {
      const nthSelector = `${baseSelector}:nth-of-type(${index})`;
      const nthMatches = document.querySelectorAll(nthSelector);
      log(`🔍 nth-of-type selector matches ${nthMatches.length} elements`);
      
      if (nthMatches.length === 1) {
        log('🎯 Generated unique selector with nth-of-type:', nthSelector);
        return nthSelector;
      }
    }
  }
  
  // Still not unique - build path from unique ancestor
  const pathSelector = buildPathFromUniqueAncestor(element, baseSelector);
  if (pathSelector) {
    log('🎯 Generated unique selector with ancestor path:', pathSelector);
    return pathSelector;
  }
  
  // 🚨 CRITICAL: Never return ultra-generic selectors (bare tag names)
  // These will match TOO MANY elements during refresh and cause content removal
  const isBareTag = /^[a-z]+$/i.test(baseSelector); // Just a tag name like "div", "span", "a"
  
  if (isBareTag) {
    log('🚨 BLOCKING ultra-generic selector:', baseSelector);
    // Force path-based approach by adding parent context
    const parent = element.parentElement;
    if (parent) {
      const parentBase = buildBaseSelector(parent);
      const contextSelector = `${parentBase} > ${baseSelector}`;
      log('✅ Adding parent context:', contextSelector);
      return contextSelector;
    }
  }
  
  // Last resort: return base selector (fingerprint will catch mismatches)
  log('⚠️ Could not make selector unique, using:', baseSelector);
  return baseSelector;
}

/**
 * Generate a selector for an EXCLUDED element -- distinct from generateSelector's job of
 * finding the card container. generateSelector's documented last resort is "return the base
 * selector (fingerprint will catch mismatches)" -- true for the card itself (it has a
 * headingFingerprint tiebreaker at refresh time), but FALSE for exclusions, which have no
 * fingerprint and are applied via querySelectorAll(selector) -> remove ALL matches.
 *
 * Reproduced bug: clicking 2 elements to exclude (Yes/No buttons) generated the selector
 * "div.flex.gap-1.items-center", which matched 27 elements inside the captured card
 * (including every percentage cell and the "Chance" header) -- refresh deleted all of them.
 *
 * This wrapper verifies uniqueness WITHIN the capture root (not the whole page -- an
 * exclusion selector is re-applied against the card's own HTML at refresh time, so that's
 * the only scope that matters). If generateSelector's result isn't unique in that scope, it
 * escalates to an ancestor path, then to a positional (:nth-child chain) fallback -- never
 * silently stores a selector that over-matches.
 *
 * @param el - the element the user clicked to exclude
 * @param root - the capture root (the element being captured as a card)
 * @returns a selector that matches exactly one element within `root`
 */
function generateExclusionSelector(el: HTMLElement, root: HTMLElement): string {
  // #71: prefer a selector unique WITHIN root over generateSelector()'s page-global result.
  // generateSelector() checks uniqueness against the WHOLE PAGE and, when a class isn't
  // page-unique (e.g. sibling sections sharing one CSS-module heading class -- theverge.com's
  // "Most Popular"/"Most Discussed" both use h2.pnbklw1), escalates to a page-anchored
  // ancestor-path selector like "section.foo:nth-of-type(3) > h2.bar". That candidate then
  // trivially passes the root-uniqueness check below too (globally unique implies root-unique),
  // so it used to get accepted here -- but refresh only ever hands applyExclusions a
  // single-element FRAGMENT (just the extracted section, no page/sibling context), which has no
  // ":nth-of-type(3)" sibling position to match, and that same ":nth-of-type(3)" also breaks
  // applyExclusions' scopedFor() prefix-rewrite (it sits between the class chain and the child
  // combinator, so the selector no longer starts with `component.selector` literally) -- so the
  // stored selector matched 0 elements on EVERY refresh and the exclusion never re-applied.
  // Confirmed live: excluding a section's own heading came back after every real refresh.
  const rootScopedBase = buildBaseSelector(el);
  if (!/^[a-z]+$/i.test(rootScopedBase.trim())) {
    try {
      if (root.querySelectorAll(rootScopedBase).length === 1) {
        return rootScopedBase;
      }
    } catch (e) {
      log('⚠️ Exclusion base selector invalid, escalating:', rootScopedBase, e);
    }
  }

  const candidate = generateSelector(el);

  try {
    if (root.querySelectorAll(candidate).length === 1) {
      return candidate;
    }
  } catch (e) {
    log('⚠️ Exclusion candidate selector invalid, escalating:', candidate, e);
  }

  // Table-column exclusion (#67): a <td>/<th> whose class selector isn't unique within
  // root is usually one cell of a repeating column -- every other row's cell shares the
  // same class. The old fallback here was an absolute nth-child path anchored through the
  // element's <tbody>, which some sites (yr.no's hourly table) restructure over time --
  // pruning past-hour <tbody> row-groups shifts the remaining group's tbody position, so
  // the stored path stops matching on refresh and the excluded column silently reappears
  // (the refresh-time safe-fail leaves unmatched content visible rather than guessing).
  // A selector scoped to the TABLE + the cell's column index has no tbody/row dependency
  // at all, so it survives that kind of pruning. Only used when the table itself can be
  // identified uniquely within root and no colspan is present anywhere in it (colspans
  // decouple DOM child-index from visual column, which would skew nth-child alignment) --
  // otherwise falls through to the ancestor/positional path unchanged.
  const tableColumnSelector = buildTableColumnSelector(el, root);
  if (tableColumnSelector) {
    try {
      if (root.querySelectorAll(tableColumnSelector).length >= 1) {
        log('🎯 Exclusion selector using table-column scoping:', tableColumnSelector);
        return tableColumnSelector;
      }
    } catch (e) {
      log('⚠️ Table-column exclusion selector invalid, escalating:', tableColumnSelector, e);
    }
  }

  // Escalate: unique ancestor path (same mechanism generateSelector itself uses)
  const baseSelector = buildBaseSelector(el);
  const pathSelector = buildPathFromUniqueAncestor(el, baseSelector);
  if (pathSelector) {
    try {
      if (root.querySelectorAll(pathSelector).length === 1) {
        log('🎯 Exclusion selector escalated to ancestor path:', pathSelector);
        return pathSelector;
      }
    } catch (e) {
      // fall through to positional
    }
  }

  // Last resort: positional path (:nth-child chain) from the capture root. Always unique
  // by construction -- never generalises beyond the single element the user clicked.
  const positional = buildPositionalPath(el, root);
  log('🎯 Exclusion selector using positional fallback:', positional);
  return positional;
}

/** Find every cell in `el`'s column (across all rows of its table, header row included), or
 *  null if the table can't be safely column-scoped. Requirements, all checked before
 *  returning:
 *   1. `el` sits inside a <table> that is itself within `root`.
 *   2. That table's base selector (tag + up to 3 classes, from buildBaseSelector) resolves
 *      to exactly ONE table within root -- otherwise a generated selector could reach into
 *      an unrelated table sharing the same class. `root` itself counts as a match here (not
 *      just its descendants) -- a user capturing the table element directly as the capture
 *      root is a normal, expected click target, not an edge case to special-case around.
 *   3. The table has no `colspan` attribute anywhere -- a colspan on an earlier cell in a
 *      row shifts that row's DOM child-index out of alignment with the visual column, and
 *      verifying per-row alignment in that case is out of scope for this narrow fix.
 *   4. Every row has the same cell count -- a shorter/longer row (footer, summary, divider)
 *      would otherwise silently misalign column index for that row.
 *  Column index is 1-based among `el`'s row siblings (DOM position, safe once colspan-free).
 *  Matches any element at that column index regardless of tag (<td> or <th> alike) -- a
 *  column's header cell is part of "the column" as far as bulk-selecting it goes, even
 *  though it's the only <th> in its own row and so never groups with itself alone.
 *  Shared by `buildTableColumnSelector` (the stored, refresh-surviving selector -- #67) and
 *  the interactive Shift+hover/Shift+click grouping (#62) -- same guards, same column, one
 *  definition.
 */
export function getTableColumnCells(el: HTMLElement, root: HTMLElement): HTMLElement[] | null {
  // Real cell markup is rarely a bare <td>text</td> -- sites commonly wrap the value in
  // several layers of <span> for styling (yr.no: <td><span class="cell-content"><span>
  // <span class="text-4">...). A real click almost always lands on one of those inner spans,
  // never the <td> itself, so `row.children` (which are only the <td>/<th> elements) would
  // never contain the raw clicked node. Resolve up to the containing cell first -- whatever
  // was actually clicked inside a cell still means "this cell/column", regardless of markup
  // depth (field report, 14 Sep 2026: synthetic tests that clicked the <td> directly worked,
  // but nothing a real mouse could reach ever did).
  const cell = el.closest('td, th');
  if (!cell || !(cell instanceof HTMLElement)) return null;

  const table = cell.closest('table');
  if (!table || !root.contains(table)) return null;

  const row = cell.closest('tr');
  if (!row || !table.contains(row)) return null;

  const colIndex = Array.from(row.children).indexOf(cell);
  if (colIndex < 0) return null;

  // See isColumnSafeToTarget (dom-cleanup.ts) for the guard details -- shared with the
  // refresh-time trust check so the two can't silently diverge (#74).
  if (!(table instanceof HTMLElement) || !isColumnSafeToTarget(table, colIndex)) return null;

  const tableBase = buildBaseSelector(table);
  if (!tableBase.includes('.')) return null; // no class -- can't trust uniqueness by tag alone
  try {
    const matchCount = root.querySelectorAll(tableBase).length + (root.matches(tableBase) ? 1 : 0);
    if (matchCount !== 1) return null;
  } catch (e) {
    return null;
  }

  const rows = Array.from(table.querySelectorAll('tr'));
  const cells = rows
    .map(r => r.children[colIndex])
    .filter((c): c is HTMLElement => c instanceof HTMLElement);
  return cells.length > 0 ? cells : null;
}

/** Build a table-column-scoped exclusion selector for `el` (anywhere inside a <td>/<th>), or
 *  null if the table can't be safely column-scoped -- see `getTableColumnCells` for the
 *  guards, including the resolve-up-to-the-containing-cell step this shares with it. */
function buildTableColumnSelector(el: HTMLElement, root: HTMLElement): string | null {
  if (!getTableColumnCells(el, root)) return null;

  const cell = el.closest('td, th')!;
  const table = cell.closest('table')!;
  const row = cell.closest('tr')!;
  const tableBase = buildBaseSelector(table);
  const colIndex = Array.from(row.children).indexOf(cell) + 1;

  return `${tableBase} tr > ${cell.tagName.toLowerCase()}:nth-child(${colIndex})`;
}

/** Build a :nth-child chain from `root` down to `el`. Always uniquely identifies `el`
 *  within `root`'s subtree, at the cost of brittleness to markup changes (acceptable for
 *  exclusions -- a stale positional exclusion just leaves extra content visible, which is
 *  a far safer failure mode than an over-broad class selector deleting real content). */
function buildPositionalPath(el: HTMLElement, root: HTMLElement): string {
  const parts: string[] = [];
  let current: HTMLElement | null = el;
  while (current && current !== root) {
    const parent: HTMLElement | null = current.parentElement;
    if (!parent) break;
    const index = Array.from(parent.children).indexOf(current) + 1;
    parts.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
    current = parent;
  }
  return parts.join(' > ');
}

// Helper: Escape special characters in CSS class names (for Tailwind etc.)
function escapeCSSClass(className: string): string {
  // Escape special characters that are invalid in CSS selectors
  // Common in Tailwind: : / [ ] ( ) @ ! # $ % ^ & * + = , . < > ? ~ 
  return className
    .replace(/:/g, '\\:')   // xl:mt-0 -> xl\:mt-0
    .replace(/\//g, '\\/')  // w-3/12 -> w-3\/12
    .replace(/\[/g, '\\[')  // [&_svg] -> \[&_svg\]
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\./g, '\\.')  // Important: escape dots in class names
    .replace(/#/g, '\\#')
    .replace(/!/g, '\\!')
    .replace(/@/g, '\\@')
    .replace(/\$/g, '\\$')
    .replace(/%/g, '\\%')
    .replace(/\^/g, '\\^')
    .replace(/&/g, '\\&')
    .replace(/\*/g, '\\*')
    .replace(/\+/g, '\\+')
    .replace(/=/g, '\\=')
    .replace(/,/g, '\\,')
    .replace(/</g, '\\<')
    .replace(/>/g, '\\>')
    .replace(/\?/g, '\\?')
    .replace(/~/g, '\\~');
}

// Helper: Build base selector (tag + classes + data attrs)
function buildBaseSelector(element: HTMLElement): string {
  let selector = element.tagName.toLowerCase();
  
  // Add classes (max 3 to avoid overly specific selectors)
  if (element.classList.length > 0) {
    const classes = Array.from(element.classList)
      .filter(c => {
        // Skip transient state classes added by JS at runtime — absent in server/fetched HTML
        if (c.includes('hover') || c.includes('active')) return false;
        // Owl Carousel runtime state (owl-loaded, owl-drag added after init)
        if (c === 'owl-loaded' || c === 'owl-drag' || c === 'owl-grabbing' || c === 'owl-grab') return false;
        // Swiper runtime state
        if (c === 'swiper-initialized' || c.startsWith('swiper-pointer') || c === 'swiper-backface-hidden') return false;
        // Generic JS-injected state patterns
        if (/^is-(initialized|loaded|ready|dragging|draggable)$/.test(c)) return false;
        // Numbered IntersectionObserver classes — JS-injected, absent in server HTML (e.g. CNN zone-2-observer)
        if (/^\d+[-_]observer$/.test(c)) return false;
        return true;
      })
      .slice(0, 3)
      .map(c => escapeCSSClass(c)); // ✨ ESCAPE SPECIAL CHARACTERS
    if (classes.length > 0) {
      selector += '.' + classes.join('.');
    }
  }
  
  // Add key data attributes (very useful for modern sites like BBC)
  const usefulAttrs = ['data-testid', 'data-test', 'data-component', 'data-section', 'data-module', 'data-type', 'data-t', 'role'];
  for (const attr of usefulAttrs) {
    if (element.hasAttribute(attr)) {
      const value = element.getAttribute(attr);
      selector += `[${attr}="${value}"]`;
      break; // One data attr is usually enough
    }
  }
  
  return selector;
}

// Helper: Walk up DOM to find unique ancestor, build path
function buildPathFromUniqueAncestor(element: HTMLElement, baseSelector: string): string | null {
  let current = element.parentElement;
  const pathParts: string[] = [baseSelector];
  
  while (current && current.tagName !== 'BODY' && current.tagName !== 'HTML') {
    // Check if this ancestor has an ID
    if (current.id) {
      pathParts.unshift(`#${current.id}`);
      const fullPath = pathParts.join(' > ');
      if (document.querySelectorAll(fullPath).length === 1) {
        return fullPath;
      }
    }
    
    // Check for unique data attributes on ancestor
    const usefulAttrs = ['data-testid', 'data-component', 'data-section', 'data-module', 'data-type'];
    for (const attr of usefulAttrs) {
      if (current.hasAttribute(attr)) {
        const ancestorSelector = `${current.tagName.toLowerCase()}[${attr}="${current.getAttribute(attr)}"]`;
        pathParts.unshift(ancestorSelector);
        const fullPath = pathParts.join(' > ');
        if (document.querySelectorAll(fullPath).length === 1) {
          return fullPath;
        }
        pathParts.shift(); // Remove if not unique
      }
    }
    
    // Add parent to path and continue up
    const parentSelector = buildBaseSelector(current);

    // First try: ancestor with :nth-of-type to distinguish identical sibling sections
    // e.g. section.brand:nth-of-type(3) uniquely identifies "TRENDING NOW" among 3 section.brand siblings
    const grandparent = current.parentElement;
    if (grandparent) {
      const tagSiblings = Array.from(grandparent.children).filter(c => c.tagName === (current as HTMLElement).tagName);
      const tagIndex = tagSiblings.indexOf(current) + 1;
      if (tagIndex > 0 && tagSiblings.length > 1) {
        const nthAncestorSel = `${parentSelector}:nth-of-type(${tagIndex})`;
        pathParts.unshift(nthAncestorSel);
        const nthPath = pathParts.join(' > ');
        if (document.querySelectorAll(nthPath).length === 1) {
          return nthPath;
        }
        pathParts.shift(); // nth version didn't help, remove it
      }
    }

    pathParts.unshift(parentSelector);

    // Check if path is now unique
    const fullPath = pathParts.join(' > ');
    if (document.querySelectorAll(fullPath).length === 1) {
      return fullPath;
    }

    // Limit depth to avoid overly long selectors
    if (pathParts.length > 4) {
      break;
    }

    current = current.parentElement;
  }
  
  return null;
}

// 1. Hover Handler (dashed lime box in capture mode, dashed red in exclusion mode)
function handleHover(event: MouseEvent) {
  if (!isCapturing) return;
  
  const target = event.target as HTMLElement;
  
  // Ignore SpotBoard banner - never highlight it
  if (target.closest('[data-spotboard-ignore]')) {
    return;
  }

  // Ignore playground onboarding UI elements
  if (target.closest('[data-sb-no-capture]')) {
    return;
  }

  // FIRST: Don't touch modal at all - this must come before ANY other logic
  if (target.closest('#spotboard-capture-confirmation')) {
    return;
  }
  
    
  if (lockedElement) {

    // Keep green outline on locked element
    lockedElement.style.setProperty('outline', '5px solid #00ff00', 'important');

    // See past a content-less "stretched link" overlay to whatever it's covering (#81).
    const hitTarget = resolveExclusionHitTarget(event, lockedElement);
    const isValidExclusionTarget = lockedElement.contains(hitTarget) && hitTarget !== lockedElement;

    // Clear stale previews left by the PREVIOUS hover state whenever it no longer covers the
    // current hit target -- including the transition to an INVALID target (e.g. the mouse moved
    // onto the locked element's own padding, off every child). On a normal site this is mostly a
    // no-op -- a real per-element mouseout already clears the previous element via handleExit
    // before mouseover fires on the next one. But when the mouse never actually leaves a
    // content-less overlay (raw event.target stays the SAME element throughout), no such
    // mouseout ever fires for the elements underneath it, so these transitions would otherwise
    // leave stale dashed-red previews stuck indefinitely (#81 follow-up, caught by cold review
    // -- first for candidate-to-candidate transitions, then again for the valid-to-invalid one).
    if (hoveredSimilarGroup.length > 0 && !hoveredSimilarGroup.includes(hitTarget)) {
      hoveredSimilarGroup.forEach(el => {
        if (!excludedElements.includes(el)) {
          el.style.removeProperty('outline');
          el.style.removeProperty('background');
        }
      });
      hoveredSimilarGroup = [];
    }
    if (
      hoveredExclusionCandidate &&
      hoveredExclusionCandidate !== hitTarget &&
      !excludedElements.includes(hoveredExclusionCandidate)
    ) {
      hoveredExclusionCandidate.style.removeProperty('outline');
      hoveredExclusionCandidate.style.removeProperty('background');
      hoveredExclusionCandidate.style.removeProperty('cursor');
      hoveredExclusionCandidate = null;
    }

    // Check if hovering over a child of locked element (but not the locked element itself)
    if (isValidExclusionTarget) {
      // Check if this element is already excluded
      const isAlreadyExcluded = excludedElements.includes(hitTarget);

      if (isAlreadyExcluded) {
        // Keep the solid red styling for already-excluded elements
        hitTarget.style.setProperty('background', 'rgba(255, 0, 0, 0.3)', 'important');
        hitTarget.style.setProperty('outline', '2px solid #ff0000', 'important');
        hoveredExclusionCandidate = null;
      } else if (event.shiftKey && getSimilarSiblings(hitTarget).length > 1) {
        // Shift+hover: preview the whole similar-siblings group for bulk exclusion (#34)
        const group = getSimilarSiblings(hitTarget);
        group.forEach(el => {
          if (!excludedElements.includes(el)) {
            el.style.setProperty('outline', '2px dashed #ff0000', 'important');
            el.style.setProperty('background', 'transparent', 'important');
          }
        });
        hoveredExclusionCandidate = hitTarget;
        hoveredSimilarGroup = group;
      } else {
        // Show dashed red border preview for potential exclusion
        hitTarget.style.setProperty('outline', '2px dashed #ff0000', 'important');
        hitTarget.style.setProperty('background', 'transparent', 'important');
        hoveredExclusionCandidate = hitTarget;
      }
      hitTarget.style.cursor = 'pointer';
    }

    return;
  }
  
  // #42: never overpaint the proposed capture root's green outline with the hover box.
  if (refineState && target === refineState.chain[refineState.index]) return;

  // Normal capture mode: dashed lime-family outline for the element under the cursor. Red is
  // reserved for "excluded" (exclusion mode); solid bright green means "selected". #65a30d rather
  // than the banner lime because pale lime is invisible on a white page.
  target.style.setProperty('outline', '4px dashed #65a30d', 'important');
  target.style.cursor = 'crosshair';
  showHoverHint(target);

  event.stopPropagation();
}

// #106: testers knew where to click but not how much a click would capture, so they retried. A
// small label pinned to the hovered box's corner says the outline IS the capture and that it can be
// widened after the click (Grow, #42). Shadow-hosted + pointer-events none like the other overlays,
// so it never intercepts a hover/click and is never part of the captured page.
let _hoverHintShadow: ShadowRoot | null = null;

function showHoverHint(target: HTMLElement) {
  if (!_hoverHintShadow) {
    _hoverHintShadow = createOverlayShadowHost('spotboard-hover-hint').shadow;
    const chip = document.createElement('div');
    chip.id = 'sb-hover-hint';
    chip.style.cssText = `
      position: fixed !important; background: ${CAPTURE_LIME} !important; color: #000000 !important;
      padding: 5px 9px !important; border-radius: 6px !important; font-size: 12px !important;
      font-weight: 500 !important; line-height: 1.2 !important; white-space: nowrap !important;
      font-family: ${OVERLAY_FONT} !important; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25) !important;
      pointer-events: none !important; text-transform: none !important;
    `;
    // Pale wash over the hovered box so the region reads as one area even where the dashed border
    // blends into the page's own lines. An overlay, not a style on the page element, so nothing
    // can leak into captured HTML. Same green as the hover outline (#65a30d), ~5% opacity.
    const wash = document.createElement('div');
    wash.id = 'sb-hover-wash';
    wash.style.cssText = 'position: fixed !important; background: rgba(101, 163, 13, 0.05) !important; pointer-events: none !important;';
    _hoverHintShadow.append(wash, chip);
  }
  const chip = _hoverHintShadow.querySelector('#sb-hover-hint') as HTMLElement;
  chip.textContent = refineState
    ? 'Click to select this box instead'
    : 'Click to capture · Grow to expand';
  const rect = target.getBoundingClientRect();
  const wash = _hoverHintShadow.querySelector('#sb-hover-wash') as HTMLElement;
  wash.style.setProperty('top', `${rect.top}px`, 'important');
  wash.style.setProperty('left', `${rect.left}px`, 'important');
  wash.style.setProperty('width', `${rect.width}px`, 'important');
  wash.style.setProperty('height', `${rect.height}px`, 'important');
  // Sit just above the box; fall back to inside its top edge when there is no room above (it must
  // stay clear of the fixed top strip either way).
  const chipHeight = 26;
  const stripClearance = 44;
  const above = rect.top - chipHeight - 6;
  const top = above >= stripClearance ? above : Math.max(stripClearance, rect.top + 6);
  const left = Math.min(Math.max(rect.left, 8), Math.max(8, window.innerWidth - 340));
  chip.style.setProperty('top', `${Math.min(top, window.innerHeight - chipHeight - 8)}px`, 'important');
  chip.style.setProperty('left', `${left}px`, 'important');
  chip.style.setProperty('display', 'block', 'important');
}

function hideHoverHint() {
  document.getElementById('spotboard-hover-hint')?.remove();
  _hoverHintShadow = null;
}

// Once a card is locked, real hit-testing keeps resolving every point inside a content-less
// "stretched link" overlay to that SAME overlay element (see resolveExclusionHitTarget) --  and
// because the topmost hit target never actually changes as the mouse moves around inside it,
// 'mouseover'/'mouseout' never fire again to update the exclusion-hover preview, so a user can
// never get past the first element they hovered (#81's "exclusion appears non-functional").
// 'mousemove' fires on every internal move regardless of topmost-target churn, so drive the
// post-lock exclusion-hover preview from it instead -- bailing out immediately whenever nothing
// is locked, so this costs one cheap check per move outside the narrow window it exists for.
function handleExclusionHover(event: MouseEvent) {
  if (!isCapturing || !lockedElement) return;
  handleHover(event);
}

// 2. Exit Handler (Cleanup)
function handleExit(event: MouseEvent) {
  if (!isCapturing) return;
  const target = event.target as HTMLElement;
  
  // Ignore SpotBoard banner
  if (target.closest('[data-spotboard-ignore]')) {
    return;
  }
  
  // FIRST: Don't touch modal at all
  if (target.closest('#spotboard-capture-confirmation')) {
    return;
  }
  
  // If in exclusion mode (element locked)
  if (lockedElement) {
    // Don't clear styling from locked element or already-excluded elements
    if (target === lockedElement || excludedElements.includes(target)) {
      return;
    }
    // Clear preview styling from non-excluded children
    target.style.removeProperty('outline');
    target.style.removeProperty('background');
    if (target === hoveredExclusionCandidate) {
      hoveredExclusionCandidate = null;
      // Also clear any similar-siblings group previewed alongside this hover (#34)
      hoveredSimilarGroup.forEach(el => {
        if (el !== target && !excludedElements.includes(el)) {
          el.style.removeProperty('outline');
          el.style.removeProperty('background');
        }
      });
      hoveredSimilarGroup = [];
    }
    return;
  }
  
  // #42: leaving the proposed capture root must not wipe its green outline.
  if (refineState && target === refineState.chain[refineState.index]) return;

  // Normal mode: clear hover styling
  target.style.outline = '';
  hideHoverHint();
}

// 3. Click Handler (The Save)
// Sanitize captured HTML - remove capture artifacts
// Show styled notification modal instead of alert
// #13: puts an overlay in a closed Shadow DOM so no host-page stylesheet rule can select
// into it at all (rule matching never crosses a shadow boundary, unlike !important overrides
// which only work if every bled-through property was anticipated -- issue #13's history is
// repeated one-off patches for exactly that). The host itself is a bare anchor (no visible
// box), same pattern as onboarding-coach.ts's _coachHost -- everything visible/interactive is
// appended inside the returned ShadowRoot. Callers must set `pointer-events` explicitly on
// whatever they append (host sets it to none so a host-page rule matching div/* can't make
// the anchor itself clickable/hoverable; that value inherits into the shadow tree by default).
//
// The host also needs its OWN explicit z-index, not just its shadow content's. A descendant's
// z-index only creates a stacking context local to that descendant -- where the whole shadow
// subtree sits in the page's top-level stacking order is governed by the HOST's own z-index.
// Before this file used Shadow DOM, each overlay's top-level div (with z-index:2147483647) WAS
// the document.body child, so its z-index applied at the page's root stacking context directly.
// Missing this on the host renders it as an effective z-index:0 element -- any site element
// with a real z-index (a sticky header, an ad unit) can then paint over the whole overlay.
function createOverlayShadowHost(hostId: string): { host: HTMLElement; shadow: ShadowRoot } {
  const host = document.createElement('div');
  host.id = hostId;
  host.setAttribute('data-spotboard-ignore', 'true'); // prevent accidental capture
  host.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; ' +
    'z-index: 2147483647 !important; ' +
    'opacity: 1 !important; filter: none !important; float: none !important; pointer-events: none !important;';
  const shadow = host.attachShadow({ mode: 'closed' });
  document.body.appendChild(host);
  return { host, shadow };
}

function showStyledNotification(message: string, type: 'success' | 'error' = 'success', cardId?: string) {
  const { host, shadow } = createOverlayShadowHost('spotboard-notification-host');
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    background: rgba(0, 0, 0, 0.5) !important;
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
    z-index: 2147483647 !important;
    isolation: isolate !important;
    float: none !important;
    pointer-events: auto !important;
    text-transform: none !important;
  `;
  
  const modalContent = document.createElement('div');
  const bgColor = type === 'success' ? '#2d3748' : '#742a2a';
  modalContent.style.cssText = `
    background: ${bgColor} !important;
    color: white !important;
    padding: 24px !important;
    border-radius: 8px !important;
    max-width: 400px !important;
    width: 90% !important;
    text-align: center !important;
    position: relative !important;
    z-index: 2147483647 !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
    float: none !important;
  `;

  // 🎯 BATCH 1.5: Enhanced notification with "View on SpotBoard" button
  modalContent.innerHTML = `
    <div style="font-size: 16px; margin-bottom: 20px; line-height: 1.5; font-family: inherit; float: none !important;">
      ${message}
    </div>
    <div style="display: flex; gap: 12px; flex-direction: column; font-family: inherit; float: none !important; width: 100% !important;">
      <button id="viewBoardBtn" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 600; font-family: inherit; text-transform: none !important; float: none !important; box-sizing: border-box;">
        View on SpotBoard
      </button>
      <button id="closeNotification" style="width: 100%; padding: 12px; background: #4299e1; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 600; font-family: inherit; text-transform: none !important; float: none !important; box-sizing: border-box;">
        Close
      </button>
    </div>
  `;
  
  modal.appendChild(modalContent);
  shadow.appendChild(modal);

  // View Board button - smart navigation
  const viewBtn = modal.querySelector('#viewBoardBtn');
  if (viewBtn) {
    viewBtn.addEventListener('click', () => {
      // #19: hand the just-captured card's id to the dashboard so it can scroll to
      // + briefly highlight it. background.ts stashes it in chrome.storage.session
      // (a content script can't write session storage itself).
      chrome.runtime.sendMessage({ action: 'focusDashboard', highlightCardId: cardId }, (response) => {
        if (!response || !response.found) {
          // Dashboard not open, create new tab
          chrome.runtime.sendMessage({ action: 'openDashboard', highlightCardId: cardId });
        }
        // If found, background script already focused it (and reloads it when highlighting)
      });

      host.remove();
    });
  }

  // Close button
  const closeBtn = modal.querySelector('#closeNotification');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => host.remove());
  }
  modal.addEventListener('click', (e) => {
    if (e.target === modal) host.remove();
  });
}

// #9: pure predicate for the "capture looks empty" gate — extracted (unchanged logic) from an
// inline const in the save-path click handler so #40's jsdom harness can test it directly.
// A card is flagged empty when it has near-zero text AND no structural/media content, unless
// it's a legitimately tiny value (VOLATILE_FINGERPRINT_RE — e.g. a bare "54%") or a playground
// capture (which intentionally allows empty test captures).
export function looksEmptyCapture(html: string, isPlaygroundPage: boolean): boolean {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  const text = (body.textContent || '').trim();
  return !isPlaygroundPage
    && text.replace(/\s/g, '').length < 2
    && body.querySelectorAll('li, tr, article, img, svg').length === 0
    && !VOLATILE_FINGERPRINT_RE.test(text);
}

// #112: virtualised lists (react-virtuoso and similar) stand in for the rows that are not
// mounted with INLINE padding-top/padding-bottom on their item list -- thousands of px once the
// user has scrolled. Copied into a card or preview, that spacer pushes the mounted rows far below
// the fold and the card looks blank. Mechanical rule, no per-site logic: an inline padding on the
// capture root taller than the screen itself is a placeholder, not design padding. (Comparing it
// with the mounted content's height was tried and failed: mid-scroll the mounted rows can be
// taller than the spacer while the spacer still hides the first row.)
export function isSpacerPadding(paddingPx: number, viewportHeightPx: number): boolean {
  return viewportHeightPx > 0 && paddingPx > viewportHeightPx;
}

function stripSpacerPadding(live: HTMLElement, clone: HTMLElement) {
  const computed = window.getComputedStyle(live);
  (['paddingTop', 'paddingBottom'] as const).forEach(prop => {
    if (!live.style[prop]) return; // only inline padding (that is where virtualisers put spacers)
    if (isSpacerPadding(parseFloat(computed[prop]), window.innerHeight)) clone.style[prop] = '0px';
  });
}

// Exported (test-only reason): #40's jsdom harness bundles this file and needs to call
// sanitizeHTML directly to regression-test the exclusion-marking logic that caused #2 —
// no other caller outside this file exists or should exist.
export function sanitizeHTML(element: HTMLElement, excludedElements: HTMLElement[] = []): string {
  // 🎯 STEP 1: Mark hidden elements in ORIGINAL DOM (before cloning)
  // Check computed styles on live DOM elements, then mark them for removal
  const allOriginalElements = [element, ...Array.from(element.querySelectorAll('*'))];
  const markedElements: HTMLElement[] = [];
  
  // Get the captured element's bounding rect for relative position checking
  const containerRect = element.getBoundingClientRect();
  
  // Helper: Find nearest ancestor that clips content (carousel container)
  const findClippingAncestor = (el: HTMLElement): DOMRect => {
    let parent = el.parentElement;
    while (parent && parent !== element) {
      const style = window.getComputedStyle(parent);
      // Check all overflow values that cause clipping
      const overflowX = style.overflowX;
      const overflow = style.overflow;
      const isClipping = 
        overflow === 'hidden' || overflow === 'scroll' || overflow === 'auto' || overflow === 'clip' ||
        overflowX === 'hidden' || overflowX === 'scroll' || overflowX === 'auto' || overflowX === 'clip';
      
      if (isClipping) {
        const parentRect = parent.getBoundingClientRect();
        // Only use this container if it's narrower than our current reference (actual clipping)
        // and reasonably sized (not a tiny element)
        if (parentRect.width < containerRect.width && parentRect.width > 50) {
          return parentRect;
        }
      }
      parent = parent.parentElement;
    }
    return containerRect; // Fallback to outer container
  };
  
  
  // 🎯 STRIP CAROUSEL TRANSFORMS FROM LIVE DOM (before off-screen check)
  // JS carousels (Owl, Swiper, Slick, Flickity) apply translate3d/translateX as inline styles
  // to scroll slides. getBoundingClientRect() respects the live transform → off-screen slides
  // appear outside the clip rect → removed before cloning → no images in capture.
  // Strip before the visibility check; restore after cloning.
  const strippedTransforms: Array<{ el: HTMLElement; transform: string; willChange: string }> = [];
  element.querySelectorAll<HTMLElement>('*').forEach(el => {
    const t = el.style.transform;
    if (t && (t.includes('translate3d') || t.includes('translateX'))) {
      strippedTransforms.push({ el, transform: t, willChange: el.style.willChange });
      el.style.removeProperty('transform');
      el.style.removeProperty('will-change');
    }
  });


  allOriginalElements.forEach(el => {
    if (el instanceof HTMLElement && el !== element) {
      const computed = window.getComputedStyle(el);
      
      // 🎯 COMPREHENSIVE VISIBILITY CHECK
      // Method 1: CSS-based hiding
      const isDisplayNone = computed.display === 'none';
      const isVisibilityHidden = computed.visibility === 'hidden';
      const isOpacityZero = computed.opacity === '0';

      // Method 1b: aria-hidden — but only strip EMPTY decorative elements (icon fonts, spacers).
      // Do NOT strip non-empty aria-hidden elements: sites like BBC Sport mark all visual content
      // (team names, scores, badge images) as aria-hidden alongside a visually-hidden a11y span.
      // Blanket removal = blank captures. aria-hidden = hidden from screen readers, NOT from display.
      const ARIA_VISUAL_TAGS = new Set(['IMG', 'PICTURE', 'VIDEO', 'CANVAS', 'SVG']);
      const isAriaHiddenDecorative = el.getAttribute('aria-hidden') === 'true' &&
        !ARIA_VISUAL_TAGS.has(el.tagName) &&
        (el.textContent?.trim().length ?? 0) === 0 &&
        !el.querySelector('img, picture, video, canvas, svg');
      
      // Method 2: Off-screen positioning (carousel slides)
      // Use the nearest clipping ancestor (overflow:hidden) for bounds check
      const rect = el.getBoundingClientRect();
      const clipRect = findClippingAncestor(el);
      const isOffScreenLeft = rect.right < clipRect.left;   // Fully left of clip container
      const isOffScreenRight = rect.left > clipRect.right;  // Fully right of clip container
      // Guard: skip elements with zero bounding rect (display:contents wrappers, e.g. HotUKDeals
      // box--contents). These have no rendered box of their own — rect={0,0,0,0} — but their
      // children ARE visible and positioned. Treating zero-rect as off-screen strips all children.
      const isOffScreen = (rect.width > 0 || rect.height > 0) && (isOffScreenLeft || isOffScreenRight);
      
      // Exception: loaded images (naturalWidth > 0) should never be hidden by display:none alone.
      // Carousels (Owl, Swiper, etc.) hide inactive slides with inline style="display:none" and
      // restore them via external CSS (.active img { display:block !important }). The external CSS
      // wins on the live page but is absent in the dashboard → inline display:none makes the img
      // invisible. Capture it regardless; we strip the inline display:none from the clone below.
      const isLoadedImg = el.tagName === 'IMG' && (el as HTMLImageElement).naturalWidth > 0;
      const isHidden = (isDisplayNone && !isLoadedImg) || isVisibilityHidden || isOpacityZero || isAriaHiddenDecorative || isOffScreen;

      if (isHidden) {
        el.setAttribute('data-spotboard-hidden', 'true');
        markedElements.push(el);
      }
    }
  });

  // 🎯 IMAGE CONTEXT CLASSIFICATION (BEFORE CLONING)
  // Unified container-walk classification via dom-snapshot — single source of truth.
  classifyImages(element);


  // 💚❤️ SENTIMENT TAGGING (Phase 2: Semantic Coloring)
  // Tag finance deltas (+/-) for color coding on dashboard
  tagSentimentData(element);

  // 🎯 MARK CSS-HIDDEN-BUT-LOADED IMAGES (Rightmove fallback pattern)
  // Rightmove SSR has primary <img src=""> slots + fallback <img> with real CDN URLs hidden
  // via external CSS (width:0;height:0). Hidden check only catches display:none, so these
  // survive cloning — but are invisible in dashboard without the external stylesheet.
  // Fix: attribute-only marking (no style mutation = no live-page flicker), un-hide on clone.
  element.querySelectorAll('img').forEach(img => {
    if (img.naturalWidth > 0 && img.offsetWidth === 0 && img.offsetHeight === 0) {
      img.setAttribute('data-spotboard-force-visible', 'true');
    }
  });

  // 🎯 MARK BG-IMAGE RENDERED DIMENSIONS before cloning.
  // The bg-image promotion code runs on the detached clone where getBoundingClientRect()
  // returns {0,0}. Store rendered size as data attributes so post-clone code can assign
  // the correct data-scale-context without needing live-DOM access.
  element.querySelectorAll<HTMLElement>('[style*="background-image"]').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      el.setAttribute('data-bg-w', String(Math.round(r.width)));
      el.setAttribute('data-bg-h', String(Math.round(r.height)));
    }
  });

  // 🎯 MARK USER-EXCLUDED ELEMENTS before cloning.
  // A data-attribute marker rides along with cloneNode / HTML-string serialisation, so it
  // survives shadow-DOM flattening, <slot> projection, and any earlier sibling removals —
  // unlike a child-index path, which goes stale the instant the clone's structure diverges
  // from the live DOM (the cause of issue #2: 2+ exclusions removed the wrong elements).
  // MUST be set before cloneWithShadow(): the shadow flatten reads each open shadow root as
  // an HTML string, so a marker on a node inside one is only captured if it is already set
  // at read time.
  excludedElements.forEach(el => el.setAttribute('data-spotboard-excluded', 'true'));

  // Clone (classification + exclusion markers will be copied).
  // Invariant: `element` (the capture root) is never itself in `excludedElements` — both
  // handleClick paths that reach toggleExclusion require `target !== lockedElement` — so the
  // clone's own root can't carry the marker and this array is the complete un-mark set.
  let clone: HTMLElement;
  try {
    clone = cloneWithShadow(element) as HTMLElement;
    stripSpacerPadding(element, clone);
  } finally {
    // Restore the live page even if cloning throws — never leave a marker on the user's DOM.
    excludedElements.forEach(el => el.removeAttribute('data-spotboard-excluded'));
  }

  // Clean up markers from original DOM (restore page to pristine state)
  markedElements.forEach(el => el.removeAttribute('data-spotboard-hidden'));
  element.querySelectorAll('[data-bg-w]').forEach(el => {
    el.removeAttribute('data-bg-w');
    el.removeAttribute('data-bg-h');
  });
  element.querySelectorAll('[data-spotboard-force-visible]').forEach(el =>
    el.removeAttribute('data-spotboard-force-visible'));
  // Restore carousel transforms stripped before visibility check
  strippedTransforms.forEach(({ el, transform, willChange }) => {
    el.style.transform = transform;
    if (willChange) el.style.willChange = willChange;
  });
  
  // 🎯 REMOVE USER-EXCLUDED ELEMENTS
  // Matched via the data-spotboard-excluded marker set on the live nodes before cloning.
  // querySelectorAll returns document order, so for a nested pair the ancestor is removed
  // first and the later remove() on the now-detached descendant is a harmless no-op.
  if (excludedElements.length > 0) {
    clone.querySelectorAll('[data-spotboard-excluded]').forEach(el => el.remove());
  }
  
  // 🎯 Remove elements with display:none (catches CSS-based hidden duplicates)
  // The Verge and other sites use CSS-in-JS classes where mobile/desktop versions
  // are differentiated by computed display style rather than class keywords
  // Strategy: Mark hidden elements in ORIGINAL DOM before cloning, then remove from clone
  const hiddenInClone = clone.querySelectorAll('[data-spotboard-hidden="true"]');
  hiddenInClone.forEach(el => el.remove());

  // PASS 2: Un-hide CSS-constrained images that are actually loaded (safe — on clone, not live DOM)
  clone.querySelectorAll('[data-spotboard-force-visible]').forEach(el => {
    (el as HTMLElement).style.cssText += ';display:block!important;width:auto!important;height:auto!important;max-width:100%!important';
    el.removeAttribute('data-spotboard-force-visible');
  });

  // Remove capture-related inline styles from clone
  const cloneElements = [clone, ...Array.from(clone.querySelectorAll('*'))];
  cloneElements.forEach(el => {
    if (el instanceof HTMLElement) {
      el.style.removeProperty('cursor');
      el.style.removeProperty('outline');
      // Strip inline display:none from images.
      // Carousels set display:none on inactive slides via inline style; external CSS overrides
      // to display:block on the live page but is absent in the dashboard → image invisible.
      if (el.tagName === 'IMG' && el.style.display === 'none') {
        el.style.removeProperty('display');
      }
      // Strip carousel/slider stage position transforms.
      // JS carousels (Owl Carousel, Swiper, Slick, Flickity) apply translate3d/translateX
      // as inline styles to scroll slides. In the dashboard iframe the coordinate origin
      // differs from the live page, so the transform displaces all slides off-screen and
      // overflow:hidden on the stage-outer clips them → no images visible.
      // Only strip translate-based transforms; leave rotate/scale/matrix (decorative).
      const t = el.style.transform;
      if (t && (t.includes('translate3d') || t.includes('translateX'))) {
        el.style.removeProperty('transform');
        el.style.removeProperty('will-change');
      }
      if (el.style.length === 0) {
        el.removeAttribute('style');
      }
    }
  });

  // 🎯 Apply shared duplicate/hidden element cleanup (from dom-cleanup.ts)
  // Handles: duplicate selectors, empty wrappers, broken SVGs, decorative images,
  // progressive loading artifacts, and dangerous positioning
  clone.innerHTML = cleanupDuplicates(clone.innerHTML);

  // 🎯 FIX PROGRESSIVE LOADING IMAGES: Remove loading artifacts
  // Sites use progressive loading: blur filters, skeleton loaders, lazy loading
  // These break in dashboard because JavaScript that removes them doesn't run
  clone.querySelectorAll('img').forEach(img => {
    // Remove lazy loading attribute
    img.removeAttribute('loading');
    
    // Remove progressive loading classes that cause blur/skeleton effects
    // SlotCatalog: .blurring (filter: blur(4px))
    // Others: .skeleton, .loading, .placeholder, .lazy
    const loadingClasses = ['blurring', 'skeleton', 'loading', 'placeholder', 'lazy', 'lazy-load'];
    loadingClasses.forEach(cls => {
      if (img.classList.contains(cls)) {
        img.classList.remove(cls);
      }
    });
  });
  
  // 🎯 FIX LAZY-LOADED IMAGES: Convert data-image/data-src to src (shared via DomSnapshot)
  promoteLazyImages(clone);
  
  // 🎯 CSS BACKGROUND-IMAGE: Promote inline bg-image to <img> for image capture (shared via DomSnapshot)
  // Uses data-bg-h attribute stamped above (getBoundingClientRect=0 on detached clone).
  promoteBackgroundImages(clone, 'capture');

  // 🎯 PICTURE SOURCE FLATTENING: Stamp largest <source> URL into img.src at capture time.
  // <picture> + <source media="(min-width: Npx)"> in a narrow card context (~380px) causes
  // the browser to select the smallest responsive source. Flatten to the highest min-width
  // source URL so the stored html_cache always shows the best available image.
  // Guard: only mutates if a larger URL is found and differs from the current img.src.
  clone.querySelectorAll('picture').forEach(pic => {
    const img = pic.querySelector('img');
    if (!img) return;
    const sources = [...pic.querySelectorAll<HTMLSourceElement>('source[srcset], source[data-srcset]')];
    if (!sources.length) return;
    let largestUrl: string | null = null;
    let bestActualWidth = -1;
    for (const source of sources) {
      const srcset = effectiveSrcset(source);
      const parts = srcset.trim().split(/\s+/);
      const url = parts[0];
      if (!url || !url.startsWith('http')) continue;
      // Determine actual image pixel width — highest wins.
      // Priority: w-descriptor ("1000w") > Cloudinary t_focal-WxH > generic WxH > min-width fallback.
      // NBC pattern: (1240px)→860px, (758px)→1000px — highest breakpoint ≠ largest image.
      let actualWidth = 0;
      const wDesc = parts[1];
      if (wDesc && /^\d+w$/i.test(wDesc)) actualWidth = parseInt(wDesc);
      if (!actualWidth) {
        const cld = url.match(/t_(?:focal|fit|scale|fill|pad|crop|thumb)-(\d+)(?:x\d+|w\b)/i);
        if (cld) actualWidth = parseInt(cld[1]);
      }
      if (!actualWidth) {
        const gen = url.match(/[/_-](\d{3,5})x(\d{2,5})[/_.\-?&]/);
        if (gen) actualWidth = parseInt(gen[1]);
      }
      if (!actualWidth) {
        const wp = url.match(/[?&]w=(\d+)/i);
        if (wp) actualWidth = parseInt(wp[1]);
      }
      if (!actualWidth) {
        // Last resort: use min-width breakpoint as rough proxy
        const media = source.getAttribute('media') || '';
        const mw = media.match(/min-width\s*:\s*(\d+)/);
        actualWidth = mw ? parseInt(mw[1], 10) : 0;
      }
      if (actualWidth > bestActualWidth) {
        bestActualWidth = actualWidth;
        largestUrl = url;
      }
    }
    if (!largestUrl) largestUrl = effectiveSrcset(sources[0]).trim().split(/\s+/)[0] || null;
    if (largestUrl?.startsWith('data:')) return; // never flatten to a placeholder (#86)
    const originalSrc = img.getAttribute('src');
    if (largestUrl && largestUrl !== originalSrc) {
      img.setAttribute('src', largestUrl);
      sources.forEach(s => s.remove());
      console.log(`[SpotBoard] picture flattened bestW=${bestActualWidth}`);
    }
  });

  // 🎯 FIX PLACEHOLDER DIMENSIONS: Remove aspect ratio markers
  // Sites like AS.com use width="4" height="3" as 4:3 aspect ratio, not 4x3 pixels
  // These break CSS sizing because max-height:25px doesn't expand 3px images
  clone.querySelectorAll('img').forEach(img => {
    const width = parseInt(img.getAttribute('width') || '0');
    const height = parseInt(img.getAttribute('height') || '0');
    
    // Detect placeholder dimensions (< 10px = aspect ratio markers, not pixels)
    // Also strip explicit 0 attrs — Rightmove SSR fallback slots have width="0" height="0"
    const isZeroDim = img.getAttribute('width') === '0' || img.getAttribute('height') === '0';
    if (isZeroDim || (height > 0 && height < 10) || (width > 0 && width < 10)) {
      img.removeAttribute('width');
      img.removeAttribute('height');
    }
  });

  // 🎯 STRIP EMPTY-SRC IMAGES: Remove SSR placeholder <img src=""> slots before URL fixing.
  // Without this, new URL('', pageUrl) converts them to the captured page URL → broken image icon.
  clone.querySelectorAll('img').forEach(img => {
    if ((img.getAttribute('src') ?? '').trim() === '' && !img.closest('picture')) img.remove();
  });

  // 🎯 FIX RELATIVE URLS: Convert ALL relative URLs to absolute
  // Prevents resources from being resolved to chrome-extension:// origin
  const pageUrl = window.location.href;
  
  // Fix image src attributes
  clone.querySelectorAll('img[src]').forEach(img => {
    const src = img.getAttribute('src');
    
    // 🔧 Handle protocol-relative URLs (//upload.wikimedia.org/...)
    if (src && src.startsWith('//')) {
      img.setAttribute('src', 'https:' + src);
      return;
    }
    
    if (src && !src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('blob:')) {
      try {
        const absoluteUrl = new URL(src, pageUrl).href;
        img.setAttribute('src', absoluteUrl);
      } catch (e) {
        console.warn('  ⚠️ Could not fix img src:', src, e);
      }
    }
  });
  
  // Fix image srcset attributes (for responsive images)
  clone.querySelectorAll('img[srcset]').forEach(img => {
    const srcset = img.getAttribute('srcset');
    if (srcset) {
      try {
        const fixedSrcset = srcset.split(',').map(src => {
          const parts = src.trim().split(/\s+/);
          const url = parts[0];
          
          // 🔧 Handle protocol-relative URLs (//upload.wikimedia.org/...)
          if (url && url.startsWith('//')) {
            parts[0] = 'https:' + url;
            return parts.join(' ');
          }
          
          if (url && !url.startsWith('http') && !url.startsWith('data:') && !url.startsWith('blob:')) {
            const absoluteUrl = new URL(url, pageUrl).href;
            parts[0] = absoluteUrl;
          }
          return parts.join(' ');
        }).join(', ');
        img.setAttribute('srcset', fixedSrcset);
      } catch (e) {
        console.warn('  ⚠️ Could not fix img srcset:', e);
      }
    }
  });
  
  // 🎯 DATA-URI BLUR PLACEHOLDER: Next.js / LQIP pattern
  // When src is a blur placeholder (data: URI), promote the LAST real srcset candidate.
  // Next.js puts smallest variants first; last non-data entry is the largest/best candidate.
  let blurPromotions = 0;
  clone.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src') ?? '';
    if (!src.startsWith('data:')) return;
    const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
    const candidates = srcset.split(',')
      .map((s: string) => s.trim().split(/\s+/)[0])
      .filter((u: string) => u && !u.startsWith('data:') && u.length > 10);
    const bestUrl = candidates[candidates.length - 1];
    if (bestUrl) { img.setAttribute('src', bestUrl); blurPromotions++; }
  });

  // 🎯 NEXT.JS IMAGE OPTIMIZER: Extract original CDN URL from /_next/image?url=
  // Uses URL.searchParams — more robust than regex if query param order varies.
  let proxyUnwraps = 0;
  clone.querySelectorAll('img[src*="/_next/image"]').forEach(img => {
    try {
      const parsed = new URL(img.getAttribute('src') ?? '', window.location.href);
      const original = parsed.searchParams.get('url');
      if (original && original.startsWith('http')) { img.setAttribute('src', original); proxyUnwraps++; }
    } catch { /* malformed URL */ }
  });

  if (blurPromotions > 0 || proxyUnwraps > 0) {
    console.log(`🖼️ [SpotBoard] Next.js image fix: ${blurPromotions} blur promotions, ${proxyUnwraps} proxy unwraps`);
  }

  // 🎯 NEXT.JS FILL LAYOUT: Strip position:absolute fill styles that collapse to 0
  // Detected by: position:absolute + width:0 in inline style (Next.js Image fill/layout="fill")
  // These need a containing block with explicit height — which is lost in the dashboard.
  // Fix: strip img style + parent SPAN style + ancestor padding-top (aspect-ratio container whitespace).
  let fillFixes = 0;
  clone.querySelectorAll('img').forEach(img => {
    const style = img.getAttribute('style') ?? '';
    if (/position\s*:\s*absolute/.test(style) && /width\s*:\s*0/.test(style)) {
      img.removeAttribute('style');
      const parent = img.parentElement;
      if (parent?.tagName === 'SPAN' && /position\s*:\s*absolute/.test(parent.getAttribute('style') ?? '')) {
        parent.removeAttribute('style');
      }
      // Strip padding-top from the aspect-ratio wrapper container (creates blank whitespace
      // when the absolutely-positioned img is un-filled). Walk up to find it.
      let ancestor: Element | null = img.parentElement;
      for (let i = 0; i < 6 && ancestor; i++) {
        const aStyle = ancestor.getAttribute('style') ?? '';
        if (/padding-top\s*:\s*(calc\(|[\d.]+%)/.test(aStyle)) {
          const cleaned = aStyle.replace(/padding-top\s*:[^;]+;?\s*/g, '').trim().replace(/;+$/, '');
          if (cleaned) ancestor.setAttribute('style', cleaned);
          else (ancestor as HTMLElement).removeAttribute('style');
          break;
        }
        ancestor = ancestor.parentElement;
      }
      fillFixes++;
    }
  });
  if (fillFixes > 0) {
    console.log(`🖼️ [SpotBoard] Next.js fill layout fix: ${fillFixes} images un-collapsed`);
  }

  // Fix link hrefs (so they stay clickable)
  clone.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href');
    if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('http')) {
      try {
        const absoluteUrl = new URL(href, pageUrl).href;
        link.setAttribute('href', absoluteUrl);
      } catch (e) {
        console.warn('  ⚠️ Could not fix link href:', href, e);
      }
    }
  });
  
  // Fix CSS background images in inline styles
  clone.querySelectorAll('[style]').forEach(el => {
    const style = (el as HTMLElement).getAttribute('style');
    if (style && style.includes('url(')) {
      try {
        const fixedStyle = style.replace(/url\(['"]?([^'"()]+)['"]?\)/g, (match, url) => {
          if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http')) {
            return match;
          }
          try {
            const absoluteUrl = new URL(url, pageUrl).href;

            return `url('${absoluteUrl}')`;
          } catch (e) {
            return match;
          }
        });
        (el as HTMLElement).setAttribute('style', fixedStyle);
      } catch (e) {
        console.warn('  ⚠️ Could not fix CSS background:', e);
      }
    }
  });
  
  return clone.outerHTML;
}

// #112: the user's exclusion decisions, kept independently of live page nodes. Virtualised lists
// (react-virtuoso and similar) unmount and re-mount rows as the user scrolls, so a node reference
// alone goes stale. Each entry remembers what was excluded (tag + normalised text, plus a
// structural signature when it came from a Shift+click group); `el` is its current live node, or
// null while the page is not showing it. Entries are never dropped just because the node left --
// they are re-applied when matching content re-mounts, so the decision persists.
export interface LedgerEntry { el: HTMLElement | null; tag: string; text: string; sig: string | null; size?: number }
let exclusionLedger: LedgerEntry[] = [];
let bulkExclusionInProgress = false;

function classOf(el: Element | null): string {
  return el && typeof el.className === 'string' ? el.className : '';
}

/** Structural identity of "this kind of element in this kind of place" -- tag, class and two ancestor levels. */
export function similarSignature(el: HTMLElement): string {
  if (el.tagName === 'TIME') return 'time';
  const parent = el.parentElement;
  const grand = parent ? parent.parentElement : null;
  return [el.tagName, classOf(el), parent && parent.tagName, classOf(parent), grand && grand.tagName, classOf(grand)].join('|');
}

function recordExclusion(el: HTMLElement) {
  exclusionLedger.push({
    el,
    tag: el.tagName,
    text: normalizeSignatureText(el.textContent || ''),
    sig: bulkExclusionInProgress ? similarSignature(el) : null,
    size: el.querySelectorAll('*').length,
  });
}

function dropFromLedger(el: HTMLElement) {
  const entry = exclusionLedger.find(e => e.el === el);
  exclusionLedger = exclusionLedger.filter(e => e !== entry && !(bulkExclusionInProgress && entry?.sig && e.sig === entry.sig));
}

/**
 * #112: match the ledger against what the page shows now. Entries whose node is still on the
 * page stay as they are. For the rest:
 *  - group entries (from Shift+click) re-attach to every non-excluded node with the same
 *    structural signature -- the same "entire similar area" the user asked for;
 *  - single entries re-attach only when exactly ONE same-tag node carries exactly the excluded
 *    text (so a recycled row with different text, or repeated identical labels, is never guessed);
 *  - anything else stays dormant in the ledger and is retried on the next refresh.
 * Returns the ledger to keep and the nodes newly (re-)excluded.
 */
export function reconcileLedger(ledger: LedgerEntry[], root: HTMLElement): { ledger: LedgerEntry[]; revived: HTMLElement[] } {
  const live = ledger.filter(e => e.el && root.contains(e.el));
  const taken = new Set<HTMLElement>(live.map(e => e.el as HTMLElement));
  const revived: HTMLElement[] = [];
  const next: LedgerEntry[] = [...live];
  const dormantKeys = new Set<string>();
  ledger.filter(e => !e.el || !root.contains(e.el)).forEach(entry => {
    if (entry.sig) {
      let matched = false;
      root.querySelectorAll<HTMLElement>(entry.tag).forEach(n => {
        if (taken.has(n) || similarSignature(n) !== entry.sig) return;
        taken.add(n); revived.push(n); matched = true;
        next.push({ el: n, tag: entry.tag, text: normalizeSignatureText(n.textContent || ''), sig: entry.sig });
      });
      if (matched) return;
    } else if (/\p{L}{3}/u.test(entry.text)) {
      // Same-tag nodes carrying exactly the excluded text. Wrappers nested inside each other with
      // identical text (div > div > div) are one candidate, not several: take the outermost, then
      // pick the chain member closest in size to what was excluded.
      const same = Array.from(root.querySelectorAll<HTMLElement>(entry.tag))
        .filter(n => normalizeSignatureText(n.textContent || '') === entry.text);
      const tops = same.filter(n => !same.some(m => m !== n && m.contains(n)));
      if (tops.length === 1) {
        const chain = same.filter(n => tops[0].contains(n));
        const want = entry.size ?? 0;
        const pick = chain.reduce((best, n) => Math.abs(n.querySelectorAll('*').length - want) < Math.abs(best.querySelectorAll('*').length - want) ? n : best, chain[0]);
        if (!taken.has(pick)) {
          taken.add(pick); revived.push(pick);
          next.push({ el: pick, tag: entry.tag, text: entry.text, sig: null, size: entry.size });
          return;
        }
      }
    }
    const key = `${entry.tag}|${entry.text}|${entry.sig}`;
    if (!dormantKeys.has(key)) { dormantKeys.add(key); next.push({ ...entry, el: null }); }
  });
  return { ledger: next, revived };
}

/** Apply reconcileLedger() to the live module state (ledger, excluded list, active chain, red marks). */
function syncExclusions(): void {
  if (!lockedElement || exclusionLedger.length === 0) return;
  const { ledger, revived } = reconcileLedger(exclusionLedger, lockedElement);
  exclusionLedger = ledger;
  excludedElements = ledger.filter(e => e.el).map(e => e.el as HTMLElement);
  revived.forEach(n => {
    n.style.setProperty('background', 'rgba(255, 0, 0, 0.3)', 'important');
    n.style.setProperty('outline', '2px solid #ff0000', 'important');
  });
  if (activeExclusionChain && !excludedElements.includes(activeExclusionChain.chain[activeExclusionChain.activeIndex])) {
    activeExclusionChain = null;
  }
}

// Toggle exclusion marking on child element

// Clear all exclusion markings and reset array
export function resetExclusions() {
  // Remove red markings from all excluded elements
  excludedElements.forEach(el => {
    el.style.removeProperty('background');
    el.style.removeProperty('outline');
  });
  // Clear the array
  excludedElements = [];
  exclusionLedger = [];
  hoveredExclusionCandidate = null;
  hoveredSimilarGroup = [];
  activeExclusionChain = null;
  log('🧹 All exclusions cleared');
}

export function toggleExclusion(element: HTMLElement) {
  const isExcluded = excludedElements.includes(element);

  if (isExcluded) {
    // Remove from excluded list and remove red marking
    excludedElements = excludedElements.filter(el => el !== element);
    dropFromLedger(element);
    element.style.removeProperty('background');
    element.style.removeProperty('outline');
    // #61: un-excluding the active exclusion's current boundary drops its chain too --
    // un-excluding removes the whole exclusion, not just its current level.
    if (activeExclusionChain && activeExclusionChain.chain[activeExclusionChain.activeIndex] === element) {
      activeExclusionChain = null;
    }
    log('✅ Element un-excluded:', element.tagName, element.className);
  } else {
    // Check if this element would create a too-generic selector
    const tempSelector = generateSelector(element);
    const isBareTag = /^[a-z]+$/i.test(tempSelector.trim());
    
    if (isBareTag) {
      // Show warning tooltip near element
      const warning = document.createElement('div');
      warning.style.cssText = `
        position: absolute;
        background: #f56565;
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        z-index: 999998;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        pointer-events: none;
      `;
      warning.textContent = `⚠️ Too generic - will be skipped!`;
      
      const rect = element.getBoundingClientRect();
      warning.style.left = `${rect.left + window.scrollX}px`;
      warning.style.top = `${rect.top + window.scrollY - 40}px`;
      
      document.body.appendChild(warning);
      setTimeout(() => warning.remove(), 3000);
      
      log('🚨 BLOCKED exclusion of ultra-generic element:', tempSelector);
    }
    
    // ⚠️ CHECK IF EXCLUDING HEADING (may affect refresh)
    const isHeading = /^H[1-6]$/i.test(element.tagName);
    const hasHeadingClass = element.className && (
      element.className.includes('heading') ||
      element.className.includes('title') ||
      element.className.includes('header')
    );
    const hasHeadingAttribute = element.hasAttribute('data-testid') && (
      element.getAttribute('data-testid')?.includes('heading') ||
      element.getAttribute('data-testid')?.includes('title')
    );
    
    if (isHeading || hasHeadingClass || hasHeadingAttribute) {
      // Show warning tooltip near element
      const warning = document.createElement('div');
      warning.style.cssText = `
        position: absolute;
        background: #f59e0b;
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        z-index: 999998;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        pointer-events: none;
        max-width: 280px;
        line-height: 1.4;
      `;
      warning.innerHTML = `⚠️ Excluding heading may affect refresh.<br>Keep section labels for best results.`;
      
      const rect = element.getBoundingClientRect();
      warning.style.left = `${rect.left + window.scrollX}px`;
      warning.style.top = `${rect.top + window.scrollY - 60}px`;
      
      document.body.appendChild(warning);
      setTimeout(() => warning.remove(), 4000);
      
      log('⚠️ WARNING: Excluding heading element - may affect refresh');
    }
    
    // Add to excluded list and mark with red (live-page exclusion-mode styling -- unchanged
    // by #61, which only affects how the Previewer renders the *active* exclusion).
    excludedElements.push(element);
    recordExclusion(element);
    element.style.setProperty('background', 'rgba(255, 0, 0, 0.3)', 'important');
    element.style.setProperty('outline', '2px solid #ff0000', 'important');
    // #61: a fresh exclusion starts its own Grow/Shrink chain and becomes the active
    // exclusion -- replacing whatever was active before, which is exactly "committing" it
    // (v1 has no reactivation; see #61 decision log).
    activeExclusionChain = { chain: [element], activeIndex: 0 };
    log('❌ Element excluded:', element.tagName, element.className);
  }

  // Debounced preview refresh on exclusion toggle
  if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
  previewDebounceTimer = setTimeout(() => updatePreview(), 300);
  }

// #61: the single place that moves the active exclusion's boundary. Keeps `excludedElements`
// and the live red styling in lockstep with the chain's activeIndex -- old active element is
// un-marked and removed from the array, new active element is marked and added, in that
// order, so there is never a frame where the array/styling and the chain index disagree
// (gap flagged in #61's product-proxy challenge, round 1).
function setActiveExclusionIndex(newIndex: number) {
  const state = activeExclusionChain;
  if (!state || newIndex < 0 || newIndex >= state.chain.length) return;

  const oldActive = state.chain[state.activeIndex];
  const newActive = state.chain[newIndex];
  if (oldActive === newActive) return;

  excludedElements = excludedElements.filter(el => el !== oldActive);
  dropFromLedger(oldActive);
  oldActive.style.removeProperty('background');
  oldActive.style.removeProperty('outline');

  state.activeIndex = newIndex;
  excludedElements.push(newActive);
  recordExclusion(newActive);
  newActive.style.setProperty('background', 'rgba(255, 0, 0, 0.3)', 'important');
  newActive.style.setProperty('outline', '2px solid #ff0000', 'important');

  if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
  previewDebounceTimer = setTimeout(() => updatePreview(), 300);
}

type GrowShrinkResult = { ok: true } | { ok: false; reason: 'no-active-exclusion' | 'reached-capture-root' | 'already-at-original' };

// #61: step the active exclusion's target up one DOM ancestor level. Hard-capped at the
// capture root (`lockedElement`) -- excluding the whole capture is meaningless, and growing
// past it would have no valid exclusion selector anyway. generateExclusionSelector's own
// escalation chain (base class -> generateSelector -> table-column -> unique ancestor path ->
// positional fallback) always resolves to a selector matching exactly one element within the
// capture root (see its docblock) -- so unlike a live-page click, Grow has no separate
// "selector rejected" failure mode; the capture-root boundary is the only real gate.
export function growExclusion(captureRoot: HTMLElement | null): GrowShrinkResult {
  const state = activeExclusionChain;
  if (!state || !captureRoot) return { ok: false, reason: 'no-active-exclusion' };

  const current = state.chain[state.activeIndex];
  const candidate = state.chain[state.activeIndex + 1] ?? current.parentElement;

  if (!candidate || candidate === captureRoot || !captureRoot.contains(candidate)) {
    return { ok: false, reason: 'reached-capture-root' };
  }

  if (state.chain[state.activeIndex + 1] !== candidate) {
    // Discard any stale levels above the current one (can happen after a Shrink) before
    // recording the freshly-walked ancestor.
    state.chain = state.chain.slice(0, state.activeIndex + 1);
    state.chain.push(candidate);
  }
  setActiveExclusionIndex(state.activeIndex + 1);
  return { ok: true };
}

// #61: step back down to a previously-walked (or the original) level. Replays the stored
// chain rather than re-deriving anything, so Shrink always lands back on exactly the element
// that was there before -- never a fresh, possibly-different DOM lookup.
export function shrinkExclusion(): GrowShrinkResult {
  const state = activeExclusionChain;
  if (!state) return { ok: false, reason: 'no-active-exclusion' };
  if (state.activeIndex === 0) return { ok: false, reason: 'already-at-original' };
  setActiveExclusionIndex(state.activeIndex - 1);
  return { ok: true };
}

// #42: Grow Selection for the capture root. A plain parentElement walk, made predictable by two
// mechanical (not semantic) rules -- no sibling/similarity inference, no per-site logic:
//   1. Hard boundaries: <body>/<html>/<main>, a fixed-position ancestor (jumping to it means
//      jumping to header/viewport chrome), and a shadow-root or iframe edge. `parentElement` is
//      null at a shadow-root top and never crosses into an iframe document, so both fall out as
//      "no candidate" without special code. Sticky is NOT a boundary: a sticky right-hand rail
//      is exactly the kind of container a user wants to grow to.
//   2. Skip ancestors that add nothing visible over the current selection: a wrapper with no
//      box (display: contents, zero area, hidden) or one whose box is within 1px of the current
//      selection AND that paints nothing of its own. If there is any doubt (unrecognised
//      background syntax, clipping, shadow, opacity...) the ancestor is NOT skipped -- the user
//      just presses Grow once more, which beats silently growing past a real boundary.
const GROW_BOX_TOLERANCE_PX = 1;
const GROW_BOUNDARY_TAGS = new Set(['BODY', 'HTML', 'MAIN']);
// Empty string = a non-browser environment (jsdom) that reports no computed background.
const TRANSPARENT_BACKGROUND_RE = /^(|transparent|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\))$/;

function paintsOwnBox(style: CSSStyleDeclaration): boolean {
  if (!TRANSPARENT_BACKGROUND_RE.test(style.backgroundColor.trim())) return true;
  if (style.backgroundImage && style.backgroundImage !== 'none') return true;
  if (['Top', 'Right', 'Bottom', 'Left'].some(side => {
    const borderStyle = style.getPropertyValue(`border-${side.toLowerCase()}-style`);
    const borderWidth = parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`) || '0');
    return borderStyle && borderStyle !== 'none' && borderStyle !== 'hidden' && borderWidth > 0;
  })) return true;
  if (style.boxShadow && style.boxShadow !== 'none') return true;
  if (style.outlineStyle && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth || '0') > 0) return true;
  if ((style.overflowX && style.overflowX !== 'visible') || (style.overflowY && style.overflowY !== 'visible')) return true;
  if (style.opacity && style.opacity !== '1') return true;
  if (style.transform && style.transform !== 'none') return true;
  if (style.filter && style.filter !== 'none') return true;
  return false;
}

// Returns the element Grow should move to from `current`, or null when there is nowhere
// sensible left to go (the caller disables the Grow button).
export function getGrowCandidate(current: HTMLElement): HTMLElement | null {
  if (!current.isConnected) return null;
  if (getComputedStyle(current).position === 'fixed') return null;

  const currentRect = current.getBoundingClientRect();
  let node = current.parentElement;
  while (node) {
    if (GROW_BOUNDARY_TAGS.has(node.tagName)) return null;
    const style = getComputedStyle(node);
    if (style.position === 'fixed') return null;

    const rect = node.getBoundingClientRect();
    const hasNoBox = style.display === 'contents' || style.display === 'none'
      || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0;
    const sameBoxAsCurrent =
      Math.abs(rect.left - currentRect.left) <= GROW_BOX_TOLERANCE_PX &&
      Math.abs(rect.top - currentRect.top) <= GROW_BOX_TOLERANCE_PX &&
      Math.abs(rect.width - currentRect.width) <= GROW_BOX_TOLERANCE_PX &&
      Math.abs(rect.height - currentRect.height) <= GROW_BOX_TOLERANCE_PX;

    if (!hasNoBox && !(sameBoxAsCurrent && !paintsOwnBox(style))) return node;
    node = node.parentElement;
  }
  return null;
}

// Shift+Click for bulk exclusion collides with the browser's own Shift+Click "extend text
// selection" gesture -- text selection starts on mousedown, before our click handler ever
// runs, so preventDefault() there is the only place that can stop it (field feedback, #34).
function handleMouseDown(event: MouseEvent) {
  if (!isCapturing || !lockedElement || !event.shiftKey) return;
  if (lockedElement.contains(event.target as HTMLElement)) {
    event.preventDefault();
  }
}

// Editorial card layouts (Guardian, and other similar "whole card clickable" designs) commonly
// stretch an invisible <a> (href + aria-label, zero rendered children) over an entire visual
// card purely so the whole card is clickable -- the real heading/image/text live in sibling
// elements, not inside this overlay. A click anywhere on such a card resolves event.target to
// this overlay, which has nothing of its own to capture (#81 -- Guardian preview came back
// empty and had nothing to exclude, because the locked element genuinely had no content).
// Climb to the nearest ancestor that actually has rendered content, capped so this can never
// walk past a card boundary into a whole page section. Self-contained media tags are excluded
// from the "empty" check since having no children/text is normal and correct for them.
const MAX_EMPTY_CLIMB = 3;
const SELF_CONTAINED_TAGS = new Set(['IMG', 'VIDEO', 'CANVAS', 'SVG', 'IFRAME', 'INPUT', 'AUDIO', 'PICTURE']);
const hasOwnContent = (node: HTMLElement): boolean =>
  SELF_CONTAINED_TAGS.has(node.tagName) ||
  node.childElementCount > 0 ||
  (node.textContent || '').trim().length > 0;

function resolveMeaningfulCaptureTarget(el: HTMLElement): HTMLElement {
  if (hasOwnContent(el)) return el;

  let current = el;
  for (let i = 0; i < MAX_EMPTY_CLIMB; i++) {
    if (!current.parentElement || current.parentElement === document.body) break;
    current = current.parentElement;
    if (hasOwnContent(current)) return current;
  }
  // Never found an ancestor with content within the climb cap -- fail safe to the original
  // target rather than locking onto an arbitrary, possibly still-empty, ancestor.
  return el;
}

// The same content-less "stretched link" overlay that defeats capture-root selection above also
// intercepts every hover/click *inside* an already-locked card: real hit-testing always resolves
// to whichever element is topmost at that point, which is this overlay for the whole card area --
// so a user trying to exclude the image or headline underneath it never reaches those elements at
// all (#81's second symptom -- "clicking elements inside the green box does not mark them for
// exclusion"). When the resolved event target is itself content-less, look at what's rendered
// immediately beneath it via elementsFromPoint and treat that as the real hit instead.
function resolveExclusionHitTarget(event: MouseEvent, root: HTMLElement): HTMLElement {
  const raw = event.target as HTMLElement;
  if (raw === root || hasOwnContent(raw)) return raw;
  const candidates = document.elementsFromPoint(event.clientX, event.clientY)
    .filter((el): el is HTMLElement => el instanceof HTMLElement && el !== raw && el !== root && root.contains(el));
  // Prefer the first candidate that actually has content of its own -- a design can legitimately
  // stack more than one content-less layer (e.g. a decorative overlay between the click-catcher
  // and the real content), and stopping at the first non-raw element regardless of content would
  // silently resolve to another empty node. Fall back to that first candidate only if nothing in
  // the stack has content, so this still resolves to *something* inside root rather than nothing.
  return candidates.find(hasOwnContent) || candidates[0] || raw;
}

function handleClick(event: MouseEvent) {
  if (!isCapturing) return;
  
  log('🖱️ Click detected on:', event.target);

  const target = event.target as HTMLElement;

  // Ignore clicks on SpotBoard banner (has pointer-events: none, but belt-and-braces)
  if (target.closest('[data-spotboard-ignore]')) {
    return;
  }

  hideHoverHint(); // #106: a click commits the selection (or starts exclusion) -- the hint is done

  // Ignore playground onboarding UI elements
  if (target.closest('[data-sb-no-capture]')) {
    return;
  }

  // If clicking on modal buttons, let them handle it (don't intercept)
  if (target.closest('#spotboard-capture-confirmation')) {
        return;
  }
  
  // If we already have a locked element, check if clicking child for exclusion
  if (lockedElement) {

    // See past a content-less "stretched link" overlay to whatever it's covering (#81).
    const hitTarget = resolveExclusionHitTarget(event, lockedElement);

    // Check if clicked element is a child of locked element (but not the locked element itself)
    if (lockedElement.contains(hitTarget) && hitTarget !== lockedElement) {
            event.preventDefault();
      event.stopPropagation();
      // Fail-safe: only honor this as an exclusion if it lands on the element the hover
      // preview last highlighted. A mismatch means content shifted between hover and click
      // (see issue #1 -- Kalshi's live-updating table) -- exclude nothing rather than risk
      // excluding a different element than the one the user saw highlighted.
      // Real cell markup rarely puts the click target itself in `excludedElements` -- sites
      // commonly wrap values in nested <span>s (yr.no: <td><span class="fluid-table__cell-
      // content"><span>...), so a real click's `hitTarget` is almost always a descendant of the
      // actual excluded <td>, not the <td> itself (same resolve-up-to-the-cell issue documented
      // in getTableColumnCells for #62/#67). Comparing `hitTarget` directly against
      // `excludedElements` silently misses every real click on an excluded nested-markup cell --
      // resolve to whichever excluded element actually contains `hitTarget` (or is `hitTarget`).
      const excludedAncestor = excludedElements.find(el => el.contains(hitTarget));
      const alreadyExcluded = !!excludedAncestor;
      // Shift is very commonly pressed only at click time, after the mouse has already stopped
      // moving over the target -- no further mousemove fires in that case, so a hover preview
      // computed without Shift held never got a chance to compute a group at all (real-world
      // repro, field report, 14 Sep 2026). Recompute fresh here rather than require the hover
      // to have already done it. But if the hover DID have Shift held and already previewed a
      // group (hoveredSimilarGroup non-empty), the original #1 fail-safe still applies in full:
      // the fresh group must match what was previewed, or content likely shifted between hover
      // and click and bulk exclusion is skipped rather than risking excluding the wrong set.
      const targetMatchesHoverPreview = hitTarget === hoveredExclusionCandidate;
      const freshGroup = (!alreadyExcluded && event.shiftKey && targetMatchesHoverPreview)
        ? getSimilarSiblings(hitTarget)
        : null;
      const groupPreviewedWithShift = hoveredSimilarGroup.length > 1;
      const groupMatchesPreview = !groupPreviewedWithShift
        || (!!freshGroup && freshGroup.length === hoveredSimilarGroup.length
          && freshGroup.every(el => hoveredSimilarGroup.includes(el)));
      const willBulkExclude = !!freshGroup && freshGroup.length > 1 && groupMatchesPreview;

      // Clear a stale similar-siblings preview if this click isn't the bulk-exclude path that
      // would consume it (e.g. Shift was released between the hover and the click landing) --
      // otherwise those siblings' dashed outlines leak until an unrelated mouse move touches them.
      if (!willBulkExclude && hoveredSimilarGroup.length > 0) {
        hoveredSimilarGroup.forEach(el => {
          if (el !== hitTarget && !excludedElements.includes(el)) {
            el.style.removeProperty('outline');
            el.style.removeProperty('background');
          }
        });
        hoveredSimilarGroup = [];
      }

      if (alreadyExcluded) {
        // Mirror the exclude direction (#73): Shift+click on a cell that's part of an
        // already-excluded table column (or generic sibling group) un-excludes the whole
        // group, not just the one cell clicked. No hover-preview matching needed here (unlike
        // the exclude path's #1 fail-safe) -- already-excluded elements never get a hover
        // preview computed for them (see handleHover), so this group is always computed fresh
        // at click time, same as the exclude path already does when Shift is pressed late.
        const unexcludeGroup = event.shiftKey ? getSimilarSiblings(excludedAncestor!) : null;
        if (unexcludeGroup && unexcludeGroup.length > 1) {
          bulkExclusionInProgress = true;
          unexcludeGroup.forEach(el => {
            if (excludedElements.includes(el)) toggleExclusion(el);
          });
          bulkExclusionInProgress = false;
          log('✅ Bulk-un-excluded', unexcludeGroup.length, 'similar siblings');
        } else {
          toggleExclusion(excludedAncestor!);
        }
      } else if (willBulkExclude) {
        bulkExclusionInProgress = true;
        freshGroup!.forEach(el => {
          if (!excludedElements.includes(el)) toggleExclusion(el);
        });
        bulkExclusionInProgress = false;
        log('❌ Bulk-excluded', freshGroup!.length, 'similar siblings');
      } else if (!!freshGroup && groupPreviewedWithShift && !groupMatchesPreview) {
        // Fresh group no longer matches what the shift-hover preview showed -- content likely
        // shifted between hover and click (#1). Exclude nothing rather than risk excluding a
        // different set than the one the user saw highlighted.
        log('🛡️ Similar-siblings group changed between hover and click -- content likely shifted, skipping bulk exclusion:', hitTarget.tagName, hitTarget.className);
      } else if (targetMatchesHoverPreview) {
        toggleExclusion(hitTarget);
      } else {
        log('🛡️ Exclusion click target did not match last-hovered preview -- content likely shifted, skipping exclusion:', hitTarget.tagName, hitTarget.className);
      }
      return;
    }

        return;
  }
  
  event.preventDefault();
  event.stopPropagation();
  
  log('🎯 Target element:', target.tagName, target.className);

  // Widen off an empty "whole card clickable" overlay onto the ancestor that actually holds
  // content (#81) -- see resolveMeaningfulCaptureTarget for why this can happen.
  const captureTarget = resolveMeaningfulCaptureTarget(target);
  const widenedForEmptyOverlay = captureTarget !== target;
  if (widenedForEmptyOverlay) {
    log('🧭 Click landed on an empty overlay element -- widened capture root:', target.tagName, target.className, '->', captureTarget.tagName, captureTarget.className);
  }

  // #42: don't open the previewer yet -- propose this as the capture root and let the user
  // Grow/Shrink it (or click elsewhere to re-select). continueRefinement() picks up from here.
  startRefinement(captureTarget, target, widenedForEmptyOverlay);
}

const REFINE_OUTLINE = '5px solid #00ff00';

function describeForPath(el: HTMLElement): string {
  const r = el.getBoundingClientRect();
  return `${el.tagName.toLowerCase()}:${Math.round(r.width)}x${Math.round(r.height)}`;
}

function sendRefineEvent(state: RefineState, outcome: 'continue' | 'cancel' | 'detached') {
  const root = state.chain[state.index];
  log('🧭 Grow path:', state.path.join(' > '), '| outcome:', outcome);
  chrome.runtime.sendMessage({
    type: 'GA4_EVENT',
    eventName: 'capture_refine',
    params: {
      url_domain: new URL(window.location.href).hostname,
      outcome,
      grew: state.growCount > 0,
      grow_count: state.growCount,
      reselects: state.reselects,
      final_tag: root.tagName.toLowerCase(),
      ms_to_end: Date.now() - state.startedAt,
      path: state.path.join('>').slice(0, 100)
    }
  });
}

// Called for the first click of a capture attempt AND for every re-select click while the bar
// is up. A re-select resets the Grow/Shrink history but keeps the attempt's timer and totals.
export function startRefinement(root: HTMLElement, clickTarget: HTMLElement, widened: boolean) {
  const prev = refineState;
  if (prev) prev.chain[prev.index].style.removeProperty('outline');
  refineState = {
    chain: [root],
    index: 0,
    clickTarget,
    widened,
    startedAt: prev?.startedAt ?? Date.now(),
    growCount: prev?.growCount ?? 0,
    reselects: prev ? prev.reselects + 1 : 0,
    path: [describeForPath(root)]
  };
  root.style.setProperty('outline', REFINE_OUTLINE, 'important');
  showRefineBar();
  updateRefineBar();
}

function setRefineIndex(index: number) {
  const state = refineState;
  if (!state) return;
  state.chain[state.index].style.removeProperty('outline');
  state.index = index;
  const root = state.chain[index];
  root.style.setProperty('outline', REFINE_OUTLINE, 'important');
  state.path.push(describeForPath(root));
  updateRefineBar();
}

export function growRefinement() {
  const state = refineState;
  if (!state) return;
  const current = state.chain[state.index];
  if (!current.isConnected) {
    endRefinement('detached');
    showCaptureHint('The selected area changed on the page. Click it again.');
    return;
  }
  const next = state.chain[state.index + 1] ?? getGrowCandidate(current);
  if (!next) {
    updateRefineBar();
    return;
  }
  if (state.chain[state.index + 1] !== next) {
    // Drop stale levels above the current one (left over after a Shrink) before recording.
    state.chain = state.chain.slice(0, state.index + 1);
    state.chain.push(next);
  }
  state.growCount++;
  setRefineIndex(state.index + 1);
}

export function shrinkRefinement() {
  const state = refineState;
  if (!state || state.index === 0) return;
  setRefineIndex(state.index - 1);
}

// Leaves the refinement stage without proceeding to the previewer (Esc / capture-mode teardown /
// the selected node vanished). Capture mode itself is left to the caller.
export function endRefinement(outcome: 'cancel' | 'detached') {
  const state = refineState;
  if (!state) return;
  sendRefineEvent(state, outcome);
  state.chain[state.index].style.removeProperty('outline');
  removeRefineBar();
  refineState = null;
}

// Test seam (mirrors __getActiveExclusionChainForTest): inspect refinement state without exporting the let.
export const __getRefineStateForTest = () => refineState;

let _refineShadow: ShadowRoot | null = null;

function removeRefineBar() {
  hideHoverHint(); // #106: Continue locks the root while the mouse may still rest on a hovered box
  document.getElementById('spotboard-refine-bar')?.remove();
  document.getElementById('spotboard-refine-banner')?.remove();
  _refineShadow = null;
  document.getElementById('spotboard-capture-banner')?.style.removeProperty('display');
}

// Capture mode is lime, exclusion mode is purple. The refinement stage mirrors exclusion mode's
// two pieces: a passive centred instruction strip across the top (pointer-events none, like the
// banners) and a small panel with the three controls, parked where the previewer opens so that
// Continue reads as "the panel turns into the previewer". The panel is shadow-hosted like the
// other overlays so host-page CSS can't reach the buttons.
const CAPTURE_LIME = '#a3e635';
const OVERLAY_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const stripBold = (text: string) => {
  const b = document.createElement('strong');
  b.style.fontWeight = '700';
  b.textContent = text;
  return b;
};
const stripKbd = (text: string) => {
  const k = document.createElement('span');
  k.textContent = text;
  k.style.cssText = 'padding: 2px 6px; background: rgba(0,0,0,0.15); border-radius: 3px; font-family: monospace; font-size: 12px;';
  return k;
};

// Shared shell for the lime top strip. Capture mode is ONE mode in two steps -- 1: click what you
// want, 2: adjust it (Grow/Shrink) and continue -- so both steps use the same strip, centred like
// the purple exclusion strip, differing only in the step number and instructions. Passive
// (pointer-events none) and marked data-spotboard-ignore so it is never itself captured.
function createCaptureStrip(id: string, step: 1 | 2, instructions: (Node | string)[]): HTMLElement {
  const strip = document.createElement('div');
  strip.id = id;
  strip.setAttribute('data-spotboard-ignore', 'true');
  strip.style.cssText = `
    position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important;
    background: ${CAPTURE_LIME} !important; color: #000000 !important; padding: 10px 20px !important;
    display: flex !important; align-items: center !important; justify-content: center !important;
    text-align: center !important; font-family: ${OVERLAY_FONT} !important;
    font-size: 14px !important; font-weight: 400 !important; z-index: 2147483646 !important;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important; pointer-events: none !important;
  `;
  const logo = document.createElement('img');
  logo.src = chrome.runtime.getURL('icon-16.png');
  logo.style.cssText = 'width: 20px; height: 20px; vertical-align: middle; margin-right: 8px; pointer-events: none;';
  const text = document.createElement('span');
  text.style.pointerEvents = 'none';
  text.append(logo, stripBold('CAPTURE MODE'), ` \u00b7 Step ${step} of 2 - `, ...instructions);
  strip.appendChild(text);
  return strip;
}

function showRefineBar() {
  if (_refineShadow) return;
  const { shadow } = createOverlayShadowHost('spotboard-refine-bar');
  _refineShadow = shadow;

  document.body.appendChild(createCaptureStrip('spotboard-refine-banner', 2, [
    stripBold('Grow'), ' to include more, or ', stripBold('click'), ' another element to re-select \u00b7 ',
    stripKbd('Enter'), ' to continue \u00b7 ', stripKbd('Esc'), ' to cancel'
  ]));

  const panel = document.createElement('div');
  panel.style.cssText = `
    position: fixed !important; top: 50% !important; right: 20px !important;
    transform: translateY(-50%) !important; width: 210px !important; box-sizing: border-box !important;
    background: ${CAPTURE_LIME} !important; color: #000000 !important; padding: 14px 16px !important;
    border-radius: 12px !important; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1) !important;
    display: flex !important; flex-direction: column !important; gap: 10px !important;
    font-family: ${OVERLAY_FONT} !important; pointer-events: auto !important; text-transform: none !important;
  `;

  const label = document.createElement('div');
  label.id = 'sb-refine-label';
  label.style.cssText = 'font-size: 14px; font-weight: 600; line-height: 1.3; word-break: break-word;';
  const hint = document.createElement('div');
  hint.id = 'sb-refine-hint';
  hint.style.cssText = 'font-size: 12px; line-height: 1.3;';

  const buttonBase = 'box-sizing: border-box; border: 2px solid transparent; border-radius: 6px; font-size: 13px; font-weight: 500; line-height: 1; padding: 9px 12px; cursor: pointer; font-family: inherit;';
  const makeButton = (id: string, text: string, style: string, action: () => void) => {
    const button = document.createElement('button');
    button.id = id;
    button.type = 'button';
    button.textContent = text;
    button.style.cssText = buttonBase + style;
    // Keep focus where it was so a later Enter reaches our keydown handler rather than
    // re-activating whichever panel button was last clicked.
    button.addEventListener('mousedown', e => e.preventDefault());
    button.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); action(); });
    return button;
  };
  const secondary = ' background: rgba(0,0,0,0.14); color: #000; flex: 1;';

  const row = document.createElement('div');
  row.style.cssText = 'display: flex; gap: 8px;';
  row.append(
    makeButton('sb-refine-shrink', 'Shrink', secondary, shrinkRefinement),
    makeButton('sb-refine-grow', 'Grow', secondary, growRefinement)
  );
  panel.append(
    label,
    hint,
    row,
    makeButton('sb-refine-continue', 'Continue →', ' background: #1c1c1e; color: #fff; padding: 11px 12px;', continueRefinement)
  );
  shadow.appendChild(panel);
  document.getElementById('spotboard-capture-banner')?.style.setProperty('display', 'none', 'important');
}

function updateRefineBar() {
  const state = refineState;
  if (!state || !_refineShadow) return;
  const current = state.chain[state.index];
  const canGrow = !!(state.chain[state.index + 1] ?? getGrowCandidate(current));
  // No tag name / pixel size in the UI: the outline already shows what is selected, and "ol 1248x288"
  // is developer language (the same detail is in the DEBUG "Grow path" log).
  (_refineShadow.querySelector('#sb-refine-label') as HTMLElement).textContent = 'Selected area';
  (_refineShadow.querySelector('#sb-refine-hint') as HTMLElement).textContent =
    (canGrow ? 'Grow for a bigger area.' : 'Nothing larger to grow to.') +
    ' Shrink to undo. Click another element to re-select.';
  // Enabled = filled with a 2px dark border (the fill alone is only 1.4:1 against lime, so the
  // border is what makes it read as a button). Disabled = no fill, dashed lighter border, still-
  // legible text (5:1) and a tooltip saying why -- not just faded, which read as "broken".
  const setEnabled = (id: string, enabled: boolean, reason: string) => {
    const b = _refineShadow!.querySelector(id) as HTMLButtonElement;
    b.disabled = !enabled;
    b.style.setProperty('background', enabled ? 'rgba(0,0,0,0.14)' : 'transparent');
    b.style.setProperty('border', enabled ? '2px solid rgba(0,0,0,0.65)' : '2px dashed rgba(0,0,0,0.45)');
    b.style.setProperty('color', enabled ? '#000' : 'rgba(0,0,0,0.6)');
    b.style.setProperty('cursor', enabled ? 'pointer' : 'not-allowed');
    b.title = enabled ? '' : reason;
  };
  setEnabled('#sb-refine-shrink', state.index > 0, 'Nothing to shrink yet - Shrink undoes Grow');
  setEnabled('#sb-refine-grow', canGrow, 'Nothing larger to grow to');
}

// #42: user pressed Continue (button or Enter). Locks the current root -- the same state the
// old first-click produced -- and hands over to the existing previewer flow unchanged.
function continueRefinement() {
  const state = refineState;
  if (!state) return;
  const root = state.chain[state.index];
  if (!root.isConnected) {
    endRefinement('detached');
    showCaptureHint('The selected area changed on the page. Click it again.');
    return;
  }
  sendRefineEvent(state, 'continue');
  removeRefineBar();
  refineState = null;

  // Lock this element and set green outline
  lockedElement = root;
  root.style.setProperty('outline', '5px solid #00ff00', 'important');


  // 🎯 Playground beacon: element selected (green frame showing, confirmation modal opening)
  if (getIsPlaygroundPage()) {
    const beacon = document.getElementById('sb-onboarding-beacon');
    if (beacon) {
      console.log('[SB] beacon: selected, getIsPlaygroundPage()=', getIsPlaygroundPage());
      beacon.dataset.stage = 'selected';
      log('🎯 Playground beacon updated: data-stage=selected');
    }
  }
  if (getIsOnboardingMode()) advanceOnboardingCoach('selected');

  // A grown root must behave exactly as if the user had clicked it directly: name/fingerprint
  // narrowing to "the branch you clicked" only makes sense when the root IS what they clicked
  // (index 0). After Grow, that branch would be one story inside the column they chose.
  const grown = state.index > 0;
  proceedToPreviewer(root, grown ? root : state.clickTarget, grown ? false : state.widened);
}

// #42: everything that follows "the capture root has been decided" -- name, selector, position
// mode, then the confirmation modal. Split out of handleClick so a refinement step (Grow/Shrink)
// can decide the root first and then hand it over here unchanged. `clickTarget` is the element
// the user actually clicked, used to narrow the name/fingerprint search to their branch.
function proceedToPreviewer(captureTarget: HTMLElement, clickTarget: HTMLElement, widenedForEmptyOverlay: boolean) {
  // Generate smart label using Option 1 strategy

  // Spatial helper: true if child's CENTER POINT falls within parent's rendered rect (10px tolerance).
  // Center-point check avoids false rejections when headings overflow parent by a few px.
  const isWithinBounds = (child: Element, parent: Element): boolean => {
    const p = parent.getBoundingClientRect();
    const c = child.getBoundingClientRect();
    if (c.width === 0 || c.height === 0) return false; // not visually rendered
    const cX = c.left + c.width / 2;
    const cY = c.top + c.height / 2;
    return (
      cX >= p.left - 10 && cX <= p.right + 10 &&
      cY >= p.top - 10 && cY <= p.bottom + 10
    );
  };

  // DOM traversal: walk from the clicked element up to wrapper's direct child.
  // Narrows name/fingerprint searches to the column branch the user actually interacted with,
  // preventing sidebar headings (e.g. "Featured Videos") from contaminating the card name.
  const getClickBranch = (clickTarget: HTMLElement, wrapper: HTMLElement): HTMLElement | null => {
    if (!clickTarget || clickTarget === wrapper || !wrapper.contains(clickTarget)) return null;
    let current = clickTarget;
    while (current.parentElement && current.parentElement !== wrapper) {
      current = current.parentElement;
    }
    return current.parentElement === wrapper ? current : null;
  };

  // When we widened off an empty overlay, the real click point is a direct (empty) child of
  // captureTarget -- a narrowed branch would just re-select that same empty node, defeating the
  // widening. Search the whole widened root instead in that case.
  const clickBranch = widenedForEmptyOverlay ? null : getClickBranch(clickTarget, captureTarget);
  const searchRoot = clickBranch || captureTarget;

  let name = '';

  // Strategy 1: Check if element itself is a heading
  if (/^H[1-6]$/i.test(captureTarget.tagName)) {
    const text = captureTarget.textContent?.trim();
    if (text) {
      name = text.length > 50 ? text.substring(0, 50) + '...' : text;
      log('📝 Name from heading:', name);
    }
  }
  
  // Strategy 2: Look for first heading inside element that is spatially within capture bounds
  if (!name) {
    const headings = Array.from(searchRoot.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    const heading = headings.find(h => isWithinBounds(h, searchRoot)) ?? null;
    if (heading?.textContent?.trim()) {
      const text = heading.textContent.trim();
      name = text.length > 50 ? text.substring(0, 50) + '...' : text;
    }
  }
  
  // Strategy 3: Get first meaningful text (skip empty/whitespace-only nodes + out-of-bounds subtrees)
  if (!name) {
    const SKIP_ELEMENTS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG']);
    const walker = document.createTreeWalker(
      searchRoot,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node: Node): number => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            if (SKIP_ELEMENTS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
            // Prune hidden/invisible elements (0×0 rect = display:none, SEO-only headings, etc.)
            const c = el.getBoundingClientRect();
            if (c.width === 0 && c.height === 0) return NodeFilter.FILTER_REJECT;
            // Prune subtrees that are completely outside capture bounds (sidebars, popups, etc.)
            const p = searchRoot.getBoundingClientRect();
            if (c.width > 0 && c.height > 0) {
              if (
                c.right  < p.left   - 10 ||
                c.left   > p.right  + 10 ||
                c.bottom < p.top    - 10 ||
                c.top    > p.bottom + 10
              ) {
                return NodeFilter.FILTER_REJECT;
              }
            }
            return NodeFilter.FILTER_SKIP;
          }
          const text = (node as Text).textContent?.trim();
          return text && text.length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
      }
    );
    
    // Collect every text candidate first so a bare-digit/separator fragment ("2", ":") can be
    // told apart from a complete bare-number value ("87", "2024") by DOM structure, not just
    // string content: if it's the ONLY text node in the capture, there's nothing to split it
    // from, so it's a legitimate whole value. If there are SEVERAL sibling text nodes, a bare
    // digit/separator one is evidence of a split value (digit-per-char clocks, digit-group
    // counters) — skip it and keep looking for a candidate that stands on its own. (#55)
    const candidates: string[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent?.trim();
      if (text) candidates.push(text);
    }
    const isPlausibleName = (text: string): boolean =>
      /\p{L}/u.test(text) || (/\d/.test(text) && !/^\d+$/.test(text));
    const chosen = candidates.length === 1
      ? candidates[0]
      : candidates.find(isPlausibleName);
    if (chosen) {
      name = chosen.length > 50 ? chosen.substring(0, 50) + '...' : chosen;
    }
  }
  
  // Strategy 3.5: img[alt] — off-DOM safe, guards against 1×1 trackers and UI icons
  if (!name) {
    const images = Array.from(captureTarget.querySelectorAll('img[alt]'));
    const bestImg = images.find(img => {
      const alt = img.getAttribute('alt')?.trim() || '';
      if (alt.length <= 10) return false;
      if (/author|avatar|share|facebook|twitter|logo/i.test(alt)) return false;
      // Only reject if width/height are explicitly set AND too small (1×1 trackers)
      const wAttr = img.getAttribute('width');
      const hAttr = img.getAttribute('height');
      if (wAttr && parseInt(wAttr, 10) < 10) return false;
      if (hAttr && parseInt(hAttr, 10) < 10) return false;
      return true;
    });
    if (bestImg) {
      const text = bestImg.getAttribute('alt')!.trim();
      name = text.length > 50 ? text.substring(0, 50) + '...' : text;
      log('📝 Name from img alt:', name);
    }
  }

  // Strategy 3.6: aria-label — handles trailing punctuation + UI arrows (>, », →)
  if (!name) {
    const label = captureTarget.querySelector('[aria-label]')?.getAttribute('aria-label')?.trim() || '';
    const isVanity = /^(read more|link to article|share|continue reading)[.\s>»→]*$/i.test(label);
    if (label.length > 10 && !isVanity) {
      name = label.length > 50 ? label.substring(0, 50) + '...' : label;
      log('📝 Name from aria-label:', name);
    }
  }

  // Strategy 4: Fallback to generic label
  if (!name) {
    name = `Spot from ${window.location.hostname}`;
    log('📝 Name fallback:', name);
  }
  
  const selector = generateSelector(captureTarget);
  log('🎯 Final selector:', selector);

  // 🎯 BATCH 2: Pre-extract heading for position-based detection
  // Do this BEFORE modal so we can show auto-selected mode
  // Skip hidden/SEO headings (0×0 rect = not rendered, e.g. cricbuzz hidden H3s)
  const headingSels = 'h1, h2, h3, h4, caption, [class*="heading"], [class*="title"], [class*="header"], [data-testid*="heading"], [data-testid*="title"]';
  let heading: Element | null = null;
  for (const h of searchRoot.querySelectorAll(headingSels)) {
    const r = h.getBoundingClientRect();
    // Skip hidden AND volatile (a bare value like "54%" is not a stable identity) candidates —
    // keep looking rather than accepting the first match.
    if ((r.width > 0 || r.height > 0) && !VOLATILE_FINGERPRINT_RE.test((h.textContent || '').trim())) { heading = h; break; }
  }
  if (!heading && searchRoot !== captureTarget) {
    for (const h of captureTarget.querySelectorAll(headingSels)) {
      const r = h.getBoundingClientRect();
      if ((r.width > 0 || r.height > 0) && !VOLATILE_FINGERPRINT_RE.test((h.textContent || '').trim())) { heading = h; break; }
    }
  }
  const rawHeading = heading?.textContent?.trim() || null;
  const hasStableHeading = !!rawHeading;
  const positionBased = !hasStableHeading;
  log('📍 Pre-modal capture mode:', positionBased ? 'Position-based (no heading)' : 'Header-based (has heading)');

  // Show top-right confirmation modal
  log('📞 About to call showCaptureConfirmation...');
  try {
    showCaptureConfirmation(captureTarget, name, selector, positionBased, clickBranch);
    log('✅ showCaptureConfirmation returned');
  } catch (error) {
    console.error('❌ showCaptureConfirmation FAILED:', error);
  }
}


/**
 * Returns CSS string that replicates dashboard card rendering.
 * Combines dashboard.html .component-content rules + injectCleanupCSS() rules.
 * This is a static string constant — no behavioral logic, just CSS rules.
 */
function getPreviewCSS(): string {
  return `
    /* === Dashboard .component-content rules === */
    body {
      margin: 0;
      padding: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      line-height: 1.25;
      overflow-x: hidden;
      background: #fff;
    }

    * {
      cursor: default !important;
      position: static !important;
    }

    /* 5-tier image scaling */
    img[data-scale-context="icon"] {
      max-width: 25px !important; max-height: 25px !important;
      object-fit: contain; display: inline-block; vertical-align: middle;
    }
    img[data-scale-context="small"] {
      max-width: 48px !important; max-height: 48px !important;
      object-fit: contain; display: inline-block; vertical-align: middle;
    }
    img[data-scale-context="thumbnail"] {
      max-width: 80px !important; max-height: 80px !important;
      object-fit: contain; display: inline-block; vertical-align: middle;
    }
    img[data-scale-context="medium"] {
      max-width: 180px !important; max-height: 100px !important;
      object-fit: contain; display: inline-block; vertical-align: middle;
    }
    img[data-scale-context="preview"] {
      max-width: 150px !important; max-height: 150px !important;
      object-fit: contain; display: inline-block; vertical-align: middle;
    }
    img:not([data-scale-context]) {
      max-width: 25px !important; max-height: 25px !important;
      object-fit: contain; display: inline-block; vertical-align: middle;
    }
    video {
      max-width: 25px !important; max-height: 25px !important;
      object-fit: contain; display: inline-block; vertical-align: middle;
    }
    svg {
      display: inline-block !important;
      max-width: 24px !important;
      max-height: 24px !important;
      width: auto;
      height: auto;
      vertical-align: middle;
      overflow: hidden;
    }
    /* Chart/data-vis SVGs (stamped data-sb-svg="chart" by cleanupDuplicates) scale to full
       card width instead of being capped at icon size. Covers nested <svg> axis labels too —
       they inherit the parent's coordinate system and are never stamped individually.
       align-self: flex-start is required — chart wrapper divs frequently carry inline
       flex styles from the source site (e.g. Kalshi's display:flex, height:100% chart
       container), and default flex align-items:stretch overrides height:auto, stretching
       the svg to fill the flex parent instead of scaling via its viewBox aspect ratio. */
    svg[data-sb-svg="chart"],
    svg[data-sb-svg="chart"] svg {
      display: block !important;
      max-width: 100% !important;
      max-height: none !important;
      width: 100% !important;
      height: auto !important;
      align-self: flex-start !important;
      overflow: visible;
    }

    /* Font normalization */
    body, li, li span, li p, div, p {
      font-size: 14px !important;
      font-weight: 400 !important;
      line-height: 1.25 !important;
    }
    strong, b { font-weight: 600 !important; }
    h1, h2, h3 {
      font-weight: 600 !important;
      font-size: 16px !important;
      line-height: 1.3 !important;
    }
    h1 *, h2 *, h3 * {
      font-size: inherit !important;
    }
    li { margin: 4px 0 !important; padding: 0 !important; }
    a { cursor: pointer !important; }

    /* 💚❤️ Sentiment colors for finance data */
    [data-sb-sentiment="positive"] {
      color: #16a34a !important;
      font-weight: 500 !important;
    }
    [data-sb-sentiment="negative"] {
      color: #dc2626 !important;
      font-weight: 500 !important;
    }
    [data-sb-sentiment="positive"] a,
    [data-sb-sentiment="negative"] a {
      color: inherit !important;
      text-decoration: none;
    }
    [data-sb-sentiment="positive"] a:hover,
    [data-sb-sentiment="negative"] a:hover {
      text-decoration: underline;
    }

    /* === injectCleanupCSS() rules === */
    [class*="Pbot"], [class*="Ptop"], [class*="Pvertical"],
    [class*="Mbot"], [class*="Mtop"] {
      padding: 2px !important; margin: 2px 0 !important;
    }
    h6:empty, h5:empty, h4:empty, .sr-only:empty, .visually-hidden:empty {
      display: none !important; margin: 0 !important; padding: 0 !important;
    }
    h6, h5 { margin: 2px 0 !important; padding: 2px 0 !important; }
    ul {
      list-style-type: disc !important; margin: 1px 0 !important; padding-left: 20px !important;
    }
    ol {
      list-style-type: decimal !important; margin: 1px 0 !important; padding-left: 20px !important;
    }
    ul li, ol li {
      line-height: 1.2 !important; margin: 0 !important;
      padding: 1px 0 !important; min-height: 0 !important; height: auto !important;
    }
    li > div, li > section, li > article {
      margin: 0 !important; padding: 2px 0 !important; line-height: 1.2 !important;
    }
    p { margin: 4px 0 !important; line-height: 1.4 !important; }
    div { line-height: 1.4 !important; }
    [class*="Grid"], [class*="Flex"], [class*="Stack"] { gap: 2px !important; }
    table tr { height: auto !important; }
    table td { padding: 4px 6px !important; }
    /* #61: the exclusion currently being Grow/Shrink-edited stays in the preview with a
       subtle tint + dashed outline -- deliberately not the bold red used on the live page,
       since a "finished-looking" preview shouldn't carry ugly red boxes (owner feedback,
       #61 decision log). Every other exclusion is simply removed, as before. */
    [data-spotboard-active-exclusion] {
      background: rgba(245, 101, 101, 0.10) !important;
      outline: 1px dashed #e08585 !important;
      border-radius: 4px !important;
    }
  `;
}

/**
 * Wraps sanitized HTML in a full srcdoc document with dashboard-parity CSS.
 */
function generatePreviewSrcdoc(html: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${getPreviewCSS()}</style></head>
<body>${html}</body></html>`;
}

// #112: while the previewer is open, keep it in step with the page. On a virtualised list the rows
// that are mounted change as the user scrolls, so re-apply the exclusion ledger and re-render the
// preview whenever scrolling settles -- otherwise it keeps showing rows (and exclusion marks) from
// wherever the user was earlier.
let scrollSyncInstalled = false;
let scrollSyncTimer: ReturnType<typeof setTimeout> | null = null;
function installScrollSync() {
  if (scrollSyncInstalled) return;
  scrollSyncInstalled = true;
  window.addEventListener('scroll', () => {
    if (!_confirmationShadow || !lockedElement) return;
    if (scrollSyncTimer) clearTimeout(scrollSyncTimer);
    scrollSyncTimer = setTimeout(() => updatePreview(), 300);
  }, { passive: true, capture: true });
}

// #61: keep the Previewer's Shrink/Grow buttons in sync with `activeExclusionChain` --
// called after every Grow/Shrink click and from `updatePreview()` (which also runs whenever
// a live-page click changes which exclusion is active).
function syncExclusionToolbar(): void {
  const shrinkBtn = _confirmationShadow?.querySelector('#shrinkExclusion') as HTMLButtonElement | null;
  const growBtn = _confirmationShadow?.querySelector('#growExclusionBtn') as HTMLButtonElement | null;
  const hasActive = !!activeExclusionChain;
  if (shrinkBtn) shrinkBtn.disabled = !hasActive || activeExclusionChain!.activeIndex === 0;
  if (growBtn) growBtn.disabled = !hasActive;
}

/**
 * Renders or re-renders the preview iframe inside the capture confirmation modal.
 * Uses the locked element + current exclusions to generate a dashboard-parity preview.
 */
function updatePreview(): void {
  installScrollSync();
  syncExclusions();
  syncExclusionToolbar();
  const iframe = _confirmationShadow?.querySelector('#spotboard-preview-iframe') as HTMLIFrameElement | null;
  if (!iframe || !lockedElement) return;

  // Save scroll position before replacing content (only possible with allow-same-origin)
  let savedScrollTop = 0;
  try {
    if (iframe.contentDocument?.documentElement) {
      savedScrollTop = iframe.contentDocument.documentElement.scrollTop;
    }
  } catch (_e) {
    // Cross-origin or not yet loaded — ignore
  }

  // #61: the active exclusion stays VISIBLE in the preview (subtle tint, via the
  // [data-spotboard-active-exclusion] CSS rule in getPreviewCSS()) while it's being
  // edited -- only already-committed exclusions are actually removed, so the preview still
  // looks "finished" for everything except the one thing Grow/Shrink can currently act on.
  const activeElement = activeExclusionChain?.chain[activeExclusionChain.activeIndex] ?? null;
  const elementsToRemove = activeElement
    ? excludedElements.filter(el => el !== activeElement)
    : excludedElements;
  if (activeElement) activeElement.setAttribute('data-spotboard-active-exclusion', 'true');
  let previewHTML: string;
  try {
    previewHTML = sanitizeHTML(lockedElement, elementsToRemove);
  } finally {
    if (activeElement) activeElement.removeAttribute('data-spotboard-active-exclusion');
  }
  // Apply shared cleanup for exact dashboard parity
  const cleanedHTML = cleanupDuplicates(previewHTML);

  // #112: never hand the user an empty white box -- say why it is empty.
  iframe.srcdoc = (excludedElements.length > 0 && looksEmptyCapture(cleanedHTML, false)
      && !/<(img|svg|video|canvas|iframe|picture|audio)\b|background-image/i.test(cleanedHTML))
    ? generatePreviewSrcdoc('<p style="padding:16px;color:#4a5568;font:13px sans-serif;">Nothing left to preview: everything in this area is excluded.</p>')
    : generatePreviewSrcdoc(cleanedHTML);

  // Loading state: fade in when loaded, restore scroll position
  iframe.style.opacity = '0.5';
  iframe.onload = () => {
    iframe.style.opacity = '1';
    // Restore scroll position after content renders
    try {
      if (iframe.contentDocument?.documentElement && savedScrollTop > 0) {
        iframe.contentDocument.documentElement.scrollTop = savedScrollTop;
      }
    } catch (_e) {
      // Cross-origin — ignore
    }
  };
}

function showCaptureConfirmation(target: HTMLElement, name: string, selector: string, positionBased: boolean, clickBranch: HTMLElement | null = null) {
  log('🚀 showCaptureConfirmation called with:', { name, selector, positionBased });
  
  // #13: shadow-hosted. The host (not `modal`) carries the 'spotboard-capture-confirmation'
  // id, because other functions in this file do `event.target.closest('#spotboard-capture-confirmation')`
  // on document-level listeners -- shadow event retargeting rewrites event.target to the HOST
  // for those, so the id has to live there for closest() to still resolve it.
  const { host, shadow } = createOverlayShadowHost('spotboard-capture-confirmation');
  _confirmationShadow = shadow;

  // Create top-right confirmation modal
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed !important;
    top: 50% !important;
    right: 20px !important;
    transform: translateY(-50%) !important;
    background: #6b46c1 !important;
    color: white !important;
    padding: 0 !important;
    border-radius: 12px !important;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1) !important;
    z-index: 2147483647 !important;
    width: 340px !important;
    max-width: 90vw !important;
    max-height: calc(100vh - 40px) !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
    isolation: isolate !important;
    pointer-events: auto !important;
    text-transform: none !important;
  `;
  
  modal.innerHTML = `
    <div id="spotboard-modal-header" style="padding: 20px 20px 12px; flex-shrink: 0; font-family: inherit;">
      <div id="spotboard-modal-title" style="font-size: 16px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: inherit;" title="">
        <span class="sb-capture-title-expanded">✅ Selected: <span class="sb-capture-name"></span></span>
        <span class="sb-capture-title-minimized" style="display: none;">Add to board?</span>
      </div>
    </div>
    <div id="spotboard-modal-body" style="display: flex; flex-direction: column; flex: 1; min-height: 0;">
      <div style="padding: 8px 20px 0; flex-shrink: 0; font-family: inherit;">
        <span style="font-size: 13px; color: white; font-family: inherit;">Preview</span>
      </div>
      <div style="padding: 8px 20px 12px; flex: 1; min-height: 0; overflow-y: auto;">
        <div id="spotboard-preview-container">
          <iframe id="spotboard-preview-iframe"
            sandbox="allow-same-origin"
            style="width: 100%; height: 320px; border: none; border-radius: 6px; background: #fff; display: block; opacity: 0.5; transition: opacity 0.3s;"
          ></iframe>
        </div>
      </div>
    </div>
    <div id="spotboard-exclusion-toolbar" style="display: flex; flex-direction: column; flex-shrink: 0; background: #6b46c1; font-family: inherit;">
      <div style="display: flex; align-items: center; justify-content: center; gap: 10px; padding: 4px 20px 8px; transform: translateX(10px);">
        <button id="shrinkExclusion" type="button" disabled style="box-sizing: border-box; border: none; background: rgba(255,255,255,0.28); color: #fff; border-radius: 6px; font-size: 11px; font-weight: 400; line-height: 1; padding: 7px 11px; cursor: pointer; font-family: inherit;">
          Shrink
        </button>
        <button id="growExclusionBtn" type="button" disabled style="box-sizing: border-box; border: none; background: rgba(255,255,255,0.92); color: #4c2f96; border-radius: 6px; font-size: 11px; font-weight: 400; line-height: 1; padding: 7px 11px; cursor: pointer; font-family: inherit;">
          Grow exclusion
        </button>
      </div>
      <div style="height: 1px; margin: 0 20px; background: #fff;"></div>
    </div>
    <div id="spotboard-modal-footer" style="display: flex; flex-direction: row; gap: 8px; padding: 12px 20px; flex-shrink: 0; background: #6b46c1; position: sticky; bottom: 0; z-index: 1; font-family: inherit;">
      <button id="confirmSpot" style="flex: 1; padding: 12px; background: #48bb78; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; font-family: inherit; text-transform: none !important;">
        Confirm Spot
      </button>
      <button id="cancelSpot" style="flex: 1; padding: 12px; background: #f56565; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; font-family: inherit; text-transform: none !important;">
        Cancel
      </button>
    </div>
    <div id="spotboard-collapse-row" style="display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 6px 20px 14px; flex-shrink: 0; border-radius: 0 0 12px 12px; background: #6b46c1; font-family: inherit;">
      <span class="sb-collapse-label" style="font-size: 13px; color: white; font-family: inherit;">Collapse</span>
      <button id="spotboard-collapse-toggle" type="button" style="flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 0; border: none; border-radius: 6px; background: #6b7280; color: #ffffff; cursor: pointer; font-family: inherit;">
        <svg class="sb-collapse-icon-collapse" width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M3.70711,2.29289 L8.70711,7.29289 C9.09763,7.68342 9.09763,8.31658 8.70711,8.70711 L3.70711,13.7071 C3.31658,14.0976 2.68342,14.0976 2.29289,13.7071 C1.90237,13.3166 1.90237,12.6834 2.29289,12.2929 L6.58579,8 L2.29289,3.70711 C1.90237,3.31658 1.90237,2.68342 2.29289,2.29289 C2.68342,1.90237 3.31658,1.90237 3.70711,2.29289 Z M8.70711,2.29289 L13.7071,7.29289 C14.0976,7.68342 14.0976,8.31658 13.7071,8.70711 L8.70711,13.7071 C8.31658,14.0976 7.68342,14.0976 7.29289,13.7071 C6.90237,13.3166 6.90237,12.6834 7.29289,12.2929 L11.5858,8 L7.29289,3.70711 C6.90237,3.31658 6.90237,2.68342 7.29289,2.29289 C7.68342,1.90237 8.31658,1.90237 8.70711,2.29289 Z"/></svg>
        <svg class="sb-collapse-icon-expand" width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" style="display: none;"><path fill="currentColor" fill-rule="evenodd" d="M2.29289,7.29289 L7.29289,2.29289 C7.68342,1.90237 8.31658,1.90237 8.70711,2.29289 C9.06759,2.65337923 9.09531923,3.22060645 8.79029769,3.61290152 L8.70711,3.70711 L4.41421,8 L8.70711,12.2929 C9.09763,12.6834 9.09763,13.3166 8.70711,13.7071 C8.34662077,14.0675615 7.77939355,14.0952893 7.38709848,13.7902834 L7.29289,13.7071 L2.29289,8.70711 C1.93241,8.34662077 1.90468077,7.77939355 2.20970231,7.38709848 L2.29289,7.29289 L7.29289,2.29289 L2.29289,7.29289 Z M7.29289,7.29289 L12.2929,2.29289 C12.6834,1.90237 13.3166,1.90237 13.7071,2.29289 C14.0675615,2.65337923 14.0952893,3.22060645 13.7902834,3.61290152 L13.7071,3.70711 L9.41421,8 L13.7071,12.2929 C14.0976,12.6834 14.0976,13.3166 13.7071,13.7071 C13.3466385,14.0675615 12.7793793,14.0952893 12.3871027,13.7902834 L12.2929,13.7071 L7.29289,8.70711 C6.93241,8.34662077 6.90468077,7.77939355 7.20970231,7.38709848 L7.29289,7.29289 L12.2929,2.29289 L7.29289,7.29289 Z"/></svg>
      </button>
    </div>
  `;

  const captureNameEl = modal.querySelector('.sb-capture-name') as HTMLElement;
  const captureTitleEl = modal.querySelector('#spotboard-modal-title') as HTMLElement;
  if (captureNameEl) captureNameEl.textContent = name;
  if (captureTitleEl) captureTitleEl.setAttribute('title', name);

  // 🎯 #60: the "what to do" instructions live in the persistent top bar (shown for the
  // whole exclusion-mode duration, independent of this panel's state — see
  // showExclusionBanner below). The panel itself keeps two jobs: a previewer (Advanced +
  // Preview, its main function, collapsed here) and Confirm/Cancel (works in both states,
  // since confirming or cancelling the spot must stay reachable either way). Collapsing
  // only hides the previewer and narrows the panel to a compact strip — Confirm/Cancel
  // stack vertically to fit, matching the narrower width. Preserves in-progress
  // exclusions/preview untouched (body is only hidden, never torn down) and resets per
  // capture attempt (module-scoped DOM, no persisted preference). Esc-to-cancel is
  // unaffected — its handler is document-level.
  const collapseToggle = modal.querySelector('#spotboard-collapse-toggle') as HTMLButtonElement;
  const collapseRow = modal.querySelector('#spotboard-collapse-row') as HTMLDivElement;
  const modalBody = modal.querySelector('#spotboard-modal-body') as HTMLDivElement;
  const modalFooter = modal.querySelector('#spotboard-modal-footer') as HTMLDivElement;
  const exclusionToolbar = modal.querySelector('#spotboard-exclusion-toolbar') as HTMLDivElement;
  const titleExpanded = modal.querySelector('.sb-capture-title-expanded') as HTMLElement;
  const titleMinimized = modal.querySelector('.sb-capture-title-minimized') as HTMLElement;
  const collapseLabel = modal.querySelector('.sb-collapse-label') as HTMLElement;
  const collapseIconCollapse = modal.querySelector('.sb-collapse-icon-collapse') as HTMLElement;
  const collapseIconExpand = modal.querySelector('.sb-collapse-icon-expand') as HTMLElement;
  const confirmBtnLabel = modal.querySelector('#confirmSpot') as HTMLButtonElement;

  // #61: Shrink/Grow act on whichever exclusion is active; both stay disabled when there's
  // none (nothing excluded yet, or the panel is collapsed and the toolbar itself is hidden).
  const shrinkBtn = modal.querySelector('#shrinkExclusion') as HTMLButtonElement;
  const growBtn = modal.querySelector('#growExclusionBtn') as HTMLButtonElement;
  // (button state syncs once the modal is attached and `updatePreview()` runs below)
  shrinkBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    shrinkExclusion();
    syncExclusionToolbar();
  });
  growBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    growExclusion(lockedElement);
    syncExclusionToolbar();
  });

  if (collapseToggle && collapseRow && modalBody && modalFooter) {
    collapseToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const willMinimize = modalBody.style.display !== 'none';
      modalBody.style.display = willMinimize ? 'none' : 'flex';
      if (exclusionToolbar) exclusionToolbar.style.display = willMinimize ? 'none' : 'flex';
      modalFooter.style.flexDirection = willMinimize ? 'column' : 'row';
      titleExpanded.style.display = willMinimize ? 'none' : '';
      titleMinimized.style.display = willMinimize ? '' : 'none';
      collapseLabel.textContent = willMinimize ? 'Expand' : 'Collapse';
      collapseIconCollapse.style.display = willMinimize ? 'none' : '';
      collapseIconExpand.style.display = willMinimize ? '' : 'none';
      if (confirmBtnLabel) confirmBtnLabel.textContent = willMinimize ? 'Confirm' : 'Confirm Spot';
      modal.style.width = willMinimize ? '160px' : '340px';
      // Collapsed ("Expand"): icon left of label, whole row left-aligned.
      // Expanded ("Collapse"): label left of icon, whole row right-aligned.
      collapseRow.style.justifyContent = willMinimize ? 'flex-start' : 'flex-end';
      collapseLabel.style.order = willMinimize ? '1' : '0';
      collapseToggle.style.order = willMinimize ? '0' : '1';
    }, true);
  }

  showExclusionBanner();

  log('📦 Modal HTML created, appending to body...');
  shadow.appendChild(modal);
  log('✅ Modal appended to DOM successfully');

  // Trigger initial preview render
  updatePreview();
  
  // 🎯 Remove yellow banner when entering exclusion mode (purple modal)
  const banner = document.getElementById('spotboard-capture-banner');
  if (banner) {
    banner.remove();
    log('🗑️ Yellow banner removed - now in exclusion mode');
  }
  
  // Confirm button handler - use capture phase to ensure it fires first
  const confirmBtn = modal.querySelector('#confirmSpot') as HTMLButtonElement;
  if (confirmBtn) {
    confirmBtn.addEventListener('click', (e) => {
            e.stopPropagation();
      e.preventDefault();
      
      // 🎯 #60: the Advanced header/position-mode toggle was removed from this panel --
      // no UI override exists anymore, so fall through to whatever auto-detection decided
      // (the `positionBased` param this function was called with), not a hardcoded default.
      const finalPositionBased = positionBased;
      log('📍 Final capture mode (auto-detected):', finalPositionBased ? 'Position-based' : 'Header-based');

      host.remove();
      document.getElementById('spotboard-exclusion-banner')?.remove();
      _confirmationShadow = null;

      // ⏳ WAIT 2 SECONDS FOR JS FRAMEWORKS TO RENDER
      log('⏳ Waiting 2s for JavaScript to render...');
      
      setTimeout(() => {
        // Capture onboarding state before any async storage calls
        const wasOnboarding = getIsOnboardingMode();
        console.debug('[sb-capture] confirm timeout fired. getIsOnboardingMode()=', getIsOnboardingMode(), 'wasOnboarding=', wasOnboarding);

        // 🎯 BATCH 1: Generate selectors for excluded elements
        // Uses generateExclusionSelector (not generateSelector directly) -- exclusions need
        // uniqueness verified within the capture root, since they're applied via
        // querySelectorAll(selector) at refresh time and have no fingerprint tiebreaker.
        syncExclusions(); // #112: drop/re-attach exclusions whose node left the page before selectors are built
        const excludedSelectors: string[] = [];
        excludedElements.forEach(el => {
          const selector = generateExclusionSelector(el, target);
          excludedSelectors.push(selector);
        });
        console.log('🎯 Generated', excludedSelectors.length, 'exclusion selectors');

        // #61: prove each selector actually matches something when re-applied by
        // dom-cleanup.ts's applyExclusions() against the SERIALIZED capture HTML -- the exact
        // function + input shape used at refresh time. generateExclusionSelector only proved
        // uniqueness against the live `target` element, a different code path; only this check
        // catches the live-vs-serialized desync that caused #1 (a selector that validates at
        // capture time but matches nothing once refresh hands it a fresh HTML string instead of
        // a live element). Non-blocking: a mismatch is logged, not fatal, since the capture
        // itself is otherwise already using the elements it excluded.
        const rawCaptureHTML = target.outerHTML;
        excludedSelectors.forEach(sel => {
          if (applyExclusions(rawCaptureHTML, [sel], selector) === rawCaptureHTML) {
            console.warn('⚠️ Exclusion selector did not match on the serialized capture HTML -- may not survive refresh:', sel);
          }
        });

        // ✨ SANITIZE HTML BEFORE STORING (after JS renders)
        // Pass excluded elements so they can be removed from saved HTML
        const rawCaptureLength = target.innerHTML.length; // pristine baseline for drift guard (raw-to-raw); light DOM is the consistent source after slot flattening
        const cleanedHTML = sanitizeHTML(target, excludedElements);
        log('🧹 HTML sanitized, length:', cleanedHTML.length, 'chars');

        // #96: remember what each exclusion actually hid (text only), so refresh can tell
        // "the excluded thing is gone from the site" from "the excluded thing came back".
        // Computed here, synchronously, while excludedElements still lines up 1:1 with
        // excludedSelectors and the elements are still live.
        const exclusionSignatures = buildExclusionSignatures(
          excludedElements.map((el, i) => ({ sel: excludedSelectors[i], elementHtml: el.outerHTML })),
          cleanedHTML
        );

        // #9: Output-side emptiness guard. The whole save path below is wrapped in
        // commitCapture() so it can be gated behind a "capture anyway?" warning when the
        // sanitized result is unambiguously empty. commitCapture() IS the unchanged save
        // path — non-empty captures call it immediately and behave exactly as before.
        const commitCapture = (bypassedEmptyWarning = false) => {
        // 🎯 BATCH 2: Extract first heading for self-healing fallback
        // 🔧 FIX: Extract from LIVE DOM, not sanitized HTML
        // Skip hidden/SEO headings (0×0 rect = display:none, not rendered)
        const fpRoot = clickBranch || target;
        const fpHeadingSels = 'h1, h2, h3, h4, caption, [class*="heading"], [class*="title"], [class*="header"], [data-testid*="heading"], [data-testid*="title"]';
        // #71: never anchor the refresh fingerprint on a heading the user just excluded (or one
        // nested inside an excluded ancestor) -- otherwise headingFingerprint stores the excluded
        // text, and refresh-engine.js's self-healing heading-fallback can later reconstruct the
        // section anchored on exactly the element the user asked to hide, breaking the stored
        // exclusion selector's scope and letting it silently reappear.
        const isExcludedOrInsideExcluded = (el: Element): boolean =>
          excludedElements.some(ex => ex === el || ex.contains(el));
        let fpHeading: Element | null = null;
        for (const h of fpRoot.querySelectorAll(fpHeadingSels)) {
          const r = h.getBoundingClientRect();
          // Skip volatile candidates (a bare value like "54%" is not a stable identity) — keep
          // looking rather than storing the tracked value itself as the fingerprint.
          if ((r.width > 0 || r.height > 0) && !VOLATILE_FINGERPRINT_RE.test((h.textContent || '').trim()) && !isExcludedOrInsideExcluded(h)) { fpHeading = h; break; }
        }
        if (!fpHeading && fpRoot !== target) {
          for (const h of target.querySelectorAll(fpHeadingSels)) {
            const r = h.getBoundingClientRect();
            if ((r.width > 0 || r.height > 0) && !VOLATILE_FINGERPRINT_RE.test((h.textContent || '').trim()) && !isExcludedOrInsideExcluded(h)) { fpHeading = h; break; }
          }
        }
        // Limit to 100 chars to avoid exceeding sync storage quota (8KB per item)
        const fpText = fpHeading?.textContent?.trim() || null;
        // Fallback: use the card name as fingerprint when no visible heading exists.
        // #71: the name is computed at lock-time, before the user has excluded anything, so it
        // can independently equal the very heading text just excluded -- same leak as fpHeading,
        // just via a different data path. Refuse the fallback in that case too.
        // Names over 50 chars are truncated to "<50 chars>..." at name-generation time (see the
        // heading/text-node strategies above) -- replicate that truncation before comparing, or a
        // long excluded heading's truncated name would never string-match its own full-text
        // element and the leak would slip through anyway.
        // Compare against the actual h1-6 element `name` was derived from (Strategy 1/2 above),
        // not the excluded element's own text -- a user can exclude a WRAPPER around the heading
        // (e.g. a byline+heading container) rather than the bare heading tag; that wrapper's full
        // textContent won't string-equal the shorter heading-only `name`, but the heading nested
        // inside it is still `isExcludedOrInsideExcluded`, so resolve through the real element.
        const truncateLikeName = (t: string): string => t.length > 50 ? t.substring(0, 50) + '...' : t;
        const nameSourceHeading = Array.from(target.querySelectorAll('h1, h2, h3, h4, h5, h6'))
          .find(h => truncateLikeName((h.textContent || '').trim()) === name);
        const nameMatchesExcludedHeading = !!nameSourceHeading && isExcludedOrInsideExcluded(nameSourceHeading);
        const fallbackName = (name !== `Spot from ${window.location.hostname}` && !nameMatchesExcludedHeading) ? name : null;
        const headingFingerprint = fpText ? fpText.substring(0, 100) : (fallbackName ? fallbackName.substring(0, 100) : null);

        // Structural-identity marker (issue #77): a capture-time data-testid/data-test value,
        // kept only if it's globally unique on the page right now. Lets refresh's feed-rotation
        // rescue recognize "same widget, rotated content" for <a>-dominant feeds (e.g. CNBC's
        // news river) without trusting a volatile text fingerprint — see refresh-engine.js
        // _structureMarkerMatches(). Deliberately attribute-only (data-testid/data-test), not a
        // class-name convention: a class token can legitimately repeat across similar-but-
        // different widgets on the same page (rejected in #77's design after a real product-proxy
        // objection), while a test-id attribute is purpose-built per-instance identity.
        const structureMarker = extractStructureMarker(fpRoot);
        // 🎯 BATCH 2: Use finalPositionBased (user's selection from Advanced panel)
        // Don't recalculate - respect user's choice even if it conflicts with heading presence
        log('📍 Using final capture mode:', finalPositionBased ? 'Position-based' : 'Header-based');
        
        // Extract domain for favicon
        const domain = new URL(window.location.href).hostname;
        const faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
        
        const component = {
          id: crypto.randomUUID(),
          url: window.location.href,
          selector: selector,
          name: name,
          html_cache: cleanedHTML,
          last_refresh: new Date().toISOString(),
          created_at: new Date().toISOString(), // Track creation time separately from refresh
          favicon: faviconUrl,
          rawCaptureLength: rawCaptureLength
        };
        
        log('📦 Component object created:', component.id);

        // Save with hybrid storage model
        log('💾 Attempting hybrid save (sync + local)...');
        
        // Prepare metadata for sync storage (includes selector for cross-device refresh)
        const metadata = {
          id: component.id,
          url: component.url,
          name: component.name,
          favicon: component.favicon,
          customLabel: undefined,  // New captures don't have custom labels yet
          selector: component.selector,
          headingFingerprint: headingFingerprint,  // 🎯 BATCH 2: Auto-extracted for self-healing
          structureMarker: structureMarker,  // issue #77: capture-time identity marker for feed-rotation rescue
          positionBased: finalPositionBased  // 🎯 BATCH 2: Use user's final selection from Advanced panel
          // #90: excludedSelectors ride in sync when they fit; otherwise fitSyncRecord() below
          // drops them from the sync record. Local ALWAYS keeps a copy (componentsData).
        };
        console.log('💾 Storing metadata in sync storage, exclusions in local storage (and sync if they fit)');

        // 🎯 Playground capture: save to storage.local ONLY (avoid sync quota pressure)
        if (getIsPlaygroundPage()) {
          const playgroundKey = `playground-${component.id}`;
          const playgroundData = {
            [playgroundKey]: {
              id: component.id,
              name: metadata.name,
              url: metadata.url,
              favicon: metadata.favicon,
              selector: metadata.selector,
              html_cache: component.html_cache,
              last_refresh: component.last_refresh,
              created_at: component.created_at,
              isPlaygroundCapture: true
            }
          };

          chrome.storage.local.set(playgroundData, () => {
            if (chrome.runtime.lastError) {
              console.error('❌ Playground save failed:', chrome.runtime.lastError);
              showStyledNotification(`❌ ${friendlySaveError(chrome.runtime.lastError.message)}`, 'error');
              return;
            }

            log('✅ Playground capture saved to local storage:', playgroundKey);

            // Update beacon: capture completed
            const beacon = document.getElementById('sb-onboarding-beacon');
            if (beacon) {
              console.log('[SB] beacon: completed, getIsPlaygroundPage()=', getIsPlaygroundPage());
              beacon.dataset.stage = 'completed';
              log('🎯 Playground beacon updated: data-stage=completed');
            }

            // Auto-dismiss the confirmation modal on playground — "You did it!" card takes over
            const confirmModal = document.getElementById('spotboard-capture-confirmation');
            if (confirmModal) confirmModal.remove();

            // Clear visuals and show notification
            target.style.outline = '';
            target.style.cursor = '';
            lockedElement = null;
            resetExclusions();

            // Skip notification on playground — "You did it!" card in sandbox.html takes over
            toggleCapture(false);

            // GA4: Track playground capture
            chrome.runtime.sendMessage({
              type: 'GA4_EVENT',
              eventName: 'capture_completed',
              params: {
                url_domain: 'playground',
                capture_mode: finalPositionBased ? 'position' : 'selector',
                is_playground: true
              }
            });
          });
          return; // Skip normal sync+local save flow
        }

        // #52: re-capture replaces the existing card in place -- no new id, no new card.
        if (recaptureCtx) {
          const ctx = recaptureCtx;
          target.style.outline = '';
          target.style.cursor = '';
          lockedElement = null;
          resetExclusions();
          commitRecapture(ctx, {
            selector: component.selector,
            headingFingerprint,
            structureMarker,
            positionBased: finalPositionBased,
            excludedSelectors,
            html_cache: component.html_cache,
            rawCaptureLength: component.rawCaptureLength,
            exclusionSignatures
          });
          return;
        }

        // Onboarding mode: show completion overlay
        if (wasOnboarding) {
          console.debug('[sb-onboarding] calling advanceOnboardingCoach(completed). body.lastChild before:', document.body.lastElementChild?.id);
          advanceOnboardingCoach('completed', component.id);
          console.debug('[sb-onboarding] advanceOnboardingCoach done. body.lastChild after:', document.body.lastElementChild?.id);
        }

        // NEW: Save with per-component key instead of array
        const syncKey = `comp-${component.id}`;
        const fittedSync = fitSyncRecord(syncKey, {
            id: component.id,
            name: metadata.name,
            url: metadata.url,
            favicon: metadata.favicon,
            customLabel: metadata.customLabel,
            selector: metadata.selector,
            headingFingerprint: metadata.headingFingerprint,
            structureMarker: metadata.structureMarker, // issue #77: capture-time identity marker for feed-rotation rescue
            positionBased: finalPositionBased, // 🎯 BATCH 2: User's final selection from Advanced panel
            excludedSelectors: excludedSelectors, // synced for cross-device when it fits (#90)
            last_refresh: component.last_refresh,
            created_at: component.created_at // Track creation time for analytics
          });
        if (!fittedSync.fits) {
          console.error('❌ Card record over the sync cap even without exclusions');
          showStyledNotification(`❌ ${SAVE_TOO_BIG_MESSAGE}`, 'error');
          return;
        }
        const syncData = { [syncKey]: fittedSync.record };

        log('💾 Saving component with key:', syncKey);

        // Save metadata to sync storage with per-component key
        chrome.storage.sync.set(syncData, () => {
            if (chrome.runtime.lastError) {
              console.error('❌ Sync storage set error:', chrome.runtime.lastError);
              showStyledNotification(`❌ ${friendlySaveError(chrome.runtime.lastError.message)}`, 'error');
              return;
            }

            log('✅ Metadata saved to sync storage');

            // Save full component data to local storage (including selector)
            chrome.storage.local.get(['componentsData'], (localResult) => {
              if (chrome.runtime.lastError) {
                console.error('❌ Local storage GET error:', chrome.runtime.lastError);
                showStyledNotification(`❌ Save failed: Could not read local storage`, 'error');
                return;
              }

              const localData: Record<string, any> = localResult.componentsData || {};

              const dataToSave = {
                selector: component.selector,
                html_cache: component.html_cache,
                last_refresh: component.last_refresh,
                excludedSelectors: excludedSelectors,
                rawCaptureLength: component.rawCaptureLength,
                // #96: local-only (device-specific like html_cache); absent = "unverified"
                exclusionSignatures: exclusionSignatures
              };

              localData[component.id] = dataToSave;

              chrome.storage.local.set({ componentsData: localData }, () => {
                if (chrome.runtime.lastError) {
                  console.error('❌ Local storage set error:', chrome.runtime.lastError);
                  showStyledNotification(`❌ ${friendlySaveError(chrome.runtime.lastError.message)}`, 'error');
                  return;
                }

                // 🔍 VERIFICATION: Read back to confirm save succeeded
                chrome.storage.local.get(['componentsData'], (verifyResult: { componentsData?: Record<string, any> }) => {
                  const savedData = verifyResult.componentsData?.[component.id];
                  if (!savedData || !savedData.html_cache) {
                    console.error('❌ VERIFICATION FAILED: Component not found in local storage after save!');
                    console.error('   Component ID:', component.id);
                    console.error('   Keys in storage:', Object.keys(verifyResult.componentsData || {}));

                    // 🎯 BATCH 5: Track capture failure
                    chrome.runtime.sendMessage({
                      type: 'GA4_EVENT',
                      eventName: 'capture_failed',
                      params: {
                        url_domain: new URL(window.location.href).hostname,
                        error_type: 'storage_verification_failed',
                        selector_type: selector.includes('#') ? 'id' : selector.includes('[data-') ? 'data-attr' : 'class'
                      }
                    }, (response) => {
                      if (response?.success) {
                        console.log('📊 GA4: capture_failed tracked');
                      }
                    });

                    showStyledNotification(`⚠️ Warning: Save may have failed - please refresh dashboard`, 'error');
                  } else {
                    // GA4: Track first capture (one-time event)
                    console.log('🔍 DEBUG: Verification passed, checking GA4 first_capture...');
                    chrome.storage.local.get(['firstCaptureCompleted'], (captureFlags) => {
                      console.log('🔍 DEBUG: firstCaptureCompleted flag:', captureFlags.firstCaptureCompleted);
                      if (!captureFlags.firstCaptureCompleted) {
                        console.log('🔍 DEBUG: Sending first_capture message to background...');
                        chrome.runtime.sendMessage({
                          type: 'GA4_EVENT',
                          eventName: 'first_capture',
                          params: {
                            url_domain: new URL(window.location.href).hostname,
                            capture_mode: finalPositionBased ? 'position' : 'selector'
                          }
                        }, (response) => {
                          console.log('🔍 DEBUG: Background response:', response);
                        });
                        chrome.storage.local.set({ firstCaptureCompleted: true });
                        console.log('📊 GA4: first_capture sent');
                      } else {
                        console.log('🔍 DEBUG: first_capture already tracked, skipping');
                      }
                    });

                    // 📊 GA4: Track every capture (not just first)
                    chrome.runtime.sendMessage({
                      type: 'GA4_EVENT',
                      eventName: 'capture_completed',
                      params: {
                        url_domain: new URL(window.location.href).hostname,
                        capture_mode: finalPositionBased ? 'position' : 'selector',
                        has_exclusions: excludedSelectors.length > 0,
                        empty_warning_bypassed: bypassedEmptyWarning
                      }
                    });

                    log('✅ Full data saved to local storage');
                    log('✅ Component saved successfully (hybrid)!');

                    // Clear green flash and unlock
                    target.style.outline = '';
                    target.style.cursor = '';
                    lockedElement = null;
                    resetExclusions();

                    if (!wasOnboarding) {
                      showStyledNotification(`✅ Spotted: ${name}`, 'success', component.id);
                      toggleCapture(false);
                    } else {
                      console.debug('[sb-onboarding] wasOnboarding=true — skipping showStyledNotification and extra toggleCapture');
                    }
                  }
                });
              });
            });
          });
        }; // end commitCapture()

        // #9: warn only when essentially NOTHING was captured. Principle: SpotBoard does
        // not decide whether short content is worth tracking -- "0 results", "N/A", "No new
        // messages", "52%" are all legitimate things a user may intentionally capture, so
        // length alone never condemns a capture. We intervene only when the output is
        // structurally empty: near-zero text AND zero structural/media nodes.
        //
        // Deliberately NOT isContentLost() -- that guard's job is refresh safety (compare a
        // fresh result against a known-good cache). A first capture has no baseline, so the
        // only thing we can assert with high confidence is "structurally empty". A lone
        // "Loading..." capture passes this rule by design; we don't special-case loading
        // strings, and the confirmation preview already shows the user what they're saving.
        //
        //  - VOLATILE_FINGERPRINT_RE exemption: a bare single-digit value ("0", "5" -- a
        //    count or score) is a valid tiny card, not garbage. Anchored regex.
        //  - Playground is a guided flow on a controlled page -> never warn.
        //  - Onboarding (#31): we DO catch empties now -- silently saving a blank first card
        //    and then celebrating it is the worst possible first impression. But a brand-new
        //    user should be nudged to pick a better section, not shown the "capture anyway?"
        //    bypass prompt as their first outcome (handled just below, before the modal).
        const looksEmpty = looksEmptyCapture(cleanedHTML, getIsPlaygroundPage());

        if (!looksEmpty) {
          commitCapture();
          return;
        }

        // #52: a re-capture must never replace a card with an empty result, and offering
        // "capture anyway" here would let it. Same nudge as onboarding: pick again, no save.
        if (recaptureCtx) {
          log('⚠️ Re-capture looks empty — keeping the old card, prompting a new pick.');
          target.style.outline = '';
          target.style.cursor = '';
          lockedElement = null;
          resetExclusions();
          toggleCapture(true);
          showCaptureHint('That section looks empty — pick another one. Your card is unchanged.');
          return;
        }

        // Onboarding: never silently save a useless first card, and never make the bypass
        // prompt the first thing a new user sees. Clear the selection, nudge toward a bigger
        // block, and re-arm capture so they can immediately try again. (Not a state machine:
        // a repeat empty just shows the hint again; the #9 modal below is unchanged for
        // every non-onboarding capture.)
        if (wasOnboarding) {
          log('⚠️ Onboarding capture looks empty — prompting retry instead of saving.');
          target.style.outline = '';
          target.style.cursor = '';
          lockedElement = null;
          resetExclusions();
          toggleCapture(true); // re-arm first so the banner/coach are back
          showCaptureHint('Pick a bigger section — try a paragraph or a whole card.');
          return;
        }

        log('⚠️ Capture looks empty — warning before save.');

        // Tear capture mode down before showing the decision modal. Capture-mode's
        // document-level hover handlers (handleHover/handleExit) call
        // style.removeProperty('background'/'outline') on whatever the cursor leaves --
        // which strips this modal's own background to transparent when the user mouses
        // over it. commitCapture() and the Cancel handler below don't need capture mode
        // active (they use closure state), and both call toggleCapture(false) again
        // harmlessly. This also clears the locked element's green page outline.
        toggleCapture(false);

        // #13: shadow-hosted (see createOverlayShadowHost) -- host carries the id, no other
        // code looks this overlay up by id so nothing external needs adjusting for it.
        const { host: warnHost, shadow: warnShadow } = createOverlayShadowHost('spotboard-empty-capture-warning');
        const warnOverlay = document.createElement('div');
        warnOverlay.style.cssText = `
          position: fixed !important; top: 0 !important; left: 0 !important;
          right: 0 !important; bottom: 0 !important;
          background: rgba(0, 0, 0, 0.5) !important;
          display: flex !important; justify-content: center !important; align-items: center !important;
          z-index: 2147483647 !important; isolation: isolate !important; pointer-events: auto !important;
          text-transform: none !important;
        `;
        const warnBox = document.createElement('div');
        warnBox.style.cssText = `
          background: #742a2a !important; color: white !important; padding: 24px !important;
          border-radius: 8px !important; max-width: 400px !important; width: 90% !important;
          text-align: center !important; position: relative !important; z-index: 2147483647 !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
        `;
        const warnMsg = document.createElement('div');
        warnMsg.style.cssText = `font-size: 15px !important; line-height: 1.5 !important; margin-bottom: 20px !important; font-family: inherit !important;`;
        warnMsg.textContent = '⚠️ This spot looks empty — there’s almost nothing to save. Capture it anyway?';
        const warnRow = document.createElement('div');
        warnRow.style.cssText = `display: flex !important; gap: 12px !important; font-family: inherit !important;`;
        const warnProceed = document.createElement('button');
        warnProceed.textContent = 'Capture anyway';
        warnProceed.style.cssText = `flex: 1 !important; padding: 12px !important; background: #48bb78 !important; color: white !important; border: none !important; border-radius: 4px !important; cursor: pointer !important; font-size: 14px !important; font-weight: 600 !important; font-family: inherit !important; text-transform: none !important;`;
        const warnCancel = document.createElement('button');
        warnCancel.textContent = 'Cancel';
        warnCancel.style.cssText = `flex: 1 !important; padding: 12px !important; background: #f56565 !important; color: white !important; border: none !important; border-radius: 4px !important; cursor: pointer !important; font-size: 14px !important; font-weight: 600 !important; font-family: inherit !important; text-transform: none !important;`;

        const closeWarn = () => {
          warnHost.remove();
          document.removeEventListener('keydown', warnKeyHandler, true);
        };
        const proceedAnyway = (e?: Event) => {
          if (e) { e.stopPropagation(); e.preventDefault(); }
          closeWarn();
          commitCapture(true);
        };
        const cancelCapture = (e?: Event) => {
          if (e) { e.stopPropagation(); e.preventDefault(); }
          closeWarn();
          target.style.outline = '';
          target.style.cursor = '';
          lockedElement = null;
          resetExclusions();
          chrome.runtime.sendMessage({
            type: 'GA4_EVENT',
            eventName: 'capture_cancelled',
            params: {
              url_domain: new URL(window.location.href).hostname,
              stage: 'empty_warning',
              method: 'button',
              had_preview: true,
              had_exclusions: excludedElements.length > 0
            }
          });
          toggleCapture(false);
        };
        const warnKeyHandler = (e: KeyboardEvent) => {
          if (e.key === 'Escape') cancelCapture(e);
        };

        warnProceed.addEventListener('click', proceedAnyway, true);
        warnCancel.addEventListener('click', cancelCapture, true);
        document.addEventListener('keydown', warnKeyHandler, true);

        warnRow.appendChild(warnProceed);
        warnRow.appendChild(warnCancel);
        warnBox.appendChild(warnMsg);
        warnBox.appendChild(warnRow);
        warnOverlay.appendChild(warnBox);
        warnShadow.appendChild(warnOverlay);
        warnCancel.focus();

        chrome.runtime.sendMessage({
          type: 'GA4_EVENT',
          eventName: 'capture_empty_warning',
          params: { url_domain: new URL(window.location.href).hostname }
        });
      }, 2000);
    }, true); // Use capture phase
  }
  
  // Cancel button handler - use capture phase
  const cancelBtn = modal.querySelector('#cancelSpot') as HTMLButtonElement;
  if (cancelBtn) {
    cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
      e.preventDefault();
      host.remove();
      document.getElementById('spotboard-exclusion-banner')?.remove();
      _confirmationShadow = null;
      // Clear green flash and unlock
      target.style.outline = '';
      target.style.cursor = '';
      lockedElement = null;
      resetExclusions();
      // 📊 GA4: Track cancellation
      chrome.runtime.sendMessage({
        type: 'GA4_EVENT',
        eventName: 'capture_cancelled',
        params: {
          url_domain: new URL(window.location.href).hostname,
          stage: 'preview_shown',
          method: 'button',
          had_preview: true,
          had_exclusions: excludedElements.length > 0
        }
      });
      recaptureCtx = null; // #52: cancelled -- the card stays exactly as it was
            toggleCapture(false);
    }, true); // Use capture phase
  }
  
  // Handle Escape key to close modal
  const escapeHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
            host.remove();
      document.getElementById('spotboard-exclusion-banner')?.remove();
      _confirmationShadow = null;
      target.style.outline = '';
      target.style.cursor = '';
      lockedElement = null;
      resetExclusions();
      // 📊 GA4: Track cancellation via Escape
      chrome.runtime.sendMessage({
        type: 'GA4_EVENT',
        eventName: 'capture_cancelled',
        params: {
          url_domain: new URL(window.location.href).hostname,
          stage: 'preview_shown',
          method: 'escape',
          had_preview: true,
          had_exclusions: excludedElements.length > 0
        }
      });
            document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);
}

// 4. Escape Key Handler
function handleKeydown(event: KeyboardEvent) {
  // The Enter/Esc that commits or cancels an IME composition arrives as a keydown too
  // (isComposing / keyCode 229) -- it belongs to the text being composed, not to us (#42).
  if (event.isComposing || event.keyCode === 229) return;

  // #42: Enter = Continue, but only while the refinement bar is up and the user isn't typing
  // into a page field (search boxes etc.) -- never hijack Enter there.
  if (event.key === "Enter" && isCapturing && refineState) {
    // Enter on a keyboard-focused bar button activates that button (Shrink/Grow/Continue).
    if ((event.target as HTMLElement | null)?.id === 'spotboard-refine-bar') return;
    // Walk into open shadow roots: inside a web component, activeElement is just the host.
    let active = document.activeElement as HTMLElement | null;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement as HTMLElement;
    if (active && (active.matches('input, textarea, select') || active.isContentEditable)) return;
    event.preventDefault();
    event.stopPropagation();
    continueRefinement();
    return;
  }

  if (event.key === "Escape" && isCapturing) {
    if (getIsOnboardingMode()) return;
    // 📊 GA4: Track selector-stage cancellation (no preview was shown)
    chrome.runtime.sendMessage({
      type: 'GA4_EVENT',
      eventName: 'capture_cancelled',
      params: {
        url_domain: new URL(window.location.href).hostname,
        stage: refineState ? 'refining' : 'selector_open',
        method: 'escape',
        had_preview: false,
        had_exclusions: false
      }
    });
    recaptureCtx = null; // #52: cancelled -- the card stays exactly as it was
    toggleCapture(false);
    // Silent cancellation — banner disappearing is sufficient visual feedback
  }
}

// #52: replace an existing card's capture in place. Order matters: claim the session (a newer
// re-capture for the same card, or a closed/abandoned tab, loses), re-read the stored card (deleted
// meanwhile -> abort, never resurrect), then local html BEFORE sync metadata so a half-failed save
// leaves the old card still pointing at content that exists.
function commitRecapture(
  ctx: { cardId: string; sessionId: string; label: string },
  capture: Parameters<typeof mergeRecapture>[2]
) {
  const finish = () => { recaptureCtx = null; toggleCapture(false); };
  const fail = (message: string) => { showStyledNotification(`❌ ${message}`, 'error'); finish(); };

  chrome.runtime.sendMessage({ type: 'RECAPTURE_CLAIM', cardId: ctx.cardId, sessionId: ctx.sessionId }, (claimed: boolean) => {
    if (chrome.runtime.lastError || !claimed) {
      fail('This re-capture was replaced by a newer one. Start it again from your board.');
      return;
    }
    const syncKey = `comp-${ctx.cardId}`;
    chrome.storage.sync.get(syncKey, (syncRes) => {
      const existing = syncRes?.[syncKey] as Record<string, unknown> | undefined;
      if (chrome.runtime.lastError || !existing) {
        fail('That card no longer exists on your board, so nothing was changed.');
        return;
      }
      chrome.storage.local.get(['componentsData'], (localRes) => {
        const localData = (localRes?.componentsData || {}) as Record<string, Record<string, unknown>>;
        const merged = mergeRecapture(existing, localData[ctx.cardId], capture, new Date().toISOString());
        const fitted = fitSyncRecord(syncKey, merged.sync);
        if (!fitted.fits) {
          fail(SAVE_TOO_BIG_MESSAGE);
          return;
        }
        localData[ctx.cardId] = merged.local;
        chrome.storage.local.set({ componentsData: localData }, () => {
          if (chrome.runtime.lastError) {
            fail(friendlySaveError(chrome.runtime.lastError.message));
            return;
          }
          chrome.storage.sync.set({ [syncKey]: fitted.record }, () => {
            if (chrome.runtime.lastError) {
              fail(friendlySaveError(chrome.runtime.lastError.message));
              return;
            }
            chrome.runtime.sendMessage({ type: 'GA4_EVENT', eventName: 'recapture_completed', params: { url_domain: new URL(window.location.href).hostname } });
            chrome.runtime.sendMessage({ type: 'CARD_RECAPTURED', cardId: ctx.cardId }, () => void chrome.runtime.lastError);
            recaptureCtx = null;
            showStyledNotification(`✅ Re-captured: ${ctx.label}`, 'success', ctx.cardId);
            toggleCapture(false);
          });
        });
      });
    });
  });
}

// Main Toggle Logic

// Show persistent lime banner when capture mode is active (capture = lime, exclusion = purple)
function showCaptureBanner() {
  // Don't create duplicate
  if (document.getElementById('spotboard-capture-banner')) return;
  const instructions: (Node | string)[] = recaptureCtx
    ? [
        stripBold('click'), ' on the section to re-capture for ',
        stripBold(`\u201c${recaptureCtx.label.length > 40 ? recaptureCtx.label.slice(0, 40) + '\u2026' : recaptureCtx.label}\u201d`),
        ' \u00b7 ', stripKbd('Esc'), ' to cancel'
      ]
    : [stripBold('hover'), ' to preview, ', stripBold('click'), ' on any content you want to add to your board \u00b7 ', stripKbd('Esc'), ' to cancel'];
  document.body.appendChild(createCaptureStrip('spotboard-capture-banner', 1, instructions));
}

// 🎯 #60: shown for the whole exclusion-mode step (from when the overlay first opens) —
// reuses the top-banner slot (rather than duplicating instructions in the overlay too) recolored
// into an "exclusion mode" indicator. Shown for the whole exclusion-mode duration —
// independent of the overlay's own minimize/expand — and torn down alongside the modal
// on every exit path (confirm/cancel/Esc/capture-mode teardown). Purely informational
// (pointer-events: none, like the yellow banner) and marked data-spotboard-ignore so
// it's never itself treated as an exclusion target (handleClick already skips
// [data-spotboard-ignore] before touching excludedElements).
function showExclusionBanner() {
  document.getElementById('spotboard-exclusion-banner')?.remove();

  const banner = document.createElement('div');
  banner.id = 'spotboard-exclusion-banner';
  banner.setAttribute('data-spotboard-ignore', 'true');
  banner.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    background: #6b46c1 !important;
    color: #ffffff !important;
    padding: 10px 20px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    text-align: center !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
    font-size: 14px !important;
    font-weight: 400 !important;
    z-index: 2147483646 !important;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
    pointer-events: none !important;
  `;

  const hl = 'color: #fbbf24 !important; font-weight: 700 !important;';
  banner.innerHTML = `
    <span style="pointer-events: none;">❎ <strong style="font-weight: 700 !important;">EXCLUSION MODE</strong> - <span style="${hl}">click</span> an element to exclude or restore an area, <span style="${hl}">[Shift] + click</span> to exclude or restore entire similar area</span>
  `;

  document.body.appendChild(banner);
}

// Lightweight, non-blocking, self-dismissing hint shown while capture mode stays active
// (e.g. onboarding "pick a bigger section" recovery). Not showStyledNotification — that is a
// full-screen blocking modal with a "View on SpotBoard" button, wrong for a "try again" nudge.
function showCaptureHint(message: string) {
  const existing = document.getElementById('spotboard-capture-hint');
  if (existing) existing.remove();
  const hint = document.createElement('div');
  hint.id = 'spotboard-capture-hint';
  hint.setAttribute('data-spotboard-ignore', 'true');
  hint.textContent = message;
  hint.style.cssText = `
    position: fixed !important; bottom: 24px !important; left: 50% !important;
    transform: translateX(-50%) !important;
    background: #1c1c1e !important; color: #f5f5f7 !important;
    padding: 12px 20px !important; border-radius: 10px !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
    font-size: 14px !important; font-weight: 500 !important;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35) !important;
    z-index: 2147483646 !important; pointer-events: none !important;
    max-width: 360px !important; text-align: center !important;
  `;
  document.body.appendChild(hint);
  setTimeout(() => hint.remove(), 4000);
}

function toggleCapture(forceState?: boolean) {
  isCapturing = forceState !== undefined ? forceState : !isCapturing;
  
  if (isCapturing) {
    log("🟢 Capture Mode: ON");
    document.addEventListener('mouseover', handleHover, true);
    document.addEventListener('mousemove', handleExclusionHover, true);
    document.addEventListener('mouseout', handleExit, true);
    document.addEventListener('scroll', hideHoverHint, true); // #106: chip is fixed-position, box moves
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeydown, true);
    
    // 🎯 Show persistent lime banner at top
    showCaptureBanner();

    // Update playground beacon: capture mode activated
    if (getIsPlaygroundPage()) {
      const beacon = document.getElementById('sb-onboarding-beacon');
      if (beacon) {
        console.log('[SB] beacon: capturing, getIsPlaygroundPage()=', getIsPlaygroundPage());
        beacon.dataset.stage = 'capturing';
        log('🎯 Playground beacon updated: data-stage=capturing');
      }
    }
    if (getIsOnboardingMode()) advanceOnboardingCoach('capturing');
  } else {
    log("🔴 Capture Mode: OFF");
    document.removeEventListener('mouseover', handleHover, true);
    document.removeEventListener('mousemove', handleExclusionHover, true);
    document.removeEventListener('mouseout', handleExit, true);
    document.removeEventListener('scroll', hideHoverHint, true);
    document.removeEventListener('mousedown', handleMouseDown, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleKeydown, true);

    hideHoverHint();
    // #42: capture ended (Esc / popup toggle) while still refining -- report and tear down the bar.
    endRefinement('cancel');

    // Force cleanup all visuals
    document.querySelectorAll('*').forEach(el => {
      (el as HTMLElement).style.outline = '';
      (el as HTMLElement).style.cursor = '';
    });
    
    // Remove capture banner
    const banner = document.getElementById('spotboard-capture-banner');
    if (banner) banner.remove();
    document.getElementById('spotboard-exclusion-banner')?.remove();
  }
}

// Message Listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Respond to ping to confirm content script is loaded
  if (request.type === 'PING') {
    sendResponse({ status: 'ready' });
    return true; // Keep message channel open for async response
  }
  
  if (request.message === "TOGGLE_CAPTURE" || request.type === "TOGGLE_CAPTURE") {
    recaptureCtx = null; // #52: the popup starts/stops a NORMAL capture -- never a re-capture
    toggleCapture();
  }
});