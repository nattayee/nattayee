// Code9.gs — ส่วนที่ 9/10 ของ LPCH RO Workspace (วางทุกไฟล์ Code1–Code10 ให้ครบ)

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

// ----- จบ Code9.gs (ถ้าไม่เห็นบรรทัดนี้ แสดงว่าวางไฟล์นี้มาไม่ครบ) -----
