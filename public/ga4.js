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

// SpotBoard GA4 Property - Dashboard Stream
const GA4_MEASUREMENT_ID = 'G-JLJS09NDZ6';
const GA4_API_SECRET = 'vrH5dBRiSf6xAuVrJpzKlw';

const GA4_ENDPOINT = `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`;

// Session timeout in milliseconds (30 minutes)
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

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
  
  console.log('🆔 Generated new client_id:', newClientId);
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
  console.log('🔄 New session started:', newSessionId);
  
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
async function sendEvent(eventName, customParams = {}) {
  try {
    const clientId = await getOrCreateClientId();
    const sessionId = await getOrCreateSessionId();
    const daysSinceInstall = await getDaysSinceInstall();
    
    // Construct GA4 Measurement Protocol payload
    const payload = {
      client_id: clientId,
      events: [{
        name: eventName,
        params: {
          session_id: sessionId,
          engagement_time_msec: 100, // Required by GA4
          extension_version: getExtensionVersion(),
          browser_language: getBrowserLanguage(),
          days_since_install: daysSinceInstall,
          ...customParams
        }
      }]
    };
    
    // Send to GA4
    const response = await fetch(GA4_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      console.error('❌ GA4 event failed:', response.status);
      return false;
    }
    
    console.log('✅ GA4 event sent:', eventName, customParams);
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
  getOrCreateClientId,
  getOrCreateSessionId,
  getExtensionVersion,
  getBrowserLanguage,
  getDaysSinceInstall,
  getBoardStats
};

console.log('📊 GA4 module loaded');