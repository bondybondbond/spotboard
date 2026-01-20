// ===== FEEDBACK DATA CALCULATOR =====
// Collects all hidden fields for Tally form submission

// ===== TALLY FORM URLs (Batch 6) =====
const TALLY_POSITIVE_URL = 'https://tally.so/r/GxppGe';
const TALLY_NEGATIVE_URL = 'https://tally.so/r/7RKNlZ';

// Hidden field IDs (same across both forms)
// Note: Tally uses field names directly, not prefixed IDs
const HIDDEN_FIELD_IDS = {
  extension_version: 'extension_version',
  total_cards: 'total_cards',
  active_cards: 'active_cards',
  paused_card_rate: 'paused_card_rate_%', // Percentage, not count
  all_tracked_sites: 'all_tracked_sites',
  avg_card_age_days: 'avg_card_age_days',
  days_since_install: 'days_since_install',
  board_opens_7days: 'board_opens_7days',
  refresh_clicks_7days: 'refresh_clicks_7days',
};

// ===== TIER 1: Immediately Available Fields (Batch 1) =====
export async function calculateTier1Fields() {
  const syncData = await chrome.storage.sync.get(null);

  // Extract all components (keys starting with "comp-")
  const components = Object.keys(syncData)
    .filter((k) => k.startsWith('comp-'))
    .map((k) => syncData[k]);

  // Calculate basic metrics
  const totalCards = components.length;
  const activeCards = components.filter((c) => !c.pauseRefresh).length;
  const pausedCards = components.filter((c) => c.pauseRefresh).length;
  
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

  // Calculate average card age in days
  const cardAges = components
    .filter((c) => c.last_refresh)
    .map(
      (c) =>
        (Date.now() - new Date(c.last_refresh).getTime()) /
        (1000 * 60 * 60 * 24)
    );
  const avgCardAgeDays =
    cardAges.length > 0
      ? Math.round(cardAges.reduce((a, b) => a + b, 0) / cardAges.length)
      : 0;

  return {
    extension_version: chrome.runtime.getManifest().version,
    total_cards: totalCards,
    active_cards: activeCards,
    'paused_card_rate_%': pausedCardRate, // Percentage, not count
    all_tracked_sites: allTrackedSites,
    avg_card_age_days: avgCardAgeDays,
  };
}

// ===== ROLLING WINDOW HELPERS =====
// Count events within last N days using timestamp arrays
// This approach SURVIVES version updates because timestamps persist in localStorage
function countEventsInWindow(storageKey, windowDays) {
  const raw = localStorage.getItem(storageKey) || '[]';
  const timestamps = JSON.parse(raw);
  const cutoff = Date.now() - (windowDays * 24 * 60 * 60 * 1000);
  
  return timestamps.filter(t => t > cutoff).length;
}

// ===== TIER 2: Requires Tracking Code (Batch 2-4) =====
// NOW USING ROLLING WINDOWS - survives all version updates!
export async function calculateTier2Fields() {
  // Read install_date from chrome.storage.local (service worker compatible)
  const { install_date } = await chrome.storage.local.get('install_date');
  const installDate = parseInt(install_date || Date.now());
  const daysSinceInstall = Math.floor(
    (Date.now() - installDate) / (1000 * 60 * 60 * 24)
  );

  // Rolling 7-day windows (reads from timestamp arrays in localStorage)
  const boardOpens = countEventsInWindow('board_open_timestamps', 7);
  const refreshClicks = countEventsInWindow('refresh_click_timestamps', 7);

  return {
    days_since_install: daysSinceInstall,
    board_opens_7days: boardOpens,
    refresh_clicks_7days: refreshClicks,
  };
}

// ===== COMBINED CALCULATOR (Batch 5) =====
// Returns all 9 hidden fields for Tally form
export async function getAllHiddenFields() {
  const tier1 = await calculateTier1Fields();
  const tier2 = await calculateTier2Fields();

  return {
    ...tier1,
    ...tier2,
  };
}
