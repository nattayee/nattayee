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
 *
 * การเข้าสู่ระบบ: ใช้บัญชีของ LPCH RO Workspace (AUTH_API_URL)
 * - เปิดจากปุ่ม/เมนูใน Workspace ที่ตั้ง "เข้าสู่ระบบอัตโนมัติ" → เข้าได้ทันที (?sso=<บัตรผ่าน>)
 * - เปิดลิงก์นี้ตรงๆ → กรอกชื่อผู้ใช้และรหัสผ่านของ Workspace
 * - Workspace ต้อง Deploy แบบ Who has access: Anyone (เพื่อให้สคริปต์นี้เรียก API ได้)
 * - หลังวางโค้ดครั้งแรก ให้เลือกฟังก์ชัน setup แล้วกด Run หนึ่งครั้ง เพื่ออนุญาตสิทธิ์เชื่อมต่อภายนอก
 */
const SPREADSHEET_ID = '';
// เว็บแอป LPCH RO Workspace (.../exec) ที่ใช้ตรวจชื่อผู้ใช้ รหัสผ่าน และบัตรผ่าน SSO
const AUTH_API_URL = 'https://script.google.com/macros/s/AKfycbwVlM9oxgSQMjjvc3mi39aGbIH4vEkaaUpSNWs4dd9oJHotjpfcyJMVBi5XcUFSAAM2/exec';
const AUTH_CACHE_SECONDS = 600;   // ตรวจสถานะบัญชีกับ Workspace ซ้ำทุก 10 นาที
const SHEET_NAME = 'นัดเทคนิคพิเศษ';
const HOLIDAY_SHEET_NAME = 'วันหยุด';
const AUTO_SPREADSHEET_TITLE = 'ระบบนัดคิวเทคนิคพิเศษ รังสีรักษา รพ.มะเร็งลำปาง';
const TECHNIQUES = ['DIBH', 'SRS', 'SRT', 'SBRT', 'อื่นๆ'];
const CBCT_PATTERNS = [
  ['first3_weekly', '3 ครั้งแรก แล้วสัปดาห์ละครั้ง'],
  ['dibh', 'Fx 1, 2, 3, 6, 11 (Breast DIBH)'],
  ['weekly', 'สัปดาห์ละครั้ง'],
  ['daily', 'ทุกครั้ง'],
  ['first', 'เฉพาะครั้งแรก'],
  ['none', 'ไม่ทำ CBCT ระหว่างฉาย'],
  ['custom', 'กำหนดเอง (เลือกในตาราง)'],
];
const FREQUENCIES = [
  ['daily', 'Daily (ทุกวันทำการ)'],
  ['eod', 'EOD (วันเว้นวัน)'],
  ['bid', 'BID (วันละ 2 ครั้ง)'],
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
  ['frequency', 'ความถี่ในการฉาย'],
  ['time2', 'เวลานัดรอบ 2 (BID)'],
  ['cbctFx', 'Fx ที่ทำ CBCT'],
  ['createdBy', 'บันทึกโดย'],
  ['updatedBy', 'แก้ไขล่าสุดโดย'],
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
// ทุกฟังก์ชันที่อ่าน/เขียนข้อมูลรับ token ของ LPCH RO Workspace เป็นอาร์กิวเมนต์แรก

/** Run once from the editor after pasting: grants permissions and checks the Workspace connection. */
function setup() {
  const ss = getSpreadsheet_();
  getSheet_(ss);
  listHolidays_(ss);
  const res = UrlFetchApp.fetch(AUTH_API_URL, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ action: 'me', token: '' }), muteHttpExceptions: true,
  });
  let ok = false;
  try { ok = JSON.parse(res.getContentText()).error === 'session_expired'; } catch (e) { /* not JSON */ }
  Logger.log('ชีตข้อมูล: ' + ss.getUrl());
  Logger.log(ok ? 'เชื่อมต่อ LPCH RO Workspace ได้' :
    'เชื่อมต่อ LPCH RO Workspace ไม่ได้ (HTTP ' + res.getResponseCode() + ') — ตรวจ AUTH_API_URL และให้ Workspace Deploy แบบ Who has access: Anyone');
}

function login(username, password) {
  const out = authCall_({ action: 'login', username: String(username || ''), password: String(password || '') });
  return { token: out.token, user: rememberUser_(out.token, out.user) };
}

/** Exchanges a one-time ticket from LPCH RO Workspace (?sso=…) for a session. */
function ssoLogin(ticket) {
  const out = authCall_({ action: 'ssoRedeem', ticket: String(ticket || '') });
  return { token: out.token, user: rememberUser_(out.token, out.user) };
}

function logout(token) {
  if (!token) return true;
  CacheService.getScriptCache().remove(authKey_(token));
  try { authCall_({ action: 'logout', token: String(token) }); } catch (e) { /* already gone */ }
  return true;
}

function getInitData(token) {
  const user = requireUser_(token);
  const ss = getSpreadsheet_();
  return { user: user, bookings: readBookings_(ss), holidays: listHolidays_(ss), sheetUrl: ss.getUrl() };
}

function listBookings(token) {
  requireUser_(token);
  return readBookings_(getSpreadsheet_());
}

function createBooking(token, input) {
  const by = userLabel_(requireUser_(token));
  const booking = validate_(input);
  const ss = getSpreadsheet_();
  return withLock_(function () {
    const sheet = getSheet_(ss, true);
    const now = new Date().toISOString();
    booking.id = Utilities.getUuid();
    booking.createdAt = now;
    booking.updatedAt = now;
    booking.createdBy = by;
    booking.updatedBy = by;
    writeRow_(sheet, sheet.getLastRow() + 1, booking);
    return booking;
  });
}

function updateBooking(token, id, input) {
  const by = userLabel_(requireUser_(token));
  const booking = validate_(input);
  const ss = getSpreadsheet_();
  return withLock_(function () {
    const sheet = getSheet_(ss, true);
    const row = findRow_(sheet, id);
    const existing = rowToBooking_(sheet.getRange(row, 1, 1, KEYS.length).getValues()[0]);
    booking.id = id;
    booking.createdAt = existing.createdAt;
    booking.createdBy = existing.createdBy;
    booking.updatedAt = new Date().toISOString();
    booking.updatedBy = by;
    writeRow_(sheet, row, booking);
    return booking;
  });
}

function deleteBooking(token, id) {
  requireUser_(token);
  const ss = getSpreadsheet_();
  return withLock_(function () {
    const sheet = getSheet_(ss, true);
    sheet.deleteRow(findRow_(sheet, id));
    return true;
  });
}

// ---------- sign-in via LPCH RO Workspace ----------

/** POSTs an action to the Workspace JSON API; throws its Thai error message (or 'session_expired'). */
function authCall_(req) {
  let res;
  try {
    res = UrlFetchApp.fetch(AUTH_API_URL, {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(req), muteHttpExceptions: true,
    });
  } catch (e) {
    throw new Error('เชื่อมต่อระบบล็อกอิน LPCH RO Workspace ไม่ได้ กรุณาลองใหม่');
  }
  let out;
  try {
    out = JSON.parse(res.getContentText());
  } catch (e) {
    throw new Error('ระบบล็อกอิน LPCH RO Workspace ตอบกลับไม่ถูกต้อง (ผู้ดูแลระบบ: ตรวจ AUTH_API_URL และให้ Workspace Deploy แบบ Who has access: Anyone)');
  }
  if (!out || !out.ok) throw new Error((out && out.error) || 'เข้าสู่ระบบไม่สำเร็จ');
  return out;
}

function authKey_(token) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token), Utilities.Charset.UTF_8);
  return 'auth_' + Utilities.base64EncodeWebSafe(digest);
}

function rememberUser_(token, user) {
  const u = { username: String(user.username || ''), fullName: String(user.fullName || user.username || ''),
    role: String(user.role || ''), isAdmin: !!user.isAdmin };
  CacheService.getScriptCache().put(authKey_(token), JSON.stringify(u), AUTH_CACHE_SECONDS);
  return u;
}

/** The signed-in user for a Workspace token (checked with the Workspace at most every AUTH_CACHE_SECONDS). */
function requireUser_(token) {
  if (!token) throw new Error('session_expired');
  const hit = CacheService.getScriptCache().get(authKey_(token));
  if (hit) return JSON.parse(hit);
  const out = authCall_({ action: 'me', token: String(token) });
  return rememberUser_(token, out.user);
}

function userLabel_(u) {
  return u.fullName + (u.role ? ' (' + u.role + ')' : '') + ' · ' + u.username;
}

function readBookings_(ss) {
  const sheet = getSheet_(ss);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, KEYS.length).getValues()
    .filter(function (row) { return row[0]; })
    .map(rowToBooking_);
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

/**
 * The bookings sheet with up-to-date headers. Creating it or rewriting the headers happens under the
 * script lock, so two people opening the page at once cannot both create it. Pass locked = true when
 * the caller already holds the lock (create/update/delete).
 */
function getSheet_(ss, locked) {
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (sheet && headersOk_(sheet)) return sheet;
  return locked ? prepareSheet_(ss) : withLock_(function () { return prepareSheet_(ss); });
}

function headersOk_(sheet) {
  const current = sheet.getRange(1, 1, 1, COLUMNS.length).getValues()[0];
  return current.join('|') === COLUMNS.map(function (c) { return c[1]; }).join('|');
}

function prepareSheet_(ss) {
  let sheet = ss.getSheetByName(SHEET_NAME);   // re-check: another request may have just created it
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.setFrozenRows(1);
    // เก็บทุกช่องเป็นข้อความ เพื่อไม่ให้ชีตแปลงวันที่/เวลา หรือตัดเลข 0 หน้า HN
    sheet.getRange(1, 1, sheet.getMaxRows(), COLUMNS.length).setNumberFormat('@');
  }
  // สร้าง/อัปเดตหัวตาราง (รองรับชีตจากเวอร์ชันเก่าที่มีคอลัมน์น้อยกว่า)
  if (!headersOk_(sheet)) {
    sheet.getRange(1, 1, 1, COLUMNS.length)
      .setNumberFormat('@')
      .setValues([COLUMNS.map(function (c) { return c[1]; })])
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

// [key, label] lists are stored in the sheet by label so the sheet is readable
function labelOf_(list, key) {
  for (let i = 0; i < list.length; i++) if (list[i][0] === key) return list[i][1];
  return key;
}

function keyOf_(list, value) {
  for (let i = 0; i < list.length; i++) {
    if (list[i][0] === value || list[i][1] === value) return list[i][0];
  }
  return '';
}

function patternKey_(value) {
  return keyOf_(CBCT_PATTERNS, value);
}

function writeRow_(sheet, row, b) {
  const values = KEYS.map(function (k) {
    if (k === 'cbct') return b.cbct ? 'ทำ' : 'ไม่ทำ';
    if (k === 'cbctPattern') return labelOf_(CBCT_PATTERNS, b.cbctPattern);
    if (k === 'frequency') return labelOf_(FREQUENCIES, b.frequency);
    if (k === 'cbctFx') return (b.cbctFx || []).join(', ');
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
      v = (k === 'time' || k === 'time2' || k === 'verifyTime') ? Utilities.formatDate(v, tz, 'HH:mm')
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
  b.frequency = keyOf_(FREQUENCIES, b.frequency) || 'daily';
  b.cbctFx = b.cbctFx ? b.cbctFx.split(/[,\s]+/).map(Number).filter(function (n) { return n > 0; }) : [];
  if (!b.cbctFx.length && b.cbctDates.length) {
    // rows saved before CBCT was stored per Fx
    b.cbctFx = b.cbctDates.map(function (d) { return b.treatmentDates.indexOf(d) + 1; }).filter(function (n) { return n > 0; });
  }
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
    frequency: text_(input.frequency, 10) || 'daily',
    time: text_(input.time, 5),
    time2: text_(input.time2, 5),
    duration: input.duration === '' || input.duration == null ? 15 : Number(input.duration),
    treatmentDates: dateList_(input.treatmentDates, MAX_FRACTIONS),
    cbctPattern: text_(input.cbctPattern, 20) || 'none',
    cbctFx: null,
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
  if (!keyOf_(FREQUENCIES, b.frequency)) throw new Error('ความถี่ในการฉายไม่ถูกต้อง');
  b.frequency = keyOf_(FREQUENCIES, b.frequency);
  // per-Fx dates: ascending, and at most 2 Fx on a day (only for BID)
  for (let i = 1; i < dates.length; i++) {
    if (dates[i] < dates[i - 1]) throw new Error('ตารางวันฉายต้องเรียงตามวันที่');
    if (dates[i] === dates[i - 1] && (b.frequency !== 'bid' || (i > 1 && dates[i - 2] === dates[i]))) {
      throw new Error(b.frequency === 'bid' ? 'BID ฉายได้ไม่เกินวันละ 2 ครั้ง' : 'ตารางวันฉายต้องไม่มีวันซ้ำ (ยกเว้น BID)');
    }
  }
  if (b.time && !isTime_(b.time)) throw new Error('เวลานัดไม่ถูกต้อง');
  if (b.frequency !== 'bid') b.time2 = '';
  if (b.time2 && !isTime_(b.time2)) throw new Error('เวลานัดรอบ 2 ไม่ถูกต้อง');
  if (b.time2 && b.time && b.time2 <= b.time) throw new Error('เวลานัดรอบ 2 ต้องอยู่หลังรอบ 1');
  if (!(Number.isInteger(b.duration) && b.duration >= 5 && b.duration <= 240)) throw new Error('ระยะเวลาต่อครั้งต้องอยู่ระหว่าง 5–240 นาที');
  if (!patternKey_(b.cbctPattern)) throw new Error('รูปแบบ CBCT ไม่ถูกต้อง');
  if (Array.isArray(input.cbctFx)) {
    b.cbctFx = input.cbctFx.map(Number);
    if (!b.cbctFx.every(function (fx) { return Number.isInteger(fx) && fx >= 1 && fx <= dates.length; })) throw new Error('Fx ที่ทำ CBCT ไม่ถูกต้อง');
  } else {
    if (!b.cbctDates || !b.cbctDates.every(function (d) { return dates.indexOf(d) !== -1; })) throw new Error('วันทำ CBCT ต้องเป็นวันฉาย');
    b.cbctFx = b.cbctDates.map(function (d) { return dates.indexOf(d) + 1; });
  }
  if (!b.skipDates) throw new Error('วันงดฉายไม่ถูกต้อง');
  if (b.verifyDate && !isValidDate_(b.verifyDate)) throw new Error('วันนัดทำ CBCT ไม่ถูกต้อง');
  if (b.verifyTime && !isTime_(b.verifyTime)) throw new Error('เวลานัดทำ CBCT ไม่ถูกต้อง');
  if (b.verifyTime && !b.verifyDate) throw new Error('กรุณาระบุวันนัดทำ CBCT');

  b.cbctFx = b.cbctFx.filter(function (fx, i) { return b.cbctFx.indexOf(fx) === i; }).sort(function (x, y) { return x - y; });
  b.cbctDates = uniqueSorted_(b.cbctFx.map(function (fx) { return dates[fx - 1]; }));
  b.skipDates = uniqueSorted_(b.skipDates);
  b.startDate = dates[0];
  b.endDate = dates[dates.length - 1];
  b.cbct = b.cbctFx.length > 0 || Boolean(b.verifyDate);
  return b;
}
