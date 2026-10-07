'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-queue-'));
const { server, validate } = require('../server');

let base;
before(() => new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
  base = `http://127.0.0.1:${server.address().port}`;
  resolve();
})));
after(() => {
  server.close();
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

const sample = {
  hn: '012345', name: 'ทดสอบ ระบบ', technique: 'DIBH', site: 'Lt. breast',
  fractions: 3, time: '09:30', duration: 15, physician: 'ทินกร จอมใจ',
  treatmentDates: ['2026-10-08', '2026-10-09', '2026-10-12'],
  cbctPattern: 'first3_weekly', cbctDates: ['2026-10-08', '2026-10-09', '2026-10-12'],
  skipDates: [], verifyDate: '2026-10-07', verifyTime: '14:00',
};

test('validate rejects missing fields and bad values', () => {
  assert.match(validate({ ...sample, hn: '' }).error, /HN/);
  assert.match(validate({ ...sample, technique: 'XYZ' }).error, /เทคนิค/);
  assert.match(validate({ ...sample, technique: 'อื่นๆ' }).error, /อื่นๆ/);
  assert.match(validate({ ...sample, fractions: 0 }).error, /จำนวนครั้ง/);
  assert.match(validate({ ...sample, physician: '' }).error, /แพทย์ผู้สั่ง/);
  assert.match(validate({ ...sample, physician: 'นพ.ไม่มีในรายชื่อ' }).error, /แพทย์ผู้สั่ง/);
  assert.match(validate({ ...sample, treatmentDates: [] }).error, /วันเริ่มฉาย/);
  assert.match(validate({ ...sample, fractions: 4 }).error, /ไม่ตรงกับจำนวนครั้ง/);
  assert.match(validate({ ...sample, treatmentDates: ['2026-10-09', '2026-10-08', '2026-10-12'] }).error, /เรียง/);
  assert.match(validate({ ...sample, treatmentDates: ['2026-02-30', '2026-10-09', '2026-10-12'] }).error, /วันเริ่มฉาย/);
  assert.match(validate({ ...sample, cbctDates: ['2026-10-10'] }).error, /CBCT ต้องเป็นวันฉาย/);
  assert.match(validate({ ...sample, cbctPattern: 'sometimes' }).error, /รูปแบบ CBCT/);
  assert.match(validate({ ...sample, duration: 2 }).error, /ระยะเวลา/);
  assert.match(validate({ ...sample, verifyDate: '' }).error, /วันนัดทำ CBCT/);
});

test('validate derives start/end dates and the CBCT flag', () => {
  const { booking } = validate(sample);
  assert.equal(booking.startDate, '2026-10-08');
  assert.equal(booking.endDate, '2026-10-12');
  assert.equal(booking.cbct, true);
  const none = validate({ ...sample, cbctPattern: 'none', cbctDates: [], verifyDate: '', verifyTime: '' }).booking;
  assert.equal(none.cbct, false);
  assert.equal(validate({ ...sample, technique: 'อื่นๆ', techniqueOther: 'TBI' }).booking.techniqueOther, 'TBI');
  assert.equal(validate({ ...sample, techniqueOther: 'leftover' }).booking.techniqueOther, '');
});

test('CRUD over the HTTP API', async () => {
  const json = { 'Content-Type': 'application/json' };

  let res = await fetch(`${base}/api/bookings`, { method: 'POST', headers: json, body: JSON.stringify(sample) });
  assert.equal(res.status, 201);
  const created = await res.json();
  assert.ok(created.id);
  assert.equal(created.hn, '012345');

  res = await fetch(`${base}/api/bookings`, { method: 'POST', headers: json, body: JSON.stringify({ ...sample, fractions: 'x' }) });
  assert.equal(res.status, 400);

  res = await fetch(`${base}/api/bookings/${created.id}`, {
    method: 'PUT', headers: json,
    body: JSON.stringify({ ...sample, technique: 'SBRT', skipDates: ['2026-10-08'], treatmentDates: ['2026-10-09', '2026-10-12', '2026-10-14'], cbctDates: ['2026-10-09'], cbctPattern: 'custom' }),
  });
  assert.equal(res.status, 200);
  const updated = await res.json();
  assert.equal(updated.technique, 'SBRT');
  assert.equal(updated.startDate, '2026-10-09');
  assert.equal(updated.endDate, '2026-10-14');

  const list = await (await fetch(`${base}/api/bookings`)).json();
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].skipDates, ['2026-10-08']);

  res = await fetch(`${base}/api/bookings/${created.id}`, { method: 'DELETE' });
  assert.equal(res.status, 204);
  assert.deepEqual(await (await fetch(`${base}/api/bookings`)).json(), []);
});

test('serves holidays (Thai public holidays incl. substitution days)', async () => {
  const holidays = await (await fetch(`${base}/api/holidays`)).json();
  const dates = holidays.map(h => h.date);
  for (const d of ['2026-10-13', '2026-10-23', '2026-06-01', '2026-12-07']) assert.ok(dates.includes(d), d);
});

test('serves the web UI', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /ระบบนัดคิวเทคนิคพิเศษ/);
});
