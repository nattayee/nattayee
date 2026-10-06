// Code10.gs — ส่วนที่ 10/10 ของ LPCH RO Workspace (วางทุกไฟล์ Code1–Code10 ให้ครบ)

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

// ----- จบ Code10.gs (ถ้าไม่เห็นบรรทัดนี้ แสดงว่าวางไฟล์นี้มาไม่ครบ) -----
