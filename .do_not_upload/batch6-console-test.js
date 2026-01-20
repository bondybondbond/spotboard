// ===== BATCH 6 CONSOLE TEST (No imports needed!) =====
// Just paste this into the dashboard console

async function testBatch6() {
  console.log('🧪 Testing Batch 6: Tally URLs + Field Mappings\n');
  
  // Call the globally available function
  const fields = await getAllHiddenFields();
  
  console.log('✅ All Hidden Fields:');
  console.table(fields);
  
  // Verify all 9 expected fields exist
  const expectedFields = [
    'extension_version',
    'total_cards',
    'active_cards',
    'paused_card_rate_%',
    'all_tracked_sites',
    'avg_card_age_days',
    'days_since_install',
    'board_opens_7days',
    'refresh_clicks_7days'
  ];
  
  console.log('\n📋 Field Checklist:');
  let allPresent = true;
  expectedFields.forEach(field => {
    const exists = fields.hasOwnProperty(field);
    const value = fields[field];
    console.log(`${exists ? '✅' : '❌'} ${field}: ${value}`);
    if (!exists) allPresent = false;
  });
  
  // Test paused_card_rate_% calculation
  console.log('\n🧮 Paused Card Rate Calculation:');
  const pausedCards = fields.total_cards - fields.active_cards;
  const expectedRate = fields.total_cards > 0 
    ? Math.round((pausedCards / fields.total_cards) * 100) 
    : 0;
  console.log(`Total Cards: ${fields.total_cards}`);
  console.log(`Active Cards: ${fields.active_cards}`);
  console.log(`Paused Cards: ${pausedCards}`);
  console.log(`Actual Rate: ${fields['paused_card_rate_%']}%`);
  console.log(`Expected Rate: ${expectedRate}%`);
  console.log(`Match: ${fields['paused_card_rate_%'] === expectedRate ? '✅' : '❌'}`);
  
  if (allPresent && fields['paused_card_rate_%'] === expectedRate) {
    console.log('\n🎉 Batch 6 Complete! All 9 fields working correctly.');
  } else {
    console.log('\n❌ Issues found - review above');
  }
}

// Run the test
testBatch6();
