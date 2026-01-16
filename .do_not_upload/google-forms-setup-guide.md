# Google Forms Setup Guide - SpotBoard Feedback

## Overview
We're creating **2 separate Google Forms** (Positive & Negative) that auto-populate into Google Sheets.

**Key Decision:** Auto-scrape tracked sites instead of asking Yes/Q1 → reduces friction from 3 questions to 2 for positive users!

---

## Step 1: Create Form A (Positive Feedback)

### 1.1 Create New Form
1. Go to: https://forms.google.com
2. Click **+ Blank form**
3. Title: `SpotBoard Feedback - Positive`
4. Description: `Thanks for using SpotBoard! Help us improve.`

### 1.2 Add Questions (2 questions + metadata fields)

**Question 1: Value Proposition**
- Question: `What problem does SpotBoard solve for you?`
- Type: **Short answer**
- Settings:
  - ✅ Required
  - Response validation: Length → Maximum character count → 100
- Help text: `(e.g., "Saves time checking sites", "Everything in one place")`

**Question 2: Feature Request**
- Question: `What one feature would make SpotBoard way better?`
- Type: **Short answer**
- Settings:
  - ✅ Required
  - Response validation: Length → Maximum character count → 80
- Help text: `(e.g., "Dark mode", "Auto-refresh", "Mobile app")`

**Metadata Fields (Hidden - filled by extension):**

**Field 3: Extension Version**
- Question: `Extension Version`
- Type: **Short answer**
- Settings:
  - ❌ Not required
- (Extension will auto-fill this)

**Field 4: Days Since Install**
- Question: `Days Since Install`
- Type: **Short answer**
- Settings:
  - ❌ Not required

**Field 5: Active Cards Count**
- Question: `Active Cards Count`
- Type: **Short answer**
- Settings:
  - ❌ Not required

**Field 6: Tracked Sites**
- Question: `Tracked Sites`
- Type: **Paragraph**
- Settings:
  - ❌ Not required
- (Auto-scraped: pipe-separated URLs like "bbc.co.uk/news | producthunt.com")

**Field 7: Review Clicked**
- Question: `Review Link Clicked`
- Type: **Short answer**
- Settings:
  - ❌ Not required
- (Will be "true" or "false")

### 1.3 Link to Google Sheets
1. Click **Responses** tab
2. Click green **Sheets icon** → "Create spreadsheet"
3. Name: `SpotBoard Feedback - Positive Responses`
4. Click **Create**

### 1.4 Get Form URL
1. Click **Send** button (top right)
2. Click **Link icon**
3. ✅ Check "Shorten URL"
4. **Copy URL** → Save as: `POSITIVE_FORM_URL`

---

## Step 2: Create Form B (Negative Feedback)

### 2.1 Create New Form
1. Go to: https://forms.google.com
2. Click **+ Blank form**
3. Title: `SpotBoard Feedback - Negative`
4. Description: `We want to make SpotBoard better. Tell us what's not working.`

### 2.2 Add Questions (3 questions + metadata fields)

**Question 1: Value Gap**
- Question: `Why hasn't SpotBoard given you value yet?`
- Type: **Paragraph**
- Settings:
  - ✅ Required
  - Response validation: Length → Maximum character count → 100
- Help text: `(e.g., "Sites don't work", "Too slow", "Not easier than tabs")`

**Question 2: Friction Point**
- Question: `What's been most frustrating about using SpotBoard?`
- Type: **Paragraph**
- Settings:
  - ✅ Required
  - Response validation: Length → Maximum character count → 100
- Help text: `(e.g., "Hard to select elements", "Sites break after refresh")`

**Question 3: Feature Request**
- Question: `If you could add one thing instantly, what would it be?`
- Type: **Short answer**
- Settings:
  - ✅ Required
  - Response validation: Length → Maximum character count → 80
- Help text: `(e.g., "Better tutorials", "Fix [site name]")`

**Metadata Fields (Same as Positive):**

**Field 4: Extension Version**
- Same setup as Positive Form

**Field 5: Days Since Install**
- Same setup as Positive Form

**Field 6: Active Cards Count**
- Same setup as Positive Form

**Field 7: Tracked Sites**
- Same setup as Positive Form
- (Will capture what they're tracking even though not satisfied)

**Field 8: Review Clicked**
- Same setup as Positive Form
- (Rare but possible - user clicks subtle review link on negative path)

### 2.3 Link to Google Sheets
1. Click **Responses** tab
2. Click green **Sheets icon** → "Create spreadsheet"
3. Name: `SpotBoard Feedback - Negative Responses`
4. Click **Create**

### 2.4 Get Form URL
1. Click **Send** button (top right)
2. Click **Link icon**
3. ✅ Check "Shorten URL"
4. **Copy URL** → Save as: `NEGATIVE_FORM_URL`

---

## Step 3: Configure Google Sheets

### 3.1 Positive Responses Sheet

Your sheet will have these columns auto-created:
- Column A: Timestamp
- Column B: What problem does SpotBoard solve for you?
- Column C: What one feature would make SpotBoard way better?
- Column D: Extension Version
- Column E: Days Since Install
- Column F: Active Cards Count
- Column G: Tracked Sites
- Column H: Review Link Clicked

**Add these manual columns for analysis:**

**Column I: Use Case Tag** (manual)
- Formula: Leave blank, you'll tag manually
- Examples: "News", "Deals", "Sports", "Mixed", "Work"

**Column J: Sites Count** (formula)
- Formula: `=IF(G2="","",LEN(G2)-LEN(SUBSTITUTE(G2,"|",""))+1)`
- Purpose: Count number of sites tracked (counts pipe separators)

**Column K: Has Review** (conditional)
- Formula: `=IF(H2="true","✅","❌")`
- Purpose: Visual indicator if they clicked review link

### 3.2 Negative Responses Sheet

Your sheet will have these columns auto-created:
- Column A: Timestamp
- Column B: Why hasn't SpotBoard given you value yet?
- Column C: What's been most frustrating about using SpotBoard?
- Column D: If you could add one thing instantly, what would it be?
- Column E: Extension Version
- Column F: Days Since Install
- Column G: Active Cards Count
- Column H: Tracked Sites
- Column I: Review Link Clicked

**Add these manual columns for analysis:**

**Column J: Blocker Type** (manual)
- Examples: "Site Compatibility", "UX Confusion", "Speed", "Value Unclear", "Other"

**Column K: Sites Count** (formula)
- Same formula as Positive sheet

---

## Step 4: Test Submissions

### 4.1 Test Positive Form
1. Open `POSITIVE_FORM_URL` in browser
2. Fill in:
   - Q1: "Test response - saves time"
   - Q2: "Test feature - dark mode"
   - Extension Version: "1.1.0"
   - Days Since Install: "3"
   - Active Cards Count: "5"
   - Tracked Sites: "test.com | example.com"
   - Review Link Clicked: "false"
3. Click **Submit**
4. Check Google Sheet → row should appear

### 4.2 Test Negative Form
1. Open `NEGATIVE_FORM_URL` in browser
2. Fill in:
   - Q1: "Test response - doesn't work"
   - Q2: "Test frustration - too slow"
   - Q3: "Test feature - better speed"
   - Extension Version: "1.1.0"
   - Days Since Install: "2"
   - Active Cards Count: "1"
   - Tracked Sites: "test.com"
   - Review Link Clicked: "false"
3. Click **Submit**
4. Check Google Sheet → row should appear

---

## Step 5: Get Form Submission Endpoints

### Why We Need This:
Google Forms has a special URL format for direct submissions via POST request (bypasses the form UI).

### How to Find It:

**Method 1: Inspect Form HTML**
1. Open form in browser
2. Right-click → **Inspect** (opens DevTools)
3. Find `<form>` tag
4. Look for `action="https://docs.google.com/forms/u/0/d/e/[FORM_ID]/formResponse"`
5. Copy the `/formResponse` URL

**Method 2: View Page Source**
1. Open form in browser
2. Right-click → **View Page Source**
3. Search for `formResponse`
4. Copy the full URL

### What You'll Get:
```
Positive Form Endpoint:
https://docs.google.com/forms/u/0/d/e/[LONG_ID]/formResponse

Negative Form Endpoint:
https://docs.google.com/forms/u/0/d/e/[LONG_ID]/formResponse
```

**Save these URLs** - you'll need them in the extension code.

---

## Step 6: Get Field Entry IDs

### Why We Need This:
Each form field has a hidden `entry.XXXXXXX` ID that we use to submit data programmatically.

### How to Find Them:

1. Open form in browser
2. Right-click → **Inspect**
3. Find each question's `<input>` or `<textarea>` element
4. Look for `name="entry.XXXXXXX"`
5. Note down each ID

**Example:**
```html
<textarea name="entry.123456789" ...>
<!-- This is Q1's entry ID -->
```

### What You'll Document:

**Positive Form Entry IDs:**
```
Q1 (Value Proposition): entry.123456789
Q2 (Feature Request): entry.987654321
Extension Version: entry.111111111
Days Since Install: entry.222222222
Active Cards Count: entry.333333333
Tracked Sites: entry.444444444
Review Clicked: entry.555555555
```

**Negative Form Entry IDs:**
```
Q1 (Value Gap): entry.666666666
Q2 (Frustration): entry.777777777
Q3 (Feature Request): entry.888888888
Extension Version: entry.111111111
Days Since Install: entry.222222222
Active Cards Count: entry.333333333
Tracked Sites: entry.444444444
Review Clicked: entry.555555555
```

---

## Step 7: Organize URLs & IDs

### Create a Config File:

Create: `feedback-config.json` in your project:

```json
{
  "forms": {
    "positive": {
      "url": "https://docs.google.com/forms/u/0/d/e/[POSITIVE_ID]/formResponse",
      "fields": {
        "q1_value_prop": "entry.123456789",
        "q2_feature": "entry.987654321",
        "extension_version": "entry.111111111",
        "days_since_install": "entry.222222222",
        "active_cards_count": "entry.333333333",
        "tracked_sites": "entry.444444444",
        "review_clicked": "entry.555555555"
      }
    },
    "negative": {
      "url": "https://docs.google.com/forms/u/0/d/e/[NEGATIVE_ID]/formResponse",
      "fields": {
        "q1_value_gap": "entry.666666666",
        "q2_frustration": "entry.777777777",
        "q3_feature": "entry.888888888",
        "extension_version": "entry.111111111",
        "days_since_install": "entry.222222222",
        "active_cards_count": "entry.333333333",
        "tracked_sites": "entry.444444444",
        "review_clicked": "entry.555555555"
      }
    }
  }
}
```

---

## Expected Time: 15-20 Minutes

- ⏱️ Create Form A: 5 mins
- ⏱️ Create Form B: 5 mins
- ⏱️ Configure Sheets: 3 mins
- ⏱️ Test submissions: 2 mins
- ⏱️ Get endpoints & IDs: 5 mins

---

## What Data You'll Collect

### Every Response Includes:

**User Answers:**
- Positive: 2 questions (value prop, feature request)
- Negative: 3 questions (value gap, frustration, feature request)

**Auto-Collected Metadata:**
- Timestamp (when submitted)
- Extension version (e.g., "1.1.0")
- Days since install (e.g., 7)
- Active cards count (e.g., 5)
- **Tracked sites** (e.g., "bbc.co.uk/news | producthunt.com | hotukdeals.com")
- Review link clicked (true/false)

### Analysis You Can Do (Week 3-4):

**Sentiment Analysis:**
```
Positive responses: 65% (13 responses)
Negative responses: 35% (7 responses)
```

**Use Case Patterns:**
```
Top tracked sites:
1. bbc.co.uk/news (8 users)
2. producthunt.com (6 users)
3. hotukdeals.com (4 users)
```

**Hypothesis Testing:**
```
Avg active cards (positive): 6.2 cards
Avg active cards (negative): 2.1 cards
→ Confirms: Fewer cards = lower satisfaction
```

**Feature Prioritization:**
```
Top 3 requests:
1. Dark mode (9 mentions)
2. Auto-refresh (5 mentions)
3. Mobile app (3 mentions)
```

---

## Privacy Policy Update Needed

Add to your privacy policy:

> **Feedback Collection:** When you submit feedback through SpotBoard, we collect:
> - Your responses to survey questions
> - Which websites you're currently tracking (URLs only)
> - Extension version and usage duration
> - Whether you clicked on review links
> 
> This data is stored in Google Sheets and used only to improve SpotBoard. We do not collect personally identifiable information (PII).

---

## Next Steps After Setup

Once you have:
- ✅ Both forms created
- ✅ Both sheets linked
- ✅ Test submissions successful
- ✅ Form endpoints & entry IDs documented

You're ready to:
1. Implement the feedback button in extension
2. Integrate form submission logic
3. Test end-to-end flow
4. Deploy & monitor responses

**Estimated dev time after forms setup:** 90 minutes
