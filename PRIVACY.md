# SpotBoard Privacy Policy

**Effective Date:** December 2, 2024  
**Last Updated:** December 2, 2024

## Overview
SpotBoard is a Chrome extension that allows you to capture specific sections of websites and display them in a personal dashboard. We are committed to protecting your privacy and being transparent about our data practices.

## What We Collect
SpotBoard collects only the information necessary to provide its core functionality:

- **HTML Content**: The specific webpage sections you choose to capture
- **Website URLs**: The source URLs of captured components
- **User Labels & Notes**: Any custom names or notes you add to your components
- **Last Refresh Timestamps**: When each component was last updated

## How We Store Your Data
**Your data is stored using Chrome's sync storage (`chrome.storage.sync`) and synchronized across your Chrome browsers where you're signed into your Google Account.**

- ✅ Syncs across your devices (if signed into Chrome)
- ✅ Encrypted by Google during transmission
- ✅ 100KB storage limit (sufficient for typical usage)
- ✅ No SpotBoard servers or database
- ✅ No account creation with SpotBoard required
- ⚠️ Data passes through Google's servers for syncing

**What this means:**
- Your captured components sync automatically across all your Chrome browsers where you're signed in
- Google's infrastructure handles the syncing (we don't operate any servers)
- You can access your dashboard from any device where you're signed into Chrome
- If you're not signed into Chrome, data stays local to that device only

**We do NOT:**
- Operate our own servers or cloud infrastructure
- Have access to your data on Google's servers
- Track, analyze, or process your synced data
- Share your data with any third parties

## What We Don't Collect
- Personal information (name, email, phone number)
- Browsing history (beyond the pages you explicitly capture)
- Location data
- Payment information
- Analytics or usage statistics

## Permissions Explained
SpotBoard requires the following Chrome permissions to function:

- **`activeTab`**: Allows the extension to capture content from the webpage you're currently viewing when you click the capture button
- **`storage`**: Enables saving your captured components locally on your device
- **`scripting`**: Required to inject the capture interface onto webpages
- **`tabs`**: Allows the extension to refresh component content from source websites
- **`<all_urls>`**: Enables capturing content from any website you choose to visit

These permissions are used **only** for the stated functionality and nothing else.

## Data Control
You have complete control over your data:

- **Delete Components**: Remove any captured component at any time from the dashboard
- **Uninstall**: Removing the extension will delete all stored data from your device
- **No Recovery**: Since we don't store your data on our servers, we cannot recover deleted components

## Third-Party Websites
When you capture content from websites, you are responsible for complying with those websites' terms of service. SpotBoard fetches publicly accessible content from websites you visit, but we are not responsible for the content of third-party websites.

## Changes to This Policy
We may update this privacy policy from time to time. Any changes will be reflected in the "Last Updated" date above. Continued use of SpotBoard after changes constitutes acceptance of the updated policy.

## Contact
If you have questions about this privacy policy or SpotBoard's data practices, please contact:

**Email**: bondybondbond@gmail.com

**GitHub**: https://github.com/bondybondbond/spotboard

---

**Summary**: SpotBoard stores everything locally on your device. We don't collect, transmit, or have access to any of your data. Period.
