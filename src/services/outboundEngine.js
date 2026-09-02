const { getISTISOString, formatISTTime } = require('../config/timezone');
const { parseQRContent } = require('./qrService');

class OutboundEngine {
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * Process a QR scan event.
   * Input can be parsed scanner payload { picklistNo, lines, eventType } or raw QR string.
   */
  async processScan({ qrPayload, selectedEventType, rawQR }) {
    const scannedAtIst = getISTISOString();
    let scanData = qrPayload;

    // Parse QR if raw string provided
    if (!scanData && rawQR) {
      try {
        scanData = parseQRContent(rawQR);
      } catch (err) {
        return {
          success: false,
          message: err.message || 'Invalid QR code scan.'
        };
      }
    }

    if (!scanData || !scanData.picklistNo || !scanData.eventType) {
      return {
        success: false,
        message: 'Invalid scan input. Missing Picklist No. or Event Type.'
      };
    }

    const { picklistNo, lines, eventType } = scanData;

    // Section 11: Validate that selected scanner mode matches scanned QR event type
    if (selectedEventType && selectedEventType !== eventType) {
      const formattedSelected = selectedEventType.replace('_', ' ');
      const formattedScanned = eventType.replace('_', ' ');
      const reason = `Mismatched Scanner Mode! You selected '${formattedSelected}' scanner, but scanned a '${formattedScanned}' QR code.`;
      
      await this.repository.recordScanEvent({
        picklistNo,
        lines: lines || 0,
        eventType,
        scannedAtIst,
        status: 'REJECTED',
        rejectionReason: reason
      });

      return {
        success: false,
        message: reason,
        picklistNo,
        eventType
      };
    }

    // Retrieve active picklist record from repository
    const picklist = await this.repository.getPicklistByNo(picklistNo);

    if (!picklist) {
      const reason = `Picklist ${picklistNo} not found in expected active data.`;
      await this.repository.recordScanEvent({
        picklistNo,
        lines: lines || 0,
        eventType,
        scannedAtIst,
        status: 'REJECTED',
        rejectionReason: reason
      });

      return {
        success: false,
        message: reason,
        picklistNo,
        eventType
      };
    }

    // Check sequence validation rules
    let rejectionReason = null;

    switch (eventType) {
      case 'PICKING_START':
        if (picklist.pickingStartTime) {
          rejectionReason = `Picking Start has already been recorded for ${picklistNo}.`;
        }
        break;

      case 'PICKING_END':
        if (!picklist.pickingStartTime) {
          rejectionReason = `Picking Start must be recorded before Picking End for ${picklistNo}.`;
        } else if (picklist.pickingEndTime) {
          rejectionReason = `Picking End has already been recorded for ${picklistNo}.`;
        }
        break;

      case 'PACKING_START':
        if (!picklist.pickingEndTime) {
          rejectionReason = `Picking must be completed before Packing can start.`;
        } else if (picklist.packingStartTime) {
          rejectionReason = `Packing Start has already been recorded for ${picklistNo}.`;
        }
        break;

      case 'PACKING_END':
        if (!picklist.packingStartTime) {
          rejectionReason = `Packing Start must be completed before Packing End for ${picklistNo}.`;
        } else if (picklist.packingEndTime) {
          rejectionReason = `Packing End has already been recorded for ${picklistNo}.`;
        }
        break;

      default:
        rejectionReason = `Unknown process event type '${eventType}'.`;
        break;
    }

    if (rejectionReason) {
      await this.repository.recordScanEvent({
        picklistNo: picklist.picklistNo,
        lines: picklist.lines,
        eventType,
        scannedAtIst,
        status: 'REJECTED',
        rejectionReason
      });

      return {
        success: false,
        message: rejectionReason,
        picklistNo: picklist.picklistNo,
        lines: picklist.lines,
        eventType
      };
    }

    // Sequence check passed! Calculate state transitions
    let pickingStatus = picklist.pickingStatus;
    let packingStatus = picklist.packingStatus;
    let pickingStartTime = picklist.pickingStartTime;
    let pickingEndTime = picklist.pickingEndTime;
    let packingStartTime = picklist.packingStartTime;
    let packingEndTime = picklist.packingEndTime;

    if (eventType === 'PICKING_START') {
      pickingStatus = 'In Progress';
      pickingStartTime = scannedAtIst;
    } else if (eventType === 'PICKING_END') {
      pickingStatus = 'Completed';
      pickingEndTime = scannedAtIst;
    } else if (eventType === 'PACKING_START') {
      packingStatus = 'In Progress';
      packingStartTime = scannedAtIst;
    } else if (eventType === 'PACKING_END') {
      packingStatus = 'Completed';
      packingEndTime = scannedAtIst;
    }

    const updatedPicklist = await this.repository.updatePicklistState({
      picklistNo: picklist.picklistNo,
      pickingStatus,
      packingStatus,
      pickingStartTime,
      pickingEndTime,
      packingStartTime,
      packingEndTime
    });

    await this.repository.recordScanEvent({
      picklistNo: picklist.picklistNo,
      lines: picklist.lines,
      eventType,
      scannedAtIst,
      status: 'ACCEPTED',
      rejectionReason: null
    });

    return {
      success: true,
      message: 'Scan Accepted',
      picklistNo: picklist.picklistNo,
      lines: picklist.lines,
      eventType,
      time: formatISTTime(scannedAtIst),
      scannedAtIst,
      picklist: updatedPicklist
    };
  }
}

module.exports = OutboundEngine;
