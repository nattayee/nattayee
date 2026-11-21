// Scenario A — a new patient from registration to the first fraction.
// Mon 23 Nov: ลงทะเบียน → แจกงานแพทย์ → ลงนัด CT+RT → CT Order → พยาบาลยืนยัน
// Wed 25 Nov: CT-SIM → MP แจกเคส → วางแผน (Finish … Plan complete)
// Mon 7 Dec : พยาบาล Start RT วันแรก → RTT บันทึก Fx 1
import { open, rowOf } from './lib.mjs';
const HN = '999000888';
const h = await open('2026-11-23T09:05:00+07:00');
const { page } = h;
const exact = t => new RegExp('^\\s*' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$');
const chipOf = (box, text) => page.locator(`${box} label:visible`).filter({ hasText: exact(text) }).first();
const pickByText = async (box, text) => { const l = chipOf(box, text); await l.waitFor({ timeout: 4000 }); if (!(await l.locator('input').isChecked())) await l.click(); await page.waitForTimeout(120); return l; };

/* ---------- Mon 23 Nov ---------- */
await h.go('reg');
await h.snap('a01-reg', { targets: ['.nav [data-view="reg"]', '#rg-add'], area: { x: 0, y: 0, w: 1440, h: 420 } });
await page.click('#rg-add'); await page.waitForTimeout(300);
await page.fill('#r-hn', HN);
await h.pick('#r-title', 'นาง');
await page.fill('#r-name', 'ตัวอย่าง คู่มือ');
await h.snap('a02-reg-form', { targets: ['#r-hn', '#r-title label:has(input[value="นาง"])', '#r-name', '#rg-save'], area: '#rg-dlg', pad: 0 });
await page.click('#rg-save'); await page.waitForTimeout(500);
console.log('reg:', await h.toast());
await h.snap('a03-reg-done', { targets: [rowOf(page, '#view-reg tr', HN)], area: { x: 0, y: 0, w: 1440, h: 520 } });

await h.go('dq');
await page.fill('#dq-hn', HN); await page.press('#dq-hn', 'Tab'); await page.waitForTimeout(300);
await h.pick('#dq-type', 'normal');
const fb = await page.evaluate(() => { const r = document.querySelector('form.dq-form').getBoundingClientRect(); return r.y + r.height; });
await h.snap('a04-dq', { targets: ['.nav [data-view="dq"]', '#dq-hn', '#dq-type label:has(input[value="normal"])', '#dq-who label:has(input:checked)', '#dq-go'],
  area: { x: 0, y: 0, w: 1440, h: Math.min(940, fb + 16) } });
await page.click('#dq-go'); await page.waitForTimeout(400);
console.log('dq:', await h.toast());
await h.snap('a04b-dq-done', { targets: ['#toast'], area: { x: 0, y: 0, w: 1440, h: 940 }, keepToast: true });

await h.go('consult');
await page.click('#cs-tabs [data-cstab="cs"]').catch(() => {}); await page.waitForTimeout(250);
let crow = rowOf(page, '#ap-dq li', HN);
await crow.scrollIntoViewIfNeeded();
await h.snap('a05-consult', { targets: ['.nav [data-view="consult"]', '#cs-tabs [data-cstab="cs"]', crow.locator('[data-dqap]')] });
await crow.locator('[data-dqap]').click(); await page.waitForTimeout(400);
await h.pick('#a-cm', 'Non-CM');
await page.fill('#a-dpf', '200'); await page.fill('#a-fx', '25');
await h.pick('#a-freq', 'Daily').catch(() => {});
await page.fill('#a-date', '2026-11-25');
await page.fill('#a-sim', '2026-12-07');
await h.pick('#a-room', 'Infinity');
await h.snap('a06-ap-form', { targets: ['#a-cm label:has(input[value="Non-CM"])', '#a-dpf', '#a-fx', '#a-date', '#a-sim', '#a-room label:has(input[value="Infinity"])', '#ap-save'], area: '#ap-dlg', pad: 0 });
await page.click('#ap-save'); await page.waitForTimeout(600);
console.log('ap:', await h.toast());

await h.go('appt');
let co = rowOf(page, '#ap-co li', HN);
await co.scrollIntoViewIfNeeded();
await h.snap('a07-co-list', { targets: ['.nav [data-view="appt"]', co.locator('[data-apco]')] });
await co.locator('[data-apco]').click(); await page.waitForTimeout(400);
await page.fill('#a-note', 'ตัวอย่าง: Breast Lt · ยกแขนเหนือศีรษะ');
await h.snap('a08-co-form', { targets: ['#a-note', '#ap-view', '#ap-print', '#ap-save'], area: '#ap-dlg', pad: 0 });
await page.click('#ap-save'); await page.waitForTimeout(400);
console.log('co pin open:', await h.isOpen('pin-dlg'), await page.textContent('#pin-title'));
await page.fill('#pin', '12'); await page.waitForTimeout(100);
await h.snap('a09-pin', { targets: ['#pin'], area: '#pin-dlg', pad: 0, keepFocus: true });
await page.fill('#pin', '1234'); await page.waitForTimeout(600);
console.log('co:', await h.toast());

await h.go('nurse');
await page.click('#nurse-tabs [data-nursetab="ct"]'); await page.waitForTimeout(300);
const nrow = rowOf(page, '#nurse-body li, #nurse-body tr', HN);
await nrow.scrollIntoViewIfNeeded();
const conf = nrow.locator('[data-nurse^="appt|"][data-on="1"]');
console.log('nurse confirm buttons', await conf.count());
await h.snap('a10-nurse-ct', { targets: ['.nav [data-view="nurse"]', '#nurse-tabs [data-nursetab="ct"]', conf] });
await conf.click(); await page.waitForTimeout(400);
console.log('nurse ct:', await h.toast());

/* ---------- Wed 25 Nov: CT-SIM and physics ---------- */
await h.day('2026-11-25T10:10:00+07:00');
await h.go('ctsim');
await h.snap('a11-ctsim', { targets: ['.nav [data-view="ctsim"]', '#ct-apull'], area: { x: 0, y: 0, w: 1440, h: 460 } });
await page.click('#ct-apull'); await page.waitForTimeout(400);
const ar = rowOf(page, '#appull-list tr', HN);
await h.snap('a12-ctsim-pull', { targets: [ar.locator('[data-apuse]')], area: '#appull-dlg', pad: 0 });
await ar.locator('[data-apuse]').click(); await page.waitForTimeout(400);
console.log('organs', await page.$$eval('#t-organ label', ls => ls.map(l => l.textContent.trim()).join('|')));
console.log('cats', await page.$$eval('#t-cats label', ls => ls.map(l => l.querySelector('input').value + '=' + l.textContent.trim()).join('|')));
await h.pick('#t-machine', 'ct1');
const organ = await pickByText('#t-organ', 'Breast').catch(() => pickByText('#t-organ', 'Chest'));
await h.pick('#t-cats', 'vmbt'); const cat = page.locator('#t-cats label:has(input[value="vmbt"])').first();
const docChecked = page.locator('#t-doc label:has(input:checked)').first();
await h.snap('a13-ctsim-form', { targets: ['#t-machine label:has(input[value="ct1"])', organ, docChecked, cat, '#ct-save'], area: '#ct-dlg', pad: 0 });
await page.click('#ct-save'); await page.waitForTimeout(500);
console.log('ct:', await h.toast());

await h.go('work');
await page.click('.nav [data-navkids="pend"]'); await page.waitForTimeout(300);
await h.snap('a14-nav-work', { targets: ['.nav [data-navkids="pend"]', '#nav-drop-pend [data-view="work"]'], area: { x: 0, y: 0, w: 1440, h: 520 } });
await page.keyboard.press('Escape'); await page.mouse.click(5, 900); await page.waitForTimeout(200);
await h.go('work');
await page.locator('#ct-pull').scrollIntoViewIfNeeded();
await h.snap('a15-ctpull', { targets: ['#ct-pull'], area: { x: 0, y: 0, w: 1440, h: 940 } });
await page.click('#ct-pull'); await page.waitForTimeout(400);
const pr = rowOf(page, '#ctpull-list li', HN);
await h.snap('a16-ctpull-list', { targets: [pr.locator('[data-ctuse]')], area: '#ctpull-dlg', pad: 0 });
await pr.locator('[data-ctuse]').click(); await page.waitForTimeout(500);
console.log('assign:', (await page.textContent('#i-assign')).replace(/\s+/g, ' ').trim().slice(0, 140));
await h.snap('a17-intake', { targets: ['#i-hn', '#i-cat label:has(input:checked)'], area: 'targets', pad: 50 });
await h.snap('a17b-intake-save', { targets: ['#i-assign', '#i-save'], area: 'targets', pad: 50 });
await page.click('#i-save'); await page.waitForTimeout(600);
console.log('intake:', await h.toast());

const card = () => page.locator(`#cases li.row:has(.hn:text-is("${HN}"))`).first();
await page.click('#case-tabs [data-tab="all"]').catch(() => {}); await page.waitForTimeout(250);
await card().scrollIntoViewIfNeeded();
await h.snap('a18-card', { targets: [card().locator('[data-stamp="fin"]')], area: { x: 0, y: 0, w: 1440, h: 940 } });
const stamp = async (k, val, shot) => {
  await card().locator(`[data-stamp="${k}"]`).first().click(); await page.waitForTimeout(350);
  if (await h.isOpen('log-dlg')) {
    if (shot) await h.snap(shot + '-rc', { targets: ['#l-need', '#log-save'], area: '#log-dlg', pad: 0 });
    await page.click('#log-save'); await page.waitForTimeout(500);
  }
  if (val) await page.fill('#pin-val', val);
  if (shot) await h.snap(shot, { targets: (val ? ['#pin-val'] : []).concat(['#pin-save']), area: '#pin-dlg', pad: 0 });
  await page.click('#pin-save'); await page.waitForTimeout(500);
  console.log(' ', k, await h.toast());
};
await stamp('fin', null, 'a19-fin');
await stamp('eval');
await stamp('mu', '1.2', 'a20-mu');
await stamp('d0', '0.5');
await stamp('d4', '98.5');
await stamp('pc', null, 'a21-pc');
await page.click('#case-tabs [data-tab="all"]').catch(() => {}); await page.waitForTimeout(250);
await card().scrollIntoViewIfNeeded();
await h.snap('a22-card-done', { targets: [card()], area: { x: 0, y: 0, w: 1440, h: 940 } });
// งานรอ cards (what is pending across the team)
await h.go('pend');
await h.snap('a23-pend', { targets: ['.nav [data-view="pend"]', '#pend-cards [data-dpend="fin"]'], area: { x: 0, y: 0, w: 1440, h: 640 } });

/* ---------- Mon 7 Dec: first fraction ---------- */
await h.day('2026-12-07T08:40:00+07:00');
await h.go('nurse');
await page.click('#nurse-tabs [data-nursetab="today"]'); await page.waitForTimeout(300);
const srow = rowOf(page, '#nurse-body li', HN);
await srow.scrollIntoViewIfNeeded();
console.log('start buttons', await srow.locator('[data-att]').evaluateAll(bs => bs.map(b => b.dataset.st + '=' + b.textContent.trim()).join(' | ')));
await h.snap('a24-nurse-start', { targets: ['#nurse-tabs [data-nursetab="today"]', srow.locator('[data-att][data-st="came"]'), srow.locator('[data-att][data-st="see"]'), srow.locator('[data-att][data-st="noshow"]')], area: 'targets', pad: 40 });
await srow.locator('[data-att][data-st="came"]').click(); await page.waitForTimeout(400);
console.log('came:', await h.toast());

await h.go('course');
await page.click('#course-tabs [data-ctab="on"]').catch(() => {}); await page.waitForTimeout(300);
const cell = page.locator(`#course-grid .fxg-row:has(.hn:text-is("${HN}")) button[data-fxc][data-day="2026-12-07"]`).first();
await cell.scrollIntoViewIfNeeded();
await h.snap('a25-grid', { targets: ['.nav [data-view="course"]', cell] });
await cell.click(); await page.waitForTimeout(400);
console.log('fx title', await page.textContent('#pin-title'));
await h.pick('#pin-fx-see', 'ไม่พบแพทย์');
await h.snap('a26-fx', { targets: ['#pin-fx-type label:has(input:checked)', '#pin-fx-see label:has(input[value="ไม่พบแพทย์"])', '#pin-save'], area: '#pin-dlg', pad: 0 });
await page.click('#pin-save'); await page.waitForTimeout(500);
console.log('fx:', await h.toast());
await h.snap('a27-grid-done', { targets: [cell] });
await h.close();
