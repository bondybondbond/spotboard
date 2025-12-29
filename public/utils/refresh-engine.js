/**
 * Refresh Engine for SpotBoard
 * Handles component refresh logic, tab management, and toast notifications
 * 
 * Dependencies:
 * - dom-cleanup.js (cleanupDuplicates, applyExclusions)
 * - fingerprint.js (extractFingerprint)
 */

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
  }
  
  startRefresh(total, customMessage = null) {
    this.totalComponents = total;
    this.completedCount = 0;
    this.successCount = 0;
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
  
  finishAll(pausedCount = 0) {
    this.hideToast();
    this.showSuccessToast(pausedCount);
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
}

// Global toast manager instance
const toastManager = new RefreshToastManager();

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
  // Removed hardcoded domain list - let intelligent fallback handle detection
  // Previously forced active tab for: hotukdeals.com, premierleague.com, ign.com
  // Now relies on:
  // 1. Direct fetch attempt
  // 2. Skeleton content detection → background tab
  // 3. Background tab failure → active tab fallback
  return false;
}

/**
 * Tab-based refresh for JS-heavy sites
 * Opens a tab (background or active), waits for JS to load, extracts content
 * 
 * @param {string} url - The URL to fetch
 * @param {string} selector - CSS selector for component to extract
 * @param {string|null} fingerprint - Optional heading text for multi-match disambiguation
 * @returns {Promise<string|null>} - Extracted HTML or null if failed
 * 
 * Process:
 * 1. Check if site requires active tab (requiresVisibleTab)
 * 2. Try background tab with visibility spoof (seamless)
 * 3. Fallback to active tab if background fails (brief flash)
 * 
 * Handles:
 * - Consent dialogs (auto-click reject/accept)
 * - Lazy-loaded content (waits 5-8s total)
 * - Multiple selector matches (uses fingerprint)
 * - CSS-based duplicates (marks display:none before cloning)
 * 
 * Used in: refreshComponent() when direct fetch fails or for known problematic sites
 */
async function tabBasedRefresh(url, selector, fingerprint = null, expectedImgCount = 0) {
  try {
    // Check if this site MUST be visible (Page Visibility API blocks background)
    if (requiresVisibleTab(url)) {
      // Skip background attempt - go straight to active tab
      const result = await tryActiveTab(url, selector, fingerprint);
      return result || null;
    }
    
    // ATTEMPT 1: Try background tab with visibility spoof
    const result = await tryBackgroundWithSpoof(url, selector);
    if (result) {
      // Check if images are missing (site may still detect background tab)
      const resultImgCount = (result.match(/<img/gi) || []).length;
      if (expectedImgCount >= 3 && resultImgCount === 0) {
        console.log(`🖼️ [Background Tab] Images missing (expected ${expectedImgCount}, got ${resultImgCount}) - falling back to active tab`);
        // Fall through to active tab
      } else {
        return result;
      }
    }
    
    // ATTEMPT 2: Fallback to active tab (guaranteed to work)
    const fallbackResult = await tryActiveTab(url, selector, fingerprint);
    if (fallbackResult) return fallbackResult;
    
    return null;
  } catch (error) {
    console.error('Tab refresh failed:', error);
    return null;
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
async function tryBackgroundWithSpoof(url, selector) {
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
      }
    });
    
    console.log(`✓ [Background] Visibility spoof injected`);
    
    // Wait 2s for initial page load
    await new Promise(r => setTimeout(r, 2000));
    console.log(`✓ [Background] Initial 2s wait complete`);
    
    // Handle consent dialog if present
    const consentResult = await handleConsentDialog(tab.id);
    if (consentResult.found) {
      console.log(`✓ [Background] Consent dialog ${consentResult.action}`);
      await new Promise(r => setTimeout(r, 3000));
      console.log(`✓ [Background] Post-consent 3s wait complete`);
    } else {
      console.log(`✓ [Background] No consent dialog detected`);
    }

    // Wait additional time for JS to fully load (complex sites)
    await new Promise(r => setTimeout(r, 3000));
    
    // Try to extract - WITH SANITIZATION AND IMAGE CLASSIFICATION IN THE TAB
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [selector],
      func: (sel) => {
        const element = document.querySelector(sel);
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
        
        // Convert lazy-loaded images BEFORE cloning
        // Epic Games and many sites use data-image, data-src, etc. for lazy loading
        element.querySelectorAll('img').forEach(img => {
          const lazyAttrs = ['data-image', 'data-src', 'data-lazy-src', 'data-original', 'data-lazy'];
          for (const attr of lazyAttrs) {
            const lazyUrl = img.getAttribute(attr);
            if (lazyUrl && lazyUrl.startsWith('http')) {
              img.setAttribute('src', lazyUrl);
              break;
            }
          }
        });
        
        // 🎯 5-TIER IMAGE CLASSIFICATION USING LIVE CSS
        // Icon (25px): Tiny images like logos, voting buttons
        // Small (48px): Avatars, badges
        // Thumbnail (80px): HotUK deals
        // Medium (100px): Zoopla property images (landscape)
        // Preview (150px): Large product hero images
        element.querySelectorAll('img').forEach(img => {
          try {
            // Skip if already classified
            if (img.hasAttribute('data-scale-context')) return;
            
            // Get nearest structural container
            let container = img.closest('article, section') || img.parentElement;
            if (!container) {
              img.setAttribute('data-scale-context', 'icon');
              return;
            }
            
            // Calculate container dimensions (works because we're in live DOM)
            const containerRect = container.getBoundingClientRect();
            const containerArea = containerRect.width * containerRect.height;
            
            // Calculate RENDERED image dimensions
            const imgRect = img.getBoundingClientRect();
            const imageArea = imgRect.width * imgRect.height;
            const imgHeight = imgRect.height;
            
            // Calculate area ratio
            const areaRatio = containerArea > 0 ? imageArea / containerArea : 0;
            
            // 5-tier classification logic (HEIGHT-BASED primary)
            let context;
            
            // Rule 1: Tiny images (<40px height) = icon (25px)
            if (imgHeight < 40 || imageArea < 1600) {
              context = 'icon';
            }
            // Rule 2: Small images (<70px height) = small (48px)
            else if (imgHeight < 70 || imageArea < 4900) {
              context = 'small';
            }
            // Rule 3: Small ratio (<10%) = small (48px)
            else if (areaRatio < 0.10) {
              context = 'small';
            }
            // Rule 4: Medium ratio (10-25%) = thumbnail (80px)
            else if (areaRatio < 0.25 || imageArea < 15000) {
              context = 'thumbnail';
            }
            // Rule 5: Medium-large ratio (25-50%) = medium (100px)
            else if (areaRatio < 0.50 || imageArea < 40000) {
              context = 'medium';
            }
            // Rule 6: Large ratio (>50%) = preview (150px)
            else {
              context = 'preview';
            }
            
            img.setAttribute('data-scale-context', context);
            
          } catch (e) {
            img.setAttribute('data-scale-context', 'icon');
          }
        });
        
        // Clone with markers
        const clone = element.cloneNode(true);
        
        // Clean up original DOM
        marked.forEach(el => el.removeAttribute('data-spotboard-hidden'));
        
        // Remove marked elements from clone
        const hiddenInClone = clone.querySelectorAll('[data-spotboard-hidden="true"]');
        hiddenInClone.forEach(el => el.remove());
        
        return clone.outerHTML;
      }
    });
    
    const html = results[0]?.result;
    
    await chrome.tabs.remove(tab.id);
    return html;
    
  } catch (error) {
    console.error(`❌ [Background] Error:`, error);
    try { await chrome.tabs.remove(tab.id); } catch (e) {}
    return null;
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
  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = await chrome.tabs.create({ url, active: true });
  
  try {
    // Wait 2s for initial page load
    await new Promise(r => setTimeout(r, 2000));
    
    // Handle consent dialog if present
    const consentResult = await handleConsentDialog(tab.id);
    if (consentResult.found) {
      await new Promise(r => setTimeout(r, 2000));
    }
    
    // Wait for JS to load
    await new Promise(r => setTimeout(r, 3000));
    
    // Extract - WITH SANITIZATION AND IMAGE CLASSIFICATION IN THE TAB
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [selector, fingerprint],
      func: (sel, fp) => {
        // Find the correct element (by fingerprint if provided)
        let element = null;
        
        if (fp) {
          const allMatches = document.querySelectorAll(sel);
          console.log('[Active Tab] Found', allMatches.length, 'matching elements');
          
          for (const el of allMatches) {
            const text = el.textContent || '';
            if (text.toLowerCase().includes(fp.toLowerCase())) {
              console.log('[Active Tab] Found element with fingerprint!');
              element = el;
              break;
            }
          }
          
          if (!element) {
            console.warn('[Active Tab] No element matched fingerprint, using first match');
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
        
        // Convert lazy-loaded images BEFORE cloning
        // Epic Games and many sites use data-image, data-src, etc. for lazy loading
        element.querySelectorAll('img').forEach(img => {
          const lazyAttrs = ['data-image', 'data-src', 'data-lazy-src', 'data-original', 'data-lazy'];
          for (const attr of lazyAttrs) {
            const lazyUrl = img.getAttribute(attr);
            if (lazyUrl && lazyUrl.startsWith('http')) {
              img.setAttribute('src', lazyUrl);
              break;
            }
          }
        });
        
        // 🎯 5-TIER IMAGE CLASSIFICATION USING LIVE CSS
        // Icon (25px): Tiny images like logos, voting buttons
        // Small (48px): Avatars, badges
        // Thumbnail (80px): HotUK deals
        // Medium (100px): Zoopla property images (landscape)
        // Preview (150px): Large product hero images
        element.querySelectorAll('img').forEach(img => {
          try {
            // Skip if already classified
            if (img.hasAttribute('data-scale-context')) return;
            
            // Get nearest structural container
            let container = img.closest('article, section') || img.parentElement;
            if (!container) {
              img.setAttribute('data-scale-context', 'icon');
              return;
            }
            
            // Calculate container dimensions (works because we're in live DOM)
            const containerRect = container.getBoundingClientRect();
            const containerArea = containerRect.width * containerRect.height;
            
            // Calculate RENDERED image dimensions
            const imgRect = img.getBoundingClientRect();
            const imageArea = imgRect.width * imgRect.height;
            const imgHeight = imgRect.height;
            
            // Calculate area ratio
            const areaRatio = containerArea > 0 ? imageArea / containerArea : 0;
            
            // 5-tier classification logic (HEIGHT-BASED primary)
            let context;
            
            // Rule 1: Tiny images (<40px height) = icon (25px)
            if (imgHeight < 40 || imageArea < 1600) {
              context = 'icon';
            }
            // Rule 2: Small images (<70px height) = small (48px)
            else if (imgHeight < 70 || imageArea < 4900) {
              context = 'small';
            }
            // Rule 3: Small ratio (<10%) = small (48px)
            else if (areaRatio < 0.10) {
              context = 'small';
            }
            // Rule 4: Medium ratio (10-25%) = thumbnail (80px)
            else if (areaRatio < 0.25 || imageArea < 15000) {
              context = 'thumbnail';
            }
            // Rule 5: Medium-large ratio (25-50%) = medium (100px)
            else if (areaRatio < 0.50 || imageArea < 40000) {
              context = 'medium';
            }
            // Rule 6: Large ratio (>50%) = preview (150px)
            else {
              context = 'preview';
            }
            
            img.setAttribute('data-scale-context', context);
            
          } catch (e) {
            img.setAttribute('data-scale-context', 'icon');
          }
        });
        
        // Clone with markers
        const clone = element.cloneNode(true);
        
        // Clean up original DOM
        marked.forEach(el => el.removeAttribute('data-spotboard-hidden'));
        
        // Remove marked elements from clone
        const hiddenInClone = clone.querySelectorAll('[data-spotboard-hidden="true"]');
        hiddenInClone.forEach(el => el.remove());
        
        return clone.outerHTML;
      }
    });
    
    const html = results[0]?.result;
    
    // Close and switch back
    await chrome.tabs.remove(tab.id);
    if (currentTab?.id) {
      await chrome.tabs.update(currentTab.id, { active: true });
    }
    
    return html;
    
  } catch (error) {
    console.error(`❌ [Active Tab] Error:`, error);
    try { await chrome.tabs.remove(tab.id); } catch (e) {}
    if (currentTab?.id) {
      try { await chrome.tabs.update(currentTab.id, { active: true }); } catch (e) {}
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
        if (willNeedActiveTab(component.url)) {
      const tabHtml = await tabBasedRefresh(component.url, component.selector, null, originalImgCount);
      
      if (tabHtml) {
        // Verify with fingerprint
        const originalFingerprint = extractFingerprint(component.html_cache);
        
        if (originalFingerprint && !tabHtml.toLowerCase().includes(originalFingerprint.toLowerCase())) {
          return {
            success: false,
            error: 'Tab refresh returned different element',
            keepOriginal: true
          };
        }
        
        // BATCH 3: Preserve capture-time classifications, then fill gaps with heuristics
        const withExclusions = applyExclusions(tabHtml, component.excludedSelectors);
        const withPreserved = preserveImageClassifications(withExclusions, component.html_cache);
        const withImageClassification = classifyImagesForRefresh(withPreserved);
        return {
          success: true,
          html_cache: cleanupDuplicates(withImageClassification),
          last_refresh: new Date().toISOString(),
          status: 'active'
        };
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
    const response = await fetch(component.url, {
      method: 'GET',
      credentials: 'include', // Send cookies for session-dependent content
      headers: {
        'Cache-Control': 'no-cache' // Ensure fresh data
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const fullHtml = await response.text();
    
        // Try to extract the component using the selector
    const parser = new DOMParser();
    const doc = parser.parseFromString(fullHtml, 'text/html');
    
    let extractedHtml = null;
    
    // Only try to extract if we have a specific selector
    // Generic selectors like "div" or "section" will match wrong elements
    const isGenericSelector = ['div', 'section', 'article', 'main', 'aside', 'header', 'footer', 'nav'].includes(component.selector?.toLowerCase());
    
    if (component.selector && !isGenericSelector) {
      // Get ALL matching elements, not just first one
      const matches = doc.querySelectorAll(component.selector);
      
            if (matches.length > 0) {
        let element = null;
        
        // If multiple matches, use fingerprint to find the right one
        if (matches.length > 1) {
          const originalFingerprint = extractFingerprint(component.html_cache);
          console.log(`🔍 Multiple matches (${matches.length}) for selector, using fingerprint: "${originalFingerprint}"`);
          
          // Try to find element whose fingerprint matches
          for (const candidate of matches) {
            const candidateHtml = candidate.outerHTML;
            const candidateFingerprint = extractFingerprint(candidateHtml);
            
            if (originalFingerprint && candidateFingerprint && 
                candidateFingerprint.toLowerCase().includes(originalFingerprint.toLowerCase())) {
              element = candidate;
              console.log(`✅ Found matching element with fingerprint: "${candidateFingerprint}"`);
              break;
            }
          }
          
          // If no fingerprint match, fall back to first match (old behavior)
          if (!element) {
            console.log(`⚠️ No fingerprint match found, using first element`);
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
        
        if (hasImagesMissing) {
          console.log(`🖼️ [Images Missing] Original had ${originalImgCount} images, extracted has ${extractedImgCount} - likely JS-rendered`);
        }
        
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
          console.log(`🔍 Skeleton detected: ${component.name} (imgs: ${originalImgCount}→${extractedImgCount})`);
        }
        
        if (isSkeletonContent || isEmptyContainer || hasEmptyContainers || hasDuplicates || isPureWrapperSkeleton || hasImagesMissing) {
          // Extract fingerprint FIRST to pass to tab refresh
          const originalFingerprint = extractFingerprint(component.html_cache);
          
          // Try tab-based refresh as fallback
          console.log('[Skeleton Fallback] Attempting tab refresh for', component.label, 'with fingerprint:', originalFingerprint);
          const tabHtml = await tabBasedRefresh(component.url, component.selector, originalFingerprint, originalImgCount);
          
          if (tabHtml) {
            // Verify we got the right element by checking fingerprint
            if (originalFingerprint && !tabHtml.toLowerCase().includes(originalFingerprint.toLowerCase())) {
              console.warn('[Skeleton Fallback] Fingerprint mismatch - rejecting update');
              return {
                success: false,
                error: 'Tab refresh returned different element',
                keepOriginal: true
              };
            }
            
            // Tab refresh worked and verified!
            // BATCH 3: Preserve capture-time classifications, then fill gaps with heuristics
            const withExclusions = applyExclusions(tabHtml, component.excludedSelectors);
            const withPreserved = preserveImageClassifications(withExclusions, component.html_cache);
            const withImageClassification = classifyImagesForRefresh(withPreserved);
            const cleaned = cleanupDuplicates(withImageClassification);
            return {
              success: true,
              html_cache: cleaned,
              last_refresh: new Date().toISOString(),
              status: 'active'
            };
          }
          
          // Tab refresh also failed - keep original
          return {
            success: false,
            error: isEmptyContainer ? 'Page returned empty container (JS not loaded yet)' : 'Page returned skeleton content (JS not loaded)',
            keepOriginal: true
          };
        }
      } else {
        // Selector not found in fetched HTML
        
        // SELF-HEALING: Auto-generate headingFingerprint if missing
        if (!component.headingFingerprint) {
          console.log(`🔧 [Self-Healing] No headingFingerprint found, attempting to generate...`);
          
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = component.html_cache || '';
          const cachedHeading = tempDiv.querySelector(`
            h1, h2, h3, h4,
            [class*="heading"], [class*="title"], [class*="header"],
            [data-testid*="heading"], [data-testid*="title"]
          `);
          
          if (cachedHeading) {
            const headingText = cachedHeading.textContent.trim();
            console.log(`✅ [Self-Healing] Generated headingFingerprint: "${headingText}"`);
            component.headingFingerprint = headingText;
            
            // Save to storage for future refreshes (per-component key)
            chrome.storage.sync.get(`comp-${component.id}`, (result) => {
              const compData = result[`comp-${component.id}`];
              if (compData) {
                compData.headingFingerprint = headingText;
                chrome.storage.sync.set({ [`comp-${component.id}`]: compData }, () => {
                  console.log(`💾 [Self-Healing] Saved headingFingerprint to storage`);
                });
              }
            });
          } else {
            console.log(`⚠️ [Self-Healing] Could not find heading in cached HTML`);
          }
        }
        
        // Try heading-based detection for dynamic ID patterns (Amazon CardInstance pattern)
        if (component.headingFingerprint) {
          console.log(`🔍 [Heading Fallback] Selector not found, trying heading-based detection for: "${component.headingFingerprint}"`);
          
          const allHeadings = doc.querySelectorAll(`
            h1, h2, h3, h4,
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
              console.log(`✅ [Heading Fallback] Found heading: "${heading.textContent.substring(0, 50)}"`);
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
                console.log(`✅ [Heading Fallback] Found container at level ${i + 1}`);
                break;
              }
            }
            
            // If no specific container found, use parent 3 levels up
            if (!container && targetHeading.parentElement?.parentElement?.parentElement) {
              container = targetHeading.parentElement.parentElement.parentElement;
              console.log(`⚠️ [Heading Fallback] Using default parent (3 levels up)`);
            }
            
            if (container) {
              extractedHtml = container.outerHTML;
              
              // Validate minimum size - if too small, try climbing higher
              if (extractedHtml.length < 1000) {
                console.log(`⚠️ [Heading Fallback] Container too small (${extractedHtml.length} chars), searching higher...`);
                
                let largerContainer = container.parentElement;
                while (largerContainer && largerContainer.outerHTML.length < 2000 && largerContainer.parentElement) {
                  console.log(`  Level up: ${largerContainer.className?.substring(0, 30)} (${largerContainer.outerHTML.length} chars)`);
                  largerContainer = largerContainer.parentElement;
                }
                
                if (largerContainer && largerContainer.outerHTML.length > extractedHtml.length) {
                  const largerHtml = largerContainer.outerHTML;
                  console.log(`✅ [Heading Fallback] Found larger container: ${largerHtml.length} chars (${Math.round(largerHtml.length / extractedHtml.length)}x bigger)`);
                  container = largerContainer;
                  extractedHtml = largerHtml;
                } else {
                  console.log(`⚠️ [Heading Fallback] No larger container found, using small one`);
                }
              }
              
              console.log(`✅ [Heading Fallback] Successfully extracted via heading: ${extractedHtml.length} chars`);
            }
          } else {
            console.log(`❌ [Heading Fallback] Heading not found in page`);
          }
        }
        
        // If heading fallback didn't work, try tab-based refresh
        if (!extractedHtml) {
          const originalFingerprint = extractFingerprint(component.html_cache);
          const tabHtml = await tabBasedRefresh(component.url, component.selector, originalFingerprint, originalImgCount);
        
          if (tabHtml) {
            if (originalFingerprint && !tabHtml.toLowerCase().includes(originalFingerprint.toLowerCase())) {
              console.error(`❌ FINGERPRINT MISMATCH: ${component.name}`);
              console.error(`   Expected fingerprint: "${originalFingerprint}"`);
              console.error(`   Tab HTML length: ${tabHtml.length} chars`);
              return {
                success: false,
                error: 'Tab refresh returned different element',
                keepOriginal: true
              };
            }
            // BATCH 3: Preserve capture-time classifications, then fill gaps with heuristics
            console.log(`🔧 [2nd Tab Fallback HTML Pipeline] ${component.name}:`);
            console.log(`   1. Tab HTML: ${tabHtml.length} chars`);
            
            const withExclusions = applyExclusions(tabHtml, component.excludedSelectors);
            const withPreserved = preserveImageClassifications(withExclusions, component.html_cache);
            const withImageClassification = classifyImagesForRefresh(withPreserved);
            const cleaned = cleanupDuplicates(withImageClassification);
            return {
              success: true,
              html_cache: cleaned,
              last_refresh: new Date().toISOString(),
              status: 'active'
            };
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
    
    // Apply cleanup to extracted HTML
    // BATCH 3: Preserve capture-time classifications, then fill gaps with heuristics
    console.log(`🔧 [HTML Pipeline] ${component.name}:`);
    console.log(`   1. Extracted: ${extractedHtml.length} chars`);
    
    const withExclusions = applyExclusions(extractedHtml, component.excludedSelectors);
    console.log(`   2. After exclusions: ${withExclusions.length} chars`);
    
    const withPreserved = preserveImageClassifications(withExclusions, component.html_cache);
    console.log(`   2b. After preserving classifications: ${withPreserved.length} chars`);
    
    const withImageClassification = classifyImagesForRefresh(withPreserved);
    console.log(`   3. After image classification: ${withImageClassification.length} chars`);
    
    const afterCleanup = cleanupDuplicates(withImageClassification);
    console.log(`   4. After cleanup (FINAL): ${afterCleanup.length} chars`);
    
    if (afterCleanup.length < 100) {
      console.error(`⚠️ SUSPICIOUSLY SHORT HTML (${afterCleanup.length} chars):`);
      console.error(`   Content:`, afterCleanup);
    }
    
    return {
      success: true,
      html_cache: afterCleanup,
      last_refresh: new Date().toISOString(),
      status: 'active'
    };
    
  } catch (error) {
    console.error(`❌ Failed to refresh ${component.name}:`, error);
    console.error(`   URL: ${component.url}`);
    console.error(`   Selector: ${component.selector}`);
    console.error(`   Error details:`, error.message);
    return {
      success: false,
      error: error.message,
      status: 'error'
    };
  }
}

/**
 * Refresh all components sequentially
 */
async function refreshAll() {
  const btn = document.getElementById('refresh-all-btn');
  
  // Show loading state on button
  btn.disabled = true;
  btn.textContent = '⏳ Refreshing...';
  btn.style.background = '#6c757d';
  
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
    
    // Refresh active components only (skip paused)
    const results = [];
    const componentRefreshMap = new Map(); // Track which components were refreshed
    
    for (let i = 0; i < activeComponents.length; i++) {
      const comp = activeComponents[i];
      const displayName = comp.customLabel || comp.name;
      const needsActiveTab = requiresVisibleTab(comp.url);
      
      // Update toast to show current component
      toastManager.updateProgress(displayName, needsActiveTab);
      
      // Do the refresh
      const refreshResult = await refreshComponent(comp);
      results.push(refreshResult);
      componentRefreshMap.set(comp.id, refreshResult);
      
      // Mark this component as complete
      toastManager.completeComponent(refreshResult.success);
    }
    
    // Update components with new data (split between sync and local storage)
    // Handle both active (refreshed) and paused (unchanged) components
    const syncUpdates = {};
    const updatedLocalData = {};
    
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
          refreshPaused: comp.refreshPaused, // Preserve paused state!
          last_refresh: comp.last_refresh
        };
        
        updatedLocalData[comp.id] = {
          selector: comp.selector,
          html_cache: comp.html_cache,
          last_refresh: comp.last_refresh,
          excludedSelectors: comp.excludedSelectors || []
        };
      } else {
        // Component was refreshed - update with new data
        syncUpdates[`comp-${comp.id}`] = {
          id: comp.id,
          name: comp.name,
          url: comp.url,
          favicon: comp.favicon,
          customLabel: comp.customLabel,
          headingFingerprint: comp.headingFingerprint,
          selector: comp.selector,
          excludedSelectors: comp.excludedSelectors || [],
          refreshPaused: comp.refreshPaused, // Preserve state
          last_refresh: result.success ? result.last_refresh : comp.last_refresh
        };
        
        // Save full data to local (including HTML)
        if (result.success) {
          // Validate HTML is not empty before marking as success
          if (!result.html_cache || result.html_cache.length < 50) {
            console.error(`⚠️ Empty HTML detected for ${comp.name} - keeping original`);
            updatedLocalData[comp.id] = {
              selector: comp.selector,
              html_cache: comp.html_cache,
              last_refresh: comp.last_refresh,
              excludedSelectors: comp.excludedSelectors || []
            };
          } else {
            updatedLocalData[comp.id] = {
              selector: comp.selector,
              html_cache: result.html_cache,
              last_refresh: result.last_refresh,
              excludedSelectors: comp.excludedSelectors || []
            };
          }
        } else {
          // Keep existing data if refresh failed
          updatedLocalData[comp.id] = {
            selector: comp.selector,
            html_cache: comp.html_cache,
            last_refresh: comp.last_refresh,
            excludedSelectors: comp.excludedSelectors || []
          };
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
    console.log(logMessage);
    
    // Update button
    btn.textContent = `✅ Done`;
    btn.style.background = '#28a745';
    
    // Auto-reload after success toast displays
    setTimeout(() => {
      location.reload();
    }, 3500);
    
  } catch (error) {
    console.error('❌ Refresh failed:', error);
    toastManager.hideToast();
    btn.textContent = '❌ Refresh failed';
    btn.style.background = '#dc3545';
    
    setTimeout(() => {
      btn.textContent = '🔄 Refresh All';
      btn.style.background = '#007bff';
      btn.disabled = false;
    }, 2000);
  }
}
