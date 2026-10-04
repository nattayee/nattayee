/**
 * ระบบเช็กอินเจ้าหน้าที่แต่ละโซน (Google Apps Script Web App)
 *
 * อ่าน/เขียนข้อมูลจาก Google Sheet "รายชื่อเจ้าหน้าที่แต่ละโซน"
 * โครงสร้างแต่ละแท็บ (โซน):
 *   แถว 1      : ชื่อหน่วยงานแรก (A1:F1 merge) + หัวคอลัมน์ G1 เบอร์โทร, H1 วันเกิด
 *   แถว 2      : หัวตาราง  A อยู่ | B ลา | C ไม่ทราบ | D สถานะ | E ชื่อ-สกุล | F ตำแหน่ง
 *   แถว 3 ขึ้นไป: แถวชื่อหน่วยงาน (มีค่าในคอลัมน์ A, คอลัมน์ E ว่าง)
 *               หรือแถวเจ้าหน้าที่ (D สถานะ, E ชื่อ, F ตำแหน่ง, G เบอร์โทร, H วันเกิด)
 */

var SPREADSHEET_ID = '1-6yW-yDd3l6LDmkJUliJyPGggXpLm3edwrXDXZ7LxFM';

var STATUSES = ['อยู่', 'ลา', 'ไม่ทราบ'];
var DEFAULT_STATUS = 'ไม่ทราบ';

var COL_STATUS = 4;   // D
var COL_NAME = 5;     // E
var COL_PHONE = 7;    // G
var COL_BIRTHDAY = 8; // H
// คอลัมน์บันทึกเวลาที่อัปเดตสถานะล่าสุด (I) ตั้งเป็น 0 หากไม่ต้องการบันทึกเวลา
var COL_UPDATED = 9;  // I
var UPDATED_HEADER = 'อัปเดตล่าสุด';
var UPDATED_FORMAT = 'dd/mm/yyyy hh:mm:ss';

var FIRST_DATA_ROW = 3;

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('ระบบเช็กอินเจ้าหน้าที่')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/** แท็บที่เป็นโซน = แท็บที่ D2 เป็น "สถานะ" และ E2 เป็น "ชื่อ-สกุล" */
function isZoneSheet_(sheet) {
  var header = sheet.getRange(2, COL_STATUS, 1, 2).getDisplayValues()[0];
  return clean_(header[0]) === 'สถานะ' && clean_(header[1]) === 'ชื่อ-สกุล';
}

function clean_(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

/** ชื่อเจ้าหน้าที่ที่ขึ้นต้นด้วย "-" เป็นหมายเหตุ เช่น "- เช็ครายชื่อที่โซน 2 -" */
function isNote_(name) {
  return /^[-–]/.test(name);
}

/** อ่านข้อมูลทุกโซนส่งให้หน้าเว็บ */
function getData() {
  var ss = getSpreadsheet_();
  var zones = [];

  ss.getSheets().forEach(function (sheet) {
    if (!isZoneSheet_(sheet)) return;

    var lastRow = sheet.getLastRow();
    var zone = { sheet: sheet.getName(), name: clean_(sheet.getName()), departments: [] };
    if (lastRow < 1) return;

    var width = COL_UPDATED > 0 ? COL_UPDATED : COL_BIRTHDAY;
    var values = sheet.getRange(1, 1, lastRow, width).getDisplayValues();

    // แถว 1 คือหน่วยงานแรก
    var current = { name: clean_(values[0][0]) || zone.name, people: [], notes: [] };
    zone.departments.push(current);

    for (var i = FIRST_DATA_ROW - 1; i < values.length; i++) {
      var row = values[i];
      var name = clean_(row[COL_NAME - 1]);
      var deptName = clean_(row[0]);

      if (!name) {
        if (deptName) {
          current = { name: deptName, people: [], notes: [] };
          zone.departments.push(current);
        }
        continue;
      }
      if (isNote_(name)) {
        current.notes.push(name.replace(/^[-–\s]+|[-–\s]+$/g, ''));
        continue;
      }

      var status = clean_(row[COL_STATUS - 1]);
      current.people.push({
        row: i + 1,
        name: name,
        position: clean_(row[5]),
        status: STATUSES.indexOf(status) >= 0 ? status : DEFAULT_STATUS,
        phone: clean_(row[COL_PHONE - 1]),
        birthday: clean_(row[COL_BIRTHDAY - 1]),
        updated: COL_UPDATED > 0 ? clean_(row[COL_UPDATED - 1]) : ''
      });
    }

    zone.departments = zone.departments.filter(function (d) {
      return d.people.length || d.notes.length;
    });
    zones.push(zone);
  });

  return {
    title: ss.getName(),
    statuses: STATUSES,
    zones: zones,
    fetchedAt: now_()
  };
}

/**
 * บันทึกสถานะของเจ้าหน้าที่ 1 คน
 * ตรวจสอบชื่อในแถวก่อนเขียน หากแถวถูกเลื่อน (มีการแทรก/ลบแถว) จะค้นหาชื่อใหม่ในแท็บเดิม
 */
function setStatus(sheetName, row, name, status) {
  if (STATUSES.indexOf(status) < 0) throw new Error('สถานะไม่ถูกต้อง: ' + status);

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = getSpreadsheet_().getSheetByName(sheetName);
    if (!sheet) throw new Error('ไม่พบแท็บ ' + sheetName);

    var target = findRow_(sheet, Number(row), clean_(name));
    if (!target) throw new Error('ไม่พบรายชื่อ "' + name + '" ในแท็บ ' + sheetName + ' กรุณารีเฟรชข้อมูล');

    sheet.getRange(target, COL_STATUS).setValue(status);
    if (COL_UPDATED > 0) {
      ensureUpdatedHeader_(sheet);
      sheet.getRange(target, COL_UPDATED).setValue(new Date()).setNumberFormat(UPDATED_FORMAT);
    }
    SpreadsheetApp.flush();
    return { row: target, status: status, updated: now_() };
  } finally {
    lock.releaseLock();
  }
}

/** รีเซ็ตสถานะทุกคนในโซน (หรือทุกโซนหาก sheetName ว่าง) กลับเป็น "ไม่ทราบ" */
function resetStatuses(sheetName) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = getSpreadsheet_();
    var sheets = sheetName ? [ss.getSheetByName(sheetName)] : ss.getSheets();
    var count = 0;

    sheets.forEach(function (sheet) {
      if (!sheet || !isZoneSheet_(sheet)) return;
      var lastRow = sheet.getLastRow();
      if (lastRow < FIRST_DATA_ROW) return;

      var n = lastRow - FIRST_DATA_ROW + 1;
      var names = sheet.getRange(FIRST_DATA_ROW, COL_NAME, n, 1).getDisplayValues();
      var statusRange = sheet.getRange(FIRST_DATA_ROW, COL_STATUS, n, 1);
      var statuses = statusRange.getValues();
      var updatedRange = COL_UPDATED > 0 ? sheet.getRange(FIRST_DATA_ROW, COL_UPDATED, n, 1) : null;
      var updated = updatedRange ? updatedRange.getValues() : null;

      for (var i = 0; i < n; i++) {
        var name = clean_(names[i][0]);
        if (!name || isNote_(name)) continue;
        statuses[i][0] = DEFAULT_STATUS;
        if (updated) updated[i][0] = '';
        count++;
      }
      statusRange.setValues(statuses);
      if (updatedRange) updatedRange.setValues(updated);
    });

    SpreadsheetApp.flush();
    return { count: count };
  } finally {
    lock.releaseLock();
  }
}

function findRow_(sheet, row, name) {
  var lastRow = sheet.getLastRow();
  if (row >= FIRST_DATA_ROW && row <= lastRow &&
      clean_(sheet.getRange(row, COL_NAME).getDisplayValue()) === name) {
    return row;
  }
  if (lastRow < FIRST_DATA_ROW) return 0;
  var names = sheet.getRange(FIRST_DATA_ROW, COL_NAME, lastRow - FIRST_DATA_ROW + 1, 1).getDisplayValues();
  for (var i = 0; i < names.length; i++) {
    if (clean_(names[i][0]) === name) return i + FIRST_DATA_ROW;
  }
  return 0;
}

function ensureUpdatedHeader_(sheet) {
  var cell = sheet.getRange(1, COL_UPDATED);
  if (!cell.getDisplayValue()) cell.setValue(UPDATED_HEADER);
}

function now_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
}
