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

// Cache owner flag in memory (loaded once on startup, MV3 service worker compatible)
let isOwnerCached: boolean | null = null;

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

// Best-effort browser / OS / device from Client Hints, falling back to the UA string.
// Sent as explicit event params (issue #24) so GA4 reporting does not depend on MP's
// own user_agent processing. UA/platform strings only — never URLs or page content.
function getClientEnv(): { browser: string; device_os: string; device_type: string } {
  let browser = 'unknown';
  let device_os = 'unknown';
  let device_type = 'desktop';
  try {
    const uaData = (navigator as unknown as { userAgentData?: {
      brands?: { brand: string }[]; platform?: string; mobile?: boolean;
    } }).userAgentData;
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
  } catch {
    /* leave defaults */
  }
  return { browser, device_os, device_type };
}

async function sendGA4Event(eventName: string, customParams: Record<string, unknown> = {}): Promise<boolean> {
  try {
    const clientId = await getOrCreateClientId();
    const sessionId = await getOrCreateSessionId();
    const daysSinceInstall = await getDaysSinceInstall();

    // Use cached owner flag (lazy-load if cache not yet initialized)
    if (isOwnerCached === null) {
      const syncData = await chrome.storage.sync.get(['isOwner']) as { isOwner?: boolean };
      isOwnerCached = syncData.isOwner || false;
    }

    const payload: Record<string, unknown> = {
      client_id: clientId,
      events: [{
        name: eventName,
        params: {
          session_id: sessionId,
          engagement_time_msec: 100,
          extension_version: chrome.runtime.getManifest().version,
          browser_language: navigator.language || 'unknown',
          days_since_install: daysSinceInstall,
          ...getClientEnv(),
          ...customParams
        }
      }]
    };

    // Set user_id: 'owner' for dev builds (analytics exclusion), or local install UUID for real users
    const localData = await chrome.storage.local.get('user_id');
    const localUserId = localData['user_id'] as string | undefined;
    payload.user_id = isOwnerCached ? 'owner' : localUserId;

    // GA4 MP: forward the UA string so GA4 can populate Browser / OS / Device / Platform.
    // UA string only — never full URLs, page titles, or captured content (issue #24).
    payload.user_agent = navigator.userAgent;

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

// Auto-mark unpacked dev builds as owner so they're always filtered from GA4.
// Published CWS extensions always have update_url set; sideloaded dev builds don't.
// No extra manifest permissions needed — update_url is part of the standard manifest.
async function autoMarkDevBuild(): Promise<void> {
  if (!chrome.runtime.getManifest().update_url) {
    await chrome.storage.sync.set({ isOwner: true });
    isOwnerCached = true;
    if (DEBUG) console.log('🔧 Dev build detected — auto-marked as owner');
  }
}

// Cache pin status and owner flag on browser startup
chrome.runtime.onStartup.addListener(async () => {
  if (DEBUG) console.log('🚀 Browser started, checking toolbar pin status');
  await autoMarkDevBuild(); // Must run before owner flag is read below
  await cacheToolbarPinStatus();

  // Load owner flag into memory cache (for GA4 event filtering)
  const syncData = await chrome.storage.sync.get(['isOwner']) as { isOwner?: boolean };
  isOwnerCached = syncData.isOwner || false;
  if (DEBUG) console.log('Owner flag loaded:', isOwnerCached);
});

// Update owner flag cache when storage changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.isOwner) {
    const nv = changes.isOwner.newValue;
    isOwnerCached = (typeof nv === 'boolean') ? nv : false;
    console.log('✅ Owner flag updated:', isOwnerCached);
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  // Auto-mark dev builds first — must run before any GA4 event fires
  await autoMarkDevBuild();
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
    
    // First-time install - open dashboard with Interactive Directory
    await chrome.storage.local.set({ onboardingStarted: true });
    chrome.tabs.create({
      url: chrome.runtime.getURL('dashboard.html')
    });
  }
  
  // Backfill install_date and user_id for users who upgraded from pre-v1.2.1
  // (These were only set on fresh install, not on update)
  if (details.reason === 'update') {
    const existing = await chrome.storage.local.get(['install_date', 'user_id']) as { install_date?: string; user_id?: string };
    const backfill: Record<string, string> = {};
    if (!existing.install_date) {
      backfill.install_date = Date.now().toString();
      if (DEBUG) console.log('Backfilled install_date for existing user');
    }
    if (!existing.user_id) {
      backfill.user_id = crypto.randomUUID();
      if (DEBUG) console.log('Backfilled user_id for existing user');
    }
    if (Object.keys(backfill).length > 0) {
      await chrome.storage.local.set(backfill);
    }
    // Mark existing users so dashboard tour doesn't fire after upgrade
    await chrome.storage.local.set({ hasExistingCards: true, dashboardTourShown: true });
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

// Resolve a pending-tab handshake key, tolerating the fire-and-forget race where the
// dashboard's chrome.storage.session.set hasn't landed yet when the content script asks.
// Checks now, then once more after a short delay. Clears the key on a match. (#31)
async function matchPendingTab(key: 'pendingOnboardingTabId' | 'pendingCaptureTabId', tabId?: number): Promise<boolean> {
  if (tabId === undefined) return false;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await chrome.storage.session.get(key);
    if (result[key] === tabId) {
      await chrome.storage.session.remove(key);
      return true;
    }
    if (attempt === 0) await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

// #52: a re-capture start is only honoured if the new tab asks within this window.
type RecaptureLatest = Record<string, { sessionId: string; tabId: number }>;
const RECAPTURE_START_WINDOW_MS = 2 * 60 * 1000;

// #52: closing the tab abandons its re-capture -- drop any handshake or latest-session bound to it.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    const { pendingRecapture, recaptureLatest } = await chrome.storage.session.get(['pendingRecapture', 'recaptureLatest']) as { pendingRecapture?: { tabId: number }; recaptureLatest?: RecaptureLatest };
    if (pendingRecapture && pendingRecapture.tabId === tabId) await chrome.storage.session.remove('pendingRecapture');
    if (recaptureLatest) {
      let changed = false;
      for (const cardId of Object.keys(recaptureLatest)) {
        if (recaptureLatest[cardId].tabId === tabId) { delete recaptureLatest[cardId]; changed = true; }
      }
      if (changed) await chrome.storage.session.set({ recaptureLatest });
    }
  } catch { /* session storage unavailable -- nothing to clean */ }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Onboarding re-trigger pull model: content script asks if it should start onboarding.
  // The dashboard writes pendingOnboardingTabId in a fire-and-forget callback after
  // chrome.tabs.create; a fast/cached page can ask before that set resolves, so re-check
  // once after a short delay before giving up (#31).
  if (request.type === 'CHECK_ONBOARDING') {
    const tabId = sender.tab?.id;
    (async () => {
      try {
        const matched = await matchPendingTab('pendingOnboardingTabId', tabId);
        if (matched) console.debug('[sb-onboarding] CHECK_ONBOARDING: tab', tabId, 'matched — clearing');
        sendResponse(matched);
      } catch {
        sendResponse(false); // channel closed (redirect mid-flight) — fail silently
      }
    })();
    return true; // keep message channel open for async sendResponse
  }

  // Capture auto-start pull model: content script asks if it should start capture
  if (request.type === 'CHECK_CAPTURE') {
    const tabId = sender.tab?.id;
    (async () => {
      try {
        const matched = await matchPendingTab('pendingCaptureTabId', tabId);
        if (!matched) { sendResponse(false); return; }
        // #52: a re-capture start also leaves a tab-bound pendingRecapture; consume it (only if
        // fresh) and record it as the latest session for that card so an older tab is superseded.
        const { pendingRecapture } = await chrome.storage.session.get('pendingRecapture') as { pendingRecapture?: { tabId: number; cardId: string; sessionId: string; label: string; startedAt: number } };
        if (pendingRecapture && pendingRecapture.tabId === tabId) {
          await chrome.storage.session.remove('pendingRecapture');
          if (Date.now() - pendingRecapture.startedAt < RECAPTURE_START_WINDOW_MS) {
            const { recaptureLatest = {} } = await chrome.storage.session.get('recaptureLatest') as { recaptureLatest?: RecaptureLatest };
            recaptureLatest[pendingRecapture.cardId] = { sessionId: pendingRecapture.sessionId, tabId };
            await chrome.storage.session.set({ recaptureLatest });
            sendResponse({ recapture: { cardId: pendingRecapture.cardId, sessionId: pendingRecapture.sessionId, label: pendingRecapture.label } });
            return;
          }
        }
        sendResponse(true);
      } catch {
        sendResponse(false);
      }
    })();
    return true;
  }

  // #52: save-time check that this tab's re-capture is still the latest for its card.
  // Consumed on success so one session can commit once.
  if (request.type === 'RECAPTURE_CLAIM') {
    (async () => {
      try {
        const { recaptureLatest = {} } = await chrome.storage.session.get('recaptureLatest') as { recaptureLatest?: RecaptureLatest };
        const current = recaptureLatest[request.cardId];
        if (current && current.sessionId === request.sessionId && current.tabId === sender.tab?.id) {
          delete recaptureLatest[request.cardId];
          await chrome.storage.session.set({ recaptureLatest });
          sendResponse(true);
        } else {
          sendResponse(false);
        }
      } catch {
        sendResponse(false);
      }
    })();
    return true;
  }

  // GA4 event handler from content scripts
  if (request.type === 'GA4_EVENT') {
    sendGA4Event(request.eventName, request.params)
      .then(success => sendResponse({ success }))
      .catch(error => sendResponse({ success: false, error: String(error) }));
    return true; // Keep channel open for async response
  }
  
  // #53: a dashboard window can end up at stale coordinates (e.g. after a monitor is
  // disconnected or the display layout changes) — chrome.windows.update({focused:true})
  // reports success even when the window sits entirely off every connected display.
  // Reposition onto the primary display only when it isn't actually visible anywhere;
  // a window on a legitimate second monitor is left alone.
  async function ensureWindowVisible(windowId: number): Promise<void> {
    const win = await chrome.windows.get(windowId);
    const displays = await chrome.system.display.getInfo();
    if (displays.length === 0) return; // no display info available — best effort only

    const bounds = { left: win.left ?? 0, top: win.top ?? 0, width: win.width ?? 0, height: win.height ?? 0 };
    const intersects = (area: chrome.system.display.Bounds) =>
      bounds.left < area.left + area.width && bounds.left + bounds.width > area.left &&
      bounds.top < area.top + area.height && bounds.top + bounds.height > area.top;

    const onScreen = displays.some(d => intersects(d.workArea));

    if (win.state === 'minimized') {
      // Restore it — a minimized window is never visible regardless of its bounds.
      await chrome.windows.update(windowId, { state: 'normal' });
    }
    // Bounds are only actually wrong if the window sits off every connected display;
    // a merely-minimized window on a legitimate second monitor keeps its own position.
    if (onScreen) return;

    const primary = displays.find(d => d.isPrimary) ?? displays[0];
    const width = Math.min(bounds.width || primary.workArea.width, primary.workArea.width);
    const height = Math.min(bounds.height || primary.workArea.height, primary.workArea.height);
    const left = primary.workArea.left + Math.round((primary.workArea.width - width) / 2);
    const top = primary.workArea.top + Math.round((primary.workArea.height - height) / 2);

    // Chrome rejects setting explicit bounds together with a maximized/minimized state
    // in the same call, so restore to 'normal' first.
    await chrome.windows.update(windowId, { state: 'normal' });
    await chrome.windows.update(windowId, { left, top, width, height });
  }

  // Dashboard focus handler (for "View on SpotBoard" button)
  if (request.action === 'focusDashboard') {
    const dashboardUrl = chrome.runtime.getURL('dashboard.html');
    const highlightCardId: string | undefined = request.highlightCardId;

    (async () => {
      // #19: stash the just-captured card id for the dashboard render to consume.
      // Written here (trusted context) — a content script can't write storage.session.
      if (highlightCardId) {
        try {
          await chrome.storage.session.set({
            pendingHighlightCard: { id: highlightCardId, ts: Date.now() }
          });
        } catch (e) {
          console.warn('pendingHighlightCard set failed:', e);
        }
      }

      const tabs = await chrome.tabs.query({});
      // tolerant match: a dashboard tab carrying a hash/query still counts
      const dashboardTab = tabs.find(tab => !!tab.url && tab.url.split(/[?#]/)[0] === dashboardUrl);
      const senderWindowId = sender.tab?.windowId;

      if (dashboardTab && dashboardTab.id) {
        // #53: bring the dashboard into the window the user is actually looking at
        // (the one they just captured from) rather than switching OS focus to wherever
        // else it happens to be open — a separate window, even on another monitor, is
        // easy to miss when the user's workflow keeps everything in one window.
        if (senderWindowId !== undefined && dashboardTab.windowId !== senderWindowId) {
          await chrome.tabs.move(dashboardTab.id, { windowId: senderWindowId, index: -1 });
        }
        await chrome.tabs.update(dashboardTab.id, { active: true });
        const targetWindowId = senderWindowId ?? dashboardTab.windowId!;
        try {
          await ensureWindowVisible(targetWindowId);
        } catch (e) {
          console.warn('ensureWindowVisible failed:', e);
        }
        await chrome.windows.update(targetWindowId, { focused: true });
        // #19: re-run the render so an already-open board shows the new card and
        // picks up the highlight. Only when we're actually highlighting.
        if (highlightCardId) chrome.tabs.reload(dashboardTab.id);
        sendResponse({ found: true });
      } else {
        sendResponse({ found: false });
      }
    })();

    return true;
  }

  // Dashboard open handler
  if (request.action === 'openDashboard') {
    const highlightCardId: string | undefined = request.highlightCardId;

    (async () => {
      if (highlightCardId) {
        try {
          await chrome.storage.session.set({
            pendingHighlightCard: { id: highlightCardId, ts: Date.now() }
          });
        } catch (e) {
          console.warn('pendingHighlightCard set failed:', e);
        }
      }
      // #53: explicit windowId so this opens in the tab the user is looking at, not
      // whichever window Chrome considers "current" (can differ across monitors).
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html'), windowId: sender.tab?.windowId });
      sendResponse({ opened: true });
    })();

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
