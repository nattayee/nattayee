/**
 * ระบบกระจายงานฟิสิกส์การแพทย์ — ส่วนหลังบ้าน (Google Apps Script)
 * กลุ่มงานรังสีรักษา โรงพยาบาลมะเร็งลำปาง
 *
 * เก็บข้อมูลในแท็บ Cases, Logs และ Config ของ Google Sheet ที่ผูกสคริปต์นี้ไว้
 * แท็บเดิมของไฟล์ P4P_Physics จะไม่ถูกแก้ไข (อ่านอย่างเดียวตอนนำเข้า)
 * วิธีติดตั้งอยู่ใน README.md
 *
 * บัญชี LPCH RO Workspace: เข้าสู่ระบบด้วยบัญชีเดียวกับ LPCH (กดจากปุ่มในหน้า LPCH จะมีบัตรผ่าน ?sso=… หรือกรอกชื่อผู้ใช้
 * และรหัสผ่าน LPCH ที่หน้าแรก รหัสผ่านตรวจที่ LPCH ไม่เก็บที่นี่) ทุกคำขอตรวจบัญชีกับ LPCH (เก็บผลไว้ LPCH_CHECK_SECONDS)
 * บันทึกข้อมูลได้เฉพาะตำแหน่งใน LPCH_EDIT_ROLES (MP) คนอื่นดูได้อย่างเดียว
 * Deploy แบบ Execute as: Me · Who has access: Anyone แล้วรันฟังก์ชัน setupLpch เพื่อทดสอบการเชื่อมต่อ
 * เปิดจากเมนูในชีตด้วยบัญชี Google ของเจ้าของไฟล์หรือแอดมินได้เหมือนเดิม
 */

const APP_TITLE = 'ระบบกระจายงานฟิสิกส์การแพทย์';
// URL /exec ของ LPCH RO Workspace (เปลี่ยนได้ที่ Script property LPCH_URL · ใส่ - เพื่อปิดและใช้บัญชี Google อย่างเดียว)
const LPCH_URL = 'https://script.google.com/macros/s/AKfycbwVlM9oxgSQMjjvc3mi39aGbIH4vEkaaUpSNWs4dd9oJHotjpfcyJMVBi5XcUFSAAM2/exec';
const LPCH_EDIT_ROLES = ['MP'];   // ตำแหน่งใน LPCH ที่บันทึกข้อมูลได้ ตำแหน่งอื่นดูได้อย่างเดียว
const LPCH_CHECK_SECONDS = 300;
// หน้าเว็บ (index.html) โหลดจาก GitHub อัตโนมัติ จึงได้หน้าเว็บรุ่นล่าสุดเสมอ ไม่ต้องวางไฟล์ index ใหม่ทุกครั้ง
// เปลี่ยนได้ที่ Script property PAGE_URL · ใส่ - เพื่อใช้ไฟล์ index ในโปรเจกต์ · เปิด …/exec?refresh=1 เพื่อโหลดรุ่นล่าสุดทันที
// โหลดไม่ได้ (หรือไฟล์ไม่ครบ) จะใช้ไฟล์ index ในโปรเจกต์แทน
const PAGE_URL = 'https://raw.githubusercontent.com/nattayee/nattayee/refs/heads/claude/vigilant-bardeen-py5nxb/medphys/index.html';
const PAGE_CACHE_SECONDS = 600;
// รุ่นของไฟล์นี้ (แสดงที่บรรทัดล่างสุดของหน้าเว็บ) และรุ่นของ API ที่หน้าเว็บใช้ตรวจว่า Code.gs ใหม่พอหรือไม่
const CODE_VERSION = '2026-10-10.2';
const API_LEVEL = 4;
const CONFIG_SHEET = 'Config';
const TABLES = {
  cases: {
    sheet: 'Cases',
    fields: [
      ['id', 'id'], ['cat', 'หมวด'], ['mp', 'MP'], ['how', 'วิธีแจก'], ['ct', 'CT-Sim'], ['in', 'In'], ['sim', 'Sim'],
      ['fin', 'Finish'], ['eval', 'Evaluate'], ['type', 'Type'], ['hn', 'HN'], ['name', 'Name'],
      ['icd', 'ICD-10'], ['dx', 'Diagnosis'], ['doc', 'Doc'], ['aim', 'Aim'], ['tech', 'Technique'],
      ['dpf', 'Dose/fx (Gy)'], ['fx', 'Fx'], ['freq', 'ความถี่'], ['area', 'บริเวณที่ฉาย'], ['batch', 'ชุด'], ['note', 'Note'],
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

function doGet(e) {
  const p = (e && e.parameter) || {};
  const page = page_(!!p.refresh);
  const vars = { MEDPHYS_PAGE_SOURCE: page.source };
  // กดจากปุ่มใน LPCH RO Workspace: บัตรผ่านใช้ได้ครั้งเดียว แลกเป็นการเข้าสู่ระบบที่นี่
  if (p.sso && lpchUrl_()) {
    try { vars.MEDPHYS_LPCH_TOKEN = String(lpchFinish_(lpchCall_({ action: 'ssoRedeem', ticket: String(p.sso) })).token); } catch (err) {
      vars.MEDPHYS_LPCH_ERROR = String(err.message);
    }
  }
  return HtmlService.createHtmlOutput(inject_(page.html, vars))
    .setTitle(APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ค่าให้หน้าเว็บ (window.X = ...) ใส่ไว้ต้น <head>
function inject_(html, vars) {
  const tag = '<script>' + Object.keys(vars).map(k => 'window.' + k + ' = ' + JSON.stringify(vars[k]).replace(/</g, '\\u003c') + ';').join('') + '</script>';
  const m = /<head(\s[^>]*)?>/i.exec(html);
  const at = m ? m.index + m[0].length : 0;
  return html.slice(0, at) + tag + html.slice(at);
}

/* ---------- หน้าเว็บ: GitHub (เก็บไว้ PAGE_CACHE_SECONDS) หรือไฟล์ index ในโปรเจกต์ ---------- */

function pageUrl_() {
  let v = null;
  try { v = PropertiesService.getScriptProperties().getProperty('PAGE_URL'); } catch (e) { v = null; }
  v = String(v == null || v === '' ? PAGE_URL : v).trim();
  return v === '-' ? '' : v;
}

// {html, source: 'github' | 'file' | 'none'} · หน้าเว็บที่ไม่ครบ (ไม่มี </html> ท้ายไฟล์) ไม่ใช้ กันวางไม่ครบแล้วเว็บพัง
function page_(refresh) {
  const complete = h => !!h && /<\/html>\s*$/i.test(h);
  const url = pageUrl_();
  let why = '';
  if (url) {
    const cache = CacheService.getScriptCache();
    let key = 0;
    for (let i = 0; i < url.length; i++) key = (key * 31 + url.charCodeAt(i)) | 0;
    key = 'page' + (key >>> 0).toString(36);
    let html = refresh ? '' : cacheGet_(cache, key);
    if (!complete(html)) {
      try {
        const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        html = res.getResponseCode() === 200 ? res.getContentText('UTF-8') : '';
        if (!html) why = 'GitHub ตอบ HTTP ' + res.getResponseCode();
        else if (!complete(html)) why = 'ไฟล์จาก GitHub ไม่ครบ';
      } catch (e) { html = ''; why = String(e.message || e); }
      if (complete(html)) cachePut_(cache, key, html, PAGE_CACHE_SECONDS);
    }
    if (complete(html)) return { html: html, source: 'github' };
  }
  let local = '';
  try { local = HtmlService.createHtmlOutputFromFile('index').getContent(); } catch (e) { local = ''; }
  if (complete(local)) {
    // โหลดจาก GitHub ไม่ได้ และไฟล์ index ในโปรเจกต์เก่ากว่า Code.gs: แสดงแถบเตือนบนหน้า (ใช้ได้กับหน้าเว็บทุกรุ่น)
    const v = (/const PAGE_VERSION = '([^']+)'/.exec(local) || [])[1] || '';
    if (url && v < CODE_VERSION.slice(0, 10)) local = warnBanner_(local, 'หน้าเว็บนี้เป็นรุ่นเก่า' + (v ? ' (' + v + ')' : '') +
      ' จากไฟล์ index ในโปรเจกต์ เพราะโหลดจาก GitHub ไม่ได้: ' + why +
      ' · เจ้าของไฟล์: เปิด Apps Script เลือกฟังก์ชัน checkSetup แล้วกดเรียกใช้ (อนุญาตการเชื่อมต่อภายนอก) แล้ว Deploy เวอร์ชันใหม่ หรือลบไฟล์ index ออก');
    return { html: local, source: 'file', why: why };
  }
  return { html: '<!doctype html><html><head><meta charset="utf-8"></head><body><p style="font:16px sans-serif;padding:24px">โหลดหน้าเว็บไม่ได้ ตรวจ PAGE_URL ใน Code.gs หรือวางไฟล์ index ให้ครบ (บรรทัดสุดท้ายต้องเป็น &lt;/html&gt;)</p></body></html>', source: 'none' };
}

function warnBanner_(html, text) {
  const div = '<div role="alert" style="margin:0;padding:12px 16px;background:#fdecc8;color:#4a3000;font:14px/1.5 sans-serif;border-bottom:1px solid #e0b860">' +
    String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]) + '</div>';
  const m = /<body(\s[^>]*)?>/i.exec(html);
  return m ? html.slice(0, m.index + m[0].length) + div + html.slice(m.index + m[0].length) : div + html;
}

// แคชเก็บได้ไม่เกิน 100 KB ต่อค่า หน้าเว็บจึงแบ่งเก็บทีละ 30,000 ตัวอักษร (ภาษาไทยใช้ 3 ไบต์ต่อตัว)
function cachePut_(cache, key, text, seconds) {
  const size = 30000, parts = {};
  let n = 0;
  for (let i = 0; i < text.length; i += size) parts[key + '_' + (n++)] = text.slice(i, i + size);
  parts[key + '_n'] = String(n);
  try { cache.putAll(parts, seconds); } catch (e) { /* แคชเต็ม: โหลดใหม่ครั้งหน้า */ }
}

function cacheGet_(cache, key) {
  const n = Number(cache.get(key + '_n') || 0);
  if (!n) return '';
  const keys = [];
  for (let i = 0; i < n; i++) keys.push(key + '_' + i);
  const got = cache.getAll(keys);
  let text = '';
  for (let i = 0; i < n; i++) { if (got[keys[i]] == null) return ''; text += got[keys[i]]; }
  return text;
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
  const page = page_(false);
  const html = HtmlService.createHtmlOutput(inject_(page.html, { MEDPHYS_PAGE_SOURCE: page.source })).setWidth(1200).setHeight(820);
  SpreadsheetApp.getUi().showModalDialog(html, APP_TITLE);
}

/* ---------- API ที่หน้าเว็บเรียกผ่าน google.script.run ---------- */

function getData(token) {
  const ss = SpreadsheetApp.getActive();
  const config = readConfig_(ss);
  return {
    user: who_(token, ss, config),
    api: API_LEVEL,
    codeVersion: CODE_VERSION,
    homeUrl: lpchUrl_(),
    cases: readTable_(ss, 'cases'),
    logs: readTable_(ss, 'logs'),
    leaves: readTable_(ss, 'leaves'),
    config: config,
    sheetUrl: ss.getUrl(),
  };
}

function saveRecord(table, rec, token) {
  requireEdit_(token);
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
 * แจกเคสใหม่ภายใต้ล็อก ผู้ใช้หลายคนกดพร้อมกันก็ไม่ได้คนซ้ำ
 * รับได้หลายเคส (หลายเทคนิคของผู้ป่วยคนเดียว) เคสแรกเลือก MP ตามคิวของเทคนิคนั้น
 * how = 'follow' ให้ MP คนเดียวกับเคสแรก (คิวไม่ขยับ หักคิวเมื่อวนมาถึง) · how = 'manual' ใช้ MP ที่เลือกมา
 */
function addCases(recs, token) {
  requireEdit_(token);
  if (!Array.isArray(recs) || !recs.length) throw new Error('ไม่มีเคสที่จะแจก');
  return withLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const cfg = readConfig_(ss) || {};
    const staff = Array.isArray(cfg.staff) && cfg.staff.length ? cfg.staff : DEFAULT_STAFF.map(code => ({ code: code, active: true }));
    const leaves = readTable_(ss, 'leaves');
    const cases = readTable_(ss, 'cases');
    const today = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    const out = [];
    recs.forEach(rec => {
      if (!rec || !rec.cat) throw new Error('เลือกเทคนิคก่อนแจกเคส');
      const cat = (cfg.cats || []).filter(c => c.id === rec.cat)[0];
      const byDay = cat ? cat.rotate === 'day' || cat.rotate === false : DAY_ROTATE_CATS.indexOf(rec.cat) >= 0;
      const date = rec.in || today;
      if (rec.how === 'manual') {
        rec.mp = String(rec.mp || '').toUpperCase();
        if (!staff.some(s => String(s.code).toUpperCase() === rec.mp)) throw new Error('ไม่พบรหัสนักฟิสิกส์ ' + rec.mp);
      } else if (rec.how === 'follow' && out.length) {
        rec.mp = out[0].mp;
      } else {
        rec.how = 'auto';
        rec.mp = pickNext_({
          staff: staff, leaves: leaves, date: date, byDay: byDay,
          cases: cases.filter(c => c.cat === rec.cat),
          pointer: (cfg.queue || {})[rec.cat] || null,
        });
      }
      if (!rec.mp) throw new Error((cat ? cat.label + ': ' : '') + 'ไม่มีนักฟิสิกส์ที่รับเคสได้ในวันนั้น (ลาหรือปิดการปฏิบัติงานทุกคน)');
      rec.id = rec.id || Utilities.getUuid();
      rec.in = date;
      rec.created = new Date().toISOString();
      cases.push(rec);
      out.push(rec);
    });
    const sh = tableSheet_(ss, 'cases');
    const header = headerOf_(sh);
    out.forEach(rec => writeFields_(sh, sh.getLastRow() + 1, header, TABLES.cases.fields, rec));
    return out;
  });
}

function addCase(rec, token) {
  return addCases([rec], token)[0];
}

/*
 * คิวหมุนเวียนของแต่ละเทคนิค (โค้ดชุดเดียวกับ pickNext ใน index.html)
 * - แจกอัตโนมัติ: ไปที่คนถัดจากคนที่ได้เคสอัตโนมัติล่าสุด ตามลำดับทีม JR → WM → NY → WS
 * - แจกเอง (how = 'manual') หรือตามเทคนิคแรก (how = 'follow'): คิวไม่ขยับ แต่คนที่ได้ไปจะถูกข้าม 1 ครั้งเมื่อคิววนมาถึง
 * - ข้ามคนที่ลาในวันนั้นหรือปิด "ปฏิบัติงาน" (เคสเลือกเองที่ค้างยังรออยู่)
 * - byDay: เคสวันเดียวกันให้คนเดิม (Brachy/Hyperthermia) วันใหม่จึงวนต่อ
 * - pointer: ตำแหน่งคิวที่ตั้งเองในหน้าตั้งค่า มีผลกับเคสที่แจกหลังจากนั้น
 */
function pickNext_(o, trace) {
  const staff = o.staff, n = staff.length;
  if (!n) return '';
  const idx = code => staff.findIndex(s => s.code === code);
  const away = (code, day) => o.leaves.some(l => l.mp === code && l.from <= day && day <= (l.to || l.from));
  const free = (i, day) => staff[i].active !== false && !away(staff[i].code, day);
  // เดินคิวจาก start: ข้ามคนที่ไม่ว่างวันนั้น และหักเคสเลือกเองที่ค้างอยู่ทีละ 1
  const select = (start, day, cr, skipped) => {
    let limit = n;
    Object.keys(cr).forEach(k => { limit += n * cr[k]; });
    for (let step = 0; step < limit; step++) {
      const i = (start + step) % n, code = staff[i].code;
      if (!free(i, day)) { if (skipped && step < n) skipped.push({ code: code, why: 'away' }); continue; }
      if (cr[code] > 0) { cr[code]--; if (skipped) skipped.push({ code: code, why: 'manual' }); continue; }
      return i;
    }
    return -1;
  };
  const pointer = o.pointer && idx(o.pointer.code) >= 0 ? o.pointer : null;
  const credit = {};
  let p = 0, lastAuto = null, pointerDone = !pointer;
  const list = o.cases.slice().sort((a, b) => (a.created < b.created ? -1 : a.created > b.created ? 1 : 0));
  list.forEach(c => {
    if (!pointerDone && c.created >= pointer.at) { p = idx(pointer.code); pointerDone = true; lastAuto = null; }
    const j = idx(c.mp);
    if (j < 0) return;
    if (c.how === 'manual' || c.how === 'follow') { credit[c.mp] = (credit[c.mp] || 0) + 1; return; }
    const trial = Object.assign({}, credit);
    if (select(p, c.in, trial) === j) Object.assign(credit, trial);
    p = (j + 1) % n;
    lastAuto = c;
  });
  if (!pointerDone) { p = idx(pointer.code); lastAuto = null; }
  if (trace) { trace.start = staff[p].code; trace.credit = Object.assign({}, credit); trace.skipped = []; }
  if (o.byDay && lastAuto && lastAuto.in === o.date && free(idx(lastAuto.mp), o.date)) return lastAuto.mp;
  const i = select(p, o.date, credit, trace ? trace.skipped : null);
  return i < 0 ? '' : staff[i].code;
}

function deleteRecord(table, id, token) {
  requireEdit_(token);
  tableDef_(table);
  return withLock_(() => {
    const sh = tableSheet_(SpreadsheetApp.getActive(), table);
    const row = findRow_(sh, headerOf_(sh).indexOf('id') + 1, id);
    if (row) sh.deleteRow(row);
    return !!row;
  });
}

function saveConfig(config, token) {
  const u = who_(token);
  if (!u.isAdmin) throw new Error('แก้การตั้งค่าได้เฉพาะแอดมิน' + (u.name ? ' (' + u.name + ' ไม่ใช่แอดมิน)' : ''));
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
// แท็บที่มีสองตารางคู่กัน: ตารางซ้าย, ตารางขวา (นำเข้าเป็นกิจกรรมนับครั้งในแถบ Brachytherapy / Hyperthermia)
const LEGACY_PAIR_SHEETS = [['Brachy', 'brachy', 'brachyn'], ['Hyper', 'hyper', 'p2h']];
// เดิมเป็นเทคนิคแจกตามคิว ตอนนี้เป็นกิจกรรมนับครั้ง (ใช้รหัสเดิมเป็นประเภทกิจกรรม)
const MOVED_CATS = ['brachy', 'brachyn', 'p2h', 'hyper'];
const LEGACY_HEADERS = {
  'CT-Sim': 'ct', 'In': 'in', 'Sim': 'sim', 'Finish': 'fin', 'Evaluate': 'eval', 'Type': 'type',
  'HN': 'hn', 'Name': 'name', 'Doc': 'doc', 'Aim': 'aim', 'Technique': 'tech', 'Note': 'note',
};

function importLegacy() {
  const ss = SpreadsheetApp.getActive();
  requireAdmin_(ss);
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
        out.logs.push({
          id: key(name, cat, r + 1, hn, d), kind: cat, date: d, mp: text(row[c0 + 3]).toUpperCase(), hn: hn,
          name: text(row[c0 + 2]), caseId: '', title: '', min: '', k: '', note: text(row[c0 + 4]), created: stamp(d, r), updated: '',
        });
      }
    });
  });

  // RC = Quality Checklist ผูกกับแผนของ HN เดียวกันที่ In ล่าสุดไม่เกินวัน RC
  const linkCase = (hn, d) => {
    let best = null;
    out.cases.forEach(c => {
      if (c.hn !== hn) return;
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

/**
 * ย้ายเคส Brachy / Hyperthermia ที่บันทึกไว้แบบเดิม (แท็บ Cases) ไปเป็นกิจกรรมในแท็บ Logs ครั้งเดียว
 * ใช้ id เดิม จึงรันซ้ำหรือนำเข้าซ้ำได้โดยไม่เกิดรายการซ้ำ คืนจำนวนที่ย้าย
 */
function moveActCases(token) {
  requireEdit_(token);
  return withLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const old = readTable_(ss, 'cases').filter(c => MOVED_CATS.indexOf(c.cat) >= 0);
    if (!old.length) return 0;
    appendNew_(ss, 'logs', old.map(c => ({
      id: c.id, kind: c.cat, date: c.in, mp: c.mp, hn: c.hn, name: c.name, caseId: '', title: '', min: '', k: '',
      note: c.note, created: c.created, updated: new Date().toISOString(),
    })));
    const sh = tableSheet_(ss, 'cases');
    const idCol = headerOf_(sh).indexOf('id') + 1;
    old.map(c => findRow_(sh, idCol, c.id)).filter(r => r > 0).sort((a, b) => b - a).forEach(r => sh.deleteRow(r));
    return old.length;
  });
}

/* ---------- ผู้ใช้: บัญชี LPCH RO Workspace หรือบัญชี Google ---------- */

/**
 * ผู้ใช้ของคำขอนี้ {via, name, username, role, me, owner, canEdit, isAdmin, lpchAdmin}
 * - เปิดลิงก์ LPCH (มี token): บันทึกได้เฉพาะ LPCH_EDIT_ROLES · แก้การตั้งค่าได้ถ้าเป็น MP และเป็นแอดมินของ LPCH หรืออยู่ในรายชื่อแอดมิน
 * - บัญชี Google ที่เป็นเจ้าของไฟล์หรือแอดมิน (เช่นเปิดจากเมนูในชีต): ทำได้ทุกอย่าง
 * - ปิด LPCH (LPCH_URL = -): ใช้บัญชี Google อย่างเดียวแบบเดิม
 * ยังไม่ได้เข้าสู่ระบบ → Error ที่ขึ้นต้นด้วย LOGIN| หน้าเว็บจะแสดงช่องเข้าสู่ระบบ
 */
function who_(token, ss, cfg) {
  ss = ss || SpreadsheetApp.getActive();
  cfg = cfg || readConfig_(ss) || {};
  const g = adminInfo_(ss, cfg);
  const google = { via: 'google', name: g.me, username: '', role: '', me: g.me, owner: g.owner, canEdit: true, isAdmin: g.isAdmin, lpchAdmin: false };
  if (!lpchUrl_()) return google;
  // เปิด LPCH แล้ว: บัญชี Google ข้ามการเข้าสู่ระบบได้เฉพาะเจ้าของไฟล์หรืออีเมลที่อยู่ในรายชื่อแอดมิน
  const googleAdmin = !!g.me && (g.me === g.owner || adminList_(cfg).indexOf(g.me) >= 0);
  let why = '';   // ไม่มี token = เพิ่งเปิดหน้า: แสดงช่องเข้าสู่ระบบเฉย ๆ ไม่ต้องมีข้อความเตือน
  if (token) {
    const p = lpchUser_(token);
    if (!p.error) {
      const admins = adminList_(cfg);
      const listed = (!!p.email && admins.indexOf(p.email) >= 0) || admins.indexOf(p.username) >= 0;
      return { via: 'lpch', name: p.name, username: p.username, role: p.role, me: p.email, owner: g.owner,
        canEdit: p.canEdit, isAdmin: p.canEdit && (p.lpchAdmin || listed), lpchAdmin: p.lpchAdmin };
    }
    why = p.error;
  }
  if (googleAdmin) return Object.assign(google, { isAdmin: true });
  throw new Error('LOGIN|' + why);
}

function requireEdit_(token) {
  const u = who_(token);
  if (!u.canEdit) throw new Error('บันทึกข้อมูลได้เฉพาะนักฟิสิกส์การแพทย์ (' + LPCH_EDIT_ROLES.join(', ') + ') · บัญชี ' + u.username + ' (' + u.role + ') ดูได้อย่างเดียว');
  return u;
}

function lpchUrl_() {
  let v = null;
  try { v = PropertiesService.getScriptProperties().getProperty('LPCH_URL'); } catch (e) { v = null; }
  v = String(v == null || v === '' ? LPCH_URL : v).trim();
  return v === '-' ? '' : v;
}

// เรียก API ของ LPCH RO Workspace (doPost) หนึ่งครั้ง โยนข้อความผิดพลาดของ LPCH ต่อ
function lpchCall_(req) {
  const url = lpchUrl_();
  if (!url) throw new Error('ยังไม่ได้เชื่อมกับ LPCH RO Workspace (ตั้ง Script property LPCH_URL)');
  const res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(req), muteHttpExceptions: true });
  let out = null;
  try { out = JSON.parse(res.getContentText('UTF-8')); } catch (e) { out = null; }
  if (!out) throw new Error('เชื่อมต่อ LPCH RO Workspace ไม่ได้ (HTTP ' + res.getResponseCode() + ') ผู้ดูแล: ตรวจ LPCH_URL และ Deploy ของ LPCH แบบ Who has access: Anyone');
  if (!out.ok) throw new Error(out.error || 'LPCH RO Workspace ตอบกลับไม่สำเร็จ');
  return out;
}

// สมาชิก LPCH ที่ใช้งานอยู่ทุกคนดูได้ บันทึกได้เฉพาะ LPCH_EDIT_ROLES
function lpchProfile_(u) {
  if (!u || !u.username) return { error: 'ไม่พบบัญชี LPCH RO Workspace' };
  const role = String(u.role || '');
  return {
    username: String(u.username), name: String(u.fullName || u.username), role: role,
    email: String(u.email || '').trim().toLowerCase(),
    lpchAdmin: u.isAdmin === true || String(u.isAdmin).toUpperCase() === 'TRUE',
    canEdit: LPCH_EDIT_ROLES.indexOf(role) >= 0,
  };
}

// สมาชิกเจ้าของ token (ถาม LPCH ด้วยคำสั่ง me) เก็บผลไว้ LPCH_CHECK_SECONDS ระงับบัญชีใน LPCH ก็ใช้ที่นี่ไม่ได้ด้วย
function lpchUser_(token) {
  token = String(token || '');
  if (!/^[\w-]{20,200}$/.test(token)) return { error: 'การเข้าสู่ระบบไม่ถูกต้อง กรุณาเข้าสู่ระบบอีกครั้ง' };
  const cache = CacheService.getScriptCache(), key = 'lpch_' + token;
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  let p;
  try { p = lpchProfile_(lpchCall_({ action: 'me', token: token }).user); } catch (e) {
    if (e.message !== 'session_expired') throw e;   // LPCH ติดต่อไม่ได้: แจ้งตามจริง ไม่ออกจากระบบ
    p = { error: 'การเข้าสู่ระบบด้วยบัญชี LPCH หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' };
  }
  cache.put(key, JSON.stringify(p), LPCH_CHECK_SECONDS);
  return p;
}

// ผลการเข้าสู่ระบบของ LPCH ({token, user}) → {token, ...สมาชิก}
function lpchFinish_(out) {
  const p = lpchProfile_(out.user);
  if (p.error) throw new Error(p.error);
  CacheService.getScriptCache().put('lpch_' + out.token, JSON.stringify(p), LPCH_CHECK_SECONDS);
  return Object.assign({ token: out.token }, p);
}

// ช่องเข้าสู่ระบบในหน้าเว็บ: ชื่อผู้ใช้ (หรืออีเมล) และรหัสผ่านตรวจที่ LPCH ไม่เก็บที่นี่
function lpchLogin(username, password) {
  return lpchFinish_(lpchCall_({ action: 'login', username: String(username || ''), password: String(password || '') }));
}

function lpchLogout(token) {
  if (!token) return true;
  CacheService.getScriptCache().remove('lpch_' + token);
  try { lpchCall_({ action: 'logout', token: String(token) }); } catch (e) { /* ปล่อยให้หมดอายุเอง */ }
  return true;
}

/**
 * รันจากหน้าแก้ไขสคริปต์ (เลือก checkSetup แล้วกดเรียกใช้): ตรวจทุกอย่างที่หน้าเว็บต้องใช้ และขออนุญาตสิทธิ์ที่ยังขาด
 * ดูผลที่ "บันทึกการทำงาน" แล้ว Deploy → จัดการการทำให้ใช้งานได้ → แก้ไข → เวอร์ชันใหม่ ให้ URL เดิมใช้โค้ดนี้
 */
function checkSetup() {
  const out = ['Code.gs รุ่น ' + CODE_VERSION + ' (API ' + API_LEVEL + ')'];
  const url = pageUrl_();
  if (!url) out.push('• หน้าเว็บ: ใช้ไฟล์ index ในโปรเจกต์ (PAGE_URL = -)');
  else {
    const p = page_(true);
    const v = (/const PAGE_VERSION = '([^']+)'/.exec(p.html) || [])[1] || 'ไม่ทราบ';
    out.push(p.source === 'github' ? '✓ หน้าเว็บ: โหลดจาก GitHub ได้ รุ่น ' + v
      : '✗ หน้าเว็บ: โหลดจาก GitHub ไม่ได้ (' + p.why + ') ' + (p.source === 'file' ? 'ใช้ไฟล์ index ในโปรเจกต์ รุ่น ' + v : 'และไม่มีไฟล์ index'));
  }
  out.push(setupLpch());
  try { out.push('• ชีต: ' + SpreadsheetApp.getActive().getName() + ' · เคส ' + readTable_(SpreadsheetApp.getActive(), 'cases').length + ' รายการ'); } catch (e) { out.push('✗ ชีต: ' + e.message); }
  out.push('ขั้นต่อไป: Deploy → จัดการการทำให้ใช้งานได้ → แก้ไข (ดินสอ) → เวอร์ชัน: เวอร์ชันใหม่ → ทำให้ใช้งานได้');
  out.push('(อย่ากด "การทำให้ใช้งานได้รายการใหม่" เพราะจะได้ URL ใหม่ ลิงก์เดิมและปุ่มใน LPCH ยังเปิดรุ่นเก่า)');
  out.push('เปิดระบบแล้วดูบรรทัดล่างสุดของหน้า ต้องเป็น "โหลดจาก GitHub · Code.gs รุ่น ' + CODE_VERSION + '"');
  out.forEach(l => Logger.log(l));
  return out.join('\n');
}

// รันจากหน้าแก้ไขสคริปต์: ตั้ง LPCH_URL แล้ว เชื่อมต่อได้ และ LPCH รองรับการใช้บัญชีร่วมกันหรือยัง
function setupLpch() {
  const url = lpchUrl_();
  let msg;
  if (!url) msg = '✗ ปิดการเชื่อม LPCH อยู่ (LPCH_URL = -) ใช้บัญชี Google อย่างเดียว';
  else if (!/^https:\/\/script\.google\.com\/(a\/[^\/]+\/)?macros\/s\/[\w-]+\/(exec|dev)$/.test(url)) msg = '✗ LPCH_URL ต้องเป็น https://script.google.com/macros/s/…/exec (ตอนนี้: ' + url + ')';
  else {
    try { lpchCall_({ action: 'ssoRedeem', ticket: 'check' }); msg = '✓ เชื่อมต่อ LPCH RO Workspace ได้'; } catch (e) {
      msg = /หมดอายุ|ถูกใช้ไปแล้ว/.test(e.message) ? '✓ เชื่อมต่อ LPCH RO Workspace ได้ และรองรับการใช้บัญชีร่วมกันแล้ว'
        : /ไม่รู้จักคำสั่ง/.test(e.message) ? '✗ LPCH RO Workspace ยังเป็น Code.gs เวอร์ชันเก่า: วาง Code.gs ใหม่แล้ว Deploy → New version'
        : '✗ ' + e.message;
    }
  }
  Logger.log('LPCH_URL = ' + (url || '(ปิด)'));
  Logger.log(msg);
  Logger.log('Deploy: Execute as "Me" · Who has access "Anyone" · บันทึกได้เฉพาะ ' + LPCH_EDIT_ROLES.join(', ') + ' คนอื่นดูได้อย่างเดียว');
  return 'LPCH: ' + msg;
}

/* ---------- แอดมิน ---------- */

function adminList_(cfg) {
  return ((cfg && cfg.admins) || []).map(x => String(x).toLowerCase().trim()).filter(Boolean);
}

// เจ้าของไฟล์เป็นแอดมินเสมอ และเพิ่มอีเมลแอดมินได้ใน Config (admins)
// ถ้ายังไม่มีรายชื่อแอดมินและหาเจ้าของไฟล์ไม่ได้ (เช่นไฟล์ใน Shared drive) ทุกคนแก้ได้จนกว่าจะตั้งแอดมิน
function adminInfo_(ss, cfg) {
  let me = '', owner = '';
  try { me = String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) { /* ไม่ทราบอีเมล */ }
  try { const o = ss.getOwner(); owner = o ? String(o.getEmail() || '').toLowerCase() : ''; } catch (e) { /* ไม่ทราบเจ้าของ */ }
  const admins = adminList_(cfg);
  const isAdmin = (!!me && (me === owner || admins.indexOf(me) >= 0)) || (!admins.length && !owner);
  return { me: me, owner: owner, isAdmin: isAdmin };
}

function requireAdmin_(ss) {
  const info = adminInfo_(ss, readConfig_(ss));
  if (!info.isAdmin) throw new Error('แก้การตั้งค่าได้เฉพาะแอดมิน' + (info.me ? ' (' + info.me + ' ไม่ใช่แอดมิน)' : ''));
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

// เขียนชีตทีละคน (ล็อกเดียวทั้งสคริปต์ ทุกผู้ใช้ใช้ร่วมกัน) รอคิวได้ไม่เกิน 20 วินาที
// flush ก่อนปล่อยล็อก ให้คนถัดไปอ่านข้อมูลที่เพิ่งเขียนเสมอ (เช่น แจกเคสพร้อมกันจะไม่ได้คนเดียวกัน)
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('มีคนกำลังบันทึกข้อมูลอยู่ รอสักครู่แล้วลองใหม่');
  try {
    return fn();
  } finally {
    try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); }
  }
}
