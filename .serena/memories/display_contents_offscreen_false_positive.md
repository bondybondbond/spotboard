## display:contents → Zero BoundingRect → Off-Screen False Positive

Elements with `display:contents` have `getBoundingClientRect() = {0,0,0,0}` even when their children are fully visible and positioned. Example: HotUKDeals `div.box--contents` (Vue virtual scroller wrapper).

**Gotcha in sanitizeHTML (content.ts)**: The off-screen check `rect.right < containerLeft` fires incorrectly for these wrappers because `rect.right = 0 < any positive containerLeft`. Removing the wrapper removes all its children (deal images) from the clone.

**Fix applied (v1.3.8)**:
```typescript
// Guard: skip elements with zero bounding rect (display:contents wrappers)
const isOffScreen = (rect.width > 0 || rect.height > 0) && (isOffScreenLeft || isOffScreenRight);
```

**Rule**: Never use zero bounding rect as an off-screen signal. `display:contents` is a transparent layout wrapper — its box is absent but children are real. Carousel slides (the target of the off-screen check) always have non-zero rects.

**File**: `src/content.ts` → `sanitizeHTML()` → visibility check loop (~line 548).
See LEARNINGS.md §82.
