/**
 * SpotBoard Dashboard - Main UI Controller
 * 
 * Dependencies (must be loaded before this file):
 * - utils/dom-cleanup.js
 * - utils/fingerprint.js  
 * - utils/refresh-engine.js
 */

// NEW: Migration helper - converts old array format to per-component keys
async function migrateStorageIfNeeded() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(null, (syncData) => {
      // Check if old format exists (components array)
      if (syncData.components && Array.isArray(syncData.components)) {
        const oldComponents = syncData.components;
        const newFormat = {};
        
        // Convert array to per-component keys
        oldComponents.forEach(comp => {
          const key = `comp-${comp.id}`;
          newFormat[key] = {
            id: comp.id,
            name: comp.name,
            url: comp.url,
            favicon: comp.favicon,
            customLabel: comp.customLabel,
            selector: comp.selector,
            excludedSelectors: comp.excludedSelectors || [],
            headingFingerprint: comp.headingFingerprint,
            positionBased: comp.positionBased || false, // 🎯 BATCH 5: Ensure field exists for old captures
            refreshPaused: comp.refreshPaused || false, // Preserve pause state
            last_refresh: comp.last_refresh // IMPORTANT: Preserve timestamps!
          };
        });
        
        // Backup before migration (safety measure)
        chrome.storage.local.set({ 
          'backup-pre-migration': JSON.stringify(syncData) 
        }, () => {
          // Save new format and remove old
          chrome.storage.sync.set(newFormat, () => {
            chrome.storage.sync.remove('components', () => {
              resolve(newFormat);
            });
          });
        });
      } else {
        // Already new format or empty
        resolve(syncData);
      }
    });
  });
}

// NEW: Data integrity validation - checks for issues in stored components
async function validateStorageFormat() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(null, (syncData) => {
      let issues = [];
      let totalSize = 0;
      
      Object.keys(syncData).forEach(key => {
        if (!key.startsWith('comp-')) return; // Skip non-component keys
        
        const comp = syncData[key];
        const size = JSON.stringify(comp).length;
        totalSize += size;
        
        // Check required fields
        if (!comp.id) issues.push(`${key}: missing id`);
        if (!comp.selector) issues.push(`${key}: missing selector`);
        
        // Check size (8KB = 8192 bytes, warn at 7500)
        if (size > 7500) issues.push(`${key}: size ${size} bytes (approaching 8KB limit!)`);
        
        // Check excludedSelectors is array
        if (comp.excludedSelectors && !Array.isArray(comp.excludedSelectors)) {
          issues.push(`${key}: excludedSelectors not array`);
        }
      });
      
      if (issues.length === 0) {
        resolve({ valid: true, issues: [] });
      } else {
        console.warn('⚠️ Issues found:', issues);
        resolve({ valid: false, issues });
      }
    });
  });
}

// NEW: Load components from per-key format
function loadComponentsFromSync() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(null, (syncData) => {
      const components = [];
      
      // Extract all comp-* keys
      Object.keys(syncData).forEach(key => {
        if (key.startsWith('comp-')) {
          components.push(syncData[key]);
        }
      });
      
      resolve(components);
    });
  });
}

// Load and display components from hybrid storage (sync metadata + local data)
(async () => {
  try {
    // Step 1: Run migration if needed (old format → new format)
    await migrateStorageIfNeeded();
    
    // Step 2: Validate storage integrity
    const validation = await validateStorageFormat();
    if (!validation.valid) {
      console.error('⚠️ Storage validation failed:', validation.issues);
    }
    
    // Step 3: Load component metadata from sync storage
    const metadata = await loadComponentsFromSync();
    
    // GA4: Track welcome_viewed for first-time users
    const { hasSeenWelcome } = await chrome.storage.local.get('hasSeenWelcome');
    if (!hasSeenWelcome && window.GA4 && window.GA4.sendEvent) {
      window.GA4.sendEvent('welcome_viewed', {
        has_components: metadata.length > 0
      });
      await chrome.storage.local.set({ hasSeenWelcome: true });
    }
  
    // Step 4: Load component data from local storage
    const localResult = await new Promise(resolve => {
      chrome.storage.local.get(['componentsData'], resolve);
    });
    const localData = localResult.componentsData || {};
    
    const container = document.getElementById('components-container');
    
    // Step 5: Merge sync metadata with local HTML data by ID
  const components = metadata.map(meta => ({
    ...meta,
    ...localData[meta.id] // Add html_cache from local storage
  }));
  
    // 📊 GA4: Track board opened/refreshed with intelligent detection
  const isReloadFromRefresh = sessionStorage.getItem('reloadFromRefresh');
  sessionStorage.removeItem('reloadFromRefresh'); // Clear flag immediately
  
  if (!isReloadFromRefresh) {
    // Detect navigation type using Performance API
    const navigationType = performance.getEntriesByType('navigation')[0]?.type;
    const sessionActive = sessionStorage.getItem('dashboard_session_active');
    
    const stats = await getBoardStats();
    
    // Fresh navigation (not reload) AND (new session OR explicit navigate)
    if (navigationType !== 'reload' && !sessionActive) {
      const boardOpens7d = await GA4.incrementRollingMetric('board_opens');
      
      sendEvent('board_opened', {
        total_cards: stats.total,
        active_cards: stats.active,
        paused_card_rate_pct: stats.pausedRate,
        board_opens_7days: boardOpens7d
      });
    } 
    // Manual reload (F5/Ctrl+R) - track separately
    else if (navigationType === 'reload') {
      sendEvent('board_refreshed', {
        total_cards: stats.total,
        active_cards: stats.active,
        refresh_method: 'manual_reload'
      });
    }
    
    // Mark session as active (cleared on tab close)
    sessionStorage.setItem('dashboard_session_active', 'true');
  }
  
    // Inject CSS cleanup for whitespace compression
    injectCleanupCSS();
  
    if (components.length === 0) {
      // Show empty state (hidden by default in CSS to prevent flash)
      const emptyState = container.querySelector('.empty-state');
      if (emptyState) emptyState.style.display = 'block';
      return;
    }
  
    // Build grid
    container.innerHTML = '<div class="components-grid"></div>';
    const grid = container.querySelector('.components-grid');
  
    components.forEach((component, index) => {
      const card = document.createElement('div');
      card.className = `component-card${component.refreshPaused ? ' paused' : ''}`;
      
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
            <span class="info-icon" style="cursor: pointer; margin-left: 4px; display: inline-flex; align-items: center;" title="Click for details">
              <svg width="16" height="16" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                <circle fill="#2196F3" cx="24" cy="24" r="21"/>
                <rect x="22" y="22" fill="#ffffff" width="4" height="11"/>
                <circle fill="#ffffff" cx="24" cy="16.5" r="2.5"/>
              </svg>
            </span>
          </div>
          <button class="pause-btn" style="padding: 2px; background: transparent; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; margin-left: 8px; flex-shrink: 0; transition: all 0.2s;" title="${component.refreshPaused ? 'Resume refresh' : 'Pause refresh'}">
            ${component.refreshPaused 
              ? '<svg width="18" height="18" viewBox="0 0 330 330" xmlns="http://www.w3.org/2000/svg"><path d="M315,0H15C6.716,0,0,6.716,0,15v300c0,8.284,6.716,15,15,15h300c8.284,0,15-6.716,15-15V15C330,6.716,323.284,0,315,0z M300,300H30V30h270V300z"/><path d="M194.25,247.5c8.284,0,15-6.716,15-15v-135c0-8.284-6.716-15-15-15c-8.284,0-15,6.716-15,15v135C179.25,240.784,185.966,247.5,194.25,247.5z"/><path d="M135.75,247.5c8.284,0,15-6.716,15-15v-135c0-8.284-6.716-15-15-15s-15,6.716-15,15v135C120.75,240.784,127.466,247.5,135.75,247.5z"/></svg>'
              : '<svg width="18" height="18" viewBox="0 0 330 330" xmlns="http://www.w3.org/2000/svg"><path d="M315,0H15C6.716,0,0,6.716,0,15v300c0,8.284,6.716,15,15,15h300c8.284,0,15-6.716,15-15V15C330,6.716,323.284,0,315,0z M300,300H30V30h270V300z"/><path d="M113.729,245.62c2.266,1.256,4.77,1.88,7.271,1.88c2.763,0,5.523-0.763,7.95-2.28l108-67.499c4.386-2.741,7.05-7.548,7.05-12.72c0-5.172-2.664-9.979-7.05-12.72l-108-67.501c-4.623-2.891-10.453-3.043-15.222-0.4C108.959,87.024,106,92.047,106,97.5v135C106,237.953,108.959,242.976,113.729,245.62z"/></svg>'
            }
          </button>
          <button class="delete-btn" style="padding: 4px 10px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; margin-left: 8px; flex-shrink: 0;">Delete</button>
        </div>
        <div class="component-content" style="margin-top: 0; padding: 12px; background: #ffffff; border-radius: 0 0 6px 6px; max-height: 300px; overflow: auto;">
          ${cleanupDuplicates(component.html_cache) || '<div style="color: #6c757d; text-align: center; padding: 20px;"><div style="font-size: 18px; margin-bottom: 8px;">📭</div><div style="font-weight: 600; margin-bottom: 4px;">No content yet</div><div style="font-size: 13px;">Click "Refresh All" to fetch latest content</div></div>'}
        </div>
      `;
      
      // Fix relative URLs to absolute
      const contentDiv = card.querySelector('.component-content');
      if (contentDiv && component.url) {
        fixRelativeUrls(contentDiv, component.url);
        // Force remove all cursor styles
        removeCursorStyles(contentDiv);
        
        // GA4: Track component clicks (when user clicks card content to visit source)
        contentDiv.addEventListener('click', (e) => {
          // Only track if clicking a link or the content itself (not buttons)
          if (e.target.closest('a') || e.target === contentDiv || contentDiv.contains(e.target)) {
            const cardAgeDays = Math.floor((Date.now() - new Date(component.created_at || component.last_refresh || Date.now()).getTime()) / (1000 * 60 * 60 * 24));
            sendEvent('component_clicked', {
              url_domain: new URL(component.url).hostname,
              card_age_days: cardAgeDays
            });
          }
        });
      }
      
      // Pause/Resume functionality
      const pauseBtn = card.querySelector('.pause-btn');
      pauseBtn.addEventListener('click', async () => {
        // Toggle pause state
        component.refreshPaused = !component.refreshPaused;
        
        // Update button UI with SVG swap (rounded square versions)
        pauseBtn.innerHTML = component.refreshPaused 
          ? '<svg width="18" height="18" viewBox="0 0 330 330" xmlns="http://www.w3.org/2000/svg"><path d="M315,0H15C6.716,0,0,6.716,0,15v300c0,8.284,6.716,15,15,15h300c8.284,0,15-6.716,15-15V15C330,6.716,323.284,0,315,0z M300,300H30V30h270V300z"/><path d="M194.25,247.5c8.284,0,15-6.716,15-15v-135c0-8.284-6.716-15-15-15c-8.284,0-15,6.716-15,15v135C179.25,240.784,185.966,247.5,194.25,247.5z"/><path d="M135.75,247.5c8.284,0,15-6.716,15-15v-135c0-8.284-6.716-15-15-15s-15,6.716-15,15v135C120.75,240.784,127.466,247.5,135.75,247.5z"/></svg>'
          : '<svg width="18" height="18" viewBox="0 0 330 330" xmlns="http://www.w3.org/2000/svg"><path d="M315,0H15C6.716,0,0,6.716,0,15v300c0,8.284,6.716,15,15,15h300c8.284,0,15-6.716,15-15V15C330,6.716,323.284,0,315,0z M300,300H30V30h270V300z"/><path d="M113.729,245.62c2.266,1.256,4.77,1.88,7.271,1.88c2.763,0,5.523-0.763,7.95-2.28l108-67.499c4.386-2.741,7.05-7.548,7.05-12.72c0-5.172-2.664-9.979-7.05-12.72l-108-67.501c-4.623-2.891-10.453-3.043-15.222-0.4C108.959,87.024,106,92.047,106,97.5v135C106,237.953,108.959,242.976,113.729,245.62z"/></svg>';
        pauseBtn.title = component.refreshPaused ? 'Resume refresh' : 'Pause refresh';
        
        // Update card opacity
        if (component.refreshPaused) {
          card.classList.add('paused');
        } else {
          card.classList.remove('paused');
        }
        
        // Save to sync storage
        chrome.storage.sync.get(`comp-${component.id}`, (result) => {
          const compData = result[`comp-${component.id}`];
          if (compData) {
            compData.refreshPaused = component.refreshPaused;
            chrome.storage.sync.set({ [`comp-${component.id}`]: compData });
          }
        });
        
        // Show toast notification
        showToast(
          component.refreshPaused ? 'Paused' : 'Resumed',
          component.refreshPaused 
            ? `"${component.customLabel || component.name}" won't refresh` 
            : `"${component.customLabel || component.name}" will refresh`,
          component.refreshPaused ? 'info' : 'success'
        );
      });
      
      // Delete functionality
      const deleteBtn = card.querySelector('.delete-btn');
      deleteBtn.addEventListener('click', () => {
        if (confirm(`Delete "${component.customLabel || component.name}"? This cannot be undone.`)) {
          // GA4: Track component deletion
          const cardAgeDays = Math.floor((Date.now() - new Date(component.created_at || component.last_refresh || Date.now()).getTime()) / (1000 * 60 * 60 * 24));
          sendEvent('component_deleted', {
            url_domain: new URL(component.url).hostname,
            card_age_days: cardAgeDays
          });
          
          // Remove from in-memory array FIRST so subsequent deletes work correctly
          const componentId = component.id;
          const updated = components.filter(c => c.id !== componentId);
          
          // Update the components array in place for subsequent deletes
          components.length = 0;
          components.push(...updated);
          
          // Delete from sync storage (remove the component's key)
          chrome.storage.sync.remove(`comp-${componentId}`);
          
          // Update local storage (remove HTML data)
          chrome.storage.local.get(['componentsData'], (result) => {
            const localData = result.componentsData || {};
            delete localData[componentId];
            chrome.storage.local.set({ componentsData: localData });
          });
          
          // Remove card from DOM
          card.remove();
          
          // Show empty state if no components left
          if (updated.length === 0) {
            container.innerHTML = `
              <div class="empty-state" style="display: block;">
                <!-- Main headline -->
                <h2 style="font-size: 26px; font-weight: 600; color: #1a1a1a; margin-bottom: 12px;">Your board is empty</h2>
                <p style="font-size: 18px; color: #5f6368; margin-bottom: 24px;">Here's what others track:</p>
                
                <!-- Categories -->
                <div style="text-align: left; max-width: 500px; margin: 0 auto;">
                  <!-- News -->
                  <div style="margin-bottom: 16px;">
                    <div style="font-size: 18px; font-weight: 600; color: #1a1a1a; margin-bottom: 4px;">📰 News & Headlines</div>
                    <div style="font-size: 17px; color: #5f6368;">
                      <a href="https://bbc.co.uk/news" target="_blank" style="color: #1a73e8; text-decoration: none;">BBC</a> · 
                      <a href="https://nbcnews.com" target="_blank" style="color: #1a73e8; text-decoration: none;">NBC News</a> · 
                      <a href="https://techcrunch.com" target="_blank" style="color: #1a73e8; text-decoration: none;">TechCrunch</a>
                    </div>
                  </div>
                  
                  <!-- Sports -->
                  <div style="margin-bottom: 16px;">
                    <div style="font-size: 18px; font-weight: 600; color: #1a1a1a; margin-bottom: 4px;">🏆 Sports Scores</div>
                    <div style="font-size: 17px; color: #5f6368;">
                      <a href="https://espn.com" target="_blank" style="color: #1a73e8; text-decoration: none;">ESPN</a> · 
                      <a href="https://skysports.com" target="_blank" style="color: #1a73e8; text-decoration: none;">Sky Sports</a> · 
                      <a href="https://as.com" target="_blank" style="color: #1a73e8; text-decoration: none;">AS</a>
                    </div>
                  </div>
                  
                  <!-- Tech -->
                  <div style="margin-bottom: 16px;">
                    <div style="font-size: 18px; font-weight: 600; color: #1a1a1a; margin-bottom: 4px;">🚀 Tech News & Launches</div>
                    <div style="font-size: 17px; color: #5f6368;">
                      <a href="https://producthunt.com" target="_blank" style="color: #1a73e8; text-decoration: none;">Product Hunt</a> · 
                      <a href="https://github.com" target="_blank" style="color: #1a73e8; text-decoration: none;">GitHub</a> · 
                      <a href="https://wired.com" target="_blank" style="color: #1a73e8; text-decoration: none;">Wired</a>
                    </div>
                  </div>
                  
                  <!-- Deals -->
                  <div style="margin-bottom: 16px;">
                    <div style="font-size: 18px; font-weight: 600; color: #1a1a1a; margin-bottom: 4px;">🛍️ Daily Deals</div>
                    <div style="font-size: 17px; color: #5f6368;">
                      <a href="https://amazon.co.uk" target="_blank" style="color: #1a73e8; text-decoration: none;">Amazon</a> · 
                      <a href="https://gumtree.com" target="_blank" style="color: #1a73e8; text-decoration: none;">Gumtree</a> · 
                      <a href="https://hotukdeals.com" target="_blank" style="color: #1a73e8; text-decoration: none;">HotUKDeals</a>
                    </div>
                  </div>
                  
                  <!-- Weather -->
                  <div style="margin-bottom: 24px;">
                    <div style="font-size: 18px; font-weight: 600; color: #1a1a1a; margin-bottom: 4px;">🌦️ Weather Forecast</div>
                    <div style="font-size: 17px; color: #5f6368;">
                      <a href="https://accuweather.com" target="_blank" style="color: #1a73e8; text-decoration: none;">AccuWeather</a> · 
                      <a href="https://yr.no" target="_blank" style="color: #1a73e8; text-decoration: none;">YR.no</a> · 
                      <a href="https://theweathernetwork.com" target="_blank" style="color: #1a73e8; text-decoration: none;">Weather Network</a>
                    </div>
                  </div>
                </div>
                
                <!-- Help tip -->
                <p style="font-size: 18px; color: #5f6368; margin-top: 16px;">
                  💡 <strong>Need help?</strong> Click the ℹ️ button in the top bar anytime to see how to capture.
                </p>
              </div>
            `;
          }
        }
      });
      
      // Editable title functionality
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
        
        let saved = false; // Flag to prevent double-save
        
        const saveLabel = () => {
          // Guard: prevent double-execution (Enter key + blur event)
          if (saved) return;
          saved = true;
          
          const newLabel = input.value.trim();
          
          // Restore title element
          input.replaceWith(titleElement);
          titleElement.style.background = '';
          
          if (newLabel && newLabel !== currentLabel) {
            // Update component in array
            component.customLabel = newLabel;
            titleElement.textContent = newLabel;
            
            // Save metadata to sync storage (update only this component)
            chrome.storage.sync.get(`comp-${component.id}`, (result) => {
              const compData = result[`comp-${component.id}`];
              if (compData) {
                compData.customLabel = newLabel;
                chrome.storage.sync.set({ [`comp-${component.id}`]: compData });
              } else {
                console.warn('⚠️ Component not found in sync storage:', component.id);
              }
            });
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
      
      // Info icon click handler
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
                 title="${component.url || 'No URL'}"
                 style="color: #63b3ed; text-decoration: none; display: block; padding: 8px; background: rgba(255, 255, 255, 0.1); border-radius: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${component.url || 'No URL'}
              </a>
            </div>
            <div style="margin-bottom: 12px;">
              <div style="font-weight: 600; margin-bottom: 4px;">Last updated:</div>
              <div style="color: #cbd5e0;">${timestampText}</div>
            </div>
            <div style="margin-bottom: 20px;">
              <div style="font-weight: 600; margin-bottom: 4px;">Capture method:</div>
              <div style="color: #cbd5e0;">${component.positionBased ? 'Position-based' : 'Header-based'}</div>
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
  } catch (error) {
    console.error('❌ Error loading components:', error);
    container.innerHTML = `
      <div class="empty-state">
        <h2>Error loading components</h2>
        <p>Please refresh the page. If the issue persists, check the console for details.</p>
      </div>
    `;
  }
})(); // Close async IIFE

// 📊 GA4: Clear session flag on tab close (for board_opened tracking)
window.addEventListener('beforeunload', () => {
  sessionStorage.removeItem('dashboard_session_active');
});

// 🎯 BATCH 1.5: Auto-refresh dashboard when new components captured
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync') {
    // Check if a new comp-* key was added (new component captured)
    for (const key in changes) {
      if (key.startsWith('comp-') && !changes[key].oldValue && changes[key].newValue) {
        location.reload();
        return; // Only reload once
      }
    }
  }
});

// Attach refresh handler when page loads
document.addEventListener('DOMContentLoaded', () => {
  const refreshBtn = document.getElementById('refresh-all-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshAll);
  }
});

// Simple toast notification for pause/resume
function showToast(title, message, type = 'info') {
  // Remove any existing toast
  const existingToast = document.querySelector('.simple-toast');
  if (existingToast) {
    existingToast.remove();
  }
  
  // Create toast element
  const toast = document.createElement('div');
  toast.className = `simple-toast simple-toast--${type}`;
  toast.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <div style="display: flex; align-items: center;">
        ${type === 'success' 
          ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21"/></svg>'
          : type === 'info' 
          ? '<svg width="20" height="20" viewBox="0 0 330 330" fill="white"><path d="M315,0H15C6.716,0,0,6.716,0,15v300c0,8.284,6.716,15,15,15h300c8.284,0,15-6.716,15-15V15C330,6.716,323.284,0,315,0z M300,300H30V30h270V300z"/><path d="M194.25,247.5c8.284,0,15-6.716,15-15v-135c0-8.284-6.716-15-15-15c-8.284,0-15,6.716-15,15v135C179.25,240.784,185.966,247.5,194.25,247.5z"/><path d="M135.75,247.5c8.284,0,15-6.716,15-15v-135c0-8.284-6.716-15-15-15s-15,6.716-15,15v135C120.75,240.784,127.466,247.5,135.75,247.5z"/></svg>'
          : '<svg width="20" height="20" viewBox="0 0 48 48"><circle fill="#2196F3" cx="24" cy="24" r="21"/><rect x="22" y="22" fill="#ffffff" width="4" height="11"/><circle fill="#ffffff" cx="24" cy="16.5" r="2.5"/></svg>'
        }
      </div>
      <div style="flex: 1;">
        <div style="font-weight: 600; margin-bottom: 2px;">${title}</div>
        <div style="font-size: 13px; opacity: 0.9;">${message}</div>
      </div>
    </div>
  `;
  
  // Add toast styles
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: ${type === 'success' ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.95) 0%, rgba(22, 163, 74, 0.95) 100%)' : 
                 type === 'info' ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.95) 0%, rgba(37, 99, 235, 0.95) 100%)' :
                 'linear-gradient(135deg, rgba(25, 35, 55, 0.95) 0%, rgba(35, 45, 65, 0.95) 100%)'};
    color: white;
    padding: 16px 20px;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 20, 60, 0.3);
    z-index: 10000;
    animation: slideInCool 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    max-width: 380px;
  `;
  
  document.body.appendChild(toast);
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    toast.style.animation = 'slideOutCool 0.3s ease-in';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

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

// ===== WELCOME MODAL LOGIC =====
// Show tutorial modal on first visit or when (?) info button clicked

const welcomeModal = document.getElementById('welcome-modal');
const gotItBtn = document.getElementById('got-it-btn');
const infoBtn = document.getElementById('info-btn');

// Check if this is first visit
const hasSeenWelcome = localStorage.getItem('hasSeenWelcome');

if (!hasSeenWelcome) {
  // First visit - show modal
  welcomeModal.style.display = 'flex';
}

// "Got it" button - dismiss modal and mark as seen
if (gotItBtn) {
  gotItBtn.addEventListener('click', () => {
    welcomeModal.style.display = 'none';
    localStorage.setItem('hasSeenWelcome', 'true');
  });
}

// (?) Info button - reopen modal
if (infoBtn) {
  infoBtn.addEventListener('click', () => {
    welcomeModal.style.display = 'flex';
  });
}

// ===== ROLLING WINDOW TRACKING HELPER =====
// Stores timestamp arrays instead of counters
// Survives version updates because localStorage persists
// Provides TRUE rolling 7-day windows (no artificial resets)
function addEventTimestamp(storageKey, maxAge = 30) {
  const raw = localStorage.getItem(storageKey) || '[]';
  const timestamps = JSON.parse(raw);
  
  // Add current timestamp
  timestamps.push(Date.now());
  
  // Clean up old timestamps (keep last 30 days max for storage efficiency)
  const cutoff = Date.now() - (maxAge * 24 * 60 * 60 * 1000);
  const cleaned = timestamps.filter(t => t > cutoff);
  
  localStorage.setItem(storageKey, JSON.stringify(cleaned));
  
  // Calculate last 7 days for logging
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const count7d = cleaned.filter(t => t > sevenDaysAgo).length;
  
  return count7d;
}

// ===== BOARD OPENS COUNTER (Batch 3 - ROLLING WINDOW) =====
// Track dashboard visits using timestamp array
// Survives version updates ✅ No artificial resets ✅
function trackBoardOpen() {
  const count = addEventTimestamp('board_open_timestamps');
  // Board open tracking (no console spam)
}

// Call immediately when dashboard loads
trackBoardOpen();

// ===== GA4 TEST EVENT (Batch 1) =====
// ===== REFRESH CLICKS COUNTER (Batch 4 - ROLLING WINDOW) =====
// Track "Refresh All" clicks using timestamp array  
// Survives version updates ✅ No artificial resets ✅
async function trackRefreshClick() {
  const count = addEventTimestamp('refresh_click_timestamps');
  // Refresh click tracking (no console spam)
  
  // GA4: Track every refresh click (Batch 4 core loop event)
  try {
    if (window.GA4 && window.GA4.getBoardStats && window.GA4.sendEvent && window.GA4.incrementRollingMetric) {
      const stats = await window.GA4.getBoardStats();
      const refreshClicks7d = await window.GA4.incrementRollingMetric('refresh_clicks');
      
      window.GA4.sendEvent('refresh_clicked', {
        total_cards: stats.total,
        active_cards: stats.active,
        refresh_clicks_7days: refreshClicks7d
      });
    }
  } catch (e) {
    console.warn('GA4 refresh_clicked failed:', e);
  }
  
  // GA4: Track first refresh within 24h (Batch 3 activation event)
  try {
    const result = await chrome.storage.local.get(['firstRefreshCompleted', 'install_date']);
    const { firstRefreshCompleted, install_date } = result;
    
    if (!firstRefreshCompleted && install_date) {
      const hoursSinceInstall = (Date.now() - parseInt(install_date)) / 3600000;
      
      // Only track if within 24 hours of install
      if (hoursSinceInstall <= 24) {
        if (window.GA4 && window.GA4.sendEvent) {
          window.GA4.sendEvent('first_refresh_24h', {
            time_since_install_hours: Math.round(hoursSinceInstall)
          });
        }
        await chrome.storage.local.set({ firstRefreshCompleted: true });
      }
    }
  } catch (error) {
    console.error('❌ Error tracking first refresh:', error);
  }
}

// Close on backdrop click
const backdrop = document.querySelector('.welcome-modal-backdrop');
if (backdrop) {
  backdrop.addEventListener('click', () => {
    welcomeModal.style.display = 'none';
    // Only set flag if user deliberately closes (not first visit auto-show)
    if (!hasSeenWelcome) {
      localStorage.setItem('hasSeenWelcome', 'true');
    }
  });
}

// ===== V2: FEEDBACK BUBBLE LOGIC =====

// ===== HELPER FUNCTIONS FOR FEEDBACK TRIGGERS =====

// Count events within last N days from timestamp array (copied from feedback-data.js)
function countEventsInWindow(storageKey, windowDays) {
  const raw = localStorage.getItem(storageKey) || '[]';
  const timestamps = JSON.parse(raw);
  const cutoff = Date.now() - (windowDays * 24 * 60 * 60 * 1000);
  
  return timestamps.filter(t => t > cutoff).length;
}

// Check if board opens happened on at least N different days
function checkDifferentDays(storageKey, minDays, windowDays) {
  const raw = localStorage.getItem(storageKey) || '[]';
  const timestamps = JSON.parse(raw);
  const cutoff = Date.now() - (windowDays * 24 * 60 * 60 * 1000);
  
  // Filter to last N days
  const recentTimestamps = timestamps.filter(t => t > cutoff);
  
  // Extract unique dates (YYYY-MM-DD format)
  const uniqueDates = new Set(
    recentTimestamps.map(ts => {
      const d = new Date(ts);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })
  );
  
  return uniqueDates.size >= minDays;
}

// Show temporary toast notification (bottom-right corner)
function showToast(message, duration = 3000) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #333;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 10002;
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.3s ease-out, transform 0.3s ease-out;
  `;
  
  document.body.appendChild(toast);
  
  // Trigger slide-in animation
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  }, 10);
  
  // Auto-dismiss after duration
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Snooze feedback with smart durations based on user action
function snoozeFeedback(days, reason) {
  const snoozeUntil = Date.now() + (days * 24 * 60 * 60 * 1000);
  localStorage.setItem('feedback_snoozed_until', snoozeUntil.toString());
  localStorage.setItem('feedback_snooze_reason', reason);
  
  // Analytics: Track snooze reason
  trackSnoozeReason(reason);
  
  const snoozeDate = new Date(snoozeUntil).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
  
  // Feedback snoozed (user sees UI confirmation)
}

// PHASE 2: Store original drawer HTML for reset (matches dashboard.html)
const ORIGINAL_DRAWER_HTML = `
  <h3>What do you think about SpotBoard?</h3>
  <p class="drawer-subtext">3 quick questions • About 1 minute</p>
  <div class="sentiment-buttons">
    <button id="sentiment-positive">
      <span class="button-emoji">👍</span>
      <span>I like it!</span>
    </button>
    <button id="sentiment-negative">
      <span class="button-emoji">👎</span>
      <span>It could be better</span>
    </button>
    <button id="sentiment-delay">
      <span class="button-emoji">⏰</span>
      <span>Remind me later</span>
    </button>
  </div>
`;

// ===== ANALYTICS TRACKING =====
// Lightweight metrics stored in localStorage (no backend needed)

function getAnalytics() {
  const raw = localStorage.getItem('feedback_analytics') || '{}';
  return JSON.parse(raw);
}

function saveAnalytics(data) {
  localStorage.setItem('feedback_analytics', JSON.stringify(data));
}

function incrementAnalytic(key) {
  const analytics = getAnalytics();
  analytics[key] = (analytics[key] || 0) + 1;
  saveAnalytics(analytics);
}

function trackSnoozeReason(reason) {
  const analytics = getAnalytics();
  if (!analytics.snooze_reasons) analytics.snooze_reasons = {};
  analytics.snooze_reasons[reason] = (analytics.snooze_reasons[reason] || 0) + 1;
  saveAnalytics(analytics);
}

function logAnalyticsSummary() {
  const analytics = getAnalytics();
  const started = analytics.survey_started || 0;
  const completed = analytics.survey_completed || 0;
  const completionRate = started > 0 ? ((completed / started) * 100).toFixed(1) : 0;
  
  // Feedback analytics available in storage
}

// PHASE 3: Track survey started timestamp
function trackSurveyStarted() {
  const timestamp = Date.now();
  localStorage.setItem('feedback_survey_started', timestamp.toString());
  
  // Analytics: Increment started count
  incrementAnalytic('survey_started');
  
  logAnalyticsSummary();
}

// PHASE 2: Reattach button listeners (called after drawer reset)
function reattachButtonListeners() {
  const posBtn = document.getElementById('sentiment-positive');
  const negBtn = document.getElementById('sentiment-negative');
  const delBtn = document.getElementById('sentiment-delay');
  const picker = document.getElementById('sentiment-picker');
  const bubble = document.getElementById('feedback-bubble');
  
  if (posBtn) {
    posBtn.addEventListener('click', async () => {
      surveyCompleted = false; // Reset completion flag
      
      // CRITICAL FIX: Track BEFORE loading iframe (prevents crash edge case)
      trackSurveyStarted();
      
      const url = await buildTallyURL('positive');
      const drawer = document.querySelector('.sentiment-drawer');
      drawer.classList.add('survey-embedded');
      drawer.innerHTML = `
        <iframe 
          src="${url}&hideTitle=1&transparentBackground=1&alignLeft=1"
          width="100%" 
          height="550px" 
          frameborder="0"
          style="border: none; border-radius: 8px; display: block;">
        </iframe>
      `;

    });
  }
  
  if (negBtn) {
    negBtn.addEventListener('click', async () => {
      surveyCompleted = false; // Reset completion flag
      
      // CRITICAL FIX: Track BEFORE loading iframe (prevents crash edge case)
      trackSurveyStarted();
      
      const url = await buildTallyURL('negative');
      const drawer = document.querySelector('.sentiment-drawer');
      drawer.classList.add('survey-embedded');
      drawer.innerHTML = `
        <iframe 
          src="${url}&hideTitle=1&transparentBackground=1&alignLeft=1"
          width="100%" 
          height="550px" 
          frameborder="0"
          style="border: none; border-radius: 8px; display: block;">
        </iframe>
      `;

    });
  }
  
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      snoozeFeedback(7, 'remind_later');
      if (picker) picker.style.display = 'none';
      if (bubble) bubble.style.display = 'none';
      
      // Show confirmation toast
      showToast('No problem - we\'ll ask again later! 👋');
    });
  }
}

// PHASE 2: Reset drawer to original 3-button state
function resetDrawerToOriginal() {
  const drawer = document.querySelector('.sentiment-drawer');
  if (!drawer) return;
  
  drawer.classList.remove('survey-embedded');
  drawer.innerHTML = ORIGINAL_DRAWER_HTML;

  
  // Re-attach button listeners after resetting HTML
  reattachButtonListeners();
}

// PHASE 2: Completion tracking via postMessage
let surveyCompleted = false;

// Helper function to show "Click anywhere to close" overlay
function showThankYouOverlay() {
  const picker = document.getElementById('sentiment-picker');
  if (!picker) return;
  

  
  // Remove any existing overlay first
  const existingOverlay = document.getElementById('thank-you-close-overlay');
  if (existingOverlay) existingOverlay.remove();
  
  // Create overlay that covers the ENTIRE picker area (not just drawer)
  const overlay = document.createElement('div');
  overlay.id = 'thank-you-close-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10001;
    cursor: pointer;
  `;
  
  overlay.innerHTML = `
    <div style="
      background: white;
      padding: 40px;
      border-radius: 12px;
      text-align: center;
      max-width: 400px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    ">
      <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
      <div style="font-size: 20px; font-weight: 600; margin-bottom: 12px;">Thank you for your feedback!</div>
      <div style="font-size: 14px; color: #666; margin-bottom: 8px;">We'll use this to improve SpotBoard</div>
      <div style="font-size: 13px; color: #999; margin-top: 20px;">Click anywhere to close</div>
    </div>
  `;
  
  // Close on click anywhere
  overlay.addEventListener('click', () => {
    if (picker) picker.style.display = 'none';
    const bubble = document.getElementById('feedback-bubble');
    if (bubble) bubble.style.display = 'none';
    overlay.remove();

  });
  
  document.body.appendChild(overlay);

}

window.addEventListener('message', (event) => {
  // Check incoming messages
  
  // Check for Tally submission event (try both possible formats)
  const isSubmitted = event.data?.type === 'Tally.FormSubmitted' || 
                     (typeof event.data === 'string' && event.data.includes('Tally.FormSubmitted'));
  
  if (isSubmitted) {
    surveyCompleted = true;
    
    // Calculate completion time
    const startedAt = parseInt(localStorage.getItem('feedback_survey_started') || '0');
    if (startedAt > 0) {
      const completionTime = Math.round((Date.now() - startedAt) / 1000); // seconds
      const analytics = getAnalytics();
      const totalTime = (analytics.avg_completion_time || 0) * (analytics.survey_completed || 0);
      const newAvg = Math.round((totalTime + completionTime) / ((analytics.survey_completed || 0) + 1));
      analytics.avg_completion_time = newAvg;
      saveAnalytics(analytics);
    }
    
    // PHASE 3: Clear survey started flag on completion
    localStorage.removeItem('feedback_survey_started');
    
    // Analytics: Increment completed count
    incrementAnalytic('survey_completed');
    
    logAnalyticsSummary();
    
    // Snooze for 60 days
    snoozeFeedback(45, 'completed');
    
    // Show thank you overlay with close button
    showThankYouOverlay();
  }
});

// Initialize feedback bubble (show/hide based on conditions)
async function initFeedbackBubble() {
  const bubble = document.getElementById('feedback-bubble');
  const picker = document.getElementById('sentiment-picker');
  const positiveBtn = document.getElementById('sentiment-positive');
  const negativeBtn = document.getElementById('sentiment-negative');
  const delayBtn = document.getElementById('sentiment-delay');

  if (!bubble || !picker) return; // Elements not found

  // ===== ATTACH EVENT LISTENERS FIRST (always, regardless of visibility) =====
  
  // Toggle drawer on bubble click (open/close)
  bubble.addEventListener('click', () => {
    if (picker.style.display === 'block') {
      // Drawer is open - check if survey is active before closing
      const drawer = document.querySelector('.sentiment-drawer');
      const isSurveyEmbedded = drawer && drawer.classList.contains('survey-embedded');
      
      if (isSurveyEmbedded && !surveyCompleted) {
        // User has active survey - confirm before closing
        const confirmed = confirm(
          "Are you sure you want to leave this feedback?\n\n" +
          "Your progress will be lost. Click OK to close, or Cancel to continue."
        );
        
        if (confirmed) {
          picker.style.display = 'none';
        }
      } else {
        // No active survey or survey completed - just close
        picker.style.display = 'none';
      }
    } else {
      // Drawer is closed - open it (and reset if needed)
      const drawer = document.querySelector('.sentiment-drawer');
      if (drawer && drawer.classList.contains('survey-embedded')) {
        resetDrawerToOriginal();
      }
      picker.style.display = 'block';
    }
  });

  // Sentiment button listeners
  reattachButtonListeners();

  // Close drawer on overlay click with confirmation for active surveys
  const overlay = document.querySelector('.sentiment-overlay');
  if (overlay) {
    overlay.addEventListener('click', () => {
      if (surveyCompleted) {
        picker.style.display = 'none';
        return;
      }
      
      const drawer = document.querySelector('.sentiment-drawer');
      const isSurveyEmbedded = drawer && drawer.classList.contains('survey-embedded');
      
      if (isSurveyEmbedded) {
        const confirmed = confirm(
          "Are you sure you want to leave this feedback?\n\n" +
          "Your progress will be lost. Click OK to close, or Cancel to continue."
        );
        
        if (confirmed) {
          resetDrawerToOriginal();
          picker.style.display = 'none';
        }
      } else {
        // User dismissed without opening survey - snooze 7 days
        snoozeFeedback(7, 'dismissed');
        picker.style.display = 'none';
        showToast('No problem - we\'ll ask again later! 👋');
      }
    });
  }

  // ===== NOW CHECK VISIBILITY CRITERIA =====

  // PHASE 3: Check for partial completion (started but not finished)
  const surveyStartedAt = parseInt(localStorage.getItem('feedback_survey_started') || '0');
  const snoozedUntil = parseInt(localStorage.getItem('feedback_snoozed_until') || '0');
  
  if (surveyStartedAt > 0 && Date.now() >= snoozedUntil) {
    snoozeFeedback(3, 'partial_completion');
    localStorage.removeItem('feedback_survey_started');
  }

  // Check display conditions
  const updatedSnoozeUntil = parseInt(localStorage.getItem('feedback_snoozed_until') || '0');
  const firstFeedbackShown = localStorage.getItem('first_feedback_shown') === 'true';
  
  // ALWAYS hide if snoozed
  if (Date.now() < updatedSnoozeUntil) {
    bubble.style.display = 'none';
    return; // OK to return now - listeners already attached
  }
  
  // Returning user - show immediately after snooze expires
  if (firstFeedbackShown) {
    bubble.style.display = 'flex';
    return;
  }
  
  // FIRST TIME: Apply strict criteria
  const { install_date } = await chrome.storage.local.get('install_date');
  const installDate = parseInt(install_date || Date.now());
  const daysSinceInstall = Math.floor((Date.now() - installDate) / (1000 * 60 * 60 * 24));
  
  const syncData = await chrome.storage.sync.get(null);
  const totalCards = Object.keys(syncData).filter(k => k.startsWith('comp-')).length;
  
  // Rolling window counts (last 7 days)
  const boardOpens = countEventsInWindow('board_open_timestamps', 7);
  const refreshClicks = countEventsInWindow('refresh_click_timestamps', 7);
  const openedDifferentDays = checkDifferentDays('board_open_timestamps', 2, 7);
  
  // Criteria: 3+ opens AND 2+ clicks AND 3+ days install AND 2+ cards AND opened on 2+ different days
  const meetsFirstTimeCriteria = 
    daysSinceInstall >= 3 && 
    totalCards >= 2 && 
    boardOpens >= 3 && 
    refreshClicks >= 2 && 
    openedDifferentDays;
  
  if (meetsFirstTimeCriteria) {
    bubble.style.display = 'flex';
    localStorage.setItem('first_feedback_shown', 'true');
  } else {
    bubble.style.display = 'none';
  }
}

// ===== TEST FUNCTION: Force show feedback banner (bypasses all criteria) =====
window.testFeedbackBanner = function() {
  const bubble = document.getElementById('feedback-bubble');
  const picker = document.getElementById('sentiment-picker');
  
  if (!bubble || !picker) {
    console.error('❌ Feedback elements not found in DOM');
    return;
  }
  
  // Reset to clean state first
  const drawer = document.querySelector('.sentiment-drawer');
  if (drawer && drawer.classList.contains('survey-embedded')) {
    resetDrawerToOriginal();
  }
  picker.style.display = 'none';
  
  // Force show bubble (but let user click it manually)
  bubble.style.display = 'flex';
  
  // Ensure button listeners are attached
  reattachButtonListeners();
  
  console.log('✅ Feedback button visible - click it to open drawer');
  console.log('📊 Current criteria status:');
  console.log('💡 Tip: After opening, click outside overlay or feedback button to close');
  
  // Show current stats for debugging
  chrome.storage.local.get(['install_date'], async (data) => {
    const installDate = parseInt(data.install_date || Date.now());
    const daysSinceInstall = Math.floor((Date.now() - installDate) / (1000 * 60 * 60 * 24));
    const boardOpens = countEventsInWindow('board_open_timestamps', 7);
    const refreshClicks = countEventsInWindow('refresh_click_timestamps', 7);
    
    const syncData = await chrome.storage.sync.get(null);
    const totalCards = Object.keys(syncData).filter(k => k.startsWith('comp-')).length;
    
    console.table({
      'Days Since Install': `${daysSinceInstall} (need 3+)`,
      'Board Opens (7d)': `${boardOpens} (need 3+)`,
      'Refresh Clicks (7d)': `${refreshClicks} (need 2+)`,
      'Total Cards': `${totalCards} (need 2+)`,
    });
  });
};

// Initialize feedback bubble when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initFeedbackBubble();
});
