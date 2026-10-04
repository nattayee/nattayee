# Lampang Cancer Hospital, Linac QA

แบบฟอร์มกรอกค่า Monthly Linac Mechanical QA (จาก worksheet "Worksheet Monthly QA Linac") เป็นไฟล์ HTML ไฟล์เดียว เปิด `index.html` ในเบราว์เซอร์ได้ทันที ไม่ต้องติดตั้งอะไรเพิ่ม

## หมวดหมู่

ข้อมูลการตรวจ (Machine: Infinity L1 / Precise L2 / VersaHD L3 · Physicist เลือกได้หลายคน + อื่นๆ) · Gantry · Collimator · ODI · Light Field · MLC · Couch · Laser · Light/Radiation & Winston-Lutz · Imaging QA · Flatness/Symmetry/Dose (Profiler) · QA Note · สรุปผล

## การใช้งาน

- **แท็บด้านบน**: กดเพื่อเลื่อนไปหมวดนั้น แท็บจะไฮไลต์ตามหมวดที่กำลังดูอยู่ จุดสีบอกสถานะ (เทา = ยังไม่กรอก, เหลือง = กรอกบางส่วน, เขียว = ผ่านครบ, แดง = มีรายการไม่ผ่าน)
- **สลับลำดับหมวดหมู่**: ลากแท็บ (คอมพิวเตอร์), กดปุ่ม "จัดลำดับ" แล้วลากหรือกดลูกศร (มือถือ), กดลูกศร ↑ ↓ ที่หัวหมวด หรือเลือกแท็บแล้วกด Alt + ← / → ลำดับที่ตั้งไว้จะถูกจำไว้
- **ประเมินผลอัตโนมัติ**: กรอกค่าที่อ่านได้ ระบบคำนวณส่วนต่าง (Δ) จากค่าที่ตั้งและเทียบกับเกณฑ์ (limit) ใน worksheet
  - มุม gantry / collimator / couch: คิดส่วนต่างแบบวนรอบ 360°
  - ODI, Light field, Couch reading: กรอกเป็น cm แสดงส่วนต่างเป็น mm
  - Light field: ช่อง "ตั้ง" คือค่าที่คาดหวัง แก้ไขได้ (Over-travel ต้องใส่ค่าตั้งเอง)
  - Dose diff (%) = (Measure − Reference) / Reference × 100
- **รูปประกอบ**: ทุกหมวด QA แนบรูปได้ (ถ่ายจากกล้อง / เลือกจากคลังภาพ / ลากไฟล์มาวาง) ใส่คำอธิบายรูป กดดูรูปขนาดเต็ม และลบแล้วกดเลิกทำได้ รูปถูกย่อเหลือด้านยาวไม่เกิน 1600 px และเก็บใน IndexedDB ของเบราว์เซอร์ ไฟล์ JSON ที่ส่งออกมีรูปติดไปด้วย
- **บันทึก**: ค่าที่กรอกบันทึกอัตโนมัติใน localStorage ของเบราว์เซอร์ ส่งออกได้เป็น CSV (เปิดใน Excel ได้) หรือ JSON และนำเข้า JSON กลับมาได้ที่หมวด "สรุปผล"

## เข้าสู่ระบบด้วย Google (Gmail)

ค่าตั้งอยู่ที่ส่วน `AUTH` ด้านบนของ `<script>` ใน `index.html` ถ้า `clientId` ว่าง หน้าเว็บใช้งานได้โดยไม่ต้องล็อกอิน

1. นำหน้าเว็บขึ้นโฮสต์ที่มี https เช่น GitHub Pages (`https://<user>.github.io/<repo>/linac-qa/`)
2. ไปที่ Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID → ประเภท **Web application**
3. ใส่ origin ของเว็บใน **Authorized JavaScript origins** เช่น `https://<user>.github.io` (ไม่ต้องมี path)
4. คัดลอก Client ID (`….apps.googleusercontent.com`) มาใส่ใน `AUTH.clientId`
5. จำกัดผู้ใช้ด้วย `AUTH.allowedEmails` (รายชื่อ Gmail) หรือ `AUTH.allowedDomains` ถ้าเว้นว่างทั้งคู่ บัญชี Google ใดก็เข้าได้
6. (ไม่บังคับ) `AUTH.physicistEmails` จับคู่อีเมลกับชื่อ Physicist เพื่อติ๊กชื่อให้อัตโนมัติเมื่อเข้าสู่ระบบ

เมื่อเข้าสู่ระบบแล้ว ชื่อและอีเมลผู้บันทึกจะอยู่ในไฟล์ CSV/JSON ที่ส่งออก (Recorded by) การล็อกอินค้างไว้ `sessionHours` ชั่วโมง

หมายเหตุ: การตรวจสิทธิ์ทำในเบราว์เซอร์ (ไม่มีเซิร์ฟเวอร์) จึงเป็นการคัดกรองผู้ใช้และบันทึกตัวตน ไม่ใช่ระบบความปลอดภัยเต็มรูปแบบ ข้อมูล QA ยังเก็บอยู่ในเบราว์เซอร์ของแต่ละเครื่องเหมือนเดิม
