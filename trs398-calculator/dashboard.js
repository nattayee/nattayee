/*
 * History dashboard: reads past reports from the TRS-398 Output Log sheet ("Log" tab) through the
 * viewer's Google Drive connector (or an .xlsx of the log), merges reports sent from this browser
 * that the importer has not picked up yet, and shows stat tiles, a %Diff trend chart and a table.
 * Needs SheetJS (XLSX global). All untrusted text goes into the DOM through textContent.
 */
(function (root) {
  'use strict';

  var LOCAL_KEY = 'trs398-sent-history-v1';
  var LOCAL_CAP = 500;
  var XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  var SVGNS = 'http://www.w3.org/2000/svg';
  var DAY = 86400000;

  // Log header → field. Matching is by header text, so column order in the sheet does not matter.
  var HEAD = {
    'Report ID': 'id', 'วันที่วัด': 'date', 'บันทึกเมื่อ': 'savedAt', 'ชนิด QA': 'qa', 'นักฟิสิกส์': 'physicist',
    'เครื่อง': 'acc', 'พลังงาน': 'energy', 'Output (cGy/MU)': 'output', 'Expected (cGy/MU)': 'expected',
    '%Diff': 'diff', 'ผล': 'result', 'ปรับเครื่อง': 'adjusted', 'Output หลังปรับ (cGy/MU)': 'outputAfter',
    '%Diff หลังปรับ': 'diffAfter', 'ผลหลังปรับ': 'resultAfter', 'หมายเหตุผู้วัด': 'note'
  };

  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function svg(tag, attrs) { var e = document.createElementNS(SVGNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function num(v) { if (typeof v === 'number') return isFinite(v) ? v : NaN; var n = parseFloat(String(v == null ? '' : v).replace(/^'/, '').replace(/,/g, '')); return isFinite(n) ? n : NaN; }
  function str(v) { return v == null ? '' : String(v).replace(/^'/, '').trim(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function loc() { return root.I18N ? root.I18N.locale() : 'th-TH'; }
  function thDate(d) { try { return d.toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: '2-digit' }); } catch (e) { return ymd(d); } }
  function sgn(v, d) { return isFinite(v) ? (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(d == null ? 2 : d) : '—'; }

  function toDate(v) {
    if (v instanceof Date && !isNaN(v)) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    if (typeof v === 'number' && isFinite(v) && v > 20000 && v < 80000) {   // spreadsheet serial day
      var d = new Date(Math.round((v - 25569) * DAY));
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    var m = str(v).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = str(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);       // d/m/yyyy
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    return null;
  }

  function normalize(o, source) {
    var date = toDate(o.date) || toDate(o.savedAt);
    var adjusted = /^(ใช่|yes|true)$/i.test(str(o.adjusted)) || isFinite(num(o.outputAfter));
    var r = {
      id: str(o.id), date: date, acc: str(o.acc), energy: str(o.energy), qa: str(o.qa), physicist: str(o.physicist),
      output: num(o.output), expected: num(o.expected), diff: num(o.diff), result: str(o.result),
      adjusted: adjusted, outputAfter: num(o.outputAfter), diffAfter: num(o.diffAfter), resultAfter: str(o.resultAfter),
      note: str(o.note), source: source
    };
    if (!isFinite(r.diff) && isFinite(r.output) && r.expected > 0) r.diff = 100 * (r.output - r.expected) / r.expected;
    return r.id && r.date && isFinite(r.diff) ? r : null;
  }

  // ---- Sources ----
  function parseLogWorkbook(XLSX, wb) {
    var ws = wb.Sheets.Log || wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error('ไม่พบแท็บ Log');
    var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    if (!rows.length) return [];
    var heads = rows[0].map(function (h) { return HEAD[str(h)] || null; });
    if (heads.indexOf('id') < 0) throw new Error('แถวแรกของแท็บ Log ไม่มีหัวคอลัมน์ "Report ID"');
    var out = [];
    for (var i = 1; i < rows.length; i++) {
      var o = {};
      heads.forEach(function (k, j) { if (k) o[k] = rows[i][j]; });
      var n = normalize(o, 'log');
      if (n) out.push(n);
    }
    return out;
  }

  function fetchLog(mcp, XLSX, fileId) {
    return mcp.callTool('Google Drive', 'download_file_content', { fileId: fileId, exportMimeType: XLSX_MIME }, { cache: false })
      .then(function (res) {
        var p = res && res.payload;
        if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { /* raw text */ } }
        var b64 = p && typeof p === 'object' ? p.content : null;
        if (!b64) throw { code: 'bad_shape', message: 'ผลลัพธ์จาก Google Drive ไม่มีเนื้อไฟล์' };
        return parseLogWorkbook(XLSX, XLSX.read(b64, { type: 'base64', cellDates: true }));
      });
  }

  function readLocal() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || []; } catch (e) { return []; } }
  function addLocal(rec) {
    try {
      var list = readLocal().filter(function (r) { return r.id !== rec.id; });
      list.push(rec);
      if (list.length > LOCAL_CAP) list = list.slice(-LOCAL_CAP);
      localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
    } catch (e) { /* storage unavailable */ }
  }
  function localRows() {
    return readLocal().map(function (r) {
      return normalize({ id: r.id, date: r.date, savedAt: r.savedAt, qa: r.qaType, physicist: r.physicist, acc: r.accelerator,
        energy: r.energy, output: r.output, expected: r.expected, diff: r.diff, result: r.result, adjusted: r.adjusted,
        outputAfter: r.outputAfter, diffAfter: r.diffAfter, resultAfter: r.resultAfter, note: r.userNote }, 'local');
    }).filter(Boolean);
  }

  // Seeded example history, clearly marked as such in the UI
  function demoRows() {
    var seed = 7;
    var rnd = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    var series = [['6 MV', 0.2], ['10 MV', -0.3], ['6 MeV', 0.4], ['9 MeV', -0.1]];
    var out = [], today = new Date(), start = new Date(today.getFullYear(), today.getMonth() - 12, 6);
    series.forEach(function (s) {
      var v = s[1];
      for (var m = 0; m <= 12; m++) {
        var d = new Date(start.getFullYear(), start.getMonth() + m, 6 + Math.floor(rnd() * 8));
        if (d > today) break;
        v += (rnd() - 0.45) * 0.55;
        var adj = Math.abs(v) > 1.5;
        var after = adj ? (rnd() - 0.5) * 0.3 : NaN;
        out.push({ id: 'DEMO-' + s[0] + '-' + m, date: d, acc: 'Infinity-6023', energy: s[0], qa: m % 12 === 0 ? 'Annually' : 'Monthly',
          physicist: 'ตัวอย่าง', output: 1 + v / 100, expected: 1, diff: v, result: Math.abs(v) <= 1 ? 'PASS' : Math.abs(v) <= 2 ? 'PASS (เกินระดับเฝ้าระวัง)' : 'FAIL',
          adjusted: adj, outputAfter: adj ? 1 + after / 100 : NaN, diffAfter: after, resultAfter: adj ? 'PASS' : '', note: '', source: 'demo' });
        if (adj) v = after;
      }
    });
    return out;
  }

  // ---- State ----
  var S = { log: [], logStatus: '', logAt: 0, demo: false, opts: null, loaded: false, hoverDate: null };

  function allRows() {
    if (S.demo) return demoRows();
    var byId = {};
    S.log.forEach(function (r) { byId[r.id] = r; });
    localRows().forEach(function (r) { if (!byId[r.id]) byId[r.id] = r; });
    return Object.keys(byId).map(function (k) { return byId[k]; });
  }

  // Energy order follows the master data so a series keeps its colour whatever the filter
  function energyOrder(rows) {
    var order = [], seen = {};
    var D = S.opts.getData();
    (D && D.accelerators || []).forEach(function (a) {
      a.photon.concat(a.electron).forEach(function (e) { if (!seen[e.energy]) { seen[e.energy] = 1; order.push(e.energy); } });
    });
    order.sort(function (x, y) { return rank(x) - rank(y); });
    rows.forEach(function (r) { if (!seen[r.energy]) { seen[r.energy] = 1; order.push(r.energy); } });
    return order;
  }
  function rank(e) { var n = parseFloat(e) || 0; return (/MeV/i.test(e) ? 1000 : 0) + (/FFF/i.test(e) ? 500 : 0) + n; }

  function filters() {
    return { acc: $('dbAcc').value, energy: $('dbEnergy').value, qa: $('dbQa').value, months: +$('dbRange').value };
  }
  function applyFilters(rows, f) {
    var from = f.months ? new Date(Date.now() - f.months * 30.44 * DAY) : null;
    return rows.filter(function (r) {
      return (!f.acc || r.acc === f.acc) && (!f.energy || r.energy === f.energy) && (!f.qa || r.qa === f.qa) && (!from || r.date >= from);
    }).sort(function (a, b) { return a.date - b.date || a.id.localeCompare(b.id); });
  }

  function fillSelect(sel, values, allLabel) {
    var keep = sel.value;
    sel.textContent = '';
    var o = el('option', null, allLabel); o.value = ''; sel.appendChild(o);
    values.forEach(function (v) { var x = el('option', null, v); x.value = v; sel.appendChild(x); });
    sel.value = values.indexOf(keep) >= 0 ? keep : '';
  }

  // ---- Render ----
  function render() {
    if (!S.opts) return;
    var rows = allRows();
    var accs = rows.map(function (r) { return r.acc; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; }).sort();
    fillSelect($('dbAcc'), accs, 'ทุกเครื่อง');
    if (!S.accPicked && accs.length > 1 && !$('dbAcc').value) { $('dbAcc').value = accs[0]; }
    if (accs.length) S.accPicked = true;
    var f0 = filters();
    var forEnergy = rows.filter(function (r) { return !f0.acc || r.acc === f0.acc; });
    var order = energyOrder(rows);
    fillSelect($('dbEnergy'), order.filter(function (e) { return forEnergy.some(function (r) { return r.energy === e; }); }), 'ทุกพลังงาน');
    var f = filters();
    var view = applyFilters(rows, f);
    $('dbDemoNote').hidden = !S.demo;
    $('dbEmpty').hidden = rows.length > 0;
    $('dbBody').hidden = rows.length === 0;
    if (!rows.length) return;
    $('dbBody').classList.toggle('db-loading', false);
    renderTiles(view, f);
    renderChart(view, order, !f.acc && accs.length > 1, rows);
    renderTable(view);
  }

  function statusClass(text) { return /^FAIL/.test(text) ? 'fail' : /เฝ้าระวัง/.test(text) ? 'warn' : /^PASS/.test(text) ? 'pass' : ''; }

  function tile(label, value, sub, extra) {
    var t = el('div', 'db-tile');
    t.appendChild(el('div', 'db-tile-label', label));
    t.appendChild(el('div', 'db-tile-value', value));
    if (sub) t.appendChild(el('div', 'db-tile-sub', sub));
    if (extra) t.appendChild(extra);
    return t;
  }

  function renderTiles(view, f) {
    var box = $('dbTiles'); box.textContent = '';
    box.appendChild(tile('จำนวนการวัด', String(view.length), view.length ? thDate(view[0].date) + ' – ' + thDate(view[view.length - 1].date) : 'ไม่มีข้อมูลในช่วงนี้'));
    if (!view.length) return;
    var last = view[view.length - 1];
    var lastOut = last.adjusted && isFinite(last.outputAfter) ? last.outputAfter : last.output;
    var lastDiff = last.adjusted && isFinite(last.diffAfter) ? last.diffAfter : last.diff;
    box.appendChild(tile('ค่าล่าสุด' + (f.energy ? '' : ' (' + last.energy + ')'), isFinite(lastOut) ? lastOut.toFixed(4) : '—',
      sgn(lastDiff) + '% · ' + thDate(last.date) + (last.adjusted ? ' · หลังปรับ' : '')));
    var diffs = view.map(function (r) { return r.diff; });
    var mean = diffs.reduce(function (a, b) { return a + b; }, 0) / diffs.length;
    var sd = diffs.length > 1 ? Math.sqrt(diffs.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / (diffs.length - 1)) : 0;
    box.appendChild(tile('%Diff เฉลี่ย (ก่อนปรับ)', sgn(mean) + '%', 'SD ' + sd.toFixed(2) + '% · ช่วง ' + sgn(Math.min.apply(null, diffs)) + ' ถึง ' + sgn(Math.max.apply(null, diffs))));
    var c = { pass: 0, warn: 0, fail: 0 };
    view.forEach(function (r) { var k = statusClass(r.result); if (k) c[k]++; });
    var chips = el('div', 'db-chips');
    [['pass', '✓ ผ่าน', c.pass], ['warn', '! เฝ้าระวัง', c.warn], ['fail', '✕ เกินเกณฑ์', c.fail]].forEach(function (x) {
      var ch = el('span', 'chip ' + x[0], x[1] + ' ' + x[2]); chips.appendChild(ch);
    });
    var adj = view.filter(function (r) { return r.adjusted; }).length;
    box.appendChild(tile('ผลก่อนปรับ', '', 'ปรับเครื่อง ' + adj + ' ครั้ง', chips));
  }

  function niceStep(span) { var raw = span / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : 5) * p; }

  function renderChart(view, order, byMachine, universe) {
    var wrap = $('dbChart'); wrap.textContent = '';
    var legend = $('dbLegend'); legend.textContent = '';
    var tip = $('dbTip'); tip.hidden = true;
    if (!view.length) { wrap.appendChild(el('div', 'db-tile-sub', 'ไม่มีข้อมูลตามตัวกรองนี้')); return; }
    var th = S.opts.getThresholds();
    var W = Math.max(320, wrap.clientWidth || 720), H = 300;
    var m = { l: 46, r: 16, t: 14, b: 30 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var t0 = view[0].date.getTime(), t1 = view[view.length - 1].date.getTime();
    if (t1 - t0 < 14 * DAY) { t0 -= 7 * DAY; t1 += 7 * DAY; }
    var padT = (t1 - t0) * 0.03; t0 -= padT; t1 += padT;
    var vals = [];
    view.forEach(function (r) { vals.push(r.diff); if (isFinite(r.diffAfter)) vals.push(r.diffAfter); });
    var lim = Math.max(th.tol * 1.25, Math.max.apply(null, vals.map(Math.abs)) * 1.1);
    var step = niceStep(2 * lim); lim = Math.ceil(lim / step) * step;
    var x = function (t) { return m.l + (t - t0) / (t1 - t0) * pw; };
    var y = function (v) { return m.t + (lim - v) / (2 * lim) * ph; };

    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: H, role: 'img', tabindex: '0',
      'aria-label': 'แนวโน้ม %Diff ของ output ตามวันที่วัด เส้นละหนึ่งพลังงาน' });
    // Tolerance bands: action level, then watch level, then zero baseline
    s.appendChild(svg('rect', { x: m.l, y: y(th.tol), width: pw, height: y(-th.tol) - y(th.tol), fill: 'var(--warn-soft)' }));
    s.appendChild(svg('rect', { x: m.l, y: y(th.warn), width: pw, height: y(-th.warn) - y(th.warn), fill: 'var(--ok-soft)' }));
    for (var v = -lim; v <= lim + 1e-9; v += step) {
      s.appendChild(svg('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: Math.abs(v) < 1e-9 ? 'var(--muted)' : 'var(--line)', 'stroke-width': 1 }));
      var tl = svg('text', { x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'db-axis' }); tl.textContent = sgn(v, step < 1 ? 1 : 0).replace('±', '') + '%'; s.appendChild(tl);
    }
    // Month ticks
    var d = new Date(t0); d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    var months = []; while (d.getTime() <= t1) { months.push(new Date(d)); d = new Date(d.getFullYear(), d.getMonth() + 1, 1); }
    var every = Math.max(1, Math.ceil(months.length / Math.max(2, Math.floor(pw / 70))));
    months.forEach(function (md, i) {
      if (i % every) return;
      var tx = svg('text', { x: x(md.getTime()), y: H - 8, 'text-anchor': 'middle', class: 'db-axis' });
      try { tx.textContent = md.toLocaleDateString(loc(), { month: 'short', year: '2-digit' }); } catch (e) { tx.textContent = ymd(md).slice(0, 7); }
      s.appendChild(tx);
    });
    // Band labels (text tokens, not status colours alone)
    var bl = svg('text', { x: W - m.r - 4, y: y(th.tol) - 5, 'text-anchor': 'end', class: 'db-axis' }); bl.textContent = '±' + th.tol + '% เกณฑ์ยอมรับ'; s.appendChild(bl);

    var keyOf = function (r) { return byMachine ? r.acc + ' · ' + r.energy : r.energy; };
    var groups = {};
    view.forEach(function (r) { (groups[keyOf(r)] = groups[keyOf(r)] || []).push(r); });
    // Colour follows the series, never its position in the current filter: slots come from the
    // full key list (energy order from the master data; machine first when machines are combined)
    var present = {};
    universe.forEach(function (r) { present[keyOf(r)] = true; });
    var stable = [];
    var accList = universe.map(function (r) { return r.acc; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();
    (byMachine ? accList : ['']).forEach(function (a) {
      order.forEach(function (e) { var k = byMachine ? a + ' · ' + e : e; if (present[k]) stable.push(k); });
    });
    var energies = stable.filter(function (k) { return groups[k]; });
    var dropped = energies.slice(8);
    energies = energies.slice(0, 8);
    var colour = function (k) { var i = stable.indexOf(k); return i >= 0 && i < 8 ? 'var(--s' + (i + 1) + ')' : 'var(--muted)'; };
    if (byMachine && stable.length > 8) {
      // More than 8 machine/energy series cannot keep distinct colours: ask for a narrower view
      energies = []; dropped = [];
      legend.appendChild(el('span', 'db-tile-sub', 'เลือกเครื่องเพื่อดูเส้นแนวโน้มแยกตามพลังงาน (รวมทุกเครื่องมีเกิน 8 เส้น)'));
    }
    energies.forEach(function (e) {
      var pts = groups[e];
      var dpath = pts.map(function (r, i) { return (i ? 'L' : 'M') + x(r.date.getTime()).toFixed(1) + ' ' + y(r.diff).toFixed(1); }).join(' ');
      s.appendChild(svg('path', { d: dpath, fill: 'none', stroke: colour(e), 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      pts.forEach(function (r) {
        var cx = x(r.date.getTime());
        if (r.adjusted && isFinite(r.diffAfter)) {
          s.appendChild(svg('line', { x1: cx, x2: cx, y1: y(r.diff), y2: y(r.diffAfter), stroke: colour(e), 'stroke-width': 1.5 }));
          s.appendChild(svg('circle', { cx: cx, cy: y(r.diffAfter), r: 4, fill: 'var(--surface)', stroke: colour(e), 'stroke-width': 2 }));
        }
        s.appendChild(svg('circle', { cx: cx, cy: y(r.diff), r: 4, fill: colour(e), stroke: 'var(--surface)', 'stroke-width': 2 }));
      });
      var li = el('span', 'db-legend-item');
      var key = el('span', 'db-key'); key.style.background = colour(e);
      li.appendChild(key); li.appendChild(document.createTextNode(e)); legend.appendChild(li);
    });
    if (dropped.length) legend.appendChild(el('span', 'db-tile-sub', 'ไม่แสดง ' + dropped.length + ' เส้น เลือกพลังงานเพื่อดู'));
    var li2 = el('span', 'db-legend-item');
    li2.appendChild(el('span', 'db-key-ring')); li2.appendChild(document.createTextNode('หลังปรับ')); legend.appendChild(li2);

    // Crosshair + tooltip: snap to the nearest measurement date
    var dates = view.map(function (r) { return ymd(r.date); }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    var cross = svg('line', { y1: m.t, y2: H - m.b, stroke: 'var(--muted)', 'stroke-width': 1, visibility: 'hidden' });
    s.appendChild(cross);
    var hit = svg('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent' });
    s.appendChild(hit);
    wrap.appendChild(s);

    function show(dateKey) {
      var at = view.filter(function (r) { return ymd(r.date) === dateKey; });
      if (!at.length) return;
      var cx = x(at[0].date.getTime());
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
      tip.textContent = '';
      tip.appendChild(el('div', 'db-tip-date', thDate(at[0].date)));
      at.forEach(function (r) {
        var row = el('div', 'db-tip-row');
        var k = el('span', 'db-tip-key'); k.style.background = colour(keyOf(r)); row.appendChild(k);
        row.appendChild(el('strong', null, sgn(r.diff) + '%'));
        row.appendChild(el('span', 'db-tip-name', r.energy + (r.acc && !$('dbAcc').value ? ' · ' + r.acc : '') +
          (r.adjusted && isFinite(r.diffAfter) ? ' → หลังปรับ ' + sgn(r.diffAfter) + '%' : '')));
        tip.appendChild(row);
      });
      tip.hidden = false;
      var box = wrap.getBoundingClientRect(), sx = box.width / W;
      var left = cx * sx + 12;
      if (left + tip.offsetWidth > box.width) left = cx * sx - tip.offsetWidth - 12;
      tip.style.left = Math.max(0, left) + 'px';
      tip.style.top = '12px';
      S.hoverDate = dateKey;
    }
    function hide() { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; }
    s.addEventListener('pointermove', function (ev) {
      var box = s.getBoundingClientRect();
      var px = (ev.clientX - box.left) / box.width * W;
      var best = null, bd = Infinity;
      dates.forEach(function (k) { var dd = Math.abs(x(toDate(k).getTime()) - px); if (dd < bd) { bd = dd; best = k; } });
      if (best) show(best);
    });
    s.addEventListener('pointerleave', hide);
    s.addEventListener('blur', hide);
    s.addEventListener('keydown', function (ev) {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      ev.preventDefault();
      var i = dates.indexOf(S.hoverDate);
      i = i < 0 ? dates.length - 1 : Math.max(0, Math.min(dates.length - 1, i + (ev.key === 'ArrowRight' ? 1 : -1)));
      show(dates[i]);
    });
  }

  function renderTable(view) {
    var tb = $('dbTableBody'); tb.textContent = '';
    var rows = view.slice().reverse();
    rows.forEach(function (r) {
      var tr = el('tr');
      var cells = [
        thDate(r.date), r.acc, r.energy, r.qa, r.physicist,
        isFinite(r.output) ? r.output.toFixed(4) : '—', sgn(r.diff) + '%'
      ];
      cells.forEach(function (c, i) { tr.appendChild(el('td', i >= 5 ? 'num' : null, c)); });
      var res = el('td'); if (r.result) res.appendChild(el('span', 'chip ' + statusClass(r.result), r.result)); tr.appendChild(res);
      tr.appendChild(el('td', 'num', r.adjusted && isFinite(r.diffAfter) ? sgn(r.diffAfter) + '%' : ''));
      tr.children[1].setAttribute('translate', 'no');   // machine name
      tr.children[4].setAttribute('translate', 'no');   // physicist names
      var src = el('td'); src.appendChild(el('span', 'db-src ' + r.source, { log: 'Log', local: 'รอนำเข้า', demo: 'ตัวอย่าง' }[r.source]));
      if (r.note) src.title = r.note;
      tr.appendChild(src);
      tb.appendChild(tr);
    });
    $('dbCount').textContent = rows.length + ' รายการ';
  }

  // ---- Loading ----
  // text may be a function so a status with a time can be rebuilt in the other language
  function setStatus(kind, text) {
    S.status = [kind, text];
    var p = $('dbStatus'); p.className = 'src-pill' + (kind ? ' ' + kind : '');
    p.textContent = typeof text === 'function' ? text() : text;
  }

  function errorText(err) {
    var code = err && err.code;
    if (code === 'needs_reauth') return 'เชื่อมต่อ Google Drive ใหม่ที่ claude.ai Settings → Connectors';
    if (code === 'server_not_connected') return 'เพิ่ม Google Drive ที่ claude.ai Settings → Connectors';
    if (code === 'not_in_manifest') return 'หน้านี้ยังไม่ได้รับอนุญาตให้อ่าน Google Drive';
    if (code === 'tool_error') return 'อ่าน Log Sheet ไม่ได้: ' + (err.message || '') + ' ตรวจสอบลิงก์และสิทธิ์';
    if (code === 'server_unavailable') return 'Google Drive ไม่ตอบสนองชั่วคราว ลองรีเฟรช';
    return 'ดึง Log ไม่สำเร็จ' + (err && err.message ? ': ' + err.message : '');
  }

  function load() {
    var o = S.opts;
    var mcp = o.getMcp(), XLSX = o.getXLSX();
    var id = o.getLogId();
    $('dbBody').classList.add('db-loading');
    if (!mcp || !XLSX || !id) {
      setStatus('', mcp ? 'ใส่ลิงก์ Log Sheet ใน "ปลายทางของรายงาน"' : 'อ่าน Log Sheet ได้เมื่อเปิดใน claude.ai · ใช้ปุ่มเลือกไฟล์ .xlsx ได้');
      S.loaded = true; render(); return;
    }
    S.triedMcp = true;
    setStatus('busy', 'กำลังอ่าน Log Sheet…');
    fetchLog(mcp, XLSX, id).then(function (rows) {
      S.log = rows; S.logAt = Date.now(); S.demo = false;
      setStatus('live', function () { return 'Log Sheet · ' + rows.length + ' รายการ · ' + new Date(S.logAt).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' }); });
    }, function (err) {
      setStatus('err', errorText(err));
    }).then(function () { S.loaded = true; render(); });
  }

  function loadFile(file) {
    var XLSX = S.opts.getXLSX();
    if (!XLSX) { setStatus('err', 'โหลดตัวอ่านไฟล์ Excel ไม่ได้'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        S.log = parseLogWorkbook(XLSX, XLSX.read(new Uint8Array(reader.result), { type: 'array', cellDates: true }));
        S.demo = false;
        setStatus('file', file.name + ' · ' + S.log.length + ' รายการ');
      } catch (e) { setStatus('err', 'อ่านไฟล์ไม่ได้: ' + e.message); }
      render();
    };
    reader.readAsArrayBuffer(file);
  }

  function init(opts) {
    S.opts = opts;
    ['dbAcc', 'dbEnergy', 'dbQa', 'dbRange'].forEach(function (id) { $(id).addEventListener('change', render); });
    $('dbRefresh').addEventListener('click', function () { S.demo = false; load(); });
    $('dbDemo').addEventListener('click', function () { S.demo = true; render(); });
    $('dbDemoOff').addEventListener('click', function () { S.demo = false; render(); });
    $('dbFile').addEventListener('change', function (e) { var f = e.target.files && e.target.files[0]; if (f) loadFile(f); e.target.value = ''; });
    var t; window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(function () { if (!$('dashView').hidden) render(); }, 150); });
  }

  // Load on first open, and again once the Drive connector becomes available
  function show() {
    if (!S.loaded || (S.opts.getMcp() && !S.triedMcp)) load(); else render();
  }

  // Rebuild language-dependent text (dates, status) after the language changes
  function relang() {
    if (S.status) setStatus(S.status[0], S.status[1]);
    if (S.opts && S.loaded) render();
  }

  // Force a fresh Log read the next time the dashboard opens (a report was just written to it)
  function invalidate() { S.loaded = false; S.triedMcp = false; }

  root.Dashboard = { invalidate: invalidate, relang: relang, init: init, show: show, refresh: function () { S.demo = false; load(); }, render: render, addLocal: addLocal, parseLogWorkbook: parseLogWorkbook, normalize: normalize };
})(typeof self !== 'undefined' ? self : this);
