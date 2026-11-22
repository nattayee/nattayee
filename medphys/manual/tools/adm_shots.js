// ถ่ายภาพหน้าจอประกอบคู่มือหมวดแอดมิน (ประกาศ · Telegram · ไอคอน) จากโหมดตัวอย่าง ข้อมูลสมมุติ · ลิงก์ / token ปลอม
// ใช้: node adm_shots.js <index.html ของ RT Hub> <outdir> [nav.json]   → <outdir>/a*.png + shots.json  (แปลงเป็น webp ด้วย to_webp.py a)
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
  const band = async (a, b2, padT = 12, padB = 12) => { const ra = await rect(a), rb = await rect(b2); const y = Math.max(0, ra.y - padT); return { x: 0, y, w: VW, h: Math.min(VH, rb.y + rb.h + padB) - y }; };
  // แถบที่ติดขอบจอ (แถบเมนูด้านบน · แถบหมวดของหน้าตั้งค่า · แถบบันทึก) ไม่ให้ทับภาพ: ตอนถ่ายให้อยู่ในหน้าตามปกติ
  const unstick = () => p.evaluate(() => { for (const e of document.querySelectorAll('body *')) { if (e.closest('dialog') || e.id === 'toast') continue; const ps = getComputedStyle(e).position; if (ps === 'sticky' || ps === 'fixed') e.style.setProperty('position', 'static', 'important'); } });
  const snap0 = snap;
  const snapU = async (...a) => { await unstick(); await p.waitForTimeout(80); return snap0(...a); };
  const settings = async () => { await go('settings'); await p.evaluate(() => { const t = document.querySelector('#set-tabs [data-settab="all"]'); if (t) t.click(); }); await p.waitForTimeout(400); };
  const near = async (sel, above = 70, below = 70, i = 0) => { const r = await rect([sel, i]); return { x: 0, y: Math.max(0, r.y - above), w: VW, h: r.h + above + below }; };

  // ---------- a01: ตั้งค่า → แถบเมนู → แถว ประกาศ ----------
  await settings();
  await into('select[aria-label="ประกาศ · RTT"]', 0, 260);
  const ntfRow = 'tr:has(select[aria-label="ประกาศ · RTT"])';
  await unstick();
  await p.evaluate(() => { const r = document.querySelector('select[aria-label="ประกาศ · RTT"]').closest('tr'), t = r.closest('table'); for (const x of t.tBodies[0].rows) if (x !== r) x.dataset.manHide = x.style.display || '-', x.style.display = 'none'; });
  await into('select[aria-label="ประกาศ · RTT"]', 0, 260);
  await snapU('a01-adm-nav-ntf', await band(['table:has(select[aria-label="ประกาศ · RTT"]) thead', 0], ntfRow, 10, 14),
    [{ s: [ntfRow + ' td', 0] }, { u: [[ntfRow + ' select', 0], [ntfRow + ' select', (await p.$$eval(ntfRow + ' select', x => x.length)) - 1]] }]);

  await p.evaluate(() => { for (const x of document.querySelectorAll('[data-man-hide]')) { x.style.display = x.dataset.manHide === '-' ? '' : x.dataset.manHide; delete x.dataset.manHide; } });
  // ---------- a02: ตั้งค่า → นัดคิวใส่แร่ → อาชีพที่ได้รับประกาศ HDR ส่งภาพแล้ว ----------
  await into('.bq-ntf-roles', 0, 200);
  await snapU('a02-adm-bq-ntf', await band(['h3.sub-h:has(+ p.def-note + .bq-ntf-roles)', 0], '.bq-ntf-roles', 10, 14), ['.bq-ntf-roles']);

  // ---------- a04 / a05 / a06: ตั้งค่า → ประกาศ → Telegram ----------
  await into('[data-sec="tg"]', 0, 90);
  await snapU('a04-adm-tg-bot', await band('[data-sec="tg"] .sec-head', '[data-sec="tg"] .tg-row', 10, 12), ['#tg-tok', '[data-tgset]']);
  await p.fill('#tg-tok', '123456789:AAFakeTokenForManualShots_abcdefghij'); await click('[data-tgset]'); await p.waitForTimeout(400);
  await click('[data-tgfind]'); await p.waitForTimeout(400); await hideToasts();
  const pick = async (r, v) => { await p.selectOption(`[data-tgchat="${r}"]`, v); await p.dispatchEvent(`[data-tgchat="${r}"]`, 'input'); await p.waitForTimeout(150); };
  await pick('RO', '-1001000000001'); await pick('MP', '-1001000000002'); await pick('RTT', '-1001000000003'); await pick('*', '-1001000000009');
  await click('[data-tgtest="RO"]'); await p.waitForTimeout(400); await hideToasts();
  await into('.tg-map', 0, 140);
  await snapU('a05-adm-tg-groups', await band('.tg-map', '[data-tgfind]', 10, 12), ['[data-tgfind]', '[data-tgchat="RO"]', '[data-tgtest="RO"]', '[data-tgchat="*"]']);
  await p.check('[data-tg="on"]'); await p.dispatchEvent('[data-tg="on"]', 'input');
  await p.fill('[data-tglink]', 'https://t.me/+FAKEexampleLinkForManual'); await p.dispatchEvent('[data-tglink]', 'input'); await p.waitForTimeout(150);
  await into('label:has([data-tg="on"])', 0, 120);
  await snapU('a06-adm-tg-opts', await band('label:has([data-tg="on"])', 'p.def-note:has(+ .tg-wrap), .tg-box > div:has([data-tglink]) p', 6, 8),
    ['label:has([data-tg="on"])', '.tg-box .tg-row[role="group"]', '.tg-pt', '[data-tglink]']);

  // ---------- a07: ตั้งค่า → ไอคอนบนแถบเมนู ----------
  await p.uncheck('[data-iconon="trash"]'); await p.dispatchEvent('[data-iconon="trash"]', 'input'); await p.waitForTimeout(100);
  await into('[data-sec="icons"]', 0, 90);
  await snapU('a07-adm-icons', '[data-sec="icons"]', [{ u: [['[data-sec="icons"] .btns .check', 0], ['[data-sec="icons"] .btns .check', 9]] }, ['[data-iconup]', 2]], { pad: 8 });
  await p.check('[data-iconon="trash"]'); await p.dispatchEvent('[data-iconon="trash"]', 'input');

  // ---------- a08: บันทึกแล้ว ไอคอนกลุ่ม Telegram บนแถบเมนู ----------
  await click('#save-settings'); await p.waitForTimeout(700); await hideToasts(); await top();
  const tgr = await rect('#tg-btn');
  await snapU('a08-adm-tg-icon', { x: Math.max(0, tgr.x - 330), y: Math.max(0, tgr.y - 14), w: 520, h: tgr.h + 28 }, ['#tg-btn']);

  // ---------- a03: หน้าต่างประกาศ: ยกเลิก / ลบ (กดลบครั้งแรก = ขอยืนยัน) ----------
  await click('#ntf-btn'); await p.waitForTimeout(400);
  await p.evaluate(() => { const b = document.querySelector('#ntf-body [data-ntfcancel]'); const li = b && b.closest('.ntf-item'); if (li) li.scrollIntoView({ block: 'center' }); });
  const item = await p.evaluate(() => { const b = document.querySelector('#ntf-body [data-ntfcancel]'); const li = b.closest('.ntf-item'); return [...document.querySelectorAll('#ntf-body .ntf-item')].indexOf(li); });
  await p.evaluate(i => document.querySelectorAll('#ntf-body .ntf-item')[i].querySelector('[data-ntfdel]').click(), item); await p.waitForTimeout(250);
  await snap('a03-adm-ntf-del', ['#ntf-body .ntf-item', item], [[`#ntf-body .ntf-item:nth-of-type(${item + 1}) [data-ntfdel]`, 0], [`#ntf-body .ntf-item:nth-of-type(${item + 1}) [data-ntfcancel]`, 0]], { pad: 10 });
  await p.keyboard.press('Escape');

  fs.writeFileSync(path.join(out, 'shots.json'), JSON.stringify(META, null, 1));
  console.log('errs', errs.length, errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
})();
