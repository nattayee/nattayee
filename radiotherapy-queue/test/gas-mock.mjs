// จำลอง Google Apps Script (SpreadsheetApp, PropertiesService, …) เพื่อทดสอบ apps-script/*.gs ใน Node
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'apps-script');

class Range {
  constructor(sheet, row, col, rows, cols) {
    Object.assign(this, { sheet, row, col, rows, cols });
  }
  getDisplayValues() {
    const out = [];
    for (let r = 0; r < this.rows; r++) {
      const line = [];
      for (let c = 0; c < this.cols; c++) line.push(String(this.sheet.data[this.row - 1 + r]?.[this.col - 1 + c] ?? ''));
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    if (values.length !== this.rows || values.some((v) => v.length !== this.cols)) throw new Error('ขนาดข้อมูลไม่ตรงกับช่วง');
    values.forEach((line, r) => {
      const i = this.row - 1 + r;
      this.sheet.data[i] ||= [];
      line.forEach((v, c) => {
        // ถ้าไม่ได้ตั้งรูปแบบเป็นข้อความ Sheets จะแปลงตัวเลข/วันที่ — จำลองการทำให้เลข 0 นำหน้าหาย
        const plain = this.sheet.isText(i + 1, this.col + c);
        this.sheet.data[i][this.col - 1 + c] = !plain && /^\d+$/.test(v) ? String(Number(v)) : v;
      });
    });
    return this;
  }
  setNumberFormat(fmt) {
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) this.sheet.formats.set(`${this.row + r}:${this.col + c}`, fmt);
    return this;
  }
  setFontWeight() {
    return this;
  }
  clearContent() {
    for (let r = 0; r < this.rows; r++) {
      const line = this.sheet.data[this.row - 1 + r];
      if (line) for (let c = 0; c < this.cols; c++) line[this.col - 1 + c] = '';
    }
    return this;
  }
}

class Sheet {
  constructor(name) {
    this.name = name;
    this.data = [];
    this.formats = new Map();
    this.maxColumns = 26; // แผ่นงานใหม่ของ Google Sheets มีคอลัมน์ A–Z
  }
  isText(r, c) {
    return this.formats.get(`${r}:${c}`) === '@';
  }
  getRange(row, col, rows = 1, cols = 1) {
    if (col + cols - 1 > this.maxColumns || row + rows - 1 > this.getMaxRows()) {
      throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
    }
    return new Range(this, row, col, rows, cols);
  }
  getLastRow() {
    for (let i = this.data.length - 1; i >= 0; i--) if (this.data[i]?.some((v) => v !== '' && v != null)) return i + 1;
    return 0;
  }
  getLastColumn() {
    return Math.max(0, ...this.data.map((r) => (r || []).length));
  }
  getMaxRows() {
    return 1000;
  }
  getMaxColumns() {
    return this.maxColumns;
  }
  insertColumnsAfter(after, n) {
    this.maxColumns += n;
  }
  setFrozenRows() {}
  deleteRow(r) {
    this.data.splice(r - 1, 1);
  }
  deleteRows(r, n) {
    this.data.splice(r - 1, n);
  }
}

// จำลอง LPCH RO Workspace (doPost: login, ssoRedeem, me, logout)
export function createWorkspace() {
  const users = {
    admin: { username: 'admin', fullName: 'ผู้ดูแล ระบบ', role: 'MP', isAdmin: true, status: 'active', password: 'admin-pass' },
    rtt1: { username: 'rtt1', fullName: 'นักรังสี หนึ่ง', role: 'RTT', isAdmin: false, status: 'active', password: 'rtt-pass1' },
    other1: { username: 'other1', fullName: 'อื่น ๆ', role: 'Other', isAdmin: false, status: 'active', password: 'other-pass' },
  };
  const sessions = new Map();
  const tickets = new Map();
  const pub = (u) => ({ username: u.username, fullName: u.fullName, role: u.role, isAdmin: u.isAdmin, status: u.status });
  const session = (u) => {
    const t = randomUUID();
    sessions.set(t, u.username);
    return t;
  };
  const ws = {
    users, sessions, calls: [],
    ticketFor(username) {
      const t = randomUUID().replace(/-/g, '');
      tickets.set(t, username);
      return t;
    },
    handle(req) {
      ws.calls.push(req.action);
      const u0 = req.token && users[sessions.get(req.token)];
      switch (req.action) {
        case 'login': {
          const u = users[String(req.username).toLowerCase()];
          if (!u || u.password !== req.password) return { ok: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
          if (u.status !== 'active') return { ok: false, error: 'บัญชีของคุณถูกระงับการใช้งาน' };
          return { ok: true, token: session(u), user: pub(u) };
        }
        case 'ssoRedeem': {
          const name = tickets.get(req.ticket);
          if (!name) return { ok: false, error: 'ลิงก์เข้าสู่ระบบหมดอายุหรือถูกใช้ไปแล้ว กรุณาเข้าสู่ระบบอีกครั้ง' };
          tickets.delete(req.ticket);
          return { ok: true, token: session(users[name]), user: pub(users[name]) };
        }
        case 'me':
          return u0 && u0.status === 'active' ? { ok: true, user: pub(u0) } : { ok: false, error: 'session_expired' };
        case 'logout':
          sessions.delete(req.token);
          return { ok: true };
        default:
          return { ok: false, error: 'ไม่รู้จักคำสั่ง ' + req.action };
      }
    },
  };
  return ws;
}

export function createGas({ bound = true, workspace = null, his = null } = {}) {
  const sheets = new Map();
  const ss = {
    getSheets: () => [...sheets.values()],
    deleteSheet: (s) => sheets.delete(s.name),
    getId: () => 'SHEET-ID',
    getUrl: () => 'https://docs.google.com/spreadsheets/d/SHEET-ID',
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => {
      const s = new Sheet(n);
      sheets.set(n, s);
      return s;
    },
  };
  const props = new Map();
  const cache = new Map();
  const context = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => (bound ? ss : null),
      openById: () => ss,
      openByUrl: () => ss,
      create: () => {
        context.createdSheets = (context.createdSheets || 0) + 1;
        ss.insertSheet('แผ่น1');
        return ss;
      },
      flush() {},
    },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v) }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => cache.get(k) ?? null,
        put: (k, v) => cache.set(k, String(v)),
        remove: (k) => cache.delete(k),
      }),
    },
    UrlFetchApp: {
      fetch: (url, opts = {}) => {
        if (his && url.startsWith('https://his.test/')) {
          // HIS จำลอง: his({ hn, apiKey }) → { code, body }
          const u = new URL(url);
          const r = his({ hn: u.searchParams.get('hn'), apiKey: opts.headers?.['X-API-Key'] || '' });
          const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
          return { getContentText: () => text, getResponseCode: () => r.code };
        }
        if (!workspace) throw new Error('ไม่ได้ตั้งค่า Workspace จำลอง');
        const body = JSON.stringify(workspace.handle(JSON.parse(opts.payload)));
        return { getContentText: () => body, getResponseCode: () => 200 };
      },
    },
    Utilities: {
      getUuid: () => randomUUID(),
      formatDate: (d, tz, fmt) => {
        const iso = new Date(d.getTime() + 7 * 3600e3).toISOString(); // Asia/Bangkok
        return fmt === 'yyyy-MM-dd' ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
      },
    },
    Logger: { log() {} },
    HtmlService: {
      createHtmlOutputFromFile: (n) => ({ getContent: () => readFileSync(path.join(DIR, `${n}.html`), 'utf8') }),
      createHtmlOutput: (html) => {
        const out = { html, setTitle: () => out, addMetaTag: () => out, getContent: () => html };
        return out;
      },
    },
  };
  vm.createContext(context);
  // Apps Script โหลดทุกไฟล์ .gs เข้าขอบเขต global เดียวกัน
  for (const f of ['Schedule.gs', 'Code.gs']) vm.runInContext(readFileSync(path.join(DIR, f), 'utf8'), context, { filename: f });
  if (!workspace) context.WORKSPACE_URL = ''; // ทดสอบแบบไม่มีการเข้าสู่ระบบ
  // ค่าที่ส่งผ่าน google.script.run ถูกแปลงเป็น JSON
  const call = (fn, ...args) => JSON.parse(JSON.stringify(context[fn](...JSON.parse(JSON.stringify(args))) ?? null));
  return { context, sheets, cache, call };
}

// หน้าเว็บที่ doGet ส่งออก (HtmlService.createHtmlOutputFromFile('Index'))
export function renderIndex() {
  return readFileSync(path.join(DIR, 'Index.html'), 'utf8');
}
