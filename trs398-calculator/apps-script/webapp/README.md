# ติดตั้งเป็น Google Apps Script Web App (เข้าสู่ระบบด้วย Gmail)

- ผู้ใช้ต้อง **เข้าสู่ระบบด้วยบัญชี Gmail** ก่อนเปิดแอป (Google บังคับเอง)
- หัวหน้าเว็บแสดง "เข้าสู่ระบบเป็น …@gmail.com" และทุกรายงานบันทึกคอลัมน์ **ผู้บันทึก (Gmail)**
  ซึ่ง `WebApp.gs` ใส่จากบัญชีที่เข้าสู่ระบบจริง (แก้จากหน้าเว็บไม่ได้)
- ไฟล์ข้อมูลหลักและ Output Log เป็นของ **nattayee@gmail.com** เฉพาะบัญชีใน `EDITORS` บันทึกรายงานได้

โปรเจกต์ Apps Script ต้องมี **ไฟล์เดียว** คือ `Code.gs` (หน้าแอปโหลดจาก GitHub เอง)

## ติดตั้ง (ทำด้วยบัญชี nattayee@gmail.com)

1. เปิด https://script.google.com ตรวจรูปโปรไฟล์ว่าเป็น **nattayee@gmail.com** → **New project**
2. เปิดลิงก์นี้ กด Ctrl/⌘+A คัดลอก แล้ววางทับทั้งหมดใน `Code.gs`:
   https://raw.githubusercontent.com/nattayee/nattayee/refs/heads/claude/brave-volta-pjvcd3/trs398-calculator/apps-script/webapp/WebApp.gs
3. แก้รายชื่อ Gmail ที่ใช้งานได้ใน `EDITORS` เช่น
   `EDITORS: ['nattayee@gmail.com', 'xxx@gmail.com', 'yyy@gmail.com'],`
4. บันทึก → เลือกฟังก์ชัน **`setup`** → **Run** → อนุญาตสิทธิ์
   (สร้าง Log ใน Drive ของ nattayee คัดลอกรายงานเดิม และแชร์ให้ทุกคนใน EDITORS แก้ไขได้)
5. **Deploy → New deployment → Web app**
   - Execute as: **User accessing the web app**
   - Who has access: **Anyone with Google account**
6. ส่ง URL ของ Web app ให้ผู้ใช้ ครั้งแรกแต่ละคนต้องกด Authorize (อาจเห็นคำเตือน "Google hasn't verified this app"
   ให้กด Advanced → Go to … เพราะเป็นแอปภายในของเราเอง)

## เพิ่มผู้ใช้ภายหลัง

แก้ `EDITORS` → บันทึก → รันฟังก์ชัน **`shareLog`** (ด้วยบัญชี nattayee) แล้ว Deploy → Manage deployments → Edit → New version

## เมื่อแก้โค้ดของแอป

```
python3 trs398-calculator/apps-script/build_webapp.py
```

แล้ว commit + push `apps-script/webapp/index.html` เว็บแอปจะใช้หน้าใหม่ภายใน 10 นาที (ไม่ต้อง Deploy ใหม่)
ต้อง Deploy เวอร์ชันใหม่เฉพาะเมื่อแก้ `WebApp.gs`
