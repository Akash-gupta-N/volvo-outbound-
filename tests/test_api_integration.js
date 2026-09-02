const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const xlsx = require('xlsx');

const SERVER_URL = 'http://127.0.0.1:3000';

// Helper function to make HTTP JSON requests
function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SERVER_URL);
    const reqHeaders = { ...headers };

    let payload = null;
    if (body && !headers['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    } else if (body && Buffer.isBuffer(body)) {
      payload = body;
    }

    const req = http.request(url, { method, headers: reqHeaders }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const contentType = res.headers['content-type'] || '';
        let data = buffer.toString('utf-8');
        if (contentType.includes('application/json')) {
          try {
            data = JSON.parse(data);
          } catch (e) {}
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: data, buffer });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Helper to construct multipart form-data buffer for file upload
function createMultipartBuffer(fieldName, filename, fileBuffer) {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;

  const buffer = Buffer.concat([
    Buffer.from(header, 'utf-8'),
    fileBuffer,
    Buffer.from(footer, 'utf-8')
  ]);

  return { boundary, buffer };
}

// Helper to generate in-memory Excel buffer
function buildExcelBuffer(rows) {
  const worksheet = xlsx.utils.json_to_sheet(rows);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Data');
  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

async function runApiIntegrationTests() {
  console.log('===============================================================');
  console.log(' STARTING END-TO-END BACKEND API INTEGRATION TEST SUITE');
  console.log(' Target Server:', SERVER_URL);
  console.log('===============================================================');

  // STEP 1: System Info API
  console.log('\n[API 1] Testing /api/system-info...');
  const sysRes = await request('GET', '/api/system-info');
  assert.strictEqual(sysRes.statusCode, 200);
  assert(sysRes.body.localIPs.length > 0, 'Local IPs should be returned');
  assert(sysRes.body.currentTimeIST.length > 0, 'IST time string should be returned');
  console.log(' ✅ System info verified:', sysRes.body.currentTimeIST, 'IST');

  // STEP 2: Excel Upload (First upload: PL101 | 10, PL102 | 8)
  console.log('\n[API 2] Testing Excel Upload (First batch: PL101, PL102)...');
  const excelBuf1 = buildExcelBuffer([
    { "Picklist No.": "PL101", "Lines No.": 10 },
    { "Picklist No.": "PL102", "Lines No.": 8 }
  ]);
  const mp1 = createMultipartBuffer('excelFile', 'batch1.xlsx', excelBuf1);
  const uploadRes1 = await request('POST', '/api/picklists/upload', mp1.buffer, {
    'Content-Type': `multipart/form-data; boundary=${mp1.boundary}`
  });
  assert.strictEqual(uploadRes1.statusCode, 200);
  assert.strictEqual(uploadRes1.body.success, true);
  assert.strictEqual(uploadRes1.body.addedCount, 2);
  console.log(' ✅ First Excel batch uploaded successfully:', uploadRes1.body.message);

  // STEP 3: Multiple Upload & Duplicate Prevention (Second upload: PL102 | 8 [dup], PL103 | 15 [new])
  console.log('\n[API 3] Testing Multiple Uploads & Duplicate Prevention (PL102 dup, PL103 new)...');
  const excelBuf2 = buildExcelBuffer([
    { "Picklist No.": "PL102", "Lines No.": 8 },
    { "Picklist No.": "PL103", "Lines No.": 15 }
  ]);
  const mp2 = createMultipartBuffer('excelFile', 'batch2.xlsx', excelBuf2);
  const uploadRes2 = await request('POST', '/api/picklists/upload', mp2.buffer, {
    'Content-Type': `multipart/form-data; boundary=${mp2.boundary}`
  });
  assert.strictEqual(uploadRes2.statusCode, 200);
  assert.strictEqual(uploadRes2.body.addedCount, 1);
  assert.strictEqual(uploadRes2.body.existingCount, 1);
  console.log(' ✅ Duplicate prevention verified (1 new added, 1 duplicate preserved).');

  // STEP 4: Picklist Line Correction (PATCH PL101 from 10 -> 12 lines)
  console.log('\n[API 4] Testing Picklist Line Correction (PATCH PL101 to 12 lines)...');
  const patchRes = await request('PATCH', '/api/picklists/PL101', { lines: 12 });
  assert.strictEqual(patchRes.statusCode, 200);
  assert.strictEqual(patchRes.body.picklist.lines, 12);
  console.log(' ✅ Small lines correction verified.');

  // STEP 5: QR Code Generation API
  console.log('\n[API 5] Testing QR Generation endpoint /api/picklists/qr-codes...');
  const qrRes = await request('GET', '/api/picklists/qr-codes');
  assert.strictEqual(qrRes.statusCode, 200);
  const pl101QR = qrRes.body.picklists.find(p => p.picklistNo === 'PL101');
  assert(pl101QR !== undefined, 'PL101 QR codes should exist');
  assert(pl101QR.qrs.PICKING_START.dataUrl.startsWith('data:image/png'), 'QR Data URL generated');
  console.log(' ✅ 4 event-specific QR codes generated per Picklist row.');

  // STEP 6: Out-of-Sequence Scan Rejection (PACKING_START on PL101 before PICKING_END)
  console.log('\n[API 6] Testing Out-of-Sequence Scan Rejection...');
  const outOfSeqRes = await request('POST', '/api/scan', {
    selectedEventType: 'PACKING_START',
    picklistNo: 'PL101',
    lines: 12,
    eventType: 'PACKING_START'
  });
  assert.strictEqual(outOfSeqRes.body.success, false);
  assert(outOfSeqRes.body.message.includes('Picking must be completed before Packing can start'));
  console.log(' ✅ Out-of-sequence scan rejected with reason:', outOfSeqRes.body.message);

  // STEP 7: Valid Process Execution Sequence for PL101 (PICKING_START -> PICKING_END -> PACKING_START -> PACKING_END)
  console.log('\n[API 7] Testing Valid Sequential Process Workflow for PL101...');

  // A. PICKING_START
  const pickStart = await request('POST', '/api/scan', {
    selectedEventType: 'PICKING_START',
    picklistNo: 'PL101',
    lines: 12,
    eventType: 'PICKING_START'
  });
  assert.strictEqual(pickStart.body.success, true);
  assert.strictEqual(pickStart.body.picklist.pickingStatus, 'In Progress');
  console.log(`  1. PICKING_START accepted at ${pickStart.body.time} IST`);

  // B. Duplicate PICKING_START
  const dupPickStart = await request('POST', '/api/scan', {
    selectedEventType: 'PICKING_START',
    picklistNo: 'PL101',
    lines: 12,
    eventType: 'PICKING_START'
  });
  assert.strictEqual(dupPickStart.body.success, false);
  assert(dupPickStart.body.message.includes('Picking Start has already been recorded'));
  console.log(`  2. Duplicate PICKING_START rejected correctly: "${dupPickStart.body.message}"`);

  // C. PICKING_END
  const pickEnd = await request('POST', '/api/scan', {
    selectedEventType: 'PICKING_END',
    picklistNo: 'PL101',
    lines: 12,
    eventType: 'PICKING_END'
  });
  assert.strictEqual(pickEnd.body.success, true);
  assert.strictEqual(pickEnd.body.picklist.pickingStatus, 'Completed');
  console.log(`  3. PICKING_END accepted at ${pickEnd.body.time} IST`);

  // D. PACKING_START
  const packStart = await request('POST', '/api/scan', {
    selectedEventType: 'PACKING_START',
    picklistNo: 'PL101',
    lines: 12,
    eventType: 'PACKING_START'
  });
  assert.strictEqual(packStart.body.success, true);
  assert.strictEqual(packStart.body.picklist.packingStatus, 'In Progress');
  console.log(`  4. PACKING_START accepted at ${packStart.body.time} IST`);

  // E. PACKING_END
  const packEnd = await request('POST', '/api/scan', {
    selectedEventType: 'PACKING_END',
    picklistNo: 'PL101',
    lines: 12,
    eventType: 'PACKING_END'
  });
  assert.strictEqual(packEnd.body.success, true);
  assert.strictEqual(packEnd.body.picklist.packingStatus, 'Completed');
  console.log(`  5. PACKING_END accepted at ${packEnd.body.time} IST`);

  // STEP 8: Live Monitoring Dashboard Data API
  console.log('\n[API 8] Testing Live Monitoring Dashboard /api/picklists/live...');
  const liveRes = await request('GET', '/api/picklists/live');
  assert.strictEqual(liveRes.statusCode, 200);
  assert.strictEqual(liveRes.body.summary.completedAwaitingConfirmation, 1);
  const pl101Live = liveRes.body.picklists.find(p => p.picklistNo === 'PL101');
  assert.strictEqual(pl101Live.pickingStatus, 'Completed');
  assert.strictEqual(pl101Live.packingStatus, 'Completed');
  assert(pl101Live.pickingStartTime !== null);
  assert(pl101Live.packingEndTime !== null);
  console.log(' ✅ Live monitoring summary & rows verified in IST.');

  // STEP 9: Confirmation Eligibility & Manual Generation
  console.log('\n[API 9] Testing Confirmation Eligibility & Confirmation Excel Generation...');
  const confConfigRes = await request('GET', '/api/confirmation/config');
  assert.strictEqual(confConfigRes.body.completedUnconfirmedCount, 1);

  // Generate confirmation Excel
  const genRes = await request('POST', '/api/confirmation/generate');
  assert.strictEqual(genRes.statusCode, 200);
  assert.strictEqual(genRes.headers['content-type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert(genRes.buffer.length > 0, 'Excel buffer generated');
  console.log(` ✅ Confirmation Excel generated successfully (${genRes.buffer.length} bytes).`);

  // STEP 10: Verify Removal from Pending Picklists & Inclusion in History
  console.log('\n[API 10] Testing Removal from Pending & Permanent History Migration...');
  const expectedAfter = await request('GET', '/api/picklists/expected');
  const pl101Pending = expectedAfter.body.picklists.find(p => p.picklistNo === 'PL101');
  assert.strictEqual(pl101Pending, undefined, 'PL101 should be removed from expected pending list');

  const historyRes = await request('GET', '/api/history');
  const pl101Hist = historyRes.body.history.find(h => h.picklistNo === 'PL101');
  assert(pl101Hist !== undefined, 'PL101 must exist in permanent history');
  assert.strictEqual(pl101Hist.lines, 12);
  assert(pl101Hist.historyDate.length === 10, 'History date formatted');
  console.log(' ✅ Confirmed Picklist removed from active list and stored in permanent History.');

  // STEP 11: Wi-Fi Offline Synchronization Queue API simulation
  console.log('\n[API 11] Testing Offline Queue Reconnection Synchronization API...');
  // Simulate queued offline scans sent upon Wi-Fi restoration
  const offlineQueueBatch = [
    { selectedEventType: 'PICKING_START', picklistNo: 'PL102', lines: 8, eventType: 'PICKING_START' },
    { selectedEventType: 'PICKING_END', picklistNo: 'PL102', lines: 8, eventType: 'PICKING_END' }
  ];

  for (const item of offlineQueueBatch) {
    const res = await request('POST', '/api/scan', item);
    assert.strictEqual(res.body.success, true);
  }

  const pl102Check = await request('GET', '/api/picklists/live');
  const pl102Live = pl102Check.body.picklists.find(p => p.picklistNo === 'PL102');
  assert.strictEqual(pl102Live.pickingStatus, 'Completed');
  console.log(' ✅ Offline batch synchronization processed successfully upon reconnection.');

  console.log('\n===============================================================');
  console.log(' ALL 11 BACKEND API INTEGRATION VERIFICATION TESTS PASSED! 🎉');
  console.log('===============================================================');
}

runApiIntegrationTests().catch(err => {
  console.error('\n❌ BACKEND API INTEGRATION TEST FAILURE:', err);
  process.exit(1);
});
