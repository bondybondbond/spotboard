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

// ─── Responsive Card Dedup Helpers ───────────────────────────────────────────

/** Resolve the lead image URL from a DOM subtree.
 *  Checks lazy-load attrs → src → first srcset/data-srcset entry.
 *  Returns a normalized URL (query params stripped, lowercase) or '' if none found. */
function getLeadImageUrl(el: Element): string {
  // Support img-level candidates (el IS the img) and card-level (img is a descendant)
  const img = el.matches('img') ? (el as HTMLImageElement) : el.querySelector('img');
  if (!img) return '';

  // Priority: lazy-load attrs first, then src, then first srcset entry
  // srcset parsing: split on ',' → take [0] → split on whitespace → take [0]
  const srcsetFirst = (raw: string) => raw.split(',')[0]?.trim().split(/\s+/)[0] ?? '';

  const candidates = [
    img.getAttribute('data-src'),
    img.getAttribute('data-lazy-src'),
    img.getAttribute('data-image'),
    img.getAttribute('src'),
    srcsetFirst(img.getAttribute('srcset') || ''),
    srcsetFirst(img.getAttribute('data-srcset') || ''),
  ];

  for (const c of candidates) {
    if (c && !c.startsWith('data:') && c.length > 20) {
      // For CDN transform URLs (e.g. Brightspot dims3, Cloudinary, Imgix), extract the
      // original source URL from the ?url= query param so that different crops of the
      // same photo compare as equal (e.g. NPR square vs wide crop variants).
      const urlParam = c.match(/[?&]url=([^&]+)/)?.[1];
      if (urlParam) {
        try {
          const original = decodeURIComponent(urlParam).toLowerCase().replace(/\/$/, '');
          if (original.length > 20 && !original.startsWith('data:')) return original;
        } catch { /* malformed encoding, fall through */ }
      }
      return c.split('?')[0].toLowerCase().replace(/\/$/, '');
    }
  }
  return '';
}

/** Extract an opening-text fingerprint from an element for fallback matching.
 *  Tries headline, then first link text, then raw textContent prefix.
 *  Returns '' if the result is under 10 chars (blocks boilerplate like "Listen", "Read more"). */
function getOpeningText(el: Element): string {
  const headline = el.querySelector('h1,h2,h3,h4,h5,h6');
  if (headline?.textContent?.trim()) {
    const t = headline.textContent.trim().toLowerCase().replace(/\s+/g, ' ');
    return t.length >= 10 ? t : '';
  }
  const link = el.querySelector('a[href]');
  if (link?.textContent?.trim()) {
    const t = link.textContent.trim().toLowerCase().replace(/\s+/g, ' ').substring(0, 80);
    return t.length >= 10 ? t : '';
  }
  const t = (el.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 60);
  return t.length >= 10 ? t : '';
}

/** Check whether two sibling elements are responsive-layout duplicates of the same article.
 *  Returns a confidence-tagged result rather than a boolean so callers can tier their response.
 *
 *  High / img+link : same lead image AND both have links AND links match (definitive responsive pair)
 *  Low  / img+text : same lead image AND no usable links AND opening text strictly matches
 *  No match        : images match but links differ (different articles sharing stock photo) */
function isResponsiveDuplicate(
  a: Element,
  b: Element,
): { match: boolean; confidence: 'high' | 'low'; reason: string } {
  const NO_MATCH = { match: false, confidence: 'high' as const, reason: '' };

  const imgA = getLeadImageUrl(a);
  const imgB = getLeadImageUrl(b);
  if (!imgA || imgA !== imgB) return NO_MATCH;

  // Three-path link resolution (all required for Chorus CMS variants):
  // ↓ querySelector: link inside candidate (card-level, e.g. The Verge)
  // ↑ closest: candidate inside an <a> (SBNation img-in-link structure)
  // ↑↑ parent walk: link is a sibling in a shared card ancestor (Vox img-sibling structure)
  const linkHref = (el: Element): string => {
    const desc = (el.querySelector('a[href]') as HTMLAnchorElement | null)?.href;
    if (desc) return desc;
    const anc = (el.closest('a[href]') as HTMLAnchorElement | null)?.href;
    if (anc) return anc;
    // Walk up max 3 levels: stops at image-container → card → grid
    let p = el.parentElement;
    for (let i = 0; i < 3 && p; i++, p = p.parentElement) {
      const sibLink = (p.querySelector('a[href]') as HTMLAnchorElement | null)?.href;
      if (sibLink) return sibLink;
    }
    return '';
  };
  const linkA = linkHref(a);
  const linkB = linkHref(b);

  if (linkA && linkB) {
    // Same article href = definitive responsive pair
    if (linkA === linkB) return { match: true, confidence: 'high', reason: 'img+link' };
    // Different href = different articles sharing a stock photo — do NOT dedup
    return NO_MATCH;
  }

  // Fallback for no-link image cards: strict opening-text equality
  const tA = getOpeningText(a);
  const tB = getOpeningText(b);
  if (tA && tA === tB) return { match: true, confidence: 'low', reason: 'img+text' };

  return NO_MATCH;
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
    '[class*="Controls_"]',       // CSS module controls pattern

    // 🎯 NPR BRIGHTSPOT CAPTION UI (CSS-hidden elements that appear in direct-fetch)
    // NPR renders each article image with a hidden expandable caption (div.caption)
    // and toggle UI. Without CSS, div.caption (long desc + duplicate credit) + toggle
    // buttons all become visible. span.credit (always-visible short credit) is kept.
    'div.caption[aria-label="Image caption"]', // Hidden expanded caption with long description
    'b.toggle-caption',                        // "toggle caption" button text
    'b.hide-caption',                          // "hide caption" button text
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

  // 🎯 RESPONSIVE CARD DEDUP: detect mobile/desktop duplicate siblings.
  // Chorus CMS (Vox, The Verge, SBNation) + NPR Brightspot render the same article in 2+ sibling
  // variants using hashed CSS module classes that are invisible to selector-based dedup.
  // Without CSS, all variants are visible → articles appear twice.
  // v1: log only. Remove the TODO gate once console logs confirm correct matches.
  temp.querySelectorAll('*').forEach(parent => {
    const children = Array.from(parent.children);
    if (children.length < 2) return;

    const seenByImg = new Map<string, Element>();

    children.forEach(child => {
      const imgUrl = getLeadImageUrl(child);
      if (!imgUrl) return;

      if (seenByImg.has(imgUrl)) {
        const first = seenByImg.get(imgUrl)!;
        const result = isResponsiveDuplicate(first, child);
        if (result.match) {
          const hasLinksA = !!first.querySelector('a[href]');
          const hasLinksB = !!child.querySelector('a[href]');
          const textA = getOpeningText(first);
          const tag = result.confidence === 'high' ? 'dedupCandidate' : 'possibleResponsiveDuplicate';
          console.log(`[SpotBoard] ${tag}:`, {
            reason: result.reason,
            img: imgUrl.substring(imgUrl.lastIndexOf('/') + 1),
            firstLink: (first.querySelector('a[href]') as HTMLAnchorElement | null)?.href?.substring(0, 80),
            hasLinksA,
            hasLinksB,
            textLength: textA.length,
            parentTag: parent.tagName,
            parentClass: (parent.className as string).substring(0, 60),
          });
          if (result.confidence === 'high') child.remove();
        }
      } else {
        seenByImg.set(imgUrl, child);
      }
    });
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

      // Strip display:none from images.
      // Carousel libraries (Owl, Swiper, Slick) hide inactive slides with inline display:none
      // and restore via external CSS (.active img { display:block !important }).
      // Without the external CSS in the dashboard, display:none wins → image invisible.
      if (el.tagName === 'IMG') {
        newStyle = newStyle.replace(/\bdisplay\s*:\s*none\s*;?/gi, '');
      }
      
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
        if (lazyUrl && lazyUrl.trim()) {
          // Resolve relative URLs (e.g. resized_xxx.JPG) against the source page URL
          try {
            const resolvedUrl = new URL(lazyUrl, sourceUrl).href;
            img.setAttribute('src', resolvedUrl);
            break; // Stop after first match
          } catch (e) {
            // Invalid URL - skip
          }
        }
      }
    });
    
    // 🎯 FIX LAZY-LOADED PICTURE SOURCES: Copy data-srcset → srcset on <source> elements
    // ESPN and many news sites use <source data-srcset="..."> with JS (lazyload.js) copying to
    // srcset when in-view. At direct-fetch time JS hasn't run, so srcset is empty and the
    // <picture> displays nothing. Copying data-srcset → srcset activates the image in dashboard.
    container.querySelectorAll('source[data-srcset]').forEach(source => {
      if (!source.getAttribute('srcset')) {
        const dataSrcset = source.getAttribute('data-srcset') || '';
        if (dataSrcset.trim()) {
          source.setAttribute('srcset', dataSrcset);
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
  // Strip any previously applied sentiment tags and normalize text nodes.
  // Handles old-style ancestor-tagged elements (pre-v1.3.7) and makes retag idempotent.
  element.querySelectorAll('[data-sb-sentiment]').forEach(el => {
    el.removeAttribute('data-sb-sentiment');
  });
  element.normalize();

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

  // Collect all text nodes first — modifying DOM during walker traversal is undefined behaviour
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent?.trim() || '';
    if (text.length === 0) continue;
    textNodes.push(node as Text);
  }

  // Unified token pattern: +/- followed by digits (with optional decimal/comma and %)
  // (?<!\w) — sign must not be preceded by a word char (blocks "3-0", "10-year", "USD+1.50")
  // (?<!\±) — exclude ± prefix
  const tokenPattern = /(?<!\w)(?<!\±)([+-])(\d[\d.,]*)(%?)/g;

  let tagged = 0;
  for (const textNode of textNodes) {
    const text = textNode.textContent || '';
    const matches: Array<{ index: number; match: string; sentiment: 'positive' | 'negative' }> = [];

    tokenPattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = tokenPattern.exec(text))) {
      const sentiment = m[1] === '+' ? 'positive' : 'negative';
      matches.push({ index: m.index, match: m[0], sentiment });
    }

    if (matches.length === 0) continue;

    // Wrap each matching token in an inline span — only the token is coloured, not surrounding text
    const parent = textNode.parentNode;
    if (!parent) continue;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    for (const { index, match, sentiment } of matches) {
      if (index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, index)));
      }
      const span = document.createElement('span');
      span.setAttribute('data-sb-sentiment', sentiment);
      span.textContent = match;
      fragment.appendChild(span);
      lastIndex = index + match.length;
    }

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    parent.replaceChild(fragment, textNode);
    tagged += matches.length;
  }

  if (tagged > 0) {
    console.log(`✅ Tagged ${tagged} sentiment token(s)`);
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
/** Returns the largest `w` descriptor from an element's srcset, or 0 if none/density-only. */
function getMaxSrcsetWidth(el: Element): number {
  const srcsetVal = el.getAttribute('srcset') || '';
  if (!srcsetVal) return 0;
  return Math.max(
    0,
    ...srcsetVal.split(',').map(entry => {
      const match = entry.trim().match(/(\d+)w\s*$/); // `w` descriptor only; density (2x) → 0
      return match ? parseInt(match[1], 10) : 0;
    })
  );
}

/**
 * Forces the largest available <source> URL into img.src for card storage.
 * Selects by actual image pixel width (CDN URL dimensions, w-descriptor) — NOT by min-width
 * breakpoint. NBC/Cloudinary pattern: (min-width:758px)→t_focal-1000x563 is larger than
 * (min-width:1240px)→t_focal-860x484, so highest breakpoint ≠ largest image.
 * Guard: only mutates if a larger URL is found and differs from the current img.src.
 * Returns true if the picture was flattened (sources removed).
 */
function resolveLargestPictureSourceForCard(picture: Element, img: HTMLImageElement): boolean {
  const sources = [...picture.querySelectorAll<HTMLSourceElement>('source[srcset]')];
  if (!sources.length) return false;

  let largestUrl: string | null = null;
  let bestActualWidth = -1;

  for (const source of sources) {
    const srcset = source.getAttribute('srcset') || '';
    const parts = srcset.trim().split(/\s+/);
    const url = parts[0];
    if (!url || !url.startsWith('http')) continue;
    // Determine actual image pixel width — highest wins.
    // Priority: w-descriptor > Cloudinary t_focal-WxH > generic WxH path > min-width fallback.
    let actualWidth = 0;
    const wDesc = parts[1];
    if (wDesc && /^\d+w$/i.test(wDesc)) actualWidth = parseInt(wDesc);
    if (!actualWidth) actualWidth = extractWidthFromCdnUrl(url);
    if (!actualWidth) {
      const wp = url.match(/[?&]w=(\d+)/i);
      if (wp) actualWidth = parseInt(wp[1]);
    }
    if (!actualWidth) {
      const media = source.getAttribute('media') || '';
      const mw = media.match(/min-width\s*:\s*(\d+)/);
      actualWidth = mw ? parseInt(mw[1], 10) : 0;
    }
    if (actualWidth > bestActualWidth) { bestActualWidth = actualWidth; largestUrl = url; }
  }

  // Fallback: no valid URLs found → use first source's srcset URL
  if (!largestUrl) {
    largestUrl = (sources[0].getAttribute('srcset') || '').trim().split(/\s+/)[0] || null;
  }

  const originalSrc = img.getAttribute('src');
  if (largestUrl && largestUrl !== originalSrc) {
    img.setAttribute('src', largestUrl);
    sources.forEach(s => s.remove()); // prevent narrow card from overriding with smallest source
    console.log('[SpotBoard] picture flattened to largest source:', largestUrl.substring(0, 80));
    return true;
  }
  return false;
}

/**
 * Extracts image width from CDN URL transform patterns that don't use `w` descriptors.
 * Covers Cloudinary focal/fit transforms (t_focal-860x484) and generic WxH path segments.
 */
function extractWidthFromCdnUrl(url: string): number {
  // Cloudinary: t_focal-860x484, t_fit-760w, t_scale-500x, t_fill-300x200, etc.
  const cld = url.match(/t_(?:focal|fit|scale|fill|pad|crop|thumb)-(\d+)(?:x\d+|w\b)/i);
  if (cld) return parseInt(cld[1], 10);
  // Generic WxH in path segments: /860x484/, -860x484., _860x484_
  const generic = url.match(/[/_-](\d{3,4})x(\d{2,4})[/_.\-?&]/);
  if (generic) return parseInt(generic[1], 10);
  return 0;
}

/**
 * Returns the largest image width signal from an img and, for <picture> images,
 * its <source> siblings. Checks both standard `w` descriptors, CDN `&w=N` query
 * params (e.g. ESPN combiner: `?img=...&w=660&h=26`), and CDN URL transform patterns
 * (e.g. Cloudinary `t_focal-860x484`).
 */
function getMaxSourceWidth(img: HTMLImageElement): number {
  let maxW = getMaxSrcsetWidth(img);
  // CDN w= query param on img srcset (future-proofing for CDN-style img srcset)
  const mImg = (img.getAttribute('srcset') || '').match(/[?&]w=(\d+)/i);
  if (mImg) maxW = Math.max(maxW, parseInt(mImg[1], 10));

  // CDN URL dimension extraction on img src (Cloudinary t_focal-WxH, generic WxH)
  maxW = Math.max(maxW, extractWidthFromCdnUrl(img.getAttribute('src') || ''));

  const picture = img.closest('picture');
  if (picture) {
    picture.querySelectorAll('source').forEach(source => {
      // Standard w-descriptor: "url 660w"
      maxW = Math.max(maxW, getMaxSrcsetWidth(source));
      // CDN width query param: "?img=...&w=660&h=26" (ESPN combiner, many CDN patterns)
      const m = (source.getAttribute('srcset') || '').match(/[?&]w=(\d+)/i);
      if (m) maxW = Math.max(maxW, parseInt(m[1], 10));
      // CDN URL dimension extraction on source srcset first URL
      const srcsetUrl = (source.getAttribute('srcset') || '').trim().split(/\s+/)[0];
      if (srcsetUrl) maxW = Math.max(maxW, extractWidthFromCdnUrl(srcsetUrl));
    });
  }
  return maxW;
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

    // Skip if already classified (from capture or tab-based refresh).
    // Non-picture images: preserve classification unless it's 'small'/'icon' (BBC alt-text bug).
    // Picture images: ALWAYS reclassify — allows resolveLargestPictureSourceForCard + HEURISTIC 4
    // to run on every refresh, upgrading 'medium'/'thumbnail' → 'preview' when sources indicate
    // a large CDN image. Without this, a mis-classified 'medium' from initial capture persists.
    if (img.hasAttribute('data-scale-context')) {
      const ctx = img.getAttribute('data-scale-context');
      if (!inPicture && ctx !== 'small' && ctx !== 'icon') return;
      img.removeAttribute('data-scale-context'); // reclassify picture images + small/icon non-pictures
    }

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
    // Uses getMaxSourceWidth to also check <source> srcset and CDN &w= params (ESPN pattern).
    if (context === 'thumbnail') {
      if (getMaxSourceWidth(img) >= 400) context = 'preview';
    }

    // HEURISTIC 5: No-signal content image upgrade (thumbnail → medium)
    // When all prior heuristics leave context as 'thumbnail' and the image has no size attrs,
    // no small-icon class signals, and a URL that looks like an actual image file or CDN path
    // → upgrade to 'medium'. Avoids over-promoting spacers/trackers while improving product
    // images that lack classification signals (e.g. Owl Carousel product images with class="lazy").
    if (context === 'thumbnail') {
      const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
      const hasNoSizeAttrs = !img.getAttribute('width') && !img.getAttribute('height');
      const hasRealSrc = src.length > 20 && !src.startsWith('data:') && !src.startsWith('blob:');
      const hasNoSmallClassSignal = !/(icon|logo|badge|avatar|sprite|thumb(?:nail)?|flag)/i.test(allClasses);
      const hasImageLikePath = /\.(jpe?g|png|webp|gif|avif)/i.test(src) ||
                               /\/images?\//i.test(src) ||
                               /\/products?\//i.test(src) ||
                               /\/resized\//i.test(src);
      if (hasNoSizeAttrs && hasRealSrc && hasNoSmallClassSignal && hasImageLikePath) {
        context = 'medium';
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
      // Flatten <picture> to largest source URL so narrow card context doesn't pick smallest source.
      // Must run BEFORE data-scale-context is set — classification may change after src update.
      const picture = img.closest('picture')!;
      resolveLargestPictureSourceForCard(picture, img);
      console.log('[SpotBoard] classifyPicture:', {
        widthAttr: img.getAttribute('width'),
        heightAttr: img.getAttribute('height'),
        src: img.getAttribute('src')?.substring(0, 80),
        context,
        classes: img.className.substring(0, 60),
      });
    }
    img.setAttribute('data-scale-context', context);
  });

  return temp.innerHTML;
}


/**
 * Promotes inline CSS background-image to a real <img> element for image capture.
 * Covers video thumbnail containers (JW Player .jw-preview, NBC sidebar bg-image divs)
 * and any element using background-image as a visual image container.
 *
 * Guards: only promotes single-layer http/https URLs with no existing <img> child.
 * Multi-layer backgrounds (containing ",") and non-URL values are skipped.
 * Operates on a detached HTML string — safe, no live DOM repaint.
 */
function extractBackgroundImages(html: string): string {
  if (!html || !html.includes('background-image')) return html;
  const temp = document.createElement('div');
  temp.innerHTML = html;
  temp.querySelectorAll<HTMLElement>('[style*="background-image"]').forEach(el => {
    if (el.querySelector('img')) return; // already has img child
    const bgVal = el.style.backgroundImage;
    // Skip multi-layer backgrounds (multiple url() calls) and non-url() values.
    // NOTE: cannot use bgVal.includes(',') — Cloudinary URLs contain commas in transform params
    // (e.g. t_focal-860x484,f_auto,q_auto:best). Count url() occurrences instead.
    if (!bgVal || !bgVal.trim().startsWith('url(') || (bgVal.match(/url\(/g) || []).length !== 1) return;
    const match = bgVal.match(/url\(['"]?([^'")\s]+)['"]?\)/);
    if (!match) return;
    const url = match[1];
    if (!url || !url.startsWith('http')) return; // absolute URLs only
    const img = document.createElement('img');
    img.src = url;
    img.style.cssText = 'width:100%;height:auto;display:block;max-width:100%';
    el.appendChild(img);
    el.style.removeProperty('background-image'); // safe on detached HTML, no live repaint
    console.log('[SpotBoard] bg-image promoted to img:', url.substring(0, 80));
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
 * Pipeline: applyExclusions → extractBackgroundImages → preserveImageClassifications → classifyImagesForRefresh → cleanupDuplicates
 *
 * @param inputHtml - The raw HTML from a refresh (fetch, background tab, or active tab)
 * @param component - The component metadata object (needs .excludedSelectors and .html_cache)
 * @returns Sanitized HTML ready for storage and display
 */
export function applySanitizationPipeline(inputHtml: string, component: SanitizationComponent): string {
  const withExclusions = applyExclusions(inputHtml, component.excludedSelectors);
  const withBgImages = extractBackgroundImages(withExclusions);
  const withPreserved = preserveImageClassifications(withBgImages, component.html_cache || '');
  const withImageClassification = classifyImagesForRefresh(withPreserved);
  return cleanupDuplicates(withImageClassification);
}
