// Minimal jsdom + chrome-extension-API environment for tests that import the bundled
// content-script/dom-cleanup modules under .test-build/. Intentionally NOT a full
// sinon-chrome mock — content.ts only touches chrome.runtime at module load and inside
// message handlers we never invoke from tests, so a handful of no-ops is enough (#40 plan:
// keep the stub inline, don't pull in a dependency for surface we don't exercise).
import { JSDOM } from 'jsdom'

export function installDomEnv(html = '<!doctype html><html><body></body></html>') {
  const dom = new JSDOM(html, { url: 'https://example.com/' })
  const { window } = dom

  global.window = window
  global.document = window.document
  global.Node = window.Node
  global.HTMLElement = window.HTMLElement
  global.Element = window.Element
  global.DOMParser = window.DOMParser
  global.NodeFilter = window.NodeFilter
  global.getComputedStyle = window.getComputedStyle.bind(window)
  global.sessionStorage = window.sessionStorage
  global.location = window.location

  global.chrome = {
    runtime: {
      sendMessage: () => {},
      onMessage: { addListener: () => {} },
    },
    storage: {
      sync: { get: (_k, cb) => cb && cb({}), set: (_v, cb) => cb && cb() },
      local: { get: (_k, cb) => cb && cb({}), set: (_v, cb) => cb && cb() },
    },
  }

  return dom
}
