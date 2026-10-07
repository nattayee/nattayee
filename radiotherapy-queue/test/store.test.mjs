import { test } from 'node:test';
import assert from 'node:assert/strict';

test('โหมดออฟไลน์: บันทึกนัดหนึ่งครั้งได้หนึ่งรายการ', async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  globalThis.location = { protocol: 'file:' };
  const { openStore } = await import('../public/js/store.js');
  const { store, data } = await openStore();
  assert.equal(store.mode, 'local');
  const appts = data.appointments;
  // หน้าเว็บทำแบบนี้หลังบันทึก: เอารายการที่ได้กลับมาใส่ในรายการของตัวเอง
  appts.push(await store.create({ hn: '1', name: 'ก' }));
  appts.push(await store.create({ hn: '2', name: 'ข' }));
  assert.equal(appts.length, 2);
  assert.equal(JSON.parse(mem.get('rt-queue-db-v1')).appointments.length, 2);
  assert.equal((await store.load()).appointments.length, 2);
});

test('ตัดคำนำหน้าข้อความผิดพลาดของ Apps Script', async () => {
  const { gasErrorMessage } = await import('../public/js/store.js');
  assert.equal(gasErrorMessage(new Error('Error: session_expired')), 'session_expired');
  assert.equal(gasErrorMessage({ message: 'Exception: ไม่พบข้อมูลนัด' }), 'ไม่พบข้อมูลนัด');
  assert.equal(gasErrorMessage(new Error('ScriptError: x')), 'x');
  assert.equal(gasErrorMessage(new Error('session_expired')), 'session_expired');
});
