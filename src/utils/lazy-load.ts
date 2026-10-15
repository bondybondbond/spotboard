// Scroll-triggered lazy content loader for one selected block (issue #72).
// Compiled to public/utils/lazy-load.js (IIFE, window.LazyLoad) by scripts/build-shared.js.
// Used by content.ts (capture, live tab) and refresh-engine.js (tryActiveTab popup).
//
// Some sites (e.g. CNBC's react-lazyload river) only mount a thumbnail once it is within about
// one viewport of the scroll position, so a block captured without scrolling holds a few real
// images and many empty placeholders. Only a real scroll makes the site's own loader mount them
// (synthetic events / loading=eager / scrolling a clone do not, and hidden tabs never fire).
//
// Kept separate from dom-snapshot.ts on purpose: extraction there stays a pure DOM transform;
// this module is the only place that performs browser interaction (scrolling).

// Fewer empty slots than this is noise (a stray empty wrapper), not a lazy-loading block, and
// is not worth a visible scroll. Same threshold as the direct-fetch gate in refresh-engine.js
// (which counts on a page with zero <img>, so it never meets the image elements skipped below).
export const MIN_EMPTY_SLOTS = 3

export const EMPTY_IMAGE_SLOT_SELECTOR = '[class*="thumbnail" i], [class*="image" i]'

export interface LazyLoadOptions {
  maxSteps?: number
  maxMs?: number
  maxDistance?: number
  stepWaitMs?: number
}

export interface LazyLoadResult {
  emptyBefore: number
  emptyAfter: number
  steps: number
  elapsedMs: number
  aborted: boolean
  capped: boolean
  stalled: boolean // scrolling was not making slots fill (false trigger) or the block was growing (feed)
}

// Elements that ARE the image (class="image__dam-img" on an <img> itself) are not slots waiting
// for one — counting them made every image-heavy card (CNN, Sky Sports) look unloaded.
const IMAGE_ELEMENT_TAGS = new Set(['IMG', 'PICTURE', 'SOURCE', 'SVG', 'VIDEO', 'CANVAS'])

/** A container classed as a thumbnail/image role that holds no <img>/<picture> and no text. */
export function countEmptyImageSlots(root: Element): number {
  let count = 0
  root.querySelectorAll(EMPTY_IMAGE_SLOT_SELECTOR).forEach(el => {
    if (IMAGE_ELEMENT_TAGS.has(el.tagName.toUpperCase())) return
    if (!el.querySelector('img, picture') && (el.textContent || '').trim() === '') count++
  })
  return count
}

// ─── Structure settle (issue #202) ──────────────────────────────────────────────────────────────
// Kalshi mounts its Breaking News + comments only once the page is scrolled in the narrow refresh
// popup, so the selected block arrives as the page head: no list items at all. That is detected
// from the structure, not the site: the saved copy has real structure and the live block has none.
// Same elements and the same >= 3 floor as isContentLost's structural-regression rule (dom-cleanup.ts).
export const STRUCTURAL_SELECTOR = 'li, tr, article'
export const MIN_SAVED_STRUCTURE = 3

export interface StructureSettleResult {
  triggered: boolean
  before: number
  peak: number
  count: number // raw li/tr/article left in the block when the settle ended
  steps: number
  elapsedMs: number
  aborted: boolean
  capped: boolean
}

export function countStructure(root: Element): number {
  return root.querySelectorAll(STRUCTURAL_SELECTOR).length
}

/** Only a block with NO structure against a structured saved copy is settled; anything else is left alone. */
export function needsStructureSettle(count: number, expected: number): boolean {
  return expected >= MIN_SAVED_STRUCTURE && count === 0
}

/**
 * "Comparable to the saved copy": at least half of it (and at least the floor). isContentLost only fails at
 * zero structure, so without this a settle that stalls at 2 of 36 items would replace a good copy with a stub.
 */
export function structureRecovered(count: number, expected: number): boolean {
  return count >= Math.max(MIN_SAVED_STRUCTURE, Math.ceil(expected / 2))
}

/**
 * Bounded scroll that stops when the block's structure stops growing. Runs only when
 * needsStructureSettle(); steps down the page by 0.6 x viewport, stops after 2 flat steps (no new
 * structure) once it has grown or as soon as it holds as much structure as the saved copy, plus one short
 * final settle, or at the step / time / page-bottom caps
 * (a block that never grows is walked once down the page, then given up on). Does NOT restore the
 * scroll position: the only caller is the refresh popup, which is discarded after extraction, and scrolling
 * back risks unmounting what was just mounted. Aborts if the user takes over (trusted input).
 */
export async function settleStructure(block: Element, expected: number, opts: LazyLoadOptions & { finalSettleMs?: number; resolve?: () => Element | null } = {}): Promise<StructureSettleResult> {
  const maxSteps = opts.maxSteps ?? 30
  const maxMs = opts.maxMs ?? 10000
  const stepWaitMs = opts.stepWaitMs ?? 350
  const finalSettleMs = opts.finalSettleMs ?? 500

  const started = Date.now()
  const before = countStructure(block)
  const result: StructureSettleResult = { triggered: false, before, peak: before, count: before, steps: 0, elapsedMs: 0, aborted: false, capped: false }
  if (!needsStructureSettle(before, expected)) return result
  result.triggered = true

  // The site may replace the block while mounting; a detached node would read 0 for the rest of the walk.
  let current = block
  const cur = () => { if (!current.isConnected && opts.resolve) current = opts.resolve() || current; return current }
  const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
  const onUserInput = (e: Event) => { if (e.isTrusted) result.aborted = true }
  const inputEvents = ['wheel', 'keydown', 'touchstart', 'mousedown']
  inputEvents.forEach(t => window.addEventListener(t, onUserInput, { capture: true, passive: true }))

  try {
    const viewportH = window.innerHeight
    const step = Math.max(300, Math.floor(viewportH * 0.6))
    let y = Math.max(0, block.getBoundingClientRect().top + window.scrollY - Math.floor(viewportH * 0.25))
    // Flat steps only count once the structure has started to grow: a lazy section mounts when its trigger
    // comes into range, which on Kalshi is the 4th step down the page (0, 0, 0, then 22 items, 15 Oct), so
    // before the first growth the walk simply continues down the page (bounded by the caps and the page bottom).
    let grew = false
    let flat = 0
    while (!result.aborted) {
      if (result.steps >= maxSteps || Date.now() - started >= maxMs) {
        result.capped = true
        break
      }
      window.scrollTo({ left: window.scrollX, top: y, behavior: 'instant' as ScrollBehavior })
      result.steps++
      await sleep(stepWaitMs)
      const now = countStructure(cur())
      if (now > result.peak) { grew = true; flat = 0 } else if (grew) flat++
      result.peak = Math.max(result.peak, now)
      if (grew && flat >= 2) break
      // Comparable to the saved copy is enough: do not keep scrolling to load an endless comments feed (15 Oct:
      // Kalshi grew 22 -> 68 items, a card 7x the saved text). The raw count here is >= the cleaned one, so the
      // extension still checks the cleaned capture afterwards.
      if (now >= expected) break
      // The page grows as sections mount, so the bottom is re-read every step.
      const pageBottom = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)
      y += step
      if (y > pageBottom) break
    }
    if (!result.aborted) {
      await sleep(finalSettleMs) // a late async burst after the last step
      result.peak = Math.max(result.peak, countStructure(cur()))
    }
  } finally {
    inputEvents.forEach(t => window.removeEventListener(t, onUserInput, { capture: true }))
    result.count = countStructure(cur())
    result.elapsedMs = Date.now() - started
  }
  return result
}

/**
 * Scrolls the window across `block` (and only across it) so lazy loaders can mount their
 * content, then restores the original scroll position. No-op when the block has fewer than
 * MIN_EMPTY_SLOTS empty image slots. Bounded by step / time / distance caps so a runaway or infinite feed cannot keep it
 * scrolling. Aborts without restoring if the user scrolls or types (their input wins).
 */
export async function ensureLazyContentLoaded(block: Element, opts: LazyLoadOptions = {}): Promise<LazyLoadResult> {
  const maxSteps = opts.maxSteps ?? 30
  const maxMs = opts.maxMs ?? 10000
  const maxDistance = opts.maxDistance ?? 20000
  const stepWaitMs = opts.stepWaitMs ?? 350

  const started = Date.now()
  const emptyBefore = countEmptyImageSlots(block)
  const result: LazyLoadResult = { emptyBefore, emptyAfter: emptyBefore, steps: 0, elapsedMs: 0, aborted: false, capped: false, stalled: false }
  if (emptyBefore < MIN_EMPTY_SLOTS) return result

  const originX = window.scrollX
  const originY = window.scrollY
  const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
  const scrollTop = (y: number) => window.scrollTo({ left: originX, top: y, behavior: 'instant' as ScrollBehavior })

  // Our own scrollTo never produces trusted wheel/key/touch/mouse events, so any of these
  // during the transaction is the user taking over.
  const onUserInput = (e: Event) => { if (e.isTrusted) result.aborted = true }
  const inputEvents = ['wheel', 'keydown', 'touchstart', 'mousedown']
  inputEvents.forEach(t => window.addEventListener(t, onUserInput, { capture: true, passive: true }))

  try {
    const viewportH = window.innerHeight
    const step = Math.max(300, Math.floor(viewportH * 0.6))
    let prevEmpty = emptyBefore
    let noProgress = 0
    let y = Math.max(0, block.getBoundingClientRect().top + window.scrollY - Math.floor(viewportH * 0.25))
    const startY = y

    while (true) {
      if (result.aborted) break
      if (result.steps >= maxSteps || Date.now() - started >= maxMs || y - startY > maxDistance) {
        result.capped = true
        break
      }
      scrollTop(y)
      result.steps++
      await sleep(stepWaitMs)
      if (result.aborted) break
      // Re-measure every step: mounting thumbnails and sticky headers shift the block.
      const rect = block.getBoundingClientRect()
      const blockBottom = rect.bottom + window.scrollY
      result.emptyAfter = countEmptyImageSlots(block)
      if (result.emptyAfter === 0) break
      // More empty slots than we started with = the site is appending items as we scroll (an
      // infinite feed), not mounting the ones already there. Two consecutive steps with no slot
      // filled = the "slots" were never lazy placeholders (or the loader is not responding).
      // Either way, stop instead of chasing them.
      noProgress = result.emptyAfter < prevEmpty ? 0 : noProgress + 1
      prevEmpty = result.emptyAfter
      if (result.emptyAfter > emptyBefore || noProgress >= 2) {
        result.stalled = true
        break
      }
      y += step
      if (y > blockBottom) break // the bottom of the block has been through the viewport
    }
  } finally {
    inputEvents.forEach(t => window.removeEventListener(t, onUserInput, { capture: true }))
    if (!result.aborted) scrollTop(originY)
    result.elapsedMs = Date.now() - started
  }
  return result
}
