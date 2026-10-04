/**
 * Lampang Cancer Hospital, Linac QA — Apps Script web app
 *
 * This project serves the QA form (Index.html) and writes results to this spreadsheet:
 *   Records  one row per QA record (updated in place when the same record is sent again)
 *   Results  one row per checked item
 *   Photos   one row per attached photo (image files go to a Drive folder)
 *
 * Files in the Apps Script project:
 *   Code.gs     this file
 *   Index.html  the form (same file as linac-qa/index.html)
 *
 * Setup (see linac-qa/apps-script/README.md):
 *   1. Open the spreadsheet → Extensions → Apps Script. Paste this file as Code.gs and add an
 *      HTML file named "Index" with the contents of Index.html. Save.
 *   2. Run `setup` once and allow the requested permissions (creates the tabs and headers).
 *   3. Deploy → New deployment → type "Web app", Execute as "Me", choose who has access.
 *   4. Open the Web app URL (…/exec): that is the public address of the form.
 */

const CONFIG = {
  // Same value as AUTH.clientId in index.html. When set, only signed-in users on the
  // allowed list can send data (their Google ID token is checked here on the server).
  CLIENT_ID: '',
  ALLOWED_EMAILS: [],     // e.g. ['someone@gmail.com']; empty with empty domains = any verified Google account
  ALLOWED_DOMAINS: [],    // e.g. ['example.go.th']
  PHOTO_FOLDER: 'Linac QA Photos'
};

const TABS = {
  records: {
    name: 'Records',
    head: ['Record ID', 'Sent at', 'Recorded by', 'Email', 'Machine', 'QA frequency', 'QA date', 'Physicist',
      'Pass', 'Fail', 'Pending', 'Overall', 'QA note', 'Photos', 'Photo folder']
  },
  results: {
    name: 'Results',
    head: ['Record ID', 'Machine', 'QA date', 'Category', 'Test', 'Item', 'Nominal', 'Value', 'Unit', 'Deviation', 'Limit', 'Result']
  },
  photos: {
    name: 'Photos',
    head: ['Record ID', 'Machine', 'QA date', 'Category', 'Caption', 'File name', 'Link']
  }
};

function setup() {
  Object.keys(TABS).forEach(k => tab_(TABS[k]));
  const first = SpreadsheetApp.getActive().getSheets()[0];
  if (first.getName() !== TABS.records.name && first.getLastRow() === 0) SpreadsheetApp.getActive().deleteSheet(first);
}

// …/exec shows the form; …/exec?ping=1 returns a JSON health check.
function doGet(e) {
  if (e && e.parameter && e.parameter.ping) {
    return json_({ ok: true, app: 'linac-qa', sheet: SpreadsheetApp.getActive().getUrl() });
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Lampang Cancer Hospital, Linac QA')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
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
  try {
    lock.waitLock(30000);
    const data = JSON.parse(body);
    if (!data || data.app !== 'linac-qa' || !data.recordId) throw new Error('ข้อมูลที่ส่งมาไม่ถูกต้อง');
    const user = checkUser_(data);
    const info = data.info || {};
    const id = String(data.recordId);

    const photo = savePhotos_(id, info, data.photos || []);

    const s = data.summary || {};
    upsertRow_(TABS.records, id, [
      id, new Date(), user.name, user.email, info.machine, info.frequency, info.date, info.physicist,
      s.pass, s.fail, s.pending, s.overall, data.note, photo.rows.length, photo.folderUrl
    ]);

    replaceRows_(TABS.results, id, (data.results || []).map(r => [
      id, info.machine, info.date, r.category, r.test, r.item, r.nominal, r.value, r.unit, r.deviation, r.limit, r.result
    ]));
    replaceRows_(TABS.photos, id, photo.rows);

    return { ok: true, recordId: id, results: (data.results || []).length, photos: photo.rows.length, sheetUrl: SpreadsheetApp.getActive().getUrl() };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  } finally {
    try { lock.releaseLock(); } catch (e) { /* not held */ }
  }
}

/* ---------- sign-in check ---------- */
function checkUser_(data) {
  const sent = data.recordedBy || {};
  if (!CONFIG.CLIENT_ID) return { name: sent.name || '', email: sent.email || '' };
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
function savePhotos_(id, info, photos) {
  const root = folder_(DriveApp.getRootFolder(), CONFIG.PHOTO_FOLDER);
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
    return [id, info.machine, info.date, p.category, p.cap, file.getName(), file.getUrl()];
  }).filter(Boolean);
  return { rows, folderUrl: dir.getUrl() };
}

function folder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/* ---------- sheet helpers ---------- */
function tab_(def) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(def.name);
  if (!sh) sh = ss.insertSheet(def.name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, def.head.length).setValues([def.head]).setFontWeight('bold');
    sh.setFrozenRows(1);
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
