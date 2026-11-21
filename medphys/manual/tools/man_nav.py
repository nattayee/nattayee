"""คู่มือ: ใช้ "ชื่อแถบที่แอดมินตั้ง" แทนชื่อเริ่มต้น
- เพิ่ม nav = { view: ชื่อที่แสดง } ใน guides.json (จาก nav.json ของระบบ · ชื่อว่าง = ชื่อเริ่มต้น)
- ข้อความที่อ้างชื่อแถบที่ตั้งชื่อใหม่ได้ เปลี่ยนเป็นโทเคน {nav:view} (ตัวแสดงคู่มือแทนค่าให้ตอนเปิด)
ใช้: python3 -I man_nav.py <guides.json> <nav.json>   (รันซ้ำได้)"""
import json, sys, re

G, N = sys.argv[1], sys.argv[2]
d = json.load(open(G, encoding='utf-8'))
nav_cfg = json.load(open(N, encoding='utf-8'))
DEFAULT = {'txsum': 'Treatment Summary', 'deptcal': 'ปฏิทินแผนก', 'flow': 'RT Workflow', 'tdfcalc': 'TDF Dose Calculator', 'sendbook': 'ทะเบียนหนังสือส่ง', 'mpleave': 'วันลา',
           'rojobs': 'RO Jobs (แพทย์)', 'reg': 'ลงทะเบียน', 'dq': 'แจกงานแพทย์', 'consult': 'ห้องตรวจ', 'nurse': 'Nurse', 'appt': 'CT Order', 'bq': 'นัดคิวใส่แร่', 'work': 'งาน',
           'pend': 'งานรอ', 'queue': 'ตารางแจกเคส', 'course': 'Complete', 'ctsim': 'CT-SIM', 'dash': 'แดชบอร์ด', 'logs': 'RC และกิจกรรม', 'p4p': 'สรุป P4P', 'jobs': 'RTT/RA Jobs', 'settings': 'ตั้งค่า'}
nav = dict(DEFAULT)
for x in nav_cfg:
    if x.get('view') in nav and str(x.get('label') or '').strip():
        nav[x['view']] = str(x['label']).strip()
d['nav'] = nav

# (ข้อความเดิม, ข้อความใหม่, จำนวนขั้นต่ำที่ต้องพบ — 0 = อาจแทนไปแล้วจากรอบก่อน)
SUBS = [
    ('กดแถบ [Complete]', 'กดแถบ [{nav:course}]'),
    ('(แถบ Complete)', '(แถบ {nav:course})'),
    ('กดแถบ [งานรอ]', 'กดแถบ [{nav:pend}]'),
    ('ผู้ป่วยไปรอที่แถบ **งาน** ของ MP', 'ผู้ป่วยไปรอที่แถบ **{nav:work}** ของ MP'),
    ('เปิดการ์ดเคสในแถบงาน', 'เปิดการ์ดเคสในแถบ {nav:work}'),
    ('เปิดแถบงานของ MP', 'เปิดแถบ {nav:work} ของ MP'),
    ('แถบ งาน → [ดึงจาก CT-SIM]', 'แถบ {nav:work} → [ดึงจาก CT-SIM]'),
    ('กด [งาน ▾] ที่เมนูด้านบน', 'กด [{nav:pend} ▾] ที่เมนูด้านบน'),
    ('เลือก [งาน]', 'เลือก [{nav:work}]'),
    ('กดแถบ [นัดคิวใส่แร่] ที่เมนูด้านบน', 'กดแถบ [{nav:bq}] ที่เมนูด้านบน'),
    ('เปิดแถบนัดคิวใส่แร่ แล้วกดลงนัด', 'เปิดแถบ {nav:bq} แล้วกดลงนัด'),
    ('แถบ นัดคิวใส่แร่ กดตัวกรอง', 'แถบ {nav:bq} กดตัวกรอง'),
    ('บันทึกในแถบนัดคิวใส่แร่ได้', 'บันทึกในแถบ {nav:bq} ได้'),
    ('นัดที่ถูกเลื่อน (นัดคิวใส่แร่ทุกครั้ง', 'นัดที่ถูกเลื่อน (นัดในแถบ {nav:bq} ทุกครั้ง'),
    ('วันใส่แร่: บันทึกในตารางนัดคิว', 'วันใส่แร่: บันทึกในตารางนัดคิว'),
]
count = {a: 0 for a, _ in SUBS}


def walk(o, key=''):
    if isinstance(o, dict):
        return {k: walk(v, k) for k, v in o.items()}
    if isinstance(o, list):
        return [walk(v, key) for v in o]
    if isinstance(o, str) and key not in ('img', 'k', 'id', 'to', 'svg'):
        for a, b in SUBS:
            if a in o and a != b:
                count[a] += o.count(a)
                o = o.replace(a, b)
    return o


flow = d.pop('flow')
navmap = d.pop('nav')
d = walk(d)
d['nav'] = navmap
svg = flow['svg']
for a, b in [('MP · งาน → ดึงจาก CT-SIM', 'MP · แถบ {nav:work}'), ('MP · {nav:work} → ดึงจาก CT-SIM', 'MP · แถบ {nav:work}'), ('RTT ห้องฉาย · Complete', 'RTT · แถบ {nav:course}'),
             ('ใส่แร่ (Brachytherapy) · แถบนัดคิวใส่แร่', 'ใส่แร่ · แถบ {nav:bq}')]:
    if a in svg:
        svg = svg.replace(a, b); count[a] = count.get(a, 0) + 1
flow['svg'] = svg
d['flow'] = flow
# ลำดับคีย์เดิม: title intro roles cases flow guides (+ nav)
d = {k: d[k] for k in ['title', 'intro', 'nav', 'roles', 'cases', 'flow', 'guides'] if k in d}

# ตรวจ: โทเคนทุกตัวรู้จัก · ไม่เหลือชื่อเริ่มต้นของแถบที่เปลี่ยนชื่อในตำแหน่งที่เป็นชื่อแถบ
text = json.dumps(d, ensure_ascii=False)
for t in set(re.findall(r'\{nav:([a-z]+)\}', text)):
    assert t in nav, t
left = [m for m in re.findall(r'(?:แถบ ?\[?|กดแถบ \[)(Complete|งานรอ|นัดคิวใส่แร่)\]?', text)]
assert not left, left
json.dump(d, open(G, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('nav labels changed from default:', {k: v for k, v in nav.items() if v != DEFAULT[k]})
for a, n in count.items():
    if n:
        print(f'  ×{n}  {a}')
print('tokens used:', sorted(set(re.findall(r'\{nav:[a-z]+\}', text))))
