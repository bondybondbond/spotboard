/**
 * Refresh Engine for SpotBoard
 * Handles component refresh logic, tab management, and toast notifications
 *
 * Dependencies:
 * - dom-cleanup.js (applySanitizationPipeline, cleanupDuplicates, tagSentimentData)
 * - fingerprint.js (extractFingerprint)
 */

/**
 * EXPERIMENT FLAG: IntersectionObserver override for background-tab image capture
 *
 * Problem: Vue/React SPAs (e.g. HotUKDeals) use IntersectionObserver to gate image src
 * assignment. Background tabs never trigger real viewport intersection, so IO callbacks
 * don't fire → deal images missing even after visibility/focus spoofing.
 *
 * Proposed fix: Override window.IntersectionObserver at document_start to immediately
 * call callbacks with isIntersecting: true for every observed element, forcing image loads.
 *
 * Current status: PARKED — do not enable by default.
 * - The current fix (hasFocus spoof + expectedLargeImgCount fallback) correctly falls back
 *   to active tab when background misses images. That is safe and working.
 * - IO override is more invasive: triggers ALL observed elements as visible (analytics
 *   observers, scroll-triggered animations, etc.), and Chrome background-tab rendering
 *   pipeline may still suppress callbacks even with override (unverified).
 * - Enable only for targeted experimentation if active-tab flash is unacceptable.
 *
 * To experiment: set DEBUG_IO_SPOOF = true and observe [SpotBoard-BG] logs.
 * Success criteria: background tab logs ≥20 large imgs, no active-tab fallback fires,
 * no regressions on BBC / Guardian / NPR / NBC.
 *
 * See: LEARNINGS.md §66, Notion HotUKDeals investigation page.
 */
const DEBUG_IO_SPOOF = false;

/**
 * Error classification helper - converts raw error strings into friendly user-facing labels
 * Returns enum error code ('skeleton', 'network', 'layout_changed', 'unknown')
 */
function classifyError(errorString) {
  if (!errorString) return 'unknown';

  const errorLower = errorString.toLowerCase();

  if (errorLower.includes('skeleton') || errorLower.includes('empty container')) {
    return 'skeleton';  // Site didn't load completely
  }
  if (errorLower.includes('fetch') || errorLower.includes('timeout') || errorLower.includes('network') || errorLower.includes('http')) {
    return 'network';   // Network error
  }
  if (errorLower.includes('fingerprint') || errorLower.includes('selector') || errorLower.includes('different element') || errorLower.includes('not found')) {
    return 'layout_changed';  // Site layout changed
  }
  return 'unknown';     // Fallback
}

/**
 * Get user-friendly error label from error code enum
 */
function getErrorLabel(errorCode) {
  const labels = {
    'skeleton': "Site didn't load completely",
    'network': "Network error",
    'layout_changed': "Site layout changed",
    'unknown': "Refresh failed"
  };
  return labels[errorCode] || "Refresh failed";
}

/**
 * Logs generic DOM tree topology for fingerprint mismatch diagnostics.
 * Outputs tag names + child counts only — no content. Skips invisible tags
 * (<script>, <style>, <noscript>) when counting children so analytics/tracking
 * injections don't break single-child wrapper detection.
 *
 * Runs in dashboard page context (full DOM API available).
 * Uses DOMParser to avoid triggering subresource fetches during parse.
 */
function logStructureFingerprint(label, html) {
  try {
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    const root = doc.body.firstElementChild || doc.body;
    const INVISIBLE = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
    const MAX_DEPTH = 5;
    const MAX_SIBLINGS = 8;

    function visibleChildren(el) {
      return Array.from(el.children).filter(c => !INVISIBLE.has(c.tagName));
    }

    function describe(el, depth) {
      const kids = visibleChildren(el);
      if (depth >= MAX_DEPTH || kids.length === 0) {
        return el.tagName.toLowerCase();
      }
      // Skip pure single-child wrappers (React/Vue layout shells) — don't count as a depth level
      if (kids.length === 1) {
        return describe(kids[0], depth);
      }
      const shown = kids.slice(0, MAX_SIBLINGS).map(c => describe(c, depth + 1));
      const suffix = kids.length > MAX_SIBLINGS ? `, +${kids.length - MAX_SIBLINGS}more` : '';
      return `${el.tagName.toLowerCase()}(${kids.length})[${shown.join(', ')}${suffix}]`;
    }

    const kids = visibleChildren(root);
    console.log(`[SB-STRUCTURE] ${label}:`, describe(root, 0));
    console.log(`[SB-STRUCTURE] ${label} top-children (${kids.length}):`, kids.slice(0, 8).map(c => c.tagName.toLowerCase()).join(', '));
  } catch (e) {
    console.debug('[SB-STRUCTURE] Error logging structure for', label, ':', e.message);
  }
}

/**
 * Detect the dominant repeating semantic tag in a feed-style capture.
 * Checks article, li, tr only — avoids matching generic div/span noise.
 * Returns { tag, count } if a semantic feed tag appears >= 3 times, else null.
 */
function getDominantTag(html) {
  try {
    const FEED_TAGS = ['article', 'li', 'tr'];
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    let best = null, bestCount = 0;
    for (const tag of FEED_TAGS) {
      const count = doc.querySelectorAll(tag).length;
      if (count > bestCount) { bestCount = count; best = tag; }
    }
    if (bestCount >= 3) return { tag: best, count: bestCount };
    // Also handle anchor-heavy feeds (e.g. grid-layout news feeds using <a> as feed items)
    const aCount = doc.querySelectorAll('a').length;
    if (aCount >= 5) return { tag: 'a', count: aCount };
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * Toast notification manager for refresh feedback
 * Single toast with progress summary + current action
 */
class RefreshToastManager {
  constructor() {
    this.toast = null;
    this.totalComponents = 0;
    this.completedCount = 0;
    this.successCount = 0;
    this.currentComponent = '';
    this.failedComponents = []; // Track failed components for batch toast
  }

  startRefresh(total, customMessage = null) {
    this.totalComponents = total;
    this.completedCount = 0;
    this.successCount = 0;
    this.failedComponents = []; // Reset failures for new refresh
    this.customMessage = customMessage; // Store custom message for progress display
    this.createToast();
  }
  
  updateProgress(componentName, needsActiveTab = false) {
    this.currentComponent = componentName;
    
    if (!this.toast) this.createToast();
    
    // Update progress section (use custom message if available)
    const progressText = this.completedCount > 0 
      ? `✓ ${this.successCount}/${this.totalComponents} refreshed`
      : (this.customMessage || `Refreshing ${this.totalComponents} components...`);
    
    this.toast.querySelector('.toast-progress').textContent = progressText;
    
    // Update current action section
    let currentText = `Now loading: ${componentName}`;
    let subtitleText = 'Refreshing in background...';
    
    if (needsActiveTab) {
      currentText = `📍 Now loading: ${componentName}`;
      subtitleText = 'Opening site tab briefly — you\'ll return here automatically!';
    }
    
    this.toast.querySelector('.toast-current').textContent = currentText;
    this.toast.querySelector('.toast-subtitle').textContent = subtitleText;
    
    // Update progress bar
    const progressPercent = (this.completedCount / this.totalComponents) * 100;
    this.toast.querySelector('.toast-progress-bar').style.width = `${progressPercent}%`;
  }
  
  completeComponent(success = true) {
    this.completedCount++;
    if (success) this.successCount++;

    // Update progress bar
    if (this.toast) {
      const progressPercent = (this.completedCount / this.totalComponents) * 100;
      this.toast.querySelector('.toast-progress-bar').style.width = `${progressPercent}%`;
      this.toast.querySelector('.toast-progress').textContent =
        `✓ ${this.successCount}/${this.totalComponents} refreshed`;
    }
  }

  /**
   * Record a failed component for the final failure toast
   */
  recordFailure(componentName, errorCode) {
    this.failedComponents.push({
      name: componentName,
      errorCode: errorCode || 'unknown'
    });
  }

  finishAll(pausedCount = 0) {
    this.hideToast();
    // Show failure toast if there are failures, otherwise success toast
    // Add small delay to ensure progress toast is hidden first
    setTimeout(() => {
      if (this.failedComponents.length > 0) {
        this.showFailureToast(pausedCount);
      } else {
        this.showSuccessToast(pausedCount);
      }
    }, 100);
  }
  
  createToast() {
    if (this.toast) this.toast.remove();
    
    this.toast = document.createElement('div');
    this.toast.className = 'refresh-toast refresh-toast--cooldark';
    
    this.toast.innerHTML = `
      <div class="refresh-toast__content">
        <div class="toast-icon-container">
          <svg class="refresh-toast__icon" viewBox="0 0 24 24" width="24" height="24">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
            <path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" fill="none"/>
          </svg>
        </div>
        <div class="refresh-toast__text">
          <div class="toast-progress">Starting refresh...</div>
          <div class="toast-current">Preparing...</div>
          <div class="toast-subtitle">Please wait...</div>
          <div class="toast-progress-track">
            <div class="toast-progress-bar"></div>
          </div>
        </div>
        <button class="refresh-toast__close" aria-label="Close">×</button>
      </div>
    `;
    
    document.body.appendChild(this.toast);
    this.toast.querySelector('.refresh-toast__close').addEventListener('click', () => {
      this.hideToast();
    });
  }
  
  hideToast() {
    if (this.toast) {
      this.toast.classList.add('refresh-toast--hiding');
      setTimeout(() => {
        if (this.toast) {
          this.toast.remove();
          this.toast = null;
        }
      }, 400);
    }
  }
  
  showSuccessToast(pausedCount = 0) {
    const allSuccess = this.successCount === this.totalComponents;
    const message = allSuccess
      ? `All ${this.totalComponents} components refreshed! 👍🏼`
      : `${this.successCount}/${this.totalComponents} refreshed successfully`;

    const successToast = document.createElement('div');
    successToast.className = 'refresh-toast refresh-toast--success';

    successToast.innerHTML = `
      <div class="refresh-toast__content">
        <svg class="refresh-toast__icon" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <polygon points="5 3 19 12 5 21"/>
        </svg>
        <div class="refresh-toast__text">
          <div class="refresh-toast__title">You're back! ${message}</div>
          ${pausedCount > 0 ? `<div class="refresh-toast__subtitle" style="margin-top: 4px;">(${pausedCount} paused)</div>` : ''}
        </div>
      </div>
    `;

    document.body.appendChild(successToast);

    setTimeout(() => {
      successToast.classList.add('refresh-toast--hiding');
      setTimeout(() => successToast.remove(), 400);
    }, 3000);
  }

  /**
   * Show persistent failure toast with list of failed components and retry action
   */
  showFailureToast(pausedCount = 0) {
    const failureToast = document.createElement('div');
    failureToast.className = 'refresh-toast refresh-toast--warning';
    failureToast.setAttribute('data-persistent', 'true');

    const failureList = this.failedComponents.map(f =>
      `<li><strong>${f.name}</strong> — ${getErrorLabel(f.errorCode)}</li>`
    ).join('');

    failureToast.innerHTML = `
      <div class="refresh-toast__content">
        <div class="refresh-toast__text">
          <div class="refresh-toast__title">Some cards failed to refresh</div>
          <div class="toast-failure-list">
            <strong>Failed (${this.failedComponents.length}):</strong>
            <ul style="margin: 4px 0 8px 0; padding-left: 20px; list-style: disc;">
              ${failureList}
            </ul>
          </div>
          <button class="toast-retry-btn" data-action="retry-failed">
            Retry failed cards
          </button>
        </div>
        <button class="refresh-toast__close" aria-label="Close">✕</button>
      </div>
    `;

    document.body.appendChild(failureToast);

    // Close button handler
    failureToast.querySelector('.refresh-toast__close').addEventListener('click', () => {
      failureToast.classList.add('refresh-toast--hiding');
      setTimeout(() => failureToast.remove(), 400);
    });

    // Retry button handler
    failureToast.querySelector('.toast-retry-btn').addEventListener('click', async () => {
      // Hide the failure toast
      failureToast.classList.add('refresh-toast--hiding');
      setTimeout(() => failureToast.remove(), 400);

      // Trigger retry of failed components
      // This calls the global retryFailedComponents function defined below
      if (typeof retryFailedComponents === 'function') {
        retryFailedComponents(this.failedComponents);
      }
    });
  }
}

// Global toast manager instance
const toastManager = new RefreshToastManager();

/**
 * Retry failed components from the batch failure toast
 * This is called by the retry button in the failure toast
 * Simply triggers the main Refresh All button which will retry all components
 */
async function retryFailedComponents(failedComponentsList) {
  console.log('Retrying failed components:', failedComponentsList.map(f => f.name));

  // Trigger the main refresh all button
  const refreshAllBtn = document.getElementById('refresh-all-btn');
  if (refreshAllBtn && !refreshAllBtn.disabled) {
    refreshAllBtn.click();
  } else {
    console.warn('Refresh All button not available or disabled');
  }
}

/**
 * GA4 Tracking: First refresh within 24h (one-time activation event)
 * Also serves as placeholder for Batch 4 refresh tracking
 */
// trackRefreshClick moved to dashboard.js to avoid duplicate function override
// GA4 first_refresh_24h tracking now handled in dashboard.js

/**
 * Check if URL will likely need active tab for refresh
 * Used to show user warning before refresh starts
 * 
 * @param {string} url - The URL to check
 * @returns {boolean} - true if URL likely needs active tab
 * 
 * Note: This is for UI warning only, actual refresh logic uses requiresVisibleTab()
 */
function willNeedActiveTab(url) {
  // Removed hardcoded domain list - let intelligent fallback handle detection
  // Previously: hotukdeals.com, premierleague.com
  // Now relies on skeleton detection and automatic tab fallback
  return false;
}

/**
 * Check if site MUST use active visible tab (can't work in background at all)
 * These sites use IntersectionObserver or Page Visibility API that cannot be spoofed
 */
function requiresVisibleTab(url) {
  // Intentionally empty — intelligent fallback handles detection automatically:
  // 1. Background tab attempt
  // 2. Offscreen popup (unfocused, IO spoof)
  // 3. Active popup (focused, small screen-edge window) — only if offscreen gets 0 large images
  // No hardcoded domain list: gate in tabBasedRefresh detects the need organically.
  return false;
}

/**
 * Build a successful tab-refresh result object. Includes requiresActiveFocus:true if the
 * refresh escalated to the focused active popup (site requires compositor focus to render).
 * @param {boolean} activeFocusNeeded - per-call value returned from tabBasedRefresh (no global state)
 */
function _buildTabSuccessResult(sanitizedHtml, activeFocusNeeded = false) {
  const r = {
    success: true,
    html_cache: sanitizedHtml,
    last_refresh: new Date().toISOString(),
    status: 'active'
  };
  if (activeFocusNeeded) r.requiresActiveFocus = true;
  return r;
}

/**
 * Tab-based refresh for JS-heavy sites
 * Opens a tab (background or active), waits for JS to load, extracts content
 *
 * @param {string} url - The URL to fetch
 * @param {string} selector - CSS selector for component to extract
 * @param {string|null} fingerprint - Optional heading text for multi-match disambiguation
 * @param {boolean} skipToActive - If true, skip background+offscreen and go straight to active popup
 *                                 Set for components with requiresActiveFocus=true in storage (self-learned).
 * @returns {Promise<string|null>} - Extracted HTML or null if failed
 *
 * Process:
 * 1. Check if site requires active tab (requiresVisibleTab or skipToActive)
 * 2. Try background tab with visibility spoof (seamless)
 * 3. Try offscreen unfocused popup (IO fires, no taskbar flash)
 * 4. Fallback to focused active popup if offscreen gets 0 large images
 *
 * Handles:
 * - Consent dialogs (auto-click reject/accept)
 * - Lazy-loaded content (waits 5-8s total)
 * - Multiple selector matches (uses fingerprint)
 * - CSS-based duplicates (marks display:none before cloning)
 *
 * Used in: refreshComponent() when direct fetch fails or for known problematic sites
 */
async function tabBasedRefresh(url, selector, fingerprint = null, expectedImgCount = 0, expectedLargeImgCount = 0, skipToActive = false) {
  // Per-call local flag — parallel-refresh safe (no shared module-level state)
  let activeFocusNeeded = false;
  try {
    // Check if this site MUST be visible (Page Visibility API blocks background)
    // skipToActive is set for components with stored requiresActiveFocus=true (self-learned flag)
    if (requiresVisibleTab(url) || skipToActive) {
      // Skip background + offscreen attempts - go straight to active tab
      // activeFocusNeeded stays false: flag is already persisted in storage for this card
      const result = await tryActiveTab(url, selector, fingerprint);
      return { html: result || null, activeFocusNeeded: false };
    }

    if (DEBUG) console.log('[SB-REFRESH]', new URL(url).hostname, 'path=background', 'expected=', expectedImgCount + '/' + expectedLargeImgCount);

    // ATTEMPT 1: Try background tab with visibility spoof
    const result = await tryBackgroundWithSpoof(url, selector, fingerprint);
    if (result) {
      // Check if images are degraded (site may detect background tab despite spoof)
      const resultImgCount = (result.match(/<img/gi) || []).length;
      const resultLargeImgCount = (result.match(/data-scale-context="(?:thumbnail|medium|preview)"/gi) || []).length;
      // Fallback if: all images gone OR meaningful (thumbnail+) images gone while expected
      // Covers Vue/React sites (HotUKDeals) where avatars survive but deal images are IO-gated
      if ((expectedImgCount >= 3 && resultImgCount === 0) ||
          (expectedLargeImgCount >= 1 && resultLargeImgCount === 0)) {
        if (DEBUG) console.log('[SB-REFRESH]', new URL(url).hostname, 'images degraded expected=', expectedImgCount + '/' + expectedLargeImgCount, 'got=', resultImgCount + '/' + resultLargeImgCount, '→ trying offscreen');
        // Fall through to offscreen window
      } else {
        return { html: result, activeFocusNeeded: false };
      }
    }

    // ATTEMPT 2: Unfocused popup at screen edge — IO spoof fires immediately.
    // Works for sites where IO-gated images load without a compositor focus frame (e.g. Zoopla).
    // Does NOT work for sites where Vue child components require a focused compositor frame
    // to mount (e.g. HotUKDeals box--contents). Gate falls through in that case.
    const offscreenHtml = await tryOffscreenWindow(url, selector, fingerprint);
    if (offscreenHtml) {
      const offImgCount = (offscreenHtml.match(/<img/gi) || []).length;
      const offLargeImgCount = (offscreenHtml.match(/data-scale-context="(?:thumbnail|medium|preview)"/gi) || []).length;
      // Gate 1: zero images → fall through
      if (expectedImgCount >= 3 && offImgCount === 0) {
        if (DEBUG) console.log('🪟 [Offscreen] Zero images → trying active popup');
      // Gate 2: zero large images → Vue child components didn't mount (unfocused compositor frame).
      // Use strict === 0 to avoid false positives on sites with variable content counts (e.g. Zoopla).
      // Sites like Zoopla get fewer large images due to content rotation, not Vue mounting failure.
      // HotUKDeals gets 0 large images in offscreen (box--contents never mounts without focus).
      } else if (expectedLargeImgCount >= 5 && offLargeImgCount === 0) {
        if (DEBUG) console.log('🪟 [Offscreen] Large imgs absent:', offLargeImgCount, '/', expectedLargeImgCount, '→ trying active popup');
      } else {
        if (DEBUG) console.log('🪟 [Offscreen] Accepted:', offImgCount, 'imgs', offLargeImgCount, 'large (classifyFallback will resize)');
        return { html: offscreenHtml, activeFocusNeeded: false };
      }
    }

    // ATTEMPT 3: Focused active popup (last resort — site requires compositor focus frame to render)
    // Set activeFocusNeeded BEFORE calling so it is captured in the return value on success.
    activeFocusNeeded = true;
    const fallbackResult = await tryActiveTab(url, selector, fingerprint);
    if (fallbackResult) return { html: fallbackResult, activeFocusNeeded: true };

    return { html: null, activeFocusNeeded: false };
  } catch (error) {
    console.error('Tab refresh failed:', error);
    return { html: null, activeFocusNeeded: false };
  }
}

/**
 * Handle consent/cookie dialogs automatically
 * Prioritizes reject/decline buttons (privacy-friendly), falls back to accept
 * 
 * @param {number} tabId - Chrome tab ID to check for consent dialogs
 * @returns {Promise<Object>} - Result object: {found: boolean, action: string, text?: string}
 * 
 * Actions: 'rejected', 'accepted', 'no_button', 'none', 'error'
 * 
 * Detection:
 * - Looks for common consent container selectors (#consent, [role="dialog"])
 * - Searches button text for patterns (reject all, accept all, etc.)
 * 
 * Priority order:
 * 1. Reject/decline buttons (privacy-first approach)
 * 2. Accept/agree buttons (fallback)
 * 
 * Used in: Background and active tab refresh after initial page load
 */
async function handleConsentDialog(tabId) {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Common consent button text patterns (case-insensitive)
        const rejectPatterns = [
          'reject all',
          'reject',
          'refuse all',
          'continue without accepting',
          'continue without',
          'no thanks',
          'decline',
          'dismiss'
        ];
        
        const acceptPatterns = [
          'accept all',
          'accept',
          'agree',
          'continue',
          'i agree',
          'got it',
          'ok',
          'close'
        ];
        
        // Common consent container selectors
        const containerSelectors = [
          '#consent-page',
          '[id*="cookie"]',
          '[id*="consent"]',
          '[id*="gdpr"]',
          '[class*="cookie"]',
          '[class*="consent"]',
          '[class*="gdpr"]',
          '[class*="privacy"]',
          '[role="dialog"]',
          '[aria-modal="true"]'
        ];
        
        // Look for consent containers
        let consentContainer = null;
        for (const selector of containerSelectors) {
          const element = document.querySelector(selector);
          if (element && element.offsetParent !== null) { // visible check
            consentContainer = element;
            break;
          }
        }
        
        if (!consentContainer) {
          return { found: false, action: 'none' };
        }
        
        // Try to find reject button first (privacy-friendly)
        const allButtons = Array.from(consentContainer.querySelectorAll('button, a'));
        
        // First pass: Look for reject/decline buttons
        for (const btn of allButtons) {
          const text = (btn.textContent || '').toLowerCase().trim();
          if (rejectPatterns.some(pattern => text.includes(pattern))) {
            btn.click();
            return { found: true, action: 'rejected', text: btn.textContent };
          }
        }
        
        // Second pass: Fall back to accept/continue buttons
        for (const btn of allButtons) {
          const text = (btn.textContent || '').toLowerCase().trim();
          if (acceptPatterns.some(pattern => text === pattern || text.includes(pattern))) {
            btn.click();
            return { found: true, action: 'accepted', text: btn.textContent };
          }
        }
        
        return { found: true, action: 'no_button' };
      }
    });
    
    return result[0]?.result || { found: false, action: 'none' };
    
  } catch (error) {
    console.error('Consent handler error:', error);
    return { found: false, action: 'error' };
  }
}

/**
 * Try background tab refresh with visibility spoof
 * Seamless refresh (no tab flash) but may fail for sites detecting background tabs
 * 
 * @param {string} url - URL to load
 * @param {string} selector - CSS selector to extract
 * @returns {Promise<string|null>} - Extracted HTML or null if failed
 * 
 * Technique:
 * - Opens background tab (active: false)
 * - Injects visibility spoof at document_start (BEFORE site scripts run)
 * - Overrides document.hidden and document.visibilityState
 * - Waits 2s initial + 3s post-consent + 3s for JS = 8s total
 * 
 * Success rate: ~85-90% of sites (fails for Page Visibility API detection)
 * 
 * Used in: tabBasedRefresh() as first attempt before active tab fallback
 */
async function tryBackgroundWithSpoof(url, selector, fingerprint = null) {
  const _bgStart = Date.now();
  if (DEBUG) console.log('[SB-REFRESH] tryBackgroundWithSpoof ENTER', url);
  const tab = await chrome.tabs.create({ url, active: false });
  
  try {
    // CRITICAL: Inject spoof at document_start - BEFORE page scripts run
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      injectImmediately: true,
      func: () => {
        // Override BEFORE anything else runs
        Object.defineProperty(document, 'hidden', {
          get: () => false,
          configurable: true
        });
        Object.defineProperty(document, 'visibilityState', {
          get: () => 'visible',
          configurable: true
        });
        // Fire event so listeners think page became visible
        document.dispatchEvent(new Event('visibilitychange'));
        // Spoof hasFocus — Vue/React components check this for IO-triggered rendering
        // NOTE: fires before Vue bootstraps — a second dispatch runs post-consent (Part B below)
        Object.defineProperty(document, 'hasFocus', {
          value: () => true,
          configurable: true
        });
        window.dispatchEvent(new Event('focus'));
        window.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('resize'));
      }
    });

    // EXPERIMENT: IO override — only active when DEBUG_IO_SPOOF = true at top of file
    // Forces IntersectionObserver callbacks to fire immediately with isIntersecting: true,
    // enabling Vue/React IO-gated image loads in background tabs without active-tab flash.
    // See flag declaration at top of file for full rationale and success criteria.
    if (DEBUG_IO_SPOOF) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        injectImmediately: true,
        func: () => {
          const _IO = window.IntersectionObserver;
          window.IntersectionObserver = function(callback, options) {
            const io = new _IO(callback, options);
            const _observe = io.observe.bind(io);
            io.observe = function(target) {
              setTimeout(() => callback([{
                target,
                intersectionRatio: 1,
                isIntersecting: true,
                boundingClientRect: target.getBoundingClientRect(),
                intersectionRect: target.getBoundingClientRect(),
                rootBounds: null,
                time: performance.now()
              }], io), 0);
              return _observe(target);
            };
            return io;
          };
          console.log('[SpotBoard-IO] IntersectionObserver override active');
        }
      });
    }

    // Wait 2s for initial page load
    await new Promise(r => setTimeout(r, 2000));

    // Handle consent dialog if present
    const consentResult = await handleConsentDialog(tab.id);
    if (consentResult.found) {
      await new Promise(r => setTimeout(r, 3000));
    }

    // Re-fire focus/scroll/resize AFTER Vue/React has bootstrapped (registers IO callbacks post-DOMContentLoaded)
    // The document_start dispatch fires into a void — this hits mounted components
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => {
        window.dispatchEvent(new Event('focus'));
        window.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('resize'));
      }
    });

    // Wait additional time for JS to fully load (complex sites)
    await new Promise(r => setTimeout(r, 3000));
    
    // Try to extract - WITH SANITIZATION AND IMAGE CLASSIFICATION IN THE TAB
    // Inject DomSnapshot into tab context (needed — executeScript funcs run in tab's isolated world)
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['utils/dom-snapshot.js'] });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [selector, fingerprint],
      func: (sel, fp) => {
        // Find element - use fingerprint for multi-match disambiguation if available
        let element = null;
        if (fp) {
          const allMatches = document.querySelectorAll(sel);
          if (allMatches.length > 1) {
            for (const el of allMatches) {
              if ((el.textContent || '').toLowerCase().includes(fp.toLowerCase())) {
                element = el;
                break;
              }
            }
          }
          if (!element) element = document.querySelector(sel);
        } else {
          element = document.querySelector(sel);
        }
        if (!element) return null;

        // Mark hidden elements BEFORE cloning (while CSS is loaded)
        const allElements = [element, ...Array.from(element.querySelectorAll('*'))];
        const marked = [];
        
        allElements.forEach(el => {
          if (el instanceof HTMLElement && el !== element) {
            const computed = window.getComputedStyle(el);
            if (computed.display === 'none') {
              el.setAttribute('data-spotboard-hidden', 'true');
              marked.push(el);
            }
          }
        });
        
        // Convert lazy-loaded images BEFORE cloning (shared via DomSnapshot)
        window.DomSnapshot.promoteLazyImages(element);

        // Promote bg-image to <img> (shared via DomSnapshot)
        window.DomSnapshot.promoteBackgroundImages(element, 'tab-refresh');

        // 🎯 MARK CSS-HIDDEN-BUT-LOADED IMAGES (Rightmove fallback pattern)
        // Attribute-only marking — no live-page style mutation, no flicker.
        element.querySelectorAll('img').forEach(img => {
          if (img.naturalWidth > 0 && img.offsetWidth === 0 && img.offsetHeight === 0) {
            img.setAttribute('data-spotboard-force-visible', 'true');
          }
          // Mark empty-src SSR placeholders as hidden (prevents page-URL broken images)
          // Skip <picture> children -- their <img> has no src by design; URL is in <source srcset>
          if ((img.getAttribute('src') ?? '').trim() === '' && !img.closest('picture')) {
            img.setAttribute('data-spotboard-hidden', 'true');
            marked.push(img);
          }
        });

        // 🎯 5-TIER IMAGE CLASSIFICATION USING LIVE CSS (unified via DomSnapshot)
        window.DomSnapshot.classifyImages(element);

        // 💚❤️ SENTIMENT TAGGING (Phase 2: Semantic Coloring)
        // Tag finance deltas (+/-) for color coding on dashboard
        const SKIP_SELECTOR = 'SCRIPT, STYLE, NOSCRIPT, TEMPLATE, SVG';
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            if (node.parentElement?.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
            if (node.parentElement?.closest('[data-sb-sentiment]')) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
        });
        const textNodesToTag = [];
        let node;

        // (?<!\w) blocks "3-0", "10-year" etc; (?<!\±) excludes ± prefix
        const tokenPattern = /(?<!\w)(?<!\±)([+-])(\d[\d.,]*)(%?)/g;

        while ((node = walker.nextNode())) {
          const text = node.textContent?.trim() || '';
          if (text.length === 0) continue;

          tokenPattern.lastIndex = 0;
          const m = tokenPattern.exec(text);
          if (m) {
            const sentiment = m[1] === '+' ? 'positive' : 'negative';
            textNodesToTag.push({ node: node, sentiment: sentiment });
          }
        }

        let tagged = 0;
        textNodesToTag.forEach(({ node, sentiment }) => {
          let parent = node.parentElement;
          while (parent && parent !== element) {
            if (parent.tagName === 'A' || parent.tagName === 'BUTTON' || parent.tagName === 'SPAN') {
              parent.setAttribute('data-sb-sentiment', sentiment);
              tagged++;
              break;
            }
            parent = parent.parentElement;
          }
          if (node.parentElement && !node.parentElement.hasAttribute('data-sb-sentiment')) {
            node.parentElement.setAttribute('data-sb-sentiment', sentiment);
            tagged++;
          }
        });

        if (tagged > 0) {
          console.log(`✅ Tagged ${tagged} element(s) with sentiment data`);
        }

        // Clone with shadow DOM flattening (shared via DomSnapshot — src/utils/dom-snapshot.ts)
        const clone = window.DomSnapshot.cloneWithShadow(element);

        // Clean up original DOM
        marked.forEach(el => el.removeAttribute('data-spotboard-hidden'));

        // Remove marked elements from clone
        const hiddenInClone = clone.querySelectorAll('[data-spotboard-hidden="true"]');
        hiddenInClone.forEach(el => el.remove());

        // PASS 2: Un-hide CSS-constrained images that are actually loaded (safe on clone)
        clone.querySelectorAll('[data-spotboard-force-visible]').forEach(el => {
          el.style.cssText += ';display:block!important;width:auto!important;height:auto!important;max-width:100%!important';
          el.removeAttribute('data-spotboard-force-visible');
        });
        // Clean up force-visible markers from original DOM
        element.querySelectorAll('[data-spotboard-force-visible]')
               .forEach(el => el.removeAttribute('data-spotboard-force-visible'));

        // 🎯 DATA-URI BLUR PLACEHOLDER: Next.js / LQIP pattern
        // When src is a blur placeholder (data: URI), promote the LAST real srcset candidate.
        // Next.js puts smallest variants first; last non-data entry is the largest/best candidate.
        let blurPromotions = 0;
        clone.querySelectorAll('img').forEach(img => {
          const src = img.getAttribute('src') ?? '';
          if (!src.startsWith('data:')) return;
          const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
          const candidates = srcset.split(',')
            .map(s => s.trim().split(/\s+/)[0])
            .filter(u => u && !u.startsWith('data:') && u.length > 10);
          const bestUrl = candidates[candidates.length - 1];
          if (bestUrl) { img.setAttribute('src', bestUrl); blurPromotions++; }
        });

        // 🎯 NEXT.JS IMAGE OPTIMIZER: Extract original CDN URL from /_next/image?url=
        // Uses URL.searchParams — more robust than regex if query param order varies.
        let proxyUnwraps = 0;
        clone.querySelectorAll('img[src*="/_next/image"]').forEach(img => {
          try {
            const parsed = new URL(img.getAttribute('src') ?? '', location.href);
            const original = parsed.searchParams.get('url');
            if (original && original.startsWith('http')) { img.setAttribute('src', original); proxyUnwraps++; }
          } catch { /* malformed URL */ }
        });

        if (blurPromotions > 0 || proxyUnwraps > 0) {
          console.log(`🖼️ [SpotBoard] Next.js image fix: ${blurPromotions} blur promotions, ${proxyUnwraps} proxy unwraps`);
        }

        // 🎯 NEXT.JS FILL LAYOUT: Strip position:absolute fill styles that collapse to 0
        // Detected by: position:absolute + width:0 in inline style (Next.js Image fill/layout="fill")
        // These need a containing block with explicit height — which is lost in the dashboard.
        // Fix: strip img style + parent SPAN style + ancestor padding-top (aspect-ratio whitespace).
        let fillFixes = 0;
        clone.querySelectorAll('img').forEach(img => {
          const style = img.getAttribute('style') ?? '';
          if (/position\s*:\s*absolute/.test(style) && /width\s*:\s*0/.test(style)) {
            img.removeAttribute('style');
            const parent = img.parentElement;
            if (parent?.tagName === 'SPAN' && /position\s*:\s*absolute/.test(parent.getAttribute('style') ?? '')) {
              parent.removeAttribute('style');
            }
            // Strip padding-top from the aspect-ratio wrapper (creates blank whitespace when img is un-filled)
            let ancestor = img.parentElement;
            for (let i = 0; i < 6 && ancestor; i++) {
              const aStyle = ancestor.getAttribute('style') ?? '';
              if (/padding-top\s*:\s*(calc\(|[\d.]+%)/.test(aStyle)) {
                const cleaned = aStyle.replace(/padding-top\s*:[^;]+;?\s*/g, '').trim().replace(/;+$/, '');
                if (cleaned) ancestor.setAttribute('style', cleaned);
                else ancestor.removeAttribute('style');
                break;
              }
              ancestor = ancestor.parentElement;
            }
            fillFixes++;
          }
        });
        if (fillFixes > 0) {
          console.log(`🖼️ [SpotBoard] Next.js fill layout fix: ${fillFixes} images un-collapsed`);
        }

        return clone.outerHTML;
      }
    });

    const html = results[0]?.result;

    await chrome.tabs.remove(tab.id);
    if (DEBUG) console.log('[SB-REFRESH] tryBackgroundWithSpoof EXIT elapsed=', Date.now() - _bgStart + 'ms');
    return html;

  } catch (error) {
    console.error(`❌ [Background] Error:`, error);
    try { await chrome.tabs.remove(tab.id); } catch (e) {}
    return null;
  }
}

/**
 * Off-screen popup window refresh — silent to user, IntersectionObserver fires (real viewport)
 * Intermediate fallback between background tab and active tab.
 *
 * Creates a 1280×900 popup window positioned at left:-9999 (off any monitor).
 * The window has a real compositor frame, so IO callbacks fire (unlike minimised windows).
 * focused:false prevents any focus steal or taskbar flash.
 *
 * @param {string} url - URL to load
 * @param {string} selector - CSS selector to extract
 * @param {string|null} fingerprint - Optional heading text for multi-match selection
 * @returns {Promise<string|null>} - Extracted HTML or null if failed
 */
async function tryOffscreenWindow(url, selector, fingerprint = null) {
  let win = null;
  const _owStart = Date.now();
  if (DEBUG) console.log('[SB-OFFSCREEN] ENTER', url);
  try {
    // state:'normal', focused:false — real compositor frame: Vue virtual scroller gets a real
    // viewport height and renders list items (and their images). No focus steal.
    // Positioned so ~55% of the window is on the right screen edge and ~45% extends off-screen.
    // This satisfies Chrome's "≥50% within visible screen space" constraint while keeping
    // the window largely out of view. Uses screen.avail* (dashboard page context) to account
    // for Windows taskbar offset. IO spoof still active for any IO-gated items not yet scrolled into view.
    const _screenRight = screen.availLeft + screen.availWidth;
    const _winW = 300;
    const _winH = Math.min(900, screen.availHeight - 20);
    const _winLeft = Math.round(_screenRight - _winW * 0.55); // 55% on-screen
    const _winTop = screen.availTop + 20;
    win = await chrome.windows.create({
      url,
      type: 'popup',
      state: 'normal',
      focused: false,
      left: _winLeft,
      top: _winTop,
      width: _winW,
      height: _winH
    });
    const tabId = win.tabs[0].id; // Assign before any await

    // PART A: Inject visibility spoof at document_start — same as tryBackgroundWithSpoof
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      injectImmediately: true,
      func: () => {
        Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
        Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'hasFocus', { value: () => true, configurable: true });
        window.dispatchEvent(new Event('focus'));
        window.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('resize'));
      }
    });

    // IO SPOOF: always-on for minimized window (no real viewport = IO won't fire without this)
    // Replaces IntersectionObserver with a mock that immediately fires isIntersecting:true,
    // triggering Vue/React IO-gated image loads (HotUKDeals, Zoopla, etc.)
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      injectImmediately: true,
      func: () => {
        const _IO = window.IntersectionObserver;
        window.IntersectionObserver = function(callback, options) {
          const io = new _IO(callback, options);
          const _observe = io.observe.bind(io);
          io.observe = function(target) {
            setTimeout(() => callback([{
              target,
              intersectionRatio: 1,
              isIntersecting: true,
              boundingClientRect: target.getBoundingClientRect(),
              intersectionRect: target.getBoundingClientRect(),
              rootBounds: null,
              time: performance.now()
            }], io), 0);
            return _observe(target);
          };
          return io;
        };
        console.log('[SpotBoard-IO] IntersectionObserver override active (offscreen window)');
      }
    });

    // Wait 2s for initial page load
    await new Promise(r => setTimeout(r, 2000));

    // Handle consent dialog if present
    const consentResult = await handleConsentDialog(tabId);
    if (consentResult.found) {
      await new Promise(r => setTimeout(r, 2000));
    }

    // PART B: Re-fire focus events AFTER Vue/React has bootstrapped (registers IO callbacks post-DOMContentLoaded)
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        window.dispatchEvent(new Event('focus'));
        window.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('resize'));
      }
    });

    // Wait for JS to load
    await new Promise(r => setTimeout(r, 3000));

    // Extract - same script as tryActiveTab (real viewport so IO fires)
    // Inject DomSnapshot into tab context (needed — executeScript funcs run in tab's isolated world)
    await chrome.scripting.executeScript({ target: { tabId }, files: ['utils/dom-snapshot.js'] });
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      args: [selector, fingerprint],
      func: (sel, fp) => {
        // Find the correct element (by fingerprint if provided)
        let element = null;

        if (fp) {
          const allMatches = document.querySelectorAll(sel);
          for (const el of allMatches) {
            const text = el.textContent || '';
            if (text.toLowerCase().includes(fp.toLowerCase())) {
              element = el;
              break;
            }
          }

          if (!element) {
            element = document.querySelector(sel);
          }
        } else {
          // No fingerprint - just use first match
          element = document.querySelector(sel);
        }

        if (!element) {
          console.error('[Offscreen] Element not found!');
          return null;
        }

        // Now sanitize and extract the found element
        // Mark hidden elements BEFORE cloning (while CSS is loaded)
        const allElements = [element, ...Array.from(element.querySelectorAll('*'))];
        const marked = [];

        allElements.forEach(el => {
          if (el instanceof HTMLElement && el !== element) {
            const computed = window.getComputedStyle(el);
            if (computed.display === 'none') {
              el.setAttribute('data-spotboard-hidden', 'true');
              marked.push(el);
            }
          }
        });

        // Convert lazy-loaded images BEFORE cloning (shared via DomSnapshot)
        window.DomSnapshot.promoteLazyImages(element);

        // Promote bg-image to <img> (shared via DomSnapshot)
        window.DomSnapshot.promoteBackgroundImages(element, 'offscreen-refresh');

        // 🎯 MARK CSS-HIDDEN-BUT-LOADED IMAGES (Rightmove fallback pattern)
        element.querySelectorAll('img').forEach(img => {
          if (img.naturalWidth > 0 && img.offsetWidth === 0 && img.offsetHeight === 0) {
            img.setAttribute('data-spotboard-force-visible', 'true');
          }
          if ((img.getAttribute('src') ?? '').trim() === '' && !img.closest('picture')) {
            img.setAttribute('data-spotboard-hidden', 'true');
            marked.push(img);
          }
        });

        // 🎯 5-TIER IMAGE CLASSIFICATION USING LIVE CSS (unified via DomSnapshot)
        window.DomSnapshot.classifyImages(element);

        // 💚❤️ SENTIMENT TAGGING (Phase 2: Semantic Coloring)
        const SKIP_SELECTOR = 'SCRIPT, STYLE, NOSCRIPT, TEMPLATE, SVG';
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            if (node.parentElement?.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
            if (node.parentElement?.closest('[data-sb-sentiment]')) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
        });
        const textNodesToTag = [];
        let node;

        const tokenPattern = /(?<!\w)(?<!\±)([+-])(\d[\d.,]*)(%?)/g;

        while ((node = walker.nextNode())) {
          const text = node.textContent?.trim() || '';
          if (text.length === 0) continue;

          tokenPattern.lastIndex = 0;
          const m = tokenPattern.exec(text);
          if (m) {
            const sentiment = m[1] === '+' ? 'positive' : 'negative';
            textNodesToTag.push({ node: node, sentiment: sentiment });
          }
        }

        let tagged = 0;
        textNodesToTag.forEach(({ node, sentiment }) => {
          let parent = node.parentElement;
          while (parent && parent !== element) {
            if (parent.tagName === 'A' || parent.tagName === 'BUTTON' || parent.tagName === 'SPAN') {
              parent.setAttribute('data-sb-sentiment', sentiment);
              tagged++;
              break;
            }
            parent = parent.parentElement;
          }
          if (node.parentElement && !node.parentElement.hasAttribute('data-sb-sentiment')) {
            node.parentElement.setAttribute('data-sb-sentiment', sentiment);
            tagged++;
          }
        });

        if (tagged > 0) {
          console.log(`✅ Tagged ${tagged} element(s) with sentiment data`);
        }

        // Clone with shadow DOM flattening (shared via DomSnapshot — src/utils/dom-snapshot.ts)
        const clone = window.DomSnapshot.cloneWithShadow(element);

        // Clean up original DOM
        marked.forEach(el => el.removeAttribute('data-spotboard-hidden'));

        // Remove marked elements from clone
        const hiddenInClone = clone.querySelectorAll('[data-spotboard-hidden="true"]');
        hiddenInClone.forEach(el => el.remove());

        // PASS 2: Un-hide CSS-constrained images that are actually loaded (safe on clone)
        clone.querySelectorAll('[data-spotboard-force-visible]').forEach(el => {
          el.style.cssText += ';display:block!important;width:auto!important;height:auto!important;max-width:100%!important';
          el.removeAttribute('data-spotboard-force-visible');
        });
        element.querySelectorAll('[data-spotboard-force-visible]')
               .forEach(el => el.removeAttribute('data-spotboard-force-visible'));

        // 🎯 DATA-URI BLUR PLACEHOLDER: Next.js / LQIP pattern
        let blurPromotions = 0;
        clone.querySelectorAll('img').forEach(img => {
          const src = img.getAttribute('src') ?? '';
          if (!src.startsWith('data:')) return;
          const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
          const candidates = srcset.split(',')
            .map(s => s.trim().split(/\s+/)[0])
            .filter(u => u && !u.startsWith('data:') && u.length > 10);
          const bestUrl = candidates[candidates.length - 1];
          if (bestUrl) { img.setAttribute('src', bestUrl); blurPromotions++; }
        });

        // 🎯 NEXT.JS IMAGE OPTIMIZER: Extract original CDN URL from /_next/image?url=
        let proxyUnwraps = 0;
        clone.querySelectorAll('img[src*="/_next/image"]').forEach(img => {
          try {
            const parsed = new URL(img.getAttribute('src') ?? '', location.href);
            const original = parsed.searchParams.get('url');
            if (original && original.startsWith('http')) { img.setAttribute('src', original); proxyUnwraps++; }
          } catch { /* malformed URL */ }
        });

        if (blurPromotions > 0 || proxyUnwraps > 0) {
          console.log(`🖼️ [SpotBoard] Next.js image fix: ${blurPromotions} blur promotions, ${proxyUnwraps} proxy unwraps`);
        }

        // 🎯 NEXT.JS FILL LAYOUT: Strip position:absolute fill styles that collapse to 0
        let fillFixes = 0;
        clone.querySelectorAll('img').forEach(img => {
          const style = img.getAttribute('style') ?? '';
          if (/position\s*:\s*absolute/.test(style) && /width\s*:\s*0/.test(style)) {
            img.removeAttribute('style');
            const parent = img.parentElement;
            if (parent?.tagName === 'SPAN' && /position\s*:\s*absolute/.test(parent.getAttribute('style') ?? '')) {
              parent.removeAttribute('style');
            }
            let ancestor = img.parentElement;
            for (let i = 0; i < 6 && ancestor; i++) {
              const aStyle = ancestor.getAttribute('style') ?? '';
              if (/padding-top\s*:\s*(calc\(|[\d.]+%)/.test(aStyle)) {
                const cleaned = aStyle.replace(/padding-top\s*:[^;]+;?\s*/g, '').trim().replace(/;+$/, '');
                if (cleaned) ancestor.setAttribute('style', cleaned);
                else ancestor.removeAttribute('style');
                break;
              }
              ancestor = ancestor.parentElement;
            }
            fillFixes++;
          }
        });
        if (fillFixes > 0) {
          console.log(`🖼️ [SpotBoard] Next.js fill layout fix: ${fillFixes} images un-collapsed`);
        }

        return clone.outerHTML;
      }
    });

    const html = results?.[0]?.result ?? null;
    if (DEBUG && html) {
      const imgCount = (html.match(/<img/gi) || []).length;
      const largeCount = (html.match(/data-scale-context="(?:thumbnail|medium|preview)"/gi) || []).length;
      const iconCount = (html.match(/data-scale-context="icon"/gi) || []).length;
      const smallCount = (html.match(/data-scale-context="small"/gi) || []).length;
      console.log('[SB-OFFSCREEN] EXIT elapsed=', Date.now() - _owStart + 'ms', 'html=', html.length + ' chars', '| imgs=', imgCount, 'large=', largeCount, 'icon=', iconCount, 'small=', smallCount);
    } else {
      if (DEBUG) console.log('[SB-OFFSCREEN] EXIT elapsed=', Date.now() - _owStart + 'ms', 'html= null');
    }
    return html;

  } catch (err) {
    if (DEBUG) console.error('[SB-OFFSCREEN] Error:', err);
    return null;
  } finally {
    if (win?.id) try { await chrome.windows.remove(win.id); } catch (_) {}
  }
}

/**
 * Active tab refresh (guaranteed to work but flashes briefly)
 * Fallback when background refresh fails or for sites requiring active tab
 *
 * @param {string} url - URL to load
 * @param {string} selector - CSS selector to extract
 * @param {string|null} fingerprint - Optional heading text for multi-match selection
 * @returns {Promise<string|null>} - Extracted HTML or null if failed
 *
 * Process:
 * 1. Save current tab reference
 * 2. Open URL in active tab (user sees it briefly)
 * 3. Wait 2s + consent handling + 3s for JS = 7s total
 * 4. Use fingerprint to select correct element if multiple matches
 * 5. Close tab and return to original tab
 *
 * Success rate: 100% (sites can't detect active vs background)
 * User experience: Brief tab flash (2-7 seconds visible)
 *
 * Used in: tabBasedRefresh() as fallback, or directly for requiresVisibleTab() sites
 */
async function tryActiveTab(url, selector, fingerprint = null) {
  const _atStart = Date.now();
  if (DEBUG) console.log('[SB-REFRESH] tryActiveTab ENTER', url);
  // Capture the user's current window BEFORE creating our popup so we can restore focus.
  const mainWindow = await chrome.windows.getLastFocused({ populate: false }).catch(() => null);
  // Small focused popup at right screen edge — focused:true gives a real compositor frame
  // (Vue child components mount, deal images load). 55% on-screen satisfies Chrome's
  // ≥50% visible constraint; the ~165px visible strip is far less disruptive than a full tab.
  const _screenRight = screen.availLeft + screen.availWidth;
  const _winW = 300;
  const _winH = Math.min(900, screen.availHeight - 20);
  const _winLeft = Math.round(_screenRight - _winW * 0.55);
  const _winTop = screen.availTop + 20;
  const win = await chrome.windows.create({
    url, type: 'popup', state: 'normal', focused: true,
    left: _winLeft, top: _winTop, width: _winW, height: _winH
  });
  const atTabId = win.tabs[0].id;

  try {
    // Wait 2s for initial page load
    await new Promise(r => setTimeout(r, 2000));
    
    // Handle consent dialog if present
    const consentResult = await handleConsentDialog(atTabId);
    if (consentResult.found) {
      await new Promise(r => setTimeout(r, 2000));
    }

    // Wait for JS to load
    await new Promise(r => setTimeout(r, 3000));

    // Extract - WITH SANITIZATION AND IMAGE CLASSIFICATION IN THE TAB
    // Inject DomSnapshot into tab context (needed — executeScript funcs run in tab's isolated world)
    await chrome.scripting.executeScript({ target: { tabId: atTabId }, files: ['utils/dom-snapshot.js'] });
    const results = await chrome.scripting.executeScript({
      target: { tabId: atTabId },
      args: [selector, fingerprint],
      func: (sel, fp) => {
        // Find the correct element (by fingerprint if provided)
        let element = null;
        
        if (fp) {
          const allMatches = document.querySelectorAll(sel);
          for (const el of allMatches) {
            const text = el.textContent || '';
            if (text.toLowerCase().includes(fp.toLowerCase())) {
              element = el;
              break;
            }
          }
          
          if (!element) {
            element = document.querySelector(sel);
          }
        } else {
          // No fingerprint - just use first match
          element = document.querySelector(sel);
        }
        
        if (!element) {
          console.error('[Active Tab] Element not found!');
          return null;
        }
        
        // Now sanitize and extract the found element
        // Mark hidden elements BEFORE cloning (while CSS is loaded)
        const allElements = [element, ...Array.from(element.querySelectorAll('*'))];
        const marked = [];
        
        allElements.forEach(el => {
          if (el instanceof HTMLElement && el !== element) {
            const computed = window.getComputedStyle(el);
            if (computed.display === 'none') {
              el.setAttribute('data-spotboard-hidden', 'true');
              marked.push(el);
            }
          }
        });
        
        // Convert lazy-loaded images BEFORE cloning (shared via DomSnapshot)
        window.DomSnapshot.promoteLazyImages(element);

        // Promote bg-image to <img> (shared via DomSnapshot)
        window.DomSnapshot.promoteBackgroundImages(element, 'tab-refresh');

        // 🎯 MARK CSS-HIDDEN-BUT-LOADED IMAGES (Rightmove fallback pattern)
        // Attribute-only marking — no live-page style mutation, no flicker.
        element.querySelectorAll('img').forEach(img => {
          if (img.naturalWidth > 0 && img.offsetWidth === 0 && img.offsetHeight === 0) {
            img.setAttribute('data-spotboard-force-visible', 'true');
          }
          // Mark empty-src SSR placeholders as hidden (prevents page-URL broken images)
          // Skip <picture> children -- their <img> has no src by design; URL is in <source srcset>
          if ((img.getAttribute('src') ?? '').trim() === '' && !img.closest('picture')) {
            img.setAttribute('data-spotboard-hidden', 'true');
            marked.push(img);
          }
        });

        // 🎯 5-TIER IMAGE CLASSIFICATION USING LIVE CSS (unified via DomSnapshot)
        window.DomSnapshot.classifyImages(element);

        // 💚❤️ SENTIMENT TAGGING (Phase 2: Semantic Coloring)
        // Tag finance deltas (+/-) for color coding on dashboard
        const SKIP_SELECTOR = 'SCRIPT, STYLE, NOSCRIPT, TEMPLATE, SVG';
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            if (node.parentElement?.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
            if (node.parentElement?.closest('[data-sb-sentiment]')) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
        });
        const textNodesToTag = [];
        let node;

        // (?<!\w) blocks "3-0", "10-year" etc; (?<!\±) excludes ± prefix
        const tokenPattern = /(?<!\w)(?<!\±)([+-])(\d[\d.,]*)(%?)/g;

        while ((node = walker.nextNode())) {
          const text = node.textContent?.trim() || '';
          if (text.length === 0) continue;

          tokenPattern.lastIndex = 0;
          const m = tokenPattern.exec(text);
          if (m) {
            const sentiment = m[1] === '+' ? 'positive' : 'negative';
            textNodesToTag.push({ node: node, sentiment: sentiment });
          }
        }

        let tagged = 0;
        textNodesToTag.forEach(({ node, sentiment }) => {
          let parent = node.parentElement;
          while (parent && parent !== element) {
            if (parent.tagName === 'A' || parent.tagName === 'BUTTON' || parent.tagName === 'SPAN') {
              parent.setAttribute('data-sb-sentiment', sentiment);
              tagged++;
              break;
            }
            parent = parent.parentElement;
          }
          if (node.parentElement && !node.parentElement.hasAttribute('data-sb-sentiment')) {
            node.parentElement.setAttribute('data-sb-sentiment', sentiment);
            tagged++;
          }
        });

        if (tagged > 0) {
          console.log(`✅ Tagged ${tagged} element(s) with sentiment data`);
        }

        // Clone with shadow DOM flattening (shared via DomSnapshot — src/utils/dom-snapshot.ts)
        const clone = window.DomSnapshot.cloneWithShadow(element);

        // Clean up original DOM
        marked.forEach(el => el.removeAttribute('data-spotboard-hidden'));

        // Remove marked elements from clone
        const hiddenInClone = clone.querySelectorAll('[data-spotboard-hidden="true"]');
        hiddenInClone.forEach(el => el.remove());

        // PASS 2: Un-hide CSS-constrained images that are actually loaded (safe on clone)
        clone.querySelectorAll('[data-spotboard-force-visible]').forEach(el => {
          el.style.cssText += ';display:block!important;width:auto!important;height:auto!important;max-width:100%!important';
          el.removeAttribute('data-spotboard-force-visible');
        });
        // Clean up force-visible markers from original DOM
        element.querySelectorAll('[data-spotboard-force-visible]')
               .forEach(el => el.removeAttribute('data-spotboard-force-visible'));

        // 🎯 DATA-URI BLUR PLACEHOLDER: Next.js / LQIP pattern
        // When src is a blur placeholder (data: URI), promote the LAST real srcset candidate.
        // Next.js puts smallest variants first; last non-data entry is the largest/best candidate.
        let blurPromotions = 0;
        clone.querySelectorAll('img').forEach(img => {
          const src = img.getAttribute('src') ?? '';
          if (!src.startsWith('data:')) return;
          const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
          const candidates = srcset.split(',')
            .map(s => s.trim().split(/\s+/)[0])
            .filter(u => u && !u.startsWith('data:') && u.length > 10);
          const bestUrl = candidates[candidates.length - 1];
          if (bestUrl) { img.setAttribute('src', bestUrl); blurPromotions++; }
        });

        // 🎯 NEXT.JS IMAGE OPTIMIZER: Extract original CDN URL from /_next/image?url=
        // Uses URL.searchParams — more robust than regex if query param order varies.
        let proxyUnwraps = 0;
        clone.querySelectorAll('img[src*="/_next/image"]').forEach(img => {
          try {
            const parsed = new URL(img.getAttribute('src') ?? '', location.href);
            const original = parsed.searchParams.get('url');
            if (original && original.startsWith('http')) { img.setAttribute('src', original); proxyUnwraps++; }
          } catch { /* malformed URL */ }
        });

        if (blurPromotions > 0 || proxyUnwraps > 0) {
          console.log(`🖼️ [SpotBoard] Next.js image fix: ${blurPromotions} blur promotions, ${proxyUnwraps} proxy unwraps`);
        }

        // 🎯 NEXT.JS FILL LAYOUT: Strip position:absolute fill styles that collapse to 0
        // Detected by: position:absolute + width:0 in inline style (Next.js Image fill/layout="fill")
        // These need a containing block with explicit height — which is lost in the dashboard.
        // Fix: strip img style + parent SPAN style + ancestor padding-top (aspect-ratio whitespace).
        let fillFixes = 0;
        clone.querySelectorAll('img').forEach(img => {
          const style = img.getAttribute('style') ?? '';
          if (/position\s*:\s*absolute/.test(style) && /width\s*:\s*0/.test(style)) {
            img.removeAttribute('style');
            const parent = img.parentElement;
            if (parent?.tagName === 'SPAN' && /position\s*:\s*absolute/.test(parent.getAttribute('style') ?? '')) {
              parent.removeAttribute('style');
            }
            // Strip padding-top from the aspect-ratio wrapper (creates blank whitespace when img is un-filled)
            let ancestor = img.parentElement;
            for (let i = 0; i < 6 && ancestor; i++) {
              const aStyle = ancestor.getAttribute('style') ?? '';
              if (/padding-top\s*:\s*(calc\(|[\d.]+%)/.test(aStyle)) {
                const cleaned = aStyle.replace(/padding-top\s*:[^;]+;?\s*/g, '').trim().replace(/;+$/, '');
                if (cleaned) ancestor.setAttribute('style', cleaned);
                else ancestor.removeAttribute('style');
                break;
              }
              ancestor = ancestor.parentElement;
            }
            fillFixes++;
          }
        });
        if (fillFixes > 0) {
          console.log(`🖼️ [SpotBoard] Next.js fill layout fix: ${fillFixes} images un-collapsed`);
        }

        return clone.outerHTML;
      }
    });

    const html = results[0]?.result;

    // Close popup and restore focus to user's window
    try { await chrome.windows.remove(win.id); } catch (_) {}
    if (mainWindow?.id) {
      try { await chrome.windows.update(mainWindow.id, { focused: true }); } catch (_) {}
    }

    if (DEBUG) console.log('[SB-REFRESH] tryActiveTab EXIT elapsed=', Date.now() - _atStart + 'ms');
    return html;

  } catch (error) {
    console.error(`❌ [Active Tab] Error:`, error);
    try { await chrome.windows.remove(win.id); } catch (_) {}
    if (mainWindow?.id) {
      try { await chrome.windows.update(mainWindow.id, { focused: true }); } catch (_) {}
    }
    return null;
  }
}

/**
 * Refresh a single component with multi-path strategy
 * Tries fastest method first (direct fetch), falls back to slower methods if needed
 * 
 * @param {Object} component - Component object from storage
 * @param {string} component.url - Source URL
 * @param {string} component.selector - CSS selector
 * @param {string} component.html_cache - Current HTML (for fingerprint comparison)
 * @param {string[]} component.excludedSelectors - Elements to remove
 * @returns {Promise<Object>} - Result: {success, html_cache?, error?, keepOriginal?}
 * 
 * Refresh strategy (in order):
 * 1. **Tab-based** (if willNeedActiveTab) - for session-dependent sites
 * 2. **Direct fetch** - fastest, works for ~85% of sites
 * 3. **Tab-based fallback** - for skeleton/empty content detection
 * 
 * Detection logic:
 * - Empty container: hasHeading && (linkCount ≤ 1 AND articleCount ≤ 1)
 * - Multiple duplicates: duplicates ≥ 5 AND duplicates ≥ uniqueCount
 * 
 * Processing:
 * - Applies excludedSelectors
 * - Runs cleanupDuplicates
 * - Verifies fingerprint match
 * - Preserves original on failure
 * 
 * Used in: dashboard.js refreshAll() loop
 */
async function refreshComponent(component) {
  try {
        // Check if this site requires tab-based refresh (session-dependent content)
    // Count images in original for fallback detection
    const originalImgCount = (component.html_cache?.match(/<img/gi) || []).length;
    // Count meaningful (display-sized) images — 0 for legacy cards pre-classification (not a regression)
    const originalLargeImgCount = (component.html_cache?.match(/data-scale-context="(?:thumbnail|medium|preview)"/gi) || []).length;
    const captureMode = willNeedActiveTab(component.url) ? 'tab-based' : 'direct-fetch';
    if (captureMode === 'tab-based') {
      const { html: tabHtml, activeFocusNeeded } = await tabBasedRefresh(component.url, component.selector, null, originalImgCount, originalLargeImgCount, component.requiresActiveFocus === true);

      if (tabHtml) {
        // Verify with fingerprint
        const originalFingerprint = extractFingerprint(component.html_cache);

        // 🎯 BATCH 3: Skip fingerprint check for position-based captures
        if (!component.positionBased && originalFingerprint && !tabHtml.toLowerCase().includes(originalFingerprint.toLowerCase())) {
          return {
            success: false,
            error: 'Tab refresh returned different element',
            keepOriginal: true
          };
        }
        if (component.positionBased) {
          // Position-based capture - skip fingerprint verification
        }

        // BATCH 3: Preserve capture-time classifications, then fill gaps with heuristics
        const sanitizedHtml = applySanitizationPipeline(tabHtml, component);
        return _buildTabSuccessResult(sanitizedHtml, activeFocusNeeded);
      } else {
        return {
          success: false,
          error: 'Tab-based refresh failed',
          keepOriginal: true
        };
      }
    }

    // Fetch fresh HTML from the source URL
    // Include credentials to maintain login sessions (e.g., Yahoo Finance, authenticated sites)
    let fullHtml;
    let fetchError = null;
    
    try {
      const response = await fetch(component.url, {
        method: 'GET',
        credentials: 'include', // Send cookies for session-dependent content
        headers: {
          'Cache-Control': 'no-cache', // Ensure fresh data
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      
      if (!response.ok) {
        fetchError = `HTTP ${response.status}: ${response.statusText}`;
      } else {
        fullHtml = await response.text();
      }
    } catch (networkErr) {
      fetchError = `Fetch error: ${networkErr.message}`;
    }
    
    // If fetch failed (HTTP error, network error, CORS, etc.), fall through to tab-based refresh
    if (fetchError) {
      console.warn(`⚠️ Direct fetch failed for ${component.name} (${component.url}): ${fetchError} - trying tab fallback`);
      
      const originalFingerprint = extractFingerprint(component.html_cache);
      const { html: tabHtml, activeFocusNeeded } = await tabBasedRefresh(component.url, component.selector, originalFingerprint, originalImgCount, originalLargeImgCount, component.requiresActiveFocus === true);

      if (tabHtml) {
        // Fingerprint verification (skip for position-based captures)
        if (!component.positionBased && originalFingerprint && !tabHtml.toLowerCase().includes(originalFingerprint.toLowerCase())) {
          return {
            success: false,
            error: 'Fetch failed, tab refresh returned different element',
            keepOriginal: true
          };
        }

        if (DEBUG) console.log(`🔧 [Fetch Fallback] Tab refresh succeeded for ${component.name}`);
        const sanitizedHtml = applySanitizationPipeline(tabHtml, component);
        return _buildTabSuccessResult(sanitizedHtml, activeFocusNeeded);
      }
      
      // Both fetch and tab failed
      return {
        success: false,
        error: `Fetch failed (${fetchError}), tab fallback also failed`,
        keepOriginal: true
      };
    }
    
        // Try to extract the component using the selector
    const parser = new DOMParser();
    const doc = parser.parseFromString(fullHtml, 'text/html');
    
    let extractedHtml = null;
    
    // Only try to extract if we have a specific selector
    // Generic selectors like "div" or "section" will match wrong elements
    const isGenericSelector = ['div', 'section', 'article', 'main', 'aside', 'header', 'footer', 'nav'].includes(component.selector?.toLowerCase());

    if (component.selector && !isGenericSelector) {
      // Get ALL matching elements, not just first one
      let effectiveSelector = component.selector;
      let matches = doc.querySelectorAll(effectiveSelector);
      if (matches.length === 0) {
        // Try stripping runtime-only observer class tokens absent in server HTML (e.g. CNN zone-2-observer)
        const normalized = effectiveSelector
          .replace(/\.[a-z][\w-]*\d+[-_]observer\b/gi, '')
          .replace(/\.\d+[-_]observer\b/gi, '')
          .trim();
        if (normalized !== effectiveSelector && normalized.length > 3) {
          const normalizedMatches = doc.querySelectorAll(normalized);
          if (normalizedMatches.length > 0) {
            effectiveSelector = normalized;
            matches = normalizedMatches;
          }
        }
        if (matches.length === 0) {
          console.warn(`[SpotBoard] Dead selector: "${component.selector}" on ${component.url}`);
        }
      }
      if (matches.length > 0) {
        let element = null;
        
        // If multiple matches, use fingerprint to find the right one
        if (matches.length > 1) {
          // 1. headingFingerprint tiebreaker ALWAYS runs first (even for position-based).
          //    On sites with hidden SEO headings (e.g. cricbuzz), the fingerprint may be
          //    the card name (e.g. "T20 WORLD CUP, 2026") rather than a heading element.
          if (component.headingFingerprint) {
            const norm = s => s.trim().replace(/\s+/g, ' ').toLowerCase();
            const fp = norm(component.headingFingerprint);
            // First pass: exact match in heading-like elements
            outer: for (const candidate of matches) {
              for (const h of candidate.querySelectorAll(
                'h1,h2,h3,h4,caption,[class*="heading"],[class*="title"],[class*="header"]'
              )) {
                if (norm(h.textContent || '') === fp) { element = candidate; break outer; }
              }
            }
            // Second pass: check full text content of each candidate (for non-heading fingerprints)
            if (!element) {
              for (const candidate of matches) {
                if (norm(candidate.textContent || '').includes(fp)) {
                  element = candidate;
                  break;
                }
              }
            }
          }

          // 2. Position-based captures: fall back to first match if fingerprint didn't resolve
          if (!element && component.positionBased) {
            element = matches[0];
          }

          // 3. html_cache structural fingerprint (non-position-based only)
          if (!element) {
            const originalFingerprint = extractFingerprint(component.html_cache);
            for (const candidate of matches) {
              const candidateHtml = candidate.outerHTML;
              const candidateFingerprint = extractFingerprint(candidateHtml);

              if (originalFingerprint && candidateFingerprint &&
                  candidateFingerprint.toLowerCase().includes(originalFingerprint.toLowerCase())) {
                element = candidate;
                break;
              }
            }
          }

          // 4. True last resort: first match (old behavior)
          if (!element) {
            element = matches[0];
          }
        } else {
          // Only one match - use it
          element = matches[0];
        }
        
        extractedHtml = element.outerHTML;

                // HOTUKDEALS/JS-RENDERED IMAGES PATTERN: Check if original had images but extracted has none
        // Sites like HotUKDeals render images via JavaScript - direct fetch gets text but no images
        const originalImgCount = (component.html_cache?.match(/<img/gi) || []).length;
        const extractedImgCount = (extractedHtml.match(/<img/gi) || []).length;
        const hasImagesMissing = originalImgCount >= 3 && extractedImgCount === 0;
        
        // Images missing check (silent)
        
        // Check if we got a skeleton/loading placeholder instead of real content
        const isSkeletonContent = extractedHtml.includes('class="skeleton') || 
                                   extractedHtml.includes('skeleton-color') ||
                                   extractedHtml.includes('loading-placeholder') ||
                                   (extractedHtml.match(/skeleton/gi) || []).length > 2;
        
        // Check if container has heading but no actual content (MarketWatch pattern)
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = extractedHtml;
        const hasHeading = tempDiv.querySelector('h1, h2, h3, h4, h5, h6') !== null;
        const linkCount = tempDiv.querySelectorAll('a').length;
        const articleCount = tempDiv.querySelectorAll('article, h5, [class*="article"]').length;
        const contentLength = tempDiv.textContent.trim().length;
        
        // IGN PATTERN: Check for empty content containers
        const contentContainers = tempDiv.querySelectorAll('[class*="details"], [class*="content"], [class*="title"]:not(h1):not(h2):not(h3)');
        const emptyContainers = Array.from(contentContainers).filter(el => {
          const text = el.textContent.trim();
          const hasChildren = el.children.length > 0;
          return text.length === 0 && !hasChildren;
        });
        const hasEmptyContainers = emptyContainers.length >= 2;
        
        // Consider it a skeleton if it's EXTREMELY empty (MarketWatch pattern)
        const isEmptyContainer = hasHeading && linkCount <= 1 && articleCount <= 1;
        
        // Check for duplicate content (CSS-based responsive hiding pattern)
        const links = Array.from(tempDiv.querySelectorAll('a'));
        const linkTexts = links.map(a => a.textContent.trim()).filter(t => t.length > 10);
        const uniqueTexts = new Set(linkTexts);
        const duplicateCount = linkTexts.length - uniqueTexts.size;
        const hasDuplicates = duplicateCount >= 5 && duplicateCount >= uniqueTexts.size;
        
        // WIRED PATTERN: Check for pure wrapper skeleton (many empty children, no content)
        // Example: ListWrapper with 13+ DividerWrapper children, all empty
        const wrappers = tempDiv.querySelectorAll('div[class*="Wrapper"], div[class*="wrapper"]');
        let isPureWrapperSkeleton = false;
        
        if (wrappers.length > 0) {
          // Check each potential wrapper container
          wrappers.forEach(wrapper => {
            const children = Array.from(wrapper.children);
            if (children.length >= 10) {
              // Count how many children are truly empty (no text/links/images)
              const emptyChildren = children.filter(child => {
                const hasText = child.textContent.trim().length > 0;
                const hasLinks = child.querySelector('a');
                const hasImages = child.querySelector('img');
                return !hasText && !hasLinks && !hasImages;
              });
              
              // If 80%+ of children are empty AND total content is short, it's a skeleton
              const emptyRatio = emptyChildren.length / children.length;
              if (emptyRatio >= 0.8 && contentLength < 2000) {
                isPureWrapperSkeleton = true;
              }
            }
          });
        }
        
        // Skeleton check triggers: skeleton class, empty container, missing images, wrapper skeleton


        if (isSkeletonContent || isEmptyContainer || hasEmptyContainers || hasDuplicates || isPureWrapperSkeleton || hasImagesMissing) {
          // Extract fingerprint FIRST to pass to tab refresh
          const originalFingerprint = extractFingerprint(component.html_cache);

          // Try tab-based refresh as fallback
          const { html: tabHtml, activeFocusNeeded } = await tabBasedRefresh(component.url, component.selector, originalFingerprint, originalImgCount, originalLargeImgCount, component.requiresActiveFocus === true);
          if (tabHtml) {
            // Verify we got the right element by checking fingerprint
            // 🎯 BATCH 3: Skip fingerprint check for position-based captures
            if (!component.positionBased && originalFingerprint && !tabHtml.toLowerCase().includes(originalFingerprint.toLowerCase())) {
              console.warn('[Skeleton Fallback] Fingerprint mismatch - rejecting update');
              logStructureFingerprint('skeleton-cached-original', component.html_cache);
              logStructureFingerprint('skeleton-tab-refresh-result', tabHtml);
              // Feed fallback: fingerprint mismatch on a feed just means content rotated
              const dominantTag = getDominantTag(component.html_cache);
              if (dominantTag) {
                const tabDoc = new DOMParser().parseFromString(tabHtml, 'text/html');
                const newCount = tabDoc.querySelectorAll(dominantTag.tag).length;
                if (newCount >= 3) {
                  console.log(`[SB-REFRESH] Feed rotation detected (${dominantTag.tag}: cache=${dominantTag.count}, tab=${newCount}) — accepting refresh`);
                  const sanitizedHtml = applySanitizationPipeline(tabHtml, component);
                  const newFingerprint = extractFingerprint(sanitizedHtml);
                  if (newFingerprint) component.headingFingerprint = newFingerprint;
                  return _buildTabSuccessResult(sanitizedHtml, activeFocusNeeded);
                }
              }
              return {
                success: false,
                error: 'Tab refresh returned different element',
                keepOriginal: true
              };
            }
            // Position-based captures skip fingerprint check

            // Tab refresh worked and verified!
            // BATCH 3: Preserve capture-time classifications, then fill gaps with heuristics
            const sanitizedHtml = applySanitizationPipeline(tabHtml, component);
            return _buildTabSuccessResult(sanitizedHtml, activeFocusNeeded);
          }

          // Tab refresh also failed - keep original
          return {
            success: false,
            error: isEmptyContainer ? 'Page returned empty container (JS not loaded yet)' : 'Page returned skeleton content (JS not loaded)',
            keepOriginal: true
          };
        }

        // CONTENT DRIFT GUARD: Direct-fetch returns raw server HTML which may contain
        // CSS-hidden sections (e.g. Tailwind's wb:hidden) that the live page hides.
        // DOMParser has no CSS engine, so hidden sections bloat the extracted HTML.
        // If the raw extracted HTML is significantly larger than the raw capture baseline,
        // fall back to tab-based refresh where CSS is active and hidden elements are removed.
        // rawCaptureLength is stored at capture time (pre-cleanupDuplicates) for a true raw-to-raw
        // comparison — avoids false-positives on sites like Guardian, yr.no, Zoopla where
        // cleanupDuplicates shrinks stored HTML 2-4x vs the raw fetch.
        const driftBaseline = component.rawCaptureLength || null;
        if (!driftBaseline) {
          // No baseline yet (old capture) — record raw length for future refreshes, skip detection this time
          component.rawCaptureLength = extractedHtml.length;
        } else if (driftBaseline > 500 && extractedHtml.length > driftBaseline * 1.5) {
          console.log(`[SB-REFRESH] Content drift detected: raw=${extractedHtml.length} vs rawBaseline=${driftBaseline} (ratio=${(extractedHtml.length / driftBaseline).toFixed(2)}x) → falling back to tab-based refresh`);
          const driftFingerprint = component.headingFingerprint || extractFingerprint(component.html_cache);
          const { html: tabHtml, activeFocusNeeded: driftActiveFocusNeeded } = await tabBasedRefresh(component.url, component.selector, driftFingerprint, originalImgCount, originalLargeImgCount, component.requiresActiveFocus === true);
          if (tabHtml) {
            // Skip fingerprint check for position-based captures
            if (!component.positionBased && driftFingerprint && !tabHtml.toLowerCase().includes(driftFingerprint.toLowerCase())) {
              console.warn('[Content Drift] Tab refresh fingerprint mismatch - keeping original');
              logStructureFingerprint('drift-cached-original', component.html_cache);
              logStructureFingerprint('drift-tab-refresh-result', tabHtml);
              // Feed fallback: fingerprint mismatch on a feed just means content rotated
              const dominantTag = getDominantTag(component.html_cache);
              if (dominantTag) {
                const tabDoc = new DOMParser().parseFromString(tabHtml, 'text/html');
                const newCount = tabDoc.querySelectorAll(dominantTag.tag).length;
                if (newCount >= 3) {
                  console.log(`[SB-REFRESH] Feed rotation detected (${dominantTag.tag}: cache=${dominantTag.count}, tab=${newCount}) — accepting refresh`);
                  const sanitizedHtml = applySanitizationPipeline(tabHtml, component);
                  const newFingerprint = extractFingerprint(sanitizedHtml);
                  if (newFingerprint) component.headingFingerprint = newFingerprint;
                  return _buildTabSuccessResult(sanitizedHtml, driftActiveFocusNeeded);
                }
              }
              return {
                success: false,
                error: 'Content drift: tab refresh returned different element',
                keepOriginal: true
              };
            }
            const sanitizedHtml = applySanitizationPipeline(tabHtml, component);
            return _buildTabSuccessResult(sanitizedHtml, driftActiveFocusNeeded);
          }
          // Tab fallback failed — check if direct-fetch content is substantial.
          // Drift may have fired due to natural content growth (e.g. weather table shows more
          // hours than at capture time), not CSS-hidden sections. If so, use the direct-fetch
          // result and reset the drift baseline so future refreshes don't re-trigger.
          const _driftCheckDiv = document.createElement('div');
          _driftCheckDiv.innerHTML = extractedHtml;
          const _driftTextLen = _driftCheckDiv.textContent.trim().length;
          if (_driftTextLen > 500) {
            console.log(`[SB-REFRESH] Drift tab fallback failed but direct-fetch has real content (textLen=${_driftTextLen}, htmlLen=${extractedHtml.length}) — using direct-fetch and resetting baseline`);
            const _driftSanitized = applySanitizationPipeline(extractedHtml, component);
            return {
              success: true,
              html_cache: _driftSanitized,
              last_refresh: new Date().toISOString(),
              rawCaptureLength: extractedHtml.length,
              status: 'active'
            };
          }
          return {
            success: false,
            error: 'Content drift detected but tab refresh failed',
            keepOriginal: true
          };
        }
      } else {
        // Selector not found in fetched HTML


        // SELF-HEALING: Auto-generate headingFingerprint if missing
        if (!component.headingFingerprint) {
          if (DEBUG) console.log(`🔧 [Self-Healing] No headingFingerprint found, attempting to generate...`);
          
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = component.html_cache || '';
          const cachedHeading = tempDiv.querySelector(`
            h1, h2, h3, h4, caption,
            [class*="heading"], [class*="title"], [class*="header"],
            [data-testid*="heading"], [data-testid*="title"]
          `);
          
          if (cachedHeading) {
            const headingText = cachedHeading.textContent.trim();
            if (DEBUG) console.log(`✅ [Self-Healing] Generated headingFingerprint: "${headingText}"`);
            component.headingFingerprint = headingText;
            
            // Save to storage for future refreshes (per-component key)
            chrome.storage.sync.get(`comp-${component.id}`, (result) => {
              const compData = result[`comp-${component.id}`];
              if (compData) {
                compData.headingFingerprint = headingText;
                chrome.storage.sync.set({ [`comp-${component.id}`]: compData }, () => {
                  if (DEBUG) console.log(`💾 [Self-Healing] Saved headingFingerprint to storage`);
                });
              }
            });
          } else {
            if (DEBUG) console.log(`⚠️ [Self-Healing] Could not find heading in cached HTML`);
          }
        }
        
        // Try heading-based detection for dynamic ID patterns (Amazon CardInstance pattern)
        // 🎯 BATCH 3: Skip heading fallback for position-based captures (they don't use headings)
        if (!component.positionBased && component.headingFingerprint) {
          // Trying heading-based detection
          
          const allHeadings = doc.querySelectorAll(`
            h1, h2, h3, h4, caption,
            [class*="heading"], [class*="title"], [class*="header"],
            [data-testid*="heading"], [data-testid*="title"]
          `);
          let targetHeading = null;
          
          for (const heading of allHeadings) {
            const headingText = heading.textContent.trim();
            const fingerprint = component.headingFingerprint;
            
            // CASE-INSENSITIVE bidirectional match: either heading contains fingerprint OR fingerprint contains heading
            // This handles cases where fingerprint has duplicated text (e.g., "Top offersTop offers")
            const headingLower = headingText.toLowerCase();
            const fingerprintLower = fingerprint.toLowerCase();
            
            if (headingLower.includes(fingerprintLower) || 
                (headingText.length >= 8 && fingerprintLower.includes(headingLower))) {
              targetHeading = heading;
              // Found heading match
              break;
            }
          }
          
          if (targetHeading) {
            // Traverse up to find the card container
            let current = targetHeading;
            let container = null;
            
            // Try up to 5 levels up
            for (let i = 0; i < 5; i++) {
              if (!current.parentElement) break;
              current = current.parentElement;
              
              // Check if this looks like a card container
              const hasDataAttr = current.hasAttribute('data-card-metrics-id') || 
                                  current.hasAttribute('data-testid') ||
                                  current.hasAttribute('data-component-id');
              const hasCardClass = current.className && (
                current.className.includes('card') ||
                current.className.includes('component') ||
                current.className.includes('widget')
              );
              
              if (hasDataAttr || hasCardClass) {
                container = current;
                // Found container
                break;
              }
            }
            
            // If no specific container found, use parent 3 levels up
            if (!container && targetHeading.parentElement?.parentElement?.parentElement) {
              container = targetHeading.parentElement.parentElement.parentElement;
              // Using default parent (3 levels up)
            }
            
            if (container) {
              extractedHtml = container.outerHTML;
              
              // Validate minimum size - if too small, try climbing higher
              if (extractedHtml.length < 1000) {
                // Container too small, searching higher
                
                let largerContainer = container.parentElement;
                while (largerContainer && largerContainer.outerHTML.length < 2000 && largerContainer.parentElement) {
                  // Climbing up DOM tree
                  largerContainer = largerContainer.parentElement;
                }
                
                if (largerContainer && largerContainer.outerHTML.length > extractedHtml.length) {
                  const largerHtml = largerContainer.outerHTML;
                  // Found larger container
                  container = largerContainer;
                  extractedHtml = largerHtml;
                } else {
                  // Using small container
                }
              }
              
              // Successfully extracted via heading
            }
          } else {
            // Heading not found - will use skeleton fallback
          }
        }
        
        // If heading fallback didn't work, try tab-based refresh
        if (!extractedHtml) {
          const originalFingerprint = extractFingerprint(component.html_cache);
          const { html: tabHtml, activeFocusNeeded: selectorTabActiveFocus } = await tabBasedRefresh(component.url, component.selector, originalFingerprint, originalImgCount, originalLargeImgCount, component.requiresActiveFocus === true);

          if (tabHtml) {
            // 🎯 BATCH 3: Skip fingerprint check for position-based captures
            if (!component.positionBased && originalFingerprint && !tabHtml.toLowerCase().includes(originalFingerprint.toLowerCase())) {
              console.warn('[Selector Not Found] Fingerprint mismatch - checking for feed rotation');
              // Feed fallback: fingerprint mismatch on a news feed just means content rotated
              const dominantTag = getDominantTag(component.html_cache);
              if (dominantTag) {
                const tabDoc = new DOMParser().parseFromString(tabHtml, 'text/html');
                const newCount = tabDoc.querySelectorAll(dominantTag.tag).length;
                if (newCount >= 3) {
                  console.log(`[SB-REFRESH] Feed rotation detected (${dominantTag.tag}: cache=${dominantTag.count}, tab=${newCount}) — accepting refresh`);
                  const sanitizedHtml = applySanitizationPipeline(tabHtml, component);
                  const newFingerprint = extractFingerprint(sanitizedHtml);
                  if (newFingerprint) component.headingFingerprint = newFingerprint;
                  return _buildTabSuccessResult(sanitizedHtml, selectorTabActiveFocus);
                }
              }
              return {
                success: false,
                error: 'Tab refresh returned different element',
                keepOriginal: true
              };
            }
            // BATCH 3: Preserve capture-time classifications, then fill gaps with heuristics
            if (DEBUG) console.log(`🔧 [2nd Tab Fallback HTML Pipeline] ${component.name}:`);
            if (DEBUG) console.log(`   1. Tab HTML: ${tabHtml.length} chars`);

            const sanitizedHtml = applySanitizationPipeline(tabHtml, component);
            return _buildTabSuccessResult(sanitizedHtml, selectorTabActiveFocus);
          }
        }
      }
    } else {
      // Generic selector - skip extraction but still try heading-based fallback
    }
    
    // If extraction failed, DON'T use the full page - keep original HTML
    if (!extractedHtml) {
      console.error(`❌ SILENT FAIL: ${component.name}`);
      console.error(`   URL: ${component.url}`);
      console.error(`   Selector: ${component.selector}`);
      console.error(`   Reason: Selector not found and heading fallback failed`);
      return {
        success: false,
        error: 'Cannot extract component - selector too generic or not found',
        keepOriginal: true
      };
    }

    // 💚❤️ SENTIMENT TAGGING (Phase 2: Direct-Fetch Path)
    // Tag finance deltas in the extracted HTML before sanitization
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = extractedHtml;

    tagSentimentData(tempContainer);

    // Get the sentiment-tagged HTML
    extractedHtml = tempContainer.innerHTML;

    // Apply cleanup to extracted HTML
    const sanitizedHtml = applySanitizationPipeline(extractedHtml, component);
    
    if (sanitizedHtml.length < 100) {
      console.error(`⚠️ SUSPICIOUSLY SHORT HTML (${sanitizedHtml.length} chars):`);
      console.error(`   Content:`, sanitizedHtml);
    }
    
    return {
      success: true,
      html_cache: sanitizedHtml,
      last_refresh: new Date().toISOString(),
      rawCaptureLength: extractedHtml.length, // Self-updating baseline — prevents drift false-positives on sites with naturally varying content size (weather, scores, stocks)
      status: 'active'
    };
    
  } catch (error) {
    console.error(`❌ Failed to refresh ${component.name}:`, error);
    console.error(`   URL: ${component.url}`);
    console.error(`   Selector: ${component.selector}`);
    console.error(`   Error details:`, error.message);
    
    // Note: GA4 tracking happens in refreshAll() loop (tracks all failures including graceful ones)
    
    return {
      success: false,
      error: error.message,
      status: 'error'
    };
  }
}

/**
 * Inline concurrency limiter — no external dependencies.
 * Runs `fn(item)` for each item, with at most `limit` running simultaneously.
 * Uses a worker-drain pattern: N workers each pop from a shared queue until empty.
 */
async function runWithConcurrency(items, fn, limit) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        await fn(item);
      }
    })
  );
}

/**
 * Refresh all components in parallel (limit=3 for normal cards, serial for focus-required)
 */
async function refreshAll() {
  const btn = document.getElementById('refresh-all-btn');
  const refreshStartTime = Date.now(); // GA4: Track refresh duration
  
  // Show loading state on button
  btn.disabled = true;
  btn.textContent = '⏳ Refreshing...';
  btn.style.background = '#6c757d';
  
  // Track refresh click (Batch 4)
  trackRefreshClick();
  
  try {
    // Get components from hybrid storage (sync metadata + local data)
    // NEW: Load from per-component keys instead of array
    const syncResult = await new Promise(resolve => {
      chrome.storage.sync.get(null, resolve);
    });
    
    const localResult = await new Promise(resolve => {
      chrome.storage.local.get(['componentsData'], resolve);
    });
    
    // Extract all comp-* keys from sync storage
    const metadata = [];
    Object.keys(syncResult).forEach(key => {
      if (key.startsWith('comp-')) {
        metadata.push(syncResult[key]);
      }
    });
    
    const localData = localResult.componentsData || {};
    
    // Merge sync metadata with local data
    const components = metadata.map(meta => ({
      ...meta,
      ...localData[meta.id]
    }));
    
    if (components.length === 0) {
      btn.textContent = '✅ No components to refresh';
      setTimeout(() => {
        btn.textContent = '🔄 Refresh All';
        btn.style.background = '#007bff';
        btn.disabled = false;
      }, 2000);
      return;
    }
    
    // Separate active vs paused components
    const activeComponents = components.filter(c => !c.refreshPaused);
    const pausedComponents = components.filter(c => c.refreshPaused);
    
    // Handle all-paused case
    if (activeComponents.length === 0) {
      btn.textContent = `✅ All ${pausedComponents.length} paused`;
      setTimeout(() => {
        btn.textContent = '🔄 Refresh All';
        btn.style.background = '#007bff';
        btn.disabled = false;
      }, 2000);
      return;
    }
    
    // Start toast with active count (show paused count if any)
    const toastMessage = pausedComponents.length > 0 
      ? `${activeComponents.length} active (${pausedComponents.length} paused)`
      : `${activeComponents.length} components`;
    toastManager.startRefresh(activeComponents.length, toastMessage);
    
    // Refresh active components in parallel (normal cards: limit=3, focus-required: serial)
    const results = [];
    const componentRefreshMap = new Map(); // Track which components were refreshed

    // Split into two pools:
    // - normalCards: background/offscreen refresh — safe to run concurrently
    // - focusCards: requiresActiveFocus (focused popup) — must be serial (one popup at a time)
    const focusCards = activeComponents.filter(c => c.requiresActiveFocus || requiresVisibleTab(c.url));
    const normalCards = activeComponents
      .filter(c => !c.requiresActiveFocus && !requiresVisibleTab(c.url))
      .sort((a, b) => {
        // Direct-fetch cards first (no Chrome window needed) — frees worker slots faster
        const aTab = willNeedActiveTab(a.url) ? 1 : 0;
        const bTab = willNeedActiveTab(b.url) ? 1 : 0;
        return aTab - bTab;
      });

    if (DEBUG) console.log('[SB-PARALLEL] refreshAll start:', activeComponents.length, 'cards at', new Date().toISOString());
    if (DEBUG) console.log('[SB-PARALLEL] pools: normal=' + normalCards.length + ' (limit=3) focus=' + focusCards.length + ' (serial)');

    // Single card toast message for parallel mode
    toastManager.updateProgress('Refreshing ' + activeComponents.length + ' card' + (activeComponents.length !== 1 ? 's' : '') + '…', false);

    // Per-card worker — shared between both pools
    async function processCard(comp) {
      const displayName = comp.customLabel || comp.name;
      if (DEBUG) console.log('[SB-PARALLEL] started:', displayName);
      const t0 = Date.now();

      const refreshResult = await refreshComponent(comp);
      results.push(refreshResult);
      componentRefreshMap.set(comp.id, refreshResult);

      // 🎯 BATCH 5: Track individual refresh failures
      if (!refreshResult.success) {
        // Classify error using new helper function
        const errorCode = classifyError(refreshResult.error);

        // Record failure for toast display
        toastManager.recordFailure(displayName, errorCode);

        try {
          const errorMsg = refreshResult.error?.toLowerCase() || '';
          let errorType = 'unknown';

          // Classify error from result
          if (errorMsg.includes('skeleton') || errorMsg.includes('empty container')) {
            errorType = 'skeleton_content';
          } else if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
            errorType = 'timeout';
          } else if (errorMsg.includes('http') || errorMsg.includes('fetch') || errorMsg.includes('network')) {
            errorType = 'network_error';
          } else if (errorMsg.includes('not found') || errorMsg.includes('selector')) {
            errorType = 'selector_not_found';
          } else if (errorMsg.includes('different element') || errorMsg.includes('fingerprint')) {
            errorType = 'fingerprint_mismatch';
          }

          // Determine which fallback was attempted
          let fallbackUsed = 'direct'; // Default assumption
          if (errorMsg.includes('tab') || errorMsg.includes('background') || errorMsg.includes('active')) {
            fallbackUsed = 'all_exhausted';
          }

          chrome.runtime.sendMessage({
            type: 'GA4_EVENT',
            eventName: 'refresh_failed',
            params: {
              url_domain: new URL(comp.url).hostname,
              error_type: errorType,
              selector_type: comp.positionBased ? 'position' : 'selector',
              has_exclusions: (comp.excludedSelectors && comp.excludedSelectors.length > 0),
              fallback_used: fallbackUsed
            }
          });
        } catch (ga4Error) {
          console.warn('GA4 tracking error:', ga4Error);
        }
      }

      // Mark this component as complete
      toastManager.completeComponent(refreshResult.success);
      if (DEBUG) console.log('[SB-PARALLEL] done:', displayName, 'elapsed=' + (Date.now() - t0) + 'ms success=' + refreshResult.success);
    }

    // Run normal cards concurrently (up to 3 at once)
    await runWithConcurrency(normalCards, processCard, 3);
    // Run focus-required cards serially after (one focused popup at a time)
    for (const comp of focusCards) await processCard(comp);

    if (DEBUG) console.log('[SB-PARALLEL] refreshAll complete elapsed=' + (Date.now() - refreshStartTime) + 'ms');
    
    // Update components with new data (split between sync and local storage)
    // Handle both active (refreshed) and paused (unchanged) components
    const syncUpdates = {};
    
    // 🔧 FIX: Start from existing local data to avoid deleting unloaded components
    // Previously started empty {}, which would delete any local data not in current components array
    const existingLocalData = await new Promise(resolve => {
      chrome.storage.local.get(['componentsData'], (result) => {
        resolve(result.componentsData || {});
      });
    });
    const updatedLocalData = { ...existingLocalData };
    
    // Process all components (active + paused)
    components.forEach((comp) => {
      const result = componentRefreshMap.get(comp.id); // undefined for paused components
      
      // Handle paused components - keep existing data unchanged
      if (!result) {
        // Component was paused - preserve all existing data
        syncUpdates[`comp-${comp.id}`] = {
          id: comp.id,
          name: comp.name,
          url: comp.url,
          favicon: comp.favicon,
          customLabel: comp.customLabel,
          headingFingerprint: comp.headingFingerprint,
          selector: comp.selector,
          excludedSelectors: comp.excludedSelectors || [],
          positionBased: comp.positionBased || false, // 🎯 BATCH 5 FIX: Preserve capture method
          refreshPaused: comp.refreshPaused, // Preserve paused state!
          last_refresh: comp.last_refresh,
          cardSize: comp.cardSize || '1x1', // 🔧 FIX: Preserve card size on refresh
          // Preserve existing error state fields
          lastAttemptAt: comp.lastAttemptAt,
          lastSuccessAt: comp.lastSuccessAt,
          lastOutcome: comp.lastOutcome || 'paused',
          lastErrorCode: comp.lastErrorCode,
          lastErrorAt: comp.lastErrorAt,
          ...(comp.requiresActiveFocus ? { requiresActiveFocus: true } : {})
        };
        
        const pausedEntry = {
          selector: comp.selector,
          html_cache: comp.html_cache,
          last_refresh: comp.last_refresh,
          excludedSelectors: comp.excludedSelectors || []
        };
        if (comp.rawCaptureLength) pausedEntry.rawCaptureLength = comp.rawCaptureLength;
        updatedLocalData[comp.id] = pausedEntry;
      } else {
        // Component was refreshed - update with new data
        const attemptTimestamp = new Date().toISOString();
        const errorCode = result.success ? null : classifyError(result.error);

        // If this refresh required the active focused popup, persist the flag so future
        // refreshes skip background+offscreen and go straight to tryActiveTab.
        // Once set, the flag is preserved (never cleared) — comp.requiresActiveFocus from storage.
        const updatedActiveFocus = result.requiresActiveFocus || comp.requiresActiveFocus || false;
        syncUpdates[`comp-${comp.id}`] = {
          id: comp.id,
          name: comp.name,
          url: comp.url,
          favicon: comp.favicon,
          customLabel: comp.customLabel,
          headingFingerprint: comp.headingFingerprint,
          selector: comp.selector,
          excludedSelectors: comp.excludedSelectors || [],
          positionBased: comp.positionBased || false, // 🎯 BATCH 5 FIX: Preserve capture method
          refreshPaused: comp.refreshPaused, // Preserve state
          last_refresh: result.success ? result.last_refresh : comp.last_refresh,
          cardSize: comp.cardSize || '1x1', // 🔧 FIX: Preserve card size on refresh
          // New error tracking fields
          lastAttemptAt: attemptTimestamp,
          lastSuccessAt: result.success ? attemptTimestamp : comp.lastSuccessAt,
          lastOutcome: result.success ? 'success' : 'failed',
          lastErrorCode: errorCode,
          lastErrorAt: result.success ? null : attemptTimestamp,
          ...(updatedActiveFocus ? { requiresActiveFocus: true } : {})
        };
        
        // Save full data to local (including HTML)
        if (result.success) {
          // Validate HTML is not empty before marking as success
          if (!result.html_cache || result.html_cache.length < 50) {
            console.error(`⚠️ Empty HTML detected for ${comp.name} - keeping original`);
            const emptyEntry = {
              selector: comp.selector,
              html_cache: comp.html_cache,
              last_refresh: comp.last_refresh,
              excludedSelectors: comp.excludedSelectors || []
            };
            if (comp.rawCaptureLength) emptyEntry.rawCaptureLength = comp.rawCaptureLength;
            updatedLocalData[comp.id] = emptyEntry;
          } else {
            const successEntry = {
              selector: comp.selector,
              html_cache: result.html_cache,
              last_refresh: result.last_refresh,
              excludedSelectors: comp.excludedSelectors || []
            };
            // Use result.rawCaptureLength if the refresh provided an updated baseline (direct-fetch success or drift graceful fallback)
            // Otherwise preserve the existing baseline
            const _newRawCapture = result.rawCaptureLength || comp.rawCaptureLength;
            if (_newRawCapture) successEntry.rawCaptureLength = _newRawCapture;
            updatedLocalData[comp.id] = successEntry;
          }
        } else {
          // Keep existing data if refresh failed
          const failedEntry = {
            selector: comp.selector,
            html_cache: comp.html_cache,
            last_refresh: comp.last_refresh,
            excludedSelectors: comp.excludedSelectors || []
          };
          if (comp.rawCaptureLength) failedEntry.rawCaptureLength = comp.rawCaptureLength;
          updatedLocalData[comp.id] = failedEntry;
        }
      }
    });
    
    // Save to both storages (sync gets per-component keys, local gets HTML)
    await new Promise(resolve => {
      chrome.storage.sync.set(syncUpdates, resolve);
    });
    
    await new Promise(resolve => {
      chrome.storage.local.set({ componentsData: updatedLocalData }, resolve);
    });
    
    // Show success toast with paused count
    toastManager.finishAll(pausedComponents.length);
    
    // Log summary to console (minimal)
    const successCount = results.filter(r => r.success).length;
    const logMessage = pausedComponents.length > 0 
      ? `Refresh complete: ${successCount}/${activeComponents.length} (${pausedComponents.length} paused)`
      : `Refresh complete: ${successCount}/${activeComponents.length}`;
    if (DEBUG) console.log(logMessage);
    
    // GA4: Track refresh completion (Batch 4)
    try {
      if (typeof window.GA4 !== 'undefined') {
        const failCount = results.filter(r => !r.success).length;
        // Build domain string with GA4's 100-char hard limit.
        // Loop ensures no domain is ever chopped mid-string — only full domains included.
        const uniqueDomains = [...new Set(activeComponents.map(c => {
          try { return new URL(c.url).hostname; } catch { return 'unknown'; }
        }))].sort();
        let _domains = '';
        for (const d of uniqueDomains) {
          if (_domains.length + d.length + 1 > 100) break;
          _domains += (_domains ? ',' : '') + d;
        }
        await window.GA4.sendEvent('refresh_completed', {
          success_count: successCount,
          fail_count: failCount,
          duration_ms: Date.now() - refreshStartTime,
          domains: _domains
        });
      }
    } catch (e) {
      console.warn('GA4 refresh_completed failed:', e);
    }
    
    // Update button
    btn.textContent = `✅ Done`;
    btn.style.background = '#28a745';

    // Only auto-reload if there are NO failures
    // If there are failures, let the persistent toast stay visible with retry button
    const failCount = results.filter(r => !r.success).length;
    if (failCount === 0) {
      // Auto-reload after success toast displays
      setTimeout(() => {
        sessionStorage.setItem('reloadFromRefresh', 'true'); // Flag to skip board_opened tracking
        location.reload();
      }, 3500);
    } else {
      // Failures present - reload page to show error states properly
      // Longer delay (10s) to give user time to see the failure toast and click retry if desired
      setTimeout(() => {
        sessionStorage.setItem('reloadFromRefresh', 'true');
        location.reload();
      }, 10000); // 10 seconds - enough time to read failures and click retry
    }
    
  } catch (error) {
    console.error('❌ Refresh failed:', error);
    toastManager.hideToast();
    btn.textContent = '❌ Refresh failed';
    btn.style.background = '#dc3545';

    setTimeout(() => {
      sessionStorage.setItem('reloadFromRefresh', 'true');
      location.reload();
    }, 3000);
  }
}
