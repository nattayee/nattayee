/**
 * TRS-398 Output Calibration — Google Apps Script web app. This is the only file the project needs.
 * The page itself (index.html) is loaded from GitHub, so app updates arrive without re-pasting.
 *
 *   1. Create this project signed in as nattayee@gmail.com and run setup() once: it creates the Output Log
 *      in nattayee's Drive (copying the old log's rows).
 *   2. Deploy → New deployment → Web app
 *      Execute as: "Me (nattayee@gmail.com)"   Who has access: "Anyone with Google account"
 *   Google asks users to sign in before the page opens; nobody has to approve the app or get the files shared,
 *   because the script reads and writes as nattayee.
 *   3. "Sign in with Google" button. Under "Execute as: Me" Google does not tell the script which Gmail opened
 *      it, so the same project gets a SECOND deployment that only signs people in:
 *      Deploy → New deployment → Web app   Execute as: "User accessing the web app"
 *                                           Who has access: "Anyone with Google account"
 *      Opened with ?login=1 it reads the visitor's Gmail, signs it with a secret kept in Script properties and
 *      sends them back to the app (step 2's URL). Then: Project Settings → Script properties →
 *        APP_URL   = the /exec URL of deployment 2 (the app)
 *        LOGIN_URL = the /exec URL of deployment 3 (sign-in)
 *      Until LOGIN_URL is set, only nattayee can send reports (others are told sign-in is not set up).
 *   4. Automatic sign-in: once nattayee has opened the app (which records the app's page origin as
 *      APP_ORIGIN), every page load asks deployment 3 in a hidden frame for the Google account signed in right
 *      now, so the recorder follows whoever is signed in. First use (approval) or browsers that block it fall
 *      back to the "Sign in with Google" button.
 *   5. Shared accounts with LPCH RO Workspace (optional): Script property LPCH_URL = the /exec URL of the LPCH RO
 *      Workspace web app (deployed with Who has access: Anyone). Members then sign in with their LPCH username or
 *      email + password, or arrive already signed in from the "เปิดแอป" button there (a one-use ticket, ?sso=…).
 *      Passwords stay in LPCH (checked through its API, never kept here); every use re-checks the account with
 *      LPCH (cached LPCH_CHECK_SECONDS), so an account suspended there is out here too. Only LPCH_ROLES and LPCH
 *      admins may use the app; the recorder in the Log is the email of the LPCH account.
 */
var WEBAPP = {
  OWNER_EMAIL: 'nattayee@gmail.com',
  // Optional: Gmail accounts that shareLog() gives edit access to the Log, to open it in Google Sheets.
  // The web app itself does not need this (it writes as nattayee).
  EDITORS: ['nattayee@gmail.com'],
  USER_HEADER: 'ผู้บันทึก (Gmail)',
  PAGE_URL: 'https://raw.githubusercontent.com/nattayee/nattayee/refs/heads/claude/lpch-ro-workspace-website-96j4r6/website/trs398/index.html',
  // LPCH RO Workspace accounts (Script property LPCH_URL): who may use this app, and how long a check is trusted
  LPCH_ROLES: ['MP'],          // professions allowed (LPCH admins always are); ['*'] = every approved member
  LPCH_CHECK_SECONDS: 300,
  LPCH_HEADER: 'บัญชี LPCH',
  MASTER_SHEET_ID: '1t8KCsJtuv3vVzqRT_uWblHEDWYARuB1KU5gqVUTpt4w',   // TG398 LPCH (master data, owned by nattayee)
  OLD_LOG_SHEET_ID: '1UpWd0zPjEDnKIuV1q6j5O4CDemNt0BbYkbFWMIudTL8',  // first Output Log (other account): rows are copied once
  LOG_NAME: 'TRS-398 Output Log (LPCH)',
  FOLDER_NAME: 'TRS-398 Output Reports',
  LOG_TAB: 'Log',
  ID_HEADER: 'Report ID',
  RESULT_HEADERS: ['ผล', 'ผลหลังปรับ'],
  TITLE: 'TRS-398 Output Calibration · Lampang Cancer Hospital',
  TIME_ZONE: 'Asia/Bangkok',   // GMT+7: dates and times in the Log are Thailand time
  CACHE_SECONDS: 600,
  LOG_HEADERS: [
    'Report ID', 'บันทึกเมื่อ', 'วันที่วัด', 'ชนิด QA', 'นักฟิสิกส์', 'ผู้บันทึก (Gmail)',
    'เครื่อง', 'พลังงาน', 'ชนิดลำรังสี', 'Setup', 'หัววัด', 'เครื่องวัดประจุ',
    'MU', 'ดัชนีคุณภาพ', 'TPR20,10 / R50', 'z_ref (g/cm²)', 'z_max (g/cm²)', 'N_D,w (cGy/nC)',
    'ที่มาของ k_Q', 'k_Q,Q0', 'k_Q,Qcross', 'T (°C)', 'P', 'หน่วย P',
    'M1 (nC)', '-M1 (nC)', 'M2 (nC)', 'V1 (V)', 'V2 (V)', 'k_TP',
    'k_pol', 'k_s', 'k_elec', 'k_vol', 'M_Q (nC)', 'TMR/PDD',
    'TMR/PDD(z_ref)', 'D_w(z_ref) (cGy/MU)', 'Output (cGy/MU)', 'Expected (cGy/MU)', '%Diff', 'ผล',
    'ปรับเครื่อง', 'T หลังปรับ (°C)', 'P หลังปรับ', 'M1 หลังปรับ (nC)', 'k_TP หลังปรับ', 'Output หลังปรับ (cGy/MU)',
    '%Diff หลังปรับ', 'ผลหลังปรับ', 'แหล่งข้อมูลหลัก', 'หมายเหตุ', 'หมายเหตุผู้วัด'
  ]
};

// ---------------------------------------------------------------- account

/**
 * The Gmail Google reports for the person using the app. With "Execute as: Me" this is known only for
 * nattayee (and Workspace users of the same domain); for other @gmail.com visitors it is blank.
 */
function account_() {
  try { return String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) { return ''; }
}
var EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }
/** The sign-in deployment's /exec URL (Script property LOGIN_URL); blank = sign-in button not set up. */
function loginUrl_() { return prop_('LOGIN_URL').trim(); }
/** The app deployment's /exec URL, where sign-in returns to (Script property APP_URL). */
function appUrl_() { return prop_('APP_URL').trim() || ScriptApp.getService().getUrl(); }
var BACK_RE = /^https:\/\/script\.google\.com\/(a\/[^\/]+\/)?macros\/s\/[\w-]+\/(exec|dev)$/;
var TOKEN_DAYS = 7;
var SANDBOX_ORIGIN_RE = /^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/;

/** Secret that signs login tokens; created on first use and shared by every deployment of this project. */
function secret_() {
  var props = PropertiesService.getScriptProperties(), s = props.getProperty('LOGIN_SECRET');
  if (!s) { s = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); props.setProperty('LOGIN_SECRET', s); }
  return s;
}
function signPayload_(payload) {
  return Utilities.base64EncodeWebSafe(payload) + '.' + Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secret_()));
}
function sign_(email) { return signPayload_(email + '|' + (Date.now() + TOKEN_DAYS * 86400000)); }
/** Token for an LPCH RO Workspace sign-in: carries that site's session, which is re-checked on use. */
function signLpch_(session) { return signPayload_('lpch|' + session + '|' + (Date.now() + TOKEN_DAYS * 86400000)); }

/** The signed text inside a token, or '' when it is missing or forged. */
function payload_(token) {
  var parts = String(token || '').split('.');
  if (parts.length !== 2) return '';
  var payload;
  try { payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString(); } catch (e) { return ''; }
  var sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secret_()));
  return sig === parts[1] ? payload : '';
}

/** Email inside a login token from the sign-in deployment, or '' when it is missing, forged or expired. */
function tokenUser_(token) {
  var m = payload_(token).match(/^(.+)\|(\d+)$/);
  if (!m || Number(m[2]) < Date.now() || !EMAIL_RE.test(m[1])) return '';
  return m[1].toLowerCase();
}
/** LPCH session inside an LPCH sign-in token, or ''. */
function lpchSession_(token) {
  var m = payload_(token).match(/^lpch\|([\w-]+)\|(\d+)$/);
  return m && Number(m[2]) >= Date.now() ? m[1] : '';
}

/**
 * Who is using the page: {email, via: 'google'} for nattayee or a Google sign-in token,
 * {email, name, username, role, via: 'lpch'} for an LPCH account that is still active and allowed, else null
 * (WHO_NOTICE_ then says why, e.g. a profession without access).
 */
var WHO_ = {}, WHO_NOTICE_ = '';
function who_(token) {
  var key = String(token || '');
  if (WHO_.hasOwnProperty(key)) return WHO_[key];
  var me = account_(), g = me || tokenUser_(token), out = null;
  if (g) out = { email: g, via: 'google' };
  else {
    var s = lpchSession_(token);
    if (s) {
      var p = lpchCheck_(s);
      if (p && p.email) out = { email: p.email, name: p.name, username: p.username, role: p.role, via: 'lpch' };
      else WHO_NOTICE_ = (p && p.error) || '';
    }
  }
  WHO_[key] = out;
  return out;
}
/** Verified email of the person using the page: Google's own (nattayee), a Google sign-in token or an LPCH account. */
function user_(token) { var w = who_(token); return w ? w.email : ''; }

// ---------------------------------------------------------------- LPCH RO Workspace accounts

function lpchUrl_() { return prop_('LPCH_URL').trim(); }

/** One call to the LPCH RO Workspace API (its doPost); throws its error message. */
function lpchCall_(req) {
  var url = lpchUrl_();
  if (!url) throw new Error('ยังไม่ได้เชื่อมกับ LPCH RO Workspace (ผู้ดูแล: ตั้ง Script property LPCH_URL)');
  var res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(req), muteHttpExceptions: true });
  var out = null;
  try { out = JSON.parse(res.getContentText('UTF-8')); } catch (e) { out = null; }
  if (!out) throw new Error('เชื่อมต่อ LPCH RO Workspace ไม่ได้ (HTTP ' + res.getResponseCode() + ') ผู้ดูแล: ตรวจ LPCH_URL และ Deploy แบบ Who has access: Anyone');
  if (!out.ok) throw new Error(out.error || 'LPCH RO Workspace ตอบกลับไม่สำเร็จ');
  return out;
}

/** The LPCH member as this app sees them, or {error} when they may not use it. */
function lpchProfile_(u) {
  if (!u) return { error: 'ไม่พบบัญชี LPCH RO Workspace' };
  var admin = u.isAdmin === true || String(u.isAdmin).toUpperCase() === 'TRUE';
  var roles = WEBAPP.LPCH_ROLES;
  if (!admin && roles.indexOf('*') === -1 && roles.indexOf(u.role) === -1) {
    return { error: 'บัญชี ' + u.username + ' (' + u.role + ') ไม่มีสิทธิ์ใช้แอปนี้ — ใช้ได้เฉพาะ ' + roles.join(', ') + ' และผู้ดูแลระบบ' };
  }
  var email = String(u.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.indexOf('|') !== -1) {
    return { error: 'บัญชี ' + u.username + ' ยังไม่มีอีเมล: เพิ่มอีเมลที่ "บัญชีของฉัน" ใน LPCH RO Workspace ก่อน' };
  }
  return { email: email, name: String(u.fullName || u.username), username: u.username, role: u.role };
}

/** Is this LPCH session still a member allowed here? Asks LPCH (its "me"), trusted for LPCH_CHECK_SECONDS. */
function lpchCheck_(session) {
  var cache = CacheService.getScriptCache(), key = 'lpch_' + session;
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var p;
  try { p = lpchProfile_(lpchCall_({ action: 'me', token: session }).user); }
  catch (e) {
    if (e.message !== 'session_expired') throw e;   // LPCH unreachable: say so rather than sign the person out
    p = { error: 'การเข้าสู่ระบบด้วยบัญชี LPCH หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' };
  }
  cache.put(key, JSON.stringify(p), WEBAPP.LPCH_CHECK_SECONDS);
  return p;
}

/** An LPCH sign-in ({token, user} from LPCH) becomes this app's token, or throws why it may not. */
function lpchFinish_(out) {
  var p = lpchProfile_(out.user);
  if (p.error) {
    try { lpchCall_({ action: 'logout', token: out.token }); } catch (e) { /* the session just expires */ }
    throw new Error(p.error);
  }
  CacheService.getScriptCache().put('lpch_' + out.token, JSON.stringify(p), WEBAPP.LPCH_CHECK_SECONDS);
  return { token: signLpch_(out.token), account: p.email, name: p.name };
}

/** Run as nattayee to check the sign-in settings (APP_URL, LOGIN_URL) and create the signing secret. */
function setupLogin() {
  requireOwner_();
  secret_();
  Logger.log('APP_URL   = ' + (prop_('APP_URL') || '(ยังไม่ได้ตั้ง: URL /exec ของ deployment แอป Execute as Me)'));
  Logger.log('LOGIN_URL = ' + (prop_('LOGIN_URL') || '(ยังไม่ได้ตั้ง: URL /exec ของ deployment เข้าสู่ระบบ User accessing)'));
  Logger.log('LPCH_URL  = ' + (prop_('LPCH_URL') || '(ไม่บังคับ: URL /exec ของ LPCH RO Workspace เพื่อใช้บัญชีร่วมกัน)'));
  Logger.log('ตั้งค่าที่ Project Settings → Script properties');
}
/** Creating and sharing the Output Log is only for nattayee, so it stays in nattayee's Drive. */
function requireOwner_() {
  var me = account_();
  if (me !== WEBAPP.OWNER_EMAIL) {
    throw new Error('ต้องรันด้วยบัญชี ' + WEBAPP.OWNER_EMAIL + ' (ตอนนี้คือ ' + (me || 'ไม่ทราบ') + ')');
  }
}

// ---------------------------------------------------------------- page

function doGet(e) {
  var q = (e && e.parameter) || {};
  if (q.login) return loginPage_(String(q.back || ''), !!q.embed);
  // "Who has access: Anyone with Google account" makes Google ask for a sign-in before this runs
  var html = loadPage_();
  // Back from the sign-in deployment with a token: hand it to the page, which keeps it in the browser
  var t = String((e && e.parameter && e.parameter.t) || ''), err = '';
  if (!(t && tokenUser_(t))) t = '';
  // From the "เปิดแอป" button of LPCH RO Workspace: a one-use ticket, exchanged there for a sign-in
  if (!t && q.sso) {
    try { t = lpchFinish_(lpchCall_({ action: 'ssoRedeem', ticket: String(q.sso) })).token; }
    catch (x) { err = x.message; }
  }
  if (t || err) {
    var js = function (v) { return JSON.stringify(v).replace(/</g, '\\u003c'); };
    html = injectHead_(html, '<script>' + (t ? 'window.TRS398_LOGIN_TOKEN = ' + js(t) + ';' : '') +
      (err ? 'window.TRS398_LOGIN_ERROR = ' + js(err) + ';' : '') + '</script>');
  }
  return HtmlService.createHtmlOutput(html)
    .setTitle(WEBAPP.TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** Puts a tag before the page's own scripts: the page has no <head>, so after <meta charset> (or at the top). */
function injectHead_(html, tag) {
  var m = /<head(\s[^>]*)?>|<meta charset[^>]*>/i.exec(html);
  return m ? html.slice(0, m.index + m[0].length) + tag + html.slice(m.index + m[0].length) : tag + html;
}

/**
 * Sign-in step, on the "User accessing the web app" deployment: Google gives this deployment the visitor's
 * Gmail; it goes back to the app as a signed token (?t=…), which the app verifies with the same secret.
 */
function loginPage_(back, embed) {
  var email = account_();
  if (embed) return embedLogin_(email);
  if (!back) back = appUrl_();
  // Only back to this app: its own URL when APP_URL is set
  if (!BACK_RE.test(back) || (prop_('APP_URL') && back !== prop_('APP_URL').trim())) return infoPage_('ลิงก์เข้าสู่ระบบไม่ถูกต้อง', 'กรุณาเปิดจากปุ่ม "เข้าสู่ระบบด้วย Google" ในแอป', '');
  if (!email) return infoPage_('ไม่พบบัญชี Google', 'ผู้ดูแล: LOGIN_URL ต้องเป็น deployment แบบ Execute as "User accessing the web app" และ Who has access "Anyone with Google account"', '');
  return infoPage_('เข้าสู่ระบบเป็น ' + email, 'กดปุ่มด้านล่างเพื่อกลับไปที่แอป', back + '?t=' + encodeURIComponent(sign_(email)));
}
/**
 * Hidden-frame sign-in: hands the token to the app's page only (postMessage to APP_ORIGIN, recorded when
 * nattayee opens the app), so another site that frames this URL gets nothing.
 */
function embedLogin_(email) {
  var origin = prop_('APP_ORIGIN');
  var msg = { trs398: 'login', token: email && origin ? sign_(email) : '' };
  var html = '<script>(function(){var m=' + JSON.stringify(msg).replace(/</g, '\\u003c') + ',o=' + JSON.stringify(origin) + ',w=window;' +
    'for(var i=0;i<4&&o;i++){if(w===w.parent)break;w=w.parent;try{w.postMessage(m,o);}catch(e){}}})();</script>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function infoPage_(title, text, url) {
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  return HtmlService.createHtmlOutput(
    '<div style="font:16px/1.6 system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 16px">' +
    '<h2 style="margin:0 0 8px">' + esc(title) + '</h2><p style="color:#555">' + esc(text) + '</p>' +
    (url ? '<p><a target="_top" href="' + esc(url) + '" style="display:inline-block;background:#1d5bd6;color:#fff;' +
      'padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">ไปที่ TRS-398 Output Calibration</a></p>' : '') +
    '</div>').setTitle(WEBAPP.TITLE).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** The page from GitHub, cached in ~30k-character pieces (the cache holds at most 100 KB per value). */
function loadPage_() {
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get('page_n') || 0);
  if (n) {
    var keys = [];
    for (var i = 0; i < n; i++) keys.push('page_' + i);
    var got = cache.getAll(keys);
    if (Object.keys(got).length === n) return keys.map(function (k) { return got[k]; }).join('');
  }
  var res = UrlFetchApp.fetch(WEBAPP.PAGE_URL, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('โหลดหน้าแอปจาก GitHub ไม่ได้ (HTTP ' + res.getResponseCode() + ')');
  var html = res.getContentText('UTF-8');
  var parts = {}, size = 30000;
  for (var j = 0; j * size < html.length; j++) parts['page_' + j] = html.substr(j * size, size);
  parts.page_n = String(j);
  cache.putAll(parts, WEBAPP.CACHE_SECONDS);
  return html;
}

// ---------------------------------------------------------------- Output Log in nattayee's Drive

/**
 * Run once from the editor (as nattayee). Creates "TRS-398 Output Reports / TRS-398 Output Log (LPCH)"
 * in nattayee's Drive, copies every row of the old log, and remembers the new log for the web app.
 * Running it again only reports the log already in use.
 */
function setup() {
  requireOwner_();
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('LOG_SHEET_ID');
  if (id && ownerOf_(id) === WEBAPP.OWNER_EMAIL) {
    Logger.log('ใช้ Log ของ ' + WEBAPP.OWNER_EMAIL + ' อยู่แล้ว: ' + SpreadsheetApp.openById(id).getUrl());
    return SpreadsheetApp.openById(id).getUrl();
  }
  var folders = DriveApp.getFoldersByName(WEBAPP.FOLDER_NAME), folder = null;
  while (folders.hasNext()) { var f = folders.next(); if (f.getOwner() && f.getOwner().getEmail().toLowerCase() === WEBAPP.OWNER_EMAIL) { folder = f; break; } }
  if (!folder) folder = DriveApp.createFolder(WEBAPP.FOLDER_NAME);

  var ss = SpreadsheetApp.create(WEBAPP.LOG_NAME);
  ss.setSpreadsheetTimeZone(WEBAPP.TIME_ZONE);
  DriveApp.getFileById(ss.getId()).moveTo(folder);
  var sheet = ss.getSheets()[0].setName(WEBAPP.LOG_TAB);

  var rows = null;
  try {   // the old log is shared with nattayee, so its rows can be read once
    var old = SpreadsheetApp.openById(WEBAPP.OLD_LOG_SHEET_ID).getSheetByName(WEBAPP.LOG_TAB);
    if (old && old.getLastRow() >= 1) rows = old.getDataRange().getValues();
  } catch (e) { rows = null; }
  if (!rows || String(rows[0][0]).trim() !== WEBAPP.ID_HEADER) rows = [WEBAPP.LOG_HEADERS];
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sheet.getRange(1, 1, 1, rows[0].length).setFontWeight('bold').setFontColor('#ffffff').setBackground('#1d5bd6').setWrap(true);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);

  props.setProperty('LOG_SHEET_ID', ss.getId());
  shareLog();
  Logger.log('สร้าง Log ใหม่ใน Drive ของ ' + WEBAPP.OWNER_EMAIL + ' (คัดลอก ' + (rows.length - 1) + ' แถว): ' + ss.getUrl());
  return ss.getUrl();
}

/** Run as nattayee after changing EDITORS: gives every listed Gmail edit access to the Log. */
function shareLog() {
  requireOwner_();
  var id = PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID');
  if (!id) throw new Error('ยังไม่มี Log ให้รัน setup ก่อน');
  var others = WEBAPP.EDITORS.filter(function (e) { return String(e).toLowerCase() !== WEBAPP.OWNER_EMAIL; });
  if (others.length) DriveApp.getFileById(id).addEditors(others);
  Logger.log('Log แชร์ให้แก้ไขได้: ' + (others.join(', ') || '(ไม่มีรายชื่อเพิ่ม)'));
}

function ownerOf_(fileId) {
  try { return DriveApp.getFileById(fileId).getOwner().getEmail().toLowerCase(); } catch (e) { return ''; }
}

/** The log the web app writes to: nattayee's own copy, created on first use if setup() was not run. */
function logId_() {
  var id = PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID');
  if (id) return id;
  if (account_() !== WEBAPP.OWNER_EMAIL) throw new Error('ยังไม่ได้ตั้งค่า Log: ให้ ' + WEBAPP.OWNER_EMAIL + ' รันฟังก์ชัน setup ก่อน');
  setup();
  return PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID');
}

// ---------------------------------------------------------------- calls from the page

/** Account and log in use, shown on the page. */
function apiInfo(token, pageOrigin) {
  var id = logId_();
  // nattayee opening the app records where the app's page runs, the only place sign-in tokens are posted to
  pageOrigin = String(pageOrigin || '');
  if (account_() === WEBAPP.OWNER_EMAIL && SANDBOX_ORIGIN_RE.test(pageOrigin) && prop_('APP_ORIGIN') !== pageOrigin) {
    PropertiesService.getScriptProperties().setProperty('APP_ORIGIN', pageOrigin);
  }
  var auto = loginUrl_() && prop_('APP_ORIGIN') && !account_() ? loginUrl_() + '?login=1&embed=1' : '';
  // Shown to nattayee only: what other accounts still need before they see "Signed in as …"
  var missing = account_() === WEBAPP.OWNER_EMAIL ? ['APP_URL', 'LOGIN_URL'].filter(function (k) { return !prop_(k); }) : [];
  var w = who_(token);
  return { account: w ? w.email : '', name: w && w.name || '', via: w ? w.via : '', notice: WHO_NOTICE_,
    viaToken: !account_() && !!w, lpchLogin: !!lpchUrl_(), loginUrl: loginUrl_(), autoLoginSrc: auto, setupMissing: missing,
    appUrl: appUrl_(),
    loginHref: loginUrl_() ? loginUrl_() + '?login=1&back=' + encodeURIComponent(appUrl_()) : '', owner: WEBAPP.OWNER_EMAIL, logId: id, logUrl: 'https://docs.google.com/spreadsheets/d/' + id + '/edit', masterId: WEBAPP.MASTER_SHEET_ID };
}

/** Sign in with an LPCH RO Workspace username (or email) and password: checked by LPCH, never stored here. */
function apiLpchLogin(username, password) {
  return lpchFinish_(lpchCall_({ action: 'login', username: String(username || ''), password: String(password || '') }));
}

/** Sign out: ends the LPCH session inside the token (a Google sign-in token simply stops being used). */
function apiLogout(token) {
  var s = lpchSession_(token);
  if (s) {
    CacheService.getScriptCache().remove('lpch_' + s);
    try { lpchCall_({ action: 'logout', token: s }); } catch (e) { /* the session just expires */ }
  }
  return true;
}

/** Master Sheet as .xlsx (base64); any other id is answered with nattayee's Output Log. */
function apiExportXlsx(fileId, token) {
  if (!user_(token)) throw new Error(WHO_NOTICE_ || 'กรุณาเข้าสู่ระบบก่อนใช้งาน');
  var id = fileId === WEBAPP.MASTER_SHEET_ID ? WEBAPP.MASTER_SHEET_ID : logId_();
  var title = DriveApp.getFileById(id).getName();   // also grants the Drive scope used below
  var res = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() === 403 || res.getResponseCode() === 404) {
    throw new Error('บัญชี ' + WEBAPP.OWNER_EMAIL + ' เปิดไฟล์นี้ไม่ได้ (HTTP ' + res.getResponseCode() + ') ตรวจสอบว่า Deploy เป็น Execute as: Me ด้วยบัญชี ' + WEBAPP.OWNER_EMAIL);
  }
  if (res.getResponseCode() !== 200) throw new Error('ส่งออก .xlsx ไม่สำเร็จ (HTTP ' + res.getResponseCode() + ')');
  return { content: Utilities.base64Encode(res.getBlob().getBytes()), title: title, id: id };
}

/** Appends one report (two-row CSV: headers + values) to the Log tab by header name; skips known Report IDs. */
function apiAppendReport(csvText, token) {
  var rows = Utilities.parseCsv(String(csvText || ''));
  if (rows.length < 2) throw new Error('รายงานว่างเปล่า');
  var unquote = function (v) { return typeof v === 'string' && v.charAt(0) === "'" ? v.slice(1) : v; };
  var headers = rows[0].map(function (h) { return String(unquote(h)).trim(); });
  var values = rows[1].map(unquote);
  if (headers[0] !== WEBAPP.ID_HEADER) throw new Error('รูปแบบรายงานไม่ถูกต้อง');
  // Recorder's Gmail: only the account Google verified (nattayee's own, or the sign-in token), never typed
  var u = headers.indexOf(WEBAPP.USER_HEADER);
  var w = who_(token), me = w ? w.email : '';
  if (!me) {
    throw new Error(WHO_NOTICE_ || (loginUrl_() || lpchUrl_() ? 'กรุณาเข้าสู่ระบบก่อนส่งรายงาน'
      : 'ยังเข้าสู่ระบบไม่ได้ เพราะผู้ดูแลยังไม่ได้ตั้งค่า LOGIN_URL แจ้ง ' + WEBAPP.OWNER_EMAIL));
  }
  if (u < 0) { headers.push(WEBAPP.USER_HEADER); values.push(me); } else values[u] = me;
  if (w.via === 'lpch') {   // which LPCH member, next to their email
    var who = w.name + ' (' + w.username + ', ' + w.role + ')', l = headers.indexOf(WEBAPP.LPCH_HEADER);
    if (l < 0) { headers.push(WEBAPP.LPCH_HEADER); values.push(who); } else values[l] = who;
  }

  var logId = logId_();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss;
    try { ss = SpreadsheetApp.openById(logId); }
    catch (e) { throw new Error('เปิด Log ไม่ได้: ' + e.message + ' (ตรวจสอบว่า Deploy เป็น Execute as: Me ด้วยบัญชี ' + WEBAPP.OWNER_EMAIL + ')'); }
    if (ss.getSpreadsheetTimeZone() !== WEBAPP.TIME_ZONE) {
      try { ss.setSpreadsheetTimeZone(WEBAPP.TIME_ZONE); } catch (e) { /* editors without that right keep the sheet's zone */ }
    }
    var sheet = ss.getSheetByName(WEBAPP.LOG_TAB);
    if (!sheet) throw new Error('ไม่พบแท็บ "' + WEBAPP.LOG_TAB + '" ใน Log Sheet');
    var logHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0]
      .map(function (h) { return String(h).trim(); });
    var col = {};
    logHeaders.forEach(function (h, i) { if (h) col[h] = i; });

    var id = String(values[0]), idCol = col[WEBAPP.ID_HEADER], lastRow = sheet.getLastRow();
    if (idCol != null && lastRow > 1) {
      var ids = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) === id) return { appended: false, duplicate: true, id: logId, viewUrl: ss.getUrl() };
      }
    }
    headers.forEach(function (h) {   // headers the log does not have yet go at the end
      if (h && col[h] == null) {
        logHeaders.push(h);
        col[h] = logHeaders.length - 1;
        sheet.getRange(1, logHeaders.length).setValue(h).setFontWeight('bold');
      }
    });
    var out = logHeaders.map(function () { return ''; });
    headers.forEach(function (h, j) { if (h) out[col[h]] = values[j]; });
    sheet.appendRow(out);
    var row = sheet.getLastRow();
    WEBAPP.RESULT_HEADERS.forEach(function (h) {
      if (col[h] == null) return;
      var cell = sheet.getRange(row, col[h] + 1), v = String(cell.getValue());
      var colour = /^FAIL/.test(v) ? '#fbe3e0' : /เฝ้าระวัง/.test(v) ? '#fbefd6' : /^PASS/.test(v) ? '#e1f3e8' : null;
      if (colour) cell.setBackground(colour);
    });
    return { appended: true, row: row, id: logId, viewUrl: ss.getUrl() };
  } finally {
    lock.releaseLock();
  }
}

// ----- สิ้นสุดไฟล์ WebApp.gs (TRS-398 + บัญชี LPCH RO Workspace) ถ้าไม่เห็นบรรทัดนี้ใน Apps Script แสดงว่าวางโค้ดมาไม่ครบ -----
