// โหมดตัวอย่างของ RT Hub: ใส่ "แถบเมนูตามที่แอดมินตั้ง" (ชื่อ · ลำดับ · กลุ่ม) ก่อนถ่ายภาพคู่มือ
// ใช้: await applyNav(page, require('./nav.json'))  หลังโหลดหน้าครั้งแรก (จะโหลดหน้าใหม่ให้เอง)
// วิธี: กด "โหลดข้อมูลตัวอย่างใหม่" ในตั้งค่า (หน้าเว็บจึงบันทึกข้อมูลตัวอย่างลง localStorage) → แก้ config.nav ในนั้น → โหลดหน้าใหม่
module.exports.applyNav = async function applyNav(page, nav) {
  if (!nav || !nav.length) return;
  const KEY = 'medphys-dispatch:v1';
  await page.evaluate(() => (document.querySelector('.nav [data-view="settings"]') || document.querySelector('[data-view="settings"]')).click());
  await page.waitForTimeout(500);
  const has = await page.evaluate(() => { const b = document.querySelector('#reset-demo'); if (!b) return false; b.click(); return true; });
  if (!has) throw new Error('applyNav: ไม่พบปุ่ม #reset-demo (ไม่ได้อยู่ในโหมดตัวอย่าง?)');
  // รอให้หน้าเว็บโหลดข้อมูลตัวอย่างเสร็จ (ข้อความ "โหลดข้อมูลตัวอย่างใหม่แล้ว") ก่อนแก้ชื่อแถบ
  await page.waitForFunction(() => /โหลดข้อมูลตัวอย่างใหม่แล้ว/.test((document.querySelector('#toast') || {}).textContent || ''), null, { timeout: 10000 }).catch(() => {});
  await page.waitForFunction(k => !!localStorage.getItem(k), KEY, { timeout: 8000 });
  await page.waitForTimeout(300);
  await page.evaluate(([k, nav]) => {
    const db = JSON.parse(localStorage.getItem(k));
    db.config = Object.assign({}, db.config, { nav: nav.map(x => Object.assign({ on: true, guest: true }, x)) });
    localStorage.setItem(k, JSON.stringify(db));
  }, [KEY, nav]);
  await page.reload();
  await page.waitForSelector('.nav');
  await page.waitForTimeout(900);
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => [...document.querySelectorAll('.nav [data-view]')].filter(e => e.getClientRects().length).map(e => e.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
};
