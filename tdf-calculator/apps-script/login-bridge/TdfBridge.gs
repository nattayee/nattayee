/**
 * TdfBridge.gs — add this file to the EXISTING LOGIN project (not the TDF project).
 *
 * It lets the login web app hand a signed-in user over to the TDF Dose Calculator:
 *   - createTdfRedirect_(user)  call after your own password check succeeds; returns the URL to open
 *   - handleTdfBridge_(e)       answers the TDF app's token checks (call it from doPost)
 *
 * Requirements:
 *   - The login web app deployment must allow "Anyone" access, so the TDF server can reach it.
 *   - Set TDF_APP_URL to the TDF web app's /exec URL after you deploy it.
 *
 * Wiring (2 places in the login project):
 *
 * 1) doPost — if the login project has no doPost yet, add:
 *
 *      function doPost(e) {
 *        return handleTdfBridge_(e);
 *      }
 *
 *    If it already has one, put this as the first line inside it:
 *
 *      var bridged = handleTdfBridge_(e); if (bridged) return bridged;
 *
 * 2) The server function your login form calls (via google.script.run). After the password is correct:
 *
 *      return { ok: true, ...yourExistingFields, tdfUrl: createTdfRedirect_({ username: username, name: displayName }) };
 *
 *    and in the page's success handler (client side):
 *
 *      google.script.url.getLocation(function (loc) {
 *        if (loc.parameter.app === 'tdf' && result.tdfUrl) window.top.location.href = result.tdfUrl;
 *        else { ...what the page did before... }
 *      });
 */
var TDF_APP_URL = 'PASTE_TDF_WEB_APP_EXEC_URL_HERE';
var TDF_TOKEN_SECONDS = 6 * 60 * 60; // CacheService maximum (6 h)

/** Issues a one-session token for `user` and returns the TDF URL that carries it. Server-side only. */
function createTdfRedirect_(user) {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var info = { username: String(user.username || ''), name: String(user.name || user.username || '') };
  CacheService.getScriptCache().put('tdf:' + token, JSON.stringify(info), TDF_TOKEN_SECONDS);
  return TDF_APP_URL + '?token=' + token;
}

/** Handles tdfVerify / tdfLogout POSTs from the TDF app. Returns null for any other request. */
function handleTdfBridge_(e) {
  var p = (e && e.parameter) || {};
  if (p.action !== 'tdfVerify' && p.action !== 'tdfLogout') return null;

  var key = 'tdf:' + String(p.token || '');
  var cache = CacheService.getScriptCache();
  var body;
  if (p.action === 'tdfLogout') {
    cache.remove(key);
    body = { ok: true };
  } else {
    var raw = p.token ? cache.get(key) : null;
    body = raw ? { ok: true, user: JSON.parse(raw) } : { ok: false };
  }
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
