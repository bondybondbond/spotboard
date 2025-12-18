# YouTube Headingless Content Pattern

## Discovery (19 Dec 2024)
YouTube Shorts section revealed a critical edge case: **sites with NO semantic headings where users exclude the label text**.

## The Problem
**Scenario:**
1. User captures YouTube Shorts container WITHOUT the "Shorts" label
2. Or user excludes the "Shorts" label during exclusion mode
3. Fingerprint extraction finds NO heading → Falls back to first text (video title)
4. Video titles change between refreshes → Fingerprint mismatch → Refresh fails

**Root Cause:**
- YouTube uses no semantic HTML (no h1-h6 tags)
- "Shorts" is just a `<span>` or `<div>` without heading classes
- When excluded, system picks dynamic content (video titles) as fingerprint
- Dynamic content changes = broken fingerprint matching

## What We Tested
✅ YouTube CAN load in background tabs (9 shorts loaded successfully)
✅ YouTube is NOT blocked by Page Visibility API
✅ Background tab refresh works perfectly

❌ Fingerprint matching fails when heading excluded
❌ Falls back to dynamic video titles which change

## Affected Sites
Estimated ~10-15% of modern React/Vue apps:
- YouTube (Shorts, Trending sections)
- TikTok-style feeds
- Sites with poor semantic HTML
- Any dynamic content WITHOUT stable headers

## Current Mitigation
**Accepted as documented limitation + user warning:**
> Sites without semantic headings may fail background refresh if section label is excluded during capture.

**Exclusion Mode Warning (Implemented):**
When user tries to exclude heading elements during capture, system shows orange warning tooltip:
"⚠️ Excluding heading may affect refresh. Keep section labels for best results."

Detection covers:
- h1-h6 tags
- Elements with heading/title/header classes
- Elements with data-testid heading attributes

Users can still proceed with exclusion (warning only, not blocking) but are informed of potential consequences.

**User Options:**
1. Include the section label during initial capture
2. See warning and skip excluding heading
3. Accept visible tab refresh for these specific sections
**Accepted as documented limitation:**
> Sites without semantic headings may fail background refresh if section label is excluded during capture. User must either:
> 1. Include the section label during initial capture
> 2. Accept visible tab refresh for these specific sections

## Why We Don't Fix It
1. **Complexity:** Detecting headingless captures requires complex heuristics
2. **Coverage:** 85-90% of sites have proper headings already
3. **User Control:** Users can easily include labels during capture
4. **Tech Debt:** Building detection systems adds maintenance burden

## Pattern for Future
When encountering refresh failures:
1. Check if heading exists in captured HTML
2. Check if heading was excluded by user
3. If both true → Expected behavior, document as user choice

## Files Confirmed
- YouTube NOT in `requiresVisibleTab()` list (line 1017-1032 dashboard.js)
- Uses background tab refresh successfully
- Fails at fingerprint validation (line 1708-1710 dashboard.js)
