const Database = require('better-sqlite3');
const path = require('path');
const { getISTISOString } = require('../config/timezone');

const dbPath = path.join(__dirname, '../../outbound.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency performance
db.pragma('journal_mode = WAL');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS picklists (
      picklist_no TEXT PRIMARY KEY,
      lines INTEGER NOT NULL,
      picking_status TEXT NOT NULL DEFAULT 'Not Started',
      packing_status TEXT NOT NULL DEFAULT 'Not Started',
      picking_start_time TEXT,
      picking_end_time TEXT,
      packing_start_time TEXT,
      packing_end_time TEXT,
      confirmation_status TEXT NOT NULL DEFAULT 'PENDING',
      confirmation_datetime TEXT,
      history_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scan_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      picklist_no TEXT NOT NULL,
      lines INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      scanned_at_ist TEXT NOT NULL,
      status TEXT NOT NULL,
      rejection_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Default confirmation time if not set: 17:00 IST (5:00 PM)
  const stmtCheck = db.prepare(`SELECT value FROM config WHERE key = 'confirmation_time'`);
  const existingConfig = stmtCheck.get();
  if (!existingConfig) {
    const stmtInsert = db.prepare(`INSERT INTO config (key, value) VALUES ('confirmation_time', '17:00')`);
    stmtInsert.run();
  }
}

module.exports = {
  db,
  initDatabase
};
