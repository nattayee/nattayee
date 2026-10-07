'use strict';

// ระบบนัดคิวเทคนิคพิเศษ กลุ่มงานรังสีรักษา โรงพยาบาลมะเร็งลำปาง
// Zero-dependency server: serves the web UI and stores bookings in a JSON file.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'bookings.json');
const INDEX_FILE = path.join(__dirname, 'public', 'index.html');
// ถ้าต้องการแก้วันหยุด ให้คัดลอก holidays.json ไปไว้ใน DATA_DIR แล้วแก้ไฟล์นั้น
const HOLIDAY_FILES = [path.join(DATA_DIR, 'holidays.json'), path.join(__dirname, 'holidays.json')];
const MAX_BODY = 64 * 1024;

const TECHNIQUES = ['DIBH', 'SRS', 'SRT', 'SBRT', 'อื่นๆ'];
const CBCT_PATTERNS = ['first3_weekly', 'weekly', 'daily', 'first', 'none', 'custom'];
const MAX_FRACTIONS = 100;
const PHYSICIANS = JSON.parse(fs.readFileSync(path.join(__dirname, 'physicians.json'), 'utf8'));
const SITES = JSON.parse(fs.readFileSync(path.join(__dirname, 'sites.json'), 'utf8'));

function loadBookings() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function saveBookings(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function loadHolidays() {
  for (const file of HOLIDAY_FILES) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  return [];
}

function text(value, max) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, max);
}

function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Returns a list of valid YYYY-MM-DD strings, or null if the value is malformed.
function dateList(value, max) {
  if (value === undefined || value === null || value === '') return [];
  if (!Array.isArray(value) || value.length > max) return null;
  return value.every((d) => typeof d === 'string' && isValidDate(d)) ? value.slice() : null;
}

// Returns { booking } on success or { error } with a Thai message.
function validate(input) {
  if (!input || typeof input !== 'object') return { error: 'ข้อมูลไม่ถูกต้อง' };

  const b = {
    hn: text(input.hn, 20),
    name: text(input.name, 120),
    technique: text(input.technique, 20),
    techniqueOther: text(input.techniqueOther, 60),
    site: text(input.site, 120),
    fractions: input.fractions === '' || input.fractions == null ? null : Number(input.fractions),
    physician: text(input.physician, 120),
    startDate: '',
    endDate: '',
    time: text(input.time, 5),
    duration: input.duration === '' || input.duration == null ? 15 : Number(input.duration),
    treatmentDates: dateList(input.treatmentDates, MAX_FRACTIONS),
    cbctPattern: text(input.cbctPattern, 20) || 'none',
    cbctDates: dateList(input.cbctDates, MAX_FRACTIONS),
    skipDates: dateList(input.skipDates, 366),
    verifyDate: text(input.verifyDate, 10),
    verifyTime: text(input.verifyTime, 5),
    cbct: false,
    note: text(input.note, 1000),
  };
  const isTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

  if (!b.hn) return { error: 'กรุณากรอก HN' };
  if (!b.name) return { error: 'กรุณากรอกชื่อ-สกุลผู้ป่วย' };
  if (!TECHNIQUES.includes(b.technique)) return { error: 'กรุณาเลือกเทคนิค' };
  if (b.technique === 'อื่นๆ' && !b.techniqueOther) return { error: 'กรุณาระบุเทคนิคอื่นๆ' };
  if (b.technique !== 'อื่นๆ') b.techniqueOther = '';
  if (!(Number.isInteger(b.fractions) && b.fractions >= 1 && b.fractions <= MAX_FRACTIONS)) {
    return { error: 'จำนวนครั้ง (Fx) ต้องเป็นจำนวนเต็ม 1–100' };
  }
  if (b.site && !SITES.includes(b.site)) return { error: 'กรุณาเลือกตำแหน่งที่ฉายจากรายการ' };
  if (!PHYSICIANS.includes(b.physician)) return { error: 'กรุณาเลือกแพทย์ผู้สั่ง' };
  const dates = b.treatmentDates;
  if (!dates || dates.length === 0) return { error: 'กรุณาระบุวันเริ่มฉายรังสีและตารางวันฉาย' };
  if (dates.length !== b.fractions) return { error: 'จำนวนวันฉายไม่ตรงกับจำนวนครั้ง (Fx)' };
  if (dates.some((d, i) => i > 0 && d <= dates[i - 1])) return { error: 'ตารางวันฉายต้องเรียงตามวันที่และไม่ซ้ำกัน' };
  if (b.time && !isTime(b.time)) return { error: 'เวลานัดไม่ถูกต้อง' };
  if (!(Number.isInteger(b.duration) && b.duration >= 5 && b.duration <= 240)) return { error: 'ระยะเวลาต่อครั้งต้องอยู่ระหว่าง 5–240 นาที' };
  if (!CBCT_PATTERNS.includes(b.cbctPattern)) return { error: 'รูปแบบ CBCT ไม่ถูกต้อง' };
  if (!b.cbctDates || !b.cbctDates.every((d) => dates.includes(d))) return { error: 'วันทำ CBCT ต้องเป็นวันฉาย' };
  if (!b.skipDates) return { error: 'วันงดฉายไม่ถูกต้อง' };
  if (b.verifyDate && !isValidDate(b.verifyDate)) return { error: 'วันนัดทำ CBCT ไม่ถูกต้อง' };
  if (b.verifyTime && !isTime(b.verifyTime)) return { error: 'เวลานัดทำ CBCT ไม่ถูกต้อง' };
  if (b.verifyTime && !b.verifyDate) return { error: 'กรุณาระบุวันนัดทำ CBCT' };

  b.cbctDates = [...new Set(b.cbctDates)].sort();
  b.skipDates = [...new Set(b.skipDates)].sort();
  b.startDate = dates[0];
  b.endDate = dates[dates.length - 1];
  b.cbct = b.cbctDates.length > 0 || Boolean(b.verifyDate);
  return { booking: b };
}

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('ข้อมูลมีขนาดใหญ่เกินไป'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('รูปแบบ JSON ไม่ถูกต้อง'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

async function handleApi(req, res, pathname) {
  if (pathname === '/api/holidays' && req.method === 'GET') return send(res, 200, loadHolidays());

  const match = pathname.match(/^\/api\/bookings(?:\/([\w-]+))?\/?$/);
  if (!match) return send(res, 404, { error: 'ไม่พบ' });
  const id = match[1];

  if (!id && req.method === 'GET') {
    return send(res, 200, loadBookings());
  }

  if (!id && req.method === 'POST') {
    const { booking, error } = validate(await readJson(req));
    if (error) return send(res, 400, { error });
    const now = new Date().toISOString();
    const record = { id: crypto.randomUUID(), ...booking, createdAt: now, updatedAt: now };
    const list = loadBookings();
    list.push(record);
    saveBookings(list);
    return send(res, 201, record);
  }

  if (id && req.method === 'PUT') {
    const { booking, error } = validate(await readJson(req));
    if (error) return send(res, 400, { error });
    const list = loadBookings();
    const idx = list.findIndex((b) => b.id === id);
    if (idx === -1) return send(res, 404, { error: 'ไม่พบรายการนัด' });
    list[idx] = { ...list[idx], ...booking, updatedAt: new Date().toISOString() };
    saveBookings(list);
    return send(res, 200, list[idx]);
  }

  if (id && req.method === 'DELETE') {
    const list = loadBookings();
    const next = list.filter((b) => b.id !== id);
    if (next.length === list.length) return send(res, 404, { error: 'ไม่พบรายการนัด' });
    saveBookings(next);
    return send(res, 204, '');
  }

  return send(res, 405, { error: 'Method not allowed' });
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      return send(res, 200, fs.readFileSync(INDEX_FILE));
    }
    return send(res, 404, { error: 'ไม่พบ' });
  } catch (err) {
    if (!res.headersSent) send(res, err.status || 500, { error: err.status ? err.message : 'เกิดข้อผิดพลาดภายในระบบ' });
    if (!err.status) console.error(err);
  }
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`ระบบนัดคิวเทคนิคพิเศษ พร้อมใช้งานที่ http://localhost:${PORT}`);
    console.log(`ไฟล์ข้อมูล: ${DATA_FILE}`);
  });
}

module.exports = { server, validate };
