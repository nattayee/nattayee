// สร้างไฟล์สำหรับ Google Apps Script ในโฟลเดอร์ apps-script/
// ใช้งาน: npm run build:gas  (Code.gs และ appsscript.json เขียนเอง ไม่ถูกสร้างทับ)
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, loadSources, replaceOnce, stripModule, STYLE_LINK, SCRIPT_TAG } from './bundle.mjs';

const HEADER = 'สร้างอัตโนมัติจาก public/ ด้วยคำสั่ง npm run build:gas — แก้ที่ไฟล์ต้นฉบับแล้วสร้างใหม่';
const { html, css, schedule, js } = await loadSources();
const dir = path.join(ROOT, 'apps-script');

let index = replaceOnce(html, STYLE_LINK, "<?!= include('Styles'); ?>");
index = replaceOnce(index, SCRIPT_TAG, "<?!= include('JavaScript'); ?>");
if (/<\?(?!!= include)/.test(index.replace(/<\?!= include\('\w+'\); \?>/g, ''))) {
  throw new Error('Index.html มีข้อความ <? ที่จะถูกตีความเป็น scriptlet');
}

const files = {
  'Index.html': replaceOnce(index, '<head>\n', `<head>\n  <!-- ${HEADER} -->\n`),
  'Styles.html': `<!-- ${HEADER} -->\n<style>\n${css}\n</style>\n`,
  'JavaScript.html': `<!-- ${HEADER} -->\n<script>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>\n`,
  'Schedule.gs': `// ${HEADER}\n// ตรรกะคำนวณวันฉายและค่าคงที่ ใช้ร่วมกันกับหน้าเว็บ (public/js/schedule.js)\n\n${stripModule(schedule)}`,
};
for (const [name, content] of Object.entries(files)) {
  await writeFile(path.join(dir, name), content);
  console.log(`apps-script/${name}`);
}
