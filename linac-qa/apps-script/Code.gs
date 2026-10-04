/**
 * Linac QA, Lampang Cancer Hospital — Apps Script web app
 *
 * This project serves the QA form (Index.html) and writes results to this spreadsheet:
 *   Records  one row per QA record (updated in place when the same record is sent again)
 *   Results  one row per checked item
 *   Photos   one row per attached photo (image files go to a Drive folder)
 *   Log      one row each time someone opens the form or sends results, with their Gmail
 *
 * Files in the Apps Script project:
 *   Code.gs     this file
 *   Index.html  optional: the form (same file as linac-qa/index.html). By default the form is
 *               loaded from GitHub (CONFIG.PAGE_URL), so only this file has to be pasted.
 *
 * Setup (see linac-qa/apps-script/README.md):
 *   1. Open the spreadsheet → Extensions → Apps Script (or any Apps Script project and set
 *      CONFIG.SHEET_ID). Paste this file as Code.gs and add an HTML file named "Index" with the
 *      contents of Index.html. Save.
 *   2. Run `setup` once and allow the requested permissions (creates the tabs and headers).
 *   3. Deploy → New deployment → type "Web app", Execute as "Me", choose who has access.
 *   4. Open the Web app URL (…/exec): that is the public address of the form.
 */

const CONFIG = {
  // ID of the Google Sheet that stores the results (the part between /d/ and /edit in its link).
  // Needed when this Apps Script project was created on its own rather than from the Sheet's
  // Extensions → Apps Script menu. Leave empty to use the Sheet the project is attached to.
  SHEET_ID: '1ehuUJ5WR5Rie-aC8AU1dTskwENA3LyHS-bU33dBpd28',
  // Sign-in with Gmail: deploy the web app with Execute as "User accessing the web app" and
  // Who has access "Anyone with Google account". Google then asks people to sign in, this
  // script sees their email, and only accounts that can open the Sheet above may use the form.
  // ALLOWED_EMAILS / ALLOWED_DOMAINS narrow it further (empty = everyone the Sheet is shared with).
  ALLOWED_EMAILS: [],     // e.g. ['someone@gmail.com']
  ALLOWED_DOMAINS: [],    // e.g. ['example.go.th']
  // Optional: email → physicist name, ticked automatically on the form after sign-in.
  PHYSICIST_EMAILS: {},   // e.g. { 'someone@gmail.com': 'วันนิตา มะลิลา' }
  // Only for the separate hosted page (index.html outside Apps Script) with its own Google button.
  CLIENT_ID: '',
  PHOTO_FOLDER: 'Linac QA Photos',
  // Where the form page comes from. Updates pushed to GitHub show up within ~10 minutes
  // (open …/exec?refresh=1 to load them at once). Leave empty to use the Index file instead.
  PAGE_URL: 'https://raw.githubusercontent.com/nattayee/nattayee/claude/modest-euler-colam2/linac-qa/index.html'
};

const TABS = {
  records: {
    name: 'Records',
    head: ['Record ID', 'Sent at', 'Recorded by', 'Email', 'Machine', 'QA frequency', 'QA date', 'Physicist',
      'Pass', 'Fail', 'Pending', 'Overall', 'QA note', 'Photos', 'Photo folder', 'Form data']
  },
  results: {
    name: 'Results',
    head: ['Record ID', 'Machine', 'QA date', 'Category', 'Test', 'Item', 'Nominal', 'Value', 'Unit', 'Deviation', 'Limit', 'Result', 'Email']
  },
  photos: {
    name: 'Photos',
    head: ['Record ID', 'Machine', 'QA date', 'Category', 'Caption', 'File name', 'Link', 'Email']
  },
  log: {
    name: 'Log',
    head: ['Time', 'Email', 'Action', 'Record ID', 'Detail']
  }
};

const UNKNOWN_EMAIL = '(ไม่ทราบอีเมล: ตั้ง Deploy เป็น Execute as = User accessing the web app)';

// Adds one row to the Log tab. Never stops the main work if logging fails.
function log_(email, action, recordId, detail) {
  try { tab_(TABS.log).appendRow([new Date(), email || UNKNOWN_EMAIL, action, recordId || '', detail || ''].map(cell_)); } catch (e) { /* no access */ }
}

function ss_() {
  const ss = CONFIG.SHEET_ID ? SpreadsheetApp.openById(CONFIG.SHEET_ID) : SpreadsheetApp.getActive();
  if (!ss) throw new Error('ไม่พบ Google Sheet ใส่ ID ของ Sheet ใน CONFIG.SHEET_ID ที่ด้านบนของ Code.gs');
  return ss;
}

function setup() {
  Object.keys(TABS).forEach(k => tab_(TABS[k]));
  const first = ss_().getSheets()[0];
  if (first.getName() !== TABS.records.name && first.getLastRow() === 0) ss_().deleteSheet(first);
  // One shared photo folder for everyone (needed when the app runs as each signed-in user).
  const props = PropertiesService.getScriptProperties();
  let dir = null;
  try { dir = props.getProperty('PHOTO_FOLDER_ID') && DriveApp.getFolderById(props.getProperty('PHOTO_FOLDER_ID')); } catch (e) { dir = null; }
  if (!dir) {
    dir = folder_(DriveApp.getRootFolder(), CONFIG.PHOTO_FOLDER);
    props.setProperty('PHOTO_FOLDER_ID', dir.getId());
  }
  Logger.log('Sheet: ' + ss_().getUrl());
  Logger.log('Photo folder: ' + dir.getUrl() + '  (share this folder and the Sheet with staff as Editor)');
}

/* ---------- who is signed in ---------- */
function whoAmI() {
  const email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  let switchUrl = '';
  try { switchUrl = 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(ScriptApp.getService().getUrl()); } catch (e) { /* not deployed */ }
  const base = { email, name: email, physicist: CONFIG.PHYSICIST_EMAILS[email] || '', switchUrl };
  const denied = allowError_(email);
  log_(email, denied ? 'ถูกปฏิเสธ' : 'เปิดฟอร์ม', '', denied);
  if (denied) return Object.assign(base, { allowed: false, message: denied });
  return Object.assign(base, { allowed: true });
}

// Returns a reason (Thai) when this account may not use the form, or '' when it may.
function allowError_(email) {
  const emails = CONFIG.ALLOWED_EMAILS.map(x => x.toLowerCase());
  const domains = CONFIG.ALLOWED_DOMAINS.map(x => x.toLowerCase());
  const restricted = emails.length || domains.length;
  if (!email) {
    return restricted ? 'ระบบจำกัดผู้ใช้ไว้ แต่ไม่ทราบอีเมลของบัญชีนี้ ผู้ดูแลต้องตั้ง Deploy เป็น Execute as: User accessing the web app' : '';
  }
  if (restricted && !emails.includes(email) && !domains.includes(email.split('@')[1])) {
    return email + ' ไม่อยู่ในรายชื่อผู้ใช้ ติดต่อผู้ดูแลเพื่อเพิ่มบัญชี';
  }
  try { ss_(); } catch (e) {
    return email + ' ยังไม่มีสิทธิ์เข้าถึง Google Sheet ของระบบ ติดต่อผู้ดูแลให้แชร์ Sheet (Editor) ให้บัญชีนี้';
  }
  return '';
}

// …/exec shows the form; …/exec?ping=1 returns a JSON health check.
function doGet(e) {
  if (e && e.parameter && e.parameter.ping) {
    return json_({ ok: true, app: 'linac-qa', sheet: ss_().getUrl() });
  }
  const html = pageHtml_(!!(e && e.parameter && e.parameter.refresh));
  return HtmlService.createHtmlOutput(html)
    .setTitle('Linac QA, Lampang Cancer Hospital')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/* ---------- form page ---------- */
// The page (~120 KB) is cached in pieces because one cache entry holds at most 100 KB.
function pageHtml_(refresh) {
  const cache = CacheService.getScriptCache();
  const complete = h => !!h && h.indexOf('</html>') > -1;
  if (CONFIG.PAGE_URL) {
    let html = refresh ? '' : cacheGet_(cache, 'page');
    if (!complete(html)) {
      try {
        const res = UrlFetchApp.fetch(CONFIG.PAGE_URL, { muteHttpExceptions: true });
        if (res.getResponseCode() === 200) html = res.getContentText('UTF-8');
      } catch (err) { html = ''; }
      if (complete(html)) cachePut_(cache, 'page', html, 600);
    }
    if (complete(html)) return html;
  }
  let local = '';
  try { local = HtmlService.createHtmlOutputFromFile('Index').getContent(); } catch (err) { local = ''; }
  if (complete(local)) return local;
  return '<p style="font:16px sans-serif;padding:24px">โหลดหน้าฟอร์มไม่ได้ ตรวจ CONFIG.PAGE_URL ใน Code.gs ' +
    'หรือวางไฟล์ Index ให้ครบ (บรรทัดสุดท้ายต้องเป็น &lt;/html&gt;)</p>';
}

function cachePut_(cache, key, text, seconds) {
  const size = 30000, parts = {};   // characters; Thai text is up to 3 bytes each
  let n = 0;
  for (let i = 0; i < text.length; i += size) parts[key + '_' + (n++)] = text.slice(i, i + size);
  parts[key + '_n'] = String(n);
  cache.putAll(parts, seconds);
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

// Called by the form through google.script.run when it is served by this web app.
function submitRecord(body) {
  return handle_(body);
}

// The page sends either a JSON body (fetch) or a form field `payload` (hidden-iframe fallback,
// used when the browser blocks fetch, e.g. a page opened from a local file). Form posts get an
// HTML reply that passes the result back to the page with postMessage.
function doPost(e) {
  const viaForm = !!(e.parameter && e.parameter.payload);
  const out = handle_(viaForm ? e.parameter.payload : e.postData.contents);
  if (!viaForm) return json_(out);
  const msg = JSON.stringify({ source: 'linac-qa', rid: String(e.parameter.rid || ''), result: out }).replace(/</g, '\\u003c');
  return HtmlService.createHtmlOutput('<script>window.top.postMessage(' + msg + ', "*");</script>')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function handle_(body) {
  const lock = LockService.getScriptLock();
  let recordId = '';
  try {
    lock.waitLock(30000);
    const data = JSON.parse(body);
    recordId = data && data.recordId || '';
    if (!data || data.app !== 'linac-qa' || !data.recordId) throw new Error('ข้อมูลที่ส่งมาไม่ถูกต้อง');
    const user = checkUser_(data);
    const info = data.info || {};
    const id = String(data.recordId);

    // keepPhotos: the page has no new photos for this record, so leave the saved ones untouched
    const photo = data.keepPhotos ? keptPhotos_(id) : savePhotos_(id, info, data.photos || [], user.email);

    const s = data.summary || {};
    let form = data.form ? JSON.stringify(data.form) : '';
    if (form.length > 45000) form = '';   // a Sheets cell holds at most 50,000 characters
    upsertRow_(TABS.records, id, [
      id, new Date(), user.name, user.email || UNKNOWN_EMAIL, info.machine, info.frequency, info.date, info.physicist,
      s.pass, s.fail, s.pending, s.overall, data.note, photo.rows.length, photo.folderUrl, form
    ]);

    replaceRows_(TABS.results, id, (data.results || []).map(r => [
      id, info.machine, info.date, r.category, r.test, r.item, r.nominal, r.value, r.unit, r.deviation, r.limit, r.result, user.email
    ]));
    if (!data.keepPhotos) replaceRows_(TABS.photos, id, photo.rows);
    log_(user.email, 'ส่งผล', id, (data.results || []).length + ' รายการ · รูป ' + photo.rows.length + ' รูป · ' + (s.overall || ''));

    return { ok: true, recordId: id, results: (data.results || []).length, photos: photo.rows.length, sheetUrl: ss_().getUrl() };
  } catch (err) {
    const message = String(err && err.message || err);
    log_(String(Session.getActiveUser().getEmail() || '').toLowerCase(), 'ส่งไม่สำเร็จ', recordId, message);
    return { ok: false, error: message };
  } finally {
    try { lock.releaseLock(); } catch (e) { /* not held */ }
  }
}

/* ---------- dashboard: history and trends ---------- */
// Called by the Dashboard tab through google.script.run. Dates go back as text because
// google.script.run cannot return Date objects.
function getHistory() {
  requireUser_();
  const sh = tab_(TABS.records), n = sh.getLastRow() - 1;
  if (n < 1) return { records: [] };
  const rows = sh.getRange(2, 1, n, TABS.records.head.length).getValues();
  const records = rows.filter(r => r[0]).map(r => ({
    id: String(r[0]), sentAt: text_(r[1], true), by: String(r[2] || ''), email: String(r[3] || ''),
    machine: String(r[4] || ''), frequency: String(r[5] || ''), date: text_(r[6]), physicist: String(r[7] || ''),
    pass: Number(r[8]) || 0, fail: Number(r[9]) || 0, pending: Number(r[10]) || 0, overall: String(r[11] || ''),
    note: String(r[12] || ''), photos: Number(r[13]) || 0, folder: String(r[14] || ''), hasForm: !!r[15]
  }));
  return { records };
}

function getRecord(id) {
  requireUser_();
  id = String(id);
  const rec = tab_(TABS.records), hit = idRows_(rec, id)[0];
  if (!hit) throw new Error('ไม่พบ Record ID ' + id);
  const r = rec.getRange(hit, 1, 1, TABS.records.head.length).getValues()[0];
  let form = null;
  try { form = r[15] ? JSON.parse(r[15]) : null; } catch (e) { form = null; }
  const pick = (def, map) => {
    const sh = tab_(def), n = sh.getLastRow() - 1;
    if (n < 1) return [];
    return sh.getRange(2, 1, n, def.head.length).getValues().filter(x => String(x[0]) === id).map(map);
  };
  const results = pick(TABS.results, x => ({ category: String(x[3]), test: String(x[4]), item: String(x[5]), nominal: text_(x[6]),
    value: text_(x[7]), unit: String(x[8]), deviation: text_(x[9]), limit: String(x[10]), result: String(x[11]) }));
  const photos = pick(TABS.photos, x => ({ category: String(x[3]), caption: String(x[4]), name: String(x[5]), url: String(x[6]) }));
  return {
    record: { id, sentAt: text_(r[1], true), by: String(r[2] || ''), email: String(r[3] || ''), machine: String(r[4] || ''),
      frequency: String(r[5] || ''), date: text_(r[6]), physicist: String(r[7] || ''), pass: Number(r[8]) || 0,
      fail: Number(r[9]) || 0, pending: Number(r[10]) || 0, overall: String(r[11] || ''), note: String(r[12] || ''),
      photos: Number(r[13]) || 0, folder: String(r[14] || '') },
    results, photos, form
  };
}

// One checked item across every saved record, e.g. ('Gantry', 'Gantry reading', '90°').
function getTrend(category, test, item) {
  requireUser_();
  const sh = tab_(TABS.results), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, 12).getValues()
    .filter(x => String(x[3]) === category && String(x[4]) === test && String(x[5]) === item && x[7] !== '')
    .map(x => ({ id: String(x[0]), machine: String(x[1]), date: text_(x[2]), value: text_(x[7]), deviation: text_(x[9]), result: String(x[11]) }));
}

function requireUser_() {
  const email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  const denied = allowError_(email);
  if (denied) throw new Error(denied);
}

function text_(v, withTime) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), withTime ? "yyyy-MM-dd'T'HH:mm" : 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : String(v);
}

function keptPhotos_(id) {
  const sh = tab_(TABS.photos), n = sh.getLastRow() - 1;
  const rows = n < 1 ? [] : sh.getRange(2, 1, n, TABS.photos.head.length).getValues().filter(x => String(x[0]) === id);
  const rec = tab_(TABS.records), hit = idRows_(rec, id)[0];
  const folderUrl = hit ? String(rec.getRange(hit, 15).getValue() || '') : '';
  return { rows, folderUrl };
}

/* ---------- sign-in check ---------- */
function checkUser_(data) {
  const sent = data.recordedBy || {};
  // Signed in through the Apps Script web app: Google tells us who it is.
  const session = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (session) {
    const denied = allowError_(session);
    if (denied) throw new Error(denied);
    return { name: CONFIG.PHYSICIST_EMAILS[session] || session, email: session };
  }
  if (!CONFIG.CLIENT_ID) {
    const denied = allowError_('');
    if (denied) throw new Error(denied);
    return { name: sent.name || '', email: sent.email || '' };
  }
  if (!data.idToken) throw new Error('ต้องเข้าสู่ระบบด้วย Google ก่อนส่งข้อมูล');
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(data.idToken), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('การเข้าสู่ระบบหมดอายุ เข้าสู่ระบบอีกครั้งแล้วส่งใหม่');
  const t = JSON.parse(res.getContentText());
  if (t.aud !== CONFIG.CLIENT_ID) throw new Error('Client ID ไม่ตรงกับที่ตั้งไว้');
  if (String(t.email_verified) !== 'true') throw new Error('บัญชีนี้ยังไม่ได้ยืนยันอีเมลกับ Google');
  const email = String(t.email).toLowerCase();
  const emails = CONFIG.ALLOWED_EMAILS.map(x => x.toLowerCase());
  const domains = CONFIG.ALLOWED_DOMAINS.map(x => x.toLowerCase());
  if ((emails.length || domains.length) && !emails.includes(email) && !domains.includes(email.split('@')[1])) {
    throw new Error(email + ' ไม่มีสิทธิ์ส่งข้อมูล');
  }
  return { name: t.name || sent.name || email, email };
}

/* ---------- photos ---------- */
function savePhotos_(id, info, photos, email) {
  const root = photoRoot_();
  const name = [info.date, info.machine, id].filter(Boolean).join(' ');
  const existing = root.getFoldersByName(name);
  if (!photos.length) {
    if (existing.hasNext()) existing.next().setTrashed(true);
    return { rows: [], folderUrl: '' };
  }
  const dir = existing.hasNext() ? existing.next() : root.createFolder(name);
  const old = dir.getFiles();
  while (old.hasNext()) old.next().setTrashed(true);
  const rows = photos.map((p, i) => {
    const m = /^data:(image\/[\w.+-]+);base64,(.+)$/.exec(p.data || '');
    if (!m) return null;
    const fileName = (i + 1) + ' ' + (p.category || '') + (p.cap ? ' - ' + p.cap : '') + '.jpg';
    const file = dir.createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], fileName.replace(/[\\/:*?"<>|]/g, '-')));
    return [id, info.machine, info.date, p.category, p.cap, file.getName(), file.getUrl(), email];
  }).filter(Boolean);
  return { rows, folderUrl: dir.getUrl() };
}

function photoRoot_() {
  const id = PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) {
      throw new Error('เปิดโฟลเดอร์รูป Linac QA Photos ไม่ได้ ติดต่อผู้ดูแลให้แชร์โฟลเดอร์ (Editor) ให้บัญชีนี้');
    }
  }
  return folder_(DriveApp.getRootFolder(), CONFIG.PHOTO_FOLDER);
}

function folder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/* ---------- sheet helpers ---------- */
function tab_(def) {
  const ss = ss_();
  let sh = ss.getSheetByName(def.name);
  if (!sh) sh = ss.insertSheet(def.name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, def.head.length).setValues([def.head]).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else if (sh.getLastColumn() < def.head.length) {
    // a column was added in a newer version (e.g. Email): extend the header row
    sh.getRange(1, 1, 1, def.head.length).setValues([def.head]).setFontWeight('bold');
  }
  return sh;
}

function idRows_(sh, id) {
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, 1).getValues().map((r, i) => (String(r[0]) === id ? i + 2 : 0)).filter(Boolean);
}

function upsertRow_(def, id, row) {
  const sh = tab_(def);
  const values = [row.map(cell_)];
  const hit = idRows_(sh, id)[0];
  if (hit) sh.getRange(hit, 1, 1, values[0].length).setValues(values);
  else sh.getRange(sh.getLastRow() + 1, 1, 1, values[0].length).setValues(values);
}

function replaceRows_(def, id, rows) {
  const sh = tab_(def);
  const hits = idRows_(sh, id);
  // delete bottom-up in contiguous blocks
  for (let i = hits.length - 1; i >= 0;) {
    let start = hits[i], count = 1;
    while (i - count >= 0 && hits[i - count] === start - 1) { start--; count++; }
    sh.deleteRows(start, count);
    i -= count;
  }
  if (!rows.length) return;
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows.map(r => r.map(cell_)));
}

// Numbers stay numbers; text that Sheets would treat as a formula is kept as plain text.
function cell_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || v instanceof Date) return v;
  const s = String(v);
  if (/^[-+]?\d+(\.\d+)?$/.test(s.trim())) return Number(s);
  if (/^[=+\-@]/.test(s)) return "'" + s;
  return s;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
