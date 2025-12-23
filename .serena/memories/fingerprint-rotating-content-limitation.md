# Fingerprint System Limitation: Rotating Content

## Problem Identified (22 Dec 2024)

The heading fingerprint system fails refresh for **rotating content sections** where the first article headline changes frequently (trending stories, latest news, featured articles).

## Root Cause

**Fingerprint Extraction Logic** (`public/utils/fingerprint.js`):
```javascript
// Extracts FIRST h1-h6 found in HTML
const heading = doc.querySelector('h1, h2, h3, h4, h5, h6');
return heading.textContent.trim().substring(0, 50);
```

**Refresh Verification** (`public/utils/refresh-engine.js` line 806):
```javascript
if (originalFingerprint && !tabHtml.toLowerCase().includes(originalFingerprint.toLowerCase())) {
  console.warn('[Skeleton Fallback] Fingerprint mismatch - rejecting update');
  return { success: false, keepOriginal: true };
}
```

**What Happens:**
1. Capture time: Fingerprint = "One of WIRED's Favorite Knives..." (first trending article)
2. Refresh time: That article rotated out, replaced by "Justice Department..."
3. System checks if new HTML contains "Knives" → NO → Rejects update
4. User sees stale content (original article preserved)

## Affected vs Working Content

**✅ Works (85-90%):**
- Sections with stable headings: "Most Read", "Top Products", "Latest Deals"
- First element is section title, not article headline
- Fingerprint never changes even when content updates

**❌ Fails (10-15%):**
- Trending Stories sections (WIRED, NYT, Guardian)
- Latest News sections (first headline rotates)
- Featured Articles (hero content changes)
- First element is article headline, not section title

## Impact Assessment

**User Experience:**
- System preserves original content (defensive, safe)
- User sees stale data but nothing breaks
- Refresh shows "8/9 refreshed" (1 failed silently)

**Frequency:**
- ~10-15% of captures affected
- Falls within PRD's 85-90% compatibility target
- Validated "80/20 Coverage" principle working as intended

**Workaround:**
- User recaptures section (30 seconds, updates fingerprint)
- Acceptable for MVP given frequency

## Decision: Document as Known Limitation

**Why NOT fix now:**
1. MVP principle: Prove concept works for 85-90%, gather user feedback
2. No tech debt: Working as designed (being protective)
3. Defensive behavior: Better to show stale data than wrong element
4. Unknown real-world impact: Need user data before over-engineering

**Future Enhancement (v1.1 candidate):**
- Smart fingerprint extraction: Prioritize section titles over article headlines
- Pattern detection: `<h2 class="section-title">` before `<h3 class="article-headline">`
- Complexity tradeoff: Wait for user feedback to validate priority

## Technical Pattern Validated

**"Defense in Depth" for Data Integrity:**
1. CSS selector tries to find element
2. Fingerprint verifies we got the RIGHT element
3. If mismatch, preserve original (don't break user's board)

This three-layer approach successfully prevents capturing wrong elements (goal achieved), but is overly cautious for naturally rotating content (acceptable tradeoff).

## Testing Insight

When testing new sites, distinguish:
- **Stable sections:** First element = section title (usually works)
- **Rotating sections:** First element = article headline (might fail refresh)

Examples:
- BBC "Most Read" → Stable (heading = "Most Read")
- WIRED "Trending" → Rotating (heading = first article title)
