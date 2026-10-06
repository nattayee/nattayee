# ติดตั้งเป็น Google Apps Script Web App (เข้าสู่ระบบด้วย Google)

- ผู้ใช้ต้อง **เข้าสู่ระบบด้วยบัญชี Google** ก่อนเปิดแอป (Google บังคับเองจากการตั้ง Who has access)
- สคริปต์ทำงานในนามของ **nattayee@gmail.com** (Execute as: Me) จึงอ่าน Sheet ข้อมูลหลักและเขียน Output Log ได้เลย
  ผู้ใช้ไม่ต้องกด Authorize และไม่ต้องแชร์ไฟล์ให้ใคร
- ในโหมดนี้ Google ไม่บอกสคริปต์ว่าใครเปิด (ยกเว้น nattayee เอง) หน้าเว็บจึงมีช่อง **อีเมลผู้บันทึก (Gmail)** ที่มุมขวาบน
  กรอกครั้งเดียว เบราว์เซอร์จำไว้ และทุกรายงานบันทึกลงคอลัมน์ **ผู้บันทึก (Gmail)** (เป็นอีเมลที่ผู้ใช้กรอกเอง ไม่ได้ยืนยันกับ Google)
- ใครก็ตามที่มีลิงก์และบัญชี Google เปิดแอปและส่งรายงานเข้า Log ได้ จึงควรแชร์ลิงก์เฉพาะในทีม

โปรเจกต์ Apps Script ต้องมี **ไฟล์เดียว** คือ `Code.gs` (หน้าแอปโหลดจาก GitHub เอง)

## ติดตั้ง (ทำด้วยบัญชี nattayee@gmail.com)

1. เปิด https://script.google.com ตรวจรูปโปรไฟล์ว่าเป็น **nattayee@gmail.com** → เปิดโปรเจกต์เดิมหรือ **New project**
2. เปิดลิงก์นี้ กด Ctrl/⌘+A คัดลอก แล้ววางทับทั้งหมดใน `Code.gs`:
   https://raw.githubusercontent.com/nattayee/nattayee/refs/heads/claude/brave-volta-pjvcd3/trs398-calculator/apps-script/webapp/WebApp.gs
3. บันทึก → เลือกฟังก์ชัน **`setup`** → **Run** → อนุญาตสิทธิ์ (ทำครั้งเดียว ถ้าเคยรันแล้วจะใช้ Log เดิม)
4. **Deploy → New deployment → Web app** (หรือ Manage deployments → ✏ Edit → Version: New version ถ้ามีอยู่แล้ว)
   - Execute as: **Me (nattayee@gmail.com)**
   - Who has access: **Anyone with Google account**
5. ส่ง URL ของ Web app ให้ผู้ใช้

## เปิด Log ใน Google Sheets ได้ (ไม่บังคับ)

ใส่ Gmail ใน `EDITORS` → บันทึก → รันฟังก์ชัน **`shareLog`** (ด้วยบัญชี nattayee) คนในรายชื่อจะแก้ไข/ดู Log ใน Google Sheets ได้โดยตรง
(การใช้งานเว็บแอปไม่ต้องทำขั้นนี้)

## เมื่อแก้โค้ดของแอป

```
python3 trs398-calculator/apps-script/build_webapp.py
```

แล้ว commit + push `apps-script/webapp/index.html` เว็บแอปจะใช้หน้าใหม่ภายใน 10 นาที (ไม่ต้อง Deploy ใหม่)
ต้อง Deploy เวอร์ชันใหม่เฉพาะเมื่อแก้ `WebApp.gs`
