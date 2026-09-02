const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const os = require('os');
const fs = require('fs');
const selfsigned = require('selfsigned');
const localtunnel = require('localtunnel');

const { initDatabase } = require('./src/db/database');
const SqliteRepository = require('./src/db/sqliteRepository');
const OutboundEngine = require('./src/services/outboundEngine');
const { parseUploadedExcel, generateConfirmationExcel } = require('./src/services/excelService');
const { generateAllQRCodesForPicklist } = require('./src/services/qrService');
const SchedulerService = require('./src/services/schedulerService');
const { getISTNow, formatISTFull } = require('./src/config/timezone');

// Initialize database schema
initDatabase();

const repository = new SqliteRepository();
const engine = new OutboundEngine(repository);

const app = express();

function getLocalIPAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

const localIPs = getLocalIPAddresses();
const primaryIP = localIPs[0] || '127.0.0.1';

const httpServer = http.createServer(app);

const io = new Server();
io.attach(httpServer);

const scheduler = new SchedulerService(repository, io);
scheduler.start();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage() });

// REST API ROUTES

app.get('/api/system-info', async (req, res) => {
  res.json({
    localIPs,
    primaryIP,
    httpPort: 3000,
    httpsPort: 3001,
    currentTimeIST: formatISTFull(getISTNow())
  });
});

app.get('/api/picklists/expected', async (req, res) => {
  try {
    const picklists = await repository.getExpectedPicklists();
    res.json({ success: true, picklists });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/picklists/upload', upload.single('excelFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const items = parseUploadedExcel(req.file.buffer);
    if (items.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid Picklist No. and Lines No. rows found in Excel.' });
    }

    let addedCount = 0;
    let activeCount = 0;
    const confirmedNos = [];

    for (const item of items) {
      const existing = await repository.getPicklistByNo(item.picklistNo);

      if (!existing) {
        await repository.saveOrUpdatePicklist(item);
        addedCount++;
      } else if (existing.confirmationStatus === 'CONFIRMED') {
        // picklist_no is the primary key, so a number that has been confirmed
        // and moved into history cannot be re-used for a new run. Reporting
        // that separately matters: these rows were previously counted as
        // "existing preserved", which read as success, and then every scan
        // against them was rejected for having timestamps already recorded.
        confirmedNos.push(item.picklistNo);
      } else {
        activeCount++;
      }
    }

    io.emit('liveUpdate');

    const parts = [`${addedCount} new picklists added`];
    if (activeCount > 0) {
      parts.push(`${activeCount} already active and left untouched`);
    }
    if (confirmedNos.length > 0) {
      parts.push(`${confirmedNos.length} skipped as already confirmed (${confirmedNos.join(', ')})`);
    }

    res.json({
      success: true,
      message: `Processed ${items.length} rows: ${parts.join(', ')}.`,
      addedCount,
      activeCount,
      confirmedSkipped: confirmedNos,
      // Retained so existing callers keep working.
      existingCount: activeCount + confirmedNos.length
    });
  } catch (err) {
    console.error('Error handling Excel upload:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/picklists/:picklistNo', async (req, res) => {
  try {
    const { picklistNo } = req.params;
    const { lines } = req.body;
    const linesNum = parseInt(lines, 10);

    if (isNaN(linesNum) || linesNum <= 0) {
      return res.status(400).json({ success: false, message: 'Lines must be a positive integer.' });
    }

    const updated = await repository.updatePicklistLines(picklistNo, linesNum);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Picklist not found or already confirmed.' });
    }

    io.emit('liveUpdate');

    res.json({ success: true, message: `Updated lines for ${picklistNo} to ${linesNum}.`, picklist: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/picklists/live', async (req, res) => {
  try {
    const data = await repository.getLiveMonitoringData();
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/picklists/qr-codes', async (req, res) => {
  try {
    const picklists = await repository.getExpectedPicklists();
    const qrList = [];

    for (const p of picklists) {
      const qrs = await generateAllQRCodesForPicklist(p.picklistNo, p.lines);
      qrList.push({
        picklistNo: p.picklistNo,
        lines: p.lines,
        qrs
      });
    }

    res.json({ success: true, picklists: qrList });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/scan', async (req, res) => {
  try {
    const { rawQR, selectedEventType, picklistNo, lines, eventType } = req.body;

    let qrPayload = null;
    if (picklistNo && eventType) {
      qrPayload = { picklistNo, lines: lines ? parseInt(lines, 10) : 0, eventType };
    }

    const result = await engine.processScan({
      qrPayload,
      selectedEventType,
      rawQR
    });

    if (result.success) {
      io.emit('liveUpdate');
    }

    res.json(result);
  } catch (err) {
    console.error('Scan API error:', err);
    res.status(500).json({ success: false, message: `Server error processing scan: ${err.message}` });
  }
});

app.get('/api/confirmation/config', async (req, res) => {
  try {
    const timeStr = await repository.getConfirmationTime();
    const completedList = await repository.getCompletedUnconfirmedPicklists();
    res.json({
      success: true,
      confirmationTime: timeStr,
      completedUnconfirmedCount: completedList.length
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/confirmation/config', async (req, res) => {
  try {
    const { confirmationTime } = req.body;
    if (!confirmationTime || !/^\d{2}:\d{2}$/.test(confirmationTime)) {
      return res.status(400).json({ success: false, message: 'Invalid time format. Expected HH:mm (24-hour).' });
    }

    await repository.setConfirmationTime(confirmationTime);
    res.json({ success: true, message: `Confirmation time updated to ${confirmationTime} IST.`, confirmationTime });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/confirmation/generate', async (req, res) => {
  try {
    const result = await scheduler.runConfirmationBatch('MANUAL');
    if (!result.success || result.count === 0) {
      return res.status(400).json({ success: false, message: 'No completed picklists awaiting confirmation.' });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Outbound_Confirmation_${Date.now()}.xlsx`);
    res.send(result.excelBuffer);
  } catch (err) {
    console.error('Confirmation generation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/confirmation/batches', async (req, res) => {
  try {
    const batches = await repository.getConfirmationBatches();
    res.json({ success: true, batches });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Scheduled batches have no response to stream into, so this is the only way to
// retrieve a spreadsheet the scheduler produced overnight.
app.get('/api/confirmation/download/:batchId', async (req, res) => {
  try {
    const batch = await repository.getConfirmationBatchById(req.params.batchId);
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Confirmation batch not found.' });
    }
    if (!fs.existsSync(batch.filePath)) {
      return res.status(410).json({
        success: false,
        message: `Batch ${batch.batchId} is recorded but its file is missing from disk.`
      });
    }
    res.download(batch.filePath, batch.fileName);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/history', async (req, res) => {
  try {
    const history = await repository.getHistoryRecords();
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const HTTP_PORT = 3000;
const HTTPS_PORT = 3001;
const HOST = '0.0.0.0';

/**
 * Starts the HTTPS listener that the phone scanner needs.
 *
 * Phone browsers only expose getUserMedia in a secure context, so the camera
 * cannot run against the plain HTTP listener.
 *
 * selfsigned v5 returns a promise. Reading .private/.cert straight off it
 * yields undefined, which builds a listener that accepts TCP connections and
 * then fails every TLS handshake with "sslv3 alert handshake failure" - the
 * port looks open while nothing can actually connect.
 */
async function startHttpsServer() {
  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
    ...localIPs.map(ip => ({ type: 7, ip }))
  ];

  const attrs = [
    { name: 'commonName', value: primaryIP },
    { name: 'organizationName', value: 'Outbound Scanner' }
  ];

  // Browsers ignore commonName and match the hostname against
  // subjectAltName, so every address a phone might use is listed there.
  const pems = await selfsigned.generate(attrs, {
    days: 365,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [{ name: 'subjectAltName', altNames }]
  });

  const httpsServer = https.createServer({
    key: pems.private,
    cert: pems.cert
  }, app);

  io.attach(httpsServer);

  await new Promise((resolve, reject) => {
    httpsServer.once('error', reject);
    httpsServer.listen(HTTPS_PORT, HOST, resolve);
  });

  console.log(` Phone Scanner (HTTPS Local) : https://${primaryIP}:${HTTPS_PORT}/operator.html`);
  return httpsServer;
}

httpServer.listen(HTTP_PORT, HOST, () => {
  console.log(`================================================================`);
  console.log(` OUTBOUND WORKFLOW MONITORING SYSTEM STARTED`);
  console.log(`----------------------------------------------------------------`);
  console.log(` Laptop Mentor Dashboard  : http://localhost:${HTTP_PORT}`);
  console.log(` Phone Scanner (Local Wi-Fi) : http://${primaryIP}:${HTTP_PORT}/operator.html`);

  // Launch background HTTPS Tunnel for live phone scanning
  localtunnel({ port: HTTP_PORT })
    .then(tunnel => {
      const phoneUrl = tunnel.url + '/operator.html';
      console.log(` Phone Scanner (HTTPS Live)  : ${phoneUrl}`);
      console.log(` Verification IP (if asked)  : see https://loca.lt/mytunnelpassword`);
      console.log(` Timezone Configured        : Indian Standard Time (IST, UTC+05:30)`);
      console.log(`================================================================`);
    })
    .catch(err => {
      console.log(` Timezone Configured        : Indian Standard Time (IST, UTC+05:30)`);
      console.log(`================================================================`);
    });
});

// The HTTP listener stays up even if certificate generation fails, so a broken
// HTTPS setup degrades to "camera unavailable" rather than taking down the app.
startHttpsServer().catch(err => {
  console.error(' [HTTPS] Could not start the camera server:', err.message);
  console.error(' [HTTPS] Use the public tunnel URL for phone scanning instead.');
});
