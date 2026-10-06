# LPCH RO Workspace

เว็บไซต์พื้นที่ทำงานกลางของหน่วยรังสีรักษา (Radiation Oncology) — static site (HTML/CSS/JS ล้วน ไม่ต้อง build)

## เมนูและหน้าในเว็บไซต์

| เมนู | เนื้อหา |
| --- | --- |
| Home | แนะนำหน่วยงาน ประกาศ/ข่าวสาร ทางลัดไปแต่ละส่วนงาน และผู้ติดต่อ |
| Machines ▾ | Linac 1, Linac 2, CT Simulator, HDR Brachytherapy — ข้อมูลเครื่อง คู่มือ บันทึก QA |
| RTT | SOP, ตารางงาน, แบบฟอร์มของนักรังสีการแพทย์ |
| Nurse | Patient education, consent, การดูแลผลข้างเคียง |
| RO | ใบส่งปรึกษา/สั่งการรักษา, งานวิชาการ, BED/EQD2 calculator, ตารางงานประจำสัปดาห์ |
| MP ▾ | Machine QA, Treatment Planning, Patient-specific QA, Radiation Safety |
| Guideline | แนวทางการรักษาแยกตามโรค และตาราง dose constraints (QUANTEC) |

## แก้ไขเนื้อหา

เนื้อหาทั้งหมดอยู่ใน **`data.js`** ไฟล์เดียว:

- เมนูด้านบนกำหนดที่ `nav` (เพิ่ม `children` เพื่อทำ dropdown) และเนื้อหาแต่ละหน้าอยู่ที่ `pages`
- ลิงก์ที่เป็น `"#"` คือ placeholder (จะแสดงเป็น "รอใส่ลิงก์") ให้แทนด้วยลิงก์ Google Drive / Docs / Forms จริง
- ใส่ Google Calendar ได้ที่ `schedule.calendarEmbedUrl` (Google Calendar → Settings → Integrate calendar → ค่า `src` ใน Embed code)
- แต่ละหน้ามี `groups` (กล่องรายการลิงก์) และ `widgets` (`calculators`, `constraints`, `schedule`, `contacts`, `subpages` ฯลฯ)

## เปิดดูในเครื่อง

เปิดไฟล์ `index.html` ด้วยเบราว์เซอร์ได้ทันที หรือรัน local server:

```bash
cd website
python3 -m http.server 8000
# แล้วเปิด http://localhost:8000
```

## Deploy

เป็น static site จึงนำโฟลเดอร์ `website/` ไปวางบน GitHub Pages, Netlify, Vercel หรือ web server ของโรงพยาบาลได้โดยตรง

> ข้อมูลทางคลินิกในเว็บไซต์ใช้เป็นแนวทางประกอบเท่านั้น โปรดตรวจสอบกับ protocol ของหน่วยงานทุกครั้ง
