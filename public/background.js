// SpotBoard Background Script
// Handles extension lifecycle events

// ===== INSTALL DATE TRACKING =====
// Service workers can't use localStorage - must use chrome.storage.local
// Also handles reload scenarios (not just fresh installs)

async function initializeInstallDate() {
  const { install_date } = await chrome.storage.local.get('install_date');
  
  if (!install_date) {
    const now = Date.now().toString();
    await chrome.storage.local.set({ install_date: now });
    console.log('✅ Install date initialized:', new Date(parseInt(now)).toISOString());
  } else {
    console.log('📅 Install date already exists:', new Date(parseInt(install_date)).toISOString());
  }
}

// Initialize on any startup (handles reload scenarios)
initializeInstallDate();

// Also handle fresh installs explicitly
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const now = Date.now().toString();
    await chrome.storage.local.set({ install_date: now });
    console.log('🎉 Fresh install detected at:', new Date(parseInt(now)).toISOString());
  }
});
