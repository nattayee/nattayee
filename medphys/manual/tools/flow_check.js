// ตรวจภาพรวมทางเดินผู้ป่วย: ข้อความล้นกล่องไหม · ป้ายทับกล่อง / ทับเส้นไหม · ปลายลูกศรห่างกล่องเท่าไร · ถ่ายภาพ 2 โหมดสี
// ใช้: node flow_check.js <manualDir> <outDir> [nav.json]
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
(async () => {
  const [MAN, OUT, NAVF] = process.argv.slice(2);
  fs.mkdirSync(OUT, { recursive: true });
  const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp' };
  const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]), f = path.join(MAN, u === '/' ? 'index.html' : u); if (!fs.existsSync(f)) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', TYPES[path.extname(f)] || 'application/octet-stream'); r.end(fs.readFileSync(f)); }).listen(0);
  const nav = NAVF ? Object.fromEntries(JSON.parse(fs.readFileSync(NAVF, 'utf8')).filter(x => x.label).map(x => [x.view, x.label])) : null;
  const url = `http://127.0.0.1:${srv.address().port}/` + (nav ? '?nav=' + encodeURIComponent(JSON.stringify(nav)) : '');
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1' } : undefined });
  for (const [scheme, w] of [['light', 1200], ['dark', 1200], ['light', 1000]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme, ignoreHTTPSErrors: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => console.log('pageerror', String(e)));
    await p.goto(url); await p.waitForSelector('.flow svg'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
    if (scheme === 'light' && w === 1200) {
      const r = await p.evaluate(() => {
        const svg = document.querySelector('.flow svg'), out = { over: [], lblBox: [], lblLine: [], tips: [], boxes: 0, arrows: 0 };
        const boxes = [...svg.querySelectorAll('a')].map(a => { const r = a.querySelector('rect'), b = r.getBBox(); out.boxes++;
          for (const t of a.querySelectorAll('text')) { const tb = t.getBBox(); if (tb.x + tb.width > b.x + b.width - 8) out.over.push(`${t.textContent} +${Math.round(tb.x + tb.width - (b.x + b.width - 8))}`); }
          return b; });
        const hit = (a, b, pad) => a.x < b.x + b.width + pad && a.x + a.width > b.x - pad && a.y < b.y + b.height + pad && a.y + a.height > b.y - pad;
        const paths = [...svg.querySelectorAll('path.ln')];
        // จุดบนเส้นทุก 2px
        const pts = paths.map(pa => { const n = pa.getTotalLength(), a = []; for (let i = 0; i <= n; i += 2) { const q = pa.getPointAtLength(i); a.push([q.x, q.y]); } const e = pa.getPointAtLength(n); a.push([e.x, e.y]); return a; });
        for (const t of svg.querySelectorAll('text.lbl')) { const tb = t.getBBox();
          for (const bx of boxes) if (hit(tb, bx, 2)) out.lblBox.push(t.textContent);
          if (pts.some(a => a.some(([x, y]) => x > tb.x - 2 && x < tb.x + tb.width + 2 && y > tb.y - 1 && y < tb.y + tb.height + 1))) out.lblLine.push(t.textContent); }
        // ปลายหัวลูกศร (ปลายเส้น + 6.6px ตามทิศ) ห่างกล่องปลายทางเท่าไร · ต้นเส้นห่างกล่องต้นทางเท่าไร
        for (const pa of paths) { out.arrows++; const n = pa.getTotalLength(), e = pa.getPointAtLength(n), e0 = pa.getPointAtLength(n - 1), s = pa.getPointAtLength(0);
          const tip = { x: e.x + (e.x - e0.x) * 6.6, y: e.y + (e.y - e0.y) * 6.6 };
          const dist = (q, bx) => Math.max(bx.x - q.x, q.x - (bx.x + bx.width), bx.y - q.y, q.y - (bx.y + bx.height));
          const dt = Math.min(...boxes.map(bx => dist(tip, bx))), ds = Math.min(...boxes.map(bx => dist(s, bx)));
          out.tips.push([Math.round(dt * 10) / 10, Math.round(ds * 10) / 10, Math.round(n)]); }
        return out;
      });
      console.log('boxes', r.boxes, 'arrows', r.arrows);
      console.log('text overflow (px beyond 8px padding):', JSON.stringify(r.over));
      console.log('labels touching a box:', JSON.stringify(r.lblBox), '· labels crossed by a line:', JSON.stringify(r.lblLine));
      const tips = r.tips.map(t => t[0]), starts = r.tips.map(t => t[1]), lens = r.tips.map(t => t[2]);
      console.log('tip gap to box min/max', Math.min(...tips), Math.max(...tips), '· start gap min/max', Math.min(...starts), Math.max(...starts), '· shortest shaft', Math.min(...lens));
    }
    const el = await p.$('.flow svg');
    await el.screenshot({ path: path.join(OUT, `flow-${scheme}-${w}.png`) });
    await ctx.close();
  }
  await b.close(); srv.close();
})().catch(e => { console.log('ERR', e && e.stack || e); process.exit(1); });
