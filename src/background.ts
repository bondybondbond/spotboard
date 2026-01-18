// Background service worker for SpotBoard
// Handles first-time install and opens welcome page

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // First-time install - open dashboard with tutorial modal
    chrome.tabs.create({
      url: chrome.runtime.getURL('dashboard.html')
    });
  }
  
  // Note: We could also handle 'update' reason here in future
  // if (details.reason === 'update') { ... }
});

// Export empty object to satisfy TypeScript module requirements
export {};
