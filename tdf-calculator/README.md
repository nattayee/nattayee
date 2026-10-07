# TDF Dose Calculator

Web app สำหรับคำนวณ Time-Dose-Fractionation (TDF) ตามโมเดลของ Orton & Ellis สำหรับรังสีรักษา
เป็นไฟล์ static ทั้งหมด ไม่ต้อง build เปิด `index.html` ในเบราว์เซอร์ได้เลย

```bash
# เปิดผ่าน local server (ทางเลือก)
npx serve tdf-calculator
# รัน unit tests ของสูตรคำนวณ
node --test tdf-calculator/tdf.test.js
```

## Google Apps Script (เข้าสู่ระบบด้วยบัญชี LPCH RO Workspace)

โฟลเดอร์ `apps-script/` คือเวอร์ชันสำหรับ deploy เป็น Web app บน Google Apps Script
ใช้บัญชีผู้ใช้ของ LPCH RO Workspace ผ่าน JSON API (`doPost`) ที่ Workspace มีอยู่แล้ว **ไม่ต้องแก้โปรเจกต์ Workspace**

| ไฟล์ | ใส่ใน Apps Script เป็น |
|---|---|
| `Code.gs` | Script file ชื่อ `Code` (URL ของ Workspace อยู่ใน `WORKSPACE_URL`) |
| `Index.html` | HTML file ชื่อ `Index` (หน้าเข้าสู่ระบบ + เครื่องคำนวณ + สูตรคำนวณ) |
| `appsscript.json` | manifest (ถ้าใช้ `clasp`) |

Deploy → New deployment → Web app → Execute as: **Me**, Who has access: **Anyone**

เปิด `copy-code.html` เพื่อคัดลอกโค้ดทั้ง 2 ไฟล์ทีละกล่องด้วยปุ่มเดียว

### วิธีเข้าสู่ระบบ

| ทาง | การทำงาน |
|---|---|
| จาก Workspace (แนะนำ) | ผู้ดูแลระบบเพิ่มปุ่มในหน้า Home หรือการ์ดแอปในเมนู ใส่ URL `/exec` ของ TDF และเปิด "เข้าสู่ระบบอัตโนมัติ" → Workspace เปิด `…/exec?sso=<บัตร>` → TDF แลกบัตรด้วย `ssoRedeem` |
| เปิด TDF ตรง ๆ | กรอกชื่อผู้ใช้/อีเมล + รหัสผ่านของ Workspace → `login` |
| ครั้งถัดไป | ใช้ token ที่บันทึกในเบราว์เซอร์ ตรวจด้วย `me` (อายุตาม `SESSION_DAYS` ของ Workspace) |
| ออกจากระบบ | `logout` ลบ session ในชีต Sessions ของ Workspace |

บัตร SSO ใช้ได้ครั้งเดียว หน้าเว็บจึงลบ `?sso=` ออกจากแถบที่อยู่ทันทีหลังแลกบัตร
เปิดแท็บได้โดยตรงด้วย `?tab=frac`, `?tab=gap`, `?tab=brachy` หรือ `?tab=ref`

หน้าเครื่องคำนวณซ่อนไว้จนกว่าจะเข้าสู่ระบบ (สูตรคำนวณไม่ใช่ข้อมูลลับ จึงตรวจสิทธิ์ที่หน้าเว็บ)

`Index.html` สร้างจาก `index.html` และ `tdf.js` ถ้าแก้ไฟล์ต้นฉบับให้รัน `node tdf-calculator/build-apps-script.js` ใหม่

## ความสามารถ

| แท็บ | คำนวณ |
|---|---|
| **Fractionated** | TDF, TDF ต่อ fraction, X, overall time, NSD (ret), dose เทียบเท่า 2 Gy × 5/สัปดาห์ และเทียบ BED/EQD2 (LQ) |
| **Treatment gap** | หลาย course พร้อมช่วงพัก ใช้ decay factor `(T/(T+R))^0.11` กับ TDF สะสม, TDF ที่สูญเสีย, กราฟ TDF ตามวัน และจำนวน fraction ที่ต้องฉายเพิ่มใน course สุดท้ายเพื่อให้ถึง TDF เป้าหมาย |
| **Brachytherapy** | LDR dose rate คงที่ และแหล่งรังสีที่สลายตัว (I-125, Pd-103, Cs-131, Au-198, Ir-192, Cs-137, Co-60 หรือกำหนด half-life เอง) ทั้ง permanent และ temporary implant พร้อมกราฟ dose rate และ TDF สะสม |
| **สูตร & ตาราง** | สูตรทั้งหมดและตาราง TDF ต่อ fraction |

แถบ **ผู้ป่วยและแพทย์ผู้รักษา** (ใช้ร่วมกันทุกแท็บ): HN, คำนำหน้าชื่อ, ชื่อ, นามสกุล และแพทย์ผู้รักษา
(รายชื่อแพทย์อยู่ใน `PHYSICIANS` ใน `index.html`)

### Recheck โดยนักฟิสิกส์การแพทย์อีกท่าน (บังคับ)

1. ผู้คำนวณกรอกข้อมูลผู้ป่วยและแพทย์ แล้วกด **ส่ง recheck** → บันทึกลง Google Sheet "TDF Calculator Records" สถานะ *รอ recheck*
2. นักฟิสิกส์การแพทย์อีกท่าน (ตำแหน่ง **MP** ใน Workspace และไม่ใช่ผู้คำนวณ) เปิด **รายการคำนวณ → Recheck**
   ระบบเปิดข้อมูลและคำนวณซ้ำบนเครื่องผู้ตรวจ แสดงค่าที่ส่งมาเทียบกับค่าที่คำนวณซ้ำ ปุ่มอนุมัติใช้ได้เมื่อตรงกันเท่านั้น
3. กด **อนุมัติ** → ระบบบันทึกชื่อผู้ recheck เวลา และค่าที่คำนวณซ้ำลงชีตอัตโนมัติ (หรือ **ไม่อนุมัติ** พร้อมเหตุผล)
4. **สร้างรายงาน PDF** ได้เฉพาะรายการที่อนุมัติแล้ว รายงานมีโลโก้ ข้อมูลผู้ป่วย ผลคำนวณ ผล recheck และช่องลงชื่อ 3 ช่อง

`Code.gs` ตรวจกฎทั้งหมดที่ฝั่ง server (ตำแหน่ง MP, ห้าม recheck งานตัวเอง, ค่าต้องตรงกันภายใน ±0.05, ตรวจซ้ำไม่ได้, รายการที่อนุมัติแล้วถอนไม่ได้)
ก่อน deploy ครั้งแรกให้เลือกฟังก์ชัน `setup` แล้วกด Run หนึ่งครั้ง

เวอร์ชันเว็บธรรมดา (ไม่ผ่าน Apps Script) ใช้ได้เป็น *ฉบับร่าง* เท่านั้น: เก็บในเบราว์เซอร์ และ PDF มีแถบ "ฉบับร่าง"
