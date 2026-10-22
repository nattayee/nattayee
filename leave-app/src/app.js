const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { hashPassword, verifyPassword } = require('./db');
const { isValidDate, countLeaveDays } = require('./days');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const ROLES = ['employee', 'manager', 'admin'];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (msg) => new HttpError(400, msg);

function createApp(db) {
  // ---------- helpers ----------
  const q = {
    one: (sql, ...p) => db.prepare(sql).get(...p),
    all: (sql, ...p) => db.prepare(sql).all(...p),
    run: (sql, ...p) => db.prepare(sql).run(...p),
  };

  function publicUser(u) {
    if (!u) return null;
    const { password_hash, ...rest } = u;
    return { ...rest, active: !!rest.active };
  }

  function holidaySet(start, end) {
    const rows = q.all('SELECT date FROM holidays WHERE date BETWEEN ? AND ?', start, end);
    return new Set(rows.map((r) => r.date));
  }

  function balances(userId, year) {
    const types = q.all('SELECT * FROM leave_types WHERE active = 1 ORDER BY id');
    const used = q.all(
      `SELECT leave_type_id, status, SUM(days) AS days FROM leave_requests
       WHERE user_id = ? AND substr(start_date, 1, 4) = ? AND status IN ('pending','approved')
       GROUP BY leave_type_id, status`,
      userId,
      String(year)
    );
    return types.map((t) => {
      const approved = used.find((u) => u.leave_type_id === t.id && u.status === 'approved')?.days || 0;
      const pending = used.find((u) => u.leave_type_id === t.id && u.status === 'pending')?.days || 0;
      return {
        leave_type_id: t.id,
        name: t.name,
        color: t.color,
        quota: t.annual_quota,
        used: approved,
        pending,
        remaining: t.annual_quota - approved - pending,
      };
    });
  }

  // Who may approve a request: the employee's direct manager, or any admin.
  function canDecide(user, request) {
    if (user.role === 'admin') return true;
    const owner = q.one('SELECT manager_id FROM users WHERE id = ?', request.user_id);
    return user.role === 'manager' && owner?.manager_id === user.id && request.user_id !== user.id;
  }

  const REQUEST_SELECT = `
    SELECT r.*, u.name AS user_name, u.department, t.name AS type_name, t.color AS type_color,
           a.name AS approver_name
    FROM leave_requests r
    JOIN users u ON u.id = r.user_id
    JOIN leave_types t ON t.id = r.leave_type_id
    LEFT JOIN users a ON a.id = r.approver_id`;

  function getSessionUser(req) {
    const cookie = req.headers.cookie || '';
    const m = cookie.match(/(?:^|;\s*)sid=([a-f0-9]{64})/);
    if (!m) return null;
    const s = q.one('SELECT * FROM sessions WHERE token = ?', m[1]);
    if (!s || s.expires_at < Date.now()) return null;
    const u = q.one('SELECT * FROM users WHERE id = ? AND active = 1', s.user_id);
    return u ? { ...u, token: s.token } : null;
  }

  function requireRole(user, ...roles) {
    if (!roles.includes(user.role)) throw new HttpError(403, 'ไม่มีสิทธิ์เข้าถึง');
  }

  function str(v, max = 500) {
    return typeof v === 'string' ? v.trim().slice(0, max) : '';
  }

  // ---------- routes ----------
  const routes = [];
  const route = (method, pattern, handler, { auth = true } = {}) => {
    const keys = [];
    const re = new RegExp(
      '^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '(\\d+)')) + '$'
    );
    routes.push({ method, re, keys, handler, auth });
  };

  route('POST', '/api/login', ({ body, res }) => {
    const email = str(body.email, 200);
    const u = q.one('SELECT * FROM users WHERE email = ? AND active = 1', email);
    if (!u || !verifyPassword(String(body.password || ''), u.password_hash)) {
      throw new HttpError(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }
    const token = crypto.randomBytes(32).toString('hex');
    q.run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
    q.run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', token, u.id, Date.now() + SESSION_TTL_MS);
    res.setHeader(
      'Set-Cookie',
      `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}` +
        (process.env.COOKIE_SECURE === '1' ? '; Secure' : '')
    );
    return { user: publicUser(u) };
  }, { auth: false });

  route('POST', '/api/logout', ({ user, res }) => {
    q.run('DELETE FROM sessions WHERE token = ?', user.token);
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return { ok: true };
  });

  route('GET', '/api/me', ({ user, query }) => {
    const year = Number(query.get('year')) || new Date().getFullYear();
    const pendingApprovals =
      user.role === 'employee'
        ? 0
        : q.all(`SELECT r.* FROM leave_requests r WHERE r.status = 'pending'`).filter((r) => canDecide(user, r)).length;
    const { token, ...u } = user;
    return { user: publicUser(u), year, balances: balances(user.id, year), pendingApprovals };
  });

  route('POST', '/api/me/password', ({ user, body }) => {
    if (!verifyPassword(String(body.current || ''), user.password_hash)) throw bad('รหัสผ่านปัจจุบันไม่ถูกต้อง');
    const pw = String(body.password || '');
    if (pw.length < 8) throw bad('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร');
    q.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(pw), user.id);
    q.run('DELETE FROM sessions WHERE user_id = ? AND token <> ?', user.id, user.token);
    return { ok: true };
  });

  route('GET', '/api/leave-types', ({ user }) => {
    const all = user.role === 'admin';
    return q.all(`SELECT * FROM leave_types ${all ? '' : 'WHERE active = 1'} ORDER BY id`).map((t) => ({
      ...t,
      active: !!t.active,
    }));
  });

  route('GET', '/api/holidays', ({ query }) => {
    const year = String(Number(query.get('year')) || new Date().getFullYear());
    return q.all('SELECT * FROM holidays WHERE substr(date, 1, 4) = ? ORDER BY date', year);
  });

  // Preview how many days a request would use, without saving it.
  route('POST', '/api/requests/preview', ({ body }) => {
    const { start, end, half } = validateDates(body);
    return { days: countLeaveDays(start, end, half, holidaySet(start, end)) };
  });

  function validateDates(body) {
    const start = body.start_date;
    const end = body.end_date || body.start_date;
    const half = ['am', 'pm'].includes(body.half_day) ? body.half_day : '';
    if (!isValidDate(start) || !isValidDate(end)) throw bad('รูปแบบวันที่ไม่ถูกต้อง');
    if (end < start) throw bad('วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น');
    if (start.slice(0, 4) !== end.slice(0, 4)) throw bad('ใบลาหนึ่งใบต้องอยู่ในปีเดียวกัน กรุณาแยกเป็นสองใบ');
    if (half && start !== end) throw bad('ลาครึ่งวันต้องเป็นวันเดียว');
    return { start, end, half };
  }

  route('GET', '/api/requests/mine', ({ user, query }) => {
    const year = String(Number(query.get('year')) || new Date().getFullYear());
    return q.all(
      `${REQUEST_SELECT} WHERE r.user_id = ? AND substr(r.start_date, 1, 4) = ? ORDER BY r.start_date DESC, r.id DESC`,
      user.id,
      year
    );
  });

  route('POST', '/api/requests', ({ user, body }) => {
    const { start, end, half } = validateDates(body);
    const type = q.one('SELECT * FROM leave_types WHERE id = ? AND active = 1', Number(body.leave_type_id));
    if (!type) throw bad('กรุณาเลือกประเภทการลา');
    const days = countLeaveDays(start, end, half, holidaySet(start, end));
    if (days <= 0) throw bad('ช่วงวันที่เลือกไม่มีวันทำงาน (เป็นวันหยุดทั้งหมด)');

    const overlap = q.one(
      `SELECT id FROM leave_requests WHERE user_id = ? AND status IN ('pending','approved')
       AND start_date <= ? AND end_date >= ?
       AND NOT (half_day <> '' AND ? <> '' AND half_day <> ?)`,
      user.id, end, start, half, half
    );
    if (overlap) throw bad('มีใบลาที่ทับซ้อนกับช่วงวันที่นี้อยู่แล้ว');

    const bal = balances(user.id, Number(start.slice(0, 4))).find((b) => b.leave_type_id === type.id);
    if (bal && days > bal.remaining) {
      throw bad(`วัน${type.name}คงเหลือไม่พอ (เหลือ ${bal.remaining} วัน ขอ ${days} วัน)`);
    }

    const r = q.run(
      `INSERT INTO leave_requests (user_id, leave_type_id, start_date, end_date, half_day, days, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      user.id, type.id, start, end, half, days, str(body.reason, 1000)
    );
    return q.one(`${REQUEST_SELECT} WHERE r.id = ?`, r.lastInsertRowid);
  });

  route('POST', '/api/requests/:id/cancel', ({ user, params }) => {
    const r = q.one('SELECT * FROM leave_requests WHERE id = ?', params.id);
    if (!r || r.user_id !== user.id) throw new HttpError(404, 'ไม่พบใบลา');
    const today = new Date().toISOString().slice(0, 10);
    if (r.status === 'approved' && r.start_date <= today) throw bad('ไม่สามารถยกเลิกใบลาที่เริ่มไปแล้ว');
    if (!['pending', 'approved'].includes(r.status)) throw bad('ใบลานี้ถูกดำเนินการไปแล้ว');
    q.run(`UPDATE leave_requests SET status = 'cancelled' WHERE id = ?`, r.id);
    return q.one(`${REQUEST_SELECT} WHERE r.id = ?`, r.id);
  });

  route('GET', '/api/approvals', ({ user, query }) => {
    requireRole(user, 'manager', 'admin');
    const status = ['pending', 'approved', 'rejected', 'cancelled'].includes(query.get('status'))
      ? query.get('status')
      : 'pending';
    return q
      .all(`${REQUEST_SELECT} WHERE r.status = ? ORDER BY r.start_date ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 500`, status)
      .filter((r) => canDecide(user, r));
  });

  route('POST', '/api/requests/:id/decide', ({ user, params, body }) => {
    requireRole(user, 'manager', 'admin');
    const r = q.one('SELECT * FROM leave_requests WHERE id = ?', params.id);
    if (!r || !canDecide(user, r)) throw new HttpError(404, 'ไม่พบใบลา');
    if (r.status !== 'pending') throw bad('ใบลานี้ถูกดำเนินการไปแล้ว');
    const action = body.action;
    if (!['approve', 'reject'].includes(action)) throw bad('การดำเนินการไม่ถูกต้อง');
    q.run(
      `UPDATE leave_requests SET status = ?, approver_id = ?, decision_note = ?, decided_at = datetime('now') WHERE id = ?`,
      action === 'approve' ? 'approved' : 'rejected', user.id, str(body.note, 500), r.id
    );
    return q.one(`${REQUEST_SELECT} WHERE r.id = ?`, r.id);
  });

  // Team calendar: every signed-in user can see who is off in a month.
  route('GET', '/api/calendar', ({ query }) => {
    const month = /^\d{4}-\d{2}$/.test(query.get('month') || '')
      ? query.get('month')
      : new Date().toISOString().slice(0, 7);
    const first = `${month}-01`;
    const last = `${month}-31`;
    const requests = q.all(
      `SELECT r.id, r.user_id, r.start_date, r.end_date, r.half_day, r.status, u.name AS user_name,
              u.department, t.name AS type_name, t.color AS type_color
       FROM leave_requests r JOIN users u ON u.id = r.user_id JOIN leave_types t ON t.id = r.leave_type_id
       WHERE r.status IN ('pending','approved') AND r.start_date <= ? AND r.end_date >= ?
       ORDER BY r.start_date`,
      last, first
    );
    const holidays = q.all('SELECT * FROM holidays WHERE date BETWEEN ? AND ? ORDER BY date', first, last);
    return { month, requests, holidays };
  });

  // Usage summary per employee. Managers see their direct reports, admins everyone.
  route('GET', '/api/reports/summary', ({ user, query }) => {
    requireRole(user, 'manager', 'admin');
    const year = Number(query.get('year')) || new Date().getFullYear();
    const users =
      user.role === 'admin'
        ? q.all('SELECT * FROM users WHERE active = 1 ORDER BY department, name')
        : q.all('SELECT * FROM users WHERE active = 1 AND manager_id = ? ORDER BY name', user.id);
    return {
      year,
      types: q.all('SELECT id, name, color, annual_quota FROM leave_types WHERE active = 1 ORDER BY id'),
      rows: users.map((u) => ({
        user: { id: u.id, name: u.name, department: u.department },
        balances: balances(u.id, year),
      })),
    };
  });

  // ---------- admin ----------
  route('GET', '/api/users', ({ user }) => {
    requireRole(user, 'admin', 'manager');
    return q
      .all(
        `SELECT u.*, m.name AS manager_name FROM users u LEFT JOIN users m ON m.id = u.manager_id
         ORDER BY u.active DESC, u.department, u.name`
      )
      .map(publicUser);
  });

  function userFields(body, existing) {
    const name = str(body.name, 200);
    const email = str(body.email, 200).toLowerCase();
    const role = ROLES.includes(body.role) ? body.role : existing?.role || 'employee';
    const department = str(body.department, 100);
    const managerId = body.manager_id ? Number(body.manager_id) : null;
    if (!name) throw bad('กรุณากรอกชื่อ');
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw bad('อีเมลไม่ถูกต้อง');
    if (managerId !== null) {
      if (existing && managerId === existing.id) throw bad('ไม่สามารถเป็นหัวหน้าของตัวเองได้');
      const m = q.one(`SELECT id FROM users WHERE id = ? AND role IN ('manager','admin')`, managerId);
      if (!m) throw bad('หัวหน้างานต้องมีบทบาทเป็นหัวหน้าหรือผู้ดูแลระบบ');
    }
    const dup = q.one('SELECT id FROM users WHERE email = ? AND id <> ?', email, existing?.id || 0);
    if (dup) throw bad('อีเมลนี้ถูกใช้แล้ว');
    return { name, email, role, department, managerId };
  }

  route('POST', '/api/users', ({ user, body }) => {
    requireRole(user, 'admin');
    const f = userFields(body);
    const pw = String(body.password || '');
    if (pw.length < 8) throw bad('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
    const r = q.run(
      'INSERT INTO users (email, name, password_hash, role, department, manager_id) VALUES (?, ?, ?, ?, ?, ?)',
      f.email, f.name, hashPassword(pw), f.role, f.department, f.managerId
    );
    return publicUser(q.one('SELECT * FROM users WHERE id = ?', r.lastInsertRowid));
  });

  route('PUT', '/api/users/:id', ({ user, params, body }) => {
    requireRole(user, 'admin');
    const existing = q.one('SELECT * FROM users WHERE id = ?', params.id);
    if (!existing) throw new HttpError(404, 'ไม่พบผู้ใช้');
    const f = userFields(body, existing);
    const active = body.active === undefined ? existing.active : body.active ? 1 : 0;
    if (existing.id === user.id && (f.role !== 'admin' || !active)) {
      throw bad('ไม่สามารถลดสิทธิ์หรือปิดการใช้งานบัญชีของตัวเองได้');
    }
    q.run(
      'UPDATE users SET email = ?, name = ?, role = ?, department = ?, manager_id = ?, active = ? WHERE id = ?',
      f.email, f.name, f.role, f.department, f.managerId, active, existing.id
    );
    if (body.password) {
      if (String(body.password).length < 8) throw bad('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
      q.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(String(body.password)), existing.id);
    }
    if (!active || body.password) q.run('DELETE FROM sessions WHERE user_id = ?', existing.id);
    return publicUser(q.one('SELECT * FROM users WHERE id = ?', existing.id));
  });

  function typeFields(body) {
    const name = str(body.name, 100);
    const quota = Number(body.annual_quota);
    const color = /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : '#3b82f6';
    if (!name) throw bad('กรุณากรอกชื่อประเภทการลา');
    if (!Number.isFinite(quota) || quota < 0 || quota > 366) throw bad('จำนวนวันต่อปีไม่ถูกต้อง');
    return { name, quota, color };
  }

  route('POST', '/api/leave-types', ({ user, body }) => {
    requireRole(user, 'admin');
    const f = typeFields(body);
    if (q.one('SELECT id FROM leave_types WHERE name = ?', f.name)) throw bad('มีประเภทการลานี้อยู่แล้ว');
    const r = q.run('INSERT INTO leave_types (name, annual_quota, color) VALUES (?, ?, ?)', f.name, f.quota, f.color);
    return q.one('SELECT * FROM leave_types WHERE id = ?', r.lastInsertRowid);
  });

  route('PUT', '/api/leave-types/:id', ({ user, params, body }) => {
    requireRole(user, 'admin');
    const f = typeFields(body);
    if (q.one('SELECT id FROM leave_types WHERE name = ? AND id <> ?', f.name, params.id)) {
      throw bad('มีประเภทการลานี้อยู่แล้ว');
    }
    const r = q.run(
      'UPDATE leave_types SET name = ?, annual_quota = ?, color = ?, active = ? WHERE id = ?',
      f.name, f.quota, f.color, body.active === false ? 0 : 1, params.id
    );
    if (!r.changes) throw new HttpError(404, 'ไม่พบประเภทการลา');
    return q.one('SELECT * FROM leave_types WHERE id = ?', params.id);
  });

  route('POST', '/api/holidays', ({ user, body }) => {
    requireRole(user, 'admin');
    if (!isValidDate(body.date)) throw bad('รูปแบบวันที่ไม่ถูกต้อง');
    const name = str(body.name, 200);
    if (!name) throw bad('กรุณากรอกชื่อวันหยุด');
    if (q.one('SELECT id FROM holidays WHERE date = ?', body.date)) throw bad('มีวันหยุดในวันที่นี้อยู่แล้ว');
    const r = q.run('INSERT INTO holidays (date, name) VALUES (?, ?)', body.date, name);
    return q.one('SELECT * FROM holidays WHERE id = ?', r.lastInsertRowid);
  });

  route('DELETE', '/api/holidays/:id', ({ user, params }) => {
    requireRole(user, 'admin');
    q.run('DELETE FROM holidays WHERE id = ?', params.id);
    return { ok: true };
  });

  // ---------- http plumbing ----------
  function send(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > 100_000) {
          reject(new HttpError(413, 'ข้อมูลมีขนาดใหญ่เกินไป'));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => {
        if (!chunks.length) return resolve({});
        try {
          const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(v && typeof v === 'object' ? v : {});
        } catch {
          reject(bad('รูปแบบข้อมูลไม่ถูกต้อง'));
        }
      });
      req.on('error', reject);
    });
  }

  function serveStatic(req, res, pathname) {
    const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(data);
    });
  }

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();
      return serveStatic(req, res, url.pathname);
    }
    try {
      const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
      if (!r) throw new HttpError(404, 'ไม่พบ API');
      if (req.method !== 'GET' && !(req.headers['content-type'] || '').startsWith('application/json')) {
        // Blocks cross-site form posts (CSRF): browsers can't send JSON cross-origin without CORS.
        throw new HttpError(415, 'ต้องส่งข้อมูลเป็น JSON');
      }
      const user = getSessionUser(req);
      if (r.auth && !user) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ');
      const m = url.pathname.match(r.re);
      const params = Object.fromEntries(r.keys.map((k, i) => [k, Number(m[i + 1])]));
      const body = req.method === 'GET' ? {} : await readBody(req);
      const result = await r.handler({ req, res, user, body, params, query: url.searchParams });
      send(res, 200, result);
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message });
      console.error(err);
      send(res, 500, { error: 'เกิดข้อผิดพลาดภายในระบบ' });
    }
  };
}

module.exports = { createApp };
