// สร้างไฟล์ตัวอย่างไฟล์เดียว (preview/rt-queue-preview.html) สำหรับเปิดดูโดยไม่ต้องรันเซิร์ฟเวอร์
// ใช้งาน: npm run preview  — ข้อมูลเก็บในเบราว์เซอร์ และใส่ข้อมูลผู้ป่วยสมมติให้อัตโนมัติ
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, loadSources, replaceOnce, STYLE_LINK, SCRIPT_TAG } from './bundle.mjs';

const { html, css, js } = await loadSources();
let out = replaceOnce(html, '<title>ระบบนัดคิวฉายรังสี</title>', '<title>ระบบนัดคิวฉายรังสี (ตัวอย่าง)</title>');
out = replaceOnce(out, STYLE_LINK, `<style>\n${css}\n</style>`);
out = replaceOnce(
  out,
  SCRIPT_TAG,
  `<script>window.RTQ_PREVIEW = true;</script>\n<script>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`,
);

const dest = path.join(ROOT, 'preview', 'rt-queue-preview.html');
await mkdir(path.dirname(dest), { recursive: true });
await writeFile(dest, out);
console.log(`สร้างไฟล์ตัวอย่างแล้ว: ${path.relative(process.cwd(), dest)}`);
