'use strict';
// เก็บข้อมูลทะเบียนไว้ในไฟล์ JSON ไฟล์เดียว และเป็นผู้ออกเลขทะเบียนส่ง (ทีละรายการ ไม่ซ้ำกัน)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { firstFreeNumber, isoDate } = require('./importer');

const TEXT_LIMITS = { ref: 100, from: 200, to: 200, subject: 1000, action: 200, note: 1000 };
const HEADER = ['เลขทะเบียนส่ง', 'ที่', 'ลงวันที่', 'จาก', 'ถึง', 'เรื่อง', 'การปฏิบัติ', 'หมายเหตุ'];

class InputError extends Error {}

function beYearOf(date) {
  return Number(date.slice(0, 4)) + 543;
}

function validDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return m && isoDate(+m[1], +m[2], +m[3]) === value;
}

function cleanFields(input) {
  const out = {};
  for (const [field, max] of Object.entries(TEXT_LIMITS)) {
    if (input[field] === undefined) continue;
    const v = String(input[field] ?? '').replace(/\s+/g, ' ').trim();
    if (v.length > max) throw new InputError(`ข้อความช่อง "${field}" ยาวเกิน ${max} ตัวอักษร`);
    out[field] = v;
  }
  return out;
}

function formatThaiDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  return `${d}/${m}/${y + 543}`;
}

class Store {
  constructor(file) {
    this.file = file;
    this.data = this.load();
  }

  load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return { version: 1, records: [], counters: {}, ...data };
    } catch (err) {
      if (err.code === 'ENOENT') return { version: 1, records: [], counters: {} };
      throw err;
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
    if (fs.existsSync(this.file)) fs.copyFileSync(this.file, `${this.file}.bak`);
    fs.renameSync(tmp, this.file);
  }

  backup(label) {
    if (!fs.existsSync(this.file)) return null;
    const dir = path.join(path.dirname(this.file), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(dir, `registry-${stamp}-${label}.json`);
    fs.copyFileSync(this.file, dest);
    return dest;
  }

  recordsOf(year) {
    return this.data.records.filter(r => r.year === year);
  }

  /** เลขถัดไปของปี: ต่อจากตัวนับ และข้ามเลขที่มีคนใช้ไปแล้ว */
  nextNo(year) {
    const used = new Set(this.recordsOf(year).map(r => r.no));
    let n = this.data.counters[year] ?? firstFreeNumber([...used]);
    while (used.has(n)) n++;
    return n;
  }

  state(currentYear) {
    const years = new Set(this.data.records.map(r => r.year));
    if (currentYear) years.add(currentYear);
    const nextNo = {};
    for (const y of years) nextNo[y] = this.nextNo(y);
    return { records: this.data.records, nextNo };
  }

  create(input) {
    if (!validDate(input.date)) throw new InputError('กรุณาระบุวันที่ให้ถูกต้อง');
    const fields = cleanFields(input);
    if (!fields.subject) throw new InputError('กรุณาระบุเรื่อง');

    const year = beYearOf(input.date);
    const no = this.nextNo(year);
    const now = new Date().toISOString();
    const rec = {
      id: crypto.randomUUID(),
      year,
      no,
      ref: '', from: '', to: '', subject: '', action: '', note: '',
      ...fields,
      date: input.date,
      dateText: '',
      createdAt: now,
      updatedAt: now,
    };
    this.data.records.push(rec);
    this.data.counters[year] = no + 1;
    this.save();
    return rec;
  }

  update(id, input) {
    const rec = this.data.records.find(r => r.id === id);
    if (!rec) throw new InputError('ไม่พบรายการนี้ (อาจถูกลบไปแล้ว)');
    const fields = cleanFields(input);

    if (input.no !== undefined && Number(input.no) !== rec.no) {
      const no = Number(input.no);
      if (!Number.isInteger(no) || no < 1 || no > 99999) throw new InputError('เลขทะเบียนส่งต้องเป็นจำนวนเต็มบวก');
      if (this.recordsOf(rec.year).some(r => r.no === no)) throw new InputError(`เลข ${no} ของปี ${rec.year} มีอยู่แล้ว`);
      rec.no = no;
    }
    if (input.date) {
      if (!validDate(input.date)) throw new InputError('กรุณาระบุวันที่ให้ถูกต้อง');
      rec.date = input.date;
      rec.dateText = '';
    }
    Object.assign(rec, fields, { updatedAt: new Date().toISOString() });
    this.save();
    return rec;
  }

  remove(id) {
    const idx = this.data.records.findIndex(r => r.id === id);
    if (idx < 0) throw new InputError('ไม่พบรายการนี้ (อาจถูกลบไปแล้ว)');
    const [rec] = this.data.records.splice(idx, 1);
    // ลบเลขล่าสุดที่เพิ่งออก → คืนเลขนั้นให้ใช้ใหม่ได้
    if (this.data.counters[rec.year] === rec.no + 1) this.data.counters[rec.year] = rec.no;
    this.save();
    return rec;
  }

  setCounter(year, next) {
    if (!Number.isInteger(year) || year < 2400 || year > 3000) throw new InputError('ปี พ.ศ. ไม่ถูกต้อง');
    if (!Number.isInteger(next) || next < 1 || next > 99999) throw new InputError('เลขถัดไปต้องเป็นจำนวนเต็มบวก');
    this.data.counters[year] = next;
    this.save();
    return this.nextNo(year);
  }

  /** แทนที่ข้อมูลของปีที่อยู่ในไฟล์นำเข้า (ปีอื่นคงเดิม) แล้วตั้งเลขถัดไปให้รันต่อจากไฟล์ */
  replaceYears(years) {
    const backup = this.backup('before-import');
    const replaced = new Set(Object.keys(years).map(Number));
    const now = new Date().toISOString();
    this.data.records = this.data.records.filter(r => !replaced.has(r.year));
    for (const [year, records] of Object.entries(years)) {
      for (const r of records) {
        this.data.records.push({ id: crypto.randomUUID(), ...r, createdAt: now, updatedAt: now });
      }
      this.data.counters[year] = firstFreeNumber(records.map(r => r.no));
    }
    this.save();
    return backup;
  }

  /** ข้อมูลสำหรับส่งออก Excel: ชีตละปี หัวตารางเหมือนไฟล์ต้นฉบับ */
  exportSheets() {
    const years = [...new Set(this.data.records.map(r => r.year))].sort((a, b) => b - a);
    return years.map(year => ({
      name: String(year),
      header: HEADER,
      colWidths: [14, 20, 14, 22, 18, 70, 16, 30],
      rows: this.recordsOf(year)
        .sort((a, b) => a.no - b.no)
        .map(r => [r.no, r.ref, r.date ? formatThaiDate(r.date) : r.dateText, r.from, r.to, r.subject, r.action, r.note]),
    }));
  }
}

module.exports = { Store, InputError, beYearOf };
