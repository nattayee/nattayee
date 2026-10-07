/**
 * ระบบนัดคิวเทคนิคพิเศษ กลุ่มงานรังสีรักษา โรงพยาบาลมะเร็งลำปาง
 * Google Apps Script version — data is stored in a Google Sheet.
 *
 * ที่เก็บข้อมูล (เลือกอย่างใดอย่างหนึ่ง):
 * - เว้น SPREADSHEET_ID ว่างไว้: ถ้าสคริปต์สร้างจาก Google Sheet จะใช้ชีตนั้น
 *   ถ้าเป็นสคริปต์แยก ระบบจะสร้าง Google Sheet ใหม่ใน Drive ให้อัตโนมัติในครั้งแรก
 * - หรือใส่ ID ของ Google Sheet ที่ต้องการใช้ (ส่วนที่อยู่ระหว่าง /d/ และ /edit ใน URL)
 *
 * วันหยุด: แก้ไข/เพิ่มได้ในชีต "วันหยุด" (คอลัมน์ วันที่ แบบ yyyy-mm-dd และชื่อวันหยุด)
 */
const SPREADSHEET_ID = '';
const SHEET_NAME = 'นัดเทคนิคพิเศษ';
const HOLIDAY_SHEET_NAME = 'วันหยุด';
const AUTO_SPREADSHEET_TITLE = 'ระบบนัดคิวเทคนิคพิเศษ รังสีรักษา รพ.มะเร็งลำปาง';
const TECHNIQUES = ['DIBH', 'SRS', 'SRT', 'SBRT', 'อื่นๆ'];
const CBCT_PATTERNS = [
  ['first3_weekly', '3 ครั้งแรก แล้วสัปดาห์ละครั้ง'],
  ['weekly', 'สัปดาห์ละครั้ง'],
  ['daily', 'ทุกครั้ง'],
  ['first', 'เฉพาะครั้งแรก'],
  ['none', 'ไม่ทำ CBCT ระหว่างฉาย'],
  ['custom', 'กำหนดเอง (เลือกในตาราง)'],
];
const MAX_FRACTIONS = 100;

// รายชื่อแพทย์ผู้สั่ง (ต้องเลือกจากรายชื่อนี้)
// PHYSICIANS:START
const PHYSICIANS = [
  'ทัศน์วรรณ อาษากิจ',
  'ศิริรัตน์ เชื้อสำราญ',
  'พัฒธิดา มโนรส',
  'ทินกร จอมใจ',
];
// PHYSICIANS:END

// ตำแหน่ง / อวัยวะที่ฉาย (เลือกจากรายการนี้ หรือเว้นว่าง)
// SITES:START
const SITES = [
  'Lt Breast',
  'Chest',
  'Abd',
  'Head',
  'H&N',
  'Pelvis',
];
// SITES:END

// [key, หัวคอลัมน์ในชีต] — ห้ามสลับลำดับ คอลัมน์ใหม่ให้เพิ่มต่อท้ายเท่านั้น
const COLUMNS = [
  ['id', 'ID'],
  ['startDate', 'วันเริ่มฉายรังสี'],
  ['time', 'เวลานัด'],
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
  ['duration', 'ระยะเวลาต่อครั้ง (นาที)'],
  ['endDate', 'วันสิ้นสุดการฉาย'],
  ['cbctPattern', 'รูปแบบ CBCT ระหว่างฉาย'],
  ['verifyDate', 'วันทำ CBCT ก่อนเริ่มฉาย'],
  ['verifyTime', 'เวลาทำ CBCT ก่อนเริ่มฉาย'],
  ['cbctDates', 'วัน CBCT ระหว่างฉาย'],
  ['treatmentDates', 'วันฉายทั้งหมด'],
  ['skipDates', 'วันงดฉาย'],
];
const KEYS = COLUMNS.map(function (c) { return c[0]; });
const LIST_KEYS = ['cbctDates', 'treatmentDates', 'skipDates'];

// วันหยุดเริ่มต้นที่ใส่ในชีต "วันหยุด" ตอนสร้างครั้งแรก
// HOLIDAYS:START
const HOLIDAYS_SEED = [
  ['2026-01-01', 'วันขึ้นปีใหม่'],
  ['2026-01-02', 'วันหยุดพิเศษ (มติ ครม.)'],
  ['2026-03-03', 'วันมาฆบูชา'],
  ['2026-04-06', 'วันจักรี'],
  ['2026-04-13', 'วันสงกรานต์'],
  ['2026-04-14', 'วันสงกรานต์'],
  ['2026-04-15', 'วันสงกรานต์'],
  ['2026-05-04', 'วันฉัตรมงคล'],
  ['2026-05-31', 'วันวิสาขบูชา'],
  ['2026-06-01', 'ชดเชยวันวิสาขบูชา'],
  ['2026-06-03', 'วันเฉลิมพระชนมพรรษา สมเด็จพระราชินี'],
  ['2026-07-28', 'วันเฉลิมพระชนมพรรษา ร.10'],
  ['2026-07-29', 'วันอาสาฬหบูชา'],
  ['2026-07-30', 'วันเข้าพรรษา'],
  ['2026-08-12', 'วันแม่แห่งชาติ'],
  ['2026-10-13', 'วันนวมินทรมหาราช'],
  ['2026-10-23', 'วันปิยมหาราช'],
  ['2026-12-05', 'วันพ่อแห่งชาติ'],
  ['2026-12-07', 'ชดเชยวันพ่อแห่งชาติ'],
  ['2026-12-10', 'วันรัฐธรรมนูญ'],
  ['2026-12-31', 'วันสิ้นปี'],
  ['2027-01-01', 'วันขึ้นปีใหม่'],
  ['2027-04-06', 'วันจักรี'],
  ['2027-04-13', 'วันสงกรานต์'],
  ['2027-04-14', 'วันสงกรานต์'],
  ['2027-04-15', 'วันสงกรานต์'],
  ['2027-05-04', 'วันฉัตรมงคล'],
  ['2027-06-03', 'วันเฉลิมพระชนมพรรษา สมเด็จพระราชินี'],
  ['2027-07-28', 'วันเฉลิมพระชนมพรรษา ร.10'],
  ['2027-08-12', 'วันแม่แห่งชาติ'],
  ['2027-10-13', 'วันนวมินทรมหาราช'],
  ['2027-10-23', 'วันปิยมหาราช'],
  ['2027-10-25', 'ชดเชยวันปิยมหาราช'],
  ['2027-12-05', 'วันพ่อแห่งชาติ'],
  ['2027-12-06', 'ชดเชยวันพ่อแห่งชาติ'],
  ['2027-12-10', 'วันรัฐธรรมนูญ'],
  ['2027-12-31', 'วันสิ้นปี'],
];
// HOLIDAYS:END

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('นัดคิวเทคนิคพิเศษ รังสีรักษา')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------- functions called from Index.html via google.script.run ----------

function getInitData() {
  const ss = getSpreadsheet_();
  return { bookings: listBookings(), holidays: listHolidays_(ss), sheetUrl: ss.getUrl() };
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
  const headers = COLUMNS.map(function (c) { return c[1]; });
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.setFrozenRows(1);
    // เก็บทุกช่องเป็นข้อความ เพื่อไม่ให้ชีตแปลงวันที่/เวลา หรือตัดเลข 0 หน้า HN
    sheet.getRange(1, 1, sheet.getMaxRows(), COLUMNS.length).setNumberFormat('@');
  }
  // สร้าง/อัปเดตหัวตาราง (รองรับชีตจากเวอร์ชันเก่าที่มีคอลัมน์น้อยกว่า)
  const current = sheet.getRange(1, 1, 1, COLUMNS.length).getValues()[0];
  if (current.join('|') !== headers.join('|')) {
    sheet.getRange(1, 1, 1, COLUMNS.length)
      .setNumberFormat('@')
      .setValues([headers])
      .setFontWeight('bold')
      .setBackground('#0f6e8c')
      .setFontColor('#ffffff');
  }
  return sheet;
}

function listHolidays_(ss) {
  let sheet = ss.getSheetByName(HOLIDAY_SHEET_NAME);
  if (!sheet) {
    sheet = withLock_(function () {
      let s = ss.getSheetByName(HOLIDAY_SHEET_NAME);
      if (s) return s;
      s = ss.insertSheet(HOLIDAY_SHEET_NAME);
      const rows = [['วันที่ (yyyy-mm-dd)', 'ชื่อวันหยุด']].concat(HOLIDAYS_SEED);
      s.getRange(1, 1, rows.length, 2).setNumberFormat('@').setValues(rows);
      s.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#0f6e8c').setFontColor('#ffffff');
      s.setFrozenRows(1);
      return s;
    });
  }
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const tz = Session.getScriptTimeZone();
  return sheet.getRange(2, 1, lastRow - 1, 2).getValues()
    .map(function (r) {
      const d = isDate_(r[0]) ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd') : String(r[0]).trim();
      return { date: d, name: String(r[1] || 'วันหยุด').trim() };
    })
    .filter(function (h) { return isValidDate_(h.date); });
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

function patternLabel_(key) {
  for (let i = 0; i < CBCT_PATTERNS.length; i++) if (CBCT_PATTERNS[i][0] === key) return CBCT_PATTERNS[i][1];
  return key;
}

function patternKey_(value) {
  for (let i = 0; i < CBCT_PATTERNS.length; i++) {
    if (CBCT_PATTERNS[i][0] === value || CBCT_PATTERNS[i][1] === value) return CBCT_PATTERNS[i][0];
  }
  return '';
}

function writeRow_(sheet, row, b) {
  const values = KEYS.map(function (k) {
    if (k === 'cbct') return b.cbct ? 'ทำ' : 'ไม่ทำ';
    if (k === 'cbctPattern') return patternLabel_(b.cbctPattern);
    if (LIST_KEYS.indexOf(k) !== -1) return (b[k] || []).join(', ');
    return b[k] === undefined || b[k] === null ? '' : String(b[k]);
  });
  sheet.getRange(row, 1, 1, KEYS.length).setNumberFormat('@').setValues([values]);
}

function isDate_(v) {
  return Object.prototype.toString.call(v) === '[object Date]';
}

function rowToBooking_(row) {
  const tz = Session.getScriptTimeZone();
  const b = {};
  KEYS.forEach(function (k, i) {
    let v = row[i];
    if (isDate_(v)) {
      // กันกรณีมีคนแก้ข้อมูลในชีตแล้วชีตแปลงเป็นวันที่/เวลา
      v = (k === 'time' || k === 'verifyTime') ? Utilities.formatDate(v, tz, 'HH:mm')
        : (k === 'startDate' || k === 'endDate' || k === 'verifyDate') ? Utilities.formatDate(v, tz, 'yyyy-MM-dd')
        : v.toISOString();
    }
    b[k] = v === null || v === undefined ? '' : String(v).trim();
  });
  LIST_KEYS.forEach(function (k) {
    b[k] = b[k] ? b[k].split(/[,\s]+/).filter(isValidDate_) : [];
  });
  b.cbct = b.cbct === 'ทำ' || b.cbct.toUpperCase() === 'TRUE';
  b.fractions = b.fractions === '' ? null : Number(b.fractions);
  b.duration = Number(b.duration) || 15;
  b.cbctPattern = patternKey_(b.cbctPattern);
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

function isTime_(t) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

// Returns a list of valid yyyy-mm-dd strings, or null if the value is malformed.
function dateList_(value, max) {
  if (value === undefined || value === null || value === '') return [];
  if (!Array.isArray(value) || value.length > max) return null;
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string' || !isValidDate_(value[i])) return null;
  }
  return value.slice();
}

function uniqueSorted_(list) {
  return list.filter(function (d, i) { return list.indexOf(d) === i; }).sort();
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
    fractions: input.fractions === '' || input.fractions == null ? null : Number(input.fractions),
    physician: text_(input.physician, 120),
    startDate: '',
    endDate: '',
    time: text_(input.time, 5),
    duration: input.duration === '' || input.duration == null ? 15 : Number(input.duration),
    treatmentDates: dateList_(input.treatmentDates, MAX_FRACTIONS),
    cbctPattern: text_(input.cbctPattern, 20) || 'none',
    cbctDates: dateList_(input.cbctDates, MAX_FRACTIONS),
    skipDates: dateList_(input.skipDates, 366),
    verifyDate: text_(input.verifyDate, 10),
    verifyTime: text_(input.verifyTime, 5),
    cbct: false,
    note: text_(input.note, 1000),
  };
  if (!b.hn) throw new Error('กรุณากรอก HN');
  if (!b.name) throw new Error('กรุณากรอกชื่อ-สกุลผู้ป่วย');
  if (TECHNIQUES.indexOf(b.technique) === -1) throw new Error('กรุณาเลือกเทคนิค');
  if (b.technique === 'อื่นๆ' && !b.techniqueOther) throw new Error('กรุณาระบุเทคนิคอื่นๆ');
  if (b.technique !== 'อื่นๆ') b.techniqueOther = '';
  if (!(Number.isInteger(b.fractions) && b.fractions >= 1 && b.fractions <= MAX_FRACTIONS)) {
    throw new Error('จำนวนครั้ง (Fx) ต้องเป็นจำนวนเต็ม 1–100');
  }
  if (b.site && SITES.indexOf(b.site) === -1) throw new Error('กรุณาเลือกตำแหน่งที่ฉายจากรายการ');
  if (PHYSICIANS.indexOf(b.physician) === -1) throw new Error('กรุณาเลือกแพทย์ผู้สั่ง');
  const dates = b.treatmentDates;
  if (!dates || dates.length === 0) throw new Error('กรุณาระบุวันเริ่มฉายรังสีและตารางวันฉาย');
  if (dates.length !== b.fractions) throw new Error('จำนวนวันฉายไม่ตรงกับจำนวนครั้ง (Fx)');
  for (let i = 1; i < dates.length; i++) {
    if (dates[i] <= dates[i - 1]) throw new Error('ตารางวันฉายต้องเรียงตามวันที่และไม่ซ้ำกัน');
  }
  if (b.time && !isTime_(b.time)) throw new Error('เวลานัดไม่ถูกต้อง');
  if (!(Number.isInteger(b.duration) && b.duration >= 5 && b.duration <= 240)) throw new Error('ระยะเวลาต่อครั้งต้องอยู่ระหว่าง 5–240 นาที');
  if (!patternKey_(b.cbctPattern)) throw new Error('รูปแบบ CBCT ไม่ถูกต้อง');
  if (!b.cbctDates || !b.cbctDates.every(function (d) { return dates.indexOf(d) !== -1; })) throw new Error('วันทำ CBCT ต้องเป็นวันฉาย');
  if (!b.skipDates) throw new Error('วันงดฉายไม่ถูกต้อง');
  if (b.verifyDate && !isValidDate_(b.verifyDate)) throw new Error('วันนัดทำ CBCT ไม่ถูกต้อง');
  if (b.verifyTime && !isTime_(b.verifyTime)) throw new Error('เวลานัดทำ CBCT ไม่ถูกต้อง');
  if (b.verifyTime && !b.verifyDate) throw new Error('กรุณาระบุวันนัดทำ CBCT');

  b.cbctDates = uniqueSorted_(b.cbctDates);
  b.skipDates = uniqueSorted_(b.skipDates);
  b.startDate = dates[0];
  b.endDate = dates[dates.length - 1];
  b.cbct = b.cbctDates.length > 0 || Boolean(b.verifyDate);
  return b;
}
