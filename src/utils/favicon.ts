// Credential-free site icons (issue #207).
// Compiled to public/utils/favicon.js (IIFE, window.Favicon) by scripts/build-shared.js; App.tsx imports it directly.
//
// A plain <img src="https://www.google.com/s2/favicons?..."> makes Chrome attach the browser's google.com
// cookies (sign-in cookies included) to the first request; crossorigin="anonymous" does not stop it (probe, 18 Oct).
// fetch(..., { credentials: 'omit' }) from an extension page does: host_permissions covers google.com, so no CORS
// headers are needed, and the blob renders in an <img>. Same bytes, same Chrome cache behaviour.
//
// Stored cards keep their Google URL (no schema change, no migration): only `domain` and `sz` are read out of it,
// and this module only ever fetches that one endpoint.

export const FAVICON_ATTR = 'data-sb-favicon'

const ENDPOINT = 'https://www.google.com/s2/favicons'
const HOSTNAME = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i

export interface FaviconRequest {
  domain: string
  sz: string
}

// Anything that is not the Google favicon endpoint with a plain hostname is rejected (never fetched).
export function parseFaviconUrl(stored: string | null | undefined): FaviconRequest | null {
  if (!stored) return null
  let url: URL
  try { url = new URL(stored) } catch { return null }
  if (url.origin + url.pathname !== ENDPOINT) return null
  const domain = url.searchParams.get('domain') || ''
  const sz = url.searchParams.get('sz') || '32'
  if (domain.length > 253 || !HOSTNAME.test(domain) || !/^\d{1,3}$/.test(sz)) return null
  return { domain, sz }
}

const memo = new Map<string, Promise<string | null>>()

// Resolves to an object URL for the icon, or null (bad input, offline, or a non-image answer).
// Google answers an unknown site with a 404 that still carries an image, so the content type decides, not the status.
export function loadFavicon(stored: string | null | undefined): Promise<string | null> {
  const req = parseFaviconUrl(stored)
  if (!req) return Promise.resolve(null)
  const key = req.domain + '|' + req.sz
  let pending = memo.get(key)
  if (!pending) {
    pending = fetch(`${ENDPOINT}?sz=${req.sz}&domain=${encodeURIComponent(req.domain)}`, { credentials: 'omit' })
      .then(res => res.blob())
      .then(blob => (blob.type.startsWith('image/') ? URL.createObjectURL(blob) : null))
      .catch(() => null)
    memo.set(key, pending)
    // a failure is not remembered: a later render (back online) tries again
    pending.then(src => { if (!src) memo.delete(key) })
  }
  return pending
}

// Fills `src` for an <img data-sb-favicon="<stored url>">. A failure leaves it hidden and fires the img's own 'error' event, so the
// existing hide-on-error handlers behave exactly as they did with a broken Google URL.
export function hydrateFavicon(img: HTMLImageElement): void {
  const stored = img.getAttribute(FAVICON_ATTR)
  img.removeAttribute(FAVICON_ATTR)
  // An <img> with no src can show its alt text (the Help-window pills carry one); keep the box, hide the pixels until there is an icon.
  img.style.visibility = 'hidden'
  loadFavicon(stored).then(src => {
    if (src) {
      img.src = src
      img.style.visibility = ''
    } else {
      img.dispatchEvent(new Event('error'))
    }
  })
}

// Captured page HTML is shown inside .component-content: an attribute a captured page happens to carry must never
// make the dashboard fetch anything, so only SpotBoard's own markup outside it is hydrated.
const CAPTURED = '.component-content'

export function hydrateFavicons(root: ParentNode): void {
  root.querySelectorAll<HTMLImageElement>(`img[${FAVICON_ATTR}]`).forEach(img => { if (!img.closest(CAPTURED)) hydrateFavicon(img) })
}

// Dashboard: every <img data-sb-favicon> that is rendered, now or later, gets hydrated. No per-render-site call,
// so a new render path cannot forget it (tests/favicon-no-cookie.test.js guards against raw Google URLs).
export function observeFavicons(doc: Document): void {
  hydrateFavicons(doc)
  new MutationObserver(records => {
    for (const record of records) {
      record.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return
        const el = node as Element
        if (el.matches(`img[${FAVICON_ATTR}]`) && !el.closest(CAPTURED)) hydrateFavicon(el as HTMLImageElement)
        hydrateFavicons(el)
      })
    }
  }).observe(doc, { childList: true, subtree: true })
}
