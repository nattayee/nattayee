/**
 * ระบบนัดคิวผู้ป่วยฉายรังสี — ฝั่ง Google Apps Script
 * กลุ่มงานรังสีรักษา โรงพยาบาลมะเร็งลำปาง
 *
 * เก็บข้อมูลใน Google Sheet 3 แผ่น: Appointments (นัดผู้ป่วย), Holidays (วันหยุด), Settings (ตั้งค่า)
 * ฟังก์ชันที่ลงท้ายด้วย _ เป็นฟังก์ชันภายใน หน้าเว็บเรียกใช้ไม่ได้
 * ค่าคงที่และตรรกะการคำนวณวันฉาย (ROOMS, TECHNIQUES, defaultSettings, …) อยู่ในไฟล์ Schedule.gs
 */

// (ไม่บังคับ) ถ้าต้องการใช้ Google Sheet ที่มีอยู่แล้ว ให้วางลิงก์ของ Sheet ไว้ในเครื่องหมายคำพูดก่อนรัน setup
// ถ้าเว้นว่างไว้ setup จะสร้าง Google Sheet ใหม่ให้อัตโนมัติ
var SPREADSHEET_URL = '';

var SHEET_APPTS_ = 'Appointments';
var SHEET_HOLIDAYS_ = 'Holidays';
var SHEET_SETTINGS_ = 'Settings';

var APPT_COLUMNS_ = [
  'id', 'hn', 'prefix', 'firstName', 'lastName', 'name', 'age', 'sex', 'phone',
  'icd10', 'diagnosis', 'site', 'icd9', 'physician',
  'technique', 'room', 'dosePerFx', 'fractions', 'simDate', 'verifyDate', 'verifyTime',
  'startDate', 'time', 'duration', 'cbctMode', 'cbctDates', 'skipDates',
  'status', 'notes', 'createdAt', 'updatedAt',
];

// ================= หน้าเว็บ =================

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('ระบบนัดคิวฉายรังสี')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * รันครั้งเดียวจากหน้าแก้ไขสคริปต์ (เลือกฟังก์ชัน setup แล้วกด เรียกใช้)
 * เลือก Google Sheet ที่ใช้เก็บข้อมูลตามลำดับ: ลิงก์ใน SPREADSHEET_URL › Sheet ที่ตั้งไว้แล้ว
 * › Sheet ที่เปิด Apps Script นี้ (ส่วนขยาย › Apps Script) › ถ้าไม่มีเลยจะสร้าง Sheet ใหม่
 * แล้วสร้างแผ่นงานที่จำเป็น ลิงก์ของ Sheet จะแสดงในบันทึกการดำเนินการ
 */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var ss = null;
  var created = false;
  if (SPREADSHEET_URL) {
    ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  } else if (props.getProperty('SPREADSHEET_ID')) {
    try {
      ss = SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID'));
    } catch (e) {
      ss = null; // Sheet เดิมถูกลบหรือเข้าไม่ได้ — สร้างใหม่
    }
  }
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    ss = SpreadsheetApp.create('ฐานข้อมูลนัดคิวฉายรังสี');
    created = true;
  }
  props.setProperty('SPREADSHEET_ID', ss.getId());
  var blank = created ? ss.getSheets()[0] : null;
  ensureSheets_();
  if (blank) ss.deleteSheet(blank); // แผ่นงานว่างที่ติดมากับ Sheet ใหม่
  Logger.log((created ? 'สร้าง Google Sheet ใหม่สำหรับเก็บข้อมูลแล้ว: ' : 'ใช้ Google Sheet นี้เก็บข้อมูล: ') + ss.getUrl());
  Logger.log('ขั้นต่อไป: แชร์ Sheet นี้ (ผู้แก้ไข) ให้เจ้าหน้าที่ที่ใช้ระบบ แล้วกด การทำให้ใช้งานได้ › การทำให้ใช้งานได้รายการใหม่ › เว็บแอป');
  return ss.getUrl();
}

// ================= API ที่หน้าเว็บเรียก (google.script.run) =================

function getState() {
  ensureSheets_();
  return { appointments: readAppointments_(), settings: readSettings_() };
}

function createAppointment(input) {
  var v = validateAppointment_(input || {});
  return withLock_(function () {
    var now = new Date().toISOString();
    var appt = Object.assign({ id: Utilities.getUuid() }, v, { createdAt: now, updatedAt: now });
    var sh = apptSheet_();
    var headers = headers_(sh);
    writeRow_(sh, sh.getLastRow() + 1, headers, appt);
    return appt;
  });
}

function updateAppointment(id, input) {
  var v = validateAppointment_(input || {});
  return withLock_(function () {
    var sh = apptSheet_();
    var headers = headers_(sh);
    var row = findRow_(sh, headers, id);
    if (!row) throw new Error('ไม่พบข้อมูลนัด (อาจถูกลบโดยผู้ใช้อื่น)');
    var prev = rowToAppt_(sh.getRange(row, 1, 1, headers.length).getDisplayValues()[0], headers);
    var appt = Object.assign({}, prev, v, { id: prev.id, updatedAt: new Date().toISOString() });
    writeRow_(sh, row, headers, appt);
    return appt;
  });
}

function deleteAppointment(id) {
  return withLock_(function () {
    var sh = apptSheet_();
    var row = findRow_(sh, headers_(sh), id);
    if (!row) throw new Error('ไม่พบข้อมูลนัด');
    // Google Sheets ไม่ยอมให้ลบแถวที่ไม่ถูกตรึงจนหมด
    if (sh.getMaxRows() > 2) sh.deleteRow(row);
    else sh.getRange(row, 1, 1, sh.getLastColumn()).clearContent();
    return null;
  });
}

function saveSettings(input) {
  var s = validateSettings_(input || {});
  return withLock_(function () {
    writeSettings_(s);
    return s;
  });
}

/** นำเข้าไฟล์สำรอง: แทนที่ข้อมูลนัดทั้งหมด */
function importAll(data) {
  if (!data || !Array.isArray(data.appointments)) throw new Error('ไฟล์สำรองไม่ถูกต้อง');
  var now = new Date().toISOString();
  var appts = data.appointments.map(function (raw, i) {
    var v;
    try {
      v = validateAppointment_(raw || {});
    } catch (e) {
      throw new Error('รายการที่ ' + (i + 1) + ': ' + e.message);
    }
    return Object.assign({ id: str_(raw.id, 64) || Utilities.getUuid() }, v, {
      createdAt: str_(raw.createdAt, 30) || now,
      updatedAt: str_(raw.updatedAt, 30) || now,
    });
  });
  var settings = data.settings ? validateSettings_(data.settings) : null;
  return withLock_(function () {
    var sh = apptSheet_();
    var headers = headers_(sh);
    clearBody_(sh);
    if (appts.length) {
      var range = sh.getRange(2, 1, appts.length, headers.length);
      range.setNumberFormat('@');
      range.setValues(appts.map(function (a) { return apptToRow_(a, headers); }));
    }
    if (settings) writeSettings_(settings);
    return { appointments: readAppointments_(), settings: readSettings_() };
  });
}

// ================= Google Sheet =================

function spreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  throw new Error('ยังไม่ได้ตั้งค่าระบบ: ผู้ดูแลต้องเปิดหน้าแก้ไขสคริปต์ เลือกฟังก์ชัน setup แล้วกด เรียกใช้ หนึ่งครั้ง');
}

function ensureSheets_() {
  var ss = spreadsheet_();
  var created = false;
  [[SHEET_APPTS_, APPT_COLUMNS_], [SHEET_HOLIDAYS_, ['date', 'name']], [SHEET_SETTINGS_, ['key', 'value']]].forEach(function (x) {
    if (ss.getSheetByName(x[0])) return;
    var sh = ss.insertSheet(x[0]);
    ensureColumns_(sh, x[1].length);
    sh.getRange(1, 1, sh.getMaxRows(), x[1].length).setNumberFormat('@'); // เก็บเป็นข้อความ ไม่ให้ Sheet แปลงวันที่/HN
    sh.getRange(1, 1, 1, x[1].length).setValues([x[1]]).setFontWeight('bold');
    sh.setFrozenRows(1);
    created = true;
  });
  if (created && ss.getSheetByName(SHEET_HOLIDAYS_).getLastRow() < 2) {
    withLock_(function () { writeSettings_(defaultSettings()); });
  }
  // Sheet จากเวอร์ชันก่อน: เพิ่มคอลัมน์ใหม่ต่อท้าย
  var sh = ss.getSheetByName(SHEET_APPTS_);
  var headers = headers_(sh);
  var missing = APPT_COLUMNS_.filter(function (c) { return headers.indexOf(c) < 0; });
  if (missing.length) {
    var col = headers.length + 1;
    ensureColumns_(sh, headers.length + missing.length);
    sh.getRange(1, col, sh.getMaxRows(), missing.length).setNumberFormat('@');
    sh.getRange(1, col, 1, missing.length).setValues([missing]).setFontWeight('bold');
  }
}

function apptSheet_() {
  return spreadsheet_().getSheetByName(SHEET_APPTS_);
}

function headers_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
}

function findRow_(sh, headers, id) {
  var col = headers.indexOf('id') + 1;
  var last = sh.getLastRow();
  if (!id || last < 2) return 0;
  var ids = sh.getRange(2, col, last - 1, 1).getDisplayValues();
  for (var i = 0; i < ids.length; i++) if (ids[i][0] === id) return i + 2;
  return 0;
}

function writeRow_(sh, row, headers, appt) {
  var range = sh.getRange(row, 1, 1, headers.length);
  range.setNumberFormat('@');
  range.setValues([apptToRow_(appt, headers)]);
}

function apptToRow_(a, headers) {
  return headers.map(function (h) {
    var v = a[h];
    if (Array.isArray(v)) return v.join(',');
    return v === undefined || v === null ? '' : String(v);
  });
}

function rowToAppt_(row, headers) {
  var a = {};
  headers.forEach(function (h, i) { if (h) a[h] = String(row[i] || '').trim(); });
  a.age = a.age === '' ? '' : Number(a.age);
  a.fractions = Number(a.fractions);
  a.duration = Number(a.duration);
  a.cbctDates = (a.cbctDates || '').split(',').filter(Boolean);
  a.skipDates = (a.skipDates || '').split(',').filter(Boolean);
  a.cbctMode = a.cbctMode || 'fx1';
  a.status = a.status || 'active';
  return a;
}

function readAppointments_() {
  var sh = apptSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var headers = headers_(sh);
  return sh
    .getRange(2, 1, last - 1, headers.length)
    .getDisplayValues()
    .map(function (r) { return rowToAppt_(r, headers); })
    .filter(function (a) { return a.id; });
}

function readSettings_() {
  var ss = spreadsheet_();
  var s = defaultSettings();
  var kv = ss.getSheetByName(SHEET_SETTINGS_);
  if (kv.getLastRow() > 1) {
    kv.getRange(2, 1, kv.getLastRow() - 1, 2).getDisplayValues().forEach(function (r) {
      try {
        if (r[0] === 'workdays') s.workdays = JSON.parse(r[1]);
        if (r[0] === 'rooms') s.rooms = Object.assign(s.rooms, JSON.parse(r[1]));
        if (r[0] === 'slotMinutes') s.slotMinutes = Number(r[1]) || s.slotMinutes;
        if (r[0] === 'physicians') s.physicians = JSON.parse(r[1]);
      } catch (e) {
        /* ค่าที่แก้ใน Sheet ไม่ถูกต้อง — ใช้ค่าเริ่มต้น */
      }
    });
  }
  var hs = ss.getSheetByName(SHEET_HOLIDAYS_);
  s.holidays = hs.getLastRow() < 2 ? [] : hs
    .getRange(2, 1, hs.getLastRow() - 1, 2)
    .getDisplayValues()
    .filter(function (r) { return /^\d{4}-\d{2}-\d{2}$/.test(r[0]); })
    .map(function (r) { return { date: r[0], name: r[1] }; })
    .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  return s;
}

function writeSettings_(s) {
  var ss = spreadsheet_();
  var kv = ss.getSheetByName(SHEET_SETTINGS_);
  clearBody_(kv);
  kv.getRange(2, 1, 4, 2).setNumberFormat('@').setValues([
    ['workdays', JSON.stringify(s.workdays)],
    ['rooms', JSON.stringify(s.rooms)],
    ['slotMinutes', String(s.slotMinutes)],
    ['physicians', JSON.stringify(s.physicians || [])],
  ]);
  var hs = ss.getSheetByName(SHEET_HOLIDAYS_);
  clearBody_(hs);
  if (s.holidays.length) {
    hs.getRange(2, 1, s.holidays.length, 2).setNumberFormat('@')
      .setValues(s.holidays.map(function (h) { return [h.date, h.name]; }));
  }
}

/** แผ่นงานใหม่มี 26 คอลัมน์ (A–Z) — เพิ่มคอลัมน์ถ้าไม่พอ */
function ensureColumns_(sh, n) {
  var max = sh.getMaxColumns();
  if (max < n) sh.insertColumnsAfter(max, n - max);
}

/** ล้างข้อมูลทุกแถวยกเว้นหัวตาราง */
function clearBody_(sh) {
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, Math.max(1, sh.getLastColumn())).clearContent();
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

// ================= ตรวจสอบข้อมูล =================

var DATE_RE_ = /^\d{4}-\d{2}-\d{2}$/;
var TIME_RE_ = /^([01]\d|2[0-3]):[0-5]\d$/;

function str_(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max || 500) : '';
}

function ids_(list) {
  return list.map(function (x) { return x.id; });
}

function validateAppointment_(input) {
  var errors = [];
  var a = {
    hn: str_(input.hn, 30),
    prefix: str_(input.prefix, 40),
    firstName: str_(input.firstName, 100),
    lastName: str_(input.lastName, 100),
    name: str_(input.name, 200),
    age: input.age === '' || input.age == null ? '' : Number(input.age),
    sex: str_(input.sex, 10),
    phone: str_(input.phone, 50),
    icd10: str_(input.icd10, 10),
    diagnosis: str_(input.diagnosis, 200),
    site: str_(input.site, 500),
    icd9: str_(input.icd9, 10),
    physician: str_(input.physician, 100),
    technique: str_(input.technique, 20),
    room: str_(input.room, 5),
    simDate: str_(input.simDate, 10),
    verifyDate: str_(input.verifyDate, 10),
    verifyTime: str_(input.verifyTime, 5),
    startDate: str_(input.startDate, 10),
    fractions: Number(input.fractions),
    dosePerFx: str_(input.dosePerFx, 20),
    time: str_(input.time, 5),
    duration: Number(input.duration),
    cbctMode: str_(input.cbctMode, 20) || 'fx1',
    cbctDates: Array.isArray(input.cbctDates) ? input.cbctDates.filter(function (d) { return DATE_RE_.test(d); }) : [],
    skipDates: Array.isArray(input.skipDates) ? input.skipDates.filter(function (d) { return DATE_RE_.test(d); }) : [],
    status: str_(input.status, 20) || 'active',
    notes: str_(input.notes, 2000),
  };
  if (a.firstName) a.name = composeName(a.prefix, a.firstName, a.lastName);
  if (!a.hn) errors.push('กรุณาระบุ HN');
  if (!a.name) errors.push('กรุณาระบุชื่อผู้ป่วย');
  if (ids_(ROOMS).indexOf(a.room) < 0) errors.push('ห้องฉายไม่ถูกต้อง');
  if (ids_(TECHNIQUES).indexOf(a.technique) < 0) errors.push('เทคนิคการฉายไม่ถูกต้อง');
  if (ids_(CBCT_MODES).indexOf(a.cbctMode) < 0) errors.push('รูปแบบ CBCT ไม่ถูกต้อง');
  if (ids_(STATUSES).indexOf(a.status) < 0) errors.push('สถานะไม่ถูกต้อง');
  if (!DATE_RE_.test(a.startDate)) errors.push('วันเริ่มฉายไม่ถูกต้อง');
  if (a.simDate && !DATE_RE_.test(a.simDate)) errors.push('วันทำ CT Sim ไม่ถูกต้อง');
  if (a.verifyDate && !DATE_RE_.test(a.verifyDate)) errors.push('วันนัดทำ CBCT ไม่ถูกต้อง');
  if (!TIME_RE_.test(a.time)) errors.push('เวลานัดไม่ถูกต้อง');
  if (a.verifyTime && !TIME_RE_.test(a.verifyTime)) errors.push('เวลานัด CBCT ไม่ถูกต้อง');
  if (!(a.fractions % 1 === 0 && a.fractions >= 1 && a.fractions <= 60)) errors.push('จำนวนครั้ง (Fx) ต้องอยู่ระหว่าง 1–60');
  if (!(a.duration % 1 === 0 && a.duration >= 5 && a.duration <= 240)) errors.push('ระยะเวลาต่อครั้งต้องอยู่ระหว่าง 5–240 นาที');
  if (errors.length) throw new Error(errors.join('\n'));
  return a;
}

function validateSettings_(input) {
  var s = defaultSettings();
  if (Array.isArray(input.workdays)) {
    s.workdays = input.workdays.map(Number).filter(function (n) { return n >= 0 && n <= 6; });
  }
  if (Array.isArray(input.holidays)) {
    s.holidays = input.holidays
      .filter(function (h) { return h && DATE_RE_.test(h.date); })
      .map(function (h) { return { date: h.date, name: str_(h.name, 100) }; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }
  if (input.rooms) {
    ROOMS.forEach(function (r) {
      var v = input.rooms[r.id];
      if (v && TIME_RE_.test(v.open) && TIME_RE_.test(v.close)) s.rooms[r.id] = { open: v.open, close: v.close };
    });
  }
  var slot = Number(input.slotMinutes);
  if ([5, 10, 15, 20, 30].indexOf(slot) >= 0) s.slotMinutes = slot;
  if (Array.isArray(input.physicians)) {
    s.physicians = input.physicians
      .map(function (p) { return str_(p, 100); })
      .filter(function (p, i, arr) { return p && arr.indexOf(p) === i; });
  }
  return s;
}
