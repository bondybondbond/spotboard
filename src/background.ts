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
// Unpacked (dev/test) builds send here instead: validates the payload, records nothing in GA4
const GA4_DEBUG_ENDPOINT = `https://www.google-analytics.com/debug/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`;
const DEBUG = false;

// Cache owner flag in memory (loaded once on startup, MV3 service worker compatible)
let isOwnerCached: boolean | null = null;

// Stateless analytics (#199): GA4 needs a client_id on every request, so each event gets a fresh
// random one that is stored nowhere. There is no session id and no user id for real users. Not
// anonymous and not guaranteed unlinkable: other fields (e.g. hostname lists) can still repeat.
// Same approach as public/ga4.js makeClientId.
function makeClientId(): string {
  return crypto.randomUUID();
}

// Coarse install-age bucket: lower bound of 0 / 1-6 / 7-29 / 30+ days (0 if not recorded). An exact age
// is a fixed install date that would link one install's events across days. Same as public/ga4.js.
async function installAgeBucket(): Promise<number> {
  const result = await chrome.storage.local.get('install_date') as { install_date?: string };
  if (!result.install_date) return 0;
  const days = Math.floor((Date.now() - parseInt(result.install_date)) / (24 * 60 * 60 * 1000));
  if (!(days >= 1)) return 0;
  if (days < 7) return 1;
  if (days < 30) return 7;
  return 30;
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
    const daysSinceInstall = await installAgeBucket();

    // Use cached owner flag (lazy-load if cache not yet initialized)
    if (isOwnerCached === null) {
      const syncData = await chrome.storage.sync.get(['isOwner']) as { isOwner?: boolean };
      isOwnerCached = syncData.isOwner || false;
    }

    const payload: Record<string, unknown> = {
      client_id: makeClientId(),
      events: [{
        name: eventName,
        params: {
          engagement_time_msec: 100,
          extension_version: chrome.runtime.getManifest().version,
          browser_language: navigator.language || 'unknown',
          days_since_install: daysSinceInstall,
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
      (payload.events as Array<{ params: Record<string, unknown> }>)[0].params.traffic_type = 'internal';
    }

    // Dev builds validate only (never recorded); CWS builds record as before.
    const response = await fetch(isDevBuild ? GA4_DEBUG_ENDPOINT : GA4_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (isDevBuild) {
      const result = await response.json().catch(() => null) as { validationMessages?: unknown[] } | null;
      if (result?.validationMessages?.length) console.warn('GA4 payload validation:', result.validationMessages);
    }

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

  // Stateless analytics (#199): drop any identifier or per-install counter stored by earlier versions.
  await removeLegacyAnalyticsKeys();

  if (details.reason === 'install') {
    // Install date stays on the device for onboarding timing; analytics only ever sees a coarse bucket.
    const installDate = Date.now().toString();
    await chrome.storage.local.set({ 'install_date': installDate });
    if (DEBUG) console.log('SpotBoard installed at:', new Date(parseInt(installDate)).toISOString());

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
  
  // Backfill install_date for users who upgraded from pre-v1.2.1
  // (It was only set on fresh install, not on update)
  if (details.reason === 'update') {
    const existing = await chrome.storage.local.get('install_date') as { install_date?: string };
    if (!existing.install_date) {
      await chrome.storage.local.set({ install_date: Date.now().toString() });
      if (DEBUG) console.log('Backfilled install_date for existing user');
    }
    // Mark existing users so dashboard tour doesn't fire after upgrade
    await chrome.storage.local.set({ hasExistingCards: true, dashboardTourShown: true });
  }

  // Set uninstall survey URL (runs on both install and update)
  setUninstallSurveyURL();
});

// ================================
// UNINSTALL SURVEY
// ================================
// The uninstall survey is a plain link (#199): no identifier and no usage values are sent to Tally when
// the page opens. Only what the person types and submits reaches the form.
const UNINSTALL_SURVEY_URL = 'https://tally.so/r/A7vEPN';

function setUninstallSurveyURL() {
  try {
    chrome.runtime.setUninstallURL(UNINSTALL_SURVEY_URL);
  } catch (error) {
    console.error('Failed to set uninstall survey URL:', error);
  }
}

// ================================
// LEGACY ANALYTICS KEYS
// ================================
// Versions before #199 stored a persistent client id, a persistent user id and two rolling 7-day
// counters in chrome.storage.local. They are removed (idempotent) so nothing identifying an install
// stays on the device. install_date is kept: it drives onboarding timing and is only ever sent as a bucket.
async function removeLegacyAnalyticsKeys(): Promise<void> {
  try {
    await chrome.storage.local.remove(['clientId', 'user_id', 'board_opens_events', 'refresh_clicks_events']);
  } catch (error) {
    console.warn('Could not remove legacy analytics keys:', error);
  }
}

// Also set on service worker startup (in case of browser restart)
setUninstallSurveyURL();
removeLegacyAnalyticsKeys();

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

// #156: an auto-started capture opens paused so the user can deal with the site's consent pop-up
// first. Some consent tools reload the page on a choice (CNN, ESPN), which would lose the paused
// state and the pending handshake (consumed on first use) -- so the CHECK_CAPTURE answer is kept
// per tab and re-offered to the same tab + page (origin + path: a consent reload stays on the page,
// browsing on to an article does not) until the user presses Start or Cancel (CAPTURE_PAUSE_END),
// the tab closes, or this window lapses -- long enough to read a consent dialog or work through its
// "Manage options" screens, short enough that an abandoned tab doesn't keep the offer for good.
type CaptureAnswer = true | { recapture: { cardId: string; sessionId: string; label: string } };
type PausedCaptures = Record<string, { answer: CaptureAnswer; page: string; at: number }>;
const PAUSED_CAPTURE_WINDOW_MS = 10 * 60 * 1000;

// Read-modify-write of one shared record: serialise it, or two tabs (or a Start racing another
// tab's CHECK_CAPTURE) can drop or resurrect each other's entry.
let pausedCapturesQueue: Promise<unknown> = Promise.resolve();
function updatePausedCaptures(tabId: number, entry: PausedCaptures[string] | null): Promise<void> {
  const run = pausedCapturesQueue.then(() => writePausedCapture(tabId, entry));
  pausedCapturesQueue = run.catch(() => {});
  return run;
}

async function writePausedCapture(tabId: number, entry: PausedCaptures[string] | null) {
  const { pausedCaptures = {} } = await chrome.storage.session.get('pausedCaptures') as { pausedCaptures?: PausedCaptures };
  if (entry) pausedCaptures[tabId] = entry;
  else if (pausedCaptures[tabId]) delete pausedCaptures[tabId];
  else return;
  await chrome.storage.session.set({ pausedCaptures });
}

const senderPage = (sender: chrome.runtime.MessageSender) => {
  try { const u = new URL(sender.url || sender.tab?.url || ''); return u.origin + u.pathname; } catch { return ''; }
};

// #52: closing the tab abandons its re-capture -- drop any handshake or latest-session bound to it.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  try { await updatePausedCaptures(tabId, null); } catch { /* session storage unavailable */ }
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
    const page = senderPage(sender);
    (async () => {
      try {
        // #156: same tab + page asking again while paused (consent reload) -> same answer.
        if (tabId !== undefined) {
          await pausedCapturesQueue; // see any Start/Cancel that is still being written
          const { pausedCaptures = {} } = await chrome.storage.session.get('pausedCaptures') as { pausedCaptures?: PausedCaptures };
          const paused = pausedCaptures[tabId];
          if (paused) {
            if (paused.page === page && Date.now() - paused.at < PAUSED_CAPTURE_WINDOW_MS) { sendResponse(paused.answer); return; }
            await updatePausedCaptures(tabId, null); // moved on to another page or went stale
          }
        }
        const matched = await matchPendingTab('pendingCaptureTabId', tabId);
        if (!matched) { sendResponse(false); return; }
        let answer: CaptureAnswer = true;
        // #52: a re-capture start also leaves a tab-bound pendingRecapture; consume it (only if
        // fresh) and record it as the latest session for that card so an older tab is superseded.
        const { pendingRecapture } = await chrome.storage.session.get('pendingRecapture') as { pendingRecapture?: { tabId: number; cardId: string; sessionId: string; label: string; startedAt: number } };
        if (pendingRecapture && pendingRecapture.tabId === tabId) {
          await chrome.storage.session.remove('pendingRecapture');
          if (Date.now() - pendingRecapture.startedAt < RECAPTURE_START_WINDOW_MS) {
            const { recaptureLatest = {} } = await chrome.storage.session.get('recaptureLatest') as { recaptureLatest?: RecaptureLatest };
            recaptureLatest[pendingRecapture.cardId] = { sessionId: pendingRecapture.sessionId, tabId };
            await chrome.storage.session.set({ recaptureLatest });
            answer = { recapture: { cardId: pendingRecapture.cardId, sessionId: pendingRecapture.sessionId, label: pendingRecapture.label } };
          }
        }
        await updatePausedCaptures(tabId!, { answer, page, at: Date.now() });
        sendResponse(answer);
      } catch {
        sendResponse(false);
      }
    })();
    return true;
  }

  // #156: the user pressed Start or Cancel on the paused panel -- stop re-offering it to this tab.
  if (request.type === 'CAPTURE_PAUSE_END') {
    const tabId = sender.tab?.id;
    if (tabId !== undefined) updatePausedCaptures(tabId, null).catch(() => {});
    return;
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
