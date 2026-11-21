/**
 * ระบบเช็คอินกรณีเกิดภัยพิบัติ (Emergency Check-in)
 * ใช้ Google Sheets เป็นฐานข้อมูล + Google Apps Script Web App
 *
 * หน้าเว็บ:
 *   <WEB_APP_URL>?point=A          -> หน้าเช็คอินพนักงาน (ใส่ใน QR ที่จุดรวมพล)
 *   <WEB_APP_URL>?page=dashboard   -> หน้าผู้ควบคุมเหตุการณ์ (ต้องใช้ PIN)
 */

const SHEET = {
  EMP: 'Employees',
  SCAN: 'ScanLog',
  EVENTS: 'Events',
  CHECKINS: 'CheckIns',
  CONFIG: 'Config',
  QR: 'QR',
};

const HEADERS = {
  Employees: ['รหัสพนักงาน', 'ชื่อ-นามสกุล', 'แผนก', 'ชั้น/อาคาร', 'เบอร์โทร'],
  ScanLog: ['รหัสพนักงาน', 'วันเวลาที่สแกน', 'ประเภท (เข้า/ออก) - ไม่บังคับ'],
  Events: ['EventID', 'ประเภทเหตุ', 'เวลาเริ่ม', 'เวลาสิ้นสุด', 'สถานะ', 'หมายเหตุ'],
  CheckIns: ['EventID', 'รหัสพนักงาน', 'ชื่อ-นามสกุล', 'สถานะ', 'จุดรวมพล', 'เวลา', 'บันทึกโดย', 'หมายเหตุ'],
  Config: ['ตั้งค่า', 'ค่า', 'คำอธิบาย'],
};

const DEFAULT_CONFIG = [
  ['ADMIN_PIN', '1234', 'PIN สำหรับเข้าหน้า Dashboard (ควรเปลี่ยน)'],
  ['POINTS', 'A:ลานจอดรถด้านหน้า,B:สนามหญ้าด้านหลัง', 'จุดรวมพล รูปแบบ รหัส:ชื่อ คั่นด้วยจุลภาค'],
  ['USE_SCAN_LOG', 'TRUE', 'TRUE = นับเฉพาะคนที่สแกนนิ้ว/ใบหน้าเข้างานวันนี้ว่าอยู่ในอาคาร'],
  ['SCAN_LOOKBACK_HOURS', '16', 'ดูข้อมูลสแกนย้อนหลังกี่ชั่วโมง (รองรับกะดึกข้ามวัน)'],
];

const STATUS = { SAFE: 'SAFE', HELP: 'HELP', AWAY: 'AWAY' };

/* ------------------------------------------------------------------ */
/* ติดตั้งครั้งแรก: เลือกฟังก์ชัน setup แล้วกด Run                         */
/* ------------------------------------------------------------------ */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HEADERS).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  });
  const cfg = ss.getSheetByName(SHEET.CONFIG);
  if (cfg.getLastRow() === 1) {
    cfg.getRange(2, 1, DEFAULT_CONFIG.length, 3).setValues(DEFAULT_CONFIG);
  }
  // คอลัมน์รหัสพนักงานเป็นข้อความ ป้องกันเลข 0 นำหน้าหาย
  ss.getSheetByName(SHEET.EMP).getRange('A:A').setNumberFormat('@');
  ss.getSheetByName(SHEET.SCAN).getRange('A:A').setNumberFormat('@');
  safeAlert_('ติดตั้งเรียบร้อย\nวางรายชื่อพนักงานในชีต Employees แล้ว Deploy เป็น Web app');
}

/** สร้างชีต QR ที่มีลิงก์ + รูป QR ของแต่ละจุดรวมพล (รันหลัง Deploy) */
function generateQrSheet() {
  const url = ScriptApp.getService().getUrl();
  if (!url) throw new Error('ยังไม่ได้ Deploy เป็น Web app');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET.QR) || ss.insertSheet(SHEET.QR);
  sh.clear();
  const rows = [['จุดรวมพล', 'ลิงก์', 'QR Code']];
  getPoints_().forEach(function (p) {
    const link = url + '?point=' + encodeURIComponent(p.code);
    rows.push([p.code + ' - ' + p.name, link,
      '=IMAGE("https://quickchart.io/qr?size=300&text=" & ENCODEURL(B' + (rows.length + 1) + '))']);
  });
  rows.push(['Dashboard (ผู้ควบคุม)', url + '?page=dashboard', '']);
  sh.getRange(1, 1, rows.length, 3).setValues(rows);
  sh.setColumnWidth(3, 220);
  for (let r = 2; r <= rows.length; r++) sh.setRowHeight(r, 220);
  safeAlert_('สร้างชีต QR แล้ว พิมพ์ไปติดที่จุดรวมพลได้เลย');
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🚨 เช็คอินฉุกเฉิน')
    .addItem('ติดตั้ง / สร้างชีต', 'setup')
    .addItem('สร้าง QR Code จุดรวมพล', 'generateQrSheet')
    .addItem('ล้างแคชรายชื่อพนักงาน', 'clearCache')
    .addToUi();
}

function clearCache() {
  CacheService.getScriptCache().remove('employees');
}

/* ------------------------------------------------------------------ */
/* Web app                                                             */
/* ------------------------------------------------------------------ */
function doGet(e) {
  const p = (e && e.parameter) || {};
  const isDash = p.page === 'dashboard';
  const t = HtmlService.createTemplateFromFile(isDash ? 'Dashboard' : 'CheckIn');
  t.point = p.point || '';
  return t.evaluate()
    .setTitle(isDash ? 'Dashboard เหตุฉุกเฉิน' : 'เช็คอินฉุกเฉิน')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ---------- เรียกจากหน้าเช็คอิน ---------- */

/** ข้อมูลเริ่มต้นของหน้าเช็คอิน */
function getCheckInData() {
  return {
    employees: getEmployees_().map(function (e) { return [e.id, e.name, e.dept]; }),
    points: getPoints_(),
  };
}

/**
 * พนักงานเช็คอิน
 * payload: { empId, status: 'SAFE'|'HELP', point, by: 'SELF'|'BUDDY', note }
 */
function checkIn(payload) {
  const emp = findEmployee_(payload.empId);
  if (!emp) throw new Error('ไม่พบรหัสพนักงาน ' + payload.empId);
  const status = payload.status === STATUS.HELP ? STATUS.HELP : STATUS.SAFE;
  const by = payload.by === 'BUDDY' ? 'BUDDY' : 'SELF';
  const eventId = getOrCreateActiveEvent_();
  appendCheckIn_(eventId, emp, status, payload.point, by, payload.note);
  return { ok: true, name: emp.name, status: status, time: fmt_(new Date()) };
}

/* ---------- เรียกจากหน้า Dashboard (ต้องมี PIN) ---------- */

function getDashboard(pin) {
  checkPin_(pin);
  const props = PropertiesService.getScriptProperties();
  const activeId = props.getProperty('ACTIVE_EVENT_ID');
  const events = readRows_(SHEET.EVENTS);
  // ถ้าไม่มีเหตุการณ์ที่กำลังเกิด ให้แสดงเหตุการณ์ล่าสุด
  const evRow = activeId
    ? events.filter(function (r) { return String(r[0]) === activeId; })[0]
    : events[events.length - 1];
  const event = evRow ? {
    id: String(evRow[0]), type: evRow[1], start: fmt_(evRow[2]),
    end: evRow[3] ? fmt_(evRow[3]) : '', active: evRow[4] === 'ACTIVE',
  } : null;

  // สถานะล่าสุดของแต่ละคนในเหตุการณ์นี้
  const latest = {};
  if (event) {
    readRows_(SHEET.CHECKINS).forEach(function (r) {
      if (String(r[0]) !== event.id) return;
      latest[String(r[1]).trim()] = { status: r[3], point: r[4], time: fmt_(r[5]), by: r[6], note: r[7] };
    });
  }

  const scan = getPresentFromScan_();
  const employees = getEmployees_();
  const list = employees.map(function (e) {
    const c = latest[e.id];
    const inBuilding = scan.enabled ? !!scan.present[e.id] : true;
    let state;
    if (c) state = c.status;                   // SAFE / HELP / AWAY
    else if (inBuilding) state = 'MISSING';    // อยู่ในอาคารแต่ยังไม่เช็คอิน
    else state = 'NOT_IN';                     // ไม่ได้สแกนเข้างานวันนี้
    return {
      id: e.id, name: e.name, dept: e.dept, floor: e.floor, phone: e.phone,
      state: state, inBuilding: inBuilding,
      scanTime: scan.present[e.id] || '',
      point: c ? c.point : '', time: c ? c.time : '', by: c ? c.by : '', note: c ? c.note : '',
    };
  });

  const count = { SAFE: 0, HELP: 0, MISSING: 0, AWAY: 0, NOT_IN: 0 };
  list.forEach(function (x) { count[x.state]++; });

  return {
    event: event, list: list, count: count,
    expected: count.SAFE + count.HELP + count.MISSING,
    scanEnabled: scan.enabled, scanNote: scan.note,
    points: getPoints_(), serverTime: fmt_(new Date()),
  };
}

function startEvent(pin, type, note) {
  checkPin_(pin);
  return withLock_(function () {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('ACTIVE_EVENT_ID')) throw new Error('มีเหตุการณ์ที่ยังไม่ปิดอยู่');
    return createEvent_(type || 'ไฟไหม้', note || '');
  });
}

function closeEvent(pin) {
  checkPin_(pin);
  return withLock_(function () {
    const props = PropertiesService.getScriptProperties();
    const id = props.getProperty('ACTIVE_EVENT_ID');
    if (!id) return { ok: true };
    const sh = sheet_(SHEET.EVENTS);
    const ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === id) {
        sh.getRange(i + 2, 4, 1, 2).setValues([[new Date(), 'CLOSED']]);
        break;
      }
    }
    props.deleteProperty('ACTIVE_EVENT_ID');
    return { ok: true };
  });
}

/** ผู้ควบคุมบันทึกสถานะแทน (SAFE / HELP / AWAY = ไม่อยู่ในพื้นที่) */
function staffCheckIn(pin, empId, status, point, note) {
  checkPin_(pin);
  const emp = findEmployee_(empId);
  if (!emp) throw new Error('ไม่พบรหัสพนักงาน');
  if ([STATUS.SAFE, STATUS.HELP, STATUS.AWAY].indexOf(status) < 0) throw new Error('สถานะไม่ถูกต้อง');
  const eventId = getOrCreateActiveEvent_();
  appendCheckIn_(eventId, emp, status, point || 'STAFF', 'STAFF', note);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* ภายใน                                                               */
/* ------------------------------------------------------------------ */
function sheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('ไม่พบชีต ' + name + ' (กรุณารัน setup)');
  return sh;
}

function readRows_(name) {
  const sh = sheet_(name);
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, sh.getLastColumn()).getValues();
}

function getConfig_() {
  const cfg = {};
  readRows_(SHEET.CONFIG).forEach(function (r) { if (r[0]) cfg[String(r[0]).trim()] = String(r[1]).trim(); });
  return cfg;
}

function getPoints_() {
  const raw = getConfig_().POINTS || 'A:จุดรวมพล A';
  return raw.split(',').map(function (s) {
    const parts = s.split(':');
    const code = parts[0].trim();
    return { code: code, name: (parts[1] || code).trim() };
  }).filter(function (p) { return p.code; });
}

function getEmployees_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('employees');
  if (hit) return JSON.parse(hit);
  const list = readRows_(SHEET.EMP)
    .filter(function (r) { return String(r[0]).trim() && String(r[1]).trim(); })
    .map(function (r) {
      return {
        id: String(r[0]).trim(), name: String(r[1]).trim(),
        dept: String(r[2] || '').trim(), floor: String(r[3] || '').trim(), phone: String(r[4] || '').trim(),
      };
    });
  try { cache.put('employees', JSON.stringify(list), 600); } catch (err) { /* เกินขนาดแคช */ }
  return list;
}

function findEmployee_(id) {
  id = String(id || '').trim();
  return getEmployees_().filter(function (e) { return e.id === id; })[0] || null;
}

/** อ่านข้อมูลสแกนนิ้ว/ใบหน้า: คืนรายชื่อคนที่ (น่าจะ) อยู่ในอาคาร */
function getPresentFromScan_() {
  const cfg = getConfig_();
  const result = { enabled: false, present: {}, note: '' };
  if (String(cfg.USE_SCAN_LOG).toUpperCase() !== 'TRUE') {
    result.note = 'ปิดการใช้ข้อมูลสแกน: นับพนักงานทุกคน';
    return result;
  }
  const hours = Number(cfg.SCAN_LOOKBACK_HOURS) || 16;
  const since = new Date(Date.now() - hours * 3600 * 1000);
  const last = {}; // id -> {t, out}
  readRows_(SHEET.SCAN).forEach(function (r) {
    const id = String(r[0]).trim();
    const t = toDate_(r[1]);
    if (!id || !t || t < since) return;
    const out = /ออก|out/i.test(String(r[2] || ''));
    if (!last[id] || t > last[id].t) last[id] = { t: t, out: out };
  });
  Object.keys(last).forEach(function (id) {
    if (!last[id].out) result.present[id] = fmt_(last[id].t);
  });
  const n = Object.keys(result.present).length;
  if (n === 0) {
    result.note = 'ไม่พบข้อมูลสแกนใน ' + hours + ' ชม.ล่าสุด: นับพนักงานทุกคนแทน';
    return result; // ไม่มีข้อมูล -> ปลอดภัยไว้ก่อน นับทุกคน
  }
  result.enabled = true;
  result.note = 'อ้างอิงข้อมูลสแกนนิ้ว/ใบหน้า ' + hours + ' ชม.ล่าสุด (' + n + ' คนอยู่ในอาคาร)';
  return result;
}

function toDate_(v) {
  if (v instanceof Date) return v;
  if (!v) return null;
  // รองรับ "2026-11-21 08:01" หรือ "21/11/2026 08:01" (ปี พ.ศ. จะถูกแปลงเป็น ค.ศ.)
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})/);
  if (m) return new Date(fixYear_(+m[1]), +m[2] - 1, +m[3], +m[4], +m[5]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (m) return new Date(fixYear_(+m[3]), +m[2] - 1, +m[1], +m[4], +m[5]);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function fixYear_(y) { return y > 2400 ? y - 543 : y; }

function getOrCreateActiveEvent_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ACTIVE_EVENT_ID');
  if (id) return id;
  // พนักงานเช็คอินก่อนผู้ควบคุมกดเริ่มเหตุการณ์ -> สร้างให้อัตโนมัติ
  return withLock_(function () {
    return props.getProperty('ACTIVE_EVENT_ID') || createEvent_('ไม่ระบุ (เริ่มอัตโนมัติ)', '').id;
  });
}

function createEvent_(type, note) {
  const id = 'EV' + Utilities.formatDate(new Date(), tz_(), 'yyyyMMdd-HHmmss');
  sheet_(SHEET.EVENTS).appendRow([id, type, new Date(), '', 'ACTIVE', note]);
  PropertiesService.getScriptProperties().setProperty('ACTIVE_EVENT_ID', id);
  return { ok: true, id: id };
}

function appendCheckIn_(eventId, emp, status, point, by, note) {
  sheet_(SHEET.CHECKINS).appendRow([
    eventId, "'" + emp.id, emp.name, status, String(point || ''), new Date(), by, String(note || '').slice(0, 200),
  ]);
}

function checkPin_(pin) {
  if (String(pin) !== String(getConfig_().ADMIN_PIN)) throw new Error('PIN ไม่ถูกต้อง');
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function tz_() { return Session.getScriptTimeZone() || 'Asia/Bangkok'; }

function fmt_(d) {
  d = toDate_(d);
  return d ? Utilities.formatDate(d, tz_(), 'dd/MM HH:mm:ss') : '';
}

function safeAlert_(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
