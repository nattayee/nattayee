import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createGas, renderIndex } from './gas-mock.mjs';

const appt = {
  hn: '0012345', name: 'ทดสอบ GAS', technique: 'VMAT', room: 'L2', startDate: '2026-10-12', fractions: 10,
  time: '09:00', duration: 15, cbctMode: 'custom', cbctDates: ['2026-10-12', '2026-10-19'], status: 'active', age: '',
};

test('ไฟล์ใน apps-script/ ตรงกับต้นฉบับใน public/ (ลืมรัน npm run build:gas?)', () => {
  const before = ['Index.html', 'Schedule.gs'].map((f) => readFileSync(new URL(`../apps-script/${f}`, import.meta.url), 'utf8'));
  execFileSync(process.execPath, [new URL('../tools/build-gas.mjs', import.meta.url).pathname]);
  const after = ['Index.html', 'Schedule.gs'].map((f) => readFileSync(new URL(`../apps-script/${f}`, import.meta.url), 'utf8'));
  assert.deepEqual(after, before);
});

test('setup สร้างแผ่นงานและใส่วันหยุดเริ่มต้น', () => {
  const { call, sheets } = createGas();
  call('setup');
  assert.deepEqual([...sheets.keys()].sort(), ['Appointments', 'Holidays', 'Settings']);
  const state = call('getState');
  assert.equal(state.appointments.length, 0);
  assert.ok(state.settings.holidays.length >= 15);
  assert.deepEqual(state.settings.workdays, [1, 2, 3, 4, 5]);
});

test('โปรเจกต์ Apps Script แบบแยก (ไม่ได้เปิดจาก Sheet): setup สร้าง Sheet ใหม่ครั้งเดียว', () => {
  const { call, sheets, context } = createGas({ bound: false });
  assert.throws(() => call('getState'), /ยังไม่ได้ตั้งค่าระบบ/);
  assert.match(call('setup'), /^https:\/\/docs\.google\.com\/spreadsheets/);
  assert.deepEqual([...sheets.keys()].sort(), ['Appointments', 'Holidays', 'Settings']);
  call('setup'); // รันซ้ำต้องใช้ Sheet เดิม ไม่สร้างใหม่
  assert.equal(context.createdSheets, 1);
  assert.equal(call('getState').appointments.length, 0);
});

test('เพิ่ม แก้ไข ลบ นัดผู้ป่วยใน Sheet', () => {
  const { call, sheets } = createGas();
  call('setup');
  const created = call('createAppointment', appt);
  assert.ok(created.id);
  let [a] = call('getState').appointments;
  assert.equal(a.hn, '0012345', 'HN ต้องไม่เสียเลข 0 นำหน้า');
  assert.equal(a.fractions, 10);
  assert.equal(a.age, '');
  assert.deepEqual(a.cbctDates, ['2026-10-12', '2026-10-19']);
  assert.equal(sheets.get('Appointments').data[1][1], '0012345');

  call('createAppointment', { ...appt, hn: '2', room: 'L1' });
  call('updateAppointment', created.id, { ...appt, room: 'L3', notes: 'แก้ไขแล้ว' });
  a = call('getState').appointments.find((x) => x.id === created.id);
  assert.equal(a.room, 'L3');
  assert.equal(a.notes, 'แก้ไขแล้ว');
  assert.equal(a.createdAt, created.createdAt);

  call('deleteAppointment', created.id);
  const left = call('getState').appointments;
  assert.equal(left.length, 1);
  assert.equal(left[0].hn, '2');
  assert.throws(() => call('deleteAppointment', created.id), /ไม่พบ/);
});

test('ตรวจสอบข้อมูลไม่ถูกต้อง', () => {
  const { call } = createGas();
  call('setup');
  assert.throws(() => call('createAppointment', { ...appt, room: 'L9', fractions: 0 }), /ห้องฉายไม่ถูกต้อง[\s\S]*จำนวนครั้ง/);
});

test('บันทึกการตั้งค่าและนำเข้าไฟล์สำรอง', () => {
  const { call } = createGas();
  call('setup');
  const s = call('getState').settings;
  call('saveSettings', { ...s, workdays: [1, 2, 3, 4, 5, 6], holidays: [{ date: '2026-10-30', name: 'ทดสอบ' }], slotMinutes: 10 });
  let st = call('getState').settings;
  assert.deepEqual(st.workdays, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(st.holidays, [{ date: '2026-10-30', name: 'ทดสอบ' }]);
  assert.equal(st.slotMinutes, 10);

  call('createAppointment', appt);
  const res = call('importAll', { appointments: [{ ...appt, id: 'keep-me' }, { ...appt, hn: '9' }] });
  assert.deepEqual(res.appointments.map((x) => x.hn), ['0012345', '9']);
  assert.equal(res.appointments[0].id, 'keep-me');
  assert.throws(() => call('importAll', { appointments: [{ ...appt, time: 'x' }] }), /รายการที่ 1/);
});

test('doGet ส่งหน้าเว็บไฟล์เดียวที่มีทั้ง CSS และ JS', () => {
  const html = renderIndex();
  assert.doesNotMatch(html, /include\(|href="css\/|src="js\//);
  assert.match(html, /<style>/);
  assert.match(html, /google\?\.script\?\.run/);
});

test('ชื่อจากคำนำหน้า และคอลัมน์ใหม่ใน Sheet เดิมจากเวอร์ชันก่อน', () => {
  const { call, sheets } = createGas();
  call('setup');
  // จำลอง Sheet เวอร์ชันก่อน: ไม่มีคอลัมน์ prefix, firstName, lastName, icd10, site, icd9
  const old = ['id', 'hn', 'name', 'age', 'sex', 'phone', 'diagnosis', 'physician', 'technique', 'room', 'dosePerFx', 'fractions',
    'simDate', 'verifyDate', 'verifyTime', 'startDate', 'time', 'duration', 'cbctMode', 'cbctDates', 'skipDates', 'status', 'notes',
    'createdAt', 'updatedAt'];
  const sh = sheets.get('Appointments');
  sh.data = [old, ['old-1', '55', 'นายเก่า ข้อมูล', '', '', '', 'CA Cervix', '', 'VMAT', 'L1', '', '5', '', '', '', '2026-10-12', '08:00', '15', 'fx1', '', '', 'active', '', '', '']];
  sh.formats = new Map([...Array(26)].flatMap((_, c) => [...Array(5)].map((__, r) => [`${r + 1}:${c + 1}`, '@'])));
  sh.maxColumns = 26;

  assert.equal(call('getState').appointments[0].name, 'นายเก่า ข้อมูล');
  const created = call('createAppointment', {
    ...appt, prefix: 'พระภิกษุ', firstName: 'สมชาย', lastName: 'ใจดี', name: '',
    icd10: 'C11.9', diagnosis: 'C11.9 Malignant neoplasm of nasopharynx, unspecified', site: 'Nasopharynx', icd9: '92.24',
  });
  assert.equal(created.name, 'พระภิกษุ สมชาย ใจดี');
  const a = call('getState').appointments.find((x) => x.id === created.id);
  assert.deepEqual([a.prefix, a.firstName, a.lastName, a.icd10, a.site, a.icd9], ['พระภิกษุ', 'สมชาย', 'ใจดี', 'C11.9', 'Nasopharynx', '92.24']);
  assert.ok(sh.maxColumns >= 31, 'ต้องเพิ่มคอลัมน์ให้พอ');
});

test('รายชื่อแพทย์เริ่มต้นและบันทึกการแก้ไข', () => {
  const { call } = createGas();
  call('setup');
  const s = call('getState').settings;
  assert.deepEqual(s.physicians, ['ทัศน์วรรณ อาษากิจ', 'ศิริรัตน์ เชื้อสำราญ', 'พัฒธิดา มโนรส', 'ทินกร จอมใจ']);
  call('saveSettings', { ...s, physicians: ['ทินกร จอมใจ', 'แพทย์ใหม่', 'แพทย์ใหม่', ''] });
  assert.deepEqual(call('getState').settings.physicians, ['ทินกร จอมใจ', 'แพทย์ใหม่']);
});
