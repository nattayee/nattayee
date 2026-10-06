// Code7.gs — ส่วนที่ 7/10 ของ LPCH RO Workspace (วางทุกไฟล์ Code1–Code10 ให้ครบ)

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

function saveImage_(dataUrl, name) {
  var m = /^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+\/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('ไฟล์รูปไม่ถูกต้อง');
  if (m[2].length > MAX_IMAGE_CHARS) throw new Error('รูปใหญ่เกินไป');
  var ext = m[1].split('/')[1].replace('jpeg', 'jpg');
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name + '.' + ext);
  return folder_().createFile(blob).getId();
}

function folder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('IMAGE_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* recreate below */ }
  }
  var f = DriveApp.createFolder(IMAGE_FOLDER);
  props.setProperty('IMAGE_FOLDER_ID', f.getId());
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

// ----- จบ Code7.gs (ถ้าไม่เห็นบรรทัดนี้ แสดงว่าวางไฟล์นี้มาไม่ครบ) -----
