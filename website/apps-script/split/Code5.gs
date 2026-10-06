// Code5.gs — ส่วนที่ 5/10 ของ LPCH RO Workspace (วางทุกไฟล์ Code1–Code10 ให้ครบ)
var ACTIONS = ACTIONS || {};

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

// ----- จบ Code5.gs (ถ้าไม่เห็นบรรทัดนี้ แสดงว่าวางไฟล์นี้มาไม่ครบ) -----
