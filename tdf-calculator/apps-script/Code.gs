/**
 * TDF Dose Calculator — Google Apps Script web app, signed in with LPCH RO Workspace accounts.
 *
 * The project needs only this file (Code.gs). The page (Index.html, ~130 KB) is loaded from GitHub (PAGE_URL) and cached
 * for 10 minutes, so a large paste cannot be cut off in the editor and updates arrive without pasting again.
 * An "Index" HTML file in the project is only a fallback for when GitHub cannot be reached, and only if complete.
 * After updating the page on GitHub, run  clearPageCache  to see it at once.
 *
 * Sign-in uses the Workspace web app's own JSON API (doPost there), so the Workspace project needs no changes:
 *   - From the Workspace: a Home button / menu card with this app's /exec URL and "เข้าสู่ระบบอัตโนมัติ" (sso) on
 *     opens  …/exec?sso=<ticket>  →  ssoRedeem  →  Workspace session token
 *   - Directly: username (or email) + password  →  login
 *   - Next visits: the saved token is checked with  me ; sign-out calls  logout
 *
 * Calculation records and the physicist recheck live in a Google Sheet ("TDF Calculator Records", created by setup):
 *   - tdfSubmit   anyone signed in sends a calculation for recheck (status "pending")
 *   - tdfReview   a medical physicist (Workspace role MP) who did NOT do the calculation approves or rejects it;
 *                 approval needs their own recalculation to match, and is saved automatically with name and time
 *   - The page only builds the final PDF report for approved records
 *   - On approval the reviewer's page uploads that PDF (tdfSavePdf); it is kept in Google Drive,
 *     folder "TDF Reports (อนุมัติแล้ว)/<yyyy-MM>", and the link is written to the sheet
 *
 * First time (and after this update): choose the function  setup  and press Run once (allows Sheets, Drive and external requests).
 * Deploy: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
 * The Workspace web app must also be deployed with Who has access: Anyone.
 * Open a tab directly with ?tab=frac | gap | brachy | ref
 */
var WORKSPACE_URL = 'https://script.google.com/macros/s/AKfycbwVlM9oxgSQMjjvc3mi39aGbIH4vEkaaUpSNWs4dd9oJHotjpfcyJMVBi5XcUFSAAM2/exec';
var PAGE_URL = 'https://raw.githubusercontent.com/nattayee/nattayee/refs/heads/claude/practical-cerf-k0tdhp/tdf-calculator/apps-script/Index.html';
var PAGE_CACHE_SECONDS = 600;

function doGet() {
  var output;
  try {
    // plain HTML output, not a template: template processing has broken script lines that contain "//"
    var html = pageSource_().split('<?= workspaceUrl ?>').join(WORKSPACE_URL);
    output = HtmlService.createHtmlOutput(html);
  } catch (err) {
    output = HtmlService.createHtmlOutput('<div style="font:16px/1.6 sans-serif;padding:24px;max-width:640px">' +
      '<h2 style="color:#b3261e">เปิด TDF Dose Calculator ไม่ได้</h2><p>' + String(err.message || err).replace(/[<>&]/g, '') +
      '</p><p>ลองโหลดหน้าใหม่อีกครั้ง หรือแจ้งผู้ดูแลระบบ</p></div>');
  }
  return output
    .setTitle('TDF Dose Calculator')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** The page template: the copy on GitHub, or a complete "Index" file in this project when GitHub cannot be reached. */
function pageSource_() {
  try {
    return loadPage_();
  } catch (err) {
    var names = ['Index', 'index'];
    for (var i = 0; i < names.length; i++) {
      try {
        var html = HtmlService.createHtmlOutputFromFile(names[i]).getContent();
        if (/<\/html>\s*$/i.test(html)) return html;
      } catch (e) { /* no such file */ }
    }
    throw err;
  }
}

/** Index.html from GitHub, cached in 30,000-character pieces (the cache holds at most 100 KB per value). */
function loadPage_() {
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get('page_n') || 0);
  if (n) {
    var keys = [];
    for (var i = 0; i < n; i++) keys.push('page_' + i);
    var got = cache.getAll(keys);
    if (Object.keys(got).length === n) return keys.map(function (k) { return got[k]; }).join('');
  }
  var res = UrlFetchApp.fetch(PAGE_URL, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('โหลดหน้าเว็บจาก GitHub ไม่ได้ (HTTP ' + res.getResponseCode() + ') ตรวจสอบ PAGE_URL');
  var html = res.getContentText('UTF-8');
  if (!/<\/html>\s*$/i.test(html)) throw new Error('หน้าเว็บที่โหลดจาก GitHub ไม่ครบ');
  var parts = {}, size = 30000, j;
  for (j = 0; j * size < html.length; j++) parts['page_' + j] = html.substr(j * size, size);
  parts.page_n = String(j);
  cache.putAll(parts, PAGE_CACHE_SECONDS);
  return html;
}

/** Run from the editor after updating the page on GitHub, to serve the new version at once. */
function clearPageCache() {
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get('page_n') || 0);
  var keys = ['page_n'];
  for (var i = 0; i < n; i++) keys.push('page_' + i);
  cache.removeAll(keys);
  Logger.log('ล้างแคชหน้าเว็บแล้ว (' + n + ' ส่วน) · หน้าเว็บ ' + Math.round(loadPage_().length / 1024) + ' KB');
}

/* ----- called from the page with google.script.run ----- */

function tdfLogin(username, password) {
  return session_(workspace_({ action: 'login', username: String(username || ''), password: String(password || '') }));
}

function tdfSso(ticket) {
  return session_(workspace_({ action: 'ssoRedeem', ticket: String(ticket || '') }));
}

function tdfMe(token) {
  var res = workspace_({ action: 'me', token: String(token || '') });
  res.token = token;
  return session_(res);
}

function tdfLogout(token) {
  try { workspace_({ action: 'logout', token: String(token || '') }); } catch (e) { /* already signed out */ }
  CacheService.getScriptCache().remove(meKey_(token));
  return true;
}

/* ----- calculation records & physicist recheck ----- */

var REVIEWER_ROLE = 'MP';          // Workspace role allowed to recheck
var RECHECK_TOLERANCE = 0.05;      // TDF difference allowed between the submitted value and the recheck
var LIST_LIMIT = 300;
var RECORD_HEADERS = ['id', 'createdAt', 'status', 'type', 'hn', 'patient', 'doctor', 'tdf',
  'calcUser', 'calcName', 'calcRole', 'reviewUser', 'reviewName', 'reviewRole', 'reviewAt', 'reviewNote', 'recheckTdf', 'sig', 'json',
  'pdfFileId', 'pdfUrl'];
var PDF_FOLDER = 'TDF Reports (อนุมัติแล้ว)';
var PDF_MAX_BYTES = 15 * 1024 * 1024;
var TYPES = { frac: 1, gap: 1, brachy: 1 };

/** Run once from the editor: creates the records sheet and asks for permissions. */
function setup() {
  var sh = records_();
  Logger.log('Records sheet: ' + sh.getParent().getUrl());
  Logger.log('PDF folder: ' + pdfFolder_().getUrl());
  Logger.log('หน้าเว็บ: ' + Math.round(pageSource_().length / 1024) + ' KB');
  Logger.log('ขั้นต่อไป: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone)');
}

function tdfList(token) {
  user_(token);
  var rows = records_().getDataRange().getValues().slice(1);
  return rows.slice(-LIST_LIMIT).reverse().map(record_);
}

function tdfSubmit(token, rec) {
  var me = user_(token);
  rec = rec || {};
  var p = rec.patient || {};
  if (!TYPES[rec.type]) throw new Error('ชนิดการคำนวณไม่ถูกต้อง');
  if (!isFinite(rec.tdf) || !isFinite(rec.ref)) throw new Error('ค่า TDF ไม่ถูกต้อง');
  var blank = function (v) { return !String(v || '').trim(); };
  if (blank(p.hn) || blank(p.prefix) || blank(p.first) || blank(p.last) || blank(rec.doctor)) {
    throw new Error('กรอก HN คำนำหน้าชื่อ ชื่อ นามสกุล และแพทย์ผู้รักษาให้ครบก่อนส่ง recheck');
  }
  var json = JSON.stringify({ title: rec.title, ref: rec.ref, summary: rec.summary, state: rec.state, patient: p, snap: rec.snap });
  if (json.length > 45000) throw new Error('ข้อมูลการคำนวณยาวเกินไป');
  return locked_(function () {
    var sh = records_();
    var sig = String(rec.sig || '');
    var rows = sh.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][17] === sig && (rows[i][2] === 'pending' || rows[i][2] === 'approved')) {
        throw new Error('รายการนี้ส่งไปแล้ว (' + (rows[i][2] === 'approved' ? 'อนุมัติแล้ว' : 'รอ recheck') + ')');
      }
    }
    var id = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyMMdd') + '-' + Utilities.getUuid().slice(0, 6);
    var row = [id, new Date(), 'pending', rec.type, String(p.hn).slice(0, 20), patientName_(p), String(rec.doctor).slice(0, 80), Number(rec.tdf),
      me.username, me.name, me.role, '', '', '', '', '', '', sig, json, '', ''];
    sh.appendRow(row);
    return record_(row);
  });
}

/** Approve or reject a pending record. Only a medical physicist other than the calculator; approval needs a matching recheck. */
function tdfReview(token, id, decision, note, recheckTdf) {
  var me = user_(token);
  if (me.role !== REVIEWER_ROLE) throw new Error('การ recheck ต้องทำโดยนักฟิสิกส์การแพทย์ (ตำแหน่ง ' + REVIEWER_ROLE + ' ใน Workspace)');
  if (decision !== 'approved' && decision !== 'rejected') throw new Error('ผลการตรวจไม่ถูกต้อง');
  note = String(note || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (decision === 'rejected' && !note) throw new Error('ระบุเหตุผลที่ไม่อนุมัติ');
  return locked_(function () {
    var sh = records_();
    var found = findRecord_(sh, id);
    if (!found) throw new Error('ไม่พบรายการ (อาจถูกถอนแล้ว)');
    var row = found.values;
    if (row[2] !== 'pending') throw new Error('รายการนี้ถูกตรวจไปแล้ว');
    if (row[8] === me.username) throw new Error('ผู้คำนวณ recheck งานของตัวเองไม่ได้ ต้องเป็นนักฟิสิกส์อีกท่าน');
    if (decision === 'approved' && !(Math.abs(Number(recheckTdf) - Number(row[7])) <= RECHECK_TOLERANCE)) {
      throw new Error('ค่าที่คำนวณซ้ำไม่ตรงกับค่าที่ส่งมา อนุมัติไม่ได้');
    }
    row[2] = decision; row[11] = me.username; row[12] = me.name; row[13] = me.role; row[14] = new Date(); row[15] = note;
    row[16] = isFinite(recheckTdf) ? Number(recheckTdf) : '';
    sh.getRange(found.row, 1, 1, row.length).setValues([row]);
    return record_(row);
  });
}

/**
 * Keeps the approved report in Google Drive. The page sends the PDF it built (base64); only the calculator or the
 * reviewer of an approved record may send it, and a record keeps its first file.
 */
function tdfSavePdf(token, id, base64, fileName) {
  var me = user_(token);
  var bytes;
  try { bytes = Utilities.base64Decode(String(base64 || '')); } catch (e) { throw new Error('ไฟล์ PDF ไม่ถูกต้อง'); }
  if (!bytes.length || bytes.length > PDF_MAX_BYTES) throw new Error('ไฟล์ PDF ว่างหรือใหญ่เกินไป');
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== '%PDF') throw new Error('ไฟล์ที่ส่งมาไม่ใช่ PDF');
  return locked_(function () {
    var sh = records_();
    var found = findRecord_(sh, id);
    if (!found) throw new Error('ไม่พบรายการ');
    var row = found.values;
    if (row[2] !== 'approved') throw new Error('เก็บ PDF ได้เฉพาะรายการที่อนุมัติแล้ว');
    if (me.username !== row[8] && me.username !== row[11]) throw new Error('เก็บ PDF ได้เฉพาะผู้คำนวณหรือผู้ recheck ของรายการนี้');
    if (row[19]) return record_(row);
    // keep the page's name ("Decay Dose_<HN>_<date>_<time>.pdf"); only characters Drive or downloads dislike are replaced
    var name = String(fileName || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 120) || ('Decay Dose_' + row[4] + '.pdf');
    var file = pdfFolder_(row[14] || new Date()).createFile(Utilities.newBlob(bytes, 'application/pdf', name));
    file.setDescription('TDF ' + Number(row[7]).toFixed(1) + ' · HN ' + row[4] + ' ' + row[5] + ' · แพทย์ ' + row[6] +
      ' · คำนวณ ' + row[9] + ' · recheck ' + row[12] + ' · เลขที่ ' + row[0]);
    row[19] = file.getId();
    row[20] = file.getUrl();
    sh.getRange(found.row, 1, 1, row.length).setValues([row]);
    return record_(row);
  });
}

/** Drive folder for approved reports, with one subfolder per month (by approval date). Created under the lock. */
function pdfFolder_(date) {
  return locked_(function () { return pdfFolderLocked_(date); });
}

function pdfFolderLocked_(date) {
  var props = PropertiesService.getScriptProperties();
  var root = null, id = props.getProperty('PDF_FOLDER_ID');
  if (id) { try { root = DriveApp.getFolderById(id); } catch (e) { root = null; } }
  if (!root) {
    root = DriveApp.createFolder(PDF_FOLDER);
    props.setProperty('PDF_FOLDER_ID', root.getId());
  }
  if (!date) return root;
  var month = Utilities.formatDate(new Date(date), 'Asia/Bangkok', 'yyyy-MM');
  var it = root.getFoldersByName(month);
  return it.hasNext() ? it.next() : root.createFolder(month);
}

/** The calculator withdraws their own record before it is approved. */
function tdfWithdraw(token, id) {
  var me = user_(token);
  return locked_(function () {
    var sh = records_();
    var found = findRecord_(sh, id);
    if (!found) return true;
    if (found.values[8] !== me.username) throw new Error('ถอนได้เฉพาะรายการที่คุณเป็นผู้คำนวณ');
    if (found.values[2] === 'approved') throw new Error('รายการที่อนุมัติแล้วถอนไม่ได้');
    sh.deleteRow(found.row);
    return true;
  });
}

/* ----- record helpers ----- */

function record_(row) {
  var j = {};
  try { j = JSON.parse(row[18] || '{}'); } catch (e) { j = {}; }
  var t = function (v) { return v ? new Date(v).getTime() : null; };
  return {
    id: String(row[0]), at: t(row[1]), status: String(row[2]), type: String(row[3]), tdf: Number(row[7]), ref: j.ref,
    title: j.title || '', summary: j.summary || '', sig: String(row[17]), state: j.state, patient: j.patient || {}, doctor: String(row[6]),
    snap: j.snap || {},
    calc: { username: String(row[8]), name: String(row[9]), role: String(row[10]), at: t(row[1]) },
    review: row[11] ? { username: String(row[11]), name: String(row[12]), role: String(row[13]), at: t(row[14]),
      note: String(row[15] || ''), recheckTdf: row[16] === '' ? null : Number(row[16]) } : null,
    pdf: row[19] ? { id: String(row[19]), url: String(row[20] || '') } : null
  };
}

function findRecord_(sh, id) {
  var rows = sh.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) if (String(rows[i][0]) === String(id)) return { row: i + 1, values: rows[i] };
  return null;
}

function patientName_(p) {
  return ((p.prefix && p.prefix !== '-' ? String(p.prefix) : '') + [p.first, p.last].filter(function (x) { return x; }).join(' ')).trim().slice(0, 120);
}

var LOCK_WAIT_MS = 20000;
var lockDepth_ = 0;

/**
 * Runs fn while holding the script lock, so writes from several users never interleave. Nested calls (a locked
 * function that opens the sheet or the PDF folder) reuse the lock already held instead of waiting on themselves.
 */
function locked_(fn) {
  if (lockDepth_ > 0) return fn();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) throw new Error('ระบบกำลังบันทึกข้อมูลของผู้ใช้อื่นอยู่ กรุณาลองใหม่อีกครั้งในอีกสักครู่');
  lockDepth_++;
  try { return fn(); } finally { lockDepth_--; lock.releaseLock(); }
}

/**
 * The records sheet, in a spreadsheet this script created (its id is kept in Script properties). Opening it needs no
 * lock; creating it or adding new header columns happens under the lock and is checked again once the lock is held,
 * so two users arriving together never make two spreadsheets.
 */
function records_() {
  return openRecords_() || locked_(function () { return openRecords_() || createRecords_(); });
}

/** The records sheet when it exists with every column, otherwise null. */
function openRecords_() {
  var id = PropertiesService.getScriptProperties().getProperty('RECORDS_SHEET_ID');
  if (!id) return null;
  var ss;
  try { ss = SpreadsheetApp.openById(id); } catch (e) { return null; }
  var sh = ss.getSheetByName('Records');
  return sh && sh.getLastColumn() >= RECORD_HEADERS.length ? sh : null;
}

/** Creates whatever is missing: the spreadsheet, the Records sheet, the header columns. Call under the lock. */
function createRecords_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('RECORDS_SHEET_ID');
  var ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('TDF Calculator Records');
    ss.setSpreadsheetTimeZone('Asia/Bangkok');
    props.setProperty('RECORDS_SHEET_ID', ss.getId());
  }
  var sh = ss.getSheetByName('Records');
  if (!sh) {
    sh = ss.getSheets()[0];
    sh.setName('Records');
    sh.clear();
    sh.appendRow(RECORD_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, RECORD_HEADERS.length).setFontWeight('bold').setFontColor('#ffffff').setBackground('#126b38');
    sh.getRange('A:A').setNumberFormat('@');
    sh.getRange('E:E').setNumberFormat('@');
  }
  if (sh.getLastColumn() < RECORD_HEADERS.length) {
    sh.getRange(1, 1, 1, RECORD_HEADERS.length).setValues([RECORD_HEADERS])
      .setFontWeight('bold').setFontColor('#ffffff').setBackground('#126b38');
  }
  return sh;
}

/** Who owns this Workspace session token (cached for 5 minutes). */
function user_(token) {
  if (!token) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
  var cache = CacheService.getScriptCache(), key = meKey_(token);
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var u = session_(workspace_({ action: 'me', token: String(token) })).user;
  cache.put(key, JSON.stringify(u), 300);
  return u;
}

function meKey_(token) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token || ''));
  return 'me_' + Utilities.base64EncodeWebSafe(d);
}

/* ----- Workspace API ----- */

/** POSTs one action to the Workspace web app and returns its reply; throws the Workspace's own error message. */
function workspace_(req) {
  var res = UrlFetchApp.fetch(WORKSPACE_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(req),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('เชื่อมต่อระบบสมาชิก LPCH RO Workspace ไม่ได้ (HTTP ' + res.getResponseCode() + ')');
  var body;
  try {
    body = JSON.parse(res.getContentText());
  } catch (e) {
    throw new Error('ระบบสมาชิกตอบกลับไม่ถูกต้อง ตรวจว่า Workspace deploy แบบ Who has access: Anyone');
  }
  if (!body.ok) {
    throw new Error(body.error === 'session_expired' ? 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' : body.error || 'เข้าสู่ระบบไม่สำเร็จ');
  }
  return body;
}

/** Only what the page needs: the session token and who is signed in. */
function session_(res) {
  var u = res.user || {};
  return { token: res.token, user: { username: u.username, name: u.fullName || u.username, role: u.role || '' } };
}
