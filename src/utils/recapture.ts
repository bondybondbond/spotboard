// #52: Re-capture a broken card in place. Pure helpers so the merge rule is unit-tested.
//
// Storage rule (CLAUDE.md "Critical"): every sync write spreads ALL existing fields, so the
// merge starts from the stored record and overrides ONLY the capture-derived ones.

export type StoredRecord = Record<string, unknown>

export interface RecaptureResult {
  selector: string
  headingFingerprint: string | null
  structureMarker?: unknown
  positionBased: boolean
  excludedSelectors: string[]
  html_cache: string
  rawCaptureLength: number
  exclusionSignatures?: unknown
}

/**
 * Builds the replacement sync + local records for a re-captured card.
 * Kept from the old card: id, url (original), name, customLabel, favicon, created_at,
 * refreshPaused, cardSize, board, refresh-tier flags and anything else not listed below.
 * Overwritten: selector, headingFingerprint, structureMarker, positionBased, excludedSelectors,
 * html + exclusion signatures + capture baseline, and the failure state.
 */
export function mergeRecapture(
  existingSync: StoredRecord,
  existingLocal: StoredRecord | undefined,
  capture: RecaptureResult,
  nowIso: string
): { sync: StoredRecord; local: StoredRecord } {
  const sync: StoredRecord = {
    ...existingSync,
    selector: capture.selector,
    headingFingerprint: capture.headingFingerprint,
    positionBased: capture.positionBased,
    excludedSelectors: capture.excludedSelectors,
    last_refresh: nowIso,
    lastAttemptAt: nowIso,
    lastSuccessAt: nowIso,
    lastOutcome: 'success',
    lastErrorCode: null,
    lastErrorAt: null
  }
  // A stale identity marker from the old selector must not survive when the new capture has none.
  if (capture.structureMarker) sync.structureMarker = capture.structureMarker
  else delete sync.structureMarker

  const local: StoredRecord = {
    ...(existingLocal || {}),
    selector: capture.selector,
    html_cache: capture.html_cache,
    last_refresh: nowIso,
    excludedSelectors: capture.excludedSelectors,
    rawCaptureLength: capture.rawCaptureLength,
    exclusionSignatures: capture.exclusionSignatures
  }
  // Drift baseline belongs to the old selector's output.
  delete local.originalCaptureLength

  return { sync, local }
}
