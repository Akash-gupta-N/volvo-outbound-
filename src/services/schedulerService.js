const fs = require('fs');
const path = require('path');
const { getISTNow, getISTISOString, formatISTDate } = require('../config/timezone');
const { generateConfirmationExcel } = require('./excelService');

class SchedulerService {
  constructor(repository, io) {
    this.repository = repository;
    this.io = io;
    this.timer = null;
    this.lastRunDateMinute = null;
    this.confirmationsDir = path.join(__dirname, '../../confirmations');

    if (!fs.existsSync(this.confirmationsDir)) {
      fs.mkdirSync(this.confirmationsDir, { recursive: true });
    }
  }

  start() {
    // Check every 30 seconds for scheduled confirmation time
    this.timer = setInterval(() => this.checkSchedule(), 30000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async checkSchedule() {
    try {
      const nowIST = getISTNow();
      const currentHM = nowIST.toFormat('HH:mm');
      const currentDateMinute = nowIST.toFormat('yyyy-MM-dd HH:mm');

      // Prevent running multiple times in the same minute
      if (this.lastRunDateMinute === currentDateMinute) return;

      const scheduledTime = await this.repository.getConfirmationTime();

      if (currentHM === scheduledTime) {
        this.lastRunDateMinute = currentDateMinute;
        await this.runConfirmationBatch('AUTOMATIC');
      }
    } catch (err) {
      console.error('Error checking scheduler:', err);
    }
  }

  async runConfirmationBatch(triggerType = 'MANUAL') {
    const completedPicklists = await this.repository.getCompletedUnconfirmedPicklists();
    if (completedPicklists.length === 0) {
      return { success: true, count: 0, message: 'No completed picklists awaiting confirmation.' };
    }

    const picklistNos = completedPicklists.map(p => p.picklistNo);
    const confirmationTimestamp = getISTISOString();
    const historyDate = formatISTDate(confirmationTimestamp);

    // Generate Excel buffer
    const excelBuffer = await generateConfirmationExcel(completedPicklists);

    // Write the spreadsheet to disk before anything is marked CONFIRMED.
    //
    // The scheduled run has no HTTP response to stream into, so a buffer that
    // is only returned is discarded by the caller. Picklists were being moved
    // into history while the spreadsheet they were confirmed by disappeared,
    // leaving no way to retrieve it. Saving first also means a write failure
    // aborts the batch rather than confirming picklists with no artefact.
    const batchId = `BATCH_${Date.now()}`;
    const fileName = `Outbound_Confirmation_${confirmationTimestamp.replace(/[:.]/g, '-')}.xlsx`;
    const filePath = path.join(this.confirmationsDir, fileName);
    fs.writeFileSync(filePath, excelBuffer);

    // Update DB status to CONFIRMED
    const count = await this.repository.confirmPicklists(picklistNos, confirmationTimestamp, historyDate);

    const batch = await this.repository.createConfirmationBatch({
      batchId,
      fileName,
      filePath,
      triggerType,
      picklistCount: count,
      createdAt: confirmationTimestamp
    });

    console.log(`[Scheduler] ${triggerType} confirmation batch ${batchId}: ${count} picklist(s) -> ${fileName}`);

    // Broadcast live dashboard update via WebSocket
    if (this.io) {
      this.io.emit('confirmationGenerated', {
        batchId,
        fileName,
        triggerType,
        count,
        timestamp: confirmationTimestamp
      });
      this.io.emit('liveUpdate');
    }

    return {
      success: true,
      count,
      excelBuffer,
      batch,
      picklistNos,
      confirmationTimestamp
    };
  }
}

module.exports = SchedulerService;
