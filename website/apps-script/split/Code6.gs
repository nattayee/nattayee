// Code6.gs — ส่วนที่ 6/10 ของ LPCH RO Workspace (วางทุกไฟล์ Code1–Code10 ให้ครบ)
var ACTIONS = ACTIONS || {};

ACTIONS.chatReact = function (req) {
  var u = requireUser_(req.token), me = person_(u);
  var type = req.type === 'ok' || req.type === 'no' ? req.type : null;
  if (!type) throw new Error('ปุ่มไม่ถูกต้อง');
  return updateMessage_(req.id, function (msg) {
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
  if (found.msg.author.username !== u.username && !u.isAdmin) throw new Error('ลบได้เฉพาะข้อความของตัวเอง');
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

// ----- จบ Code6.gs (ถ้าไม่เห็นบรรทัดนี้ แสดงว่าวางไฟล์นี้มาไม่ครบ) -----
