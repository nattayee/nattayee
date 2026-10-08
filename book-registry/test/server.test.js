'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createServer } = require('../server');
const { Store } = require('../lib/store');
const { writeXlsx, readXlsx } = require('../lib/xlsx');

const HEADER = ['เลขทะเบียนส่ง', 'ที่', 'ลงวันที่', 'จาก', 'ถึง', 'เรื่อง', 'การปฏิบัติ', 'หมายเหตุ'];

test('API: นำเข้า Excel → ออกเลขต่อ → ส่งออก Excel', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-'));
  const server = createServer(new Store(path.join(dir, 'registry.json')));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const xlsx = writeXlsx([
    {
      name: '2569',
      header: HEADER,
      rows: [
        [1, 'สธ 0315.3(2.7.1)', '2/10/2569', 'ฟิสิกส์การแพทย์', 'ผู้อำนวยการ', 'ขออนุมัติลาพักผ่อน', 'ก'],
        [2, 'สธ 0315.3(2.7.1)', '6/10/2569', 'ฟิสิกส์การแพทย์', 'ผู้อำนวยการ', 'ขออนุมัติลาพักผ่อน', 'ข'],
        [3],
      ],
    },
  ]);

  let res = await fetch(`${base}/api/import?dryRun=1`, { method: 'POST', body: xlsx });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).years, [{ year: 2569, count: 2, existing: 0 }]);

  res = await fetch(`${base}/api/import`, { method: 'POST', body: xlsx });
  assert.deepEqual((await res.json()).years, [{ year: 2569, count: 2, nextNo: 3 }]);

  res = await fetch(`${base}/api/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: '2026-10-08', ref: 'สธ 0315.3(2.7.1)', to: 'ผู้อำนวยการ', subject: 'ขออนุมัติเดินทางไปราชการ', action: 'ค' }),
  });
  assert.equal(res.status, 201);
  const created = await res.json();
  assert.equal(created.no, 3);

  res = await fetch(`${base}/api/records`, { method: 'POST', body: JSON.stringify({ date: '2026-10-08' }) });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /เรื่อง/);

  res = await fetch(`${base}/api/state`);
  const state = await res.json();
  assert.equal(state.records.length, 3);
  assert.equal(state.nextNo[2569], 4);

  res = await fetch(`${base}/api/export.xlsx`);
  assert.equal(res.status, 200);
  const sheets = readXlsx(Buffer.from(await res.arrayBuffer()));
  assert.deepEqual(sheets[0].rows[0], HEADER);
  assert.deepEqual(sheets[0].rows[3].slice(0, 3), [3, 'สธ 0315.3(2.7.1)', '8/10/2569']);

  res = await fetch(`${base}/index.html`);
  assert.equal(res.status, 200);
  res = await fetch(`${base}/..%2fserver.js`);
  assert.notEqual(res.status, 200);
});
