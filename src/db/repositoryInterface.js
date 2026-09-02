/**
 * Abstract Repository Interface defining operations for Outbound Data Storage.
 * Implementations (e.g. SqliteRepository, future FirestoreRepository) must satisfy this contract.
 */
class OutboundRepositoryInterface {
  async getExpectedPicklists() {
    throw new Error('Method getExpectedPicklists() must be implemented');
  }

  async getPicklistByNo(picklistNo) {
    throw new Error('Method getPicklistByNo() must be implemented');
  }

  async saveOrUpdatePicklist({ picklistNo, lines }) {
    throw new Error('Method saveOrUpdatePicklist() must be implemented');
  }

  async updatePicklistLines(picklistNo, lines) {
    throw new Error('Method updatePicklistLines() must be implemented');
  }

  async updatePicklistState(picklistData) {
    throw new Error('Method updatePicklistState() must be implemented');
  }

  async recordScanEvent(scanEvent) {
    throw new Error('Method recordScanEvent() must be implemented');
  }

  async getLiveMonitoringData() {
    throw new Error('Method getLiveMonitoringData() must be implemented');
  }

  async getCompletedUnconfirmedPicklists() {
    throw new Error('Method getCompletedUnconfirmedPicklists() must be implemented');
  }

  async confirmPicklists(picklistNos, confirmationTimestamp, historyDate) {
    throw new Error('Method confirmPicklists() must be implemented');
  }

  async getHistoryRecords() {
    throw new Error('Method getHistoryRecords() must be implemented');
  }

  async getConfirmationTime() {
    throw new Error('Method getConfirmationTime() must be implemented');
  }

  async setConfirmationTime(timeStr) {
    throw new Error('Method setConfirmationTime() must be implemented');
  }
}

module.exports = OutboundRepositoryInterface;
