'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readXlsx, writeXlsx, crc32 } = require('../lib/xlsx');

test('crc32 ตรงกับค่ามาตรฐาน', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('เขียนแล้วอ่านกลับได้ข้อมูลเดิม', () => {
  const buf = writeXlsx([
    { name: '2569', header: ['เลขทะเบียนส่ง', 'เรื่อง'], rows: [[1, 'ขออนุมัติ <ทดสอบ> & "อื่น ๆ"'], [2, ' เว้นวรรค ']] },
    { name: '2568', header: ['เลขทะเบียนส่ง', 'เรื่อง'], rows: [] },
  ]);
  const sheets = readXlsx(buf);
  assert.deepEqual(sheets.map(s => s.name), ['2569', '2568']);
  assert.deepEqual(sheets[0].rows, [
    ['เลขทะเบียนส่ง', 'เรื่อง'],
    [1, 'ขออนุมัติ <ทดสอบ> & "อื่น ๆ"'],
    [2, ' เว้นวรรค '],
  ]);
  assert.deepEqual(sheets[1].rows, [['เลขทะเบียนส่ง', 'เรื่อง']]);
});
