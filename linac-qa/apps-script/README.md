# Linac QA บน Google Apps Script

โฟลเดอร์นี้คือชุดไฟล์สำหรับนำหน้าเว็บ Linac QA ขึ้นใช้งานบน Google Apps Script ทั้งหมด
หน้าฟอร์มและการบันทึกลง Google Sheet อยู่ในโปรเจกต์เดียวกัน เปิดได้จากลิงก์ `…/exec` ลิงก์เดียว ทั้งคอมพิวเตอร์และมือถือ

| ไฟล์ | ใส่ใน Apps Script เป็น | หน้าที่ |
|---|---|---|
| `Code.gs` | ไฟล์ Script ชื่อ `Code` | แสดงหน้าฟอร์ม (doGet), รับข้อมูลลง Sheet, เก็บรูปใน Drive |
| `Index.html` | ไฟล์ HTML ชื่อ `Index` | หน้าฟอร์ม QA (สำเนาของ `linac-qa/index.html`) |
| `appsscript.json` | (ไม่บังคับ) manifest | เขตเวลา Asia/Bangkok และค่า Web app สำหรับผู้ใช้ clasp |

## ติดตั้งครั้งแรก

1. เปิด Google Sheet ที่จะเก็บผล → **Extensions → Apps Script**
2. ไฟล์ `Code.gs`: กด Ctrl+A ในหน้าโค้ด แล้ววางเนื้อหา `Code.gs` ทับทั้งหมด
3. เพิ่มไฟล์ HTML: กด **+** ข้าง Files → **HTML** → ตั้งชื่อ `Index` (ไม่ต้องพิมพ์ .html) → ลบเนื้อหาเดิม แล้ววางเนื้อหา `Index.html` ทั้งหมด
4. กด **Save** (Ctrl+S)
5. **Project Settings** (ไอคอนเฟือง) → Time zone เลือก **(GMT+07:00) Bangkok**
6. กลับมาที่ Editor → เลือกฟังก์ชัน `setup` → **Run** → อนุญาตสิทธิ์ (ถ้าขึ้น "Google hasn't verified this app" กด Advanced → Go to … → Allow)
7. **Deploy → New deployment** → ประเภท **Web app**
   - Execute as: **Me**
   - Who has access:
     - **Anyone** เปิดได้ทุกคนที่มีลิงก์ ไม่ต้องล็อกอิน
     - **Anyone with Google account** ต้องล็อกอิน Google (Gmail) ก่อนเปิดฟอร์ม
8. คัดลอก **Web app URL** (`…/exec`) นี่คือลิงก์หน้าเว็บสำหรับทุกคน

ทดสอบ: เปิด `…/exec?ping=1` ต้องเห็น `{"ok":true,"app":"linac-qa",…}` และเปิด `…/exec` ต้องเห็นหน้าฟอร์ม

## อัปเดตภายหลัง

1. แก้ `linac-qa/index.html` แล้วรัน `linac-qa/build-apps-script.sh` เพื่อคัดลอกไปที่ `apps-script/Index.html`
2. วางไฟล์ที่เปลี่ยนลงใน Apps Script แล้ว Save
3. **Deploy → Manage deployments → ✏️ → Version: New version → Deploy** (ลิงก์ `…/exec` เดิมจะใช้โค้ดใหม่ ถ้ากด New deployment จะได้ลิงก์ใหม่)

## ข้อควรรู้

- เมื่อเปิดผ่าน Apps Script หน้าเว็บส่งข้อมูลด้วย `google.script.run` โดยตรง จึงไม่มีปัญหาเบราว์เซอร์บล็อกการเชื่อมต่อ
- ข้อมูลที่กรอกระหว่างทางและรูปเก็บในเบราว์เซอร์ของแต่ละเครื่องจนกว่าจะกดส่งไป Sheet
- ปุ่มดาวน์โหลด CSV/JSON และพิมพ์ ซ่อนไว้เมื่อเปิดผ่าน Apps Script ใช้ปุ่มคัดลอก CSV/JSON หรือดูผลใน Sheet แทน
- ระบบล็อกอินด้วย Google ในหน้าเว็บ (`AUTH`) ใช้ไม่ได้เมื่อเปิดผ่าน Apps Script ให้ใช้ Who has access = **Anyone with Google account** แทนเพื่อบังคับล็อกอิน
