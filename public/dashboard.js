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
        console.log('🔄 Migrating to per-component storage format...');
        console.log('📊 Components to migrate:', syncData.components.length);
        
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
          console.log('💾 Backup created before migration');
          
          // Save new format and remove old
          chrome.storage.sync.set(newFormat, () => {
            chrome.storage.sync.remove('components', () => {
              console.log('✅ Migration complete:', Object.keys(newFormat).length, 'components');
              resolve(newFormat);
            });
          });
        });
      } else {
        // Already new format or empty
        console.log('✅ Storage already in new format');
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
      
      console.log('🔍 Storage validation complete:');
      console.log('  Total components:', Object.keys(syncData).filter(k => k.startsWith('comp-')).length);
      console.log('  Total sync storage used:', totalSize, 'bytes');
      
      if (issues.length === 0) {
        console.log('✅ All components valid');
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
      
      console.log('📦 Loaded components from sync:', components.length);
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
    
    // Step 3: Load from new per-component format
    const metadata = await loadComponentsFromSync();
  
    // Step 4: Load local HTML data
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
  
    // Inject CSS cleanup for whitespace compression
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
            chrome.storage.sync.set({ [`comp-${component.id}`]: compData }, () => {
              console.log(`✅ ${component.refreshPaused ? 'Paused' : 'Resumed'}:`, component.id);
            });
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
          // Remove from in-memory array FIRST so subsequent deletes work correctly
          const componentId = component.id;
          const updated = components.filter(c => c.id !== componentId);
          
          // Update the components array in place for subsequent deletes
          components.length = 0;
          components.push(...updated);
          
          // Delete from sync storage (remove the component's key)
          chrome.storage.sync.remove(`comp-${componentId}`, () => {
            console.log('✅ Deleted from sync:', componentId);
          });
          
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
              <div class="empty-state">
                <h2>Your board is empty</h2>
                <p>Click the SpotBoard extension icon on any website to capture a component.</p>
                <p style="color: #666; margin-top: 8px;">💡 Try capturing something you want to see updated over time.</p>
                <p style="color: #666;">E.g.: BBC's "Most Read", Product Hunt launches, Wikipedia's "In the news"</p>
                <p style="color: #e65100; margin-top: 12px; font-weight: 600;">❗ Remember to reload this page after you have captured something new!</p>
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
        
        const saveLabel = () => {
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
                chrome.storage.sync.set({ [`comp-${component.id}`]: compData }, () => {
                  console.log('✅ Label updated in sync:', component.id);
                });
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

// 🎯 BATCH 1.5: Auto-refresh dashboard when new components captured
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync') {
    // Check if a new comp-* key was added (new component captured)
    for (const key in changes) {
      if (key.startsWith('comp-') && !changes[key].oldValue && changes[key].newValue) {
        console.log('🎉 New component detected! Reloading dashboard...');
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
