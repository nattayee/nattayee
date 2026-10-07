// สร้างอัตโนมัติจาก public/ ด้วยคำสั่ง npm run build:gas — แก้ที่ไฟล์ต้นฉบับแล้วสร้างใหม่
// ตรรกะคำนวณวันฉาย ค่าคงที่ และรายการรหัส ICD ใช้ร่วมกันกับหน้าเว็บ (public/js/schedule.js, public/js/icd.js)

// ตรรกะการคำนวณตารางฉายรังสี (pure functions — ใช้ได้ทั้งฝั่งเบราว์เซอร์และ Node สำหรับทดสอบ)
// วันที่ทั้งหมดใช้รูปแบบ 'YYYY-MM-DD' และคำนวณแบบ UTC เพื่อเลี่ยงปัญหา timezone

const ROOMS = [
  { id: 'L1', name: 'Infinity', label: 'L1 · Infinity' },
  { id: 'L2', name: 'Precise', label: 'L2 · Precise' },
  { id: 'L3', name: 'VersaHD', label: 'L3 · VersaHD' },
];

// ชนิดเทคนิคการฉาย พร้อมระยะเวลาต่อครั้ง (นาที) ที่ใช้เป็นค่าเริ่มต้น
const TECHNIQUES = [
  { id: '2D', name: '2D Conventional', duration: 10 },
  { id: '3DCRT', name: '3D-CRT', duration: 15 },
  { id: 'IMRT', name: 'IMRT', duration: 15 },
  { id: 'VMAT', name: 'VMAT', duration: 15 },
  { id: 'SRS', name: 'SRS', duration: 45 },
  { id: 'SRT', name: 'SRT', duration: 30 },
  { id: 'SBRT', name: 'SBRT', duration: 30 },
  { id: 'ELECTRON', name: 'Electron', duration: 10 },
  { id: 'TBI', name: 'TBI', duration: 60 },
];

// รูปแบบการทำ CBCT ระหว่างคอร์สการฉาย
const CBCT_MODES = [
  { id: 'fx1', name: 'เฉพาะครั้งแรก (Fx 1)' },
  { id: 'fx123_weekly', name: '3 ครั้งแรก แล้วสัปดาห์ละครั้ง' },
  { id: 'weekly', name: 'สัปดาห์ละครั้ง (Fx 1, 6, 11, …)' },
  { id: 'daily', name: 'ทุกครั้ง (Daily CBCT)' },
  { id: 'none', name: 'ไม่ทำ CBCT ระหว่างฉาย' },
  { id: 'custom', name: 'กำหนดวันเอง' },
];

const STATUSES = [
  { id: 'active', name: 'ปกติ' },
  { id: 'hold', name: 'พักการฉาย' },
  { id: 'cancelled', name: 'ยกเลิก' },
];

// วันหยุดราชการไทยที่ตรงกับวันที่เดิมทุกปี (วันหยุดทางจันทรคติ/ชดเชย ให้เพิ่มเองในหน้าตั้งค่า)
const FIXED_THAI_HOLIDAYS = [
  ['01-01', 'วันขึ้นปีใหม่'],
  ['04-06', 'วันจักรี'],
  ['04-13', 'วันสงกรานต์'],
  ['04-14', 'วันสงกรานต์'],
  ['04-15', 'วันสงกรานต์'],
  ['05-01', 'วันแรงงานแห่งชาติ'],
  ['05-04', 'วันฉัตรมงคล'],
  ['06-03', 'วันเฉลิมพระชนมพรรษา สมเด็จพระราชินี'],
  ['07-28', 'วันเฉลิมพระชนมพรรษา ร.10'],
  ['08-12', 'วันแม่แห่งชาติ'],
  ['10-13', 'วันนวมินทรมหาราช'],
  ['10-23', 'วันปิยมหาราช'],
  ['12-05', 'วันพ่อแห่งชาติ'],
  ['12-10', 'วันรัฐธรรมนูญ'],
  ['12-31', 'วันสิ้นปี'],
];

function defaultHolidays(years) {
  const out = [];
  for (const y of years) {
    for (const [md, name] of FIXED_THAI_HOLIDAYS) out.push({ date: `${y}-${md}`, name });
  }
  return out;
}

const DEFAULT_PHYSICIANS = ['ทัศน์วรรณ อาษากิจ', 'ศิริรัตน์ เชื้อสำราญ', 'พัฒธิดา มโนรส', 'ทินกร จอมใจ'];

function defaultSettings(today = todayISO()) {
  const y = Number(today.slice(0, 4));
  return {
    workdays: [1, 2, 3, 4, 5], // 0=อาทิตย์ … 6=เสาร์
    holidays: defaultHolidays([y, y + 1]),
    rooms: Object.fromEntries(ROOMS.map((r) => [r.id, { open: '08:00', close: '16:30' }])),
    slotMinutes: 15,
    physicians: [...DEFAULT_PHYSICIANS],
  };
}

// ---------- วันที่ ----------

function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(iso, n) {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

function dayOfWeek(iso) {
  return parseISO(iso).getUTCDay();
}

function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfWeek(iso) {
  // สัปดาห์เริ่มวันจันทร์
  const dow = dayOfWeek(iso);
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

function isWorkday(iso, settings) {
  if (!settings.workdays.includes(dayOfWeek(iso))) return false;
  return !settings.holidays.some((h) => h.date === iso);
}

function nextWorkday(iso, settings) {
  let d = iso;
  for (let i = 0; i < 60 && !isWorkday(d, settings); i++) d = addDays(d, 1);
  return d;
}

// ---------- เวลา ----------

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

function overlaps(aStart, aDur, bStart, bDur) {
  const a = toMinutes(aStart);
  const b = toMinutes(bStart);
  return a < b + bDur && b < a + aDur;
}

// ---------- ตารางฉาย ----------

// สร้างรายการวันฉายตามจำนวน fraction โดยข้ามวันหยุดและวันที่ไม่ใช่วันทำการ
// skipDates: วันที่ผู้ป่วยงดฉายเฉพาะราย (เช่น เลื่อนนัด)
function generateTreatmentDates(startDate, fractions, settings, skipDates = []) {
  const dates = [];
  if (!startDate || !(fractions > 0)) return dates;
  let d = startDate;
  let guard = 0;
  while (dates.length < fractions && guard++ < 1000) {
    if (isWorkday(d, settings) && !skipDates.includes(d)) dates.push(d);
    d = addDays(d, 1);
  }
  return dates;
}

// คืนค่าลำดับ fraction (เริ่มที่ 1) ที่ต้องทำ CBCT ตามรูปแบบที่เลือก
function cbctFractions(mode, fractions) {
  const out = [];
  for (let fx = 1; fx <= fractions; fx++) {
    let yes = false;
    switch (mode) {
      case 'fx1':
        yes = fx === 1;
        break;
      case 'fx123_weekly':
        yes = fx <= 3 || (fx > 3 && (fx - 3) % 5 === 0);
        break;
      case 'weekly':
        yes = (fx - 1) % 5 === 0;
        break;
      case 'daily':
        yes = true;
        break;
      default:
        yes = false;
    }
    if (yes) out.push(fx);
  }
  return out;
}

function cbctDatesForMode(mode, treatmentDates) {
  return cbctFractions(mode, treatmentDates.length).map((fx) => treatmentDates[fx - 1]);
}

// รวมข้อมูลนัดหนึ่งรายให้เป็นรายการ session ต่อวัน
function buildSessions(appt, settings) {
  const dates = generateTreatmentDates(appt.startDate, Number(appt.fractions), settings, appt.skipDates || []);
  const cbct =
    appt.cbctMode === 'custom' ? new Set(appt.cbctDates || []) : new Set(cbctDatesForMode(appt.cbctMode, dates));
  return dates.map((date, i) => ({ date, fx: i + 1, cbct: cbct.has(date) }));
}

// สถานะตามช่วงเวลา (คำนวณจากวันที่ ไม่ได้เก็บในฐานข้อมูล)
function phaseOf(appt, sessions, today) {
  if (appt.status === 'cancelled') return 'cancelled';
  if (appt.status === 'hold') return 'hold';
  if (!sessions.length) return 'waiting';
  if (today < sessions[0].date) return 'waiting';
  if (today > sessions[sessions.length - 1].date) return 'completed';
  return 'treating';
}

const PHASE_LABELS = {
  waiting: 'รอเริ่มฉาย',
  treating: 'กำลังฉาย',
  completed: 'ฉายครบ',
  hold: 'พักการฉาย',
  cancelled: 'ยกเลิก',
};

// เหตุการณ์ทั้งหมดของผู้ป่วยหนึ่งราย: วันฉายแต่ละครั้ง + วันนัด CBCT ก่อนฉาย (verification/dry run)
function eventsOf(appt, settings) {
  const sessions = buildSessions(appt, settings);
  const events = sessions.map((s) => ({
    type: 'fx',
    date: s.date,
    fx: s.fx,
    total: sessions.length,
    cbct: s.cbct,
    start: s.fx === 1,
    time: appt.time,
    duration: Number(appt.duration),
    room: appt.room,
    appt,
  }));
  if (appt.verifyDate) {
    events.push({
      type: 'verify',
      date: appt.verifyDate,
      fx: 0,
      total: sessions.length,
      cbct: true,
      start: false,
      time: appt.verifyTime || appt.time,
      duration: Number(appt.verifyDuration || 20),
      room: appt.room,
      appt,
    });
  }
  return events;
}

function isBlocking(appt) {
  return appt.status !== 'cancelled' && appt.status !== 'hold';
}

// รวมเหตุการณ์ทุกรายเป็น map ตามวันที่: { 'YYYY-MM-DD': [event, …] }
function eventsByDate(appts, settings) {
  const map = new Map();
  for (const a of appts) {
    if (!isBlocking(a)) continue;
    for (const ev of eventsOf(a, settings)) {
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date).push(ev);
    }
  }
  for (const list of map.values()) list.sort((x, y) => x.time.localeCompare(y.time) || x.room.localeCompare(y.room));
  return map;
}

// หาการนัดที่ซ้อนเวลากันในห้องเดียวกัน
function findConflicts(appt, others, settings) {
  const mine = eventsOf(appt, settings);
  const conflicts = [];
  for (const o of others) {
    if (o === appt || (appt.id != null && o.id === appt.id) || o.room !== appt.room || !isBlocking(o)) continue;
    const theirs = eventsOf(o, settings);
    const byDate = new Map();
    for (const t of theirs) {
      if (!byDate.has(t.date)) byDate.set(t.date, []);
      byDate.get(t.date).push(t);
    }
    for (const m of mine) {
      for (const t of byDate.get(m.date) || []) {
        if (overlaps(m.time, m.duration, t.time, t.duration)) {
          conflicts.push({ date: m.date, time: t.time, duration: t.duration, with: o });
        }
      }
    }
  }
  return conflicts.sort((a, b) => a.date.localeCompare(b.date));
}

// แนะนำเวลาว่างแรกในห้องที่ไม่ชนกับใครตลอดทั้งคอร์ส
function suggestTimes(appt, others, settings, limit = 5) {
  const room = settings.rooms[appt.room] || { open: '08:00', close: '16:30' };
  const step = settings.slotMinutes || 15;
  const dur = Number(appt.duration) || step;
  const out = [];
  for (let t = toMinutes(room.open); t + dur <= toMinutes(room.close) && out.length < limit; t += step) {
    const time = fromMinutes(t);
    const trial = { ...appt, time, verifyTime: appt.verifyTime || time };
    if (!findConflicts(trial, others, settings).length) out.push(time);
  }
  return out;
}

// เปอร์เซ็นต์การใช้เครื่อง (นาทีที่นัด / นาทีที่เปิดให้บริการ)
function utilization(events, roomSetting) {
  const open = toMinutes(roomSetting.close) - toMinutes(roomSetting.open);
  const used = events.reduce((s, e) => s + e.duration, 0);
  return open > 0 ? used / open : 0;
}

// รายการรหัสสำหรับการนัดผู้ป่วยรังสีรักษา
// - ICD-10 (WHO; รหัสกลุ่มเนื้องอกตรงกับ ICD-10-TM) — การวินิจฉัย
// - ICD-9-CM Volume 3 หมวด 92.2x–92.4x — หัตถการรังสีรักษา
// แต่ละรายการ: [รหัส, ชื่อภาษาอังกฤษ, คำค้นภาษาไทย (ไม่บังคับ)]

const NAME_PREFIXES = [
  { id: 'นาย', sex: 'ชาย' },
  { id: 'นาง', sex: 'หญิง' },
  { id: 'นางสาว', sex: 'หญิง' },
  { id: 'ด.ช.', sex: 'ชาย' },
  { id: 'ด.ญ.', sex: 'หญิง' },
  { id: 'พระภิกษุ', sex: 'ชาย' },
];

// ชื่อเต็มสำหรับแสดงผล: คำนำหน้าสั้นติดกับชื่อ (นายสมชาย) คำนำหน้ายาวเว้นวรรค (พระภิกษุ สมชาย)
function composeName(prefix, firstName, lastName) {
  const p = (prefix || '').trim();
  const f = (firstName || '').trim();
  const l = (lastName || '').trim();
  const glue = !p || ['นาย', 'นาง', 'นางสาว', 'ด.ช.', 'ด.ญ.'].includes(p) ? '' : ' ';
  return `${p}${glue}${f}${l ? ` ${l}` : ''}`.trim();
}

const ICD10 = [
  // ---- ศีรษะและลำคอ ----
  ['C00.9', 'Malignant neoplasm of lip, unspecified', 'มะเร็งริมฝีปาก'],
  ['C01', 'Malignant neoplasm of base of tongue', 'มะเร็งโคนลิ้น'],
  ['C02.0', 'Malignant neoplasm of dorsal surface of tongue', 'มะเร็งลิ้น'],
  ['C02.1', 'Malignant neoplasm of border of tongue', 'มะเร็งลิ้น'],
  ['C02.2', 'Malignant neoplasm of ventral surface of tongue', 'มะเร็งลิ้น'],
  ['C02.9', 'Malignant neoplasm of tongue, unspecified', 'มะเร็งลิ้น'],
  ['C03.9', 'Malignant neoplasm of gum, unspecified', 'มะเร็งเหงือก'],
  ['C04.9', 'Malignant neoplasm of floor of mouth, unspecified', 'มะเร็งพื้นปาก'],
  ['C05.0', 'Malignant neoplasm of hard palate', 'มะเร็งเพดานแข็ง'],
  ['C05.1', 'Malignant neoplasm of soft palate', 'มะเร็งเพดานอ่อน'],
  ['C06.0', 'Malignant neoplasm of cheek mucosa', 'มะเร็งกระพุ้งแก้ม'],
  ['C06.9', 'Malignant neoplasm of mouth, unspecified', 'มะเร็งช่องปาก'],
  ['C07', 'Malignant neoplasm of parotid gland', 'มะเร็งต่อมน้ำลายพาโรติด'],
  ['C08.0', 'Malignant neoplasm of submandibular gland', 'มะเร็งต่อมน้ำลายใต้ขากรรไกร'],
  ['C09.9', 'Malignant neoplasm of tonsil, unspecified', 'มะเร็งต่อมทอนซิล'],
  ['C10.9', 'Malignant neoplasm of oropharynx, unspecified', 'มะเร็งคอหอยส่วนปาก'],
  ['C11.0', 'Malignant neoplasm of superior wall of nasopharynx', 'มะเร็งโพรงหลังจมูก'],
  ['C11.1', 'Malignant neoplasm of posterior wall of nasopharynx', 'มะเร็งโพรงหลังจมูก'],
  ['C11.2', 'Malignant neoplasm of lateral wall of nasopharynx', 'มะเร็งโพรงหลังจมูก'],
  ['C11.3', 'Malignant neoplasm of anterior wall of nasopharynx', 'มะเร็งโพรงหลังจมูก'],
  ['C11.8', 'Malignant neoplasm of overlapping lesion of nasopharynx', 'มะเร็งโพรงหลังจมูก'],
  ['C11.9', 'Malignant neoplasm of nasopharynx, unspecified', 'มะเร็งโพรงหลังจมูก NPC'],
  ['C12', 'Malignant neoplasm of piriform sinus', 'มะเร็งคอหอยส่วนล่าง'],
  ['C13.9', 'Malignant neoplasm of hypopharynx, unspecified', 'มะเร็งคอหอยส่วนล่าง'],
  ['C14.0', 'Malignant neoplasm of pharynx, unspecified', 'มะเร็งคอหอย'],
  ['C30.0', 'Malignant neoplasm of nasal cavity', 'มะเร็งโพรงจมูก'],
  ['C31.0', 'Malignant neoplasm of maxillary sinus', 'มะเร็งไซนัส'],
  ['C31.9', 'Malignant neoplasm of accessory sinus, unspecified', 'มะเร็งไซนัส'],
  ['C32.0', 'Malignant neoplasm of glottis', 'มะเร็งกล่องเสียง'],
  ['C32.1', 'Malignant neoplasm of supraglottis', 'มะเร็งกล่องเสียง'],
  ['C32.2', 'Malignant neoplasm of subglottis', 'มะเร็งกล่องเสียง'],
  ['C32.9', 'Malignant neoplasm of larynx, unspecified', 'มะเร็งกล่องเสียง'],
  ['C73', 'Malignant neoplasm of thyroid gland', 'มะเร็งต่อมไทรอยด์'],
  ['C76.0', 'Malignant neoplasm of head, face and neck', 'มะเร็งศีรษะและลำคอ'],

  // ---- ทางเดินอาหาร ----
  ['C15.0', 'Malignant neoplasm of cervical part of oesophagus', 'มะเร็งหลอดอาหาร'],
  ['C15.1', 'Malignant neoplasm of thoracic part of oesophagus', 'มะเร็งหลอดอาหาร'],
  ['C15.2', 'Malignant neoplasm of abdominal part of oesophagus', 'มะเร็งหลอดอาหาร'],
  ['C15.3', 'Malignant neoplasm of upper third of oesophagus', 'มะเร็งหลอดอาหาร'],
  ['C15.4', 'Malignant neoplasm of middle third of oesophagus', 'มะเร็งหลอดอาหาร'],
  ['C15.5', 'Malignant neoplasm of lower third of oesophagus', 'มะเร็งหลอดอาหาร'],
  ['C15.9', 'Malignant neoplasm of oesophagus, unspecified', 'มะเร็งหลอดอาหาร'],
  ['C16.9', 'Malignant neoplasm of stomach, unspecified', 'มะเร็งกระเพาะอาหาร'],
  ['C17.9', 'Malignant neoplasm of small intestine, unspecified', 'มะเร็งลำไส้เล็ก'],
  ['C18.9', 'Malignant neoplasm of colon, unspecified', 'มะเร็งลำไส้ใหญ่'],
  ['C19', 'Malignant neoplasm of rectosigmoid junction', 'มะเร็งลำไส้ใหญ่ส่วนซิกมอยด์'],
  ['C20', 'Malignant neoplasm of rectum', 'มะเร็งลำไส้ตรง ทวารหนัก'],
  ['C21.0', 'Malignant neoplasm of anus, unspecified', 'มะเร็งทวารหนัก'],
  ['C21.1', 'Malignant neoplasm of anal canal', 'มะเร็งช่องทวารหนัก'],
  ['C22.0', 'Liver cell carcinoma', 'มะเร็งตับ HCC'],
  ['C22.1', 'Intrahepatic bile duct carcinoma', 'มะเร็งท่อน้ำดีในตับ'],
  ['C23', 'Malignant neoplasm of gallbladder', 'มะเร็งถุงน้ำดี'],
  ['C24.0', 'Malignant neoplasm of extrahepatic bile duct', 'มะเร็งท่อน้ำดี'],
  ['C25.9', 'Malignant neoplasm of pancreas, unspecified', 'มะเร็งตับอ่อน'],

  // ---- ทรวงอก ----
  ['C33', 'Malignant neoplasm of trachea', 'มะเร็งหลอดลมใหญ่'],
  ['C34.0', 'Malignant neoplasm of main bronchus', 'มะเร็งปอด'],
  ['C34.1', 'Malignant neoplasm of upper lobe, bronchus or lung', 'มะเร็งปอด'],
  ['C34.2', 'Malignant neoplasm of middle lobe, bronchus or lung', 'มะเร็งปอด'],
  ['C34.3', 'Malignant neoplasm of lower lobe, bronchus or lung', 'มะเร็งปอด'],
  ['C34.8', 'Malignant neoplasm of overlapping lesion of bronchus and lung', 'มะเร็งปอด'],
  ['C34.9', 'Malignant neoplasm of bronchus or lung, unspecified', 'มะเร็งปอด'],
  ['C37', 'Malignant neoplasm of thymus', 'มะเร็งต่อมไทมัส'],
  ['C38.1', 'Malignant neoplasm of anterior mediastinum', 'มะเร็งช่องกลางทรวงอก'],
  ['C45.0', 'Mesothelioma of pleura', 'มะเร็งเยื่อหุ้มปอด'],

  // ---- เต้านม ----
  ['C50.0', 'Malignant neoplasm of nipple and areola', 'มะเร็งเต้านม'],
  ['C50.1', 'Malignant neoplasm of central portion of breast', 'มะเร็งเต้านม'],
  ['C50.2', 'Malignant neoplasm of upper-inner quadrant of breast', 'มะเร็งเต้านม'],
  ['C50.3', 'Malignant neoplasm of lower-inner quadrant of breast', 'มะเร็งเต้านม'],
  ['C50.4', 'Malignant neoplasm of upper-outer quadrant of breast', 'มะเร็งเต้านม'],
  ['C50.5', 'Malignant neoplasm of lower-outer quadrant of breast', 'มะเร็งเต้านม'],
  ['C50.6', 'Malignant neoplasm of axillary tail of breast', 'มะเร็งเต้านม'],
  ['C50.8', 'Malignant neoplasm of overlapping lesion of breast', 'มะเร็งเต้านม'],
  ['C50.9', 'Malignant neoplasm of breast, unspecified', 'มะเร็งเต้านม'],
  ['D05.0', 'Lobular carcinoma in situ of breast', 'มะเร็งเต้านมระยะก่อนลุกลาม LCIS'],
  ['D05.1', 'Intraductal carcinoma in situ of breast', 'มะเร็งเต้านมระยะก่อนลุกลาม DCIS'],

  // ---- นรีเวช ----
  ['C51.9', 'Malignant neoplasm of vulva, unspecified', 'มะเร็งปากช่องคลอด'],
  ['C52', 'Malignant neoplasm of vagina', 'มะเร็งช่องคลอด'],
  ['C53.0', 'Malignant neoplasm of endocervix', 'มะเร็งปากมดลูก'],
  ['C53.1', 'Malignant neoplasm of exocervix', 'มะเร็งปากมดลูก'],
  ['C53.8', 'Malignant neoplasm of overlapping lesion of cervix uteri', 'มะเร็งปากมดลูก'],
  ['C53.9', 'Malignant neoplasm of cervix uteri, unspecified', 'มะเร็งปากมดลูก'],
  ['C54.1', 'Malignant neoplasm of endometrium', 'มะเร็งเยื่อบุโพรงมดลูก'],
  ['C54.9', 'Malignant neoplasm of corpus uteri, unspecified', 'มะเร็งตัวมดลูก'],
  ['C55', 'Malignant neoplasm of uterus, part unspecified', 'มะเร็งมดลูก'],
  ['C56', 'Malignant neoplasm of ovary', 'มะเร็งรังไข่'],
  ['C58', 'Malignant neoplasm of placenta', 'มะเร็งรก'],
  ['D06.9', 'Carcinoma in situ of cervix, unspecified', 'มะเร็งปากมดลูกระยะก่อนลุกลาม'],

  // ---- ทางเดินปัสสาวะและอวัยวะสืบพันธุ์ชาย ----
  ['C60.9', 'Malignant neoplasm of penis, unspecified', 'มะเร็งองคชาต'],
  ['C61', 'Malignant neoplasm of prostate', 'มะเร็งต่อมลูกหมาก'],
  ['C62.9', 'Malignant neoplasm of testis, unspecified', 'มะเร็งอัณฑะ'],
  ['C64', 'Malignant neoplasm of kidney, except renal pelvis', 'มะเร็งไต'],
  ['C65', 'Malignant neoplasm of renal pelvis', 'มะเร็งกรวยไต'],
  ['C66', 'Malignant neoplasm of ureter', 'มะเร็งท่อไต'],
  ['C67.9', 'Malignant neoplasm of bladder, unspecified', 'มะเร็งกระเพาะปัสสาวะ'],

  // ---- ระบบประสาท ตา ต่อมไร้ท่อ ----
  ['C69.2', 'Malignant neoplasm of retina', 'มะเร็งจอประสาทตา'],
  ['C69.6', 'Malignant neoplasm of orbit', 'มะเร็งเบ้าตา'],
  ['C70.0', 'Malignant neoplasm of cerebral meninges', 'มะเร็งเยื่อหุ้มสมอง'],
  ['C71.0', 'Malignant neoplasm of cerebrum, except lobes and ventricles', 'มะเร็งสมอง'],
  ['C71.1', 'Malignant neoplasm of frontal lobe', 'มะเร็งสมอง'],
  ['C71.2', 'Malignant neoplasm of temporal lobe', 'มะเร็งสมอง'],
  ['C71.3', 'Malignant neoplasm of parietal lobe', 'มะเร็งสมอง'],
  ['C71.4', 'Malignant neoplasm of occipital lobe', 'มะเร็งสมอง'],
  ['C71.5', 'Malignant neoplasm of cerebral ventricle', 'มะเร็งสมอง'],
  ['C71.6', 'Malignant neoplasm of cerebellum', 'มะเร็งสมองน้อย'],
  ['C71.7', 'Malignant neoplasm of brain stem', 'มะเร็งก้านสมอง'],
  ['C71.8', 'Malignant neoplasm of overlapping lesion of brain', 'มะเร็งสมอง'],
  ['C71.9', 'Malignant neoplasm of brain, unspecified', 'มะเร็งสมอง'],
  ['C72.0', 'Malignant neoplasm of spinal cord', 'มะเร็งไขสันหลัง'],
  ['C74.9', 'Malignant neoplasm of adrenal gland, unspecified', 'มะเร็งต่อมหมวกไต'],
  ['C75.1', 'Malignant neoplasm of pituitary gland', 'มะเร็งต่อมใต้สมอง'],

  // ---- กระดูก ผิวหนัง เนื้อเยื่ออ่อน ----
  ['C40.9', 'Malignant neoplasm of bone and articular cartilage of limb, unspecified', 'มะเร็งกระดูก'],
  ['C41.9', 'Malignant neoplasm of bone and articular cartilage, unspecified', 'มะเร็งกระดูก'],
  ['C43.9', 'Malignant melanoma of skin, unspecified', 'มะเร็งผิวหนังเมลาโนมา'],
  ['C44.3', 'Other malignant neoplasm of skin of other and unspecified parts of face', 'มะเร็งผิวหนังใบหน้า'],
  ['C44.9', 'Malignant neoplasm of skin, unspecified', 'มะเร็งผิวหนัง'],
  ['C46.0', 'Kaposi sarcoma of skin', 'คาโปซีซาร์โคมา'],
  ['C49.9', 'Malignant neoplasm of connective and soft tissue, unspecified', 'มะเร็งเนื้อเยื่ออ่อน ซาร์โคมา'],

  // ---- มะเร็งแพร่กระจาย ----
  ['C77.0', 'Secondary malignant neoplasm of lymph nodes of head, face and neck', 'มะเร็งแพร่กระจายต่อมน้ำเหลืองที่คอ'],
  ['C77.1', 'Secondary malignant neoplasm of intrathoracic lymph nodes', 'มะเร็งแพร่กระจายต่อมน้ำเหลือง'],
  ['C77.2', 'Secondary malignant neoplasm of intra-abdominal lymph nodes', 'มะเร็งแพร่กระจายต่อมน้ำเหลือง'],
  ['C77.3', 'Secondary malignant neoplasm of axillary and upper limb lymph nodes', 'มะเร็งแพร่กระจายต่อมน้ำเหลืองรักแร้'],
  ['C77.4', 'Secondary malignant neoplasm of inguinal and lower limb lymph nodes', 'มะเร็งแพร่กระจายต่อมน้ำเหลืองขาหนีบ'],
  ['C77.5', 'Secondary malignant neoplasm of intrapelvic lymph nodes', 'มะเร็งแพร่กระจายต่อมน้ำเหลือง'],
  ['C77.9', 'Secondary malignant neoplasm of lymph node, unspecified', 'มะเร็งแพร่กระจายต่อมน้ำเหลือง'],
  ['C78.0', 'Secondary malignant neoplasm of lung', 'มะเร็งแพร่กระจายไปปอด'],
  ['C78.1', 'Secondary malignant neoplasm of mediastinum', 'มะเร็งแพร่กระจาย'],
  ['C78.7', 'Secondary malignant neoplasm of liver and intrahepatic bile duct', 'มะเร็งแพร่กระจายไปตับ'],
  ['C79.2', 'Secondary malignant neoplasm of skin', 'มะเร็งแพร่กระจายไปผิวหนัง'],
  ['C79.3', 'Secondary malignant neoplasm of brain and cerebral meninges', 'มะเร็งแพร่กระจายไปสมอง'],
  ['C79.4', 'Secondary malignant neoplasm of other and unspecified parts of nervous system', 'มะเร็งแพร่กระจายไปไขสันหลัง'],
  ['C79.5', 'Secondary malignant neoplasm of bone and bone marrow', 'มะเร็งแพร่กระจายไปกระดูก'],
  ['C79.7', 'Secondary malignant neoplasm of adrenal gland', 'มะเร็งแพร่กระจายไปต่อมหมวกไต'],
  ['C79.8', 'Secondary malignant neoplasm of other specified sites', 'มะเร็งแพร่กระจาย'],
  ['C80.0', 'Malignant neoplasm, primary site unknown, so stated', 'มะเร็งไม่ทราบตำแหน่งต้นกำเนิด'],
  ['C80.9', 'Malignant neoplasm, primary site unspecified', 'มะเร็งไม่ระบุตำแหน่ง'],

  // ---- มะเร็งระบบเลือดและต่อมน้ำเหลือง ----
  ['C81.9', 'Hodgkin lymphoma, unspecified', 'มะเร็งต่อมน้ำเหลืองฮอดจ์กิน'],
  ['C82.9', 'Follicular lymphoma, unspecified', 'มะเร็งต่อมน้ำเหลือง'],
  ['C83.3', 'Diffuse large B-cell lymphoma', 'มะเร็งต่อมน้ำเหลือง DLBCL'],
  ['C84.9', 'Mature T/NK-cell lymphoma, unspecified', 'มะเร็งต่อมน้ำเหลือง'],
  ['C85.9', 'Non-Hodgkin lymphoma, unspecified', 'มะเร็งต่อมน้ำเหลืองนอนฮอดจ์กิน'],
  ['C86.0', 'Extranodal NK/T-cell lymphoma, nasal type', 'มะเร็งต่อมน้ำเหลือง NK/T'],
  ['C90.0', 'Multiple myeloma', 'มะเร็งไขกระดูก มัยอีโลมา'],
  ['C90.2', 'Extramedullary plasmacytoma', 'พลาสมาไซโตมา'],
  ['C90.3', 'Solitary plasmacytoma', 'พลาสมาไซโตมา'],
  ['C91.0', 'Acute lymphoblastic leukaemia', 'มะเร็งเม็ดเลือดขาว ALL'],
  ['C92.0', 'Acute myeloblastic leukaemia', 'มะเร็งเม็ดเลือดขาว AML'],
  ['C95.9', 'Leukaemia, unspecified', 'มะเร็งเม็ดเลือดขาว'],

  // ---- เนื้องอกไม่ร้าย / ไม่ทราบพฤติกรรม และโรคอื่นที่ฉายรังสี ----
  ['D32.0', 'Benign neoplasm of cerebral meninges', 'เนื้องอกเยื่อหุ้มสมอง meningioma'],
  ['D32.1', 'Benign neoplasm of spinal meninges', 'เนื้องอกเยื่อหุ้มไขสันหลัง'],
  ['D33.3', 'Benign neoplasm of cranial nerves', 'เนื้องอกเส้นประสาทสมอง acoustic neuroma'],
  ['D35.2', 'Benign neoplasm of pituitary gland', 'เนื้องอกต่อมใต้สมอง'],
  ['D35.3', 'Benign neoplasm of craniopharyngeal duct', 'เนื้องอก craniopharyngioma'],
  ['D43.2', 'Neoplasm of uncertain or unknown behaviour of brain, unspecified', 'เนื้องอกสมอง'],
  ['Q28.2', 'Arteriovenous malformation of cerebral vessels', 'หลอดเลือดสมองผิดปกติ AVM'],
  ['G50.0', 'Trigeminal neuralgia', 'ปวดเส้นประสาทใบหน้า'],
  ['L91.0', 'Hypertrophic scar', 'แผลเป็นนูน คีลอยด์ keloid'],
  ['Z51.0', 'Radiotherapy session', 'มารับการฉายรังสี'],
];

const ICD9_RT = [
  ['92.21', 'Superficial radiation'],
  ['92.22', 'Orthovoltage radiation'],
  ['92.23', 'Radioisotopic teleradiotherapy'],
  ['92.24', 'Teleradiotherapy using photons'],
  ['92.25', 'Teleradiotherapy using electrons'],
  ['92.26', 'Teleradiotherapy of other particulate radiation'],
  ['92.27', 'Implantation or insertion of radioactive elements'],
  ['92.28', 'Injection or instillation of radioisotopes'],
  ['92.29', 'Other radiotherapeutic procedure'],
  ['92.30', 'Stereotactic radiosurgery, not otherwise specified'],
  ['92.31', 'Single source photon radiosurgery'],
  ['92.32', 'Multi-source photon radiosurgery'],
  ['92.33', 'Particulate radiosurgery'],
  ['92.39', 'Stereotactic radiosurgery, not elsewhere classified'],
  ['92.41', 'Intra-operative electron radiation therapy'],
];

// รหัสหัตถการที่เลือกให้อัตโนมัติตามเทคนิคการฉาย (แก้ไขได้ในฟอร์ม)
const ICD9_BY_TECHNIQUE = {
  '2D': '92.24', '3DCRT': '92.24', IMRT: '92.24', VMAT: '92.24', TBI: '92.24',
  ELECTRON: '92.25', SRS: '92.31', SRT: '92.31', SBRT: '92.31',
};

// ตำแหน่งที่ฉายที่ใช้บ่อย — เลือกได้หลายตำแหน่ง และพิมพ์ตำแหน่งอื่นเพิ่มเองได้
// เก็บเป็นข้อความเดียวคั่นด้วย ", " (เช่น "Breast (Lt), Supraclavicular (Lt)")
const TREATMENT_SITES = [
  'Whole brain', 'Brain (partial)', 'Head and neck', 'Nasopharynx', 'Oral cavity', 'Larynx', 'Neck nodes', 'Thyroid bed',
  'Esophagus', 'Lung', 'Mediastinum', 'Breast (Lt)', 'Breast (Rt)', 'Chest wall (Lt)', 'Chest wall (Rt)',
  'Supraclavicular (Lt)', 'Supraclavicular (Rt)', 'Axilla (Lt)', 'Axilla (Rt)', 'Internal mammary nodes',
  'Abdomen', 'Liver', 'Pancreas', 'Stomach', 'Whole pelvis', 'Para-aortic', 'Inguinal nodes', 'Cervix', 'Vaginal cuff',
  'Prostate', 'Prostate bed', 'Seminal vesicles', 'Rectum', 'Bladder', 'C-spine', 'T-spine', 'L-spine', 'Sacrum',
  'Pelvic bone', 'Femur', 'Rib', 'Bone (palliative)', 'Skin', 'Whole body (TBI)',
];

const SITE_SEP = ', ';

function parseSites(text) {
  return String(text || '')
    .split(/\s*,\s*/)
    .map((x) => x.trim())
    .filter((x, i, arr) => x && arr.indexOf(x) === i);
}

// ค้นหา ICD-10 จากรหัส ชื่อภาษาอังกฤษ หรือคำภาษาไทย
function searchIcd10(query, limit = 30) {
  const q = query.trim().toLowerCase();
  if (!q) return ICD10.slice(0, limit);
  const words = q.split(/\s+/);
  const scored = [];
  for (const row of ICD10) {
    const [code, en, th = ''] = row;
    const hay = `${code} ${en} ${th}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) continue;
    const c = code.toLowerCase();
    scored.push([c === q ? 0 : c.startsWith(q) ? 1 : 2, row]);
  }
  return scored
    .sort((a, b) => a[0] - b[0])
    .slice(0, limit)
    .map((x) => x[1]);
}

function icd10Label(code) {
  const row = ICD10.find((r) => r[0] === code);
  return row ? `${row[0]} ${row[1]}` : code;
}
