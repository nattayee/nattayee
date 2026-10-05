/*
 * One output-calibration report as a row for the "Log" tab of the TRS-398 Output Log sheet.
 * The page writes each report into the Drive "Inbox" folder as a two-row CSV (headers + values,
 * converted to a Google Sheet); the Apps Script in the log sheet (apps-script/ReportImporter.gs)
 * appends it to "Log" by matching header names. Keep COLUMNS and the sheet's header row in sync.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReportLog = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DRIVE_SERVER = 'Google Drive';
  var CREATE_TOOL = 'create_file';

  // [key, header]. "Report ID" must stay first: the importer uses it to skip duplicates.
  var COLUMNS = [
    ['id', 'Report ID'], ['savedAt', 'บันทึกเมื่อ'], ['date', 'วันที่วัด'], ['qaType', 'ชนิด QA'], ['physicist', 'นักฟิสิกส์'], ['userEmail', 'ผู้บันทึก (Gmail)'],
    ['accelerator', 'เครื่อง'], ['energy', 'พลังงาน'], ['beam', 'ชนิดลำรังสี'], ['setup', 'Setup'],
    ['chamber', 'หัววัด'], ['electrometer', 'เครื่องวัดประจุ'], ['mu', 'MU'],
    ['qLabel', 'ดัชนีคุณภาพ'], ['q', 'TPR20,10 / R50'], ['zref', 'z_ref (g/cm²)'], ['zmax', 'z_max (g/cm²)'],
    ['ndw', 'N_D,w (cGy/nC)'], ['kqMode', 'ที่มาของ k_Q'], ['kq', 'k_Q,Q0'], ['kcross', 'k_Q,Qcross'],
    ['temp', 'T (°C)'], ['pressure', 'P'], ['pUnit', 'หน่วย P'],
    ['m1', 'M1 (nC)'], ['m1neg', '-M1 (nC)'], ['m2', 'M2 (nC)'], ['v1', 'V1 (V)'], ['v2', 'V2 (V)'],
    ['ktp', 'k_TP'], ['kpol', 'k_pol'], ['ks', 'k_s'], ['kelec', 'k_elec'], ['kvol', 'k_vol'],
    ['mq', 'M_Q (nC)'], ['depthKind', 'TMR/PDD'], ['depthDose', 'TMR/PDD(z_ref)'],
    ['dzref', 'D_w(z_ref) (cGy/MU)'], ['output', 'Output (cGy/MU)'], ['expected', 'Expected (cGy/MU)'],
    ['diff', '%Diff'], ['result', 'ผล'],
    ['adjusted', 'ปรับเครื่อง'], ['tempAfter', 'T หลังปรับ (°C)'], ['pressureAfter', 'P หลังปรับ'],
    ['m1After', 'M1 หลังปรับ (nC)'], ['ktpAfter', 'k_TP หลังปรับ'], ['outputAfter', 'Output หลังปรับ (cGy/MU)'],
    ['diffAfter', '%Diff หลังปรับ'], ['resultAfter', 'ผลหลังปรับ'],
    ['source', 'แหล่งข้อมูลหลัก'], ['notes', 'หมายเหตุ'], ['userNote', 'หมายเหตุผู้วัด']
  ];

  var RESULT_TEXT = { pass: 'PASS', warn: 'PASS (เกินระดับเฝ้าระวัง)', fail: 'FAIL' };

  function r4(v) { return typeof v === 'number' && isFinite(v) ? Number(v.toFixed(4)) : ''; }
  function r2(v) { return typeof v === 'number' && isFinite(v) ? Number(v.toFixed(2)) : ''; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // All dates and times are Thailand time (GMT+7, no daylight saving), whatever the device's timezone.
  var BKK_OFFSET_MS = 7 * 3600 * 1000;
  function bangkokParts(d) {
    var t = new Date((d || new Date()).getTime() + BKK_OFFSET_MS);
    return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), s: t.getUTCSeconds() };
  }
  function todayBangkok(d) { var p = bangkokParts(d); return p.y + '-' + pad(p.mo) + '-' + pad(p.d); }

  function makeId(now, accelerator, energy) {
    var p = bangkokParts(now);
    var stamp = p.y + pad(p.mo) + pad(p.d) + '-' + pad(p.h) + pad(p.mi) + pad(p.s);
    var tag = (String(accelerator || '').split(/[-\s]/)[0].slice(0, 4) + '-' + String(energy || '').replace(/\s+/g, '')).toUpperCase();
    return stamp + '-' + tag;
  }

  /*
   * ctx: { inp, r, aft, ra, meta, accelerator, energy, chamber, electrometer, physicist, qaType, userNote, userEmail, source, now }
   * (inp/r/aft/ra are the calculation inputs/results from TRS398.calculate / calculateAfter)
   */
  function buildRecord(ctx) {
    var i = ctx.inp, r = ctx.r, a = ctx.aft, ra = ctx.ra, m = ctx.meta || {};
    var now = ctx.now || new Date();
    var photon = i.beam === 'photon';
    var notes = r.errors.concat(r.warnings, ra ? ra.errors.concat(ra.warnings) : []);
    var pUnit = i.pUnit === 'hPa' ? 'mbar' : i.pUnit;
    var rec = {
      id: makeId(now, ctx.accelerator, ctx.energy),
      savedAt: (function (p) { return p.y + '-' + pad(p.mo) + '-' + pad(p.d) + ' ' + pad(p.h) + ':' + pad(p.mi); })(bangkokParts(now)),
      date: m.date || '', qaType: ctx.qaType || '', userEmail: ctx.userEmail || '', physicist: ctx.physicist || m.physicist || '',
      accelerator: ctx.accelerator || '', energy: ctx.energy || '', beam: photon ? 'Photon' : 'Electron',
      setup: photon ? i.setup + ' 100 cm' : 'SSD 100 cm',
      chamber: ctx.chamber || '', electrometer: ctx.electrometer || '', mu: isFinite(i.mu) ? i.mu : '',
      qLabel: photon ? 'TPR20,10' : 'R50', q: r4(r.q), zref: r4(r.zref), zmax: m.zmax === '' || m.zmax == null ? '' : Number(m.zmax),
      ndw: r4(i.ndw), kqMode: { table: 'ตาราง k_Q', unity: 'สอบเทียบในลำรังสีนี้ (1)', direct: 'กรอกเอง' }[i.kqMode] || '',
      kq: r4(r.kq), kcross: r4(r.kcross),
      temp: isFinite(i.tempC) ? i.tempC : '', pressure: isFinite(i.pressure) ? i.pressure : '', pUnit: pUnit,
      m1: i.readNormal || '', m1neg: i.usePol ? i.readOpposite || '' : '', m2: i.useKs ? i.readLow || '' : '',
      v1: i.useKs && isFinite(i.v1) ? i.v1 : '', v2: i.useKs && isFinite(i.v2) ? i.v2 : '',
      ktp: r4(r.ktp), kpol: r4(r.kpol), ks: r4(r.ks), kelec: r4(i.kelec), kvol: r4(i.kvol),
      mq: r4(r.mCorr), depthKind: r.depthDoseKind, depthDose: r.depthDoseKind === 'TMR' ? r4(i.depthDose) : r2(i.depthDose),
      dzref: r4(r.dZrefPerMU), output: r4(r.outputPerMU), expected: r4(i.expected),
      diff: r2(r.deviation), result: r.ok ? RESULT_TEXT[r.status] || '' : 'ข้อมูลไม่ครบ',
      adjusted: ra ? 'ใช่' : 'ไม่',
      tempAfter: ra && isFinite(a.tempC) ? a.tempC : '', pressureAfter: ra && isFinite(a.pressure) ? a.pressure : '',
      m1After: ra ? a.readNormal || '' : '', ktpAfter: ra ? r4(ra.ktp) : '', outputAfter: ra ? r4(ra.outputPerMU) : '',
      diffAfter: ra ? r2(ra.deviation) : '', resultAfter: ra ? (ra.ok ? RESULT_TEXT[ra.status] || '' : 'ข้อมูลไม่ครบ') : '',
      source: ctx.source || '', notes: notes.join(' | '), userNote: ctx.userNote || ''
    };
    return rec;
  }

  function csvCell(v) {
    if (typeof v === 'number') return String(v);
    var s = v == null ? '' : String(v);
    // Text that Sheets would read as a formula (e.g. "-M1" style or "=...") is kept as text
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCsv(rec) {
    var head = COLUMNS.map(function (c) { return csvCell(c[1]); }).join(',');
    var row = COLUMNS.map(function (c) { return csvCell(rec[c[0]]); }).join(',');
    return head + '\r\n' + row + '\r\n';
  }

  function headers() { return COLUMNS.map(function (c) { return c[1]; }); }

  // Saves the report into the Drive inbox folder as a Google Sheet. One-shot write: call only on a click.
  function sendToDrive(mcp, folderId, rec) {
    return mcp.callTool(DRIVE_SERVER, CREATE_TOOL, {
      title: 'TRS398 ' + rec.id,
      parentId: folderId,
      contentMimeType: 'text/csv',
      textContent: toCsv(rec)
    }).then(function (res) {
      var p = res && res.payload;
      if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { p = null; } }
      return { id: p && p.id, url: p && (p.viewUrl || p.webViewLink || p.alternateLink) || (p && p.id ? 'https://docs.google.com/spreadsheets/d/' + p.id + '/edit' : ''),
        appended: !!(p && p.appended), duplicate: !!(p && p.duplicate) };   // appended: written straight to the Log (Apps Script web app)
    });
  }

  return { bangkokParts: bangkokParts, todayBangkok: todayBangkok, COLUMNS: COLUMNS, headers: headers, buildRecord: buildRecord, toCsv: toCsv, sendToDrive: sendToDrive,
    DRIVE_SERVER: DRIVE_SERVER, CREATE_TOOL: CREATE_TOOL };
});
