"""ภาพรวมทางเดินผู้ป่วย (หน้าแรกคู่มือ): สร้าง SVG จากรายการกล่อง + เส้นเชื่อม แล้วเขียนลง guides.json → flow.svg
ใช้: python3 -I flow_build.py <guides.json>
กติกาการวาด: กล่องทุกแถวอยู่บนตาราง 5 คอลัมน์เดียวกัน · ช่องว่างระหว่างกล่อง 64px ให้ลูกศรมีก้านชัด
  เส้นเริ่มห่างกล่องต้นทาง 3px · ปลายหัวลูกศรห่างกล่องปลายทาง 4px · มุมเลี้ยวโค้งรัศมี 8px
  ป้ายเงื่อนไข (ไม่พบแพทย์ / Hold …) อยู่เหนือก้านลูกศรหรือข้างเส้นตั้ง ไม่ทับเส้นและไม่แตะกล่อง
  เส้นประสีส้ม = ย้อนกลับไปพบแพทย์ (เส้นเดียว) · ชื่อแถบเมนูเขียนเป็น {nav:view}"""
import json, sys
from html import escape

G_PATH = sys.argv[1]
W, L, BW, GAP, BH, RG = 1178, 14, 179, 64, 56, 42
CX = [L + i * (BW + GAP) for i in range(5)]          # ซ้ายของคอลัมน์ 1..5: 14 255 496 737 978
NW = 140                                             # กล่องต้นทางของทางแยก (แคบ ให้มีที่วางป้ายเงื่อนไข)
TR = L + NW + 22                                     # เส้นแกนของทางแยก
SG, CL, HL, R = 3, 4, 7, 8                           # ระยะเริ่ม · ระยะปลาย · ยาวหัวลูกศร · รัศมีมุม
out, lines, texts = [], [], []


def f(v):
    return ('%.1f' % v).rstrip('0').rstrip('.')


def box(gid, x, y, title, sub='', w=BW, h=BH, cls='st'):
    t = title if isinstance(title, list) else [title]
    s = sub if isinstance(sub, list) else ([sub] if sub else [])
    parts = ['<a href="#%s"><rect class="%s" x="%s" y="%s" width="%s" height="%s" rx="10"/>' % (gid, cls, f(x), f(y), f(w), f(h))]
    yy = y + 23
    for i, line in enumerate(t):
        parts.append('<text x="%s" y="%s">%s</text>' % (f(x + 12), f(yy), escape(line)))
        yy += 18
    yy += 1
    for line in s:
        parts.append('<text class="sub" x="%s" y="%s">%s</text>' % (f(x + 12), f(yy), escape(line)))
        yy += 16
    parts.append('</a>')
    out.append(''.join(parts))
    return {'x': x, 'y': y, 'w': w, 'h': h, 'cx': x + w / 2, 'cy': y + h / 2, 'r': x + w, 'b': y + h}


def ln(d, back=False):
    lines.append('<path class="ln%s" d="%s" marker-end="url(#%s)"/>' % (' back' if back else '', d, 'ahb' if back else 'ah'))


def right(a, b):       # a → b (b อยู่ขวา แถวเดียวกัน)
    ln('M%s %s H%s' % (f(a['r'] + SG), f(a['cy']), f(b['x'] - CL - HL)))


def left(a, b):        # a → b (b อยู่ซ้าย)
    ln('M%s %s H%s' % (f(a['x'] - SG), f(a['cy']), f(b['r'] + CL + HL)))


def down(a, b, x=None, back=False):
    x = a['cx'] if x is None else x
    ln('M%s %s V%s' % (f(x), f(a['b'] + SG), f(b['y'] - CL - HL)), back)


def up(a, b, x=None, back=False):
    x = a['cx'] if x is None else x
    ln('M%s %s V%s' % (f(x), f(a['y'] - SG), f(b['b'] + CL + HL)), back)


def fork(a, targets, straight=None):
    """จากขอบขวาของ a ไปเส้นแกน TR แล้วแยกเข้ากล่องของแต่ละแถว (มุมโค้ง) · straight = กล่องที่อยู่ระดับเดียวกับ a (เส้นตรง)"""
    y0 = a['cy']
    for t in targets:
        x1 = t['x'] - CL - HL
        if t is straight or abs(t['cy'] - y0) < 0.5:
            ln('M%s %s H%s' % (f(a['r'] + SG), f(y0), f(x1)))
            continue
        s = -1 if t['cy'] < y0 else 1
        if straight is not None:      # แกนแตกจากเส้นตรงกลาง
            ln('M%s %s V%s Q%s %s %s %s H%s' % (f(TR), f(y0), f(t['cy'] - s * R), f(TR), f(t['cy']), f(TR + R), f(t['cy']), f(x1)))
        else:                         # แยกสองทางจากปลายเส้นสั้น
            ln('M%s %s H%s Q%s %s %s %s V%s Q%s %s %s %s H%s' % (f(a['r'] + SG), f(y0), f(TR - R), f(TR), f(y0), f(TR), f(y0 + s * R),
                                                               f(t['cy'] - s * R), f(TR), f(t['cy']), f(TR + R), f(t['cy']), f(x1)))


def lbl(x, y, text, anchor='middle', back=False):
    texts.append('<text class="lbl%s" x="%s" y="%s" text-anchor="%s">%s</text>' % (' back' if back else '', f(x), f(y), anchor, escape(text)))


def sec(x, y, text):
    texts.append('<text class="sec" x="%s" y="%s">%s</text>' % (f(x), f(y), escape(text)))


STUB = (TR + CX[1]) / 2 - 1          # กึ่งกลางก้านของทางแยก (วางป้ายเงื่อนไข)

# ---------- 1) ผู้ป่วยใหม่: แถวบนซ้าย→ขวา · แถวล่างขวา→ซ้าย ----------
y1 = 32
y2 = y1 + BH + RG
sec(L, 20, 'ผู้ป่วยใหม่ · ตั้งแต่ลงทะเบียนจนฉายครั้งแรก')
a = [box('g-reg', CX[0], y1, 'ลงทะเบียน', 'ห้องบัตร'), box('g-dq', CX[1], y1, 'แจกงานแพทย์', 'Call center'),
     box('g-doc-consult', CX[2], y1, 'ลงนัด CT+RT', 'แพทย์ · ห้องตรวจ → Consult'), box('g-doc-co', CX[3], y1, 'ออก CT Order', 'แพทย์ · ยืนยันด้วย PIN'),
     box('g-nurse-ct', CX[4], y1, 'ยืนยัน CT Order', 'พยาบาล · Nurse → CT Order')]
b = [box('g-fx', CX[0], y2, 'ฉายครั้งแรก', 'RTT · แถบ {nav:course}'), box('g-nurse-today', CX[1], y2, 'Start RT วันแรก', 'พยาบาล · นัดวันนี้'),
     box('g-mp-steps', CX[2], y2, 'วางแผน → Plan complete', 'MP · ปุ่มขั้นตอนบนการ์ด'), box('g-mp-intake', CX[3], y2, 'แจกเคส', 'MP · แถบ {nav:work}'),
     box('g-ctsim', CX[4], y2, 'ลงข้อมูล CT-SIM', 'RTT ห้อง CT')]
for i in range(4):
    right(a[i], a[i + 1])
down(a[4], b[4])
for i in range(4, 0, -1):
    left(b[i], b[i - 1])

# ---------- 2) ระหว่างฉาย: บันทึกสถานะ fraction แล้วแยก 3 ทาง ----------
yF = y2 + BH + 56          # ไม่พบแพทย์
yA = yF + BH + RG          # พบแพทย์
yB = yA + BH + RG          # Hold
yR = yB + BH + RG          # Re-CT
fx = box('g-fx', L, yA + BH / 2 - 52, ['บันทึกสถานะ', 'fraction'], ['RTT ห้องฉาย', 'กดช่องวันนี้'], w=NW, h=104, cls='st hl')
down(b[0], fx, x=fx['cx'])
sec(fx['cx'] + 22, y2 + BH + 36, 'ระหว่างฉาย · ทุกวันที่ผู้ป่วยมาฉาย ห้องฉายบันทึกสถานะ fraction แล้วเลือกทาง')
norm = box('g-fx', CX[1], yF, 'ฉายต่อตามปกติ', 'Complete Fraction')
see = box('c-see', CX[1], yA, 'ส่งพบแพทย์', 'พยาบาล · นัดวันนี้')
doc = box('g-doc-ontx', CX[2], yA, 'สั่ง Continue / Hold', 'แพทย์ · ห้องตรวจ')
conf = box('g-nurse-confirm', CX[3], yA, 'ยืนยันคำสั่งแพทย์', 'พยาบาล · รับคำสั่งแพทย์')
cont = box('c-see', CX[4], yA, 'ฉายได้ → ฉายต่อ', 'ช่องวันนี้ขึ้น ฉายได้')
hold = box('c-hold', CX[3], yB, 'Hold RT', 'พักฉาย · พยาบาลติดตาม')
back = box('g-nurse-hold', CX[2], yB, 'ส่งพบแพทย์ / ยกเลิก', 'Nurse → Hold RT')
rect = [box('c-rect', CX[1], yR, 'CT Order (Re-CT#)', 'แพทย์ · กล่อง รอ CT Order'), box('g-ctsim', CX[2], yR, 'ลงข้อมูล CT-SIM', 'RTT ห้อง CT'),
        box('g-mp-rect', CX[3], yR, 'เคสเดิม · คนเดิม', 'MP · แจกเคส'), box('g-mp-steps', CX[4], yR, 'วางแผนใหม่ → ฉาย', 'MP → ห้องฉาย')]
fork(fx, [norm, see, rect[0]], straight=see)
lbl(STUB, norm['cy'] - 8, 'ไม่พบแพทย์')
lbl(STUB, see['cy'] - 8, 'พบแพทย์')
lbl(STUB, rect[0]['cy'] - 8, 'Re-CT')
right(see, doc)
right(doc, conf)
right(conf, cont)
lbl((conf['r'] + cont['x']) / 2, conf['cy'] - 8, 'Continue')
down(conf, hold)
lbl(conf['cx'] + 10, (conf['b'] + hold['y']) / 2 + 4, 'Hold', 'start')
left(hold, back)
up(back, doc, back=True)                                   # วนกลับ: พร้อมกลับมาฉาย → พบแพทย์อีกครั้ง
lbl(doc['cx'] - 10, (doc['b'] + back['y']) / 2 + 4, 'พร้อมกลับมาฉาย → พบแพทย์อีกครั้ง', 'end', back=True)
for i in range(3):
    right(rect[i], rect[i + 1])

# ---------- 3) นัดพบแพทย์ล่วงหน้า / ขอพบแพทย์วันนี้: มาแล้ว / ไม่มา ----------
yN1 = yR + BH + 50
yN2 = yN1 + BH + RG
sec(L, yN1 - 14, 'นัดพบแพทย์ล่วงหน้า / ขอพบแพทย์วันนี้')
came = box('c-see', CX[1], yN1, 'มาแล้ว → พบแพทย์', 'เหมือนแถว พบแพทย์')
miss = [box('c-noshow', CX[1], yN2, 'ไม่มา (ติดต่อแล้ว)', 'พยาบาล · นัดวันนี้'), box('g-nurse-today', CX[2], yN2, 'ผู้ป่วยไม่มาตามนัด', 'พยาบาล · ติดตามผู้ป่วย'),
        box('c-noshow', CX[3], yN2, 'ห้องฉายบันทึกต่อได้', 'ช่องวันนี้ปลดล็อก')]
book = box('g-nurse-book', L, (yN1 + yN2 + BH) / 2 - BH / 2, 'นัดพบแพทย์', 'พยาบาล · นัดพบแพทย์', w=NW)
fork(book, [came, miss[0]])
lbl(STUB, came['cy'] - 8, 'มาแล้ว')
lbl(STUB, miss[0]['cy'] - 8, 'ไม่มา')
right(miss[0], miss[1])
right(miss[1], miss[2])

# ---------- 4) ใส่แร่ ----------
yQ1 = yN2 + BH + 50
yQ2 = yQ1 + BH + RG
sec(L, yQ1 - 14, 'ใส่แร่ · แถบ {nav:bq}')
q = [box('g-bq-book', CX[0], yQ1, 'ลงนัดใส่แร่', 'ทีมใส่แร่ · แพทย์ (ปุ่ม HDR)'), box('g-bq-day', CX[1], yQ1, 'วันใส่แร่', 'ตรวจสอบ · มาแล้ว / ไม่มา'),
     box('g-bq-day', CX[2], yQ1, 'ลงชื่อผู้ทำ', 'RTT · CT · US · MP · RC')]
mv = [box('g-bq-move', CX[2], yQ2, 'เลื่อนนัด / ยกเลิก', 'ทีมใส่แร่ · เลือกวันใหม่'), box('g-nurse-mv', CX[3], yQ2, 'แจ้งผู้ป่วย', 'พยาบาล · Nurse → เลื่อนนัด')]
right(q[0], q[1])
right(q[1], q[2])
ln('M%s %s V%s Q%s %s %s %s H%s' % (f(q[1]['cx']), f(q[1]['b'] + SG), f(mv[0]['cy'] - R), f(q[1]['cx']), f(mv[0]['cy']), f(q[1]['cx'] + R), f(mv[0]['cy']), f(mv[0]['x'] - CL - HL)))
lbl((q[1]['cx'] + mv[0]['x']) / 2, mv[0]['cy'] - 8, 'เลื่อน')
right(mv[0], mv[1])

H = yQ2 + BH + 14
marker = ('<marker id="%s" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" viewBox="0 0 9 9" refX="1" refY="4.5" orient="auto">'
          '<path class="ah%s" d="M1 1.4L7.6 4.5L1 7.6z"/></marker>')
svg = ('<svg viewBox="0 0 %d %d" role="img" aria-label="ภาพรวมทางเดินผู้ป่วยใน RT Hub กดกล่องเพื่อเปิดคู่มือของขั้นนั้น"><defs>%s%s</defs>%s%s%s</svg>'
       % (W, H, marker % ('ah', ''), marker % ('ahb', ' back'), ''.join(lines), ''.join(out), ''.join(texts)))

d = json.load(open(G_PATH, encoding='utf-8'))
d['flow']['svg'] = svg
d['flow']['desc'] = 'กดกล่องเพื่อเปิดคู่มือของขั้นนั้น · ลูกศรประสีส้ม = ย้อนกลับไปพบแพทย์ · ส่วนล่างสุด = ผู้ป่วยใส่แร่'
json.dump(d, open(G_PATH, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('flow svg', W, 'x', H, len(svg), 'chars ·', len(out), 'boxes ·', len(lines), 'arrows ·', len(texts), 'labels')
