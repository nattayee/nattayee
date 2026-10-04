# Linac Mechanical QA

แบบฟอร์มกรอกค่า Monthly Linac Mechanical QA (จาก worksheet "Worksheet Monthly QA Linac") เป็นไฟล์ HTML ไฟล์เดียว เปิด `index.html` ในเบราว์เซอร์ได้ทันที ไม่ต้องติดตั้งอะไรเพิ่ม

## หมวดหมู่

ข้อมูลการตรวจ · Gantry · Collimator · ODI · Light Field · MLC · Couch · Laser · Light/Radiation & Winston-Lutz · Imaging QA · Flatness/Symmetry/Dose (Profiler) · QA Note · สรุปผล

## การใช้งาน

- **แท็บด้านบน**: กดเพื่อเลื่อนไปหมวดนั้น แท็บจะไฮไลต์ตามหมวดที่กำลังดูอยู่ จุดสีบอกสถานะ (เทา = ยังไม่กรอก, เหลือง = กรอกบางส่วน, เขียว = ผ่านครบ, แดง = มีรายการไม่ผ่าน)
- **สลับลำดับหมวดหมู่**: ลากแท็บ (คอมพิวเตอร์), กดปุ่ม "จัดลำดับ" แล้วลากหรือกดลูกศร (มือถือ), กดลูกศร ↑ ↓ ที่หัวหมวด หรือเลือกแท็บแล้วกด Alt + ← / → ลำดับที่ตั้งไว้จะถูกจำไว้
- **ประเมินผลอัตโนมัติ**: กรอกค่าที่อ่านได้ ระบบคำนวณส่วนต่าง (Δ) จากค่าที่ตั้งและเทียบกับเกณฑ์ (limit) ใน worksheet
  - มุม gantry / collimator / couch: คิดส่วนต่างแบบวนรอบ 360°
  - ODI, Light field, Couch reading: กรอกเป็น cm แสดงส่วนต่างเป็น mm
  - Light field: ช่อง "ตั้ง" คือค่าที่คาดหวัง แก้ไขได้ (Over-travel ต้องใส่ค่าตั้งเอง)
  - Dose diff (%) = (Measure − Reference) / Reference × 100
- **บันทึก**: ค่าที่กรอกบันทึกอัตโนมัติใน localStorage ของเบราว์เซอร์ ส่งออกได้เป็น CSV (เปิดใน Excel ได้) หรือ JSON และนำเข้า JSON กลับมาได้ที่หมวด "สรุปผล"
