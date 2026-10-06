/**
 * ระบบนัดคิวผู้ป่วยใส่แร่ (Brachytherapy Appointment Queue)
 * กลุ่มงานรังสีรักษา โรงพยาบาลมะเร็งลำปาง
 *
 * - หน้าเว็บกรอก HN / ชื่อผู้ป่วย / แพทย์ / จำนวน fraction (เปลี่ยนภาษา ไทย/อังกฤษ และโหมดกลางวัน/กลางคืนได้)
 * - กดปุ่มเดียว: สร้างนัดทุก fraction ลง Google Calendar (ทั้งวัน) + บันทึกลง Google Sheet
 * - แจ้งเตือนเมื่อวันใดมีเคสเกินกำหนด (ค่าเริ่มต้น 6 เคส/วัน)
 * - ระบบสมาชิกของตัวเอง: สมัคร (ชื่อ-นามสกุล / ชื่อผู้ใช้ / รหัสผ่าน / อีเมล) แล้วเข้าสู่ระบบ
 *   ผู้สมัครคนแรกเป็นผู้ดูแลระบบ คนถัดไปรอผู้ดูแลอนุมัติ (ปิดได้ที่ REQUIRE_APPROVAL)
 *   รหัสผ่านเก็บเป็น hash + salt, ลืมรหัสผ่านใช้รหัสยืนยันทางอีเมล, บันทึกทุกการใช้งานในชีต AccessLog
 * - ยกเลิกนัดได้ (ลบ event ในปฏิทิน และเปลี่ยนสถานะในชีต)
 *
 * สร้างสคริปต์จากเมนู ส่วนขยาย > Apps Script ของ Google Sheet หลังบ้าน (ระบบจะรู้จักชีตเอง)
 * ถ้าสร้างโปรเจกต์แยกที่ script.google.com ให้ใส่ลิงก์หรือ ID ของชีตที่ SPREADSHEET_ID ด้านล่าง
 * แล้ว Deploy เป็น Web app แบบ Execute as: "Me", Who has access: "Anyone"
 */

/** ลิงก์หรือ ID ของ Google Sheet หลังบ้าน (เว้นว่างได้ถ้าสคริปต์สร้างจากเมนูในชีต) */
const SPREADSHEET_ID = 'https://docs.google.com/spreadsheets/d/1kYj1MUI7APT4Q__LoTCHrcTt10v0_216Yf-rsCEY34Y/edit';

/**
 * ปฏิทินที่จะลงนัด (ปฏิทินหลักของ Gmail ใช้อีเมลเป็น ID ได้เลย)
 * เจ้าของปฏิทินต้องแชร์ให้บัญชีที่ Deploy สคริปต์ด้วยสิทธิ์ "ทำการเปลี่ยนแปลงกิจกรรม"
 * ถ้าใส่ CALENDAR_ID ในชีต Settings ไว้ ค่าในชีตจะถูกใช้แทน
 */
const CALENDAR_ID = 'lpchro86@gmail.com';

const SHEET_APPTS = 'Appointments';
const SHEET_DOCTORS = 'Doctors';
const SHEET_HOLIDAYS = 'Holidays';
const SHEET_SETTINGS = 'Settings';
const SHEET_ACCOUNTS = 'Accounts';
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
  'รูปแบบการใส่',        // N  Full / Mould / เสียบเข็ม / ที่กรอกเอง
  'แก้ไขล่าสุดโดย',      // O
  'แก้ไขล่าสุดเมื่อ',     // P
  'ประวัติการแก้ไข'      // Q  JSON: [{at, by, name, changes:[{f, from, to}]}]
];
const COL = {};
['apptId', 'courseId', 'createdAt', 'hn', 'name', 'doctor', 'fx', 'totalFx',
  'date', 'note', 'status', 'eventId', 'createdBy', 'technique', 'editedBy', 'editedAt', 'history']
  .forEach((k, i) => { COL[k] = i; });
/** รูปแบบการใส่ที่เลือกได้ (นอกจากนี้กรอกเองในช่อง "อื่นๆ") */
const TECHNIQUES = ['Full', 'Mould', 'เสียบเข็ม'];

const STATUS_BOOKED = 'นัดแล้ว';
const STATUS_CANCELLED = 'ยกเลิก';
const STATUS_DONE = 'มาตามนัด';

/** บัญชีผู้ใช้ (ชีต Accounts) */
// ชื่อ/นามสกุลต่อท้ายเป็นคอลัมน์ H, I เพื่อไม่ให้คอลัมน์เดิมของชีตที่สร้างไว้แล้วเลื่อน
const ACCOUNT_HEADERS = ['ชื่อผู้ใช้', 'อีเมล', 'รหัสผ่าน (hash)', 'บทบาท', 'สถานะ', 'สมัครเมื่อ', 'เข้าใช้ล่าสุด', 'ชื่อ', 'นามสกุล'];
const ACOL = { username: 0, email: 1, hash: 2, role: 3, status: 4, createdAt: 5, lastLogin: 6, firstName: 7, lastName: 8 };
const ROLE_ADMIN = 'admin';
const ROLE_USER = 'user';
const ACC_ACTIVE = 'ใช้งาน';
const ACC_PENDING = 'รออนุมัติ';
const ACC_SUSPENDED = 'ระงับ';
const PW_ITERATIONS = 500;           // รอบการ hash รหัสผ่าน
const LOGIN_MAX_FAILS = 5;           // ใส่รหัสผิดได้กี่ครั้งก่อนล็อก
const LOGIN_LOCK_SECONDS = 600;      // ล็อก 10 นาที
const RESET_CODE_SECONDS = 900;      // รหัสยืนยันลืมรหัสผ่านใช้ได้ 15 นาที
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
    accountSuspended: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ',
    accountPending: 'บัญชีนี้รอผู้ดูแลระบบอนุมัติ',
    adminOnly: 'เฉพาะผู้ดูแลระบบเท่านั้น',
    badLogin: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
    locked: 'ใส่รหัสผ่านผิดหลายครั้ง กรุณารอ 10 นาทีแล้วลองใหม่',
    nameRequired: 'กรุณากรอกชื่อและนามสกุล (ไม่เกิน 60 ตัวอักษร)',
    usernameRule: 'ชื่อผู้ใช้ต้องยาว 3–30 ตัว ใช้ได้เฉพาะ a-z, 0-9, จุด (.), ขีดล่าง (_) และขีด (-)',
    usernameTaken: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว',
    emailRule: 'รูปแบบอีเมลไม่ถูกต้อง',
    emailTaken: 'อีเมลนี้สมัครไว้แล้ว',
    passwordRule: 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัว',
    badCode: 'รหัสยืนยันไม่ถูกต้องหรือหมดอายุ',
    cannotChangeSelf: 'เปลี่ยนสถานะหรือบทบาทของบัญชีตัวเองไม่ได้',
    userNotFound: 'ไม่พบบัญชี {username}',
    noData: 'ไม่มีข้อมูล',
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
    sheetMissing: 'ไม่พบชีต {name} (เมนู นัดคิวใส่แร่ > ตั้งค่าชีตครั้งแรก)'
  },
  en: {
    sessionExpired: 'Please log in again',
    accountSuspended: 'This account is suspended. Please contact the administrator',
    accountPending: 'This account is waiting for administrator approval',
    adminOnly: 'Administrators only',
    badLogin: 'Incorrect username or password',
    locked: 'Too many wrong passwords. Please wait 10 minutes and try again',
    nameRequired: 'Please enter your first and last name (up to 60 characters each)',
    usernameRule: 'Username must be 3–30 characters: a-z, 0-9, dot (.), underscore (_) or hyphen (-)',
    usernameTaken: 'This username is already taken',
    emailRule: 'Invalid email address',
    emailTaken: 'This email is already registered',
    passwordRule: 'Password must be at least 8 characters',
    badCode: 'The verification code is wrong or has expired',
    cannotChangeSelf: 'You cannot change the status or role of your own account',
    userNotFound: 'Account {username} not found',
    noData: 'No data',
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
    sheetMissing: 'Sheet {name} not found (menu: นัดคิวใส่แร่ > ตั้งค่าชีตครั้งแรก)'
  }
};
function msg_(lang, key, vars) {
  const dict = MSG[lang] || MSG.th;
  return String(dict[key] || MSG.th[key] || key).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? vars[k] : m));
}

const DEFAULT_SETTINGS = [
  ['CALENDAR_ID', '', 'ID ของปฏิทินที่จะลงนัด (เว้นว่าง = ใช้ CALENDAR_ID ใน Code.gs ถ้าว่างทั้งคู่ = ปฏิทินหลักของเจ้าของสคริปต์)'],
  ['EVENT_PREFIX', '[ใส่แร่]', 'คำนำหน้าชื่อนัดในปฏิทิน'],
  ['SHOW_NAME_IN_CALENDAR', 'TRUE', 'TRUE = แสดงชื่อผู้ป่วยในปฏิทิน, FALSE = แสดงเฉพาะ HN'],
  ['LOCATION', 'ห้องใส่แร่ (Brachytherapy)', 'สถานที่ที่แสดงในนัด'],
  ['MAX_CASES_PER_DAY', '6', 'จำนวนเคสสูงสุดต่อวัน ถ้าเกินจะแจ้งเตือน'],
  ['ALERT_EMAIL', '', 'อีเมลที่จะรับแจ้งเตือนเมื่อวันใดเกินจำนวนเคส (คั่นหลายอีเมลด้วย ,) เว้นว่าง = ไม่ส่งอีเมล'],
  ['REQUIRE_APPROVAL', 'TRUE', 'TRUE = ผู้สมัครใหม่ต้องรอผู้ดูแลอนุมัติก่อนเข้าใช้, FALSE = สมัครแล้วเข้าใช้ได้ทันที'],
  ['SESSION_HOURS', '12', 'เข้าสู่ระบบแล้วใช้งานได้นานกี่ชั่วโมงก่อนต้องเข้าสู่ระบบใหม่ (ถ้าติ๊ก "จำฉันไว้" = 7 วัน)']
];

/* ------------------------------------------------------------------ */
/*  Entry points                                                       */
/* ------------------------------------------------------------------ */

function doGet() {
  try {
    ensureSetup_();
  } catch (e) {
    console.error('doGet: ensureSetup_ failed: ' + (e && e.stack || e));
    return errorPage_('เปิด Google Sheet ของระบบไม่สำเร็จ กรุณาแจ้งผู้ดูแลระบบ',
      'Could not open the system\'s Google Sheet. Please contact the administrator.', String(e && e.message || e));
  }
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
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
  ss.getSheetByName(SHEET_ACCOUNTS).getRange('A:B').setNumberFormat('@');
  // ทดสอบปฏิทิน (และติดตามปฏิทินที่แชร์มาให้) แล้วแสดงผลใน "บันทึกการดำเนินการ"
  let calMsg;
  try {
    const cal = getCalendar_('th');
    calMsg = 'ปฏิทิน: ใช้งานได้ → ' + cal.getName() + ' (' + cal.getId() + ')';
  } catch (e) {
    calMsg = 'ปฏิทิน: ⚠️ ' + e.message;
  }
  console.log('สคริปต์รันในนาม: ' + scriptOwner_());
  console.log(calMsg);
  try {
    SpreadsheetApp.getUi().alert('ตั้งค่าเรียบร้อย: สร้างชีต Appointments, Doctors, Holidays, Settings, Accounts, AccessLog แล้ว\n' +
      calMsg + '\nDeploy เว็บแอป แล้วสมัครสมาชิกเป็นคนแรกทันที บัญชีแรกจะเป็นผู้ดูแลระบบ');
  } catch (e) { /* รันจาก editor ไม่มี UI */ }
}

/* ------------------------------------------------------------------ */
/*  API สมาชิก (ไม่ต้องเข้าสู่ระบบ)                                       */
/* ------------------------------------------------------------------ */

/** สมัครสมาชิก: form = { firstName, lastName, username, email, password, lang } */
function registerAccount(form) {
  const lang = form && form.lang;
  const firstName = cleanName_(form && form.firstName);
  const lastName = cleanName_(form && form.lastName);
  const username = normUsername_(form && form.username);
  const email = String(form && form.email || '').trim().toLowerCase();
  const password = String(form && form.password || '');
  if (!firstName || !lastName || firstName.length > 60 || lastName.length > 60) throw new Error(msg_(lang, 'nameRequired'));
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error(msg_(lang, 'usernameRule'));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw new Error(msg_(lang, 'emailRule'));
  if (password.length < 8 || password.length > 200) throw new Error(msg_(lang, 'passwordRule'));

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const accounts = getAccounts_();
    if (accounts.some(a => a.username === username)) throw new Error(msg_(lang, 'usernameTaken'));
    if (accounts.some(a => a.email === email)) throw new Error(msg_(lang, 'emailTaken'));

    // บัญชีแรกของระบบเป็นผู้ดูแลและใช้งานได้ทันที
    const first = accounts.length === 0;
    const needApproval = !first && String(getSettings_().REQUIRE_APPROVAL).toUpperCase() !== 'FALSE';
    const role = first ? ROLE_ADMIN : ROLE_USER;
    const status = needApproval ? ACC_PENDING : ACC_ACTIVE;
    const sh = getSheet_(SHEET_ACCOUNTS);
    sh.getRange(sh.getLastRow() + 1, 1, 1, ACCOUNT_HEADERS.length)
      .setValues([[username, email, hashPassword_(password), role, status, nowStr_(), '', firstName, lastName]]);
    SpreadsheetApp.flush();
    log_(username, 'สมัครสมาชิก', firstName + ' ' + lastName + ' / ' + email + ' / ' + role + ' / ' + status);
    if (needApproval) notifyAdminsNewAccount_(accounts, username, email, firstName + ' ' + lastName);
    return { ok: true, status: status, role: role, needApproval: needApproval };
  } finally {
    lock.releaseLock();
  }
}

/** เข้าสู่ระบบ: form = { login (ชื่อผู้ใช้หรืออีเมล), password, remember, lang } */
function login(form) {
  const lang = form && form.lang;
  const loginId = String(form && form.login || '').trim().toLowerCase();
  const password = String(form && form.password || '');
  const cache = CacheService.getScriptCache();
  const failKey = 'loginfail_' + loginId;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= LOGIN_MAX_FAILS) throw new Error(msg_(lang, 'locked'));

  const acc = getAccounts_().find(a => a.username === loginId || a.email === loginId);
  if (!acc || !verifyPassword_(password, acc.hash)) {
    cache.put(failKey, String(fails + 1), LOGIN_LOCK_SECONDS);
    log_(loginId || '(ว่าง)', 'เข้าสู่ระบบไม่สำเร็จ', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (' + (fails + 1) + ')');
    throw new Error(msg_(lang, 'badLogin'));
  }
  cache.remove(failKey);
  if (acc.status === ACC_PENDING) throw new Error(msg_(lang, 'accountPending'));
  if (acc.status !== ACC_ACTIVE) throw new Error(msg_(lang, 'accountSuspended'));

  getSheet_(SHEET_ACCOUNTS).getRange(acc.row, ACOL.lastLogin + 1).setValue(nowStr_());
  log_(acc.username, 'เข้าสู่ระบบ', '');
  const hours = form && form.remember ? 24 * 7 : Math.max(1, Number(getSettings_().SESSION_HOURS) || 12);
  return { token: makeToken_(acc.username, hours), user: publicUser_(acc) };
}

/** ลืมรหัสผ่าน ขั้นที่ 1: ส่งรหัสยืนยัน 6 หลักไปที่อีเมลของบัญชี */
function requestPasswordReset(form) {
  const loginId = String(form && form.login || '').trim().toLowerCase();
  const acc = getAccounts_().find(a => a.username === loginId || a.email === loginId);
  // ตอบเหมือนกันทุกกรณี เพื่อไม่ให้ใช้ตรวจว่ามีบัญชีนี้หรือไม่
  if (!acc || !acc.email || acc.status === ACC_SUSPENDED) return { ok: true };
  const cache = CacheService.getScriptCache();
  const countKey = 'resetcount_' + acc.username;
  const count = Number(cache.get(countKey) || 0);
  if (count >= 3) return { ok: true }; // ส่งได้ไม่เกิน 3 ครั้งต่อ 15 นาที
  const code = String(Math.floor(100000 + Math.random() * 900000));
  cache.put('reset_' + acc.username, hashPassword_(code, 1), RESET_CODE_SECONDS);
  cache.put(countKey, String(count + 1), RESET_CODE_SECONDS);
  try {
    MailApp.sendEmail({
      to: acc.email,
      subject: '[นัดคิวใส่แร่] รหัสยืนยันสำหรับตั้งรหัสผ่านใหม่',
      body: 'รหัสยืนยันของบัญชี ' + acc.username + ' คือ ' + code + '\n' +
        'ใช้ได้ภายใน 15 นาที ถ้าคุณไม่ได้ขอรหัสนี้ ไม่ต้องทำอะไร\n\n' +
        'Your verification code for ' + acc.username + ' is ' + code + ' (valid for 15 minutes).'
    });
    log_(acc.username, 'ขอรหัสตั้งรหัสผ่านใหม่', 'ส่งไปที่ ' + acc.email);
  } catch (e) {
    log_(acc.username, 'ส่งรหัสตั้งรหัสผ่านไม่สำเร็จ', e.message);
  }
  return { ok: true };
}

/** ลืมรหัสผ่าน ขั้นที่ 2: form = { login, code, password, lang } */
function resetPassword(form) {
  const lang = form && form.lang;
  const loginId = String(form && form.login || '').trim().toLowerCase();
  const code = String(form && form.code || '').trim();
  const password = String(form && form.password || '');
  if (password.length < 8 || password.length > 200) throw new Error(msg_(lang, 'passwordRule'));
  const acc = getAccounts_().find(a => a.username === loginId || a.email === loginId);
  if (!acc) throw new Error(msg_(lang, 'badCode'));
  const cache = CacheService.getScriptCache();
  const stored = cache.get('reset_' + acc.username);
  const tryKey = 'resettry_' + acc.username;
  const tries = Number(cache.get(tryKey) || 0);
  if (!stored || tries >= 5 || !verifyPassword_(code, stored)) {
    cache.put(tryKey, String(tries + 1), RESET_CODE_SECONDS);
    throw new Error(msg_(lang, 'badCode'));
  }
  getSheet_(SHEET_ACCOUNTS).getRange(acc.row, ACOL.hash + 1).setValue(hashPassword_(password));
  cache.removeAll(['reset_' + acc.username, tryKey, 'loginfail_' + acc.username, 'loginfail_' + acc.email]);
  log_(acc.username, 'ตั้งรหัสผ่านใหม่', 'ผ่านรหัสยืนยันทางอีเมล');
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/*  API ที่ต้องเข้าสู่ระบบ (ส่ง token มาทุกครั้ง)                          */
/* ------------------------------------------------------------------ */

function getInitData(token, lang) {
  ensureSetup_();
  const acc = requireUser_(token, lang);
  const settings = getSettings_();
  return {
    user: publicUser_(acc),
    doctors: getDoctors_(),
    techniques: TECHNIQUES,
    holidays: getHolidays_(),
    settings: {
      maxCasesPerDay: maxCases_(settings),
      calendarName: calendarNameSafe_(lang)
    },
    appointments: listAppointments_(),
    pendingAccounts: acc.role === ROLE_ADMIN ? getAccounts_().filter(a => a.status === ACC_PENDING).length : 0
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

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
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
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
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

/** (ผู้ดูแล) รายชื่อบัญชีทั้งหมด */
function listAccounts(token, lang) {
  requireAdmin_(token, lang);
  return getAccounts_().map(publicUser_);
}

/** (ผู้ดูแล) เปลี่ยนสถานะ/บทบาท: changes = { status?: 'ใช้งาน'|'ระงับ', role?: 'admin'|'user' } */
function updateAccount(token, username, changes, lang) {
  const admin = requireAdmin_(token, lang);
  const target = normUsername_(username);
  if (target === admin.username) throw new Error(msg_(lang, 'cannotChangeSelf'));
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const acc = getAccounts_().find(a => a.username === target);
    if (!acc) throw new Error(msg_(lang, 'userNotFound', { username: target }));
    const sh = getSheet_(SHEET_ACCOUNTS);
    const done = [];
    if (changes && [ACC_ACTIVE, ACC_SUSPENDED].indexOf(changes.status) >= 0 && changes.status !== acc.status) {
      sh.getRange(acc.row, ACOL.status + 1).setValue(changes.status);
      done.push('สถานะ ' + acc.status + ' → ' + changes.status);
    }
    if (changes && [ROLE_ADMIN, ROLE_USER].indexOf(changes.role) >= 0 && changes.role !== acc.role) {
      sh.getRange(acc.row, ACOL.role + 1).setValue(changes.role);
      done.push('บทบาท ' + acc.role + ' → ' + changes.role);
    }
    SpreadsheetApp.flush();
    if (done.length) log_(admin.username, 'แก้ไขบัญชี', target + ': ' + done.join(', '));
    return getAccounts_().map(publicUser_);
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/*  บัญชี / รหัสผ่าน / token / log                                      */
/* ------------------------------------------------------------------ */

function normUsername_(u) {
  return String(u || '').trim().toLowerCase();
}

/** ตัดช่องว่างหัวท้าย/ช่องว่างซ้ำ และตัวอักษรที่อาจทำให้ชีตตีความเป็นสูตร */
function cleanName_(v) {
  return String(v || '').replace(/\s+/g, ' ').trim().replace(/^[=+\-@]+/, '');
}

function getAccounts_() {
  const sh = getSheet_(SHEET_ACCOUNTS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, ACCOUNT_HEADERS.length).getDisplayValues()
    .map((r, i) => ({
      row: i + 2,
      username: normUsername_(r[ACOL.username]),
      email: String(r[ACOL.email]).trim().toLowerCase(),
      hash: String(r[ACOL.hash]).trim(),
      role: String(r[ACOL.role]).trim() === ROLE_ADMIN ? ROLE_ADMIN : ROLE_USER,
      status: String(r[ACOL.status]).trim(),
      createdAt: r[ACOL.createdAt],
      lastLogin: r[ACOL.lastLogin],
      firstName: String(r[ACOL.firstName] || '').trim(),
      lastName: String(r[ACOL.lastName] || '').trim()
    }))
    .filter(a => a.username);
}

function publicUser_(a) {
  return {
    username: a.username, email: a.email, role: a.role, status: a.status, createdAt: a.createdAt, lastLogin: a.lastLogin,
    firstName: a.firstName, lastName: a.lastName, fullName: (a.firstName + ' ' + a.lastName).trim()
  };
}

/** ตรวจ token แล้วคืนบัญชี (ต้องสถานะ "ใช้งาน") */
function requireUser_(token, lang) {
  const username = parseToken_(token);
  if (!username) throw new Error(AUTH_ERR + msg_(lang, 'sessionExpired'));
  const acc = getAccounts_().find(a => a.username === username);
  if (!acc) throw new Error(AUTH_ERR + msg_(lang, 'sessionExpired'));
  if (acc.status === ACC_PENDING) throw new Error(AUTH_ERR + msg_(lang, 'accountPending'));
  if (acc.status !== ACC_ACTIVE) throw new Error(AUTH_ERR + msg_(lang, 'accountSuspended'));
  return acc;
}

function requireAdmin_(token, lang) {
  const acc = requireUser_(token, lang);
  if (acc.role !== ROLE_ADMIN) throw new Error(msg_(lang, 'adminOnly'));
  return acc;
}

function bytesToB64_(bytes) { return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, ''); }

/** hash รหัสผ่านแบบ salt + SHA-256 วนหลายรอบ เก็บเป็น v1$รอบ$salt$hash */
function hashPassword_(password, iterations, salt) {
  const iters = iterations || PW_ITERATIONS;
  const s = salt || bytesToB64_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Math.random()));
  const pw = Utilities.newBlob(String(password)).getBytes();
  let h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s + ':' + password, Utilities.Charset.UTF_8);
  for (let i = 1; i < iters; i++) h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h.concat(pw));
  return 'v1$' + iters + '$' + s + '$' + bytesToB64_(h);
}

function verifyPassword_(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  return safeEqual_(hashPassword_(password, Number(parts[1]), parts[2]), stored);
}

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

function makeToken_(username, hours) {
  const payload = username + '|' + (Date.now() + hours * 3600 * 1000);
  const sig = bytesToB64_(Utilities.computeHmacSha256Signature(payload, authSecret_()));
  return bytesToB64_(Utilities.newBlob(payload).getBytes()) + '.' + sig;
}

/** คืนชื่อผู้ใช้จาก token ที่ถูกต้องและยังไม่หมดอายุ ไม่งั้นคืน '' */
function parseToken_(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 2) return '';
    const payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
    const sig = bytesToB64_(Utilities.computeHmacSha256Signature(payload, authSecret_()));
    if (!safeEqual_(sig, parts[1])) return '';
    const i = payload.lastIndexOf('|');
    if (Number(payload.slice(i + 1)) < Date.now()) return '';
    return payload.slice(0, i);
  } catch (e) {
    return '';
  }
}

function notifyAdminsNewAccount_(accounts, username, email, fullName) {
  const to = accounts.filter(a => a.role === ROLE_ADMIN && a.status === ACC_ACTIVE && a.email).map(a => a.email).join(',');
  if (!to) return;
  try {
    MailApp.sendEmail({
      to: to,
      subject: '[นัดคิวใส่แร่] มีผู้สมัครใหม่รออนุมัติ: ' + fullName + ' (' + username + ')',
      body: 'ผู้สมัครใหม่: ' + fullName + '\nชื่อผู้ใช้: ' + username + '\nอีเมล: ' + email +
        '\nเข้าสู่ระบบแล้วไปที่แท็บ "ผู้ใช้" เพื่ออนุมัติหรือระงับ'
    });
  } catch (e) {
    log_(username, 'แจ้งผู้ดูแลไม่สำเร็จ', e.message);
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
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
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
  const full = ((acc.firstName || '') + ' ' + (acc.lastName || '')).trim();
  return full ? full + ' (' + acc.username + ')' : acc.username;
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
  const id = String(getSettings_().CALENDAR_ID || CALENDAR_ID || '').trim();
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

function ensureSetup_() {
  const ss = ss_();

  let sh = ss.getSheetByName(SHEET_APPTS);
  if (!sh) {
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
    if (h === 'เวลาเริ่ม') sh.deleteColumns(10, 2);
    else if (h === 'ชนิด') sh.deleteColumn(10);
    // เติมหัวคอลัมน์ใหม่ (รูปแบบการใส่ / ประวัติการแก้ไข) ที่ต่อท้าย
    if (sh.getLastColumn() < APPT_HEADERS.length) {
      sh.getRange(1, 1, 1, APPT_HEADERS.length).setValues([APPT_HEADERS]).setFontWeight('bold').setBackground('#ede7f6');
    }
  }

  sh = ss.getSheetByName(SHEET_DOCTORS);
  if (!sh) {
    sh = ss.insertSheet(SHEET_DOCTORS);
    sh.getRange(1, 1).setValue('ชื่อแพทย์').setFontWeight('bold');
    sh.getRange(2, 1, DEFAULT_DOCTORS.length, 1).setValues(DEFAULT_DOCTORS.map(d => [d]));
  } else if (sh.getLastRow() >= 2) {
    // แทนที่รายชื่อตัวอย่างจากเวอร์ชันก่อนด้วยรายชื่อแพทย์จริง
    const cur = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().map(r => r[0].trim()).filter(Boolean);
    if (cur.length && cur.every(n => OLD_SAMPLE_DOCTORS.indexOf(n) >= 0)) {
      sh.getRange(2, 1, sh.getLastRow() - 1, 1).clearContent();
      sh.getRange(2, 1, DEFAULT_DOCTORS.length, 1).setValues(DEFAULT_DOCTORS.map(d => [d]));
    }
  }

  sh = ss.getSheetByName(SHEET_HOLIDAYS);
  if (!sh) {
    sh = ss.insertSheet(SHEET_HOLIDAYS);
    sh.getRange(1, 1, 1, 2).setValues([['วันที่ (yyyy-MM-dd)', 'ชื่อวันหยุด']]).setFontWeight('bold');
    sh.getRange('A:A').setNumberFormat('@');
  }

  sh = ss.getSheetByName(SHEET_SETTINGS);
  if (!sh) {
    sh = ss.insertSheet(SHEET_SETTINGS);
    sh.getRange(1, 1, 1, 3).setValues([['คีย์', 'ค่า', 'คำอธิบาย']]).setFontWeight('bold');
  }
  // เติมคีย์ที่ยังไม่มี (เช่น อัปเดตจากเวอร์ชันก่อน)
  const have = sh.getLastRow() >= 2
    ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().map(r => r[0].trim()) : [];
  const missing = DEFAULT_SETTINGS.filter(s => have.indexOf(s[0]) < 0);
  if (missing.length) {
    sh.getRange(sh.getLastRow() + 1, 1, missing.length, 3).setNumberFormat('@').setValues(missing);
    sh.autoResizeColumns(1, 3);
  }

  sh = ss.getSheetByName(SHEET_ACCOUNTS);
  if (!sh) {
    sh = ss.insertSheet(SHEET_ACCOUNTS);
    sh.getRange(1, 1, 1, ACCOUNT_HEADERS.length).setValues([ACCOUNT_HEADERS])
      .setFontWeight('bold').setBackground('#ede7f6');
    sh.setFrozenRows(1);
    sh.getRange('A:B').setNumberFormat('@');
  } else if (sh.getLastColumn() < ACCOUNT_HEADERS.length) {
    // ชีต Accounts จากเวอร์ชันก่อน: เติมหัวคอลัมน์ ชื่อ / นามสกุล
    sh.getRange(1, 1, 1, ACCOUNT_HEADERS.length).setValues([ACCOUNT_HEADERS]).setFontWeight('bold').setBackground('#ede7f6');
  }

  sh = ss.getSheetByName(SHEET_LOG);
  if (!sh) {
    sh = ss.insertSheet(SHEET_LOG);
    sh.getRange(1, 1, 1, 4).setValues([['เวลา', 'ผู้ใช้', 'การกระทำ', 'รายละเอียด']])
      .setFontWeight('bold').setBackground('#ede7f6');
    sh.setFrozenRows(1);
  }
}
