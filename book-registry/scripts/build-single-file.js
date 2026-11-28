'use strict';
// รวม Code.gs กับ Index.html เป็น Code.gs ไฟล์เดียว (ไม่ต้องสร้างไฟล์ HTML ชื่อ Index ใน Apps Script)
//   node scripts/build-single-file.js > Code.gs

const fs = require('fs');
const path = require('path');

function singleFile(code, html) {
  const lines = html.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  return code.replace(/\n*$/, '\n') +
    '\n// ============================================================ หน้าเว็บ (เนื้อหาไฟล์ Index.html)\n' +
    '// รวมไว้ในไฟล์นี้แล้ว ไม่ต้องสร้างไฟล์ HTML แยก — ห้ามแก้ส่วนนี้ด้วยมือ\n\n' +
    'var INDEX_HTML = [\n' +
    lines.map(l => '  ' + JSON.stringify(l) + ',').join('\n') +
    "\n].join('\\n');\n";
}

function build() {
  const dir = path.join(__dirname, '..', 'apps-script');
  return singleFile(fs.readFileSync(path.join(dir, 'Code.gs'), 'utf8'), fs.readFileSync(path.join(dir, 'Index.html'), 'utf8'));
}

if (require.main === module) process.stdout.write(build());

module.exports = { singleFile, build };
