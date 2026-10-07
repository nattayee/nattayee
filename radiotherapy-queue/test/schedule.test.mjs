import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSettings, generateTreatmentDates, cbctFractions, buildSessions, findConflicts, suggestTimes,
  phaseOf, eventsByDate, startOfWeek,
} from '../public/js/schedule.js';

const settings = { ...defaultSettings('2026-10-01'), holidays: [{ date: '2026-10-13', name: 'วันนวมินทรมหาราช' }] };

const base = {
  id: 'a', hn: '1', name: 'A', technique: 'VMAT', room: 'L1', startDate: '2026-10-09', fractions: 5,
  time: '09:00', duration: 15, cbctMode: 'fx1', status: 'active',
};

test('ข้ามเสาร์-อาทิตย์และวันหยุด', () => {
  // ศุกร์ 9 ต.ค. → จ. 12 → (13 หยุด) → 14, 15, 16
  assert.deepEqual(generateTreatmentDates('2026-10-09', 5, settings), [
    '2026-10-09', '2026-10-12', '2026-10-14', '2026-10-15', '2026-10-16',
  ]);
});

test('วันเริ่มตรงวันหยุดจะเลื่อนไปวันทำการถัดไป', () => {
  assert.equal(generateTreatmentDates('2026-10-10', 1, settings)[0], '2026-10-12');
});

test('งดฉายเฉพาะรายจะต่อท้ายคอร์ส', () => {
  const d = generateTreatmentDates('2026-10-09', 3, settings, ['2026-10-12']);
  assert.deepEqual(d, ['2026-10-09', '2026-10-14', '2026-10-15']);
});

test('รูปแบบ CBCT', () => {
  assert.deepEqual(cbctFractions('fx1', 10), [1]);
  assert.deepEqual(cbctFractions('weekly', 12), [1, 6, 11]);
  assert.deepEqual(cbctFractions('fx123_weekly', 15), [1, 2, 3, 8, 13]);
  assert.equal(cbctFractions('daily', 5).length, 5);
  assert.deepEqual(cbctFractions('none', 5), []);
});

test('กำหนดวัน CBCT เอง', () => {
  const ss = buildSessions({ ...base, cbctMode: 'custom', cbctDates: ['2026-10-14'] }, settings);
  assert.deepEqual(ss.filter((s) => s.cbct).map((s) => s.fx), [3]);
});

test('ตรวจพบเวลาซ้อนในห้องเดียวกันเท่านั้น', () => {
  const other = { ...base, id: 'b', name: 'B', startDate: '2026-10-15', time: '09:10' };
  assert.equal(findConflicts(base, [other], settings).length, 2); // 15, 16 ต.ค.
  assert.equal(findConflicts(base, [{ ...other, room: 'L2' }], settings).length, 0);
  assert.equal(findConflicts(base, [{ ...other, time: '09:15' }], settings).length, 0);
  assert.equal(findConflicts(base, [{ ...other, status: 'cancelled' }], settings).length, 0);
});

test('วันนัด CBCT ก่อนฉายนับเป็นการใช้ห้อง', () => {
  const other = { ...base, id: 'b', startDate: '2026-11-02', verifyDate: '2026-10-09', verifyTime: '09:05' };
  assert.equal(findConflicts(base, [other], settings).length, 1);
});

test('แนะนำเวลาว่างที่ไม่ชน', () => {
  const other = { ...base, id: 'b', time: '08:00' };
  const [first] = suggestTimes({ ...base, id: 'c' }, [other], settings, 1);
  assert.equal(first, '08:15');
});

test('สถานะตามวันที่', () => {
  const ss = buildSessions(base, settings);
  assert.equal(phaseOf(base, ss, '2026-10-08'), 'waiting');
  assert.equal(phaseOf(base, ss, '2026-10-13'), 'treating');
  assert.equal(phaseOf(base, ss, '2026-10-17'), 'completed');
  assert.equal(phaseOf({ ...base, status: 'hold' }, ss, '2026-10-13'), 'hold');
});

test('รวมเหตุการณ์ตามวัน ไม่รวมรายที่ยกเลิก', () => {
  const map = eventsByDate([base, { ...base, id: 'x', status: 'cancelled' }], settings);
  assert.equal(map.get('2026-10-09').length, 1);
  assert.equal(map.get('2026-10-09')[0].start, true);
});

test('สัปดาห์เริ่มวันจันทร์', () => {
  assert.equal(startOfWeek('2026-10-07'), '2026-10-05');
  assert.equal(startOfWeek('2026-10-11'), '2026-10-05');
});

test('นัดใหม่ที่ยังไม่มี id ยังตรวจชนกับนัดอื่นที่ไม่มี id ได้', () => {
  const { id, ...a } = base;
  const { id: _, ...b } = { ...base };
  assert.equal(findConflicts(a, [b], settings).length, 5);
});

test('ประกอบชื่อเต็มจากคำนำหน้า', async () => {
  const { composeName, searchIcd10 } = await import('../public/js/icd.js');
  assert.equal(composeName('นาย', 'สมชาย', 'ใจดี'), 'นายสมชาย ใจดี');
  assert.equal(composeName('ด.ญ.', 'มาลี', 'มีสุข'), 'ด.ญ.มาลี มีสุข');
  assert.equal(composeName('พระภิกษุ', 'บุญมี', ''), 'พระภิกษุ บุญมี');
  assert.equal(composeName('ร.ต.อ.', 'ปัญญา', 'ดี'), 'ร.ต.อ. ปัญญา ดี');
  assert.equal(searchIcd10('C53')[0][0], 'C53.0');
  assert.ok(searchIcd10('มะเร็งปากมดลูก').every((r) => r[0].startsWith('C53') || r[0].startsWith('D06')));
});
