# TDF Dose Calculator

Web app สำหรับคำนวณ Time-Dose-Fractionation (TDF) ตามโมเดลของ Orton & Ellis สำหรับรังสีรักษา
เป็นไฟล์ static ทั้งหมด ไม่ต้อง build เปิด `index.html` ในเบราว์เซอร์ได้เลย

```bash
# เปิดผ่าน local server (ทางเลือก)
npx serve tdf-calculator
# รัน unit tests ของสูตรคำนวณ
node --test tdf-calculator/tdf.test.js
```

## Google Apps Script

โฟลเดอร์ `apps-script/` คือเวอร์ชันสำหรับ deploy เป็น Web app บน Google Apps Script

| ไฟล์ | ใส่ใน Apps Script เป็น |
|---|---|
| `Code.gs` | Script file ชื่อ `Code` |
| `Index.html` | HTML file ชื่อ `Index` |
| `Tdf.html` | HTML file ชื่อ `Tdf` (สูตรคำนวณ) |
| `appsscript.json` | manifest (ถ้าใช้ `clasp`) |

1. ไปที่ script.google.com → New project
2. วางเนื้อหา `Code.gs` ลงใน `Code.gs`
3. กด **+ → HTML** สร้างไฟล์ `Index` และ `Tdf` แล้ววางเนื้อหาตามไฟล์ (ชื่อต้องตรง ไม่ต้องพิมพ์ `.html`)
4. **Deploy → New deployment → Web app** เลือก Execute as: Me และกำหนด Who has access
5. เปิดแท็บได้โดยตรงด้วย `?tab=frac`, `?tab=gap`, `?tab=brachy` หรือ `?tab=ref` ต่อท้าย URL

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
