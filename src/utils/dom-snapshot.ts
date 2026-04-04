// Shared DOM snapshot utilities — single source of truth for capture + refresh paths.
// Compiled to public/utils/dom-snapshot.js (IIFE) by scripts/build-shared.js.
// Used in content.ts (capture) and refresh-engine.js (all 3 tab tiers).
//
// Phase 1: cloneWithShadow, promoteLazyImages, promoteBackgroundImages
// Phase 2 (future): findClippingAncestor, classifyImages

/**
 * Flattens open shadow DOM into light DOM for static capture.
 * Replaces <slot name="X"> with matching light DOM [slot="X"] children,
 * and the default <slot> with unslotted children.
 * Closed shadow roots (el.shadowRoot === null) fall through gracefully.
 * Not suitable for re-hydrating components — snapshot semantics only.
 */
export function cloneWithShadow(el: Element): Element {
  const clone = el.cloneNode(false) as Element;
  const host = el as HTMLElement;
  if (host.shadowRoot) {
    // Shadow content is trusted (same-origin browser DOM, sanitised downstream by cleanupDuplicates).
    const temp = document.createElement('div');
    temp.innerHTML = host.shadowRoot.innerHTML;

    // Named slots → substitute matching light DOM children
    temp.querySelectorAll('slot[name]').forEach(slot => {
      const slotName = slot.getAttribute('name')!;
      const assigned = Array.from(el.children).filter(
        c => c.getAttribute('slot') === slotName
      );
      if (assigned.length > 0) {
        const frag = document.createDocumentFragment();
        assigned.forEach(c => {
          const childClone = cloneWithShadow(c);
          childClone.removeAttribute('slot'); // clean HTML — slot attr is meaningless outside shadow
          frag.appendChild(childClone);
        });
        slot.replaceWith(frag);
      } else if (!slot.hasChildNodes()) {
        slot.remove(); // empty fallback — drop it
      }
      // else: keep slot's fallback children as-is
    });

    // Default (unnamed) slot → substitute unslotted light DOM children
    const defaultSlot = temp.querySelector('slot:not([name])');
    if (defaultSlot) {
      const unslotted = Array.from(el.childNodes).filter(n => {
        if (n.nodeType === Node.ELEMENT_NODE) {
          return !(n as Element).hasAttribute('slot');
        }
        return n.nodeType === Node.TEXT_NODE;
      });
      if (unslotted.length > 0) {
        const frag = document.createDocumentFragment();
        unslotted.forEach(n => {
          if (n.nodeType === Node.ELEMENT_NODE) {
            frag.appendChild(cloneWithShadow(n as Element));
          } else {
            frag.appendChild(n.cloneNode(true));
          }
        });
        defaultSlot.replaceWith(frag);
      }
    }

    while (temp.firstChild) clone.appendChild(temp.firstChild);
  } else {
    for (const child of el.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        clone.appendChild(cloneWithShadow(child as Element));
      } else {
        clone.appendChild(child.cloneNode(true));
      }
    }
  }
  return clone;
}

/**
 * Converts lazy-load data attributes to src on all <img> descendants.
 * Works on both live DOM (refresh paths) and detached clones (capture path).
 * Priority order: data-image > data-src > data-lazy-src > data-original > data-lazy
 */
export function promoteLazyImages(el: Element): void {
  const lazyAttrs = ['data-image', 'data-src', 'data-lazy-src', 'data-original', 'data-lazy'];
  el.querySelectorAll('img').forEach(img => {
    for (const attr of lazyAttrs) {
      const lazyUrl = img.getAttribute(attr);
      if (lazyUrl && lazyUrl.trim()) {
        try {
          const resolvedUrl = new URL(lazyUrl, window.location.href).href;
          img.setAttribute('src', resolvedUrl);
          break; // stop after first match
        } catch (e) {
          // Invalid URL — skip
        }
      }
    }
  });
}

/**
 * Promotes inline background-image CSS to an injected <img> element.
 * Guards: single-layer http/https URLs only; skips multi-layer, gradients, data URIs.
 * NOTE: does NOT stamp data-scale-context or do classification — that is Phase 2.
 * NOTE: removeProperty intentionally skipped — safe for live DOM paths (no visual repaint wanted).
 *
 * @param el    Root element to search within
 * @param label Refresh context label for console log (e.g. 'tab-refresh', 'offscreen-refresh')
 */
export function promoteBackgroundImages(el: Element, label: string): void {
  el.querySelectorAll('[style*="background-image"]').forEach(bgEl => {
    if (bgEl.querySelector('img')) return; // already has img child
    const bgVal = (bgEl instanceof HTMLElement) ? bgEl.style.backgroundImage : '';
    // Skip multi-layer backgrounds (multiple url() calls) and non-url() values.
    // NOTE: cannot use bgVal.includes(',') — Cloudinary URLs contain commas in transform params.
    if (!bgVal || !bgVal.trim().startsWith('url(') || (bgVal.match(/url\(/g) || []).length !== 1) return;
    const match = bgVal.match(/url\(['"]?([^'")\s]+)['"]?\)/);
    if (!match) return;
    const url = match[1];
    if (!url || !url.startsWith('http')) return;
    const img = document.createElement('img');
    img.src = url;
    img.style.cssText = 'width:100%;height:auto;display:block;max-width:100%';
    bgEl.appendChild(img);
    console.log(`[SpotBoard] bg-image promoted to img (${label}):`, url.substring(0, 80));
  });
}
