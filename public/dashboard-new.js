/**
 * SpotBoard Dashboard - Main UI Controller
 * 
 * Dependencies (must be loaded before this file):
 * - utils/dom-cleanup.js
 * - utils/fingerprint.js  
 * - utils/refresh-engine.js
 */

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
      
      // Fix relative URLs to absolute
      const contentDiv = card.querySelector('.component-content');
      if (contentDiv && component.url) {
        fixRelativeUrls(contentDiv, component.url);
        // Force remove all cursor styles
        removeCursorStyles(contentDiv);
      }
      
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
          
          // Update sync storage (metadata + selector for cross-device refresh)
          const syncData = updated.map(c => ({
            id: c.id,
            name: c.name,
            url: c.url,
            favicon: c.favicon,
            customLabel: c.customLabel,
            headingFingerprint: c.headingFingerprint,
            selector: c.selector
            // excludedSelectors stored in LOCAL only (too large for sync quota)
          }));
          chrome.storage.sync.set({ components: syncData });
          
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
                <h2>No components yet</h2>
                <p>Use the extension popup to capture components from any website</p>
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
            
            // Save metadata to sync storage (includes selector for cross-device refresh)
            const syncData = components.map(c => ({
              id: c.id,
              name: c.name,
              url: c.url,
              favicon: c.favicon,
              customLabel: c.customLabel,
              headingFingerprint: c.headingFingerprint,
              selector: c.selector
              // excludedSelectors stored in LOCAL only (too large for sync quota)
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
