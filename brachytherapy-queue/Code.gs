/**
 * ระบบนัดคิวผู้ป่วยใส่แร่ (Brachytherapy Appointment Queue)
 * กลุ่มงานรังสีรักษา โรงพยาบาลมะเร็งลำปาง
 *
 * - หน้าเว็บกรอก HN / ชื่อผู้ป่วย / แพทย์ / จำนวน fraction (เปลี่ยนภาษา ไทย/อังกฤษ และโหมดกลางวัน/กลางคืนได้)
 * - กดปุ่มเดียว: สร้างนัดทุก fraction ลง Google Calendar (ทั้งวัน) + บันทึกลง Google Sheet
 * - ข้อมูลอยู่ในชีตเดียวกับ Treatment Planning Management (ระบบกระจายงานฟิสิกส์การแพทย์): DATA_SHEET_ID
 *   นัดอยู่ในแท็บ BrachyQueue ใช้ร่วมกับแถบ "นัดคิวใส่แร่" ของระบบนั้น (คอลัมน์ Calendar Event ID เป็นของระบบนี้)
 *   แพทย์ ทีมนักฟิสิกส์ รูปแบบการใส่ วันหยุด จำนวนเคสสูงสุด และสิทธิ์ลงชื่อ MP / RC อ่านจากแท็บ Config ของระบบนั้น
 *   การตั้งค่าปฏิทินของระบบนี้อยู่ในแท็บ BQ Settings · บันทึกการใช้งานอยู่ในแท็บ BQ Log
 *   ย้ายเคสจากชีตเดิม: ทำให้เองครั้งแรกที่เปิดเว็บหลังอัปเดต (หรือรัน migrateFromOldSheet เอง · รันซ้ำได้ ไม่เพิ่มซ้ำ)
 * - แจ้งเตือนเมื่อวันใดมีเคสเกินกำหนด (ค่าเริ่มต้น 6 เคส/วัน)
 * - เข้าสู่ระบบด้วยบัญชี LPCH RO Workspace (WORKSPACE_URL) ระบบนี้ไม่เก็บรหัสผ่านเอง
 *   สมัครสมาชิก อนุมัติ ระงับ และลืมรหัสผ่าน ทำที่ Workspace ทั้งหมด
 *   เปิดจากปุ่มใน Workspace ที่ติ๊ก "เข้าสู่ระบบอัตโนมัติ" (?sso=...) จะเข้าได้ทันทีโดยไม่ต้องกรอกรหัสผ่าน
 *   บันทึกทุกการใช้งานในแท็บ BQ Log
 * - ยกเลิกนัดได้ (ลบ event ในปฏิทิน และเปลี่ยนสถานะในชีต)
 *
 * Deploy เป็น Web app แบบ Execute as: "Me", Who has access: "Anyone" (บัญชีที่ Deploy ต้องแก้ไขชีต DATA_SHEET_ID ได้)
 * ครั้งแรกหลังอัปเดตเป็นการเข้าสู่ระบบผ่าน Workspace: เลือกฟังก์ชัน setup แล้วกด Run หนึ่งครั้ง
 * เพื่ออนุญาตสิทธิ์ "เชื่อมต่อกับบริการภายนอก" (UrlFetchApp) ก่อน Deploy เวอร์ชันใหม่
 */

/** เว็บ LPCH RO Workspace ที่ใช้ตรวจชื่อผู้ใช้/รหัสผ่าน (ต้อง Deploy แบบ Who has access: Anyone) */
const WORKSPACE_URL = 'https://script.google.com/macros/s/AKfycbwBVKgsqip8pavg0H-ibZFcR-9petxW12W3A8eNkO5CI8swiRIk347QMh42JryQJ_k/exec';
/**
 * ชีตข้อมูลหลัก = ชีตของ Treatment Planning Management (ระบบกระจายงานฟิสิกส์การแพทย์)
 * เปลี่ยนได้ที่ Script property DATA_SHEET_ID (ใส่ ID หรือลิงก์ของชีต)
 */
const DATA_SHEET_ID = '1lW4T3rENJatBIULjXNDOMBvIBzMAssPjnmZtY7Q-5yk';
/**
 * เปิดเว็บนี้แล้วพาไปหน้าเว็บนี้แทน (ใช้แถบนัดคิวใส่แร่ของ Treatment Planning Management แทนหน้าเว็บของระบบนี้)
 * บัตรผ่าน ?sso= จาก LPCH RO Workspace ส่งต่อไปด้วย จึงเข้าสู่ระบบอัตโนมัติได้เหมือนเดิม
 * เปลี่ยนได้ที่ Script property REDIRECT_URL · ใส่ - เพื่อปิดการพาไปและใช้หน้าเว็บของระบบนี้ตามเดิม
 */
const REDIRECT_URL = 'https://script.google.com/macros/s/AKfycbzbb97RT1RdFDzVp0EB10ecOSFjtNCxcL_mSOPnD5ofSPzUA6FmNSO6P9h3vCUep3oa/exec';
/** ชีตเดิมของระบบนี้ (ใช้ตอนย้ายข้อมูลด้วย migrateFromOldSheet เท่านั้น · เปลี่ยนได้ที่ Script property OLD_SHEET_ID) */
const OLD_SHEET_ID = '1kYj1MUI7APT4Q__LoTCHrcTt10v0_216Yf-rsCEY34Y';

/**
 * ปฏิทินที่จะลงนัด: ใช้ปฏิทินในบัญชีที่ Deploy สคริปต์ ที่ชื่อตรงกับ CALENDAR_NAME
 * (ปฏิทินใน "ปฏิทินอื่นๆ / Other calendars" ก็ได้ ถ้าบัญชีนั้นมีสิทธิ์แก้ไขกิจกรรม)
 * ถ้าใส่ CALENDAR_ID (ในชีต Settings หรือที่นี่) ระบบจะใช้ ID แทนชื่อ
 */
const CALENDAR_NAME = 'คิวใส่แร่';
const CALENDAR_ID = '';

/** แท็บนัดที่ใช้ร่วมกับระบบกระจายงาน (คอลัมน์ตามชื่อหัวตาราง · ลำดับคอลัมน์ไม่สำคัญ) */
const SHEET_BQ = 'BrachyQueue';
const BQ_FIELDS = [
  ['id', 'id'], ['course', 'คอร์ส'], ['date', 'วันที่นัด'], ['hn', 'HN'], ['name', 'ชื่อ-สกุล'], ['doc', 'แพทย์'], ['tech', 'รูปแบบการใส่'],
  ['fx', 'Fx'], ['total', 'จำนวน Fx'], ['note', 'หมายเหตุ'], ['status', 'สถานะ'], ['mp', 'MP'], ['rc', 'RC'],
  ['hist', 'ประวัติการแก้ไข (JSON)'], ['src', 'ที่มา'], ['by', 'ลงนัดโดย'], ['created', 'Created'], ['editedBy', 'แก้ไขโดย'], ['updated', 'Updated'],
  ['eventId', 'Calendar Event ID']   // ของระบบนี้ (ระบบกระจายงานไม่ได้ใช้)
];
const SHEET_CONFIG = 'Config';          // การตั้งค่าของระบบกระจายงาน (key, ค่า JSON)
const SHEET_SETTINGS = 'BQ Settings';   // การตั้งค่าปฏิทินของระบบนี้
const SHEET_LOG = 'BQ Log';
/** ค่าเริ่มต้นเมื่อ Config ยังไม่มีค่า (เหมือนระบบกระจายงาน) */
const DEFAULT_BQ = { max: 6, techs: ['Full', 'Mould', 'เสียบเข็ม'], signRoles: ['MP'], signUsers: [] };
const DEFAULT_DOCTOR_CODES = ['SC', 'TA', 'PM', 'TC', 'VS'];
const DEFAULT_STAFF = ['JR', 'WM', 'NY', 'WS'];
/** ประวัติการแก้ไข: ชื่อช่องของหน้าเว็บนี้ ↔ ชื่อช่องในแท็บ BrachyQueue */
const HIST_TO_BQ = { doctor: 'doc', technique: 'tech' };
const HIST_FROM_BQ = { doc: 'doctor', tech: 'technique' };

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
    wsNeedsAnyone: 'Workspace ตอบเป็นหน้าลงชื่อเข้าใช้ Google: ในโปรเจกต์ Workspace ไปที่ Deploy → จัดการการทำให้ใช้งานได้ → ✏️ แล้วตั้ง "ผู้มีสิทธิ์เข้าถึง" เป็น "ทุกคน" (Anyone) ไม่ใช่ "ทุกคนที่มีบัญชี Google"',
    wsNoDoPost: 'เวอร์ชันที่ Deploy ของ Workspace ไม่มีฟังก์ชัน doPost: วาง Code.gs ล่าสุดของ Workspace แล้ว Deploy เป็นเวอร์ชันใหม่ (ใช้ลิงก์ /exec เดิม)',
    wsHtml: 'Workspace ตอบเป็นหน้าเว็บแทนข้อมูล ({title}) ตรวจว่า WORKSPACE_URL ใน Code.gs ตรงกับลิงก์ /exec ของ Workspace',
    noData: 'ไม่มีข้อมูล',
    busy: 'มีผู้ใช้อื่นกำลังบันทึกข้อมูลอยู่ กรุณารอสักครู่แล้วลองใหม่',
    technique: 'กรุณาเลือกรูปแบบการใส่ หรือกรอกในช่อง "อื่นๆ" (ไม่เกิน 100 ตัวอักษร)',
    statusInvalid: 'สถานะไม่ถูกต้อง',
    dateInvalid: 'วันที่นัดไม่ถูกต้อง',
    noteTooLong: 'หมายเหตุยาวเกินไป (ไม่เกิน 500 ตัวอักษร)',
    signTooLong: 'ชื่อ MP / RC ยาวเกินไป (ไม่เกิน 100 ตัวอักษร)',
    rcSameAsMp: 'RC ต้องไม่ใช่คนเดียวกับ MP (ผู้วางแผน)',
    signDenied: 'บันทึก MP / RC ได้เฉพาะผู้ที่เข้าสู่ระบบด้วยตำแหน่ง {roles} (แอดมินเปลี่ยนได้ที่ ⚙️ ตั้งค่า)',
    configBusy: 'การตั้งค่าในชีตอ่านไม่ได้ (แท็บ Config) ลองใหม่อีกครั้ง',
    adminOnly: 'เฉพาะผู้ดูแลระบบ (แอดมินของ LPCH RO Workspace) เท่านั้นที่แก้การตั้งค่าได้',
    maxInvalid: 'จำนวนเคสสูงสุดต่อวันต้องเป็นตัวเลข 1–50',
    hn: 'กรุณากรอก HN',
    name: 'กรุณากรอกชื่อผู้ป่วย',
    doctor: 'กรุณาเลือกแพทย์',
    doctorUnknown: 'แพทย์ "{doctor}" ไม่อยู่ในรายชื่อแพทย์ (ระบบกระจายงาน → ตั้งค่า → แพทย์)',
    fxRange: 'จำนวน fraction ต้องอยู่ระหว่าง 1–30',
    fxMismatch: 'จำนวนวันนัดไม่ตรงกับจำนวน fraction',
    fxDate: 'วันที่ของ Fx {n} ไม่ถูกต้อง',
    calFail: 'สร้างนัดในปฏิทินไม่สำเร็จ: {err}',
    notFound: 'ไม่พบนัด {id}',
    calMissing: 'ใช้ปฏิทิน {id} ไม่ได้: สคริปต์รันในนาม {who} ให้ {id} แชร์ปฏิทินให้ {who} ด้วยสิทธิ์ "ทำการเปลี่ยนแปลงกิจกรรม" แล้วรัน setup อีกครั้ง{detail}',
    calNameMissing: 'ไม่พบปฏิทินชื่อ "{name}" ในบัญชี {who} (ปฏิทินที่มี: {list}) ตรวจสอบชื่อที่ CALENDAR_NAME',
    sheetMissing: 'ไม่พบแท็บ {name} ในชีตข้อมูล (รันฟังก์ชัน setup)'
  },
  en: {
    sessionExpired: 'Please log in again',
    loginRequired: 'Please enter your username or email and password',
    ssoInvalid: 'This sign-in link is not valid. Please log in again',
    workspaceDown: 'Could not reach LPCH RO Workspace ({err}). Please try again, or tell the administrator',
    wsNeedsAnyone: 'Workspace answered with a Google sign-in page: in the Workspace project open Deploy → Manage deployments → ✏️ and set "Who has access" to "Anyone", not "Anyone with Google account"',
    wsNoDoPost: 'The deployed Workspace version has no doPost function: paste the latest Workspace Code.gs and deploy a new version (keep the same /exec link)',
    wsHtml: 'Workspace answered with a web page instead of data ({title}). Check that WORKSPACE_URL in Code.gs is the Workspace /exec link',
    noData: 'No data',
    busy: 'Someone else is saving right now. Please wait a moment and try again',
    technique: 'Please choose an insertion type, or type one under "Other" (up to 100 characters)',
    statusInvalid: 'Invalid status',
    dateInvalid: 'Invalid appointment date',
    noteTooLong: 'Note is too long (up to 500 characters)',
    signTooLong: 'MP / RC name is too long (up to 100 characters)',
    rcSameAsMp: 'RC must be a different person from the MP (planner)',
    signDenied: 'Only users signed in with role {roles} can record MP / RC (an admin can change this in ⚙️ Settings)',
    configBusy: 'Could not read the settings (Config tab). Please try again',
    adminOnly: 'Only administrators (LPCH RO Workspace admins) can change the settings',
    maxInvalid: 'Max cases per day must be a number from 1 to 50',
    hn: 'Please enter HN',
    name: 'Please enter patient name',
    doctor: 'Please select a doctor',
    doctorUnknown: 'Doctor "{doctor}" is not in the doctor list (Treatment Planning Management → Settings → Doctors)',
    fxRange: 'Fractions must be between 1 and 30',
    fxMismatch: 'Number of dates does not match number of fractions',
    fxDate: 'Invalid date for Fx {n}',
    calFail: 'Could not create calendar events: {err}',
    notFound: 'Appointment {id} not found',
    calMissing: 'Cannot use calendar {id}: the script runs as {who}. {id} must share the calendar with {who} with "Make changes to events", then run setup again{detail}',
    calNameMissing: 'No calendar named "{name}" in {who} (calendars found: {list}). Check CALENDAR_NAME',
    sheetMissing: 'Tab {name} not found in the data sheet (run setup)'
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
  ['ALERT_EMAIL', '', 'อีเมลที่จะรับแจ้งเตือนเมื่อวันใดเกินจำนวนเคส (คั่นหลายอีเมลด้วย ,) เว้นว่าง = ไม่ส่งอีเมล'],
  ['SESSION_HOURS', '12', 'เข้าสู่ระบบแล้วใช้งานได้นานกี่ชั่วโมงก่อนต้องเข้าสู่ระบบใหม่ (ถ้าติ๊ก "จำฉันไว้" = 7 วัน)']
];
// จำนวนเคสสูงสุดต่อวัน รูปแบบการใส่ และสิทธิ์ลงชื่อ MP / RC อยู่ใน Config (key bq) ใช้ร่วมกับระบบกระจายงาน
/** ตำแหน่งใน LPCH RO Workspace (ตัวเลือกในหน้าตั้งค่า) */
const WS_ROLES = ['RO', 'MP', 'RTT', 'Nurse', 'Other'];

/* ------------------------------------------------------------------ */
/*  Entry points                                                       */
/* ------------------------------------------------------------------ */

function doGet(e) {
  const go = redirectUrl_(e && e.parameter);
  if (go) return redirectPage_(go);
  try {
    ensureSetup_();
  } catch (err) {
    console.error('doGet: ensureSetup_ failed: ' + (err && err.stack || err));
    return errorPage_('เปิด Google Sheet ของระบบไม่สำเร็จ กรุณาแจ้งผู้ดูแลระบบ',
      'Could not open the system\'s Google Sheet. Please contact the administrator.', String(err && err.message || err));
  }
  autoMigrate_();
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
    .addItem('ตั้งค่า / ตรวจระบบ', 'setup')
    .addItem('ย้ายข้อมูลจากชีตเดิม', 'migrateFromOldSheet')
    .addItem('ซิงก์ปฏิทินกับแท็บ BrachyQueue', 'syncCalendar')
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
  authSecret_(); // สร้างกุญแจลงชื่อ token ไว้ล่วงหน้า
  autoMigrate_();
  const ss = ss_();
  const conf = conf_(true);
  const props = PropertiesService.getScriptProperties();
  const migMsg = props.getProperty('MIGRATED_FROM') ? 'ย้ายเคสจากชีตเดิมแล้ว: ' + props.getProperty('MIGRATED_FROM')
    : '⚠️ ยังย้ายเคสจากชีตเดิมไม่ได้: ' + (props.getProperty('MIGRATE_ERROR') || '-');
  const dataMsg = 'ชีตข้อมูล: ' + ss.getName() + ' · นัดในแท็บ ' + SHEET_BQ + ' ' + listAppointments_().length + ' รายการ';
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
  const mpMsg = 'ทีมนักฟิสิกส์ (MP / RC): ' + (conf.staff.map(x => x.code + (x.name ? ' ' + x.name : '')).join(', ') || '⚠️ ไม่พบ');
  const docMsg = 'แพทย์: ' + (conf.doctors.map(x => x.code + (x.name ? ' ' + x.name : '')).join(', ') || '⚠️ ไม่พบ');
  const bqMsg = 'จำนวนเคสสูงสุด/วัน ' + conf.bq.max + ' · รูปแบบการใส่ ' + conf.bq.techs.join(', ') + ' · ลงชื่อ MP / RC: ' + (conf.bq.signRoles.join(', ') || '-') +
    ' · วันหยุด ' + conf.holidays.length + ' วัน';
  [ 'สคริปต์รันในนาม: ' + scriptOwner_(), dataMsg, migMsg, calMsg, wsMsg, mpMsg, docMsg, bqMsg ].forEach(m => console.log(m));
  try {
    SpreadsheetApp.getUi().alert('ตั้งค่าเรียบร้อย\n' + [dataMsg, migMsg, calMsg, wsMsg, mpMsg, docMsg, bqMsg].join('\n') +
      '\nDeploy เว็บแอปเวอร์ชันใหม่ แล้วเข้าสู่ระบบด้วยบัญชี LPCH RO Workspace');
  } catch (e) { /* รันจาก editor ไม่มี UI */ }
}

/**
 * ย้ายข้อมูลจากชีตเดิม (OLD_SHEET_ID) มาชีตข้อมูลหลัก: รันจากหน้าแก้ไขสคริปต์หนึ่งครั้ง (รันซ้ำได้ ไม่เพิ่มซ้ำ)
 * - นัด (Appointments) → BrachyQueue: id = เลขนัดเดิม, ที่มา = bq:<เลขนัด> (แบบเดียวกับปุ่มนำเข้าของระบบกระจายงาน)
 *   นัดที่นำเข้าไว้แล้ว (จากปุ่มนำเข้าหรือรันครั้งก่อน): เติม Calendar Event ID และเปลี่ยนชื่อแพทย์เป็นรหัสถ้าจับคู่ได้ (ช่องอื่นไม่แตะ)
 * - แพทย์ / MP / RC จับคู่กับรหัสใน Config ตามชื่อ (ไม่ตรง = เก็บข้อความเดิม แล้วแจ้งในบันทึก)
 * - Settings: ค่าปฏิทิน → BQ Settings · จำนวนเคสสูงสุด / สิทธิ์ MP RC → Config bq (เฉพาะเมื่อยังไม่มี)
 * - Holidays → Config holidays (เพิ่มเฉพาะวันที่ยังไม่มี) · AccessLog → BQ Log (ครั้งแรกเท่านั้น)
 */
function migrateFromOldSheet(auto) {
  ensureSetup_();
  const props = PropertiesService.getScriptProperties();
  auto = auto === true;
  const rawId = String(props.getProperty('OLD_SHEET_ID') || OLD_SHEET_ID || '').trim();
  const oldId = (rawId.match(/\/d\/([a-zA-Z0-9_-]+)/) || [])[1] || rawId;
  const ss = ss_();
  if (!oldId || oldId === ss.getId()) throw new Error('OLD_SHEET_ID ต้องเป็นชีตเดิมของระบบนัดคิว (ไม่ใช่ชีตข้อมูลหลัก)');
  const old = SpreadsheetApp.openById(oldId);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error(msg_('th', 'busy'));
  const report = ['ย้ายจาก "' + old.getName() + '" → "' + ss.getName() + '"' + (auto ? ' (อัตโนมัติ)' : '')];
  try {
    // ย้ายอัตโนมัติ: คนอื่นเพิ่งย้ายเสร็จระหว่างรอล็อก = ไม่ต้องทำซ้ำ
    if (auto && props.getProperty('MIGRATED_FROM')) return '';
    const conf = conf_(true), raw = readConfigRaw_();
    const strip = v => String(v || '').replace(/^(นพ\.|พญ\.|นาย|นางสาว|นาง|น\.ส\.|ดร\.)\s*/, '').replace(/\s+/g, '').toLowerCase();
    const docOf = v => {
      const t = String(v || '').trim();
      const hit = t && conf.doctors.find(x => x.code === t.toUpperCase() || (x.name && strip(x.name) === strip(t)));
      return hit ? hit.code : t;
    };
    const staffOf = v => {
      const t = String(v || '').trim();
      const hit = t && conf.staff.find(x => x.code === t.toUpperCase() || (x.name && strip(x.name) === strip(t)));
      return hit ? hit.code : t;
    };
    const techOf = v => (/^interstitial/i.test(v) && conf.bq.techs.indexOf(v) < 0 && conf.bq.techs.indexOf('เสียบเข็ม') >= 0 ? 'เสียบเข็ม' : v);

    // 1) นัด
    const sh = old.getSheetByName('Appointments');
    const unknownDoc = {}, unknownStaff = {};
    let added = 0, linked = 0, docFixed = 0, kept = 0;
    if (sh && sh.getLastRow() >= 2) {
      const values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getDisplayValues();
      const head = values.shift().map(v => String(v).trim());
      const C = { id: 'เลขนัด', course: 'รหัสคอร์ส', created: 'วันที่บันทึก', hn: 'HN', name: 'ชื่อ-สกุลผู้ป่วย', doc: 'แพทย์',
        fx: 'Fraction ที่', total: 'จำนวน Fraction', date: 'วันที่นัด', note: 'หมายเหตุ', status: 'สถานะ', eventId: 'Calendar Event ID',
        by: 'ผู้บันทึก', tech: 'รูปแบบการใส่', editedBy: 'แก้ไขล่าสุดโดย', updated: 'แก้ไขล่าสุดเมื่อ', hist: 'ประวัติการแก้ไข',
        mp: 'MP (ผู้วางแผน)', rc: 'RC (Recheck)' };
      const at = {};
      Object.keys(C).forEach(k => { at[k] = head.indexOf(C[k]); });
      if (at.id < 0 || at.hn < 0 || at.date < 0) throw new Error('แท็บ Appointments ของชีตเดิมไม่มีคอลัมน์ เลขนัด / HN / วันที่นัด');
      const have = {};
      readBq_().forEach(o => { have[o.id] = o; if (o.src) have[o.src] = o; });
      const recs = [], eventPatch = {}, docPatch = {};
      values.forEach(r => {
        const g = k => (at[k] < 0 ? '' : String(r[at[k]]).trim());
        const id = g('id');
        if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(g('date')) || !g('hn')) return;
        const hit = have[id] || have['bq:' + id];
        if (hit) {
          // มีอยู่แล้ว: เติมเฉพาะ event ที่ยังไม่มี และแพทย์ที่ยังเป็นชื่อเต็ม
          if (!hit.eventId && g('eventId')) { eventPatch[hit.id] = g('eventId'); linked++; }
          const code = docOf(hit.doc);
          if (code !== hit.doc && conf.doctors.some(x => x.code === code)) { docPatch[hit.id] = code; docFixed++; }
          if (!eventPatch[hit.id] && !docPatch[hit.id]) kept++;
          return;
        }
        const doc = docOf(g('doc')), mp = g('mp'), rc = g('rc');
        if (g('doc') && !conf.doctors.some(x => x.code === doc)) unknownDoc[doc] = (unknownDoc[doc] || 0) + 1;
        [mp, rc].forEach(v => { if (v && !conf.staff.some(x => x.code === staffOf(v))) unknownStaff[v] = (unknownStaff[v] || 0) + 1; });
        let hist = [];
        try { hist = JSON.parse(g('hist') || '[]'); } catch (e) { hist = []; }
        hist = (Array.isArray(hist) ? hist : []).map(h => ({ at: String(h.at || ''), by: String(h.name || h.by || ''),
          ch: (Array.isArray(h.changes) ? h.changes : Array.isArray(h.ch) ? h.ch : [])
            .map(c => ({ f: HIST_TO_BQ[c.f] || c.f, from: String(c.from == null ? '' : c.from), to: String(c.to == null ? '' : c.to) })) }));
        const st = g('status');
        recs.push({ id: id, course: g('course'), date: g('date'), hn: g('hn'), name: g('name'), doc: doc, tech: techOf(g('tech')),
          fx: g('fx'), total: g('total'), note: g('note'),
          status: /ยกเลิก/.test(st) ? STATUS_CANCELLED : /มาตามนัด|มาแล้ว/.test(st) ? STATUS_DONE : STATUS_BOOKED,
          mp: staffOf(mp), rc: staffOf(rc), hist: hist.length ? JSON.stringify(hist.slice(-40)) : '', src: 'bq:' + id,
          by: g('by'), created: g('created'), editedBy: g('editedBy'), updated: g('updated'), eventId: g('eventId') });
        have[id] = { id: id };
      });
      bqAppend_(recs);
      added = recs.length;
      bqPatchColumn_('eventId', eventPatch);
      bqPatchColumn_('doc', docPatch);
    }
    report.push('นัด: เพิ่มใหม่ ' + added + ' · มีอยู่แล้ว ' + (linked + docFixed + kept) + ' (เติม Calendar Event ID ' + linked + ' · แพทย์เป็นรหัส ' + docFixed + ')');
    if (Object.keys(unknownDoc).length) report.push('⚠️ แพทย์ที่ไม่อยู่ในรายชื่อ (เก็บชื่อเดิม): ' +
      Object.keys(unknownDoc).map(k => k + ' ×' + unknownDoc[k]).join(', ') + ' → เพิ่มที่ระบบกระจายงาน → ตั้งค่า → แพทย์ แล้วรันซ้ำ');
    if (Object.keys(unknownStaff).length) report.push('⚠️ MP / RC ที่ไม่อยู่ในทีม (เก็บชื่อเดิม): ' +
      Object.keys(unknownStaff).map(k => k + ' ×' + unknownStaff[k]).join(', '));

    // 2) การตั้งค่า
    const os = old.getSheetByName('Settings'), oldSet = {};
    if (os && os.getLastRow() >= 2) os.getRange(2, 1, os.getLastRow() - 1, 2).getDisplayValues().forEach(r => { if (r[0]) oldSet[r[0].trim()] = r[1]; });
    const nsh = getSheet_(SHEET_SETTINGS);
    const nkeys = nsh.getLastRow() >= 2 ? nsh.getRange(2, 1, nsh.getLastRow() - 1, 2).getDisplayValues() : [];
    let setCopied = 0;
    DEFAULT_SETTINGS.forEach(d => {
      const v = oldSet[d[0]];
      const i = nkeys.findIndex(r => r[0].trim() === d[0]);
      if (v === undefined || v === '' || i < 0 || nkeys[i][1] === v) return;
      nsh.getRange(i + 2, 2).setNumberFormat('@').setValue(v);
      setCopied++;
    });
    report.push('ตั้งค่าปฏิทิน → ' + SHEET_SETTINGS + ': ' + setCopied + ' ค่า');
    if (!raw.bq) {
      const roles = oldSet.SIGN_ROLES === undefined ? DEFAULT_BQ.signRoles : csv_(oldSet.SIGN_ROLES);
      writeConfigKey_('bq', { max: Math.min(50, Math.max(1, parseInt(oldSet.MAX_CASES_PER_DAY, 10) || DEFAULT_BQ.max)),
        techs: DEFAULT_BQ.techs.slice(), signRoles: roles, signUsers: csv_(oldSet.SIGN_USERS).map(x => x.toLowerCase()) });
      report.push('จำนวนเคสสูงสุด / สิทธิ์ MP RC → Config bq');
    } else report.push('Config bq มีอยู่แล้ว (ใช้ค่าของระบบกระจายงาน)');

    // 3) วันหยุด
    const oh = old.getSheetByName('Holidays'), tz = old.getSpreadsheetTimeZone();
    if (oh && oh.getLastRow() >= 2) {
      const list = Array.isArray(raw.holidays) ? raw.holidays.slice() : [];
      const seen = {};
      list.forEach(h => { if (h && h.date) seen[h.date] = true; });
      let addH = 0;
      oh.getRange(2, 1, oh.getLastRow() - 1, 2).getValues().forEach(r => {
        const d = r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd') : String(r[0]).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || seen[d]) return;
        list.push({ date: d, name: String(r[1] || '').trim() });
        seen[d] = true;
        addH++;
      });
      if (addH) writeConfigKey_('holidays', list.sort((a, b) => String(a.date).localeCompare(String(b.date))));
      report.push('วันหยุด → Config holidays: เพิ่ม ' + addH + ' วัน');
    }

    // 4) บันทึกการใช้งาน (ครั้งแรกเท่านั้น)
    const ol = old.getSheetByName('AccessLog');
    if (!props.getProperty('MIGRATED_LOG') && ol && ol.getLastRow() >= 2) {
      const rows = ol.getRange(2, 1, ol.getLastRow() - 1, 4).getDisplayValues();
      const lsh = getSheet_(SHEET_LOG);
      lsh.getRange(lsh.getLastRow() + 1, 1, rows.length, 4).setValues(rows.map(r => r.map(v => safeCell_(v))));
      props.setProperty('MIGRATED_LOG', '1');
      report.push('AccessLog → ' + SHEET_LOG + ': ' + rows.length + ' แถว');
    }
    SpreadsheetApp.flush();
    props.setProperty('MIGRATED_FROM', oldId + ' · ' + nowStr_());
  } finally {
    lock.releaseLock();
  }
  log_('(ระบบ)', 'ย้ายข้อมูลจากชีตเดิม', report.join(' | '));
  report.forEach(m => console.log(m));
  try { SpreadsheetApp.getUi().alert('ย้ายข้อมูลแล้ว\n' + report.join('\n')); } catch (e) { /* รันจาก editor ไม่มี UI */ }
  return report.join('\n');
}

/**
 * ย้ายเคสจากชีตเดิมให้เองครั้งแรกที่เปิดเว็บหลังอัปเดต (ยังไม่เคยย้าย = ยังไม่มี Script property MIGRATED_FROM)
 * ย้ายไม่สำเร็จ (เช่น เปิดชีตเดิมไม่ได้) ไม่ขวางการเปิดหน้า: เก็บสาเหตุไว้ใน MIGRATE_ERROR แล้วลองใหม่ครั้งถัดไป
 * ปิดการย้ายอัตโนมัติ: ตั้ง Script property AUTO_MIGRATE = off
 */
function autoMigrate_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIGRATED_FROM') || String(props.getProperty('AUTO_MIGRATE') || '').toLowerCase() === 'off') return;
  try {
    migrateFromOldSheet(true);
    props.deleteProperty('MIGRATE_ERROR');
  } catch (e) {
    props.setProperty('MIGRATE_ERROR', nowStr_() + ' · ' + e.message);
    console.warn('autoMigrate_: ' + e.message);
  }
}

/**
 * ซิงก์ปฏิทินกับแท็บ BrachyQueue (นัดที่ลงหรือแก้จากแถบนัดคิวใส่แร่ของระบบกระจายงานไม่ได้ลงปฏิทิน)
 * เฉพาะนัดตั้งแต่วันนี้: ยังไม่มี event = สร้าง · ยกเลิกแล้วแต่ยังมี event = ลบ · วันที่หรือชื่อไม่ตรง = แก้
 * รันเองจากหน้าแก้ไขสคริปต์ / ปุ่มในหน้าตั้งค่าของแอดมิน หรือตั้ง Trigger แบบตั้งเวลา (เช่น ทุก 1 ชั่วโมง)
 */
function syncCalendar() {
  ensureSetup_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error(msg_('th', 'busy'));
  const res = { made: 0, removed: 0, fixed: 0, failed: 0 };
  try {
    const tz = Session.getScriptTimeZone(), today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    const settings = getSettings_(), conf = conf_(true), cal = getCalendar_('th');
    const patch = {};
    listAppointments_().filter(a => a.date >= today).forEach(a => {
      try {
        let ev = null;
        if (a.eventId) { try { ev = cal.getEventById(a.eventId); } catch (e) { ev = null; } }
        if (a.status === STATUS_CANCELLED) {
          if (ev) { ev.deleteEvent(); res.removed++; }
          if (a.eventId) patch[a.apptId] = '';
          return;
        }
        if (!ev) { patch[a.apptId] = createEvent_(cal, settings, a, conf).getId(); res.made++; return; }
        const title = eventTitle_(settings, a), d = Utilities.formatDate(ev.getAllDayStartDate(), tz, 'yyyy-MM-dd');
        if (d !== a.date || ev.getTitle() !== title) {
          if (d !== a.date) ev.setAllDayDate(toDate_(a.date));
          ev.setTitle(title);
          ev.setDescription(eventDesc_(a, conf));
          res.fixed++;
        }
      } catch (e) {
        res.failed++;
        console.warn('syncCalendar ' + a.apptId + ': ' + e.message);
      }
    });
    bqPatchColumn_('eventId', patch);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  const msg = 'ซิงก์ปฏิทิน: สร้าง ' + res.made + ' · ลบ ' + res.removed + ' · แก้ ' + res.fixed + (res.failed ? ' · ไม่สำเร็จ ' + res.failed : '');
  if (res.made || res.removed || res.fixed || res.failed) log_('(ระบบ)', 'ซิงก์ปฏิทิน', msg);
  console.log(msg);
  return res;
}

/** ปุ่มซิงก์ปฏิทินในหน้าตั้งค่า (เฉพาะแอดมิน) */
function syncCalendarNow(token, lang) {
  const acc = requireUser_(token, lang);
  const me = member_(workspace_({ action: 'me', token: acc.wsToken }, lang).user);
  if (!me.isAdmin) throw new Error(msg_(lang, 'adminOnly'));
  const res = syncCalendar();
  return Object.assign(res, { appointments: listAppointments_() });
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
  const text = res.getContentText('UTF-8');
  try {
    out = JSON.parse(text);
  } catch (e) {
    // ได้หน้า HTML แทน JSON: บอกสาเหตุจากเนื้อหาของหน้า
    console.warn('workspace_: HTTP ' + res.getResponseCode() + ' ไม่ใช่ JSON: ' + text.slice(0, 500));
    throw new Error(msg_(lang, 'workspaceDown', { err: 'HTTP ' + res.getResponseCode() + ' · ' + workspaceHtmlReason_(text, lang) }));
  }
  if (!out || !out.ok) {
    const err = out && out.error;
    if (err === 'session_expired') throw new Error(AUTH_ERR + msg_(lang, 'sessionExpired'));
    throw new Error(err || msg_(lang, 'workspaceDown', { err: '?' }));
  }
  return out;
}

/** Workspace ตอบเป็นหน้า HTML: เดาสาเหตุจากเนื้อหา (หน้าลงชื่อเข้าใช้ Google / ไม่มี doPost / อื่นๆ) */
function workspaceHtmlReason_(html, lang) {
  if (/accounts\.google\.com|ServiceLogin|signin\/v2|identifier/i.test(html)) return msg_(lang, 'wsNeedsAnyone');
  if (/doPost/.test(html)) return msg_(lang, 'wsNoDoPost');
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return msg_(lang, 'wsHtml', { title: (m ? m[1] : html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 80) || '-' });
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
  const conf = conf_();
  return {
    user: user,
    canSign: canSign_(user, conf),
    signRule: signRuleOut_(conf),
    doctors: conf.doctors.map(x => ({ code: x.code, name: x.name })),
    physicists: conf.staff,
    techniques: conf.bq.techs,
    holidays: conf.holidays,
    settings: {
      maxCasesPerDay: conf.bq.max,
      calendarName: calendarNameSafe_(lang)
    },
    appointments: listAppointments_()
  };
}

/**
 * ตั้งค่าโดยแอดมิน: s = { signRoles: [...], signUsers: [...], maxCasesPerDay }
 * เก็บใน Config (key bq) ใช้ร่วมกับแถบนัดคิวใส่แร่ของระบบกระจายงาน · ตรวจกับ Workspace ว่ายังเป็นแอดมินอยู่ก่อนบันทึก
 */
function saveSettings(token, s, lang) {
  const acc = requireUser_(token, lang);
  const me = member_(workspace_({ action: 'me', token: acc.wsToken }, lang).user);
  if (!me.isAdmin) throw new Error(msg_(lang, 'adminOnly'));
  s = s || {};
  const roles = (Array.isArray(s.signRoles) ? s.signRoles : []).map(x => String(x).trim()).filter(x => /^[A-Za-z0-9 _-]{1,30}$/.test(x));
  const users = (Array.isArray(s.signUsers) ? s.signUsers : csv_(s.signUsers)).map(x => String(x).trim().toLowerCase())
    .filter(x => /^[a-z0-9._@-]{1,60}$/.test(x));
  const max = parseInt(s.maxCasesPerDay, 10);
  if (!(max >= 1 && max <= 50)) throw new Error(msg_(lang, 'maxInvalid'));
  const lock = lock_(lang);
  try {
    // แก้เฉพาะค่าใน key bq ของ Config (ค่าอื่นของระบบกระจายงานคงเดิม · รูปแบบการใส่แก้ที่ระบบกระจายงาน)
    const raw = readConfigRaw_();
    const bq = Object.assign({}, raw.bq && typeof raw.bq === 'object' ? raw.bq : {}, { max: max, signRoles: [...new Set(roles)], signUsers: [...new Set(users)] });
    writeConfigKey_('bq', bq);
  } finally {
    lock.releaseLock();
  }
  log_(acc.username, 'ตั้งค่า', 'MP/RC: ' + (roles.join(', ') || '-') + (users.length ? ' + ' + users.join(', ') : '') + ' · เคสสูงสุด/วัน ' + max);
  const conf = conf_(true);
  return { canSign: canSign_(acc, conf), signRule: signRuleOut_(conf), maxCasesPerDay: conf.bq.max };
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
    const conf = conf_();
    const max = conf.bq.max;
    const overDays = findOverCapacity_(p.sessions, max);

    if (!p.force) {
      const conflicts = findConflicts_(p.sessions, p.hn);
      if (conflicts.length || overDays.length) {
        return { ok: false, needConfirm: true, conflicts: conflicts, overCapacity: overDays, max: max };
      }
    }

    const cal = getCalendar_(lang);
    const tz = Session.getScriptTimeZone();
    const now = new Date().toISOString();
    const who = whoName_(acc);
    // ต่อท้ายด้วยรหัสสุ่ม กันรหัสซ้ำเมื่อบันทึกหลายรายการในวินาทีเดียวกัน
    const courseId = 'BT' + Utilities.formatDate(new Date(), tz, 'yyMMddHHmmss') +
      Utilities.getUuid().replace(/-/g, '').slice(0, 4).toUpperCase();
    const rows = [];
    const created = [];
    try {
      p.sessions.forEach((s, i) => {
        const fx = i + 1;
        const a = { hn: p.hn, name: p.name, doctor: p.doctor, technique: p.technique, note: p.note,
          fx: fx, totalFx: p.totalFx, date: s.date, courseId: courseId, createdBy: who };
        const ev = createEvent_(cal, settings, a, conf);
        created.push(ev);
        rows.push({ id: courseId + '-' + fx, course: courseId, date: s.date, hn: p.hn, name: p.name, doc: p.doctor, tech: p.technique,
          fx: String(fx), total: String(p.totalFx), note: p.note, status: STATUS_BOOKED, mp: '', rc: '', hist: '', src: '',
          by: who, created: now, editedBy: '', updated: '', eventId: ev.getId() });
      });
    } catch (err) {
      // ถ้าสร้าง event ไม่ครบ ให้ลบที่สร้างไปแล้ว เพื่อไม่ให้ปฏิทินกับชีตไม่ตรงกัน
      created.forEach(ev => { try { ev.deleteEvent(); } catch (e) { /* ignore */ } });
      log_(user, 'ลงนัดไม่สำเร็จ', 'HN ' + p.hn + ': ' + err.message);
      throw new Error(msg_(lang, 'calFail', { err: err.message }));
    }

    bqAppend_(rows);
    SpreadsheetApp.flush();

    log_(user, 'ลงนัด', 'HN ' + p.hn + ' ' + p.name + ' / ' + docName_(p.doctor, conf) + ' / ' + p.technique + ' / ' + rows.length + ' Fx (' +
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
 * แก้ไขนัด 1 fraction: changes = { date?, doctor?, technique?, note?, status?, mp?, rc? }
 * ปรับนัดในปฏิทินให้ตรง และบันทึกว่าใครแก้อะไร เมื่อไร ในคอลัมน์ประวัติการแก้ไข
 */
function updateAppointment(token, apptId, changes, lang) {
  const acc = requireUser_(token, lang);
  const c = changes || {};
  const lock = lock_(lang);
  try {
    const conf = conf_();
    const a = listAppointments_().find(x => x.apptId === apptId);
    if (!a) throw new Error(msg_(lang, 'notFound', { id: apptId }));

    const next = { date: a.date, doctor: a.doctor, technique: a.technique, note: a.note, status: a.status, mp: a.mp, rc: a.rc };
    if (c.date !== undefined) {
      next.date = String(c.date).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(next.date)) throw new Error(msg_(lang, 'dateInvalid'));
    }
    if (c.doctor !== undefined) {
      next.doctor = String(c.doctor).trim();
      // แพทย์เดิมที่ไม่อยู่ในรายชื่อ (นำเข้าจากระบบเดิม) คงไว้ได้
      if (next.doctor !== a.doctor && !conf.doctors.some(x => x.code === next.doctor)) throw new Error(msg_(lang, 'doctorUnknown', { doctor: next.doctor }));
    }
    if (c.technique !== undefined) {
      next.technique = cleanText_(c.technique);
      if (!next.technique || next.technique === 'อื่นๆ' || next.technique.length > 100) throw new Error(msg_(lang, 'technique'));
    }
    if (c.note !== undefined) {
      next.note = cleanText_(c.note);
      if (next.note.length > 500) throw new Error(msg_(lang, 'noteTooLong'));
    }
    // MP (ผู้วางแผน) / RC (Recheck): ชื่อผู้ลงชื่อ ว่างได้ (= ล้างชื่อ)
    ['mp', 'rc'].forEach(f => {
      if (c[f] === undefined) return;
      next[f] = cleanText_(c[f]).replace(/\s+/g, ' ');
      if (next[f].length > 100) throw new Error(msg_(lang, 'signTooLong'));
    });
    if (next.mp && next.rc && next.mp === next.rc && (c.mp !== undefined || c.rc !== undefined)) throw new Error(msg_(lang, 'rcSameAsMp'));
    if (c.status !== undefined) {
      next.status = String(c.status).trim();
      if ([STATUS_BOOKED, STATUS_DONE, STATUS_CANCELLED].indexOf(next.status) < 0) throw new Error(msg_(lang, 'statusInvalid'));
    }

    const diff = ['date', 'doctor', 'technique', 'note', 'status', 'mp', 'rc']
      .filter(f => next[f] !== a[f])
      .map(f => ({ f: f, from: a[f], to: next[f] }));
    if (!diff.length) return { ok: true, changed: 0, appointments: listAppointments_() };

    // ปรับปฏิทินให้ตรงกับข้อมูลใหม่ (ลงชื่อ MP / RC อย่างเดียวไม่ต้องแตะปฏิทิน)
    const settings = getSettings_();
    // บันทึก MP / RC ได้เฉพาะตำแหน่ง/ผู้ใช้ที่แอดมินตั้งไว้ (ค่าเริ่มต้น: ตำแหน่ง MP)
    // ตำแหน่งใน token มาจากตอนเข้าสู่ระบบ ถ้าไม่ผ่านให้ถาม Workspace อีกครั้ง (เผื่อเพิ่งเปลี่ยนตำแหน่ง)
    if (diff.some(d => d.f === 'mp' || d.f === 'rc') && !canSign_(acc, conf) && !signViaWorkspace_(acc, conf, lang)) {
      throw new Error(msg_(lang, 'signDenied', { roles: conf.bq.signRoles.join(', ') || '-' }));
    }
    const calChanged = diff.some(d => d.f !== 'mp' && d.f !== 'rc');
    const cal = calChanged ? getCalendar_(lang) : null;
    let ev = null;
    if (calChanged && a.eventId) { try { ev = cal.getEventById(a.eventId); } catch (e) { ev = null; } }
    let eventId = a.eventId;
    const merged = Object.assign({}, a, next);
    if (!calChanged) {
      // ไม่มีอะไรต้องเปลี่ยนในปฏิทิน
    } else if (next.status === STATUS_CANCELLED) {
      if (ev) { try { ev.deleteEvent(); } catch (e) { /* ลบไปแล้ว */ } }
      eventId = '';
    } else if (!ev) {
      eventId = createEvent_(cal, settings, merged, conf).getId();
    } else {
      if (next.date !== a.date) ev.setAllDayDate(toDate_(next.date));
      ev.setTitle(eventTitle_(settings, merged));
      ev.setDescription(eventDesc_(merged, conf));
    }

    bqUpdate_(a, {
      date: next.date, doc: next.doctor, tech: next.technique, note: next.note, status: next.status, mp: next.mp, rc: next.rc,
      eventId: eventId, editedBy: whoName_(acc), updated: new Date().toISOString(), hist: histAdd_(a.histRaw, acc, diff)
    });
    SpreadsheetApp.flush();

    log_(acc.username, 'แก้ไขนัด', 'HN ' + a.hn + ' ' + a.name + ' Fx ' + a.fx + '/' + a.totalFx + ' (' + apptId + '): ' +
      diff.map(d => d.f + ' ' + (d.from || '-') + ' → ' + (d.to || '-')).join(', '));

    // ย้ายวันหรือกลับมาใช้งาน แล้ววันนั้นเกินจำนวนเคส: แจ้งเตือนเหมือนตอนลงนัด
    let overCapacity = [];
    const becameActive = next.status !== STATUS_CANCELLED && (next.date !== a.date || a.status === STATUS_CANCELLED);
    if (becameActive) {
      const max = conf.bq.max;
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

/** ลิงก์ที่จะพาไป (REDIRECT_URL หรือ Script property REDIRECT_URL) พร้อมบัตรผ่าน ?sso= · '' = ไม่พาไป */
function redirectUrl_(params) {
  let url = REDIRECT_URL;
  try {
    const v = PropertiesService.getScriptProperties().getProperty('REDIRECT_URL');
    if (v !== null && v !== '') url = v;
  } catch (e) { /* ใช้ค่าใน Code.gs */ }
  url = String(url || '').trim();
  if (!/^https:\/\//.test(url)) return '';
  const sso = params && params.sso ? String(params.sso).replace(/[^0-9a-zA-Z_-]/g, '') : '';
  return sso ? url + (url.indexOf('?') < 0 ? '?' : '&') + 'sso=' + encodeURIComponent(sso) : url;
}

/**
 * หน้าพาไปเว็บอื่น: Google เปิดหน้าเว็บ Apps Script ใน iframe ที่ยอมให้เปลี่ยนหน้าต่างบนสุดได้เฉพาะหลังผู้ใช้กด
 * (sandbox allow-top-navigation-by-user-activation) สคริปต์จึงพาไปเองไม่ได้ ทั้งหน้าเป็นลิงก์เดียว แตะที่ใดก็ได้เพื่อไปต่อ
 * (ยังลองพาไปเองไว้ด้วย เผื่อเบราว์เซอร์ยอม)
 */
function redirectPage_(url) {
  const attr = String(url).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html =
    '<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">' +
    '<style>:root{color-scheme:light dark}html,body{height:100%;margin:0}' +
    'body{font-family:Sarabun,system-ui,sans-serif;background:#f5f3fa;color:#1f1b2e}' +
    'a{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;height:100%;padding:16px;box-sizing:border-box;' +
    'color:inherit;text-decoration:none;text-align:center;cursor:pointer;outline:none}' +
    '.t{font-size:20px;font-weight:700}.h{font-size:14px;opacity:.65}' +
    '@media (prefers-color-scheme:dark){body{background:#141120;color:#ece8f6}}</style></head><body>' +
    '<a id="go" href="' + attr + '" target="_top" autofocus>' +
    '<span class="t">ระบบนัดคิวใส่แร่ย้ายไปที่ Treatment Planning Management แล้ว</span>' +
    '<span class="h">แตะที่ใดก็ได้เพื่อไปต่อ · Tap anywhere to continue</span></a>' +
    '<script>try { window.top.location.replace(' + JSON.stringify(url).replace(/</g, '\\u003c') + '); } catch (e) {}' +
    'document.getElementById("go").focus();</script>' +
    '</body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('ระบบนัดคิวผู้ป่วยใส่แร่')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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
  const tz = Session.getScriptTimeZone();
  return readBq_().map(o => toAppt_(o, tz)).filter(a => a.apptId && /^\d{4}-\d{2}-\d{2}$/.test(a.date)).sort(compareAppt_);
}

function updateStatus_(acc, apptId, scope, newStatus, deleteEvent, lang) {
  const user = acc.username;
  const lock = lock_(lang);
  try {
    const all = listAppointments_();
    const target = all.find(a => a.apptId === apptId);
    if (!target) throw new Error(msg_(lang, 'notFound', { id: apptId }));
    const pick = all.filter(a => (scope === 'course'
      ? a.courseId && a.courseId === target.courseId && a.status === STATUS_BOOKED
      : a.apptId === apptId) && a.status !== newStatus);
    const cal = pick.some(a => deleteEvent && a.eventId) ? getCalendar_(lang) : null;
    const now = new Date().toISOString(), who = whoName_(acc);
    pick.forEach(a => {
      if (deleteEvent && a.eventId) {
        try {
          const ev = cal.getEventById(a.eventId);
          if (ev) ev.deleteEvent();
        } catch (e) { /* event อาจถูกลบไปแล้ว */ }
      }
      // บันทึกสถานะใหม่พร้อมประวัติว่าใครเปลี่ยน
      const set = { status: newStatus, editedBy: who, updated: now, hist: histAdd_(a.histRaw, acc, [{ f: 'status', from: a.status, to: newStatus }]) };
      if (deleteEvent) set.eventId = '';
      bqUpdate_(a, set);
    });
    SpreadsheetApp.flush();
    if (pick.length) {
      log_(user, newStatus === STATUS_CANCELLED ? 'ยกเลิกนัด' : 'บันทึกมาตามนัด',
        'HN ' + target.hn + ' ' + target.name + ': ' + pick.map(a => a.apptId).join(', '));
    }
    return { ok: true, changed: pick.length, appointments: listAppointments_() };
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
  if (!conf_().doctors.some(x => x.code === p.doctor)) throw new Error(msg_(lang, 'doctorUnknown', { doctor: p.doctor }));
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
        '\n\nนัดล่าสุด: HN ' + p.hn + ' (' + docName_(p.doctor, conf_()) + ', ' + p.totalFx + ' Fx)\nผู้บันทึก: ' + user
    });
  } catch (e) {
    log_(user, 'ส่งอีเมลแจ้งเตือนไม่สำเร็จ', e.message);
  }
}

/** รายการคั่นด้วย , จากชีต Settings */
function csv_(v) {
  return String(v || '').split(',').map(x => x.trim()).filter(Boolean);
}
/** ใครบันทึก MP / RC ได้ (Config bq.signRoles / bq.signUsers ใช้ร่วมกับระบบกระจายงาน · ยังไม่ตั้ง = MP) */
function signRuleOut_(conf) {
  return { roles: conf.bq.signRoles, users: conf.bq.signUsers, allRoles: WS_ROLES };
}
function signViaWorkspace_(acc, conf, lang) {
  try { return canSign_(member_(workspace_({ action: 'me', token: acc.wsToken }, lang).user), conf); } catch (e) { return false; }
}
function canSign_(acc, conf) {
  const role = String(acc.role || '').toLowerCase();
  return (!!role && conf.bq.signRoles.some(r => String(r).toLowerCase() === role)) ||
    conf.bq.signUsers.map(x => String(x).toLowerCase()).indexOf(String(acc.username || '').toLowerCase()) >= 0;
}

/** แถวในแท็บ BrachyQueue → นัดในรูปที่หน้าเว็บใช้ */
function toAppt_(o, tz) {
  return {
    row: o._row,
    apptId: o.id, courseId: o.course, createdAt: localTime_(o.created, tz),
    hn: o.hn, name: o.name, doctor: o.doc,
    fx: Number(o.fx) || 0, totalFx: Number(o.total) || 0,
    date: o.date,
    note: o.note, status: o.status || STATUS_BOOKED, createdBy: o.by, eventId: o.eventId,
    technique: o.tech || '', editedBy: o.editedBy || '', editedAt: localTime_(o.updated, tz),
    history: histOut_(o.hist), histRaw: o.hist,
    mp: o.mp || '', rc: o.rc || ''
  };
}

/** เวลาแบบ ISO (ที่ระบบกระจายงานเขียน) → "yyyy-MM-dd HH:mm:ss" ตามเวลาท้องถิ่น · ค่าอื่นคืนตามเดิม */
function localTime_(v, tz) {
  const t = String(v || '');
  if (!/^\d{4}-\d{2}-\d{2}T/.test(t)) return t;
  const d = new Date(t);
  return isNaN(d) ? t : Utilities.formatDate(d, tz || Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

/** ประวัติในแท็บ [{ at, by (ชื่อ), ch: [{ f, from, to }] }] → แบบที่หน้าเว็บใช้ [{ at, name, changes }] (รับรูปแบบเดิมของระบบนี้ด้วย) */
function histOut_(v) {
  let list = [];
  try { list = JSON.parse(v || '[]'); } catch (e) { list = []; }
  return (Array.isArray(list) ? list : []).map(h => ({
    at: String(h.at || ''), by: '', name: String(h.name || h.by || ''),
    changes: (Array.isArray(h.ch) ? h.ch : Array.isArray(h.changes) ? h.changes : [])
      .map(c => ({ f: HIST_FROM_BQ[c.f] || c.f, from: String(c.from == null ? '' : c.from), to: String(c.to == null ? '' : c.to) }))
  }));
}

/** เพิ่มประวัติหนึ่งครั้ง (แบบเดียวกับระบบกระจายงาน · เก็บ 40 ครั้งล่าสุด) คืน JSON */
function histAdd_(raw, acc, diff) {
  let list = [];
  try { list = JSON.parse(raw || '[]'); } catch (e) { list = []; }
  if (!Array.isArray(list)) list = [];
  list.push({ at: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'), by: whoName_(acc),
    ch: diff.map(d => ({ f: HIST_TO_BQ[d.f] || d.f, from: String(d.from == null ? '' : d.from), to: String(d.to == null ? '' : d.to) })) });
  return JSON.stringify(list.slice(-40));
}

/** ชื่อผู้ใช้ที่เก็บในช่อง ลงนัดโดย / แก้ไขโดย (เหมือนระบบกระจายงาน: ชื่อ-สกุล) */
function whoName_(acc) {
  return String(acc.fullName || acc.username || '').trim();
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

function eventDesc_(a, conf) {
  return [
    'HN: ' + a.hn,
    'ผู้ป่วย: ' + a.name,
    'แพทย์: ' + docName_(a.doctor, conf || conf_()),
    'รูปแบบการใส่: ' + (a.technique || '-'),
    'Fraction: ' + a.fx + ' / ' + a.totalFx,
    a.note ? 'หมายเหตุ: ' + a.note : '',
    'รหัสคอร์ส: ' + a.courseId,
    'ผู้บันทึก: ' + a.createdBy
  ].filter(Boolean).join('\n');
}

function createEvent_(cal, settings, a, conf) {
  const ev = cal.createAllDayEvent(eventTitle_(settings, a), toDate_(a.date),
    { description: eventDesc_(a, conf), location: settings.LOCATION || '' });
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

/** ชื่อแพทย์จากรหัส (ไม่อยู่ในรายชื่อ = ข้อความเดิม) */
function docName_(code, conf) {
  const d = (conf || conf_()).doctors.find(x => x.code === code);
  return d ? (d.name ? d.name + ' (' + d.code + ')' : d.code) : String(code || '');
}

/** Config ของระบบกระจายงาน: { key: ค่า JSON } (อ่านทั้งแท็บ) */
function readConfigRaw_() {
  const sh = ss_().getSheetByName(SHEET_CONFIG);
  const out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => {
    const k = String(r[0]).trim();
    if (!k) return;
    try { out[k] = JSON.parse(r[1]); } catch (e) { /* ข้ามค่าที่อ่านไม่ได้ */ }
  });
  return out;
}

/** เขียนค่าเดียวใน Config (แถวของ key นั้น · ไม่มี = เพิ่มแถว) ค่าอื่นไม่แตะ */
function writeConfigKey_(key, value) {
  const ss = ss_();
  const sh = ss.getSheetByName(SHEET_CONFIG) || ss.insertSheet(SHEET_CONFIG);
  if (sh.getLastRow() < 1) sh.getRange(1, 1, 1, 2).setValues([['key', 'value (JSON)']]).setFontWeight('bold');
  const keys = sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0]).trim()) : [];
  const i = keys.indexOf(key);
  const row = i >= 0 ? i + 2 : sh.getLastRow() + 1;
  sh.getRange(row, 1, 1, 2).setNumberFormat('@').setValues([[key, JSON.stringify(value)]]);
  conf_.cache = null;
}

/**
 * ค่าที่ใช้ร่วมกับระบบกระจายงาน (อ่านครั้งเดียวต่อคำขอ · fresh = อ่านใหม่):
 * { bq: { max, techs, signRoles, signUsers }, doctors: [{code, name}], staff: [{code, name, color}], holidays: [{date, name}] }
 */
function conf_(fresh) {
  if (conf_.cache && !fresh) return conf_.cache;
  const c = readConfigRaw_();
  const str = v => String(v == null ? '' : v).trim();
  const b = c.bq && typeof c.bq === 'object' ? c.bq : {};
  const list = (v, d) => (Array.isArray(v) ? [...new Set(v.map(str).filter(Boolean))] : d.slice());
  const bq = {
    max: Math.min(50, Math.max(1, Math.floor(+b.max) || DEFAULT_BQ.max)),
    techs: list(b.techs, DEFAULT_BQ.techs),
    signRoles: list(b.signRoles, DEFAULT_BQ.signRoles),
    signUsers: list(b.signUsers, DEFAULT_BQ.signUsers).map(x => x.toLowerCase())
  };
  const doctors = (Array.isArray(c.doctors) ? c.doctors : DEFAULT_DOCTOR_CODES.map(code => ({ code: code })))
    .map(x => (x && typeof x === 'object' ? { code: str(x.code).toUpperCase(), name: str(x.name) } : { code: str(x).toUpperCase(), name: '' }))
    .filter(x => x.code);
  const staff = (Array.isArray(c.staff) && c.staff.length ? c.staff : DEFAULT_STAFF.map(code => ({ code: code })))
    .filter(x => x && x.code && x.active !== false)
    .map(x => ({ code: str(x.code).toUpperCase().slice(0, 10), name: str(x.name).slice(0, 100),
      color: /^#[0-9a-fA-F]{6}$/.test(str(x.color)) ? str(x.color) : '' }));
  const seen = {};
  const holidays = (Array.isArray(c.holidays) ? c.holidays : [])
    .filter(h => h && /^\d{4}-\d{2}-\d{2}$/.test(str(h.date)) && !seen[h.date] && (seen[h.date] = true))
    .map(h => ({ date: str(h.date), name: str(h.name) }));
  conf_.cache = { bq: bq, doctors: doctors, staff: staff, holidays: holidays };
  return conf_.cache;
}

/* ---------- แท็บ BrachyQueue: อ่าน/เขียนตามชื่อหัวตาราง ---------- */

function bqSheet_() {
  return getSheet_(SHEET_BQ);
}
function bqHeader_(sh) {
  const n = sh.getLastColumn();
  return n ? sh.getRange(1, 1, 1, n).getDisplayValues()[0].map(v => String(v).trim()) : [];
}
/** ทุกแถว → [{ id, course, ..., eventId, _row }] */
function readBq_() {
  const sh = bqSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(1, 1, last, sh.getLastColumn()).getDisplayValues();
  const header = values.shift().map(v => String(v).trim());
  const cols = BQ_FIELDS.map(f => header.indexOf(f[1]));
  return values.map((r, i) => {
    const o = { _row: i + 2 };
    BQ_FIELDS.forEach((f, k) => { o[f[0]] = cols[k] < 0 ? '' : String(r[cols[k]]).trim(); });
    return o;
  }).filter(o => o.id);
}
/** ต่อท้ายหลายแถวในครั้งเดียว (เก็บเป็นข้อความ) */
function bqAppend_(recs) {
  if (!recs.length) return;
  const sh = bqSheet_();
  const header = bqHeader_(sh);
  const fields = header.map(h => BQ_FIELDS.find(f => f[1] === h));
  sh.getRange(sh.getLastRow() + 1, 1, recs.length, header.length).setNumberFormat('@')
    .setValues(recs.map(rec => fields.map(f => (f ? safeCell_(rec[f[0]] == null ? '' : rec[f[0]]) : ''))));
}
/** แก้ช่องเดียวของหลายนัดในครั้งเดียว: byId = { id: ค่าใหม่ } (อ่าน/เขียนทั้งคอลัมน์ · ใช้ตอนย้ายข้อมูลและซิงก์ปฏิทิน) */
function bqPatchColumn_(field, byId) {
  const ids = Object.keys(byId);
  if (!ids.length) return 0;
  const sh = bqSheet_();
  const header = bqHeader_(sh);
  const idCol = header.indexOf('id') + 1, col = header.indexOf(BQ_FIELDS.find(f => f[0] === field)[1]) + 1;
  const last = sh.getLastRow();
  if (idCol < 1 || col < 1 || last < 2) return 0;
  const idv = sh.getRange(2, idCol, last - 1, 1).getDisplayValues();
  const range = sh.getRange(2, col, last - 1, 1);
  const vals = range.getDisplayValues();
  let n = 0;
  idv.forEach((r, i) => {
    const id = String(r[0]).trim();
    if (id && Object.prototype.hasOwnProperty.call(byId, id)) { vals[i][0] = safeCell_(byId[id]); n++; }
  });
  range.setNumberFormat('@').setValues(vals);
  return n;
}
/** เขียนเฉพาะช่องที่ส่งมาในแถวของนัดนี้ (ค้นแถวจาก id ใหม่ทุกครั้ง กันแถวเลื่อน) */
function bqUpdate_(a, set) {
  const sh = bqSheet_();
  const header = bqHeader_(sh);
  const idCol = header.indexOf('id') + 1;
  const last = sh.getLastRow();
  let row = 0;
  if (idCol > 0 && last >= 2) {
    const ids = sh.getRange(2, idCol, last - 1, 1).getDisplayValues();
    for (let i = 0; i < ids.length; i++) if (String(ids[i][0]).trim() === a.apptId) { row = i + 2; break; }
  }
  if (!row) throw new Error(msg_('th', 'notFound', { id: a.apptId }));
  BQ_FIELDS.filter(f => f[0] in set).forEach(f => {
    const col = header.indexOf(f[1]) + 1;
    if (col > 0) sh.getRange(row, col).setNumberFormat('@').setValue(safeCell_(set[f[0]] == null ? '' : set[f[0]]));
  });
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

/** ชีตข้อมูลหลัก (DATA_SHEET_ID หรือ Script property DATA_SHEET_ID) */
function ss_() {
  if (ss_.cache) return ss_.cache;
  const raw = String(PropertiesService.getScriptProperties().getProperty('DATA_SHEET_ID') || DATA_SHEET_ID || '').trim();
  const id = (raw.match(/\/d\/([a-zA-Z0-9_-]+)/) || [])[1] || raw;
  try {
    ss_.cache = SpreadsheetApp.openById(id);
  } catch (e) {
    throw new Error('เปิดชีตข้อมูลไม่ได้ (' + e.message + ') ตรวจ DATA_SHEET_ID และบัญชีที่ Deploy ต้องแก้ไขชีตนั้นได้ / ' +
      'Could not open the data sheet: check DATA_SHEET_ID and that the deploying account can edit it');
  }
  return ss_.cache;
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

  // แท็บนัด (ใช้ร่วมกับระบบกระจายงาน): ยังไม่มีแท็บ = สร้าง · ขาดหัวคอลัมน์ = เติมต่อท้าย (ไม่ย้ายคอลัมน์เดิม)
  let sh = ss.getSheetByName(SHEET_BQ);
  if (!sh) {
    if (!apply) return true;
    sh = ss.insertSheet(SHEET_BQ);
    sh.getRange(1, 1, 1, BQ_FIELDS.length).setValues([BQ_FIELDS.map(f => f[1])]).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else {
    const header = bqHeader_(sh);
    const missing = BQ_FIELDS.map(f => f[1]).filter(h => header.indexOf(h) < 0);
    if (missing.length) {
      if (!apply) return true;
      const maxCols = sh.getMaxColumns(), need = header.length + missing.length;
      if (maxCols < need) sh.insertColumnsAfter(maxCols, need - maxCols);
      sh.getRange(1, header.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
    }
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
