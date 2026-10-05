# ติดตั้งเป็น Google Apps Script Web App (บัญชี nattayee@gmail.com)

ทุกอย่างทำงานด้วยบัญชี **nattayee@gmail.com**: อ่าน TG398 LPCH, สร้างและบันทึก Output Log ใน Drive ของ nattayee
ถ้า Deploy จากบัญชีอื่น เว็บแอปจะไม่ทำงานและแสดงหน้าอธิบายวิธีแก้

โปรเจกต์ Apps Script ต้องมี **ไฟล์เดียว** คือ `Code.gs` (หน้าแอปโหลดจาก GitHub เอง)

## ขั้นตอน

1. เปิด https://script.google.com ตรวจรูปโปรไฟล์มุมขวาบนว่าเป็น **nattayee@gmail.com**
   (ถ้าเบราว์เซอร์มีหลายบัญชี ให้สลับบัญชีหรือใช้หน้าต่าง Chrome profile ของ nattayee)
2. **New project** ตั้งชื่อเช่น `TRS-398 Web App`
   (อย่าใช้โปรเจกต์เดิมที่สร้างจากบัญชีอื่น)
3. เปิดลิงก์นี้ กด Ctrl/⌘+A แล้วคัดลอก วางทับทั้งหมดใน `Code.gs` (ประมาณ 210 บรรทัด บรรทัดสุดท้ายคือ `}`):
   https://raw.githubusercontent.com/nattayee/nattayee/refs/heads/claude/brave-volta-pjvcd3/trs398-calculator/apps-script/webapp/WebApp.gs
4. บันทึก แล้วเลือกฟังก์ชัน **`setup`** → **Run** → อนุญาตสิทธิ์
   - สร้างโฟลเดอร์ `TRS-398 Output Reports` และ `TRS-398 Output Log (LPCH)` ใน Drive ของ nattayee
   - คัดลอกรายงานทุกแถวจาก Log เดิม (ของบัญชี sarayuth3266) มาไว้ใน Log ใหม่
   - ดูลิงก์ Log ใหม่ได้ใน Execution log
5. **Deploy → New deployment → Web app**
   - Execute as: **Me (nattayee@gmail.com)**
   - Who has access: **Only myself** หรือ **Anyone with Google account**
6. เปิด URL ของ Web app ท้ายหน้าจะแสดง "บัญชี Google ที่ใช้ดึงข้อมูลและบันทึกรายงาน: nattayee@gmail.com"

## หลังย้ายแล้ว

- รายงานใหม่ทั้งหมดเข้า Log ใน Drive ของ nattayee
- Log เดิม, โฟลเดอร์ Inbox/Imported และ ReportImporter.gs ของบัญชี sarayuth3266 ไม่ถูกใช้แล้ว ลบหรือเลิกแชร์ได้หลังตรวจว่า Log ใหม่ครบ
- TG398 LPCH เป็นของ nattayee อยู่แล้ว

## เมื่อแก้โค้ดของแอป

```
python3 trs398-calculator/apps-script/build_webapp.py
```

แล้ว commit + push `apps-script/webapp/index.html` เว็บแอปจะใช้หน้าใหม่ภายใน 10 นาที (ไม่ต้อง Deploy ใหม่)
ต้อง Deploy เวอร์ชันใหม่เฉพาะเมื่อแก้ `WebApp.gs`
