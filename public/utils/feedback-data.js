// ===== FEEDBACK DATA CALCULATOR =====
// Collects all hidden fields for Tally form submission
// NOTE: These functions are global (no export) since loaded via <script> tag

// ===== TIER 1: Immediately Available Fields (Batch 1) =====
async function calculateTier1Fields() {
  const syncData = await chrome.storage.sync.get(null);

  // Extract all components (keys starting with "comp-")
  const components = Object.keys(syncData)
    .filter((k) => k.startsWith('comp-'))
    .map((k) => syncData[k]);

  // Calculate basic metrics
  const totalCards = components.length;
  const activeCards = components.filter((c) => !c.refreshPaused).length;
  const pausedCards = components.filter((c) => c.refreshPaused).length;
  
  // Calculate paused card rate as percentage
  const pausedCardRate = totalCards > 0 
    ? Math.round((pausedCards / totalCards) * 100) 
    : 0;

  // Extract all tracked sites with counts
  const siteData = {};
  components.forEach((c) => {
    try {
      const domain = new URL(c.url).hostname;
      siteData[domain] = (siteData[domain] || 0) + 1;
    } catch (e) {
      console.warn('Invalid URL:', c.url);
    }
  });

  const allTrackedSites =
    Object.entries(siteData)
      .map(([domain, count]) => `${domain}(${count})`)
      .join(' | ') || 'none';

  // Calculate average card age in days (using created_at, fallback to last_refresh for old cards)
  const cardAges = components
    .filter((c) => c.created_at || c.last_refresh) // Has timestamp
    .map((c) => {
      const timestamp = c.created_at || c.last_refresh; // Prefer created_at
      return (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60 * 24);
    });
  const avgCardAgeDays =
    cardAges.length > 0
      ? Math.floor(cardAges.reduce((a, b) => a + b, 0) / cardAges.length)
      : 0;

  return {
    browser_language: navigator.language || 'unknown', // e.g. "en-US", "es-ES"
    extension_version: chrome.runtime.getManifest().version,
    total_cards: totalCards,
    active_cards: activeCards,
    'paused_card_rate_%': pausedCardRate, // Percentage, not count
    all_tracked_sites: allTrackedSites,
    avg_card_age_days: avgCardAgeDays,
  };
}

// ===== TIER 2: install-age band only (no counters, no user id; #199) =====
async function calculateTier2Fields() {
  // #199: no user id and no per-install counters. The install age is a coarse bucket (0 / 1 / 7 / 30),
  // because an exact age is a fixed install date that would link responses to an install.
  const { install_date } = await chrome.storage.local.get('install_date');
  const days = Math.floor((Date.now() - parseInt(install_date || Date.now())) / (1000 * 60 * 60 * 24));
  const daysBucket = !(days >= 1) ? 0 : days < 7 ? 1 : days < 30 ? 7 : 30; // same band as ga4.js ageBandFromDays

  return {
    days_since_install: daysBucket,
  };
}

// ===== COMBINED CALCULATOR (Batch 5) =====
// Returns the hidden fields for the Tally feedback forms (no user id, no per-install counters)
async function getAllHiddenFields() {
  const tier1 = await calculateTier1Fields();
  const tier2 = await calculateTier2Fields();

  return {
    ...tier1,
    ...tier2,
  };
}

// ===== BATCH 6: Tally Form URLs and Field Mappings =====
const TALLY_POSITIVE_URL = 'https://tally.so/r/GxppGe';
const TALLY_NEGATIVE_URL = 'https://tally.so/r/7RKNlZ';

// Hidden field IDs (same across both forms)
// Note: Tally uses field names directly
const HIDDEN_FIELD_IDS = {
  browser_language: 'browser_language', // e.g. "en-US", "es-ES"
  extension_version: 'extension_version',
  total_cards: 'total_cards',
  active_cards: 'active_cards',
  'paused_card_rate_%': 'paused_card_rate_%',
  all_tracked_sites: 'all_tracked_sites',
  avg_card_age_days: 'avg_card_age_days',
  days_since_install: 'days_since_install',
};

// ===== BATCH 7: Build Tally URL with Hidden Fields =====
// Builds pre-populated Tally URL with the hidden fields (no user id)
async function buildTallyURL(sentiment) {
  // Select base URL based on sentiment
  const baseURL = sentiment === 'positive' ? TALLY_POSITIVE_URL : TALLY_NEGATIVE_URL;
  
  // Get all hidden fields
  const hiddenFields = await getAllHiddenFields();

  // Build URL parameters
  const params = new URLSearchParams();
  Object.entries(hiddenFields).forEach(([key, value]) => {
    const fieldId = HIDDEN_FIELD_IDS[key];
    if (fieldId) {
      params.append(fieldId, value.toString());
    }
  });

  return `${baseURL}?${params.toString()}`;
}

// Feedback data calculator initialized
