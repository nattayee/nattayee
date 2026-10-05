/**
 * TRS-398 Output Calibration — Google Apps Script web app. This is the only file the project needs.
 * The page itself (index.html) is loaded from GitHub, so app updates arrive without re-pasting.
 * Deploy → New deployment → Web app (Execute as: Me).
 */
var WEBAPP = {
  PAGE_URL: 'https://raw.githubusercontent.com/nattayee/nattayee/refs/heads/claude/brave-volta-pjvcd3/trs398-calculator/apps-script/webapp/index.html',
  MASTER_SHEET_ID: '1t8KCsJtuv3vVzqRT_uWblHEDWYARuB1KU5gqVUTpt4w',   // TG398 LPCH (master data)
  LOG_SHEET_ID: '1UpWd0zPjEDnKIuV1q6j5O4CDemNt0BbYkbFWMIudTL8',      // TRS-398 Output Log (LPCH)
  LOG_TAB: 'Log',
  ID_HEADER: 'Report ID',
  RESULT_HEADERS: ['ผล', 'ผลหลังปรับ'],
  TITLE: 'TRS-398 Output Calibration · Lampang Cancer Hospital',
  CACHE_SECONDS: 600
};

function doGet() {
  return HtmlService.createHtmlOutput(loadPage_())
    .setTitle(WEBAPP.TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** The page from GitHub, cached in ~30k-character pieces (the cache holds at most 100 KB per value). */
function loadPage_() {
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get('page_n') || 0);
  if (n) {
    var keys = [];
    for (var i = 0; i < n; i++) keys.push('page_' + i);
    var got = cache.getAll(keys);
    if (Object.keys(got).length === n) return keys.map(function (k) { return got[k]; }).join('');
  }
  var res = UrlFetchApp.fetch(WEBAPP.PAGE_URL, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('โหลดหน้าแอปจาก GitHub ไม่ได้ (HTTP ' + res.getResponseCode() + ')');
  var html = res.getContentText('UTF-8');
  var parts = {}, size = 30000;
  for (var j = 0; j * size < html.length; j++) parts['page_' + j] = html.substr(j * size, size);
  parts.page_n = String(j);
  cache.putAll(parts, WEBAPP.CACHE_SECONDS);
  return html;
}

/** Master Sheet or Output Log as .xlsx (base64) for the page. Only these two files can be read. */
function apiExportXlsx(fileId) {
  if (fileId !== WEBAPP.MASTER_SHEET_ID && fileId !== WEBAPP.LOG_SHEET_ID) {
    throw new Error('ไฟล์นี้ไม่ได้อยู่ในรายการที่ web app อ่านได้ (แก้ WEBAPP ใน WebApp.gs)');
  }
  var title = DriveApp.getFileById(fileId).getName();   // also grants the Drive scope used below
  var res = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + fileId + '/export?format=xlsx', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('ส่งออก .xlsx ไม่สำเร็จ (HTTP ' + res.getResponseCode() + ')');
  return { content: Utilities.base64Encode(res.getBlob().getBytes()), title: title, id: fileId };
}

/** Appends one report (two-row CSV: headers + values) to the Log tab by header name; skips known Report IDs. */
function apiAppendReport(csvText) {
  var rows = Utilities.parseCsv(String(csvText || ''));
  if (rows.length < 2) throw new Error('รายงานว่างเปล่า');
  var unquote = function (v) { return typeof v === 'string' && v.charAt(0) === "'" ? v.slice(1) : v; };
  var headers = rows[0].map(function (h) { return String(unquote(h)).trim(); });
  var values = rows[1].map(unquote);
  if (headers[0] !== WEBAPP.ID_HEADER) throw new Error('รูปแบบรายงานไม่ถูกต้อง');

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.openById(WEBAPP.LOG_SHEET_ID);
    var sheet = ss.getSheetByName(WEBAPP.LOG_TAB);
    if (!sheet) throw new Error('ไม่พบแท็บ "' + WEBAPP.LOG_TAB + '" ใน Log Sheet');
    var logHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0]
      .map(function (h) { return String(h).trim(); });
    var col = {};
    logHeaders.forEach(function (h, i) { if (h) col[h] = i; });

    var id = String(values[0]), idCol = col[WEBAPP.ID_HEADER], lastRow = sheet.getLastRow();
    if (idCol != null && lastRow > 1) {
      var ids = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) === id) return { appended: false, duplicate: true, id: WEBAPP.LOG_SHEET_ID, viewUrl: ss.getUrl() };
      }
    }
    headers.forEach(function (h) {   // headers the log does not have yet go at the end
      if (h && col[h] == null) {
        logHeaders.push(h);
        col[h] = logHeaders.length - 1;
        sheet.getRange(1, logHeaders.length).setValue(h).setFontWeight('bold');
      }
    });
    var out = logHeaders.map(function () { return ''; });
    headers.forEach(function (h, j) { if (h) out[col[h]] = values[j]; });
    sheet.appendRow(out);
    var row = sheet.getLastRow();
    WEBAPP.RESULT_HEADERS.forEach(function (h) {
      if (col[h] == null) return;
      var cell = sheet.getRange(row, col[h] + 1), v = String(cell.getValue());
      var colour = /^FAIL/.test(v) ? '#fbe3e0' : /เฝ้าระวัง/.test(v) ? '#fbefd6' : /^PASS/.test(v) ? '#e1f3e8' : null;
      if (colour) cell.setBackground(colour);
    });
    return { appended: true, row: row, id: WEBAPP.LOG_SHEET_ID, viewUrl: ss.getUrl() };
  } finally {
    lock.releaseLock();
  }
}
