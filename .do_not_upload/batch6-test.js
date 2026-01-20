// ===== BATCH 6 TEST SCRIPT =====
// Copy-paste this into dashboard console to verify all 9 fields

import { getAllHiddenFields } from '../src/feedback-data.js';

async function testBatch6() {
  console.log('🧪 Testing Batch 6: Tally URLs + Field Mappings\n');
  
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
  expectedFields.forEach(field => {
    const exists = fields.hasOwnProperty(field);
    const value = fields[field];
    console.log(`${exists ? '✅' : '❌'} ${field}: ${value}`);
  });
  
  // Test paused_card_rate_% calculation
  console.log('\n🧮 Paused Card Rate Calculation:');
  console.log(`Total Cards: ${fields.total_cards}`);
  console.log(`Active Cards: ${fields.active_cards}`);
  console.log(`Paused Rate: ${fields['paused_card_rate_%']}%`);
  console.log(`Expected: ${Math.round(((fields.total_cards - fields.active_cards) / fields.total_cards) * 100)}%`);
  
  console.log('\n✅ Batch 6 Complete!');
}

testBatch6();
