// #98: wiring-level tests for hybrid exclusion storage (#90). exclusion-storage.test.js covers the
// pure helper (fitSyncRecord); these drive the REAL writers -- refreshAll() and the dashboard's
// export/import -- against a fake chrome.storage that rejects sync items over 8192 bytes, and
// check the same invariants after each. A bypass test then swaps the helper for a naive one and
// asserts the invariant check catches it, so the suite fails if the protection is skipped.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { build } from 'esbuild'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'
import { createFakeChromeStorage } from './helpers/fake-chrome-storage.js'

const g = await loadRefreshEngine()
const bundle = async entry => {
  const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node' })
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'))
}
const ES = await bundle('src/utils/exclusion-storage.ts')
const ListFormat = await bundle('src/utils/list-format.ts')
const realChrome = global.chrome

// The export/import code lives in dashboard.js (a UI script that can't be loaded whole): run just
// that block -- EXPORT_SCHEMA_VERSION .. initAdvancedMenu -- with the same globals it has in the page.
function loadExportImport(fake) {
  const src = fs.readFileSync(new URL('../public/dashboard.js', import.meta.url), 'utf8')
  const from = src.indexOf('const EXPORT_SCHEMA_VERSION')
  const to = src.indexOf('function initAdvancedMenu')
  assert.ok(from > 0 && to > from, 'export/import block markers moved in dashboard.js')
  let exported = null
  const sandbox = {
    chrome: fake.chrome,
    window: { ListFormat },
    document: { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } },
    Blob: class { constructor(parts) { this.text = parts.join('') } },
    URL: { createObjectURL: blob => { exported = JSON.parse(blob.text); return 'blob:test' }, revokeObjectURL() {} },
    showStyledToast: () => {},
    fitCompForSync: (...a) => g.fitCompForSync(...a),
    setTimeout: () => {}, location: { reload() {} }, console, Promise, JSON, Object, Array
  }
  vm.createContext(sandbox)
  vm.runInContext(src.slice(from, to) + '\n;this.exportBoard = exportBoard; this.applyImportedBoard = applyImportedBoard; this.validateExportPayload = validateExportPayload', sandbox, { filename: 'dashboard.js[export/import]' })
  return { sandbox, getExported: () => exported }
}

const manySelectors = n => Array.from({ length: n }, (_, i) => `div.story > div.credit:nth-child(${i + 1}) > span.photo-credit`)
const oldHtml = '<div class="card"><h2>Old</h2><p>Old content that is long enough to matter for the card here.</p></div>'
const newHtml = '<div class="card"><h2>New</h2><p>New content that is long enough to matter for the card here, fresh.</p></div>'
const okResult = { success: true, html_cache: newHtml, last_refresh: '2026-10-09T00:00:00.000Z', rawCaptureLength: 999 }

let fake
function seed(id, { marker, exclusions, bothCopies = false, syncExtra = {} }) {
  const rec = {
    id, name: 'Card ' + id, url: 'https://example.com/' + id, favicon: 'f.png', selector: 'div.card',
    headingFingerprint: 'fp', positionBased: false, cardSize: '1x1', board: 'b1',
    created_at: '2026-01-01T00:00:00.000Z', last_refresh: 'old', lastOutcome: 'success', ...syncExtra
  }
  if (marker === 'sync') { rec.excludedSelectors = exclusions; rec.exclusionsStorage = 'sync' }
  else rec.exclusionsStorage = 'local'
  fake.state.sync[`comp-${id}`] = rec
  const loc = { selector: 'div.card', html_cache: oldHtml, last_refresh: 'old' }
  // marker 'local' with no `exclusions` => local copy missing (unknown); marker 'sync' + bothCopies => the normal shape, a copy in each
  if ((marker === 'local' || bothCopies) && exclusions) loc.excludedSelectors = exclusions
  fake.state.local.componentsData = { ...(fake.state.local.componentsData || {}), [id]: loc }
}

// The storage invariants every writer must leave behind. Returns human-readable problems ([] = ok).
// `expect` = { id: { marker, exclusions } } where exclusions undefined means "unknown" (no local copy).
function storageProblems(expect) {
  const problems = []
  const localAll = fake.state.local.componentsData || {}
  for (const [id, want] of Object.entries(expect)) {
    const rec = fake.state.sync[`comp-${id}`]
    const loc = localAll[id] || {}
    if (!rec) { problems.push(`${id}: sync record missing`); continue }
    const size = ES.syncItemBytes(`comp-${id}`, rec)
    if (size > ES.SYNC_ITEM_QUOTA_BYTES) problems.push(`${id}: sync record ${size}B is over ${ES.SYNC_ITEM_QUOTA_BYTES}B`)
    if (rec.exclusionsStorage !== want.marker) problems.push(`${id}: marker is ${rec.exclusionsStorage}, want ${want.marker}`)
    if (want.marker === 'local' && 'excludedSelectors' in rec) problems.push(`${id}: exclusions leaked into the sync record`)
    if (want.exclusions === undefined) {
      if (Array.isArray(loc.excludedSelectors)) problems.push(`${id}: unknown exclusions were rewritten as a known list`)
      if (Array.isArray(rec.excludedSelectors)) problems.push(`${id}: unknown exclusions were rewritten inline in sync`)
    } else {
      const resolved = want.marker === 'sync' ? rec.excludedSelectors : loc.excludedSelectors
      if (JSON.stringify(resolved) !== JSON.stringify(want.exclusions)) problems.push(`${id}: exclusions changed (${resolved && resolved.length} vs ${want.exclusions.length})`)
      if ((want.marker === 'local' || want.bothCopies) && JSON.stringify(loc.excludedSelectors) !== JSON.stringify(want.exclusions)) problems.push(`${id}: local copy lost or changed`)
    }
  }
  if (fake.state.rejected.length) problems.push(`sync rejected over-quota writes: ${fake.state.rejected.join(', ')}`)
  return problems
}

// A writer that skips the helper: always inline, always marker 'sync', ignores "unknown".
const naiveFitSyncRecord = (_key, record) => ({
  record: { ...record, excludedSelectors: record.excludedSelectors || [], exclusionsStorage: 'sync' }, storage: 'sync', fits: true
})

const small = ['div.pills', 'ul:nth-child(2) > li:nth-child(1) > p']
const big = manySelectors(400)

function seedBoard() {
  seed('small', { marker: 'sync', exclusions: small, bothCopies: true }) // normal card: inline in sync AND a local copy
  seed('smalllegacy', { marker: 'sync', exclusions: small })           // older card: inline in sync only
  seed('big', { marker: 'local', exclusions: big })
  seed('unk', { marker: 'local' })                                   // marker says local, local copy is gone
  seed('paused', { marker: 'local', exclusions: big, syncExtra: { refreshPaused: true } })
  seed('pausedsmall', { marker: 'sync', exclusions: small, syncExtra: { refreshPaused: true } })
}
const expectBoard = {
  small: { marker: 'sync', exclusions: small, bothCopies: true },
  smalllegacy: { marker: 'sync', exclusions: small },
  big: { marker: 'local', exclusions: big },
  unk: { marker: 'local', exclusions: undefined },
  paused: { marker: 'local', exclusions: big },
  pausedsmall: { marker: 'sync', exclusions: small }
}

// runtime.lastError must live on the object the fake writes to, so rejections surface to the code under test
function installChrome() {
  Object.assign(fake.chrome.runtime, { sendMessage: () => {}, getURL: p => p })
  global.chrome = { ...realChrome, runtime: fake.chrome.runtime, storage: { ...fake.chrome.storage, session: { set: (_v, cb) => cb && cb(), get: (_k, cb) => cb && cb({}) } } }
}

beforeEach(() => {
  fake = createFakeChromeStorage()
  installChrome()
  g.refreshComponent = async () => okResult
  g.trackRefreshClick = () => {}
  window.GA4 = { sendEvent: async () => {} }
  window.ExclusionStorage = ES
  document.body.innerHTML = '<button id="refresh-all-btn"></button>'
})

test('refresh batch (paused + refreshed + oversized + unknown): exclusions stay put, markers right, every sync record under 8 KB', async () => {
  seedBoard()
  const pausedBefore = JSON.stringify([fake.state.sync['comp-paused'], fake.state.sync['comp-pausedsmall'], fake.state.local.componentsData.paused])
  await g.refreshAll()
  assert.deepEqual(storageProblems(expectBoard), [])
  // the batch really ran: refreshed cards have the new html and outcome, paused cards are byte-identical
  const local = fake.state.local.componentsData
  for (const id of ['small', 'smalllegacy', 'big', 'unk']) {
    assert.equal(local[id].html_cache, newHtml, `${id} was refreshed`)
    assert.equal(fake.state.sync[`comp-${id}`].lastOutcome, 'success')
  }
  assert.equal(JSON.stringify([fake.state.sync['comp-paused'], fake.state.sync['comp-pausedsmall'], local.paused]), pausedBefore)
})

test('refresh of a card whose marker says local but whose local copy is missing stays unknown (not rewritten as empty), even on a failed refresh', async () => {
  seed('unk', { marker: 'local' })
  await g.refreshAll()
  assert.equal(fake.state.sync['comp-unk'].lastOutcome, 'success')
  assert.equal(fake.state.local.componentsData.unk.html_cache, newHtml) // the refresh really ran and committed
  assert.deepEqual(storageProblems({ unk: { marker: 'local', exclusions: undefined } }), [])
  assert.equal(ES.exclusionsAreUnknown({ ...fake.state.sync['comp-unk'], ...fake.state.local.componentsData.unk }), true)

  g.refreshComponent = async () => ({ success: false, error: 'boom' })
  await g.refreshAll()
  assert.deepEqual(storageProblems({ unk: { marker: 'local', exclusions: undefined } }), [])
  assert.equal(fake.state.sync['comp-unk'].lastOutcome, 'failed')
})

test('export -> import of an oversized card: exclusions stay local-only, marker correct, sync record under 8 KB; unknown card stays unknown', async () => {
  seedBoard()
  const { sandbox, getExported } = loadExportImport(fake)
  await sandbox.exportBoard()
  const payload = JSON.parse(JSON.stringify(getExported()))
  assert.equal(payload.cards.length, 6)
  assert.equal(JSON.stringify(sandbox.validateExportPayload(payload)), '[]') // JSON: arrays from the vm realm differ in prototype
  // the export carries the resolved list for the oversized card (that is what makes it restorable)
  assert.equal(payload.cards.find(c => c.id === 'big').excludedSelectors.length, 400)

  // restore into a wiped profile
  fake.state.sync = {}; fake.state.local = {}
  await sandbox.applyImportedBoard(payload)
  assert.deepEqual(storageProblems(expectBoard), [])
  assert.equal(fake.state.rejected.length, 0)
})

test('bypass: a writer that skips the helper is caught by the same checks (refresh and import)', async () => {
  window.ExclusionStorage = { ...ES, fitSyncRecord: naiveFitSyncRecord }
  try {
    seedBoard()
    await g.refreshAll()
    const refreshProblems = storageProblems(expectBoard)
    assert.ok(refreshProblems.some(p => /big/.test(p)), 'oversized-inline bypass undetected: ' + refreshProblems.join('; '))

    // unknown -> empty collapse (the over-quota card above would mask it, so test it alone)
    fake = createFakeChromeStorage()
    installChrome()
    seed('unk', { marker: 'local' })
    await g.refreshAll()
    const unknownProblems = storageProblems({ unk: { marker: 'local', exclusions: undefined } })
    assert.ok(unknownProblems.some(p => /unk/.test(p)), 'unknown-collapsed-to-empty bypass undetected: ' + unknownProblems.join('; '))

    // import bypass: build the payload with the real helper in place, then import through the naive one
    fake = createFakeChromeStorage()
    installChrome()
    window.ExclusionStorage = ES
    seedBoard()
    const { sandbox, getExported } = loadExportImport(fake)
    await sandbox.exportBoard()
    const payload = JSON.parse(JSON.stringify(getExported()))
    fake.state.sync = {}; fake.state.local = {}; fake.state.rejected = []
    window.ExclusionStorage = { ...ES, fitSyncRecord: naiveFitSyncRecord }
    await sandbox.applyImportedBoard(payload)
    const importProblems = storageProblems(expectBoard)
    assert.ok(importProblems.some(p => /big/.test(p)), 'import bypass undetected: ' + importProblems.join('; '))
  } finally {
    window.ExclusionStorage = ES
  }
})
