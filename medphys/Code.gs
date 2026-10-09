/**
 * ระบบกระจายงานฟิสิกส์การแพทย์ — ส่วนหลังบ้าน (Google Apps Script)
 * กลุ่มงานรังสีรักษา โรงพยาบาลมะเร็งลำปาง
 *
 * เก็บข้อมูลในแท็บ Cases, Logs และ Config ของ Google Sheet ที่ผูกสคริปต์นี้ไว้
 * แท็บเดิมของไฟล์ P4P_Physics จะไม่ถูกแก้ไข (อ่านอย่างเดียวตอนนำเข้า)
 * วิธีติดตั้งอยู่ใน README.md
 */

const APP_TITLE = 'ระบบกระจายงานฟิสิกส์การแพทย์';
const CONFIG_SHEET = 'Config';
const TABLES = {
  cases: {
    sheet: 'Cases',
    fields: [
      ['id', 'id'], ['cat', 'หมวด'], ['mp', 'MP'], ['ct', 'CT-Sim'], ['in', 'In'], ['sim', 'Sim'],
      ['fin', 'Finish'], ['eval', 'Evaluate'], ['type', 'Type'], ['hn', 'HN'], ['name', 'Name'],
      ['doc', 'Doc'], ['aim', 'Aim'], ['tech', 'Technique'], ['note', 'Note'],
      ['created', 'Created'], ['updated', 'Updated'],
    ],
  },
  logs: {
    sheet: 'Logs',
    fields: [
      ['id', 'id'], ['kind', 'ประเภท'], ['date', 'Date'], ['mp', 'MP'], ['hn', 'HN'], ['name', 'Name'],
      ['caseId', 'เคส (id)'], ['title', 'กิจกรรม'], ['min', 'เวลา'], ['k', 'k'], ['note', 'Note'],
      ['created', 'Created'], ['updated', 'Updated'],
    ],
  },
  leaves: {
    sheet: 'Leaves',
    fields: [['id', 'id'], ['mp', 'MP'], ['from', 'ตั้งแต่'], ['to', 'ถึง'], ['note', 'Note'], ['created', 'Created'], ['updated', 'Updated']],
  },
};
// ใช้เมื่อยังไม่เคยบันทึกการตั้งค่าจากหน้าเว็บ
const DEFAULT_STAFF = ['JR', 'WM', 'NY', 'WS'];
const DAY_ROTATE_CATS = ['brachy', 'brachyn', 'p2h', 'hyper'];

/* ---------- หน้าเว็บและเมนู ---------- */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle(APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ระบบกระจายงาน')
    .addItem('เปิดระบบ', 'openApp')
    .addSeparator()
    .addItem('นำเข้าข้อมูลจากแท็บเดิม', 'importLegacy')
    .addToUi();
}

function openApp() {
  const html = HtmlService.createHtmlOutputFromFile('index').setWidth(1200).setHeight(820);
  SpreadsheetApp.getUi().showModalDialog(html, APP_TITLE);
}

/* ---------- API ที่หน้าเว็บเรียกผ่าน google.script.run ---------- */

function getData() {
  const ss = SpreadsheetApp.getActive();
  return {
    cases: readTable_(ss, 'cases'),
    logs: readTable_(ss, 'logs'),
    leaves: readTable_(ss, 'leaves'),
    config: readConfig_(ss),
    sheetUrl: ss.getUrl(),
  };
}

function saveRecord(table, rec) {
  const def = tableDef_(table);
  if (!rec || !rec.id) throw new Error('ไม่มีรหัสรายการ');
  return withLock_(() => {
    const sh = tableSheet_(SpreadsheetApp.getActive(), table);
    const header = headerOf_(sh);
    const row = findRow_(sh, header.indexOf('id') + 1, rec.id) || sh.getLastRow() + 1;
    writeFields_(sh, row, header, def.fields, rec);
    return rec;
  });
}

/**
 * แจกเคสใหม่: เลือก MP ตามคิวของเทคนิคภายใต้ล็อก ผู้ใช้หลายคนกดพร้อมกันก็ไม่ได้คนซ้ำ
 */
function addCase(rec) {
  if (!rec || !rec.cat) throw new Error('เลือกเทคนิคก่อนแจกเคส');
  return withLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const cfg = readConfig_(ss) || {};
    const staff = Array.isArray(cfg.staff) && cfg.staff.length ? cfg.staff : DEFAULT_STAFF.map(code => ({ code: code, active: true }));
    const cat = (cfg.cats || []).filter(c => c.id === rec.cat)[0];
    const byDay = cat ? cat.rotate === 'day' || cat.rotate === false : DAY_ROTATE_CATS.indexOf(rec.cat) >= 0;
    const date = rec.in || Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    rec.mp = pickNext_({
      staff: staff, leaves: readTable_(ss, 'leaves'), date: date, byDay: byDay,
      cases: readTable_(ss, 'cases').filter(c => c.cat === rec.cat),
      pointer: (cfg.queue || {})[rec.cat] || null,
    });
    if (!rec.mp) throw new Error('ไม่มีนักฟิสิกส์ที่รับเคสได้ในวันนั้น (ลาหรือปิดการปฏิบัติงานทุกคน)');
    rec.id = rec.id || Utilities.getUuid();
    rec.in = date;
    rec.created = new Date().toISOString();
    const sh = tableSheet_(ss, 'cases');
    writeFields_(sh, sh.getLastRow() + 1, headerOf_(sh), TABLES.cases.fields, rec);
    return rec;
  });
}

/*
 * คิวหมุนเวียน (ตรรกะเดียวกับ pickNext ใน index.html)
 * ต่อจากคนที่ได้เคสล่าสุดของเทคนิคนั้น ข้ามคนที่ลาในวันนั้นหรือปิดการปฏิบัติงาน
 * byDay: เคสวันเดียวกันให้คนเดิม, pointer: คนถัดไปที่ตั้งเองในหน้าตั้งค่า
 */
function pickNext_(o) {
  const staff = o.staff, n = staff.length;
  if (!n) return '';
  const away = code => o.leaves.some(l => l.mp === code && l.from <= o.date && o.date <= (l.to || l.from));
  const free = i => staff[i].active !== false && !away(staff[i].code);
  const idx = code => staff.findIndex(s => s.code === code);
  const list = o.cases.slice().sort((a, b) => (a.created < b.created ? -1 : a.created > b.created ? 1 : 0));
  const last = list[list.length - 1];
  let start = 0;
  if (o.pointer && idx(o.pointer.code) >= 0 && (!last || last.created <= o.pointer.at)) start = idx(o.pointer.code);
  else if (last && idx(last.mp) >= 0) {
    start = idx(last.mp);
    if (!(o.byDay && last.in === o.date && free(start))) start += 1;
  }
  for (let i = 0; i < n; i++) { const j = (start + i) % n; if (free(j)) return staff[j].code; }
  return '';
}

function deleteRecord(table, id) {
  tableDef_(table);
  return withLock_(() => {
    const sh = tableSheet_(SpreadsheetApp.getActive(), table);
    const row = findRow_(sh, headerOf_(sh).indexOf('id') + 1, id);
    if (row) sh.deleteRow(row);
    return !!row;
  });
}

function saveConfig(config) {
  return withLock_(() => {
    writeConfig_(SpreadsheetApp.getActive(), config || {});
    return true;
  });
}

/* ---------- นำเข้าจากแท็บเดิม (3D, VM bt, SRS CSI, Brachy, Hyper, RC, วิชาการ, P4P) ---------- */

const LEGACY_PLAN_SHEETS = [
  ['3D', '3d'], ['3D Bt', '3dbt'], ['VM Brain', 'vmbrain'], ['VM bt', 'vmbt'],
  ['VM etc', 'vmetc'], ['VM Chest', 'vmchest'], ['VM H&N', 'vmhn'], ['SRS CSI', 'srs'],
];
// แท็บที่มีสองตารางคู่กัน: ตารางซ้าย, ตารางขวา
const LEGACY_PAIR_SHEETS = [['Brachy', 'brachy', 'brachyn'], ['Hyper', 'hyper', 'p2h']];
const LEGACY_HEADERS = {
  'CT-Sim': 'ct', 'In': 'in', 'Sim': 'sim', 'Finish': 'fin', 'Evaluate': 'eval', 'Type': 'type',
  'HN': 'hn', 'Name': 'name', 'Doc': 'doc', 'Aim': 'aim', 'Technique': 'tech', 'Note': 'note',
};

function importLegacy() {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const found = parseLegacy_(name => {
    const sh = ss.getSheetByName(name);
    return sh ? sh.getDataRange().getValues() : null;
  }, tz);
  const added = withLock_(() => {
    const result = { cases: appendNew_(ss, 'cases', found.cases), logs: appendNew_(ss, 'logs', found.logs) };
    const cfg = readConfig_(ss) || {};
    if (!Array.isArray(cfg.staff) || !cfg.staff.length) {
      cfg.staff = (found.staff.length ? found.staff : ['JR', 'WM', 'NY', 'WS']).map(code => ({ code: code, name: '', active: true }));
    }
    // ตั้งคิวให้คนถัดไปตรงกับแถวว่างแถวแรกในแท็บเดิม
    const codes = cfg.staff.map(s => String(s.code).toUpperCase());
    const at = new Date().toISOString();
    cfg.queue = cfg.queue || {};
    Object.keys(found.next).forEach(cat => {
      if (codes.indexOf(found.next[cat]) >= 0) cfg.queue[cat] = { code: found.next[cat], at: at };
    });
    cfg.carry = cfg.carry || {};
    Object.keys(found.carry).forEach(ym => { cfg.carry[ym] = Object.assign({}, cfg.carry[ym], found.carry[ym]); });
    writeConfig_(ss, cfg);
    return result;
  });
  SpreadsheetApp.getUi().alert(
    'นำเข้าข้อมูลแล้ว',
    'เคสใหม่ ' + added.cases + ' รายการ · RC และกิจกรรม ' + added.logs + ' รายการ\n' +
    'รายการที่เคยนำเข้าแล้วจะไม่ถูกเพิ่มซ้ำ และตั้งคิวถัดไปตามแถวว่างในแท็บเดิมให้แล้ว',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * อ่านแท็บของไฟล์เดิมเป็นรายการเคสและกิจกรรม (ไม่แตะสเปรดชีต ทดสอบได้ด้วยข้อมูลอาร์เรย์)
 * read(name) คืนค่า 2 มิติแบบ getValues() หรือ null ถ้าไม่มีแท็บนั้น
 */
function parseLegacy_(read, tz) {
  const out = { cases: [], logs: [], next: {}, carry: {}, staff: [] };
  const text = v => cellText_(v, tz);
  const date = v => { const s = text(v); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
  const stamp = (d, r) => (d || '1970-01-01') + 'T00:00:00.' + ('00' + (r % 1000)).slice(-3) + 'Z';
  const key = function () { return 'L:' + Array.prototype.join.call(arguments, ':'); };
  const isTableLabel = s => /^Column\d+$/.test(s);
  const isCode = s => /^[A-Z]{2,4}$/.test(s);
  const headerRow = (rows, label, within) => rows.findIndex((r, i) => i < within && r.map(text).indexOf(label) >= 0);
  const blank = { ct: '', sim: '', fin: '', eval: '', type: '', doc: '', aim: '', tech: '' };

  // ลำดับทีม (ใช้กับแต้มต่อ)
  const sum = read('SUM');
  if (sum) for (let r = 1; r < Math.min(sum.length, 12); r++) { const c = text(sum[r][1]); if (isCode(c) && out.staff.indexOf(c) < 0) out.staff.push(c); }
  if (!out.staff.length) out.staff = ['JR', 'WM', 'NY', 'WS'];

  LEGACY_PLAN_SHEETS.forEach(([name, cat]) => {
    const rows = read(name);
    if (!rows) return;
    const h = headerRow(rows, 'HN', 8);
    if (h < 0) return;
    const col = {};
    rows[h].map(text).forEach((v, i) => { const f = LEGACY_HEADERS[v]; if (f && !(f in col)) col[f] = i; });
    const get = (row, f) => (f in col ? row[col[f]] : '');
    let last = -1;
    for (let r = h + 1; r < rows.length; r++) {
      const row = rows[r];
      const hn = text(get(row, 'hn'));
      const inDate = date(get(row, 'in'));
      if ((!hn && !inDate) || isTableLabel(hn)) continue;
      last = r;
      const sim = text(get(row, 'sim'));
      out.cases.push({
        id: key(name, r + 1, hn, inDate), cat: cat, mp: text(row[0]).toUpperCase(),
        hn: hn, name: text(get(row, 'name')), ct: date(get(row, 'ct')), in: inDate,
        sim: /on\s*call/i.test(sim) ? 'on call' : date(get(row, 'sim')),
        fin: date(get(row, 'fin')), eval: date(get(row, 'eval')), type: text(get(row, 'type')),
        doc: text(get(row, 'doc')), aim: text(get(row, 'aim')), tech: text(get(row, 'tech')),
        note: text(get(row, 'note')), created: stamp(inDate, r), updated: '',
      });
    }
    // คิวถัดไป = รหัส MP ที่เติมไว้ในแถวว่างแถวแรกหลังเคสล่าสุด
    for (let r = last >= 0 ? last + 1 : h + 1; r < rows.length; r++) {
      const code = text(rows[r][0]).toUpperCase();
      if (isCode(code)) { out.next[cat] = code; break; }
    }
  });

  LEGACY_PAIR_SHEETS.forEach(([name, leftCat, rightCat]) => {
    const rows = read(name);
    if (!rows) return;
    const h = headerRow(rows, 'HN', 6);
    if (h < 0) return;
    const starts = rows[h].map(text).map((v, i) => (v === 'Date' ? i : -1)).filter(i => i >= 0);
    [leftCat, rightCat].forEach((cat, b) => {
      const c0 = starts[b];
      if (c0 === undefined) return;
      for (let r = h + 1; r < rows.length; r++) {
        const row = rows[r];
        const d = date(row[c0]);
        const hn = text(row[c0 + 1]);
        if ((!d && !hn) || isTableLabel(hn)) continue;
        out.cases.push(Object.assign({}, blank, {
          id: key(name, cat, r + 1, hn, d), cat: cat, mp: text(row[c0 + 3]).toUpperCase(), hn: hn,
          name: text(row[c0 + 2]), in: d, note: text(row[c0 + 4]), created: stamp(d, r), updated: '',
        }));
      }
    });
  });

  // RC = Quality Checklist ผูกกับแผนของ HN เดียวกันที่ In ล่าสุดไม่เกินวัน RC
  const linkCase = (hn, d) => {
    let best = null;
    out.cases.forEach(c => {
      if (c.hn !== hn || ['brachy', 'brachyn', 'p2h', 'hyper'].indexOf(c.cat) >= 0) return;
      if (d && c.in && c.in > d) return;
      if (!best || c.in > best.in) best = c;
    });
    return best ? best.id : '';
  };
  const rc = read('RC');
  if (rc) {
    const h = headerRow(rc, 'HN', 6);
    const c0 = h >= 0 ? rc[h].map(text).indexOf('Date') : -1;
    if (c0 >= 0) {
      for (let r = h + 1; r < rc.length; r++) {
        const row = rc[r];
        const d = date(row[c0]);
        const hn = text(row[c0 + 1]);
        if ((!d && !hn) || isTableLabel(hn)) continue;
        out.logs.push({
          id: key('RC', r + 1, hn, d), kind: 'rc', date: d, mp: text(row[c0 + 3]).toUpperCase(), hn: hn,
          name: text(row[c0 + 2]), caseId: linkCase(hn, d), title: '', min: '', k: '',
          note: text(row[c0 + 4]), created: stamp(d, r), updated: '',
        });
      }
    }
  }

  const ac = read('วิชาการ');
  if (ac) {
    const h = headerRow(ac, 'กิจกรรม', 6);
    const starts = h >= 0 ? ac[h].map(text).map((v, i) => (v === 'Date' ? i : -1)).filter(i => i >= 0) : [];
    ['acad', 'admin'].forEach((kind, b) => {
      const c0 = starts[b];
      if (c0 === undefined) return;
      for (let r = h + 1; r < ac.length; r++) {
        const row = ac[r];
        const title = text(row[c0 + 1]);
        if (!title || isTableLabel(title)) continue;
        const d = date(row[c0]);
        out.logs.push({
          id: key('ACAD', kind, r + 1, d, title), kind: kind, date: d, mp: text(row[0]).toUpperCase(),
          hn: '', name: '', caseId: '', title: title, min: text(row[c0 + 2]), k: text(row[c0 + 3]),
          note: text(row[c0 + 4]), created: stamp(d, r), updated: '',
        });
      }
    });
  }

  // แต้มต่อของเดือนในแท็บ Month (แถว Year / Month)
  const month = read('Month');
  let ym = '';
  if (month) {
    const h = month.findIndex(r => text(r[0]) === 'Year' && text(r[1]) === 'Month');
    const y = h >= 0 && month[h + 1] ? Number(month[h + 1][0]) : 0;
    const m = h >= 0 && month[h + 1] ? Number(month[h + 1][1]) : 0;
    if (y && m) ym = y + '-' + ('0' + m).slice(-2);
  }
  const p4p = read('P4P');
  if (p4p && ym) {
    const vals = [];
    p4p.forEach(row => row.forEach((v, i) => { if (text(v) === 'แต้มต่อ') vals.push(Number(row[i + 5]) || 0); }));
    vals.forEach((v, i) => {
      const code = out.staff[i];
      if (code && v) (out.carry[ym] = out.carry[ym] || {})[code] = v;
    });
  }
  return out;
}

/* ---------- ตัวช่วย ---------- */

function tableDef_(table) {
  const def = TABLES[table];
  if (!def) throw new Error('ไม่รู้จักตาราง ' + table);
  return def;
}

function tableSheet_(ss, table) {
  const def = tableDef_(table);
  let sh = ss.getSheetByName(def.sheet);
  if (!sh) {
    sh = ss.insertSheet(def.sheet);
    sh.setFrozenRows(1);
  }
  const header = headerOf_(sh);
  const missing = def.fields.map(f => f[1]).filter(h => header.indexOf(h) < 0);
  if (missing.length) sh.getRange(1, header.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
  return sh;
}

function headerOf_(sh) {
  const n = sh.getLastColumn();
  return n ? sh.getRange(1, 1, 1, n).getValues()[0].map(v => String(v).trim()) : [];
}

function readTable_(ss, table) {
  const def = tableDef_(table);
  const sh = ss.getSheetByName(def.sheet);
  if (!sh || sh.getLastRow() < 2) return [];
  const tz = ss.getSpreadsheetTimeZone();
  const values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const header = values.shift().map(v => String(v).trim());
  const cols = def.fields.map(f => header.indexOf(f[1]));
  if (cols[0] < 0) return [];
  return values
    .filter(r => String(r[cols[0]]).trim() !== '')
    .map(r => {
      const o = {};
      def.fields.forEach((f, i) => { o[f[0]] = cols[i] < 0 ? '' : cellText_(r[cols[i]], tz); });
      return o;
    });
}

function findRow_(sh, col, id) {
  const last = sh.getLastRow();
  if (col < 1 || last < 2 || !id) return 0;
  const ids = sh.getRange(2, col, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}

// เขียนเฉพาะคอลัมน์ของระบบ เป็นข้อความล้วน ไม่ทับคอลัมน์ที่ผู้ใช้เพิ่มเอง
function writeFields_(sh, row, header, fields, rec) {
  const cells = fields
    .map(f => ({ col: header.indexOf(f[1]) + 1, value: safeText_(rec[f[0]]) }))
    .filter(c => c.col > 0)
    .sort((a, b) => a.col - b.col);
  let run = [];
  const flush = () => {
    if (!run.length) return;
    sh.getRange(row, run[0].col, 1, run.length).setNumberFormat('@').setValues([run.map(c => c.value)]);
    run = [];
  };
  cells.forEach(c => {
    if (run.length && c.col !== run[run.length - 1].col + 1) flush();
    run.push(c);
  });
  flush();
}

function appendNew_(ss, table, records) {
  const def = tableDef_(table);
  const sh = tableSheet_(ss, table);
  const header = headerOf_(sh);
  const idCol = header.indexOf('id') + 1;
  const have = {};
  if (sh.getLastRow() > 1) sh.getRange(2, idCol, sh.getLastRow() - 1, 1).getValues().forEach(r => { have[String(r[0])] = true; });
  const fresh = records.filter(r => !have[r.id]);
  if (!fresh.length) return 0;
  const rows = fresh.map(rec => header.map(h => {
    const f = def.fields.find(x => x[1] === h);
    return f ? safeText_(rec[f[0]]) : '';
  }));
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, header.length).setNumberFormat('@').setValues(rows);
  return fresh.length;
}

function readConfig_(ss) {
  const sh = ss.getSheetByName(CONFIG_SHEET);
  if (!sh || sh.getLastRow() < 2) return null;
  const out = {};
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => {
    if (!r[0]) return;
    try { out[r[0]] = JSON.parse(r[1]); } catch (e) { /* ข้ามค่าที่อ่านไม่ได้ */ }
  });
  return out;
}

function writeConfig_(ss, config) {
  const sh = ss.getSheetByName(CONFIG_SHEET) || ss.insertSheet(CONFIG_SHEET);
  const rows = Object.keys(config).map(k => [k, JSON.stringify(config[k])]);
  sh.clearContents();
  sh.getRange(1, 1, 1, 2).setValues([['key', 'value (JSON)']]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, 2).setNumberFormat('@').setValues(rows);
}

function cellText_(v, tz) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v) ? '' : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : '';
  const s = String(v).trim();
  return s.charAt(0) === "'" && s.charAt(1) === '=' ? s.slice(1) : s;
}

// กันข้อความที่ขึ้นต้นด้วย = ไม่ให้กลายเป็นสูตร
function safeText_(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return s.charAt(0) === '=' ? "'" + s : s;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
