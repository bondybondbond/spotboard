// Shared DOM snapshot utilities — single source of truth for capture + refresh paths.
// Compiled to public/utils/dom-snapshot.js (IIFE) by scripts/build-shared.js.
// Used in content.ts (capture) and refresh-engine.js (all 3 tab tiers).
//
// Phase 1: cloneWithShadow, promoteLazyImages, promoteBackgroundImages
// Phase 2: classifyImages (unified container-walk classification for capture + refresh)

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
 * Stamps data-scale-context using rendered height (live DOM) or data-bg-h attribute (detached clone).
 * Cleans up data-bg-w / data-bg-h pre-stamped attributes after reading them.
 * NOTE: removeProperty intentionally skipped — avoids live-DOM visual mutation on refresh paths.
 *
 * @param el    Root element to search within
 * @param label Refresh context label for console log (e.g. 'tab-refresh', 'capture')
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
    // Classify: live DOM has real getBoundingClientRect height; detached clone falls back to data-bg-h.
    const liveRect = (bgEl as HTMLElement).getBoundingClientRect?.();
    const bgH = (liveRect && liveRect.height > 0)
      ? liveRect.height
      : parseInt((bgEl as HTMLElement).getAttribute?.('data-bg-h') || '0');
    if (bgH > 0) {
      const bgCtx = bgH >= 200 ? 'preview' : bgH >= 100 ? 'medium' : 'thumbnail';
      img.setAttribute('data-scale-context', bgCtx);
    }
    // Clean up pre-stamped dimension attributes (capture clone path — no-op on live DOM)
    (bgEl as HTMLElement).removeAttribute?.('data-bg-w');
    (bgEl as HTMLElement).removeAttribute?.('data-bg-h');
    bgEl.appendChild(img);
    console.log(`[SpotBoard] bg-image promoted to img (${label}):`, url.substring(0, 80));
  });
}

/**
 * Classifies all <img> descendants with a data-scale-context tier (icon/small/thumbnail/medium/preview).
 * Uses a container walk (1.3× height ratio) to find the card-level container, avoiding over-broad
 * wrappers like full-page <section> elements. Includes a zero-height fallback for <picture> elements
 * (display:inline, height=0) and CSS padding-top aspect-ratio containers.
 * Skips images already stamped with data-scale-context.
 * Works on live DOM only — getBoundingClientRect() returns zero on detached clones.
 *
 * @param root Element to classify images within (the extracted card root)
 */
export function classifyImages(root: Element): void {
  root.querySelectorAll('img').forEach(img => {
    if (img.hasAttribute('data-scale-context')) return; // already classified
    try {
      const imgRect = img.getBoundingClientRect();
      const imageArea = imgRect.width * imgRect.height;
      const imgHeight = imgRect.height;

      // Container walk: first ancestor meaningfully taller than the image (1.3× threshold).
      // Avoids over-broad containers like full-page <section> wrappers that inflate the denominator.
      let container: Element | null = img.parentElement;
      let walkEl: Element | null = img.parentElement;
      while (walkEl && walkEl !== root) {
        const r = walkEl.getBoundingClientRect();
        if (r.height > imgRect.height * 1.3) { container = walkEl; break; }
        walkEl = walkEl.parentElement;
      }
      if (!container) { img.setAttribute('data-scale-context', 'icon'); return; }

      // Zero-height fallback: <picture> is display:inline (height=0); CSS padding-top containers also hit 0.
      // Walk up to find the nearest ancestor with positive rendered height.
      // If none found before root, classify directly by image height.
      let containerRect = container.getBoundingClientRect();
      if (containerRect.height === 0) {
        let fallbackEl: Element | null = container.parentElement;
        while (fallbackEl && fallbackEl !== root) {
          const r = fallbackEl.getBoundingClientRect();
          if (r.height > 0) { container = fallbackEl; containerRect = r; break; }
          fallbackEl = fallbackEl.parentElement;
        }
        if (containerRect.height === 0) {
          const ctx = imgHeight >= 200 ? 'preview' : imgHeight >= 100 ? 'medium'
            : imgHeight >= 70 ? 'thumbnail' : imgHeight >= 40 ? 'small' : 'icon';
          img.setAttribute('data-scale-context', ctx);
          return;
        }
      }

      const containerArea = containerRect.width * containerRect.height;
      const areaRatio = containerArea > 0 ? imageArea / containerArea : 0;

      let context: string;
      if (imgHeight < 40 || imageArea < 1600)          context = 'icon';
      else if (imgHeight < 70 || imageArea < 4900)     context = 'small';
      else if (areaRatio < 0.10)                       context = 'small';
      else if (areaRatio < 0.25 || imageArea < 15000)  context = 'thumbnail';
      else if (areaRatio < 0.50 || imageArea < 40000)  context = 'medium';
      else                                             context = 'preview';

      img.setAttribute('data-scale-context', context);
    } catch (e) {
      img.setAttribute('data-scale-context', 'icon');
    }
  });
}
