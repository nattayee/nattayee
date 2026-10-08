'use strict';
// เว็บทะเบียนหนังสือส่ง — เซิร์ฟเวอร์ Node.js ไม่ต้องติดตั้งแพ็กเกจเพิ่ม
//   node server.js            เปิดที่ http://localhost:3000
//   PORT=8080 node server.js  เปลี่ยนพอร์ต

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store, InputError } = require('./lib/store');
const { readXlsx, writeXlsx } = require('./lib/xlsx');
const { importWorkbook } = require('./lib/importer');

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function currentBEYear() {
  return new Date().getFullYear() + 543;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function json(res, status, data) {
  send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8' });
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new InputError('ไฟล์หรือข้อมูลมีขนาดใหญ่เกินไป'));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req, 1024 * 1024);
  try {
    return JSON.parse(buf.toString('utf8') || '{}');
  } catch {
    throw new InputError('ข้อมูลที่ส่งมาไม่ใช่ JSON');
  }
}

function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch {
    return send(res, 400, 'Bad request');
  }
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
    send(res, 200, data, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  });
}

function summarize(years) {
  return Object.entries(years)
    .map(([year, records]) => ({ year: Number(year), count: records.length }))
    .sort((a, b) => b.year - a.year);
}

function createServer(store) {
  async function handleApi(req, res, url) {
    const { pathname } = url;
    const method = req.method;

    if (method === 'GET' && pathname === '/api/state') {
      return json(res, 200, store.state(currentBEYear()));
    }

    if (method === 'POST' && pathname === '/api/records') {
      return json(res, 201, store.create(await readJson(req)));
    }

    const recMatch = /^\/api\/records\/([\w-]+)$/.exec(pathname);
    if (recMatch && method === 'PUT') return json(res, 200, store.update(recMatch[1], await readJson(req)));
    if (recMatch && method === 'DELETE') return json(res, 200, store.remove(recMatch[1]));

    const counterMatch = /^\/api\/counters\/(\d{4})$/.exec(pathname);
    if (counterMatch && method === 'PUT') {
      const { next } = await readJson(req);
      return json(res, 200, { nextNo: store.setCounter(Number(counterMatch[1]), Number(next)) });
    }

    if (method === 'POST' && pathname === '/api/import') {
      const buf = await readBody(req, 20 * 1024 * 1024);
      let parsed;
      try {
        parsed = importWorkbook(readXlsx(buf));
      } catch (err) {
        throw new InputError(`อ่านไฟล์ไม่ได้: ${err.message}`);
      }
      const years = summarize(parsed.years);
      if (!years.length) throw new InputError('ไม่พบชีตที่ตั้งชื่อเป็นปี พ.ศ. (เช่น 2569) ในไฟล์นี้');

      if (url.searchParams.get('dryRun') === '1') {
        const existing = years.map(y => ({ ...y, existing: store.recordsOf(y.year).length }));
        return json(res, 200, { years: existing, warnings: parsed.warnings });
      }
      store.replaceYears(parsed.years);
      const result = years.map(y => ({ ...y, nextNo: store.nextNo(y.year) }));
      return json(res, 200, { years: result, warnings: parsed.warnings });
    }

    if (method === 'GET' && pathname === '/api/export.xlsx') {
      const d = new Date();
      const stamp = `${d.getFullYear() + 543}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      const name = `ทะเบียนหนังสือส่ง-${stamp}.xlsx`;
      return send(res, 200, writeXlsx(store.exportSheets()), {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="registry-${stamp}.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      });
    }

    return json(res, 404, { error: 'ไม่พบ API นี้' });
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      return serveStatic(req, res, url.pathname);
    } catch (err) {
      if (err instanceof InputError) return json(res, 400, { error: err.message });
      console.error(err);
      return json(res, 500, { error: 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์' });
    }
  });
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(a => a && a.family === 'IPv4' && !a.internal)
    .map(a => a.address);
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';
  const dataFile = process.env.DATA_FILE || path.join(__dirname, 'data', 'registry.json');
  const store = new Store(dataFile);
  createServer(store).listen(port, host, () => {
    console.log('ทะเบียนหนังสือส่ง พร้อมใช้งาน');
    console.log(`  เครื่องนี้:      http://localhost:${port}`);
    for (const ip of lanAddresses()) console.log(`  เครื่องอื่นในวง LAN: http://${ip}:${port}`);
    console.log(`  ไฟล์ข้อมูล:     ${dataFile}`);
  });
}

module.exports = { createServer };
