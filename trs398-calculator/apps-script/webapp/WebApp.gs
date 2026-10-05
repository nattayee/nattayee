/**
 * TRS-398 Output Calibration — Google Apps Script web app. This is the only file the project needs.
 * The page itself (index.html) is loaded from GitHub, so app updates arrive without re-pasting.
 *
 * Everything runs as nattayee@gmail.com: create this project while signed in as nattayee,
 * run setup() once, then Deploy → New deployment → Web app (Execute as: Me).
 * The Output Log lives in nattayee's own Drive; setup() creates it and copies the old log's rows.
 */
var WEBAPP = {
  OWNER_EMAIL: 'nattayee@gmail.com',
  PAGE_URL: 'https://raw.githubusercontent.com/nattayee/nattayee/refs/heads/claude/brave-volta-pjvcd3/trs398-calculator/apps-script/webapp/index.html',
  MASTER_SHEET_ID: '1t8KCsJtuv3vVzqRT_uWblHEDWYARuB1KU5gqVUTpt4w',   // TG398 LPCH (master data, owned by nattayee)
  OLD_LOG_SHEET_ID: '1UpWd0zPjEDnKIuV1q6j5O4CDemNt0BbYkbFWMIudTL8',  // first Output Log (other account): rows are copied once
  LOG_NAME: 'TRS-398 Output Log (LPCH)',
  FOLDER_NAME: 'TRS-398 Output Reports',
  LOG_TAB: 'Log',
  ID_HEADER: 'Report ID',
  RESULT_HEADERS: ['ผล', 'ผลหลังปรับ'],
  TITLE: 'TRS-398 Output Calibration · Lampang Cancer Hospital',
  CACHE_SECONDS: 600,
  LOG_HEADERS: [
    'Report ID', 'บันทึกเมื่อ', 'วันที่วัด', 'ชนิด QA', 'นักฟิสิกส์', 'เครื่อง',
    'พลังงาน', 'ชนิดลำรังสี', 'Setup', 'หัววัด', 'เครื่องวัดประจุ', 'MU',
    'ดัชนีคุณภาพ', 'TPR20,10 / R50', 'z_ref (g/cm²)', 'z_max (g/cm²)', 'N_D,w (cGy/nC)', 'ที่มาของ k_Q',
    'k_Q,Q0', 'k_Q,Qcross', 'T (°C)', 'P', 'หน่วย P', 'M1 (nC)',
    '-M1 (nC)', 'M2 (nC)', 'V1 (V)', 'V2 (V)', 'k_TP', 'k_pol',
    'k_s', 'k_elec', 'k_vol', 'M_Q (nC)', 'TMR/PDD', 'TMR/PDD(z_ref)',
    'D_w(z_ref) (cGy/MU)', 'Output (cGy/MU)', 'Expected (cGy/MU)', '%Diff', 'ผล', 'ปรับเครื่อง',
    'T หลังปรับ (°C)', 'P หลังปรับ', 'M1 หลังปรับ (nC)', 'k_TP หลังปรับ', 'Output หลังปรับ (cGy/MU)', '%Diff หลังปรับ',
    'ผลหลังปรับ', 'แหล่งข้อมูลหลัก', 'หมายเหตุ', 'หมายเหตุผู้วัด'
  ]
};

// ---------------------------------------------------------------- account

function account_() {
  try { return String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (e) { return ''; }
}
/** Stops with a clear message when the script runs under any account other than nattayee. */
function requireOwner_() {
  var me = account_();
  if (me !== WEBAPP.OWNER_EMAIL) {
    throw new Error('สคริปต์กำลังทำงานด้วยบัญชี ' + (me || '(ไม่ทราบ)') + ' ต้องใช้ ' + WEBAPP.OWNER_EMAIL +
      ' : เปิดโปรเจกต์นี้ด้วยบัญชี ' + WEBAPP.OWNER_EMAIL + ' แล้ว Deploy ใหม่ (Execute as: Me)');
  }
}

// ---------------------------------------------------------------- page

function doGet() {
  var me = account_();
  if (me !== WEBAPP.OWNER_EMAIL) {
    return HtmlService.createHtmlOutput(
      '<div style="font:16px/1.6 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px">' +
      '<h2>เว็บแอปนี้ถูก Deploy ด้วยบัญชีอื่น</h2>' +
      '<p>ตอนนี้ทำงานด้วยบัญชี <b>' + (me || '(ไม่ทราบ)') + '</b> แต่ต้องใช้ <b>' + WEBAPP.OWNER_EMAIL + '</b> ในการดึงข้อมูลและบันทึกรายงาน</p>' +
      '<ol><li>ลงชื่อเข้า script.google.com ด้วย ' + WEBAPP.OWNER_EMAIL + '</li>' +
      '<li>สร้างโปรเจกต์ใหม่ วางโค้ด WebApp.gs แล้วรันฟังก์ชัน <code>setup</code></li>' +
      '<li>Deploy → New deployment → Web app → Execute as: <b>Me</b></li></ol></div>'
    ).setTitle(WEBAPP.TITLE);
  }
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

// ---------------------------------------------------------------- Output Log in nattayee's Drive

/**
 * Run once from the editor (as nattayee). Creates "TRS-398 Output Reports / TRS-398 Output Log (LPCH)"
 * in nattayee's Drive, copies every row of the old log, and remembers the new log for the web app.
 * Running it again only reports the log already in use.
 */
function setup() {
  requireOwner_();
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('LOG_SHEET_ID');
  if (id && ownedByMe_(id)) {
    Logger.log('ใช้ Log ของ ' + WEBAPP.OWNER_EMAIL + ' อยู่แล้ว: ' + SpreadsheetApp.openById(id).getUrl());
    return SpreadsheetApp.openById(id).getUrl();
  }
  var folders = DriveApp.getFoldersByName(WEBAPP.FOLDER_NAME), folder = null;
  while (folders.hasNext()) { var f = folders.next(); if (f.getOwner() && f.getOwner().getEmail().toLowerCase() === WEBAPP.OWNER_EMAIL) { folder = f; break; } }
  if (!folder) folder = DriveApp.createFolder(WEBAPP.FOLDER_NAME);

  var ss = SpreadsheetApp.create(WEBAPP.LOG_NAME);
  DriveApp.getFileById(ss.getId()).moveTo(folder);
  var sheet = ss.getSheets()[0].setName(WEBAPP.LOG_TAB);

  var rows = null;
  try {   // the old log is shared with nattayee, so its rows can be read once
    var old = SpreadsheetApp.openById(WEBAPP.OLD_LOG_SHEET_ID).getSheetByName(WEBAPP.LOG_TAB);
    if (old && old.getLastRow() >= 1) rows = old.getDataRange().getValues();
  } catch (e) { rows = null; }
  if (!rows || String(rows[0][0]).trim() !== WEBAPP.ID_HEADER) rows = [WEBAPP.LOG_HEADERS];
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sheet.getRange(1, 1, 1, rows[0].length).setFontWeight('bold').setFontColor('#ffffff').setBackground('#1d5bd6').setWrap(true);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);

  props.setProperty('LOG_SHEET_ID', ss.getId());
  Logger.log('สร้าง Log ใหม่ใน Drive ของ ' + WEBAPP.OWNER_EMAIL + ' (คัดลอก ' + (rows.length - 1) + ' แถว): ' + ss.getUrl());
  return ss.getUrl();
}

function ownedByMe_(fileId) {
  try { return DriveApp.getFileById(fileId).getOwner().getEmail().toLowerCase() === WEBAPP.OWNER_EMAIL; } catch (e) { return false; }
}

/** The log the web app writes to: nattayee's own copy, created on first use if setup() was not run. */
function logId_() {
  var id = PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID');
  if (id && ownedByMe_(id)) return id;
  setup();
  return PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID');
}

// ---------------------------------------------------------------- calls from the page

/** Account and log in use, shown on the page. */
function apiInfo() {
  requireOwner_();
  var id = logId_();
  return { account: account_(), logId: id, logUrl: SpreadsheetApp.openById(id).getUrl(), masterId: WEBAPP.MASTER_SHEET_ID };
}

/** Master Sheet as .xlsx (base64); any other id is answered with nattayee's Output Log. */
function apiExportXlsx(fileId) {
  requireOwner_();
  var id = fileId === WEBAPP.MASTER_SHEET_ID ? WEBAPP.MASTER_SHEET_ID : logId_();
  var title = DriveApp.getFileById(id).getName();   // also grants the Drive scope used below
  var res = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('ส่งออก .xlsx ไม่สำเร็จ (HTTP ' + res.getResponseCode() + ')');
  return { content: Utilities.base64Encode(res.getBlob().getBytes()), title: title, id: id };
}

/** Appends one report (two-row CSV: headers + values) to the Log tab by header name; skips known Report IDs. */
function apiAppendReport(csvText) {
  requireOwner_();
  var rows = Utilities.parseCsv(String(csvText || ''));
  if (rows.length < 2) throw new Error('รายงานว่างเปล่า');
  var unquote = function (v) { return typeof v === 'string' && v.charAt(0) === "'" ? v.slice(1) : v; };
  var headers = rows[0].map(function (h) { return String(unquote(h)).trim(); });
  var values = rows[1].map(unquote);
  if (headers[0] !== WEBAPP.ID_HEADER) throw new Error('รูปแบบรายงานไม่ถูกต้อง');

  var logId = logId_();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.openById(logId);
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
        if (String(ids[i][0]) === id) return { appended: false, duplicate: true, id: logId, viewUrl: ss.getUrl() };
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
    return { appended: true, row: row, id: logId, viewUrl: ss.getUrl() };
  } finally {
    lock.releaseLock();
  }
}
