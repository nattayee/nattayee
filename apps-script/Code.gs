/**
 * ระบบจัดการวันลา — Google Apps Script
 * ข้อมูลทั้งหมดเก็บใน Google Sheet ที่ผูกกับสคริปต์นี้
 *
 * วิธีติดตั้ง: เลือกฟังก์ชัน setup แล้วกด Run หนึ่งครั้ง จากนั้น Deploy เป็น Web app
 */

// ===== ตั้งค่า =====
const ADMIN_PASSWORD = 'admin1234'; // รหัสผ่านเริ่มต้นของผู้ดูแลระบบ (เปลี่ยนในเว็บหลังเข้าสู่ระบบ)
const SEED_DEMO = false;            // true = สร้างหัวหน้า/พนักงานตัวอย่างไว้ทดลอง
const SESSION_HOURS = 6;            // อายุการเข้าสู่ระบบ (สูงสุด 6 ชั่วโมง)

const SHEETS = {
  Users: ['id', 'email', 'name', 'password_hash', 'role', 'department', 'manager_id', 'active', 'created_at'],
  LeaveTypes: ['id', 'name', 'annual_quota', 'color', 'active'],
  Holidays: ['id', 'date', 'name'],
  Requests: ['id', 'user_id', 'leave_type_id', 'start_date', 'end_date', 'half_day', 'days', 'reason',
    'status', 'approver_id', 'decision_note', 'created_at', 'decided_at'],
};
const NUMBER_COLS = ['id', 'manager_id', 'active', 'annual_quota', 'user_id', 'leave_type_id', 'days', 'approver_id'];
const ROLES = ['employee', 'manager', 'admin'];

const DEFAULT_LEAVE_TYPES = [
  ['ลาป่วย', 30, '#ef4444'],
  ['ลากิจ', 6, '#f59e0b'],
  ['ลาพักร้อน', 10, '#10b981'],
  ['ลาคลอด', 98, '#ec4899'],
  ['ลาบวช', 15, '#8b5cf6'],
];
// วันหยุดราชการที่วันที่ตายตัว (วันหยุดทางจันทรคติและวันชดเชย ให้เพิ่มในหน้าตั้งค่า)
const FIXED_HOLIDAYS = [
  ['01-01', 'วันขึ้นปีใหม่'], ['04-06', 'วันจักรี'], ['04-13', 'วันสงกรานต์'], ['04-14', 'วันสงกรานต์'],
  ['04-15', 'วันสงกรานต์'], ['05-01', 'วันแรงงานแห่งชาติ'], ['05-04', 'วันฉัตรมงคล'],
  ['06-03', 'วันเฉลิมพระชนมพรรษาสมเด็จพระราชินี'], ['07-28', 'วันเฉลิมพระชนมพรรษา ร.10'],
  ['08-12', 'วันแม่แห่งชาติ'], ['10-13', 'วันนวมินทรมหาราช'], ['10-23', 'วันปิยมหาราช'],
  ['12-05', 'วันพ่อแห่งชาติ'], ['12-10', 'วันรัฐธรรมนูญ'], ['12-31', 'วันสิ้นปี'],
];

// ===== เว็บ =====
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('ระบบจัดการวันลา')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ===== ติดตั้งครั้งแรก =====
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  Object.keys(SHEETS).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), SHEETS[name].length).setNumberFormat('@'); // เก็บทุกช่องเป็นข้อความ
    sh.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });

  if (!all_('LeaveTypes').length) {
    DEFAULT_LEAVE_TYPES.forEach(function (t) {
      insert_('LeaveTypes', { name: t[0], annual_quota: t[1], color: t[2], active: 1 });
    });
  }
  if (!all_('Holidays').length) {
    const y = Number(today_().slice(0, 4));
    [y, y + 1].forEach(function (year) {
      FIXED_HOLIDAYS.forEach(function (h) { insert_('Holidays', { date: year + '-' + h[0], name: h[1] }); });
    });
  }
  if (!all_('Users').length) {
    const email = (Session.getEffectiveUser().getEmail() || 'admin@example.com').toLowerCase();
    const admin = insert_('Users', {
      email: email, name: 'ผู้ดูแลระบบ', password_hash: hashPassword_(ADMIN_PASSWORD), role: 'admin',
      department: 'HR', manager_id: '', active: 1, created_at: now_(),
    });
    if (SEED_DEMO) {
      const pw = hashPassword_('password');
      const mgr = insert_('Users', { email: 'manager@example.com', name: 'สมชาย หัวหน้า', password_hash: pw,
        role: 'manager', department: 'IT', manager_id: admin.id, active: 1, created_at: now_() });
      insert_('Users', { email: 'somsri@example.com', name: 'สมศรี ใจดี', password_hash: pw,
        role: 'employee', department: 'IT', manager_id: mgr.id, active: 1, created_at: now_() });
    }
    Logger.log('เข้าสู่ระบบด้วย ' + email + ' / ' + ADMIN_PASSWORD);
  }
  const extra = ss.getSheetByName('Sheet1') || ss.getSheetByName('แผ่น1') || ss.getSheetByName('ชีต1');
  if (extra && ss.getSheets().length > 1 && extra.getLastRow() === 0) ss.deleteSheet(extra);
  Logger.log('ติดตั้งเสร็จแล้ว ต่อไปให้ Deploy > New deployment > Web app');
}

// ===== ชั้นข้อมูล (Google Sheet) =====
const cache_ = {};

function ss_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new HttpError_(500, 'ยังไม่ได้ติดตั้งระบบ กรุณารันฟังก์ชัน setup ก่อน');
  return sh;
}
function cast_(col, v) {
  if (NUMBER_COLS.indexOf(col) === -1) return v === null || v === undefined ? '' : String(v);
  if (v === '' || v === null || v === undefined) return col === 'manager_id' || col === 'approver_id' ? null : 0;
  return Number(v);
}
function all_(name) {
  if (cache_[name]) return cache_[name];
  const cols = SHEETS[name];
  const values = sheet_(name).getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === '' || values[i][0] === null) continue;
    const o = { _row: i + 1 };
    cols.forEach(function (c, j) { o[c] = cast_(c, values[i][j]); });
    rows.push(o);
  }
  cache_[name] = rows;
  return rows;
}
function find_(name, id) {
  return all_(name).filter(function (r) { return r.id === Number(id); })[0] || null;
}
function toRow_(name, rec) {
  return SHEETS[name].map(function (c) { return rec[c] === null || rec[c] === undefined ? '' : String(rec[c]); });
}
function insert_(name, obj) {
  const id = all_(name).reduce(function (m, r) { return Math.max(m, r.id); }, 0) + 1;
  const rec = Object.assign({}, obj, { id: id });
  const sh = sheet_(name);
  const row = sh.getLastRow() + 1;
  sh.getRange(row, 1, 1, SHEETS[name].length).setNumberFormat('@').setValues([toRow_(name, rec)]);
  delete cache_[name];
  return find_(name, id);
}
function update_(name, id, patch) {
  const cur = find_(name, id);
  if (!cur) return null;
  const rec = Object.assign({}, cur, patch);
  sheet_(name).getRange(cur._row, 1, 1, SHEETS[name].length).setValues([toRow_(name, rec)]);
  delete cache_[name];
  return find_(name, id);
}
function remove_(name, id) {
  const cur = find_(name, id);
  if (cur) sheet_(name).deleteRow(cur._row);
  delete cache_[name];
}

// ===== เครื่องมือ =====
function HttpError_(status, message) { this.status = status; this.message = message; }
function bad_(msg) { return new HttpError_(400, msg); }
function tz_() { return Session.getScriptTimeZone() || 'Asia/Bangkok'; }
function today_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }
function now_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm:ss'); }
function str_(v, max) { return typeof v === 'string' ? v.trim().slice(0, max || 500) : ''; }
function hex_(bytes) {
  return bytes.map(function (b) { return ((b + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}
function hashPassword_(password, salt) {
  salt = salt || Utilities.getUuid().replace(/-/g, '');
  let h = salt + ':' + password;
  for (let i = 0; i < 200; i++) h = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h, Utilities.Charset.UTF_8));
  return 'sha256$' + salt + '$' + h;
}
function verifyPassword_(password, stored) {
  const parts = String(stored).split('$');
  return parts.length === 3 && hashPassword_(password, parts[1]) === stored;
}
function publicUser_(u) {
  if (!u) return null;
  const o = Object.assign({}, u);
  delete o.password_hash;
  delete o._row;
  o.active = !!o.active;
  return o;
}
function clean_(r) {
  if (!r) return r;
  const o = Object.assign({}, r);
  delete o._row;
  return o;
}

// ===== วันที่ =====
function isValidDate_(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
function countLeaveDays_(start, end, half) {
  const hol = {};
  all_('Holidays').forEach(function (h) { hol[h.date] = true; });
  let days = 0;
  const d = new Date(start + 'T00:00:00Z');
  const last = new Date(end + 'T00:00:00Z');
  while (d <= last) {
    const s = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6 && !hol[s]) days++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return half && days > 0 ? 0.5 : days;
}
function validateDates_(body) {
  const start = body.start_date;
  const end = body.end_date || body.start_date;
  const half = body.half_day === 'am' || body.half_day === 'pm' ? body.half_day : '';
  if (!isValidDate_(start) || !isValidDate_(end)) throw bad_('รูปแบบวันที่ไม่ถูกต้อง');
  if (end < start) throw bad_('วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น');
  if (start.slice(0, 4) !== end.slice(0, 4)) throw bad_('ใบลาหนึ่งใบต้องอยู่ในปีเดียวกัน กรุณาแยกเป็นสองใบ');
  if (half && start !== end) throw bad_('ลาครึ่งวันต้องเป็นวันเดียว');
  return { start: start, end: end, half: half };
}

// ===== กติกาการลา =====
function balances_(userId, year) {
  const mine = all_('Requests').filter(function (r) {
    return r.user_id === userId && r.start_date.slice(0, 4) === String(year) &&
      (r.status === 'pending' || r.status === 'approved');
  });
  return all_('LeaveTypes').filter(function (t) { return t.active; }).map(function (t) {
    let used = 0, pending = 0;
    mine.forEach(function (r) {
      if (r.leave_type_id !== t.id) return;
      if (r.status === 'approved') used += r.days; else pending += r.days;
    });
    return { leave_type_id: t.id, name: t.name, color: t.color, quota: t.annual_quota,
      used: used, pending: pending, remaining: t.annual_quota - used - pending };
  });
}
// ผู้อนุมัติ: หัวหน้าโดยตรงของพนักงาน หรือผู้ดูแลระบบ
function canDecide_(user, r) {
  if (user.role === 'admin') return true;
  const owner = find_('Users', r.user_id);
  return user.role === 'manager' && owner && owner.manager_id === user.id && r.user_id !== user.id;
}
function requireRole_(user) {
  const roles = Array.prototype.slice.call(arguments, 1);
  if (roles.indexOf(user.role) === -1) throw new HttpError_(403, 'ไม่มีสิทธิ์เข้าถึง');
}
function expand_(r) {
  const u = find_('Users', r.user_id) || {};
  const t = find_('LeaveTypes', r.leave_type_id) || {};
  const a = r.approver_id ? find_('Users', r.approver_id) : null;
  const o = clean_(r);
  o.user_name = u.name || '';
  o.department = u.department || '';
  o.type_name = t.name || '';
  o.type_color = t.color || '#999999';
  o.approver_name = a ? a.name : null;
  return o;
}
function byStartDesc_(a, b) { return a.start_date < b.start_date ? 1 : a.start_date > b.start_date ? -1 : b.id - a.id; }

// ===== API (เรียกจากหน้าเว็บผ่าน google.script.run.api) =====
const ROUTES = [];
function route_(method, pattern, handler, opts) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, function (_, k) { keys.push(k); return '(\\d+)'; }) + '$');
  ROUTES.push({ method: method, re: re, keys: keys, handler: handler, auth: !(opts && opts.auth === false) });
}

function api(token, method, url, body) {
  const lock = method === 'GET' ? null : LockService.getScriptLock();
  try {
    if (lock) lock.waitLock(20000);
    const parts = String(url).split('?');
    const path = parts[0];
    const query = {};
    (parts[1] || '').split('&').forEach(function (kv) {
      if (!kv) return;
      const p = kv.split('=');
      query[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
    const r = ROUTES.filter(function (x) { return x.method === method && x.re.test(path); })[0];
    if (!r) throw new HttpError_(404, 'ไม่พบ API');
    const user = sessionUser_(token);
    if (r.auth && !user) throw new HttpError_(401, 'กรุณาเข้าสู่ระบบ');
    const m = path.match(r.re);
    const params = {};
    r.keys.forEach(function (k, i) { params[k] = Number(m[i + 1]); });
    const data = r.handler({ user: user, token: token, body: body || {}, params: params, query: query });
    return JSON.stringify({ ok: true, data: data });
  } catch (err) {
    if (err instanceof HttpError_) return JSON.stringify({ ok: false, status: err.status, error: err.message });
    console.error(err && err.stack || err);
    return JSON.stringify({ ok: false, status: 500, error: 'เกิดข้อผิดพลาดภายในระบบ: ' + (err && err.message) });
  } finally {
    if (lock) lock.releaseLock();
  }
}

function sessionUser_(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const id = CacheService.getScriptCache().get('sess_' + token);
  if (!id) return null;
  const u = find_('Users', id);
  return u && u.active ? u : null;
}

route_('POST', '/api/login', function (c) {
  const email = str_(c.body.email, 200).toLowerCase();
  const u = all_('Users').filter(function (x) { return x.email.toLowerCase() === email && x.active; })[0];
  if (!u || !verifyPassword_(String(c.body.password || ''), u.password_hash)) {
    throw new HttpError_(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  }
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  CacheService.getScriptCache().put('sess_' + token, String(u.id), SESSION_HOURS * 3600);
  return { user: publicUser_(u), token: token };
}, { auth: false });

route_('POST', '/api/logout', function (c) {
  CacheService.getScriptCache().remove('sess_' + c.token);
  return { ok: true };
});

route_('GET', '/api/me', function (c) {
  const year = Number(c.query.year) || Number(today_().slice(0, 4));
  const pending = c.user.role === 'employee' ? 0 : all_('Requests').filter(function (r) {
    return r.status === 'pending' && canDecide_(c.user, r);
  }).length;
  return { user: publicUser_(c.user), year: year, balances: balances_(c.user.id, year), pendingApprovals: pending };
});

route_('POST', '/api/me/password', function (c) {
  if (!verifyPassword_(String(c.body.current || ''), c.user.password_hash)) throw bad_('รหัสผ่านปัจจุบันไม่ถูกต้อง');
  const pw = String(c.body.password || '');
  if (pw.length < 8) throw bad_('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร');
  update_('Users', c.user.id, { password_hash: hashPassword_(pw) });
  return { ok: true };
});

route_('GET', '/api/leave-types', function (c) {
  return all_('LeaveTypes')
    .filter(function (t) { return c.user.role === 'admin' || t.active; })
    .map(function (t) { const o = clean_(t); o.active = !!o.active; return o; });
});

route_('GET', '/api/holidays', function (c) {
  const year = String(Number(c.query.year) || today_().slice(0, 4));
  return all_('Holidays').filter(function (h) { return h.date.slice(0, 4) === year; })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; }).map(clean_);
});

route_('POST', '/api/requests/preview', function (c) {
  const d = validateDates_(c.body);
  return { days: countLeaveDays_(d.start, d.end, d.half) };
});

route_('GET', '/api/requests/mine', function (c) {
  const year = String(Number(c.query.year) || today_().slice(0, 4));
  return all_('Requests')
    .filter(function (r) { return r.user_id === c.user.id && r.start_date.slice(0, 4) === year; })
    .sort(byStartDesc_).map(expand_);
});

route_('POST', '/api/requests', function (c) {
  const d = validateDates_(c.body);
  const type = find_('LeaveTypes', c.body.leave_type_id);
  if (!type || !type.active) throw bad_('กรุณาเลือกประเภทการลา');
  const days = countLeaveDays_(d.start, d.end, d.half);
  if (days <= 0) throw bad_('ช่วงวันที่เลือกไม่มีวันทำงาน (เป็นวันหยุดทั้งหมด)');

  const overlap = all_('Requests').some(function (r) {
    if (r.user_id !== c.user.id || (r.status !== 'pending' && r.status !== 'approved')) return false;
    if (r.start_date > d.end || r.end_date < d.start) return false;
    return !(r.half_day && d.half && r.half_day !== d.half); // ครึ่งเช้า + ครึ่งบ่ายวันเดียวกันได้
  });
  if (overlap) throw bad_('มีใบลาที่ทับซ้อนกับช่วงวันที่นี้อยู่แล้ว');

  const bal = balances_(c.user.id, d.start.slice(0, 4)).filter(function (b) { return b.leave_type_id === type.id; })[0];
  if (bal && days > bal.remaining) {
    throw bad_('วัน' + type.name + 'คงเหลือไม่พอ (เหลือ ' + bal.remaining + ' วัน ขอ ' + days + ' วัน)');
  }
  return expand_(insert_('Requests', {
    user_id: c.user.id, leave_type_id: type.id, start_date: d.start, end_date: d.end, half_day: d.half,
    days: days, reason: str_(c.body.reason, 1000), status: 'pending', approver_id: '', decision_note: '',
    created_at: now_(), decided_at: '',
  }));
});

route_('POST', '/api/requests/:id/cancel', function (c) {
  const r = find_('Requests', c.params.id);
  if (!r || r.user_id !== c.user.id) throw new HttpError_(404, 'ไม่พบใบลา');
  if (r.status === 'approved' && r.start_date <= today_()) throw bad_('ไม่สามารถยกเลิกใบลาที่เริ่มไปแล้ว');
  if (r.status !== 'pending' && r.status !== 'approved') throw bad_('ใบลานี้ถูกดำเนินการไปแล้ว');
  return expand_(update_('Requests', r.id, { status: 'cancelled' }));
});

route_('GET', '/api/approvals', function (c) {
  requireRole_(c.user, 'manager', 'admin');
  const status = ['pending', 'approved', 'rejected', 'cancelled'].indexOf(c.query.status) >= 0 ? c.query.status : 'pending';
  const rows = all_('Requests').filter(function (r) { return r.status === status && canDecide_(c.user, r); });
  rows.sort(byStartDesc_);
  if (status === 'pending') rows.reverse();
  return rows.slice(0, 500).map(expand_);
});

route_('POST', '/api/requests/:id/decide', function (c) {
  requireRole_(c.user, 'manager', 'admin');
  const r = find_('Requests', c.params.id);
  if (!r || !canDecide_(c.user, r)) throw new HttpError_(404, 'ไม่พบใบลา');
  if (r.status !== 'pending') throw bad_('ใบลานี้ถูกดำเนินการไปแล้ว');
  if (c.body.action !== 'approve' && c.body.action !== 'reject') throw bad_('การดำเนินการไม่ถูกต้อง');
  const updated = update_('Requests', r.id, {
    status: c.body.action === 'approve' ? 'approved' : 'rejected', approver_id: c.user.id,
    decision_note: str_(c.body.note, 500), decided_at: now_(),
  });
  notify_(updated);
  return expand_(updated);
});

// แจ้งผลการอนุมัติทางอีเมล (ถ้าส่งไม่ได้ก็ข้ามไป ไม่ให้การอนุมัติล้มเหลว)
function notify_(r) {
  try {
    const u = find_('Users', r.user_id);
    const t = find_('LeaveTypes', r.leave_type_id);
    if (!u || !/@/.test(u.email) || /@example\.com$/.test(u.email)) return;
    const result = r.status === 'approved' ? 'อนุมัติแล้ว' : 'ไม่อนุมัติ';
    MailApp.sendEmail(u.email, 'ใบลา' + t.name + ' ' + r.start_date + ' ' + result,
      'ใบลา' + t.name + ' วันที่ ' + r.start_date + (r.end_date !== r.start_date ? ' ถึง ' + r.end_date : '') +
      ' (' + r.days + ' วัน) ' + result + (r.decision_note ? '\nหมายเหตุ: ' + r.decision_note : ''));
  } catch (e) {
    console.warn('ส่งอีเมลไม่สำเร็จ: ' + e);
  }
}

route_('GET', '/api/calendar', function (c) {
  const month = /^\d{4}-\d{2}$/.test(c.query.month || '') ? c.query.month : today_().slice(0, 7);
  const first = month + '-01', last = month + '-31';
  const requests = all_('Requests').filter(function (r) {
    return (r.status === 'pending' || r.status === 'approved') && r.start_date <= last && r.end_date >= first;
  }).map(expand_);
  const holidays = all_('Holidays').filter(function (h) { return h.date >= first && h.date <= last; }).map(clean_);
  return { month: month, requests: requests, holidays: holidays };
});

function summary_(user, year) {
  const users = all_('Users').filter(function (u) {
    return u.active && (user.role === 'admin' || u.manager_id === user.id);
  });
  return {
    year: year,
    types: all_('LeaveTypes').filter(function (t) { return t.active; }).map(clean_),
    rows: users.map(function (u) {
      return { user: { id: u.id, name: u.name, department: u.department }, balances: balances_(u.id, year) };
    }),
  };
}

route_('GET', '/api/reports/summary', function (c) {
  requireRole_(c.user, 'manager', 'admin');
  return summary_(c.user, Number(c.query.year) || Number(today_().slice(0, 4)));
});

// ส่งออกรายงานเป็นแท็บใหม่ใน Google Sheet
route_('POST', '/api/reports/export', function (c) {
  requireRole_(c.user, 'manager', 'admin');
  const data = summary_(c.user, Number(c.body.year) || Number(today_().slice(0, 4)));
  const header = ['พนักงาน', 'แผนก'];
  data.types.forEach(function (t) { header.push(t.name + ' ใช้ไป', t.name + ' รออนุมัติ', t.name + ' คงเหลือ'); });
  const rows = [header].concat(data.rows.map(function (r) {
    const row = [r.user.name, r.user.department];
    r.balances.forEach(function (b) { row.push(b.used, b.pending, b.remaining); });
    return row;
  }));
  const ss = ss_();
  const name = 'รายงาน ' + (data.year + 543);
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear();
  sh.getRange(1, 1, rows.length, header.length).setValues(rows);
  sh.getRange(1, 1, 1, header.length).setFontWeight('bold');
  sh.setFrozenRows(1);
  return { url: ss.getUrl() + '#gid=' + sh.getSheetId(), name: name };
});

// ===== ผู้ดูแลระบบ =====
route_('GET', '/api/users', function (c) {
  requireRole_(c.user, 'admin', 'manager');
  return all_('Users').map(function (u) {
    const o = publicUser_(u);
    const m = u.manager_id ? find_('Users', u.manager_id) : null;
    o.manager_name = m ? m.name : null;
    return o;
  }).sort(function (a, b) {
    return (b.active - a.active) || a.department.localeCompare(b.department) || a.name.localeCompare(b.name);
  });
});

function userFields_(body, existing) {
  const name = str_(body.name, 200);
  const email = str_(body.email, 200).toLowerCase();
  const role = ROLES.indexOf(body.role) >= 0 ? body.role : (existing ? existing.role : 'employee');
  const department = str_(body.department, 100);
  const managerId = body.manager_id ? Number(body.manager_id) : null;
  if (!name) throw bad_('กรุณากรอกชื่อ');
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw bad_('อีเมลไม่ถูกต้อง');
  if (managerId !== null) {
    if (existing && managerId === existing.id) throw bad_('ไม่สามารถเป็นหัวหน้าของตัวเองได้');
    const m = find_('Users', managerId);
    if (!m || (m.role !== 'manager' && m.role !== 'admin')) throw bad_('หัวหน้างานต้องมีบทบาทเป็นหัวหน้าหรือผู้ดูแลระบบ');
  }
  const dup = all_('Users').some(function (u) { return u.email.toLowerCase() === email && (!existing || u.id !== existing.id); });
  if (dup) throw bad_('อีเมลนี้ถูกใช้แล้ว');
  return { name: name, email: email, role: role, department: department, manager_id: managerId };
}

route_('POST', '/api/users', function (c) {
  requireRole_(c.user, 'admin');
  const f = userFields_(c.body);
  const pw = String(c.body.password || '');
  if (pw.length < 8) throw bad_('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
  f.password_hash = hashPassword_(pw);
  f.active = 1;
  f.created_at = now_();
  return publicUser_(insert_('Users', f));
});

route_('PUT', '/api/users/:id', function (c) {
  requireRole_(c.user, 'admin');
  const existing = find_('Users', c.params.id);
  if (!existing) throw new HttpError_(404, 'ไม่พบผู้ใช้');
  const f = userFields_(c.body, existing);
  f.active = c.body.active === undefined ? existing.active : (c.body.active ? 1 : 0);
  if (existing.id === c.user.id && (f.role !== 'admin' || !f.active)) {
    throw bad_('ไม่สามารถลดสิทธิ์หรือปิดการใช้งานบัญชีของตัวเองได้');
  }
  if (c.body.password) {
    if (String(c.body.password).length < 8) throw bad_('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
    f.password_hash = hashPassword_(String(c.body.password));
  }
  return publicUser_(update_('Users', existing.id, f));
});

function typeFields_(body) {
  const name = str_(body.name, 100);
  const quota = Number(body.annual_quota);
  const color = /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : '#3b82f6';
  if (!name) throw bad_('กรุณากรอกชื่อประเภทการลา');
  if (!isFinite(quota) || quota < 0 || quota > 366) throw bad_('จำนวนวันต่อปีไม่ถูกต้อง');
  return { name: name, annual_quota: quota, color: color };
}

route_('POST', '/api/leave-types', function (c) {
  requireRole_(c.user, 'admin');
  const f = typeFields_(c.body);
  if (all_('LeaveTypes').some(function (t) { return t.name === f.name; })) throw bad_('มีประเภทการลานี้อยู่แล้ว');
  f.active = 1;
  return clean_(insert_('LeaveTypes', f));
});

route_('PUT', '/api/leave-types/:id', function (c) {
  requireRole_(c.user, 'admin');
  const f = typeFields_(c.body);
  if (all_('LeaveTypes').some(function (t) { return t.name === f.name && t.id !== c.params.id; })) {
    throw bad_('มีประเภทการลานี้อยู่แล้ว');
  }
  f.active = c.body.active === false ? 0 : 1;
  const t = update_('LeaveTypes', c.params.id, f);
  if (!t) throw new HttpError_(404, 'ไม่พบประเภทการลา');
  return clean_(t);
});

route_('POST', '/api/holidays', function (c) {
  requireRole_(c.user, 'admin');
  if (!isValidDate_(c.body.date)) throw bad_('รูปแบบวันที่ไม่ถูกต้อง');
  const name = str_(c.body.name, 200);
  if (!name) throw bad_('กรุณากรอกชื่อวันหยุด');
  if (all_('Holidays').some(function (h) { return h.date === c.body.date; })) throw bad_('มีวันหยุดในวันที่นี้อยู่แล้ว');
  return clean_(insert_('Holidays', { date: c.body.date, name: name }));
});

route_('DELETE', '/api/holidays/:id', function (c) {
  requireRole_(c.user, 'admin');
  remove_('Holidays', c.params.id);
  return { ok: true };
});
