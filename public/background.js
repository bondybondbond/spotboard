// SpotBoard Background Script
// Handles extension lifecycle events, GA4 analytics, and message routing

// ================================
// GA4 CONFIGURATION (Service Worker Compatible)
// ================================

const GA4_MEASUREMENT_ID = 'G-JLJS09NDZ6';
const GA4_API_SECRET = 'vrH5dBRiSf6xAuVrJpzKlw';
const GA4_ENDPOINT = `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

// ================================
// GA4 HELPER FUNCTIONS
// ================================

async function getOrCreateClientId() {
  const { clientId } = await chrome.storage.local.get('clientId');
  if (clientId) return clientId;
  
  const newClientId = crypto.randomUUID();
  await chrome.storage.local.set({ clientId: newClientId });
  return newClientId;
}

async function getOrCreateSessionId() {
  const now = Date.now();
  const { sessionData } = await chrome.storage.session.get('sessionData');
  
  if (sessionData && (now - sessionData.lastActivity) < SESSION_TIMEOUT_MS) {
    sessionData.lastActivity = now;
    await chrome.storage.session.set({ sessionData });
    return sessionData.sessionId;
  }
  
  const newSessionId = now.toString();
  await chrome.storage.session.set({ sessionData: { sessionId: newSessionId, lastActivity: now } });
  return newSessionId;
}

async function getDaysSinceInstall() {
  const { firstInstallDate } = await chrome.storage.local.get('firstInstallDate');
  if (!firstInstallDate) return 0;
  return Math.floor((Date.now() - new Date(firstInstallDate).getTime()) / (24 * 60 * 60 * 1000));
}

function getExtensionVersion() {
  return chrome.runtime.getManifest().version;
}

/**
 * Sends GA4 event from service worker context
 */
async function sendGA4Event(eventName, customParams = {}) {
  try {
    const clientId = await getOrCreateClientId();
    const sessionId = await getOrCreateSessionId();
    const daysSinceInstall = await getDaysSinceInstall();
    
    const payload = {
      client_id: clientId,
      events: [{
        name: eventName,
        params: {
          session_id: sessionId,
          engagement_time_msec: 100,
          extension_version: getExtensionVersion(),
          browser_language: navigator.language || 'unknown',
          days_since_install: daysSinceInstall,
          ...customParams
        }
      }]
    };
    
    const response = await fetch(GA4_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    console.log('✅ GA4 event sent from background:', eventName, customParams);
    return response.ok;
  } catch (error) {
    console.error('❌ GA4 background error:', error.message);
    return false;
  }
}

// ================================
// MESSAGE HANDLER (for content scripts)
// ================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📬 Background received message:', message.type, message);
  if (message.type === 'GA4_EVENT') {
    console.log('🔍 Processing GA4_EVENT:', message.eventName);
    // Handle GA4 events from content scripts
    sendGA4Event(message.eventName, message.params)
      .then(success => {
        console.log('✅ GA4 event processed successfully');
        sendResponse({ success });
      })
      .catch(error => {
        console.error('❌ GA4 event failed:', error.message);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }
});

// ================================
// INSTALL DATE TRACKING
// ================================

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Fresh install - store install date
    const installDate = new Date().toISOString();
    await chrome.storage.local.set({ firstInstallDate: installDate });
    console.log('🎉 Extension installed at:', installDate);
    
    // Send GA4 extension_installed event
    await sendGA4Event('extension_installed', {
      referrer: 'chrome_web_store'
    });
  } else if (details.reason === 'update') {
    // Update - preserve existing install date if it exists
    const { firstInstallDate } = await chrome.storage.local.get('firstInstallDate');
    if (!firstInstallDate) {
      const installDate = new Date().toISOString();
      await chrome.storage.local.set({ firstInstallDate: installDate });
      console.log('⚠️ Install date was missing, set to:', installDate);
    } else {
      console.log('✅ Install date preserved:', firstInstallDate);
    }
  }
});
    console.log('🎉 Extension installed at:', installDate);
  } else if (details.reason === 'update') {
    // Update - preserve existing install date if it exists
    const { firstInstallDate } = await chrome.storage.local.get('firstInstallDate');
    if (!firstInstallDate) {
      // If somehow missing, use current date
      const installDate = new Date().toISOString();
      await chrome.storage.local.set({ firstInstallDate: installDate });
      console.log('⚠️ Install date was missing, set to:', installDate);
    } else {
      console.log('✅ Install date preserved:', firstInstallDate);
    }
  }
});