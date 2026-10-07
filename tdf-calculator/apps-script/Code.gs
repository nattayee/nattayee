/**
 * TDF Dose Calculator — Google Apps Script web app with login through an existing login web app.
 *
 * Files in this project:
 *   Code.gs     this file (server side)
 *   Index.html  the calculator page (shown after login)
 *   Login.html  the "please sign in" page
 *   Tdf.html    the calculation library (TDF formulas), pulled in by include('Tdf')
 *
 * Login flow:
 *   1. No valid token  → Login.html with a button to LOGIN_URL?app=tdf
 *   2. The login project checks the password, then sends the browser to this app's URL with ?token=…
 *   3. doGet verifies the token by POSTing { action: 'tdfVerify', token } to LOGIN_URL
 *      (see login-bridge/TdfBridge.gs, which goes into the login project)
 *
 * Deploy: Deploy → New deployment → Web app (Execute as: Me).
 * Open a tab directly with &tab=frac | gap | brachy | ref
 */
var LOGIN_URL = 'https://script.google.com/macros/s/AKfycbwVlM9oxgSQMjjvc3mi39aGbIH4vEkaaUpSNWs4dd9oJHotjpfcyJMVBi5XcUFSAAM2/exec';

function doGet(e) {
  var token = (e && e.parameter && e.parameter.token) || '';
  var user = token ? verifyToken_(token) : null;

  if (!user) {
    var gate = HtmlService.createTemplateFromFile('Login');
    gate.loginUrl = LOGIN_URL + '?app=tdf';
    gate.expired = Boolean(token);
    return page_(gate.evaluate());
  }

  var app = HtmlService.createTemplateFromFile('Index');
  app.userName = user.name || user.username || '';
  app.token = token;
  app.loginUrl = LOGIN_URL + '?app=tdf';
  return page_(app.evaluate());
}

function page_(output) {
  return output
    .setTitle('TDF Dose Calculator')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Asks the login web app who owns this token. Returns { username, name } or null. */
function verifyToken_(token) {
  try {
    var res = UrlFetchApp.fetch(LOGIN_URL, {
      method: 'post',
      payload: { action: 'tdfVerify', token: token },
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) return null;
    var body = JSON.parse(res.getContentText());
    return body && body.ok ? body.user || {} : null;
  } catch (err) {
    console.error('Token check failed: ' + err);
    return null;
  }
}

/** Called from the page's sign-out button; tells the login app to forget the token. */
function logout(token) {
  try {
    UrlFetchApp.fetch(LOGIN_URL, {
      method: 'post',
      payload: { action: 'tdfLogout', token: String(token || '') },
      muteHttpExceptions: true,
    });
  } catch (err) {
    console.error('Logout failed: ' + err);
  }
  return LOGIN_URL + '?app=tdf';
}

/** Inserts the contents of another HTML file in the project (used for Tdf.html). */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
