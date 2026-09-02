const assert = require('assert');
const http = require('http');

const SERVER_URL = 'http://127.0.0.1:3000';

function request(method, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SERVER_URL);
    const req = http.request(url, { method }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        let data = buffer.toString('utf-8');
        try { data = JSON.parse(data); } catch (e) {}
        resolve({ statusCode: res.statusCode, body: data });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function verifyPersistence() {
  console.log('====================================================');
  console.log(' TESTING RESTART DATA PERSISTENCE');
  console.log('====================================================');

  // Verify history retained
  const histRes = await request('GET', '/api/history');
  assert.strictEqual(histRes.statusCode, 200);
  const pl101 = histRes.body.history.find(h => h.picklistNo === 'PL101');
  assert(pl101 !== undefined, 'PL101 must exist in permanent history after server restart');
  console.log(' ✅ History record PL101 verified after restart.');

  // Verify live monitoring picklists retained
  const liveRes = await request('GET', '/api/picklists/live');
  assert.strictEqual(liveRes.statusCode, 200);
  const pl102 = liveRes.body.picklists.find(p => p.picklistNo === 'PL102');
  assert(pl102 !== undefined, 'PL102 must exist in active monitoring after server restart');
  assert.strictEqual(pl102.pickingStatus, 'Completed', 'PL102 status preserved across restart');
  console.log(' ✅ Active picklist PL102 state preserved across server restart.');

  console.log('\n====================================================');
  console.log(' RESTART PERSISTENCE VERIFICATION PASSED! 🎉');
  console.log('====================================================');
}

verifyPersistence().catch(err => {
  console.error('❌ PERSISTENCE FAILURE:', err);
  process.exit(1);
});
