# ติดตั้งเป็น Google Apps Script Web App (เข้าสู่ระบบด้วย Google)

- ผู้ใช้ต้อง **เข้าสู่ระบบด้วยบัญชี Google** ก่อนเปิดแอป (Google บังคับเองจากการตั้ง Who has access)
- สคริปต์ทำงานในนามของ **nattayee@gmail.com** (Execute as: Me) จึงอ่าน Sheet ข้อมูลหลักและเขียน Output Log ได้เลย
  ผู้ใช้ไม่ต้องกด Authorize และไม่ต้องแชร์ไฟล์ให้ใคร
- ในโหมดนี้ Google ไม่บอกสคริปต์ว่าใครเปิด (ยกเว้น nattayee เอง) จึงมีปุ่ม **เข้าสู่ระบบด้วย Google** ที่มุมขวาบน
  ซึ่งพาไปยืนยันตัวตนกับโปรเจกต์เล็ก **TRS-398 Login** (`Login.gs`) แล้วกลับมาที่แอปพร้อมอีเมลที่ Google ยืนยันแล้ว
  เบราว์เซอร์จำการเข้าสู่ระบบไว้ 30 วัน ทุกรายงานบันทึกอีเมลนี้ลงคอลัมน์ **ผู้บันทึก (Gmail)** และต้องเข้าสู่ระบบก่อนจึงส่งรายงานได้
- ถ้ายังไม่ได้ตั้งค่าปุ่มเข้าสู่ระบบ (ยังไม่มี `LOGIN_URL`) หน้าเว็บจะให้กรอกอีเมลผู้บันทึกเองแทน
- ใครก็ตามที่มีลิงก์และบัญชี Google เปิดแอปและส่งรายงานเข้า Log ได้ จึงควรแชร์ลิงก์เฉพาะในทีม

โปรเจกต์ Apps Script ต้องมี **ไฟล์เดียว** คือ `Code.gs` (หน้าแอปโหลดจาก GitHub เอง)

## ติดตั้ง (ทำด้วยบัญชี nattayee@gmail.com)

1. เปิด https://script.google.com ตรวจรูปโปรไฟล์ว่าเป็น **nattayee@gmail.com** → เปิดโปรเจกต์เดิมหรือ **New project**
2. เปิดลิงก์นี้ กด Ctrl/⌘+A คัดลอก แล้ววางทับทั้งหมดใน `Code.gs`:
   https://raw.githubusercontent.com/nattayee/nattayee/refs/heads/claude/brave-volta-pjvcd3/trs398-calculator/apps-script/webapp/WebApp.gs
3. บันทึก → เลือกฟังก์ชัน **`setup`** → **Run** → อนุญาตสิทธิ์ (ทำครั้งเดียว ถ้าเคยรันแล้วจะใช้ Log เดิม)
4. **Deploy → New deployment → Web app** (หรือ Manage deployments → ✏ Edit → Version: New version ถ้ามีอยู่แล้ว)
   - Execute as: **Me (nattayee@gmail.com)**
   - Who has access: **Anyone with Google account**
5. ส่ง URL ของ Web app ให้ผู้ใช้

## ตั้งค่าปุ่ม "เข้าสู่ระบบด้วย Google" (ทำครั้งเดียวด้วยบัญชี nattayee)

1. โปรเจกต์หลัก: เลือกฟังก์ชัน **`setupLogin`** → **Run** → เปิด **Execution log** คัดลอกค่า `LOGIN_SECRET = …`
2. สร้าง **New project** ใหม่ ตั้งชื่อ `TRS-398 Login` วางโค้ดจากลิงก์นี้ทับใน `Code.gs` → บันทึก
   https://raw.githubusercontent.com/nattayee/nattayee/refs/heads/claude/brave-volta-pjvcd3/trs398-calculator/apps-script/webapp/Login.gs
3. ในโปรเจกต์ Login: ⚙ **Project Settings** → **Script properties** → **Add script property**
   ชื่อ `LOGIN_SECRET` ค่า = ที่คัดลอกจากข้อ 1 → Save
4. โปรเจกต์ Login: **Deploy → New deployment → Web app**
   - Execute as: **User accessing the web app**
   - Who has access: **Anyone with Google account**
   คัดลอก URL ที่ลงท้าย `/exec`
5. กลับมาที่โปรเจกต์หลัก: ⚙ **Project Settings** → **Script properties** → เพิ่ม `LOGIN_URL` = URL จากข้อ 4 → Save
   (ไม่ต้อง Deploy โปรเจกต์หลักใหม่ แค่รีเฟรชหน้าแอป)

ผู้ใช้กดปุ่มครั้งแรก Google จะถามว่าอนุญาตให้ TRS-398 Login **ดูอีเมลของคุณ** ให้กด Allow (โปรเจกต์ Login ขอสิทธิ์แค่อีเมลเท่านั้น)
ถ้าขึ้น "Google hasn't verified this app" ให้กด Advanced → Go to TRS-398 Login
ถ้าเบราว์เซอร์ login Google หลายบัญชี จะใช้บัญชีหลัก (บัญชีแรก) ของเบราว์เซอร์

## เปิด Log ใน Google Sheets ได้ (ไม่บังคับ)

ใส่ Gmail ใน `EDITORS` → บันทึก → รันฟังก์ชัน **`shareLog`** (ด้วยบัญชี nattayee) คนในรายชื่อจะแก้ไข/ดู Log ใน Google Sheets ได้โดยตรง
(การใช้งานเว็บแอปไม่ต้องทำขั้นนี้)

## เมื่อแก้โค้ดของแอป

```
python3 trs398-calculator/apps-script/build_webapp.py
```

แล้ว commit + push `apps-script/webapp/index.html` เว็บแอปจะใช้หน้าใหม่ภายใน 10 นาที (ไม่ต้อง Deploy ใหม่)
ต้อง Deploy เวอร์ชันใหม่เฉพาะเมื่อแก้ `WebApp.gs`
