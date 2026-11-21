"""อ่านเฉพาะชื่อแถบเมนู (config.nav) จากไฟล์ข้อมูลจริงที่ส่งออกมา แล้วพิมพ์เฉพาะ view / label / parent / on — ไม่พิมพ์ข้อมูลอื่น
ใช้: python3 -I cfg_nav.py <file.xlsx> <out.json>"""
import sys, json
from openpyxl import load_workbook
wb = load_workbook(sys.argv[1], read_only=True, data_only=True)
if 'Config' not in wb.sheetnames:
    print('no Config sheet'); sys.exit(1)
nav = None
for row in wb['Config'].iter_rows(min_row=2, max_col=2, values_only=True):
    if row and row[0] == 'nav':
        nav = json.loads(row[1]); break
wb.close()
if nav is None:
    print('no nav key in Config'); sys.exit(1)
out = [{k: x.get(k) for k in ('view', 'label', 'parent', 'on') if k in x} for x in nav if isinstance(x, dict)]
json.dump(out, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for x in out:
    print(x)
