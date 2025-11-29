/**
 * Analyze Yahoo Hockey page structure to find stable selectors
 */

import { test } from '@playwright/test';

test('Find stable selector for Yahoo Hockey transactions', async ({ page }) => {
  console.log('\n=== YAHOO SELECTOR ANALYSIS ===\n');
  
  const url = 'https://hockey.fantasysports.yahoo.com/hockey/10024/transactions';
  
  // Load page
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000); // Let JS load
  
  // Check for consent and handle it
  const consent = await page.locator('#consent-page').count();
  if (consent > 0) {
    console.log('Handling consent...');
    await page.getByRole('button').first().click();
    await page.waitForTimeout(3000);
  }
  
  // Now analyze the transactions structure
  const analysis = await page.evaluate(() => {
    // Look for the transactions container
    const possibleContainers = [
      { name: 'Table with transactions class', selector: 'table[class*="transaction"]' },
      { name: 'Table with id containing transaction', selector: 'table[id*="transaction"]' },
      { name: 'Div with transactions class', selector: 'div[class*="transaction"]' },
      { name: 'Section with transactions', selector: 'section[class*="transaction"]' },
      { name: 'Any element with data-test transactions', selector: '[data-test*="transaction"]' },
      { name: 'Main content area', selector: 'main' },
      { name: 'YUI container', selector: '[id^="yui"]' },
      { name: 'Table.table (generic)', selector: 'table.table' }
    ];
    
    const results = [];
    
    for (const { name, selector } of possibleContainers) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        // Get details about first match
        const el = elements[0];
        const rect = el.getBoundingClientRect();
        
        results.push({
          name,
          selector,
          count: elements.length,
          tagName: el.tagName,
          id: el.id || 'none',
          classes: el.className || 'none',
          hasDataAttrs: Array.from(el.attributes)
            .filter(a => a.name.startsWith('data-'))
            .map(a => `${a.name}="${a.value}"`),
          parentTag: el.parentElement?.tagName,
          parentClass: el.parentElement?.className || 'none',
          htmlPreview: el.outerHTML.substring(0, 300),
          size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
          visible: rect.width > 0 && rect.height > 0
        });
      }
    }
    
    // Also analyze the body structure
    const bodyInfo = {
      title: document.title,
      hasMain: !!document.querySelector('main'),
      mainClasses: document.querySelector('main')?.className,
      contentDivs: document.querySelectorAll('div[id*="content"]').length,
      yuiElements: document.querySelectorAll('[id^="yui"]').length,
      firstYuiId: document.querySelector('[id^="yui"]')?.id
    };
    
    return { results, bodyInfo };
  });
  
  console.log('=== BODY STRUCTURE ===');
  console.log(JSON.stringify(analysis.bodyInfo, null, 2));
  
  console.log('\n=== POTENTIAL SELECTORS ===');
  for (const result of analysis.results) {
    console.log(`\n${result.name}:`);
    console.log(`  Selector: ${result.selector}`);
    console.log(`  Count: ${result.count}`);
    console.log(`  Element: <${result.tagName}> id="${result.id}"`);
    console.log(`  Classes: ${result.classes.substring(0, 100)}`);
    console.log(`  Data attrs: ${result.hasDataAttrs.join(', ') || 'none'}`);
    console.log(`  Parent: <${result.parentTag}> class="${result.parentClass.substring(0, 50)}"`);
    console.log(`  Size: ${result.size}, Visible: ${result.visible}`);
    console.log(`  HTML: ${result.htmlPreview}`);
  }
  
  // Test selector stability - reload page and check if selectors still work
  console.log('\n=== TESTING SELECTOR STABILITY ===');
  console.log('Reloading page...');
  
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  
  const stabilityCheck = await page.evaluate((previousResults) => {
    return previousResults.map(prev => {
      const elements = document.querySelectorAll(prev.selector);
      const firstEl = elements[0];
      const newId = firstEl?.id || 'none';
      
      return {
        selector: prev.selector,
        previousId: prev.id,
        newId: newId,
        stable: prev.id === 'none' || prev.id === newId,
        stillFound: elements.length > 0
      };
    });
  }, analysis.results);
  
  console.log('\nStability check after reload:');
  for (const check of stabilityCheck) {
    const emoji = check.stable && check.stillFound ? '✅' : '❌';
    console.log(`${emoji} ${check.selector}`);
    if (!check.stable) {
      console.log(`   ID changed: "${check.previousId}" → "${check.newId}"`);
    }
    if (!check.stillFound) {
      console.log(`   Element no longer found!`);
    }
  }
  
  console.log('\n=== RECOMMENDATION ===');
  const stableSelectors = stabilityCheck.filter(c => c.stable && c.stillFound);
  if (stableSelectors.length > 0) {
    console.log('Use one of these stable selectors:');
    stableSelectors.forEach(s => console.log(`  - ${s.selector}`));
  } else {
    console.log('⚠️  No stable selectors found - need to use content-based matching');
  }
  
  console.log('\n=== ANALYSIS COMPLETE ===\n');
});
