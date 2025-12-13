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
    // Screen reader / accessibility (always hidden)
    '.visually-hidden',           // Screen reader text (exact class)
    '.sr-only',                   // Bootstrap screen reader
    '[class*="VisuallyHidden"]',  // BBC visually hidden (partial match)
    
    // Mobile-specific content (hidden on desktop)
    '[class*="MobileValue"]',     // BBC mobile duplicate (partial match for CSS-in-JS)
    '[class*="-mobile"]',         // Generic mobile classes (e.g., "content-mobile", "title-mobile")
    '[class*="mobile-"]',         // Generic mobile classes (e.g., "mobile-content", "mobile-title")
    
    // Shortened/abbreviated content (mobile versions)
    '[class*="-short"]',          // Generic short classes (e.g., "team-name--short", "title-short")
    '[class*="short-"]',          // Generic short classes (e.g., "short-title", "short-name")
    '[class*="team-name--short"]',// Premier League mobile team names (duplicate)
    '[class*="team-name--abbr"]', // Generic abbreviated team names (backup pattern)
    '[class*="-abbr"]',           // Generic abbreviation classes (e.g., "name-abbr", "title-abbr")
    '[class*="abbreviated"]'      // Explicit abbreviated content
  ];
  
  duplicateSelectors.forEach(selector => {
    temp.querySelectorAll(selector).forEach(el => el.remove());
  });

  // 🎯 REMOVED from cleanupDuplicates: display:none check causes false positives here
  // This function is called on HTML WITHOUT its CSS loaded (dashboard display)
  // Elements default to display:none when CSS isn't present
  // We handle display:none during CAPTURE and TAB REFRESH where CSS IS loaded
  
  // Remove empty wrapper divs/spans that only add spacing
  temp.querySelectorAll('div, span').forEach(el => {
    // Check if element is effectively empty (no text, only whitespace/images/br)
    const hasText = el.textContent.trim().length > 0;
    const hasImages = el.querySelector('img');
    const hasLinks = el.querySelector('a');
    
    // If it's just a spacing wrapper with no content
    if (!hasText && !hasImages && !hasLinks) {
      el.remove();
    }
  });
  
  // Remove broken SVG sprite references (prevents console errors)
  temp.querySelectorAll('svg use[href*=".svg#"]').forEach(use => {
    use.parentElement.remove(); // Remove the entire SVG element
  });
  
  // 🎯 SCALABLE SVG VALIDATION: Remove unrenderable SVGs (Guardian numbers, etc.)
  // Tests if SVG can render properly at 25px using heuristics
  temp.querySelectorAll('svg').forEach(svg => {
    if (!isSVGRenderable(svg)) {
      console.log('🗑️ Removed unrenderable SVG:', svg.getAttribute('class') || 'no-class');
      svg.remove();
    }
  });
  
  // 🎯 DECORATIVE IMAGE REMOVAL: Remove likely decorative images (Guardian number graphics, etc.)
  temp.querySelectorAll('img').forEach(img => {
    const listItem = img.closest('li');
    if (!listItem) return; // Not in a list, keep it
    
    const alt = img.getAttribute('alt') || '';
    const src = img.getAttribute('src') || '';
    
    // Pattern 1: Number-only alt text (Guardian article pages use these)
    if (/^[0-9]+$/.test(alt.trim())) {
      console.log('🗑️ Removed decorative number image:', alt);
      img.remove();
      return;
    }
    
    // Pattern 2: Empty/missing alt + small decorative class patterns
    if (!alt && (
      img.className.includes('number') ||
      img.className.includes('rank') ||
      img.className.includes('index')
    )) {
      console.log('🗑️ Removed decorative image (no alt + decorative class)');
      img.remove();
      return;
    }
    
    // Pattern 3: Data URIs with suspicious patterns (inline decorative graphics)
    if (src.startsWith('data:image') && src.length < 500) {
      console.log('🗑️ Removed small inline image (likely decorative)');
      img.remove();
      return;
    }
  });
  
  // 🎯 FIX PROGRESSIVE LOADING IMAGES: Remove loading artifacts
  // Sites use progressive loading: blur filters, skeleton loaders, lazy loading
  // These break in dashboard because JavaScript that removes them doesn't run
  temp.querySelectorAll('img').forEach(img => {
    // Remove lazy loading attribute
    img.removeAttribute('loading');
    
    // Remove progressive loading classes that cause blur/skeleton effects
    // SlotCatalog: .blurring (filter: blur(4px))
    // Others: .skeleton, .loading, .placeholder, .lazy
    const loadingClasses = ['blurring', 'skeleton', 'loading', 'placeholder', 'lazy', 'lazy-load'];
    loadingClasses.forEach(cls => {
      if (img.classList.contains(cls)) {
        console.log(`🗑️ Removed progressive loading class: ${cls}`);
        img.classList.remove(cls);
      }
    });
  });
  
  // 🎯 STRIP DANGEROUS POSITIONING: Remove position:fixed/sticky that escape card containers
  temp.querySelectorAll('*').forEach(el => {
    const styleAttr = el.getAttribute('style');
    if (styleAttr && (styleAttr.includes('position:fixed') || styleAttr.includes('position: fixed') ||
                      styleAttr.includes('position:sticky') || styleAttr.includes('position: sticky'))) {
      console.log('🗑️ Stripped fixed/sticky positioning from:', el.tagName, el.className);
      // Remove the position property instead of removing the whole element
      const newStyle = styleAttr.replace(/position\s*:\s*(fixed|sticky)\s*;?/gi, '');
      el.setAttribute('style', newStyle);
    }
  });
  
  return temp.innerHTML;
}

// Post-render cleanup removed - Guardian tab spacing is a known limitation

/**
 * Test if an SVG can render properly at 25px
 * Uses heuristics to detect broken/unscalable SVGs without canvas rendering
 * 
 * @param {SVGElement} svg - The SVG element to test
 * @returns {boolean} - true if renderable, false if broken
 */
function isSVGRenderable(svg) {
  try {
    // CHECK 1: Must have dimensions (viewBox OR width/height)
    const viewBox = svg.getAttribute('viewBox');
    const width = svg.getAttribute('width');
    const height = svg.getAttribute('height');
    
    if (!viewBox && !width && !height) {
      console.log('  ❌ No dimensions (viewBox/width/height)');
      return false; // Can't scale without dimensions
    }
    
    // CHECK 2: Must have visible styling (fill/stroke/color)
    // SVGs without explicit styling rely on external CSS = broken when extracted
    const hasFill = svg.querySelector('[fill]:not([fill="none"]):not([fill=""])');
    const hasStroke = svg.querySelector('[stroke]:not([stroke="none"]):not([stroke=""])');
    const hasVisibleStyle = svg.querySelector('[style*="fill"],[style*="stroke"],[style*="color"]');
    
    // Exception: Allow SVGs with currentColor (inherit from text color)
    const hasCurrentColor = svg.querySelector('[fill="currentColor"],[stroke="currentColor"]');
    
    if (!hasFill && !hasStroke && !hasVisibleStyle && !hasCurrentColor) {
      console.log('  ❌ No visible styling (fill/stroke/color)');
      return false; // No visible content = broken
    }
    
    // CHECK 3: Path complexity check (overly complex = likely broken)
    const paths = svg.querySelectorAll('path');
    for (const path of paths) {
      const d = path.getAttribute('d');
      if (d && d.length > 1000) {
        console.log('  ❌ Path too complex (>1000 chars)');
        return false; // Guardian-style broken path data
      }
    }
    
    // CHECK 4: Must have actual content (not just empty container)
    const hasContent = svg.querySelector('path, circle, rect, polygon, line, polyline, ellipse, text, image');
    if (!hasContent) {
      console.log('  ❌ No content elements');
      return false; // Empty SVG
    }
    
    // PASSED ALL CHECKS
    console.log('  ✅ SVG is renderable');
    return true;
    
  } catch (error) {
    console.error('  ❌ SVG validation error:', error);
    return false; // If validation fails, assume broken
  }
}

function fixRelativeUrls(container, sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    const origin = url.origin; // e.g., "https://www.bbc.co.uk"
    
    // 🎯 FIX LAZY-LOADED IMAGES: Convert data-image/data-src to src
    // Epic Games, many modern sites use data-image, data-src, data-lazy-src for lazy loading
    // These need to be swapped to src before we process URLs, otherwise images are blank placeholders
    container.querySelectorAll('img').forEach(img => {
      // Common lazy-load attribute names (in priority order)
      const lazyAttrs = ['data-image', 'data-src', 'data-lazy-src', 'data-original', 'data-lazy'];
      
      for (const attr of lazyAttrs) {
        const lazyUrl = img.getAttribute(attr);
        if (lazyUrl && lazyUrl.startsWith('http')) {
          // Found a real URL in lazy attribute - use it as src
          img.setAttribute('src', lazyUrl);
          console.log(`  ✅ Converted ${attr} to src:`, lazyUrl.substring(0, 80));
          break; // Stop after first match
        }
      }
    });
    
    // 🎯 FIX IMAGE SRC ATTRIBUTES
    container.querySelectorAll('img[src]').forEach(img => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('blob:')) {
        if (src.startsWith('/')) {
          // Absolute path: /img/logo.png → https://site.com/img/logo.png
          img.src = origin + src;
        } else if (src.startsWith('./') || src.startsWith('../')) {
          // Relative path
          const basePath = url.pathname.substring(0, url.pathname.lastIndexOf('/'));
          img.src = origin + basePath + '/' + src.replace(/^\.\//, '');
        } else {
          // Relative path without ./
          const basePath = url.pathname.substring(0, url.pathname.lastIndexOf('/'));
          img.src = origin + basePath + '/' + src;
        }
      }
    });
    
    // 🎯 FIX IMAGE SRCSET ATTRIBUTES (responsive images)
    container.querySelectorAll('img[srcset]').forEach(img => {
      const srcset = img.getAttribute('srcset');
      if (srcset) {
        const fixedSrcset = srcset.split(',').map(src => {
          const parts = src.trim().split(/\s+/);
          const imgUrl = parts[0];
          if (imgUrl && !imgUrl.startsWith('http') && !imgUrl.startsWith('data:') && !imgUrl.startsWith('blob:')) {
            if (imgUrl.startsWith('/')) {
              parts[0] = origin + imgUrl;
            } else {
              const basePath = url.pathname.substring(0, url.pathname.lastIndexOf('/'));
              parts[0] = origin + basePath + '/' + imgUrl.replace(/^\.\//, '');
            }
          }
          return parts.join(' ');
        }).join(', ');
        img.setAttribute('srcset', fixedSrcset);
      }
    });
    
    // 🎯 FIX CSS BACKGROUND IMAGES
    container.querySelectorAll('[style]').forEach(el => {
      const style = el.getAttribute('style');
      if (style && style.includes('url(')) {
        const fixedStyle = style.replace(/url\(['"]?([^'"()]+)['"]?\)/g, (match, bgUrl) => {
          if (bgUrl.startsWith('data:') || bgUrl.startsWith('blob:') || bgUrl.startsWith('http')) {
            return match;
          }
          if (bgUrl.startsWith('/')) {
            return `url('${origin}${bgUrl}')`;
          }
          const basePath = url.pathname.substring(0, url.pathname.lastIndexOf('/'));
          return `url('${origin}${basePath}/${bgUrl.replace(/^\.\//, '')}')`;
        });
        el.setAttribute('style', fixedStyle);
      }
    });
    
    // 🎯 FIX LINK HREFS
    container.querySelectorAll('a[href]').forEach(link => {
      const href = link.getAttribute('href');
      
      if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('http')) {
        if (href.startsWith('/')) {
          // Absolute path: /deals/123 → https://hotukdeals.com/deals/123
          link.href = origin + href;
        } else if (href.startsWith('./') || href.startsWith('../')) {
          // Relative path: ./deals/123 → resolve relative to source path
          const basePath = url.pathname.substring(0, url.pathname.lastIndexOf('/'));
          link.href = origin + basePath + '/' + href.replace(/^\.\//, '');
        }
      }
      
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
    .component-content ul {
      list-style-type: disc !important;
      margin: 1px 0 !important;
      padding-left: 20px !important;
    }
    
    .component-content ol {
      list-style-type: decimal !important;
      margin: 1px 0 !important;
      padding-left: 20px !important;
    }
    
    .component-content ul li,
    .component-content ol li {
      line-height: 1.2 !important;
      margin: 0 !important;
      padding: 1px 0 !important;
      min-height: 0 !important;
      height: auto !important;
    }
    
    /* 🎯 GUARDIAN FIX: Remove excessive spacing from list item children */
    .component-content li > div,
    .component-content li > section,
    .component-content li > article {
      margin: 0 !important;
      padding: 2px 0 !important;
      line-height: 1.2 !important;
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
        // 🎯 FIX: Remove from in-memory array FIRST so subsequent deletes work correctly
        // This prevents the bug where deleting multiple items quickly causes respawns
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
          selector: c.selector
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
  const problematicDomains = ['hotukdeals.com', 'premierleague.com'];
  return problematicDomains.some(domain => url.includes(domain));
}

/**
 * Check if site MUST use active visible tab (can't work in background at all)
 * These sites use IntersectionObserver or Page Visibility API that cannot be spoofed
 */
function requiresVisibleTab(url) {
  // Sites that block background tabs (Page Visibility API or bot detection)
  const visibilityCheckDomains = [
    'hotukdeals.com',     // Page Visibility API blocks background
    'premierleague.com',  // Page Visibility API blocks background  
    'ign.com'             // Bot detection shows error page in background
  ];
  return visibilityCheckDomains.some(domain => url.includes(domain));
}

/**
 * Tab-based refresh for JS-heavy sites
 * Opens a background tab, waits for JS to load, extracts content
 */
async function tabBasedRefresh(url, selector, fingerprint = null) {
  try {
    // Check if this site MUST be visible (Page Visibility API blocks background)
    if (requiresVisibleTab(url)) {
      // Skip background attempt - go straight to active tab
      const result = await tryActiveTab(url, selector, fingerprint);
      return result || null;
    }
    
    // ATTEMPT 1: Try background tab with visibility spoof
    const result = await tryBackgroundWithSpoof(url, selector);
    if (result) return result;
    
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
    
    // Wait additional time for JS to fully load (complex sites)
    await new Promise(r => setTimeout(r, 3000));
    
    // Try to extract - WITH SANITIZATION IN THE TAB
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

// Fallback: Active tab (flashes briefly but guaranteed to work)
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
    
    // Extract - WITH SANITIZATION IN THE TAB
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

async function refreshComponent(component) {
  try {
    // Check if this site requires tab-based refresh (session-dependent content)
    if (willNeedActiveTab(component.url)) {
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
    if (component.selector && !['div', 'section', 'article', 'main', 'aside', 'header', 'footer', 'nav'].includes(component.selector.toLowerCase())) {
      // 🎯 FIX: Get ALL matching elements, not just first one
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
        
        // Check if we got a skeleton/loading placeholder instead of real content
        const isSkeletonContent = extractedHtml.includes('class="skeleton') || 
                                   extractedHtml.includes('skeleton-color') ||
                                   extractedHtml.includes('loading-placeholder') ||
                                   (extractedHtml.match(/skeleton/gi) || []).length > 2;
        
        // NEW: Check if container has heading but no actual content (MarketWatch pattern)
        // This catches JS-heavy sites where container loads but articles populate later
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = extractedHtml;
        const hasHeading = tempDiv.querySelector('h1, h2, h3, h4, h5, h6') !== null;
        const linkCount = tempDiv.querySelectorAll('a').length;
        const articleCount = tempDiv.querySelectorAll('article, h5, [class*="article"]').length;
        const contentLength = tempDiv.textContent.trim().length;
        
        // 🎯 IGN PATTERN: Check for empty content containers (skeleton with structure but no text)
        // IGN loads container divs like "item-details" but populates text via JavaScript
        // Look for: has links/images BUT content containers are empty
        const contentContainers = tempDiv.querySelectorAll('[class*="details"], [class*="content"], [class*="title"]:not(h1):not(h2):not(h3)');
        const emptyContainers = Array.from(contentContainers).filter(el => {
          const text = el.textContent.trim();
          const hasChildren = el.children.length > 0;
          // Container is empty if: no text AND no child elements
          return text.length === 0 && !hasChildren;
        });
        const hasEmptyContainers = emptyContainers.length >= 2; // Need multiple to avoid false positives
        
        // Consider it a skeleton if it's EXTREMELY empty (MarketWatch pattern):
        // - Has heading (structure loaded)
        // - BUT almost no links (<= 1) AND no article elements (<= 1)
        // Real components like BBC have 10+ links and 10+ list items
        // BOTH must be empty - using AND not OR to be very conservative
        const isEmptyContainer = hasHeading && linkCount <= 1 && articleCount <= 1;
        
        // NEW: Check for duplicate content (CSS-based responsive hiding pattern)
        // Sites like The Verge include both mobile and desktop versions in DOM
        const links = Array.from(tempDiv.querySelectorAll('a'));
        const linkTexts = links.map(a => a.textContent.trim()).filter(t => t.length > 10);
        const uniqueTexts = new Set(linkTexts);
        const duplicateCount = linkTexts.length - uniqueTexts.size;
        // Be conservative: Need BOTH significant duplicates (5+) AND duplicates >= unique (at least 50%)
        const hasDuplicates = duplicateCount >= 5 && duplicateCount >= uniqueTexts.size;
        
        console.log(`🔍 Skeleton check for ${component.name}:`, {
          isSkeletonContent,
          isEmptyContainer,
          hasEmptyContainers,
          emptyContainerCount: emptyContainers.length,
          hasDuplicates,
          duplicateCount,
          totalLinks: linkTexts.length,
          uniqueLinks: uniqueTexts.size,
          hasHeading,
          linkCount,
          articleCount,
          contentLength
        });
        
        if (isSkeletonContent || isEmptyContainer || hasEmptyContainers || hasDuplicates) {
          // Extract fingerprint FIRST to pass to tab refresh
          const originalFingerprint = extractFingerprint(component.html_cache);
          
          // Try tab-based refresh as fallback
          console.log('[Skeleton Fallback] Attempting tab refresh for', component.label, 'with fingerprint:', originalFingerprint);
          const tabHtml = await tabBasedRefresh(component.url, component.selector, originalFingerprint);
          
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
            error: isEmptyContainer ? 'Page returned empty container (JS not loaded yet)' : 'Page returned skeleton content (JS not loaded)',
            keepOriginal: true
          };
        }
      } else {
        // Selector not found in fetched HTML - try tab-based refresh
        const originalFingerprint = extractFingerprint(component.html_cache);
        const tabHtml = await tabBasedRefresh(component.url, component.selector, originalFingerprint);
        
        if (tabHtml) {
          // Verify with fingerprint
          
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
      const needsActiveTab = requiresVisibleTab(comp.url); // Only show "opening tab" for sites that MUST be visible
      
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
