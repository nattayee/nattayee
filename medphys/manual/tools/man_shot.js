// เปิดคู่มือ (โฟลเดอร์ manual) แล้วถ่ายภาพหน้า: node man_shot.js <manualDir> <outDir> [hash …]  (hash ว่าง = หน้าแรก · "case" = หน้าแรกแท็บตามกรณี)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };
(async () => {
  const dir = path.resolve(process.argv[2]), out = process.argv[3], pages = process.argv.slice(4); fs.mkdirSync(out, { recursive: true });
  const srv = http.createServer((q, r) => {
    const f = path.join(dir, decodeURIComponent(q.url.split('?')[0].replace(/^\/+/, '')) || 'index.html');
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end('no'); }
    r.setHeader('content-type', TYPES[path.extname(f)] || 'application/octet-stream'); r.end(fs.readFileSync(f));
  }).listen(0);
  const url = `http://127.0.0.1:${srv.address().port}/index.html`, b = await chromium.launch(), errs = [];
  const p = await b.newPage({ viewport: { width: +process.env.W || 1200, height: 900 }, deviceScaleFactor: 1 });
  p.on('pageerror', e => errs.push(String(e)));
  p.on('requestfailed', q => { if (!/fonts\./.test(q.url())) errs.push('REQ ' + q.url()); });
  for (const h of pages.length ? pages : ['']) {
    await p.goto(url + (h && h !== 'case' ? '#' + h : '')); await p.waitForSelector('#view h1'); await p.waitForTimeout(300);
    if (h === 'case') { await p.click('[data-tab="case"]'); await p.waitForTimeout(200); }
    // โหลดภาพ lazy ให้ครบก่อนถ่าย
    await p.evaluate(async () => { for (const i of document.images) { i.loading = 'eager'; if (!i.complete) await new Promise(r => { i.onload = i.onerror = r; }); } });
    const bad = await p.evaluate(() => [...document.images].filter(i => !i.naturalWidth).map(i => i.getAttribute('src')));
    if (bad.length) errs.push('IMG ' + bad.join(','));
    await p.screenshot({ path: path.join(out, (h || 'home') + '.png'), fullPage: true });
  }
  console.log('errs', errs.length, errs.slice(0, 5).join(' | '));
  await b.close(); srv.close();
})();
