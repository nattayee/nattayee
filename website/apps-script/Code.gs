/**
 * LPCH RO Workspace — ระบบสมาชิก (Google Apps Script + Google Sheets)
 *
 * วิธีติดตั้ง (ดูรายละเอียดใน website/README.md):
 *   1. สร้าง Google Sheet ใหม่ → Extensions → Apps Script → วางโค้ดนี้แทน Code.gs
 *   2. Deploy → New deployment → Web app
 *        Execute as: Me   |   Who has access: Anyone
 *   3. คัดลอก Web app URL (.../exec) ไปใส่ที่ auth.apiUrl ใน website/data.js
 *
 * ผู้ที่สมัครคนแรกจะเป็นผู้ดูแลระบบ (admin) และใช้งานได้ทันที
 * ผู้สมัครคนต่อไปต้องรอ admin อนุมัติ (ปิดได้ที่ REQUIRE_APPROVAL)
 */

var REQUIRE_APPROVAL = true;
var SESSION_DAYS = 7;
var ROLES = ['RO', 'MP', 'RTT', 'Nurse', 'Other'];
var MAX_FAILED_LOGINS = 5;     // ต่อ 15 นาที
var HASH_ROUNDS = 200;

var USER_HEADERS = ['username', 'fullName', 'role', 'phone', 'email', 'salt', 'hash', 'status', 'isAdmin', 'createdAt', 'lastLogin'];
var SESSION_HEADERS = ['token', 'username', 'expiresAt'];

/* ---------------- HTTP entry points ---------------- */

function doGet() {
  return json_({ ok: true, service: 'LPCH RO Workspace auth' });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'คำขอไม่ถูกต้อง' });
  }
  var fn = ACTIONS[req.action];
  if (!fn) return json_({ ok: false, error: 'ไม่รู้จักคำสั่ง ' + req.action });

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var out = fn(req) || {};
    out.ok = true;
    return json_(out);
  } catch (err) {
    return json_({ ok: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- Actions ---------------- */

var ACTIONS = {
  register: function (req) {
    var username = normUsername_(req.username);
    var fullName = String(req.fullName || '').trim();
    var role = String(req.role || '');
    validatePassword_(req.password);
    if (!fullName) throw new Error('กรุณากรอกชื่อ-นามสกุล');
    if (ROLES.indexOf(role) === -1) throw new Error('กรุณาเลือกตำแหน่ง');
    if (findUser_(username)) throw new Error('ชื่อผู้ใช้นี้ถูกใช้แล้ว');

    var sheet = sheet_('Users', USER_HEADERS);
    var first = sheet.getLastRow() < 2;
    var status = first || !REQUIRE_APPROVAL ? 'active' : 'pending';
    var salt = Utilities.getUuid();
    sheet.appendRow([
      username, fullName, role,
      String(req.phone || '').trim(), String(req.email || '').trim(),
      salt, hash_(req.password, salt), status, first, new Date(), ''
    ]);

    if (status === 'pending') {
      return { status: status, message: 'สมัครสมาชิกสำเร็จ กรุณารอผู้ดูแลระบบอนุมัติก่อนเข้าใช้งาน' };
    }
    var u = findUser_(username);
    return { status: status, token: createSession_(username), user: publicUser_(u) };
  },

  login: function (req) {
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
  },

  me: function (req) {
    return { user: publicUser_(requireUser_(req.token)) };
  },

  logout: function (req) {
    var sheet = sheet_('Sessions', SESSION_HEADERS);
    var rows = sheet.getDataRange().getValues();
    for (var i = rows.length - 1; i >= 1; i--) {
      if (rows[i][0] === req.token) sheet.deleteRow(i + 1);
    }
    return {};
  },

  changePassword: function (req) {
    var u = requireUser_(req.token);
    if (hash_(req.oldPassword || '', u.salt) !== u.hash) throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
    validatePassword_(req.newPassword);
    var salt = Utilities.getUuid();
    setUserField_(u, 'salt', salt);
    setUserField_(u, 'hash', hash_(req.newPassword, salt));
    return { message: 'เปลี่ยนรหัสผ่านเรียบร้อย' };
  },

  listUsers: function (req) {
    requireAdmin_(req.token);
    return { users: allUsers_().map(publicUser_) };
  },

  updateUser: function (req) {
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
  },

  deleteUser: function (req) {
    var admin = requireAdmin_(req.token);
    var u = findUser_(String(req.username || '').toLowerCase());
    if (!u) throw new Error('ไม่พบผู้ใช้');
    if (u.username === admin.username) throw new Error('ไม่สามารถลบบัญชีของตัวเองได้');
    sheet_('Users', USER_HEADERS).deleteRow(u._row);
    dropSessionsOf_(u.username);
    return {};
  }
};

/* ---------------- Helpers ---------------- */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('@');  // keep usernames/tokens as text
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
