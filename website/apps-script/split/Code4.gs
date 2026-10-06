// Code4.gs — ส่วนที่ 4/10 ของ LPCH RO Workspace (วางทุกไฟล์ Code1–Code10 ให้ครบ)
var ACTIONS = ACTIONS || {};

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

// ----- จบ Code4.gs (ถ้าไม่เห็นบรรทัดนี้ แสดงว่าวางไฟล์นี้มาไม่ครบ) -----
