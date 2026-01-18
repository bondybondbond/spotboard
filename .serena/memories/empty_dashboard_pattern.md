# Empty Dashboard Pattern (v1.2.0)

**Design Philosophy:** Inspiration-driven (not instruction-driven). Tutorial covers HOW to capture, empty dashboard shows WHAT to capture.

**Visual Hierarchy:**
- Headline: 22px bold (#1a1a1a) - "Your board is empty"
- Subheading: 14px (#5f6368) - "Here's what others track:" (social proof language)
- Category titles: 14px bold (#1a1a1a) with emoji
- Site links: 13px (#5f6368), blue (#1a73e8), clickable, open new tabs
- Help tip: 14px (#5f6368) - "💡 Need help? Click the ℹ️ button in the top bar..."

**Categories (5):**
1. 📰 News & Headlines - BBC, NBC News, TechCrunch
2. 🏆 Sports Scores - ESPN, Sky Sports, AS.com
3. 🚀 Tech News & Launches - Product Hunt, GitHub, Wired
4. 🛍️ Daily Deals - Amazon, Gumtree, HotUKDeals
5. 🌦️ Weather Forecast - AccuWeather, YR.no, Weather Network

**Critical Implementation Detail:**
Empty state HTML exists in TWO locations and MUST be synchronized:
1. `public/dashboard.html` (initial page load when no components exist)
2. `public/dashboard.js` delete function line ~353 (when last card deleted)

**Code Location:** 
- HTML: `public/dashboard.html` lines 574-626
- JS: `public/dashboard.js` lines 353-423 (inside deleteBtn click handler)

**Layout:**
- Left-aligned categories (easier to scan than centered)
- Max-width 500px container prevents excessive spreading
- 16px vertical spacing between categories
- 24px spacing before help tip

**International Appeal:** Mix of UK (BBC, Sky Sports, HotUKDeals), US (NBC News, ESPN, TechCrunch), and Spanish (AS.com) sites.

**Bug Prevented:** Old bug where delete function showed outdated empty state until page reload. Fixed by syncing content in both locations.