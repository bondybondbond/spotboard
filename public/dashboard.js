// Fix relative URLs to absolute based on component origin
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

// Load and display components from storage
chrome.storage.local.get(['components'], (result) => {
  const container = document.getElementById('components-container');
  const components = Array.isArray(result.components) ? result.components : [];
  
  console.log('📦 Loaded components:', components);
  
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
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
        <h3 style="margin: 0;">${component.name || 'Unnamed Component'}</h3>
        <button class="delete-btn" style="padding: 6px 12px; background: #ff4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Delete</button>
      </div>
      <small>${component.url || 'No URL'}</small>
      <div class="component-content" style="margin-top: 10px; padding: 10px; background: #f9f9f9; border-radius: 4px; max-height: 300px; overflow: auto;">
        ${component.html_cache || 'No HTML captured'}
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
      if (confirm(`Delete "${component.name}"? This cannot be undone.`)) {
        // Remove this component from the array
        const updated = components.filter((c, i) => i !== index);
        // Save back to storage
        chrome.storage.local.set({ components: updated }, () => {
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
        });
      }
    });
    
    grid.appendChild(card);
  });
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
    const text = heading.textContent.trim().substring(0, 50);
    console.log(`🔍 Fingerprint (heading): "${text}"`);
    return text;
  }
  
  // Fall back to first strong/bold text
  const strong = doc.querySelector('strong, b');
  if (strong && strong.textContent.trim()) {
    const text = strong.textContent.trim().substring(0, 50);
    console.log(`🔍 Fingerprint (strong): "${text}"`);
    return text;
  }
  
  // Last resort: first text content over 10 chars
  const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent.trim();
    if (text.length > 10) {
      console.log(`🔍 Fingerprint (text): "${text.substring(0, 50)}"`);
      return text.substring(0, 50);
    }
  }
  
  console.log(`⚠️ No fingerprint found`);
  return null;
}

/**
 * Tab-based refresh for JS-heavy sites
 * Opens a background tab, waits for JS to load, extracts content
 */
async function tabBasedRefresh(url, selector) {
  console.log(`🌐 Trying tab-based refresh for: ${url}`);
  
  try {
    // Open background tab (not active)
    const tab = await chrome.tabs.create({ url, active: false });
    
    // Wait for page + JS to load (5 seconds for complex sites like HotUKDeals)
    await new Promise(r => setTimeout(r, 5000));
    
    // Extract the component using scripting API
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [selector],
      func: (sel) => {
        const el = document.querySelector(sel);
        return el ? el.outerHTML : null;
      }
    });
    
    // Close the tab
    await chrome.tabs.remove(tab.id);
    
    const html = results[0]?.result;
    
    if (html) {
      console.log(`✅ Tab-based refresh successful!`);
      return html;
    }
    
    console.warn(`⚠️ Tab-based refresh: selector not found`);
    return null;
    
  } catch (error) {
    console.error(`❌ Tab-based refresh failed:`, error);
    return null;
  }
}

async function refreshComponent(component) {
  try {
    console.log(`🔄 Refreshing: ${component.name} from ${component.url}`);
    
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
          console.warn(`⚠️ Detected skeleton/loading content - trying tab-based refresh...`);
          
          // Try tab-based refresh as fallback
          const tabHtml = await tabBasedRefresh(component.url, component.selector);
          
          if (tabHtml) {
            // Verify we got the right element by checking fingerprint
            const originalFingerprint = extractFingerprint(component.html_cache);
            
            if (originalFingerprint && !tabHtml.toLowerCase().includes(originalFingerprint.toLowerCase())) {
              console.warn(`⚠️ Tab refresh returned wrong element (missing "${originalFingerprint}") - keeping original`);
              return {
                success: false,
                error: 'Tab refresh returned different element',
                keepOriginal: true
              };
            }
            
            // Tab refresh worked and verified!
            console.log(`✅ Tab refresh verified - fingerprint "${originalFingerprint}" found`);
            return {
              success: true,
              html_cache: tabHtml,
              last_refresh: new Date().toISOString(),
              status: 'active'
            };
          }
          
          // Tab refresh also failed - keep original
          console.warn(`⚠️ Tab-based refresh also returned skeleton - keeping original`);
          return {
            success: false,
            error: 'Page returned skeleton content (JS not loaded)',
            keepOriginal: true
          };
        }
        
        console.log(`✅ Successfully extracted component using selector: ${component.selector}`);
      } else {
        // Selector not found in fetched HTML - might need JS to run
        console.warn(`⚠️ Selector "${component.selector}" not found in fetched HTML - trying tab-based refresh...`);
        
        const tabHtml = await tabBasedRefresh(component.url, component.selector);
        
        if (tabHtml) {
          // Verify with fingerprint
          const originalFingerprint = extractFingerprint(component.html_cache);
          
          if (originalFingerprint && !tabHtml.toLowerCase().includes(originalFingerprint.toLowerCase())) {
            console.warn(`⚠️ Tab refresh returned wrong element (missing "${originalFingerprint}") - keeping original`);
            return {
              success: false,
              error: 'Tab refresh returned different element',
              keepOriginal: true
            };
          }
          
          console.log(`✅ Tab refresh successful and verified!`);
          return {
            success: true,
            html_cache: tabHtml,
            last_refresh: new Date().toISOString(),
            status: 'active'
          };
        }
        
        console.warn(`⚠️ Tab-based refresh also failed to find selector`);
      }
    } else {
      console.warn(`⚠️ Generic selector "${component.selector}" - skipping extraction to avoid wrong content`);
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
      html_cache: extractedHtml,
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
  
  // Show loading state
  btn.disabled = true;
  btn.textContent = '⏳ Refreshing...';
  btn.style.background = '#6c757d';
  
  try {
    // Get current components
    const result = await new Promise(resolve => {
      chrome.storage.local.get(['components'], resolve);
    });
    
    const components = result.components || [];
    
    if (components.length === 0) {
      btn.textContent = '✅ No components to refresh';
      setTimeout(() => {
        btn.textContent = '🔄 Refresh All';
        btn.style.background = '#007bff';
        btn.disabled = false;
      }, 2000);
      return;
    }
    
    console.log(`🔄 Starting refresh of ${components.length} components...`);
    
    // Refresh all components
    const refreshPromises = components.map(comp => refreshComponent(comp));
    const results = await Promise.all(refreshPromises);
    
    // Update components with new data
    const updatedComponents = components.map((comp, index) => {
      const result = results[index];
      if (result.success) {
        // Successfully refreshed - update HTML
        return {
          ...comp,
          html_cache: result.html_cache,
          last_refresh: result.last_refresh,
          status: result.status
        };
      } else if (result.keepOriginal) {
        // Failed to extract but keep original HTML (don't mark as error)
        console.log(`⚠️ Keeping original HTML for: ${comp.name}`);
        return {
          ...comp,
          last_refresh: new Date().toISOString(),
          status: 'active' // Still active, just couldn't refresh
        };
      } else {
        // Real error (CORS, network, etc)
        return {
          ...comp,
          status: 'error',
          last_refresh: new Date().toISOString()
        };
      }
    });
    
    // Count results
    const successCount = results.filter(r => r.success).length;
    const keptOriginalCount = results.filter(r => r.keepOriginal).length;
    const failCount = results.filter(r => !r.success && !r.keepOriginal).length;
    
    // Save updated components
    await new Promise(resolve => {
      chrome.storage.local.set({ components: updatedComponents }, resolve);
    });
    
    console.log(`✅ Refresh complete: ${successCount} refreshed, ${keptOriginalCount} kept original, ${failCount} failed`);
    
    // Build detailed summary for popup
    let summary = `📊 Refresh Summary:\n\n`;
    summary += `✅ Successfully refreshed: ${successCount}\n`;
    summary += `⚠️ Kept original (generic selector): ${keptOriginalCount}\n`;
    summary += `❌ Failed (CORS/Network): ${failCount}\n\n`;
    
    // Add details for each component
    summary += `Details:\n`;
    components.forEach((comp, index) => {
      const result = results[index];
      if (result.success) {
        summary += `✅ ${comp.name}\n`;
      } else if (result.keepOriginal) {
        summary += `⚠️ ${comp.name} - kept original\n`;
      } else {
        summary += `❌ ${comp.name} - ${result.error}\n`;
      }
    });
    
    // Build table data for console
    const tableData = components.map((comp, index) => {
      const result = results[index];
      return {
        Component: comp.name,
        Status: result.success ? '✅ Refreshed' : result.keepOriginal ? '⚠️ Kept Original' : '❌ Failed',
        Reason: result.success ? 'Success' : result.error || 'Generic selector'
      };
    });
    
    // Log to console with table (persists longer)
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: blue; font-weight: bold');
    console.log('%c📊 REFRESH COMPLETE', 'color: blue; font-size: 16px; font-weight: bold');
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: blue; font-weight: bold');
    console.table(tableData);
    console.log(`✅ Successfully refreshed: ${successCount}`);
    console.log(`⚠️ Kept original: ${keptOriginalCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: blue; font-weight: bold');
    
    // Show success state with more detail
    if (successCount === results.length) {
      btn.textContent = `✅ All refreshed (${successCount})`;
      btn.style.background = '#28a745';
    } else if (successCount > 0) {
      btn.textContent = `⚠️ ${successCount} refreshed, ${keptOriginalCount + failCount} kept`;
      btn.style.background = '#ffc107';
    } else {
      btn.textContent = `⚠️ All kept original`;
      btn.style.background = '#ffc107';
    }
    
    // Use confirm() instead of alert - requires user interaction before proceeding
    const shouldReload = confirm(summary + '\n\nReload page to see updates?');
    
    if (shouldReload) {
      location.reload();
    } else {
      // Reset button if user cancels
      setTimeout(() => {
        btn.textContent = '🔄 Refresh All';
        btn.style.background = '#007bff';
        btn.disabled = false;
      }, 2000);
    }
    
  } catch (error) {
    console.error('❌ Refresh failed:', error);
    btn.textContent = '❌ Refresh failed';
    btn.style.background = '#dc3545';
    
    // Reset after 2 seconds
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
