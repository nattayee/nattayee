# ติดตั้งเป็น Google Apps Script Web App

โปรเจกต์ Apps Script ต้องมี **ไฟล์เดียว** คือ `Code.gs` ที่มีเนื้อหาของ `WebApp.gs`
หน้าแอป (`index.html`) ถูกโหลดจาก GitHub อัตโนมัติ ไม่ต้องวางเอง และเมื่อแอปอัปเดต เว็บแอปจะได้ของใหม่เองภายใน 10 นาที

## ขั้นตอน

1. เปิดไฟล์ WebApp.gs แบบข้อความล้วน แล้วคัดลอกทั้งหมด (Ctrl/⌘+A แล้ว Ctrl/⌘+C):
   https://raw.githubusercontent.com/nattayee/nattayee/refs/heads/claude/brave-volta-pjvcd3/trs398-calculator/apps-script/webapp/WebApp.gs
2. ใน Apps Script: เปิด `Code.gs` ลบของเดิมทั้งหมด แล้ววาง ตรวจว่าบรรทัดสุดท้ายคือ `}` และมีประมาณ 105 บรรทัด
3. **ลบไฟล์ `Index.html`** (ไม่ใช้แล้ว)
4. บันทึก (⌘/Ctrl+S) → Deploy → New deployment → ประเภท Web app
   - Execute as: **Me**
   - Who has access: **Only myself** หรือ **Anyone with Google account**
     (ทุกคนที่เปิดลิงก์ได้จะบันทึกรายงานลง Log ได้)
5. Authorize: อนุญาต Drive, Sheets และ "Connect to an external service" แล้วเปิด URL ของ Web app

## ทำงานอย่างไร

- `doGet` โหลดหน้าแอปจาก GitHub (branch `claude/brave-volta-pjvcd3`) และเก็บ cache ไว้ 10 นาที
- `apiExportXlsx` อ่าน TG398 LPCH และ Log Sheet ให้หน้าแอป (อ่านได้เฉพาะ 2 ไฟล์ใน `WEBAPP`)
- `apiAppendReport` บันทึกรายงานลงแท็บ Log ทันที จับคู่คอลัมน์ตามชื่อ ไม่บันทึก Report ID ซ้ำ

ผู้ที่ push เข้า repository `nattayee/nattayee` ได้ จะเปลี่ยนหน้าเว็บแอปได้ด้วย ถ้าภายหลังย้ายโค้ดไป branch อื่น ให้แก้ `PAGE_URL`

## เมื่อแก้โค้ดของแอป

```
python3 trs398-calculator/apps-script/build_webapp.py
```

แล้ว commit + push `apps-script/webapp/index.html` เว็บแอปจะใช้หน้าใหม่ภายใน 10 นาที (ไม่ต้อง Deploy ใหม่)
ต้อง Deploy เวอร์ชันใหม่เฉพาะเมื่อแก้ `WebApp.gs`
