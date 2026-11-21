"""สร้าง index.html แบบหน้าเดี่ยว (มี head / body ครบ) จาก index.src.html ที่ใช้เผยแพร่ · ใช้: python3 -I man_build.py <index.src.html> <index.html>"""
import sys
src = open(sys.argv[1], encoding='utf-8').read()
i = src.index('\n<div class="wrap">')
head, body = src[:i].strip(), src[i:].strip()
html = ('<!doctype html>\n<html lang="th">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        + head + '\n</head>\n<body style="margin:0">\n' + body + '\n</body>\n</html>\n')
open(sys.argv[2], 'w', encoding='utf-8').write(html)
print('built', sys.argv[2], len(html.encode()))
