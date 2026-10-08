'use strict';

const MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

const $ = sel => document.querySelector(sel);

const state = {
  records: [],
  nextNo: {},
  year: null,
  q: '',
  person: '',
  desc: true,
  editing: null,
  highlight: null,
};

// ------------------------------------------------------------ helpers

const pad = n => String(n).padStart(2, '0');

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const beYearOf = iso => Number(iso.slice(0, 4)) + 543;
const currentYear = () => new Date().getFullYear() + 543;

function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y + 543}`;
}

function fmtDateLong(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y + 543}`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const docNumber = r => (r.ref ? `ที่ ${r.ref}/${r.no}` : `เลขที่ ${r.no}/${r.year}`);

async function api(method, url, body, raw) {
  const opts = { method, headers: {} };
  if (raw) {
    opts.body = raw;
    opts.headers['Content-Type'] = 'application/octet-stream';
  } else if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers['Content-Type'] = 'application/json';
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `เกิดข้อผิดพลาด (${res.status})`);
  return data;
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

function distinct(values) {
  const count = new Map();
  for (const v of values) if (v) count.set(v, (count.get(v) || 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
}

const recordsOfYear = year => state.records.filter(r => r.year === year);
const nextNoOf = year => state.nextNo[year] ?? 1;

/**
 * หนังสือที่ออกเลขล่าสุด: ดูเวลาที่บันทึกก่อน ถ้าบันทึกพร้อมกัน (นำเข้าจาก Excel)
 * ให้ดูปีล่าสุด แล้วเลขสูงสุดที่ยังต่ำกว่าเลขถัดไป (เลขที่ถูกจองไว้ข้างหน้าไม่นับ)
 */
function latestOf(records) {
  const rank = r => [r.createdAt || '', r.year, r.no < nextNoOf(r.year) ? 1 : 0, r.no];
  const after = (a, b) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return false;
  };
  return records.reduce((best, r) => (!best || after(rank(r), rank(best)) ? r : best), null);
}

// ------------------------------------------------------------ data

async function load() {
  const data = await api('GET', 'api/state');
  state.records = data.records;
  state.nextNo = data.nextNo;
  if (state.year === null) state.year = currentYear();
  render();
}

// ------------------------------------------------------------ render

function render() {
  const hasData = state.records.length > 0;
  $('#empty').hidden = hasData;
  $('#list').hidden = !hasData;

  const latest = latestOf(state.records);
  $('#unit').textContent = latest?.from || '';

  renderYears();
  renderSummary();
  if (hasData) {
    renderFilters();
    renderRows();
  }
  renderDatalists();
}

function renderYears() {
  const years = [...new Set([...state.records.map(r => r.year), currentYear()])].sort((a, b) => b - a);
  $('#years').innerHTML = years
    .map(y => {
      const n = recordsOfYear(y).length;
      return `<button type="button" class="year${y === state.year ? ' active' : ''}" data-year="${y}" aria-pressed="${y === state.year}">
        พ.ศ. ${y}<span class="count">${n}</span></button>`;
    })
    .join('');
}

function renderSummary() {
  const recs = recordsOfYear(state.year);
  $('#sum-year').textContent = state.year;
  $('#sum-next').textContent = nextNoOf(state.year);
  $('#sum-count').textContent = `${recs.length} รายการ`;
  const last = latestOf(recs);
  $('#sum-last').innerHTML = last
    ? `เลข ${esc(last.no)} · ${last.date ? esc(fmtDate(last.date)) : esc(last.dateText || '-')}<br><span class="muted">${esc(last.subject || '-')}</span>`
    : '<span class="muted">ยังไม่มี</span>';
}

function renderFilters() {
  const people = distinct(recordsOfYear(state.year).map(r => r.action)).sort((a, b) => a.localeCompare(b, 'th'));
  if (state.person && !people.includes(state.person)) state.person = '';
  $('#person').innerHTML = `<option value="">ผู้ปฏิบัติ: ทุกคน</option>` +
    people.map(p => `<option value="${esc(p)}"${p === state.person ? ' selected' : ''}>${esc(p)}</option>`).join('');
  $('#btn-sort').textContent = state.desc ? 'เรียง: เลขมากก่อน' : 'เรียง: เลขน้อยก่อน';
}

function matches(r, q) {
  if (!q) return true;
  const hay = [r.no, r.ref, r.ref && `${r.ref}/${r.no}`, r.date && fmtDate(r.date), r.dateText, r.from, r.to, r.subject, r.action, r.note]
    .join(' ')
    .toLowerCase();
  return q.split(/\s+/).every(part => hay.includes(part));
}

function renderRows() {
  const q = state.q.trim().toLowerCase();
  const rows = recordsOfYear(state.year)
    .filter(r => (!state.person || r.action === state.person) && matches(r, q))
    .sort((a, b) => (state.desc ? b.no - a.no : a.no - b.no));

  const total = recordsOfYear(state.year).length;
  $('#result-count').textContent = rows.length === total ? `ทั้งหมด ${total} รายการ` : `พบ ${rows.length} จาก ${total} รายการ`;
  $('#print-title').textContent = `ทะเบียนหนังสือส่ง ประจำปี พ.ศ. ${state.year}${$('#unit').textContent ? ` — ${$('#unit').textContent}` : ''}`;

  if (!rows.length) {
    $('#rows').innerHTML = `<tr class="none"><td colspan="9">${total ? 'ไม่พบรายการที่ค้นหา' : `ยังไม่มีหนังสือในปี ${state.year} — กด "ออกเลขหนังสือใหม่" เพื่อเริ่มที่เลข ${nextNoOf(state.year)}`}</td></tr>`;
    return;
  }

  $('#rows').innerHTML = rows
    .map(r => {
      const date = r.date
        ? `<time datetime="${esc(r.date)}">${esc(fmtDate(r.date))}</time>`
        : r.dateText
          ? `<span class="warn" title="อ่านวันที่จากไฟล์เดิมไม่ได้ กดแก้ไขเพื่อระบุวันที่">${esc(r.dateText)}</span>`
          : '<span class="muted">-</span>';
      return `<tr data-id="${esc(r.id)}"${r.id === state.highlight ? ' class="flash"' : ''}>
        <td class="c-no" data-label="เลขทะเบียนส่ง"><strong>${esc(r.no)}</strong></td>
        <td class="c-ref" data-label="ที่">${esc(r.ref)}</td>
        <td class="c-date" data-label="ลงวันที่">${date}</td>
        <td class="c-from" data-label="จาก">${esc(r.from)}</td>
        <td class="c-to" data-label="ถึง">${esc(r.to)}</td>
        <td class="c-subject" data-label="เรื่อง">${r.subject ? esc(r.subject) : '<span class="muted">(ไม่ระบุเรื่อง)</span>'}</td>
        <td class="c-action" data-label="การปฏิบัติ">${esc(r.action)}</td>
        <td class="c-note" data-label="หมายเหตุ">${esc(r.note)}</td>
        <td class="c-edit"><button type="button" class="btn ghost small" data-edit="${esc(r.id)}">แก้ไข</button></td>
      </tr>`;
    })
    .join('');
  state.highlight = null;
}

function renderDatalists() {
  const recent = [...state.records].sort((a, b) => b.year - a.year || b.no - a.no);
  const fill = (id, field) => {
    $(id).innerHTML = distinct(recent.map(r => r[field])).slice(0, 50).map(v => `<option value="${esc(v)}">`).join('');
  };
  fill('#dl-ref', 'ref');
  fill('#dl-from', 'from');
  fill('#dl-to', 'to');
  fill('#dl-action', 'action');
}

// ------------------------------------------------------------ record form

const form = $('#form-record');

function updatePreview() {
  const date = form.date.value;
  $('#date-hint').textContent = date ? fmtDateLong(date) : '';
  if (state.editing) return;
  if (!date) {
    $('#form-preview').textContent = '';
    return;
  }
  const year = beYearOf(date);
  $('#form-preview').innerHTML = `จะได้เลขที่ <strong>${esc(nextNoOf(year))}</strong> ของปี ${year}`;
}

function openForm(rec) {
  state.editing = rec || null;
  form.reset();
  $('#form-error').textContent = '';
  $('#wrap-no').hidden = !rec;
  $('#btn-delete').hidden = !rec;

  if (rec) {
    $('#form-title').textContent = `แก้ไขเลขที่ ${rec.no} / ${rec.year}`;
    $('#form-preview').innerHTML = rec.dateText ? `วันที่ในไฟล์เดิม: <strong>${esc(rec.dateText)}</strong>` : '';
    $('#btn-save').textContent = 'บันทึก';
    for (const f of ['no', 'ref', 'from', 'to', 'subject', 'action', 'note']) form[f].value = rec[f] ?? '';
    form.date.value = rec.date || '';
    form.date.required = !rec.dateText;
  } else {
    // ค่าตั้งต้นจากหนังสือฉบับล่าสุด
    const last = latestOf(recordsOfYear(currentYear())) || latestOf(state.records);
    $('#form-title').textContent = 'ออกเลขหนังสือใหม่';
    $('#btn-save').textContent = 'ออกเลข';
    form.date.value = todayISO();
    form.date.required = true;
    form.ref.value = last?.ref || '';
    form.from.value = last?.from || '';
    form.to.value = last?.to || 'ผู้อำนวยการ';
  }
  updatePreview();
  $('#dlg-record').showModal();
  form.subject.focus();
}

async function submitForm(ev) {
  ev.preventDefault();
  const body = {};
  for (const f of ['date', 'ref', 'from', 'to', 'subject', 'action', 'note']) body[f] = form[f].value;
  $('#btn-save').disabled = true;
  try {
    if (state.editing) {
      body.no = Number(form.no.value);
      const rec = await api('PUT', `api/records/${state.editing.id}`, body);
      state.highlight = rec.id;
      $('#dlg-record').close();
      await load();
      toast(`บันทึกเลขที่ ${rec.no} แล้ว`);
    } else {
      const rec = await api('POST', 'api/records', body);
      state.year = rec.year;
      state.highlight = rec.id;
      $('#dlg-record').close();
      await load();
      showDone(rec);
    }
  } catch (err) {
    $('#form-error').textContent = err.message;
  } finally {
    $('#btn-save').disabled = false;
  }
}

async function deleteRecord() {
  const rec = state.editing;
  if (!rec) return;
  if (!confirm(`ลบเลขที่ ${rec.no} / ${rec.year}\nเรื่อง: ${rec.subject || '-'}\n\nยืนยันการลบ?`)) return;
  try {
    await api('DELETE', `api/records/${rec.id}`);
    $('#dlg-record').close();
    await load();
    toast(`ลบเลขที่ ${rec.no} แล้ว`);
  } catch (err) {
    $('#form-error').textContent = err.message;
  }
}

function showDone(rec) {
  $('#done-no').textContent = rec.no;
  $('#done-ref').textContent = docNumber(rec);
  $('#done-meta').innerHTML = `ลงวันที่ ${esc(fmtDateLong(rec.date))}<br>เรื่อง ${esc(rec.subject)}`;
  $('#btn-copy').dataset.copy = docNumber(rec);
  $('#dlg-done').showModal();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(`คัดลอก "${text}" แล้ว`);
}

// ------------------------------------------------------------ counter

async function editCounter() {
  const year = state.year;
  const input = prompt(`ตั้งเลขถัดไปของปี ${year}\n(ถ้าเลขนั้นมีคนใช้แล้ว ระบบจะข้ามไปเลขว่างถัดไปให้)`, nextNoOf(year));
  if (input === null) return;
  const next = Number(input.trim());
  if (!Number.isInteger(next) || next < 1) return toast('กรุณาใส่จำนวนเต็มบวก');
  try {
    await api('PUT', `api/counters/${year}`, { next });
    await load();
    toast(`เลขถัดไปของปี ${year} คือ ${nextNoOf(year)}`);
  } catch (err) {
    toast(err.message);
  }
}

// ------------------------------------------------------------ import

let importFile = null;

function openImport() {
  importFile = null;
  $('#import-file').value = '';
  $('#import-preview').innerHTML = '';
  $('#import-error').textContent = '';
  $('#btn-import-go').disabled = true;
  $('#btn-import-go').hidden = false;
  $('#dlg-import').showModal();
}

function warningsHtml(warnings) {
  if (!warnings.length) return '';
  return `<details class="warnings"><summary>ข้อสังเกตจากไฟล์ ${warnings.length} รายการ</summary><ul>${warnings
    .map(w => `<li>${esc(w)}</li>`)
    .join('')}</ul></details>`;
}

async function previewImport() {
  const file = $('#import-file').files[0];
  $('#import-error').textContent = '';
  $('#import-preview').innerHTML = '';
  $('#btn-import-go').disabled = true;
  if (!file) return;
  try {
    importFile = await file.arrayBuffer();
    const res = await api('POST', 'api/import?dryRun=1', undefined, importFile);
    const replacing = res.years.some(y => y.existing > 0);
    $('#import-preview').innerHTML = `
      <table class="mini">
        <thead><tr><th>ปี พ.ศ.</th><th>รายการในไฟล์</th><th>ในระบบตอนนี้</th></tr></thead>
        <tbody>${res.years.map(y => `<tr><td>${y.year}</td><td>${y.count}</td><td>${y.existing}</td></tr>`).join('')}</tbody>
      </table>
      ${replacing ? '<p class="warn-box">ข้อมูลของปีข้างต้นที่มีอยู่ในระบบจะถูกแทนที่ด้วยข้อมูลจากไฟล์ (ระบบสำรองข้อมูลเดิมไว้ให้ในโฟลเดอร์ data/backups)</p>' : ''}
      ${warningsHtml(res.warnings)}`;
    $('#btn-import-go').disabled = false;
  } catch (err) {
    $('#import-error').textContent = err.message;
  }
}

async function runImport() {
  if (!importFile) return;
  $('#btn-import-go').disabled = true;
  try {
    const res = await api('POST', 'api/import', undefined, importFile);
    state.year = currentYear();
    await load();
    $('#import-preview').innerHTML = `
      <p class="ok-box">นำเข้าเรียบร้อย</p>
      <table class="mini">
        <thead><tr><th>ปี พ.ศ.</th><th>นำเข้า</th><th>เลขถัดไป</th></tr></thead>
        <tbody>${res.years.map(y => `<tr><td>${y.year}</td><td>${y.count}</td><td><strong>${y.nextNo}</strong></td></tr>`).join('')}</tbody>
      </table>
      ${warningsHtml(res.warnings)}`;
    $('#btn-import-go').hidden = true;
    importFile = null;
  } catch (err) {
    $('#import-error').textContent = err.message;
    $('#btn-import-go').disabled = false;
  }
}

// ------------------------------------------------------------ events

$('#years').addEventListener('click', ev => {
  const btn = ev.target.closest('[data-year]');
  if (!btn) return;
  state.year = Number(btn.dataset.year);
  render();
});

$('#rows').addEventListener('click', ev => {
  const btn = ev.target.closest('[data-edit]');
  if (btn) openForm(state.records.find(r => r.id === btn.dataset.edit));
});

$('#q').addEventListener('input', ev => {
  state.q = ev.target.value;
  renderRows();
});

$('#person').addEventListener('change', ev => {
  state.person = ev.target.value;
  renderRows();
});

$('#btn-sort').addEventListener('click', () => {
  state.desc = !state.desc;
  renderFilters();
  renderRows();
});

$('#btn-new').addEventListener('click', () => openForm(null));
$('#btn-counter').addEventListener('click', editCounter);
$('#btn-print').addEventListener('click', () => window.print());
$('#btn-import').addEventListener('click', openImport);
$('#btn-import-empty').addEventListener('click', openImport);
$('#import-file').addEventListener('change', previewImport);
$('#btn-import-go').addEventListener('click', runImport);
$('#btn-delete').addEventListener('click', deleteRecord);
$('#btn-copy').addEventListener('click', ev => copyText(ev.currentTarget.dataset.copy));
form.addEventListener('submit', submitForm);
form.date.addEventListener('input', updatePreview);

for (const btn of document.querySelectorAll('[data-close]')) {
  btn.addEventListener('click', () => btn.closest('dialog').close());
}

// โหลดข้อมูลใหม่เมื่อกลับมาที่หน้าต่างนี้ เผื่อมีคนอื่นออกเลขไปแล้ว
window.addEventListener('focus', () => {
  if (!document.querySelector('dialog[open]')) load().catch(() => {});
});

load().catch(err => toast(err.message));
