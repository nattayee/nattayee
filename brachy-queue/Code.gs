/**
 * ระบบนัดคิวผู้ป่วยใส่แร่ (Brachytherapy Appointment Queue)
 *
 * - หน้าเว็บกรอก HN / ชื่อผู้ป่วย / แพทย์ / ชนิด / จำนวน fraction
 * - กดปุ่มเดียว: สร้างนัดทุก fraction ลง Google Calendar (ทั้งวัน) + บันทึกลง Google Sheet
 * - แจ้งเตือนเมื่อวันใดมีเคสเกินกำหนด (ค่าเริ่มต้น 6 เคส/วัน)
 * - บังคับ login ด้วยบัญชี Google; อนุญาตเฉพาะอีเมลในชีต Users และบันทึกทุกการใช้งานในชีต AccessLog
 * - ยกเลิกนัดได้ (ลบ event ในปฏิทิน และเปลี่ยนสถานะในชีต)
 *
 * ต้องผูกสคริปต์นี้กับ Google Sheet (Extensions > Apps Script)
 * และ Deploy เป็น Web app แบบ Execute as: "User accessing the web app",
 * Who has access: "Anyone with Google account"
 */

const SHEET_APPTS = 'Appointments';
const SHEET_DOCTORS = 'Doctors';
const SHEET_HOLIDAYS = 'Holidays';
const SHEET_SETTINGS = 'Settings';
const SHEET_USERS = 'Users';
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
  'ชนิด',               // J  Interstitial / ที่กรอกเอง
  'หมายเหตุ',           // K
  'สถานะ',              // L  นัดแล้ว / ยกเลิก / มาตามนัด
  'Calendar Event ID', // M
  'ผู้บันทึก'            // N
];
const COL = {};
['apptId', 'courseId', 'createdAt', 'hn', 'name', 'doctor', 'fx', 'totalFx',
  'date', 'type', 'note', 'status', 'eventId', 'createdBy']
  .forEach((k, i) => { COL[k] = i; });

const STATUS_BOOKED = 'นัดแล้ว';
const STATUS_CANCELLED = 'ยกเลิก';
const STATUS_DONE = 'มาตามนัด';

const DEFAULT_DOCTORS = [
  'ทัศน์วรรณ อาษากิจ',
  'ศิริรัตน์ เชื้อสำราญ',
  'พัฒธิดา มโนรส',
  'ทินกร จอมใจ'
];
const OLD_SAMPLE_DOCTORS = ['พญ. ตัวอย่าง หนึ่ง', 'นพ. ตัวอย่าง สอง'];

/** ชนิดที่เลือกได้ (นอกจากนี้ให้กรอกเองในช่อง "อื่นๆ") */
const TYPE_OPTIONS = ['Interstitial'];

const DEFAULT_SETTINGS = [
  ['CALENDAR_ID', '', 'ID ของปฏิทินที่ใช้ร่วมกัน (ควรตั้งเสมอ เพราะแต่ละคนใช้บัญชีตัวเอง ถ้าว่างนัดจะไปลงปฏิทินส่วนตัวของผู้บันทึก)'],
  ['EVENT_PREFIX', '[ใส่แร่]', 'คำนำหน้าชื่อนัดในปฏิทิน'],
  ['SHOW_NAME_IN_CALENDAR', 'TRUE', 'TRUE = แสดงชื่อผู้ป่วยในปฏิทิน, FALSE = แสดงเฉพาะ HN'],
  ['LOCATION', 'ห้องใส่แร่ (Brachytherapy)', 'สถานที่ที่แสดงในนัด'],
  ['MAX_CASES_PER_DAY', '6', 'จำนวนเคสสูงสุดต่อวัน ถ้าเกินจะแจ้งเตือน'],
  ['ALERT_EMAIL', '', 'อีเมลที่จะรับแจ้งเตือนเมื่อวันใดเกินจำนวนเคส (คั่นหลายอีเมลด้วย ,) เว้นว่าง = ไม่ส่งอีเมล']
];

/* ------------------------------------------------------------------ */
/*  Entry points                                                       */
/* ------------------------------------------------------------------ */

function doGet() {
  // Web app ตั้งค่าให้ต้อง login Google ก่อนเสมอ และรันในนามผู้ใช้ จึงได้อีเมลจริงของผู้ใช้
  const email = currentEmail_();
  if (!email) return deniedPage_('', 'ไม่พบบัญชี Google ที่ login อยู่ กรุณา login Gmail แล้วเปิดลิงก์ใหม่');

  try {
    ensureSetup_();
  } catch (e) {
    return deniedPage_(email, 'บัญชีนี้ยังไม่มีสิทธิ์เข้าถึง Google Sheet ของระบบ กรุณาแจ้งผู้ดูแลให้แชร์สิทธิ์ (ผู้แก้ไข) ให้อีเมลนี้');
  }
  if (!isAllowed_(email)) {
    log_(email, 'ถูกปฏิเสธ', 'ไม่อยู่ในรายชื่อชีต Users');
    return deniedPage_(email, 'อีเมลนี้ไม่อยู่ในรายชื่อผู้มีสิทธิ์ใช้งาน กรุณาแจ้งผู้ดูแลให้เพิ่มในชีต Users');
  }
  log_(email, 'เข้าใช้งาน', 'เปิดหน้าเว็บ');

  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('นัดคิวผู้ป่วยใส่แร่')
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
  SpreadsheetApp.getUi().showModelessDialog(html, 'นัดคิวผู้ป่วยใส่แร่');
}

/** สร้างชีตและหัวตารางที่จำเป็น (รันซ้ำได้ ไม่ลบข้อมูลเดิม) */
function setup() {
  ensureSetup_();
  try {
    SpreadsheetApp.getUi().alert('ตั้งค่าเรียบร้อย: สร้างชีต Appointments, Doctors, Holidays, Settings, Users, AccessLog แล้ว\n' +
      'เพิ่มอีเมลผู้ใช้งานในชีต Users ก่อนแชร์ลิงก์');
  } catch (e) { /* รันจาก editor ไม่มี UI */ }
}

/* ------------------------------------------------------------------ */
/*  API ที่หน้าเว็บเรียกผ่าน google.script.run                          */
/* ------------------------------------------------------------------ */

function getInitData() {
  ensureSetup_();
  const email = requireUser_();
  const settings = getSettings_();
  return {
    user: { email: email, name: userName_(email) },
    doctors: getDoctors_(),
    types: TYPE_OPTIONS,
    holidays: getHolidays_(),
    settings: {
      maxCasesPerDay: maxCases_(settings),
      calendarName: getCalendar_().getName()
    },
    appointments: listAppointments_()
  };
}

function listAppointments() {
  requireUser_();
  return listAppointments_();
}

/**
 * สร้างนัดทั้งคอร์สในคลิกเดียว
 * payload = { hn, name, doctor, type, totalFx, note, force,
 *             sessions: [{ date:'yyyy-MM-dd' }, ...] }
 */
function createAppointments(payload) {
  const user = requireUser_();
  const p = validatePayload_(payload);

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

    const cal = getCalendar_();
    const tz = Session.getScriptTimeZone();
    const now = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
    // ต่อท้ายด้วยรหัสสุ่ม กันรหัสซ้ำเมื่อบันทึกหลายรายการในวินาทีเดียวกัน
    const courseId = 'BT' + Utilities.formatDate(new Date(), tz, 'yyMMddHHmmss') +
      Utilities.getUuid().replace(/-/g, '').slice(0, 4).toUpperCase();
    const showName = String(settings.SHOW_NAME_IN_CALENDAR).toUpperCase() !== 'FALSE';
    const prefix = settings.EVENT_PREFIX || '';
    const location = settings.LOCATION || '';

    const rows = [];
    const created = [];
    try {
      p.sessions.forEach((s, i) => {
        const fx = i + 1;
        const title = [prefix, 'HN ' + p.hn, showName ? p.name : '', '· ' + p.type, '(Fx ' + fx + '/' + p.totalFx + ')']
          .filter(Boolean).join(' ');
        const desc = [
          'HN: ' + p.hn,
          'ผู้ป่วย: ' + p.name,
          'แพทย์: ' + p.doctor,
          'ชนิด: ' + p.type,
          'Fraction: ' + fx + ' / ' + p.totalFx,
          p.note ? 'หมายเหตุ: ' + p.note : '',
          'รหัสคอร์ส: ' + courseId,
          'ผู้บันทึก: ' + user
        ].filter(Boolean).join('\n');

        const ev = cal.createAllDayEvent(title, toDate_(s.date), { description: desc, location: location });
        try { ev.setColor(CalendarApp.EventColor.MAUVE); } catch (e) { /* ignore */ }
        created.push(ev);

        rows.push([
          courseId + '-' + fx, courseId, now, p.hn, p.name, p.doctor, fx, p.totalFx,
          s.date, p.type, p.note, STATUS_BOOKED, ev.getId(), user
        ]);
      });
    } catch (err) {
      // ถ้าสร้าง event ไม่ครบ ให้ลบที่สร้างไปแล้ว เพื่อไม่ให้ปฏิทินกับชีตไม่ตรงกัน
      created.forEach(ev => { try { ev.deleteEvent(); } catch (e) { /* ignore */ } });
      log_(user, 'ลงนัดไม่สำเร็จ', 'HN ' + p.hn + ': ' + err.message);
      throw new Error('สร้างนัดในปฏิทินไม่สำเร็จ: ' + err.message);
    }

    const sh = getSheet_(SHEET_APPTS);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, APPT_HEADERS.length).setValues(rows);
    SpreadsheetApp.flush();

    log_(user, 'ลงนัด', 'HN ' + p.hn + ' ' + p.name + ' / ' + p.doctor + ' / ' + p.type + ' / ' + rows.length + ' Fx (' +
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
function cancelAppointment(apptId, scope) {
  return updateStatus_(apptId, scope, STATUS_CANCELLED, true);
}

/** บันทึกว่าผู้ป่วยมาตามนัดแล้ว */
function markDone(apptId) {
  return updateStatus_(apptId, 'one', STATUS_DONE, false);
}

/* ------------------------------------------------------------------ */
/*  ผู้ใช้ / สิทธิ์ / log                                               */
/* ------------------------------------------------------------------ */

function currentEmail_() {
  try { return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); }
  catch (e) { return ''; }
}

function requireUser_() {
  const email = currentEmail_();
  if (!email) throw new Error('กรุณา login บัญชี Google ก่อนใช้งาน');
  if (!isAllowed_(email)) {
    log_(email, 'ถูกปฏิเสธ', 'เรียกใช้ API โดยไม่มีสิทธิ์');
    throw new Error('อีเมล ' + email + ' ไม่มีสิทธิ์ใช้งาน');
  }
  return email;
}

function getUsers_() {
  const sh = getSheet_(SHEET_USERS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 3).getDisplayValues()
    .filter(r => r[0].trim())
    .map(r => ({
      email: r[0].trim().toLowerCase(),
      name: r[1].trim(),
      active: String(r[2]).trim().toUpperCase() !== 'FALSE'
    }));
}

function isAllowed_(email) {
  return getUsers_().some(u => u.active && u.email === email);
}

function userName_(email) {
  const u = getUsers_().find(x => x.email === email);
  return (u && u.name) || email;
}

/** บันทึกการใช้งานลงชีต AccessLog */
function log_(email, action, detail) {
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_LOG);
    if (!sh) return;
    const tz = Session.getScriptTimeZone();
    sh.appendRow([Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss'), email || '(ไม่ทราบ)', action, detail || '']);
  } catch (e) { /* ไม่ให้ log ที่ผิดพลาดทำให้งานหลักล้ม */ }
}

function deniedPage_(email, message) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html =
    '<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">' +
    '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">' +
    '<style>body{font-family:Sarabun,sans-serif;background:#f5f3fa;color:#1f1b2e;display:flex;min-height:90vh;' +
    'align-items:center;justify-content:center;padding:16px;margin:0}.b{background:#fff;border:1px solid #e3dfee;' +
    'border-radius:12px;padding:24px;max-width:460px}h1{font-size:20px;color:#b3261e;margin:0 0 8px}' +
    'code{background:#efe8f8;padding:2px 6px;border-radius:6px}</style></head><body><div class="b">' +
    '<h1>🔒 ไม่สามารถเข้าใช้งานได้</h1><p>' + esc(message) + '</p>' +
    (email ? '<p>บัญชีที่ login อยู่: <code>' + esc(email) + '</code></p>' : '') +
    '<p style="font-size:13px;color:#6b6680">ถ้า login ผิดบัญชี ให้ออกจากระบบ Google แล้ว login ใหม่ด้วยบัญชีที่ได้รับสิทธิ์</p>' +
    '</div></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('ไม่มีสิทธิ์ใช้งาน')
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

function updateStatus_(apptId, scope, newStatus, deleteEvent) {
  const user = requireUser_();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet_(SHEET_APPTS);
    const last = sh.getLastRow();
    if (last < 2) throw new Error('ไม่พบนัด');
    const data = sh.getRange(2, 1, last - 1, APPT_HEADERS.length).getDisplayValues();
    const target = data.find(r => r[COL.apptId] === apptId);
    if (!target) throw new Error('ไม่พบนัด ' + apptId);

    const cal = getCalendar_();
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
      sh.getRange(i + 2, COL.status + 1).setValue(newStatus);
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

function validatePayload_(payload) {
  if (!payload) throw new Error('ไม่มีข้อมูล');
  const p = {
    hn: String(payload.hn || '').trim(),
    name: String(payload.name || '').trim(),
    doctor: String(payload.doctor || '').trim(),
    type: String(payload.type || '').trim(),
    note: String(payload.note || '').trim(),
    totalFx: parseInt(payload.totalFx, 10),
    force: !!payload.force,
    sessions: Array.isArray(payload.sessions) ? payload.sessions : []
  };
  if (!p.hn) throw new Error('กรุณากรอก HN');
  if (!p.name) throw new Error('กรุณากรอกชื่อผู้ป่วย');
  if (!p.doctor) throw new Error('กรุณาเลือกแพทย์');
  if (getDoctors_().indexOf(p.doctor) < 0) throw new Error('แพทย์ "' + p.doctor + '" ไม่อยู่ในรายชื่อ (ชีต Doctors)');
  if (!p.type || p.type === 'อื่นๆ') throw new Error('กรุณาเลือกชนิด หรือกรอกชนิดในช่อง "อื่นๆ"');
  if (p.type.length > 100) throw new Error('ชนิดยาวเกินไป');
  if (!(p.totalFx >= 1 && p.totalFx <= 30)) throw new Error('จำนวน fraction ต้องอยู่ระหว่าง 1–30');
  if (p.sessions.length !== p.totalFx) throw new Error('จำนวนวันนัดไม่ตรงกับจำนวน fraction');

  const reDate = /^\d{4}-\d{2}-\d{2}$/;
  p.sessions = p.sessions.map((s, i) => {
    const o = { date: String(s && s.date) };
    if (!reDate.test(o.date)) throw new Error('วันที่ของ Fx ' + (i + 1) + ' ไม่ถูกต้อง');
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
        with: same.map(a => 'HN ' + a.hn + ' ' + a.name + ' Fx ' + a.fx + '/' + a.totalFx + ' (' + a.type + ')').join(', ')
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
    date: r[COL.date], type: r[COL.type],
    note: r[COL.note], status: r[COL.status], createdBy: r[COL.createdBy]
  };
}

/** เรียงตามวันที่ แล้วตามลำดับแถวในชีต (= ลำดับที่ลงนัด / ลำดับคิวในวันนั้น) */
function compareAppt_(a, b) {
  return a.date.localeCompare(b.date) || a.row - b.row;
}

function toDate_(dateStr) {
  const d = dateStr.split('-').map(Number);
  return new Date(d[0], d[1] - 1, d[2]); // ใช้ timezone ของสคริปต์ (Asia/Bangkok)
}

function getCalendar_() {
  const id = String(getSettings_().CALENDAR_ID || '').trim();
  if (!id) return CalendarApp.getDefaultCalendar();
  const cal = CalendarApp.getCalendarById(id);
  if (!cal) throw new Error('ไม่พบปฏิทิน ' + id + ' หรือบัญชีนี้ไม่มีสิทธิ์แก้ไขปฏิทิน (ตรวจสอบ CALENDAR_ID และการแชร์ปฏิทิน)');
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
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('ไม่พบชีต ' + name + ' (เมนู นัดคิวใส่แร่ > ตั้งค่าชีตครั้งแรก)');
  return sh;
}

function ensureSetup_() {
  const ss = SpreadsheetApp.getActive();

  let sh = ss.getSheetByName(SHEET_APPTS);
  if (!sh) {
    sh = ss.insertSheet(SHEET_APPTS);
    sh.getRange(1, 1, 1, APPT_HEADERS.length).setValues([APPT_HEADERS])
      .setFontWeight('bold').setBackground('#ede7f6');
    sh.setFrozenRows(1);
    // เก็บวันที่เป็นข้อความ เพื่อไม่ให้ชีตแปลง timezone หรือรูปแบบวันที่
    sh.getRange('I:I').setNumberFormat('@');
    sh.getRange('D:D').setNumberFormat('@'); // HN อาจขึ้นต้นด้วย 0
  } else if (sh.getRange(1, 10).getDisplayValues()[0][0] === 'เวลาเริ่ม') {
    // อัปเดตจากเวอร์ชันที่มีเวลา: ลบคอลัมน์เวลาสิ้นสุด และเปลี่ยนคอลัมน์เวลาเริ่มเป็น "ชนิด"
    sh.deleteColumn(11);
    sh.getRange(1, 10).setValue('ชนิด');
    if (sh.getLastRow() >= 2) sh.getRange(2, 10, sh.getLastRow() - 1, 1).setValue('-');
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

  sh = ss.getSheetByName(SHEET_USERS);
  if (!sh) {
    sh = ss.insertSheet(SHEET_USERS);
    sh.getRange(1, 1, 1, 3).setValues([['อีเมล (Gmail)', 'ชื่อ', 'ใช้งาน (TRUE/FALSE)']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    const owner = currentEmail_();
    if (owner) sh.getRange(2, 1, 1, 3).setValues([[owner, 'ผู้ดูแลระบบ', 'TRUE']]);
    sh.autoResizeColumns(1, 3);
  }

  sh = ss.getSheetByName(SHEET_LOG);
  if (!sh) {
    sh = ss.insertSheet(SHEET_LOG);
    sh.getRange(1, 1, 1, 4).setValues([['เวลา', 'อีเมล', 'การกระทำ', 'รายละเอียด']])
      .setFontWeight('bold').setBackground('#ede7f6');
    sh.setFrozenRows(1);
  }
}
