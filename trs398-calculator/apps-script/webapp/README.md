# ติดตั้งเป็น Google Apps Script Web App (เข้าสู่ระบบด้วย Google)

ทั้งหมดอยู่ใน **ไฟล์เดียว** คือ `Code.gs` (หน้าแอปโหลดจาก GitHub เอง) แต่ Deploy **2 ครั้ง**:

| Deployment | Execute as | Who has access | หน้าที่ |
|---|---|---|---|
| ① แอป | **Me (nattayee@gmail.com)** | **Anyone with Google account** | หน้าคำนวณ อ่าน Sheet และเขียน Log ในนามของ nattayee |
| ② เข้าสู่ระบบ | **User accessing the web app** | **Anyone with Google account** | อ่านอีเมล Gmail ของผู้ใช้ แล้วส่งกลับไปที่แอป ① |

- **อีเมลผู้บันทึก = บัญชี Google ที่ล็อกอินอยู่ตอนนั้น** ทุกครั้งที่เปิดแอป ① จะถาม ② แบบเบื้องหลัง (ไม่ต้องกดอะไร)
  มุมขวาบนแสดง "เข้าสู่ระบบเป็น …@gmail.com" และทุกรายงานบันทึกอีเมลนี้ลงคอลัมน์ **ผู้บันทึก (Gmail)**
- ครั้งแรกของผู้ใช้แต่ละคน (ยังไม่เคยอนุญาต ②) หรือเบราว์เซอร์ที่บล็อก (เช่น Safari) จะขึ้นปุ่ม **เข้าสู่ระบบด้วย Google** แทน
  กดปุ่ม → อนุญาต → กด "ไปที่ TRS-398 Output Calibration" ครั้งต่อไปจะเข้าสู่ระบบเองอัตโนมัติ (บน Chrome/Edge)
- ต้องเข้าสู่ระบบก่อนจึงส่งรายงานได้
- ครั้งแรกที่ผู้ใช้เข้า ② Google จะขอสิทธิ์ของโปรเจกต์ (รวม Drive/Sheets เพราะเป็นโปรเจกต์เดียวกับแอป)
  แต่ ② ใช้แค่อีเมลของผู้ใช้เท่านั้น ถ้าขึ้น "Google hasn't verified this app" ให้กด Advanced → Go to …
- อีเมลผู้บันทึกกรอกเองไม่ได้ ต้องเป็นบัญชีที่ Google ยืนยันเท่านั้น ถ้ายังไม่ได้ตั้ง `LOGIN_URL` จะส่งรายงานได้เฉพาะ nattayee (ผู้อื่นเห็นจุดแดง "ยังเข้าสู่ระบบไม่ได้")
- ใครก็ตามที่มีลิงก์และบัญชี Google เปิดแอปได้ จึงควรแชร์ลิงก์เฉพาะในทีม

## ติดตั้ง (ทำด้วยบัญชี nattayee@gmail.com)

1. เปิด https://script.google.com ตรวจรูปโปรไฟล์ว่าเป็น **nattayee@gmail.com** → เปิดโปรเจกต์เดิม (หรือ **New project**)
2. เปิดลิงก์นี้ กด Ctrl/⌘+A คัดลอก แล้ววางทับทั้งหมดใน `Code.gs` → บันทึก:
   https://raw.githubusercontent.com/nattayee/nattayee/refs/heads/claude/brave-volta-pjvcd3/trs398-calculator/apps-script/webapp/WebApp.gs
3. เลือกฟังก์ชัน **`setup`** → **Run** → อนุญาตสิทธิ์ (ถ้าเคยรันแล้วจะใช้ Log เดิม)
4. Deployment ① แอป: **Deploy → Manage deployments → ✏ Edit** (ถ้ามีอยู่แล้ว) → Version: **New version**
   (หรือ **New deployment → Web app** ถ้ายังไม่มี) Execute as **Me** · Who has access **Anyone with Google account** → Deploy
   คัดลอก URL `/exec` ของ ①
5. Deployment ② เข้าสู่ระบบ: **Deploy → New deployment → Web app**
   Execute as **User accessing the web app** · Who has access **Anyone with Google account** → Deploy
   คัดลอก URL `/exec` ของ ② (ไม่ต้องแชร์ลิงก์นี้ให้ใคร ปุ่มในแอปจะพาไปเอง)
6. ⚙ **Project Settings** → **Script properties** → **Add script property** 2 ค่า → Save
   - `APP_URL` = URL ของ ①
   - `LOGIN_URL` = URL ของ ②
7. **nattayee เปิด URL ของ ① หนึ่งครั้ง** (แอปจะจำที่อยู่หน้าเว็บของตัวเองไว้เป็น `APP_ORIGIN`
   ซึ่งจำเป็นสำหรับการเข้าสู่ระบบอัตโนมัติ และป้องกันเว็บอื่นแอบรับข้อมูลเข้าสู่ระบบ)
8. ทดสอบด้วยบัญชีอื่น: เปิด ① → กด **เข้าสู่ระบบด้วย Google** ครั้งแรก → รีเฟรช ควรขึ้น "เข้าสู่ระบบเป็น …" เอง

ครั้งต่อไปที่แก้ `Code.gs` ให้ Manage deployments → Edit → **New version** ทั้ง ① และ ② (URL เดิมใช้ต่อได้)

## เปิด Log ใน Google Sheets ได้ (ไม่บังคับ)

ใส่ Gmail ใน `EDITORS` → บันทึก → รันฟังก์ชัน **`shareLog`** (ด้วยบัญชี nattayee) คนในรายชื่อจะแก้ไข/ดู Log ใน Google Sheets ได้โดยตรง
(การใช้งานเว็บแอปไม่ต้องทำขั้นนี้)

## เมื่อแก้โค้ดของแอป

```
python3 trs398-calculator/apps-script/build_webapp.py
```

แล้ว commit + push `apps-script/webapp/index.html` เว็บแอปจะใช้หน้าใหม่ภายใน 10 นาที (ไม่ต้อง Deploy ใหม่)
ต้อง Deploy เวอร์ชันใหม่เฉพาะเมื่อแก้ `WebApp.gs`
