'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDate, cleanText, importWorkbook, firstFreeNumber } = require('../lib/importer');

test('parseDate: เซลล์วันที่ที่พิมพ์ปีเป็น พ.ศ. หรือ ค.ศ.', () => {
  assert.equal(parseDate({ y: 2569, m: 10, d: 6 }, 2569), '2026-10-06');
  assert.equal(parseDate({ y: 2026, m: 10, d: 6 }, 2569), '2026-10-06');
});

test('parseDate: ข้อความวันที่หลายรูปแบบ', () => {
  assert.equal(parseDate('19/3/2025', 2568), '2025-03-19');
  assert.equal(parseDate('13/8-69', 2569), '2026-08-13');
  assert.equal(parseDate('19/5/25', 2568), '2025-05-19');
  assert.equal(parseDate('18/6/24', 2567), '2024-06-18');
  assert.equal(parseDate('5/25/2569', 2569), '2026-05-25'); // เดือน/วัน เพราะ 25 ไม่ใช่เดือน
  assert.equal(parseDate('7/13/2026', 2569), '2026-07-13');
  assert.equal(parseDate('6/10/2569', 2569), '2026-10-06');
  assert.equal(parseDate('31/2/2569', 2569), null);
  assert.equal(parseDate('ไม่ทราบ', 2569), null);
});

test('cleanText: แก้อักขระไทย PUA และช่องว่าง', () => {
  assert.equal(cleanText('ขอมูล '), 'ข้อมูล');
  assert.equal(cleanText('  '), '');
  assert.equal(cleanText(null), '');
});

test('firstFreeNumber: เลขแรกที่ว่างนับจากเลขน้อยสุด', () => {
  assert.equal(firstFreeNumber([]), 1);
  assert.equal(firstFreeNumber([1, 2, 3, 42, 43]), 4);
  assert.equal(firstFreeNumber([28, 29, 30]), 31);
});

test('importWorkbook: ข้ามแถวที่มีแต่เลข รวมบรรทัดต่อ และเตือนเลขซ้ำ', () => {
  const header = ['เลขทะเบียนส่ง', 'ที่', 'ลงวันที่', 'จาก', 'ถึง', 'เรื่อง', 'การปฏิบัติ', 'หมายเหตุ'];
  const { years, warnings } = importWorkbook([
    {
      name: '2569',
      rows: [
        header,
        [1, 'สธ 0315.3(2.7.1)', { y: 2569, m: 1, d: 6 }, 'ฟิสิกส์การแพทย์', 'ผู้อำนวยการ', 'ขอลงนามใบมอบอำนาจ', 'ก'],
        [null, null, null, null, null, 'เครื่องกำเนิดรังสี'],
        [2, 'สธ 0315.3(2.7.1)', '13/8-69', 'ฟิสิกส์การแพทย์', 'ผู้อำนวยการ', 'ขออนุมัติ', 'ข'],
        [3],
        [4],
        [2, 'x', null, null, null, 'ซ้ำ'],
      ],
    },
    { name: 'Sheet1', rows: [header] },
  ]);
  assert.deepEqual(Object.keys(years), ['2569']);
  const recs = years[2569];
  assert.equal(recs.length, 2);
  assert.equal(recs[0].subject, 'ขอลงนามใบมอบอำนาจ เครื่องกำเนิดรังสี');
  assert.equal(recs[0].date, '2026-01-06');
  assert.equal(recs[1].date, '2026-08-13');
  assert.equal(firstFreeNumber(recs.map(r => r.no)), 3);
  assert.equal(warnings.length, 2);
});
