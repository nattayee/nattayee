// Sample patient on treatment 999000117 (demo-c17), fresh demo data each time.
//  N   นัดพบแพทย์ → ไม่มา / ไม่พบแพทย์ → ห้องฉายบันทึกต่อ · ผู้ป่วยไม่มาตามนัด · + พบแพทย์นอกตารางนัด
//  R   Re-CT หลังเริ่มฉาย (ไม่พบแพทย์) → CT Order → CT-SIM → MP เคสเดิม
//  R2  Re-CT แบบพบแพทย์ · แพทย์สั่ง Re-CT เองจากห้องตรวจ
import { open } from './lib.mjs';
const HN = '999000117', CID = 'demo-c17';
const which = process.argv[2] || 'N R R2';
const cellOf = (page, day) => page.locator(`#course-grid button[data-fxc="${CID}"][data-day="${day}"]`).first();

if (which.includes('N')) {
  const h = await open('2026-11-23T14:00:00+07:00'); const { page } = h;
  await h.go('nurse');
  await page.click('#nurse-tabs [data-nursetab="see"]'); await page.waitForTimeout(300);
  const tom = page.locator(`[data-seeappt="${CID}"][data-d]:not([data-pick])`).first();
  await tom.scrollIntoViewIfNeeded();
  console.log('see buttons', await page.locator(`[data-seeappt="${CID}"]`).evaluateAll(bs => bs.map(b => b.textContent.trim()).join(' | ')));
  await h.snap('n01-book', { targets: ['.nav [data-view="nurse"]', '#nurse-tabs [data-nursetab="see"]', tom], area: 'viewport' });
  await tom.click(); await page.waitForTimeout(400);
  console.log('book:', await h.toast());
  // Tue 24: the visit day
  await h.day('2026-11-24T09:10:00+07:00');
  await h.go('course');
  const cell = cellOf(page, '2026-11-24');
  await cell.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);   // the grid redraws once after a reload
  console.log('cell on visit day:', (await cell.textContent()).replace(/\s+/g, ' ').trim(), await cell.getAttribute('title'));
  await cell.click(); await page.waitForTimeout(250);
  console.log('gate:', await h.toast());
  await h.snap('n02-grid-gate', { targets: [cell, '#toast'], keepToast: true });
  await h.go('nurse');
  await page.click('#nurse-tabs [data-nursetab="today"]'); await page.waitForTimeout(300);
  const rows = page.locator('#nurse-body li', { has: page.locator(`.hn:text-is("${HN}")`) });
  console.log('today rows', await rows.count(), await rows.locator('[data-att]').evaluateAll(bs => bs.map(b => b.dataset.st + '=' + b.textContent.trim()).join(' | ')));
  const row = rows.last();
  await h.snap('n03-nurse-noshow', { targets: ['#nurse-tabs [data-nursetab="today"]', row.locator('[data-att][data-st="came"]'), row.locator('[data-att][data-st="noshow"]')], area: 'targets', pad: 30, incl: [row.locator('.hn').first()] });
  await row.locator('[data-att][data-st="noshow"]').click(); await page.waitForTimeout(400);
  console.log('noshow:', await h.toast());
  await page.click('#nurse-tabs [data-nursetab="miss"]'); await page.waitForTimeout(300);
  const mrow = page.locator('#nurse-body li', { has: page.locator(`.hn:text-is("${HN}")`) }).first();
  await h.snap('n04-nurse-miss', { targets: ['#nurse-tabs [data-nursetab="miss"]', mrow], area: 'targets', pad: 40 });
  await h.go('course');
  await cell.scrollIntoViewIfNeeded();
  console.log('cell after noshow:', (await cell.textContent()).replace(/\s+/g, ' ').trim());
  await cell.click(); await page.waitForTimeout(400);
  console.log('fx dialog open', await h.isOpen('pin-dlg'), await page.textContent('#pin-title'));
  await h.pick('#pin-fx-type', 'given');
  await h.pick('#pin-fx-see', 'ไม่พบแพทย์');
  await h.snap('n05-fx-after', { targets: ['#pin-fx-type label:has(input[value="given"])', '#pin-fx-see label:has(input[value="ไม่พบแพทย์"])', { t: '#pin-save', side: 'top' }], area: '#pin-dlg', pad: 0 });
  await page.click('#pin-save'); await page.waitForTimeout(500);
  console.log('fx:', await h.toast(), '| open', await h.isOpen('pin-dlg'));
  // + พบแพทย์นอกตารางนัด (same day, not booked)
  await h.go('nurse');
  await page.click('#nurse-tabs [data-nursetab="today"]'); await page.waitForTimeout(300);
  await page.locator('[data-vsnew]').first().scrollIntoViewIfNeeded();
  await h.snap('n06-vs-button', { targets: ['[data-vsnew]'], area: 'targets', pad: 60 });
  await page.click('[data-vsnew]'); await page.waitForTimeout(300);
  await page.fill('#vs-hn', HN); await page.press('#vs-hn', 'Tab'); await page.waitForTimeout(300);
  await page.fill('#vs-note', 'ตัวอย่าง: มีไข้ ขอพบแพทย์ก่อนฉาย');
  await h.snap('n07-vs-form', { targets: ['#vs-hn', '#vs-note', { t: '#vs-save', side: 'top' }], area: '#vs-dlg', pad: 0 });
  await h.close();
}

if (which.includes('R') && !which.includes('R2') || which.split(' ').includes('R')) {
  const h = await open('2026-11-23T10:00:00+07:00'); const { page } = h;
  await h.go('course');
  const cell = cellOf(page, '2026-11-23');
  await cell.scrollIntoViewIfNeeded();
  await cell.click(); await page.waitForTimeout(350);
  await h.pick('#pin-fx-type', 'rectg');
  await h.pick('#pin-fx-reason', 'Tumor change');
  await h.pick('#pin-fx-see', 'ไม่พบแพทย์');
  console.log('re-ct preview:', (await page.textContent('#pin-fx-prev')).replace(/\s+/g, ' ').trim());
  await h.snap('r01-fx-rect', { targets: ['#pin-fx-type label:has(input[value="rectg"])', '#pin-fx-reason label:has(input[value="Tumor change"])', '#pin-fx-see label:has(input[value="ไม่พบแพทย์"])', '#pin-fx-prev', { t: '#pin-save', side: 'top' }], area: '#pin-dlg', pad: 0 });
  await page.click('#pin-save'); await page.waitForTimeout(500);
  console.log('rect:', await h.toast());
  await cell.scrollIntoViewIfNeeded();
  console.log('cell:', (await cell.textContent()).replace(/\s+/g, ' ').trim());
  await h.snap('r02-grid-rect', { targets: [cell] });
  await h.go('appt');
  const rr = page.locator(`#ap-co li[data-rect="${CID}"]`).first();
  await rr.scrollIntoViewIfNeeded();
  console.log('ap-co Re-CT row:', (await rr.textContent()).replace(/\s+/g, ' ').trim().slice(0, 140));
  await h.snap('r03-co-rect', { targets: ['.nav [data-view="appt"]', rr.locator(`[data-aprect="${CID}"]`)] });
  await rr.locator(`[data-aprect="${CID}"]`).click(); await page.waitForTimeout(400);
  await h.pick('#a-cm', 'Non-CM');
  await page.fill('#a-date', '2026-11-24');
  console.log('co note:', await page.inputValue('#a-note'));
  await h.snap('r04-co-rect-form', { targets: ['#a-cm label:has(input[value="Non-CM"])', '#a-date', '#a-note', '#ap-save'], area: '#ap-dlg', pad: 0 });
  await page.click('#ap-save'); await page.waitForTimeout(500);
  console.log('co:', await h.toast(), '| pin', await h.isOpen('pin-dlg'));
  await h.day('2026-11-24T10:00:00+07:00');
  await h.go('ctsim');
  await page.click('#ct-apull'); await page.waitForTimeout(400);
  const ar = page.locator('#appull-list tr', { has: page.locator(`.hn:text-is("${HN}")`) }).first();
  await h.snap('r05-ctsim-pull', { targets: [ar.locator('[data-apuse]')], area: '#appull-dlg', pad: 0 });
  await ar.locator('[data-apuse]').click(); await page.waitForTimeout(400);
  await h.pick('#t-machine', 'ct2');
  await page.locator('#t-organ label:visible').filter({ hasText: /^\s*Head\s*$/ }).first().click();
  await h.pick('#t-cats', 'vmhn');
  await page.click('#ct-save'); await page.waitForTimeout(500);
  console.log('ct:', await h.toast());
  await h.go('work');
  await page.click('#ct-pull'); await page.waitForTimeout(400);
  const pr = page.locator('#ctpull-list li', { has: page.locator(`.hn:text-is("${HN}")`) }).first();
  console.log('ctpull row:', (await pr.textContent()).replace(/\s+/g, ' ').trim().slice(0, 160));
  await h.snap('r06-ctpull-rect', { targets: [pr.locator('[data-ctuse]')], area: '#ctpull-dlg', pad: 0 });
  await pr.locator('[data-ctuse]').click(); await page.waitForTimeout(500);
  console.log('kind', await page.evaluate(() => document.querySelector('#i-kind input:checked').value), '| mode', await page.evaluate(() => document.querySelector('#i-mode input:checked').value), '| assign', (await page.textContent('#i-assign')).replace(/\s+/g, ' ').trim().slice(0, 120));
  await h.snap('r07-intake-old', { targets: ['#i-hn', '#i-kind label:has(input:checked)'], area: 'targets', pad: 50 });
  await h.snap('r08-intake-save', { targets: ['#i-mode label:has(input:checked)', '#i-assign', '#i-save'], area: 'targets', pad: 40 });
  await page.click('#i-save'); await page.waitForTimeout(500);
  let t = await h.toast(); console.log('intake:', t);
  if (!/แจกเคส/.test(t)) { await page.click('#i-save'); await page.waitForTimeout(500); console.log('intake 2:', await h.toast()); }
  await h.close();
}

if (which.includes('R2')) {
  // Re-CT, patient sees the doctor that day
  const h = await open('2026-11-23T10:00:00+07:00'); const { page } = h;
  await h.go('course');
  const cell = cellOf(page, '2026-11-23');
  await cell.scrollIntoViewIfNeeded(); await cell.click(); await page.waitForTimeout(350);
  await h.pick('#pin-fx-type', 'rectg');
  await h.pick('#pin-fx-reason', 'Tumor change');
  await h.pick('#pin-fx-see', 'พบแพทย์');
  console.log('preview พบแพทย์:', (await page.textContent('#pin-fx-prev')).replace(/\s+/g, ' ').trim());
  await h.snap('r10-fx-rect-see', { targets: ['#pin-fx-type label:has(input[value="rectg"])', '#pin-fx-reason label:has(input[value="Tumor change"])', '#pin-fx-see label:has(input[value="พบแพทย์"])', '#pin-fx-prev', { t: '#pin-save', side: 'top' }], area: '#pin-dlg', pad: 0 });
  await page.click('#pin-save'); await page.waitForTimeout(500);
  console.log('rect see:', await h.toast());
  await h.go('consult');
  await page.click('#cs-tabs [data-cstab="ontx"]'); await page.waitForTimeout(300);
  const card = page.locator(`#cs-ontx [data-ontx="${CID}"]`).first();
  console.log('ontx card:', await card.count(), (await card.textContent().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 160));
  await card.scrollIntoViewIfNeeded();
  await h.snap('r11-consult-rect', { targets: ['#cs-tabs [data-cstab="ontx"]', card], area: 'targets', pad: 30 });
  await h.go('appt');
  const rr = page.locator(`#ap-co li[data-rect="${CID}"]`);
  console.log('CT Order Re-CT row also waiting:', await rr.count());
  await h.close();
  // the doctor starts a Re-CT from ห้องตรวจ → ระหว่างฉาย
  const k = await open('2026-11-23T10:00:00+07:00'); const p2 = k.page;
  await k.go('course');
  const c2 = cellOf(p2, '2026-11-23'); await c2.scrollIntoViewIfNeeded(); await c2.click(); await p2.waitForTimeout(300);
  await k.pick('#pin-fx-see', 'พบแพทย์'); await p2.click('#pin-save'); await p2.waitForTimeout(400);
  await k.go('nurse'); await p2.click('#nurse-tabs [data-nursetab="today"]'); await p2.waitForTimeout(300);
  await p2.locator(`#nurse-body li:has(.hn:text-is("${HN}")) [data-att][data-st="came"]`).last().click(); await p2.waitForTimeout(300);
  await k.go('consult'); await p2.click('#cs-tabs [data-cstab="ontx"]'); await p2.waitForTimeout(300);
  const b = p2.locator(`[data-ontxrect="${CID}"]`).first();
  console.log('doctor Re-CT button', await b.count());
  await b.scrollIntoViewIfNeeded();
  await k.snap('r12-doctor-rect', { targets: ['#cs-tabs [data-cstab="ontx"]', b], area: 'targets', pad: 30, incl: [p2.locator(`#cs-ontx [data-ontx="${CID}"]`).first()] });
  await b.click(); await p2.waitForTimeout(400);
  console.log('form:', await p2.textContent('#ap-title'), '| note', await p2.inputValue('#a-note'));
  await k.pick('#a-cm', 'Non-CM');
  await p2.fill('#a-date', '2026-11-24');
  await k.snap('r13-doctor-rect-form', { targets: ['#a-cm label:has(input[value="Non-CM"])', '#a-date', '#a-note', '#ap-save'], area: '#ap-dlg', pad: 0 });
  await p2.click('#ap-save'); await p2.waitForTimeout(500);
  console.log('doctor co:', await k.toast());
  await k.close();
}
