/**
 * ระบบนัดคิวผู้ป่วยใส่แร่ (Brachytherapy Appointment Queue)
 *
 * - หน้าเว็บกรอก HN / ชื่อผู้ป่วย / แพทย์ / จำนวน fraction
 * - กดปุ่มเดียว: สร้างนัดทุก fraction ลง Google Calendar + บันทึกลง Google Sheet
 * - ยกเลิกนัดได้ (ลบ event ในปฏิทิน และเปลี่ยนสถานะในชีต)
 *
 * ต้องผูกสคริปต์นี้กับ Google Sheet (Extensions > Apps Script)
 */

const SHEET_APPTS = 'Appointments';
const SHEET_DOCTORS = 'Doctors';
const SHEET_HOLIDAYS = 'Holidays';
const SHEET_SETTINGS = 'Settings';

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
  'เวลาเริ่ม',           // J  HH:mm
  'เวลาสิ้นสุด',         // K  HH:mm
  'หมายเหตุ',           // L
  'สถานะ',              // M  นัดแล้ว / ยกเลิก / มาตามนัด
  'Calendar Event ID', // N
  'ผู้บันทึก'            // O
];
const COL = {};
['apptId', 'courseId', 'createdAt', 'hn', 'name', 'doctor', 'fx', 'totalFx',
  'date', 'start', 'end', 'note', 'status', 'eventId', 'createdBy']
  .forEach((k, i) => { COL[k] = i; });

const STATUS_BOOKED = 'นัดแล้ว';
const STATUS_CANCELLED = 'ยกเลิก';
const STATUS_DONE = 'มาตามนัด';

const DEFAULT_SETTINGS = [
  ['CALENDAR_ID', '', 'ID ของปฏิทินที่จะลงนัด (เว้นว่าง = ปฏิทินหลักของบัญชีนี้)'],
  ['EVENT_PREFIX', '[ใส่แร่]', 'คำนำหน้าชื่อนัดในปฏิทิน'],
  ['SHOW_NAME_IN_CALENDAR', 'TRUE', 'TRUE = แสดงชื่อผู้ป่วยในปฏิทิน, FALSE = แสดงเฉพาะ HN'],
  ['LOCATION', 'ห้องใส่แร่ (Brachytherapy)', 'สถานที่ที่แสดงในนัด'],
  ['DEFAULT_START_TIME', '09:00', 'เวลาเริ่มต้นที่ตั้งไว้ในฟอร์ม'],
  ['DEFAULT_DURATION_MIN', '60', 'ระยะเวลาต่อ fraction (นาที)'],
  ['MAX_PARALLEL', '1', 'จำนวนผู้ป่วยสูงสุดที่ทำพร้อมกันในช่วงเวลาเดียว (ใช้ตรวจนัดซ้อน)']
];

/* ------------------------------------------------------------------ */
/*  Entry points                                                       */
/* ------------------------------------------------------------------ */

function doGet() {
  ensureSetup_();
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
    SpreadsheetApp.getUi().alert('ตั้งค่าเรียบร้อย: สร้างชีต Appointments, Doctors, Holidays, Settings แล้ว');
  } catch (e) { /* รันจาก editor ไม่มี UI */ }
}

/* ------------------------------------------------------------------ */
/*  API ที่หน้าเว็บเรียกผ่าน google.script.run                          */
/* ------------------------------------------------------------------ */

function getInitData() {
  ensureSetup_();
  const settings = getSettings_();
  return {
    doctors: getDoctors_(),
    holidays: getHolidays_(),
    settings: {
      defaultStartTime: settings.DEFAULT_START_TIME || '09:00',
      defaultDurationMin: Number(settings.DEFAULT_DURATION_MIN) || 60,
      calendarName: getCalendar_().getName()
    },
    appointments: listAppointments()
  };
}

/** คืนรายการนัดทั้งหมด เรียงตามวันที่/เวลา */
function listAppointments() {
  const sh = getSheet_(SHEET_APPTS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, APPT_HEADERS.length).getDisplayValues();
  return rows
    .filter(r => r[COL.apptId])
    .map(rowToObj_)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

/**
 * สร้างนัดทั้งคอร์สในคลิกเดียว
 * payload = { hn, name, doctor, totalFx, note, force,
 *             sessions: [{ date:'yyyy-MM-dd', start:'HH:mm', end:'HH:mm' }, ...] }
 */
function createAppointments(payload) {
  const p = validatePayload_(payload);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (!p.force) {
      const conflicts = findConflicts_(p.sessions);
      if (conflicts.length) return { ok: false, needConfirm: true, conflicts: conflicts };
    }

    const settings = getSettings_();
    const cal = getCalendar_();
    const tz = Session.getScriptTimeZone();
    const now = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
    const user = safeEmail_();
    const courseId = 'BT' + Utilities.formatDate(new Date(), tz, 'yyMMddHHmmss');
    const showName = String(settings.SHOW_NAME_IN_CALENDAR).toUpperCase() !== 'FALSE';
    const prefix = settings.EVENT_PREFIX || '';
    const location = settings.LOCATION || '';

    const rows = [];
    const created = [];
    try {
      p.sessions.forEach((s, i) => {
        const fx = i + 1;
        const title = [prefix, 'HN ' + p.hn, showName ? p.name : '', '(Fx ' + fx + '/' + p.totalFx + ')']
          .filter(Boolean).join(' ');
        const desc = [
          'HN: ' + p.hn,
          'ผู้ป่วย: ' + p.name,
          'แพทย์: ' + p.doctor,
          'Fraction: ' + fx + ' / ' + p.totalFx,
          p.note ? 'หมายเหตุ: ' + p.note : '',
          'รหัสคอร์ส: ' + courseId
        ].filter(Boolean).join('\n');

        const ev = cal.createEvent(title, toDate_(s.date, s.start), toDate_(s.date, s.end),
          { description: desc, location: location });
        try { ev.setColor(CalendarApp.EventColor.MAUVE); } catch (e) { /* ignore */ }
        created.push(ev);

        rows.push([
          courseId + '-' + fx, courseId, now, p.hn, p.name, p.doctor, fx, p.totalFx,
          s.date, s.start, s.end, p.note, STATUS_BOOKED, ev.getId(), user
        ]);
      });
    } catch (err) {
      // ถ้าสร้าง event ไม่ครบ ให้ลบที่สร้างไปแล้ว เพื่อไม่ให้ปฏิทินกับชีตไม่ตรงกัน
      created.forEach(ev => { try { ev.deleteEvent(); } catch (e) { /* ignore */ } });
      throw new Error('สร้างนัดในปฏิทินไม่สำเร็จ: ' + err.message);
    }

    const sh = getSheet_(SHEET_APPTS);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, APPT_HEADERS.length).setValues(rows);
    SpreadsheetApp.flush();

    return { ok: true, courseId: courseId, count: rows.length, appointments: listAppointments() };
  } finally {
    lock.releaseLock();
  }
}

/** ยกเลิกนัด: scope = 'one' (เฉพาะ fraction นี้) หรือ 'course' (ทั้งคอร์สที่ยังไม่ถึง/ยังไม่ยกเลิก) */
function cancelAppointment(apptId, scope) {
  return updateStatus_(apptId, scope, STATUS_CANCELLED, true);
}

/** บันทึกว่าผู้ป่วยมาตามนัดแล้ว */
function markDone(apptId) {
  return updateStatus_(apptId, 'one', STATUS_DONE, false);
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

function updateStatus_(apptId, scope, newStatus, deleteEvent) {
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
    let changed = 0;
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
      changed++;
    });
    SpreadsheetApp.flush();
    return { ok: true, changed: changed, appointments: listAppointments() };
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
    note: String(payload.note || '').trim(),
    totalFx: parseInt(payload.totalFx, 10),
    force: !!payload.force,
    sessions: Array.isArray(payload.sessions) ? payload.sessions : []
  };
  if (!p.hn) throw new Error('กรุณากรอก HN');
  if (!p.name) throw new Error('กรุณากรอกชื่อผู้ป่วย');
  if (!p.doctor) throw new Error('กรุณาเลือกแพทย์');
  if (!(p.totalFx >= 1 && p.totalFx <= 30)) throw new Error('จำนวน fraction ต้องอยู่ระหว่าง 1–30');
  if (p.sessions.length !== p.totalFx) throw new Error('จำนวนวันนัดไม่ตรงกับจำนวน fraction');

  const reDate = /^\d{4}-\d{2}-\d{2}$/;
  const reTime = /^\d{2}:\d{2}$/;
  p.sessions = p.sessions.map((s, i) => {
    const o = { date: String(s.date), start: String(s.start), end: String(s.end) };
    if (!reDate.test(o.date) || !reTime.test(o.start) || !reTime.test(o.end)) {
      throw new Error('วัน/เวลาของ Fx ' + (i + 1) + ' ไม่ถูกต้อง');
    }
    if (o.end <= o.start) throw new Error('เวลาสิ้นสุดของ Fx ' + (i + 1) + ' ต้องหลังเวลาเริ่ม');
    return o;
  });
  return p;
}

/** หานัดที่ซ้อนเวลากัน (จากชีต) เกินจำนวน MAX_PARALLEL */
function findConflicts_(sessions) {
  const maxParallel = Math.max(1, Number(getSettings_().MAX_PARALLEL) || 1);
  const booked = listAppointments().filter(a => a.status === STATUS_BOOKED);
  const out = [];
  sessions.forEach((s, i) => {
    const overlap = booked.filter(a => a.date === s.date && a.start < s.end && s.start < a.end);
    if (overlap.length >= maxParallel) {
      out.push({
        fx: i + 1, date: s.date, start: s.start, end: s.end,
        with: overlap.map(a => a.hn + ' ' + a.name + ' (' + a.start + '–' + a.end + ')').join(', ')
      });
    }
  });
  return out;
}

function rowToObj_(r) {
  return {
    apptId: r[COL.apptId], courseId: r[COL.courseId], createdAt: r[COL.createdAt],
    hn: r[COL.hn], name: r[COL.name], doctor: r[COL.doctor],
    fx: Number(r[COL.fx]), totalFx: Number(r[COL.totalFx]),
    date: r[COL.date], start: r[COL.start], end: r[COL.end],
    note: r[COL.note], status: r[COL.status], createdBy: r[COL.createdBy]
  };
}

function toDate_(dateStr, timeStr) {
  const d = dateStr.split('-').map(Number);
  const t = timeStr.split(':').map(Number);
  return new Date(d[0], d[1] - 1, d[2], t[0], t[1], 0); // ใช้ timezone ของสคริปต์ (Asia/Bangkok)
}

function getCalendar_() {
  const id = String(getSettings_().CALENDAR_ID || '').trim();
  if (!id) return CalendarApp.getDefaultCalendar();
  const cal = CalendarApp.getCalendarById(id);
  if (!cal) throw new Error('ไม่พบปฏิทิน ' + id + ' (ตรวจสอบ CALENDAR_ID ในชีต Settings)');
  return cal;
}

function getDoctors_() {
  const sh = getSheet_(SHEET_DOCTORS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 1).getDisplayValues()
    .map(r => r[0].trim()).filter(Boolean);
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
    // เก็บวัน/เวลาเป็นข้อความ เพื่อไม่ให้ชีตแปลง timezone หรือรูปแบบวันที่
    sh.getRange('I:K').setNumberFormat('@');
    sh.getRange('D:D').setNumberFormat('@'); // HN อาจขึ้นต้นด้วย 0
  }

  sh = ss.getSheetByName(SHEET_DOCTORS);
  if (!sh) {
    sh = ss.insertSheet(SHEET_DOCTORS);
    sh.getRange(1, 1).setValue('ชื่อแพทย์').setFontWeight('bold');
    sh.getRange(2, 1, 2, 1).setValues([['พญ. ตัวอย่าง หนึ่ง'], ['นพ. ตัวอย่าง สอง']]);
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
    sh.getRange(2, 1, DEFAULT_SETTINGS.length, 3).setNumberFormat('@').setValues(DEFAULT_SETTINGS);
    sh.autoResizeColumns(1, 3);
  }
}

function safeEmail_() {
  try { return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail(); }
  catch (e) { return ''; }
}
