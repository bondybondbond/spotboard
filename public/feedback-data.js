/**
 * Tally.so Feedback Integration - Hidden Fields Calculator
 * 
 * This file provides functions to calculate all hidden fields
 * that will be pre-populated in Tally feedback forms.
 */

/**
 * Calculate Tier 1 hidden fields (immediately available from storage)
 * These fields don't require any additional tracking code
 * 
 * @returns {Promise<Object>} Object with 6 Tier 1 fields
 */
async function calculateTier1Fields() {
  const syncData = await chrome.storage.sync.get(null);

  // Extract all components
  const components = Object.keys(syncData)
    .filter((k) => k.startsWith("comp-"))
    .map((k) => syncData[k]);

  // Calculate metrics
  const totalCards = components.length;
  const activeCards = components.filter((c) => !c.refreshPaused).length;
  const pausedCards = components.filter((c) => c.refreshPaused).length;
  
  // Calculate paused card rate as percentage (0-100)
  const pausedCardRate = totalCards > 0 
    ? Math.round((pausedCards / totalCards) * 100) 
    : 0;

  // Extract all sites with counts
  const siteData = {};
  components.forEach((c) => {
    try {
      const domain = new URL(c.url).hostname;
      siteData[domain] = (siteData[domain] || 0) + 1;
    } catch (e) {
      console.warn("[Feedback] Invalid URL:", c.url);
    }
  });

  const allTrackedSites =
    Object.entries(siteData)
      .map(([domain, count]) => `${domain}(${count})`)
      .join(" | ") || "none";

  // Calculate average card age in days
  const cardAges = components
    .filter((c) => c.last_refresh)
    .map(
      (c) =>
        (Date.now() - new Date(c.last_refresh).getTime()) /
        (1000 * 60 * 60 * 24),
    );
  const avgCardAgeDays =
    cardAges.length > 0
      ? Math.round(cardAges.reduce((a, b) => a + b, 0) / cardAges.length)
      : 0;

  return {
    extension_version: chrome.runtime.getManifest().version,
    total_cards: totalCards,
    active_cards: activeCards,
    'paused_card_rate_%': pausedCardRate, // Percentage (0-100), not count
    all_tracked_sites: allTrackedSites,
    avg_card_age_days: avgCardAgeDays,
  };
}


