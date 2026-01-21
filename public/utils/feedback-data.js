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

// ===== ROLLING WINDOW HELPER =====
// Count events within last N days from timestamp array
function countEventsInWindow(storageKey, windowDays) {
  const raw = localStorage.getItem(storageKey) || '[]';
  const timestamps = JSON.parse(raw);
  const cutoff = Date.now() - (windowDays * 24 * 60 * 60 * 1000);
  
  return timestamps.filter(t => t > cutoff).length;
}

// ===== TIER 2: Requires Tracking Code (Batch 2-4) =====
// NOW USING ROLLING WINDOWS - survives version updates!
async function calculateTier2Fields() {
  // Read install_date and user_id from chrome.storage.local (service worker compatible)
  const { install_date, user_id } = await chrome.storage.local.get(['install_date', 'user_id']);
  const installDate = parseInt(install_date || Date.now());
  const daysSinceInstall = Math.floor(
    (Date.now() - installDate) / (1000 * 60 * 60 * 24)
  );

  // Rolling 7-day windows (reads from timestamp arrays in localStorage)
  const boardOpens = countEventsInWindow('board_open_timestamps', 7);
  const refreshClicks = countEventsInWindow('refresh_click_timestamps', 7);

  return {
    user_id: user_id || 'unknown', // Fallback for old installs without UUID
    days_since_install: daysSinceInstall,
    board_opens_7days: boardOpens,
    refresh_clicks_7days: refreshClicks,
  };
}

// ===== COMBINED CALCULATOR (Batch 5) =====
// Returns all 11 hidden fields for Tally form (includes user_id + browser_language)
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
  user_id: 'user_id', // Anonymous installation UUID
  browser_language: 'browser_language', // e.g. "en-US", "es-ES"
  extension_version: 'extension_version',
  total_cards: 'total_cards',
  active_cards: 'active_cards',
  'paused_card_rate_%': 'paused_card_rate_%',
  all_tracked_sites: 'all_tracked_sites',
  avg_card_age_days: 'avg_card_age_days',
  days_since_install: 'days_since_install',
  board_opens_7days: 'board_opens_7days',
  refresh_clicks_7days: 'refresh_clicks_7days',
};

// ===== BATCH 7: Build Tally URL with Hidden Fields =====
// Builds pre-populated Tally URL with all 11 hidden fields (user_id + browser_language + 9 others)
async function buildTallyURL(sentiment) {
  // Select base URL based on sentiment
  const baseURL = sentiment === 'positive' ? TALLY_POSITIVE_URL : TALLY_NEGATIVE_URL;
  
  // Get all 9 hidden fields
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

console.log('✅ Feedback data calculator loaded (11 hidden fields: user_id, browser_language, + 9 metrics)');
