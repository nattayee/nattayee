// ดึงข้อมูลผู้ป่วยจากระบบ HIS ของโรงพยาบาลตาม HN
// แปลงคำตอบของ API (รูปแบบมาตรฐานที่ระบุในคู่มือ หรือชื่อฟิลด์แบบ HOSxP) ให้เป็นฟิลด์ของฟอร์มนัด
//
// รูปแบบมาตรฐาน: GET <HIS_API_URL>?hn=<HN>  (ส่ง API key ใน header X-API-Key)
//   { "ok": true, "patient": { "hn", "prefix", "firstName", "lastName", "sex", "birthDate", "phone", "icd10", "diagnosis" } }
//   ไม่พบ HN: HTTP 404 หรือ { "ok": false, "error": "..." }

function hisPick(raw, names) {
  for (const n of names) {
    const v = raw[n];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function hisSex(v) {
  const s = String(v || '').trim().toLowerCase();
  if (['1', 'm', 'male', 'ชาย', 'ช'].includes(s)) return 'ชาย';
  if (['2', 'f', 'female', 'หญิง', 'ญ'].includes(s)) return 'หญิง';
  return '';
}

// คำนำหน้าแบบย่อที่พบใน HIS → คำนำหน้าในฟอร์ม
const HIS_PREFIX = { 'น.ส.': 'นางสาว', 'นส.': 'นางสาว', 'นส': 'นางสาว', 'ดช.': 'ด.ช.', 'ดช': 'ด.ช.', 'ดญ.': 'ด.ญ.', 'ดญ': 'ด.ญ.', 'พระ': 'พระภิกษุ', 'พระภิกษุ.': 'พระภิกษุ' };

// วันเกิด 'YYYY-MM-DD' (ค.ศ. หรือ พ.ศ.) → อายุเป็นปีเต็ม ณ วันที่ today
export function ageFromBirthDate(birth, today) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birth || ''));
  if (!m) return '';
  let y = Number(m[1]);
  if (y > 2400) y -= 543; // ปี พ.ศ.
  const [ty, tm, td] = String(today).split('-').map(Number);
  let age = ty - y;
  if (tm < Number(m[2]) || (tm === Number(m[2]) && td < Number(m[3]))) age--;
  return age >= 0 && age < 130 ? age : '';
}

export function normalizeHisPatient(body, hn, today) {
  const raw = (body && (body.patient || body.data || body)) || {};
  const birthDate = hisPick(raw, ['birthDate', 'birthdate', 'birthday', 'dob']);
  const ageRaw = hisPick(raw, ['age']);
  const p = {
    hn: hisPick(raw, ['hn', 'HN']) || String(hn || ''),
    prefix: ((x) => HIS_PREFIX[x] || x)(hisPick(raw, ['prefix', 'pname', 'title']).replace(/\s+/g, '')),
    firstName: hisPick(raw, ['firstName', 'fname', 'first_name']),
    lastName: hisPick(raw, ['lastName', 'lname', 'last_name']),
    sex: hisSex(hisPick(raw, ['sex', 'gender'])),
    age: ageRaw && /^\d{1,3}$/.test(ageRaw) ? Number(ageRaw) : ageFromBirthDate(birthDate, today),
    phone: hisPick(raw, ['phone', 'mobile', 'mobile_phone_number', 'hometel', 'telephone']),
    icd10: hisPick(raw, ['icd10', 'pdx']).toUpperCase().replace(/^([A-Z]\d{2})(\d)$/, '$1.$2'), // C539 → C53.9
    diagnosis: hisPick(raw, ['diagnosis', 'dx', 'diag_name']),
  };
  if (!p.firstName && !p.lastName) throw new Error(`HIS ไม่ได้ส่งชื่อผู้ป่วย HN ${p.hn} กลับมา`);
  return p;
}

// ข้อมูลสมมติ ใช้เฉพาะไฟล์ตัวอย่าง (preview) เพื่อให้เห็นการทำงานของปุ่ม
export function demoHisPatient(hn, today) {
  const n = [...String(hn)].reduce((s, c) => s + c.charCodeAt(0), 0);
  const female = n % 2 === 0;
  return normalizeHisPatient(
    {
      patient: {
        hn,
        prefix: female ? 'นาง' : 'นาย',
        firstName: female ? 'ทดลอง' : 'ตัวอย่าง',
        lastName: 'จาก HIS (สมมติ)',
        sex: female ? '2' : '1',
        birthDate: `${1950 + (n % 40)}-0${1 + (n % 9)}-15`,
        phone: '08x-xxx-xxxx',
        icd10: female ? 'C53.9' : 'C11.9',
      },
    },
    hn,
    today,
  );
}
