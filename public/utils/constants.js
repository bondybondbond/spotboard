/**
 * Shared Constants for SpotBoard
 * Single source of truth for configuration values used across dashboard scripts.
 * 
 * NOTE: background.ts (service worker) cannot load this file via <script> tag.
 * Its copy of these constants must be updated manually if values change here.
 * Search for "GA4 CONFIGURATION" in src/background.ts.
 * 
 * Loaded by: dashboard.html (first script, before ga4.js and all others)
 */

// GA4 Analytics - SpotBoard Dashboard Stream
const GA4_MEASUREMENT_ID = 'G-JLJS09NDZ6';
const GA4_API_SECRET = 'vrH5dBRiSf6xAuVrJpzKlw';
const GA4_ENDPOINT = `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`;

// Session timeout in milliseconds (30 minutes)
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

// Debug flag - set to true during development to enable verbose logging
// Used by: dom-cleanup.js, refresh-engine.js, dashboard.js (engagement tracking)
const DEBUG = false;
