# SpotBoard In-Product Feedback Implementation Plan

**Version:** 2.0 (Updated 13 Jan 2026 - Tally Integration + Tier 1/2 Data Collection)  
**Status:** Ready for v1.1.1 implementation  
**Platform:** Tally.so (replacing Google Forms for extension compatibility)

---

## 0. Key Decisions & Strategy

### Why Tally.so Instead of Google Forms?

**Problem with Google Forms:**
- Blocks CORS requests from unknown origins (security)
- Extension POST submissions get rejected
- Would require server-side proxy or user redirect (breaks UX intent)

**Why Tally.so:**
- Built for embedded iframes (iframe support = native)
- No CORS blocking; works cross-origin
- Lightweight, fast loading in extensions
- Supports URL parameter pre-fill for metadata
- Free tier: unlimited forms + responses

### Data Collection Strategy: Tier 1 vs Tier 2

**Tier 1 - Already in Storage (No Code Changes)**
- Data lives in `chrome.storage.sync` right now
- Can collect TODAY with v1.1.0 users
- Fields: Extension Version, Days Since Install, Active Cards Count, Tracked Sites, Review Clicked, Pause Rate

**Tier 2 - Requires Logging (Resubmit to CWS)**
- Needs new code: refresh click counter, board open tracker
- Requires v1.1.1 rebuild + 3-day CWS approval
- Bundle with Tally integration in single resubmit
- Only v1.1.1+ users will have this data
- Worth it: Provides persona bucketing signals

**Decision: Bundle both into v1.1.1**
- One resubmit cycle (not two)
- v1.1.1+ users provide rich persona data from Day 1

### Persona Bucketing Theory

**Current 3 Archetypes (to validate):**

| Persona | Pause Rate | Refresh Freq | Board Opens/Day | Interpretation |
|---------|-----------|--------------|-----------------|-----------------|
| **Optimizer** | High (60%+) | Low (1-2/day) | Regular (1-2x) | Deliberate, curated sources, selective control |
| **Obsessive** | Low (0-20%) | High (5+/day) | Frequent (3+x) | Always monitoring, fear of missing updates |
| **Casual** | Medium (40%) | Very Low (<1/day) | Sporadic (<1x) | Passive consumption, low structure |

**Discriminators (best to worst):**
1. Refresh clicks per day → Obsessive vs others
2. Pause rate → Optimizer vs Casual
3. Board opens/day → Frequency pattern
4. Active cards count → Engagement level

---

## 1. User Flow (Option 2 - Compliant)



---









### 👎 NO Path (3 Questions)





**Q3: Future Potential**
```
"If you could add one thing instantly, what would it be?"
- Type: Open text (50 char limit)
- Why: Even non-adopters have useful feature ideas
- Example answers: "Better instructions", "More examples", "Fix [X] site"
```

---

## 3. Trigger Logic (Smart Timing)

### When to Show (AND condition - both must be true):

**Condition A: Usage Threshold**
- User has captured **3+ components** OR
- User has opened extension/dashboard **2+ times** across different sessions

**Condition B: Time Delay**
- At least **24 hours** since first install (gives time to explore)

### When NOT to Show (Anti-Triggers):

❌ If refresh failed in last 7 days (user is frustrated)  
❌ If user is in middle of capture flow (interrupts task)  
❌ If user dismissed feedback within last 14 days  
❌ If user already completed feedback once

### Snooze Behavior:

- **Dismissed without answering:** Show again after 14 days if still active
- **Completed feedback:** Never show main prompt again
- **Post-completion:** Button stays visible as "💬" (smaller) for additional feedback

### Storage Keys (localStorage):

```javascript
{
  "feedback_state": "pending|dismissed|completed",
  "feedback_first_eligible": "ISO-8601-timestamp",
  "feedback_last_dismissed": "ISO-8601-timestamp",
  "feedback_completed_date": "ISO-8601-timestamp",
  "feedback_sentiment": "positive|negative"
}
```

---

## 4. Visual Design Specs

### Button (Initial State):



### Button (Post-Completion):

```
[💬]
- Background: Transparent
- Border: 2px solid #E5E7EB (gray-200)
- Size: 40px × 40px (icon only)
- Tooltip on hover: "Send more feedback"
```



### Input Fields:

```
Text inputs:
- Font: 14px system font
- Border: 1px solid #D1D5DB
- Padding: 12px
- Border-radius: 8px
- Focus: Blue outline (Chromium default)
- Character counter: Bottom-right of field (e.g., "42/100")

Multiple choice:
- Radio buttons with labels
- 16px spacing between options
- "Other" option has conditional text input below
```

### Buttons (in drawer):

```
Primary (Submit):
- Background: #3B82F6 (blue-500)
- Text: White
- Padding: 12px 24px
- Border-radius: 8px
- Hover: Darkens to #2563EB

Secondary (Later/Close):
- Background: Transparent
- Text: #6B7280 (gray-500)
- Border: 1px solid #D1D5DB
- Same size as Primary
```

---

## 5. Technical Implementation

### Backend: Tally.so Forms

**Setup Steps (15-20 mins):**

1. **Create 2 Tally Forms:**
   - Form A: "SpotBoard Feedback - Positive" (2 user questions + 6 metadata fields)
   - Form B: "SpotBoard Feedback - Negative" (3 user questions + 6 metadata fields)

2. **Add to BOTH forms (Hidden/Auto-populated fields):**
   - **a. Extension Version** (text input, not required)
   - **b. Days Since Install** (number, not required)
   - **c. Active Cards Count** (number, not required)
   - **d. Tracked Sites** (text, not required) — pipe-separated list of URLs
   - **e. Review Clicked** (text: "true"/"false", not required)
   - **f. Pause Rate** (text: "67%", not required)
   - **g. Refresh Clicks Total** (NEW - Tier 2, number, not required) ← Requires v1.1.1 code
   - **h. Board Opens Last 7 Days** (NEW - Tier 2, number, not required) ← Requires v1.1.1 code

3. **Test URL Pre-fill:**
   - Confirm Tally supports URL parameters: `?extension_version=1.1.0&pause_rate=67`
   - Extension will construct URL with metadata and pass to iframe

4. **Get Form IDs:**
   - Click Share → Embed
   - Extract form ID from: `https://tally.so/embed/[FORM_ID]`

**Why 2 separate forms?**
- Easier analysis (filter by sentiment)
- Different question structures
- Separate flow for review funnel (positive vs negative paths)

### Frontend: Extension Integration (Tally Iframe)

**Files to Create/Modify:**

```
/src/
  ├── components/FeedbackOverlay.tsx (new - Tally iframe wrapper)
  ├── feedback-handler.ts (new - telemetry collection + trigger logic)
  ├── dashboard.html (add feedback button to top bar)
  ├── dashboard.js (wire feedback button, track opens)
  └── dashboard.css (button + modal styles)
```

**Key Functions:**

```typescript
// feedback-handler.ts

function gatherTelemetry() {
  // Tier 1: Read from chrome.storage.sync
  const pauseRate = calculatePauseRate();
  const activeCardsCount = getTotalComponents();
  const trackedSites = getTrackedSites();
  
  // Tier 2: Read from localStorage (requires v1.1.1 logging)
  const refreshClicksTotal = localStorage.getItem('refreshCount') || 0;
  const boardOpensLastWeek = calculateOpensLastWeek();
  
  return {
    extension_version: chrome.runtime.getManifest().version,
    days_since_install: calculateDaysSinceInstall(),
    active_cards_count: activeCardsCount,
    tracked_sites: trackedSites.join('|'),
    pause_rate: pauseRate + '%',
    refresh_clicks_total: refreshClicksTotal,
    board_opens_last_7_days: boardOpensLastWeek
  };
}

function constructTallyUrl(sentiment: 'positive' | 'negative') {
  const telemetry = gatherTelemetry();
  const baseUrl = sentiment === 'positive'
    ? 'https://tally.so/embed/[POSITIVE_ID]'
    : 'https://tally.so/embed/[NEGATIVE_ID]';
  
  // Append as URL parameters for pre-fill
  const params = new URLSearchParams(telemetry as Record<string, string>);
  return `${baseUrl}?${params.toString()}`;
}

function checkFeedbackEligibility() {
  // Check localStorage state
  // Check capture count OR session count
  // Check time since install (24h+)
  // Check anti-triggers (recent failures, etc.)
  // Return boolean
}

function showFeedbackOverlay(sentiment: 'positive' | 'negative') {
  // Render FeedbackOverlay component with Tally iframe
  // Pass telemetry-constructed URL to iframe src
}

function handleFeedbackSubmission() {
  // Listen for Tally.FormSubmitted event via postMessage
  // Show thank you screen + review link (if positive)
  // Update localStorage: feedback_completed = true
  // Close overlay after 2s
}

function trackBoardOpen() {
  // Add to dashboard.js load
  // Push timestamp to localStorage: boardOpens array
  // Keep last 100 opens for 7-day calculation
}

function trackRefreshClick() {
  // Add to "Refresh All" button click handler
  // Increment localStorage: refreshCount
}
```

**URL Pre-fill Example:**
```
Positive: https://tally.so/embed/wMZQq5?extension_version=1.1.0&pause_rate=67&active_cards_count=6&refresh_clicks_total=47&board_opens_last_7_days=8

Negative: https://tally.so/embed/nL82K9?extension_version=1.1.0&pause_rate=20&active_cards_count=2&refresh_clicks_total=5&board_opens_last_7_days=1
```



---

## 6. Data Collection & Analysis



### Weekly Analysis Tasks:

**Week 1-2 (First 10 responses):**
- Group Q1 answers by theme (manually tag use cases)
- Flag critical blockers from negative Q1
- Count how many clicked review link



### Decision Points:

**If <30% positive sentiment:**
- STOP marketing push
- Fix top 3 blockers from negative Q1/Q2
- Re-survey after fixes

**If >60% positive sentiment:**
- Proceed with Phase 2 (broader marketing)
- Use Q2 answers as testimonials for store listing
- Prioritize top 3 feature requests for v1.2

---

## 7. Chrome Store Review Funnel

### Review Link Behavior:

**Positive Path (prominent):**
```
Thank you screen:
"Thanks! 🎉 Would you mind leaving a quick review on the Chrome Store?"
[🌟 Leave Review]  [Maybe Later]

Button click:
- Opens: chrome.google.com/webstore/detail/spotboard/[ID]/reviews
- New tab (don't navigate away from dashboard)
- Tracks: review_clicked = true in localStorage
- Shows final message: "Thanks for supporting SpotBoard!"
```

**Negative Path (subtle):**
```
Thank you screen:
"Thanks for the feedback! We'll use this to improve."

[Small gray text at bottom:]
"Still want to leave a review? Chrome Store"
- Less prominent (12px gray text)
- Same link behavior as positive path
- Compliant: Both paths have review access
```

### Expected Conversion Rates:

```
100 active users
  ↓ (trigger shows to 80 users - 20 below threshold)
80 eligible users
  ↓ (50% complete feedback)
40 responses
  ↓ (60% positive sentiment)
24 positive responses
  ↓ (30% click review link)
7-8 Chrome Store reviews
```

**Target:** 50 responses in first 30 days = ~10-15 reviews

---

## 8. Implementation Checklist

### Phase 0: Setup (Tomorrow - 20 mins) ✅ User Task

- [ ] Add fields g + h to both Tally forms (hidden fields, not required)
- [ ] Get Tally form IDs (positive + negative)
- [ ] Confirm URL pre-fill works
- [ ] Send Claude: Form IDs + pre-fill confirmation

### Phase 1: Code (Day 1-2 - 120 mins) 🔨 Claude Task

**Tier 1 Telemetry (reads existing storage):**
- [ ] Create `feedback-handler.ts` with `gatherTelemetry()` function
- [ ] Read pause_rate from components
- [ ] Read active_cards_count from components
- [ ] Read tracked_sites from components
- [ ] Build URL parameter string

**Tier 2 Logging (new code):**
- [ ] Add refresh click counter to "Refresh All" button (1 line)
- [ ] Add board open timestamp tracking to dashboard load (2 lines)
- [ ] Create `calculateOpensLastWeek()` helper

**UI Components:**
- [ ] Create `FeedbackOverlay.tsx` React component with iframe
- [ ] Add feedback button to top bar (dashboard.html)
- [ ] Style button + overlay in dashboard.css
- [ ] Implement trigger logic (eligibility check on dashboard load)
- [ ] Implement review link funnel (positive vs negative paths)
- [ ] Handle Tally.FormSubmitted postMessage event

### Phase 2: Testing (Day 2 - 45 mins) 🧪 User + Claude

- [ ] Test Tier 1 telemetry collection (console log to verify)
- [ ] Test Tier 2 logging (simulate 5 refreshes, check localStorage)
- [ ] Test URL construction with sample data
- [ ] Test iframe renders with pre-filled data
- [ ] Test positive path → thank you + review link
- [ ] Test negative path → thank you (review link subtle)
- [ ] Test eligibility trigger (3+ captures, 24h delay)
- [ ] Test snooze logic (dismiss → 14 day delay)
- [ ] Verify localStorage state machine (pending → completed)

### Phase 3: Deploy (Day 3) 🚀

- [ ] Git commit with message: "Feat: Tally feedback integration + Tier 2 telemetry (v1.1.1)"
- [ ] Rebuild extension: `npm run build`
- [ ] Reload extension in chrome://extensions
- [ ] Test end-to-end flow in live extension
- [ ] Submit to Chrome Web Store as v1.1.1
- [ ] Monitor CWS approval (3-day wait)

### Phase 4: Monitor (Days 4-7) 📊

- [ ] Check Tally responses daily
- [ ] Verify Tier 1 + Tier 2 fields populate correctly
- [ ] Manually tag personas from early responses
- [ ] Adjust trigger logic if needed (too strict/loose)

---

## 9. Success Metrics (30-Day Targets)

| Metric | Target | Red Flag (<) |
|--------|--------|--------------|
| Total responses | 50+ | <20 |
| Positive sentiment % | 60%+ | <40% |
| Review link clicks (from positive) | 25%+ | <15% |
| Actual Chrome Store reviews | 10+ | <5 |
| Days to first response | <3 days | >7 days |
| Average response quality | 2+ sentences | Single words |

### Early Warning Signs:

**If by Day 7:**
- <5 responses → Trigger conditions too strict, loosen threshold
- 0 review clicks → Review link broken or unclear, fix UX
- >80% negative → Critical product issues, pause marketing

**If by Day 14:**
- <15 responses → Not enough active users, focus on user recruitment
- Review link clicks but no reviews → Review process unclear, add guidance
- Same blocker mentioned 5+ times → Fix becomes v1.1.1 priority

---

## 10. Future Enhancements (Post-MVP)

**v1.2+ Considerations:**

- [ ] Add optional email field (for follow-up interviews)
- [ ] Implement A/B test: 3 questions vs 2 questions (response rate)
- [ ] Add sentiment analysis on open text (auto-tag themes)
- [ ] Create dashboard to visualize response trends
- [ ] Trigger follow-up survey after 30 days (retention check)
- [ ] Add contextual triggers (post-successful-refresh, post-capture)

**Not Now:**
- ❌ Real-time analytics (overkill for 50 responses)
- ❌ Complex sentiment scoring (manual tagging faster)
- ❌ Email automation (stick to manual outreach for now)

---

## 11. Legal & Privacy

**Chrome Web Store Compliance:**
- ✅ Review gating allowed (not Apple)
- ✅ Both sentiment paths have review access (compliant)
- ✅ No incentives for positive reviews (clean)
- ✅ Voluntary feedback (user-initiated)

**Privacy Policy Update:**
- Add section: "Optional feedback collection via Google Forms"
- Note: "Responses anonymous unless you provide email"
- Confirm: "No tracking beyond extension usage"

**User Transparency:**
- Drawer includes: "Your feedback helps us improve SpotBoard"
- Thank you screen: "Responses are anonymous"
- Review link: "Optional - only if you're comfortable"

---

## 12. Rollout Timeline

**Tomorrow (Jan 14):**
- ✅ Add fields g + h to Tally forms
- ✅ Get form IDs + confirm URL pre-fill
- Send Claude: Ready to code

**Day 1-2 (Jan 14-15):**
- 🔨 Claude builds Tally integration + Tier 2 logging
- 🧪 Testing + debugging

**Day 3 (Jan 16):**
- 🚀 Submit v1.1.1 to Chrome Web Store
- Includes: Tally feedback button + refresh counter + board open tracking

**Days 4-6 (Jan 17-19):**
- ⏳ CWS approval (typical 3-day window)
- Monitor Tally responses from existing v1.1.0 users (Tier 1 data only)

**Day 7+ (Jan 20 onwards):**
- v1.1.1 approved → new installs + updates start using enhanced tracking
- v1.1.1 users provide full Tier 1 + Tier 2 telemetry
- Analyze persona patterns:
  - High pause rate + 1-2 refreshes = Optimizer
  - Low pause rate + 5+ refreshes = Obsessive
  - Low engagement overall = Casual

**Days 8-14 (Jan 21-27):**
- Analyze first 15-25 responses from v1.1.1 users
- Identify patterns (use cases, blockers, persona distribution)
- Begin tagging responses by persona + problem type

**Days 15-30 (Jan 28 - Feb 12):**
- Continue monitoring (target: 50+ responses)
- Calculate sentiment split
- Measure review conversion rate
- Validate persona model against real data
- Decide: proceed to Phase 2 or fix blockers

---



---

## End of Plan

**Next Steps:**
1. Review this plan
2. Confirm question wording
3. Start with Google Forms setup (15 mins)
4. Begin code implementation

**Questions to resolve before coding:**
- Exact character limits for each question?
- Confirm trigger threshold: 3 captures OR 2 sessions?
- Review link text: "Leave Review" vs "Rate Us" vs "Write Review"?
