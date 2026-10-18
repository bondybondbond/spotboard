// #207: site icons must never be requested through a plain <img src=google.com/s2/favicons> (Chrome attaches the
// browser's google.com cookies, sign-in cookies included, to that request). Two parts:
//  1. static guard on the three render files: no raw Google icon URL in a src position, ever again;
//  2. the helper (src/utils/favicon.ts): credential-free fetch, one endpoint, plain hostnames only, image content type.
// Limit: jsdom proves the helper's calls, not what Chrome puts on the wire. The wire check (dummy cookie, real Chrome,
// real popup) is the E2E recorded on the issue.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { installDomEnv } from './helpers/env.js'

const dom = installDomEnv()
global.Event = dom.window.Event // the shared env does not expose these two; the helper uses them in Chrome
global.MutationObserver = dom.window.MutationObserver
const { parseFaviconUrl, loadFavicon, hydrateFavicon, observeFavicons } = await import('../.test-build/utils/favicon.js')

const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8')

test('no raw google.com/s2/favicons URL reaches an img src in the dashboard or popup', () => {
  // Whitelist, not a pattern for "bad" forms: in the dashboard files a line that names the endpoint must either feed
  // data-sb-favicon or be a plain data object (`favicon: '...'`, rendered later through the helper); the popup must not name it at all.
  for (const f of ['public/dashboard.html', 'public/dashboard.js', 'src/App.tsx']) {
    const offenders = read(f).split(/\r?\n/).map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /s2\/favicons/.test(line))
      .filter(({ line }) => f === 'src/App.tsx' || !(/data-sb-favicon/.test(line) || /^\{?\s*name:.*\bfavicon:\s*'https:\/\/www\.google\.com\/s2\/favicons[^']*'/.test(line)))
    assert.deepEqual(offenders, [], f + ' names the Google icon endpoint outside data-sb-favicon / data objects')
  }
  for (const f of ['public/dashboard.html', 'public/dashboard.js', 'src/App.tsx']) {
    const direct = read(f).split(/\r?\n/).map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /setAttribute\(\s*['"]src['"]/.test(line) || /(^|[^-\w])src\s*=\s*\{?\s*[`'"]https:\/\/www\.google/.test(line))
    assert.deepEqual(direct, [], f + ' sets an img src to a Google URL directly')
  }
})

test('no img src is filled straight from a stored card favicon (it must go through the helper)', () => {
  for (const f of ['public/dashboard.js', 'src/App.tsx']) {
    const offenders = read(f).split(/\r?\n/).map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /(^|[^-\w])src\s*=\s*(\{|["'`]\$\{)\s*[\w.]*favicon/.test(line) || /\.src\s*=\s*[\w.]*favicon/.test(line))
    assert.deepEqual(offenders, [], f + ' puts a stored favicon straight into an img src')
  }
})

test('every Google icon use in the dashboard markup goes through data-sb-favicon', () => {
  const html = read('public/dashboard.html')
  assert.equal((html.match(/data-sb-favicon="https:\/\/www\.google\.com\/s2\/favicons/g) || []).length, 4)
  assert.match(html, /<script src="utils\/favicon\.js"><\/script>/)
})

test('parseFaviconUrl accepts only the Google endpoint with a plain hostname and numeric size', () => {
  assert.deepEqual(parseFaviconUrl('https://www.google.com/s2/favicons?sz=64&domain=npr.org'), { domain: 'npr.org', sz: '64' })
  assert.deepEqual(parseFaviconUrl('https://www.google.com/s2/favicons?domain=finance.yahoo.com&sz=48'), { domain: 'finance.yahoo.com', sz: '48' })
  assert.deepEqual(parseFaviconUrl('https://www.google.com/s2/favicons?domain=bbc.co.uk'), { domain: 'bbc.co.uk', sz: '32' })
  for (const bad of ['', null, undefined, 'not a url', 'https://evil.example/s2/favicons?domain=npr.org', 'http://www.google.com/s2/favicons?domain=npr.org',
    'https://www.google.com/other?domain=npr.org', 'https://www.google.com/s2/favicons?domain=', 'https://www.google.com/s2/favicons?domain=a%20b',
    'https://www.google.com/s2/favicons?domain=../x', 'https://www.google.com/s2/favicons?domain=a.com&sz=abc', 'https://www.google.com/s2/favicons?domain=localhost:3000',
    'https://www.google.com/s2/favicons?domain=' + 'a'.repeat(300)]) {
    assert.equal(parseFaviconUrl(bad), null, String(bad))
  }
})

let calls
beforeEach(() => {
  calls = []
  let n = 0
  URL.createObjectURL = () => 'blob:test/' + ++n
})
const stubFetch = (impl) => { global.fetch = (url, init) => { calls.push({ url, init }); return impl(url, init) } }
const image = () => Promise.resolve({ blob: () => Promise.resolve({ type: 'image/png' }) })

test('loadFavicon fetches credential-free, from the one endpoint, and never from the stored URL as given', async () => {
  stubFetch(image)
  const src = await loadFavicon('https://www.google.com/s2/favicons?sz=64&domain=cred-a.org&extra=1')
  assert.equal(src.startsWith('blob:'), true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].init.credentials, 'omit')
  assert.equal(calls[0].url, 'https://www.google.com/s2/favicons?sz=64&domain=cred-a.org')
})

test('loadFavicon memoises per domain+size and makes no request for rejected input', async () => {
  stubFetch(image)
  const u = 'https://www.google.com/s2/favicons?sz=64&domain=memo-a.org'
  const [a, b] = await Promise.all([loadFavicon(u), loadFavicon(u)])
  assert.equal(a, b)
  assert.equal(calls.length, 1)
  await loadFavicon('https://www.google.com/s2/favicons?sz=32&domain=memo-a.org')
  assert.equal(calls.length, 2)
  assert.equal(await loadFavicon('https://evil.example/s2/favicons?domain=x.org'), null)
  assert.equal(await loadFavicon('https://www.google.com/s2/favicons?domain=../x'), null)
  assert.equal(calls.length, 2)
})

test('a 404 that carries an image is an icon; a non-image answer or a network failure is no icon', async () => {
  stubFetch(() => Promise.resolve({ status: 404, blob: () => Promise.resolve({ type: 'image/png' }) }))
  assert.equal((await loadFavicon('https://www.google.com/s2/favicons?domain=img404.org')).startsWith('blob:'), true)
  stubFetch(() => Promise.resolve({ status: 404, blob: () => Promise.resolve({ type: 'text/html; charset=utf-8' }) }))
  assert.equal(await loadFavicon('https://www.google.com/s2/favicons?domain=html404.org'), null)
  stubFetch(() => Promise.reject(new TypeError('Failed to fetch')))
  assert.equal(await loadFavicon('https://www.google.com/s2/favicons?domain=offline-a.org'), null)
})

test('a failed load is not remembered: the next render tries again', async () => {
  const u = 'https://www.google.com/s2/favicons?domain=retry-a.org'
  stubFetch(() => Promise.reject(new TypeError('Failed to fetch')))
  assert.equal(await loadFavicon(u), null)
  await Promise.resolve()
  stubFetch(image)
  assert.equal((await loadFavicon(u)).startsWith('blob:'), true)
  assert.equal(calls.length, 2)
})

test('hydrateFavicon sets src on success and fires the img error event on failure (so existing hide-on-error handlers work)', async () => {
  stubFetch(image)
  const ok = document.createElement('img'); ok.setAttribute('data-sb-favicon', 'https://www.google.com/s2/favicons?domain=hyd-a.org')
  hydrateFavicon(ok); await new Promise(r => setTimeout(r, 5))
  assert.equal(ok.src.startsWith('blob:'), true); assert.equal(ok.hasAttribute('data-sb-favicon'), false); assert.equal(ok.style.visibility, '')
  stubFetch(() => Promise.reject(new TypeError('Failed to fetch')))
  const bad = document.createElement('img'); bad.setAttribute('data-sb-favicon', 'https://www.google.com/s2/favicons?domain=hyd-b.org')
  let errored = false; bad.addEventListener('error', () => { errored = true })
  hydrateFavicon(bad); await new Promise(r => setTimeout(r, 5))
  assert.equal(errored, true); assert.equal(bad.getAttribute('src'), null); assert.equal(bad.style.visibility, 'hidden')
  const empty = document.createElement('img'); empty.setAttribute('data-sb-favicon', '')
  let emptyErr = false; empty.addEventListener('error', () => { emptyErr = true })
  hydrateFavicon(empty); await new Promise(r => setTimeout(r, 5))
  assert.equal(emptyErr, true)
})

test('observeFavicons hydrates icons already in the page and any rendered later (innerHTML or appended)', async () => {
  stubFetch(image)
  document.body.innerHTML = '<img id="pre" data-sb-favicon="https://www.google.com/s2/favicons?domain=obs-a.org">'
  observeFavicons(document)
  const late = document.createElement('div')
  late.innerHTML = '<span><img id="late" data-sb-favicon="https://www.google.com/s2/favicons?domain=obs-b.org"></span>'
  document.body.appendChild(late)
  const direct = document.createElement('img'); direct.id = 'direct'; direct.setAttribute('data-sb-favicon', 'https://www.google.com/s2/favicons?domain=obs-c.org')
  document.body.appendChild(direct)
  await new Promise(r => setTimeout(r, 20))
  for (const id of ['pre', 'late', 'direct']) assert.equal(document.getElementById(id).src.startsWith('blob:'), true, id)
  assert.equal(calls.every(c => c.init.credentials === 'omit'), true)
})

test('an icon attribute inside captured page content is never hydrated (no fetch)', async () => {
  stubFetch(image)
  document.body.innerHTML = '<div class="component-content"><img id="cap" data-sb-favicon="https://www.google.com/s2/favicons?domain=captured-a.org"></div>'
  observeFavicons(document)
  const late = document.createElement('div'); late.className = 'component-content'
  late.innerHTML = '<p><img id="cap2" data-sb-favicon="https://www.google.com/s2/favicons?domain=captured-b.org"></p>'
  document.body.appendChild(late)
  await new Promise(r => setTimeout(r, 20))
  assert.equal(calls.length, 0)
  assert.equal(document.getElementById('cap').getAttribute('src'), null)
  assert.equal(document.getElementById('cap2').getAttribute('src'), null)
})
