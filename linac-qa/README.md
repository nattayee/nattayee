# Linac QA

เว็บแบบบันทึกการตรวจสอบคุณภาพเครื่องเร่งอนุภาค (Linac Daily QA) หน้าตาแบบ Google Form
เป็นไฟล์ static ล้วน ไม่ต้อง build — เปิด `index.html` ได้เลย หรือ deploy บน GitHub Pages / web server ใดก็ได้

## ความสามารถ
- ฟอร์มแบ่ง section: ข้อมูลทั่วไป, Safety, Mechanical, Dosimetry (output constancy), Imaging, สรุป
- ตรวจสอบคำถามที่จำเป็น (`*`)
- คำนวณผลต่างจาก baseline และตัดสิน **ผ่าน / ไม่ผ่าน** อัตโนมัติตามเกณฑ์ (TG-142)
- สรุปผลรวมแบบ real-time
- ประวัติการบันทึก กรองตามเครื่อง ดูรายละเอียด ลบ ส่งออก CSV (เปิดใน Excel ภาษาไทยได้) และพิมพ์
- (ทางเลือก) ส่งข้อมูลเข้า Google Sheet ผ่าน Google Apps Script

## ไฟล์
| ไฟล์ | หน้าที่ |
|---|---|
| `questions.js` | **โครงสร้างคำถามทั้งหมด** — แก้ไฟล์นี้เพื่อให้ตรงกับฟอร์มต้นฉบับ |
| `config.js` | ใส่ URL ของ Google Apps Script (ถ้าต้องการส่งเข้า Sheet) |
| `app.js` | logic ของฟอร์ม/ประวัติ |
| `styles.css` | หน้าตา (รองรับมือถือและ dark mode) |
| `apps-script/Code.gs` | สคริปต์ฝั่ง Google Sheet พร้อมวิธีติดตั้ง |

## การแก้คำถาม
ดูชนิดคำถามที่รองรับได้ที่หัวไฟล์ `questions.js` (`text`, `number`, `date`, `select`, `radio`,
`checkbox`, `passfail`, `tolerance` ฯลฯ) ตัวอย่างเพิ่มค่า output 15 MV:

```js
{ id: 'out_15x', label: '15 MV', type: 'tolerance', baseline: 100, tol: 3, mode: 'pct' }
```

## การเก็บข้อมูล
ค่าเริ่มต้นข้อมูลถูกเก็บใน `localStorage` ของเบราว์เซอร์เครื่องนั้น ๆ เท่านั้น
หากต้องการให้ทุกเครื่องเห็นข้อมูลร่วมกัน ให้ตั้งค่า Google Apps Script ตามคำอธิบายใน `apps-script/Code.gs`
