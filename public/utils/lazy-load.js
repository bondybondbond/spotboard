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
    MIN_SAVED_STRUCTURE: () => MIN_SAVED_STRUCTURE,
    STRUCTURAL_SELECTOR: () => STRUCTURAL_SELECTOR,
    countEmptyImageSlots: () => countEmptyImageSlots,
    countStructure: () => countStructure,
    ensureLazyContentLoaded: () => ensureLazyContentLoaded,
    needsStructureSettle: () => needsStructureSettle,
    settleStructure: () => settleStructure,
    structureRecovered: () => structureRecovered
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
  var STRUCTURAL_SELECTOR = "li, tr, article";
  var MIN_SAVED_STRUCTURE = 3;
  function countStructure(root) {
    return root.querySelectorAll(STRUCTURAL_SELECTOR).length;
  }
  function needsStructureSettle(count, expected) {
    return expected >= MIN_SAVED_STRUCTURE && count === 0;
  }
  function structureRecovered(count, expected) {
    return count >= Math.max(MIN_SAVED_STRUCTURE, Math.ceil(expected / 2));
  }
  async function settleStructure(block, expected, opts = {}) {
    const maxSteps = opts.maxSteps ?? 30;
    const maxMs = opts.maxMs ?? 1e4;
    const stepWaitMs = opts.stepWaitMs ?? 350;
    const finalSettleMs = opts.finalSettleMs ?? 500;
    const started = Date.now();
    const before = countStructure(block);
    const result = { triggered: false, before, peak: before, count: before, steps: 0, elapsedMs: 0, aborted: false, capped: false };
    if (!needsStructureSettle(before, expected)) return result;
    result.triggered = true;
    let current = block;
    const cur = () => {
      if (!current.isConnected && opts.resolve) current = opts.resolve() || current;
      return current;
    };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const onUserInput = (e) => {
      if (e.isTrusted) result.aborted = true;
    };
    const inputEvents = ["wheel", "keydown", "touchstart", "mousedown"];
    inputEvents.forEach((t) => window.addEventListener(t, onUserInput, { capture: true, passive: true }));
    try {
      const viewportH = window.innerHeight;
      const step = Math.max(300, Math.floor(viewportH * 0.6));
      let y = Math.max(0, block.getBoundingClientRect().top + window.scrollY - Math.floor(viewportH * 0.25));
      let grew = false;
      let flat = 0;
      while (!result.aborted) {
        if (result.steps >= maxSteps || Date.now() - started >= maxMs) {
          result.capped = true;
          break;
        }
        window.scrollTo({ left: window.scrollX, top: y, behavior: "instant" });
        result.steps++;
        await sleep(stepWaitMs);
        const now = countStructure(cur());
        if (now > result.peak) {
          grew = true;
          flat = 0;
        } else if (grew) flat++;
        result.peak = Math.max(result.peak, now);
        if (grew && flat >= 2) break;
        if (now >= expected) break;
        const pageBottom = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
        y += step;
        if (y > pageBottom) break;
      }
      if (!result.aborted) {
        await sleep(finalSettleMs);
        result.peak = Math.max(result.peak, countStructure(cur()));
      }
    } finally {
      inputEvents.forEach((t) => window.removeEventListener(t, onUserInput, { capture: true }));
      result.count = countStructure(cur());
      result.elapsedMs = Date.now() - started;
    }
    return result;
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
