# Chrome Web Store Listing - Permission Justifications

## For the "Why does this extension need these permissions?" section:

### activeTab
**Why needed:** To capture the specific webpage section you select. This permission allows SpotBoard to read the HTML content of the component you've chosen to save when you click the capture button.

### storage  
**Why needed:** To save your captured components using Chrome's hybrid storage system:
- **Sync storage**: Component metadata (URLs, selectors, labels) syncs across your Chrome browsers
- **Local storage**: HTML content stays on each device for unlimited storage
This enables cross-device component lists without hitting cloud quota limits while keeping your content private and local.

### scripting
**Why needed:** To inject the visual capture interface onto webpages, allowing you to select which component you want to capture.

### tabs
**Why needed:** To refresh component content from their source websites when you click the refresh button in your dashboard. This allows SpotBoard to fetch updated content while minimizing background activity.

### <all_urls> (Host Permissions)
**Why needed:** To capture content from any website you choose to visit. SpotBoard works with all websites, giving you the flexibility to capture components from any source you find useful.

---

## Store Listing Description (Suggested)

**Short Description (132 char limit):**
Capture specific webpage sections you select into a synced dashboard. User-driven monitoring for publicly accessible content.

**Detailed Description:**

SpotBoard lets you capture and track specific sections of websites **that you manually select** in a personal dashboard—without repeatedly visiting those sites.

**Perfect for tracking:**
- "Most read" articles on news sites
- Hot deals on shopping sites  
- Sports scores and updates
- Weather forecasts
- Your favorite content sources

**How it works:**
1. Click the extension icon on any webpage
2. **You select** the specific section you want to capture
3. View all your captures in a customizable dashboard
4. Refresh manually when you want updated content

**Privacy & Storage:**
- **Hybrid storage**: Component lists sync across Chrome browsers, HTML content stays local
- **No SpotBoard servers**: Everything stored in Chrome's built-in storage
- **No tracking or analytics from us**
- **User-driven**: You choose what to capture, when to refresh, when to delete
- **Open source**: Full transparency
- **Permission transparency**: All permissions are used only for the features described above; SpotBoard never sends page content to our servers or any third party

**User Responsibility:**
You are responsible for ensuring you have the right to access and capture content from websites you visit, and for respecting those sites' terms of service. SpotBoard is designed for personal monitoring of publicly accessible content only. Do not use it to bypass paywalls, violate access controls, or for commercial data extraction.

**Limited Use Commitment:**
We do not sell, repurpose, or use your captured data for advertising, AI training, or any unrelated purposes. Your data is yours alone.

**Support:** spotboard@outlook.com  
**Source Code:** https://github.com/bondybondbond/spotboard

---

## Category Suggestions:
Primary: Productivity  
Secondary: Tools

## Tags/Keywords (Priority Order):
**Primary tags (emphasize these):**
- website monitoring
- personal dashboard
- content tracker
- component capture

**Secondary tags (include but de-emphasize):**
- web scraper
- bookmark manager

**SEO-friendly additions:**
- custom homepage
- page section tracker
- content organizer
