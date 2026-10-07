# SpotBoard Changelog

## [Unreleased]

### Fixed

- **Amazon cards now refresh** (#160): Amazon gives each tile a new random ID every time its page loads, so a card captured there could never be found again and showed "Site layout changed". SpotBoard now recognises that pattern (many same-shaped random IDs on one page), skips them, and locks onto the tile by a stable name instead.
- **Refreshed Amazon cards no longer show every label twice** (#165): Amazon keeps a hidden copy of each label and price for screen readers ("Shoes Under $50Shoes Under $50", "With Deal: $21.41$21.41"). Capture always left those copies out, but refresh brought them back. Refresh now drops them too: text the site hides permanently with its own stylesheet, positioned outside the page layout and with no fade, is removed. Content a site fades in as you scroll is kept, because a background refresh can't tell whether that fade has run yet. A card that already refreshed with doubled labels may show "Site layout changed" once; press **Re-capture** to fix it.

- **"Retry failed cards" now retries only the failed cards** (#164): after a Refresh All where some cards couldn't refresh, the Retry button used to refresh every card on the board again. It now refreshes just the cards listed in the warning — the ones that already worked are left alone — and still works after the page reloads. A card you deleted or paused in the meantime is skipped, and cards that share a name are told apart. A retry is not counted as a new Refresh All in usage stats.
- **Refreshed NPR cards no longer show a few older stories with two pictures** (#138): some older NPR stories carry a square and a wide version of their picture as two different image files, so refresh kept both. Refresh now recognises them as the same story (same link, same text, same picture description) and keeps the one your card was captured with — but only when your saved card clearly favours one of them, so a real gallery of different pictures is never merged.

### Changed

- **The "couldn't be refreshed" warning now says when retrying won't help** (#168): cards that failed because the site layout changed, the card came back empty, or excluded content came back can't be fixed by pressing Retry. The warning now lists those separately under "Re-capture needed" and points you to the card's **Re-capture** button. Retry only re-runs the cards a retry can actually fix, and if none are left the Retry button is hidden.
- **Under the hood: "exclude all like this" now remembers what kind of group you clicked** (#129): nothing looks different today. Capture used to work out a second time, from scratch, whether your Shift+click was a table column, a row of same-looking items or a repeated element across the section, so any future change to how groups are found could have quietly turned a column or row group into a whole-section rule. It now records the kind once, at the click, and uses that.

## [1.4.3] - 2026-10-05

### Added

- **Cookie pop-ups no longer block capturing a site you picked** (#156): when SpotBoard opens a site for you (from "What will you track next?" or a card's **Re-capture**), it now waits with a small green panel in the top-right corner instead of switching capture mode on straight away. The page works normally, so you can close its cookie or consent pop-up, then press **Start capturing** (or click the SpotBoard toolbar icon). The × closes the panel and cancels. If the site reloads itself after you choose your cookie settings (CNN, ESPN), the panel comes back. Starting capture from the toolbar icon yourself is unchanged. On a site with no pop-up this is one extra click.
- **"Exclude all like this" now keeps working as the page changes** (#128): when you Shift+click to remove every similar item (like every photo credit on NPR's front page) and all of them are removed, SpotBoard remembers the rule instead of one position per item. The rule still removes them on tomorrow's shuffled page — including the credits of brand-new stories — and confirming a capture with many removals is much quicker (on NPR, about 6.5 s down to 2.7 s, of which 2 s is the fixed wait for the page to finish loading). If a saved rule ever stops matching, the card keeps its last good copy and offers **Re-capture** ("An 'exclude all like this' rule no longer fits this page"). Existing cards are untouched; re-capture a card to get this.

- **Exclude straight from the preview** (#66): while capturing, you can now click anything in the purple Preview panel to exclude it, instead of hunting for it on the page. Hovering outlines it in the preview and on the page; clicking excludes it exactly like a click on the page (red mark, Grow/Shrink, kept after refresh), and scrolls the page to it if it was out of view. Clicking the highlighted exclusion again restores it; Shift+click in the preview excludes the whole group of similar items, just like on the page. A new **↶ Undo** button at the top right of the preview takes back your last exclusion step (a click, a Shift+click group, or one Grow/Shrink), for when a click grabbed a bigger block than you meant. Links in the preview never open. Useful for things you can only see in the preview, like yr.no's hidden table caption.
- **Turn a hard-to-scan card into a bullet or numbered list** (#103): every card gets a **⋯** menu, the last button in its header (it replaces the clock). Pick **Off / Bullets / Numbered** under "List format" and rows that run together — like Daily Faceoff's link lines — become a tidy list, per card, without changing the original site. The choice is remembered, kept through refreshes, and included in export/import. The menu also holds the last-refresh time (click it for the card details window it always opened), the full link to the original page (click to open it), and greys out the list choices with "No list found in this card" when a card has no rows to list. A failed refresh is still shown by the card's amber banner.
- **Capture bar no longer hides the top of the page** (#108): in capture, grow/shrink and exclusion mode, the coloured top bar fades away while your pointer is over it, so you can see and pick anything at the very top of a page. It comes back when you move down. The page itself is never moved.
- **Capture mode now shows what a click will capture** (#106): hovering in capture mode pins a small label to the outlined box, over a very pale green wash — "Click to capture" — so you can see the scope before you click. The same pale wash stays on the selected area while you Grow or Shrink it. The top bar now says "hover to preview, click on any content you want to add".
- **First screen now says what SpotBoard is for** (#105): a new user's empty board opens with "Check all your usual sites in one glance", a one-line explanation, and a labelled example board showing four sites side by side (news, a league table, deals, market movers). The practice button still opens Wikipedia, now with a hint to capture "In the news", which changes every day. The (?) help window gains the same one-line explanation above the how-to steps. The contrast check's dark-theme sync check, which had been silently skipped, runs again.
- **Re-capture a broken card in place** (#52): when a card's site changes and the card shows "Site layout changed", "Card came back empty" or "Excluded content came back", it now has a **Re-capture** button. It opens the original page in capture mode with a banner naming the card; pick the section again and the card is fixed in place, keeping its title, position, size and pause setting. Cancelling leaves the card untouched, and an empty pick never replaces your old content.
- **Dashboard sort + filter pills** (#76): two new pills next to the board tabs — "Sort" (A-Z alphabetical) and "Filter" (show active and/or paused cards, both selectable at once). Click a pill to open a small dropdown and pick an option; the pill lights up gold while a non-default choice is active. Applies globally across every tab, including All (`public/dashboard.html`, `public/dashboard.js`).
- **Board export/import** (#59): a low-profile "advanced options" menu in the dashboard header now lets you export your whole board (every card, including its captured content) to a file, and import it back — a way to recover from an accidental storage wipe, or move your board between profiles. Manual only; not an automatic backup.
- **Bulk exclusion — exclude all similar siblings in one action** (#34): while excluding elements during capture, Shift+hovering a list-style item now previews its whole group of matching siblings (same repeated card/row type) instead of just the one you're pointing at, and Shift+click excludes the whole group at once. A plain click still excludes just one element, as before. Narrow by design — only catches siblings that share the exact same styling class, so it won't help on every site (a more general fix shipped under #61, below).
- **Grow/Shrink exclusion boundary in the Previewer** (#61): when the thing you just excluded is too small (or #34's sibling-matching doesn't find a useful group), the preview panel now shows "Shrink" / "Grow exclusion" buttons that step the excluded area up to a containing section or back down, one level at a time, with a live preview of what would be removed at each step. Only the exclusion you're currently adjusting stays visible (with a subtle highlight) while you work on it — everything else looks like a normal, finished preview, same as before.

- **Grow selection while capturing** (#42): clicking an element in capture mode no longer jumps straight to the preview. A bar appears with "Shrink", "Grow" and "Continue" (or press Enter): Grow widens the green outline to the next larger container (skipping wrappers that look identical), Shrink steps back, and clicking a different element starts the selection again. Press Continue and everything after that, including exclusion, works exactly as before. Growth never goes past the page's main content area. Capture mode now has its own colour, lime (top bar and the small control panel), so it is clearly different from purple exclusion mode; the box that follows your cursor while picking is now dashed green instead of red, since red always means "excluded" (`src/content.ts`, `src/onboarding-coach.ts`).

- **Shift+click now bulk-excludes repeated bylines, dates and headlines across articles** (#87): on news pages where each article carries its own byline, timestamp and headline in a separate container, Shift+click on one now selects the matching ones across the whole captured section, not just siblings. Matches are exact (same styling class, or a real `<time>` date tag), stay inside the captured section, and headlines styled as a "featured" variant are deliberately left out. You still see every match outlined before you confirm (`src/content.ts`).
- **Bulk exclusion no longer breaks saving a card** (#90): excluding a very large number of repeated items (e.g. every photo credit on NPR) used to fail with a storage-quota error. Exclusions still sync between devices as before; if a card's list is too large for Chrome's sync limit, that card's exclusions are kept on this device only (other devices show a small note), and export/import carries them either way. A genuine can't-fit now shows a plain explanation instead of a raw error (`src/utils/exclusion-storage.ts`, `src/content.ts`, `public/utils/refresh-engine.js`, `public/dashboard.js`).

### Fixed

- **"Exclude all like this" now works on sites built with Tailwind, like Product Hunt** (#161): removing every vote count (or every date, on the Tailwind blog) with one Shift+click is now remembered as one rule instead of dozens of fragile position-based ones, so the card keeps refreshing when the site adds or removes ad rows. If a rule would suddenly match far more than when you captured, the refresh stops and keeps your last good copy instead of guessing. Cards that already fail on Product Hunt need one Re-capture.

- **The "What will you track next?" suggestions now only list sites that work** (#153): we tried each suggested site end to end on a fresh install (open it, capture a block, refresh it). Product Hunt and Amazon could not be kept up to date and Slickdeals puts up a "verify you are human" wall straight away, so all three are gone from the list. The remaining nine (BBC, CNN, NPR, ESPN, AS, Sportskeeda, Wired, The Verge, HotUKDeals) are now shown in three rows of three: News, Sports and More. You can still capture those three sites yourself from the toolbar; they just are not suggested any more.
- **The first-run guide now tells the truth** (#151): after your first capture, the "You did it!" card no longer says the card "will stay updated automatically" (it doesn't — you press Refresh on your board) and now says so; the guide's first step says SpotBoard saves the section to your board instead of keeping it updated. Step 2 now mentions pressing Continue after you click, step 3 says Confirm Spot is in the panel on the right, the toolbar popup's third step explains Continue and Confirm Spot, and the top bar no longer promises "Esc to cancel" during the guided first capture, where Esc doesn't cancel.
- **A refresh no longer quietly puts back things you removed from older cards** (#145): on a card saved before SpotBoard kept a record of what you excluded (and for removed pictures and icons, which have no text to check), a refresh that missed one of your exclusions could bring the removed content back while still saying everything worked (next.io's author bylines were the proven case). SpotBoard now compares the refreshed card with the one you already have: if items of a kind you removed are showing and your saved card has none of that kind, the refresh stops, keeps your last good copy and offers **Re-capture** ("Excluded content came back"). Cards where the removed item is simply not on the page (yr.no's pop-up Close button) keep refreshing as before. This is a strong hint, not proof: if a site renames the thing you removed, or the kind you removed is also kept elsewhere in the card, it can still slip through until you re-capture.
- **"Exclude all like this" no longer kills a card when the site shows a different layout** (#141): some sites (Kalshi's Yes/No buttons, CNBC's bylines) keep two versions of the same thing on the page and show one depending on screen width. A card with an "exclude all like this" rule on one of those could stop refreshing for good, because the refresh looked at the other version and found nothing to remove. When you capture, SpotBoard now also remembers the other version if it can prove it is the same thing (same text, right next to it, one-to-one); if it is not sure, it saves nothing extra and behaves as before. Cards that already stopped refreshing need one **Re-capture** to get this.
- **Refreshing a card no longer swaps wide pictures for square ones** (#131): on NPR a refreshed card could show square, tighter crops of every story picture where you had captured the wide ones. NPR puts a square and a wide copy of each picture on the page and shows one depending on screen size; refresh can't tell which one is showing, so it took the first (the square one). It now keeps the copy that matches the card you already have, including for stories that are new since you captured. Cards that were already refreshed to square need one Re-capture to go back to wide.
- **Charts no longer leave a big blank gap underneath them** (#136): on a Kalshi card captured on a wide screen, the chart shrank to fit the card but the space the website had reserved for the full-size chart stayed behind, so a tall empty band sat between the chart and the odds. That reserved space is now dropped, in both the capture preview and the saved card, so the numbers sit right under the chart. Cards you already saved are fixed too, with no re-capture needed.
- **A card with an "exclude all like this" rule now refreshes on Kalshi** (#132): a freshly captured Kalshi card using that rule failed its very first refresh with "rule no longer fits this page — re-capture", and Re-capture could not fix it. Kalshi shows a different page layout depending on window width, and the refresh was settling on the narrow one where the rule matches nothing. It now keeps to the layout your rule was made for, and if no layout fits, the card still keeps its last good copy and says so as before.
- **A refreshed card no longer brings back things you never saw** (#130): after a refresh, an NPR card could start with a "toggle caption i" button on every picture and a hidden page title that were never there when you captured it. Refreshing now leaves them out, and a card that already had them is cleaned up by one refresh, with no re-capture. The "background tab" refresh methods now treat hidden items exactly like capture does, so they no longer let back items that capture had left out. The fast refresh method cannot see a site's styling, so it still relies on a built-in list of known sites for this; other sites that hide extra content the same way are not yet covered.
- **The green top bar stops telling you to Grow when you can't** (#127): once a selection is as big as it can get, the bar across the top now says "Click another element to re-select" instead of "Grow to include more", and the Grow wording returns as soon as you Shrink.
- **The Grow/Shrink hint only mentions buttons you can press** (#109): while adjusting a selection, the small panel used to say "Shrink to undo" even when Shrink was greyed out. It now names only Grow and Shrink when they are available, and shows a short "Continue, or click another element to re-select" when neither is.
- **Saving a single small icon no longer puts a green box around it** (#123): if you captured just an icon (like a comment bubble) rather than the text around it, SpotBoard's temporary green selection outline came along into the saved card. It is now removed, the same as for any other captured element.
- **Cards on pages whose section has spaces in its name can refresh again** (#126): when the section you picked was labelled with a name containing spaces (CNBC's news list is one), SpotBoard saved an address for it that pointed at nothing, so every refresh failed with "Site layout changed". Such names are now saved correctly. Two existing CNBC cards captured that way need a one-off Re-capture.
- **Cards with lazy-loaded pictures keep all their pictures** (#72): sites like CNBC only load a thumbnail when you scroll near it, so a news block captured or refreshed without scrolling came back with a handful of pictures and empty gaps for the rest. Capture and refresh now scroll once through just the selected block when they see those empty picture slots, then put the page back where it was, so the whole block is saved. A refresh that comes back with fewer pictures than the card already has, and still shows empty gaps, no longer overwrites the better copy.
- **Exclusions on news front pages hold on refresh again** (#125): on sites that show each story's photo twice (one copy hidden, for a different screen size) — NPR does this on every story — a card whose excluded photo credits or topic labels were picked item by item failed its very first refresh with "Excluded content came back". The #117 fix removed the hidden copies before working out where each excluded item was, which shifted every item's position away from where you excluded it. SpotBoard now finds your excluded items first, exactly as the page was when you captured it, then removes the hidden copies, then removes your exclusions — so both #117's duplicates and your per-item exclusions stay gone (`src/utils/dom-cleanup.ts`).
- **Video widgets that load lazily no longer make their section vanish** (#121): on sites that keep a video inside a hidden `<template>` until it is needed, the surrounding box looked empty during cleanup and was deleted, so the card silently lost that spot. Those boxes are now kept, and the video shows as its poster picture (or a placeholder), like any other video. Genuinely empty boxes are still tidied away.
- **Capture bar stays on one line on every site** (#124): on sites like Kalshi the lime top bar dropped its logo onto a separate row above the text, making the bar twice as tall. The bar now stays a single row everywhere.

- **Small icons no longer blow up to a giant shape in the capture preview and on a fresh card** (#97): on sites like Richmond Nub News, the little comment-bubble next to each headline showed as a huge solid bubble when you captured the page, then as a huge bubble on the card too. Some icons (Font Awesome and similar) are drawn on a big internal canvas with no fixed size, and SpotBoard mistook them for charts, which are allowed to fill the card. It now recognises those icons (by their Font Awesome markers, or by being one square single-colour shape) and caps them at SpotBoard's standard small icon size (24px, so still slightly larger than some icons are on the real page); real charts (Kalshi, sparklines, labelled graphs) are unaffected. Accepted limitation: a fast refresh that doesn't open the page doesn't run the site's own scripts, so icons a site adds with JavaScript are not recreated and disappear from the card after that kind of refresh. They are decorative, so this is not treated as lost content (`src/utils/dom-cleanup.ts`).

- **JW Player video thumbnails (NPR "Watch" carousel, CNN video cards) no longer show a black box or a "preview unavailable" message when a real thumbnail is available** (#93): some sites (JW Player, used by NPR and CNN among others) draw their video's thumbnail as a separate picture element next to the video, not as the video's own poster image. That separate element held no text, link or image of its own — only a background picture — so SpotBoard's cleanup was treating it as empty decoration and discarding it before it could be saved, along with the thumbnail it held. It's now recognised as real content and kept; where a real thumbnail is genuinely unavailable (e.g. CNN's auto-playing homepage clips), the "preview unavailable" placeholder introduced by #119 still applies, and the video itself never plays or reappears (`src/utils/dom-cleanup.ts`, `src/utils/dom-snapshot.ts`).
- **Captured videos are now always a static picture, never a playing video** (#119): a captured video with a real thumbnail now renders at the same size as a normal image in the card — still just a picture (no controls, no sound), clicking still takes you to the original page. Videos that don't ship a thumbnail at all (e.g. CNN's silently auto-playing, looping homepage clips) previously stayed a live, playable video, just small enough to go unnoticed — those now show a small "preview unavailable" placeholder instead, so nothing in the dashboard can ever autoplay (`src/utils/dom-snapshot.ts`, `src/utils/dom-cleanup.ts`).
- **Excluding a duplicate mobile/desktop version of a card no longer lets it come back on refresh** (#117): some sites (e.g. The Verge, NPR) quietly render the same card twice for different screen sizes, showing only one at a time. Excluding the one you see used to let the other, previously-hidden copy reappear on the next refresh. Both copies are now recognised as duplicates before your exclusion is applied, so the one you removed stays removed (`src/utils/dom-cleanup.ts`).
- **Card details window no longer shows "Capture method"** (#82): the card details window (opened from the ⋯ menu) had a "Position-based / Header-based" line that was internal jargon with no use to you. It's gone; how cards capture and refresh is unchanged.
- **No more false "Excluding heading may affect refresh" warning** (#92): in exclusion mode, clicking a heading or title no longer pops up an orange warning. It was a false alarm — excluding headings doesn't affect refresh — and the warnings stacked up when you Shift+clicked several at once.
- **Green/red colouring now covers only the number** (#113): after a refresh on JS-heavy sites (e.g. Polymarket comments), a whole sentence containing "+8.7" or "-300" could turn green/red. Now only the number is coloured on every refresh route, and a trailing full stop or comma is left uncoloured.
- **Lists of similar images now show at one consistent size** (#110): on cards like HotUKDeals, deal images used to come out as a random mix of large and tiny depending on how the page happened to lay out when captured. A run of three or more same-role images (each at least 100px on the source site) now all get the same size, never smaller than "medium" — so Guardian story pictures show at their real ~123px instead of being shrunk to 80px. Logos, sponsor strips, avatars and small thumbnails are left alone. Applies the next time a card is captured or refreshed.
- **Refreshing a card no longer erases its capture date, or undoes edits made while it refreshes** (#116): a single-card refresh used to delete the card's capture date (so the "order captured" sort quietly stopped working for it). Both refresh paths now update only the refresh result (time, status, content) and leave everything else on the card as it is, so a rename, pause or board move made mid-refresh is kept and a card you delete mid-refresh stays deleted. Cards that already lost their capture date keep the old ordering fallback.
- **Your exclusions now stick on endlessly-scrolling pages** (#112): on sites that only keep the posts near your screen (e.g. Peerlist Scroll), scrolling while excluding used to leave the preview blank, and the items you'd already excluded seemed to reset. Exclusions (including Shift+click groups) are now remembered and re-applied whenever the same kind of content scrolls back into view, and the preview refreshes as you scroll so it always shows the posts currently on screen. A single exclusion only returns to identical content, never to a different post that took its place. Capturing more than the few posts on screen is still a separate limitation (#111) (`src/content.ts`).
- **A refresh can no longer silently save a broken card** (#101): when a site is captured in a hidden browser tab and comes back with far fewer images than the card's saved copy (e.g. HotUKDeals dropping from 24 deals to 1), SpotBoard now retries in a visible popup instead of saving it. If even the popup can't load the page properly, the card keeps its last good copy and says "Page didn't fully load — kept your last good copy". A page captured while genuinely visible is trusted even if it has fewer images, so real site redesigns still come through (`public/utils/refresh-engine.js`).
- **Excluded items now stay gone on cards whose page layout changes between refreshes** (#99): when SpotBoard could not re-find an excluded block by its position (e.g. the Yes/No buttons on a Kalshi market), it now recognises it by its own text and removes it, so the refresh completes in one normal attempt instead of stopping with "Excluded content came back". It only does this when it is unambiguous; otherwise the card still fails safe.
- **Excluded items no longer silently reappear after a refresh** (#96): SpotBoard now remembers what each excluded element contained, and on refresh checks that the content you removed hasn't come back. If it has (a site rendered differently on the refresh), it keeps your last good card and shows "Excluded content came back — re-capture this card" instead of quietly showing what you removed. A promo you excluded that has genuinely disappeared from the site does not cause a failure. Also fixes refresh picking an empty loading placeholder instead of the real card on some sites, and position-based exclusions that stopped applying. Cards captured before this update keep working exactly as before (`src/utils/dom-cleanup.ts`, `public/utils/refresh-engine.js`, `src/content.ts`).

- **Excluded items coming back after a refresh** (#89): if you excluded several things in one card (e.g. a heading, then the rank numbers, then the bylines on The Verge's "Most Popular"), some of them could quietly reappear on refresh because removing the first ones shifted the positions the later ones were found by. Exclusions are now all located first and removed together, so what you excluded stays excluded whatever order you clicked in (`src/utils/dom-cleanup.ts`).

- **Sky Sports card images turning into tiny "." placeholders after a refresh** (#86): Sky (and similar sites) ship a 1x1 dummy image alongside the real image address and rely on the page's own scripts to swap it in. Refresh reads the page without running those scripts, so the dummy won. SpotBoard now treats a dummy image as "not set" and uses the real address (`src/utils/dom-cleanup.ts`).
- **Sky Sports tile groups captured as blank and refreshed as "Card came back empty"** (#70): the cleanup step that strips mobile-only duplicate copies removed any element whose class name merely contained "mobile-", and Sky marks every tile with a layout class (`glints-box--mobile-edge`) that matched, so every tile was deleted and nothing was left to save. Layout-modifier classes (`--mobile-…`) are no longer treated as duplicates, while genuine ones like `mobile-content` or `card__mobile-title` are still removed. Known limit: modifiers such as `--is-mobile-hidden` are still treated as duplicates. Sky's tile images may still show as empty slots (Sky loads them lazily) (`src/utils/dom-cleanup.ts`).
- **DailyFaceoff news card failed every refresh with "Card came back empty"** (#75): the site sends a bare grey loading placeholder and fills in the headlines afterwards with JavaScript, so the fast refresh path only ever saw the placeholder and never tried the slower tab-based refresh that lets the page finish loading. Refresh now recognises a block made only of empty grey filler shapes as "not loaded yet" and falls back to the tab refresh, so these cards update again (`public/utils/refresh-engine.js`, `src/utils/dom-cleanup.ts`).
- **Dragging a card onto a board tab silently stopped working while Sort was set to A-Z** (#76): the fix that disables manual drag-reordering under A-Z sort was cancelling the whole drag instead of just the reorder, so dragging a card onto a tab to move it to another board did nothing either. Sort no longer interferes with drag-to-tab (`public/dashboard.js`).
- **Excluding a section's heading reappeared after every refresh** (#71): on sites where a heading's styling class is shared by more than one section (e.g. theverge.com's "Most Popular" and "Most Discussed" both use the same heading style), the stored exclusion for that heading was accidentally anchored to a page-wide position rather than to the captured section itself — a position that a refresh's isolated, single-section content can never match, so the exclusion silently failed to reapply, every time. Also hardened: the excluded heading's own text was independently being stored as the card's "refresh anchor," which could let a self-healing refresh rebuild the section around exactly the heading you'd hidden. Excluding a heading now survives refresh reliably (`src/content.ts`). Existing cards captured before this fix keep their old, still-broken exclusion — re-capture (or re-exclude) the heading to pick up the fix.
- **Reddit cards showed a duplicate headline and leftover menu text** (#80): capturing a Reddit post pulled in invisible content from its closed "more options" menu (Follow / Award this post / Save / Hide / Report) plus a second, invisible copy of the headline meant only for screen readers — both are now stripped, so Reddit cards show just the real headline and content (`src/utils/dom-cleanup.ts`).
- **Guardian capture: preview stayed blank and exclusion did nothing** (#81): on Guardian's card-based pages (and similarly-built sites), the whole card is covered by an invisible click-through link with no content of its own, so clicking anywhere on the card captured that invisible link instead of the real content — an empty preview, with nothing to click for exclusion either. Capture now recognizes when the clicked spot has nothing in it and widens to the nearest content it's actually covering, and exclusion clicks now see past that same invisible layer to whatever's really underneath (`src/content.ts`).
- **Capture exclusion panel hogged the screen and its own instructions blended into the page** (#60): the purple panel duplicated its own instructions and only let you collapse the embedded preview, not the panel itself. The "what to do" instructions now live in a single persistent bar across the top (brand purple with highlighted key actions, so it doesn't blend into the host site's own colors), and the panel moved to sit mid-right instead of overlapping it — collapsing to just "Add to board?" plus Confirm/Cancel, restoring the preview exactly as you left it when expanded. The panel's header/position capture-mode toggle ("Advanced") was also removed as unnecessary UI surface; capture mode now always follows auto-detection (`src/content.ts`).
- **Can't deselect a whole excluded table column** (#73): Shift+click excludes a whole table column (or matching sibling group) in one go, but Shift+click on an already-excluded one used to un-exclude only the single cell you clicked — you had to click every cell individually to undo it. Shift+click now un-excludes the whole group again too, mirroring the exclude direction. On real sites that wrap each cell's value in nested styling elements (e.g. yr.no), the first attempt at this fix didn't actually work — a real click lands on that nested element, not the cell itself, so the un-exclude logic never recognized the cell as already excluded. Fixed to resolve up to the real excluded cell regardless of what was literally clicked (`src/content.ts`). The capture panel's help text now also mentions that un-excluding is possible, not just excluding.
- **CNBC news card permanently failing to refresh** (#77): once the headline captured at the time you added a live news-feed card scrolled off the site's feed, refresh would fail forever with "Site layout changed" — the internal check verifying the card hadn't moved was comparing against that one specific (now-gone) headline, and news feeds are excluded from the existing "content just rotated" recovery because a link-heavy news section can't be told apart from a link-heavy wrong section by link count alone. Cards now also remember a stable identity marker from when you captured them, so refresh can recognize "same feed, new headlines" without needing the exact original headline to still be there (`src/content.ts`, `public/utils/refresh-engine.js`).
- **Kalshi concurrent-refresh starvation** (#33): Refresh All's active-focus lane (`requiresActiveFocus` cards — sites needing a real OS-focused popup to render, e.g. Kalshi) ran up to 3 cards concurrently via `chrome.windows.create({focused:true})`. Since Chrome only has one truly OS-focused window at a time, concurrent focus-tier workers (or a finishing worker's focus-restore step) could steal focus from a sibling mid-extraction, causing that card to fail to refresh. Serialized the focus lane to one card at a time (`public/utils/refresh-engine.js`) — trades back some of issue #11's measured concurrency speedup for correctness on this small, already-visible-flash tier.
- **Low-contrast "Capture a site" ghost-card text** (#32): the placeholder hint shown on empty board slots (until you have 3 real cards) was too faint to read comfortably. Bumped its contrast and size in both light and dark mode (`public/dashboard.html`).
- **Inconsistent Kalshi chart layout across refreshes** (#43): depending on which refresh tier captured a card, Kalshi's chart came back in two different layouts (a small chart squeezed next to the buy panel, or a large chart-only view) because the background-tab tier didn't render at the same width as the other two tiers. Cards can now opt into a fixed capture width so every tier renders the same layout (`public/utils/refresh-engine.js`, `public/dashboard.js`).
- **Empty-state modal's "open popup" outcome never reached analytics** (#26): those events were wired to Google's `gtag()`, which the dashboard never loads, so every click was silently dropped. Switched to the dashboard's real analytics path; two related clicks that overlapped existing onboarding tracking were dropped rather than fixed (`public/dashboard.js`).
- **HotUKDeals card stuck showing only a banner and merchant logos, no deal images** (#41): once a background-tab refresh returned a near-empty image set (the site's per-deal images don't render without a focused browser tab), the refresh engine's own degradation check compared each new attempt against that same degraded result instead of a real baseline, so it never noticed anything was wrong and never tried the more reliable capture method. Now it recognizes when a feed-sized card is stuck with almost no images and tries harder (`public/utils/refresh-engine.js`).
- **Captured cards sometimes named just a stray digit** (#55): sites that render a live value (a clock, a population counter) as separate digit-per-character or digit-group elements could get a card name like "2" or "8" — just the first fragment of the real value, not the value itself. Card naming now recognizes when a candidate is only part of a split value and looks past it for something that stands on its own, falling back to the existing site-name label when nothing does (`src/content.ts`).
- **Some captures rendered blank or as one giant clipped character** (#56): sites that inline an oversized font-size sized for their own full-width page (e.g. time.is's clock) broke both the preview and the dashboard card once shown at SpotBoard's much narrower size. Now recognized and normalized so the content renders at a sane size, on capture, refresh, and display alike (`src/utils/dom-cleanup.ts`).
- **"View on SpotBoard" could bring up a window you never noticed** (#53): after confirming a capture, clicking the CTA could switch focus to a separate browser window (e.g. one left open on another monitor) instead of showing the dashboard in the window you were actually looking at — easy to mistake for the capture having vanished. It now always brings the dashboard into your current window, with a fallback check for the rarer case of a window left at stale coordinates after a monitor is disconnected or reconfigured (`src/background.ts`).
- **Confirmation popup buttons rendered squashed on time.is** (#58): time.is applies a site-wide CSS rule that floats every `<div>`, which collapsed the "View on SpotBoard"/"Close" buttons down to their text width instead of filling the popup, unlike on most other sites. Now explicitly guarded against on the popup itself (`src/content.ts`).
- **Excluding an element during capture could exclude the wrong one on Kalshi** (#1): on Kalshi's live-updating odds table, clicking the Yes/No buttons to exclude them could instead exclude the "Chance" header, because the page's real-time updates could shift content between the moment it was highlighted and the moment it was clicked. Exclusion clicks now only take effect when they land on the exact element that was highlighted; if content shifted in that instant, nothing gets excluded rather than the wrong thing (`src/content.ts`).
- **Capture confirmation, "Spotted" notification, and empty-capture warning could render faded or washed out on some sites** (#13): these popups lived in the page's own styling context, so a site's CSS rules for generic elements (buttons, boxes) could bleed into them — dimming them, blending their text into the background, or forcing odd casing. Isolated them from the site's CSS rules that were causing this, so they render correctly regardless of the site (`src/content.ts`).
- **Excluded table content (e.g. a weather site's wind column) could come back after a refresh** (#67): when the excluded content was one column of a table, the stored exclusion could be tied to its row's position in the table's internal grouping — which some sites reshuffle over time as content ages — so refresh silently failed to remove it again. Excluding a table cell now targets the whole column directly instead of a position, which isn't affected by that kind of reshuffling (`src/content.ts`, `src/utils/dom-cleanup.ts`). Already-excluded cards from before this fix need excluding once more to pick up the more durable version.
- **Shift+click bulk exclusion could group the wrong table cells together** (#62): on tables that style columns with a shared class (e.g. right-aligned numbers), Shift+click's bulk exclusion could group unrelated columns from the same row together instead of down the intended column. Shift+click on a table cell — including its column header — now correctly selects that whole column; a plain click still excludes just the one cell, as before (`src/content.ts`).
- **A correctly-excluded table column could still come back after a refresh** (#74): on tables whose header row legitimately has fewer cells than its data rows (e.g. a merged or sub-labeled header, no colspan/rowspan involved), the safety check meant to trust a whole-column exclusion compared the header row's cell count too and rejected the column every time — so the excluded content reappeared on every refresh, not just occasionally. That check now only compares data rows against each other, and also catches a couple of table shapes it was silently missing before (`src/content.ts`, `src/utils/dom-cleanup.ts`).
- **CNBC news card lost its article thumbnails after a refresh, text only** (#72, partial): the popup window used for the last-resort refresh method renders narrower than a normal browser window, and CNBC only mounts its article thumbnails once the page is wide enough — at that narrower width they never appeared at all, and the refresh's own "did we lose the images?" safety check had gotten stuck comparing against an already-broken capture, so it stopped trying to fix it. The popup now temporarily widens itself when this happens, and the safety check no longer gets stuck on a bad baseline (`public/utils/refresh-engine.js`). Not fully fixed — only the first ~5 articles in the feed reliably get their thumbnail back; the rest still come back text-only. Good enough to ship now, revisit if it turns out to matter more than expected.
- **A card's title could turn invisible on hover in dark mode** (#79): hovering over any card's title briefly highlighted it with a background color that was hardcoded from before dark mode existed — light grey against dark-mode's near-white title text, making the title unreadable until you moved the mouse away. The highlight now uses a proper theme-aware color; also darkened the light-mode version, since the first pass was barely visible there (`public/dashboard.js`, `public/dashboard.html`).

### Internal

- **Automated tests for the capture/exclusion logic** (#40): the project's automated test files hadn't actually run in a long time — they required a full browser and silently failed when run any other way. Replaced with a real, runnable test suite covering multiple-element exclusion, nested exclusions, table-column exclusions, the empty-capture warning, and content captured from an open shadow DOM. No user-visible change.
- **Peerlist-style scrolling feeds: refresh behaviour pinned by tests** (#111): feeds that only load the posts on screen (Peerlist Scroll) capture just a couple of posts, and a blank result on refresh is already rejected so your last good card is kept. Added regression tests using a real (anonymised) example; no behaviour change. No user-visible change.

## [1.3.4] - 2026-03-05

### Fixed

- **Blank capture on BBC Sport / yr.no**: `isAriaHiddenDecorative` guard in `sanitizeHTML` — only strips `aria-hidden` elements with no visible content (no text, no media children); never strips by aria-hidden alone
- **Sportskeeda dark overlay**: Strip inline `<style>` and `<link rel="stylesheet">` tags at top of `cleanupDuplicates` — prevents site CSS injected via captured HTML from applying globally to the dashboard
- **HotUKDeals "Site layout changed"**: `getDominantTag` feed fallback — falls back to most-common tag when no single tag exceeds threshold, fixing sites with mixed list structures
- **Groupon images not loading**: `crossOrigin` attribute now set only for SVG images (was incorrectly applied to all `<img>` elements, breaking CORS on raster images)

### Changed

- **Manifest description**: Scoped "stays local" claim to captured content only — removes absolute "data never leaves your browser" phrasing that contradicted GA4 analytics

---

## [1.3.3] - 2026-03-05

CWS compliance update — description-only change (no code changes from v1.3.1). Updated store listing to document card resizing, Smart Exclusion Mode, and Sentiment Coloring. Updated GA4 analytics disclosure.

---

## [1.3.1] - 2026-02-12

### Added

- **Live Capture Preview**: WYSIWYG iframe preview in confirmation modal shows exactly how card will appear on dashboard
  - Updates live as user toggles exclusions (300ms debounce)
  - Scroll position preserved across updates
  - Collapsible on small viewports (<600px)
  - GA4 `capture_cancelled` event tracking

- **Semantic Sentiment Coloring**: Finance cards now scannable at a glance with color-coded deltas
  - Positive changes (+2.45%, +150) display in green (#16a34a)
  - Negative changes (-1.50%, -24.75) in red (#dc2626)
  - Works across all refresh paths (initial capture, tab-based, direct-fetch)
  - Preview modal shows sentiment colors with dashboard parity

- **Refresh Single Card**: Per-card refresh button in top bar [Info] [Pause] [**Refresh**] [Delete]
  - Inline DOM update (no page reload)
  - Spinning icon animation, toast notification
  - Works on paused cards

- **Card Title Bar Redesign**: Complete visual overhaul of card header
  - Circular icon buttons with accessible CSS tooltips
  - Pink paused header (#FCD1DE)
  - Larger favicons (24px)
  - Title bar background #EEEEEE with black bottom border

- **THIRD_PARTY_NOTICES.md**: MIT attribution file for third-party SVG icons

### Fixed

- **Fetch errors bypassing tab fallback**: HTTP errors (403 anti-bot) now route to tab fallback instead of immediate failure
  - Zoopla `network_error` was 52% of all failures

### Technical

- **Shared module refactor**: `src/utils/dom-cleanup.ts` is single TypeScript source of truth for all 10 DOM cleanup functions
  - esbuild pre-build generates IIFE for dashboard globals
  - Eliminates code duplication between content.ts and dom-cleanup.js
  - Build pipeline: `node scripts/build-shared.js && tsc -b && vite build`
- Added `esbuild` as devDependency
- New files: `src/utils/dom-cleanup.ts`, `scripts/build-shared.js`
- `public/utils/dom-cleanup.js` now auto-generated (gitignored)

---

## [1.3.0] - 2026-02-10

### Added

- **Uninstall Survey**: Tally.so form triggers when users uninstall to collect diagnostic feedback
  - Pre-populated with 11 anonymous analytics fields (user_id, days_since_install, total_cards, etc.)
  - Conditional logic: "Which websites failed?" shown only if reliability issue selected
  - Enables cohort analysis (early churners vs late churners, heavy users vs light users)

- **Per-Card Grid Sizing**: Resize individual cards to 1×1, 2×1, 1×2, or 2×2 grid units
  - Resize button in bottom-right corner of each card shows current size
  - Flyout menu with visual 2×2 grid preview icons for each size option
  - Size persists across browser refresh, reopen, and Refresh All

### Fixed

- **Feedback bubble never appearing for upgraded users**: `install_date` only set on fresh install, not update
  - Backfill `install_date` and `user_id` on extension update if missing

- **Card size persistence on Refresh All**: Sizes no longer reset when clicking Refresh All button

### Changed

- Dashboard grid: 300×250px → 355×370px cards
- Card overflow: Hidden to prevent double scrollbars

---

## [1.2.1] - 2026-02-04

### Added

- **Dashboard Engagement Time Tracking**: Accurate measurement of user engagement for retention analysis
  - Page Visibility API integration (pauses when tab hidden)
  - Window focus/blur tracking (pauses when browser loses focus)
  - sessionStorage persistence across page refreshes within same session
  - 30-minute cap per session to prevent inflated metrics
  - All 7 GA4 events now send dynamic engagement_time_msec instead of hardcoded 100ms
  - Optional DEBUG logging for testing (gated by constants.js flag)

### Fixed

- **Material Icons text artifacts**: Remove "check_circle_filled", "more_vert" text when icon fonts don't load (affects Google Finance, Material Design sites)

### Changed

- Enhanced GA4 analytics with accurate engagement duration metrics
- Improved refresh_failed event tracking (includes selector_type, has_exclusions params)

### Technical

- 2 files modified: public/dashboard.js (+50 lines), public/ga4.js (signature update)
- Zero new dependencies - uses native browser APIs only
- Backward compatible - non-dashboard callers continue using default 100ms

---

## [1.2.1] - 2026-01-29

### Added

- **Analytics Implementation**: Google Analytics 4 integration for anonymous usage metrics
  - Tracks feature usage (captures, refreshes, opens) to improve product
  - Rolling 7-day activity windows (board opens, refresh clicks)
  - Toolbar pin status detection
  - Anonymous client_id only - no personal data collected
  - Full disclosure in privacy.md

### Changed

- Updated privacy policy with comprehensive GA4 disclosure
- Removed debug console logs for cleaner production experience

---

## [1.2.0] - 2026-01-25

### Added

- **Feedback System**: Integrated Tally.so form for user feedback collection
- **Pause/Resume**: Toggle individual components without deleting
- **Enhanced Welcome Modal**: Improved first-run experience with clearer instructions

### Fixed

- Image sizing consistency across different component types
- Modal z-index conflicts with page content
- Dashboard realtime sync improvements

---

## [1.1.0] - 2026-01-20

### Added

- **Self-Healing Refresh**: Automatic fallback when page structure changes
- **Skeleton Content Detection**: Identifies and retries JavaScript-heavy sites
- **Exclusion Mode**: Remove unwanted elements from captures
- **Position-Based Capture**: Capture elements by screen position when selectors fail

### Fixed

- Duplicate content removal for mobile/desktop responsive layouts
- Lazy-loaded image handling
- Protocol-relative URL conversion
- SVG cross-origin issues

---

## [1.0.0] - 2026-01-10

### Initial Release

- Capture website sections with visual selector
- Personal dashboard for all captures
- Manual refresh with "Refresh All" button
- Cross-device sync via Chrome storage
- Privacy-first: zero servers, local storage only
