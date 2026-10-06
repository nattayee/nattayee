# Linac QA — ใช้บัญชีร่วมกับ LPCH RO Workspace

ไฟล์ในโฟลเดอร์นี้คือแอป Linac QA (จาก branch `claude/modest-euler-colam2`, โฟลเดอร์ `linac-qa/`)
ที่เพิ่มการเข้าสู่ระบบด้วยบัญชี LPCH RO Workspace

| ไฟล์ | คืออะไร |
| --- | --- |
| `Code.gs` | โค้ดเซิร์ฟเวอร์ — วางแทน `Code.gs` ทั้งไฟล์ในโปรเจกต์ Apps Script ของ Linac QA |
| `index.html` | หน้าฟอร์ม (โหลดจาก GitHub อัตโนมัติตาม `CONFIG.PAGE_URL` ไม่ต้องวาง) |

## ทำงานอย่างไร

- **กดจาก LPCH:** หน้า MP › Machine QA → **เปิดแอป ↗** ลิงก์แนบบัตรผ่าน (`?sso=…`) ใช้ได้ครั้งเดียว อายุ 2 นาที → เข้าสู่ระบบให้ทันที
- **เปิด Linac QA ตรง ๆ:** หน้าแรกมีช่อง **ชื่อผู้ใช้ หรืออีเมล + รหัสผ่าน** ของ LPCH (ตรวจที่ LPCH — แอปนี้ไม่เก็บรหัสผ่าน)
- **สิทธิ์:** `CONFIG.LPCH_ROLES` (ค่าเริ่มต้น `['MP']`) และผู้ดูแลระบบ LPCH — ใส่ `['MP', 'RTT']` หรือ `['*']` ถ้าต้องการเพิ่ม
- ตรวจกับ LPCH ทุกครั้งที่ใช้ (เก็บผลไว้ 5 นาที) ระงับบัญชีใน LPCH ก็เข้า Linac QA ไม่ได้ด้วย
- ชื่อผู้บันทึกและอีเมลใน Sheet (`Recorded by`, `Email`, `Log`) มาจากบัญชี LPCH ที่เซิร์ฟเวอร์ยืนยัน ไม่ใช่ค่าที่หน้าเว็บส่งมา
- ถ้าชื่อในบัญชี LPCH ตรงกับรายชื่อนักฟิสิกส์ในฟอร์ม จะติ๊กชื่อนั้นให้อัตโนมัติ
- มุมขวาบนมีปุ่ม **ออกจากระบบ** · Dashboard / ประวัติ / กราฟแนวโน้ม ใช้บัญชีเดียวกัน
- ถ้าไม่ได้ตั้ง `LPCH_URL` แอปทำงานแบบเดิมทุกอย่าง (บัญชี Google)

## ติดตั้ง (บัญชีเจ้าของ Sheet)

1. **LPCH RO Workspace** ต้องใช้ `Code.gs` ที่มี `ssoTicket` / `ssoRedeem` (Deploy แบบ Who has access: **Anyone**)
2. เปิดโปรเจกต์ Apps Script ของ Linac QA → วาง `Code.gs` ทับทั้งไฟล์ → บันทึก
   (บรรทัดสุดท้ายต้องเป็น `// ----- สิ้นสุดไฟล์ Code.gs (Linac QA + บัญชี LPCH RO Workspace) …`)
3. ⚙ Project Settings → Script properties → เพิ่ม `LPCH_URL` = URL `/exec` ของ LPCH RO Workspace → Save
4. เลือกฟังก์ชัน `setupLpch` → **Run** (อนุญาต "เชื่อมต่อบริการภายนอก" ถ้าถาม) → Execution log ต้องขึ้น
   `✓ เชื่อมต่อ LPCH RO Workspace ได้ และรองรับการใช้บัญชีร่วมกันแล้ว`
5. Deploy → Manage deployments → ✏️ Edit
   - Execute as: **Me** (สำคัญ: แบบ "User accessing the web app" จะใช้บัญชี Google แทนบัญชี LPCH)
   - Who has access: **Anyone**
   - Version: **New version** → Deploy (URL เดิมใช้ต่อได้)

เมื่อ Execute as **Me** สคริปต์เขียน Sheet และโฟลเดอร์รูปในนามเจ้าของ จึงไม่ต้องแชร์ Sheet ให้เจ้าหน้าที่ทีละคนอีก
