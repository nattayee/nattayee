# LPCH RO Workspace

เว็บไซต์พื้นที่ทำงานกลางของหน่วยรังสีรักษา (Radiation Oncology) — static site (HTML/CSS/JS ล้วน ไม่ต้อง build)

## เมนูและหน้าในเว็บไซต์

| เมนู | เนื้อหา |
| --- | --- |
| Home | แนะนำหน่วยงาน ช่องแชทประกาศ/ข่าวสาร ทางลัดไปแต่ละส่วนงาน และผู้ติดต่อ |
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

## ช่องแชทประกาศ / ข่าวสาร

อยู่ที่หน้า Home (โค้ดใน `chat.js`)

- พิมพ์ประกาศและแนบรูปได้สูงสุด 4 รูป (ปุ่ม 📎, วางด้วย Ctrl+V หรือลากไฟล์มาวาง) รูปจะถูกย่อขนาดอัตโนมัติ
- เลือก **ส่งถึง**: ทุกคน / RO / MP / RTT / Nurse
- **สถานะ** ใต้แต่ละข้อความ
  - `✓ RTT` = ส่งถึงกลุ่มนี้แล้ว ยังไม่มีใครในกลุ่มอ่าน
  - `✓✓ RTT` (สีเขียว) = มีคนในกลุ่มนี้อ่านแล้ว
  - `👁 อ่านแล้ว N คน` กดเพื่อดูรายชื่อและเวลาที่อ่าน
  - `↪ ชื่อ (ตำแหน่ง) ส่งต่อให้ Nurse` = ประวัติการส่งต่อ
- ปุ่ม **↪ ส่งต่อ** ส่งข้อความต่อให้กลุ่มอื่น, ปุ่ม **ลบ** สำหรับข้อความของตัวเอง
- ระบบบันทึกว่า "อ่านแล้ว" เมื่อข้อความที่ส่งถึงกลุ่มของผู้ใช้แสดงบนจอ (ผู้ใช้ต้องใส่ชื่อและตำแหน่งก่อน)
- ตัวกรอง: ทั้งหมด / ส่งถึงฉัน / ที่ฉันส่ง และป้าย "ยังไม่อ่าน N"

### โหมดทดลอง vs ใช้งานจริง

ถ้ายังไม่ได้ตั้งค่า Firebase แชทจะทำงานใน **โหมดทดลอง** ข้อความเก็บใน localStorage ของเบราว์เซอร์แต่ละเครื่อง (คนอื่นจะไม่เห็น)

เพื่อให้ทุกคนเห็นข้อความร่วมกันแบบ realtime ให้ใช้ **Cloud Firestore** (แพ็กเกจฟรี Spark เพียงพอ):

1. สร้างโปรเจกต์ที่ <https://console.firebase.google.com>
2. Build → Firestore Database → Create database
3. Project settings → Your apps → เพิ่ม Web app แล้วคัดลอกค่า `apiKey`, `authDomain`, `projectId`, `appId` มาใส่ที่ `chat.firebase` ใน `data.js`
4. ตั้ง Firestore rules (Firestore → Rules):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /announcements/{id} {
      allow read: if true;
      allow create: if request.resource.data.keys().hasAll(['author', 'text', 'to', 'createdAt'])
                    && request.resource.data.text.size() < 5000;
      // หลังส่งแล้ว แก้ได้เฉพาะสถานะการอ่าน/ส่งต่อ ไม่สามารถแก้เนื้อหาได้
      allow update: if request.resource.data.diff(resource.data).affectedKeys()
                      .hasOnly(['reads', 'to', 'forwards']);
      allow delete: if true;
    }
  }
}
```

รูปแนบเก็บอยู่ในเอกสาร Firestore โดยตรง (ไม่ต้องใช้ Firebase Storage) จำกัดประมาณ 900 KB ต่อข้อความ

> **ความปลอดภัย:** ระบบนี้ระบุตัวตนด้วยชื่อที่ผู้ใช้พิมพ์เอง ไม่มีการล็อกอิน ใครที่เปิดเว็บได้ก็โพสต์ได้
> ห้ามโพสต์ข้อมูลระบุตัวผู้ป่วย (ชื่อ, HN, รูปที่เห็นหน้า) หากต้องการจำกัดผู้ใช้ ควรเพิ่ม Firebase Authentication
> (เช่น Google sign-in เฉพาะบัญชีของโรงพยาบาล) และ App Check

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
