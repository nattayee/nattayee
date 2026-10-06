/**
 * TRS-398 Login — a second, tiny Apps Script project that only tells the main web app who signed in.
 *
 * The main app runs "Execute as: Me", where Google does not pass the visitor's Gmail to the script.
 * This project runs as the visitor instead and asks for nothing but their email address. It signs the
 * address with a secret shared with the main project and sends the visitor back with that token.
 *
 *   1. In the MAIN project run setupLogin() and copy the LOGIN_SECRET it prints.
 *   2. Create a NEW Apps Script project (as nattayee@gmail.com), paste this file as Code.gs and save.
 *      Project Settings → Script properties → add  LOGIN_SECRET = (the value from step 1).
 *   3. Deploy → New deployment → Web app
 *      Execute as: "User accessing the web app"   Who has access: "Anyone with Google account"
 *   4. In the MAIN project: Project Settings → Script properties → add  LOGIN_URL = (this web app's /exec URL).
 */
var LOGIN = {
  TITLE: 'เข้าสู่ระบบ · TRS-398 Output Calibration',
  TOKEN_DAYS: 30,
  // Only send tokens back to an Apps Script web app
  BACK_RE: /^https:\/\/script\.google\.com\/(a\/[^\/]+\/)?macros\/s\/[\w-]+\/(exec|dev)$/
};

function doGet(e) {
  var back = String((e && e.parameter && e.parameter.back) || '');
  var secret = PropertiesService.getScriptProperties().getProperty('LOGIN_SECRET');
  var email = '';
  try { email = String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (err) { email = ''; }

  if (!LOGIN.BACK_RE.test(back)) return page_('ลิงก์เข้าสู่ระบบไม่ถูกต้อง', 'กรุณาเปิดจากปุ่ม "เข้าสู่ระบบด้วย Google" ในแอป TRS-398', '');
  if (!secret) return page_('ยังตั้งค่าไม่ครบ', 'ผู้ดูแล: เพิ่ม Script property ชื่อ LOGIN_SECRET ในโปรเจกต์ Login (ค่าจาก setupLogin ของโปรเจกต์หลัก)', '');
  if (!email) return page_('ไม่พบบัญชี Google', 'ผู้ดูแล: Deploy โปรเจกต์ Login แบบ Execute as "User accessing the web app" และ Who has access "Anyone with Google account"', '');

  var payload = email + '|' + (Date.now() + LOGIN.TOKEN_DAYS * 86400000);
  var token = Utilities.base64EncodeWebSafe(payload) + '.' +
    Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secret));
  var url = back + '?t=' + encodeURIComponent(token);
  return page_('เข้าสู่ระบบเป็น ' + email, 'กดปุ่มด้านล่างเพื่อกลับไปที่แอป', url);
}

function page_(title, text, url) {
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var html = '<div style="font:16px/1.6 system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 16px">' +
    '<h2 style="margin:0 0 8px">' + esc(title) + '</h2><p style="color:#555">' + esc(text) + '</p>' +
    (url ? '<p><a id="go" target="_top" href="' + esc(url) + '" style="display:inline-block;background:#1a56db;color:#fff;' +
      'padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">ไปที่ TRS-398 Output Calibration</a></p>' : '') +
    '</div>';
  return HtmlService.createHtmlOutput(html).setTitle(LOGIN.TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
