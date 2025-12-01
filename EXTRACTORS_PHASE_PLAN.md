# Extractors Phase - Implementation Plan

**Status:** Future Development  
**Current Phase:** Free Tier MVP (CSS-only presentation)  
**Next Phase:** Semantic Extractors (JavaScript-based content filtering)

---

## Problem Statement

**Current Limitation:**
- CSS cannot filter text content (e.g., "check circle filled" artifacts in stock cards)
- Site-specific CSS rules create tech debt and break other sources
- Content cleanup needs to happen at **capture time**, not display time

**The Solution:**
Move content filtering from CSS (presentation layer) to JavaScript extractors (capture layer).

---

## Architecture Overview

### Two-Tier Service Model

| Tier | Extractors | Content Quality | Maintenance | Cost |
|------|-----------|----------------|-------------|------|
| **Free** | Built-in extractors (10-15 sources) | Good | Community-driven | $0 |
| **Paid** | Custom extractors on request | Excellent | SLA-backed | $9-29/mo |

---

## Current State (Free Tier MVP)

**What Works:**
- ✅ Universal HTML capture (works on any site)
- ✅ CSS presentation layer (fonts, spacing, containers)
- ✅ Basic functionality (capture, display, refresh, delete)

**What Doesn't:**
- ❌ No content filtering (artifacts like "check circle filled")
- ❌ No semantic extraction (grabs everything, including noise)
- ❌ No site-specific optimization

**Documented Limitations:**
- Stock movements show "check circle filled" text
- Some sites have duplicate content (BBC uses multiple hidden copies for responsive design)
- Weather widgets too wide (table layout doesn't compress)

---

## Extractor System Design

### File Structure

```
/extractors
  /core                      # Built-in extractors (free tier)
    bbc_sport.js
    yahoo_fantasy.js
    espn_headlines.js
    google_finance.js
    hotukdeals.js
    dailyfaceoff.js
    bbc_most_read.js
    weather.js               # Replace with API-based
    ... (10-15 total)
  
  /custom                    # Paid-tier customer requests
    techcrunch.js
    hackernews.js
    ... (future)
  
  index.js                   # Registry of all extractors
  
/test
  /extractors
    bbc_sport.test.js        # Unit tests for each
    yahoo_fantasy.test.js
    ...

/monitoring
  extractor_health.js        # Monitor for breakage
  alert_maintainer.js        # Alert when sites redesign

/docs
  PAID_REQUESTS.md           # Customer request backlog
  EXTRACTOR_GUIDE.md         # How to build new extractors
```

---

## Extractor Template

```javascript
// extractors/core/bbc_sport.js

export const bbc_sport = {
  // Metadata
  name: 'BBC Sport Results',
  url: 'https://www.bbc.co.uk/sport/football/premier-league/scores-fixtures',
  category: 'sports',
  tier: 'core',
  
  // What fields to extract
  fields: ['date', 'homeTeam', 'awayTeam', 'kickoffTime', 'url'],
  
  // The extraction logic
  async extract(page) {
    return await page.evaluate(() => {
      const matches = [];
      
      // Find all match containers
      document.querySelectorAll('[data-tipo-topic-id]').forEach(matchEl => {
        const homeTeam = matchEl.querySelector('.ssrcss-1upu8z0-TeamNameWrapper:first-of-type')?.textContent?.trim();
        const awayTeam = matchEl.querySelector('.ssrcss-1upu8z0-TeamNameWrapper:last-of-type')?.textContent?.trim();
        const kickoffTime = matchEl.querySelector('time')?.textContent?.trim();
        const url = matchEl.querySelector('a')?.href;
        
        // Only add if we got valid data
        if (homeTeam && awayTeam) {
          matches.push({
            homeTeam: cleanTeamName(homeTeam),  // Remove duplicates
            awayTeam: cleanTeamName(awayTeam),
            kickoffTime,
            url
          });
        }
      });
      
      return matches;
    });
  },
  
  // Helper: BBC duplicates team names 3x, clean it
  cleanTeamName(text) {
    // "BournemouthAFC BournemouthAFC Bournemouth" -> "AFC Bournemouth"
    const parts = text.split(/(?=[A-Z])/); // Split on capitals
    return parts[parts.length - 1] || text; // Return last part
  },
  
  // Metadata for monitoring
  metadata: {
    createdDate: '2025-12-01',
    lastTestedDate: '2025-12-01',
    status: 'active',
    maintainedFor: 'all_users'
  }
};
```

---

## Integration Points

### 1. Capture Flow (content.ts)

**Current:**
```javascript
// Grabs entire DOM element as-is
const html = element.innerHTML;
chrome.storage.local.set({ components: [...existing, { html }] });
```

**With Extractors:**
```javascript
// Check if extractor exists for this source
const extractor = EXTRACTORS[sourceId];

if (extractor) {
  // Use semantic extraction
  const data = await extractor.extract(document);
  chrome.storage.local.set({ 
    components: [...existing, { 
      html: renderTemplate(data),  // Clean, structured HTML
      rawData: data                // Store structured data
    }] 
  });
} else {
  // Fallback: generic HTML capture
  const html = element.innerHTML;
  chrome.storage.local.set({ components: [...existing, { html }] });
}
```

### 2. Component Detection

**Add "sourceId" to captured components:**
```javascript
// When user captures a component
{
  id: "uuid-v4",
  url: "https://bbc.co.uk/sport",
  sourceId: "bbc_sport",          // NEW: Maps to extractor
  selector: "div[data-fixture]",
  label: "BBC Sport Results",
  html_cache: "<div>...</div>",
  rawData: { matches: [...] },    // NEW: Structured data
  last_refresh: "2025-12-01T10:30:00Z",
  status: "active"
}
```

### 3. Refresh Logic (dashboard.js)

**Current:**
```javascript
// Fetch entire page, find element, grab innerHTML
const html = await fetchAndExtract(url, selector);
```

**With Extractors:**
```javascript
async function refreshComponent(component) {
  const extractor = EXTRACTORS[component.sourceId];
  
  if (extractor) {
    // Use semantic extraction
    const data = await extractor.extract(component.url);
    return {
      html: renderTemplate(data),
      rawData: data,
      last_refresh: new Date().toISOString()
    };
  } else {
    // Fallback: CSS selector-based
    const html = await fetchAndExtract(component.url, component.selector);
    return { html, last_refresh: new Date().toISOString() };
  }
}
```

---

## Extractor Registry

```javascript
// extractors/index.js

import { bbc_sport } from './core/bbc_sport.js';
import { yahoo_fantasy } from './core/yahoo_fantasy.js';
import { espn_headlines } from './core/espn_headlines.js';
import { google_finance } from './core/google_finance.js';
// ... import all core extractors

// Future: paid tier custom extractors
import { techcrunch } from './custom/techcrunch.js';
import { hackernews } from './custom/hackernews.js';

export const CORE_EXTRACTORS = {
  bbc_sport,
  yahoo_fantasy,
  espn_headlines,
  google_finance,
  // ... 10-15 sources
};

export const CUSTOM_EXTRACTORS = {
  techcrunch,
  hackernews,
  // ... paid customer requests
};

export const ALL_EXTRACTORS = {
  ...CORE_EXTRACTORS,
  ...CUSTOM_EXTRACTORS
};

// Helper: Find extractor by URL pattern
export function findExtractor(url) {
  for (const [key, extractor] of Object.entries(ALL_EXTRACTORS)) {
    if (url.includes(extractor.urlPattern)) {
      return extractor;
    }
  }
  return null; // No extractor, use fallback
}
```

---

## Testing Strategy

### Unit Tests (Per Extractor)

```javascript
// test/extractors/bbc_sport.test.js

import { bbc_sport } from '../../extractors/core/bbc_sport.js';
import { chromium } from 'playwright';

describe('BBC Sport Extractor', () => {
  let browser, page;
  
  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
    await page.goto(bbc_sport.url);
  });
  
  afterAll(async () => {
    await browser.close();
  });
  
  test('should extract match data', async () => {
    const matches = await bbc_sport.extract(page);
    
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]).toHaveProperty('homeTeam');
    expect(matches[0]).toHaveProperty('awayTeam');
    expect(matches[0]).toHaveProperty('kickoffTime');
  });
  
  test('should clean duplicate team names', async () => {
    const matches = await bbc_sport.extract(page);
    
    // BBC duplicates: "BournemouthAFC BournemouthAFC Bournemouth"
    // Should become: "AFC Bournemouth"
    expect(matches[0].homeTeam).not.toMatch(/(.+)\1/); // No repeats
  });
  
  test('should handle missing data gracefully', async () => {
    const matches = await bbc_sport.extract(page);
    
    matches.forEach(match => {
      // All matches should have required fields
      expect(match.homeTeam).toBeTruthy();
      expect(match.awayTeam).toBeTruthy();
    });
  });
});
```

### Integration Tests

```javascript
// test/integration/capture_and_refresh.test.js

describe('Capture and Refresh with Extractors', () => {
  test('should use extractor when available', async () => {
    const component = await captureComponent('https://bbc.co.uk/sport');
    
    expect(component.sourceId).toBe('bbc_sport');
    expect(component.rawData).toBeDefined();
    expect(component.rawData.matches).toBeDefined();
  });
  
  test('should fallback to HTML capture when no extractor', async () => {
    const component = await captureComponent('https://random-site.com');
    
    expect(component.sourceId).toBeUndefined();
    expect(component.html_cache).toBeDefined();
    expect(component.rawData).toBeUndefined();
  });
  
  test('should refresh using extractor', async () => {
    const component = { sourceId: 'bbc_sport', url: 'https://bbc.co.uk/sport' };
    const refreshed = await refreshComponent(component);
    
    expect(refreshed.rawData).toBeDefined();
    expect(refreshed.rawData.matches).toBeDefined();
  });
});
```

---

## Monitoring & Maintenance

### Extractor Health Monitoring

```javascript
// monitoring/extractor_health.js

const MONITOR_SCHEDULE = {
  core: 'daily',      // Check core extractors daily
  custom: 'hourly'    // Check paid extractors hourly
};

async function monitorExtractor(extractorKey) {
  const extractor = ALL_EXTRACTORS[extractorKey];
  
  try {
    const page = await browser.newPage();
    await page.goto(extractor.url);
    
    const data = await extractor.extract(page);
    
    // Validation checks
    if (!data || data.length === 0) {
      throw new Error('Extractor returned empty data');
    }
    
    // Log success
    console.log(`✅ ${extractorKey}: Extracted ${data.length} items`);
    
    // Update metrics
    HEALTH_METRICS[extractorKey] = {
      lastSuccessfulRun: new Date(),
      failureCount: 0,
      status: 'healthy'
    };
    
  } catch (error) {
    console.error(`❌ ${extractorKey}: ${error.message}`);
    
    // Update failure count
    HEALTH_METRICS[extractorKey].failureCount++;
    
    // Alert if threshold exceeded
    if (HEALTH_METRICS[extractorKey].failureCount >= 3) {
      await alertMaintainer(extractorKey, error);
    }
  }
}

// Run monitors
setInterval(() => {
  Object.keys(CORE_EXTRACTORS).forEach(key => monitorExtractor(key));
}, 24 * 60 * 60 * 1000); // Daily

setInterval(() => {
  Object.keys(CUSTOM_EXTRACTORS).forEach(key => monitorExtractor(key));
}, 60 * 60 * 1000); // Hourly
```

### Alerts

```javascript
// monitoring/alert_maintainer.js

async function alertMaintainer(extractorKey, error) {
  const extractor = ALL_EXTRACTORS[extractorKey];
  const maintainer = extractor.metadata.maintainedFor;
  
  // Send email/Slack notification
  const message = `
    🚨 Extractor Alert
    
    Extractor: ${extractor.name}
    Status: FAILING
    Error: ${error.message}
    Failure Count: ${HEALTH_METRICS[extractorKey].failureCount}
    URL: ${extractor.url}
    
    ${extractor.tier === 'custom' ? '⚠️ PAID TIER - PRIORITY FIX' : 'Free tier - backlog'}
  `;
  
  if (extractor.tier === 'custom') {
    // Paid tier: Immediate alert
    await sendEmail(maintainer, 'URGENT: Extractor Down', message);
  } else {
    // Free tier: Log to backlog
    await logToBacklog(extractorKey, error);
  }
}
```

---

## Paid Tier: Custom Extractor Workflow

### Request Intake

```markdown
# PAID_REQUESTS.md

## Active Requests

### PR-001: TechCrunch Articles
- Customer: user@paid.com
- Source: https://techcrunch.com
- Category: Tech news articles
- Requested Fields: title, author, date, url, excerpt, thumbnail
- Status: In Progress
- ETA: 2025-12-05
- Priority: High

### PR-002: Hacker News Front Page
- Customer: another@paid.com
- Source: https://news.ycombinator.com
- Category: Tech news stories
- Requested Fields: title, url, score, comments, submitter
- Status: Queued
- ETA: 2025-12-07
- Priority: Medium

## Completed

### PR-000: Example Request
- Customer: test@paid.com
- Source: https://example.com
- Status: Deployed
- Deployed Date: 2025-12-01
```

### Build Process

1. **Customer submits request** → Intake form captures URL, desired fields
2. **You inspect source** → Use Playwright to analyze DOM structure
3. **Build extractor** → Create extractors/custom/{source}.js
4. **Test thoroughly** → Write unit tests, verify extraction
5. **Deploy** → Add to CUSTOM_EXTRACTORS registry
6. **Notify customer** → Email: "Your extractor is live!"
7. **Monitor** → Hourly health checks for paid extractors

### Pricing Model

**Tier 1: $9/month**
- 1 custom extractor request per month
- 24-hour SLA for fixes
- Priority support

**Tier 2: $29/month**
- Unlimited custom extractor requests
- 2-5 day SLA for new extractors
- 12-hour SLA for fixes
- Dedicated support channel

---

## Migration Path

### Phase 1: Foundation (Current)
- ✅ CSS presentation layer
- ✅ Basic capture/refresh
- ✅ Universal HTML fallback

### Phase 2: Core Extractors (Next)
- Build 10-15 core extractors
- Implement extractor registry
- Update capture logic to use extractors
- Add unit tests

### Phase 3: Monitoring (After Core)
- Build health monitoring system
- Set up alerts for breakage
- Create maintenance dashboard

### Phase 4: Paid Tier (When Ready)
- Launch intake system (PAID_REQUESTS.md)
- Build custom extractors on request
- SLA-backed maintenance
- Pricing page + payment integration

---

## Implementation Checklist

### Immediate Next Steps

- [ ] Create `/extractors` directory structure
- [ ] Build first extractor (BBC Sport)
- [ ] Write extractor template/boilerplate
- [ ] Update capture logic (content.ts)
- [ ] Add "sourceId" to component schema
- [ ] Test extractor with real capture

### Short-term (1-2 weeks)

- [ ] Build remaining core extractors (10-15 total)
- [ ] Write unit tests for each
- [ ] Update refresh logic (dashboard.js)
- [ ] Add extractor selection UI (popup)
- [ ] Document extractor creation process

### Medium-term (1 month)

- [ ] Build monitoring system
- [ ] Set up alerts for failures
- [ ] Create maintenance dashboard
- [ ] Document known limitations per extractor

### Long-term (3+ months)

- [ ] Launch paid tier
- [ ] Build customer intake form
- [ ] Implement SLA tracking
- [ ] Create payment integration

---

## Key Decisions & Rationale

### Why Extractors > CSS?

**CSS:**
- ❌ Can only hide elements, not filter text
- ❌ Site-specific rules break other sources
- ❌ Creates tech debt at scale
- ✅ Good for: presentation (fonts, spacing, layout)

**Extractors:**
- ✅ Can filter text content
- ✅ Isolated per source (can't break others)
- ✅ Semantic extraction (structured data)
- ✅ Testable, maintainable, scalable

### Why Two Tiers?

**Free Tier:**
- Good enough for casual users
- Drives adoption
- Community contributes bug reports

**Paid Tier:**
- Sustainable business model
- Prioritized maintenance
- Custom sources on demand
- Each paid extractor benefits free tier too

### Why Not LLM Extraction?

- Too expensive for free tier
- Too slow for real-time capture
- Overkill for most sources (CSS selectors work fine)
- Consider for paid tier v2 (complex/dynamic sites)

---

## Notes for Future Developer

**When picking this up:**

1. Read this entire document first
2. Start with BBC Sport extractor (it's well-understood)
3. Use Playwright to inspect DOM structure
4. Follow the template in this doc
5. Test thoroughly before deploying
6. Document any site-specific quirks

**Common Pitfalls:**

- Don't try to make one extractor work for multiple sources
- Don't over-engineer (simple CSS selectors usually work)
- Don't forget to handle missing data gracefully
- Don't skip tests (sites redesign frequently)

**When in Doubt:**

- Look at existing extractors for patterns
- Use Playwright to debug extraction issues
- Accept minor artifacts (perfection isn't required)
- Document limitations instead of hacking around them

---

**Last Updated:** 2025-12-01  
**Author:** Manasak  
**Status:** Planning Phase  
**Next Review:** When ready to build extractors
