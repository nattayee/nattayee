const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');
const { countLeaveDays } = require('../src/days');

let server, base;
const year = new Date().getFullYear() + 1; // use next year so dates are always in the future

before(async () => {
  const db = openDb(':memory:');
  server = http.createServer(createApp(db));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function login(email, password = 'password') {
  const res = await fetch(base + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  return async (path, { method = 'GET', body } = {}) => {
    const r = await fetch(base + path, {
      method,
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json() };
  };
}

test('countLeaveDays skips weekends and holidays', () => {
  // 2026-10-19 (Mon) .. 2026-10-25 (Sun), with 23 Oct as a holiday
  assert.equal(countLeaveDays('2026-10-19', '2026-10-25', '', new Set(['2026-10-23'])), 4);
  assert.equal(countLeaveDays('2026-10-24', '2026-10-25', ''), 0);
  assert.equal(countLeaveDays('2026-10-19', '2026-10-19', 'am'), 0.5);
});

test('rejects bad login and unauthenticated access', async () => {
  const res = await fetch(base + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'somsri@example.com', password: 'nope' }),
  });
  assert.equal(res.status, 401);
  assert.equal((await fetch(base + '/api/me')).status, 401);
});

test('non-JSON POST is refused (CSRF guard)', async () => {
  const res = await fetch(base + '/api/login', { method: 'POST', body: 'email=a' });
  assert.equal(res.status, 415);
});

test('full request → approve flow with balances', async () => {
  const emp = await login('somsri@example.com');
  const mgr = await login('manager@example.com');
  const types = (await emp('/api/leave-types')).data;
  const vacation = types.find((t) => t.name === 'ลาพักร้อน');

  // Find a Monday in March next year and request Mon-Fri
  const d = new Date(Date.UTC(year, 2, 1));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  const mon = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 4);
  const fri = d.toISOString().slice(0, 10);

  const created = await emp('/api/requests', {
    method: 'POST',
    body: { leave_type_id: vacation.id, start_date: mon, end_date: fri, reason: 'เที่ยว' },
  });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  assert.equal(created.data.days, 5);
  assert.equal(created.data.status, 'pending');

  // Overlap is refused
  const dup = await emp('/api/requests', {
    method: 'POST',
    body: { leave_type_id: vacation.id, start_date: fri, end_date: fri },
  });
  assert.equal(dup.status, 400);

  // Employee cannot approve
  assert.equal((await emp(`/api/requests/${created.data.id}/decide`, { method: 'POST', body: { action: 'approve' } })).status, 403);

  const pending = (await mgr('/api/approvals')).data;
  assert.ok(pending.some((r) => r.id === created.data.id));

  const approved = await mgr(`/api/requests/${created.data.id}/decide`, { method: 'POST', body: { action: 'approve' } });
  assert.equal(approved.data.status, 'approved');

  const me = (await emp('/api/me?year=' + year)).data;
  const bal = me.balances.find((b) => b.leave_type_id === vacation.id);
  assert.equal(bal.used, 5);
  assert.equal(bal.remaining, vacation.annual_quota - 5);

  // Over-quota request is refused
  const big = await emp('/api/requests', {
    method: 'POST',
    body: { leave_type_id: vacation.id, start_date: `${year}-06-01`, end_date: `${year}-06-30` },
  });
  assert.equal(big.status, 400);
  assert.match(big.data.error, /คงเหลือไม่พอ/);
});

test('half-day morning and afternoon on the same day are allowed', async () => {
  const emp = await login('somsak@example.com');
  const sick = (await emp('/api/leave-types')).data.find((t) => t.name === 'ลาป่วย');
  const d = new Date(Date.UTC(year, 4, 20));
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  const day = d.toISOString().slice(0, 10);
  const am = await emp('/api/requests', { method: 'POST', body: { leave_type_id: sick.id, start_date: day, half_day: 'am' } });
  assert.equal(am.data.days, 0.5);
  const pm = await emp('/api/requests', { method: 'POST', body: { leave_type_id: sick.id, start_date: day, half_day: 'pm' } });
  assert.equal(pm.status, 200);
  const am2 = await emp('/api/requests', { method: 'POST', body: { leave_type_id: sick.id, start_date: day, half_day: 'am' } });
  assert.equal(am2.status, 400);

  const cancelled = await emp(`/api/requests/${am.data.id}/cancel`, { method: 'POST' });
  assert.equal(cancelled.data.status, 'cancelled');
});

test('manager only sees direct reports; admin manages users', async () => {
  const admin = await login('admin@example.com', 'admin1234');
  const mgr = await login('manager@example.com');
  const users = (await admin('/api/users')).data;
  const mgrUser = users.find((u) => u.email === 'manager@example.com');

  const created = await admin('/api/users', {
    method: 'POST',
    body: { name: 'คนใหม่', email: 'new@example.com', password: 'secret123', department: 'HR' },
  });
  assert.equal(created.status, 200);
  assert.equal(created.data.password_hash, undefined);

  const emp = await login('new@example.com', 'secret123');
  const type = (await emp('/api/leave-types')).data[0];
  const r = await emp('/api/requests', {
    method: 'POST',
    body: { leave_type_id: type.id, start_date: `${year}-07-01`, end_date: `${year}-07-01` },
  });
  // No manager assigned → manager cannot see it, admin can
  assert.ok(!(await mgr('/api/approvals')).data.some((x) => x.id === r.data.id));
  assert.ok((await admin('/api/approvals')).data.some((x) => x.id === r.data.id));

  // Assign manager → now visible to manager
  await admin('/api/users/' + created.data.id, {
    method: 'PUT',
    body: { ...created.data, manager_id: mgrUser.id },
  });
  assert.ok((await mgr('/api/approvals')).data.some((x) => x.id === r.data.id));

  // Managers cannot create users
  assert.equal((await mgr('/api/users', { method: 'POST', body: {} })).status, 403);
});

test('static files cannot escape public dir', async () => {
  const res = await fetch(base + '/..%2fpackage.json');
  assert.notEqual(res.status, 200);
  const index = await fetch(base + '/');
  assert.equal(index.status, 200);
});
