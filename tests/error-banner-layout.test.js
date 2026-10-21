// #118: the failure banner is one template (first render and live failure) with the message on its own row
// and the actions in .error-actions. Re-capture is primary only where it is offered, so `has-recapture`
// must follow shouldOfferRecapture. Source-extracted because dashboard.js is not loadable in node (#205 precedent).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadRefreshEngine } from './helpers/refresh-engine-env.js'

const g = await loadRefreshEngine()
const src = readFileSync(new URL('../public/dashboard.js', import.meta.url), 'utf8')
const start = src.indexOf('function buildErrorBannerHTML')
const body = src.slice(start, src.indexOf('function startRecapture'))
const RECAPTURE_BUTTON_HTML = '<button type="button" class="error-recapture-btn">Re-capture</button>'
const build = new Function('getErrorLabel', 'shouldOfferRecapture', 'RECAPTURE_BUTTON_HTML', body + '; return buildErrorBannerHTML')(g.getErrorLabel, g.shouldOfferRecapture, RECAPTURE_BUTTON_HTML)

const comp = code => ({ id: 'c1', url: 'https://example.com/', lastOutcome: 'failed', lastErrorCode: code })

for (const code of ['layout_changed', 'content_lost', 'exclusions_unapplied', 'pattern_unapplied']) {
  test(`${code}: Re-capture offered, banner marked has-recapture, button inside the action row`, () => {
    const html = build(comp(code), code)
    assert.match(html, /class="card-error-banner has-recapture"/)
    const actions = html.slice(html.indexOf('class="error-actions"'))
    assert.ok(actions.includes('error-retry-btn') && actions.includes('error-open-btn') && actions.includes('error-recapture-btn'))
    assert.ok(html.indexOf('error-message') < html.indexOf('error-actions'), 'message row comes before the action row')
  })
}

for (const code of ['network', 'skeleton', 'render_degraded', 'content_shrunk', 'unknown']) {
  test(`${code} (negative): no Re-capture, no has-recapture, Retry stays the only primary`, () => {
    const html = build(comp(code), code)
    assert.doesNotMatch(html, /has-recapture/)
    assert.doesNotMatch(html, /error-recapture-btn/)
    assert.ok(html.includes('error-retry-btn') && html.includes('error-open-btn'))
  })
}
