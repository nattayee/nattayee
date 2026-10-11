'use strict';
// เปิดดูหน้าเว็บเวอร์ชัน Apps Script ในเครื่อง โดยใช้ Google Sheet จำลองจากไฟล์ Excel
//   node scripts/preview-apps-script.js [ทะเบียนหนังสือ.xlsx]
// ข้อมูลอยู่ในหน่วยความจำเท่านั้น ปิดแล้วหายไป (ไม่เขียนกลับลงไฟล์ Excel)

const fs = require('fs');
const http = require('http');
const path = require('path');
const { readXlsx } = require('../lib/xlsx');
const { loadAppsScript } = require('./apps-script-mock');

const file = process.argv[2];
const sheets = file
  ? Object.fromEntries(readXlsx(fs.readFileSync(file)).map(s => [s.name, s.rows.map(r => r.map(v => v ?? ''))]))
  : {};
const { api } = loadAppsScript(sheets);

// google.script.run จำลอง: ส่งคำขอมาที่ /rpc/<ชื่อฟังก์ชัน>
const SHIM = `<script>
window.google = { script: { get run() {
  const h = {};
  const runner = new Proxy({}, { get(_, name) {
    if (name === 'withSuccessHandler') return fn => { h.ok = fn; return runner; };
    if (name === 'withFailureHandler') return fn => { h.fail = fn; return runner; };
    return (...args) => fetch('rpc/' + name, { method: 'POST', body: JSON.stringify(args) })
      .then(r => r.json())
      .then(d => (d.error ? h.fail && h.fail(new Error(d.error)) : h.ok && h.ok(d.result)));
  } });
  return runner;
} } };
</script>`;

const server = http.createServer((req, res) => {
  const rpc = /^\/rpc\/(\w+)$/.exec(req.url);
  if (req.method === 'POST' && rpc) {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      setTimeout(() => {
        let out;
        try {
          if (!['getState', 'createRecord', 'updateRecord', 'deleteRecord', 'setNextNo'].includes(rpc[1])) throw new Error('ไม่มีฟังก์ชันนี้');
          out = { result: api[rpc[1]](...JSON.parse(body || '[]')) };
        } catch (err) {
          out = { error: err.message };
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(out));
      }, 300); // หน่วงเวลาให้ใกล้เคียงการเรียก Apps Script จริง
    });
    return;
  }
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Index.html'), 'utf8').replace('<head>', `<head>\n${SHIM}`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  res.writeHead(404);
  res.end();
});

const port = Number(process.env.PORT) || 3200;
server.listen(port, '127.0.0.1', () => {
  console.log(`ตัวอย่างหน้าเว็บ Apps Script: http://localhost:${port}`);
  console.log(file ? `ข้อมูลจำลองจาก ${file}` : 'ยังไม่มีข้อมูล (ใส่ชื่อไฟล์ .xlsx ต่อท้ายคำสั่งเพื่อใช้ข้อมูลจริง)');
});
