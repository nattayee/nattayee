# LPCH RO Workspace

เว็บไซต์พื้นที่ทำงานกลางของหน่วยรังสีรักษา (Radiation Oncology) — static site (HTML/CSS/JS ล้วน ไม่ต้อง build)

## หน้าตา (Design)

ใช้ design เดียวกับเว็บ **TRS-398 Output Calibration** ของโรงพยาบาลมะเร็งลำปาง (`trs398-calculator/index.html`)

- ฟอนต์: **Chakra Petch** (หัวข้อ), **IBM Plex Sans Thai** (เนื้อหา), **IBM Plex Mono** (ตัวเลข)
- สีหลัก: Cherenkov blue `#1d5bd6`, พื้นหลัง `#eef2f6`, ตัวอักษร `#142033` พร้อมโหมดกลางคืน (สลับ อัตโนมัติ / กลางวัน / กลางคืน ที่มุมขวาบน)
- หัวเว็บ: โลโก้โรงพยาบาลบนกรอบสีขาว + ชื่อ "LPCH **RO Workspace**" + Lampang Cancer Hospital (แก้ได้ที่ `brand` ใน `data.js`)
- โลโก้: `assets/lpch-emblem.png` (หัวเว็บ, หน้าเข้าสู่ระบบ) และ `assets/lpch-logo.png` (ท้ายเว็บ)
- สีทั้งหมดกำหนดเป็นตัวแปรที่ต้นไฟล์ `styles.css`

## ระบบสมาชิก (ต้องสมัครก่อนใช้งาน)

ทุกหน้าของเว็บไซต์ต้องเข้าสู่ระบบก่อน ผู้ใช้ใหม่กด **สมัครสมาชิก** กรอก ชื่อ-นามสกุล, ตำแหน่ง (RO / MP / RTT / Nurse / อื่นๆ),
ชื่อผู้ใช้, รหัสผ่าน (≥ 8 ตัว), เบอร์โทร และอีเมล

- **ผู้สมัครคนแรก** จะเป็นผู้ดูแลระบบ (admin) และเข้าใช้งานได้ทันที
- ผู้สมัครคนต่อไปมีสถานะ **รออนุมัติ** จนกว่า admin จะอนุมัติที่เมนูผู้ใช้ (มุมขวาบน) → **จัดการสมาชิก**
- admin อนุมัติ / ระงับ / ลบบัญชี, เปลี่ยนตำแหน่ง และตั้งผู้ดูแลระบบเพิ่มได้
- สมาชิกเปลี่ยนรหัสผ่านได้ที่ **บัญชีของฉัน**
- ช่องแชทประกาศใช้ชื่อและตำแหน่งของผู้ที่เข้าสู่ระบบโดยอัตโนมัติ
- ใส่รหัสผ่านผิด 5 ครั้งจะถูกล็อก 15 นาที, session หมดอายุใน 7 วัน

### ติดตั้ง backend (Google Apps Script + Google Sheets)

1. สร้าง Google Sheet ใหม่ (เช่น "LPCH RO Members")
2. เมนู **Extensions → Apps Script** ลบโค้ดเดิม แล้ววางเนื้อหาไฟล์ `apps-script/Code.gs` → Save
3. **Deploy → New deployment** → เลือกประเภท **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. กด Deploy และอนุญาตสิทธิ์ (Authorize access) แล้วคัดลอก **Web app URL** ที่ลงท้ายด้วย `/exec`
5. ใส่ URL ที่ `auth.apiUrl` ใน `data.js`
6. เปิดเว็บไซต์แล้วสมัครบัญชีแรก (จะได้เป็น admin)

ระบบจะสร้างชีต `Users` และ `Sessions` ให้อัตโนมัติ รหัสผ่านเก็บแบบ hash (SHA-256 + salt) ไม่เก็บรหัสผ่านจริง
ถ้าแก้ `Code.gs` ภายหลัง ต้อง **Deploy → Manage deployments → Edit → Version: New version** เพื่อให้ URL เดิมใช้โค้ดใหม่

ตั้งค่าเพิ่มเติมได้ที่ต้นไฟล์ `Code.gs`: `REQUIRE_APPROVAL` (ปิดการอนุมัติ), `SESSION_DAYS`, `ROLES`

> ถ้ายังไม่ได้ใส่ `auth.apiUrl` ระบบจะอยู่ใน **โหมดทดลอง** — สมาชิกเก็บในเบราว์เซอร์นี้เท่านั้น ใช้สำหรับทดลองหน้าตาเท่านั้น
>
> **ข้อจำกัด:** หน้าเว็บนี้เป็น static site การล็อกอินจึงซ่อนหน้าจอจากผู้ที่ไม่ได้เป็นสมาชิก แต่ไฟล์ `data.js` (ลิงก์เอกสาร) ยังเปิดอ่านได้ถ้ารู้ URL
> เอกสารสำคัญควรตั้งสิทธิ์การเข้าถึงใน Google Drive ให้เฉพาะบัญชีของหน่วยงานด้วย

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
- เลือก **ส่งถึง**: ทุกคน / ทั้งวิชาชีพ (RO / MP / RTT / Nurse) / **👤 รายบุคคล** (เลือกรายชื่อสมาชิกแยกตามวิชาชีพ) หรือผสมกันได้
- ปุ่มใต้แต่ละข้อความ
  - **✓ ถูก / ✗ ผิด** — บันทึกชื่อ ตำแหน่ง username วันที่และเวลาที่กด เปลี่ยนคำตอบได้ และเก็บประวัติการเปลี่ยนไว้ทั้งหมด
  - **↩ ตอบกลับ** — ตอบข้อความนั้นโดยตรง (อ้างอิงข้อความต้นฉบับ กดที่กรอบอ้างอิงเพื่อเลื่อนไปยังต้นฉบับ) ผู้รับตั้งต้นเป็นผู้ส่งเดิม
  - **↪ ส่งต่อ** ให้กลุ่มหรือรายบุคคล, **ลบ** ข้อความของตัวเอง
  - **👁 อ่าน N · กด N ▾** — เปิดดูรายชื่อผู้กด ✓/✗ และผู้อ่าน พร้อมวันที่เวลา (ถึงวินาที)
- **สถานะ** ใต้แต่ละข้อความ
  - `✓ RTT` = ส่งถึงกลุ่มนี้แล้ว ยังไม่มีใครในกลุ่มอ่าน, `✓✓ RTT` (สีเขียว) = มีคนในกลุ่มนี้อ่านแล้ว
  - `✓ สมหญิง (RTT)` (กรอบเส้นประ) = ส่งถึงบุคคลนี้ ยังไม่อ่าน, `✓✓ สมหญิง (RTT)` = อ่านแล้ว
  - `↪ ชื่อ (ตำแหน่ง) ส่งต่อให้ ...` = ประวัติการส่งต่อ
- **⬇ บันทึก CSV** — ดาวน์โหลดบันทึกทุกการกระทำ (ส่ง, ตอบกลับ, อ่าน, ✓/✗, ส่งต่อ) พร้อมผู้กระทำ วันที่ เวลา เปิดด้วย Excel / Google Sheets ได้
- ระบบบันทึกว่า "อ่านแล้ว" เมื่อข้อความที่ส่งถึงกลุ่มของผู้ใช้แสดงบนจอ
- ตัวกรอง: ทั้งหมด / ส่งถึงฉัน (รวมที่ส่งถึงตัวเองโดยตรง) / ที่ฉันส่ง และป้าย "ยังไม่อ่าน N"

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
      // หลังส่งแล้ว แก้ได้เฉพาะสถานะการอ่าน/ส่งต่อ/การกด ✓ ✗ ไม่สามารถแก้เนื้อหาได้
      allow update: if request.resource.data.diff(resource.data).affectedKeys()
                      .hasOnly(['reads', 'to', 'toNames', 'forwards', 'reactions', 'reactionLog']);
      allow delete: if true;
    }
  }
}
```

รูปแนบเก็บอยู่ในเอกสาร Firestore โดยตรง (ไม่ต้องใช้ Firebase Storage) จำกัดประมาณ 900 KB ต่อข้อความ

> **ความปลอดภัย:** แชทใช้ชื่อจากระบบสมาชิก แต่ Firestore rules ด้านบนไม่ได้ตรวจสอบ session ของ Apps Script
> ผู้ที่รู้ค่า config ของ Firebase จึงยังเขียนข้อมูลตรงเข้า Firestore ได้ ห้ามโพสต์ข้อมูลระบุตัวผู้ป่วย (ชื่อ, HN, รูปที่เห็นหน้า)

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
