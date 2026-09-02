const QRCode = require('qrcode');

const EVENT_TYPES = {
  PICKING_START: 'PICKING_START',
  PICKING_END: 'PICKING_END',
  PACKING_START: 'PACKING_START',
  PACKING_END: 'PACKING_END'
};

/**
 * Encodes Outbound QR payload.
 * Standard format: OUTBOUND|<picklistNo>|<lines>|<eventType>
 */
function encodeQRPayload(picklistNo, lines, eventType) {
  return `OUTBOUND|${picklistNo}|${lines}|${eventType}`;
}

/**
 * Configurable QR Parser abstraction.
 * Parses raw scanned string into conceptual scan event object.
 */
function parseQRContent(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Invalid QR content: Content is empty or not a string.');
  }

  const trimmed = rawText.trim();

  // Standard OUTBOUND|PL001|10|PICKING_START format
  if (trimmed.startsWith('OUTBOUND|')) {
    const parts = trimmed.split('|');
    if (parts.length >= 4) {
      const picklistNo = parts[1].trim();
      const lines = parseInt(parts[2].trim(), 10);
      const eventType = parts[3].trim();

      if (!picklistNo || isNaN(lines) || !Object.values(EVENT_TYPES).includes(eventType)) {
        throw new Error('Malformed OUTBOUND QR format.');
      }

      return { picklistNo, lines, eventType };
    }
  }

  // Fallback: JSON format if scanned from custom QR generators
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.picklistNo && parsed.lines && parsed.eventType) {
      return {
        picklistNo: String(parsed.picklistNo).trim(),
        lines: parseInt(parsed.lines, 10),
        eventType: String(parsed.eventType).trim()
      };
    }
  } catch (e) {
    // Not JSON
  }

  throw new Error('Unrecognized QR Code format. Please scan an Outbound event QR code.');
}

/**
 * Generates Base64 Data URL for rendering QR code in browser HTML.
 */
async function generateQRDataUrl(payload) {
  try {
    return await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 180,
      color: {
        dark: '#1e293b',
        light: '#ffffff'
      }
    });
  } catch (err) {
    console.error('Error generating QR code data URL:', err);
    return null;
  }
}

/**
 * Generates all 4 event QR codes for a given Picklist.
 */
async function generateAllQRCodesForPicklist(picklistNo, lines) {
  const qrs = {};
  for (const [key, eventType] of Object.entries(EVENT_TYPES)) {
    const payload = encodeQRPayload(picklistNo, lines, eventType);
    const dataUrl = await generateQRDataUrl(payload);
    qrs[key] = {
      eventType,
      payload,
      dataUrl
    };
  }
  return qrs;
}

module.exports = {
  EVENT_TYPES,
  encodeQRPayload,
  parseQRContent,
  generateQRDataUrl,
  generateAllQRCodesForPicklist
};
