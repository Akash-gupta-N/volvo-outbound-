const xlsx = require('xlsx');
const ExcelJS = require('exceljs');
const { formatISTTime, formatISTFull } = require('../config/timezone');

/**
 * Parses uploaded Excel buffer to extract Picklist No. and Lines No.
 */
function parseUploadedExcel(fileBuffer) {
  const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

  const result = [];

  for (const row of rows) {
    // Look for column names case-insensitively
    let picklistNo = '';
    let lines = 0;

    for (const key of Object.keys(row)) {
      const cleanKey = key.trim().toLowerCase();
      if (cleanKey.includes('picklist')) {
        picklistNo = String(row[key]).trim();
      } else if (cleanKey.includes('line')) {
        lines = parseInt(row[key], 10);
      }
    }

    if (picklistNo && !isNaN(lines) && lines > 0) {
      result.push({ picklistNo, lines });
    }
  }

  return result;
}

/**
 * Generates Confirmation Excel with EXACTLY 6 columns.
 * Columns:
 * 1. Picklist No.
 * 2. Lines
 * 3. Picking Start Time
 * 4. Picking End Time
 * 5. Package Start Time
 * 6. Package End Time
 */
async function generateConfirmationExcel(confirmedPicklists) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Outbound Confirmation');

  // Define exact 6 columns required by prompt Section 27
  worksheet.columns = [
    { header: 'Picklist No.', key: 'picklistNo', width: 18 },
    { header: 'Lines', key: 'lines', width: 10 },
    { header: 'Picking Start Time', key: 'pickingStartTime', width: 22 },
    { header: 'Picking End Time', key: 'pickingEndTime', width: 22 },
    { header: 'Package Start Time', key: 'packingStartTime', width: 22 },
    { header: 'Package End Time', key: 'packingEndTime', width: 22 }
  ];

  // Style header row
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '1E293B' }
  };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  for (const p of confirmedPicklists) {
    worksheet.addRow({
      picklistNo: p.picklistNo,
      lines: p.lines,
      pickingStartTime: formatISTTime(p.pickingStartTime),
      pickingEndTime: formatISTTime(p.pickingEndTime),
      packingStartTime: formatISTTime(p.packingStartTime),
      packingEndTime: formatISTTime(p.packingEndTime)
    });
  }

  // Right-align lines column and center time columns
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.getCell(2).alignment = { horizontal: 'right' };
      row.getCell(3).alignment = { horizontal: 'center' };
      row.getCell(4).alignment = { horizontal: 'center' };
      row.getCell(5).alignment = { horizontal: 'center' };
      row.getCell(6).alignment = { horizontal: 'center' };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

module.exports = {
  parseUploadedExcel,
  generateConfirmationExcel
};
