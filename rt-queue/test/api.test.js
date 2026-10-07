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
  hn: '12345', name: 'ทดสอบ ระบบ', technique: 'DIBH', site: 'Lt. breast',
  startDate: '2026-10-11', time: '09:30', fractions: 15, cbct: true,
};

test('validate rejects missing fields and bad values', () => {
  assert.match(validate({ ...sample, hn: '' }).error, /HN/);
  assert.match(validate({ ...sample, technique: 'XYZ' }).error, /เทคนิค/);
  assert.match(validate({ ...sample, technique: 'อื่นๆ' }).error, /อื่นๆ/);
  assert.match(validate({ ...sample, startDate: '2026-02-30' }).error, /วันเริ่มฉาย/);
  assert.match(validate({ ...sample, cbct: undefined }).error, /CBCT/);
  assert.match(validate({ ...sample, fractions: 0 }).error, /จำนวนครั้ง/);
});

test('validate accepts "อื่นๆ" with free text and clears it for named techniques', () => {
  assert.equal(validate({ ...sample, technique: 'อื่นๆ', techniqueOther: 'TBI' }).booking.techniqueOther, 'TBI');
  assert.equal(validate({ ...sample, techniqueOther: 'leftover' }).booking.techniqueOther, '');
});

test('CRUD over the HTTP API', async () => {
  const json = { 'Content-Type': 'application/json' };

  let res = await fetch(`${base}/api/bookings`, { method: 'POST', headers: json, body: JSON.stringify(sample) });
  assert.equal(res.status, 201);
  const created = await res.json();
  assert.ok(created.id);

  res = await fetch(`${base}/api/bookings`, { method: 'POST', headers: json, body: JSON.stringify({ ...sample, cbct: 'yes' }) });
  assert.equal(res.status, 400);

  res = await fetch(`${base}/api/bookings/${created.id}`, {
    method: 'PUT', headers: json, body: JSON.stringify({ ...sample, technique: 'SBRT', cbct: false }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).technique, 'SBRT');

  res = await fetch(`${base}/api/bookings`);
  const list = await res.json();
  assert.equal(list.length, 1);
  assert.equal(list[0].cbct, false);

  res = await fetch(`${base}/api/bookings/${created.id}`, { method: 'DELETE' });
  assert.equal(res.status, 204);
  assert.deepEqual(await (await fetch(`${base}/api/bookings`)).json(), []);
});

test('serves the web UI', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /ระบบนัดคิวเทคนิคพิเศษ/);
});
