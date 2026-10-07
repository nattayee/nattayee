/**
 * ระบบนัดคิวเทคนิคพิเศษ กลุ่มงานรังสีรักษา โรงพยาบาลมะเร็งลำปาง
 * Google Apps Script version — data is stored in a Google Sheet.
 *
 * ที่เก็บข้อมูล (เลือกอย่างใดอย่างหนึ่ง):
 * - เว้น SPREADSHEET_ID ว่างไว้: ถ้าสคริปต์สร้างจาก Google Sheet จะใช้ชีตนั้น
 *   ถ้าเป็นสคริปต์แยก ระบบจะสร้าง Google Sheet ใหม่ใน Drive ให้อัตโนมัติในครั้งแรก
 * - หรือใส่ ID ของ Google Sheet ที่ต้องการใช้ (ส่วนที่อยู่ระหว่าง /d/ และ /edit ใน URL)
 */
const SPREADSHEET_ID = '';
const SHEET_NAME = 'นัดเทคนิคพิเศษ';
const AUTO_SPREADSHEET_TITLE = 'ระบบนัดคิวเทคนิคพิเศษ รังสีรักษา รพ.มะเร็งลำปาง';
const TECHNIQUES = ['DIBH', 'SRS', 'SRT', 'SBRT', 'อื่นๆ'];

// [key, หัวคอลัมน์ในชีต] — ห้ามสลับลำดับหลังจากเริ่มใช้งานแล้ว
const COLUMNS = [
  ['id', 'ID'],
  ['startDate', 'วันเริ่มฉายรังสี'],
  ['time', 'เวลา'],
  ['hn', 'HN'],
  ['name', 'ชื่อ-สกุล'],
  ['technique', 'เทคนิค'],
  ['techniqueOther', 'เทคนิคอื่นๆ'],
  ['site', 'ตำแหน่งที่ฉาย'],
  ['fractions', 'จำนวนครั้ง'],
  ['cbct', 'CBCT'],
  ['physician', 'แพทย์ผู้สั่ง'],
  ['note', 'หมายเหตุ'],
  ['createdAt', 'สร้างเมื่อ'],
  ['updatedAt', 'แก้ไขล่าสุด'],
];
const KEYS = COLUMNS.map(function (c) { return c[0]; });

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('นัดคิวเทคนิคพิเศษ รังสีรักษา')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------- functions called from Index.html via google.script.run ----------

function getInitData() {
  const ss = getSpreadsheet_();
  return { bookings: listBookings(), sheetUrl: ss.getUrl() };
}

function listBookings() {
  const sheet = getSheet_(getSpreadsheet_());
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, KEYS.length).getValues()
    .filter(function (row) { return row[0]; })
    .map(rowToBooking_);
}

function createBooking(input) {
  const booking = validate_(input);
  const ss = getSpreadsheet_();
  return withLock_(function () {
    const sheet = getSheet_(ss);
    const now = new Date().toISOString();
    booking.id = Utilities.getUuid();
    booking.createdAt = now;
    booking.updatedAt = now;
    writeRow_(sheet, sheet.getLastRow() + 1, booking);
    return booking;
  });
}

function updateBooking(id, input) {
  const booking = validate_(input);
  const ss = getSpreadsheet_();
  return withLock_(function () {
    const sheet = getSheet_(ss);
    const row = findRow_(sheet, id);
    const existing = rowToBooking_(sheet.getRange(row, 1, 1, KEYS.length).getValues()[0]);
    booking.id = id;
    booking.createdAt = existing.createdAt;
    booking.updatedAt = new Date().toISOString();
    writeRow_(sheet, row, booking);
    return booking;
  });
}

function deleteBooking(id) {
  const ss = getSpreadsheet_();
  return withLock_(function () {
    const sheet = getSheet_(ss);
    sheet.deleteRow(findRow_(sheet, id));
    return true;
  });
}

// ---------- helpers ----------

function getSpreadsheet_() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  // สคริปต์แยก (standalone): ใช้ชีตที่สร้างไว้แล้ว หรือสร้างใหม่ครั้งแรก
  const props = PropertiesService.getScriptProperties();
  return withLock_(function () {
    const id = props.getProperty('SPREADSHEET_ID');
    if (id) return SpreadsheetApp.openById(id);
    const created = SpreadsheetApp.create(AUTO_SPREADSHEET_TITLE);
    props.setProperty('SPREADSHEET_ID', created.getId());
    return created;
  });
}

function getSheet_(ss) {
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, COLUMNS.length)
      .setValues([COLUMNS.map(function (c) { return c[1]; })])
      .setFontWeight('bold')
      .setBackground('#0f6e8c')
      .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    // เก็บทุกช่องเป็นข้อความ เพื่อไม่ให้ชีตแปลงวันที่/เวลา หรือตัดเลข 0 หน้า HN
    sheet.getRange(1, 1, sheet.getMaxRows(), COLUMNS.length).setNumberFormat('@');
  }
  return sheet;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function findRow_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(id)) return i + 2;
    }
  }
  throw new Error('ไม่พบรายการนัด (อาจถูกลบไปแล้ว)');
}

function writeRow_(sheet, row, b) {
  const values = KEYS.map(function (k) {
    if (k === 'cbct') return b.cbct ? 'ทำ' : 'ไม่ทำ';
    if (k === 'fractions') return b.fractions === null ? '' : String(b.fractions);
    return b[k] === undefined || b[k] === null ? '' : String(b[k]);
  });
  sheet.getRange(row, 1, 1, KEYS.length).setNumberFormat('@').setValues([values]);
}

function rowToBooking_(row) {
  const tz = Session.getScriptTimeZone();
  const b = {};
  KEYS.forEach(function (k, i) {
    let v = row[i];
    if (Object.prototype.toString.call(v) === '[object Date]') {
      // กันกรณีมีคนแก้ข้อมูลในชีตแล้วชีตแปลงเป็นวันที่/เวลา
      v = k === 'time' ? Utilities.formatDate(v, tz, 'HH:mm')
        : k === 'startDate' ? Utilities.formatDate(v, tz, 'yyyy-MM-dd')
        : v.toISOString();
    }
    b[k] = v === null || v === undefined ? '' : String(v).trim();
  });
  b.cbct = b.cbct === 'ทำ' || b.cbct.toUpperCase() === 'TRUE';
  b.fractions = b.fractions === '' ? null : Number(b.fractions);
  return b;
}

function text_(value, max) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, max);
}

function isValidDate_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const p = s.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
}

// Returns a clean booking or throws an Error with a Thai message.
function validate_(input) {
  if (!input || typeof input !== 'object') throw new Error('ข้อมูลไม่ถูกต้อง');
  const b = {
    hn: text_(input.hn, 20),
    name: text_(input.name, 120),
    technique: text_(input.technique, 20),
    techniqueOther: text_(input.techniqueOther, 60),
    site: text_(input.site, 120),
    startDate: text_(input.startDate, 10),
    time: text_(input.time, 5),
    fractions: input.fractions === '' || input.fractions == null ? null : Number(input.fractions),
    cbct: input.cbct,
    physician: text_(input.physician, 120),
    note: text_(input.note, 1000),
  };
  if (!b.hn) throw new Error('กรุณากรอก HN');
  if (!b.name) throw new Error('กรุณากรอกชื่อ-สกุลผู้ป่วย');
  if (TECHNIQUES.indexOf(b.technique) === -1) throw new Error('กรุณาเลือกเทคนิค');
  if (b.technique === 'อื่นๆ' && !b.techniqueOther) throw new Error('กรุณาระบุเทคนิคอื่นๆ');
  if (b.technique !== 'อื่นๆ') b.techniqueOther = '';
  if (!isValidDate_(b.startDate)) throw new Error('กรุณาระบุวันเริ่มฉายรังสีให้ถูกต้อง');
  if (b.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time)) throw new Error('เวลาไม่ถูกต้อง');
  if (b.fractions !== null && !(Number.isInteger(b.fractions) && b.fractions >= 1 && b.fractions <= 100)) {
    throw new Error('จำนวนครั้งต้องเป็นจำนวนเต็ม 1–100');
  }
  if (typeof b.cbct !== 'boolean') throw new Error('กรุณาระบุ CBCT (ทำ / ไม่ทำ)');
  return b;
}
