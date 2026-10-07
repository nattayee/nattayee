// สร้างไฟล์ตัวอย่างไฟล์เดียว (preview/rt-queue-preview.html) สำหรับเปิดดูโดยไม่ต้องรันเซิร์ฟเวอร์
// ใช้งาน: npm run preview  — ข้อมูลเก็บในเบราว์เซอร์ และใส่ข้อมูลผู้ป่วยสมมติให้อัตโนมัติ
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = (f) => readFile(path.join(ROOT, 'public', f), 'utf8');

// ตัด import/export ออกเพื่อรวมทุกโมดูลเป็นสคริปต์เดียว
const strip = (src) =>
  src
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\n/gm, '')
    .replace(/^export (?=(const|function|async function|class) )/gm, '');

const [html, css, schedule, store, app] = await Promise.all([
  pub('index.html'),
  pub('css/style.css'),
  pub('js/schedule.js'),
  pub('js/store.js'),
  pub('js/app.js'),
]);

const js = [schedule, store, app].map(strip).join('\n');
const out = html
  .replace('<title>ระบบนัดคิวฉายรังสี</title>', '<title>ระบบนัดคิวฉายรังสี (ตัวอย่าง)</title>')
  .replace('<link rel="stylesheet" href="css/style.css">', () => `<style>\n${css}\n</style>`)
  .replace(
    '<script type="module" src="js/app.js"></script>',
    () => `<script>window.RTQ_PREVIEW = true;</script>\n<script type="module">\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`,
  );

const dest = path.join(ROOT, 'preview', 'rt-queue-preview.html');
await mkdir(path.dirname(dest), { recursive: true });
await writeFile(dest, out);
console.log(`สร้างไฟล์ตัวอย่างแล้ว: ${path.relative(process.cwd(), dest)}`);
