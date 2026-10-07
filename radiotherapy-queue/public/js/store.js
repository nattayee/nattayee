// ชั้นจัดเก็บข้อมูล: ใช้ API ของเซิร์ฟเวอร์ (server.mjs) ถ้าเรียกไม่ได้ เช่นวางบน static hosting
// จะเก็บข้อมูลในเบราว์เซอร์ (localStorage) แทน — ข้อมูลจะไม่แชร์ระหว่างเครื่อง
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
  async load() {
    this.db = this.read();
    return this.db;
  }
  async create(appt) {
    const now = new Date().toISOString();
    const rec = { ...appt, id: uuid(), createdAt: now, updatedAt: now };
    this.db.appointments.push(rec);
    this.write(this.db);
    return rec;
  }
  async update(id, appt) {
    const i = this.db.appointments.findIndex((a) => a.id === id);
    if (i === -1) throw new Error('ไม่พบข้อมูลนัด');
    this.db.appointments[i] = { ...this.db.appointments[i], ...appt, id, updatedAt: new Date().toISOString() };
    this.write(this.db);
    return this.db.appointments[i];
  }
  async remove(id) {
    this.db.appointments = this.db.appointments.filter((a) => a.id !== id);
    this.write(this.db);
  }
  async saveSettings(settings) {
    this.db.settings = settings;
    this.write(this.db);
    return settings;
  }
  async importAll(data) {
    this.db = { appointments: data.appointments, settings: data.settings || this.db.settings };
    this.write(this.db);
    return this.db;
  }
}

export async function openStore() {
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
