// SpotBoard Background Script
// Handles extension lifecycle events

// ===== INSTALL DATE TRACKING =====
// Stores firstInstallDate for GA4 days_since_install metric

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Fresh install - store install date
    const installDate = new Date().toISOString();
    await chrome.storage.local.set({ firstInstallDate: installDate });
    console.log('🎉 Extension installed at:', installDate);
  } else if (details.reason === 'update') {
    // Update - preserve existing install date if it exists
    const { firstInstallDate } = await chrome.storage.local.get('firstInstallDate');
    if (!firstInstallDate) {
      // If somehow missing, use current date
      const installDate = new Date().toISOString();
      await chrome.storage.local.set({ firstInstallDate: installDate });
      console.log('⚠️ Install date was missing, set to:', installDate);
    } else {
      console.log('✅ Install date preserved:', firstInstallDate);
    }
  }
});