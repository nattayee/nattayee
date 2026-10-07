/**
 * TDF Dose Calculator — Google Apps Script web app, signed in with LPCH RO Workspace accounts.
 *
 * Files in this project:
 *   Code.gs     this file (server side)
 *   Index.html  the page (sign-in screen + calculator)
 *   Tdf.html    the calculation library (TDF formulas), pulled in by include('Tdf')
 *
 * Sign-in uses the Workspace web app's own JSON API (doPost there), so the Workspace project needs no changes:
 *   - From the Workspace: a Home button / menu card with this app's /exec URL and "เข้าสู่ระบบอัตโนมัติ" (sso) on
 *     opens  …/exec?sso=<ticket>  →  ssoRedeem  →  Workspace session token
 *   - Directly: username (or email) + password  →  login
 *   - Next visits: the saved token is checked with  me ; sign-out calls  logout
 *
 * Deploy: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
 * The Workspace web app must also be deployed with Who has access: Anyone.
 * Open a tab directly with ?tab=frac | gap | brachy | ref
 */
var WORKSPACE_URL = 'https://script.google.com/macros/s/AKfycbwVlM9oxgSQMjjvc3mi39aGbIH4vEkaaUpSNWs4dd9oJHotjpfcyJMVBi5XcUFSAAM2/exec';

function doGet() {
  var page = HtmlService.createTemplateFromFile('Index');
  page.workspaceUrl = WORKSPACE_URL;
  return page.evaluate()
    .setTitle('TDF Dose Calculator')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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
  return true;
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

/** Inserts the contents of another HTML file in the project (used for Tdf.html). */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
