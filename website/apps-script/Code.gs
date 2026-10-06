/**
 * LPCH RO Workspace — Google Apps Script web app (Code.gs)
 *
 * โปรเจกต์ Apps Script ต้องการไฟล์นี้ไฟล์เดียว (Code.gs)
 * หน้าเว็บ (Index.html) โหลดจาก GitHub อัตโนมัติ (PAGE_URL) จึงได้หน้าเว็บเวอร์ชันล่าสุดโดยไม่ต้องวางใหม่
 * ถ้าต้องการใช้ไฟล์ในโปรเจกต์แทน: กด + → HTML → ตั้งชื่อ "Index" แล้ววางเนื้อหา Index.html (จะใช้ไฟล์นั้นก่อน)
 *
 * วิธีติดตั้ง:
 *   1. สร้าง Google Sheet ใหม่ → Extensions → Apps Script
 *   2. วางโค้ดนี้แทนโค้ดเดิมทั้งหมด → Save (ตรวจว่าบรรทัดสุดท้ายของไฟล์ถูกวางมาครบ)
 *   3. เลือกฟังก์ชัน setup แล้วกด Run หนึ่งครั้ง (อนุญาตสิทธิ์ Sheets + Drive + ส่งอีเมล + เชื่อมต่อภายนอก)
 *   4. Deploy → New deployment → Web app
 *        Execute as: Me   |   Who has access: Anyone
 *   5. เปิด Web app URL (.../exec) แล้วสมัครบัญชีแรก (จะได้เป็น admin)
 *
 * ข้อมูลเก็บใน Google Sheet นี้: Users, Sessions, Messages, ChatLog, DirectMessages (ข้อความส่วนตัว)
 * รูปที่แนบในแชทเก็บในโฟลเดอร์ Drive "LPCH RO Workspace Images" (ไม่แชร์สาธารณะ)
 *
 * เว็บแบบ static (GitHub Pages ฯลฯ) ใช้เซิร์ฟเวอร์นี้ได้เช่นกัน: ใส่ URL /exec ที่ auth.apiUrl ใน data.js
 */

var REQUIRE_APPROVAL = true;   // ผู้สมัครใหม่ต้องรอ admin อนุมัติ
var SESSION_DAYS = 7;
var ROLES = ['RO', 'MP', 'RTT', 'Nurse', 'Other'];
var CHAT_ROLES = ['RO', 'MP', 'RTT', 'Nurse'];
var MAX_FAILED_LOGINS = 5;     // ต่อ 15 นาที
var RESET_MINUTES = 15;        // อายุรหัสรีเซ็ตรหัสผ่านที่ส่งทางอีเมล
var RESET_MAX_TRIES = 5;       // ใส่รหัสรีเซ็ตผิดได้กี่ครั้ง
var RESET_REQUESTS = 3;        // ขอรหัสได้กี่ครั้งต่อ 15 นาที ต่อบัญชี
var EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
var HASH_ROUNDS = 200;
var TIME_ZONE = 'Asia/Bangkok';
var CHAT_LIMIT = 200;          // จำนวนข้อความล่าสุดที่ส่งให้หน้าเว็บ
var MAX_IMAGES = 4;
var MAX_IMAGE_CHARS = 1500000; // ~1.1 MB ต่อรูป (หลังย่อขนาดในเบราว์เซอร์แล้ว)
var TITLE = 'LPCH RO Workspace';
var IMAGE_FOLDER = 'LPCH RO Workspace Images';
var DM_FOLDER = 'LPCH RO Workspace Private Images';  // รูปในข้อความส่วนตัว (แยกจากแชทประกาศ)
var DM_LIMIT = 300;            // จำนวนข้อความล่าสุดต่อบทสนทนาที่ส่งให้หน้าเว็บ
// หน้าเว็บที่สร้างจาก website/ (build_apps_script.py) — โหลดจาก GitHub และ cache ไว้ 10 นาที
var PAGE_URL = 'https://raw.githubusercontent.com/nattayee/nattayee/refs/heads/claude/lpch-ro-workspace-website-96j4r6/website/apps-script/Index.html';
var PAGE_CACHE_SECONDS = 600;

var USER_HEADERS = ['username', 'fullName', 'role', 'phone', 'email', 'salt', 'hash', 'status', 'isAdmin', 'createdAt', 'lastLogin'];
var SESSION_HEADERS = ['token', 'username', 'expiresAt'];
var MESSAGE_HEADERS = ['id', 'createdAt', 'author', 'json'];
var DM_HEADERS = ['id', 'convo', 'createdAt', 'json'];
var LOG_HEADERS = ['วันที่เวลา', 'การกระทำ', 'ผู้กระทำ', 'ตำแหน่ง', 'Username', 'รายละเอียด', 'Message ID', 'ข้อความ'];

// Actions that only read data and can skip the script lock.
var READ_ONLY = { me: 1, directory: 1, listUsers: 1, chatList: 1, chatImage: 1, dmList: 1, dmThread: 1, dmImage: 1, notify: 1 };

/* ---------------- Entry points ---------------- */

function doGet() {
  return HtmlService.createHtmlOutput(page_())
    .setTitle(TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/**
 * The page: an "Index" (or "index") HTML file in this project if it is complete, otherwise the copy on GitHub.
 * A file pasted only in part (no closing </html>) is ignored, so a truncated paste cannot break the site.
 */
function page_() {
  var names = ['Index', 'index'];
  for (var i = 0; i < names.length; i++) {
    try {
      var html = HtmlService.createHtmlOutputFromFile(names[i]).getContent();
      if (/<\/html>\s*$/i.test(html)) return html;
    } catch (e) { /* no such file */ }
  }
  return loadPage_();
}

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
  sheet_('DirectMessages', DM_HEADERS);
  folder_();
  folder_('DM_FOLDER_ID', DM_FOLDER);
  Logger.log('ส่งอีเมลได้อีกวันนี้: ' + MailApp.getRemainingDailyQuota() + ' ฉบับ');
  Logger.log('หน้าเว็บ: ' + Math.round(page_().length / 1024) + ' KB');
  Logger.log('พร้อมใช้งาน: ' + ss.getUrl());
  Logger.log('ขั้นต่อไป: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone)');
}

/* ---------------- Actions ---------------- */

// Server actions called from the page: ACTIONS.<name>(req)
var ACTIONS = {};

/* ----- members ----- */

ACTIONS.register = function (req) {
  var username = normUsername_(req.username);
  var fullName = String(req.fullName || '').trim();
  var role = String(req.role || '');
  var email = normEmail_(req.email);
  validatePassword_(req.password);
  if (!fullName) throw new Error('กรุณากรอกชื่อ-นามสกุล');
  if (fullName.length > 80) throw new Error('ชื่อยาวเกินไป');
  if (ROLES.indexOf(role) === -1) throw new Error('กรุณาเลือกตำแหน่ง');
  if (findUser_(username)) throw new Error('ชื่อผู้ใช้นี้ถูกใช้แล้ว');
  if (emailTaken_(email)) throw new Error('อีเมลนี้ถูกใช้สมัครแล้ว');

  var sheet = sheet_('Users', USER_HEADERS);
  var first = sheet.getLastRow() < 2;
  var status = first || !REQUIRE_APPROVAL ? 'active' : 'pending';
  var salt = Utilities.getUuid();
  sheet.appendRow([
    username, fullName, role,
    String(req.phone || '').trim(), email,
    salt, hash_(req.password, salt), status, first, new Date(), ''
  ]);

  if (status === 'pending') {
    return { status: status, message: 'สมัครสมาชิกสำเร็จ กรุณารอผู้ดูแลระบบอนุมัติก่อนเข้าใช้งาน' };
  }
  var u = findUser_(username);
  return { status: status, token: createSession_(username), user: publicUser_(u) };
};

ACTIONS.login = function (req) {
  var username = String(req.username || '').trim().toLowerCase();
  var cache = CacheService.getScriptCache();
  var failKey = 'fail_' + username;
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_FAILED_LOGINS) throw new Error('เข้าสู่ระบบผิดหลายครั้ง กรุณารอ 15 นาที');

  var u = findUser_(username);
  if (!u || hash_(req.password || '', u.salt) !== u.hash) {
    cache.put(failKey, String(fails + 1), 900);
    throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }
  if (u.status === 'pending') throw new Error('บัญชีของคุณรอการอนุมัติจากผู้ดูแลระบบ');
  if (u.status !== 'active') throw new Error('บัญชีของคุณถูกระงับการใช้งาน');

  cache.remove(failKey);
  setUserField_(u, 'lastLogin', new Date());
  purgeSessions_();
  return { token: createSession_(username), user: publicUser_(u) };
};

ACTIONS.me = function (req) {
  return { user: publicUser_(requireUser_(req.token)) };
};

ACTIONS.logout = function (req) {
  var sheet = sheet_('Sessions', SESSION_HEADERS);
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0] === req.token) sheet.deleteRow(i + 1);
  }
  return {};
};

ACTIONS.changePassword = function (req) {
  var u = requireUser_(req.token);
  if (hash_(req.oldPassword || '', u.salt) !== u.hash) throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
  validatePassword_(req.newPassword);
  var salt = Utilities.getUuid();
  setUserField_(u, 'salt', salt);
  setUserField_(u, 'hash', hash_(req.newPassword, salt));
  return { message: 'เปลี่ยนรหัสผ่านเรียบร้อย' };
};

// แก้ไขอีเมลและเบอร์โทรของตัวเอง
ACTIONS.updateProfile = function (req) {
  var u = requireUser_(req.token);
  var email = normEmail_(req.email);
  if (emailTaken_(email, u.username)) throw new Error('อีเมลนี้ถูกใช้กับบัญชีอื่นแล้ว');
  setUserField_(u, 'email', email);
  setUserField_(u, 'phone', String(req.phone || '').trim().slice(0, 40));
  return { user: publicUser_(findUser_(u.username)), message: 'บันทึกข้อมูลเรียบร้อย' };
};

// ลืมรหัสผ่าน: ส่งรหัส 6 หลักไปที่อีเมลของบัญชี (ตอบข้อความเดียวกันเสมอ เพื่อไม่บอกว่ามีบัญชีหรือไม่)
ACTIONS.forgotPassword = function (req) {
  var login = String(req.login || '').trim().toLowerCase();
  if (!login) throw new Error('กรุณากรอกชื่อผู้ใช้หรืออีเมล');
  var cache = CacheService.getScriptCache();
  var u = findUserByLogin_(login);
  var limitKey = 'forgot_' + (u ? u.username : login);
  var count = Number(cache.get(limitKey) || 0);
  if (count >= RESET_REQUESTS) throw new Error('ขอรหัสบ่อยเกินไป กรุณารอ 15 นาทีแล้วลองใหม่');
  cache.put(limitKey, String(count + 1), 900);

  if (u && u.email && u.status !== 'disabled') {
    var code = resetCode_();
    cache.put('reset_' + u.username, JSON.stringify({
      hash: hash_(code, u.username), tries: 0, expires: Date.now() + RESET_MINUTES * 60000
    }), RESET_MINUTES * 60);
    sendResetEmail_(u, code);
  }
  return { message: 'ถ้าข้อมูลตรงกับบัญชีในระบบ ระบบได้ส่งรหัส 6 หลักไปที่อีเมลที่ลงทะเบียนไว้แล้ว ' +
    '(หมดอายุใน ' + RESET_MINUTES + ' นาที) หากไม่ได้รับ ตรวจสอบโฟลเดอร์สแปม หรือติดต่อผู้ดูแลระบบ' };
};

ACTIONS.resetPassword = function (req) {
  var u = findUserByLogin_(String(req.login || '').trim().toLowerCase());
  var cache = CacheService.getScriptCache();
  var key = u ? 'reset_' + u.username : '';
  var entry = key ? JSON.parse(cache.get(key) || 'null') : null;
  if (!entry || entry.expires < Date.now()) throw new Error('รหัสหมดอายุหรือไม่ถูกต้อง กรุณาขอรหัสใหม่');
  if (hash_(String(req.code || '').replace(/\s/g, ''), u.username) !== entry.hash) {
    entry.tries++;
    if (entry.tries >= RESET_MAX_TRIES) cache.remove(key);
    else cache.put(key, JSON.stringify(entry), Math.max(1, Math.round((entry.expires - Date.now()) / 1000)));
    throw new Error(entry.tries >= RESET_MAX_TRIES ? 'ใส่รหัสผิดหลายครั้ง กรุณาขอรหัสใหม่' : 'รหัสไม่ถูกต้อง');
  }
  validatePassword_(req.newPassword);
  var salt = Utilities.getUuid();
  setUserField_(u, 'salt', salt);
  setUserField_(u, 'hash', hash_(req.newPassword, salt));
  cache.remove(key);
  cache.remove('fail_' + u.username);
  dropSessionsOf_(u.username);
  return { username: u.username, message: 'ตั้งรหัสผ่านใหม่เรียบร้อย กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่' };
};

// รายชื่อสมาชิกที่ใช้งานอยู่ (สำหรับเลือกผู้รับข้อความรายบุคคล) — ส่งเฉพาะชื่อและตำแหน่ง
ACTIONS.directory = function (req) {
  requireUser_(req.token);
  return {
    users: allUsers_().filter(function (u) { return u.status === 'active'; }).map(function (u) {
      return { username: u.username, fullName: u.fullName, role: u.role };
    })
  };
};

ACTIONS.listUsers = function (req) {
  requireAdmin_(req.token);
  return { users: allUsers_().map(publicUser_) };
};

ACTIONS.updateUser = function (req) {
  var admin = requireAdmin_(req.token);
  var u = findUser_(String(req.username || '').toLowerCase());
  if (!u) throw new Error('ไม่พบผู้ใช้');
  if (u.username === admin.username && (req.isAdmin === false || (req.status && req.status !== 'active'))) {
    throw new Error('ไม่สามารถยกเลิกสิทธิ์หรือระงับบัญชีของตัวเองได้');
  }
  if (req.status) {
    if (['active', 'pending', 'disabled'].indexOf(req.status) === -1) throw new Error('สถานะไม่ถูกต้อง');
    setUserField_(u, 'status', req.status);
    if (req.status !== 'active') dropSessionsOf_(u.username);
  }
  if (typeof req.isAdmin === 'boolean') setUserField_(u, 'isAdmin', req.isAdmin);
  if (req.role) {
    if (ROLES.indexOf(req.role) === -1) throw new Error('ตำแหน่งไม่ถูกต้อง');
    setUserField_(u, 'role', req.role);
  }
  return { user: publicUser_(findUser_(u.username)) };
};

ACTIONS.deleteUser = function (req) {
  var admin = requireAdmin_(req.token);
  var u = findUser_(String(req.username || '').toLowerCase());
  if (!u) throw new Error('ไม่พบผู้ใช้');
  if (u.username === admin.username) throw new Error('ไม่สามารถลบบัญชีของตัวเองได้');
  sheet_('Users', USER_HEADERS).deleteRow(u._row);
  dropSessionsOf_(u.username);
  return {};
};

/* ----- announcement chat (identity always comes from the session, never from the page) ----- */

ACTIONS.chatList = function (req) {
  requireUser_(req.token);
  var rows = sheet_('Messages', MESSAGE_HEADERS).getDataRange().getValues().slice(1);
  rows.sort(function (a, b) { return Number(a[1]) - Number(b[1]); });
  return { messages: rows.slice(-CHAT_LIMIT).map(function (r) { return JSON.parse(r[3]); }) };
};

ACTIONS.chatAdd = function (req) {
  var u = requireUser_(req.token);
  var me = person_(u);
  var text = String(req.text || '').trim();
  var images = Array.isArray(req.images) ? req.images : [];
  if (!text && !images.length) throw new Error('พิมพ์ข้อความหรือแนบรูปก่อนส่ง');
  if (text.length > 5000) throw new Error('ข้อความยาวเกิน 5,000 ตัวอักษร');
  if (images.length > MAX_IMAGES) throw new Error('แนบรูปได้สูงสุด ' + MAX_IMAGES + ' รูปต่อข้อความ');
  var targets = cleanTargets_(req.to);
  if (!targets.to.length) targets = cleanTargets_(['ALL']);

  var id = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  var now = Date.now();
  var msg = {
    id: id,
    author: me,
    text: text,
    images: images.map(function (d, i) { return 'drive:' + saveImage_(d, id + '-' + (i + 1)); }),
    to: targets.to,
    toNames: targets.names,
    forwards: [],
    reads: {},
    reactions: {},
    reactionLog: [],
    createdAt: now
  };
  msg.reads[key_(me)] = stamp_(me);
  if (req.replyTo && req.replyTo.id) {
    var orig = findMessage_(String(req.replyTo.id));
    if (orig) {
      msg.replyTo = { id: orig.msg.id, name: orig.msg.author.name, role: orig.msg.author.role,
        username: orig.msg.author.username || '', text: snippet_(orig.msg.text, 120) ||
          (orig.msg.images.length ? '(รูปภาพ ' + orig.msg.images.length + ' รูป)' : '') };
    }
  }
  sheet_('Messages', MESSAGE_HEADERS).appendRow([id, now, u.username, JSON.stringify(msg)]);
  log_(msg.replyTo ? 'ตอบกลับ' : 'ส่งข้อความ', me,
    'ถึง ' + labels_(msg).join(', ') + (msg.replyTo ? ' · ตอบ ' + msg.replyTo.name + ': ' + msg.replyTo.text : '') +
    (images.length ? ' · รูป ' + images.length : ''), msg);
  return { message: msg };
};

ACTIONS.chatRead = function (req) {
  var u = requireUser_(req.token), me = person_(u);
  return updateMessage_(req.id, function (msg) {
    if (msg.reads[key_(me)] || !isForUser_(msg, u)) return false;
    msg.reads[key_(me)] = stamp_(me);
    log_('อ่าน', me, '', msg);
  });
};

ACTIONS.chatReact = function (req) {
  var u = requireUser_(req.token), me = person_(u);
  var type = req.type === 'ok' || req.type === 'no' ? req.type : null;
  if (!type) throw new Error('ปุ่มไม่ถูกต้อง');
  return updateMessage_(req.id, function (msg) {
    // Only someone the message was sent to may answer it; the sender cannot.
    if (!isForUser_(msg, u) || msg.author.username === u.username) throw new Error('กด ✓/✗ ได้เฉพาะผู้ที่ได้รับข้อความนี้');
    var cur = msg.reactions[key_(me)];
    if (cur && cur.type === type) return false;
    var rec = stamp_(me);
    rec.type = type;
    msg.reactions[key_(me)] = rec;
    msg.reactionLog.push(rec);
    log_(type === 'ok' ? '✓ ถูก' : '✗ ผิด', me, cur ? 'เปลี่ยนจาก ' + (cur.type === 'ok' ? '✓ ถูก' : '✗ ผิด') : '', msg);
  });
};

ACTIONS.chatForward = function (req) {
  var u = requireUser_(req.token), me = person_(u);
  var targets = cleanTargets_(req.to);
  if (!targets.to.length) throw new Error('เลือกผู้รับก่อนส่งต่อ');
  return updateMessage_(req.id, function (msg) {
    targets.to.forEach(function (t) { if (msg.to.indexOf(t) === -1) msg.to.push(t); });
    for (var k in targets.names) msg.toNames[k] = targets.names[k];
    var entry = person_(u);
    msg.forwards.push({ by: entry, to: targets.to, at: Date.now() });
    log_('ส่งต่อ', me, 'ให้ ' + targets.to.map(function (t) { return label_(msg, t); }).join(', '), msg);
  });
};

ACTIONS.chatDelete = function (req) {
  var u = requireUser_(req.token);
  var found = findMessage_(String(req.id || ''));
  if (!found) return {};
  if (!u.isAdmin) throw new Error('ลบข้อความได้เฉพาะผู้ดูแลระบบ (admin)');
  found.msg.images.forEach(function (ref) {
    try { DriveApp.getFileById(String(ref).replace(/^drive:/, '')).setTrashed(true); } catch (e) { /* already gone */ }
  });
  sheet_('Messages', MESSAGE_HEADERS).deleteRow(found.row);
  log_('ลบข้อความ', person_(u), '', found.msg);
  return { deleted: found.msg.id };
};

// รูปแนบ: ส่งเป็น data URL ให้เฉพาะผู้ที่เข้าสู่ระบบ และเฉพาะไฟล์ในโฟลเดอร์รูปของแชทนี้
ACTIONS.chatImage = function (req) {
  requireUser_(req.token);
  var file;
  try { file = DriveApp.getFileById(String(req.fileId || '')); } catch (e) { throw new Error('ไม่พบรูป'); }
  var folderId = folder_().getId(), parents = file.getParents(), ok = false;
  while (parents.hasNext()) { if (parents.next().getId() === folderId) { ok = true; break; } }
  if (!ok) throw new Error('ไม่พบรูป');
  var blob = file.getBlob();
  return { dataUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) };
};

/* ----- pop-up notifications ----- */

/**
 * New messages for the signed-in member since `since` (server time, ms): announcements addressed to them
 * (everyone, their profession, them personally, or forwarded to them) that they have not read, and unread
 * private messages. Also returns the unread totals and the server time to pass as `since` next time.
 */
ACTIONS.notify = function (req) {
  var u = requireUser_(req.token), me = person_(u), since = Number(req.since) || 0;
  var chat = [], chatUnread = 0, dm = [], dmUnread = 0;

  sheet_('Messages', MESSAGE_HEADERS).getDataRange().getValues().slice(1).forEach(function (r) {
    var m = JSON.parse(r[3]);
    m.to = m.to || []; m.reads = m.reads || {}; m.forwards = m.forwards || []; m.images = m.images || []; m.toNames = m.toNames || {};
    if (m.author.username === u.username || !isForUser_(m, u) || m.reads[key_(me)]) return;
    chatUnread++;
    var fwd = m.forwards.filter(function (f) {
      return f.at > since && (f.to.indexOf('ALL') !== -1 || f.to.indexOf(u.role) !== -1 || f.to.indexOf('u:' + u.username) !== -1);
    }).pop();
    if (m.createdAt > since || fwd) {
      chat.push({ id: m.id, from: m.author, text: snippet_(m.text, 140), images: m.images.length,
        personal: m.to.indexOf('u:' + u.username) !== -1, forwardedBy: fwd ? fwd.by : null,
        createdAt: fwd ? fwd.at : m.createdAt });
    }
  });

  dmRows_(u.username).forEach(function (r) {
    var m = r.msg;
    if (m.to.username !== u.username || m.readAt) return;
    dmUnread++;
    if (m.createdAt > since) dm.push({ id: m.id, from: m.from, text: snippet_(m.text, 140), images: m.images.length, createdAt: m.createdAt });
  });

  var byTime = function (a, b) { return a.createdAt - b.createdAt; };
  return { now: Date.now(), chat: chat.sort(byTime).slice(-10), chatUnread: chatUnread, dm: dm.sort(byTime).slice(-10), dmUnread: dmUnread };
};

/* ----- private messages: only the sender and the recipient can read a conversation (admins too) ----- */

/** Conversations of the signed-in member, newest first, with unread counts. */
ACTIONS.dmList = function (req) {
  var u = requireUser_(req.token);
  var users = usersByName_(), convos = {}, unread = 0;
  dmRows_(u.username).forEach(function (r) {
    var m = r.msg, p = dmPartner_(m, u.username);
    var c = convos[p.username] || (convos[p.username] = { partner: dmPerson_(p, users), last: null, unread: 0 });
    if (!c.last || m.createdAt > c.last.createdAt) {
      c.last = { text: snippet_(m.text, 80) || (m.images.length ? '(รูปภาพ)' : ''), createdAt: m.createdAt,
        fromMe: m.from.username === u.username };
    }
    if (m.to.username === u.username && !m.readAt) { c.unread++; unread++; }
  });
  var list = Object.keys(convos).map(function (k) { return convos[k]; });
  list.sort(function (a, b) { return b.last.createdAt - a.last.createdAt; });
  return { conversations: list, unread: unread };
};

ACTIONS.dmThread = function (req) {
  var u = requireUser_(req.token);
  var users = usersByName_(), other = users[String(req['with'] || '')];
  if (!other) throw new Error('ไม่พบสมาชิก');
  var key = convo_(u.username, other.username);
  var msgs = dmRows_(u.username).filter(function (r) { return r.convo === key; })
    .map(function (r) { return r.msg; });
  msgs.sort(function (a, b) { return a.createdAt - b.createdAt; });
  return { partner: dmPerson_(person_(other), users), messages: msgs.slice(-DM_LIMIT) };
};

ACTIONS.dmSend = function (req) {
  var u = requireUser_(req.token);
  var to = findUser_(String(req.to || ''));
  if (!to || to.status !== 'active') throw new Error('ไม่พบผู้รับ หรือบัญชีผู้รับยังไม่เปิดใช้งาน');
  if (to.username === u.username) throw new Error('ส่งข้อความถึงตัวเองไม่ได้');
  var text = String(req.text || '').trim();
  var images = Array.isArray(req.images) ? req.images : [];
  if (!text && !images.length) throw new Error('พิมพ์ข้อความหรือแนบรูปก่อนส่ง');
  if (text.length > 5000) throw new Error('ข้อความยาวเกิน 5,000 ตัวอักษร');
  if (images.length > MAX_IMAGES) throw new Error('แนบรูปได้สูงสุด ' + MAX_IMAGES + ' รูปต่อข้อความ');

  var id = 'dm' + Utilities.getUuid().replace(/-/g, '').slice(0, 14);
  var key = convo_(u.username, to.username);
  var folder = folder_('DM_FOLDER_ID', DM_FOLDER);
  var msg = {
    id: id, from: person_(u), to: person_(to), text: text,
    images: images.map(function (d, i) { return 'dm:' + saveImage_(d, id + '-' + (i + 1), folder); }),
    createdAt: Date.now(), readAt: null, reactions: {}, reactionLog: []
  };
  if (req.replyTo) {
    var orig = findDm_(String(req.replyTo));
    if (orig && orig.convo === key) {
      msg.replyTo = { id: orig.msg.id, name: orig.msg.from.name,
        text: snippet_(orig.msg.text, 120) || (orig.msg.images.length ? '(รูปภาพ ' + orig.msg.images.length + ' รูป)' : '') };
    }
  }
  sheet_('DirectMessages', DM_HEADERS).appendRow([id, key, msg.createdAt, JSON.stringify(msg)]);
  return { message: msg };
};

/** Marks every message from `with` to the signed-in member as read. */
ACTIONS.dmRead = function (req) {
  var u = requireUser_(req.token);
  var key = convo_(u.username, String(req['with'] || ''));
  var sh = sheet_('DirectMessages', DM_HEADERS), now = Date.now(), count = 0;
  dmRows_(u.username).forEach(function (r) {
    if (r.convo === key && r.msg.to.username === u.username && !r.msg.readAt) {
      r.msg.readAt = now;
      sh.getRange(r.row, 4).setValue(JSON.stringify(r.msg));
      count++;
    }
  });
  return { count: count };
};

ACTIONS.dmReact = function (req) {
  var u = requireUser_(req.token), me = person_(u);
  var type = req.type === 'ok' || req.type === 'no' ? req.type : null;
  if (!type) throw new Error('ปุ่มไม่ถูกต้อง');
  var found = findDm_(String(req.id || ''));
  if (!found || !isDmParty_(found.msg, u.username)) throw new Error('ไม่พบข้อความ');
  if (found.msg.to.username !== u.username) throw new Error('กด ✓/✗ ได้เฉพาะผู้รับข้อความนี้');
  var cur = found.msg.reactions[key_(me)];
  if (!cur || cur.type !== type) {
    var rec = stamp_(me);
    rec.type = type;
    found.msg.reactions[key_(me)] = rec;
    found.msg.reactionLog.push(rec);
    sheet_('DirectMessages', DM_HEADERS).getRange(found.row, 4).setValue(JSON.stringify(found.msg));
  }
  return { message: found.msg };
};

ACTIONS.dmDelete = function (req) {
  var u = requireUser_(req.token);
  var found = findDm_(String(req.id || ''));
  if (!found) return {};
  // Admins only, and only in conversations they are part of (private messages stay private).
  if (!u.isAdmin) throw new Error('ลบข้อความได้เฉพาะผู้ดูแลระบบ (admin)');
  if (!isDmParty_(found.msg, u.username)) throw new Error('ไม่พบข้อความ');
  found.msg.images.forEach(function (ref) {
    try { DriveApp.getFileById(String(ref).replace(/^dm:/, '')).setTrashed(true); } catch (e) { /* already gone */ }
  });
  sheet_('DirectMessages', DM_HEADERS).deleteRow(found.row);
  return { deleted: found.msg.id };
};

/** A private image, only for the two people in that conversation. */
ACTIONS.dmImage = function (req) {
  var u = requireUser_(req.token);
  var found = findDm_(String(req.id || ''));
  var ref = 'dm:' + String(req.fileId || '');
  if (!found || !isDmParty_(found.msg, u.username) || found.msg.images.indexOf(ref) === -1) throw new Error('ไม่พบรูป');
  var blob = DriveApp.getFileById(String(req.fileId)).getBlob();
  return { dataUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) };
};

/* ---------------- Private message helpers ---------------- */

function convo_(a, b) { return [String(a), String(b)].sort().join('|'); }

function isDmParty_(msg, username) { return msg.from.username === username || msg.to.username === username; }

function dmPartner_(msg, username) { return msg.from.username === username ? msg.to : msg.from; }

function usersByName_() {
  var out = {};
  allUsers_().forEach(function (u) { out[u.username] = u; });
  return out;
}

/** Partner as shown on the page, with the current name and role from the Users sheet. */
function dmPerson_(p, users) {
  var u = users[p.username];
  return { username: p.username, name: u ? u.fullName : p.name, role: u ? u.role : p.role,
    active: !!u && u.status === 'active' };
}

/** All private messages the member sent or received. */
function dmRows_(username) {
  var rows = sheet_('DirectMessages', DM_HEADERS).getDataRange().getValues(), out = [];
  for (var i = 1; i < rows.length; i++) {
    var c = String(rows[i][1]).split('|');
    if (c[0] === username || c[1] === username) {
      var msg = JSON.parse(rows[i][3]);
      msg.images = msg.images || []; msg.reactions = msg.reactions || {}; msg.reactionLog = msg.reactionLog || [];
      out.push({ row: i + 1, convo: String(rows[i][1]), msg: msg });
    }
  }
  return out;
}

function findDm_(id) {
  if (!id) return null;
  var sh = sheet_('DirectMessages', DM_HEADERS);
  var ids = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues();
  for (var i = ids.length - 1; i >= 1; i--) {
    if (String(ids[i][0]) === id) {
      var msg = JSON.parse(sh.getRange(i + 1, 4).getValue());
      msg.images = msg.images || []; msg.reactions = msg.reactions || {}; msg.reactionLog = msg.reactionLog || [];
      return { row: i + 1, convo: String(sh.getRange(i + 1, 2).getValue()), msg: msg };
    }
  }
  return null;
}

/* ---------------- Chat helpers ---------------- */

function person_(u) { return { username: u.username, name: u.fullName, role: u.role }; }

function stamp_(p) { return { username: p.username, name: p.name, role: p.role, at: Date.now() }; }

// Same key as readerKey() in chat.js
function key_(p) { return 'u_' + String(p.username).replace(/\W/g, '_'); }

function snippet_(text, n) {
  var t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

function isForUser_(msg, u) {
  return msg.to.indexOf('ALL') !== -1 || msg.to.indexOf(u.role) !== -1 || msg.to.indexOf('u:' + u.username) !== -1;
}

/** Keeps only valid recipients: ALL, a profession, or u:<active member>; names come from the Users sheet. */
function cleanTargets_(list) {
  var users = {};
  allUsers_().forEach(function (u) { if (u.status === 'active') users[u.username] = u; });
  var to = [], names = {};
  (Array.isArray(list) ? list : []).forEach(function (t) {
    t = String(t);
    if (to.indexOf(t) !== -1) return;
    if (t === 'ALL' || CHAT_ROLES.indexOf(t) !== -1) to.push(t);
    else if (t.indexOf('u:') === 0 && users[t.slice(2)]) {
      var u = users[t.slice(2)];
      to.push(t);
      names[t.slice(2).replace(/\W/g, '_')] = u.fullName + ' (' + u.role + ')';
    }
  });
  if (to.indexOf('ALL') !== -1) to = ['ALL'].concat(to.filter(function (t) { return t.indexOf('u:') === 0; }));
  return { to: to, names: names };
}

function label_(msg, t) {
  if (t === 'ALL') return 'ทุกคน';
  if (t.indexOf('u:') === 0) return msg.toNames[t.slice(2).replace(/\W/g, '_')] || t.slice(2);
  return t;
}

function labels_(msg) { return msg.to.map(function (t) { return label_(msg, t); }); }

function findMessage_(id) {
  if (!id) return null;
  var sheet = sheet_('Messages', MESSAGE_HEADERS);
  var ids = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 1).getValues();
  for (var i = ids.length - 1; i >= 1; i--) {
    if (String(ids[i][0]) === id) {
      var msg = JSON.parse(sheet.getRange(i + 1, 4).getValue());
      ['forwards', 'reactionLog', 'images', 'to'].forEach(function (k) { msg[k] = msg[k] || []; });
      ['reads', 'reactions', 'toNames'].forEach(function (k) { msg[k] = msg[k] || {}; });
      return { row: i + 1, msg: msg };
    }
  }
  return null;
}

/** Loads a message, lets fn change it (return false = nothing changed), saves it and returns it. */
function updateMessage_(id, fn) {
  var found = findMessage_(String(id || ''));
  if (!found) throw new Error('ไม่พบข้อความ (อาจถูกลบแล้ว)');
  if (fn(found.msg) !== false) {
    sheet_('Messages', MESSAGE_HEADERS).getRange(found.row, 4).setValue(JSON.stringify(found.msg));
  }
  return { message: found.msg };
}

function saveImage_(dataUrl, name, folder) {
  var m = /^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+\/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('ไฟล์รูปไม่ถูกต้อง');
  if (m[2].length > MAX_IMAGE_CHARS) throw new Error('รูปใหญ่เกินไป');
  var ext = m[1].split('/')[1].replace('jpeg', 'jpg');
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name + '.' + ext);
  return (folder || folder_()).createFile(blob).getId();
}

/** A Drive folder remembered in Script properties (default: the announcement chat's image folder). */
function folder_(propKey, name) {
  propKey = propKey || 'IMAGE_FOLDER_ID';
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(propKey);
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* recreate below */ }
  }
  var f = DriveApp.createFolder(name || IMAGE_FOLDER);
  props.setProperty(propKey, f.getId());
  return f;
}

/** One row per chat action in the ChatLog sheet: who, what and when (Thailand time). */
function log_(action, p, detail, msg) {
  sheet_('ChatLog', LOG_HEADERS).appendRow([
    Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy-MM-dd HH:mm:ss'),
    action, p.name, p.role, p.username, detail || '', msg.id, snippet_(msg.text, 100) || '(รูปภาพ)'
  ]);
}

/* ---------------- Member helpers ---------------- */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** The spreadsheet that holds the data: the one this script is bound to, or one it created. */
function ss_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  ss = SpreadsheetApp.create('LPCH RO Workspace Data');
  ss.setSpreadsheetTimeZone(TIME_ZONE);
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

function sheet_(name, headers) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setFontColor('#ffffff').setBackground('#1d5bd6');
    sh.getRange('A:A').setNumberFormat('@');  // keep usernames/tokens/ids as text
    if (name === 'Users') sh.getRange('D:D').setNumberFormat('@');
  }
  return sh;
}

function normUsername_(v) {
  var u = String(v || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(u)) {
    throw new Error('ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ ตัวเลข หรือ . _ - ความยาว 3–30 ตัวอักษร');
  }
  return u;
}

function normEmail_(v) {
  var e = String(v || '').trim().toLowerCase();
  if (!e) throw new Error('กรุณากรอกอีเมล (ใช้รับรหัสเมื่อลืมรหัสผ่าน)');
  if (e.length > 100 || !EMAIL_RE.test(e)) throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
  return e;
}

function emailTaken_(email, exceptUsername) {
  return allUsers_().some(function (u) {
    return u.username !== exceptUsername && String(u.email || '').trim().toLowerCase() === email;
  });
}

/** A member by username, or by email when the text contains @. */
function findUserByLogin_(login) {
  if (!login) return null;
  if (login.indexOf('@') === -1) return findUser_(login);
  return allUsers_().filter(function (u) { return String(u.email || '').trim().toLowerCase() === login; })[0] || null;
}

/** 6-digit code from a random UUID. */
function resetCode_() {
  var n = parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 12), 16) % 1000000;
  return ('000000' + n).slice(-6);
}

function sendResetEmail_(u, code) {
  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { /* not deployed yet */ }
  var lines = [
    'เรียน ' + u.fullName,
    '',
    'มีการขอตั้งรหัสผ่านใหม่สำหรับบัญชี ' + TITLE,
    'ชื่อผู้ใช้ (Username): ' + u.username,
    'รหัสยืนยัน: ' + code,
    '',
    'นำรหัสนี้ไปกรอกในหน้า "ลืมรหัสผ่าน" ภายใน ' + RESET_MINUTES + ' นาที',
    url ? 'เปิดเว็บ: ' + url : '',
    '',
    'ถ้าคุณไม่ได้ขอรหัสนี้ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ',
    '— ' + TITLE + ' · Lampang Cancer Hospital'
  ];
  var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var html =
    '<div style="font:15px/1.6 sans-serif;color:#142033;max-width:520px">' +
    '<h2 style="margin:0 0 4px;color:#1d5bd6">LPCH RO Workspace</h2>' +
    '<p style="margin:0 0 16px;color:#5a6679">Lampang Cancer Hospital</p>' +
    '<p>เรียน ' + esc(u.fullName) + '</p>' +
    '<p>มีการขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ<br>ชื่อผู้ใช้ (Username): <b>' + esc(u.username) + '</b></p>' +
    '<p style="font:600 32px/1.2 monospace;letter-spacing:8px;background:#e2ebfc;color:#1d5bd6;padding:12px 16px;border-radius:6px;text-align:center">' + code + '</p>' +
    '<p>นำรหัสนี้ไปกรอกในหน้า "ลืมรหัสผ่าน" ภายใน ' + RESET_MINUTES + ' นาที</p>' +
    (url ? '<p><a href="' + esc(url) + '" style="color:#1d5bd6">เปิด LPCH RO Workspace</a></p>' : '') +
    '<p style="color:#5a6679;font-size:13px">ถ้าคุณไม่ได้ขอรหัสนี้ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ</p></div>';
  MailApp.sendEmail({
    to: u.email,
    subject: 'รหัสตั้งรหัสผ่านใหม่ ' + TITLE + ': ' + code,
    body: lines.filter(function (l, i) { return l || lines[i - 1]; }).join('\n'),
    htmlBody: html,
    name: TITLE
  });
}

function validatePassword_(p) {
  if (!p || String(p).length < 8) throw new Error('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
}

function hash_(password, salt) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + password, Utilities.Charset.UTF_8);
  var saltBytes = Utilities.newBlob(salt).getBytes();
  for (var i = 1; i < HASH_ROUNDS; i++) {
    bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes.concat(saltBytes));
  }
  return Utilities.base64Encode(bytes);
}

function allUsers_() {
  var rows = sheet_('Users', USER_HEADERS).getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var u = { _row: i + 1 };
    USER_HEADERS.forEach(function (h, j) { u[h] = rows[i][j]; });
    u.username = String(u.username);
    u.isAdmin = u.isAdmin === true || u.isAdmin === 'TRUE';
    out.push(u);
  }
  return out;
}

function findUser_(username) {
  return allUsers_().filter(function (u) { return u.username === username; })[0] || null;
}

function setUserField_(u, field, value) {
  sheet_('Users', USER_HEADERS).getRange(u._row, USER_HEADERS.indexOf(field) + 1).setValue(value);
}

function publicUser_(u) {
  return {
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    phone: String(u.phone || ''),
    email: u.email || '',
    status: u.status,
    isAdmin: u.isAdmin,
    createdAt: u.createdAt ? new Date(u.createdAt).getTime() : null,
    lastLogin: u.lastLogin ? new Date(u.lastLogin).getTime() : null
  };
}

function createSession_(username) {
  var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  var expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  sheet_('Sessions', SESSION_HEADERS).appendRow([token, username, expires]);
  return token;
}

function requireUser_(token) {
  if (!token) throw new Error('session_expired');
  var rows = sheet_('Sessions', SESSION_HEADERS).getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === token && new Date(rows[i][2]).getTime() > Date.now()) {
      var u = findUser_(String(rows[i][1]));
      if (u && u.status === 'active') return u;
      break;
    }
  }
  throw new Error('session_expired');
}

function requireAdmin_(token) {
  var u = requireUser_(token);
  if (!u.isAdmin) throw new Error('ต้องเป็นผู้ดูแลระบบ');
  return u;
}

function purgeSessions_() {
  var sheet = sheet_('Sessions', SESSION_HEADERS);
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if (new Date(rows[i][2]).getTime() <= Date.now()) sheet.deleteRow(i + 1);
  }
}

function dropSessionsOf_(username) {
  var sheet = sheet_('Sessions', SESSION_HEADERS);
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][1]) === username) sheet.deleteRow(i + 1);
  }
}

// ----- สิ้นสุดไฟล์ Code.gs (ถ้าไม่เห็นบรรทัดนี้ใน Apps Script แสดงว่าวางโค้ดมาไม่ครบ) -----
