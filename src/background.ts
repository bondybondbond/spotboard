// Background service worker for SpotBoard
// Handles first-time install and opens welcome page

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Generate anonymous user ID for feedback tracking (privacy-safe UUID)
    const userId = crypto.randomUUID(); // Built-in Web Crypto API
    
    // Track install date for feedback system (use chrome.storage in service worker)
    const installDate = Date.now().toString();
    chrome.storage.local.set({ 
      'install_date': installDate,
      'user_id': userId  // Anonymous installation identifier
    });
    console.log('SpotBoard installed at:', new Date(parseInt(installDate)).toISOString());
    console.log('Anonymous user ID:', userId);
    
    // First-time install - open dashboard with tutorial modal
    chrome.tabs.create({
      url: chrome.runtime.getURL('dashboard.html')
    });
  }
  
  // Note: We could also handle 'update' reason here in future
  // if (details.reason === 'update') { ... }
});

// 🎯 BATCH 1.5: Message handlers for "View on SpotBoard" button
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'focusDashboard') {
    const dashboardUrl = chrome.runtime.getURL('dashboard.html');
    
    // Search for existing dashboard tab
    chrome.tabs.query({}, (tabs) => {
      const dashboardTab = tabs.find(tab => tab.url === dashboardUrl);
      
      if (dashboardTab && dashboardTab.id) {
        // Dashboard exists, focus it
        chrome.tabs.update(dashboardTab.id, { active: true });
        chrome.windows.update(dashboardTab.windowId!, { focused: true });
        sendResponse({ found: true });
      } else {
        // Dashboard not found
        sendResponse({ found: false });
      }
    });
    
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'openDashboard') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('dashboard.html')
    });
    sendResponse({ opened: true });
    return true;
  }
});

// Export empty object to satisfy TypeScript module requirements
export {};
