---
title: Privacy Policy
permalink: /privacy/
---

# SpotBoard Privacy Policy

**Effective Date:** 16 October 2026
**Applies to:** SpotBoard 1.4.5 and later

## In short
- SpotBoard has no servers or accounts of its own. The content you capture is stored in your browser. Your card settings, including the full page address of each card, sync through your Google account using Chrome Sync.
- SpotBoard sends usage statistics to **Google Analytics 4 (GA4)**: no name, email or account, and no ID that stays the same. Events include the **hostnames** of sites you capture, refresh or visit from your board (for example `bbc.com`). Each event gets a fresh random ID that is not kept on your device, and there is no session ID or user ID. Google still sees each request's IP address in transit, and the list of hostnames from one refresh can look the same as the next, so we don't promise the data can never be linked.
- Analytics events are designed not to include page addresses beyond the hostname, page titles, card or board names, or captured content. Error reports carry only the kind of error, never its message (see below).
- **Analytics cannot currently be switched off inside SpotBoard**, and SpotBoard does not read a Do Not Track or Global Privacy Control signal. Uninstalling SpotBoard stops its analytics from then on.
- When you uninstall, Chrome opens an optional survey hosted by **Tally**. SpotBoard sends no data to it beyond the page request itself: the link carries no ID and no usage values. What you type and submit goes to Tally and to us.
- If you press the **Feedback button in the dashboard**, the survey opens on Tally's website in a new tab. The link carries three rough details (SpotBoard version, install-age band, card count up to 10), never the sites on your board. Once it is open it is Tally's page: Tally sees your IP address and browser details, and its page may record views and use its own identifiers. See "Feedback survey in the dashboard" below.
- Showing a **captured card's** icon sends that site's **hostname to Google's favicon service**. Opening the SpotBoard popup does not ask Google's favicon service for the icon of the tab you are on: it shows that tab's own icon, loaded from the site itself or from servers the site uses for its images (or your browser's copy of it). On a site where you have a captured card, the popup also shows that card's stored icon, and that icon does come from Google's favicon service.

## Who is responsible, and how to contact us
SpotBoard is operated under the name SpotBoard. Contact: spotboard@outlook.com

## Who receives what
| Service | What it receives | Linked to |
|---|---|---|
| **Google Analytics 4** | The analytics events described below, including hostnames | Nothing that persists: a fresh random ID per event |
| **Google favicon service** | The hostname of a site you captured, plus your IP address as part of the web request | No SpotBoard ID is sent |
| **Google Chrome Sync** (your own Google account; run by Chrome, not SpotBoard) | Your card settings, including full page addresses | Your Google account |
| **Tally** (uninstall survey) | Your answers, if you submit the survey, plus whatever Tally's page records when it opens (see "Feedback survey in the dashboard" for what we observed on the same pages) | Nothing from SpotBoard |
| **Tally** (dashboard feedback survey) | The three details in the link, your IP address and browser details when the page opens, whatever Tally's page records (views, progress, its own identifiers, error reports), and your answers if you submit | SpotBoard adds no ID. Tally appears to keep its own respondent and session identifiers (see below) |

## What stays on your device
Captured HTML, refresh results, and the date you installed SpotBoard (used on your device for onboarding timing; most events send only a rough band, and a few onboarding events send the time since install, as described below). The dashboard also keeps the times you opened the board or clicked refresh, for up to 30 days, on your device only; they are not sent. It also keeps a few notes for the feedback prompt (whether it has been shown, when it may return, why it was last put off, and how often each reason has happened); these are not sent either. Your exclusions are kept on the device and also sync (next section). Chrome limits how much SpotBoard can keep on a device, so very large boards can fill that space.

## What syncs through Chrome Sync (this is not analytics)
Each card's **full page address (URL, including path and query)**, label, the selector SpotBoard uses to find the section again, the card's icon address (which contains the site's hostname), a short text fingerprint (the first visible heading of the captured section, such as an article headline, or the card's name; up to 100 characters), a short markup identifier from the section (a `data-testid`-style attribute name and value, when it has one), your exclusions (the patterns always sync, and they can include a page's class names and element positions; the selector list syncs when it fits), size, creation and refresh times and refresh status, which board each card is on, plus board names and card order. Google handles this under your Google account. SpotBoard does not receive it, and captured HTML is not synced.

## Analytics we send (GA4)
**With every event**
- A fresh random ID for that one event. It is generated in memory, never stored and never reused, so the ID itself cannot link two events. There is no session ID and no user ID.
- Your browser name, OS and device type, browser language, SpotBoard version, and a rough install-age band (0, 1 to 6, 7 to 29, or 30 or more days). Events sent from the dashboard also say whether SpotBoard is pinned to the toolbar. Card clicks and deletes also carry a rough card-age band.
- Google also receives the usual details of any web request, including your IP address and browser identification. SpotBoard does not add them to the event.

**Events** (for example capture completed or failed, refresh completed or failed, board opened, card deleted, resized or reordered, board created, switched or deleted, onboarding steps)
- **Individual hostname events:** when you finish, adjust, re-capture or cancel a capture (including captures that fail or come out empty), when you pick a site from the add-card list, when a refresh of a card fails, when you click a card's content to visit its source, or when you delete a card, the event carries that site's hostname. A refresh that succeeds does not send an individual hostname event. Failure events also carry the kind of error and which method of finding the section was used.
- **Refresh hostname list:** each time you refresh your cards (all of them, or all cards on the board you are viewing), one event carries the hostnames of the cards that were refreshed (cards you have paused are left out) as a sorted, comma-separated list. The list is limited to 100 characters, so on a large board it holds only the hostnames that fit. It describes your board, not one site.
- Counts and flags: the categories you pick during onboarding, number of cards and active cards (shown as 10 when you have 10 or more), how long a refresh took, whether you used exclusions, which capture mode you used.
- **What can still repeat:** a few onboarding events carry the time since you installed (in seconds or hours), and the refresh hostname list can repeat for the same board. So these events are **not guaranteed to be unlinkable**.
- **Selection shape:** when you finish or cancel adjusting a selection, the event carries the site's hostname, the outcome, how many times you reselected, how long it took, and, if you used Grow, the HTML tag names and pixel sizes of the elements you stepped through (for example `div:300x200`, up to 100 characters). It does not carry the page's text, class names or selectors.

**Error reports.** When SpotBoard hits an unexpected error in its background process, it can send the kind of error (one of `Error`, `TypeError`, `RangeError`, `SyntaxError`, `ReferenceError`, or `other`) and a fixed label saying it came from the background process. It does not send the error message or any part of the technical stack. Older versions sent the error message and first line of the stack; five such reports were recorded between 18 February and 22 May 2026, and we can no longer read their text.

**Not sent as event data:** page titles, card names, board names, selectors, captured text or images, and web addresses beyond the hostname.

**Why:** to find and fix sites and layouts that fail, find errors, and decide what to build. We do not use analytics for advertising and we do not sell it.

**Google Analytics settings.** Google signals, granular location and device data, and all Google data-sharing options are switched off. We have accepted Google's data processing terms for Google Analytics. [PUBLISH: on the day of publication, re-read these settings, the BigQuery 60-day expiry, and Tally's storage region and deletion settings.]

**How long analytics data is kept — two different systems**
- **Google Analytics 4:** our settings keep event data for **2 months**. These settings do not affect Google's standard aggregated reports. [PUBLISH: confirm the 2-month setting is live; the 14-month figure applies until then.]
- **BigQuery copy:** we also copy raw events to Google BigQuery (London) for analysis. Those copies are deleted automatically after **60 days**. This limit applies to that copy only, not to GA4.
- **Events from older versions:** versions before 1.4.5 sent two random IDs that stayed the same until you uninstalled, an exact install age and 7-day usage counts. Those events stay in both places until the limits above remove them. This version deletes the stored IDs and counters from your device when it updates.
- **Versions before 1.4.5:** they behave as described in the "Events from older versions" bullet above and in the older-version notes under "Error reports", "Uninstall survey" and "Feedback survey in the dashboard". They also asked Google's favicon service for the icon of the site in your current tab whenever you opened the popup. Everything else in this policy describes 1.4.5 and later.

## Uninstall survey (Tally)
When you uninstall SpotBoard, Chrome opens an optional survey hosted by Tally (`tally.so`). SpotBoard sets that address in advance and it is a plain link: **it carries no ID and no usage values**, so a response carries nothing that identifies your installation or ties it to analytics events. Your browser still contacts Tally when the page opens, as for any web page. When we opened this survey page in a browser tab on 14 October 2026 it behaved like the dashboard surveys: it contacted Tally's event service and the same error-monitoring service, set no cookies and stored the same kinds of identifier-like keys in browser storage (see "Feedback survey in the dashboard").
- **Not sent:** any ID, site names, page addresses, counts, anything you captured. We removed the survey's old hidden fields on 14 October 2026. Older versions of SpotBoard may still add an ID or counts to this survey's link, and Tally's view records may still hold the full link address, including those values; we have not tested what Tally does with them.
- **What we ask:** the survey does not ask for your name or email (we checked the survey's questions on 14 October 2026). It asks why you uninstalled and, if you say a site did not work or something broke, which sites had issues and what the problem was, and has an optional free-text box. What you type there is yours to choose; please do not put personal details in it.
- **Where and how long:** Tally says it stores form data in Europe. We keep responses until we delete them; automatic deletion is not switched on, and Tally emails us a copy of each submitted response.
- **Older survey responses:** responses collected before 14 October 2026 included a random ID, usage counts and, in the oldest, a list of the site names on your board. We deleted 11 such responses from the survey on 13 October 2026 and permanently removed them from Tally's trash on 15 October 2026 (Tally's trash was then empty). We also deleted the emailed copies of those responses from our mailbox on 15 October 2026. Email copies of any later response stay in our mailbox until we delete them.

## Feedback survey in the dashboard (Tally)
After a few days of use, a Feedback button can appear on the dashboard. Pressing it only opens a small panel. **Nothing is sent to Tally until you press 👍 or 👎**, which opens the survey on Tally's website (`tally.so`) in a new tab. SpotBoard does not embed the survey in the dashboard.
- **What SpotBoard puts in the link:** the SpotBoard version, a rough install-age band (under 1 day, 1 to 6, 7 to 29, or 30 or more days) and your number of cards (shown as 10 when you have 10 or more). Nothing else: not the sites on your board, page addresses, card names, any ID of ours, or anything you captured. If you want to tell us about a site, you type it into the survey.
- **What happens when the page opens:** your browser contacts Tally, which receives the link (with those three details), your IP address and browser details, as for any web page. After that it is Tally's page and Tally's practices apply; see Tally's own privacy notice.
- **What we saw when we opened the surveys in their own browser tab (14 October 2026):** the page sent events to Tally's event service (api.tally.so) and contacted an error-monitoring service (Sentry; the connection appears to be Tally's own). In an earlier test with the same survey loaded inside a frame we saw these events were view and progress events (form viewed, page viewed, question viewed, drop-off) sent even though nothing was submitted, and that the form-viewed event carried the full link address. We saw no cookies, but in the tab the page stored two kinds of key in browser storage that look like identifiers (a respondent key and a per-form session key), and this still happened with the surveys' "save answers for later" setting switched off. We did not read the stored values and cannot see inside Tally, so treat this as what we observed, not a promise about what Tally does. Tally may be able to recognise the same browser if you open a survey again.
- **Browser storage and UK rules:** the ICO's published guidance says the UK rules on storing information on a device (PECR) cover browser local storage as well as cookies, and that an organisation running an online service is responsible for storage by third-party components it builds into that service. The guidance pages we read do not say what applies when someone is sent to another organisation's own website. SpotBoard's own pages store nothing from Tally and load nothing from Tally: the survey opens on Tally's own website in a new tab, so the keys described above are set by Tally's page, not by SpotBoard, and Tally's own notice applies to them. We have not taken legal advice on this.
- **What you type:** the positive survey asks two free-text questions and one multiple-choice question; the negative survey asks three free-text questions. They do not ask for your name. The last page of each asks for an **optional email address** if you are happy for us to follow up; if you give one, it is stored with your response and emailed to us with it. Please do not put other personal details in the text boxes. Answers you submit go to Tally and to us. Partial submissions are switched off on both surveys (checked 13 and 14 October 2026), so Tally should not keep answers you do not submit, though it may record that you viewed a question. The surveys' "save answers for later" setting, which would keep what you type in your own browser, is switched off (changed 14 October 2026).
- **Putting the prompt off:** pressing 👍 or 👎 opens the survey and hides the Feedback button for 45 days. That records only that you opened it on your device, not that you submitted.
- **Where and how long:** Tally says it stores form data in Europe. We keep responses until we delete them (automatic deletion is not switched on, checked 14 October 2026), and Tally emails us a copy of each submitted response. We do not know how long Tally keeps IP addresses, view and progress records or session identifiers, or how long the error-monitoring service keeps its record.
- **Older responses and records (important):** neither survey shows any submitted response, and Tally's trash holds none for them (checked 14 October 2026). Tally may also keep view records for them. From about 20 January to 17 February 2026, an earlier version of SpotBoard loaded this survey inside the dashboard and put eleven details in this survey's address: a random ID that stayed the same until you uninstalled, your browser language, exact card counts, the share of paused cards, average card age, exact install age, board-open and refresh counts for the previous 7 days, and the list of site hostnames on your board with counts. After about 17 February 2026 the browser blocked that frame, so nothing was sent from the dashboard after that date. Tally's view records for these surveys may still hold such addresses. On 14 October 2026 we removed those old fields from both surveys, so they now define only the three details above. We have not been able to inspect or remove them. Tally's dashboard shows us only totals (visits, submissions), not individual view records, and we found no way to delete view records, so we cannot inspect or remove them. We have never received a response to either feedback survey. [PUBLISH: re-check the submission counts on the day of publication.]

## Other things that touch your browsing
- **Google favicon service:** the hostname of each captured card, including when the popup shows that card. The popup does not ask Google's favicon service for the icon of the tab you are on: it shows that tab's own icon, loaded from the site itself or from servers the site uses for its images (or your browser's copy of it), and shows a small outlined circle when the site has no icon or its icon can't be loaded.
- **Sites you capture:** refreshing a card fetches the saved page using your browser's cookies for that site, as if you had visited it. Pictures and media in a saved card load from the original site's servers when the card is displayed.

## Permissions
- `storage`, `activeTab`, `scripting`: save your cards and capture the page you choose.
- `tabs`, `windows`: open a background tab or small window to refresh a card from its site, and bring the dashboard window to the front. When you open the SpotBoard popup it reads the address and icon of your active tab, to show that site's icon and to filter your cards. Chrome describes the `tabs` permission as "Read your browsing history"; that is Chrome's wording for the permission. SpotBoard does not keep a list of the sites you visit.
- `system.display`: check that the SpotBoard dashboard window is on a screen that is connected, and move it back onto the main screen if it is not.
- Access to all sites (`<all_urls>`): needed because you can capture any site.

## Why we process this data, and your rights
- **Why and legal basis (UK GDPR):** for analytics, the uninstall survey and the dashboard feedback survey, we rely on **legitimate interests**. Our interest is keeping SpotBoard working, which means finding sites and layouts that fail, and deciding what to build. We collect hostnames and usage counts for this, and not names or accounts (the only email address we receive is one you choose to type into a survey, and giving it is optional).
- **Your rights:** You can ask us for a copy of the data we hold about you, to correct it, to delete it, to restrict or object to its use, and to receive it. You can object by emailing spotboard@outlook.com. We cannot delete the view records Tally keeps for its surveys (see above); you can ask Tally directly. Because we hold no name or account to match events to, the practical way to stop analytics is to uninstall SpotBoard.
- **Complaints:** if you are in the UK, you can complain to the Information Commissioner's Office (ico.org.uk).
- **Transfers:** our BigQuery copy is in London. Google may process Google Analytics data in any country where it or its sub-processors operate, under its data processing terms (it states it takes part in the EU-US Data Privacy Framework and UK Extension). Tally is based in Belgium and says it stores form data in Europe. We have not confirmed where Tally processes its page's view events, or where the error-monitoring service its page contacts processes data (the address we saw suggests its US ingest region, so your IP address and browser details may be processed in the US). [PUBLISH: confirm the transfer position for that service before publishing.] We have not been able to confirm where Google processes favicon requests or Chrome Sync data.

## Your choices
- **Delete a card:** removes it from your device and from Chrome Sync.
- **Export your board:** open the ☰ menu in the dashboard and choose Export board.

## Using SpotBoard responsibly
You are responsible for having the right to capture the content you choose, for following the terms of the sites you capture from, and for how you use captured content. SpotBoard is for personal monitoring of public content you already visit, not for bulk crawling, bypassing paywalls or logins, or resale. We are not responsible for third-party site content.

## Changes to this policy
We will change the "Effective Date" above when this policy changes, and note major changes in the release notes: https://github.com/bondybondbond/spotboard/releases

## Contact
If you have questions about this privacy policy or SpotBoard's data practices, please contact:

**Email**: spotboard@outlook.com

**GitHub**: https://github.com/bondybondbond/spotboard
