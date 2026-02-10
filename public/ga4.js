/**
 * GA4 Analytics Module for SpotBoard
 * Privacy-compliant anonymous tracking via Measurement Protocol
 * 
 * Tracks:
 * - Feature usage (captures, refreshes, clicks)
 * - Activation funnel (install → first capture → retention)
 * - Error rates (debugging)
 * 
 * Does NOT track:
 * - Browsing history
 * - Captured content
 * - Personal information
 */

// ================================
// CONFIGURATION
// ================================
// GA4_MEASUREMENT_ID, GA4_API_SECRET, GA4_ENDPOINT, and SESSION_TIMEOUT_MS
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
// CLIENT ID MANAGEMENT
// ================================

/**
 * Gets or creates a persistent anonymous client ID
 * Stored in chrome.storage.local (permanent, survives browser restarts)
 * @returns {Promise<string>} UUID format client_id
 */
async function getOrCreateClientId() {
  const { clientId } = await chrome.storage.local.get('clientId');
  
  if (clientId) {
    return clientId;
  }
  
  // Generate new UUID for anonymous tracking
  const newClientId = crypto.randomUUID();
  await chrome.storage.local.set({ clientId: newClientId });
  
  return newClientId;
}

// ================================
// SESSION MANAGEMENT
// ================================

/**
 * Gets or creates a session ID with 30-minute timeout
 * Stored in chrome.storage.session (cleared on browser close)
 * @returns {Promise<string>} Timestamp-based session_id
 */
async function getOrCreateSessionId() {
  const now = Date.now();
  const { sessionData } = await chrome.storage.session.get('sessionData');
  
  // Check if existing session is still valid
  if (sessionData && (now - sessionData.lastActivity) < SESSION_TIMEOUT_MS) {
    // Update last activity timestamp
    sessionData.lastActivity = now;
    await chrome.storage.session.set({ sessionData });
    return sessionData.sessionId;
  }
  
  // Create new session
  const newSessionId = now.toString();
  const newSessionData = {
    sessionId: newSessionId,
    lastActivity: now
  };
  
  await chrome.storage.session.set({ sessionData: newSessionData });
  
  return newSessionId;
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
 * Calculates days since extension was first installed
 * @returns {Promise<number>} Number of days (0 if install date not recorded)
 */
async function getDaysSinceInstall() {
  const { firstInstallDate } = await chrome.storage.local.get('firstInstallDate');
  
  if (!firstInstallDate) {
    return 0;
  }
  
  const installTime = new Date(firstInstallDate).getTime();
  const now = Date.now();
  const daysSince = Math.floor((now - installTime) / (24 * 60 * 60 * 1000));
  
  return daysSince;
}

/**
 * Gets board statistics for analytics
 * @returns {Promise<Object>} Board stats object
 */
async function getBoardStats() {
  try {
    // Get all components from sync storage
    const allStorage = await chrome.storage.sync.get(null);
    const components = Object.entries(allStorage)
      .filter(([key]) => key.startsWith('comp-'))
      .map(([, value]) => value);
    
    // Calculate stats
    const total = components.length;
    const active = components.filter(c => !c.refreshPaused).length;
    const paused = total - active;
    const pausedRate = total > 0 ? Math.round((paused / total) * 100) : 0;
    
    // Get unique domains (limit to 100 chars for GA4)
    const domains = [...new Set(components.map(c => {
      try {
        return new URL(c.url).hostname;
      } catch {
        return 'unknown';
      }
    }))];
    const allTrackedSites = domains.join(',').substring(0, 100);
    
    // Calculate average card age
    const now = Date.now();
    const ages = components.map(c => {
      const created = new Date(c.created_at || Date.now()).getTime();
      return Math.floor((now - created) / (24 * 60 * 60 * 1000));
    });
    const avgCardAge = ages.length > 0 
      ? Math.round(ages.reduce((sum, age) => sum + age, 0) / ages.length)
      : 0;
    
    return {
      total,
      active,
      paused,
      pausedRate,
      allTrackedSites,
      avgCardAge
    };
  } catch (error) {
    console.error('❌ Error getting board stats:', error);
    return {
      total: 0,
      active: 0,
      paused: 0,
      pausedRate: 0,
      allTrackedSites: '',
      avgCardAge: 0
    };
  }
}

// ================================
// EVENT TRACKING
// ================================

/**
 * Sends an event to GA4 via Measurement Protocol
 * All events are anonymous - no PII collected
 * 
 * @param {string} eventName - Event name (e.g., 'board_opened')
 * @param {Object} customParams - Additional event parameters
 * @returns {Promise<boolean>} Success status
 */
async function sendEvent(eventName, customParams = {}, engagementTimeMs = 100) {
  try {
    const clientId = await getOrCreateClientId();
    const sessionId = await getOrCreateSessionId();
    const daysSinceInstall = await getDaysSinceInstall();
    const isPinned = await getToolbarPinStatus();

    // Use cached owner flag (lazy-load if cache not yet initialized)
    if (isOwnerCached === null) {
      const syncData = await chrome.storage.sync.get(['isOwner']);
      isOwnerCached = syncData.isOwner || false;
    }

    // Construct GA4 Measurement Protocol payload
    const payload = {
      client_id: clientId,
      events: [{
        name: eventName,
        params: {
          session_id: sessionId,
          engagement_time_msec: engagementTimeMs, // Dynamic engagement time (default 100ms for backward compatibility)
          extension_version: getExtensionVersion(),
          browser_language: getBrowserLanguage(),
          days_since_install: daysSinceInstall,
          is_pinned: isPinned,
          ...customParams
        }
      }]
    };

    // Add user_id field if owner flag is set (for analytics exclusion)
    if (isOwnerCached) {
      payload.user_id = 'owner';
    }

    // Send to GA4
    const response = await fetch(GA4_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
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
// ROLLING WINDOW METRICS
// ================================

/**
 * Increments a rolling metric by adding current timestamp
 * Auto-prunes events older than specified window
 * 
 * @param {string} metricName - Metric identifier (e.g., 'board_opens')
 * @param {number} windowDays - Window size in days (default: 7)
 * @returns {Promise<number>} Count of events in window
 */
async function incrementRollingMetric(metricName, windowDays = 7) {
  const key = `${metricName}_events`;
  const { [key]: events = [] } = await chrome.storage.local.get(key);
  
  // Add current timestamp
  events.push(Date.now());
  
  // Remove events older than window
  const cutoff = Date.now() - (windowDays * 24 * 60 * 60 * 1000);
  const recentEvents = events.filter(ts => ts > cutoff);
  
  // Save back to storage
  await chrome.storage.local.set({ [key]: recentEvents });
  
  return recentEvents.length;
}

/**
 * Gets count of events within rolling window (read-only)
 * 
 * @param {string} metricName - Metric identifier (e.g., 'board_opens')
 * @param {number} windowDays - Window size in days (default: 7)
 * @returns {Promise<number>} Count of events in window
 */
async function getRollingMetric(metricName, windowDays = 7) {
  const key = `${metricName}_events`;
  const { [key]: events = [] } = await chrome.storage.local.get(key);
  
  // Filter to events within window
  const cutoff = Date.now() - (windowDays * 24 * 60 * 60 * 1000);
  const recentEvents = events.filter(ts => ts > cutoff);
  
  return recentEvents.length;
}

// ================================
// EXPORTS
// ================================

// Make functions available globally for use in other scripts
window.GA4 = {
  sendEvent,
  getOrCreateClientId,
  getOrCreateSessionId,
  getExtensionVersion,
  getBrowserLanguage,
  getDaysSinceInstall,
  getBoardStats,
  incrementRollingMetric,
  getRollingMetric,
  getToolbarPinStatus
};
