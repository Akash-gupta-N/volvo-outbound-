const xlsx = require('xlsx');
const path = require('path');

const data = [
  { "Picklist No.": "PL001", "Lines No.": 10 },
  { "Picklist No.": "PL002", "Lines No.": 8 },
  { "Picklist No.": "PL003", "Lines No.": 15 }
];

const worksheet = xlsx.utils.json_to_sheet(data);
const workbook = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(workbook, worksheet, 'Outbound Data');

const filePath = path.join(__dirname, 'test_picklists.xlsx');
xlsx.writeFile(workbook, filePath);
console.log('Sample excel created at:', filePath);
