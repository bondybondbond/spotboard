/**
 * DOM Cleanup Utilities for SpotBoard
 * Handles HTML sanitization, duplicate removal, URL fixing, and CSS injection
 *
 * Single source of truth — compiled two ways:
 * 1. esbuild pre-build → public/utils/dom-cleanup.js (IIFE with window globals for dashboard)
 * 2. Vite bundles into content.js (ES module import for content script)
 */

/**
 * Apply user exclusions to HTML content
 * Removes DOM elements that user explicitly excluded during capture or editing
 * 
 * @param html - The HTML content to process
 * @param excludedSelectors - Array of CSS selectors for elements to remove
 * @returns HTML with excluded elements removed
 * 
 * Safety: Skips ultra-generic selectors (bare tag names like "div", "span") 
 * to prevent accidentally removing all content
 * 
 * Used in: Direct fetch refresh, tab-based refresh, skeleton fallback
 */
export function applyExclusions(html: string, excludedSelectors?: string[]): string {
  if (!html || !excludedSelectors || excludedSelectors.length === 0) {
    return html;
  }
  
  
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
 * @param html - The HTML content to clean
 * @returns HTML with duplicates removed
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
export function cleanupDuplicates(html: string): string {
  if (!html) return html;
  
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // 🎯 STRIP CSS INJECTION: Remove <style> and stylesheet <link> tags
  // Sites like Sportskeeda inline CSS in <style> tags within page sections.
  // When captured HTML is injected into the dashboard, those styles apply
  // globally (not scoped to the card), causing layout bleed and dark overlays.
  temp.querySelectorAll('style, link[rel="stylesheet"]').forEach(el => el.remove());

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
    '[class*="abbreviated"]',     // Explicit abbreviated content

    // 🎯 MATERIAL ICONS - Ligature-based fonts (text becomes icon when font loads)
    // Google Finance uses these extensively, causing "check_circle_filled" text artifacts
    // Only targets Material-specific classes to avoid false positives on other icon systems
    '.material-icons',                    // Material Icons (standard)
    '.material-symbols-outlined',         // Material Symbols (outlined variant)
    '.material-symbols-rounded',          // Material Symbols (rounded variant)
    '.google-material-icons',             // Google-specific Material Icons (Google Finance)
    'span[class^="material-icons-"]',     // Material Icons with prefixes
    'i[class^="material-icons"]',         // Material Icons in <i> tags
    'i[class^="google-material-icons"]',  // Google Material Icons in <i> tags
    'i.icon[aria-hidden="true"]',         // Generic decorative icons (explicitly marked)

    // 🎯 CAROUSEL/GALLERY UI CONTROLS (always remove - not content)
    // These are navigation elements that clutter the dashboard
    '[class*="navigateButton"]',  // Rightmove: ImagesControls_navigateButtons__ (narrowed from "navigate")
    '[class*="NavigateButton"]',  // Generic navigate buttons
    '[class*="previousButton"]',  // Rightmove: ImagesControls_previousButton__
    '[class*="nextButton"]',      // Rightmove: ImagesControls_nextButton__
    '[class*="prevButton"]',      // Generic prev buttons
    '[class*="Chevron"]',         // Rightmove: ImagesControls_previousChevron__
    '[class*="chevron"]',         // Generic chevron icons
    '[class*="carousel-control"]',// Bootstrap carousel controls
    '[class*="slick-arrow"]',     // Slick slider arrows
    '[class*="swiper-button"]',   // Swiper slider buttons
    '[class*="gallery-nav"]',     // Generic gallery navigation
    '[class*="slider-nav"]',      // Generic slider navigation
    '[class*="slide-arrow"]',     // Generic slide arrows
    'button[aria-label*="previous"]', // Accessibility-labeled prev buttons
    'button[aria-label*="next"]',     // Accessibility-labeled next buttons
    'button[aria-label*="arrow"]',    // Arrow buttons by aria-label
    '[class*="ImageControls"]',   // Rightmove variant
    '[class*="image-controls"]',  // Generic image controls
    '[class*="Controls_"]'        // CSS module controls pattern
  ];
  
  let removedCount = 0;
  
  duplicateSelectors.forEach(selector => {
    const matches = temp.querySelectorAll(selector);
    removedCount += matches.length;
    matches.forEach(el => el.remove());
  });

  // 🎯 CAROUSEL SLIDE COLLAPSE: Keep only first slide for [class*="slider"] containers.
  // Rightmove uses div.PropertyCardImage_slider__* — a horizontal flex row of photo slides.
  // Without this, all slides spread horizontally causing blank white space in the dashboard.
  // Guard: all direct children must contain an img (confirms photo carousel, not navigation).
  temp.querySelectorAll('[class*="slider"]').forEach(el => {
    const children = Array.from(el.children);
    if (children.length < 2) return;
    const allHaveImages = children.every(c => c.querySelector('img'));
    if (!allHaveImages) return;
    children.slice(1).forEach(child => child.remove());
  });

  // 🔍 CAROUSEL INSTRUMENTATION: Log multi-image horizontal containers.
  // Updated to include [class*="slider"] now that we've confirmed Rightmove's pattern.
  temp.querySelectorAll('ul, ol, [class*="slider"], [class*="track"], [class*="wrapper"], [class*="slides"]').forEach(el => {
    const children = Array.from(el.children);
    if (children.length < 2) return;
    const allHaveImages = children.every(c => c.querySelector('img'));
    if (!allHaveImages) return;
    const classes = (el.className as string).split(' ').slice(0, 4).join('.');
    console.log(`[SpotBoard] carousel-candidate: ${el.tagName.toLowerCase()}.${classes} — ${children.length} slides`);
  });

  // 🎯 STRIP UI CHROME BUTTONS: Remove icon-only buttons with no visible text
  // Targets: heart/wishlist buttons, close buttons, share buttons — not text CTAs
  // Uses clone+strip approach (not innerText) because detached DOM has no CSS layout
  temp.querySelectorAll('button, [role="button"]').forEach(btn => {
    const textProbe = btn.cloneNode(true) as HTMLElement;
    textProbe.querySelectorAll('.sr-only, .visually-hidden, [hidden], [style*="display: none"]').forEach(el => el.remove());
    const visibleText = (textProbe.textContent || '').trim().replace(/\s+/g, ' ');

    // Pass A: empty + single-symbol buttons (×, ♡, ★); preserves "Go", "Buy", "Add"
    if (visibleText.length < 2) {
      btn.remove();
      return;
    }

    // Pass B: ARIA exact-match on ambiguous short labels (<5 chars visible text)
    // Only runs when text is short/ambiguous — never fires on "Save 20%" (>4 chars)
    // Known limitation: English-only keywords; international sites rely on Pass A only
    if (visibleText.length < 5) {
      const UI_CHROME_ARIA = ['wishlist', 'favorite', 'save', 'like', 'heart', 'share',
                              'follow', 'bookmark', 'close', 'dismiss'];
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (UI_CHROME_ARIA.some(kw => label === kw || label === `add to ${kw}`)) {
        btn.remove();
      }
    }
  });

  // 🎯 REMOVED from cleanupDuplicates: display:none check causes false positives here
  // This function is called on HTML WITHOUT its CSS loaded (dashboard display)
  // Elements default to display:none when CSS isn't present
  // We handle display:none during CAPTURE and TAB REFRESH where CSS IS loaded
  
  // Remove empty wrapper divs/spans that only add spacing
  let emptyWrappersRemoved = 0;
  const removedElements: Array<{ tag: string; classes: string; id: string; children: number; innerHTML: string }> = []; // Track what we're removing
  
  temp.querySelectorAll('div, span').forEach(el => {
    // Check if element is effectively empty (no text, only whitespace/images/br)
    const hasText = el.textContent!.trim().length > 0;
    const hasImages = el.querySelector('img');
    const hasLinks = el.querySelector('a');
    const hasSvg = el.querySelector('svg');
    const hasVideo = el.querySelector('video');
    
    // If it's just a spacing wrapper with no content
    if (!hasText && !hasImages && !hasLinks && !hasSvg && !hasVideo) {
      emptyWrappersRemoved++;
      
      // Log first 5 removed elements for debugging
      if (removedElements.length < 5) {
        removedElements.push({
          tag: el.tagName,
          classes: el.className as string,
          id: el.id,
          children: el.children.length,
          innerHTML: el.innerHTML.substring(0, 100)
        });
      }
      
      el.remove();
    }
  });
  
  
  
  // 🎯 EMPTY LIST ITEM REMOVAL: Remove unloaded carousel slides with no visible content
  // Hotfix for Zoopla highlighted listings — their carousel bypasses off-screen detection,
  // producing 14 empty <li> items that render as "1. 2. … 14." via decimal list-style.
  // Root cause (off-screen detection miss) is a separate investigation.
  let emptyListItemsRemoved = 0;
  temp.querySelectorAll('li').forEach(li => {
    const hasText  = li.textContent!.trim().length > 0;
    const hasLink  = li.querySelector('a');
    const hasSvg   = li.querySelector('svg');
    const hasVideo = li.querySelector('video, source[src]');

    // Treat <li> as having loaded media if any img has a real src/srcset/currentSrc,
    // or if any <picture><source srcset=...> exists — guards against false-positives on
    // srcset-only or <picture>-based slides that look empty at clone time.
    const hasLoadedMedia = (() => {
      for (const img of Array.from(li.querySelectorAll('img'))) {
        const src    = (img as HTMLImageElement).currentSrc || img.getAttribute('src') || '';
        const srcset = img.getAttribute('srcset') || '';
        if ((src && !src.startsWith('data:image')) || srcset) return true;
      }
      for (const source of Array.from(li.querySelectorAll('picture source[srcset]'))) {
        if (source.getAttribute('srcset')) return true;
      }
      return false;
    })();

    if (!hasText && !hasLoadedMedia && !hasLink && !hasSvg && !hasVideo) {
      // Log parent carousel info to help diagnose off-screen detection miss
      const parent = li.parentElement;
      const parentClasses = (parent?.className as string | undefined)?.split(' ').slice(0, 2).join('.') ?? '';
      const parentInfo = parent ? `${parent.tagName.toLowerCase()}${parentClasses ? '.' + parentClasses : ''}` : 'none';
      console.log(`  🗑️ Removing empty <li> (carousel placeholder) — parent: ${parentInfo}`);
      emptyListItemsRemoved++;
      li.remove();
    }
  });
  if (emptyListItemsRemoved > 0) {
    console.log(`  🗑️ Removed ${emptyListItemsRemoved} empty list items total`);
  }

  // Remove broken SVG sprite references (prevents console errors)
  let svgSpritesRemoved = 0;
  temp.querySelectorAll('svg use[href*=".svg#"]').forEach(use => {
    svgSpritesRemoved++;
    use.parentElement!.remove(); // Remove the entire SVG element
  });
  
  // 🎯 SCALABLE SVG VALIDATION: Remove unrenderable SVGs (Guardian numbers, etc.)
  // Tests if SVG can render properly at 25px using heuristics
  let svgsRemoved = 0;
  temp.querySelectorAll('svg').forEach(svg => {
    if (!isSVGRenderable(svg as SVGSVGElement)) {
      svgsRemoved++;
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
      img.remove();
      return;
    }
    
    // Pattern 2: Empty/missing alt + small decorative class patterns
    if (!alt && (
      img.className.includes('number') ||
      img.className.includes('rank') ||
      img.className.includes('index')
    )) {
      img.remove();
      return;
    }
    
    // Pattern 3: Data URIs with suspicious patterns (inline decorative graphics)
    if (src.startsWith('data:image') && src.length < 500) {
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
        img.classList.remove(cls);
      }
    });
  });
  
  // 🎯 STRIP DANGEROUS POSITIONING & BACKGROUNDS: Remove styles that escape card containers or break readability
  temp.querySelectorAll('*').forEach(el => {
    const styleAttr = (el as HTMLElement).getAttribute('style');
    if (styleAttr) {
      let newStyle = styleAttr;
      
      // Remove positioning that escapes cards
      newStyle = newStyle.replace(/position\s*:\s*(fixed|sticky)\s*;?/gi, '');
      
      // Remove ALL background properties (background, background-color, background-image, background-blend-mode, etc.)
      newStyle = newStyle.replace(/background[^:]*:\s*[^;]*;?/gi, '');
      
      // Remove box-shadows that create dark overlays
      newStyle = newStyle.replace(/box-shadow\s*:\s*[^;]*;?/gi, '');
      
      // CRITICAL: Reset text color to prevent white-on-white (Reddit/Facebook use white text on dark backgrounds)
      newStyle = newStyle.replace(/color\s*:\s*[^;]*;?/gi, '');
      
      // Clean trailing semicolons and whitespace
      newStyle = newStyle.trim().replace(/;+$/, '');
      
      // Set cleaned style or remove attribute if empty
      if (newStyle) {
        (el as HTMLElement).setAttribute('style', newStyle);
      } else {
        (el as HTMLElement).removeAttribute('style');
      }
    }
  });
  
  if (temp.innerHTML.length === 0) {
    console.error('❌ [cleanupDuplicates] RETURNED EMPTY HTML!');
    console.error('   Original input length:', html.length);
  }
  
  return temp.innerHTML;
}

/**
 * Test if an SVG can render properly at 25px
 * Uses heuristics to detect broken/unscalable SVGs without canvas rendering
 * 
 * @param svg - The SVG element to test
 * @returns true if renderable, false if broken
 */
export function isSVGRenderable(svg: SVGSVGElement): boolean {
  try {
    // CHECK 1: Must have dimensions (viewBox OR width/height)
    const viewBox = svg.getAttribute('viewBox');
    const width = svg.getAttribute('width');
    const height = svg.getAttribute('height');
    
    if (!viewBox && !width && !height) {
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
      return false; // No visible content = broken
    }
    
    // CHECK 3: Path complexity check (overly complex = likely broken)
    const paths = svg.querySelectorAll('path');
    for (const path of paths) {
      const d = path.getAttribute('d');
      if (d && d.length > 1000) {
        return false; // Guardian-style broken path data
      }
    }
    
    // CHECK 4: Must have actual content (not just empty container)
    const hasContent = svg.querySelector('path, circle, rect, polygon, line, polyline, ellipse, text, image');
    if (!hasContent) {
      return false; // Empty SVG
    }
    
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
 * @param container - DOM element containing the extracted HTML
 * @param sourceUrl - Original URL where content was captured from
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
export function fixRelativeUrls(container: HTMLElement, sourceUrl: string): void {
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
          break; // Stop after first match
        }
      }
    });
    
    // 🎯 FIX PLACEHOLDER DIMENSIONS: Remove aspect ratio markers (AS.com uses width="4" height="3")
    // These are NOT actual pixel dimensions - they're 4:3 aspect ratio markers
    // Without this fix, images render at 4x3 pixels instead of proper sizes
    container.querySelectorAll('img').forEach(img => {
      const width = parseInt(img.getAttribute('width')!) || 0;
      const height = parseInt(img.getAttribute('height')!) || 0;
      
      // Detect placeholder dimensions (< 10px = aspect ratio markers)
      if ((height > 0 && height < 10) || (width > 0 && width < 10)) {
        img.removeAttribute('width');
        img.removeAttribute('height');
      }
    });
    
    // 🎯 FIX IMAGE SRC ATTRIBUTES
    container.querySelectorAll('img[src]').forEach(img => {
      const src = img.getAttribute('src');
      // Only SVG images need crossOrigin (canvas rendering compatibility for weather icons etc.)
      // Setting crossOrigin on JPEG/PNG blocks images from CDNs without CORS headers (e.g. HotUKDeals)
      try {
        const pathname = new URL(src || '', 'https://dummy.base').pathname.toLowerCase();
        if (pathname.endsWith('.svg') || (src || '').startsWith('data:image/svg+xml')) {
          (img as HTMLImageElement).crossOrigin = 'anonymous';
        }
      } catch (_) {
        console.debug('[SB-CORS] Invalid URL — skipping crossOrigin:', src?.substring(0, 80));
      }
      
      // 🔧 Handle protocol-relative URLs (//upload.wikimedia.org/...)
      if (src && src.startsWith('//')) {
        (img as HTMLImageElement).src = 'https:' + src;
        return;
      }
      
      if (src && !src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('blob:')) {
        if (src.startsWith('/')) {
          // Absolute path: /img/logo.png → https://site.com/img/logo.png
          (img as HTMLImageElement).src = origin + src;
        } else if (src.startsWith('./') || src.startsWith('../')) {
          // Relative path
          const basePath = url.pathname.substring(0, url.pathname.lastIndexOf('/'));
          (img as HTMLImageElement).src = origin + basePath + '/' + src.replace(/^\.\//, '');
        } else {
          // Relative path without ./
          const basePath = url.pathname.substring(0, url.pathname.lastIndexOf('/'));
          (img as HTMLImageElement).src = origin + basePath + '/' + src;
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
          
          // 🔧 Handle protocol-relative URLs (//upload.wikimedia.org/...)
          if (imgUrl && imgUrl.startsWith('//')) {
            parts[0] = 'https:' + imgUrl;
            return parts.join(' ');
          }
          
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
          (link as HTMLAnchorElement).href = origin + href;
        } else if (href.startsWith('./') || href.startsWith('../')) {
          // Relative path: ./deals/123 → resolve relative to source path
          const basePath = url.pathname.substring(0, url.pathname.lastIndexOf('/'));
          (link as HTMLAnchorElement).href = origin + basePath + '/' + href.replace(/^\.\//, '');
        }
      }
      
      // Ensure links open in new tab
      (link as HTMLAnchorElement).target = '_blank';
      (link as HTMLAnchorElement).rel = 'noopener noreferrer';
    });
  } catch (err) {
    console.error('Failed to fix URLs for:', sourceUrl, err);
  }
}

/**
 * Reset cursor styles on all elements and mark links for proper styling
 * Ensures consistent cursor behavior in dashboard cards
 * 
 * @param container - DOM element to process
 * 
 * Process:
 * 1. Removes all inline cursor styles from elements
 * 2. Adds 'canvas-link' class to <a> tags for CSS targeting
 * 
 * Result: Default cursor everywhere except links (which get pointer via CSS)
 * 
 * Used in: Dashboard rendering after content is inserted into cards
 */
export function removeCursorStyles(container: HTMLElement): void {
  // Get all elements including the container itself
  const allElements = [container, ...container.querySelectorAll('*')] as HTMLElement[];
  
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
 * Tags elements with sentiment data for color-coding finance deltas (+/-) on the dashboard.
 * Detects positive/negative numeric patterns and sets data-sb-sentiment on the nearest
 * clickable ancestor (A, BUTTON, SPAN) or immediate parent.
 *
 * Uses SHOW_TEXT + .closest() for performance: native C++ .closest() on ~500 text nodes
 * is faster than JS callbacks on 5000+ elements with SHOW_ELEMENT.
 *
 * Excludes SCRIPT, STYLE, NOSCRIPT, TEMPLATE, SVG text nodes to prevent false positives
 * from CSS values, lazy-load fallback HTML, and inline scripts containing `-number` patterns.
 *
 * Used in: content.ts (initial capture), refresh-engine.js (all 3 refresh paths)
 */
export function tagSentimentData(element: HTMLElement): void {
  const SKIP_SELECTOR = 'SCRIPT, STYLE, NOSCRIPT, TEMPLATE, SVG';

  const filter = {
    acceptNode(node: Node): number {
      if ((node as Text).parentElement?.closest(SKIP_SELECTOR)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  };

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, filter);

  const textNodesToTag: Array<{ node: Text; sentiment: 'positive' | 'negative' }> = [];

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent?.trim() || '';
    if (text.length === 0) continue;

    // Positive: starts with + or contains +X.XX% (but not ±)
    // Negative: starts with -digit or contains -X.XX% (but not ±)
    const positivePattern = /^\+|(?<!\±)\+\d+\.?\d*%?/;
    const negativePattern = /^-\d|(?<!\±)-\d+\.?\d*%?/;

    let sentiment: 'positive' | 'negative' | null = null;
    if (positivePattern.test(text)) {
      sentiment = 'positive';
    } else if (negativePattern.test(text)) {
      sentiment = 'negative';
    }

    if (sentiment) {
      textNodesToTag.push({ node: node as Text, sentiment });
    }
  }

  // Tag the parent elements (usually the clickable element)
  let tagged = 0;
  textNodesToTag.forEach(({ node, sentiment }) => {
    let parent = node.parentElement;

    // Find the clickable ancestor (a, button) or closest span
    while (parent && parent !== element) {
      if (parent.tagName === 'A' || parent.tagName === 'BUTTON' || parent.tagName === 'SPAN') {
        parent.setAttribute('data-sb-sentiment', sentiment);
        tagged++;
        break;
      }
      parent = parent.parentElement;
    }

    // Fallback: tag immediate parent if no clickable ancestor found
    if (node.parentElement && !node.parentElement.hasAttribute('data-sb-sentiment')) {
      node.parentElement.setAttribute('data-sb-sentiment', sentiment);
      tagged++;
    }
  });

  if (tagged > 0) {
    console.log(`✅ Tagged ${tagged} element(s) with sentiment data`);
  }
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
export function injectCleanupCSS(): HTMLStyleElement | undefined {
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
  
  return styleSheet;
}

/**
 * Remove injected cleanup CSS from dashboard
 * Restores original component styling
 * 
 * Used when: Testing/debugging to see original layout without cleanup
 * Safe to call: Does nothing if cleanup CSS not injected
 */
export function removeCleanupCSS(): void {
  const sheet = document.getElementById('cleanup-injected-css');
  if (sheet) {
    sheet.remove();
  }
}


/**
 * 🎯 Preserve image classifications from cached HTML to refreshed HTML
 * 
 * Problem: Capture-time uses live CSS for accurate classification, but refresh
 * fetches NEW HTML which doesn't have our data-scale-context attributes.
 * This function copies classifications from the old cached HTML to the new HTML.
 * 
 * @param newHtml - Freshly fetched HTML from refresh
 * @param oldHtml - Previously cached HTML with classifications
 * @returns New HTML with preserved classifications
 */
export function preserveImageClassifications(newHtml: string, oldHtml: string): string {
  if (!newHtml || !oldHtml) return newHtml;
  
  // Parse old HTML to extract classification mapping
  // We need to match by MULTIPLE attributes since lazy-loaded images
  // may have placeholder src but real URLs in data-image
  const oldTemp = document.createElement('div');
  oldTemp.innerHTML = oldHtml;
  
  const classificationMap = new Map<string, string>();
  oldTemp.querySelectorAll('img[data-scale-context]').forEach(img => {
    const classification = img.getAttribute('data-scale-context');
    if (!classification) return;
    
    // Store mappings for ALL possible identifiers
    const src = img.getAttribute('src');
    const dataImage = img.getAttribute('data-image');
    const dataSrc = img.getAttribute('data-src');
    const dataLazySrc = img.getAttribute('data-lazy-src');
    const dataOriginal = img.getAttribute('data-original');
    const alt = img.getAttribute('alt');
    
    // For each URL, store both full and partial (last 2 path segments)
    const storeUrl = (url: string | null) => {
      if (!url || url.startsWith('data:')) return; // Skip data URIs
      classificationMap.set(url, classification);
      // Also store partial for CDN variations
      const partial = url.split('?')[0].split('/').slice(-2).join('/');
      if (partial.length > 5) classificationMap.set(partial, classification);
    };
    
    storeUrl(src);
    storeUrl(dataImage);
    storeUrl(dataSrc);
    storeUrl(dataLazySrc);
    storeUrl(dataOriginal);
    
    // Also store by alt text if unique enough
    if (alt && alt.length > 5) {
      classificationMap.set(`alt:${alt}`, classification);
    }
  });
  
  if (classificationMap.size === 0) {
    return newHtml;
  }  
  // Parse new HTML and apply preserved classifications
  const newTemp = document.createElement('div');
  newTemp.innerHTML = newHtml;
  
  let preserved = 0;
  newTemp.querySelectorAll('img').forEach(img => {
    // Skip if already classified
    if (img.hasAttribute('data-scale-context')) return;
    
    // Try all possible identifiers
    const src = img.getAttribute('src');
    const dataImage = img.getAttribute('data-image');
    const dataSrc = img.getAttribute('data-src');
    const dataLazySrc = img.getAttribute('data-lazy-src');
    const dataOriginal = img.getAttribute('data-original');
    const alt = img.getAttribute('alt');
    
    let classification: string | null = null;
    
    // Try matching in priority order
    const tryMatch = (url: string | null) => {
      if (!url || url.startsWith('data:') || classification) return;
      classification = classificationMap.get(url) || null;
      if (!classification) {
        const partial = url.split('?')[0].split('/').slice(-2).join('/');
        if (partial.length > 5) classification = classificationMap.get(partial) || null;
      }
    };
    
    // Try data-image first (most reliable for lazy-loaded)
    tryMatch(dataImage);
    tryMatch(dataSrc);
    tryMatch(dataLazySrc);
    tryMatch(dataOriginal);
    tryMatch(src);
    
    // Try alt text as last resort
    if (!classification && alt && alt.length > 5) {
      classification = classificationMap.get(`alt:${alt}`) || null;
    }
    
    if (classification) {
      img.setAttribute('data-scale-context', classification);
      preserved++;
    }
  });
  
  
  return newTemp.innerHTML;
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
 * @param html - HTML string to process
 * @returns HTML with data-scale-context attributes added to images
 * 
 * Used in: Direct fetch refresh path (refresh-engine.js)
 */
/** Returns the largest `w` descriptor from an img's srcset, or 0 if none/density-only. */
function getMaxSrcsetWidth(img: HTMLImageElement): number {
  const srcsetVal = img.getAttribute('srcset') || '';
  if (!srcsetVal) return 0;
  return Math.max(
    0,
    ...srcsetVal.split(',').map(entry => {
      const match = entry.trim().match(/(\d+)w\s*$/); // `w` descriptor only; density (2x) → 0
      return match ? parseInt(match[1], 10) : 0;
    })
  );
}

export function classifyImagesForRefresh(html: string): string {
  if (!html) return html;
  
  const temp = document.createElement('div');
  temp.innerHTML = html;
  
  temp.querySelectorAll('img').forEach(img => {
    const inPicture = !!img.closest('picture');

    // 🔧 ALWAYS strip zero/placeholder dimension attrs regardless of classification state.
    // Must run BEFORE the early-return so already-classified images also get cleaned.
    // Rightmove SSR fallback slots: width="0" height="0" — collapses them to 0×0 in dashboard.
    // AS.com aspect ratio markers: width="4" height="3" — not pixels, confuses sizing.
    {
      const wAttr = img.getAttribute('width');
      const hAttr = img.getAttribute('height');
      const w = parseInt(wAttr!) || 0;
      const h = parseInt(hAttr!) || 0;
      if (wAttr === '0' || hAttr === '0' || (h > 0 && h < 10) || (w > 0 && w < 10)) {
        img.removeAttribute('width');
        img.removeAttribute('height');
      }
    }

    // Skip if already classified (from capture or tab-based refresh)
    // Exception: <picture> images must be reclassified — preserveImageClassifications
    // may have stamped a stale 'small' (matched by alt text) from old placeholder dims.
    if (img.hasAttribute('data-scale-context') && !inPicture) {
      return;
    }
    // Clear any stale classification on <picture> images before reclassifying
    if (inPicture) img.removeAttribute('data-scale-context');

    let context = 'thumbnail'; // Safe default (80px)

    // HEURISTIC 1: Check width/height attributes (HEIGHT-BASED for card layout)
    const width = parseInt(img.getAttribute('width')!) || 0;
    const height = parseInt(img.getAttribute('height')!) || 0;

    // 🔧 FIX: Detect placeholder dimensions (< 10px = aspect ratio markers, not actual sizes)
    // (Zero-dimension attrs already stripped above; this handles 1-9 range for classification)
    const isZeroDimension = false; // already handled above
    const isPlaceholderDimension = (height > 0 && height < 10) || (width > 0 && width < 10);

    if (isPlaceholderDimension || isZeroDimension) {
      // Remove placeholder attributes so CSS can properly size the image
      img.removeAttribute('width');
      img.removeAttribute('height');
      // Fall through to class-based heuristics below
    } else if (height > 0 || width > 0) {
      // Trust the dimensions for classification (they're real pixel values)
      const effectiveHeight = height > 0 ? height : width;
      
      if (effectiveHeight <= 40) {
        context = 'icon';       // 25px - tiny icons
      } else if (effectiveHeight <= 70) {
        context = 'small';      // 48px - avatars, badges
      } else if (effectiveHeight <= 120) {
        context = 'thumbnail';  // 80px - HotUK style deals
      } else if (effectiveHeight <= 250) {
        context = 'medium';     // 100px - Zoopla houses (229px height → medium)
      } else {
        context = 'preview';    // 150px - Large hero images
      }
      
      img.setAttribute('data-scale-context', context);
      return; // Done with this image
    }
    
    // HEURISTIC 2: Check class names (for images without valid dimensions)
    const className = (img.className || '').toLowerCase();
    const parentClass = (img.parentElement?.className || '').toLowerCase();
    const grandparentClass = (img.parentElement?.parentElement?.className || '').toLowerCase();
    const allClasses = className + ' ' + parentClass + ' ' + grandparentClass;
    
    // Also check src/alt for common patterns
    const src = (img.getAttribute('src') || '').toLowerCase();
    const alt = (img.getAttribute('alt') || '').toLowerCase();
    
    // Icon patterns (25px) - logos, avatars, voting buttons, nav icons
    if (/icon|logo|badge|avatar|symbol|favicon|profile|user|member|author|upvote|vote|score|rating|rank|point|brand|app-icon|site-icon|emoji|arrow|chevron|caret|close|menu|nav-icon|button/.test(allClasses) ||
        /avatar|profile|icon|logo|badge|vote|arrow/.test(src) ||
        /avatar|profile pic|user photo|logo/.test(alt)) {
      context = 'icon';
    }
    // Preview patterns (150px) - only for explicit hero/feature classes
    else if (/hero|featured|banner|cover|main-image|product-hero/.test(allClasses)) {
      context = 'preview';
    }
    // Medium patterns (100px) - property/listing images
    else if (/property|listing|house|estate|real-estate/.test(allClasses)) {
      context = 'medium';
    }
    // Small patterns (48px) - decorative, secondary images
    else if (/small|mini|tiny|decorative|secondary/.test(allClasses)) {
      context = 'small';
    }
    // Thumbnail patterns (80px) - default for cards, products, deals
    else if (/thumb|card|tile|grid-item|product|item-image|deal|offer|preview/.test(allClasses)) {
      context = 'thumbnail';
    }
    // HEURISTIC 3: Check parent context
    else {
      const article = img.closest('article, [class*="card"], [class*="listing"], [class*="property"], [class*="deal"]');
      const nav = img.closest('nav, header, footer, [class*="menu"], [class*="nav"], [class*="sidebar"]');
      
      if (nav) {
        context = 'icon';
      } else if (article) {
        // In article/card - default to thumbnail (80px)
        context = 'thumbnail';
      } else {
        // Default fallback - thumbnail (80px) is safest
      }
    }
    
    // HEURISTIC 4: srcset max-width upgrade (thumbnail → preview only)
    // Large editorial images on news sites carry high `w` srcset descriptors but no class names
    // or dimension attrs — they fall to thumbnail by default. A max-width ≥ 400w signals a
    // full editorial image. 400w is safe: AS.com observed floor = 488w across 5 sessions.
    // Never overrides icon/small/medium — those are set by upstream heuristics before this point.
    // No <picture> source lookup in v1 — img srcset only, to keep scope narrow and safe.
    if (context === 'thumbnail') {
      const maxW = getMaxSrcsetWidth(img);
      if (maxW >= 400) {
        context = 'preview';
      }
    }

    const srcset = img.getAttribute('srcset');
    if (srcset) {
      console.log('[SpotBoard] classifyFallback:', {
        context,
        src: img.getAttribute('src'),
        srcset,
        classes: allClasses.trim(),
      });
    }
    if (inPicture) {
      console.log('[SpotBoard] classifyPicture:', {
        widthAttr: img.getAttribute('width'),
        heightAttr: img.getAttribute('height'),
        currentSrc: img.currentSrc || null,
        context,
        classes: img.className.substring(0, 60),
      });
    }
    img.setAttribute('data-scale-context', context);
  });

  return temp.innerHTML;
}


interface SanitizationComponent {
  excludedSelectors?: string[];
  html_cache?: string;
}

/**
 * Apply the full sanitization pipeline to refreshed HTML content.
 * Consolidates the 4-step sequence that was previously duplicated across
 * all refresh paths in refresh-engine.js.
 * 
 * Pipeline: applyExclusions → preserveImageClassifications → classifyImagesForRefresh → cleanupDuplicates
 * 
 * @param inputHtml - The raw HTML from a refresh (fetch, background tab, or active tab)
 * @param component - The component metadata object (needs .excludedSelectors and .html_cache)
 * @returns Sanitized HTML ready for storage and display
 */
export function applySanitizationPipeline(inputHtml: string, component: SanitizationComponent): string {
  const withExclusions = applyExclusions(inputHtml, component.excludedSelectors);
  const withPreserved = preserveImageClassifications(withExclusions, component.html_cache || '');
  const withImageClassification = classifyImagesForRefresh(withPreserved);
  return cleanupDuplicates(withImageClassification);
}
