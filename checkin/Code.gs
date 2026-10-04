/**
 * ระบบเช็กอินเจ้าหน้าที่แต่ละโซน (Google Apps Script Web App)
 *
 * อ่าน/เขียนข้อมูลจาก Google Sheet "รายชื่อเจ้าหน้าที่แต่ละโซน"
 * โครงสร้างแต่ละแท็บ (โซน):
 *   แถว 1      : ชื่อหน่วยงานแรก (A1:F1 merge) + หัวคอลัมน์ G1 เบอร์โทร, H1 วันเกิด
 *   แถว 2      : หัวตาราง  D สถานะ | E ชื่อ-สกุล | F ตำแหน่ง
 *   แถว 3 ขึ้นไป: แถวชื่อหน่วยงาน (มีค่าในคอลัมน์ A, คอลัมน์ E ว่าง)
 *               หรือแถวเจ้าหน้าที่ (D สถานะ, E ชื่อ, F ตำแหน่ง, G เบอร์โทร, H วันเกิด,
 *               I อัปเดตล่าสุด, J หมายเหตุ)
 *
 * หน้าเว็บ (เลือกด้วยพารามิเตอร์ page):
 *   (ค่าเริ่มต้น)  Checkin.html  เจ้าหน้าที่สแกน QR Code แล้วเช็กอินเอง  ?z=<รหัสแท็บ> เลือกโซนให้อัตโนมัติ
 *   ?page=admin  Admin.html    แดชบอร์ดผู้ดูแล ดู/แก้สถานะทุกคน (ต้องใช้ ADMIN_PIN)
 *   ?page=qr     Qr.html       สร้างและพิมพ์ QR Code ของแต่ละโซน
 */

var SPREADSHEET_ID = '1-6yW-yDd3l6LDmkJUliJyPGggXpLm3edwrXDXZ7LxFM';

// รหัสผู้ดูแลสำหรับหน้า ?page=admin (มีเบอร์โทร/วันเกิดของทุกคน)
// ควรตั้งเสมอ เพราะลิงก์เว็บแอปถูกแจกผ่าน QR Code  ปล่อยว่าง = ไม่ต้องใช้รหัส
var ADMIN_PIN = '';

// สถานะที่เลือกได้ ("ไม่ทราบ" = ยังไม่เช็กอิน)
var STATUSES = ['อยู่', 'ไม่อยู่', 'บาดเจ็บ', 'ไม่ทราบ'];
var DEFAULT_STATUS = 'ไม่ทราบ';
// สถานะที่เจ้าหน้าที่เลือกได้เองตอนสแกน QR Code
var CHECKIN_STATUSES = ['อยู่', 'ไม่อยู่', 'บาดเจ็บ'];
// ค่าสถานะเดิมในชีตที่แปลงเป็นสถานะใหม่
var LEGACY_STATUS = { 'ลา': 'ไม่อยู่' };

var COL_STATUS = 4;   // D
var COL_NAME = 5;     // E
var COL_POSITION = 6; // F
var COL_PHONE = 7;    // G
var COL_BIRTHDAY = 8; // H
var COL_UPDATED = 9;  // I  เวลาที่บันทึกล่าสุด
var COL_NOTE = 10;    // J  หมายเหตุ เช่น อาการบาดเจ็บ
var LAST_COL = COL_NOTE;

var HEADERS = {};
HEADERS[COL_PHONE] = 'เบอร์โทร';
HEADERS[COL_BIRTHDAY] = 'วันเกิด';
HEADERS[COL_UPDATED] = 'อัปเดตล่าสุด';
HEADERS[COL_NOTE] = 'หมายเหตุ';

var UPDATED_FORMAT = 'dd/mm/yyyy hh:mm:ss';
var BIRTHDAY_FORMAT = 'dd/mm/yyyy';
var FIRST_DATA_ROW = 3;
var NOTE_MAX_LENGTH = 300;

var PAGES = {
  checkin: { file: 'Checkin', title: 'เช็กอินเจ้าหน้าที่' },
  admin: { file: 'Admin', title: 'แดชบอร์ดเช็กอินเจ้าหน้าที่' },
  qr: { file: 'Qr', title: 'QR Code เช็กอินแต่ละโซน' }
};

function doGet(e) {
  var key = e && e.parameter && e.parameter.page;
  var page = PAGES[key] || PAGES.checkin;
  return HtmlService.createHtmlOutputFromFile(page.file)
    .setTitle(page.title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function appUrl_() {
  return ScriptApp.getService().getUrl() || '';
}

function requireAdmin_(pin) {
  if (ADMIN_PIN && String(pin || '') !== String(ADMIN_PIN)) {
    throw new Error('AUTH: รหัสผู้ดูแลไม่ถูกต้อง');
  }
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

function normalizeStatus_(value) {
  var s = clean_(value);
  if (LEGACY_STATUS[s]) s = LEGACY_STATUS[s];
  return STATUSES.indexOf(s) >= 0 ? s : DEFAULT_STATUS;
}

/** อ่านข้อมูลทุกโซน (หน้าผู้ดูแล) */
function getData(pin) {
  requireAdmin_(pin);
  var ss = getSpreadsheet_();
  return {
    title: ss.getName(),
    statuses: STATUSES,
    zones: readZones_(ss),
    url: appUrl_(),
    pinSet: !!ADMIN_PIN,
    fetchedAt: now_()
  };
}

/**
 * รายชื่อสำหรับหน้าเช็กอินด้วยตนเอง (เปิดให้ทุกคนที่สแกน QR)
 * ไม่ส่งเบอร์โทร วันเกิด หรือหมายเหตุ บอกเพียงว่ามีข้อมูลแล้วหรือยัง
 */
function getRoster() {
  var ss = getSpreadsheet_();
  var zones = readZones_(ss).map(function (z) {
    return {
      id: z.id,
      sheet: z.sheet,
      name: z.name,
      departments: z.departments.map(function (d) {
        return {
          name: d.name,
          notes: d.notes,
          people: d.people.map(function (p) {
            return {
              row: p.row,
              name: p.name,
              position: p.position,
              checkedIn: p.status !== DEFAULT_STATUS,
              hasPhone: !!p.phone,
              hasBirthday: !!p.birthday
            };
          })
        };
      })
    };
  });
  return { title: ss.getName(), statuses: CHECKIN_STATUSES, zones: zones };
}

/** ข้อมูลสำหรับหน้าพิมพ์ QR Code (ชื่อโซนและลิงก์ ไม่มีข้อมูลส่วนตัว) */
function getQrInfo() {
  var ss = getSpreadsheet_();
  return {
    title: ss.getName(),
    url: appUrl_(),
    zones: readZones_(ss).map(function (z) {
      var count = 0;
      z.departments.forEach(function (d) { count += d.people.length; });
      return { id: z.id, sheet: z.sheet, name: z.name, count: count };
    })
  };
}

function readZones_(ss) {
  var tz = ss.getSpreadsheetTimeZone();
  var zones = [];

  ss.getSheets().forEach(function (sheet) {
    if (!isZoneSheet_(sheet)) return;

    var zone = { id: sheet.getSheetId(), sheet: sheet.getName(), name: clean_(sheet.getName()), departments: [] };
    var width = Math.min(LAST_COL, sheet.getMaxColumns());
    var range = sheet.getRange(1, 1, sheet.getLastRow(), width);
    var display = padRows_(range.getDisplayValues());
    var raw = padRows_(range.getValues());

    // แถว 1 คือหน่วยงานแรก
    var current = { name: clean_(display[0][0]) || zone.name, people: [], notes: [] };
    zone.departments.push(current);

    for (var i = FIRST_DATA_ROW - 1; i < display.length; i++) {
      var row = display[i];
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

      current.people.push({
        row: i + 1,
        name: name,
        position: clean_(row[COL_POSITION - 1]),
        status: normalizeStatus_(row[COL_STATUS - 1]),
        phone: clean_(row[COL_PHONE - 1]),
        birthday: toIsoDate_(raw[i][COL_BIRTHDAY - 1], tz),
        updated: clean_(row[COL_UPDATED - 1]),
        note: clean_(row[COL_NOTE - 1])
      });
    }

    zone.departments = zone.departments.filter(function (d) {
      return d.people.length || d.notes.length;
    });
    zones.push(zone);
  });
  return zones;
}

/**
 * เจ้าหน้าที่เช็กอินด้วยตนเอง (สแกน QR Code)
 * data: { status, phone, birthday, note }  ต้องเลือกสถานะ และต้องกรอกเบอร์โทร/วันเกิด
 * หากยังไม่มีในชีต (ถ้ามีแล้วเว้นว่างไว้ได้ ข้อมูลเดิมจะไม่ถูกลบ)
 */
function selfCheckin(sheetName, row, name, data) {
  data = data || {};
  if (CHECKIN_STATUSES.indexOf(data.status) < 0) throw new Error('กรุณาเลือกสถานะ');
  var input = { status: data.status, note: data.note || '' };
  if (clean_(data.phone)) input.phone = data.phone;
  if (clean_(data.birthday)) input.birthday = data.birthday;

  var res = writeCheckin_(sheetName, row, name, input, function (sheet, target) {
    var current = sheet.getRange(target, COL_PHONE, 1, 2).getDisplayValues()[0];
    if (!('phone' in input) && !clean_(current[0])) throw new Error('กรุณากรอกเบอร์โทร');
    if (!('birthday' in input) && !clean_(current[1])) throw new Error('กรุณาเลือกวันเกิด');
  });
  return { name: clean_(name), status: res.status, updated: res.updated };
}

/**
 * บันทึกการเช็กอินจากหน้าผู้ดูแล
 * data: { status, phone, birthday (yyyy-mm-dd ค.ศ.), note } ส่งเฉพาะช่องที่ต้องการบันทึก
 */
function saveCheckin(pin, sheetName, row, name, data) {
  requireAdmin_(pin);
  return writeCheckin_(sheetName, row, name, data || {});
}

/**
 * เขียนข้อมูลเช็กอินลงชีต
 * ตรวจสอบชื่อในแถวก่อนเขียน หากแถวถูกเลื่อน (มีการแทรก/ลบแถว) จะค้นหาชื่อใหม่ในแท็บเดิม
 */
function writeCheckin_(sheetName, row, name, data, precheck) {
  var values = validateCheckin_(data);

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error('ไม่พบแท็บ ' + sheetName);

    var target = findRow_(sheet, Number(row), clean_(name));
    if (!target) throw new Error('ไม่พบรายชื่อ "' + name + '" ในแท็บ ' + sheetName + ' กรุณารีเฟรชข้อมูล');
    ensureColumns_(sheet);
    if (precheck) precheck(sheet, target);

    if ('status' in values) {
      ensureStatusValidation_(sheet, target);
      sheet.getRange(target, COL_STATUS).setValue(values.status);
    }
    if ('phone' in values) {
      ensureHeader_(sheet, COL_PHONE);
      sheet.getRange(target, COL_PHONE).setNumberFormat('@').setValue(values.phone);
    }
    if ('birthday' in values) {
      ensureHeader_(sheet, COL_BIRTHDAY);
      var cell = sheet.getRange(target, COL_BIRTHDAY);
      if (values.birthday) cell.setValue(values.birthday).setNumberFormat(BIRTHDAY_FORMAT);
      else cell.clearContent();
    }
    if ('note' in values) {
      ensureHeader_(sheet, COL_NOTE);
      sheet.getRange(target, COL_NOTE).setValue(values.note);
    }
    ensureHeader_(sheet, COL_UPDATED);
    sheet.getRange(target, COL_UPDATED).setValue(new Date()).setNumberFormat(UPDATED_FORMAT);
    SpreadsheetApp.flush();

    var saved = sheet.getRange(target, 1, 1, LAST_COL);
    var display = saved.getDisplayValues()[0];
    var raw = saved.getValues()[0];
    return {
      row: target,
      status: normalizeStatus_(display[COL_STATUS - 1]),
      phone: clean_(display[COL_PHONE - 1]),
      birthday: toIsoDate_(raw[COL_BIRTHDAY - 1], ss.getSpreadsheetTimeZone()),
      note: clean_(display[COL_NOTE - 1]),
      updated: clean_(display[COL_UPDATED - 1]) || now_()
    };
  } finally {
    lock.releaseLock();
  }
}

/** ตรวจสอบและแปลงข้อมูลจากฟอร์ม คืนเฉพาะช่องที่ส่งมา */
function validateCheckin_(data) {
  var out = {};
  if (data.status !== undefined) {
    if (STATUSES.indexOf(data.status) < 0) throw new Error('สถานะไม่ถูกต้อง: ' + data.status);
    out.status = data.status;
  }
  if (data.phone !== undefined) out.phone = formatPhone_(data.phone);
  if (data.birthday !== undefined) out.birthday = parseBirthday_(data.birthday);
  if (data.note !== undefined) {
    var note = clean_(data.note).slice(0, NOTE_MAX_LENGTH);
    // ใส่ ' นำหน้าเพื่อให้ชีตเก็บเป็นข้อความ ไม่ตีความเป็นสูตร (เครื่องหมาย ' จะไม่แสดง)
    out.note = /^[=+\-@']/.test(note) ? "'" + note : note;
  }
  return out;
}

/** รับเบอร์ไทย 9–10 หลักขึ้นต้นด้วย 0 จัดรูปแบบ 08x-xxx-xxxx, 02-xxx-xxxx, 054-xxx-xxx */
function formatPhone_(value) {
  var digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.indexOf('66') === 0 && digits.length === 11) digits = '0' + digits.slice(2);
  if (!/^0\d{8,9}$/.test(digits)) throw new Error('เบอร์โทรไม่ถูกต้อง (ต้องเป็นตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0)');
  if (digits.length === 10) return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
  if (digits.indexOf('02') === 0) return digits.slice(0, 2) + '-' + digits.slice(2, 5) + '-' + digits.slice(5);
  return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
}

/** รับวันเกิดรูปแบบ yyyy-mm-dd (ค.ศ.) คืนค่า Date หรือ '' หากต้องการลบ */
function parseBirthday_(value) {
  var s = clean_(value);
  if (!s) return '';
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (!m) throw new Error('รูปแบบวันเกิดไม่ถูกต้อง');
  var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  var date = new Date(y, mo - 1, d, 12);
  var thisYear = new Date().getFullYear();
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    throw new Error('วันเกิดไม่ถูกต้อง');
  }
  if (y < thisYear - 100 || date > new Date()) throw new Error('วันเกิดไม่ถูกต้อง');
  return date;
}

/** แปลงค่าวันเกิดในชีต (Date หรือข้อความ dd/mm/yyyy ทั้ง พ.ศ./ค.ศ.) เป็น yyyy-mm-dd ค.ศ. */
function toIsoDate_(value, tz) {
  if (value instanceof Date && !isNaN(value)) {
    var iso = Utilities.formatDate(value, tz, 'yyyy-MM-dd');
    var year = Number(iso.slice(0, 4));
    // วันที่ที่ถูกพิมพ์เป็น พ.ศ. ลงช่องวันที่
    return year > 2400 ? (year - 543) + iso.slice(4) : iso;
  }
  var m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(clean_(value));
  if (!m) return '';
  var y = Number(m[3]);
  if (y > 2400) y -= 543;
  return y + '-' + pad2_(m[2]) + '-' + pad2_(m[1]);
}

function pad2_(n) {
  n = String(n);
  return n.length < 2 ? '0' + n : n;
}

/**
 * ดรอปดาวน์สถานะเดิมในคอลัมน์ D รองรับแค่ อยู่/ลา/ไม่ทราบ
 * ถ้ายังไม่รองรับสถานะใหม่ จะตั้งดรอปดาวน์ใหม่ให้ทุกแถวเจ้าหน้าที่ในแท็บนั้น
 */
function ensureStatusValidation_(sheet, row) {
  var rule = sheet.getRange(row, COL_STATUS).getDataValidation();
  if (rule && rule.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
    var allowed = rule.getCriteriaValues()[0] || [];
    var ok = STATUSES.every(function (s) { return allowed.indexOf(s) >= 0; });
    if (ok) return;
  }

  var newRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUSES, true)
    .setAllowInvalid(false)
    .build();
  var lastRow = sheet.getLastRow();
  var n = lastRow - FIRST_DATA_ROW + 1;
  if (n < 1) return;
  var names = sheet.getRange(FIRST_DATA_ROW, COL_NAME, n, 1).getDisplayValues();
  var rangeList = [];
  for (var i = 0; i < n; i++) {
    var name = clean_(names[i][0]);
    if (name && !isNote_(name)) rangeList.push('D' + (i + FIRST_DATA_ROW));
  }
  if (rangeList.length) sheet.getRangeList(rangeList).setDataValidation(newRule);
}

/** รีเซ็ตสถานะและหมายเหตุของทุกคนในโซน (หรือทุกโซนหาก sheetName ว่าง) กลับเป็น "ไม่ทราบ"
 *  เบอร์โทรและวันเกิดยังคงอยู่ */
function resetStatuses(pin, sheetName) {
  requireAdmin_(pin);
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
      ensureColumns_(sheet);

      var n = lastRow - FIRST_DATA_ROW + 1;
      var names = sheet.getRange(FIRST_DATA_ROW, COL_NAME, n, 1).getDisplayValues();
      var statusRange = sheet.getRange(FIRST_DATA_ROW, COL_STATUS, n, 1);
      var statuses = statusRange.getValues();
      var extraRange = sheet.getRange(FIRST_DATA_ROW, COL_UPDATED, n, COL_NOTE - COL_UPDATED + 1);
      var extra = extraRange.getValues();

      for (var i = 0; i < n; i++) {
        var name = clean_(names[i][0]);
        if (!name || isNote_(name)) continue;
        statuses[i][0] = DEFAULT_STATUS;
        for (var j = 0; j < extra[i].length; j++) extra[i][j] = '';
        count++;
      }
      statusRange.setValues(statuses);
      extraRange.setValues(extra);
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

function padRows_(rows) {
  rows.forEach(function (r) { while (r.length < LAST_COL) r.push(''); });
  return rows;
}

function ensureColumns_(sheet) {
  var missing = LAST_COL - sheet.getMaxColumns();
  if (missing > 0) sheet.insertColumnsAfter(sheet.getMaxColumns(), missing);
}

function ensureHeader_(sheet, col) {
  var cell = sheet.getRange(1, col);
  if (!cell.getDisplayValue()) cell.setValue(HEADERS[col]);
}

function now_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
}
