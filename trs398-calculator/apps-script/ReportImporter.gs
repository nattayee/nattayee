/**
 * TRS-398 Output Log (LPCH) — imports reports sent by the TRS-398 Output Calibration web app.
 *
 * The app saves each report as a small Google Sheet (row 1 = headers, row 2 = values) in the
 * Inbox folder. importReports() appends each one to the "Log" tab by matching header names,
 * skips Report IDs already in the log, and moves the file to the Imported folder.
 *
 * Install once: Extensions → Apps Script, paste this file, save, run setup() and allow access.
 */

var CONFIG = {
  INBOX_FOLDER_ID: '18t0FBIWRVNzcZJca09wQXg6uwlQmBkw-',
  IMPORTED_FOLDER_ID: '1lHmKTj5QbAh12c5CRPkQ9RxYutb26h2E',
  LOG_TAB: 'Log',
  ID_HEADER: 'Report ID',
  RESULT_HEADERS: ['ผล', 'ผลหลังปรับ'],
  EVERY_MINUTES: 5
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('TRS-398')
    .addItem('นำเข้ารายงานตอนนี้', 'importReportsFromMenu')
    .addItem('ตั้งค่าการนำเข้าอัตโนมัติ', 'setup')
    .addToUi();
}

/** Run once: remembers this spreadsheet, installs the 5-minute trigger, imports what is waiting. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('LOG_SPREADSHEET_ID', ss.getId());
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'importReports') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('importReports').timeBased().everyMinutes(CONFIG.EVERY_MINUTES).create();
  var n = importReports();
  ss.toast('ตั้งค่าแล้ว นำเข้าอัตโนมัติทุก ' + CONFIG.EVERY_MINUTES + ' นาที (นำเข้าครั้งนี้ ' + n + ' รายงาน)', 'TRS-398', 8);
}

function importReportsFromMenu() {
  var n = importReports();
  SpreadsheetApp.getActiveSpreadsheet().toast('นำเข้า ' + n + ' รายงาน', 'TRS-398', 5);
}

function logSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('LOG_SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

/** Reads one inbox file into [headers, values]; null when it is not a report. */
function readReport_(file) {
  var rows;
  var mime = file.getMimeType();
  if (mime === MimeType.GOOGLE_SHEETS) {
    rows = SpreadsheetApp.openById(file.getId()).getSheets()[0].getDataRange().getValues();
  } else if (mime === MimeType.CSV || mime === 'text/plain') {
    rows = Utilities.parseCsv(file.getBlob().getDataAsString('UTF-8'));
  } else {
    return null;
  }
  if (!rows || rows.length < 2) return null;
  // The app writes text such as "-M1 (nC)" as "'-M1 (nC)" so Sheets keeps it as text; drop that marker
  var unquote = function (v) { return typeof v === 'string' && v.charAt(0) === "'" ? v.slice(1) : v; };
  var headers = rows[0].map(function (h) { return String(unquote(h)).trim(); });
  if (headers[0] !== CONFIG.ID_HEADER) return null;
  return { headers: headers, values: rows[1].map(unquote) };
}

/** Imports every report waiting in the Inbox. Returns how many rows were appended. */
function importReports() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return 0;
  try {
    var sheet = logSpreadsheet_().getSheetByName(CONFIG.LOG_TAB);
    if (!sheet) throw new Error('ไม่พบแท็บ "' + CONFIG.LOG_TAB + '"');
    var lastCol = Math.max(sheet.getLastColumn(), 1);
    var logHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
    var col = {};
    logHeaders.forEach(function (h, i) { if (h) col[h] = i; });

    var idCol = col[CONFIG.ID_HEADER];
    var seen = {};
    var lastRow = sheet.getLastRow();
    if (idCol != null && lastRow > 1) {
      sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues().forEach(function (r) { if (r[0]) seen[String(r[0])] = true; });
    }

    var inbox = DriveApp.getFolderById(CONFIG.INBOX_FOLDER_ID);
    var imported = DriveApp.getFolderById(CONFIG.IMPORTED_FOLDER_ID);
    var files = inbox.getFiles();
    var count = 0;
    while (files.hasNext()) {
      var file = files.next();
      var rep = readReport_(file);
      if (!rep) continue;
      var id = String(rep.values[0]);
      if (!seen[id]) {
        // Headers the log does not have yet are added at the end, so no value is dropped
        rep.headers.forEach(function (h) {
          if (h && col[h] == null) {
            logHeaders.push(h);
            col[h] = logHeaders.length - 1;
            sheet.getRange(1, logHeaders.length).setValue(h).setFontWeight('bold');
          }
        });
        var out = logHeaders.map(function () { return ''; });
        rep.headers.forEach(function (h, i) { if (h) out[col[h]] = rep.values[i]; });
        sheet.appendRow(out);
        markResults_(sheet, sheet.getLastRow(), col);
        seen[id] = true;
        count++;
      }
      file.moveTo(imported);
    }
    return count;
  } finally {
    lock.releaseLock();
  }
}

/** Colours the result cells of one row: green PASS, amber watch level, red FAIL. */
function markResults_(sheet, row, col) {
  CONFIG.RESULT_HEADERS.forEach(function (h) {
    if (col[h] == null) return;
    var cell = sheet.getRange(row, col[h] + 1);
    var v = String(cell.getValue());
    if (!v) return;
    var colour = /^FAIL/.test(v) ? '#fbe3e0' : /เฝ้าระวัง/.test(v) ? '#fbefd6' : /^PASS/.test(v) ? '#e1f3e8' : null;
    if (colour) cell.setBackground(colour);
  });
}
