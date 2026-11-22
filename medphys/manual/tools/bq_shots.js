// ถ่ายภาพหน้าจอประกอบคู่มือส่วนนัดคิวใส่แร่ (โหมดตัวอย่าง ข้อมูลสมมุติของหน้าเว็บเอง) พร้อมตำแหน่งกรอบ (marks) ของแต่ละภาพ
// ใช้: node bq_shots.js <index.html ของ RT Hub> <outdir> [nav.json = แถบเมนูตามที่แอดมินตั้ง]   → <outdir>/*.png + shots.json  (แปลงเป็น webp ด้วย to_webp.py)
// ชุดเดียวกับภาพเดิมของคู่มือ: จอ 1440×940 · 1.5x · วันจันทร์ที่ 7 ธ.ค. 2569 10:00 · ฟอนต์จริงของหน้าเว็บ
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { applyNav } = require('./nav_inject.js');
const DSF = 1.5, VW = 1440, VH = 1300, VIEW_H = 940;   // ชุดเดียวกับภาพเดิมของคู่มือ: จอ 1440×940 · 1.5x (ภาพกว้าง 2160px)   // จอสูง 1000 ให้รายการอยู่ในจอโดยไม่ต้องเลื่อนหน้า (เลื่อนแล้วแถบหัวแบบย่อจะบังส่วนบนของภาพ) · ภาพทั้งจอใช้ 705 เหมือนภาพเดิม
(async () => {
  const htmlPath = process.argv[2], out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
  const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html; charset=utf-8'); r.end(fs.readFileSync(htmlPath)); }).listen(0);
  const url = `http://127.0.0.1:${srv.address().port}/`, b = await chromium.launch({ env: { ...process.env, LANG: 'en_GB.UTF-8', LANGUAGE: 'en_GB' } }), errs = [], META = {};   // ช่องวันที่ = วว/ดด/ปปปป เหมือนภาพเดิมของคู่มือ
  const p = await b.newPage({ viewport: { width: VW, height: VH }, timezoneId: 'Asia/Bangkok', deviceScaleFactor: DSF, locale: 'en-GB' });   // วันที่ในช่องกรอก = วว/ดด/ปปปป เหมือนภาพเดิมของคู่มือ
  p.on('pageerror', e => errs.push(String(e))); p.on('dialog', d => d.accept());
  await p.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '.ntf-run{animation:none!important;padding-left:0!important}'; document.head.appendChild(s); }); });   // ตัววิ่งประกาศหยุดนิ่ง (ข้อความเริ่มที่ขอบซ้าย) ให้ภาพทุกภาพเหมือนกัน
  await p.clock.install({ time: new Date('2026-12-07T10:00:00+07:00') });
  await p.goto(url); await p.waitForSelector('.nav'); await p.waitForTimeout(900);
  await p.evaluate(() => document.fonts.ready);
  if (process.argv[4]) console.log('nav:', await applyNav(p, JSON.parse(fs.readFileSync(process.argv[4], 'utf8'))));   // แถบเมนูตามที่แอดมินตั้ง (ชื่อ · ลำดับ · กลุ่ม)
  await p.addStyleTag({ content: '#bq-link{display:none!important}' });   // ข้อความตั้งค่าสำหรับแอดมิน (ยังไม่ได้ตั้งให้นับคะแนน MP / RC) ไม่เกี่ยวกับขั้นตอนใช้งาน
  console.log('font ok', await p.evaluate(() => document.fonts.check('16px "IBM Plex Sans Thai"')), '| version', await p.evaluate(() => (document.body.innerText.match(/หน้าเว็บรุ่น ([\d.-]+)/) || [])[1]));
  const go = async v => { await p.evaluate(v => (document.querySelector(`.nav [data-view="${v}"]`) || document.querySelector(`[data-view="${v}"]`)).click(), v); await p.waitForTimeout(450); };
  const click = async s => { await p.evaluate(x => { const e = document.querySelector(x); if (!e) throw new Error('no ' + x); e.click(); }, s); await p.waitForTimeout(350); };
  const rect = async s => {   // s = selector หรือ [selector, ลำดับ] หรือ {x,y,w,h} (พิกัดจอ)
    if (s && typeof s === 'object' && !Array.isArray(s)) return s;
    const [sel, i] = Array.isArray(s) ? s : [s, 0];
    const r = await p.evaluate(([sel, i]) => { const e = document.querySelectorAll(sel)[i]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, [sel, i]);
    if (!r) throw new Error('no element ' + sel + ' #' + i);
    return r;
  };
  const union = rs => { const x = Math.min(...rs.map(r => r.x)), y = Math.min(...rs.map(r => r.y)); return { x, y, w: Math.max(...rs.map(r => r.x + r.w)) - x, h: Math.max(...rs.map(r => r.y + r.h)) - y }; };
  // snap: ถ่ายเฉพาะส่วน clip (selector / สี่เหลี่ยม / 'view' = ทั้งจอ) · marks = รายการเป้าหมาย (selector · [selector, i] · { u: [หลายอันรวมเป็นกรอบเดียว] })
  const snap = async (name, clipSel, marks, o = {}) => {
    let c = clipSel === 'view' ? { x: 0, y: 0, w: VW, h: VIEW_H } : await rect(clipSel);
    const pad = o.pad === undefined ? 0 : o.pad;
    c = { x: Math.max(0, Math.floor(c.x - pad)), y: Math.max(0, Math.floor(c.y - pad)), w: Math.ceil(c.w + pad * 2), h: Math.ceil(c.h + pad * 2) };
    if (o.h) c.h = Math.min(c.h, o.h);
    c.w = Math.min(c.w, VW - c.x); c.h = Math.min(c.h, VH - c.y);
    for (const k of ['x', 'y', 'w', 'h']) c[k] = 2 * Math.floor(c[k] / 2);   // เลขคู่: คูณ 1.5 แล้วได้พิกเซลเต็ม
    const ms = [];
    for (const m of marks) {
      const r = m && m.u ? union(await Promise.all(m.u.map(rect))) : m && m.s ? await rect(m.s) : await rect(m);
      const k = { x: Math.round((r.x - c.x) * DSF), y: Math.round((r.y - c.y) * DSF), w: Math.round(r.w * DSF), h: Math.round(r.h * DSF) };
      if (k.x < -2 || k.y < -2 || k.x + k.w > c.w * DSF + 2 || k.y + k.h > c.h * DSF + 2) console.log('  !! mark outside clip in', name, JSON.stringify(m), JSON.stringify(k));
      if (m && m.side) k.side = m.side;
      ms.push(k);
    }
    await p.screenshot({ path: path.join(out, name + '.png'), clip: { x: c.x, y: c.y, width: c.w, height: c.h } });
    META[name] = { img: `shots/${name}.webp`, w: Math.round(c.w * DSF), h: Math.round(c.h * DSF), marks: ms, _c: c };
    console.log('snap', name, META[name].w + 'x' + META[name].h, 'marks', ms.length);
  };
  const toast = () => p.$eval('#toast', t => t.textContent).catch(() => '');
  const hideToasts = () => p.evaluate(() => { const t = document.querySelector('#toast'); if (t) t.className = 'toast'; });   // ซ่อนเหมือนที่หน้าเว็บทำเองเมื่อครบเวลา (ห้ามลบทิ้ง)
  const top = async () => { await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(150); };
  const into = async (sel, i = 0, off = 120) => { await p.evaluate(([sel, i, off]) => { const e = document.querySelectorAll(sel)[i]; scrollTo(0, Math.max(0, e.getBoundingClientRect().top + scrollY - off)); }, [sel, i, off]); await p.waitForTimeout(200); };
  const rowId = hn => p.$$eval('#bq-body tr[data-bqedit]', (rs, hn) => (rs.find(r => r.querySelector('.hn').textContent === hn) || { dataset: {} }).dataset.bqedit, hn);
  // เลื่อนตารางไปทางขวาให้คอลัมน์ สถานะ ชิดขอบซ้าย (เห็นปุ่มทั้งแถวถึง ยกเลิก)
  const tblRight = async on => { await p.evaluate(on => { const w = document.querySelector('#bq-body .table-wrap'); if (!w) return; const th = [...w.querySelectorAll('thead th')].find(x => x.textContent.trim() === 'สถานะ'); if (on === 'max' || !on || !th) w.scrollLeft = on ? w.scrollWidth : 0; else { w.scrollLeft = 0; w.scrollLeft = th.getBoundingClientRect().left - w.getBoundingClientRect().left - 6; } }, on); await p.waitForTimeout(200); };
  const pin = async () => { if (await p.isVisible('#pin-dlg[open]').catch(() => false)) { console.log('  (PIN dialog shown)'); } };

  // ---------- b01: แถบนัดคิวใส่แร่ + ปุ่มลงนัด ----------
  await go('bq'); await top();
  await snap('b01-bq-tab', 'view', ['.nav [data-view="bq"]', '#bq-add']);

  // ---------- b02 / b03: ฟอร์มลงนัดใส่แร่ ----------
  await click('#bq-add');
  await p.fill('#q-hn', '999000412'); await p.fill('#q-name', 'นาง ตัวอย่าง ใส่แร่ 12');
  await p.evaluate(() => { const pick = (n, v) => document.querySelector(`#bq-dlg input[name="${n}"][value="${v}"]`).click(); pick('qdoc', 'SC'); pick('qtech', 'Full'); });
  await click('#bq-dlg [data-qn="4"]');
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  const lab = (n, v) => `#bq-dlg label:has(input[name="${n}"][value="${v}"])`;
  await snap('b02-bq-form', '#bq-dlg', [{ u: ['#q-hn', '#q-name'] }, lab('qdoc', 'SC'), lab('qtech', 'Full'), '#bq-dlg [data-qn="4"]']);
  for (const d of ['2026-12-15', '2026-12-17', '2026-12-22', '2026-12-24']) await click(`#bq-dlg [data-qday="${d}"]`);
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await snap('b03-bq-form-days', '#bq-dlg', [{ u: ['#bq-dlg [data-qday="2026-12-15"]', '#bq-dlg [data-qday="2026-12-24"]'] }, '#q-rev > :first-child', '#bq-save']);
  await click('#bq-save'); await p.waitForTimeout(500); await pin();
  console.log('after save:', await toast(), '| dialog open', await p.$eval('#bq-dlg', d => d.open));
  await hideToasts();

  // marks อีกชุดบนภาพเดิม (ภาพเดียวใช้ 2 ขั้นตอน)
  const alias = async (name, from, marks) => {
    const base = META[from], ms = [];
    for (const m of marks) { const r = m && m.u ? union(await Promise.all(m.u.map(rect))) : await rect(m); ms.push({ x: Math.round((r.x - base._c.x) * DSF), y: Math.round((r.y - base._c.y) * DSF), w: Math.round(r.w * DSF), h: Math.round(r.h * DSF) }); }
    META[name] = { img: base.img, w: base.w, h: base.h, marks: ms };
    console.log('alias', name, 'of', from, 'marks', ms.length);
  };
  // บริเวณตั้งแต่ขอบบนของ a ถึงขอบล่างของ b (เต็มความกว้างจอ)
  const band = async (a, b2, padT = 12, padB = 12) => { const ra = await rect(a), rb = await rect(b2); const y = Math.max(0, ra.y - padT); return { x: 0, y, w: VW, h: Math.min(VH, rb.y + rb.h + padB) - y }; };
  const classes = sel => p.$$eval(sel + ' *', es => [...new Set(es.map(e => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).join('.') : '') + (e.id ? '#' + e.id : '')))].slice(0, 70).join(' '));

  // ---------- b04: ค้นหา HN เห็นวันนัดทุก Fx ----------
  await p.fill('#view-bq .tab-q', '999000412'); await p.waitForTimeout(500);
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await top();
  await snap('b04-bq-find', await band('#view-bq .toolbar', '#bq-body .bq-ptx'), ['#view-bq .tab-q', '#bq-body .bq-ptx-h button', '#bq-body .bq-course ol']);
  await p.fill('#view-bq .tab-q', ''); await p.waitForTimeout(300);

  // ---------- b05 / b06: รายการของวันนี้ ----------
  const fToday = await p.$$eval('#bq-body [data-bqf]', bs => (bs.find(x => /^วันนี้/.test(x.textContent.trim())) || bs[0]).dataset.bqf);
  await click(`#bq-body [data-bqf="${fToday}"]`);
  const id1 = await rowId('999000401');
  const rowsToday = await p.$$eval('#bq-body tr[data-bqedit]', rs => rs.length);
  console.log('today filter', fToday, 'rows', rowsToday, 'row1', id1);
  await top();
  const lastRow = ['#bq-body tr[data-bqedit]', rowsToday - 1];
  await snap('b05-bq-today', await band('#bq-body .bq-filt', lastRow, 70), [`#bq-body [data-bqf="${fToday}"]`, { u: [`#bq-body tr[data-bqedit="${id1}"] .ct-hn`, `#bq-body tr[data-bqedit="${id1}"] .ct-name`] }]);
  await tblRight(true);
  const R = k => `#bq-body tr[data-bqedit="${id1}"] ${k}`;
  await snap('b06-bq-row', await band('#bq-body .table-wrap', lastRow, 4), [R('[data-bqchk]'), R('[data-bqdone]'), R('[data-bqnoshow]')]);
  META['b06-bq-row']._c = await band('#bq-body .table-wrap', lastRow, 4);
  await alias('b06-bq-row-sign', 'b06-bq-row', [R('[data-bqsign][data-bqk="rtt"]'), R('.bq-cts'), R('[data-bqus]'), R('[data-bqsign][data-bqk="mp"]'), R('[data-bqsign][data-bqk="rc"]'), '#bq-body [data-bqdayk="rtt"]']);

  // ---------- b07: ลงชื่อ RTT ----------
  await click(R('[data-bqsign][data-bqk="rtt"]'));
  await p.evaluate(() => { const l = [...document.querySelectorAll('#bqs-chips label')].find(x => /ตัวอย่าง 1/.test(x.textContent)); l.querySelector('input').click(); });
  await p.waitForTimeout(200);
  await snap('b07-bq-rtt', '#bqs-dlg', ['#bqs-chips label:has(input:checked)', '#bqs-save']);
  await click('#bqs-save'); await p.waitForTimeout(400); await pin(); console.log('rtt:', await toast()); await hideToasts();
  // ---------- b08: CT ----------
  await tblRight(true);
  await click(R('[data-bqimg][data-ct="CT"]'));
  await snap('b08-bq-ct', '#bqi-dlg', [{ s: ['#bi-ctroom button, #bi-ctroom label', 0], side: 'bottom' }]);
  await p.evaluate(() => (document.querySelector('#bi-ctroom button') || document.querySelector('#bi-ctroom label input')).click()); await p.waitForTimeout(500);
  if (await p.$eval('#bqi-dlg', d => d.open)) { await click('#bqi-save'); await p.waitForTimeout(400); }
  console.log('ct:', await toast()); await hideToasts();
  // ---------- b08b: ประกาศ HDR ส่งภาพแล้ว (สีม่วง) ขึ้นแถบด้านบนของอาชีพที่ตั้งไว้ (ค่าเริ่มต้น RO, MP · ผู้ใช้ตัวอย่าง = MP) ----------
  {
    const y0 = await p.evaluate(() => scrollY); await top();
    for (let i = 0; i < 8 && !(await p.$eval('#ntf-bar', b => b.classList.contains('bq'))); i++) await click('#ntf-bar [data-ntfnav="1"]');
    console.log('hdr bar:', (await p.$eval('#ntf-bar', b => b.textContent)).replace(/\s+/g, ' ').trim().slice(0, 160));
    // ภาพนิ่งของตัววิ่ง ณ ตอนที่ท้ายข้อความ (HDR … ส่งภาพแล้ว) อยู่ในช่อง
    await p.evaluate(() => { const run = document.querySelector('#ntf-bar .ntf-run'), b = run.querySelector('b'), tr = document.querySelector('#ntf-bar .ntf-track').getBoundingClientRect(); run.style.transform = ''; const r = b.getBoundingClientRect(); run.style.transform = `translateX(${-Math.max(0, r.right - tr.right + 14)}px)`; });
    await snap('b08b-bq-hdr', '#ntf-bar', ['#ntf-bar .ntf-tag', '#ntf-bar .ntf-track', '#ntf-bar .ntf-ok'], { pad: 14 });
    await p.evaluate(y => scrollTo(0, y), y0); await p.waitForTimeout(200);
  }
  await tblRight(true); await click(R('[data-bqus]')); console.log('us:', await toast()); await hideToasts();
  // ---------- b09: ลงชื่อ MP (RC เหมือนกัน) ----------
  await tblRight(true);
  await click(R('[data-bqsign][data-bqk="mp"]'));
  await p.evaluate(() => { const l = [...document.querySelectorAll('#bqs-chips label')].find(x => x.textContent.trim() === 'WM'); l.querySelector('input').click(); });
  await p.waitForTimeout(200);
  await snap('b09-bq-mp', '#bqs-dlg', ['#bqs-chips label:has(input:checked)', '#bqs-save']);
  await click('#bqs-save'); await p.waitForTimeout(400); console.log('mp:', await toast()); await hideToasts();
  await tblRight(true);
  await click(R('[data-bqsign][data-bqk="rc"]'));
  await p.evaluate(() => { const l = [...document.querySelectorAll('#bqs-chips label')].find(x => x.textContent.trim() === 'NY'); l.querySelector('input').click(); });
  await click('#bqs-save'); await p.waitForTimeout(400); console.log('rc:', await toast()); await hideToasts();
  await tblRight(true); await click(R('[data-bqchk]')); await hideToasts();
  await tblRight(true); await click(R('[data-bqdone]')); console.log('done:', await toast()); await hideToasts();
  // ---------- b10: แถวที่บันทึกครบ ----------
  await tblRight(true); await top();
  const lastRow2 = ['#bq-body tr[data-bqedit]', (await p.$$eval('#bq-body tr[data-bqedit]', rs => rs.length)) - 1];
  await snap('b10-bq-row-done', await band('#bq-body .table-wrap', lastRow2, 4), [R('.bq-st'), R('.bq-chkc'), { u: [R('td:nth-child(11)'), R('td:nth-child(15)')] }]);
  await tblRight(false);

  // ---------- b11: ปุ่มเลื่อนนัดในตาราง ----------
  const fUp = await p.$$eval('#bq-body [data-bqf]', bs => (bs.find(x => /^นัดที่จะถึง/.test(x.textContent.trim())) || bs[1]).dataset.bqf);
  await click(`#bq-body [data-bqf="${fUp}"]`);
  // ค้นหาผู้ป่วย: ปุ่มเลื่อนนัดอยู่ท้ายแต่ละ Fx (เห็นวันนัดทุก Fx ของคอร์ส) · ปุ่มชุดเดียวกันอยู่ท้ายแถวในตารางนัดคิวด้วย
  await tblRight(false); await top();
  await p.fill('#view-bq .tab-q', '999000403'); await p.waitForTimeout(500);
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await top();
  const L1 = k => `#bq-body .bq-course ol li:first-child [data-bqmv][data-k="${k}"]`;
  await snap('b11-bq-move-btn', await band('#view-bq .toolbar', '#bq-body .bq-ptx'), ['#view-bq .tab-q', L1('pp'), L1('mv'), L1('cx')]);
  const id3 = await p.$eval(L1('mv'), e => e.dataset.bqmv);
  const M = (id, k) => `#bq-body [data-bqmv="${id}"][data-k="${k}"]`;
  // ---------- b12: หน้าต่างเลื่อนนัด ----------
  await click(M(id3, 'mv'));
  await click('#bqm-dlg [data-mday="2026-12-11"]');
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await snap('b12-bq-move', '#bqm-dlg', ['#bqm-dlg [data-mday="2026-12-11"]', '#bqm-mvn-f', '#bqm-ok']);
  await click('#bqm-ok'); await p.waitForTimeout(500); await pin(); console.log('move:', await toast(), '| dlg open', await p.$eval('#bqm-dlg', d => d.open)); await hideToasts();
  await p.fill('#view-bq .tab-q', ''); await p.waitForTimeout(300);
  // ---------- b13: เลื่อนไม่มีกำหนด ----------
  const id2 = await p.$$eval('#bq-body tr[data-bqedit]', rs => (rs.find(r => r.querySelector('.hn').textContent === '999000402' && /3\/5/.test(r.querySelector('.bq-fxc').textContent)) || { dataset: {} }).dataset.bqedit);
  console.log('pp row', id2);
  await tblRight('max');
  await click(M(id2, 'pp'));
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await snap('b13-bq-pp-dlg', '#bqm-dlg', ['#bqm-scope', '#bqm-mvn-f', '#bqm-ok']);
  await click('#bqm-ok'); await p.waitForTimeout(500); console.log('pp:', await toast(), '| dlg open', await p.$eval('#bqm-dlg', d => d.open)); await hideToasts();
  // ---------- b14: ประวัติการเลื่อนนัด (รอลงวันนัดใหม่) ----------
  await click('#view-bq [data-bqv="pp"]'); await top();
  await top();
  const hRows = await p.$$eval('#bq-body .bq-htbl tr.bq-hrow', rs => rs.length);
  await snap('b14-bq-pp', await band('#view-bq .toolbar', ['#bq-body .bq-htbl tr.bq-hrow', Math.min(hRows, 2) - 1]), ['#view-bq [data-bqv="pp"]', ['#bq-body .bq-pptbl button.btn.primary.bq-mvb', 0], ['#bq-body .bq-htbl tr.bq-hrow', 0]]);
  // ---------- b16: ยกเลิกนัด ----------
  await click('#view-bq [data-bqv="queue"]');
  const id5 = await p.$$eval('#bq-body tr[data-bqedit]', rs => (rs.find(r => r.querySelector('.hn').textContent === '999000405' && /4\/4/.test(r.querySelector('.bq-fxc').textContent)) || { dataset: {} }).dataset.bqedit);
  await click(M(id5, 'cx'));
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await snap('b16-bq-cancel', '#bqm-dlg', ['#bqm-scope', '#bqm-ok']);
  await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); await p.waitForTimeout(200);
  // ---------- b17: แดชบอร์ด ----------
  await click('#view-bq [data-bqv="dash"]'); await top();
  await top();
  await snap('b17-bq-dash', await band('#view-bq .toolbar', '#bq-body .bq-chart'), ['#view-bq [data-bqv="dash"]', '#bq-body .bq-kpis', '#bq-body .bq-chart .bq-svg']);
  await click('#view-bq [data-bqv="queue"]');
  // ---------- b15: Nurse → เลื่อนนัด ----------
  await go('nurse'); await click('#nurse-tabs [data-nursetab="mv"]'); await top();
  console.log('nurse mv:', (await p.$eval('#nurse-body', e => e.innerText)).replace(/\n+/g, ' / ').slice(0, 500));
  const nRows = await p.$$eval('#nurse-body .nurse-list li.nc-row', ls => ls.length);
  await snap('b15-nurse-mv', await band('.nav', ['#nurse-body .nurse-list li.nc-row', Math.min(nRows, 3) - 1], 8, 16), ['.nav [data-view="nurse"]', '#nurse-tabs [data-nursetab="mv"]', ['#nurse-body [data-ncmark][data-st="told"]', 0], ['#nurse-body [data-ncmark][data-st="fail"]', 0]]);
  // ---------- b18: ห้องตรวจ → Consult ปุ่ม HDR ----------
  await go('consult'); await top();
  await snap('b18-consult-hdr', await band('.nav', ['#ap-dq .ct-pull li', 1], 8, 16), ['.nav [data-view="consult"]', ['#ap-dq [data-dqhdr]', 0]]);

  fs.writeFileSync(path.join(out, 'shots.json'), JSON.stringify(META, null, 1));
  console.log('errs', errs.length, errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
})();
