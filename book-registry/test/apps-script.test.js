'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAppsScript } = require('../scripts/apps-script-mock');

const HEADER = ['เลขทะเบียนส่ง', 'ที่', 'ลงวันที่', 'จาก', 'ถึง', 'เรื่อง', 'การปฏิบัติ', 'หมายเหตุ'];
const REF = 'สธ 0315.3(2.7.1)';

// ชีตตัวอย่างแบบเดียวกับไฟล์ทะเบียนจริง: ปีพิมพ์เป็น พ.ศ. บ้าง ค.ศ. บ้าง, เลขเตรียมไว้ล่วงหน้า, บรรทัดต่อ
function fixture() {
  return loadAppsScript({
    'สรุป': [['ไม่ใช่ชีตปี']],
    2569: [
      HEADER,
      [1, REF, { y: 2569, m: 1, d: 6 }, 'ฟิสิกส์การแพทย์', 'ผู้อำนวยการ', 'ขอลงนามใบมอบอำนาจ', 'ก'],
      ['', '', '', '', '', 'เครื่องกำเนิดรังสี'],
      [2, REF, '13/8-69', 'ฟิสิกส์การแพทย์', 'ผู้อำนวยการ', 'ขออนุมัติจัดซื้อจัดจ้างขอมูล ', 'ข'],
      [3, REF, { y: 2026, m: 10, d: 6 }, 'ฟิสิกส์การแพทย์', 'ผู้อำนวยการ', 'ขออนุมัติลาพักผ่อน', 'ค'],
      [4], [5], [6],
      [7, REF, { y: 2026, m: 8, d: 13 }, 'งานฟิสิกส์การแพทย์', 'ผู้อำนวยการ', 'ขออนุมัติเข้าร่วมประชุม', 'ง'],
      [8],
    ],
    2568: [HEADER, [1, REF, '19/5/25', 'งานฟิสิกส์การแพทย์', 'ผู้อำนวยการ', 'ขออนุมัติ', 'ก']],
  });
}

const rowOf = (ss, tz, name, row) => ss.getSheetByName(name).dump(tz)[row - 1];

test('getState: อ่านชีตปี วันที่ บรรทัดต่อ และเลขถัดไป', () => {
  const { api } = fixture();
  const st = api.getState();
  assert.deepEqual(st.nextNo[2569], 4);
  assert.deepEqual(st.nextNo[2568], 2);
  assert.equal(st.records.length, 5);

  const byNo = Object.fromEntries(st.records.filter(r => r.year === 2569).map(r => [r.no, r]));
  assert.equal(byNo[1].date, '2026-01-06');
  assert.equal(byNo[1].subject, 'ขอลงนามใบมอบอำนาจ เครื่องกำเนิดรังสี');
  assert.equal(byNo[2].date, '2026-08-13');
  assert.equal(byNo[2].subject, 'ขออนุมัติจัดซื้อจัดจ้างข้อมูล');
  assert.equal(byNo[3].date, '2026-10-06');
  assert.equal(st.records.find(r => r.year === 2568).date, '2025-05-19');
});

test('createRecord: เขียนลงแถวที่เตรียมเลขไว้ และข้ามเลขที่ใช้แล้ว', () => {
  const { api, ss, tz } = fixture();
  const rec = api.createRecord({ date: '2026-10-11', ref: REF, from: 'ฟิสิกส์การแพทย์', to: 'ผู้อำนวยการ', subject: 'ขออนุมัติเดินทาง', action: 'จ' });
  assert.equal(rec.no, 4);
  assert.equal(rec.id, '2569-4');
  // แถวที่ 6 ของชีต คือแถวที่พิมพ์เลข 4 รอไว้
  assert.deepEqual(rowOf(ss, tz, '2569', 6), [4, REF, '2026-10-11', 'ฟิสิกส์การแพทย์', 'ผู้อำนวยการ', 'ขออนุมัติเดินทาง', 'จ', '']);
  const cells = ss.getSheetByName('2569').rows[5];
  assert.equal(cells[2].format, 'd/m/yyyy');
  assert.equal(cells[5].format, '@');

  assert.equal(api.createRecord({ date: '2026-10-11', subject: 'b' }).no, 5);
  assert.equal(api.createRecord({ date: '2026-10-11', subject: 'c' }).no, 6);
  assert.equal(api.createRecord({ date: '2026-10-11', subject: 'd' }).no, 8); // ข้าม 7
  assert.equal(api.createRecord({ date: '2026-10-11', subject: 'e' }).no, 9); // ต่อท้ายชีต
  assert.deepEqual(rowOf(ss, tz, '2569', 11).slice(0, 1), [9]);
});

test('createRecord: ข้อความที่ขึ้นต้นด้วย = หรือเป็นตัวเลข ถูกเก็บเป็นข้อความ', () => {
  const { api, ss, tz } = fixture();
  api.createRecord({ date: '2026-10-11', subject: '=IMPORTXML("http://x")', ref: '0315' });
  const row = rowOf(ss, tz, '2569', 6);
  assert.equal(row[5], '=IMPORTXML("http://x")');
  assert.equal(row[1], '0315');
});

test('createRecord: ปีใหม่สร้างชีตใหม่พร้อมหัวตาราง และเริ่มเลข 1', () => {
  const { api, ss, tz } = fixture();
  const rec = api.createRecord({ date: '2027-01-04', subject: 'ปีใหม่' });
  assert.equal(rec.year, 2570);
  assert.equal(rec.no, 1);
  assert.equal(ss.getSheets()[0].getName(), '2570');
  assert.deepEqual(rowOf(ss, tz, '2570', 1), HEADER);
  assert.equal(rowOf(ss, tz, '2570', 2)[0], 1);
});

test('createRecord: เพิ่มแถวให้เองเมื่อชีตเต็ม', () => {
  const { api, ss, tz } = fixture();
  ss.getSheetByName('2569').maxRows = 10;
  api.setNextNo(2569, 9);
  assert.equal(api.createRecord({ date: '2026-10-11', subject: 'แถวที่ 11' }).no, 9);
  assert.equal(rowOf(ss, tz, '2569', 11)[5], 'แถวที่ 11');
});

test('createRecord: ตรวจข้อมูลก่อนบันทึก', () => {
  const { api } = fixture();
  assert.throws(() => api.createRecord({ date: '2026-02-30', subject: 'x' }), /วันที่/);
  assert.throws(() => api.createRecord({ date: '2026-02-03', subject: '  ' }), /เรื่อง/);
  assert.throws(() => api.createRecord({ date: '2026-02-03', subject: 'x'.repeat(1001) }), /ยาวเกิน/);
});

test('updateRecord: แก้ข้อความ เลข และล้างบรรทัดต่อ', () => {
  const { api, ss, tz } = fixture();
  assert.throws(() => api.updateRecord({ year: 2569, no: 1 }, { no: 2 }), /มีอยู่แล้ว/);
  assert.throws(() => api.updateRecord({ year: 2569, no: 99 }, { subject: 'x' }), /ไม่พบ/);

  const rec = api.updateRecord({ year: 2569, no: 1 }, { no: 10, subject: 'ขอลงนามใบมอบอำนาจ (แก้)', date: '2026-01-07' });
  assert.equal(rec.no, 10);
  assert.equal(rec.action, 'ก');
  assert.deepEqual(rowOf(ss, tz, '2569', 2).slice(0, 6), [10, REF, '2026-01-07', 'ฟิสิกส์การแพทย์', 'ผู้อำนวยการ', 'ขอลงนามใบมอบอำนาจ (แก้)']);
  assert.equal(rowOf(ss, tz, '2569', 3)[5], '');

  const st = api.getState();
  assert.equal(st.records.find(r => r.no === 10).subject, 'ขอลงนามใบมอบอำนาจ (แก้)');
  assert.equal(st.nextNo[2569], 4);
});

test('deleteRecord: ล้างแถวแต่คงเลขไว้ และคืนเลขเมื่อลบเลขล่าสุด', () => {
  const { api, ss, tz } = fixture();
  const a = api.createRecord({ date: '2026-10-11', subject: 'a' });
  api.deleteRecord({ year: 2569, no: a.no });
  assert.deepEqual(rowOf(ss, tz, '2569', 6), [4, '', '', '', '', '', '', '']);
  assert.equal(api.getState().nextNo[2569], 4);
  assert.equal(api.createRecord({ date: '2026-10-11', subject: 'b' }).no, 4);

  // ลบเลขกลางทาง → เลขถัดไปไม่ถอยกลับ
  api.deleteRecord({ year: 2569, no: 2 });
  assert.equal(api.getState().nextNo[2569], 5);
});

test('setNextNo: ตั้งเลขถัดไปเอง และข้ามเลขที่มีอยู่', () => {
  const { api } = fixture();
  assert.equal(api.setNextNo(2569, 7), 8);
  assert.equal(api.createRecord({ date: '2026-10-11', subject: 'x' }).no, 8);
  assert.throws(() => api.setNextNo(2569, 0), /จำนวนเต็มบวก/);
});

test('doGet: เปิดหน้าเว็บจากไฟล์ Index', () => {
  const { api } = fixture();
  assert.equal(api.doGet().name, 'Index');
});

test('importFromSpreadsheet: คัดลอกทะเบียนจากไฟล์เดิมมาไฟล์ใหม่ แล้วออกเลขต่อ', () => {
  const OLD = 'https://docs.google.com/spreadsheets/d/old/edit';
  const old = [
    HEADER,
    [1, REF, { y: 2569, m: 1, d: 6 }, 'ฟิสิกส์การแพทย์', 'ผู้อำนวยการ', 'ขอลงนาม', 'ก'],
    ['', '', '', '', '', 'ต่อบรรทัด'],
    [2, REF, '13/8-69', 'ฟิสิกส์การแพทย์', 'ผู้อำนวยการ', 'ขอมูล', 'ข'],
    [3], [4],
    [42, REF, 'ไม่ทราบ', '', '', 'จองไว้', ''],
  ];
  const { api, ss, tz, ui } = loadAppsScript({ ชีต1: [] }, { others: { [OLD]: { 2569: old, 2568: [HEADER, [61, REF, '1/12/2025', '', '', 'x', '']] } } });

  ui.promptAnswer = OLD;
  api.copyFromOldSheet();
  assert.equal(ui.alerts[0].title, 'คัดลอกเรียบร้อย');
  assert.match(ui.alerts[0].msg, /ปี 2569: 3 รายการ {2}เลขถัดไป 3/);
  assert.deepEqual(ss.getSheets().map(s => s.getName()), ['2569', '2568']);
  assert.deepEqual(rowOf(ss, tz, '2569', 2), [1, REF, '2026-01-06', 'ฟิสิกส์การแพทย์', 'ผู้อำนวยการ', 'ขอลงนาม ต่อบรรทัด', 'ก', '']);
  assert.equal(rowOf(ss, tz, '2569', 3)[5], 'ข้อมูล');
  assert.equal(rowOf(ss, tz, '2569', 4)[2], 'ไม่ทราบ');

  assert.equal(api.createRecord({ date: '2026-10-12', subject: 'ใหม่' }).no, 3);
  assert.deepEqual(rowOf(ss, tz, '2569', 5).slice(0, 1), [3]);

  // คัดลอกซ้ำ: ปีที่มีข้อมูลแล้วจะถูกข้าม ไม่ทับของใหม่
  const again = api.importFromSpreadsheet(OLD);
  assert.deepEqual(again.years.map(y => !!y.skipped), [true, true]);
  assert.throws(() => api.importFromSpreadsheet('https://docs.google.com/spreadsheets/d/nope'), /เปิดไฟล์เดิมไม่ได้/);
  assert.throws(() => api.importFromSpreadsheet(ss.getUrl()), /ไฟล์ปัจจุบัน/);
});
