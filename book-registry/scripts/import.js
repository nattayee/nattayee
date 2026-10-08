'use strict';
// นำเข้าไฟล์ Excel ทางบรรทัดคำสั่ง: node scripts/import.js ทะเบียนหนังสือ.xlsx
// (ปิดเซิร์ฟเวอร์ก่อน หรือใช้ปุ่ม "นำเข้า Excel" บนหน้าเว็บแทน)

const fs = require('fs');
const path = require('path');
const { readXlsx } = require('../lib/xlsx');
const { importWorkbook } = require('../lib/importer');
const { Store } = require('../lib/store');

const file = process.argv[2];
if (!file) {
  console.error('วิธีใช้: node scripts/import.js <ไฟล์.xlsx>');
  process.exit(1);
}

const dataFile = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'registry.json');
const { years, warnings } = importWorkbook(readXlsx(fs.readFileSync(file)));
if (!Object.keys(years).length) {
  console.error('ไม่พบชีตที่ตั้งชื่อเป็นปี พ.ศ. (เช่น 2569) ในไฟล์นี้');
  process.exit(1);
}

const store = new Store(dataFile);
const backup = store.replaceYears(years);
for (const year of Object.keys(years).sort().reverse()) {
  console.log(`ปี ${year}: นำเข้า ${years[year].length} รายการ  เลขถัดไป ${store.nextNo(Number(year))}`);
}
for (const w of warnings) console.log(`  - ${w}`);
if (backup) console.log(`สำรองข้อมูลเดิมไว้ที่ ${backup}`);
console.log(`บันทึกลง ${dataFile}`);
