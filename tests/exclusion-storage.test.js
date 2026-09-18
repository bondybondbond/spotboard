// #90: fitSyncRecord decides whether excludedSelectors ride in the sync record.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const out = await build({
  entryPoints: ['src/utils/exclusion-storage.ts'], bundle: true, write: false, format: 'esm', platform: 'node'
})
const mod = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'))
const { fitSyncRecord, syncItemBytes, exclusionsAreUnknown, friendlySaveError, SYNC_ITEM_QUOTA_BYTES, SYNC_ITEM_SAFE_BYTES } = mod

const KEY = 'comp-00000000-0000-0000-0000-000000000000'
const base = { id: 'x', name: 'NPR', url: 'https://npr.org', selector: 'div.a', last_refresh: '2026-09-18T00:00:00Z' }
const sels = n => Array.from({ length: n }, (_, i) => `div.story > div.credit:nth-child(${i + 1}) > span.photo-credit`)

test('normal exclusions stay inline in sync', () => {
  const r = fitSyncRecord(KEY, { ...base, excludedSelectors: sels(5) })
  assert.equal(r.storage, 'sync')
  assert.equal(r.record.exclusionsStorage, 'sync')
  assert.equal(r.record.excludedSelectors.length, 5)
})

test('oversized exclusions move local; record stays under the real 8192 cap', () => {
  const r = fitSyncRecord(KEY, { ...base, excludedSelectors: sels(400) })
  assert.equal(r.storage, 'local')
  assert.equal(r.record.exclusionsStorage, 'local')
  assert.equal('excludedSelectors' in r.record, false)
  assert.ok(r.fits)
  assert.ok(syncItemBytes(KEY, r.record) < SYNC_ITEM_QUOTA_BYTES)
})

test('threshold boundary: just under stays sync, just over goes local', () => {
  let n = 1
  while (fitSyncRecord(KEY, { ...base, excludedSelectors: sels(n + 1) }).storage === 'sync') n++
  const under = fitSyncRecord(KEY, { ...base, excludedSelectors: sels(n) })
  const over = fitSyncRecord(KEY, { ...base, excludedSelectors: sels(n + 1) })
  assert.equal(under.storage, 'sync')
  assert.ok(syncItemBytes(KEY, under.record) <= SYNC_ITEM_SAFE_BYTES)
  assert.equal(over.storage, 'local')
})

test('multi-byte selectors are measured in UTF-8 bytes, not string length', () => {
  const wide = Array.from({ length: 200 }, (_, i) => `div.日本語クラス${i} > span.写真クレジット`)
  const r = fitSyncRecord(KEY, { ...base, excludedSelectors: wide })
  assert.ok(syncItemBytes(KEY, r.record) <= SYNC_ITEM_QUOTA_BYTES)
})

test('unknown exclusions keep the local marker instead of rewriting as empty', () => {
  const comp = { exclusionsStorage: 'local' }
  assert.equal(exclusionsAreUnknown(comp), true)
  assert.equal(exclusionsAreUnknown({ exclusionsStorage: 'local', excludedSelectors: [] }), false)
  const r = fitSyncRecord(KEY, { ...base }, { exclusionsUnknown: true })
  assert.equal(r.record.exclusionsStorage, 'local')
  assert.equal('excludedSelectors' in r.record, false)
})

test('raw quota errors never reach the user', () => {
  const msg = friendlySaveError('Resource::kQuotaBytesPerItem quota exceeded')
  assert.ok(!/kQuota/.test(msg))
})
