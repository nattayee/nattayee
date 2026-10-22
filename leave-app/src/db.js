const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('employee','manager','admin')),
  department TEXT NOT NULL DEFAULT '',
  manager_id INTEGER REFERENCES users(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS leave_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  annual_quota REAL NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  leave_type_id INTEGER NOT NULL REFERENCES leave_types(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  half_day TEXT NOT NULL DEFAULT '' CHECK (half_day IN ('','am','pm')),
  days REAL NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  approver_id INTEGER REFERENCES users(id),
  decision_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_requests_user ON leave_requests(user_id, start_date);
CREATE INDEX IF NOT EXISTS idx_requests_dates ON leave_requests(start_date, end_date);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);
`;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [algo, saltHex, hashHex] = String(stored).split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

const DEFAULT_LEAVE_TYPES = [
  ['ลาป่วย', 30, '#ef4444'],
  ['ลากิจ', 6, '#f59e0b'],
  ['ลาพักร้อน', 10, '#10b981'],
  ['ลาคลอด', 98, '#ec4899'],
  ['ลาบวช', 15, '#8b5cf6'],
];

// Fixed-date Thai public holidays. Lunar holidays (Makha Bucha, Visakha
// Bucha, ...) and substitution days change every year, so the admin adds them.
const FIXED_HOLIDAYS = [
  ['01-01', 'วันขึ้นปีใหม่'],
  ['04-06', 'วันจักรี'],
  ['04-13', 'วันสงกรานต์'],
  ['04-14', 'วันสงกรานต์'],
  ['04-15', 'วันสงกรานต์'],
  ['05-01', 'วันแรงงานแห่งชาติ'],
  ['05-04', 'วันฉัตรมงคล'],
  ['06-03', 'วันเฉลิมพระชนมพรรษาสมเด็จพระราชินี'],
  ['07-28', 'วันเฉลิมพระชนมพรรษา ร.10'],
  ['08-12', 'วันแม่แห่งชาติ'],
  ['10-13', 'วันนวมินทรมหาราช'],
  ['10-23', 'วันปิยมหาราช'],
  ['12-05', 'วันพ่อแห่งชาติ'],
  ['12-10', 'วันรัฐธรรมนูญ'],
  ['12-31', 'วันสิ้นปี'],
];

function seed(db, { demoUsers = true } = {}) {
  const hasTypes = db.prepare('SELECT COUNT(*) AS n FROM leave_types').get().n > 0;
  if (!hasTypes) {
    const ins = db.prepare('INSERT INTO leave_types (name, annual_quota, color) VALUES (?, ?, ?)');
    for (const t of DEFAULT_LEAVE_TYPES) ins.run(...t);
  }

  const hasHolidays = db.prepare('SELECT COUNT(*) AS n FROM holidays').get().n > 0;
  if (!hasHolidays) {
    const ins = db.prepare('INSERT OR IGNORE INTO holidays (date, name) VALUES (?, ?)');
    const year = new Date().getUTCFullYear();
    for (const y of [year, year + 1]) {
      for (const [md, name] of FIXED_HOLIDAYS) ins.run(`${y}-${md}`, name);
    }
  }

  const hasUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0;
  if (!hasUsers) {
    const ins = db.prepare(
      'INSERT INTO users (email, name, password_hash, role, department, manager_id) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin1234';
    const adminId = ins.run('admin@example.com', 'ผู้ดูแลระบบ', hashPassword(adminPassword), 'admin', 'HR', null)
      .lastInsertRowid;
    if (demoUsers) {
      const pw = hashPassword('password');
      const mgrId = ins.run('manager@example.com', 'สมชาย หัวหน้า', pw, 'manager', 'IT', adminId).lastInsertRowid;
      ins.run('somsri@example.com', 'สมศรี ใจดี', pw, 'employee', 'IT', mgrId);
      ins.run('somsak@example.com', 'สมศักดิ์ ขยัน', pw, 'employee', 'IT', mgrId);
    }
  }
}

function openDb(file = 'data.db', options = {}) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  seed(db, options);
  return db;
}

module.exports = { openDb, hashPassword, verifyPassword };
