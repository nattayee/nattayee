// Code2.gs — ส่วนที่ 2/10 ของ LPCH RO Workspace (วางทุกไฟล์ Code1–Code10 ให้ครบ)

/** Index.html from GitHub, cached in ~30k-character pieces (the cache holds at most 100 KB per value). */
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
  var parts = {}, size = 30000, j;
  for (j = 0; j * size < html.length; j++) parts['page_' + j] = html.substr(j * size, size);
  parts.page_n = String(j);
  cache.putAll(parts, PAGE_CACHE_SECONDS);
  return html;
}

/** Called from the page with google.script.run.api(req). */
function api(req) {
  return handle_(req || {});
}

/** JSON API for a static copy of the site hosted elsewhere (auth.apiUrl in data.js). */
function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'คำขอไม่ถูกต้อง' });
  }
  return json_(handle_(req));
}

function handle_(req) {
  var fn = ACTIONS[req.action];
  if (!fn) return { ok: false, error: 'ไม่รู้จักคำสั่ง ' + req.action };
  var lock = READ_ONLY[req.action] ? null : LockService.getScriptLock();
  try {
    if (lock) lock.waitLock(20000);
    var out = fn(req) || {};
    out.ok = true;
    // google.script.run only carries plain values (no Date objects)
    return JSON.parse(JSON.stringify(out));
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    if (lock) lock.releaseLock();
  }
}

/** Run once from the editor: creates the sheets and image folder and asks for permissions. */
function setup() {
  var ss = ss_();
  ss.setSpreadsheetTimeZone(TIME_ZONE);
  sheet_('Users', USER_HEADERS);
  sheet_('Sessions', SESSION_HEADERS);
  sheet_('Messages', MESSAGE_HEADERS);
  sheet_('ChatLog', LOG_HEADERS);
  folder_();
  Logger.log('ส่งอีเมลได้อีกวันนี้: ' + MailApp.getRemainingDailyQuota() + ' ฉบับ');
  Logger.log('หน้าเว็บ: ' + Math.round(page_().length / 1024) + ' KB');
  Logger.log('พร้อมใช้งาน: ' + ss.getUrl());
  Logger.log('ขั้นต่อไป: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone)');
}

/* ---------------- Actions ---------------- */

// Every file of a split copy starts with this line, so the files can load in any order.
var ACTIONS = ACTIONS || {};

/* ----- members ----- */

// ----- จบ Code2.gs (ถ้าไม่เห็นบรรทัดนี้ แสดงว่าวางไฟล์นี้มาไม่ครบ) -----
