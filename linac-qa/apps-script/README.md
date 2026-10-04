# Linac QA บน Google Apps Script

โฟลเดอร์นี้คือชุดไฟล์สำหรับนำหน้าเว็บ Linac QA ขึ้นใช้งานบน Google Apps Script ทั้งหมด
หน้าฟอร์มและการบันทึกลง Google Sheet อยู่ในโปรเจกต์เดียวกัน เปิดได้จากลิงก์ `…/exec` ลิงก์เดียว ทั้งคอมพิวเตอร์และมือถือ

| ไฟล์ | ใส่ใน Apps Script เป็น | หน้าที่ |
|---|---|---|
| `Code.gs` | ไฟล์ Script ชื่อ `Code` | แสดงหน้าฟอร์ม (doGet), รับข้อมูลลง Sheet, เก็บรูปใน Drive |
| `Index.html` | (ไม่บังคับ) ไฟล์ HTML ชื่อ `Index` | หน้าฟอร์ม QA สำรอง ปกติ `Code.gs` โหลดหน้าฟอร์มจาก GitHub (`CONFIG.PAGE_URL`) เอง |
| `appsscript.json` | (ไม่บังคับ) manifest | เขตเวลา Asia/Bangkok และค่า Web app สำหรับผู้ใช้ clasp |

## ติดตั้งครั้งแรก

ปกติวางแค่ `Code.gs` ก็พอ หน้าฟอร์มโหลดจาก GitHub อัตโนมัติ (อัปเดตตามที่ push ภายใน ~10 นาที หรือเปิด `…/exec?refresh=1` เพื่อโหลดใหม่ทันที)


1. เปิด Google Sheet ที่จะเก็บผล → **Extensions → Apps Script** (ถ้าสร้างโปรเจกต์จาก script.google.com เอง ให้ใส่ ID ของ Sheet ใน `CONFIG.SHEET_ID`)
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

## เข้าสู่ระบบด้วย Gmail

1. รัน `setup` อีกครั้ง (สร้างโฟลเดอร์รูปกลาง "Linac QA Photos" และจำ ID ไว้) ดูลิงก์ Sheet และโฟลเดอร์ได้ใน Execution log
2. **แชร์ Google Sheet และโฟลเดอร์ "Linac QA Photos"** ให้ Gmail ของเจ้าหน้าที่แต่ละคนเป็น **Editor** รายชื่อที่แชร์คือรายชื่อคนที่ใช้ระบบได้
3. Deploy → Manage deployments → ✏️
   - Execute as: **User accessing the web app**
   - Who has access: **Anyone with Google account**
   - Version: **New version** → Deploy
4. เปิด `…/exec` ครั้งแรก Google จะให้ล็อกอิน Gmail และขออนุญาตสิทธิ์ 1 ครั้ง (ถ้าขึ้น "Google hasn't verified this app" กด Advanced → Go to … → Allow)

หลังล็อกอิน หัวหน้าเว็บจะแสดงอีเมลผู้ใช้ และ Sheet บันทึก Gmail ของผู้ใช้อัตโนมัติ: คอลัมน์ Email ในแท็บ Records, Results, Photos และแท็บ **Log** (เวลา, Gmail, เปิดฟอร์ม / ส่งผล / ส่งไม่สำเร็จ / ถูกปฏิเสธ) บัญชีที่ไม่ได้รับแชร์ Sheet จะเห็นข้อความว่ายังไม่มีสิทธิ์ และมีปุ่มเข้าสู่ระบบด้วยบัญชีอื่น

ตั้งค่าเพิ่มเติมใน `CONFIG` ของ `Code.gs`:
- `ALLOWED_EMAILS` / `ALLOWED_DOMAINS` จำกัดรายชื่อให้แคบกว่าคนที่แชร์ Sheet
- `PHYSICIST_EMAILS` จับคู่อีเมลกับชื่อ Physicist เพื่อติ๊กชื่อให้อัตโนมัติ เช่น `{ 'someone@gmail.com': 'วันนิตา มะลิลา' }`

## Dashboard

กดปุ่ม **Dashboard** ที่หัวหน้าเว็บ (หรือเปิด `…/exec#dashboard`)

- ตัวกรอง: เครื่อง, ความถี่ของ QA, ช่วงเวลา (ทั้งหมด / 30 / 90 วัน / 1 ปี)
- สรุป: จำนวนครั้งที่บันทึก, ผ่านทุกรายการ, มีรายการไม่ผ่าน, ครั้งล่าสุด
- Trend: เลือกรายการตรวจ แสดงค่าแต่ละครั้งเทียบแถบเกณฑ์ (Δ จากค่าตั้งสำหรับมุม/ระยะ, ค่าที่วัดสำหรับ flatness/symmetry/dose diff) ชี้ที่จุดเพื่อดูค่า กดเพื่อเปิดรายละเอียด
- ประวัติการบันทึก: กดแถวเพื่อดูผลทุกรายการของครั้งนั้น (กรองเฉพาะที่ไม่ผ่านได้) ลิงก์รูป และ **เปิดในฟอร์ม** เพื่อแก้ไขแล้วส่งซ้ำ (อัปเดตแถวเดิม รูปเดิมใน Drive ยังอยู่)

ข้อมูลอ่านจาก Google Sheet (`getHistory`, `getRecord`, `getTrend` ใน `Code.gs`) ใช้สิทธิ์เดียวกับการส่งผล ถ้าเปิดหน้าเว็บนอก Apps Script จะแสดงข้อมูลตัวอย่างพร้อมป้ายบอก
ข้อมูลที่ส่งก่อนมี Dashboard ดูได้ แต่ "เปิดในฟอร์ม" ใช้ได้เฉพาะครั้งที่ส่งหลังอัปเดตนี้ (คอลัมน์ Form data ใน Records)

## อัปเดตภายหลัง

1. แก้ `linac-qa/index.html` แล้วรัน `linac-qa/build-apps-script.sh` เพื่อคัดลอกไปที่ `apps-script/Index.html`
2. วางไฟล์ที่เปลี่ยนลงใน Apps Script แล้ว Save
3. **Deploy → Manage deployments → ✏️ → Version: New version → Deploy** (ลิงก์ `…/exec` เดิมจะใช้โค้ดใหม่ ถ้ากด New deployment จะได้ลิงก์ใหม่)

## ข้อควรรู้

- เมื่อเปิดผ่าน Apps Script หน้าเว็บส่งข้อมูลด้วย `google.script.run` โดยตรง จึงไม่มีปัญหาเบราว์เซอร์บล็อกการเชื่อมต่อ
- ข้อมูลที่กรอกระหว่างทางและรูปเก็บในเบราว์เซอร์ของแต่ละเครื่องจนกว่าจะกดส่งไป Sheet
- ปุ่มดาวน์โหลด CSV/JSON และพิมพ์ ซ่อนไว้เมื่อเปิดผ่าน Apps Script ใช้ปุ่มคัดลอก CSV/JSON หรือดูผลใน Sheet แทน
- ระบบล็อกอินด้วย Google ในหน้าเว็บ (`AUTH`) ใช้ไม่ได้เมื่อเปิดผ่าน Apps Script ให้ใช้ Who has access = **Anyone with Google account** แทนเพื่อบังคับล็อกอิน
