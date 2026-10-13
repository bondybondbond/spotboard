// ===== FEEDBACK DATA BUILDER =====
// Builds the Tally feedback form URL. Everything below ends up in the iframe's address, so it reaches
// Tally the moment the form loads (not only on Submit). #194: send the minimum, nothing per-install.
// NOTE: These functions are global (no export) since loaded via <script> tag

// Hidden fields sent, and why each earns its place:
//   extension_version  - which build the complaint is about
//   days_since_install - coarse install-age band (0 / 1 / 7 / 30), same band as ga4.js
//   total_cards        - board size clamped at 10 (10 = "10 or more"), same cap as the GA4 board stats
// Deliberately NOT sent: tracked site names/hostnames, paused rate, average card age, active-card count,
// language, exact card count, any id. If the user wants to name a site, they type it into the form.
const FEEDBACK_CARD_COUNT_CAP = 10

async function calculateFeedbackFields() {
  const syncData = await chrome.storage.sync.get(null)
  const cardCount = Object.keys(syncData).filter((k) => k.startsWith('comp-')).length

  const { install_date } = await chrome.storage.local.get('install_date')
  const days = Math.floor((Date.now() - parseInt(install_date || Date.now())) / (1000 * 60 * 60 * 24))
  const daysBucket = !(days >= 1) ? 0 : days < 7 ? 1 : days < 30 ? 7 : 30 // same band as ga4.js ageBandFromDays

  return {
    extension_version: chrome.runtime.getManifest().version,
    days_since_install: daysBucket,
    total_cards: Math.min(cardCount, FEEDBACK_CARD_COUNT_CAP),
  }
}

// ===== Tally form URLs =====
const TALLY_POSITIVE_URL = 'https://tally.so/r/GxppGe'
const TALLY_NEGATIVE_URL = 'https://tally.so/r/7RKNlZ'

// Builds the pre-populated Tally URL. Tally matches hidden fields by name; only these names are ever added.
async function buildTallyURL(sentiment) {
  const baseURL = sentiment === 'positive' ? TALLY_POSITIVE_URL : TALLY_NEGATIVE_URL
  const params = new URLSearchParams()
  Object.entries(await calculateFeedbackFields()).forEach(([key, value]) => {
    params.append(key, String(value))
  })
  return `${baseURL}?${params.toString()}`
}
