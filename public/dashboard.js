// Fix relative URLs to absolute based on component origin
/**
 * 🎯 HIT LIST: Remove duplicate/hidden elements from captured HTML
 * Fixes BBC's triple-text pattern (MobileValue, DesktopValue, visually-hidden)
 */
function cleanupDuplicates(html) {
  if (!html) return html;
  
  const temp = document.createElement('div');
  temp.innerHTML = html;
  
  // Remove known duplicate/hidden elements
  // Note: BBC uses CSS-in-JS class names like "ssrcss-xxx-MobileValue"
  const duplicateSelectors = [
    '.visually-hidden',           // Screen reader text
    '.sr-only',                   // Bootstrap screen reader
    '[class*="MobileValue"]',     // BBC mobile duplicate (partial match)
    '[class*="VisuallyHidden"]'   // BBC visually hidden (partial match)
  ];
  
  duplicateSelectors.forEach(selector => {
    temp.querySelectorAll(selector).forEach(el => el.remove());
  });
  
  // Remove broken SVG sprite references (prevents console errors)
  temp.querySelectorAll('svg use[href*=".svg#"]').forEach(use => {
    use.parentElement.remove(); // Remove the entire SVG element
  });
  
  return temp.innerHTML;
}

function fixRelativeUrls(container, sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    const origin = url.origin; // e.g., "https://www.bbc.co.uk"
    
    // Fix all anchor tags
    container.querySelectorAll('a[href]').forEach(link => {
      const href = link.getAttribute('href');
      
      if (href.startsWith('/')) {
        // Absolute path: /deals/123 → https://hotukdeals.com/deals/123
        link.href = origin + href;
      } else if (href.startsWith('./') || href.startsWith('../')) {
        // Relative path: ./deals/123 → resolve relative to source path
        const basePath = url.pathname.substring(0, url.pathname.lastIndexOf('/'));
        link.href = origin + basePath + '/' + href.replace(/^\.\//, '');
      }
      // If already absolute (https://) or hash (#), leave as-is
      
      // Ensure links open in new tab
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    });
  } catch (err) {
    console.error('Failed to fix URLs for:', sourceUrl, err);
  }
}

// Remove all cursor styles from captured HTML, then mark links
function removeCursorStyles(container) {
  // Get all elements including the container itself
  const allElements = [container, ...container.querySelectorAll('*')];
  
  allElements.forEach(el => {
    // Remove any inline cursor style
    if (el.style.cursor) {
      el.style.cursor = '';
    }
    
    // If style attribute is now empty, remove it
    if (el.style.length === 0 && el.hasAttribute('style')) {
      el.removeAttribute('style');
    }
  });
  
  // Add a class to all links so CSS can target them
  container.querySelectorAll('a[href]').forEach(link => {
    link.classList.add('canvas-link');
  });
}


/**
 * 🎯 WHITESPACE CLEANUP: Inject CSS to compress excessive spacing
 * 
 * Purpose: Remove framework bloat (padding classes, empty elements, list gaps)
 * while preserving all functionality (links, interactive elements, text content)
 * 
 * Categories:
 * 1. Excessive Padding/Margins - Target framework classes (Pbot-xs, ssrcss-*)
 * 2. Empty/Redundant Elements - Hide empty headings, screen-reader text
 * 3. List Gaps - Compress line-height in lists
 * 4. Dense Text Layout - Tighter text spacing overall
 * 
 * Reversible: Call removeCleanupCSS() to restore original styling
 */
function injectCleanupCSS() {
  // Check if already injected
  if (document.getElementById('cleanup-injected-css')) {
    return;
  }
  
  const cleanupStyles = `
    /* 
      CLEANUP INJECTION - Applied to captured components
      Purpose: Remove framework bloat while preserving functionality
      
      ✗ Removed: Excessive padding, empty elements, list gaps
      ✓ Preserved: Links, interactive elements, text content
      
      Reversible: Call removeCleanupCSS() to restore original styling
    */
    
    /* CATEGORY 1: Excessive Padding/Margins */
    /* Target: Framework padding classes (Yahoo: Pbot-xs, BBC: ssrcss-*) */
    .component-content [class*="Pbot"],
    .component-content [class*="Ptop"],
    .component-content [class*="Pvertical"],
    .component-content [class*="Mbot"],
    .component-content [class*="Mtop"] {
      padding: 2px !important;
      margin: 2px 0 !important;
    }
    
    /* CATEGORY 2: Empty/Redundant Elements */
    /* Target: Empty headings, screen-reader text */
    .component-content h6:empty,
    .component-content h5:empty,
    .component-content h4:empty,
    .component-content .sr-only:empty,
    .component-content .visually-hidden:empty {
      display: none !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    
    /* Reduce spacing on small headings with minimal content */
    .component-content h6,
    .component-content h5 {
      margin: 2px 0 !important;
      padding: 2px 0 !important;
    }
    
    /* CATEGORY 3: List Gaps */
    /* Target: Lists with excessive line-height */
    /* Force bullets on all lists (fixes BBC "1.1" duplication + keeps visual hierarchy) */
    .component-content ul,
    .component-content ol {
      list-style-type: disc !important;
      margin: 4px 0 !important;
      padding-left: 20px !important;
    }
    
    .component-content ul li,
    .component-content ol li {
      line-height: 1.3 !important;
      margin: 2px 0 !important;
      padding: 2px 0 !important;
    }
    
    /* CATEGORY 4: Dense Text Layout */
    /* Tighter text spacing overall */
    .component-content {
      line-height: 1.4 !important;
    }
    
    .component-content p {
      margin: 4px 0 !important;
      line-height: 1.4 !important;
    }
    
    .component-content div {
      line-height: 1.4 !important;
    }
    
    /* Reduce gaps in nested wrapper elements */
    .component-content [class*="Grid"],
    .component-content [class*="Flex"],
    .component-content [class*="Stack"] {
      gap: 2px !important;
    }
    
    /* Compress table rows (Yahoo Fantasy) */
    .component-content table tr {
      height: auto !important;
    }
    
    .component-content table td {
      padding: 4px 6px !important;
    }
  `;
  
  const styleSheet = document.createElement('style');
  styleSheet.id = 'cleanup-injected-css';
  styleSheet.textContent = cleanupStyles;
  document.head.appendChild(styleSheet);
  
  console.log('✅ CSS cleanup injected');
  
  return styleSheet;
}

/**
 * Remove the injected cleanup CSS (restore original styling)
 */
function removeCleanupCSS() {
  const sheet = document.getElementById('cleanup-injected-css');
  if (sheet) {
    sheet.remove();
    console.log('✅ CSS cleanup removed');
  }
}

// Load and display components from hybrid storage (sync metadata + local data)
chrome.storage.sync.get(['components'], (syncResult) => {
  chrome.storage.local.get(['componentsData'], (localResult) => {
    const container = document.getElementById('components-container');
    const metadata = Array.isArray(syncResult.components) ? syncResult.components : [];
    const localData = localResult.componentsData || {};
    
    // Merge sync metadata with local HTML data by ID
    const components = metadata.map(meta => ({
      ...meta,
      ...localData[meta.id] // Add selector, html_cache, last_refresh if exists
    }));
  
  // ✨ INJECT CSS CLEANUP for whitespace compression
  injectCleanupCSS();
  
  
  
  if (components.length === 0) {
    // Empty state already shown by default
    return;
  }
  
  // Build grid
  container.innerHTML = '<div class="components-grid"></div>';
  const grid = container.querySelector('.components-grid');
  
  components.forEach((component, index) => {
    const card = document.createElement('div');
    card.className = 'component-card';
    // Format timestamp with both absolute and relative time
    let timestampText = 'Never refreshed';
    if (component.last_refresh) {
      const lastUpdate = new Date(component.last_refresh);
      const now = new Date();
      const diffMs = now - lastUpdate;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      
      // Format absolute time: "27 Nov 2025, 21:30"
      const day = lastUpdate.getDate();
      const month = lastUpdate.toLocaleString('en-GB', { month: 'short' });
      const year = lastUpdate.getFullYear();
      const hours = lastUpdate.getHours().toString().padStart(2, '0');
      const minutes = lastUpdate.getMinutes().toString().padStart(2, '0');
      const absoluteTime = `${day} ${month} ${year}, ${hours}:${minutes}`;
      
      // Format relative time
      let relativeTime = '';
      if (diffMins < 1) {
        relativeTime = 'just now';
      } else if (diffMins === 1) {
        relativeTime = '1 minute ago';
      } else if (diffMins < 60) {
        relativeTime = `${diffMins} minutes ago`;
      } else if (diffHours === 1) {
        relativeTime = '1 hour ago';
      } else if (diffHours < 24) {
        relativeTime = `${diffHours} hours ago`;
      } else if (diffDays === 1) {
        relativeTime = '1 day ago';
      } else if (diffDays < 7) {
        relativeTime = `${diffDays} days ago`;
      } else {
        relativeTime = 'over a week ago';
      }
      
      timestampText = `${absoluteTime} (${relativeTime})`;
    }
    
    // Extract domain from URL for compact display
    let displayDomain = 'unknown';
    try {
      const urlObj = new URL(component.url);
      displayDomain = urlObj.hostname.replace('www.', '');
    } catch (e) {
      displayDomain = 'unknown';
    }
    
    // Get just the relative time for compact view
    let relativeTime = 'not yet';
    if (component.last_refresh) {
      const lastUpdate = new Date(component.last_refresh);
      const now = new Date();
      const diffMs = now - lastUpdate;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      
      if (diffMins < 1) {
        relativeTime = 'just now';
      } else if (diffMins === 1) {
        relativeTime = '1m ago';
      } else if (diffMins < 60) {
        relativeTime = `${diffMins}m ago`;
      } else if (diffHours === 1) {
        relativeTime = '1h ago';
      } else if (diffHours < 24) {
        relativeTime = `${diffHours}h ago`;
      } else if (diffDays === 1) {
        relativeTime = '1d ago';
      } else if (diffDays < 7) {
        relativeTime = `${diffDays}d ago`;
      } else {
        relativeTime = '1w+ ago';
      }
    }
    
    card.innerHTML = `
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #f8f9fa; border-radius: 6px 6px 0 0; border-bottom: 1px solid #e9ecef;">
        <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #495057; min-width: 0; flex: 1;">
          ${component.favicon ? `<img src="${component.favicon}" alt="" style="width: 16px; height: 16px; flex-shrink: 0;" />` : ''}
          <span class="editable-title" style="font-weight: 600; cursor: pointer; padding: 2px 4px; border-radius: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="Click to edit label">
            ${component.customLabel || component.name || 'Unnamed'}
          </span>
          <span style="color: #6c757d; font-size: 12px; white-space: nowrap;">•</span>
          <span style="color: #6c757d; font-size: 12px; white-space: nowrap;">⏰ ${relativeTime}</span>
          <span class="info-icon" style="color: #6c757d; font-size: 14px; cursor: pointer; margin-left: 4px;" 
                title="Click for details">ℹ️</span>
        </div>
        <button class="delete-btn" style="padding: 4px 10px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; margin-left: 8px; flex-shrink: 0;">Delete</button>
      </div>
      <div class="component-content" style="margin-top: 0; padding: 12px; background: #ffffff; border-radius: 0 0 6px 6px; max-height: 300px; overflow: auto;">
        ${cleanupDuplicates(component.html_cache) || '<div style="color: #6c757d; text-align: center; padding: 20px;"><div style="font-size: 18px; margin-bottom: 8px;">📭</div><div style="font-weight: 600; margin-bottom: 4px;">No content yet</div><div style="font-size: 13px;">Click "Refresh All" to fetch latest content</div></div>'}
      </div>
    `;
    
    // ✨ FIX RELATIVE URLs TO ABSOLUTE
    const contentDiv = card.querySelector('.component-content');
    if (contentDiv && component.url) {
      fixRelativeUrls(contentDiv, component.url);
      // ✨ FORCE REMOVE ALL CURSOR STYLES
      removeCursorStyles(contentDiv);
    }
    
    // ✨ ADD DELETE FUNCTIONALITY
    const deleteBtn = card.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', () => {
      if (confirm(`Delete "${component.customLabel || component.name}"? This cannot be undone.`)) {
        // Remove from both storages
        const updated = components.filter((c, i) => i !== index);
        
        // Update sync storage (metadata + selector for cross-device refresh)
        const syncData = updated.map(c => ({
          id: c.id,
          name: c.name,
          url: c.url,
          favicon: c.favicon,
          customLabel: c.customLabel,
          selector: c.selector
        }));
        chrome.storage.sync.set({ components: syncData });
        
        // Update local storage (remove HTML data)
        chrome.storage.local.get(['componentsData'], (result) => {
          const localData = result.componentsData || {};
          delete localData[component.id];
          chrome.storage.local.set({ componentsData: localData });
        });
        
        // Remove card from DOM
        card.remove();
        // Show empty state if no components left
        if (updated.length === 0) {
          container.innerHTML = `
            <div class="empty-state">
              <h2>No components yet</h2>
              <p>Use the extension popup to capture components from any website</p>
            </div>
          `;
        }
      }
    });
    
    // ✨ ADD EDITABLE TITLE FUNCTIONALITY
    const titleElement = card.querySelector('.editable-title');
    titleElement.addEventListener('click', () => {
      // Highlight on hover to show it's editable
      titleElement.style.background = '#f0f0f0';
      
      const currentLabel = component.customLabel || component.name || 'Unnamed Component';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = currentLabel;
      input.style.cssText = 'width: 100%; font-size: inherit; font-weight: inherit; padding: 2px 4px; border: 2px solid #007bff; border-radius: 4px;';
      
      // Replace title with input
      titleElement.replaceWith(input);
      input.focus();
      input.select();
      
      const saveLabel = () => {
        const newLabel = input.value.trim();
        
        // Restore title element
        input.replaceWith(titleElement);
        titleElement.style.background = '';
        
        if (newLabel && newLabel !== currentLabel) {
          // Update component in array
          component.customLabel = newLabel;
          titleElement.textContent = newLabel;
          
          // Save metadata to sync storage (includes selector for cross-device refresh)
          const syncData = components.map(c => ({
            id: c.id,
            name: c.name,
            url: c.url,
            favicon: c.favicon,
            customLabel: c.customLabel,
            selector: c.selector
          }));
          chrome.storage.sync.set({ components: syncData });
        }
      };
      
      // Save on Enter key
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          saveLabel();
        }
      });
      
      // Save on blur (click away)
      input.addEventListener('blur', saveLabel);
    });
    
    // Add hover effect to show it's clickable
    titleElement.addEventListener('mouseenter', () => {
      titleElement.style.background = '#f0f0f0';
    });
    titleElement.addEventListener('mouseleave', () => {
      titleElement.style.background = '';
    });
    
    // ✨ ADD INFO ICON CLICK HANDLER
    const infoIcon = card.querySelector('.info-icon');
    if (infoIcon) {
      infoIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Create custom modal with clickable URL
        const modal = document.createElement('div');
        modal.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 10000;
        `;
        
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
          background: #2d3748;
          color: white;
          padding: 20px;
          border-radius: 8px;
          max-width: 500px;
          width: 90%;
        `;
        
        modalContent.innerHTML = `
          <div style="margin-bottom: 16px;">
            <div style="font-weight: 600; margin-bottom: 8px;">Full URL:</div>
            <a href="${component.url || '#'}" 
               target="_blank" 
               rel="noopener noreferrer"
               style="color: #63b3ed; text-decoration: none; word-break: break-all; display: block; padding: 8px; background: rgba(255, 255, 255, 0.1); border-radius: 4px;">
              ${component.url || 'No URL'}
            </a>
          </div>
          <div style="margin-bottom: 20px;">
            <div style="font-weight: 600; margin-bottom: 4px;">Last updated:</div>
            <div style="color: #cbd5e0;">${timestampText}</div>
          </div>
          <button id="closeInfoModal" style="width: 100%; padding: 10px; background: #4299e1; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">
            OK
          </button>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // Close modal handlers
        const closeBtn = modal.querySelector('#closeInfoModal');
        closeBtn.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
          if (e.target === modal) modal.remove();
        });
      });
    }
    
    grid.appendChild(card);
  });
  }); // Close chrome.storage.local.get
});

// ==========================================
// REFRESH FUNCTIONALITY
// ==========================================

/**
 * Extract a "fingerprint" from HTML to verify we're refreshing the correct element
 * Looks for headings or strong text that identifies the component
 */
function extractFingerprint(html) {
  if (!html) return null;
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // Look for headings first (h1-h6)
  const heading = doc.querySelector('h1, h2, h3, h4, h5, h6');
  if (heading && heading.textContent.trim()) {
    return heading.textContent.trim().substring(0, 50);
  }
  
  // Fall back to first strong/bold text
  const strong = doc.querySelector('strong, b');
  if (strong && strong.textContent.trim()) {
    return strong.textContent.trim().substring(0, 50);
  }
  
  // Last resort: first text content over 10 chars
  const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent.trim();
    if (text.length > 10) {
      return text.substring(0, 50);
    }
  }
  
  return null;
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
  }
  
  startRefresh(total) {
    this.totalComponents = total;
    this.completedCount = 0;
    this.successCount = 0;
    this.createToast();
  }
  
  updateProgress(componentName, needsActiveTab = false) {
    this.currentComponent = componentName;
    
    if (!this.toast) this.createToast();
    
    // Update progress section
    const progressText = this.completedCount > 0 
      ? `✓ ${this.successCount}/${this.totalComponents} refreshed`
      : `Refreshing ${this.totalComponents} components...`;
    
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
  
  finishAll() {
    this.hideToast();
    this.showSuccessToast();
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
  
  showSuccessToast() {
    const allSuccess = this.successCount === this.totalComponents;
    const message = allSuccess 
      ? `All ${this.totalComponents} components refreshed! 👍🏼`
      : `${this.successCount}/${this.totalComponents} refreshed successfully`;
    
    const successToast = document.createElement('div');
    successToast.className = 'refresh-toast refresh-toast--success';
    
    successToast.innerHTML = `
      <div class="refresh-toast__content">
        <svg class="refresh-toast__icon" viewBox="0 0 24 24" width="24" height="24">
          <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div class="refresh-toast__text">
          <div class="refresh-toast__title">You're back! ${message}</div>
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

// Check if URL will need active tab (known problematic sites)
function willNeedActiveTab(url) {
  const problematicDomains = ['hotukdeals.com'];
  return problematicDomains.some(domain => url.includes(domain));
}

/**
 * Tab-based refresh for JS-heavy sites
 * Opens a background tab, waits for JS to load, extracts content
 */
async function tabBasedRefresh(url, selector) {
  try {
    // ATTEMPT 1: Try background tab with visibility spoof
    const result = await tryBackgroundWithSpoof(url, selector);
    if (result) return result;
    
    // ATTEMPT 2: Fallback to active tab (guaranteed to work)
    const fallbackResult = await tryActiveTab(url, selector);
    if (fallbackResult) return fallbackResult;
    
    return null;
  } catch (error) {
    console.error('Tab refresh failed:', error);
    return null;
  }
}

/**
 * Handle consent/cookie dialogs automatically
 * Returns true if consent was handled, false if none found
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

// Try background tab with visibility spoof (seamless, no flash)
async function tryBackgroundWithSpoof(url, selector) {
  const tab = await chrome.tabs.create({ url, active: false });
  
  console.log(`🔍 [Background] Starting refresh for selector: ${selector}`);
  console.log(`🔍 [Background] URL: ${url}`);
  
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
    
    // ✨ NEW: Handle consent dialog if present
    const consentResult = await handleConsentDialog(tab.id);
    if (consentResult.found) {
      console.log(`✓ [Background] Consent dialog ${consentResult.action}`);
      await new Promise(r => setTimeout(r, 3000));
      console.log(`✓ [Background] Post-consent 3s wait complete`);
    } else {
      console.log(`✓ [Background] No consent dialog detected`);
    }
    
    // DEBUG: Check page state before extraction
    const pageState = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sel) => {
        const element = document.querySelector(sel);
        return {
          selectorFound: !!element,
          elementHTML: element ? element.outerHTML.substring(0, 200) : null,
          elementLength: element ? element.outerHTML.length : 0,
          bodyLength: document.body.innerHTML.length,
          title: document.title,
          readyState: document.readyState,
          // Check for common loading indicators
          hasLoadingClass: document.body.className.includes('loading'),
          hasSkeletonElements: document.querySelectorAll('[class*="skeleton"]').length
        };
      },
      args: [selector]
    });
    
    console.log(`🔍 [Background] Page state:`, pageState[0]?.result);
    
    // Wait additional time for JS to fully load (complex sites)
    await new Promise(r => setTimeout(r, 3000));
    console.log(`✓ [Background] Additional 3s wait complete (total ~8s)`);
    
    // Try to extract
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [selector],
      func: (sel) => document.querySelector(sel)?.outerHTML || null
    });
    
    const html = results[0]?.result;
    
    if (html) {
      console.log(`✅ [Background] Extracted HTML: ${html.length} chars`);
      console.log(`🔍 [Background] First 200 chars: ${html.substring(0, 200)}`);
    } else {
      console.log(`❌ [Background] Extraction failed - selector not found`);
    }
    
    await chrome.tabs.remove(tab.id);
    return html;
    
  } catch (error) {
    console.error(`❌ [Background] Error:`, error);
    try { await chrome.tabs.remove(tab.id); } catch (e) {}
    return null;
  }
}

// Fallback: Active tab (flashes briefly but guaranteed to work)
async function tryActiveTab(url, selector) {
  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = await chrome.tabs.create({ url, active: true });
  
  console.log(`🔍 [Active Tab] Starting refresh for selector: ${selector}`);
  console.log(`🔍 [Active Tab] URL: ${url}`);
  
  try {
    // Wait 2s for initial page load
    await new Promise(r => setTimeout(r, 2000));
    console.log(`✓ [Active Tab] Initial 2s wait complete`);
    
    // ✨ NEW: Handle consent dialog if present
    const consentResult = await handleConsentDialog(tab.id);
    if (consentResult.found) {
      console.log(`✓ [Active Tab] Consent dialog ${consentResult.action}`);
      await new Promise(r => setTimeout(r, 2000));
      console.log(`✓ [Active Tab] Post-consent 2s wait complete`);
    } else {
      console.log(`✓ [Active Tab] No consent dialog detected`);
    }
    
    // DEBUG: Check page state before final wait
    const pageStateBefore = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sel) => {
        const element = document.querySelector(sel);
        return {
          selectorFound: !!element,
          elementLength: element ? element.outerHTML.length : 0,
          bodyLength: document.body.innerHTML.length,
          title: document.title,
          readyState: document.readyState
        };
      },
      args: [selector]
    });
    
    console.log(`🔍 [Active Tab] Page state (before final wait):`, pageStateBefore[0]?.result);
    
    // Wait for JS to load
    await new Promise(r => setTimeout(r, 3000));
    console.log(`✓ [Active Tab] Additional 3s wait complete (total ~7s)`);
    
    // DEBUG: Check if content changed during wait
    const pageStateAfter = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sel) => {
        const element = document.querySelector(sel);
        return {
          selectorFound: !!element,
          elementLength: element ? element.outerHTML.length : 0,
          hasSkeletonElements: document.querySelectorAll('[class*="skeleton"]').length
        };
      },
      args: [selector]
    });
    
    console.log(`🔍 [Active Tab] Page state (after final wait):`, pageStateAfter[0]?.result);
    
    // Extract
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [selector],
      func: (sel) => document.querySelector(sel)?.outerHTML || null
    });
    
    const html = results[0]?.result;
    
    if (html) {
      console.log(`✅ [Active Tab] Extracted HTML: ${html.length} chars`);
      console.log(`🔍 [Active Tab] First 200 chars: ${html.substring(0, 200)}`);
    } else {
      console.log(`❌ [Active Tab] Extraction failed - selector not found`);
    }
    
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

async function refreshComponent(component) {
  try {
    
    // Fetch fresh HTML from the source URL
    const response = await fetch(component.url);
    
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
    if (component.selector && !['div', 'section', 'article', 'main', 'aside', 'header', 'footer', 'nav'].includes(component.selector.toLowerCase())) {
      const element = doc.querySelector(component.selector);
      if (element) {
        extractedHtml = element.outerHTML;
        
        // Check if we got a skeleton/loading placeholder instead of real content
        const isSkeletonContent = extractedHtml.includes('class="skeleton') || 
                                   extractedHtml.includes('skeleton-color') ||
                                   extractedHtml.includes('loading-placeholder') ||
                                   (extractedHtml.match(/skeleton/gi) || []).length > 2;
        
        if (isSkeletonContent) {
          
          // Try tab-based refresh as fallback
          const tabHtml = await tabBasedRefresh(component.url, component.selector);
          
          if (tabHtml) {
            // Verify we got the right element by checking fingerprint
            const originalFingerprint = extractFingerprint(component.html_cache);
            
            if (originalFingerprint && !tabHtml.toLowerCase().includes(originalFingerprint.toLowerCase())) {
              return {
                success: false,
                error: 'Tab refresh returned different element',
                keepOriginal: true
              };
            }
            
            // Tab refresh worked and verified!
            return {
              success: true,
              html_cache: cleanupDuplicates(tabHtml),
              last_refresh: new Date().toISOString(),
              status: 'active'
            };
          }
          
          // Tab refresh also failed - keep original
          return {
            success: false,
            error: 'Page returned skeleton content (JS not loaded)',
            keepOriginal: true
          };
        }
      } else {
        // Selector not found in fetched HTML - try tab-based refresh
        const tabHtml = await tabBasedRefresh(component.url, component.selector);
        
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
          return {
            success: true,
            html_cache: cleanupDuplicates(tabHtml),
            last_refresh: new Date().toISOString(),
            status: 'active'
          };
        }
      }
    } else {
      // Generic selector - skip extraction
    }
    
    // If extraction failed, DON'T use the full page - keep original HTML
    if (!extractedHtml) {
      return {
        success: false,
        error: 'Cannot extract component - selector too generic or not found',
        keepOriginal: true
      };
    }
    
    return {
      success: true,
      html_cache: cleanupDuplicates(extractedHtml),
      last_refresh: new Date().toISOString(),
      status: 'active'
    };
    
  } catch (error) {
    console.error(`❌ Failed to refresh ${component.name}:`, error);
    return {
      success: false,
      error: error.message,
      status: 'error'
    };
  }
}

async function refreshAll() {
  const btn = document.getElementById('refresh-all-btn');
  
  // Show loading state on button
  btn.disabled = true;
  btn.textContent = '⏳ Refreshing...';
  btn.style.background = '#6c757d';
  
  try {
    // Get components from hybrid storage (sync metadata + local data)
    const syncResult = await new Promise(resolve => {
      chrome.storage.sync.get(['components'], resolve);
    });
    
    const localResult = await new Promise(resolve => {
      chrome.storage.local.get(['componentsData'], resolve);
    });
    
    const metadata = syncResult.components || [];
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
    
    // Start toast with total count
    toastManager.startRefresh(components.length);
    
    // Refresh components sequentially for better UX feedback
    const results = [];
    for (let i = 0; i < components.length; i++) {
      const comp = components[i];
      const displayName = comp.customLabel || comp.name;
      const needsActiveTab = willNeedActiveTab(comp.url);
      
      // Update toast to show current component
      toastManager.updateProgress(displayName, needsActiveTab);
      
      // Do the refresh
      const refreshResult = await refreshComponent(comp);
      results.push(refreshResult);
      
      // Mark this component as complete
      toastManager.completeComponent(refreshResult.success);
    }
    
    // Update components with new data (split between sync and local storage)
    const updatedMetadata = [];
    const updatedLocalData = {};
    
    components.forEach((comp, index) => {
      const result = results[index];
      
      // Always save metadata to sync (includes selector for cross-device refresh)
      updatedMetadata.push({
        id: comp.id,
        name: comp.name,
        url: comp.url,
        favicon: comp.favicon,
        customLabel: comp.customLabel,
        selector: comp.selector
      });
      
      // Save full data to local
      if (result.success) {
        updatedLocalData[comp.id] = {
          selector: comp.selector,
          html_cache: result.html_cache,
          last_refresh: result.last_refresh
        };
      } else {
        // Keep existing data if refresh failed
        updatedLocalData[comp.id] = {
          selector: comp.selector,
          html_cache: comp.html_cache,
          last_refresh: comp.last_refresh
        };
      }
    });
    
    // Save to both storages
    await new Promise(resolve => {
      chrome.storage.sync.set({ components: updatedMetadata }, resolve);
    });
    
    await new Promise(resolve => {
      chrome.storage.local.set({ componentsData: updatedLocalData }, resolve);
    });
    
    // Show success toast
    toastManager.finishAll();
    
    // Log summary to console (minimal)
    const successCount = results.filter(r => r.success).length;
    console.log(`Refresh complete: ${successCount}/${results.length}`);
    
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

// Attach refresh handler when page loads
document.addEventListener('DOMContentLoaded', () => {
  const refreshBtn = document.getElementById('refresh-all-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshAll);
  }
});
  
// Board name editing functionality
const boardNameElement = document.getElementById('board-name');
if (boardNameElement) {
  // Load saved board name
  chrome.storage.sync.get(['boardName'], (result) => {
    if (result.boardName) {
      boardNameElement.textContent = result.boardName;
    }
  });
  
  // Make it editable on click
  boardNameElement.addEventListener('click', () => {
    const currentName = boardNameElement.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.style.cssText = 'font-size: inherit; font-weight: inherit; padding: 2px 6px; border: 2px solid #667eea; border-radius: 4px; background: white;';
    
    boardNameElement.replaceWith(input);
    input.focus();
    input.select();
    
    const saveName = () => {
      const newName = input.value.trim() || 'My Dashboard';
      input.replaceWith(boardNameElement);
      boardNameElement.textContent = newName;
      
      // Save to storage
      chrome.storage.sync.set({ boardName: newName });
    };
    
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') saveName();
    });
    input.addEventListener('blur', saveName);
  });
  
  // Hover effect
  boardNameElement.addEventListener('mouseenter', () => {
    boardNameElement.style.background = 'rgba(102, 126, 234, 0.1)';
  });
  boardNameElement.addEventListener('mouseleave', () => {
    boardNameElement.style.background = '';
  });
}
