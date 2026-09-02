const { DateTime } = require('luxon');

const IST_ZONE = 'Asia/Kolkata';

/**
 * Returns current date/time in IST ISO string or custom format.
 */
function getISTNow() {
  return DateTime.now().setZone(IST_ZONE);
}

/**
 * Formats current IST time as ISO string for DB storage.
 * e.g., '2026-08-13T11:05:00+05:30'
 */
function getISTISOString() {
  return getISTNow().toISO();
}

/**
 * Formats timestamp into HH:mm:ss IST string for UI display.
 */
function formatISTTime(dateTimeOrIso) {
  if (!dateTimeOrIso) return '—';
  if (typeof dateTimeOrIso === 'string') {
    const dt = DateTime.fromISO(dateTimeOrIso, { zone: IST_ZONE });
    if (dt.isValid) return dt.toFormat('HH:mm:ss');
    // Fallback if plain string formatted
    return dateTimeOrIso;
  }
  return dateTimeOrIso.setZone(IST_ZONE).toFormat('HH:mm:ss');
}

/**
 * Formats timestamp into YYYY-MM-DD IST date string.
 */
function formatISTDate(dateTimeOrIso) {
  const dt = typeof dateTimeOrIso === 'string'
    ? DateTime.fromISO(dateTimeOrIso, { zone: IST_ZONE })
    : (dateTimeOrIso || getISTNow()).setZone(IST_ZONE);
  
  if (dt.isValid) return dt.toFormat('yyyy-MM-dd');
  return getISTNow().toFormat('yyyy-MM-dd');
}

/**
 * Formats full timestamp e.g., '2026-08-13 11:05:00 IST'
 */
function formatISTFull(dateTimeOrIso) {
  if (!dateTimeOrIso) return '—';
  const dt = typeof dateTimeOrIso === 'string'
    ? DateTime.fromISO(dateTimeOrIso, { zone: IST_ZONE })
    : dateTimeOrIso.setZone(IST_ZONE);
  
  if (!dt.isValid) return dateTimeOrIso;
  return dt.toFormat('yyyy-MM-dd HH:mm:ss');
}

module.exports = {
  IST_ZONE,
  getISTNow,
  getISTISOString,
  formatISTTime,
  formatISTDate,
  formatISTFull
};
