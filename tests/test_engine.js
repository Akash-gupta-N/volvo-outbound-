const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const { initDatabase } = require('../src/db/database');
const SqliteRepository = require('../src/db/sqliteRepository');
const OutboundEngine = require('../src/services/outboundEngine');
const { parseUploadedExcel, generateConfirmationExcel } = require('../src/services/excelService');
const { encodeQRPayload, parseQRContent } = require('../src/services/qrService');
const { formatISTDate, getISTISOString } = require('../src/config/timezone');

async function runTests() {
  console.log('====================================================');
  console.log(' RUNNING OUTBOUND WORKFLOW APPLICATION TEST SUITE');
  console.log('====================================================');

  initDatabase();
  const repo = new SqliteRepository();
  const engine = new OutboundEngine(repo);

  // 1. Setup initial picklist data
  console.log('\n[Test 1] Saving expected picklists...');
  await repo.saveOrUpdatePicklist({ picklistNo: 'PL001', lines: 10 });
  await repo.saveOrUpdatePicklist({ picklistNo: 'PL002', lines: 8 });

  const expectedList = await repo.getExpectedPicklists();
  assert(expectedList.length >= 2, 'Expected at least 2 picklists in DB');
  console.log('✅ Picklist ingestion verified.');

  // 2. Small Correction Test
  console.log('\n[Test 2] Testing small lines correction...');
  await repo.updatePicklistLines('PL001', 12);
  const updatedPL001 = await repo.getPicklistByNo('PL001');
  assert.strictEqual(updatedPL001.lines, 12, 'PL001 lines should be updated to 12');
  console.log('✅ Small lines correction verified.');

  // 3. QR Parser Test
  console.log('\n[Test 3] Testing QR Encoder and Parser...');
  const encodedPayload = encodeQRPayload('PL001', 12, 'PICKING_START');
  const parsedQR = parseQRContent(encodedPayload);
  assert.strictEqual(parsedQR.picklistNo, 'PL001');
  assert.strictEqual(parsedQR.lines, 12);
  assert.strictEqual(parsedQR.eventType, 'PICKING_START');
  console.log('✅ QR Encoder & Parser verified.');

  // 4. Sequential Validation Tests
  console.log('\n[Test 4] Testing Outbound Process Sequential Validation...');
  
  // A. Invalid: PACKING_START before PICKING_END
  console.log(' Testing invalid scan: PACKING_START before Picking complete...');
  const invalidResult1 = await engine.processScan({
    qrPayload: { picklistNo: 'PL001', lines: 12, eventType: 'PACKING_START' }
  });
  assert.strictEqual(invalidResult1.success, false);
  assert(invalidResult1.message.includes('Picking must be completed before Packing can start'), 'Correct rejection reason');
  console.log(` ✅ Correctly rejected: "${invalidResult1.message}"`);

  // B. Valid: PICKING_START
  console.log(' Testing valid scan: PICKING_START...');
  const validResult1 = await engine.processScan({
    qrPayload: { picklistNo: 'PL001', lines: 12, eventType: 'PICKING_START' }
  });
  assert.strictEqual(validResult1.success, true);
  assert.strictEqual(validResult1.picklist.pickingStatus, 'In Progress');
  console.log(` ✅ Accepted: PICKING_START at ${validResult1.time} IST`);

  // C. Duplicate: PICKING_START scan again
  console.log(' Testing duplicate scan: PICKING_START again...');
  const duplicateResult = await engine.processScan({
    qrPayload: { picklistNo: 'PL001', lines: 12, eventType: 'PICKING_START' }
  });
  assert.strictEqual(duplicateResult.success, false);
  assert(duplicateResult.message.includes('Picking Start has already been recorded'), 'Correct duplicate rejection message');
  console.log(` ✅ Correctly rejected duplicate: "${duplicateResult.message}"`);

  // D. Valid: PICKING_END
  console.log(' Testing valid scan: PICKING_END...');
  const validResult2 = await engine.processScan({
    qrPayload: { picklistNo: 'PL001', lines: 12, eventType: 'PICKING_END' }
  });
  assert.strictEqual(validResult2.success, true);
  assert.strictEqual(validResult2.picklist.pickingStatus, 'Completed');
  console.log(` ✅ Accepted: PICKING_END at ${validResult2.time} IST`);

  // E. Valid: PACKING_START
  console.log(' Testing valid scan: PACKING_START...');
  const validResult3 = await engine.processScan({
    qrPayload: { picklistNo: 'PL001', lines: 12, eventType: 'PACKING_START' }
  });
  assert.strictEqual(validResult3.success, true);
  assert.strictEqual(validResult3.picklist.packingStatus, 'In Progress');
  console.log(` ✅ Accepted: PACKING_START at ${validResult3.time} IST`);

  // F. Valid: PACKING_END
  console.log(' Testing valid scan: PACKING_END...');
  const validResult4 = await engine.processScan({
    qrPayload: { picklistNo: 'PL001', lines: 12, eventType: 'PACKING_END' }
  });
  assert.strictEqual(validResult4.success, true);
  assert.strictEqual(validResult4.picklist.packingStatus, 'Completed');
  console.log(` ✅ Accepted: PACKING_END at ${validResult4.time} IST`);

  // 5. Confirmation Eligibility & Excel Generation
  console.log('\n[Test 5] Testing Confirmation Eligibility & Excel Generation...');
  const completedList = await repo.getCompletedUnconfirmedPicklists();
  assert.strictEqual(completedList.length, 1, 'Only PL001 should be completed');
  assert.strictEqual(completedList[0].picklistNo, 'PL001');

  const excelBuffer = await generateConfirmationExcel(completedList);
  assert(excelBuffer.length > 0, 'Generated Excel buffer should not be empty');
  console.log(` ✅ Generated Confirmation Excel buffer (${excelBuffer.length} bytes).`);

  // Confirm picklists
  const timestamp = getISTISOString();
  const histDate = formatISTDate(timestamp);
  await repo.confirmPicklists(['PL001'], timestamp, histDate);

  // Check pending picklists
  const pendingAfter = await repo.getExpectedPicklists();
  assert(pendingAfter.find(p => p.picklistNo === 'PL001') === undefined, 'PL001 should be removed from expected list');

  // Check history
  const history = await repo.getHistoryRecords();
  assert(history.find(h => h.picklistNo === 'PL001') !== undefined, 'PL001 should be in permanent history');
  console.log(' ✅ Confirmed Picklists moved to permanent history.');

  console.log('\n====================================================');
  console.log(' ALL SUITE TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILURE:', err);
  process.exit(1);
});
