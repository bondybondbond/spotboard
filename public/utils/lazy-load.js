// AUTO-GENERATED from src/utils/lazy-load.ts — DO NOT EDIT
var LazyLoad = (() => {
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

  // src/utils/lazy-load.ts
  var lazy_load_exports = {};
  __export(lazy_load_exports, {
    EMPTY_IMAGE_SLOT_SELECTOR: () => EMPTY_IMAGE_SLOT_SELECTOR,
    MIN_EMPTY_SLOTS: () => MIN_EMPTY_SLOTS,
    countEmptyImageSlots: () => countEmptyImageSlots,
    ensureLazyContentLoaded: () => ensureLazyContentLoaded
  });
  var MIN_EMPTY_SLOTS = 3;
  var EMPTY_IMAGE_SLOT_SELECTOR = '[class*="thumbnail" i], [class*="image" i]';
  var IMAGE_ELEMENT_TAGS = /* @__PURE__ */ new Set(["IMG", "PICTURE", "SOURCE", "SVG", "VIDEO", "CANVAS"]);
  function countEmptyImageSlots(root) {
    let count = 0;
    root.querySelectorAll(EMPTY_IMAGE_SLOT_SELECTOR).forEach((el) => {
      if (IMAGE_ELEMENT_TAGS.has(el.tagName.toUpperCase())) return;
      if (!el.querySelector("img, picture") && (el.textContent || "").trim() === "") count++;
    });
    return count;
  }
  async function ensureLazyContentLoaded(block, opts = {}) {
    const maxSteps = opts.maxSteps ?? 30;
    const maxMs = opts.maxMs ?? 1e4;
    const maxDistance = opts.maxDistance ?? 2e4;
    const stepWaitMs = opts.stepWaitMs ?? 350;
    const started = Date.now();
    const emptyBefore = countEmptyImageSlots(block);
    const result = { emptyBefore, emptyAfter: emptyBefore, steps: 0, elapsedMs: 0, aborted: false, capped: false, stalled: false };
    if (emptyBefore < MIN_EMPTY_SLOTS) return result;
    const originX = window.scrollX;
    const originY = window.scrollY;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const scrollTop = (y) => window.scrollTo({ left: originX, top: y, behavior: "instant" });
    const onUserInput = (e) => {
      if (e.isTrusted) result.aborted = true;
    };
    const inputEvents = ["wheel", "keydown", "touchstart", "mousedown"];
    inputEvents.forEach((t) => window.addEventListener(t, onUserInput, { capture: true, passive: true }));
    try {
      const viewportH = window.innerHeight;
      const step = Math.max(300, Math.floor(viewportH * 0.6));
      let prevEmpty = emptyBefore;
      let noProgress = 0;
      let y = Math.max(0, block.getBoundingClientRect().top + window.scrollY - Math.floor(viewportH * 0.25));
      const startY = y;
      while (true) {
        if (result.aborted) break;
        if (result.steps >= maxSteps || Date.now() - started >= maxMs || y - startY > maxDistance) {
          result.capped = true;
          break;
        }
        scrollTop(y);
        result.steps++;
        await sleep(stepWaitMs);
        if (result.aborted) break;
        const rect = block.getBoundingClientRect();
        const blockBottom = rect.bottom + window.scrollY;
        result.emptyAfter = countEmptyImageSlots(block);
        if (result.emptyAfter === 0) break;
        noProgress = result.emptyAfter < prevEmpty ? 0 : noProgress + 1;
        prevEmpty = result.emptyAfter;
        if (result.emptyAfter > emptyBefore || noProgress >= 2) {
          result.stalled = true;
          break;
        }
        y += step;
        if (y > blockBottom) break;
      }
    } finally {
      inputEvents.forEach((t) => window.removeEventListener(t, onUserInput, { capture: true }));
      if (!result.aborted) scrollTop(originY);
      result.elapsedMs = Date.now() - started;
    }
    return result;
  }
  return __toCommonJS(lazy_load_exports);
})();
window.LazyLoad = LazyLoad;
