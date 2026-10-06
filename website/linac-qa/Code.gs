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
 *
 * Accounts of LPCH RO Workspace (optional, like TRS-398): Script property LPCH_URL = the /exec URL of the LPCH RO
 * Workspace web app (deployed with Who has access: Anyone). Deploy this app with Execute as "Me" and Who has
 * access "Anyone": members sign in on the form with their LPCH username (or email) and password, or arrive signed
 * in from the "เปิดแอป" button there (a one-use ticket, ?sso=…). Passwords stay in LPCH (checked through its API,
 * never kept here) and each use re-checks the account with LPCH (cached LPCH_CHECK_SECONDS), so an account
 * suspended there is out here too. Only LPCH_ROLES and LPCH admins may use the form. Run `setupLpch` to test.
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
  PAGE_URL: 'https://raw.githubusercontent.com/nattayee/nattayee/claude/lpch-ro-workspace-website-96j4r6/website/linac-qa/index.html',
  // LPCH RO Workspace accounts (Script property LPCH_URL, or put the /exec URL here)
  LPCH_URL: '',
  LPCH_ROLES: ['MP'],       // professions allowed (LPCH admins always are); ['*'] = every approved member
  LPCH_CHECK_SECONDS: 300
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
// token: the LPCH RO Workspace sign-in kept by the page ('' when none).
function whoAmI(token) {
  const email = googleEmail_();
  const lpch = !!lpchUrl_();
  if (!email && lpch) {   // LPCH accounts: the page shows its sign-in form until a member is known
    const w = token ? lpchUser_(token) : null;
    if (!w || w.error) {
      if (w && w.error) log_('', 'ถูกปฏิเสธ', '', w.error);
      return { allowed: false, lpchLogin: true, tokenBad: !!token, email: '', message: w && w.error || '' };
    }
    log_(w.email, 'เปิดฟอร์ม', '', 'บัญชี LPCH ' + w.username);
    return { allowed: true, lpchLogin: true, via: 'lpch', email: w.email, name: w.name, physicist: w.physicist };
  }
  let switchUrl = '';
  try { switchUrl = 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(ScriptApp.getService().getUrl()); } catch (e) { /* not deployed */ }
  const base = { email, name: email, physicist: CONFIG.PHYSICIST_EMAILS[email] || '', switchUrl, via: 'google' };
  const denied = allowError_(email);
  log_(email, denied ? 'ถูกปฏิเสธ' : 'เปิดฟอร์ม', '', denied);
  if (denied) return Object.assign(base, { allowed: false, message: denied });
  return Object.assign(base, { allowed: true });
}

function googleEmail_() {
  try { return String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) { return ''; }
}

/* ---------- LPCH RO Workspace accounts ---------- */
function lpchUrl_() {
  return String(CONFIG.LPCH_URL || PropertiesService.getScriptProperties().getProperty('LPCH_URL') || '').trim();
}

// One call to the LPCH RO Workspace API (its doPost); throws its error message.
function lpchCall_(req) {
  const url = lpchUrl_();
  if (!url) throw new Error('ยังไม่ได้เชื่อมกับ LPCH RO Workspace (ผู้ดูแล: ตั้ง Script property LPCH_URL)');
  const res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(req), muteHttpExceptions: true });
  let out = null;
  try { out = JSON.parse(res.getContentText('UTF-8')); } catch (e) { out = null; }
  if (!out) throw new Error('เชื่อมต่อ LPCH RO Workspace ไม่ได้ (HTTP ' + res.getResponseCode() + ') ผู้ดูแล: ตรวจ LPCH_URL และ Deploy แบบ Who has access: Anyone');
  if (!out.ok) throw new Error(out.error || 'LPCH RO Workspace ตอบกลับไม่สำเร็จ');
  return out;
}

// The LPCH member as this form sees them, or {error} when they may not use it.
function lpchProfile_(u) {
  if (!u) return { error: 'ไม่พบบัญชี LPCH RO Workspace' };
  const admin = u.isAdmin === true || String(u.isAdmin).toUpperCase() === 'TRUE';
  const roles = CONFIG.LPCH_ROLES;
  if (!admin && roles.indexOf('*') === -1 && roles.indexOf(u.role) === -1) {
    return { error: 'บัญชี ' + u.username + ' (' + u.role + ') ไม่มีสิทธิ์ใช้ Linac QA — ใช้ได้เฉพาะ ' + roles.join(', ') + ' และผู้ดูแลระบบ' };
  }
  const email = String(u.email || '').trim().toLowerCase();
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email)) {
    return { error: 'บัญชี ' + u.username + ' ยังไม่มีอีเมล: เพิ่มอีเมลที่ "บัญชีของฉัน" ใน LPCH RO Workspace ก่อน' };
  }
  const name = String(u.fullName || u.username);
  // ticks the physicist on the form when the LPCH name is one of them
  return { email, name, username: u.username, role: u.role, physicist: CONFIG.PHYSICIST_EMAILS[email] || name };
}

// The member behind an LPCH session (the page's token): asks LPCH ("me"), trusted for LPCH_CHECK_SECONDS.
function lpchUser_(token) {
  token = String(token || '');
  if (!/^[\w-]{20,200}$/.test(token)) return { error: 'การเข้าสู่ระบบไม่ถูกต้อง กรุณาเข้าสู่ระบบอีกครั้ง' };
  const cache = CacheService.getScriptCache(), key = 'lpch_' + token;
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  let p;
  try { p = lpchProfile_(lpchCall_({ action: 'me', token }).user); } catch (e) {
    if (e.message !== 'session_expired') throw e;   // LPCH unreachable: say so rather than sign the person out
    p = { error: 'การเข้าสู่ระบบด้วยบัญชี LPCH หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' };
  }
  cache.put(key, JSON.stringify(p), CONFIG.LPCH_CHECK_SECONDS);
  return p;
}

// An LPCH sign-in ({token, user}) checked for this form: returns {token, ...member} or throws why not.
function lpchFinish_(out) {
  const p = lpchProfile_(out.user);
  if (p.error) {
    try { lpchCall_({ action: 'logout', token: out.token }); } catch (e) { /* the session just expires */ }
    throw new Error(p.error);
  }
  CacheService.getScriptCache().put('lpch_' + out.token, JSON.stringify(p), CONFIG.LPCH_CHECK_SECONDS);
  return Object.assign({ token: out.token }, p);
}

// Called by the sign-in form: username (or email) and password are checked by LPCH, never stored here.
function lpchLogin(username, password) {
  const r = lpchFinish_(lpchCall_({ action: 'login', username: String(username || ''), password: String(password || '') }));
  log_(r.email, 'เข้าสู่ระบบ', '', 'บัญชี LPCH ' + r.username);
  return r;
}

function lpchLogout(token) {
  if (!token) return true;
  CacheService.getScriptCache().remove('lpch_' + token);
  try { lpchCall_({ action: 'logout', token: String(token) }); } catch (e) { /* the session just expires */ }
  return true;
}

// Run from the editor: is LPCH_URL set, reachable, and does that copy know the shared-login commands?
function setupLpch() {
  const url = lpchUrl_();
  let msg;
  if (!url) msg = '✗ ยังไม่ได้ตั้ง LPCH_URL (Project Settings → Script properties) — ใช้บัญชี Google ตามเดิม';
  else if (!/^https:\/\/script\.google\.com\/(a\/[^\/]+\/)?macros\/s\/[\w-]+\/(exec|dev)$/.test(url)) msg = '✗ LPCH_URL ต้องเป็น https://script.google.com/macros/s/…/exec (ตอนนี้: ' + url + ')';
  else {
    try { lpchCall_({ action: 'ssoRedeem', ticket: 'check' }); msg = '✓ เชื่อมต่อ LPCH RO Workspace ได้'; } catch (e) {
      msg = /หมดอายุ|ถูกใช้ไปแล้ว/.test(e.message) ? '✓ เชื่อมต่อ LPCH RO Workspace ได้ และรองรับการใช้บัญชีร่วมกันแล้ว'
        : /ไม่รู้จักคำสั่ง/.test(e.message) ? '✗ LPCH RO Workspace ยังเป็น Code.gs เวอร์ชันเก่า: วาง Code.gs ใหม่แล้ว Deploy → New version'
        : '✗ ' + e.message;
    }
  }
  Logger.log('LPCH_URL = ' + (url || '(ยังไม่ได้ตั้ง)'));
  Logger.log(msg);
  Logger.log('Deploy: Execute as "Me" · Who has access "Anyone" (แบบ "User accessing the web app" จะใช้บัญชี Google แทนบัญชี LPCH)');
  return msg;
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
  let html = pageHtml_(!!(e && e.parameter && e.parameter.refresh));
  // From the "เปิดแอป" button of LPCH RO Workspace: a one-use ticket, exchanged here for a sign-in
  const sso = e && e.parameter && e.parameter.sso;
  if (sso && lpchUrl_()) {
    let tag;
    try {
      const r = lpchFinish_(lpchCall_({ action: 'ssoRedeem', ticket: String(sso) }));
      log_(r.email, 'เข้าสู่ระบบ', '', 'จาก LPCH RO Workspace ' + r.username);
      tag = 'window.LINAC_LPCH_TOKEN = ' + JSON.stringify(r.token) + ';';
    } catch (err) {
      tag = 'window.LINAC_LPCH_ERROR = ' + JSON.stringify(String(err.message)).replace(/</g, '\\u003c') + ';';
    }
    const m = /<head(\s[^>]*)?>/i.exec(html);
    const at = m ? m.index + m[0].length : 0;
    html = html.slice(0, at) + '<script>' + tag + '</script>' + html.slice(at);
  }
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
    // keyed by PAGE_URL: after the address changes the new page is fetched at once
    const key = 'page_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, CONFIG.PAGE_URL)).slice(0, 10);
    let html = refresh ? '' : cacheGet_(cache, key);
    if (!complete(html)) {
      try {
        const res = UrlFetchApp.fetch(CONFIG.PAGE_URL, { muteHttpExceptions: true });
        if (res.getResponseCode() === 200) html = res.getContentText('UTF-8');
      } catch (err) { html = ''; }
      if (complete(html)) cachePut_(cache, key, html, 600);
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
    log_(googleEmail_(), 'ส่งไม่สำเร็จ', recordId, message);
    return { ok: false, error: message };
  } finally {
    try { lock.releaseLock(); } catch (e) { /* not held */ }
  }
}

/* ---------- dashboard: history and trends ---------- */
// Called by the Dashboard tab through google.script.run. Dates go back as text because
// google.script.run cannot return Date objects.
function getHistory(token) {
  requireUser_(token);
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

function getRecord(id, token) {
  requireUser_(token);
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
function getTrend(category, test, item, token) {
  requireUser_(token);
  const sh = tab_(TABS.results), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, 12).getValues()
    .filter(x => String(x[3]) === category && String(x[4]) === test && String(x[5]) === item && x[7] !== '')
    .map(x => ({ id: String(x[0]), machine: String(x[1]), date: text_(x[2]), value: text_(x[7]), deviation: text_(x[9]), result: String(x[11]) }));
}

function requireUser_(token) {
  const email = googleEmail_();
  if (!email && lpchUrl_()) {
    const w = lpchUser_(token);
    if (w.error) throw new Error(w.error);
    return;
  }
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
  const session = googleEmail_();
  if (session) {
    const denied = allowError_(session);
    if (denied) throw new Error(denied);
    return { name: CONFIG.PHYSICIST_EMAILS[session] || session, email: session };
  }
  // LPCH RO Workspace account: the member LPCH vouches for, never what the page typed
  if (lpchUrl_()) {
    if (!data.lpchToken) throw new Error('กรุณาเข้าสู่ระบบด้วยบัญชี LPCH RO Workspace ก่อนส่งข้อมูล');
    const w = lpchUser_(data.lpchToken);
    if (w.error) throw new Error(w.error);
    return { name: w.name, email: w.email };
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

// ----- สิ้นสุดไฟล์ Code.gs (Linac QA + บัญชี LPCH RO Workspace) ถ้าไม่เห็นบรรทัดนี้ใน Apps Script แสดงว่าวางโค้ดมาไม่ครบ -----
