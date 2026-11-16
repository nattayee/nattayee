#!/usr/bin/env python3
"""ฝังหน้าเว็บ TDF Dose Calculator ลงในแถบ TDF Dose Calculator ของ index.html (แถบย่อยของ Planning)

ใช้หน้าเว็บ TDF ต้นฉบับ (tdf-calculator/index.html + tdf.js จาก branch ของเว็บ TDF) แล้วแปลงให้อยู่ในหน้านี้ได้:
  - หน้าตาเดิมทั้งหมดอยู่ใน Shadow DOM (สไตล์ของสองหน้าไม่ปนกัน) · :root → :host · ธีมกลางวัน/กลางคืนตามหน้านี้
  - รายงาน A4 (สร้าง PDF / พิมพ์) อยู่นอก Shadow DOM เพราะ html2canvas อ่านได้เฉพาะ document หลัก
  - สคริปต์เดิมห่อเป็น window.tdfxMount(root, wrap, env) · ที่บันทึก (backend) และผู้ใช้มาจากหน้านี้
  - รายชื่อแพทย์ในโค้ดเดิมถูกแทนด้วยรายชื่อแพทย์ใน ตั้งค่า ของระบบนี้ (ไม่เก็บชื่อจริงในโค้ด)
แล้วแทนที่ส่วนระหว่าง <!-- TDF-EMBED:BEGIN x --> … <!-- TDF-EMBED:END x --> ใน index.html (x = css, tpl, js)

ใช้: python3 medphys/tools/tdf_embed.py [ref ของเว็บ TDF (ค่าเริ่มต้น origin/claude/practical-cerf-k0tdhp)]
"""
import io
import os
import re
import subprocess
import sys

REF = sys.argv[1] if len(sys.argv) > 1 else 'origin/claude/practical-cerf-k0tdhp'
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
PAGE = os.path.join(REPO, 'medphys', 'index.html')


def git_show(path):
    return subprocess.check_output(['git', '-C', REPO, 'show', REF + ':' + path]).decode('utf-8')


def one(src, old, new, what):
    if src.count(old) != 1:
        sys.exit('TDF ต้นฉบับเปลี่ยนไป: หา "%s" ไม่พบ (หรือพบหลายที่) · %s' % (old[:70], what))
    return src.replace(old, new)


html = git_show('tdf-calculator/index.html')
lib = git_show('tdf-calculator/tdf.js')
commit = subprocess.check_output(['git', '-C', REPO, 'rev-parse', '--short', REF]).decode().strip()

# ---------- ส่วนของหน้าเดิม ----------
css = html[html.index('<style>') + 7:html.index('</style>')]
body = html[html.index('<body>') + 6:html.index('<script src="tdf.js"></script>')]
js_start = html.index('<script>', html.index('<script src="tdf.js"></script>'))
app = html[js_start + 8:html.rindex('</script>')]

# ---------- CSS ----------
css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)


def blocks(text):
    """บล็อกระดับบนสุดของ CSS (กฎ หรือ @media) ตามลำดับ"""
    out, depth, start = [], 0, 0
    for i, ch in enumerate(text):
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                out.append(text[start:i + 1].strip())
                start = i + 1
    return [b for b in out if b]


shadow, report = [':host { display: block; }'], []
font_vars = ''
for b in blocks(css):
    sel = b[:b.index('{')].strip()
    if sel == ':root':
        font_vars = ' '.join(re.findall(r'--font-(?:body|mono):[^;]+;', b))
        shadow.append(':host' + b[len(sel):])
    elif sel.startswith('@media (prefers-color-scheme: dark)'):
        shadow.append(one(b, ':root:not([data-theme="light"])', ':host(:not([data-theme="light"]))', 'dark mode'))
    elif sel == ':root[data-theme="dark"]':
        shadow.append(':host([data-theme="dark"])' + b[len(sel):])
    elif sel == 'html, body':
        continue
    elif sel == 'body':
        shadow.append('.tdfx-body' + b[len(sel):])
    elif sel.startswith('@media print'):
        continue   # พิมพ์: ใช้กฎของหน้านี้ (ด้านล่าง) แทน
    elif all(s.strip().startswith('.report') for s in sel.split(',')):
        report.append(re.sub(r'\.report\b', '.tdfx-report', b))
    else:
        if '.report' in sel or re.search(r'(^|[\s,])(html|body)\b', sel):
            sys.exit('กฎ CSS ที่ยังไม่รู้วิธีแปลง: ' + sel)
        shadow.append(b)
shadow.append('.tdfx-body { border-radius: 12px; padding-top: 2px; }')
# 18 พ.ย.: ไม่มีช่องคำนำหน้าชื่อ (ซ่อนไว้ · บันทึกเป็น "-" = อื่น ๆ / ไม่มี ของเว็บ TDF) · แถบผู้ป่วยเหลือ 4 ช่อง
shadow.append('.case-fields { grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) minmax(0, 1.4fr) minmax(0, 1.6fr); }')
shadow.append('@media (max-width: 900px) { .case-fields { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }')
report.insert(0, '.tdfx-report { %s }' % font_vars)
report.append('@media print { html.tdfx-printing body { background: #FFFFFF !important; margin: 0 !important; padding: 0 !important; }'
              ' html.tdfx-printing body > :not(.tdfx-report) { display: none !important; }'
              ' html.tdfx-printing .tdfx-report { position: static; left: auto; }'
              ' html.tdfx-printing .tdfx-report .rp-block { break-inside: avoid; } }')
squash = lambda t: re.sub(r'\s*\n\s*', ' ', t).strip()
shadow_css = '\n'.join(squash(b) for b in shadow)
report_css = '\n'.join(squash(b) for b in report)

# ---------- HTML ----------
body = one(body, '<div class="report" id="report" aria-hidden="true"></div>', '', 'report div')
body = one(body, '<div class="field"><label for="pt-prefix">', '<div class="field" hidden><label for="pt-prefix">', 'prefix field')
body = '<div class="tdfx-body">' + body.strip() + '\n</div>'

# ---------- สคริปต์ ----------
app = app.strip()
app = one(app, '(function () {\n  "use strict";', 'window.tdfxMount = function (root, wrap, env) {\n  "use strict";', 'IIFE head')
if not app.endswith('})();'):
    sys.exit('TDF ต้นฉบับเปลี่ยนไป: ท้ายสคริปต์ไม่ใช่ })();')
app = app[:-len('})();')] + '  return api;\n};'
app = one(app, 'const $ = (id) => document.getElementById(id);', 'const $ = (id) => root.getElementById(id) || document.getElementById(id);', '$')
app, n = re.subn(r'  const PHYSICIANS = \[[^\]]*\];', '  const PHYSICIANS = (env.doctors || []).slice();   // รายชื่อแพทย์จาก ตั้งค่า ของระบบนี้', app)
if n != 1:
    sys.exit('TDF ต้นฉบับเปลี่ยนไป: หา PHYSICIANS ไม่พบ')
app = app.replace('document.querySelectorAll(', 'root.querySelectorAll(').replace('document.querySelector(', 'root.querySelector(')
app = one(app, 'document.activeElement', 'root.activeElement', 'activeElement')
app = one(app, 'document.body.classList.toggle("view-only", ro);', 'wrap.classList.toggle("view-only", ro);', 'view-only')
app = one(app, '["pt-prefix", "คำนำหน้าชื่อ"], ', '', 'prefix required')
app = one(app, '    Object.entries(PT_FIELDS).forEach(([k, id]) => { p[k] = $(id).value.trim(); });\n    return p;',
          '    Object.entries(PT_FIELDS).forEach(([k, id]) => { p[k] = $(id).value.trim(); });\n    if (!p.prefix) p.prefix = "-";   // ไม่มีช่องคำนำหน้า: "-" = อื่น ๆ / ไม่มี (รายการที่เปิดจากเว็บ TDF ใช้คำนำหน้าเดิม)\n    return p;', 'getPatient')
app = one(app, 'const r = $("report");', 'const r = $("tdfx-report");', 'report element')
app = one(app, 'doc.getElementById("report")', 'doc.getElementById("tdfx-report")', 'report clone')
app = one(app, 'setTimeout(() => window.print(), 300);', 'setTimeout(() => env.print(), 300);', 'print')
app = one(app, 'const hash = (location.hash || "").slice(1);', 'const hash = "";', 'hash')
app = one(app, '''  window.addEventListener("hashchange", () => {
    const h = location.hash.slice(1);
    if (tabs.some(([k]) => k === h)) selectTab(h);
  });
''', '', 'hashchange')
app = one(app, '  window.TDFApp = {\n', '''  // ผู้ใช้แก้ HN / ชื่อ / สกุลเอง = ผู้ป่วยคนใหม่ · ล้างคำนำหน้า (ที่ซ่อนอยู่) ของรายการที่เปิดไว้
  ["pt-hn", "pt-first", "pt-last"].forEach((id) => $(id).addEventListener("input", (e) => { if (e.isTrusted) $("pt-prefix").value = ""; }));
  const api = {
    canEdit: () => canEdit(),
    // ผู้ป่วยจากระบบนี้: กรอกแถบผู้ป่วยให้ (ผู้ใช้แก้ต่อได้)
    prefill(p) {
      if (!p || !p.hn || !canEdit()) return false;
      setPatient({ hn: p.hn, prefix: "", first: p.first, last: p.last }, p.doctor || "");
      clearPatientErrors();
      $("pt-hn").dispatchEvent(new Event("input"));
      return true;
    },
    // รายชื่อแพทย์ของ ตั้งค่า (โหลดหลังหน้า TDF ได้) · ค่าที่เลือกไว้ยังอยู่
    setDoctors(list) {
      const sel = $("pt-doctor"), cur = sel.value;
      PHYSICIANS.length = 0;
      (list || []).forEach((n) => PHYSICIANS.push(n));
      sel.innerHTML = `<option value="">— เลือกแพทย์ —</option>` + PHYSICIANS.map((n) => `<option>${esc(n)}</option>`).join("");
      if (cur && ![...sel.options].some((o) => o.value === cur)) sel.add(new Option(cur, cur));
      sel.value = cur;
    },
''', 'TDFApp')
for bad in ('document.getElementById(', 'location.', 'window.TDFApp', 'document.body'):
    rest = app.replace('root.getElementById(id) || document.getElementById(id)', '')
    if bad in rest:
        sys.exit('ยังมี %s ในสคริปต์ที่ฝัง' % bad)

js = ('/* TDF Dose Calculator (ฝังจากเว็บ TDF รุ่น %s · สร้างด้วย medphys/tools/tdf_embed.py ห้ามแก้ตรงนี้) */\n' % commit
      + lib.strip() + '\n' + app + '\n')

# ---------- ใส่ใน index.html ----------
page = io.open(PAGE, encoding='utf-8').read()


def put(page, key, text):
    a, b = '<!-- TDF-EMBED:BEGIN %s -->' % key, '<!-- TDF-EMBED:END %s -->' % key
    i, j = page.find(a), page.find(b)
    if i < 0 or j < i:
        sys.exit('index.html ไม่มีตำแหน่ง ' + a)
    return page[:i + len(a)] + '\n' + text + '\n' + page[j:]


page = put(page, 'css', '<style id="tdfx-report-css">\n' + report_css + '\n</style>')
page = put(page, 'tpl', '<template id="tdfx-tpl"><style>\n' + shadow_css + '\n</style>\n' + body + '\n</template>')
page = put(page, 'js', '<script>\n' + js + '</script>')
io.open(PAGE, 'w', encoding='utf-8').write(page)
print('TDF %s → index.html · css %d · template %d · script %d ตัวอักษร' % (commit, len(report_css), len(shadow_css) + len(body), len(js)))
