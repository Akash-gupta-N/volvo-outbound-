const { getISTNow, getISTISOString, formatISTDate } = require('../config/timezone');
const { generateConfirmationExcel } = require('./excelService');

class SchedulerService {
  constructor(repository, io) {
    this.repository = repository;
    this.io = io;
    this.timer = null;
    this.lastRunDateMinute = null;
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

    // Update DB status to CONFIRMED
    const count = await this.repository.confirmPicklists(picklistNos, confirmationTimestamp, historyDate);

    // Broadcast live dashboard update via WebSocket
    if (this.io) {
      this.io.emit('confirmationGenerated', {
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
      picklistNos,
      confirmationTimestamp
    };
  }
}

module.exports = SchedulerService;
