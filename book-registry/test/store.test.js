'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../lib/store');

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-'));
  return new Store(path.join(dir, 'registry.json'));
}

const rec = (no, extra = {}) => ({ year: 2569, no, ref: 'สธ 0315.3(2.7.1)', date: '2026-10-01', dateText: '', from: '', to: '', subject: `เรื่อง ${no}`, action: '', note: '', ...extra });

test('ออกเลขต่อจากไฟล์ และข้ามเลขที่ถูกใช้ไปแล้ว', () => {
  const store = tempStore();
  const nos = [...Array.from({ length: 25 }, (_, i) => i + 1), 42, 43];
  store.replaceYears({ 2569: nos.map(n => rec(n)) });
  assert.equal(store.nextNo(2569), 26);

  const created = store.create({ date: '2026-10-08', subject: 'ใหม่', ref: 'สธ 0315.3(2.7.1)' });
  assert.equal(created.no, 26);
  assert.equal(created.year, 2569);

  store.setCounter(2569, 41);
  assert.equal(store.create({ date: '2026-10-08', subject: 'a' }).no, 41);
  assert.equal(store.create({ date: '2026-10-08', subject: 'b' }).no, 44);
});

test('ลบเลขล่าสุดแล้วได้เลขนั้นคืน ส่วนเลขกลางทางไม่ถูกนำกลับมาใช้', () => {
  const store = tempStore();
  const a = store.create({ date: '2026-01-05', subject: 'a' });
  const b = store.create({ date: '2026-01-06', subject: 'b' });
  const c = store.create({ date: '2026-01-07', subject: 'c' });
  assert.deepEqual([a.no, b.no, c.no], [1, 2, 3]);

  store.remove(c.id);
  assert.equal(store.nextNo(2569), 3);
  store.remove(a.id);
  assert.equal(store.nextNo(2569), 3);
});

test('ปีใหม่เริ่มเลข 1 ตามปี พ.ศ. ของวันที่หนังสือ', () => {
  const store = tempStore();
  store.replaceYears({ 2569: [rec(1), rec(2)] });
  const r = store.create({ date: '2027-01-02', subject: 'ปีใหม่' });
  assert.equal(r.year, 2570);
  assert.equal(r.no, 1);
});

test('ตรวจสอบข้อมูลก่อนบันทึก', () => {
  const store = tempStore();
  assert.throws(() => store.create({ date: '2026-02-30', subject: 'x' }), /วันที่/);
  assert.throws(() => store.create({ date: '2026-02-03', subject: '  ' }), /เรื่อง/);
  const a = store.create({ date: '2026-02-03', subject: 'a' });
  store.create({ date: '2026-02-03', subject: 'b' });
  assert.throws(() => store.update(a.id, { no: 2 }), /มีอยู่แล้ว/);
  assert.equal(store.update(a.id, { no: 10, subject: 'แก้แล้ว' }).subject, 'แก้แล้ว');
});

test('บันทึกลงไฟล์แล้วเปิดใหม่ได้ข้อมูลเดิม', () => {
  const store = tempStore();
  store.create({ date: '2026-02-03', subject: 'a' });
  const again = new Store(store.file);
  assert.equal(again.data.records.length, 1);
  assert.equal(again.nextNo(2569), 2);
});
