// ตรรกะการคำนวณตารางฉายรังสี (pure functions — ใช้ได้ทั้งฝั่งเบราว์เซอร์และ Node สำหรับทดสอบ)
// วันที่ทั้งหมดใช้รูปแบบ 'YYYY-MM-DD' และคำนวณแบบ UTC เพื่อเลี่ยงปัญหา timezone

export const ROOMS = [
  { id: 'L1', name: 'Infinity', label: 'L1 · Infinity' },
  { id: 'L2', name: 'Precise', label: 'L2 · Precise' },
  { id: 'L3', name: 'VersaHD', label: 'L3 · VersaHD' },
];

// ชนิดเทคนิคการฉาย พร้อมระยะเวลาต่อครั้ง (นาที) ที่ใช้เป็นค่าเริ่มต้น
export const TECHNIQUES = [
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
export const CBCT_MODES = [
  { id: 'fx1', name: 'เฉพาะครั้งแรก (Fx 1)' },
  { id: 'fx123_weekly', name: '3 ครั้งแรก แล้วสัปดาห์ละครั้ง' },
  { id: 'weekly', name: 'สัปดาห์ละครั้ง (Fx 1, 6, 11, …)' },
  { id: 'daily', name: 'ทุกครั้ง (Daily CBCT)' },
  { id: 'none', name: 'ไม่ทำ CBCT ระหว่างฉาย' },
  { id: 'custom', name: 'กำหนดวันเอง' },
];

export const STATUSES = [
  { id: 'active', name: 'ปกติ' },
  { id: 'hold', name: 'พักการฉาย' },
  { id: 'cancelled', name: 'ยกเลิก' },
];

// วันหยุดราชการไทยที่ตรงกับวันที่เดิมทุกปี (วันหยุดทางจันทรคติ/ชดเชย ให้เพิ่มเองในหน้าตั้งค่า)
export const FIXED_THAI_HOLIDAYS = [
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

export function defaultHolidays(years) {
  const out = [];
  for (const y of years) {
    for (const [md, name] of FIXED_THAI_HOLIDAYS) out.push({ date: `${y}-${md}`, name });
  }
  return out;
}

export const DEFAULT_PHYSICIANS = ['ทัศน์วรรณ อาษากิจ', 'ศิริรัตน์ เชื้อสำราญ', 'พัฒธิดา มโนรส', 'ทินกร จอมใจ'];

export function defaultSettings(today = todayISO()) {
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

export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

export function dayOfWeek(iso) {
  return parseISO(iso).getUTCDay();
}

export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function startOfWeek(iso) {
  // สัปดาห์เริ่มวันจันทร์
  const dow = dayOfWeek(iso);
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

export function isWorkday(iso, settings) {
  if (!settings.workdays.includes(dayOfWeek(iso))) return false;
  return !settings.holidays.some((h) => h.date === iso);
}

export function nextWorkday(iso, settings) {
  let d = iso;
  for (let i = 0; i < 60 && !isWorkday(d, settings); i++) d = addDays(d, 1);
  return d;
}

// ---------- เวลา ----------

export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export function overlaps(aStart, aDur, bStart, bDur) {
  const a = toMinutes(aStart);
  const b = toMinutes(bStart);
  return a < b + bDur && b < a + aDur;
}

// ---------- ตารางฉาย ----------

// สร้างรายการวันฉายตามจำนวน fraction โดยข้ามวันหยุดและวันที่ไม่ใช่วันทำการ
// skipDates: วันที่ผู้ป่วยงดฉายเฉพาะราย (เช่น เลื่อนนัด)
export function generateTreatmentDates(startDate, fractions, settings, skipDates = []) {
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
export function cbctFractions(mode, fractions) {
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

export function cbctDatesForMode(mode, treatmentDates) {
  return cbctFractions(mode, treatmentDates.length).map((fx) => treatmentDates[fx - 1]);
}

// รวมข้อมูลนัดหนึ่งรายให้เป็นรายการ session ต่อวัน
export function buildSessions(appt, settings) {
  const dates = generateTreatmentDates(appt.startDate, Number(appt.fractions), settings, appt.skipDates || []);
  const cbct =
    appt.cbctMode === 'custom' ? new Set(appt.cbctDates || []) : new Set(cbctDatesForMode(appt.cbctMode, dates));
  return dates.map((date, i) => ({ date, fx: i + 1, cbct: cbct.has(date) }));
}

// สถานะตามช่วงเวลา (คำนวณจากวันที่ ไม่ได้เก็บในฐานข้อมูล)
export function phaseOf(appt, sessions, today) {
  if (appt.status === 'cancelled') return 'cancelled';
  if (appt.status === 'hold') return 'hold';
  if (!sessions.length) return 'waiting';
  if (today < sessions[0].date) return 'waiting';
  if (today > sessions[sessions.length - 1].date) return 'completed';
  return 'treating';
}

export const PHASE_LABELS = {
  waiting: 'รอเริ่มฉาย',
  treating: 'กำลังฉาย',
  completed: 'ฉายครบ',
  hold: 'พักการฉาย',
  cancelled: 'ยกเลิก',
};

// เหตุการณ์ทั้งหมดของผู้ป่วยหนึ่งราย: วันฉายแต่ละครั้ง + วันนัด CBCT ก่อนฉาย (verification/dry run)
export function eventsOf(appt, settings) {
  const sessions = buildSessions(appt, settings);
  const events = sessions.map((s) => ({
    type: 'fx',
    date: s.date,
    fx: s.fx,
    total: sessions.length,
    cbct: s.cbct,
    start: s.fx === 1,
    time: appt.time || '', // ไม่บังคับระบุเวลานัด
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
      time: appt.verifyTime || appt.time || '',
      duration: Number(appt.verifyDuration || 20),
      room: appt.room,
      appt,
    });
  }
  return events;
}

export function isBlocking(appt) {
  return appt.status !== 'cancelled' && appt.status !== 'hold';
}

// รวมเหตุการณ์ทุกรายเป็น map ตามวันที่: { 'YYYY-MM-DD': [event, …] }
export function eventsByDate(appts, settings) {
  const map = new Map();
  for (const a of appts) {
    if (!isBlocking(a)) continue;
    for (const ev of eventsOf(a, settings)) {
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date).push(ev);
    }
  }
  for (const list of map.values()) list.sort(byTime);
  return map;
}

// เรียงตามเวลา — นัดที่ไม่ได้ระบุเวลาอยู่ท้ายสุด
export function byTime(x, y) {
  return (x.time ? 0 : 1) - (y.time ? 0 : 1) || x.time.localeCompare(y.time) || x.room.localeCompare(y.room);
}

// หาการนัดที่ซ้อนเวลากันในห้องเดียวกัน (นัดที่ไม่ได้ระบุเวลาไม่นับว่าชน)
export function findConflicts(appt, others, settings) {
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
        if (m.time && t.time && overlaps(m.time, m.duration, t.time, t.duration)) {
          conflicts.push({ date: m.date, time: t.time, duration: t.duration, with: o });
        }
      }
    }
  }
  return conflicts.sort((a, b) => a.date.localeCompare(b.date));
}

// แนะนำเวลาว่างแรกในห้องที่ไม่ชนกับใครตลอดทั้งคอร์ส
export function suggestTimes(appt, others, settings, limit = 5) {
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
export function utilization(events, roomSetting) {
  const open = toMinutes(roomSetting.close) - toMinutes(roomSetting.open);
  const used = events.reduce((s, e) => s + e.duration, 0);
  return open > 0 ? used / open : 0;
}
