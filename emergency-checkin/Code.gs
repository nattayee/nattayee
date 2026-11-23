// ไฟล์ Code.gs · โค้ดฝั่งเซิร์ฟเวอร์ (ไฟล์นี้ต้องขึ้นต้นด้วยบรรทัดนี้ ถ้าบรรทัดแรกเป็น <!-- แปลว่าวางไฟล์ HTML ผิดที่)
/**
 * ระบบเช็คอินกรณีเกิดภัยพิบัติ (Emergency Check-in)
 * ใช้ Google Sheets เป็นฐานข้อมูล + Google Apps Script Web App
 *
 * รายชื่อเจ้าหน้าที่อ่านจากชีตโซน (ชื่อชีตขึ้นต้นด้วย "โซน") ที่มีอยู่แล้ว:
 *   แถวหัวหน่วยงาน (merge A:F)  |  แถวหัวตาราง: สถานะ | ชื่อ-สกุล | ตำแหน่ง | (เบอร์โทร) | (รหัสพนักงาน)
 *   - ตอนนี้ใช้ "ชื่อ-สกุล" เป็นตัวระบุตัวคน
 *   - เมื่อเพิ่มคอลัมน์ที่หัวตารางมีคำว่า "รหัส" (เช่น "รหัสพนักงาน") ระบบจะใช้รหัสแทนโดยอัตโนมัติ
 *   - ผลการเช็คอินจะเขียนกลับลงคอลัมน์ "สถานะ" เดิม (อยู่ / ลา / ไม่ทราบ)
 *
 * หน้าเว็บ:
 *   <WEB_APP_URL>?point=A          -> หน้าเช็คอิน (ใส่ใน QR ที่จุดรวมพล)
 *   <WEB_APP_URL>?page=dashboard   -> หน้าผู้ควบคุมเหตุการณ์ (ต้องใช้ PIN)
 */

// ชื่อเว็บและโลโก้ (แสดงบนแท็บเบราว์เซอร์และหัวหน้าเว็บ)
const APP_NAME = 'ศูนย์ควบคุมการอพยพ รพ.มะเร็งลำปาง';
const APP_SHORT = 'ศูนย์ควบคุมการอพยพ';
const ORG_NAME = 'รพ.มะเร็งลำปาง';
const FAVICON_URL = 'https://www.lpch.go.th/favicon.ico';

const SHEET = {
  ROLES: 'Roles',
  SCAN: 'ScanLog',
  EVENTS: 'Events',
  CHECKINS: 'CheckIns',
  CONFIG: 'Config',
  QR: 'QR',
};

const HEADERS = {
  Roles: ['ชื่อ-สกุล', 'บทบาท', 'เลขบัตรประชาชน 6 หลักท้าย (ใช้เป็น PIN)', 'หมายเหตุ'],
  ScanLog: ['รหัสพนักงาน', 'วันเวลาที่สแกน', 'ประเภท (เข้า/ออก) - ไม่บังคับ'],
  Events: ['EventID', 'ประเภทเหตุ', 'เวลาเริ่ม', 'เวลาสิ้นสุด', 'สถานะ', 'หมายเหตุ', 'ผู้ประกาศเหตุ', 'ผู้ปิดเหตุ'],
  CheckIns: ['EventID', 'รหัส/ชื่อ (ตัวระบุ)', 'ชื่อ-สกุล', 'สถานะ', 'จุดรวมพล', 'เวลา', 'บันทึกโดย', 'หมายเหตุ'],
  Config: ['ตั้งค่า', 'ค่า', 'คำอธิบาย'],
};

const DEFAULT_CONFIG = [
  ['ADMIN_PIN', '1234', 'PIN สำรอง ใช้ได้เฉพาะตอนที่ชีต Roles ยังไม่มีรายชื่อ (หลังตั้ง Roles แล้วใช้ไม่ได้)'],
  ['POINTS', 'A:จุดรวมพล 1,B:จุดรวมพล 2', 'จุดรวมพล รูปแบบ รหัส:ชื่อ คั่นด้วยจุลภาค'],
  ['ZONE_SHEET_PREFIX', 'โซน', 'ชีตที่ชื่อขึ้นต้นด้วยคำนี้ถือเป็นรายชื่อเจ้าหน้าที่'],
  ['SYNC_ZONE_STATUS', 'TRUE', 'TRUE = เขียนผลเช็คอินกลับลงคอลัมน์ "สถานะ" ในชีตโซน'],
  ['USE_SCAN_LOG', 'FALSE', 'TRUE = ใช้ข้อมูลสแกนนิ้ว/ใบหน้า (ต้องมีรหัสพนักงานในชีตโซนก่อน)'],
  ['SCAN_LOOKBACK_HOURS', '16', 'ดูข้อมูลสแกนย้อนหลังกี่ชั่วโมง (รองรับเวรดึกข้ามวัน)'],
  ['WEB_APP_URL', '', 'ลิงก์ Web app ที่ลงท้ายด้วย /exec (คัดลอกจากหน้าต่าง Deploy) ใช้สร้าง QR'],
];

const STATUS = { SAFE: 'SAFE', HELP: 'HELP', AWAY: 'AWAY' };
// บทบาทในชีต Roles: ผู้บัญชาการ / รองผู้บัญชาการ เปิด-ปิดเหตุได้, เจ้าหน้าที่ศูนย์ ดูและบันทึกสถานะแทนได้
const ROLE = { COMMANDER: 'ผู้บัญชาการ', DEPUTY: 'รองผู้บัญชาการ', OFFICER: 'เจ้าหน้าที่ศูนย์' };
const AUTO_EVENT_TYPE = 'ไม่ระบุ (เริ่มอัตโนมัติ)';
// ค่าในคอลัมน์ "สถานะ" ของชีตโซน
const ZONE_TEXT = { PRESENT: 'อยู่', LEAVE: 'ลา', UNKNOWN: 'ไม่ทราบ' };

/* ------------------------------------------------------------------ */
/* ติดตั้งครั้งแรก: เลือกฟังก์ชัน setup แล้วกด Run                         */
/* ------------------------------------------------------------------ */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HEADERS).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name, ss.getNumSheets()); // ต่อท้าย ไม่แทรกหน้าชีตโซน
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  });
  const cfg = ss.getSheetByName(SHEET.CONFIG);
  if (cfg.getLastRow() === 1) {
    cfg.getRange(2, 1, DEFAULT_CONFIG.length, 3).setValues(DEFAULT_CONFIG);
  } else {
    // เพิ่มค่าตั้งใหม่ที่ยังไม่มี (กรณีอัปเดตจากเวอร์ชันเก่า)
    const have = getConfig_();
    DEFAULT_CONFIG.forEach(function (r) { if (!(r[0] in have)) cfg.appendRow(r); });
  }
  CFG_MEMO_ = null;
  ss.getSheetByName(SHEET.SCAN).getRange('A:A').setNumberFormat('@');
  // ชีต Events จากเวอร์ชันเก่า: เพิ่มหัวคอลัมน์ผู้ประกาศ/ผู้ปิดเหตุ
  ss.getSheetByName(SHEET.EVENTS).getRange(1, 1, 1, HEADERS.Events.length).setValues([HEADERS.Events]).setFontWeight('bold');
  setupRoles_(ss.getSheetByName(SHEET.ROLES));
  clearCache();
  const emps = loadEmployees_();
  getEmployees_();   // อุ่นแคชรายชื่อไว้ หน้าเว็บจะเปิดเร็วตั้งแต่ครั้งแรก
  const zones = {};
  emps.forEach(function (e) { e.zone.split(', ').forEach(function (z) { zones[z] = (zones[z] || 0) + 1; }); });
  safeAlert_('ติดตั้งเรียบร้อย\nพบเจ้าหน้าที่ ' + emps.length + ' คน\n' +
    Object.keys(zones).map(function (z) { return '• ' + z + ': ' + zones[z] + ' คน'; }).join('\n') +
    '\n\nขั้นต่อไป: ใส่ชื่อผู้บัญชาการและผู้ทำหน้าที่แทนในชีต Roles แล้ว Deploy เป็น Web app');
}

/**
 * ชีต Roles: ชื่อ-สกุล | บทบาท | เลขบัตรประชาชน 6 หลักท้าย (ใช้เป็น PIN) | หมายเหตุ
 * คอลัมน์ C ใส่ได้ทั้งพิมพ์เอง วางค่า หรือสูตรที่ดึงจากที่อื่น เช่น =RIGHT(VLOOKUP(A2, 'ข้อมูลบุคลากร'!B:C, 2, FALSE), 6)
 * ใส่เลข 13 หลักได้ ระบบใช้ 6 หลักท้าย (แนะนำให้เก็บแค่ 6 หลัก เพื่อไม่ให้เลขบัตรเต็มอยู่ในชีต)
 */
function setupRoles_(sh) {
  sh.getRange(1, 1, 1, HEADERS.Roles.length).setValues([HEADERS.Roles]).setFontWeight('bold');
  sh.getRange('C:C').setNumberFormat('@');   // เก็บเป็นข้อความ เลข 0 นำหน้าไม่หาย
  sh.getRange(2, 2, 200, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList([ROLE.COMMANDER, ROLE.DEPUTY, ROLE.OFFICER], true).setAllowInvalid(false).build());
  // เตือน (ไม่บล็อก) ถ้าไม่ใช่ 6 หรือ 13 หลัก เพื่อให้ใช้สูตรดึงข้อมูลได้
  sh.getRange(2, 3, 200, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireFormulaSatisfied('=OR(C2="", REGEXMATCH(REGEXREPLACE(TO_TEXT(C2), "[^0-9]", ""), "^([0-9]{6}|[0-9]{13})$"))')
    .setAllowInvalid(true).setHelpText('ใส่เลข 6 หลักท้ายของบัตรประชาชน เช่น 890123').build());
  sh.setColumnWidth(1, 260); sh.setColumnWidth(2, 140); sh.setColumnWidth(3, 260); sh.setColumnWidth(4, 340);
  if (sh.getLastRow() > 1) { checkRolePins_(sh); return; }
  sh.getRange(2, 1, 4, 4).setValues([
    ['(ใส่ชื่อผู้บัญชาการ)', ROLE.COMMANDER, '', 'เปิด/ปิดเหตุการณ์ได้'],
    ['(ใส่ชื่อรองผู้บัญชาการ)', ROLE.DEPUTY, '', 'ทำหน้าที่แทนเมื่อผู้บัญชาการไม่อยู่'],
    ['(ใส่ชื่อหัวหน้าเวร/ผู้ตรวจการนอกเวลา)', ROLE.DEPUTY, '', 'ทำหน้าที่แทนนอกเวลาราชการ'],
    ['(ใส่ชื่อเจ้าหน้าที่ศูนย์)', ROLE.OFFICER, '', 'ดู Dashboard และบันทึกสถานะแทนได้ แต่เปิด/ปิดเหตุไม่ได้'],
  ]);
}

/**
 * แปลงค่าในคอลัมน์ C เป็น PIN 6 หลัก
 *   "890123" -> "890123" · "1-2345-67890-12-3" หรือ 1234567890123 -> "890123" (6 หลักท้าย)
 *   12345 (ตัวเลขที่ 0 นำหน้าหายไป) -> "012345"
 */
function pinFromCell_(v) {
  if (v === '' || v == null || v instanceof Date) return '';
  let d = (typeof v === 'number' ? String(Math.round(v)) : String(v)).replace(/\D/g, '');
  if (!d) return '';
  if (d.length >= 13) d = d.slice(-6);
  else if (d.length < 6) d = ('000000' + d).slice(-6);
  return d;
}

/** เตือนถ้าเลข 6 หลักซ้ำกัน (ทั้งคู่จะเข้าระบบไม่ได้) หรือยังไม่ได้ใส่ */
function checkRolePins_(sh) {
  if (!sh || sh.getLastRow() < 2) return;
  const seen = {}, dup = [], missing = [], odd = [];
  sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(function (r) {
    const name = normName_(r[0]);
    if (!name || /^\(/.test(name)) return;
    const p = pinFromCell_(r[2]);
    if (!p) { missing.push(name); return; }
    if (p.length !== 6) odd.push(name);
    if (seen[p]) dup.push(seen[p] + ' กับ ' + name); else seen[p] = name;
  });
  const msg = [];
  if (dup.length) msg.push('เลขซ้ำกัน (ทั้งคู่จะเข้าระบบไม่ได้ ให้คนหนึ่งใช้เลข 6 หลักอื่น):\n' + dup.join('\n'));
  if (missing.length) msg.push('ยังไม่ได้ใส่เลข 6 หลัก:\n' + missing.join('\n'));
  if (odd.length) msg.push('ค่าไม่ใช่เลข 6 หลัก (ตรวจอีกครั้ง):\n' + odd.join('\n'));
  if (msg.length) safeAlert_('ชีต Roles\n\n' + msg.join('\n\n'));
}

/** สร้างชีต QR ที่มีลิงก์ + รูป QR ของแต่ละจุดรวมพล (รันหลัง Deploy) */
function generateQrSheet() {
  // ต้องเป็นลิงก์ /exec เท่านั้น ลิงก์ /dev เปิดได้เฉพาะคนที่แก้โค้ดได้ เจ้าหน้าที่สแกนแล้วจะเข้าไม่ได้
  const url = String(getConfig_().WEB_APP_URL || ScriptApp.getService().getUrl() || '').trim();
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) {
    safeAlert_('ยังไม่มีลิงก์ Web app ที่ใช้ได้\n\n1) Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone)\n' +
      '2) คัดลอก "Web app URL" ที่ลงท้ายด้วย /exec\n3) วางในชีต Config แถว WEB_APP_URL\n4) กดเมนูสร้าง QR อีกครั้ง' +
      (url ? '\n\nลิงก์ที่พบตอนนี้ใช้ไม่ได้: ' + url : ''));
    return;
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET.QR) || ss.insertSheet(SHEET.QR, ss.getNumSheets());
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

/** ตั้งสถานะทุกคนที่เป็น "อยู่" ให้กลับเป็น "ไม่ทราบ" (คนที่ "ลา" คงไว้) */
function resetZoneStatusMenu() {
  const n = resetZoneStatus_();
  safeAlert_('รีเซ็ตแล้ว ' + n + ' คน (คนที่ลาไม่ถูกเปลี่ยน)');
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🚨 เช็คอินฉุกเฉิน')
    .addItem('ติดตั้ง / ตรวจรายชื่อ', 'setup')
    .addItem('สร้าง QR Code จุดรวมพล', 'generateQrSheet')
    .addItem('รีเซ็ตสถานะ "อยู่" → "ไม่ทราบ"', 'resetZoneStatusMenu')
    .addItem('ตรวจเลข PIN ในชีต Roles', 'checkRolesMenu')
    .addItem('ล้างแคชรายชื่อ', 'clearCache')
    .addToUi();
}

/** แก้รายชื่อในชีตโซน แล้วล้างแคชให้หน้าเว็บเห็นทันที */
function onEdit(e) {
  try {
    const name = e && e.range && e.range.getSheet().getName();
    if (!name) return;
    const c = CacheService.getScriptCache();
    if (name === SHEET.CONFIG) c.removeAll(['cfg', 'dash']);
    else if (name === SHEET.ROLES) c.remove('roles');
    else if (isZoneSheet_(name)) {
      if (e.range.getColumn() === 4 && e.range.getNumColumns() === 1) c.removeAll(['zstat', 'dash']);   // หัวหน้าโซนเลือกสถานะ
      else clearCache();                                                                               // แก้รายชื่อ
    }
  } catch (err) { /* ignore */ }
}

function checkRolesMenu() {
  checkRolePins_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.ROLES));
  safeAlert_('ตรวจชีต Roles เสร็จแล้ว ถ้าไม่มีข้อความเตือนก่อนหน้านี้ แปลว่าใช้ได้ทุกแถว');
}

function clearCache() {
  const c = CacheService.getScriptCache();
  const n = Number(c.get('emp_n') || 0);
  const keys = ['emp_n', 'emp_v', 'zstat', 'dash', 'cfg', 'roles'];
  for (let i = 0; i < n; i++) keys.push('emp_' + i);
  c.removeAll(keys);
}

/* ------------------------------------------------------------------ */
/* Web app                                                             */
/* ------------------------------------------------------------------ */
function doGet(e) {
  const p = (e && e.parameter) || {};
  const isDash = p.page === 'dashboard';
  const t = HtmlService.createTemplateFromFile(isDash ? 'Dashboard' : 'CheckIn');
  t.point = p.point || '';
  t.appName = APP_SHORT;
  t.orgName = ORG_NAME;
  t.logo = LOGO_DATA_URI;
  // หน้าเช็คอิน: ฝังรายชื่อมากับหน้าเว็บเลย ไม่ต้องเรียกเซิร์ฟเวอร์อีกรอบหลังโหลด
  t.boot = isDash ? 'null' : safeJson_(getCheckInData());
  const out = t.evaluate()
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  try { out.setFaviconUrl(FAVICON_URL); } catch (err) { /* ไม่มีไอคอนก็ใช้งานได้ */ }
  return out;
}

/** JSON ที่ฝังใน <script> ได้อย่างปลอดภัย */
function safeJson_(o) {
  return JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/* ---------- เรียกจากหน้าเช็คอิน ---------- */

/** ข้อมูลเริ่มต้นของหน้าเช็คอิน: [ตัวระบุ, ชื่อ, หน่วยงาน, โซน, ตำแหน่ง] */
function getCheckInData() {
  return {
    employees: getEmployees_().map(function (e) { return [e.id, e.name, e.dept, e.zone, e.pos]; }),
    points: getPoints_(),
  };
}

/**
 * เช็คอินด้วยตัวเอง / เพื่อนเช็คอินให้
 * payload: { empId, name, status: 'SAFE'|'HELP', point, by: 'SELF'|'BUDDY', note }
 */
function checkIn(payload) {
  const emp = findEmployee_(payload.empId, payload.name);
  if (!emp) throw new Error('ไม่พบรายชื่อ ' + (payload.name || payload.empId));
  const status = payload.status === STATUS.HELP ? STATUS.HELP : STATUS.SAFE;
  const by = payload.by === 'BUDDY' ? 'BUDDY' : 'SELF';
  const eventId = getOrCreateActiveEvent_();
  appendCheckIn_(eventId, emp, status, payload.point, by, payload.note);
  return { ok: true, name: emp.name, status: status, time: fmt_(new Date()) };
}

/* ---------- เรียกจากหน้า Dashboard (ต้องมี PIN) ---------- */

/**
 * ข้อมูล Dashboard แบบประหยัด
 *   - รายชื่อ (roster) ส่งเฉพาะครั้งแรก หรือเมื่อรายชื่อเปลี่ยน (เทียบเลขเวอร์ชัน ver)
 *   - รอบต่อไปส่งแค่สถานะเป็นตัวอักษร 1 ตัวต่อคน + รายละเอียดเฉพาะคนที่เช็คอินแล้ว
 *   - ผลคำนวณเก็บแคชสั้นๆ ใช้ร่วมกันทุกคนที่เปิด Dashboard (มีเช็คอินใหม่จะล้างแคชทันที)
 */
function getDashboard(pin, clientVer) {
  const me = auth_(pin);
  const emps = getEmployees_();
  const ver = EMP_VER_;
  const cache = CacheService.getScriptCache();
  let dash = null;
  const hit = cache.get('dash');
  if (hit) { try { dash = JSON.parse(hit); } catch (e) { dash = null; } }
  if (!dash || dash.ver !== ver) {
    dash = buildDashboard_(emps, ver);
    // มีเช็คอิน/ประกาศ/ปิดเหตุ หรือแก้สถานะในชีต จะล้างแคชทันที จึงเก็บได้ 10 วินาที
    try { cache.put('dash', JSON.stringify(dash), 10); } catch (e) { /* ใช้งานได้โดยไม่มีแคช */ }
  }
  dash.me = me;
  dash.serverTime = fmt_(new Date());
  if (clientVer !== ver) {
    dash.roster = emps.map(function (e) { return [e.id, e.name, e.dept, e.zone, e.pos, e.phone, e.code]; });
  }
  return dash;
}

const STATE_CODE = { SAFE: 'S', HELP: 'H', MISSING: 'M', AWAY: 'A', NOT_IN: 'N' };

function buildDashboard_(emps, ver) {
  const props = PropertiesService.getScriptProperties();
  const eventId = props.getProperty('ACTIVE_EVENT_ID') || props.getProperty('LAST_EVENT_ID');
  let row = eventId ? findEventRow_(eventId) : null;
  if (!row) row = lastEventRow_();
  const evRow = row ? row.values : null;
  const event = evRow ? {
    id: String(evRow[0]), type: evRow[1], start: fmt_(evRow[2]),
    end: evRow[3] ? fmt_(evRow[3]) : '', active: evRow[4] === 'ACTIVE',
    auto: evRow[1] === AUTO_EVENT_TYPE, openedBy: evRow[6] || '', closedBy: evRow[7] || '',
  } : null;

  // สถานะล่าสุดของแต่ละคน: อ่านเฉพาะแถวของเหตุการณ์นี้ (ไม่อ่านประวัติเก่าทั้งหมด)
  const latest = {};
  if (event) {
    const sh = sheet_(SHEET.CHECKINS);
    const last = sh.getLastRow();
    const start = Math.max(2, Number(props.getProperty('CI_START_' + event.id)) || 2);
    if (last >= start) {
      sh.getRange(start, 1, last - start + 1, 8).getValues().forEach(function (r) {
        if (String(r[0]) !== event.id) return;
        latest[String(r[1]).trim()] = r;
      });
    }
  }

  const zstat = getZoneStatuses_(emps);
  const scan = getPresentFromScan_();
  const count = { SAFE: 0, HELP: 0, MISSING: 0, AWAY: 0, NOT_IN: 0 };
  const info = {};
  let st = '';
  emps.forEach(function (e, i) {
    const c = latest[e.id];
    const sheetStatus = zstat[e.name] || '';
    const onLeave = sheetStatus === ZONE_TEXT.LEAVE;
    const scanned = scan.enabled && e.code ? !!scan.present[e.code] : true; // ยังไม่มีรหัส = ถือว่าอยู่
    let state;
    if (c) state = c[3];                                            // SAFE / HELP / AWAY
    else if (onLeave) state = 'AWAY';                               // หัวหน้าโซนเลือก "ลา"
    else if (sheetStatus === ZONE_TEXT.PRESENT) state = 'SAFE';     // เลือก "อยู่" ในชีต
    else if (!scanned) state = 'NOT_IN';                            // ไม่ได้สแกนเข้างาน
    else state = 'MISSING';                                         // ยังไม่ทราบ ต้องตามหา
    if (!(state in count)) state = 'MISSING';
    count[state]++;
    st += STATE_CODE[state];
    const scanTime = e.code ? (scan.present[e.code] || '') : '';
    if (c) info[i] = [String(c[4] || ''), fmt_(c[5]), String(c[6] || ''), String(c[7] || ''), scanTime];
    else if (state === 'SAFE') info[i] = ['', '', 'SHEET', '', scanTime];
    else if (scanTime) info[i] = ['', '', '', '', scanTime];
  });

  return {
    ver: ver, event: event, st: st, info: info, count: count,
    expected: count.SAFE + count.HELP + count.MISSING,
    scanEnabled: scan.enabled, scanNote: scan.note, points: getPoints_(),
  };
}

/** สถานะในคอลัมน์ "สถานะ" ของชีตโซน: อ่านแค่คอลัมน์ชื่อ+สถานะ แคช 8 วินาที */
function getZoneStatuses_(emps) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('zstat');
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* อ่านใหม่ */ } }
  const sheets = {};
  emps.forEach(function (e) { e.locs.forEach(function (l) { if (l[3] > 0) sheets[l[0]] = [l[2], l[3]]; }); });
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const out = {};
  Object.keys(sheets).forEach(function (name) {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    const nameCol = sheets[name][0], stCol = sheets[name][1];
    const c1 = Math.min(nameCol, stCol), c2 = Math.max(nameCol, stCol);
    // อ่านทั้งคอลัมน์ในครั้งเดียว (เช่น "D:E") ไม่ต้องถามจำนวนแถวก่อน
    sh.getRange(colLetter_(c1) + ':' + colLetter_(c2)).getValues().forEach(function (r) {
      const nm = normName_(r[nameCol - c1]);
      if (!nm) return;
      const v = normName_(r[stCol - c1]);
      if (!out[nm] || out[nm] === ZONE_TEXT.UNKNOWN) out[nm] = v;   // ชื่อซ้ำหลายโซน: เอาค่าที่ไม่ใช่ "ไม่ทราบ"
    });
  });
  // แก้คอลัมน์สถานะในชีตเองจะล้างแคชทันที (onEdit) แคชนี้จึงเก็บได้นานขึ้น
  try { cache.put('zstat', JSON.stringify(out), 20); } catch (e) { /* ใช้งานได้โดยไม่มีแคช */ }
  return out;
}

function colLetter_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function lastEventRow_() {
  const sh = sheet_(SHEET.EVENTS);
  const last = sh.getLastRow();
  if (last < 2) return null;
  return { sheet: sh, index: last, values: sh.getRange(last, 1, 1, HEADERS.Events.length).getValues()[0] };
}

function startEvent(pin, type, note) {
  const me = requireCommander_(pin);
  return withLock_(function () {
    const props = PropertiesService.getScriptProperties();
    const active = props.getProperty('ACTIVE_EVENT_ID');
    if (active) {
      const row = findEventRow_(active);
      if (row && row.values[1] === AUTO_EVENT_TYPE) {
        row.sheet.getRange(row.index, 2).setValue(type || 'ไฟไหม้');
        row.sheet.getRange(row.index, 7).setValue(me.name + ' (ยืนยันภายหลัง)');
        CacheService.getScriptCache().remove('dash');
        return { ok: true, id: active, confirmed: true };
      }
      throw new Error('มีเหตุการณ์ที่ยังไม่ปิดอยู่');
    }
    return createEvent_(type || 'ไฟไหม้', note || '', me.name);
  });
}

function closeEvent(pin) {
  const me = requireCommander_(pin);
  return withLock_(function () {
    const props = PropertiesService.getScriptProperties();
    const id = props.getProperty('ACTIVE_EVENT_ID');
    if (!id) return { ok: true };
    const row = findEventRow_(id);
    if (row) {
      row.sheet.getRange(row.index, 4, 1, 2).setValues([[new Date(), 'CLOSED']]);
      row.sheet.getRange(row.index, 8).setValue(me.name);
    }
    props.deleteProperty('ACTIVE_EVENT_ID');
    CacheService.getScriptCache().remove('dash');
    return { ok: true };
  });
}

function findEventRow_(id) {
  const sh = sheet_(SHEET.EVENTS);
  const n = sh.getLastRow() - 1;
  if (n < 1) return null;
  const vals = sh.getRange(2, 1, n, HEADERS.Events.length).getValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0]) === id) return { sheet: sh, index: i + 2, values: vals[i] };
  }
  return null;
}

/** ผู้ควบคุมบันทึกสถานะแทน (SAFE / HELP / AWAY = ไม่อยู่ในพื้นที่) */
function staffCheckIn(pin, empId, status, point, note) {
  const me = auth_(pin);
  const emp = findEmployee_(empId);
  if (!emp) throw new Error('ไม่พบรายชื่อ');
  if ([STATUS.SAFE, STATUS.HELP, STATUS.AWAY].indexOf(status) < 0) throw new Error('สถานะไม่ถูกต้อง');
  const eventId = getOrCreateActiveEvent_();
  appendCheckIn_(eventId, emp, status, point || 'STAFF', 'STAFF:' + me.name, note);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* อ่านรายชื่อจากชีตโซน                                                  */
/* ------------------------------------------------------------------ */
function isZoneSheet_(name) {
  const prefix = getConfig_().ZONE_SHEET_PREFIX || 'โซน';
  return String(name).trim().indexOf(prefix) === 0;
}

function normName_(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

/** "โซนที่ 1 " -> "โซน 1" */
function zoneLabel_(sheetName) {
  const m = String(sheetName).match(/(\d+)/);
  return m ? 'โซน ' + m[1] : String(sheetName).trim();
}

/** หาคอลัมน์จากหัวตาราง (ค้นในแถว 1-3) คืนค่า index เริ่มที่ 0 หรือ -1 */
function findCol_(head, re) {
  for (let r = 0; r < head.length; r++) {
    for (let c = 0; c < head[r].length; c++) {
      if (re.test(String(head[r][c]).trim())) return c;
    }
  }
  return -1;
}

/** อ่านทุกชีตโซน คืนรายชื่อพร้อมตำแหน่งแถว (ไม่ใช้แคช) */
function loadEmployees_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const byId = {};
  const out = [];
  ss.getSheets().forEach(function (sh) {
    const sheetName = sh.getName();
    if (!isZoneSheet_(sheetName)) return;
    const lastRow = sh.getLastRow(), lastCol = Math.max(sh.getLastColumn(), 8);
    if (lastRow < 2) return;
    const values = sh.getRange(1, 1, lastRow, lastCol).getValues();
    const head = values.slice(0, 3);
    const cName = findCol_(head, /^ชื่อ\s*-?\s*สกุล$|^ชื่อ-นามสกุล$/);
    if (cName < 0) return;
    const cStatus = findCol_(head, /^สถานะ$/);
    const cPos = findCol_(head, /^ตำแหน่ง$/);
    const cPhone = findCol_(head, /^เบอร์/);
    const cCode = findCol_(head, /รหัส/);
    const zone = zoneLabel_(sheetName);
    let dept = '';
    values.forEach(function (row, i) {
      const name = normName_(row[cName]);
      const first = normName_(row[0]);
      if (!name) {                                   // แถวหัวหน่วยงาน (merge A:F)
        if (first && isNaN(first) && !/^(อยู่|ลา|ไม่ทราบ)$/.test(first)) dept = first;
        return;
      }
      if (/^ชื่อ/.test(name) || /^[-–]/.test(name)) return;   // หัวตาราง / หมายเหตุ เช่น "- เช็ครายชื่อที่โซน 2 -"
      const code = cCode >= 0 ? normName_(row[cCode]) : '';
      const id = code || name;
      const loc = [sheetName, i + 1, cName + 1, cStatus + 1];
      if (byId[id]) {                                // ชื่อซ้ำหลายโซน: รวมเป็นคนเดียว
        const e = byId[id];
        e.locs.push(loc);
        if (e.zone.indexOf(zone) < 0) e.zone += ', ' + zone;
        if (!e.sheetStatus || e.sheetStatus === ZONE_TEXT.UNKNOWN) e.sheetStatus = cStatus >= 0 ? normName_(row[cStatus]) : '';
        return;
      }
      const e = {
        id: id, code: code, name: name, dept: dept, zone: zone,
        pos: cPos >= 0 ? normName_(row[cPos]) : '', phone: cPhone >= 0 ? normName_(row[cPhone]) : '',
        sheetStatus: cStatus >= 0 ? normName_(row[cStatus]) : '', locs: [loc],
      };
      byId[id] = e;
      out.push(e);
    });
  });
  return out;
}

/** รายชื่อแบบมีแคช (แบ่งเก็บหลายก้อน เพราะแคชเก็บได้ก้อนละไม่เกิน 100KB) */
let EMP_MEMO_ = null, EMP_VER_ = '';
function getEmployees_() {
  if (EMP_MEMO_) return EMP_MEMO_;
  const cache = CacheService.getScriptCache();
  const head = cache.getAll(['emp_n', 'emp_v']);
  const n = Number(head.emp_n || 0);
  if (n && head.emp_v) {
    const keys = [];
    for (let i = 0; i < n; i++) keys.push('emp_' + i);
    const got = cache.getAll(keys);
    if (Object.keys(got).length === n) {
      try {
        EMP_MEMO_ = JSON.parse(keys.map(function (k) { return got[k]; }).join(''));
        EMP_VER_ = head.emp_v;
        return EMP_MEMO_;
      } catch (e) { /* โหลดใหม่ */ }
    }
  }
  const list = loadEmployees_().map(function (e) { const x = Object.assign({}, e); delete x.sheetStatus; return x; });
  try {
    const s = JSON.stringify(list), size = 25000, parts = {};
    let k = 0;
    for (let i = 0; i < s.length; i += size) parts['emp_' + (k++)] = s.slice(i, i + size);
    parts.emp_n = String(k);
    parts.emp_v = EMP_VER_ = String(Date.now());
    cache.putAll(parts, 21600);   // 6 ชม. (สูงสุดของ Apps Script) แก้รายชื่อในชีตโซนจะล้างแคชเอง
  } catch (err) { EMP_VER_ = EMP_VER_ || 'nocache'; }
  EMP_MEMO_ = list;
  return list;
}

function findEmployee_(id, name) {
  id = normName_(id);
  const list = getEmployees_();
  let e = list.filter(function (x) { return x.id === id; })[0];
  // รองรับเครื่องที่จำชื่อไว้ก่อนเพิ่มรหัสพนักงาน
  if (!e && name) e = list.filter(function (x) { return x.name === normName_(name); })[0];
  if (!e) e = list.filter(function (x) { return x.name === id; })[0];
  return e || null;
}

/* ------------------------------------------------------------------ */
/* เขียนสถานะกลับลงชีตโซน                                                */
/* ------------------------------------------------------------------ */
function syncEnabled_() { return String(getConfig_().SYNC_ZONE_STATUS).toUpperCase() !== 'FALSE'; }

function writeZoneStatus_(emp, text) {
  if (!syncEnabled_()) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  emp.locs.forEach(function (loc) {
    const sh = ss.getSheetByName(loc[0]);
    if (!sh || loc[3] < 1) return;
    let row = loc[1];
    // กันกรณีมีคนแทรก/ลบแถวระหว่างเกิดเหตุ: ตรวจชื่อก่อนเขียน ถ้าไม่ตรงให้ค้นหาใหม่
    if (normName_(sh.getRange(row, loc[2]).getValue()) !== emp.name) {
      const names = sh.getRange(1, loc[2], sh.getLastRow(), 1).getValues();
      row = -1;
      for (let i = 0; i < names.length; i++) if (normName_(names[i][0]) === emp.name) { row = i + 1; break; }
      if (row < 0) return;
      clearCache();
    }
    sh.getRange(row, loc[3]).setValue(text);
  });
}

/** "อยู่" -> "ไม่ทราบ" ทุกชีตโซน (คนที่ "ลา" คงไว้) คืนจำนวนที่เปลี่ยน */
function resetZoneStatus_() {
  if (!syncEnabled_()) return 0;
  let changed = 0;
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(function (sh) {
    if (!isZoneSheet_(sh.getName()) || sh.getLastRow() < 3) return;
    const head = sh.getRange(1, 1, 3, Math.max(sh.getLastColumn(), 8)).getValues();
    const c = findCol_(head, /^สถานะ$/);
    if (c < 0) return;
    const rng = sh.getRange(1, c + 1, sh.getLastRow(), 1);
    const vals = rng.getValues();
    let dirty = false;
    vals.forEach(function (v) { if (normName_(v[0]) === ZONE_TEXT.PRESENT) { v[0] = ZONE_TEXT.UNKNOWN; dirty = true; changed++; } });
    if (dirty) rng.setValues(vals);
  });
  CacheService.getScriptCache().removeAll(['zstat', 'dash']);
  return changed;
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

/** ค่าตั้งในชีต Config: อ่านครั้งเดียวต่อการเรียกใช้ และแคช 60 วินาที (แก้ชีต Config แล้วล้างแคชเอง) */
let CFG_MEMO_ = null;
function getConfig_() {
  if (CFG_MEMO_) return CFG_MEMO_;
  const cache = CacheService.getScriptCache();
  const hit = cache.get('cfg');
  if (hit) { try { return (CFG_MEMO_ = JSON.parse(hit)); } catch (e) { /* อ่านใหม่ */ } }
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.CONFIG);
  const cfg = {};
  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
      if (r[0]) cfg[String(r[0]).trim()] = String(r[1]).trim();
    });
    try { cache.put('cfg', JSON.stringify(cfg), 60); } catch (e) { /* ใช้งานได้โดยไม่มีแคช */ }
  }
  CFG_MEMO_ = cfg;
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

/** อ่านข้อมูลสแกนนิ้ว/ใบหน้า: คืนรายชื่อรหัสที่ (น่าจะ) อยู่ในอาคาร */
function getPresentFromScan_() {
  const cfg = getConfig_();
  const result = { enabled: false, present: {}, note: 'สถานะ "ลา" อ้างอิงจากคอลัมน์สถานะในชีตโซน' };
  if (String(cfg.USE_SCAN_LOG).toUpperCase() !== 'TRUE') return result;
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
    result.note = 'ไม่พบข้อมูลสแกนใน ' + hours + ' ชม.ล่าสุด: นับเจ้าหน้าที่ทุกคน (ยกเว้นคนที่ลา)';
    return result;
  }
  result.enabled = true;
  result.note = 'อ้างอิงข้อมูลสแกนนิ้ว/ใบหน้า ' + hours + ' ชม.ล่าสุด (' + n + ' คน) · คนที่ยังไม่มีรหัสถือว่าอยู่ในอาคาร';
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
  // มีคนเช็คอินก่อนผู้ควบคุมกดประกาศเหตุ -> สร้างให้อัตโนมัติ
  return withLock_(function () {
    return props.getProperty('ACTIVE_EVENT_ID') || createEvent_(AUTO_EVENT_TYPE, 'มีคนเช็คอินก่อนประกาศเหตุ', '').id;
  });
}

function createEvent_(type, note, openedBy) {
  const id = 'EV' + Utilities.formatDate(new Date(), tz_(), 'yyyyMMdd-HHmmss');
  resetZoneStatus_();   // เริ่มนับใหม่: "อยู่" จากครั้งก่อนกลับเป็น "ไม่ทราบ"
  sheet_(SHEET.EVENTS).appendRow([id, type, new Date(), '', 'ACTIVE', note, openedBy || 'ระบบ (อัตโนมัติ)', '']);
  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    ACTIVE_EVENT_ID: id, LAST_EVENT_ID: id,
    ['CI_START_' + id]: String(sheet_(SHEET.CHECKINS).getLastRow() + 1),   // Dashboard อ่านเฉพาะแถวของเหตุการณ์นี้
  });
  CacheService.getScriptCache().removeAll(['dash', 'zstat']);
  return { ok: true, id: id };
}

function appendCheckIn_(eventId, emp, status, point, by, note) {
  CacheService.getScriptCache().remove('dash');   // Dashboard เห็นทันทีในรอบถัดไป
  sheet_(SHEET.CHECKINS).appendRow([
    eventId, "'" + emp.id, emp.name, status, String(point || ''), new Date(), by, String(note || '').slice(0, 200),
  ]);
  try {
    writeZoneStatus_(emp, status === STATUS.AWAY ? ZONE_TEXT.LEAVE : ZONE_TEXT.PRESENT);
  } catch (err) { Logger.log('เขียนสถานะลงชีตโซนไม่สำเร็จ: ' + err); }
}

/**
 * ตรวจ PIN ส่วนตัวจากชีต Roles คืน { name, role, canCommand }
 * ถ้าชีต Roles ยังไม่มีรายชื่อจริง ใช้ ADMIN_PIN ใน Config ได้ (สิทธิ์เท่าผู้บัญชาการ) เพื่อไม่ให้ระบบล็อกตัวเอง
 */
function auth_(pin) {
  pin = String(pin || '').trim();
  if (!pin) throw new Error('กรุณาใส่ PIN');
  const rows = getRoleRows_();
  pin = pin.replace(/\D/g, '');
  if (pin.length === 13) pin = pin.slice(-6);   // พิมพ์เลขบัตรเต็มมา ใช้ 6 หลักท้าย
  const valid = rows.filter(function (r) {
    return normName_(r[0]) && !/^\(/.test(normName_(r[0])) && pinFromCell_(r[2]) && r[1];
  });
  if (!valid.length) {
    if (pin && pin === String(getConfig_().ADMIN_PIN).replace(/\D/g, '')) return { name: 'ผู้ดูแลระบบ (PIN สำรอง)', role: ROLE.COMMANDER, canCommand: true };
    failDelay_();
    throw new Error('PIN ไม่ถูกต้อง');
  }
  const hit = valid.filter(function (r) { return pin && pinFromCell_(r[2]) === pin; });
  if (hit.length > 1) throw new Error('เลขนี้ซ้ำกันในชีต Roles กรุณาแจ้งผู้ดูแลให้แก้');
  if (!hit.length) { failDelay_(); throw new Error('PIN ไม่ถูกต้อง'); }
  const role = normName_(hit[0][1]);
  return { name: normName_(hit[0][0]), role: role, canCommand: role === ROLE.COMMANDER || role === ROLE.DEPUTY };
}

/** แถวในชีต Roles (แคช 60 วินาที แก้ชีต Roles แล้วล้างแคชเอง) */
function getRoleRows_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('roles');
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* อ่านใหม่ */ } }
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET.ROLES);
  const rows = sh && sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues()
    .map(function (r) { return [normName_(r[0]), normName_(r[1]), pinFromCell_(r[2])]; }) : [];
  try { cache.put('roles', JSON.stringify(rows), 60); } catch (e) { /* ใช้งานได้โดยไม่มีแคช */ }
  return rows;
}

function requireCommander_(pin) {
  const me = auth_(pin);
  if (!me.canCommand) throw new Error('เฉพาะผู้บัญชาการหรือรองผู้บัญชาการเท่านั้นที่ประกาศ/ปิดเหตุได้');
  return me;
}

/** หน่วงเวลาเมื่อ PIN ผิด กันการสุ่มเดา */
function failDelay_() { Utilities.sleep(1500); }

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

/** โลโก้ รพ.มะเร็งลำปาง (เฉพาะสัญลักษณ์) จาก www.lpch.go.th ย่อเป็น PNG 128px ~2KB ฝังในหน้าเว็บ ไม่ต้องโหลดไฟล์แยก */
const LOGO_DATA_URI = 'data:image/png;base64,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';
