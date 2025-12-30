/**
 * Fingerprint Utilities for SpotBoard
 * Extracts identifying text from HTML for self-healing refresh
 */

/**
 * Extract a "fingerprint" from HTML to verify we're refreshing the correct element
 * Looks for headings or strong text that identifies the component
 * 
 * Used for self-healing: When CSS selector fails, find element by fingerprint text
 * 
 * @param {string} html - The HTML content to extract fingerprint from
 * @returns {string|null} - The fingerprint text (max 50 chars) or null if not found
 */
function extractFingerprint(html) {
  if (!html) return null;
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // Look for headings first (h1-h6)
  const heading = doc.querySelector('h1, h2, h3, h4, h5, h6, caption');
  if (heading && heading.textContent.trim()) {
    return heading.textContent.trim().substring(0, 50);
  }
  
  // Fall back to first strong/bold text
  const strong = doc.querySelector('strong, b');
  if (strong && strong.textContent.trim()) {
    return strong.textContent.trim().substring(0, 50);
  }
  
  // Last resort: first text content over 10 chars
  const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent.trim();
    if (text.length > 10) {
      return text.substring(0, 50);
    }
  }
  
  return null;
}
