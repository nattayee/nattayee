'use strict';

/* =========================================================
 * HDR Activity — บันทึก activity รายวัน เทียบค่าคำนวณจากการสลายตัว
 * ข้อมูลเก็บใน localStorage ของเบราว์เซอร์
 * ========================================================= */

const STORE_KEY = 'hdr-activity-v1';
const THEME_KEY = 'hdr-activity-theme';
const DEFAULT_SHEET = 'https://docs.google.com/spreadsheets/d/1NUgqDvc540aHviRw-8IaO86FT7CwwJktmiA_dPbDFlQ/edit';
// ชีตที่เคยใช้ก่อนหน้า — ลิงก์ที่บันทึกไว้จะถูกย้ายมาที่ DEFAULT_SHEET
const OLD_SHEET_IDS = ['1BX2NyFl9HosiyNAq1nEwghkw0c3K_zfmeTPQi_4cZZ4', '1_AlJgpz9x5gqFVBrkN1EEeMync2Jg2RbzIdxg5Iovnw'];
const ISOTOPES = { 'Co-60': 1925.2, 'Ir-192': 73.83 };
const DAY = 86400000;
const LN2 = Math.LN2;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ---------------- state ---------------- */

function defaults() {
  return {
    settings: {
      isotope: 'Co-60', halfLife: ISOTOPES['Co-60'], unit: 'GBq', tolerance: 1,
      decimals: 4, yearStyle: 'be', dateOrder: 'mdy', sheetUrl: DEFAULT_SHEET, sheetTab: '',
    },
    // source ที่ใช้อยู่ตามชีตของงาน (BB-AC1142, A0 74.64 GBq, acceptance 14/05/2025)
    sources: [{ id: 'bb-ac1142', serial: 'BB-AC1142', activity: 74.64, refDate: '2025-05-14', start: '' }],
    records: [],
  };
}

function load() {
  const d = defaults();
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return d;
    const s = JSON.parse(raw);
    if (s.settings && OLD_SHEET_IDS.some((id) => (s.settings.sheetUrl || '').includes(id))) s.settings.sheetUrl = DEFAULT_SHEET;
    return {
      settings: { ...d.settings, ...(s.settings || {}) },
      sources: Array.isArray(s.sources) ? s.sources : [],
      records: Array.isArray(s.records) ? s.records : [],
    };
  } catch (e) {
    return d;
  }
}

let state = load();
const ui = { range: '90', source: 'all', editingRecord: null, editingSource: null, parsed: null };

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    toast('บันทึกลงเบราว์เซอร์ไม่ได้ — กรุณาส่งออกไฟล์สำรอง', true);
  }
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------------- time helpers ---------------- */

const pad = (n) => String(n).padStart(2, '0');
function toLocalDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** วันที่อย่างเดียว ถ้าเวลาเป็น 00:00 มิฉะนั้นมีเวลาด้วย */
function toLocalInput(d) {
  const day = toLocalDate(d);
  return d.getHours() || d.getMinutes() ? `${day}T${pad(d.getHours())}:${pad(d.getMinutes())}` : day;
}
function parseLocal(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)).getTime();
}
function locale() {
  return state.settings.yearStyle === 'ce' ? 'th-TH-u-ca-gregory' : 'th-TH';
}
function fmtDate(t, withTime = true) {
  const opts = { day: 'numeric', month: 'short', year: '2-digit' };
  const d = new Date(t);
  if (withTime && (d.getHours() || d.getMinutes())) Object.assign(opts, { hour: '2-digit', minute: '2-digit' });
  return new Date(t).toLocaleString(locale(), opts);
}
function fmtAct(v) {
  return v == null || !isFinite(v) ? '–' : v.toFixed(state.settings.decimals);
}
/** ค่าที่ผู้ใช้กรอก: แสดงตามที่กรอก ไม่เติมศูนย์ */
function fmtVal(v) {
  return v == null || !isFinite(v) ? '–' : String(+v.toFixed(state.settings.decimals));
}
function fmtPct(v) {
  if (v == null || !isFinite(v)) return '–';
  return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2) + '%';
}

/* ---------------- physics ---------------- */

function sourceStart(src) {
  return parseLocal(src.start) ?? parseLocal(src.refDate);
}
function sortedSources() {
  return [...state.sources].sort((a, b) => sourceStart(a) - sourceStart(b));
}
/** source ที่ใช้งาน ณ เวลา t = source ล่าสุดที่เริ่มใช้ก่อนหรือเท่ากับ t */
function sourceAt(t) {
  let found = null;
  for (const s of sortedSources()) if (sourceStart(s) <= t) found = s;
  return found;
}
function decay(src, t) {
  const dtDays = (t - parseLocal(src.refDate)) / DAY;
  return src.activity * Math.exp(-LN2 * dtDays / state.settings.halfLife);
}
const num = (v) => (v === '' || v == null || !isFinite(+v) ? null : +v);

/** เติมค่าคำนวณ, % ต่าง, สถานะ ให้แต่ละ record */
function evaluate(rec) {
  const t = parseLocal(rec.date);
  const src = sourceAt(t);
  const manual = num(rec.expected);
  const expected = manual != null ? manual : src ? decay(src, t) : null;
  const measured = num(rec.measured);
  const diff = expected && measured != null ? (measured - expected) / expected * 100 : null;
  const tol = state.settings.tolerance;
  const status = diff == null ? 'na' : Math.abs(diff) <= tol + 1e-9 ? 'ok' : 'bad';
  return { ...rec, t, src, expected, measured, diff, status, expectedFrom: manual != null ? 'manual' : src ? 'decay' : null };
}
function evaluatedRecords() {
  return state.records.map(evaluate).filter((r) => r.t != null).sort((a, b) => a.t - b.t);
}

/* ---------------- toast ---------------- */

let toastTimer;
function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast' + (isError ? ' error' : '');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, isError ? 6000 : 3000);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- theme ---------------- */

function readTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { return 'auto'; }
}
function applyTheme(mode) {
  if (mode === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', mode);
  $('#themeToggle').textContent = 'ธีม: ' + ({ auto: 'อัตโนมัติ', light: 'สว่าง', dark: 'มืด' }[mode]);
}
$('#themeToggle').addEventListener('click', () => {
  const order = ['auto', 'light', 'dark'];
  const next = order[(order.indexOf(readTheme()) + 1) % order.length];
  try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
  applyTheme(next);
  rebuildCharts();
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rebuildCharts);

/* ---------------- tabs ---------------- */

function showTab(name) {
  $$('.tab').forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on);
  });
  $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
  if (name === 'dashboard') renderCharts();
}
$$('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

/* =========================================================
 * Charts
 * ========================================================= */

let activityChart = null;
let diffChart = null;

/** hover/tooltip เฉพาะจุดข้อมูลที่ใกล้ตำแหน่งเมาส์ที่สุดตามแกน x (ไม่นับเส้นคำนวณ/เส้นเกณฑ์) */
if (typeof Chart !== 'undefined') {
  Chart.Interaction.modes.dataX = function (chart, e) {
    const pos = Chart.helpers.getRelativePosition(e, chart);
    let best = null;
    chart.data.datasets.forEach((ds, di) => {
      if (!ds.tooltipTarget || !chart.isDatasetVisible(di)) return;
      chart.getDatasetMeta(di).data.forEach((el, i) => {
        const d = Math.abs(el.x - pos.x);
        if (!best || d < best.d) best = { d, element: el, datasetIndex: di, index: i };
      });
    });
    return best ? [{ element: best.element, datasetIndex: best.datasetIndex, index: best.index }] : [];
  };
}

const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function filteredRecords() {
  let recs = evaluatedRecords();
  if (ui.source !== 'all') recs = recs.filter((r) => r.src && r.src.id === ui.source);
  if (ui.range !== 'all' && recs.length) {
    const end = recs[recs.length - 1].t;
    const start = end - (+ui.range) * DAY;
    recs = recs.filter((r) => r.t >= start);
  }
  return recs;
}

/** จุดของเส้นค่าคำนวณ: ใช้กราฟการสลายตัวของ source แต่ละตัว (ตัดช่วงเมื่อเปลี่ยน source) */
function expectedCurve(recs) {
  if (!recs.length) return [];
  const x0 = recs[0].t;
  const x1 = recs[recs.length - 1].t;
  const srcs = sortedSources().filter((s) => ui.source === 'all' || s.id === ui.source);
  const pts = [];
  if (srcs.length) {
    const all = sortedSources();
    for (const s of srcs) {
      const i = all.indexOf(s);
      const segStart = Math.max(sourceStart(s), x0);
      const next = all[i + 1];
      const segEnd = Math.min(next ? sourceStart(next) : x1, x1);
      if (segEnd < segStart) continue;
      const n = segEnd === segStart ? 1 : 60;
      for (let k = 0; k <= n; k++) {
        const t = segStart + (segEnd - segStart) * (k / n);
        pts.push({ x: t, y: decay(s, t) });
      }
      pts.push({ x: segEnd, y: null }); // แยกช่วงระหว่าง source
    }
  }
  // record ที่กรอกค่าคำนวณเอง หรือไม่มี source รองรับ
  const manual = recs.filter((r) => r.expectedFrom === 'manual').map((r) => ({ x: r.t, y: r.expected }));
  if (!srcs.length) return manual;
  return pts;
}

function baseOptions(yTitle) {
  const ink2 = cssVar('--ink-2');
  const grid = cssVar('--grid');
  const axis = cssVar('--axis');
  const muted = cssVar('--muted');
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    parsing: false,
    interaction: { mode: 'dataX', intersect: false },
    scales: {
      x: {
        type: 'linear',
        grid: { color: grid, drawTicks: false },
        border: { color: axis },
        ticks: { color: muted, maxRotation: 0, autoSkipPadding: 16, padding: 6, callback: (v) => fmtDate(v, false) },
      },
      y: {
        grid: { color: grid, drawTicks: false },
        border: { display: false },
        ticks: { color: muted, padding: 6 },
        title: { display: true, text: yTitle, color: ink2 },
      },
    },
    plugins: {
      legend: {
        position: 'top', align: 'start',
        labels: { color: ink2, usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 14 },
      },
      tooltip: {
        backgroundColor: cssVar('--surface'),
        titleColor: cssVar('--ink'),
        bodyColor: ink2,
        borderColor: cssVar('--border'),
        borderWidth: 1,
        padding: 10,
        usePointStyle: true,
        callbacks: { title: (items) => (items.length ? fmtDate(items[0].parsed.x) : '') },
      },
    },
  };
}

function renderCharts() {
  if (typeof Chart === 'undefined') return;
  if (!$('#tab-dashboard').classList.contains('active')) return;
  const recs = filteredRecords();
  const unit = state.settings.unit;
  const tol = state.settings.tolerance;
  const s1 = cssVar('--series-1');
  const s2 = cssVar('--series-2');
  const surface = cssVar('--surface');
  const critical = cssVar('--critical');
  const muted = cssVar('--muted');
  const dense = recs.length > 60; // ข้อมูลเยอะ → จุดเล็กลง ไม่ให้บังเส้น
  const pr = dense ? 3 : 5;

  /* --- กราฟ activity --- */
  const curve = expectedCurve(recs);
  const measured = recs.filter((r) => r.measured != null).map((r) => ({ x: r.t, y: r.measured, rec: r }));
  const actData = {
    datasets: [
      {
        label: 'Activity คำนวณ', data: curve, borderColor: s1, backgroundColor: s1,
        borderWidth: 2, pointRadius: 0, pointHoverRadius: 0, tension: 0, spanGaps: false, order: 0,
      },
      {
        label: 'ค่าที่กรอก (Planning)', data: measured, tooltipTarget: true, showLine: false, borderColor: surface, backgroundColor: s2,
        borderWidth: dense ? 1 : 2, pointRadius: pr, pointHoverRadius: pr + 3, pointHitRadius: 10, order: 1,
      },
    ],
  };
  const actOpts = baseOptions(`Activity (${unit})`);
  actOpts.plugins.tooltip.callbacks.label = (item) => {
    const r = item.raw.rec;
    return [` Planning: ${fmtVal(r.measured)} ${unit}`, ` คำนวณ: ${fmtAct(r.expected)} ${unit}`, ` ต่าง: ${fmtPct(r.diff)}`].concat(r.operator ? [` MP: ${r.operator}`] : []);
  };

  /* --- กราฟ % ความต่าง --- */
  const diffs = recs.filter((r) => r.diff != null);
  const diffPts = diffs.map((r) => ({ x: r.t, y: r.diff, rec: r }));
  const xr = recs.length ? [recs[0].t, recs[recs.length - 1].t] : [0, 1];
  if (xr[0] === xr[1]) { xr[0] -= DAY; xr[1] += DAY; }
  const line = (y) => [{ x: xr[0], y }, { x: xr[1], y }];
  const diffData = {
    datasets: [
      {
        label: '% ความต่าง', data: diffPts, tooltipTarget: true, borderColor: s1, backgroundColor: diffs.map((r) => (r.status === 'bad' ? critical : s1)),
        pointBorderColor: surface, pointBorderWidth: dense ? 1 : 1.5, borderWidth: dense ? 1 : 1.5, tension: 0,
        pointStyle: diffs.map((r) => (r.status === 'bad' ? 'triangle' : 'circle')),
        pointRadius: diffs.map((r) => (r.status === 'bad' ? 7 : dense ? 3.5 : 4.5)), pointHoverRadius: 8, pointHitRadius: 10,
      },
      { label: `เกณฑ์ ±${tol}%`, data: line(tol), borderColor: muted, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0, pointStyle: 'line' },
      { label: '_low', data: line(-tol), borderColor: muted, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0 },
      { label: '_zero', data: line(0), borderColor: cssVar('--axis'), borderWidth: 1, pointRadius: 0, pointHoverRadius: 0 },
    ],
  };
  if (recs.length) {
    actOpts.scales.x.min = xr[0]; actOpts.scales.x.max = xr[1];
  }
  const diffOpts = baseOptions('% ความต่าง');
  if (recs.length) { diffOpts.scales.x.min = xr[0]; diffOpts.scales.x.max = xr[1]; }
  const maxAbs = Math.max(tol * 1.5, ...diffs.map((r) => Math.abs(r.diff) * 1.15));
  diffOpts.scales.y.suggestedMin = -maxAbs;
  diffOpts.scales.y.suggestedMax = maxAbs;
  diffOpts.scales.y.ticks.callback = (v) => v + '%';
  const ink2 = cssVar('--ink-2');
  const legendItem = (text, color, pointStyle) => ({ text, fillStyle: color, strokeStyle: color, pointStyle, lineWidth: 1.5, fontColor: ink2, hidden: false });
  diffOpts.plugins.legend.onClick = () => {};
  diffOpts.plugins.legend.labels.generateLabels = () => [
    legendItem('ผ่านเกณฑ์', s1, 'circle'),
    legendItem('เกินเกณฑ์', critical, 'triangle'),
    legendItem(`เกณฑ์ ±${tol}%`, muted, 'line'),
  ];
  diffOpts.plugins.tooltip.callbacks.label = (item) => {
    const r = item.raw.rec;
    return [` ${r.status === 'bad' ? '▲ เกินเกณฑ์' : '● ผ่านเกณฑ์'}: ${fmtPct(r.diff)}`, ` Planning ${fmtVal(r.measured)} / คำนวณ ${fmtAct(r.expected)} ${unit}`];
  };

  if (activityChart) {
    activityChart.data = actData; activityChart.options = actOpts; activityChart.update();
    diffChart.data = diffData; diffChart.options = diffOpts; diffChart.update();
  } else {
    activityChart = new Chart($('#activityChart'), { type: 'line', data: actData, options: actOpts });
    diffChart = new Chart($('#diffChart'), { type: 'line', data: diffData, options: diffOpts });
  }
}

function rebuildCharts() {
  if (activityChart) { activityChart.destroy(); activityChart = null; }
  if (diffChart) { diffChart.destroy(); diffChart = null; }
  renderCharts();
}

$$('#rangeSeg button').forEach((b) => b.addEventListener('click', () => {
  ui.range = b.dataset.range;
  renderFilters();
  renderCharts();
}));
$('#sourceFilter').addEventListener('change', (e) => { ui.source = e.target.value; renderCharts(); renderTiles(); });

/* =========================================================
 * Render: tiles, filters, tables
 * ========================================================= */

function renderFilters() {
  $$('#rangeSeg button').forEach((b) => b.classList.toggle('active', b.dataset.range === ui.range));
  const sel = $('#sourceFilter');
  if (ui.source !== 'all' && !state.sources.some((s) => s.id === ui.source)) ui.source = 'all';
  sel.innerHTML = '<option value="all">ทั้งหมด</option>' +
    sortedSources().map((s) => `<option value="${esc(s.id)}">${esc(s.serial)}</option>`).join('');
  sel.value = ui.source;
}

function renderTiles() {
  const unit = state.settings.unit;
  const all = evaluatedRecords();
  const recs = filteredRecords();
  const now = parseLocal(toLocalDate(new Date())); // คำนวณ ณ วันนี้ (นับเป็นวันเต็มเหมือนในชีต)
  const cur = sourceAt(now);
  const last = all[all.length - 1];
  const outN = recs.filter((r) => r.status === 'bad').length;
  const withDiff = recs.filter((r) => r.diff != null);
  const meanAbs = withDiff.length ? withDiff.reduce((a, r) => a + Math.abs(r.diff), 0) / withDiff.length : null;

  const tile = (label, value, sub) => `<div class="tile"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;
  const statusTxt = (r) => (r.status === 'ok' ? '<span class="status ok">✓ ผ่านเกณฑ์</span>' : r.status === 'bad' ? '<span class="status bad">▲ เกินเกณฑ์</span>' : '');
  $('#tiles').innerHTML = [
    tile('Activity คำนวณ ณ วันนี้', cur ? `${fmtAct(decay(cur, now))} <small>${esc(unit)}</small>` : '–',
      cur ? `Source ${esc(cur.serial)} · t = ${Math.round((now - parseLocal(cur.refDate)) / DAY)} วัน` : 'ยังไม่ได้เพิ่ม source'),
    tile('ค่าที่กรอกล่าสุด (Planning)', last ? `${fmtVal(last.measured)} <small>${esc(unit)}</small>` : '–', last ? fmtDate(last.t) : 'ยังไม่มีข้อมูล'),
    tile('% ความต่างล่าสุด', last ? fmtPct(last.diff) : '–', last ? `${statusTxt(last)} (เกณฑ์ ±${state.settings.tolerance}%)` : '–'),
    tile('เกินเกณฑ์ในช่วงที่เลือก', `${outN} <small>/ ${recs.length} ครั้ง</small>`, meanAbs != null ? `เฉลี่ย |% ต่าง| ${meanAbs.toFixed(2)}%` : '–'),
  ].join('');

  const hint = $('#emptyHint');
  if (!state.records.length) {
    hint.hidden = false;
    hint.innerHTML = 'ยังไม่มีข้อมูล — เริ่มจาก <a href="#" data-goto="sources">เพิ่ม source</a> แล้วกรอกค่า Planning หรือ <a href="#" data-goto="import">นำเข้าข้อมูลจาก Google Sheets</a>';
  } else if (!state.sources.length && all.some((r) => r.expected == null)) {
    hint.hidden = false;
    hint.innerHTML = 'บางรายการยังคำนวณ % ความต่างไม่ได้ — <a href="#" data-goto="sources">เพิ่ม source (activity อ้างอิง + วันที่)</a> เพื่อให้ระบบคำนวณการสลายตัว';
  } else {
    hint.hidden = true;
  }
}
$('#emptyHint').addEventListener('click', (e) => {
  const a = e.target.closest('[data-goto]');
  if (a) { e.preventDefault(); showTab(a.dataset.goto); }
});

function statusCell(r) {
  if (r.status === 'ok') return '<span class="status ok">✓ ผ่าน</span>';
  if (r.status === 'bad') return '<span class="status bad">▲ เกินเกณฑ์</span>';
  return '<span class="status na">–</span>';
}

function renderRecords() {
  const recs = evaluatedRecords().reverse();
  $('#recordCount').textContent = `(${recs.length} รายการ)`;
  $('#recordBody').innerHTML = recs.length ? recs.map((r) => `
    <tr class="${r.status === 'bad' ? 'out' : ''}">
      <td>${esc(fmtDate(r.t))}</td>
      <td>${r.src && r.expectedFrom === 'decay' ? esc(r.src.serial) : r.expectedFrom === 'manual' ? '<span class="muted">กรอกเอง</span>' : '<span class="muted">–</span>'}</td>
      <td class="num">${fmtAct(r.expected)}</td>
      <td class="num">${fmtVal(r.measured)}</td>
      <td class="num">${fmtPct(r.diff)}</td>
      <td>${statusCell(r)}</td>
      <td>${esc(r.operator)}</td>
      <td class="note">${esc(r.note)}</td>
      <td class="actions">
        <button type="button" class="btn ghost small" data-edit="${esc(r.id)}">แก้ไข</button>
        <button type="button" class="btn ghost small danger" data-del="${esc(r.id)}">ลบ</button>
      </td>
    </tr>`).join('') : '<tr><td colspan="9" class="empty">ยังไม่มีข้อมูล</td></tr>';
}

$('#recordBody').addEventListener('click', (e) => {
  const ed = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-del]');
  if (ed) startEditRecord(ed.dataset.edit);
  if (del) {
    const rec = state.records.find((r) => r.id === del.dataset.del);
    if (rec && confirm(`ลบข้อมูลวันที่ ${fmtDate(parseLocal(rec.date))} ?`)) {
      state.records = state.records.filter((r) => r.id !== rec.id);
      save(); renderAll(); toast('ลบแล้ว');
    }
  }
});

function renderSources() {
  const unit = state.settings.unit;
  const now = parseLocal(toLocalDate(new Date()));
  const srcs = sortedSources().reverse();
  $('#sourceBody').innerHTML = srcs.length ? srcs.map((s) => `
    <tr>
      <td>${esc(s.serial)}</td>
      <td class="num">${fmtVal(s.activity)} ${esc(unit)}</td>
      <td>${esc(fmtDate(parseLocal(s.refDate)))}</td>
      <td>${s.start ? esc(fmtDate(parseLocal(s.start))) : '<span class="muted">= วันอ้างอิง</span>'}</td>
      <td class="num">${fmtAct(decay(s, now))} ${esc(unit)}</td>
      <td class="actions">
        <button type="button" class="btn ghost small" data-sedit="${esc(s.id)}">แก้ไข</button>
        <button type="button" class="btn ghost small danger" data-sdel="${esc(s.id)}">ลบ</button>
      </td>
    </tr>`).join('') : '<tr><td colspan="6" class="empty">ยังไม่มี source</td></tr>';
}

$('#sourceBody').addEventListener('click', (e) => {
  const ed = e.target.closest('[data-sedit]');
  const del = e.target.closest('[data-sdel]');
  if (ed) {
    const s = state.sources.find((x) => x.id === ed.dataset.sedit);
    if (!s) return;
    ui.editingSource = s.id;
    $('#sSerial').value = s.serial;
    $('#sActivity').value = s.activity;
    $('#sRefDate').value = s.refDate;
    $('#sStart').value = s.start || '';
    $('#sourceSubmit').textContent = 'บันทึกการแก้ไข';
    $('#sourceCancel').hidden = false;
    $('#sSerial').focus();
  }
  if (del) {
    const s = state.sources.find((x) => x.id === del.dataset.sdel);
    if (s && confirm(`ลบ source ${s.serial} ?`)) {
      state.sources = state.sources.filter((x) => x.id !== s.id);
      save(); renderAll(); toast('ลบ source แล้ว');
    }
  }
});

function resetSourceForm() {
  ui.editingSource = null;
  $('#sourceForm').reset();
  $('#sourceSubmit').textContent = 'เพิ่ม source';
  $('#sourceCancel').hidden = true;
}
$('#sourceCancel').addEventListener('click', resetSourceForm);
$('#sourceForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = {
    serial: $('#sSerial').value.trim(),
    activity: num($('#sActivity').value),
    refDate: $('#sRefDate').value,
    start: $('#sStart').value || '',
  };
  if (!data.serial || data.activity == null || data.activity <= 0 || !parseLocal(data.refDate)) {
    toast('กรุณากรอก serial, activity และวันที่อ้างอิงให้ครบ', true);
    return;
  }
  if (ui.editingSource) {
    Object.assign(state.sources.find((s) => s.id === ui.editingSource), data);
    toast('แก้ไข source แล้ว');
  } else {
    state.sources.push({ id: uid(), ...data });
    toast('เพิ่ม source แล้ว');
  }
  save(); resetSourceForm(); renderAll();
});

/* ---------------- entry form ---------------- */

function entryValues() {
  return {
    date: $('#fDate').value,
    measured: num($('#fMeasured').value),
    expected: num($('#fExpected').value),
    operator: $('#fOperator').value.trim(),
    note: $('#fNote').value.trim(),
  };
}
function updatePreview() {
  const v = entryValues();
  const el = $('#entryPreview');
  if (!parseLocal(v.date)) { el.textContent = ''; return; }
  const r = evaluate({ ...v });
  const unit = state.settings.unit;
  if (r.expected == null) {
    el.innerHTML = 'ยังไม่มี source ที่ครอบคลุมวันที่นี้ — กรอกค่าคำนวณเอง หรือเพิ่ม source';
    return;
  }
  const exp = `ค่าคำนวณ <strong>${fmtAct(r.expected)} ${esc(unit)}</strong>${r.expectedFrom === 'decay' ? ` (source ${esc(r.src.serial)})` : ''}`;
  el.innerHTML = r.diff == null ? exp : `${exp}<br>% ต่าง <strong>${fmtPct(r.diff)}</strong> ${statusCell(r)}`;
}
['#fDate', '#fMeasured', '#fExpected'].forEach((s) => $(s).addEventListener('input', updatePreview));

/** รายชื่อผู้ตรวจ (MP) ที่เคยกรอก สำหรับเลือกเร็ว */
function renderOperators() {
  const names = [...new Set(state.records.map((r) => (r.operator || '').trim()).filter(Boolean))].sort();
  $('#operatorList').innerHTML = names.map((n) => `<option value="${esc(n)}">`).join('');
}

function resetEntryForm() {
  ui.editingRecord = null;
  $('#entryForm').reset();
  $('#fDate').value = toLocalDate(new Date());
  renderOperators();
  $('#entryTitle').textContent = 'บันทึกค่าประจำวัน';
  $('#entrySubmit').textContent = 'บันทึก';
  $('#entryCancel').hidden = true;
  updatePreview();
}
function startEditRecord(id) {
  const r = state.records.find((x) => x.id === id);
  if (!r) return;
  ui.editingRecord = id;
  $('#fDate').value = r.date.slice(0, 10);
  $('#fMeasured').value = r.measured ?? '';
  $('#fExpected').value = r.expected ?? '';
  $('#fOperator').value = r.operator || '';
  $('#fNote').value = r.note || '';
  $('#entryTitle').textContent = 'แก้ไขข้อมูล';
  $('#entrySubmit').textContent = 'บันทึกการแก้ไข';
  $('#entryCancel').hidden = false;
  showTab('dashboard');
  updatePreview();
  $('#fMeasured').focus();
}
$('#entryCancel').addEventListener('click', resetEntryForm);
$('#entryForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = entryValues();
  if (!parseLocal(v.date) || v.measured == null) {
    toast('กรุณากรอกวันที่และค่า Planning', true);
    return;
  }
  if (ui.editingRecord) {
    const rec = state.records.find((r) => r.id === ui.editingRecord);
    if (rec.date.slice(0, 10) === v.date) v.date = rec.date; // คงเวลาเดิม (ถ้ามี) เมื่อไม่ได้เปลี่ยนวันที่
    Object.assign(rec, v);
    toast('แก้ไขแล้ว');
  } else {
    state.records.push({ id: uid(), ...v });
    const r = evaluate(v);
    toast(r.diff == null ? 'บันทึกแล้ว' : `บันทึกแล้ว · % ต่าง ${fmtPct(r.diff)} ${r.status === 'bad' ? '▲ เกินเกณฑ์' : '✓ ผ่านเกณฑ์'}`, r.status === 'bad');
  }
  save(); resetEntryForm(); renderAll();
});

/* ---------------- settings ---------------- */

function fillSettings() {
  const s = state.settings;
  $('#setIsotope').value = s.isotope;
  $('#setHalfLife').value = s.halfLife;
  $('#setUnit').value = s.unit;
  $('#setTol').value = s.tolerance;
  $('#setDecimals').value = s.decimals;
  $('#setYear').value = s.yearStyle;
  $('#sheetUrl').value = s.sheetUrl;
  $('#sheetTab').value = s.sheetTab;
  $('#mapOrder').value = s.dateOrder;
}
$('#setIsotope').addEventListener('change', (e) => {
  if (ISOTOPES[e.target.value]) $('#setHalfLife').value = ISOTOPES[e.target.value];
});
$('#setHalfLife').addEventListener('input', (e) => {
  const iso = Object.keys(ISOTOPES).find((k) => ISOTOPES[k] === +e.target.value);
  $('#setIsotope').value = iso || 'custom';
});
$('#settingsForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const hl = num($('#setHalfLife').value);
  const tol = num($('#setTol').value);
  const dec = num($('#setDecimals').value);
  if (!hl || hl <= 0 || tol == null || tol < 0 || dec == null) { toast('ค่าตั้งค่าไม่ถูกต้อง', true); return; }
  Object.assign(state.settings, {
    isotope: $('#setIsotope').value, halfLife: hl, unit: $('#setUnit').value, tolerance: tol,
    decimals: Math.min(6, Math.max(0, Math.round(dec))), yearStyle: $('#setYear').value,
  });
  save(); renderAll(); toast('บันทึกการตั้งค่าแล้ว');
});

/* =========================================================
 * Import: Google Sheets / CSV
 * ========================================================= */

function parseCSV(text) {
  const delim = text.includes('\t') && !text.split('\n')[0].includes(',') ? '\t' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const TH_MONTHS = ['มค', 'กพ', 'มีค', 'เมย', 'พค', 'มิย', 'กค', 'สค', 'กย', 'ตค', 'พย', 'ธค'];
const TH_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function monthIndex(word) {
  const w = word.toLowerCase().replace(/[.\s]/g, '');
  let i = TH_MONTHS_FULL.indexOf(w);
  if (i < 0) i = TH_MONTHS.indexOf(w);
  if (i < 0) i = EN_MONTHS.indexOf(w.slice(0, 3));
  return i;
}
function normYear(y) {
  y = +y;
  if (y < 100) y = y >= 50 ? 2500 + y - 543 : 2000 + y; // 2 หลัก: 69 → พ.ศ. 2569
  if (y > 2400) y -= 543; // พ.ศ. → ค.ศ.
  return y;
}
function parseTimePart(s) {
  if (s == null) return null;
  const m = /(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*(am|pm)?/i.exec(String(s));
  if (!m) return null;
  let h = +m[1];
  if (m[4]) { const pm = m[4].toLowerCase() === 'pm'; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  if (h > 23 || +m[2] > 59) return null;
  return [h, +m[2]];
}
/** แปลงข้อความวันที่ (รองรับ ค.ศ./พ.ศ., ชื่อเดือนไทย/อังกฤษ, ISO, เลข serial ของ Excel) */
function parseDateCell(raw, order) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const n = +s;
    if (n > 20000 && n < 80000) {
      const d = new Date(1899, 11, 30);
      d.setTime(d.getTime() + Math.round(n * DAY));
      return d;
    }
  }
  let time = null;
  const tm = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?|(\d{1,2})\.(\d{2})\s*น\.?/i.exec(s);
  if (tm) {
    time = tm[5] ? [+tm[5], +tm[6]] : parseTimePart(tm[0]);
    s = (s.slice(0, tm.index) + s.slice(tm.index + tm[0].length)).trim();
  }
  let y; let mo; let d;
  let m;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/.exec(s))) {
    [y, mo, d] = [+m[1], +m[2], +m[3]];
  } else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?!\d)/.exec(s))) {
    let a = +m[1]; let b = +m[2];
    if (order === 'mdy' && a <= 12 && b <= 31) [mo, d] = [a, b];
    else if (a > 12) [d, mo] = [a, b];
    else if (b > 12) [mo, d] = [a, b];
    else [d, mo] = [a, b];
    y = m[3];
  } else if ((m = /(\d{1,2})\s*([A-Za-z฀-๿.]+)\s*,?\s*(\d{2,4})/.exec(s)) && monthIndex(m[2]) >= 0) {
    [d, mo, y] = [+m[1], monthIndex(m[2]) + 1, m[3]];
  } else if ((m = /([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s)) && monthIndex(m[1]) >= 0) {
    [mo, d, y] = [monthIndex(m[1]) + 1, +m[2], m[3]];
  } else {
    return null;
  }
  y = normYear(y);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d, time ? time[0] : 0, time ? time[1] : 0);
  if (dt.getMonth() !== mo - 1) return null;
  return dt;
}
function parseNumCell(raw) {
  if (raw == null) return null;
  const s = String(raw).replace(/,/g, '').trim();
  const m = /-?\d+(\.\d+)?(e[-+]?\d+)?/i.exec(s);
  return m ? +m[0] : null;
}

function guessHeaderRow(rows, order) {
  for (let i = 0; i < Math.min(rows.length - 1, 25); i++) {
    const filled = rows[i].filter((c) => c.trim()).length;
    if (filled < 2) continue;
    if (rows[i].some((c) => parseDateCell(c, order))) continue; // แถวข้อมูล ไม่ใช่หัวตาราง
    const next = rows.slice(i + 1, i + 4);
    if (next.some((r) => r.some((c) => parseDateCell(c, order)))) return i;
  }
  return 0;
}
function guessColumn(headers, patterns, exclude = []) {
  for (const p of patterns) {
    const i = headers.findIndex((h, idx) => !exclude.includes(idx) && p.test(h));
    if (i >= 0) return i;
  }
  return -1;
}

/** เดาลำดับวัน/เดือน จากหัวคอลัมน์ (เช่น "Date(M/D/Y)") หรือจากค่าที่วันหรือเดือนเกิน 12 */
function detectDateOrder(header, values) {
  const h = header.toLowerCase().replace(/\s/g, '');
  if (/m\/d\/y|mm\/dd|ด\/ว\//.test(h)) return 'mdy';
  if (/d\/m\/y|dd\/mm|ว\/ด\//.test(h)) return 'dmy';
  let dmy = 0;
  let mdy = 0;
  for (const v of values) {
    const m = /^\s*(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/.exec(v || '');
    if (!m) continue;
    if (+m[1] > 12) dmy++;
    if (+m[2] > 12) mdy++;
  }
  if (mdy > dmy) return 'mdy';
  if (dmy > mdy) return 'dmy';
  return null;
}

function setupMapper(rows, sourceLabel) {
  if (!rows.length) { toast('ไม่พบข้อมูล', true); return; }
  ui.parsed = { rows, sourceLabel };
  const h = guessHeaderRow(rows, $('#mapOrder').value);
  $('#mapHeader').max = rows.length;
  $('#mapHeader').value = h + 1;
  buildColumnSelects(true);
  $('#mapper').hidden = false;
  $('#mapper').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function headerCells() {
  const { rows } = ui.parsed;
  const hi = Math.max(0, Math.min(rows.length - 1, (+$('#mapHeader').value || 1) - 1));
  const width = Math.max(...rows.map((r) => r.length));
  const head = rows[hi];
  return { hi, headers: Array.from({ length: width }, (_, i) => (head[i] || '').trim() || `คอลัมน์ ${i + 1}`) };
}

const MAP_IDS = { mapDate: false, mapTime: true, mapMeasured: false, mapExpected: true, mapOperator: true, mapNote: true };

function buildColumnSelects(autoGuess) {
  const { rows } = ui.parsed;
  const { hi, headers } = headerCells();
  const opts = (optional) => (optional ? '<option value="-1">— ไม่ใช้ —</option>' : '') +
    headers.map((h, i) => `<option value="${i}">${esc(h)}</option>`).join('');
  const prev = {};
  for (const id of Object.keys(MAP_IDS)) { prev[id] = $('#' + id).value; $('#' + id).innerHTML = opts(MAP_IDS[id]); }

  if (autoGuess) {
    const data = rows.slice(hi + 1, hi + 40);
    const lower = headers.map((x) => x.toLowerCase());
    let date = guessColumn(lower, [/วันที่|date|วัน/]);
    if (date < 0) date = headers.findIndex((_, i) => data.filter((r) => parseDateCell(r[i], 'dmy')).length > data.length / 2);
    date = Math.max(0, date);
    const order = detectDateOrder(headers[date], rows.slice(hi + 1).map((r) => r[date]));
    if (order) $('#mapOrder').value = order;
    const time = guessColumn(lower, [/เวลา|^time/], [date]);
    let measured = guessColumn(lower, [/planning|plan|tps|กรอก|วัด|measur|well|chamber|electrometer|actual|reading/], [date, time]);
    // ใช้คอลัมน์ค่าคำนวณจากชีตเฉพาะเมื่อยังไม่มี source ให้แอปคำนวณเอง
    let expected = state.sources.length ? -1 : guessColumn(lower, [/คำนวณ|calc|expect|theor|ทฤษฎี|decay|สลาย|nominal/], [date, time, measured]);
    const filled = (i) => data.filter((r) => parseNumCell(r[i]) != null).length > data.length / 2;
    const numericCols = headers.map((_, i) => i).filter((i) => ![date, time].includes(i) && filled(i) &&
      !/%|diff|ต่าง|error|date|วัน/i.test(lower[i]));
    if (measured < 0) measured = numericCols.find((i) => i !== expected) ?? 0;
    const operator = guessColumn(lower, [/^mp$|ผู้ตรวจ|ผู้วัด|ผู้บันทึก|operator|physicist|initial/], [date, time, measured, expected]);
    const note = guessColumn(lower, [/หมายเหตุ|note|remark|comment/], [date, time, measured, expected, operator]);
    $('#mapDate').value = date;
    $('#mapTime').value = time;
    $('#mapMeasured').value = measured;
    $('#mapExpected').value = expected;
    $('#mapOperator').value = operator;
    $('#mapNote').value = note;
  } else {
    for (const id of Object.keys(MAP_IDS)) if ([...$('#' + id).options].some((o) => o.value === prev[id])) $('#' + id).value = prev[id];
  }
  renderMapPreview();
}

function mappedRows() {
  const { rows } = ui.parsed;
  const { hi } = headerCells();
  const order = $('#mapOrder').value;
  const col = (id) => +$('#' + id).value;
  const [cd, ct, cm, ce, co, cn] = ['mapDate', 'mapTime', 'mapMeasured', 'mapExpected', 'mapOperator', 'mapNote'].map(col);
  const out = [];
  const skipped = [];
  rows.slice(hi + 1).forEach((r, k) => {
    const rawDate = (r[cd] || '').trim();
    const rawVal = (r[cm] || '').trim();
    if (!rawDate && !rawVal) return; // แถวว่าง (เช่นแถวที่ลากสูตรไว้ล่วงหน้า)
    const d = parseDateCell(rawDate, order);
    const measured = parseNumCell(rawVal);
    if (!d || measured == null) {
      skipped.push({ row: hi + 2 + k, date: rawDate, why: !d ? 'วันที่อ่านไม่ได้' : 'ไม่มีค่า' });
      return;
    }
    if (ct >= 0) {
      const tp = parseTimePart(r[ct]);
      if (tp) d.setHours(tp[0], tp[1]);
    }
    out.push({
      date: toLocalInput(d),
      measured,
      expected: ce >= 0 ? parseNumCell(r[ce]) : null,
      operator: co >= 0 ? (r[co] || '').trim() : '',
      note: cn >= 0 ? (r[cn] || '').trim() : '',
    });
  });
  return { out, skipped };
}

function renderMapPreview() {
  const { out, skipped } = mappedRows();
  const unit = state.settings.unit;
  const skipTxt = skipped.length
    ? ` · ข้าม ${skipped.length} แถว: ` + skipped.slice(0, 6).map((x) => `แถว ${x.row}${x.date ? ` (“${x.date}”)` : ''} ${x.why}`).join(', ') + (skipped.length > 6 ? ' …' : '')
    : '';
  $('#mapSummary').textContent = `อ่านได้ ${out.length} แถว` + skipTxt +
    (out.length && $('#mapExpected').value === '-1' && !state.sources.length ? ' · ยังไม่มีค่าคำนวณ: เลือกคอลัมน์ค่าคำนวณ หรือเพิ่ม source หลังนำเข้า' : '');
  const sample = out.slice(0, 8).map((x) => evaluate(x));
  $('#mapPreview').innerHTML = `<thead><tr><th>วันที่</th><th class="num">คำนวณ (${esc(unit)})</th><th class="num">Planning (${esc(unit)})</th><th class="num">% ต่าง</th><th>MP</th><th>หมายเหตุ</th></tr></thead><tbody>` +
    (sample.length ? sample.map((r) => `<tr><td>${esc(fmtDate(r.t))}</td><td class="num">${fmtAct(r.expected)}</td><td class="num">${fmtVal(r.measured)}</td><td class="num">${fmtPct(r.diff)}</td><td>${esc(r.operator)}</td><td class="note">${esc(r.note)}</td></tr>`).join('')
      : '<tr><td colspan="6" class="empty">ไม่มีแถวที่อ่านได้ — ลองเปลี่ยนแถวหัวตารางหรือคอลัมน์</td></tr>') + '</tbody>';
  $('#doImport').textContent = `นำเข้า ${out.length} แถว`;
  $('#doImport').disabled = !out.length;
}

$('#mapHeader').addEventListener('input', () => ui.parsed && buildColumnSelects(true));
$('#mapOrder').addEventListener('change', () => {
  state.settings.dateOrder = $('#mapOrder').value; save();
  if (ui.parsed) renderMapPreview();
});
Object.keys(MAP_IDS).forEach((id) => $('#' + id).addEventListener('change', renderMapPreview));

$('#doImport').addEventListener('click', () => {
  const { out } = mappedRows();
  if (!out.length) return;
  const replace = $('#mapMode').value === 'replace';
  if (replace && state.records.length && !confirm(`แทนที่ข้อมูลเดิม ${state.records.length} รายการ?`)) return;
  let added = 0;
  if (replace) state.records = [];
  const key = (r) => `${r.date}|${r.measured}`;
  const seen = new Set(state.records.map(key));
  for (const r of out) {
    if (seen.has(key(r))) continue;
    seen.add(key(r));
    state.records.push({ id: uid(), ...r });
    added++;
  }
  save();
  ui.range = 'all';
  renderAll();
  toast(`นำเข้า ${added} แถว` + (out.length - added ? ` (ข้ามแถวซ้ำ ${out.length - added})` : ''));
  $('#mapper').hidden = true;
  ui.parsed = null;
  showTab('dashboard');
});

function sheetRef(url, tab) {
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(url);
  if (!m) return null;
  const g = /[#&?]gid=(\d+)/.exec(url);
  const base = `https://docs.google.com/spreadsheets/d/${m[1]}`;
  return {
    base,
    sel: tab ? `&sheet=${encodeURIComponent(tab)}` : g ? `&gid=${g[1]}` : '',
    csvExport: tab ? null : `${base}/export?format=csv${g ? `&gid=${g[1]}` : ''}`,
  };
}

/** แปลงเซลล์ของ gviz: วันที่เป็น ISO (ไม่ต้องเดาลำดับวัน/เดือน), ตัวเลขเต็มความละเอียด, อื่น ๆ ตามที่แสดงในชีต */
function gvizCell(c, type) {
  if (!c || c.v == null) return c && c.f != null ? String(c.f) : '';
  const d = typeof c.v === 'string' && /^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+))?/.exec(c.v);
  if (d) {
    const day = `${d[1]}-${pad(+d[2] + 1)}-${pad(+d[3])}`;
    return d[4] != null && (+d[4] || +d[5]) ? `${day}T${pad(+d[4])}:${pad(+d[5])}` : day;
  }
  if (type === 'number' && typeof c.v === 'number') return String(c.v);
  return c.f != null ? String(c.f) : String(c.v);
}

/** ดึงผ่าน JSONP ของ Google Visualization — ใช้ได้แม้เปิดไฟล์ index.html โดยตรง (ไม่ติด CORS) */
function fetchSheetJsonp(ref) {
  return new Promise((resolve, reject) => {
    const cb = `hdrSheetCb_${Date.now()}`;
    const script = document.createElement('script');
    const done = () => { clearTimeout(timer); delete window[cb]; script.remove(); };
    const timer = setTimeout(() => { done(); reject(new Error('หมดเวลา')); }, 20000);
    window[cb] = (resp) => {
      done();
      if (!resp || resp.status === 'error') {
        reject(new Error((resp && resp.errors && resp.errors[0] && (resp.errors[0].detailed_message || resp.errors[0].message)) || 'อ่านชีตไม่ได้'));
        return;
      }
      const { cols, rows } = resp.table;
      const out = [];
      if (cols.some((c) => c.label)) out.push(cols.map((c) => c.label || ''));
      for (const r of rows) out.push(cols.map((col, i) => gvizCell(r.c[i], col.type)));
      resolve(out.filter((r) => r.some((c) => c.trim() !== '')));
    };
    script.onerror = () => { done(); reject(new Error('ชีตไม่ได้เปิดสิทธิ์ให้ทุกคนที่มีลิงก์ดูได้')); };
    script.src = `${ref.base}/gviz/tq?tqx=out:json;responseHandler:${cb}${ref.sel}`;
    document.head.appendChild(script);
  });
}

async function fetchSheetCsv(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  if (/^\s*<!doctype html|<html/i.test(text)) throw new Error('ชีตไม่ได้เปิดสิทธิ์ให้ทุกคนที่มีลิงก์ดูได้');
  return parseCSV(text);
}

$('#fetchSheet').addEventListener('click', async () => {
  const url = $('#sheetUrl').value.trim();
  const tab = $('#sheetTab').value.trim();
  const ref = sheetRef(url, tab);
  if (!ref) { toast('ลิงก์ Google Sheets ไม่ถูกต้อง', true); return; }
  state.settings.sheetUrl = url;
  state.settings.sheetTab = tab;
  save();
  const btn = $('#fetchSheet');
  btn.disabled = true;
  btn.textContent = 'กำลังดึงข้อมูล…';
  const attempts = [() => fetchSheetJsonp(ref), () => fetchSheetCsv(`${ref.base}/gviz/tq?tqx=out:csv${ref.sel}`)];
  if (ref.csvExport) attempts.push(() => fetchSheetCsv(ref.csvExport));
  let lastErr = null;
  try {
    for (const attempt of attempts) {
      try {
        setupMapper(await attempt(), 'Google Sheets');
        toast('ดึงข้อมูลสำเร็จ — ตรวจสอบการจับคู่คอลัมน์');
        return;
      } catch (err) {
        lastErr = lastErr || err;
      }
    }
    toast('ดึงข้อมูลไม่สำเร็จ: ' + (lastErr ? lastErr.message : '') + ' — ตรวจสอบการแชร์ชีต หรือดาวน์โหลดเป็น CSV แล้วนำเข้าแทน', true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'ดึงข้อมูล';
  }
});

$('#csvFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  setupMapper(parseCSV(await f.text()), f.name);
  e.target.value = '';
});
$('#parsePaste').addEventListener('click', () => {
  const t = $('#csvPaste').value;
  if (!t.trim()) { toast('ยังไม่ได้วางข้อมูล', true); return; }
  setupMapper(parseCSV(t), 'ข้อมูลที่วาง');
});

/* ---------------- export / backup ---------------- */

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}
const today = () => toLocalInput(new Date()).slice(0, 10);
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

$('#exportCsv').addEventListener('click', () => {
  const unit = state.settings.unit;
  const head = ['วันที่', 'เวลา', 'Source', `Activity คำนวณ (${unit})`, `Planning (${unit})`, '% ต่าง', 'สถานะ', 'MP', 'หมายเหตุ'];
  const lines = evaluatedRecords().map((r) => [
    r.date.slice(0, 10), r.date.slice(11, 16), r.expectedFrom === 'decay' ? r.src.serial : r.expectedFrom === 'manual' ? 'กรอกเอง' : '',
    r.expected != null ? r.expected.toFixed(6) : '', r.measured, r.diff != null ? r.diff.toFixed(3) : '',
    r.status === 'ok' ? 'ผ่าน' : r.status === 'bad' ? 'เกินเกณฑ์' : '', r.operator, r.note,
  ].map(csvCell).join(','));
  download(`hdr-activity-${today()}.csv`, '﻿' + [head.join(','), ...lines].join('\n'), 'text/csv;charset=utf-8');
});
$('#exportJson').addEventListener('click', () => {
  download(`hdr-activity-backup-${today()}.json`, JSON.stringify({ app: 'hdr-activity', version: 1, exported: new Date().toISOString(), ...state }, null, 2), 'application/json');
});
$('#importJson').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!Array.isArray(data.records) || !Array.isArray(data.sources)) throw new Error('รูปแบบไฟล์ไม่ถูกต้อง');
    if (!confirm(`กู้คืน ${data.records.length} รายการ และ ${data.sources.length} source? ข้อมูลปัจจุบันจะถูกแทนที่`)) return;
    state = { settings: { ...defaults().settings, ...(data.settings || {}) }, sources: data.sources, records: data.records };
    save(); fillSettings(); renderAll(); toast('กู้คืนข้อมูลแล้ว');
  } catch (err) {
    toast('อ่านไฟล์ไม่ได้: ' + err.message, true);
  }
});
$('#clearAll').addEventListener('click', () => {
  if (!confirm('ลบข้อมูลทั้งหมด (ค่าที่บันทึกและ source)? ควรส่งออกไฟล์สำรองก่อน')) return;
  state = { ...defaults(), settings: state.settings };
  save(); renderAll(); toast('ลบข้อมูลทั้งหมดแล้ว');
});

/* ---------------- init ---------------- */

function renderAll() {
  $$('.unit-label').forEach((el) => { el.textContent = `(${state.settings.unit})`; });
  $$('.unit-text').forEach((el) => { el.textContent = state.settings.unit; });
  $$('.tol-label').forEach((el) => { el.textContent = state.settings.tolerance; });
  renderFilters();
  renderOperators();
  renderTiles();
  renderRecords();
  renderSources();
  renderCharts();
  updatePreview();
}

applyTheme(readTheme());
fillSettings();
resetEntryForm();
renderAll();
if (typeof Chart === 'undefined') toast('โหลดไลบรารีกราฟไม่สำเร็จ — ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต', true);
