const OutboundRepositoryInterface = require('./repositoryInterface');
const { db } = require('./database');
const { getISTISOString } = require('../config/timezone');

class SqliteRepository extends OutboundRepositoryInterface {
  async getExpectedPicklists() {
    const stmt = db.prepare(`
      SELECT 
        picklist_no AS picklistNo,
        lines,
        picking_status AS pickingStatus,
        packing_status AS packingStatus,
        picking_start_time AS pickingStartTime,
        picking_end_time AS pickingEndTime,
        packing_start_time AS packingStartTime,
        packing_end_time AS packingEndTime,
        confirmation_status AS confirmationStatus,
        created_at AS createdAt
      FROM picklists
      WHERE confirmation_status = 'PENDING'
      ORDER BY created_at ASC
    `);
    return stmt.all();
  }

  async getPicklistByNo(picklistNo) {
    const stmt = db.prepare(`
      SELECT 
        picklist_no AS picklistNo,
        lines,
        picking_status AS pickingStatus,
        packing_status AS packingStatus,
        picking_start_time AS pickingStartTime,
        picking_end_time AS pickingEndTime,
        packing_start_time AS packingStartTime,
        packing_end_time AS packingEndTime,
        confirmation_status AS confirmationStatus,
        confirmation_datetime AS confirmationDateTime,
        history_date AS historyDate,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM picklists
      WHERE picklist_no = ?
    `);
    return stmt.get(picklistNo) || null;
  }

  async saveOrUpdatePicklist({ picklistNo, lines }) {
    const existing = await this.getPicklistByNo(picklistNo);
    const now = getISTISOString();

    if (existing) {
      // Prompt Section 5: If uploaded Picklist/Lines already exists in active expected data, do not create a duplicate.
      // For prototype, assume same Picklist No. won't exist with different lines, but if lines updated via upload, preserve existing state if already started.
      return existing;
    }

    const stmt = db.prepare(`
      INSERT INTO picklists (
        picklist_no, lines, picking_status, packing_status, 
        confirmation_status, created_at, updated_at
      ) VALUES (?, ?, 'Not Started', 'Not Started', 'PENDING', ?, ?)
    `);
    stmt.run(picklistNo, lines, now, now);
    return this.getPicklistByNo(picklistNo);
  }

  async updatePicklistLines(picklistNo, lines) {
    const now = getISTISOString();
    const stmt = db.prepare(`
      UPDATE picklists 
      SET lines = ?, updated_at = ?
      WHERE picklist_no = ? AND confirmation_status = 'PENDING'
    `);
    stmt.run(lines, now, picklistNo);
    return this.getPicklistByNo(picklistNo);
  }

  async updatePicklistState({ picklistNo, pickingStatus, packingStatus, pickingStartTime, pickingEndTime, packingStartTime, packingEndTime }) {
    const now = getISTISOString();
    const stmt = db.prepare(`
      UPDATE picklists
      SET 
        picking_status = ?,
        packing_status = ?,
        picking_start_time = COALESCE(?, picking_start_time),
        picking_end_time = COALESCE(?, picking_end_time),
        packing_start_time = COALESCE(?, packing_start_time),
        packing_end_time = COALESCE(?, packing_end_time),
        updated_at = ?
      WHERE picklist_no = ?
    `);
    stmt.run(
      pickingStatus,
      packingStatus,
      pickingStartTime || null,
      pickingEndTime || null,
      packingStartTime || null,
      packingEndTime || null,
      now,
      picklistNo
    );
    return this.getPicklistByNo(picklistNo);
  }

  async recordScanEvent({ picklistNo, lines, eventType, scannedAtIst, status, rejectionReason }) {
    const stmt = db.prepare(`
      INSERT INTO scan_events (picklist_no, lines, event_type, scanned_at_ist, status, rejection_reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(picklistNo, lines, eventType, scannedAtIst, status, rejectionReason || null);
  }

  async getLiveMonitoringData() {
    const picklists = await this.getExpectedPicklists();

    const stmtLastScan = db.prepare(`
      SELECT scanned_at_ist 
      FROM scan_events 
      WHERE status = 'ACCEPTED' 
      ORDER BY id DESC LIMIT 1
    `);
    const lastScanRow = stmtLastScan.get();
    const lastScanTime = lastScanRow ? lastScanRow.scanned_at_ist : null;

    const summary = {
      totalExpected: picklists.length,
      pickingInProgress: picklists.filter(p => p.pickingStatus === 'In Progress').length,
      packingInProgress: picklists.filter(p => p.packingStatus === 'In Progress').length,
      completedAwaitingConfirmation: picklists.filter(p => p.pickingStatus === 'Completed' && p.packingStatus === 'Completed').length,
      lastScanTime
    };

    return { picklists, summary };
  }

  async getCompletedUnconfirmedPicklists() {
    const stmt = db.prepare(`
      SELECT 
        picklist_no AS picklistNo,
        lines,
        picking_start_time AS pickingStartTime,
        picking_end_time AS pickingEndTime,
        packing_start_time AS packingStartTime,
        packing_end_time AS packingEndTime
      FROM picklists
      WHERE confirmation_status = 'PENDING'
        AND picking_status = 'Completed'
        AND packing_status = 'Completed'
      ORDER BY updated_at ASC
    `);
    return stmt.all();
  }

  async confirmPicklists(picklistNos, confirmationTimestamp, historyDate) {
    if (!picklistNos || picklistNos.length === 0) return 0;
    
    const placeholders = picklistNos.map(() => '?').join(',');
    const stmt = db.prepare(`
      UPDATE picklists
      SET 
        confirmation_status = 'CONFIRMED',
        confirmation_datetime = ?,
        history_date = ?
      WHERE picklist_no IN (${placeholders}) AND confirmation_status = 'PENDING'
    `);
    const result = stmt.run(confirmationTimestamp, historyDate, ...picklistNos);
    return result.changes;
  }

  async createConfirmationBatch({ batchId, fileName, filePath, triggerType, picklistCount, createdAt }) {
    const stmt = db.prepare(`
      INSERT INTO confirmation_batches (batch_id, file_name, file_path, trigger_type, picklist_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(batchId, fileName, filePath, triggerType, picklistCount, createdAt);
    return this.getConfirmationBatchById(batchId);
  }

  async getConfirmationBatchById(batchId) {
    const stmt = db.prepare(`
      SELECT
        batch_id AS batchId,
        file_name AS fileName,
        file_path AS filePath,
        trigger_type AS triggerType,
        picklist_count AS picklistCount,
        created_at AS createdAt
      FROM confirmation_batches
      WHERE batch_id = ?
    `);
    return stmt.get(batchId) || null;
  }

  async getConfirmationBatches() {
    const stmt = db.prepare(`
      SELECT
        batch_id AS batchId,
        file_name AS fileName,
        file_path AS filePath,
        trigger_type AS triggerType,
        picklist_count AS picklistCount,
        created_at AS createdAt
      FROM confirmation_batches
      ORDER BY created_at DESC
    `);
    return stmt.all();
  }

  async getHistoryRecords() {
    const stmt = db.prepare(`
      SELECT 
        history_date AS historyDate,
        picklist_no AS picklistNo,
        lines,
        picking_start_time AS pickingStartTime,
        picking_end_time AS pickingEndTime,
        packing_start_time AS packingStartTime,
        packing_end_time AS packingEndTime,
        confirmation_datetime AS confirmationDateTime
      FROM picklists
      WHERE confirmation_status = 'CONFIRMED'
      ORDER BY confirmation_datetime DESC
    `);
    return stmt.all();
  }

  async getConfirmationTime() {
    const stmt = db.prepare(`SELECT value FROM config WHERE key = 'confirmation_time'`);
    const row = stmt.get();
    return row ? row.value : '17:00';
  }

  async setConfirmationTime(timeStr) {
    const stmt = db.prepare(`INSERT OR REPLACE INTO config (key, value) VALUES ('confirmation_time', ?)`);
    stmt.run(timeStr);
    return timeStr;
  }
}

module.exports = SqliteRepository;
