/// <reference types="chrome" />
import { useState, useEffect } from 'react';
import './App.css';

interface Component {
  name: string;
  url: string;
  customLabel?: string; // User's custom label (optional)
  favicon?: string; // Site favicon URL
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

    // Load components
    chrome.storage.sync.get(['components'], (result) => {
      if (result.components) {
        setComponents(result.components as Component[]);
      }
    });
  }, []);

  const handleToggleCapture = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_CAPTURE' });
        window.close();
      }
    });
  };

  const handleDelete = (component: Component) => {
    // Find and remove the specific component from the full list
    const updated = components.filter((c) => !(c.url === component.url && c.name === component.name));
    setComponents(updated);
    chrome.storage.sync.set({ components: updated });
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
    <div style={{ padding: '10px', minWidth: '300px' }}>
      <button 
        onClick={handleOpenCanvas} 
        style={{ 
          width: '100%', 
          marginBottom: '10px', 
          padding: '12px',
          background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontWeight: '600',
          fontSize: '14px',
          cursor: 'pointer'
        }}
      >
        🖼️ Open Canvas
      </button>
      <button 
        onClick={handleToggleCapture} 
        style={{ 
          width: '100%', 
          marginBottom: '10px',
          padding: '12px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontWeight: '600',
          fontSize: '14px',
          cursor: 'pointer'
        }}
      >
        ✂️ Start Capture
      </button>
      {currentDomain && (
        <div style={{ fontSize: '12px', color: '#666', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <img 
            src={`https://www.google.com/s2/favicons?sz=64&domain=${currentDomain}`} 
            alt="" 
            style={{ width: '16px', height: '16px' }} 
          />
          <span>Showing components from: {currentDomain}</span>
        </div>
      )}
      <div>
        {filteredComponents.map((component: Component, index) => (
          <div key={index} style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '10px' }}>
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
            <small>URL: {component.url}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;