// ใบลา (ทุกตำแหน่ง) + ตั้งค่าใบลา (แอดมิน) · ข้อมูลตัวอย่าง วันจันทร์ 23 พ.ย. 2569 · ชื่อ / เบอร์ / บัญชีปลอมทั้งหมด
//  l01 หน้าต่างวันลา: ประเภท + ปุ่มใบลา   l02 ใบลา: ดู · พิมพ์ · download PDF   l03 หัวหน้างาน: ปุ่มรับทราบ   l04 ตรา รับทราบแล้ว ข้างชื่อผู้ลา
//  a08 ตั้งค่า → ทีม → ใบลา   a09 บรรทัด ใบลา: (ตำแหน่ง · เบอร์โทร) ใต้รายชื่อ
import { open } from './lib.mjs';
const KEY = 'medphys-dispatch:v1', AT = '2026-11-23T09:05:00+07:00';
const LEAVE = { at: 'โรงพยาบาลตัวอย่าง', dear: 'ผู้อำนวยการโรงพยาบาลตัวอย่าง', unit: 'กลุ่มงานรังสีรักษา', mission: '', group: { name: 'นายแพทย์ตัวอย่าง ใจดี', pos: 'หัวหน้ากลุ่มงานรังสีรักษา' },
  acting: { name: '', pos: '', from: '', to: '' }, heads: { MP: 'demo.user' } };

const h = await open(AT); const { page } = h;
// วันลา MP ตัวอย่าง (ลาพักผ่อน 26–27 พ.ย.) · ตำแหน่ง / เบอร์โทรของ MP คนแรก · ตั้งค่าใบลา · ผู้ใช้ตัวอย่าง = MP ที่เป็นหัวหน้างานของทีม MP
const mp = await page.evaluate(([k, lv]) => {
  const db = JSON.parse(localStorage.getItem(k)), code = 'NY';
  // ข้อมูลตัวอย่างใช้รายชื่อ MP เริ่มต้น: ใส่รายชื่อเดิม (รหัสเดิม) + ชื่อ ตำแหน่ง เบอร์โทรปลอมของ NY
  const staff = db.config.staff && db.config.staff.length ? db.config.staff : ['JR', 'WM', 'NY', 'WS'].map(c => ({ code: c, name: '', active: true, roles: [{ from: '2000-01', role: 'staff' }] }));
  const me = staff.find(x => x.code === code) || staff[0];
  Object.assign(me, { name: 'นักฟิสิกส์ ตัวอย่าง', title: 'นักฟิสิกส์การแพทย์ชำนาญการ', phone: '08x-xxx-1234' });
  db.config = { ...db.config, staff, leave: lv };
  db.leaves = (db.leaves || []).filter(x => x.id !== 'LV-MAN-1');
  db.leaves.push({ id: 'LV-MAN-1', mp: code, from: '2026-11-26', to: '2026-11-27', note: '', ltype: 'ลาพักผ่อน', created: '2026-11-23T01:00:00Z', updated: '' });
  db.lvack = [];
  localStorage.setItem(k, JSON.stringify(db));
  localStorage.setItem('medphys-pref:demoRole', JSON.stringify('user'));
  localStorage.setItem('medphys-dispatch:pin:user', localStorage.getItem('medphys-dispatch:pin:admin'));
  return code;
}, [KEY, LEAVE]);
await h.day(AT);
console.log('MP:', mp);
await h.go('mpleave');

/* ---------- l01 หน้าต่างวันลา: ประเภท + ปุ่มใบลา ---------- */
await page.evaluate(() => document.querySelector('#mpleave-body [data-lvedit="mp|LV-MAN-1"]').click());
await page.waitForSelector('#lv-dlg[open]'); await page.waitForTimeout(300);
console.log('lv-lf:', await page.evaluate(() => document.querySelector('#lv-lf').textContent.replace(/\s+/g, ' ').trim()));
await h.snap('l01-lv-dlg', { area: '#lv-dlg .dlg', pad: 0, targets: ['#lv-type', '#lv-lf-open', { t: '#lv-lf-ack', side: 'bottom' }] });

/* ---------- l02 ใบลา: ดู · พิมพ์ · download PDF ---------- */
await page.click('#lv-lf-open'); await page.waitForSelector('#lf-dlg[open]'); await page.waitForTimeout(700);
await h.snap('l02-lf-form', { area: '#lf-dlg .dlg', pad: 0, targets: ['#lf-print-btn', '#lf-pdf-btn', '#lf-ack', '#lf-prev .lf-paren'] });

/* ---------- l04 ตรา รับทราบแล้ว ---------- */
await page.click('#lf-ack'); await page.waitForTimeout(600);
console.log('ack:', await h.toast());
const st = await page.locator('#lf-prev .lf-stamp').boundingBox();
const sg = await page.locator('#lf-prev .lf-right').boundingBox();
await h.snap('l04-lf-stamp', { area: { x: sg.x - 10, y: st.y - 60, w: sg.width + 20, h: st.height + 150 }, targets: ['#lf-prev .lf-stamp'] });
await page.evaluate(() => document.querySelector('#lf-dlg').close()); await page.waitForTimeout(300);
/* ---------- l03 หน้าต่างวันลาหลังรับทราบ ---------- */
await h.snap('l03-lv-acked', { area: '#lv-lf', pad: 10, targets: ['#lv-lf-st', '#lv-lf-ack'] });
await page.evaluate(() => document.querySelector('#lv-dlg').close()); await page.waitForTimeout(300);

/* ---------- a08 / a09 ตั้งค่า → ทีม (แอดมิน) ---------- */
await page.evaluate(k => { localStorage.setItem('medphys-pref:demoRole', JSON.stringify('admin')); const db = JSON.parse(localStorage.getItem(k)); db.config.leave.heads = {}; localStorage.setItem(k, JSON.stringify(db)); }, KEY);
await h.day(AT);
await h.go('settings');
await page.evaluate(() => { const t = document.querySelector('[data-stab="team"]'); if (t) t.click(); }); await page.waitForTimeout(500);
await h.snap('a08-adm-leave', { area: '.sec[data-sec="leave"]', pad: 8, scrollTo: '.sec[data-sec="leave"]',
  targets: ['.sec[data-sec="leave"] [data-k="leave.at"]', '.sec[data-sec="leave"] [data-k="leave.group.name"]', '.sec[data-sec="leave"] [data-k="leave.acting.name"]', '.sec[data-sec="leave"] select[data-k="leave.heads.MP"]'] });
await h.snap('a09-adm-lvrow', { area: '.set-row:has(input[data-k="staff.2.phone"])', pad: 8, targets: ['input[data-k="staff.2.title"]', 'input[data-k="staff.2.phone"]'] });
await h.snap('a10-adm-lvdoc', { area: '.set-row.doc-row:has(input[data-k="doctors.0.phone"])', pad: 8, targets: ['.doc-row input[data-k="doctors.0.title"]', '.doc-row input[data-k="doctors.0.phone"]'] });
await h.close();
