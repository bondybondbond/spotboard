// AUTO-GENERATED from src/utils/dom-snapshot.ts — DO NOT EDIT
var DomSnapshot = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/utils/dom-snapshot.ts
  var dom_snapshot_exports = {};
  __export(dom_snapshot_exports, {
    classifyImages: () => classifyImages,
    cloneWithShadow: () => cloneWithShadow,
    promoteBackgroundImages: () => promoteBackgroundImages,
    promoteLazyImages: () => promoteLazyImages
  });
  function cloneWithShadow(el) {
    const clone = el.cloneNode(false);
    const host = el;
    if (host.shadowRoot) {
      const temp = document.createElement("div");
      temp.innerHTML = host.shadowRoot.innerHTML;
      temp.querySelectorAll("slot[name]").forEach((slot) => {
        const slotName = slot.getAttribute("name");
        const assigned = Array.from(el.children).filter(
          (c) => c.getAttribute("slot") === slotName
        );
        if (assigned.length > 0) {
          const frag = document.createDocumentFragment();
          assigned.forEach((c) => {
            const childClone = cloneWithShadow(c);
            childClone.removeAttribute("slot");
            frag.appendChild(childClone);
          });
          slot.replaceWith(frag);
        } else if (!slot.hasChildNodes()) {
          slot.remove();
        }
      });
      const defaultSlot = temp.querySelector("slot:not([name])");
      if (defaultSlot) {
        const unslotted = Array.from(el.childNodes).filter((n) => {
          if (n.nodeType === Node.ELEMENT_NODE) {
            return !n.hasAttribute("slot");
          }
          return n.nodeType === Node.TEXT_NODE;
        });
        if (unslotted.length > 0) {
          const frag = document.createDocumentFragment();
          unslotted.forEach((n) => {
            if (n.nodeType === Node.ELEMENT_NODE) {
              frag.appendChild(cloneWithShadow(n));
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
          clone.appendChild(cloneWithShadow(child));
        } else {
          clone.appendChild(child.cloneNode(true));
        }
      }
    }
    return clone;
  }
  function promoteLazyImages(el) {
    const lazyAttrs = ["data-image", "data-src", "data-lazy-src", "data-original", "data-lazy"];
    el.querySelectorAll("img").forEach((img) => {
      for (const attr of lazyAttrs) {
        const lazyUrl = img.getAttribute(attr);
        if (lazyUrl && lazyUrl.trim()) {
          try {
            const resolvedUrl = new URL(lazyUrl, window.location.href).href;
            img.setAttribute("src", resolvedUrl);
            break;
          } catch (e) {
          }
        }
      }
    });
  }
  function promoteBackgroundImages(el, label) {
    el.querySelectorAll('[style*="background-image"]').forEach((bgEl) => {
      if (bgEl.querySelector("img")) return;
      const bgVal = bgEl instanceof HTMLElement ? bgEl.style.backgroundImage : "";
      if (!bgVal || !bgVal.trim().startsWith("url(") || (bgVal.match(/url\(/g) || []).length !== 1) return;
      const match = bgVal.match(/url\(['"]?([^'")\s]+)['"]?\)/);
      if (!match) return;
      const url = match[1];
      if (!url || !url.startsWith("http")) return;
      const img = document.createElement("img");
      img.src = url;
      img.style.cssText = "width:100%;height:auto;display:block;max-width:100%";
      const liveRect = bgEl.getBoundingClientRect?.();
      const bgH = liveRect && liveRect.height > 0 ? liveRect.height : parseInt(bgEl.getAttribute?.("data-bg-h") || "0");
      if (bgH > 0) {
        const bgCtx = bgH >= 200 ? "preview" : bgH >= 100 ? "medium" : "thumbnail";
        img.setAttribute("data-scale-context", bgCtx);
      } else {
        img.setAttribute("data-scale-context", "thumbnail");
      }
      bgEl.removeAttribute?.("data-bg-w");
      bgEl.removeAttribute?.("data-bg-h");
      bgEl.appendChild(img);
      console.log(`[SpotBoard] bg-image promoted to img (${label}):`, url.substring(0, 80));
    });
  }
  function classifyImages(root) {
    root.querySelectorAll("img").forEach((img) => {
      if (img.hasAttribute("data-scale-context")) return;
      try {
        const imgRect = img.getBoundingClientRect();
        const imageArea = imgRect.width * imgRect.height;
        const imgHeight = imgRect.height;
        let container = img.parentElement;
        let walkEl = img.parentElement;
        while (walkEl && walkEl !== root) {
          const r = walkEl.getBoundingClientRect();
          if (r.height > imgRect.height * 1.3) {
            container = walkEl;
            break;
          }
          walkEl = walkEl.parentElement;
        }
        if (!container) {
          img.setAttribute("data-scale-context", "icon");
          return;
        }
        let containerRect = container.getBoundingClientRect();
        if (containerRect.height === 0) {
          let fallbackEl = container.parentElement;
          while (fallbackEl && fallbackEl !== root) {
            const r = fallbackEl.getBoundingClientRect();
            if (r.height > 0) {
              container = fallbackEl;
              containerRect = r;
              break;
            }
            fallbackEl = fallbackEl.parentElement;
          }
          if (containerRect.height === 0) {
            const ctx = imgHeight >= 200 ? "preview" : imgHeight >= 100 ? "medium" : imgHeight >= 70 ? "thumbnail" : imgHeight >= 40 ? "small" : "icon";
            img.setAttribute("data-scale-context", ctx);
            const fallbackRef = Math.max(imgHeight * 2, 300);
            const fallbackRatio = (imgHeight / fallbackRef).toFixed(2);
            img.setAttribute("data-sb-ratio", fallbackRatio);
            console.warn("[sb-ratio] zero-height fallback:", img.src, "imgH:", imgHeight, "ratio:", fallbackRatio);
            return;
          }
        }
        const containerArea = containerRect.width * containerRect.height;
        const areaRatio = containerArea > 0 ? imageArea / containerArea : 0;
        let context;
        if (imgHeight < 40 || imageArea < 1600) context = "icon";
        else if (imgHeight < 70 || imageArea < 4900) context = "small";
        else if (areaRatio < 0.1) context = "small";
        else if (areaRatio < 0.25 || imageArea < 15e3) context = "thumbnail";
        else if (areaRatio < 0.5 || imageArea < 4e4) context = "medium";
        else context = "preview";
        const sbRatio = (imgHeight / containerRect.height).toFixed(2);
        img.setAttribute("data-sb-ratio", sbRatio);
        img.setAttribute("data-scale-context", context);
        const RATIO_REF = 200, RATIO_MIN = 14, RATIO_MAX = 180;
        const wouldRender = Math.min(RATIO_MAX, Math.max(RATIO_MIN, Math.round(parseFloat(sbRatio) * RATIO_REF)));
        console.info(
          "[sb-ratio]",
          img.src.split("/").pop(),
          "ratio:",
          sbRatio,
          "current-tier:",
          context,
          "would-render:",
          wouldRender + "px"
        );
        if (parseFloat(sbRatio) > 0.7) {
          console.warn("[sb-ratio] high-ratio image (grid card?):", img.src, sbRatio);
        }
      } catch (e) {
        img.setAttribute("data-scale-context", "icon");
      }
    });
  }
  return __toCommonJS(dom_snapshot_exports);
})();
window.DomSnapshot = DomSnapshot;
