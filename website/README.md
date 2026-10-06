# LPCH RO Workspace

เว็บไซต์พื้นที่ทำงานกลางของหน่วยรังสีรักษา (Radiation Oncology) — static site (HTML/CSS/JS ล้วน ไม่ต้อง build)

## หน้าในเว็บไซต์

| หน้า | เนื้อหา |
| --- | --- |
| หน้าแรก | แนะนำหน่วยงาน ประกาศ/ข่าวสาร และลิงก์ด่วน |
| Protocols | แนวทางการรักษาแยกตามตำแหน่งโรค |
| Dose constraints | ตารางค่าจำกัดปริมาณรังสีอวัยวะ (QUANTEC) พร้อมตัวกรองและช่องค้นหา |
| เครื่องมือคำนวณ | BED / EQD2 calculator และ fractionation converter (LQ model) |
| เอกสาร | แบบฟอร์ม, consent, Physics & QA, SOP |
| ตารางงาน | กิจกรรมประจำสัปดาห์ และ Google Calendar แบบ embed |
| ติดต่อ | ผู้รับผิดชอบและช่องทางติดต่อ |

## แก้ไขเนื้อหา

เนื้อหาทั้งหมดอยู่ใน **`data.js`** ไฟล์เดียว:

- ลิงก์ที่เป็น `"#"` คือ placeholder (จะแสดงเป็น "รอใส่ลิงก์") ให้แทนด้วยลิงก์ Google Drive / Docs / Forms จริง
- ใส่ Google Calendar ได้ที่ `schedule.calendarEmbedUrl` (Google Calendar → Settings → Integrate calendar → ค่า `src` ใน Embed code)
- เพิ่ม/ลบ ประกาศ, protocol, เอกสาร, ผู้ติดต่อ ได้โดยแก้ array ที่เกี่ยวข้อง

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
