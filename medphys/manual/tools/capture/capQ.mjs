// งานใหม่ 24 พ.ย. (หน้าเว็บ .25) · ข้อมูลตัวอย่าง วันอังคาร 24 พ.ย. 2569 · ชื่อ / HN ปลอมทั้งหมด (HN 999000901–)
//  q01 Treatment Summary: ตัวกรอง Cancel RT + เปิดเอกสาร   q02 เอกสาร: โลโก้โรงพยาบาล · วันหยุดฉาย · สาเหตุ
//  q03 ห้องตรวจ → ระหว่างฉาย: Nurse ยืนยันแล้ว = ปุ่มของแพทย์ inactive (P4P นับให้แล้ว)
import { open } from './lib.mjs';
const KEY = 'medphys-dispatch:v1', AT = '2026-11-24T09:05:00+07:00', TD = '2026-11-24';

const h = await open(AT); const { page } = h;
await page.evaluate(([k, td]) => {
  const db = JSON.parse(localStorage.getItem(k)), docs = (db.config && db.config.doctors && db.config.doctors.length ? db.config.doctors.map(d => d.code) : ['TA', 'SC', 'PM']);
  const D0 = docs[0];
  const C = (id, n, o) => ({ id, cat: 'vmetc', how: 'manual', mp: 'NY', hn: '9990009' + n, name: 'ตัวอย่าง ' + id, icd: 'C53.9', dx: 'Malignant neoplasm of cervix uteri, unspecified', doc: D0, aim: 'Curative', type: 'New',
    room: 'Infinity', area: 'Pelvis', dpf: '2', fx: '25', freq: 'Daily', ct: '2026-10-20', in: '2026-10-21', fin: '2026-10-28', eval: '2026-10-29', pc: '2026-10-30 10:00', created: '2026-10-21T03:00:00Z', ...o });
  // Cancel RT: ฉาย 10 พ.ย. – หยุดฉายตั้งแต่ 19 พ.ย. · กำลังฉาย: พบแพทย์วันนี้ แพทย์สั่ง Continue แล้ว Nurse ยืนยันแล้ว
  db.cases = (db.cases || []).filter(c => !/^QC/.test(c.id)).concat([
    C('QC1', '01', { name: 'นาง ตัวอย่าง หยุดฉาย', sim: '2026-11-10', rt: 'cancel', rtDate: '2026-11-19', rtNote: 'ผู้ป่วยขอหยุดรักษา', rtBy: 'แพทย์ ตัวอย่าง', rtAt: '2026-11-19 14:00' }),
    C('QC2', '02', { name: 'นาย ตัวอย่าง ยืนยันแล้ว', sim: '2026-11-17', icd: 'C61', dx: 'Malignant neoplasm of prostate', fx: '39' })]);
  db.visit = (db.visit || []).filter(v => !/^QV/.test(v.id)).concat([{ id: 'QV2', date: td, hn: '999000902', name: 'นาย ตัวอย่าง ยืนยันแล้ว', doc: D0, note: 'นัดพบแพทย์', by: 'พยาบาล ตัวอย่าง', at: '2026-11-20T02:00:00Z', seen: '', seenBy: '' }]);
  db.rtd = (db.rtd || []).filter(r => !/QC2/.test(r.id)).concat([{ id: td + '|QC2', date: td, case: 'QC2', hn: '999000902', name: 'นาย ตัวอย่าง ยืนยันแล้ว', doc: D0, room: 'Infinity', src: 'visit', kind: 'alone', rt: 'continue', cmt: '', note: '',
    by: 'แพทย์ ตัวอย่าง', at: td + 'T02:30:00Z', nurse: td + 'T02:45:00Z', nurseBy: 'พยาบาล ตัวอย่าง' }]);
  localStorage.setItem(k, JSON.stringify(db));
}, [KEY, TD]);
await h.day(AT);

/* ---------- q01 Treatment Summary: Cancel RT ---------- */
await h.go('txsum');
await page.evaluate(() => document.querySelector('[data-txsst="cancel"]').click()); await page.waitForTimeout(400);
console.log('list:', (await page.textContent('#txs-body')).replace(/\s+/g, ' ').slice(0, 160), await page.$$eval('[data-txsopen]', l => l.map(x => x.dataset.txsopen)));
await h.snap('q01-txs-list', { area: '#view-txsum', pad: 8, targets: ['[data-txsst="cancel"]', '[data-txsopen="rt:QC1"]'] });
/* ---------- q02 เอกสาร: โลโก้ · Cancel RT ---------- */
await page.evaluate(() => document.querySelector('[data-txsopen="rt:QC1"]').click()); await page.waitForTimeout(900);
await h.snap('q02-txs-doc', { area: 'targets', pad: 16, targets: ['#txs-prev .txs-logo', '#txs-prev .txs-stopn'], incl: ['#txs-prev .txs-hd'] });
await page.evaluate(() => document.querySelector('#txs-dlg').close()); await page.waitForTimeout(300);
/* ---------- q03 ห้องตรวจ → ระหว่างฉาย: Nurse ยืนยันแล้ว ---------- */
await h.go('consult');
await page.evaluate(() => { const t = document.querySelector('#cs-tabs [data-cstab="ontx"]'); if (t) t.click(); }); await page.waitForTimeout(500);
console.log('lock:', await page.evaluate(() => { const c = document.querySelector('[data-ontx="QC2"]'); return c ? [c.querySelector('[data-ontxsave]').disabled, (c.querySelector('.ontx-lock') || {}).textContent] : 'no card'; }));
await h.snap('q03-ontx-lock', { area: '[data-ontx="QC2"]', pad: 8, targets: ['[data-ontx="QC2"] [data-ontxsave]', '[data-ontx="QC2"] .ontx-lock'] });
console.log('errors:', h.errs.join(' | ') || 'none');
await h.close();
