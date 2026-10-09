// Fake chrome.storage.sync / .local for wiring-level tests (#98). Not a general chrome mock:
// just the get/set/remove/lastError surface the refresh + import/export paths touch, plus the
// ONE real constraint that makes the hybrid exclusion storage necessary -- sync rejects any
// single item over 8192 bytes (QUOTA_BYTES_PER_ITEM), so a writer that skips the helper fails
// here the way it does in Chrome instead of silently "working".
const QUOTA_BYTES_PER_ITEM = 8192
const clone = v => JSON.parse(JSON.stringify(v))
const bytes = (key, v) => new TextEncoder().encode(JSON.stringify(v)).length + key.length

export function createFakeChromeStorage() {
  const state = { sync: {}, local: {}, syncWrites: [], rejected: [] }
  const runtime = { lastError: null }
  const done = (cb, err) => {
    runtime.lastError = err ? { message: err } : null
    try { cb && cb() } finally { runtime.lastError = null }
  }
  const pick = (store, keys) => {
    const names = keys === null || keys === undefined ? Object.keys(store) : [].concat(typeof keys === 'object' && !Array.isArray(keys) ? Object.keys(keys) : keys)
    const out = {}
    for (const k of names) if (k in store) out[k] = clone(store[k])
    return out
  }
  const sync = {
    get: (keys, cb) => cb(pick(state.sync, keys)),
    set: (items, cb) => {
      const over = Object.entries(items).find(([k, v]) => bytes(k, v) > QUOTA_BYTES_PER_ITEM)
      if (over) {
        state.rejected.push(over[0])
        return done(cb, `QUOTA_BYTES_PER_ITEM quota exceeded (${over[0]})`)
      }
      state.syncWrites.push(Object.keys(items))
      for (const [k, v] of Object.entries(items)) state.sync[k] = clone(v)
      done(cb)
    },
    remove: (keys, cb) => { for (const k of [].concat(keys)) delete state.sync[k]; done(cb) }
  }
  const local = {
    get: (keys, cb) => cb(pick(state.local, keys)),
    set: (items, cb) => { for (const [k, v] of Object.entries(items)) state.local[k] = clone(v); done(cb) },
    remove: (keys, cb) => { for (const k of [].concat(keys)) delete state.local[k]; done(cb) }
  }
  return { state, runtime, chrome: { runtime, storage: { sync, local } } }
}
