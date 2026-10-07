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
const MAX_BODY = 64 * 1024;

const TECHNIQUES = ['DIBH', 'SRS', 'SRT', 'SBRT', 'อื่นๆ'];

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

// Returns { booking } on success or { error } with a Thai message.
function validate(input) {
  if (!input || typeof input !== 'object') return { error: 'ข้อมูลไม่ถูกต้อง' };

  const b = {
    hn: text(input.hn, 20),
    name: text(input.name, 120),
    technique: text(input.technique, 20),
    techniqueOther: text(input.techniqueOther, 60),
    site: text(input.site, 120),
    startDate: text(input.startDate, 10),
    time: text(input.time, 5),
    fractions: input.fractions === '' || input.fractions == null ? null : Number(input.fractions),
    cbct: input.cbct,
    physician: text(input.physician, 120),
    note: text(input.note, 1000),
  };

  if (!b.hn) return { error: 'กรุณากรอก HN' };
  if (!b.name) return { error: 'กรุณากรอกชื่อ-สกุลผู้ป่วย' };
  if (!TECHNIQUES.includes(b.technique)) return { error: 'กรุณาเลือกเทคนิค' };
  if (b.technique === 'อื่นๆ' && !b.techniqueOther) return { error: 'กรุณาระบุเทคนิคอื่นๆ' };
  if (b.technique !== 'อื่นๆ') b.techniqueOther = '';
  if (!isValidDate(b.startDate)) return { error: 'กรุณาระบุวันเริ่มฉายรังสีให้ถูกต้อง' };
  if (b.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time)) return { error: 'เวลาไม่ถูกต้อง' };
  if (b.fractions !== null && !(Number.isInteger(b.fractions) && b.fractions >= 1 && b.fractions <= 100)) {
    return { error: 'จำนวนครั้งต้องเป็นจำนวนเต็ม 1–100' };
  }
  if (typeof b.cbct !== 'boolean') return { error: 'กรุณาระบุ CBCT (ทำ / ไม่ทำ)' };

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
