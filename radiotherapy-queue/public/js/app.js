import {
  ROOMS, TECHNIQUES, CBCT_MODES, STATUSES, PHASE_LABELS,
  addDays, todayISO, startOfWeek, isWorkday, nextWorkday, parseISO,
  buildSessions, phaseOf, eventsByDate, findConflicts, suggestTimes, utilization, DEFAULT_PHYSICIANS,
} from './schedule.js';
import {
  NAME_PREFIXES, composeName, ICD10, ICD9_RT, ICD9_BY_TECHNIQUE, TREATMENT_SITES, SITE_SEP, parseSites, searchIcd10,
} from './icd.js';
import { openStore } from './store.js';

// ================= state =================
const state = {
  me: null, // ผู้ใช้ที่เข้าสู่ระบบ (เฉพาะเวอร์ชัน Apps Script ที่เชื่อม LPCH RO Workspace)
  store: null,
  appts: [],
  settings: null,
  evMap: new Map(),
  sessions: new Map(),
  view: 'dashboard',
  dashDate: todayISO(),
  calMonth: todayISO().slice(0, 7),
  calRooms: new Set(ROOMS.map((r) => r.id)),
  calType: 'all',
  selectedDay: todayISO(),
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ================= helpers =================
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const dtf = (opts) => new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', ...opts });
const F_SHORT = dtf({ day: 'numeric', month: 'short' });
const F_MED = dtf({ day: 'numeric', month: 'short', year: '2-digit' });
const F_LONG = dtf({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const F_MONTH = dtf({ month: 'long', year: 'numeric' });
const DOW = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const fmt = (f, iso) => (iso ? f.format(parseISO(iso)) : '-');
const fShort = (iso) => fmt(F_SHORT, iso);
const fMed = (iso) => fmt(F_MED, iso);
const fLong = (iso) => fmt(F_LONG, iso);

const roomOf = (id) => ROOMS.find((r) => r.id === id) || { id, name: id, label: id };
const techOf = (id) => TECHNIQUES.find((t) => t.id === id) || { id, name: id, duration: 15 };
const roomTag = (id) => `<span class="room-tag"><i class="dot ${esc(id)}"></i>${esc(id)}</span>`;
const holidayName = (iso) => state.settings.holidays.find((h) => h.date === iso)?.name;

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 2600);
}

const tip = $('#tooltip');
function showTip(html, ev) {
  tip.innerHTML = html;
  tip.hidden = false;
  const pad = 14;
  const { innerWidth: w, innerHeight: h } = window;
  const r = tip.getBoundingClientRect();
  let x = ev.clientX + pad;
  let y = ev.clientY + pad;
  if (x + r.width > w - 8) x = ev.clientX - r.width - pad;
  if (y + r.height > h - 8) y = ev.clientY - r.height - pad;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}
const hideTip = () => (tip.hidden = true);

function recompute() {
  state.settings.physicians ||= [...DEFAULT_PHYSICIANS]; // ข้อมูลจากเวอร์ชันก่อน
  state.sessions = new Map(state.appts.map((a) => [a.id, buildSessions(a, state.settings)]));
  state.evMap = eventsByDate(state.appts, state.settings);
}

function sessionsOf(a) {
  return state.sessions.get(a.id) || buildSessions(a, state.settings);
}

function phase(a, day = todayISO()) {
  return phaseOf(a, sessionsOf(a), day);
}

function eventsOn(date, filter = () => true) {
  return (state.evMap.get(date) || []).filter(filter);
}

function render() {
  recompute();
  ({ dashboard: renderDashboard, calendar: renderCalendar, patients: renderPatients, settings: renderSettings })[
    state.view
  ]();
}

// ================= navigation =================
function setView(view) {
  if (view === 'settings') draftSettings = null;
  state.view = view;
  for (const b of $$('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.view === view));
  for (const s of $$('.view')) s.hidden = s.id !== `view-${view}`;
  try {
    if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
  } catch {
    /* บางสภาพแวดล้อม (เช่น iframe ของ Apps Script) ไม่อนุญาต */
  }
  render();
}

// ================= dashboard =================
function renderDashboard() {
  const day = state.dashDate;
  $('#dash-date').value = day;
  const hol = holidayName(day);
  const off = !isWorkday(day, state.settings);
  $('#dash-holiday').hidden = !off;
  $('#dash-holiday').textContent = off ? `${fLong(day)} เป็น${hol ? `วันหยุด (${hol})` : 'วันหยุด'} — ไม่มีการนัดฉายตามปกติ` : '';

  const evs = eventsOn(day);
  const fxEvs = evs.filter((e) => e.type === 'fx');
  const cbctEvs = evs.filter((e) => e.cbct);
  const starts = fxEvs.filter((e) => e.start);
  const phases = state.appts.map((a) => phase(a, day));
  const treating = phases.filter((p) => p === 'treating').length;
  const waiting = phases.filter((p) => p === 'waiting').length;
  const wk = startOfWeek(day);
  let weekStarts = 0;
  for (let i = 0; i < 7; i++) weekStarts += eventsOn(addDays(wk, i), (e) => e.type === 'fx' && e.start).length;

  const kpi = (label, value, sub = '') =>
    `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;
  $('#kpis').innerHTML = [
    kpi('นัดฉายวันนี้', fxEvs.length, `ราย · ${fShort(day)}`),
    kpi('ทำ CBCT วันนี้', cbctEvs.length, `ก่อนฉาย ${evs.filter((e) => e.type === 'verify').length} · ระหว่างฉาย ${fxEvs.filter((e) => e.cbct).length}`),
    kpi('เริ่มฉายใหม่วันนี้', starts.length, 'ราย'),
    kpi('เริ่มฉายสัปดาห์นี้', weekStarts, `${fShort(wk)} – ${fShort(addDays(wk, 6))}`),
    kpi('ผู้ป่วยกำลังฉาย', treating, 'อยู่ระหว่างคอร์ส'),
    kpi('รอเริ่มฉาย', waiting, 'นัดแล้ว ยังไม่ถึงวันเริ่ม'),
  ].join('');

  $('#room-cards').innerHTML = ROOMS.map((r) => {
    const re = evs.filter((e) => e.room === r.id);
    const u = utilization(re, state.settings.rooms[r.id]);
    const pct = Math.round(u * 100);
    const shown = re.slice(0, 6);
    return `<article class="card room-card" style="--rc: var(--room-${r.id})">
      <div class="room-title"><i class="dot ${r.id}"></i><h3>${esc(r.name)}</h3><span class="code">ห้อง ${r.id}</span></div>
      <div class="room-stats">
        <div><b>${re.filter((e) => e.type === 'fx').length}</b><span>ราย</span></div>
        <div><b>${re.filter((e) => e.cbct).length}</b><span>CBCT</span></div>
        <div><b>${re.filter((e) => e.start).length}</b><span>เริ่มใหม่</span></div>
      </div>
      <div class="meter" role="meter" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="การใช้เครื่อง"><i style="width:${Math.min(100, pct)}%"></i></div>
      <div class="meter-label"><span>การใช้เครื่อง ${pct}%</span><span>${state.settings.rooms[r.id].open}–${state.settings.rooms[r.id].close} น.</span></div>
      <ul class="room-next">${
        shown.length
          ? shown
              .map(
                (e) => `<li data-id="${esc(e.appt.id)}"><span class="t">${esc(e.time)}</span><span class="n">${esc(e.appt.name)}</span>${eventBadges(e)}</li>`,
              )
              .join('') + (re.length > shown.length ? `<li class="muted">และอีก ${re.length - shown.length} ราย</li>` : '')
          : '<li class="muted">ไม่มีนัด</li>'
      }</ul>
    </article>`;
  }).join('');

  renderDailyChart(day);
  renderTechChart(day);

  const upcoming = (filter, limit = 10) => {
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(day, i);
      for (const e of eventsOn(d, filter)) out.push(e);
    }
    return { items: out.slice(0, limit), more: Math.max(0, out.length - limit) };
  };
  const listHtml = ({ items, more }, metaFn) =>
    items.length
      ? `<ul class="mini-list">${items
          .map(
            (e) => `<li data-id="${esc(e.appt.id)}"><span class="date">${fShort(e.date)} ${esc(e.time)}</span>
              <span class="name">${esc(e.appt.name)} <span class="muted small">HN ${esc(e.appt.hn)}</span></span>
              <span class="meta">${metaFn(e)}</span></li>`,
          )
          .join('')}</ul>${more ? `<p class="muted small">และอีก ${more} รายการ</p>` : ''}`
      : '<p class="empty">ไม่มีรายการ</p>';

  $('#list-starts').innerHTML = listHtml(
    upcoming((e) => e.type === 'fx' && e.start),
    (e) => `${esc(techOf(e.appt.technique).name)} · ${roomTag(e.room)}`,
  );
  $('#list-cbct').innerHTML = listHtml(
    upcoming((e) => e.cbct, 12),
    (e) => `${e.type === 'verify' ? 'ก่อนฉาย' : `Fx ${e.fx}/${e.total}`} · ${roomTag(e.room)}`,
  );

  const ending = state.appts
    .filter((a) => phase(a, day) === 'treating')
    .map((a) => {
      const ss = sessionsOf(a);
      return { a, left: ss.filter((s) => s.date >= day).length, last: ss[ss.length - 1].date };
    })
    .filter((x) => x.left <= 3)
    .sort((x, y) => x.last.localeCompare(y.last));
  $('#list-ending').innerHTML = ending.length
    ? `<ul class="mini-list">${ending
        .map(
          ({ a, left, last }) => `<li data-id="${esc(a.id)}"><span class="date">${fShort(last)}</span>
            <span class="name">${esc(a.name)} <span class="muted small">HN ${esc(a.hn)}</span></span>
            <span class="meta">เหลือ ${left} ครั้ง · ${roomTag(a.room)}</span></li>`,
        )
        .join('')}</ul>`
    : '<p class="empty">ไม่มีรายการ</p>';
}

function eventBadges(e) {
  const b = [];
  if (e.type === 'verify') b.push('<span class="badge cbct">CBCT ก่อนฉาย</span>');
  else {
    if (e.start) b.push('<span class="badge start">เริ่มฉาย</span>');
    if (e.cbct) b.push('<span class="badge cbct">CBCT</span>');
  }
  return b.join(' ');
}

// ---------- charts ----------
function roundedTop(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function niceMax(v) {
  if (v <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function renderDailyChart(fromDay) {
  const el = $('#chart-daily');
  const days = [];
  let d = nextWorkday(fromDay, state.settings);
  while (days.length < 10) {
    days.push(d);
    d = nextWorkday(addDays(d, 1), state.settings);
  }
  const data = days.map((date) => {
    const evs = eventsOn(date);
    const byRoom = Object.fromEntries(ROOMS.map((r) => [r.id, evs.filter((e) => e.room === r.id).length]));
    return { date, byRoom, total: evs.length };
  });

  const W = Math.max(300, el.clientWidth || 600);
  const H = 240;
  const m = { t: 22, r: 8, b: 40, l: 30 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const max = niceMax(Math.max(1, ...data.map((x) => x.total)));
  const step = iw / data.length;
  const bw = Math.min(36, step * 0.6);
  const y = (v) => m.t + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];

  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="จำนวนผู้ป่วยที่นัดฉายต่อวัน">`;
  for (const t of ticks)
    svg += `<line class="${t === 0 ? 'baseline' : 'gridline'}" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/>
      <text class="lbl" x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`;
  data.forEach((row, i) => {
    const cx = m.l + step * i + step / 2;
    const x = cx - bw / 2;
    let acc = 0;
    const segs = ROOMS.filter((r) => row.byRoom[r.id] > 0);
    let g = '';
    segs.forEach((r, j) => {
      const v = row.byRoom[r.id];
      const y0 = y(acc);
      const y1 = y(acc + v);
      // เว้นช่อง 2px ระหว่างส่วนของแท่งที่ซ้อนกัน
      const h = Math.max(1, y0 - y1 - (j > 0 ? 2 : 0));
      g +=
        j === segs.length - 1
          ? `<path d="${roundedTop(x, y1, bw, h, 4)}" fill="var(--room-${r.id})"/>`
          : `<rect x="${x}" y="${y1}" width="${bw}" height="${h}" fill="var(--room-${r.id})"/>`;
      acc += v;
    });
    const dt = parseISO(row.date);
    svg += `<g>${g}</g>`;
    if (row.total) svg += `<text class="val" x="${cx}" y="${y(row.total) - 6}" text-anchor="middle">${row.total}</text>`;
    svg += `<text class="lbl" x="${cx}" y="${H - m.b + 16}" text-anchor="middle">${DOW[dt.getUTCDay()]}</text>
      <text class="lbl" x="${cx}" y="${H - m.b + 30}" text-anchor="middle">${step < 52 ? dt.getUTCDate() : fShort(row.date)}</text>
      <rect class="hit" data-i="${i}" x="${m.l + step * i}" y="${m.t}" width="${step}" height="${ih + m.b}"/>`;
  });
  svg += '</svg>';

  const legend = `<div class="chart-legend">${ROOMS.map((r) => `<span><i class="dot ${r.id}"></i>${r.label}</span>`).join('')}</div>`;
  const table = `<details><summary>ดูเป็นตาราง</summary><table class="table compact"><thead><tr><th>วันที่</th>${ROOMS.map(
    (r) => `<th>${r.id}</th>`,
  ).join('')}<th>รวม</th></tr></thead><tbody>${data
    .map(
      (row) => `<tr><td>${fShort(row.date)}</td>${ROOMS.map((r) => `<td class="num">${row.byRoom[r.id]}</td>`).join('')}<td class="num"><b>${row.total}</b></td></tr>`,
    )
    .join('')}</tbody></table></details>`;
  el.innerHTML = legend + svg + table;

  for (const hit of $$('.hit', el)) {
    const row = data[Number(hit.dataset.i)];
    hit.addEventListener('mousemove', (ev) =>
      showTip(
        `<div class="tt-title">${fLong(row.date)}</div>${ROOMS.map(
          (r) => `<div class="tt-row"><span><i class="dot ${r.id}"></i>${r.label}</span><b>${row.byRoom[r.id]}</b></div>`,
        ).join('')}<div class="tt-row"><span>รวม</span><b>${row.total}</b></div>`,
        ev,
      ),
    );
    hit.addEventListener('mouseleave', hideTip);
    hit.addEventListener('click', () => {
      state.selectedDay = row.date;
      state.calMonth = row.date.slice(0, 7);
      setView('calendar');
    });
  }
}

function renderTechChart(day) {
  const el = $('#chart-tech');
  const active = state.appts.filter((a) => ['waiting', 'treating'].includes(phase(a, day)));
  const rows = TECHNIQUES.map((t) => ({
    t,
    n: active.filter((a) => a.technique === t.id).length,
    byRoom: Object.fromEntries(ROOMS.map((r) => [r.id, active.filter((a) => a.technique === t.id && a.room === r.id).length])),
  }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);
  if (!rows.length) {
    el.innerHTML = '<p class="empty">ยังไม่มีผู้ป่วยที่กำลังฉายหรือรอเริ่มฉาย</p>';
    return;
  }
  const W = Math.max(300, el.clientWidth || 600);
  const rowH = 28;
  const m = { t: 4, r: 36, b: 4, l: 120 };
  const H = m.t + m.b + rows.length * rowH;
  const max = Math.max(...rows.map((r) => r.n));
  const iw = W - m.l - m.r;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="จำนวนผู้ป่วยตามเทคนิคการฉาย">`;
  rows.forEach((r, i) => {
    const y = m.t + i * rowH;
    const w = Math.max(2, (r.n / max) * iw);
    const bh = 16;
    const by = y + (rowH - bh) / 2;
    svg += `<text class="lbl" x="${m.l - 10}" y="${y + rowH / 2 + 4}" text-anchor="end">${esc(r.t.name)}</text>
      <path d="M${m.l},${by}H${m.l + w - 4}Q${m.l + w},${by} ${m.l + w},${by + 4}V${by + bh - 4}Q${m.l + w},${by + bh} ${m.l + w - 4},${by + bh}H${m.l}Z" fill="var(--seq)"/>
      <text class="val" x="${m.l + w + 6}" y="${y + rowH / 2 + 4}">${r.n}</text>
      <rect class="hit" data-i="${i}" x="0" y="${y}" width="${W}" height="${rowH}"/>`;
  });
  svg += `<line class="baseline" x1="${m.l}" x2="${m.l}" y1="${m.t}" y2="${H - m.b}"/></svg>`;
  el.innerHTML = svg;
  for (const hit of $$('.hit', el)) {
    const r = rows[Number(hit.dataset.i)];
    hit.addEventListener('mousemove', (ev) =>
      showTip(
        `<div class="tt-title">${esc(r.t.name)} · ${r.n} ราย</div>${ROOMS.map(
          (x) => `<div class="tt-row"><span><i class="dot ${x.id}"></i>${x.label}</span><b>${r.byRoom[x.id]}</b></div>`,
        ).join('')}`,
        ev,
      ),
    );
    hit.addEventListener('mouseleave', hideTip);
  }
}

// ================= calendar =================
function calFilter(e) {
  if (!state.calRooms.has(e.room)) return false;
  if (state.calType === 'start') return e.type === 'fx' && e.start;
  if (state.calType === 'cbct') return e.cbct;
  return true;
}

function renderCalendar() {
  const [yy, mm] = state.calMonth.split('-').map(Number);
  const first = `${state.calMonth}-01`;
  $('#cal-title').textContent = F_MONTH.format(parseISO(first));

  $('#cal-rooms').innerHTML = ROOMS.map(
    (r) => `<button type="button" data-room="${r.id}" aria-pressed="${state.calRooms.has(r.id)}"><i class="dot ${r.id}"></i>${r.label}</button>`,
  ).join('');
  $('#cal-type').value = state.calType;
  $('#cal-legend').innerHTML =
    ROOMS.map((r) => `<span><i class="dot ${r.id}"></i>${r.label}</span>`).join('') +
    '<span><span class="badge start">เริ่ม</span> วันเริ่มฉาย</span><span><span class="badge cbct">CBCT</span> นัดทำ CBCT</span>' +
    '<span><i class="dot" style="background:var(--holiday);border:1px solid var(--border)"></i>วันหยุด</span>';

  const gridStart = startOfWeek(first);
  const lastDay = addDays(`${yy + (mm === 12 ? 1 : 0)}-${String(mm === 12 ? 1 : mm + 1).padStart(2, '0')}-01`, -1);
  const gridEnd = addDays(startOfWeek(lastDay), 6);
  const today = todayISO();
  let html = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'].map((d) => `<div class="cal-dow">${d}</div>`).join('');
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
    const evs = eventsOn(d, calFilter);
    const hol = holidayName(d);
    const off = !isWorkday(d, state.settings);
    const cls = ['cal-day', d.slice(0, 7) !== state.calMonth && 'other', off && 'off', d === today && 'today', d === state.selectedDay && 'selected']
      .filter(Boolean)
      .join(' ');
    const rooms = ROOMS.filter((r) => state.calRooms.has(r.id))
      .map((r) => {
        const re = evs.filter((e) => e.room === r.id);
        if (!re.length) return '';
        const u = Math.min(1, utilization(re, state.settings.rooms[r.id]));
        return `<div class="cal-room"><i class="dot ${r.id}"></i><span class="code">${r.id}</span><span class="bar"><i style="width:${Math.round(u * 100)}%;background:var(--room-${r.id})"></i></span><b>${re.length}</b></div>`;
      })
      .join('');
    const nStart = evs.filter((e) => e.type === 'fx' && e.start).length;
    const nCbct = evs.filter((e) => e.cbct).length;
    html += `<button type="button" class="${cls}" data-date="${d}" aria-label="${fLong(d)} นัด ${evs.length} รายการ">
      <span class="dnum"><b>${parseISO(d).getUTCDate()}</b>${evs.length ? `<span class="muted small">${evs.length}</span>` : ''}</span>
      ${hol ? `<span class="hname">${esc(hol)}</span>` : ''}
      <span class="rooms">${rooms}</span>
      <span class="cal-flags">${nStart ? `<span class="badge start">เริ่ม ${nStart}</span>` : ''}${nCbct ? `<span class="badge cbct">CBCT ${nCbct}</span>` : ''}</span>
    </button>`;
  }
  $('#calendar').innerHTML = html;
  renderDayPanel();
}

function renderDayPanel() {
  const day = state.selectedDay;
  const evs = eventsOn(day, calFilter);
  const hol = holidayName(day);
  $('#day-title').textContent = fLong(day);
  $('#day-sub').textContent = `${evs.length} รายการ${hol ? ` · วันหยุด: ${hol}` : !isWorkday(day, state.settings) ? ' · วันหยุด' : ''}`;
  $('#day-rooms').innerHTML = ROOMS.filter((r) => state.calRooms.has(r.id))
    .map((r) => {
      const re = evs.filter((e) => e.room === r.id);
      return `<div class="day-room" style="--rc: var(--room-${r.id})">
        <h4><i class="dot ${r.id}"></i>${r.label}<span class="count">${re.length} ราย</span></h4>
        ${
          re.length
            ? re
                .map(
                  (e) => `<div class="slot" data-id="${esc(e.appt.id)}"><span class="t">${esc(e.time)}</span>
                  <div><div class="n">${esc(e.appt.name)}</div>
                  <div class="m"><span>HN ${esc(e.appt.hn)}</span><span>${esc(techOf(e.appt.technique).name)}</span>
                  <span>${e.type === 'verify' ? '' : `Fx ${e.fx}/${e.total}`}</span>${eventBadges(e)}</div></div></div>`,
                )
                .join('')
            : '<p class="empty">ไม่มีนัด</p>'
        }
      </div>`;
    })
    .join('');
}

function printDay() {
  const day = state.selectedDay;
  const evs = eventsOn(day, calFilter);
  $('#print-area').innerHTML = `<h2>ตารางนัดฉายรังสี ${esc(fLong(day))}</h2>
    <div>กลุ่มงานรังสีรักษา โรงพยาบาลมะเร็งลำปาง</div>
    ${ROOMS.filter((r) => state.calRooms.has(r.id))
      .map((r) => {
        const re = evs.filter((e) => e.room === r.id);
        return `<div class="pr-room"><h3>ห้อง ${r.label} (${re.length} ราย)</h3>
        <table><thead><tr><th>เวลา</th><th>HN</th><th>ชื่อ-สกุล</th><th>เทคนิค</th><th>ครั้งที่</th><th>CBCT</th><th>หมายเหตุ</th></tr></thead><tbody>
        ${re
          .map(
            (e) => `<tr><td>${esc(e.time)}</td><td>${esc(e.appt.hn)}</td><td>${esc(e.appt.name)}</td><td>${esc(techOf(e.appt.technique).name)}</td>
            <td>${e.type === 'verify' ? 'ก่อนฉาย' : `${e.fx}/${e.total}${e.start ? ' (เริ่ม)' : ''}`}</td><td>${e.cbct ? '✓' : ''}</td><td>${esc(e.appt.notes)}</td></tr>`,
          )
          .join('')}</tbody></table></div>`;
      })
      .join('')}`;
  window.print();
}

// ================= patients =================
const PHASE_ORDER = { treating: 0, waiting: 1, hold: 2, completed: 3, cancelled: 4 };

function patientRows() {
  const q = $('#pt-search').value.trim().toLowerCase();
  const room = $('#pt-room').value;
  const tech = $('#pt-tech').value;
  const ph = $('#pt-phase').value;
  const today = todayISO();
  return state.appts
    .map((a) => {
      const ss = sessionsOf(a);
      return { a, ss, phase: phase(a), done: ss.filter((s) => s.date < today).length };
    })
    .filter(
      ({ a, phase: p }) =>
        (!q || [a.hn, a.name, a.diagnosis, a.site, a.physician].some((v) => String(v || '').toLowerCase().includes(q))) &&
        (!room || a.room === room) &&
        (!tech || a.technique === tech) &&
        (!ph || p === ph),
    )
    .sort((x, y) => PHASE_ORDER[x.phase] - PHASE_ORDER[y.phase] || (x.a.startDate || '').localeCompare(y.a.startDate || ''));
}

function renderPatients() {
  const rows = patientRows();
  $('#pt-table tbody').innerHTML = rows
    .map(({ a, ss, phase: p, done }) => {
      const pct = ss.length ? Math.round((done / ss.length) * 100) : 0;
      return `<tr data-id="${esc(a.id)}">
        <td class="num">${esc(a.hn)}</td>
        <td><b>${esc(a.name)}</b><div class="muted small">${esc(a.physician || '')}</div></td>
        <td class="dx-cell"><div class="dx" title="${esc(a.diagnosis)}">${esc(a.diagnosis || '-')}</div><div class="muted small">${esc(a.site || '')}</div></td>
        <td>${esc(techOf(a.technique).name)}</td>
        <td>${roomTag(a.room)}</td>
        <td class="num">${a.verifyDate ? `${fMed(a.verifyDate)} ${esc(a.verifyTime || a.time)}` : '-'}</td>
        <td class="num">${fMed(ss[0]?.date)} ${esc(a.time)}</td>
        <td><div class="progress"><div class="meter"><i style="width:${pct}%"></i></div><span class="num small">${done}/${ss.length}</span></div></td>
        <td class="num">${fMed(ss[ss.length - 1]?.date)}</td>
        <td><span class="badge ${p}">${PHASE_LABELS[p]}</span></td>
        <td><div class="row-actions"><button class="btn small" data-act="edit">แก้ไข</button><button class="btn small ghost" data-act="slip">ใบนัด</button></div></td>
      </tr>`;
    })
    .join('');
  $('#pt-empty').hidden = rows.length > 0;
  $('#pt-empty').textContent = state.appts.length ? 'ไม่พบผู้ป่วยตามเงื่อนไขที่ค้นหา' : 'ยังไม่มีข้อมูลผู้ป่วย — กด “+ นัดผู้ป่วยใหม่” เพื่อเริ่มต้น';
}

function exportCsv() {
  const head = ['HN', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'ชื่อ-สกุล', 'อายุ', 'เพศ', 'โทรศัพท์', 'ICD-10', 'การวินิจฉัย', 'ตำแหน่งที่ฉาย', 'ICD-9-CM', 'แพทย์', 'เทคนิค', 'ห้อง', 'ปริมาณรังสี/ครั้ง', 'จำนวนครั้ง', 'วัน CT Sim', 'วัน CBCT ก่อนฉาย', 'วันเริ่มฉาย', 'วันสุดท้าย', 'เวลานัด', 'รูปแบบ CBCT', 'วันทำ CBCT ระหว่างฉาย', 'สถานะ', 'หมายเหตุ', 'ผู้บันทึก', 'ผู้แก้ไขล่าสุด'];
  const lines = patientRows().map(({ a, ss, phase: p }) =>
    [
      a.hn, a.prefix, a.firstName, a.lastName, a.name, a.age, a.sex, a.phone, a.icd10, a.diagnosis, a.site, a.icd9, a.physician, techOf(a.technique).name, roomOf(a.room).label, a.dosePerFx,
      a.fractions, a.simDate, a.verifyDate, ss[0]?.date, ss[ss.length - 1]?.date, a.time,
      CBCT_MODES.find((m) => m.id === a.cbctMode)?.name, ss.filter((s) => s.cbct).map((s) => s.date).join(' '), PHASE_LABELS[p], a.notes, a.createdBy, a.updatedBy,
    ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','),
  );
  download(`rt-appointments-${todayISO()}.csv`, '\ufeff' + [head.join(','), ...lines].join('\r\n'), 'text/csv');
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function printSlip(a) {
  const ss = sessionsOf(a);
  $('#print-area').innerHTML = `<h2>ใบนัดฉายรังสี</h2>
    <div>กลุ่มงานรังสีรักษา โรงพยาบาลมะเร็งลำปาง</div>
    <p><b>${esc(a.name)}</b> HN ${esc(a.hn)} ${a.age !== '' && a.age != null ? `อายุ ${esc(a.age)} ปี` : ''}<br>
    การวินิจฉัย: ${esc(a.diagnosis || '-')}<br>
    ตำแหน่งที่ฉาย: ${esc(a.site || '-')} · แพทย์: ${esc(a.physician || '-')}<br>
    ห้องฉาย: ${esc(roomOf(a.room).label)} · เทคนิค: ${esc(techOf(a.technique).name)} · จำนวน ${ss.length} ครั้ง<br>
    เวลานัด: ${esc(a.time)} น. · ฉายระหว่าง ${esc(fLong(ss[0]?.date))} ถึง ${esc(fLong(ss[ss.length - 1]?.date))}
    ${a.verifyDate ? `<br><b>นัดทำ CBCT ก่อนเริ่มฉาย: ${esc(fLong(a.verifyDate))} เวลา ${esc(a.verifyTime || a.time)} น.</b>` : ''}</p>
    <table><thead><tr><th>ครั้งที่</th><th>วันที่</th><th>เวลา</th><th>CBCT</th><th>ลงชื่อผู้ฉาย</th></tr></thead><tbody>
    ${ss.map((s) => `<tr><td>${s.fx}</td><td>${esc(fLong(s.date))}</td><td>${esc(a.time)}</td><td>${s.cbct ? '✓' : ''}</td><td></td></tr>`).join('')}
    </tbody></table>
    <p>หมายเหตุ: ${esc(a.notes || '-')}</p>`;
  window.print();
}

// ================= settings =================
let draftSettings = null;

function renderSettings() {
  draftSettings ||= structuredClone(state.settings);
  const s = draftSettings;
  $('#set-rooms').innerHTML = ROOMS.map(
    (r) => `<label class="span-2"><span><i class="dot ${r.id}"></i> ${r.label}</span>
      <span style="display:flex;gap:6px;align-items:center"><input type="time" data-room="${r.id}" data-k="open" value="${s.rooms[r.id].open}"> ถึง
      <input type="time" data-room="${r.id}" data-k="close" value="${s.rooms[r.id].close}"></span></label>`,
  ).join('');
  $('#set-slot').value = String(s.slotMinutes);
  $('#set-workdays').innerHTML = [1, 2, 3, 4, 5, 6, 0]
    .map((d) => `<button type="button" class="chip" data-dow="${d}" aria-pressed="${s.workdays.includes(d)}">${DOW[d]}</button>`)
    .join('');
  const today = todayISO();
  $('#hol-list').innerHTML = s.holidays
    .filter((h) => h.date >= addDays(today, -60))
    .map(
      (h) => `<li><span class="d">${fMed(h.date)}</span><span class="nm">${esc(h.name)}</span>
        <button type="button" class="btn small ghost danger" data-del="${h.date}" aria-label="ลบ">ลบ</button></li>`,
    )
    .join('') || '<li class="muted">ไม่มีวันหยุด</li>';
  s.physicians ||= [...DEFAULT_PHYSICIANS];
  $('#phys-list').innerHTML =
    s.physicians
      .map(
        (p, i) => `<li><span class="nm">${esc(p)}</span>
        <button type="button" class="btn small ghost" data-phys-up="${i}" aria-label="เลื่อนขึ้น" ${i ? '' : 'disabled'}>↑</button>
        <button type="button" class="btn small ghost danger" data-phys-del="${i}" aria-label="ลบ">ลบ</button></li>`,
      )
      .join('') || '<li class="muted">ยังไม่มีรายชื่อแพทย์</li>';
}

async function saveSettings() {
  try {
    state.settings = await state.store.saveSettings(draftSettings);
    draftSettings = null;
    toast('บันทึกการตั้งค่าแล้ว');
    render();
  } catch (err) {
    alert(err.message);
  }
}

// ================= appointment form =================
const form = $('#appt-form');
const dialog = $('#appt-dialog');
let editing = null; // appointment being edited (or null for new)
let fState = { room: 'L1', cbctDates: [], skipDates: [], prevMode: 'fx1' };

function fillSelect(sel, items, placeholder) {
  sel.innerHTML = (placeholder ? `<option value="">${placeholder}</option>` : '') + items.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join('');
}

// รหัส ICD-10 ของข้อความการวินิจฉัย (เลือกจากรายการ หรือพิมพ์รหัสนำหน้าเอง)
function icd10Of(text) {
  const m = /^([A-Z]\d{2}(?:\.\d)?)\b/i.exec((text || '').trim());
  if (!m) return '';
  const code = m[1].toUpperCase();
  return ICD10.some((r) => r[0] === code) ? code : '';
}

function readForm() {
  const fd = new FormData(form);
  const { prefixSel, prefixOther, ...v } = Object.fromEntries(fd.entries());
  const prefix = prefixSel === 'other' ? (prefixOther || '').trim() : prefixSel || '';
  return {
    ...v,
    prefix,
    name: composeName(prefix, v.firstName, v.lastName),
    icd10: icd10Of(v.diagnosis),
    id: editing?.id,
    room: fState.room,
    fractions: Number(v.fractions),
    duration: Number(v.duration),
    age: v.age === '' ? '' : Number(v.age),
    cbctDates: v.cbctMode === 'custom' ? [...fState.cbctDates] : [],
    skipDates: [...fState.skipDates],
  };
}

function openForm(appt = null, defaults = {}) {
  editing = appt;
  form.reset();
  $('#form-errors').hidden = true;
  $('#suggest-list').innerHTML = '';
  const start = nextWorkday(addDays(todayISO(), 1), state.settings);
  const a = appt || {
    technique: 'VMAT',
    duration: techOf('VMAT').duration,
    fractions: 25,
    startDate: start,
    cbctMode: 'fx123_weekly',
    status: 'active',
    room: 'L1',
    icd9: ICD9_BY_TECHNIQUE.VMAT,
    ...defaults,
  };
  // แพทย์: รายชื่อจากหน้าตั้งค่า (+ ชื่อเดิมของนัดนี้ ถ้าถูกลบออกจากรายชื่อแล้ว)
  const docs = [...(state.settings.physicians || DEFAULT_PHYSICIANS)];
  if (a.physician && !docs.includes(a.physician)) docs.push(a.physician);
  $('#f-physician').innerHTML = '<option value="">- เลือกแพทย์ -</option>' + docs.map((d) => `<option>${esc(d)}</option>`).join('');
  // ICD-9-CM: รหัสเดิมที่ไม่อยู่ในรายการยังแสดงอยู่
  const icd9 = ICD9_RT.some((r) => r[0] === a.icd9) || !a.icd9 ? ICD9_RT : [...ICD9_RT, [a.icd9, '']];
  $('#f-icd9').innerHTML = '<option value="">- ไม่ระบุ -</option>' + icd9.map(([c, n]) => `<option value="${esc(c)}">${esc(c)} ${esc(n)}</option>`).join('');
  for (const el of form.elements) {
    if (el.name && a[el.name] != null) el.value = a[el.name];
  }
  // คำนำหน้า / ชื่อ (นัดจากเวอร์ชันก่อนมีแค่ชื่อเต็มในช่องเดียว)
  const known = NAME_PREFIXES.some((p) => p.id === a.prefix);
  form.prefixSel.value = !a.prefix ? '' : known ? a.prefix : 'other';
  form.prefixOther.value = known ? '' : a.prefix || '';
  if (!a.firstName && a.name) form.firstName.value = a.name;
  $('#prefix-other-wrap').hidden = form.prefixSel.value !== 'other';
  $('#icd-list').hidden = true;
  $('#site-custom').value = '';
  setSites(parseSites(a.site));
  fState = {
    room: a.room || 'L1',
    cbctDates: [...(a.cbctDates || [])],
    skipDates: [...(a.skipDates || [])],
    prevMode: a.cbctMode === 'custom' ? 'fx1' : a.cbctMode,
  };
  $('#appt-title').textContent = appt ? `แก้ไขนัด: ${appt.name}` : 'นัดผู้ป่วยใหม่';
  $('#btn-delete').hidden = !appt || !isAdmin();
  const by = [
    appt?.createdBy && `บันทึกโดย ${appt.createdBy}`,
    appt?.updatedBy && appt.updatedBy !== appt.createdBy && `แก้ไขล่าสุดโดย ${appt.updatedBy}`,
  ].filter(Boolean);
  $('#appt-meta').textContent = by.join(' · ');
  renderRoomPicker();
  updatePreview();
  dialog.showModal();
}

function renderRoomPicker() {
  $('#room-picker').innerHTML = ROOMS.map((r) => {
    const n = (state.evMap.get(form.startDate.value) || []).filter((e) => e.room === r.id && e.appt.id !== editing?.id).length;
    return `<button type="button" class="room-option" role="radio" data-room="${r.id}" aria-checked="${fState.room === r.id}" style="--rc: var(--room-${r.id})">
      <span class="swatch"></span><span><b>${r.name}</b><small>ห้อง ${r.id} · วันเริ่มฉายมีนัดแล้ว ${n} ราย</small></span></button>`;
  }).join('');
}

function updatePreview() {
  const a = readForm();
  const others = state.appts;
  const valid = a.startDate && a.fractions > 0;
  const ss = valid ? buildSessions(a, state.settings) : [];
  const conflicts = valid && /^\d\d:\d\d$/.test(a.time) && a.duration > 0 ? findConflicts(a, others, state.settings) : [];
  const conflictDates = new Set(conflicts.map((c) => c.date));

  // สรุปคอร์ส
  const notes = [];
  if (valid && ss.length) {
    notes.push(
      `ฉาย <b>${ss.length}</b> ครั้ง ตั้งแต่ <b>${fLong(ss[0].date)}</b> ถึง <b>${fLong(ss[ss.length - 1].date)}</b> · CBCT ระหว่างฉาย <b>${ss.filter((s) => s.cbct).length}</b> ครั้ง`,
    );
    if (ss[0].date !== a.startDate) notes.push(`<span class="muted">วันที่เลือก (${fMed(a.startDate)}) เป็นวันหยุด ระบบเลื่อนวันเริ่มฉายเป็น ${fMed(ss[0].date)}</span>`);
  }
  if (a.verifyDate) {
    if (!isWorkday(a.verifyDate, state.settings)) notes.push('<span class="muted">⚠ วันนัดทำ CBCT ก่อนฉายตรงกับวันหยุด</span>');
    if (ss.length && a.verifyDate > ss[0].date) notes.push('<span class="muted">⚠ วันนัดทำ CBCT ก่อนฉายอยู่หลังวันเริ่มฉาย</span>');
  }
  $('#session-summary').innerHTML = notes.join('<br>');

  const rows = [];
  if (a.verifyDate)
    rows.push(`<tr class="verify${conflictDates.has(a.verifyDate) ? ' conflict' : ''}"><td>—</td><td>${fLong(a.verifyDate)} · ${esc(a.verifyTime || a.time)}</td><td>✓ ก่อนฉาย</td><td></td></tr>`);
  for (const s of ss) {
    rows.push(`<tr class="${conflictDates.has(s.date) ? 'conflict' : ''}"><td>${s.fx}</td><td>${fLong(s.date)}</td>
      <td><input type="checkbox" class="cbct-toggle" data-date="${s.date}" ${s.cbct ? 'checked' : ''} aria-label="ทำ CBCT วันที่ ${fMed(s.date)}"></td>
      <td><button type="button" class="btn small ghost" data-skip="${s.date}">งด</button></td></tr>`);
  }
  $('#session-table tbody').innerHTML = rows.join('') || '<tr><td colspan="4" class="empty">กรอกวันเริ่มฉายและจำนวนครั้ง</td></tr>';
  renderCbctCalendar(a, ss, conflictDates);
  $('#skip-list').innerHTML = fState.skipDates.length
    ? '<span class="muted small">วันที่งดฉาย:</span>' +
      fState.skipDates.sort().map((d) => `<button type="button" class="chip" data-unskip="${d}">${fMed(d)} ✕</button>`).join('')
    : '';

  const box = $('#conflicts');
  box.hidden = !conflicts.length;
  if (conflicts.length) {
    box.innerHTML = `<b>⚠ เวลานัดซ้อนกับผู้ป่วยรายอื่นในห้อง ${esc(roomOf(a.room).label)} ${conflicts.length} ครั้ง</b> — แนะนำกด “หาเวลาว่างอัตโนมัติ”
      <ul>${conflicts
        .slice(0, 30)
        .map((c) => `<li>${fMed(c.date)} ${esc(c.time)} น. (${c.duration} นาที) ชนกับ ${esc(c.with.name)} HN ${esc(c.with.hn)}</li>`)
        .join('')}</ul>`;
  }
  return { a, ss, conflicts };
}

// ---------- ตำแหน่งที่ฉาย (เลือกได้หลายตำแหน่ง) ----------
let sites = [];

function setSites(list) {
  sites = list;
  $('#f-site').value = sites.join(SITE_SEP);
  $('#site-selected').innerHTML = sites.length
    ? sites
        .map((x) => `<span class="site-tag">${esc(x)}<button type="button" data-site-remove="${esc(x)}" aria-label="เอา ${esc(x)} ออก">✕</button></span>`)
        .join('')
    : '<span class="empty-hint">ยังไม่ได้เลือก — คลิกตำแหน่งด้านล่าง</span>';
  $('#site-options').innerHTML = TREATMENT_SITES.map(
    (x) => `<button type="button" class="chip" data-site="${esc(x)}" aria-pressed="${sites.includes(x)}">${esc(x)}</button>`,
  ).join('');
}

function addCustomSite() {
  const v = $('#site-custom').value.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  if (!v) return;
  if (!sites.includes(v)) setSites([...sites, v]);
  $('#site-custom').value = '';
  $('#site-custom').focus();
}

// ---------- ปฏิทิน CBCT รายเดือนในฟอร์ม ----------
let cbctView = 'table';
try {
  cbctView = localStorage.getItem('rtq-cbct-view') === 'calendar' ? 'calendar' : 'table';
} catch {
  /* ใช้ค่าเริ่มต้น */
}

function setCbctView(view) {
  cbctView = view;
  try {
    localStorage.setItem('rtq-cbct-view', view);
  } catch {
    /* ไม่บันทึกก็ได้ */
  }
  for (const b of $$('[data-cbct-view]')) b.setAttribute('aria-pressed', String(b.dataset.cbctView === view));
  $('#cbct-cal').hidden = view !== 'calendar';
  $('#session-table-wrap').hidden = view !== 'table';
  $('#cbct-hint').textContent =
    view === 'calendar'
      ? 'คลิกวันฉายในปฏิทินเพื่อเลือกหรือยกเลิกวันทำ CBCT · คลิกวันที่งดฉายเพื่อนำกลับมา'
      : 'คลิกช่อง CBCT ในตารางเพื่อกำหนดวันทำ CBCT เอง หรือกด “งด” เพื่อเลื่อนวันฉายนั้นออกไป';
}

function renderCbctCalendar(a, ss, conflictDates) {
  const box = $('#cbct-cal');
  if (!ss.length) {
    box.innerHTML = '<p class="empty">กรอกวันเริ่มฉายและจำนวนครั้ง</p>';
    return;
  }
  const byDate = new Map(ss.map((s) => [s.date, s]));
  const skipped = new Set(fState.skipDates);
  const first = [a.verifyDate, ss[0].date].filter(Boolean).sort()[0];
  const last = ss[ss.length - 1].date;
  const months = [];
  for (let m = first.slice(0, 7); m <= last.slice(0, 7); ) {
    months.push(m);
    const [y, mo] = m.split('-').map(Number);
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  }
  box.innerHTML =
    `<div class="cc-months">${months
      .map((m) => {
        const start = startOfWeek(`${m}-01`);
        let cells = '';
        for (let i = 0; i < 42; i++) {
          const d = addDays(start, i);
          if (i % 7 === 0 && i >= 35 && d.slice(0, 7) !== m) break; // ไม่ต้องแสดงแถวสุดท้ายที่ว่าง
          if (d.slice(0, 7) !== m) {
            cells += '<span class="cc-day pad"></span>';
            continue;
          }
          const s = byDate.get(d);
          const num = parseISO(d).getUTCDate();
          const conflict = conflictDates.has(d) ? ' conflict' : '';
          if (s) {
            cells += `<button type="button" class="cc-day fx${s.cbct ? ' cbct' : ''}${conflict}" data-cbct-date="${d}" aria-pressed="${s.cbct}"
              aria-label="${fLong(d)} ครั้งที่ ${s.fx}${s.cbct ? ' ทำ CBCT' : ''}"><b>${num}</b><span>Fx ${s.fx}</span>${s.cbct ? '<em>CBCT</em>' : ''}</button>`;
          } else if (skipped.has(d)) {
            cells += `<button type="button" class="cc-day skip" data-unskip="${d}" aria-label="${fLong(d)} งดฉาย คลิกเพื่อนำกลับมา"><b>${num}</b><span>งด</span></button>`;
          } else if (d === a.verifyDate) {
            cells += `<span class="cc-day verify${conflict}" title="นัดทำ CBCT ก่อนเริ่มฉาย"><b>${num}</b><em>CBCT</em><span>ก่อนฉาย</span></span>`;
          } else {
            const hol = holidayName(d);
            cells += `<span class="cc-day${isWorkday(d, state.settings) ? '' : ' off'}" ${hol ? `title="${esc(hol)}"` : ''}><b>${num}</b></span>`;
          }
        }
        return `<div class="cc-month"><div class="cc-title">${F_MONTH.format(parseISO(`${m}-01`))}</div>
          <div class="cc-grid">${['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'].map((x) => `<span class="cc-dow">${x}</span>`).join('')}${cells}</div></div>`;
      })
      .join('')}</div>
    <div class="cc-legend"><span><i class="cc-key fx"></i>วันฉาย</span><span><i class="cc-key cbct"></i>ทำ CBCT</span>
      <span><i class="cc-key verify"></i>CBCT ก่อนฉาย</span><span><i class="cc-key off"></i>วันหยุด</span><span><i class="cc-key conflict"></i>เวลาซ้อน</span></div>`;
}

// เลือก/ยกเลิก CBCT วันใดวันหนึ่ง → เปลี่ยนเป็นรูปแบบ “กำหนดวันเอง”
function toggleCbct(date, on) {
  const ss = buildSessions(readForm(), state.settings);
  const set = new Set(ss.filter((s) => s.cbct).map((s) => s.date));
  if (on ?? !set.has(date)) set.add(date);
  else set.delete(date);
  fState.cbctDates = [...set];
  form.cbctMode.value = 'custom';
  updatePreview();
}

async function submitForm(ev) {
  ev.preventDefault();
  const { a, conflicts } = updatePreview();
  const errors = [];
  if (!a.hn?.trim()) errors.push('กรุณาระบุ HN');
  if (!a.firstName?.trim()) errors.push('กรุณาระบุชื่อผู้ป่วย');
  if (form.prefixSel.value === 'other' && !a.prefix) errors.push('กรุณาระบุคำนำหน้า หรือเลือกจากรายการ');
  if (!a.startDate) errors.push('กรุณาระบุวันเริ่มฉาย');
  if (!(a.fractions >= 1 && a.fractions <= 60)) errors.push('จำนวนครั้งต้องอยู่ระหว่าง 1–60');
  if (!/^\d\d:\d\d$/.test(a.time || '')) errors.push('กรุณาระบุเวลานัด');
  if (!(a.duration >= 5)) errors.push('กรุณาระบุระยะเวลาต่อครั้ง');
  const dup = state.appts.find((x) => x.id !== a.id && x.hn === a.hn?.trim() && x.status === 'active' && phase(x) !== 'completed');
  if (errors.length) {
    $('#form-errors').textContent = errors.join('\n');
    $('#form-errors').hidden = false;
    return;
  }
  if (dup && !confirm(`ผู้ป่วย HN ${a.hn} มีนัดที่ยังไม่สิ้นสุดอยู่แล้ว (${dup.name} ห้อง ${dup.room}) ต้องการบันทึกเพิ่มหรือไม่?`)) return;
  if (conflicts.length && !confirm(`มีเวลานัดซ้อนกับผู้ป่วยรายอื่น ${conflicts.length} ครั้ง ต้องการบันทึกต่อหรือไม่?`)) return;
  const { id, ...payload } = a;
  try {
    if (editing) {
      const rec = await state.store.update(editing.id, payload);
      state.appts = state.appts.map((x) => (x.id === rec.id ? rec : x));
    } else {
      state.appts.push(await state.store.create(payload));
    }
    dialog.close();
    toast(editing ? 'บันทึกการแก้ไขแล้ว' : 'บันทึกนัดใหม่แล้ว');
    render();
  } catch (err) {
    $('#form-errors').textContent = err.message;
    $('#form-errors').hidden = false;
  }
}

async function deleteAppt() {
  if (!editing || !confirm(`ลบนัดของ ${editing.name} (HN ${editing.hn}) ใช่หรือไม่? หากผู้ป่วยไม่มาฉายแล้ว แนะนำให้เปลี่ยนสถานะเป็น “ยกเลิก” แทน`)) return;
  try {
    await state.store.remove(editing.id);
    state.appts = state.appts.filter((x) => x.id !== editing.id);
    dialog.close();
    toast('ลบนัดแล้ว');
    render();
  } catch (err) {
    alert(err.message);
  }
}

function openById(id) {
  const a = state.appts.find((x) => x.id === id);
  if (a) openForm(a);
}

// ================= demo data =================
async function loadDemo(silent = false) {
  if (!silent && !confirm('เพิ่มข้อมูลผู้ป่วยตัวอย่าง (สมมติ) 30 รายเพื่อทดลองใช้งาน?')) return;
  const male = ['สมชาย', 'บุญมี', 'ประเสริฐ', 'ทองดี', 'อินทร', 'ปัญญา', 'คำปุ่น'];
  const female = ['สมศรี', 'จันทร์เพ็ญ', 'มาลี', 'วิไล', 'สุดา', 'แสงเดือน', 'บัวผัน', 'ศรีนวล'];
  const last = ['ใจดี', 'มีสุข', 'แก้วมา', 'ทองคำ', 'ศรีวงศ์', 'คำแสน', 'อินต๊ะ', 'ปัญญาดี', 'บุญเรือง', 'จันทร์แก้ว'];
  // [ICD-10, ตำแหน่งที่ฉาย, เทคนิค, จำนวนครั้ง, เพศ]
  const cases = [
    ['C53.9', 'Whole pelvis, Para-aortic', 'VMAT', 25, 'หญิง'], ['C50.4', 'Breast (Lt), Supraclavicular (Lt)', '3DCRT', 15, 'หญิง'],
    ['C50.9', 'Chest wall (Rt), Supraclavicular (Rt), Axilla (Rt)', '3DCRT', 15, 'หญิง'], ['C11.9', 'Nasopharynx', 'IMRT', 35, ''],
    ['C34.1', 'Lung', 'SBRT', 5, ''], ['C20', 'Whole pelvis', 'VMAT', 25, ''], ['C61', 'Prostate', 'VMAT', 28, 'ชาย'],
    ['C79.3', 'Brain (partial)', 'SRS', 1, ''], ['C15.4', 'Esophagus', 'IMRT', 25, ''], ['C79.5', 'Bone (palliative)', '2D', 10, ''],
  ];
  const docs = state.settings.physicians?.length ? state.settings.physicians : DEFAULT_PHYSICIANS;
  const pick = (arr, i) => arr[i % arr.length];
  const today = todayISO();
  const created = [];
  for (let i = 0; i < 30; i++) {
    const [icd10, site, technique, fractions, sexOf] = pick(cases, i * 7 + 3);
    const sex = sexOf || pick(['ชาย', 'หญิง'], i);
    const prefix = sex === 'ชาย' ? (i % 9 === 4 ? 'พระภิกษุ' : 'นาย') : i % 2 ? 'นาง' : 'นางสาว';
    const firstName = sex === 'ชาย' ? pick(male, i * 5) : pick(female, i * 5);
    const lastName = `${pick(last, i * 3 + 1)} (ตัวอย่าง)`;
    const room = technique === 'SRS' || technique === 'SBRT' ? 'L3' : pick(['L1', 'L2', 'L3'], i);
    const startDate = nextWorkday(addDays(today, -30 + i * 2), state.settings);
    const a = {
      hn: String(6800000 + i * 137),
      prefix,
      firstName,
      lastName,
      name: composeName(prefix, firstName, lastName),
      age: 35 + ((i * 7) % 45),
      sex,
      phone: '',
      icd10,
      diagnosis: `${icd10} ${ICD10.find((r) => r[0] === icd10)[1]}`,
      site,
      icd9: ICD9_BY_TECHNIQUE[technique],
      physician: pick(docs, i),
      technique,
      room,
      dosePerFx: technique === 'SRS' ? '2000 cGy' : technique === 'SBRT' ? '1000 cGy' : '200 cGy',
      fractions,
      simDate: addDays(startDate, -10),
      verifyDate: i % 3 === 0 ? nextWorkday(addDays(startDate, -2), state.settings) : '',
      verifyTime: '',
      startDate,
      time: '',
      duration: techOf(technique).duration,
      cbctMode: technique === 'SRS' || technique === 'SBRT' ? 'daily' : pick(['fx123_weekly', 'weekly', 'fx1'], i),
      cbctDates: [],
      skipDates: [],
      status: 'active',
      notes: '',
    };
    a.time = suggestTimes(a, [...state.appts, ...created], state.settings, 1)[0] || '08:00';
    created.push({ ...a, id: `demo-${i}` });
  }
  try {
    for (const { id, ...a } of created) state.appts.push(await state.store.create(a));
    if (!silent) toast('เพิ่มข้อมูลตัวอย่างแล้ว');
    render();
  } catch (err) {
    alert(err.message);
  }
}

// ================= events =================
function bind() {
  $('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (b) setView(b.dataset.view);
  });
  $('#btn-new').addEventListener('click', () => openForm());

  // ข้อมูลผู้ป่วย: คลิกที่รายการใด ๆ ที่มี data-id เพื่อเปิดแก้ไข
  document.addEventListener('click', (e) => {
    const li = e.target.closest('main [data-id]');
    if (!li || e.target.closest('[data-act]') || li.tagName === 'TR') return;
    openById(li.dataset.id);
  });

  $('#dash-date').addEventListener('change', (e) => {
    state.dashDate = e.target.value || todayISO();
    renderDashboard();
  });
  $('#dash-today').addEventListener('click', () => {
    state.dashDate = todayISO();
    renderDashboard();
  });

  const shiftMonth = (n) => {
    const [y, m] = state.calMonth.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    state.calMonth = d.toISOString().slice(0, 7);
    renderCalendar();
  };
  $('#cal-prev').addEventListener('click', () => shiftMonth(-1));
  $('#cal-next').addEventListener('click', () => shiftMonth(1));
  $('#cal-today').addEventListener('click', () => {
    state.calMonth = todayISO().slice(0, 7);
    state.selectedDay = todayISO();
    renderCalendar();
  });
  $('#cal-rooms').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-room]');
    if (!b) return;
    const r = b.dataset.room;
    if (state.calRooms.has(r) && state.calRooms.size > 1) state.calRooms.delete(r);
    else state.calRooms.add(r);
    renderCalendar();
  });
  $('#cal-type').addEventListener('change', (e) => {
    state.calType = e.target.value;
    renderCalendar();
  });
  $('#calendar').addEventListener('click', (e) => {
    const c = e.target.closest('.cal-day');
    if (!c) return;
    state.selectedDay = c.dataset.date;
    if (c.classList.contains('other')) state.calMonth = c.dataset.date.slice(0, 7);
    renderCalendar();
    $('#day-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  $('#day-print').addEventListener('click', printDay);

  for (const id of ['#pt-search', '#pt-room', '#pt-tech', '#pt-phase']) $(id).addEventListener('input', renderPatients);
  $('#pt-table').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const a = state.appts.find((x) => x.id === tr.dataset.id);
    if (e.target.closest('[data-act="slip"]')) printSlip(a);
    else openForm(a);
  });
  $('#pt-export').addEventListener('click', exportCsv);

  // settings
  $('#set-rooms').addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.room) draftSettings.rooms[el.dataset.room][el.dataset.k] = el.value;
  });
  $('#set-slot').addEventListener('change', (e) => (draftSettings.slotMinutes = Number(e.target.value)));
  $('#set-workdays').addEventListener('click', (e) => {
    const b = e.target.closest('[data-dow]');
    if (!b) return;
    const d = Number(b.dataset.dow);
    const w = draftSettings.workdays;
    draftSettings.workdays = w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort();
    renderSettings();
  });
  $('#hol-add').addEventListener('click', () => {
    const date = $('#hol-date').value;
    if (!date) return;
    draftSettings.holidays = [
      ...draftSettings.holidays.filter((h) => h.date !== date),
      { date, name: $('#hol-name').value.trim() || 'วันหยุด' },
    ].sort((a, b) => a.date.localeCompare(b.date));
    $('#hol-date').value = '';
    $('#hol-name').value = '';
    renderSettings();
  });
  $('#hol-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    draftSettings.holidays = draftSettings.holidays.filter((h) => h.date !== b.dataset.del);
    renderSettings();
  });
  $('#set-save').addEventListener('click', saveSettings);
  $('#backup-export').addEventListener('click', () =>
    download(`rt-queue-backup-${todayISO()}.json`, JSON.stringify({ appointments: state.appts, settings: state.settings }, null, 2), 'application/json'),
  );
  $('#backup-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.appointments)) throw new Error('ไฟล์สำรองไม่ถูกต้อง');
      if (!confirm(`นำเข้าข้อมูล ${data.appointments.length} รายการ? ข้อมูลปัจจุบันทั้งหมดจะถูกแทนที่`)) return;
      const res = await state.store.importAll(data);
      state.appts = res.appointments;
      state.settings = res.settings;
      draftSettings = null;
      toast('นำเข้าข้อมูลแล้ว');
      render();
    } catch (err) {
      alert(err.message);
    }
  });
  $('#demo-load').addEventListener('click', () => loadDemo());

  // form
  for (const b of $$('[data-close]', dialog)) b.addEventListener('click', () => dialog.close());
  form.addEventListener('submit', submitForm);
  form.addEventListener('input', (e) => {
    if (e.target.classList.contains('cbct-toggle')) return; // จัดการใน change ของตาราง
    const n = e.target.name;
    if (n === 'technique') {
      form.duration.value = techOf(e.target.value).duration;
      if (ICD9_BY_TECHNIQUE[e.target.value]) form.icd9.value = ICD9_BY_TECHNIQUE[e.target.value];
    }
    if (n === 'prefixSel') {
      const p = NAME_PREFIXES.find((x) => x.id === e.target.value);
      if (p) form.sex.value = p.sex;
      $('#prefix-other-wrap').hidden = e.target.value !== 'other';
      if (e.target.value === 'other') form.prefixOther.focus();
    }
    if (n === 'cbctMode') {
      if (e.target.value === 'custom') {
        // เริ่มจากวันที่ตามรูปแบบเดิม แล้วให้ผู้ใช้ติ๊กเพิ่ม/ลดเอง
        const ss = buildSessions({ ...readForm(), cbctMode: fState.prevMode }, state.settings);
        fState.cbctDates = ss.filter((s) => s.cbct).map((s) => s.date);
      } else fState.prevMode = e.target.value;
    }
    if (n === 'startDate') renderRoomPicker();
    if (['startDate', 'time', 'duration', 'fractions', 'technique'].includes(n)) $('#suggest-list').innerHTML = '';
    updatePreview();
  });
  $('#room-picker').addEventListener('click', (e) => {
    const b = e.target.closest('[data-room]');
    if (!b) return;
    fState.room = b.dataset.room;
    $('#suggest-list').innerHTML = '';
    renderRoomPicker();
    updatePreview();
  });
  $('#session-table').addEventListener('change', (e) => {
    const cb = e.target.closest('.cbct-toggle');
    if (cb) toggleCbct(cb.dataset.date, cb.checked);
  });
  for (const b of $$('[data-cbct-view]')) b.addEventListener('click', () => setCbctView(b.dataset.cbctView));
  $('#cbct-cal').addEventListener('click', (e) => {
    const day = e.target.closest('[data-cbct-date]');
    if (day) return toggleCbct(day.dataset.cbctDate);
    const un = e.target.closest('[data-unskip]');
    if (un) {
      fState.skipDates = fState.skipDates.filter((d) => d !== un.dataset.unskip);
      updatePreview();
    }
  });

  // ตำแหน่งที่ฉาย: คลิกเพื่อเลือก/ยกเลิก
  $('#site-options').addEventListener('click', (e) => {
    const b = e.target.closest('[data-site]');
    if (!b) return;
    const x = b.dataset.site;
    setSites(sites.includes(x) ? sites.filter((s) => s !== x) : [...sites, x]);
  });
  $('#site-selected').addEventListener('click', (e) => {
    const b = e.target.closest('[data-site-remove]');
    if (b) setSites(sites.filter((s) => s !== b.dataset.siteRemove));
  });
  $('#site-add').addEventListener('click', addCustomSite);
  $('#site-custom').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault(); // ไม่ให้ Enter ส่งฟอร์ม
    addCustomSite();
  });

  // การวินิจฉัย ICD-10: ค้นหาแล้วเลือกจากรายการ
  const dxInput = $('#f-diagnosis');
  const dxList = $('#icd-list');
  let dxActive = -1;
  const dxItems = () => $$('li[data-code]', dxList);
  const showDx = () => {
    const rows = searchIcd10(dxInput.value, 40);
    dxActive = -1;
    dxList.innerHTML = rows.length
      ? rows
          .map(
            ([code, en, th]) => `<li role="option" data-code="${code}" data-label="${esc(`${code} ${en}`)}"><b>${code}</b>
              <span>${esc(en)}${th ? `<small>${esc(th)}</small>` : ''}</span></li>`,
          )
          .join('')
      : '<li class="muted">ไม่พบในรายการ — พิมพ์การวินิจฉัยเองได้</li>';
    dxList.hidden = false;
    dxInput.setAttribute('aria-expanded', 'true');
  };
  const hideDx = () => {
    dxList.hidden = true;
    dxInput.setAttribute('aria-expanded', 'false');
  };
  const pickDx = (li) => {
    dxInput.value = li.dataset.label;
    hideDx();
    updatePreview();
  };
  dxInput.addEventListener('focus', showDx);
  dxInput.addEventListener('input', showDx);
  dxInput.addEventListener('blur', () => setTimeout(hideDx, 150));
  dxInput.addEventListener('keydown', (e) => {
    const items = dxItems();
    if (dxList.hidden || !items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      dxActive = (dxActive + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((li, i) => li.classList.toggle('active', i === dxActive));
      items[dxActive].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && dxActive >= 0) {
      e.preventDefault();
      pickDx(items[dxActive]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      hideDx();
    }
  });
  dxList.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li[data-code]');
    if (!li) return;
    e.preventDefault(); // ไม่ให้ช่องค้นหาเสียโฟกัสก่อนเลือก
    pickDx(li);
  });

  // รายชื่อแพทย์ในหน้าตั้งค่า
  $('#phys-add').addEventListener('click', () => {
    const name = $('#phys-name').value.trim();
    if (!name) return;
    draftSettings.physicians = [...(draftSettings.physicians || []).filter((p) => p !== name), name];
    $('#phys-name').value = '';
    renderSettings();
  });
  $('#phys-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#phys-add').click();
  });
  $('#phys-list').addEventListener('click', (e) => {
    const del = e.target.closest('[data-phys-del]');
    const up = e.target.closest('[data-phys-up]');
    const list = [...draftSettings.physicians];
    if (del) list.splice(Number(del.dataset.physDel), 1);
    else if (up) {
      const i = Number(up.dataset.physUp);
      [list[i - 1], list[i]] = [list[i], list[i - 1]];
    } else return;
    draftSettings.physicians = list;
    renderSettings();
  });
  $('#session-table').addEventListener('click', (e) => {
    const b = e.target.closest('[data-skip]');
    if (!b) return;
    fState.skipDates.push(b.dataset.skip);
    updatePreview();
  });
  $('#skip-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-unskip]');
    if (!b) return;
    fState.skipDates = fState.skipDates.filter((d) => d !== b.dataset.unskip);
    updatePreview();
  });
  $('#btn-suggest').addEventListener('click', () => {
    const a = readForm();
    if (!a.startDate || !(a.fractions > 0)) return;
    const times = suggestTimes({ ...a, verifyTime: a.verifyTime || '' }, state.appts, state.settings, 8);
    $('#suggest-list').innerHTML = times.length
      ? times.map((t) => `<button type="button" class="chip" data-time="${t}">${t}</button>`).join('')
      : '<span class="muted small">ไม่พบเวลาว่างตลอดคอร์สในห้องนี้ ลองเปลี่ยนห้องหรือวันเริ่มฉาย</span>';
  });
  $('#suggest-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-time]');
    if (!b) return;
    form.time.value = b.dataset.time;
    for (const c of $$('[data-time]', $('#suggest-list'))) c.setAttribute('aria-pressed', String(c === b));
    updatePreview();
  });
  $('#btn-delete').addEventListener('click', deleteAppt);

  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => state.view === 'dashboard' && renderDashboard(), 150);
  });
  window.addEventListener('hashchange', () => {
    const v = location.hash.slice(1);
    if (v && v !== state.view && $(`#view-${v}`)) setView(v);
  });
}

// ================= ผู้ใช้และการเข้าสู่ระบบ =================
const isAdmin = () => !state.me || state.me.isAdmin; // ไม่มีระบบเข้าสู่ระบบ = ใช้ได้ทุกเมนู

function applyData(data) {
  state.appts = data.appointments || [];
  state.settings = data.settings;
  state.settings.physicians ||= [...DEFAULT_PHYSICIANS];
  state.me = data.me || null;
  const me = state.me;
  $('#user-chip').hidden = !me;
  if (me) {
    $('#user-name').textContent = me.fullName;
    $('#user-role').textContent = me.role + (me.isAdmin ? ' · ผู้ดูแลระบบ' : '');
    $('#user-avatar').textContent = [...me.fullName.replace(/^(นาย|นางสาว|นาง|ดร\.|นพ\.|พญ\.)/, '')][0] || '?';
  }
  // เมนูตั้งค่าเฉพาะผู้ดูแลระบบ
  $('.tabs [data-view="settings"]').hidden = !isAdmin();
  if (!isAdmin() && state.view === 'settings') setView('dashboard');
}

let onLogin = null; // เรียกเมื่อเข้าสู่ระบบสำเร็จ (ตอนเปิดหน้าครั้งแรก) — ถ้าไม่มี จะโหลดข้อมูลใหม่แล้ววาดหน้าใหม่

function showLogin({ error = '', status = '', onLogin: cb = null } = {}) {
  if (cb) onLogin = cb;
  const d = $('#login-screen');
  $('#login-error').textContent = error;
  $('#login-error').hidden = !error;
  $('#login-status').textContent = status;
  $('#login-status').hidden = !status;
  $('#login-form').classList.toggle('busy', !!status);
  for (const el of $$('#login-form input, #login-form button')) el.disabled = !!status;
  if (!d.open) d.showModal();
  if (!status) setTimeout(() => $('#login-user').focus(), 0);
}

function bindLogin(cfg) {
  if (cfg.workspaceUrl) $('#login-ws-link').href = cfg.workspaceUrl;
  else $('#login-ws-link').closest('p').hidden = true;
  $('#login-screen').addEventListener('cancel', (e) => e.preventDefault()); // Esc ปิดไม่ได้
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = $('#login-user').value.trim();
    const pass = $('#login-pass').value;
    if (!user || !pass) return showLogin({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
    showLogin({ status: 'กำลังเข้าสู่ระบบ…' });
    try {
      await state.store.login(user, pass);
      const data = await state.store.loadOrNull();
      if (!data) throw new Error('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่');
      $('#login-pass').value = '';
      showLogin(); // ล้างข้อความสถานะ
      if (onLogin) {
        const cb = onLogin;
        onLogin = null;
        cb(data);
      } else {
        applyData(data);
        render();
        $('#login-screen').close();
        toast(`เข้าสู่ระบบแล้ว: ${data.me?.fullName || ''}`);
      }
    } catch (err) {
      showLogin({ error: err.message });
    }
  });
  $('#btn-logout').addEventListener('click', async () => {
    if (dialog.open) dialog.close();
    await state.store.logout();
    state.me = null;
    $('#user-chip').hidden = true;
    showLogin({ status: '' });
    $('#login-user').value = '';
  });
}

// ================= init =================
async function refreshData() {
  if (document.visibilityState !== 'visible' || dialog.open || refreshData.busy) return;
  refreshData.busy = true;
  try {
    const data = await state.store.load();
    applyData(data);
    if (state.view !== 'settings') render();
  } catch {
    /* ใช้ข้อมูลเดิมไปก่อน */
  } finally {
    refreshData.busy = false;
  }
}

async function init() {
  fillSelect($('#f-technique'), TECHNIQUES);
  fillSelect($('#f-cbct'), CBCT_MODES);
  fillSelect($('#f-status'), STATUSES);
  $('#f-prefix').innerHTML =
    '<option value="">- ไม่ระบุ -</option>' + NAME_PREFIXES.map((p) => `<option>${p.id}</option>`).join('') + '<option value="other">อื่นๆ (กรอกเอง)</option>';
  setCbctView(cbctView);
  $('#pt-room').innerHTML += ROOMS.map((r) => `<option value="${r.id}">${r.label}</option>`).join('');
  $('#pt-tech').innerHTML += TECHNIQUES.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');

  const badge = $('#mode-badge');
  let opened;
  try {
    opened = await openStore();
  } catch (err) {
    badge.textContent = 'โหลดข้อมูลไม่สำเร็จ';
    badge.classList.add('local');
    $('main').innerHTML = `<div class="notice">โหลดข้อมูลไม่สำเร็จ: ${esc(err.message)}<br>ตรวจสอบว่าบัญชีนี้มีสิทธิ์เข้าถึง Google Sheet ของระบบ แล้วโหลดหน้าใหม่</div>`;
    return;
  }
  const { store } = opened;
  let { data } = opened;
  state.store = store;
  const cfg = globalThis.RTQ_CONFIG || {};
  if (store.mode === 'gas' && cfg.auth) {
    bindLogin(cfg);
    store.onExpired = () => showLogin({ error: 'หมดเวลาการเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่' });
    let error = '';
    if (cfg.sso) {
      // มาจากปุ่มใน LPCH RO Workspace: แลกบัตรผ่านเป็นการเข้าสู่ระบบ
      showLogin({ status: 'กำลังเข้าสู่ระบบด้วยบัญชี LPCH RO Workspace…' });
      try {
        await store.sso(cfg.sso);
        data = await store.loadOrNull();
      } catch (err) {
        error = err.message;
      }
    }
    if (!data) data = await new Promise((resolve) => showLogin({ error, onLogin: resolve }));
    $('#login-screen').close();
  }
  applyData(data);
  badge.textContent = { server: 'เชื่อมต่อเซิร์ฟเวอร์', gas: 'เชื่อมต่อ Google Sheet', local: 'โหมดออฟไลน์ (เก็บในเบราว์เซอร์)' }[store.mode];
  badge.classList.toggle('local', store.mode === 'local');

  bind();
  const v = location.hash.slice(1);
  setView($(`#view-${v}`) ? v : 'dashboard');
  // ผู้ใช้หลายเครื่องใช้ข้อมูลร่วมกัน: โหลดข้อมูลล่าสุดเมื่อกลับมาที่หน้านี้
  if (store.mode !== 'local') document.addEventListener('visibilitychange', refreshData);
  // ไฟล์ตัวอย่าง (preview.html): ใส่ข้อมูลสมมติให้อัตโนมัติเมื่อยังไม่มีข้อมูล
  if (window.RTQ_PREVIEW && !state.appts.length) await loadDemo(true);
}

init();
