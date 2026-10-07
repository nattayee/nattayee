// การเข้าสู่ระบบด้วยบัญชี LPCH RO Workspace (Apps Script)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGas, createWorkspace } from './gas-mock.mjs';

const appt = {
  quota: '1',
  hn: '1', firstName: 'ทดสอบ', technique: 'VMAT', room: 'L1', startDate: '2026-10-12', fractions: 5,
  time: '09:00', duration: 15, cbctMode: 'fx1', status: 'active',
};

function setup() {
  const ws = createWorkspace();
  const gas = createGas({ workspace: ws });
  gas.call('setup');
  return { ws, ...gas };
}

test('ยังไม่เข้าสู่ระบบ: getState ตอบ needLogin (ไม่ส่งข้อมูล) คำสั่งอื่นตอบ session_expired', () => {
  const { call, context } = setup();
  for (const t of [null, 'fake-token']) {
    const st = call('getState', t);
    assert.deepEqual(Object.keys(st).sort(), ['needLogin', 'version']);
    assert.equal(st.needLogin, true);
    assert.equal(st.version, context.APP_VERSION);
  }
  assert.throws(() => call('createAppointment', null, appt), /session_expired/);
  assert.throws(() => call('saveSettings', null, {}), /session_expired/);
});

test('รุ่นของ Code.gs ตรงกับ Index.html', async () => {
  const { readFileSync } = await import('node:fs');
  const code = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
  const index = readFileSync(new URL('../apps-script/Index.html', import.meta.url), 'utf8');
  const v = /^var APP_VERSION = '([0-9a-f]{8})';$/m.exec(code)?.[1];
  assert.ok(v, 'Code.gs ต้องมีรุ่นที่สร้างโดย npm run build:gas');
  assert.ok(index.includes(`window.RTQ_CLIENT_VERSION = '${v}'`));
});

test('เข้าสู่ระบบด้วยรหัสผ่าน Workspace แล้วบันทึกชื่อผู้นัด', () => {
  const { call } = setup();
  assert.throws(() => call('login', 'rtt1', 'wrong'), /ไม่ถูกต้อง/);
  const { token, user } = call('login', 'rtt1', 'rtt-pass1');
  assert.deepEqual(user, { username: 'rtt1', fullName: 'นักรังสี หนึ่ง', role: 'RTT', isAdmin: false });
  const state = call('getState', token);
  assert.equal(state.me.username, 'rtt1');
  const a = call('createAppointment', token, appt);
  assert.equal(a.createdBy, 'นักรังสี หนึ่ง');
  const b = call('updateAppointment', token, a.id, { ...appt, notes: 'แก้' });
  assert.equal(b.updatedBy, 'นักรังสี หนึ่ง');
  assert.equal(call('getState', token).appointments[0].createdBy, 'นักรังสี หนึ่ง');
});

test('ผู้ใช้ทั่วไปแก้ตั้งค่า ลบนัด หรือนำเข้าข้อมูลไม่ได้ ผู้ดูแลระบบทำได้', () => {
  const { call } = setup();
  const staff = call('login', 'rtt1', 'rtt-pass1').token;
  const admin = call('login', 'admin', 'admin-pass').token;
  const a = call('createAppointment', staff, appt);
  const s = call('getState', staff).settings;
  assert.throws(() => call('saveSettings', staff, s), /เฉพาะผู้ดูแลระบบ/);
  assert.throws(() => call('deleteAppointment', staff, a.id), /เฉพาะผู้ดูแลระบบ/);
  assert.throws(() => call('importAll', staff, { appointments: [] }), /เฉพาะผู้ดูแลระบบ/);
  call('saveSettings', admin, { ...s, slotMinutes: 10 });
  call('deleteAppointment', admin, a.id);
  assert.equal(call('getState', admin).appointments.length, 0);
});

test('บัตรผ่านจากปุ่มใน Workspace ใช้ได้ครั้งเดียว', () => {
  const { call, ws } = setup();
  const ticket = ws.ticketFor('admin');
  const { token, user } = call('ssoLogin', ticket);
  assert.equal(user.isAdmin, true);
  assert.ok(call('getState', token));
  assert.throws(() => call('ssoLogin', ticket), /หมดอายุหรือถูกใช้ไปแล้ว/);
});

test('doGet ส่งบัตรผ่านจาก ?sso= ให้หน้าเว็บ และกรองอักขระแปลกปลอม', () => {
  const { context } = setup();
  const html = context.doGet({ parameter: { sso: 'abc123</script><b>' } }).getContent();
  const m = /window\.RTQ_CONFIG = (\{.*?\});<\/script>/.exec(html);
  assert.ok(m, 'ต้องมี RTQ_CONFIG ก่อน </head>');
  const cfg = JSON.parse(m[1]);
  assert.equal(cfg.auth, true);
  assert.equal(cfg.sso, 'abc123cb');
  assert.ok(html.indexOf('RTQ_CONFIG') < html.indexOf('</head>'));
});

test('ออกจากระบบ และบัญชีที่ถูกระงับใน Workspace ถูกออกจากระบบเมื่อถึงรอบตรวจ', () => {
  const { call, ws, cache } = setup();
  const t1 = call('login', 'rtt1', 'rtt-pass1').token;
  call('logout', t1);
  assert.equal(call('getState', t1).needLogin, true);

  const t2 = call('login', 'rtt1', 'rtt-pass1').token;
  ws.users.rtt1.status = 'disabled';
  assert.ok(call('getState', t2), 'ก่อนถึงรอบตรวจยังใช้งานได้');
  for (const [k, v] of cache) {
    const s = JSON.parse(v);
    if (k.startsWith('rtq_s_')) cache.set(k, JSON.stringify({ ...s, checked: Date.now() - 16 * 60000 }));
  }
  assert.equal(call('getState', t2).needLogin, true);
});

test('รอบตรวจกับ Workspace อัปเดตสิทธิ์ผู้ดูแลระบบ', () => {
  const { call, ws, cache } = setup();
  const t = call('login', 'rtt1', 'rtt-pass1').token;
  ws.users.rtt1.isAdmin = true;
  for (const [k, v] of cache) if (k.startsWith('rtq_s_')) cache.set(k, JSON.stringify({ ...JSON.parse(v), checked: 0 }));
  assert.equal(call('getState', t).me.isAdmin, true);
});

test('จำกัดตำแหน่งที่เข้าใช้ได้ (ALLOWED_ROLES)', () => {
  const { call, context } = setup();
  context.ALLOWED_ROLES = ['RO', 'MP', 'RTT', 'Nurse'];
  assert.throws(() => call('login', 'other1', 'other-pass'), /ยังไม่ได้รับสิทธิ์/);
  assert.ok(call('login', 'rtt1', 'rtt-pass1').token);
});
