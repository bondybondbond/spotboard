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
