// ปุ่ม “ดึงข้อมูลจาก HIS”
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { normalizeHisPatient, ageFromBirthDate } from '../public/js/his.js';
import { createGas, createWorkspace } from './gas-mock.mjs';

const TODAY = '2026-10-07';

test('แปลงข้อมูลรูปแบบมาตรฐาน', () => {
  const p = normalizeHisPatient(
    { ok: true, patient: { hn: '0012345', prefix: 'นาง', firstName: 'มาลี', lastName: 'ใจดี', sex: 'F', birthDate: '1970-10-08', phone: '0812345678', icd10: 'C53.9' } },
    '0012345',
    TODAY,
  );
  assert.deepEqual(p, {
    hn: '0012345', prefix: 'นาง', firstName: 'มาลี', lastName: 'ใจดี', sex: 'หญิง', age: 55, phone: '0812345678', icd10: 'C53.9', diagnosis: '',
  });
});

test('แปลงชื่อฟิลด์แบบ HOSxP (pname/fname/lname, sex 1/2, รหัสโรคไม่มีจุด, ปี พ.ศ.)', () => {
  const p = normalizeHisPatient({ pname: 'นาย', fname: 'สมชาย', lname: 'มีสุข', sex: '1', birthday: '2513-01-01', pdx: 'C119' }, '55', TODAY);
  assert.equal(p.prefix, 'นาย');
  assert.equal(p.sex, 'ชาย');
  assert.equal(p.age, 56);
  assert.equal(p.icd10, 'C11.9');
  assert.equal(p.hn, '55');
  assert.equal(normalizeHisPatient({ pname: 'น.ส.', fname: 'ก' }, '1', TODAY).prefix, 'นางสาว');
  assert.equal(normalizeHisPatient({ pname: 'ดญ.', fname: 'ข' }, '1', TODAY).prefix, 'ด.ญ.');
  assert.equal(normalizeHisPatient({ pname: 'ร.ต.อ.', fname: 'ค' }, '1', TODAY).prefix, 'ร.ต.อ.');
});

test('อายุนับวันเกิดถูกต้อง และข้อมูลที่ไม่มีชื่อถูกปฏิเสธ', () => {
  assert.equal(ageFromBirthDate('1980-10-07', TODAY), 46);
  assert.equal(ageFromBirthDate('1980-10-08', TODAY), 45);
  assert.equal(ageFromBirthDate('', TODAY), '');
  assert.throws(() => normalizeHisPatient({ ok: true, patient: { hn: '1' } }, '1', TODAY), /ไม่ได้ส่งชื่อ/);
});

const HIS_DB = { '0012345': { prefix: 'นาง', firstName: 'มาลี', lastName: 'ใจดี', sex: '2', birthDate: '1970-01-01' } };

test('Apps Script: ยังไม่ได้ตั้งค่า HIS แจ้งผู้ใช้ให้ชัดเจน', () => {
  const ws = createWorkspace();
  const { call } = createGas({ workspace: ws });
  call('setup');
  const t = call('login', 'rtt1', 'rtt-pass1').token;
  assert.throws(() => call('hisLookup', t, '0012345'), /ยังไม่ได้เชื่อมต่อระบบ HIS/);
});

test('Apps Script: ค้น HN ผ่าน API ของ HIS ส่ง API key และบันทึกผู้ค้นหา', () => {
  const ws = createWorkspace();
  const seen = [];
  const his = ({ hn, apiKey }) => {
    seen.push(apiKey);
    if (apiKey !== 'secret-key') return { code: 401, body: { ok: false, error: 'unauthorized' } };
    return HIS_DB[hn] ? { code: 200, body: { ok: true, patient: { hn, ...HIS_DB[hn] } } } : { code: 404, body: { ok: false, error: `ไม่พบ HN ${hn}` } };
  };
  const { call, context, sheets } = createGas({ workspace: ws, his });
  call('setup');
  context.HIS_API_URL = 'https://his.test/patient';
  context.PropertiesService.getScriptProperties().setProperty('HIS_API_KEY', 'secret-key');
  assert.throws(() => call('hisLookup', null, '0012345'), /session_expired/, 'ต้องเข้าสู่ระบบก่อน');
  const t = call('login', 'rtt1', 'rtt-pass1').token;
  const p = call('hisLookup', t, '0012345');
  assert.equal(p.firstName, 'มาลี');
  assert.equal(p.sex, 'หญิง');
  assert.throws(() => call('hisLookup', t, '999'), /ไม่พบ HN 999/);
  assert.deepEqual(seen, ['secret-key', 'secret-key']);
  const log = sheets.get('HisLog').data;
  assert.equal(log.length, 3);
  assert.equal(log[1][1], 'นักรังสี หนึ่ง (rtt1)');
  assert.deepEqual([log[1][2], log[1][3]], ['0012345', 'พบ']);
  assert.match(log[2][3], /ไม่พบ/);
  context.PropertiesService.getScriptProperties().setProperty('HIS_API_KEY', 'wrong');
  assert.throws(() => call('hisLookup', t, '0012345'), /HIS_API_KEY/);
});

test('เซิร์ฟเวอร์ Node: /api/his เรียก API ของ HIS ภายในโรงพยาบาล', async () => {
  const fake = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const hn = u.searchParams.get('hn');
    const ok = req.headers['x-api-key'] === 'k1' && HIS_DB[hn];
    res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(ok ? { ok: true, patient: { hn, ...HIS_DB[hn] } } : { ok: false, error: `ไม่พบ HN ${hn}` }));
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  const dir = await mkdtemp(path.join(tmpdir(), 'rtq-his-'));
  process.env.DB_FILE = path.join(dir, 'db.json');
  process.env.HIS_API_URL = `http://127.0.0.1:${fake.address().port}/patient`;
  process.env.HIS_API_KEY = 'k1';
  const { start } = await import(`../server.mjs?his=${Date.now()}`);
  const server = await start(0, '127.0.0.1');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let res = await fetch(`${base}/api/his?hn=0012345`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).lastName, 'ใจดี');
    res = await fetch(`${base}/api/his?hn=nope`);
    assert.equal(res.status, 404);
    assert.match((await res.json()).errors[0], /ไม่พบ HN nope/);
  } finally {
    server.close();
    fake.close();
    await rm(dir, { recursive: true, force: true });
  }
});
