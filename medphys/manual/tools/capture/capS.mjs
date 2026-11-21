// Scenarios with the sample patient on treatment (999000117 · demo-c17), each from fresh demo data on Mon 23 Nov 2026.
//  S  พบแพทย์แล้ว → ฉายต่อ (RTT ส่งพบแพทย์จากสถานะ fraction)
//  H  พบแพทย์แล้ว → Hold RT → วันถัดไปส่งพบแพทย์ กลับมาฉาย · ยกเลิก course
import { open, rowOf } from './lib.mjs';
const HN = '999000117', CID = 'demo-c17', TD = '2026-11-23';
const which = process.argv[2] || 'SH';

async function fxSee(h, shot) {   // RTT: today's cell → Complete Fraction · พบแพทย์
  const { page } = h;
  await h.go('course');
  const cell = page.locator(`#course-grid button[data-fxc="${CID}"][data-day="${TD}"]`).first();
  await cell.scrollIntoViewIfNeeded();
  if (shot) await h.snap(shot + '-grid', { targets: ['.nav [data-view="course"]', cell] });
  await cell.click(); await page.waitForTimeout(400);
  await h.pick('#pin-fx-see', 'พบแพทย์');
  if (shot) await h.snap(shot, { targets: ['#pin-fx-type label:has(input:checked)', '#pin-fx-see label:has(input[value="พบแพทย์"])', { t: '#pin-save', side: 'top' }], area: '#pin-dlg', pad: 0 });
  await page.click('#pin-save'); await page.waitForTimeout(500);
  console.log('fx see:', await h.toast());
}
async function nurseSent(h, shot) {   // Nurse → นัดวันนี้ → พบแพทย์ระหว่างฉาย → ส่งพบแพทย์แล้ว
  const { page } = h;
  await h.go('nurse');
  await page.click('#nurse-tabs [data-nursetab="today"]'); await page.waitForTimeout(300);
  const rows = page.locator('#nurse-body li', { has: page.locator(`.hn:text-is("${HN}")`) });
  console.log('nurse today rows', await rows.count(), await rows.locator('[data-att]').evaluateAll(bs => bs.map(b => b.dataset.st + '=' + b.textContent.trim()).join(' | ')));
  const row = rows.last();
  const came = row.locator('[data-att][data-st="came"]'), no = row.locator('[data-att][data-st="noshow"]');
  if (shot) await h.snap(shot, { targets: ['#nurse-tabs [data-nursetab="today"]', came, no], area: 'targets', pad: 30, incl: [row.locator('.hn').first()] });
  return { came, no, row };
}
async function doctor(h, rt, shot) {   // ห้องตรวจ → ระหว่างฉาย → สั่ง RT Alone + Continue / Hold
  const { page } = h;
  await h.go('consult');
  await page.click('#cs-tabs [data-cstab="ontx"]'); await page.waitForTimeout(300);
  const card = page.locator(`#cs-ontx [data-ontx="${CID}"]`).first();
  await card.scrollIntoViewIfNeeded();
  console.log('ontx options', await card.locator('[data-ontxk]').evaluateAll(bs => bs.map(b => b.dataset.ontxk + ':' + b.dataset.ontxv + '=' + b.textContent.trim()).join(' | ')));
  await card.locator('[data-ontxk="kind"][data-ontxv="alone"]').click(); await page.waitForTimeout(120);
  await card.locator(`[data-ontxk="rt"][data-ontxv="${rt}"]`).click(); await page.waitForTimeout(120);
  if (rt === 'hold') await card.locator('[data-ontxnote]').fill('ตัวอย่าง: ผิวหนังอักเสบ พักฉาย');
  const save = page.locator(`#cs-ontx [data-ontxsave="${CID}"]`).first();
  if (shot) await h.snap(shot, { targets: ['.nav [data-view="consult"]', '#cs-tabs [data-cstab="ontx"]', card.locator('[data-ontxk="kind"][data-ontxv="alone"]'), card.locator(`[data-ontxk="rt"][data-ontxv="${rt}"]`)].concat(rt === 'hold' ? [card.locator('[data-ontxnote]')] : []).concat([save]), area: 'targets', pad: 40 });
  await save.click(); await page.waitForTimeout(500);
  console.log('doctor:', await h.toast());
}
async function nurseConfirm(h, day, shot) {   // Nurse → รับคำสั่งแพทย์ → ยืนยัน
  const { page } = h;
  await h.go('nurse');
  await page.click('#nurse-tabs [data-nursetab="ontx"]'); await page.waitForTimeout(300);
  const btn = page.locator(`#nurse-body [data-nurse="rtd|${day}|${CID}"][data-on="1"]`).first();
  await btn.scrollIntoViewIfNeeded();
  if (shot) await h.snap(shot, { targets: ['#nurse-tabs [data-nursetab="ontx"]', btn], area: 'targets', pad: 40 });
  await btn.click(); await page.waitForTimeout(500);
  console.log('nurse confirm:', await h.toast());
}

if (which.includes('S')) {
  const h = await open(TD + 'T09:30:00+07:00');
  await fxSee(h, 's01-fx-see');
  const n = await nurseSent(h, 's02-nurse-sent');
  await n.came.click(); await h.page.waitForTimeout(400); console.log('sent:', await h.toast());
  await doctor(h, 'continue', 's03-doctor-continue');
  await nurseConfirm(h, TD, 's04-nurse-confirm');
  await h.go('course');
  const row = h.page.locator(`#course-grid .fxg-row:has(.hn:text-is("${HN}"))`).first();
  await row.scrollIntoViewIfNeeded();
  await h.snap('s05-grid-after', { targets: [h.page.locator(`#course-grid button[data-fxc="${CID}"][data-day="${TD}"]`).first()] });
  await h.close();
}
if (which.includes('H')) {
  const h = await open(TD + 'T09:30:00+07:00');
  const { page } = h;
  await fxSee(h, null);
  const n = await nurseSent(h, null);
  await n.came.click(); await page.waitForTimeout(400);
  await doctor(h, 'hold', 'h01-doctor-hold');
  await nurseConfirm(h, TD, 'h02-nurse-confirm');
  await h.go('course');
  const row = page.locator(`#course-grid .fxg-row:has(.hn:text-is("${HN}"))`).first();
  await row.scrollIntoViewIfNeeded();
  console.log('grid row:', (await row.textContent()).replace(/\s+/g, ' ').slice(0, 160));
  await h.snap('h03-grid-hold', { targets: [row.locator('button[data-fxc]').nth(1)] });
  // the Hold RT list starts the next day (today's fraction was given)
  await h.day('2026-11-24T09:20:00+07:00');
  await h.go('nurse');
  await page.click('#nurse-tabs [data-nursetab="hold"]'); await page.waitForTimeout(300);
  const hold = page.locator(`[data-hold="${CID}"]`).first();
  await hold.scrollIntoViewIfNeeded();
  console.log('hold buttons', await hold.locator('button').evaluateAll(bs => bs.map(b => [...b.attributes].filter(a => a.name.startsWith('data-')).map(a => a.name).join(',') + '=' + b.textContent.trim()).join(' | ')));
  await h.snap('h04-nurse-hold', { targets: [{ t: '#nurse-tabs [data-nursetab="hold"]', side: 'bottom' }, { t: hold.locator('[data-holdsee]'), side: 'bottom' }, { t: hold.locator('[data-holdcancel]'), side: 'bottom' }], area: 'targets', pad: 75 });
  // ready to return → ส่งพบแพทย์ → แพทย์สั่ง Continue → พยาบาลยืนยัน → ห้องฉายบันทึก
  await h.go('nurse');
  await page.click('#nurse-tabs [data-nursetab="hold"]'); await page.waitForTimeout(300);
  await page.locator(`[data-hold="${CID}"] [data-holdsee]`).first().click(); await page.waitForTimeout(500);
  console.log('hold → see:', await h.toast());
  await doctor(h, 'continue', null);
  await nurseConfirm(h, '2026-11-24', null);
  await h.go('course');
  const cell = page.locator(`#course-grid button[data-fxc="${CID}"][data-day="2026-11-24"]`).first();
  await cell.scrollIntoViewIfNeeded();
  await h.snap('h05-grid-return', { targets: [cell] });
  await cell.click(); await page.waitForTimeout(400);
  console.log('return fx title', await page.textContent('#pin-title'), '| types', await page.$$eval('#pin-fx-type label', ls => ls.filter(l => l.offsetParent).map(l => l.textContent.trim() + (l.querySelector('input').checked ? '*' : '')).join(' | ')));
  await h.pick('#pin-fx-type', 'given');   // the dialog opens on Hold: switch to Complete Fraction
  await h.pick('#pin-fx-see', 'ไม่พบแพทย์');
  await page.fill('#pin', '1234');
  await h.snap('h06-fx-return', { targets: ['#pin-fx-type label:has(input[value="given"])', '#pin-fx-see label:has(input[value="ไม่พบแพทย์"])', '#pin', { t: '#pin-save', side: 'top' }], area: '#pin-dlg', pad: 0 });
  await page.click('#pin-save'); await page.waitForTimeout(700);
  console.log('dialog still open:', await h.isOpen('pin-dlg'), '| cell now:', (await cell.textContent()).replace(/\s+/g, ' ').trim(), '| class', await cell.getAttribute('class'));
  console.log('return fx:', await h.toast());
  // ยกเลิก course from the Hold list: a second Hold the same way is long — show the cancel form on a fresh hold instead
  await h.close();
  // Cancel from Hold RT (fresh)
  const k = await open(TD + 'T09:30:00+07:00');
  await fxSee(k, null);
  const n2 = await nurseSent(k, null); await n2.came.click(); await k.page.waitForTimeout(400);
  await doctor(k, 'hold', null);
  await nurseConfirm(k, TD, null);
  await k.day('2026-11-24T09:20:00+07:00');
  await k.go('nurse');
  await k.page.click('#nurse-tabs [data-nursetab="hold"]'); await k.page.waitForTimeout(300);
  const hc = k.page.locator(`[data-hold="${CID}"]`).first();
  await hc.locator('[data-holdcancel]').click(); await k.page.waitForTimeout(300);
  const reason = hc.locator('[data-holdreason]').first(), ok = hc.locator('[data-holdcancelok]').first();
  console.log('cancel controls', await reason.count(), await ok.count(), await reason.evaluate(e => e.tagName + ' ' + e.type).catch(() => ''));
  if (await reason.evaluate(e => e.tagName).catch(() => '') === 'INPUT' || await reason.evaluate(e => e.tagName).catch(() => '') === 'TEXTAREA') await reason.fill('ตัวอย่าง: ผู้ป่วยขอหยุดรักษา');
  await k.snap('h07-hold-cancel', { targets: [reason, ok], area: 'targets', pad: 60 });
  await k.close();
}
