// Code8.gs — ส่วนที่ 8/10 ของ LPCH RO Workspace (วางทุกไฟล์ Code1–Code10 ให้ครบ)

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** The spreadsheet that holds the data: the one this script is bound to, or one it created. */
function ss_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  ss = SpreadsheetApp.create('LPCH RO Workspace Data');
  ss.setSpreadsheetTimeZone(TIME_ZONE);
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

function sheet_(name, headers) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setFontColor('#ffffff').setBackground('#1d5bd6');
    sh.getRange('A:A').setNumberFormat('@');  // keep usernames/tokens/ids as text
    if (name === 'Users') sh.getRange('D:D').setNumberFormat('@');
  }
  return sh;
}

function normUsername_(v) {
  var u = String(v || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(u)) {
    throw new Error('ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ ตัวเลข หรือ . _ - ความยาว 3–30 ตัวอักษร');
  }
  return u;
}

function normEmail_(v) {
  var e = String(v || '').trim().toLowerCase();
  if (!e) throw new Error('กรุณากรอกอีเมล (ใช้รับรหัสเมื่อลืมรหัสผ่าน)');
  if (e.length > 100 || !EMAIL_RE.test(e)) throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
  return e;
}

function emailTaken_(email, exceptUsername) {
  return allUsers_().some(function (u) {
    return u.username !== exceptUsername && String(u.email || '').trim().toLowerCase() === email;
  });
}

/** A member by username, or by email when the text contains @. */
function findUserByLogin_(login) {
  if (!login) return null;
  if (login.indexOf('@') === -1) return findUser_(login);
  return allUsers_().filter(function (u) { return String(u.email || '').trim().toLowerCase() === login; })[0] || null;
}

/** 6-digit code from a random UUID. */
function resetCode_() {
  var n = parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 12), 16) % 1000000;
  return ('000000' + n).slice(-6);
}

// ----- จบ Code8.gs (ถ้าไม่เห็นบรรทัดนี้ แสดงว่าวางไฟล์นี้มาไม่ครบ) -----
