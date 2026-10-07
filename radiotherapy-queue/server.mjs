// เซิร์ฟเวอร์ระบบนัดคิวฉายรังสี — ไม่ต้องติดตั้ง dependency เพิ่ม (ใช้ Node.js 18+)
// เก็บข้อมูลเป็นไฟล์ JSON ที่ data/db.json
import http from 'node:http';
import { readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOMS, TECHNIQUES, CBCT_MODES, STATUSES, defaultSettings } from './public/js/schedule.js';
import { composeName } from './public/js/icd.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const DB_FILE = process.env.DB_FILE || path.join(ROOT, 'data', 'db.json');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ---------- ฐานข้อมูลไฟล์ JSON ----------

let db = null;
let writeQueue = Promise.resolve();

async function loadDb() {
  try {
    db = JSON.parse(await readFile(DB_FILE, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    db = { appointments: [], settings: defaultSettings() };
  }
  db.appointments ||= [];
  db.settings = { ...defaultSettings(), ...(db.settings || {}) };
}

function saveDb() {
  // เขียนลงไฟล์ชั่วคราวแล้ว rename เพื่อไม่ให้ไฟล์เสียหากเครื่องดับระหว่างเขียน
  writeQueue = writeQueue.then(async () => {
    await mkdir(path.dirname(DB_FILE), { recursive: true });
    const tmp = `${DB_FILE}.tmp`;
    await writeFile(tmp, JSON.stringify(db, null, 2));
    await rename(tmp, DB_FILE);
  });
  return writeQueue;
}

// ---------- ตรวจสอบข้อมูล ----------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ids = (list) => new Set(list.map((x) => x.id));
const ROOM_IDS = ids(ROOMS);
const TECH_IDS = ids(TECHNIQUES);
const CBCT_IDS = ids(CBCT_MODES);
const STATUS_IDS = ids(STATUSES);

function str(v, max = 500) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function validateAppointment(input) {
  const errors = [];
  const a = {
    hn: str(input.hn, 30),
    prefix: str(input.prefix, 40),
    firstName: str(input.firstName, 100),
    lastName: str(input.lastName, 100),
    name: str(input.name, 200),
    age: input.age === '' || input.age == null ? '' : Number(input.age),
    sex: str(input.sex, 10),
    phone: str(input.phone, 50),
    icd10: str(input.icd10, 10),
    diagnosis: str(input.diagnosis, 200),
    site: str(input.site, 500),
    icd9: str(input.icd9, 10),
    physician: str(input.physician, 100),
    technique: str(input.technique, 20),
    room: str(input.room, 5),
    simDate: str(input.simDate, 10),
    verifyDate: str(input.verifyDate, 10),
    verifyTime: str(input.verifyTime, 5),
    startDate: str(input.startDate, 10),
    fractions: Number(input.fractions),
    dosePerFx: str(input.dosePerFx, 20),
    time: str(input.time, 5),
    duration: Number(input.duration),
    cbctMode: str(input.cbctMode, 20) || 'fx1',
    cbctDates: Array.isArray(input.cbctDates) ? input.cbctDates.filter((d) => DATE_RE.test(d)) : [],
    skipDates: Array.isArray(input.skipDates) ? input.skipDates.filter((d) => DATE_RE.test(d)) : [],
    status: str(input.status, 20) || 'active',
    notes: str(input.notes, 2000),
  };
  if (a.firstName) a.name = composeName(a.prefix, a.firstName, a.lastName);
  if (!a.hn) errors.push('กรุณาระบุ HN');
  if (!a.name) errors.push('กรุณาระบุชื่อผู้ป่วย');
  if (!ROOM_IDS.has(a.room)) errors.push('ห้องฉายไม่ถูกต้อง');
  if (!TECH_IDS.has(a.technique)) errors.push('เทคนิคการฉายไม่ถูกต้อง');
  if (!CBCT_IDS.has(a.cbctMode)) errors.push('รูปแบบ CBCT ไม่ถูกต้อง');
  if (!STATUS_IDS.has(a.status)) errors.push('สถานะไม่ถูกต้อง');
  if (!DATE_RE.test(a.startDate)) errors.push('วันเริ่มฉายไม่ถูกต้อง');
  for (const k of ['simDate', 'verifyDate']) if (a[k] && !DATE_RE.test(a[k])) errors.push(`${k} ไม่ถูกต้อง`);
  if (!TIME_RE.test(a.time)) errors.push('เวลานัดไม่ถูกต้อง');
  if (a.verifyTime && !TIME_RE.test(a.verifyTime)) errors.push('เวลานัด CBCT ไม่ถูกต้อง');
  if (!Number.isInteger(a.fractions) || a.fractions < 1 || a.fractions > 60) errors.push('จำนวนครั้ง (Fx) ต้องอยู่ระหว่าง 1–60');
  if (!Number.isInteger(a.duration) || a.duration < 5 || a.duration > 240) errors.push('ระยะเวลาต่อครั้งต้องอยู่ระหว่าง 5–240 นาที');
  return { value: a, errors };
}

function validateSettings(input) {
  const s = defaultSettings();
  if (Array.isArray(input.workdays)) s.workdays = input.workdays.map(Number).filter((n) => n >= 0 && n <= 6);
  if (Array.isArray(input.holidays))
    s.holidays = input.holidays
      .filter((h) => h && DATE_RE.test(h.date))
      .map((h) => ({ date: h.date, name: str(h.name, 100) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  if (input.rooms)
    for (const r of ROOMS) {
      const v = input.rooms[r.id];
      if (v && TIME_RE.test(v.open) && TIME_RE.test(v.close)) s.rooms[r.id] = { open: v.open, close: v.close };
    }
  if (Array.isArray(input.physicians))
    s.physicians = [...new Set(input.physicians.map((p) => str(p, 100)).filter(Boolean))];
  const slot = Number(input.slotMinutes);
  if ([5, 10, 15, 20, 30].includes(slot)) s.slotMinutes = slot;
  return s;
}

// ---------- HTTP ----------

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 2_000_000) throw Object.assign(new Error('payload too large'), { status: 413 });
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('JSON ไม่ถูกต้อง'), { status: 400 });
  }
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', resource, id?]
  const [, resource, id] = parts;

  if (resource === 'state' && req.method === 'GET') {
    return send(res, 200, db);
  }

  // นำเข้าไฟล์สำรอง: แทนที่ข้อมูลทั้งหมด
  if (resource === 'state' && req.method === 'PUT') {
    const body = await readBody(req);
    if (!Array.isArray(body.appointments)) return send(res, 400, { errors: ['ไฟล์สำรองไม่ถูกต้อง'] });
    const appointments = [];
    for (const [i, raw] of body.appointments.entries()) {
      const { value, errors } = validateAppointment(raw || {});
      if (errors.length) return send(res, 400, { errors: [`รายการที่ ${i + 1}: ${errors.join(', ')}`] });
      const now = new Date().toISOString();
      appointments.push({
        id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 64) : randomUUID(),
        ...value,
        createdAt: str(raw.createdAt, 30) || now,
        updatedAt: str(raw.updatedAt, 30) || now,
      });
    }
    db = { appointments, settings: body.settings ? validateSettings(body.settings) : db.settings };
    await saveDb();
    return send(res, 200, db);
  }

  if (resource === 'settings' && req.method === 'PUT') {
    db.settings = validateSettings(await readBody(req));
    await saveDb();
    return send(res, 200, db.settings);
  }

  if (resource === 'appointments') {
    if (req.method === 'GET' && !id) return send(res, 200, db.appointments);

    if (req.method === 'POST' && !id) {
      const { value, errors } = validateAppointment(await readBody(req));
      if (errors.length) return send(res, 400, { errors });
      const now = new Date().toISOString();
      const appt = { id: randomUUID(), ...value, createdAt: now, updatedAt: now };
      db.appointments.push(appt);
      await saveDb();
      return send(res, 201, appt);
    }

    const idx = db.appointments.findIndex((a) => a.id === id);
    if (id && idx === -1) return send(res, 404, { errors: ['ไม่พบข้อมูลนัด'] });

    if (req.method === 'PUT' && id) {
      const { value, errors } = validateAppointment(await readBody(req));
      if (errors.length) return send(res, 400, { errors });
      const prev = db.appointments[idx];
      db.appointments[idx] = { ...prev, ...value, id: prev.id, updatedAt: new Date().toISOString() };
      await saveDb();
      return send(res, 200, db.appointments[idx]);
    }

    if (req.method === 'DELETE' && id) {
      db.appointments.splice(idx, 1);
      await saveDb();
      return send(res, 204, {});
    }
  }

  return send(res, 404, { errors: ['ไม่พบ API'] });
}

async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const st = await stat(file);
    if (!st.isFile()) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('ไม่พบไฟล์');
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else await serveStatic(req, res, url);
    } catch (err) {
      console.error(err);
      send(res, err.status || 500, { errors: [err.status ? err.message : 'เกิดข้อผิดพลาดภายในระบบ'] });
    }
  });
}

export async function start(port = PORT, host = HOST) {
  await loadDb();
  const server = createServer();
  await new Promise((resolve) => server.listen(port, host, resolve));
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = await start();
  const { port } = server.address();
  console.log(`ระบบนัดคิวฉายรังสี พร้อมใช้งานที่ http://localhost:${port}`);
}
