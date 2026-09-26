// #103: per-card list format (Off / Bullets / Numbered), applied at RENDER time only.
// html_cache is never modified: callers set the card's content from html_cache and then call
// applyListFormat() on that fresh DOM, so every refresh route renders the same way and
// "Off" is exactly today's rendering.

export type ListFormat = 'off' | 'bullets' | 'numbered'

export const LIST_FORMATS: ListFormat[] = ['off', 'bullets', 'numbered']

// Missing / invalid (old builds, hand-edited or garbage import files) => off.
export function normaliseListFormat(value: unknown): ListFormat {
  return value === 'bullets' || value === 'numbered' ? value : 'off'
}

// A run needs 3+ rows: two lookalike siblings are usually layout (label/value, left/right), not a list.
// Measured on real cards: at 2, a homepage-style card got 23 tiny lists; at 3, none.
const MIN_RUN = 3

// A run item is a one-liner (headline / deal / row). ~240 chars is 2-3 lines in a 1x1 card;
// anything longer is prose (article paragraphs) and is left alone.
const MAX_ITEM_TEXT = 240

// Items that already carry their own structure, or are not "a row of text".
const SKIP_ITEM_TAGS = new Set([
  'LI', 'TR', 'TD', 'TH', 'DT', 'DD', 'OPTION', 'SUMMARY', 'IMG', 'PICTURE', 'SVG', 'BR', 'HR',
  'SCRIPT', 'STYLE', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'HEADER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
])
// Never descend into these: already a list / table / form control.
const SKIP_SUBTREE_TAGS = new Set(['UL', 'OL', 'TABLE', 'SELECT', 'SVG', 'SCRIPT', 'STYLE'])

const signature = (el: Element) => `${el.tagName}|${(el.getAttribute('class') || '').trim().replace(/\s+/g, ' ')}`

function isListableItem(el: Element): boolean {
  if (SKIP_ITEM_TAGS.has(el.tagName)) return false
  const text = (el.textContent || '').trim()
  return text.length > 0 && text.length <= MAX_ITEM_TEXT
}

// Maximal runs of >=MIN_RUN consecutive element children sharing tag + class, every item listable.
function findRuns(parent: Element): Element[][] {
  const kids = Array.from(parent.children)
  const runs: Element[][] = []
  let i = 0
  while (i < kids.length) {
    let j = i + 1
    while (j < kids.length && signature(kids[j]) === signature(kids[i])) j++
    const run = kids.slice(i, j)
    if (run.length >= MIN_RUN && run.every(isListableItem)) runs.push(run)
    i = j
  }
  return runs
}

function collectRuns(node: Element, out: Element[][]): void {
  if (SKIP_SUBTREE_TAGS.has(node.tagName)) return
  const runs = findRuns(node)
  const inRun = new Set<Element>()
  for (const run of runs) {
    out.push(run)
    run.forEach(el => inRun.add(el))
  }
  // Items of an accepted run are not searched further (no nested lists in v1).
  for (const child of Array.from(node.children)) {
    if (!inRun.has(child)) collectRuns(child, out)
  }
}

/**
 * Wraps each detected run of repeated sibling rows in a native <ul>/<ol> with each row in an <li>.
 * Returns how many lists were created (0 => nothing detected; the DOM is left untouched).
 * Expects a freshly rendered container: call it once per render, never on already-formatted DOM
 * (an existing ul/ol is skipped, so a second call is also a no-op).
 */
export function applyListFormat(container: Element, format: unknown): number {
  const fmt = normaliseListFormat(format)
  if (fmt === 'off') return 0
  const runs: Element[][] = []
  collectRuns(container, runs)
  const doc = container.ownerDocument
  for (const run of runs) {
    const list = doc.createElement(fmt === 'numbered' ? 'ol' : 'ul')
    list.className = 'sb-list'
    run[0].parentNode!.insertBefore(list, run[0])
    for (const item of run) {
      const li = doc.createElement('li')
      li.appendChild(item)
      list.appendChild(li)
    }
  }
  return runs.length
}

// Dry run for the menu hint ("No list found in this card"): would applying a format change anything?
export function hasListableItems(container: Element): boolean {
  const runs: Element[][] = []
  collectRuns(container, runs)
  return runs.length > 0
}
