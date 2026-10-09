/**
 * ระบบนัดคิวผู้ป่วยใส่แร่ (Brachytherapy Appointment Queue)
 * กลุ่มงานรังสีรักษา โรงพยาบาลมะเร็งลำปาง
 *
 * - หน้าเว็บกรอก HN / ชื่อผู้ป่วย / แพทย์ / จำนวน fraction (เปลี่ยนภาษา ไทย/อังกฤษ และโหมดกลางวัน/กลางคืนได้)
 * - กดปุ่มเดียว: สร้างนัดทุก fraction ลง Google Calendar (ทั้งวัน) + บันทึกลง Google Sheet
 * - แจ้งเตือนเมื่อวันใดมีเคสเกินกำหนด (ค่าเริ่มต้น 6 เคส/วัน)
 * - เข้าสู่ระบบด้วยบัญชี LPCH RO Workspace (WORKSPACE_URL) ระบบนี้ไม่เก็บรหัสผ่านเอง
 *   สมัครสมาชิก อนุมัติ ระงับ และลืมรหัสผ่าน ทำที่ Workspace ทั้งหมด
 *   เปิดจากปุ่มใน Workspace ที่ติ๊ก "เข้าสู่ระบบอัตโนมัติ" (?sso=...) จะเข้าได้ทันทีโดยไม่ต้องกรอกรหัสผ่าน
 *   บันทึกทุกการใช้งานในชีต AccessLog
 * - ยกเลิกนัดได้ (ลบ event ในปฏิทิน และเปลี่ยนสถานะในชีต)
 *
 * สร้างสคริปต์จากเมนู ส่วนขยาย > Apps Script ของ Google Sheet หลังบ้าน (ระบบจะรู้จักชีตเอง)
 * ถ้าสร้างโปรเจกต์แยกที่ script.google.com ให้ใส่ลิงก์หรือ ID ของชีตที่ SPREADSHEET_ID ด้านล่าง
 * แล้ว Deploy เป็น Web app แบบ Execute as: "Me", Who has access: "Anyone"
 * ครั้งแรกหลังอัปเดตเป็นการเข้าสู่ระบบผ่าน Workspace: เลือกฟังก์ชัน setup แล้วกด Run หนึ่งครั้ง
 * เพื่ออนุญาตสิทธิ์ "เชื่อมต่อกับบริการภายนอก" (UrlFetchApp) ก่อน Deploy เวอร์ชันใหม่
 */

/** เว็บ LPCH RO Workspace ที่ใช้ตรวจชื่อผู้ใช้/รหัสผ่าน (ต้อง Deploy แบบ Who has access: Anyone) */
const WORKSPACE_URL = 'https://script.google.com/macros/s/AKfycbwVlM9oxgSQMjjvc3mi39aGbIH4vEkaaUpSNWs4dd9oJHotjpfcyJMVBi5XcUFSAAM2/exec';

/** ลิงก์หรือ ID ของ Google Sheet หลังบ้าน (เว้นว่างได้ถ้าสคริปต์สร้างจากเมนูในชีต) */
const SPREADSHEET_ID = 'https://docs.google.com/spreadsheets/d/1kYj1MUI7APT4Q__LoTCHrcTt10v0_216Yf-rsCEY34Y/edit';

/**
 * ปฏิทินที่จะลงนัด: ใช้ปฏิทินในบัญชีที่ Deploy สคริปต์ ที่ชื่อตรงกับ CALENDAR_NAME
 * (ปฏิทินใน "ปฏิทินอื่นๆ / Other calendars" ก็ได้ ถ้าบัญชีนั้นมีสิทธิ์แก้ไขกิจกรรม)
 * ถ้าใส่ CALENDAR_ID (ในชีต Settings หรือที่นี่) ระบบจะใช้ ID แทนชื่อ
 */
const CALENDAR_NAME = 'คิวใส่แร่';
const CALENDAR_ID = '';

const SHEET_APPTS = 'Appointments';
const SHEET_DOCTORS = 'Doctors';
const SHEET_HOLIDAYS = 'Holidays';
const SHEET_SETTINGS = 'Settings';
const SHEET_LOG = 'AccessLog';

const APPT_HEADERS = [
  'เลขนัด',            // A  apptId  (courseId-fx)
  'รหัสคอร์ส',          // B  courseId
  'วันที่บันทึก',        // C  createdAt
  'HN',                // D
  'ชื่อ-สกุลผู้ป่วย',     // E
  'แพทย์',              // F
  'Fraction ที่',        // G
  'จำนวน Fraction',     // H
  'วันที่นัด',           // I  yyyy-MM-dd
  'หมายเหตุ',           // J
  'สถานะ',              // K  นัดแล้ว / ยกเลิก / มาตามนัด
  'Calendar Event ID', // L
  'ผู้บันทึก',           // M  ชื่อผู้ใช้
  'รูปแบบการใส่',        // N  Full / Mould / Interstitial needle / ที่กรอกเอง
  'แก้ไขล่าสุดโดย',      // O
  'แก้ไขล่าสุดเมื่อ',     // P
  'ประวัติการแก้ไข'      // Q  JSON: [{at, by, name, changes:[{f, from, to}]}]
];
const COL = {};
['apptId', 'courseId', 'createdAt', 'hn', 'name', 'doctor', 'fx', 'totalFx',
  'date', 'note', 'status', 'eventId', 'createdBy', 'technique', 'editedBy', 'editedAt', 'history']
  .forEach((k, i) => { COL[k] = i; });
/** รูปแบบการใส่ที่เลือกได้ (นอกจากนี้กรอกเองในช่อง "อื่นๆ") */
const TECHNIQUES = ['Full', 'Mould', 'Interstitial needle'];

const STATUS_BOOKED = 'นัดแล้ว';
const STATUS_CANCELLED = 'ยกเลิก';
const STATUS_DONE = 'มาตามนัด';

const AUTH_ERR = 'AUTH_REQUIRED: ';  // ขึ้นต้นข้อความ error เมื่อหน้าเว็บต้องให้เข้าสู่ระบบใหม่

const DEFAULT_DOCTORS = [
  'ทัศน์วรรณ อาษากิจ',
  'ศิริรัตน์ เชื้อสำราญ',
  'พัฒธิดา มโนรส',
  'ทินกร จอมใจ'
];
const OLD_SAMPLE_DOCTORS = ['พญ. ตัวอย่าง หนึ่ง', 'นพ. ตัวอย่าง สอง'];

/** ข้อความแจ้งผู้ใช้จากฝั่งเซิร์ฟเวอร์ (หน้าเว็บส่งภาษาที่เลือกมา: 'th' หรือ 'en') */
const MSG = {
  th: {
    sessionExpired: 'กรุณาเข้าสู่ระบบอีกครั้ง',
    loginRequired: 'กรุณากรอกชื่อผู้ใช้หรืออีเมล และรหัสผ่าน',
    ssoInvalid: 'ลิงก์เข้าสู่ระบบไม่ถูกต้อง กรุณาเข้าสู่ระบบอีกครั้ง',
    workspaceDown: 'ติดต่อ LPCH RO Workspace ไม่ได้ ({err}) กรุณาลองใหม่ ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ',
    noData: 'ไม่มีข้อมูล',
    busy: 'มีผู้ใช้อื่นกำลังบันทึกข้อมูลอยู่ กรุณารอสักครู่แล้วลองใหม่',
    technique: 'กรุณาเลือกรูปแบบการใส่ หรือกรอกในช่อง "อื่นๆ" (ไม่เกิน 100 ตัวอักษร)',
    statusInvalid: 'สถานะไม่ถูกต้อง',
    dateInvalid: 'วันที่นัดไม่ถูกต้อง',
    noteTooLong: 'หมายเหตุยาวเกินไป (ไม่เกิน 500 ตัวอักษร)',
    hn: 'กรุณากรอก HN',
    name: 'กรุณากรอกชื่อผู้ป่วย',
    doctor: 'กรุณาเลือกแพทย์',
    doctorUnknown: 'แพทย์ "{doctor}" ไม่อยู่ในรายชื่อ (ชีต Doctors)',
    fxRange: 'จำนวน fraction ต้องอยู่ระหว่าง 1–30',
    fxMismatch: 'จำนวนวันนัดไม่ตรงกับจำนวน fraction',
    fxDate: 'วันที่ของ Fx {n} ไม่ถูกต้อง',
    calFail: 'สร้างนัดในปฏิทินไม่สำเร็จ: {err}',
    notFound: 'ไม่พบนัด {id}',
    calMissing: 'ใช้ปฏิทิน {id} ไม่ได้: สคริปต์รันในนาม {who} ให้ {id} แชร์ปฏิทินให้ {who} ด้วยสิทธิ์ "ทำการเปลี่ยนแปลงกิจกรรม" แล้วรัน setup อีกครั้ง{detail}',
    calNameMissing: 'ไม่พบปฏิทินชื่อ "{name}" ในบัญชี {who} (ปฏิทินที่มี: {list}) ตรวจสอบชื่อที่ CALENDAR_NAME',
    sheetMissing: 'ไม่พบชีต {name} (เมนู นัดคิวใส่แร่ > ตั้งค่าชีตครั้งแรก)'
  },
  en: {
    sessionExpired: 'Please log in again',
    loginRequired: 'Please enter your username or email and password',
    ssoInvalid: 'This sign-in link is not valid. Please log in again',
    workspaceDown: 'Could not reach LPCH RO Workspace ({err}). Please try again, or tell the administrator',
    noData: 'No data',
    busy: 'Someone else is saving right now. Please wait a moment and try again',
    technique: 'Please choose an insertion type, or type one under "Other" (up to 100 characters)',
    statusInvalid: 'Invalid status',
    dateInvalid: 'Invalid appointment date',
    noteTooLong: 'Note is too long (up to 500 characters)',
    hn: 'Please enter HN',
    name: 'Please enter patient name',
    doctor: 'Please select a doctor',
    doctorUnknown: 'Doctor "{doctor}" is not in the list (Doctors sheet)',
    fxRange: 'Fractions must be between 1 and 30',
    fxMismatch: 'Number of dates does not match number of fractions',
    fxDate: 'Invalid date for Fx {n}',
    calFail: 'Could not create calendar events: {err}',
    notFound: 'Appointment {id} not found',
    calMissing: 'Cannot use calendar {id}: the script runs as {who}. {id} must share the calendar with {who} with "Make changes to events", then run setup again{detail}',
    calNameMissing: 'No calendar named "{name}" in {who} (calendars found: {list}). Check CALENDAR_NAME',
    sheetMissing: 'Sheet {name} not found (menu: นัดคิวใส่แร่ > ตั้งค่าชีตครั้งแรก)'
  }
};
function msg_(lang, key, vars) {
  const dict = MSG[lang] || MSG.th;
  return String(dict[key] || MSG.th[key] || key).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? vars[k] : m));
}

const DEFAULT_SETTINGS = [
  ['CALENDAR_ID', '', 'ID ของปฏิทินที่จะลงนัด (เว้นว่าง = ใช้ชื่อปฏิทินจาก CALENDAR_NAME)'],
  ['CALENDAR_NAME', '', 'ชื่อปฏิทินที่จะลงนัด (เว้นว่าง = ใช้ CALENDAR_NAME ใน Code.gs ซึ่งตั้งเป็น "คิวใส่แร่")'],
  ['EVENT_PREFIX', '[ใส่แร่]', 'คำนำหน้าชื่อนัดในปฏิทิน'],
  ['SHOW_NAME_IN_CALENDAR', 'TRUE', 'TRUE = แสดงชื่อผู้ป่วยในปฏิทิน, FALSE = แสดงเฉพาะ HN'],
  ['LOCATION', 'ห้องใส่แร่ (Brachytherapy)', 'สถานที่ที่แสดงในนัด'],
  ['MAX_CASES_PER_DAY', '6', 'จำนวนเคสสูงสุดต่อวัน ถ้าเกินจะแจ้งเตือน'],
  ['ALERT_EMAIL', '', 'อีเมลที่จะรับแจ้งเตือนเมื่อวันใดเกินจำนวนเคส (คั่นหลายอีเมลด้วย ,) เว้นว่าง = ไม่ส่งอีเมล'],
  ['SESSION_HOURS', '12', 'เข้าสู่ระบบแล้วใช้งานได้นานกี่ชั่วโมงก่อนต้องเข้าสู่ระบบใหม่ (ถ้าติ๊ก "จำฉันไว้" = 7 วัน)']
];

/* ------------------------------------------------------------------ */
/*  Entry points                                                       */
/* ------------------------------------------------------------------ */

function doGet(e) {
  try {
    ensureSetup_();
  } catch (err) {
    console.error('doGet: ensureSetup_ failed: ' + (err && err.stack || err));
    return errorPage_('เปิด Google Sheet ของระบบไม่สำเร็จ กรุณาแจ้งผู้ดูแลระบบ',
      'Could not open the system\'s Google Sheet. Please contact the administrator.', String(err && err.message || err));
  }
  let html = HtmlService.createHtmlOutputFromFile('Index').getContent();
  // เปิดจากปุ่มใน LPCH RO Workspace ที่ติ๊ก "เข้าสู่ระบบอัตโนมัติ" (?sso=บัตรผ่าน): แลกบัตรที่เซิร์ฟเวอร์ก่อนส่งหน้าเว็บ
  // แล้วส่ง token (หรือข้อความ error) ไปกับหน้าเว็บใน window.BQ_SSO (แบบเดียวกับแอป TRS-398)
  const ticket = e && e.parameter && e.parameter.sso;
  if (ticket) {
    let sso;
    try {
      sso = { token: ssoLogin_(ticket, 'th').token };
    } catch (err) {
      sso = { error: String(err && err.message || err).replace(AUTH_ERR, '') };
    }
    const tag = '<script>window.BQ_SSO = ' + JSON.stringify(sso).replace(/</g, '\\u003c') + ';</script>';
    const m = /<head(\s[^>]*)?>/i.exec(html);
    html = m ? html.slice(0, m.index + m[0].length) + tag + html.slice(m.index + m[0].length) : tag + html;
  }
  return HtmlService.createHtmlOutput(html)
    .setTitle('ระบบนัดคิวผู้ป่วยใส่แร่ · กลุ่มงานรังสีรักษา โรงพยาบาลมะเร็งลำปาง')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('นัดคิวใส่แร่')
    .addItem('ตั้งค่าชีตครั้งแรก', 'setup')
    .addItem('เปิดหน้าลงนัด', 'showDialog')
    .addToUi();
}

function showDialog() {
  const html = HtmlService.createTemplateFromFile('Index').evaluate()
    .setWidth(1100).setHeight(760);
  SpreadsheetApp.getUi().showModelessDialog(html, 'ระบบนัดคิวผู้ป่วยใส่แร่');
}

/** สร้างชีตและหัวตารางที่จำเป็น (รันซ้ำได้ ไม่ลบข้อมูลเดิม) */
function setup() {
  ensureSetup_();
  // จำ ID ชีตไว้ เผื่อเว็บแอปหาชีตที่ผูกไม่เจอ
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss_().getId());
  authSecret_(); // สร้างกุญแจลงชื่อ token ไว้ล่วงหน้า
  // คอลัมน์ HN และวันที่นัดต้องเป็นข้อความ (กันเลข 0 นำหน้า HN หาย และกันชีตแปลงวันที่)
  const ss = ss_();
  ss.getSheetByName(SHEET_APPTS).getRange('D:D').setNumberFormat('@');
  ss.getSheetByName(SHEET_APPTS).getRange('I:I').setNumberFormat('@');
  ss.getSheetByName(SHEET_HOLIDAYS).getRange('A:A').setNumberFormat('@');
  // ทดสอบปฏิทิน (และติดตามปฏิทินที่แชร์มาให้) แล้วแสดงผลใน "บันทึกการดำเนินการ"
  let calMsg;
  try {
    const cal = getCalendar_('th');
    calMsg = 'ปฏิทิน: ใช้งานได้ → ' + cal.getName() + ' (' + cal.getId() + ')';
  } catch (e) {
    calMsg = 'ปฏิทิน: ⚠️ ' + e.message;
  }
  // ทดสอบการเชื่อมต่อ Workspace (และขอสิทธิ์ UrlFetchApp): token ปลอมต้องได้คำตอบว่า session หมดอายุ
  let wsMsg;
  try {
    workspace_({ action: 'me', token: '-' }, 'th');
    wsMsg = 'LPCH RO Workspace: ⚠️ ตอบกลับผิดปกติ';
  } catch (e) {
    wsMsg = e.message.indexOf(AUTH_ERR) === 0 ? 'LPCH RO Workspace: เชื่อมต่อได้' : 'LPCH RO Workspace: ⚠️ ' + e.message;
  }
  console.log('สคริปต์รันในนาม: ' + scriptOwner_());
  console.log(calMsg);
  console.log(wsMsg);
  try {
    SpreadsheetApp.getUi().alert('ตั้งค่าเรียบร้อย: สร้างชีต Appointments, Doctors, Holidays, Settings, AccessLog แล้ว\n' +
      calMsg + '\n' + wsMsg + '\nDeploy เว็บแอปเวอร์ชันใหม่ แล้วเข้าสู่ระบบด้วยบัญชี LPCH RO Workspace');
  } catch (e) { /* รันจาก editor ไม่มี UI */ }
}

/* ------------------------------------------------------------------ */
/*  เข้าสู่ระบบด้วยบัญชี LPCH RO Workspace                                */
/* ------------------------------------------------------------------ */

/** เข้าสู่ระบบ: form = { login (ชื่อผู้ใช้หรืออีเมล), password, remember, lang } ตรวจรหัสผ่านที่ Workspace */
function login(form) {
  const lang = form && form.lang;
  const loginId = String(form && form.login || '').trim().toLowerCase();
  const password = String(form && form.password || '');
  if (!loginId || !password) throw new Error(msg_(lang, 'loginRequired'));
  let r;
  try {
    r = workspace_({ action: 'login', username: loginId, password: password }, lang);
  } catch (e) {
    log_(loginId, 'เข้าสู่ระบบไม่สำเร็จ', e.message);
    throw e;
  }
  return startSession_(r, form && form.remember, 'เข้าสู่ระบบ');
}

/** เปิดจากปุ่มใน Workspace ที่ติ๊ก "เข้าสู่ระบบอัตโนมัติ": ลิงก์มี ?sso=<บัตรผ่าน> ใช้ได้ครั้งเดียว อายุ 2 นาที (doGet เรียก) */
function ssoLogin_(ticket, lang) {
  const t = String(ticket || '').replace(/[^0-9a-f]/gi, '');
  if (!t) throw new Error(msg_(lang, 'ssoInvalid'));
  // อายุ 7 วันเท่า session ของ Workspace (ทุกครั้งที่เปิดหน้า getInitData ตรวจกับ Workspace อีกครั้งอยู่แล้ว)
  return startSession_(workspace_({ action: 'ssoRedeem', ticket: t }, lang), true, 'เข้าสู่ระบบจาก Workspace');
}

/** ออกจากระบบ: ปิด session ที่ Workspace ที่ระบบนี้เปิดไว้ด้วย */
function logout(token) {
  const s = parseToken_(token);
  if (!s) return { ok: true };
  try { workspace_({ action: 'logout', token: s.w }); } catch (e) { /* session อาจหมดอายุไปแล้ว */ }
  log_(s.u, 'ออกจากระบบ', '');
  return { ok: true };
}

/** หลัง Workspace ยืนยันตัวตนแล้ว: ออก token ของระบบนี้ (เก็บ session ของ Workspace ไว้ข้างในเพื่อตรวจซ้ำตอนเปิดหน้า) */
function startSession_(r, remember, action) {
  const user = member_(r.user);
  const hours = remember ? 24 * 7 : Math.max(1, Number(getSettings_().SESSION_HOURS) || 12);
  log_(user.username, action, user.fullName + (user.role ? ' (' + user.role + ')' : ''));
  return { token: makeToken_(user, r.token, hours), user: user };
}

/** ข้อมูลผู้ใช้จาก Workspace เฉพาะที่ระบบนี้ใช้ */
function member_(u) {
  u = u || {};
  return {
    username: String(u.username || ''), fullName: String(u.fullName || u.username || ''),
    role: String(u.role || ''), email: String(u.email || ''), isAdmin: !!u.isAdmin
  };
}

/** เรียก API ของ LPCH RO Workspace (doPost แบบ JSON) คืนผลเมื่อ ok ไม่งั้นโยนข้อความ error ของ Workspace */
function workspace_(req, lang) {
  let res;
  try {
    res = UrlFetchApp.fetch(WORKSPACE_URL, {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(req),
      muteHttpExceptions: true, followRedirects: true
    });
  } catch (e) {
    throw new Error(msg_(lang, 'workspaceDown', { err: e.message }));
  }
  let out;
  try {
    out = JSON.parse(res.getContentText('UTF-8'));
  } catch (e) {
    // ได้หน้า HTML แทน JSON: มักเป็นเพราะ Workspace ไม่ได้ Deploy แบบ Who has access: Anyone
    throw new Error(msg_(lang, 'workspaceDown', { err: 'HTTP ' + res.getResponseCode() }));
  }
  if (!out || !out.ok) {
    const err = out && out.error;
    if (err === 'session_expired') throw new Error(AUTH_ERR + msg_(lang, 'sessionExpired'));
    throw new Error(err || msg_(lang, 'workspaceDown', { err: '?' }));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  API ที่ต้องเข้าสู่ระบบ (ส่ง token มาทุกครั้ง)                          */
/* ------------------------------------------------------------------ */

function getInitData(token, lang) {
  ensureSetup_();
  const acc = requireUser_(token, lang);
  // ตรวจกับ Workspace ทุกครั้งที่เปิดหน้า: บัญชีที่ถูกระงับหรือ session ที่ถูกปิดจะต้องเข้าสู่ระบบใหม่
  let user = member_(acc);
  try {
    user = member_(workspace_({ action: 'me', token: acc.wsToken }, lang).user);
  } catch (e) {
    if (String(e.message).indexOf(AUTH_ERR) === 0) throw e;
    console.warn('getInitData: ตรวจกับ Workspace ไม่ได้ ใช้ข้อมูลใน token แทน: ' + e.message);
  }
  const settings = getSettings_();
  return {
    user: user,
    doctors: getDoctors_(),
    techniques: TECHNIQUES,
    holidays: getHolidays_(),
    settings: {
      maxCasesPerDay: maxCases_(settings),
      calendarName: calendarNameSafe_(lang)
    },
    appointments: listAppointments_()
  };
}

function listAppointments(token, lang) {
  requireUser_(token, lang);
  return listAppointments_();
}

/**
 * สร้างนัดทั้งคอร์สในคลิกเดียว
 * payload = { hn, name, doctor, totalFx, note, force, lang,
 *             sessions: [{ date:'yyyy-MM-dd' }, ...] }
 */
function createAppointments(token, payload) {
  const lang = payload && payload.lang;
  const acc = requireUser_(token, lang);
  const user = acc.username;
  const p = validatePayload_(payload, lang);

  const lock = lock_(lang);
  try {
    const settings = getSettings_();
    const max = maxCases_(settings);
    const overDays = findOverCapacity_(p.sessions, max);

    if (!p.force) {
      const conflicts = findConflicts_(p.sessions, p.hn);
      if (conflicts.length || overDays.length) {
        return { ok: false, needConfirm: true, conflicts: conflicts, overCapacity: overDays, max: max };
      }
    }

    const cal = getCalendar_(lang);
    const tz = Session.getScriptTimeZone();
    const now = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
    // ต่อท้ายด้วยรหัสสุ่ม กันรหัสซ้ำเมื่อบันทึกหลายรายการในวินาทีเดียวกัน
    const courseId = 'BT' + Utilities.formatDate(new Date(), tz, 'yyMMddHHmmss') +
      Utilities.getUuid().replace(/-/g, '').slice(0, 4).toUpperCase();
    const rows = [];
    const created = [];
    try {
      p.sessions.forEach((s, i) => {
        const fx = i + 1;
        const a = { hn: p.hn, name: p.name, doctor: p.doctor, technique: p.technique, note: p.note,
          fx: fx, totalFx: p.totalFx, date: s.date, courseId: courseId, createdBy: user };
        const ev = createEvent_(cal, settings, a);
        created.push(ev);

        rows.push([
          courseId + '-' + fx, courseId, now, p.hn, safeCell_(p.name), p.doctor, fx, p.totalFx,
          s.date, safeCell_(p.note), STATUS_BOOKED, ev.getId(), user, safeCell_(p.technique), '', '', ''
        ]);
      });
    } catch (err) {
      // ถ้าสร้าง event ไม่ครบ ให้ลบที่สร้างไปแล้ว เพื่อไม่ให้ปฏิทินกับชีตไม่ตรงกัน
      created.forEach(ev => { try { ev.deleteEvent(); } catch (e) { /* ignore */ } });
      log_(user, 'ลงนัดไม่สำเร็จ', 'HN ' + p.hn + ': ' + err.message);
      throw new Error(msg_(lang, 'calFail', { err: err.message }));
    }

    const sh = getSheet_(SHEET_APPTS);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, APPT_HEADERS.length).setValues(rows);
    SpreadsheetApp.flush();

    log_(user, 'ลงนัด', 'HN ' + p.hn + ' ' + p.name + ' / ' + p.doctor + ' / ' + p.technique + ' / ' + rows.length + ' Fx (' +
      p.sessions.map(s => s.date).join(', ') + ') คอร์ส ' + courseId);
    if (overDays.length) {
      log_(user, 'แจ้งเตือนเกินเคส', overDays.map(d => d.date + ' = ' + d.total + ' เคส').join(', '));
      sendOverCapacityAlert_(settings, overDays, max, p, user);
    }

    return { ok: true, courseId: courseId, count: rows.length, overCapacity: overDays, appointments: listAppointments_() };
  } finally {
    lock.releaseLock();
  }
}

/** ยกเลิกนัด: scope = 'one' (เฉพาะ fraction นี้) หรือ 'course' (ทั้งคอร์สที่ยังไม่ได้ทำ) */
function cancelAppointment(token, apptId, scope, lang) {
  const acc = requireUser_(token, lang);
  return updateStatus_(acc, apptId, scope, STATUS_CANCELLED, true, lang);
}

/** บันทึกว่าผู้ป่วยมาตามนัดแล้ว */
function markDone(token, apptId, lang) {
  const acc = requireUser_(token, lang);
  return updateStatus_(acc, apptId, 'one', STATUS_DONE, false, lang);
}

/**
 * แก้ไขนัด 1 fraction: changes = { date?, doctor?, technique?, note?, status? }
 * ปรับนัดในปฏิทินให้ตรง และบันทึกว่าใครแก้อะไร เมื่อไร ในคอลัมน์ประวัติการแก้ไข
 */
function updateAppointment(token, apptId, changes, lang) {
  const acc = requireUser_(token, lang);
  const c = changes || {};
  const lock = lock_(lang);
  try {
    const sh = getSheet_(SHEET_APPTS);
    const last = sh.getLastRow();
    if (last < 2) throw new Error(msg_(lang, 'notFound', { id: apptId }));
    const data = sh.getRange(2, 1, last - 1, APPT_HEADERS.length).getDisplayValues();
    const idx = data.findIndex(r => r[COL.apptId] === apptId);
    if (idx < 0) throw new Error(msg_(lang, 'notFound', { id: apptId }));
    const a = rowToObj_(data[idx], idx + 2);

    const next = { date: a.date, doctor: a.doctor, technique: a.technique, note: a.note, status: a.status };
    if (c.date !== undefined) {
      next.date = String(c.date).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(next.date)) throw new Error(msg_(lang, 'dateInvalid'));
    }
    if (c.doctor !== undefined) {
      next.doctor = String(c.doctor).trim();
      if (getDoctors_().indexOf(next.doctor) < 0) throw new Error(msg_(lang, 'doctorUnknown', { doctor: next.doctor }));
    }
    if (c.technique !== undefined) {
      next.technique = cleanText_(c.technique);
      if (!next.technique || next.technique === 'อื่นๆ' || next.technique.length > 100) throw new Error(msg_(lang, 'technique'));
    }
    if (c.note !== undefined) {
      next.note = cleanText_(c.note);
      if (next.note.length > 500) throw new Error(msg_(lang, 'noteTooLong'));
    }
    if (c.status !== undefined) {
      next.status = String(c.status).trim();
      if ([STATUS_BOOKED, STATUS_DONE, STATUS_CANCELLED].indexOf(next.status) < 0) throw new Error(msg_(lang, 'statusInvalid'));
    }

    const diff = ['date', 'doctor', 'technique', 'note', 'status']
      .filter(f => next[f] !== a[f])
      .map(f => ({ f: f, from: a[f], to: next[f] }));
    if (!diff.length) return { ok: true, changed: 0, appointments: listAppointments_() };

    // ปรับปฏิทินให้ตรงกับข้อมูลใหม่
    const settings = getSettings_();
    const cal = getCalendar_(lang);
    let ev = null;
    if (a.eventId) { try { ev = cal.getEventById(a.eventId); } catch (e) { ev = null; } }
    let eventId = a.eventId;
    const merged = Object.assign({}, a, next);
    if (next.status === STATUS_CANCELLED) {
      if (ev) { try { ev.deleteEvent(); } catch (e) { /* ลบไปแล้ว */ } }
      eventId = '';
    } else if (!ev) {
      eventId = createEvent_(cal, settings, merged).getId();
    } else {
      if (next.date !== a.date) ev.setAllDayDate(toDate_(next.date));
      ev.setTitle(eventTitle_(settings, merged));
      ev.setDescription(eventDesc_(merged));
    }

    const label = userLabel_(acc);
    const now = nowStr_();
    const history = a.history.concat([{ at: now, by: acc.username, name: label, changes: diff }]);
    const row = data[idx].slice();
    row[COL.date] = next.date;
    row[COL.doctor] = next.doctor;
    row[COL.technique] = safeCell_(next.technique);
    row[COL.note] = safeCell_(next.note);
    row[COL.status] = next.status;
    row[COL.eventId] = eventId;
    row[COL.editedBy] = label;
    row[COL.editedAt] = now;
    row[COL.history] = JSON.stringify(history);
    row[COL.name] = safeCell_(row[COL.name]);
    sh.getRange(idx + 2, 1, 1, APPT_HEADERS.length).setValues([row]);
    SpreadsheetApp.flush();

    log_(acc.username, 'แก้ไขนัด', 'HN ' + a.hn + ' ' + a.name + ' Fx ' + a.fx + '/' + a.totalFx + ' (' + apptId + '): ' +
      diff.map(d => d.f + ' ' + (d.from || '-') + ' → ' + (d.to || '-')).join(', '));

    // ย้ายวันหรือกลับมาใช้งาน แล้ววันนั้นเกินจำนวนเคส: แจ้งเตือนเหมือนตอนลงนัด
    let overCapacity = [];
    const becameActive = next.status !== STATUS_CANCELLED && (next.date !== a.date || a.status === STATUS_CANCELLED);
    if (becameActive) {
      const max = maxCases_(settings);
      const total = listAppointments_().filter(x => x.date === next.date && x.status !== STATUS_CANCELLED).length;
      if (total > max) {
        overCapacity = [{ date: next.date, total: total }];
        log_(acc.username, 'แจ้งเตือนเกินเคส', next.date + ' = ' + total + ' เคส (จากการแก้ไขนัด)');
        sendOverCapacityAlert_(settings, overCapacity, max, { hn: a.hn, doctor: next.doctor, totalFx: a.totalFx }, acc.username);
      }
    }
    return { ok: true, changed: diff.length, overCapacity: overCapacity, appointments: listAppointments_() };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/*  token / log                                                        */
/* ------------------------------------------------------------------ */

/** ตรวจ token แล้วคืนผู้ใช้ { username, fullName, role, isAdmin, wsToken } */
function requireUser_(token, lang) {
  const s = parseToken_(token);
  if (!s) throw new Error(AUTH_ERR + msg_(lang, 'sessionExpired'));
  return { username: s.u, fullName: s.n || s.u, role: s.r || '', email: '', isAdmin: !!s.a, wsToken: s.w || '' };
}

function bytesToB64_(bytes) { return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, ''); }

function safeEqual_(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** กุญแจลับสำหรับลงชื่อ token (สร้างครั้งแรกแล้วเก็บใน Script Properties) */
function authSecret_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('AUTH_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('AUTH_SECRET', s);
  }
  return s;
}

/** token = base64(JSON ข้อมูลผู้ใช้ + session ของ Workspace + เวลาหมดอายุ) . ลายเซ็น HMAC */
function makeToken_(user, wsToken, hours) {
  const payload = JSON.stringify({
    u: user.username, n: user.fullName, r: user.role, a: user.isAdmin ? 1 : 0,
    w: String(wsToken || ''), e: Date.now() + hours * 3600 * 1000
  });
  return Utilities.base64EncodeWebSafe(payload, Utilities.Charset.UTF_8).replace(/=+$/, '') + '.' + sign_(payload);
}

function sign_(payload) {
  return bytesToB64_(Utilities.computeHmacSha256Signature(payload, authSecret_(), Utilities.Charset.UTF_8));
}

/** คืนข้อมูลใน token ที่ถูกต้องและยังไม่หมดอายุ ไม่งั้นคืน null (token รูปแบบเก่าก็คืน null → เข้าสู่ระบบใหม่) */
function parseToken_(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 2) return null;
    const b64 = parts[0] + '='.repeat((4 - parts[0].length % 4) % 4);
    const payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(b64)).getDataAsString('UTF-8');
    if (!safeEqual_(sign_(payload), parts[1])) return null;
    const s = JSON.parse(payload);
    if (!s || !s.u || !(Number(s.e) > Date.now())) return null;
    return s;
  } catch (e) {
    return null;
  }
}

function nowStr_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

/** บันทึกการใช้งานลงชีต AccessLog */
function log_(user, action, detail) {
  try {
    const sh = ss_().getSheetByName(SHEET_LOG);
    if (!sh) return;
    sh.appendRow([nowStr_(), user || '(ไม่ทราบ)', action, detail || '']);
  } catch (e) { /* ไม่ให้ log ที่ผิดพลาดทำให้งานหลักล้ม */ }
}

function errorPage_(message, messageEn, detail) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html =
    '<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">' +
    '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">' +
    '<style>:root{color-scheme:light dark}body{font-family:Sarabun,sans-serif;background:#f5f3fa;color:#1f1b2e;display:flex;min-height:90vh;' +
    'align-items:center;justify-content:center;padding:16px;margin:0}.b{background:#fff;border:1px solid #e3dfee;' +
    'border-radius:12px;padding:24px;max-width:460px}h1{font-size:20px;color:#b3261e;margin:0 0 8px}' +
    'code{background:#efe8f8;padding:2px 6px;border-radius:6px}' +
    '@media (prefers-color-scheme:dark){body{background:#141120;color:#ece8f6}.b{background:#1e1a2c;border-color:#363049}' +
    'h1{color:#ff8f86}code{background:#2f2647}}</style></head><body><div class="b">' +
    '<h1>⚠️ ระบบยังไม่พร้อมใช้งาน · Not available</h1><p>' + esc(message) + '</p>' +
    '<p lang="en" style="color:#6b6680">' + esc(messageEn) + '</p>' +
    (detail ? '<p style="font-size:13px">รายละเอียด / Details: <code>' + esc(detail) + '</code></p>' : '') +
    '</div></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('ระบบยังไม่พร้อมใช้งาน')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

/** ล็อกก่อนเขียนชีต (คนเดียวต่อครั้ง) รอได้ 20 วินาที ถ้ายังไม่ว่างแจ้งให้ลองใหม่ */
function lock_(lang) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error(msg_(lang, 'busy'));
  return lock;
}

/** คืนรายการนัดทั้งหมด เรียงตามวันที่/เวลา */
function listAppointments_() {
  const sh = getSheet_(SHEET_APPTS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, APPT_HEADERS.length).getDisplayValues();
  return rows
    .map((r, i) => r[COL.apptId] ? rowToObj_(r, i + 2) : null)
    .filter(Boolean)
    .sort(compareAppt_);
}

function updateStatus_(acc, apptId, scope, newStatus, deleteEvent, lang) {
  const user = acc.username;
  const label = userLabel_(acc);
  const lock = lock_(lang);
  try {
    const sh = getSheet_(SHEET_APPTS);
    const last = sh.getLastRow();
    if (last < 2) throw new Error(msg_(lang, 'notFound', { id: apptId }));
    const data = sh.getRange(2, 1, last - 1, APPT_HEADERS.length).getDisplayValues();
    const target = data.find(r => r[COL.apptId] === apptId);
    if (!target) throw new Error(msg_(lang, 'notFound', { id: apptId }));

    const cal = getCalendar_(lang);
    const changedIds = [];
    data.forEach((r, i) => {
      const match = scope === 'course'
        ? r[COL.courseId] === target[COL.courseId] && r[COL.status] === STATUS_BOOKED
        : r[COL.apptId] === apptId;
      if (!match || r[COL.status] === newStatus) return;

      if (deleteEvent && r[COL.eventId]) {
        try {
          const ev = cal.getEventById(r[COL.eventId]);
          if (ev) ev.deleteEvent();
        } catch (e) { /* event อาจถูกลบไปแล้ว */ }
      }
      // บันทึกสถานะใหม่พร้อมประวัติว่าใครเปลี่ยน
      const now = nowStr_();
      const history = parseHistory_(r[COL.history]).concat([{ at: now, by: user, name: label,
        changes: [{ f: 'status', from: r[COL.status], to: newStatus }] }]);
      sh.getRange(i + 2, COL.status + 1).setValue(newStatus);
      if (deleteEvent) sh.getRange(i + 2, COL.eventId + 1).setValue('');
      sh.getRange(i + 2, COL.editedBy + 1, 1, 3).setValues([[label, now, JSON.stringify(history)]]);
      changedIds.push(r[COL.apptId]);
    });
    SpreadsheetApp.flush();
    if (changedIds.length) {
      log_(user, newStatus === STATUS_CANCELLED ? 'ยกเลิกนัด' : 'บันทึกมาตามนัด',
        'HN ' + target[COL.hn] + ' ' + target[COL.name] + ': ' + changedIds.join(', '));
    }
    return { ok: true, changed: changedIds.length, appointments: listAppointments_() };
  } finally {
    lock.releaseLock();
  }
}

function validatePayload_(payload, lang) {
  if (!payload) throw new Error(msg_(lang, 'noData'));
  const p = {
    hn: String(payload.hn || '').trim(),
    name: String(payload.name || '').trim(),
    doctor: String(payload.doctor || '').trim(),
    technique: cleanText_(payload.technique),
    note: cleanText_(payload.note),
    totalFx: parseInt(payload.totalFx, 10),
    force: !!payload.force,
    sessions: Array.isArray(payload.sessions) ? payload.sessions : []
  };
  if (!p.hn) throw new Error(msg_(lang, 'hn'));
  if (!p.name) throw new Error(msg_(lang, 'name'));
  if (!p.doctor) throw new Error(msg_(lang, 'doctor'));
  if (getDoctors_().indexOf(p.doctor) < 0) throw new Error(msg_(lang, 'doctorUnknown', { doctor: p.doctor }));
  if (!p.technique || p.technique === 'อื่นๆ' || p.technique.length > 100) throw new Error(msg_(lang, 'technique'));
  if (p.note.length > 500) throw new Error(msg_(lang, 'noteTooLong'));
  if (!(p.totalFx >= 1 && p.totalFx <= 30)) throw new Error(msg_(lang, 'fxRange'));
  if (p.sessions.length !== p.totalFx) throw new Error(msg_(lang, 'fxMismatch'));

  const reDate = /^\d{4}-\d{2}-\d{2}$/;
  p.sessions = p.sessions.map((s, i) => {
    const o = { date: String(s && s.date) };
    if (!reDate.test(o.date)) throw new Error(msg_(lang, 'fxDate', { n: i + 1 }));
    return o;
  });
  return p;
}

/** HN เดียวกันที่มีนัดอยู่แล้วในวันเดียวกัน (กันลงนัดซ้ำ) */
function findConflicts_(sessions, hn) {
  const booked = listAppointments_().filter(a => a.status === STATUS_BOOKED && a.hn === hn);
  const out = [];
  sessions.forEach((s, i) => {
    const same = booked.filter(a => a.date === s.date);
    if (same.length) {
      out.push({
        fx: i + 1, date: s.date,
        with: same.map(a => 'HN ' + a.hn + ' ' + a.name + ' Fx ' + a.fx + '/' + a.totalFx).join(', ')
      });
    }
  });
  return out;
}

/** วันที่จะมีเคส (ที่ไม่ถูกยกเลิก) เกิน max หลังลงนัดชุดนี้ */
function findOverCapacity_(sessions, max) {
  const counts = {};
  listAppointments_().forEach(a => {
    if (a.status !== STATUS_CANCELLED) counts[a.date] = (counts[a.date] || 0) + 1;
  });
  const adding = {};
  sessions.forEach(s => { adding[s.date] = (adding[s.date] || 0) + 1; });
  return Object.keys(adding).sort()
    .map(d => ({ date: d, existing: counts[d] || 0, adding: adding[d], total: (counts[d] || 0) + adding[d] }))
    .filter(x => x.total > max);
}

function sendOverCapacityAlert_(settings, overDays, max, p, user) {
  const to = String(settings.ALERT_EMAIL || '').trim();
  if (!to) return;
  try {
    const lines = overDays.map(d => '- ' + d.date + ': ' + d.total + ' เคส (เกิน ' + (d.total - max) + ')');
    MailApp.sendEmail({
      to: to,
      subject: '[นัดใส่แร่] แจ้งเตือน: มีวันที่เกิน ' + max + ' เคส',
      body: 'มีการลงนัดที่ทำให้จำนวนเคสเกิน ' + max + ' เคส/วัน\n\n' + lines.join('\n') +
        '\n\nนัดล่าสุด: HN ' + p.hn + ' (' + p.doctor + ', ' + p.totalFx + ' Fx)\nผู้บันทึก: ' + user
    });
  } catch (e) {
    log_(user, 'ส่งอีเมลแจ้งเตือนไม่สำเร็จ', e.message);
  }
}

function maxCases_(settings) {
  return Math.max(1, parseInt(settings.MAX_CASES_PER_DAY, 10) || 6);
}

function rowToObj_(r, row) {
  return {
    row: row,
    apptId: r[COL.apptId], courseId: r[COL.courseId], createdAt: r[COL.createdAt],
    hn: r[COL.hn], name: r[COL.name], doctor: r[COL.doctor],
    fx: Number(r[COL.fx]), totalFx: Number(r[COL.totalFx]),
    date: r[COL.date],
    note: r[COL.note], status: r[COL.status], createdBy: r[COL.createdBy], eventId: r[COL.eventId],
    technique: r[COL.technique] || '', editedBy: r[COL.editedBy] || '', editedAt: r[COL.editedAt] || '',
    history: parseHistory_(r[COL.history])
  };
}

function parseHistory_(v) {
  if (!v) return [];
  try { const h = JSON.parse(v); return Array.isArray(h) ? h : []; } catch (e) { return []; }
}

/** ชื่อที่แสดงในประวัติ: "ชื่อ นามสกุล (username)" */
function userLabel_(acc) {
  const full = String(acc.fullName || '').trim();
  return full && full !== acc.username ? full + ' (' + acc.username + ')' : acc.username;
}

function cleanText_(v) {
  return String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim();
}

/** กันข้อความที่ขึ้นต้นด้วย = + - @ ถูกชีตตีความเป็นสูตร */
function safeCell_(v) {
  const s = String(v == null ? '' : v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function eventTitle_(settings, a) {
  const showName = String(settings.SHOW_NAME_IN_CALENDAR).toUpperCase() !== 'FALSE';
  return [settings.EVENT_PREFIX || '', 'HN ' + a.hn, showName ? a.name : '', a.technique ? '· ' + a.technique : '',
    '(Fx ' + a.fx + '/' + a.totalFx + ')'].filter(Boolean).join(' ');
}

function eventDesc_(a) {
  return [
    'HN: ' + a.hn,
    'ผู้ป่วย: ' + a.name,
    'แพทย์: ' + a.doctor,
    'รูปแบบการใส่: ' + (a.technique || '-'),
    'Fraction: ' + a.fx + ' / ' + a.totalFx,
    a.note ? 'หมายเหตุ: ' + a.note : '',
    'รหัสคอร์ส: ' + a.courseId,
    'ผู้บันทึก: ' + a.createdBy
  ].filter(Boolean).join('\n');
}

function createEvent_(cal, settings, a) {
  const ev = cal.createAllDayEvent(eventTitle_(settings, a), toDate_(a.date),
    { description: eventDesc_(a), location: settings.LOCATION || '' });
  try { ev.setColor(CalendarApp.EventColor.MAUVE); } catch (e) { /* ignore */ }
  return ev;
}

/** เรียงตามวันที่ แล้วตามลำดับแถวในชีต (= ลำดับที่ลงนัด / ลำดับคิวในวันนั้น) */
function compareAppt_(a, b) {
  return a.date.localeCompare(b.date) || a.row - b.row;
}

function toDate_(dateStr) {
  const d = dateStr.split('-').map(Number);
  return new Date(d[0], d[1] - 1, d[2]); // ใช้ timezone ของสคริปต์ (Asia/Bangkok)
}

/** ชื่อปฏิทินสำหรับแสดงบนหน้าเว็บ ถ้ายังใช้ปฏิทินไม่ได้ ให้แสดงคำเตือนแทน (หน้าเว็บยังเปิดได้) */
function calendarNameSafe_(lang) {
  try { return getCalendar_(lang).getName(); }
  catch (e) { return '⚠️ ' + e.message; }
}

/** บัญชีที่สคริปต์รันอยู่ (ID ปฏิทินหลัก = อีเมลของบัญชี จึงไม่ต้องขอสิทธิ์อ่านอีเมลเพิ่ม) */
function scriptOwner_() {
  try { return CalendarApp.getDefaultCalendar().getId(); } catch (e) { return '(บัญชีที่ Deploy)'; }
}

function getCalendar_(lang) {
  if (getCalendar_.cache) return getCalendar_.cache;
  const settings = getSettings_();
  const id = String(settings.CALENDAR_ID || CALENDAR_ID || '').trim();
  const name = String(settings.CALENDAR_NAME || CALENDAR_NAME || '').trim();
  if (!id && name) {
    // หาปฏิทินตามชื่อ (รวมปฏิทินใน "ปฏิทินอื่นๆ") ถ้ามีหลายอันชื่อซ้ำ เลือกอันที่แก้ไขได้ก่อน
    const found = CalendarApp.getCalendarsByName(name);
    if (!found.length) {
      const list = CalendarApp.getAllCalendars().map(c => c.getName()).join(', ') || '-';
      throw new Error(msg_(lang, 'calNameMissing', { name: name, who: scriptOwner_(), list: list }));
    }
    const owned = found.filter(c => { try { return c.isOwnedByMe(); } catch (e) { return false; } });
    getCalendar_.cache = owned[0] || found[0];
    return getCalendar_.cache;
  }
  let cal = id ? CalendarApp.getCalendarById(id) : CalendarApp.getDefaultCalendar();
  let detail = '';
  if (!cal && id) {
    // ปฏิทินที่แชร์มาแต่ยังไม่อยู่ในรายการปฏิทินของเจ้าของสคริปต์: ติดตามให้อัตโนมัติ
    try { cal = CalendarApp.subscribeToCalendar(id); } catch (e) { cal = null; detail = ' (' + e.message + ')'; }
  }
  if (!cal) throw new Error(msg_(lang, 'calMissing', { id: id, who: scriptOwner_(), detail: detail }));
  getCalendar_.cache = cal;
  return cal;
}

function getDoctors_() {
  const sh = getSheet_(SHEET_DOCTORS);
  const last = sh.getLastRow();
  if (last < 2) return DEFAULT_DOCTORS.slice();
  const list = sh.getRange(2, 1, last - 1, 1).getDisplayValues()
    .map(r => r[0].trim()).filter(Boolean);
  return list.length ? list : DEFAULT_DOCTORS.slice();
}

function getHolidays_() {
  const sh = getSheet_(SHEET_HOLIDAYS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const tz = Session.getScriptTimeZone();
  return sh.getRange(2, 1, last - 1, 2).getValues()
    .filter(r => r[0])
    .map(r => ({
      date: r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd') : String(r[0]).trim(),
      name: String(r[1] || '')
    }));
}

function getSettings_() {
  const sh = getSheet_(SHEET_SETTINGS);
  const last = sh.getLastRow();
  const out = {};
  if (last < 2) return out;
  sh.getRange(2, 1, last - 1, 2).getDisplayValues().forEach(r => {
    if (r[0]) out[r[0].trim()] = r[1];
  });
  return out;
}

function getSheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error(msg_('th', 'sheetMissing', { name: name }));
  return sh;
}

/**
 * Google Sheet หลังบ้าน: ใช้ SPREADSHEET_ID ถ้าใส่ไว้ ไม่งั้นใช้ชีตที่สคริปต์ผูกอยู่
 * หรือ ID ที่ setup() จำไว้ (กรณีเว็บแอปหาชีตที่ผูกไม่เจอ)
 */
function ss_() {
  if (ss_.cache) return ss_.cache;
  let ss = null;
  const fixed = String(SPREADSHEET_ID || '').trim();
  if (fixed) ss = SpreadsheetApp.openById((fixed.match(/\/d\/([a-zA-Z0-9_-]+)/) || [])[1] || fixed);
  if (!ss) { try { ss = SpreadsheetApp.getActive(); } catch (e) { ss = null; } }
  if (!ss) {
    const saved = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (saved) ss = SpreadsheetApp.openById(saved);
  }
  if (!ss) {
    throw new Error('ไม่พบ Google Sheet ของระบบ: สคริปต์นี้ไม่ได้สร้างจากเมนู ส่วนขยาย > Apps Script ของชีต ' +
      'ให้ใส่ลิงก์ชีตที่ SPREADSHEET_ID บนสุดของ Code.gs แล้ว Deploy เวอร์ชันใหม่ / ' +
      'Spreadsheet not found: paste the sheet link into SPREADSHEET_ID at the top of Code.gs and deploy a new version');
  }
  ss_.cache = ss;
  return ss;
}

/**
 * สร้างชีต/หัวตาราง/คีย์ Settings ที่ยังไม่มี และอัปเดตจากเวอร์ชันก่อน
 * เรียกทุกครั้งที่เปิดหน้า: ตรวจแบบอ่านอย่างเดียวก่อน ถ้าต้องแก้จึงล็อกแล้วตรวจซ้ำก่อนเขียน
 * (กันสองคนเปิดหน้าพร้อมกันแล้วสร้างชีตซ้ำ เติมคีย์ซ้ำ หรือลบคอลัมน์เก่าสองรอบ)
 */
function ensureSetup_() {
  if (!setupSheets_(false)) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error(msg_('th', 'busy'));
  try {
    setupSheets_(true);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

/** apply = false: คืน true ถ้ามีสิ่งที่ต้องสร้าง/แก้ (ไม่เขียนอะไร), apply = true: สร้าง/แก้จริง */
function setupSheets_(apply) {
  const ss = ss_();

  let sh = ss.getSheetByName(SHEET_APPTS);
  if (!sh) {
    if (!apply) return true;
    sh = ss.insertSheet(SHEET_APPTS);
    sh.getRange(1, 1, 1, APPT_HEADERS.length).setValues([APPT_HEADERS])
      .setFontWeight('bold').setBackground('#ede7f6');
    sh.setFrozenRows(1);
    // เก็บวันที่เป็นข้อความ เพื่อไม่ให้ชีตแปลง timezone หรือรูปแบบวันที่
    sh.getRange('I:I').setNumberFormat('@');
    sh.getRange('D:D').setNumberFormat('@'); // HN อาจขึ้นต้นด้วย 0
  } else {
    // อัปเดตจากเวอร์ชันก่อน: ลบคอลัมน์ที่ไม่ใช้แล้ว (เวลาเริ่ม/เวลาสิ้นสุด หรือ ชนิด) ที่อยู่หลัง "วันที่นัด"
    const h = sh.getRange(1, 10).getDisplayValues()[0][0];
    if ((h === 'เวลาเริ่ม' || h === 'ชนิด') && !apply) return true;
    if (h === 'เวลาเริ่ม') sh.deleteColumns(10, 2);
    else if (h === 'ชนิด') sh.deleteColumn(10);
    // เติมหัวคอลัมน์ใหม่ (รูปแบบการใส่ / ประวัติการแก้ไข) ที่ต่อท้าย
    if (sh.getLastColumn() < APPT_HEADERS.length) {
      if (!apply) return true;
      sh.getRange(1, 1, 1, APPT_HEADERS.length).setValues([APPT_HEADERS]).setFontWeight('bold').setBackground('#ede7f6');
    }
  }

  sh = ss.getSheetByName(SHEET_DOCTORS);
  if (!sh) {
    if (!apply) return true;
    sh = ss.insertSheet(SHEET_DOCTORS);
    sh.getRange(1, 1).setValue('ชื่อแพทย์').setFontWeight('bold');
    sh.getRange(2, 1, DEFAULT_DOCTORS.length, 1).setValues(DEFAULT_DOCTORS.map(d => [d]));
  } else if (sh.getLastRow() >= 2) {
    // แทนที่รายชื่อตัวอย่างจากเวอร์ชันก่อนด้วยรายชื่อแพทย์จริง
    const cur = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().map(r => r[0].trim()).filter(Boolean);
    if (cur.length && cur.every(n => OLD_SAMPLE_DOCTORS.indexOf(n) >= 0)) {
      if (!apply) return true;
      sh.getRange(2, 1, sh.getLastRow() - 1, 1).clearContent();
      sh.getRange(2, 1, DEFAULT_DOCTORS.length, 1).setValues(DEFAULT_DOCTORS.map(d => [d]));
    }
  }

  sh = ss.getSheetByName(SHEET_HOLIDAYS);
  if (!sh) {
    if (!apply) return true;
    sh = ss.insertSheet(SHEET_HOLIDAYS);
    sh.getRange(1, 1, 1, 2).setValues([['วันที่ (yyyy-MM-dd)', 'ชื่อวันหยุด']]).setFontWeight('bold');
    sh.getRange('A:A').setNumberFormat('@');
  }

  sh = ss.getSheetByName(SHEET_SETTINGS);
  if (!sh) {
    if (!apply) return true;
    sh = ss.insertSheet(SHEET_SETTINGS);
    sh.getRange(1, 1, 1, 3).setValues([['คีย์', 'ค่า', 'คำอธิบาย']]).setFontWeight('bold');
  }
  // เติมคีย์ที่ยังไม่มี (เช่น อัปเดตจากเวอร์ชันก่อน)
  const have = sh.getLastRow() >= 2
    ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().map(r => r[0].trim()) : [];
  const missing = DEFAULT_SETTINGS.filter(s => have.indexOf(s[0]) < 0);
  if (missing.length) {
    if (!apply) return true;
    sh.getRange(sh.getLastRow() + 1, 1, missing.length, 3).setNumberFormat('@').setValues(missing);
    sh.autoResizeColumns(1, 3);
  }

  sh = ss.getSheetByName(SHEET_LOG);
  if (!sh) {
    if (!apply) return true;
    sh = ss.insertSheet(SHEET_LOG);
    sh.getRange(1, 1, 1, 4).setValues([['เวลา', 'ผู้ใช้', 'การกระทำ', 'รายละเอียด']])
      .setFontWeight('bold').setBackground('#ede7f6');
    sh.setFrozenRows(1);
  }
  return false;
}
