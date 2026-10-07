// ชั้นจัดเก็บข้อมูล เลือกอัตโนมัติตามที่ที่หน้าเว็บถูกเปิด:
// 1) Google Apps Script (google.script.run) — เก็บใน Google Sheet
// 2) API ของเซิร์ฟเวอร์ (server.mjs)
// 3) ถ้าเรียกไม่ได้ เช่นวางบน static hosting จะเก็บในเบราว์เซอร์ (localStorage) — ข้อมูลไม่แชร์ระหว่างเครื่อง
import { defaultSettings } from './schedule.js';

const LS_KEY = 'rt-queue-db-v1';

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.errors || [`HTTP ${res.status}`]).join('\n'));
  return data;
}

class ServerStore {
  mode = 'server';
  async load() {
    return api('GET', 'api/state');
  }
  async create(appt) {
    return api('POST', 'api/appointments', appt);
  }
  async update(id, appt) {
    return api('PUT', `api/appointments/${encodeURIComponent(id)}`, appt);
  }
  async remove(id) {
    return api('DELETE', `api/appointments/${encodeURIComponent(id)}`);
  }
  async saveSettings(settings) {
    return api('PUT', 'api/settings', settings);
  }
  async importAll(data) {
    return api('PUT', 'api/state', data);
  }
}

// ข้อความผิดพลาดจาก Apps Script อาจมีคำนำหน้า ("Error: …", "Exception: …") และตำแหน่งโค้ดต่อท้าย ("(line 12, file "Code")") — ตัดออก
export function gasErrorMessage(err) {
  return String(err?.message || err || '')
    .replace(/^\s*(?:(?:Script)?Error|Exception|TypeError)\s*:\s*/i, '')
    .replace(/\s*\(line \d+, file "[^"]*"\)\s*$/i, '')
    .trim();
}

// เรียกฟังก์ชันฝั่ง Apps Script (apps-script/Code.gs) แบบ Promise
function gas(fn, ...args) {
  return new Promise((resolve, reject) =>
    google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler((err) => reject(new Error(gasErrorMessage(err))))
      [fn](...args),
  );
}

const TOKEN_KEY = 'rtq-token';

// ทุกคำสั่งส่ง token ของการเข้าสู่ระบบ (บัญชี LPCH RO Workspace) ไปด้วย
class GasStore {
  mode = 'gas';
  onExpired = null; // หน้าเว็บตั้งไว้ เพื่อแสดงหน้าเข้าสู่ระบบเมื่อหมดเวลา
  constructor() {
    try {
      this.token = localStorage.getItem(TOKEN_KEY) || '';
    } catch {
      this.token = '';
    }
  }
  setToken(token) {
    this.token = token || '';
    try {
      if (this.token) localStorage.setItem(TOKEN_KEY, this.token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* เบราว์เซอร์ไม่ให้เก็บ — ต้องเข้าสู่ระบบใหม่เมื่อเปิดหน้าใหม่ */
    }
  }
  async call(fn, ...args) {
    try {
      return await gas(fn, this.token, ...args);
    } catch (err) {
      if (!/session_expired/.test(err.message)) throw err;
      this.setToken('');
      this.onExpired?.();
      throw new Error('หมดเวลาการเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่แล้วทำรายการอีกครั้ง');
    }
  }
  /** ข้อมูลทั้งหมด หรือ null ถ้ายังไม่ได้เข้าสู่ระบบ */
  async loadOrNull() {
    try {
      const data = await gas('getState', this.token);
      return data && !data.needLogin ? data : null;
    } catch (err) {
      if (/session_expired/.test(err.message)) return null; // Code.gs รุ่นก่อน throw แทนการตอบ needLogin
      throw err;
    }
  }
  async login(username, password) {
    const res = await gas('login', username, password);
    this.setToken(res.token);
    return res.user;
  }
  async sso(ticket) {
    const res = await gas('ssoLogin', ticket);
    this.setToken(res.token);
    return res.user;
  }
  async logout() {
    const t = this.token;
    this.setToken('');
    await gas('logout', t).catch(() => {});
  }
  load() {
    return this.call('getState');
  }
  create(appt) {
    return this.call('createAppointment', appt);
  }
  update(id, appt) {
    return this.call('updateAppointment', id, appt);
  }
  remove(id) {
    return this.call('deleteAppointment', id);
  }
  saveSettings(settings) {
    return this.call('saveSettings', settings);
  }
  importAll(data) {
    return this.call('importAll', data);
  }
}

class LocalStore {
  mode = 'local';
  read() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ใช้ค่าเริ่มต้น */
    }
    return { appointments: [], settings: defaultSettings() };
  }
  write(db) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(db));
    } catch {
      /* เบราว์เซอร์ไม่อนุญาตให้บันทึก — ข้อมูลจะอยู่เฉพาะหน้านี้ */
    }
  }
  // คืนสำเนาเสมอ — ถ้าคืนอาร์เรย์ตัวเดียวกัน หน้าเว็บที่ push รายการใหม่เองจะทำให้ข้อมูลซ้ำ
  async load() {
    this.db = this.read();
    return structuredClone(this.db);
  }
  async create(appt) {
    const now = new Date().toISOString();
    const rec = { ...appt, id: uuid(), createdAt: now, updatedAt: now };
    this.db.appointments.push(rec);
    this.write(this.db);
    return structuredClone(rec);
  }
  async update(id, appt) {
    const i = this.db.appointments.findIndex((a) => a.id === id);
    if (i === -1) throw new Error('ไม่พบข้อมูลนัด');
    this.db.appointments[i] = { ...this.db.appointments[i], ...appt, id, updatedAt: new Date().toISOString() };
    this.write(this.db);
    return structuredClone(this.db.appointments[i]);
  }
  async remove(id) {
    this.db.appointments = this.db.appointments.filter((a) => a.id !== id);
    this.write(this.db);
  }
  async saveSettings(settings) {
    this.db.settings = structuredClone(settings);
    this.write(this.db);
    return structuredClone(settings);
  }
  async importAll(data) {
    this.db = structuredClone({ appointments: data.appointments, settings: data.settings || this.db.settings });
    this.write(this.db);
    return structuredClone(this.db);
  }
}

export async function openStore() {
  if (globalThis.google?.script?.run) {
    // ยังไม่ได้เข้าสู่ระบบ: data = null (หน้าเว็บจะแสดงหน้าเข้าสู่ระบบ) / โหลดไม่ได้ด้วยเหตุอื่นให้แจ้งผู้ใช้ ไม่ตกไปโหมดออฟไลน์
    const s = new GasStore();
    return { store: s, data: await s.loadOrNull() };
  }
  // ไฟล์ตัวอย่างหรือเปิดไฟล์ตรง ๆ (file://) ไม่มีเซิร์ฟเวอร์ให้เรียก
  if (!globalThis.RTQ_PREVIEW && location.protocol !== 'file:') {
    try {
      const s = new ServerStore();
      const data = await s.load();
      if (data && Array.isArray(data.appointments)) return { store: s, data };
    } catch {
      /* ไม่มีเซิร์ฟเวอร์ — ใช้โหมดออฟไลน์ */
    }
  }
  const s = new LocalStore();
  return { store: s, data: await s.load() };
}
