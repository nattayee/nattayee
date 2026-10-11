'use strict';
// จำลองบริการของ Google Apps Script (SpreadsheetApp, Utilities, ...) เพื่อทดสอบและเปิดดู apps-script/ ใน Node

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function tzOffsetMs(utcMs, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    }).formatToParts(new Date(utcMs)).map(p => [p.type, p.value]),
  );
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - utcMs;
}

/** วันที่เที่ยงคืนตามเขตเวลา tz (เหมือนเซลล์วันที่ใน Google Sheets) */
function dateInTz(y, m, d, tz) {
  const guess = Date.UTC(y, m - 1, d);
  return new Date(guess - tzOffsetMs(guess, tz));
}

const Utilities = {
  formatDate(date, tz, fmt) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(date).map(p => [p.type, p.value]),
    );
    if (fmt === 'yyyy') return parts.year;
    if (fmt === 'yyyy-MM-dd') return `${parts.year}-${parts.month}-${parts.day}`;
    throw new Error(`mock formatDate: ไม่รองรับรูปแบบ ${fmt}`);
  },
  parseDate(str, tz, fmt) {
    if (fmt !== 'yyyy-MM-dd') throw new Error(`mock parseDate: ไม่รองรับรูปแบบ ${fmt}`);
    const [y, m, d] = str.split('-').map(Number);
    return dateInTz(y, m, d, tz);
  },
};

class MockRange {
  constructor(sheet, row, col, numRows, numCols) {
    Object.assign(this, { sheet, row, col, numRows, numCols });
  }

  map(fn) {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = [];
      for (let c = 0; c < this.numCols; c++) line.push(fn(this.row - 1 + r, this.col - 1 + c));
      out.push(line);
    }
    return out;
  }

  each(values, fn) {
    if (values.length !== this.numRows || values.some(v => v.length !== this.numCols)) {
      throw new Error('mock: ขนาดข้อมูลไม่ตรงกับช่วงเซลล์');
    }
    values.forEach((line, r) => line.forEach((v, c) => fn(this.row - 1 + r, this.col - 1 + c, v)));
  }

  getValues() {
    return this.map((r, c) => {
      const v = this.sheet.cell(r, c).value;
      return v instanceof Date ? new Date(v.getTime()) : v;
    });
  }

  setValues(values) {
    // เลียนแบบ Google Sheets: ข้อความในเซลล์ที่ไม่ได้ตั้งเป็น "@" จะถูกตีความเหมือนพิมพ์เอง
    this.each(values, (r, c, v) => {
      const cell = this.sheet.cell(r, c);
      if (typeof v === 'string' && cell.format !== '@') {
        if (v.startsWith('=')) v = { formula: v };
        else if (/^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
      }
      cell.value = v;
    });
    return this;
  }

  getNumberFormats() {
    return this.map((r, c) => this.sheet.cell(r, c).format);
  }

  setNumberFormats(formats) {
    this.each(formats, (r, c, f) => { this.sheet.cell(r, c).format = f; });
    return this;
  }

  setNumberFormat(f) {
    this.map((r, c) => { this.sheet.cell(r, c).format = f; });
    return this;
  }

  setFontWeight() {
    return this;
  }
}

class MockSheet {
  constructor(name, rows = []) {
    this.name = name;
    this.maxRows = 1000;
    this.rows = rows.map(line => line.map(value => ({ value: value ?? '', format: 'General' })));
  }

  cell(r, c) {
    while (this.rows.length <= r) this.rows.push([]);
    const line = this.rows[r];
    while (line.length <= c) line.push({ value: '', format: 'General' });
    return line[c];
  }

  getName() { return this.name; }

  getMaxRows() { return Math.max(this.maxRows, this.rows.length); }

  insertRowsAfter(after, howMany) { this.maxRows = this.getMaxRows() + howMany; }

  getLastRow() {
    for (let r = this.rows.length - 1; r >= 0; r--) {
      if (this.rows[r].some(cell => cell.value !== '')) return r + 1;
    }
    return 0;
  }

  getLastColumn() {
    let max = 0;
    this.rows.forEach(line => line.forEach((cell, c) => { if (cell.value !== '') max = Math.max(max, c + 1); }));
    return max;
  }

  getDataRange() {
    return new MockRange(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1));
  }

  getRange(row, col, numRows = 1, numCols = 1) {
    if (row < 1 || col < 1 || row + numRows - 1 > this.getMaxRows()) throw new Error('mock: ตำแหน่งเซลล์อยู่นอกชีต');
    return new MockRange(this, row, col, numRows, numCols);
  }

  setFrozenRows() {}
  setColumnWidth() {}

  /** ค่าในชีตแบบอ่านง่าย (สำหรับตรวจในเทสต์) */
  dump(tz) {
    return this.rows.map(line => line.map(cell =>
      cell.value instanceof Date ? Utilities.formatDate(cell.value, tz, 'yyyy-MM-dd') : cell.value));
  }
}

class MockSpreadsheet {
  constructor(sheets, tz) {
    this.sheets = sheets;
    this.tz = tz;
  }

  getSheets() { return [...this.sheets]; }
  getSpreadsheetTimeZone() { return this.tz; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/mock/edit'; }
  getSheetByName(name) { return this.sheets.find(s => s.name === name) || null; }

  insertSheet(name, index) {
    if (this.getSheetByName(name)) throw new Error(`mock: มีชีต ${name} อยู่แล้ว`);
    const sheet = new MockSheet(name);
    this.sheets.splice(index ?? this.sheets.length, 0, sheet);
    return sheet;
  }
}

/**
 * โหลด Code.gs พร้อมสเปรดชีตจำลอง
 * sheets: { ชื่อชีต: แถว[][] } ค่าในเซลล์ใช้ { y, m, d } แทนเซลล์วันที่
 */
function loadAppsScript(sheets, { tz = 'Asia/Bangkok' } = {}) {
  const toCell = v => (v && typeof v === 'object' && 'y' in v ? dateInTz(v.y, v.m, v.d, tz) : v);
  const ss = new MockSpreadsheet(
    Object.entries(sheets).map(([name, rows]) => new MockSheet(name, rows.map(line => line.map(toCell)))),
    tz,
  );
  const props = new Map();
  const locks = { held: false };

  const context = vm.createContext({
    Utilities,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => props.set(k, String(v)),
      }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock() {
          if (locks.held) return false;
          locks.held = true;
          return true;
        },
        releaseLock() { locks.held = false; },
      }),
    },
    HtmlService: {
      createHtmlOutputFromFile: name => {
        const out = { name, setTitle: () => out, addMetaTag: () => out };
        return out;
      },
    },
  });
  const code = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
  vm.runInContext(code, context, { filename: 'Code.gs' });

  // แปลงผลลัพธ์ข้าม realm ให้เป็นอ็อบเจกต์ธรรมดา (เหมือนที่ google.script.run ส่งกลับมาเป็น JSON)
  const api = {};
  for (const fn of ['getState', 'createRecord', 'updateRecord', 'deleteRecord', 'setNextNo', 'doGet']) {
    api[fn] = (...args) => JSON.parse(JSON.stringify(context[fn](...JSON.parse(JSON.stringify(args))) ?? null));
  }
  return { api, ss, props, tz };
}

module.exports = { loadAppsScript, dateInTz };
