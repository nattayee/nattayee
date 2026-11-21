// 21 พ.ย. (.3 · โหมดตัวอย่าง): ไอคอน "คู่มือ" แถวบน เปิดคู่มือในหน้าต่างของ Hub (iframe · srcdoc)
// โหลดจากโฟลเดอร์ manual ข้างหน้าเว็บ หรือ GitHub (จำลอง) · ชื่อแถบตามที่แอดมินตั้ง · การ์ดของตำแหน่งผู้ใช้ขึ้นก่อน · โหมดสี · Esc · เต็มจอ · แท็บใหม่ · โหลดไม่ได้
// ใช้: node r37_manual.js <index.html> [โฟลเดอร์ manual]   (ไม่ระบุ = โฟลเดอร์ manual ข้างไฟล์หน้าเว็บ หรือของ repo)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ok = (c, m) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + m); if (!c) process.exitCode = 1; };
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp' };
(async () => {
  const htmlPath = process.argv[2];
  const MAN = [process.argv[3], path.join(path.dirname(htmlPath), 'manual'), '/home/user/nattayee/medphys/manual'].filter(Boolean).find(d => fs.existsSync(path.join(d, 'guides.json')));
  const flag = { local: 'ok' };   // ok | 404 | old (ตัวแสดงรุ่นเก่าที่ฝังไม่ได้)
  const hits = { local: 0, gh: 0 };
  const file = rel => { const f = path.join(MAN, rel); return f.startsWith(MAN) && fs.existsSync(f) && fs.statSync(f).isFile() ? f : null; };
  const srv = http.createServer((q, r) => {
    const u = decodeURIComponent(q.url.split('?')[0]);
    if (u.startsWith('/manual/')) {
      hits.local++;
      const f = file(u.slice(8));
      if (flag.local === '404' || !f) { r.statusCode = 404; return r.end('not found'); }
      if (flag.local === 'old' && u === '/manual/index.html') { r.setHeader('content-type', TYPES['.html']); return r.end('<!doctype html><html><head></head><body>old viewer</body></html>'); }
      r.setHeader('content-type', TYPES[path.extname(f)] || 'application/octet-stream');
      return r.end(fs.readFileSync(f));
    }
    r.setHeader('content-type', TYPES['.html']); r.end(fs.readFileSync(htmlPath));
  }).listen(0);
  const url = `http://127.0.0.1:${srv.address().port}/`, b = await chromium.launch(), errs = [];
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, timezoneId: 'Asia/Bangkok', colorScheme: 'light' });
  const gh = { on: false };
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  // GitHub (จำลอง): ไฟล์ข้อความส่งเป็น text/plain เหมือนของจริง · ภาพเป็น image/webp · อนุญาตทุกต้นทาง
  await ctx.route(/^https:\/\/raw\.githubusercontent\.com\//, r => {
    const m = /\/medphys\/manual\/(.+)$/.exec(decodeURIComponent(r.request().url().split('?')[0])), f = m && file(m[1]);
    hits.gh++;
    if (!gh.on || !f) return r.abort();
    r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': path.extname(f) === '.webp' ? 'image/webp' : 'text/plain; charset=utf-8' }, body: fs.readFileSync(f) });
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  p.on('dialog', d => d.accept());
  await p.addInitScript(() => { if (!localStorage.getItem('medphys-dispatch:pin:admin')) localStorage.setItem('medphys-dispatch:pin:admin', '1c6d3vt'); });
  await p.goto(url); await p.waitForSelector('.nav'); await p.waitForTimeout(500);
  const click = s => p.evaluate(x => { const e = document.querySelector(x); if (!e) throw new Error('no ' + x); e.click(); }, s);
  const go = async v => { await p.evaluate(v => (document.querySelector(`.nav [data-view="${v}"]`) || document.querySelector(`[data-view="${v}"]`)).click(), v); await p.waitForTimeout(350); };
  const fr = () => p.frames().find(f => f !== p.mainFrame() && f.url() === 'about:srcdoc');
  const note = () => p.evaluate(() => { const n = document.querySelector('#man-note'); return { t: n.textContent, hidden: n.hidden, err: n.classList.contains('err') }; });
  const openMan = async () => { await click('#man-btn'); await p.waitForTimeout(150); };
  const ready = async () => { await p.waitForFunction(() => document.querySelector('#man-note').hidden && !document.querySelector('#man-frame').hidden, null, { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(250); return fr(); };
  const J = x => JSON.stringify(x);

  // ---------- 1) ปุ่มในแถวไอคอน ----------
  const btn = await p.evaluate(() => {
    const kids = [...document.querySelector('.top-right').children], ix = s => kids.indexOf(document.querySelector(s)), m = document.querySelector('#man-btn');
    return { vis: m.getClientRects().length > 0, hidden: m.hidden, man: ix('#man-btn'), flow: ix('#flow-btn'), trash: ix('#trash-btn'), nav: kids.indexOf(document.querySelector('.top-right .nav')), label: m.getAttribute('aria-label'), svg: !!m.querySelector('svg'),
      w: Math.round(m.getBoundingClientRect().width), tw: Math.round(document.querySelector('#theme-btn').getBoundingClientRect().width) };
  });
  ok(btn.vis && !btn.hidden && btn.svg && btn.label === 'คู่มือการใช้งาน', 'ปุ่มคู่มือแสดงในแถวไอคอน มีชื่อและไอคอน ' + J(btn));
  ok(btn.man > btn.flow && btn.man < btn.trash && btn.man < btn.nav, 'ปุ่มคู่มืออยู่หลัง RT Workflow ก่อนถังขยะ หน้าแถบเมนู');
  ok(btn.w === btn.tw, 'ปุ่มคู่มือขนาดเท่าไอคอนอื่น');
  ok(await p.evaluate(() => !document.querySelector('#man-dlg').open), 'หน้าต่างคู่มือยังไม่เปิดก่อนกดปุ่ม');
  ok(hits.local === 0 && hits.gh === 0, 'ยังไม่โหลดไฟล์คู่มือก่อนกดปุ่ม');

  // ---------- 2) เปิดคู่มือ (โฟลเดอร์ manual ข้างหน้าเว็บ) ----------
  await openMan();
  let f = await ready();
  const d1 = await p.evaluate(() => { const d = document.querySelector('#man-dlg'), fr = document.querySelector('#man-frame'), R = e => e.getBoundingClientRect();
    return { open: d.open, title: document.querySelector('#man-title').textContent, src: fr.hasAttribute('srcdoc') && !fr.getAttribute('src') ? 'srcdoc' : 'other', fh: Math.round(R(fr).height), fw: Math.round(R(fr).width), dw: Math.round(R(d).width), inside: R(fr).bottom <= R(d).bottom + 1, max: !!d.querySelector('[data-dlgmax]'), tab: !document.querySelector('#man-tab').disabled }; });
  ok(d1.open && d1.title === 'คู่มือการใช้งาน' && d1.src === 'srcdoc', 'กดปุ่ม = หน้าต่างคู่มือเปิด ตัวแสดงอยู่ใน iframe (srcdoc) ' + J(d1));
  ok(!!f && (await note()).hidden, 'คู่มือแจ้งพร้อม ข้อความกำลังโหลดหายไป');
  ok(d1.fh > 600 && d1.fw >= d1.dw - 2 && d1.inside, 'iframe เต็มหน้าต่าง ไม่ล้นขอบล่าง');
  ok(d1.max && d1.tab, 'มีปุ่มเต็มจอ และปุ่มเปิดในแท็บใหม่กดได้');
  ok(hits.local >= 2 && hits.gh === 0, 'โหมดตัวอย่าง: โหลดจากโฟลเดอร์ manual ข้างหน้าเว็บ ไม่แตะ GitHub');
  const h1 = await f.evaluate(() => { const cards = [...document.querySelectorAll('.card')], vis = e => !!e && e.getClientRects().length > 0;
    return { embed: document.documentElement.classList.contains('embed'), theme: document.documentElement.getAttribute('data-theme'), brand: vis(document.querySelector('.brand')), h1: (document.querySelector('.hero h1') || {}).textContent,
      n: cards.length, first: cards[0] && cards[0].querySelector('h3 .ic').textContent + '|' + cards[0].classList.contains('mine'), mine: cards.filter(c => c.classList.contains('mine')).length, me: (document.querySelector('.card .me') || {}).textContent,
      flow: (document.querySelector('.flow') || {}).textContent || '', bar: vis(document.querySelector('.bar')) }; });
  ok(h1.embed && !h1.brand && !h1.bar && h1.h1 === 'คู่มือ LPCH RT Hub' && h1.n === 8, 'หน้าแรกคู่มือในโหมดฝัง: ไม่มีหัวซ้ำ มีการ์ดวิชาชีพ 8 ใบ ' + J({ ...h1, flow: undefined }));
  ok(h1.mine === 1 && h1.first === 'MP|true' && h1.me === 'ตำแหน่งของคุณ', 'การ์ดของตำแหน่งผู้ใช้ (MP) ขึ้นก่อนและมีป้าย "ตำแหน่งของคุณ"');
  ok(h1.theme === 'light', 'โหมดสีของคู่มือ = โหมดของ Hub (กลางวัน)');
  ok(/RTT · แถบ Complete/.test(h1.flow) && /MP · แถบ งาน/.test(h1.flow) && /ใส่แร่ · แถบ นัดคิวใส่แร่/.test(h1.flow) && !/\{nav:/.test(h1.flow), 'ชื่อแถบในคู่มือ = ชื่อที่ Hub ใช้อยู่ (ข้อมูลตัวอย่าง = ชื่อเริ่มต้น) ไม่ใช่ชื่อที่ฝังใน guides.json');

  // ---------- 3) เปลี่ยนหน้าในคู่มือ: ไม่แตะที่อยู่ของ Hub · ภาพโหลดจากโฟลเดอร์คู่มือ ----------
  const url0 = p.url(), src0 = await p.evaluate(() => document.querySelector('#man-frame').srcdoc.length);
  await f.click('.card a[href="#g-mp-intake"]'); await p.waitForTimeout(400);
  const g1 = await f.evaluate(async () => { const im = document.querySelector('.step img'); if (im && !im.complete) await new Promise(r => { im.onload = im.onerror = r; });
    return { h1: (document.querySelector('.guide-head h1') || {}).textContent, steps: document.querySelectorAll('.step').length, crumb: document.querySelector('#crumb').textContent, loc: location.href, img: im && im.currentSrc, nw: im && im.naturalWidth,
      marks: document.querySelectorAll('.step .shot svg .mk-box').length, act: (document.querySelector('.acts') || {}).textContent, hash: location.hash }; });
  ok(g1.h1 === 'รับเคสจาก CT-SIM แล้วแจกเคส' && g1.steps >= 4 && /หน้าแรกคู่มือ/.test(g1.crumb), 'กดชื่อเรื่องในการ์ด = เปิดหน้าคู่มือเรื่องนั้น ' + J({ h1: g1.h1, steps: g1.steps }));
  ok(/^http:\/\/127\.0\.0\.1:\d+\/manual\/shots\/a14-nav-work\.webp$/.test(g1.img) && g1.nw > 1000 && g1.marks > 0, 'ภาพโหลดจากโฟลเดอร์คู่มือ มีกรอบเครื่องหมาย ' + J({ img: g1.img, nw: g1.nw, marks: g1.marks }));
  ok(/กด ▾ ข้างแถบ งานรอ/.test(g1.act.replace(/\s+/g, ' ')) || /งานรอ/.test(g1.act), 'ข้อความขั้นตอนใช้ชื่อแถบของ Hub (งานรอ) ' + J(g1.act.slice(0, 80)));
  ok(g1.hash === '' && g1.loc === 'about:srcdoc' && p.url() === url0 && (await p.evaluate(() => document.querySelector('#man-frame').srcdoc.length)) === src0, 'เปลี่ยนหน้าในตัว: ที่อยู่ของ Hub และของ iframe ไม่เปลี่ยน');
  await f.click('.toc a[data-step="2"]'); await p.waitForTimeout(300);
  ok((await f.evaluate(() => (document.querySelector('.guide-head h1') || {}).textContent)) === 'รับเคสจาก CT-SIM แล้วแจกเคส', 'กดสารบัญขั้นตอน = เลื่อนในหน้าเดิม ไม่เปลี่ยนเรื่อง');
  await f.click('.next a:last-child'); await p.waitForTimeout(300);
  ok((await f.evaluate(() => (document.querySelector('.guide-head h1') || {}).textContent)) === 'บันทึกขั้นตอนวางแผนจนถึง Plan complete', 'ปุ่ม ถัดไป → เปิดเรื่องถัดไป');
  await f.click('#crumb a'); await p.waitForTimeout(300);
  ok(await f.evaluate(() => !!document.querySelector('.hero') && document.querySelector('#crumb').textContent === ''), 'กด "หน้าแรกคู่มือ" = กลับหน้าแรก');
  await f.evaluate(() => document.querySelector('.flow a[href="#g-ctsim"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))); await p.waitForTimeout(300);
  ok((await f.evaluate(() => (document.querySelector('.guide-head h1') || {}).textContent)) === 'ลงข้อมูล CT-SIM', 'กดกล่องในภาพรวมทางเดินผู้ป่วย = เปิดเรื่องของกล่องนั้น');
  await f.click('#crumb a'); await p.waitForTimeout(200);
  await f.click('[data-tab="case"]'); await p.waitForTimeout(200);
  const cs = await f.evaluate(() => ({ n: document.querySelectorAll('.card').length, mine: document.querySelectorAll('.card.mine').length, sel: document.querySelector('[data-tab="case"]').getAttribute('aria-selected') }));
  ok(cs.n >= 4 && cs.mine === 0 && cs.sel === 'true', 'แท็บ ตามกรณีผู้ป่วย: ไม่มีป้ายตำแหน่ง ' + J(cs));

  // ---------- 4) Esc: ภาพขยายปิดก่อน · Esc อีกครั้งปิดหน้าต่าง · เปิดซ้ำ = หน้าเดิม ----------
  await f.click('.card a[href="#c-new"]'); await p.waitForTimeout(400);
  await f.click('.step .shot'); await p.waitForTimeout(250);
  ok(await f.evaluate(() => !!document.querySelector('.zoom')), 'กดภาพ = ขยายภาพ');
  await f.press('body', 'Escape'); await p.waitForTimeout(250);
  ok(await f.evaluate(() => !document.querySelector('.zoom')) && await p.evaluate(() => document.querySelector('#man-dlg').open), 'Esc ตอนภาพขยาย = ปิดภาพขยาย หน้าต่างคู่มือยังเปิด');
  await f.press('body', 'Escape'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => !document.querySelector('#man-dlg').open), 'Esc ในคู่มือ = ปิดหน้าต่างคู่มือ');
  const hl = hits.local;
  await openMan(); await p.waitForTimeout(400);
  f = fr();
  ok(hits.local === hl && (await p.evaluate(() => document.querySelector('#man-frame').srcdoc.length)) === src0 && (await f.evaluate(() => (document.querySelector('.guide-head h1') || {}).textContent || '')).length > 0, 'เปิดซ้ำภายใน 10 นาที = หน้าเดิมที่อ่านค้างไว้ ไม่โหลดใหม่');

  // ---------- 5) เต็มจอ ----------
  await click('#man-dlg [data-dlgmax]'); await p.waitForTimeout(250);
  const fs1 = await p.evaluate(() => { const d = document.querySelector('#man-dlg'), fr = document.querySelector('#man-frame'), R = e => e.getBoundingClientRect(); return { full: d.classList.contains('dlg-full'), dw: Math.round(R(d).width), fh: Math.round(R(fr).height), inside: R(fr).bottom <= R(d).bottom + 1, iw: innerWidth, ih: innerHeight }; });
  ok(fs1.full && fs1.dw >= fs1.iw - 20 && fs1.fh >= fs1.ih - 90 && fs1.inside, 'ปุ่ม ⤢ = หน้าต่างคู่มือเต็มจอ iframe ขยายตาม ' + J(fs1));
  await click('#man-dlg [data-dlgmax]'); await p.waitForTimeout(200);
  await click('#man-dlg [data-close]'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => !document.querySelector('#man-dlg').open), 'ปุ่ม × ปิดหน้าต่างคู่มือ');

  // ---------- 6) โหมดกลางคืน: เปิดใหม่ได้คู่มือโหมดเดียวกัน ----------
  await click('#theme-btn'); await p.waitForTimeout(250);
  await openMan(); f = await ready();
  const dk = await f.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), bg: getComputedStyle(document.body).backgroundColor, home: !!document.querySelector('.hero') }));
  ok(dk.theme === 'dark' && dk.bg === 'rgb(13, 21, 19)' && dk.home, 'Hub โหมดกลางคืน → คู่มือโหมดกลางคืน (โหลดหน้าใหม่) ' + J(dk));
  await click('#man-dlg [data-close]'); await click('#theme-btn'); await p.waitForTimeout(250);

  // ---------- 7) แอดมินเปลี่ยนชื่อแถบ → คู่มือใช้ชื่อใหม่ทันที ----------
  await go('settings');
  await click('#reset-demo'); await p.waitForFunction(() => !!localStorage.getItem('medphys-dispatch:v1'), null, { timeout: 8000 }); await p.waitForTimeout(300);
  const NAV = JSON.parse(fs.readFileSync(path.join(MAN, 'tools', 'nav.json'), 'utf8')).map(x => ({ on: true, guest: true, ...x, label: x.view === 'course' ? 'ห้องฉายทดสอบ' : x.view === 'bq' ? 'Brachy <b>&' : x.label }));
  await p.evaluate(nav => { const k = 'medphys-dispatch:v1', db = JSON.parse(localStorage.getItem(k)); db.config = Object.assign({}, db.config, { nav }); localStorage.setItem(k, JSON.stringify(db)); }, NAV);
  await p.reload(); await p.waitForSelector('.nav'); await p.waitForTimeout(600);
  ok(await p.evaluate(() => [...document.querySelectorAll('.nav [data-view="course"]')].some(e => /ห้องฉายทดสอบ/.test(e.textContent))), 'แถบเมนูของ Hub ใช้ชื่อที่แอดมินตั้ง (ห้องฉายทดสอบ)');
  await openMan(); f = await ready();
  const nv = await f.evaluate(() => ({ flow: document.querySelector('.flow').textContent, bold: document.querySelectorAll('.flow b').length }));
  ok(/RTT · แถบ ห้องฉายทดสอบ/.test(nv.flow) && /ใส่แร่ · แถบ Brachy <b>&/.test(nv.flow) && nv.bold === 0, 'ภาพรวมทางเดินผู้ป่วยใช้ชื่อใหม่ (อักขระพิเศษไม่กลายเป็น markup)');
  ok(await f.evaluate(() => document.querySelector('[data-tab="case"]').getAttribute('aria-selected') === 'true'), 'คู่มือจำแท็บที่เลือกไว้ล่าสุด (ตามกรณีผู้ป่วย)');
  await f.click('[data-tab="role"]'); await p.waitForTimeout(200);
  await f.click('.card a[href="#g-fx"]'); await p.waitForTimeout(350);
  ok(/กดแถบ ห้องฉายทดสอบ/.test((await f.evaluate(() => document.querySelector('.acts').textContent)).replace(/\s+/g, ' ')), 'ข้อความขั้นตอนใช้ชื่อใหม่ (กดแถบ ห้องฉายทดสอบ)');

  // ---------- 8) เปิดในแท็บใหม่ ----------
  const [tab] = await Promise.all([ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null), click('#man-tab')]);
  ok(!!tab, 'ปุ่ม "เปิดในแท็บใหม่" เปิดแท็บใหม่');
  if (tab) {
    await tab.waitForSelector('.hero', { timeout: 8000 }).catch(() => {});
    const t1 = await tab.evaluate(() => ({ url: location.href.slice(0, 5), embed: document.documentElement.classList.contains('embed'), brand: !!document.querySelector('.brand') && document.querySelector('.brand').getClientRects().length > 0, cards: document.querySelectorAll('.card').length, flow: document.querySelector('.flow').textContent }));
    ok(t1.url === 'blob:' && !t1.embed && t1.brand && t1.cards === 8 && /แถบ ห้องฉายทดสอบ/.test(t1.flow), 'แท็บใหม่: คู่มือเต็มหน้า มีหัวคู่มือ ใช้ชื่อแถบของ Hub ' + J({ ...t1, flow: undefined }));
    await tab.click('.card a[href="#g-reg"]'); await tab.waitForTimeout(300);
    ok((await tab.evaluate(() => (document.querySelector('.guide-head h1') || {}).textContent)) === 'ลงทะเบียนผู้ป่วยใหม่' && /^blob:/.test(tab.url()), 'แท็บใหม่: เปลี่ยนเรื่องได้ ที่อยู่ยังเป็นหน้าเดิม');
    await tab.close();
  }
  await click('#man-dlg [data-close]');

  // ---------- 9) ตั้งค่า: คู่มืออยู่ในลำดับไอคอน ----------
  await go('settings');
  const ic = await p.evaluate(() => { for (const b of document.querySelectorAll('#set-tabs [data-settab]')) { b.click(); const s = document.querySelector('[data-sec="icons"]'); if (s && s.getClientRects().length) return [...s.querySelectorAll('.box-name')].map(e => e.textContent); } return null; });
  ok(!!ic && ic.includes('คู่มือการใช้งาน') && ic.indexOf('คู่มือการใช้งาน') === ic.indexOf('ถังขยะ') - 1, 'ตั้งค่า → ไอคอนบนแถบเมนู: มี "คู่มือการใช้งาน" ก่อนถังขยะ ' + J(ic));

  // ---------- 10) โหลดจาก GitHub (จำลอง) เมื่อไม่มีโฟลเดอร์ manual ข้างหน้าเว็บ / ตัวแสดงข้างหน้าเว็บเป็นรุ่นเก่า ----------
  for (const mode of ['404', 'old']) {
    flag.local = mode; gh.on = true; hits.gh = 0;
    await p.reload(); await p.waitForSelector('.nav'); await p.waitForTimeout(500);
    await openMan(); f = await ready();
    const g = f ? await f.evaluate(async () => { document.querySelector('.card a[href="#g-reg"]').click(); await new Promise(r => setTimeout(r, 300)); const im = document.querySelector('.step img'); if (im && !im.complete) await new Promise(r => { im.onload = im.onerror = r; });
      return { h1: (document.querySelector('.guide-head h1') || {}).textContent, img: im && im.currentSrc, nw: im && im.naturalWidth }; }) : {};
    ok(!!f && hits.gh >= 2 && g.h1 === 'ลงทะเบียนผู้ป่วยใหม่', `ข้างหน้าเว็บ ${mode === '404' ? 'ไม่มีโฟลเดอร์ manual' : 'เป็นตัวแสดงรุ่นเก่า'} → โหลดจาก GitHub แทน ` + J({ gh: hits.gh, h1: g.h1 }));
    ok(/^https:\/\/raw\.githubusercontent\.com\/.+\/medphys\/manual\/shots\/a01-reg\.webp$/.test(g.img || '') && g.nw > 1000, 'ภาพโหลดตรงจาก GitHub ' + J({ img: (g.img || '').replace(/^.*\/medphys/, '…/medphys'), nw: g.nw }));
    await click('#man-dlg [data-close]');
  }

  // ---------- 11) โหลดไม่ได้เลย: บอกสาเหตุ · เปิดใหม่แล้วลองอีกครั้ง ----------
  flag.local = '404'; gh.on = false;
  await p.reload(); await p.waitForSelector('.nav'); await p.waitForTimeout(500);
  await openMan(); await p.waitForFunction(() => document.querySelector('#man-note').classList.contains('err'), null, { timeout: 8000 }).catch(() => {});
  const e1 = await p.evaluate(() => ({ t: document.querySelector('#man-note').textContent, err: document.querySelector('#man-note').classList.contains('err'), frame: document.querySelector('#man-frame').hidden, tab: document.querySelector('#man-tab').disabled, open: document.querySelector('#man-dlg').open }));
  ok(e1.open && e1.err && /^โหลดคู่มือไม่ได้/.test(e1.t) && e1.frame && e1.tab, 'โหลดไม่ได้ = ข้อความบอกสาเหตุ ไม่มีหน้าว่าง ปุ่มแท็บใหม่กดไม่ได้ ' + J(e1));
  await click('#man-dlg [data-close]');
  flag.local = 'ok';
  await openMan(); f = await ready();
  ok(!!f && (await note()).hidden && await f.evaluate(() => document.querySelectorAll('.card').length === 8), 'ปิดแล้วเปิดใหม่หลังเชื่อมต่อได้ = คู่มือขึ้นตามปกติ');
  await click('#man-dlg [data-close]');

  ok(errs.length === 0, 'ไม่มี error ในหน้า ' + J(errs.slice(0, 3)));
  await b.close(); srv.close();
})().catch(e => { console.log('FAIL exception ' + (e && e.stack || e)); process.exit(1); });
