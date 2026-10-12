/**
 * GA4 Analytics Module for SpotBoard
 * Stateless usage analytics via Measurement Protocol (#199): no stored or persistent identifier is
 * sent. Every event gets a fresh random client_id that is kept nowhere, there is no session id and no
 * user id, and ages are sent as coarse bands. Not anonymous and not guaranteed unlinkable: the hostname
 * list from one refresh can repeat for the same board, and a few one-shot onboarding events carry the
 * time since install.
 *
 * Tracks:
 * - Feature usage (captures, refreshes, clicks)
 * - Hostnames of captured / refreshed sites and refresh outcomes (reliability)
 * - Error rates (debugging)
 *
 * Does NOT track:
 * - Page paths, titles or captured content
 * - Names, emails or accounts
 */

// ================================
// CONFIGURATION
// ================================
// GA4_MEASUREMENT_ID, GA4_API_SECRET and GA4_ENDPOINT
// are loaded from utils/constants.js (must be loaded before this file in dashboard.html)

// ================================
// OWNER FLAG CACHE
// ================================
// Cache owner flag in memory (for analytics exclusion)
let isOwnerCached = null;

// Load owner flag on page load
(async () => {
  const syncData = await chrome.storage.sync.get(['isOwner']);
  isOwnerCached = syncData.isOwner || false;
})();

// Update cache when storage changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.isOwner) {
    isOwnerCached = changes.isOwner.newValue || false;
    console.log('✅ Owner flag updated:', isOwnerCached);
  }
});

// ================================
// CLIENT ID (stateless)
// ================================

/**
 * GA4 requires a client_id on every request. A fresh random value is generated per event and is
 * never stored, so the ID itself cannot link events (#199). Other fields can still repeat.
 * @returns {string} UUID format client_id
 */
function makeClientId() {
  return crypto.randomUUID();
}

// ================================
// HELPER FUNCTIONS
// ================================

/**
 * Gets extension version from manifest
 * @returns {string} Version number (e.g., "1.2.0")
 */
function getExtensionVersion() {
  return chrome.runtime.getManifest().version;
}

/**
 * Gets browser language
 * @returns {string} Language code (e.g., "en-GB")
 */
function getBrowserLanguage() {
  return navigator.language || 'unknown';
}

/**
 * Best-effort browser / OS / device from Client Hints, falling back to the UA string.
 * Sent as explicit event params (issue #24) so GA4 reporting does not depend on MP's
 * own user_agent processing. UA/platform strings only — never URLs or page content.
 * @returns {{browser: string, os: string, device_type: string}}
 */
function getClientEnv() {
  let browser = 'unknown';
  let device_os = 'unknown';
  let device_type = 'desktop';
  try {
    const uaData = navigator.userAgentData;
    const ua = navigator.userAgent || '';

    if (uaData) {
      const brands = uaData.brands || [];
      // Prefer a specific product brand over the generic "Chromium" / placeholder entries.
      const specific = brands.find(b => /google chrome|microsoft edge|opera|brave|vivaldi|firefox|safari/i.test(b.brand));
      const named = specific
        || brands.find(b => /chromium/i.test(b.brand))
        || brands.find(b => !/not.?a.?brand/i.test(b.brand));
      if (named) browser = named.brand;
      if (uaData.platform) device_os = uaData.platform;
      if (typeof uaData.mobile === 'boolean') device_type = uaData.mobile ? 'mobile' : 'desktop';
    }

    if (browser === 'unknown') {
      if (/Edg\//.test(ua)) browser = 'Microsoft Edge';
      else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
      else if (/Firefox\//.test(ua)) browser = 'Firefox';
      else if (/Chrome\//.test(ua)) browser = 'Chrome';
      else if (/Safari\//.test(ua)) browser = 'Safari';
    }
    if (device_os === 'unknown') {
      if (/Windows/.test(ua)) device_os = 'Windows';
      else if (/Mac OS X|Macintosh/.test(ua)) device_os = 'macOS';
      else if (/CrOS/.test(ua)) device_os = 'Chrome OS';
      else if (/Android/.test(ua)) device_os = 'Android';
      else if (/Linux/.test(ua)) device_os = 'Linux';
    }
    if (device_type === 'desktop' && /Mobi|Android|iPhone|iPad/.test(ua)) device_type = 'mobile';
  } catch (e) {
    /* leave defaults */
  }
  return { browser, device_os, device_type };
}

/**
 * Gets toolbar pin status (cached per session)
 * Must be called from background.js at session start
 * @returns {Promise<boolean>} True if extension pinned to toolbar
 */
async function getToolbarPinStatus() {
  // Check cache first (set by background.js on session start)
  const { toolbarPinStatus } = await chrome.storage.session.get('toolbarPinStatus');
  
  if (toolbarPinStatus !== undefined) {
    return toolbarPinStatus;
  }
  
  // Fallback: Try to detect (only works in background context)
  try {
    if (chrome.action && chrome.action.getUserSettings) {
      const settings = await chrome.action.getUserSettings();
      const isPinned = settings.isOnToolbar || false;
      
      // Cache for this session
      await chrome.storage.session.set({ toolbarPinStatus: isPinned });
      return isPinned;
    }
  } catch (error) {
    console.warn('⚠️ Unable to detect toolbar pin status:', error);
  }
  
  // Unknown status
  return false;
}

/**
 * Coarse age band: the lower bound of 0 / 1-6 / 7-29 / 30+ days (0 for anything not a number >= 1).
 * An exact age is a fixed date that links events across days (#199). Used for install age and card age.
 * Same logic as src/background.ts installAgeBucket and public/utils/feedback-data.js.
 * @param {number} days
 * @returns {number} 0, 1, 7 or 30
 */
function ageBandFromDays(days) {
  if (!(days >= 1)) return 0;
  if (days < 7) return 1;
  if (days < 30) return 7;
  return 30;
}

/**
 * Install-age band (0 if not recorded).
 * @returns {Promise<number>} 0, 1, 7 or 30
 */
async function getDaysSinceInstall() {
  const { install_date } = await chrome.storage.local.get('install_date');
  if (!install_date) return 0;
  return ageBandFromDays(Math.floor((Date.now() - parseInt(install_date)) / (24 * 60 * 60 * 1000)));
}

/**
 * Gets board statistics for analytics. Counts are clamped at 10 ("10 or more") so a large board is
 * not a distinguishing value (#199).
 * @returns {Promise<Object>} { total, active } (each 0-10)
 */
async function getBoardStats() {
  try {
    const allStorage = await chrome.storage.sync.get(null);
    const components = Object.entries(allStorage)
      .filter(([key]) => key.startsWith('comp-'))
      .map(([, value]) => value);
    const total = components.length;
    const active = components.filter(c => !c.refreshPaused).length;
    return { total: Math.min(total, 10), active: Math.min(active, 10) };
  } catch (error) {
    console.error('❌ Error getting board stats:', error);
    return { total: 0, active: 0 };
  }
}

// ================================
// EVENT TRACKING
// ================================

/**
 * Sends an event to GA4 via Measurement Protocol
 * Stateless: nothing identifying an install is stored or sent (#199)
 * 
 * @param {string} eventName - Event name (e.g., 'board_opened')
 * @param {Object} customParams - Additional event parameters
 * @returns {Promise<boolean>} Success status
 */
async function sendEvent(eventName, customParams = {}, engagementTimeMs = 100) {
  try {
    const daysSinceInstall = await getDaysSinceInstall();
    const isPinned = await getToolbarPinStatus();

    // Use cached owner flag (lazy-load if cache not yet initialized)
    if (isOwnerCached === null) {
      const syncData = await chrome.storage.sync.get(['isOwner']);
      isOwnerCached = syncData.isOwner || false;
    }

    // Construct GA4 Measurement Protocol payload
    const payload = {
      client_id: makeClientId(),
      events: [{
        name: eventName,
        params: {
          engagement_time_msec: engagementTimeMs, // Dynamic engagement time (default 100ms for backward compatibility)
          extension_version: getExtensionVersion(),
          browser_language: getBrowserLanguage(),
          days_since_install: daysSinceInstall,
          is_pinned: isPinned,
          ...getClientEnv(),
          ...customParams
        }
      }]
    };

    // Unpacked builds (no update_url) are dev/test: checked per send so it never depends on a
    // stored flag. Internal = owner flag OR dev build; internal events carry the constant user_id
    // 'owner' (BigQuery filter, not an identifier) and traffic_type 'internal' (GA4's internal-traffic
    // data filter). Real users send no user_id at all (#199).
    const isDevBuild = !chrome.runtime.getManifest().update_url;
    const isInternal = isOwnerCached || isDevBuild;
    if (isInternal) {
      payload.user_id = 'owner';
      payload.events[0].params.traffic_type = 'internal';
    }

    // Send to GA4 (dev builds validate only, never recorded; CWS builds record as before)
    const response = await fetch(isDevBuild ? GA4_DEBUG_ENDPOINT : GA4_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (isDevBuild) {
      const result = await response.json().catch(() => null);
      if (result && result.validationMessages && result.validationMessages.length) {
        console.warn('GA4 payload validation:', result.validationMessages);
      }
    }

    if (!response.ok) {
      console.error('❌ GA4 event failed:', response.status);
      return false;
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ GA4 error:', error.message);
    return false;
  }
}

// ================================
// EXPORTS
// ================================

// Make functions available globally for use in other scripts
window.GA4 = {
  sendEvent,
  getExtensionVersion,
  getBrowserLanguage,
  getDaysSinceInstall,
  ageBandFromDays,
  getBoardStats,
  getToolbarPinStatus
};
