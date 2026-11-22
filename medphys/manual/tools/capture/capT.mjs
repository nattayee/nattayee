// ประกาศ (ทุกตำแหน่ง) + กลุ่ม Telegram · ข้อมูลตัวอย่าง วันจันทร์ 23 พ.ย. 2569 · ผู้ใช้ตัวอย่าง = MP ที่ไม่ใช่แอดมิน (ไม่มีปุ่มของแอดมิน)
//  t01 ตัววิ่งบนแถบด้านบน (ประกาศทั่วไปที่มีลิงก์)   t02 กระดิ่ง → ประกาศที่ค้างอยู่ / รับทราบ   t03 เขียนประกาศทั่วไป
//  t04 ประกาศผู้ป่วย (HN / ชื่อ)   t05 ติดตามว่าใครรับทราบ · ยกเลิก   t06 กระดิ่งแดงข้าง HN   t07 หน้าต่างประกาศจาก HN   t08 ไอคอนกลุ่ม Telegram
// ลิงก์ทั้งหมดเป็นของปลอม (example.com · t.me/+FAKE…)
import { open } from './lib.mjs';
const KEY = 'medphys-dispatch:v1', AT = '2026-11-23T09:05:00+07:00';
const LINK = 'https://example.com/agenda', TG = 'https://t.me/+FAKEexampleLinkForManual';
const TEXT = `ประชุมแผนกวันศุกร์นี้ 13:00 ห้องประชุม 2 · วาระประชุม ${LINK}`;
const HN = '999000117';

const h = await open(AT); const { page } = h;
// ผู้ใช้ตัวอย่าง = MP (ไม่ใช่แอดมิน) · ลิงก์กลุ่ม Telegram (ปลอม) ในการตั้งค่า
await page.evaluate(([k, tg]) => {
  const db = JSON.parse(localStorage.getItem(k)); db.config = { ...db.config, tg: { ...(db.config.tg || {}), link: tg } }; localStorage.setItem(k, JSON.stringify(db));
  localStorage.setItem('medphys-pref:demoRole', JSON.stringify('user'));
  localStorage.setItem('medphys-dispatch:pin:user', localStorage.getItem('medphys-dispatch:pin:admin'));
}, [KEY, TG]);
await h.day(AT);
await h.go('course');
const who = await page.evaluate(() => document.querySelector('.who, #who, .user-chip') ? document.querySelector('.who, #who, .user-chip').textContent.replace(/\s+/g, ' ').trim() : '');
console.log('user:', who, '| tg icon:', await page.evaluate(() => !document.querySelector('#tg-btn').hidden));
const ntfDlg = async () => { await page.evaluate(() => { const d = document.querySelector('#ntf-dlg'); if (d.open) d.close(); }); await page.click('#ntf-btn'); await page.waitForTimeout(450); };
const roleBtn = r => page.locator(`#ntf-dlg [data-ntfrole="${r}"]`).first();

/* ---------- t08 ไอคอนกลุ่ม Telegram ---------- */
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(250);
const tg = await page.locator('#tg-btn').boundingBox();
await h.snap('t08-tg-icon', { area: { x: tg.x - 520, y: Math.max(0, tg.y - 14), w: 760, h: tg.height + 28 }, targets: ['#tg-btn'] });
console.log('tg href ok:', await page.evaluate(() => /^https:\/\/t\.me\/\+FAKE/.test(document.querySelector('#tg-btn').href)));

/* ---------- t03 เขียนประกาศทั่วไป (มีลิงก์) ---------- */
await ntfDlg();
await page.click('#ntf-dlg [data-ntfkind="general"]'); await page.waitForTimeout(200);
await page.fill('#ntf-text', TEXT); await page.dispatchEvent('#ntf-text', 'input');
await page.click('#ntf-dlg [data-ntfall]'); await page.waitForTimeout(200);
await page.click('#ntf-dlg [data-ntfdays="3"]'); await page.waitForTimeout(200);
await h.snap('t03-ntf-new', { area: '#ntf-dlg .ntf-sec', pad: 6, targets: ['#ntf-dlg [data-ntfkind="general"]', '#ntf-text', '#ntf-dlg [data-ntfall]', '#ntf-dlg [data-ntfdays="3"]', '#ntf-form [type="submit"]'] });
await page.click('#ntf-form [type="submit"]'); await page.waitForTimeout(600);
console.log('sent general:', await h.toast());
await page.evaluate(() => document.querySelector('#ntf-dlg').close()); await page.waitForTimeout(300);

/* ---------- t01 ตัววิ่ง: ไปที่ประกาศที่มีลิงก์ ---------- */
for (let i = 0; i < 8; i++) {
  if (await page.evaluate(() => /วาระประชุม/.test((document.querySelector('#ntf-bar .ntf-run') || {}).textContent || ''))) break;
  await page.click('#ntf-bar [data-ntfnav="1"]'); await page.waitForTimeout(250);
}
// ภาพนิ่งของตัววิ่ง ณ ตอนที่ลิงก์วิ่งมาอยู่ในช่อง (ลิงก์ทั้งเส้นอยู่ในช่องข้อความ)
await page.evaluate(() => {
  const run = document.querySelector('#ntf-bar .ntf-run'), a = run.querySelector('a.ntf-a'), tr = document.querySelector('#ntf-bar .ntf-track').getBoundingClientRect();
  run.style.transform = ''; const r = a.getBoundingClientRect(), at = Math.min(90, tr.width - r.width - 20);
  run.style.transform = `translateX(${-(r.left - tr.left - at)}px)`;
});
const bar = await page.locator('#ntf-bar').boundingBox();
console.log('bar:', await page.evaluate(() => document.querySelector('#ntf-bar').textContent.replace(/\s+/g, ' ').trim()));
await h.snap('t01-ntf-bar', { area: { x: bar.x - 14, y: Math.max(0, bar.y - 14), w: bar.width + 28, h: bar.height + 28 },
  targets: ['#ntf-bar .ntf-tag', { t: '#ntf-bar .ntf-nav', side: 'bottom' }, { t: '#ntf-bar a.ntf-a', side: 'bottom' }, '#ntf-bar .ntf-ok'] });

/* ---------- t02 กระดิ่ง → ประกาศที่ค้างอยู่ ---------- */
const bell = await page.locator('#ntf-btn').boundingBox();
await h.snap('t02-ntf-bell', { area: { x: bell.x - 560, y: Math.max(0, bell.y - 10), w: 760, h: bell.height + 20 }, targets: ['#ntf-btn'] });
await ntfDlg();
const item = page.locator('#ntf-dlg .ntf-item', { hasText: 'วาระประชุม' }).first();
await item.scrollIntoViewIfNeeded(); await page.waitForTimeout(250);
const ib = await item.boundingBox();
await h.snap('t02b-ntf-list', { area: { x: ib.x - 8, y: ib.y - 8, w: ib.width + 16, h: ib.height + 16 }, targets: [{ t: item.locator('a.ntf-a'), side: 'top' }, item.locator('.ntf-acks'), item.locator('[data-ntfack]'), item.locator('[data-ntfcancel]')] });

/* ---------- t04 ประกาศผู้ป่วย ---------- */
await page.evaluate(() => { const b = document.querySelector('#ntf-dlg .dlg-body, #ntf-body'); if (b) b.scrollTop = 0; });
await page.click('#ntf-dlg [data-ntftab="now"]').catch(() => {}); await page.waitForTimeout(200);
await page.click('#ntf-dlg [data-ntfkind="patient"]'); await page.waitForTimeout(250);
await page.fill('#ntf-hn', HN); await page.dispatchEvent('#ntf-hn', 'input'); await page.waitForTimeout(350);
await page.keyboard.press('Escape').catch(() => {});
if (!(await h.isOpen('ntf-dlg'))) await ntfDlg();
await page.evaluate(() => { const l = document.querySelector('#ntf-hn-list'); if (l) l.hidden = true; });
console.log('pname:', await page.inputValue('#ntf-pname').catch(() => '(none)'));
await page.fill('#ntf-text', 'มาถึงแล้ว ขอพบแพทย์ก่อนฉายวันนี้'); await page.dispatchEvent('#ntf-text', 'input');
for (const r of ['RTT', 'Nurse']) { const b = roleBtn(r); if (await b.count()) { await b.click(); await page.waitForTimeout(150); } }
console.log('roles on:', await page.$$eval('#ntf-dlg [data-ntfrole][aria-pressed="true"]', xs => xs.map(x => x.textContent.trim()).join(',')));
await h.snap('t04-ntf-pt', { area: '#ntf-dlg .ntf-sec', pad: 6, targets: ['#ntf-dlg [data-ntfkind="patient"]', { t: '#ntf-hn', side: 'left' }, '#ntf-text', roleBtn('RTT'), '#ntf-form [type="submit"]'] });
await page.click('#ntf-form [type="submit"]'); await page.waitForTimeout(600);
console.log('sent patient:', await h.toast());

/* ---------- t05 ติดตาม: ใครรับทราบแล้ว · ยกเลิก ---------- */
const it2 = page.locator('#ntf-dlg .ntf-item', { hasText: 'ขอพบแพทย์ก่อนฉาย' }).first();
await it2.scrollIntoViewIfNeeded(); await page.waitForTimeout(250);
const ib2 = await it2.boundingBox();
await h.snap('t05-ntf-track', { area: { x: ib2.x - 8, y: ib2.y - 8, w: ib2.width + 16, h: ib2.height + 16 }, targets: [it2.locator('.ntf-ptline'), it2.locator('.ntf-acks'), it2.locator('[data-ntfcancel]')] });
await page.evaluate(() => document.querySelector('#ntf-dlg').close()); await page.waitForTimeout(300);

/* ---------- t06 กระดิ่งแดงข้าง HN (ชี้ที่ HN) ---------- */
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200);
const hn = page.locator('#course-grid .hn', { hasText: HN }).first();
await hn.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
await hn.hover(); await page.waitForTimeout(350);
await page.hover('.hn-ntf'); await page.waitForTimeout(350);
const hb = await hn.boundingBox();
await h.snap('t06-hn-bell', { area: { x: Math.max(0, hb.x - 70), y: hb.y - 56, w: 720, h: 168 }, targets: [hn, '.hn-ntf'], keepFocus: true });
await page.click('.hn-ntf'); await page.waitForTimeout(500);

/* ---------- t07 หน้าต่างประกาศจาก HN ---------- */
await page.evaluate(() => { const l = document.querySelector('#ntf-hn-list'); if (l) l.hidden = true; });
console.log('from HN:', await page.inputValue('#ntf-hn'), '|', await page.inputValue('#ntf-pname').catch(() => ''));
await h.snap('t07-hn-form', { area: '#ntf-dlg .ntf-sec', pad: 6, keepFocus: true, targets: [{ t: '#ntf-hn', side: 'left' }, '#ntf-text', '#ntf-form [type="submit"]'] });
await page.evaluate(() => document.querySelector('#ntf-dlg').close()); await page.waitForTimeout(300);

console.log('tg at end:', await page.evaluate(() => { const b = document.querySelector('#tg-btn'); return JSON.stringify({ hidden: b.hidden, cls: b.className, disp: getComputedStyle(b).display, parent: b.parentElement && b.parentElement.className }); }));
await h.close();
