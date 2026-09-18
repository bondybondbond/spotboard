// #90: keep a card's excludedSelectors in chrome.storage.sync when they fit, fall back to
// local-only when they'd push the comp-{uuid} record past Chrome's per-item sync cap.
//
// Local storage (componentsData[id].excludedSelectors) ALWAYS holds the exclusions, so this
// module only decides whether sync ALSO carries a copy. `exclusionsStorage` on the sync
// record says which: 'sync' (inline copy present) or 'local' (deliberately omitted -- other
// devices must treat exclusions as unknown until re-saved there).

/** chrome.storage.sync.QUOTA_BYTES_PER_ITEM. */
export const SYNC_ITEM_QUOTA_BYTES = 8192

/**
 * Deliberate buffer under the 8192 cap (~600 bytes). Chrome's exact accounting is only
 * documented as "JSON string + key length"; the buffer absorbs anything that formula misses
 * and small later edits (board id, pause flag, refresh timestamps) growing the record after
 * it was saved.
 */
export const SYNC_ITEM_SAFE_BYTES = 7600

export type ExclusionsStorage = 'sync' | 'local'

/** Bytes Chrome counts for one sync item: UTF-8 of JSON.stringify(value) + key length. */
export function syncItemBytes(key: string, value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length + key.length
}

/**
 * Returns the record to write to sync. If it fits with exclusions inline, they stay inline
 * (marker 'sync'). If not, excludedSelectors is dropped and marker is 'local'.
 * Pass `exclusionsUnknown: true` for a card whose local exclusions are missing on this device
 * (marker was 'local' and nothing local to read) -- the marker is preserved so the unknown
 * state isn't silently rewritten as "no exclusions".
 */
export type SyncRecord = Record<string, unknown> & { excludedSelectors?: string[] }

export function fitSyncRecord(
  key: string,
  record: SyncRecord,
  opts: { exclusionsUnknown?: boolean } = {}
): { record: SyncRecord & { exclusionsStorage: ExclusionsStorage }; storage: ExclusionsStorage; fits: boolean } {
  const { excludedSelectors, ...rest } = record
  if (opts.exclusionsUnknown) {
    const out = { ...rest, exclusionsStorage: 'local' as const }
    return { record: out, storage: 'local', fits: syncItemBytes(key, out) <= SYNC_ITEM_SAFE_BYTES }
  }
  const inline = { ...rest, excludedSelectors: excludedSelectors || [], exclusionsStorage: 'sync' as const }
  if (syncItemBytes(key, inline) <= SYNC_ITEM_SAFE_BYTES) {
    return { record: inline, storage: 'sync', fits: true }
  }
  const local = { ...rest, exclusionsStorage: 'local' as const }
  return { record: local, storage: 'local', fits: syncItemBytes(key, local) <= SYNC_ITEM_SAFE_BYTES }
}

/**
 * True when a merged (sync + local) component has no usable exclusions on this device because
 * they were deliberately kept local on another one.
 */
export function exclusionsAreUnknown(component: { exclusionsStorage?: string; excludedSelectors?: unknown }): boolean {
  return component.exclusionsStorage === 'local' && !Array.isArray(component.excludedSelectors)
}

/** Plain-English message for a save that can't fit even with exclusions moved local. */
export const SAVE_TOO_BIG_MESSAGE =
  "This card couldn't be saved because its settings are too large. Try excluding fewer items or capturing a smaller section."

/** Map a raw storage error to something a user can act on; raw quota strings never surface. */
export function friendlySaveError(message?: string): string {
  if (message && /quota/i.test(message)) return SAVE_TOO_BIG_MESSAGE
  return `Save failed: ${message || 'unknown error'}`
}
