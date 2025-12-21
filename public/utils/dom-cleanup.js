/**
 * DOM Cleanup Utilities for SpotBoard
 * Handles HTML sanitization, duplicate removal, URL fixing, and CSS injection
 */

/**
 * Apply user exclusions to HTML content
 * Removes DOM elements that user explicitly excluded during capture or editing
 * 
 * @param {string} html - The HTML content to process
 * @param {string[]} excludedSelectors - Array of CSS selectors for elements to remove
 * @returns {string} - HTML with excluded elements removed
 * 
 * Safety: Skips ultra-generic selectors (bare tag names like "div", "span") 
 * to prevent accidentally removing all content
 * 
 * Used in: Direct fetch refresh, tab-based refresh, skeleton fallback
 */
function applyExclusions(html, excludedSelectors) {
  if (!html || !excludedSelectors || excludedSelectors.length === 0) {
    return html;
  }
  
  console.log('🎯 Applying', excludedSelectors.length, 'exclusions during refresh');
  
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  excludedSelectors.forEach(selector => {
    try {
      // 🚨 SAFETY CHECK: Detect ultra-generic selectors that would remove everything
      const isBareTag = /^[a-z]+$/i.test(selector.trim()); // Just "div", "span", "a", etc.
      
      if (isBareTag) {
        console.warn(`🚨 SKIPPING ultra-generic selector that would remove too much: "${selector}"`);
        return; // Skip this selector entirely
      }
      
      const excluded = tempDiv.querySelectorAll(selector);
      if (excluded.length > 0) {
        console.log(`  ↪️ Removing ${excluded.length} elements matching: ${selector}`);
      }
      excluded.forEach(el => el.remove());
    } catch (e) {
      console.warn('  ⚠️ Could not remove excluded element:', selector, e);
    }
  });
  
  return tempDiv.innerHTML;
}

/**
 * Remove duplicate and hidden elements from HTML
 * Fixes modern responsive design pattern where sites include both mobile/desktop content
 * 
 * @param {string} html - The HTML content to clean
 * @returns {string} - HTML with duplicates removed
 * 
 * Patterns detected:
 * - Mobile-specific classes (-mobile, MobileValue)
 * - Shortened versions (-short, -abbr, abbreviated)
 * - Screen reader only content (.sr-only, .visually-hidden)
 * - Empty wrapper elements
 * - Broken SVG sprites and unrenderable SVGs
 * - Decorative images (number graphics, small inline images)
 * - Progressive loading artifacts (blur filters, skeleton loaders)
 * - Dangerous positioning (fixed/sticky that escape cards)
 * 
 * Note: Does NOT check display:none here (HTML without CSS loaded)
 * That check happens during capture and tab refresh where CSS is available
 * 
 * Used in: All refresh paths (direct fetch, tab refresh, skeleton fallback)
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

/**
 * Convert relative URLs to absolute URLs based on source page
 * Ensures images, backgrounds, and links work after extraction from original site
 * 
 * @param {HTMLElement} container - DOM element containing the extracted HTML
 * @param {string} sourceUrl - Original URL where content was captured from
 * 
 * Handles:
 * - Image src and srcset attributes
 * - Lazy-loaded images (data-image, data-src, data-lazy-src patterns)
 * - CSS background images in inline styles
 * - Link hrefs (and ensures they open in new tabs)
 * 
 * URL patterns fixed:
 * - Absolute paths: /img/logo.png → https://site.com/img/logo.png
 * - Relative paths: ./img/logo.png → https://site.com/path/img/logo.png
 * - Relative paths without ./: img/logo.png → https://site.com/path/img/logo.png
 * 
 * Used in: All refresh paths after HTML is fetched
 */
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

/**
 * Reset cursor styles on all elements and mark links for proper styling
 * Ensures consistent cursor behavior in dashboard cards
 * 
 * @param {HTMLElement} container - DOM element to process
 * 
 * Process:
 * 1. Removes all inline cursor styles from elements
 * 2. Adds 'canvas-link' class to <a> tags for CSS targeting
 * 
 * Result: Default cursor everywhere except links (which get pointer via CSS)
 * 
 * Used in: Dashboard rendering after content is inserted into cards
 */
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
 * Remove injected cleanup CSS from dashboard
 * Restores original component styling
 * 
 * @returns {void}
 * 
 * Used when: Testing/debugging to see original layout without cleanup
 * Safe to call: Does nothing if cleanup CSS not injected
 */
function removeCleanupCSS() {
  const sheet = document.getElementById('cleanup-injected-css');
  if (sheet) {
    sheet.remove();
    console.log('✅ CSS cleanup removed');
  }
}

/**
 * 🎯 BATCH 3: Classify images for refresh (without CSS layout)
 * 
 * Problem: Direct fetch uses DOMParser which doesn't render CSS,
 * so getBoundingClientRect() returns 0. We need heuristics instead.
 * 
 * Classification rules:
 * - Icon (48px): Small dimensions (<70px), or class contains icon/logo/badge/avatar
 * - Thumbnail (120px): Medium dimensions, or class contains thumb/card
 * - Preview (280px): Large dimensions (>200px), or class contains hero/preview/featured
 * 
 * @param {string} html - HTML string to process
 * @returns {string} - HTML with data-scale-context attributes added to images
 * 
 * Used in: Direct fetch refresh path (refresh-engine.js)
 */
function classifyImagesForRefresh(html) {
  if (!html) return html;
  
  const temp = document.createElement('div');
  temp.innerHTML = html;
  
  temp.querySelectorAll('img').forEach(img => {
    // Skip if already classified (from capture)
    if (img.hasAttribute('data-scale-context')) {
      return;
    }
    
    let context = 'thumbnail'; // Safe default (120px)
    
    // HEURISTIC 1: Check width/height attributes
    const width = parseInt(img.getAttribute('width')) || 0;
    const height = parseInt(img.getAttribute('height')) || 0;
    const maxDim = Math.max(width, height);
    
    if (maxDim > 0) {
      if (maxDim <= 70) {
        context = 'icon';
      } else if (maxDim <= 150) {
        context = 'thumbnail';
      } else {
        context = 'preview';
      }
      console.log(`  🏷️ Image sized by attributes: ${width}x${height} → "${context}"`);
    } else {
      // HEURISTIC 2: Check class names
      const className = (img.className || '').toLowerCase();
      const parentClass = (img.parentElement?.className || '').toLowerCase();
      const allClasses = className + ' ' + parentClass;
      
      // Icon patterns
      if (/icon|logo|badge|avatar|symbol|favicon/.test(allClasses)) {
        context = 'icon';
        console.log(`  🏷️ Image classified by class (icon pattern): "${context}"`);
      }
      // Preview patterns (large hero images)
      else if (/hero|preview|featured|banner|cover|main-image|property-image|listing-image/.test(allClasses)) {
        context = 'preview';
        console.log(`  🏷️ Image classified by class (preview pattern): "${context}"`);
      }
      // Thumbnail patterns
      else if (/thumb|card|tile|grid-item|product|item-image/.test(allClasses)) {
        context = 'thumbnail';
        console.log(`  🏷️ Image classified by class (thumbnail pattern): "${context}"`);
      }
      // HEURISTIC 3: Check parent context
      else {
        const article = img.closest('article, [class*="card"], [class*="listing"], [class*="property"]');
        const nav = img.closest('nav, header, footer, [class*="menu"], [class*="nav"]');
        
        if (nav) {
          context = 'icon';
          console.log(`  🏷️ Image in nav/header context → "icon"`);
        } else if (article) {
          // In article/card - check if it's the main image or decorative
          const siblingText = article.textContent?.length || 0;
          if (siblingText > 200) {
            // Lots of text = image is probably preview/feature
            context = 'preview';
          } else {
            context = 'thumbnail';
          }
          console.log(`  🏷️ Image in article context (${siblingText} chars) → "${context}"`);
        } else {
          // Default fallback
          console.log(`  🏷️ Image defaulting to: "thumbnail"`);
        }
      }
    }
    
    img.setAttribute('data-scale-context', context);
  });
  
  console.log('🎯 Refresh image classification complete');
  return temp.innerHTML;
}
