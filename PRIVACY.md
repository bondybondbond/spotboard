# SpotBoard Privacy Policy

**Effective Date:** December 27, 2024  
**Last Updated:** December 29, 2024

## Overview
SpotBoard is a Chrome extension that allows you to capture specific sections of websites that **you explicitly select** and display them in a personal dashboard. We are committed to protecting your privacy and being transparent about our data practices.

**Key Principle:** SpotBoard is a **user-driven monitoring tool** - you choose which page sections to capture, when to refresh them, and when to delete them. We do not automatically crawl, scrape, or collect any data without your explicit action.

**Chrome Web Store Compliance:** SpotBoard is designed to comply with the Chrome Web Store User Data and Limited Use policies. We collect only what is necessary to provide the core features you initiate, and we do not sell, repurpose, or use your data for advertising or unrelated purposes.

## What We Collect
SpotBoard collects only the information necessary to provide its core functionality **when you explicitly capture a component**:

- **HTML Content**: The specific webpage sections you manually select and capture
- **Website URLs**: The source URLs of components you chose to capture
- **User Labels & Notes**: Any custom names or notes you add to your components
- **Last Refresh Timestamps**: When each component was last updated
- **Excluded Elements**: DOM elements you choose to remove from captures

## How We Store Your Data
**SpotBoard uses HYBRID STORAGE to balance cross-device sync with storage efficiency:**

### Sync Storage (Chrome's `chrome.storage.sync`)
**What syncs:**
- Component metadata (URLs, selectors, custom labels, excluded elements)
- Your component list and settings

**How it works:**
- ✅ Syncs across your Chrome browsers (if signed into Chrome)
- ✅ Encrypted by Google during transmission
- ✅ 8KB per component limit, 100KB total quota
- ⚠️ Passes through Google's servers for syncing

### Local Storage (Chrome's `chrome.storage.local`)
**What stays local:**
- Captured HTML content (the actual webpage sections)

**How it works:**
- ✅ Stored only on your current device
- ✅ No size limits (beyond disk space)
- ✅ Never leaves your device
- ✅ Never transmitted to any server (Google or ours)

**What this means:**
- Your **component list** syncs across devices (you see same captures everywhere)
- The **actual content** stays local per device (refresh required on new devices)
- Google's infrastructure handles metadata syncing (we don't operate any servers)
- If you're not signed into Chrome, everything stays local to that device only

**We do NOT:**
- Operate our own servers or cloud infrastructure
- Have access to your data (neither sync nor local)
- Track, analyze, or process your captured data
- Share your data with any third parties
- Sell or repurpose scraped content
- Use scraped data for advertising, AI training, or unrelated purposes
- Perform human review of your data (except for user-initiated support requests)

## What We Don't Collect

**We NEVER collect:**
- Authentication credentials or passwords
- Payment card numbers or financial account information
- Personal communications (emails, texts, chat messages)
- Location data
- Health information

**We don't CURRENTLY collect (but may add with your consent):**
- Analytics or usage statistics (planned for future improvement)
- Error diagnostics (to help fix bugs faster)

**We only collect what you explicitly capture:**
- URLs of pages you select to capture
- HTML content of sections you choose to save
- Custom labels and notes you add

**About Future Analytics:**
We plan to add **optional** analytics in the future to understand:
- How many components users capture (to measure engagement)
- Which features are used vs ignored (to prioritize improvements)
- Error rates (to fix bugs faster)

**When we add analytics:**
- This policy will be updated with specifics
- You'll have opt-in or opt-out control
- We'll NEVER sell or share analytics data
- We'll NEVER track which specific sites you visit



## Permissions Explained
SpotBoard requires the following Chrome permissions to function:

- **`activeTab`**: Allows the extension to capture content from the webpage you're currently viewing when you click the capture button
- **`storage`**: Enables saving your captured components locally on your device
- **`scripting`**: Required to inject the capture interface onto webpages
- **`tabs`**: Allows the extension to refresh component content from source websites
- **`<all_urls>`**: Enables capturing content from any website you choose to visit

These permissions are used **only** for the stated functionality and nothing else.

## Data Control & User Rights
You have complete control over your data:

- **Delete Components**: Remove any captured component at any time from the dashboard
- **Uninstall**: Removing the extension will delete all stored data from your device (both sync and local storage)
- **Request Data Deletion**: Email spotboard@outlook.com to request deletion of any synced metadata from Chrome's sync storage
- **Data Export**: Your captured components are stored locally in Chrome storage - you can export them by using Chrome's built-in developer tools or by contacting us for assistance
- **No Recovery**: Since we don't store your data on our servers, we cannot recover deleted components once removed

**GDPR/UK Data Protection Rights:**
If you are in the UK or EEA, you have the right to:
- Access your personal data (though SpotBoard stores minimal personal data)
- Request deletion of your data
- Object to data processing
- Lodge a complaint with your local data protection authority

To exercise these rights, contact: spotboard@outlook.com

## User Responsibilities & Compliance

**You are responsible for:**
- Ensuring you have the right to access and capture content from websites you visit
- Respecting the terms of service of websites you capture content from
- Not using SpotBoard to bypass paywalls, access controls, or website protections
- Not using captured content for commercial resale or redistribution
- Complying with copyright, database rights, and applicable laws in your jurisdiction

**SpotBoard is designed for:**
- Personal monitoring of publicly accessible content
- Tracking updates to content you regularly visit
- Creating a personal dashboard of information sources you trust

**SpotBoard is NOT designed for:**
- Bulk crawling or mass scraping of entire websites
- Bypassing authentication or paywalls
- Commercial data extraction or resale
- Violating website terms of service

**If a website owner contacts us:** We reserve the right to help users comply with takedown requests or to restrict functionality for specific domains if needed to respect intellectual property rights.

## Third-Party Websites
When you capture content from websites, you are responsible for complying with those websites' terms of service and applicable laws. SpotBoard fetches publicly accessible content that you explicitly select, but we are not responsible for:
- The content of third-party websites
- How you use captured content
- Violations of third-party terms of service

## Changes to This Policy
We may update this privacy policy from time to time. Any changes will be reflected in the "Last Updated" date above. Continued use of SpotBoard after changes constitutes acceptance of the updated policy.

**How we notify you of changes:**
- Major changes (e.g., adding analytics, changing data collection) will be announced via the extension's changelog on GitHub
- You can view the full changelog here: https://github.com/bondybondbond/spotboard/releases
- Privacy policy updates will be visible on GitHub with timestamps

## Contact
If you have questions about this privacy policy or SpotBoard's data practices, please contact:

**Email**: spotboard@outlook.com

**GitHub**: https://github.com/bondybondbond/spotboard

---

## Summary
SpotBoard uses hybrid storage:
- **Sync storage**: Component metadata syncs across your Chrome browsers (via Google's infrastructure)
- **Local storage**: HTML content stays on each device only
- **No SpotBoard servers**: We don't operate any backend or access your data
- **User-driven**: You choose what to capture, when to refresh, when to delete
- **Limited Use compliant**: No selling, repurposing, or unauthorized use of captured data
