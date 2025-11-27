console.log("🚀 ComponentCanvas: Content Script V5 (RESET) Loaded");

let isCapturing = false;


// Generate a specific CSS selector for an element
function generateSelector(element: HTMLElement): string {
  // Priority 1: ID (most specific)
  if (element.id) {
    return `#${element.id}`;
  }
  
  // Build base selector: tag + classes + data attributes
  let baseSelector = buildBaseSelector(element);
  
  // Check if selector is unique on the page
  const matches = document.querySelectorAll(baseSelector);
  
  if (matches.length === 1) {
    console.log('🎯 Generated unique selector:', baseSelector);
    return baseSelector;
  }
  
  console.log(`⚠️ Selector "${baseSelector}" matches ${matches.length} elements, adding context...`);
  
  // Not unique - try adding nth-of-type
  const parent = element.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children).filter(
      child => child.matches(baseSelector.split('[')[0]) // Match by tag.class without attrs
    );
    const index = siblings.indexOf(element) + 1;
    
    if (index > 0) {
      const nthSelector = `${baseSelector}:nth-of-type(${index})`;
      const nthMatches = document.querySelectorAll(nthSelector);
      
      if (nthMatches.length === 1) {
        console.log('🎯 Generated unique selector with nth-of-type:', nthSelector);
        return nthSelector;
      }
    }
  }
  
  // Still not unique - build path from unique ancestor
  const pathSelector = buildPathFromUniqueAncestor(element, baseSelector);
  if (pathSelector) {
    console.log('🎯 Generated unique selector with ancestor path:', pathSelector);
    return pathSelector;
  }
  
  // Last resort: return base selector (fingerprint will catch mismatches)
  console.log('⚠️ Could not make selector unique, using:', baseSelector);
  return baseSelector;
}

// Helper: Build base selector (tag + classes + data attrs)
function buildBaseSelector(element: HTMLElement): string {
  let selector = element.tagName.toLowerCase();
  
  // Add classes (max 3 to avoid overly specific selectors)
  if (element.classList.length > 0) {
    const classes = Array.from(element.classList)
      .filter(c => !c.includes('hover') && !c.includes('active')) // Skip state classes
      .slice(0, 3);
    if (classes.length > 0) {
      selector += '.' + classes.join('.');
    }
  }
  
  // Add key data attributes (very useful for modern sites like BBC)
  const usefulAttrs = ['data-testid', 'data-component', 'data-section', 'data-module', 'data-type', 'data-t', 'role'];
  for (const attr of usefulAttrs) {
    if (element.hasAttribute(attr)) {
      const value = element.getAttribute(attr);
      selector += `[${attr}="${value}"]`;
      break; // One data attr is usually enough
    }
  }
  
  return selector;
}

// Helper: Walk up DOM to find unique ancestor, build path
function buildPathFromUniqueAncestor(element: HTMLElement, baseSelector: string): string | null {
  let current = element.parentElement;
  const pathParts: string[] = [baseSelector];
  
  while (current && current.tagName !== 'BODY' && current.tagName !== 'HTML') {
    // Check if this ancestor has an ID
    if (current.id) {
      pathParts.unshift(`#${current.id}`);
      const fullPath = pathParts.join(' > ');
      if (document.querySelectorAll(fullPath).length === 1) {
        return fullPath;
      }
    }
    
    // Check for unique data attributes on ancestor
    const usefulAttrs = ['data-testid', 'data-component', 'data-section', 'data-module', 'data-type'];
    for (const attr of usefulAttrs) {
      if (current.hasAttribute(attr)) {
        const ancestorSelector = `${current.tagName.toLowerCase()}[${attr}="${current.getAttribute(attr)}"]`;
        pathParts.unshift(ancestorSelector);
        const fullPath = pathParts.join(' > ');
        if (document.querySelectorAll(fullPath).length === 1) {
          return fullPath;
        }
        pathParts.shift(); // Remove if not unique
      }
    }
    
    // Add parent to path and continue up
    const parentSelector = buildBaseSelector(current);
    pathParts.unshift(parentSelector);
    
    // Check if path is now unique
    const fullPath = pathParts.join(' > ');
    if (document.querySelectorAll(fullPath).length === 1) {
      return fullPath;
    }
    
    // Limit depth to avoid overly long selectors
    if (pathParts.length > 4) {
      break;
    }
    
    current = current.parentElement;
  }
  
  return null;
}

// 1. Hover Handler (The Red Box)
function handleHover(event: MouseEvent) {
  if (!isCapturing) return;
  const target = event.target as HTMLElement;
  
  // Visuals
  target.style.setProperty('outline', '5px solid red', 'important');
  target.style.cursor = 'crosshair';
  
  // Debug
  console.log("🔍 Hover:", target.tagName);
  
  event.stopPropagation();
}

// 2. Exit Handler (Cleanup)
function handleExit(event: MouseEvent) {
  if (!isCapturing) return;
  const target = event.target as HTMLElement;
  target.style.outline = '';
}

// 3. Click Handler (The Save)
// Sanitize captured HTML - remove capture artifacts
function sanitizeHTML(element: HTMLElement): string {
  // Clone the element to avoid modifying the original
  const clone = element.cloneNode(true) as HTMLElement;
  
  // Remove all capture-related inline styles from clone and descendants
  const allElements = [clone, ...Array.from(clone.querySelectorAll('*'))];
  
  allElements.forEach(el => {
    if (el instanceof HTMLElement) {
      // Remove cursor styles
      el.style.removeProperty('cursor');
      
      // Remove outline styles (our capture indicators)
      el.style.removeProperty('outline');
      
      // Clean up empty style attributes
      if (el.style.length === 0) {
        el.removeAttribute('style');
      }
    }
  });
  
  return clone.outerHTML;
}

function handleClick(event: MouseEvent) {
  if (!isCapturing) return;
  
  event.preventDefault();
  event.stopPropagation();
  
  const target = event.target as HTMLElement;
  
  // Green Flash
  target.style.setProperty('outline', '5px solid #00ff00', 'important');
  
  // Generate smart label using Option 1 strategy
  let name = '';
  
  // Strategy 1: Check if element itself is a heading
  if (/^H[1-6]$/i.test(target.tagName)) {
    const text = target.textContent?.trim();
    if (text) {
      name = text.length > 50 ? text.substring(0, 50) + '...' : text;
    }
  }
  
  // Strategy 2: Look for first heading inside element
  if (!name) {
    const heading = target.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading?.textContent?.trim()) {
      const text = heading.textContent.trim();
      name = text.length > 50 ? text.substring(0, 50) + '...' : text;
    }
  }
  
  // Strategy 3: Get first meaningful text (skip empty/whitespace-only nodes)
  if (!name) {
    // Try to get first text node with actual content
    const walker = document.createTreeWalker(
      target,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const text = node.textContent?.trim();
          return text && text.length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
      }
    );
    
    const firstTextNode = walker.nextNode();
    if (firstTextNode?.textContent?.trim()) {
      const text = firstTextNode.textContent.trim();
      name = text.length > 50 ? text.substring(0, 50) + '...' : text;
    }
  }
  
  // Strategy 4: Fallback to generic label
  if (!name) {
    name = `Component from ${window.location.hostname}`;
  }
  
  const selector = generateSelector(target); // Smart selector for refresh
  
  // ✨ SANITIZE HTML BEFORE STORING
  const cleanedHTML = sanitizeHTML(target);
  
  const component = {
    id: crypto.randomUUID(),
    url: window.location.href,
    selector: selector,
    name: name,
    html_cache: cleanedHTML,
    last_updated: new Date().toISOString()
  };

  // Save
  chrome.storage.local.get(['components'], (result) => {
    const list = Array.isArray(result.components) ? result.components : [];
    list.push(component);
    chrome.storage.local.set({ components: list }, () => {
      // Clear green flash
      target.style.outline = '';
      target.style.cursor = '';
      
      alert(`✅ Saved: ${name}`);
      toggleCapture(false); // Turn off after save
    });
  });
}

// 4. Escape Key Handler
function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && isCapturing) {
    toggleCapture(false);
    alert("❌ Capture Cancelled");
  }
}

// Main Toggle Logic
function toggleCapture(forceState?: boolean) {
  isCapturing = forceState !== undefined ? forceState : !isCapturing;
  
  if (isCapturing) {
    console.log("🟢 Capture Mode: ON");
    document.addEventListener('mouseover', handleHover, true);
    document.addEventListener('mouseout', handleExit, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeydown, true);
  } else {
    console.log("🔴 Capture Mode: OFF");
    document.removeEventListener('mouseover', handleHover, true);
    document.removeEventListener('mouseout', handleExit, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleKeydown, true);
    
    // Force cleanup all visuals
    document.querySelectorAll('*').forEach(el => {
      (el as HTMLElement).style.outline = '';
      (el as HTMLElement).style.cursor = '';
    });
  }
}

// Message Listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.message === "TOGGLE_CAPTURE" || request.type === "TOGGLE_CAPTURE") {
    toggleCapture();
  }
});