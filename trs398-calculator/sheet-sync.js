/*
 * Reads the master data out of the "TG398 LPCH" workbook (sheets "0. List" and
 * "1. kQ,Q0 table") into the same shape as lpch-data.js. Needs SheetJS (XLSX global).
 *
 * Sources, in order of preference:
 *   1. the viewer's Google Drive connector (claude.ai artifact viewer only)
 *   2. an .xlsx file the user picks
 *   3. the bundled snapshot in lpch-data.js
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SheetSync = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SHEET_LIST = '0. List';
  var SHEET_KQ = '1. kQ,Q0 table';
  var DRIVE_SERVER = 'Google Drive';
  var DRIVE_TOOL = 'download_file_content';
  var XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  function fileIdFromUrl(text) {
    var s = String(text || '').trim();
    var m = s.match(/\/(?:d|folders)\/([A-Za-z0-9_-]{20,})/) || s.match(/^([A-Za-z0-9_-]{20,})$/);
    return m ? m[1] : null;
  }

  function cellGetter(ws) {
    return function (addr) { var c = ws && ws[addr]; return c ? c.v : null; };
  }
  function num(v) {
    return typeof v === 'number' && isFinite(v) && v !== 0 ? v : null;
  }
  function colName(i) {           // 0 -> A
    var s = ''; i += 1;
    while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  // Column letters per accelerator slot L1/L2/L3 in "0. List"
  var COLS = {
    zmaxP: ['C', 'D', 'E'], tmr: ['F', 'G', 'H'], r50: ['J', 'K', 'L'],
    zmaxE: ['M', 'N', 'O'], ndwE: ['P', 'Q', 'R'], pddE: ['S', 'T', 'U'], kcross: ['V', 'W', 'X']
  };
  var MAX_ROWS = 40;

  function parseWorkbook(XLSX, wb, sourceLabel) {
    var wsL = wb.Sheets[SHEET_LIST], wsK = wb.Sheets[SHEET_KQ];
    if (!wsL) throw new Error('ไม่พบ sheet "' + SHEET_LIST + '"');
    if (!wsK) throw new Error('ไม่พบ sheet "' + SHEET_KQ + '"');
    var L = cellGetter(wsL), K = cellGetter(wsK);

    var data = { source: sourceLabel, accelerators: [], chambers: [], electrometers: [] };
    var accNames = [L('A3'), L('A4'), L('A5')];
    accNames.forEach(function (name, i) {
      if (name == null || name === '') return;
      var acc = { name: String(name), photon: [], electron: [] };
      for (var r = 3; r < 3 + MAX_ROWS; r++) {
        var e = L('B' + r);
        if (e == null || e === '') continue;
        var z = num(L(COLS.zmaxP[i] + r)), t = num(L(COLS.tmr[i] + r));
        if (z == null && t == null) continue;
        var label = typeof e === 'number' ? e + ' MV' : String(e).replace(/FFF/i, ' MV FFF').replace(/\s+/g, ' ').trim();
        acc.photon.push({ energy: label, zmax: z, tmr: t });
      }
      for (var r2 = 3; r2 < 3 + MAX_ROWS; r2++) {
        var en = L('I' + r2);
        if (typeof en !== 'number') continue;
        var r50 = num(L(COLS.r50[i] + r2));
        if (r50 == null) continue;
        acc.electron.push({
          energy: en + ' MeV', r50: r50, zmax: num(L(COLS.zmaxE[i] + r2)), ndw: num(L(COLS.ndwE[i] + r2)),
          pdd: num(L(COLS.pddE[i] + r2)), kcross: num(L(COLS.kcross[i] + r2))
        });
      }
      data.accelerators.push(acc);
    });
    for (var r3 = 3; r3 < 3 + MAX_ROWS; r3++) {
      var ch = L('AA' + r3);
      if (ch) data.chambers.push({ name: String(ch), ndw: num(L('AB' + r3)), type: /\bPP\b/i.test(ch) ? 'pp' : 'cyl' });
      var em = L('AC' + r3);
      if (em) data.electrometers.push(String(em));
    }

    // kQ tables: header row holds the grid from column D; chamber rows follow until a blank block.
    function kqTable(headerRow, qLabel) {
      var grid = [], c = 3;
      while (typeof K(colName(c) + headerRow) === 'number') { grid.push(K(colName(c) + headerRow)); c++; }
      var chambers = [];
      for (var r = headerRow + 1; r < headerRow + 12; r++) {
        var name = K('C' + r);
        if (!name) continue;
        var vals = grid.map(function (_, j) { return K(colName(3 + j) + r); });
        if (vals.every(function (v) { return num(v) != null; })) chambers.push({ name: String(name), kq: vals });
      }
      return { qLabel: qLabel, grid: grid, chambers: chambers };
    }
    data.kqPhoton = kqTable(findRow(K, 'TPR20,10'), 'TPR20,10');
    data.kqElectron = kqTable(findRow(K, 'R50'), 'R50');

    if (!data.accelerators.length) throw new Error('ไม่พบรายชื่อเครื่องใน "' + SHEET_LIST + '"');
    if (!data.kqPhoton.grid.length) throw new Error('ไม่พบตาราง kQ ของ photon');
    return data;
  }

  // Row whose column C holds the beam-quality label (e.g. "TPR20,10" at C4, "R50" at C16)
  function findRow(K, label) {
    for (var r = 1; r < 60; r++) if (String(K('C' + r) || '').replace(/\s/g, '') === label) return r;
    return -1;
  }

  function parseBase64(XLSX, b64, sourceLabel) {
    return parseWorkbook(XLSX, XLSX.read(b64, { type: 'base64' }), sourceLabel);
  }
  function parseArrayBuffer(XLSX, buf, sourceLabel) {
    return parseWorkbook(XLSX, XLSX.read(new Uint8Array(buf), { type: 'array' }), sourceLabel);
  }

  // Pull the base64 body out of the Drive connector's result
  function base64FromResult(result) {
    var p = result && result.payload;
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { return p; } }
    if (p && typeof p === 'object') {
      if (typeof p.content === 'string') return { b64: p.content, title: p.title };
      if (p.file && typeof p.file.content === 'string') return { b64: p.file.content, title: p.file.title };
    }
    var blocks = (result && result.content) || [];
    for (var i = 0; i < blocks.length; i++) {
      if (blocks[i].type === 'text') {
        try { var j = JSON.parse(blocks[i].text); if (j && typeof j.content === 'string') return { b64: j.content, title: j.title }; } catch (e) { /* not JSON */ }
      }
    }
    return null;
  }

  // Resolves {data, title} or rejects with {code, message}
  function fetchFromDrive(mcp, XLSX, fileId) {
    return mcp.callTool(DRIVE_SERVER, DRIVE_TOOL, { fileId: fileId, exportMimeType: XLSX_MIME }, { cache: false })
      .then(function (res) {
        var got = base64FromResult(res);
        if (!got || !got.b64) throw { code: 'bad_shape', message: 'ผลลัพธ์จาก Google Drive ไม่มีเนื้อไฟล์' };
        var label = (got.title || 'Google Sheet') + ' (Google Drive)';
        return { data: parseBase64(XLSX, got.b64, label), title: got.title || '' };
      });
  }

  return {
    SHEET_LIST: SHEET_LIST, SHEET_KQ: SHEET_KQ, DRIVE_SERVER: DRIVE_SERVER, DRIVE_TOOL: DRIVE_TOOL,
    fileIdFromUrl: fileIdFromUrl, parseWorkbook: parseWorkbook, parseBase64: parseBase64,
    parseArrayBuffer: parseArrayBuffer, base64FromResult: base64FromResult, fetchFromDrive: fetchFromDrive
  };
});
