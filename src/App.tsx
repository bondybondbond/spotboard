/// <reference types="chrome" />
import { useState, useEffect } from 'react';
import './App.css';

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

  useEffect(() => {
    // Get current tab URL
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
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
    <div style={{ padding: '10px', width: '340px', maxWidth: '100vw' }}>
      {/* First-time user tooltip */}
      {components.length === 0 && (
        <div style={{ 
          background: '#e3f2fd', 
          padding: '12px', 
          borderRadius: '6px', 
          marginBottom: '12px',
          fontSize: '13px',
          color: '#1565c0',
          border: '1px solid #90caf9'
        }}>
          <div style={{ marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>
            👋 Welcome to SpotBoard!
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{ 
                background: '#1565c0', 
                color: 'white', 
                borderRadius: '50%', 
                width: '18px', 
                height: '18px', 
                display: 'inline-flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: '600',
                flexShrink: 0
              }}>1</span>
              <span>Click <strong>"Save a Spot"</strong> button below</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{ 
                background: '#1565c0', 
                color: 'white', 
                borderRadius: '50%', 
                width: '18px', 
                height: '18px', 
                display: 'inline-flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: '600',
                flexShrink: 0
              }}>2</span>
              <span>Hover over any section on this page</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{ 
                background: '#1565c0', 
                color: 'white', 
                borderRadius: '50%', 
                width: '18px', 
                height: '18px', 
                display: 'inline-flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: '600',
                flexShrink: 0
              }}>3</span>
              <span>Click to save it to your board</span>
            </div>
          </div>
        </div>
      )}
      
      <button 
        onClick={handleToggleCapture} 
        style={{ 
          width: '100%', 
          marginBottom: '10px',
          padding: '14px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontWeight: '600',
          fontSize: '15px',
          cursor: 'pointer',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}
      >
        ✂️ Save a Spot
      </button>
      <button 
        onClick={handleOpenCanvas} 
        style={{ 
          width: '100%', 
          marginBottom: '10px', 
          padding: '10px',
          background: 'white',
          color: '#667eea',
          border: '2px solid #667eea',
          borderRadius: '6px',
          fontWeight: '500',
          fontSize: '13px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px'
        }}
      >
        <img src="/logo.png" alt="SpotBoard" style={{ width: '18px', height: '18px' }} />
        Open Board
      </button>
      {currentDomain && currentDomain.includes('.') && (
        <div style={{ fontSize: '12px', color: '#666', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <img 
            src={`https://www.google.com/s2/favicons?sz=64&domain=${currentDomain}`} 
            alt="" 
            style={{ width: '16px', height: '16px' }} 
          />
          <span>Showing spots from: {currentDomain}</span>
        </div>
      )}
      <div>
        {filteredComponents.map((component: Component, index) => (
          <div key={index} style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '10px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              {component.favicon && (
                <img 
                  src={component.favicon} 
                  alt="" 
                  style={{ width: '16px', height: '16px', flexShrink: 0 }} 
                />
              )}
              <h3 style={{ margin: 0, flex: 1 }}>{component.customLabel || component.name}</h3>
              <button onClick={() => handleDelete(component)} style={{ padding: '4px 8px', fontSize: '12px' }}>
                Delete
              </button>
            </div>
            <small 
              title={component.url}
              style={{ 
                display: 'block', 
                overflow: 'hidden', 
                textOverflow: 'ellipsis', 
                whiteSpace: 'nowrap',
                color: '#666'
              }}
            >
              {component.url}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;