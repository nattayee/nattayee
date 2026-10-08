'use strict';
// แปลงชีตจากไฟล์ Excel ทะเบียนหนังสือส่ง (ชีตละ 1 ปี พ.ศ.) ให้เป็นรายการในระบบ

const FIELDS = ['no', 'ref', 'date', 'from', 'to', 'subject', 'action', 'note'];

// หัวคอลัมน์ตามไฟล์ต้นฉบับ (ถ้าหาไม่เจอจะใช้ลำดับคอลัมน์ A–H แทน)
const HEADERS = {
  no: ['เลขทะเบียนส่ง', 'เลขทะเบียน', 'ลำดับ', 'เลขที่'],
  ref: ['ที่'],
  date: ['ลงวันที่', 'วันที่'],
  from: ['จาก'],
  to: ['ถึง'],
  subject: ['เรื่อง'],
  action: ['การปฏิบัติ'],
  note: ['หมายเหตุ'],
};

// อักขระไทยในพื้นที่ Private Use จากฟอนต์รุ่นเก่า (เช่น "ขอมูล") → อักขระมาตรฐาน
const THAI_PUA = {
  0xf700: 0x0e10, 0xf701: 0x0e34, 0xf702: 0x0e35, 0xf703: 0x0e36, 0xf704: 0x0e37,
  0xf705: 0x0e48, 0xf706: 0x0e49, 0xf707: 0x0e4a, 0xf708: 0x0e4b, 0xf709: 0x0e4c,
  0xf70a: 0x0e48, 0xf70b: 0x0e49, 0xf70c: 0x0e4a, 0xf70d: 0x0e4b, 0xf70e: 0x0e4c,
  0xf70f: 0x0e0d, 0xf710: 0x0e31, 0xf711: 0x0e4d, 0xf712: 0x0e47, 0xf713: 0x0e48,
  0xf714: 0x0e49, 0xf715: 0x0e4a, 0xf716: 0x0e4b, 0xf717: 0x0e4c, 0xf718: 0x0e38,
  0xf719: 0x0e39, 0xf71a: 0x0e3a,
};

function cleanText(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return '';
  if (typeof value === 'object') return '';
  return String(value)
    .replace(/[-]/g, ch => String.fromCharCode(THAI_PUA[ch.charCodeAt(0)]))
    .replace(/\s+/g, ' ')
    .trim();
}

function isoDate(ceYear, month, day) {
  if (!(month >= 1 && month <= 12 && day >= 1)) return null;
  const last = new Date(Date.UTC(ceYear, month, 0)).getUTCDate();
  if (day > last) return null;
  return `${String(ceYear).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** ปี 4 หลัก: มากกว่า 2400 ถือเป็น พ.ศ. นอกนั้นเป็น ค.ศ. → คืนค่าเป็น ค.ศ. */
function toCE(year) {
  return year > 2400 ? year - 543 : year;
}

/**
 * แปลงค่าวันที่จากเซลล์ → 'YYYY-MM-DD' (ค.ศ.) หรือ null ถ้าอ่านไม่ได้
 * - เซลล์วันที่ของ Excel ใช้วัน/เดือนตามที่เก็บไว้ ปีที่พิมพ์เป็น พ.ศ. จะถูกแปลงเป็น ค.ศ.
 * - ข้อความ เช่น "19/3/2025", "13/8-69", "5/25/2569" อ่านเป็น วัน/เดือน/ปี
 *   ยกเว้นตัวที่สองเกิน 12 จะสลับเป็น เดือน/วัน/ปี
 */
function parseDate(value, yearBE) {
  if (value && typeof value === 'object' && 'y' in value) return isoDate(toCE(value.y), value.m, value.d);
  if (typeof value !== 'string') return null;

  const s = value.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return isoDate(toCE(+m[1]), +m[2], +m[3]);

  m = /^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2}|\d{4})$/.exec(s);
  if (!m) return null;
  let day = +m[1];
  let month = +m[2];
  if (month > 12 && day <= 12) [day, month] = [month, day];

  let year;
  if (m[3].length === 4) {
    year = toCE(+m[3]);
  } else {
    // ปี 2 หลัก: เลือกระหว่าง พ.ศ. 25xx กับ ค.ศ. 20xx ให้ใกล้ปีของชีตที่สุด
    const yy = +m[3];
    const asBE = 2500 + yy - 543;
    const asCE = 2000 + yy;
    const target = yearBE ? yearBE - 543 : null;
    year = target === null
      ? (yy >= 40 ? asBE : asCE)
      : (Math.abs(asBE - target) <= Math.abs(asCE - target) ? asBE : asCE);
  }
  return isoDate(year, month, day);
}

function parseNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string' && /^\s*\d+\s*$/.test(value)) return Number(value);
  return null;
}

function findHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const cells = (rows[r] || []).map(cleanText);
    if (!cells.includes('เรื่อง')) continue;
    const cols = {};
    for (const field of FIELDS) {
      const idx = cells.findIndex(c => HEADERS[field].includes(c));
      if (idx >= 0) cols[field] = idx;
    }
    return { row: r, cols: { ...defaultCols(), ...cols } };
  }
  return { row: -1, cols: defaultCols() };
}

function defaultCols() {
  return Object.fromEntries(FIELDS.map((f, i) => [f, i]));
}

function sheetYear(name) {
  const m = /(25\d\d)/.exec(name || '');
  return m ? Number(m[1]) : null;
}

/** ค่าเริ่มต้นของเลขถัดไป: เลขแรกที่ยังว่าง นับจากเลขน้อยสุดของปีนั้น */
function firstFreeNumber(numbers) {
  if (!numbers.length) return 1;
  const used = new Set(numbers);
  let n = Math.min(...numbers);
  while (used.has(n)) n++;
  return n;
}

/**
 * แปลงสมุดงาน (ผลจาก readXlsx) → { years: { [พ.ศ.]: records[] }, warnings: [] }
 * - แถวที่มีแต่เลขลำดับ (เตรียมไว้ล่วงหน้า) จะถูกข้าม
 * - แถวที่ไม่มีเลขและมีแต่ข้อความเรื่อง/หมายเหตุ ถือเป็นบรรทัดต่อของรายการก่อนหน้า
 */
function importWorkbook(sheets) {
  const years = {};
  const warnings = [];

  for (const sheet of sheets) {
    const year = sheetYear(sheet.name);
    if (!year) {
      warnings.push(`ข้ามชีต "${sheet.name}" เพราะชื่อชีตไม่ใช่ปี พ.ศ.`);
      continue;
    }
    if (years[year]) {
      warnings.push(`ชีต "${sheet.name}" ซ้ำกับปี ${year} ที่มีอยู่แล้ว จึงข้ามไป`);
      continue;
    }
    const { row: headerRow, cols } = findHeader(sheet.rows);
    const records = [];
    const seen = new Map();
    let prev = null;

    for (let r = headerRow + 1; r < sheet.rows.length; r++) {
      const row = sheet.rows[r] || [];
      const get = f => row[cols[f]] ?? null;
      const rec = {
        year,
        no: parseNumber(get('no')),
        ref: cleanText(get('ref')),
        date: null,
        dateText: '',
        from: cleanText(get('from')),
        to: cleanText(get('to')),
        subject: cleanText(get('subject')),
        action: cleanText(get('action')),
        note: cleanText(get('note')),
      };
      const rawDate = get('date');
      if (rawDate !== null && rawDate !== '') {
        rec.date = parseDate(rawDate, year);
        if (!rec.date) rec.dateText = cleanText(rawDate);
      }

      const hasContent = rec.ref || rec.date || rec.dateText || rec.from || rec.to || rec.subject || rec.action || rec.note;
      if (!hasContent) continue;

      if (rec.no === null) {
        const continuation = !rec.ref && !rec.date && !rec.dateText && !rec.from && !rec.to && !rec.action;
        if (continuation && prev) {
          prev.subject = [prev.subject, rec.subject].filter(Boolean).join(' ');
          prev.note = [prev.note, rec.note].filter(Boolean).join(' ');
        } else {
          warnings.push(`ปี ${year} แถว ${r + 1}: ไม่มีเลขทะเบียนส่ง จึงข้ามไป`);
        }
        continue;
      }
      if (seen.has(rec.no)) {
        warnings.push(`ปี ${year} แถว ${r + 1}: เลข ${rec.no} ซ้ำกับแถว ${seen.get(rec.no)} จึงข้ามไป`);
        continue;
      }
      if (rec.dateText) warnings.push(`ปี ${year} เลข ${rec.no}: อ่านวันที่ "${rec.dateText}" ไม่ได้ เก็บไว้เป็นข้อความ`);
      seen.set(rec.no, r + 1);
      records.push(rec);
      prev = rec;
    }
    years[year] = records;
  }
  return { years, warnings };
}

module.exports = { importWorkbook, parseDate, cleanText, firstFreeNumber, isoDate, toCE };
