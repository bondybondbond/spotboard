# Feedback Feature: Tally.so Integration + Persona Bucketing

**Status:** Ready for v1.1.1 implementation (Jan 14-16, 2026)  
**Decision Date:** Jan 13, 2026  
**Owner:** Claude (code) + User (Tally setup)

---

## Why Tally.so (Not Google Forms)

**Problem:** Google Forms blocks CORS requests from unknown origins. Extension POST submissions get rejected without server-side proxy.

**Solution:** Tally.so built for embedded iframes—no CORS issues, lightweight, works natively in extensions.

**Trade-off:** Google Forms is more familiar, but Tally handles the extension architecture better. No functional loss.

---

## Data Collection: Tier 1 vs Tier 2 Strategy

### Tier 1 - Already in Storage (v1.1.0 Users)

Data lives in `chrome.storage.sync` right now. No code changes needed.

**Fields:**
- a. Extension Version
- b. Days Since Install
- c. Active Cards Count
- d. Tracked Sites
- e. Review Clicked
- f. Pause Rate

**When:** Can collect TODAY from v1.1.0 users (existing installs)

### Tier 2 - Requires Logging (v1.1.1+ Users)

New code needed: telemetry logging for usage patterns.

**Fields:**
- g. Refresh Clicks Total (counter on "Refresh All" button)
- h. Board Opens Last 7 Days (timestamp array tracking)

**When:** Requires v1.1.1 rebuild + CWS resubmit (3-day approval)

**Why worth it:** Provides persona bucketing signals that Tier 1 alone can't capture. Obsessive users = 5+ refreshes/day. Optimizers = 1-2 refreshes/day.

---

## Bundling Decision: v1.1.1

**Original plan:** Tier 2 logging in v1.2.0

**Better plan:** Bundle Tier 1 + Tier 2 + Tally iframe into v1.1.1

**Rationale:**
- Already resubmitting for Tally integration
- Same 3-day CWS wait
- No time loss vs sequential resubmits
- v1.1.1+ users give richer data from Day 1

---

## Persona Bucketing Theory (To Validate)

**Current 3 archetypes based on user interviews:**

| Persona | Pause Rate | Refresh Freq | Board Opens/Day | Signal |
|---------|-----------|--------------|-----------------|--------|
| **Optimizer** | High (60%+) | Low (1-2/day) | Regular (1-2x) | Deliberate, curated sources, selective control |
| **Obsessive** | Low (0-20%) | High (5+/day) | Frequent (3+x) | Always monitoring, fear of missing updates |
| **Casual** | Medium (40%) | Very Low (<1/day) | Sporadic (<1x) | Passive consumption, low structure |

**Discriminators (best to worst):**
1. Refresh clicks per day → Best signal for Obsessive vs others
2. Pause rate → Optimizer vs Casual
3. Board opens/day → Frequency pattern (breaks ties)
4. Active cards count → Engagement level

---

## Implementation Timeline

| Date | Task | Owner | Status |
|------|------|-------|--------|
| Jan 14 | Add Tally fields g + h, get form IDs, confirm URL pre-fill | User | ⏳ Tomorrow |
| Jan 14-15 | Build Tally iframe component + Tier 2 logging | Claude | 🔨 After User confirms |
| Jan 15-16 | Test all paths (Tier 1/2 telemetry, iframe render, review funnel) | Claude + User | 🧪 Parallel with code |
| Jan 16 | Submit v1.1.1 to CWS | User | 🚀 Ready |
| Jan 17-19 | CWS review (3-day wait) | Google | ⏳ Automatic |
| Jan 20+ | v1.1.1 approved, monitor Tally responses | User | 📊 Ongoing |

---

## Key Learnings Applied

1. **No overthinking:** Don't create friction (sequential resubmits) when you're already doing a resubmit anyway.
2. **Collect what's available:** Tier 1 data is free—collect it even if Tier 2 requires work.
3. **Persona-driven:** Data collection strategy directly supports persona validation (not collecting "nice to have" metrics).
4. **Extension-first:** Built the whole strategy around extension constraints (CORS, storage, performance).

---

## Next Actions

1. ✅ User: Add fields g + h to Tally forms tomorrow
2. ✅ User: Send Claude form IDs + pre-fill confirmation
3. 🔨 Claude: Build Tally integration + logging (Jan 14-15)
4. 🚀 User: Submit v1.1.1 to CWS (Jan 16)
