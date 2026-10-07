// สร้างหน้าเว็บสำหรับคัดลอกโค้ด Apps Script ทีละไฟล์ (preview/copy-code.html) ไม่ต้องดาวน์โหลดไฟล์
// ใช้งาน: npm run build:copy  (รัน npm run build:gas ก่อนถ้าแก้โค้ดใน public/)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './bundle.mjs';

const FILES = [
  { file: 'Code.gs', name: 'Code', kind: 'สคริปต์', how: 'มีอยู่แล้วในโปรเจกต์ใหม่ — ลบโค้ดเดิมออกแล้ววางทับ' },
  { file: 'Schedule.gs', name: 'Schedule', kind: 'สคริปต์', how: 'กด ＋ › สคริปต์ แล้วพิมพ์ชื่อ Schedule (ไม่ต้องพิมพ์ .gs)' },
  { file: 'Index.html', name: 'Index', kind: 'HTML', how: 'กด ＋ › HTML แล้วพิมพ์ชื่อ Index (ไม่ต้องพิมพ์ .html) — ไฟล์นี้มีทั้งหน้าเว็บ รูปแบบ และสคริปต์' },
  {
    file: 'appsscript.json', name: 'appsscript.json', kind: 'Manifest', optional: true,
    how: 'ไม่บังคับ — เปิดได้ที่ การตั้งค่าโปรเจกต์ › แสดงไฟล์ Manifest "appsscript.json" ในเครื่องมือแก้ไข',
  },
];

const dir = path.join(ROOT, 'apps-script');
const data = await Promise.all(FILES.map(async (f) => ({ ...f, code: await readFile(path.join(dir, f.file), 'utf8') })));
const json = JSON.stringify(data).replace(/</g, '\\u003c');

const html = `<title>โค้ด Apps Script ระบบนัดคิวฉายรังสี</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap">
<style>
/* Layout: รายชื่อไฟล์ตามลำดับขั้นตอนด้านซ้าย โค้ดของไฟล์ที่เลือกอยู่ด้านขวา พร้อมปุ่มคัดลอกที่หัวโค้ด */
:root {
  --bg: #f3f5f8;
  --surface: #ffffff;
  --code-bg: #f8f9fb;
  --line: #dde2ea;
  --fg: #141821;
  --fg-2: #4d5565;
  --muted: #7a8291;
  --accent: #1c5cab;
  --accent-ink: #ffffff;
  --accent-soft: #e5eefa;
  --done: #11753a;
  --done-soft: #e3f4e8;
  --font-body: "IBM Plex Sans Thai", "Sarabun", "Noto Sans Thai", Tahoma, system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0f1218; --surface: #171b23; --code-bg: #12161d; --line: #2a303b;
    --fg: #eef1f6; --fg-2: #b9c0cc; --muted: #8b93a1;
    --accent: #5b9cf0; --accent-ink: #0b0f16; --accent-soft: #1b2a40;
    --done: #63cf8c; --done-soft: #15301f; color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #0f1218; --surface: #171b23; --code-bg: #12161d; --line: #2a303b;
  --fg: #eef1f6; --fg-2: #b9c0cc; --muted: #8b93a1;
  --accent: #5b9cf0; --accent-ink: #0b0f16; --accent-soft: #1b2a40;
  --done: #63cf8c; --done-soft: #15301f; color-scheme: dark;
}
* { box-sizing: border-box; }
html, body { height: 100%; }
body { background: var(--bg); color: var(--fg); font: 15px/1.55 var(--font-body); }
.wrap { height: 100%; display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 16px; padding-block: 16px; padding-inline: 16px; max-width: 1500px; margin: 0 auto; }
aside { display: flex; flex-direction: column; gap: 14px; min-width: 0; overflow-y: auto; }
h1 { font-size: 1.1rem; margin: 0; text-wrap: balance; line-height: 1.35; }
.sub { margin: 2px 0 0; color: var(--muted); font-size: 0.85rem; }
.files { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; counter-reset: step; }
.file-btn { width: 100%; display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--fg); cursor: pointer; text-align: left; font: inherit; }
.file-btn:hover { border-color: var(--accent); }
.file-btn[aria-current="true"] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); background: var(--accent-soft); }
.file-btn:focus-visible, .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.step { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-size: 0.8rem; font-weight: 600; background: var(--bg); color: var(--fg-2); border: 1px solid var(--line); }
.done .step { background: var(--done); border-color: var(--done); color: var(--surface); }
.fname { font-family: var(--font-mono); font-weight: 500; font-size: 0.92rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fmeta { display: block; font-family: var(--font-body); font-weight: 400; font-size: 0.76rem; color: var(--muted); }
.tag { font-size: 0.7rem; letter-spacing: 0.04em; padding: 2px 8px; border-radius: 999px; background: var(--bg); color: var(--fg-2); border: 1px solid var(--line); white-space: nowrap; }
.done .tag { background: var(--done-soft); color: var(--done); border-color: transparent; }
.steps { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; font-size: 0.85rem; color: var(--fg-2); }
.steps b { color: var(--fg); }
.steps ol { margin: 6px 0 0; padding-left: 20px; display: grid; gap: 4px; }
.steps code { font-family: var(--font-mono); font-size: 0.82rem; background: var(--bg); padding: 0 4px; border-radius: 4px; }
.warn { margin-top: 8px; color: var(--fg); }
main { min-width: 0; display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; padding: 14px 16px; border-bottom: 1px solid var(--line); }
.head-text { min-width: 0; flex: 1 1 260px; }
.head h2 { margin: 0; font-size: 1rem; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.head h2 .mono { font-family: var(--font-mono); font-size: 1.05rem; }
.head p { margin: 2px 0 0; font-size: 0.85rem; color: var(--fg-2); }
.count { font-size: 0.78rem; color: var(--muted); font-variant-numeric: tabular-nums; font-weight: 400; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.btn { display: inline-flex; align-items: center; gap: 8px; padding: 9px 18px; border-radius: 9px; border: 1px solid var(--line); background: var(--surface); color: var(--fg); font: inherit; font-weight: 500; cursor: pointer; white-space: nowrap; }
.btn:hover { border-color: var(--accent); }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-weight: 600; min-width: 150px; justify-content: center; }
.btn.primary.ok { background: var(--done); border-color: var(--done); }
.status { padding: 8px 16px; font-size: 0.85rem; background: var(--done-soft); color: var(--done); border-bottom: 1px solid var(--line); }
.code { flex: 1; min-height: 0; overflow: auto; background: var(--code-bg); }
pre { margin: 0; padding: 14px 16px; font: 13px/1.6 var(--font-mono); color: var(--fg); tab-size: 2; white-space: pre; counter-reset: ln; }
textarea.clip { position: fixed; left: -9999px; top: 0; opacity: 0; }
@media (max-width: 820px) {
  .wrap { height: auto; grid-template-columns: minmax(0, 1fr); }
  aside { overflow: visible; }
  .files { flex-direction: row; overflow-x: auto; padding-bottom: 4px; }
  .files li { flex: 0 0 auto; }
  .file-btn { width: auto; grid-template-columns: 26px auto; }
  .file-btn .tag, .fmeta { display: none; }
  main { min-height: 70vh; }
  .code { max-height: 70vh; }
  .btn.primary { flex: 1; }
}
@media (prefers-reduced-motion: no-preference) { .btn, .file-btn { transition: background-color .15s, border-color .15s; } }
</style>

<div class="wrap">
  <aside>
    <div>
      <h1>โค้ด Apps Script<br>ระบบนัดคิวผู้ป่วยฉายรังสี</h1>
      <p class="sub">เลือกไฟล์ทีละไฟล์ กดคัดลอก แล้ววางในโปรเจกต์ Apps Script</p>
    </div>
    <ul class="files" id="files"></ul>
    <div class="steps">
      <b>หลังวางครบทุกไฟล์</b>
      <ol>
        <li>กดบันทึก แล้วเลือกฟังก์ชัน <code>setup</code> กด <b>เรียกใช้</b> หนึ่งครั้ง — ระบบจะสร้าง Google Sheet เก็บข้อมูลให้ และแสดงลิงก์ใน “บันทึกการดำเนินการ”</li>
        <li>ทำให้ใช้งานได้ › รายการใหม่ › <b>เว็บแอป</b></li>
        <li>ดำเนินการในฐานะ: <b>ฉัน</b> · ผู้มีสิทธิ์เข้าถึง: <b>ทุกคน</b><br>(เข้าใช้ได้เฉพาะผู้ที่เข้าสู่ระบบด้วยบัญชี LPCH RO Workspace — ไม่ต้องแชร์ Sheet ให้ใคร)</li>
        <li>ใน LPCH RO Workspace: จัดการเมนู › เพิ่มปุ่ม ใส่ URL <code>/exec</code> ของระบบนัดคิว แล้วติ๊ก <b>เข้าสู่ระบบอัตโนมัติ</b></li>
      </ol>
      <p class="warn">อัปเดตจากเวอร์ชันก่อน: วางโค้ดใหม่ แล้ว<b>รัน setup อีกครั้ง</b>เพื่ออนุญาตสิทธิ์เชื่อมต่อ Workspace จากนั้นแก้การ Deploy เป็น “ฉัน / ทุกคน” และเลือกเวอร์ชันใหม่</p>
    </div>
  </aside>

  <main>
    <div class="head">
      <div class="head-text">
        <h2><span class="mono" id="cur-name"></span><span class="tag" id="cur-kind"></span><span class="count" id="cur-count"></span></h2>
        <p id="cur-how"></p>
      </div>
      <div class="actions">
        <button class="btn primary" id="copy" type="button">คัดลอกโค้ด</button>
        <button class="btn" id="next" type="button">ไฟล์ถัดไป ›</button>
      </div>
    </div>
    <div class="status" id="status" role="status" hidden></div>
    <div class="code" id="code-box" tabindex="0" aria-label="โค้ด"><pre id="code"></pre></div>
  </main>
</div>
<textarea class="clip" id="clip" aria-hidden="true" tabindex="-1"></textarea>

<script type="application/json" id="data">${json}</script>
<script>
(() => {
  const files = JSON.parse(document.getElementById('data').textContent);
  const $ = (id) => document.getElementById(id);
  let cur = 0;
  let done = new Set();
  try { done = new Set(JSON.parse(localStorage.getItem('rtq-copied') || '[]')); } catch {}
  const save = () => { try { localStorage.setItem('rtq-copied', JSON.stringify([...done])); } catch {} };

  function renderList() {
    $('files').innerHTML = files.map((f, i) => \`<li class="\${done.has(f.file) ? 'done' : ''}">
      <button type="button" class="file-btn" data-i="\${i}" aria-current="\${i === cur}">
        <span class="step">\${done.has(f.file) ? '✓' : i + 1}</span>
        <span class="fname">\${f.name}<span class="fmeta">\${f.file}</span></span>
        <span class="tag">\${done.has(f.file) ? 'คัดลอกแล้ว' : f.optional ? 'ไม่บังคับ' : f.kind}</span>
      </button></li>\`).join('');
  }

  function show(i) {
    cur = i;
    const f = files[i];
    $('cur-name').textContent = f.name;
    $('cur-kind').textContent = f.kind;
    $('cur-count').textContent = f.code.split('\\n').length.toLocaleString('th-TH') + ' บรรทัด';
    $('cur-how').textContent = f.how;
    $('code').textContent = f.code;
    $('code-box').scrollTop = 0;
    $('status').hidden = true;
    $('copy').textContent = 'คัดลอกโค้ด';
    $('copy').classList.remove('ok');
    $('next').hidden = i === files.length - 1;
    renderList();
  }

  function markCopied(msg) {
    const f = files[cur];
    done.add(f.file);
    save();
    $('copy').textContent = '✓ คัดลอกแล้ว';
    $('copy').classList.add('ok');
    $('status').textContent = msg;
    $('status').hidden = false;
    renderList();
  }

  function fallbackCopy(text) {
    const ta = $('clip');
    ta.value = text;
    ta.focus();
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    if (ok) return markCopied(\`คัดลอก \${files[cur].name} แล้ว — ไปวางในไฟล์ \${files[cur].name} ของ Apps Script\`);
    // คัดลอกอัตโนมัติไม่ได้: เลือกข้อความในกล่องโค้ดให้ ผู้ใช้กด Ctrl+C / ⌘C เอง
    const range = document.createRange();
    range.selectNodeContents($('code'));
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    $('status').textContent = 'เลือกโค้ดทั้งหมดให้แล้ว กด Ctrl+C (Mac: ⌘C) เพื่อคัดลอก';
    $('status').hidden = false;
  }

  $('copy').addEventListener('click', () => {
    const text = files[cur].code;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => markCopied(\`คัดลอก \${files[cur].name} แล้ว — ไปวางในไฟล์ \${files[cur].name} ของ Apps Script\`),
        () => fallbackCopy(text),
      );
    } else fallbackCopy(text);
  });
  $('next').addEventListener('click', () => show(Math.min(files.length - 1, cur + 1)));
  $('files').addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (b) show(Number(b.dataset.i));
  });
  show(0);
})();
</script>
`;

const dest = path.join(ROOT, 'preview', 'copy-code.html');
await mkdir(path.dirname(dest), { recursive: true });
await writeFile(dest, html);
console.log(`สร้างหน้าคัดลอกโค้ดแล้ว: ${path.relative(process.cwd(), dest)}`);
