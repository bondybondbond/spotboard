# 🗨️ Tally Feedback Integration - REVISED Implementation Plan

IMPORTANT: we only have 9 hidden fields needing data to submit, not 10 if the remaininig code says otherwise. We will not track initial sentiment, so that hidden field is not needed.
READ and MEMORIZE THIS FIRST - these are the fields we are tracking for both positive and negative forms, slight adjustment to any instructions thereafter:
extension*version
total_cards
active_cards
paused_card_rate*%
all_tracked_sites
avg_card_age_days
days_since_install
board_opens_7days
refresh_clicks_7days

## 📊 Hidden Fields - Final List (10 Total)

### ✅ **Tier 1: Immediately Available (6 fields)**

1. **extension_version** - `chrome.runtime.getManifest().version`
2. **total_cards** - Count `comp-*` keys in sync storage
3. **active_cards** - Count where `refreshPaused !== true`
4. **paused_cards** - Count where `refreshPaused === true`
5. **all_tracked_sites** - Extract domains from all component URLs (format: `bbc.co.uk(3) | espn.com(2)`)
6. **avg_card_age_days** - Average of `(now - last_refresh)` for all cards

### ⚙️ **Tier 2: Requires New Tracking Code (3 fields)**

7. **days_since_install** - `(now - install_date) / (1000*60*60*24)`
8. **board_opens_7days** - Counter incremented on dashboard load, reset weekly
9. **refresh_clicks_7days** - Counter incremented on "Refresh All" click, reset weekly

### 🎯 **Tier 3: Part of Feedback Flow (1 field)**

10. **initial_sentiment** - Stored when user clicks 👍🏼 or 👎🏼 button

**DROPPED:** review_clicked (not trackable reliably)

---

## 🎯 Final Questions (FROM YOUR FORMS)

### **Positive Path (👍🏼)**

1. **Where does SpotBoard work well for you, and why?** _(short answer)_
2. **Have you stopped checking some websites because you now use SpotBoard instead?** _(multiple choice)_
   - Yes - some sites I only use SpotBoard to check for updates
   - Partially - I still check some, but less frequently
   - No - I still check the sites regularly
   - Unsure
3. **What ONE new feature or change would make you use SpotBoard MORE often, and why?** _(short answer)_

### **Negative Path (👎🏼)**

1. **What specific things didn't work or confused you?** _(short answer)_
2. **Despite those issues, what do you actually like about SpotBoard?** _(short answer)_
3. **If you could add or change ONE thing instantly, what would it be?** _(short answer)_

---

## 📋 Implementation Batches

### **BATCH 1: Tier 1 Hidden Fields Calculator (20 mins)**

**Goal:** Extract 6 immediately available metrics

**New file to create:**

- `src/feedback-data.js`

**Code to write:**

```javascript
// src/feedback-data.js
export async function calculateTier1Fields() {
  const syncData = await chrome.storage.sync.get(null);

  // Extract all components
  const components = Object.keys(syncData)
    .filter((k) => k.startsWith("comp-"))
    .map((k) => syncData[k]);

  // Calculate metrics
  const totalCards = components.length;
  const activeCards = components.filter((c) => !c.pauseRefresh).length;
  const pausedCards = components.filter((c) => c.pauseRefresh).length;

  // Extract all sites with counts
  const siteData = {};
  components.forEach((c) => {
    try {
      const domain = new URL(c.url).hostname;
      siteData[domain] = (siteData[domain] || 0) + 1;
    } catch (e) {
      console.warn("Invalid URL:", c.url);
    }
  });

  const allTrackedSites =
    Object.entries(siteData)
      .map(([domain, count]) => `${domain}(${count})`)
      .join(" | ") || "none";

  // Calculate average card age
  const cardAges = components
    .filter((c) => c.last_refresh)
    .map(
      (c) =>
        (Date.now() - new Date(c.last_refresh).getTime()) /
        (1000 * 60 * 60 * 24),
    );
  const avgCardAgeDays =
    cardAges.length > 0
      ? Math.round(cardAges.reduce((a, b) => a + b, 0) / cardAges.length)
      : 0;

  return {
    extension_version: chrome.runtime.getManifest().version,
    total_cards: totalCards,
    active_cards: activeCards,
    paused_cards: pausedCards,
    all_tracked_sites: allTrackedSites,
    avg_card_age_days: avgCardAgeDays,
  };
}
```

**Test steps:**

1. Create the file
2. Add to dashboard.js: `import { calculateTier1Fields } from '../src/feedback-data.js'`
3. In console: `calculateTier1Fields().then(console.log)`
4. Verify all 6 fields appear with correct data
5. Commit: "Add Tier 1 hidden fields calculator"

---

### **BATCH 2: Install Date Tracker (10 mins)**

**Goal:** Track when extension was first installed

**Files to modify:**

- `public/background.js` (or create if doesn't exist)

**Code to add:**

```javascript
// Track install date on first run
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    localStorage.setItem("install_date", Date.now().toString());
    console.log("SpotBoard installed at:", new Date().toISOString());
  }
});
```

**Update calculator in feedback-data.js:**

```javascript
export async function calculateTier2Fields() {
  const installDate = parseInt(
    localStorage.getItem("install_date") || Date.now(),
  );
  const daysSinceInstall = Math.floor(
    (Date.now() - installDate) / (1000 * 60 * 60 * 24),
  );

  const boardOpens = parseInt(localStorage.getItem("board_opens_7days") || "0");
  const refreshClicks = parseInt(
    localStorage.getItem("refresh_clicks_7days") || "0",
  );

  return {
    days_since_install: daysSinceInstall,
    board_opens_7days: boardOpens,
    refresh_clicks_7days: refreshClicks,
  };
}
```

**Test steps:**

1. Add code to background.js
2. Reload extension (simulates fresh install)
3. Check localStorage for 'install_date'
4. In console: `calculateTier2Fields().then(console.log)` - should show days_since_install = 0
5. Commit: "Add install date tracking"

---

### **BATCH 3: Board Opens Counter (10 mins)**

**Goal:** Track how often user visits dashboard

**Files to modify:**

- `public/dashboard.js`

**Code to add (at top of file after DOMContentLoaded):**

```javascript
// Track board opens (reset every 7 days)
function trackBoardOpen() {
  const opens = parseInt(localStorage.getItem("board_opens_7days") || "0");
  const lastReset = parseInt(localStorage.getItem("board_opens_reset") || "0");
  const now = Date.now();

  // Reset counter every 7 days
  if (now - lastReset > 7 * 24 * 60 * 60 * 1000) {
    localStorage.setItem("board_opens_7days", "1");
    localStorage.setItem("board_opens_reset", now.toString());
  } else {
    localStorage.setItem("board_opens_7days", (opens + 1).toString());
  }
}

// Call immediately
trackBoardOpen();
```

**Test steps:**

1. Add code to dashboard.js
2. Rebuild extension: `npm run build`
3. Reload extension in chrome://extensions
4. Open dashboard 3 times, check localStorage
5. Verify 'board_opens_7days' increments: 1, 2, 3
6. Commit: "Add board opens counter"

---

### **BATCH 4: Refresh Clicks Counter (10 mins)**

**Goal:** Track how often user clicks "Refresh All"

**Files to modify:**

- `public/refresh-engine.js` (or wherever refresh button handler is)

**Code to add (in the refresh button click handler):**

```javascript
// Track refresh clicks (reset every 7 days)
function trackRefreshClick() {
  const clicks = parseInt(localStorage.getItem("refresh_clicks_7days") || "0");
  const lastReset = parseInt(
    localStorage.getItem("refresh_clicks_reset") || "0",
  );
  const now = Date.now();

  // Reset counter every 7 days
  if (now - lastReset > 7 * 24 * 60 * 60 * 1000) {
    localStorage.setItem("refresh_clicks_7days", "1");
    localStorage.setItem("refresh_clicks_reset", now.toString());
  } else {
    localStorage.setItem("refresh_clicks_7days", (clicks + 1).toString());
  }
}

// Call when "Refresh All" button is clicked
// Add this line to your existing refresh button handler:
trackRefreshClick();
```

**Test steps:**

1. Find refresh button handler in code
2. Add trackRefreshClick() call
3. Rebuild: `npm run build`
4. Reload extension
5. Click "Refresh All" 3 times, check localStorage
6. Verify 'refresh_clicks_7days' increments: 1, 2, 3
7. Commit: "Add refresh clicks counter"

---

### **BATCH 5: Combined Fields Calculator (10 mins)**

**Goal:** Single function that returns all 10 hidden fields

**Files to modify:**

- `src/feedback-data.js`

**Code to add:**

```javascript
// Combine all hidden fields
export async function getAllHiddenFields() {
  const tier1 = await calculateTier1Fields();
  const tier2 = await calculateTier2Fields();

  return {
    ...tier1,
    ...tier2,
  };
}
```

**Test steps:**

1. Add function to feedback-data.js
2. In console: `getAllHiddenFields().then(console.log)`
3. Verify all 10 fields appear:
   - extension_version (e.g. "1.2.0")
   - total_cards (e.g. 5)
   - active_cards (e.g. 4)
   - paused_cards (e.g. 1)
   - all_tracked_sites (e.g. "bbc.co.uk(2) | espn.com(3)")
   - avg_card_age_days (e.g. 2)
   - days_since_install (e.g. 14)
   - board_opens_7days (e.g. 8)
   - refresh_clicks_7days (e.g. 5)
   - initial_sentiment (e.g. "unknown")
4. Commit: "Add combined hidden fields calculator"

---

### **BATCH 6: Get Tally URLs + Field Mappings (10 mins)**

**Goal:** Document how to pre-populate hidden fields in your Tally forms

**What you need from Tally:**

1. Go to your **Positive form** in Tally
2. Click "Share" → "Embed"
3. Copy the embed URL (should look like `https://tally.so/r/xxxxx`)
4. Go to form settings → "Hidden fields"
5. For each of your 9 hidden fields, get the field ID (e.g. `field_abc123`)

**Document in code comments:**

```javascript
// Tally Form URLs and Field Mappings
const TALLY_POSITIVE_URL = "https://tally.so/r/YOUR_POSITIVE_ID";
const TALLY_NEGATIVE_URL = "https://tally.so/r/YOUR_NEGATIVE_ID";

// Hidden field IDs (get from Tally form settings)
const HIDDEN_FIELD_IDS = {
  extension_version: "YOUR_FIELD_ID_1",
  total_cards: "YOUR_FIELD_ID_2",
  active_cards: "YOUR_FIELD_ID_3",
  paused_cards: "YOUR_FIELD_ID_4",
  all_tracked_sites: "YOUR_FIELD_ID_5",
  avg_card_age_days: "YOUR_FIELD_ID_6",
  days_since_install: "YOUR_FIELD_ID_7",
  board_opens_7days: "YOUR_FIELD_ID_8",
  refresh_clicks_7days: "YOUR_FIELD_ID_9",
  initial_sentiment: "YOUR_FIELD_ID_10",
};
```

**Test steps:**

1. Get both form URLs from Tally
2. Get all 10 hidden field IDs from each form
3. Add to feedback-data.js
4. Commit: "Add Tally form URLs and field mappings"

---

### **BATCH 7: Build Tally URL with Hidden Fields (15 mins)**

**Goal:** Function that builds pre-populated Tally URL

**Files to modify:**

- `src/feedback-data.js`

**Code to add:**

```javascript
// Build Tally URL with pre-populated hidden fields
export async function buildTallyURL(sentiment) {
  const baseURL =
    sentiment === "positive" ? TALLY_POSITIVE_URL : TALLY_NEGATIVE_URL;
  const hiddenFields = await getAllHiddenFields();

  // Build URL parameters
  const params = new URLSearchParams();
  Object.entries(hiddenFields).forEach(([key, value]) => {
    const fieldId = HIDDEN_FIELD_IDS[key];
    if (fieldId) {
      params.append(fieldId, value.toString());
    }
  });

  return `${baseURL}?${params.toString()}`;
}
```

**Test steps:**

1. Add function to feedback-data.js
2. In console: `buildTallyURL('positive').then(console.log)`
3. Copy URL and paste in browser
4. Verify Tally form loads with hidden fields pre-populated
5. Check form submission in Tally - should see all 10 hidden fields
6. Repeat for negative: `buildTallyURL('negative').then(console.log)`
7. Commit: "Add Tally URL builder"

---

### **BATCH 8: Feedback Bubble UI (20 mins)**

**Goal:** Add floating button with sentiment picker

**Files to modify:**

- `public/dashboard.html`
- `public/dashboard.css`
- `public/dashboard.js`

**HTML to add (before closing `</body>`):**

```html
<!-- Feedback Bubble -->
<div id="feedback-bubble">🗨️</div>

<!-- Sentiment Picker (hidden by default) -->
<div id="sentiment-picker" style="display: none;">
  <div class="sentiment-overlay"></div>
  <div class="sentiment-modal">
    <h3>SpotBoard working for you?</h3>
    <div class="sentiment-buttons">
      <button id="sentiment-positive">👍🏼 Yes</button>
      <button id="sentiment-negative">👎🏼 No</button>
    </div>
  </div>
</div>
```

**CSS to add:**

```css
/* Feedback Bubble */
#feedback-bubble {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 60px;
  height: 60px;
  background: linear-gradient(135deg, #ffd700 0%, #ffa500 100%);
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(255, 215, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  animation: gentle-pulse 2s infinite;
  z-index: 9998;
  transition: transform 0.2s;
}

#feedback-bubble:hover {
  transform: scale(1.1);
}

@keyframes gentle-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
}

/* Sentiment Picker */
.sentiment-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9998;
}

.sentiment-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: white;
  padding: 30px;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  z-index: 9999;
  text-align: center;
}

.sentiment-buttons {
  display: flex;
  gap: 15px;
  margin-top: 20px;
}

.sentiment-buttons button {
  flex: 1;
  padding: 15px 30px;
  font-size: 16px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.2s;
}

#sentiment-positive {
  background: #4caf50;
  color: white;
}

#sentiment-negative {
  background: #f44336;
  color: white;
}

.sentiment-buttons button:hover {
  transform: scale(1.05);
}
```

**JavaScript to add (in dashboard.js):**

```javascript
// Feedback bubble logic
function initFeedbackBubble() {
  const bubble = document.getElementById("feedback-bubble");
  const picker = document.getElementById("sentiment-picker");
  const positiveBtn = document.getElementById("sentiment-positive");
  const negativeBtn = document.getElementById("sentiment-negative");

  // Check if should show bubble
  const snoozedUntil = parseInt(
    localStorage.getItem("feedback_snoozed_until") || "0",
  );
  const daysSinceInstall = parseInt(
    localStorage.getItem("days_since_install") || "0",
  );
  const totalCards = parseInt(localStorage.getItem("total_cards") || "0");

  // Hide if snoozed, too new, or no cards
  if (Date.now() < snoozedUntil || daysSinceInstall < 3 || totalCards === 0) {
    bubble.style.display = "none";
    return;
  }

  // Show sentiment picker on click
  bubble.addEventListener("click", () => {
    picker.style.display = "block";
  });

  // Handle positive sentiment
  positiveBtn.addEventListener("click", async () => {
    const url = await buildTallyURL("positive");
    window.open(url, "_blank");
    snoozeForSevenDays();
    picker.style.display = "none";
    bubble.style.display = "none";
  });

  // Handle negative sentiment
  negativeBtn.addEventListener("click", async () => {
    const url = await buildTallyURL("negative");
    window.open(url, "_blank");
    snoozeForSevenDays();
    picker.style.display = "none";
    bubble.style.display = "none";
  });

  // Close picker on overlay click
  document
    .querySelector(".sentiment-overlay")
    ?.addEventListener("click", () => {
      picker.style.display = "none";
    });
}

function snoozeForSevenDays() {
  const snoozedUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;
  localStorage.setItem("feedback_snoozed_until", snoozedUntil.toString());
}

// Initialize on load
document.addEventListener("DOMContentLoaded", () => {
  // ... existing code ...
  initFeedbackBubble();
});
```

**Test steps:**

1. Add HTML, CSS, and JS
2. Rebuild: `npm run build`
3. Reload extension
4. Check bubble appears bottom-right
5. Click bubble → sentiment picker should appear
6. Click 👍🏼 → Tally form opens in new tab
7. Close tab → bubble should disappear (snoozed)
8. Check localStorage for 'feedback_snoozed_until'
9. Commit: "Add feedback bubble UI"

---

UPDATE TO BATCH 8:

Current Problem:

Batch 8 plan snoozes for only 7 days after clicking 👍/👎
localStorage persists across updates ✅
But 7 days is way too short for users who engaged with feedback

The Fix:
We have TWO types of snooze states:

User DISMISSED bubble (clicked outside/ignored) → Snooze 7 days (give another chance)
User CLICKED 👍/👎 (engaged with feedback) → Snooze 6 months (don't annoy them)

Updated Batch 8 Code:
javascriptfunction snoozeAfterFeedback() {
// User engaged with feedback - snooze for 6 months
const sixMonthsFromNow = Date.now() + (180 _ 24 _ 60 _ 60 _ 1000);
localStorage.setItem('feedback_snoozed_until', sixMonthsFromNow.toString());
}

// In the button handlers:
positiveBtn.addEventListener('click', async () => {
const url = await buildTallyURL('positive');
window.open(url, '\_blank');
snoozeAfterFeedback(); // 6 months, not 7 days!
picker.style.display = 'none';
bubble.style.display = 'none';
});
Why This Works:
✅ localStorage persists across extension updates
✅ User clicks feedback → snoozed until August 2026
✅ v1.3.0 releases in February → localStorage still has snooze timestamp
✅ Bubble stays hidden until August
Edge Case - "Already Responded" Tracking:
If you want to track "has EVER submitted feedback" (not just snooze), we could add:
javascriptlocalStorage.setItem('feedback_submitted', 'true'); // Permanent flag
Then check:
javascriptif (localStorage.getItem('feedback_submitted') === 'true') {
// Never show bubble again (or show once per year)
}
My Recommendation:
Use 6-month snooze (not permanent flag) because:

You might want feedback again in 6 months to see if opinions changed
Allows users to provide feedback on new features
Less aggressive than "never ask again"

### **BATCH 9: Final Testing + Polish (15 mins)**

**Goal:** Test full flow and edge cases

**Test checklist:**

- [ ] Fresh install (clear localStorage + sync storage)
- [ ] Bubble hidden for first 3 days (change install_date to test)
- [ ] Bubble hidden if no cards captured
- [ ] Bubble appears after 3+ days + 1+ card
- [ ] Click bubble → sentiment picker shows
- [ ] Click 👍🏼 → positive form opens with 10 hidden fields
- [ ] Click 👎🏼 → negative form opens with 10 hidden fields
- [ ] After click → bubble hidden for 7 days
- [ ] Board opens counter increments correctly
- [ ] Refresh clicks counter increments correctly
- [ ] All hidden fields have correct values in Tally

**If any issues found:**

- Fix one at a time
- Test again
- Commit fix

**Final commit:** "v1.2.0 Tally feedback integration complete"

---

### **BATCH 10: Documentation + Submit (10 mins)**

**Goal:** Update PRD and submit to Chrome Web Store

**Tasks:**

1. Update PRD Google Doc:
   - Add v1.2.0 section: "Tally feedback integration"
   - List 10 hidden fields + purpose
   - Add to daily log entry
2. Update version in manifest.json to 1.2.0
3. Rebuild: `npm run build`
4. Final test in Chrome DevTools browser
5. Zip `dist/` folder → `spotboard-1.2.0.zip`
6. Upload to Chrome Web Store Developer Console
7. Submit for review
8. Commit: "v1.2.0 submitted to Chrome Web Store"

---

## ⏱️ Total Estimated Time

| Batch     | Task                       | Time                     |
| --------- | -------------------------- | ------------------------ |
| 1         | Tier 1 Fields Calculator   | 20 min                   |
| 2         | Install Date Tracker       | 10 min                   |
| 3         | Board Opens Counter        | 10 min                   |
| 4         | Refresh Clicks Counter     | 10 min                   |
| 5         | Combined Fields Calculator | 10 min                   |
| 6         | Get Tally URLs + Mappings  | 10 min                   |
| 7         | Build Tally URL Function   | 15 min                   |
| 8         | Feedback Bubble UI         | 20 min                   |
| 9         | Final Testing + Polish     | 15 min                   |
| 10        | Documentation + Submit     | 10 min                   |
| **TOTAL** |                            | **130 min (~2.2 hours)** |

---

## 🎯 Success Metrics (Week 1 Post-Launch)

- **Participation Rate:** 10%+ weekly active users click bubble
- **Completion Rate:** 50%+ clicks → form submissions
- **Hidden Fields Quality:** 95%+ submissions have all 10 fields
- **Q2 Signal (Positive):** 40%+ say "Yes" they stopped checking sites
- **Q3 Actionability:** 3+ feature themes emerge from responses

---

Integration of Tally.so tips from other AI:

## 🔧 Critical Setup for Claude (Implementation Notes)

**From your Tally.so page, tell Claude:**

---

### **Integration Method (Choose ONE):**

1. **Button Click** (What you have selected - "On button click")
   - ✅ **Best for SpotBoard:** Trigger popup when user taps "Send Feedback" button
   - Add to your popup button in extension:

   ```html
   <button
     data-tally-open="7RKNLZ"
     data-tally-emoji-text="👍🏼"
     data-tally-emoji-animation="wave"
   >
     Send Feedback
   </button>
   ```

   - Tally script tag goes in `<head>` of extension popup HTML

2. **URL Hash Method** (Alternative, if button approach doesn't work)
   - If popup can't execute script, use:

   ```
   #tally-open=7RKNLZ&tally-emoji-text=👍🏼&tally-emoji-animation=wave
   ```

   - Less reliable in extension context

---

### **Key Settings to Verify:**

| Setting         | Your Value          | Why It Matters                                                          |
| --------------- | ------------------- | ----------------------------------------------------------------------- |
| Position        | Bottom right corner | ✓ Doesn't block dashboard                                               |
| Width           | 376px               | ✓ Good for popup modal                                                  |
| Hide form title | OFF (toggle)        | ✓ Keep instructions visible                                             |
| Dark overlay    | OFF (toggle)        | ✓ Extension already styled                                              |
| Emoji           | 👍🏼 (wave animation) | ✓ Nice UX, set this ONCE when opening                                   |
| Hide on submit  | OFF (toggle)        | ✅ **CRITICAL:** You want form to stay visible for hidden field capture |

---

### **CRITICAL for Hidden Fields Capture:**

**After user submits form, you need to inject the hidden data BEFORE submission completes:**

```javascript
// Pseudo-code for Claude
function openTallyFeedback(sentiment) {
  // Capture hidden fields BEFORE Tally opens
  const hiddenData = {
    extension_version: chrome.runtime.getManifest().version,
    days_since_install: calculateDaysSinceInstall(),
    total_cards: countComponents(),
    active_cards: countActiveComponents(),
    board_opens_7days: getFromLocalStorage("board_opens_7days"),
    refresh_clicks_7days: getFromLocalStorage("refresh_clicks_7days"),
    all_tracked_sites: getTrackedDomains(),
    avg_card_age_days: calculateAverageCardAge(),
    initial_sentiment: sentiment, // "positive" or "negative"
  };

  // Pass to Tally via URL params or data attributes
  // Then trigger Tally popup
  tallyPopup(hiddenData);
}
```

---

### **Implementation Checklist for Claude:**

- [ ] Add Tally script tag to popup HTML `<head>`
- [ ] Add `data-tally-*` attributes to feedback button
- [ ] Set emoji to 👍🏼 or 👎🏼 dynamically based on user click
- [ ] **BEFORE Tally opens:** Serialize hidden fields into hidden form inputs
- [ ] Test: Submit form, check Tally dashboard that hidden data appears
- [ ] Verify: "Hide on submit" is OFF so users see confirmation
- [ ] Monitor: Response rate (track how many thumbs up/down → submissions)

---

### **One Thing to Ask Claude:**

**"How do we pass hidden fields to Tally?"**

Tally supports URL parameters or hidden form fields. Your extension needs to:

1. Calculate all hidden data (listed above)
2. Either:
   - Add `<input type="hidden" name="field_name" value="data">` before Tally renders, OR
   - Pass via Tally's JavaScript API (if available), OR
   - Append to data-tally URL hash

**Check:** Does your form already have hidden field placeholders set up in Tally?

---

## ⚠️ One Warning

**"Hide on submit" toggle is OFF** = Good for you. But make sure users see a "Thank you" message or the form closes gracefully. Otherwise they'll think it hung.

**Quick test:** Open Tally standalone, submit, see what happens. That's your extension behavior.

---
