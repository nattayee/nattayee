/**
 * HDR Activity — Google Apps Script web app
 * งานฟิสิกส์การแพทย์ กลุ่มงานรังสีรักษา โรงพยาบาลมะเร็งลำปาง
 *
 * ใช้กับชีต Brachy_therapy_Activity (แท็บ Record)
 *   A = Date, C = Calculation (สูตร), D = %Diff (สูตร), E = Planning, F = MP, G = t (สูตร)
 *   J2:K14 = ค่าคงที่ของ source (Serial, Acceptance date, A0, T1/2, e)
 */

// ID ของชีต Brachy_therapy_Activity (ส่วนที่อยู่ระหว่าง /d/ กับ /edit ในลิงก์ชีต)
var SPREADSHEET_ID = '1NUgqDvc540aHviRw-8IaO86FT7CwwJktmiA_dPbDFlQ';
var SHEET_NAME = 'Record';
var FIRST_ROW = 2;

function doGet() {
  // ชื่อไฟล์ HTML ที่ยอมรับ (ตัวพิมพ์เล็ก/ใหญ่ต่างกันใน Apps Script)
  var names = ['index', 'Index', 'index.html', 'Index.html'];
  for (var i = 0; i < names.length; i++) {
    try {
      return HtmlService.createHtmlOutputFromFile(names[i])
        .setTitle('HDR Activity')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    } catch (e) { /* ลองชื่อถัดไป */ }
  }
  throw new Error('ไม่พบไฟล์ HTML ชื่อ "index" — ในหน้า Apps Script กด + ข้างคำว่า "ไฟล์" → HTML ' +
    'แล้วพิมพ์ชื่อ index (ไม่ต้องพิมพ์ .html) จากนั้นวางโค้ดจากกล่อง index.html');
}

/** ใช้ได้ทั้งสคริปต์ที่สร้างจากในชีต และสคริปต์แยกที่สร้างจาก script.google.com */
function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SPREADSHEET_ID);
}

function sheet_() {
  var sh = ss_().getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('ไม่พบแท็บ "' + SHEET_NAME + '" ในชีตนี้');
  return sh;
}

function iso_(d) {
  return Utilities.formatDate(d, ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
}

function num_(v) {
  return typeof v === 'number' && isFinite(v) ? v : null;
}

/** ข้อมูลทั้งหมดสำหรับหน้าเว็บ: ค่าคงที่ของ source + ทุกแถวที่มีวันที่ */
function getData() {
  var sh = sheet_();
  var last = sh.getLastRow();
  var rows = last >= FIRST_ROW ? sh.getRange(FIRST_ROW, 1, last - FIRST_ROW + 1, 6).getValues() : [];
  var records = [];
  rows.forEach(function (r, i) {
    if (!(r[0] instanceof Date)) return;
    records.push({
      row: FIRST_ROW + i,
      date: iso_(r[0]),
      calc: num_(r[2]),
      diff: num_(r[3]),
      planning: num_(r[4]),
      mp: String(r[5] || '')
    });
  });
  var p = sh.getRange('K2:K5').getValues();
  var e = sh.getRange('K6').getValue();
  var source = {
    serial: String(sh.getRange('J2').getValue() || ''),
    isotope: String(p[0][0] || ''),
    refDate: p[1][0] instanceof Date ? iso_(p[1][0]) : '',
    a0: num_(p[2][0]),
    halfLife: num_(p[3][0]),
    e: num_(e) || Math.E
  };
  var mpList = ['JR', 'WM', 'NY', 'WS'];
  var rule = sh.getRange('F2').getDataValidation();
  if (rule && rule.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
    mpList = rule.getCriteriaValues()[0];
  }
  return { source: source, records: records, mpList: mpList };
}

/** เพิ่มแถวใหม่ในแถวว่างแรกของคอลัมน์ A (สูตร C, D, G ใช้ของเดิมในแถวนั้น) */
function addRecord(dateIso, planning, mp) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateIso))) throw new Error('วันที่ไม่ถูกต้อง');
  var value = Number(planning);
  if (!isFinite(value) || value <= 0) throw new Error('ค่า Planning ไม่ถูกต้อง');

  var lock = LockService.getScriptLock();  // ใช้ได้ทั้งสคริปต์ในชีตและสคริปต์แยก
  lock.waitLock(20000);
  try {
    var sh = sheet_();
    var maxRows = sh.getMaxRows();
    var colA = sh.getRange(FIRST_ROW, 1, maxRows - FIRST_ROW + 1, 1).getValues();
    var row = -1;
    for (var i = 0; i < colA.length; i++) {
      if (colA[i][0] === '' || colA[i][0] === null) { row = FIRST_ROW + i; break; }
    }
    if (row === -1) {
      sh.insertRowAfter(maxRows);
      row = maxRows + 1;
    }
    // แถวที่ยังไม่มีสูตร: คัดลอกสูตรจากแถวก่อนหน้า
    if (!sh.getRange(row, 3).getFormula() && row > FIRST_ROW) {
      sh.getRange(row - 1, 3, 1, 2).copyTo(sh.getRange(row, 3, 1, 2));
      sh.getRange(row - 1, 7).copyTo(sh.getRange(row, 7));
    }
    var tz = ss_().getSpreadsheetTimeZone();
    sh.getRange(row, 1).setValue(Utilities.parseDate(dateIso, tz, 'yyyy-MM-dd'));
    sh.getRange(row, 5).setValue(value);
    sh.getRange(row, 6).setValue(String(mp || ''));
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return getData();
}
