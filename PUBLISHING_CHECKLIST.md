# 🚀 PUBLISHING CHECKLIST

## ✅ DONE (Code Ready!)
- [x] Updated to use `chrome.storage.sync` for multi-device sync
- [x] Created PRIVACY.md with sync storage disclosure
- [x] Created STORE_LISTING.md with permission justifications
- [x] Manifest V3 compliant
- [x] Vite bundling is approved (standard minification)

## 📝 YOUR ACTION ITEMS (Before Upload)

### 1. ✅ Support Email & GitHub (DONE)
- [x] Support email: spotboard@outlook.com
- [x] GitHub: https://github.com/bondybondbond/spotboard
- [x] Updated in PRIVACY.md and STORE_LISTING.md

### 2. Test Hybrid Storage (10 mins)
**What to test:**
- [ ] Rebuild extension: `npm run build`
- [ ] Load unpacked extension in Chrome (Device A)
- [ ] Capture a component
- [ ] Open Chrome on Device B or new profile (signed into same Google account)
- [ ] Install extension there
- [ ] **Expected behavior:**
  - ✅ Component list appears on Device B (metadata synced)
  - ❌ Content is empty on Device B (needs manual refresh - this is correct!)
  - ✅ Click "Refresh All" on Device B → content loads

**If component list doesn't sync:**
- Check you're signed into Chrome on both devices with same Google account
- Check extension permissions in manifest.json includes "storage"
- Check browser console for errors
- Verify you're NOT in Incognito mode (sync disabled there)

**If content appears without refresh:**
- That's wrong - report to me (content should be local-only)

### 3. Register as Chrome Web Store Developer (10 mins)
- [ ] Go to: https://chrome.google.com/webstore/devconsole
- [ ] Sign in with your **PERSONAL Gmail** (not the support email)
- [ ] Pay $5 registration fee (one-time, lifetime)
- [ ] Accept developer agreement

### 4. Build for Upload (5 mins)
```bash
npm run build
```

Then ZIP the **dist folder** contents:
- Right-click the `dist` folder → Send to → Compressed (zipped) folder
- OR manually select all files INSIDE dist/ and zip them
- **Important**: The manifest.json should be at the ROOT of the ZIP, not in a subfolder

### 5. Upload to Chrome Web Store (15 mins)
- [ ] Go to Chrome Web Store Developer Console
- [ ] Click "New Item"
- [ ] Upload your ZIP file
- [ ] Fill in store listing:
  - Copy description from `STORE_LISTING.md`
  - Copy permission justifications from `STORE_LISTING.md`
  - Upload 3-5 screenshots (capture + dashboard views)
  - Add your support email
  - Choose category: **Productivity**
  - Add keywords: web scraper, dashboard, component capture

- [ ] Submit for review

### 6. Wait for Review (1-3 days)
- Google will review your extension
- You'll get email when approved or if changes needed
- First submission often gets rejected - don't panic, just fix and resubmit

---

## 📌 Key Points to Remember

**Storage:** You're using **HYBRID STORAGE**:
- Sync storage: Component metadata (8KB per component, 100KB total)
- Local storage: HTML content (unlimited, never leaves device)

**Privacy:** Metadata passes through Google's servers for sync, HTML content stays local. YOU don't operate any servers.

**Compliance - Critical for Approval:**
- ✅ User-driven: Users select what to capture (not bulk crawler)
- ✅ Transparent: Hybrid storage clearly disclosed
- ✅ Limited Use: No selling/repurposing of scraped data
- ✅ User responsibility: Users must respect site ToS
- ✅ Takedown process: We'll help users comply if sites complain
- ✅ Analytics future-proofed: Policy allows adding telemetry later (with update + opt-in)
- ✅ Keywords prioritize "monitoring" over "scraper" (safer positioning)

**Vite Build:** Your bundled code is compliant (standard minification, not obfuscation)

**Support:** You MUST respond to user emails within 3 business days (24hrs if urgent)

**Open Source:** Your code is public on GitHub - this builds trust and shows good faith

---

## ⚠️ Common Mistakes to Avoid

1. ❌ Don't ZIP the folder - ZIP the contents (manifest.json at root)
2. ❌ Don't use personal email in public listing - use support email
3. ❌ Don't forget to update placeholders in PRIVACY.md and STORE_LISTING.md
4. ❌ Don't commit node_modules (already in .gitignore)
5. ❌ Don't commit .env files with API keys (you don't have any, but FYI)

---

## 🎯 After Publishing

**When Approved:**
- [ ] Add extension link to your GitHub README
- [ ] Share on LinkedIn/Twitter as portfolio piece
- [ ] Monitor support email for user questions
- [ ] Track user reviews and respond professionally

**If Rejected:**
- [ ] Read rejection reason carefully
- [ ] Fix the specific issue mentioned
- [ ] Don't add extra features - just fix what they asked
- [ ] Resubmit within 24-48 hours

---

## 🔮 Future Analytics Integration (When You're Ready)

When you want to add telemetry for funnel optimization:

**What to track (compliant examples):**
- ✅ Number of captures per user (to understand engagement)
- ✅ Feature usage (which features are used/ignored)
- ✅ Error rates (to fix bugs)
- ✅ Performance metrics (load times, refresh success rates)

**What NOT to track:**
- ❌ Actual captured content (HTML)
- ❌ URLs of sites users visit (privacy violation)
- ❌ User identity linked to browsing behavior
- ❌ Anything that could be sold to third parties

**Implementation checklist:**
1. Update PRIVACY.md with specific telemetry details
2. Add opt-in toggle in extension settings (or clear opt-out)
3. Use privacy-preserving analytics (e.g., Plausible, Fathom) not Google Analytics
4. Update Chrome Web Store listing with new data collection details
5. Submit updated version for review (Google will re-review privacy disclosure)

**Recommended tool:** [Plausible Analytics](https://plausible.io/) - GDPR-compliant, no cookies, privacy-first

---

## 🛡️ Compliance Checklist (Read Before Submitting)

Google scrutinizes scraping extensions heavily. Make sure you can answer YES to all:

**Positioning:**
- [ ] ✅ Extension framed as "user monitors specific pages" (not "bulk crawler")
- [ ] ✅ Requires explicit user action to select content (not automatic)
- [ ] ✅ Privacy policy clearly states hybrid storage (sync metadata + local content)

**Limited Use Policy:**
- [ ] ✅ No selling of scraped content
- [ ] ✅ No repurposing for unrelated purposes (ads, AI training, etc.)
- [ ] ✅ No human review except user support requests
- [ ] ✅ Explicitly stated in PRIVACY.md and STORE_LISTING.md

**User Responsibility:**
- [ ] ✅ Users must respect website ToS (stated in docs)
- [ ] ✅ Not designed for bypassing paywalls/access controls (stated in docs)
- [ ] ✅ Personal monitoring only, not commercial resale (stated in docs)

**Takedown Process:**
- [ ] ✅ We'll help users comply if sites complain (stated in privacy policy)

**Transparency:**
- [ ] ✅ Permissions clearly justified (STORE_LISTING.md)
- [ ] ✅ Data flow clearly explained (sync vs local)
- [ ] ✅ Open source (GitHub link in listing)

**If any NO answers:** Fix before submitting or risk rejection/takedown.

---

## 💡 Need Help?

If you get stuck or have questions:
1. Check Chrome Web Store documentation: https://developer.chrome.com/docs/webstore/
2. Re-read the compliance checklist above
3. Google specific error messages
4. Ask me in next session!

**Good luck! 🚀**
