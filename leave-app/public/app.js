'use strict';

// ---------- utilities ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body !== undefined || method !== 'GET' ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : method !== 'GET' ? '{}' : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/login') {
    state.me = null;
    render();
  }
  if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
  return data;
}

let toastTimer;
function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (isError ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), 3000);
}

const fmtDate = (s) =>
  new Date(s + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtRange = (r) => {
  const half = r.half_day === 'am' ? ' (ครึ่งเช้า)' : r.half_day === 'pm' ? ' (ครึ่งบ่าย)' : '';
  return r.start_date === r.end_date ? fmtDate(r.start_date) + half : `${fmtDate(r.start_date)} – ${fmtDate(r.end_date)}`;
};
const fmtDays = (n) => (Number.isInteger(n) ? n : n.toFixed(1)) + ' วัน';
const STATUS = { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิก' };
const ROLE = { employee: 'พนักงาน', manager: 'หัวหน้างาน', admin: 'ผู้ดูแลระบบ' };
const statusBadge = (s) => `<span class="status ${s}">${STATUS[s]}</span>`;
const typeLabel = (r) => `<span class="dot" style="--c:${esc(r.type_color)}"></span>${esc(r.type_name)}`;
const thisYear = new Date().getFullYear();
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const yearOptions = (sel) =>
  [thisYear - 2, thisYear - 1, thisYear, thisYear + 1]
    .map((y) => `<option value="${y}" ${y === sel ? 'selected' : ''}>${y + 543}</option>`)
    .join('');

// ---------- state & routing ----------
const state = { me: null, year: thisYear };
const isApprover = () => ['manager', 'admin'].includes(state.me?.user.role);
const isAdmin = () => state.me?.user.role === 'admin';

const pages = {
  '': { title: 'ภาพรวม', render: pageDashboard },
  new: { title: 'ยื่นใบลา', render: pageNewRequest },
  my: { title: 'ประวัติการลา', render: pageMyRequests },
  calendar: { title: 'ปฏิทินการลา', render: pageCalendar },
  approvals: { title: 'อนุมัติการลา', render: pageApprovals, when: isApprover },
  reports: { title: 'รายงาน', render: pageReports, when: isApprover },
  admin: { title: 'ตั้งค่าระบบ', render: pageAdmin, when: isAdmin },
  profile: { title: 'บัญชีของฉัน', render: pageProfile, hidden: true },
};

window.addEventListener('hashchange', render);

async function refreshMe() {
  try {
    state.me = await api('/api/me?year=' + thisYear);
  } catch {
    state.me = null;
  }
}

async function render() {
  const app = $('#app');
  if (!state.me) return renderLogin(app);
  const key = location.hash.replace(/^#\/?/, '').split('?')[0];
  const page = pages[key] && (!pages[key].when || pages[key].when()) ? pages[key] : pages[''];
  const u = state.me.user;
  app.innerHTML = `
    <header class="topbar">
      <div class="brand">🗓️ ระบบจัดการวันลา</div>
      <nav class="nav">
        ${Object.entries(pages)
          .filter(([, p]) => !p.hidden && (!p.when || p.when()))
          .map(
            ([k, p]) =>
              `<a href="#/${k}" class="${p === page ? 'active' : ''}">${p.title}${
                k === 'approvals' && state.me.pendingApprovals ? `<span class="badge">${state.me.pendingApprovals}</span>` : ''
              }</a>`
          )
          .join('')}
      </nav>
      <div class="userbox">
        <a href="#/profile" title="บัญชีของฉัน">👤 <span>${esc(u.name)} · ${ROLE[u.role]}</span></a>
        <button class="btn small" id="logout">ออกจากระบบ</button>
      </div>
    </header>
    <main id="main"><p class="empty">กำลังโหลด…</p></main>`;
  $('#logout').onclick = async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    state.me = null;
    location.hash = '';
    render();
  };
  document.title = `${page.title} · ระบบจัดการวันลา`;
  try {
    await page.render($('#main'));
  } catch (e) {
    $('#main').innerHTML = `<div class="card error">${esc(e.message)}</div>`;
  }
}

// ---------- login ----------
function renderLogin(app) {
  document.title = 'เข้าสู่ระบบ · ระบบจัดการวันลา';
  app.innerHTML = `
    <div class="card login">
      <h1>🗓️ ระบบจัดการวันลา</h1>
      <form id="login-form">
        <div class="field"><label for="email">อีเมล</label><input id="email" type="email" required autocomplete="username"></div>
        <div class="field"><label for="password">รหัสผ่าน</label><input id="password" type="password" required autocomplete="current-password"></div>
        <div class="error" id="login-error"></div>
        <button class="btn primary" style="width:100%">เข้าสู่ระบบ</button>
      </form>
      <div class="demo">
        บัญชีทดลอง (คลิกเพื่อกรอก):<br>
        ผู้ดูแล: <code data-u="admin@example.com" data-p="admin1234">admin@example.com / admin1234</code><br>
        หัวหน้า: <code data-u="manager@example.com" data-p="password">manager@example.com / password</code><br>
        พนักงาน: <code data-u="somsri@example.com" data-p="password">somsri@example.com / password</code>
      </div>
    </div>`;
  app.querySelectorAll('.demo code').forEach((c) => {
    c.onclick = () => {
      $('#email').value = c.dataset.u;
      $('#password').value = c.dataset.p;
    };
  });
  $('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/login', { method: 'POST', body: { email: $('#email').value, password: $('#password').value } });
      await refreshMe();
      render();
    } catch (err) {
      $('#login-error').textContent = err.message;
    }
  };
}

// ---------- dashboard ----------
async function pageDashboard(main) {
  const [me, mine] = await Promise.all([
    api('/api/me?year=' + state.year),
    api('/api/requests/mine?year=' + state.year),
  ]);
  state.me.pendingApprovals = me.pendingApprovals;
  const today = todayStr();
  const upcoming = mine.filter((r) => ['pending', 'approved'].includes(r.status) && r.end_date >= today).reverse();
  main.innerHTML = `
    <div class="spread">
      <h1>สวัสดี ${esc(me.user.name)}</h1>
      <div class="actions">
        <select id="year" aria-label="ปี" style="width:auto">${yearOptions(state.year)}</select>
        <a class="btn primary" href="#/new" style="text-decoration:none">+ ยื่นใบลา</a>
      </div>
    </div>
    ${
      me.pendingApprovals
        ? `<div class="card" style="border-color:var(--warning)">มีใบลารอคุณอนุมัติ <b>${me.pendingApprovals}</b> รายการ — <a href="#/approvals">ไปที่หน้าอนุมัติ</a></div>`
        : ''
    }
    <h2>วันลาคงเหลือ ปี ${state.year + 543}</h2>
    <div class="grid" style="margin-bottom:20px">
      ${me.balances
        .map((b) => {
          const pct = (v) => (b.quota ? Math.min(100, (v / b.quota) * 100) : 0);
          return `<div class="card tile" style="--c:${esc(b.color)};margin:0">
            <div class="label">${esc(b.name)}</div>
            <div class="big">${b.remaining}<span class="sub"> / ${b.quota} วัน</span></div>
            <div class="sub">ใช้ไป ${b.used} วัน${b.pending ? ` · รออนุมัติ ${b.pending} วัน` : ''}</div>
            <div class="bar"><span style="width:${pct(b.used)}%;background:${esc(b.color)}"></span><span style="width:${pct(
              b.pending
            )}%;background:${esc(b.color)};opacity:.4"></span></div>
          </div>`;
        })
        .join('')}
    </div>
    <div class="card">
      <h2>ใบลาที่กำลังจะถึง</h2>
      ${requestTable(upcoming, { cancel: true })}
    </div>`;
  $('#year').onchange = (e) => {
    state.year = Number(e.target.value);
    render();
  };
  bindCancel(main);
}

function requestTable(rows, { cancel = false, showUser = false } = {}) {
  if (!rows.length) return '<p class="empty">ไม่มีรายการ</p>';
  const today = todayStr();
  return `<div class="table-wrap"><table>
    <thead><tr>${showUser ? '<th>พนักงาน</th>' : ''}<th>ประเภท</th><th>วันที่</th><th>จำนวน</th><th>เหตุผล</th><th>สถานะ</th>${
      cancel ? '<th></th>' : ''
    }</tr></thead>
    <tbody>${rows
      .map(
        (r) => `<tr>
        ${showUser ? `<td>${esc(r.user_name)}<div class="hint">${esc(r.department)}</div></td>` : ''}
        <td>${typeLabel(r)}</td>
        <td>${fmtRange(r)}</td>
        <td>${fmtDays(r.days)}</td>
        <td>${esc(r.reason) || '<span class="hint">-</span>'}${
          r.decision_note ? `<div class="hint">หมายเหตุผู้อนุมัติ: ${esc(r.decision_note)}</div>` : ''
        }</td>
        <td>${statusBadge(r.status)}${r.approver_name ? `<div class="hint">โดย ${esc(r.approver_name)}</div>` : ''}</td>
        ${
          cancel
            ? `<td>${
                r.status === 'pending' || (r.status === 'approved' && r.start_date > today)
                  ? `<button class="btn small danger" data-cancel="${r.id}">ยกเลิก</button>`
                  : ''
              }</td>`
            : ''
        }
      </tr>`
      )
      .join('')}</tbody></table></div>`;
}

function bindCancel(root) {
  root.querySelectorAll('[data-cancel]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('ต้องการยกเลิกใบลานี้หรือไม่?')) return;
      try {
        await api(`/api/requests/${b.dataset.cancel}/cancel`, { method: 'POST' });
        toast('ยกเลิกใบลาแล้ว');
        render();
      } catch (e) {
        toast(e.message, true);
      }
    };
  });
}

// ---------- new request ----------
async function pageNewRequest(main) {
  const [types, me] = await Promise.all([api('/api/leave-types'), api('/api/me?year=' + thisYear)]);
  const today = todayStr();
  main.innerHTML = `
    <div class="card" style="max-width:640px">
      <h1>ยื่นใบลา</h1>
      <form id="req-form">
        <div class="field"><label for="type">ประเภทการลา</label>
          <select id="type" required>${types
            .map((t) => {
              const b = me.balances.find((x) => x.leave_type_id === t.id);
              return `<option value="${t.id}">${esc(t.name)} (คงเหลือ ${b ? b.remaining : t.annual_quota} วัน)</option>`;
            })
            .join('')}</select>
        </div>
        <div class="row">
          <div class="field"><label for="start">วันที่เริ่ม</label><input id="start" type="date" required value="${today}"></div>
          <div class="field"><label for="end">ถึงวันที่</label><input id="end" type="date" required value="${today}"></div>
        </div>
        <div class="field"><label for="half">ช่วงเวลา</label>
          <select id="half">
            <option value="">เต็มวัน</option>
            <option value="am">ครึ่งวันเช้า</option>
            <option value="pm">ครึ่งวันบ่าย</option>
          </select>
          <div class="hint">ลาครึ่งวันได้เฉพาะการลาวันเดียว</div>
        </div>
        <div class="field"><label for="reason">เหตุผล</label><textarea id="reason" maxlength="1000" placeholder="ระบุเหตุผลการลา"></textarea></div>
        <p id="preview" class="hint"></p>
        <div class="error" id="req-error"></div>
        <button class="btn primary">ส่งใบลา</button>
        <a class="btn" href="#/" style="text-decoration:none">ยกเลิก</a>
      </form>
    </div>`;

  const start = $('#start'), end = $('#end'), half = $('#half');
  let seq = 0;
  async function preview() {
    if (end.value < start.value) end.value = start.value;
    half.disabled = start.value !== end.value;
    if (half.disabled) half.value = '';
    const my = ++seq;
    try {
      const r = await api('/api/requests/preview', {
        method: 'POST',
        body: { start_date: start.value, end_date: end.value, half_day: half.value },
      });
      if (my === seq) $('#preview').innerHTML = `จำนวนวันลา (ไม่นับเสาร์-อาทิตย์และวันหยุด): <b>${fmtDays(r.days)}</b>`;
    } catch (e) {
      if (my === seq) $('#preview').textContent = e.message;
    }
  }
  [start, end, half].forEach((el) => (el.onchange = preview));
  preview();

  $('#req-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/requests', {
        method: 'POST',
        body: {
          leave_type_id: Number($('#type').value),
          start_date: start.value,
          end_date: end.value,
          half_day: half.value,
          reason: $('#reason').value,
        },
      });
      toast('ส่งใบลาเรียบร้อย รอหัวหน้าอนุมัติ');
      location.hash = '#/my';
    } catch (err) {
      $('#req-error').textContent = err.message;
    }
  };
}

// ---------- my requests ----------
async function pageMyRequests(main) {
  const rows = await api('/api/requests/mine?year=' + state.year);
  main.innerHTML = `
    <div class="card">
      <div class="spread">
        <h1>ประวัติการลา</h1>
        <select id="year" aria-label="ปี" style="width:auto">${yearOptions(state.year)}</select>
      </div>
      ${requestTable(rows, { cancel: true })}
    </div>`;
  $('#year').onchange = (e) => {
    state.year = Number(e.target.value);
    render();
  };
  bindCancel(main);
}

// ---------- approvals ----------
let approvalTab = 'pending';
async function pageApprovals(main) {
  const rows = await api('/api/approvals?status=' + approvalTab);
  if (approvalTab === 'pending') state.me.pendingApprovals = rows.length;
  main.innerHTML = `
    <div class="card">
      <h1>อนุมัติการลา</h1>
      <div class="tabs">${['pending', 'approved', 'rejected', 'cancelled']
        .map((s) => `<button data-tab="${s}" class="${s === approvalTab ? 'active' : ''}">${STATUS[s]}</button>`)
        .join('')}</div>
      ${
        !rows.length
          ? '<p class="empty">ไม่มีรายการ</p>'
          : `<div class="table-wrap"><table>
        <thead><tr><th>พนักงาน</th><th>ประเภท</th><th>วันที่</th><th>จำนวน</th><th>เหตุผล</th><th>${
          approvalTab === 'pending' ? '' : 'สถานะ'
        }</th></tr></thead>
        <tbody>${rows
          .map(
            (r) => `<tr>
            <td>${esc(r.user_name)}<div class="hint">${esc(r.department)}</div></td>
            <td>${typeLabel(r)}</td>
            <td>${fmtRange(r)}<div class="hint">ยื่นเมื่อ ${fmtDate(r.created_at.slice(0, 10))}</div></td>
            <td>${fmtDays(r.days)}</td>
            <td>${esc(r.reason) || '<span class="hint">-</span>'}${
              r.decision_note ? `<div class="hint">หมายเหตุ: ${esc(r.decision_note)}</div>` : ''
            }</td>
            <td>${
              r.status === 'pending'
                ? `<div class="actions"><button class="btn small success" data-approve="${r.id}">อนุมัติ</button>
                   <button class="btn small danger" data-reject="${r.id}">ไม่อนุมัติ</button></div>`
                : statusBadge(r.status) + (r.approver_name ? `<div class="hint">โดย ${esc(r.approver_name)}</div>` : '')
            }</td>
          </tr>`
          )
          .join('')}</tbody></table></div>`
      }
    </div>`;
  main.querySelectorAll('[data-tab]').forEach((b) => {
    b.onclick = () => {
      approvalTab = b.dataset.tab;
      render();
    };
  });
  const decide = async (id, action) => {
    let note = '';
    if (action === 'reject') {
      note = prompt('ระบุเหตุผลที่ไม่อนุมัติ (ไม่บังคับ)');
      if (note === null) return;
    }
    try {
      await api(`/api/requests/${id}/decide`, { method: 'POST', body: { action, note } });
      toast(action === 'approve' ? 'อนุมัติแล้ว' : 'ไม่อนุมัติใบลาแล้ว');
      render();
    } catch (e) {
      toast(e.message, true);
    }
  };
  main.querySelectorAll('[data-approve]').forEach((b) => (b.onclick = () => decide(b.dataset.approve, 'approve')));
  main.querySelectorAll('[data-reject]').forEach((b) => (b.onclick = () => decide(b.dataset.reject, 'reject')));
}

// ---------- calendar ----------
let calMonth = todayStr().slice(0, 7);
async function pageCalendar(main) {
  const data = await api('/api/calendar?month=' + calMonth);
  const [y, m] = calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const offset = first.getDay();
  const today = todayStr();
  const hol = Object.fromEntries(data.holidays.map((h) => [h.date, h.name]));
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push('<div class="day out"></div>');
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${calMonth}-${String(d).padStart(2, '0')}`;
    const dow = new Date(y, m - 1, d).getDay();
    const evs = data.requests.filter((r) => r.start_date <= ds && r.end_date >= ds && dow !== 0 && dow !== 6 && !hol[ds]);
    cells.push(`<div class="day ${dow === 0 || dow === 6 ? 'weekend' : ''} ${hol[ds] ? 'holiday' : ''} ${ds === today ? 'today' : ''}">
      <div class="num">${d}</div>
      ${hol[ds] ? `<div class="hol">${esc(hol[ds])}</div>` : ''}
      ${evs
        .map(
          (r) =>
            `<span class="ev ${r.status}" style="--c:${esc(r.type_color)}" title="${esc(r.user_name)} – ${esc(r.type_name)} (${
              STATUS[r.status]
            })">${esc(r.user_name)}${r.half_day ? ' ½' : ''}</span>`
        )
        .join('')}
    </div>`);
  }
  const monthName = first.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  main.innerHTML = `
    <div class="card">
      <div class="spread">
        <h1>ปฏิทินการลา · ${monthName}</h1>
        <div class="actions">
          <button class="btn" id="prev">‹ เดือนก่อน</button>
          <button class="btn" id="cur">เดือนนี้</button>
          <button class="btn" id="next">เดือนถัดไป ›</button>
        </div>
      </div>
      <div class="cal">
        ${['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((d) => `<div class="dow">${d}</div>`).join('')}
        ${cells.join('')}
      </div>
      <p class="hint">แถบสีจาง = รออนุมัติ · ½ = ลาครึ่งวัน</p>
    </div>`;
  const shift = (n) => {
    const d = new Date(y, m - 1 + n, 1);
    calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    render();
  };
  $('#prev').onclick = () => shift(-1);
  $('#next').onclick = () => shift(1);
  $('#cur').onclick = () => {
    calMonth = todayStr().slice(0, 7);
    render();
  };
}

// ---------- reports ----------
async function pageReports(main) {
  const data = await api('/api/reports/summary?year=' + state.year);
  main.innerHTML = `
    <div class="card">
      <div class="spread">
        <h1>สรุปการใช้วันลา ปี ${data.year + 543}</h1>
        <div class="actions">
          <select id="year" aria-label="ปี" style="width:auto">${yearOptions(state.year)}</select>
          <button class="btn" id="csv">ดาวน์โหลด CSV</button>
        </div>
      </div>
      <p class="hint">แสดงเป็น ใช้ไป / สิทธิ์ต่อปี (วัน) · ตัวเลขในวงเล็บ = รออนุมัติ</p>
      ${
        !data.rows.length
          ? '<p class="empty">ไม่มีพนักงานในทีม</p>'
          : `<div class="table-wrap"><table>
        <thead><tr><th>พนักงาน</th><th>แผนก</th>${data.types
          .map((t) => `<th><span class="dot" style="--c:${esc(t.color)}"></span>${esc(t.name)}</th>`)
          .join('')}</tr></thead>
        <tbody>${data.rows
          .map(
            (r) => `<tr><td>${esc(r.user.name)}</td><td>${esc(r.user.department)}</td>${r.balances
              .map((b) => `<td>${b.used} / ${b.quota}${b.pending ? ` <span class="hint">(${b.pending})</span>` : ''}</td>`)
              .join('')}</tr>`
          )
          .join('')}</tbody></table></div>`
      }
    </div>`;
  $('#year').onchange = (e) => {
    state.year = Number(e.target.value);
    render();
  };
  $('#csv').onclick = () => {
    const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      ['พนักงาน', 'แผนก', ...data.types.flatMap((t) => [`${t.name} ใช้ไป`, `${t.name} รออนุมัติ`, `${t.name} คงเหลือ`])],
      ...data.rows.map((r) => [
        r.user.name,
        r.user.department,
        ...r.balances.flatMap((b) => [b.used, b.pending, b.remaining]),
      ]),
    ];
    const blob = new Blob(['﻿' + lines.map((l) => l.map(cell).join(',')).join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `leave-summary-${data.year}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
}

// ---------- admin ----------
let adminTab = 'users';
async function pageAdmin(main) {
  main.innerHTML = `
    <div class="card">
      <h1>ตั้งค่าระบบ</h1>
      <div class="tabs">
        <button data-tab="users" class="${adminTab === 'users' ? 'active' : ''}">พนักงาน</button>
        <button data-tab="types" class="${adminTab === 'types' ? 'active' : ''}">ประเภทการลา</button>
        <button data-tab="holidays" class="${adminTab === 'holidays' ? 'active' : ''}">วันหยุด</button>
      </div>
      <div id="admin-body"><p class="empty">กำลังโหลด…</p></div>
    </div>`;
  main.querySelectorAll('[data-tab]').forEach((b) => {
    b.onclick = () => {
      adminTab = b.dataset.tab;
      render();
    };
  });
  const body = $('#admin-body');
  if (adminTab === 'users') return adminUsers(body);
  if (adminTab === 'types') return adminTypes(body);
  return adminHolidays(body);
}

function openDialog(html, onSubmit) {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<form method="dialog">${html}
    <div class="error" id="dlg-error"></div>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" id="dlg-cancel" style="flex:0 0 auto">ยกเลิก</button>
    <button class="btn primary" style="flex:0 0 auto">บันทึก</button></div></form>`;
  document.body.appendChild(dlg);
  dlg.showModal();
  dlg.addEventListener('close', () => dlg.remove());
  $('#dlg-cancel', dlg).onclick = () => dlg.close();
  $('form', dlg).onsubmit = async (e) => {
    e.preventDefault();
    try {
      await onSubmit(dlg);
      dlg.close();
      render();
    } catch (err) {
      $('#dlg-error', dlg).textContent = err.message;
    }
  };
  return dlg;
}

async function adminUsers(body) {
  const users = await api('/api/users');
  const managers = users.filter((u) => u.active && ['manager', 'admin'].includes(u.role));
  body.innerHTML = `
    <div class="spread"><h2>พนักงานทั้งหมด (${users.length})</h2><button class="btn primary" id="add-user">+ เพิ่มพนักงาน</button></div>
    <div class="table-wrap"><table>
      <thead><tr><th>ชื่อ</th><th>อีเมล</th><th>แผนก</th><th>บทบาท</th><th>หัวหน้างาน (ผู้อนุมัติ)</th><th>สถานะ</th><th></th></tr></thead>
      <tbody>${users
        .map(
          (u) => `<tr style="${u.active ? '' : 'opacity:.5'}">
          <td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.department)}</td><td>${ROLE[u.role]}</td>
          <td>${esc(u.manager_name) || '<span class="hint">ผู้ดูแลระบบ</span>'}</td>
          <td>${u.active ? 'ใช้งาน' : 'ปิดใช้งาน'}</td>
          <td><button class="btn small" data-edit="${u.id}">แก้ไข</button></td>
        </tr>`
        )
        .join('')}</tbody></table></div>`;

  const form = (u = {}) => `
    <h2>${u.id ? 'แก้ไขพนักงาน' : 'เพิ่มพนักงาน'}</h2>
    <div class="field"><label>ชื่อ-นามสกุล</label><input name="name" required value="${esc(u.name)}"></div>
    <div class="field"><label>อีเมล (ใช้เข้าสู่ระบบ)</label><input name="email" type="email" required value="${esc(u.email)}"></div>
    <div class="row">
      <div class="field"><label>แผนก</label><input name="department" value="${esc(u.department)}"></div>
      <div class="field"><label>บทบาท</label><select name="role">${Object.entries(ROLE)
        .map(([k, v]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${v}</option>`)
        .join('')}</select></div>
    </div>
    <div class="field"><label>หัวหน้างาน (ผู้อนุมัติ)</label><select name="manager_id"><option value="">— ไม่มี (ผู้ดูแลระบบอนุมัติ) —</option>${managers
      .filter((m) => m.id !== u.id)
      .map((m) => `<option value="${m.id}" ${u.manager_id === m.id ? 'selected' : ''}>${esc(m.name)}</option>`)
      .join('')}</select></div>
    <div class="field"><label>${u.id ? 'ตั้งรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)' : 'รหัสผ่าน'}</label>
      <input name="password" type="password" minlength="8" ${u.id ? '' : 'required'} autocomplete="new-password"></div>
    ${u.id ? `<div class="field"><label><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> เปิดใช้งานบัญชี</label></div>` : ''}`;

  const collect = (dlg, u) => {
    const f = $('form', dlg).elements;
    const data = {
      name: f.name.value,
      email: f.email.value,
      department: f.department.value,
      role: f.role.value,
      manager_id: f.manager_id.value || null,
      password: f.password.value || undefined,
    };
    if (u) data.active = f.active.checked;
    return data;
  };
  $('#add-user').onclick = () =>
    openDialog(form(), async (dlg) => {
      await api('/api/users', { method: 'POST', body: collect(dlg) });
      toast('เพิ่มพนักงานแล้ว');
    });
  body.querySelectorAll('[data-edit]').forEach((b) => {
    b.onclick = () => {
      const u = users.find((x) => x.id === Number(b.dataset.edit));
      openDialog(form(u), async (dlg) => {
        await api('/api/users/' + u.id, { method: 'PUT', body: collect(dlg, u) });
        toast('บันทึกแล้ว');
      });
    };
  });
}

async function adminTypes(body) {
  const types = await api('/api/leave-types');
  body.innerHTML = `
    <div class="spread"><h2>ประเภทการลา</h2><button class="btn primary" id="add-type">+ เพิ่มประเภท</button></div>
    <div class="table-wrap"><table>
      <thead><tr><th>ประเภท</th><th>สิทธิ์ต่อปี</th><th>สถานะ</th><th></th></tr></thead>
      <tbody>${types
        .map(
          (t) => `<tr style="${t.active ? '' : 'opacity:.5'}">
          <td><span class="dot" style="--c:${esc(t.color)}"></span>${esc(t.name)}</td>
          <td>${t.annual_quota} วัน</td><td>${t.active ? 'ใช้งาน' : 'ปิดใช้งาน'}</td>
          <td><button class="btn small" data-edit="${t.id}">แก้ไข</button></td></tr>`
        )
        .join('')}</tbody></table></div>`;
  const form = (t = { color: '#3b82f6', active: true }) => `
    <h2>${t.id ? 'แก้ไขประเภทการลา' : 'เพิ่มประเภทการลา'}</h2>
    <div class="field"><label>ชื่อประเภท</label><input name="name" required value="${esc(t.name)}"></div>
    <div class="row">
      <div class="field"><label>สิทธิ์ต่อปี (วัน)</label><input name="annual_quota" type="number" min="0" max="366" step="0.5" required value="${
        t.annual_quota ?? ''
      }"></div>
      <div class="field"><label>สี</label><input name="color" type="color" value="${esc(t.color)}"></div>
    </div>
    ${t.id ? `<div class="field"><label><input type="checkbox" name="active" ${t.active ? 'checked' : ''}> เปิดใช้งาน</label></div>` : ''}`;
  const collect = (dlg) => {
    const f = $('form', dlg).elements;
    return {
      name: f.name.value,
      annual_quota: Number(f.annual_quota.value),
      color: f.color.value,
      active: f.active ? f.active.checked : true,
    };
  };
  $('#add-type').onclick = () =>
    openDialog(form(), async (dlg) => {
      await api('/api/leave-types', { method: 'POST', body: collect(dlg) });
      toast('เพิ่มประเภทการลาแล้ว');
    });
  body.querySelectorAll('[data-edit]').forEach((b) => {
    b.onclick = () => {
      const t = types.find((x) => x.id === Number(b.dataset.edit));
      openDialog(form(t), async (dlg) => {
        await api('/api/leave-types/' + t.id, { method: 'PUT', body: collect(dlg) });
        toast('บันทึกแล้ว');
      });
    };
  });
}

let holidayYear = thisYear;
async function adminHolidays(body) {
  const list = await api('/api/holidays?year=' + holidayYear);
  body.innerHTML = `
    <div class="spread"><h2>วันหยุดประจำปี</h2>
      <select id="hyear" aria-label="ปี" style="width:auto">${yearOptions(holidayYear)}</select></div>
    <form id="add-hol" class="row" style="margin-bottom:16px">
      <div><label for="hdate">วันที่</label><input id="hdate" type="date" required></div>
      <div style="flex:2 1 240px"><label for="hname">ชื่อวันหยุด</label><input id="hname" required></div>
      <button class="btn primary" style="flex:0 0 auto">+ เพิ่มวันหยุด</button>
    </form>
    <p class="hint">วันหยุดจะไม่ถูกนับเป็นวันลา · วันหยุดทางจันทรคติ (มาฆบูชา วิสาขบูชา ฯลฯ) และวันหยุดชดเชย กรุณาเพิ่มเองตามประกาศแต่ละปี</p>
    ${
      !list.length
        ? '<p class="empty">ยังไม่มีวันหยุดในปีนี้</p>'
        : `<div class="table-wrap"><table><thead><tr><th>วันที่</th><th>ชื่อวันหยุด</th><th></th></tr></thead><tbody>${list
            .map(
              (h) => `<tr><td>${new Date(h.date + 'T00:00:00').toLocaleDateString('th-TH', {
                weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
              })}</td><td>${esc(h.name)}</td>
              <td><button class="btn small danger" data-del="${h.id}">ลบ</button></td></tr>`
            )
            .join('')}</tbody></table></div>`
    }`;
  $('#hyear').onchange = (e) => {
    holidayYear = Number(e.target.value);
    render();
  };
  $('#add-hol').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/holidays', { method: 'POST', body: { date: $('#hdate').value, name: $('#hname').value } });
      toast('เพิ่มวันหยุดแล้ว');
      render();
    } catch (err) {
      toast(err.message, true);
    }
  };
  body.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('ลบวันหยุดนี้?')) return;
      await api('/api/holidays/' + b.dataset.del, { method: 'DELETE' });
      render();
    };
  });
}

// ---------- profile ----------
async function pageProfile(main) {
  const u = state.me.user;
  main.innerHTML = `
    <div class="card" style="max-width:520px">
      <h1>บัญชีของฉัน</h1>
      <p>${esc(u.name)}<br><span class="hint">${esc(u.email)} · ${ROLE[u.role]}${u.department ? ' · ' + esc(u.department) : ''}</span></p>
      <h2>เปลี่ยนรหัสผ่าน</h2>
      <form id="pw-form">
        <div class="field"><label for="cur">รหัสผ่านปัจจุบัน</label><input id="cur" type="password" required autocomplete="current-password"></div>
        <div class="field"><label for="npw">รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)</label><input id="npw" type="password" minlength="8" required autocomplete="new-password"></div>
        <div class="error" id="pw-error"></div>
        <button class="btn primary">เปลี่ยนรหัสผ่าน</button>
      </form>
    </div>`;
  $('#pw-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/me/password', { method: 'POST', body: { current: $('#cur').value, password: $('#npw').value } });
      toast('เปลี่ยนรหัสผ่านแล้ว');
      e.target.reset();
    } catch (err) {
      $('#pw-error').textContent = err.message;
    }
  };
}

// ---------- boot ----------
refreshMe().then(render);
