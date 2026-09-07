/* theme-init.js — issue #22 dark mode.
   Runs BEFORE <body> parses (parser-blocking, first element in <head>) so the
   correct theme is on <html> before first paint — no flash for users who've
   toggled. Users who have NOT toggled get their theme from the CSS
   @media (prefers-color-scheme) block, also flash-free.

   MV3 CSP (script-src 'self') forbids an inline <script>, so this must be an
   external same-origin file. chrome.storage is async → cannot be read here
   without a flash; localStorage is synchronous and is the store (see
   STUDY-darkmode.md §2.8). Keep this tiny and dependency-free. */
(function () {
  try {
    var t = localStorage.getItem('sb-theme');
    if (t === 'dark' || t === 'light') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {
    /* private mode / storage disabled — fall through to prefers-color-scheme */
  }
})();
