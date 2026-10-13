---
title: Privacy Policy
permalink: /privacy/
---

# SpotBoard Privacy Policy

**Effective Date:** [PUBLISH: date]
**Applies to:** SpotBoard [PUBLISH: version] and later

## In short
- SpotBoard has no servers or accounts of its own. The content you capture is stored in your browser. Your card settings, including the full page address of each card, sync through your Google account using Chrome Sync.
- SpotBoard sends usage statistics to **Google Analytics 4 (GA4)**: no name, email or account, and no ID that stays the same. Events include the **hostnames** of sites you capture, refresh or visit from your board (for example `bbc.com`). Each event gets a fresh random ID that is not kept on your device, and there is no session ID or user ID. Google still sees each request's IP address in transit, and the list of hostnames from one refresh can look the same as the next, so we don't promise the data can never be linked.
- Analytics events are designed not to include page addresses beyond the hostname, page titles, card or board names, or captured content. Error reports carry only the kind of error, never its message (see below).
- **Analytics cannot currently be switched off inside SpotBoard**, and SpotBoard does not read a Do Not Track or Global Privacy Control signal. Uninstalling SpotBoard stops its analytics from then on.
- When you uninstall, Chrome opens an optional survey hosted by **Tally**. SpotBoard sends no data to it beyond the page request itself: the link carries no ID and no usage values. What you type and submit goes to Tally and to us.
- If you use the optional **feedback form inside the dashboard**, it is hosted by Tally and opens only after you press a thumbs button. Opening it sends Tally three details (SpotBoard version, a rough install-age band and your card count, up to 10), never the sites on your board. See "Feedback form in the dashboard" below.
- Showing a site's icon sends that site's **hostname to Google's favicon service**. This includes the site in your current tab each time you open the SpotBoard popup, even if you have not captured it.

## Who is responsible, and how to contact us
SpotBoard is operated under the name SpotBoard. Contact: spotboard@outlook.com

## Who receives what
| Service | What it receives | Linked to |
|---|---|---|
| **Google Analytics 4** | The analytics events described below, including hostnames | Nothing that persists: a fresh random ID per event |
| **Google favicon service** | A site hostname, plus your IP address as part of the web request | No SpotBoard ID is sent |
| **Google Chrome Sync** (your own Google account; run by Chrome, not SpotBoard) | Your card settings, including full page addresses | Your Google account |
| **Tally** (survey provider) | Uninstall survey: your answers, if you submit it. Dashboard feedback form: your answers, plus the three details described below, and your IP address and browser details when the form opens | The dashboard form's three details, never an ID |
| **Sentry** (Tally's error-monitoring provider, contacted by the Tally form itself) | Your IP address and browser details when the dashboard feedback form opens | Nothing from SpotBoard |

## What stays on your device
Captured HTML, refresh results, and the date you installed SpotBoard (used on your device for onboarding timing; most events send only a rough band, and a few onboarding events send the time since install, as described below). The dashboard also keeps the times you opened the board or clicked refresh, for up to 30 days, on your device only; they are not sent. Your exclusions are kept on the device and also sync (next section). Chrome limits how much SpotBoard can keep on a device, so very large boards can fill that space.

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
- **Events from older versions:** versions before [PUBLISH: version] sent two random IDs that stayed the same until you uninstalled, an exact install age and 7-day usage counts. Those events stay in both places until the limits above remove them. This version deletes the stored IDs and counters from your device when it updates.

## Uninstall survey (Tally)
When you uninstall SpotBoard, Chrome opens an optional survey hosted by Tally (`tally.so`). SpotBoard sets that address in advance and it is a plain link: **it carries no ID and no usage values**, so a response carries nothing that identifies your installation or ties it to analytics events. Your browser still contacts Tally when the page opens, as for any web page.
- **Not sent:** any ID, site names, page addresses, counts, anything you captured.
- **What we ask:** the survey does not ask for your name or email. It asks why you uninstalled and, if you say a site did not work or something broke, which sites had issues and what the problem was, and has an optional free-text box. What you type there is yours to choose; please do not put personal details in it.
- **Where and how long:** Tally says it stores form data in Europe. We keep responses until we delete them; automatic deletion is not switched on.
- **Older survey responses:** responses collected before [PUBLISH: date] included a random ID, usage counts and, in the oldest, a list of the site names on your board. We deleted those responses on 13 October 2026.

## Feedback form in the dashboard (Tally)
After a few days of use, a Feedback button can appear on the dashboard. Pressing it only opens a small panel. **Nothing is sent to Tally until you press 👍 or 👎**, which loads a Tally form inside the panel.
- **What SpotBoard puts in the form's address:** the SpotBoard version, a rough install-age band (0, 1, 7 or 30 days) and your number of cards (shown as 10 when you have 10 or more). That is all. It does not include the sites on your board, page addresses, card names, any ID or anything you captured. If you want to tell us about a site, you type it into the form.
- **What Tally sees when the form opens:** that address, plus your IP address and browser details, as for any web page. Tally also records that the form was viewed, including the form's address, even if you never submit. In our testing the form also contacted Tally's error-monitoring service (Sentry), which receives your IP address and browser details, and set no cookies. We cannot see inside Tally, so this is what we observed, not a promise about what Tally does.
- **What you type:** goes to Tally and to us if you submit. The forms do not ask for your name or email; please do not put personal details in the text boxes. [PUBLISH: check the partial-submission setting on both Tally forms; if it is on, add "Tally may keep what you typed in a form you start and leave."]
- **Where and how long:** Tally says it stores form data in Europe. We keep responses until we delete them; automatic deletion is not switched on.
- **Older responses:** responses to these forms collected before [PUBLISH: version] could include a list of the site names on your board and counts. [PUBLISH: owner to check the two forms' older responses and delete any that hold site lists or IDs, then state the date here.] Current builds could not load the form between 17 February 2026 and this version, so any such responses should date from before then. [PUBLISH: confirm against the responses actually found.]

## Other things that touch your browsing
- **Google favicon service:** the hostname of each card, and, when you open the popup, of the site in your active tab (except browser-internal pages).
- **Sites you capture:** refreshing a card fetches the saved page using your browser's cookies for that site, as if you had visited it. Pictures and media in a saved card load from the original site's servers when the card is displayed.

## Permissions
- `storage`, `activeTab`, `scripting`: save your cards and capture the page you choose.
- `tabs`, `windows`: open a background tab or small window to refresh a card from its site, and bring the dashboard window to the front. When you open the SpotBoard popup it reads the hostname of your active tab, to show that site's icon and to filter your cards. Chrome describes the `tabs` permission as "Read your browsing history"; that is Chrome's wording for the permission. SpotBoard does not keep a list of the sites you visit.
- `system.display`: check that the SpotBoard dashboard window is on a screen that is connected, and move it back onto the main screen if it is not.
- Access to all sites (`<all_urls>`): needed because you can capture any site.

## Why we process this data, and your rights
- **Why and legal basis (UK GDPR):** for analytics, the uninstall survey and the dashboard feedback form, we rely on **legitimate interests**. Our interest is keeping SpotBoard working, which means finding sites and layouts that fail, and deciding what to build. We collect hostnames and usage counts for this, and not names, emails or accounts.
- **Your rights:** You can ask us for a copy of the data we hold about you, to correct it, to delete it, to restrict or object to its use, and to receive it. You can object by emailing spotboard@outlook.com. Because we hold no name or account to match events to, the practical way to stop analytics is to uninstall SpotBoard.
- **Complaints:** if you are in the UK, you can complain to the Information Commissioner's Office (ico.org.uk).
- **Transfers:** our BigQuery copy is in London. Google may process Google Analytics data in any country where it or its sub-processors operate, under its data processing terms (it states it takes part in the EU-US Data Privacy Framework and UK Extension). Tally is based in Belgium and stores form data in the EU. The Sentry address the form contacts shows a US region; we have not confirmed where it processes data. We have not been able to confirm where Google processes favicon requests or Chrome Sync data.

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
