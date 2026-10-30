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

// #229: a run of labels (job tags "£40ph / London / Part-time", "0%", "Nov 2024") is incidental, not a list worth
// offering. Measured on the 30-card board (44 runs): those runs average 3-16 characters per item, the shortest
// real run (ign.com headlines) averages 35. 25 sits in the gap; 12 / 20 / 30 give the same board result.
// Known trade-off: a real list of very short rows (bare score lines like "LAL 102 BOS 99") is not offered a list;
// the board has no such card, so loosen only on a real example.
const MIN_AVG_ITEM_TEXT = 25

// Items that already carry their own structure, or are not "a row of text".
const SKIP_ITEM_TAGS = new Set([
  'LI', 'TR', 'TD', 'TH', 'DT', 'DD', 'OPTION', 'SUMMARY', 'IMG', 'PICTURE', 'SVG', 'BR', 'HR',
  'SCRIPT', 'STYLE', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'HEADER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
])
// Never descend into these: already a list / table / form control.
const SKIP_SUBTREE_TAGS = new Set(['UL', 'OL', 'TABLE', 'SELECT', 'SVG', 'SCRIPT', 'STYLE'])

const signature = (el: Element) => `${el.tagName}|${(el.getAttribute('class') || '').trim().replace(/\s+/g, ' ')}`

// #228: sites that stamp per-item ids/taxonomy into class (WordPress post-123, tag-*, category-*) give every
// row a different class string. Such rows are still one template when they share the root (first) class AND the
// same inner element structure. Measured on a 30-card board: sharing any class token instead groups unrelated
// Tailwind chips into dozens of tiny lists; first-class alone also regroups tiles that differ in structure.
const firstClass = (el: Element) => (el.getAttribute('class') || '').trim().split(/\s+/)[0] || ''
// An <svg> icon counts as one node: its internal paths say nothing about the row's template.
const skeleton = (el: Element): string =>
  el.tagName.toLowerCase() === 'svg' ? 'SVG()' : `${el.tagName}(${Array.from(el.children, skeleton).join(',')})`

// A button / tab / badge (with or without an icon) has 1-4 elements. Structure only counts as evidence of a
// template when the row has real inner structure: the row plus at least 4 descendants (real i Paper row: 6).
const MIN_TEMPLATE_NODES = 5
const nodeCount = (skel: string) => skel.split('(').length - 1

function sameTemplate(head: Element, el: Element): boolean {
  if (signature(el) === signature(head)) return true
  const root = firstClass(head)
  if (!root || firstClass(el) !== root) return false
  const skel = skeleton(head)
  return skel === skeleton(el) && nodeCount(skel) >= MIN_TEMPLATE_NODES
}

function isListableItem(el: Element): boolean {
  if (SKIP_ITEM_TAGS.has(el.tagName)) return false
  const text = (el.textContent || '').trim()
  return text.length > 0 && text.length <= MAX_ITEM_TEXT
}

const collapsedLength = (el: Element) => (el.textContent || '').replace(/\s+/g, ' ').trim().length
const isTinyRun = (run: Element[]) => run.reduce((sum, el) => sum + collapsedLength(el), 0) / run.length < MIN_AVG_ITEM_TEXT

// Maximal runs of >=MIN_RUN consecutive element children of one template (see sameTemplate), every item listable.
function findRuns(parent: Element): Element[][] {
  const kids = Array.from(parent.children)
  const runs: Element[][] = []
  let i = 0
  while (i < kids.length) {
    let j = i + 1
    while (j < kids.length && sameTemplate(kids[i], kids[j])) j++
    const run = kids.slice(i, j)
    if (run.length >= MIN_RUN && run.every(isListableItem) && !isTinyRun(run)) runs.push(run)
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
