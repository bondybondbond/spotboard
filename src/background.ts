// Background service worker for SpotBoard
// Handles extension lifecycle, GA4 analytics, and message routing

// ================================
// GA4 CONFIGURATION (Service Worker Compatible)
// Source of truth: public/utils/constants.js
// Service worker can't load <script> tags, so these are duplicated here.
// If credentials change, update BOTH this file and constants.js.
// ================================
const GA4_MEASUREMENT_ID = 'G-JLJS09NDZ6';
const GA4_API_SECRET = 'vrH5dBRiSf6xAuVrJpzKlw';
const GA4_ENDPOINT = `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const DEBUG = false;

async function getOrCreateClientId(): Promise<string> {
  const result = await chrome.storage.local.get('clientId') as { clientId?: string };
  if (result.clientId) return result.clientId;
  
  const newClientId = crypto.randomUUID();
  await chrome.storage.local.set({ clientId: newClientId });
  return newClientId;
}

async function getOrCreateSessionId(): Promise<string> {
  const now = Date.now();
  const result = await chrome.storage.session.get('sessionData');
  const sessionData = result.sessionData as { sessionId: string; lastActivity: number } | undefined;
  
  if (sessionData && (now - sessionData.lastActivity) < SESSION_TIMEOUT_MS) {
    sessionData.lastActivity = now;
    await chrome.storage.session.set({ sessionData });
    return sessionData.sessionId;
  }
  
  const newSessionId = now.toString();
  await chrome.storage.session.set({ sessionData: { sessionId: newSessionId, lastActivity: now } });
  return newSessionId;
}

async function getDaysSinceInstall(): Promise<number> {
  const result = await chrome.storage.local.get('install_date') as { install_date?: string };
  if (!result.install_date) return 0;
  return Math.floor((Date.now() - parseInt(result.install_date)) / (24 * 60 * 60 * 1000));
}

async function sendGA4Event(eventName: string, customParams: Record<string, unknown> = {}): Promise<boolean> {
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
          extension_version: chrome.runtime.getManifest().version,
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
    
    return response.ok;
  } catch (error) {
    console.error('❌ GA4 background error:', error);
    return false;
  }
}

// ================================
// EXTENSION LIFECYCLE
// ================================
// ================================
// TOOLBAR PIN STATUS DETECTION
// ================================
async function cacheToolbarPinStatus(): Promise<void> {
  try {
    if (chrome.action?.getUserSettings) {
      const settings = await chrome.action.getUserSettings();
      const isPinned = settings.isOnToolbar || false;
      await chrome.storage.session.set({ toolbarPinStatus: isPinned });
    }
  } catch (error) {
    console.warn('⚠️ Unable to detect toolbar pin status:', error);
  }
}

// Cache pin status on browser startup
chrome.runtime.onStartup.addListener(async () => {
  if (DEBUG) console.log('🚀 Browser started, checking toolbar pin status');
  await cacheToolbarPinStatus();
});

chrome.runtime.onInstalled.addListener(async (details) => {
  // Cache toolbar pin status on install/update
  await cacheToolbarPinStatus();
  
  if (details.reason === 'install') {
    // Generate anonymous user ID for feedback tracking (privacy-safe UUID)
    const userId = crypto.randomUUID();
    
    // Track install date for feedback system
    const installDate = Date.now().toString();
    await chrome.storage.local.set({ 
      'install_date': installDate,
      'user_id': userId
    });
    if (DEBUG) console.log('SpotBoard installed at:', new Date(parseInt(installDate)).toISOString());
    if (DEBUG) console.log('Anonymous user ID:', userId);
    
    // GA4: Track extension install
    await sendGA4Event('extension_installed', {
      referrer: 'chrome_web_store'
    });
    if (DEBUG) console.log('📊 GA4: extension_installed sent');
    
    // First-time install - open dashboard with tutorial modal
    chrome.tabs.create({
      url: chrome.runtime.getURL('dashboard.html')
    });
  }
  
  // Set uninstall survey URL (runs on both install and update)
  await setUninstallSurveyURL();
});

// ================================
// UNINSTALL SURVEY
// ================================
// Set uninstall survey URL with pre-populated analytics (same pattern as feedback forms)
async function setUninstallSurveyURL() {
  try {
    // Read analytics data from chrome.storage.local
    const storageData = await chrome.storage.local.get(['user_id', 'install_date']) as { user_id?: string; install_date?: string };
    const user_id = storageData.user_id;
    const install_date = storageData.install_date;
    
    // Calculate days since install
    const installTimestamp = parseInt(install_date || Date.now().toString());
    const daysSinceInstall = Math.floor((Date.now() - installTimestamp) / (1000 * 60 * 60 * 24));
    
    // Get board statistics from chrome.storage.sync
    const syncData = await chrome.storage.sync.get(null) as Record<string, any>;
    const components = Object.values(syncData).filter((item: any) => 
      item && typeof item === 'object' && item.url && item.selector
    ) as any[];
    
    const totalCards = components.length;
    const activeCards = components.filter((c: any) => !c.isPaused).length;
    const pausedCardRate = totalCards > 0 ? Math.round((1 - activeCards / totalCards) * 100) : 0;
    
    // Calculate average card age
    const cardAges = components
      .filter((c: any) => c.createdAt)
      .map((c: any) => Math.floor((Date.now() - c.createdAt) / (1000 * 60 * 60 * 24)));
    const avgCardAge = cardAges.length > 0 
      ? Math.round(cardAges.reduce((sum, age) => sum + age, 0) / cardAges.length)
      : 0;
    
    // Get all tracked sites
    const allSites = [...new Set(components.map((c: any) => {
      try {
        return new URL(c.url).hostname;
      } catch {
        return 'unknown';
      }
    }))].join(', ');
    
    // Build Tally URL with all hidden fields (matches feedback-data.js pattern)
    const baseURL = 'https://tally.so/r/A7vEPN';
    const params = new URLSearchParams();
    
    params.append('user_id', user_id || 'unknown');
    params.append('days_since_install', daysSinceInstall.toString());
    params.append('browser_language', chrome.i18n.getUILanguage());
    params.append('extension_version', chrome.runtime.getManifest().version);
    params.append('total_cards', totalCards.toString());
    params.append('active_cards', activeCards.toString());
    params.append('paused_card_rate_%', pausedCardRate.toString());
    params.append('all_tracked_sites', allSites || 'none');
    params.append('avg_card_age_days', avgCardAge.toString());
    params.append('board_opens_7days', '0'); // Fallback - tracking not yet migrated to service worker
    params.append('refresh_clicks_7days', '0'); // Fallback - tracking not yet migrated to service worker
    
    const uninstallURL = `${baseURL}?${params.toString()}`;
    
    // Set the uninstall URL
    chrome.runtime.setUninstallURL(uninstallURL);
    if (DEBUG) console.log('🔗 Uninstall survey URL set with analytics params');
  } catch (error) {
    console.error('Failed to set uninstall survey URL:', error);
    // Fallback to basic URL without params
    chrome.runtime.setUninstallURL('https://tally.so/r/A7vEPN');
  }
}

// Also set on service worker startup (in case of browser restart)
setUninstallSurveyURL();

// ================================
// MESSAGE HANDLERS
// ================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // GA4 event handler from content scripts
  if (request.type === 'GA4_EVENT') {
    sendGA4Event(request.eventName, request.params)
      .then(success => sendResponse({ success }))
      .catch(error => sendResponse({ success: false, error: String(error) }));
    return true; // Keep channel open for async response
  }
  
  // Dashboard focus handler (for "View on SpotBoard" button)
  if (request.action === 'focusDashboard') {
    const dashboardUrl = chrome.runtime.getURL('dashboard.html');
    
    chrome.tabs.query({}, (tabs) => {
      const dashboardTab = tabs.find(tab => tab.url === dashboardUrl);
      
      if (dashboardTab && dashboardTab.id) {
        chrome.tabs.update(dashboardTab.id, { active: true });
        chrome.windows.update(dashboardTab.windowId!, { focused: true });
        sendResponse({ found: true });
      } else {
        sendResponse({ found: false });
      }
    });
    
    return true;
  }
  
  // Dashboard open handler
  if (request.action === 'openDashboard') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('dashboard.html')
    });
    sendResponse({ opened: true });
    return true;
  }
});

// ================================
// GLOBAL ERROR TRACKING (Batch 5)
// ================================
// Track unhandled promise rejections
addEventListener('unhandledrejection', async (event) => {
  console.error('❌ Unhandled Promise Rejection:', event.reason);
  
  // Sanitize error message (remove URLs and sensitive data)
  const sanitizeError = (msg: string): string => {
    return msg
      .replace(/https?:\/\/[^\s]+/g, '[URL]') // Remove URLs
      .replace(/chrome-extension:\/\/[^\s]+/g, '[EXT_URL]') // Remove extension URLs
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]') // Remove emails
      .substring(0, 200); // Limit length
  };
  
  const errorMsg = event.reason?.message || String(event.reason) || 'Unknown error';
  const errorStack = event.reason?.stack?.split('\n')[0] || 'unknown';
  
  await sendGA4Event('extension_error', {
    error_message: sanitizeError(errorMsg),
    error_source: sanitizeError(errorStack)
  });
});

// Export empty object to satisfy TypeScript module requirements
export {};
