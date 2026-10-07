import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

let server, base, dir;

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'rtq-'));
  process.env.DB_FILE = path.join(dir, 'db.json');
  const { start } = await import('../server.mjs');
  server = await start(0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

const appt = {
  hn: '123', name: 'ทดสอบ', technique: 'IMRT', room: 'L3', startDate: '2026-10-12', fractions: 10,
  time: '10:00', duration: 15, cbctMode: 'weekly', status: 'active',
};

test('CRUD นัดผู้ป่วย', async () => {
  let res = await fetch(`${base}/api/appointments`, { method: 'POST', body: JSON.stringify(appt) });
  assert.equal(res.status, 201);
  const created = await res.json();
  assert.ok(created.id);

  res = await fetch(`${base}/api/appointments/${created.id}`, { method: 'PUT', body: JSON.stringify({ ...appt, room: 'L2' }) });
  assert.equal((await res.json()).room, 'L2');

  const state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.appointments.length, 1);
  assert.ok(state.settings.holidays.length > 0);

  res = await fetch(`${base}/api/appointments/${created.id}`, { method: 'DELETE' });
  assert.equal(res.status, 204);
});

test('ปฏิเสธข้อมูลไม่ถูกต้อง', async () => {
  const res = await fetch(`${base}/api/appointments`, { method: 'POST', body: JSON.stringify({ ...appt, room: 'L9', fractions: 0 }) });
  assert.equal(res.status, 400);
  const { errors } = await res.json();
  assert.equal(errors.length, 2);
});

test('ให้บริการหน้าเว็บและกัน path traversal', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /ระบบนัดคิว/);
  const bad = await fetch(`${base}/..%2fserver.mjs`);
  assert.notEqual(bad.status, 200);
});

test('บันทึกนัดได้โดยไม่ระบุเวลานัด แต่เวลาที่ผิดรูปแบบถูกปฏิเสธ', async () => {
  let res = await fetch(`${base}/api/appointments`, { method: 'POST', body: JSON.stringify({ ...appt, time: '' }) });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).time, '');
  res = await fetch(`${base}/api/appointments`, { method: 'POST', body: JSON.stringify({ ...appt, time: '25:00' }) });
  assert.equal(res.status, 400);
});
