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
  }
  isText(r, c) {
    return this.formats.get(`${r}:${c}`) === '@';
  }
  getRange(row, col, rows = 1, cols = 1) {
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
  setFrozenRows() {}
  deleteRow(r) {
    this.data.splice(r - 1, 1);
  }
  deleteRows(r, n) {
    this.data.splice(r - 1, n);
  }
}

export function createGas() {
  const sheets = new Map();
  const ss = {
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
  const context = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss, flush() {} },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v) }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { getUuid: () => randomUUID() },
    Logger: { log() {} },
    HtmlService: {
      createHtmlOutputFromFile: (n) => ({ getContent: () => readFileSync(path.join(DIR, `${n}.html`), 'utf8') }),
    },
  };
  vm.createContext(context);
  // Apps Script โหลดทุกไฟล์ .gs เข้าขอบเขต global เดียวกัน
  for (const f of ['Schedule.gs', 'Code.gs']) vm.runInContext(readFileSync(path.join(DIR, f), 'utf8'), context, { filename: f });
  // ค่าที่ส่งผ่าน google.script.run ถูกแปลงเป็น JSON
  const call = (fn, ...args) => JSON.parse(JSON.stringify(context[fn](...JSON.parse(JSON.stringify(args))) ?? null));
  return { context, sheets, call };
}

// หน้าเว็บที่ doGet ส่งออก (HtmlService.createHtmlOutputFromFile('Index'))
export function renderIndex() {
  return readFileSync(path.join(DIR, 'Index.html'), 'utf8');
}
