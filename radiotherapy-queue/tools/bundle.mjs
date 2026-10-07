// รวมไฟล์หน้าเว็บ (HTML + CSS + JS หลายโมดูล) เพื่อใช้สร้างไฟล์ตัวอย่างและไฟล์สำหรับ Google Apps Script
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = (f) => readFile(path.join(ROOT, 'public', f), 'utf8');

// ตัด import/export ออกเพื่อรวมทุกโมดูลเป็นสคริปต์เดียว
export const stripModule = (src) =>
  src
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\n/gm, '')
    .replace(/^export (?=(const|function|async function|class) )/gm, '');

export async function loadSources() {
  const [html, css, schedule, icd, store, app] = await Promise.all([
    pub('index.html'),
    pub('css/style.css'),
    pub('js/schedule.js'),
    pub('js/icd.js'),
    pub('js/store.js'),
    pub('js/app.js'),
  ]);
  // ห่อด้วยฟังก์ชันเพื่อไม่ให้ตัวแปรรั่วไปที่ global (ใช้เป็น <script> ธรรมดาได้)
  const js = `(() => {\n${[schedule, icd, store, app].map(stripModule).join('\n')}\n})();`;
  return { html, css, schedule, icd, js };
}

export const STYLE_LINK = '<link rel="stylesheet" href="css/style.css">';
export const SCRIPT_TAG = '<script type="module" src="js/app.js"></script>';

export function replaceOnce(src, find, replacement) {
  if (!src.includes(find)) throw new Error(`ไม่พบข้อความที่ต้องแทนที่: ${find}`);
  return src.replace(find, () => replacement);
}
