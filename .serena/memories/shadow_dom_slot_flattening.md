## Shadow DOM Slot Flattening in cloneWithShadow

Sites using open shadow DOM with named slots (e.g. Reddit shreddit) store content in light DOM as `<el slot="name">` children. The old cloneWithShadow discarded light DOM entirely when shadowRoot detected.

**Fix (applied v1.3.7)**: Replace `<slot name="X">` in shadow HTML with matching `[slot="X"]` light DOM children; replace default `<slot>` with unslotted children; remove `slot` attribute from promoted elements.

**3 locations — must keep in sync**:
- `src/content.ts` — `cloneWithShadow()` function (~line 473)
- `public/utils/refresh-engine.js` — inside `tryBackgroundWithSpoof()` (~line 887)
- `public/utils/refresh-engine.js` — inside `tryActiveTab()` (~line 1257)

Both JS copies carry `// Keep in sync with cloneWithShadow in src/content.ts`. Unify in the planned refresh-engine refactor (extract to shared string template injected at build time).

**rawCaptureLength**: Now always `target.innerHTML.length` — shadow branch removed. Old Reddit cards self-heal on next capture (drift guard skips when no valid baseline).

See LEARNINGS.md §67.