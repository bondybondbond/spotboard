/// <reference types="chrome" />
import { useState, useEffect } from 'react';
import './App.css';

// A page where SpotBoard's content script can never run — capture is impossible here.
function isRestrictedUrl(url?: string): boolean {
  if (!url) return true;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  const restrictedSchemes = ['chrome:', 'chrome-extension:', 'about:', 'view-source:', 'devtools:', 'edge:'];
  if (restrictedSchemes.includes(parsed.protocol)) return true;
  if (parsed.hostname === 'chromewebstore.google.com') return true;
  if (parsed.hostname === 'chrome.google.com' && parsed.pathname.startsWith('/webstore')) return true;
  return false;
}

interface Component {
  id: string; // UUID for matching sync + local data
  name: string;
  url: string;
  customLabel?: string; // User's custom label (optional)
  favicon?: string; // Site favicon URL
  headingFingerprint?: string; // 🎯 FIX: Heading text for fallback selector detection
  selector?: string; // From local storage
  html_cache?: string; // From local storage
  last_refresh?: string; // From local storage
  excludedSelectors?: string[]; // 🎯 FIX: Add excluded element selectors
  positionBased?: boolean; // 🎯 Position-based capture (no heading verification)
}

function App() {
  const [components, setComponents] = useState<Component[]>([]);
  const [currentDomain, setCurrentDomain] = useState<string>('');
  // null = current tab URL not resolved yet — render only the brand until we know,
  // so a restricted page never flashes the action buttons before collapsing.
  const [restricted, setRestricted] = useState<boolean | null>(null);

  useEffect(() => {
    // Get current tab URL
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      setRestricted(isRestrictedUrl(tabs[0]?.url));
      if (tabs[0]?.url) {
        try {
          const url = new URL(tabs[0].url);
          setCurrentDomain(url.hostname);
        } catch (e) {
          console.error('Invalid URL:', e);
        }
      }
    });

    // Load components from hybrid storage (NEW per-component format)
    chrome.storage.sync.get(null, (syncResult) => {
      chrome.storage.local.get(['componentsData'], (localResult) => {
        const localData: Record<string, any> = localResult.componentsData || {};
        
        // Extract all comp-* keys from sync storage
        const metadata: any[] = [];
        Object.keys(syncResult).forEach(key => {
          if (key.startsWith('comp-')) {
            metadata.push(syncResult[key]);
          }
        });
        
        // Merge sync metadata with local data by ID
        const merged = metadata.map((meta: any) => ({
          ...meta,
          ...localData[meta.id] // Add html_cache, last_refresh if exists
        }));
        
        setComponents(merged);
      });
    });
  }, []);

  const handleToggleCapture = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;

    // Check if we're on a restricted page (chrome://, chrome-extension://, etc.)
    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
      alert('⚠️ Cannot capture content from Chrome internal pages. Please visit a website first.');
      return;
    }

    try {
      // Test if content script is already loaded by sending a ping
      await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
      
      // Content script exists, proceed with capture
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_CAPTURE' });
      window.close();
    } catch (error) {
      // Content script not loaded - inject it now
      console.log('📌 Content script not found, injecting...');
      
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['assets/content.js']
        });

        // Wait 100ms for content script to initialize
        await new Promise(resolve => setTimeout(resolve, 100));

        // Now send the toggle message
        chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_CAPTURE' });
        window.close();
      } catch (injectError) {
        console.error('❌ Failed to inject content script:', injectError);
        alert('⚠️ Could not activate capture mode. Please refresh the page and try again.');
      }
    }
  };

  const handleDelete = (component: Component) => {
    // Remove from both sync and local storage
    const updated = components.filter((c) => c.id !== component.id);
    setComponents(updated);
    
    // NEW: Remove per-component key from sync storage
    chrome.storage.sync.remove(`comp-${component.id}`, () => {
      if (chrome.runtime.lastError) {
        console.error('❌ Failed to delete from sync:', chrome.runtime.lastError);
      } else {
        console.log('✅ Deleted from sync:', component.id);
      }
    });
    
    // Update local storage (remove HTML data)
    chrome.storage.local.get(['componentsData'], (result) => {
      const localData: Record<string, any> = result.componentsData || {};
      delete localData[component.id];
      chrome.storage.local.set({ componentsData: localData });
    });
  };

  const handleOpenCanvas = () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL('dashboard.html'),
      active: true
    });
  };

  // Filter components to only show those from current domain
  const filteredComponents = components.filter((component) => {
    try {
      const componentUrl = new URL(component.url);
      return componentUrl.hostname === currentDomain;
    } catch (e) {
      return false;
    }
  });

  return (
    <div className="sb-popup">
      <div className="sb-brand">
        <img src="/logo.png" alt="SpotBoard logo" />
        <span>SpotBoard</span>
      </div>

      {restricted === null ? null : restricted ? (
        <div className="sb-blocked">
          <div className="sb-blocked-title">SpotBoard can't run on this page</div>
          <div className="sb-blocked-body">
            Open a regular website to save a spot or reach your board.
          </div>
        </div>
      ) : (
      <>
      {components.length === 0 ? (
        <div className="sb-steps">
          <div className="sb-steps-title">👋 Welcome to SpotBoard!</div>
          <div className="sb-steps-list">
            <div className="sb-step">
              <span className="sb-step-num">1</span>
              <span>Click the <strong>"Save a Spot"</strong> button below</span>
            </div>
            <div className="sb-step">
              <span className="sb-step-num">2</span>
              <span>Hover over any section on this page</span>
            </div>
            <div className="sb-step">
              <span className="sb-step-num">3</span>
              <span>Click to save it to your board</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="sb-hint">Click any website element to save it to your board.</div>
      )}

      <div className="sb-actions">
        <button className="sb-btn-primary" onClick={handleToggleCapture}>
          ✂️ Save a Spot
        </button>
        <button className="sb-btn-secondary" onClick={handleOpenCanvas}>
          <img src="/logo.png" alt="" />
          Open Board ↗
        </button>
      </div>

      {currentDomain && currentDomain.includes('.') && (
        <>
          <div className="sb-divider" />
          <div className="sb-filter">
            <img
              src={`https://www.google.com/s2/favicons?sz=64&domain=${currentDomain}`}
              alt="Website favicon"
            />
            <span>Showing spots from: {currentDomain}</span>
          </div>
        </>
      )}

      {filteredComponents.length > 0 && (
        <div className="sb-cards">
          {filteredComponents.map((component: Component, index) => (
            <div key={index} className="sb-card">
              <div className="sb-card-head">
                {component.favicon ? (
                  <img src={component.favicon} alt="" />
                ) : (
                  <img src={`https://www.google.com/s2/favicons?sz=64&domain=${currentDomain}`} alt="" />
                )}
                <h3 className="sb-card-title">{component.customLabel || component.name}</h3>
                <button className="sb-card-del" onClick={() => handleDelete(component)}>
                  Delete
                </button>
              </div>
              <small className="sb-card-url" title={component.url}>
                {component.url}
              </small>
            </div>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}

export default App;