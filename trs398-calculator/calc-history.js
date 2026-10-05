/*
 * Calculation history: every completed calculation is kept in this browser (localStorage), whether or
 * not it was sent to the Log, and every report already in the Log Sheet is listed with them (read
 * through the Dashboard's Log loader), so past measurements show even on a new device. While the user keeps editing the same machine and energy, the latest
 * entry is updated instead of adding a row per keystroke; clearing the readings, loading an example or
 * sending the report starts a new entry. Entries can be reopened in the calculator or deleted.
 * All stored text goes into the DOM through textContent.
 */
(function (root) {
  'use strict';

  var KEY = 'trs398-calc-history-v1';
  var CAP = 200;
  var SAVE_DELAY = 1500;
  var DAY = 86400000, BKK = 7 * 3600000;

  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function loc() { return root.I18N ? root.I18N.locale() : 'th-TH'; }
  function num(v) { var n = typeof v === 'number' ? v : parseFloat(v); return isFinite(n) ? n : NaN; }
  function sgn(v) { return isFinite(v) ? (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(2) + '%' : '—'; }
  function fixed(v, d) { v = num(v); return isFinite(v) ? v.toFixed(d) : '—'; }
  function statusClass(t) { t = String(t || ''); return /FAIL/i.test(t) ? 'fail' : /เฝ้าระวัง|warn/i.test(t) ? 'warn' : /PASS/i.test(t) ? 'pass' : ''; }

  // Times and dates in Thailand time (GMT+7) whatever the device's timezone
  function timeText(ms) {
    try { return new Date(ms).toLocaleString(loc(), { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }); }
    catch (e) { return new Date(ms).toISOString(); }
  }
  function dateText(ymd) {
    var m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return ymd || '—';
    try { return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 5)).toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok' }); }
    catch (e) { return ymd; }
  }

  var S = { opts: null, store: null, open: null, timer: null, confirmClear: false };

  function read() {
    if (S.store) return S.store;
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
    S.store = s && s.items instanceof Array ? s : { current: null, items: [] };
    return S.store;
  }
  function write() {
    var s = read();
    if (s.items.length > CAP) s.items.length = CAP;
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage full or blocked: keep in memory */ }
  }
  function find(id) { var it = read().items; for (var i = 0; i < it.length; i++) if (it[i].id === id) return it[i]; return null; }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // The record without its per-save stamps, to tell whether anything changed
  function fingerprint(rec) {
    var c = {}; Object.keys(rec).forEach(function (k) { if (k !== 'id' && k !== 'savedAt') c[k] = rec[k]; });
    return JSON.stringify(c);
  }

  // Adds or updates the current entry. sentId: the Report ID when the report was just sent.
  function save(entry, sentId) {
    if (!entry || !entry.rec) return;
    var s = read(), cur = s.current ? find(s.current) : null, fp = fingerprint(entry.rec);
    var same = cur && !cur.sent && cur.rec.accelerator === entry.rec.accelerator && cur.rec.energy === entry.rec.energy;
    if (same) {
      if (cur.fp === fp && !sentId) return;
      cur.at = Date.now(); cur.rec = entry.rec; cur.meta = entry.meta; cur.fp = fp;
      s.items.splice(s.items.indexOf(cur), 1); s.items.unshift(cur);
    } else {
      cur = { id: newId(), at: Date.now(), rec: entry.rec, meta: entry.meta, fp: fp, sent: '' };
      s.items.unshift(cur);
    }
    if (sentId) { cur.sent = sentId; s.current = null; } else s.current = cur.id;
    write();
    if (!$('histView').hidden) render();
  }

  function flush() {
    if (!S.timer) return;
    clearTimeout(S.timer); S.timer = null;
    var e = S.opts.getEntry();
    if (e && e.ok) save(e);
  }
  // The form changed: save once the user pauses
  function note() {
    clearTimeout(S.timer);
    S.timer = setTimeout(function () { S.timer = null; var e = S.opts.getEntry(); if (e && e.ok) save(e); }, SAVE_DELAY);
  }
  // The next calculation is a new measurement (readings cleared, example loaded)
  function newSession() { flush(); clearTimeout(S.timer); S.timer = null; read().current = null; write(); }
  function markSent(rec, meta) { clearTimeout(S.timer); S.timer = null; save({ rec: rec, meta: meta }, rec.id); }

  // ---- Reports from the Log Sheet ----
  function clean(v) { return typeof v === 'string' ? v.replace(/^'/, '') : v; }
  // Cell → epoch ms. Sheet dates/times are Thailand local time; serials and "YYYY-MM-DD HH:mm" text both occur.
  function logTime(v) {
    if (typeof v === 'number' && isFinite(v) && v > 20000) return Math.round((v - 25569) * DAY) - BKK;
    var m = String(v || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) - BKK : 0;
  }
  function logDate(v) {
    if (typeof v === 'number' && isFinite(v) && v > 20000) {
      var d = new Date(Math.round((v - 25569) * DAY));
      return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
    }
    var m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[0] : clean(v) || '';
  }
  function logItems() {
    if (!root.Dashboard || !root.Dashboard.logReports) return [];
    var mine = {};
    read().items.forEach(function (it) { if (it.sent) mine[it.sent] = 1; });   // already listed with its full form state
    return root.Dashboard.logReports().filter(function (r) { return r.id && !mine[clean(r.id)]; }).map(function (r) {
      var rec = {};
      Object.keys(r).forEach(function (k) { rec[k] = clean(r[k]); });
      rec.id = String(rec.id); rec.date = logDate(r.date);
      return { id: 'log:' + rec.id, at: logTime(r.savedAt) || logTime(r.date), rec: rec, meta: null, sent: rec.id, log: true };
    });
  }
  function merged() {
    return read().items.concat(logItems()).sort(function (a, b) { return b.at - a.at || String(b.rec.id || '').localeCompare(String(a.rec.id || '')); });   // Log times are per minute; Report IDs carry seconds
  }

  function showStatus() {
    var st = root.Dashboard && root.Dashboard.status ? root.Dashboard.status() : null, p = $('histStatus');
    p.className = 'src-pill' + (st && st[0] ? ' ' + st[0] : '');
    p.textContent = st ? st[1] : 'ยังไม่ได้โหลด Log Sheet';
  }

  // ---- View ----
  var DETAIL_SKIP = { id: 1, savedAt: 1 };

  function filtered(all) {
    var acc = $('histAcc').value, src = $('histSrc').value, q = $('histSearch').value.trim().toLowerCase();
    return all.filter(function (it) {
      var r = it.rec;
      if (acc && r.accelerator !== acc) return false;
      if (src === 'local' && it.log) return false;
      if (src === 'log' && !it.sent) return false;
      if (!q) return true;
      return [r.accelerator, r.energy, r.qaType, r.physicist, r.date, r.userNote, r.result, it.sent].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }

  function fillAccFilter(all) {
    var sel = $('histAcc'), keep = sel.value, seen = {};
    sel.textContent = '';
    sel.appendChild(el('option', null, 'ทุกเครื่อง')).value = '';
    all.forEach(function (it) {
      var a = it.rec.accelerator;
      if (a && !seen[a]) { seen[a] = 1; var o = el('option', null, a); o.value = a; o.setAttribute('translate', 'no'); sel.appendChild(o); }
    });
    sel.value = seen[keep] ? keep : '';
  }

  function detailRow(it, cols) {
    var tr = el('tr', 'hist-detail'), td = el('td');
    td.colSpan = cols;
    var dl = el('dl', 'hist-grid');
    root.ReportLog.COLUMNS.forEach(function (c) {
      var v = it.rec[c[0]];
      if (DETAIL_SKIP[c[0]] || v === '' || v == null) return;
      var box = el('div');
      box.appendChild(el('dt', null, c[1]));
      var dd = el('dd', null, String(v));
      if (/^(accelerator|physicist|userEmail|chamber|electrometer|source|userNote|m1|m1neg|m2|m1After)$/.test(c[0])) dd.setAttribute('translate', 'no');
      box.appendChild(dd);
      dl.appendChild(box);
    });
    td.appendChild(dl);
    var bar = el('div', 'hist-actions');
    var load = el('button', null, 'โหลดค่ากลับไปที่หน้าคำนวณ'); load.type = 'button';
    load.addEventListener('click', function () { flush(); S.opts.restore(it.meta, it); });
    bar.appendChild(load);
    if (it.log) {
      bar.appendChild(el('span', 'hist-sent-id', 'รายงานจาก Log Sheet · ค่า TPR/R50 ที่บันทึกไว้จะถูกใช้แทน M20/M10'));
      var lid = el('span', 'hist-sent-id', 'Report ID: ' + it.sent); lid.setAttribute('translate', 'no'); bar.appendChild(lid);
      td.appendChild(bar); tr.appendChild(td);
      return tr;
    }
    var del = el('button', 'ghost', 'ลบรายการนี้'); del.type = 'button';
    del.addEventListener('click', function () {
      var s = read(); s.items.splice(s.items.indexOf(it), 1);
      if (s.current === it.id) s.current = null;
      S.open = null; write(); render();
    });
    bar.appendChild(del);
    if (it.sent) { var sid = el('span', 'hist-sent-id', 'Report ID: ' + it.sent); sid.setAttribute('translate', 'no'); bar.appendChild(sid); }
    td.appendChild(bar);
    tr.appendChild(td);
    return tr;
  }

  function render() {
    var all = merged();
    showStatus();
    fillAccFilter(all);
    var rows = filtered(all);
    $('histEmpty').hidden = all.length > 0;
    $('histBody').hidden = all.length === 0;
    $('histCount').textContent = rows.length + ' รายการ';
    var tb = $('histTableBody'), cols = $('histTable').tHead.rows[0].cells.length;
    tb.textContent = '';
    if (!rows.length && all.length) {
      var tr0 = el('tr'), td0 = el('td', 'hist-none', 'ไม่พบรายการที่ตรงกับตัวกรอง'); td0.colSpan = cols; tr0.appendChild(td0); tb.appendChild(tr0);
    }
    rows.forEach(function (it) {
      var r = it.rec, tr = el('tr', 'hist-row');
      tr.tabIndex = 0;
      tr.setAttribute('aria-expanded', String(S.open === it.id));
      var cells = [
        [timeText(it.at)], [dateText(r.date)], [r.accelerator, 'no'], [r.energy, 'no'], [r.qaType],
        [r.qLabel ? (r.qLabel === 'R50' ? fixed(r.q, 3) : fixed(r.q, 4)) : '—', null, 'num'],
        [fixed(r.kq, 4), null, 'num'], [fixed(r.output, 4), null, 'num'], [sgn(num(r.diff)), null, 'num']
      ];
      cells.forEach(function (c) { var td = el('td', c[2] || null, c[0] || '—'); if (c[1]) td.setAttribute('translate', 'no'); tr.appendChild(td); });
      var res = el('td'); if (r.result) res.appendChild(el('span', 'chip ' + statusClass(r.result), r.result)); tr.appendChild(res);
      tr.appendChild(el('td', 'num', r.adjusted === 'ใช่' ? sgn(num(r.diffAfter)) : ''));
      var st = el('td'); st.appendChild(el('span', 'db-src ' + (it.log ? 'log' : it.sent ? 'sent' : 'local'), it.log ? 'Log Sheet' : it.sent ? 'ส่งแล้ว' : 'ยังไม่ส่ง')); tr.appendChild(st);
      function toggle() { S.open = S.open === it.id ? null : it.id; render(); }
      tr.addEventListener('click', toggle);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
      tb.appendChild(tr);
      if (S.open === it.id) tb.appendChild(detailRow(it, cols));
    });
    S.confirmClear = false;
    $('histClear').textContent = 'ล้างประวัติในเบราว์เซอร์นี้';
  }

  function init(opts) {
    S.opts = opts;
    $('histAcc').addEventListener('change', function () { S.open = null; render(); });
    $('histSrc').addEventListener('change', function () { S.open = null; render(); });
    $('histRefresh').addEventListener('click', function () { if (root.Dashboard) { root.Dashboard.refresh(); showStatus(); } });
    if (root.Dashboard && root.Dashboard.onLoad) root.Dashboard.onLoad(function () { if (!$('histView').hidden) render(); });
    $('histSearch').addEventListener('input', function () { S.open = null; render(); });
    $('histClear').addEventListener('click', function () {
      if (!S.confirmClear) { S.confirmClear = true; $('histClear').textContent = 'ยืนยันล้าง (Log Sheet ไม่ถูกลบ)'; return; }
      S.store = { current: null, items: [] }; S.open = null; write(); render();
    });
    // Do not lose the last edit when the page is closed before the save delay ends
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
  }

  function show() {
    flush();
    if (root.Dashboard && root.Dashboard.ensure) root.Dashboard.ensure();
    render();
  }
  function relang() { if (!$('histView').hidden) render(); }

  root.CalcHistory = { init: init, note: note, flush: flush, newSession: newSession, markSent: markSent, show: show, relang: relang, items: function () { return read().items; } };
})(typeof self !== 'undefined' ? self : this);
