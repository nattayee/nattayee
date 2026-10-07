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
| `Index.html` | HTML file ชื่อ `Index` (หน้าเข้าสู่ระบบ + เครื่องคำนวณ) |
| `Tdf.html` | HTML file ชื่อ `Tdf` (สูตรคำนวณ) |
| `appsscript.json` | manifest (ถ้าใช้ `clasp`) |

Deploy → New deployment → Web app → Execute as: **Me**, Who has access: **Anyone**

เปิด `copy-code.html` เพื่อคัดลอกโค้ดทั้ง 3 ไฟล์ทีละกล่องด้วยปุ่มเดียว

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

`Index.html` และ `Tdf.html` สร้างจาก `index.html` และ `tdf.js` ถ้าแก้ไฟล์ต้นฉบับให้รัน `node tdf-calculator/build-apps-script.js` ใหม่

## ความสามารถ

| แท็บ | คำนวณ |
|---|---|
| **Fractionated** | TDF, TDF ต่อ fraction, X, overall time, NSD (ret), dose เทียบเท่า 2 Gy × 5/สัปดาห์ และเทียบ BED/EQD2 (LQ) |
| **Treatment gap** | หลาย course พร้อมช่วงพัก ใช้ decay factor `(T/(T+R))^0.11` กับ TDF สะสม, TDF ที่สูญเสีย, กราฟ TDF ตามวัน และจำนวน fraction ที่ต้องฉายเพิ่มใน course สุดท้ายเพื่อให้ถึง TDF เป้าหมาย |
| **Brachytherapy** | LDR dose rate คงที่ และแหล่งรังสีที่สลายตัว (I-125, Pd-103, Cs-131, Au-198, Ir-192, Cs-137, Co-60 หรือกำหนด half-life เอง) ทั้ง permanent และ temporary implant พร้อมกราฟ dose rate และ TDF สะสม |
| **สูตร & ตาราง** | สูตรทั้งหมดและตาราง TDF ต่อ fraction |

## สูตรที่ใช้

```
Fractionated:      TDF = 1.19 · N · d^1.538 · X^-0.169          d (Gy), X = วันต่อ fraction (7/f หรือ T/N)
Rest-gap decay:    TDF_after = TDF_before · (T/(T+R))^0.11      T = วันจากเริ่มฉายถึงเริ่มพัก, R = วันที่พัก
Continuous LDR:    TDF = 4.76e-3 · r^1.35 · t                   r (cGy/h), t (h)
Decaying source:   TDF = 4.76e-3 · r0^1.35 · (1 − e^(−1.35λt)) / (1.35λ)
Permanent implant: TDF = 4.76e-3 · r0^1.35 / (1.35λ),  dose = r0/λ
NSD:               TDF = 1e-3 · NSD^1.538
```

ตรวจสอบกับค่ามาตรฐาน: 60 Gy / 30 fx / 5 ต่อสัปดาห์ → TDF ≈ 98, I-125 permanent 145 Gy → TDF ≈ 101

## อ้างอิง

- Orton CG, Ellis F. A simplification in the use of the NSD concept in practical radiotherapy. *Br J Radiol* 1973;46:529–537.
- Orton CG. Time-dose factors (TDFs) in brachytherapy. *Br J Radiol* 1974;47:603–607.
- Ellis F. Dose, time and fractionation: a clinical hypothesis. *Clin Radiol* 1969;20:1–7.

> ใช้เพื่อการศึกษาและตรวจทานเท่านั้น ไม่ใช้แทนการวางแผนการรักษาโดยนักฟิสิกส์การแพทย์และแพทย์รังสีรักษา
