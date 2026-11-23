// งานใหม่ 23 พ.ย. (หน้าเว็บ .19–.24) · ข้อมูลตัวอย่าง วันจันทร์ 23 พ.ย. 2569 · ชื่อ / HN ปลอมทั้งหมด (HN 999000801–)
//  m01 Contouring: รายชื่อ + ปุ่ม   m02 Cancel Treatment: ยืนยันในแถว   m10 Nurse → เลื่อนนัด: ยกเลิกนัด
//  m03 แจกงานฟิสิกส์: บันทึกไว้ก่อน + เลื่อนนัดแจ้งพยาบาล   m04 Nurse → นัดวันนี้: Off RT   m05 Nurse → รับคำสั่งแพทย์: Off RT
//  m06 ตารางวันฉาย: CB / KV + ป้ายแนวทาง   m07 หน้าต่าง fraction: Verify image   m08 รายละเอียดผู้ป่วย: แนวทาง IGRT   m09 ตั้งค่า: แนวทาง IGRT ของห้อง
import { open } from './lib.mjs';
const KEY = 'medphys-dispatch:v1', AT = '2026-11-23T09:05:00+07:00', TD = '2026-11-23';

const h = await open(AT); const { page } = h;
await page.evaluate(([k, td]) => {
  const db = JSON.parse(localStorage.getItem(k)), docs = (db.config && db.config.doctors && db.config.doctors.length ? db.config.doctors.map(d => d.code) : ['TA', 'SC', 'PM']);
  const D0 = docs[0], D1 = docs[1] || D0;
  const C = (id, n, o) => ({ id, cat: 'vmetc', how: 'manual', mp: 'NY', hn: '9990008' + n, name: 'ตัวอย่าง ' + id, doc: D0, room: 'Infinity', area: 'Pelvis', dpf: '2', fx: '25', freq: 'Daily', ct: '2026-10-05', in: '2026-10-06', sim: '2026-10-20', pc: '2026-10-16 10:00', created: '2026-10-06T03:00:00Z', ...o });
  // Off RT วันนี้: Complete course วันนี้ (ยังไม่เลือก) · อีกคนส่งพบแพทย์แล้ว แพทย์พบแล้ว (รอพยาบาลยืนยัน)
  db.cases = (db.cases || []).filter(c => !/^MOF/.test(c.id)).concat([
    C('MOF1', '01', { name: 'นาย ตัวอย่าง จบคอร์ส', rt: 'complete', rtDate: td, rtBy: 'อาร์ทีที ตัวอย่าง' }),
    C('MOF2', '02', { name: 'นาง ตัวอย่าง พบแพทย์', doc: D1, rt: 'complete', rtDate: td, rtBy: 'อาร์ทีที ตัวอย่าง' })]);
  db.ncall = (db.ncall || []).filter(r => !/MOF/.test(r.id)).concat([{ id: `att|off|MOF2|${td}`, kind: 'att', what: 'off', ref: 'MOF2', hn: '999000802', name: 'นาง ตัวอย่าง พบแพทย์', doc: D1, from: '', to: '', date: td, status: 'see', tries: '', note: '', by: 'พยาบาล ตัวอย่าง', at: td + 'T01:10:00Z', nBy: 'พยาบาล ตัวอย่าง', nAt: td + 'T01:10:00Z' }]);
  db.visit = (db.visit || []).filter(v => !/MOF/.test(v.id)).concat([{ id: `offsee|MOF2|${td}`, date: td, hn: '999000802', name: 'นาง ตัวอย่าง พบแพทย์', doc: D1, note: 'Off RT · พบแพทย์', by: 'พยาบาล ตัวอย่าง', at: td + 'T01:10:00Z', seen: td + 'T02:30:00Z', seenBy: 'แพทย์ ตัวอย่าง' }]);
  // CT-SIM รอแจกงานฟิสิกส์ (กำลัง contour) · คนแรกมีนัด CT Order ที่ผูกไว้ (Start RT 1 ธ.ค.)
  const R = (id, n, o) => ({ id, ct: 'ct1', date: '2026-11-18', hn: '9990008' + n, name: 'ตัวอย่าง ' + id, organ: 'Pelvis', doc: D0, cats: 'vmetc', room: 'Infinity', dpf: '2', fx: '25', freq: 'Daily', send: 'yes', took: '', created: '2026-11-18T03:00:00Z', ...o });
  db.ctsim = (db.ctsim || []).filter(r => !/^MCT/.test(r.id)).concat([
    R('MCT1', '11', { name: 'นาง ตัวอย่าง สาม', sim: '2026-12-01' }),
    R('MCT2', '12', { name: 'นาย ตัวอย่าง สี่', sim: '2026-11-26', organ: 'Brain', cats: 'vmbrain', cdone: td + 'T02:00:00Z', cdBy: 'แพทย์ ตัวอย่าง' }),
    R('MCT3', '13', { name: 'นาง ตัวอย่าง ห้า', doc: D1, sim: '2026-12-03', organ: 'Breast' })]);
  db.appt = (db.appt || []).filter(a => !/^MAP/.test(a.id)).concat([{ id: 'MAP1', date: '2026-11-18', hn: '999000811', name: 'นาง ตัวอย่าง สาม', doc: D0, sim: '2026-12-01', room: 'Infinity', took: 'MCT1', created: '2026-11-10T03:00:00Z' }]);
  localStorage.setItem(k, JSON.stringify(db));
}, [KEY, TD]);
await h.day(AT);

/* ---------- m01 Contouring ---------- */
await h.go('contour');
await h.snap('m01-cn-list', { area: '#view-contour', pad: 8, targets: ['#cn-body [data-cndone]', '#cn-body [data-cnact="rect"]', '#cn-body [data-cnact="cancel"]'] });
/* ---------- m02 Cancel Treatment ---------- */
await page.evaluate(() => document.querySelector('[data-cnact="cancel"][data-cnid2="MCT1"]').click()); await page.waitForTimeout(300);
await page.fill('[data-cnid="MCT1"] [data-cnnote]', 'ผู้ป่วยปฏิเสธการรักษา');
await h.snap('m02-cn-cancel', { area: '[data-cnid="MCT1"]', pad: 8, targets: ['[data-cnid="MCT1"] [data-cnnote]', '[data-cnactok="MCT1"]'] });
await page.evaluate(() => document.querySelector('[data-cnactok="MCT1"]').click()); await page.waitForTimeout(800);
console.log('cancel:', await h.toast());
/* ---------- m10 Nurse → เลื่อนนัด: ยกเลิกนัด ---------- */
await h.go('nurse');
await page.evaluate(() => document.querySelector('#nurse-tabs [data-nursetab="mv"]').click()); await page.waitForTimeout(500);
await h.snap('m10-nc-cancel', { area: '#nurse-body li.nc-row:has(.hn)', pad: 8, targets: ['#nurse-body li.nc-row .nc-mv b'] });
/* ---------- m04 นัดวันนี้: Off RT ---------- */
await page.evaluate(() => document.querySelector('#nurse-tabs [data-nursetab="today"]').click()); await page.waitForTimeout(500);
await h.snap('m04-nc-off', { area: '[data-ncsec="off"]', pad: 8, targets: ['[data-ncsec="off"] [data-st="adv"]', '[data-ncsec="off"] [data-st="see"]'] });
/* ---------- m05 รับคำสั่งแพทย์: Off RT ---------- */
await page.evaluate(() => document.querySelector('#nurse-tabs [data-nursetab="ontx"]').click()); await page.waitForTimeout(500);
await h.snap('m05-nc-offrx', { area: '[data-ncsec="offrx"]', pad: 8, targets: ['[data-ncsec="offrx"] [data-st="seeadv"]'] });

/* ---------- m03 แจกงานฟิสิกส์: บันทึกไว้ก่อน ---------- */
await h.go('work');
await page.evaluate(() => document.querySelector('#ct-pull').click()); await page.waitForSelector('#ctpull-dlg[open]');
await page.evaluate(() => document.querySelector('#ctpull-list [data-ctuse="MCT3"]').click()); await page.waitForTimeout(600);
await page.keyboard.press('Escape'); await page.evaluate(() => { const d = document.querySelector('#dpk-pop'); if (d) d.hidden = true; });
await h.snap('m03-mp-draft', { area: 'targets', pad: 16, targets: ['#i-ct', { t: '#i-mvn-f', side: 'bottom' }, '#i-draft'], incl: ['#i-save', '#i-hn'] });
await page.evaluate(() => document.querySelector('#i-clear').click()); await page.waitForTimeout(300);

/* ---------- m06 ตารางวันฉาย: CB / KV + ป้ายแนวทาง ---------- */
await h.go('course');
const row = '#course-grid .fxg-row:has(.st-chip.igp):has(.fx-ig.kv)';
const rowN = await page.locator(row).count();
console.log('rows with KV:', rowN);
const R0 = rowN ? row : '#course-grid .fxg-row:has(.st-chip.igp):has(.fx-ig.cb)';
// แถวเดียว (ป้ายแนวทาง + KV + CB ในแถวเดียวกัน): ใส่เครื่องหมายแถวที่เลือก
const hasCb = await page.evaluate(r => { const x = [...document.querySelectorAll(r)].find(el => el.querySelector('.fx-ig.cb')) || document.querySelector(r); x.setAttribute('data-mansel', '1'); return !!x.querySelector('.fx-ig.cb'); }, R0);
const RS = '#course-grid .fxg-row[data-mansel]';
await h.snap('m06-fx-igrt', { area: RS, pad: 6, targets: [`${RS} .st-chip.igp`, ...(hasCb ? [`${RS} .fx-ig.cb`] : []), ...(rowN ? [`${RS} .fx-ig.kv`] : [])] });
/* ---------- m08 รายละเอียดผู้ป่วย: แนวทาง IGRT ---------- */
const pid = await page.evaluate(r => { const b = document.querySelector(`${r} [data-ptags]`); return b ? b.dataset.ptags : ''; }, RS);
await page.evaluate(id => document.querySelector(`[data-ptags="${id}"]`).click(), pid); await page.waitForSelector('#pin-dlg[open]'); await page.waitForTimeout(300);
await h.snap('m08-pt-igrt', { area: '#pin-ig-f', pad: 10, targets: ['#pin-igp label:first-child', '#pin-igp label:last-child'] });
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
/* ---------- m07 หน้าต่าง fraction: Verify image ---------- */
const cell = await page.evaluate(td => { const bs = [...document.querySelectorAll(`#course-grid button.fxc.fx[data-day="${td}"]`)].filter(b => !b.classList.contains('given') && !b.className.includes('see-')); const c = bs.find(b => b.querySelector('.fx-ig.cb')) || bs.find(b => b.querySelector('.fx-ig')) || bs[0]; return c ? `#course-grid [data-fxc="${c.dataset.fxc}"][data-day="${td}"]${c.dataset.lane ? `[data-lane="${c.dataset.lane}"]` : ''}` : ''; }, TD);
console.log('cell:', cell);
await page.click(cell); await page.waitForSelector('#pin-dlg[open]'); await page.waitForTimeout(300);
await page.evaluate(() => { const l = [...document.querySelectorAll('#pin-fx-type .fx-grp.given label')].find(x => x.textContent.trim() === 'Complete Fraction'); if (l) l.click(); }); await page.waitForTimeout(200);
await page.evaluate(() => document.querySelector('#pin-fx-img-box [data-fximg="cb"][data-d="1"]').click()); await page.waitForTimeout(200);
await h.snap('m07-fx-img', { area: '#pin-fx-img-box', pad: 36, targets: [{ t: '#pin-fx-img-box [data-fximg="cb"][data-d="1"]', side: 'top' }, '#pin-fx-img-box [data-fximgdef]'] });
await page.keyboard.press('Escape'); await page.waitForTimeout(300);

/* ---------- m09 ตั้งค่า: แนวทาง IGRT ของห้อง ---------- */
await h.go('settings');
await page.evaluate(() => { const t = document.querySelector('[data-settab="room"]'); if (t) t.click(); }); await page.waitForTimeout(500);
await h.snap('m09-adm-igrt', { area: '.field[data-sec="igtab"]', pad: 8, scrollTo: '.field[data-sec="igtab"]', targets: ['.field[data-sec="igtab"] select[data-igtab="0"]'] });
if (h.errs.length) console.log('page errors:', h.errs);
await h.close();
