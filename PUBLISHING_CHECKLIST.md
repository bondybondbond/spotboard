# 🚀 PUBLISHING CHECKLIST

## ✅ DONE (Code Ready!)
- [x] Updated to use `chrome.storage.sync` for multi-device sync
- [x] Created PRIVACY.md with sync storage disclosure
- [x] Created STORE_LISTING.md with permission justifications
- [x] Manifest V3 compliant
- [x] Vite bundling is approved (standard minification)

## 📝 YOUR ACTION ITEMS (Before Upload)

### 1. Create Support Email (5 mins)
- [ ] Create Gmail account (suggestion: `[yourname].extensions@gmail.com`)
- [ ] This will be your universal support email for all extensions
- [ ] Or use: `componentcanvas.support@gmail.com` if you prefer project-specific

### 2. Update Placeholders (2 mins)
Replace these placeholders in the files:

**In `PRIVACY.md`:**
- Find: `[ADD_YOUR_SUPPORT_EMAIL_HERE]`
- Replace with: Your actual support email

- Find: `[ADD_YOUR_GITHUB_USERNAME]`
- Replace with: Your GitHub username (e.g., `manasak`)

**In `STORE_LISTING.md`:**
- Find: `[ADD_YOUR_SUPPORT_EMAIL_HERE]`
- Replace with: Same support email

- Find: `[ADD_YOUR_GITHUB_USERNAME]`
- Replace with: Your GitHub username

### 3. Test Sync Storage (10 mins)
- [ ] Rebuild extension: `npm run build`
- [ ] Load unpacked extension in Chrome
- [ ] Capture a component
- [ ] Open Chrome on another device/profile (signed into same Google account)
- [ ] Install extension there
- [ ] Verify component synced automatically ✨

**If sync doesn't work:**
- Check you're signed into Chrome on both devices
- Check extension permissions in manifest.json includes "storage"
- Check browser console for errors

### 4. Register as Chrome Web Store Developer (10 mins)
- [ ] Go to: https://chrome.google.com/webstore/devconsole
- [ ] Sign in with your **PERSONAL Gmail** (not the support email)
- [ ] Pay $5 registration fee (one-time, lifetime)
- [ ] Accept developer agreement

### 5. Build for Upload (5 mins)
```bash
npm run build
```

Then ZIP the **dist folder** contents:
- Right-click the `dist` folder → Send to → Compressed (zipped) folder
- OR manually select all files INSIDE dist/ and zip them
- **Important**: The manifest.json should be at the ROOT of the ZIP, not in a subfolder

### 6. Upload to Chrome Web Store (15 mins)
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

### 7. Wait for Review (1-3 days)
- Google will review your extension
- You'll get email when approved or if changes needed
- First submission often gets rejected - don't panic, just fix and resubmit

---

## 📌 Key Points to Remember

**Storage:** You're using `chrome.storage.sync` (100KB limit, syncs across devices via Google)

**Privacy:** All data goes through Google's servers for sync, but YOU don't operate any servers

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

## 💡 Need Help?

If you get stuck or have questions:
1. Check Chrome Web Store documentation: https://developer.chrome.com/docs/webstore/
2. Re-read the policies we reviewed earlier
3. Google specific error messages
4. Ask me in next session!

**Good luck! 🚀**
