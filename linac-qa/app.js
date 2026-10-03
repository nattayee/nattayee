(function () {
  'use strict';

  const FORM = window.QA_FORM;
  const CONFIG = window.QA_CONFIG || {};
  const STORAGE_KEY = 'linac-qa-records';
  const PF_OPTIONS = [
    { value: 'pass', label: 'ผ่าน' },
    { value: 'fail', label: 'ไม่ผ่าน' },
    { value: 'na', label: 'ไม่ได้ทดสอบ' }
  ];
  const STATUS_LABEL = { pass: 'ผ่าน', fail: 'ไม่ผ่าน', na: 'N/A' };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const allQuestions = FORM.sections.flatMap(s => s.questions.map(q => ({ ...q, section: s.title })));

  // ---------- storage ----------
  function loadRecords() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch (e) { return []; }
  }
  function saveRecords(records) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); return true; } catch (e) { return false; }
  }

  // ---------- helpers ----------
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function today() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  function nowTime() { return new Date().toTimeString().slice(0, 5); }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2800);
  }
  function badge(status) {
    return status ? `<span class="badge ${status}">${STATUS_LABEL[status]}</span>` : '';
  }

  // Evaluate a tolerance question: returns { diff, status } or null if empty
  function evalTolerance(q, measured, baseline) {
    if (measured === '' || measured == null || isNaN(measured)) return null;
    const m = Number(measured);
    const b = Number(baseline);
    let diff;
    if (q.mode === 'pct') {
      if (!b) return null;
      diff = (m - b) / b * 100;
    } else {
      diff = m - b;
    }
    const status = Math.abs(diff) <= q.tol + 1e-9 ? 'pass' : 'fail';
    return { diff, status };
  }
  function fmtDiff(q, diff) {
    const sign = diff > 0 ? '+' : '';
    return q.mode === 'pct' ? `${sign}${diff.toFixed(2)}%` : `${sign}${diff.toFixed(1)} ${q.unit || ''}`.trim();
  }

  // ---------- render form ----------
  function renderQuestion(q) {
    const req = q.required ? '<span class="req">*</span>' : '';
    const name = `q_${q.id}`;
    let body = '';
    switch (q.type) {
      case 'text':
      case 'date':
      case 'time':
        body = `<input type="${q.type}" id="${name}" name="${name}" placeholder="${q.type === 'text' ? 'คำตอบของคุณ' : ''}">`;
        break;
      case 'number':
        body = `<input type="number" id="${name}" name="${name}" step="${q.step || 'any'}" placeholder="คำตอบของคุณ">`;
        break;
      case 'textarea':
        body = `<textarea id="${name}" name="${name}" placeholder="คำตอบของคุณ"></textarea>`;
        break;
      case 'select':
        body = `<select id="${name}" name="${name}"><option value="">เลือก</option>${
          q.options.map(o => `<option>${esc(o)}</option>`).join('')}</select>`;
        break;
      case 'radio':
      case 'checkbox':
        body = `<div class="choices">${q.options.map(o =>
          `<label><input type="${q.type}" name="${name}" value="${esc(o)}"> ${esc(o)}</label>`).join('')}</div>`;
        break;
      case 'passfail':
        body = `<div class="pf">${PF_OPTIONS.map(o =>
          `<label data-v="${o.value}"><input type="radio" name="${name}" value="${o.value}"><span>${o.label}</span></label>`).join('')}</div>`;
        break;
      case 'tolerance': {
        const tolText = q.mode === 'pct' ? `±${q.tol}%` : `±${q.tol} ${q.unit || ''}`;
        body = `<div class="tol-row">
            <label class="field">ค่าที่วัดได้<input type="number" step="any" name="${name}" data-role="measured" placeholder="${q.mode === 'abs' ? 'ความคลาดเคลื่อน' : 'reading'}"></label>
            <label class="field">Baseline<input type="number" step="any" name="${name}__baseline" data-role="baseline" value="${q.baseline}"></label>
            <div class="field">ผลต่าง<span class="tol-result" data-role="result">—</span></div>
          </div>
          <div class="tol-hint">เกณฑ์ยอมรับ ${esc(tolText)}</div>`;
        break;
      }
    }
    return `<div class="card q" data-qid="${q.id}">
      <label class="q-label" for="${name}">${esc(q.label)}${req}</label>
      ${body}
      <div class="q-error">นี่เป็นคำถามที่จำเป็น</div>
    </div>`;
  }

  function renderForm() {
    document.title = FORM.title;
    $('#app-title').textContent = FORM.title;
    $('#form-title').textContent = FORM.title;
    $('#form-subtitle').textContent = FORM.subtitle || '';
    $('#qa-form').innerHTML = FORM.sections.map(s => `
      <div class="section-title">${esc(s.title)}</div>
      ${s.description ? `<div class="card section-desc muted">${esc(s.description)}</div>` : ''}
      ${s.questions.map(renderQuestion).join('')}
    `).join('');
    setDefaults();
    updateSummary();
  }

  function setDefaults() {
    const d = $('[name="q_date"]'); if (d) d.value = today();
    const t = $('[name="q_time"]'); if (t) t.value = nowTime();
    try {
      const last = localStorage.getItem('linac-qa-last');
      if (last) {
        const { machine, physicist } = JSON.parse(last);
        const m = $('[name="q_machine"]'); if (m && machine) m.value = machine;
        const p = $('[name="q_physicist"]'); if (p && physicist) p.value = physicist;
      }
    } catch (e) { /* ignore */ }
  }

  // ---------- read answers ----------
  function readAnswer(q) {
    const name = `q_${q.id}`;
    switch (q.type) {
      case 'radio':
      case 'passfail': {
        const el = $(`[name="${name}"]:checked`);
        return el ? el.value : '';
      }
      case 'checkbox':
        return $$(`[name="${name}"]:checked`).map(e => e.value);
      case 'tolerance': {
        const measured = $(`[name="${name}"]`).value;
        const baseline = $(`[name="${name}__baseline"]`).value;
        const r = evalTolerance(q, measured, baseline);
        return measured === '' ? '' : {
          measured: Number(measured), baseline: Number(baseline),
          diff: r ? Number(r.diff.toFixed(3)) : null, status: r ? r.status : ''
        };
      }
      default:
        return ($(`[name="${name}"]`)?.value || '').trim();
    }
  }
  function isEmpty(v) { return v === '' || v == null || (Array.isArray(v) && v.length === 0); }
  function statusOf(q, v) {
    if (q.type === 'passfail') return v || '';
    if (q.type === 'tolerance') return v ? v.status : '';
    return '';
  }
  function collect() {
    const answers = {};
    allQuestions.forEach(q => { answers[q.id] = readAnswer(q); });
    return answers;
  }
  function summarize(answers) {
    const c = { pass: 0, fail: 0, na: 0 };
    const failed = [];
    allQuestions.forEach(q => {
      const s = statusOf(q, answers[q.id]);
      if (s) c[s]++;
      if (s === 'fail') failed.push(q.label);
    });
    const overall = c.fail > 0 ? 'fail' : (c.pass > 0 ? 'pass' : '');
    return { counts: c, overall, failed };
  }

  // ---------- live UI ----------
  function updateTolerance(card) {
    const q = allQuestions.find(x => x.id === card.dataset.qid);
    const out = $('[data-role="result"]', card);
    const r = evalTolerance(q, $('[data-role="measured"]', card).value, $('[data-role="baseline"]', card).value);
    out.innerHTML = r ? `${esc(fmtDiff(q, r.diff))} ${badge(r.status)}` : '—';
  }
  function updatePassFail(card) {
    $$('.pf label', card).forEach(l => {
      const on = $('input', l).checked;
      l.className = on ? `on-${l.dataset.v}` : '';
    });
  }
  function updateSummary() {
    const { counts, overall } = summarize(collect());
    const el = $('#overall');
    el.className = 'overall ' + overall;
    el.textContent = overall === 'pass' ? 'ผ่านทุกรายการ' : overall === 'fail' ? `ไม่ผ่าน ${counts.fail} รายการ` : '—';
    $('#counts').innerHTML =
      `<span class="badge pass">ผ่าน ${counts.pass}</span><span class="badge fail">ไม่ผ่าน ${counts.fail}</span><span class="badge na">N/A ${counts.na}</span>`;
  }

  function validate(answers) {
    let first = null;
    allQuestions.forEach(q => {
      const card = $(`.q[data-qid="${q.id}"]`);
      const bad = !!q.required && isEmpty(answers[q.id]);
      card.classList.toggle('invalid', bad);
      if (bad && !first) first = card;
    });
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return !first;
  }

  // ---------- submit ----------
  function flatRow(rec) {
    const row = {
      id: rec.id, submittedAt: rec.submittedAt,
      overall: STATUS_LABEL[rec.overall] || '', failedItems: rec.failed.join('; ')
    };
    allQuestions.forEach(q => {
      const v = rec.answers[q.id];
      if (q.type === 'tolerance') {
        row[q.label] = v ? v.measured : '';
        row[`${q.label} [diff]`] = v && v.diff != null ? fmtDiff(q, v.diff) : '';
        row[`${q.label} [result]`] = v ? (STATUS_LABEL[v.status] || '') : '';
      } else if (q.type === 'passfail') {
        row[q.label] = STATUS_LABEL[v] || '';
      } else {
        row[q.label] = Array.isArray(v) ? v.join(', ') : (v ?? '');
      }
    });
    return row;
  }

  async function sendToGoogle(rec) {
    if (!CONFIG.GOOGLE_SCRIPT_URL) return null;
    // text/plain avoids a CORS preflight that Apps Script cannot answer
    const res = await fetch(CONFIG.GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(flatRow(rec))
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return true;
  }

  async function onSubmit(e) {
    e.preventDefault();
    const answers = collect();
    if (!validate(answers)) { toast('กรุณากรอกคำถามที่จำเป็นให้ครบ'); return; }
    const sum = summarize(answers);
    const rec = {
      id: Date.now().toString(36),
      submittedAt: new Date().toISOString(),
      answers, overall: sum.overall, failed: sum.failed
    };
    const records = loadRecords();
    records.unshift(rec);
    const stored = saveRecords(records);
    try {
      localStorage.setItem('linac-qa-last', JSON.stringify({ machine: answers.machine, physicist: answers.physicist }));
    } catch (e) { /* ignore */ }

    const btn = $('button[type=submit]');
    btn.disabled = true;
    let msg = stored ? 'บันทึกเรียบร้อย' : 'บันทึกในเครื่องไม่สำเร็จ';
    try {
      if (await sendToGoogle(rec)) msg += ' • ส่งเข้า Google Sheet แล้ว';
    } catch (err) {
      msg += ' • ส่งเข้า Google Sheet ไม่สำเร็จ';
    }
    btn.disabled = false;
    toast(msg);
    resetForm();
    renderHistory();
  }

  function resetForm() {
    $('#qa-form').reset();
    $$('.q').forEach(c => c.classList.remove('invalid'));
    $$('.q[data-qid]').forEach(card => {
      if ($('[data-role="result"]', card)) updateTolerance(card);
      if ($('.pf', card)) updatePassFail(card);
    });
    setDefaults();
    updateSummary();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- history ----------
  function renderHistory() {
    const records = loadRecords();
    const filter = $('#filter-machine');
    const current = filter.value;
    const machines = [...new Set(records.map(r => r.answers.machine).filter(Boolean))];
    filter.innerHTML = '<option value="">ทุกเครื่อง</option>' + machines.map(m => `<option>${esc(m)}</option>`).join('');
    filter.value = machines.includes(current) ? current : '';

    const rows = records.filter(r => !filter.value || r.answers.machine === filter.value);
    $('#history-empty').hidden = rows.length > 0;
    $('#history-body').innerHTML = rows.map(r => `
      <tr data-id="${r.id}">
        <td>${esc(r.answers.date)} ${esc(r.answers.time || '')}</td>
        <td>${esc(r.answers.machine)}</td>
        <td>${esc(r.answers.physicist)}</td>
        <td>${badge(r.overall) || '—'}</td>
        <td>${esc(r.answers.machine_status || '')}</td>
        <td><button class="link-btn" data-del="${r.id}">ลบ</button></td>
      </tr>`).join('');
  }

  function showDetail(id) {
    const rec = loadRecords().find(r => r.id === id);
    if (!rec) return;
    $('#detail').innerHTML = FORM.sections.map(s => `
      <div class="detail-sec"><h3>${esc(s.title)}</h3>
        ${s.questions.map(q => {
          const v = rec.answers[q.id];
          let txt;
          if (q.type === 'passfail') txt = badge(v) || '—';
          else if (q.type === 'tolerance') txt = v ? `${esc(v.measured)} (${v.diff != null ? esc(fmtDiff(q, v.diff)) : '—'}) ${badge(v.status)}` : '—';
          else txt = esc(Array.isArray(v) ? v.join(', ') : v) || '—';
          return `<div class="detail-row"><span>${esc(q.label)}</span><span class="v">${txt}</span></div>`;
        }).join('')}
      </div>`).join('');
    $('#detail-card').hidden = false;
    $('#detail-card').scrollIntoView({ behavior: 'smooth' });
  }

  function exportCsv() {
    const filter = $('#filter-machine').value;
    const rows = loadRecords().filter(r => !filter || r.answers.machine === filter).map(flatRow);
    if (!rows.length) { toast('ไม่มีข้อมูลให้ส่งออก'); return; }
    const headers = Object.keys(rows[0]);
    const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.map(cell).join(','), ...rows.map(r => headers.map(h => cell(r[h])).join(','))].join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `linac-qa-${today()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  // ---------- events ----------
  function bind() {
    const form = $('#qa-form');
    form.addEventListener('input', e => {
      const card = e.target.closest('.q');
      if (!card) return;
      card.classList.remove('invalid');
      if (e.target.dataset.role) updateTolerance(card);
      if (e.target.closest('.pf')) updatePassFail(card);
      updateSummary();
    });
    form.addEventListener('change', e => {
      const card = e.target.closest('.q');
      if (card && e.target.closest('.pf')) { updatePassFail(card); updateSummary(); }
    });
    form.addEventListener('submit', onSubmit);
    $('#btn-reset').addEventListener('click', () => { if (confirm('ล้างคำตอบทั้งหมด?')) resetForm(); });

    $$('.tab').forEach(t => t.addEventListener('click', () => {
      $$('.tab').forEach(x => x.classList.toggle('active', x === t));
      $$('.view').forEach(v => { v.hidden = v.id !== `view-${t.dataset.view}`; });
      if (t.dataset.view === 'history') renderHistory();
    }));

    $('#filter-machine').addEventListener('change', renderHistory);
    $('#btn-csv').addEventListener('click', exportCsv);
    $('#btn-print').addEventListener('click', () => window.print());
    $('#btn-close-detail').addEventListener('click', () => { $('#detail-card').hidden = true; });
    $('#history-body').addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (del) {
        e.stopPropagation();
        if (confirm('ลบรายการนี้?')) {
          saveRecords(loadRecords().filter(r => r.id !== del.dataset.del));
          $('#detail-card').hidden = true;
          renderHistory();
        }
        return;
      }
      const tr = e.target.closest('tr[data-id]');
      if (tr) showDetail(tr.dataset.id);
    });
  }

  renderForm();
  bind();
  renderHistory();
})();
