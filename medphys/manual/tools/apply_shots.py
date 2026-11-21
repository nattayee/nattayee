"""ถ่ายภาพชุดใส่แร่ใหม่ (bq_shots.js) แล้วอัปเดตขนาดภาพและตำแหน่งกรอบใน guides.json
ใช้: python3 -I apply_shots.py <shots.json> <guides.json>   (จับคู่ด้วย shot.k)"""
import json, sys
meta = json.load(open(sys.argv[1], encoding='utf-8')); d = json.load(open(sys.argv[2], encoding='utf-8')); n = 0
for g in d['guides']:
    for s in g['steps']:
        sh = s.get('shot') or {}
        m = meta.get(sh.get('k', ''))
        if m:
            assert len(m['marks']) <= len(s.get('acts', [])), (g['id'], s['title'])
            sh.update(img=m['img'], w=m['w'], h=m['h'], marks=m['marks']); n += 1
json.dump(d, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('updated', n, 'steps')
