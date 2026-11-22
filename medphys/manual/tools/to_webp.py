"""แปลงภาพ png เป็น webp ลงโฟลเดอร์ shots ของคู่มือ: python3 -I to_webp.py <pngdir> <manual/shots> [คำนำหน้าชื่อภาพ = b (ชุดใส่แร่) · a · t · h …]"""
import sys, os, glob
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]; pre = sys.argv[3] if len(sys.argv) > 3 else 'b'; tot = 0
for f in sorted(glob.glob(os.path.join(src, pre + '*.png'))):
    im = Image.open(f).convert('RGB'); o = os.path.join(dst, os.path.basename(f)[:-4] + '.webp')
    im.save(o, 'WEBP', quality=82, method=6); tot += os.path.getsize(o)
    print(os.path.basename(o), im.size, os.path.getsize(o))
print('total', tot)
