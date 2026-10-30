/**
 * Treatment Planning Management (ระบบกระจายงานฟิสิกส์การแพทย์) — ส่วนหลังบ้าน (Google Apps Script)
 * กลุ่มงานรังสีรักษา โรงพยาบาลมะเร็งลำปาง
 *
 * เก็บข้อมูลในแท็บ Cases, Logs และ Config ของ Google Sheet ที่ผูกสคริปต์นี้ไว้ (เปิดจากชีต → ส่วนขยาย → Apps Script)
 * ถ้าเป็นโปรเจกต์ Apps Script แยก (ไม่ได้ผูกชีต) ใช้ชีตใน Script property SHEET_ID (ID หรือลิงก์ของชีต)
 * ถ้ายังไม่ได้ตั้ง จะสร้างชีตเก็บข้อมูลใหม่ให้ครั้งแรกแล้วจำไว้ใน SHEET_ID (รัน checkSetup เพื่อดูลิงก์ชีต)
 * แท็บเดิมของไฟล์ P4P_Physics จะไม่ถูกแก้ไข (อ่านอย่างเดียวตอนนำเข้า)
 * วิธีติดตั้งอยู่ใน README.md
 *
 * บัญชี LPCH RO Workspace: เข้าสู่ระบบด้วยบัญชีเดียวกับ LPCH (กดจากปุ่มในหน้า LPCH จะมีบัตรผ่าน ?sso=… หรือกรอกชื่อผู้ใช้
 * และรหัสผ่าน LPCH ที่หน้าแรก รหัสผ่านตรวจที่ LPCH ไม่เก็บที่นี่) ทุกคำขอตรวจบัญชีกับ LPCH (เก็บผลไว้ LPCH_CHECK_SECONDS)
 * บันทึกข้อมูลได้เฉพาะตำแหน่งใน LPCH_EDIT_ROLES (MP) คนอื่นดูได้อย่างเดียว
 * Deploy แบบ Execute as: Me · Who has access: Anyone แล้วรันฟังก์ชัน setupLpch เพื่อทดสอบการเชื่อมต่อ
 * เปิดจากเมนูในชีตด้วยบัญชี Google ของเจ้าของไฟล์หรือแอดมินได้เหมือนเดิม
 */

const APP_TITLE = 'Treatment Planning Management';   // ชื่อเริ่มต้น · แอดมินเปลี่ยนได้ที่ ตั้งค่า (Config appName)
// URL /exec ของ LPCH RO Workspace (เปลี่ยนได้ที่ Script property LPCH_URL · ใส่ - เพื่อปิดและใช้บัญชี Google อย่างเดียว)
const LPCH_URL = 'https://script.google.com/macros/s/AKfycbwBVKgsqip8pavg0H-ibZFcR-9petxW12W3A8eNkO5CI8swiRIk347QMh42JryQJ_k/exec';
const LPCH_EDIT_ROLES = ['MP'];   // ตำแหน่งใน LPCH ที่บันทึกได้ทุกแถบตั้งต้น (แอดมินปรับรายแถบได้ที่ ตั้งค่า → แถบเมนู)
const LPCH_ROLES = ['RO', 'MP', 'RTT', 'Nurse', 'Other'];   // ตำแหน่งใน LPCH RO Workspace (ดึงเพิ่มได้จากรายชื่อสมาชิก)
const LPCH_CHECK_SECONDS = 300;
// หน้าเว็บ (index.html) โหลดจาก GitHub อัตโนมัติ จึงได้หน้าเว็บรุ่นล่าสุดเสมอ ไม่ต้องวางไฟล์ index ใหม่ทุกครั้ง
// เปลี่ยนได้ที่ Script property PAGE_URL · ใส่ - เพื่อใช้ไฟล์ index ในโปรเจกต์ · เปิด …/exec?refresh=1 เพื่อโหลดรุ่นล่าสุดทันที
// โหลดไม่ได้ (หรือไฟล์ไม่ครบ) จะใช้ไฟล์ index ในโปรเจกต์แทน
const PAGE_URL = 'https://raw.githubusercontent.com/nattayee/nattayee/refs/heads/claude/vigilant-bardeen-py5nxb/medphys/index.html';
const PAGE_CACHE_SECONDS = 600;
// รุ่นของไฟล์นี้ (แสดงที่บรรทัดล่างสุดของหน้าเว็บ) และรุ่นของ API ที่หน้าเว็บใช้ตรวจว่า Code.gs ใหม่พอหรือไม่
const CODE_VERSION = '2026-10-30.2';
const API_LEVEL = 40;
// หน้าเว็บที่เปิดจากเมนูในชีต (บัญชี Google) ส่งค่านี้แทน token
const SHEET_DIALOG = 'sheet-dialog';
const CONFIG_SHEET = 'Config';
const TABLES = {
  cases: {
    sheet: 'Cases',
    fields: [
      ['id', 'id'], ['cat', 'หมวด'], ['mp', 'MP'], ['how', 'วิธีแจก'], ['n', 'จำนวนครั้ง'], ['ct', 'CT-Sim'], ['in', 'In'], ['sim', 'Sim'],
      ['fin', 'Finish'], ['eval', 'Evaluate'],
      // ปุ่มบันทึกขั้นตอน: วันเวลา คนกด และค่า (Dose check, F0, Delta4, SRS MapCheck) เขียนผ่าน stampCase เท่านั้น · Plan complete ไม่มีค่า
      ['finBy', 'Finish โดย'], ['evalBy', 'Evaluate โดย'],
      ['mu', 'Dose check'], ['muBy', 'Dose check โดย'], ['muVal', 'Dose check ค่า'],
      ['d0', 'F0'], ['d0By', 'F0 โดย'], ['d0Val', 'F0 ค่า'],
      ['d4', 'Delta4'], ['d4By', 'Delta4 โดย'], ['d4Val', 'Delta4 ค่า'],
      ['mc', 'SRS MapCheck'], ['mcBy', 'SRS MapCheck โดย'], ['mcVal', 'SRS MapCheck ค่า'],
      // หมายเหตุของค่า (ใส่ตอนบันทึกค่า ไม่บังคับ)
      ['muNote', 'Dose check หมายเหตุ'], ['d0Note', 'F0 หมายเหตุ'], ['d4Note', 'Delta4 หมายเหตุ'], ['mcNote', 'SRS MapCheck หมายเหตุ'],
      ['pc', 'Plan complete'], ['pcBy', 'Plan complete โดย'],
      // จบการฉาย (แถบ Complete): complete = Complete course · cancel = Cancel RT (ต้องมีสาเหตุ) · เขียนผ่าน courseCase เท่านั้น
      ['rt', 'สถานะการฉาย'], ['rtDate', 'วันที่จบการฉาย'], ['rtAt', 'สถานะการฉาย เมื่อ'], ['rtBy', 'สถานะการฉาย โดย'], ['rtNote', 'สาเหตุ / หมายเหตุการฉาย'],
      // สถานะรายวันของ fraction (Hold, HV, Re-CT, Off RT ฯลฯ) [{date, type, label, act, back, reason, note, by, at}] (JSON) · เขียนผ่าน fractionCase เท่านั้น
      ['fxlog', 'สถานะ fraction'],
      // รายละเอียดผู้ป่วยหลัง HN ในตารางวันฉาย เช่น "NPO, BD protocol" · เขียนผ่าน tagCase เท่านั้น
      ['ptags', 'รายละเอียดผู้ป่วย'],
      // ย้ายห้องฉาย [{date, room, from, scope, note, by, at}] (JSON) · scope: once = เฉพาะ fraction วันนั้น · on = ตั้งแต่วันนั้นเป็นต้นไป · เขียนผ่าน moveCase เท่านั้น
      ['rmove', 'ย้ายห้อง'],
      // ปุ่มขั้นตอนของแผน Sequential boost แต่ละบริเวณ { sid: { fin, finBy, eval, ..., muVal, muNote } } (JSON) · เขียนผ่าน stampBoost เท่านั้น
      ['bsteps', 'ขั้นตอนของ boost'],
      // เวลานัดฉายใน Mosaiq (HH:MM) ช่องหน้า HN ในตารางวันฉาย · เขียนผ่าน timeCase เท่านั้น
      ['mqt', 'Mosaiq Time'],
      // เพิ่ม fraction (บันทึกที่ fraction สุดท้ายของคอร์ส) [{date, n, reason, by, at}] (JSON) · ฉายต่อจากวันสุดท้าย · เขียนผ่าน addFxCase เท่านั้น
      ['fxadd', 'เพิ่ม fraction'],
      // งานวางแผนใหม่ที่ระบบสร้างให้ MP คนเดิม (Re-CT, ย้ายห้อง ฯลฯ) { of: id ของเคสเดิม, date, kind, label, reason } (JSON) · เขียนผ่าน replanCase เท่านั้น
      ['replan', 'งานวางแผนใหม่ (จาก)'],
      // วิธีแจก (how): auto · manual · follow · replan (งานวางแผนใหม่) · direct = ผู้ป่วยที่เพิ่มในแถบห้องฉาย ไม่แจกงานให้ MP (courseAdd)
      ['type', 'Type'], ['hn', 'HN'], ['name', 'Name'],
      ['icd', 'ICD-10'], ['dx', 'Diagnosis'], ['doc', 'Doc'], ['aim', 'Aim'], ['tech', 'Technique'], ['room', 'ห้องฉาย'],
      ['dpf', 'Dose/fx (Gy)'], ['fx', 'Fx'], ['rx', 'Prescription (Gy)'], ['freq', 'ความถี่'], ['area', 'บริเวณที่ฉาย'],
      ['sites', 'บริเวณเพิ่มเติม'],   // ฉายหลายที่: บริเวณที่ 2 เป็นต้นไป [{area, dpf, fx, freq}] (JSON)
      ['batch', 'ชุด'], ['note', 'Note'],
      ['created', 'Created'], ['updated', 'Updated'],
    ],
  },
  logs: {
    sheet: 'Logs',
    fields: [
      ['id', 'id'], ['kind', 'ประเภท'], ['date', 'Date'], ['mp', 'MP'], ['hn', 'HN'], ['name', 'Name'],
      ['caseId', 'เคส (id)'], ['title', 'กิจกรรม'], ['min', 'เวลา'], ['k', 'k'], ['note', 'Note'],
      ['created', 'Created'], ['updated', 'Updated'],
      ['src', 'ที่มา'],   // brachy:<รหัสนัด>:plan|rc = ดึงจากระบบนัด Brachytherapy (ว่าง = บันทึกเอง)
    ],
  },
  leaves: {
    sheet: 'Leaves',
    fields: [['id', 'id'], ['mp', 'MP'], ['from', 'ตั้งแต่'], ['to', 'ถึง'], ['note', 'Note'], ['created', 'Created'], ['updated', 'Updated']],
  },
  // ผู้ปฏิบัติงานประจำวันในตารางวันฉาย: id = วันที่|ห้อง · RTT / RA = ชื่อคั่นด้วยจุลภาค · เขียนผ่าน dutyDay เท่านั้น
  duty: {
    sheet: 'Duty',
    fields: [['id', 'id'], ['date', 'วันที่'], ['room', 'ห้องฉาย'], ['rtt', 'RTT'], ['ra', 'RA'], ['qc', 'QC'], ['by', 'บันทึกโดย'], ['at', 'บันทึกเมื่อ']],
  },
  // แถบ CT-SIM: ผู้ป่วยที่ทำ CT จำลองการฉาย แยกเครื่อง (ct = รหัสเครื่องใน ตั้งค่า) · ข้อมูลแบบฟอร์มแจกเคส + อุปกรณ์ในห้อง CT
  // send = ส่งให้แถบงาน · took = id ของเคสที่ MP แจกจากรายการนี้ (หรือ skip = ไม่ต้องแจก) · เขียนผ่าน ctSave / ctMark / addCases เท่านั้น
  ctsim: {
    sheet: 'CTSim',
    fields: [
      ['id', 'id'], ['ct', 'เครื่อง CT'], ['date', 'วันที่'], ['hn', 'HN'], ['name', 'Name'],
      ['organ', 'Organ'], ['mask', 'Mask'], ['bite', 'bitelock'], ['cm', 'CM'], ['coil', 'Coil'], ['ydev', 'Y'], ['inj', 'Syring Injector'], ['nss', 'Normal Saline'], ['syr', 'Syring 50cc'],
      ['doc', 'แพทย์'], ['pstat', 'สถานะ'], ['hdr', 'HDR'], ['crad', 'C-RAD'], ['note', 'Note'], ['research', 'เคสวิจัย'],
      ['cats', 'เทคนิค'], ['type', 'Type'], ['aim', 'Aim'], ['room', 'ห้องฉาย'], ['tech', 'Technique'], ['area', 'บริเวณที่ฉาย'],
      ['dpf', 'Dose/fx (Gy)'], ['fx', 'Fx'], ['rx', 'Prescription (Gy)'], ['freq', 'ความถี่'], ['sim', 'Start RT'], ['icd', 'ICD-10'], ['dx', 'Diagnosis'], ['extra', 'หัวข้อเพิ่มเติม'],
      ['send', 'ส่งแถบงาน'], ['took', 'แจกเคสแล้ว (id)'], ['tookBy', 'แจกเคสโดย'], ['tookAt', 'แจกเคสเมื่อ'],
      ['by', 'บันทึกโดย'], ['created', 'Created'], ['updated', 'Updated'],
    ],
  },
  // แถบลงทะเบียน: ผู้ป่วยที่ลงทะเบียน (HN ไม่ซ้ำ · HN คำนำหน้า ชื่อ-สกุล บังคับตาม ตั้งค่า → ลงทะเบียน) · birth = วันเกิด (YYYY-MM-DD) · sex = เพศ (ตัวเลือก Gender ของใบสั่ง)
  // แถบลงนัดดึงไปใช้ (ชื่อ อายุ เพศ แพทย์ Diag) · เขียนผ่าน regSave / regRemove เท่านั้น · รุ่น 2026-10-30.1 เก็บชื่อและสกุลแยกคอลัมน์ (อ่านใน regRows_)
  reg: {
    sheet: 'Registry',
    fields: [
      ['id', 'id'], ['hn', 'HN'], ['title', 'คำนำหน้า'], ['name', 'ชื่อ-สกุล'], ['sex', 'เพศ'], ['birth', 'วันเกิด'], ['phone', 'เบอร์โทร'], ['right', 'สิทธิการรักษา'],
      ['doc', 'แพทย์'], ['icd', 'ICD-10'], ['dx', 'Diagnosis'], ['note', 'Note'], ['by', 'บันทึกโดย'], ['created', 'Created'], ['updated', 'Updated'],
    ],
  },
  // แถบลงนัด: นัดทำ CT-Sim (date) และ Start RT ของผู้ป่วย · CT = CM / Non-CM · special = เทคนิคพิเศษ (SRS, SRT, SBRT, DIBH คั่นด้วยจุลภาค)
  // took = id ของรายการ CT-SIM ที่ลงจากนัดนี้ (หรือ skip = ไม่มาทำ CT) · เขียนผ่าน apptSave / apptMark / ctSave เท่านั้น
  appt: {
    sheet: 'Appts',
    fields: [
      ['id', 'id'], ['date', 'นัด CT-Sim'], ['hn', 'HN'], ['name', 'Name'], ['cm', 'CT'], ['special', 'เทคนิคพิเศษ'],
      ['dpf', 'Dose/fx (Gy)'], ['fx', 'Fx'], ['rx', 'Prescription (Gy)'], ['freq', 'ความถี่'], ['sim', 'Start RT'], ['ct', 'เครื่อง CT'], ['room', 'ห้องฉาย'],
      ['doc', 'แพทย์'], ['icd', 'ICD-10'], ['dx', 'Diagnosis'], ['note', 'Note'],
      ['order', 'ใบสั่ง CT Sim (JSON)'],
      ['took', 'ลง CT-SIM แล้ว (id)'], ['tookBy', 'ลง CT-SIM โดย'], ['tookAt', 'ลง CT-SIM เมื่อ'],
      ['by', 'บันทึกโดย'], ['created', 'Created'], ['updated', 'Updated'],
    ],
  },
  // แถบ RTT/RA Jobs: ภาระงานรายเดือนของแต่ละคน (id = ชื่อไม่มีคำนำหน้า|YYYY-MM) · งานห้องฉาย/CT ระบบคำนวณจากผู้ปฏิบัติงานประจำวัน
  // เก็บเฉพาะช่องที่กรอกเองหรือแก้ (cells = { แถวในแบบฟอร์ม: { วันที่: ค่า } }) · วันลา · ตำแหน่ง/แต้มประกันของเดือนนั้น · เขียนผ่าน jobsSave เท่านั้น
  jobs: {
    sheet: 'Jobs',
    fields: [
      ['id', 'id'], ['ym', 'เดือน'], ['who', 'ชื่อ'], ['user', 'บัญชี'], ['kind', 'แบบฟอร์ม'], ['prof', 'ตำแหน่ง (JSON)'],
      ['cells', 'ช่องที่กรอก/แก้ (JSON)'], ['leaves', 'วันลา (JSON)'], ['by', 'บันทึกโดย'], ['updated', 'Updated'],
    ],
  },
};
// ใช้เมื่อยังไม่เคยบันทึกการตั้งค่าจากหน้าเว็บ
const DEFAULT_STAFF = ['JR', 'WM', 'NY', 'WS'];
const DAY_ROTATE_CATS = ['brachy', 'brachyn', 'p2h', 'hyper'];

/* ---------- หน้าเว็บและเมนู ---------- */

function doGet(e) {
  const p = (e && e.parameter) || {};
  // …/exec?ping=1 ตรวจว่าลิงก์นี้รัน Code.gs รุ่นไหน (ไม่มีข้อมูลผู้ป่วย) ถ้าเห็นหน้าระบบแทน JSON แปลว่ายังเป็นรุ่นเก่า
  if (p.ping) {
    return ContentService.createTextOutput(JSON.stringify({ app: 'medphys-dispatch', codeVersion: CODE_VERSION, api: API_LEVEL,
      lpch: !!lpchUrl_(), page: pageUrl_() ? 'github' : 'file', sheet: sheetSource_(), clean: oldCode_().length === 0 }, null, 1)).setMimeType(ContentService.MimeType.JSON);
  }
  const page = page_(!!p.refresh);
  const vars = { MEDPHYS_PAGE_SOURCE: page.source };
  // กดจากปุ่มใน LPCH RO Workspace: บัตรผ่านใช้ได้ครั้งเดียว แลกเป็นการเข้าสู่ระบบที่นี่
  if (p.sso && lpchUrl_()) {
    try { vars.MEDPHYS_LPCH_TOKEN = String(lpchFinish_(lpchCall_({ action: 'ssoRedeem', ticket: String(p.sso) })).token); } catch (err) {
      vars.MEDPHYS_LPCH_ERROR = String(err.message);
    }
  }
  return HtmlService.createHtmlOutput(inject_(page.html, vars))
    .setTitle(appTitle_())
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
  const html = HtmlService.createHtmlOutput(inject_(page.html, { MEDPHYS_PAGE_SOURCE: page.source, MEDPHYS_SHEET_DIALOG: true })).setWidth(1200).setHeight(820);
  SpreadsheetApp.getUi().showModalDialog(html, appTitle_());
}

// ชื่อแท็บของเบราว์เซอร์ = ชื่อระบบที่แอดมินตั้ง (Config appName) · เก็บในแคช 6 ชั่วโมง บันทึกการตั้งค่าแล้วล้างแคช
// ยังไม่มีชีตข้อมูล: ใช้ชื่อเริ่มต้น (ไม่สร้างชีตตอนเปิดหน้าเว็บ)
function appTitle_() {
  try {
    const cache = CacheService.getScriptCache(), hit = cache.get('appName');
    if (hit) return hit;
    if (!SpreadsheetApp.getActive() && !sheetIdProp_()) return APP_TITLE;
    const cfg = readConfig_(ss_()) || {};
    const name = String(cfg.appName || '').trim().slice(0, 80) || APP_TITLE;
    cache.put('appName', name, 21600);
    return name;
  } catch (e) { return APP_TITLE; }
}

/* ---------- API ที่หน้าเว็บเรียกผ่าน google.script.run ---------- */

function getData(token) {
  const ss = ss_();
  const config = readConfig_(ss);
  const user = who_(token, ss, config);
  user.hasPin = !!pinRecord_(user);
  const need = guestNeeds_(user, config);
  return {
    user: user,
    api: API_LEVEL,
    codeVersion: CODE_VERSION,
    homeUrl: lpchUrl_(),
    cases: need.cases ? readTable_(ss, 'cases', config) : [],
    logs: need.logs ? readTable_(ss, 'logs') : [],
    leaves: need.leaves ? readTable_(ss, 'leaves') : [],
    duty: need.duty ? recentDuty_(ss) : [],
    ctsim: need.ctsim ? recentCt_(ss) : [],
    appt: need.appt ? recentAppt_(ss) : [],
    reg: need.reg ? regRows_(ss) : [],
    jobs: need.jobs ? jobsFor_(ss, user) : [],
    brachy: config && config.brachySync && (config.brachySync.on || user.isAdmin) ? brachyStatus_() : null,
    tdf: config && config.tdfSync && (config.tdfSync.on || user.isAdmin) ? extStatus_('tdf') : null,
    config: config,
    sheetUrl: ss.getUrl(),
  };
}

// ตำแหน่งอื่น (ดูอย่างเดียว) เห็นเฉพาะแถบที่แอดมินติ๊ก "ตำแหน่งอื่น" ใน ตั้งค่า → แถบเมนู
// ส่งเฉพาะตารางที่แถบเหล่านั้นใช้ (ไม่ได้เปิดแถบไหนเลย = ไม่ส่งข้อมูลผู้ป่วยและกิจกรรม) · MP ได้ทุกตาราง
const NAV_PREV = { queue: 'pend', course: 'queue', ctsim: 'course' };
const NAV_LIKE = { reg: 'appt', appt: 'ctsim', jobs: 'course' };   // แถบใหม่ที่การตั้งค่าเดิมยังไม่มี: ลงทะเบียน = สิทธิ์เท่าแถบลงนัด · ลงนัด = เท่าแถบ CT-SIM · RTT/RA Jobs = เท่าแถบห้องฉาย
// แถบลงนัดใช้เคสและรายการ CT-SIM นับจำนวนในปฏิทิน (วันนัด CT · Start RT) · ตารางวันฉาย (ห้องฉาย) แสดงนัดที่ยังไม่ลง CT-SIM
// แถบ RTT/RA Jobs ใช้เคส รายการ CT-SIM และผู้ปฏิบัติงานประจำวันคำนวณงานห้องฉาย/CT · ภาระงาน (jobs) ส่งเฉพาะของตัวเอง (แอดมินได้ทุกคน)
// แถบลงทะเบียนแสดงนัดของผู้ป่วย · แถบลงนัดดึงข้อมูลผู้ป่วยที่ลงทะเบียน
const GUEST_TABLES = { cases: ['work', 'pend', 'queue', 'course', 'dash', 'p4p', 'appt', 'jobs'], logs: ['work', 'pend', 'logs', 'p4p'], leaves: ['work', 'queue'], duty: ['course', 'ctsim', 'jobs'],
  ctsim: ['ctsim', 'work', 'appt', 'jobs'], appt: ['appt', 'ctsim', 'course', 'reg'], jobs: ['jobs'], reg: ['reg', 'appt'] };
function guestNeeds_(user, config) {
  const out = {};
  const seen = Object.keys(GUEST_TABLES).reduce((a, t) => a.concat(GUEST_TABLES[t]), []).filter(v => user.via === 'google' || navAccess_(config, v, user.role));
  Object.keys(GUEST_TABLES).forEach(t => { out[t] = GUEST_TABLES[t].some(v => seen.indexOf(v) >= 0); });
  return out;
}

/**
 * สิทธิ์ของตำแหน่ง (role ใน LPCH) ต่อแถบ: 'edit' = บันทึก/แก้ไขได้ · 'view' = ดูอย่างเดียว · '' = มองไม่เห็น
 * ตั้งที่ ตั้งค่า → แถบเมนู (config.nav[i].access[role]) · ตำแหน่งที่ยังไม่ได้ตั้ง: MP บันทึกได้ทุกแถบที่ "แสดง"
 * ตำแหน่งอื่นดูได้ถ้าติ๊ก "ตำแหน่งอื่น" (แบบเดิม) · แถบใหม่ที่การตั้งค่าเดิมยังไม่มี ทำตามแถบก่อนหน้า (NAV_PREV) หรือแถบที่ระบุ (NAV_LIKE) เหมือนหน้าเว็บ
 */
function navAccess_(config, view, role) {
  const nav = config && Array.isArray(config.nav) ? config.nav : [];
  const find = v => nav.filter(x => x && x.view === v)[0];
  let x = find(view);
  if (!x && NAV_LIKE[view]) return navAccess_(config, NAV_LIKE[view], role);
  if (!x) { let p = null; for (let v = view; !p && NAV_PREV[v]; v = NAV_PREV[v]) p = find(NAV_PREV[v]); x = { on: true, guest: p ? p.guest !== false : true }; }
  const acc = x.access && typeof x.access === 'object' ? x.access : null;
  if (acc && Object.prototype.hasOwnProperty.call(acc, role)) return acc[role] === 'edit' || acc[role] === 'view' ? acc[role] : '';
  if (x.on === false) return '';
  return LPCH_EDIT_ROLES.indexOf(role) >= 0 ? 'edit' : x.guest !== false ? 'view' : '';
}
// แถบที่ใช้แต่ละตาราง (สิทธิ์บันทึก = บันทึกได้อย่างน้อยหนึ่งแถบในนี้)
const EDIT_VIEWS = { cases: ['work', 'pend', 'queue'], logs: ['logs', 'work', 'pend'], leaves: ['work', 'queue'], course: ['course'], ctsim: ['ctsim'], appt: ['appt'], jobs: ['jobs'], reg: ['reg'] };

// ตารางที่เขียนผ่านฟังก์ชันของตัวเองเท่านั้น (ตรวจ PIN และสถานะการลง/แจก) ไม่ผ่าน saveRecord / deleteRecord
const OWN_WRITERS = ['ctsim', 'duty', 'appt', 'jobs', 'reg'];
function saveRecord(table, rec, token) {
  if (OWN_WRITERS.indexOf(table) >= 0) throw new Error('ตาราง ' + table + ' บันทึกผ่านแถบของตัวเองเท่านั้น');
  requireEdit_(token, EDIT_VIEWS[table]);
  tableDef_(table);
  if (!rec || !rec.id) throw new Error('ไม่มีรหัสรายการ');
  return withLock_(() => {
    const ss = ss_();
    const cfg = table === 'cases' ? readConfig_(ss) : null;   // หัวข้อเพิ่มเติมที่แอดมินตั้ง เป็นคอลัมน์ของ Cases
    const sh = tableSheet_(ss, table, cfg);
    const header = headerOf_(sh);
    const found = findRow_(sh, header.indexOf('id') + 1, rec.id);
    let fields = tableDef_(table, cfg).fields;
    // เคสที่มีอยู่แล้ว: ช่องของปุ่มบันทึกขั้นตอนเติมได้เฉพาะช่องที่ยังว่าง ไม่เขียนทับหรือลบ (คนอื่นอาจเพิ่งกด)
    // แก้หรือล้างได้ทาง stampCase เท่านั้น
    if (found && table === 'cases') {
      const cur = sh.getRange(found, 1, 1, header.length).getValues()[0];
      fields = fields.filter(f => {
        if (STAMP_FIELDS.indexOf(f[0]) < 0) return true;
        const col = header.indexOf(f[1]);
        return (col < 0 || String(cur[col] == null ? '' : cur[col]).trim() === '') && String(rec[f[0]] == null ? '' : rec[f[0]]).trim() !== '';
      });
    }
    // หน้าเว็บรุ่นเก่าไม่ส่งช่อง src: ไม่ล้างที่มาของรายการที่ดึงจากระบบนัด
    if (table === 'logs' && rec.src === undefined) fields = fields.filter(f => f[0] !== 'src');
    writeFields_(sh, found || sh.getLastRow() + 1, header, fields, rec);
    return rec;
  });
}

/**
 * แจกเคสใหม่ภายใต้ล็อก ผู้ใช้หลายคนกดพร้อมกันก็ไม่ได้คนซ้ำ
 * รับได้หลายเคส (หลายเทคนิคของผู้ป่วยคนเดียว) เคสแรกเลือก MP ตามคิวของเทคนิคนั้น
 * how = 'follow' ให้ MP คนเดียวกับเคสแรก (คิวไม่ขยับ หักคิวเมื่อวนมาถึง) · how = 'manual' ใช้ MP ที่เลือกมา
 */
function addCases(recs, token) {
  const u = requireEdit_(token, ['work']);
  if (!Array.isArray(recs) || !recs.length) throw new Error('ไม่มีเคสที่จะแจก');
  return withLock_(() => {
    const ss = ss_();
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
          pointer: (cfg.queue || {})[rec.cat] || null, skips: catSkips_(cfg, rec.cat),
        });
      }
      if (!rec.mp) throw new Error((cat ? cat.label + ': ' : '') + 'ไม่มีนักฟิสิกส์ที่รับเคสได้ในวันนั้น (ลาหรือปิดการปฏิบัติงานทุกคน)');
      rec.id = rec.id || Utilities.getUuid();
      rec.in = date;
      rec.created = new Date().toISOString();
      cases.push(rec);
      out.push(rec);
    });
    const sh = tableSheet_(ss, 'cases', cfg);
    const header = headerOf_(sh);
    const fields = tableDef_('cases', cfg).fields;
    out.forEach(rec => writeFields_(sh, sh.getLastRow() + 1, header, fields, rec));
    // แจกจากรายการของแถบ CT-SIM (ctFrom = id ของรายการนั้น): บันทึกว่าแจกแล้วเป็นเคสไหน ใครแจก
    const ctFrom = String((recs[0] && recs[0].ctFrom) || '').trim();
    if (ctFrom) {
      const cs = tableSheet_(ss, 'ctsim'), ch = headerOf_(cs), row = findRow_(cs, ch.indexOf('id') + 1, ctFrom);
      const set = { took: out.map(r => r.id).join(', '), tookBy: String(u.name || u.username || u.me || ''), tookAt: Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm') };
      if (row) writeFields_(cs, row, ch, TABLES.ctsim.fields.filter(f => f[0] in set), set);
    }
    return out;
  });
}

// หักคิวรายเดือนของเทคนิคนี้ { 'YYYY-MM': { code: n } } จาก config.skips { 'YYYY-MM': { cat: { code: n } } }
function catSkips_(cfg, cat) {
  const all = cfg && cfg.skips && typeof cfg.skips === 'object' ? cfg.skips : {}, out = {};
  Object.keys(all).forEach(ym => { if (all[ym] && all[ym][cat]) out[ym] = all[ym][cat]; });
  return out;
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
 * - skips: หักคิวรายเดือนที่แอดมินตั้ง ข้ามคนนั้นตามจำนวนครั้งเมื่อคิววนมาถึง (เหมือนเคสเลือกเอง)
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
  // หักคิวรายเดือนที่แอดมินตั้ง (o.skips = { 'YYYY-MM': { code: n } }): นับตั้งแต่ต้นเดือนนั้น ใช้ไม่หมดยกไปเดือนถัดไป
  const skipDays = Object.keys(o.skips || {}).filter(ym => ym <= String(o.date || '').slice(0, 7)).map(ym => ({ created: ym + '-01', skip: o.skips[ym] }));
  const list = o.cases.concat(skipDays).sort((a, b) => (a.created < b.created ? -1 : a.created > b.created ? 1 : 0));
  list.forEach(c => {
    if (!pointerDone && c.created >= pointer.at) { p = idx(pointer.code); pointerDone = true; lastAuto = null; }
    if (c.skip) { Object.keys(c.skip).forEach(code => { const m = Math.min(50, Math.max(0, Math.floor(+c.skip[code]) || 0)); if (m && idx(code) >= 0) credit[code] = (credit[code] || 0) + m; }); return; }
    const j = idx(c.mp);
    if (j < 0) return;
    // จำนวนครั้ง k: ได้คิวนี้ไปแล้ว k คิว (เคสเลือกเอง/เทคนิคถัดไปหัก k ครั้ง เคสตามคิวหักเพิ่ม k - 1 ครั้ง)
    const k = Math.min(50, Math.max(1, Math.floor(+c.n) || 1));
    if (c.how === 'manual' || c.how === 'follow') { credit[c.mp] = (credit[c.mp] || 0) + k; return; }
    if (c.how === 'replan') return;   // งานวางแผนใหม่ให้ MP คนเดิม: ไม่เกี่ยวกับคิว
    const trial = Object.assign({}, credit);
    if (select(p, c.in, trial) === j) Object.assign(credit, trial);
    p = (j + 1) % n;
    if (k > 1) credit[c.mp] = (credit[c.mp] || 0) + k - 1;
    lastAuto = c;
  });
  if (!pointerDone) { p = idx(pointer.code); lastAuto = null; }
  if (trace) { trace.start = staff[p].code; trace.credit = Object.assign({}, credit); trace.skipped = []; }
  if (o.byDay && lastAuto && lastAuto.in === o.date && free(idx(lastAuto.mp), o.date)) return lastAuto.mp;
  const i = select(p, o.date, credit, trace ? trace.skipped : null);
  return i < 0 ? '' : staff[i].code;
}

function deleteRecord(table, id, token) {
  if (OWN_WRITERS.indexOf(table) >= 0) throw new Error('ตาราง ' + table + ' ลบผ่านแถบของตัวเองเท่านั้น');
  requireEdit_(token, EDIT_VIEWS[table]);
  tableDef_(table);
  return withLock_(() => {
    const sh = tableSheet_(ss_(), table);
    const row = findRow_(sh, headerOf_(sh).indexOf('id') + 1, id);
    if (row) sh.deleteRow(row);
    return !!row;
  });
}

// หน้าแก้ไขเคส: บันทึกหรือลบต้องยืนยันด้วยรหัส PIN ของคนที่เข้าสู่ระบบ (เหมือนปุ่มบันทึกขั้นตอน)
function editCase(rec, pin, token) {
  checkPin_(requireEdit_(token, EDIT_VIEWS.cases), pin, 'edit');
  return saveRecord('cases', rec, token);
}

function removeCase(id, pin, token) {
  checkPin_(requireEdit_(token, EDIT_VIEWS.cases), pin, 'edit');
  return deleteRecord('cases', id, token);
}

// หน้าแก้ไขกิจกรรม (RC งานวิชาการ ฯลฯ): บันทึกการแก้ไขหรือลบต้องยืนยันด้วยรหัส PIN เหมือนหน้าแก้ไขเคส
function editLog(rec, pin, token) {
  checkPin_(requireEdit_(token, EDIT_VIEWS.logs), pin, 'logs');
  return saveRecord('logs', rec, token);
}

function removeLog(id, pin, token) {
  checkPin_(requireEdit_(token, EDIT_VIEWS.logs), pin, 'logs');
  return deleteRecord('logs', id, token);
}

function saveConfig(config, token) {
  const u = who_(token);
  if (!u.isAdmin) throw new Error('แก้การตั้งค่าได้เฉพาะแอดมิน' + (u.name ? ' (' + u.name + ' ไม่ใช่แอดมิน)' : ''));
  return withLock_(() => {
    writeConfig_(ss_(), config || {});
    try { CacheService.getScriptCache().remove('appName'); } catch (e) { /* แคชใช้ไม่ได้: ชื่อแท็บเปลี่ยนภายใน 6 ชั่วโมง */ }
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
  const ss = ss_();
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
  const msg = 'เคสใหม่ ' + added.cases + ' รายการ · RC และกิจกรรม ' + added.logs + ' รายการ\n' +
    'รายการที่เคยนำเข้าแล้วจะไม่ถูกเพิ่มซ้ำ และตั้งคิวถัดไปตามแถวว่างในแท็บเดิมให้แล้ว';
  // รันจากหน้าแก้ไขสคริปต์ (ไม่ได้เปิดจากชีต) ไม่มีหน้าต่างแจ้ง ดูผลใน Execution log แทน
  try { SpreadsheetApp.getUi().alert('นำเข้าข้อมูลแล้ว', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { Logger.log('นำเข้าข้อมูลแล้ว: ' + msg); }
  return msg;
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
    const ss = ss_();
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

/* ---------- ปุ่มบันทึกขั้นตอนของเคส (Finish, Evaluate, Dose check, F0, Delta4, SRS MapCheck, Plan complete) ---------- */

const STEP_NAMES = { fin: 'Finish', eval: 'Evaluate', mu: 'Dose check', d0: 'F0', d4: 'Delta4', mc: 'SRS MapCheck', pc: 'Plan complete' };
const STEP_VALUES = ['mu', 'd0', 'd4', 'mc'];   // ต้องกรอกค่า
const STAMP_FIELDS = ['fin', 'finBy', 'eval', 'evalBy', 'mu', 'muBy', 'muVal', 'd0', 'd0By', 'd0Val', 'd4', 'd4By', 'd4Val', 'mc', 'mcBy', 'mcVal', 'pc', 'pcBy', 'muNote', 'd0Note', 'd4Note', 'mcNote',
  'rt', 'rtDate', 'rtAt', 'rtBy', 'rtNote', 'fxlog', 'ptags', 'rmove', 'bsteps', 'mqt', 'fxadd', 'replan'];
// ชื่อคอลัมน์เดิมในแท็บ Cases → ชื่อใหม่ (เปลี่ยนชื่อในชีตตอนเขียนครั้งถัดไป ระหว่างนั้นอ่านจากชื่อเดิมได้)
const RENAMED_COLS = { 'MU Check': 'Dose check', 'MU Check โดย': 'Dose check โดย', 'MU Check ค่า': 'Dose check ค่า', 'D0': 'F0', 'D0 โดย': 'F0 โดย', 'D0 ค่า': 'F0 ค่า' };

/**
 * กดปุ่มขั้นตอนของเคส: ตรวจรหัส PIN ของคนกด แล้วบันทึกวันเวลา (เวลาเซิร์ฟเวอร์) ชื่อคนกด และค่า
 * value = null คือล้างขั้นตอนนั้น (เลิกทำหรือบันทึกผิด) · เขียนเฉพาะช่องของขั้นตอนนั้น ไม่ทับข้อมูลอื่นของเคส
 * Evaluate ก่อน Finish: Finish ได้เวลาเดียวกัน · คืนเคสหลังบันทึก
 */
function stampCase(id, step, value, pin, token) {
  const steps = {};
  steps[step] = value;
  return stampSteps_(id, steps, pin, token);
}

// ช่องกรอกค่าใต้ปุ่ม Dose check, F0, Delta4, SRS MapCheck: บันทึกค่า (หลายค่าพร้อมกันได้) ใส่ PIN ครั้งเดียว
// values = { mu: '1.2%', d4: { value: '88%', note: 'หมายเหตุ' } } · ล้างการบันทึกทำทีละขั้นตอนที่ stampCase
function stampSteps(id, values, pin, token) {
  const keys = Object.keys(values || {});
  if (!keys.length) throw new Error('กรอกค่าก่อนบันทึก');
  if (keys.some(k => values[k] === null)) throw new Error('ล้างการบันทึกทีละขั้นตอน');
  return stampSteps_(id, values, pin, token);
}

// เลือกวันเวลาเองได้ (ลืมกดตอนทำจริง): at = 'yyyy-MM-dd HH:mm' ไม่เกินเวลาตอนนี้ · ว่าง = เวลาเซิร์ฟเวอร์ตอนนี้
// ชื่อฟังก์ชันใหม่ ไม่เพิ่มพารามิเตอร์ให้ stampCase / stampSteps เดิม (หน้าเว็บรุ่นเก่าส่ง token เป็นตัวท้ายสุด)
function stampCaseAt(id, step, value, pin, at, token) {
  const steps = {};
  steps[step] = value;
  return stampSteps_(id, steps, pin, token, at);
}

function stampStepsAt(id, values, pin, at, token) {
  const keys = Object.keys(values || {});
  if (!keys.length) throw new Error('กรอกค่าก่อนบันทึก');
  if (keys.some(k => values[k] === null)) throw new Error('ล้างการบันทึกทีละขั้นตอน');
  return stampSteps_(id, values, pin, token, at);
}

function stampTime_(at, tz) {
  const now = new Date();
  if (at == null || String(at).trim() === '') return Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm');
  const s = String(at).trim(), m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(s);
  const d = m && new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (!m || d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3] || +m[4] > 23 || +m[5] > 59 || +m[1] < 2000) throw new Error('วันเวลาไม่ถูกต้อง');
  if (s > Utilities.formatDate(new Date(now.getTime() + 5 * 60000), tz, 'yyyy-MM-dd HH:mm')) throw new Error('บันทึกวันเวลาที่ยังไม่ถึงไม่ได้');
  return s;
}

// ตรวจค่าของขั้นตอนที่จะบันทึก { keys, vals (null = ล้าง), notes } · ใช้กับเคสและแผน boost
function stampVals_(steps) {
  const keys = Object.keys(steps || {}), vals = {}, notes = {};
  keys.forEach(step => {
    if (!STEP_NAMES[step]) throw new Error('ไม่รู้จักขั้นตอน ' + step);
    let value = steps[step];
    if (value && typeof value === 'object') {
      if (value.note != null) notes[step] = String(value.note).trim().slice(0, 200);
      value = value.value;
    }
    vals[step] = value === null ? null : String(value == null ? '' : value).trim().slice(0, 60);
    if (value !== null && STEP_VALUES.indexOf(step) >= 0 && !vals[step]) throw new Error('กรอกค่า ' + STEP_NAMES[step] + ' ก่อนบันทึก');
  });
  return { keys: keys, vals: vals, notes: notes };
}

function stampSteps_(id, steps, pin, token, at) {
  const u = requireEdit_(token, EDIT_VIEWS.cases);
  const parsed = stampVals_(steps), keys = parsed.keys, vals = parsed.vals, notes = parsed.notes;
  checkPin_(u, pin, 'steps');
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss);
    const sh = tableSheet_(ss, 'cases', cfg), header = headerOf_(sh);
    const row = findRow_(sh, header.indexOf('id') + 1, id);
    if (!row) throw new Error('ไม่พบเคสนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const now = stampTime_(at, ss.getSpreadsheetTimeZone());
    const name = String(u.name || u.username || u.me || '');
    const finCol = header.indexOf('Finish') + 1;
    const set = {};
    keys.forEach(step => {
      const clear = vals[step] === null, at = clear ? '' : now, by = clear ? '' : name;
      set[step] = at;
      set[step + 'By'] = by;
      if (STEP_VALUES.indexOf(step) >= 0) set[step + 'Val'] = clear ? '' : vals[step];
      if (STEP_VALUES.indexOf(step) >= 0 && (clear || step in notes)) set[step + 'Note'] = clear ? '' : notes[step];
      if (step === 'eval' && !clear && finCol > 0 && !String(sh.getRange(row, finCol).getValue()).trim()) { set.fin = at; set.finBy = by; }
    });
    writeFields_(sh, row, header, TABLES.cases.fields.filter(f => f[0] in set), set);
    return readTable_(ss, 'cases', cfg).filter(c => c.id === id)[0];
  });
}

/**
 * ปุ่มขั้นตอนของแผน Sequential boost (แถวย่อยใต้ HN): เหมือน stampSteps แต่เก็บแยกของแต่ละ boost (sid ของบริเวณนั้น)
 * steps = { fin: '', mu: '1.2%', d4: { value, note }, eval: null (ล้าง) } · at = วันเวลาที่เลือกเอง (ว่าง = ตอนนี้) · คืนเคสหลังบันทึก
 */
function stampBoost(id, sid, steps, pin, at, token) {
  const u = requireEdit_(token, EDIT_VIEWS.cases);
  sid = String(sid == null ? '' : sid).trim();
  if (!/^[\w-]{1,40}$/.test(sid)) throw new Error('ไม่พบแผน boost นี้');
  const parsed = stampVals_(steps), keys = parsed.keys, vals = parsed.vals, notes = parsed.notes;
  if (!keys.length) throw new Error('เลือกขั้นตอนที่จะบันทึก');
  checkPin_(u, pin, 'steps');
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss);
    const sh = tableSheet_(ss, 'cases', cfg), header = headerOf_(sh);
    const row = findRow_(sh, header.indexOf('id') + 1, id);
    if (!row) throw new Error('ไม่พบเคสนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const col = header.indexOf('ขั้นตอนของ boost');
    let all = {};
    try { all = col < 0 ? {} : JSON.parse(String(sh.getRange(row, col + 1).getValue() || '{}')); } catch (e) { all = {}; }
    if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
    const cur = all[sid] && typeof all[sid] === 'object' ? all[sid] : {};
    const now = stampTime_(at, ss.getSpreadsheetTimeZone()), name = String(u.name || u.username || u.me || '');
    keys.forEach(step => {
      const clear = vals[step] === null, when = clear ? '' : now, by = clear ? '' : name;
      cur[step] = when;
      cur[step + 'By'] = by;
      if (STEP_VALUES.indexOf(step) >= 0) cur[step + 'Val'] = clear ? '' : vals[step];
      if (STEP_VALUES.indexOf(step) >= 0 && (clear || step in notes)) cur[step + 'Note'] = clear ? '' : notes[step];
      if (step === 'eval' && !clear && !cur.fin) { cur.fin = when; cur.finBy = by; }
    });
    Object.keys(cur).forEach(k => { if (cur[k] === '') delete cur[k]; });
    if (Object.keys(cur).length) all[sid] = cur; else delete all[sid];
    const set = { bsteps: Object.keys(all).length ? JSON.stringify(all) : '' };
    writeFields_(sh, row, header, TABLES.cases.fields.filter(f => f[0] in set), set);
    return readTable_(ss, 'cases', cfg).filter(c => c.id === id)[0];
  });
}

/**
 * แถบ Complete: จบการฉายของเคส ยืนยันด้วยรหัส PIN · status = 'complete' (Complete course) หรือ 'cancel' (Cancel RT ต้องมีสาเหตุ)
 * date = วันที่ฉายครั้งสุดท้าย / วันที่หยุดฉาย (yyyy-MM-dd) · status = '' ล้างกลับเป็นกำลังฉาย · คืนเคสหลังบันทึก
 */
function courseCase(id, status, date, note, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.course);
  status = String(status || '');
  if (['', 'complete', 'cancel'].indexOf(status) < 0) throw new Error('สถานะการฉายไม่ถูกต้อง');
  date = String(date == null ? '' : date).trim();
  note = String(note == null ? '' : note).trim().slice(0, 300);
  if (status && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('ใส่วันที่');
  if (status === 'cancel' && !note) throw new Error('กรอกสาเหตุที่ Cancel RT');
  checkPin_(u, pin, 'course');
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss);
    const sh = tableSheet_(ss, 'cases', cfg), header = headerOf_(sh);
    const row = findRow_(sh, header.indexOf('id') + 1, id);
    if (!row) throw new Error('ไม่พบเคสนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const now = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
    const set = status
      ? { rt: status, rtDate: date, rtAt: now, rtBy: String(u.name || u.username || u.me || ''), rtNote: note }
      : { rt: '', rtDate: '', rtAt: '', rtBy: '', rtNote: '' };
    writeFields_(sh, row, header, TABLES.cases.fields.filter(f => f[0] in set), set);
    return readTable_(ss, 'cases', cfg).filter(c => c.id === id)[0];
  });
}

/**
 * แถบ Complete: สถานะของ fraction รายวัน ยืนยันด้วยรหัส PIN · หนึ่งรายการต่อวันต่อเคส (บันทึกวันเดิมซ้ำ = แทนที่)
 * ev = { type, label, act, back, reason, note } · act: skip = ไม่ได้ฉายตั้งแต่วันนั้นถึงก่อนวันกลับมาฉาย (back ว่าง = จนกว่าจะกลับมา) fraction เลื่อนออกไป
 * treat = ฉายตามปกติ บันทึกไว้เฉย ๆ · given = ฉายแล้ว (บันทึกล่วงหน้าไม่ได้) · off = Off RT หยุดฉายตั้งแต่วันนั้น (มีได้รายการเดียว)
 * ev = null ล้างรายการของวันนั้น · คืนเคสหลังบันทึก
 */
const FX_ACTS = ['skip', 'treat', 'off', 'given'];
function fractionCase(id, date, ev, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.course);
  const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  date = cut(date, 10);
  if (!isDate(date)) throw new Error('วันที่ไม่ถูกต้อง');
  let rec = null;
  if (ev) {
    rec = { date: date, type: cut(ev.type, 40), label: cut(ev.label, 40), act: String(ev.act || ''), back: cut(ev.back, 10), reason: cut(ev.reason, 80), note: cut(ev.note, 200) };
    if (!rec.type || !rec.label) throw new Error('เลือกสถานะ');
    if (FX_ACTS.indexOf(rec.act) < 0) throw new Error('สถานะนี้ไม่ถูกต้อง');
    if (rec.act !== 'skip') rec.back = '';
    if (rec.back && (!isDate(rec.back) || rec.back <= date)) throw new Error('วันกลับมาฉายต้องหลังวันที่ ' + date);
  }
  checkPin_(u, pin, 'fx');
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss);
    if (rec && rec.act === 'given' && date > Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd')) throw new Error('ยังไม่ถึงวันที่ ' + date + ' บันทึกฉายแล้วล่วงหน้าไม่ได้');
    const sh = tableSheet_(ss, 'cases', cfg), header = headerOf_(sh);
    const row = findRow_(sh, header.indexOf('id') + 1, id);
    if (!row) throw new Error('ไม่พบเคสนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const col = header.indexOf('สถานะ fraction');
    let list = [];
    try { list = col < 0 ? [] : JSON.parse(String(sh.getRange(row, col + 1).getValue() || '[]')); } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    list = list.filter(x => x && x.date !== date);
    if (rec) {
      const inside = list.filter(x => x.act === 'skip' && x.date < date && (!x.back || date < x.back))[0];
      if (inside) throw new Error('วันที่ ' + date + ' อยู่ในช่วง ' + inside.label + ' ตั้งแต่ ' + inside.date + ' แก้ที่รายการนั้นแทน');
      if (rec.act === 'off') list = list.filter(x => x.act !== 'off');
      rec.by = String(u.name || u.username || u.me || '');
      rec.at = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
      list.push(rec);
    }
    list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const set = { fxlog: list.length ? JSON.stringify(list) : '' };
    writeFields_(sh, row, header, TABLES.cases.fields.filter(f => f[0] in set), set);
    return readTable_(ss, 'cases', cfg).filter(c => c.id === id)[0];
  });
}

/**
 * ย้ายห้องฉาย: fraction วันนั้น (scope once) หรือตั้งแต่วันนั้นเป็นต้นไป (scope on) ไปฉายอีกห้อง ยืนยันด้วยรหัส PIN
 * หนึ่งรายการต่อวัน (บันทึกวันเดิมซ้ำ = แก้) · mv = null ล้างรายการของวันนั้น · เก็บแยกจากสถานะ fraction (ห้องใหม่บันทึกฉายแล้ววันเดียวกันได้)
 */
function moveCase(id, date, mv, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.course);
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  date = cut(date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('วันที่ไม่ถูกต้อง');
  let rec = null;
  if (mv) {
    rec = { date: date, room: cut(mv.room, 40), from: cut(mv.from, 40), scope: mv.scope === 'on' ? 'on' : 'once', note: cut(mv.note, 200) };
    if (!rec.room) throw new Error('เลือกห้องที่ย้ายไป');
    if (rec.room === rec.from) throw new Error('ห้องที่ย้ายไปต้องไม่ใช่ห้องเดิม');
  }
  checkPin_(u, pin, 'fx');
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss);
    const sh = tableSheet_(ss, 'cases', cfg), header = headerOf_(sh);
    const row = findRow_(sh, header.indexOf('id') + 1, id);
    if (!row) throw new Error('ไม่พบเคสนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const col = header.indexOf('ย้ายห้อง');
    let list = [];
    try { list = col < 0 ? [] : JSON.parse(String(sh.getRange(row, col + 1).getValue() || '[]')); } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    list = list.filter(x => x && x.date !== date);
    if (rec) {
      rec.by = String(u.name || u.username || u.me || '');
      rec.at = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
      list.push(rec);
    }
    list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const set = { rmove: list.length ? JSON.stringify(list) : '' };
    writeFields_(sh, row, header, TABLES.cases.fields.filter(f => f[0] in set), set);
    return readTable_(ss, 'cases', cfg).filter(c => c.id === id)[0];
  });
}

/**
 * ตารางวันฉาย: รายละเอียดผู้ป่วยหลัง HN (เช่น NPO, BD protocol, Empty BD) ยืนยันด้วยรหัส PIN
 * tags = ข้อความคั่นด้วยจุลภาค (ว่าง = ล้าง) · เขียนเฉพาะช่องนี้ · คืนเคสหลังบันทึก
 */
function tagCase(id, tags, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.course);
  const seen = {};
  const list = String(tags == null ? '' : tags).split(',').map(x => x.trim().slice(0, 40)).filter(x => x && !seen[x.toLowerCase()] && (seen[x.toLowerCase()] = true));
  const text = list.join(', ');
  if (text.length > 300) throw new Error('รายละเอียดผู้ป่วยยาวเกินไป (ไม่เกิน 300 ตัวอักษร)');
  checkPin_(u, pin, 'ptags');
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss);
    const sh = tableSheet_(ss, 'cases', cfg), header = headerOf_(sh);
    const row = findRow_(sh, header.indexOf('id') + 1, id);
    if (!row) throw new Error('ไม่พบเคสนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const set = { ptags: text };
    writeFields_(sh, row, header, TABLES.cases.fields.filter(f => f[0] in set), set);
    return readTable_(ss, 'cases', cfg).filter(c => c.id === id)[0];
  });
}

/**
 * งานวางแผนใหม่ให้ MP คนเดิม (บันทึก Re-CT, ย้ายห้อง ฯลฯ ในตารางวันฉาย) ยืนยันด้วยรหัส PIN
 * เคสใหม่คัดลอกข้อมูลผู้ป่วยและเทคนิคจากเคสเดิม · prescription = fraction ที่เหลือ (หน้าเว็บคำนวณ) · In = วันนี้ · ขั้นตอนเริ่มใหม่ทั้งหมด
 * หนึ่งงานต่อเคสเดิมต่อวัน (บันทึกซ้ำ = แก้สาเหตุ วันเริ่มฉาย ห้อง) · rp = null: ลบงานของวันนั้นถ้ายังไม่เริ่ม (ยังไม่มีขั้นตอนที่บันทึก)
 * rp = { kind, label, reason, room, sim, ct, dpf, fx, area, sites: [...], mp } · mp ว่าง = MP ของเคสเดิม (บันทึกซ้ำ = คนที่รับงานอยู่) · ระบุ = ส่งให้คนนั้น
 */
function replanCase(id, date, rp, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.course);
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v);
  date = cut(date, 10);
  if (!isDate(date)) throw new Error('วันที่ไม่ถูกต้อง');
  let rec = null;
  if (rp) {
    rec = { kind: cut(rp.kind, 40), label: cut(rp.label, 40), reason: cut(rp.reason, 80), room: cut(rp.room, 40), sim: cut(rp.sim, 10), ct: cut(rp.ct, 10),
      dpf: cut(rp.dpf, 20), fx: cut(rp.fx, 4), area: cut(rp.area, 200), mp: cut(rp.mp, 20).toUpperCase() };
    if (!rec.kind || !rec.label) throw new Error('ไม่ทราบสาเหตุของงานวางแผนใหม่');
    if ((rec.sim && !isDate(rec.sim)) || (rec.ct && !isDate(rec.ct))) throw new Error('วันที่ของงานวางแผนใหม่ไม่ถูกต้อง');
    if (rec.fx && !/^\d{1,3}$/.test(rec.fx)) throw new Error('จำนวน fraction ไม่ถูกต้อง');
    const sites = Array.isArray(rp.sites) ? rp.sites.slice(0, 10).filter(x => x && typeof x === 'object').map(x => {
      const o = {};
      ['area', 'dpf', 'fx', 'rx', 'freq', 'start', 'startFx', 'sid', 'room'].forEach(k => { if (x[k] != null && x[k] !== '') o[k] = cut(x[k], 120); });
      return o;
    }) : [];
    rec.sites = sites.length ? JSON.stringify(sites) : '';
  }
  checkPin_(u, pin, 'fx');
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss);
    const sh = tableSheet_(ss, 'cases', cfg), header = headerOf_(sh), fields = tableDef_('cases', cfg).fields;
    const rows = readTable_(ss, 'cases', cfg), parent = rows.filter(c => c.id === id)[0];
    if (!parent) throw new Error('ไม่พบเคสนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    if (rec && rec.mp) {
      const staff = Array.isArray(cfg && cfg.staff) && cfg.staff.length ? cfg.staff : DEFAULT_STAFF.map(code => ({ code: code }));
      if (!staff.some(x => String(x.code).toUpperCase() === rec.mp)) throw new Error('ไม่พบรหัสนักฟิสิกส์ ' + rec.mp);
    }
    const metaOf = c => { try { const m = JSON.parse(c.replan || 'null'); return m && typeof m === 'object' ? m : null; } catch (e) { return null; } };
    const old = rows.filter(c => { const m = metaOf(c); return m && m.of === id && m.date === date; })[0];
    if (!rec) {
      if (!old) return { id: '', removed: false };
      if (['fin', 'eval', 'mu', 'd0', 'd4', 'mc', 'pc'].some(k => String(old[k] || ''))) return { id: old.id, removed: false, started: true };
      const row = findRow_(sh, header.indexOf('id') + 1, old.id);
      if (row) sh.deleteRow(row);
      return { id: old.id, removed: true };
    }
    const meta = JSON.stringify({ of: id, date: date, kind: rec.kind, label: rec.label, reason: rec.reason });
    if (old) {   // แก้: สาเหตุ วันเริ่มฉาย ห้อง (prescription และขั้นตอนที่ MP ทำไปแล้วคงไว้)
      const set = { replan: meta, sim: rec.sim, room: rec.room || old.room };
      if (rec.mp) set.mp = rec.mp;
      writeFields_(sh, findRow_(sh, header.indexOf('id') + 1, old.id), header, fields.filter(f => f[0] in set), set);
      return readTable_(ss, 'cases', cfg).filter(c => c.id === old.id)[0];
    }
    const out = {};
    fields.forEach(f => { out[f[0]] = parent[f[0]]; });
    STAMP_FIELDS.forEach(k => { out[k] = ''; });
    Object.assign(out, {
      id: Utilities.getUuid(), how: 'replan', batch: '', note: '', replan: meta, mp: rec.mp || parent.mp,
      in: Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd'), created: new Date().toISOString(), updated: '',
      sim: rec.sim, ct: rec.ct || parent.ct, room: rec.room || parent.room, dpf: rec.dpf || parent.dpf, fx: rec.fx, rx: '', area: rec.area || parent.area, sites: rec.sites,
    });
    writeFields_(sh, sh.getLastRow() + 1, header, fields, out);
    return out;
  });
}

/**
 * เพิ่ม fraction ต่อท้ายคอร์ส (กดที่ fraction สุดท้ายในตารางวันฉาย) ยืนยันด้วยรหัส PIN · add = { n: 1–30, reason } · null = ล้างรายการของวันนั้น
 * หนึ่งรายการต่อวัน (บันทึกวันเดิมซ้ำ = แก้) · เก็บแยกจากสถานะ fraction (วันเดียวกันบันทึกฉายแล้วได้)
 */
function addFxCase(id, date, add, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.course);
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  date = cut(date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('วันที่ไม่ถูกต้อง');
  let rec = null;
  if (add) {
    rec = { date: date, n: Math.floor(+add.n), reason: cut(add.reason, 200) };
    if (!(rec.n >= 1 && rec.n <= 30)) throw new Error('จำนวน fraction ที่เพิ่มต้องเป็น 1–30');
    if (!rec.reason) throw new Error('ใส่เหตุผลที่เพิ่ม fraction');
  }
  checkPin_(u, pin, 'fx');
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss);
    const sh = tableSheet_(ss, 'cases', cfg), header = headerOf_(sh);
    const row = findRow_(sh, header.indexOf('id') + 1, id);
    if (!row) throw new Error('ไม่พบเคสนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const col = header.indexOf('เพิ่ม fraction');
    let list = [];
    try { list = col < 0 ? [] : JSON.parse(String(sh.getRange(row, col + 1).getValue() || '[]')); } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    list = list.filter(x => x && x.date !== date);
    if (rec) {
      rec.by = String(u.name || u.username || u.me || '');
      rec.at = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
      list.push(rec);
    }
    list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const set = { fxadd: list.length ? JSON.stringify(list) : '' };
    writeFields_(sh, row, header, TABLES.cases.fields.filter(f => f[0] in set), set);
    return readTable_(ss, 'cases', cfg).filter(c => c.id === id)[0];
  });
}

/**
 * Mosaiq Time ของเคส (ช่องหน้า HN ในตารางวันฉาย) ยืนยันด้วยรหัส PIN · time = "08:30", "830", "8.30" → 08:30 · ว่าง = ล้าง
 * หน้าเว็บเรียกให้ทุกเคสของ HN เดียวกัน
 */
function timeCase(id, time, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.course);
  const s = String(time == null ? '' : time).replace(/\s/g, '');
  let text = '';
  if (s) {
    const m = s.match(/^(\d{1,2})[:.](\d{2})$/) || s.match(/^(\d{1,2})(\d{2})$/) || s.match(/^(\d{1,2})()$/);
    if (!m || +m[1] > 23 || +(m[2] || 0) > 59) throw new Error('Mosaiq Time ต้องเป็นเวลา เช่น 08:30');
    text = ('0' + +m[1]).slice(-2) + ':' + (m[2] || '00');
  }
  checkPin_(u, pin, 'mqt');
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss);
    const sh = tableSheet_(ss, 'cases', cfg), header = headerOf_(sh);
    const row = findRow_(sh, header.indexOf('id') + 1, id);
    if (!row) throw new Error('ไม่พบเคสนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const set = { mqt: text };
    writeFields_(sh, row, header, TABLES.cases.fields.filter(f => f[0] in set), set);
    return readTable_(ss, 'cases', cfg).filter(c => c.id === id)[0];
  });
}

/**
 * แถบห้องฉาย: เพิ่มหรือแก้ผู้ป่วยที่บันทึกเข้าตารางวันฉายโดยตรง (RTT, RA, MP ที่บันทึกในแถบห้องฉายได้) ยืนยันด้วยรหัส PIN
 * ไม่แจกงานให้ MP: how = 'direct' · mp ว่าง · ไม่อยู่ในงาน งานรอ ตารางแจกเคส และสถิติการวางแผน · แก้ได้เฉพาะเคสที่เพิ่มทางนี้
 * rec = ช่องใน DIRECT_FIELDS และหัวข้อเพิ่มเติม (x_…) · id ที่ยังไม่มี = เพิ่มใหม่ · สถานะ fraction ฯลฯ บันทึกผ่านฟังก์ชันของช่องนั้น · คืนเคสหลังบันทึก
 */
const DIRECT_FIELDS = ['cat', 'type', 'hn', 'name', 'icd', 'dx', 'doc', 'aim', 'tech', 'room', 'dpf', 'fx', 'rx', 'freq', 'area', 'sites', 'ct', 'sim', 'note'];
function courseAdd(rec, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.course);
  rec = rec && typeof rec === 'object' ? rec : {};
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!cut(rec.hn, 40)) throw new Error('กรอก HN');
  if (!cut(rec.cat, 40)) throw new Error('เลือกเทคนิค');
  if (cut(rec.ct, 10) && !isDate(cut(rec.ct, 10))) throw new Error('วันที่ CT-Sim ไม่ถูกต้อง');
  const sim = cut(rec.sim, 10);
  if (sim && sim !== 'on call' && !isDate(sim)) throw new Error('วันที่ Start RT ไม่ถูกต้อง');
  checkPin_(u, pin, 'ptadd');
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss);
    const sh = tableSheet_(ss, 'cases', cfg), header = headerOf_(sh), fields = tableDef_('cases', cfg).fields;
    const id = cut(rec.id, 80), row = id ? findRow_(sh, header.indexOf('id') + 1, id) : 0;
    if (row && String(sh.getRange(row, header.indexOf('วิธีแจก') + 1).getValue()).trim() !== 'direct') {
      throw new Error('แก้ได้เฉพาะผู้ป่วยที่เพิ่มในแถบห้องฉาย · เคสที่แจกงานแก้ที่หน้าแก้ไขเคส');
    }
    const set = {};
    DIRECT_FIELDS.concat(fields.map(f => f[0]).filter(k => /^x_/.test(k))).forEach(k => { set[k] = cut(rec[k], k === 'sites' ? 5000 : k === 'dx' || k === 'note' ? 2000 : 200); });
    set.sim = sim;
    const now = new Date().toISOString();
    if (row) set.updated = now;
    else Object.assign(set, { id: id || Utilities.getUuid(), how: 'direct', mp: '', in: Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd'), created: now, updated: '' });
    writeFields_(sh, row || sh.getLastRow() + 1, header, fields.filter(f => f[0] in set), set);
    const want = row ? id : set.id;
    return readTable_(ss, 'cases', cfg).filter(c => c.id === want)[0];
  });
}

// ลบผู้ป่วยที่เพิ่มในแถบห้องฉาย (เฉพาะ how = 'direct') ยืนยันด้วยรหัส PIN · คืน true เมื่อลบแล้ว
function courseRemove(id, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.course);
  checkPin_(u, pin, 'ptadd');
  return withLock_(() => {
    const ss = ss_(), sh = tableSheet_(ss, 'cases', readConfig_(ss)), header = headerOf_(sh);
    const row = findRow_(sh, header.indexOf('id') + 1, id);
    if (!row) return false;
    if (String(sh.getRange(row, header.indexOf('วิธีแจก') + 1).getValue()).trim() !== 'direct') throw new Error('ลบได้เฉพาะผู้ป่วยที่เพิ่มในแถบห้องฉาย');
    sh.deleteRow(row);
    return true;
  });
}

/**
 * ตารางวันฉาย: นักรังสีการแพทย์ (RTT) และผู้ช่วย (RA) ที่ปฏิบัติงานในวันนั้น แยกตามห้องฉาย ยืนยันด้วยรหัส PIN
 * list = [{ room, rtt: [ชื่อ], ra: [ชื่อ], qc: [ชื่อ] }] (room ว่าง = ไม่แยกห้อง · CT:<รหัส> = เครื่อง CT ของแถบ CT-SIM) · ห้องที่ไม่มีชื่อเลย = ลบรายการของห้องนั้น · คืนรายการของวันนั้น
 */
function dutyDay(date, list, pin, token) {
  // ห้อง CT (room ขึ้นต้นด้วย CT:) = แถบ CT-SIM · ห้องฉาย = แถบห้องฉาย (บันทึกครั้งละแถบ)
  const isCt = Array.isArray(list) && list.some(x => x && /^CT:/.test(String(x.room || '')));
  const u = requireEdit_(token, isCt ? EDIT_VIEWS.ctsim : EDIT_VIEWS.course);
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  date = cut(date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('วันที่ไม่ถูกต้อง');
  if (!Array.isArray(list)) throw new Error('ไม่มีรายชื่อผู้ปฏิบัติงาน');
  const names = v => {
    const seen = {};
    return (Array.isArray(v) ? v : []).map(x => cut(x, 60).replace(/,/g, ' ').replace(/\s+/g, ' ')).filter(x => x && !seen[x] && (seen[x] = true)).slice(0, 30);
  };
  const recs = list.slice(0, 30).filter(x => x && typeof x === 'object' && /^CT:/.test(String(x.room || '')) === isCt).map(x => ({ room: cut(x.room, 40), rtt: names(x.rtt), ra: names(x.ra), qc: names(x.qc) }));
  checkPin_(u, pin, 'duty');
  return withLock_(() => {
    const ss = ss_(), sh = tableSheet_(ss, 'duty'), header = headerOf_(sh), idCol = header.indexOf('id') + 1;
    const at = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm'), by = String(u.name || u.username || u.me || '');
    recs.forEach(r => {
      const id = date + '|' + r.room, row = findRow_(sh, idCol, id);
      if (!r.rtt.length && !r.ra.length && !r.qc.length) { if (row) sh.deleteRow(row); return; }
      writeFields_(sh, row || sh.getLastRow() + 1, header, TABLES.duty.fields, { id: id, date: date, room: r.room, rtt: r.rtt.join(', '), ra: r.ra.join(', '), qc: r.qc.join(', '), by: by, at: at });
    });
    return readTable_(ss, 'duty').filter(x => x.date === date);
  });
}

// ผู้ปฏิบัติงานที่ส่งให้หน้าเว็บ: ตั้งแต่ 1 ปีก่อน (ตารางย้อนหลังเกินนั้นไม่ค่อยได้ดู)
function recentDuty_(ss) {
  const from = Utilities.formatDate(new Date(Date.now() - 366 * 864e5), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  return readTable_(ss, 'duty').filter(x => String(x.date) >= from);
}

/**
 * แถบ CT-SIM: เพิ่มหรือแก้ผู้ป่วยที่ทำ CT จำลองการฉาย (RTT / RA / MP ที่บันทึกในแถบ CT-SIM ได้) ยืนยันด้วยรหัส PIN
 * rec = ช่องใน CT_FIELDS (ct = รหัสเครื่อง CT, date = วันที่ทำ CT, ข้อมูลแบบฟอร์มแจกเคส, อุปกรณ์ในห้อง CT, send = 'yes' ส่งให้แถบงาน)
 * id ที่ยังไม่มี = เพิ่มใหม่ · สถานะการแจกเคส (took) เปลี่ยนได้ทาง ctMark / addCases เท่านั้น · คืนรายการหลังบันทึก
 */
const CT_FIELDS = ['ct', 'date', 'hn', 'name', 'organ', 'mask', 'bite', 'cm', 'coil', 'ydev', 'inj', 'nss', 'syr', 'doc', 'pstat', 'hdr', 'crad', 'note', 'research',
  'cats', 'type', 'aim', 'room', 'tech', 'area', 'dpf', 'fx', 'rx', 'freq', 'sim', 'icd', 'dx', 'extra', 'send'];
function ctSave(rec, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.ctsim);
  rec = rec && typeof rec === 'object' ? rec : {};
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!cut(rec.hn, 40)) throw new Error('กรอก HN');
  if (!cut(rec.ct, 20)) throw new Error('เลือกเครื่อง CT');
  if (!isDate(cut(rec.date, 10))) throw new Error('วันที่ทำ CT ไม่ถูกต้อง');
  const sim = cut(rec.sim, 10);
  if (sim && sim !== 'on call' && !isDate(sim)) throw new Error('วันที่ Start RT ไม่ถูกต้อง');
  checkPin_(u, pin, 'ct');
  return withLock_(() => {
    const ss = ss_(), sh = tableSheet_(ss, 'ctsim'), header = headerOf_(sh);
    const id = cut(rec.id, 80), row = id ? findRow_(sh, header.indexOf('id') + 1, id) : 0;
    const set = {};
    CT_FIELDS.forEach(k => { set[k] = cut(rec[k], k === 'extra' ? 4000 : k === 'note' || k === 'dx' ? 2000 : 200); });
    set.send = set.send ? 'yes' : '';
    const now = new Date().toISOString();
    if (row) set.updated = now;
    else Object.assign(set, { id: id || Utilities.getUuid(), by: String(u.name || u.username || u.me || ''), created: now, updated: '' });
    writeFields_(sh, row || sh.getLastRow() + 1, header, TABLES.ctsim.fields.filter(f => f[0] in set), set);
    const want = row ? id : set.id;
    // ลงจากนัดในแถบลงนัด (apptFrom = id ของนัด เฉพาะรายการใหม่): บันทึกว่านัดนี้ลง CT-SIM แล้ว ใครลง
    const from = row ? '' : cut(rec.apptFrom, 80);
    if (from) {
      const as = tableSheet_(ss, 'appt'), ah = headerOf_(as), ar = findRow_(as, ah.indexOf('id') + 1, from);
      const mark = { took: set.id, tookBy: set.by, tookAt: Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm') };
      if (ar) writeFields_(as, ar, ah, TABLES.appt.fields.filter(f => f[0] in mark), mark);
    }
    return readTable_(ss, 'ctsim').filter(x => x.id === want)[0];
  });
}

// ลบผู้ป่วยในแถบ CT-SIM ยืนยันด้วยรหัส PIN (เคสที่ MP แจกไปแล้วไม่ถูกลบ) · นัดที่ลงเป็นรายการนี้กลับไปรอลง CT-SIM · คืน true เมื่อลบแล้ว
function ctRemove(id, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.ctsim);
  checkPin_(u, pin, 'ct');
  return withLock_(() => {
    const ss = ss_(), sh = tableSheet_(ss, 'ctsim'), row = findRow_(sh, headerOf_(sh).indexOf('id') + 1, id);
    if (row) sh.deleteRow(row);
    if (row && id) {
      const as = ss.getSheetByName(TABLES.appt.sheet);
      if (as) {
        const ah = headerOf_(as), clear = { took: '', tookBy: '', tookAt: '' };
        readTable_(ss, 'appt').filter(a => a.took === id).forEach(a => {
          const ar = findRow_(as, ah.indexOf('id') + 1, a.id);
          if (ar) writeFields_(as, ar, ah, TABLES.appt.fields.filter(f => f[0] in clear), clear);
        });
      }
    }
    return !!row;
  });
}

// แถบงาน: รายการจาก CT-SIM ที่ไม่ต้องแจกเคส · mark = 'skip' (เฉพาะที่ยังไม่แจก) หรือ '' (คืนกลับเป็นรอแจก: ที่ตั้งไม่ต้องแจกไว้
// หรือเคสที่แจกจากรายการนี้ถูกลบหมดแล้ว เช่นกดเลิกทำ) · คืนรายการ
function ctMark(id, mark, token) {
  const u = requireEdit_(token, ['work']);
  mark = mark === 'skip' ? 'skip' : '';
  return withLock_(() => {
    const ss = ss_(), sh = tableSheet_(ss, 'ctsim'), header = headerOf_(sh), row = findRow_(sh, header.indexOf('id') + 1, id);
    if (!row) throw new Error('ไม่พบรายการนี้ใน CT-SIM (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const took = String(sh.getRange(row, header.indexOf('แจกเคสแล้ว (id)') + 1).getValue() || '').trim();
    const gone = !mark && took && took !== 'skip' && (() => { const ids = readTable_(ss, 'cases').map(c => c.id); return took.split(',').every(x => ids.indexOf(x.trim()) < 0); })();
    if (mark ? took : took !== 'skip' && !gone) throw new Error(took === 'skip' ? 'รายการนี้ตั้งไม่ต้องแจกไว้แล้ว' : took ? 'รายการนี้แจกเคสไปแล้ว' : 'รายการนี้ยังรอแจกเคสอยู่');
    const set = mark ? { took: 'skip', tookBy: String(u.name || u.username || u.me || ''), tookAt: Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm') } : { took: '', tookBy: '', tookAt: '' };
    writeFields_(sh, row, header, TABLES.ctsim.fields.filter(f => f[0] in set), set);
    return readTable_(ss, 'ctsim').filter(x => x.id === id)[0];
  });
}

// รายการ CT-SIM ที่ส่งให้หน้าเว็บ: ตั้งแต่ 13 เดือนก่อน (ส่งออก Excel รายเดือนย้อนหลังได้ 1 ปี)
function recentCt_(ss) {
  const from = Utilities.formatDate(new Date(Date.now() - 400 * 864e5), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  return readTable_(ss, 'ctsim').filter(x => String(x.date) >= from);
}

/**
 * แถบลงทะเบียน: เพิ่มหรือแก้ผู้ป่วย ยืนยันด้วยรหัส PIN (ตั้งค่า → รหัส PIN: ลงทะเบียน)
 * rec = ช่องใน REG_FIELDS · HN คำนำหน้า ชื่อ-สกุล บังคับตาม ตั้งค่า → ลงทะเบียน (config.reg.form · ยังไม่ตั้ง = บังคับ) · ต้องมี HN หรือชื่อ-สกุล
 * HN ซ้ำกับผู้ป่วยคนอื่นไม่ได้ (ไม่สนช่องว่างและตัวพิมพ์) · id ที่ยังไม่มี = เพิ่มใหม่ · คืนรายการหลังบันทึก
 */
const REG_FIELDS = ['hn', 'title', 'name', 'sex', 'birth', 'phone', 'right', 'doc', 'icd', 'dx', 'note'];
const hnKey_ = v => String(v == null ? '' : v).replace(/\s+/g, '').toUpperCase();
const regName_ = r => (r.title + (/[A-Za-z]/.test(r.title) ? ' ' : '') + r.name).trim();
// ผู้ป่วยที่ลงทะเบียน · แถวที่บันทึกด้วยรุ่น 2026-10-30.1 (คอลัมน์ ชื่อ และ สกุล) ใช้สองคอลัมน์นั้นเป็นชื่อ-สกุล
function regRows_(ss) {
  const rows = readTable_(ss, 'reg'), sh = ss.getSheetByName(TABLES.reg.sheet);
  if (!sh || !rows.some(r => !r.name)) return rows;
  const values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues(), head = values.shift().map(v => String(v).trim());
  const id = head.indexOf('id'), first = head.indexOf('ชื่อ'), last = head.indexOf('สกุล');
  if (id < 0 || (first < 0 && last < 0)) return rows;
  const old = {};
  values.forEach(v => { old[String(v[id]).trim()] = [first < 0 ? '' : v[first], last < 0 ? '' : v[last]].map(x => String(x).trim()).filter(Boolean).join(' '); });
  rows.forEach(r => { if (!r.name) r.name = old[r.id] || ''; });
  return rows;
}
function regSave(rec, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.reg);
  rec = rec && typeof rec === 'object' ? rec : {};
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const cfg = readConfig_(ss_()) || {}, form = (cfg.reg && cfg.reg.form) || {};
  const miss = [['hn', 'HN'], ['title', 'คำนำหน้า'], ['name', 'ชื่อ-สกุล']].filter(f => (form[f[0]] || 'req') === 'req' && !cut(rec[f[0]], 200)).map(f => f[1]);
  if (miss.length) throw new Error('กรอก ' + miss.join(' '));
  if (!cut(rec.hn, 40) && !cut(rec.name, 200)) throw new Error('กรอก HN หรือชื่อ-สกุล');
  const birth = cut(rec.birth, 10);
  if (birth && !/^\d{4}-\d{2}-\d{2}$/.test(birth)) throw new Error('วันเกิดไม่ถูกต้อง');
  checkPin_(u, pin, 'reg');
  return withLock_(() => {
    const ss = ss_(), sh = tableSheet_(ss, 'reg'), header = headerOf_(sh);
    const id = cut(rec.id, 80), row = id ? findRow_(sh, header.indexOf('id') + 1, id) : 0;
    const key = hnKey_(cut(rec.hn, 40)), dup = key ? regRows_(ss).filter(x => hnKey_(x.hn) === key && (!row || x.id !== id))[0] : null;
    if (dup) throw new Error('HN ' + cut(rec.hn, 40) + ' ลงทะเบียนแล้ว (' + regName_(dup) + ')');
    const set = {};
    REG_FIELDS.forEach(k => { set[k] = cut(rec[k], k === 'hn' ? 40 : k === 'note' || k === 'dx' ? 2000 : 200); });
    const now = new Date().toISOString();
    if (row) set.updated = now;
    else Object.assign(set, { id: id || Utilities.getUuid(), by: String(u.name || u.username || u.me || ''), created: now, updated: '' });
    writeFields_(sh, row || sh.getLastRow() + 1, header, TABLES.reg.fields.filter(f => f[0] in set), set);
    const want = row ? id : set.id;
    return regRows_(ss).filter(x => x.id === want)[0];
  });
}

// ลบผู้ป่วยในแถบลงทะเบียน ยืนยันด้วยรหัส PIN (นัดของผู้ป่วยไม่ถูกลบ) · คืน true เมื่อลบแล้ว
function regRemove(id, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.reg);
  checkPin_(u, pin, 'reg');
  return withLock_(() => {
    const sh = tableSheet_(ss_(), 'reg'), row = findRow_(sh, headerOf_(sh).indexOf('id') + 1, id);
    if (row) sh.deleteRow(row);
    return !!row;
  });
}

/**
 * แถบลงนัด: เพิ่มหรือแก้นัดทำ CT-Sim ยืนยันด้วยรหัส PIN (ตั้งค่า → รหัส PIN: ลงนัด)
 * rec = ช่องใน APPT_FIELDS (date = วันนัด CT-Sim หรือ 'on call', cm = CM / Non-CM, special = เทคนิคพิเศษ, dpf/fx/rx/freq = Prescription, sim = Start RT,
 *   order = ใบสั่ง CT Sim ส่วนที่เหลือ เป็น JSON: อายุ เพศ Examination Part ท่า Contrast Lab Immobilization ขอบเขตการสแกน)
 * id ที่ยังไม่มี = เพิ่มใหม่ · การลง CT-SIM (took) เปลี่ยนได้ทาง ctSave / apptMark / ctRemove เท่านั้น · คืนรายการหลังบันทึก
 */
const APPT_FIELDS = ['date', 'hn', 'name', 'cm', 'special', 'dpf', 'fx', 'rx', 'freq', 'sim', 'ct', 'room', 'doc', 'icd', 'dx', 'note', 'order'];
function apptSave(rec, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.appt);
  rec = rec && typeof rec === 'object' ? rec : {};
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!cut(rec.hn, 40)) throw new Error('กรอก HN');
  const date = cut(rec.date, 10);
  if (!isDate(date) && date !== 'on call') throw new Error('วันนัด CT-Sim ไม่ถูกต้อง');
  const sim = cut(rec.sim, 10);
  if (sim && sim !== 'on call' && !isDate(sim)) throw new Error('วันที่ Start RT ไม่ถูกต้อง');
  const order = String(rec.order == null ? '' : rec.order);
  if (order) {
    if (order.length > 20000) throw new Error('ข้อมูลใบสั่ง CT Sim ยาวเกินไป');
    let o;
    try { o = JSON.parse(order); } catch (e) { throw new Error('ข้อมูลใบสั่ง CT Sim ไม่ถูกต้อง'); }
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('ข้อมูลใบสั่ง CT Sim ไม่ถูกต้อง');
  }
  checkPin_(u, pin, 'appt');
  return withLock_(() => {
    const ss = ss_(), sh = tableSheet_(ss, 'appt'), header = headerOf_(sh);
    const id = cut(rec.id, 80), row = id ? findRow_(sh, header.indexOf('id') + 1, id) : 0;
    const set = {};
    APPT_FIELDS.forEach(k => { set[k] = cut(rec[k], k === 'order' ? 20000 : k === 'note' || k === 'dx' ? 2000 : 200); });
    const now = new Date().toISOString();
    if (row) set.updated = now;
    else Object.assign(set, { id: id || Utilities.getUuid(), by: String(u.name || u.username || u.me || ''), created: now, updated: '' });
    writeFields_(sh, row || sh.getLastRow() + 1, header, TABLES.appt.fields.filter(f => f[0] in set), set);
    const want = row ? id : set.id;
    return readTable_(ss, 'appt').filter(x => x.id === want)[0];
  });
}

// ลบนัดในแถบลงนัด ยืนยันด้วยรหัส PIN (รายการ CT-SIM ที่ลงจากนัดนี้แล้วไม่ถูกลบ) · คืน true เมื่อลบแล้ว
function apptRemove(id, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.appt);
  checkPin_(u, pin, 'appt');
  return withLock_(() => {
    const sh = tableSheet_(ss_(), 'appt'), row = findRow_(sh, headerOf_(sh).indexOf('id') + 1, id);
    if (row) sh.deleteRow(row);
    return !!row;
  });
}

// แถบ CT-SIM (หรือลงนัด): นัดที่ผู้ป่วยไม่มาทำ CT · mark = 'skip' (เฉพาะที่ยังรอลง CT-SIM) หรือ '' (คืนกลับเป็นรอ) · คืนรายการ
function apptMark(id, mark, token) {
  const u = requireEdit_(token, EDIT_VIEWS.ctsim.concat(EDIT_VIEWS.appt));
  mark = mark === 'skip' ? 'skip' : '';
  return withLock_(() => {
    const ss = ss_(), sh = tableSheet_(ss, 'appt'), header = headerOf_(sh), row = findRow_(sh, header.indexOf('id') + 1, id);
    if (!row) throw new Error('ไม่พบนัดนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const took = String(sh.getRange(row, header.indexOf('ลง CT-SIM แล้ว (id)') + 1).getValue() || '').trim();
    if (mark ? took : took !== 'skip') throw new Error(took === 'skip' ? 'นัดนี้ตั้งว่าไม่มาทำ CT ไว้แล้ว' : took ? 'นัดนี้ลง CT-SIM ไปแล้ว' : 'นัดนี้ยังรอลง CT-SIM อยู่');
    const set = mark ? { took: 'skip', tookBy: String(u.name || u.username || u.me || ''), tookAt: Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm') } : { took: '', tookBy: '', tookAt: '' };
    writeFields_(sh, row, header, TABLES.appt.fields.filter(f => f[0] in set), set);
    return readTable_(ss, 'appt').filter(x => x.id === id)[0];
  });
}

// นัดที่ส่งให้หน้าเว็บ: วันนัด CT ตั้งแต่ 13 เดือนก่อน (รวมนัดล่วงหน้าทั้งหมด)
function recentAppt_(ss) {
  const from = Utilities.formatDate(new Date(Date.now() - 400 * 864e5), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  return readTable_(ss, 'appt').filter(x => (x.date === 'on call' ? String(x.created).slice(0, 10) : String(x.date)) >= from);   // On Call: นับจากวันที่ลงนัด
}

/**
 * แถบ RTT/RA Jobs: บันทึกภาระงานของเดือน (ของตัวเอง · แอดมินบันทึกแทนได้) ยืนยันด้วยรหัส PIN (ตั้งค่า → รหัส PIN: RTT/RA Jobs)
 * rec = { ym: 'YYYY-MM', who: ชื่อ-สกุล (ตรงกับชื่อในผู้ปฏิบัติงานประจำวัน), kind: 'rtt' | 'ra', prof, cells, leaves (JSON) } · คืนรายการหลังบันทึก
 */
const JOB_KINDS = ['rtt', 'ra'];
// ชื่อเทียบกัน: ไม่สนคำนำหน้าและช่องว่าง (เหมือน nameKey ในหน้าเว็บ)
const nameKey_ = v => String(v == null ? '' : v).trim().replace(/^(นางสาว|นาง|นาย|น\.ส\.|ดร\.|นพ\.|พญ\.)/, '').replace(/\s+/g, '').toLowerCase();
function jobsSave(rec, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.jobs);
  rec = rec && typeof rec === 'object' ? rec : {};
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const ym = cut(rec.ym, 7), who = cut(rec.who, 120), kind = cut(rec.kind, 10);
  if (!/^\d{4}-\d{2}$/.test(ym)) throw new Error('เดือนไม่ถูกต้อง');
  if (!nameKey_(who)) throw new Error('ไม่มีชื่อผู้ปฏิบัติงาน');
  if (JOB_KINDS.indexOf(kind) < 0) throw new Error('แบบฟอร์มไม่ถูกต้อง');
  const own = u.via === 'lpch' && nameKey_(who) === nameKey_(u.name);
  if (!own && !u.isAdmin) throw new Error('บันทึกได้เฉพาะภาระงานของตัวเอง (แอดมินบันทึกแทนได้)');
  const json = (v, isArr, max) => {
    const t = String(v == null ? '' : v);
    if (!t) return '';
    if (t.length > max) throw new Error('ข้อมูลภาระงานยาวเกินไป');
    let o;
    try { o = JSON.parse(t); } catch (e) { throw new Error('ข้อมูลภาระงานไม่ถูกต้อง'); }
    if (isArr ? !Array.isArray(o) : !o || typeof o !== 'object' || Array.isArray(o)) throw new Error('ข้อมูลภาระงานไม่ถูกต้อง');
    return JSON.stringify(o);
  };
  const cells = json(rec.cells, false, 45000), leaves = json(rec.leaves, true, 5000), prof = json(rec.prof, false, 2000);
  checkPin_(u, pin, 'jobs');
  return withLock_(() => {
    const ss = ss_(), sh = tableSheet_(ss, 'jobs'), header = headerOf_(sh), id = nameKey_(who) + '|' + ym;
    const row = findRow_(sh, header.indexOf('id') + 1, id);
    const old = row ? readTable_(ss, 'jobs').filter(x => x.id === id)[0] : null;
    const set = { id: id, ym: ym, who: who, user: own ? String(u.username || '') : (old && old.user) || cut(rec.user, 80), kind: kind, prof: prof, cells: cells, leaves: leaves,
      by: String(u.name || u.username || u.me || ''), updated: new Date().toISOString() };
    writeFields_(sh, row || sh.getLastRow() + 1, header, TABLES.jobs.fields, set);
    return readTable_(ss, 'jobs').filter(x => x.id === id)[0];
  });
}
// ภาระงานที่ส่งให้หน้าเว็บ: 13 เดือนล่าสุด · ของตัวเอง (ชื่อตรงกับบัญชี LPCH) · แอดมินและบัญชี Google ได้ทุกคน
function jobsFor_(ss, user) {
  const d = new Date(Date.now() - 400 * 864e5), from = Utilities.formatDate(d, ss.getSpreadsheetTimeZone(), 'yyyy-MM');
  const all = readTable_(ss, 'jobs').filter(x => String(x.id).split('|')[1] >= from);
  if (user.via === 'google' || user.isAdmin) return all;
  const me = nameKey_(user.name);
  return me ? all.filter(x => nameKey_(x.who) === me) : [];
}

// ตำแหน่งใน LPCH ที่เป็น RTT / RA (ตั้งค่า → ตารางวันฉาย · config.dutyRoles)
function dutyRoles_(cfg) {
  const r = cfg && cfg.dutyRoles && typeof cfg.dutyRoles === 'object' ? cfg.dutyRoles : {};
  const list = (v, d) => (Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : d);
  return { rtt: list(r.rtt, ['RTT']), ra: list(r.ra, ['RA']) };
}

// เก็บรายชื่อ RTT / RA ล่าสุดที่ดึงจาก LPCH ได้ (Script property DUTY_MEMBERS) ไว้ใช้ตอนที่ LPCH ไม่ให้ดึงด้วยบัญชีนั้น
function keepDutyMembers_(users) {
  try {
    const roles = dutyRoles_(readConfig_(ss_()) || {}), want = roles.rtt.concat(roles.ra);
    let keep = users.filter(x => want.indexOf(x.role) >= 0).map(x => ({ username: x.username, name: x.name, role: x.role }));
    let text = JSON.stringify({ at: new Date().toISOString(), users: keep });
    while (text.length > 8500 && keep.length) { keep = keep.slice(0, Math.floor(keep.length * 0.8)); text = JSON.stringify({ at: new Date().toISOString(), users: keep }); }
    PropertiesService.getScriptProperties().setProperty('DUTY_MEMBERS', text);
  } catch (e) { /* เก็บไม่ได้: ครั้งหน้าดึงใหม่ */ }
}

/**
 * รายชื่อให้เลือกผู้ปฏิบัติงานประจำวัน: สมาชิก LPCH RO Workspace ที่ตำแหน่งตรงกับ RTT / RA ใน ตั้งค่า (ไม่ส่งตำแหน่งอื่น)
 * ดึงจาก LPCH ด้วยบัญชีที่เข้าระบบ · ดึงไม่ได้ (LPCH ไม่ให้ หรือเปิดจากเมนูในชีต) ใช้รายชื่อล่าสุดที่เคยดึงได้ · { rtt, ra, at, live, why }
 */
function dutyMembers(token) {
  const u = requireEdit_(token, EDIT_VIEWS.course.concat(EDIT_VIEWS.ctsim));
  const roles = dutyRoles_(readConfig_(ss_()) || {});
  let users = null, why = '';
  if (u.via === 'lpch') {
    try {
      const out = lpchCall_({ action: 'directory', token: String(token) });
      users = (Array.isArray(out.users) ? out.users : []).map(x => ({ username: String(x.username || ''), name: String(x.fullName || x.username || ''), role: String(x.role || '') })).filter(x => x.username);
      keepDutyMembers_(users);
    } catch (e) { why = e.message; }
  } else why = 'บัญชี Google ดึงรายชื่อจาก LPCH ไม่ได้';
  let at = new Date().toISOString();
  if (!users) {
    let kept = null;
    try { kept = JSON.parse(PropertiesService.getScriptProperties().getProperty('DUTY_MEMBERS') || 'null'); } catch (e) { kept = null; }
    users = kept && Array.isArray(kept.users) ? kept.users : [];
    at = kept ? String(kept.at || '') : '';
  }
  const pick = list => users.filter(x => list.indexOf(x.role) >= 0).map(x => ({ username: x.username, name: x.name, role: x.role }));
  return { rtt: pick(roles.rtt), ra: pick(roles.ra), at: at, live: !why, why: why };
}

/* ---------- สถิติ Brachytherapy จากระบบนัด Brachytherapy (อ่าน Google Sheet ของระบบนั้นโดยตรง) ---------- */
// ตั้งค่า → Brachytherapy (config.brachySync): { on, url = ลิงก์ชีตของระบบนัด, sheet = แท็บ, map = { คีย์: หัวคอลัมน์ }, count: 'all' | 'done', from: 'yyyy-MM-dd' }
// นัดหนึ่งครั้ง (ไม่ยกเลิก · count 'done' = เฉพาะ "มาตามนัด") = กิจกรรม Brachy ของผู้วางแผน (MP) + RC ของคน RC (HN ชื่อ วันนัด)
// เทคนิค Interstitial needle / เสียบเข็ม = Brachy เสียบเข็ม · MP / RC ในระบบนัดเป็นรหัส ชื่อผู้ใช้ อีเมล หรือชื่อ-สกุล (ตั้งค่า → ทีมนักฟิสิกส์)
// รายการที่ดึงมามี src = brachy:<รหัสนัด>:plan|rc · ต้นทางแก้ = แก้ตาม · ยกเลิกหรือหายไป = ลบ · มีรายการที่บันทึกเอง (วัน HN คน ประเภทเดียวกัน) = ไม่เพิ่มซ้ำ
// ดึงเมื่อ: หน้าเว็บเปิดและดึงครั้งล่าสุดเกิน BRACHY_EVERY_MIN นาที (brachyPull) · ปุ่มดึงตอนนี้ (แอดมิน) · ตัวตั้งเวลาของ Apps Script ที่เจ้าของสร้างเอง (brachyTick)
const BRACHY_ST_DONE = 'มาตามนัด', BRACHY_ST_CANCEL = 'ยกเลิก';
const BRACHY_EVERY_MIN = 10;
const BRACHY_KEYS = {
  id: ['apptid', 'appointmentid', 'appt', 'id', 'รหัสนัด', 'เลขที่นัด', 'รหัสนัดหมาย', 'ไอดี'],
  date: ['date', 'วันที่', 'วันนัด', 'วันที่นัด', 'นัดวันที่', 'apptdate', 'appointmentdate'],
  hn: ['hn'],
  name: ['name', 'ชื่อ', 'ชื่อสกุล', 'ชื่อผู้ป่วย', 'ผู้ป่วย', 'patient', 'patientname', 'fullname'],
  technique: ['technique', 'เทคนิค', 'tech', 'รูปแบบการใส่', 'รูปแบบการใส่แร่', 'การใส่', 'การใส่แร่', 'ชนิดการใส่', 'รูปแบบ', 'applicator', 'applicatortype', 'insertion', 'insertiontype', 'วิธี', 'method', 'type', 'ชนิด'],
  mp: ['mp', 'ผู้วางแผน', 'วางแผน', 'planner', 'plannedby', 'planby', 'physicist', 'นักฟิสิกส์', 'นักฟิสิกส์การแพทย์', 'mpวางแผน'],
  rc: ['rc', 'ผู้ตรวจ', 'checker', 'mprc'],
  status: ['status', 'สถานะ'],
  fx: ['fx', 'fraction', 'ครั้งที่', 'fxที่'],
  totalFx: ['totalfx', 'fxทั้งหมด', 'จำนวนครั้ง', 'จำนวนfx', 'totalfraction'],
};
// ต้องมี: วันที่ HN MP · ไม่มีรหัสนัด = ใช้ HN + วันที่ + Fx แทน (เลื่อนวันนัด = ลบรายการเดิม เพิ่มรายการใหม่)
const BRACHY_NEED = ['date', 'hn', 'mp'];
// รูปแบบการใส่ / เทคนิคที่เป็นเสียบเข็ม (Interstitial needle · เสียบเข็ม · รหัส I ของระบบนัด) = Brachy เสียบเข็ม
const BRACHY_NEEDLE = /interstitial|needle|เข็ม|^i$/i;
const BRACHY_LABEL = { id: 'รหัสนัด', date: 'วันที่', hn: 'HN', mp: 'MP (ผู้วางแผน)' };
const brachyNorm_ = v => String(v || '').toLowerCase().replace(/[\s_.\-:]+/g, '');
// หัวคอลัมน์ → คำที่ใช้เทียบ: ทั้งชื่อ · ส่วนนอกวงเล็บ · ส่วนในวงเล็บ (เช่น "MP (ผู้วางแผน)" = mp, ผู้วางแผน)
function brachyHeadKeys_(h) {
  const t = String(h || ''), out = [t, t.replace(/\(.*?\)/g, '')];
  (t.match(/\(([^)]*)\)/g) || []).forEach(x => out.push(x.slice(1, -1)));
  return out.map(brachyNorm_).filter(Boolean);
}

// เปิดชีตของระบบอื่นจากลิงก์ในตั้งค่า (what = ชื่อระบบในข้อความ · ชื่ออังกฤษเว้นวรรคหน้า)
function extBook_(s, what) {
  what = /^[A-Za-z]/.test(what) ? ' ' + what : what;
  const raw = String((s && s.url) || '').trim();
  const m = /\/d\/([\w-]{20,})/.exec(raw) || /^([\w-]{20,})$/.exec(raw);
  if (!m) throw new Error(raw ? 'ลิงก์ชีตของ' + what + ' ต้องเป็นลิงก์ Google Sheet (docs.google.com/spreadsheets/d/…) ไม่ใช่ลิงก์หน้าเว็บ' : 'ยังไม่ได้ใส่ลิงก์ชีตของ' + what);
  try { return SpreadsheetApp.openById(m[1]); } catch (e) {
    throw new Error('เปิดชีตของ' + what + ' ไม่ได้ (' + e.message + ') · บัญชี Google ที่ Deploy ระบบนี้ต้องเปิดชีตนั้นได้ (แชร์ให้อย่างน้อยดูได้)');
  }
}
const brachyBook_ = s => extBook_(s, 'ระบบนัด Brachytherapy');

// หัวคอลัมน์ที่น่าจะเป็นแต่ละคีย์ · แท็บที่ตรงมากสุด (ต้องมี รหัสนัด วันที่ HN MP)
function brachyGuess_(headers, keys) {
  const map = {}, used = {};
  keys = keys || BRACHY_KEYS;
  Object.keys(keys).forEach(k => {
    const names = keys[k].map(brachyNorm_);
    const h = headers.filter(x => !used[x] && brachyHeadKeys_(x).some(v => names.indexOf(v) >= 0))[0];
    if (h) { map[k] = h; used[h] = true; }
  });
  return map;
}
function brachyTabs_(book) {
  return book.getSheets().map(sh => ({ name: sh.getName(), headers: headerOf_(sh).filter(Boolean).slice(0, 40), rows: Math.max(0, sh.getLastRow() - 1) }));
}
function brachyPick_(tabs, s, keys, enough) {
  const named = s && s.sheet ? tabs.filter(t => t.name === s.sheet)[0] : null;
  if (named) return named;
  let best = null, score = -1;
  enough = enough || (g => BRACHY_NEED.every(k => g[k]));
  tabs.forEach(t => {
    const g = brachyGuess_(t.headers, keys), n = Object.keys(g).length + (enough(g) ? 100 : 0);
    if (n > score) { best = t; score = n; }
  });
  return best;
}

// อ่านนัดทั้งหมดของแท็บที่เลือก [{ key, id, date, hn, name, technique, mp, rc, status, fx, totalFx }]
// soft = ตรวจชีต: คอลัมน์ที่ต้องมียังไม่ครบไม่ถือว่าผิด (คืน missing ให้แอดมินเลือกคอลัมน์)
function brachyRead_(book, s, soft) {
  const tabs = brachyTabs_(book), tab = brachyPick_(tabs, s);
  if (!tab) throw new Error('ไม่พบแท็บในชีตของระบบนัด');
  const map = Object.assign(brachyGuess_(tab.headers), s && s.map && typeof s.map === 'object' ? s.map : {});
  const miss = BRACHY_NEED.filter(k => !map[k] || tab.headers.indexOf(map[k]) < 0);
  if (miss.length && soft) return { tab: tab, map: map, tabs: tabs, rows: [], missing: miss };
  if (miss.length) throw new Error('ยังไม่ได้เลือกคอลัมน์ ' + miss.map(k => BRACHY_LABEL[k]).join(', ') + ' ของแท็บ ' + tab.name + ' · ตั้งค่า → Brachytherapy จากระบบนัด → ตรวจชีต แล้วเลือกคอลัมน์');
  const sh = book.getSheetByName(tab.name), tz = book.getSpreadsheetTimeZone();
  const last = sh.getLastRow(), width = sh.getLastColumn();
  const values = last > 1 ? sh.getRange(1, 1, last, width).getValues() : [];
  const header = (values.shift() || []).map(v => String(v).trim());
  const col = {};
  Object.keys(BRACHY_KEYS).forEach(k => { col[k] = map[k] ? header.indexOf(map[k]) : -1; });
  const rows = values.map(r => {
    const o = {};
    Object.keys(col).forEach(k => { o[k] = col[k] < 0 ? '' : cellText_(r[col[k]], tz); });
    o.date = brachyDate_(o.date);
    o.hn = String(o.hn).replace(/\.0$/, '');
    o.key = o.id || (o.hn && o.date ? o.hn + '|' + o.date + '|' + o.fx : '');
    return o;
  }).filter(o => o.key);
  return { tab: tab, map: map, tabs: tabs, rows: rows, missing: [] };
}

// วันที่ของระบบนัด: วันที่ของชีต (yyyy-MM-dd) หรือข้อความ d/M/yyyy (ปี พ.ศ. ได้)
function brachyDate_(v) {
  const t = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) return t;
  const y = +m[3] > 2400 ? +m[3] - 543 : +m[3];
  return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
}

// MP / RC ของระบบนัด → รหัสนักฟิสิกส์ (รหัส · ชื่อผู้ใช้ · อีเมล · ชื่อ-สกุล ไม่สนคำนำหน้าและช่องว่าง)
function brachyStaff_(cfg) {
  const staff = Array.isArray(cfg && cfg.staff) && cfg.staff.length ? cfg.staff : DEFAULT_STAFF.map(code => ({ code: code }));
  const key = v => String(v || '').trim().replace(/^(นางสาว|นาง|นาย|น\.ส\.|ดร\.)/, '').replace(/\s+/g, '').toLowerCase();
  return v => {
    const t = String(v || '').trim(), low = t.toLowerCase();
    if (!t) return '';
    const hit = staff.filter(x => String(x.code || '').toUpperCase() === t.toUpperCase()
      || (x.user && String(x.user).toLowerCase() === low) || (x.email && String(x.email).toLowerCase() === low) || (x.name && key(x.name) === key(t)))[0];
    return hit ? String(hit.code).toUpperCase() : '';
  };
}

// รายการกิจกรรมที่ควรมี { src: rec } และสรุป (นัดที่นับ, MP/RC ที่ไม่รู้จัก)
function brachyWanted_(rows, s, cfg) {
  const want = {}, unknown = {}, staffOf = brachyStaff_(cfg), acts = cfg && cfg.acts;
  const needleOn = !acts || !!acts.brachyn;
  const label = k => (acts && acts[k] && acts[k].label) || (k === 'brachyn' ? 'Brachy เสียบเข็ม' : 'Brachy 3D');
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(s.from || '')) ? s.from : '';
  let counted = 0;
  rows.forEach(r => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || (from && r.date < from)) return;
    const st = String(r.status).trim();
    if (st === BRACHY_ST_CANCEL || (s.count === 'done' && st !== BRACHY_ST_DONE)) return;
    counted++;
    const mp = staffOf(r.mp), rc = staffOf(r.rc);
    if (r.mp && !mp) unknown[r.mp] = (unknown[r.mp] || 0) + 1;
    if (r.rc && !rc) unknown[r.rc] = (unknown[r.rc] || 0) + 1;
    const kind = needleOn && BRACHY_NEEDLE.test(String(r.technique).trim()) ? 'brachyn' : 'brachy';
    const fx = r.fx ? 'Fx ' + r.fx + (r.totalFx ? '/' + r.totalFx : '') : '';
    const note = [fx, r.technique, 'ระบบนัด Brachytherapy'].filter(Boolean).join(' · ');
    const base = { date: r.date, hn: r.hn, name: r.name, note: note };
    if (mp) want['brachy:' + r.key + ':plan'] = Object.assign({ kind: kind, mp: mp, title: '' }, base);
    if (rc && mp && rc !== mp) want['brachy:' + r.key + ':rc'] = Object.assign({ kind: 'rc', mp: rc, title: label(kind) + ' ของ ' + mp }, base);
  });
  return { want: want, unknown: unknown, counted: counted, from: from };
}

// ระบบอื่นที่ดึงมาบันทึก: Brachytherapy (ระบบนัด) · RC จาก TDF Dose Calculator · src ของรายการขึ้นต้นด้วยคีย์
const EXT = {
  brachy: { cfg: 'brachySync', prop: 'BRACHY_SYNC', what: 'ระบบนัด Brachytherapy', read: (b, s, soft) => brachyRead_(b, s, soft), wanted: (r, s, c) => brachyWanted_(r, s, c) },
  tdf: { cfg: 'tdfSync', prop: 'TDF_SYNC', what: 'TDF Dose Calculator', read: (b, s, soft) => tdfRead_(b, s, soft), wanted: (r, s, c) => tdfWanted_(r, s, c) },
};

// ดึงและบันทึก · คืนสรุปที่เก็บไว้ใน Script property (BRACHY_SYNC, TDF_SYNC)
function brachySync_(ss, cfg, why) { return extSync_(ss, cfg, 'brachy', why); }
function extSync_(ss, cfg, key, why) {
  const x = EXT[key], s = (cfg && cfg[x.cfg]) || {};
  const res = { at: new Date().toISOString(), why: why || '', ok: false, added: 0, updated: 0, removed: 0, manual: 0, counted: 0, unknown: {}, tab: '', error: '' };
  try {
    const book = extBook_(s, x.what), got = x.read(book, s), w = x.wanted(got.rows, s, cfg);
    Object.assign(res, { tab: got.tab.name, counted: w.counted, unknown: w.unknown });
    if (w.self) res.self = w.self;
    withLock_(() => {
      const sh = tableSheet_(ss, 'logs'), header = headerOf_(sh), fields = TABLES.logs.fields;
      const logs = readTable_(ss, 'logs');
      const mine = {}, manual = [];
      logs.forEach(l => { if (String(l.src).indexOf(key + ':') === 0) mine[l.src] = l; else if (!l.src) manual.push(l); });
      const same = (a, b) => ['kind', 'mp', 'date', 'hn', 'name', 'title', 'note'].every(k => String(a[k] || '') === String(b[k] || ''));
      const isDup = r => manual.some(l => l.date === r.date && l.hn === r.hn && l.mp === r.mp && (r.kind === 'rc' ? l.kind === 'rc' : l.kind === 'brachy' || l.kind === 'brachyn'));
      const now = new Date().toISOString();
      // แก้รายการเดิม
      Object.keys(mine).forEach(k => {
        const r = w.want[k];
        if (!r || same(mine[k], r)) return;
        const row = findRow_(sh, header.indexOf('id') + 1, mine[k].id);
        if (row) { writeFields_(sh, row, header, fields, Object.assign({}, mine[k], r, { updated: now })); res.updated++; }
      });
      // ลบ: นัดถูกยกเลิก เปลี่ยนเป็นไม่นับ หรือหายไป (เฉพาะวันที่ตั้งแต่ "ดึงตั้งแต่")
      const drop = Object.keys(mine).filter(k => !w.want[k] && (!w.from || mine[k].date >= w.from)).map(k => findRow_(sh, header.indexOf('id') + 1, mine[k].id)).filter(Boolean).sort((a, b) => b - a);
      drop.forEach(r => sh.deleteRow(r));
      res.removed = drop.length;
      // เพิ่มใหม่ (ทีละชุด)
      const add = [];
      Object.keys(w.want).forEach(k => {
        if (mine[k]) return;
        const r = w.want[k];
        if (isDup(r)) { res.manual++; return; }
        add.push(Object.assign({ id: Utilities.getUuid(), caseId: '', min: '', k: '', created: now, updated: '', src: k }, r));
      });
      if (add.length) {
        const cols = header.map(h => fields.filter(f => f[1] === h)[0]);
        sh.getRange(sh.getLastRow() + 1, 1, add.length, header.length).setNumberFormat('@')
          .setValues(add.map(rec => cols.map(f => (f ? safeText_(rec[f[0]]) : ''))));
      }
      res.added = add.length;
    });
    res.ok = true;
  } catch (e) { res.error = e.message; }
  try { PropertiesService.getScriptProperties().setProperty(x.prop, JSON.stringify(res).slice(0, 8000)); } catch (e) { /* เก็บสรุปไม่ได้: ครั้งหน้าดึงใหม่ */ }
  return res;
}
function extStatus_(key) {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(EXT[key].prop) || 'null'); } catch (e) { return null; }
}
function brachyStatus_() { return extStatus_('brachy'); }

/**
 * แอดมิน: ตรวจชีตของระบบนัดด้วยค่าที่กำลังตั้ง (ยังไม่บันทึก) · ไม่เขียนอะไร
 * { title, tabs: [{ name, headers, rows }], tab, map, preview: { rows, counted, plan, rc, needle, statuses, unknown, first, last } }
 */
function brachyCheck(s, token) {
  const u = who_(token);
  if (!u.isAdmin) throw new Error('ตั้งค่าการดึง Brachytherapy ได้เฉพาะแอดมิน');
  s = s && typeof s === 'object' ? s : {};
  const book = brachyBook_(s), got = brachyRead_(book, s, true), w = brachyWanted_(got.rows, s, readConfig_(ss_()) || {});
  const statuses = {}, techniques = {}, keys = Object.keys(w.want);
  got.rows.forEach(r => {
    const k = String(r.status).trim() || '(ว่าง)', t = String(r.technique).trim() || '(ว่าง)';
    statuses[k] = (statuses[k] || 0) + 1;
    techniques[t] = (techniques[t] || 0) + 1;
  });
  const dates = got.rows.map(r => r.date).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  return {
    title: book.getName(), tabs: got.tabs, tab: got.tab.name, map: got.map, missing: got.missing,
    preview: got.missing.length ? null : {
      rows: got.rows.length, counted: w.counted, statuses: statuses, techniques: techniques, unknown: w.unknown, first: dates[0] || '', last: dates[dates.length - 1] || '',
      plan: keys.filter(k => /:plan$/.test(k)).length, rc: keys.filter(k => /:rc$/.test(k)).length, needle: keys.filter(k => w.want[k].kind === 'brachyn').length,
    },
  };
}

// หน้าเว็บเรียกตอนเปิด: ดึงเมื่อครั้งล่าสุดเกิน BRACHY_EVERY_MIN นาที (force = ปุ่มดึงตอนนี้ของแอดมิน) · คืนสรุปล่าสุด
function brachyPull(force, token) { return extPull_('brachy', force, token); }
function tdfPull(force, token) { return extPull_('tdf', force, token); }
function extPull_(key, force, token) {
  const u = who_(token), x = EXT[key];
  if (force && !u.isAdmin) throw new Error('ดึงตอนนี้ได้เฉพาะแอดมิน');
  const ss = ss_(), cfg = readConfig_(ss) || {};
  if (!cfg[x.cfg] || !cfg[x.cfg].on) return extStatus_(key);
  const last = extStatus_(key);
  if (!force && last && Date.now() - new Date(last.at).getTime() < BRACHY_EVERY_MIN * 60000) return last;
  const cache = CacheService.getScriptCache();
  if (!force && cache.get(key + '_busy')) return last;
  cache.put(key + '_busy', '1', 120);
  try { return extSync_(ss, cfg, key, force ? 'ดึงตอนนี้ (' + (u.name || u.username || u.me || '') + ')' : 'เปิดหน้าเว็บ'); } finally { cache.remove(key + '_busy'); }
}

// ตัวตั้งเวลาของ Apps Script (เจ้าของสร้างเอง: Triggers → Add Trigger → brachyTick → Time-driven ทุก 10 นาที) ดึงแม้ไม่มีใครเปิดหน้าเว็บ
// ดึงทุกระบบที่เปิดไว้ (Brachytherapy และ RC จาก TDF)
function brachyTick() {
  const ss = ss_(), cfg = readConfig_(ss) || {};
  Object.keys(EXT).forEach(k => { if (cfg[EXT[k].cfg] && cfg[EXT[k].cfg].on) extSync_(ss, cfg, k, 'ตั้งเวลา'); });
}

/* ---------- RC จาก TDF Dose Calculator (อ่าน Google Sheet ของระบบนั้นโดยตรง) ---------- */
// ตั้งค่า → RC จาก TDF Dose Calculator (config.tdfSync): { on, url, sheet, map, count: 'approved' | 'reviewed', from }
// ผลคำนวณที่มีคน Recheck (approved · 'reviewed' = รวมไม่ผ่าน) = RC ของคน Recheck: "TDF <ประเภท> ของ <คนคำนวณ>" HN ชื่อผู้ป่วย วันที่ Recheck
// และ RC ของคนคำนวณ (แต้ม RC เท่ากัน): "TDF <ประเภท> ที่คำนวณเอง · Recheck โดย <คน Recheck>" · คนคำนวณ Recheck เอง = ไม่นับทั้งคู่
// ชีตเก็บเป็นคอลัมน์ หรือเก็บทั้งรายการเป็น JSON ในช่องเดียว ({ id, at, status, type, calc, review, patient }) ก็อ่านได้
const TDF_KEYS = {
  id: ['id', 'recordid', 'รหัส'],
  json: ['json', 'data', 'record', 'payload', 'ข้อมูล', 'rec'],
  date: ['at', 'date', 'created', 'createdat', 'วันที่', 'วันที่คำนวณ'],
  reviewAt: ['reviewat', 'recheckat', 'reviewedat', 'วันที่recheck', 'วันที่ตรวจ'],
  status: ['status', 'สถานะ'],
  type: ['type', 'ประเภท', 'ชนิด'],
  calc: ['calc', 'calcby', 'calculator', 'calcname', 'calcusername', 'คนคำนวณ', 'ผู้คำนวณ'],
  rc: ['review', 'reviewer', 'reviewby', 'reviewname', 'reviewusername', 'recheck', 'recheckby', 'rc', 'ผู้ตรวจ', 'คนตรวจ', 'ผู้recheck', 'คนrecheck'],
  hn: ['hn', 'patienthn'],
  name: ['name', 'patientname', 'ชื่อ', 'ชื่อผู้ป่วย', 'ชื่อสกุล'],
};
const TDF_TYPE = { frac: 'Fractionated', gap: 'Treatment gap', brachy: 'Brachytherapy' };
const TDF_LABEL = { json: 'ข้อมูล (JSON)', date: 'วันที่', hn: 'HN', rc: 'คน Recheck (RC)' };
// วันที่: วันที่ของชีต · เวลาเป็นมิลลิวินาที (Date.now()) · ISO · d/M/yyyy
function extDay_(v, tz) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v) ? '' : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const t = String(v).trim();
  if (typeof v === 'number' || /^\d{11,13}$/.test(t)) return +t > 1e11 ? Utilities.formatDate(new Date(+t), tz, 'yyyy-MM-dd') : '';
  if (/^\d{4}-\d{2}-\d{2}T/.test(t)) { const d = new Date(t); return isNaN(d) ? t.slice(0, 10) : Utilities.formatDate(d, tz, 'yyyy-MM-dd'); }
  return brachyDate_(t);
}
const extObj_ = v => {
  if (v && typeof v === 'object' && Object.prototype.toString.call(v) !== '[object Date]') return v;
  const t = String(v || '').trim();
  if (t.charAt(0) === '{') { try { const o = JSON.parse(t); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } }
  return null;
};
// คน (คนคำนวณ / คน Recheck): { username, name } หรือข้อความ → [ชื่อผู้ใช้, ชื่อ, อีเมล] ที่ใช้จับคู่กับทีม
const extWho_ = v => { const o = extObj_(v); return o ? [o.username, o.name, o.email].map(x => String(x || '').trim()).filter(Boolean) : (String(v || '').trim() ? [String(v).trim()] : []); };

function tdfRead_(book, s, soft) {
  const tabs = brachyTabs_(book);
  const tab = brachyPick_(tabs, s, TDF_KEYS, g => !!g.json || (!!g.rc && !!g.hn));
  if (!tab) throw new Error('ไม่พบแท็บในชีตของ TDF Dose Calculator');
  const sh = book.getSheetByName(tab.name), tz = book.getSpreadsheetTimeZone();
  const last = sh.getLastRow(), width = sh.getLastColumn();
  const values = last > 1 ? sh.getRange(1, 1, last, width).getValues() : [];
  const header = (values.shift() || []).map(v => String(v).trim());
  const map = Object.assign(brachyGuess_(tab.headers, TDF_KEYS), s && s.map && typeof s.map === 'object' ? s.map : {});
  // ไม่มีหัวคอลัมน์ JSON: ดูช่องในแถวแรกที่เป็น JSON ของรายการ (มี calc / review / patient)
  if (!(s && s.map && 'json' in s.map) && !map.json && values.length) {
    const j = header.filter((h, i) => { const o = extObj_(values[0][i]); return !!o && ('calc' in o || 'review' in o || 'patient' in o); })[0];
    if (j) map.json = j;
  }
  const has = k => !!map[k] && header.indexOf(map[k]) >= 0;
  const miss = has('json') ? [] : ['date', 'hn', 'rc'].filter(k => (k === 'date' ? !has('date') && !has('reviewAt') : !has(k)));
  if (miss.length && soft) return { tab: tab, map: map, tabs: tabs, rows: [], missing: miss };
  if (miss.length) throw new Error('ยังไม่ได้เลือกคอลัมน์ ' + miss.map(k => TDF_LABEL[k]).join(', ') + ' ของแท็บ ' + tab.name + ' · ตั้งค่า → RC จาก TDF Dose Calculator → ตรวจชีต แล้วเลือกคอลัมน์');
  const col = {};
  Object.keys(TDF_KEYS).forEach(k => { col[k] = has(k) ? header.indexOf(map[k]) : -1; });
  const rows = values.map(r => {
    const c = k => (col[k] >= 0 ? r[col[k]] : '');
    const j = extObj_(c('json')) || {}, p = extObj_(j.patient) || {};
    const ca = j.calc || c('calc'), rv = j.review || c('rc'), rvo = extObj_(rv) || {};
    const o = {
      id: String(j.id || cellText_(c('id'), tz) || '').trim(),
      status: String(j.status || cellText_(c('status'), tz) || '').trim(),
      type: String(j.type || cellText_(c('type'), tz) || '').trim(),
      calc: extWho_(ca), rc: extWho_(rv), rcRaw: rv,
      calcName: String((extObj_(ca) || {}).name || (extObj_(ca) ? '' : cellText_(ca, tz)) || '').trim(),
      hn: String(p.hn || cellText_(c('hn'), tz) || '').replace(/\.0$/, '').trim(),
      name: String(p.name || p.fullName || cellText_(c('name'), tz) || '').trim(),
      date: extDay_(rvo.at || c('reviewAt') || j.at || c('date'), tz),
    };
    o.key = o.id || (o.hn && o.date ? o.hn + '|' + o.date : '');
    return o;
  }).filter(o => o.key);
  return { tab: tab, map: map, tabs: tabs, rows: rows, missing: [] };
}

function tdfWanted_(rows, s, cfg) {
  const want = {}, unknown = {}, staffOf = brachyStaff_(cfg);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(s.from || '')) ? s.from : '';
  const code = list => list.map(staffOf).filter(Boolean)[0] || '';
  let counted = 0, self = 0;
  rows.forEach(r => {
    const st = r.status.toLowerCase();
    const counts = st === 'approved' || (s.count === 'reviewed' && st === 'rejected') || (!st && r.rc.length > 0);
    if (!counts || !r.rc.length || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || (from && r.date < from)) return;
    counted++;
    const rc = code(r.rc), calc = code(r.calc), miss = list => { const k = list.slice().reverse().join(' / '); unknown[k] = (unknown[k] || 0) + 1; };
    if (calc && calc === rc) { self++; return; }   // คนคำนวณ Recheck เอง: ไม่นับเป็น RC
    if (!rc) miss(r.rc);
    if (r.calc.length && !calc) miss(r.calc);
    const typ = ['TDF', TDF_TYPE[r.type] || r.type].filter(Boolean).join(' ');
    const rec = (mp, title) => ({ kind: 'rc', mp: mp, date: r.date, hn: r.hn, name: r.name, title: title, note: 'TDF Dose Calculator' + (st === 'rejected' ? ' · Recheck ไม่ผ่าน' : '') });
    const rcName = (extObj_(r.rcRaw) || {}).name || r.rc[r.rc.length - 1] || '?';
    if (rc) want['tdf:' + r.key + ':rc'] = rec(rc, typ + ' ของ ' + (calc || r.calcName || r.calc[0] || '?'));
    if (calc) want['tdf:' + r.key + ':calc'] = rec(calc, typ + ' ที่คำนวณเอง · Recheck โดย ' + (rc || rcName));
  });
  return { want: want, unknown: unknown, counted: counted, from: from, self: self };
}

/**
 * แอดมิน: ตรวจชีตของ TDF Dose Calculator ด้วยค่าที่กำลังตั้ง · ไม่เขียนอะไร
 * { title, tabs, tab, map, missing, preview: { rows, counted, rc, calc, self, statuses, types, unknown, first, last } }
 */
function tdfCheck(s, token) {
  const u = who_(token);
  if (!u.isAdmin) throw new Error('ตั้งค่าการดึง RC จาก TDF ได้เฉพาะแอดมิน');
  s = s && typeof s === 'object' ? s : {};
  const book = extBook_(s, EXT.tdf.what), got = tdfRead_(book, s, true), w = tdfWanted_(got.rows, s, readConfig_(ss_()) || {});
  const statuses = {}, types = {};
  got.rows.forEach(r => {
    const k = r.status || '(ว่าง)', t = TDF_TYPE[r.type] || r.type || '(ว่าง)';
    statuses[k] = (statuses[k] || 0) + 1;
    types[t] = (types[t] || 0) + 1;
  });
  const dates = got.rows.map(r => r.date).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  return {
    title: book.getName(), tabs: got.tabs, tab: got.tab.name, map: got.map, missing: got.missing,
    preview: got.missing.length ? null : {
      rows: got.rows.length, counted: w.counted, rc: Object.keys(w.want).filter(k => /:rc$/.test(k)).length, calc: Object.keys(w.want).filter(k => /:calc$/.test(k)).length,
      self: w.self, statuses: statuses, types: types, unknown: w.unknown,
      first: dates[0] || '', last: dates[dates.length - 1] || '',
    },
  };
}

/* ---------- วันหยุดราชการไทย (ปฏิทินวันหยุดสาธารณะของ Google) ---------- */

const TH_HOLIDAY_CAL = 'th.th#holiday@group.v.calendar.google.com';   // ชื่อภาษาไทย
const EN_HOLIDAY_CAL = 'en.th#holiday@group.v.calendar.google.com';   // ใช้แยกวันหยุดจริงกับวันสำคัญ (Observance)

// วันหยุดของปีนั้น [{ date, name }] ตัดวันสำคัญที่ไม่ใช่วันหยุดออก · เก็บผลไว้ 6 ชั่วโมง
function thaiHolidays(year, token) {
  who_(token);
  year = Math.floor(+year);
  if (!(year >= 2000 && year < 2100)) throw new Error('ปีไม่ถูกต้อง');
  const cache = CacheService.getScriptCache(), key = 'thhol_' + year, hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const fetchCal = id => {
    const res = UrlFetchApp.fetch('https://calendar.google.com/calendar/ical/' + encodeURIComponent(id) + '/public/basic.ics', { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode());
    return parseIcs_(res.getContentText('UTF-8'));
  };
  let th;
  try { th = fetchCal(TH_HOLIDAY_CAL); } catch (e) { throw new Error('ดึงปฏิทินวันหยุดจาก Google ไม่ได้ (' + e.message + ')'); }
  let en = [];
  try { en = fetchCal(EN_HOLIDAY_CAL); } catch (e) { en = []; }
  const observance = {};
  en.forEach(ev => { if (/observance/i.test(ev.desc)) observance[ev.uid] = true; });
  const byDate = {};
  th.filter(ev => ev.date.slice(0, 4) === String(year) && !observance[ev.uid] && !/observance|วันสำคัญ|การปฏิบัติตาม/i.test(ev.desc))
    .forEach(ev => { byDate[ev.date] = byDate[ev.date] ? byDate[ev.date] + ' / ' + ev.name : ev.name; });
  const out = Object.keys(byDate).sort().map(d => ({ date: d, name: byDate[d] }));
  cache.put(key, JSON.stringify(out), 6 * 3600);
  return out;
}

// อ่านไฟล์ iCalendar: เหตุการณ์ทั้งวัน → [{ date, name, desc, uid }] (หลายวันแตกเป็นรายวัน)
function parseIcs_(text) {
  const lines = String(text).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const events = [];
  let ev = null;
  lines.forEach(line => {
    if (line === 'BEGIN:VEVENT') { ev = {}; return; }
    if (line === 'END:VEVENT') { if (ev && ev.start) events.push(ev); ev = null; return; }
    if (!ev) return;
    const i = line.indexOf(':');
    if (i < 0) return;
    const k = line.slice(0, i).split(';')[0], v = line.slice(i + 1).replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
    if (k === 'DTSTART') ev.start = v.slice(0, 8);
    else if (k === 'DTEND') ev.end = v.slice(0, 8);
    else if (k === 'SUMMARY') ev.name = v;
    else if (k === 'DESCRIPTION') ev.desc = v;
    else if (k === 'UID') ev.uid = v;
  });
  const ymd = s => s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
  const next = d => { const t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + 1)); return t.toISOString().slice(0, 10); };
  const out = [];
  events.forEach(e => {
    if (!/^\d{8}$/.test(e.start)) return;
    const end = /^\d{8}$/.test(e.end || '') ? ymd(e.end) : '';
    let d = ymd(e.start), n = 0;
    do { out.push({ date: d, name: e.name || '', desc: e.desc || '', uid: e.uid || '' }); d = next(d); } while (end && d < end && ++n < 31);
  });
  return out;
}

/* ---------- รหัส PIN 4 หลักของแต่ละคน (ยืนยันตัวตอนกดปุ่มขั้นตอน) ---------- */
// เก็บแบบแฮชพร้อม salt ใน Script properties (คนที่เปิดชีตก็ไม่เห็น) · ใส่ผิด PIN_TRIES ครั้ง ล็อก PIN_LOCK_SECONDS

const PIN_TRIES = 5;
const PIN_LOCK_SECONDS = 300;

function pinKey_(u) {
  return 'PIN_' + (u.via === 'lpch' ? 'lpch:' + String(u.username).toLowerCase() : 'google:' + String(u.me || '').toLowerCase());
}

function pinHash_(salt, pin) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pin, Utilities.Charset.UTF_8));
}

function pinRecord_(u) {
  if (!u || (u.via === 'lpch' ? !u.username : !u.me)) return null;
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(pinKey_(u)) || 'null'); } catch (e) { return null; }
}

// act = กลุ่มงาน (ตั้งค่า → รหัส PIN ในหน้าเว็บ: steps, edit, logs, fx, course, ptags, mqt, ptadd, duty, ct, appt, jobs, reg) · แอดมินตั้ง config.pin[act] = false = ไม่ต้องใส่ PIN
// (ยังรู้ว่าใครทำจากบัญชีที่เข้าระบบ) · ไม่ระบุ act = ตรวจเสมอ
function checkPin_(u, pin, act) {
  if (act) { const cfg = readConfig_(ss_()) || {}; if (cfg.pin && cfg.pin[act] === false) return; }
  const rec = pinRecord_(u);
  if (!rec) throw new Error('PIN|ยังไม่ได้ตั้งรหัส PIN');
  const cache = CacheService.getScriptCache(), key = 'pintry_' + pinKey_(u);
  const tries = +(cache.get(key) || 0);
  if (tries >= PIN_TRIES) throw new Error('ใส่รหัส PIN ผิด ' + PIN_TRIES + ' ครั้ง รอ 5 นาทีแล้วลองใหม่');
  if (!/^\d{4}$/.test(String(pin == null ? '' : pin)) || pinHash_(rec.s, String(pin)) !== rec.h) {
    cache.put(key, String(tries + 1), PIN_LOCK_SECONDS);
    const left = PIN_TRIES - tries - 1;
    throw new Error('รหัส PIN ไม่ถูกต้อง' + (left > 0 ? ' (ใส่ได้อีก ' + left + ' ครั้ง)' : ' รอ 5 นาทีแล้วลองใหม่'));
  }
  cache.remove(key);
}

// ตั้งหรือเปลี่ยนรหัส PIN ของตัวเอง · มีรหัสอยู่แล้วต้องใส่ proof = { pin: รหัสเดิม } หรือ { password: รหัสผ่าน LPCH } (ลืม PIN)
function setPin(pin, proof, token) {
  const u = who_(token);
  pin = String(pin == null ? '' : pin);
  if (!/^\d{4}$/.test(pin)) throw new Error('รหัส PIN ต้องเป็นตัวเลข 4 หลัก');
  if (pinRecord_(u)) {
    proof = proof || {};
    if (proof.pin != null && proof.pin !== '') checkPin_(u, proof.pin);
    else if (proof.password && u.via === 'lpch') checkLpchPassword_(u.username, proof.password);
    else throw new Error('ใส่รหัส PIN เดิม' + (u.via === 'lpch' ? ' หรือรหัสผ่าน LPCH' : '') + ' เพื่อเปลี่ยนรหัส PIN');
  }
  const salt = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty(pinKey_(u), JSON.stringify({ s: salt, h: pinHash_(salt, pin), at: new Date().toISOString() }));
  CacheService.getScriptCache().remove('pintry_' + pinKey_(u));
  return true;
}

// ลืม PIN: ตรวจรหัสผ่านกับ LPCH (เข้าสู่ระบบแล้วออกทันที) รหัสผ่านไม่ถูกเก็บที่นี่
function checkLpchPassword_(username, password) {
  const out = lpchCall_({ action: 'login', username: String(username), password: String(password) });
  try { lpchCall_({ action: 'logout', token: out.token }); } catch (e) { /* ปล่อยให้หมดอายุเอง */ }
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
  ss = ss || ss_();
  cfg = cfg || readConfig_(ss) || {};
  const g = adminInfo_(ss, cfg);
  const google = { via: 'google', name: g.me, username: '', role: '', me: g.me, owner: g.owner, canEdit: true, isAdmin: g.isAdmin, lpchAdmin: false };
  if (!lpchUrl_()) return google;
  // เปิด LPCH แล้ว: เว็บใช้บัญชี LPCH เสมอ (รวมเจ้าของไฟล์) บัญชี Google ใช้ได้เฉพาะหน้าที่เปิดจากเมนูในชีต
  // และต้องเป็นเจ้าของไฟล์หรืออีเมลในรายชื่อแอดมิน (Google ยืนยันตัวตนให้ ค่า SHEET_DIALOG ไม่ได้ให้สิทธิ์เพิ่มเอง)
  const googleAdmin = !!g.me && (g.me === g.owner || adminList_(cfg).indexOf(g.me) >= 0);
  const fromSheet = token === SHEET_DIALOG;
  let why = '';   // ไม่มี token = เพิ่งเปิดหน้า: แสดงช่องเข้าสู่ระบบเฉย ๆ ไม่ต้องมีข้อความเตือน
  if (token && !fromSheet) {
    const p = lpchUser_(token);
    if (!p.error) {
      const admins = adminList_(cfg);
      const listed = (!!p.email && admins.indexOf(p.email) >= 0) || admins.indexOf(p.username) >= 0;
      // canEdit = บันทึกได้อย่างน้อยหนึ่งแถบ (ตั้งค่า → แถบเมนู) · แอดมินต้องเป็น MP (p.canEdit) และเป็นแอดมินของ LPCH หรืออยู่ในรายชื่อแอดมิน
      const anyEdit = Object.keys(EDIT_VIEWS).reduce((a, t) => a.concat(EDIT_VIEWS[t]), []).some(v => navAccess_(cfg, v, p.role) === 'edit');
      return { via: 'lpch', name: p.name, username: p.username, role: p.role, me: p.email, owner: g.owner,
        canEdit: anyEdit, isAdmin: p.canEdit && (p.lpchAdmin || listed), lpchAdmin: p.lpchAdmin };
    }
    why = p.error;
  }
  if (fromSheet && googleAdmin) return Object.assign(google, { isAdmin: true });
  throw new Error('LOGIN|' + why);
}

// บันทึกได้เมื่อตำแหน่งของผู้ใช้บันทึกได้อย่างน้อยหนึ่งแถบใน views (ไม่ระบุ = แถบไหนก็ได้) · บัญชี Google (เจ้าของไฟล์/แอดมิน) บันทึกได้ทุกแถบ
function requireEdit_(token, views) {
  const ss = ss_(), cfg = readConfig_(ss) || {};
  const u = who_(token, ss, cfg);
  if (u.via === 'google') return u;
  const list = views || Object.keys(EDIT_VIEWS).reduce((a, t) => a.concat(EDIT_VIEWS[t]), []);
  if (!list.some(v => navAccess_(cfg, v, u.role) === 'edit')) {
    throw new Error('ตำแหน่ง ' + (u.role || '-') + ' บันทึกในแถบนี้ไม่ได้ (บัญชี ' + u.username + ' ดูได้อย่างเดียว) · แอดมินเปิดสิทธิ์ได้ที่ ตั้งค่า → แถบเมนู');
  }
  return u;
}

// แอดมิน: ดึงสมาชิกที่ใช้งานอยู่และตำแหน่งจาก LPCH RO Workspace (คำสั่ง directory) ใช้ตั้งสิทธิ์รายแถบ และเชื่อมบัญชีของนักฟิสิกส์ / แพทย์ ในตั้งค่า
// ส่งอีเมลด้วยถ้า LPCH ส่งมา · ไม่เก็บรายชื่อไว้ที่นี่
function lpchMembers(token) {
  const u = who_(token);
  if (!u.isAdmin) throw new Error('ดูรายชื่อสมาชิกได้เฉพาะแอดมิน');
  if (u.via !== 'lpch') throw new Error('ดึงรายชื่อได้เมื่อเข้าสู่ระบบด้วยบัญชี LPCH RO Workspace');
  const out = lpchCall_({ action: 'directory', token: String(token) });
  const users = (Array.isArray(out.users) ? out.users : []).map(x => ({ username: String(x.username || ''), name: String(x.fullName || x.username || ''), role: String(x.role || ''), email: String(x.email || '').trim().toLowerCase() })).filter(x => x.username);
  const roles = LPCH_ROLES.slice();
  users.forEach(x => { if (x.role && roles.indexOf(x.role) < 0) roles.push(x.role); });
  keepDutyMembers_(users);
  return { roles: roles, users: users };
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
  const body = String(res.getContentText('UTF-8') || '');
  let out = null;
  try { out = JSON.parse(body); } catch (e) { out = null; }
  if (!out) {
    // สคริปต์ของ LPCH พังหรือถูกวางโค้ดอื่นทับ: Apps Script ตอบหน้า Error (HTML, HTTP 200) เช่น "Script function not found: doPost"
    const why = ((/<title>Error<\/title>[\s\S]*<div[^>]*>([^<]{3,200})<\/div>\s*<\/body>/.exec(body) || [])[1] || '').trim();
    if (/doPost/.test(why)) throw new Error('เชื่อมต่อ LPCH RO Workspace ไม่ได้: Apps Script ที่ LPCH_URL ไม่มี doPost (' + why + ') แปลว่าโปรเจกต์ของ LPCH ถูกวางโค้ดอื่นทับ เช่น Code.gs ของระบบนี้ · ผู้ดูแล: วาง Code.gs ของ LPCH RO Workspace กลับในโปรเจกต์ LPCH แล้ว Deploy เวอร์ชันใหม่');
    throw new Error('เชื่อมต่อ LPCH RO Workspace ไม่ได้ (HTTP ' + res.getResponseCode() + (why ? ': ' + why : '') + ') ผู้ดูแล: ตรวจ LPCH_URL และ Deploy ของ LPCH แบบ Who has access: Anyone');
  }
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
// ฟังก์ชันของไฟล์นี้ที่ถูกไฟล์ .gs อื่นในโปรเจกต์ประกาศทับ (เช่นโค้ดรุ่นเก่าที่ยังค้างอยู่) ไฟล์ที่โหลดทีหลังชนะ
function oldCode_() {
  return [['doGet', doGet, 'page_('], ['getData', getData, 'API_LEVEL'], ['saveRecord', saveRecord, 'requireEdit_'],
    ['addCases', addCases, 'requireEdit_'], ['openApp', openApp, 'page_(']]
    .filter(x => typeof x[1] !== 'function' || String(x[1]).indexOf(x[2]) < 0).map(x => x[0]);
}

function checkSetup() {
  const out = ['Code.gs รุ่น ' + CODE_VERSION + ' (API ' + API_LEVEL + ')'];
  const dup = oldCode_();
  out.push(dup.length
    ? '✗ มีไฟล์ .gs อื่นในโปรเจกต์ที่มี ' + dup.join(', ') + ' ของโค้ดเก่า ทับโค้ดใหม่อยู่: ลบไฟล์ .gs อื่นให้เหลือ Code.gs ไฟล์เดียว'
    : '✓ ไม่มีโค้ดเก่าค้างในไฟล์อื่น');
  const url = pageUrl_();
  if (!url) out.push('• หน้าเว็บ: ใช้ไฟล์ index ในโปรเจกต์ (PAGE_URL = -)');
  else {
    const p = page_(true);
    const v = (/const PAGE_VERSION = '([^']+)'/.exec(p.html) || [])[1] || 'ไม่ทราบ';
    out.push(p.source === 'github' ? '✓ หน้าเว็บ: โหลดจาก GitHub ได้ รุ่น ' + v
      : '✗ หน้าเว็บ: โหลดจาก GitHub ไม่ได้ (' + p.why + ') ' + (p.source === 'file' ? 'ใช้ไฟล์ index ในโปรเจกต์ รุ่น ' + v : 'และไม่มีไฟล์ index'));
  }
  out.push(setupLpch());
  try {
    const ss = ss_();
    const from = { bound: 'ชีตที่ผูกสคริปต์', property: 'Script property SHEET_ID' }[sheetSource_()] || 'ไม่ทราบ';
    out.push('✓ ชีตเก็บข้อมูล: ' + ss.getName() + ' (' + from + ') · เคส ' + readTable_(ss, 'cases').length + ' รายการ');
    out.push('  ' + ss.getUrl());
  } catch (e) { out.push('✗ ชีตเก็บข้อมูล: ' + e.message); }
  out.push('ขั้นต่อไป: Deploy → จัดการการทำให้ใช้งานได้ → แก้ไข (ดินสอ) → เวอร์ชัน: เวอร์ชันใหม่ → ทำให้ใช้งานได้');
  out.push('(อย่ากด "การทำให้ใช้งานได้รายการใหม่" เพราะจะได้ URL ใหม่ ลิงก์เดิมและปุ่มใน LPCH ยังเปิดรุ่นเก่า)');
  out.push('ตรวจลิงก์: เปิด …/exec?ping=1 ต้องเห็น "codeVersion": "' + CODE_VERSION + '" ถ้าเห็นหน้าระบบแทน แปลว่าลิงก์นั้นยังเป็นรุ่นเก่า');
  out.push('ถ้าลิงก์ที่ใช้อยู่ไม่อยู่ในรายการ "จัดการการทำให้ใช้งานได้" ของโปรเจกต์นี้ แปลว่าลิงก์นั้นมาจากโปรเจกต์ Apps Script อื่น');
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

// ส่ง cfg มาด้วยเมื่อต้องการคอลัมน์ของหัวข้อเพิ่มเติม (แท็บ Cases)
function tableDef_(table, cfg) {
  const def = TABLES[table];
  if (!def) throw new Error('ไม่รู้จักตาราง ' + table);
  if (table !== 'cases' || !cfg) return def;
  return { sheet: def.sheet, fields: def.fields.concat(extraFields_(cfg)) };
}

// หัวข้อเพิ่มเติมในฟอร์มแจกเคส (config.fields) → [คีย์ x_<id>, ชื่อคอลัมน์] ชื่อคอลัมน์คือชื่อหัวข้อตอนสร้าง
// ข้ามชื่อที่ซ้ำกับคอลัมน์ของระบบหรือซ้ำกันเอง กันอ่านเขียนผิดคอลัมน์
function extraFields_(cfg) {
  const taken = {};
  TABLES.cases.fields.forEach(f => { taken[f[1].toLowerCase()] = true; });
  return (Array.isArray(cfg && cfg.fields) ? cfg.fields : [])
    .filter(f => f && /^[\w-]{1,40}$/.test(String(f.id || '')))
    .map(f => ['x_' + f.id, String(f.col || f.label || '').trim()])
    .filter(f => {
      const k = f[1].toLowerCase();
      if (!k || taken[k]) return false;
      taken[k] = true;
      return true;
    });
}

function tableSheet_(ss, table, cfg) {
  const def = tableDef_(table, cfg);
  let sh = ss.getSheetByName(def.sheet);
  if (!sh) {
    sh = ss.insertSheet(def.sheet);
    sh.setFrozenRows(1);
  }
  let header = headerOf_(sh);
  if (table === 'cases' && header.some(h => RENAMED_COLS[h] && header.indexOf(RENAMED_COLS[h]) < 0)) {
    header = header.map(h => (RENAMED_COLS[h] && header.indexOf(RENAMED_COLS[h]) < 0 ? RENAMED_COLS[h] : h));
    sh.getRange(1, 1, 1, header.length).setValues([header]);
  }
  const missing = def.fields.map(f => f[1]).filter(h => header.indexOf(h) < 0);
  if (missing.length) sh.getRange(1, header.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
  return sh;
}

function headerOf_(sh) {
  const n = sh.getLastColumn();
  return n ? sh.getRange(1, 1, 1, n).getValues()[0].map(v => String(v).trim()) : [];
}

function readTable_(ss, table, cfg) {
  const def = tableDef_(table, cfg);
  const sh = ss.getSheetByName(def.sheet);
  if (!sh || sh.getLastRow() < 2) return [];
  const tz = ss.getSpreadsheetTimeZone();
  const values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const header = values.shift().map(v => String(v).trim());
  const oldName = {};
  Object.keys(RENAMED_COLS).forEach(k => { oldName[RENAMED_COLS[k]] = k; });
  const cols = def.fields.map(f => (header.indexOf(f[1]) >= 0 || !oldName[f[1]] ? header.indexOf(f[1]) : header.indexOf(oldName[f[1]])));
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
let LOCKED_ = false;
function withLock_(fn) {
  if (LOCKED_) return fn();   // ถือล็อกอยู่แล้วในคำขอนี้
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('มีคนกำลังบันทึกข้อมูลอยู่ รอสักครู่แล้วลองใหม่');
  LOCKED_ = true;
  try {
    return fn();
  } finally {
    LOCKED_ = false;
    try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); }
  }
}

/* ---------- ชีตเก็บข้อมูล ---------- */

// ชีตที่ผูกสคริปต์ → ชีตใน Script property SHEET_ID → สร้างชีตใหม่ครั้งแรกแล้วจำ ID ไว้ใน SHEET_ID
let SS_ = null;
function ss_() {
  if (SS_) return SS_;
  const bound = SpreadsheetApp.getActive();
  if (bound) return (SS_ = bound);
  const id = sheetIdProp_();
  if (id) return (SS_ = openSheet_(id));
  // สร้างภายใต้ล็อก กันสองคนเปิดครั้งแรกพร้อมกันแล้วได้ชีตคนละไฟล์
  return (SS_ = withLock_(() => {
    const again = sheetIdProp_();
    if (again) return openSheet_(again);
    const ss = SpreadsheetApp.create(APP_TITLE + ' (ข้อมูล)');
    ss.setSpreadsheetTimeZone('Asia/Bangkok');
    const first = ss.getSheets()[0];
    first.setName(TABLES.cases.sheet);
    first.setFrozenRows(1);
    PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
    return ss;
  }));
}

// ID จาก Script property SHEET_ID (ใส่ได้ทั้ง ID และลิงก์ของชีต) ไม่ได้ตั้ง = ''
function sheetIdProp_() {
  const raw = String(PropertiesService.getScriptProperties().getProperty('SHEET_ID') || '').trim();
  if (!raw) return '';
  const m = /\/d\/([\w-]{20,})/.exec(raw) || /^([\w-]{20,})$/.exec(raw);
  if (!m) throw new Error('Script property SHEET_ID ต้องเป็น ID หรือลิงก์ของ Google Sheet (ตอนนี้: ' + raw + ')');
  return m[1];
}

function openSheet_(id) {
  try { return SpreadsheetApp.openById(id); } catch (e) {
    throw new Error('เปิดชีตใน Script property SHEET_ID ไม่ได้ (' + e.message + ') ตรวจ ID และบัญชีที่ Deploy ต้องแก้ไขชีตนั้นได้');
  }
}

// ใช้ชีตจากไหน (ไม่สร้างชีต) bound | property | none (none = จะสร้างใหม่เมื่อใช้งานครั้งแรก)
function sheetSource_() {
  try {
    if (SpreadsheetApp.getActive()) return 'bound';
    return sheetIdProp_() ? 'property' : 'none';
  } catch (e) { return 'error'; }
}
