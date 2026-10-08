/**
 * ระบบกระจายงาน ฟิสิกส์การแพทย์ — ส่วนหลังบ้านบน Google Apps Script
 *
 * เก็บข้อมูลทั้งหมด (JSON) ไว้ในชีตซ่อนชื่อ "_appdata" ของ Google Sheet
 * และเขียนชีต "งาน", "วันลา", "บุคลากร" ให้เปิดดู/กรอง/ทำรายงานต่อใน Google Sheets ได้
 *
 * วิธีติดตั้งดูที่ README.md
 */

var APP_TITLE = 'ระบบกระจายงาน ฟิสิกส์การแพทย์';
var DATA_SHEET = '_appdata';
var CHUNK = 40000; // เซลล์หนึ่งเก็บได้ไม่เกิน 50,000 ตัวอักษร

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle(APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ---------------- API ที่หน้าเว็บเรียกผ่าน google.script.run ---------------- */

function apiLoad() {
  var d = readData_();
  return { rev: d.rev, json: d.json || null, user: currentUser_() };
}

function apiRev() {
  return readRev_(dataSheet_());
}

/**
 * บันทึกข้อมูลแบบตรวจเวอร์ชัน: ถ้ามีคนอื่นบันทึกก่อน (rev ไม่ตรง)
 * จะส่งข้อมูลล่าสุดกลับไปให้หน้าเว็บรวมการแก้ไขแล้วบันทึกใหม่
 */
function apiSave(json, baseRev) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = dataSheet_();
    var cur = readRev_(sh);
    if (cur !== Number(baseRev)) {
      var d = readData_();
      return { ok: false, conflict: true, rev: d.rev, json: d.json };
    }
    var data = JSON.parse(json); // ตรวจว่าเป็น JSON ที่ถูกต้อง
    writeChunks_(sh, json);
    var rev = cur + 1;
    sh.getRange(1, 1).setValue(rev);
    SpreadsheetApp.flush();
    try { writeReadable_(data); } catch (e) { console.error(e); }
    return { ok: true, rev: rev };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- ที่เก็บข้อมูล ---------------- */

function spreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function dataSheet_() {
  var ss = spreadsheet_();
  var sh = ss.getSheetByName(DATA_SHEET);
  if (!sh) {
    sh = ss.insertSheet(DATA_SHEET);
    sh.getRange(1, 1).setValue(0);
    sh.getRange(1, 2).setValue('← เวอร์ชันข้อมูล (ห้ามแก้ไขชีตนี้ด้วยมือ)');
    sh.hideSheet();
  }
  return sh;
}

function readRev_(sh) {
  return Number(sh.getRange(1, 1).getValue()) || 0;
}

function readData_() {
  var sh = dataSheet_();
  var rev = readRev_(sh);
  var last = sh.getLastRow();
  var json = '';
  if (last >= 2) {
    json = sh.getRange(2, 1, last - 1, 1).getValues()
      .map(function (r) { return String(r[0] || '').replace(/^~/, ''); })
      .join('');
  }
  return { rev: rev, json: json };
}

// แต่ละชิ้นขึ้นต้นด้วย "~" เพื่อกันไม่ให้ Sheets แปลงเป็นสูตร/ตัวเลข/วันที่
function writeChunks_(sh, json) {
  var rows = [];
  for (var i = 0; i < json.length; i += CHUNK) rows.push(['~' + json.slice(i, i + CHUNK)]);
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, 1).clearContent();
  if (rows.length) {
    var range = sh.getRange(2, 1, rows.length, 1);
    range.setNumberFormat('@');
    range.setValues(rows);
  }
}

function currentUser_() {
  try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; }
}

/* ---------------- ชีตสำหรับเปิดดูใน Google Sheets ---------------- */

var TH_MONTHS_S = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
var STATUS = { todo: 'รอดำเนินการ', doing: 'กำลังดำเนินการ', review: 'รอตรวจสอบ', done: 'เสร็จสิ้น' };
var LEAVE_TYPES = { vacation: 'ลาพักผ่อน', sick: 'ลาป่วย', personal: 'ลากิจ', official: 'ไปราชการ/อบรม/ประชุม', other: 'อื่น ๆ' };
var LEAVE_PARTS = { full: 'เต็มวัน', am: 'ครึ่งวันเช้า', pm: 'ครึ่งวันบ่าย' };

function thDate_(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  var p = s.split('-');
  return Number(p[2]) + ' ' + TH_MONTHS_S[Number(p[1]) - 1] + ' ' + (Number(p[0]) + 543);
}

function writeReadable_(st) {
  var staff = {}, types = {};
  (st.staff || []).forEach(function (s) { staff[s.id] = s; });
  (st.taskTypes || []).forEach(function (t) { types[t.id] = t; });
  var name = function (id) { var s = staff[id]; return s ? s.name + (s.nick ? ' (' + s.nick + ')' : '') : ''; };

  var tasks = (st.tasks || []).slice().sort(function (a, b) {
    return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.seq || 0) - (a.seq || 0);
  });
  var taskRows = [['ลำดับ', 'วันที่รับงาน', 'กำหนดเสร็จ', 'ประเภทงาน', 'HN', 'ชื่อผู้ป่วย', 'ตำแหน่งที่ฉาย', 'แพทย์', 'ผู้รับผิดชอบ', 'ผู้ตรวจแผน', 'สถานะ', 'แต้ม', 'หมายเหตุ', 'วันที่ (ISO)']];
  tasks.forEach(function (t) {
    var ty = types[t.typeId];
    taskRows.push([t.seq || '', thDate_(t.date), thDate_(t.due), ty ? ty.name : '', t.hn || '', t.patient || '', t.site || '', t.doctor || '',
      name(t.assigneeId), name(t.checkerId), STATUS[t.status] || t.status, ty ? ty.weight : '', t.note || '', t.date]);
  });

  var leaveRows = [['บุคลากร', 'ประเภทการลา', 'ตั้งแต่', 'ถึง', 'ช่วงเวลา', 'หมายเหตุ']];
  (st.leaves || []).slice().sort(function (a, b) { return a.start < b.start ? -1 : 1; }).forEach(function (l) {
    leaveRows.push([name(l.staffId), LEAVE_TYPES[l.type] || l.type, thDate_(l.start), thDate_(l.end), LEAVE_PARTS[l.part] || '', l.note || '']);
  });

  var staffRows = [['ชื่อ-นามสกุล', 'ชื่อเล่น', 'ตำแหน่ง', 'สัดส่วนรับงาน (%)', 'ตรวจแผนได้', 'พร้อมรับงาน', 'ไม่รับงานประเภท']];
  (st.staff || []).forEach(function (s) {
    staffRows.push([s.name, s.nick || '', s.position || '', s.capacity || 100, s.canCheck ? 'ใช่' : 'ไม่', s.active ? 'ใช่' : 'ไม่',
      (s.exclude || []).map(function (id) { return types[id] ? types[id].name : ''; }).filter(String).join(', ')]);
  });

  writeSheet_('งาน', taskRows);
  writeSheet_('วันลา', leaveRows);
  writeSheet_('บุคลากร', staffRows);
}

function writeSheet_(title, rows) {
  var ss = spreadsheet_();
  var sh = ss.getSheetByName(title) || ss.insertSheet(title);
  sh.clearContents();
  var cols = rows[0].length;
  var range = sh.getRange(1, 1, rows.length, cols);
  range.setNumberFormat('@'); // เก็บเป็นข้อความ (HN ที่ขึ้นต้นด้วย 0 จะไม่หาย)
  range.setValues(rows);
  sh.getRange(1, 1, 1, cols).setFontWeight('bold').setBackground('#e2f3f0');
  sh.setFrozenRows(1);
}
