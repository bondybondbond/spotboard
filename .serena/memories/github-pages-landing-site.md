# GitHub Pages Landing Site - Implementation Memory

## Overview
Public homepage at `https://bondybondbond.github.io/spotboard/` for AI discoverability and Chrome Web Store traffic.

## Key Technical Patterns

### Carousel Implementation (Vanilla JS)
```javascript
// Auto-rotate every 5s, pause on hover, manual dot navigation
// ~50 lines, no dependencies
// Scroll position preservation across updates
```

**Files**:
- `docs/index.html` - Landing page with carousel
- `docs/assets/carousel/` - 3 images (capture-flow.png, dashboard.png, latest.png)
- `docs/assets/logo.png` - 48×48px turquoise icon

### CSS Spacing System
```css
/* Reduced by ~40% from initial deployment */
--space-lg: 1.5rem;    /* was 2.5rem */
--space-xl: 2.5rem;    /* was 4rem */
--space-2xl: 3.5rem;   /* was 6rem */
```

**Key fix**: Removed `min-height: 90vh` from hero to reduce whitespace.

### UTM Tracking Convention
All CTAs use consistent format:
```
?utm_source=github&utm_medium=pages&utm_campaign=homepage
```

Badge links use `utm_campaign=badge` for attribution.

### Content Hierarchy (Problem-First)
1. Hero (brand + Featured badge + problem statement)
2. Use Cases (4 personas with pain points)
3. How It Works (3-step visual)
4. Video Demo (embedded YouTube)
5. What It's NOT (differentiation)
6. Key Features (condensed to top 3)
7. Privacy (trust signals)
8. Footer (links)

### AI Discoverability (llms.txt)
```markdown
# SpotBoard
> Chrome extension for monitoring website sections. Featured on Chrome Web Store.

## Links
- Chrome Web Store: [URL with UTM]
- Homepage: [GitHub Pages URL]
- GitHub: [Repo URL]
```

Format: H1 + blockquote + links for AI scraper parsing.

## Design Principles

**Editorial Dashboard Aesthetic**:
- Typography: DM Sans (display) + IBM Plex Mono (code)
- Colors: --color-ink (#0A0A0A), --color-accent (#2563EB), --color-highlight (#FBBF24)
- Spacing: 8px base unit
- Shadows: --shadow-sm/md/lg for depth

**Featured Badge Prominence**:
- Gold pill (#FBBF24) next to brand headline
- "⭐ Featured on Chrome Web Store" text
- Clickable with UTM tracking

**Mobile Responsiveness**:
- Carousel dots remain functional
- 3-step grid collapses to single column
- Brand header centers on <768px

## Deployment Process

1. Make changes to `docs/` folder
2. Commit and push to main branch
3. GitHub Pages auto-deploys in 1-2 minutes
4. Verify at bondybondbond.github.io/spotboard/

**Build time**: ~90 seconds for Jekyll processing

## Assets Copied from Private Repo
- `spotboard-private/media/1-1.png` → `docs/assets/carousel/capture-flow.png`
- `spotboard-private/media/2-2.png` → `docs/assets/carousel/dashboard.png`
- `spotboard-private/media/example_board_14-2-26.png` → `docs/assets/carousel/latest.png`
- `spotboard/public/logo.png` → `docs/assets/logo.png`

## Success Metrics (Week 1 Targets)
- Avg session duration: >60 seconds
- Bounce rate: <50%
- CTR to CWS: 35-45%
- Video play rate: >25%

## Future Enhancements (Not Yet Implemented)
- Replace carousel with pre-loaded board examples per use case
- A/B test Featured badge placement
- Track carousel engagement (which slide gets most clicks)
- Add GA4 for funnel analysis
