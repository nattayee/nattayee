// สร้างไฟล์สำหรับ Google Apps Script ในโฟลเดอร์ apps-script/
// ใช้งาน: npm run build:gas  (Code.gs และ appsscript.json เขียนเอง ไม่ถูกสร้างทับ)
// หน้าเว็บทั้งหมดรวมไว้ใน Index.html ไฟล์เดียว เพื่อลดจำนวนไฟล์ที่ต้องสร้างใน Apps Script
import { writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, loadSources, replaceOnce, stripModule, STYLE_LINK, SCRIPT_TAG } from './bundle.mjs';

const HEADER = 'สร้างอัตโนมัติจาก public/ ด้วยคำสั่ง npm run build:gas — แก้ที่ไฟล์ต้นฉบับแล้วสร้างใหม่';
const { html, css, schedule, js } = await loadSources();
const dir = path.join(ROOT, 'apps-script');

let index = replaceOnce(html, '<head>\n', `<head>\n  <!-- ${HEADER} -->\n`);
index = replaceOnce(index, STYLE_LINK, `<style>\n${css}\n</style>`);
index = replaceOnce(index, SCRIPT_TAG, `<script>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`);

const files = {
  'Index.html': index,
  'Schedule.gs': `// ${HEADER}\n// ตรรกะคำนวณวันฉายและค่าคงที่ ใช้ร่วมกันกับหน้าเว็บ (public/js/schedule.js)\n\n${stripModule(schedule)}`,
};
for (const [name, content] of Object.entries(files)) {
  await writeFile(path.join(dir, name), content);
  console.log(`apps-script/${name}`);
}
// ไฟล์จากเวอร์ชันก่อนที่แยก CSS/JS ออกเป็นไฟล์ต่างหาก
for (const old of ['Styles.html', 'JavaScript.html']) await rm(path.join(dir, old), { force: true });
