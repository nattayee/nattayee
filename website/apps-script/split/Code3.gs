// Code3.gs — ส่วนที่ 3/10 ของ LPCH RO Workspace (วางทุกไฟล์ Code1–Code10 ให้ครบ)
var ACTIONS = ACTIONS || {};

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

// ----- จบ Code3.gs (ถ้าไม่เห็นบรรทัดนี้ แสดงว่าวางไฟล์นี้มาไม่ครบ) -----
