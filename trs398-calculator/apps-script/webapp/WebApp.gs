/**
 * TRS-398 Output Calibration — Google Apps Script web app. This is the only file the project needs.
 * The page itself (index.html) is loaded from GitHub, so app updates arrive without re-pasting.
 *
 * Users sign in with their Google (Gmail) account before the page opens, and every report records who saved it.
 *   1. Create this project signed in as nattayee@gmail.com and run setup() once: it creates the Output Log
 *      in nattayee's Drive (copying the old log's rows) and shares it with EDITORS.
 *   2. Deploy → New deployment → Web app
 *      Execute as: "User accessing the web app"   Who has access: "Anyone with Google account"
 *   Each user approves the app once. Files stay owned by nattayee; users need edit access to the Log.
 */
var WEBAPP = {
  OWNER_EMAIL: 'nattayee@gmail.com',
  // Gmail accounts allowed to save reports. setup()/shareLog() give them edit access to the Log.
  // Leave empty to allow anyone who already has edit access to the Log.
  EDITORS: ['nattayee@gmail.com'],
  USER_HEADER: 'ผู้บันทึก (Gmail)',
  PAGE_URL: 'https://raw.githubusercontent.com/nattayee/nattayee/refs/heads/claude/brave-volta-pjvcd3/trs398-calculator/apps-script/webapp/index.html',
  MASTER_SHEET_ID: '1t8KCsJtuv3vVzqRT_uWblHEDWYARuB1KU5gqVUTpt4w',   // TG398 LPCH (master data, owned by nattayee)
  OLD_LOG_SHEET_ID: '1UpWd0zPjEDnKIuV1q6j5O4CDemNt0BbYkbFWMIudTL8',  // first Output Log (other account): rows are copied once
  LOG_NAME: 'TRS-398 Output Log (LPCH)',
  FOLDER_NAME: 'TRS-398 Output Reports',
  LOG_TAB: 'Log',
  ID_HEADER: 'Report ID',
  RESULT_HEADERS: ['ผล', 'ผลหลังปรับ'],
  TITLE: 'TRS-398 Output Calibration · Lampang Cancer Hospital',
  TIME_ZONE: 'Asia/Bangkok',   // GMT+7: dates and times in the Log are Thailand time
  CACHE_SECONDS: 600,
  LOG_HEADERS: [
    'Report ID', 'บันทึกเมื่อ', 'วันที่วัด', 'ชนิด QA', 'นักฟิสิกส์', 'ผู้บันทึก (Gmail)',
    'เครื่อง', 'พลังงาน', 'ชนิดลำรังสี', 'Setup', 'หัววัด', 'เครื่องวัดประจุ',
    'MU', 'ดัชนีคุณภาพ', 'TPR20,10 / R50', 'z_ref (g/cm²)', 'z_max (g/cm²)', 'N_D,w (cGy/nC)',
    'ที่มาของ k_Q', 'k_Q,Q0', 'k_Q,Qcross', 'T (°C)', 'P', 'หน่วย P',
    'M1 (nC)', '-M1 (nC)', 'M2 (nC)', 'V1 (V)', 'V2 (V)', 'k_TP',
    'k_pol', 'k_s', 'k_elec', 'k_vol', 'M_Q (nC)', 'TMR/PDD',
    'TMR/PDD(z_ref)', 'D_w(z_ref) (cGy/MU)', 'Output (cGy/MU)', 'Expected (cGy/MU)', '%Diff', 'ผล',
    'ปรับเครื่อง', 'T หลังปรับ (°C)', 'P หลังปรับ', 'M1 หลังปรับ (nC)', 'k_TP หลังปรับ', 'Output หลังปรับ (cGy/MU)',
    '%Diff หลังปรับ', 'ผลหลังปรับ', 'แหล่งข้อมูลหลัก', 'หมายเหตุ', 'หมายเหตุผู้วัด'
  ]
};

// ---------------------------------------------------------------- account

/** The signed-in Gmail of the person using the app (deployed as "User accessing the web app"). */
function account_() {
  try { return String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) { return ''; }
}
/** Every call from the page needs a signed-in Google account, and an allowed one when EDITORS is set. */
function requireUser_() {
  var me = account_();
  if (!me) throw new Error('กรุณาเข้าสู่ระบบด้วยบัญชี Gmail ก่อนใช้งาน');
  var allowed = WEBAPP.EDITORS.map(function (e) { return String(e).toLowerCase(); });
  if (allowed.length && allowed.indexOf(me) < 0) {
    throw new Error('บัญชี ' + me + ' ยังไม่ได้รับสิทธิ์ใช้งาน ติดต่อ ' + WEBAPP.OWNER_EMAIL + ' เพื่อเพิ่มใน EDITORS');
  }
  return me;
}
/** Creating and sharing the Output Log is only for nattayee, so it stays in nattayee's Drive. */
function requireOwner_() {
  var me = account_();
  if (me !== WEBAPP.OWNER_EMAIL) {
    throw new Error('ต้องรันด้วยบัญชี ' + WEBAPP.OWNER_EMAIL + ' (ตอนนี้คือ ' + (me || 'ไม่ทราบ') + ')');
  }
}

// ---------------------------------------------------------------- page

function doGet() {
  if (!account_()) {
    // Only reached when the deployment does not require sign-in: ask for a Google login first
    var back = ScriptApp.getService().getUrl();
    return HtmlService.createHtmlOutput(
      '<div style="font:16px/1.6 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px">' +
      '<h2>กรุณาเข้าสู่ระบบด้วย Gmail</h2>' +
      '<p>ต้องเข้าสู่ระบบด้วยบัญชี Google ก่อนใช้ TRS-398 Output Calibration เพื่อบันทึกชื่อผู้บันทึกในรายงาน</p>' +
      '<p><a target="_top" href="https://accounts.google.com/ServiceLogin?continue=' + encodeURIComponent(back) + '">เข้าสู่ระบบ Google</a></p>' +
      '<p style="color:#666;font-size:14px">ผู้ดูแล: Deploy เป็น Web app แบบ Execute as "User accessing the web app" และ Who has access "Anyone with Google account"</p></div>'
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
  if (id && ownerOf_(id) === WEBAPP.OWNER_EMAIL) {
    Logger.log('ใช้ Log ของ ' + WEBAPP.OWNER_EMAIL + ' อยู่แล้ว: ' + SpreadsheetApp.openById(id).getUrl());
    return SpreadsheetApp.openById(id).getUrl();
  }
  var folders = DriveApp.getFoldersByName(WEBAPP.FOLDER_NAME), folder = null;
  while (folders.hasNext()) { var f = folders.next(); if (f.getOwner() && f.getOwner().getEmail().toLowerCase() === WEBAPP.OWNER_EMAIL) { folder = f; break; } }
  if (!folder) folder = DriveApp.createFolder(WEBAPP.FOLDER_NAME);

  var ss = SpreadsheetApp.create(WEBAPP.LOG_NAME);
  ss.setSpreadsheetTimeZone(WEBAPP.TIME_ZONE);
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
  shareLog();
  Logger.log('สร้าง Log ใหม่ใน Drive ของ ' + WEBAPP.OWNER_EMAIL + ' (คัดลอก ' + (rows.length - 1) + ' แถว): ' + ss.getUrl());
  return ss.getUrl();
}

/** Run as nattayee after changing EDITORS: gives every listed Gmail edit access to the Log. */
function shareLog() {
  requireOwner_();
  var id = PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID');
  if (!id) throw new Error('ยังไม่มี Log ให้รัน setup ก่อน');
  var others = WEBAPP.EDITORS.filter(function (e) { return String(e).toLowerCase() !== WEBAPP.OWNER_EMAIL; });
  if (others.length) DriveApp.getFileById(id).addEditors(others);
  Logger.log('Log แชร์ให้แก้ไขได้: ' + (others.join(', ') || '(ไม่มีรายชื่อเพิ่ม)'));
}

function ownerOf_(fileId) {
  try { return DriveApp.getFileById(fileId).getOwner().getEmail().toLowerCase(); } catch (e) { return ''; }
}

/** The log the web app writes to: nattayee's own copy, created on first use if setup() was not run. */
function logId_() {
  var id = PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID');
  if (id) return id;
  if (account_() !== WEBAPP.OWNER_EMAIL) throw new Error('ยังไม่ได้ตั้งค่า Log: ให้ ' + WEBAPP.OWNER_EMAIL + ' รันฟังก์ชัน setup ก่อน');
  setup();
  return PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID');
}

// ---------------------------------------------------------------- calls from the page

/** Account and log in use, shown on the page. */
function apiInfo() {
  var me = requireUser_();
  var id = logId_();
  return { account: me, owner: WEBAPP.OWNER_EMAIL, logId: id, logUrl: 'https://docs.google.com/spreadsheets/d/' + id + '/edit', masterId: WEBAPP.MASTER_SHEET_ID };
}

/** Master Sheet as .xlsx (base64); any other id is answered with nattayee's Output Log. */
function apiExportXlsx(fileId) {
  requireUser_();
  var id = fileId === WEBAPP.MASTER_SHEET_ID ? WEBAPP.MASTER_SHEET_ID : logId_();
  var title = DriveApp.getFileById(id).getName();   // also grants the Drive scope used below
  var res = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() === 403 || res.getResponseCode() === 404) {
    throw new Error('บัญชี ' + account_() + ' ไม่มีสิทธิ์เปิดไฟล์นี้ ขอให้ ' + WEBAPP.OWNER_EMAIL + ' แชร์ Log ให้ (รัน shareLog)');
  }
  if (res.getResponseCode() !== 200) throw new Error('ส่งออก .xlsx ไม่สำเร็จ (HTTP ' + res.getResponseCode() + ')');
  return { content: Utilities.base64Encode(res.getBlob().getBytes()), title: title, id: id };
}

/** Appends one report (two-row CSV: headers + values) to the Log tab by header name; skips known Report IDs. */
function apiAppendReport(csvText) {
  var me = requireUser_();
  var rows = Utilities.parseCsv(String(csvText || ''));
  if (rows.length < 2) throw new Error('รายงานว่างเปล่า');
  var unquote = function (v) { return typeof v === 'string' && v.charAt(0) === "'" ? v.slice(1) : v; };
  var headers = rows[0].map(function (h) { return String(unquote(h)).trim(); });
  var values = rows[1].map(unquote);
  if (headers[0] !== WEBAPP.ID_HEADER) throw new Error('รูปแบบรายงานไม่ถูกต้อง');
  // The saver's Gmail comes from the Google sign-in, never from the page
  var u = headers.indexOf(WEBAPP.USER_HEADER);
  if (u < 0) { headers.push(WEBAPP.USER_HEADER); values.push(me); } else values[u] = me;

  var logId = logId_();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss;
    try { ss = SpreadsheetApp.openById(logId); }
    catch (e) { throw new Error('บัญชี ' + me + ' ไม่มีสิทธิ์แก้ไข Log ขอให้ ' + WEBAPP.OWNER_EMAIL + ' เพิ่มใน EDITORS แล้วรัน shareLog'); }
    if (ss.getSpreadsheetTimeZone() !== WEBAPP.TIME_ZONE) {
      try { ss.setSpreadsheetTimeZone(WEBAPP.TIME_ZONE); } catch (e) { /* editors without that right keep the sheet's zone */ }
    }
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
