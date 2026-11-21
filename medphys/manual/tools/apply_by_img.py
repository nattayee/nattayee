"""ถ่ายภาพชุดหลักใหม่ (cap*.mjs → raw/shots.json) แล้วอัปเดตขนาดภาพและตำแหน่งกรอบใน guides.json โดยจับคู่ด้วยชื่อภาพ
ใช้: python3 -I apply_by_img.py <raw/shots.json> <guides.json>   (ขั้นที่มี shot.k = ชุดใส่แร่ ใช้ apply_shots.py)"""
import json, sys
rec = json.load(open(sys.argv[1], encoding='utf-8')); d = json.load(open(sys.argv[2], encoding='utf-8')); n = 0; miss = set()
for g in d['guides']:
    for s in g['steps']:
        sh = s.get('shot')
        if not sh or sh.get('k'):
            continue
        r = rec.get(sh['img'].split('/')[-1][:-5])
        if not r:
            miss.add(sh['img']); continue
        assert len(r['marks']) <= len(s.get('acts', [])), (g['id'], s['title'], len(r['marks']), len(s.get('acts', [])))
        sh.update(w=r['w'], h=r['h'], marks=r['marks']); n += 1
json.dump(d, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('updated', n, 'steps · images without a record:', sorted(miss))
