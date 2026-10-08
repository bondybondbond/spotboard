// Minimal jsdom + chrome-extension-API environment for tests that import the bundled
// content-script/dom-cleanup modules under .test-build/. Intentionally NOT a full
// sinon-chrome mock — content.ts only touches chrome.runtime at module load and inside
// message handlers we never invoke from tests, so a handful of no-ops is enough (#40 plan:
// keep the stub inline, don't pull in a dependency for surface we don't exercise).
import { JSDOM } from 'jsdom'

// CSSOM "serialize an identifier" (what CSS.escape does in Chrome).
export function cssEscape(value) {
  const s = String(value)
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c === 0) { out += '�'; continue }
    const isDigit = c >= 0x30 && c <= 0x39
    if ((c >= 0x1 && c <= 0x1f) || c === 0x7f || (i === 0 && isDigit) || (i === 1 && isDigit && s.charCodeAt(0) === 0x2d)) {
      out += '\\' + c.toString(16) + ' '
    } else if (i === 0 && s.length === 1 && c === 0x2d) {
      out += '\\' + s[i]
    } else if (c >= 0x80 || c === 0x2d || c === 0x5f || isDigit || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) {
      out += s[i]
    } else {
      out += '\\' + s[i]
    }
  }
  return out
}

export function installDomEnv(html = '<!doctype html><html><body></body></html>') {
  const dom = new JSDOM(html, { url: 'https://example.com/' })
  const { window } = dom

  global.window = window
  global.document = window.document
  global.Node = window.Node
  global.HTMLElement = window.HTMLElement
  global.Element = window.Element
  global.SVGElement = window.SVGElement
  global.DOMParser = window.DOMParser
  global.NodeFilter = window.NodeFilter
  global.getComputedStyle = window.getComputedStyle.bind(window)
  global.sessionStorage = window.sessionStorage
  global.location = window.location
  // jsdom has no CSS.escape (real Chrome always does); content.ts uses it for id and class selectors (#126, #179).
  // The CSSOM algorithm, so a leading digit / lone hyphen get the same hex escape Chrome gives them.
  global.CSS = window.CSS ?? { escape: cssEscape }

  global.chrome = {
    runtime: {
      sendMessage: () => {},
      getURL: (path) => `chrome-extension://test/${path}`,
      onMessage: { addListener: () => {} },
    },
    storage: {
      sync: { get: (_k, cb) => cb && cb({}), set: (_v, cb) => cb && cb() },
      local: { get: (_k, cb) => cb && cb({}), set: (_v, cb) => cb && cb() },
    },
  }

  return dom
}
