/**
 * LPCH RT Hub — ส่วนหลังบ้าน (Google Apps Script) · เดิมชื่อ Treatment Planning Management (ระบบกระจายงานฟิสิกส์การแพทย์)
 * กลุ่มงานรังสีรักษา · โรงพยาบาลมะเร็งลำปาง
 * ชื่อที่ผู้ใช้เห็น (แท็บเบราว์เซอร์ อีเมลสำรองข้อมูล โฟลเดอร์สำรอง) มาจาก ตั้งค่า → ชื่อระบบและโลโก้ · ชื่อในหัวไฟล์นี้เป็นค่าเริ่มต้นเท่านั้น
 *
 * เก็บข้อมูลในแท็บ Cases, Logs และ Config ของ Google Sheet ที่ผูกสคริปต์นี้ไว้ (เปิดจากชีต → ส่วนขยาย → Apps Script)
 * ถ้าเป็นโปรเจกต์ Apps Script แยก (ไม่ได้ผูกชีต) ใช้ชีตใน Script property SHEET_ID (ID หรือลิงก์ของชีต)
 * ถ้ายังไม่ได้ตั้ง จะสร้างชีตเก็บข้อมูลใหม่ให้ครั้งแรกแล้วจำไว้ใน SHEET_ID (รัน checkSetup เพื่อดูลิงก์ชีต)
 * แท็บเดิมของไฟล์ P4P_Physics จะไม่ถูกแก้ไข (อ่านอย่างเดียวตอนนำเข้า)
 * วิธีติดตั้งอยู่ใน README.md
 *
 * บัญชี LPCH RO Workspace: เข้าสู่ระบบด้วยบัญชีเดียวกับ LPCH (กดจากปุ่มในหน้า LPCH จะมีบัตรผ่าน ?sso=… หรือกรอกชื่อผู้ใช้
 * และรหัสผ่าน LPCH ที่หน้าแรก รหัสผ่านตรวจที่ LPCH ไม่เก็บที่นี่) ทุกคำขอตรวจบัญชีกับ LPCH (เก็บผลไว้ LPCH_CHECK_SECONDS)
 * บันทึกข้อมูลได้เฉพาะตำแหน่งใน LPCH_EDIT_ROLES (MP) คนอื่นดูได้อย่างเดียว
 * Deploy แบบ Execute as: Me · Who has access: Anyone แล้วรันฟังก์ชัน setupLpch เพื่อทดสอบการเชื่อมต่อ
 * เปิดจากเมนูในชีตด้วยบัญชี Google ของเจ้าของไฟล์หรือแอดมินได้เหมือนเดิม
 */

const APP_TITLE = 'LPCH RT Hub';   // ชื่อเริ่มต้น (22 พ.ย.: ตรงกับหน้าเว็บ · เดิม Treatment Planning Management) · แอดมินเปลี่ยนได้ที่ ตั้งค่า (Config appName)
// URL /exec ของ LPCH RO Workspace (เปลี่ยนได้ที่ Script property LPCH_URL · ใส่ - เพื่อปิดและใช้บัญชี Google อย่างเดียว)
const LPCH_URL = 'https://script.google.com/macros/s/AKfycbwBVKgsqip8pavg0H-ibZFcR-9petxW12W3A8eNkO5CI8swiRIk347QMh42JryQJ_k/exec';
const LPCH_EDIT_ROLES = ['MP'];   // ตำแหน่งใน LPCH ที่บันทึกได้ทุกแถบตั้งต้น (แอดมินปรับรายแถบได้ที่ ตั้งค่า → แถบเมนู)
const LPCH_ROLES = ['RO', 'MP', 'RTT', 'Nurse', 'Other', 'Register', 'Refer'];   // ตำแหน่งใน LPCH RO Workspace (ดึงเพิ่มได้จากรายชื่อสมาชิก)
// คอลัมน์ Admin ใน ตั้งค่า → แถบเมนู (API 66): แอดมินใช้สิทธิ์รายแถบของคอลัมน์นี้แทนตำแหน่งของตัวเอง · ยังไม่ตั้ง = เท่า MP
const ADMIN_ROLE = 'Admin';
// คอลัมน์แอดมินรอง (API 67): ผู้ที่อยู่ในรายชื่อแอดมินรอง (config.subAdmins) ใช้คอลัมน์นี้แทนตำแหน่งของตัวเอง · ยังไม่ตั้ง (หรือ "ตามตำแหน่ง") = ตามตำแหน่งของตัวเอง
// การแก้ตั้งค่าของแอดมินรองยังเป็นคำขอที่รอแอดมินหลักอนุมัติ (cfgPropose) เหมือนเดิม
const SUB_ROLE = 'SubAdmin';
const navRole_ = u => (!u || u.via === 'google' ? (u && u.role) || '' : u.isAdmin ? ADMIN_ROLE : u.isSub ? SUB_ROLE : u.role || '');
// สิทธิ์ของผู้ใช้ต่อแถบ: คอลัมน์ Admin / แอดมินรอง / ตำแหน่ง ตามที่ผู้ใช้เป็น
const userAccess_ = (config, view, u) => navAccess_(config, view, navRole_(u), u && u.role);
const LPCH_CHECK_SECONDS = 300;
// หน้าเว็บ (index.html) โหลดจาก GitHub อัตโนมัติ จึงได้หน้าเว็บรุ่นล่าสุดเสมอ ไม่ต้องวางไฟล์ index ใหม่ทุกครั้ง
// เปลี่ยนได้ที่ Script property PAGE_URL · ใส่ - เพื่อใช้ไฟล์ index ในโปรเจกต์ · เปิด …/exec?refresh=1 เพื่อโหลดรุ่นล่าสุดทันที
// โหลดไม่ได้ (หรือไฟล์ไม่ครบ) จะใช้ไฟล์ index ในโปรเจกต์แทน
const PAGE_URL = 'https://raw.githubusercontent.com/nattayee/nattayee/refs/heads/claude/vigilant-bardeen-py5nxb/medphys/index.html';
const PAGE_CACHE_SECONDS = 600;
// รุ่นของไฟล์นี้ (แสดงที่บรรทัดล่างสุดของหน้าเว็บ) และรุ่นของ API ที่หน้าเว็บใช้ตรวจว่า Code.gs ใหม่พอหรือไม่
const CODE_VERSION = '2026-11-27.3';
const API_LEVEL = 150;   // 150: ตั้งเวลาประกาศ (from = เวลาเริ่มแสดง · tgAt · ตัวตั้งเวลา ntfDue ส่ง Telegram ตอนถึงเวลา) · 149: Telegram ประกาศผู้ป่วยไม่ซ้ำ HN ในเนื้อความ · Emergency = 🚨 ตัวหนา · HDR Order วาดบนรูป (hdrOrder f.draw ยาวได้ 36000 ตัวอักษร · ใบสั่งรวม 46000) · นัดคิวใส่แร่ ปุ่ม มาแล้ว / ไม่มา ค่าเริ่มต้น RTT, MP (ตั้งค่าเดิมที่ยังไม่มี config.bq.btn73 และตั้งว่างไว้ = ค่าเริ่มต้น · ตรวจสอบแล้ว = Nurse) · 148: HDR · Contouring กลุ่ม HDR (bqHdr cn = Contour เสร็จต่อรอบ CT ของนัดใส่แร่) · Evaluation กลุ่ม Brachytherapy (bqHdr ok / edit / undo · ev ของนัด · Edit = ล้าง MP) · HDR Order (ชีต HdrOrders · hdrOrder save / sign / unsign ต่อตำแหน่ง) · Treatment Order: Aim · ความถี่ · Dose constraint Target / OAR · Treatment Remark (rem) · MP Recheck (rck) · ลิงก์ประกาศ fx.st (สถานะ fraction · เงื่อนไข type / see) · cn.hdr · ev.bq · 147: Standing order · Nurse กรอกเพิ่ม (soNurse: รายการสั่งตรวจเพิ่มเติม · อื่นๆระบุ · ความเห็นแพทย์ ลงช่อง so ของรายการแจก Call center · ผู้บันทึก nBy / nAt · สิทธิ์แถบ Nurse · ยืนยัน order แล้วแก้ไม่ได้) · 146: Treatment Order ของรังสีระยะไกล (ชีต TxOrders · txOrder: แพทย์ save / sign Rx · MP ค่าที่ได้จากแผน · note ต่อส่วน + ข้อความถึงแพทย์ / MP · RTT รับทราบ) · Contour เสร็จต้องลงนาม Rx ก่อน (ไม่ใช่ HDR) · 145: แถบ Chart check ตาม AAPM TG-275 / MPPG 11.a (ชีต ChartChecks · chartCheck ลงชื่อ / ยกเลิก · สิทธิ์แถบ chartchk ยังไม่ตั้ง = แอดมินเท่านั้น) · 144: Nurse → รับคำสั่งแพทย์ CMT เลือกวันที่ (nurseCmt 'tmr|วันที่' · คอลัมน์ วันให้เคมี cmtd ใน DocOrders) · ยกเลิก CMT (nurseCmt '') · คำสั่งพยาบาลแทนแพทย์ที่ยกเลิกการยืนยันแล้วแก้ได้ (rtdNurse) · ห้องตรวจ → ระหว่างฉาย ลงนัดใส่แร่ HDR (bqCreate src ontx · ตำแหน่งที่บันทึกได้เฉพาะห้องตรวจลง / ยกเลิกเฉพาะนัดที่ลงจากห้องตรวจ) · คำสั่ง Off RT (rtdSave rt off = แพทย์รับทราบจบการฉาย) · 143: ลิงก์ประกาศส่งข้อความส่วนตัวถึงแพทย์เจ้าของไข้ / นักฟิสิกส์ผู้วางแผน (people) · 142: ประกาศอัตโนมัติของผู้ป่วยต่อท้ายห้องฉาย (ntfTxRoom_) · 141: Treatment Summary · หัวหน้างานตรวจสอบและเผยแพร่เอกสาร (txsPub · ชีต TxsPub · txs.pubTeams) · หน่วยงานภายนอกได้เฉพาะเอกสารที่เผยแพร่แล้ว · ลิงก์ประกาศ cn.rect / cn.cancel · CT-SIM Emergency ประกาศ RTT, MP (ค่าเริ่มต้น) · 140: ความปลอดภัย · คำสั่งตั้งระบบและตัวตั้งเวลาใช้ได้เฉพาะตัวตั้งเวลาหรือเจ้าของในหน้า Apps Script (ownerRun_) · ลืมรหัสผ่านจำกัดต่อบัญชี · Telegram ค่าเริ่มต้น HN อย่างเดียว · อีเมลสำรองข้อมูลเป็นลิงก์ (ไม่แนบไฟล์) · บันทึกการเปิด Patient chart (pcSeen · แอดมินเห็นในประวัติของ chart) · 139: Patient chart (สิทธิ์ pchart ใน ตั้งค่า → แถบเมนู · ยังไม่ตั้ง = เท่าแถบลงทะเบียน · ได้ตารางของผู้ป่วย · ถังขยะไม่นับ chart) · ประวัติการบันทึกของผู้ป่วยตาม HN (auditHn · ไม่ส่งค่า QA) · 138: ลิงก์ประกาศของทุกจุดบันทึก (คีย์ sv.ชื่อคำสั่ง · เงื่อนไข sv.คำสั่ง|ช่อง=ค่า) · 137: ข้อความส่วนตัว → Telegram ส่วนตัว (tgMe / tgLinkStart / tgLinkCheck / tgMeTest / tgUnlink · สำเนาใน inboxPost_ · msg.tg) · 136: แถบ Evaluation (evalAct: Approved / Edit ส่งกลับไปวางแผนเดิม + ข้อความถึง MP · ช่อง evNote ของเคส · ลิงก์ประกาศ ev.ok / ev.edit) · 135: Nurse นัดวันนี้ นัด CT-Sim มาตามนัด → พบแพทย์ (ncallAtt what ct status see = รายการพบแพทย์ ctsee|) · ไม่มาตามนัด = ข้อความส่วนตัวถึงแพทย์เจ้าของไข้ด้วย (noShow.msgDoc · ค่าเริ่มต้นเปิด) · 134: แอดมินรองเห็นเหมือนแอดมินหลัก · แถบแจกงานแพทย์ที่ตั้งคอลัมน์แอดมินรองไว้ = ใช้ได้ทุกแถบย่อย (dqDesks_) · ชื่อแถบย่อยที่ตั้งเอง (config.subName · หมวดระบบ · แอดมินรองขอแก้ได้) · 133: ประกาศตามเงื่อนไขในฟอร์ม (config.ntfLink คีย์ ปุ่มบันทึกฟอร์ม|ช่อง=ค่า เช่น ap.new|prio=Emergency · ntfLink รับคีย์เงื่อนไข · สิทธิ์ตามแถบของปุ่ม) · 132: ลิงก์ประกาศของปุ่ม (config.ntfLink · ntfLink · ปุ่มเดิมใช้อาชีพ / ข้อความจากลิงก์) · 131: ลายเซ็นในฟอร์ม (sigForm · ใบลา / Standing order / ใบสั่ง CT Simulation · เฉพาะคนในฟอร์มนั้น · ผู้ที่เห็นแถบของฟอร์ม) · 130: บัญชีของฉัน → ลายเซ็นอิเล็กทรอนิกส์ของตัวเอง (sigMine / sigSave / sigDelete · ชีต Signatures · เจ้าของบัญชีเท่านั้น) · 129: บัญชีของฉัน → ข้อมูลใบลาของตัวเอง (ตำแหน่ง · เบอร์โทรระหว่างลา) ในรายชื่อบุคลากรที่เชื่อมบัญชีนี้ + อีเมลในรายชื่อ = อีเมลของบัญชี RO Workspace (selfProfile) · 128: Nurse → รับคำสั่งแพทย์ CCRT + Continue RT + Continue CMT = CMT Today (RT→CMT / CMT→RT) / CMT Tomorrow (nurseCmt · rtdNurse cmtw · คอลัมน์ CMT วันนี้ ใน DocOrders) · นัดเคมีบำบัด (ncallAtt what cmt · rc / cr) · ขอยกเลิกวันลา ทุกทีม = หัวหน้างานอนุมัติก่อน (leaveCancel · แถว can| ในชีต LeaveAck) · ประวัติการบันทึกเลือกช่วงวันที่ / แถบย่อย (auditRange) · 127: Nurse → นัดวันนี้ ไม่มา แจ้งแพทย์แล้ว (ncallAtt noshow · CT-Sim / Start RT วันแรก / นัดพบแพทย์ระหว่างฉาย) = ประกาศผู้ป่วย 'ไม่มา … วันนี้ (วว/ดด)' ถึงอาชีพใน config.noShow (ค่าเริ่มต้น RTT) + Telegram · ยกเลิกไม่มา = ยกเลิกประกาศ · 126: บัญชีของฉัน (acctMe / acctSave / acctPassword / acctSessions / acctSignOut) · จัดการสมาชิก (acctMembers / acctMemberSave / acctMemberDelete · RO Workspace ตรวจสิทธิ์เอง) · ผู้สมัครใหม่ = ข้อความถึงผู้รับที่ตั้งไว้ (config.msg.signup / signupTo · ไม่ตั้ง = แอดมินหลัก) · 125: สมัครสมาชิก / ลืมรหัสผ่าน จากหน้าเข้าสู่ระบบ (lpchRoles / lpchRegister / lpchForgot / lpchReset ส่งต่อไป LPCH RO Workspace · บัญชีเก็บที่ RO Workspace ที่เดียว · ไม่ต้องเข้าสู่ระบบ) · 124: ข้อความส่วนตัว (ตาราง Inbox · msgSend / msgRead · ส่งถึงบัญชี · สำเนาอีเมลตาม config.msg.mail · ลงวันลา = ขอรับทราบถึงหัวหน้างาน · รับทราบ = แจ้งผู้ลา) · แก้จำนวนภาพ Verify image ของ fraction ที่บันทึกฉายแล้ว (fxImgCase · สถานะไม่เปลี่ยน · PIN) · จำนวนภาพรับทุกชนิด (รหัส 2–4 ตัวอักษร เช่น MV) · 123: พบแพทย์ (visitSave) ผู้ป่วยหนึ่งคนวันละหนึ่งรายการ (HN + วันที่ซ้ำกับรายการที่มีอยู่ = ไม่รับ · แก้รายการเดิมแทน) · 122: ใบลา รับทราบได้เฉพาะหัวหน้างาน / รักษาการแทนของทีมที่ตั้งไว้ (config.leave.heads · hAct · hFrom / hTo · แอดมินกดแทนไม่ได้) · คำสั่งแพทย์ระหว่างฉายที่ Nurse ยืนยันแล้ว แพทย์แก้ / บันทึกซ้ำไม่ได้ (rtdSave · Nurse ยกเลิกการยืนยันก่อน) · Treatment Summary ส่งคอร์ส Cancel RT (+ สาเหตุ rtNote) ให้หน่วยงานภายนอก · 121: Contouring Re-CT / Cancel Treatment (ctContourAct · CT-SIM cnAct / cnNote) · 120: สถานะ fraction เก็บจำนวนภาพ Verify image (img) · 119: Nurse → นัดวันนี้ กลุ่ม Off RT (ncallAtt what off · adv / see / seeadv · รายการพบแพทย์ offsee) · 118: แถบ Contouring (CT-SIM: Contour เสร็จ cdone / cdBy · ctContour · แถบ contour สิทธิ์เท่าแถบ CT Order) · 117: แจกงานฟิสิกส์ บันทึกไว้ก่อน (ctDraft = เก็บค่าที่แก้ลงรายการ CT-SIM ที่รอแจก · Start RT ของนัดที่ผูกเปลี่ยนตาม) · 116: ใบลา (ตาราง LeaveAck · leaveAck = หัวหน้างานรับทราบ · config.leave · ประเภทใบลา ltype ของวันลา MP / แพทย์ · หน่วยงานภายนอกไม่ได้ config.leave และเบอร์โทรบุคลากร) · 115: เปิด / ปิดไอคอนบนแถบเมนู (config.iconsOff · หมวดระบบ) · ลิงก์กลุ่ม Telegram (config.tg.link · ไอคอนบนแถบเมนู) ส่งเฉพาะผู้ที่เห็นประกาศ · หน่วยงานภายนอกไม่ได้ config.tg · 114: Telegram ใส่ HN + ชื่อย่อ (ชื่อ 3 ตัวอักษรแรก · นามสกุล 3 ตัวอักษรแรก · config.tg.pt = abbr | hn | none · ค่าเริ่มต้น abbr) · 113: ส่งประกาศเข้า Telegram (กลุ่มตามอาชีพ · config.tg · token ใน Script Properties · tgState / tgSetup / tgChats / tgTest · ไม่ส่งชื่อผู้ป่วย) · 112: แอดมินลบประกาศถาวร (notifyDelete · แอดมินหลัก / แอดมินรอง · บันทึกในประวัติการบันทึก) · 111: นัดคิวใส่แร่ บันทึก CT / Re-CT รอบใหม่ = ประกาศ HDR ส่งภาพแล้ว (ประเภท brachy · อาชีพ = config.bq.ntf · ค่าเริ่มต้น RO, MP) · 110: ประกาศ · สิทธิ์ส่งรายตำแหน่ง (แถบเมนู → ประกาศ) · ประเภท ผู้ป่วย (HN ชื่อ ด่วนเสมอ) / ทั่วไป · 109: ประกาศ (ตาราง Notices · notifyAdd / notifyAck / notifyCancel · ตัววิ่งใต้แถบเมนูตามอาชีพ) · 108: Treatment Summary เก็บวันที่เริ่มแสดง (config.txs.from · ค่าเริ่มต้น 1 ธ.ค. 2569) · 107: ทะเบียนหนังสือส่ง (แถบย่อยของ Planning · sbkState / sbkCreate / sbkUpdate / sbkDelete / sbkSetNext / sbkCheck · บันทึกในชีตเดิมของเว็บทะเบียนหนังสือส่ง) · 106: แจกงานแพทย์ ย้ายแพทย์เจ้าของไข้แล้วเปลี่ยนแพทย์ในนัด CT Order ด้วย (dqEdit ch.appt · คืน apptRows) · สถานะเครื่อง: ช่องพลังงานของ Interrupt ยาว 60 ตัวอักษร (เลือกได้หลายค่า) · 105: แอดมินรองแก้ได้ทุกหมวดเท่าแอดมินหลัก (subAdmins all · ทุกการแก้ยังรอแอดมินหลักอนุมัติ) · ลำดับแถบย่อย (config subOrder) · 104: Nurse นัดวันนี้: มาแล้วพบแพทย์ก่อน (ncallAtt status see + นัดพบแพทย์ / พบแพทย์ระหว่างฉาย) · ncallNote · holdCancel · คำสั่ง Hold RT ที่พยาบาลยืนยัน = Hold ในตารางวันฉาย · 103: สถานะเครื่อง: Interrupt (machineSet status intr = เหตุการณ์ สถานะไม่เปลี่ยน · คอลัมน์ พลังงาน) · 102: สถานะเครื่อง: แอดมินแก้ไข / ลบประวัติ (machineLogEdit · ช่วงข้างเคียงขยับตาม) · 101: สถานะเครื่อง: แก้เวลาเริ่มของสถานะปัจจุบันได้ (machineSet สถานะเดิม + from · ช่วงก่อนหน้าสิ้นสุดตาม) · 100: สถานะเครื่อง (machineSet · ชีต MachineLog หนึ่งแถวต่อหนึ่งช่วงสถานะ · RTT / MP ตั้งได้ · ซ่อมเสร็จปล่อยเครื่องได้เฉพาะ MP) · 99: ห้ามลงนัดซ้ำ (apptSave: HN ที่มีนัดรอทำ CT อยู่แล้วลงนัดใหม่ไม่ได้ · ตั้งค่า → ลงนัด) · ctSave เพิ่มเองแต่ HN มีนัดรอลง CT-SIM = ผูกกับนัดนั้นให้ (apLinked) · 98: แถบ Treatment Summary (หน่วยงานภายนอกดูสรุปการรักษา · สิทธิ์ตามหน่วยงาน · ศูนย์ refer พิมพ์ได้เฉพาะผู้ป่วยที่ส่งต่อ · บันทึกการเข้าถึง TxsLog เพิ่มอย่างเดียว · txsLog / txsLogRead / txsRefer / txsSetup / txsPdf) · 97: งานช้าไม่ถือล็อกบันทึก (ดึงจาก Google Drive อ่านไฟล์นอกล็อก · ย้ายเข้าที่เก็บถาวร · ไฟล์ฝึก) = คนอื่นบันทึกไม่ต้องรอ · 96: แอดมินเปิด / ปิดโหมดฝึกใช้ (practiceSet · ค่าเริ่มต้น ปิด) · 95: โหมดฝึกใช้ (practiceCall · practiceReset · ข้อมูลฝึกในไฟล์ Google Sheet แยก ไม่กระทบระบบจริง) · 94: แถบ Nurse → เลื่อนนัด · นัดวันนี้ · ผู้ป่วยไม่มาตามนัด (ตาราง NurseCall · ncallAdd / ncallMark / ncallAtt) · รับคำสั่งแพทย์ (rtdNurse) · Re-CT พบแพทย์ (fractionCase see) · 93: ถังขยะ (ชีต Trash · trashList · trashRestore · trashPurge) · รายการที่ผู้ใช้ลบเก็บทั้งแถว 90 วัน กู้คืนได้ · 92: นัดคิวใส่แร่ เลื่อนนัด (bqMove) · สถานะ เลื่อนนัดไม่มีกำหนด (ไม่นับเคส · ไม่นับคะแนน) · 91: RO Jobs → P4P แพทย์ (roJobsSave · ตาราง RoJobs) · ตำแหน่งหัวหน้า/ลูกน้องของทุกทีม (หัวหน้าเห็น P4P ของทีม) · 90: พบแพทย์นอกตารางนัด (visitSave · visitMark · visitRemove) · 89: สำเนาตารางในแคช (โหลดข้อมูลเร็วขึ้น) · เข้าสู่ระบบส่งข้อมูลมาพร้อมกัน · 88: ตารางพบแพทย์รายสัปดาห์ในแถบ Nurse (seeSaveMany · บันทึกได้จากแถบ Nurse) · 87: พบแพทย์วันนี้ แก้ไขต้องใส่ PIN (seeSave) · 86: พบแพทย์วันนี้ (seeSave) · ห้องตรวจ ระหว่างฉาย (rtdSave) · แถบ Nurse (nurseMark) · 85: ผูก CT Order กับรายการ CT-SIM เฉพาะ HN ตรงกัน · แก้การผูกผิด (apptRelink) · 84: แจกงานแพทย์ ช่องรับคืนจากแพทย์ (dqBack) · 83: TDF Dose Calculator ฝังในแถบย่อยของ Planning บันทึกลงชีตของเว็บ TDF (tdfx*) · 82: HDR Activity ในแถบนัดคิวใส่แร่ (hdrGet, hdrAdd) · 81: RT Workflow (ไอคอน flow) ได้ข้อมูลทุกตำแหน่ง · วันลา RTT/RA ของทุกคนในแถบ RTT/RA Jobs
// หน้าเว็บที่เปิดจากเมนูในชีต (บัญชี Google) ส่งค่านี้แทน token
const SHEET_DIALOG = 'sheet-dialog';
const CONFIG_SHEET = 'Config';
// คอลัมน์เวลาแก้ล่าสุดของแถว (Cases, Logs · ระบบเขียนเองทุกครั้งที่บันทึก) ใช้ส่งเฉพาะแถวที่เปลี่ยนให้หน้าเว็บ (API 61)
const REV_HEAD = 'แก้ไขล่าสุด (ระบบ)';
const TABLES = {
  cases: {
    sheet: 'Cases',
    fields: [
      ['id', 'id'], ['cat', 'หมวด'], ['mp', 'MP'], ['how', 'วิธีแจก'], ['n', 'จำนวนครั้ง'], ['ct', 'CT-Sim'], ['in', 'In'], ['sim', 'Sim'],
      ['fin', 'Finish'], ['eval', 'Evaluate'],
      // ปุ่มบันทึกขั้นตอน: วันเวลา คนกด และค่า (Dose check, F0, Delta4, SRS MapCheck) เขียนผ่าน stampCase เท่านั้น · Plan complete ไม่มีค่า
      ['finBy', 'Finish โดย'], ['evalBy', 'Evaluate โดย'],
      ['mu', 'Dose check'], ['muBy', 'Dose check โดย'], ['muVal', 'Dose check ค่า'],
      ['d0', 'F0'], ['d0By', 'F0 โดย'], ['d0Val', 'F0 ค่า'],
      ['d4', 'Delta4'], ['d4By', 'Delta4 โดย'], ['d4Val', 'Delta4 ค่า'],
      ['mc', 'SRS MapCheck'], ['mcBy', 'SRS MapCheck โดย'], ['mcVal', 'SRS MapCheck ค่า'],
      // หมายเหตุของค่า (ใส่ตอนบันทึกค่า ไม่บังคับ)
      ['muNote', 'Dose check หมายเหตุ'], ['d0Note', 'F0 หมายเหตุ'], ['d4Note', 'Delta4 หมายเหตุ'], ['mcNote', 'SRS MapCheck หมายเหตุ'],
      ['pc', 'Plan complete'], ['pcBy', 'Plan complete โดย'],
      // จบการฉาย (แถบ Complete): complete = Complete course · cancel = Cancel RT (ต้องมีสาเหตุ) · เขียนผ่าน courseCase เท่านั้น
      ['rt', 'สถานะการฉาย'], ['rtDate', 'วันที่จบการฉาย'], ['rtAt', 'สถานะการฉาย เมื่อ'], ['rtBy', 'สถานะการฉาย โดย'], ['rtNote', 'สาเหตุ / หมายเหตุการฉาย'],
      // สถานะรายวันของ fraction (Hold, HV, Re-CT, Off RT ฯลฯ) [{date, type, label, act, back, reason, note, by, at}] (JSON) · เขียนผ่าน fractionCase เท่านั้น
      ['fxlog', 'สถานะ fraction'],
      // รายละเอียดผู้ป่วยหลัง HN ในตารางวันฉาย เช่น "NPO, BD protocol" · เขียนผ่าน tagCase เท่านั้น
      ['ptags', 'รายละเอียดผู้ป่วย'],
      // ย้ายห้องฉาย [{date, room, from, scope, note, by, at}] (JSON) · scope: once = เฉพาะ fraction วันนั้น · on = ตั้งแต่วันนั้นเป็นต้นไป · เขียนผ่าน moveCase เท่านั้น
      ['rmove', 'ย้ายห้อง'],
      // ปุ่มขั้นตอนของแผน Sequential boost แต่ละบริเวณ { sid: { fin, finBy, eval, ..., muVal, muNote } } (JSON) · เขียนผ่าน stampBoost เท่านั้น
      ['bsteps', 'ขั้นตอนของ boost'],
      // API 136: แถบ Evaluation [{ at, by, act: ok | edit | undo, note, sid }] (JSON · sid ว่าง = แผนแรก) · เขียนผ่าน evalAct เท่านั้น
      ['evNote', 'Evaluation หมายเหตุ'],
      // เวลานัดฉายใน Mosaiq (HH:MM) ช่องหน้า HN ในตารางวันฉาย · เขียนผ่าน timeCase เท่านั้น
      ['mqt', 'Mosaiq Time'],
      // เพิ่ม fraction (บันทึกที่ fraction สุดท้ายของคอร์ส) [{date, n, reason, by, at}] (JSON) · ฉายต่อจากวันสุดท้าย · เขียนผ่าน addFxCase เท่านั้น
      ['fxadd', 'เพิ่ม fraction'],
      // งานวางแผนใหม่ที่ระบบสร้างให้ MP คนเดิม (Re-CT, ย้ายห้อง ฯลฯ) { of: id ของเคสเดิม, date, kind, label, reason } (JSON) · เขียนผ่าน replanCase เท่านั้น
      ['replan', 'งานวางแผนใหม่ (จาก)'],
      // วิธีแจก (how): auto · manual · follow · replan (งานวางแผนใหม่) · direct = ผู้ป่วยที่เพิ่มในแถบห้องฉาย ไม่แจกงานให้ MP (courseAdd)
      ['type', 'Type'], ['hn', 'HN'], ['name', 'Name'],
      ['icd', 'ICD-10'], ['dx', 'Diagnosis'], ['doc', 'Doc'], ['aim', 'Aim'], ['tech', 'Technique'], ['room', 'ห้องฉาย'],
      ['dpf', 'Dose/fx (Gy)'], ['fx', 'Fx'], ['rx', 'Prescription (Gy)'], ['freq', 'ความถี่'], ['area', 'บริเวณที่ฉาย'],
      ['sites', 'บริเวณเพิ่มเติม'],   // ฉายหลายที่: บริเวณที่ 2 เป็นต้นไป [{area, dpf, fx, freq}] (JSON)
      ['batch', 'ชุด'], ['note', 'Note'],
      ['created', 'Created'], ['updated', 'Updated'],
      ['rev', 'แก้ไขล่าสุด (ระบบ)'],   // = REV_HEAD
    ],
  },
  logs: {
    sheet: 'Logs',
    fields: [
      ['id', 'id'], ['kind', 'ประเภท'], ['date', 'Date'], ['mp', 'MP'], ['hn', 'HN'], ['name', 'Name'],
      ['caseId', 'เคส (id)'], ['title', 'กิจกรรม'], ['min', 'เวลา'], ['k', 'k'], ['note', 'Note'],
      ['created', 'Created'], ['updated', 'Updated'],
      ['src', 'ที่มา'],   // brachy:<รหัสนัด>:plan|rc = ดึงจากระบบนัด Brachytherapy (ว่าง = บันทึกเอง)
      ['rev', 'แก้ไขล่าสุด (ระบบ)'],   // = REV_HEAD
    ],
  },
  leaves: {
    sheet: 'Leaves',
    fields: [['id', 'id'], ['mp', 'MP'], ['from', 'ตั้งแต่'], ['to', 'ถึง'], ['note', 'Note'], ['created', 'Created'], ['updated', 'Updated'],
      ['ltype', 'ประเภทใบลา']],   // API 116: ลาพักผ่อน / ลาป่วย / ลากิจ / ลาคลอดบุตร … (ใบลา · ว่าง = ลาพักผ่อน)
  },
  // ปฏิทินแผนก (API 79): กิจกรรมของแผนก · เพิ่มใหม่ไม่ต้องใช้ PIN · แก้ / ลบต้องยืนยัน PIN
  events: {
    sheet: 'DeptEvents',
    fields: [['id', 'id'], ['title', 'กิจกรรม'], ['from', 'ตั้งแต่'], ['to', 'ถึง'], ['note', 'รายละเอียด'], ['by', 'บันทึกโดย'], ['created', 'Created'], ['updated', 'Updated']],
  },
  // ผู้ปฏิบัติงานประจำวันในตารางวันฉาย: id = วันที่|ห้อง · RTT / RA = ชื่อคั่นด้วยจุลภาค · เขียนผ่าน dutyDay เท่านั้น
  duty: {
    sheet: 'Duty',
    fields: [['id', 'id'], ['date', 'วันที่'], ['room', 'ห้องฉาย'], ['rtt', 'RTT'], ['ra', 'RA'], ['qc', 'QC'], ['by', 'บันทึกโดย'], ['at', 'บันทึกเมื่อ']],
  },
  // แถบ CT-SIM: ผู้ป่วยที่ทำ CT จำลองการฉาย แยกเครื่อง (ct = รหัสเครื่องใน ตั้งค่า) · ข้อมูลแบบฟอร์มแจกเคส + อุปกรณ์ในห้อง CT
  // send = ส่งให้แถบงาน · took = id ของเคสที่ MP แจกจากรายการนี้ (หรือ skip = ไม่ต้องแจก) · เขียนผ่าน ctSave / ctMark / addCases เท่านั้น
  ctsim: {
    sheet: 'CTSim',
    fields: [
      ['id', 'id'], ['ct', 'เครื่อง CT'], ['date', 'วันที่'], ['hn', 'HN'], ['name', 'Name'],
      ['organ', 'Organ'], ['mask', 'Mask'], ['bite', 'bitelock'], ['cm', 'CM'], ['coil', 'Coil'], ['ydev', 'Y'], ['inj', 'Syring Injector'], ['nss', 'Normal Saline'], ['syr', 'Syring 50cc'],
      ['doc', 'แพทย์'], ['pstat', 'สถานะ'], ['hdr', 'HDR'], ['crad', 'C-RAD'], ['note', 'Note'], ['research', 'เคสวิจัย'],
      ['cats', 'เทคนิค'], ['type', 'Type'], ['aim', 'Aim'], ['room', 'ห้องฉาย'], ['tech', 'Technique'], ['area', 'บริเวณที่ฉาย'],
      ['dpf', 'Dose/fx (Gy)'], ['fx', 'Fx'], ['rx', 'Prescription (Gy)'], ['freq', 'ความถี่'], ['sim', 'Start RT'], ['icd', 'ICD-10'], ['dx', 'Diagnosis'], ['extra', 'หัวข้อเพิ่มเติม'],
      ['ctcm', 'CT (CM / Non-CM)'], ['special', 'เทคนิคพิเศษ'],   // API 49 · เหมือนฟอร์มลงนัด (ชีตเดิม: เพิ่มคอลัมน์ท้ายให้เอง)
      ['send', 'ส่งแถบงาน'], ['took', 'แจกเคสแล้ว (id)'], ['tookBy', 'แจกเคสโดย'], ['tookAt', 'แจกเคสเมื่อ'],
      ['by', 'บันทึกโดย'], ['created', 'Created'], ['updated', 'Updated'],
      ['cdone', 'Contour เสร็จ'], ['cdBy', 'Contour เสร็จโดย'],
      ['cnAct', 'Contouring: Re-CT / Cancel'], ['cnNote', 'Contouring: หมายเหตุ'],   // API 121: เขียนผ่าน ctContourAct เท่านั้น   // API 118: แถบ Contouring (เขียนผ่าน ctContour เท่านั้น)
    ],
  },
  // แถบลงทะเบียน: ผู้ป่วยที่ลงทะเบียน (HN ไม่ซ้ำ · HN คำนำหน้า ชื่อ-สกุล บังคับตาม ตั้งค่า → ลงทะเบียน) · birth = วันเกิด (YYYY-MM-DD) · sex = เพศ (ตัวเลือก Gender ของใบสั่ง)
  // แถบลงนัดดึงไปใช้ (ชื่อ อายุ เพศ แพทย์ Diag) · เขียนผ่าน regSave / regRemove เท่านั้น · รุ่น 2026-10-30.1 เก็บชื่อและสกุลแยกคอลัมน์ (อ่านใน regRows_)
  reg: {
    sheet: 'Registry',
    fields: [
      ['id', 'id'], ['hn', 'HN'], ['title', 'คำนำหน้า'], ['name', 'ชื่อ-สกุล'], ['sex', 'เพศ'], ['birth', 'วันเกิด'], ['phone', 'เบอร์โทร'], ['right', 'สิทธิการรักษา'],
      ['doc', 'แพทย์'], ['icd', 'ICD-10'], ['dx', 'Diagnosis'], ['note', 'Note'], ['by', 'บันทึกโดย'], ['created', 'Created'], ['updated', 'Updated'],
      // API 63 (ตามรายงาน Consult จาก HIS): วันที่รับ Consult · วันที่นัดมา (YYYY-MM-DD) · ช่องทาง · ส่งตัวจาก (โรงพยาบาลต้นทาง) · ICD-10 อื่น (รหัสที่เหลือ คั่นด้วย , ) · ชีตเดิม: เพิ่มคอลัมน์ท้ายให้เอง
      ['consult', 'วันที่รับ Consult'], ['visit', 'วันที่นัดมา'], ['chan', 'ช่องทาง'], ['refer', 'ส่งตัวจาก'], ['icds', 'ICD-10 อื่น'],
      ['rev', 'แก้ไขล่าสุด (ระบบ)'],   // = REV_HEAD (รุ่น 2026-11-10.3): ลงทะเบียน/แก้แล้วหน้าเว็บอื่นรับเฉพาะแถวนั้น ไม่โหลดผู้ป่วยทั้งหมดใหม่
    ],
  },
  // แถบนัดคิวใส่แร่: นัดใส่แร่หนึ่งแถวต่อหนึ่ง Fraction (course = คอร์สเดียวกัน) · status = นัดแล้ว / มาตามนัด / ยกเลิก · mp / rc = รหัสนักฟิสิกส์ที่ลงชื่อ · rtt = ชื่อ RTT
  // hist = ประวัติการแก้ไข (JSON) · src = bq:<รหัสนัดเดิม> เมื่อนำเข้าจากระบบนัดคิวใส่แร่เดิม · เขียนผ่าน bqCreate / bqEdit / bqCancel / bqImport เท่านั้น
  bq: {
    sheet: 'BrachyQueue',
    fields: [
      ['id', 'id'], ['course', 'คอร์ส'], ['date', 'วันที่นัด'], ['hn', 'HN'], ['name', 'ชื่อ-สกุล'], ['doc', 'แพทย์'], ['tech', 'รูปแบบการใส่'],
      ['fx', 'Fx'], ['total', 'จำนวน Fx'], ['note', 'หมายเหตุ'], ['status', 'สถานะ'], ['mp', 'MP'], ['rc', 'RC'],
      ['hist', 'ประวัติการแก้ไข (JSON)'], ['src', 'ที่มา'], ['by', 'ลงนัดโดย'], ['created', 'Created'], ['editedBy', 'แก้ไขโดย'], ['updated', 'Updated'], ['rtt', 'RTT'],
      ['ct', 'CT'], ['ctRoom', 'ห้อง CT'], ['us', 'Ultrasound'],
      ['chk', 'ตรวจสอบแล้ว'], ['chkBy', 'ตรวจสอบโดย'],   // API 75: ปุ่มตรวจสอบแล้ว (bqCheck)
      ['cn', 'Contour HDR (JSON)'], ['ev', 'ประเมินแผน HDR (JSON)'],   // API 148: bqHdr
    ],
  },
  // แถบลงนัด: นัดทำ CT-Sim (date) และ Start RT ของผู้ป่วย · CT = CM / Non-CM · special = เทคนิคพิเศษ (SRS, SRT, SBRT, DIBH คั่นด้วยจุลภาค)
  // took = id ของรายการ CT-SIM ที่ลงจากนัดนี้ (หรือ skip = ไม่มาทำ CT) · เขียนผ่าน apptSave / apptMark / ctSave เท่านั้น
  appt: {
    sheet: 'Appts',
    fields: [
      ['id', 'id'], ['date', 'นัด CT-Sim'], ['hn', 'HN'], ['name', 'Name'], ['cm', 'CT'], ['special', 'เทคนิคพิเศษ'],
      ['dpf', 'Dose/fx (Gy)'], ['fx', 'Fx'], ['rx', 'Prescription (Gy)'], ['freq', 'ความถี่'], ['sim', 'Start RT'], ['ct', 'เครื่อง CT'], ['room', 'ห้องฉาย'],
      ['doc', 'แพทย์'], ['icd', 'ICD-10'], ['dx', 'Diagnosis'], ['note', 'Note'],
      ['order', 'ใบสั่ง CT Sim (JSON)'],
      ['took', 'ลง CT-SIM แล้ว (id)'], ['tookBy', 'ลง CT-SIM โดย'], ['tookAt', 'ลง CT-SIM เมื่อ'],
      ['by', 'บันทึกโดย'], ['created', 'Created'], ['updated', 'Updated'],
      ['nurse', 'Nurse ยืนยัน'], ['nurseBy', 'Nurse โดย'],   // API 86: Nurse ยืนยัน CT Order (nurseMark)
    ],
  },
  // แถบ RTT/RA Jobs: ภาระงานรายเดือนของแต่ละคน (id = ชื่อไม่มีคำนำหน้า|YYYY-MM) · งานห้องฉาย/CT ระบบคำนวณจากผู้ปฏิบัติงานประจำวัน
  // เก็บเฉพาะช่องที่กรอกเองหรือแก้ (cells = { แถวในแบบฟอร์ม: { วันที่: ค่า } }) · วันลา · ตำแหน่ง/แต้มประกันของเดือนนั้น · เขียนผ่าน jobsSave เท่านั้น
  jobs: {
    sheet: 'Jobs',
    fields: [
      ['id', 'id'], ['ym', 'เดือน'], ['who', 'ชื่อ'], ['user', 'บัญชี'], ['kind', 'แบบฟอร์ม'], ['prof', 'ตำแหน่ง (JSON)'],
      ['cells', 'ช่องที่กรอก/แก้ (JSON)'], ['leaves', 'วันลา (JSON)'], ['by', 'บันทึกโดย'], ['updated', 'Updated'],
    ],
  },
  // Vac-Lok (API 48): การใช้ Vac-Lok หนึ่งแถวต่อครั้ง (no = เลข Vac-Lok · ผูกกับผู้ป่วยด้วย HN) · off = วัน Off (ว่าง = ตามการฉายของผู้ป่วย) · hold = Hold RT
  // ctId = รายการ CT-SIM ที่เลือก Vac-Lok (ฟอร์ม CT-SIM) · src = ctsim / manual / vac:<เลข>|<HN>|<วันทำ CT> (นำเข้าจากชีตเดิม) · เขียนผ่าน vacSave / vacRemove / vacImport / ctSave เท่านั้น
  // คำขอแก้การตั้งค่าของแอดมินรอง: หนึ่งแถวต่อหนึ่งส่วน (คีย์ของ Config) · req = เลขคำขอ · status pending | approved | rejected | cancelled
  // เขียนผ่าน cfgPropose / cfgDecide เท่านั้น · อนุมัติแล้วค่าในคำขอแทนส่วนนั้นของ Config ทั้งส่วน
  cfgreq: {
    sheet: 'ConfigRequests',
    fields: [
      ['id', 'id'], ['req', 'คำขอ'], ['key', 'ส่วน (คีย์)'], ['value', 'ค่าใหม่ (JSON)'], ['base', 'ค่าตอนส่ง (JSON)'], ['note', 'หมายเหตุ'],
      ['by', 'ผู้ขอ'], ['byUser', 'บัญชีผู้ขอ'], ['at', 'เวลาที่ขอ'], ['status', 'สถานะ'], ['decBy', 'ผู้ตัดสิน'], ['decAt', 'เวลาที่ตัดสิน'], ['why', 'เหตุผล'],
    ],
  },
  // นัดที่นำเข้าจากระบบนัดคิวเทคนิคพิเศษ (API 59 · ตั้งค่า → ลงนัด): เฉพาะนัดที่ HN มีในระบบนี้ · เขียนผ่าน spqSync_ เท่านั้น (เขียนทับทั้งแท็บเมื่อข้อมูลเปลี่ยน)
  // cbct = วันทำ CBCT (ระหว่างฉาย + ก่อนเริ่มฉาย) คั่นด้วยจุลภาค · ปฏิทิน Start RT จับคู่กับนัด / เคสด้วย HN และช่วงวันฉาย แล้วนับวันทำ CBCT เป็นผู้ป่วยใหม่
  spq: {
    sheet: 'SpecialQueue',
    fields: [
      ['id', 'id'], ['hn', 'HN'], ['tech', 'เทคนิค'], ['site', 'ตำแหน่งที่ฉาย'], ['fx', 'จำนวนครั้ง'], ['freq', 'ความถี่'],
      ['start', 'วันเริ่มฉาย'], ['end', 'วันสิ้นสุดการฉาย'], ['cbct', 'วันทำ CBCT'], ['pattern', 'รูปแบบ CBCT'],
    ],
  },
  vac: {
    sheet: 'VacLok',
    fields: [
      ['id', 'id'], ['no', 'Vac-Lok No.'], ['hn', 'HN'], ['name', 'Name'], ['room', 'ห้องฉาย'], ['ct', 'วันทำ CT'], ['off', 'Off'], ['hold', 'Hold RT'],
      ['note', 'Note'], ['ctId', 'CT-SIM (id)'], ['src', 'ที่มา'], ['by', 'บันทึกโดย'], ['created', 'Created'], ['updated', 'Updated'],
    ],
  },
};
// ที่เก็บถาวรของแถบลงทะเบียน (API 61): ผู้ป่วยที่ลงทะเบียน/แก้ล่าสุดเกิน N ปี และไม่มีรายการในแถบอื่นตั้งแต่นั้น · ช่องเดียวกับ Registry + เวลาที่ย้าย
// เขียนผ่าน regArchive_ / regMoveBack_ เท่านั้น · หน้าเว็บไม่โหลด (ค้นผ่าน regFind)
// แถบแจกงานแพทย์ (API 62): ผู้ป่วยหนึ่งคนต่อหนึ่งแถว ใช้แค่ HN และชื่อ · doc = แพทย์ที่ได้ · how = auto (ตามคิว) | manual (เลือกเอง) · date = วันที่แจก
// st = '' รอลงนัด (แถบลงนัด จัดกลุ่มตามแพทย์ · ลงนัด HN นี้ตั้งแต่วันที่แจก = ลงนัดแล้ว) | skip = ไม่ต้องลงนัด · เขียนผ่าน dqAdd / dqEdit / dqRemove เท่านั้น
TABLES.dq = {
  sheet: 'DocQueue',
  fields: [
    ['id', 'id'], ['hn', 'HN'], ['name', 'Name'], ['doc', 'แพทย์'], ['how', 'วิธีแจก'], ['date', 'วันที่แจก'], ['st', 'สถานะ'], ['note', 'Note'],
    ['by', 'แจกโดย'], ['created', 'Created'], ['updated', 'Updated'],
    ['rev', 'แก้ไขล่าสุด (ระบบ)'],   // = REV_HEAD
    // API 64 ดึงจากรายงาน Consult ของ HIS (how = import · src = his · date = วันที่รับ Consult): ไม่นับในคิว ไม่ไปรอลงนัด · ใช้ในสรุปรายเดือนและไฟล์ส่งออก
    ['visit', 'วันที่นัดมา'], ['chan', 'ช่องทาง'], ['refer', 'ส่งตัวจาก'], ['icd', 'ICD10'], ['src', 'ที่มา'],
    // API 73: st = doc (ขอเอกสารเพิ่ม · กลับไปแถบแจกงานแพทย์) | nort (ไม่ RT) · รายละเอียด ใคร เมื่อไร (dqMark)
    ['stNote', 'รายละเอียดสถานะ'], ['stBy', 'สถานะโดย'], ['stAt', 'สถานะเมื่อ'],
    // API 75: แถบย่อยที่แจก · '' = Call center (แถบเดิม · ดึงจากรายงาน HIS) · คิวแพทย์ วันลา เวร S1 และรายงานใช้ร่วมกัน
    // API 76: แถบย่อย ภายใน/Walk in เลือกได้ว่า in = ภายใน | walk = Walk in (รุ่น API 75 เก็บ walk อย่างเดียว)
    ['desk', 'จุดรับเคส'],
    // API 78: Standing order สำหรับผู้ป่วยนัด case call center (JSON ของช่องในแบบฟอร์ม · หน้าเว็บพิมพ์เป็น A4)
    ['so', 'Standing order'],
    // API 84: รับคืนจากแพทย์ (ติ๊กในแถบแจกงานแพทย์ · dqBack) · back = เวลาที่ติ๊ก ('' = ยังไม่รับคืน) · backBy = ผู้ติ๊ก
    ['back', 'รับคืน'], ['backBy', 'รับคืนโดย'],
    // API 86: Nurse ยืนยัน order จาก Call center (หลังแพทย์รับและลงนัด CT+RT) · nurseMark
    ['nurse', 'Nurse ยืนยัน'], ['nurseBy', 'Nurse โดย'],
  ],
};
// API 86 (18 พ.ย.): พบแพทย์วันนี้ (แถบห้องฉาย) · id = วันที่|ห้อง · docs = รหัสแพทย์คั่นด้วยจุลภาค · เขียนผ่าน seeSave
TABLES.see = {
  sheet: 'DocSee',
  fields: [['id', 'id'], ['date', 'วันที่'], ['room', 'ห้องฉาย'], ['docs', 'แพทย์'], ['by', 'บันทึกโดย'], ['at', 'บันทึกเมื่อ']],
};
// API 91 (18 พ.ย.): RO Jobs → P4P แพทย์ (แบบเก็บภาระงานรายบุคคล) · id = รหัสแพทย์|YYYY-MM · เก็บเฉพาะช่องที่กรอก/แก้ (cells = { แถวในแบบฟอร์ม: { วันที่: ค่า } })
// prof = ตำแหน่ง แต้มประกัน แต้ม/นาที ของเดือนนั้น (หัวไฟล์ Excel) · เขียนผ่าน roJobsSave เท่านั้น
TABLES.roJobs = {
  sheet: 'RoJobs',
  fields: [['id', 'id'], ['ym', 'เดือน'], ['doc', 'แพทย์'], ['name', 'ชื่อ'], ['prof', 'ตำแหน่ง (JSON)'], ['cells', 'ช่องที่กรอก/แก้ (JSON)'], ['by', 'บันทึกโดย'], ['updated', 'Updated']],
};
// API 90 (18 พ.ย.): พบแพทย์นอกตารางนัด (แถบ Nurse → นัดพบแพทย์) · ไปรอที่ ห้องตรวจ → ระหว่างฉาย ตามแพทย์ที่เลือก · seen = เวลาที่แพทย์กดพบแล้ว
TABLES.visit = {
  sheet: 'DocVisit',
  fields: [['id', 'id'], ['date', 'วันที่'], ['hn', 'HN'], ['name', 'Name'], ['doc', 'แพทย์'], ['note', 'Note'], ['by', 'บันทึกโดย'], ['at', 'บันทึกเมื่อ'], ['seen', 'พบแพทย์แล้ว'], ['seenBy', 'พบแพทย์โดย']],
};
// API 94 (19 พ.ย.): แถบ Nurse · kind = mv (เลื่อนนัด: ติ๊ก "เลื่อนนัดแจ้งพยาบาล" ใต้ช่องวันที่ · what = ct | sim | bq · from → to)
// | att (นัดวันนี้: what = ct | sim · date = วันนัด · status = came | noshow) · mv status = told (แจ้งผู้ป่วยแล้ว) | fail (ติดต่อไม่ได้ · tries = จำนวนครั้ง)
TABLES.ncall = {
  sheet: 'NurseCall',
  fields: [['id', 'id'], ['kind', 'ชนิด'], ['what', 'นัด'], ['ref', 'รายการ (id)'], ['hn', 'HN'], ['name', 'Name'], ['doc', 'แพทย์'], ['from', 'วันเดิม'], ['to', 'วันใหม่'], ['date', 'วันนัด'],
    ['status', 'สถานะ'], ['tries', 'ติดต่อไม่ได้ (ครั้ง)'], ['note', 'Note'], ['by', 'บันทึกโดย'], ['at', 'บันทึกเมื่อ'], ['nBy', 'พยาบาล'], ['nAt', 'พยาบาลบันทึกเมื่อ']],
};
// API 100 (20 พ.ย.): สถานะเครื่อง · หนึ่งแถว = หนึ่งช่วงสถานะของเครื่อง: from (เริ่ม) → to (สิ้นสุด = เวลาเริ่มของสถานะถัดไป · ว่าง = สถานะปัจจุบัน)
// status = ready (พร้อมใช้) | qc | part (ใช้ได้บางส่วน) | down (เครื่องเสีย) | repair (กำลังซ่อม) | test (ทดสอบหลังซ่อม) | pm | sys (ระบบสนับสนุนล่ม) · wait = ผู้ป่วยของห้องที่ยังไม่ได้ฉายตอนตั้งสถานะ
TABLES.mlog = {
  sheet: 'MachineLog',
  fields: [['id', 'id'], ['machine', 'เครื่อง'], ['status', 'สถานะ'], ['from', 'เริ่ม'], ['to', 'สิ้นสุด'], ['cat', 'หมวดอาการ'], ['note', 'Note'], ['eta', 'คาดว่าเสร็จ'], ['wait', 'ผู้ป่วยรอฉาย (คน)'],
    ['by', 'บันทึกโดย'], ['role', 'ตำแหน่ง'], ['at', 'บันทึกเมื่อ'], ['editBy', 'แก้โดย'], ['editAt', 'แก้เมื่อ'], ['energy', 'พลังงาน']],   // energy (API 103): พลังงานที่เกิด Interrupt
};
// API 109 (21 พ.ย.): ประกาศ · หนึ่งแถว = หนึ่งประกาศ · roles = อาชีพที่แจ้ง (คั่นด้วยจุลภาค) · level = normal | urgent · until = แสดงถึงวันที่
// acks = JSON { อาชีพ: { by, user, at } } (คนแรกของอาชีพที่กดรับทราบ = ประกาศหายจากทุกคนในอาชีพนั้น) · ยกเลิก = cancelBy / cancelAt · เขียนผ่าน notifyAdd / notifyAck / notifyCancel
TABLES.notify = {
  sheet: 'Notices',
  fields: [['id', 'id'], ['text', 'ข้อความ'], ['roles', 'ถึงอาชีพ'], ['level', 'ระดับ'], ['until', 'แสดงถึง'], ['by', 'ส่งโดย'], ['byUser', 'บัญชีผู้ส่ง'], ['at', 'ส่งเมื่อ'],
    ['acks', 'รับทราบ (JSON)'], ['cancelBy', 'ยกเลิกโดย'], ['cancelAt', 'ยกเลิกเมื่อ'],
    ['kind', 'ประเภท'], ['hn', 'HN'], ['pname', 'ชื่อผู้ป่วย'], ['from', 'เริ่มแสดง'], ['tgAt', 'ส่ง Telegram (ตั้งเวลา)']],   // API 150: from = ตั้งเวลา (ว่าง = แสดงทันที) · tgAt = ส่ง Telegram ของประกาศตั้งเวลาแล้วเมื่อ · API 110: ประเภท patient (ผู้ป่วย) | general (ทั่วไป) · API 111: brachy (HDR ส่งภาพแล้ว · ระบบสร้างเอง) · ชีตเดิมได้คอลัมน์เพิ่มเองตอนบันทึก
};
// API 116 (23 พ.ย.): ใบลา · หัวหน้างานกด "รับทราบ" = ตรา "รับทราบแล้ว" ข้างชื่อผู้ลาในใบลา · หนึ่งแถวต่อหนึ่งวันลา
// id = src|key · src: mp (Leaves · key = id) · ro (DocLeaves · key = id) · rtt (วันลาในแบบฟอร์ม RTT/RA Jobs · key = ชื่อ|ตั้งแต่|ถึง|ประเภท)
// from / to / type = วันลา ณ ตอนกด (แก้วันลาภายหลัง = ตราไม่ขึ้น ต้องกดใหม่) · เอาออก = ล้าง by / at · เขียนผ่าน leaveAck เท่านั้น
// API 124 (24 พ.ย.): ข้อความส่วนตัว · หนึ่งแถวต่อผู้รับ · to / from = บัญชี (ชื่อผู้ใช้หรืออีเมล ตัวเล็ก) · kind: msg | leave (ขอรับทราบใบลา) | ack (รับทราบแล้ว)
// ref = วันลาที่เกี่ยว (src|id) · read = อ่านเมื่อ · mail = sent | ข้อความผิดพลาด · ส่งให้เฉพาะผู้รับ / ผู้ส่ง (ไม่ผ่านสำเนาตารางที่ทุกคนได้)
TABLES.inbox = {
  sheet: 'Inbox',
  fields: [['id', 'id'], ['to', 'ถึงบัญชี'], ['toName', 'ถึง'], ['from', 'จากบัญชี'], ['fromName', 'จาก'], ['kind', 'ประเภท'], ['title', 'เรื่อง'], ['text', 'ข้อความ'],
    ['ref', 'อ้างอิง'], ['at', 'ส่งเมื่อ'], ['read', 'อ่านเมื่อ'], ['mail', 'อีเมล']],
};
TABLES.lvack = {
  sheet: 'LeaveAck',
  fields: [['id', 'id'], ['src', 'ที่มา'], ['key', 'วันลา'], ['who', 'ผู้ลา'], ['team', 'ทีม'], ['from', 'ตั้งแต่'], ['to', 'ถึง'], ['type', 'ประเภท'],
    ['by', 'รับทราบโดย'], ['user', 'บัญชี'], ['at', 'รับทราบเมื่อ'],
    ['reason', 'เหตุผลขอยกเลิก'], ['ref', 'อ้างอิง'], ['dec', 'ผลขอยกเลิก'], ['decBy', 'ผู้พิจารณา'], ['decAt', 'พิจารณาเมื่อ']],   // API 128: แถว can|… = ขอยกเลิกวันลา (by / user / at = ผู้ขอ)
};
// API 146 (26 พ.ย.): Treatment Order (รังสีระยะไกล) · หนึ่งแถวต่อรายการ CT-SIM (id = id ของรายการ CT-SIM) · เขียนผ่าน txOrder เท่านั้น
// clin / tv / rx / con / dlv / plan / notes = JSON · ver = เวอร์ชัน Rx (แก้ Rx หลังลงนาม = เวอร์ชันใหม่ ต้องลงนามใหม่) · rxAt = แพทย์ลงนาม Rx · rttAt = RTT รับทราบ
TABLES.hdro = {   // API 148: HDR Order (hdrOrder)
  sheet: 'HdrOrders',
  fields: [['id', 'id'], ['hn', 'HN'], ['name', 'Name'], ['date', 'วันใส่แร่'], ['doc', 'แพทย์'], ['f', 'ข้อมูลใบสั่ง (JSON)'], ['sig', 'ลงนาม (JSON)'], ['by', 'แก้ล่าสุดโดย'], ['at', 'แก้ล่าสุดเมื่อ']],
};
TABLES.txo = {
  sheet: 'TxOrders',
  fields: [['id', 'id'], ['hn', 'HN'], ['name', 'Name'], ['ctDate', 'วัน CT-Sim'], ['doc', 'แพทย์'], ['form', 'แบบใบสั่ง'], ['ver', 'เวอร์ชัน Rx'],
    ['clin', 'ข้อมูลคลินิก'], ['tv', 'Target / Contour'], ['rx', 'Prescription'], ['con', 'Dose constraint'], ['dlv', 'คำสั่งการฉาย'], ['plan', 'การวางแผน (MP)'], ['notes', 'Note'],
    ['rxBy', 'Rx ลงนามโดย'], ['rxUser', 'บัญชีผู้ลงนาม Rx'], ['rxAt', 'Rx ลงนามเมื่อ'], ['rttBy', 'RTT รับทราบโดย'], ['rttAt', 'RTT รับทราบเมื่อ'], ['by', 'แก้ล่าสุดโดย'], ['at', 'แก้ล่าสุดเมื่อ']],
};
// API 145 (26 พ.ย.): Chart check (TG-275) · หนึ่งแถวต่อการตรวจหนึ่งครั้ง · id = เคส|ช่วง (weekly = เคส|weekly|fx ที่ตรวจ) · เขียนผ่าน chartCheck เท่านั้น
// items = JSON { รหัสข้อ: { a: ok | bad | na, n: หมายเหตุ } } · issues = จำนวนข้อที่พบปัญหา · ยกเลิก = undo / undoBy (แถวยังอยู่ · ลงชื่อใหม่ที่ id เดิมได้)
TABLES.cck = {
  sheet: 'ChartChecks',
  fields: [['id', 'id'], ['case', 'เคส'], ['hn', 'HN'], ['name', 'Name'], ['type', 'ช่วงที่ตรวจ'], ['fx', 'Fx ที่ตรวจ'], ['total', 'Fx ทั้งหมด'], ['items', 'รายการตรวจ'],
    ['issues', 'พบปัญหา (ข้อ)'], ['note', 'หมายเหตุ'], ['by', 'ตรวจโดย'], ['user', 'บัญชี'], ['at', 'ตรวจเมื่อ'], ['undo', 'ยกเลิกเมื่อ'], ['undoBy', 'ยกเลิกโดย']],
};
// API 86: คำสั่งแพทย์ระหว่างฉาย (ห้องตรวจ → ระหว่างฉาย) ต่อเคสต่อวัน · id = วันที่|id เคส · kind = alone (RT Alone) | ccrt
// rt / cmt = continue | hold · src = see (พบแพทย์วันนี้) / hold (Hold RT อยู่) · nurse = เวลาที่พยาบาลยืนยัน · เขียนผ่าน rtdSave / nurseMark
TABLES.rtd = {
  sheet: 'DocOrders',
  fields: [['id', 'id'], ['date', 'วันที่'], ['case', 'เคส'], ['hn', 'HN'], ['name', 'Name'], ['doc', 'แพทย์'], ['room', 'ห้องฉาย'], ['src', 'ที่มา'],
    ['kind', 'ชนิด'], ['rt', 'RT'], ['cmt', 'CMT'], ['note', 'Note'], ['by', 'สั่งโดย'], ['at', 'สั่งเมื่อ'], ['nurse', 'Nurse ยืนยัน'], ['nurseBy', 'Nurse โดย'],
    ['cmtw', 'CMT วันนี้'], ['cmtd', 'วันให้เคมี']],   // API 128: rc = CMT Today (RT→CMT) · cr = CMT Today (CMT→RT) · tmr = CMT วันอื่น · ว่าง = ยืนยันปกติ · API 144: cmtd = วันให้เคมีที่เลือก (tmr · ว่าง = วันทำการถัดไป)
};
// วันลาของแพทย์ (API 62): ลาไม่เสียคิวแจกงานแพทย์ (คนอื่นรับแทน แล้วคืนคิวเมื่อกลับมา) · เขียนผ่าน dqLeaveSave / dqLeaveRemove เท่านั้น
TABLES.dqLeave = {
  sheet: 'DocLeaves',
  fields: [['id', 'id'], ['doc', 'แพทย์'], ['from', 'ตั้งแต่'], ['to', 'ถึง'], ['note', 'Note'], ['by', 'บันทึกโดย'], ['created', 'Created'], ['updated', 'Updated'],
    ['kind', 'ประเภทการลา'], ['assign', 'แจกงานตั้งแต่'],
    ['take', 'รับเคสระหว่างลา'],
    ['ltype', 'ประเภทใบลา']],   // API 116: ลาพักผ่อน / ลาป่วย / ลากิจ … (ใบลา · คนละช่องกับ ประเภทการลา = ลายาว / วันไม่รับเคส)   // API 78 (แถบ RO Jobs → วันลา): yes = ลงวันลาไว้ แต่ยังแจกเคสตามปกติ · ว่าง = ไม่รับเคส (คนอื่นรับแทน แล้วคืนคิว · วันลาเดิมทั้งหมด)   // API 69: kind = long (ลายาว: ไม่แจก ไม่ชดเชย) · ว่าง = ลาปกติ (ชดเชยเมื่อกลับมา) · assign = ลายาวรับเคสได้ตั้งแต่วันนี้
};
// แพทย์เวร S1 รายวัน (API 65 · แถบแจกงานแพทย์ ปุ่ม เวร S1): id = วันที่ · เคส Emergency แจกให้แพทย์เวร S1 ของวันนั้น (ไม่มี = ตามวันในสัปดาห์ใน ตั้งค่า) · เขียนผ่าน dqDutySave เท่านั้น
TABLES.dqDuty = {
  sheet: 'DocDuty',
  fields: [['id', 'id'], ['date', 'วันที่'], ['doc', 'แพทย์เวร S1'], ['by', 'บันทึกโดย'], ['updated', 'Updated']],
};
TABLES.regArch = { sheet: 'RegistryArchive', fields: TABLES.reg.fields.concat([['archAt', 'ย้ายเข้าที่เก็บเมื่อ']]) };
// ใช้เมื่อยังไม่เคยบันทึกการตั้งค่าจากหน้าเว็บ
const DEFAULT_STAFF = ['JR', 'WM', 'NY', 'WS'];
const DEFAULT_DOCTORS = ['SC', 'TA', 'PM', 'TC', 'VS'];   // ตรงกับค่าเริ่มต้นของหน้าเว็บ
const DAY_ROTATE_CATS = ['brachy', 'brachyn', 'p2h', 'hyper'];

/* ---------- หน้าเว็บและเมนู ---------- */

function doGet(e) {
  const p = (e && e.parameter) || {};
  // …/exec?ping=1 ตรวจว่าลิงก์นี้รัน Code.gs รุ่นไหน (ไม่มีข้อมูลผู้ป่วย) ถ้าเห็นหน้าระบบแทน JSON แปลว่ายังเป็นรุ่นเก่า
  if (p.ping) {
    return ContentService.createTextOutput(JSON.stringify({ app: 'medphys-dispatch', codeVersion: CODE_VERSION, api: API_LEVEL,
      lpch: !!lpchUrl_(), page: pageUrl_() ? 'github' : 'file', sheet: sheetSource_(), clean: oldCode_().length === 0 }, null, 1)).setMimeType(ContentService.MimeType.JSON);
  }
  const page = page_(!!p.refresh);
  const vars = { MEDPHYS_PAGE_SOURCE: page.source, MEDPHYS_API: API_LEVEL };   // API: หน้าเว็บขอข้อมูลแบบย่อได้ตั้งแต่โหลดครั้งแรก
  // กดจากปุ่มใน LPCH RO Workspace: บัตรผ่านใช้ได้ครั้งเดียว แลกเป็นการเข้าสู่ระบบที่นี่
  if (p.sso && lpchUrl_()) {
    try { const r = lpchFinish_(lpchCall_({ action: 'ssoRedeem', ticket: String(p.sso) })); vars.MEDPHYS_LPCH_TOKEN = String(r.token); txsLoginLog_(r, 'ปุ่มจาก LPCH RO Workspace'); } catch (err) {
      vars.MEDPHYS_LPCH_ERROR = String(err.message);
    }
  }
  return HtmlService.createHtmlOutput(inject_(page.html, vars))
    .setTitle(appTitle_())
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ค่าให้หน้าเว็บ (window.X = ...) ใส่ไว้ต้น <head>
function inject_(html, vars) {
  const tag = '<script>' + Object.keys(vars).map(k => 'window.' + k + ' = ' + JSON.stringify(vars[k]).replace(/</g, '\\u003c') + ';').join('') + '</script>';
  const m = /<head(\s[^>]*)?>/i.exec(html);
  const at = m ? m.index + m[0].length : 0;
  return html.slice(0, at) + tag + html.slice(at);
}

/* ---------- หน้าเว็บ: GitHub (เก็บไว้ PAGE_CACHE_SECONDS) หรือไฟล์ index ในโปรเจกต์ ---------- */

function pageUrl_() {
  let v = null;
  try { v = PropertiesService.getScriptProperties().getProperty('PAGE_URL'); } catch (e) { v = null; }
  v = String(v == null || v === '' ? PAGE_URL : v).trim();
  return v === '-' ? '' : v;
}

// {html, source: 'github' | 'file' | 'none'} · หน้าเว็บที่ไม่ครบ (ไม่มี </html> ท้ายไฟล์) ไม่ใช้ กันวางไม่ครบแล้วเว็บพัง
function page_(refresh) {
  const complete = h => !!h && /<\/html>\s*$/i.test(h);
  const url = pageUrl_();
  let why = '';
  if (url) {
    const cache = CacheService.getScriptCache();
    let key = 0;
    for (let i = 0; i < url.length; i++) key = (key * 31 + url.charCodeAt(i)) | 0;
    key = 'page' + (key >>> 0).toString(36);
    let html = refresh ? '' : cacheGet_(cache, key);
    if (!complete(html)) {
      try {
        const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        html = res.getResponseCode() === 200 ? res.getContentText('UTF-8') : '';
        if (!html) why = 'GitHub ตอบ HTTP ' + res.getResponseCode();
        else if (!complete(html)) why = 'ไฟล์จาก GitHub ไม่ครบ';
      } catch (e) { html = ''; why = String(e.message || e); }
      if (complete(html)) cachePut_(cache, key, html, PAGE_CACHE_SECONDS);
    }
    if (complete(html)) return { html: html, source: 'github' };
  }
  let local = '';
  try { local = HtmlService.createHtmlOutputFromFile('index').getContent(); } catch (e) { local = ''; }
  if (complete(local)) {
    // โหลดจาก GitHub ไม่ได้ และไฟล์ index ในโปรเจกต์เก่ากว่า Code.gs: แสดงแถบเตือนบนหน้า (ใช้ได้กับหน้าเว็บทุกรุ่น)
    const v = (/const PAGE_VERSION = '([^']+)'/.exec(local) || [])[1] || '';
    if (url && v < CODE_VERSION.slice(0, 10)) local = warnBanner_(local, 'หน้าเว็บนี้เป็นรุ่นเก่า' + (v ? ' (' + v + ')' : '') +
      ' จากไฟล์ index ในโปรเจกต์ เพราะโหลดจาก GitHub ไม่ได้: ' + why +
      ' · เจ้าของไฟล์: เปิด Apps Script เลือกฟังก์ชัน checkSetup แล้วกดเรียกใช้ (อนุญาตการเชื่อมต่อภายนอก) แล้ว Deploy เวอร์ชันใหม่ หรือลบไฟล์ index ออก');
    return { html: local, source: 'file', why: why };
  }
  return { html: '<!doctype html><html><head><meta charset="utf-8"></head><body><p style="font:16px sans-serif;padding:24px">โหลดหน้าเว็บไม่ได้ ตรวจ PAGE_URL ใน Code.gs หรือวางไฟล์ index ให้ครบ (บรรทัดสุดท้ายต้องเป็น &lt;/html&gt;)</p></body></html>', source: 'none' };
}

function warnBanner_(html, text) {
  const div = '<div role="alert" style="margin:0;padding:12px 16px;background:#fdecc8;color:#4a3000;font:14px/1.5 sans-serif;border-bottom:1px solid #e0b860">' +
    String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]) + '</div>';
  const m = /<body(\s[^>]*)?>/i.exec(html);
  return m ? html.slice(0, m.index + m[0].length) + div + html.slice(m.index + m[0].length) : div + html;
}

// แคชเก็บได้ไม่เกิน 100 KB ต่อค่า หน้าเว็บจึงแบ่งเก็บทีละ 30,000 ตัวอักษร (ภาษาไทยใช้ 3 ไบต์ต่อตัว)
function cachePut_(cache, key, text, seconds) {
  const size = 30000, parts = {};
  let n = 0;
  for (let i = 0; i < text.length; i += size) parts[key + '_' + (n++)] = text.slice(i, i + size);
  parts[key + '_n'] = String(n);
  try { cache.putAll(parts, seconds); } catch (e) { /* แคชเต็ม: โหลดใหม่ครั้งหน้า */ }
}

function cacheGet_(cache, key) {
  const n = Number(cache.get(key + '_n') || 0);
  if (!n) return '';
  const keys = [];
  for (let i = 0; i < n; i++) keys.push(key + '_' + i);
  const got = cache.getAll(keys);
  let text = '';
  for (let i = 0; i < n; i++) { if (got[keys[i]] == null) return ''; text += got[keys[i]]; }
  return text;
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ระบบกระจายงาน')
    .addItem('เปิดระบบ', 'openApp')
    .addSeparator()
    .addItem('นำเข้าข้อมูลจากแท็บเดิม', 'importLegacy')
    .addToUi();
}

function openApp() {
  const page = page_(false);
  const html = HtmlService.createHtmlOutput(inject_(page.html, { MEDPHYS_PAGE_SOURCE: page.source, MEDPHYS_SHEET_DIALOG: true })).setWidth(1200).setHeight(820);
  SpreadsheetApp.getUi().showModalDialog(html, appTitle_());
}

// ชื่อแท็บของเบราว์เซอร์ = ชื่อระบบที่แอดมินตั้ง (Config appName) · เก็บในแคช 6 ชั่วโมง บันทึกการตั้งค่าแล้วล้างแคช
// ยังไม่มีชีตข้อมูล: ใช้ชื่อเริ่มต้น (ไม่สร้างชีตตอนเปิดหน้าเว็บ)
function appTitle_() {
  try {
    const cache = CacheService.getScriptCache(), hit = cache.get('appName');
    if (hit) return hit;
    if (!SpreadsheetApp.getActive() && !sheetIdProp_()) return APP_TITLE;
    const cfg = readConfig_(ss_()) || {};
    const name = String(cfg.appName || '').trim().slice(0, 80) || APP_TITLE;
    cache.put('appName', name, 21600);
    return name;
  } catch (e) { return APP_TITLE; }
}

/* ---------- API ที่หน้าเว็บเรียกผ่าน google.script.run ---------- */

// have (API 61 · หน้าเว็บส่งก่อน token): { pack: 1 = ส่งตารางแบบย่อ, v: { ตาราง: รุ่นที่หน้าเว็บมี }, t: { ตาราง: เวลาเซิร์ฟเวอร์ตอนได้ข้อมูลนั้น } }
// ตารางรุ่นเดิม = ไม่อ่านไม่ส่ง (same) · Cases / Logs รุ่นเปลี่ยน = ส่งเฉพาะแถวที่แก้หลังครั้งก่อน (delta) · ไม่มี have = ส่งทั้งหมดแบบเดิม
function getData(a, b) {
  const token = arguments.length >= 2 ? b : a, have = arguments.length >= 2 && a && typeof a === 'object' ? a : null;
  const ss = ss_();
  const config = readConfig_(ss);
  const user = who_(token, ss, config);
  user.hasPin = !!pinRecord_(user);
  const need = guestNeeds_(user, config);
  const out = { user: user, api: API_LEVEL, codeVersion: CODE_VERSION, homeUrl: lpchUrl_() };
  if (need.reg) { try { regArchive_(ss, config || {}, false); } catch (e) { /* ครั้งหน้า */ } }   // ผู้ป่วยเก่า → ที่เก็บถาวร (วันละครั้ง)
  Object.assign(out, tablesFor_(ss, config, user, need, have));
  let tw = null;
  try { tw = txsWho_(config || {}, user); if (tw.ok) txsOut_(ss, config || {}, tw, need, have, out); } catch (e) { console.log('txs ' + e); }   // API 98
  const outer = !!(tw && tw.outer);   // API 98: หน่วยงานภายนอก = ไม่ได้สถานะการดึงข้อมูลจากระบบอื่น และ URL ของชีต
  return Object.assign(out, {
    regDrive: need.reg ? regDriveStatus_() : null,
    regArch: need.reg ? regArchStatus_() : null,
    spqSync: !outer && config && config.appt && config.appt.spq && (config.appt.spq.on || user.isAdmin) ? spqStatus_() : null,
    brachy: !outer && config && config.brachySync && (config.brachySync.on || user.isAdmin) ? brachyStatus_() : null,
    tdf: !outer && config && config.tdfSync && (config.tdfSync.on || user.isAdmin) ? extStatus_('tdf') : null,
    config: outer ? txsCfgOut_(config) : tgCfgFor_(config, user),   // API 115: ลิงก์กลุ่ม Telegram เฉพาะผู้ที่เห็นประกาศ   // API 98: หน่วยงานภายนอกไม่ได้รายชื่อแอดมิน บัญชีของบุคลากร และรหัสชีต/โฟลเดอร์ของระบบอื่น
    cfgReqs: user.isAdmin || (user.sub && user.sub.length) ? cfgReqs_(ss, config || {}, user) : [],
    sheetUrl: outer ? '' : ss.getUrl(),
    inbox: outer ? null : inboxOut_(ss, user, have),   // API 124: ข้อความถึงฉัน / ที่ฉันส่ง
    practice: PRACTICE_ ? { at: String(propRead_(PRACTICE_AT) || '') } : null,
    practiceOn: practiceOn_(),
  });
}

/* ---------- API 124 (24 พ.ย.): ข้อความส่วนตัว ----------
 * อ่านเฉพาะแถวของผู้ใช้ (ถึงฉัน / ฉันส่ง · 90 วัน) · รุ่นต่อบัญชีในแคช: ไม่มีข้อความใหม่ = ไม่อ่านชีต (รีเฟรชทุกนาทีไม่ช้าลง)
 * อีเมล: ส่งหลังบันทึก (นอกล็อก) · ผู้รับต้องมีอีเมล (ช่องอีเมลในรายชื่อบุคลากร หรือบัญชีเป็นอีเมล) · ปิดได้ที่ ตั้งค่า → ระบบ (config.msg.mail) */
const MSG_DAYS = 90, MSG_MAX_TO = 20;
function inboxKeys_(u) { return [u.username, u.me, u.email].map(v => String(v == null ? '' : v).trim().toLowerCase()).filter((v, i, a) => v && a.indexOf(v) === i); }
function inboxVer_(keys) { const c = CacheService.getScriptCache(); return keys.map(k => c.get(pk_('ibv_' + k)) || '').join('.'); }
function inboxBump_(accs) { const c = CacheService.getScriptCache(), v = 'm' + Date.now().toString(36); accs.forEach(a => { if (a) { try { c.put(pk_('ibv_' + String(a).toLowerCase()), v, 21600); } catch (e) { /* ครั้งหน้าอ่านชีต */ } } }); }
function inboxOut_(ss, user, have) {
  const keys = inboxKeys_(user);
  if (!keys.length) return null;
  let v = inboxVer_(keys);
  if (v.replace(/\./g, '') && have && have.ib === v) return { same: true, v: v };
  const from = new Date(Date.now() - MSG_DAYS * 864e5).toISOString();
  const rows = readTable_(ss, 'inbox').filter(r => String(r.at) >= from && (keys.indexOf(String(r.to).toLowerCase()) >= 0 || keys.indexOf(String(r.from).toLowerCase()) >= 0));
  if (!v.replace(/\./g, '')) { inboxBump_([keys[0]]); v = inboxVer_(keys); }
  return { v: v, rows: rows.slice(-400) };
}
// อีเมลของบัญชี: รายชื่อบุคลากรที่เชื่อมบัญชี (ช่องอีเมล) · บัญชีที่เป็นอีเมลอยู่แล้ว
function msgMailOf_(cfg, acc) {
  const lists = [].concat(cfg.staff || [], cfg.doctors || [], cfg.crew || []);
  const p = lists.filter(x => x && [x.user, x.email].map(v => String(v || '').trim().toLowerCase()).indexOf(acc) >= 0)[0];
  const e = String((p && p.email) || '').trim();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(acc) ? acc : '';
}
/** ส่งข้อความถึงบุคคล (ทุกคนที่เข้าสู่ระบบ) · rec = { to: [{ acc, name }], kind, title, text, ref, mail } · หนึ่งแถวต่อผู้รับ · คืนแถวที่บันทึก */
function msgSend(rec, token) {
  const ss0 = ss_(), cfg = readConfig_(ss0) || {}, u = who_(token, ss0, cfg);
  const me = inboxKeys_(u)[0];
  if (!me) throw new Error('เข้าสู่ระบบก่อนส่งข้อความ');
  rec = rec && typeof rec === 'object' ? rec : {};
  const cut = (v, n) => String(v == null ? '' : v).replace(/\s+$/g, '').trim().slice(0, n);
  const kind = ['leave', 'ack'].indexOf(rec.kind) >= 0 ? rec.kind : 'msg', title = cut(rec.title, 120), text = cut(rec.text, 1000), ref = cut(rec.ref, 200);
  const seen = {}, to = (Array.isArray(rec.to) ? rec.to : []).map(x => ({ acc: cut(x && x.acc, 120).toLowerCase(), name: cut(x && x.name, 120) }))
    .filter(x => x.acc && /^[a-z0-9._@+-]+$/.test(x.acc) && !seen[x.acc] && (seen[x.acc] = true));
  if (!to.length) throw new Error('เลือกผู้รับ');
  if (to.length > MSG_MAX_TO) throw new Error('ส่งได้ครั้งละไม่เกิน ' + MSG_MAX_TO + ' คน');
  if (!title && !text) throw new Error('พิมพ์ข้อความ');
  const fromName = String(u.name || u.username || me);
  return inboxPost_(cfg, { acc: me, name: fromName }, to, kind, title, text, ref, (cfg.msg || {}).mail !== false && rec.mail !== false, inboxKeys_(u));
}
// เขียนข้อความหนึ่งแถวต่อผู้รับ แล้วส่งสำเนาอีเมล (นอกล็อก) · from = { acc, name } (ระบบส่งเอง: acc ว่าง) · bump = บัญชีของผู้ส่ง
function inboxPost_(cfg, from, to, kind, title, text, ref, mailOn, bump) {
  const at = new Date().toISOString(), me = from.acc, fromName = from.name;
  const rows = withLock_(() => {
    const ss = ss_(), out = [];
    to.forEach(x => {
      const id = Utilities.getUuid(), o = openRow_(ss, 'inbox', null, id);
      const r = { id: id, to: x.acc, toName: x.name || x.acc, from: me, fromName: fromName, kind: kind, title: title, text: text, ref: ref, at: at, read: '', mail: '' };
      writeFields_(o.sh, o.sh.getLastRow() + 1, o.header, TABLES.inbox.fields, r, null);
      out.push(r);
    });
    return out;
  });
  inboxBump_(to.map(x => x.acc).concat(bump || []));
  // สำเนาอีเมล (นอกล็อก · ไม่ใส่ข้อมูลผู้ป่วย: ข้อความที่ผู้ใช้พิมพ์เท่านั้น)
  if (mailOn) {
    const url = tgUrl_(), done = {};
    rows.forEach(r => {
      const mail = msgMailOf_(cfg, r.to);
      if (!mail) { done[r.id] = 'ไม่มีอีเมล'; return; }
      try {
        if (MailApp.getRemainingDailyQuota() < 1) throw new Error('โควตาอีเมลวันนี้หมด');
        MailApp.sendEmail({ to: mail, subject: '[RT Hub] ' + (r.title || 'ข้อความจาก ' + fromName), name: 'LPCH RT Hub',
          body: (r.title ? r.title + '\n\n' : '') + (r.text ? r.text + '\n\n' : '') + 'จาก ' + fromName + (url ? '\nเปิด RT Hub: ' + url : '') });
        done[r.id] = 'sent';
      } catch (e) { done[r.id] = String(e && e.message || e).slice(0, 120); }
    });
    try {
      withLock_(() => { const ss = ss_(); rows.forEach(r => { if (!done[r.id]) return; const o = openRow_(ss, 'inbox', null, r.id); if (o.row) writeFields_(o.sh, o.row, o.header, TABLES.inbox.fields.filter(f => f[0] === 'mail'), { mail: done[r.id] }, o.vals); r.mail = done[r.id]; }); });
    } catch (e) { /* สถานะอีเมลไม่สำคัญ */ }
  }
  tgDm_(cfg, rows, fromName);   // API 137: สำเนาเข้า Telegram ส่วนตัวของผู้รับที่เชื่อมไว้ (นอกล็อก)
  return rows;
}
/** อ่านแล้ว (เฉพาะข้อความถึงฉัน) · ids = [id] · คืนเวลาที่บันทึก */
function msgRead(ids, token) {
  const ss0 = ss_(), cfg = readConfig_(ss0) || {}, u = who_(token, ss0, cfg), keys = inboxKeys_(u);
  const list = (Array.isArray(ids) ? ids : []).map(x => String(x || '').slice(0, 80)).filter(Boolean).slice(0, 200);
  if (!keys.length || !list.length) return '';
  const at = new Date().toISOString();
  withLock_(() => {
    const ss = ss_();
    list.forEach(id => { const o = openRow_(ss, 'inbox', null, id); if (o.row && keys.indexOf(String(o.cur.to || '').toLowerCase()) >= 0 && !o.cur.read) writeFields_(o.sh, o.row, o.header, TABLES.inbox.fields.filter(f => f[0] === 'read'), { read: at }, o.vals); });
  });
  inboxBump_(keys);
  return at;
}

/* ---------- ข้อมูลตารางที่ส่งให้หน้าเว็บ: รุ่นของตาราง · แถวที่เปลี่ยน · แบบย่อ (API 61) ---------- */
// รุ่นของแต่ละตาราง (Script property tableVer) เปลี่ยนทุกครั้งที่บันทึกตารางนั้น (tableSheet_ ระหว่างล็อก · เก็บตอนปล่อยล็อก)
// หน้าเว็บที่มีข้อมูลรุ่นเดียวกันอยู่แล้วไม่ต้องอ่านและส่งซ้ำ (รีเฟรชทุก 1 นาทีเบาลงมาก) · หน้าเว็บขอทั้งหมดใหม่ทุก 1 ชั่วโมง และตอนเปิดหน้าเว็บ (กันแก้ในชีตโดยตรง)
const TABLE_VER_PROP = 'tableVer';
const DELTA_TABLES = ['cases', 'logs', 'dq', 'reg'];   // ตารางใหญ่: ส่งเฉพาะแถวที่แก้ (คอลัมน์ rev)
const DELTA_MAX = 500;                    // แถวที่แก้เกินนี้ = ส่งทั้งตาราง
const DELTA_MARGIN_MS = 5 * 60000;        // ส่งแถวที่แก้ก่อนครั้งก่อนเผื่อไว้ (บันทึกที่ค้างระหว่างอ่าน)
// ข้อมูลที่ส่ง → ตารางที่ใช้ · windowed = ช่วงวันที่ขึ้นกับวันนี้ (วันใหม่ = รุ่นใหม่)
const OUT_TABLES = { cases: ['cases'], logs: ['logs'], leaves: ['leaves'], duty: ['duty'], ctsim: ['ctsim'], appt: ['appt'], reg: ['reg'], bq: ['bq', 'cases'], jobs: ['jobs'], vac: ['vac'], spq: ['spq'], dq: ['dq'], dqLeave: ['dqLeave'], dqDuty: ['dqDuty'], events: ['events'], jobLeaves: ['jobs'], see: ['see'], rtd: ['rtd'], visit: ['visit'], roJobs: ['roJobs'], ncall: ['ncall'], mlog: ['mlog'], notify: ['notify'], lvack: ['lvack'], cck: ['cck'], txo: ['txo'], hdro: ['hdro'] };   // lvack (API 116): รับทราบใบลา   // jobLeaves (API 79) = วันลาในแบบฟอร์ม RTT/RA Jobs ของทุกคน (ปฏิทินแผนก)
const OUT_WINDOWED = ['duty', 'ctsim', 'appt', 'bq', 'jobs', 'roJobs', 'txo', 'hdro'];
let DIRTY_ = null;
// ตารางที่บันทึกในคำขอนี้ · นอกล็อก = เก็บรุ่นใหม่ทันที
function markDirty_(table) { (DIRTY_ = DIRTY_ || {})[table] = 1; if (!LOCKED_) saveDirty_(); }
// Script properties อ่านครั้งเดียวต่อคำขอ (Google จำกัดจำนวนครั้งอ่าน/เขียนต่อวัน · หน้าเว็บรีเฟรชทุก 1 นาที) · ค่าที่บันทึกในคำขอนี้ผ่าน propSave_
let PROPS_ = null;
function propRead_(k) {
  if (!PROPS_) { try { PROPS_ = PropertiesService.getScriptProperties().getProperties() || {}; } catch (e) { PROPS_ = {}; } }
  return PROPS_[k] == null ? null : PROPS_[k];
}
function propSave_(k, v) { PropertiesService.getScriptProperties().setProperty(k, v); if (PROPS_) PROPS_[k] = v; }
/* ---------- ความเร็วของการบันทึก (รุ่น 2026-11-11.10 · API 74): ค่าที่อ่านแล้วจำไว้ตลอดคำขอ ----------
 * แต่ละคำขอของ Apps Script เริ่มตัวแปรใหม่ · การเรียกชีต / แคช / property แต่ละครั้ง = ไปกลับ 1 รอบ (หลายสิบ ms)
 * ชีตตามชื่อ · เขตเวลา · ผู้ใช้ของ token · ค่าในแคช จำตลอดคำขอ · หัวคอลัมน์จำเฉพาะระหว่างถือล็อก (นอกล็อกคนอื่นเพิ่มคอลัมน์ได้)
 */
let REQ_ = {};
function reqMap_(k) { return REQ_[k] || (REQ_[k] = new WeakMap()); }
function sheet_(doc, name) {
  const m = reqMap_('sheets');
  let by = m.get(doc);
  if (!by) m.set(doc, (by = {}));
  if (by[name]) return by[name];
  const sh = doc.getSheetByName(name);
  if (sh) { by[name] = sh; reqMap_('names').set(sh, name); }
  return sh;
}
function sheetName_(sh) { const m = reqMap_('names'); if (!m.has(sh)) m.set(sh, sh.getName()); return m.get(sh); }
function tz_(doc) {
  const m = reqMap_('tz');
  if (m.has(doc)) return m.get(doc);
  // ชีตข้อมูลหลัก: เขตเวลามากับแคชที่อ่านพร้อมผู้ใช้ (เปลี่ยนเขตเวลาของชีต = มีผลภายใน 6 ชั่วโมง)
  const key = doc === SS_ && REQ_.cache ? pk_('ssTz') : '';
  let v = key && typeof REQ_.cache[key] === 'string' && REQ_.cache[key] ? REQ_.cache[key] : '';
  if (!v) { v = doc.getSpreadsheetTimeZone(); if (key && key in REQ_.cache) { try { reqCachePut_(key, v, 21600); } catch (e) { /* อ่านใหม่รอบหน้า */ } } }
  m.set(doc, v);
  return v;
}
// แคชหลายค่าในครั้งเดียว (ผู้ใช้ของ token + เจ้าของไฟล์) · cacheGet_ ใช้ค่าที่อ่านไว้ก่อน
function cachePre_(keys) {
  const c = REQ_.cache || (REQ_.cache = {}), need = keys.filter(k => !(k in c));
  if (!need.length) return;
  try {
    const cache = CacheService.getScriptCache();
    if (typeof cache.getAll !== 'function') return;
    const got = cache.getAll(need) || {};
    need.forEach(k => { c[k] = got[k] === undefined ? null : got[k]; });
  } catch (e) { /* อ่านทีละค่าแทน */ }
}
// ชื่อไม่ซ้ำกับ cacheGet_ / cachePut_ (แคชหน้าเว็บแบบแบ่งส่วนของ doGet) · ประกาศชื่อซ้ำ = ฟังก์ชันหลังทับฟังก์ชันแรก
function reqCacheGet_(k) { const c = REQ_.cache; return c && k in c ? c[k] : CacheService.getScriptCache().get(k); }
function reqCachePut_(k, v, sec) { CacheService.getScriptCache().put(k, v, sec); if (REQ_.cache) REQ_.cache[k] = v; }
// fresh = อ่านค่าล่าสุดจริง (ระหว่างล็อก ก่อนเขียน)
// รุ่น 2026-11-11.10: เก็บรุ่นแยกรายตาราง (property tv_<ตาราง>) = บันทึกแล้วเขียนอย่างเดียว ไม่ต้องอ่านค่ารวมก่อน · ค่ารวมเดิม (tableVer) ยังอ่านได้
const TABLE_VER_ONE = 'tv_';
// API 95: โหมดฝึกใช้ใช้ชื่อแยก (รุ่นตาราง · สำเนาตารางในแคช · สถานะที่เก็บถาวร) ไม่ปนกับระบบจริง
const pk_ = k => (PRACTICE_ ? 'p' + k : k);
function tableVers_() {
  let v = {};
  const one = pk_(TABLE_VER_ONE);
  try { v = JSON.parse(propRead_(pk_(TABLE_VER_PROP)) || '{}') || {}; } catch (e) { v = {}; }
  Object.keys(PROPS_ || {}).forEach(k => { if (k.indexOf(one) === 0 && PROPS_[k]) v[k.slice(one.length)] = PROPS_[k]; });
  return v;
}
function saveDirty_() {
  if (!DIRTY_) return;
  const d = DIRTY_;
  DIRTY_ = null;
  try {
    const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 5), set = {}, props = PropertiesService.getScriptProperties();
    Object.keys(d).forEach(t => { set[pk_(TABLE_VER_ONE) + t] = stamp; });
    if (Object.keys(set).length > 1 && typeof props.setProperties === 'function') props.setProperties(set);
    else Object.keys(set).forEach(k => props.setProperty(k, set[k]));
    if (PROPS_) Object.assign(PROPS_, set);
  } catch (e) { /* เก็บรุ่นไม่ได้: หน้าเว็บได้ข้อมูลใหม่ตอนขอทั้งหมดรอบถัดไป */ }
}
// แถวเป็นอาร์เรย์ตามคอลัมน์ (ไม่ซ้ำชื่อคีย์ทุกแถว · ตัดช่องว่างท้ายแถว) { c: คีย์, r: แถว }
function pack_(rows) {
  const keys = {}, c = [];
  rows.forEach(o => { Object.keys(o).forEach(k => { if (!keys[k]) { keys[k] = 1; c.push(k); } }); });
  return { c: c, r: rows.map(o => { const r = c.map(k => (o[k] == null ? '' : o[k])); while (r.length && r[r.length - 1] === '') r.pop(); return r; }) };
}
const idsHash_ = ids => strHash_(ids.slice().sort().join('|'));
/* ---------- API 89 (18 พ.ย.): สำเนาตารางในแคชของสคริปต์ (โหลดข้อมูล / เข้าสู่ระบบเร็วขึ้น) ----------
 * ตารางที่อ่านจากชีตแล้ว (แบบย่อ pack_) เก็บในแคช (แบ่งเป็นชิ้น) พร้อมรุ่นของตาราง · คำขอถัดไปที่รุ่นเดิม = ใช้สำเนา ไม่อ่านชีต
 * ตารางที่แก้บ่อย (Cases Logs DocQueue Registry · มีคอลัมน์เวลาแก้): สำเนา + อ่านเฉพาะแถวที่แก้หลังเวลาสำเนา (แบบเดียวกับหน้าเว็บ)
 * อ่านชีตเต็มใหม่เมื่อสำเนาเก่ากว่า 1 ชั่วโมง / วันใหม่ / มีแถวถูกลบ (แก้ในชีตด้วยมือยังเห็นภายใน 1 ชั่วโมง เหมือนเดิม)
 * แคชเต็มหรือหาย = อ่านชีตตามเดิม (ผลเหมือนกัน แค่ช้ากว่า) */
const SNAP_TTL = 21600, SNAP_FULL_MS = 60 * 60000, SNAP_PIECE = 95000, SNAP_MAX = 3000000;   // ชิ้นละไม่เกิน 100KB (base64 ของข้อมูลที่บีบอัด) · ใหญ่เกิน = ไม่เก็บ (อ่านชีตเหมือนเดิม)
const SNAP_SKIP = ['jobs', 'roJobs'];   // ภาระงาน: ของแต่ละคน (หัวหน้าทีม · แอดมิน = ทุกคน)
// อ่านสำเนาหลายตารางในครั้งเดียว (คำขอละ 2 ครั้ง: หัวข้อ แล้วชิ้นข้อมูล) · want(key, meta) = จะใช้สำเนานี้ไหม · เก็บไว้ที่ REQ_.snap
function snapPreload_(keys, want) {
  const pre = REQ_.snap = {};
  try {
    const c = CacheService.getScriptCache(), metas = c.getAll(keys.map(k => pk_('snap.') + k)), ks = [];
    keys.forEach(k => {
      let m = null;
      try { m = JSON.parse(metas[pk_('snap.') + k] || 'null'); } catch (e) { m = null; }
      if (!m || !m.n || !want(k, m)) return;
      pre[k] = { meta: m, ks: [] };
      for (let i = 0; i < m.n; i++) { pre[k].ks.push(pk_('snap.') + k + '.' + m.id + '.' + i); ks.push(pk_('snap.') + k + '.' + m.id + '.' + i); }
    });
    if (ks.length) { const got = c.getAll(ks); Object.keys(pre).forEach(k => { pre[k].got = got; }); }
  } catch (e) { REQ_.snap = {}; }
}
function snapGet_(key) {
  try {
    const c = CacheService.getScriptCache(), pre = REQ_.snap && REQ_.snap[key];
    const meta = pre ? pre.meta : JSON.parse(c.get(pk_('snap.') + key) || 'null');
    if (!meta || !meta.n) return null;
    const ks = [];
    for (let i = 0; i < meta.n; i++) ks.push(pk_('snap.') + key + '.' + meta.id + '.' + i);
    const got = pre && pre.got ? pre.got : c.getAll(ks);
    if (ks.some(k => typeof got[k] !== 'string')) return null;
    const s = ks.map(k => got[k]).join('');
    meta.p = JSON.parse(meta.z ? Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(s), 'application/x-gzip')).getDataAsString() : s);
    return meta;
  } catch (e) { return null; }
}
function snapPut_(key, meta, packed) {
  try {
    const raw = JSON.stringify(packed), z = typeof Utilities.gzip === 'function';
    const s = z ? Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(raw, 'application/json')).getBytes()) : raw;
    if (s.length > SNAP_MAX || (!z && raw.length > SNAP_MAX / 3)) return;
    const c = CacheService.getScriptCache(), id = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), o = {};
    let n = 0;
    for (let i = 0; i < s.length; i += SNAP_PIECE) o[pk_('snap.') + key + '.' + id + '.' + (n++)] = s.slice(i, i + SNAP_PIECE);
    c.putAll(o, SNAP_TTL);
    let old = null;
    try { old = JSON.parse(c.get(pk_('snap.') + key) || 'null'); } catch (e) { old = null; }
    c.put(pk_('snap.') + key, JSON.stringify({ v: meta.v, t: meta.t, b: meta.b, td: meta.td, n: n, id: id, z: z ? 1 : 0 }), SNAP_TTL);
    if (old && old.id && old.n && c.removeAll) { const ks = []; for (let i = 0; i < old.n; i++) ks.push(pk_('snap.') + key + '.' + old.id + '.' + i); c.removeAll(ks); }
  } catch (e) { console.log('snapPut_ ' + key + ' ' + e); }
}
// แถวที่แก้ (แบบ readTable_) ใส่ลงในสำเนาแบบย่อ: แทนแถว id เดิม / ต่อท้าย · คืนสำเนาใหม่และ id ทั้งหมด
function snapMerge_(p, rows) {
  const c = p.c.slice(), r = p.r.slice(), idc = c.indexOf('id');
  if (idc < 0) return null;
  const at = {};
  r.forEach((a, i) => { at[String(a[idc])] = i; });
  rows.forEach(o => {
    Object.keys(o).forEach(k => { if (c.indexOf(k) < 0) c.push(k); });
    const a = c.map(k => (o[k] == null ? '' : o[k]));
    while (a.length && a[a.length - 1] === '') a.pop();
    const id = String(o.id);
    if (id in at) r[at[id]] = a; else { at[id] = r.length; r.push(a); }
  });
  return { c: c, r: r, ids: r.map(a => String(a[idc] == null ? '' : a[idc])).filter(Boolean) };
}
// ตาราง k แบบย่อจากสำเนา (ถ้าใช้ได้) หรืออ่านชีต · key = ชื่อในแคช · v = รุ่นของตาราง · read = อ่านชีต (คืนแถวแบบ readTable_)
// after(rows) = งานกับแถวที่อ่านใหม่ (เช่น ล้างวันล่วงหน้าของ Cases) คืนจำนวนที่ล้าง
function snapRows_(ss, config, k, key, v, read, after) {
  const td = today_(ss), now = Date.now(), t0 = new Date(now).toISOString();
  const s = snapGet_(key);
  let cleared = 0;
  if (s && s.td === td && now - s.b < (REQ_.snapAge || SNAP_FULL_MS)) {
    if (s.v === v) return { p: s.p, cleared: 0, from: 'cache' };
    if (DELTA_TABLES.indexOf(k) >= 0 && s.t) {
      const dl = readDelta_(ss, k, k === 'cases' ? config : null, new Date(Date.parse(s.t) - DELTA_MARGIN_MS).toISOString());
      if (dl) {
        if (k === 'reg') regFixNames_(ss, dl.rows);
        if (after) cleared += after(dl.rows);
        const mg = snapMerge_(s.p, dl.rows);
        if (mg && idsHash_(mg.ids) === dl.hash) {
          const p = { c: mg.c, r: mg.r };
          snapPut_(key, { v: v, t: t0, b: s.b, td: td }, p);
          return { p: p, cleared: cleared, from: 'delta' };
        }
      }
    }
  }
  const rows = read();
  if (after) cleared += after(rows);
  const p = pack_(rows);
  snapPut_(key, { v: v, t: t0, b: now, td: td }, p);
  return { p: p, cleared: cleared, from: 'sheet' };
}
function tablesFor_(ss, config, user, need, have) {
  const vers = tableVers_();
  let init = false;
  Object.keys(OUT_TABLES).forEach(k => OUT_TABLES[k].forEach(t => { if (!vers[t]) { vers[t] = 'i' + Date.now().toString(36); init = true; } }));
  if (init) { try { propSave_(pk_(TABLE_VER_PROP), JSON.stringify(vers)); } catch (e) { /* ครั้งหน้า */ } }
  // ห้องฉายของนัดใส่แร่ (rtRoom) มาจาก Cases: หน้าเว็บที่ได้ Cases คำนวณเอง (API 61) · ไม่ได้ Cases = เซิร์ฟเวอร์ใส่ให้ (รุ่นของ bq ขึ้นกับ Cases ด้วย)
  const bqRoom = !(have && need.cases), deps = k => (k === 'bq' && !bqRoom ? ['bq'] : OUT_TABLES[k]);
  const td = today_(ss), verOf = k => deps(k).map(t => vers[t]).join('.') + (OUT_WINDOWED.indexOf(k) >= 0 ? '@' + td : '');
  const hv = have && have.v && typeof have.v === 'object' ? have.v : {}, ht = have && have.t && typeof have.t === 'object' ? have.t : {}, pk = !!(have && have.pack);
  const out = { ver: {}, now: new Date().toISOString(), same: [], delta: {}, advanceCleared: 0 };
  let cases = null;
  // API 89: สำเนาในแคชของทุกตารางที่จะส่ง อ่านในครั้งเดียว (ใช้เฉพาะสำเนาวันนี้ที่ยังไม่เก่ากว่า 1 ชั่วโมง และรุ่นตรง หรือเป็นตารางที่อ่านเฉพาะแถวที่แก้ได้)
  const snapKey = k => k + (k === 'bq' && bqRoom ? '.r' : '') + (k === 'cases' ? '.' + strHash_(JSON.stringify(extraFields_(config || {}))) : '');
  if (pk) {
    const now = Date.now(), byKey = {};
    Object.keys(OUT_TABLES).forEach(k => { if (SNAP_SKIP.indexOf(k) < 0 && !(have && hv[k] === verOf(k))) byKey[snapKey(k)] = k; });
    snapPreload_(Object.keys(byKey), (key, m) => m.td === td && now - m.b < SNAP_FULL_MS && (m.v === verOf(byKey[key]) || DELTA_TABLES.indexOf(byKey[key]) >= 0));
  }
  const read = {
    cases: () => (cases = readTable_(ss, 'cases', config)), logs: () => readTable_(ss, 'logs'), leaves: () => readTable_(ss, 'leaves'), duty: () => recentDuty_(ss), ctsim: () => recentCt_(ss),
    appt: () => recentAppt_(ss), reg: () => regRows_(ss), bq: () => recentBq_(ss, config, cases, !bqRoom), jobs: () => jobsFor_(ss, user, config), vac: () => readTable_(ss, 'vac'), spq: () => readTable_(ss, 'spq'),
    dq: () => readTable_(ss, 'dq'), dqLeave: () => readTable_(ss, 'dqLeave'), dqDuty: () => readTable_(ss, 'dqDuty'),
    events: () => readTable_(ss, 'events'), jobLeaves: () => jobLeaves_(ss),
    see: () => recentSee_(ss), rtd: () => recentRtd_(ss),   // API 86
    visit: () => recentVisit_(ss),   // API 90
    roJobs: () => roJobsFor_(ss, user, config),   // API 91
    ncall: () => recentNcall_(ss),   // API 94
    mlog: () => recentMlog_(ss),   // API 100
    notify: () => recentNotify_(ss),   // API 109
    lvack: () => readTable_(ss, 'lvack'),   // API 116
    cck: () => readTable_(ss, 'cck'),   // API 145
    txo: () => recentTxo_(ss),   // API 146
    hdro: () => recentHdro_(ss),   // API 148
  };
  const want = { cases: need.cases, logs: need.logs, leaves: need.leaves, duty: need.duty, ctsim: need.ctsim, appt: need.appt, reg: need.reg, bq: need.bq, jobs: need.jobs, vac: need.vac, spq: need.appt || need.ctsim || need.cases, dq: need.dq, dqLeave: need.dqLeave, dqDuty: need.dqLeave, events: need.events, jobLeaves: need.jobLeaves, see: need.see, rtd: need.rtd, visit: need.visit, roJobs: need.roJobs, ncall: need.ncall, mlog: need.mlog, notify: need.notify, lvack: need.lvack, cck: need.cck, txo: need.txo, hdro: need.hdro };
  Object.keys(want).forEach(k => {
    if (!want[k]) { out[k] = []; return; }
    const v = verOf(k);
    out.ver[k] = v;
    if (have && hv[k] === v) { out.same.push(k); return; }
    if (have && DELTA_TABLES.indexOf(k) >= 0 && hv[k] && ht[k] && !isNaN(Date.parse(ht[k]))) {
      const dl = readDelta_(ss, k, k === 'cases' ? config : null, new Date(Date.parse(ht[k]) - DELTA_MARGIN_MS).toISOString());
      if (dl && k === 'reg') regFixNames_(ss, dl.rows);
      if (dl) {
        if (k === 'cases') out.advanceCleared += clearAdvance_(ss, config, dl.rows);
        out.delta[k] = { rows: pk ? pack_(dl.rows) : dl.rows, hash: dl.hash, n: dl.n };
        return;
      }
    }
    // API 89: หน้าเว็บที่รับแบบย่อ = ใช้สำเนาในแคช (ไม่อ่านชีตถ้าไม่เปลี่ยน)
    if (pk && SNAP_SKIP.indexOf(k) < 0) {
      const sn = snapRows_(ss, config, k, snapKey(k), v, read[k], k === 'cases' ? rows => clearAdvance_(ss, config, rows) : null);
      out.advanceCleared += sn.cleared;
      out[k] = sn.p;
      (out.src = out.src || {})[k] = sn.from;
      return;
    }
    const rows = read[k]();
    if (k === 'cases') out.advanceCleared += clearAdvance_(ss, config, rows);
    out[k] = pk ? pack_(rows) : rows;
  });
  return out;
}
// แถวที่แก้หลังเวลา since: อ่านคอลัมน์ id และ rev ก่อน แล้วอ่านเฉพาะแถวที่เปลี่ยน (เป็นช่วงต่อกัน) · ค่าตรวจรหัสทั้งตาราง (หน้าเว็บเทียบ: ไม่ตรง = มีแถวถูกลบ)
// ยังไม่มีคอลัมน์ rev / แก้เกิน DELTA_MAX แถว = null (ส่งทั้งตาราง)
function readDelta_(ss, table, cfg, since) {
  const def = tableDef_(table, cfg), sh = sheet_(ss, def.sheet);
  if (!sh) return null;
  const n = sh.getLastRow() - 1;
  if (n < 1) return { rows: [], hash: idsHash_([]), n: 0 };
  const header = headerOf_(sh), rc = header.indexOf(REV_HEAD), cv = rowConv_(def, header, tz_(ss));
  if (rc < 0 || cv.cols[0] < 0) return null;
  const ids = sh.getRange(2, cv.cols[0] + 1, n, 1).getValues(), revs = sh.getRange(2, rc + 1, n, 1).getValues(), all = [], hit = [];
  for (let i = 0; i < n; i++) {
    const id = String(ids[i][0]).trim();
    if (!id) continue;
    all.push(id);
    if (timeOf_(revs[i][0]) > since) hit.push(i);
  }
  if (hit.length > DELTA_MAX) return null;
  const width = sh.getLastColumn(), rows = [];
  for (let k = 0; k < hit.length;) {
    let j = k;
    while (j + 1 < hit.length && hit[j + 1] === hit[j] + 1) j++;
    sh.getRange(2 + hit[k], 1, hit[j] - hit[k] + 1, width).getValues().forEach(r => { if (String(r[cv.cols[0]]).trim() !== '') rows.push(cv.conv(r)); });
    k = j + 1;
  }
  return { rows: rows, hash: idsHash_(all), n: all.length };
}

// ตำแหน่งอื่น (ดูอย่างเดียว) เห็นเฉพาะแถบที่แอดมินติ๊ก "ตำแหน่งอื่น" ใน ตั้งค่า → แถบเมนู
// ส่งเฉพาะตารางที่แถบเหล่านั้นใช้ (ไม่ได้เปิดแถบไหนเลย = ไม่ส่งข้อมูลผู้ป่วยและกิจกรรม) · MP ได้ทุกตาราง
const NAV_PREV = { queue: 'pend', course: 'queue', ctsim: 'course' };
const NAV_LIKE = { pchart: 'reg', evaluate: 'contour', contour: 'appt', reg: 'appt', bq: 'appt', appt: 'ctsim', jobs: 'course', dq: 'reg', consult: 'appt', mpleave: 'queue', rojobs: 'dq', flow: 'course', tdfcalc: 'pend', sendbook: 'pend', nurse: 'dq' };   // sendbook (20 พ.ย.): ทะเบียนหนังสือส่ง = เห็นเท่าแถบงานรอ   // flow (16 พ.ย.): RT Workflow มีข้อมูลผู้ป่วย = เห็นเท่าแถบห้องฉายจนกว่าแอดมินจะตั้ง   // แถบใหม่ที่การตั้งค่าเดิมยังไม่มี: ลงทะเบียน นัดคิวใส่แร่ = สิทธิ์เท่าแถบลงนัด · ลงนัด = เท่าแถบ CT-SIM · RTT/RA Jobs = เท่าแถบห้องฉาย
// แถบลงนัดใช้เคสและรายการ CT-SIM นับจำนวนในปฏิทิน (วันนัด CT · Start RT) · ตารางวันฉาย (ห้องฉาย) แสดงนัดที่ยังไม่ลง CT-SIM
// แถบ RTT/RA Jobs ใช้เคส รายการ CT-SIM และผู้ปฏิบัติงานประจำวันคำนวณงานห้องฉาย/CT · ภาระงาน (jobs) ส่งเฉพาะของตัวเอง (แอดมินได้ทุกคน) · นัด (ลงนัด) = Vac-Lok ที่จองไว้
// แถบลงทะเบียนแสดงนัดของผู้ป่วย · แถบลงนัดและนัดคิวใส่แร่ดึงข้อมูลผู้ป่วยที่ลงทะเบียน · ตารางวันฉาย (ห้องฉาย) ใช้วันนัดใส่แร่เป็นสถานะ HDR อัตโนมัติ · แดชบอร์ดสรุป Brachytherapy จากนัดใส่แร่
const GUEST_TABLES = { cases: ['work', 'pend', 'queue', 'course', 'dash', 'p4p', 'appt', 'jobs', 'consult', 'flow', 'evaluate'], logs: ['work', 'pend', 'logs', 'p4p'], leaves: ['work', 'queue', 'mpleave', 'deptcal'], duty: ['course', 'ctsim', 'jobs'],
  ctsim: ['ctsim', 'work', 'appt', 'contour', 'jobs', 'consult', 'flow'], appt: ['appt', 'ctsim', 'course', 'reg', 'jobs', 'dq', 'consult', 'flow'], jobs: ['jobs'], reg: ['reg', 'appt', 'bq', 'dq', 'consult'], bq: ['bq', 'course', 'dash', 'flow', 'consult'], vac: ['jobs', 'ctsim'],
  dq: ['dq', 'appt', 'consult', 'flow'], dqLeave: ['dq', 'consult', 'rojobs', 'deptcal'], events: ['deptcal'], jobLeaves: ['deptcal', 'jobs'],
  see: ['course', 'consult', 'nurse'], rtd: ['consult', 'nurse', 'course'], visit: ['nurse', 'consult'], roJobs: ['rojobs'],
  ncall: ['nurse', 'ctsim', 'consult', 'course', 'appt', 'bq'],
  // API 100: สถานะเครื่อง = ทุกตำแหน่งของแผนกที่เห็นแถบใดก็ได้ (หน่วยงานภายนอกของ Treatment Summary ไม่ได้)
  mlog: ['reg', 'dq', 'consult', 'nurse', 'appt', 'contour', 'evaluate', 'bq', 'work', 'pend', 'queue', 'course', 'ctsim', 'dash', 'logs', 'p4p', 'mpleave', 'tdfcalc', 'sendbook', 'rojobs', 'jobs', 'deptcal', 'flow', 'settings'] };   // API 94: แถบ Nurse (เลื่อนนัด · ไม่มาตามนัด) · แถบอื่นเห็นป้ายไม่มาตามนัด   // API 86: พบแพทย์วันนี้ · คำสั่งแพทย์ระหว่างฉาย
GUEST_TABLES.lvack = ['mpleave', 'rojobs', 'jobs', 'deptcal', 'queue', 'work', 'dq', 'consult'];   // API 116: รับทราบใบลา = แถบที่มีปฏิทินวันลา
GUEST_TABLES.cck = ['chartchk'];   // API 145: Chart check (ตั้งค่า → แถบเมนู · ยังไม่ตั้ง = แอดมินเท่านั้น)
['cases', 'bq', 'rtd'].forEach(t => { if (GUEST_TABLES[t].indexOf('chartchk') < 0) GUEST_TABLES[t].push('chartchk'); });   // ตารางวันฉาย (fx ที่ฉายแล้ว · วันใส่แร่ · Continue RT)
GUEST_TABLES.hdro = ['bq', 'contour', 'evaluate', 'nurse', 'pchart'];   // API 148: HDR Order
GUEST_TABLES.txo = ['contour', 'work', 'pend', 'queue', 'evaluate', 'course', 'pchart', 'chartchk'];   // API 146: Treatment Order = ทุกแถบที่ใช้ใบสั่ง (ดูได้ = เห็นทั้งใบ)
GUEST_TABLES.notify = ['notify'];   // API 110: ประกาศ = ตำแหน่งที่เห็นแถว ประกาศ (ตั้งค่า → แถบเมนู · ยังไม่ตั้ง = ทุกตำแหน่งของแผนก · หน่วยงานภายนอกของ Treatment Summary ไม่ได้)
// แถบ Consult: รอลงนัดแยกตามแพทย์ + ปฏิทินของฟอร์มลงนัด CT+RT   // แจกงานแพทย์: แถบลงนัดแสดงผู้ป่วยที่รอลงนัดแยกตามแพทย์
['cases', 'appt', 'dq', 'ctsim'].forEach(t => { if (GUEST_TABLES[t].indexOf('nurse') < 0) GUEST_TABLES[t].push('nurse'); });   // แถบ Nurse (API 86): CT Order · คำสั่งแพทย์ · Call center
// API 91: RO Jobs → P4P แพทย์ นับผู้ป่วยใหม่ (แจกงานแพทย์) ตรวจติดตาม/เคมีบำบัด (คำสั่งแพทย์ระหว่างฉาย · พบแพทย์นอกตาราง) จำลองการฉาย (CT-SIM) ใส่แร่ contour และ plan evaluation (เคส)
['cases', 'ctsim', 'bq', 'dq', 'rtd', 'visit'].forEach(t => { if (GUEST_TABLES[t].indexOf('rojobs') < 0) GUEST_TABLES[t].push('rojobs'); });
// API 139: Patient chart (ไอคอนข้าง HN · RT Workflow) รวมทุกอย่างของผู้ป่วย = ตารางของผู้ป่วยทุกตาราง (ประกาศตามสิทธิ์ประกาศเดิม)
['cases', 'ctsim', 'appt', 'reg', 'bq', 'dq', 'rtd', 'visit', 'ncall'].forEach(t => { if (GUEST_TABLES[t].indexOf('pchart') < 0) GUEST_TABLES[t].push('pchart'); });
function guestNeeds_(user, config) {
  const out = {};
  const seen = Object.keys(GUEST_TABLES).reduce((a, t) => a.concat(GUEST_TABLES[t]), []).filter(v => user.via === 'google' || userAccess_(config, v, user));
  Object.keys(GUEST_TABLES).forEach(t => { out[t] = GUEST_TABLES[t].some(v => seen.indexOf(v) >= 0); });
  return out;
}

/**
 * สิทธิ์ของตำแหน่ง (role ใน LPCH) ต่อแถบ: 'edit' = บันทึก/แก้ไขได้ · 'view' = ดูอย่างเดียว · '' = มองไม่เห็น
 * ตั้งที่ ตั้งค่า → แถบเมนู (config.nav[i].access[role]) · ตำแหน่งที่ยังไม่ได้ตั้ง: MP บันทึกได้ทุกแถบที่ "แสดง"
 * ตำแหน่งอื่นดูได้ถ้าติ๊ก "ตำแหน่งอื่น" (แบบเดิม) · แถบใหม่ที่การตั้งค่าเดิมยังไม่มี ทำตามแถบก่อนหน้า (NAV_PREV) หรือแถบที่ระบุ (NAV_LIKE) เหมือนหน้าเว็บ
 */
function navAccess_(config, view, role, base) {
  if (view === TXS_VIEW) return txsNav_(config, role, base);   // API 98
  if (txsOuter_(config, role)) return '';   // API 98: หน่วยงานภายนอก (ตารางหน่วยงานของ Treatment Summary · ไม่ใช่ตำแหน่งของแผนก) เห็นเฉพาะแถบ Treatment Summary
  const nav = config && Array.isArray(config.nav) ? config.nav : [];
  const find = v => nav.filter(x => x && x.view === v)[0];
  let x = find(view);
  if (view === CCK_VIEW) {   // API 145: Chart check (ทดลองใช้) · ยังไม่ตั้ง = แอดมินเท่านั้น · แอดมินรองที่ยังไม่ตั้ง = ตามตำแหน่ง
    const ca = x && x.access && typeof x.access === 'object' ? x.access : null;
    const set = r => !!ca && Object.prototype.hasOwnProperty.call(ca, r) && ['edit', 'view', ''].indexOf(ca[r]) >= 0;
    if (role === SUB_ROLE && !set(SUB_ROLE)) return base ? navAccess_(config, view, base) : '';
    if (set(role)) return ca[role];
    return role === ADMIN_ROLE ? 'edit' : '';
  }
  if (!x && NAV_LIKE[view]) return navAccess_(config, NAV_LIKE[view], role, base);
  if (!x) { let p = null; for (let v = view; !p && NAV_PREV[v]; v = NAV_PREV[v]) p = find(NAV_PREV[v]); x = { on: true, guest: p ? p.guest !== false : true }; }
  const acc = x.access && typeof x.access === 'object' ? x.access : null;
  if (role === SUB_ROLE && !(acc && ['edit', 'view', ''].indexOf(acc[SUB_ROLE]) >= 0)) return navAccess_(config, view, base || '');   // แอดมินรอง "ตามตำแหน่ง"
  if (acc && Object.prototype.hasOwnProperty.call(acc, role)) return acc[role] === 'edit' || acc[role] === 'view' ? acc[role] : '';
  if (role === ADMIN_ROLE) return navAccess_(config, view, 'MP');   // ยังไม่ได้ตั้งคอลัมน์ Admin = เท่า MP
  if (x.on === false) return '';
  return LPCH_EDIT_ROLES.indexOf(role) >= 0 ? 'edit' : x.guest !== false ? 'view' : '';
}
// แถบที่ใช้แต่ละตาราง (สิทธิ์บันทึก = บันทึกได้อย่างน้อยหนึ่งแถบในนี้)
const EDIT_VIEWS = { see: ['nurse'], rtd: ['consult'], nurse: ['nurse'], visit: ['nurse'], roJobs: ['rojobs'], ncall: ['nurse'],   // API 94   // API 91: P4P แพทย์ = แถบ RO Jobs   // API 90: พบแพทย์นอกตารางนัด = แถบ Nurse
    // API 86: คำสั่งแพทย์ = ห้องตรวจ · ยืนยัน = แถบ Nurse · API 88: ตารางพบแพทย์ย้ายจากแถบห้องฉายมาแถบ Nurse
  cases: ['work', 'pend', 'queue'], logs: ['logs', 'work', 'pend'], leaves: ['work', 'queue', 'mpleave'], course: ['course'], ctsim: ['ctsim'], appt: ['appt', 'consult'], jobs: ['jobs'], reg: ['reg'], bq: ['bq'], vac: ['jobs', 'ctsim'], dq: ['dq'], events: ['deptcal'] };   // consult (API 69): ลงนัด CT+RT

// ตารางที่เขียนผ่านฟังก์ชันของตัวเองเท่านั้น (ตรวจ PIN และสถานะการลง/แจก) ไม่ผ่าน saveRecord / deleteRecord
const OWN_WRITERS = ['inbox', 'ctsim', 'duty', 'appt', 'jobs', 'reg', 'bq', 'vac', 'spq', 'regArch', 'dq', 'dqLeave', 'dqDuty', 'see', 'rtd', 'visit', 'roJobs', 'ncall', 'mlog', 'notify', 'lvack', 'cck', 'txo', 'hdro'];
function saveRecord(table, rec, token) { return saveRecord_(table, rec, token, null); }
// edit = { pin }: แก้รายการที่มีอยู่ต้องยืนยัน PIN (ตรวจหลังอ่านแถวภายใต้ล็อก · เดิมอ่านคอลัมน์ id ก่อนล็อกอีกรอบ)
function saveRecord_(table, rec, token, edit) {
  if (OWN_WRITERS.indexOf(table) >= 0) throw new Error('ตาราง ' + table + ' บันทึกผ่านแถบของตัวเองเท่านั้น');
  const u = requireEdit_(token, EDIT_VIEWS[table]);
  tableDef_(table);
  if (!rec || !rec.id) { if (edit) pinChange_(u, edit.pin, false); throw new Error('ไม่มีรหัสรายการ'); }
  return withLock_(() => {
    const ss = ss_();
    const cfg = table === 'cases' ? readConfig_(ss) : null;   // หัวข้อเพิ่มเติมที่แอดมินตั้ง เป็นคอลัมน์ของ Cases
    const x = openRow_(ss, table, cfg, rec.id), sh = x.sh, header = x.header, found = x.row;
    if (edit) pinChange_(u, edit.pin, !!found);
    let fields = tableDef_(table, cfg).fields;
    // เคสที่มีอยู่แล้ว: ช่องของปุ่มบันทึกขั้นตอนเติมได้เฉพาะช่องที่ยังว่าง ไม่เขียนทับหรือลบ (คนอื่นอาจเพิ่งกด)
    // แก้หรือล้างได้ทาง stampCase เท่านั้น
    if (found && table === 'cases') {
      const cur = x.vals;
      fields = fields.filter(f => {
        if (STAMP_FIELDS.indexOf(f[0]) < 0) return true;
        const col = header.indexOf(f[1]);
        return (col < 0 || String(cur[col] == null ? '' : cur[col]).trim() === '') && String(rec[f[0]] == null ? '' : rec[f[0]]).trim() !== '';
      });
    }
    // หน้าเว็บรุ่นเก่าไม่ส่งช่อง src: ไม่ล้างที่มาของรายการที่ดึงจากระบบนัด
    if (table === 'logs' && rec.src === undefined) fields = fields.filter(f => f[0] !== 'src');
    writeFields_(sh, found || sh.getLastRow() + 1, header, fields, rec, found ? x.vals : null);
    return rec;
  });
}

/**
 * แจกเคสใหม่ภายใต้ล็อก ผู้ใช้หลายคนกดพร้อมกันก็ไม่ได้คนซ้ำ
 * รับได้หลายเคส (หลายเทคนิคของผู้ป่วยคนเดียว) เคสแรกเลือก MP ตามคิวของเทคนิคนั้น
 * how = 'follow' ให้ MP คนเดียวกับเคสแรก (คิวไม่ขยับ หักคิวเมื่อวนมาถึง) · how = 'manual' ใช้ MP ที่เลือกมา
 * how = 'replan' (API 68) เคสเดิมของผู้ป่วยที่กำลังฉาย ให้ MP คนเดิมที่ส่งมา ไม่เกี่ยวกับคิว (เหมือนงานวางแผนใหม่)
 */
function addCases(recs, token) {
  const u = requireEdit_(token, ['work']);
  if (!Array.isArray(recs) || !recs.length) throw new Error('ไม่มีเคสที่จะแจก');
  return withLock_(() => {
    const ss = ss_();
    const cfg = readConfig_(ss) || {};
    const staff = Array.isArray(cfg.staff) && cfg.staff.length ? cfg.staff : DEFAULT_STAFF.map(code => ({ code: code, active: true }));
    const leaves = readTable_(ss, 'leaves');
    // คิว (pickNext_) และงานซ้ำ (openJobs_) ใช้แค่ช่องเหล่านี้ · อ่านทั้งชีต Cases (60+ คอลัมน์) ช้าตามจำนวนเคสสะสม
    const cases = readCols_(ss, 'cases', cfg, ['cat', 'mp', 'how', 'n', 'in', 'created', 'hn', 'pc', 'rt', 'replan']);
    const today = Utilities.formatDate(new Date(), tz_(ss), 'yyyy-MM-dd');
    const out = [];
    recs.forEach(rec => {
      if (!rec || !rec.cat) throw new Error('เลือกเทคนิคก่อนแจกเคส');
      const cat = (cfg.cats || []).filter(c => c.id === rec.cat)[0];
      // API 71: HN นี้มีงานเทคนิคเดียวกันที่ยังไม่ Plan complete = ถามยืนยันก่อน (dupOk = ผู้ใช้กดยืนยันแจกเพิ่มแล้ว) · งานบริเวณเพิ่มเติมไม่ตรวจ
      const meta = jobMeta_(rec);
      if (meta && meta.kind === 'revise') {   // API 72: ส่งแก้แผน = งานเดิมส่งแก้ได้ครั้งเดียว (กดซ้ำ · สองเครื่องพร้อมกัน)
        const prev = cases.filter(c => { const m = jobMeta_(c); return m && m.kind === 'revise' && m.of === meta.of; })[0];
        if (prev) throw new Error('งานนี้ส่งแก้แผนไปแล้ว (' + jobText_(prev, cfg) + ') · โหลดหน้าใหม่');
      }
      if (!rec.dupOk && !(meta && (meta.kind === 'site' || meta.kind === 'revise'))) {
        const dup = openJobs_(cases, cfg, rec.hn, rec.cat, '', !!rec.planJob);   // planJob = หน้าเว็บบอกว่าเป็นหมวดวางแผน (ชีตที่ยังไม่เคยบันทึกตั้งค่าหมวด)
        if (dup.length) throw new Error('DUPJOB|HN ' + rec.hn + ' มีงาน ' + dup.map(c => jobText_(c, cfg)).join(' | ') + ' ที่ยังไม่ Plan complete อยู่แล้ว · แจกซ้ำจะนับแต้มซ้ำ · ถ้าต้องการแจกเพิ่มจริง กด "แจกเคส" อีกครั้ง');
      }
      const byDay = cat ? cat.rotate === 'day' || cat.rotate === false : DAY_ROTATE_CATS.indexOf(rec.cat) >= 0;
      const date = rec.in || today;
      if (rec.how === 'manual' || rec.how === 'replan') {
        rec.mp = String(rec.mp || '').toUpperCase();
        if (!staff.some(s => String(s.code).toUpperCase() === rec.mp)) throw new Error('ไม่พบรหัสนักฟิสิกส์ ' + rec.mp);
      } else if (rec.how === 'follow' && out.length) {
        rec.mp = out[0].mp;
      } else {
        rec.how = 'auto';
        rec.mp = pickNext_({
          staff: staff, leaves: leaves, date: date, byDay: byDay,
          cases: cases.filter(c => c.cat === rec.cat),
          pointer: (cfg.queue || {})[rec.cat] || null, skips: catSkips_(cfg, rec.cat), manualFrom: manualFrom_(cfg), fairFrom: manualFrom_(cfg),
        });
      }
      if (!rec.mp) throw new Error((cat ? cat.label + ': ' : '') + 'ไม่มีนักฟิสิกส์ที่รับเคสได้ในวันนั้น (ลาหรือปิดการปฏิบัติงานทุกคน)');
      rec.id = rec.id || Utilities.getUuid();
      rec.in = date;
      rec.created = new Date().toISOString();
      cases.push(rec);
      out.push(rec);
    });
    const sh = tableSheet_(ss, 'cases', cfg);
    const header = headerOf_(sh);
    const fields = tableDef_('cases', cfg).fields;
    const base = sh.getLastRow();
    out.forEach((rec, i) => writeFields_(sh, base + 1 + i, header, fields, rec, null));
    // แจกจากรายการของแถบ CT-SIM (ctFrom = id ของรายการนั้น): บันทึกว่าแจกแล้วเป็นเคสไหน ใครแจก
    const ctFrom = String((recs[0] && recs[0].ctFrom) || '').trim();
    if (ctFrom) {
      const x = openRow_(ss, 'ctsim', null, ctFrom);
      const set = { took: out.map(r => r.id).join(', '), tookBy: String(u.name || u.username || u.me || ''), tookAt: Utilities.formatDate(new Date(), tz_(ss), 'yyyy-MM-dd HH:mm') };
      if (x.row) writeFields_(x.sh, x.row, x.header, TABLES.ctsim.fields.filter(f => f[0] in set), set, x.vals);
    }
    return out;
  });
}

// เคสเลือกเองนับในคิวเฉพาะวัน In ตั้งแต่ config.manualFrom (API 52 · ไม่เคยตั้ง = 2026-11-01 ตามหน้าเว็บ · ว่าง = ทุกเคส)
const MANUAL_FROM_DEFAULT = '2026-11-01';
function manualFrom_(cfg) {
  if (!cfg || !('manualFrom' in cfg)) return MANUAL_FROM_DEFAULT;
  const v = String(cfg.manualFrom || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
}
// หักคิวรายเดือนของเทคนิคนี้ { 'YYYY-MM': { code: n } } จาก config.skips { 'YYYY-MM': { cat: { code: n } } }
function catSkips_(cfg, cat) {
  const all = cfg && cfg.skips && typeof cfg.skips === 'object' ? cfg.skips : {}, out = {};
  Object.keys(all).forEach(ym => { if (all[ym] && all[ym][cat]) out[ym] = all[ym][cat]; });
  return out;
}

function addCase(rec, token) {
  return addCases([rec], token)[0];
}

/*
 * คิวหมุนเวียนของแต่ละเทคนิค (โค้ดชุดเดียวกับ pickNext ใน index.html)
 * - แจกอัตโนมัติ: ไปที่คนถัดจากคนที่ได้เคสอัตโนมัติล่าสุด ตามลำดับทีม JR → WM → NY → WS
 * - แจกเอง (how = 'manual') หรือตามเทคนิคแรก (how = 'follow'): คิวไม่ขยับ แต่คนที่ได้ไปจะถูกข้าม 1 ครั้งเมื่อคิววนมาถึง
 * - ข้ามคนที่ลาในวันนั้นหรือปิด "ปฏิบัติงาน" (เคสเลือกเองที่ค้างยังรออยู่)
 * - byDay: เคสวันเดียวกันให้คนเดิม (Brachy/Hyperthermia) วันใหม่จึงวนต่อ
 * - pointer: ตำแหน่งคิวที่ตั้งเองในหน้าตั้งค่า มีผลกับเคสที่แจกหลังจากนั้น
 * - skips: หักคิวรายเดือนที่แอดมินตั้ง ข้ามคนนั้นตามจำนวนครั้งเมื่อคิววนมาถึง (เหมือนเคสเลือกเอง)
 */
function pickNext_(o, trace) {
  const staff = o.staff, n = staff.length;
  if (!n) return '';
  const idx = code => staff.findIndex(s => s.code === code);
  const away = (code, day) => o.leaves.some(l => l.mp === code && l.from <= day && day <= (l.to || l.from));
  const free = (i, day) => staff[i].active !== false && !away(staff[i].code, day);
  // เดินคิวจาก start: ข้ามคนที่ไม่ว่างวันนั้น และหักเคสเลือกเองที่ค้างอยู่ทีละ 1
  const select = (start, day, cr, skipped) => {
    let limit = n;
    Object.keys(cr).forEach(k => { limit += n * cr[k]; });
    for (let step = 0; step < limit; step++) {
      const i = (start + step) % n, code = staff[i].code;
      if (!free(i, day)) { if (skipped && step < n) skipped.push({ code: code, why: 'away' }); continue; }
      if (cr[code] > 0) { cr[code]--; if (skipped) skipped.push({ code: code, why: 'manual' }); continue; }
      return i;
    }
    return -1;
  };
  const pointer = o.pointer && idx(o.pointer.code) >= 0 ? o.pointer : null;
  const credit = {};
  let p = 0, lastAuto = null, pointerDone = !pointer;
  // หักคิวรายเดือนที่แอดมินตั้ง (o.skips = { 'YYYY-MM': { code: n } }): นับตั้งแต่ต้นเดือนนั้น ใช้ไม่หมดยกไปเดือนถัดไป
  const skipDays = Object.keys(o.skips || {}).filter(ym => ym <= String(o.date || '').slice(0, 7)).map(ym => ({ created: ym + '-01', skip: o.skips[ym] }));
  const list = o.cases.concat(skipDays).sort((a, b) => (a.created < b.created ? -1 : a.created > b.created ? 1 : 0));
  list.forEach(c => {
    if (!pointerDone && c.created >= pointer.at) { p = idx(pointer.code); pointerDone = true; lastAuto = null; }
    if (c.skip) { Object.keys(c.skip).forEach(code => { const m = Math.min(50, Math.max(0, Math.floor(+c.skip[code]) || 0)); if (m && idx(code) >= 0) credit[code] = (credit[code] || 0) + m; }); return; }
    const j = idx(c.mp);
    if (j < 0) return;
    // จำนวนครั้ง k: ได้คิวนี้ไปแล้ว k คิว (เคสเลือกเอง/เทคนิคถัดไปหัก k ครั้ง เคสตามคิวหักเพิ่ม k - 1 ครั้ง)
    const k = Math.min(50, Math.max(1, Math.floor(+c.n) || 1));
    if (o.manualFrom && c.how === 'manual' && String(c.in || String(c.created || '').slice(0, 10)) < o.manualFrom) return;   // เลือกเองก่อนเริ่มนับ: ไม่ข้ามคนนั้น
    if (c.how === 'manual' || c.how === 'follow') { credit[c.mp] = (credit[c.mp] || 0) + k; return; }
    if (c.how === 'replan') return;   // งานวางแผนใหม่ให้ MP คนเดิม: ไม่เกี่ยวกับคิว
    const trial = Object.assign({}, credit), hit = select(p, c.in, trial) === j;
    // ไม่ตรงคิว ตั้งแต่วันเริ่มใช้ระบบเต็ม (o.fairFrom): คิวไม่ขยับ คนที่ถึงคิวยังได้เคสตามลำดับ · คนที่ได้ไปถูกข้ามเมื่อคิววนมาถึง (เหมือนเคสเลือกเอง)
    if (!hit && o.fairFrom && String(c.in || String(c.created || '').slice(0, 10)) >= o.fairFrom && !(o.byDay && lastAuto && lastAuto.in === c.in && lastAuto.mp === c.mp)) { credit[c.mp] = (credit[c.mp] || 0) + k; lastAuto = c; return; }
    if (hit) Object.assign(credit, trial);
    p = (j + 1) % n;
    if (k > 1) credit[c.mp] = (credit[c.mp] || 0) + k - 1;
    lastAuto = c;
  });
  if (!pointerDone) { p = idx(pointer.code); lastAuto = null; }
  if (trace) { trace.start = staff[p].code; trace.credit = Object.assign({}, credit); trace.skipped = []; }
  if (o.byDay && lastAuto && lastAuto.in === o.date && free(idx(lastAuto.mp), o.date)) return lastAuto.mp;
  const i = select(p, o.date, credit, trace ? trace.skipped : null);
  return i < 0 ? '' : staff[i].code;
}

function deleteRecord(table, id, token) {
  if (OWN_WRITERS.indexOf(table) >= 0) throw new Error('ตาราง ' + table + ' ลบผ่านแถบของตัวเองเท่านั้น');
  requireEdit_(token, EDIT_VIEWS[table]);
  tableDef_(table);
  return withLock_(() => {
    const sh = tableSheet_(ss_(), table), header = headerOf_(sh);
    const row = findRow_(sh, header.indexOf('id') + 1, id);
    if (row) delRow_(sh, row, header);
    return !!row;
  });
}

// หน้าแก้ไขเคส: บันทึกหรือลบต้องยืนยันด้วยรหัส PIN ของคนที่เข้าสู่ระบบ (เหมือนปุ่มบันทึกขั้นตอน)
function editCase(rec, pin, token) {
  return saveRecord_('cases', rec, token, { pin: pin });
}

function removeCase(id, pin, token) {
  pinChange_(requireEdit_(token, EDIT_VIEWS.cases), pin, true);
  return deleteRecord('cases', id, token);
}

// หน้าแก้ไขกิจกรรม (RC งานวิชาการ ฯลฯ): บันทึกการแก้ไขหรือลบต้องยืนยันด้วยรหัส PIN เหมือนหน้าแก้ไขเคส
function editLog(rec, pin, token) {
  return saveRecord_('logs', rec, token, { pin: pin });
}

function removeLog(id, pin, token) {
  pinChange_(requireEdit_(token, EDIT_VIEWS.logs), pin, true);
  return deleteRecord('logs', id, token);
}

/* ---------- ปฏิทินแผนก (API 79): กิจกรรมของแผนก · วันลา RTT/RA ของทุกคน ---------- */
// เพิ่ม / แก้กิจกรรม (แถบ ปฏิทินแผนก บันทึกได้) · มีอยู่แล้ว = แก้ ต้องยืนยัน PIN
function evSave(rec, pin, token) {
  rec = rec && typeof rec === 'object' ? rec : {};
  const u = requireEdit_(token, EDIT_VIEWS.events);
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n), isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const r = { id: cut(rec.id, 80), title: cut(rec.title, 120), from: cut(rec.from, 10), to: cut(rec.to, 10) || cut(rec.from, 10), note: cut(rec.note, 500),
    by: cut(rec.by, 120) || String(u.name || u.username || u.me || ''), created: cut(rec.created, 40), updated: cut(rec.updated, 40) };
  if (!r.id) throw new Error('ไม่มีรหัสรายการ');
  if (!r.title) throw new Error('กรอกชื่อกิจกรรม');
  if (!isDate(r.from) || !isDate(r.to)) throw new Error('วันที่ไม่ถูกต้อง');
  if (r.to < r.from) throw new Error('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');
  return saveRecord_('events', r, token, { pin: pin });
}
function evRemove(id, pin, token) {
  pinChange_(requireEdit_(token, EDIT_VIEWS.events), pin, true);
  return deleteRecord('events', id, token);
}
// วันลาในแบบฟอร์ม RTT/RA Jobs ของทุกคน (เฉพาะวันลา ไม่ส่งภาระงาน)
function jobLeaves_(ss) {
  const out = [];
  readTable_(ss, 'jobs').forEach(j => {
    let ls = [];
    try { ls = JSON.parse(j.leaves || '[]'); } catch (e) { ls = []; }
    (Array.isArray(ls) ? ls : []).forEach((l, i) => {
      if (l && /^\d{4}-\d{2}-\d{2}$/.test(String(l.date || ''))) out.push({ id: String(j.id || '') + '#' + i, who: String(j.who || ''), date: String(l.date), type: String(l.type || ''), half: !!l.half });
    });
  });
  return out;
}

// ยกเลิกวันลา: ลบของที่บันทึกไว้ ต้องใส่ PIN
function removeLeave(id, pin, token) {
  pinChange_(requireEdit_(token, EDIT_VIEWS.leaves), pin, true);
  return deleteRecord('leaves', id, token);
}

function saveConfig(config, token) {
  const u = who_(token);
  if (!u.isAdmin) throw new Error('แก้การตั้งค่าได้เฉพาะแอดมิน' + (u.name ? ' (' + u.name + ' ไม่ใช่แอดมิน)' : ''));
  return withLock_(() => {
    const old = readConfig_(ss_()) || {}, nw = config || {};
    const keys = Object.keys(Object.assign({}, old, nw)).filter(k => JSON.stringify(old[k]) !== JSON.stringify(nw[k]));
    writeConfig_(ss_(), nw);
    if (keys.length) audit_('config', '', '', 'edit', { 'หัวข้อที่แก้': keys.join(', ') });   // API 73: ประวัติการแก้ตั้งค่า (เฉพาะชื่อหัวข้อ)
    try { CacheService.getScriptCache().remove('appName'); } catch (e) { /* แคชใช้ไม่ได้: ชื่อแท็บเปลี่ยนภายใน 6 ชั่วโมง */ }
    return true;
  });
}

/* ---------- แอดมินรอง: แก้การตั้งค่าบางหมวด ทุกการแก้เป็นคำขอ มีผลเมื่อแอดมินหลักอนุมัติ ---------- */
// หมวดในหน้าตั้งค่า → คีย์ของ Config (ตรงกับ CFG_TABS ในหน้าเว็บ) · คีย์ที่ไม่อยู่ในหมวดใด (admins, subAdmins ฯลฯ) = แอดมินหลักเท่านั้น
const CFG_TABS = {
  team: ['staff', 'doctors', 'crew', 'teams', 'leave'],   // leave (API 116): ใบลา (เขียนที่ · หัวหน้ากลุ่มงาน · รักษาการแทน · หัวหน้างานของแต่ละทีม)   // teams (API 91): ตำแหน่งหัวหน้า/ลูกน้องของแต่ละทีม
  case: ['queue', 'skips', 'manualFrom', 'rate', 'p4pGroup', 'cats', 'types', 'aims', 'techniques', 'freqs', 'areas', 'rooms', 'fields', 'required', 'defaults', 'icdExtra', 'qa', 'qaSee', 'caseView'],
  p4p: ['positions', 'guarantee', 'acts', 'carry', 'brachySync', 'tdfSync'],
  room: ['ptags', 'mobility', 'igrt', 'qColors', 'queues', 'fxTypes', 'moveReplan', 'cpTreat', 'fxSeen', 'fxAdj', 'fxgHead', 'fxgParts', 'quota', 'dayMax', 'gapWarn', 'dutyRoles', 'ptForm', 'delGuard', 'machine', 'fxSee'],   // machine (API 100): สถานะเครื่อง · fxSee (API 104)
  tabs: ['reg', 'dq', 'appt', 'order', 'bq', 'ct', 'jobs', 'vac', 'flow', 'tdfApp', 'roP4p', 'sendBook', 'noShow'],   // noShow (API 127): ประกาศเมื่อผู้ป่วยไม่มา   // flow (16 พ.ย.): คอลัมน์ RT Workflow · tdfApp (17 พ.ย.): ลิงก์เว็บ TDF
  form: ['formRules'],   // 13 พ.ย.: ตั้งค่า → ฟอร์ม (ค่าเริ่มต้นของฟอร์มตามตัวเลือก)
  cols: ['cols'],        // 13 พ.ย.: ตั้งค่า → Column แสดงผล (ค่าเริ่มต้นของคอลัมน์)
  sys: ['pin', 'holidays', 'appName', 'appSub', 'logo', 'nav', 'roles', 'boxes', 'security', 'subHide', 'subOrder', 'subName', 'icons', 'tg', 'iconsOff', 'msg', 'ntfLink'],   // subName (API 134): ชื่อแถบย่อย   // ntfLink (API 132): ลิงก์ประกาศ   // msg (API 124): ข้อความส่วนตัว   // iconsOff (API 115): ไอคอนบนแถบเมนูที่ปิด   // tg (API 113): ประกาศ → Telegram (กลุ่มของแต่ละอาชีพ · token อยู่ใน Script Properties)   // icons (16 พ.ย.): ลำดับไอคอนหน้าแถบเมนู · subOrder (API 105): ลำดับแถบย่อย
};
const CFG_REQ_MAX = 49000;   // ตัวอักษรต่อช่อง (ชีตรับได้ 50,000)
const CFG_REQ_DAYS = 30;     // คำขอที่ตัดสินแล้วแสดงย้อนหลัง

// แถวของผู้ใช้นี้ในรายชื่อแอดมินรอง (config.subAdmins [{ user: ชื่อผู้ใช้หรืออีเมล RO Workspace, tabs }]) · ไม่อยู่ = null
function subEntry_(cfg, p) {
  const list = cfg && Array.isArray(cfg.subAdmins) ? cfg.subAdmins : [];
  const me = [String(p.username || '').toLowerCase(), String(p.email || '').toLowerCase()].filter(Boolean);
  return list.filter(s => s && String(s.user || '').trim() && me.indexOf(String(s.user || '').trim().toLowerCase()) >= 0)[0] || null;
}
// หมวดที่แอดมินรองคนนี้แก้ได้ · API 105: all (ค่าเริ่มต้น · ไม่ได้ตั้ง all: false) = ทุกหมวดเท่าแอดมินหลัก รวมหัวข้อแอดมิน ('*' = ทุกส่วนของการตั้งค่า) · ทุกการแก้ยังเป็นคำขอรอแอดมินหลักอนุมัติ
const SUB_ALL = '*';
function subTabs_(cfg, p) {
  const x = subEntry_(cfg, p);
  if (!x) return [];
  if (x.all !== false) return Object.keys(CFG_TABS).concat(SUB_ALL);
  return Array.isArray(x.tabs) ? x.tabs.map(String).filter((t, i, a) => CFG_TABS[t] && a.indexOf(t) === i) : [];
}
const subAll_ = u => !!(u && u.sub && u.sub.indexOf(SUB_ALL) >= 0);
function cfgTabOf_(key) {
  for (const t in CFG_TABS) if (CFG_TABS[t].indexOf(key) >= 0) return t;
  return '';
}
// คีย์ที่แก้นอกหมวดที่ได้รับสิทธิ์ · renames (แก้ชื่อตัวเลือก) ดูทีละรายการตามหมวดของรายการนั้น
function cfgReqBad_(cfg, changes, tabs) {
  if (tabs.indexOf(SUB_ALL) >= 0) return [];   // API 105: แอดมินรองแบบทุกหมวด
  const bad = [];
  Object.keys(changes).forEach(k => {
    if (k === 'renames') {
      const a = cfg.renames && typeof cfg.renames === 'object' ? cfg.renames : {}, b = changes.renames && typeof changes.renames === 'object' ? changes.renames : {};
      Object.keys(Object.assign({}, a, b)).forEach(rk => {
        if (JSON.stringify(a[rk] || null) === JSON.stringify(b[rk] || null)) return;
        if (tabs.indexOf(cfgTabOf_(/^x\./.test(rk) ? 'fields' : rk.split('.')[0])) < 0) bad.push('renames.' + rk);
      });
    } else if (tabs.indexOf(cfgTabOf_(k)) < 0) bad.push(k);
  });
  return bad;
}
// คำขอที่ผู้ใช้นี้เห็น: แอดมินหลัก = ทุกคำขอ · แอดมินรอง = ของตัวเอง · รออนุมัติ + ตัดสินแล้วไม่เกิน CFG_REQ_DAYS วัน
// stale = ค่าปัจจุบันของส่วนนั้นเปลี่ยนหลังส่งคำขอ (อนุมัติแล้วค่าในคำขอแทนทั้งส่วน)
function cfgReqs_(ss, cfg, u) {
  const me = String(u.username || u.me || '').toLowerCase(), since = new Date(Date.now() - CFG_REQ_DAYS * 864e5).toISOString();
  return readTable_(ss, 'cfgreq')
    .filter(r => (u.isAdmin || String(r.byUser).toLowerCase() === me) && (r.status === 'pending' || r.decAt >= since))
    .map(r => ({ id: r.id, req: r.req, key: r.key, value: r.value, note: r.note, by: r.by, byUser: r.byUser, at: r.at, status: r.status, decBy: r.decBy, decAt: r.decAt, why: r.why,
      stale: r.status === 'pending' && JSON.stringify(cfg[r.key] === undefined ? null : cfg[r.key]) !== r.base }));
}

/**
 * แอดมินรองส่งคำขอแก้การตั้งค่า: changes = { คีย์ของ Config: ค่าใหม่ทั้งส่วน } เฉพาะส่วนที่แก้
 * ต้องอยู่ในหมวดที่แอดมินหลักให้สิทธิ์ (config.subAdmins) · ยังไม่มีผลจนกว่าแอดมินหลักอนุมัติ (cfgDecide) · คืนคำขอที่ผู้ใช้นี้เห็น
 */
function cfgPropose(changes, note, token) {
  const ss = ss_(), cfg = readConfig_(ss) || {}, u = who_(token, ss, cfg);
  if (u.isAdmin) throw new Error('แอดมินหลักบันทึกการตั้งค่าได้เลย ไม่ต้องขออนุมัติ');
  const tabs = u.sub || [];
  if (!tabs.length) throw new Error(u.isSub ? 'แอดมินรอง' + (u.name ? ' ' + u.name : '') + ' ยังไม่ได้รับสิทธิ์แก้หมวดใดในตั้งค่า (แอดมินหลักติ๊กหมวดได้ที่ ตั้งค่า → แอดมิน → แอดมินรอง)'
    : 'แก้การตั้งค่าได้เฉพาะแอดมิน' + (u.name ? ' (' + u.name + ' ไม่ใช่แอดมินหรือแอดมินรอง)' : ''));
  changes = changes && typeof changes === 'object' && !Array.isArray(changes) ? changes : {};
  const keys = Object.keys(changes);
  if (!keys.length) throw new Error('ไม่มีการแก้ไข');
  if (keys.some(k => !/^[A-Za-z]\w{0,40}$/.test(k))) throw new Error('ส่วนของการตั้งค่าไม่ถูกต้อง');
  const bad = cfgReqBad_(cfg, changes, tabs);
  if (bad.length) throw new Error('แก้ส่วนนี้ไม่ได้ (นอกหมวดที่แอดมินหลักให้สิทธิ์): ' + bad.join(', '));
  const rows = keys.map(k => ({ key: k, value: JSON.stringify(changes[k] === undefined ? null : changes[k]), base: JSON.stringify(cfg[k] === undefined ? null : cfg[k]) }));
  if (rows.some(r => r.value.length > CFG_REQ_MAX || r.base.length > CFG_REQ_MAX)) throw new Error('ข้อมูลบางส่วนยาวเกินไป');
  const req = Utilities.getUuid(), now = new Date().toISOString();
  const by = String(u.name || u.username || u.me || ''), byUser = String(u.username || u.me || ''), txt = String(note == null ? '' : note).trim().slice(0, 500);
  return withLock_(() => {
    const sh = tableSheet_(ss, 'cfgreq'), header = headerOf_(sh);
    rows.forEach((r, i) => writeFields_(sh, sh.getLastRow() + 1, header, TABLES.cfgreq.fields,
      { id: req + '-' + (i + 1), req: req, key: r.key, value: r.value, base: r.base, note: txt, by: by, byUser: byUser, at: now, status: 'pending', decBy: '', decAt: '', why: '' }));
    return cfgReqs_(ss, cfg, u);
  });
}

/**
 * ตัดสินคำขอ: แอดมินหลัก ok = true อนุมัติ (ค่าในคำขอแทนส่วนนั้นของ Config) · false ไม่อนุมัติ
 * แอดมินรองยกเลิกคำขอของตัวเองที่ยังรออนุมัติได้ (ok = false) · คืนคำขอที่ผู้ใช้นี้เห็น
 */
function cfgDecide(req, ok, why, token) {
  const ss = ss_(), u = who_(token, ss, readConfig_(ss) || {});
  req = String(req || '');
  return withLock_(() => {
    const rows = readTable_(ss, 'cfgreq').filter(r => r.req === req);
    if (!req || !rows.length) throw new Error('ไม่พบคำขอนี้');
    if (rows.some(r => r.status !== 'pending')) throw new Error('คำขอนี้ตัดสินไปแล้ว');
    const mine = !!rows[0].byUser && String(rows[0].byUser).toLowerCase() === String(u.username || u.me || '').toLowerCase();
    if (!u.isAdmin && !(mine && !ok)) throw new Error('อนุมัติคำขอได้เฉพาะแอดมินหลัก');
    const status = ok ? 'approved' : u.isAdmin ? 'rejected' : 'cancelled', now = new Date().toISOString();
    if (ok) {
      const cfg = readConfig_(ss) || {};
      rows.forEach(r => { cfg[r.key] = JSON.parse(r.value); });
      writeConfig_(ss, cfg);
      try { CacheService.getScriptCache().remove('appName'); } catch (e) { /* แคชใช้ไม่ได้: ชื่อแท็บเปลี่ยนภายใน 6 ชั่วโมง */ }
    }
    const sh = tableSheet_(ss, 'cfgreq'), header = headerOf_(sh), col = header.indexOf('id') + 1;
    const dec = { status: status, decBy: String(u.name || u.username || u.me || ''), decAt: now, why: String(why == null ? '' : why).trim().slice(0, 500) };
    const fields = TABLES.cfgreq.fields.filter(f => f[0] in dec);
    rows.forEach(r => { const row = findRow_(sh, col, r.id); if (row) writeFields_(sh, row, header, fields, dec); });
    return cfgReqs_(ss, readConfig_(ss) || {}, u);
  });
}

/* ---------- นำเข้าจากแท็บเดิม (3D, VM bt, SRS CSI, Brachy, Hyper, RC, วิชาการ, P4P) ---------- */

const LEGACY_PLAN_SHEETS = [
  ['3D', '3d'], ['3D Bt', '3dbt'], ['VM Brain', 'vmbrain'], ['VM bt', 'vmbt'],
  ['VM etc', 'vmetc'], ['VM Chest', 'vmchest'], ['VM H&N', 'vmhn'], ['SRS CSI', 'srs'],
];
// แท็บที่มีสองตารางคู่กัน: ตารางซ้าย, ตารางขวา (นำเข้าเป็นกิจกรรมนับครั้งในแถบ Brachytherapy / Hyperthermia)
const LEGACY_PAIR_SHEETS = [['Brachy', 'brachy', 'brachyn'], ['Hyper', 'hyper', 'p2h']];
// เดิมเป็นเทคนิคแจกตามคิว ตอนนี้เป็นกิจกรรมนับครั้ง (ใช้รหัสเดิมเป็นประเภทกิจกรรม)
const MOVED_CATS = ['brachy', 'brachyn', 'p2h', 'hyper'];
const LEGACY_HEADERS = {
  'CT-Sim': 'ct', 'In': 'in', 'Sim': 'sim', 'Finish': 'fin', 'Evaluate': 'eval', 'Type': 'type',
  'HN': 'hn', 'Name': 'name', 'Doc': 'doc', 'Aim': 'aim', 'Technique': 'tech', 'Note': 'note',
};

function importLegacy() {
  const ss = ss_();
  requireAdmin_(ss);
  const tz = tz_(ss);
  const found = parseLegacy_(name => {
    const sh = sheet_(ss, name);
    return sh ? sh.getDataRange().getValues() : null;
  }, tz);
  const added = withLock_(() => {
    const result = { cases: appendNew_(ss, 'cases', found.cases), logs: appendNew_(ss, 'logs', found.logs) };
    const cfg = readConfig_(ss) || {};
    if (!Array.isArray(cfg.staff) || !cfg.staff.length) {
      cfg.staff = (found.staff.length ? found.staff : ['JR', 'WM', 'NY', 'WS']).map(code => ({ code: code, name: '', active: true }));
    }
    // ตั้งคิวให้คนถัดไปตรงกับแถวว่างแถวแรกในแท็บเดิม
    const codes = cfg.staff.map(s => String(s.code).toUpperCase());
    const at = new Date().toISOString();
    cfg.queue = cfg.queue || {};
    Object.keys(found.next).forEach(cat => {
      if (codes.indexOf(found.next[cat]) >= 0) cfg.queue[cat] = { code: found.next[cat], at: at };
    });
    cfg.carry = cfg.carry || {};
    Object.keys(found.carry).forEach(ym => { cfg.carry[ym] = Object.assign({}, cfg.carry[ym], found.carry[ym]); });
    writeConfig_(ss, cfg);
    return result;
  });
  const msg = 'เคสใหม่ ' + added.cases + ' รายการ · RC และกิจกรรม ' + added.logs + ' รายการ\n' +
    'รายการที่เคยนำเข้าแล้วจะไม่ถูกเพิ่มซ้ำ และตั้งคิวถัดไปตามแถวว่างในแท็บเดิมให้แล้ว';
  // รันจากหน้าแก้ไขสคริปต์ (ไม่ได้เปิดจากชีต) ไม่มีหน้าต่างแจ้ง ดูผลใน Execution log แทน
  try { SpreadsheetApp.getUi().alert('นำเข้าข้อมูลแล้ว', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { Logger.log('นำเข้าข้อมูลแล้ว: ' + msg); }
  return msg;
}

/**
 * อ่านแท็บของไฟล์เดิมเป็นรายการเคสและกิจกรรม (ไม่แตะสเปรดชีต ทดสอบได้ด้วยข้อมูลอาร์เรย์)
 * read(name) คืนค่า 2 มิติแบบ getValues() หรือ null ถ้าไม่มีแท็บนั้น
 */
function parseLegacy_(read, tz) {
  const out = { cases: [], logs: [], next: {}, carry: {}, staff: [] };
  const text = v => cellText_(v, tz);
  const date = v => { const s = text(v); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
  const stamp = (d, r) => (d || '1970-01-01') + 'T00:00:00.' + ('00' + (r % 1000)).slice(-3) + 'Z';
  const key = function () { return 'L:' + Array.prototype.join.call(arguments, ':'); };
  const isTableLabel = s => /^Column\d+$/.test(s);
  const isCode = s => /^[A-Z]{2,4}$/.test(s);
  const headerRow = (rows, label, within) => rows.findIndex((r, i) => i < within && r.map(text).indexOf(label) >= 0);

  // ลำดับทีม (ใช้กับแต้มต่อ)
  const sum = read('SUM');
  if (sum) for (let r = 1; r < Math.min(sum.length, 12); r++) { const c = text(sum[r][1]); if (isCode(c) && out.staff.indexOf(c) < 0) out.staff.push(c); }
  if (!out.staff.length) out.staff = ['JR', 'WM', 'NY', 'WS'];

  LEGACY_PLAN_SHEETS.forEach(([name, cat]) => {
    const rows = read(name);
    if (!rows) return;
    const h = headerRow(rows, 'HN', 8);
    if (h < 0) return;
    const col = {};
    rows[h].map(text).forEach((v, i) => { const f = LEGACY_HEADERS[v]; if (f && !(f in col)) col[f] = i; });
    const get = (row, f) => (f in col ? row[col[f]] : '');
    let last = -1;
    for (let r = h + 1; r < rows.length; r++) {
      const row = rows[r];
      const hn = text(get(row, 'hn'));
      const inDate = date(get(row, 'in'));
      if ((!hn && !inDate) || isTableLabel(hn)) continue;
      last = r;
      const sim = text(get(row, 'sim'));
      out.cases.push({
        id: key(name, r + 1, hn, inDate), cat: cat, mp: text(row[0]).toUpperCase(),
        hn: hn, name: text(get(row, 'name')), ct: date(get(row, 'ct')), in: inDate,
        sim: /on\s*call/i.test(sim) ? 'on call' : date(get(row, 'sim')),
        fin: date(get(row, 'fin')), eval: date(get(row, 'eval')), type: text(get(row, 'type')),
        doc: text(get(row, 'doc')), aim: text(get(row, 'aim')), tech: text(get(row, 'tech')),
        note: text(get(row, 'note')), created: stamp(inDate, r), updated: '',
      });
    }
    // คิวถัดไป = รหัส MP ที่เติมไว้ในแถวว่างแถวแรกหลังเคสล่าสุด
    for (let r = last >= 0 ? last + 1 : h + 1; r < rows.length; r++) {
      const code = text(rows[r][0]).toUpperCase();
      if (isCode(code)) { out.next[cat] = code; break; }
    }
  });

  LEGACY_PAIR_SHEETS.forEach(([name, leftCat, rightCat]) => {
    const rows = read(name);
    if (!rows) return;
    const h = headerRow(rows, 'HN', 6);
    if (h < 0) return;
    const starts = rows[h].map(text).map((v, i) => (v === 'Date' ? i : -1)).filter(i => i >= 0);
    [leftCat, rightCat].forEach((cat, b) => {
      const c0 = starts[b];
      if (c0 === undefined) return;
      for (let r = h + 1; r < rows.length; r++) {
        const row = rows[r];
        const d = date(row[c0]);
        const hn = text(row[c0 + 1]);
        if ((!d && !hn) || isTableLabel(hn)) continue;
        out.logs.push({
          id: key(name, cat, r + 1, hn, d), kind: cat, date: d, mp: text(row[c0 + 3]).toUpperCase(), hn: hn,
          name: text(row[c0 + 2]), caseId: '', title: '', min: '', k: '', note: text(row[c0 + 4]), created: stamp(d, r), updated: '',
        });
      }
    });
  });

  // RC = Quality Checklist ผูกกับแผนของ HN เดียวกันที่ In ล่าสุดไม่เกินวัน RC
  const linkCase = (hn, d) => {
    let best = null;
    out.cases.forEach(c => {
      if (c.hn !== hn) return;
      if (d && c.in && c.in > d) return;
      if (!best || c.in > best.in) best = c;
    });
    return best ? best.id : '';
  };
  const rc = read('RC');
  if (rc) {
    const h = headerRow(rc, 'HN', 6);
    const c0 = h >= 0 ? rc[h].map(text).indexOf('Date') : -1;
    if (c0 >= 0) {
      for (let r = h + 1; r < rc.length; r++) {
        const row = rc[r];
        const d = date(row[c0]);
        const hn = text(row[c0 + 1]);
        if ((!d && !hn) || isTableLabel(hn)) continue;
        out.logs.push({
          id: key('RC', r + 1, hn, d), kind: 'rc', date: d, mp: text(row[c0 + 3]).toUpperCase(), hn: hn,
          name: text(row[c0 + 2]), caseId: linkCase(hn, d), title: '', min: '', k: '',
          note: text(row[c0 + 4]), created: stamp(d, r), updated: '',
        });
      }
    }
  }

  const ac = read('วิชาการ');
  if (ac) {
    const h = headerRow(ac, 'กิจกรรม', 6);
    const starts = h >= 0 ? ac[h].map(text).map((v, i) => (v === 'Date' ? i : -1)).filter(i => i >= 0) : [];
    ['acad', 'admin'].forEach((kind, b) => {
      const c0 = starts[b];
      if (c0 === undefined) return;
      for (let r = h + 1; r < ac.length; r++) {
        const row = ac[r];
        const title = text(row[c0 + 1]);
        if (!title || isTableLabel(title)) continue;
        const d = date(row[c0]);
        out.logs.push({
          id: key('ACAD', kind, r + 1, d, title), kind: kind, date: d, mp: text(row[0]).toUpperCase(),
          hn: '', name: '', caseId: '', title: title, min: text(row[c0 + 2]), k: text(row[c0 + 3]),
          note: text(row[c0 + 4]), created: stamp(d, r), updated: '',
        });
      }
    });
  }

  // แต้มต่อของเดือนในแท็บ Month (แถว Year / Month)
  const month = read('Month');
  let ym = '';
  if (month) {
    const h = month.findIndex(r => text(r[0]) === 'Year' && text(r[1]) === 'Month');
    const y = h >= 0 && month[h + 1] ? Number(month[h + 1][0]) : 0;
    const m = h >= 0 && month[h + 1] ? Number(month[h + 1][1]) : 0;
    if (y && m) ym = y + '-' + ('0' + m).slice(-2);
  }
  const p4p = read('P4P');
  if (p4p && ym) {
    const vals = [];
    p4p.forEach(row => row.forEach((v, i) => { if (text(v) === 'แต้มต่อ') vals.push(Number(row[i + 5]) || 0); }));
    vals.forEach((v, i) => {
      const code = out.staff[i];
      if (code && v) (out.carry[ym] = out.carry[ym] || {})[code] = v;
    });
  }
  return out;
}

/**
 * ย้ายเคส Brachy / Hyperthermia ที่บันทึกไว้แบบเดิม (แท็บ Cases) ไปเป็นกิจกรรมในแท็บ Logs ครั้งเดียว
 * ใช้ id เดิม จึงรันซ้ำหรือนำเข้าซ้ำได้โดยไม่เกิดรายการซ้ำ คืนจำนวนที่ย้าย
 */
function moveActCases(token) {
  requireEdit_(token);
  return withLock_(() => {
    const ss = ss_();
    const old = readTable_(ss, 'cases').filter(c => MOVED_CATS.indexOf(c.cat) >= 0);
    if (!old.length) return 0;
    appendNew_(ss, 'logs', old.map(c => ({
      id: c.id, kind: c.cat, date: c.in, mp: c.mp, hn: c.hn, name: c.name, caseId: '', title: '', min: '', k: '',
      note: c.note, created: c.created, updated: new Date().toISOString(),
    })));
    const sh = tableSheet_(ss, 'cases');
    const idCol = headerOf_(sh).indexOf('id') + 1;
    old.map(c => findRow_(sh, idCol, c.id)).filter(r => r > 0).sort((a, b) => b - a).forEach(r => delRow_(sh, r));
    return old.length;
  });
}

/* ---------- ปุ่มบันทึกขั้นตอนของเคส (Finish, Evaluate, Dose check, F0, Delta4, SRS MapCheck, Plan complete) ---------- */

const STEP_NAMES = { fin: 'Finish', eval: 'Evaluate', mu: 'Dose check', d0: 'F0', d4: 'Delta4', mc: 'SRS MapCheck', pc: 'Plan complete' };
const STEP_VALUES = ['mu', 'd0', 'd4', 'mc'];   // ต้องกรอกค่า
const STAMP_FIELDS = ['fin', 'finBy', 'eval', 'evalBy', 'mu', 'muBy', 'muVal', 'd0', 'd0By', 'd0Val', 'd4', 'd4By', 'd4Val', 'mc', 'mcBy', 'mcVal', 'pc', 'pcBy', 'muNote', 'd0Note', 'd4Note', 'mcNote',
  'rt', 'rtDate', 'rtAt', 'rtBy', 'rtNote', 'fxlog', 'ptags', 'rmove', 'bsteps', 'mqt', 'fxadd', 'replan', 'evNote'];
// ชื่อคอลัมน์เดิมในแท็บ Cases → ชื่อใหม่ (เปลี่ยนชื่อในชีตตอนเขียนครั้งถัดไป ระหว่างนั้นอ่านจากชื่อเดิมได้)
const RENAMED_COLS = { 'MU Check': 'Dose check', 'MU Check โดย': 'Dose check โดย', 'MU Check ค่า': 'Dose check ค่า', 'D0': 'F0', 'D0 โดย': 'F0 โดย', 'D0 ค่า': 'F0 ค่า' };

/**
 * กดปุ่มขั้นตอนของเคส: ตรวจรหัส PIN ของคนกด แล้วบันทึกวันเวลา (เวลาเซิร์ฟเวอร์) ชื่อคนกด และค่า
 * value = null คือล้างขั้นตอนนั้น (เลิกทำหรือบันทึกผิด) · เขียนเฉพาะช่องของขั้นตอนนั้น ไม่ทับข้อมูลอื่นของเคส
 * Evaluate ก่อน Finish: Finish ได้เวลาเดียวกัน · คืนเคสหลังบันทึก
 */
function stampCase(id, step, value, pin, token) {
  const steps = {};
  steps[step] = value;
  return stampSteps_(id, steps, pin, token);
}

// ช่องกรอกค่าใต้ปุ่ม Dose check, F0, Delta4, SRS MapCheck: บันทึกค่า (หลายค่าพร้อมกันได้) ใส่ PIN ครั้งเดียว
// values = { mu: '1.2%', d4: { value: '88%', note: 'หมายเหตุ' } } · ล้างการบันทึกทำทีละขั้นตอนที่ stampCase
function stampSteps(id, values, pin, token) {
  const keys = Object.keys(values || {});
  if (!keys.length) throw new Error('กรอกค่าก่อนบันทึก');
  if (keys.some(k => values[k] === null)) throw new Error('ล้างการบันทึกทีละขั้นตอน');
  return stampSteps_(id, values, pin, token);
}

// เลือกวันเวลาเองได้ (ลืมกดตอนทำจริง): at = 'yyyy-MM-dd HH:mm' ไม่เกินเวลาตอนนี้ · ว่าง = เวลาเซิร์ฟเวอร์ตอนนี้
// ชื่อฟังก์ชันใหม่ ไม่เพิ่มพารามิเตอร์ให้ stampCase / stampSteps เดิม (หน้าเว็บรุ่นเก่าส่ง token เป็นตัวท้ายสุด)
function stampCaseAt(id, step, value, pin, at, token) {
  const steps = {};
  steps[step] = value;
  return stampSteps_(id, steps, pin, token, at);
}

function stampStepsAt(id, values, pin, at, token) {
  const keys = Object.keys(values || {});
  if (!keys.length) throw new Error('กรอกค่าก่อนบันทึก');
  if (keys.some(k => values[k] === null)) throw new Error('ล้างการบันทึกทีละขั้นตอน');
  return stampSteps_(id, values, pin, token, at);
}

function stampTime_(at, tz) {
  const now = new Date();
  if (at == null || String(at).trim() === '') return Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm');
  const s = String(at).trim(), m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(s);
  const d = m && new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (!m || d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3] || +m[4] > 23 || +m[5] > 59 || +m[1] < 2000) throw new Error('วันเวลาไม่ถูกต้อง');
  if (s > Utilities.formatDate(new Date(now.getTime() + 5 * 60000), tz, 'yyyy-MM-dd HH:mm')) throw new Error('บันทึกวันเวลาที่ยังไม่ถึงไม่ได้');
  return s;
}

// ตรวจค่าของขั้นตอนที่จะบันทึก { keys, vals (null = ล้าง), notes } · ใช้กับเคสและแผน boost
function stampVals_(steps) {
  const keys = Object.keys(steps || {}), vals = {}, notes = {};
  keys.forEach(step => {
    if (!STEP_NAMES[step]) throw new Error('ไม่รู้จักขั้นตอน ' + step);
    let value = steps[step];
    if (value && typeof value === 'object') {
      if (value.note != null) notes[step] = String(value.note).trim().slice(0, 200);
      value = value.value;
    }
    vals[step] = value === null ? null : String(value == null ? '' : value).trim().slice(0, 60);
    if (value !== null && STEP_VALUES.indexOf(step) >= 0 && !vals[step]) throw new Error('กรอกค่า ' + STEP_NAMES[step] + ' ก่อนบันทึก');
  });
  return { keys: keys, vals: vals, notes: notes };
}

function stampSteps_(id, steps, pin, token, at) {
  const u = requireEdit_(token, EDIT_VIEWS.cases);
  const parsed = stampVals_(steps), keys = parsed.keys, vals = parsed.vals, notes = parsed.notes;
  return caseEdit_(u, id, pin, c0 => !c0 || keys.some(k => vals[k] === null || has_(c0[k])), (c0, ss) => {
    const now = stampTime_(at, tz_(ss));
    const name = String(u.name || u.username || u.me || '');
    const set = {};
    keys.forEach(step => {
      const clear = vals[step] === null, when = clear ? '' : now, by = clear ? '' : name;
      set[step] = when;
      set[step + 'By'] = by;
      if (STEP_VALUES.indexOf(step) >= 0) set[step + 'Val'] = clear ? '' : vals[step];
      if (STEP_VALUES.indexOf(step) >= 0 && (clear || step in notes)) set[step + 'Note'] = clear ? '' : notes[step];
      if (step === 'eval' && !clear && !has_(c0.fin)) { set.fin = when; set.finBy = by; }
    });
    return set;
  });
}

/**
 * ปุ่มขั้นตอนของแผน Sequential boost (แถวย่อยใต้ HN): เหมือน stampSteps แต่เก็บแยกของแต่ละ boost (sid ของบริเวณนั้น)
 * steps = { fin: '', mu: '1.2%', d4: { value, note }, eval: null (ล้าง) } · at = วันเวลาที่เลือกเอง (ว่าง = ตอนนี้) · คืนเคสหลังบันทึก
 */
function stampBoost(id, sid, steps, pin, at, token) {
  const u = requireEdit_(token, EDIT_VIEWS.cases);
  sid = String(sid == null ? '' : sid).trim();
  if (!/^[\w-]{1,40}$/.test(sid)) throw new Error('ไม่พบแผน boost นี้');
  const parsed = stampVals_(steps), keys = parsed.keys, vals = parsed.vals, notes = parsed.notes;
  if (!keys.length) throw new Error('เลือกขั้นตอนที่จะบันทึก');
  const boostOf = c0 => { try { const a = JSON.parse(String((c0 && c0.bsteps) || '{}')); return a && typeof a === 'object' && !Array.isArray(a) ? a : {}; } catch (e) { return {}; } };
  return caseEdit_(u, id, pin, c0 => !c0 || keys.some(k => vals[k] === null || has_((boostOf(c0)[sid] || {})[k])), (c0, ss) => {
    let all = boostOf(c0);
    if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
    const cur = all[sid] && typeof all[sid] === 'object' ? all[sid] : {};
    const now = stampTime_(at, tz_(ss)), name = String(u.name || u.username || u.me || '');
    keys.forEach(step => {
      const clear = vals[step] === null, when = clear ? '' : now, by = clear ? '' : name;
      cur[step] = when;
      cur[step + 'By'] = by;
      if (STEP_VALUES.indexOf(step) >= 0) cur[step + 'Val'] = clear ? '' : vals[step];
      if (STEP_VALUES.indexOf(step) >= 0 && (clear || step in notes)) cur[step + 'Note'] = clear ? '' : notes[step];
      if (step === 'eval' && !clear && !cur.fin) { cur.fin = when; cur.finBy = by; }
    });
    Object.keys(cur).forEach(k => { if (cur[k] === '') delete cur[k]; });
    if (Object.keys(cur).length) all[sid] = cur; else delete all[sid];
    return { bsteps: Object.keys(all).length ? JSON.stringify(all) : '' };
  });
}

// วันนี้ตามเขตเวลาของชีต (yyyy-MM-dd)
function today_(ss) { return Utilities.formatDate(new Date(), tz_(ss || ss_()), 'yyyy-MM-dd'); }
// บันทึกล่วงหน้าไม่ได้ (API 51): ฉายแล้ว · Off RT · Complete course / Cancel RT ของวันหลังวันนี้ (Hold, Port film ฯลฯ ยังบันทึกล่วงหน้าได้)
const FX_NOW_ACTS = ['given', 'off'];
// ล้างที่บันทึกล่วงหน้าไว้ก่อนมีกติกานี้ (ตอนโหลดข้อมูล): รายการสถานะ fraction ข้างบนที่วันที่หลังวันนี้ · สถานะการฉาย (Complete course / Cancel RT) ที่วันที่หลังวันนี้
// แก้ cases ที่ส่งมาให้ตรงกับชีต · คืนจำนวนรายการที่ล้าง
function clearAdvance_(ss, cfg, cases) {
  const td = today_(ss);
  const fxOf = c => { const l = jsonList_(c.fxlog); return { all: l, keep: l.filter(x => !(x && FX_NOW_ACTS.indexOf(String(x.act)) >= 0 && String(x.date).slice(0, 10) > td)) }; };
  const bad = cases.filter(c => (c.rt && String(c.rtDate) > td) || fxOf(c).keep.length !== fxOf(c).all.length);
  if (!bad.length) return 0;
  let n = 0;
  try {
    withLock_(() => {
      const sh = tableSheet_(ss, 'cases', cfg), header = headerOf_(sh);
      bad.forEach(c => {
        const row = findRow_(sh, header.indexOf('id') + 1, c.id);
        if (!row) return;
        const f = fxOf(c), set = {};
        if (f.keep.length !== f.all.length) { set.fxlog = f.keep.length ? JSON.stringify(f.keep) : ''; n += f.all.length - f.keep.length; }
        if (c.rt && String(c.rtDate) > td) { Object.assign(set, { rt: '', rtDate: '', rtAt: '', rtBy: '', rtNote: '' }); n++; }
        writeFields_(sh, row, header, TABLES.cases.fields.filter(x => x[0] in set), set);
        Object.assign(c, set);
        console.log('clearAdvance_ ' + c.id + ' ' + JSON.stringify(Object.keys(set)));
      });
    });
  } catch (e) { return 0; }   // มีคนบันทึกอยู่: ล้างรอบหน้า
  return n;
}

/**
 * แถบ Complete: จบการฉายของเคส ยืนยันด้วยรหัส PIN · status = 'complete' (Complete course) หรือ 'cancel' (Cancel RT ต้องมีสาเหตุ)
 * date = วันที่ฉายครั้งสุดท้าย / วันที่หยุดฉาย (yyyy-MM-dd) · status = '' ล้างกลับเป็นกำลังฉาย · คืนเคสหลังบันทึก
 */
function courseCase(id, status, date, note, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.course);
  status = String(status || '');
  if (['', 'complete', 'cancel'].indexOf(status) < 0) throw new Error('สถานะการฉายไม่ถูกต้อง');
  date = String(date == null ? '' : date).trim();
  note = String(note == null ? '' : note).trim().slice(0, 300);
  if (status && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('ใส่วันที่');
  if (status === 'cancel' && !note) throw new Error('กรอกสาเหตุที่ Cancel RT');
  if (status && date > today_()) throw new Error('ยังไม่ถึงวันที่ ' + date + ' บันทึก ' + (status === 'cancel' ? 'Cancel RT' : 'Complete course') + ' ล่วงหน้าไม่ได้');
  return caseEdit_(u, id, pin, c0 => !status || !c0 || has_(c0.rt), (c0, ss) => {
    const now = Utilities.formatDate(new Date(), tz_(ss), 'yyyy-MM-dd HH:mm');
    return status
      ? { rt: status, rtDate: date, rtAt: now, rtBy: String(u.name || u.username || u.me || ''), rtNote: note }
      : { rt: '', rtDate: '', rtAt: '', rtBy: '', rtNote: '' };
  });
}

/**
 * แถบ Complete: สถานะของ fraction รายวัน ยืนยันด้วยรหัส PIN · หนึ่งรายการต่อวันต่อเคส (บันทึกวันเดิมซ้ำ = แทนที่)
 * ev = { type, label, act, back, reason, note } · act: skip = ไม่ได้ฉายตั้งแต่วันนั้นถึงก่อนวันกลับมาฉาย (back ว่าง = จนกว่าจะกลับมา) fraction เลื่อนออกไป
 * treat = ฉายตามปกติ บันทึกไว้เฉย ๆ · given = ฉายแล้ว (บันทึกล่วงหน้าไม่ได้) · off = Off RT หยุดฉายตั้งแต่วันนั้น (มีได้รายการเดียว)
 * ev = null ล้างรายการของวันนั้น · คืนเคสหลังบันทึก
 */
const FX_ACTS = ['skip', 'treat', 'off', 'given'];
const FX_IMG_RE_ = /^(0|[A-Z]{2,4}[1-9]?(,[A-Z]{2,4}[1-9]?){0,7})$/;   // API 124: จำนวนภาพ เช่น CB2,KV · MV · 0 = ไม่ทำ image
function fractionCase(id, date, ev, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.course);
  const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  date = cut(date, 10);
  if (!isDate(date)) throw new Error('วันที่ไม่ถูกต้อง');
  // API 56: แถวย่อยในตารางวันฉาย (บริเวณ / รอบของ BID) · lane = "บริเวณ" หรือ "บริเวณ.รอบ" เช่น "1", "0.2" · บันทึกได้เฉพาะ ฉายแล้ว
  // ev = { lane, clear: true } = ล้างฉายแล้วของแถวนั้น · ไม่มี lane = ทั้งผู้ป่วย (แทนทุกแถวของวันนั้น)
  const lane = ev && ev.lane != null && ev.lane !== '' ? cut(ev.lane, 8) : '';
  if (lane && !/^\d{1,2}(\.\d)?$/.test(lane)) throw new Error('แถวของบริเวณไม่ถูกต้อง');
  if (ev && ev.clear) ev = null;
  let rec = null;
  if (ev) {
    rec = { date: date, type: cut(ev.type, 40), label: cut(ev.label, 40), act: String(ev.act || ''), back: cut(ev.back, 10), reason: cut(ev.reason, 80), note: cut(ev.note, 200) };
    if (ev.see === true || ev.see === 1 || ev.see === '1') rec.see = '1';   // API 94: Re-CT · พบแพทย์ (ไปรอที่ห้องตรวจ → ระหว่างฉาย วันนั้น)
    const img = String(ev.img == null ? '' : ev.img).toUpperCase().replace(/\s/g, '');   // API 120: Verify image ของวันนั้นที่ต่างจากแนวทาง IGRT
    if (FX_IMG_RE_.test(img)) rec.img = img;   // API 124: ทุกชนิดภาพ
    if (lane && rec.act !== 'given') throw new Error('บันทึกแยกบริเวณได้เฉพาะ ฉายแล้ว (สถานะอื่นใช้กับทุกบริเวณ)');
    if (lane) rec.lane = lane;
    if (!rec.type || !rec.label) throw new Error('เลือกสถานะ');
    if (FX_ACTS.indexOf(rec.act) < 0) throw new Error('สถานะนี้ไม่ถูกต้อง');
    if (rec.act !== 'skip') rec.back = '';
    if (rec.back && (!isDate(rec.back) || rec.back <= date)) throw new Error('วันกลับมาฉายต้องหลังวันที่ ' + date);
  }
  const same = x => x && String(x.date).slice(0, 10) === date && (!lane || String(x.lane || '') === lane);
  return caseEdit_(u, id, pin, c0 => !ev || jsonList_((c0 || {}).fxlog).some(same), (c0, ss) => {
    if (rec && FX_NOW_ACTS.indexOf(rec.act) >= 0 && date > today_(ss)) throw new Error('ยังไม่ถึงวันที่ ' + date + ' บันทึก' + (rec.act === 'given' ? 'ฉายแล้ว' : ' ' + rec.label + ' ') + 'ล่วงหน้าไม่ได้');
    let list = jsonList_(c0.fxlog);
    list = list.filter(x => x && !same(x));   // ทั้งผู้ป่วย = ทุกรายการของวันนั้น (รวมแถวย่อย) · แถวย่อย = เฉพาะแถวนั้น
    if (rec) {
      const inside = list.filter(x => !x.lane && x.act === 'skip' && x.date < date && (!x.back || date < x.back))[0];
      if (inside) throw new Error('วันที่ ' + date + ' อยู่ในช่วง ' + inside.label + ' ตั้งแต่ ' + inside.date + ' แก้ที่รายการนั้นแทน');
      if (rec.act === 'off') list = list.filter(x => x.act !== 'off');
      rec.by = String(u.name || u.username || u.me || '');
      rec.at = Utilities.formatDate(new Date(), tz_(ss), 'yyyy-MM-dd HH:mm');
      list.push(rec);
    }
    list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return { fxlog: list.length ? JSON.stringify(list) : '' };
  });
}

/** API 124 (24 พ.ย.): แก้จำนวนภาพ Verify image ของ fraction ที่บันทึกฉายแล้ว (กดป้ายในตารางวันฉาย) · สถานะไม่เปลี่ยน · o = { lane, img } · img ว่าง = ตามแนวทาง · แก้ของที่บันทึกแล้ว = ต้องใส่ PIN */
function fxImgCase(id, date, o, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.course);
  date = String(date == null ? '' : date).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('วันที่ไม่ถูกต้อง');
  o = o && typeof o === 'object' ? o : {};
  const lane = String(o.lane == null ? '' : o.lane).trim().slice(0, 8), img = String(o.img == null ? '' : o.img).toUpperCase().replace(/\s/g, '');
  if (img && !FX_IMG_RE_.test(img)) throw new Error('จำนวนภาพไม่ถูกต้อง');
  return caseEdit_(u, id, pin, () => true, c0 => {
    const list = jsonList_(c0.fxlog), x = list.filter(e => e && String(e.date).slice(0, 10) === date && e.act === 'given' && String(e.lane || '') === lane)[0];
    if (!x) throw new Error('ยังไม่ได้บันทึกฉายแล้ววันที่ ' + date + ' (บันทึกสถานะ fraction ก่อน)');
    if (img) x.img = img; else delete x.img;
    return { fxlog: JSON.stringify(list) };
  });
}

/**
 * ย้ายห้องฉาย: fraction วันนั้น (scope once) หรือตั้งแต่วันนั้นเป็นต้นไป (scope on) ไปฉายอีกห้อง ยืนยันด้วยรหัส PIN
 * หนึ่งรายการต่อวัน (บันทึกวันเดิมซ้ำ = แก้) · mv = null ล้างรายการของวันนั้น · เก็บแยกจากสถานะ fraction (ห้องใหม่บันทึกฉายแล้ววันเดียวกันได้)
 */
function moveCase(id, date, mv, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.course);
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  date = cut(date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('วันที่ไม่ถูกต้อง');
  let rec = null;
  if (mv) {
    rec = { date: date, room: cut(mv.room, 40), from: cut(mv.from, 40), scope: mv.scope === 'on' ? 'on' : 'once', note: cut(mv.note, 200) };
    if (!rec.room) throw new Error('เลือกห้องที่ย้ายไป');
    if (rec.room === rec.from) throw new Error('ห้องที่ย้ายไปต้องไม่ใช่ห้องเดิม');
  }
  return caseEdit_(u, id, pin, c0 => !mv || jsonList_((c0 || {}).rmove).some(x => x && String(x.date).slice(0, 10) === date), (c0, ss) => {
    let list = jsonList_(c0.rmove);
    list = list.filter(x => x && x.date !== date);
    if (rec) {
      rec.by = String(u.name || u.username || u.me || '');
      rec.at = Utilities.formatDate(new Date(), tz_(ss), 'yyyy-MM-dd HH:mm');
      list.push(rec);
    }
    list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return { rmove: list.length ? JSON.stringify(list) : '' };
  });
}

/**
 * ตารางวันฉาย: รายละเอียดผู้ป่วยหลัง HN (เช่น NPO, BD protocol, Empty BD) ยืนยันด้วยรหัส PIN
 * tags = ข้อความคั่นด้วยจุลภาค (ว่าง = ล้าง) · เขียนเฉพาะช่องนี้ · คืนเคสหลังบันทึก
 */
function tagCase(id, tags, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.course);
  const seen = {};
  const list = String(tags == null ? '' : tags).split(',').map(x => x.trim().slice(0, 40)).filter(x => x && !seen[x.toLowerCase()] && (seen[x.toLowerCase()] = true));
  const text = list.join(', ');
  if (text.length > 300) throw new Error('รายละเอียดผู้ป่วยยาวเกินไป (ไม่เกิน 300 ตัวอักษร)');
  return caseEdit_(u, id, pin, c0 => has_((c0 || {}).ptags), () => ({ ptags: text }));
}

/**
 * งานวางแผนใหม่ให้ MP คนเดิม (บันทึก Re-CT, ย้ายห้อง ฯลฯ ในตารางวันฉาย) ยืนยันด้วยรหัส PIN
 * เคสใหม่คัดลอกข้อมูลผู้ป่วยและเทคนิคจากเคสเดิม · prescription = fraction ที่เหลือ (หน้าเว็บคำนวณ) · In = วันนี้ · ขั้นตอนเริ่มใหม่ทั้งหมด
 * หนึ่งงานต่อเคสเดิมต่อวัน (บันทึกซ้ำ = แก้สาเหตุ วันเริ่มฉาย ห้อง) · rp = null: ลบงานของวันนั้นถ้ายังไม่เริ่ม (ยังไม่มีขั้นตอนที่บันทึก)
 * rp = { kind, label, reason, room, sim, ct, dpf, fx, area, sites: [...], mp } · mp ว่าง = MP ของเคสเดิม (บันทึกซ้ำ = คนที่รับงานอยู่) · ระบุ = ส่งให้คนนั้น
 */
function replanCase(id, date, rp, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.course.concat(['work']));   // แถบแจกงานฟิสิกส์แจกงานที่รอ (CP ไม่ทำ CT ใหม่) ได้ด้วย (API 68)
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v);
  date = cut(date, 10);
  if (!isDate(date)) throw new Error('วันที่ไม่ถูกต้อง');
  let rec = null;
  if (rp) {
    rec = { kind: cut(rp.kind, 40), label: cut(rp.label, 40), reason: cut(rp.reason, 80), room: cut(rp.room, 40), sim: cut(rp.sim, 10), ct: cut(rp.ct, 10),
      dpf: cut(rp.dpf, 20), fx: cut(rp.fx, 4), area: cut(rp.area, 200), mp: cut(rp.mp, 20).toUpperCase() };
    if (!rec.kind || !rec.label) throw new Error('ไม่ทราบสาเหตุของงานวางแผนใหม่');
    if ((rec.sim && !isDate(rec.sim)) || (rec.ct && !isDate(rec.ct))) throw new Error('วันที่ของงานวางแผนใหม่ไม่ถูกต้อง');
    if (rec.fx && !/^\d{1,3}$/.test(rec.fx)) throw new Error('จำนวน fraction ไม่ถูกต้อง');
    const sites = Array.isArray(rp.sites) ? rp.sites.slice(0, 10).filter(x => x && typeof x === 'object').map(x => {
      const o = {};
      ['area', 'dpf', 'fx', 'rx', 'freq', 'start', 'startFx', 'sid', 'room'].forEach(k => { if (x[k] != null && x[k] !== '') o[k] = cut(x[k], 120); });
      return o;
    }) : [];
    rec.sites = sites.length ? JSON.stringify(sites) : '';
  }
  pinChange_(u, pin, !rp);
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss);
    const sh = tableSheet_(ss, 'cases', cfg), header = headerOf_(sh), fields = tableDef_('cases', cfg).fields;
    // เคสเดิม = แถวเดียว · งานของวันนั้น / งานซ้ำ หาจากคอลัมน์ที่ใช้ (เดิมอ่านทั้งชีต Cases)
    const px = openRow_(ss, 'cases', cfg, id), parent = px.cur;
    const rows = parent ? readCols_(ss, 'cases', cfg, ['cat', 'mp', 'how', 'in', 'hn', 'pc', 'rt', 'replan']) : [];
    if (!parent) throw new Error('ไม่พบเคสนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    if (rec && rec.mp) {
      const staff = Array.isArray(cfg && cfg.staff) && cfg.staff.length ? cfg.staff : DEFAULT_STAFF.map(code => ({ code: code }));
      if (!staff.some(x => String(x.code).toUpperCase() === rec.mp)) throw new Error('ไม่พบรหัสนักฟิสิกส์ ' + rec.mp);
    }
    const metaOf = c => { try { const m = JSON.parse(c.replan || 'null'); return m && typeof m === 'object' ? m : null; } catch (e) { return null; } };
    const oldRef = rows.filter(c => { const m = metaOf(c); return m && m.of === id && m.date === date; })[0];
    const ox = oldRef ? openRow_(ss, 'cases', cfg, oldRef.id) : null, old = ox ? ox.cur : null;
    if (!rec) {
      if (!old) return { id: '', removed: false };
      if (['fin', 'eval', 'mu', 'd0', 'd4', 'mc', 'pc'].some(k => String(old[k] || ''))) return { id: old.id, removed: false, started: true };
      if (ox.row) delRow_(ox.sh, ox.row, ox.header, ox.vals);
      return { id: old.id, removed: true };
    }
    const meta = JSON.stringify({ of: id, date: date, kind: rec.kind, label: rec.label, reason: rec.reason });
    if (old) {   // แก้: สาเหตุ วันเริ่มฉาย ห้อง (prescription และขั้นตอนที่ MP ทำไปแล้วคงไว้)
      const set = { replan: meta, sim: rec.sim, room: rec.room || old.room };
      if (rec.mp) set.mp = rec.mp;
      return saveRow_(ox, fields, set);
    }
    // API 71: ผู้ป่วยนี้มีงานเทคนิคเดียวกันที่ยังไม่ Plan complete อยู่แล้ว (อีกเคสของ HN เดียวกัน · คนอื่นเพิ่งบันทึกจากอีกเครื่อง) = ไม่สร้างซ้ำ
    const dup = openJobs_(rows, cfg, parent.hn, parent.cat, parent.id, true);
    if (dup.length) return { id: '', dup: dup.map(c => ({ id: c.id, hn: c.hn, cat: c.cat, mp: c.mp, in: c['in'], replan: c.replan })) };
    const out = {};
    fields.forEach(f => { out[f[0]] = parent[f[0]]; });
    STAMP_FIELDS.forEach(k => { out[k] = ''; });
    Object.assign(out, {
      id: Utilities.getUuid(), how: 'replan', batch: '', note: '', replan: meta, mp: rec.mp || parent.mp,
      in: Utilities.formatDate(new Date(), tz_(ss), 'yyyy-MM-dd'), created: new Date().toISOString(), updated: '',
      sim: rec.sim, ct: rec.ct || parent.ct, room: rec.room || parent.room, dpf: rec.dpf || parent.dpf, fx: rec.fx, rx: '', area: rec.area || parent.area, sites: rec.sites,
    });
    writeFields_(sh, sh.getLastRow() + 1, header, fields, out, null);
    return out;
  });
}

/**
 * เพิ่ม fraction ต่อท้ายคอร์ส (กดที่ fraction สุดท้ายในตารางวันฉาย) ยืนยันด้วยรหัส PIN · add = { n: 1–30, reason } · null = ล้างรายการของวันนั้น
 * หนึ่งรายการต่อวัน (บันทึกวันเดิมซ้ำ = แก้) · เก็บแยกจากสถานะ fraction (วันเดียวกันบันทึกฉายแล้วได้)
 */
function addFxCase(id, date, add, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.course);
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  date = cut(date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('วันที่ไม่ถูกต้อง');
  let rec = null;
  if (add) {
    // API 58: ลบ fraction = ค่าติดลบ (−30 ถึง −1) · ตำแหน่งที่ทำได้ตาม config.fxAdj.roles (เริ่มต้น MP · แอดมินทำได้เสมอ)
    rec = { date: date, n: Math.trunc(+add.n), reason: cut(add.reason, 200) };
    if (!(rec.n >= -30 && rec.n <= 30 && rec.n)) throw new Error('จำนวน fraction ที่เพิ่ม / ลบต้องเป็น 1–30');
    if (!rec.reason) throw new Error('ใส่เหตุผลที่เพิ่ม / ลบ fraction');
  }
  const fa = (readConfig_(ss_()) || {}).fxAdj, roles = fa && Array.isArray(fa.roles) ? fa.roles.map(String) : ['MP'];
  if (u.via === 'lpch' && !u.isAdmin && roles.indexOf(String(u.role || '')) < 0) throw new Error('ตำแหน่ง ' + (u.role || '-') + ' เพิ่ม / ลบ fraction ไม่ได้ (ตั้งค่า → สถานะ fraction)');
  return caseEdit_(u, id, pin, c0 => !add || jsonList_((c0 || {}).fxadd).some(x => x && String(x.date).slice(0, 10) === date), (c0, ss) => {
    let list = jsonList_(c0.fxadd);
    list = list.filter(x => x && x.date !== date);
    if (rec) {
      rec.by = String(u.name || u.username || u.me || '');
      rec.at = Utilities.formatDate(new Date(), tz_(ss), 'yyyy-MM-dd HH:mm');
      list.push(rec);
    }
    list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return { fxadd: list.length ? JSON.stringify(list) : '' };
  });
}

/**
 * Mosaiq Time ของเคส (ช่องหน้า HN ในตารางวันฉาย) ยืนยันด้วยรหัส PIN · time = "08:30", "830", "8.30" → 08:30 · ว่าง = ล้าง
 * หน้าเว็บเรียกให้ทุกเคสของ HN เดียวกัน
 */
function timeCase(id, time, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.course);
  const s = String(time == null ? '' : time).replace(/\s/g, '');
  let text = '';
  if (s) {
    const m = s.match(/^(\d{1,2})[:.](\d{2})$/) || s.match(/^(\d{1,2})(\d{2})$/) || s.match(/^(\d{1,2})()$/);
    if (!m || +m[1] > 23 || +(m[2] || 0) > 59) throw new Error('Mosaiq Time ต้องเป็นเวลา เช่น 08:30');
    text = ('0' + +m[1]).slice(-2) + ':' + (m[2] || '00');
  }
  return caseEdit_(u, id, pin, c0 => has_((c0 || {}).mqt), () => ({ mqt: text }));
}

/**
 * แถบห้องฉาย: เพิ่มหรือแก้ผู้ป่วยที่บันทึกเข้าตารางวันฉายโดยตรง · แก้ข้อมูลผู้ป่วยของเคสที่แจกงานแล้วได้ด้วย (API 47:
 * เขียนเฉพาะช่องของผู้ป่วย ไม่แตะส่วนของ MP เช่น MP หมวด จำนวนครั้ง ขั้นตอน In วิธีแจก) · (RTT, RA, MP ที่บันทึกในแถบห้องฉายได้) ยืนยันด้วยรหัส PIN
 * ไม่แจกงานให้ MP: how = 'direct' · mp ว่าง · ไม่อยู่ในงาน งานรอ ตารางแจกเคส และสถิติการวางแผน (ผู้ป่วยที่เพิ่มใหม่)
 * rec = ช่องใน DIRECT_FIELDS และหัวข้อเพิ่มเติม (x_…) · id ที่ยังไม่มี = เพิ่มใหม่ · สถานะ fraction ฯลฯ บันทึกผ่านฟังก์ชันของช่องนั้น · คืนเคสหลังบันทึก
 */
const DIRECT_FIELDS = ['cat', 'type', 'hn', 'name', 'icd', 'dx', 'doc', 'aim', 'tech', 'room', 'dpf', 'fx', 'rx', 'freq', 'area', 'sites', 'ct', 'sim', 'note'];
function courseAdd(rec, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.course);
  rec = rec && typeof rec === 'object' ? rec : {};
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!cut(rec.hn, 40)) throw new Error('กรอก HN');
  if (!cut(rec.cat, 40)) throw new Error('เลือกเทคนิค');
  if (cut(rec.ct, 10) && !isDate(cut(rec.ct, 10))) throw new Error('วันที่ CT-Sim ไม่ถูกต้อง');
  const sim = cut(rec.sim, 10);
  if (sim && sim !== 'on call' && !isDate(sim)) throw new Error('วันที่ Start RT ไม่ถูกต้อง');
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss), fields = tableDef_('cases', cfg).fields;
    const id = cut(rec.id, 80), x = openRow_(ss, 'cases', cfg, id), row = x.row;
    pinChange_(u, pin, !!row);
    const planned = !!row && String(x.cur.how).trim() !== 'direct';
    const set = {};
    DIRECT_FIELDS.concat(fields.map(f => f[0]).filter(k => /^x_/.test(k))).forEach(k => { set[k] = cut(rec[k], k === 'sites' ? 5000 : k === 'dx' || k === 'note' ? 2000 : 200); });
    if (planned) delete set.cat;   // เคสที่แจกงาน: หมวดเป็นส่วนของ MP (แต้มและคิว)
    set.sim = sim;
    const now = new Date().toISOString();
    if (row) set.updated = now;
    else Object.assign(set, { id: id || Utilities.getUuid(), how: 'direct', mp: '', in: Utilities.formatDate(new Date(), tz_(ss), 'yyyy-MM-dd'), created: now, updated: '' });
    return saveRow_(x, fields, set);
  });
}

// ลบผู้ป่วยที่เพิ่มในแถบห้องฉาย (เฉพาะ how = 'direct') ยืนยันด้วยรหัส PIN · คืน true เมื่อลบแล้ว
function courseRemove(id, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.course);
  pinChange_(u, pin, true);
  return withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'cases', readConfig_(ss), id);
    if (!x.row) return false;
    if (String(x.cur.how).trim() !== 'direct') throw new Error('ลบได้เฉพาะผู้ป่วยที่เพิ่มในแถบห้องฉาย');
    delRow_(x.sh, x.row, x.header, x.vals);
    return true;
  });
}

/**
 * ตารางวันฉาย: นักรังสีการแพทย์ (RTT) และผู้ช่วย (RA) ที่ปฏิบัติงานในวันนั้น แยกตามห้องฉาย ยืนยันด้วยรหัส PIN
 * list = [{ room, rtt: [ชื่อ], ra: [ชื่อ], qc: [ชื่อ] }] (room ว่าง = ไม่แยกห้อง · CT:<รหัส> = เครื่อง CT ของแถบ CT-SIM) · ห้องที่ไม่มีชื่อเลย = ลบรายการของห้องนั้น · คืนรายการของวันนั้น
 */
function dutyDay(date, list, pin, token) {
  // ห้อง CT (room ขึ้นต้นด้วย CT:) = แถบ CT-SIM · ห้องฉาย = แถบห้องฉาย (บันทึกครั้งละแถบ)
  const isCt = Array.isArray(list) && list.some(x => x && /^CT:/.test(String(x.room || '')));
  const u = requireEdit_(token, isCt ? EDIT_VIEWS.ctsim : EDIT_VIEWS.course);
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  date = cut(date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('วันที่ไม่ถูกต้อง');
  if (!Array.isArray(list)) throw new Error('ไม่มีรายชื่อผู้ปฏิบัติงาน');
  const names = v => {
    const seen = {};
    return (Array.isArray(v) ? v : []).map(x => cut(x, 60).replace(/,/g, ' ').replace(/\s+/g, ' ')).filter(x => x && !seen[x] && (seen[x] = true)).slice(0, 30);
  };
  const recs = list.slice(0, 30).filter(x => x && typeof x === 'object' && /^CT:/.test(String(x.room || '')) === isCt).map(x => ({ room: cut(x.room, 40), rtt: names(x.rtt), ra: names(x.ra), qc: names(x.qc) }));
  return withLock_(() => {
    // แถวของวันนั้น (ทุกห้อง · id = วันที่|ห้อง): อ่านคอลัมน์ id ครั้งเดียว แล้วอ่านเฉพาะแถวของวันนี้ (เดิมอ่านทั้งตาราง 2 รอบ)
    const ss = ss_(), R = openRows_(ss, 'duty', null, v => v.indexOf(date + '|') === 0), sh = R.sh, header = R.header, cv = R.cv, day = R.at;
    let last = R.last;
    pinChange_(u, pin, recs.some(r => !!day[date + '|' + r.room]));
    const at = Utilities.formatDate(new Date(), tz_(ss), 'yyyy-MM-dd HH:mm'), by = String(u.name || u.username || u.me || '');
    const gone = [];
    recs.forEach(r => {
      const id = date + '|' + r.room, cur = day[id];
      if (!r.rtt.length && !r.ra.length && !r.qc.length) { if (cur) { gone.push(cur); delete day[id]; } return; }
      const set = { id: id, date: date, room: r.room, rtt: r.rtt.join(', '), ra: r.ra.join(', '), qc: r.qc.join(', '), by: by, at: at };
      if (cur) cur.vals = writeFields_(sh, cur.row, header, TABLES.duty.fields, set, cur.vals);
      else { last += 1; day[id] = { row: last, vals: writeFields_(sh, last, header, TABLES.duty.fields, set, null) }; }
    });
    gone.sort((a, b) => b.row - a.row).forEach(g => delRow_(sh, g.row, header, g.vals));   // ลบจากล่างขึ้นบน (เลขแถวของที่เหลือไม่เลื่อน)
    return Object.keys(day).map(k => cv.conv(day[k].vals)).filter(x => x.date === date);
  });
}

// ผู้ปฏิบัติงานที่ส่งให้หน้าเว็บ: ตั้งแต่ 1 ปีก่อน (ตารางย้อนหลังเกินนั้นไม่ค่อยได้ดู)
function recentDuty_(ss) {
  const from = Utilities.formatDate(new Date(Date.now() - 366 * 864e5), tz_(ss), 'yyyy-MM-dd');
  return readTable_(ss, 'duty').filter(x => String(x.date) >= from);
}

/**
 * แถบ CT-SIM: เพิ่มหรือแก้ผู้ป่วยที่ทำ CT จำลองการฉาย (RTT / RA / MP ที่บันทึกในแถบ CT-SIM ได้) ยืนยันด้วยรหัส PIN
 * rec = ช่องใน CT_FIELDS (ct = รหัสเครื่อง CT, date = วันที่ทำ CT, ข้อมูลแบบฟอร์มแจกเคส, อุปกรณ์ในห้อง CT, send = 'yes' ส่งให้แถบงาน)
 * id ที่ยังไม่มี = เพิ่มใหม่ · สถานะการแจกเคส (took) เปลี่ยนได้ทาง ctMark / addCases เท่านั้น · คืนรายการหลังบันทึก
 */
const CT_FIELDS = ['ct', 'date', 'hn', 'name', 'organ', 'mask', 'bite', 'cm', 'coil', 'ydev', 'inj', 'nss', 'syr', 'doc', 'pstat', 'hdr', 'crad', 'note', 'research',
  'cats', 'type', 'aim', 'room', 'tech', 'area', 'dpf', 'fx', 'rx', 'freq', 'sim', 'icd', 'dx', 'extra', 'ctcm', 'special', 'send'];
function ctSave(rec, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.ctsim);
  rec = rec && typeof rec === 'object' ? rec : {};
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!cut(rec.hn, 40)) throw new Error('กรอก HN');
  if (!cut(rec.ct, 20)) throw new Error('เลือกเครื่อง CT');
  if (!isDate(cut(rec.date, 10))) throw new Error('วันที่ทำ CT ไม่ถูกต้อง');
  const sim = cut(rec.sim, 10);
  if (sim && sim !== 'on call' && !isDate(sim)) throw new Error('วันที่ Start RT ไม่ถูกต้อง');
  return withLock_(() => {
    const ss = ss_(), id = cut(rec.id, 80), x = openRow_(ss, 'ctsim', null, id), row = x.row;
    pinChange_(u, pin, !!row);
    const set = {};
    CT_FIELDS.forEach(k => { set[k] = cut(rec[k], k === 'extra' ? 4000 : k === 'note' || k === 'dx' ? 2000 : 200); });
    set.send = set.send ? 'yes' : '';
    const now = new Date().toISOString();
    if (row) set.updated = now;
    else Object.assign(set, { id: id || Utilities.getUuid(), by: String(u.name || u.username || u.me || ''), created: now, updated: '' });
    // ลงจากนัดในแถบลงนัด (apptFrom = id ของนัด เฉพาะรายการใหม่): บันทึกว่านัดนี้ลง CT-SIM แล้ว ใครลง · อ่านแถวของนัดก่อนเขียน (อ่านหลังเขียน = ชีตต้องบันทึกค้างก่อน)
    let from = row ? '' : cut(rec.apptFrom, 80);
    // API 99: เพิ่มเอง (ไม่ได้ลงจากนัด) และไม่ใช่ CT ของ HDR / งานวิจัย: HN นี้มีนัดรอลง CT-SIM = ผูกกับนัดล่าสุดนั้น (นัดไม่ค้างรอทำ CT) · '-' = ผู้ใช้กดไม่ผูก
    let auto = '';
    if (!row && !from && !set.hdr && !set.research) {
      const open = rowsOfHn_(ss, 'appt', set.hn).filter(p => !String(p.took || '').trim());
      if (open.length) auto = from = String(open.reduce((p, q) => (String(q.created) > String(p.created) ? q : p)).id);
    }
    if (from === '-') from = '';
    const a = from ? openRow_(ss, 'appt', null, from) : null;
    const out = saveRow_(x, TABLES.ctsim.fields, set);   // รายการหลังบันทึกจากค่าที่เขียน (เดิมอ่านทั้งตาราง CT-SIM กลับมา)
    // API 85: ผูกเฉพาะนัดที่ HN ตรงกับรายการนี้และยังไม่ได้ลง CT-SIM (เดิมผูกทุกกรณี: ใช้ข้อมูลนัดของคนหนึ่งแล้วแก้ HN เป็นอีกคน = นัดถูกผูกผิดคน)
    if (from && a.row && hnKey_(a.cur.hn) === hnKey_(set.hn) && !String(a.cur.took || '').trim()) {
      const mark = { took: set.id, tookBy: set.by, tookAt: Utilities.formatDate(new Date(), tz_(ss), 'yyyy-MM-dd HH:mm') };
      writeFields_(a.sh, a.row, a.header, TABLES.appt.fields.filter(f => f[0] in mark), mark, a.vals);
      if (auto) out.apLinked = auto;
    }
    // Vac-Lok ที่เลือกในฟอร์ม (API 48 · ไม่ส่ง vac = ไม่แตะ): ผูกการใช้ Vac-Lok กับรายการนี้ · ว่าง = ไม่ใช้ (ลบการใช้ที่ผูกไว้) · คืนการใช้ทั้งหมด
    if ('vac' in rec) { vacLink_(ss, out, cut(rec.vac, 20), u); out.vacAll = readTable_(ss, 'vac'); }
    return out;
  });
}

// ลบผู้ป่วยในแถบ CT-SIM ยืนยันด้วยรหัส PIN (เคสที่ MP แจกไปแล้วไม่ถูกลบ) · นัดที่ลงเป็นรายการนี้กลับไปรอลง CT-SIM · คืน true เมื่อลบแล้ว
function ctRemove(id, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.ctsim);
  pinChange_(u, pin, true);
  return withLock_(() => {
    const ss = ss_(), sh = tableSheet_(ss, 'ctsim'), ch = headerOf_(sh), row = findRow_(sh, ch.indexOf('id') + 1, id);
    if (row) delRow_(sh, row, ch);
    if (row && id) vacUnlink_(ss, id);
    if (row && id) {
      const as = sheet_(ss, TABLES.appt.sheet);
      if (as) markDirty_('appt');
      if (as) {
        const clear = { took: '', tookBy: '', tookAt: '' };
        readCols_(ss, 'appt', null, ['took']).filter(a => a.took === id).forEach(a => {   // เฉพาะคอลัมน์ id + ลง CT-SIM แล้ว
          const y = openRow_(ss, 'appt', null, a.id);
          if (y.row) writeFields_(y.sh, y.row, y.header, TABLES.appt.fields.filter(f => f[0] in clear), clear, y.vals);
        });
      }
    }
    return !!row;
  });
}

// แถบงาน: รายการจาก CT-SIM ที่ไม่ต้องแจกเคส · mark = 'skip' (เฉพาะที่ยังไม่แจก) หรือ '' (คืนกลับเป็นรอแจก: ที่ตั้งไม่ต้องแจกไว้
// หรือเคสที่แจกจากรายการนี้ถูกลบหมดแล้ว เช่นกดเลิกทำ) · คืนรายการ
function ctMark(id, mark, token) {
  const u = requireEdit_(token, ['work']);
  mark = mark === 'skip' ? 'skip' : '';
  return withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'ctsim', null, id);
    if (!x.row) throw new Error('ไม่พบรายการนี้ใน CT-SIM (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const took = String(x.cur.took || '').trim();
    const gone = !mark && took && took !== 'skip' && (() => { const ids = readCols_(ss, 'cases', null, []).map(c => c.id); return took.split(',').every(v => ids.indexOf(v.trim()) < 0); })();
    if (mark ? took : took !== 'skip' && !gone) throw new Error(took === 'skip' ? 'รายการนี้ตั้งไม่ต้องแจกไว้แล้ว' : took ? 'รายการนี้แจกเคสไปแล้ว' : 'รายการนี้ยังรอแจกเคสอยู่');
    const set = mark ? { took: 'skip', tookBy: String(u.name || u.username || u.me || ''), tookAt: Utilities.formatDate(new Date(), tz_(ss), 'yyyy-MM-dd HH:mm') } : { took: '', tookBy: '', tookAt: '', cnAct: '', cnNote: '' };   // API 121: คืนกลับรอแจก = ล้าง Re-CT / Cancel ของ Contouring
    const s0 = x.cur.sim, sim0 = s0 instanceof Date ? Utilities.formatDate(s0, tz_(ss), 'yyyy-MM-dd') : String(s0 || '').trim(), back = !mark && String(x.cur.cnAct || '') === 'cancel' && sim0;
    const out = saveRow_(x, TABLES.ctsim.fields, set);
    if (back) out.apSim = ctApSim_(ss, out.id, sim0);   // คืนกลับรอแจกหลัง Cancel Treatment = คืนนัด Start RT
    return out;
  });
}

// API 117 (23 พ.ย.): แถบแจกงานฟิสิกส์ "บันทึกไว้ก่อน" = เก็บค่าที่แก้ในฟอร์มแจกเคสลงรายการ CT-SIM ที่ยังรอแจก (ยังไม่แจกให้ MP)
// เช่นเลื่อนนัด Start RT ระหว่างแพทย์ทำ contouring · เฉพาะช่องของการแจกเคส (ไม่แตะเครื่อง CT วันทำ CT และข้อมูลห้อง CT)
// Start RT เปลี่ยน = นัด (CT Order) ที่ลง CT-SIM เป็นรายการนี้เปลี่ยน Start RT ตาม · ส่งเฉพาะช่องที่มีในฟอร์ม (ช่องที่ไม่ส่ง = คงเดิม)
const CT_DRAFT_KEYS = ['name', 'doc', 'cats', 'type', 'aim', 'room', 'tech', 'area', 'dpf', 'fx', 'rx', 'freq', 'sim', 'icd', 'dx', 'extra', 'note'];
function ctDraft(id, rec, token) {
  requireEdit_(token, ['work']);
  rec = rec && typeof rec === 'object' ? rec : {};
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const sim = cut(rec.sim, 10);
  if ('sim' in rec && sim && sim !== 'on call' && !/^\d{4}-\d{2}-\d{2}$/.test(sim)) throw new Error('วันที่ Start RT ไม่ถูกต้อง');
  return withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'ctsim', null, cut(id, 80));
    if (!x.row) throw new Error('ไม่พบรายการนี้ใน CT-SIM (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const took = String(x.cur.took || '').trim();
    if (took) throw new Error(took === 'skip' ? 'รายการนี้ตั้ง ไม่ต้องแจก ไว้ · กด คืนกลับรอแจก ก่อน' : 'รายการนี้แจกเคสไปแล้ว · แก้ที่เคสในแถบ Planning');
    const set = {};
    CT_DRAFT_KEYS.forEach(k => { if (k in rec) set[k] = cut(rec[k], k === 'extra' ? 4000 : k === 'note' || k === 'dx' ? 2000 : 200); });
    if ('doc' in set) set.doc = set.doc.toUpperCase();
    if ('name' in set && !set.name) delete set.name;
    set.updated = new Date().toISOString();
    const out = saveRow_(x, TABLES.ctsim.fields, set);
    if ('sim' in set) {   // นัดที่ลงเป็นรายการนี้: Start RT ตาม
      const links = readCols_(ss, 'appt', null, ['took', 'sim']).filter(a => String(a.took || '') === String(out.id) && String(a.sim || '') !== set.sim);
      if (links.length) markDirty_('appt');
      links.forEach(a => {
        const y = openRow_(ss, 'appt', null, a.id);
        if (y.row) writeFields_(y.sh, y.row, y.header, TABLES.appt.fields.filter(f => f[0] === 'sim'), { sim: set.sim }, y.vals);
      });
      out.apSim = links.map(a => String(a.id));
    }
    return out;
  });
}

// API 118 (23 พ.ย.): แถบ Contouring · ผู้ป่วยที่ทำ CT-Sim แล้ว รอแจกงานฟิสิกส์ = แพทย์กำลัง contour · on = Contour เสร็จ (เวลา · ผู้กด) / ยกเลิก
// เฉพาะรายการที่ยังรอแจก (แจกแล้ว / ไม่ต้องแจก = หายจากแถบนี้) · ตอนนี้ไม่บังคับ: ฟิสิกส์ดึงไปแจกงานได้ตามเดิม
function ctContour(id, on, token) {
  const u = requireEdit_(token, ['contour']);
  return withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'ctsim', null, String(id == null ? '' : id).trim().slice(0, 80));
    if (!x.row) throw new Error('ไม่พบรายการนี้ใน CT-SIM (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    if (String(x.cur.took || '').trim()) throw new Error('รายการนี้แจกงานฟิสิกส์ไปแล้ว');
    if (on && !String(x.cur.hdr || '').trim()) {   // API 146: Treatment Order · แพทย์ลงนาม Rx ก่อน
      const o = openRow_(ss, 'txo', null, String(x.cur.id));
      if (!o.row || !String((o.cur || {}).rxAt || '')) throw new Error('ต้องลงนาม Rx ใน Treatment Order ก่อนกด Contour เสร็จ');
    }
    const set = on ? { cdone: new Date().toISOString(), cdBy: String(u.name || u.username || u.me || '') } : { cdone: '', cdBy: '' };
    return saveRow_(x, TABLES.ctsim.fields, set);
  });
}

// API 121 (23 พ.ย.): แถบ Contouring · Re-CT / Cancel Treatment = รายการที่ยังรอแจกงานฟิสิกส์ → ไม่ต้องแจก (ออกจาก Contouring / ดึงจาก CT-SIM)
// cancel ต้องมีสาเหตุ · คืนกลับรอแจกได้ที่แจกงานฟิสิกส์ → ดึงจาก CT-SIM (ctMark ว่าง)
// นัด (CT Order) ที่ลง CT-SIM เป็นรายการนี้: ตั้ง Start RT (ว่าง = ยกเลิกนัด · ค่า = คืนนัดเฉพาะที่ว่างอยู่) · คืน id ของนัดที่เปลี่ยน
function ctApSim_(ss, ctId, sim) {
  const links = readCols_(ss, 'appt', null, ['took', 'sim']).filter(a => String(a.took || '') === String(ctId) && (sim ? !String(a.sim || '') : !!String(a.sim || '')));
  if (links.length) markDirty_('appt');
  links.forEach(a => { const y = openRow_(ss, 'appt', null, a.id); if (y.row) writeFields_(y.sh, y.row, y.header, TABLES.appt.fields.filter(f => f[0] === 'sim'), { sim: sim }, y.vals); });
  return links.map(a => String(a.id));
}
/**
 * API 136: แถบ Evaluation · แผนที่ Planning กด Finish แล้ว รอแพทย์ประเมิน · sid = Plan 2…n / Sequential boost (ว่าง = แผนแรก)
 * act ok = Approved (บันทึก Evaluate ชื่อคนกด · เวลานี้ · มีหมายเหตุ = ส่งข้อความถึง MP ด้วย) · edit = ส่งกลับไปวางแผนเดิม: ล้าง Finish ของแผนนั้น (งานเดิม ไม่สร้างงานใหม่ ไม่เพิ่มคะแนน)
 * พร้อมหมายเหตุ (บังคับ) และข้อความส่วนตัวถึง MP ของงาน (บัญชีที่เชื่อมในตั้งค่า → ทีม) · undo = ยกเลิก Approved ที่ตัวเองกด
 * บันทึกใหม่ไม่ต้องใส่ PIN (กติกาเดียวกับทุกแถบ) · คืน { rec: เคสหลังบันทึก, msg: บัญชี MP ที่ส่งข้อความ ('' = ไม่ได้ส่ง) }
 */
function evalAct(id, sid, act, note, token) {
  const u = requireEdit_(token, ['evaluate']);
  sid = String(sid == null ? '' : sid).trim();
  if (sid && !/^[\w-]{1,40}$/.test(sid)) throw new Error('ไม่พบแผนนี้');
  act = String(act || '');
  if (['ok', 'edit', 'undo'].indexOf(act) < 0) throw new Error('ไม่รู้จักคำสั่ง');
  note = String(note == null ? '' : note).replace(/\s+/g, ' ').trim().slice(0, 300);
  if (act === 'edit' && !note) throw new Error('กรอกหมายเหตุสิ่งที่ให้แก้ก่อนส่งกลับ');
  const name = String(u.name || u.username || u.me || '');
  const boostOf = c0 => { try { const a = JSON.parse(String((c0 && c0.bsteps) || '{}')); return a && typeof a === 'object' && !Array.isArray(a) ? a : {}; } catch (e) { return {}; } };
  const rec = caseEdit_(u, id, '', () => false, (c0, ss) => {
    const all = boostOf(c0), cur = sid ? (all[sid] && typeof all[sid] === 'object' ? all[sid] : {}) : c0;
    if (sid && !all[sid] && act !== 'ok') throw new Error('แผนนี้ยังไม่ได้ Finish');
    const now = stampTime_('', tz_(ss)), set = {}, put = {};
    if (act === 'ok') {
      if (!has_(cur.fin)) throw new Error('แผนนี้ยังไม่ได้ Finish (Planning อาจกำลังแก้แผน) โหลดหน้าใหม่แล้วลองอีกครั้ง');
      if (has_(cur.eval)) throw new Error('แผนนี้ Evaluate แล้ว (' + String(cur.evalBy || '-') + ' ' + String(cur.eval) + ')');
      put.eval = now; put.evalBy = name;
    } else if (act === 'edit') {
      if (!has_(cur.fin)) throw new Error('แผนนี้ส่งกลับไปแก้แล้ว หรือยังไม่ได้ Finish');
      if (has_(cur.eval)) throw new Error('แผนนี้ Evaluate แล้ว ส่งกลับจากแถบนี้ไม่ได้ (ใช้ ส่งแก้แผน ในหน้าแก้ไขเคส)');
      put.fin = ''; put.finBy = ''; put.eval = ''; put.evalBy = '';
    } else {
      if (!has_(cur.eval)) throw new Error('แผนนี้ยังไม่ได้ Approved');
      if (String(cur.evalBy || '') !== name) throw new Error('ยกเลิกได้เฉพาะ Approved ที่คุณกดเอง');
      put.eval = ''; put.evalBy = '';
    }
    if (sid) {
      const x = Object.assign({}, cur, put);
      Object.keys(x).forEach(k => { if (x[k] === '') delete x[k]; });
      if (Object.keys(x).length) all[sid] = x; else delete all[sid];
      set.bsteps = Object.keys(all).length ? JSON.stringify(all) : '';
    } else Object.assign(set, put);
    const hist = jsonList_(c0.evNote).filter(x => x && typeof x === 'object');
    hist.push({ at: now, by: name, act: act, note: note, sid: sid });
    set.evNote = JSON.stringify(hist.slice(-30));
    return set;
  });
  let msg = '';
  if ((act === 'edit' || (act === 'ok' && note)) && rec) { try { msg = evalMsg_(readConfig_(ss_()) || {}, name, rec, sid, note, act); } catch (e) { console.log('evalMsg ' + e); } }   // หลังปล่อยล็อก · Approved พร้อมหมายเหตุ = ข้อความถึง MP ด้วย
  return { rec: rec, msg: msg };
}
// API 136: ข้อความส่วนตัวถึง MP ของงานเมื่อแพทย์ส่งกลับให้แก้แผน (ไม่ใส่ชื่อผู้ป่วย: มีสำเนาอีเมล) · คืนบัญชีที่ส่ง ('' = MP ยังไม่ได้เชื่อมบัญชี)
function evalMsg_(cfg, who, c, sid, note, act) {
  const s = (Array.isArray(cfg.staff) ? cfg.staff : []).filter(x => x && String(x.code || '').trim().toUpperCase() === String(c.mp || '').trim().toUpperCase())[0];
  const acc = s ? String(s.user || '').trim().toLowerCase() : '';
  if (!acc || !/^[a-z0-9._@+-]+$/.test(acc)) return '';
  const plan = sid ? (/^p\d+$/.test(sid) ? 'Plan ' + sid.slice(1) : 'Boost') : '';
  const ok = act === 'ok', text = 'HN ' + c.hn + (plan ? ' · ' + plan : '') + ' · แพทย์ ' + (c.doc || '-') + (ok ? ' Approved แผน · หมายเหตุ: ' : ' ให้แก้แผน: ') + note + ' · ' + who;
  inboxPost_(cfg, { acc: '', name: 'Evaluation · ' + who }, [{ acc: acc, name: String(s.name || s.code || acc) }], 'msg', ok ? 'แพทย์ Approved แผน (มีหมายเหตุ)' : 'แพทย์ให้แก้แผน (Evaluation)', text, 'ev|' + c.id + '|' + sid, (cfg.msg || {}).mail !== false, []);
  return acc;
}

function ctContourAct(id, act, note, token) {
  const u = requireEdit_(token, ['contour']);
  act = act === 'rect' || act === 'cancel' ? act : '';
  if (!act) throw new Error('ไม่รู้จักคำสั่ง');
  note = String(note == null ? '' : note).trim().slice(0, 300);
  if (act === 'cancel' && !note) throw new Error('ใส่สาเหตุที่ Cancel Treatment');
  return withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'ctsim', null, String(id == null ? '' : id).trim().slice(0, 80));
    if (!x.row) throw new Error('ไม่พบรายการนี้ใน CT-SIM (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    if (String(x.cur.took || '').trim()) throw new Error('รายการนี้แจกงานฟิสิกส์ไปแล้ว หรือตั้งไม่ต้องแจกไว้แล้ว');
    const who = String(u.name || u.username || u.me || '');
    const set = { took: 'skip', tookBy: who + ' · ' + (act === 'rect' ? 'Re-CT' : 'Cancel Treatment'), tookAt: Utilities.formatDate(new Date(), tz_(ss), 'yyyy-MM-dd HH:mm'), cnAct: act, cnNote: note };
    const out = saveRow_(x, TABLES.ctsim.fields, set);
    if (act === 'cancel') out.apSim = ctApSim_(ss, out.id, '');   // ยกเลิกนัด: Start RT ของนัดที่ลง CT-SIM เป็นรายการนี้ = ว่าง
    return out;
  });
}

// รายการ CT-SIM ที่ส่งให้หน้าเว็บ: ตั้งแต่ 13 เดือนก่อน (ส่งออก Excel รายเดือนย้อนหลังได้ 1 ปี)
// API 146: Treatment Order ของรายการ CT-SIM ภายใน 400 วัน (เท่ารายการ CT-SIM ที่ส่ง)
function recentTxo_(ss) {
  const from = Utilities.formatDate(new Date(Date.now() - 400 * 864e5), tz_(ss), 'yyyy-MM-dd');
  return readTable_(ss, 'txo').filter(x => !String(x.ctDate || '') || String(x.ctDate) >= from);
}
function recentCt_(ss) {
  const from = Utilities.formatDate(new Date(Date.now() - 400 * 864e5), tz_(ss), 'yyyy-MM-dd');
  return readTable_(ss, 'ctsim').filter(x => String(x.date) >= from);
}

/**
 * แถบนัดคิวใส่แร่: ลงนัดหนึ่งคอร์ส (หลาย Fraction · หนึ่งแถวต่อหนึ่ง Fx) ยืนยันด้วยรหัส PIN (ตั้งค่า → รหัส PIN: นัดคิวใส่แร่)
 * p = { hn, name, doc, tech, note, rtt, dates: [วันที่ของ Fx 1, 2, …] } · ต้องมี HN ชื่อ-สกุล รูปแบบการใส่ · 1–30 Fx · คืนนัดทั้งคอร์ส
 * จำนวนเคสต่อวันและ HN ซ้ำวันเดียวกัน หน้าเว็บเตือนก่อนลงนัด (ลงต่อได้เหมือนระบบนัดคิวใส่แร่เดิม)
 */
const BQ_BOOKED = 'นัดแล้ว';
const BQ_PP = 'เลื่อนนัดไม่มีกำหนด';   // API 92 · เลื่อนไปก่อนยังไม่ลงวัน = ไม่นับเคส ไม่นับคะแนน (เหมือนยกเลิก) จนกว่าจะลงวันนัดใหม่ (bqMove)
const BQ_NOSHOW = 'ไม่มา';   // API 50 · ผู้ป่วยไม่มาตามนัด = ไม่นับเคส ไม่นับคะแนน (MP, RC และอื่น ๆ) เหมือนยกเลิก
const BQ_EDIT = ['date', 'doc', 'tech', 'note', 'status', 'rtt', 'mp', 'rc', 'ct', 'ctRoom', 'us'];
// CT ของนัดใส่แร่ (API 46): ct = CT / Re-CT · ctRoom = รหัสเครื่อง CT ที่ทำ (นับคะแนนห้อง CT ในแถบ RTT/RA Jobs) · us = US (Ultrasound)
const BQ_CT = ['', 'CT', 'Re-CT1', 'Re-CT2', 'Re-CT'];   // API 53: CT / Re-CT1 / Re-CT2 (Re-CT = นัดที่บันทึกก่อนหน้า)
// API 55: CT หลายรอบในนัดเดียว (แต่ละรอบ +1 คะแนนห้อง CT) · ct = "CT, Re-CT1" · ctRoom = ห้องตามลำดับเดียวกัน "ct1, ct2" (นัดเดิม = ค่าเดียว)
function bqCtPairs_(ct, room) {
  const r = String(room == null ? '' : room).split(',').map(x => x.trim());
  return String(ct == null ? '' : ct).split(',').map(x => x.trim()).filter(Boolean).map((t, i) => ({ t: t, room: r[i] || '' }));
}
const bqWho_ = u => String(u.name || u.username || u.me || '');
const bqCut_ = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
// API 75: ตำแหน่งที่กดแต่ละปุ่มของแถบนัดคิวใส่แร่ได้ (ตั้งค่า → นัดคิวใส่แร่ → สิทธิ์ของปุ่ม · config.bq.btn) · ว่าง = ทุกตำแหน่งที่บันทึกในแถบได้
// ไม่เคยตั้ง = ค่าเริ่มต้น (ตรวจสอบแล้ว = Nurse · MP / RC = MP, RTT เหมือนเดิม) · แอดมินและบัญชี Google กดได้ทุกปุ่ม
const BQ_BTN_DEF = { chk: ['Nurse'], come: ['RTT', 'MP'], rtt: [], ct: [], us: [], mp: ['MP', 'RTT'], rc: ['MP', 'RTT'] };
const BQ_BTN_NAME = { chk: 'ตรวจสอบแล้ว', come: 'มาแล้ว / ไม่มา', rtt: 'RTT', ct: 'CT', us: 'US', mp: 'MP', rc: 'RC' };
function bqBtnRoles_(cfg, k) {
  const b = cfg && cfg.bq && cfg.bq.btn && typeof cfg.bq.btn === 'object' ? cfg.bq.btn : null;
  const r = b && Array.isArray(b[k]) ? b[k].map(String) : BQ_BTN_DEF[k] || [];
  // API 149: ตั้งค่าเดิมที่ยังไม่เคยแยกสิทธิ์ ตรวจสอบแล้ว / มาแล้ว-ไม่มา (ว่าง และไม่มี btn73) = ค่าเริ่มต้น · เหมือนหน้าเว็บ .73
  return !r.length && (k === 'chk' || k === 'come') && !(cfg && cfg.bq && cfg.bq.btn73) ? BQ_BTN_DEF[k].slice() : r;
}
function bqBtnOk_(u, cfg, k) {
  if (!u || u.via === 'google' || u.isAdmin) return true;
  const roles = bqBtnRoles_(cfg, k);
  return !roles.length || roles.map(r => r.toUpperCase()).indexOf(String(u.role || '').toUpperCase()) >= 0;
}
const bqBtnMsg_ = (u, k) => 'ตำแหน่ง ' + ((u && u.role) || '-') + ' กดปุ่ม ' + BQ_BTN_NAME[k] + ' ไม่ได้ (ตั้งค่า → นัดคิวใส่แร่ → สิทธิ์ของปุ่ม)';
// ช่องที่แก้ → ปุ่มที่ต้องมีสิทธิ์ (สถานะ มาตามนัด / ไม่มา = ปุ่ม มาแล้ว / ไม่มา · ยกเลิก / กลับเป็นนัดแล้ว = สิทธิ์แก้นัดทั่วไป)
const bqBtnOf_ = (k, set) => (k === 'status' ? (set.status === BRACHY_ST_DONE || set.status === BQ_NOSHOW ? 'come' : '') : k === 'ctRoom' ? 'ct' : ['rtt', 'ct', 'us', 'mp', 'rc'].indexOf(k) >= 0 ? k : '');
/**
 * API 75: ปุ่ม "ตรวจสอบแล้ว" (หลังคอลัมน์สถานะ) · on = true บันทึก (ไม่ต้องใส่ PIN) · false = เอาออก (แก้ = ใส่ PIN)
 * ผู้ที่เห็นแถบนัดคิวใส่แร่ได้ (ดูอย่างเดียวก็ได้) และตำแหน่งอยู่ในสิทธิ์ของปุ่ม (ค่าเริ่มต้น Nurse) · คืนนัดหลังบันทึก
 */
function bqCheck(id, on, pin, token) {
  const ss = ss_(), cfg = readConfig_(ss) || {}, u = who_(token, ss, cfg);
  if (u.via !== 'google' && !userAccess_(cfg, 'bq', u)) throw new Error('ตำแหน่ง ' + (u.role || '-') + ' ไม่มีสิทธิ์ในแถบนัดคิวใส่แร่');
  if (!bqBtnOk_(u, cfg, 'chk')) throw new Error(bqBtnMsg_(u, 'chk'));
  on = on === true || on === 'true' || on === 1;
  return withLock_(() => {
    const x = openRow_(ss, 'bq', null, String(id || '')), cur = x.cur;
    if (!x.row) throw new Error('ไม่พบนัดนี้ (อาจถูกเปลี่ยนไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    if (on ? has_(cur.chk) : !has_(cur.chk)) return cur;   // เป็นอยู่แล้ว (กดซ้ำ / สองเครื่อง)
    if (on && cur.status === BRACHY_ST_CANCEL) throw new Error('นัดนี้ยกเลิกแล้ว');
    pinChange_(u, pin, !on);   // เอาออก = แก้ของที่บันทึกไว้
    const by = bqWho_(u), now = Utilities.formatDate(new Date(), tz_(ss), 'yyyy-MM-dd HH:mm');
    return saveRow_(x, TABLES.bq.fields, { chk: on ? now : '', chkBy: on ? by : '', updated: new Date().toISOString(), editedBy: by,
      hist: bqHist_(cur.hist, u, [{ f: 'chk', from: has_(cur.chk) ? 'ตรวจสอบแล้ว' : '', to: on ? 'ตรวจสอบแล้ว' : '' }]) });
  });
}
// เขียนหลายแถวต่อท้ายชีตในครั้งเดียว (ข้อความล้วน)
function bqAppend_(sh, header, recs) {
  if (!recs.length) return;
  const cols = header.map(h => TABLES.bq.fields.filter(f => f[1] === h)[0]);
  sh.getRange(sh.getLastRow() + 1, 1, recs.length, header.length).setNumberFormat('@')
    .setValues(recs.map(rec => cols.map(f => (f ? safeText_(rec[f[0]]) : ''))));
}
// API 144: ห้องตรวจ → ระหว่างฉาย ปุ่ม HDR = ลงนัดใส่แร่ (src ontx) · ตำแหน่งที่บันทึกได้ในแถบห้องตรวจลงได้ · ยกเลิกได้เฉพาะนัดที่ลงจากห้องตรวจ (ไม่มีสิทธิ์แถบนัดคิวใส่แร่)
const BQ_ONTX = 'ontx';
function bqCreate(p, pin, token) {
  const ontx = !!(p && typeof p === 'object' && p.src === BQ_ONTX);
  const u = requireEdit_(token, ontx ? EDIT_VIEWS.bq.concat(['consult']) : EDIT_VIEWS.bq);
  p = p && typeof p === 'object' ? p : {};
  const hn = bqCut_(p.hn, 40), name = bqCut_(p.name, 200), tech = bqCut_(p.tech, 100);
  const dates = (Array.isArray(p.dates) ? p.dates : []).map(d => bqCut_(d, 10));
  if (!hn) throw new Error('กรอก HN');
  if (!name) throw new Error('กรอกชื่อ-สกุลผู้ป่วย');
  if (!tech) throw new Error('เลือกรูปแบบการใส่');
  if (!dates.length || dates.length > 30) throw new Error('จำนวน Fraction ต้องอยู่ระหว่าง 1–30');
  if (dates.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d))) throw new Error('วันนัดไม่ถูกต้อง');

  const course = 'BT' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  const made = withLock_(() => {
    const ss = ss_(), sh = tableSheet_(ss, 'bq'), header = headerOf_(sh), now = new Date().toISOString(), sorted = dates.slice().sort();
    const recs = sorted.map((d, i) => ({ id: Utilities.getUuid(), course: course, date: d, hn: hn, name: name, doc: bqCut_(p.doc, 200), tech: tech,
      fx: String(i + 1), total: String(sorted.length), note: bqCut_(p.note, 2000), status: BQ_BOOKED, rtt: bqCut_(p.rtt, 100), mp: '', rc: '', hist: '', src: ontx ? BQ_ONTX : '', by: bqWho_(u), created: now, editedBy: '', updated: '' }));
    bqAppend_(sh, header, recs);
    recs.forEach(rec => auditAdd_('bq', rec, TABLES.bq.fields));
    // นัดที่เพิ่งลง ในรูปเดียวกับที่อ่านจากชีต (เดิมอ่านทั้งตารางนัดกลับมา)
    const cv = rowConv_(TABLES.bq, header, tz_(ss)), cols = header.map(h => TABLES.bq.fields.filter(f => f[1] === h)[0]);
    return recs.map(rec => cv.conv(cols.map(f => (f ? safeText_(rec[f[0]]) : ''))));
  });
  bqStats_();
  return made;
}

// แก้นัดหนึ่ง Fx: วันที่ แพทย์ รูปแบบการใส่ หมายเหตุ สถานะ (นัดแล้ว / มาตามนัด / ยกเลิก) RTT MP RC (RTT ลงได้ทุกคนที่บันทึกแถบนี้ได้) · เก็บประวัติ (ใคร เมื่อไร อะไรเปลี่ยน) · คืนนัดหลังแก้
function bqEdit(id, ch, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.bq);
  ch = ch && typeof ch === 'object' ? ch : {};
  const set = {};
  BQ_EDIT.forEach(k => { if (k in ch) set[k] = bqCut_(ch[k], k === 'note' ? 2000 : 200); });
  if ('date' in set && !/^\d{4}-\d{2}-\d{2}$/.test(set.date)) throw new Error('วันที่นัดไม่ถูกต้อง');
  if ('status' in set && [BQ_BOOKED, BRACHY_ST_DONE, BQ_NOSHOW, BRACHY_ST_CANCEL, BQ_PP].indexOf(set.status) < 0) throw new Error('สถานะไม่ถูกต้อง');
  if ('tech' in set && !set.tech) throw new Error('เลือกรูปแบบการใส่');
  if ('us' in set && ['', 'US'].indexOf(set.us) < 0) throw new Error('Ultrasound ไม่ถูกต้อง');
  const cfg = readConfig_(ss_()) || {};
  const rec = withLock_(() => {
  // แถวของนัดนี้อ่านครั้งเดียวภายใต้ล็อก (เดิมอ่านทั้งตารางนัด 3 รอบ: ก่อนล็อก ในล็อก และตอนคืนค่า)
  const ss = ss_(), x = openRow_(ss, 'bq', null, id), cur0 = x.cur || {};
  if ('ct' in set || 'ctRoom' in set) {   // CT แต่ละรอบต้องมีห้อง · ไม่ซ้ำชนิด · ไม่ได้ทำ CT (ว่าง) = ไม่มีห้อง
    const pairs = bqCtPairs_('ct' in set ? set.ct : cur0.ct, 'ctRoom' in set ? set.ctRoom : cur0.ctRoom);
    if (pairs.some(p => BQ_CT.indexOf(p.t) < 1)) throw new Error('CT ต้องเป็น CT, Re-CT1 หรือ Re-CT2');
    if (pairs.some((p, i) => pairs.findIndex(q => q.t === p.t) !== i)) throw new Error('CT ชนิดเดียวกันซ้ำในนัดเดียวกัน');
    if (pairs.some(p => !p.room)) throw new Error('เลือกห้อง CT ที่ทำ');
    if (pairs.some(p => !/^[\w-]{1,20}$/.test(p.room))) throw new Error('ห้อง CT ไม่ถูกต้อง');
    set.ct = pairs.map(p => p.t).join(', ');
    set.ctRoom = pairs.map(p => p.room).join(', ');
  }
  // CT: เพิ่มรอบใหม่ = บันทึกใหม่ (ไม่ต้องใส่ PIN) · เอารอบที่บันทึกไว้ออกหรือเปลี่ยนห้อง = แก้
  const ctKept = () => { const now = bqCtPairs_(set.ct, set.ctRoom); return bqCtPairs_(cur0.ct, cur0.ctRoom).every(p => now.some(q => q.t === p.t && q.room === p.room)); };
  pinChange_(u, pin, Object.keys(set).some(k => String(cur0[k] || '') !== set[k] && (k === 'status' ? !(cur0.status === BQ_BOOKED && (set.status === BRACHY_ST_DONE || set.status === BQ_NOSHOW)) : k === 'ct' || k === 'ctRoom' ? !ctKept() : has_(cur0[k]))));
    if (!x.row) throw new Error('ไม่พบนัดนี้ (อาจถูกเปลี่ยนไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const cur = x.cur;
    const diff = Object.keys(set).filter(k => String(cur[k] || '') !== set[k]);
    if (!diff.length) return cur;
    diff.forEach(k => { const b = bqBtnOf_(k, set); if (b && !bqBtnOk_(u, cfg, b)) throw new Error(bqBtnMsg_(u, b)); });   // API 75: สิทธิ์ของปุ่ม (MP / RC เดิม = MP, RTT)
    const mp = 'mp' in set ? set.mp : cur.mp, rc = 'rc' in set ? set.rc : cur.rc;
    if (rc && rc === mp) throw new Error('RC ต้องไม่ใช่คนเดียวกับ MP');
    const out = { updated: new Date().toISOString(), editedBy: bqWho_(u), hist: bqHist_(cur.hist, u, diff.map(k => ({ f: k, from: String(cur[k] || ''), to: set[k] }))) };
    diff.forEach(k => { out[k] = set[k]; });
    const row = saveRow_(x, TABLES.bq.fields, out);
    // API 111: รอบ CT ที่เพิ่งบันทึก (CT / Re-CT1 / Re-CT2 ที่ยังไม่มีในนัดนี้) = ประกาศ HDR ส่งภาพแล้ว · ประกาศไม่สำเร็จไม่กระทบการบันทึก CT
    if ('ct' in set) {
      const before = bqCtPairs_(cur.ct, cur.ctRoom).map(p => p.t), added = bqCtPairs_(set.ct, set.ctRoom).map(p => p.t).filter(t => before.indexOf(t) < 0);
      if (added.length) { try { row._ntf = bqCtNotify_(ss, cfg, u, row, added); } catch (e) { row._ntf = []; } }
    }
    return row;
  });
  bqStats_();
  if (rec && rec._ntf && rec._ntf.length) tgNotify_(cfg, rec._ntf);   // API 113: HDR ส่งภาพแล้ว → Telegram
  return rec;
}
// API 111: ประกาศ HDR ส่งภาพแล้ว (ประเภท brachy · สีม่วงในหน้าเว็บ) ต่อรอบ CT ที่เพิ่ม · อาชีพ = config.bq.ntf (ค่าเริ่มต้น RO, MP · ว่าง = ไม่ประกาศ) · แสดงถึงสิ้นวัน
function bqCtNotify_(ss, cfg, u, row, types) {
  const L = ntfLinkCfg_(cfg, 'bq.ct');   // API 132: ลิงก์ประกาศ (ไม่มีลิงก์ = ค่าเดิมใน bq.ntf)
  if (!L || !L.on || !L.roles.length) return [];
  const roles = L.roles;
  const x = openRow_(ss, 'notify', null, ''), td = today_(ss), out = [], rooms = ntfTxRoom_(ss, cfg, row.hn);   // API 142: + ห้องฉาย (ผู้ป่วยที่ฉายรังสีภายนอกอยู่)
  types.forEach(t => {
    const r = { id: Utilities.getUuid(), text: ntfRoomText_(ntfText_(L.text, { 'รอบ': t }), rooms), roles: roles.join(', '), level: 'urgent', until: td, by: String(u.name || u.username || u.me || ''),
      byUser: String(u.username || u.me || ''), at: new Date().toISOString(), acks: '{}', cancelBy: '', cancelAt: '', kind: 'brachy', hn: String(row.hn || ''), pname: String(row.name || '') };
    writeFields_(x.sh, x.sh.getLastRow() + 1, x.header, TABLES.notify.fields, r, null);
    out.push(r);
  });
  return out;
}
// ลงชื่อ RTT / MP / RC ครั้งเดียวให้หลายนัด (ทุกเคสของวันหนึ่งจากแถวหัววัน) · ch = { rtt | mp | rc: ชื่อ } หนึ่งช่อง · ไม่ยกเลิกเท่านั้น
// RC ต้องไม่ใช่ MP ของนัดนั้น (นัดที่ชนข้ามไป) · เก็บประวัติรายนัด · คืนนัดที่แก้ (และนัดที่ค่าเดิมอยู่แล้ว)
function bqEditDay(ids, ch, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.bq);
  ch = ch && typeof ch === 'object' ? ch : {};
  const keys = Object.keys(ch).filter(k => ['rtt', 'mp', 'rc'].indexOf(k) >= 0);
  if (keys.length !== 1) throw new Error('เลือก RTT, MP หรือ RC อย่างใดอย่างหนึ่ง');
  const k = keys[0], v = bqCut_(ch[k], 200);
  ids = (Array.isArray(ids) ? ids : []).map(String).slice(0, 60);
  if (!ids.length) throw new Error('ไม่มีนัดที่จะบันทึก');
  const cfg = readConfig_(ss_()) || {};
  if (!bqBtnOk_(u, cfg, k)) throw new Error(bqBtnMsg_(u, k));   // API 75: สิทธิ์ของปุ่ม (MP / RC เดิม = MP, RTT)
  const out = withLock_(() => {
    // เฉพาะแถวของนัดที่เลือก (เดิมอ่านทั้งตารางนัด 2 รอบ และอ่านคอลัมน์ id ซ้ำทุกนัด)
    const ss = ss_(), R = openRows_(ss, 'bq', null, x => ids.indexOf(x) >= 0), recs = [];
    const curOf = id => (R.at[id] ? R.cv.conv(R.at[id].vals) : null);
    pinChange_(u, pin, ids.some(id => { const x = curOf(id); return x && has_(x[k]) && String(x[k]) !== v; }));
    ids.forEach(id => {
      const cur = curOf(id);
      if (!cur || cur.status === BRACHY_ST_CANCEL || cur.status === BQ_NOSHOW || cur.status === BQ_PP) return;
      if (v && ((k === 'rc' && cur.mp === v) || (k === 'mp' && cur.rc === v))) return;
      if (String(cur[k] || '') === v) { recs.push(cur); return; }
      const set = { updated: new Date().toISOString(), editedBy: bqWho_(u), hist: bqHist_(cur.hist, u, [{ f: k, from: String(cur[k] || ''), to: v }]) };
      set[k] = v;
      writeFields_(R.sh, R.at[id].row, R.header, TABLES.bq.fields.filter(f => f[0] in set), set, R.at[id].vals);
      recs.push(Object.assign({}, cur, set));
    });
    return recs;
  });
  bqStats_();
  return out;
}
/**
 * API 92: เลื่อนนัดใส่แร่ (แถบนัดคิวใส่แร่: ผลการค้นหา · คอลัมน์ท้ายตาราง · แถบเลื่อนนัดไม่มีกำหนด)
 * date '' = เลื่อนนัดไม่มีกำหนด (สถานะ เลื่อนนัดไม่มีกำหนด · วันนัดเดิมเก็บไว้ · ไม่นับเคส) · scope 'rest' = Fx นี้และ Fx ที่ยังนัดอยู่หลังจากนี้ของคอร์ส
 * date = วันนัดใหม่ (นัดที่ยังนัดอยู่ หรือเลื่อนนัดไม่มีกำหนด → นัดแล้ว วันนั้น) · ไม่ต้องใส่ PIN (ยกเลิกใช้ bqCancel = ใส่ PIN) · เก็บประวัติ · คืนนัดที่เปลี่ยน
 */
function bqMove(id, date, scope, token) {
  const u = requireEdit_(token, EDIT_VIEWS.bq);
  date = bqCut_(date, 10);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('วันที่นัดไม่ถูกต้อง');
  const out = withLock_(() => {
    const ss = ss_(), t0 = openRow_(ss, 'bq', null, String(id || '')), tg = t0.cur;
    if (!t0.row || !tg) throw new Error('ไม่พบนัดนี้ (อาจถูกเปลี่ยนไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    if ([BQ_BOOKED, BQ_PP].indexOf(tg.status) < 0) throw new Error('เลื่อนได้เฉพาะนัดที่ยังนัดอยู่ หรือเลื่อนนัดไม่มีกำหนด (นัดนี้: ' + tg.status + ')');
    const pick = [{ row: t0.row, vals: t0.vals, cur: tg }];
    if (!date && scope === 'rest' && tg.course) {   // Fx ที่ยังนัดอยู่หลังจากนี้ของคอร์สเดียวกัน
      const want = readCols_(ss, 'bq', null, ['course', 'status', 'fx']).filter(r => r.course === tg.course && r.status === BQ_BOOKED && r.id !== tg.id && Number(r.fx) > Number(tg.fx)).map(r => r.id);
      if (want.length) {
        const R = openRows_(ss, 'bq', null, v => want.indexOf(v) >= 0);
        want.filter(k => R.at[k]).forEach(k => pick.push({ row: R.at[k].row, vals: R.at[k].vals, cur: R.cv.conv(R.at[k].vals) }));
      }
    }
    const now = new Date().toISOString(), by = bqWho_(u), recs = [];
    pick.forEach(t => {
      const x = t.cur, set = date ? { date: date, status: BQ_BOOKED } : { status: BQ_PP };
      const diff = Object.keys(set).filter(k => String(x[k] || '') !== set[k]);
      if (!diff.length) { recs.push(x); return; }
      const o = { updated: now, editedBy: by, hist: bqHist_(x.hist, u, diff.map(k => ({ f: k, from: String(x[k] || ''), to: set[k] }))) };
      diff.forEach(k => { o[k] = set[k]; });
      writeFields_(t0.sh, t.row, t0.header, TABLES.bq.fields.filter(f => f[0] in o), o, t.vals);
      recs.push(Object.assign({}, x, o));
    });
    return recs;
  });
  bqStats_();
  return out;
}
// ประวัติการแก้ไข (JSON) [{ at, by, ch: [{ f, from, to }] }] · เก็บ 40 ครั้งล่าสุด
function bqHist_(old, u, ch) {
  let list = [];
  try { list = JSON.parse(old || '[]'); } catch (e) { list = []; }
  if (!Array.isArray(list)) list = [];
  list.push({ at: Utilities.formatDate(new Date(), tz_(ss_()), 'yyyy-MM-dd HH:mm'), by: bqWho_(u), ch: ch });
  return JSON.stringify(list.slice(-40));
}
// ยกเลิกนัด: scope 'course' = ทุก Fx ที่ยังนัดอยู่ (และเลื่อนนัดไม่มีกำหนด) ของคอร์สนี้ · อื่น ๆ = เฉพาะ Fx นี้ · คืน { changed, ids }
function bqCancel(id, scope, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.bq.concat(['consult'])), full = u.via === 'google' || userAccess_(readConfig_(ss_()) || {}, 'bq', u) === 'edit';   // API 144
  pinChange_(u, pin, true);
  const res = withLock_(() => {
    const ss = ss_(), t0 = openRow_(ss, 'bq', null, id), tg = t0.cur;
    if (!tg) throw new Error('ไม่พบนัดนี้ (อาจถูกเปลี่ยนไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    if (!full && String(tg.src || '') !== BQ_ONTX) throw new Error('ยกเลิกได้เฉพาะนัดใส่แร่ที่ลงจากแถบห้องตรวจ · นัดอื่นยกเลิกที่แถบนัดคิวใส่แร่');
    let pick;   // [{ row, vals, cur }] · ทั้งคอร์ส: หา id จากคอลัมน์ คอร์ส + สถานะ แล้วอ่านเฉพาะแถวนั้น (เดิมอ่านทั้งตารางนัด)
    if (scope === 'course') {
      const want = !tg.course ? [] : readCols_(ss, 'bq', null, ['course', 'status']).filter(r => r.course === tg.course && (r.status === BQ_BOOKED || r.status === BQ_PP)).map(r => r.id);
      const R = want.length ? openRows_(ss, 'bq', null, v => want.indexOf(v) >= 0) : { at: {} };
      pick = want.filter(k => R.at[k]).map(k => ({ row: R.at[k].row, vals: R.at[k].vals, cur: R.cv.conv(R.at[k].vals) }));
    } else pick = tg.status !== BRACHY_ST_CANCEL ? [{ row: t0.row, vals: t0.vals, cur: tg }] : [];
    const now = new Date().toISOString(), ids = [];
    pick.forEach(t => {
      const x = t.cur;
      const out = { status: BRACHY_ST_CANCEL, updated: now, editedBy: bqWho_(u), hist: bqHist_(x.hist, u, [{ f: 'status', from: x.status, to: BRACHY_ST_CANCEL }]) };
      writeFields_(t0.sh, t.row, t0.header, TABLES.bq.fields.filter(f => f[0] in out), out, t.vals);
      ids.push(x.id);
    });
    return { changed: ids.length, ids: ids };
  });
  bqStats_();
  return res;
}
// นัดที่ส่งให้หน้าเว็บ: ตั้งแต่ 13 เดือนก่อน (รวมนัดล่วงหน้าทั้งหมด)
function recentBq_(ss, cfg, cases, noRoom) {
  const from = Utilities.formatDate(new Date(Date.now() - 400 * 864e5), tz_(ss), 'yyyy-MM-dd');
  const rows = readTable_(ss, 'bq').filter(x => String(x.date) >= from);
  if (noRoom) return rows;   // หน้าเว็บคำนวณห้องฉายจาก Cases เอง
  // API 53: ห้องฉายรังสีภายนอกของผู้ป่วย (rtRoom) = เคส HN เดียวกันที่ Start RT ล่าสุดไม่เกินวันนัด (ไม่มี = เคสแรก) · ตำแหน่งที่ไม่ได้รับข้อมูลเคสก็เห็นห้อง
  const byHn = {};
  (cases || readTable_(ss, 'cases', cfg)).forEach(c => { const k = hnKey_(c.hn); if (k && c.room) (byHn[k] = byHn[k] || []).push(c); });
  rows.forEach(r => {
    const cs = (byHn[hnKey_(r.hn)] || []).slice().sort((a, b) => String(a.sim).localeCompare(String(b.sim)));
    const before = cs.filter(c => /^\d{4}-\d{2}-\d{2}$/.test(String(c.sim)) && String(c.sim) <= String(r.date));
    const c = before.length ? before[before.length - 1] : cs[0];
    r.rtRoom = c ? String(c.room) : '';
  });
  return rows;
}
// สถิติ Brachytherapy จากแถบนี้ (ตั้งค่า → Brachytherapy: ที่มา = แถบนัดคิวใส่แร่): อัปเดตกิจกรรม MP / RC ทันทีหลังแก้นัด
function bqStats_() {
  try {
    const ss = ss_(), cfg = readConfig_(ss) || {}, s = cfg.brachySync || {};
    if (s.on && s.src === 'internal') extSync_(ss, cfg, 'brachy', 'แถบนัดคิวใส่แร่');
  } catch (e) { /* ดึงรอบถัดไปแทน */ }
}
// นัดในแถบนี้ในรูปเดียวกับที่อ่านจากชีตของระบบนัดเดิม (brachyRead_) · รหัสนัดเดิมที่นำเข้าคงไว้ = กิจกรรมเดิมไม่ซ้ำ
function bqRows_(ss) {
  const rows = readTable_(ss, 'bq').map(x => ({ key: x.id, id: x.id, date: x.date, hn: x.hn, name: x.name, technique: x.tech, mp: x.mp, rc: x.rc, status: x.status, fx: x.fx, totalFx: x.total }));
  return { tab: { name: TABLES.bq.sheet, headers: [], rows: rows.length }, map: {}, tabs: [], rows: rows, missing: [] };
}

/**
 * แอดมิน: นำเข้านัดจากระบบนัดคิวใส่แร่เดิม (ชีตเดียวกับ ตั้งค่า → Brachytherapy จากระบบนัด) · นำเข้าซ้ำ = เพิ่มเฉพาะนัดที่ยังไม่มี
 * bqImportCheck = ตรวจอย่างเดียว (ไม่เขียน) · bqImport = นำเข้า · ทั้งสองคืนสรุปเดียวกัน:
 * { tab, title, rows, add (ยังไม่มี), have (มีแล้ว), first, last, statuses, techs, courses, map (คอลัมน์ที่ใช้), doctors / staff: { ชื่อที่ไม่รู้จัก: จำนวน } } · bqImport เพิ่ม added, skipped
 * รหัสนัดเดิม (เลขนัด) ใช้เป็น id (ไม่มีคอลัมน์รหัส = HN|วันที่|Fx) · แพทย์ / MP / RC จับคู่กับรายชื่อในตั้งค่า (ไม่ตรง = เก็บข้อความเดิม)
 */
// คอลัมน์ของระบบเดิม: แบบเดียวกับที่ดึงสถิติ (BRACHY_KEYS ประกาศทีหลังในไฟล์ → สร้างตอนเรียก) + แพทย์ หมายเหตุ คอร์ส ผู้ลงนัด ผู้แก้ล่าสุด ประวัติ
const bqImportKeys_ = () => Object.assign({}, BRACHY_KEYS, {
  doctor: ['doctor', 'แพทย์', 'doc', 'physician', 'แพทย์ผู้สั่ง', 'แพทย์เจ้าของไข้'], note: ['note', 'หมายเหตุ', 'remark', 'notes'],
  course: ['courseid', 'course', 'คอร์ส', 'รหัสคอร์ส'], created: ['createdat', 'created', 'ลงนัดเมื่อ', 'วันที่ลงนัด', 'วันที่บันทึก', 'timestamp'],
  createdBy: ['createdby', 'ลงนัดโดย', 'ผู้ลงนัด', 'ผู้บันทึก'], editedBy: ['editedby', 'updatedby', 'แก้ไขล่าสุดโดย', 'แก้ไขโดย'],
  updated: ['updatedat', 'updated', 'แก้ไขล่าสุดเมื่อ', 'แก้ไขเมื่อ'], history: ['history', 'ประวัติ', 'ประวัติการแก้ไข'],
});
const BQ_HIST_F = { doctor: 'doc', technique: 'tech' };
// อ่านนัดทั้งหมดจากชีตของระบบเดิมเป็นแถวของแถบนี้
function bqImportRead_(cfg) {
  const s = cfg.brachySync || {};
  if (!String(s.url || '').trim()) throw new Error('ใส่ลิงก์ชีตของระบบนัดคิวใส่แร่เดิมที่ ตั้งค่า → Brachytherapy จากระบบนัด ก่อน');
  const book = brachyBook_(s), tabs = brachyTabs_(book), tab = brachyPick_(tabs, s);
  if (!tab) throw new Error('ไม่พบแท็บในชีตของระบบนัด');
  const map = Object.assign(brachyGuess_(tab.headers, bqImportKeys_()), s.map && typeof s.map === 'object' ? s.map : {});
  if (!map.date || !map.hn) throw new Error('ไม่พบคอลัมน์วันที่หรือ HN ในแท็บ ' + tab.name + ' · ตั้งค่า → Brachytherapy จากระบบนัด → ตรวจชีต แล้วเลือกคอลัมน์');
  const sh = sheet_(book, tab.name), tz = tz_(book), last = sh.getLastRow();
  const values = last > 1 ? sh.getRange(1, 1, last, sh.getLastColumn()).getValues() : [];
  const header = (values.shift() || []).map(v => String(v).trim()), at = k => (map[k] ? header.indexOf(map[k]) : -1);
  const docKey = v => String(v || '').replace(/^(นพ\.|พญ\.|นาย|นางสาว|นาง|ดร\.)/, '').replace(/\s+/g, '').toLowerCase();
  const docs = (Array.isArray(cfg.doctors) ? cfg.doctors : []).filter(x => x && x.code);
  const docOf = v => { const t = String(v || '').trim(), hit = t && docs.filter(x => String(x.code).toUpperCase() === t.toUpperCase() || (x.name && docKey(x.name) === docKey(t)))[0]; return hit ? String(hit.code).toUpperCase() : t; };
  const staffOf = brachyStaff_(cfg), unknownDoc = {}, unknownStaff = {};
  const stOf = v => (/เลื่อนนัดไม่มีกำหนด/.test(v) ? BQ_PP : /ยกเลิก|cancel/i.test(v) ? BRACHY_ST_CANCEL : /ไม่มา|no.?show/i.test(v) ? BQ_NOSHOW : /มาตามนัด|มาแล้ว|done|complete/i.test(v) ? BRACHY_ST_DONE : BQ_BOOKED);
  const now = new Date().toISOString();
  const rows = values.map(r => {
    const g = k => { const i = at(k); return i < 0 ? '' : cellText_(r[i], tz); };
    // วันเวลาที่บันทึก / แก้ล่าสุด: เซลล์วันที่เก็บเวลาไว้ด้วย
    const gt = k => { const i = at(k), v = i < 0 ? '' : r[i]; return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v) ? Utilities.formatDate(v, tz, 'yyyy-MM-dd HH:mm:ss') : g(k); };
    const o = { date: brachyDate_(g('date')), hn: String(g('hn')).replace(/\.0$/, '').trim(), fx: g('fx'), total: g('totalFx') };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date) || !o.hn) return null;
    const doc = docOf(g('doctor')), mp = g('mp'), rc = g('rc');
    if (g('doctor') && doc === String(g('doctor')).trim() && !docs.some(x => String(x.code).toUpperCase() === doc.toUpperCase())) unknownDoc[doc] = (unknownDoc[doc] || 0) + 1;
    [mp, rc].forEach(v => { if (v && !staffOf(v)) unknownStaff[v] = (unknownStaff[v] || 0) + 1; });
    let hist = [];
    try { hist = JSON.parse(g('history') || '[]'); } catch (e) { hist = []; }
    hist = (Array.isArray(hist) ? hist : []).map(h => ({ at: String(h.at || ''), by: String(h.name || h.by || ''),
      ch: (Array.isArray(h.changes) ? h.changes : Array.isArray(h.ch) ? h.ch : []).map(c => ({ f: BQ_HIST_F[c.f] || c.f, from: String(c.from == null ? '' : c.from), to: String(c.to == null ? '' : c.to) })) }));
    return Object.assign(o, { id: g('id') || o.hn + '|' + o.date + '|' + o.fx, course: g('course'), name: g('name'), doc: doc, tech: g('technique'), note: g('note'),
      status: stOf(g('status')), mp: staffOf(mp) || mp, rc: staffOf(rc) || rc, hist: hist.length ? JSON.stringify(hist.slice(-40)) : '', by: g('createdBy'), created: gt('created') || now,
      editedBy: g('editedBy'), updated: gt('updated') });
  }).filter(Boolean);
  // ไม่มีคอลัมน์คอร์ส: Fx 1 (หรือ Fx ไม่เพิ่มจากครั้งก่อน) ของ HN เดียวกัน = เริ่มคอร์สใหม่
  const lastOf = {};
  rows.slice().sort((a, b) => a.hn.localeCompare(b.hn) || a.date.localeCompare(b.date) || (+a.fx || 0) - (+b.fx || 0)).forEach(o => {
    if (o.course) return;
    const p = lastOf[o.hn];
    if (!p || +o.fx <= 1 || (+o.fx || 0) <= (+p.fx || 0)) lastOf[o.hn] = { fx: o.fx, course: 'IMP-' + o.hn + '-' + o.date };
    else lastOf[o.hn].fx = o.fx;
    o.course = lastOf[o.hn].course;
  });
  rows.forEach(o => { o.src = 'bq:' + o.id; });
  return { book: book, tab: tab, rows: rows, map: map, doctors: unknownDoc, staff: unknownStaff };
}
// สรุปสำหรับหน้าตั้งค่า · have = รหัสนัดที่อยู่ในแถบนี้แล้ว
function bqImportSum_(im, have) {
  const dates = im.rows.map(o => o.date).sort(), count = f => { const m = {}; im.rows.forEach(o => { const k = f(o) || '—'; m[k] = (m[k] || 0) + 1; }); return m; };
  const add = im.rows.filter(o => !have[o.id]).length;
  return { tab: im.tab.name, title: im.book.getName(), rows: im.rows.length, add: add, have: im.rows.length - add, first: dates[0] || '', last: dates[dates.length - 1] || '',
    statuses: count(o => o.status), techs: count(o => o.tech), courses: Object.keys(count(o => o.course)).length, map: im.map, doctors: im.doctors, staff: im.staff };
}
const bqHave_ = ss => { const have = {}; readTable_(ss, 'bq').forEach(x => { have[x.id] = true; }); return have; };
function bqImportCheck(token) {
  const u = who_(token);
  if (!u.isAdmin) throw new Error('นำเข้านัดได้เฉพาะแอดมิน');
  const ss = ss_();
  return bqImportSum_(bqImportRead_(readConfig_(ss) || {}), bqHave_(ss));
}
function bqImport(token) {
  const u = who_(token);
  if (!u.isAdmin) throw new Error('นำเข้านัดได้เฉพาะแอดมิน');
  const ss = ss_(), im = bqImportRead_(readConfig_(ss) || {});
  const res = withLock_(() => {
    const sh = tableSheet_(ss, 'bq'), have = bqHave_(ss), sum = bqImportSum_(im, have);
    const add = im.rows.filter(o => !have[o.id] && (have[o.id] = true));   // รหัสซ้ำในชีตเดิม: เพิ่มแถวแรก
    bqAppend_(sh, headerOf_(sh), add);
    return Object.assign(sum, { added: add.length, skipped: im.rows.length - add.length });
  });
  bqStats_();
  return res;
}

/**
 * Vac-Lok (แถบ RTT/RA Jobs → Vac-Lok · ฟอร์ม CT-SIM) API 48: การใช้ Vac-Lok หนึ่งแถวต่อครั้ง
 * vacSave = เพิ่ม/แก้ (บันทึกใหม่ไม่ต้องใส่ PIN · แก้ต้องใส่) · vacRemove = ลบ (ใส่ PIN) · บันทึกได้เมื่อบันทึกในแถบ RTT/RA Jobs หรือ CT-SIM ได้
 * vacImportCheck / vacImport (แอดมิน) = อ่านชีต Vac-Lok เดิมจากลิงก์ที่ ตั้งค่า → RTT/RA Jobs → Vac-Lok
 */
const VAC_FIELDS = ['no', 'hn', 'name', 'room', 'ct', 'off', 'hold', 'note', 'ctId'];
const vacNow_ = () => new Date().toISOString();
function vacSave(rec, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.vac);
  rec = rec && typeof rec === 'object' ? rec : {};
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  if (!cut(rec.no, 20)) throw new Error('เลือกเลข Vac-Lok');
  if (!cut(rec.hn, 40)) throw new Error('กรอก HN');
  ['ct', 'off', 'hold'].forEach(k => { const v = cut(rec[k], 10); if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('วันที่ไม่ถูกต้อง'); });
  return withLock_(() => {
    const ss = ss_(), id = cut(rec.id, 80), x = openRow_(ss, 'vac', null, id), row = x.row;
    pinChange_(u, pin, !!row);
    const set = {};
    VAC_FIELDS.forEach(k => { set[k] = cut(rec[k], k === 'note' ? 1000 : k === 'name' ? 200 : 80); });
    if (row) set.updated = vacNow_();
    else Object.assign(set, { id: id || Utilities.getUuid(), src: 'manual', by: String(u.name || u.username || u.me || ''), created: vacNow_(), updated: '' });
    return saveRow_(x, TABLES.vac.fields, set);
  });
}
function vacRemove(id, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.vac);
  pinChange_(u, pin, true);
  return withLock_(() => {
    const sh = tableSheet_(ss_(), 'vac'), row = findRow_(sh, headerOf_(sh).indexOf('id') + 1, id);
    if (row) delRow_(sh, row);
    return !!row;
  });
}
// ฟอร์ม CT-SIM เลือก Vac-Lok (เรียกใน lock ของ ctSave): แถวที่ผูกกับรายการนี้ หรือแถวที่นำเข้า (เลขและ HN เดียวกัน ยังไม่ผูก) · ไม่มี = เพิ่มใหม่
function vacLink_(ss, ct, no, u) {
  const sh = tableSheet_(ss, 'vac'), header = headerOf_(sh), rows = readTable_(ss, 'vac'), idCol = header.indexOf('id') + 1;
  const cur = rows.filter(x => x.ctId === ct.id)[0];
  if (!no) { if (cur) { const r = findRow_(sh, idCol, cur.id); if (r) delRow_(sh, r); } return; }
  const imp = cur ? null : rows.filter(x => !x.ctId && String(x.no) === no && hnKey_(x.hn) === hnKey_(ct.hn) && (!x.ct || x.ct === ct.date))[0];
  const target = cur || imp;
  const set = { no: no, hn: ct.hn, name: ct.name || (target ? target.name : ''), ct: ct.date, ctId: ct.id };
  if (ct.room) set.room = ct.room;
  if (target) { set.updated = vacNow_(); writeFields_(sh, findRow_(sh, idCol, target.id), header, TABLES.vac.fields.filter(f => f[0] in set), set); return; }
  Object.assign(set, { id: Utilities.getUuid(), room: ct.room || '', src: 'ctsim', by: String(u.name || u.username || u.me || ''), created: vacNow_(), updated: '' });
  writeFields_(sh, sh.getLastRow() + 1, header, TABLES.vac.fields.filter(f => f[0] in set), set);
}
// ลบรายการ CT-SIM: การใช้ Vac-Lok ที่เพิ่มจากฟอร์มนั้นลบด้วย · ที่นำเข้าหรือบันทึกเองเหลือไว้ (เอาการผูกออก)
function vacUnlink_(ss, ctId) {
  const sh = sheet_(ss, TABLES.vac.sheet);
  if (!sh) return;
  markDirty_('vac');
  const header = headerOf_(sh), idCol = header.indexOf('id') + 1;
  readTable_(ss, 'vac').filter(x => x.ctId === ctId).forEach(x => {
    const r = findRow_(sh, idCol, x.id);
    if (!r) return;
    if (x.src === 'ctsim') delRow_(sh, r);
    else writeFields_(sh, r, header, TABLES.vac.fields.filter(f => f[0] === 'ctId'), { ctId: '' });
  });
}
// วันที่ในชีตเดิม: เซลล์วันที่ · 2026-07-24 · 24/7/2026 (พ.ศ. ได้) · 24 Jul 2026
function vacDate_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v) ? '' : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const t = String(v == null ? '' : v).trim();
  if (!t) return '';
  const b = brachyDate_(t);
  if (/^\d{4}-\d{2}-\d{2}$/.test(b)) return b;
  const m = /^(\d{1,2})[\s-]+([A-Za-z]{3})[A-Za-z]*\.?[\s-]+(\d{2,4})$/.exec(t);
  const mi = m ? 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf(m[2].toLowerCase()) : -1;
  if (mi < 0 || mi % 3) return '';
  let y = +m[3];
  if (y < 100) y += 2000;
  if (y > 2400) y -= 543;
  return y + '-' + ('0' + (mi / 3 + 1)).slice(-2) + '-' + ('0' + m[1]).slice(-2);
}
// อ่านแท็บหนึ่งของชีต Vac-Lok เดิม: หัวตาราง "Vac-Lok No." + "HN" แถวถัดไปเป็นหัวย่อย (วันทำ CT / Off / Hold RT)
// แบบมีคอลัมน์ห้องฉาย (Linac 1/2/3 · ห้องตามลำดับใน ตั้งค่า) หรือแบบแยกคอลัมน์ตาม Linac · คืน null ถ้าไม่ใช่ตาราง Vac-Lok
function vacParse_(sh, tz, rooms) {
  const last = sh.getLastRow(), cols = sh.getLastColumn();
  if (last < 3 || cols < 3) return null;
  const v = sh.getRange(1, 1, last, cols).getValues(), txt = r => (r || []).map(x => String(x == null ? '' : x).trim());
  let h = -1;
  for (let i = 0; i < Math.min(v.length, 10) && h < 0; i++) { const r = txt(v[i]); if (r.some(x => /vac/i.test(x)) && r.some(x => /^HN$/i.test(x))) h = i; }
  if (h < 0) return null;
  const top = txt(v[h]), sub = txt(v[h + 1]), find = re => top.findIndex(x => re.test(x));
  const noC = find(/vac/i), hnC = find(/^HN$/i), stC = find(/สถานะ/), roomC = find(/ห้องฉาย/);
  const subAt = (re, a, b) => { for (let i = a; i < b; i++) if (re.test(sub[i] || '')) return i; return -1; };
  const sets = [];
  if (roomC >= 0) sets.push({ room: '', ct: subAt(/CT/i, 0, cols), off: subAt(/^off$/i, 0, cols), hold: subAt(/hold/i, 0, cols) });
  else {
    for (let i = 0; i < cols; i++) {
      const m = /linac\s*(\d+)/i.exec(top[i]);
      if (!m) continue;
      let j = i + 1;
      while (j < cols && !top[j]) j++;
      sets.push({ room: 'Linac ' + m[1], ct: subAt(/CT/i, i, j), off: subAt(/^off$/i, i, j), hold: subAt(/hold/i, i, j) });
      i = j - 1;
    }
  }
  const roomName = r => { const m = /linac\s*(\d+)/i.exec(r); return m && rooms[+m[1] - 1] ? rooms[+m[1] - 1] : r; };
  const rows = [], bags = [];
  for (let i = h + 2; i < v.length; i++) {
    const r = v[i], nm = /^(\d+)\s*(?:\((.*)\))?$/.exec(String(r[noC] == null ? '' : r[noC]).trim());
    if (!nm) continue;   // แถวว่างหรือหมายเหตุท้ายตาราง
    const no = nm[1], type = String(nm[2] || '').trim();
    bags.push({ no: no, type: type });
    const hn = String(r[hnC] == null ? '' : r[hnC]).replace(/\.0$/, '').trim();
    if (!hn) continue;
    const at = (x, k) => (x && x[k] >= 0 ? vacDate_(r[x[k]], tz) : '');
    const set = roomC >= 0 ? sets[0] : sets.filter(x => at(x, 'ct') || at(x, 'off'))[0] || null;
    const room = roomC >= 0 ? String(r[roomC] == null ? '' : r[roomC]).trim() : set ? set.room : '';
    rows.push({ no: no, type: type, hn: hn, room: roomName(room), ct: at(set, 'ct'), off: at(set, 'off'), hold: at(set, 'hold'), status: stC >= 0 ? String(r[stC] == null ? '' : r[stC]).trim() : '' });
  }
  return { rows: rows, bags: bags, layout: roomC >= 0 ? 'room' : 'linac' };
}
// ชีตเดิม: แท็บตาม gid ในลิงก์ · ไม่มี gid = แท็บแรกที่มีคอลัมน์ห้องฉาย (ไม่มี = แท็บแรกที่เป็นตาราง Vac-Lok)
function vacImportRead_(cfg) {
  const s = cfg.vac || {}, url = String(s.url || '').trim();
  if (!url) throw new Error('ใส่ลิงก์ชีต Vac-Lok ที่ ตั้งค่า → RTT/RA Jobs → Vac-Lok แล้วบันทึกก่อน');
  const book = extBook_(s, 'Vac-Lok'), tz = tz_(book), rooms = Array.isArray(cfg.rooms) ? cfg.rooms : [];
  const gid = /[#&?]gid=(\d+)/.exec(url), idOf = sh => (typeof sh.getSheetId === 'function' ? String(sh.getSheetId()) : '');
  const parsed = book.getSheets().map(sh => ({ sh: sh, p: vacParse_(sh, tz, rooms) })).filter(x => x.p);
  const pick = (gid && parsed.filter(x => idOf(x.sh) === gid[1])[0]) || parsed.filter(x => x.p.layout === 'room')[0] || parsed[0];
  if (!pick) throw new Error('ไม่พบตาราง Vac-Lok (หัวตาราง Vac-Lok No. และ HN) ในชีต ' + book.getName());
  return Object.assign(pick.p, { book: book, tab: pick.sh.getName() });
}
// จับคู่กับข้อมูลเดิม: แถวที่นำเข้าแล้ว (ที่มาเดียวกัน หรือเลขและ HN เดียวกัน) · รายการ CT-SIM ของ HN นี้วันเดียวกัน (±7 วัน) · ชื่อจาก CT-SIM / ลงทะเบียน / เคส
function vacPlan_(ss, cfg, im) {
  const have = readTable_(ss, 'vac'), cts = readTable_(ss, 'ctsim'), reg = regRows_(ss), cases = readTable_(ss, 'cases', cfg);
  const nameOf = k => { const c = cts.filter(x => hnKey_(x.hn) === k && x.name)[0], g = reg.filter(x => hnKey_(x.hn) === k)[0], cs = cases.filter(x => hnKey_(x.hn) === k && x.name)[0];
    return c ? c.name : g ? regName_(g) : cs ? cs.name : ''; };
  const day = d => Date.parse(d + 'T00:00:00Z');
  return im.rows.map(o => {
    const k = hnKey_(o.hn), src = 'vac:' + o.no + '|' + k + '|' + o.ct;
    const old = have.filter(x => x.src === src)[0] || have.filter(x => String(x.no) === o.no && hnKey_(x.hn) === k && (!x.ct || !o.ct || x.ct === o.ct))[0] || null;
    const mine = cts.filter(x => hnKey_(x.hn) === k);
    const ct = mine.filter(x => o.ct && x.date === o.ct)[0] || (o.ct ? mine.filter(x => Math.abs(day(x.date) - day(o.ct)) <= 7 * 864e5).sort((a, b) => Math.abs(day(a.date) - day(o.ct)) - Math.abs(day(b.date) - day(o.ct)))[0] : null) || null;
    const name = nameOf(k);
    return { o: o, src: src, old: old, ctId: ct ? ct.id : '', name: name, known: !!ct || !!name || cases.some(x => hnKey_(x.hn) === k) };
  });
}
function vacImportSum_(im, plan) {
  const dates = plan.map(x => x.o.ct).filter(Boolean).sort();
  return { tab: im.tab, title: im.book.getName(), layout: im.layout, bags: im.bags.length, rows: plan.length, add: plan.filter(x => !x.old).length, update: plan.filter(x => x.old).length,
    linked: plan.filter(x => x.ctId).length, known: plan.filter(x => x.known).length, busy: plan.filter(x => /ไม่ว่าง/.test(x.o.status)).length, first: dates[0] || '', last: dates[dates.length - 1] || '' };
}
function vacImportCheck(token) {
  const u = who_(token);
  if (!u.isAdmin) throw new Error('นำเข้า Vac-Lok ได้เฉพาะแอดมิน');
  const ss = ss_(), cfg = readConfig_(ss) || {}, im = vacImportRead_(cfg);
  return vacImportSum_(im, vacPlan_(ss, cfg, im));
}
function vacImport(token) {
  const u = who_(token);
  if (!u.isAdmin) throw new Error('นำเข้า Vac-Lok ได้เฉพาะแอดมิน');
  const ss = ss_(), im = vacImportRead_(readConfig_(ss) || {});
  return withLock_(() => {
    const cfg = readConfig_(ss) || {}, plan = vacPlan_(ss, cfg, im), sum = vacImportSum_(im, plan);
    const sh = tableSheet_(ss, 'vac'), header = headerOf_(sh), idCol = header.indexOf('id') + 1, now = vacNow_();
    let added = 0, updated = 0;
    plan.forEach(x => {
      const o = x.o;
      if (x.old) {
        // ชีตเดิมเป็นข้อมูลล่าสุดของวัน Off / Hold RT / ห้อง · ช่องที่ว่างอยู่เติมให้
        const set = { updated: now };
        ['room', 'ct', 'off', 'hold'].forEach(k => { if (o[k] && o[k] !== x.old[k]) set[k] = o[k]; });
        if (!x.old.name && x.name) set.name = x.name;
        if (!x.old.ctId && x.ctId) set.ctId = x.ctId;
        if (!x.old.src || x.old.src === 'manual') set.src = x.src;
        if (Object.keys(set).length > 1) { writeFields_(sh, findRow_(sh, idCol, x.old.id), header, TABLES.vac.fields.filter(f => f[0] in set), set); updated++; }
        return;
      }
      const set = { id: Utilities.getUuid(), no: o.no, hn: o.hn, name: x.name, room: o.room, ct: o.ct, off: o.off, hold: o.hold, note: '', ctId: x.ctId, src: x.src, by: 'นำเข้า', created: now, updated: '' };
      writeFields_(sh, sh.getLastRow() + 1, header, TABLES.vac.fields, set);
      added++;
    });
    // รายการ Vac-Lok (เลขและชนิด) ใน ตั้งค่า: เพิ่มเลขที่ยังไม่มี · ชนิดที่ยังว่างใส่ให้
    const vc = cfg.vac && typeof cfg.vac === 'object' ? cfg.vac : {}, bags = Array.isArray(vc.bags) ? vc.bags.slice() : [];
    let bagsAdded = 0;
    im.bags.forEach(b => {
      const cur = bags.filter(x => x && String(x.no) === b.no)[0];
      if (!cur) { bags.push({ no: b.no, type: b.type }); bagsAdded++; } else if (!cur.type && b.type) cur.type = b.type;
    });
    bags.sort((a, b) => (+a.no || 0) - (+b.no || 0));
    cfg.vac = Object.assign({}, vc, { bags: bags });
    writeConfig_(ss, cfg);
    return Object.assign(sum, { added: added, updated: updated, bagsAdded: bagsAdded });
  });
}

/**
 * แถบลงทะเบียน: เพิ่มหรือแก้ผู้ป่วย ยืนยันด้วยรหัส PIN (ตั้งค่า → รหัส PIN: ลงทะเบียน)
 * rec = ช่องใน REG_FIELDS · HN คำนำหน้า ชื่อ-สกุล บังคับตาม ตั้งค่า → ลงทะเบียน (config.reg.form · ยังไม่ตั้ง = บังคับ) · ต้องมี HN หรือชื่อ-สกุล
 * HN ซ้ำกับผู้ป่วยคนอื่นไม่ได้ (ไม่สนช่องว่างและตัวพิมพ์) · id ที่ยังไม่มี = เพิ่มใหม่ · คืนรายการหลังบันทึก
 */
const REG_FIELDS = ['hn', 'title', 'name', 'sex', 'birth', 'phone', 'right', 'doc', 'icd', 'dx', 'note', 'consult', 'visit', 'chan', 'refer', 'icds'];
const REG_CUT_ = k => (k === 'hn' ? 40 : k === 'note' || k === 'dx' ? 2000 : k === 'consult' || k === 'visit' ? 10 : 200);
const hnKey_ = v => String(v == null ? '' : v).replace(/\s+/g, '').toUpperCase();
// กันงานวางแผนซ้ำ (API 71 · ตรงกับ openJob ในหน้าเว็บ · ตรวจภายใต้ล็อก จึงกันการบันทึกพร้อมกันจากหลายเครื่องได้):
// งานของ HN เดียวกัน เทคนิคเดียวกัน ที่ยังไม่ Plan complete · ไม่นับ: Plan complete / สถานะจบการฉาย / เพิ่มในตารางวันฉาย (direct)
// งานบริเวณเพิ่มเติม (ตั้งใจแยกงาน) · เคสที่ In เกิน 90 วัน (ยกเว้นงานวางแผนใหม่) · หมวดงานง่ายไม่ตรวจ · หมวดที่ไม่รู้จัก: plan = ถือเป็นงานวางแผน
function openJobs_(rows, cfg, hn, cat, skip, plan) {
  const key = hnKey_(hn), k = (cfg && Array.isArray(cfg.cats) ? cfg.cats : []).filter(x => x && x.id === cat)[0];
  if (!key || !cat || (k ? k.kind === 'simple' : !plan)) return [];
  const from = Utilities.formatDate(new Date(Date.now() - 90 * 864e5), tz_(ss_()), 'yyyy-MM-dd');
  const revised = {};   // API 72: งานที่ส่งแก้แผนแล้ว (มีงานแก้แผนผูกอยู่) = ปิดแล้ว ไม่นับ
  rows.forEach(c => { const m = jobMeta_(c); if (m && m.kind === 'revise') revised[m.of] = true; });
  return rows.filter(c => {
    if (!c || c.id === skip || revised[c.id] || c.cat !== cat || hnKey_(c.hn) !== key || has_(c.pc) || has_(c.rt) || c.how === 'direct') return false;
    const m = jobMeta_(c);
    return m ? m.kind !== 'site' : String(c['in'] || '').slice(0, 10) >= from;
  });
}
const jobMeta_ = c => { try { const m = JSON.parse((c && c.replan) || 'null'); return m && typeof m === 'object' && m.of ? m : null; } catch (e) { return null; } };
const jobText_ = (c, cfg) => { const k = (cfg && Array.isArray(cfg.cats) ? cfg.cats : []).filter(x => x && x.id === c.cat)[0], m = jobMeta_(c);
  return (m ? '↻ ' + m.label + ' ' : '') + (k ? k.label : c.cat) + ' · MP ' + (c.mp || '-') + ' · In ' + String(c['in'] || '').slice(0, 10); };
const regName_ = r => (r.title + (/[A-Za-z]/.test(r.title) ? ' ' : '') + r.name).trim();
// ผู้ป่วยที่ลงทะเบียน · แถวที่บันทึกด้วยรุ่น 2026-10-30.1 (คอลัมน์ ชื่อ และ สกุล) ใช้สองคอลัมน์นั้นเป็นชื่อ-สกุล
function regRows_(ss) { return regFixNames_(ss, readTable_(ss, 'reg')); }
// ชื่อว่าง (ชีตรุ่นเก่าที่แยกชื่อ/สกุล) = ต่อจากคอลัมน์ชื่อ สกุล
function regFixNames_(ss, rows) {
  const sh = sheet_(ss, TABLES.reg.sheet);
  if (!sh || !rows.some(r => !r.name)) return rows;
  const head = headerOf_(sh), id = head.indexOf('id'), first = head.indexOf('ชื่อ'), last = head.indexOf('สกุล'), n = sh.getLastRow() - 1;
  if (id < 0 || (first < 0 && last < 0) || n < 1) return rows;
  const col = c => (c < 0 ? null : sh.getRange(2, c + 1, n, 1).getValues()), ids = col(id), fs = col(first), ls = col(last);   // อ่านเฉพาะ 3 คอลัมน์
  const old = {};
  ids.forEach((v, i) => { old[String(v[0]).trim()] = [fs ? fs[i][0] : '', ls ? ls[i][0] : ''].map(x => String(x).trim()).filter(Boolean).join(' '); });
  rows.forEach(r => { if (!r.name) r.name = old[r.id] || ''; });
  return rows;
}
/* ---------- แถบลงทะเบียน: ดึงผู้ป่วยจากไฟล์ในโฟลเดอร์ Google Drive (API 57) ---------- */
// config.reg.drive = { on, url (ลิงก์โฟลเดอร์), every (นาที), map: { hn, name, doc, icd, dx, right, note } (ชื่อหัวคอลัมน์ · ไม่มีคีย์ = เดาจากหัวคอลัมน์ · '' = ไม่ใช้), filter: { col, vals } (เฉพาะแถวที่คอลัมน์ col เป็นค่าใน vals)
// ไฟล์ .xlsx · .xls (Excel 97–2003 หรือไฟล์ HTML / XML / ข้อความที่ตั้งชื่อเป็น .xls) · Google Sheets · .csv ในโฟลเดอร์ (ไม่รวมโฟลเดอร์ย่อย) แผ่นแรก · หัวตาราง = แถวแรก (ใน 15 แถว) ที่มีหัวคอลัมน์ของ HN
// ไม่ดึงซ้ำ: ไฟล์ที่ไม่เปลี่ยนตั้งแต่ดึงครั้งก่อนข้ามทั้งไฟล์ · HN ที่มีในระบบแล้ว (ทุกแถบที่เก็บ HN) ข้าม (ไม่ทับข้อมูลเดิม) · สถานะเก็บใน Script property regDrive
const REG_DRIVE_PROP = 'regDrive';
function regDriveFolder_(url) {
  const v = String(url == null ? '' : url).trim();
  const m = /folders\/([\w-]{10,})/.exec(v) || /[?&]id=([\w-]{10,})/.exec(v) || /^([\w-]{20,})$/.exec(v);
  if (!m) throw new Error('ใส่ลิงก์โฟลเดอร์ Google Drive (https://drive.google.com/drive/folders/…)');
  try { return DriveApp.getFolderById(m[1]); } catch (e) { throw new Error('เปิดโฟลเดอร์ไม่ได้: บัญชีที่ Deploy Code.gs ต้องมีสิทธิ์ดูโฟลเดอร์นี้ (' + e.message + ')'); }
}
const xmlText_ = v => String(v).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16))).replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&');
const xmlTs_ = x => (String(x).replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').match(/<t(?:\s[^>]*)?>[\s\S]*?<\/t>/g) || []).map(t => xmlText_(t.replace(/^<t[^>]*>|<\/t>$/g, ''))).join('');
// .xlsx = zip ของ XML: ข้อความใช้ร่วม (sharedStrings) + แผ่นแรก · คืนแถวเป็นข้อความ
function xlsxRows_(blob) {
  const files = Utilities.unzip(blob.setContentType('application/zip')), get = n => files.filter(f => f.getName() === n)[0];
  const shared = [], ssx = get('xl/sharedStrings.xml');
  if (ssx) (ssx.getDataAsString('UTF-8').match(/<si>[\s\S]*?<\/si>|<si\/>/g) || []).forEach(si => shared.push(xmlTs_(si)));
  const sheet = get('xl/worksheets/sheet1.xml') || files.filter(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f.getName()))[0];
  if (!sheet) return [];
  return (sheet.getDataAsString('UTF-8').match(/<row\b[^>]*\/>|<row\b[\s\S]*?<\/row>/g) || []).map(rw => {
    const r = [];
    (rw.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []).forEach(c => {
      const open = /^<c\b[^>]*/.exec(c)[0], ref = (/\br="([A-Z]+)\d+"/.exec(open) || [])[1], t = (/\bt="(\w+)"/.exec(open) || [])[1] || '', v = (/<v>([\s\S]*?)<\/v>/.exec(c) || [])[1];
      const val = t === 's' ? shared[+v] || '' : t === 'inlineStr' ? xmlTs_(c) : v == null ? '' : xmlText_(v);
      const col = ref ? ref.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1 : r.length;
      r[col] = String(val).trim();
    });
    return Array.from(r, v => v || '');
  });
}
const REG_DRIVE_TYPES = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.google-apps.spreadsheet', 'text/csv', 'application/vnd.ms-excel'];
const REG_DRIVE_EXT = /\.(xlsx|xls|csv)$/i;
// ไฟล์ที่อ่านได้ (ใหม่สุดก่อน) · others = ชื่อไฟล์อื่นในโฟลเดอร์ที่อ่านไม่ได้ (ชนิดไม่รองรับ เช่น .ods, .pdf) ให้แจ้งในผลดึง
function regDriveFiles_(folder) {
  const out = [], others = [], it = folder.getFiles();
  while (it.hasNext()) { const f = it.next(); if (REG_DRIVE_TYPES.indexOf(f.getMimeType()) >= 0 || REG_DRIVE_EXT.test(f.getName())) out.push(f); else others.push(String(f.getName())); }
  // ไฟล์ .xlsx / .xls / .csv ที่บันทึกเป็น Google ชีต (ชื่อเดียวกันไม่มีนามสกุล) ไว้ในโฟลเดอร์แล้ว = อ่าน Google ชีตแทน
  const gs = {};
  out.forEach(f => { if (f.getMimeType() === REG_DRIVE_TYPES[1]) gs[String(f.getName()).trim()] = true; });
  const res = out.filter(f => f.getMimeType() === REG_DRIVE_TYPES[1] || !gs[String(f.getName()).replace(REG_DRIVE_EXT, '').trim()])
    .sort((a, b) => b.getLastUpdated() - a.getLastUpdated());
  res.others = others;
  return res;
}
// เนื้อไฟล์: DriveApp getBlob · ไม่ได้ (เช่น Access denied: DriveApp ทั้งที่เป็นเจ้าของไฟล์) = ดาวน์โหลดผ่าน Drive API ด้วยสิทธิ์เดียวกันของสคริปต์
function regDriveBlob_(f) {
  let first;
  try { return f.getBlob(); } catch (e) { first = e; }
  const res = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(f.getId()) + '?alt=media&supportsAllDrives=true',
    { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (res.getResponseCode() === 200) return res.getBlob();
  let why = '';
  try { const j = JSON.parse(res.getContentText()); why = (j.error && j.error.message) || ''; } catch (x) { why = String(res.getContentText()).slice(0, 120); }
  throw new Error(String(first && first.message || first) + ' · Drive API ' + res.getResponseCode() + (why ? ': ' + why : '') + ' · แก้ได้: เปิดไฟล์ใน Google Drive → ไฟล์ → บันทึกเป็น Google ชีต (ไว้ในโฟลเดอร์เดียวกัน)');
}
function regDriveRows_(f) {
  const t = f.getMimeType();
  if (t === 'application/vnd.google-apps.spreadsheet') return SpreadsheetApp.openById(f.getId()).getSheets()[0].getDataRange().getDisplayValues().map(r => r.map(v => String(v).trim()));
  if (t === 'text/csv' || /\.csv$/i.test(f.getName())) return Utilities.parseCsv(regDriveBlob_(f).getDataAsString('UTF-8')).map(r => r.map(v => String(v).trim()));
  if (t === 'application/vnd.ms-excel' || /\.xls$/i.test(f.getName())) return xlsAnyRows_(regDriveBlob_(f));
  return xlsxRows_(regDriveBlob_(f));
}

/* ---------- ไฟล์ .xls: Excel 97–2003 (BIFF8 / BIFF5 ใน Compound File) หรือไฟล์ HTML / XML Spreadsheet 2003 / ข้อความ ที่ตั้งชื่อเป็น .xls ---------- */
// ระบบโรงพยาบาลหลายระบบส่งออก .xls ที่ข้างในเป็นตาราง HTML หรือข้อความคั่นด้วย Tab · ดูจากไบต์แรกของไฟล์ (ไม่เชื่อนามสกุล)
function xlsAnyRows_(blob) {
  const raw = blob.getBytes(), u = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u[i] = raw[i] & 255;
  if (u[0] === 0xD0 && u[1] === 0xCF && u[2] === 0x11 && u[3] === 0xE0) return biffRows_(u);
  if (u[0] === 0x50 && u[1] === 0x4B) return xlsxRows_(blob);   // .xlsx ที่ตั้งชื่อเป็น .xls
  const t = textOf_(blob, u);
  if (/urn:schemas-microsoft-com:office:spreadsheet/.test(t) && /<(?:ss:)?Row\b/.test(t)) return ssmlRows_(t);   // ก่อน HTML: มีแท็ก <Table> เหมือนกัน
  if (/<table\b/i.test(t)) return htmlRows_(t);
  const lines = t.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
  if (lines.some(l => l.indexOf('\t') >= 0)) return lines.map(l => l.split('\t').map(v => v.replace(/^"|"$/g, '').trim()));
  return Utilities.parseCsv(lines.join('\n')).map(r => r.map(v => String(v).trim()));
}
// ข้อความของไฟล์: BOM · charset ใน HTML / XML · ภาษาไทย 8 บิต (TIS-620 / Windows-874) ถอดเอง · อื่นๆ UTF-8
function textOf_(blob, u) {
  if (u[0] === 0xFF && u[1] === 0xFE) return blob.getDataAsString('UTF-16LE');
  if (u[0] === 0xFE && u[1] === 0xFF) return blob.getDataAsString('UTF-16BE');
  let head = '';
  for (let i = 0; i < Math.min(u.length, 4096); i++) head += String.fromCharCode(u[i]);
  const m = /charset\s*=\s*["']?([\w-]+)/i.exec(head) || /encoding\s*=\s*["']([\w-]+)/i.exec(head), cs = m ? m[1].toLowerCase() : '';
  if (/^(tis-?620|(x-)?windows-874|cp874|ms874|iso-8859-11)$/.test(cs)) return cp874_(u);
  if (cs && !/^utf-?8$/.test(cs)) { try { return blob.getDataAsString(cs); } catch (e) { /* ชื่อ charset ที่ไม่รู้จัก: ลอง UTF-8 */ } }
  const t = blob.getDataAsString('UTF-8');
  return t.indexOf('\uFFFD') >= 0 && u.some(b => b >= 0xA1 && b <= 0xFB) ? cp874_(u) : t;
}
// TIS-620 / Windows-874: 0xA1–0xFB = ก–๛ (U+0E01–U+0E5B)
function cp874_(u, from, to) {
  const W = { 0x80: 0x20AC, 0x85: 0x2026, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201C, 0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0xA0: 0xA0 };
  let s = '';
  for (let i = from || 0, n = to == null ? u.length : to; i < n; i++) { const b = u[i]; s += String.fromCharCode(b < 0x80 ? b : b >= 0xA1 && b <= 0xFB ? b + 0x0D60 : W[b] || 0xFFFD); }
  return s;
}
// ตาราง HTML: แถว = <tr> · ช่อง = <td> / <th> (ปิดหรือไม่ปิดแท็กก็ได้ · colspan = เว้นช่อง)
function htmlRows_(t) {
  const clean = v => xmlText_(v.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ')).replace(/[\s\u00A0]+/g, ' ').trim();
  t = t.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');
  return (t.match(/<tr\b[\s\S]*?(?=<tr\b|<\/table>|$)/gi) || []).map(tr => {
    const r = [], re = /<t[dh]\b([^>]*)>([\s\S]*?)(?=<t[dh]\b|<\/tr>|$)/gi;
    let m;
    while ((m = re.exec(tr))) {
      r.push(clean(m[2]));
      const span = +((/\bcolspan\s*=\s*["']?(\d+)/i.exec(m[1]) || [])[1] || 1);
      for (let k = 1; k < Math.min(span, 50); k++) r.push('');
    }
    return r;
  });
}
// XML Spreadsheet 2003: <Row> <Cell ss:Index> <Data>
function ssmlRows_(t) {
  return (t.match(/<(?:ss:)?Row\b[^>]*>[\s\S]*?<\/(?:ss:)?Row>/g) || []).map(rw => {
    const r = [];
    (rw.match(/<(?:ss:)?Cell\b[^>]*?(?:\/>|>[\s\S]*?<\/(?:ss:)?Cell>)/g) || []).forEach(c => {
      const idx = /\bss:Index="(\d+)"/.exec(c);
      if (idx) while (r.length < +idx[1] - 1) r.push('');
      const d = /<(?:ss:)?Data\b[^>]*>([\s\S]*?)<\/(?:ss:)?Data>/.exec(c);
      r.push(d ? xmlText_(d[1].replace(/<[^>]*>/g, '')).trim() : '');
    });
    return r;
  });
}
// Compound File (OLE2): stream ที่ชื่อตรง (ไม่สนตัวพิมพ์) ตามลำดับใน want → Uint8Array · ไม่มี = null
function cfbStream_(u, want) {
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength), u32 = o => dv.getUint32(o, true);
  const ss = 1 << dv.getUint16(30, true), mss = 1 << dv.getUint16(32, true), sec = n => (n + 1) * ss, END = 0xFFFFFFFA;
  const nFat = u32(44), dir0 = u32(48), cutoff = u32(56), mf0 = u32(60), difat0 = u32(68);
  const fatSecs = [];
  for (let i = 0; i < 109 && fatSecs.length < nFat; i++) fatSecs.push(u32(76 + i * 4));
  for (let d = difat0, g = 0; fatSecs.length < nFat && d < END && g < 4096; g++) {
    const o = sec(d), per = ss / 4 - 1;
    for (let i = 0; i < per && fatSecs.length < nFat; i++) fatSecs.push(u32(o + i * 4));
    d = u32(o + per * 4);
  }
  const table = secs => { const t = []; secs.forEach(s => { const o = sec(s); for (let i = 0; i < ss / 4 && o + i * 4 + 4 <= u.length; i++) t.push(u32(o + i * 4)); }); return t; };
  const fat = table(fatSecs);
  const chain = (start, t) => { const out = []; for (let s = start, g = 0; s < END && s < t.length && g <= t.length; g++) { out.push(s); s = t[s]; } return out; };
  const read = (start, size) => {
    const parts = chain(start, fat), buf = new Uint8Array(parts.length * ss);
    parts.forEach((s, i) => buf.set(u.subarray(sec(s), Math.min(u.length, sec(s) + ss)), i * ss));
    return size == null ? buf : buf.subarray(0, Math.min(size, buf.length));
  };
  const dir = read(dir0), ents = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const nl = dir[o + 64] | (dir[o + 65] << 8), type = dir[o + 66];
    if (!type) continue;
    let name = '';
    for (let i = 0; i + 1 < Math.min(nl - 2, 64); i += 2) name += String.fromCharCode(dir[o + i] | (dir[o + i + 1] << 8));
    ents.push({ name: name, type: type, start: (dir[o + 116] | (dir[o + 117] << 8) | (dir[o + 118] << 16) | (dir[o + 119] << 24)) >>> 0, size: (dir[o + 120] | (dir[o + 121] << 8) | (dir[o + 122] << 16) | (dir[o + 123] << 24)) >>> 0 });
  }
  let e = null;
  want.some(w => (e = ents.filter(x => x.type === 2 && x.name.toLowerCase() === w)[0]));
  if (!e) return null;
  const root = ents.filter(x => x.type === 5)[0];
  if (e.size >= cutoff || !root) return read(e.start, e.size);
  // stream เล็ก (ต่ำกว่า 4096 ไบต์) อยู่ใน mini stream ของ Root Entry
  const mini = read(root.start, root.size), mfat = table(chain(mf0, fat)), parts = chain(e.start, mfat), buf = new Uint8Array(parts.length * mss);
  parts.forEach((s, i) => buf.set(mini.subarray(s * mss, Math.min(mini.length, s * mss + mss)), i * mss));
  return buf.subarray(0, Math.min(e.size, buf.length));
}
// BIFF8 (Excel 97–2003) / BIFF5: แผ่นงานแรก → แถวเป็นข้อความ (ตัวเลขจำนวนเต็มไม่มีทศนิยม · สูตรใช้ค่าที่คำนวณไว้)
function biffRows_(u) {
  const b = cfbStream_(u, ['workbook', 'book']);
  if (!b) throw new Error('ไฟล์ .xls นี้ไม่มีข้อมูลแผ่นงาน (ไม่พบ Workbook)');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), u16 = o => dv.getUint16(o, true), n = b.length, recs = [];
  for (let p = 0; p + 4 <= n;) { const len = u16(p + 2); recs.push({ t: u16(p), p: p + 4, len: len, at: p }); p += 4 + len; }
  if (!recs.length || recs[0].t !== 0x0809) throw new Error('ไฟล์ .xls รุ่นนี้อ่านไม่ได้ (รองรับ Excel 97–2003) · เปิดไฟล์แล้วบันทึกเป็น .xlsx หรือ Google ชีต');
  const biff8 = u16(recs[0].p) === 0x0600;
  let cp = 1252, sst = [], sheetAt = -1;
  // ข้อความ 8 บิตของ BIFF5: ตาม CODEPAGE (874 = ไทย) · BIFF8 ไม่บีบอัด = UTF-16
  const str8 = (from, cnt) => { if (cp === 874) return cp874_(b, from, from + cnt); let s = ''; for (let i = 0; i < cnt; i++) s += String.fromCharCode(b[from + i]); return s; };
  const ustr = o => {   // XLUnicodeString (BIFF8) / ShortString (BIFF5) ในเรคคอร์ดเดียว
    const cch = u16(o);
    if (!biff8) return str8(o + 2, cch);
    const hi = b[o + 2] & 1;
    let s = '';
    for (let i = 0; i < cch; i++) s += String.fromCharCode(hi ? u16(o + 3 + i * 2) : b[o + 3 + i]);
    return s;
  };
  for (let i = 1; i < recs.length && recs[i].t !== 0x000A; i++) {
    const r = recs[i];
    if (r.t === 0x0042) cp = u16(r.p);
    else if (r.t === 0x0085 && b[r.p + 5] === 0 && sheetAt < 0) sheetAt = dv.getUint32(r.p, true);   // แผ่นงานแรก (worksheet)
    else if (r.t === 0x00FC) sst = sstOf_(b, recs, i);
  }
  const rows = [], put = (row, col, v) => { if (col < 1024) (rows[row] = rows[row] || [])[col] = v; };
  const num = v => (Number.isInteger(v) ? String(v) : String(Math.round(v * 1e10) / 1e10));
  const rk = o => { const x = dv.getUint32(o, true); let v; if (x & 2) v = (x | 0) >> 2; else { const t = new DataView(new ArrayBuffer(8)); t.setUint32(4, x & 0xFFFFFFFC, true); v = t.getFloat64(0, true); } return num(x & 1 ? v / 100 : v); };
  let start = recs.findIndex(r => r.at === sheetAt && r.t === 0x0809), fcell = null;
  if (start < 0) start = recs.findIndex((r, i) => i > 0 && r.t === 0x0809);
  if (start < 0) return [];
  for (let i = start + 1; i < recs.length && recs[i].t !== 0x000A; i++) {
    const r = recs[i], p = r.p, row = u16(p), col = u16(p + 2);
    switch (r.t) {
      case 0x00FD: put(row, col, sst[dv.getUint32(p + 6, true)] || ''); break;   // LABELSST
      case 0x0204: case 0x00D6: put(row, col, ustr(p + 6)); break;   // LABEL / RSTRING
      case 0x0203: put(row, col, num(dv.getFloat64(p + 6, true))); break;   // NUMBER
      case 0x027E: put(row, col, rk(p + 6)); break;   // RK
      case 0x00BD: for (let k = 0, c = col; p + 4 + k * 6 + 6 <= p + r.len - 2; k++, c++) put(row, c, rk(p + 4 + k * 6 + 2)); break;   // MULRK
      case 0x0205: if (!b[p + 7]) put(row, col, b[p + 6] ? 'TRUE' : 'FALSE'); break;   // BOOLERR
      case 0x0006:   // FORMULA: ค่าที่คำนวณไว้ (ข้อความอยู่ในเรคคอร์ด STRING ถัดไป)
        if (u16(p + 12) !== 0xFFFF) put(row, col, num(dv.getFloat64(p + 6, true)));
        else if (b[p + 6] === 0) fcell = [row, col];
        else if (b[p + 6] === 1) put(row, col, b[p + 8] ? 'TRUE' : 'FALSE');
        break;
      case 0x0207: if (fcell) { put(fcell[0], fcell[1], ustr(p)); fcell = null; } break;   // STRING
    }
  }
  const out = [];
  for (let i = 0; i < rows.length; i++) out.push(Array.from(rows[i] || [], v => (v == null ? '' : String(v).trim())));
  return out;
}
// ข้อความใช้ร่วม (SST) ของ BIFF8: ข้อความยาวต่อในเรคคอร์ด CONTINUE ได้ (ต้นเรคคอร์ดใหม่มีไบต์บอกแบบตัวอักษรอีกครั้ง)
function sstOf_(b, recs, i) {
  const segs = [recs[i]];
  for (let j = i + 1; j < recs.length && recs[j].t === 0x003C; j++) segs.push(recs[j]);
  let si = 0, p = segs[0].p + 8, end = segs[0].p + segs[0].len;
  const total = (b[segs[0].p + 4] | (b[segs[0].p + 5] << 8) | (b[segs[0].p + 6] << 16) | (b[segs[0].p + 7] << 24)) >>> 0, out = [];
  const next = () => { if (++si >= segs.length) return false; p = segs[si].p; end = p + segs[si].len; return true; };
  const byte = () => { if (p >= end && !next()) throw new Error('eof'); return b[p++]; };
  const skip = k => { while (k > 0) { if (p >= end && !next()) return; const t = Math.min(k, end - p); p += t; k -= t; } };
  try {
    for (let k = 0; k < total; k++) {
      if (p >= end && !next()) break;
      const cch = byte() | (byte() << 8);
      let fl = byte();
      const rich = fl & 8 ? byte() | (byte() << 8) : 0, ext = fl & 4 ? (byte() | (byte() << 8) | (byte() << 16) | (byte() << 24)) >>> 0 : 0;
      const ch = [];
      for (let left = cch; left > 0;) {
        if (p >= end) { if (!next()) break; fl = b[p++]; }
        const hi = fl & 1, take = Math.min(left, hi ? (end - p) >> 1 : end - p);
        for (let x = 0; x < take; x++) { ch.push(hi ? b[p] | (b[p + 1] << 8) : b[p]); p += hi ? 2 : 1; }
        left -= take;
        if (!take) p = end;
      }
      skip(rich * 4 + ext);
      let s = '';
      for (let x = 0; x < ch.length; x += 4096) s += String.fromCharCode.apply(null, ch.slice(x, x + 4096));
      out.push(s);
    }
  } catch (e) { /* ไฟล์ขาด: ใช้เท่าที่อ่านได้ */ }
  return out;
}
// หัวตาราง: แถวแรกที่มีหัวคอลัมน์ของ HN (ไม่ได้ตั้ง = คำว่า HN) ใน 15 แถวแรก
function regDriveHead_(rows, hnCol) {
  const want = String(hnCol || '').trim();
  for (let i = 0; i < Math.min(15, rows.length); i++) if (rows[i].some(v => (want ? v === want : /^hn$/i.test(v)))) return i;
  return -1;
}
// เดาหัวคอลัมน์ของแต่ละช่องจากชื่อหัวคอลัมน์
function regDriveGuess_(head) {
  const find = re => head.filter(h => re.test(h))[0] || '';
  return { hn: find(/^hn$/i), name: find(/ชื่อ.*(สกุล|คนไข้|ผู้ป่วย)|^ชื่อ$/), doc: find(/แพทย์|doctor/i), icd: find(/icd\s*-?10/i), dx: find(/^dx\b|diag/i), right: find(/^mc$|สิทธิ/i), note: '',
    consult: find(/consult|รับปรึกษา/i), visit: find(/วันที่นัด|นัดมา|^นัด$/), chan: find(/ช่องทาง|channel/i), refer: find(/ส่งตัว|ส่งต่อจาก|ต้นทาง|refer\s*from/i),
    filterCol: find(/คลินิกที่มารับบริการ/) || find(/คลินิก|clinic/i) };
}
// วันที่ในไฟล์ → YYYY-MM-DD: วันที่ของชีต · YYYY-MM-DD · d/m/yy(yy) · d-Mon-yy · 1 ต.ค. 69 · เลขวันที่ของ Excel · ปี พ.ศ. (เกิน 2400 / 2 หลักตั้งแต่ 40) = ลบ 543 · อ่านไม่ได้ = ''
const REG_MON_ = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, 'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4, 'พ.ค.': 5, 'มิ.ย.': 6, 'ก.ค.': 7, 'ส.ค.': 8, 'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12 };
function regDate_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v) ? '' : Utilities.formatDate(v, tz || 'Asia/Bangkok', 'yyyy-MM-dd');
  const s = String(v == null ? '' : v).trim(), two = n => (n < 10 ? '0' : '') + n;
  if (!s) return '';
  const out = (y, m, d) => {
    y = +y; m = +m; d = +d;
    if (y < 100) y = y >= 40 ? 2500 + y : 2000 + y;
    if (y > 2400) y -= 543;
    return y > 1900 && y < 2200 && m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate() ? y + '-' + two(m) + '-' + two(d) : '';   // วันที่ไม่มีจริง (31/02) = ''
  };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return out(m[1], m[2], m[3]);
  m = /^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/.exec(s);
  if (m) return out(m[3], m[2], m[1]);
  m = /^(\d{1,2})[\s-]+([A-Za-z]{3})[A-Za-z]*\.?[\s-]+(\d{2,4})$/.exec(s) || /^(\d{1,2})\s*([ก-๙]\.[ก-๙]{1,2}\.)\s*(\d{2,4})$/.exec(s);
  if (m && REG_MON_[m[2].toLowerCase()]) return out(m[3], REG_MON_[m[2].toLowerCase()], m[1]);
  m = /^(\d{5})(?:\.\d+)?$/.exec(s);
  if (m && +m[1] > 20000 && +m[1] < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + +m[1] * 864e5); return out(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
  return '';
}
// ชื่อพร้อมคำนำหน้า → { title, name } · น.ส. = นางสาว · เด็กชาย = ด.ช. · ยศ / คำย่ออื่น (ร.ต.อ., พญ.) เป็นคำนำหน้าตามเดิม
const REG_TITLES_ = [['นางสาว', 'นางสาว'], ['น.ส.', 'นางสาว'], ['นาง', 'นาง'], ['นาย', 'นาย'], ['เด็กชาย', 'ด.ช.'], ['ด.ช.', 'ด.ช.'], ['เด็กหญิง', 'ด.ญ.'], ['ด.ญ.', 'ด.ญ.']];
function regSplitName_(raw) {
  const s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  for (let i = 0; i < REG_TITLES_.length; i++) if (s.indexOf(REG_TITLES_[i][0]) === 0 && s.length > REG_TITLES_[i][0].length) return { title: REG_TITLES_[i][1], name: s.slice(REG_TITLES_[i][0].length).trim() };
  const m = /^((?:[ก-๙]{1,4}\.){1,4})\s*(\S[\s\S]*)$/.exec(s);
  return m ? { title: m[1], name: m[2] } : { title: '', name: s };
}
// แพทย์ → รหัสใน ตั้งค่า → แพทย์ (ชื่อตรงกัน ไม่สนคำนำหน้า นพ. / พญ. และช่องว่าง)
const docKey_ = v => String(v == null ? '' : v).trim().replace(/^(?:[ก-๙]{1,3}\.){1,3}\s*/, '').replace(/\s+/g, '').toLowerCase();
function regDocCode_(raw, cfg) {
  const k = docKey_(raw);
  if (!k) return '';
  const list = (Array.isArray(cfg.doctors) ? cfg.doctors : []).filter(x => x && x.code);
  const d = list.filter(x => docKey_(x.name) === k || String(x.code).toUpperCase() === String(raw).trim().toUpperCase())[0];
  if (d) return String(d.code).toUpperCase();
  // ชื่อต้นตรงกันคนเดียว (ตั้งค่าใส่แค่ชื่อ หรือสกุลสะกดต่างกัน)
  const first = v => String(v == null ? '' : v).trim().replace(/^(?:[ก-๙]{1,3}\.){1,3}\s*/, '').split(/\s+/)[0].toLowerCase();
  const f = first(raw), hit = f ? list.filter(x => first(x.name) === f) : [];
  return hit.length === 1 ? String(hit[0].code).toUpperCase() : '';
}
// สิทธิการรักษา → ตัวเลือกใน ตั้งค่า → ลงทะเบียน (ตรงกัน หรือกลุ่มเดียวกัน) · ไม่ตรง = ข้อความเดิม
function regRightOf_(raw, cfg) {
  const v = String(raw == null ? '' : raw).trim(), opts = (cfg.reg && Array.isArray(cfg.reg.rights) ? cfg.reg.rights : []).map(String);
  if (!v || opts.indexOf(v) >= 0) return v;
  const groups = [[/ถ้วนหน้า|บัตรทอง|\bUC\b/, /บัตรทอง|UC|ถ้วนหน้า/], [/ประกันสังคม/, /ประกันสังคม/], [/รัฐวิสาหกิจ/, /รัฐวิสาหกิจ/], [/ข้าราชการ|บำนาญ|อปท/, /ข้าราชการ/], [/ชำระเงินเอง|เงินสด/, /ชำระเงิน|เงินสด/]];
  for (let i = 0; i < groups.length; i++) if (groups[i][0].test(v)) { const o = opts.filter(x => groups[i][1].test(x))[0]; if (o) return o; }
  return v;
}
function regSexOf_(title, cfg) {
  const g = cfg.order && Array.isArray(cfg.order.genders) ? cfg.order.genders : ['Male', 'Female'];
  const f = /^(นาง|นางสาว|ด\.ญ\.)$/.test(title), m = /^(นาย|ด\.ช\.)$/.test(title);
  return (f || m) ? g.filter(x => (f ? /^(female|หญิง)/i : /^(male|ชาย)/i).test(x))[0] || '' : '';
}
// แถวในไฟล์ → รายการลงทะเบียน (ไม่ตรงตัวกรองคลินิก / ไม่มี HN = ข้าม)
function regDriveRecs_(rows, cfg, d) {
  const set = d.map || {}, hi = regDriveHead_(rows, set.hn);
  if (hi < 0) return { recs: [], filtered: 0, err: 'ไม่พบหัวคอลัมน์ ' + (set.hn || 'HN') };
  const head = rows[hi], g = regDriveGuess_(head), map = {};
  ['hn', 'name', 'doc', 'icd', 'dx', 'right', 'note', 'consult', 'visit', 'chan', 'refer'].forEach(k => { map[k] = String((k in set ? set[k] : g[k]) || '').trim(); });
  if (!map.hn || !map.name) return { recs: [], filtered: 0, err: 'ยังไม่ได้เลือกคอลัมน์ ' + (map.hn ? 'ชื่อ-สกุล' : 'HN') };
  const col = k => (map[k] ? head.indexOf(map[k]) : -1), cell = (r, k) => { const i = col(k); return i < 0 ? '' : String(r[i] || '').trim(); };
  const flt = d.filter || {}, fc = flt.col && flt.col !== '-' ? head.indexOf(String(flt.col).trim()) : -1, fv = Array.isArray(flt.vals) ? flt.vals.map(String) : [];
  const out = [];
  let filtered = 0;
  rows.slice(hi + 1).forEach(r => {
    const hn = cell(r, 'hn').replace(/\s+/g, '');
    if (!hn || hn === String(map.hn).trim()) return;   // แถวว่าง / หัวตารางซ้ำ
    if (fc >= 0 && fv.length && fv.indexOf(String(r[fc] || '').trim()) < 0) { filtered++; return; }
    const nm = regSplitName_(cell(r, 'name')), docRaw = cell(r, 'doc'), doc = regDocCode_(docRaw, cfg), icds = cell(r, 'icd').toUpperCase().match(/[A-Z]\d{2}(?:\.\d{1,2})?/g) || [], icd = icds.filter(x => /^[CD]/.test(x))[0] || icds[0] || '';
    const note = [cell(r, 'note'), docRaw && !doc ? 'แพทย์: ' + docRaw : ''].filter(Boolean).join(' · ');
    out.push({ hn: hn.slice(0, 40), title: nm.title.slice(0, 40), name: nm.name.slice(0, 200), sex: regSexOf_(nm.title, cfg), birth: '', phone: '', right: regRightOf_(cell(r, 'right'), cfg).slice(0, 200), doc: doc, icd: icd, dx: cell(r, 'dx').slice(0, 2000), note: note.slice(0, 2000),
      consult: regDate_(cell(r, 'consult')), visit: regDate_(cell(r, 'visit')), chan: cell(r, 'chan').slice(0, 200), refer: cell(r, 'refer').replace(/\s+/g, ' ').slice(0, 200), icds: icds.filter((x, i) => x !== icd && icds.indexOf(x) === i).join(', ').slice(0, 200) });
  });
  return { recs: out, filtered: filtered, err: '' };
}
// HN สำหรับเทียบว่ามีในระบบแล้ว: ไม่สนช่องว่าง ขีด จุด ตัวพิมพ์ และเลข 0 นำหน้า (HN ตัวเลขล้วน)
const hnLoose_ = v => { const t = String(v == null ? '' : v).replace(/[\s\-\/.]/g, '').toUpperCase(); return /^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, '') : t; };
const timeOf_ = v => (Object.prototype.toString.call(v) === '[object Date]' ? (isNaN(v) ? '' : v.toISOString()) : String(v == null ? '' : v).trim());
// HN ที่มีในระบบแล้ว → { t: ตารางแรกที่พบ (ลงทะเบียนก่อน แล้วเคส กิจกรรม CT-SIM นัด นัดใส่แร่ Vac-Lok),
//   at: เวลาแรกสุดที่พบในแถบอื่นที่ไม่ใช่ลงทะเบียน (Created หรือวันที่ของรายการ · ไม่มีทั้งคู่ = '' = เก่าสุด · ไม่พบในแถบอื่น = null) }
// อ่านเฉพาะคอลัมน์ HN, Created และวันที่ของแต่ละชีต
function hnSeen_(ss) {
  const out = {}, order = ['reg'].concat(Object.keys(TABLES).filter(t => t !== 'reg' && t !== 'spq' && t !== 'dq'));   // นัดเทคนิคพิเศษที่นำเข้าไม่นับ (นำเข้าเพราะ HN มีในแถบอื่นอยู่แล้ว) · แจกงานแพทย์ไม่นับ (ยังดึงลงทะเบียนจาก Google Drive ได้)
  order.forEach(t => {
    const def = TABLES[t], head = k => (def.fields.filter(x => x[0] === k)[0] || [])[1];
    const sh = head('hn') ? sheet_(ss, def.sheet) : null;
    if (!sh || sh.getLastRow() < 2) return;
    const hdr = headerOf_(sh), n = sh.getLastRow() - 1, colOf = k => (head(k) ? hdr.indexOf(head(k)) : -1), read = c => (c < 0 ? null : sh.getRange(2, c + 1, n, 1).getValues());
    const hn = read(colOf('hn'));
    if (!hn) return;
    const cr = t === 'reg' ? null : read(colOf('created')), dt = t === 'reg' ? null : read(colOf('date') >= 0 ? colOf('date') : colOf('in'));
    hn.forEach((r, i) => {
      const k = hnLoose_(r[0]);
      if (!k) return;
      const x = out[k] || (out[k] = { t: t, at: null });
      if (t === 'reg') return;
      const at = timeOf_(cr && cr[i][0]) || timeOf_(dt && dt[i][0]);
      if (x.at === null || at < x.at) x.at = at;
    });
  });
  return out;
}
function knownHns_(ss) { const seen = hnSeen_(ss), o = {}; Object.keys(seen).forEach(k => { o[k] = seen[k].t; }); return o; }
// รายการที่ดึงจาก Google Drive และยังไม่มีใครแก้ (Updated ว่าง) · ทำทุกครั้งที่ดึง:
// · HN มีในแถบอื่นตั้งแต่ก่อนดึง = ลบ (ดึงด้วย Code.gs รุ่นก่อน 2026-11-08.4 ที่ตรวจเฉพาะแถบลงทะเบียน) · HN ที่เพิ่งมีในแถบอื่นหลังดึง (เช่นลงนัดต่อ) ไม่ลบ
// · แพทย์ที่เคยจับคู่ไม่ได้ (Note "แพทย์: …") ตรงกับ ทีม → แพทย์ แล้ว = ใส่รหัสแพทย์ และเอาออกจาก Note
function regDriveTidy_(ss, cfg, seen, dry) {
  const sh = sheet_(ss, TABLES.reg.sheet), out = { removed: 0, docs: 0, gone: [] };
  if (!sh || sh.getLastRow() < 2) return out;
  const values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues(), hdr = values[0].map(v => String(v).trim()), c = {};
  ['hn', 'by', 'created', 'updated', 'doc', 'note'].forEach(k => { c[k] = hdr.indexOf(TABLES.reg.fields.filter(f => f[0] === k)[0][1]); });
  if (Object.keys(c).some(k => c[k] < 0)) return out;
  const del = [], docs = [], notes = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    docs.push([r[c.doc]]);
    notes.push([r[c.note]]);
    if (String(r[c.by]).indexOf('Google Drive') !== 0 || timeOf_(r[c.updated])) continue;
    const x = seen[hnLoose_(r[c.hn])], made = timeOf_(r[c.created]);
    if (x && x.at !== null && made && x.at < made) { del.push(i + 1); out.gone.push(hnLoose_(r[c.hn])); continue; }
    const note = String(r[c.note] == null ? '' : r[c.note]), m = /(?:^| · )แพทย์: ([^·]+?)\s*$/.exec(note);
    if (m && !String(r[c.doc] == null ? '' : r[c.doc]).trim()) {
      const code = regDocCode_(m[1], cfg);
      if (code) { docs[i - 1] = [code]; notes[i - 1] = [note.slice(0, m.index)]; out.docs++; }
    }
  }
  out.removed = del.length;
  if (dry) return out;   // API 97: ดูก่อนว่ามีอะไรต้องทำ (นอกล็อก)
  if (out.docs || del.length) markDirty_('reg');
  if (out.docs) {
    sh.getRange(2, c.doc + 1, docs.length, 1).setNumberFormat('@').setValues(docs);
    sh.getRange(2, c.note + 1, notes.length, 1).setNumberFormat('@').setValues(notes);
  }
  for (let j = del.length - 1; j >= 0;) {   // ลบจากล่างขึ้นบน ทีละช่วงที่ติดกัน
    let k = j;
    while (k > 0 && del[k - 1] === del[k] - 1) k--;
    sh.deleteRows(del[k], j - k + 1);
    j = k - 1;
  }
  out.removed = del.length;
  return out;
}
function regDriveStatus_() {
  try { const v = JSON.parse(propRead_(REG_DRIVE_PROP) || 'null'); if (v) { delete v.files; delete v.sig; } return v; } catch (e) { return null; }
}
// แอดมิน: ตรวจโฟลเดอร์ก่อนบันทึกการตั้งค่า · คืนรายชื่อไฟล์ หัวคอลัมน์ของไฟล์ล่าสุด ช่องที่เดาให้ และค่าของคอลัมน์ตัวกรอง (ไม่ส่งข้อมูลผู้ป่วย)
function regDriveCheck(set, token) {
  const u = who_(token);
  if (!u.isAdmin && !(u.sub && u.sub.indexOf('tabs') >= 0)) throw new Error('ตั้งค่าการดึงจาก Google Drive ได้เฉพาะแอดมิน');
  set = set && typeof set === 'object' ? set : {};
  const files = regDriveFiles_(regDriveFolder_(set.url));
  if (!files.length) return { files: [], headers: [], guess: {}, filterVals: [], msg: 'ไม่พบไฟล์ .xlsx / .xls / Google Sheets / .csv ในโฟลเดอร์นี้' + (files.others.length ? ' (มีแต่ไฟล์ที่อ่านไม่ได้: ' + files.others.slice(0, 5).join(', ') + ')' : '') };
  let rows;
  try { rows = regDriveRows_(files[0]); } catch (e) { throw new Error('อ่านไฟล์ ' + files[0].getName() + ' ไม่ได้: ' + e.message); }
  const map = set.map && typeof set.map === 'object' ? set.map : {}, hi = regDriveHead_(rows, map.hn);
  const head = hi < 0 ? (rows[0] || []) : rows[hi], guess = regDriveGuess_(head);
  const fcPick = String((set.filter && set.filter.col) || ''), fcName = fcPick === '-' ? '' : fcPick || guess.filterCol || '', fc = head.indexOf(fcName), mapped = k => String((k in map ? map[k] : guess[k]) || '');
  const privacy = ['hn', 'name'].some(k => mapped(k) === fcName);   // ไม่ส่งค่าของคอลัมน์ HN / ชื่อ
  const vals = {};
  if (fc >= 0 && !privacy) rows.slice(hi + 1).forEach(r => { const v = String(r[fc] || '').trim(); if (v) vals[v] = (vals[v] || 0) + 1; });
  const filterVals = Object.keys(vals).length <= 40 ? Object.keys(vals).sort((a, b) => vals[b] - vals[a]).map(v => ({ v: v, n: vals[v] })) : [];
  // แพทย์ในไฟล์ (ไม่ใช่ข้อมูลผู้ป่วย) กับรหัสที่จับคู่ได้ใน ตั้งค่า → แพทย์ · ไม่ตรง = ลงทะเบียนโดยไม่มีแพทย์ (ชื่อแพทย์ไปอยู่ใน Note)
  const dc = head.indexOf(mapped('doc')), docs = {}, cfg = readConfig_(ss_()) || {};
  if (dc >= 0 && [mapped('hn'), mapped('name')].indexOf(head[dc]) < 0) rows.slice(hi + 1).forEach(r => { const v = String(r[dc] || '').trim(); if (v) docs[v] = (docs[v] || 0) + 1; });
  const docList = Object.keys(docs).length <= 60 ? Object.keys(docs).sort((a, b) => docs[b] - docs[a]).map(v => ({ v: v, n: docs[v], code: regDocCode_(v, cfg) })) : [];
  return { files: files.slice(0, 30).map(f => ({ name: f.getName(), at: f.getLastUpdated().toISOString() })), nFiles: files.length, headers: head.filter(Boolean), headRow: hi + 1, rows: Math.max(0, rows.length - hi - 1), guess: guess,
    filterCol: fcName, filterVals: filterVals, filterMany: Object.keys(vals).length > 40, filterPrivate: privacy, docs: docList };
}
/**
 * ดึงผู้ป่วยจากโฟลเดอร์ (ผู้ที่บันทึกในแถบลงทะเบียนได้) · force = กดปุ่ม "ดึงตอนนี้" (ไม่ต้องเปิดดึงอัตโนมัติ · อ่านไฟล์ที่ดึงแล้วอีกรอบด้วย)
 * ไม่ force: ดึงเมื่อเปิดดึงอัตโนมัติ และดึงครั้งก่อนเกินรอบที่ตั้ง (every นาที) · คืน { at, added, skipped, filtered, read, nFiles, err }
 */
function regDrivePull(force, token) {
  const u = requireEdit_(token, EDIT_VIEWS.reg), ss = ss_();
  return regDriveSync_(ss, readConfig_(ss) || {}, !!force, String(u.name || u.username || u.me || ''));
}
function regDriveSync_(ss, cfg, force, by) {
  const d = (cfg.reg && cfg.reg.drive) || {}, props = PropertiesService.getScriptProperties();
  const load = () => { try { return JSON.parse(props.getProperty(REG_DRIVE_PROP) || 'null') || { files: {} }; } catch (e) { return { files: {} }; } };
  const out = x => { const y = JSON.parse(JSON.stringify(x)); delete y.files; delete y.sig; return y; };
  if (!d.url) { if (force) throw new Error('ยังไม่ได้ตั้งลิงก์โฟลเดอร์ (ตั้งค่า → ลงทะเบียน → ดึงจาก Google Drive)'); return out(load()); }
  const due = st => force || (d.on && !(st.at && Date.now() - Date.parse(st.at) < Math.max(5, +d.every || 60) * 60000 - 30000));
  if (!due(load())) return out(load());
  // API 97: อ่านโฟลเดอร์ ไฟล์ และ HN ทั้งระบบ (ช้า: หลายวินาที) ทำนอกล็อกบันทึก · เดิมถือล็อกตลอด = ทุกคนที่กดบันทึกช่วงนั้นต้องรอ
  // กันดึงซ้อนกันด้วยธงในแคช (5 นาที) · ล็อกเฉพาะตอนเขียนลงแถบลงทะเบียน (และเฉพาะเมื่อมีอะไรต้องเขียน)
  const BUSY = 'regDrive_busy';
  let cache = null, busy = null;
  try { cache = CacheService.getScriptCache(); busy = cache.get(BUSY); } catch (e) { cache = null; busy = null; }   // แคชใช้ไม่ได้: ดึงต่อโดยไม่มีธง
  if (busy) { if (force) throw new Error('กำลังดึงจาก Google Drive อยู่ (เริ่มเมื่อไม่ถึง 5 นาทีที่แล้ว) · รอสักครู่แล้วลองใหม่'); return out(load()); }
  try { if (cache) cache.put(BUSY, '1', 300); } catch (e) { /* แคชใช้ไม่ได้: ดึงต่อ */ }
  try {
    let st = load();
    if (!due(st)) return out(st);   // อีกคนเพิ่งดึงเสร็จ
    // เปลี่ยนโฟลเดอร์ คอลัมน์ หรือตัวกรอง = อ่านทุกไฟล์ใหม่ (แถวที่เคยไม่ตรงตัวกรองอาจตรงแล้ว)
    const now = new Date().toISOString(), sig = JSON.stringify([d.url, d.map || {}, d.filter || {}]), all = force || st.sig !== sig, seen = all ? {} : Object.assign({}, st.files || {});
    try {
      // ---- นอกล็อก: รายชื่อไฟล์ · อ่านไฟล์ที่เปลี่ยน · HN ที่มีในระบบ ----
      const files = regDriveFiles_(regDriveFolder_(d.url)), errs = [], gots = [];
      if (!files.length) errs.push('ไม่พบไฟล์ .xlsx / .xls / .csv / Google ชีต ในโฟลเดอร์' + (files.others.length ? ' (มีแต่ไฟล์ที่อ่านไม่ได้: ' + files.others.slice(0, 5).join(', ') + ')' : ''));
      else if (files.others.length) errs.push('ไฟล์ชนิดที่อ่านไม่ได้ (ข้าม): ' + files.others.slice(0, 5).join(', ') + (files.others.length > 5 ? ' …' : '') + ' · บันทึกเป็น .xlsx หรือ Google ชีต');
      let skipped = 0, inSys = 0, filtered = 0, read = 0, rows = 0;
      files.forEach(f => {
        const id = f.getId(), mod = f.getLastUpdated().toISOString();
        if (!all && seen[id] === mod) return;   // ไฟล์ไม่เปลี่ยนตั้งแต่ดึงครั้งก่อน
        read++;
        let got;
        try { got = regDriveRecs_(regDriveRows_(f), cfg, d); } catch (e) { errs.push(f.getName() + ': อ่านไฟล์ไม่ได้ (' + e.message + ')'); return; }
        if (got.err) { errs.push(f.getName() + ': ' + got.err); return; }
        filtered += got.filtered;
        rows += got.recs.length + got.filtered;
        if (!got.recs.length && !got.filtered) errs.push(f.getName() + ': ไม่มีแถวที่มี HN ใต้หัวตาราง');
        gots.push({ name: f.getName(), recs: got.recs });
        seen[id] = mod;
      });
      const seenHn = hnSeen_(ss), arch = regArchHns_(ss), need = regDriveTidy_(ss, cfg, seenHn, true);   // need = มีแถวต้องเก็บกวาดไหม (ยังไม่เขียน)
      const have = {}, add = [], back = {};
      Object.keys(seenHn).forEach(k => { have[k] = seenHn[k].t; });
      need.gone.forEach(k => { have[k] = 'other'; });   // จะลบออกจากแถบลงทะเบียน: ยังมีในแถบอื่น
      gots.forEach(g => g.recs.forEach(r => {
        const k = hnLoose_(r.hn);
        if (have[k] && have[k] !== 'reg' && have[k] !== 'drive' && arch[k]) { back[k] = 1; have[k] = 'reg'; return; }
        if (have[k]) { skipped++; if (have[k] !== 'reg' && have[k] !== 'drive') inSys++; return; }   // HN มีในระบบแล้ว (inSys = ในแถบอื่น ยังไม่ได้ลงทะเบียน)
        have[k] = 'drive';
        add.push(Object.assign(r, { id: Utilities.getUuid(), by: ('Google Drive · ' + g.name).slice(0, 120), created: now, updated: '' }));
      }));
      // ---- ในล็อก (สั้น): เฉพาะเมื่อมีแถวใหม่ / ย้ายกลับ / เก็บกวาด · HN ที่มีคนลงทะเบียนระหว่างอ่านไฟล์ = ไม่เพิ่มซ้ำ ----
      let tidy = { removed: 0, docs: 0, gone: [] }, restored = 0, added = 0;
      if (add.length || Object.keys(back).length || need.removed || need.docs) {
        withLock_(() => {
          if (need.removed || need.docs) tidy = regDriveTidy_(ss, cfg, seenHn);
          const nowHn = add.length ? sheetHns_(ss, 'reg') : {}, fresh = add.filter(r => !nowHn[hnLoose_(r.hn)]);
          skipped += add.length - fresh.length;
          added = fresh.length;
          if (fresh.length) appendNew_(ss, 'reg', fresh);
          restored = Object.keys(back).length ? regMoveBack_(ss, r => back[hnLoose_(r.hn)]).length : 0;
        });
      }
      const keep = {};   // จำเฉพาะไฟล์ที่ยังอยู่ในโฟลเดอร์ (ล่าสุด 100 ไฟล์ · Script property เก็บได้ราว 9 KB)
      files.slice(0, 100).forEach(f => { if (seen[f.getId()]) keep[f.getId()] = seen[f.getId()]; });
      st = { at: now, by: by, added: added, skipped: skipped, inSys: inSys, removed: tidy.removed, docFix: tidy.docs, filtered: filtered, read: read, rows: rows, restored: restored, nFiles: files.length, files: keep, sig: sig, err: errs.join(' · ').slice(0, 400) };
    } catch (e) {
      st = { at: now, by: by, added: 0, skipped: 0, filtered: 0, read: 0, nFiles: 0, files: st.files || {}, sig: st.sig, err: String(e.message || e).slice(0, 400) };
    }
    propSave_(REG_DRIVE_PROP, JSON.stringify(st));
    return out(st);
  } finally { try { if (cache) cache.remove(BUSY); } catch (e) { /* หมดอายุเองใน 5 นาที */ } }
}
// HN ทั้งหมดของตาราง (อ่านคอลัมน์ HN คอลัมน์เดียว) → { hn แบบหลวม: true }
function sheetHns_(ss, table) {
  const sh = sheet_(ss, TABLES[table].sheet), o = {};
  if (!sh || sh.getLastRow() < 2) return o;
  const c = headerOf_(sh).indexOf((TABLES[table].fields.filter(f => f[0] === 'hn')[0] || [])[1]);
  if (c < 0) return o;
  sh.getRange(2, c + 1, sh.getLastRow() - 1, 1).getValues().forEach(r => { const k = hnLoose_(r[0]); if (k) o[k] = true; });
  return o;
}

function regSave(rec, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.reg);
  rec = rec && typeof rec === 'object' ? rec : {};
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const cfg = readConfig_(ss_()) || {}, form = (cfg.reg && cfg.reg.form) || {};
  const miss = [['hn', 'HN'], ['title', 'คำนำหน้า'], ['name', 'ชื่อ-สกุล']].filter(f => (form[f[0]] || 'req') === 'req' && !cut(rec[f[0]], 200)).map(f => f[1]);
  if (miss.length) throw new Error('กรอก ' + miss.join(' '));
  if (!cut(rec.hn, 40) && !cut(rec.name, 200)) throw new Error('กรอก HN หรือชื่อ-สกุล');
  const birth = cut(rec.birth, 10);
  if (birth && !/^\d{4}-\d{2}-\d{2}$/.test(birth)) throw new Error('วันเกิดไม่ถูกต้อง');
  [['consult', 'วันที่รับ Consult'], ['visit', 'วันที่นัดมา']].forEach(f => { const v = cut(rec[f[0]], 10); if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(f[1] + ' ไม่ถูกต้อง'); });
  // รุ่น 2026-11-10.3 (เร็วขึ้น): ไม่อ่านทั้งตาราง · id และ HN อ่านพร้อมกันครั้งเดียว · PIN ตรวจในล็อก (รู้แถวแล้ว) · ที่เก็บถาวรดูคอลัมน์ HN ก่อน (ย้ายเฉพาะเมื่อพบ)
  return withLock_(() => {
    const ss = ss_(), sh = tableSheet_(ss, 'reg'), header = headerOf_(sh);
    const id = cut(rec.id, 80), key = hnKey_(cut(rec.hn, 40)), look = regLookup_(sh, header, id, key), row = look.row;
    pinChange_(u, pin, !!row);   // แก้รายการเดิม = ต้องใส่ PIN · ลงทะเบียนใหม่ไม่ต้อง
    const dup = look.dupRow ? regRowAt_(ss, sh, header, look.dupRow) : null;
    if (dup) throw new Error('HN ' + cut(rec.hn, 40) + ' ลงทะเบียนแล้ว (' + regName_(dup) + ')');
    if (!row && key && regArchHas_(ss, key)) {   // HN อยู่ในที่เก็บถาวร: ย้ายกลับ แล้วบันทึกทับรายการนั้น (ไม่สร้างซ้ำ)
      const back = regMoveBack_(ss, x => hnKey_(x.hn) === key);
      if (back.length) return regSaveInto_(ss, back[0], rec, cut);
    }
    const set = {};
    REG_FIELDS.forEach(k => { set[k] = cut(rec[k], REG_CUT_(k)); });
    const now = new Date().toISOString();
    if (row) set.updated = now;
    else Object.assign(set, { id: id || Utilities.getUuid(), by: String(u.name || u.username || u.me || ''), created: now, updated: '' });
    const at = row || sh.getLastRow() + 1;
    writeFields_(sh, at, header, TABLES.reg.fields.filter(f => f[0] in set), set);
    if (row) return regRowAt_(ss, sh, header, at);
    const out = {};   // รายการใหม่: รู้ทุกช่องแล้ว ไม่ต้องอ่านกลับ
    TABLES.reg.fields.forEach(f => { out[f[0]] = ''; });
    return Object.assign(out, set);
  });
}
// แถวของ id และแถวอื่นที่มี HN เดียวกัน: อ่านสองคอลัมน์ครั้งเดียว · ไม่พบ = 0
function regLookup_(sh, header, id, key) {
  const n = sh.getLastRow() - 1, ic = header.indexOf('id'), hc = header.indexOf('HN'), out = { row: 0, dupRow: 0 };
  const cols = [ic, hc].filter(c => c >= 0);
  if (n < 1 || !cols.length || (!id && !key)) return out;
  const c0 = Math.min.apply(null, cols), v = sh.getRange(2, c0 + 1, n, Math.max.apply(null, cols) - c0 + 1).getValues();
  if (id && ic >= 0) for (let i = 0; i < n; i++) if (String(v[i][ic - c0]) === id) { out.row = i + 2; break; }
  if (key && hc >= 0) for (let i = 0; i < n; i++) if (i + 2 !== out.row && hnKey_(v[i][hc - c0]) === key) { out.dupRow = i + 2; break; }
  return out;
}
// HN นี้อยู่ในที่เก็บถาวรไหม: อ่านเฉพาะคอลัมน์ HN
function regArchHas_(ss, key) {
  const sh = sheet_(ss, TABLES.regArch.sheet);
  if (!sh || sh.getLastRow() < 2) return false;
  const c = headerOf_(sh).indexOf('HN');
  return c >= 0 && sh.getRange(2, c + 1, sh.getLastRow() - 1, 1).getValues().some(r => hnKey_(r[0]) === key);
}
// แถวที่มี HN นี้ (ไม่นับแถว skipRow) · อ่านเฉพาะคอลัมน์ HN · ไม่พบ = 0
function regFindHn_(sh, header, key, skipRow) {
  const c = header.indexOf('HN'), n = sh.getLastRow() - 1;
  if (c < 0 || n < 1) return 0;
  const v = sh.getRange(2, c + 1, n, 1).getValues();
  for (let i = 0; i < n; i++) if (i + 2 !== skipRow && hnKey_(v[i][0]) === key) return i + 2;
  return 0;
}
// หนึ่งแถวของแถบลงทะเบียน (เลขแถวในชีต) → รายการ · ชื่อว่าง (ชีตรุ่นเก่าที่แยกชื่อ/สกุล) = ต่อจากคอลัมน์ชื่อ สกุล
function regRowAt_(ss, sh, header, row) {
  const v = sh.getRange(row, 1, 1, header.length).getValues()[0], r = rowConv_(TABLES.reg, header, tz_(ss)).conv(v);
  if (!r.name) r.name = [header.indexOf('ชื่อ'), header.indexOf('สกุล')].filter(i => i >= 0).map(i => String(v[i]).trim()).filter(Boolean).join(' ');
  return r;
}

function regSaveInto_(ss, id, rec, cut) {
  const sh = tableSheet_(ss, 'reg'), header = headerOf_(sh), row = findRow_(sh, header.indexOf('id') + 1, id), set = {};
  REG_FIELDS.forEach(k => { set[k] = cut(rec[k], REG_CUT_(k)); });
  set.updated = new Date().toISOString();
  if (row) writeFields_(sh, row, header, TABLES.reg.fields.filter(f => f[0] in set), set);
  return row ? regRowAt_(ss, sh, header, row) : null;
}

/* ---------- ที่เก็บถาวรของแถบลงทะเบียน (ตั้งค่า → ลงทะเบียน: reg.archiveYears · 0 = ไม่ย้าย · ไม่ตั้ง = 3 ปี) ---------- */
// วันละครั้ง (เปิดหน้าเว็บ / ตัวตั้งเวลา): ลงทะเบียนหรือแก้ล่าสุดเกิน N ปี และ HN ไม่มีรายการในแถบอื่น (เคส CT-SIM นัด นัดใส่แร่ Vac-Lok กิจกรรม) ตั้งแต่นั้น
// = ย้ายไปแท็บ RegistryArchive · หน้าเว็บโหลดเฉพาะแท็บ Registry (เร็วขึ้นเมื่อผู้ป่วยหลายพันคน) · ค้นที่เก็บถาวรได้ (regFind) · ใช้อีก = ย้ายกลับ
const REG_ARCH_PROP = 'regArch';
const regArchYears_ = cfg => { const y = cfg && cfg.reg && cfg.reg.archiveYears; return y === 0 || y === '0' ? 0 : [1, 2, 3, 5].indexOf(+y) >= 0 ? +y : 3; };
// ผู้ป่วยที่ดึงจาก Google Drive แล้วไม่เคยมีรายการในแถบอื่นเลย (ไม่มีนัด เคส CT-SIM ฯลฯ): ย้ายเมื่อดึงมา/แก้ล่าสุดเกิน N เดือน (0 = ใช้กติกาปกติ · ไม่ตั้ง = 6 เดือน)
const regArchDriveMonths_ = cfg => { const m = cfg && cfg.reg && cfg.reg.archiveDriveMonths; return m === 0 || m === '0' ? 0 : [1, 3, 6, 12].indexOf(+m) >= 0 ? +m : 6; };
function regArchStatus_() { try { return JSON.parse(propRead_(pk_(REG_ARCH_PROP)) || 'null'); } catch (e) { return null; } }
// HN → วันล่าสุดที่มีรายการในแถบอื่น (yyyy-MM-dd · วันที่ของรายการ / Start RT / วันทำ CT / Created)
function hnLatest_(ss) {
  const out = {}, skip = ['reg', 'regArch', 'spq'];
  Object.keys(TABLES).filter(t => skip.indexOf(t) < 0).forEach(t => {
    const def = TABLES[t], head = k => (def.fields.filter(x => x[0] === k)[0] || [])[1];
    if (!head('hn')) return;
    const sh = sheet_(ss, def.sheet);
    if (!sh || sh.getLastRow() < 2) return;
    const hdr = headerOf_(sh), n = sh.getLastRow() - 1, tz = tz_(ss);
    const cols = ['hn', 'date', 'sim', 'ct', 'in', 'created', 'updated'].map(k => (head(k) ? hdr.indexOf(head(k)) : -1));
    if (cols[0] < 0) return;
    const data = cols.map(c => (c < 0 ? null : sh.getRange(2, c + 1, n, 1).getValues()));
    for (let i = 0; i < n; i++) {
      const k = hnLoose_(data[0][i][0]);
      if (!k) continue;
      for (let j = 1; j < data.length; j++) {
        if (!data[j]) continue;
        const v = cellText_(data[j][i][0], tz).slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(v) && (!out[k] || v > out[k])) out[k] = v;
      }
    }
  });
  return out;
}
function regArchHns_(ss) { const sh = sheet_(ss, TABLES.regArch.sheet), o = {}; if (!sh || sh.getLastRow() < 2) return o; const c = headerOf_(sh).indexOf('HN'); if (c < 0) return o; sh.getRange(2, c + 1, sh.getLastRow() - 1, 1).getValues().forEach(r => { const k = hnLoose_(r[0]); if (k) o[k] = true; }); return o; }
// ลบแถว (เลขแถวในชีต) จากล่างขึ้นบน ทีละช่วงที่ติดกัน
function deleteRowsAt_(sh, rows) {
  const del = rows.slice().sort((a, b) => a - b);
  for (let j = del.length - 1; j >= 0;) {
    let k = j;
    while (k > 0 && del[k - 1] === del[k] - 1) k--;
    sh.deleteRows(del[k], j - k + 1);
    j = k - 1;
  }
}
// ย้ายแถวระหว่าง Registry กับ RegistryArchive ตามหัวคอลัมน์ของชีตปลายทาง (extra = ค่าที่ใส่เพิ่มตามหัวคอลัมน์)
function regMoveRows_(ss, from, to, pick, extra) {
  const src = sheet_(ss, TABLES[from].sheet), tz = tz_(ss);
  if (!src || src.getLastRow() < 2) return [];
  const sh = headerOf_(src), values = src.getRange(2, 1, src.getLastRow() - 1, sh.length).getValues(), idc = sh.indexOf('id'), cv = rowConv_(TABLES[from], sh, tz), take = [], ids = [];
  values.forEach((r, i) => { if (String(r[idc]).trim() && pick(cv.conv(r))) { take.push(i); ids.push(String(r[idc]).trim()); } });
  if (!take.length) return [];   // ไม่มีแถวที่ย้าย: ไม่เปลี่ยนรุ่นของตาราง
  markDirty_(from);
  const dst = tableSheet_(ss, to), dh = headerOf_(dst);
  const rows = take.map(i => dh.map(h => (extra && h in extra ? extra[h] : sh.indexOf(h) >= 0 ? safeText_(cellText_(values[i][sh.indexOf(h)], tz)) : '')));
  dst.getRange(dst.getLastRow() + 1, 1, rows.length, dh.length).setNumberFormat('@').setValues(rows);
  deleteRowsAt_(src, take.map(i => i + 2));
  return ids;
}
// ที่เก็บถาวร → แถบลงทะเบียน (Updated = ตอนนี้ ไม่ย้ายกลับไปอีกจนครบ N ปี) · คืนรหัสที่ย้าย · HN ที่ลงทะเบียนอยู่แล้วไม่ย้าย (ลบออกจากที่เก็บ)
function regMoveBack_(ss, pick) {
  const active = {};
  regRows_(ss).forEach(r => { const k = hnLoose_(r.hn); if (k) active[k] = true; });
  const dupIds = [];
  const ids = regMoveRows_(ss, 'regArch', 'reg', r => { if (!pick(r)) return false; if (hnLoose_(r.hn) && active[hnLoose_(r.hn)]) { dupIds.push(r.id); return false; } active[hnLoose_(r.hn)] = true; return true; }, { Updated: new Date().toISOString() });
  if (dupIds.length) { const sh = tableSheet_(ss, 'regArch'), c = headerOf_(sh).indexOf('id') + 1; deleteRowsAt_(sh, dupIds.map(id => findRow_(sh, c, id)).filter(Boolean)); }
  return ids;
}
// วันละครั้ง (force = ปุ่ม "ย้ายตอนนี้"): ย้ายผู้ป่วยเก่าเข้าที่เก็บถาวร · ล็อกไม่ว่าง = ข้าม (ครั้งหน้า) · สถานะใน Script property regArch
function regArchive_(ss, cfg, force) {
  const years = regArchYears_(cfg), months = regArchDriveMonths_(cfg), last = regArchStatus_() || {}, td = today_(ss);
  if ((!years && !months) || (!force && last.day === td)) return last;
  const res = { day: td, at: new Date().toISOString(), years: years, months: months, moved: 0, drive: 0, total: last.total || 0, error: '' };
  try {
    // API 97: หาแถวที่ต้องย้าย (อ่านหลายแถบ: ช้า) นอกล็อกบันทึก · ล็อกเฉพาะวันที่มีแถวต้องย้ายจริง (เดิมถือล็อกทุกเช้า)
    const sh = sheet_(ss, TABLES.reg.sheet);
    if (sh && sh.getLastRow() > 1) {
      const tz = tz_(ss), latest = hnLatest_(ss);
      const cutY = years ? Utilities.formatDate(new Date(Date.now() - years * 365.25 * 864e5), tz, 'yyyy-MM-dd') : '';
      const cutM = months ? Utilities.formatDate(new Date(Date.now() - months * 30.44 * 864e5), tz, 'yyyy-MM-dd') : '';
      const kind = r => {   // 'y' = เก่าเกินจำนวนปี · 'm' = ดึงจาก Drive แล้วไม่เคยใช้ · '' = ไม่ย้าย
        const at = [String(r.created).slice(0, 10), String(r.updated).slice(0, 10)].filter(v => /^\d{4}-\d{2}-\d{2}$/.test(v)).sort().pop();   // ลงทะเบียน / แก้ / ย้ายกลับ ล่าสุด
        const k = hnLoose_(r.hn), used = !!(k && latest[k]);
        if (!at || !String(r.name).trim()) return '';   // ชื่อว่าง (ชีตรุ่นเก่าที่แยกชื่อ/สกุล) ไม่ย้าย
        if (cutY && at < cutY && !(used && latest[k] >= cutY)) return 'y';
        if (cutM && at < cutM && !used && String(r.by).indexOf('Google Drive') === 0) return 'm';
        return '';
      };
      if (readTable_(ss, 'reg').some(r => kind(r))) {
        if (!force) {   // เปิดหน้าเว็บ: ไม่รอคนที่กำลังบันทึก (ลองใหม่ครั้งหน้า)
          const lock = LockService.getScriptLock();
          if (!lock.tryLock(500)) return last;
          lock.releaseLock();
        }
        withLock_(() => {
          res.moved = regMoveRows_(ss, 'reg', 'regArch', r => { const k = kind(r); if (k === 'm') res.drive++; return !!k; }, { 'ย้ายเข้าที่เก็บเมื่อ': res.at }).length;
        });
      }
    }
    const ah = sheet_(ss, TABLES.regArch.sheet);
    res.total = ah ? Math.max(0, ah.getLastRow() - 1) : 0;
  } catch (e) { res.error = String(e.message || e).slice(0, 200); }
  try { propSave_(pk_(REG_ARCH_PROP), JSON.stringify(res)); } catch (e) { /* ครั้งหน้า */ }
  return res;
}
// แอดมิน: ย้ายตอนนี้ (หลังเปลี่ยนจำนวนปี)
function regArchiveNow(token) {
  const u = who_(token);
  if (!u.isAdmin && !(u.sub && u.sub.indexOf('tabs') >= 0)) throw new Error('ย้ายเข้าที่เก็บถาวรได้เฉพาะแอดมิน');
  const ss = ss_();
  return regArchive_(ss, readConfig_(ss) || {}, true);
}
// ค้นในที่เก็บถาวร: HN ขึ้นต้นด้วยที่พิมพ์ หรือมีทุกคำ (ชื่อ แพทย์ Diag Note) · ล่าสุดก่อน ไม่เกิน 30 คน
function regFind(q, token) {
  const ss = ss_(), cfg = readConfig_(ss), u = who_(token, ss, cfg);
  if (!guestNeeds_(u, cfg).reg) throw new Error('ไม่มีสิทธิ์ดูผู้ป่วยที่ลงทะเบียน');
  q = String(q == null ? '' : q).trim().slice(0, 100);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean), k = hnLoose_(q);
  if (!words.length) return { rows: [], total: 0 };
  const hit = readTable_(ss, 'regArch').filter(r => (k && /\d/.test(k) && hnLoose_(r.hn).indexOf(k) === 0) || words.every(w => [r.hn, r.title, r.name, r.doc, r.icd, r.dx, r.note].join(' ').toLowerCase().indexOf(w) >= 0));
  hit.sort((a, b) => String(b.created).localeCompare(String(a.created)));
  return { rows: hit.slice(0, 30), total: hit.length };
}
// ใช้ผู้ป่วยในที่เก็บถาวรอีกครั้ง (แก้ไข ลงนัด นัดใส่แร่): ย้ายกลับแถบลงทะเบียน · คืนรายการ
function regRestore(id, token) {
  requireEdit_(token, EDIT_VIEWS.reg.concat(EDIT_VIEWS.appt, EDIT_VIEWS.bq));
  id = String(id == null ? '' : id).trim();
  return withLock_(() => {
    const ss = ss_(), ah = sheet_(ss, TABLES.regArch.sheet);
    const row = ah ? readTable_(ss, 'regArch').filter(x => x.id === id)[0] : null;
    if (!row) { const cur = regRows_(ss).filter(x => x.id === id)[0]; if (cur) return cur; throw new Error('ไม่พบผู้ป่วยนี้ในที่เก็บถาวร (อาจถูกย้ายกลับไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง'); }
    regMoveBack_(ss, x => x.id === id);
    const k = hnLoose_(row.hn), all = regRows_(ss);
    return all.filter(x => x.id === id)[0] || all.filter(x => k && hnLoose_(x.hn) === k)[0];
  });
}

// ลบผู้ป่วยในแถบลงทะเบียน ยืนยันด้วยรหัส PIN (นัดของผู้ป่วยไม่ถูกลบ) · คืน true เมื่อลบแล้ว
function regRemove(id, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.reg);
  pinChange_(u, pin, true);
  return withLock_(() => {
    const sh = tableSheet_(ss_(), 'reg'), row = findRow_(sh, headerOf_(sh).indexOf('id') + 1, id);
    if (row) delRow_(sh, row);
    return !!row;
  });
}

/**
 * แถบลงนัด: เพิ่มหรือแก้นัดทำ CT-Sim ยืนยันด้วยรหัส PIN (ตั้งค่า → รหัส PIN: ลงนัด)
 * rec = ช่องใน APPT_FIELDS (date = วันนัด CT-Sim หรือ 'on call', cm = CM / Non-CM, special = เทคนิคพิเศษ, dpf/fx/rx/freq = Prescription, sim = Start RT,
 *   order = ใบสั่ง CT Sim ส่วนที่เหลือ เป็น JSON: อายุ เพศ Examination Part ท่า Contrast Lab Immobilization ขอบเขตการสแกน)
 * id ที่ยังไม่มี = เพิ่มใหม่ · การลง CT-SIM (took) เปลี่ยนได้ทาง ctSave / apptMark / ctRemove เท่านั้น · คืนรายการหลังบันทึก
 */
const APPT_FIELDS = ['date', 'hn', 'name', 'cm', 'special', 'dpf', 'fx', 'rx', 'freq', 'sim', 'ct', 'room', 'doc', 'icd', 'dx', 'note', 'order'];
function apptSave(rec, pin, token) {
  // API 69: แถบ CT-SIM แก้ CT Order ที่มีอยู่แล้วได้ · ลงนัดใหม่ = ตำแหน่งที่บันทึกในแถบ CT Order / Consult ได้
  const u = requireEdit_(token, EDIT_VIEWS.appt.concat(EDIT_VIEWS.ctsim));
  rec = rec && typeof rec === 'object' ? rec : {};
  const cfg0 = readConfig_(ss_()) || {}, ctOnly = u.via !== 'google' && !EDIT_VIEWS.appt.some(v => userAccess_(cfg0, v, u) === 'edit');
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!cut(rec.hn, 40)) throw new Error('กรอก HN');
  const date = cut(rec.date, 10);
  if (!isDate(date) && date !== 'on call') throw new Error('วันนัด CT-Sim ไม่ถูกต้อง');
  const sim = cut(rec.sim, 10);
  if (sim && sim !== 'on call' && !isDate(sim)) throw new Error('วันที่ Start RT ไม่ถูกต้อง');
  const order = String(rec.order == null ? '' : rec.order);
  if (order) {
    if (order.length > 20000) throw new Error('ข้อมูลใบสั่ง CT Sim ยาวเกินไป');
    let o;
    try { o = JSON.parse(order); } catch (e) { throw new Error('ข้อมูลใบสั่ง CT Sim ไม่ถูกต้อง'); }
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('ข้อมูลใบสั่ง CT Sim ไม่ถูกต้อง');
  }
  return withLock_(() => {
    const ss = ss_(), id = cut(rec.id, 80), x = openRow_(ss, 'appt', null, id), row = x.row;
    if (ctOnly && !row) throw new Error('แถบ CT-SIM แก้ได้เฉพาะ CT Order ที่มีอยู่แล้ว · ลงนัดใหม่ที่แถบ CT Order');
    // API 99: ห้ามลงนัดซ้ำ (นัดใหม่ หรือเปลี่ยน HN ของนัดเดิม) · ปิดได้ที่ ตั้งค่า → ลงนัด
    if (!row || hnKey_(x.cur.hn) !== hnKey_(rec.hn)) {
      const d = apptDup_(ss, cfg0, cut(rec.hn, 40), row ? id : '');
      if (d) throw new Error('ลงนัดซ้ำไม่ได้: HN ' + cut(rec.hn, 40) + ' มีนัดที่ยังไม่ได้ทำ CT อยู่แล้ว (นัด CT ' + (isDate(String(d.date)) ? d.date : 'On Call') + (d.room ? ' · ห้อง ' + d.room : '') + ') · เปิดนัดเดิมแล้วแก้วัน CT / ห้องฉายในนัดนั้น (หรือลบนัดเดิมก่อน)');
    }
    pinChange_(u, pin, !!row);
    const set = {};
    APPT_FIELDS.forEach(k => { set[k] = cut(rec[k], k === 'order' ? 20000 : k === 'note' || k === 'dx' ? 2000 : 200); });
    const now = new Date().toISOString();
    if (row) set.updated = now;
    else Object.assign(set, { id: id || Utilities.getUuid(), by: String(u.name || u.username || u.me || ''), created: now, updated: '' });
    return saveRow_(x, TABLES.appt.fields, set);   // เดิมอ่านทั้งตารางนัดกลับมาเพื่อคืนแถวเดียว
  });
}

// API 99: นัดของ HN นี้ที่ยังรอทำ CT (ไม่นับนัด except) · นัดล่าสุดของ HN (ไม่นับไม่มาทำ CT) ที่ยังไม่ได้ลง CT-SIM
// และยังไม่มีรายการ CT-SIM ของ HN นั้น (ไม่ใช่ CT ของ HDR / งานวิจัย) ที่ลงหลังนัด · เหมือน apDupOf / apDupBlock ในหน้าเว็บ · ปิดใน ตั้งค่า = null
// แถวของ HN ในตาราง แบบ readTable_ เฉพาะแถวนั้น · หาในคอลัมน์ HN ด้วย TextFinder (ไม่อ่านทั้งตาราง · ตารางหลายพันแถว) แล้วอ่านเฉพาะแถวที่ตรง
function rowsOfHn_(ss, table, hn) {
  const def = tableDef_(table), sh = sheet_(ss, def.sheet), k = hnKey_(hn);
  if (!sh || !k) return [];
  const last = sh.getLastRow(), header = headerOf_(sh), cv = rowConv_(def, header, tz_(ss));
  let hc = -1;
  def.fields.forEach((f, i) => { if (f[0] === 'hn') hc = cv.cols[i]; });
  if (last < 2 || hc < 0) return [];
  const col = sh.getRange(2, hc + 1, last - 1, 1);
  let rows = [];
  if (typeof col.createTextFinder === 'function') rows = col.createTextFinder(String(hn).trim()).matchEntireCell(true).findAll().map(c => c.getRow());
  else col.getValues().forEach((v, i) => { if (hnKey_(v[0]) === k) rows.push(i + 2); });
  const w = Math.max(1, header.length);
  return rows.map(r => cv.conv(sh.getRange(r, 1, 1, w).getValues()[0])).filter(x => hnKey_(x.hn) === k);
}
function apptDup_(ss, cfg, hn, except) {
  const v = cfg && cfg.appt ? cfg.appt.noDup : null;
  if (!(v == null || v === true || v === 'on')) return null;
  const k = hnKey_(hn);
  if (!k) return null;
  const mine = rowsOfHn_(ss, 'appt', hn).filter(a => String(a.id) !== String(except || '') && String(a.took || '') !== 'skip');
  if (!mine.length) return null;
  const last = mine.reduce((a, b) => (String(b.created) > String(a.created) || (String(b.created) === String(a.created) && String(b.id) > String(a.id)) ? b : a));
  if (String(last.took || '').trim()) return null;   // นัดล่าสุดลง CT-SIM แล้ว = นัดเก่าที่ค้างเป็นนัดซ้ำ ไม่กันนัดใหม่
  const cr = String(last.created || '');
  const done = cr && rowsOfHn_(ss, 'ctsim', hn).some(c => !String(c.hdr || '').trim() && !String(c.research || '').trim() && String(c.created || '') >= cr);
  return done ? null : last;
}

// ลบนัดในแถบลงนัด ยืนยันด้วยรหัส PIN (รายการ CT-SIM ที่ลงจากนัดนี้แล้วไม่ถูกลบ) · คืน true เมื่อลบแล้ว
function apptRemove(id, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.appt);
  pinChange_(u, pin, true);
  return withLock_(() => {
    const sh = tableSheet_(ss_(), 'appt'), row = findRow_(sh, headerOf_(sh).indexOf('id') + 1, id);
    if (row) delRow_(sh, row);
    return !!row;
  });
}

/* ---------- API 86 (18 พ.ย.): พบแพทย์วันนี้ · คำสั่งแพทย์ระหว่างฉาย · Nurse ยืนยัน (บันทึกไว้ ยังไม่บังคับขั้นตอนอื่น) ---------- */
const R8_DAY_ = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const R8_WHO_ = u => String(u.name || u.username || u.me || '');
function recentSee_(ss) {
  const from = Utilities.formatDate(new Date(Date.now() - 60 * 864e5), tz_(ss), 'yyyy-MM-dd');
  return readTable_(ss, 'see').filter(x => String(x.date) >= from);
}
function recentRtd_(ss) {
  const from = Utilities.formatDate(new Date(Date.now() - 120 * 864e5), tz_(ss), 'yyyy-MM-dd');
  return readTable_(ss, 'rtd').filter(x => String(x.date) >= from);
}
/** แถบห้องฉาย: แพทย์ที่ผู้ป่วยต้องพบก่อนฉาย ของห้องนั้นในวันนั้น (ติ๊ก / เอาติ๊กออก = ส่งรายการทั้งหมดของห้อง) */
// API 87: แก้ไข (ห้องนั้นวันนั้นมีแพทย์ที่บันทึกไว้แล้ว แล้วรายการเปลี่ยน) ต้องใส่ PIN · บันทึกครั้งแรกของวันไม่ต้อง
// หน้าเว็บรุ่น 2026-11-17.6 ส่ง 3 ค่า (ไม่มี pin) = pin ว่าง (แก้ไขจะถูกขอ PIN)
function seeSave(date, room, docs, pin, token) {
  if (arguments.length < 5) { token = pin; pin = ''; }
  const u = requireEdit_(token, EDIT_VIEWS.see);
  date = String(date || '');
  room = String(room || '').trim().slice(0, 60);
  if (!R8_DAY_(date)) throw new Error('วันที่ไม่ถูกต้อง');
  if (!room) throw new Error('เลือกห้องฉายก่อน');
  const list = seeDocs_(docs, dqDocs_(readConfig_(ss_()) || {}));
  return withLock_(() => {
    const ss = ss_(), id = date + '|' + room, x = openRow_(ss, 'see', null, id);
    const rec = { id: id, date: date, room: room, docs: list.join(','), by: R8_WHO_(u), at: new Date().toISOString() };
    const was = x.cur ? String(x.cur.docs || '') : '';
    pinChange_(u, pin, !!was && was !== rec.docs);
    writeFields_(x.sh, x.row || x.sh.getLastRow() + 1, x.header, TABLES.see.fields, rec, x.row ? x.vals : null);
    return rec;
  });
}
const seeDocs_ = (docs, known) => (Array.isArray(docs) ? docs : String(docs || '').split(',')).map(x => String(x).trim().toUpperCase()).filter((x, i, a) => x && known.indexOf(x) >= 0 && a.indexOf(x) === i);
/** API 88 (18 พ.ย.): แถบ Nurse → นัดพบแพทย์ (ตารางพบแพทย์รายสัปดาห์) บันทึกหลายช่อง (วัน·ห้อง) ในครั้งเดียว · items = [{ date, room, docs }]
 *  ช่องที่มีแพทย์บันทึกไว้แล้วและรายการเปลี่ยน = แก้ไข ต้องใส่ PIN (ครั้งเดียวทั้งชุด) · คืนรายการที่บันทึก */
function seeSaveMany(items, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.see);
  if (!Array.isArray(items) || !items.length) throw new Error('ไม่มีช่องที่จะบันทึก');
  if (items.length > 300) throw new Error('บันทึกได้ครั้งละไม่เกิน 300 ช่อง');
  const known = dqDocs_(readConfig_(ss_()) || {}), by = {};
  items.forEach(it => {
    it = it && typeof it === 'object' ? it : {};
    const date = String(it.date || ''), room = String(it.room || '').trim().slice(0, 60);
    if (!R8_DAY_(date)) throw new Error('วันที่ไม่ถูกต้อง');
    if (!room) throw new Error('ไม่มีห้องฉาย');
    by[date + '|' + room] = { id: date + '|' + room, date: date, room: room, docs: seeDocs_(it.docs, known).join(',') };
  });
  return withLock_(() => {
    const ss = ss_(), x = openRows_(ss, 'see', null, id => !!by[id]);
    const was = id => { const a = x.at[id]; return a && a.vals ? String(x.cv.conv(a.vals).docs || '') : ''; };
    pinChange_(u, pin, Object.keys(by).some(id => was(id) && was(id) !== by[id].docs));
    const now = new Date().toISOString(), who = R8_WHO_(u), out = [];
    let next = Math.max(x.last, 1) + 1;
    Object.keys(by).forEach(id => {
      const a = x.at[id], rec = Object.assign({}, by[id], { by: who, at: now });
      writeFields_(x.sh, a ? a.row : next++, x.header, TABLES.see.fields, rec, a ? a.vals : null);
      out.push(rec);
    });
    return out;
  });
}
/** ห้องตรวจ → ระหว่างฉาย: คำสั่งแพทย์ของเคสในวันนั้น · RT Alone = RT · CCRT = RT และ CMT (หมวดละ 1) · แก้คำสั่ง = รอพยาบาลยืนยันใหม่ */
function rtdSave(rec, token) {
  const u = requireEdit_(token, EDIT_VIEWS.rtd);
  rec = rec && typeof rec === 'object' ? rec : {};
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const r = { date: cut(rec.date, 10), case: cut(rec.case, 80), hn: cut(rec.hn, 40), name: cut(rec.name, 200), doc: cut(rec.doc, 10).toUpperCase(), room: cut(rec.room, 60), src: cut(rec.src, 40),
    kind: rec.kind === 'ccrt' ? 'ccrt' : 'alone', rt: cut(rec.rt, 10), cmt: cut(rec.cmt, 10), note: cut(rec.note, 500) };
  if (!R8_DAY_(r.date)) throw new Error('วันที่ไม่ถูกต้อง');
  if (!r.case || !r.hn) throw new Error('ไม่มีข้อมูลผู้ป่วย');
  if (r.rt === 'off') { r.kind = 'alone'; r.cmt = ''; }   // API 144: Off RT = แพทย์รับทราบจบการฉาย (ผู้ป่วย Off RT / Complete course / Cancel RT วันนี้) · ไม่มี CMT
  if (r.rt !== 'continue' && r.rt !== 'hold' && r.rt !== 'off') throw new Error('เลือก Continue RT หรือ Hold RT');
  if (r.kind === 'ccrt') { if (r.cmt !== 'continue' && r.cmt !== 'hold') throw new Error('CCRT: เลือก Continue CMT หรือ Hold CMT ด้วย (ต้องเลือกหมวดละ 1 ตัวเลือก)'); } else r.cmt = '';
  Object.assign(r, { id: r.date + '|' + r.case, by: R8_WHO_(u), at: new Date().toISOString(), nurse: '', nurseBy: '' });
  return withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'rtd', null, r.id);
    // API 122: Nurse ยืนยันแล้ว = แพทย์แก้ไม่ได้ (เดิมแก้แล้วรอยืนยันใหม่) · Nurse ยกเลิกการยืนยันก่อน (Hold ที่ยืนยันถูกถอดออกตอนยกเลิก)
    if (x.row && String(x.cur.nurse || '')) throw new Error('Nurse ยืนยันคำสั่งนี้แล้ว' + (x.cur.nurseBy ? ' (' + x.cur.nurseBy + ')' : '') + ' · แก้คำสั่งได้เมื่อ Nurse ยกเลิกการยืนยัน (แถบ Nurse → รับคำสั่งแพทย์)');
    writeFields_(x.sh, x.row || x.sh.getLastRow() + 1, x.header, TABLES.rtd.fields, r, x.row ? x.vals : null);
    return r;
  });
}
/** แถบ Nurse: ยืนยัน (on) / ยกเลิก · table = appt (CT Order) | dq (order จาก Call center) | rtd (คำสั่งแพทย์ระหว่างฉาย) */
function nurseMark(table, id, on, token) {
  if (['appt', 'dq', 'rtd'].indexOf(table) < 0) throw new Error('ไม่รู้จักรายการที่จะยืนยัน');
  const u = requireEdit_(token, EDIT_VIEWS.nurse);
  return withLock_(() => {
    const ss = ss_(), x = openRow_(ss, table, null, id);
    if (!x.row) throw new Error('ไม่พบรายการนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const set = on ? { nurse: new Date().toISOString(), nurseBy: R8_WHO_(u) } : { nurse: '', nurseBy: '' };
    if (table === 'rtd') { set.cmtw = ''; set.cmtd = ''; }   // API 128: ยืนยันปกติ / ยกเลิก = ไม่มี CMT Today / วันอื่น (API 144: วันให้เคมี)
    writeFields_(x.sh, x.row, x.header, TABLES[table].fields.filter(f => f[0] in set), set, x.vals);
    const out = Object.assign(x.cur, set);
    if (table === 'rtd') { const c = rtdHold_(ss, out, !!on); if (c) out.caseRow = c; }   // API 104: Hold RT ที่ยืนยัน = Hold ในตารางวันฉาย
    return out;
  });
}
/* ---------- API 147 (27 พ.ย.): Standing order · Nurse กรอกเพิ่ม (แถบ Nurse → Call center) ----------
 * part = { lab: [คีย์รายการตรวจ], labo: อื่นๆระบุ, op: ความเห็นแพทย์ } · เขียนลงช่อง so (JSON) ของรายการแจก โดยเก็บช่องอื่นไว้ (dx, rn …) · nBy / nAt = ผู้บันทึก
 * lab = เฉพาะที่พยาบาลติ๊กเพิ่ม (ที่แพทย์สั่งใน CT Order อยู่ในนัดอยู่แล้ว) · สิทธิ์ = บันทึกแถบ Nurse ได้ · รายการ Call center เท่านั้น
 * Nurse ยืนยัน order แล้ว = แก้ไม่ได้ (ยกเลิกการยืนยันก่อน) · ประวัติการบันทึกผ่าน writeFields_ */
const SO_LAB_KEYS_ = ['cbc', 'bun', 'elyte', 'lft', 'hiv', 'upt', 'ekg'];
function soNurse(id, part, token) {
  const u = requireEdit_(token, EDIT_VIEWS.nurse);
  part = part && typeof part === 'object' && !Array.isArray(part) ? part : {};
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const lab = (Array.isArray(part.lab) ? part.lab : []).map(String).filter((k, i, a) => SO_LAB_KEYS_.indexOf(k) >= 0 && a.indexOf(k) === i);
  const labo = cut(part.labo, 120), op = cut(part.op, 1000);
  return withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'dq', null, cut(id, 80));
    if (!x.row) throw new Error('ไม่พบรายการนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    if (String(x.cur.desk || '')) throw new Error('Standing order ใช้กับรายการ Call center เท่านั้น');
    if (String(x.cur.nurse || '')) throw new Error('ยืนยัน order แล้ว · กดยกเลิกการยืนยันในรายการก่อนแก้');
    let o = {};
    try { const v = JSON.parse(String(x.cur.so || '') || '{}'); if (v && typeof v === 'object' && !Array.isArray(v)) o = v; } catch (e) { o = {}; }
    if (lab.length) o.lab = lab; else delete o.lab;
    if (labo) o.labo = labo; else delete o.labo;
    if (op) o.op = op; else delete o.op;
    o.nBy = R8_WHO_(u);
    o.nAt = new Date().toISOString();
    const so = JSON.stringify(o);
    if (so.length > 4000) throw new Error('ข้อความยาวเกินไป');
    const set = { so: so, updated: dqNow_() };
    writeFields_(x.sh, x.row, x.header, TABLES.dq.fields.filter(f => f[0] in set), set, x.vals);
    return Object.assign(x.cur, set);
  });
}
/* ---------- API 94 (19 พ.ย.): แถบ Nurse → รับคำสั่งแพทย์ ----------
 * แพทย์ยังไม่สั่งวันนี้ = พยาบาลเลือกตัวเลือกแล้วยืนยัน (บันทึกคำสั่งแทนแพทย์ + ยืนยันในครั้งเดียว · src มี nurse) · แพทย์สั่งแล้ว = ยืนยันอย่างเดียว (ไม่เปลี่ยนคำสั่ง) */
function rtdNurse(rec, token) {
  const u = requireEdit_(token, EDIT_VIEWS.nurse);
  rec = rec && typeof rec === 'object' ? rec : {};
  const cw = CMTW_.indexOf(rec.cmtw) >= 0 ? rec.cmtw : '';   // API 128
  const cdOk = d => cw === 'tmr' && cmtdOk_(rec.cmtd, d) ? String(rec.cmtd) : '';   // API 144: CMT วันอื่น = วันที่เลือก
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const r = { date: cut(rec.date, 10), case: cut(rec.case, 80), hn: cut(rec.hn, 40), name: cut(rec.name, 200), doc: cut(rec.doc, 10).toUpperCase(), room: cut(rec.room, 60), src: cut(rec.src, 30),
    kind: rec.kind === 'ccrt' ? 'ccrt' : 'alone', rt: cut(rec.rt, 10), cmt: cut(rec.cmt, 10), note: cut(rec.note, 500) };
  if (!R8_DAY_(r.date)) throw new Error('วันที่ไม่ถูกต้อง');
  if (!r.case || !r.hn) throw new Error('ไม่มีข้อมูลผู้ป่วย');
  if (r.rt !== 'continue' && r.rt !== 'hold') throw new Error('เลือก Continue RT หรือ Hold RT');
  if (r.kind === 'ccrt') { if (r.cmt !== 'continue' && r.cmt !== 'hold') throw new Error('CCRT: เลือก Continue CMT หรือ Hold CMT ด้วย'); } else r.cmt = '';
  const who = R8_WHO_(u), now = new Date().toISOString();
  return withLock_(() => {
    const ss = ss_(), id = r.date + '|' + r.case, x = openRow_(ss, 'rtd', null, id);
    const mine = x.row && x.cur && /(^|,)nurse(,|$)/.test(String(x.cur.src || '')) && !String(x.cur.nurse || '');   // API 144: พยาบาลบันทึกแทนแล้วยกเลิกการยืนยัน = เลือกใหม่ได้
    if (x.row && x.cur && x.cur.rt && !mine) {   // แพทย์สั่งแล้ว: ยืนยันอย่างเดียว
      const set = { nurse: now, nurseBy: who, cmtw: cmtwOk_(x.cur) ? cw : '', cmtd: cmtwOk_(x.cur) ? cdOk(x.cur.date) : '' };
      writeFields_(x.sh, x.row, x.header, TABLES.rtd.fields.filter(f => f[0] in set), set, x.vals);
      const out = Object.assign(x.cur, set), c = rtdHold_(ss, out, true);
      if (c) out.caseRow = c;
      return out;
    }
    Object.assign(r, { id: id, src: (r.src ? r.src + ',' : '') + 'nurse', by: who + ' (พยาบาลแทนแพทย์)', at: now, nurse: now, nurseBy: who });
    r.cmtw = cmtwOk_(r) ? cw : '';
    r.cmtd = r.cmtw ? cdOk(r.date) : '';
    writeFields_(x.sh, x.row || x.sh.getLastRow() + 1, x.header, TABLES.rtd.fields, r, x.row ? x.vals : null);
    const c = rtdHold_(ss, r, true);
    if (c) r.caseRow = c;
    return r;
  });
}
/* ---------- API 128 (24 พ.ย.): CMT Today / CMT Tomorrow ----------
 * คำสั่ง CCRT + Continue RT + Continue CMT: พยาบาลยืนยันแบบ CMT Today (rc = ฉายก่อนแล้วให้เคมี RT→CMT · cr = ให้เคมีก่อนแล้วฉาย CMT→RT · ตารางวันฉายแสดงตามนั้น)
 * หรือ CMT Tomorrow (tmr = ยืนยัน ฉายได้วันนี้ · วันทำการถัดไปผู้ป่วยไปอยู่ Nurse → นัดเคมีบำบัด แล้วเลือก RT→CMT / CMT→RT ที่นั่น = ncallAtt what cmt) */
const CMTW_ = ['rc', 'cr', 'tmr'];
const cmtwOk_ = r => !!r && r.kind === 'ccrt' && String(r.rt) === 'continue' && String(r.cmt) === 'continue';
// API 144: วันให้เคมีที่เลือก (CMT วันอื่น) = หลังวันที่สั่ง ไม่เกิน 90 วัน
const cmtdOk_ = (v, from) => { if (!R8_DAY_(v) || !R8_DAY_(from) || String(v) <= String(from)) return false; const t = new Date(String(from) + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + 90); return String(v) <= t.toISOString().slice(0, 10); };
function nurseCmt(id, w, token) {
  const u = requireEdit_(token, EDIT_VIEWS.nurse);
  const p = String(w == null ? '' : w).split('|'), k = p[0], cd = p[1] || '';   // API 144: 'tmr|วันที่' = CMT วันอื่น · '' = ยกเลิก CMT (คงการยืนยัน RT)
  if (k && CMTW_.indexOf(k) < 0) throw new Error('เลือก CMT Today (RT→CMT / CMT→RT) หรือ CMT วันอื่น');
  if (cd && k !== 'tmr') throw new Error('วันให้เคมีใช้กับ CMT วันอื่นเท่านั้น');
  return withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'rtd', null, String(id || ''));
    if (!x.row) throw new Error('ไม่พบรายการนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    if (!k) {
      const clr = { cmtw: '', cmtd: '' };
      writeFields_(x.sh, x.row, x.header, TABLES.rtd.fields.filter(f => f[0] in clr), clr, x.vals);
      return Object.assign(x.cur, clr);
    }
    if (!cmtwOk_(x.cur)) throw new Error('CMT Today / วันอื่น ใช้กับคำสั่ง CCRT + Continue RT + Continue CMT เท่านั้น');
    if (cd && !cmtdOk_(cd, x.cur.date)) throw new Error('วันให้เคมีต้องหลังวันที่สั่ง และไม่เกิน 90 วัน');
    const set = { nurse: new Date().toISOString(), nurseBy: R8_WHO_(u), cmtw: k, cmtd: cd };
    writeFields_(x.sh, x.row, x.header, TABLES.rtd.fields.filter(f => f[0] in set), set, x.vals);
    const out = Object.assign(x.cur, set), c = rtdHold_(ss, out, true);
    if (c) out.caseRow = c;
    return out;
  });
}
/* ---------- API 100 (20 พ.ย.): สถานะเครื่อง (Machine status) · แสดงทุกแถบ · ประวัติในชีต MachineLog ใช้วิเคราะห์ uptime / downtime ---------- */
const MST_STATUS = ['ready', 'qc', 'part', 'down', 'repair', 'test', 'pm', 'sys', 'intr'];
const MST_EVENT = 'intr';   // API 103: Interrupt (Reset แล้วหาย ใช้งานต่อได้) = เหตุการณ์ ณ เวลาหนึ่ง (เริ่ม = สิ้นสุด) · สถานะของเครื่องไม่เปลี่ยน · ไม่อยู่ในลำดับช่วงสถานะ
const MST_ROLES = ['RTT', 'MP'];   // ตำแหน่งที่ตั้งสถานะได้ (ตั้งค่า → สถานะเครื่อง · config.machine.roles) · แอดมินตั้งได้เสมอ
const MST_NAME = { ready: 'พร้อมใช้', qc: 'QC / Warm-up', part: 'ใช้ได้บางส่วน', down: 'เครื่องเสีย', repair: 'กำลังซ่อม', test: 'ทดสอบหลังซ่อม', pm: 'PM ตามกำหนด', sys: 'ระบบสนับสนุนล่ม', intr: 'Interrupt' };
function mstRoles_(cfg) {
  const r = cfg && cfg.machine && Array.isArray(cfg.machine.roles) ? cfg.machine.roles.map(x => String(x || '').trim()).filter(x => /^[\w -]{1,20}$/.test(x)) : null;
  return r && r.length ? r : MST_ROLES.slice();
}
// ช่วงสถานะที่ยังเปิดอยู่ทั้งหมด + ที่เริ่มในรอบ 400 วัน
function recentMlog_(ss) {
  const from = new Date(Date.now() - 400 * 864e5).toISOString();
  return readTable_(ss, 'mlog').filter(x => !String(x.to || '').trim() || String(x.from) >= from);
}
/**
 * ตั้งสถานะเครื่อง: ปิดช่วงสถานะปัจจุบันของเครื่องนั้น (to = เวลาเริ่มของสถานะใหม่) แล้วเพิ่มแถวใหม่ · สถานะเดิม = แก้รายละเอียดของช่วงปัจจุบัน
 * rec = { machine, status, from (เวลาเริ่ม ISO · ว่าง = ตอนนี้ · ย้อนหลังได้ไม่ก่อนเวลาเริ่มของสถานะปัจจุบัน), cat, note, eta, wait }
 * API 101: สถานะเดิม + from = แก้เวลาเริ่มของช่วงปัจจุบัน (เช่น เสียจริงก่อนเวลาที่กด) · ช่วงก่อนหน้า (สิ้นสุด = เวลาเริ่มเดิม) สิ้นสุดตามเวลาใหม่ · ต้องหลังเวลาเริ่มของช่วงก่อนหน้า
 * ตั้งได้: ตำแหน่งใน config.machine.roles (เริ่มต้น RTT, MP) และแอดมิน · กำลังซ่อม / ทดสอบหลังซ่อม → พร้อมใช้ / QC / ใช้ได้บางส่วน = MP หรือแอดมินเท่านั้น (ตรวจ QA ก่อนปล่อยเครื่อง)
 * ไม่ใช้รหัส PIN (กดได้เร็วตอนเครื่องเสีย) · บันทึกผู้ตั้งทุกครั้ง · คืน { rows: [ช่วงที่ปิด, ช่วงใหม่] }
 */
function machineSet(rec, token) {
  const ss0 = ss_(), cfg = readConfig_(ss0) || {}, u = who_(token, ss0, cfg);
  rec = rec && typeof rec === 'object' ? rec : {};
  const cut = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  const admin = u.via === 'google' || !!u.isAdmin, role = String(u.role || ''), roles = mstRoles_(cfg);
  if (!admin && !roles.some(r => r.toLowerCase() === role.toLowerCase())) throw new Error('ตำแหน่ง ' + (role || '-') + ' ตั้งสถานะเครื่องไม่ได้ (ตั้งได้: ' + roles.join(', ') + ' และแอดมิน · ตั้งค่า → สถานะเครื่อง)');
  const machine = cut(rec.machine, 60), status = cut(rec.status, 10);
  if (!machine) throw new Error('ไม่ได้ระบุเครื่อง');
  if (MST_STATUS.indexOf(status) < 0) throw new Error('สถานะไม่ถูกต้อง');
  const now = new Date(), fd = cut(rec.from, 40) ? new Date(cut(rec.from, 40)) : now;
  if (isNaN(fd.getTime())) throw new Error('เวลาเริ่มไม่ถูกต้อง');
  if (fd.getTime() > now.getTime() + 5 * 60000) throw new Error('เวลาเริ่มอยู่ในอนาคต');
  let from = fd.toISOString();
  const fromSet = !!cut(rec.from, 40);
  let eta = cut(rec.eta, 40);
  if (eta) { const e = new Date(eta); if (isNaN(e.getTime())) throw new Error('เวลาที่คาดว่าเสร็จไม่ถูกต้อง'); eta = e.toISOString(); }
  const wait = rec.wait === '' || rec.wait == null || !isFinite(+rec.wait) ? '' : String(Math.max(0, Math.min(999, Math.floor(+rec.wait))));
  const who = String(u.name || u.username || u.me || '');
  if (status === MST_EVENT) {   // API 103: Interrupt = เพิ่มหนึ่งแถว (เริ่ม = สิ้นสุด = เวลาที่เกิด) · ช่วงสถานะปัจจุบันไม่ถูกปิด
    return withLock_(() => {
      const ss = ss_(), x = openRow_(ss, 'mlog', null, '');
      const r = { id: Utilities.getUuid(), machine: machine, status: status, from: from, to: from, cat: cut(rec.cat, 60), note: cut(rec.note, 500), eta: '', wait: '', by: who, role: admin && !role ? 'Admin' : role, at: now.toISOString(), editBy: '', editAt: '', energy: cut(rec.energy, 60) };   // API 106: เลือกได้หลายพลังงาน
      writeFields_(x.sh, x.sh.getLastRow() + 1, x.header, TABLES.mlog.fields, r, null);
      return { rows: [r] };
    });
  }
  return withLock_(() => {
    const ss = ss_();
    const mine = readCols_(ss, 'mlog', null, ['machine', 'status', 'from', 'to']).filter(x => x.machine === machine && x.status !== MST_EVENT).sort((a, b) => String(a.from).localeCompare(String(b.from)));
    const open = mine.filter(x => !String(x.to || '').trim()).pop() || null;
    const when = v => Utilities.formatDate(new Date(v), tz_(ss), 'yyyy-MM-dd HH:mm');
    const info = { cat: status === 'ready' ? '' : cut(rec.cat, 60), note: cut(rec.note, 500), eta: status === 'ready' ? '' : eta };
    if (open && open.status === status) {   // สถานะเดิม: แก้รายละเอียดของช่วงปัจจุบัน (ไม่เพิ่มแถว)
      const x = openRow_(ss, 'mlog', null, open.id), set = Object.assign({}, info, { editBy: who, editAt: now.toISOString() }), out = [];
      if (fromSet && from !== String(open.from)) {   // API 101: แก้เวลาเริ่มของช่วงปัจจุบัน · ช่วงก่อนหน้าสิ้นสุดตาม (ช่วงต่อกันไม่มีช่องว่าง)
        const prev = mine.filter(y => y.id !== open.id && String(y.to) === String(open.from)).pop() || null;
        if (prev && from <= String(prev.from)) throw new Error('เวลาเริ่มต้องหลังเวลาเริ่มของสถานะก่อนหน้า (' + MST_NAME[prev.status] + ' เริ่ม ' + when(prev.from) + ')');
        if (prev) { const p = openRow_(ss, 'mlog', null, prev.id); if (p.row) out.push(saveRow_(p, TABLES.mlog.fields.filter(f => f[0] === 'to'), { to: from })); }
        set.from = from;
      }
      out.push(saveRow_(x, TABLES.mlog.fields.filter(f => f[0] in set), set));
      return { rows: out };
    }
    // ซ่อมเสร็จ: ปล่อยเครื่องให้ใช้ได้เฉพาะ MP / แอดมิน
    if (open && ['repair', 'test'].indexOf(open.status) >= 0 && ['ready', 'qc', 'part'].indexOf(status) >= 0 && !admin && role.toUpperCase() !== 'MP') {
      throw new Error('ปล่อยเครื่องหลังซ่อม (' + MST_NAME[open.status] + ' → ' + MST_NAME[status] + ') ได้เฉพาะ MP (ตรวจ QA ก่อนใช้งาน) · ตั้งเป็น "ทดสอบหลังซ่อม" แล้วแจ้ง MP');
    }
    if (open && from < String(open.from) && new Date(open.from).getTime() - fd.getTime() < 60000) from = String(open.from);   // ช่องเวลาละเอียดถึงนาที: นาทีเดียวกับเวลาเริ่มของสถานะปัจจุบัน = เริ่มต่อกันพอดี
    if (open && from < String(open.from)) throw new Error('เวลาเริ่มต้องไม่ก่อนเวลาเริ่มของสถานะปัจจุบัน (' + MST_NAME[open.status] + ' เริ่ม ' + when(open.from) + ')');
    const out = [], x = openRow_(ss, 'mlog', null, open ? open.id : '');   // ไม่มีช่วงเปิด = ได้ชีตและหัวคอลัมน์ (ไม่อ่านแถว)
    if (open && x.row) out.push(saveRow_(x, TABLES.mlog.fields.filter(f => f[0] === 'to'), { to: from }));
    const r = Object.assign({ id: Utilities.getUuid(), machine: machine, status: status, from: from, to: '', wait: wait, by: who, role: admin && !role ? 'Admin' : role, at: now.toISOString(), editBy: '', editAt: '', energy: '' }, info);
    writeFields_(x.sh, x.sh.getLastRow() + 1, x.header, TABLES.mlog.fields, r, null);
    out.push(r);
    return { rows: out };
  });
}
/**
 * API 102: แอดมินแก้ไข / ลบช่วงสถานะในประวัติ (ชีต MachineLog) · ช่วงข้างเคียงขยับตามให้ประวัติต่อกันไม่มีช่องว่าง · ทุกครั้งลงประวัติการแก้ไข (AuditLog)
 * rec = { id, del: true } | { id, status, from, to, cat, note, eta }
 *   ลบ: ช่วงก่อนหน้ายาวต่อถึงจุดสิ้นสุดของช่วงที่ลบ · ลบช่วงปัจจุบัน = เครื่องกลับเป็นสถานะก่อนหน้า (ไม่มี = พร้อมใช้)
 *   แก้: เวลาเริ่มเปลี่ยน = ช่วงก่อนหน้าสิ้นสุดตาม · เวลาสิ้นสุดเปลี่ยน = ช่วงถัดไปเริ่มตาม · ช่วงปัจจุบัน (ยังไม่สิ้นสุด) แก้เวลาสิ้นสุดไม่ได้ · ห้ามทับช่วงอื่นของเครื่องเดียวกัน
 * คืน { rows: [แถวที่เปลี่ยน], del: [id ที่ลบ] }
 */
function machineLogEdit(rec, token) {
  const ss0 = ss_(), cfg = readConfig_(ss0) || {}, u = who_(token, ss0, cfg);
  if (!(u.via === 'google' || u.isAdmin)) throw new Error('แก้ไข / ลบประวัติสถานะเครื่องได้เฉพาะแอดมิน');
  rec = rec && typeof rec === 'object' ? rec : {};
  const cut = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  const id = cut(rec.id, 80), now = new Date(), who = String(u.name || u.username || u.me || '');
  if (!id) throw new Error('ไม่ได้ระบุรายการ');
  const time = (v, what, future) => {
    const d = new Date(cut(v, 40));
    if (!cut(v, 40) || isNaN(d.getTime())) throw new Error(what + 'ไม่ถูกต้อง');
    if (!future && d.getTime() > now.getTime() + 5 * 60000) throw new Error(what + 'อยู่ในอนาคต');
    return d.toISOString();
  };
  return withLock_(() => {
    const ss = ss_(), S = v => String(v == null ? '' : v).trim(), when = v => Utilities.formatDate(new Date(v), tz_(ss), 'yyyy-MM-dd HH:mm');
    const all = readCols_(ss, 'mlog', null, ['machine', 'status', 'from', 'to']), cur = all.filter(x => x.id === id)[0];
    if (!cur) throw new Error('ไม่พบรายการนี้ในประวัติ (อาจถูกลบไปแล้ว) · โหลดหน้าใหม่แล้วลองอีกครั้ง');
    // เรียงตามเวลาเริ่ม · เริ่มพร้อมกัน = ช่วงที่สิ้นสุดก่อนอยู่ก่อน ช่วงที่ยังไม่สิ้นสุดอยู่ท้าย (เทียบข้อความตรง ๆ: localeCompare จัดสัญลักษณ์ไว้ก่อนตัวเลข)
    const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0), END = '\uffff';
    const order = (a, b) => cmp(S(a.from), S(b.from)) || cmp(S(a.to) || END, S(b.to) || END);
    const out = [];
    const put = (rid, set) => { const x = openRow_(ss, 'mlog', null, rid); if (x.row) out.push(saveRow_(x, TABLES.mlog.fields.filter(f => f[0] in set), set)); };
    if (cur.status === MST_EVENT) {   // API 103: Interrupt (เหตุการณ์) ไม่มีช่วงข้างเคียง
      if (rec.del === true) { const x = openRow_(ss, 'mlog', null, id); if (x.row) delRow_(x.sh, x.row, x.header, x.vals); return { rows: [], del: [id] }; }
      const at = time(rec.from, 'เวลาที่เกิด');
      put(id, { from: at, to: at, cat: cut(rec.cat, 60), note: cut(rec.note, 500), energy: cut(rec.energy, 60), editBy: who, editAt: now.toISOString() });
      return { rows: out, del: [] };
    }
    if (cut(rec.status, 10) === MST_EVENT) throw new Error('เปลี่ยนช่วงสถานะเป็น Interrupt ไม่ได้ (บันทึก Interrupt ใหม่จากหน้าต่างสถานะเครื่อง)');
    const mine = all.filter(x => x.machine === cur.machine && x.id !== id && x.status !== MST_EVENT).sort(order);
    const prev = mine.filter(y => S(y.to) && S(y.to) === S(cur.from)).pop() || null;
    const next = S(cur.to) ? mine.filter(y => S(y.from) === S(cur.to))[0] || null : null;
    if (rec.del === true) {
      if (prev) put(prev.id, { to: S(cur.to) });
      const x = openRow_(ss, 'mlog', null, id);
      if (x.row) delRow_(x.sh, x.row, x.header, x.vals);
      return { rows: out, del: [id] };
    }
    const status = cut(rec.status, 10);
    if (MST_STATUS.indexOf(status) < 0) throw new Error('สถานะไม่ถูกต้อง');
    const open = !S(cur.to), from = time(rec.from, 'เวลาเริ่ม'), to = open ? '' : time(rec.to, 'เวลาสิ้นสุด');
    if (to && to < from) throw new Error('เวลาสิ้นสุดต้องไม่ก่อนเวลาเริ่ม');
    const eta = status !== 'ready' && cut(rec.eta, 40) ? time(rec.eta, 'เวลาที่คาดว่าเสร็จ', true) : '';
    // ช่วงข้างเคียงขยับตาม แล้วตรวจทุกช่วงของเครื่องนี้: ไม่ทับกัน · มีช่วงที่ยังไม่สิ้นสุดได้เฉพาะช่วงสุดท้าย
    const plan = mine.map(y => ({ id: y.id, status: y.status, from: S(y.from), to: S(y.to) }));
    const pv = prev ? plan.filter(y => y.id === prev.id)[0] : null, nx = next ? plan.filter(y => y.id === next.id)[0] : null;
    if (pv && from !== S(cur.from)) pv.to = from;
    if (nx && to !== S(cur.to)) nx.from = to;
    plan.push({ id: id, status: status, from: from, to: to });
    plan.sort(order);
    // ช่วงข้างเคียงที่ขยับตามแล้วติดลบ = เวลาใหม่เลยช่วงนั้นไป (ตรวจก่อน: ข้อความตรงประเด็นกว่า "ทับ")
    [[pv, prev], [nx, next]].forEach(q => {
      if (q[0] && q[0].to && q[0].to < q[0].from) throw new Error('เวลาใหม่เลยช่วง ' + MST_NAME[q[1].status] + ' ที่อยู่ติดกัน (' + when(q[1].from) + (S(q[1].to) ? ' → ' + when(q[1].to) : '') + ') · แก้ / ลบช่วงนั้นก่อน หรือเลือกเวลาที่ไม่เลยช่วงนั้น');
    });
    plan.forEach((a, i) => {
      const b = plan[i + 1];
      if (b && (!a.to || a.to > b.from)) { const o = a.id === id ? b : a; throw new Error('ช่วงเวลาทับกับช่วง ' + MST_NAME[o.status] + ' ของเครื่องนี้ (เริ่ม ' + when(o.from) + ')'); }
    });
    if (pv && pv.to !== S(prev.to)) put(prev.id, { to: pv.to });
    if (nx && nx.from !== S(next.from)) put(next.id, { from: nx.from });
    const set = { status: status, from: from, cat: status === 'ready' ? '' : cut(rec.cat, 60), note: cut(rec.note, 500), eta: eta, editBy: who, editAt: now.toISOString() };
    if (!open) set.to = to;
    put(id, set);
    return { rows: out, del: [] };
  });
}

/* ---------- API 109 (21 พ.ย.): ประกาศ · ตัววิ่งใต้แถบเมนูของอาชีพที่แจ้ง · กดรับทราบ (คนแรกของอาชีพ) = หายจากทุกคนในอาชีพนั้น · หมดอายุ = หายเอง ---------- */
const NTF_DAYS = 120;   // ส่งประกาศย้อนหลังกี่วัน (ประวัติ) · ชีต Notices เก็บทั้งหมด
const NTF_MAX_DAYS = 30;   // แสดงได้นานสุดกี่วันนับจากวันส่ง
const ntfRoles_ = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
function ntfAcks_(v) {
  let a = null;
  try { a = JSON.parse(String(v || '{}')); } catch (e) { a = null; }
  return a && typeof a === 'object' && !Array.isArray(a) ? a : {};
}
// API 110: สิทธิ์ประกาศ = แถว "ประกาศ" ใน ตั้งค่า → แถบเมนู · '' = ไม่เห็น · view = รับ (และกดรับทราบ) · edit = ส่งได้
// ยังไม่ตั้ง (ไม่มีแถว หรือไม่มีคอลัมน์ของตำแหน่งนั้น) = ส่งได้ทุกตำแหน่งของแผนก · หน่วยงานภายนอกของ Treatment Summary = ไม่เห็น
function ntfAccess_(cfg, u) {
  if (!u) return '';
  if (u.via === 'google') return 'edit';
  const nav = cfg && Array.isArray(cfg.nav) ? cfg.nav : [], x = nav.filter(n => n && n.view === 'notify')[0];
  const acc = x && x.access && typeof x.access === 'object' ? x.access : {};
  const pick = r => (Object.prototype.hasOwnProperty.call(acc, r) ? (acc[r] === 'edit' || acc[r] === 'view' ? acc[r] : '') : null);
  const own = () => { const r = String(u.role || '').trim(); if (!r || txsOuter_(cfg, r)) return ''; const a = pick(r); return a === null ? 'edit' : a; };
  if (u.isAdmin) { const a = pick(ADMIN_ROLE); return a === null ? 'edit' : a; }
  if (u.isSub && ['edit', 'view', ''].indexOf(acc[SUB_ROLE]) >= 0) return acc[SUB_ROLE];   // แอดมินรอง "ตามตำแหน่ง" = คอลัมน์ตำแหน่งของตัวเอง
  return own();
}
const ntfCanSend_ = (u, cfg) => ntfAccess_(cfg, u) === 'edit';
const NTF_HN_RE = /^[A-Za-z0-9-]{3,20}$/;
// API 150 (27 พ.ย.): ตั้งเวลาประกาศ · from = เวลาเริ่มแสดง (ISO) · ว่าง หรือไม่เกิน 1 นาทีจากนี้ = แสดงทันที · ล่วงหน้าได้ไม่เกิน NTF_MAX_DAYS วัน (+1 วันให้เลือกเวลาของวันสุดท้ายได้)
function ntfFrom_(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  const t = Date.parse(s);
  if (isNaN(t)) throw new Error('เวลาเริ่มแสดงไม่ถูกต้อง');
  if (t <= Date.now() + 60000) return '';
  if (t > Date.now() + (NTF_MAX_DAYS + 1) * 864e5) throw new Error('ตั้งเวลาล่วงหน้าได้ไม่เกิน ' + NTF_MAX_DAYS + ' วัน');
  return new Date(t).toISOString();
}
const ntfWait_ = n => !String(n.cancelAt || '') && !!String(n.from || '') && Date.parse(String(n.from)) > Date.now();   // ตั้งเวลาไว้ ยังไม่ถึงเวลา
function recentNotify_(ss) {
  const from = new Date(Date.now() - NTF_DAYS * 864e5).toISOString();
  return readTable_(ss, 'notify').filter(x => String(x.at || '') >= from);
}
/**
 * ส่งประกาศ · rec = { text (ไม่เกิน 300 ตัวอักษร), roles: [อาชีพ], level: normal | urgent, until: yyyy-mm-dd (วันนี้ ถึง 30 วัน) }
 * ผู้ส่ง: แอดมินหลัก / แอดมินรอง · คืน { rows: [ประกาศใหม่] }
 */
function notifyAdd(rec, token) {
  const ss0 = ss_(), cfg = readConfig_(ss0) || {}, u = who_(token, ss0, cfg);
  if (!ntfCanSend_(u, cfg)) throw new Error('ตำแหน่ง ' + (u.role || '-') + ' ส่งประกาศไม่ได้ (แอดมินตั้งที่ ตั้งค่า → แถบเมนู → ประกาศ)');
  rec = rec && typeof rec === 'object' ? rec : {};
  const kind = rec.kind === 'patient' ? 'patient' : 'general';
  const hn = kind === 'patient' ? String(rec.hn == null ? '' : rec.hn).replace(/\s+/g, '').toUpperCase() : '';
  const pname = kind === 'patient' ? String(rec.pname == null ? '' : rec.pname).replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  if (kind === 'patient' && !NTF_HN_RE.test(hn)) throw new Error('ประกาศผู้ป่วย: กรอก HN ให้ถูกต้อง');
  if (kind === 'patient' && !pname) throw new Error('ประกาศผู้ป่วย: กรอกชื่อผู้ป่วย');
  const text = String(rec.text == null ? '' : rec.text).replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!text) throw new Error('พิมพ์ข้อความประกาศก่อนส่ง');
  const roles = (Array.isArray(rec.roles) ? rec.roles : ntfRoles_(rec.roles)).map(x => String(x || '').trim()).filter((x, i, a) => /^[\w -]{1,20}$/.test(x) && a.indexOf(x) === i).slice(0, 20);
  if (!roles.length) throw new Error('เลือกอย่างน้อย 1 อาชีพที่จะแจ้ง');
  const level = kind === 'patient' || rec.level === 'urgent' ? 'urgent' : 'normal';   // ผู้ป่วย = ด่วนเสมอ
  const td = today_(ss0), until = String(rec.until || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new Error('วันที่แสดงถึงไม่ถูกต้อง');
  const from = ntfFrom_(rec.from), d0 = from ? Utilities.formatDate(new Date(from), tz_(ss0), 'yyyy-MM-dd') : td;   // API 150: ตั้งเวลา = นับวันแสดงจากวันเริ่ม
  const max = Utilities.formatDate(new Date(Date.parse(d0 + 'T12:00:00Z') + NTF_MAX_DAYS * 864e5), 'UTC', 'yyyy-MM-dd');
  if (until < d0) throw new Error(from ? 'วันที่แสดงถึงต้องไม่ก่อนวันเริ่มแสดง' : 'วันที่แสดงถึงต้องไม่ก่อนวันนี้');
  if (until > max) throw new Error('แสดงได้นานสุด ' + NTF_MAX_DAYS + ' วัน');
  const out = withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'notify', null, '');
    const r = { id: Utilities.getUuid(), text: text, roles: roles.join(', '), level: level, until: until, by: String(u.name || u.username || u.me || ''), byUser: String(u.username || u.me || ''),
      at: new Date().toISOString(), acks: '{}', cancelBy: '', cancelAt: '', kind: kind, hn: hn, pname: pname, from: from, tgAt: '' };
    writeFields_(x.sh, x.sh.getLastRow() + 1, x.header, TABLES.notify.fields, r, null);
    const o = { rows: [r] };
    if (from) o.due = ntfDueArm_(true);   // API 150: ตั้งตัวตั้งเวลาภายใต้ล็อกเดียวกับ ntfDueRun_ (ไม่ถูกลบทิ้งระหว่างเพิ่มประกาศ) · false = ตั้งไม่ได้
    return o;
  });
  if (!from) tgNotify_(cfg, out.rows);   // API 113: ส่งเข้า Telegram หลังปล่อยล็อก (ไม่สำเร็จ = ประกาศยังอยู่ตามปกติ) · API 150: ตั้งเวลา = ส่งตอนถึงเวลา (ntfDue)
  return out;
}
// API 150: ตัวตั้งเวลา ntfDue ทุก 5 นาที · ระบบตั้งเองเมื่อมีประกาศตั้งเวลา และลบเองเมื่อไม่มีประกาศที่รอส่ง (เรียกภายใต้ล็อกบันทึก)
function ntfDueArm_(on) {
  if (PRACTICE_) return true;   // โหมดฝึกใช้ไม่ส่ง Telegram
  try {
    const ts = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'ntfDue');
    if (!on) { ts.forEach(t => ScriptApp.deleteTrigger(t)); return false; }
    if (!ts.length) ScriptApp.newTrigger('ntfDue').timeBased().everyMinutes(5).create();
    return true;
  } catch (e) { console.log('ntfDueArm_ ' + e); return false; }
}
// ประกาศตั้งเวลาที่ถึงเวลาแล้ว (ยังไม่ยกเลิก · ยังไม่ส่ง) = ส่ง Telegram ครั้งเดียว (บันทึก tgAt ก่อนส่ง กันส่งซ้ำ) · หน้าเว็บแสดงเองตามเวลาของแต่ละเครื่อง
// คืน { sent, wait } · ไม่เหลือประกาศรอ = ลบตัวตั้งเวลา
function ntfDueRun_() {
  const ss0 = ss_();
  const r = withLock_(() => {
    const ss = ss_(), now = Date.now(), out = [];
    const pend = readTable_(ss, 'notify').filter(n => String(n.from || '') && !String(n.tgAt || '') && !String(n.cancelAt || ''));
    const due = pend.filter(n => !(Date.parse(String(n.from)) > now));
    due.forEach(n => {
      const x = openRow_(ss, 'notify', null, String(n.id));
      if (!x.row || !x.cur || String(x.cur.tgAt || '') || String(x.cur.cancelAt || '')) return;
      out.push(saveRow_(x, TABLES.notify.fields, { tgAt: new Date().toISOString() }));
    });
    const wait = pend.length - due.length;
    if (!wait) ntfDueArm_(false);
    return { rows: out, wait: wait };
  });
  if (r.rows.length) tgNotify_(readConfig_(ss0) || {}, r.rows);
  return { sent: r.rows.length, wait: r.wait };
}
function ntfDue(e) {
  ownerRun_(e);   // ตัวตั้งเวลาของโปรเจกต์นี้ หรือเจ้าของกด Run เท่านั้น
  return JSON.stringify(ntfDueRun_());
}
/** รับทราบประกาศในนามอาชีพของผู้ใช้ (คนแรกของอาชีพ) · กดซ้ำหรือคนอื่นในอาชีพกดไปแล้ว = คืนประกาศเดิม · คืน { rows: [ประกาศ] } */
function notifyAck(id, token) {
  const ss0 = ss_(), cfg = readConfig_(ss0) || {}, u = who_(token, ss0, cfg), role = String(u.role || '').trim();
  if (!role) throw new Error('บัญชีนี้ไม่มีตำแหน่ง จึงรับทราบในนามอาชีพไม่ได้');
  id = String(id || '').trim();
  if (!id) throw new Error('ไม่ได้ระบุประกาศ');
  return withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'notify', null, id), cur = x.cur;
    if (!x.row || !cur) throw new Error('ไม่พบประกาศนี้ (อาจถูกลบไปแล้ว)');
    const roles = ntfRoles_(cur.roles), mine = roles.filter(r => r.toLowerCase() === role.toLowerCase())[0];
    if (!mine) throw new Error('ประกาศนี้ไม่ได้แจ้ง ' + role);
    if (ntfWait_(cur)) throw new Error('ประกาศนี้ยังไม่ถึงเวลาแสดง');   // API 150
    const acks = ntfAcks_(cur.acks);
    if (acks[mine]) return { rows: [cur] };
    if (String(cur.cancelAt || '')) throw new Error('ประกาศนี้ถูกยกเลิกแล้ว');
    acks[mine] = { by: String(u.name || u.username || u.me || ''), user: String(u.username || u.me || ''), at: new Date().toISOString() };
    return { rows: [saveRow_(x, TABLES.notify.fields, { acks: JSON.stringify(acks) })] };
  });
}
/** ยกเลิกประกาศ (หายจากแถบของทุกอาชีพ · ยังอยู่ในประวัติ) · แอดมินหลัก / แอดมินรอง: ทุกประกาศ · ผู้ส่ง: ประกาศของตัวเอง · คืน { rows: [ประกาศ] } */
function notifyCancel(id, token) {
  const ss0 = ss_(), cfg = readConfig_(ss0) || {}, u = who_(token, ss0, cfg);
  const boss = !!(u && (u.isAdmin || u.isSub || u.via === 'google')), me = String((u && (u.username || u.me)) || '');
  id = String(id || '').trim();
  return withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'notify', null, id);
    if (!x.row || !x.cur) throw new Error('ไม่พบประกาศนี้ (อาจถูกลบไปแล้ว)');
    if (!boss && !(me && String(x.cur.byUser || '') === me)) throw new Error('ยกเลิกได้เฉพาะประกาศที่คุณส่ง (แอดมินยกเลิกได้ทุกประกาศ)');
    if (String(x.cur.cancelAt || '')) return { rows: [x.cur] };
    return { rows: [saveRow_(x, TABLES.notify.fields, { cancelBy: String(u.name || u.username || u.me || ''), cancelAt: new Date().toISOString() })] };
  });
}
/** API 112: ลบประกาศถาวร (หายจากแถบและประวัติของทุกคน) · เฉพาะแอดมินหลัก / แอดมินรอง / บัญชี Google · บันทึกในประวัติการบันทึก (AuditLog) · คืน { id, deleted } */
function notifyDelete(id, token) {
  const ss0 = ss_(), cfg = readConfig_(ss0) || {}, u = who_(token, ss0, cfg);
  if (!(u && (u.isAdmin || u.isSub || u.via === 'google'))) throw new Error('ลบประกาศได้เฉพาะแอดมินหลักและแอดมินรอง');
  id = String(id || '').trim();
  if (!id) throw new Error('ไม่พบประกาศนี้');
  return withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'notify', null, id);
    if (!x.row) return { id: id, deleted: false };   // ถูกลบไปแล้ว = ถือว่าสำเร็จ
    delRow_(x.sh, x.row, x.header, x.vals);
    return { id: id, deleted: true };
  });
}

/* ---------- API 113: ส่งประกาศเข้า Telegram ----------
 * token ของ bot (จาก @BotFather) เก็บใน Script Properties (TG_TOKEN) · ไม่อยู่ในชีต ไม่อยู่ในโค้ด ไม่ส่งกลับหน้าเว็บ · ตั้ง / ลบ = แอดมินหลัก (tgSetup)
 * config.tg = { on, chats: { อาชีพ: chat id }, all: chat id (กลุ่มรวม: ทุกประกาศ), kinds: [patient | brachy | general], hn: ใส่ HN ในข้อความ }
 * ข้อความ = ประเภท · ถึงอาชีพ · HN + ชื่อย่อ (API 114 · ตั้งได้: HN อย่างเดียว / ไม่ใส่) · ข้อความ · ผู้ส่ง · ลิงก์ RT Hub · ไม่ส่งชื่อเต็มของผู้ป่วยเสมอ
 * ส่งหลังบันทึกประกาศ (นอกล็อก · ส่งพร้อมกันทุกกลุ่ม) · ส่งไม่สำเร็จไม่กระทบประกาศ (ผลล่าสุดดูที่ ตั้งค่า) · โหมดฝึกใช้ไม่ส่ง */
const TG_PROP = 'TG_TOKEN', TG_BOT = 'TG_BOT', TG_LAST = 'TG_LAST', TG_CHATS = 'TG_CHATS', TG_MIG = 'TG_MIG';   // API 141: TG_MIG = { id เก่า: id ใหม่ } (กลุ่มที่อัปเกรดเป็น supergroup)
const TG_KINDS = ['patient', 'brachy', 'general'];
const TG_ID_RE = /^-?\d{3,20}(#\d{1,10})?$/;   // API 137: กลุ่ม#Topic (message_thread_id) = ส่งเข้า Topic ย่อยของกลุ่ม
// ปลายทางของ sendMessage: chat_id (+ message_thread_id ของ Topic)
const tgDest_ = v => { const m = /^(-?\d{3,20})(?:#(\d{1,10}))?$/.exec(String(v == null ? '' : v).trim()); if (!m) return { chat_id: String(v) }; const id = tgMig_()[m[1]] || m[1]; return m[2] ? { chat_id: id, message_thread_id: +m[2] } : { chat_id: id }; };   // API 141: id เก่าของกลุ่มที่อัปเกรด = id ใหม่
// API 141: กลุ่มที่อัปเกรดเป็น supergroup · id ใหม่จากคำตอบของ Telegram · เก็บคู่ id (สูงสุด 50 คู่ · id ที่อัปเกรดต่อกันชี้ไปตัวสุดท้าย)
function tgMig_() { try { const m = JSON.parse(propRead_(TG_MIG) || '{}'); return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; } catch (e) { return {}; } }
const tgMigTo_ = j => { const v = String((j && !j.ok && j.parameters && j.parameters.migrate_to_chat_id) || ''); return /^-?\d{3,20}$/.test(v) ? v : ''; };
function tgMigSave_(from, to) {
  from = String(from == null ? '' : from); to = String(to == null ? '' : to);
  if (!/^-?\d{3,20}$/.test(from) || !/^-?\d{3,20}$/.test(to) || from === to) return;
  const m = tgMig_();
  m[from] = to;
  Object.keys(m).forEach(k => { if (m[k] === from) m[k] = to; });
  const ks = Object.keys(m);
  ks.slice(0, Math.max(0, ks.length - 50)).forEach(k => delete m[k]);
  try { propSave_(TG_MIG, JSON.stringify(m)); } catch (e) { /* จำไม่ได้: ครั้งหน้าส่งซ้ำใหม่ */ }
}
// id ที่ตั้งไว้ (กลุ่ม หรือ กลุ่ม#Topic) → id ปัจจุบันของกลุ่ม
const tgMigId_ = (v, mig) => { const m = /^(-?\d{3,20})((?:#\d{1,10})?)$/.exec(String(v == null ? '' : v)); return m && mig[m[1]] ? mig[m[1]] + m[2] : String(v == null ? '' : v); };
const TG_TOKEN_RE = /^\d{5,15}:[A-Za-z0-9_-]{30,60}$/;
function tgCfg_(cfg) {
  const t = cfg && cfg.tg && typeof cfg.tg === 'object' ? cfg.tg : {};
  const id = v => { v = String(v == null ? '' : v).trim(); return TG_ID_RE.test(v) ? v : ''; };
  const chats = {};
  if (t.chats && typeof t.chats === 'object') Object.keys(t.chats).forEach(r => { const v = id(t.chats[r]); if (v && /^[\w -]{1,20}$/.test(r)) chats[r] = v; });
  // API 114: pt = ข้อมูลผู้ป่วยในข้อความ · abbr = HN + ชื่อย่อ (ค่าเริ่มต้น) · hn = HN อย่างเดียว · none = ไม่ใส่ · รุ่น 113 (hn: true) = hn
  const pt = TG_PT.indexOf(t.pt) >= 0 ? t.pt : 'hn';   // API 140: ยังไม่เลือก = HN อย่างเดียว (ข้อมูลผู้ป่วยออกนอกโรงพยาบาลน้อยที่สุด)
  return { on: t.on === true, chats: chats, all: id(t.all), kinds: Array.isArray(t.kinds) ? t.kinds.filter(k => TG_KINDS.indexOf(k) >= 0) : TG_KINDS.slice(), pt: pt };
}
const TG_PT = ['abbr', 'hn', 'none'];
// API 114: ชื่อย่อ = คำนำหน้า (ตามที่บันทึก) + ชื่อ 3 ตัวอักษรแรก + นามสกุล 3 ตัวอักษรแรก (สระบน / ล่าง / วรรณยุกต์นับรวมกับตัวหน้า · ยาวกว่านั้นต่อด้วย .) เช่น นาย สมชาย ใจดี → นาย สมช. ใจดี
function tgAbbr_(name) {
  const all = String(name == null ? '' : name).replace(/\s+/g, ' ').trim(), m = all.match(TXS_TITLE_RE), title = m ? m[0].trim() : '', t = all.slice(m ? m[0].length : 0).trim();   // คำนำหน้าแสดงตามที่บันทึก
  if (!t) return title;
  const cut = w => { const ch = w.match(/[^\u0E31\u0E34-\u0E3A\u0E47-\u0E4E][\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]*/g) || []; return ch.length > 3 ? ch.slice(0, 3).join('') + '.' : w; };
  const p = t.split(' ');
  return [title, cut(p[0]), p.length > 1 ? cut(p.slice(1).join('')) : ''].filter(Boolean).join(' ');
}
const tgEsc_ = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tgKind_ = n => (n && (n.kind === 'patient' || n.kind === 'brachy') ? n.kind : 'general');
function tgUrl_() { try { return String(ScriptApp.getService().getUrl() || ''); } catch (e) { return ''; } }
// ข้อความ (HTML ของ Telegram) · ไม่มีชื่อผู้ป่วยเต็ม
// 2026-11-23.3: สั้นลง = "🟢 ข้อความ" + บรรทัด "(ผู้ประกาศ)" · ไม่มีหัว "ประกาศ · ถึง …" / "จาก …" / ลิงก์เปิด RT Hub
// ผู้ป่วย 🔴 · HDR 🟣 · ด่วน 🔴 · ทั่วไป 🟢 · ผู้ป่วย / HDR: HN + ชื่อย่อ / HN / ไม่ใส่ (ตั้งค่า · API 114) นำหน้าข้อความ
// 2026-11-27.2: ประกาศผู้ป่วย / HDR = ตัด HN ที่ซ้ำในเนื้อความ (แม่แบบ {HN}) · ตั้งไม่ใส่ HN ก็ไม่มี HN · คำว่า Emergency = 🚨 ตัวหนา (Telegram ใส่สีตัวอักษรไม่ได้)
function tgNoHn_(t, hn) {
  const s = String(t == null ? '' : t), h = String(hn == null ? '' : hn).replace(/[^0-9A-Za-z]/g, '');
  if (!h) return s;
  const x = s.replace(new RegExp('(^|[^0-9A-Za-z])' + h + '(?![0-9A-Za-z])', 'g'), '$1').replace(/[ \t]{2,}/g, ' ').replace(/^[ \t·,:-]+/, '').trim();
  return x || s;
}
const tgEm_ = s => String(s).replace(/\b(emergency)\b/gi, '🚨<b>$1</b>');
function tgText_(n, c) {
  const k = tgKind_(n), icon = k === 'patient' || (k === 'general' && n.level === 'urgent') ? '🔴' : k === 'brachy' ? '🟣' : '🟢';
  const who = k === 'general' || c.pt === 'none' ? [] : [n.hn ? 'HN <b>' + tgEsc_(n.hn) + '</b>' : '', c.pt === 'abbr' ? tgEsc_(tgAbbr_(n.pname)) : ''].filter(Boolean);
  return icon + ' ' + (who.length ? who.join(' ') + ' · ' : '') + tgEm_(tgEsc_(k === 'general' ? n.text : tgNoHn_(n.text, n.hn))) + '\n(' + tgEsc_(n.by) + ')';
}
const tgReq_ = (token, method, body) => ({ url: 'https://api.telegram.org/bot' + token + '/' + method, method: 'post', contentType: 'application/json', payload: JSON.stringify(body || {}), muteHttpExceptions: true });
// ข้อความผิดพลาดที่เก็บ / ส่งกลับ: ตัด token ออกเสมอ
const tgClean_ = (msg, token) => { let m = String(msg == null ? '' : msg); if (token) m = m.split(token).join('***'); return m.replace(/https?:\/\/api\.telegram\.org\/\S*/gi, 'api.telegram.org').replace(/bot\d{5,15}:[A-Za-z0-9_-]{30,60}/g, 'bot***').slice(0, 300); };   // 2026-11-26.1: ตัด URL ของ Telegram ด้วย
// 2026-11-26.1: เรียก Telegram 1 คำสั่ง · เชื่อมต่อไม่ได้ (exception) = ลองใหม่ 1 ครั้ง แล้วคืน { ok: false, description } ที่ไม่มี URL / token (ไม่โยนข้อความดิบกลับหน้าเว็บ)
function tgFetch_(tok, url, opt) {
  for (let i = 0; ; i++) {
    try { return tgParse_(UrlFetchApp.fetch(url, Object.assign({ muteHttpExceptions: true }, opt || {}))); }
    catch (e) {
      if (i >= 1) return { ok: false, description: 'เชื่อมต่อ Telegram ไม่ได้ชั่วคราว ลองใหม่อีกครั้ง (' + tgClean_(String((e && e.message) || e).replace(/https?:\/\/\S+/g, '').replace(/[\s:]+$/, ''), tok) + ')' };
      try { Utilities.sleep(800); } catch (x) { /* ไม่มี sleep (ทดสอบ) */ }
    }
  }
}
function tgParse_(res) { try { return JSON.parse(res.getContentText()) || {}; } catch (e) { return { ok: false, description: 'HTTP ' + (res && res.getResponseCode ? res.getResponseCode() : '?') }; } }
function tgLast_(o) { try { propSave_(TG_LAST, JSON.stringify(Object.assign({ at: new Date().toISOString() }, o))); } catch (e) { /* เก็บผลล่าสุดไม่ได้: ไม่เป็นไร */ } }
// ประกาศ (แถวของตาราง notify) → กลุ่มของอาชีพที่แจ้ง (+ กลุ่มรวม) · กลุ่มเดียวกันส่งครั้งเดียว
function tgNotify_(cfg, rows) {
  let token = '';
  try {
    if (PRACTICE_ || !rows || !rows.length) return;
    const c = tgCfg_(cfg);
    if (!c.on) return;
    token = String(propRead_(TG_PROP) || '');
    if (!token) return;
    const reqs = [], to = [];
    const chatOf = r => { const k = Object.keys(c.chats).filter(x => x.toLowerCase() === String(r).toLowerCase())[0]; return k ? c.chats[k] : ''; };
    rows.forEach(n => {
      if (c.kinds.indexOf(tgKind_(n)) < 0) return;
      const ids = [];
      ntfRoles_(n.roles).forEach(r => { const id = chatOf(r); if (id && ids.indexOf(id) < 0) ids.push(id); });
      if (c.all && ids.indexOf(c.all) < 0) ids.push(c.all);
      const text = tgText_(n, c);
      ids.forEach(id => { reqs.push(tgReq_(token, 'sendMessage', Object.assign(tgDest_(id), { text: text, parse_mode: 'HTML', disable_web_page_preview: true }))); to.push(id); });
    });
    if (!reqs.length) return;
    const res = UrlFetchApp.fetchAll(reqs), bad = [], again = [], againTo = [];
    res.forEach((x, i) => {
      const j = tgParse_(x), nid = tgMigTo_(j);
      if (nid) {   // API 141: กลุ่มอัปเกรดเป็น supergroup = ส่งซ้ำไป id ใหม่ + จำไว้
        const b = JSON.parse(reqs[i].payload);
        tgMigSave_(b.chat_id, nid);
        b.chat_id = nid;
        again.push(tgReq_(token, 'sendMessage', b)); againTo.push(to[i]);
      } else if (!j.ok) bad.push(to[i] + ': ' + tgClean_(j.description || ('HTTP ' + x.getResponseCode()), token));
    });
    if (again.length) UrlFetchApp.fetchAll(again).forEach((x, i) => { const j = tgParse_(x); if (!j.ok) bad.push(againTo[i] + ': ' + tgClean_(j.description || ('HTTP ' + x.getResponseCode()), token)); });
    tgLast_({ sent: reqs.length, ok: reqs.length - bad.length, err: bad.slice(0, 3).join(' · ') });
  } catch (e) { tgLast_({ sent: 0, ok: 0, err: tgClean_(e && e.message, token) }); }
}
// แอดมิน: หลัก / รอง / บัญชี Google (ดูสถานะ ค้นหากลุ่ม ทดสอบ) · ตั้ง token = แอดมินหลัก / บัญชี Google
function tgAdmin_(token, main) {
  if (PRACTICE_ && main !== null) throw new Error('โหมดฝึกใช้: ตั้งค่า Telegram ในระบบจริง');
  const ss0 = ss_(), cfg = readConfig_(ss0) || {}, u = who_(token, ss0, cfg);
  const ok = u && (u.isAdmin || u.via === 'google' || (!main && u.isSub));
  if (!ok) throw new Error(main ? 'ตั้ง bot ของ Telegram ได้เฉพาะแอดมินหลัก' : 'ตั้งค่า Telegram ได้เฉพาะแอดมิน');
  return { u: u, cfg: cfg };
}
// API 115: ลิงก์เชิญเข้ากลุ่ม Telegram (ใครได้ไปก็เข้ากลุ่มได้) = ส่งเฉพาะผู้ที่เห็นประกาศ (ตั้งค่า → แถบเมนู → ประกาศ)
function tgCfgFor_(cfg, u) {
  if (!cfg || !cfg.tg || typeof cfg.tg !== 'object' || !cfg.tg.link) return cfg;
  if (ntfAccess_(cfg, u)) return cfg;
  const out = Object.assign({}, cfg);
  out.tg = Object.assign({}, cfg.tg);
  delete out.tg.link;
  return out;
}
function tgChatsSaved_() { try { const a = JSON.parse(propRead_(TG_CHATS) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
/** สถานะ: ตั้ง bot แล้วหรือยัง (ไม่ส่ง token) · ชื่อ bot · กลุ่มที่เคยพบ · ผลการส่งล่าสุด */
function tgState(token) {
  if (PRACTICE_) return { set: false, bot: '', chats: [], last: null, url: '', practice: true };
  tgAdmin_(token, false);
  let last = null;
  try { last = JSON.parse(propRead_(TG_LAST) || 'null'); } catch (e) { last = null; }
  return { set: !!propRead_(TG_PROP), bot: String(propRead_(TG_BOT) || ''), chats: tgChatsSaved_(), last: last, url: tgUrl_(), mig: tgMig_() };   // API 141: mig = กลุ่มที่อัปเกรด (id เก่า → ใหม่)
}
/** ตั้ง token ของ bot (ตรวจกับ Telegram ก่อนเก็บ) · ว่าง = ลบ bot · แอดมินหลักเท่านั้น · ไม่บันทึก token ในประวัติ */
function tgSetup(tok, token) {
  tgAdmin_(token, true);
  tok = String(tok == null ? '' : tok).trim();
  const props = PropertiesService.getScriptProperties();
  if (!tok) {
    [TG_PROP, TG_BOT, TG_CHATS, TG_LAST, TG_MIG].forEach(k => { props.deleteProperty(k); if (PROPS_) delete PROPS_[k]; });
    audit_('config', '', '', 'edit', { 'Telegram': 'ลบ bot' });
    return tgState(token);
  }
  if (!TG_TOKEN_RE.test(tok)) throw new Error('token ไม่ถูกต้อง (รูปแบบ 123456789:ABC… จาก @BotFather)');
  const j = tgFetch_(tok, 'https://api.telegram.org/bot' + tok + '/getMe');
  if (!j.ok || !j.result) throw new Error(/^เชื่อมต่อ Telegram/.test(String(j.description || '')) ? j.description : 'Telegram ไม่รับ token นี้: ' + tgClean_(j.description || 'ตรวจไม่ผ่าน', tok));   // 2026-11-26.1: เชื่อมต่อไม่ได้ ≠ token ผิด
  propSave_(TG_PROP, tok);
  propSave_(TG_BOT, String(j.result.username || ''));
  audit_('config', '', '', 'edit', { 'Telegram': 'ตั้ง bot @' + String(j.result.username || '') });
  return tgState(token);
}
/** ค้นหากลุ่มที่เพิ่ม bot แล้ว (getUpdates · Telegram เก็บไว้ 24 ชั่วโมง) · รวมกับกลุ่มที่เคยพบ · คืน [{ id, title, type }] */
function tgChats(token) {
  tgAdmin_(token, false);
  const tok = String(propRead_(TG_PROP) || '');
  if (!tok) throw new Error('ยังไม่ได้ตั้ง bot (วาง token ก่อน)');
  const j = tgFetch_(tok, 'https://api.telegram.org/bot' + tok + '/getUpdates');
  if (!j.ok) throw new Error('ค้นหากลุ่มไม่สำเร็จ: ' + tgClean_(j.description, tok));
  const found = tgChatsSaved_(), put = ch => {
    if (!ch || ch.type === 'private' || !TG_ID_RE.test(String(ch.id))) return;
    const id = String(ch.id), title = String(ch.title || ch.username || id).slice(0, 80) + (ch.is_forum ? ' › General' : ''), at = found.map(x => x.id).indexOf(id);   // API 137: กลุ่มที่เปิด Topics = ส่งเข้า General
    if (at >= 0) found[at] = { id: id, title: title, type: String(ch.type || '') }; else found.push({ id: id, title: title, type: String(ch.type || '') });
  };
  (Array.isArray(j.result) ? j.result : []).forEach(up => {
    ['message', 'edited_message', 'channel_post', 'my_chat_member', 'chat_member'].forEach(k => { if (up[k] && up[k].chat) put(up[k].chat); });
    const m = up.message || {};
    if (m.migrate_to_chat_id) { put({ id: m.migrate_to_chat_id, title: (m.chat && m.chat.title) || '', type: 'supergroup' }); if (m.chat) tgMigSave_(m.chat.id, m.migrate_to_chat_id); }   // กลุ่มเปลี่ยนเป็น supergroup = id ใหม่ (API 141: จำคู่ id)
    // API 137: Topic ของกลุ่มที่เปิด Topics = พิมพ์ /start ใน Topic นั้น (หรือสร้าง / แก้ชื่อ Topic หลังเพิ่ม bot) · id = กลุ่ม#Topic
    const tm = up.message || up.edited_message || {}, tc = tm.chat || {}, th = +tm.message_thread_id || 0;
    if (tc.is_forum && th > 0 && (tm.is_topic_message || tm.forum_topic_created || tm.forum_topic_edited) && /^-?\d{3,20}$/.test(String(tc.id))) {
      const tid = String(tc.id) + '#' + th, at = found.map(x => x.id).indexOf(tid), old = at >= 0 ? found[at] : null;
      const nm = String((tm.forum_topic_created || tm.forum_topic_edited || (tm.reply_to_message && tm.reply_to_message.forum_topic_created) || {}).name || (old && old.topic) || '').slice(0, 60);
      const x = { id: tid, title: String(tc.title || tc.id).slice(0, 60) + ' › ' + (nm || 'Topic ' + th), type: 'topic', topic: nm };
      if (old) found[at] = x; else found.push(x);
    }
  });
  const mig = tgMig_(), seen = {}, cur = [];   // API 141: กลุ่มที่อัปเกรดแล้ว = แสดงด้วย id ใหม่ครั้งเดียว
  found.slice().reverse().forEach(x => { const id = tgMigId_(x.id, mig); if (seen[id]) return; seen[id] = 1; cur.unshift(id === x.id ? x : Object.assign({}, x, { id: id, type: x.type === 'topic' ? 'topic' : 'supergroup' })); });
  const keep = cur.slice(-50);
  propSave_(TG_CHATS, JSON.stringify(keep));
  return keep;
}
/* ---------- API 137: Telegram ส่วนตัว (ข้อความส่วนตัว) ----------
 * ผู้ใช้เชื่อมเองที่ บัญชีของฉัน · bot เดียวกับประกาศ (token ใน Script Properties) · chat id เก็บใน Script Properties ต่อบัญชี (TGU_ + ชื่อผู้ใช้ / อีเมล)
 * ไม่ลงชีต ไม่ส่ง chat id กลับหน้าเว็บ · โหมดฝึกใช้ไม่เชื่อม / ไม่ส่ง · ข้อความ = หัวข้อ + ข้อความ + ผู้ส่ง (เหมือนสำเนาอีเมล) */
const TGU_ = 'TGU_', TGLK_ = 'tglk_', TGLK_MIN_ = 30;
const tgUserOf_ = acc => { try { const x = JSON.parse(propRead_(TGU_ + String(acc || '').toLowerCase()) || 'null'); return x && TG_ID_RE.test(String(x.id)) ? x : null; } catch (e) { return null; } };
function tgMeKeys_(token) {
  if (PRACTICE_) throw new Error('โหมดฝึกใช้: เชื่อม Telegram ในระบบจริง');
  const u = who_(token), keys = inboxKeys_(u);
  if (!keys.length) throw new Error('เข้าสู่ระบบด้วยบัญชีของคุณก่อนเชื่อม Telegram');
  return { u: u, keys: keys };
}
/** สถานะ Telegram ส่วนตัวของฉัน { set: ตั้ง bot แล้ว, bot, linked, name (ชื่อใน Telegram), at, off: แอดมินปิดสำเนา } */
function tgMe(token) {
  if (PRACTICE_) return { set: false, bot: '', linked: false, practice: true };
  const m = tgMeKeys_(token), x = m.keys.map(tgUserOf_).filter(Boolean)[0] || null, cfg = readConfig_(ss_()) || {};
  return { set: !!propRead_(TG_PROP), bot: String(propRead_(TG_BOT) || ''), linked: !!x, name: x ? String(x.name || '') : '', at: x ? String(x.at || '') : '', off: (cfg.msg || {}).tg === false };
}
/** เริ่มเชื่อม: รหัส 8 ตัว (ใช้ได้ 30 นาที) + ลิงก์เปิด bot (กด Start = ส่งรหัสให้ bot เอง) */
function tgLinkStart(token) {
  const m = tgMeKeys_(token);
  if (!propRead_(TG_PROP)) throw new Error('แอดมินยังไม่ได้ตั้ง bot ของ Telegram (ตั้งค่า → ประกาศ → Telegram)');
  const bot = String(propRead_(TG_BOT) || ''), code = (Utilities.getUuid() + Math.random().toString(16) + Date.now().toString(16)).replace(/[^0-9a-f]/gi, '').slice(0, 8).toUpperCase();
  CacheService.getScriptCache().put(TGLK_ + code, JSON.stringify({ keys: m.keys, name: String(m.u.name || m.u.username || '') }), TGLK_MIN_ * 60);
  return { code: code, bot: bot, url: bot ? 'https://t.me/' + bot + '?start=' + code : '', min: TGLK_MIN_ };
}
/** ตรวจว่ากด Start ใน bot แล้วหรือยัง (getUpdates · แชทส่วนตัวที่ส่ง /start รหัส หรือรหัส) · พบ = เก็บ chat id แล้วส่งข้อความยืนยันเข้า Telegram */
function tgLinkCheck(code, token) {
  const m = tgMeKeys_(token), tok = String(propRead_(TG_PROP) || '');
  if (!tok) throw new Error('แอดมินยังไม่ได้ตั้ง bot ของ Telegram');
  code = String(code == null ? '' : code).trim().toUpperCase();
  if (!/^[0-9A-F]{8}$/.test(code)) throw new Error('รหัสเชื่อมไม่ถูกต้อง · กด เชื่อม Telegram ใหม่');
  let lk = null;
  try { lk = JSON.parse(CacheService.getScriptCache().get(TGLK_ + code) || 'null'); } catch (e) { lk = null; }
  if (!lk || !Array.isArray(lk.keys) || lk.keys.indexOf(m.keys[0]) < 0) throw new Error('รหัสเชื่อมหมดอายุ (' + TGLK_MIN_ + ' นาที) · กด เชื่อม Telegram ใหม่');
  const q = tgReq_(tok, 'getUpdates', { offset: -100 });   // 100 รายการล่าสุด (ค่าเริ่มต้นของ Telegram = เก่าสุดก่อน: กลุ่มที่คุยกันมากอาจไม่เห็น /start ที่เพิ่งกด)
  const j = tgFetch_(tok, q.url, { method: q.method, contentType: q.contentType, payload: q.payload });
  if (!j.ok) throw new Error('ตรวจสอบกับ Telegram ไม่สำเร็จ: ' + tgClean_(j.description, tok));
  let chat = null;
  (Array.isArray(j.result) ? j.result : []).forEach(up => {
    const msg = up.message || {}, ch = msg.chat || {}, t = String(msg.text || '').trim().toUpperCase();
    if (ch.type === 'private' && TG_ID_RE.test(String(ch.id)) && (t === code || t === '/START ' + code)) chat = ch;   // ล่าสุดชนะ
  });
  if (!chat) return { linked: false };
  const rec = JSON.stringify({ id: String(chat.id), name: String([chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || '').slice(0, 60), at: new Date().toISOString() });
  m.keys.forEach(k => propSave_(TGU_ + k, rec));
  try { CacheService.getScriptCache().remove(TGLK_ + code); } catch (e) { /* หมดอายุเอง */ }
  const r = tgReq_(tok, 'sendMessage', { chat_id: String(chat.id), text: '✅ <b>เชื่อม RT Hub แล้ว</b>\nข้อความส่วนตัวถึง ' + tgEsc_(m.u.name || m.u.username || '') + ' จะส่งสำเนามาที่นี่ด้วย\nยกเลิกได้ที่ RT Hub → บัญชีของฉัน', parse_mode: 'HTML', disable_web_page_preview: true });
  try { UrlFetchApp.fetch(r.url, { method: r.method, contentType: r.contentType, payload: r.payload, muteHttpExceptions: true }); } catch (e) { /* ยืนยันไม่ได้ไม่เป็นไร */ }
  audit_('config', '', '', 'edit', { 'Telegram ส่วนตัว': 'เชื่อม · ' + m.keys[0] });
  return Object.assign(tgMe(token), { linked: true });
}
/** ส่งข้อความทดสอบเข้า Telegram ของฉัน */
function tgMeTest(token) {
  const m = tgMeKeys_(token), tok = String(propRead_(TG_PROP) || ''), x = m.keys.map(tgUserOf_).filter(Boolean)[0];
  if (!tok) throw new Error('แอดมินยังไม่ได้ตั้ง bot ของ Telegram');
  if (!x) throw new Error('ยังไม่ได้เชื่อม Telegram');
  const r = tgReq_(tok, 'sendMessage', { chat_id: String(x.id), text: '✉️ <b>ทดสอบจาก RT Hub</b>\nข้อความส่วนตัวถึงคุณจะมาที่นี่', parse_mode: 'HTML', disable_web_page_preview: true });
  const j = tgFetch_(tok, r.url, { method: r.method, contentType: r.contentType, payload: r.payload });
  return { ok: !!j.ok, err: j.ok ? '' : tgClean_(j.description || 'ส่งไม่สำเร็จ', tok) };
}
/** ยกเลิกการเชื่อม (ทุกชื่อบัญชีของฉัน) */
function tgUnlink(token) {
  const m = tgMeKeys_(token), props = PropertiesService.getScriptProperties();
  m.keys.forEach(k => { props.deleteProperty(TGU_ + k); if (PROPS_) delete PROPS_[TGU_ + k]; });
  audit_('config', '', '', 'edit', { 'Telegram ส่วนตัว': 'ยกเลิก · ' + m.keys[0] });
  return tgMe(token);
}
// สำเนาข้อความส่วนตัว (แถวของตาราง inbox) เข้า Telegram ของผู้รับที่เชื่อมไว้ · ส่งไม่สำเร็จไม่กระทบข้อความ
function tgDm_(cfg, rows, fromName) {
  let token = '';
  try {
    if (PRACTICE_ || !rows || !rows.length || ((cfg && cfg.msg) || {}).tg === false) return 0;
    token = String(propRead_(TG_PROP) || '');
    if (!token) return 0;
    const reqs = [];
    rows.forEach(r => {
      const x = tgUserOf_(r.to);
      if (!x) return;
      const text = '✉️ <b>' + tgEsc_(r.title || 'ข้อความ') + '</b>' + (r.text ? '\n' + tgEsc_(String(r.text).slice(0, 3000)) : '') + '\n(จาก ' + tgEsc_(fromName) + ')';
      reqs.push(tgReq_(token, 'sendMessage', { chat_id: String(x.id), text: text, parse_mode: 'HTML', disable_web_page_preview: true }));
    });
    if (reqs.length) UrlFetchApp.fetchAll(reqs);
    return reqs.length;
  } catch (e) { console.log('tgDm ' + tgClean_(e && e.message, token)); return 0; }
}
/** ส่งข้อความทดสอบเข้ากลุ่ม · คืน { ok, err } */
function tgTest(chatId, token) {
  const a = tgAdmin_(token, false);
  const tok = String(propRead_(TG_PROP) || '');
  if (!tok) throw new Error('ยังไม่ได้ตั้ง bot (วาง token ก่อน)');
  chatId = String(chatId == null ? '' : chatId).trim();
  if (!TG_ID_RE.test(chatId)) throw new Error('รหัสกลุ่มไม่ถูกต้อง');
  const url = tgUrl_(), text = '<b>✅ ทดสอบจาก RT Hub</b>\nกลุ่มนี้จะได้รับประกาศตามที่ตั้งไว้ใน ตั้งค่า → ประกาศ → Telegram\n<i>โดย ' + tgEsc_(a.u.name || a.u.username || '') + '</i>' + (url ? '\n<a href="' + tgEsc_(url) + '">เปิด RT Hub</a>' : '');
  const r = tgReq_(tok, 'sendMessage', Object.assign(tgDest_(chatId), { text: text, parse_mode: 'HTML', disable_web_page_preview: true }));   // API 137: Topic
  let j = tgFetch_(tok, r.url, { method: r.method, contentType: r.contentType, payload: r.payload });
  const nid = tgMigTo_(j);
  if (nid) {   // API 141: กลุ่มอัปเกรดเป็น supergroup = จำ id ใหม่ แล้วส่งซ้ำ
    const b = JSON.parse(r.payload);
    tgMigSave_(b.chat_id, nid);
    b.chat_id = nid;
    j = tgFetch_(tok, r.url, { method: r.method, contentType: r.contentType, payload: JSON.stringify(b) });
  }
  return { ok: !!j.ok, err: j.ok ? '' : tgClean_(j.description || 'ส่งไม่สำเร็จ', tok), mig: nid ? tgMigId_(chatId, tgMig_()) : '' };
}

/* ---------- API 94 (19 พ.ย.): แถบ Nurse → เลื่อนนัด · นัดวันนี้ · ผู้ป่วยไม่มาตามนัด (ตาราง NurseCall) ---------- */
const NC_FROM_VIEWS = ['appt', 'consult', 'ctsim', 'bq', 'course', 'work', 'pend', 'nurse', 'contour'];   // API 121: Contouring (Cancel Treatment = ยกเลิกนัด)
const NC_DAY_ = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
function recentNcall_(ss) {
  const from = Utilities.formatDate(new Date(Date.now() - 90 * 864e5), tz_(ss), 'yyyy-MM-dd');
  return readTable_(ss, 'ncall').filter(x => String(x.at).slice(0, 10) >= from || (x.kind === 'mv' && x.status !== 'told'));
}
// เลื่อนนัดแจ้งพยาบาล (ติ๊กใต้ช่องวันที่ในฟอร์ม CT Order / นัดใส่แร่): หนึ่งแถวต่อการเลื่อนหนึ่งครั้ง · to ว่าง = เลื่อนไม่มีกำหนด
function ncallAdd(rec, token) {
  const u = requireEdit_(token, NC_FROM_VIEWS);
  rec = rec && typeof rec === 'object' ? rec : {};
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const r = { kind: 'mv', what: cut(rec.what, 8), ref: cut(rec.ref, 80), hn: cut(rec.hn, 40), name: cut(rec.name, 200), doc: cut(rec.doc, 10).toUpperCase(), from: cut(rec.from, 10), to: cut(rec.to, 10), date: '', note: cut(rec.note, 300) };
  if (['ct', 'sim', 'bq'].indexOf(r.what) < 0) throw new Error('ไม่รู้จักนัดที่เลื่อน');
  if (!r.hn) throw new Error('ไม่มี HN');
  const okDay = v => !v || v === 'on call' || NC_DAY_(v);
  if (!okDay(r.from) || !okDay(r.to)) throw new Error('วันที่ไม่ถูกต้อง');
  if (r.from === r.to) throw new Error('วันนัดไม่ได้เปลี่ยน');
  Object.assign(r, { id: Utilities.getUuid(), status: '', tries: '', by: R8_WHO_(u), at: new Date().toISOString(), nBy: '', nAt: '' });
  return withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'ncall', null, r.id);
    writeFields_(x.sh, x.sh.getLastRow() + 1, x.header, TABLES.ncall.fields, r, null);
    return r;
  });
}
// แจ้งผู้ป่วยแล้ว (told) / ติดต่อไม่ได้ (fail · นับครั้ง) / ล้าง ('') · หมายเหตุทั้งสองแบบ
function ncallMark(id, status, note, token) {
  const u = requireEdit_(token, EDIT_VIEWS.ncall);
  status = status === 'told' || status === 'fail' ? status : '';
  return withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'ncall', null, String(id || ''));
    if (!x.row) throw new Error('ไม่พบรายการนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    if (x.cur.kind !== 'mv') throw new Error('รายการนี้ไม่ใช่การเลื่อนนัด');
    const n = Math.max(0, Math.floor(+x.cur.tries || 0));
    const set = { status: status, tries: String(status === 'fail' ? n + 1 : status ? n : 0), note: String(note == null ? x.cur.note : note).trim().slice(0, 300), nBy: status ? R8_WHO_(u) : '', nAt: status ? new Date().toISOString() : '' };
    if (set.tries === '0') set.tries = '';
    writeFields_(x.sh, x.row, x.header, TABLES.ncall.fields.filter(f => f[0] in set), set, x.vals);
    return Object.assign(x.cur, set);
  });
}
// นัดวันนี้: มาแล้ว (came) / ไม่มา ติดต่อแล้ว (noshow) / ล้าง ('') · id = att|what|ref|วันนัด
// ไม่มาทำ CT-Sim = เอาออกจากคิว CT (นัดเป็น ไม่มาทำ CT · หน้าแจกงานแพทย์กลับไปรอลงนัด ให้แพทย์แก้วันนัดหรือยกเลิก) · เปลี่ยนเป็นมาแล้ว / ล้าง = คืนคิว
const NC_SKIP_BY = ' · Nurse: ไม่มาตามนัด';
const NC_SIM_SEE = 'Start RT วันแรก · พบแพทย์ก่อน';
const NC_CT_SEE = 'CT-Sim · พบแพทย์ก่อน';   // API 135: Note ของรายการพบแพทย์จากนัด CT-Sim วันนี้ (มาตามนัด → พบแพทย์)
const NC_OFF_SEE = 'Off RT · พบแพทย์';   // API 119: Note ของรายการพบแพทย์ที่มาจากกลุ่ม Off RT   // Note ของรายการพบแพทย์ที่มาจาก "มาแล้วพบแพทย์ก่อน"
/** API 104: แถบ Nurse → Hold RT: Note ของผู้ป่วยที่ Hold อยู่ (เพิ่มได้หลายครั้ง · หนึ่งแถวต่อหนึ่ง Note · kind note) */
function ncallNote(rec, token) {
  const u = requireEdit_(token, EDIT_VIEWS.ncall);
  rec = rec && typeof rec === 'object' ? rec : {};
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const note = cut(rec.note, 300), ref = cut(rec.ref, 80);
  if (!ref || !cut(rec.hn, 40)) throw new Error('ไม่มีข้อมูลผู้ป่วย');
  if (!note) throw new Error('กรอก Note');
  return withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'ncall', null, ''), now = new Date().toISOString();
    const r = { id: Utilities.getUuid(), kind: 'note', what: 'hold', ref: ref, hn: cut(rec.hn, 40), name: cut(rec.name, 200), doc: cut(rec.doc, 10).toUpperCase(), from: '', to: '', date: today_(ss), status: '', tries: '', note: note, by: R8_WHO_(u), at: now, nBy: '', nAt: '' };
    writeFields_(x.sh, x.sh.getLastRow() + 1, x.header, TABLES.ncall.fields, r, null);
    return r;
  });
}
/** API 104: แถบ Nurse → Hold RT: ยกเลิก course ของผู้ป่วยที่ Hold อยู่ (ต้องใส่สาเหตุ) = Cancel RT วันนี้ (เหมือน Off RT → Cancel RT ในแถบห้องฉาย · บันทึกผู้ยกเลิก) */
function holdCancel(id, reason, token) {
  const u = requireEdit_(token, EDIT_VIEWS.nurse);
  reason = String(reason == null ? '' : reason).trim().slice(0, 300);
  if (!reason) throw new Error('กรอกสาเหตุที่ยกเลิก course');
  return caseEdit_(u, String(id || ''), '', () => false, (c0, ss) => {
    if (has_(c0.rt)) throw new Error('เคสนี้บันทึก ' + (c0.rt === 'cancel' ? 'Cancel RT' : 'Complete course') + ' ไว้แล้ว');
    const open = jsonList_(c0.fxlog).filter(x => x && !x.lane && x.act === 'skip' && !String(x.back || ''))[0];
    if (!open) throw new Error('ผู้ป่วยนี้ไม่ได้ Hold อยู่แล้ว โหลดหน้าใหม่แล้วลองอีกครั้ง');
    return { rt: 'cancel', rtDate: today_(ss), rtAt: Utilities.formatDate(new Date(), tz_(ss), 'yyyy-MM-dd HH:mm'), rtBy: R8_WHO_(u) + ' (Nurse · Hold RT)', rtNote: reason };
  });
}
/**
 * API 104: คำสั่ง Hold RT ของแพทย์ที่พยาบาลยืนยันแล้ว = สถานะ Hold ในตารางวันฉาย (เหมือนสั่ง Hold จากสถานะ fraction · จนกว่าจะกลับมา)
 * วันที่ = วันที่ของคำสั่ง · วันนั้นบันทึกฉายแล้ว / สถานะอื่นไว้แล้ว = เริ่ม Hold วันถัดไป · Hold อยู่แล้ว = ไม่เพิ่ม · รายการมี ord = id ของคำสั่ง
 * on = false (ยกเลิกการยืนยัน / แพทย์แก้คำสั่ง): เอารายการ Hold ที่มาจากคำสั่งนี้ออก · คืนเคสที่เปลี่ยน (ไม่เปลี่ยน = null)
 */
function rtdHold_(ss, row, on) {
  const cid = String((row && row.case) || ''), oid = String((row && row.id) || ''), d = String((row && row.date) || '').slice(0, 10);
  if (!cid || !oid || !R8_DAY_(d)) return null;
  const x = openRow_(ss, 'cases', readConfig_(ss), cid);
  if (!x.row || has_(x.cur.rt)) return null;
  let list = jsonList_(x.cur.fxlog).filter(e => e), changed = false;
  const mine = e => String(e.ord || '') === oid;
  if (list.some(mine)) { list = list.filter(e => !mine(e)); changed = true; }
  if (on && String(row.rt) === 'hold') {
    const main = list.filter(e => !e.lane), held = main.some(e => e.act === 'skip' && String(e.date) <= d && (!String(e.back || '') || d < String(e.back)));
    if (!held) {
      let from = d;
      if (list.some(e => String(e.date).slice(0, 10) === d)) { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + 1); from = t.toISOString().slice(0, 10); }   // วันนั้นบันทึกไว้แล้ว (เช่น ฉายแล้ว + พบแพทย์) = Hold ตั้งแต่วันถัดไป
      if (!list.some(e => String(e.date).slice(0, 10) === from)) {
        list.push({ date: from, type: 'hold', label: 'Hold', act: 'skip', back: '', reason: '', note: ('คำสั่งแพทย์ ' + d + (row.note ? ' · ' + row.note : '')).slice(0, 200), ord: oid,
          by: String(row.nurseBy || row.by || ''), at: Utilities.formatDate(new Date(), tz_(ss), 'yyyy-MM-dd HH:mm') });
        changed = true;
      }
    }
  }
  if (!changed) return null;
  list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return saveRow_(x, TABLES.cases.fields, { fxlog: list.length ? JSON.stringify(list) : '' });
}
function ncallAtt(rec, token) {
  const u = requireEdit_(token, EDIT_VIEWS.ncall);
  rec = rec && typeof rec === 'object' ? rec : {};
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  // API 104: what see = นัดพบแพทย์ระหว่างฉาย (ref = รายการพบแพทย์) · fx = พบแพทย์ระหว่างฉายจากสถานะ fraction (ref = เคส)
  // status see = มาแล้วพบแพทย์ก่อน (เฉพาะ Start RT วันแรก): เพิ่มรายการพบแพทย์ของวันนั้น (ห้องตรวจ → ระหว่างฉาย) · เปลี่ยนเป็นอย่างอื่น = เอารายการนั้นออก (ถ้ายังไม่ได้พบ)
  const what = cut(rec.what, 8), ref = cut(rec.ref, 80), date = cut(rec.date, 10);
  // API 119: what off = Off RT วันนี้ · adv = ไม่พบแพทย์ + แนะนำผู้ป่วยแล้ว · see = พบแพทย์ · seeadv = แพทย์พบแล้ว ยืนยัน + แนะนำผู้ป่วยแล้ว
  const status = what === 'off' ? (['adv', 'see', 'seeadv'].indexOf(rec.status) >= 0 ? rec.status : '')
    : what === 'cmt' ? (rec.status === 'rc' || rec.status === 'cr' ? rec.status : '')   // API 128: นัดเคมีบำบัด RT→CMT / CMT→RT
    : rec.status === 'came' || rec.status === 'noshow' || (rec.status === 'see' && (what === 'sim' || what === 'ct')) ? rec.status : '';   // API 135: CT-Sim พบแพทย์
  if (['ct', 'sim', 'see', 'fx', 'off', 'cmt'].indexOf(what) < 0) throw new Error('ไม่รู้จักนัด');
  if (!ref || !NC_DAY_(date)) throw new Error('ไม่มีข้อมูลนัด');
  const who = R8_WHO_(u), now = new Date().toISOString();
  const out = withLock_(() => {
    const ss = ss_(), id = 'att|' + what + '|' + ref + '|' + date, x = openRow_(ss, 'ncall', null, id);
    const prev = x.cur ? String(x.cur.status || '') : '';
    const vid = what === 'sim' ? 'simsee|' + ref + '|' + date : what === 'off' ? 'offsee|' + ref + '|' + date : what === 'ct' ? 'ctsee|' + ref + '|' + date : '', v = vid ? openRow_(ss, 'visit', null, vid) : null;
    if (status === 'seeadv' && !(v && v.row && String(v.cur.seen || ''))) throw new Error('แพทย์ยังไม่ได้กด พบแพทย์แล้ว (ห้องตรวจ → ระหว่างฉาย)');
    const r = { id: id, kind: 'att', what: what, ref: ref, hn: cut(rec.hn, 40), name: cut(rec.name, 200), doc: cut(rec.doc, 10).toUpperCase(), from: '', to: '', date: date,
      status: status, tries: '', note: cut(rec.note, 300), by: x.cur ? x.cur.by : who, at: x.cur ? x.cur.at : now, nBy: status ? who : '', nAt: status ? now : '' };
    writeFields_(x.sh, x.row || x.sh.getLastRow() + 1, x.header, TABLES.ncall.fields, r, x.row ? x.vals : null);
    let appt = null;
    if (what === 'ct') {   // คิว CT: ไม่มา = ไม่มาทำ CT · มาแล้ว / ล้าง = คืนคิว (เฉพาะที่พยาบาลตั้งไว้)
      const a = openRow_(ss, 'appt', null, ref);
      if (a.row) {
        const took = String(a.cur.took || ''), mine = took === 'skip' && String(a.cur.tookBy || '').indexOf(NC_SKIP_BY) >= 0;
        let set = null;
        if (status === 'noshow' && !took) set = { took: 'skip', tookBy: who + NC_SKIP_BY, tookAt: now, updated: now };
        else if (status !== 'noshow' && mine) set = { took: '', tookBy: '', tookAt: '', updated: now };
        if (set) { writeFields_(a.sh, a.row, a.header, TABLES.appt.fields.filter(f => f[0] in set), set, a.vals); markDirty_('appt'); appt = Object.assign(a.cur, set); }
      }
    }
    let visit = null, visitDel = '';
    if (v) {   // API 104: มาแล้วพบแพทย์ก่อน · API 119: Off RT พบแพทย์ ↔ รายการพบแพทย์ของวันนั้น (id ตายตัวต่อการนัด)
      const keep = status === 'see' || status === 'seeadv';
      if (keep && !v.row) {
        if (!r.hn || !r.name) throw new Error('ไม่มี HN / ชื่อของผู้ป่วย');
        if (dqDocs_(readConfig_(ss) || {}).indexOf(r.doc) < 0) throw new Error('ผู้ป่วยนี้ยังไม่ได้ระบุแพทย์ (ส่งพบแพทย์ไม่ได้) · ใส่แพทย์ในเคส / นัดก่อน');
        visit = { id: vid, date: date, hn: r.hn, name: r.name, doc: r.doc, note: what === 'off' ? NC_OFF_SEE : what === 'ct' ? NC_CT_SEE : NC_SIM_SEE, by: who, at: now, seen: '', seenBy: '' };
        writeFields_(v.sh, v.sh.getLastRow() + 1, v.header, TABLES.visit.fields, visit, null);
      } else if (keep) visit = v.cur;
      else if (v.row && !String(v.cur.seen || '')) { delRow_(v.sh, v.row, v.header, v.vals); visitDel = vid; }
    }
    let ntf = [];
    try { ntf = noShowNtf_(ss, readConfig_(ss) || {}, u, r, prev); } catch (e) { console.log('noShowNtf ' + e); }   // API 127
    return { rec: r, appt: appt, visit: visit, visitDel: visitDel, ntf: ntf, dm: r.status === 'noshow' && prev !== 'noshow' && NS_TEXT_[r.what] ? 1 : 0 };
  });
  if (out.ntf && out.ntf.length) { try { tgNotify_(readConfig_(ss_()) || {}, out.ntf); } catch (e) { console.log('noShow tg ' + e); } }   // Telegram หลังปล่อยล็อก
  if (out.dm) { try { out.docMsg = noShowDocMsg_(readConfig_(ss_()) || {}, who, out.rec); } catch (e) { console.log('noShow msg ' + e); out.docMsg = ''; } }   // API 135: หลังปล่อยล็อก
  delete out.dm;
  return out;
}
// API 135: ไม่มาตามนัด = ข้อความส่วนตัวถึงแพทย์เจ้าของไข้ (บัญชีที่เชื่อมไว้ในตั้งค่า → ทีม → แพทย์) · ไม่ใส่ชื่อผู้ป่วยและหมายเหตุ (มีสำเนาอีเมล)
// คืนบัญชีที่ส่ง · '' = ไม่ได้ส่ง (ปิดไว้ / แพทย์ยังไม่ได้เชื่อมบัญชี)
function noShowDocMsg_(cfg, who, r) {
  const ns = cfg.noShow && typeof cfg.noShow === 'object' ? cfg.noShow : {};
  if (ns.msgDoc === false || !NS_TEXT_[r.what] || !r.doc) return '';
  const d = (Array.isArray(cfg.doctors) ? cfg.doctors : []).filter(x => x && String(x.code || '').trim().toUpperCase() === String(r.doc).toUpperCase())[0];
  const acc = d ? String(d.user || '').trim().toLowerCase() : '';
  if (!acc || !/^[a-z0-9._@+-]+$/.test(acc)) return '';
  const day = String(r.date || ''), text = 'HN ' + r.hn + ' ' + NS_TEXT_[r.what] + ' (' + day.slice(8, 10) + '/' + day.slice(5, 7) + ') · พยาบาลบันทึกไม่มาตามนัด · ' + who;
  inboxPost_(cfg, { acc: '', name: 'Nurse · ' + who }, [{ acc: acc, name: String(d.name || d.code || acc) }], 'msg', 'ผู้ป่วยไม่มาตามนัด', text, 'ns|' + r.id, (cfg.msg || {}).mail !== false, []);
  return acc;
}
// API 127: ไม่มา แจ้งแพทย์แล้ว = ประกาศผู้ป่วย (ประเภท patient · ด่วน · หมดอายุสิ้นวัน) ถึงอาชีพที่ตั้งไว้ · id ตายตัวต่อการนัด (กดซ้ำไม่ซ้ำ)
// ยกเลิกไม่มา / เปลี่ยนเป็นมาแล้ว = ยกเลิกประกาศ · ข้อความไม่ใส่หมายเหตุของพยาบาล (ส่งเข้า Telegram ด้วย)
const NS_TEXT_ = { ct: 'ไม่มา CT วันนี้', sim: 'ไม่มา RT วันนี้', see: 'ไม่มาพบแพทย์ระหว่างฉายวันนี้' };
/* ---------- API 132 (24 พ.ย.): ลิงก์ประกาศของปุ่ม (ตั้งค่า → ลิงก์ประกาศ) ----------
 * views = แถบที่ต้องบันทึกได้ (ผู้กดปุ่มนั้น) · srv = Code.gs ส่งเอง (ปุ่มเดิม) · ข้อความเริ่มต้นตรงกับ NTF_LINKS ในหน้าเว็บ */
const NTF_LINK_ = {
  'ns.ct': { srv: 1, text: 'ไม่มา CT วันนี้ ({วันที่})' }, 'ns.sim': { srv: 1, text: 'ไม่มา RT วันนี้ ({วันที่})' }, 'ns.see': { srv: 1, text: 'ไม่มาพบแพทย์ระหว่างฉายวันนี้ ({วันที่})' },
  'bq.ct': { srv: 1, text: 'HDR {รอบ} ส่งภาพแล้ว' },
  'ct.new': { views: EDIT_VIEWS.ctsim, text: 'ทำ CT-SIM แล้ว ({วันที่})' }, 'cn.done': { views: ['contour'], text: 'Contour เสร็จแล้ว รอวางแผน' },
  'cn.rect': { views: ['contour'], text: 'Re-CT จาก Contouring ({วันที่})' }, 'cn.cancel': { views: ['contour'], text: 'Cancel Treatment ({วันที่})' },   // API 141: ปุ่ม Contouring ตั้งแยกกัน
  'pc.done': { views: EDIT_VIEWS.cases, text: 'Plan complete แล้ว' }, 'ap.new': { views: EDIT_VIEWS.appt, text: 'CT Order ใหม่ · นัด CT {วันที่}' },
  'nu.ap': { views: EDIT_VIEWS.nurse, text: 'Nurse ยืนยัน CT Order แล้ว · นัด CT {วันที่}' }, 'nu.dq': { views: EDIT_VIEWS.nurse, text: 'Nurse ยืนยัน Standing order แล้ว' },
  'rtd.hold': { views: EDIT_VIEWS.rtd, text: 'แพทย์สั่ง Hold RT ({วันที่})' }, 'dq.new': { views: EDIT_VIEWS.dq, text: 'เคสใหม่ · แพทย์ {แพทย์}' },
  'cc.done': { views: EDIT_VIEWS.course, text: 'Complete course ({วันที่})' }, 'bq.new': { views: EDIT_VIEWS.bq, text: 'นัดใส่แร่ใหม่ {วันที่}' },
  'ev.ok': { views: ['evaluate'], text: 'แพทย์ Approved แผนแล้ว' }, 'ev.edit': { views: ['evaluate'], text: 'แพทย์ให้แก้แผน' },   // API 136: แถบ Evaluation
  'fx.st': { views: EDIT_VIEWS.course, text: 'บันทึกสถานะ fraction ({วันที่})' },   // API 148: หน้าต่างสถานะ fraction (เงื่อนไข type / see)
  'cn.hdr': { views: ['contour'], text: 'Contour HDR {รอบ} เสร็จแล้ว รอวางแผน' }, 'ev.bq': { views: ['evaluate'], text: 'แพทย์ Approved แผน HDR แล้ว' }   // API 148
};
// API 133: ประกาศตามเงื่อนไขในฟอร์ม · ช่องที่ตั้งเงื่อนไขได้ของปุ่มบันทึกฟอร์ม (ตรงกับ NTF_COND ในหน้าเว็บ · หน้าเว็บเทียบค่ากับรายการที่บันทึกแล้วเรียก ntfLink)
const NTF_COND_ = { 'ap.new': ['prio', 'cm', 'special', 'room'], 'ct.new': ['prio', 'type', 'ctcm', 'special', 'aim', 'pstat', 'hdr', 'ct'], 'dq.new': ['how', 'desk'], 'bq.new': ['tech'], 'fx.st': ['type', 'see'] };
// API 138: จุดบันทึกทั่วไป (ตั้งจากโหมดตั้งลิงก์ประกาศบนหน้าเว็บ) · sv.ชื่อคำสั่ง · สิทธิ์ = บันทึกได้อย่างน้อยหนึ่งแถบ (ไม่ระบุแถบ)
const SV_KEY_ = /^sv\.[a-zA-Z]{2,60}$/;
// API 141: เงื่อนไขที่มีค่าเริ่มต้น (ไม่ได้ตั้งในลิงก์ประกาศ = ใช้ค่านี้ · อาชีพ = ของปุ่มที่เปิดอยู่ + roles · แอดมินลบ = { cut, on: false }) · ตรงกับ NTF_DEF ในหน้าเว็บ
const NTF_DEF_ = { 'ct.new|prio=Emergency': { roles: ['RTT', 'MP'], text: 'Emergency {HN} {แพทย์} {วันที่ start RT} {ห้องฉาย}' } };
const ntfDef_ = k => NTF_LINK_[k] || (SV_KEY_.test(String(k || '')) ? { views: undefined, text: 'บันทึก ' + String(k).slice(3) } : null);
function lkCond_(k) {
  const m = /^([a-z]+\.[a-zA-Z]+)\|([a-zA-Z]{1,30})=([^|"\\<>]{1,60})$/.exec(String(k || ''));
  if (m && SV_KEY_.test(m[1])) return { base: m[1], f: m[2], v: m[3] };   // API 138: ช่องใดก็ได้ของรายการที่บันทึก (หน้าเว็บตรวจเงื่อนไข)
  return m && NTF_LINK_[m[1]] && !NTF_LINK_[m[1]].srv && (NTF_COND_[m[1]] || []).indexOf(m[2]) >= 0 ? { base: m[1], f: m[2], v: m[3] } : null;
}
const lkRoles_ = v => (Array.isArray(v) ? v : []).map(r => String(r || '').trim()).filter((r, i, a) => /^[\w -]{1,20}$/.test(r) && a.indexOf(r) === i).slice(0, 20);
// API 143: ส่งข้อความส่วนตัวถึงบุคคลของผู้ป่วย (ตรงกับ NTF_PPL ในหน้าเว็บ)
const NTF_PPL_ = { doc: 'แพทย์เจ้าของไข้', mp: 'นักฟิสิกส์ผู้วางแผน' };
const lkPeople_ = v => (Array.isArray(v) ? v : []).map(x => String(x || '')).filter((x, i, a) => Object.prototype.hasOwnProperty.call(NTF_PPL_, x) && a.indexOf(x) === i);
// ลิงก์ของปุ่ม { on, roles, text } · ไม่ได้ตั้งในลิงก์ประกาศ: ปุ่มเดิม = ค่าเดิม (noShow / bq.ntf) · ปุ่มอื่น = null (ไม่ลิงก์)
function ntfLinkCfg_(cfg, k) {
  const c = NTF_LINK_[k] ? null : lkCond_(k), def = ntfDef_(c ? c.base : k);   // API 133: คีย์เงื่อนไข = ข้อความเริ่มต้นของปุ่ม · API 138: จุดบันทึก sv.
  if (!def) return null;
  const m = cfg && cfg.ntfLink && typeof cfg.ntfLink === 'object' && !Array.isArray(cfg.ntfLink) ? cfg.ntfLink : {}, x = m[k];
  if (x && typeof x === 'object') return { on: x.on !== false, roles: lkRoles_(x.roles), text: String(x.text || '').replace(/\s+/g, ' ').trim().slice(0, 200) || def.text, people: def.srv ? [] : lkPeople_(x.people) };
  if (c && NTF_DEF_[k]) { const B = ntfLinkCfg_(cfg, c.base), D = NTF_DEF_[k]; return { on: true, roles: lkRoles_((B && B.on ? B.roles : []).concat(D.roles)), text: D.text, people: [] }; }   // API 141
  if (c) return null;   // เงื่อนไขที่ไม่ได้ตั้ง = ไม่ลิงก์
  if (/^ns\./.test(k)) { const ns = cfg && cfg.noShow && typeof cfg.noShow === 'object' ? cfg.noShow : {}; return { on: ns[k.slice(3)] !== false, roles: lkRoles_(Array.isArray(ns.roles) ? ns.roles : ['RTT']), text: def.text, people: [] }; }
  if (k === 'bq.ct') { const bq = cfg && cfg.bq && typeof cfg.bq === 'object' ? cfg.bq : {}; return { on: true, roles: lkRoles_(Array.isArray(bq.ntf) ? bq.ntf : ['RO', 'MP']), text: def.text, people: [] }; }
  return null;
}
// API 142: ห้องฉายของผู้ป่วย (ประกาศอัตโนมัติ) · เคสที่ยังอยู่ในคอร์ส = ไม่ Complete course ก่อนวันนี้ / ไม่ Cancel RT / ไม่ Off RT · งานแก้แผนแทนงานเดิม
// · ย้ายห้องตลอดไปแล้ว = ห้องใหม่ · ไม่นับเคสที่เริ่ม (หรือแจกงาน) เกิน 180 วันโดยไม่มีสถานะจบ · หลาย part คนละห้อง = ทุกห้อง · อ่านไม่ได้ = ไม่ใส่ห้อง
function ntfTxRoom_(ss, cfg, hn) { return ntfRoomsOf_(ntfCases_(ss, cfg, hn)); }
// API 143: เคสที่ยังอยู่ในคอร์สของผู้ป่วย (เงื่อนไขเดียวกับห้องฉาย ไม่บังคับมีห้อง) · อ่านไม่ได้ = []
function ntfCases_(ss, cfg, hn) {
  try {
    if (!hnKey_(hn)) return [];
    const td = today_(ss), old = Utilities.formatDate(new Date(Date.parse(td + 'T12:00:00Z') - 180 * 864e5), 'UTC', 'yyyy-MM-dd');
    const simple = (cfg && Array.isArray(cfg.cats) ? cfg.cats : []).filter(k => k && k.kind === 'simple').map(k => String(k.id));
    const rows = rowsOfHn_(ss, 'cases', hn), day = v => String(v == null ? '' : v).slice(0, 10);
    const rp = c => { try { const m = JSON.parse(String(c.replan || '')); return m && typeof m === 'object' ? m : null; } catch (e) { return null; } };
    const revised = rows.map(rp).filter(m => m && m.kind === 'revise' && m.of).map(m => String(m.of));
    return rows.filter(c => {
      const m = rp(c), rt = String(c.rt || ''), rd = day(c.rtDate), ref = day(c.sim || c.in || c.created);
      if (simple.indexOf(String(c.cat)) >= 0 || (String(c.replan || '') && !(m && m.kind === 'revise')) || revised.indexOf(String(c.id)) >= 0) return false;
      if ((rt === 'complete' && (!rd || rd < td)) || (rt === 'cancel' && (!rd || rd <= td))) return false;
      if (/^\d{4}-\d{2}-\d{2}$/.test(ref) && ref < old) return false;
      return !jsonList_(c.fxlog).some(e => e && e.act === 'off' && !e.lane && day(e.date) <= td);
    });
  } catch (e) { console.log('ntfCases ' + e); return []; }
}
// ห้องฉายของเคส (ย้ายห้องตลอดไปแล้ว = ห้องใหม่ · ไม่มีห้อง = ไม่นับ)
function ntfRoomsOf_(cs) {
  const out = [], day = v => String(v == null ? '' : v).slice(0, 10);
  try {
    const td = cs.length ? today_(ss_()) : '';
    cs.forEach(c => {
      if (!String(c.room || '').trim()) return;
      const mv = jsonList_(c.rmove).filter(x => x && x.scope === 'on' && day(x.date) <= td && String(x.room || '').trim()).sort((a, b) => day(a.date).localeCompare(day(b.date))).pop();
      const room = String(mv ? mv.room : c.room).replace(/\s+/g, ' ').trim().slice(0, 30);
      if (room && out.indexOf(room) < 0) out.push(room);
    });
  } catch (e) { console.log('ntfRooms ' + e); }
  return out;
}
// API 143: บุคคลที่ได้รับข้อความ [{ type, acc, name }] · เคส = รายการที่กด (ref มี id ของเคส) ไม่งั้นทุกเคสในคอร์สของ HN
// แพทย์ = ctx.doc หรือแพทย์ของเคส → บัญชีใน ตั้งค่า → ทีม (แพทย์) · MP = ctx.mp หรือ MP ของเคส → บัญชีของนักฟิสิกส์ · ไม่มีบัญชี / ตัวผู้กด = ไม่ส่ง
function ntfPeople_(cfg, people, ctx, cs, me) {
  const out = [], seen = {}, up = v => String(v == null ? '' : v).trim().toUpperCase();
  try {
    if (!people || !people.length) return out;
    const ids = String(ctx.ref || '').split('|'), one = cs.filter(c => String(c.id || '') && ids.indexOf(String(c.id)) >= 0), use = one.length ? one : cs;
    const add = (type, list, code) => {
      const p = (Array.isArray(list) ? list : []).filter(x => x && up(x.code) && up(x.code) === up(code))[0], acc = p ? String(p.user || '').trim().toLowerCase() : '';
      if (!acc || !/^[a-z0-9._@+-]+$/.test(acc) || acc === me || seen[acc]) return;
      seen[acc] = 1;
      out.push({ type: type, acc: acc, name: String(p.name || p.code || acc) });
    };
    if (people.indexOf('doc') >= 0) (ctx.doc ? [ctx.doc] : use.map(c => c.doc)).filter(Boolean).forEach(code => add('doc', cfg.doctors, code));
    if (people.indexOf('mp') >= 0) (ctx.mp ? [ctx.mp] : use.map(c => c.mp)).filter(Boolean).forEach(code => add('mp', cfg.staff, code));
  } catch (e) { console.log('ntfPeople ' + e); }
  return out;
}
// ส่งข้อความ (กล่องข้อความ + Telegram ส่วนตัว · ไม่ส่งอีเมล) · ข้อความ = HN + ข้อความประกาศ (ไม่มีชื่อผู้ป่วย) · คืนจำนวนผู้รับ
function ntfDm_(cfg, by, to, hn, text, ref) {
  if (!to.length) return 0;
  const body = (hn ? 'HN ' + hn + ' · ' : '') + text;
  Object.keys(NTF_PPL_).forEach(t => { const xs = to.filter(r => r.type === t).map(r => ({ acc: r.acc, name: r.name })); if (xs.length) inboxPost_(cfg, { acc: '', name: by }, xs, 'msg', 'ประกาศถึง' + NTF_PPL_[t], body, ref, false, []); });
  return to.length;
}
// ต่อท้าย " · ห้อง X" (ห้องที่มีในข้อความแล้วไม่ต่อซ้ำ)
const ntfRoomText_ = (text, rooms) => { const t = String(text || ''), rs = (rooms || []).filter(r => t.indexOf(r) < 0); return rs.length ? (t + ' · ห้อง ' + rs.join(', ')).slice(0, 300) : t; };
// ข้อความ: แทนที่ {วันที่} {แพทย์} {ห้อง} {รอบ} (ไม่มีค่า = ว่าง) · ไม่มีช่องชื่อผู้ป่วย (HN / ชื่อแนบแยกแบบประกาศผู้ป่วย)
// 2026-11-26.4: {วันที่ start RT} = "(Start RT วว/ดด)" (ข้อความเขียน Start RT ไว้เองแล้ว = วันที่อย่างเดียว · ไม่มีวัน = ว่าง)
const ntfSimTxt_ = (tpl, sd) => { if (!sd) return ''; const d = sd.slice(8, 10) + '/' + sd.slice(5, 7); return /start\s*rt/i.test(String(tpl || '').replace(/\{วันที่ start RT\}/g, '')) ? d : '(Start RT ' + d + ')'; };
const ntfText_ = (tpl, v) => String(tpl || '').replace(/\{(HN|วันที่ start RT|วันที่|แพทย์|ห้องฉาย|ห้อง|รอบ)\}/g, (m, p) => String((v && v[p]) || '')).replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').replace(/\s+\)/g, ')').trim().slice(0, 200);
/** หน้าเว็บเรียกหลังบันทึกสำเร็จ (ปุ่มที่ลิงก์ไว้) · ctx = { ref, hn, name, date, doc, room, round, off }
 * id ประกาศ = lk|คีย์|ref (กดซ้ำไม่ประกาศซ้ำ · off = ยกเลิกประกาศของรายการนั้น เช่น ยกเลิกยืนยัน) · ต้องบันทึกในแถบของปุ่มนั้นได้ */
function ntfLink(key, ctx, token) {
  key = String(key || '');
  const cd = NTF_LINK_[key] ? null : lkCond_(key), def = ntfDef_(cd ? cd.base : key);   // API 133: คีย์เงื่อนไข (ปุ่ม|ช่อง=ค่า) · สิทธิ์ = แถบของปุ่ม · API 138: sv. = แถบใดก็ได้ที่บันทึกได้
  if (!def || def.srv) throw new Error('ไม่รู้จักลิงก์ประกาศนี้');
  const u = requireEdit_(token, def.views);
  ctx = ctx && typeof ctx === 'object' ? ctx : {};
  const cut = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  const ref = cut(ctx.ref, 80);
  if (!ref) throw new Error('ไม่มีรายการของประกาศ');
  const id = 'lk|' + key + '|' + ref, by = String(u.name || u.username || u.me || ''), now = new Date().toISOString();
  const cs = !ctx.off && cut(ctx.hn, 40) ? ntfCases_(ss_(), readConfig_(ss_()) || {}, cut(ctx.hn, 40)) : [], rooms = ntfRoomsOf_(cs);   // API 142: ห้องฉายของผู้ป่วย · API 143: เคสสำหรับบุคคล (อ่านก่อนเข้าล็อก)
  const out = withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss) || {}, x = openRow_(ss, 'notify', null, id), live = !!x.row && !String(x.cur.cancelAt || '');
    if (ctx.off) {
      if (live) writeFields_(x.sh, x.row, x.header, TABLES.notify.fields.filter(f => f[0] === 'cancelBy' || f[0] === 'cancelAt'), { cancelBy: by, cancelAt: now }, x.vals);
      return { rows: [], cfg: cfg };
    }
    const L = ntfLinkCfg_(cfg, key);
    if (!L || !L.on || (!L.roles.length && !L.people.length) || live) return { rows: [], cfg: cfg };   // ไม่ได้ลิงก์ · ประกาศแล้ว (กดซ้ำ) · API 143: บุคคลอย่างเดียวก็ได้
    const d = /^\d{4}-\d{2}-\d{2}$/.test(String(ctx.date || '')) ? String(ctx.date) : '', hn = cut(ctx.hn, 40);
    const sd = /^\d{4}-\d{2}-\d{2}$/.test(String(ctx.sim || '')) ? String(ctx.sim) : '';   // API 141: วันที่ start RT
    const rec = { id: id, text: ntfRoomText_(ntfText_(L.text, { 'HN': hn, 'วันที่': d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '', 'วันที่ start RT': ntfSimTxt_(L.text, sd), 'แพทย์': cut(ctx.doc, 10).toUpperCase(), 'ห้อง': cut(ctx.room, 30), 'ห้องฉาย': cut(ctx.txroom, 30), 'รอบ': cut(ctx.round, 20) }) || def.text, rooms),
      roles: L.roles.join(', '), level: 'urgent', until: today_(ss), by: by, byUser: String(u.username || u.me || ''), at: now, acks: '{}', cancelBy: '', cancelAt: '',
      kind: hn ? 'patient' : 'general', hn: hn, pname: hn ? cut(ctx.name, 200) : '' };
    if (!L.roles.length) return { rows: [], cfg: cfg, L: L, rec: rec };   // API 143: ไม่เลือกอาชีพ = ไม่ขึ้นแถบประกาศ (ส่งข้อความอย่างเดียว)
    writeFields_(x.sh, x.row || x.sh.getLastRow() + 1, x.header, TABLES.notify.fields, rec, x.row ? x.vals : null);
    return { rows: [rec], cfg: cfg, L: L, rec: rec };
  });
  if (out.rows.length) { try { tgNotify_(out.cfg, out.rows); } catch (e) { console.log('ntfLink tg ' + e); } }   // Telegram หลังปล่อยล็อก
  let dm = 0;
  try {   // API 143: ข้อความส่วนตัวถึงบุคคล (หลังปล่อยล็อก) · ไม่มีประกาศ (บุคคลอย่างเดียว) = กันส่งซ้ำ 6 ชม.
    const c = CacheService.getScriptCache(), dk = pk_('ntfdm_' + id).slice(0, 240);
    if (ctx.off) c.remove(dk);
    else if (out.L && out.L.people.length && (out.rows.length || !c.get(dk))) {
      c.put(dk, '1', 21600);
      dm = ntfDm_(out.cfg, by, ntfPeople_(out.cfg, out.L.people, { ref: ref, doc: cut(ctx.doc, 10), mp: cut(ctx.mp, 10) }, cs, String(u.username || '').trim().toLowerCase()), out.rec.hn, out.rec.text, id);
    }
  } catch (e) { console.log('ntfLink dm ' + e); }
  return { rows: out.rows, dm: dm };
}
function noShowNtf_(ss, cfg, u, r, prev) {
  if (!NS_TEXT_[r.what]) return [];
  const ns = cfg.noShow && typeof cfg.noShow === 'object' ? cfg.noShow : {}, id = 'ns|' + r.id, x = openRow_(ss, 'notify', null, id);
  const by = String(u.name || u.username || u.me || ''), now = new Date().toISOString();
  if (r.status !== 'noshow') {
    if (x.row && !String(x.cur.cancelAt || '')) writeFields_(x.sh, x.row, x.header, TABLES.notify.fields.filter(f => f[0] === 'cancelBy' || f[0] === 'cancelAt'), { cancelBy: by, cancelAt: now }, x.vals);
    return [];
  }
  if (prev === 'noshow' && x.row) return [];
  const L = ntfLinkCfg_(cfg, 'ns.' + r.what);   // API 132: ลิงก์ประกาศ (ไม่มีลิงก์ = ค่าเดิมใน noShow)
  if (!L || !L.on || !L.roles.length) return [];
  const roles = L.roles;
  const d = String(r.date || ''), rec = { id: id, text: ntfRoomText_(ntfText_(L.text, { 'วันที่': d.slice(8, 10) + '/' + d.slice(5, 7) }), ntfTxRoom_(ss, cfg, r.hn)), roles: roles.join(', '), level: 'urgent', until: today_(ss), by: by,
    byUser: String(u.username || u.me || ''), at: now, acks: '{}', cancelBy: '', cancelAt: '', kind: 'patient', hn: String(r.hn || ''), pname: String(r.name || '') };
  writeFields_(x.sh, x.row || x.sh.getLastRow() + 1, x.header, TABLES.notify.fields, rec, x.row ? x.vals : null);
  return [rec];
}
/* ---------- API 91 (18 พ.ย.): RO Jobs → P4P แพทย์ · ตำแหน่งหัวหน้า/ลูกน้องของทุกทีม ---------- */
// ผู้ใช้ ↔ รายชื่อในตั้งค่า (doctors · crew): บัญชี LPCH → อีเมล → ชื่อ-สกุลตรงกันคนเดียวที่ยังไม่เชื่อมบัญชี (เหมือน linkOf ในหน้าเว็บ)
function linkOf_(cfg, list, u) {
  const xs = (cfg && Array.isArray(cfg[list]) ? cfg[list] : []).filter(x => x && typeof x === 'object'), low = v => String(v == null ? '' : v).trim().toLowerCase();
  const user = low(u.username), mail = low(u.me);
  const hit = (user && xs.filter(x => low(x.user) === user)[0]) || (mail && xs.filter(x => low(x.email) === mail)[0]);
  if (hit) return hit;
  const by = u.via === 'lpch' && String(u.name || '').trim() ? xs.filter(x => !x.user && String(x.name || '').trim() && nameKey_(x.name) === nameKey_(u.name)) : [];
  return by.length === 1 ? by[0] : null;
}
// ตำแหน่งในทีมของเดือนนั้น: roles = [{ from: 'YYYY-MM', role: 'head' | 'staff' }] (แบบทีมนักฟิสิกส์) · แถวที่เริ่มล่าสุดก่อนหรือในเดือนนั้น · ไม่มี = ลูกน้อง
function teamRole_(x, ym) {
  const rs = (x && Array.isArray(x.roles) ? x.roles : []).filter(r => r && typeof r === 'object' && String(r.from || '') <= ym)
    .sort((a, b) => String(b.from || '').localeCompare(String(a.from || '')));
  return rs.length && rs[0].role === 'head' ? 'head' : 'staff';
}
const ymNow_ = ss => Utilities.formatDate(new Date(), tz_(ss), 'yyyy-MM');
// หัวหน้าทีมแพทย์ (เดือนนี้) เห็น P4P ของแพทย์ทุกคน
function roHead_(ss, cfg, u) { const d = linkOf_(cfg, 'doctors', u); return !!d && teamRole_(d, ymNow_(ss)) === 'head'; }
// หัวหน้าทีม RTT / RA (เดือนนี้ · ตำแหน่งใน ตั้งค่า → ตารางวันฉาย) เห็นภาระงานของทุกคนในแถบ RTT/RA Jobs
function crewHead_(ss, cfg, u) {
  const c = linkOf_(cfg, 'crew', u);
  if (!c || teamRole_(c, ymNow_(ss)) !== 'head') return false;
  const dr = dutyRoles_(cfg);
  return dr.rtt.concat(dr.ra).indexOf(String(c.role || '')) >= 0;
}
// P4P แพทย์ที่ส่งให้หน้าเว็บ: 13 เดือนล่าสุด · แพทย์เห็นของตัวเอง · หัวหน้าทีมแพทย์ แอดมิน และบัญชี Google เห็นทุกคน
function roJobsFor_(ss, user, cfg) {
  cfg = cfg || readConfig_(ss) || {};
  const from = Utilities.formatDate(new Date(Date.now() - 400 * 864e5), tz_(ss), 'yyyy-MM');
  const all = readTable_(ss, 'roJobs').filter(x => String(x.ym) >= from);
  if (user.via === 'google' || user.isAdmin || roHead_(ss, cfg, user)) return all;
  const me = linkOf_(cfg, 'doctors', user), code = me ? String(me.code || '').trim().toUpperCase() : '';
  return code ? all.filter(x => String(x.doc).toUpperCase() === code) : [];
}
/**
 * RO Jobs → P4P: บันทึกแบบเก็บภาระงานของแพทย์หนึ่งคนหนึ่งเดือน (ของตัวเอง · แอดมินบันทึกแทนได้) · บันทึกทับของเดิมต้องใส่ PIN
 * rec = { ym: 'YYYY-MM', doc: รหัสแพทย์, name, prof (JSON), cells (JSON) } · คืนแถวหลังบันทึก
 */
function roJobsSave(rec, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.roJobs);
  rec = rec && typeof rec === 'object' ? rec : {};
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const ym = cut(rec.ym, 7), doc = cut(rec.doc, 10).toUpperCase(), cfg = readConfig_(ss_()) || {};
  if (!/^\d{4}-\d{2}$/.test(ym)) throw new Error('เดือนไม่ถูกต้อง');
  if (dqDocs_(cfg).indexOf(doc) < 0) throw new Error('ไม่พบแพทย์รหัสนี้ใน ตั้งค่า → ทีมงาน');
  const me = linkOf_(cfg, 'doctors', u), own = !!me && String(me.code || '').trim().toUpperCase() === doc;
  if (!own && !u.isAdmin && u.via !== 'google') throw new Error('บันทึกได้เฉพาะ P4P ของตัวเอง (แอดมินบันทึกแทนได้)');
  const json = (v, max) => {
    const t = String(v == null ? '' : v);
    if (!t) return '';
    if (t.length > max) throw new Error('ข้อมูล P4P ยาวเกินไป');
    let o;
    try { o = JSON.parse(t); } catch (e) { throw new Error('ข้อมูล P4P ไม่ถูกต้อง'); }
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('ข้อมูล P4P ไม่ถูกต้อง');
    return JSON.stringify(o);
  };
  const cells = json(rec.cells, 45000), prof = json(rec.prof, 3000);
  return withLock_(() => {
    const ss = ss_(), id = doc + '|' + ym, x = openRow_(ss, 'roJobs', null, id);
    pinChange_(u, pin, !!x.row);
    return saveRow_(x, TABLES.roJobs.fields, { id: id, ym: ym, doc: doc, name: cut(rec.name, 120), prof: prof, cells: cells, by: R8_WHO_(u), updated: new Date().toISOString() });
  });
}
/* ---------- API 90 (18 พ.ย.): พบแพทย์นอกตารางนัด ---------- */
function recentVisit_(ss) {
  const from = Utilities.formatDate(new Date(Date.now() - 60 * 864e5), tz_(ss), 'yyyy-MM-dd');
  return readTable_(ss, 'visit').filter(x => String(x.date) >= from);
}
/** แถบ Nurse → นัดพบแพทย์: เพิ่ม / แก้ผู้ป่วยที่พบแพทย์นอกตารางนัด (HN ชื่อ แพทย์ วันที่ เหตุผล) · API 123: HN หนึ่งคนวันละหนึ่งรายการ */
function visitSave(rec, token) {
  const u = requireEdit_(token, EDIT_VIEWS.visit);
  rec = rec && typeof rec === 'object' ? rec : {};
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const r = { date: cut(rec.date, 10), hn: cut(rec.hn, 40), name: cut(rec.name, 200), doc: cut(rec.doc, 10).toUpperCase(), note: cut(rec.note, 300) };
  if (!R8_DAY_(r.date)) throw new Error('วันที่ไม่ถูกต้อง');
  if (!r.hn) throw new Error('กรอก HN');
  if (!r.name) throw new Error('กรอกชื่อ-สกุล');
  if (dqDocs_(readConfig_(ss_()) || {}).indexOf(r.doc) < 0) throw new Error('เลือกแพทย์');
  return withLock_(() => {
    const ss = ss_(), id = cut(rec.id, 80) || Utilities.getUuid(), x = openRow_(ss, 'visit', null, id), cur = x.cur || {};
    // API 123: HN เดียวกัน วันเดียวกัน มีรายการอยู่แล้ว (ทุกแบบ · รวมที่สร้างจากนัดวันนี้) = ไม่รับ (กันกดซ้ำ / สองเครื่องพร้อมกัน)
    const k = hnKey_(r.hn), dup = readTable_(ss, 'visit').find(v => String(v.id) !== id && String(v.date) === r.date && hnKey_(v.hn) === k);
    if (dup) {
      const p = r.date.split('-');
      throw new Error('HN ' + r.hn + ' มีรายการพบแพทย์วันที่ ' + (+p[2]) + '/' + (+p[1]) + '/' + (+p[0] + 543) + ' แล้ว (แพทย์ ' + String(dup.doc || '') + (dup.seen ? ' · พบแพทย์แล้ว' : '') + ') · ลงซ้ำไม่ได้ · แก้ไขรายการเดิมแทน (โหลดหน้าใหม่ถ้ายังไม่เห็น)');
    }
    Object.assign(r, { id: id, by: x.row ? String(cur.by || '') : R8_WHO_(u), at: x.row ? String(cur.at || '') : new Date().toISOString(), seen: x.row ? String(cur.seen || '') : '', seenBy: x.row ? String(cur.seenBy || '') : '' });
    writeFields_(x.sh, x.row || x.sh.getLastRow() + 1, x.header, TABLES.visit.fields, r, x.row ? x.vals : null);
    return r;
  });
}
/** ห้องตรวจ (หรือแถบ Nurse): พบแพทย์แล้ว (on) / ยกเลิก */
function visitMark(id, on, token) {
  const u = requireEdit_(token, ['consult', 'nurse']);
  return withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'visit', null, String(id || ''));
    if (!x.row) throw new Error('ไม่พบรายการนี้ (อาจถูกยกเลิกไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const set = on ? { seen: new Date().toISOString(), seenBy: R8_WHO_(u) } : { seen: '', seenBy: '' };
    writeFields_(x.sh, x.row, x.header, TABLES.visit.fields.filter(f => f[0] in set), set, x.vals);
    return Object.assign(x.cur, set);
  });
}
/** แถบ Nurse: ยกเลิกรายการ (ลบแถว · มีประวัติการบันทึก) */
function visitRemove(id, token) {
  requireEdit_(token, EDIT_VIEWS.visit);
  return withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'visit', null, String(id || ''));
    if (x.row) delRow_(x.sh, x.row, x.header, x.vals);
    return true;
  });
}
// API 85: นัดที่ผูกกับรายการ CT-SIM ของ HN อื่น → ผูกกับรายการ CT-SIM ของ HN ของนัดเอง (ยังไม่มีนัดอื่นผูก · วันใกล้วันนัดที่สุด) · ไม่มี = กลับไปรอลง CT-SIM
function apptRelink(id, token) {
  requireEdit_(token, EDIT_VIEWS.ctsim.concat(EDIT_VIEWS.appt));
  return withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'appt', null, id);
    if (!x.row) throw new Error('ไม่พบนัดนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const cur = x.cur, took = String(cur.took || '').trim();
    if (!took || took === 'skip') return cur;
    const cts = readTable_(ss, 'ctsim'), linked = cts.filter(c => c.id === took)[0];
    if (linked && hnKey_(linked.hn) === hnKey_(cur.hn)) return cur;   // ผูกถูกอยู่แล้ว
    const taken = {};
    readTable_(ss, 'appt').forEach(a => { if (a.id !== cur.id && a.took) taken[a.took] = true; });
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(cur.date)) ? String(cur.date) : String(cur.created).slice(0, 10), t0 = Date.parse(day) || 0;
    const pick = cts.filter(c => hnKey_(c.hn) === hnKey_(cur.hn) && !taken[c.id]).sort((p, q) => Math.abs((Date.parse(p.date) || 0) - t0) - Math.abs((Date.parse(q.date) || 0) - t0))[0];
    const set = pick ? { took: pick.id } : { took: '', tookBy: '', tookAt: '' };
    return saveRow_(x, TABLES.appt.fields, set);
  });
}
// แถบ CT-SIM (หรือลงนัด): นัดที่ผู้ป่วยไม่มาทำ CT · mark = 'skip' (เฉพาะที่ยังรอลง CT-SIM) หรือ '' (คืนกลับเป็นรอ) · คืนรายการ
function apptMark(id, mark, token) {
  const u = requireEdit_(token, EDIT_VIEWS.ctsim.concat(EDIT_VIEWS.appt));
  mark = mark === 'skip' ? 'skip' : '';
  return withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'appt', null, id);
    if (!x.row) throw new Error('ไม่พบนัดนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const took = String(x.cur.took || '').trim();
    if (mark ? took : took !== 'skip') throw new Error(took === 'skip' ? 'นัดนี้ตั้งว่าไม่มาทำ CT ไว้แล้ว' : took ? 'นัดนี้ลง CT-SIM ไปแล้ว' : 'นัดนี้ยังรอลง CT-SIM อยู่');
    const set = mark ? { took: 'skip', tookBy: String(u.name || u.username || u.me || ''), tookAt: Utilities.formatDate(new Date(), tz_(ss), 'yyyy-MM-dd HH:mm') } : { took: '', tookBy: '', tookAt: '' };
    return saveRow_(x, TABLES.appt.fields, set);
  });
}

// นัดที่ส่งให้หน้าเว็บ: วันนัด CT ตั้งแต่ 13 เดือนก่อน (รวมนัดล่วงหน้าทั้งหมด)
function recentAppt_(ss) {
  const from = Utilities.formatDate(new Date(Date.now() - 400 * 864e5), tz_(ss), 'yyyy-MM-dd');
  return readTable_(ss, 'appt').filter(x => (x.date === 'on call' ? String(x.created).slice(0, 10) : String(x.date)) >= from);   // On Call: นับจากวันที่ลงนัด
}

/* ---------- แถบแจกงานแพทย์ (API 62): ใช้แค่ HN และชื่อ · คิววนแบบเดียวกับแจกเคส MP แต่ลาไม่เสียคิว ---------- */
// ตั้งค่า → แจกงานแพทย์ (config.dq): off = แพทย์ที่ไม่รับคิว · skips = หักคิวรายเดือน { 'YYYY-MM': { รหัส: n } } · pointer = ตำแหน่งคิวที่ตั้งเอง { code, at }
// payback = คืนคิวหลังลาสูงสุดต่อคนต่อรอบ (ไม่ตั้ง = 1 · 0 = ไม่จำกัด) · perMonth = จำนวนเคสต่อเดือน (หน้าเว็บใช้แสดงผล) · ลำดับคิว = ลำดับใน ตั้งค่า → แพทย์ (Doc)
function dqDocs_(cfg) {
  const src = cfg && Array.isArray(cfg.doctors) ? cfg.doctors.map(x => (x && typeof x === 'object' ? x.code : x)) : DEFAULT_DOCTORS, out = [];
  src.forEach(c => { const k = String(c == null ? '' : c).trim().toUpperCase(); if (k && out.indexOf(k) < 0) out.push(k); });
  return out;
}
function dqCfg_(cfg) {
  const q = cfg && cfg.dq && typeof cfg.dq === 'object' ? cfg.dq : {}, off = (Array.isArray(q.off) ? q.off : []).map(c => String(c).trim().toUpperCase());
  return {
    docs: dqDocs_(cfg).filter(c => off.indexOf(c) < 0), skips: q.skips && typeof q.skips === 'object' ? q.skips : {},
    pointer: q.pointer && q.pointer.code && q.pointer.at ? { code: String(q.pointer.code).trim().toUpperCase(), at: String(q.pointer.at) } : null,
    payback: q.payback == null || q.payback === '' ? 1 : Math.max(0, Math.floor(+q.payback) || 0),
    days: dqDays_(q.days), bonus: (Array.isArray(q.bonus) ? q.bonus : []).filter(b => b && b.code && b.at).map(b => ({ code: String(b.code).trim().toUpperCase(), n: Math.max(0, Math.floor(+b.n) || 0), at: String(b.at) })),
    s1wd: q.s1wd && typeof q.s1wd === 'object' ? q.s1wd : {},
  };
}
// วันที่ไม่แจก (ตั้งค่า → แจกงานแพทย์): { 0–6: [รหัส] } (0 = อาทิตย์)
function dqDays_(v) {
  const out = {};
  if (v && typeof v === 'object') Object.keys(v).forEach(k => { if (/^[0-6]$/.test(k) && Array.isArray(v[k])) out[k] = v[k].map(c => String(c).trim().toUpperCase()).filter(Boolean); });
  return out;
}
// แพทย์เวร S1 ของวันที่ (ตารางเวร S1 · ไม่มี = ตามวันในสัปดาห์ใน ตั้งค่า) · ไม่มี = ''
function dqS1_(q, duty, day) {
  const d = (duty || []).filter(x => x.date === day && x.doc)[0];
  return String(d ? d.doc : q.s1wd[new Date(day + 'T00:00:00Z').getUTCDay()] || '').trim().toUpperCase();
}
// แพทย์ที่เป็นผู้ใช้ที่เข้าระบบ (ตั้งค่า → แพทย์: บัญชี LPCH ที่เชื่อม หรืออีเมล) · ไม่ใช่แพทย์ = ''
function dqSelf_(u, cfg) {
  const low = v => String(v == null ? '' : v).trim().toLowerCase(), list = cfg && Array.isArray(cfg.doctors) ? cfg.doctors : [];
  const hit = list.filter(x => x && typeof x === 'object' && ((low(x.user) && low(x.user) === low(u.username)) || (low(x.email) && low(x.email) === low(u.me))))[0];
  return hit ? String(hit.code).trim().toUpperCase() : '';
}
const dqCut_ = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
// Standing order: JSON ของช่องในแบบฟอร์ม (ไม่ใช่ JSON / ยาวเกิน = ไม่เก็บ)
function dqSo_(v) {
  const t = String(v == null ? '' : v).trim();
  if (!t || t.length > 4000) return '';
  try { const o = JSON.parse(t); return o && typeof o === 'object' && !Array.isArray(o) ? JSON.stringify(o) : ''; } catch (e) { return ''; }
}
// แถบย่อยของแถบแจกงานแพทย์ (API 75 · ตั้งค่า → แจกงานแพทย์ → แถบย่อย): config.dq.desks = { call: [ตำแหน่ง], walk: [ตำแหน่ง] }
// ตำแหน่งที่อยู่ในรายการของแถบย่อยใด = ใช้ได้เฉพาะแถบย่อยนั้น · ตำแหน่งอื่น (MP, RO …) แอดมิน และบัญชี Google = ทุกแถบย่อย
const DQ_DESK_DEF = { call: ['Refer'], walk: ['Nurse'] };
const DQ_DESK_NAME = { call: 'Call center', walk: 'ภายใน/Walk in' };
const dqDeskKey_ = v => (v === 'walk' || v === 'in' ? v : '');   // '' = Call center · in = ภายใน · walk = Walk in (สองค่าหลังอยู่ในแถบย่อย ภายใน/Walk in)
function dqDesks_(u, cfg) {
  const all = Object.keys(DQ_DESK_DEF);
  if (!u || u.via === 'google' || u.isAdmin) return all;
  if (u.isSub) {   // API 134: แอดมินรองที่ตั้งคอลัมน์แอดมินรองของแถบนี้ไว้ (ไม่ใช่ "ตามตำแหน่ง") = ทุกแถบย่อยเหมือนแอดมินหลัก
    const x = (cfg && Array.isArray(cfg.nav) ? cfg.nav : []).filter(n => n && n.view === 'dq')[0], a = x && x.access && typeof x.access === 'object' ? x.access[SUB_ROLE] : undefined;
    if (a === 'edit' || a === 'view') return all;
  }
  const set = cfg && cfg.dq && cfg.dq.desks && typeof cfg.dq.desks === 'object' ? cfg.dq.desks : {}, role = String(u.role || '').toUpperCase();
  const mine = all.filter(k => (Array.isArray(set[k]) ? set[k] : DQ_DESK_DEF[k]).map(r => String(r).toUpperCase()).indexOf(role) >= 0);
  return mine.length ? mine : all;
}
function dqDeskCheck_(u, cfg, desk) {
  const k = desk === 'walk' || desk === 'in' ? 'walk' : 'call';
  if (dqDesks_(u, cfg).indexOf(k) < 0) throw new Error('ตำแหน่ง ' + (u.role || '-') + ' ใช้แถบย่อย ' + DQ_DESK_NAME[k] + ' ไม่ได้ (ตั้งค่า → แจกงานแพทย์ → แถบย่อย)');
}
const dqNow_ = () => new Date().toISOString();

/**
 * แจกงานแพทย์ภายใต้ล็อก (ผู้ใช้หลายคนกดพร้อมกันก็ไม่ได้คนซ้ำ) · recs = [{ id?, hn, name, how: auto | manual | emer | owner, doc (เลือกเอง), note }]
 * emer = Emergency (แพทย์เวร S1) · owner = เจ้าของไข้เดิม (API 70) · สองแบบนี้ไม่รันคิว ไม่หักคิว
 * auto = แพทย์ตามคิว (dqPick_) วันที่แจก = วันนี้ · คืนรายการที่บันทึก
 */
function dqAdd(recs, token) {
  const u = requireEdit_(token, EDIT_VIEWS.dq);
  if (!Array.isArray(recs) || !recs.length) throw new Error('ไม่มีผู้ป่วยที่จะแจก');
  if (recs.length > 50) throw new Error('แจกได้ครั้งละไม่เกิน 50 คน');
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss) || {}, q = dqCfg_(cfg), all = dqDocs_(cfg), day = today_(ss);
    // คิว (dqPick_) ใช้ doc how date created · เจ้าของไข้เดิมใช้ hn · อ่านทั้งตารางช้าตามจำนวนที่แจกสะสม
    const rows = readCols_(ss, 'dq', null, ['hn', 'doc', 'how', 'date', 'created']), known = rows.map(x => x.id);
    const leaves = readTable_(ss, 'dqLeave').filter(l => l.take !== 'yes'), by = String(u.name || u.username || u.me || ''), t0 = Date.now(), out = [];   // ลาแต่ยังรับเคส = ไม่นับ
    let duty = null;
    recs.forEach((r, i) => {
      r = r && typeof r === 'object' ? r : {};
      const desk = dqDeskKey_(r.desk);
      dqDeskCheck_(u, cfg, desk);
      const hn = dqCut_(r.hn, 40), how = r.how === 'manual' || r.how === 'emer' || r.how === 'owner' ? r.how : 'auto';   // owner (API 70) = เจ้าของไข้เดิม
      if (!hn) throw new Error('กรอก HN');
      let doc = how === 'auto' ? '' : dqCut_(r.doc, 10).toUpperCase();
      if (how === 'emer' && !doc) { doc = dqS1_(q, duty || (duty = readTable_(ss, 'dqDuty')), day); if (!doc) throw new Error('ยังไม่ได้กำหนดแพทย์เวร S1 ของวันนี้ (ปุ่ม เวร S1 ในแถบ) · หรือเลือกแพทย์เอง'); }
      if (how === 'owner' && !doc) {   // เจ้าของไข้เดิม: หน้าเว็บส่งแพทย์มา · ไม่ส่ง = แพทย์ของการแจกครั้งล่าสุดของ HN นี้
        const prev = rows.filter(x => x.hn === hn && x.doc).sort((a, b) => String(b.created).localeCompare(String(a.created)))[0];
        doc = prev ? prev.doc : '';
        if (!doc) throw new Error('ไม่พบเจ้าของไข้เดิมของ HN ' + hn + ' · เลือกแพทย์เอง');
      }
      if (how !== 'auto' && all.indexOf(doc) < 0) throw new Error('ไม่พบรหัสแพทย์ ' + doc);
      if (how === 'auto') doc = dqPick_({ docs: q.docs, leaves: leaves, rows: rows, skips: q.skips, pointer: q.pointer, payback: q.payback, days: q.days, bonus: q.bonus, date: day });
      if (!doc) throw new Error(q.docs.length ? 'ไม่มีแพทย์ที่รับเคสได้วันนี้ (ลาหรือวันที่ไม่แจกทุกคน)' : 'ยังไม่มีแพทย์ในคิว (ตั้งค่า → แจกงานแพทย์)');
      const rec = { id: dqCut_(r.id, 80) || Utilities.getUuid(), hn: hn, name: dqCut_(r.name, 200), doc: doc, how: how, date: day, st: '', note: dqCut_(r.note, 500), by: by, created: new Date(t0 + i).toISOString(), updated: '', desk: desk, so: dqSo_(r.so) };
      rows.push(rec);
      out.push(rec);
    });
    appendNew_(ss, 'dq', out, known);
    return out;
  });
}
// แก้รายการ (PIN): HN ชื่อ Note · st = skip (ไม่ต้องลงนัด) | '' (รอลงนัด) · เปลี่ยนแพทย์ = เลือกเอง (คิวเดิมยังเป็นของคนที่ถึงคิว คนใหม่ถูกข้ามเมื่อคิววนมาถึง)
function dqEdit(id, ch, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.dq);
  ch = ch && typeof ch === 'object' ? ch : {};
  pinChange_(u, pin, true);
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss) || {}, x = openRow_(ss, 'dq', null, id);
    if (!x.row) throw new Error('ไม่พบรายการนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const cur = x.cur, set = {};
    dqDeskCheck_(u, cfg, cur.desk);
    if ('hn' in ch) { set.hn = dqCut_(ch.hn, 40); if (!set.hn) throw new Error('กรอก HN'); }
    if ('name' in ch) set.name = dqCut_(ch.name, 200);
    if ('note' in ch) set.note = dqCut_(ch.note, 500);
    if ('st' in ch) set.st = ch.st === 'skip' ? 'skip' : '';
    if ('so' in ch) set.so = dqSo_(ch.so);
    if ('desk' in ch) {   // API 76: ภายใน ↔ Walk in (ในแถบย่อย ภายใน/Walk in เท่านั้น)
      const d = dqDeskKey_(ch.desk);
      if (!d || !(cur.desk === 'in' || cur.desk === 'walk')) throw new Error('เปลี่ยนได้เฉพาะ ภายใน / Walk in ของรายการในแถบย่อย ภายใน/Walk in');
      if (d !== cur.desk) set.desk = d;
    }
    let moved = [];
    if ('doc' in ch) {
      const d = dqCut_(ch.doc, 10).toUpperCase(), old = String(cur.doc || '').toUpperCase();
      if (dqDocs_(cfg).indexOf(d) < 0) throw new Error('ไม่พบรหัสแพทย์ ' + d);
      if (d !== cur.doc) {
        set.doc = d; if (cur.how !== 'import') set.how = 'manual';   // ดึงจากรายงาน: ยังไม่นับในคิว
        if (ch.appt) moved = dqMoveAppt_(ss, cur.hn, String(cur.date || '').slice(0, 10), old, d);   // API 106: ย้ายแพทย์เจ้าของไข้ = เปลี่ยนแพทย์ในนัด CT Order ด้วย
      }
    }
    set.updated = dqNow_();
    writeFields_(x.sh, x.row, x.header, TABLES.dq.fields.filter(f => f[0] in set), set, x.vals);
    const out = Object.assign(cur, set);
    if (moved.length) out.apptRows = moved;
    return out;
  });
}
/**
 * API 106: ย้ายแพทย์เจ้าของไข้ — นัด CT Order ของ HN นั้นที่ลงตั้งแต่วันที่แจก (ไม่นับนัดที่ตั้งว่าไม่มาทำ CT) และแพทย์ยังเป็นคนเดิม เปลี่ยนเป็นแพทย์ใหม่
 * (เหมือน dqAppt ในหน้าเว็บ: นัดของการแจกครั้งนั้น) · คืนแถวนัดที่เปลี่ยน
 */
function dqMoveAppt_(ss, hn, date, oldDoc, newDoc) {
  const tz = tz_(ss), now = new Date().toISOString(), out = [];
  rowsOfHn_(ss, 'appt', hn).forEach(a => {
    const made = a.created ? Utilities.formatDate(new Date(a.created), tz, 'yyyy-MM-dd') : '';
    if (String(a.took || '') === 'skip' || String(a.doc || '').toUpperCase() !== oldDoc || !made || made < date) return;
    const x = openRow_(ss, 'appt', null, a.id);
    if (!x.row) return;
    const set = { doc: newDoc, updated: now };
    writeFields_(x.sh, x.row, x.header, TABLES.appt.fields.filter(f => f[0] in set), set, x.vals);
    markDirty_('appt');
    out.push(Object.assign(x.cur, set));
  });
  return out;
}
/**
 * ดึงจากรายงานผู้ป่วยที่รับ Consult ของ HIS (หน้าเว็บอ่านไฟล์ จับคู่แพทย์ผู้นัด → รหัสแพทย์แล้วส่งมา) · recs = [{ hn, name, doc, date: วันที่รับ Consult, visit, chan, refer, icd }]
 * ใหม่ = how import (ไม่นับในคิว ไม่ไปรอลงนัด) · HN เดียวกันที่แจกไว้แล้วภายใน 30 วัน = ไม่เพิ่ม เติมเฉพาะช่องที่ยังว่าง (วันที่นัดมา ช่องทาง ส่งตัวจาก ICD10) · ดึงไฟล์เดิมซ้ำได้
 */
const DQ_IMPORT_DAYS = 30;
function dqImport(recs, token) {
  const u = requireEdit_(token, EDIT_VIEWS.dq);
  if (!Array.isArray(recs) || !recs.length) throw new Error('ไม่มีรายการที่จะดึง');
  if (recs.length > 3000) throw new Error('ดึงได้ครั้งละไม่เกิน 3000 รายการ');
  const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v), dayMs = v => Date.parse(v + 'T00:00:00Z');
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss) || {}, all = dqDocs_(cfg), sh = tableSheet_(ss, 'dq'), header = headerOf_(sh);
    const tz = tz_(ss), cv = rowConv_(TABLES.dq, header, tz), n = sh.getLastRow() - 1;
    const cur = n > 0 ? sh.getRange(2, 1, n, header.length).getValues().map((r, i) => Object.assign(cv.conv(r), { row: i + 2 })) : [];
    const byHn = {};
    cur.forEach(r => { const k = hnLoose_(r.hn); if (k) (byHn[k] = byHn[k] || []).push(r); });
    const by = String(u.name || u.username || u.me || ''), t0 = Date.now(), add = [], skip = { have: 0, nodoc: 0, bad: 0 }, filled = [];
    recs.forEach((r, i) => {
      r = r && typeof r === 'object' ? r : {};
      const hn = dqCut_(r.hn, 40), doc = dqCut_(r.doc, 10).toUpperCase(), date = dqCut_(r.date, 10), k = hnLoose_(hn);
      if (!hn || !isDate(date)) { skip.bad++; return; }
      if (all.indexOf(doc) < 0) { skip.nodoc++; return; }
      const ext = { visit: isDate(dqCut_(r.visit, 10)) ? dqCut_(r.visit, 10) : '', chan: dqCut_(r.chan, 100), refer: dqCut_(r.refer, 200), icd: dqCut_(r.icd, 200) };
      const same = (byHn[k] || []).filter(x => isDate(x.date) && Math.abs(dayMs(x.date) - dayMs(date)) <= DQ_IMPORT_DAYS * 864e5)[0];
      if (same) {
        skip.have++;
        const set = {};
        Object.keys(ext).forEach(f => { if (ext[f] && !String(same[f] || '').trim()) set[f] = ext[f]; });
        if (same.row && Object.keys(set).length) {
          set.updated = dqNow_();
          writeFields_(sh, same.row, header, TABLES.dq.fields.filter(f => f[0] in set), set);
          Object.assign(same, set);
          filled.push(Object.assign({}, same, { row: undefined }));
        }
        return;
      }
      const rec = Object.assign({ id: Utilities.getUuid(), hn: hn, name: dqCut_(r.name, 200), doc: doc, how: 'import', date: date, st: '', note: '', src: 'his', by: by, created: new Date(t0 + i).toISOString(), updated: '' }, ext);
      add.push(rec);
      (byHn[k] = byHn[k] || []).push(rec);
    });
    if (add.length) appendNew_(ss, 'dq', add);
    return { added: add, filled: filled.map(x => { delete x.row; return x; }), skipped: skip };
  });
}
// ตารางเวร S1 (แถบแจกงานแพทย์): list = [{ date, doc }] · doc ว่าง = ใช้ตามวันในสัปดาห์ (ลบรายการของวันนั้น) · คืนตารางเวรทั้งหมด
function dqDutySave(list, token) {
  const u = requireEdit_(token, EDIT_VIEWS.dq);
  if (!Array.isArray(list) || !list.length) return readTable_(ss_(), 'dqDuty');
  if (list.length > 400) throw new Error('บันทึกเวรได้ครั้งละไม่เกิน 400 วัน');
  return withLock_(() => {
    const ss = ss_(), all = dqDocs_(readConfig_(ss) || {}), sh = tableSheet_(ss, 'dqDuty'), header = headerOf_(sh), by = String(u.name || u.username || u.me || '');
    list.forEach(x => {
      const date = dqCut_(x && x.date, 10), doc = dqCut_(x && x.doc, 10).toUpperCase();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('วันที่ไม่ถูกต้อง');
      if (doc && all.indexOf(doc) < 0) throw new Error('ไม่พบรหัสแพทย์ ' + doc);
      const row = findRow_(sh, header.indexOf('id') + 1, date);
      if (!doc) { if (row) delRow_(sh, row); return; }
      const set = { id: date, date: date, doc: doc, by: by, updated: dqNow_() };
      writeFields_(sh, row || sh.getLastRow() + 1, header, TABLES.dqDuty.fields, set);
    });
    return readTable_(ss, 'dqDuty');
  });
}
// ลบรายการ (PIN) · รายการตามคิวที่ลบ = คิวนั้นกลับไปเป็นของคนที่ถึงคิว
function dqRemove(id, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.dq);
  pinChange_(u, pin, true);
  return withLock_(() => {
    const sh = tableSheet_(ss_(), 'dq'), row = findRow_(sh, headerOf_(sh).indexOf('id') + 1, id);
    if (row) delRow_(sh, row);
    return !!row;
  });
}
// วันลาแพทย์: ผู้ที่บันทึกในแถบแจกงานแพทย์ได้ (ทุกแพทย์) หรือแพทย์ของตัวเอง (บัญชีที่เชื่อมใน ตั้งค่า → แพทย์ และเห็นแถบนี้)
// API 78: แพทย์เป็นผู้กำหนดวันลาเอง (แถบ RO Jobs → วันลา) · ตำแหน่งอื่นดูได้อย่างเดียว · แอดมินและบัญชี Google ลงให้ได้ทุกแพทย์
function dqLeaveUser_(token, doc) {
  const ss = ss_(), cfg = readConfig_(ss) || {}, u = who_(token, ss, cfg);
  if (u.via === 'google' || u.isAdmin) return u;
  if (doc && (userAccess_(cfg, 'rojobs', u) || userAccess_(cfg, 'dq', u)) && dqSelf_(u, cfg) === doc) return u;
  throw new Error('วันลาแพทย์ลงได้เฉพาะแพทย์ลงของตัวเอง (บัญชีที่เชื่อมใน ตั้งค่า → แพทย์) หรือแอดมิน · ตำแหน่งอื่นดูได้อย่างเดียว');
}
const LTYPE_ = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 40);   // API 116: ประเภทใบลา (ข้อความตามตั้งค่า → RTT/RA Jobs → ประเภทการลา)
function dqLeaveSave(rec, token) {
  rec = rec && typeof rec === 'object' ? rec : {};
  const doc = dqCut_(rec.doc, 10).toUpperCase(), from = dqCut_(rec.from, 10), to = dqCut_(rec.to, 10) || from, isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const u = dqLeaveUser_(token, doc);
  if (!isDate(from) || !isDate(to)) throw new Error('วันที่ลาไม่ถูกต้อง');
  if (to < from) throw new Error('วันสิ้นสุดต้องไม่ก่อนวันเริ่มลา');
  const kind = rec.kind === 'long' || rec.kind === 'off' ? rec.kind : '', assign = kind === 'long' ? dqCut_(rec.assign, 10) : '';   // API 80: off = วันไม่รับเคส (ไม่ใช่วันลา) · ไม่แจกเคส คิวเสียไปเหมือน long
  if (assign && (!isDate(assign) || assign <= from || assign > to)) throw new Error('วันที่เริ่มแจกงานต้องอยู่หลังวันเริ่มลา และไม่เกินวันลาวันสุดท้าย');
  return withLock_(() => {
    const ss = ss_();
    if (dqDocs_(readConfig_(ss) || {}).indexOf(doc) < 0) throw new Error('ไม่พบรหัสแพทย์ ' + doc);
    const take = rec.take === 'yes' ? 'yes' : '';
    const r = { id: dqCut_(rec.id, 80) || Utilities.getUuid(), doc: doc, from: from, to: to, note: dqCut_(rec.note, 300), by: String(u.name || u.username || u.me || ''), created: dqNow_(), updated: '', kind: kind, assign: assign, take: take , ltype: LTYPE_(rec.ltype) };
    // API 73: id ที่มีอยู่แล้ว = แก้วันลา (ยืนยันด้วย PIN · แพทย์แก้ได้เฉพาะของตัวเอง เหมือนลงวันลา)
    const x = rec.id ? openRow_(ss, 'dqLeave', null, r.id) : null, row = x ? x.row : 0;
    if (row) {
      const cur = x.cur;
      if (cur.doc !== doc) dqLeaveUser_(token, cur.doc);   // ย้ายวันลาไปแพทย์อื่น: ต้องแก้ของแพทย์เดิมได้ด้วย
      pinChange_(u, rec.pin, true);
      const set = { doc: doc, from: from, to: to, note: r.note, kind: kind, assign: assign, take: take, updated: dqNow_() };
      if (rec.ltype !== undefined) set.ltype = LTYPE_(rec.ltype);   // API 116: แก้จากแถบแจกงานแพทย์ (ไม่ส่ง ltype) = คงประเภทใบลาเดิม
      writeFields_(x.sh, row, x.header, TABLES.dqLeave.fields.filter(f => f[0] in set), set, x.vals);
      return Object.assign(cur, set);
    }
    appendNew_(ss, 'dqLeave', [r]);
    return r;
  });
}
/* ---------- API 116: ใบลา · หัวหน้างานรับทราบ ----------
 * req = { src: mp | ro | rtt, key, who, from, to, type, undo } · ทีมของผู้ลาคิดจาก config (mp = MP · ro = RO · rtt = ตำแหน่งในรายชื่อบุคลากร)
 * ผู้กดได้: หัวหน้างานของทีมนั้น (config.leave.heads[ทีม] = บัญชี RO Workspace หรืออีเมล) หรือรักษาการแทน (config.leave.hAct[ทีม] ในช่วง hFrom–hTo · ไม่ใส่ = ตลอด)
 * API 122: แอดมินกดแทนไม่ได้แล้ว · กดซ้ำ = เวลาใหม่ · undo = เอาตราออก */
const LVACK_SRC = ['mp', 'ro', 'rtt'];
function leaveTeam_(cfg, src, who) {
  const k = nameKey_(who);
  if (src === 'mp') return (Array.isArray(cfg.staff) ? cfg.staff : []).some(x => x && String(x.code || '').toUpperCase() === String(who).toUpperCase()) ? 'MP' : '';
  if (src === 'ro') return dqDocs_(cfg).indexOf(String(who).toUpperCase()) >= 0 ? 'RO' : '';
  const c = (Array.isArray(cfg.crew) ? cfg.crew : []).filter(x => x && k && nameKey_(x.name) === k)[0];
  return c ? String(c.role || '') || '-' : '';
}
function leaveHeadOk_(cfg, u, team) {
  const lv = cfg.leave && typeof cfg.leave === 'object' ? cfg.leave : {}, me = [u.username, u.me].map(x => String(x || '').trim().toLowerCase()).filter(String);
  const val = k => { const m = lv[k] && typeof lv[k] === 'object' ? lv[k] : {}; return String(m[team] || '').trim(); };
  const h = val('heads').toLowerCase(), a = val('hAct').toLowerCase(), f = val('hFrom'), t = val('hTo'), td = today_();
  return (!!h && me.indexOf(h) >= 0) || (!!a && (!f || td >= f) && (!t || td <= t) && me.indexOf(a) >= 0);
}
function leaveAck(req, token) {
  req = req && typeof req === 'object' ? req : {};
  const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v), cut = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  const src = LVACK_SRC.indexOf(req.src) >= 0 ? req.src : '', key = cut(req.key, 200), who = cut(req.who, 120), from = cut(req.from, 10), to = cut(req.to, 10) || from, type = LTYPE_(req.type);
  if (!src || !key || !who) throw new Error('ไม่ได้ระบุวันลา');
  if (!isDate(from) || !isDate(to) || to < from) throw new Error('วันที่ลาไม่ถูกต้อง');
  const ss0 = ss_(), cfg = readConfig_(ss0) || {}, u = who_(token, ss0, cfg), team = leaveTeam_(cfg, src, who);
  if (!team) throw new Error('ไม่พบผู้ลา ' + who + ' ในรายชื่อบุคลากร (ตั้งค่า → ทีม)');
  if (!leaveHeadOk_(cfg, u, team)) throw new Error('รับทราบใบลาได้เฉพาะหัวหน้างานหรือรักษาการแทนของทีม ' + team + ' ที่ตั้งไว้ (ตั้งค่า → ทีม → ใบลา)');
  const id = src + '|' + key;
  return withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'lvack', null, id);
    const set = req.undo ? { by: '', user: '', at: '' }
      : { id: id, src: src, key: key, who: who, team: team, from: from, to: to, type: type, by: String(u.name || u.username || u.me || ''), user: String(u.username || u.me || ''), at: new Date().toISOString() };
    if (req.undo && !x.row) return { id: id, src: src, key: key, who: who, team: team, from: from, to: to, type: type, by: '', user: '', at: '' };
    return saveRow_(x, TABLES.lvack.fields, set);
  });
}
/* ---------- API 128 (24 พ.ย.): ขอยกเลิกวันลา (ทุกทีม) · หัวหน้างานอนุมัติก่อนจึงยกเลิกได้ ----------
 * แถวในชีต LeaveAck id = can|src|key · by / user / at = ผู้ขอ · reason = เหตุผล · dec: ว่าง = รออนุมัติ · ok = อนุมัติ (ระบบลบวันลาให้) · no = ไม่อนุมัติ · wd = ถอนคำขอ
 * act: ask / undo = ผู้ลาเอง (บัญชีในรายชื่อบุคลากร) หรือผู้ที่แก้วันลานั้นได้ · ok / no = หัวหน้างานหรือรักษาการแทนของทีม (แบบเดียวกับรับทราบใบลา · แอดมินกดแทนไม่ได้)
 * ทีมที่ยังไม่ได้ตั้งหัวหน้างาน = ขอไม่ได้ (ยกเลิกวันลาได้ตามเดิม) · ข้อความแจ้งหัวหน้างาน / ผู้ขอ ส่งจากหน้าเว็บ (msgSend) */
function leaveMine_(cfg, u, src, who) {
  const me = [u.username, u.me, u.email].map(x => String(x || '').trim().toLowerCase()).filter(String);
  const list = src === 'mp' ? cfg.staff : src === 'ro' ? cfg.doctors : cfg.crew;
  const p = (Array.isArray(list) ? list : []).filter(x => x && (src === 'rtt' ? nameKey_(x.name) === nameKey_(who) : String(x.code || '').toUpperCase() === String(who).toUpperCase()))[0];
  const acc = p ? [p.user, p.email].map(x => String(x || '').trim().toLowerCase()).filter(String) : [];
  return acc.some(a => me.indexOf(a) >= 0);
}
function leaveEditor_(token, src, who) {
  try {
    if (src === 'ro') dqLeaveUser_(token, who); else requireEdit_(token, src === 'mp' ? EDIT_VIEWS.leaves : EDIT_VIEWS.jobs);
    return true;
  } catch (e) { return false; }
}
const leaveHeadSet_ = (cfg, team) => { const lv = cfg.leave && typeof cfg.leave === 'object' ? cfg.leave : {}, h = lv.heads && typeof lv.heads === 'object' ? lv.heads : {}; return !!String(h[team] || '').trim(); };
// อนุมัติแล้ว: ลบวันลา · mp = ชีต Leaves · ro = DocLeaves · rtt = วันลาในแบบฟอร์มภาระงาน (ทุกเดือนในช่วง · ประเภทเดียวกัน) · คืนเฉพาะ id / วันลา (ไม่ส่งภาระงานของคนอื่น)
function leaveDrop_(ss, src, key, who, from, to, type) {
  if (src === 'mp' || src === 'ro') {
    const t = src === 'mp' ? 'leaves' : 'dqLeave', x = openRow_(ss, t, null, key);
    if (x.row) delRow_(x.sh, x.row, x.header, x.vals);
    return { table: t, id: key, found: !!x.row };
  }
  const k = nameKey_(who), m0 = from.slice(0, 7), m1 = to.slice(0, 7), jobs = [];
  readTable_(ss, 'jobs').forEach(j => {
    if (nameKey_(j.who) !== k || String(j.ym) < m0 || String(j.ym) > m1) return;
    let ls;
    try { ls = JSON.parse(j.leaves || '[]'); } catch (e) { ls = []; }
    if (!Array.isArray(ls)) return;
    const keep = ls.filter(l => !(l && String(l.date || '') >= from && String(l.date || '') <= to && LTYPE_(l.type) === type));
    if (keep.length === ls.length) return;
    const x = openRow_(ss, 'jobs', null, String(j.id));
    if (!x.row) return;
    const set = { leaves: JSON.stringify(keep) };
    writeFields_(x.sh, x.row, x.header, TABLES.jobs.fields.filter(f => f[0] === 'leaves'), set, x.vals);
    jobs.push({ id: String(j.id), who: String(j.who || ''), ym: String(j.ym || ''), leaves: set.leaves });
  });
  return { table: 'jobs', jobs: jobs, found: jobs.length > 0 };
}
function leaveCancel(req, token) {
  req = req && typeof req === 'object' ? req : {};
  const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v), cut = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  const act = ['ask', 'undo', 'ok', 'no'].indexOf(req.act) >= 0 ? req.act : '';
  const src = LVACK_SRC.indexOf(req.src) >= 0 ? req.src : '', key = cut(req.key, 200), who = cut(req.who, 120), from = cut(req.from, 10), to = cut(req.to, 10) || from, type = LTYPE_(req.type);
  if (!act) throw new Error('ไม่รู้จักคำสั่ง');
  if (!src || !key || !who) throw new Error('ไม่ได้ระบุวันลา');
  if (!isDate(from) || !isDate(to) || to < from) throw new Error('วันที่ลาไม่ถูกต้อง');
  const ss0 = ss_(), cfg = readConfig_(ss0) || {}, u = who_(token, ss0, cfg), team = leaveTeam_(cfg, src, who);
  if (!team) throw new Error('ไม่พบผู้ลา ' + who + ' ในรายชื่อบุคลากร (ตั้งค่า → ทีม)');
  const head = act === 'ok' || act === 'no';
  if (head && !leaveHeadOk_(cfg, u, team)) throw new Error('อนุมัติการยกเลิกวันลาได้เฉพาะหัวหน้างานหรือรักษาการแทนของทีม ' + team + ' ที่ตั้งไว้ (ตั้งค่า → ทีม)');
  if (!head && !leaveMine_(cfg, u, src, who) && !leaveEditor_(token, src, who)) throw new Error('ขอยกเลิกได้เฉพาะเจ้าของวันลา (หรือผู้ที่แก้วันลานี้ได้)');
  if (act === 'ask' && !leaveHeadSet_(cfg, team)) throw new Error('ทีม ' + team + ' ยังไม่ได้ตั้งหัวหน้างาน (ตั้งค่า → ทีม) · ยกเลิกวันลาได้ตามเดิมโดยไม่ต้องขออนุมัติ');
  const id = 'can|' + src + '|' + key, now = new Date().toISOString(), me = String(u.name || u.username || u.me || ''), acc = String(u.username || u.me || '');
  return withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'lvack', null, id), pend = !!x.row && !String(x.cur.dec || '');
    if (act === 'ask') {
      if (pend) throw new Error('ขอยกเลิกวันลานี้ไว้แล้ว · รอหัวหน้างานอนุมัติ');
      return { row: saveRow_(x, TABLES.lvack.fields, { id: id, src: src, key: key, who: who, team: team, from: from, to: to, type: type, by: me, user: acc, at: now, reason: cut(req.reason, 300), ref: cut(req.ref, 200), dec: '', decBy: '', decAt: '' }) };
    }
    if (!pend) throw new Error('ไม่มีคำขอยกเลิกที่รออนุมัติ (อาจถูกถอนหรือพิจารณาไปแล้ว)');
    const row = saveRow_(x, TABLES.lvack.fields, { dec: act === 'undo' ? 'wd' : act, decBy: me, decAt: now });
    return act === 'ok' ? { row: row, gone: leaveDrop_(ss, src, key, who, from, to, type) } : { row: row };
  });
}
// สถานะจากแถบ Consult / แจกงานแพทย์ (API 73 · ไม่ต้องใช้ PIN เหมือนไม่มาทำ CT): doc = ขอเอกสารเพิ่ม (ต้องมีรายละเอียด) · nort = ไม่ RT · '' = กลับไปรอลงนัด
// API 84: รับคืนจากแพทย์ (คอลัมน์ รับคืน ในแถบแจกงานแพทย์) · on = ติ๊ก / เอาติ๊กออก
function dqBack(id, on, token) {
  const u = requireEdit_(token, EDIT_VIEWS.dq);
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss) || {}, x = openRow_(ss, 'dq', null, id);
    if (!x.row) throw new Error('ไม่พบรายการนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    dqDeskCheck_(u, cfg, x.cur.desk);
    const set = on ? { back: dqNow_(), backBy: String(u.name || u.username || u.me || '') } : { back: '', backBy: '' };
    set.updated = dqNow_();
    writeFields_(x.sh, x.row, x.header, TABLES.dq.fields.filter(f => f[0] in set), set, x.vals);
    return Object.assign(x.cur, set);
  });
}
function dqMark(id, st, text, token) {
  const u = requireEdit_(token, EDIT_VIEWS.dq.concat(['consult']));
  st = st === 'doc' || st === 'nort' ? st : '';
  text = dqCut_(text, 500);
  if (st === 'doc' && !text) throw new Error('กรอกเอกสารที่ขอเพิ่ม');
  return withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'dq', null, id);
    if (!x.row) throw new Error('ไม่พบรายการนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const cur = x.cur;
    const set = { st: st, stNote: text, stBy: String(u.name || u.username || u.me || ''), stAt: dqNow_(), updated: dqNow_() };
    writeFields_(x.sh, x.row, x.header, TABLES.dq.fields.filter(f => f[0] in set), set, x.vals);
    return Object.assign(cur, set);
  });
}
function dqLeaveRemove(id, pin, token) {
  const cur = readTable_(ss_(), 'dqLeave').filter(x => x.id === String(id))[0];
  if (!cur) return false;
  pinChange_(dqLeaveUser_(token, cur.doc), pin, true);
  return withLock_(() => {
    const sh = tableSheet_(ss_(), 'dqLeave'), row = findRow_(sh, headerOf_(sh).indexOf('id') + 1, id);
    if (row) delRow_(sh, row);
    return !!row;
  });
}
/*
 * คิวแจกงานแพทย์ (โค้ดชุดเดียวกับ dqPick ใน index.html · ใช้แค่ HN และชื่อ)
 * o = { docs: รหัสแพทย์ตามลำดับคิว, leaves: [{ doc, from, to, kind, assign }], rows: [{ doc, how, date, created }] (แจกแล้ว),
 *       skips: { 'YYYY-MM': { รหัส: n } }, pointer: { code, at } | null, payback: คืนคิวสูงสุดต่อคนต่อรอบ (0 = ไม่จำกัด), date: วันที่แจก ('' = ไม่ดูวันลา), ym: หักคิวรายเดือนนับถึงเดือนนี้,
 *       days: { วันในสัปดาห์ 0–6: [รหัสที่ไม่แจกวันนั้น] }, bonus: [{ code, n, at }] (คิวชดเชย) }
 * - วนตามลำดับแพทย์ · เลือกเอง (how = manual): คิวไม่ขยับ คนที่ได้ถูกข้าม 1 ครั้งเมื่อคิววนมาถึง · หักคิวรายเดือน: ข้ามตามจำนวนครั้ง (ใช้ไม่หมดยกไปเดือนถัดไป)
 * - ถึงคิวแพทย์ที่ลา: แพทย์ที่ไม่ลารับแทน (คนที่ติดค้างน้อยที่สุด ถัดจากคนลา) และติดคิวไว้ · คิววนถึงคนที่รับแทนเมื่อแพทย์ที่ลากลับมาแล้ว = คืนคิวให้แพทย์ที่ลา (ลาไม่เสียคิว)
 * - วันที่ไม่แจกแพทย์คนนั้น (days · ตั้งค่า) = เหมือนลา: คนอื่นรับแทน แล้วคืนคิวในวันอื่น (ไม่เสียคิว)
 * - คิวชดเชย (bonus · ตั้งค่า): แพทย์คนนั้นได้คิวแทรกเพิ่ม n คิว ตั้งแต่เวลา at (ไม่เกินจำนวนคืนคิวต่อรอบ) เช่น กลับจากลาก่อนเริ่มใช้ระบบ
 * - แจกแล้วไม่ตรงคิว (เช่น ลงวันลาย้อนหลัง): คิวไม่ขยับ คนที่ได้ถูกข้ามเมื่อคิววนมาถึง (เหมือนเลือกเอง) · ดึงจากรายงาน HIS (how = import) และเคส Emergency (how = emer · แพทย์เวร S1) = ไม่นับในคิว
 * คืนรหัสแพทย์ที่ได้เคสถัดไป ('' = ไม่มีใครรับได้) · trace: log (ผลของแต่ละรายการ), credit (รอหักคิว), owe (ค้างคืนคิว), next, ahead(k, d, rest) (ถัดไป k เคส: เคสแรกวันที่ d ที่เหลือวันที่ rest · '' = ไม่ดูวันลา)
 */
function dqPick_(o, trace) {
  const docs = o.docs || [], n = docs.length, idx = c => docs.indexOf(c);
  const offDay = (c, d) => { const l = o.days && o.days[new Date(d + 'T00:00:00Z').getUTCDay()]; return Array.isArray(l) && l.indexOf(c) >= 0; };
  // ลาปกติ (และวันที่ไม่แจกตามวัน): แพทย์คนอื่นรับแทน แล้วคืนคิวเมื่อกลับมา · ลายาว (kind = long): ไม่แจก คิวที่ถึงระหว่างนั้นเสียไป ไม่ชดเชย
  // ลายาว แจกงานตั้งแต่ (assign): รับเคสได้ตั้งแต่วันนั้น (ก่อนกลับมาได้) · ไม่ระบุ = หลังวันลาวันสุดท้าย
  const away = (c, d) => !!d && (offDay(c, d) || (o.leaves || []).some(l => l.doc === c && l.kind !== 'long' && l.kind !== 'off' && l.from <= d && d <= (l.to || l.from)));
  const longOff = (c, d) => !!d && (o.leaves || []).some(l => l.doc === c && (l.kind === 'long' || l.kind === 'off') && l.from <= d && (l.assign ? d < l.assign : d <= (l.to || l.from)));
  const lim = Math.max(0, Math.floor(+o.payback) || 0);
  const copy = s => ({ pos: s.pos, credit: Object.assign({}, s.credit), owe: s.owe.slice(), paid: Object.assign({}, s.paid) });
  // หนึ่งเคสวันที่ d (แก้ s): { code, owner: เจ้าของคิว, kind: own | cover (รับแทนคนลา) | repay (คืนคิว), skipped: ข้ามเพราะหักคิว } · ไม่มีใครรับได้ = null
  const walk = (s, d) => {
    let limit = n;
    Object.keys(s.credit).forEach(k => { limit += n * Math.max(0, s.credit[k] || 0); });
    const skipped = [];
    for (let k = 0; k < limit; k++) {
      const at = s.pos + k, x = docs[at % n], r = Math.floor(at / n);
      if (longOff(x, d)) continue;   // ลายาว: คิวนี้เสียไป (หักคิวที่รออยู่เก็บไว้จนกลับมา)
      if (s.credit[x] > 0) { s.credit[x]--; skipped.push(x); continue; }
      if (away(x, d)) {
        // คนรับแทน: แพทย์ที่ไม่ลาที่ติดค้างน้อยที่สุด (รับแทนอยู่ + รอหักคิว) ถัดจากคนลาตามลำดับ (ไม่ให้คนเดียวรับแทนทั้งหมด)
        let y = '', best = 0;
        for (let j = 1; j < n; j++) {
          const c = docs[(at + j) % n];
          if (away(c, d) || longOff(c, d)) continue;
          let load = Math.max(0, s.credit[c] || 0);
          s.owe.forEach(e => { if (e.by === c) load++; });
          if (!y || load < best) { y = c; best = load; }
        }
        if (!y) return null;
        s.pos = at + 1;
        s.owe.push({ by: y, to: x });
        return { code: y, owner: x, kind: 'cover', skipped: skipped };
      }
      let w = -1;
      for (let j = 0; j < s.owe.length && w < 0; j++) {
        const e = s.owe[j], pd = s.paid[e.to];
        if (e.by === x && idx(e.to) >= 0 && !away(e.to, d) && !longOff(e.to, d) && (!lim || !pd || pd.r !== r || pd.n < lim)) w = j;
      }
      s.pos = at + 1;
      if (w < 0) return { code: x, owner: x, kind: 'own', skipped: skipped };
      const e = s.owe.splice(w, 1)[0], pd = s.paid[e.to];
      s.paid[e.to] = { r: r, n: pd && pd.r === r ? pd.n + 1 : 1 };
      return { code: e.to, owner: x, kind: 'repay', skipped: skipped };
    }
    return null;
  };
  let st = { pos: 0, credit: {}, owe: [], paid: {} };
  const log = [], pointer = o.pointer && idx(o.pointer.code) >= 0 ? o.pointer : null;
  let pointerDone = !pointer;
  const setPointer = () => { st.pos = (Math.floor(st.pos / n) + 1) * n + idx(pointer.code); pointerDone = true; };
  const ym = String(o.ym || o.date || '').slice(0, 7);
  const skipDays = n ? Object.keys(o.skips || {}).filter(m => m <= ym).map(m => ({ created: m + '-01', skip: o.skips[m] })) : [];
  const bonus = n ? (o.bonus || []).filter(b => b && b.at && idx(b.code) >= 0).map(b => ({ created: String(b.at), bonus: b })) : [];
  const list = (n ? o.rows || [] : []).concat(skipDays, bonus).sort((a, b) => (a.created < b.created ? -1 : a.created > b.created ? 1 : 0));
  list.forEach(c => {
    if (!pointerDone && c.created >= pointer.at) setPointer();
    if (c.skip) {
      Object.keys(c.skip).forEach(code => { const m = Math.min(50, Math.max(0, Math.floor(+c.skip[code]) || 0)); if (m && idx(code) >= 0) st.credit[code] = (st.credit[code] || 0) + m; });
      return;
    }
    if (c.bonus) {   // คิวชดเชย: แพทย์คนอื่นผลัดกันคืนให้ (ถัดจากคนนั้นตามลำดับ) ไม่ใช่คนเดียว
      const t = idx(c.bonus.code), m = Math.min(50, Math.max(0, Math.floor(+c.bonus.n) || 0));
      for (let i = 0; n > 1 && i < m; i++) st.owe.push({ by: docs[(t + 1 + (i % (n - 1))) % n], to: c.bonus.code });
      return;
    }
    if (c.how === 'import' || c.how === 'emer' || c.how === 'owner') { log.push({ row: c, kind: c.how }); return; }   // ดึงจากรายงาน HIS · Emergency (แพทย์เวร S1) · เจ้าของไข้เดิม: ไม่นับในคิว
    if (idx(c.doc) < 0) { log.push({ row: c, kind: 'out' }); return; }   // แพทย์ที่ไม่อยู่ในคิว
    if (c.how === 'manual') { st.credit[c.doc] = (st.credit[c.doc] || 0) + 1; log.push({ row: c, kind: 'manual' }); return; }
    const s = copy(st), res = walk(s, c.date);
    if (res && res.code === c.doc) { st = s; log.push({ row: c, kind: res.kind, owner: res.owner, skipped: res.skipped }); return; }
    st.credit[c.doc] = (st.credit[c.doc] || 0) + 1;
    log.push({ row: c, kind: 'early', owner: res ? res.code : '' });
  });
  if (!pointerDone && n) setPointer();
  const next = n ? walk(copy(st), o.date) : null;
  if (trace) {
    trace.log = log;
    trace.credit = Object.assign({}, st.credit);
    trace.owe = st.owe.slice();
    trace.next = next;
    trace.ahead = (k, d, rest) => { const s = copy(st), out = []; for (let i = 0; i < k; i++) { const r = walk(s, (i && rest !== undefined ? rest : d) || ''); if (!r) break; out.push(r); } return out; };
  }
  return next ? next.code : '';
}

/**
 * แถบ RTT/RA Jobs: บันทึกภาระงานของเดือน (ของตัวเอง · แอดมินบันทึกแทนได้) ยืนยันด้วยรหัส PIN (ตั้งค่า → รหัส PIN: RTT/RA Jobs)
 * rec = { ym: 'YYYY-MM', who: ชื่อ-สกุล (ตรงกับชื่อในผู้ปฏิบัติงานประจำวัน), kind: 'rtt' | 'ra', prof, cells, leaves (JSON) } · คืนรายการหลังบันทึก
 */
const JOB_KINDS = ['rtt', 'ra'];
// ชื่อเทียบกัน: ไม่สนคำนำหน้าและช่องว่าง (เหมือน nameKey ในหน้าเว็บ)
// 2026-11-23.2: ไม่สนคำนำหน้า (ซ้อนกันได้ เช่น ผศ.นพ.) ช่องว่าง และตัวอักษรที่มองไม่เห็น · เหมือน nmKey ของหน้าเว็บ 2026-11-22.18
const NM_TITLE_ = /^(?:ว่าที่\s*(?:ร้อยตรี|ร\.\s*ต\.)(?:\s*หญิง)?|นายแพทย์|แพทย์หญิง|ทันตแพทย์หญิง|ทันตแพทย์|เภสัชกรหญิง|เภสัชกร|นางสาว|นาง|นาย|ทพญ\.|ทพ\.|ภญ\.|ภก\.|นพ\.|พญ\.|น\.ส\.|นส\.|ด\.ช\.|ด\.ญ\.|ผศ\.|รศ\.|ศ\.|ดร\.|(?:mrs|mr|ms|dr)\.|(?:mrs|mr|ms|miss|dr)\s)/i;
const nameKey_ = v => {
  let x = String(v == null ? '' : v).replace(/[\u200b-\u200d\u2060\ufeff]/g, '').trim();
  for (let i = 0; i < 4; i++) { const y = x.replace(NM_TITLE_, '').trim(); if (y === x) break; x = y; }
  return x.replace(/\s+/g, '').toLowerCase();
};
// id แถวภาระงาน (Jobs): แบบเดิม (ก่อน 2026-11-23.2) ไม่เปลี่ยน · แถวที่บันทึกไว้แล้วหาเจอเหมือนเดิม
const jobRowKey_ = v => String(v == null ? '' : v).trim().replace(/^(นางสาว|นาง|นาย|น\.ส\.|ดร\.|นพ\.|พญ\.)/, '').replace(/\s+/g, '').toLowerCase();
function jobsSave(rec, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.jobs);
  rec = rec && typeof rec === 'object' ? rec : {};
  const cut = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const ym = cut(rec.ym, 7), who = cut(rec.who, 120), kind = cut(rec.kind, 10);
  if (!/^\d{4}-\d{2}$/.test(ym)) throw new Error('เดือนไม่ถูกต้อง');
  if (!nameKey_(who)) throw new Error('ไม่มีชื่อผู้ปฏิบัติงาน');
  if (JOB_KINDS.indexOf(kind) < 0) throw new Error('แบบฟอร์มไม่ถูกต้อง');
  const own = u.via === 'lpch' && jobNames_(u, readConfig_(ss_()) || {}).indexOf(nameKey_(who)) >= 0;
  if (!own && !u.isAdmin) throw new Error('บันทึกได้เฉพาะภาระงานของตัวเอง (แอดมินบันทึกแทนได้)');
  const json = (v, isArr, max) => {
    const t = String(v == null ? '' : v);
    if (!t) return '';
    if (t.length > max) throw new Error('ข้อมูลภาระงานยาวเกินไป');
    let o;
    try { o = JSON.parse(t); } catch (e) { throw new Error('ข้อมูลภาระงานไม่ถูกต้อง'); }
    if (isArr ? !Array.isArray(o) : !o || typeof o !== 'object' || Array.isArray(o)) throw new Error('ข้อมูลภาระงานไม่ถูกต้อง');
    return JSON.stringify(o);
  };
  const cells = json(rec.cells, false, 45000), leaves = json(rec.leaves, true, 5000), prof = json(rec.prof, false, 2000);
  return withLock_(() => {
    const ss = ss_(), id = jobRowKey_(who) + '|' + ym, x = openRow_(ss, 'jobs', null, id), row = x.row;
    pinChange_(u, pin, !!row);
    const old = row ? x.cur : null;
    const set = { id: id, ym: ym, who: who, user: own ? String(u.username || '') : (old && old.user) || cut(rec.user, 80), kind: kind, prof: prof, cells: cells, leaves: leaves,
      by: String(u.name || u.username || u.me || ''), updated: new Date().toISOString() };
    return saveRow_(x, TABLES.jobs.fields, set);
  });
}
// ภาระงานที่ส่งให้หน้าเว็บ: 13 เดือนล่าสุด · ของตัวเอง (ชื่อตรงกับบัญชี LPCH) · แอดมินและบัญชี Google ได้ทุกคน
function jobsFor_(ss, user, cfg) {
  const d = new Date(Date.now() - 400 * 864e5), from = Utilities.formatDate(d, tz_(ss), 'yyyy-MM');
  const all = readTable_(ss, 'jobs').filter(x => String(x.id).split('|')[1] >= from);
  if (user.via === 'google' || user.isAdmin || crewHead_(ss, cfg || readConfig_(ss) || {}, user)) return all;   // API 91: หัวหน้าทีม RTT / RA
  const mine = jobNames_(user, cfg || readConfig_(ss) || {});
  return all.filter(x => mine.indexOf(nameKey_(x.who)) >= 0);
}
// ชื่อของผู้ใช้ในแถบ RTT/RA Jobs: ชื่อใน LPCH และชื่อใน ตั้งค่า → RTT, RA และบุคลากรอื่น ที่เชื่อมบัญชี LPCH นี้ไว้ (เทียบแบบไม่สนคำนำหน้า)
function jobNames_(user, cfg) {
  const out = [nameKey_(user.name)], uname = String(user.username || '').toLowerCase();
  (Array.isArray(cfg.crew) ? cfg.crew : []).forEach(x => { if (x && uname && String(x.user || '').toLowerCase() === uname && nameKey_(x.name)) out.push(nameKey_(x.name)); });
  return out.filter(Boolean);
}

// ตำแหน่งใน LPCH ที่เป็น RTT / RA (ตั้งค่า → ตารางวันฉาย · config.dutyRoles)
function dutyRoles_(cfg) {
  const r = cfg && cfg.dutyRoles && typeof cfg.dutyRoles === 'object' ? cfg.dutyRoles : {};
  const list = (v, d) => (Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : d);
  return { rtt: list(r.rtt, ['RTT']), ra: list(r.ra, ['RA']) };
}

// เก็บรายชื่อ RTT / RA ล่าสุดที่ดึงจาก LPCH ได้ (Script property DUTY_MEMBERS) ไว้ใช้ตอนที่ LPCH ไม่ให้ดึงด้วยบัญชีนั้น
function keepDutyMembers_(users) {
  try {
    const roles = dutyRoles_(readConfig_(ss_()) || {}), want = roles.rtt.concat(roles.ra);
    let keep = users.filter(x => want.indexOf(x.role) >= 0).map(x => ({ username: x.username, name: x.name, role: x.role }));
    let text = JSON.stringify({ at: new Date().toISOString(), users: keep });
    while (text.length > 8500 && keep.length) { keep = keep.slice(0, Math.floor(keep.length * 0.8)); text = JSON.stringify({ at: new Date().toISOString(), users: keep }); }
    PropertiesService.getScriptProperties().setProperty('DUTY_MEMBERS', text);
  } catch (e) { /* เก็บไม่ได้: ครั้งหน้าดึงใหม่ */ }
}

/**
 * รายชื่อให้เลือกผู้ปฏิบัติงานประจำวัน: สมาชิก LPCH RO Workspace ที่ตำแหน่งตรงกับ RTT / RA ใน ตั้งค่า (ไม่ส่งตำแหน่งอื่น)
 * ดึงจาก LPCH ด้วยบัญชีที่เข้าระบบ · ดึงไม่ได้ (LPCH ไม่ให้ หรือเปิดจากเมนูในชีต) ใช้รายชื่อล่าสุดที่เคยดึงได้ · { rtt, ra, at, live, why }
 */
function dutyMembers(token) {
  const u = requireEdit_(token, EDIT_VIEWS.course.concat(EDIT_VIEWS.ctsim));
  const roles = dutyRoles_(readConfig_(ss_()) || {});
  let users = null, why = '';
  if (u.via === 'lpch') {
    try {
      const out = lpchCall_({ action: 'directory', token: String(token) });
      users = (Array.isArray(out.users) ? out.users : []).map(x => ({ username: String(x.username || ''), name: String(x.fullName || x.username || ''), role: String(x.role || '') })).filter(x => x.username);
      keepDutyMembers_(users);
    } catch (e) { why = e.message; }
  } else why = 'บัญชี Google ดึงรายชื่อจาก LPCH ไม่ได้';
  let at = new Date().toISOString();
  if (!users) {
    let kept = null;
    try { kept = JSON.parse(PropertiesService.getScriptProperties().getProperty('DUTY_MEMBERS') || 'null'); } catch (e) { kept = null; }
    users = kept && Array.isArray(kept.users) ? kept.users : [];
    at = kept ? String(kept.at || '') : '';
  }
  const pick = list => users.filter(x => list.indexOf(x.role) >= 0).map(x => ({ username: x.username, name: x.name, role: x.role }));
  return { rtt: pick(roles.rtt), ra: pick(roles.ra), at: at, live: !why, why: why };
}

/* ---------- สถิติ Brachytherapy จากระบบนัด Brachytherapy (อ่าน Google Sheet ของระบบนั้นโดยตรง) ---------- */
// ตั้งค่า → Brachytherapy (config.brachySync): { on, src: '' = ชีตของระบบนัดเดิม | 'internal' = แถบนัดคิวใส่แร่ของระบบนี้, url = ลิงก์ชีตของระบบนัด, sheet = แท็บ, map = { คีย์: หัวคอลัมน์ }, count: 'all' | 'done', from: 'yyyy-MM-dd' }
// นัดหนึ่งครั้ง (ไม่ยกเลิก · count 'done' = เฉพาะ "มาตามนัด") = กิจกรรม Brachy ของผู้วางแผน (MP) + RC ของคน RC (HN ชื่อ วันนัด)
// เทคนิค Interstitial needle / เสียบเข็ม = Brachy เสียบเข็ม · MP / RC ในระบบนัดเป็นรหัส ชื่อผู้ใช้ อีเมล หรือชื่อ-สกุล (ตั้งค่า → ทีมนักฟิสิกส์)
// รายการที่ดึงมามี src = brachy:<รหัสนัด>:plan|rc · ต้นทางแก้ = แก้ตาม · ยกเลิกหรือหายไป = ลบ · มีรายการที่บันทึกเอง (วัน HN คน ประเภทเดียวกัน) = ไม่เพิ่มซ้ำ
// ดึงเมื่อ: หน้าเว็บเปิดและดึงครั้งล่าสุดเกิน BRACHY_EVERY_MIN นาที (brachyPull) · ปุ่มดึงตอนนี้ (แอดมิน) · ตัวตั้งเวลาของ Apps Script ที่เจ้าของสร้างเอง (brachyTick)
const BRACHY_ST_DONE = 'มาตามนัด', BRACHY_ST_CANCEL = 'ยกเลิก';
const BRACHY_EVERY_MIN = 10;
const BRACHY_KEYS = {
  id: ['apptid', 'appointmentid', 'appt', 'id', 'รหัสนัด', 'เลขนัด', 'เลขที่นัด', 'รหัสนัดหมาย', 'ไอดี'],
  date: ['date', 'วันที่', 'วันนัด', 'วันที่นัด', 'นัดวันที่', 'apptdate', 'appointmentdate'],
  hn: ['hn'],
  name: ['name', 'ชื่อ', 'ชื่อสกุล', 'ชื่อผู้ป่วย', 'ชื่อสกุลผู้ป่วย', 'ผู้ป่วย', 'patient', 'patientname', 'fullname'],
  technique: ['technique', 'เทคนิค', 'tech', 'รูปแบบการใส่', 'รูปแบบการใส่แร่', 'การใส่', 'การใส่แร่', 'ชนิดการใส่', 'รูปแบบ', 'applicator', 'applicatortype', 'insertion', 'insertiontype', 'วิธี', 'method', 'type', 'ชนิด'],
  mp: ['mp', 'ผู้วางแผน', 'วางแผน', 'planner', 'plannedby', 'planby', 'physicist', 'นักฟิสิกส์', 'นักฟิสิกส์การแพทย์', 'mpวางแผน'],
  rc: ['rc', 'ผู้ตรวจ', 'checker', 'mprc'],
  status: ['status', 'สถานะ'],
  fx: ['fx', 'fraction', 'ครั้งที่', 'fxที่', 'fractionที่'],
  totalFx: ['totalfx', 'fxทั้งหมด', 'จำนวนครั้ง', 'จำนวนfx', 'totalfraction', 'จำนวนfraction'],
};
// ต้องมี: วันที่ HN MP · ไม่มีรหัสนัด = ใช้ HN + วันที่ + Fx แทน (เลื่อนวันนัด = ลบรายการเดิม เพิ่มรายการใหม่)
const BRACHY_NEED = ['date', 'hn', 'mp'];
// รูปแบบการใส่ / เทคนิคที่เป็นเสียบเข็ม (Interstitial needle · เสียบเข็ม · รหัส I ของระบบนัด) = Brachy เสียบเข็ม
const BRACHY_NEEDLE = /interstitial|needle|เข็ม|^i$/i;
const BRACHY_LABEL = { id: 'รหัสนัด', date: 'วันที่', hn: 'HN', mp: 'MP (ผู้วางแผน)' };
const brachyNorm_ = v => String(v || '').toLowerCase().replace(/[\s_.\-:]+/g, '');
// หัวคอลัมน์ → คำที่ใช้เทียบ: ทั้งชื่อ · ส่วนนอกวงเล็บ · ส่วนในวงเล็บ (เช่น "MP (ผู้วางแผน)" = mp, ผู้วางแผน)
function brachyHeadKeys_(h) {
  const t = String(h || ''), out = [t, t.replace(/\(.*?\)/g, '')];
  (t.match(/\(([^)]*)\)/g) || []).forEach(x => out.push(x.slice(1, -1)));
  return out.map(brachyNorm_).filter(Boolean);
}

// เปิดชีตของระบบอื่นจากลิงก์ในตั้งค่า (what = ชื่อระบบในข้อความ · ชื่ออังกฤษเว้นวรรคหน้า)
function extBook_(s, what) {
  what = /^[A-Za-z]/.test(what) ? ' ' + what : what;
  const raw = String((s && s.url) || '').trim();
  const m = /\/d\/([\w-]{20,})/.exec(raw) || /^([\w-]{20,})$/.exec(raw);
  if (!m) throw new Error(raw ? 'ลิงก์ชีตของ' + what + ' ต้องเป็นลิงก์ Google Sheet (docs.google.com/spreadsheets/d/…) ไม่ใช่ลิงก์หน้าเว็บ' : 'ยังไม่ได้ใส่ลิงก์ชีตของ' + what);
  try { return SpreadsheetApp.openById(m[1]); } catch (e) {
    throw new Error('เปิดชีตของ' + what + ' ไม่ได้ (' + e.message + ') · บัญชี Google ที่ Deploy ระบบนี้ต้องเปิดชีตนั้นได้ (แชร์ให้อย่างน้อยดูได้)');
  }
}
const brachyBook_ = s => extBook_(s, 'ระบบนัด Brachytherapy');

/* ---------- TDF Dose Calculator (17 พ.ย. รอบ 2): หน้าเครื่องคำนวณ TDF ฝังในแถบย่อยของ Planning · บันทึกลงชีตเดิมของเว็บ TDF ----------
 * ทำแบบเดียวกับ tdfList / tdfSave / tdfRecheck / tdfSavePdf / tdfWithdraw ของเว็บ TDF (แถว คอลัมน์ สถานะ เลขที่ ลายเซ็น PDF) · ผู้ใช้ = บัญชีที่เข้าสู่ระบบนี้
 * ชีต: config.tdfApp.rec (ว่าง = ลิงก์ของ RC จาก TDF · config.tdfSync.url) แท็บ Records · PDF: config.tdfApp.pdf หรือโฟลเดอร์ "TDF Reports (อนุมัติแล้ว)" */
const TDFX_HEAD = ['id', 'createdAt', 'status', 'type', 'hn', 'patient', 'doctor', 'tdf', 'calcUser', 'calcName', 'calcRole', 'reviewUser', 'reviewName', 'reviewRole',
  'reviewAt', 'reviewNote', 'recheckTdf', 'sig', 'json', 'pdfFileId', 'pdfUrl'];
const TDFX_ROLE = 'MP', TDFX_LIMIT = 300, TDFX_PDF_FOLDER = 'TDF Reports (อนุมัติแล้ว)', TDFX_PDF_MAX = 15 * 1024 * 1024, TDFX_TYPES = { frac: 1, gap: 1, brachy: 1 };
const tdfxUrl_ = cfg => String((cfg.tdfApp || {}).rec || '').trim() || String((cfg.tdfSync || {}).url || '').trim();
function tdfxSheet_(url) {
  if (!url) throw new Error('ยังไม่ได้ตั้งลิงก์ชีตบันทึกของ TDF (ตั้งค่า → แถบงานอื่น → TDF Dose Calculator)');
  const book = extBook_({ url: url }, 'TDF Dose Calculator'), sh = book.getSheetByName('Records');
  if (!sh) throw new Error('ไม่พบแท็บ Records ในชีต ' + book.getName() + ' (ต้องเป็นชีตที่เว็บ TDF Dose Calculator ใช้เก็บรายการ: TDF Calculator Records)');
  const head = sh.getRange(1, 1, 1, TDFX_HEAD.length).getValues()[0].map(String);
  if (head.join('|') !== TDFX_HEAD.join('|')) throw new Error('หัวคอลัมน์ของแท็บ Records ในชีต ' + book.getName() + ' ไม่ตรงกับเว็บ TDF จึงไม่บันทึก (ต้องเป็น ' + TDFX_HEAD.join(', ') + ')');
  return sh;
}
// ผู้ใช้ที่เห็นแถบ TDF · edit = กรอก บันทึก recheck (ตำแหน่ง MP ใน Workspace เหมือนเว็บ TDF)
function tdfxUser_(token, edit) {
  const ss = ss_(), cfg = readConfig_(ss) || {}, u = who_(token, ss, cfg);
  if (u.via !== 'google' && !userAccess_(cfg, 'tdfcalc', u)) throw new Error('ตำแหน่ง ' + (u.role || '-') + ' ไม่เห็นแถบ TDF Dose Calculator');
  if (edit && u.role !== TDFX_ROLE) throw new Error('ดูได้อย่างเดียว · การกรอกค่า บันทึก และ recheck ทำได้เฉพาะนักฟิสิกส์การแพทย์ (ตำแหน่ง ' + TDFX_ROLE + ' ใน Workspace)');
  return { cfg: cfg, me: { username: String(u.username || ''), name: String(u.name || u.username || ''), role: String(u.role || '') } };
}
function tdfxLocked_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('ระบบกำลังบันทึกข้อมูลของผู้ใช้อื่นอยู่ กรุณาลองใหม่อีกครั้งในอีกสักครู่');
  try { return fn(); } finally { lock.releaseLock(); }
}
function tdfxRecord_(row) {
  let j = {};
  try { j = JSON.parse(row[18] || '{}'); } catch (e) { j = {}; }
  const t = v => (v ? new Date(v).getTime() : null);
  return {
    id: String(row[0]), at: t(row[1]), status: String(row[2]), type: String(row[3]), tdf: Number(row[7]), ref: j.ref,
    title: j.title || '', summary: j.summary || '', sig: String(row[17]), state: j.state, patient: j.patient || {}, doctor: String(row[6]),
    snap: j.snap || {},
    calc: { username: String(row[8]), name: String(row[9]), role: String(row[10]), at: t(row[1]) },
    review: row[11] ? { username: String(row[11]), name: String(row[12]), role: String(row[13]), at: t(row[14]), note: String(row[15] || ''), recheckTdf: row[16] === '' ? null : Number(row[16]) } : null,
    pdf: row[19] ? { id: String(row[19]), url: String(row[20] || '') } : null,
  };
}
function tdfxBySig_(rows, sig) {
  const out = { approved: null, pending: null };
  for (let i = rows.length - 1; i >= 1; i--) {
    if (rows[i][17] !== sig) continue;
    if (rows[i][2] === 'approved' && !out.approved) out.approved = { row: i + 1, values: rows[i] };
    if (rows[i][2] === 'pending' && !out.pending) out.pending = { row: i + 1, values: rows[i] };
  }
  return out;
}
function tdfxFind_(rows, id) {
  for (let i = rows.length - 1; i >= 1; i--) if (String(rows[i][0]) === String(id)) return { row: i + 1, values: rows[i] };
  return null;
}
const tdfxId_ = date => Utilities.formatDate(date, 'Asia/Bangkok', 'yyMMdd') + '-' + Utilities.getUuid().slice(0, 6);
const tdfxName_ = p => ((p.prefix && p.prefix !== '-' ? String(p.prefix) : '') + [p.first, p.last].filter(x => x).join(' ')).trim().slice(0, 120);
function tdfxJson_(rec) {
  if (!rec || typeof rec !== 'object') throw new Error('ไม่มีข้อมูลการคำนวณ');
  const p = rec.patient = rec.patient || {};
  if (!TDFX_TYPES[rec.type]) throw new Error('ชนิดการคำนวณไม่ถูกต้อง');
  if (!isFinite(rec.tdf) || !isFinite(rec.ref)) throw new Error('ค่า TDF ไม่ถูกต้อง');
  const blank = v => !String(v || '').trim();
  if (blank(p.hn) || blank(p.prefix) || blank(p.first) || blank(p.last) || blank(rec.doctor)) throw new Error('กรอก HN คำนำหน้าชื่อ ชื่อ นามสกุล และแพทย์ผู้รักษาให้ครบก่อนบันทึกหรือ recheck');
  const json = JSON.stringify({ title: rec.title, ref: rec.ref, summary: rec.summary, state: rec.state, patient: p, snap: rec.snap });
  if (json.length > 45000) throw new Error('ข้อมูลการคำนวณยาวเกินไป');
  return json;
}
const TDFX_DONE = id => 'การคำนวณนี้ recheck แล้ว (เลขที่ ' + id + ') กด “สร้างรายงาน PDF” เพื่อดาวน์โหลดรายงาน';
/** รายการคำนวณล่าสุด 300 รายการ (ใหม่ก่อน) */
function tdfxList(token) {
  const x = tdfxUser_(token, false), rows = tdfxSheet_(tdfxUrl_(x.cfg)).getDataRange().getValues().slice(1);
  return rows.slice(-TDFX_LIMIT).reverse().map(tdfxRecord_);
}
/** บันทึกไว้ก่อน (รอ recheck) · การคำนวณเดิมซ้ำ = คืนรายการที่มีอยู่ */
function tdfxSave(rec, token) {
  const x = tdfxUser_(token, true), me = x.me, json = tdfxJson_(rec), p = rec.patient, sh = tdfxSheet_(tdfxUrl_(x.cfg));
  return tdfxLocked_(() => {
    const sig = String(rec.sig || ''), found = tdfxBySig_(sh.getDataRange().getValues(), sig);
    if (found.approved) throw new Error(TDFX_DONE(found.approved.values[0]));
    if (found.pending) { const kept = tdfxRecord_(found.pending.values); kept.existing = true; return kept; }
    const now = new Date(), row = [tdfxId_(now), now, 'pending', rec.type, String(p.hn).slice(0, 20), tdfxName_(p), String(rec.doctor).slice(0, 80), Number(rec.tdf),
      me.username, me.name, me.role, '', '', '', '', '', '', sig, json, '', ''];
    sh.appendRow(row);
    return tdfxRecord_(row);
  });
}
/** Recheck โดยนักฟิสิกส์การแพทย์คนที่ 2 (ชื่อผู้ใช้และรหัสผ่าน Workspace ของคนนั้น · ตรวจแล้วออกจากระบบทันที ไม่เก็บรหัสผ่าน) */
function tdfxRecheck(rec, username, password, token) {
  const x = tdfxUser_(token, true), me = x.me, json = tdfxJson_(rec), p = rec.patient;
  username = String(username || '').trim();
  if (!username || !password) throw new Error('กรอกชื่อผู้ใช้และรหัสผ่านของนักฟิสิกส์การแพทย์ผู้ recheck');
  let res;
  try { res = lpchCall_({ action: 'login', username: username, password: String(password) }); } catch (e) { throw new Error('Recheck ไม่สำเร็จ: ' + (e.message || e)); }
  try { if (res.token) lpchCall_({ action: 'logout', token: String(res.token) }); } catch (e) { /* ปล่อยให้หมดอายุเอง */ }
  const ru = res.user || {}, v = { username: String(ru.username || ''), name: String(ru.fullName || ru.username || ''), role: String(ru.role || '') };
  if (v.role !== TDFX_ROLE) throw new Error('ผู้ recheck ต้องเป็นนักฟิสิกส์การแพทย์ (ตำแหน่ง ' + TDFX_ROLE + ' ใน Workspace)');
  const sh = tdfxSheet_(tdfxUrl_(x.cfg));
  return tdfxLocked_(() => {
    const sig = String(rec.sig || ''), found = tdfxBySig_(sh.getDataRange().getValues(), sig), now = new Date();
    if (found.approved) throw new Error(TDFX_DONE(found.approved.values[0]));
    if (found.pending) {
      const row = found.pending.values;
      if (v.username === row[8]) throw new Error('ผู้ recheck ต้องเป็นนักฟิสิกส์การแพทย์คนละคนกับผู้คำนวณ (' + row[9] + ')');
      row[2] = 'approved'; row[11] = v.username; row[12] = v.name; row[13] = v.role; row[14] = now; row[15] = ''; row[16] = Number(rec.tdf);
      sh.getRange(found.pending.row, 1, 1, row.length).setValues([row]);
      return tdfxRecord_(row);
    }
    if (v.username === me.username) throw new Error('ผู้ recheck ต้องเป็นนักฟิสิกส์การแพทย์คนละคนกับผู้คำนวณ (ผู้ที่เข้าสู่ระบบอยู่)');
    const fresh = [tdfxId_(now), now, 'approved', rec.type, String(p.hn).slice(0, 20), tdfxName_(p), String(rec.doctor).slice(0, 80), Number(rec.tdf),
      me.username, me.name, me.role, v.username, v.name, v.role, now, '', Number(rec.tdf), sig, json, '', ''];
    sh.appendRow(fresh);
    return tdfxRecord_(fresh);
  });
}
// โฟลเดอร์ PDF (ตั้งค่า หรือชื่อ TDF Reports (อนุมัติแล้ว) ที่ยังไม่ถูกลบ) · date = โฟลเดอร์ย่อยของเดือนนั้น · find = ไม่สร้าง
function tdfxFolder_(pdf, date, find) {
  const raw = String(pdf || '').trim(), m = /\/folders\/([\w-]{20,})/.exec(raw) || /^([\w-]{20,})$/.exec(raw);
  let root = null;
  if (m) {
    try { root = DriveApp.getFolderById(m[1]); } catch (e) { throw new Error('เปิดโฟลเดอร์ PDF ของ TDF ไม่ได้ (' + e.message + ') · บัญชีที่ Deploy ระบบนี้ต้องแก้ไขโฟลเดอร์นั้นได้'); }
  } else if (raw) {
    throw new Error('ลิงก์โฟลเดอร์ PDF ของ TDF ต้องเป็นลิงก์โฟลเดอร์ Google Drive (drive.google.com/drive/folders/…)');
  } else {
    const it = DriveApp.getFoldersByName(TDFX_PDF_FOLDER);
    while (it.hasNext() && !root) { const f = it.next(); if (!f.isTrashed()) root = f; }
    if (!root && !find) root = DriveApp.createFolder(TDFX_PDF_FOLDER);
  }
  if (!root || !date) return root;
  const month = Utilities.formatDate(new Date(date), 'Asia/Bangkok', 'yyyy-MM'), sub = root.getFoldersByName(month);
  return sub.hasNext() ? sub.next() : root.createFolder(month);
}
/** เก็บรายงาน PDF ของรายการที่ recheck แล้วใน Google Drive (ผู้คำนวณหรือผู้ recheck · เก็บครั้งเดียว) */
function tdfxSavePdf(id, base64, fileName, token) {
  const x = tdfxUser_(token, true), me = x.me;
  let bytes;
  try { bytes = Utilities.base64Decode(String(base64 || '')); } catch (e) { throw new Error('ไฟล์ PDF ไม่ถูกต้อง'); }
  if (!bytes.length || bytes.length > TDFX_PDF_MAX) throw new Error('ไฟล์ PDF ว่างหรือใหญ่เกินไป');
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== '%PDF') throw new Error('ไฟล์ที่ส่งมาไม่ใช่ PDF');
  const sh = tdfxSheet_(tdfxUrl_(x.cfg));
  return tdfxLocked_(() => {
    const found = tdfxFind_(sh.getDataRange().getValues(), id);
    if (!found) throw new Error('ไม่พบรายการ');
    const row = found.values;
    if (row[2] !== 'approved') throw new Error('เก็บ PDF ได้เฉพาะรายการที่ recheck แล้ว');
    if (me.username !== row[8] && me.username !== row[11]) throw new Error('เก็บ PDF ได้เฉพาะผู้คำนวณหรือผู้ recheck ของรายการนี้');
    if (row[19]) return tdfxRecord_(row);
    const name = String(fileName || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 120) || ('Decay Dose_' + row[4] + '.pdf');
    const file = tdfxFolder_((x.cfg.tdfApp || {}).pdf, row[14] || new Date()).createFile(Utilities.newBlob(bytes, 'application/pdf', name));
    file.setDescription('TDF ' + Number(row[7]).toFixed(1) + ' · HN ' + row[4] + ' ' + row[5] + ' · แพทย์ ' + row[6] + ' · คำนวณ ' + row[9] + ' · recheck ' + row[12] + ' · เลขที่ ' + row[0]);
    row[19] = file.getId();
    row[20] = file.getUrl();
    sh.getRange(found.row, 1, 1, row.length).setValues([row]);
    return tdfxRecord_(row);
  });
}
/** ผู้คำนวณถอนรายการของตัวเองที่ยังรอ recheck (recheck แล้วถอนไม่ได้) */
function tdfxWithdraw(id, token) {
  const x = tdfxUser_(token, true), sh = tdfxSheet_(tdfxUrl_(x.cfg));
  return tdfxLocked_(() => {
    const found = tdfxFind_(sh.getDataRange().getValues(), id);
    if (!found) return true;
    if (found.values[8] !== x.me.username) throw new Error('ถอนได้เฉพาะรายการที่คุณเป็นผู้คำนวณ');
    if (found.values[2] === 'approved') throw new Error('รายการที่ recheck แล้วถอนไม่ได้');
    sh.deleteRow(found.row);
    return true;
  });
}
/** แอดมิน: ตรวจชีตบันทึกและโฟลเดอร์ PDF ของ TDF ด้วยค่าที่กำลังตั้ง (ไม่เขียนอะไร) */
function tdfxCheck(s, token) {
  const u = who_(token);
  if (!u.isAdmin && !subAll_(u)) throw new Error('ตรวจชีตของ TDF ได้เฉพาะแอดมิน');
  s = s && typeof s === 'object' ? s : {};
  const sh = tdfxSheet_(String(s.rec || '').trim()), rows = sh.getDataRange().getValues().slice(1);
  const dates = rows.map(r => (r[1] instanceof Date ? Utilities.formatDate(r[1], 'Asia/Bangkok', 'yyyy-MM-dd') : '')).filter(String).sort();
  const f = tdfxFolder_(s.pdf, null, true);
  return { title: sh.getParent().getName(), rows: rows.length, pending: rows.filter(r => r[2] === 'pending').length, approved: rows.filter(r => r[2] === 'approved').length,
    last: dates[dates.length - 1] || '', folder: f ? { name: f.getName(), url: f.getUrl() } : null };
}

/* ---------- ทะเบียนหนังสือส่ง (20 พ.ย. · API 107): แถบย่อยของ Planning · อ่าน / บันทึกในชีตเดิมของเว็บทะเบียนหนังสือส่ง ----------
 * ชีต: config.sendBook.url · หนึ่งแท็บต่อปี พ.ศ. (ชื่อแท็บ = ปี 4 หลัก) · แถวหัว: เลขทะเบียนส่ง | ที่ | ลงวันที่ | จาก | ถึง | เรื่อง | การปฏิบัติ | หมายเหตุ
 * คอลัมน์ A มีเลขเรียงไว้ล่วงหน้าได้ (แถวที่มีแต่เลข = ยังไม่ได้ใช้) · ลบรายการ = ล้าง B:H คงเลขไว้ในคอลัมน์ A
 * วันที่เก็บเป็นวันที่ ค.ศ. รูปแบบ d/m/yyyy (ค่าเดิมที่พิมพ์ปีเป็น พ.ศ. = ปี ≥ 2400 อ่านเป็น พ.ศ.) · ข้อความที่อ่านเป็นวันที่ไม่ได้ส่งเป็น dateText
 * เลขถัดไปของปี = เลขว่างตัวแรกนับจากตัวนับของปีนั้น (Script property SBK_NEXT · ไม่ได้ตั้ง = เลขมากสุดที่มีข้อมูล + 1) · เลขที่มีข้อมูลแล้วถูกข้าม */
const SBK_HEAD = ['เลขทะเบียนส่ง', 'ที่', 'ลงวันที่', 'จาก', 'ถึง', 'เรื่อง', 'การปฏิบัติ', 'หมายเหตุ'];
const SBK_VIEW = 'sendbook', SBK_PROP = 'SBK_NEXT', SBK_LEN = { ref: 100, from: 200, to: 200, subject: 1000, action: 200, note: 1000 };
const sbkYearOk_ = n => /^\d{4}$/.test(String(n)) && +n >= 2400 && +n <= 2700;
const sbkStr_ = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
function sbkUser_(token, edit) {
  const ss = ss_(), cfg = readConfig_(ss) || {}, u = who_(token, ss, cfg), acc = u.via === 'google' ? 'edit' : userAccess_(cfg, SBK_VIEW, u);
  if (!acc) throw new Error('ตำแหน่ง ' + (u.role || '-') + ' ไม่เห็นแถบทะเบียนหนังสือส่ง');
  if (edit && acc !== 'edit') throw new Error('ดูได้อย่างเดียว · ตำแหน่ง ' + (u.role || '-') + ' ออกเลข / แก้ไขทะเบียนหนังสือส่งไม่ได้ (ตั้งค่า → แถบเมนู)');
  return { cfg: cfg, u: u };
}
function sbkBook_(url) {
  url = String(url || '').trim();
  if (!url) throw new Error('ยังไม่ได้ตั้งลิงก์ชีตของทะเบียนหนังสือส่ง (ตั้งค่า → แถบงานอื่น → ทะเบียนหนังสือส่ง)');
  return extBook_({ url: url }, 'ทะเบียนหนังสือส่ง');
}
const sbkUrl_ = cfg => String((cfg.sendBook || {}).url || '').trim();
function sbkLocked_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('ระบบกำลังบันทึกข้อมูลของผู้ใช้อื่นอยู่ กรุณาลองใหม่อีกครั้งในอีกสักครู่');
  try { return fn(); } finally { lock.releaseLock(); }
}
// ค่าในคอลัมน์ ลงวันที่ → { date: 'yyyy-MM-dd' (ค.ศ.) หรือ '' · text: ข้อความเดิมเมื่ออ่านเป็นวันที่ไม่ได้ }
function sbkDate_(v, tz) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const s = Utilities.formatDate(v, tz, 'yyyy-MM-dd'), y = +s.slice(0, 4);
    return { date: (y >= 2400 ? y - 543 : y) + s.slice(4), text: '' };
  }
  const t = String(v == null ? '' : v).trim();
  if (!t) return { date: '', text: '' };
  const m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/.exec(t);
  if (m) {
    const d = +m[1], mo = +m[2];
    let y = +m[3];
    if (m[3].length === 2) y += 2500;   // ปี พ.ศ. 2 หลัก
    if (y >= 2400) y -= 543;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (y >= 1900 && y <= 2200 && mo >= 1 && mo <= 12 && dt.getUTCDate() === d) return { date: y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2), text: '' };
  }
  return { date: '', text: t.slice(0, 60) };
}
const sbkNo_ = v => { const n = typeof v === 'number' ? v : /^\d+$/.test(String(v == null ? '' : v).trim()) ? +String(v).trim() : NaN; return n > 0 && Math.floor(n) === n ? n : 0; };
// แท็บของปี: หัวคอลัมน์ต้องตรงกับเว็บทะเบียนหนังสือส่ง · rows = [{ row, no, data, v }] (ทุกแถวที่มีอะไรอยู่)
function sbkSheet_(sh) {
  const head = sh.getRange(1, 1, 1, SBK_HEAD.length).getValues()[0].map(x => String(x == null ? '' : x).trim());
  const ok = head.join('|') === SBK_HEAD.join('|'), last = sh.getLastRow();
  const vals = ok && last > 1 ? sh.getRange(2, 1, last - 1, SBK_HEAD.length).getValues() : [];
  return { ok: ok, rows: vals.map((v, i) => ({ row: i + 2, no: sbkNo_(v[0]), data: v.slice(1).some(x => x !== '' && x != null), v: v })) };
}
function sbkRecord_(year, x, tz, dup) {
  const v = x.v, d = sbkDate_(v[2], tz);
  return { id: year + '-' + x.no + (dup ? '-r' + x.row : ''), year: year, no: x.no, row: x.row, ref: sbkStr_(v[1], 200), date: d.date, dateText: d.text,
    from: sbkStr_(v[3], 300), to: sbkStr_(v[4], 300), subject: sbkStr_(v[5], 2000), action: sbkStr_(v[6], 300), note: sbkStr_(v[7], 2000) };
}
const sbkCounters_ = () => { try { const o = JSON.parse(propRead_(SBK_PROP) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };
// เลขถัดไป: เลขว่าง (ยังไม่มีข้อมูล) ตัวแรก นับจากตัวนับที่ตั้งไว้ · ไม่ได้ตั้ง = เลขมากสุดที่มีข้อมูล + 1
function sbkNext_(bookId, year, rows, counters) {
  const used = {}; let max = 0;
  rows.forEach(x => { if (x.no && x.data) { used[x.no] = 1; if (x.no > max) max = x.no; } });
  let n = sbkNo_((counters || {})[bookId + '|' + year]) || max + 1;
  while (used[n]) n++;
  return n;
}
function sbkRead_(book) {
  const tz = book.getSpreadsheetTimeZone() || 'Asia/Bangkok', id = book.getId(), counters = sbkCounters_();
  const records = [], nextNo = {}, bad = [];
  book.getSheets().forEach(sh => {
    const name = String(sh.getName()).trim();
    if (!sbkYearOk_(name)) return;
    const year = +name, s = sbkSheet_(sh);
    if (!s.ok) { bad.push(name); return; }
    const seen = {};
    s.rows.forEach(x => { if (!x.no || !x.data) return; records.push(sbkRecord_(year, x, tz, !!seen[x.no])); seen[x.no] = 1; });
    nextNo[year] = sbkNext_(id, year, s.rows, counters);
  });
  const now = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  return { records: records, nextNo: nextNo, currentYear: +now.slice(0, 4) + 543, sheetUrl: book.getUrl(), title: book.getName(), bad: bad };
}
function sbkState(token) {
  const x = sbkUser_(token, false);
  return sbkRead_(sbkBook_(sbkUrl_(x.cfg)));
}
// ค่าจากฟอร์ม → ค่าที่เขียนลงแถว (B:H) · date = yyyy-MM-dd (ค.ศ.) · keepDate = แก้ไขรายการที่วันที่ในชีตอ่านไม่ได้และไม่ได้ระบุใหม่
function sbkBody_(body, tz, needDate) {
  body = body && typeof body === 'object' ? body : {};
  const iso = String(body.date || '').trim(), subject = sbkStr_(body.subject, SBK_LEN.subject);
  let date = null;
  if (iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('วันที่ไม่ถูกต้อง');
    const y = +iso.slice(0, 4), t = new Date(Date.UTC(y, +iso.slice(5, 7) - 1, +iso.slice(8)));
    if (y < 1990 || y > 2200 || t.getUTCDate() !== +iso.slice(8)) throw new Error('วันที่ไม่ถูกต้อง');
    date = Utilities.parseDate(iso, tz, 'yyyy-MM-dd');
  } else if (needDate) throw new Error('กรุณาระบุวันที่');
  if (!subject) throw new Error('กรุณาระบุเรื่อง');
  return { iso: iso, date: date, ref: sbkStr_(body.ref, SBK_LEN.ref), from: sbkStr_(body.from, SBK_LEN.from), to: sbkStr_(body.to, SBK_LEN.to), subject: subject,
    action: sbkStr_(body.action, SBK_LEN.action), note: sbkStr_(body.note, SBK_LEN.note) };
}
// เขียน B:H ของแถว · ข้อความเก็บเป็นข้อความ (@) · วันที่รูปแบบ d/m/yyyy · ช่องที่มีรายการให้เลือก (data validation) และค่าไม่อยู่ในรายการ = เอากติกาของช่องนั้นออกแล้วเขียนใหม่
function sbkWrite_(sh, row, b, keepDate) {
  const put = (col, val, fmt) => {
    const c = sh.getRange(row, col);
    try { c.setNumberFormat(fmt).setValue(val); } catch (e) {
      if (!/validation|ตรวจสอบ/i.test(String(e && e.message))) throw e;
      c.clearDataValidations(); c.setNumberFormat(fmt).setValue(val);
    }
  };
  put(2, b.ref, '@');
  if (b.date) put(3, b.date, 'd/m/yyyy'); else if (!keepDate) put(3, '', 'd/m/yyyy');
  put(4, b.from, '@'); put(5, b.to, '@'); put(6, b.subject, '@'); put(7, b.action, '@'); put(8, b.note, '@');
}
// แท็บของปี (ไม่มี = สร้างใหม่ไว้หน้าสุด พร้อมแถวหัว)
function sbkYearSheet_(book, year, create) {
  let sh = book.getSheetByName(String(year));
  if (!sh && create) {
    sh = book.insertSheet(String(year), 0);
    sh.getRange(1, 1, 1, SBK_HEAD.length).setValues([SBK_HEAD]).setFontWeight('bold');
    try { sh.setFrozenRows(1); } catch (e) { /* ไม่จำเป็น */ }
  }
  if (!sh) throw new Error('ไม่พบแท็บปี ' + year + ' ในชีตทะเบียนหนังสือส่ง');
  return sh;
}
function sbkCreate(body, token) {
  const x = sbkUser_(token, true), book = sbkBook_(sbkUrl_(x.cfg)), tz = book.getSpreadsheetTimeZone() || 'Asia/Bangkok', b = sbkBody_(body, tz, true);
  const year = +b.iso.slice(0, 4) + 543;
  return sbkLocked_(() => {
    const sh = sbkYearSheet_(book, year, true), s = sbkSheet_(sh);
    if (!s.ok) throw new Error('หัวคอลัมน์ของแท็บ ' + year + ' ไม่ตรงกับทะเบียนหนังสือส่ง จึงไม่บันทึก (ต้องเป็น ' + SBK_HEAD.join(', ') + ')');
    const counters = sbkCounters_(), key = book.getId() + '|' + year, no = sbkNext_(book.getId(), year, s.rows, counters);
    const free = s.rows.filter(r => r.no === no && !r.data)[0];   // แถวที่มีเลขนี้เรียงไว้ล่วงหน้า
    let row = free ? free.row : 0;
    if (!row) {
      const lastData = s.rows.filter(r => r.data || r.no).map(r => r.row).pop() || 1;
      row = lastData + 1;
      sh.getRange(row, 1).setValue(no);
    }
    sbkWrite_(sh, row, b, false);
    if (counters[key] != null) { counters[key] = no + 1; propSave_(SBK_PROP, JSON.stringify(counters)); }
    SpreadsheetApp.flush();
    return sbkRecord_(year, { row: row, no: no, v: [no, b.ref, b.date, b.from, b.to, b.subject, b.action, b.note] }, tz, false);
  });
}
// หาแถวของรายการ: ตามแถวที่หน้าเว็บส่งมา (ถ้าเลขยังตรง) ไม่งั้นแถวแรกที่มีเลขนั้นและมีข้อมูล
function sbkFind_(rows, key) {
  const no = sbkNo_(key && key.no), row = +(key && key.row) || 0;
  return rows.filter(r => r.row === row && r.no === no && r.data)[0] || rows.filter(r => r.no === no && r.data)[0] || null;
}
function sbkUpdate(key, body, token) {
  const x = sbkUser_(token, true), book = sbkBook_(sbkUrl_(x.cfg)), tz = book.getSpreadsheetTimeZone() || 'Asia/Bangkok';
  const year = +(key && key.year);
  if (!sbkYearOk_(year)) throw new Error('ไม่รู้จักปีของรายการ');
  return sbkLocked_(() => {
    const sh = sbkYearSheet_(book, year, false), s = sbkSheet_(sh);
    if (!s.ok) throw new Error('หัวคอลัมน์ของแท็บ ' + year + ' ไม่ตรงกับทะเบียนหนังสือส่ง จึงไม่บันทึก');
    const cur = sbkFind_(s.rows, key);
    if (!cur) throw new Error('ไม่พบเลขที่ ' + (key && key.no) + ' ของปี ' + year + ' ในชีต (อาจถูกลบหรือแก้เลขไปแล้ว) · กดรีเฟรช');
    const had = sbkDate_(cur.v[2], tz), b = sbkBody_(body, tz, !had.text);
    const no = body && body.no !== undefined && body.no !== '' ? sbkNo_(body.no) : cur.no;
    if (!no) throw new Error('เลขทะเบียนส่งต้องเป็นจำนวนเต็มบวก');
    if (no !== cur.no) {
      if (s.rows.some(r => r.no === no && r.data && r.row !== cur.row)) throw new Error('เลขที่ ' + no + ' ของปี ' + year + ' มีอยู่แล้ว');
      const blank = s.rows.filter(r => r.no === no && !r.data && r.row !== cur.row)[0];
      if (blank) sh.getRange(blank.row, 1).setValue(cur.no);   // สลับเลขกับแถวว่างที่เรียงเลขไว้ล่วงหน้า (เลขไม่ซ้ำ ไม่หาย)
      sh.getRange(cur.row, 1).setValue(no);
    }
    sbkWrite_(sh, cur.row, b, !b.date);
    SpreadsheetApp.flush();
    return sbkRecord_(year, { row: cur.row, no: no, v: [no, b.ref, b.date || cur.v[2], b.from, b.to, b.subject, b.action, b.note] }, tz, false);
  });
}
function sbkDelete(key, token) {
  const x = sbkUser_(token, true), book = sbkBook_(sbkUrl_(x.cfg)), year = +(key && key.year);
  if (!sbkYearOk_(year)) throw new Error('ไม่รู้จักปีของรายการ');
  return sbkLocked_(() => {
    const sh = sbkYearSheet_(book, year, false), s = sbkSheet_(sh), cur = s.ok ? sbkFind_(s.rows, key) : null;
    if (!cur) throw new Error('ไม่พบเลขที่ ' + (key && key.no) + ' ของปี ' + year + ' ในชีต (อาจถูกลบไปแล้ว) · กดรีเฟรช');
    sh.getRange(cur.row, 2, 1, SBK_HEAD.length - 1).clearContent();   // คงเลขไว้ในคอลัมน์แรก
    SpreadsheetApp.flush();
    return { year: year, no: cur.no };
  });
}
function sbkSetNext(year, next, token) {
  const x = sbkUser_(token, true), book = sbkBook_(sbkUrl_(x.cfg));
  year = +year; next = sbkNo_(next);
  if (!sbkYearOk_(year)) throw new Error('ปีไม่ถูกต้อง');
  if (!next) throw new Error('กรุณาใส่จำนวนเต็มบวก');
  return sbkLocked_(() => {
    const counters = sbkCounters_();
    counters[book.getId() + '|' + year] = next;
    propSave_(SBK_PROP, JSON.stringify(counters));
    const sh = book.getSheetByName(String(year)), s = sh ? sbkSheet_(sh) : { ok: true, rows: [] };
    return { year: year, next: sbkNext_(book.getId(), year, s.ok ? s.rows : [], counters) };
  });
}
// ตั้งค่า: ตรวจลิงก์ชีต (แอดมิน)
function sbkCheck(s, token) {
  const u = who_(token);
  if (!u.isAdmin && !subAll_(u)) throw new Error('ตรวจชีตของทะเบียนหนังสือส่งได้เฉพาะแอดมิน');
  const st = sbkRead_(sbkBook_(String((s && s.url) || '').trim())), years = Object.keys(st.nextNo).map(Number).sort((a, b) => b - a);
  return { title: st.title, years: years.map(y => ({ year: y, n: st.records.filter(r => r.year === y).length, next: st.nextNo[y] })), bad: st.bad };
}

/* ---------- HDR Activity (17 พ.ย.): ช่องกรอกหลังช่องค้นหา HN ในแถบนัดคิวใส่แร่ · อ่าน/บันทึกในชีตของเว็บ HDR Activity ----------
 * ตั้งค่า → นัดคิวใส่แร่ → HDR Activity (config.bq.hdr = { on, url, sheet, tol }) · ข้อมูลอยู่ที่ชีตของเว็บนั้นที่เดียว
 * แท็บ Record: A วันที่ · C Calculation (สูตร) · D %Diff (สูตร) · E Planning · F MP · G t (สูตร) · J2 Serial · K2:K5 Isotope, Acceptance date, A0, T½ · K6 e
 * บันทึกแบบ addRecord ของเว็บนั้น: แถวแรกที่คอลัมน์ A ว่าง · แถวนั้นยังไม่มีสูตร = คัดลอกสูตร C:D และ G จากแถวก่อนหน้า */
const HDR_FIRST_ROW = 2;
const hdrCfg_ = cfg => (cfg && cfg.bq && cfg.bq.hdr && typeof cfg.bq.hdr === 'object' ? cfg.bq.hdr : {});
function hdrSheet_(s) {
  s = s && typeof s === 'object' ? s : {};
  const book = extBook_(s, 'HDR Activity'), name = String(s.sheet || '').trim() || 'Record', sh = book.getSheetByName(name);
  if (!sh) throw new Error('ไม่พบแท็บ "' + name + '" ในชีตของ HDR Activity (' + book.getName() + ')');
  return sh;
}
function hdrRead_(sh) {
  const book = sh.getParent(), tz = book.getSpreadsheetTimeZone(), iso = d => Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  const num = v => (typeof v === 'number' && isFinite(v) ? v : null);
  const last = sh.getLastRow(), rows = last >= HDR_FIRST_ROW ? sh.getRange(HDR_FIRST_ROW, 1, last - HDR_FIRST_ROW + 1, 6).getValues() : [];
  const records = [];
  rows.forEach(r => { if (r[0] instanceof Date) records.push({ date: iso(r[0]), calc: num(r[2]), diff: num(r[3]), planning: num(r[4]), mp: String(r[5] || '') }); });
  const v = sh.getRange('J2:K6').getValues(), rule = sh.getRange('F2').getDataValidation();
  let mpList = [];
  if (rule && rule.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) mpList = (rule.getCriteriaValues()[0] || []).map(String).filter(String);
  if (!mpList.length) records.forEach(r => { if (r.mp && mpList.indexOf(r.mp) < 0) mpList.push(r.mp); });   // ไม่มีรายการในเซลล์ F2 = MP ที่เคยบันทึก
  return {
    title: book.getName(), tab: sh.getName(), rows: records.length, mpList: mpList, records: records.slice(-60),
    source: { serial: String(v[0][0] || ''), isotope: String(v[0][1] || ''), refDate: v[1][1] instanceof Date ? iso(v[1][1]) : '', a0: num(v[2][1]), halfLife: num(v[3][1]), e: num(v[4][1]) || Math.E },
  };
}
/** หน้าเว็บ: Source, รายชื่อ MP, บันทึกล่าสุด 60 แถว · s = ค่าที่กำลังตั้ง (แอดมินกดตรวจชีต) · null = ตามที่บันทึกไว้ */
function hdrGet(s, token) {
  const ss = ss_(), cfg = readConfig_(ss) || {}, u = who_(token, ss, cfg);
  if (s && typeof s === 'object') {
    if (!u.isAdmin && !subAll_(u)) throw new Error('ตรวจชีตของ HDR Activity ได้เฉพาะแอดมิน');
    return hdrRead_(hdrSheet_(s));
  }
  if (u.via !== 'google' && !userAccess_(cfg, 'bq', u)) throw new Error('ตำแหน่ง ' + (u.role || '-') + ' ไม่เห็นแถบนัดคิวใส่แร่');
  const h = hdrCfg_(cfg);
  if (!h.on) throw new Error('ยังไม่ได้เปิด HDR Activity (ตั้งค่า → นัดคิวใส่แร่)');
  return hdrRead_(hdrSheet_(h));
}
/** บันทึก Planning ของวันนั้นลงชีตของเว็บ HDR Activity (ผู้ที่บันทึกในแถบนัดคิวใส่แร่ได้) · คืนข้อมูลล่าสุดแบบ hdrGet */
function hdrAdd(dateIso, planning, mp, token) {
  requireEdit_(token, ['bq']);
  const h = hdrCfg_(readConfig_(ss_()) || {});
  if (!h.on) throw new Error('ยังไม่ได้เปิด HDR Activity (ตั้งค่า → นัดคิวใส่แร่)');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateIso))) throw new Error('วันที่ไม่ถูกต้อง');
  const value = Number(planning);
  if (!isFinite(value) || value <= 0) throw new Error('ค่า Planning ไม่ถูกต้อง');
  const sh = hdrSheet_(h), book = sh.getParent(), lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const maxRows = sh.getMaxRows(), n = maxRows - HDR_FIRST_ROW + 1, colA = n > 0 ? sh.getRange(HDR_FIRST_ROW, 1, n, 1).getValues() : [];
    let row = -1;
    for (let i = 0; i < colA.length; i++) if (colA[i][0] === '' || colA[i][0] === null) { row = HDR_FIRST_ROW + i; break; }
    if (row < 0) { sh.insertRowAfter(maxRows); row = maxRows + 1; }
    if (!sh.getRange(row, 3).getFormula() && row > HDR_FIRST_ROW) {   // แถวที่ยังไม่มีสูตร: คัดลอกสูตรจากแถวก่อนหน้า
      sh.getRange(row - 1, 3, 1, 2).copyTo(sh.getRange(row, 3, 1, 2));
      sh.getRange(row - 1, 7).copyTo(sh.getRange(row, 7));
    }
    sh.getRange(row, 1).setValue(Utilities.parseDate(String(dateIso), book.getSpreadsheetTimeZone(), 'yyyy-MM-dd'));
    sh.getRange(row, 5).setValue(value);
    sh.getRange(row, 6).setValue(String(mp || '').trim().slice(0, 40));
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return hdrRead_(sh);
}

// หัวคอลัมน์ที่น่าจะเป็นแต่ละคีย์ · แท็บที่ตรงมากสุด (ต้องมี รหัสนัด วันที่ HN MP)
function brachyGuess_(headers, keys) {
  const map = {}, used = {};
  keys = keys || BRACHY_KEYS;
  Object.keys(keys).forEach(k => {
    const names = keys[k].map(brachyNorm_);
    const h = headers.filter(x => !used[x] && brachyHeadKeys_(x).some(v => names.indexOf(v) >= 0))[0];
    if (h) { map[k] = h; used[h] = true; }
  });
  return map;
}
// แท็บในชีตของระบบอื่น · ระบบนั้นย้ายข้อมูลมาไว้ในชีตของระบบนี้ (ลิงก์เดียวกัน) = ไม่นับแท็บของระบบนี้ (BrachyQueue หัวคอลัมน์คล้ายแท็บนัดของระบบเดิม)
function brachyTabs_(book) {
  const own = book.getId() === ss_().getId() ? Object.keys(TABLES).map(k => TABLES[k].sheet).concat([CONFIG_SHEET]) : [];
  return book.getSheets().filter(sh => own.indexOf(sh.getName()) < 0)
    .map(sh => ({ name: sh.getName(), headers: headerOf_(sh).filter(Boolean).slice(0, 40), rows: Math.max(0, sh.getLastRow() - 1) }));
}
function brachyPick_(tabs, s, keys, enough) {
  const named = s && s.sheet ? tabs.filter(t => t.name === s.sheet)[0] : null;
  if (named) return named;
  let best = null, score = -1;
  enough = enough || (g => BRACHY_NEED.every(k => g[k]));
  tabs.forEach(t => {
    const g = brachyGuess_(t.headers, keys), n = Object.keys(g).length + (enough(g) ? 100 : 0);
    if (n > score) { best = t; score = n; }
  });
  return best;
}

// อ่านนัดทั้งหมดของแท็บที่เลือก [{ key, id, date, hn, name, technique, mp, rc, status, fx, totalFx }]
// soft = ตรวจชีต: คอลัมน์ที่ต้องมียังไม่ครบไม่ถือว่าผิด (คืน missing ให้แอดมินเลือกคอลัมน์)
function brachyRead_(book, s, soft) {
  const tabs = brachyTabs_(book), tab = brachyPick_(tabs, s);
  if (!tab) throw new Error('ไม่พบแท็บในชีตของระบบนัด');
  const map = Object.assign(brachyGuess_(tab.headers), s && s.map && typeof s.map === 'object' ? s.map : {});
  const miss = BRACHY_NEED.filter(k => !map[k] || tab.headers.indexOf(map[k]) < 0);
  if (miss.length && soft) return { tab: tab, map: map, tabs: tabs, rows: [], missing: miss };
  if (miss.length) throw new Error('ยังไม่ได้เลือกคอลัมน์ ' + miss.map(k => BRACHY_LABEL[k]).join(', ') + ' ของแท็บ ' + tab.name + ' · ตั้งค่า → Brachytherapy จากระบบนัด → ตรวจชีต แล้วเลือกคอลัมน์');
  const sh = sheet_(book, tab.name), tz = tz_(book);
  const last = sh.getLastRow(), width = sh.getLastColumn();
  const values = last > 1 ? sh.getRange(1, 1, last, width).getValues() : [];
  const header = (values.shift() || []).map(v => String(v).trim());
  const col = {};
  Object.keys(BRACHY_KEYS).forEach(k => { col[k] = map[k] ? header.indexOf(map[k]) : -1; });
  const rows = values.map(r => {
    const o = {};
    Object.keys(col).forEach(k => { o[k] = col[k] < 0 ? '' : cellText_(r[col[k]], tz); });
    o.date = brachyDate_(o.date);
    o.hn = String(o.hn).replace(/\.0$/, '');
    o.key = o.id || (o.hn && o.date ? o.hn + '|' + o.date + '|' + o.fx : '');
    return o;
  }).filter(o => o.key);
  return { tab: tab, map: map, tabs: tabs, rows: rows, missing: [] };
}

// วันที่ของระบบนัด: วันที่ของชีต (yyyy-MM-dd) หรือข้อความ d/M/yyyy (ปี พ.ศ. ได้)
function brachyDate_(v) {
  const t = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) return t;
  const y = +m[3] > 2400 ? +m[3] - 543 : +m[3];
  return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
}

// จับคู่คนจากระบบอื่นกับทีมนักฟิสิกส์ · ยึดชื่อผู้ใช้ RO Workspace เป็นหลัก: ชื่อผู้ใช้ → อีเมล → รหัส → ชื่อ-สกุล
// uname = ชื่อผู้ใช้ที่มากับรายการ (ถ้ามี): จับคู่ด้วยชื่อ-สกุลได้เฉพาะคนที่ยังไม่เชื่อมบัญชี หรือเชื่อมบัญชีเดียวกัน
function brachyStaff_(cfg) {
  const staff = Array.isArray(cfg && cfg.staff) && cfg.staff.length ? cfg.staff : DEFAULT_STAFF.map(code => ({ code: code }));
  const key = v => String(v || '').trim().replace(/^(นางสาว|นาง|นาย|น\.ส\.|ดร\.|นพ\.|พญ\.)/, '').replace(/\s+/g, '').toLowerCase();
  // ชื่อสะกดต่างกันแค่สระบน-ล่าง วรรณยุกต์ การันต์ (เช่น พันธุ์ / พันธ์) = คนเดียวกัน ถ้าตรงกับนักฟิสิกส์คนเดียวเท่านั้น
  const loose = v => key(v).replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '');
  const low = v => String(v || '').trim().toLowerCase();
  return (v, uname) => {
    const t = String(v || '').trim(), l = low(t), u = low(uname);
    if (!t) return '';
    const one = list => (list.length === 1 ? list[0] : null);
    const byName = x => !u || !x.user || low(x.user) === u;
    const hit = staff.filter(x => x.user && low(x.user) === l)[0]
      || staff.filter(x => x.email && low(x.email) === l)[0]
      || staff.filter(x => String(x.code || '').toUpperCase() === t.toUpperCase())[0]
      || one(staff.filter(x => x.name && byName(x) && key(x.name) === key(t)))
      || (loose(t).length >= 4 ? one(staff.filter(x => x.name && byName(x) && loose(x.name) === loose(t))) : null);
    return hit ? String(hit.code).toUpperCase() : '';
  };
}

// รายการกิจกรรมที่ควรมี { src: rec } และสรุป (นัดที่นับ, MP/RC ที่ไม่รู้จัก)
function brachyWanted_(rows, s, cfg) {
  const want = {}, unknown = {}, staffOf = brachyStaff_(cfg), acts = cfg && cfg.acts;
  const needleOn = !acts || !!acts.brachyn;
  const label = k => (acts && acts[k] && acts[k].label) || (k === 'brachyn' ? 'Brachy เสียบเข็ม' : 'Brachy 3D');
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(s.from || '')) ? s.from : '';
  let counted = 0;
  rows.forEach(r => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || (from && r.date < from)) return;
    const st = String(r.status).trim();
    if (st === BRACHY_ST_CANCEL || st === BQ_NOSHOW || st === BQ_PP || (s.count === 'done' && st !== BRACHY_ST_DONE)) return;   // ยกเลิก / ไม่มา / เลื่อนนัดไม่มีกำหนด ไม่นับ
    counted++;
    const mp = staffOf(r.mp), rc = staffOf(r.rc);
    if (r.mp && !mp) unknown[r.mp] = (unknown[r.mp] || 0) + 1;
    if (r.rc && !rc) unknown[r.rc] = (unknown[r.rc] || 0) + 1;
    const kind = needleOn && BRACHY_NEEDLE.test(String(r.technique).trim()) ? 'brachyn' : 'brachy';
    const fx = r.fx ? 'Fx ' + r.fx + (r.totalFx ? '/' + r.totalFx : '') : '';
    const note = [fx, r.technique, 'ระบบนัด Brachytherapy'].filter(Boolean).join(' · ');
    const base = { date: r.date, hn: r.hn, name: r.name, note: note };
    if (mp) want['brachy:' + r.key + ':plan'] = Object.assign({ kind: kind, mp: mp, title: '' }, base);
    if (rc && mp && rc !== mp) want['brachy:' + r.key + ':rc'] = Object.assign({ kind: 'rc', mp: rc, title: label(kind) + ' ของ ' + mp }, base);
  });
  return { want: want, unknown: unknown, counted: counted, from: from };
}

// ระบบอื่นที่ดึงมาบันทึก: Brachytherapy (ระบบนัด) · RC จาก TDF Dose Calculator · src ของรายการขึ้นต้นด้วยคีย์
const EXT = {
  brachy: { cfg: 'brachySync', prop: 'BRACHY_SYNC', what: 'ระบบนัด Brachytherapy', read: (b, s, soft) => (s.src === 'internal' ? bqRows_(ss_()) : brachyRead_(b, s, soft)), wanted: (r, s, c) => brachyWanted_(r, s, c) },
  tdf: { cfg: 'tdfSync', prop: 'TDF_SYNC', what: 'TDF Dose Calculator', read: (b, s, soft) => tdfRead_(b, s, soft), wanted: (r, s, c) => tdfWanted_(r, s, c) },
};

// ดึงและบันทึก · คืนสรุปที่เก็บไว้ใน Script property (BRACHY_SYNC, TDF_SYNC)
function brachySync_(ss, cfg, why) { return extSync_(ss, cfg, 'brachy', why); }
function extSync_(ss, cfg, key, why) {
  const x = EXT[key], s = (cfg && cfg[x.cfg]) || {};
  const res = { at: new Date().toISOString(), why: why || '', ok: false, added: 0, updated: 0, removed: 0, manual: 0, counted: 0, unknown: {}, tab: '', error: '' };
  try {
    const book = key === 'brachy' && s.src === 'internal' ? null : extBook_(s, x.what), got = x.read(book, s), w = x.wanted(got.rows, s, cfg);
    Object.assign(res, { tab: got.tab.name, counted: w.counted, unknown: w.unknown });
    if (w.self) res.self = w.self;
    withLock_(() => {
      const sh = tableSheet_(ss, 'logs'), header = headerOf_(sh), fields = TABLES.logs.fields;
      const logs = readTable_(ss, 'logs');
      const mine = {}, manual = [];
      logs.forEach(l => { if (String(l.src).indexOf(key + ':') === 0) mine[l.src] = l; else if (!l.src) manual.push(l); });
      const same = (a, b) => ['kind', 'mp', 'date', 'hn', 'name', 'title', 'note'].every(k => String(a[k] || '') === String(b[k] || ''));
      const isDup = r => manual.some(l => l.date === r.date && l.hn === r.hn && l.mp === r.mp && (r.kind === 'rc' ? l.kind === 'rc' : l.kind === 'brachy' || l.kind === 'brachyn'));
      const now = new Date().toISOString();
      // แก้รายการเดิม
      Object.keys(mine).forEach(k => {
        const r = w.want[k];
        if (!r || same(mine[k], r)) return;
        const row = findRow_(sh, header.indexOf('id') + 1, mine[k].id);
        if (row) { writeFields_(sh, row, header, fields, Object.assign({}, mine[k], r, { updated: now })); res.updated++; }
      });
      // ลบ: นัดถูกยกเลิก เปลี่ยนเป็นไม่นับ หรือหายไป (เฉพาะวันที่ตั้งแต่ "ดึงตั้งแต่")
      const drop = Object.keys(mine).filter(k => !w.want[k] && (!w.from || mine[k].date >= w.from)).map(k => findRow_(sh, header.indexOf('id') + 1, mine[k].id)).filter(Boolean).sort((a, b) => b - a);
      drop.forEach(r => delRow_(sh, r));
      res.removed = drop.length;
      // เพิ่มใหม่ (ทีละชุด)
      const add = [];
      Object.keys(w.want).forEach(k => {
        if (mine[k]) return;
        const r = w.want[k];
        if (isDup(r)) { res.manual++; return; }
        add.push(Object.assign({ id: Utilities.getUuid(), caseId: '', min: '', k: '', created: now, updated: '', src: k, rev: now }, r));
      });
      if (add.length) {
        const cols = header.map(h => fields.filter(f => f[1] === h)[0]);
        sh.getRange(sh.getLastRow() + 1, 1, add.length, header.length).setNumberFormat('@')
          .setValues(add.map(rec => cols.map(f => (f ? safeText_(rec[f[0]]) : ''))));
      }
      res.added = add.length;
    });
    res.ok = true;
  } catch (e) { res.error = e.message; }
  try { propSave_(x.prop, JSON.stringify(res).slice(0, 8000)); } catch (e) { /* เก็บสรุปไม่ได้: ครั้งหน้าดึงใหม่ */ }
  return res;
}
function extStatus_(key) {
  try { return JSON.parse(propRead_(EXT[key].prop) || 'null'); } catch (e) { return null; }
}
function brachyStatus_() { return extStatus_('brachy'); }

/**
 * แอดมิน: ตรวจชีตของระบบนัดด้วยค่าที่กำลังตั้ง (ยังไม่บันทึก) · ไม่เขียนอะไร
 * { title, tabs: [{ name, headers, rows }], tab, map, preview: { rows, counted, plan, rc, needle, statuses, unknown, first, last } }
 */
function brachyCheck(s, token) {
  const u = who_(token);
  if (!u.isAdmin) throw new Error('ตั้งค่าการดึง Brachytherapy ได้เฉพาะแอดมิน');
  s = s && typeof s === 'object' ? s : {};
  const inside = s.src === 'internal', book = inside ? null : brachyBook_(s), got = inside ? bqRows_(ss_()) : brachyRead_(book, s, true), w = brachyWanted_(got.rows, s, readConfig_(ss_()) || {});
  const statuses = {}, techniques = {}, keys = Object.keys(w.want);
  got.rows.forEach(r => {
    const k = String(r.status).trim() || '(ว่าง)', t = String(r.technique).trim() || '(ว่าง)';
    statuses[k] = (statuses[k] || 0) + 1;
    techniques[t] = (techniques[t] || 0) + 1;
  });
  const dates = got.rows.map(r => r.date).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  return {
    title: inside ? 'แถบนัดคิวใส่แร่ (ระบบนี้)' : book.getName(), tabs: got.tabs, tab: got.tab.name, map: got.map, missing: got.missing,
    preview: got.missing.length ? null : {
      rows: got.rows.length, counted: w.counted, statuses: statuses, techniques: techniques, unknown: w.unknown, first: dates[0] || '', last: dates[dates.length - 1] || '',
      plan: keys.filter(k => /:plan$/.test(k)).length, rc: keys.filter(k => /:rc$/.test(k)).length, needle: keys.filter(k => w.want[k].kind === 'brachyn').length,
    },
  };
}

// หน้าเว็บเรียกตอนเปิด: ดึงเมื่อครั้งล่าสุดเกิน BRACHY_EVERY_MIN นาที (force = ปุ่มดึงตอนนี้ของแอดมิน) · คืนสรุปล่าสุด
function brachyPull(force, token) { return extPull_('brachy', force, token); }
function tdfPull(force, token) { return extPull_('tdf', force, token); }
function extPull_(key, force, token) {
  const u = who_(token), x = EXT[key];
  if (force && !u.isAdmin) throw new Error('ดึงตอนนี้ได้เฉพาะแอดมิน');
  const ss = ss_(), cfg = readConfig_(ss) || {};
  if (!cfg[x.cfg] || !cfg[x.cfg].on) return extStatus_(key);
  const last = extStatus_(key);
  if (!force && last && Date.now() - new Date(last.at).getTime() < BRACHY_EVERY_MIN * 60000) return last;
  const cache = CacheService.getScriptCache();
  if (!force && cache.get(key + '_busy')) return last;
  cache.put(key + '_busy', '1', 120);
  try { return extSync_(ss, cfg, key, force ? 'ดึงตอนนี้ (' + (u.name || u.username || u.me || '') + ')' : 'เปิดหน้าเว็บ'); } finally { cache.remove(key + '_busy'); }
}

// ตัวตั้งเวลาของ Apps Script (เจ้าของสร้างเอง: Triggers → Add Trigger → brachyTick → Time-driven ทุก 10 นาที) ดึงแม้ไม่มีใครเปิดหน้าเว็บ
// ดึงทุกระบบที่เปิดไว้ (Brachytherapy และ RC จาก TDF)
// API 140 (25 พ.ย.): คำสั่งตั้งระบบและตัวตั้งเวลา ทำงานได้เฉพาะ (1) ตัวตั้งเวลาของโปรเจกต์นี้ (e.triggerUid ตรงกับทริกเกอร์จริง)
// หรือ (2) เจ้าของกด Run ในหน้า Apps Script · เรียกผ่านหน้าเว็บ (google.script.run) ไม่ได้: คนที่มีลิงก์ระบบสั่งสำรอง / ดึงข้อมูล / อ่านข้อมูลการติดตั้งเองไม่ได้
function ownerRun_(e) {
  const uid = e && typeof e === 'object' && e.triggerUid ? String(e.triggerUid) : '';
  if (uid) { try { if (ScriptApp.getProjectTriggers().some(t => String(t.getUniqueId()) === uid)) return true; } catch (x) { /* ตรวจด้วยบัญชีแทน */ } }
  let me = '', owner = '';
  try { me = String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (x) { me = ''; }
  try { owner = String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (x) { owner = ''; }
  if (me && me === owner) return true;
  throw new Error('คำสั่งนี้ใช้ได้เฉพาะเจ้าของระบบ (กด Run ในหน้า Apps Script) หรือตัวตั้งเวลา');
}
function brachyTick(e) {
  ownerRun_(e);   // API 140
  const ss = ss_(), cfg = readConfig_(ss) || {};
  Object.keys(EXT).forEach(k => { if (cfg[EXT[k].cfg] && cfg[EXT[k].cfg].on) extSync_(ss, cfg, k, 'ตั้งเวลา'); });
  if (cfg.reg && cfg.reg.drive && cfg.reg.drive.on) regDriveSync_(ss, cfg, false, 'ตั้งเวลา');   // ผู้ป่วยจากโฟลเดอร์ Google Drive (ตามรอบที่ตั้ง)
  if (cfg.appt && cfg.appt.spq && cfg.appt.spq.on && cfg.appt.spq.url) spqSync_(ss, cfg, 'ตั้งเวลา');   // นัดจากระบบนัดคิวเทคนิคพิเศษ
  try { regArchive_(ss, cfg, false); } catch (e) { /* ครั้งหน้า */ }   // ผู้ป่วยเก่า → ที่เก็บถาวร (วันละครั้ง)
}
// ตัวตั้งเวลาเฉพาะการดึงผู้ป่วยจากโฟลเดอร์ Google Drive (ไม่ได้ตั้ง brachyTick ไว้) · Triggers → Add Trigger → regDriveTick → Time-driven
function regDriveTick(e) {
  ownerRun_(e);   // API 140
  const ss = ss_(), cfg = readConfig_(ss) || {};
  if (cfg.reg && cfg.reg.drive && cfg.reg.drive.on) regDriveSync_(ss, cfg, false, 'ตั้งเวลา');
}

/* ---------- นำเข้านัดจากระบบนัดคิวเทคนิคพิเศษ (ตั้งค่า → ลงนัด: config.appt.spq = { on, url }) ---------- */
// อ่านแท็บ "นัดเทคนิคพิเศษ" ของระบบนั้น (หัวคอลัมน์ภาษาไทยตายตัว) → แท็บ SpecialQueue ของระบบนี้ เฉพาะนัดที่ HN มีในระบบแล้ว (ลงทะเบียน นัด CT-SIM เคส ฯลฯ)
// ไม่แก้ข้อมูลเดิม: หน้าเว็บจับคู่กับนัด / รายการ CT-SIM / เคสด้วย HN และช่วงวันฉาย · นับเป็นเทคนิคพิเศษ และวันทำ CBCT นับเป็นผู้ป่วยใหม่ในปฏิทิน Start RT
const SPQ_KEYS = {
  id: ['id'],
  hn: ['hn'],
  tech: ['เทคนิค', 'technique'],
  other: ['เทคนิคอื่นๆ', 'techniqueother'],
  site: ['ตำแหน่งที่ฉาย', 'site'],
  fx: ['จำนวนครั้ง', 'fractions'],
  freq: ['ความถี่ในการฉาย', 'frequency'],
  start: ['วันเริ่มฉายรังสี', 'startdate'],
  end: ['วันสิ้นสุดการฉาย', 'enddate'],
  dates: ['วันฉายทั้งหมด', 'treatmentdates'],
  cbct: ['วัน CBCT ระหว่างฉาย', 'cbctdates'],
  verify: ['วันทำ CBCT ก่อนเริ่มฉาย', 'verifydate'],
  pattern: ['รูปแบบ CBCT ระหว่างฉาย', 'cbctpattern'],
};
const SPQ_NEED = ['hn', 'start'];
const SPQ_LABEL = { hn: 'HN', start: 'วันเริ่มฉายรังสี' };
const SPQ_TAB = 'นัดเทคนิคพิเศษ';
const SPQ_PROP = 'SPQ_SYNC';
const SPQ_KEEP_DAYS = 120;   // นัดที่ฉายจบนานกว่านี้ไม่นำเข้า
const strHash_ = t => { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0; return h.toString(36) + '.' + t.length; };
const spqBook_ = s => extBook_(s, 'ระบบนัดคิวเทคนิคพิเศษ');

// นัดทั้งหมดของแท็บ [{ id, hn, tech, site, fx, freq, start, end, cbct: [วัน], pattern }] · soft = ตรวจชีต (คอลัมน์ไม่ครบคืน missing)
function spqRead_(book, soft) {
  const tabs = brachyTabs_(book), tab = tabs.filter(t => t.name === SPQ_TAB)[0] || brachyPick_(tabs, null, SPQ_KEYS, g => SPQ_NEED.every(k => g[k]));
  if (!tab) throw new Error('ไม่พบแท็บในชีตของระบบนัดคิวเทคนิคพิเศษ');
  const map = brachyGuess_(tab.headers, SPQ_KEYS), miss = SPQ_NEED.filter(k => !map[k]);
  if (miss.length && soft) return { tab: tab, tabs: tabs, map: map, rows: [], missing: miss.map(k => SPQ_LABEL[k]) };
  if (miss.length) throw new Error('แท็บ ' + tab.name + ' ไม่มีคอลัมน์ ' + miss.map(k => SPQ_LABEL[k]).join(', ') + ' · ต้องเป็นชีตของระบบนัดคิวเทคนิคพิเศษ');
  const sh = sheet_(book, tab.name), tz = tz_(book), last = sh.getLastRow(), width = sh.getLastColumn();
  const values = last > 1 ? sh.getRange(1, 1, last, width).getValues() : [];
  const header = (values.shift() || []).map(v => String(v).trim()), col = {};
  Object.keys(SPQ_KEYS).forEach(k => { col[k] = map[k] ? header.indexOf(map[k]) : -1; });
  const isDay = v => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const list = v => String(v || '').split(/[,\s]+/).map(brachyDate_).filter(isDay);
  const uniq = a => a.filter((x, i) => a.indexOf(x) === i).sort();
  const rows = values.map(r => {
    const g = k => (col[k] < 0 ? '' : cellText_(r[col[k]], tz));
    const dates = uniq(list(g('dates'))), start = isDay(brachyDate_(g('start'))) ? brachyDate_(g('start')) : dates[0] || '';
    const end0 = isDay(brachyDate_(g('end'))) ? brachyDate_(g('end')) : dates[dates.length - 1] || start;
    const tech = String(g('tech')).trim(), other = String(g('other')).trim(), hn = String(g('hn')).replace(/\.0$/, '').trim();
    return { id: String(g('id')).trim() || hn + '|' + start, hn: hn, tech: tech === 'อื่นๆ' && other ? other : tech, site: g('site'), fx: g('fx'), freq: g('freq'),
      start: start, end: end0 < start ? start : end0, cbct: uniq(list(g('cbct')).concat(list(g('verify')))), pattern: g('pattern') };
  }).filter(o => o.hn && isDay(o.start));
  return { tab: tab, tabs: tabs, map: map, rows: rows, missing: [] };
}
// นัดที่นำเข้า: HN มีในระบบ (seen = hnSeen_) และยังฉายไม่จบเกิน SPQ_KEEP_DAYS วัน · รหัสซ้ำ = ต่อท้าย +
function spqWanted_(rows, seen) {
  const from = new Date(Date.now() - SPQ_KEEP_DAYS * 864e5).toISOString().slice(0, 10), keep = [], ids = {};
  let unmatched = 0, old = 0;
  rows.forEach(r => {
    if (r.end < from) { old++; return; }
    if (!seen[hnLoose_(r.hn)]) { unmatched++; return; }
    let id = r.id;
    while (ids[id]) id += '+';
    ids[id] = true;
    keep.push({ id: id, hn: r.hn, tech: r.tech, site: r.site, fx: r.fx, freq: r.freq, start: r.start, end: r.end, cbct: r.cbct.join(', '), pattern: r.pattern });
  });
  return { keep: keep, unmatched: unmatched, old: old };
}
function spqStatus_() {
  try { return JSON.parse(propRead_(SPQ_PROP) || 'null'); } catch (e) { return null; }
}
// ดึงและเขียนแท็บ SpecialQueue (เขียนเมื่อข้อมูลเปลี่ยน) · คืนสรุป { at, why, ok, rows, matched, unmatched, old, tab, sig, error } (เก็บใน Script property SPQ_SYNC)
function spqSync_(ss, cfg, why) {
  const s = (cfg && cfg.appt && cfg.appt.spq) || {}, prev = spqStatus_() || {};
  const res = { at: new Date().toISOString(), why: why || '', ok: false, rows: 0, matched: 0, unmatched: 0, old: 0, tab: '', sig: prev.sig || '', error: '' };
  try {
    const got = spqRead_(spqBook_(s), false), w = spqWanted_(got.rows, hnSeen_(ss)), sig = strHash_(JSON.stringify(w.keep));
    Object.assign(res, { tab: got.tab.name, rows: got.rows.length, matched: w.keep.length, unmatched: w.unmatched, old: w.old, sig: sig });
    if (sig !== prev.sig || !sheet_(ss, TABLES.spq.sheet)) {
      withLock_(() => {
        const sh = tableSheet_(ss, 'spq'), header = headerOf_(sh), fields = TABLES.spq.fields, cols = header.map(h => fields.filter(f => f[1] === h)[0]), last = sh.getLastRow();
        if (last > 1) sh.getRange(2, 1, last - 1, header.length).clearContent();
        if (w.keep.length) sh.getRange(2, 1, w.keep.length, header.length).setNumberFormat('@').setValues(w.keep.map(r => cols.map(f => (f ? safeText_(r[f[0]]) : ''))));
      });
    }
    res.ok = true;
  } catch (e) { res.error = String(e.message || e).slice(0, 400); }
  try { propSave_(SPQ_PROP, JSON.stringify(res)); } catch (e) { /* เก็บสรุปไม่ได้: ครั้งหน้าดึงใหม่ */ }
  return res;
}
// แอดมิน (หรือแอดมินรองหมวดแถบ): ตรวจชีตด้วยค่าที่กำลังตั้ง (ยังไม่บันทึก) · ไม่เขียนอะไร · ไม่ส่ง HN หรือชื่อผู้ป่วย
function spqCheck(s, token) {
  const u = who_(token);
  if (!u.isAdmin && !(u.sub && u.sub.indexOf('tabs') >= 0)) throw new Error('ตั้งค่าการนำเข้านัดเทคนิคพิเศษได้เฉพาะแอดมิน');
  s = s && typeof s === 'object' ? s : {};
  const book = spqBook_(s), got = spqRead_(book, true), out = { title: book.getName(), tab: got.tab.name, missing: got.missing, preview: null };
  if (got.missing.length) return out;
  const w = spqWanted_(got.rows, hnSeen_(ss_())), techs = {}, starts = got.rows.map(r => r.start).sort();
  got.rows.forEach(r => { const t = r.tech || '(ว่าง)'; techs[t] = (techs[t] || 0) + 1; });
  out.preview = { rows: got.rows.length, matched: w.keep.length, unmatched: w.unmatched, old: w.old, techs: techs, first: starts[0] || '', last: starts[starts.length - 1] || '',
    cbct: w.keep.reduce((n, r) => n + (r.cbct ? r.cbct.split(', ').length : 0), 0) };
  return out;
}
// หน้าเว็บเรียกตอนเปิด: ดึงเมื่อครั้งล่าสุดเกิน 10 นาที · force = ปุ่มดึงตอนนี้ (แอดมิน / แอดมินรองหมวดแถบ) · คืนสรุปล่าสุด
function spqPull(force, token) {
  const u = who_(token);
  if (force && !u.isAdmin && !(u.sub && u.sub.indexOf('tabs') >= 0)) throw new Error('ดึงตอนนี้ได้เฉพาะแอดมิน');
  const ss = ss_(), cfg = readConfig_(ss) || {}, s = (cfg.appt && cfg.appt.spq) || {};
  if (!s.url) { if (force) throw new Error('ยังไม่ได้ใส่ลิงก์ชีตของระบบนัดคิวเทคนิคพิเศษ (ตั้งค่า → ลงนัด) · ใส่ลิงก์แล้วกดบันทึกการตั้งค่าก่อน'); return spqStatus_(); }
  const last = spqStatus_();
  if (!force && (!s.on || (last && Date.now() - new Date(last.at).getTime() < BRACHY_EVERY_MIN * 60000))) return last;
  const cache = CacheService.getScriptCache();
  if (!force && cache.get('spq_busy')) return last;
  cache.put('spq_busy', '1', 120);
  try { return spqSync_(ss, cfg, force ? 'ดึงตอนนี้ (' + (u.name || u.username || u.me || '') + ')' : 'เปิดหน้าเว็บ'); } finally { cache.remove('spq_busy'); }
}

/* ---------- RC จาก TDF Dose Calculator (อ่าน Google Sheet ของระบบนั้นโดยตรง) ---------- */
// ตั้งค่า → RC จาก TDF Dose Calculator (config.tdfSync): { on, url, sheet, map, count: 'approved' | 'reviewed', from }
// ผลคำนวณที่มีคน Recheck (approved · 'reviewed' = รวมไม่ผ่าน) = RC ของคน Recheck: "TDF <ประเภท> ของ <คนคำนวณ>" HN ชื่อผู้ป่วย วันที่ Recheck
// และ RC ของคนคำนวณ (แต้ม RC เท่ากัน): "TDF <ประเภท> ที่คำนวณเอง · Recheck โดย <คน Recheck>" · คนคำนวณ Recheck เอง = ไม่นับทั้งคู่
// ชีตเก็บเป็นคอลัมน์ หรือเก็บทั้งรายการเป็น JSON ในช่องเดียว ({ id, at, status, type, calc, review, patient }) ก็อ่านได้
const TDF_KEYS = {
  id: ['id', 'recordid', 'รหัส'],
  json: ['json', 'data', 'record', 'payload', 'ข้อมูล', 'rec'],
  date: ['at', 'date', 'created', 'createdat', 'วันที่', 'วันที่คำนวณ'],
  reviewAt: ['reviewat', 'recheckat', 'reviewedat', 'วันที่recheck', 'วันที่ตรวจ'],
  status: ['status', 'สถานะ'],
  type: ['type', 'ประเภท', 'ชนิด'],
  calc: ['calc', 'calcby', 'calculator', 'calcname', 'calcusername', 'คนคำนวณ', 'ผู้คำนวณ'],
  rc: ['review', 'reviewer', 'reviewby', 'reviewname', 'reviewusername', 'recheck', 'recheckby', 'rc', 'ผู้ตรวจ', 'คนตรวจ', 'ผู้recheck', 'คนrecheck'],
  hn: ['hn', 'patienthn'],
  name: ['name', 'patientname', 'ชื่อ', 'ชื่อผู้ป่วย', 'ชื่อสกุล'],
};
const TDF_TYPE = { frac: 'Fractionated', gap: 'Treatment gap', brachy: 'Brachytherapy' };
const TDF_LABEL = { json: 'ข้อมูล (JSON)', date: 'วันที่', hn: 'HN', rc: 'คน Recheck (RC)' };
// วันที่: วันที่ของชีต · เวลาเป็นมิลลิวินาที (Date.now()) · ISO · d/M/yyyy
function extDay_(v, tz) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v) ? '' : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const t = String(v).trim();
  if (typeof v === 'number' || /^\d{11,13}$/.test(t)) return +t > 1e11 ? Utilities.formatDate(new Date(+t), tz, 'yyyy-MM-dd') : '';
  if (/^\d{4}-\d{2}-\d{2}T/.test(t)) { const d = new Date(t); return isNaN(d) ? t.slice(0, 10) : Utilities.formatDate(d, tz, 'yyyy-MM-dd'); }
  return brachyDate_(t);
}
const extObj_ = v => {
  if (v && typeof v === 'object' && Object.prototype.toString.call(v) !== '[object Date]') return v;
  const t = String(v || '').trim();
  if (t.charAt(0) === '{') { try { const o = JSON.parse(t); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } }
  return null;
};
// คน (คนคำนวณ / คน Recheck): { username, name } หรือข้อความ → [ชื่อผู้ใช้, ชื่อ, อีเมล] ที่ใช้จับคู่กับทีม
const extWho_ = v => { const o = extObj_(v); return o ? [o.username, o.name, o.email].map(x => String(x || '').trim()).filter(Boolean) : (String(v || '').trim() ? [String(v).trim()] : []); };

function tdfRead_(book, s, soft) {
  const tabs = brachyTabs_(book);
  const tab = brachyPick_(tabs, s, TDF_KEYS, g => !!g.json || (!!g.rc && !!g.hn));
  if (!tab) throw new Error('ไม่พบแท็บในชีตของ TDF Dose Calculator');
  const sh = sheet_(book, tab.name), tz = tz_(book);
  const last = sh.getLastRow(), width = sh.getLastColumn();
  const values = last > 1 ? sh.getRange(1, 1, last, width).getValues() : [];
  const header = (values.shift() || []).map(v => String(v).trim());
  const map = Object.assign(brachyGuess_(tab.headers, TDF_KEYS), s && s.map && typeof s.map === 'object' ? s.map : {});
  // ไม่มีหัวคอลัมน์ JSON: ดูช่องในแถวแรกที่เป็น JSON ของรายการ (มี calc / review / patient)
  if (!(s && s.map && 'json' in s.map) && !map.json && values.length) {
    const j = header.filter((h, i) => { const o = extObj_(values[0][i]); return !!o && ('calc' in o || 'review' in o || 'patient' in o); })[0];
    if (j) map.json = j;
  }
  const has = k => !!map[k] && header.indexOf(map[k]) >= 0;
  const miss = has('json') ? [] : ['date', 'hn', 'rc'].filter(k => (k === 'date' ? !has('date') && !has('reviewAt') : !has(k)));
  if (miss.length && soft) return { tab: tab, map: map, tabs: tabs, rows: [], missing: miss };
  if (miss.length) throw new Error('ยังไม่ได้เลือกคอลัมน์ ' + miss.map(k => TDF_LABEL[k]).join(', ') + ' ของแท็บ ' + tab.name + ' · ตั้งค่า → RC จาก TDF Dose Calculator → ตรวจชีต แล้วเลือกคอลัมน์');
  const col = {};
  Object.keys(TDF_KEYS).forEach(k => { col[k] = has(k) ? header.indexOf(map[k]) : -1; });
  const rows = values.map(r => {
    const c = k => (col[k] >= 0 ? r[col[k]] : '');
    const j = extObj_(c('json')) || {}, p = extObj_(j.patient) || {};
    const ca = j.calc || c('calc'), rv = j.review || c('rc'), rvo = extObj_(rv) || {};
    const o = {
      id: String(j.id || cellText_(c('id'), tz) || '').trim(),
      status: String(j.status || cellText_(c('status'), tz) || '').trim(),
      type: String(j.type || cellText_(c('type'), tz) || '').trim(),
      calc: extWho_(ca), rc: extWho_(rv), rcRaw: rv, calcUser: String((extObj_(ca) || {}).username || '').trim(), rcUser: String(rvo.username || '').trim(),
      calcName: String((extObj_(ca) || {}).name || (extObj_(ca) ? '' : cellText_(ca, tz)) || '').trim(),
      hn: String(p.hn || cellText_(c('hn'), tz) || '').replace(/\.0$/, '').trim(),
      name: String(p.name || p.fullName || cellText_(c('name'), tz) || '').trim(),
      date: extDay_(rvo.at || c('reviewAt') || j.at || c('date'), tz),
    };
    o.key = o.id || (o.hn && o.date ? o.hn + '|' + o.date : '');
    return o;
  }).filter(o => o.key);
  return { tab: tab, map: map, tabs: tabs, rows: rows, missing: [] };
}

function tdfWanted_(rows, s, cfg) {
  const want = {}, unknown = {}, staffOf = brachyStaff_(cfg);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(s.from || '')) ? s.from : '';
  const code = (list, uname) => list.map(v => staffOf(v, uname)).filter(Boolean)[0] || '';   // ชื่อผู้ใช้ก่อน แล้วชื่อ-สกุล อีเมล
  let counted = 0, self = 0;
  rows.forEach(r => {
    const st = r.status.toLowerCase();
    const counts = st === 'approved' || (s.count === 'reviewed' && st === 'rejected') || (!st && r.rc.length > 0);
    if (!counts || !r.rc.length || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || (from && r.date < from)) return;
    counted++;
    const rc = code(r.rc, r.rcUser), calc = code(r.calc, r.calcUser), miss = list => { const k = list.slice().reverse().join(' / '); unknown[k] = (unknown[k] || 0) + 1; };
    if (calc && calc === rc) { self++; return; }   // คนคำนวณ Recheck เอง: ไม่นับเป็น RC
    if (!rc) miss(r.rc);
    if (r.calc.length && !calc) miss(r.calc);
    const typ = ['TDF', TDF_TYPE[r.type] || r.type].filter(Boolean).join(' ');
    const rec = (mp, title) => ({ kind: 'rc', mp: mp, date: r.date, hn: r.hn, name: r.name, title: title, note: 'TDF Dose Calculator' + (st === 'rejected' ? ' · Recheck ไม่ผ่าน' : '') });
    const rcName = (extObj_(r.rcRaw) || {}).name || r.rc[r.rc.length - 1] || '?';
    if (rc) want['tdf:' + r.key + ':rc'] = rec(rc, typ + ' ของ ' + (calc || r.calcName || r.calc[0] || '?'));
    if (calc) want['tdf:' + r.key + ':calc'] = rec(calc, typ + ' ที่คำนวณเอง · Recheck โดย ' + (rc || rcName));
  });
  return { want: want, unknown: unknown, counted: counted, from: from, self: self };
}

/**
 * แอดมิน: ตรวจชีตของ TDF Dose Calculator ด้วยค่าที่กำลังตั้ง · ไม่เขียนอะไร
 * { title, tabs, tab, map, missing, preview: { rows, counted, rc, calc, self, statuses, types, unknown, first, last } }
 */
function tdfCheck(s, token) {
  const u = who_(token);
  if (!u.isAdmin) throw new Error('ตั้งค่าการดึง RC จาก TDF ได้เฉพาะแอดมิน');
  s = s && typeof s === 'object' ? s : {};
  const book = extBook_(s, EXT.tdf.what), got = tdfRead_(book, s, true), w = tdfWanted_(got.rows, s, readConfig_(ss_()) || {});
  const statuses = {}, types = {};
  got.rows.forEach(r => {
    const k = r.status || '(ว่าง)', t = TDF_TYPE[r.type] || r.type || '(ว่าง)';
    statuses[k] = (statuses[k] || 0) + 1;
    types[t] = (types[t] || 0) + 1;
  });
  const dates = got.rows.map(r => r.date).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  return {
    title: book.getName(), tabs: got.tabs, tab: got.tab.name, map: got.map, missing: got.missing,
    preview: got.missing.length ? null : {
      rows: got.rows.length, counted: w.counted, rc: Object.keys(w.want).filter(k => /:rc$/.test(k)).length, calc: Object.keys(w.want).filter(k => /:calc$/.test(k)).length,
      self: w.self, statuses: statuses, types: types, unknown: w.unknown,
      first: dates[0] || '', last: dates[dates.length - 1] || '',
    },
  };
}

/* ---------- วันหยุดราชการไทย (ปฏิทินวันหยุดสาธารณะของ Google) ---------- */

const TH_HOLIDAY_CAL = 'th.th#holiday@group.v.calendar.google.com';   // ชื่อภาษาไทย
const EN_HOLIDAY_CAL = 'en.th#holiday@group.v.calendar.google.com';   // ใช้แยกวันหยุดจริงกับวันสำคัญ (Observance)

// วันหยุดของปีนั้น [{ date, name }] ตัดวันสำคัญที่ไม่ใช่วันหยุดออก · เก็บผลไว้ 6 ชั่วโมง
function thaiHolidays(year, token) {
  who_(token);
  year = Math.floor(+year);
  if (!(year >= 2000 && year < 2100)) throw new Error('ปีไม่ถูกต้อง');
  const cache = CacheService.getScriptCache(), key = 'thhol_' + year, hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const fetchCal = id => {
    const res = UrlFetchApp.fetch('https://calendar.google.com/calendar/ical/' + encodeURIComponent(id) + '/public/basic.ics', { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode());
    return parseIcs_(res.getContentText('UTF-8'));
  };
  let th;
  try { th = fetchCal(TH_HOLIDAY_CAL); } catch (e) { throw new Error('ดึงปฏิทินวันหยุดจาก Google ไม่ได้ (' + e.message + ')'); }
  let en = [];
  try { en = fetchCal(EN_HOLIDAY_CAL); } catch (e) { en = []; }
  const observance = {};
  en.forEach(ev => { if (/observance/i.test(ev.desc)) observance[ev.uid] = true; });
  const byDate = {};
  th.filter(ev => ev.date.slice(0, 4) === String(year) && !observance[ev.uid] && !/observance|วันสำคัญ|การปฏิบัติตาม/i.test(ev.desc))
    .forEach(ev => { byDate[ev.date] = byDate[ev.date] ? byDate[ev.date] + ' / ' + ev.name : ev.name; });
  const out = Object.keys(byDate).sort().map(d => ({ date: d, name: byDate[d] }));
  cache.put(key, JSON.stringify(out), 6 * 3600);
  return out;
}

// อ่านไฟล์ iCalendar: เหตุการณ์ทั้งวัน → [{ date, name, desc, uid }] (หลายวันแตกเป็นรายวัน)
function parseIcs_(text) {
  const lines = String(text).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const events = [];
  let ev = null;
  lines.forEach(line => {
    if (line === 'BEGIN:VEVENT') { ev = {}; return; }
    if (line === 'END:VEVENT') { if (ev && ev.start) events.push(ev); ev = null; return; }
    if (!ev) return;
    const i = line.indexOf(':');
    if (i < 0) return;
    const k = line.slice(0, i).split(';')[0], v = line.slice(i + 1).replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
    if (k === 'DTSTART') ev.start = v.slice(0, 8);
    else if (k === 'DTEND') ev.end = v.slice(0, 8);
    else if (k === 'SUMMARY') ev.name = v;
    else if (k === 'DESCRIPTION') ev.desc = v;
    else if (k === 'UID') ev.uid = v;
  });
  const ymd = s => s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
  const next = d => { const t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + 1)); return t.toISOString().slice(0, 10); };
  const out = [];
  events.forEach(e => {
    if (!/^\d{8}$/.test(e.start)) return;
    const end = /^\d{8}$/.test(e.end || '') ? ymd(e.end) : '';
    let d = ymd(e.start), n = 0;
    do { out.push({ date: d, name: e.name || '', desc: e.desc || '', uid: e.uid || '' }); d = next(d); } while (end && d < end && ++n < 31);
  });
  return out;
}

/* ---------- รหัส PIN 4 หลักของแต่ละคน (ยืนยันตัวตอนกดปุ่มขั้นตอน) ---------- */
// เก็บแบบแฮชพร้อม salt ใน Script properties (คนที่เปิดชีตก็ไม่เห็น) · ใส่ผิด PIN_TRIES ครั้ง ล็อก PIN_LOCK_SECONDS

const PIN_TRIES = 5;
const PIN_LOCK_SECONDS = 300;

function pinKey_(u) {
  return 'PIN_' + (u.via === 'lpch' ? 'lpch:' + String(u.username).toLowerCase() : 'google:' + String(u.me || '').toLowerCase());
}

function pinHash_(salt, pin) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pin, Utilities.Charset.UTF_8));
}

function pinRecord_(u) {
  if (!u || (u.via === 'lpch' ? !u.username : !u.me)) return null;
  try { return JSON.parse(propRead_(pinKey_(u)) || 'null'); } catch (e) { return null; }
}

// ทุกแถบ ทุกงาน: บันทึกใหม่ไม่ต้องใส่ PIN · แก้ไขหรือลบของที่บันทึกไว้แล้วต้องใส่ PIN ของคนที่เข้าสู่ระบบ (กติกาเดียวกับ pinFresh ในหน้าเว็บ)
// PIN ว่างแต่ต้องใส่ = PINNEED| ให้หน้าเว็บเปิดช่อง PIN · ยังไม่ได้ตั้ง PIN = PIN| (ตั้งรหัสใหม่)
function pinChange_(u, pin, change) {
  if (!change) return;
  if (String(pin == null ? '' : pin) === '' && pinRecord_(u)) throw new Error('PINNEED|การแก้ไขหรือลบต้องใส่รหัส PIN');
  checkPin_(u, pin);
}
// แก้เคสเดียวภายใต้ล็อก: อ่านแถวครั้งเดียว (เดิมอ่านก่อนล็อก 1 รอบ ในล็อกอีก 2–3 รอบ) แล้วคืนเคสหลังบันทึกจากค่าที่เขียน (ไม่อ่านกลับ)
// change(cur) = ต้องยืนยัน PIN ไหม (cur = null เมื่อไม่พบเคส) · build(cur, ss, cfg) คืนช่องที่จะเขียน
function caseEdit_(u, id, pin, change, build) {
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss), x = openRow_(ss, 'cases', cfg, id);
    pinChange_(u, pin, change(x.cur));
    if (!x.row) throw new Error('ไม่พบเคสนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const set = build(x.cur, ss, cfg);
    if (REQ_.dry) return null;   // casesDo รอบตรวจ: ยังไม่เขียน
    const out = saveRow_(x, TABLES.cases.fields, set);
    if (x.pre) x.pre.vals = null;   // แถวที่อ่านล่วงหน้าใช้ได้ครั้งเดียว (เขียนแล้ว = อ่านใหม่ถ้าถูกเรียกอีก)
    return out;
  });
}
/**
 * API 74: คำสั่งเดียวกันกับทุกเคสของผู้ป่วยคนเดียว (หลายเทคนิค) ในรอบเดียว ล็อกเดียว · เดิมหน้าเว็บเรียกทีละเคส = ช้าเป็นเท่าตัว
 * fn = ชื่อฟังก์ชันใน CASE_BATCH · args = พารามิเตอร์หลัง id (ไม่รวม token) · คืนเคสหลังบันทึกตามลำดับ ids
 * ตรวจทุกเคสก่อน (PIN · ไม่พบเคส · ค่าที่ไม่ถูกต้อง) แล้วจึงเขียน: ผิดเคสใดเคสหนึ่ง = ไม่เขียนเลยสักเคส
 */
const CASE_BATCH = { fractionCase: 3, tagCase: 2, timeCase: 2, courseCase: 4, moveCase: 3, addFxCase: 3 };   // จำนวนพารามิเตอร์หลัง id
function casesDo(fn, ids, args, token) {
  if (!Object.prototype.hasOwnProperty.call(CASE_BATCH, fn)) throw new Error('คำสั่งนี้ใช้กับหลายเคสไม่ได้');
  ids = (Array.isArray(ids) ? ids : []).map(v => String(v == null ? '' : v)).filter((v, i, a) => v && a.indexOf(v) === i);
  if (!ids.length || ids.length > 20) throw new Error('จำนวนเคสไม่ถูกต้อง');
  args = Array.isArray(args) ? args.slice(0, CASE_BATCH[fn]) : [];
  while (args.length < CASE_BATCH[fn]) args.push('');
  const f = { fractionCase: fractionCase, tagCase: tagCase, timeCase: timeCase, courseCase: courseCase, moveCase: moveCase, addFxCase: addFxCase }[fn];
  const all = () => ids.map(id => f.apply(null, [id].concat(args, [token])));
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss);
    try {
      REQ_.rows = openRows_(ss, 'cases', cfg, v => ids.indexOf(v) >= 0);   // แถวของทุกเคส: คอลัมน์ id รอบเดียว + แถวที่ต้องการ
      REQ_.dry = true;
      all();
      REQ_.dry = false;
      return all();
    } finally { REQ_.dry = false; REQ_.rows = null; }
  });
}
// อ่านเฉพาะคอลัมน์ที่ใช้ของตารางใหญ่ (อ่านทั้งตาราง = ช้าตามจำนวนช่อง) · คืนรายการแบบ readTable_ ที่มีเฉพาะ id + keys
// คอลัมน์ที่อยู่ห่างกันไม่เกิน 3 อ่านเป็นช่วงเดียว (ลดจำนวนรอบ)
function readCols_(ss, table, cfg, keys) {
  const def = tableDef_(table, cfg), sh = sheet_(ss, def.sheet);
  if (!sh) return [];
  const last = sh.getLastRow();
  if (last < 2) return [];
  const tz = tz_(ss), cv = rowConv_(def, headerOf_(sh), tz);
  if (cv.cols[0] < 0) return [];
  const want = def.fields.map((f, i) => ({ k: f[0], col: cv.cols[i] })).filter(x => (x.k === 'id' || keys.indexOf(x.k) >= 0) && x.col >= 0).sort((a, b) => a.col - b.col);
  const spans = [];
  want.forEach(x => { const sp = spans[spans.length - 1]; if (sp && x.col - sp.to <= 3) sp.to = x.col; else spans.push({ from: x.col, to: x.col }); x.span = spans.length - 1; });
  const data = spans.map(sp => sh.getRange(2, sp.from + 1, last - 1, sp.to - sp.from + 1).getValues());
  const out = [];
  for (let r = 0; r < last - 1; r++) {
    const o = {};
    want.forEach(x => { o[x.k] = cellText_(data[x.span][r][x.col - spans[x.span].from], tz); });
    if (o.id !== '') out.push(o);
  }
  return out;
}
// เคสเดียวตาม id: อ่านคอลัมน์ id แล้วอ่านเฉพาะแถวนั้น (เดิมอ่านทั้งชีต Cases = ช้ามากเมื่อข้อมูลเยอะ · บันทึกสถานะ fraction ค้าง)
const caseOf_ = id => {
  if (!id) return null;
  const ss = ss_(), cfg = readConfig_(ss), sh = sheet_(ss, tableDef_('cases', cfg).sheet);
  if (!sh || sh.getLastRow() < 2) return null;
  const header = headerOf_(sh), row = findRow_(sh, header.indexOf('id') + 1, id);
  return row ? rowAt_(ss, 'cases', cfg, sh, header, row) : null;
};
// มีรายการ id นี้ไหม: อ่านเฉพาะคอลัมน์ id (เดิมอ่านทั้งตาราง · แถบลงทะเบียน 2 หมื่นแถว = หลายวินาที)
const rowExists_ = (table, id) => {
  if (!id) return false;
  const sh = sheet_(ss_(), tableDef_(table).sheet);
  return !!sh && sh.getLastRow() > 1 && findRow_(sh, headerOf_(sh).indexOf('id') + 1, id) > 0;
};
const jsonList_ = v => { try { const a = JSON.parse(String(v || '[]')); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
const has_ = v => String(v == null ? '' : v).trim() !== '';
// act = กลุ่มงาน (ตั้งค่า → รหัส PIN ในหน้าเว็บ: steps, edit, logs, fx, course, ptags, mqt, ptadd, duty, ct, appt, jobs, reg, bq) · แอดมินตั้ง config.pin[act] = false = ไม่ต้องใส่ PIN
// (ยังรู้ว่าใครทำจากบัญชีที่เข้าระบบ) · ไม่ระบุ act = ตรวจเสมอ
function checkPin_(u, pin, act) {
  if (act) { const cfg = readConfig_(ss_()) || {}; if (cfg.pin && cfg.pin[act] === false) return; }
  const rec = pinRecord_(u);
  if (!rec) throw new Error('PIN|ยังไม่ได้ตั้งรหัส PIN');
  const okKey = pinKey_(u) + ':' + String(pin == null ? '' : pin);
  if (REQ_.pinOk === okKey) return;   // ตรวจผ่านแล้วในคำขอนี้ (หลายเคสของผู้ป่วยคนเดียว)
  const cache = CacheService.getScriptCache(), key = 'pintry_' + pinKey_(u);
  const tries = +(cache.get(key) || 0);
  if (tries >= PIN_TRIES) throw new Error('ใส่รหัส PIN ผิด ' + PIN_TRIES + ' ครั้ง รอ 5 นาทีแล้วลองใหม่');
  if (!/^\d{4}$/.test(String(pin == null ? '' : pin)) || pinHash_(rec.s, String(pin)) !== rec.h) {
    cache.put(key, String(tries + 1), PIN_LOCK_SECONDS);
    const left = PIN_TRIES - tries - 1;
    if (left <= 0) alert_('pin_' + pinKey_(u), 'รหัส PIN ถูกล็อก', String(u.name || u.username || u.me || 'ผู้ใช้') + ' (' + String(u.username || u.me || '-') + ') ใส่รหัส PIN ผิด ' + PIN_TRIES + ' ครั้ง ถูกล็อก 5 นาที · ถ้าไม่ใช่เจ้าของบัญชี อาจมีคนพยายามใช้บัญชีนี้');
    throw new Error('รหัส PIN ไม่ถูกต้อง' + (left > 0 ? ' (ใส่ได้อีก ' + left + ' ครั้ง)' : ' รอ 5 นาทีแล้วลองใหม่'));
  }
  if (tries) cache.remove(key);   // ไม่เคยใส่ผิด = ไม่มีอะไรให้ล้าง
  REQ_.pinOk = okKey;
}

// ตั้งหรือเปลี่ยนรหัส PIN ของตัวเอง · มีรหัสอยู่แล้วต้องใส่ proof = { pin: รหัสเดิม } หรือ { password: รหัสผ่าน LPCH } (ลืม PIN)
function setPin(pin, proof, token) {
  const u = who_(token);
  pin = String(pin == null ? '' : pin);
  if (!/^\d{4}$/.test(pin)) throw new Error('รหัส PIN ต้องเป็นตัวเลข 4 หลัก');
  if (pinRecord_(u)) {
    proof = proof || {};
    if (proof.pin != null && proof.pin !== '') checkPin_(u, proof.pin);
    else if (proof.password && u.via === 'lpch') checkLpchPassword_(u.username, proof.password);
    else throw new Error('ใส่รหัส PIN เดิม' + (u.via === 'lpch' ? ' หรือรหัสผ่าน LPCH' : '') + ' เพื่อเปลี่ยนรหัส PIN');
  }
  const salt = Utilities.getUuid();
  propSave_(pinKey_(u), JSON.stringify({ s: salt, h: pinHash_(salt, pin), at: new Date().toISOString() }));
  CacheService.getScriptCache().remove('pintry_' + pinKey_(u));
  return true;
}

// ลืม PIN: ตรวจรหัสผ่านกับ LPCH (เข้าสู่ระบบแล้วออกทันที) รหัสผ่านไม่ถูกเก็บที่นี่
function checkLpchPassword_(username, password) {
  const out = lpchCall_({ action: 'login', username: String(username), password: String(password) });
  try { lpchCall_({ action: 'logout', token: out.token }); } catch (e) { /* ปล่อยให้หมดอายุเอง */ }
}

/* ---------- ผู้ใช้: บัญชี LPCH RO Workspace หรือบัญชี Google ---------- */

/**
 * ผู้ใช้ของคำขอนี้ {via, name, username, role, me, owner, canEdit, isAdmin, lpchAdmin}
 * - เปิดลิงก์ LPCH (มี token): บันทึกได้เฉพาะ LPCH_EDIT_ROLES · แก้การตั้งค่าได้ถ้าเป็น MP และเป็นแอดมินของ LPCH หรืออยู่ในรายชื่อแอดมิน
 * - บัญชี Google ที่เป็นเจ้าของไฟล์หรือแอดมิน (เช่นเปิดจากเมนูในชีต): ทำได้ทุกอย่าง
 * - ปิด LPCH (LPCH_URL = -): ใช้บัญชี Google อย่างเดียวแบบเดิม
 * ยังไม่ได้เข้าสู่ระบบ → Error ที่ขึ้นต้นด้วย LOGIN| หน้าเว็บจะแสดงช่องเข้าสู่ระบบ
 */
function who_(token, ss, cfg) {
  const memo = REQ_.who || (REQ_.who = {}), key = 't:' + String(token == null ? '' : token);
  if (memo[key]) return (AUDIT_U_ = memo[key]);
  return (memo[key] = who0_(token, ss, cfg));
}
function who0_(token, ss, cfg) {
  ss = ss || ss_();
  cfg = cfg || readConfig_(ss) || {};
  if (token && token !== SHEET_DIALOG && /^[\w-]{20,200}$/.test(String(token))) cachePre_(['ssOwner_' + ss.getId(), 'lpch_' + token, pk_('ssTz')]);
  const g = adminInfo_(ss, cfg);
  const google = { via: 'google', name: g.me, username: '', role: '', me: g.me, owner: g.owner, canEdit: true, isAdmin: g.isAdmin, lpchAdmin: false };
  AUDIT_U_ = google;
  if (!lpchUrl_()) return google;
  // เปิด LPCH แล้ว: เว็บใช้บัญชี LPCH เสมอ (รวมเจ้าของไฟล์) บัญชี Google ใช้ได้เฉพาะหน้าที่เปิดจากเมนูในชีต
  // และต้องเป็นเจ้าของไฟล์หรืออีเมลในรายชื่อแอดมิน (Google ยืนยันตัวตนให้ ค่า SHEET_DIALOG ไม่ได้ให้สิทธิ์เพิ่มเอง)
  const googleAdmin = !!g.me && (g.me === g.owner || adminList_(cfg).indexOf(g.me) >= 0);
  const fromSheet = token === SHEET_DIALOG;
  let why = '';   // ไม่มี token = เพิ่งเปิดหน้า: แสดงช่องเข้าสู่ระบบเฉย ๆ ไม่ต้องมีข้อความเตือน
  if (token && !fromSheet) {
    const p = lpchUser_(token);
    if (!p.error) {
      const admins = adminList_(cfg);
      const listed = (!!p.email && admins.indexOf(p.email) >= 0) || admins.indexOf(p.username) >= 0;
      // canEdit = บันทึกได้อย่างน้อยหนึ่งแถบ (ตั้งค่า → แถบเมนู) · แอดมินต้องเป็น MP (p.canEdit) และเป็นแอดมินของ LPCH หรืออยู่ในรายชื่อแอดมิน
      const isAdmin = p.canEdit && (p.lpchAdmin || listed), isSub = !isAdmin && !!subEntry_(cfg, p);
      const me = { via: 'lpch', isAdmin: isAdmin, isSub: isSub, role: p.role };
      const anyEdit = Object.keys(EDIT_VIEWS).reduce((a, t) => a.concat(EDIT_VIEWS[t]), []).some(v => userAccess_(cfg, v, me) === 'edit');
      return (AUDIT_U_ = { via: 'lpch', name: p.name, username: p.username, role: p.role, me: p.email, owner: g.owner,
        canEdit: anyEdit, isAdmin: isAdmin, isSub: isSub, lpchAdmin: p.lpchAdmin, sub: isSub ? subTabs_(cfg, p) : [] });
    }
    why = p.error;
  }
  if (fromSheet && googleAdmin) return Object.assign(google, { isAdmin: true });
  throw new Error('LOGIN|' + why);
}

// บันทึกได้เมื่อตำแหน่งของผู้ใช้บันทึกได้อย่างน้อยหนึ่งแถบใน views (ไม่ระบุ = แถบไหนก็ได้) · บัญชี Google (เจ้าของไฟล์/แอดมิน) บันทึกได้ทุกแถบ
function requireEdit_(token, views) {
  const ss = ss_(), cfg = readConfig_(ss) || {};
  const u = who_(token, ss, cfg);
  if (u.via === 'google') return u;
  const list = views || Object.keys(EDIT_VIEWS).reduce((a, t) => a.concat(EDIT_VIEWS[t]), []);
  if (!list.some(v => userAccess_(cfg, v, u) === 'edit')) {
    throw new Error('ตำแหน่ง ' + (u.isAdmin ? 'Admin (แอดมิน)' : u.isSub ? 'แอดมินรอง (' + (u.role || '-') + ')' : u.role || '-') + ' บันทึกในแถบนี้ไม่ได้ (บัญชี ' + u.username + ' ดูได้อย่างเดียว) · แอดมินเปิดสิทธิ์ได้ที่ ตั้งค่า → แถบเมนู');
  }
  return u;
}

// แอดมิน: ดึงสมาชิกที่ใช้งานอยู่และตำแหน่งจาก LPCH RO Workspace (คำสั่ง directory) ใช้ตั้งสิทธิ์รายแถบ และเชื่อมบัญชีของนักฟิสิกส์ / แพทย์ ในตั้งค่า
// ส่งอีเมลด้วยถ้า LPCH ส่งมา · ไม่เก็บรายชื่อไว้ที่นี่
function lpchMembers(token) {
  const u = who_(token);
  if (!u.isAdmin && !subAll_(u)) throw new Error('ดูรายชื่อสมาชิกได้เฉพาะแอดมิน');   // API 105: แอดมินรองแบบทุกหมวดดูได้ (ใช้ตั้งสิทธิ์ในคำขอ)
  if (u.via !== 'lpch') throw new Error('ดึงรายชื่อได้เมื่อเข้าสู่ระบบด้วยบัญชี LPCH RO Workspace');
  const out = lpchCall_({ action: 'directory', token: String(token) });
  const users = (Array.isArray(out.users) ? out.users : []).map(x => ({ username: String(x.username || ''), name: String(x.fullName || x.username || ''), role: String(x.role || ''), email: String(x.email || '').trim().toLowerCase() })).filter(x => x.username);
  const roles = LPCH_ROLES.slice();
  users.forEach(x => { if (x.role && roles.indexOf(x.role) < 0) roles.push(x.role); });
  keepDutyMembers_(users);
  return { roles: roles, users: users };
}

function lpchUrl_() {
  let v = null;
  try { v = propRead_('LPCH_URL'); } catch (e) { v = null; }
  v = String(v == null || v === '' ? LPCH_URL : v).trim();
  return v === '-' ? '' : v;
}

// 20 พ.ย.: LPCH ไม่ว่างชั่วคราว = ข้อผิดพลาดของ Apps Script ฝั่ง LPCH ที่ลองใหม่แล้วมักผ่าน (LockService ของ LPCH รอคิวไม่ทัน ฯลฯ)
// เจอที่หน้าเข้าสู่ระบบ: "Error: Lock timeout: another process was holding the lock for too long." · ไม่รวมข้อความเรื่องรหัสผ่าน / บัญชี (ลองซ้ำ = นับพยายามผิดเพิ่ม)
const LPCH_BUSY_RE = /lock timeout|holding the lock for too long|service invoked too many times|exceeded maximum execution time|service spreadsheets (failed|timed out)|service error: spreadsheets/i;
const LPCH_BUSY_MSG = 'ระบบเข้าสู่ระบบกลาง LPCH RO Workspace ไม่ว่างชั่วคราว (มีผู้ใช้พร้อมกันหลายคน) · รอสักครู่แล้วลองอีกครั้ง';
const LPCH_GRACE_SECONDS = 1800;   // ผลตรวจบัญชีครั้งล่าสุดที่ผ่าน ใช้ต่อได้นานเท่านี้ระหว่าง LPCH ไม่ว่าง (ผู้ที่เข้าระบบอยู่แล้วทำงานต่อได้)
// เรียก API ของ LPCH RO Workspace (doPost) โยนข้อความผิดพลาดของ LPCH ต่อ · LPCH ไม่ว่างชั่วคราว = ลองใหม่เองไม่เกิน 2 ครั้ง (รวมไม่เกิน ~25 วินาที)
function lpchCall_(req) {
  const url = lpchUrl_();
  if (!url) throw new Error('ยังไม่ได้เชื่อมกับ LPCH RO Workspace (ตั้ง Script property LPCH_URL)');
  const t0 = Date.now();
  let res = null, body = '', out = null;
  for (let i = 0; ; i++) {
    try { res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(req), muteHttpExceptions: true }); }
    catch (e) {   // 2026-11-26.1: exception มี URL ของ Workspace = ไม่ส่งข้อความดิบกลับ
      if (i >= 1 || Date.now() - t0 > 25000) throw new Error('เชื่อมต่อ LPCH RO Workspace ไม่ได้ชั่วคราว ลองใหม่อีกครั้ง');
      try { Utilities.sleep(1200); } catch (x) { /* ไม่มี sleep (ทดสอบ) */ }
      continue;
    }
    body = String(res.getContentText('UTF-8') || '');
    out = null;
    try { out = JSON.parse(body); } catch (e) { out = null; }
    if (!out || out.ok || !LPCH_BUSY_RE.test(String(out.error || '')) || i >= 2 || Date.now() - t0 > 25000) break;
    Utilities.sleep(i ? 2500 : 1200);
  }
  if (out && !out.ok && LPCH_BUSY_RE.test(String(out.error || ''))) {
    console.log('lpch busy ' + String(req && req.action) + ': ' + String(out.error).slice(0, 200));
    const e = new Error(LPCH_BUSY_MSG);
    e.lpchBusy = true;
    throw e;
  }
  if (!out) {
    // สคริปต์ของ LPCH พังหรือถูกวางโค้ดอื่นทับ: Apps Script ตอบหน้า Error (HTML, HTTP 200) เช่น "Script function not found: doPost"
    const why = ((/<title>Error<\/title>[\s\S]*<div[^>]*>([^<]{3,200})<\/div>\s*<\/body>/.exec(body) || [])[1] || '').trim();
    if (/doPost/.test(why)) throw new Error('เชื่อมต่อ LPCH RO Workspace ไม่ได้: Apps Script ที่ LPCH_URL ไม่มี doPost (' + why + ') แปลว่าโปรเจกต์ของ LPCH ถูกวางโค้ดอื่นทับ เช่น Code.gs ของระบบนี้ · ผู้ดูแล: วาง Code.gs ของ LPCH RO Workspace กลับในโปรเจกต์ LPCH แล้ว Deploy เวอร์ชันใหม่');
    throw new Error('เชื่อมต่อ LPCH RO Workspace ไม่ได้ (HTTP ' + res.getResponseCode() + (why ? ': ' + why : '') + ') ผู้ดูแล: ตรวจ LPCH_URL และ Deploy ของ LPCH แบบ Who has access: Anyone');
  }
  if (!out.ok) throw new Error(out.error || 'LPCH RO Workspace ตอบกลับไม่สำเร็จ');
  return out;
}

// สมาชิก LPCH ที่ใช้งานอยู่ทุกคนดูได้ บันทึกได้เฉพาะ LPCH_EDIT_ROLES
function lpchProfile_(u) {
  if (!u || !u.username) return { error: 'ไม่พบบัญชี LPCH RO Workspace' };
  const role = String(u.role || '');
  return {
    username: String(u.username), name: String(u.fullName || u.username), role: role,
    email: String(u.email || '').trim().toLowerCase(),
    lpchAdmin: u.isAdmin === true || String(u.isAdmin).toUpperCase() === 'TRUE',
    canEdit: LPCH_EDIT_ROLES.indexOf(role) >= 0,
  };
}

// สมาชิกเจ้าของ token (ถาม LPCH ด้วยคำสั่ง me) เก็บผลไว้ LPCH_CHECK_SECONDS ระงับบัญชีใน LPCH ก็ใช้ที่นี่ไม่ได้ด้วย
function lpchUser_(token) {
  token = String(token || '');
  if (!/^[\w-]{20,200}$/.test(token)) return { error: 'การเข้าสู่ระบบไม่ถูกต้อง กรุณาเข้าสู่ระบบอีกครั้ง' };
  const key = 'lpch_' + token;
  const hit = reqCacheGet_(key);
  if (hit) return JSON.parse(hit);
  let p;
  try { p = lpchProfile_(lpchCall_({ action: 'me', token: token }).user); } catch (e) {
    if (e.message !== 'session_expired') {
      // 20 พ.ย.: LPCH ไม่ว่างชั่วคราว = ใช้ผลตรวจครั้งล่าสุดที่ผ่านของ token นี้ต่อ (ไม่เกิน LPCH_GRACE_SECONDS) แล้วถามใหม่ในอีก 1 นาที · ไม่มีผลเดิม = แจ้งตามจริง ไม่ออกจากระบบ
      const old = e.lpchBusy ? CacheService.getScriptCache().get('lpchOk_' + token) : null;
      if (!old) throw e;
      reqCachePut_(key, old, 60);
      return JSON.parse(old);
    }
    p = { error: 'การเข้าสู่ระบบด้วยบัญชี LPCH หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' };
  }
  reqCachePut_(key, JSON.stringify(p), LPCH_CHECK_SECONDS);
  if (p.error) CacheService.getScriptCache().remove('lpchOk_' + token);
  else CacheService.getScriptCache().put('lpchOk_' + token, JSON.stringify(p), LPCH_GRACE_SECONDS);
  return p;
}

// ผลการเข้าสู่ระบบของ LPCH ({token, user}) → {token, ...สมาชิก}
function lpchFinish_(out) {
  const p = lpchProfile_(out.user);
  if (p.error) throw new Error(p.error);
  CacheService.getScriptCache().put('lpch_' + out.token, JSON.stringify(p), LPCH_CHECK_SECONDS);
  CacheService.getScriptCache().put('lpchOk_' + out.token, JSON.stringify(p), LPCH_GRACE_SECONDS);
  return Object.assign({ token: out.token }, p);
}

// ช่องเข้าสู่ระบบในหน้าเว็บ: ชื่อผู้ใช้ (หรืออีเมล) และรหัสผ่านตรวจที่ LPCH ไม่เก็บที่นี่
// API 89: have = { pack } (หน้าเว็บรุ่นใหม่) = ส่งข้อมูลทั้งหมดมาพร้อมผลเข้าสู่ระบบ (ไม่ต้องเรียก getData อีกรอบ)
function lpchLogin(username, password, have) {
  const ua = have && typeof have === 'object' ? signupText_(have.ua, 300) : '';   // API 126: เบราว์เซอร์ (บัญชีของฉัน → อุปกรณ์)
  const r = lpchFinish_(lpchCall_(Object.assign({ action: 'login', username: String(username || ''), password: String(password || '') }, ua ? { ua: ua } : {})));
  txsLoginLog_(r, 'กรอกชื่อผู้ใช้และรหัสผ่าน');   // API 98
  if (have && typeof have === 'object' && have.pack && r.token) { try { r.data = getData({ pack: 1 }, r.token); } catch (e) { console.log('lpchLogin data ' + e); } }
  return r;
}

/* ---------- API 125 (24 พ.ย.): สมัครสมาชิก / ลืมรหัสผ่าน จากหน้าเข้าสู่ระบบของ RT Hub ----------
 * บัญชีเก็บที่ LPCH RO Workspace ที่เดียว: ส่งต่อคำสั่ง rolesGet / register / forgotPassword / resetPassword ของ RO Workspace
 * (คำสั่งเดียวกับหน้าสมัครสมาชิกของ RO Workspace · ไม่ต้องเข้าสู่ระบบ) · บัญชีเดียวใช้ได้ทั้ง RO Workspace, RT Hub และแอปอื่นที่เชื่อม
 * ไม่เก็บรหัสผ่านหรือข้อมูลผู้สมัครที่นี่ ไม่เขียนลง log · ผู้ดูแลระบบ RO Workspace อนุมัติที่หน้าจัดการสมาชิกของ RO Workspace
 * จำกัดจำนวนคำขอรวมต่อ 10 นาที (กันการยิงซ้ำจนโควตา UrlFetch หมด) · RO Workspace จำกัดการขอรหัสต่อบัญชีอีกชั้น
 */
const SIGNUP_LIMIT_ = { reg: 20, pw: 40 };
const SIGNUP_USER_RE_ = /^[a-z0-9._-]{3,30}$/;
const SIGNUP_EMAIL_RE_ = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const LPCH_OLD_MSG = 'LPCH RO Workspace ยังไม่รองรับคำสั่งนี้จากระบบอื่น · สมัครสมาชิก / ตั้งรหัสผ่านใหม่ที่หน้า LPCH RO Workspace ได้เลย';
const lpchOld_ = e => /ไม่รู้จักคำสั่ง/.test(String((e && e.message) || ''));
function signupGuard_(kind) {
  if (!lpchUrl_()) throw new Error('ระบบนี้ไม่ได้เชื่อมกับ LPCH RO Workspace (ใช้บัญชี Google) · สมัครสมาชิกที่นี่ไม่ได้');
  const c = CacheService.getScriptCache(), k = 'signup_' + kind + '_' + Math.floor(Date.now() / 600000);
  const n = Number(c.get(k) || 0);
  if (n >= SIGNUP_LIMIT_[kind]) throw new Error('มีคำขอจำนวนมากในช่วงนี้ · รอสักครู่แล้วลองอีกครั้ง');
  c.put(k, String(n + 1), 660);
}
// API 140: จำกัดต่อบัญชี (นอกจากจำกัดรวมของ signupGuard_) · คืนค่าที่นับอยู่และฟังก์ชันเพิ่ม / ล้าง
function pwLimit_(kind, login, max, sec, msg) {
  const c = CacheService.getScriptCache(), k = 'pwl_' + kind + '_' + String(login).slice(0, 120), n = Number(c.get(k) || 0);
  if (n >= max) throw new Error(msg);
  return { add: () => c.put(k, String(n + 1), sec), clear: () => c.remove(k) };
}
const PW_ASK_MAX = 3, PW_ASK_SEC = 3600, PW_TRY_MAX = 5, PW_TRY_SEC = 900;
const signupText_ = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
// ตำแหน่งให้เลือกในหน้าสมัคร (ตามที่ผู้ดูแล RO Workspace ตั้งไว้ · จำไว้ 10 นาที) · RO Workspace รุ่นก่อนมี rolesGet = รายการตั้งต้น
function lpchRoles() {
  if (!lpchUrl_()) return { roles: [] };
  const c = CacheService.getScriptCache(), hit = c.get('lpchRoles');
  if (hit) return { roles: JSON.parse(hit) };
  let roles = [];
  try {
    const out = lpchCall_({ action: 'rolesGet' });
    roles = (Array.isArray(out.roles) ? out.roles : []).map(r => ({ code: signupText_(r && r.code, 20), label: signupText_(r && (r.label || r.code), 60) })).filter(r => r.code);
  } catch (e) {
    if (!lpchOld_(e)) throw e;
  }
  if (!roles.length) roles = LPCH_ROLES.map(x => ({ code: x, label: x }));
  c.put('lpchRoles', JSON.stringify(roles), 600);
  return { roles: roles };
}
// สมัครสมาชิก: RO Workspace ตั้งให้รออนุมัติ (ค่าตั้งต้น) = { status: 'pending', message } · ไม่ต้องรอ = เข้าสู่ระบบให้เลยเหมือน lpchLogin
function lpchRegister(rec, have) {
  rec = rec && typeof rec === 'object' ? rec : {};
  const username = signupText_(rec.username, 40).toLowerCase(), fullName = signupText_(rec.fullName, 100), role = signupText_(rec.role, 30);
  const email = signupText_(rec.email, 120).toLowerCase(), phone = signupText_(rec.phone, 40), password = String(rec.password == null ? '' : rec.password);
  if (!fullName) throw new Error('กรุณากรอกชื่อ-นามสกุล');
  if (fullName.length > 80) throw new Error('ชื่อยาวเกินไป');
  if (!role) throw new Error('กรุณาเลือกตำแหน่ง');
  if (!SIGNUP_USER_RE_.test(username)) throw new Error('ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ ตัวเลข หรือ . _ - ความยาว 3–30 ตัวอักษร');
  if (!email) throw new Error('กรุณากรอกอีเมล (ใช้รับรหัสเมื่อลืมรหัสผ่าน)');
  if (email.length > 100 || !SIGNUP_EMAIL_RE_.test(email)) throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
  if (password.length < 8) throw new Error('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
  if (password.length > 200) throw new Error('รหัสผ่านยาวเกินไป');
  signupGuard_('reg');
  let out;
  try { out = lpchCall_({ action: 'register', username: username, fullName: fullName, role: role, email: email, phone: phone, password: password, ua: (have && typeof have === 'object' && signupText_(have.ua, 300)) || 'LPCH RT Hub' }); } catch (e) { throw lpchOld_(e) ? new Error(LPCH_OLD_MSG) : e; }
  if (out.token && out.user) {
    const r = lpchFinish_(out);
    if (have && typeof have === 'object' && have.pack) { try { r.data = getData({ pack: 1 }, r.token); } catch (e) { console.log('lpchRegister data ' + e); } }
    return Object.assign(r, { status: 'active' });
  }
  try { signupNotify_({ username: username, fullName: fullName, role: role, email: email, phone: phone }); } catch (e) { console.log('signupNotify ' + e); }   // API 126
  return { status: String(out.status || 'pending'), username: username, message: String(out.message || 'สมัครสมาชิกสำเร็จ กรุณารอผู้ดูแลระบบอนุมัติก่อนเข้าใช้งาน') };
}
// API 126: แจ้งผู้รับที่ตั้งไว้ (ตั้งค่า → ระบบ → ข้อความส่วนตัว · ไม่เลือก = แอดมินหลัก) ว่ามีผู้สมัครรออนุมัติ · ข้อความส่วนตัว + สำเนาอีเมลตาม config.msg.mail
// ผู้รับที่มีสิทธิ์จัดการสมาชิกใน RO Workspace กด "จัดการสมาชิก" ในข้อความแล้วอนุมัติใน RT Hub ได้เลย
function signupNotify_(p) {
  const cfg = readConfig_(ss_()) || {}, m = cfg.msg || {};
  if (m.signup === false) return [];
  const list = Array.isArray(m.signupTo) && m.signupTo.length ? m.signupTo : adminList_(cfg);
  const to = list.map(x => String(x == null ? '' : x).trim().toLowerCase()).filter((x, i, a) => x && /^[a-z0-9._@+-]+$/.test(x) && a.indexOf(x) === i).slice(0, MSG_MAX_TO);
  if (!to.length) return [];
  const people = [].concat(cfg.staff || [], cfg.doctors || [], cfg.crew || []);
  const nameOf = acc => { const x = people.filter(q => q && [q.user, q.email].map(v => String(v || '').trim().toLowerCase()).indexOf(acc) >= 0)[0]; return String((x && x.name) || acc); };
  let label = p.role;
  try { const r = (lpchRoles().roles || []).filter(x => x.code === p.role)[0]; if (r) label = r.label; } catch (e) { /* ใช้รหัสตำแหน่ง */ }
  const title = ('สมัครสมาชิกใหม่ รออนุมัติ: ' + p.fullName).slice(0, 120);
  const text = ['ตำแหน่ง ' + label, 'ชื่อผู้ใช้ ' + p.username, 'อีเมล ' + p.email].concat(p.phone ? ['โทร ' + p.phone] : []).join(' · ')
    + '\nอนุมัติได้ที่ ไอคอนบัญชีของฉัน → จัดการสมาชิก (ผู้ที่มีสิทธิ์จัดการสมาชิกใน LPCH RO Workspace) หรือที่หน้า LPCH RO Workspace';
  return inboxPost_(cfg, { acc: '', name: 'ระบบสมัครสมาชิก' }, to.map(a => ({ acc: a, name: nameOf(a) })), 'signup', title, text.slice(0, 1000), 'signup|' + p.username, m.mail !== false, []);
}

/* ---------- API 126 (24 พ.ย.): บัญชีของฉัน / จัดการสมาชิก ----------
 * token ของ RT Hub คือการเข้าสู่ระบบของ LPCH RO Workspace: ส่งคำสั่งของ RO Workspace ต่อด้วย token ของผู้ใช้เอง
 * (me / updateProfile / changePassword / sessionList / sessionRevoke / listUsers / updateUser / deleteUser) · RO Workspace ตรวจสิทธิ์เอง
 * จัดการสมาชิก = ผู้ที่มีสิทธิ์ "จัดการสมาชิก" ใน RO Workspace (admin หลัก หรือ admin รองที่ได้สิทธิ์นี้) · ไม่ตั้ง / เปลี่ยนระดับ admin ที่นี่ (ทำที่ RO Workspace)
 * ไม่เก็บรหัสผ่านที่นี่ ไม่เขียนลง log
 */
function acctUser_(token) {
  const u = who_(token);
  if (u.via !== 'lpch') throw new Error('บัญชีของฉันใช้ได้เมื่อเข้าสู่ระบบด้วยบัญชี LPCH RO Workspace');
  return u;
}
function acctCall_(req, token) {
  try { return lpchCall_(Object.assign({}, req, { token: String(token) })); } catch (e) {
    if (e.message === 'session_expired') { lpchDrop_(token); throw new Error('LOGIN|การเข้าสู่ระบบด้วยบัญชี LPCH หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง'); }
    if (lpchOld_(e)) throw new Error('LPCH RO Workspace ยังไม่รองรับคำสั่งนี้จากระบบอื่น · ทำที่หน้า LPCH RO Workspace ได้เลย');
    throw e;
  }
}
const acctOut_ = u => ({ username: String(u.username || ''), fullName: String(u.fullName || ''), role: String(u.role || ''), phone: String(u.phone || ''), email: String(u.email || ''),
  status: String(u.status || ''), adminLevel: String(u.adminLevel || (u.isAdmin === true || String(u.isAdmin).toUpperCase() === 'TRUE' ? 'main' : '')),
  perms: Array.isArray(u.perms) ? u.perms.map(String) : [], createdAt: Number(u.createdAt) || null, lastLogin: Number(u.lastLogin) || null });
const acctRoles_ = () => { try { return lpchRoles().roles; } catch (e) { return []; } };
// ข้อมูลบัญชีของฉัน (จาก RO Workspace) + รายการตำแหน่ง
function acctMe(token) {
  acctUser_(token);
  return { user: acctOut_(acctCall_({ action: 'me' }, token).user || {}), roles: acctRoles_() };
}
// แก้ชื่อ-นามสกุล อีเมล เบอร์โทรของตัวเอง · ชื่อใหม่ใช้ใน RT Hub ทันที (ไม่ต้องรอแคช)
function acctSave(rec, token) {
  acctUser_(token);
  rec = rec && typeof rec === 'object' ? rec : {};
  const fullName = signupText_(rec.fullName, 100), email = signupText_(rec.email, 120).toLowerCase(), phone = signupText_(rec.phone, 40);
  if (!fullName) throw new Error('กรุณากรอกชื่อ-นามสกุล');
  if (fullName.length > 80) throw new Error('ชื่อยาวเกินไป');
  if (!email) throw new Error('กรุณากรอกอีเมล (ใช้รับรหัสเมื่อลืมรหัสผ่าน)');
  if (email.length > 100 || !SIGNUP_EMAIL_RE_.test(email)) throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
  const out = acctCall_({ action: 'updateProfile', fullName: fullName, email: email, phone: phone }, token);
  if (out.user) { try { lpchFinish_({ token: String(token), user: out.user }); if (REQ_.cache) delete REQ_.cache['lpch_' + token]; REQ_.who = null; } catch (e) { /* ครั้งหน้าถาม RO Workspace ใหม่ */ } }
  return { user: acctOut_(out.user || {}), message: String(out.message || 'บันทึกข้อมูลเรียบร้อย') };
}
/* ---------- API 129 (24 พ.ย.): บัญชีของฉัน → ข้อมูลใบลาของตัวเอง ----------
 * แก้ตำแหน่ง (ใบลา) และเบอร์โทรระหว่างลา ในแถวของตัวเองในรายชื่อบุคลากร (ตั้งค่า → ทีม: นักฟิสิกส์ / แพทย์ / RTT, RA และบุคลากรอื่น)
 * แถวของตัวเอง = เชื่อมบัญชีนี้ไว้ · ไม่มี = แถวที่ยังไม่เชื่อมบัญชีแต่อีเมลตรง · ไม่มี = ชื่อ-สกุลตรงกันแถวเดียว (เชื่อมบัญชีให้)
 * บันทึกแล้วอีเมลในแถวนั้น = อีเมลของบัญชีใน RO Workspace (ข้อความแจ้งเตือน / อีเมลส่งถึงอีเมลนี้) · ไม่ต้องเป็นแอดมิน */
const SELF_LISTS_ = ['staff', 'doctors', 'crew'];
function selfRows_(cfg, u) {
  const me = [u.username, u.me, u.email].map(v => String(v || '').trim().toLowerCase()).filter(String), out = [];
  const each = fn => SELF_LISTS_.forEach(l => (Array.isArray(cfg[l]) ? cfg[l] : []).forEach((x, i) => { if (x && typeof x === 'object') fn(l, i, x); }));
  each((l, i, x) => { if (me.indexOf(String(x.user || '').trim().toLowerCase()) >= 0) out.push({ l: l, i: i }); });
  if (!out.length) each((l, i, x) => { if (!String(x.user || '').trim() && me.indexOf(String(x.email || '').trim().toLowerCase()) >= 0) out.push({ l: l, i: i }); });
  if (!out.length && String(u.name || '').trim()) {
    const k = nameKey_(u.name), hit = [];
    each((l, i, x) => { if (k && !String(x.user || '').trim() && nameKey_(x.name) === k) hit.push({ l: l, i: i }); });
    if (hit.length === 1) out.push(hit[0]);
  }
  return out;
}
function selfProfile(rec, token) {
  const u = acctUser_(token);
  rec = rec && typeof rec === 'object' ? rec : {};
  const cut = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  const mail = String(u.email || u.me || '').trim().toLowerCase(), okMail = !!mail && SIGNUP_EMAIL_RE_.test(mail);
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss) || {}, rows = selfRows_(cfg, u);
    if (!rows.length) throw new Error('บัญชีนี้ยังไม่อยู่ในรายชื่อบุคลากรของ RT Hub (ตั้งค่า → ทีม) · ติดต่อแอดมินให้เลือกบัญชีนี้ในรายชื่อก่อน');
    const out = rows.map(r => {
      const x = cfg[r.l][r.i];
      if (!String(x.user || '').trim() && u.username) x.user = String(u.username);
      if (okMail) x.email = mail;
      if (rec.title !== undefined) x.title = cut(rec.title, 120);
      if (rec.phone !== undefined) x.phone = cut(rec.phone, 40);
      return { list: r.l, code: String(x.code || ''), name: String(x.name || ''), user: String(x.user || ''), email: String(x.email || ''), title: String(x.title || ''), phone: String(x.phone || '') };
    });
    writeConfig_(ss, cfg);
    audit_('config', '', '', 'edit', { 'หัวข้อที่แก้': 'ข้อมูลใบลาของตัวเอง (' + out.map(r => r.code || r.name).join(', ') + ')' });
    return { rows: out };
  });
}
/* ---------- API 130 (24 พ.ย.): ลายเซ็นอิเล็กทรอนิกส์ของตัวเอง (บัญชีของฉัน) ----------
 * รูป PNG พื้นโปร่ง (หน้าเว็บย่อ ตัดพื้นขาว และตัดขอบให้แล้ว) หนึ่งแถวต่อบัญชีในชีต Signatures · ไม่ส่งไปกับข้อมูลของหน้าเว็บ (ไม่อยู่ในตารางที่โหลดทุกครั้ง)
 * อ่าน / เปลี่ยน / ลบ ได้เฉพาะเจ้าของบัญชี · ประวัติการบันทึกเก็บแค่ว่าเปลี่ยน / ลบ (ไม่เก็บรูป) · ใช้ประทับในฟอร์มของระบบภายหลัง */
TABLES.sig = { sheet: 'Signatures', fields: [['id', 'id'], ['user', 'บัญชี'], ['name', 'ชื่อ'], ['img', 'ลายเซ็น (PNG)'], ['at', 'บันทึกเมื่อ']] };
const SIG_MAX_ = 45000;   // ตัวอักษรต่อช่อง (Google Sheet รับได้ 50,000)
const SIG_RE_ = /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+\/]*={0,2}$/;   // PNG (8 ไบต์แรก) เท่านั้น
const sigKey_ = u => String(u.username || u.me || '').trim().toLowerCase();
function sigAt_(ss, key) {
  const sh = sheet_(ss, TABLES.sig.sheet);
  if (!sh || sh.getLastRow() < 2) return { sh: sh, header: sh ? headerOf_(sh) : [], row: 0 };
  const header = headerOf_(sh);
  return { sh: sh, header: header, row: findRow_(sh, header.indexOf('id') + 1, key) };
}
function sigMine(token) {
  const u = acctUser_(token), key = sigKey_(u);
  if (!key) return { img: '', at: '' };
  const x = sigAt_(ss_(), key);
  if (!x.row) return { img: '', at: '' };
  const v = x.sh.getRange(x.row, 1, 1, x.header.length).getValues()[0], col = h => x.header.indexOf(h);
  return { img: String(v[col('ลายเซ็น (PNG)')] || ''), at: String(v[col('บันทึกเมื่อ')] || '') };
}
function sigSave(img, token) {
  const u = acctUser_(token), key = sigKey_(u);
  img = String(img == null ? '' : img);
  if (!key) throw new Error('เข้าสู่ระบบด้วยบัญชี LPCH RO Workspace ก่อน');
  if (!SIG_RE_.test(img)) throw new Error('รูปลายเซ็นไม่ถูกต้อง (ต้องเป็นรูป PNG ที่หน้าเว็บเตรียมให้)');
  if (img.length > SIG_MAX_) throw new Error('รูปลายเซ็นใหญ่เกินไป · ครอปให้ชิดลายเซ็นแล้วอัปโหลดใหม่');
  return withLock_(() => {
    const ss = ss_(), sh = tableSheet_(ss, 'sig'), header = headerOf_(sh), row = findRow_(sh, header.indexOf('id') + 1, key) || sh.getLastRow() + 1;
    const rec = { id: key, user: key, name: String(u.name || ''), img: img, at: new Date().toISOString() };
    sh.getRange(row, 1, 1, header.length).setNumberFormat('@').setValues([header.map(h => { const f = TABLES.sig.fields.filter(x => x[1] === h)[0]; return f ? safeText_(rec[f[0]]) : ''; })]);
    audit_('sig', key, '', 'edit', { 'ลายเซ็น': 'บันทึกรูปใหม่' });
    return { img: img, at: rec.at };
  });
}
function sigDelete(token) {
  const u = acctUser_(token), key = sigKey_(u);
  return withLock_(() => {
    const x = sigAt_(ss_(), key);
    if (!x.row) return { ok: true };
    x.sh.deleteRow(x.row);   // ไม่เก็บรูปในถังขยะ
    audit_('sig', key, '', 'del', { 'ลายเซ็น': 'ลบ' });
    return { ok: true };
  });
}
/* ---------- API 131 (24 พ.ย.): ลายเซ็นในฟอร์ม ----------
 * kind lv = ใบลา (id = src|key แบบเดียวกับรับทราบใบลา): me = ผู้ลา · ack = หัวหน้างานที่กดรับทราบ (ช่องลงชื่อในตรา)
 * kind so = Standing order (id = แถวแจกงานแพทย์): doc = แพทย์ · rn = พยาบาลรังสีรักษาที่ยืนยัน · cc = พยาบาล call center
 * kind ct = ใบสั่ง CT Simulation (id = นัด CT Order): doc = แพทย์ผู้สั่ง (Attending Oncologist)
 * คนในฟอร์มหาจากรายการที่บันทึกไว้เท่านั้น (ขอลายเซ็นของใครก็ได้ตรง ๆ ไม่ได้) · ผู้ขอต้องเห็นแถบที่มีฟอร์มนั้น (หรือเป็นผู้ลาเอง / หัวหน้างานของทีม)
 * คน → ลายเซ็น: บัญชีที่เชื่อมในรายชื่อบุคลากร (ตั้งค่า → ทีม) · ไม่ได้เชื่อม = ชื่อตรงกับชื่อของบัญชีที่บันทึกลายเซ็น (ชื่อซ้ำหลายบัญชี = ไม่ใส่)
 * ไม่มีลายเซ็น = ไม่ส่งช่องนั้น (หน้าเว็บเว้นว่างเหมือนเดิม) · who = รหัส / ชื่อที่ใช้หา (หน้าเว็บใส่เฉพาะเมื่อตรงกับที่ฟอร์มแสดง) */
const SIG_FORM_VIEWS_ = { lv: GUEST_TABLES.lvack, so: ['dq', 'nurse', 'consult', 'appt'], ct: ['appt', 'ctsim', 'nurse', 'consult', 'contour'] };
function sigPerson_(cfg, src, who) {
  const w = String(who == null ? '' : who).trim();
  if (!w) return null;
  const list = k => (Array.isArray(cfg[k]) ? cfg[k] : []).filter(x => x && typeof x === 'object');
  const code = x => String(x.code || '').trim().toUpperCase() === w.toUpperCase(), nm = x => !!String(x.name || '').trim() && nameKey_(x.name) === nameKey_(w);
  const rows = src === 'mp' ? list('staff').filter(code) : src === 'ro' ? list('doctors').filter(code) : src === 'rtt' ? list('crew').filter(nm)
    : list('staff').concat(list('doctors'), list('crew')).filter(nm);
  const users = rows.map(x => String(x.user || '').trim().toLowerCase()).filter(String).filter((v, i, a) => a.indexOf(v) === i);
  const p = rows[0];
  return { who: w, user: users.length === 1 ? users[0] : '', name: p && String(p.name || '').trim() ? String(p.name).trim() : src === 'mp' || src === 'ro' ? '' : w };
}
function sigForm(kind, id, token) {
  kind = String(kind || '');
  id = String(id == null ? '' : id).slice(0, 300);
  if (!SIG_FORM_VIEWS_[kind]) throw new Error('ไม่รู้จักฟอร์มนี้');
  if (!id) throw new Error('ไม่พบรายการของฟอร์มนี้');
  const ss = ss_(), cfg = readConfig_(ss) || {}, u = who_(token, ss, cfg);
  const sees = u.via === 'google' || u.isAdmin || u.isSub || SIG_FORM_VIEWS_[kind].some(v => !!userAccess_(cfg, v, u));
  const want = {};
  if (kind === 'lv') {
    const i = id.indexOf('|'), src = id.slice(0, i), key = id.slice(i + 1);
    if (LVACK_SRC.indexOf(src) < 0 || !key) throw new Error('ไม่พบใบลานี้');
    let who = '';
    if (src === 'mp' || src === 'ro') {
      const x = openRow_(ss, src === 'mp' ? 'leaves' : 'dqLeave', null, key);
      if (!x.row) throw new Error('ไม่พบวันลานี้ (อาจถูกลบไปแล้ว)');
      who = String(src === 'mp' ? x.cur.mp : x.cur.doc).toUpperCase();
    } else {
      const p = key.split('|'), from = p[1] || '', type = LTYPE_(p.slice(3).join('|'));
      const l = jobLeaves_(ss).filter(y => nameKey_(y.who) === p[0] && y.date === from && LTYPE_(y.type) === type)[0];
      if (!l) throw new Error('ไม่พบวันลานี้ (อาจถูกลบไปแล้ว)');
      who = l.who;
    }
    const team = leaveTeam_(cfg, src, who);
    if (!sees && !leaveMine_(cfg, u, src, who) && !(team && leaveHeadOk_(cfg, u, team))) throw new Error('ไม่มีสิทธิ์ดูใบลานี้');
    want.me = sigPerson_(cfg, src, who);
    const a = openRow_(ss, 'lvack', null, id);
    if (a.row && String(a.cur.at || '')) want.ack = { who: String(a.cur.user || ''), user: String(a.cur.user || '').trim().toLowerCase(), name: String(a.cur.by || '') };
  } else {
    if (!sees) throw new Error('ไม่มีสิทธิ์ดูฟอร์มนี้');
    const x = openRow_(ss, kind === 'so' ? 'dq' : 'appt', null, id);
    if (!x.row) throw new Error('ไม่พบรายการของฟอร์มนี้ (อาจถูกลบไปแล้ว)');
    want.doc = sigPerson_(cfg, 'ro', x.cur.doc);
    if (kind === 'so') {
      if (String(x.cur.nurse || '')) want.rn = sigPerson_(cfg, 'name', x.cur.nurseBy);
      let so = {};
      try { so = JSON.parse(x.cur.so || '{}') || {}; } catch (e) { so = {}; }
      want.cc = sigPerson_(cfg, 'name', String(so.rn || '').trim() || x.cur.by);
    }
  }
  // ลายเซ็น: อ่านเฉพาะคอลัมน์บัญชี / ชื่อ แล้วอ่านรูปเฉพาะแถวที่ต้องใช้
  const out = {}, sh = sheet_(ss, TABLES.sig.sheet);
  if (!sh || sh.getLastRow() < 2) return { slots: out };
  const header = headerOf_(sh), col = h => header.indexOf(h), cu = col('บัญชี'), cn = col('ชื่อ'), ci = col('ลายเซ็น (PNG)'), ca = col('บันทึกเมื่อ');
  if (cu < 0 || ci < 0) return { slots: out };
  const w = Math.max(cu, cn) + 1, rows = sh.getRange(2, 1, sh.getLastRow() - 1, w).getValues();
  const byUser = {}, byName = {};
  rows.forEach((r, i) => {
    const us = String(r[cu] || '').trim().toLowerCase(), nk = cn >= 0 ? nameKey_(r[cn]) : '';
    if (us) byUser[us] = i + 2;
    if (nk) byName[nk] = byName[nk] === undefined ? i + 2 : 0;   // ชื่อซ้ำหลายบัญชี = 0 (ไม่ใช้)
  });
  const imgs = {};
  Object.keys(want).forEach(k => {
    const p = want[k];
    if (!p) return;
    const row = (p.user && byUser[p.user]) || (!p.user && p.name ? byName[nameKey_(p.name)] || 0 : 0);
    if (!row) return;
    if (!imgs[row]) imgs[row] = sh.getRange(row, 1, 1, Math.max(ci, ca) + 1).getValues()[0];
    const img = String(imgs[row][ci] || '');
    if (SIG_RE_.test(img)) out[k] = { img: img, who: String(p.who || '') };
  });
  return { slots: out };
}
// เปลี่ยนรหัสผ่าน · ใส่รหัสเดิมผิดได้ 5 ครั้งต่อ 15 นาที (RO Workspace ไม่ได้นับให้คำสั่งนี้)
function acctPassword(oldPw, newPw, token) {
  const u = acctUser_(token), o = String(oldPw == null ? '' : oldPw), n = String(newPw == null ? '' : newPw);
  if (!o) throw new Error('กรอกรหัสผ่านเดิม');
  if (n.length < 8) throw new Error('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร');
  if (n.length > 200) throw new Error('รหัสผ่านยาวเกินไป');
  if (n === o) throw new Error('รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม');
  const c = CacheService.getScriptCache(), k = 'pwfail_' + String(u.username || '').toLowerCase(), fails = Number(c.get(k) || 0);
  if (fails >= 5) throw new Error('ใส่รหัสผ่านเดิมผิดหลายครั้ง กรุณารอ 15 นาที (หรือใช้ ลืมรหัสผ่าน ที่หน้าเข้าสู่ระบบ)');
  let out;
  try { out = acctCall_({ action: 'changePassword', oldPassword: o, newPassword: n }, token); } catch (e) {
    if (/รหัสผ่านเดิมไม่ถูกต้อง/.test(e.message)) c.put(k, String(fails + 1), 900);
    throw e;
  }
  c.remove(k);
  return { message: String(out.message || 'เปลี่ยนรหัสผ่านเรียบร้อย') };
}
// อุปกรณ์ / แอปที่เข้าสู่ระบบด้วยบัญชีนี้ (ไม่ส่ง token ของเครื่องอื่น: รหัสอ้างอิง 16 ตัว)
function acctSessions(token) {
  acctUser_(token);
  const out = acctCall_({ action: 'sessionList' }, token);
  return { sessions: (Array.isArray(out.sessions) ? out.sessions : []).slice(0, 60).map(s => ({ id: String(s.id || ''), current: s.current === true, ua: String(s.ua || '').slice(0, 300),
    via: String(s.via || '').slice(0, 20), app: String(s.app || '').slice(0, 80), createdAt: Number(s.createdAt) || null, lastSeen: Number(s.lastSeen) || null, expiresAt: Number(s.expiresAt) || null })) };
}
// ออกจากระบบเครื่องหนึ่ง (id) หรือทุกเครื่องยกเว้นเครื่องนี้ ('others')
function acctSignOut(id, token) {
  acctUser_(token);
  const others = id === 'others', sid = String(id == null ? '' : id);
  if (!others && !/^[0-9a-f]{16}$/.test(sid)) throw new Error('ไม่พบการเข้าสู่ระบบนี้');
  const out = acctCall_(others ? { action: 'sessionRevoke', others: true } : { action: 'sessionRevoke', id: sid }, token);
  if (out.self) lpchDrop_(token);
  return { count: Number(out.count) || 0, self: out.self === true, message: String(out.message || '') };
}
// จัดการสมาชิก (สิทธิ์ "จัดการสมาชิก" ใน RO Workspace)
function acctMembers(token) {
  acctUser_(token);
  const out = acctCall_({ action: 'listUsers' }, token);
  return { users: (Array.isArray(out.users) ? out.users : []).map(acctOut_), roles: acctRoles_() };
}
const ACCT_USER_RE_ = /^[a-z0-9._-]{3,30}$/;
// อนุมัติ / ระงับ / เปิดใช้ (status) และเปลี่ยนตำแหน่ง (role) · ไม่แตะระดับ admin
function acctMemberSave(rec, token) {
  const me = acctUser_(token);
  rec = rec && typeof rec === 'object' ? rec : {};
  const username = signupText_(rec.username, 40).toLowerCase(), status = signupText_(rec.status, 12), role = signupText_(rec.role, 30);
  if (!ACCT_USER_RE_.test(username)) throw new Error('ไม่พบผู้ใช้');
  if (status && ['active', 'pending', 'disabled'].indexOf(status) < 0) throw new Error('สถานะไม่ถูกต้อง');
  if (!status && !role) throw new Error('ไม่มีอะไรเปลี่ยน');
  const req = { action: 'updateUser', username: username };
  if (status) req.status = status;
  if (role) req.role = role;
  const user = acctOut_(acctCall_(req, token).user || {});
  if (rec.from === 'pending' && status === 'active' && user.username) { try { acctWelcome_(user, me); } catch (e) { console.log('acctWelcome ' + e); } }
  return { user: user };
}
// อนุมัติแล้ว: ข้อความถึงบัญชีนั้น (เห็นเมื่อเข้าสู่ระบบ) + อีเมลถึงอีเมลที่ใช้สมัคร (ตาม config.msg.mail)
function acctWelcome_(user, admin) {
  const cfg = readConfig_(ss_()) || {}, m = cfg.msg || {};
  const title = 'บัญชีของคุณได้รับอนุมัติแล้ว', text = 'เข้าสู่ระบบ LPCH RT Hub และ LPCH RO Workspace ได้ด้วยชื่อผู้ใช้ ' + user.username + ' และรหัสผ่านที่ตั้งไว้ตอนสมัคร';
  inboxPost_(cfg, { acc: '', name: 'ระบบสมัครสมาชิก' }, [{ acc: user.username, name: user.fullName || user.username }], 'acct', title, text, '', false, []);
  if (m.mail === false || !SIGNUP_EMAIL_RE_.test(user.email) || MailApp.getRemainingDailyQuota() < 1) return;
  const url = tgUrl_();
  MailApp.sendEmail({ to: user.email, subject: '[RT Hub] ' + title, name: 'LPCH RT Hub',
    body: 'เรียน ' + (user.fullName || user.username) + '\n\n' + text + (url ? '\nเปิด RT Hub: ' + url : '') + '\n\nอนุมัติโดย ' + String(admin.name || admin.username || '') });
}
// ลบได้เฉพาะบัญชีที่รออนุมัติ (ปฏิเสธการสมัคร) · บัญชีอื่น = ระงับ หรือลบที่หน้า RO Workspace
function acctMemberDelete(username, token) {
  acctUser_(token);
  const name = signupText_(username, 40).toLowerCase();
  if (!ACCT_USER_RE_.test(name)) throw new Error('ไม่พบผู้ใช้');
  const cur = (acctCall_({ action: 'listUsers' }, token).users || []).filter(x => String(x.username) === name)[0];
  if (!cur) throw new Error('ไม่พบผู้ใช้');
  if (cur.status !== 'pending') throw new Error('ลบได้เฉพาะบัญชีที่รออนุมัติ (ปฏิเสธการสมัคร) · บัญชีอื่นใช้ ระงับ แทน หรือลบที่หน้า LPCH RO Workspace');
  acctCall_({ action: 'deleteUser', username: name }, token);
  return { ok: true };
}
// ลืมรหัสผ่าน ขั้นที่ 1: RO Workspace ส่งรหัส 6 หลักไปที่อีเมลของบัญชี (ข้อความเดียวกันทุกกรณี ไม่บอกว่ามีบัญชีหรือไม่)
function lpchForgot(login) {
  const l = signupText_(login, 120).toLowerCase();
  if (!l) throw new Error('กรุณากรอกชื่อผู้ใช้หรืออีเมล');
  signupGuard_('pw');
  const lim = pwLimit_('ask', l, PW_ASK_MAX, PW_ASK_SEC, 'ขอรหัสยืนยันของบัญชีนี้หลายครั้งแล้ว · ใช้รหัสล่าสุดในอีเมล หรือรอ 1 ชั่วโมงแล้วขอใหม่');   // API 140
  lim.add();
  try { return { message: String(lpchCall_({ action: 'forgotPassword', login: l }).message || '') }; } catch (e) { throw lpchOld_(e) ? new Error(LPCH_OLD_MSG) : e; }
}
// ขั้นที่ 2: รหัสจากอีเมล + รหัสผ่านใหม่ → ตั้งที่ RO Workspace แล้วเข้าสู่ระบบให้เลย (เข้าไม่ได้ เช่น บัญชีรออนุมัติ = loginErr ให้เข้าสู่ระบบเอง)
function lpchReset(login, code, newPassword, have) {
  const l = signupText_(login, 120).toLowerCase(), c = String(code == null ? '' : code).replace(/\s/g, '').slice(0, 12), p = String(newPassword == null ? '' : newPassword);
  if (!l) throw new Error('กรุณากรอกชื่อผู้ใช้หรืออีเมล');
  if (!/^\d{6}$/.test(c)) throw new Error('กรอกรหัสยืนยัน 6 หลักจากอีเมล');
  if (p.length < 8) throw new Error('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
  if (p.length > 200) throw new Error('รหัสผ่านยาวเกินไป');
  signupGuard_('pw');
  const lim = pwLimit_('try', l, PW_TRY_MAX, PW_TRY_SEC, 'ใส่รหัสยืนยันผิดหลายครั้ง · รอ 15 นาทีแล้วขอรหัสใหม่');   // API 140: กันเดารหัส 6 หลัก
  let out;
  try { out = lpchCall_({ action: 'resetPassword', login: l, code: c, newPassword: p }); } catch (e) { if (!lpchOld_(e)) lim.add(); throw lpchOld_(e) ? new Error(LPCH_OLD_MSG) : e; }
  lim.clear();
  const r = { username: String(out.username || ''), message: String(out.message || 'ตั้งรหัสผ่านใหม่เรียบร้อย') };
  if (r.username) { try { Object.assign(r, lpchLogin(r.username, p, have)); } catch (e) { r.loginErr = String(e.message || e); } }
  return r;
}

/* ---------- Treatment Summary (API 98): หน่วยงานภายนอกดูสรุปการรักษาของผู้ป่วยกำลังฉายและ Complete course ----------
 * หน่วยงาน = ตำแหน่ง (role) ในบัญชีกลาง LPCH RO Workspace · ตารางหน่วยงาน (config.txs.units): ดูอย่างเดียว / ดูและพิมพ์ · ขอบเขต ผู้ป่วยทั้งหมด / ผู้ป่วยที่ส่งต่อ
 * ตำแหน่งที่ไม่ใช่ของแผนก (ไม่อยู่ใน LPCH_ROLES) ที่อยู่ในตาราง = หน่วยงานภายนอก เห็นเฉพาะแถบนี้ ได้ข้อมูลเฉพาะที่ใช้ทำสรุป (ชื่อผู้ป่วยแบบย่อ · ผู้ป่วยในขอบเขต)
 * หน่วยงานที่ไม่อยู่ในตาราง = เข้าแถบนี้ไม่ได้ (ตำแหน่งของแผนกตาม ตั้งค่า → แถบเมนู · ค่าเริ่มต้น MP และแอดมินดูได้)
 * ทุกการเข้าสู่ระบบของหน่วยงาน การดู การพิมพ์ การเปิด PDF และการปฏิเสธ = หนึ่งแถวในชีต TxsLog (เพิ่มอย่างเดียว ไม่มีฟังก์ชันแก้หรือลบ · ป้องกันชีตให้เจ้าของไฟล์เท่านั้น)
 * ผู้ป่วยที่ส่งต่อ (ชีต TxsRefer) แอดมินเพิ่ม / ลบ · ชื่อเต็มของผู้ป่วยส่งเฉพาะตอนพิมพ์ (หน่วยงานที่พิมพ์ได้) */
/* ---------- API 145 (26 พ.ย.): Chart check ตาม AAPM TG-275 / MPPG 11.a (แถบ chartchk · ทดลองใช้) ----------
 * ตรวจ chart ของคอร์สฉายรังสี 3 ช่วง: initial (ก่อน Fx 1) · weekly (ไม่เกินทุก 5 fx) · eot (จบการรักษา) · หน้าเว็บคำนวณว่าถึงกำหนดเมื่อไร
 * ลงชื่อ = ต้องบันทึกได้ในแถบ chartchk · ตอบทุกข้อ (ผ่าน / พบปัญหา + หมายเหตุ / ไม่เกี่ยว) · ยกเลิก = ผู้ลงชื่อเองหรือแอดมิน */
const CCK_VIEW = 'chartchk';
const CCK_TYPES = ['initial', 'weekly', 'eot'];
function chartCheck(req, token) {
  req = req && typeof req === 'object' ? req : {};
  const u = requireEdit_(token, [CCK_VIEW]);
  const cut = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  const me = String(u.name || u.username || u.me || ''), acct = String(u.username || u.me || '').trim().toLowerCase(), now = new Date().toISOString();
  if (req.undo) {
    const id = cut(req.id, 120);
    if (!id) throw new Error('ไม่ได้ระบุ Chart check');
    return withLock_(() => {
      const ss = ss_(), x = openRow_(ss, 'cck', null, id), cur = x.cur;
      if (!x.row || !cur || String(cur.undo || '')) throw new Error('ไม่พบ Chart check นี้ (อาจถูกยกเลิกไปแล้ว)');
      const mine = !!acct && String(cur.user || '').trim().toLowerCase() === acct;
      if (!mine && !u.isAdmin && !u.isSub && u.via !== 'google') throw new Error('ยกเลิก Chart check ได้เฉพาะผู้ลงชื่อหรือแอดมิน');
      return saveRow_(x, TABLES.cck.fields, { undo: now, undoBy: me });
    });
  }
  const cs = cut(req.case, 60), type = CCK_TYPES.indexOf(req.type) >= 0 ? req.type : '';
  if (!cs || cs.indexOf('|') >= 0) throw new Error('ไม่ได้ระบุเคส');
  if (!type) throw new Error('ช่วงของ Chart check ไม่ถูกต้อง (initial / weekly / eot)');
  const fx = Math.floor(+req.fx), total = Math.floor(+req.total);
  if (!(fx >= 0 && fx <= 300) || !(total >= 0 && total <= 300)) throw new Error('จำนวน fraction ไม่ถูกต้อง');
  const src = req.items && typeof req.items === 'object' && !Array.isArray(req.items) ? req.items : {}, items = {};
  let issues = 0;
  Object.keys(src).slice(0, 40).forEach(k => {
    const v = src[k] && typeof src[k] === 'object' ? src[k] : {}, a = ['ok', 'bad', 'na'].indexOf(v.a) >= 0 ? v.a : '';
    if (!/^[a-z0-9]{1,16}$/.test(k) || !a) return;
    const n = cut(v.n, 300);
    if (a === 'bad' && !n) throw new Error('ข้อที่พบปัญหาต้องมีหมายเหตุ');
    items[k] = n ? { a: a, n: n } : { a: a };
    if (a === 'bad') issues++;
  });
  if (!Object.keys(items).length) throw new Error('ยังไม่ได้ตอบรายการตรวจ');
  const id = cs + '|' + type + (type === 'weekly' ? '|' + fx : '');
  return withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'cck', null, id);
    if (x.row && x.cur && !String(x.cur.undo || '')) throw new Error('Chart check นี้ลงชื่อไว้แล้วโดย ' + (x.cur.by || '-') + ' (ยกเลิกก่อนถ้าต้องการตรวจใหม่)');
    return saveRow_(x, TABLES.cck.fields, { id: id, case: cs, hn: cut(req.hn, 20), name: cut(req.name, 120), type: type, fx: String(fx), total: String(total), items: JSON.stringify(items),
      issues: String(issues), note: cut(req.note, 500), by: me, user: acct, at: now, undo: '', undoBy: '' });
  });
}
/* ---------- API 146 (26 พ.ย.): Treatment Order ของรังสีระยะไกล (เริ่มที่แถบ Contouring) ----------
 * act: save / sign = แพทย์ (บันทึกได้ในแถบ Evaluation) · mp = นักฟิสิกส์ใส่ค่าที่ได้จากแผน + ข้อมูลแผน (บันทึกได้ในแถบงาน / งานรอ / ตารางแจกเคส)
 * note / done = ทุกคนที่เห็นใบสั่ง · ack / unack = RTT รับทราบคำสั่งการฉาย (บันทึกได้ในแถบห้องฉาย) หลังลงนาม Rx
 * แก้ Rx หลังลงนาม = เวอร์ชันใหม่ (ver + 1) ต้องลงนามใหม่ · note ถึง RO / MP = ข้อความส่วนตัวถึงแพทย์เจ้าของไข้ / MP ของเคส (HN + ข้อความ · ไม่มีชื่อผู้ป่วย) */
const TXO_VIEWS = ['contour', 'work', 'pend', 'queue', 'evaluate', 'course', 'pchart', 'chartchk'];
const txoCut_ = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const txoNum_ = (v, lo, hi) => { if (v === '' || v == null) return null; const n = parseFloat(v); return isFinite(n) && n >= lo && n <= hi ? Math.round(n * 1000) / 1000 : null; };
function txoJson_(v, def) { try { const x = JSON.parse(String(v || '')); return x == null || typeof x !== typeof def || Array.isArray(x) !== Array.isArray(def) ? def : x; } catch (e) { return def; } }
const txoPick_ = (v, list) => (list.indexOf(v) >= 0 ? v : '');
function txoClin_(o) {
  o = o && typeof o === 'object' ? o : {};
  return { stage: txoCut_(o.stage, 80), path: txoCut_(o.path, 120), ecog: txoPick_(String(o.ecog == null ? '' : o.ecog), ['0', '1', '2', '3', '4']), chemo: txoCut_(o.chemo, 160),
    lat: txoPick_(o.lat, ['Left', 'Right', 'Bilateral', 'Midline', 'N/A']), cied: txoPick_(o.cied, ['no', 'yes']), prev: txoPick_(o.prev, ['no', 'yes']), preg: txoPick_(o.preg, ['na', 'no', 'yes']), risk: txoCut_(o.risk, 200) };
}
function txoTv_(o) { o = o && typeof o === 'object' ? o : {}; return { fusion: txoCut_(o.fusion, 200), targets: txoCut_(o.targets, 300), oars: txoCut_(o.oars, 400) }; }
function txoDlv_(o) { o = o && typeof o === 'object' ? o : {}; return { aim: txoPick_(o.aim, ['Curative', 'Palliative']), freq: txoCut_(o.freq, 60), tgt: txoCut_(o.tgt, 300), oar: txoCut_(o.oar, 400), tech: txoCut_(o.tech, 120), energy: txoCut_(o.energy, 60), bolus: txoCut_(o.bolus, 120), motion: txoCut_(o.motion, 120), special: txoCut_(o.special, 400) }; }
function txoPlan_(o) { o = o && typeof o === 'object' ? o : {}; return { name: txoCut_(o.name, 80), algo: txoCut_(o.algo, 80), note: txoCut_(o.note, 300) }; }
function txoRx_(a) {
  return (Array.isArray(a) ? a : []).slice(0, 8).map(r => { r = r && typeof r === 'object' ? r : {}; return { ph: txoCut_(r.ph, 40), t: txoCut_(r.t, 40), site: txoCut_(r.site, 120), dpf: txoNum_(r.dpf, 0, 30), fx: txoNum_(r.fx, 0, 60), freq: txoCut_(r.freq, 40), how: txoCut_(r.how, 120) }; })
    .filter(r => r.t || r.site || r.dpf || r.fx);
}
const txoKey_ = c => c.s + '|' + c.m;
function txoCon_(a, old) {
  const got = {};
  (Array.isArray(old) ? old : []).forEach(c => { if (c && c.s) got[txoKey_(c)] = c.got; });
  return (Array.isArray(a) ? a : []).slice(0, 40).map(c => {
    c = c && typeof c === 'object' ? c : {};
    const r = { s: txoCut_(c.s, 40), m: txoCut_(c.m, 24), op: c.op === '≥' ? '≥' : '≤', lim: txoNum_(c.lim, -1000, 100000), u: txoPick_(c.u, ['Gy', '%', 'cc', 'cGy']) || 'Gy', pr: c.pr === 'must' ? 'must' : 'want', got: null };
    const g = got[txoKey_(r)];
    r.got = g === undefined || g === null ? null : txoNum_(g, -1000, 100000);
    return r;
  }).filter(c => c.s && c.m && c.lim !== null);
}
function txOrder(req, token) {
  req = req && typeof req === 'object' ? req : {};
  const act = String(req.act || ''), id = txoCut_(req.id, 80);
  if (['save', 'sign', 'mp', 'note', 'done', 'ack', 'unack', 'rem', 'rck'].indexOf(act) < 0) throw new Error('คำสั่งของ Treatment Order ไม่ถูกต้อง');
  if (!id) throw new Error('ไม่ได้ระบุรายการ CT-SIM ของใบสั่ง');
  const views = act === 'save' || act === 'sign' ? ['evaluate'] : act === 'mp' || act === 'rck' ? EDIT_VIEWS.cases : act === 'ack' || act === 'unack' ? ['course'] : act === 'rem' ? ['course', 'evaluate'] : null;   // API 148: rem = Treatment Remark (RTT / แพทย์) · rck = MP Recheck
  const ss0 = ss_(), cfg = readConfig_(ss0) || {};
  const u = views ? requireEdit_(token, views) : who_(token, ss0, cfg);
  if (!views && u.via !== 'google' && !TXO_VIEWS.some(v => userAccess_(cfg, v, u))) throw new Error('ไม่มีสิทธิ์ดู Treatment Order');
  const me = String(u.name || u.username || u.me || ''), acct = String(u.username || u.me || '').trim().toLowerCase(), now = new Date().toISOString();
  let dm = null;
  const row = withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'txo', null, id), cur = x.row && x.cur ? x.cur : null, set = {};
    if (!cur) {
      if (act !== 'save' && act !== 'sign' && act !== 'note') throw new Error('ยังไม่มี Treatment Order ของรายการนี้');
      const ct = openRow_(ss, 'ctsim', null, id);
      if (!ct.row || !ct.cur) throw new Error('ไม่พบรายการ CT-SIM ของใบสั่งนี้ (อาจถูกลบไปแล้ว)');
      Object.assign(set, { id: id, hn: String(ct.cur.hn || ''), name: String(ct.cur.name || ''), ctDate: String(ct.cur.date || '').slice(0, 10), doc: String(ct.cur.doc || '').toUpperCase(),
        form: 'full', ver: '1', clin: '{}', tv: '{}', rx: '[]', con: '[]', dlv: '{}', plan: '{}', notes: '[]', rxBy: '', rxUser: '', rxAt: '', rttBy: '', rttAt: '' });
    }
    const base = cur || set, J = (k, d) => txoJson_(base[k], d);
    if (act === 'save' || act === 'sign') {
      const rx = req.rx !== undefined ? txoRx_(req.rx) : txoRx_(J('rx', []));
      set.form = req.form === 'short' || req.form === 'full' ? req.form : String(base.form || 'full') === 'short' ? 'short' : 'full';
      set.rx = JSON.stringify(rx);
      if (req.clin !== undefined) set.clin = JSON.stringify(txoClin_(req.clin));
      if (req.tv !== undefined) set.tv = JSON.stringify(txoTv_(req.tv));
      if (req.dlv !== undefined) { const rem = J('dlv', {}).rem; set.dlv = JSON.stringify(Object.assign(txoDlv_(req.dlv), Array.isArray(rem) ? { rem: rem } : {})); }   // API 148: Treatment Remark คงเดิม
      if (req.con !== undefined) set.con = JSON.stringify(txoCon_(req.con, J('con', [])));
      if (cur && String(cur.rxAt || '') && JSON.stringify(rx) !== JSON.stringify(txoRx_(J('rx', [])))) {   // แก้ Rx หลังลงนาม = เวอร์ชันใหม่
        Object.assign(set, { ver: String((parseInt(cur.ver, 10) || 1) + 1), rxBy: '', rxUser: '', rxAt: '', rttBy: '', rttAt: '' });
      }
      if (act === 'sign') {
        if (!rx.length || rx.some(r => !(r.dpf > 0) || !(r.fx >= 1) || Math.floor(r.fx) !== r.fx || !(r.t || r.site))) throw new Error('Prescription ต้องมีอย่างน้อย 1 แถว และทุกแถวมี Target หรือตำแหน่ง, Gy/fx และจำนวน Fx (จำนวนเต็ม)');
        Object.assign(set, { rxBy: me, rxUser: acct, rxAt: now });
      }
    }
    if (act === 'mp') {
      const con = txoCon_(J('con', []), J('con', [])), got = req.got && typeof req.got === 'object' ? req.got : {};
      con.forEach(c => { const k = txoKey_(c); if (Object.prototype.hasOwnProperty.call(got, k)) c.got = txoNum_(got[k], -1000, 100000); });
      set.con = JSON.stringify(con);
      if (req.plan !== undefined) { const p0 = J('plan', {}); set.plan = JSON.stringify(Object.assign(txoPlan_(req.plan), p0.rckAt ? { rck: String(p0.rck || ''), rckAt: String(p0.rckAt) } : {})); }   // API 148: MP Recheck คงเดิม
    }
    if (act === 'rck') {   // API 148: MP Recheck (MP อีกคนตรวจแผน) · กดซ้ำ = ยกเลิก
      const p0 = J('plan', {});
      if (p0.rckAt) { delete p0.rck; delete p0.rckAt; } else Object.assign(p0, { rck: me, rckAt: now });
      set.plan = JSON.stringify(p0);
    }
    if (act === 'rem') {   // API 148: Treatment Remark (วันที่ · เวลา · ผู้ลงชื่อ) · เพิ่มอย่างเดียว
      const d0 = J('dlv', {}), rem = Array.isArray(d0.rem) ? d0.rem : [], text = txoCut_(req.text, 300);
      if (!text) throw new Error('พิมพ์ Treatment Remark');
      if (rem.length >= 60) throw new Error('Treatment Remark เต็มแล้ว (60 รายการ)');
      rem.push({ at: now, by: me, role: String(u.role || ''), text: text });
      d0.rem = rem;
      set.dlv = JSON.stringify(d0);
    }
    if (act === 'note' || act === 'done') {
      const notes = J('notes', []).filter(n => n && typeof n === 'object'), role = String(u.role || (u.isAdmin ? 'Admin' : ''));
      if (act === 'note') {
        const sec = /^[A-I]$/.test(String(req.sec || '')) ? String(req.sec) : '', to = txoPick_(req.to, ['RO', 'MP', 'RTT', 'Nurse']), text = txoCut_(req.text, 500);
        if (!sec || !to || !text) throw new Error('ใส่ส่วนของใบสั่ง ผู้รับ และข้อความของ note');
        if (notes.length >= 300) throw new Error('Note ของใบสั่งนี้เต็มแล้ว (300 ข้อความ)');
        notes.forEach(n => { if (n.sec === sec && !n.done && role && n.to === role) { n.done = now; n.doneBy = me; } });   // ตอบในส่วนเดียวกัน = note ที่ส่งถึงตำแหน่งนี้ตอบแล้ว
        notes.push({ id: Utilities.getUuid().slice(0, 8), sec: sec, by: me, user: acct, role: role, at: now, to: to, text: text, done: '', doneBy: '' });
        dm = { to: to, text: text };
      } else {
        const n = notes.filter(v => v.id === String(req.nid || ''))[0];
        if (!n) throw new Error('ไม่พบ note นี้');
        if (!(n.to === role || n.user === acct || u.isAdmin || u.isSub || u.via === 'google')) throw new Error('ปิด note ได้เฉพาะผู้รับ ผู้เขียน หรือแอดมิน');
        n.done = n.done ? '' : now;
        n.doneBy = n.done ? me : '';
      }
      set.notes = JSON.stringify(notes);
    }
    if (act === 'ack') {
      if (!String(base.rxAt || '')) throw new Error('Rx ยังไม่ลงนาม จึงรับทราบคำสั่งการฉายไม่ได้');
      Object.assign(set, { rttBy: me, rttAt: now });
    }
    if (act === 'unack') Object.assign(set, { rttBy: '', rttAt: '' });
    Object.assign(set, { by: me, at: now });
    return saveRow_(x, TABLES.txo.fields, set);
  });
  // note ถึงแพทย์ / MP = ข้อความส่วนตัว (กล่องข้อความ + Telegram ส่วนตัว · ไม่ส่งอีเมล · HN ไม่มีชื่อผู้ป่วย)
  if (dm && (dm.to === 'RO' || dm.to === 'MP')) {
    try {
      const ppl = ntfPeople_(cfg, [dm.to === 'RO' ? 'doc' : 'mp'], { doc: String(row.doc || ''), mp: txoCut_(req.mp, 12) }, [], acct);
      if (ppl.length) { inboxPost_(cfg, { acc: acct, name: me }, ppl.map(p => ({ acc: p.acc, name: p.name })), 'msg', 'Treatment Order · HN ' + String(row.hn || ''), 'note ถึง ' + dm.to + ': ' + dm.text, 'txo|' + id, false, []); row.sent = ppl.length; }
    } catch (e) { console.log('txOrder note ' + e); }
  }
  return row;
}
// API 148 (27 พ.ย.): HDR ในแถบ Contouring / Evaluation · ต่อนัดใส่แร่ (BrachyQueue)
// cn = Contour เสร็จต่อรอบ CT ที่บันทึกในแถบนัดคิวใส่แร่ { CT: { at, by }, 'Re-CT1': … } · ev = ประเมินแผน HDR { act: ok | edit, at, by, note, h: ประวัติ }
// Edit = ส่งกลับ MP (ล้าง MP ของนัด · MP กด + MP ใหม่เมื่อแก้เสร็จ)
function bqHdr(req, token) {
  req = req && typeof req === 'object' ? req : {};
  const act = String(req.act || ''), id = bqCut_(req.id, 80);
  if (['cn', 'ok', 'edit', 'undo'].indexOf(act) < 0) throw new Error('คำสั่งของ HDR ไม่ถูกต้อง');
  if (!id) throw new Error('ไม่ได้ระบุนัดใส่แร่');
  const u = requireEdit_(token, act === 'cn' ? ['contour'] : ['evaluate']);
  const me = String(u.name || u.username || u.me || ''), acct = String(u.username || u.me || '').trim().toLowerCase(), now = new Date().toISOString();
  const J = v => { try { const o = JSON.parse(String(v || '')); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } };
  return withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'bq', null, id), cur = x.cur;
    if (!x.row || !cur) throw new Error('ไม่พบนัดใส่แร่นี้ (อาจถูกลบไปแล้ว)');
    if ([BRACHY_ST_CANCEL, BQ_NOSHOW, BQ_PP].indexOf(String(cur.status || '')) >= 0) throw new Error('นัดนี้ยกเลิก / ไม่มา / เลื่อนนัดแล้ว');
    const set = {};
    if (act === 'cn') {
      const round = bqCut_(req.round, 20), cts = String(cur.ct || '').split(',').map(s => s.trim()).filter(Boolean), cn = J(cur.cn);
      if (cts.indexOf(round) < 0) throw new Error('ยังไม่ได้บันทึก ' + round + ' ในแถบนัดคิวใส่แร่');
      if (req.on) cn[round] = { at: now, by: me }; else delete cn[round];
      set.cn = JSON.stringify(cn);
    } else {
      const ev = J(cur.ev), h = Array.isArray(ev.h) ? ev.h : [], note = bqCut_(req.note, 300);
      if (act !== 'undo' && !String(cur.mp || '').trim()) throw new Error('MP ยังไม่ได้ลงชื่อวางแผน (+ MP ในแถบนัดคิวใส่แร่)');
      if (act === 'edit' && !note) throw new Error('ใส่หมายเหตุสิ่งที่ให้แก้');
      if (act === 'undo' && !(ev.act === 'ok' && ev.at)) throw new Error('แผนนี้ยังไม่ได้ Approved');
      if (act === 'undo' && ev.user && ev.user !== acct && !u.isAdmin) throw new Error('ยกเลิก Approved ได้เฉพาะแพทย์ที่กด Approved');
      h.push({ act: act, at: now, by: me, note: note });
      const nev = act === 'undo' ? {} : { act: act, at: now, by: me, user: acct, note: note, mp: String(cur.mp || '') };
      nev.h = h.slice(-20);
      set.ev = JSON.stringify(nev);
      if (act === 'edit') set.mp = '';   // ส่งกลับ MP
    }
    Object.assign(set, { updated: now, editedBy: me });
    return saveRow_(x, TABLES.bq.fields, set);
  });
}
// API 148: HDR Order (Brachytherapy process form) · หนึ่งแถวต่อนัดใส่แร่ (id = id ของนัด) · f = ข้อมูลในฟอร์ม (JSON) · sig = ลงนามแต่ละตำแหน่ง { RO: { by, user, at }, MP, RTT, Nurse }
const HDR_VIEWS = ['bq', 'contour', 'evaluate', 'nurse'];
const HDR_SIGN = ['RO', 'MP', 'RTT', 'Nurse'];
function hdrF_(o) {
  o = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  const out = {};
  Object.keys(o).slice(0, 80).forEach(k => {
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,20}$/.test(k)) return;
    const v = o[k];
    if (k === 'draw') { out[k] = String(v == null ? '' : v).replace(/[^a-z0-9: ]/g, '').replace(/ +/g, ' ').trim().slice(0, 36000); return; }   // API 149: เส้นที่วาดบนรูป (cxi2:xxyy… คั่นด้วยช่องว่าง)
    out[k] = Array.isArray(v) ? v.slice(0, 12).map(s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 40)) : String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, k === 'note' || k === 'pv' ? 800 : 200);
  });
  return out;
}
function recentHdro_(ss) {
  const from = Utilities.formatDate(new Date(Date.now() - 400 * 864e5), tz_(ss), 'yyyy-MM-dd');
  return readTable_(ss, 'hdro').filter(x => !String(x.date || '') || String(x.date) >= from);
}
function hdrOrder(req, token) {
  req = req && typeof req === 'object' ? req : {};
  const act = String(req.act || ''), id = bqCut_(req.id, 80);
  if (['save', 'sign', 'unsign'].indexOf(act) < 0) throw new Error('คำสั่งของ HDR Order ไม่ถูกต้อง');
  if (!id) throw new Error('ไม่ได้ระบุนัดใส่แร่ของใบสั่ง');
  const u = requireEdit_(token, HDR_VIEWS);
  const me = String(u.name || u.username || u.me || ''), acct = String(u.username || u.me || '').trim().toLowerCase(), now = new Date().toISOString();
  const J = v => { try { const o = JSON.parse(String(v || '')); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } };
  return withLock_(() => {
    const ss = ss_(), x = openRow_(ss, 'hdro', null, id), set = {};
    let cur = x.row && x.cur ? x.cur : null;
    if (!cur) {
      const b = openRow_(ss, 'bq', null, id);
      if (!b.row || !b.cur) throw new Error('ไม่พบนัดใส่แร่ของใบสั่งนี้ (อาจถูกลบไปแล้ว)');
      Object.assign(set, { id: id, hn: String(b.cur.hn || ''), name: String(b.cur.name || ''), date: String(b.cur.date || '').slice(0, 10), doc: String(b.cur.doc || '').toUpperCase(), f: '{}', sig: '{}' });
      cur = set;
    }
    if (act === 'save') {
      const f = JSON.stringify(hdrF_(req.f));
      if (f.length > 46000) throw new Error('ข้อมูลในใบสั่งยาวเกินไป (รูปที่วาดมีเส้นมากเกินไป · ลบบางเส้นก่อนบันทึก)');   // API 149: ช่องในชีตเก็บได้ 50000 ตัวอักษร
      set.f = f;
    } else {
      const role = String(req.role || ''), sig = J(cur.sig);
      if (HDR_SIGN.indexOf(role) < 0) throw new Error('ตำแหน่งที่ลงนามไม่ถูกต้อง');
      if (act === 'sign') {
        if (String(u.role || '') !== role && !u.isAdmin && u.via !== 'google') throw new Error('ลงนามได้เฉพาะช่องของตำแหน่งตัวเอง (' + String(u.role || '–') + ')');
        sig[role] = { by: me, user: acct, at: now };
      } else {
        const s = sig[role];
        if (s && s.user && s.user !== acct && !u.isAdmin && u.via !== 'google') throw new Error('ยกเลิกลงนามได้เฉพาะผู้ลงนามหรือแอดมิน');
        delete sig[role];
      }
      set.sig = JSON.stringify(sig);
    }
    Object.assign(set, { by: me, at: now });
    return saveRow_(x, TABLES.hdro.fields, set);
  });
}
const TXS_VIEW = 'txsum';
const TXS_UNITS = [
  { role: 'Chemo', label: 'เคมีบำบัด', print: false, scope: 'all' },
  { role: 'WardM', label: 'หอผู้ป่วยชาย', print: false, scope: 'all' },
  { role: 'WardF', label: 'หอผู้ป่วยหญิง', print: false, scope: 'all' },
  { role: 'ICU', label: 'ICU', print: false, scope: 'all' },
  { role: 'QLU', label: 'QLU (หอผู้ป่วย)', print: false, scope: 'all' },
  { role: 'NM', label: 'เวชศาสตร์นิวเคลียร์', print: false, scope: 'all' },
  { role: 'Refer', label: 'ศูนย์ refer (ภายใน รพ.)', print: true, scope: 'refer' },
];
const TXS_FROM = '2026-12-01';   // 21 พ.ย.: Treatment Summary แสดงเฉพาะผู้ป่วยที่เริ่มฉายตั้งแต่วันนี้ (แอดมินเปลี่ยนได้ · ว่าง = ทั้งหมด) · หน้าเว็บกรองตามค่านี้
const TXS_DAYS = 180;   // Complete course แสดงถึงกี่วันหลังฉายครั้งสุดท้าย (ตั้งได้ 7–730)
const TXS_LOG = 'TxsLog';
const TXS_LOG_HEAD = ['เวลา', 'การทำ', 'หน่วยงาน', 'ตำแหน่ง', 'ผู้ใช้', 'ชื่อผู้ใช้', 'เลขที่เอกสาร', 'HN', 'รายละเอียด'];
const TXS_REFER = 'TxsRefer';
const TXS_REFER_HEAD = ['HN', 'หมายเหตุ', 'เพิ่มโดย', 'เวลา'];
const TXS_ACTS = { pub: 'ตรวจสอบและเผยแพร่', unpub: 'ไม่เผยแพร่', login: 'เข้าสู่ระบบ', open: 'เปิดหน้าเว็บ', view: 'ดูเอกสาร', print: 'พิมพ์', pdf: 'เปิด PDF ที่จัดเก็บ', deny: 'ปฏิเสธ', 'refer+': 'เพิ่มผู้ป่วยที่ส่งต่อ', 'refer-': 'ลบผู้ป่วยที่ส่งต่อ', cfg: 'ตั้งค่าหน่วยงาน' };
const TXS_CASE_KEYS = ['id', 'cat', 'how', 'mp', 'hn', 'name', 'icd', 'dx', 'doc', 'aim', 'tech', 'room', 'dpf', 'fx', 'rx', 'freq', 'area', 'sites', 'sim', 'in', 'ct', 'pc', 'eval', 'rt', 'rtDate', 'fxlog', 'rmove', 'fxadd', 'bsteps', 'replan', 'type', 'created'];
const TXS_BQ_KEYS = ['id', 'course', 'date', 'hn', 'name', 'doc', 'tech', 'fx', 'total', 'status', 'rtt', 'mp', 'rc', 'ct', 'ctRoom', 'us', 'rtRoom', 'created'];
const TXS_ROLE_RE = /^[\w -]{1,20}$/;
const txsLow_ = v => String(v == null ? '' : v).trim().toLowerCase();
function txsCfg_(config) {
  const t = config && config.txs && typeof config.txs === 'object' ? config.txs : {}, seen = {};
  const units = (Array.isArray(t.units) ? t.units : TXS_UNITS).filter(u => u && TXS_ROLE_RE.test(String(u.role || '').trim()))
    .map(u => ({ role: String(u.role).trim(), label: String(u.label || u.role).replace(/\s+/g, ' ').trim().slice(0, 60), print: u.print === true, scope: u.scope === 'refer' ? 'refer' : 'all' }))
    .filter(u => { const k = u.role.toLowerCase(); if (seen[k]) return false; seen[k] = 1; return true; });
  const from = String(t.from == null ? '' : t.from).trim();
  const pubTeams = (Array.isArray(t.pubTeams) ? t.pubTeams : []).map(x => String(x == null ? '' : x).trim()).filter((x, i, a) => /^[\w -]{1,20}$/.test(x) && a.indexOf(x) === i).slice(0, 30);   // API 141
  return { pubTeams: pubTeams, units: units, days: Math.min(730, Math.max(7, Math.floor(+t.days) || TXS_DAYS)), folder: /^[\w-]{10,120}$/.test(String(t.folder || '').trim()) ? String(t.folder).trim() : '',
    from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : t.from === '' ? '' : TXS_FROM };
}
function txsUnit_(config, role) { const r = txsLow_(role); return r ? txsCfg_(config).units.filter(u => u.role.toLowerCase() === r)[0] || null : null; }
// หน่วยงานภายนอก: อยู่ในตารางหน่วยงาน และไม่ใช่ตำแหน่งของแผนก (LPCH_ROLES · Admin · แอดมินรอง)
function txsOuter_(config, role) {
  const r = txsLow_(role);
  return !!r && r !== ADMIN_ROLE.toLowerCase() && r !== SUB_ROLE.toLowerCase() && !LPCH_ROLES.some(x => x.toLowerCase() === r) && !!txsUnit_(config, role);
}
// สิทธิ์แถบ Treatment Summary: แอดมิน และหน่วยงานในตาราง = ดูได้ · ตำแหน่งอื่นตาม ตั้งค่า → แถบเมนู (ดูได้อย่างมาก · ยังไม่ตั้ง = MP ดูได้)
function txsNav_(config, role, base) {
  if (role === ADMIN_ROLE) return 'view';
  if (txsUnit_(config, role === SUB_ROLE ? base : role)) return 'view';
  const nav = config && Array.isArray(config.nav) ? config.nav : [], x = nav.filter(n => n && n.view === TXS_VIEW)[0];
  const acc = x && x.access && typeof x.access === 'object' ? x.access : null;
  if (acc && Object.prototype.hasOwnProperty.call(acc, role) && ['edit', 'view', ''].indexOf(acc[role]) >= 0) return acc[role] ? 'view' : '';
  if (role === SUB_ROLE) return txsNav_(config, base || '', '');
  if (x && x.on === false) return '';
  return LPCH_EDIT_ROLES.indexOf(role) >= 0 ? 'view' : '';
}
// ผู้ใช้กับแถบนี้: ok = เข้าได้ · print = พิมพ์ได้ · scope = all / refer · admin = จัดการรายชื่อ ประวัติ ตารางหน่วยงาน
function txsWho_(config, u) {
  const google = !!u && u.via === 'google', admin = google || !!(u && u.isAdmin);
  const unit = google || !u ? null : txsUnit_(config, u.role);
  return {
    ok: admin || !!(u && userAccess_(config, TXS_VIEW, u)), admin: admin, unit: unit, outer: !google && !!u && txsOuter_(config, u.role),
    print: admin || !!(unit && unit.print), scope: !admin && unit ? unit.scope : 'all',
    label: unit ? unit.label : google ? 'บัญชี Google' : u && u.isAdmin ? 'แอดมิน' : 'ตำแหน่ง ' + ((u && u.role) || '-'),
  };
}
// ชื่อผู้ป่วยแบบย่อ (มุมมองทั่วไป): ไม่มีคำนำหน้า · ชื่อ + อักษรแรกของนามสกุล (สระหน้าไทยรวมพยัญชนะตัวถัดไป) · เหมือน txsShort ในหน้าเว็บ
const TXS_TITLE_RE = /^(?:นางสาว|นาง|นาย|เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.|น\.ส\.|mrs\.?|mr\.?|ms\.?|miss)\s*/i;
function txsShort_(name) {
  const t = String(name == null ? '' : name).replace(/\s+/g, ' ').trim().replace(TXS_TITLE_RE, '').trim(), p = t.split(' ');
  if (p.length < 2) return t;
  const last = p.slice(1).join(' ');
  return p[0] + ' ' + (/^[เแโใไ]/.test(last) ? last.slice(0, 2) : last.slice(0, 1)) + '.';
}
// ชีตบันทึกการเข้าถึง: สร้างครั้งแรก (หัวคอลัมน์ · ข้อความล้วน · ป้องกันให้เจ้าของไฟล์แก้ได้คนเดียว)
function txsLogSheet_(ss) {
  const sh = sheet_(ss, TXS_LOG);
  if (sh) return sh;
  return withLock_(() => {
    let x = ss.getSheetByName(TXS_LOG);
    if (x) return x;
    x = ss.insertSheet(TXS_LOG);
    x.getRange(1, 1, Math.max(2, x.getMaxRows()), TXS_LOG_HEAD.length).setNumberFormat('@');
    x.getRange(1, 1, 1, TXS_LOG_HEAD.length).setValues([TXS_LOG_HEAD]).setFontWeight('bold');
    x.setFrozenRows(1);
    try {
      const pr = x.protect().setDescription('บันทึกการเข้าถึง Treatment Summary: ระบบเพิ่มแถวอย่างเดียว ห้ามแก้หรือลบ');
      const me = Session.getEffectiveUser();
      pr.addEditor(me);
      pr.removeEditors(pr.getEditors().filter(e => e.getEmail() !== me.getEmail()));
      if (pr.canDomainEdit()) pr.setDomainEdit(false);
    } catch (e) { console.log('txsLogSheet_ protect ' + e); }
    return x;
  });
}
// หนึ่งแถว (appendRow = ต่อท้ายเสมอ ไม่ทับแถวของคำขออื่น · ไม่ถือล็อกบันทึก)
function txsAppend_(ss, cfg, u, act, doc, hn, detail) {
  const w = u ? txsWho_(cfg, u) : null;
  const row = [new Date().toISOString(), TXS_ACTS[act] || act, w ? w.label : '', u ? String(u.role || (u.via === 'google' ? 'Google' : '')) : '',
    u ? String(u.username || u.me || '') : '', u ? String(u.name || '') : '', String(doc || ''), String(hn || ''), String(detail || '').slice(0, 300)];
  txsLogSheet_(ss).appendRow(row);
}
function txsLoginLog_(p, how) {
  try {
    if (!p || !p.role) return;
    const ss = ss_(), cfg = readConfig_(ss) || {};
    if (txsUnit_(cfg, p.role)) txsAppend_(ss, cfg, { via: 'lpch', role: p.role, username: p.username, name: p.name }, 'login', '', '', how);
  } catch (e) { console.log('txsLoginLog_ ' + e); }
}
function txsReferSheet_(ss, make) {
  let sh = sheet_(ss, TXS_REFER);
  if (!sh && make) {
    sh = ss.insertSheet(TXS_REFER);
    sh.getRange(1, 1, Math.max(2, sh.getMaxRows()), TXS_REFER_HEAD.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, TXS_REFER_HEAD.length).setValues([TXS_REFER_HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function txsReferMap_(ss) {
  if (REQ_.txsRef) return REQ_.txsRef;
  const sh = txsReferSheet_(ss, false), m = {}, last = sh ? sh.getLastRow() : 0;
  if (last > 1) sh.getRange(2, 1, last - 1, TXS_REFER_HEAD.length).getValues().forEach(r => { const k = hnKey_(r[0]); if (k) m[k] = { hn: k, note: String(r[1] || ''), by: String(r[2] || ''), at: String(r[3] || '') }; });
  return (REQ_.txsRef = m);
}
const txsHn_ = v => hnKey_(v).replace(/[^0-9A-Z]/g, '').slice(0, 15);
const txsDoc_ = v => String(v || '').replace(/[^\w.-]/g, '').slice(0, 40);
// getData: ข้อมูลของแถบนี้ (รุ่นเดียวกับที่หน้าเว็บมี = ไม่ส่งซ้ำ) · ตารางที่ผู้ใช้ได้รับอยู่แล้วไม่ส่งซ้ำ
function txsOut_(ss, cfg, w, need, have, out) {
  const vers = tableVers_(), lack = ['cases', 'duty', 'bq', 'reg'].filter(k => !need[k]), refer = w.admin || !w.unit || w.scope === 'refer';
  const v = lack.concat(refer ? [TXS_REFER] : []).concat([TXS_PUB]).map(t => t + ':' + (vers[t] || '')).join('.') + '@' + today_(ss) + '|' + [w.scope, w.print ? 1 : 0, w.admin ? 1 : 0].join('') + '|' + strHash_(JSON.stringify(txsCfg_(cfg)));
  out.ver = out.ver || {};
  out.same = out.same || [];
  out.ver.txs = v;
  if (have && have.v && have.v.txs === v) { out.same.push('txs'); return; }
  out.txs = txsData_(ss, cfg, w, lack, refer);
}
// การตั้งค่าที่ส่งให้หน่วยงานภายนอก: ตัดรายชื่อแอดมิน บัญชี LPCH / อีเมลของบุคลากร รหัสชีตและโฟลเดอร์ของระบบอื่น และการตั้งค่า P4P / งานของแผนก
const TXS_CFG_DROP = ['admins', 'subAdmins', 'brachySync', 'tdfSync', 'tdfApp', 'roP4p', 'reg', 'appt', 'dq', 'jobs', 'vac', 'teams', 'crew', 'positions', 'guarantee', 'rate', 'carry', 'acts', 'order', 'machine', 'sendBook', 'tg', 'leave'];   // tg (API 115): กลุ่ม Telegram
function txsCfgOut_(c) {
  if (!c || typeof c !== 'object') return c;
  const out = {};
  Object.keys(c).forEach(k => { if (TXS_CFG_DROP.indexOf(k) < 0) out[k] = c[k]; });
  ['staff', 'doctors'].forEach(k => { if (Array.isArray(out[k])) out[k] = out[k].map(x => { if (!x || typeof x !== 'object') return x; const y = Object.assign({}, x); delete y.user; delete y.email; delete y.phone; return y; }); });
  return out;
}
function txsPick_(o, keys) { const r = {}; keys.forEach(k => { if (o[k] != null && o[k] !== '') r[k] = o[k]; }); return r; }
// สถานะ fraction: ไม่ส่งหมายเหตุและผู้บันทึก (เอกสารไม่มีช่องหมายเหตุ)
function txsFxlog_(v) {
  let a = [];
  try { a = JSON.parse(String(v || '[]')); } catch (e) { a = []; }
  return Array.isArray(a) ? JSON.stringify(a.filter(x => x && typeof x === 'object').map(x => { const y = Object.assign({}, x); delete y.note; delete y.by; delete y.at; return y; })) : '';
}
function txsData_(ss, cfg, w, lack, sendRefer) {
  const t = txsCfg_(cfg), td = today_(ss), day = n => Utilities.formatDate(new Date(Date.parse(td + 'T12:00:00Z') + n * 864e5), 'UTC', 'yyyy-MM-dd');
  const cut = day(-t.days), old = day(-t.days - 120), isD = x => /^\d{4}-\d{2}-\d{2}$/.test(String(x || ''));
  const ref = sendRefer || w.scope === 'refer' ? txsReferMap_(ss) : {};
  const ok = hn => !!hnKey_(hn) && (w.scope !== 'refer' || !!ref[hnKey_(hn)]);
  const want = k => lack.indexOf(k) >= 0, hns = {}, out = { refer: sendRefer ? Object.keys(ref).map(k => ref[k]) : [] };
  const pub = txsPubMap_(ss), only = !!w.outer, okPub = key => !only || txsIsPub_(pub, key);   // API 141
  let from = want('cases') || want('bq') ? td : old;
  if (want('cases')) {
    out.cases = readTable_(ss, 'cases', cfg).filter(c => ok(c.hn) && okPub('rt:' + c.id) && isD(c.sim) && String(c.sim) <= td && (c.rt === 'complete' || c.rt === 'cancel' ? !isD(c.rtDate) || String(c.rtDate) >= cut : String(c.sim) >= old))   // API 122: รวม Cancel RT
      .map(c => {
        const r = txsPick_(c, TXS_CASE_KEYS);
        if (c.rt === 'cancel' && c.rtNote) r.rtNote = String(c.rtNote).slice(0, 300);   // สาเหตุที่หยุดฉาย (แสดงในเอกสาร)
        r.name = txsShort_(c.name);
        if (r.fxlog) r.fxlog = txsFxlog_(r.fxlog);
        if (/DIBH/i.test([c.tech, c.note, c.ptags].join(' '))) r.brth = 'DIBH';
        hns[hnKey_(c.hn)] = 1;
        if (String(c.sim) < from) from = String(c.sim);
        return r;
      });
  }
  if (want('bq')) {
    out.bq = readTable_(ss, 'bq').filter(b => ok(b.hn) && okPub(txsBqKey_(b)) && isD(b.date) && String(b.date) >= old)
      .map(b => { const r = txsPick_(b, TXS_BQ_KEYS); r.name = txsShort_(b.name); hns[hnKey_(b.hn)] = 1; if (String(b.date) < from) from = String(b.date); return r; });
  }
  if (want('duty')) out.duty = readTable_(ss, 'duty').filter(x => isD(x.date) && String(x.date) >= from && String(x.date) <= td).map(x => ({ id: x.id, date: x.date, room: x.room, rtt: x.rtt }));
  if (want('reg')) out.reg = readTable_(ss, 'reg').filter(x => hns[hnKey_(x.hn)]).map(x => txsPick_(x, ['hn', 'sex', 'birth', 'icd', 'dx']));
  // API 141: สถานะการเผยแพร่ · หน่วยงานภายนอก = เฉพาะเอกสารที่เผยแพร่ของผู้ป่วยที่ได้รับ (ไม่มีชื่อผู้ตรวจ / หมายเหตุ)
  out.pub = {};
  Object.keys(pub).forEach(k => { const p = pub[k]; if (only) { if (p.st === 'pub' && hns[hnKey_(p.hn)]) out.pub[k] = { st: 'pub' }; } else out.pub[k] = { st: p.st, by: p.by, at: p.at, note: p.note }; });
  return out;
}
// หน้าเว็บแจ้ง: เปิดหน้าเว็บ (เข้าสู่ระบบค้างไว้) · ดูเอกสาร · พิมพ์ (คืนชื่อเต็ม) · ปฏิเสธ
// info = { hn, doc: เลขที่เอกสาร, id: รหัสเคส / นัดใส่แร่, kind: rt / bq, detail }
function txsLog(act, info, token) {
  const ss = ss_(), cfg = readConfig_(ss) || {}, u = who_(token, ss, cfg), w = txsWho_(cfg, u);
  info = info && typeof info === 'object' ? info : {};
  if (['open', 'view', 'print', 'deny'].indexOf(act) < 0) throw new Error('การทำไม่ถูกต้อง');
  const hn = txsHn_(info.hn), doc = txsDoc_(info.doc), detail = String(info.detail || '').replace(/\s+/g, ' ').slice(0, 200);
  if (act === 'open') { if (w.unit) txsAppend_(ss, cfg, u, 'open', '', '', detail); return { ok: true }; }
  if (act === 'deny') { txsAppend_(ss, cfg, u, 'deny', doc, hn, detail); return { ok: true }; }
  const why = !w.ok ? 'หน่วยงาน / ตำแหน่งนี้ไม่มีสิทธิ์ดู Treatment Summary' : !hn ? 'ไม่มี HN'
    : act === 'print' && !w.print ? 'หน่วยงานนี้ดูได้อย่างเดียว พิมพ์ไม่ได้'
    : w.scope === 'refer' && !txsReferMap_(ss)[hn] ? 'ผู้ป่วยไม่อยู่ในรายชื่อผู้ป่วยที่ส่งต่อ' : '';
  if (why) { txsAppend_(ss, cfg, u, 'deny', doc, hn, TXS_ACTS[act] + ': ' + why); throw new Error('TXS_DENY|' + why); }
  if (w.outer) {   // API 141: เอกสารที่ยังไม่เผยแพร่ = หน่วยงานภายนอกเปิดไม่ได้
    const pid = String(info.id || '').slice(0, 80), pb = info.kind === 'bq' && pid ? openRow_(ss, 'bq', cfg, pid).cur : null, pkey = info.kind === 'bq' ? (pb ? txsBqKey_(pb) : '') : 'rt:' + pid;
    if (!txsIsPub_(txsPubMap_(ss), pkey)) { txsAppend_(ss, cfg, u, 'deny', doc, hn, TXS_ACTS[act] + ': เอกสารยังไม่ได้เผยแพร่'); throw new Error('TXS_DENY|เอกสารยังไม่ได้เผยแพร่'); }
  }
  if (act === 'view') { txsAppend_(ss, cfg, u, 'view', doc, hn, detail); return { ok: true }; }
  // พิมพ์: ชื่อเต็มจากรายการเดียว (เคส / นัดใส่แร่) ต้องเป็น HN เดียวกัน
  const id = String(info.id || '').slice(0, 80), table = info.kind === 'bq' ? 'bq' : 'cases';
  const cur = id ? openRow_(ss, table, cfg, id).cur : null;
  if (!cur || hnKey_(cur.hn) !== hn) { txsAppend_(ss, cfg, u, 'deny', doc, hn, 'พิมพ์: ไม่พบรายการ'); throw new Error('TXS_DENY|ไม่พบรายการของ HN นี้ (อาจถูกลบหรือแก้ HN) · โหลดหน้าใหม่แล้วลองอีกครั้ง'); }
  txsAppend_(ss, cfg, u, 'print', doc, hn, detail);
  return { ok: true, name: String(cur.name || '').replace(/\s+/g, ' ').trim() };
}
// แอดมิน: ประวัติการเข้าถึง (ล่าสุดก่อน) · q = { n: จำนวนแถว (สูงสุด 5000), skip: ข้ามแถวล่าสุดกี่แถว }
function txsLogRead(q, token) {
  const ss = ss_(), cfg = readConfig_(ss) || {}, u = who_(token, ss, cfg);
  if (!txsWho_(cfg, u).admin) throw new Error('ดูประวัติการเข้าถึงได้เฉพาะแอดมิน');
  const sh = sheet_(ss, TXS_LOG), last = sh ? sh.getLastRow() : 0;
  q = q && typeof q === 'object' ? q : {};
  const n = Math.min(5000, Math.max(1, Math.floor(+q.n) || 500)), end = last - Math.max(0, Math.floor(+q.skip) || 0);
  if (!sh || end < 2) return { rows: [], total: Math.max(0, last - 1), more: false };
  const start = Math.max(2, end - n + 1);
  const rows = sh.getRange(start, 1, end - start + 1, TXS_LOG_HEAD.length).getValues().reverse().map(r => r.map(v => (v instanceof Date ? v.toISOString() : String(v == null ? '' : v))));
  return { rows: rows, total: last - 1, more: start > 2 };
}
/* ---------- API 141 (25 พ.ย.): Treatment Summary · หัวหน้างานตรวจสอบและเผยแพร่เอกสาร ----------
 * ชีต TxsPub หนึ่งแถวต่อเอกสาร: key = rt:<รหัสเคส> | bq:<HN>|<คอร์สใส่แร่> · สถานะ pub = ตรวจสอบและเผยแพร่ · no = ไม่เผยแพร่ · ไม่มีแถว = รอตรวจสอบ
 * หน่วยงานภายนอกได้เฉพาะเอกสาร pub (กรองใน txsData_ · txsLog · txsPdf) · เผยแพร่แล้วแสดงข้อมูลล่าสุดเสมอ (ไม่ต้องกดใหม่เมื่อฉายเพิ่ม)
 * ผู้กดได้: หัวหน้างาน / รักษาการแทน (config.leave.heads · hAct) ของทีมใน txs.pubTeams (ว่าง = ทุกทีมที่ตั้งหัวหน้างานไว้) · แอดมินกดแทนไม่ได้ */
const TXS_PUB = 'TxsPub', TXS_PUB_HEAD = ['เอกสาร', 'HN', 'ชนิด', 'สถานะ', 'โดย', 'บัญชี', 'เวลา', 'หมายเหตุ'];
const TXS_PUB_RE = /^(rt:[\w.-]{1,80}|bq:[0-9A-Z]{1,20}\|[\w.-]{1,80})$/;
const txsBqKey_ = b => 'bq:' + hnKey_(b.hn) + '|' + String(b.course || b.id);
const txsIsPub_ = (pub, key) => !!key && !!pub[key] && pub[key].st === 'pub';
function txsPubSheet_(ss, make) {
  let sh = sheet_(ss, TXS_PUB);
  if (!sh && make) {
    sh = ss.insertSheet(TXS_PUB);
    sh.getRange(1, 1, Math.max(2, sh.getMaxRows()), TXS_PUB_HEAD.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, TXS_PUB_HEAD.length).setValues([TXS_PUB_HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function txsPubMap_(ss) {
  if (REQ_.txsPub) return REQ_.txsPub;
  const sh = txsPubSheet_(ss, false), m = {}, last = sh ? sh.getLastRow() : 0;
  if (last > 1) sh.getRange(2, 1, last - 1, TXS_PUB_HEAD.length).getValues().forEach(r => { const k = String(r[0] || ''); if (k) m[k] = { key: k, hn: String(r[1] || ''), kind: String(r[2] || ''), st: String(r[3] || ''), by: String(r[4] || ''), at: r[6] instanceof Date ? r[6].toISOString() : String(r[6] || ''), note: String(r[7] || '') }; });
  return (REQ_.txsPub = m);
}
// ทีมที่มีหัวหน้างาน / รักษาการแทน (ตั้งค่า → ใบลา) ∩ ทีมที่เลือกให้เผยแพร่ได้
function txsPubTeams_(cfg) {
  const lv = cfg.leave && typeof cfg.leave === 'object' ? cfg.leave : {}, all = {};
  ['heads', 'hAct'].forEach(k => { const m = lv[k] && typeof lv[k] === 'object' ? lv[k] : {}; Object.keys(m).forEach(t => { if (String(m[t] || '').trim()) all[t] = 1; }); });
  const pick = txsCfg_(cfg).pubTeams;
  return Object.keys(all).filter(t => !pick.length || pick.indexOf(t) >= 0);
}
const txsHeadOk_ = (cfg, u) => !!u && txsPubTeams_(cfg).some(t => leaveHeadOk_(cfg, u, t));
function txsPub(key, st, note, token) {
  const ss = ss_(), cfg = readConfig_(ss) || {}, u = who_(token, ss, cfg), w = txsWho_(cfg, u);
  key = String(key == null ? '' : key).trim();
  st = String(st == null ? '' : st);
  note = String(note == null ? '' : note).replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!TXS_PUB_RE.test(key)) throw new Error('เอกสารไม่ถูกต้อง');
  if (st !== 'pub' && st !== 'no') throw new Error('สถานะไม่ถูกต้อง');
  if (!w.ok || w.outer) throw new Error('ไม่มีสิทธิ์ใน Treatment Summary');
  if (!txsHeadOk_(cfg, u)) throw new Error('ตรวจสอบและเผยแพร่ได้เฉพาะหัวหน้างาน หรือผู้รักษาการแทนหัวหน้างาน (ตั้งค่า → ใบลา)');
  const kind = key.slice(0, 2);
  let hn = '';
  if (kind === 'rt') { const c = openRow_(ss, 'cases', cfg, key.slice(3)).cur; if (!c) throw new Error('ไม่พบเคสนี้ (อาจถูกลบไปแล้ว)'); hn = hnKey_(c.hn); }
  else hn = key.slice(3).split('|')[0];
  const by = String(u.name || u.username || u.me || ''), at = new Date().toISOString();
  withLock_(() => {
    const sh = txsPubSheet_(ss, true), last = sh.getLastRow(), vals = [key, hn, kind, st, by, String(u.username || u.me || ''), at, note];
    let row = 0;
    if (last > 1) sh.getRange(2, 1, last - 1, 1).getValues().some((r, i) => { if (String(r[0]) === key) { row = i + 2; return true; } return false; });
    const old = row ? String(sh.getRange(row, 4).getValue() || '') : '';
    sh.getRange(row || last + 1, 1, 1, vals.length).setNumberFormat('@').setValues([vals]);
    audit_('txspub', key, hn, row ? 'edit' : 'add', { 'สถานะ': row ? [old, st] : st, 'หมายเหตุ': note });
    markDirty_(TXS_PUB);
  });
  REQ_.txsPub = null;
  txsAppend_(ss, cfg, u, st === 'pub' ? 'pub' : 'unpub', '', hn, key + (note ? ' · ' + note : ''));
  return { key: key, hn: hn, kind: kind, st: st, by: by, at: at, note: note };
}
// แอดมิน: เพิ่ม (on) / ลบ ผู้ป่วยที่ส่งต่อ (ขอบเขตของหน่วยงานแบบ "ผู้ป่วยที่ส่งต่อ") · คืนรายชื่อทั้งหมด
function txsRefer(hn, on, note, token) {
  const ss = ss_(), cfg = readConfig_(ss) || {}, u = who_(token, ss, cfg);
  if (!txsWho_(cfg, u).admin) throw new Error('จัดการรายชื่อผู้ป่วยที่ส่งต่อได้เฉพาะแอดมิน');
  const k = txsHn_(hn);
  if (!/^[0-9A-Z]{3,15}$/.test(k)) throw new Error('HN ไม่ถูกต้อง');
  note = String(note || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  withLock_(() => {
    const sh = txsReferSheet_(ss, true), last = sh.getLastRow(), rows = [];
    (last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues() : []).forEach((r, i) => { if (hnKey_(r[0]) === k) rows.push(i + 2); });
    if (on) {
      const vals = [note, String(u.name || u.username || u.me || ''), new Date().toISOString()];
      if (rows.length) sh.getRange(rows[0], 2, 1, 3).setNumberFormat('@').setValues([vals]);
      else sh.getRange(last + 1, 1, 1, TXS_REFER_HEAD.length).setNumberFormat('@').setValues([[k].concat(vals)]);
    } else if (rows.length) deleteRowsAt_(sh, rows);
    markDirty_(TXS_REFER);
  });
  REQ_.txsRef = null;
  txsAppend_(ss, cfg, u, on ? 'refer+' : 'refer-', '', k, note);
  const m = txsReferMap_(ss);
  return { list: Object.keys(m).map(x => m[x]) };
}
// แอดมิน: ตารางหน่วยงาน · จำนวนวันที่แสดง Complete course · โฟลเดอร์ PDF ที่จัดเก็บ
function txsSetup(t, token) {
  const ss = ss_(), cfg = readConfig_(ss) || {}, u = who_(token, ss, cfg);
  if (!txsWho_(cfg, u).admin) throw new Error('ตั้งค่าหน่วยงานได้เฉพาะแอดมิน');
  const nw = txsCfg_({ txs: t });
  withLock_(() => {
    const c = readConfig_(ss_()) || {};
    c.txs = nw;
    writeConfig_(ss_(), c);
    audit_('config', '', '', 'edit', { 'หัวข้อที่แก้': 'txs' });
  });
  txsAppend_(ss, cfg, u, 'cfg', '', '', nw.units.map(x => x.role + ' ' + (x.print ? 'ดูและพิมพ์' : 'ดูอย่างเดียว') + (x.scope === 'refer' ? ' ผู้ป่วยที่ส่งต่อ' : '')).join(', ') + ' · ' + nw.days + ' วัน' + ' · เริ่มแสดง ' + (nw.from || 'ทั้งหมด') + (nw.folder ? ' · มีโฟลเดอร์ PDF' : ''));
  return nw;
}
// PDF ที่สร้างไว้แล้วในโฟลเดอร์ (config.txs.folder) ชื่อ RT_summary_<HN>[_vN].pdf / Brachy_summary_<HN>[_vN].pdf · รุ่นสูงสุด (เท่ากัน = แก้ล่าสุด)
// เฉพาะหน่วยงานที่พิมพ์ได้ · opt.meta = ถามว่ามีไหม (ไม่บันทึก) · ไม่ใช่ meta = ส่งไฟล์ (base64) และบันทึกการเปิด
function txsPdf(hn, kind, opt, token) {
  const ss = ss_(), cfg = readConfig_(ss) || {}, u = who_(token, ss, cfg), w = txsWho_(cfg, u), t = txsCfg_(cfg);
  opt = opt && typeof opt === 'object' ? opt : {};
  const k = txsHn_(hn), pre = kind === 'bq' ? 'Brachy' : 'RT', meta = !!opt.meta, doc = txsDoc_(opt.doc);
  const why = !w.ok ? 'หน่วยงาน / ตำแหน่งนี้ไม่มีสิทธิ์ดู Treatment Summary' : !w.print ? 'PDF ที่จัดเก็บไว้เปิดได้เฉพาะหน่วยงานที่พิมพ์ได้' : !k ? 'ไม่มี HN'
    : w.scope === 'refer' && !txsReferMap_(ss)[k] ? 'ผู้ป่วยไม่อยู่ในรายชื่อผู้ป่วยที่ส่งต่อ' : '';
  if (why) { if (!meta) txsAppend_(ss, cfg, u, 'deny', doc, k, 'เปิด PDF: ' + why); throw new Error('TXS_DENY|' + why); }
  if (w.outer) {   // API 141
    const pm = txsPubMap_(ss), kd = kind === 'bq' ? 'bq' : 'rt';
    if (!Object.keys(pm).some(x => pm[x].st === 'pub' && pm[x].kind === kd && hnKey_(pm[x].hn) === k)) { if (!meta) txsAppend_(ss, cfg, u, 'deny', doc, k, 'เปิด PDF: เอกสารยังไม่ได้เผยแพร่'); throw new Error('TXS_DENY|เอกสารยังไม่ได้เผยแพร่'); }
  }
  if (!t.folder) return null;
  const re = new RegExp('^' + pre + '_summary_' + k + '(?:_v(\\d+))?\\.pdf$', 'i');
  let best = null;
  const it = DriveApp.getFolderById(t.folder).searchFiles('title contains "' + pre + '_summary_' + k + '" and trashed = false');
  while (it.hasNext()) {
    const f = it.next(), m = re.exec(f.getName());
    if (!m) continue;
    const v = +(m[1] || 0), up = f.getLastUpdated().getTime();
    if (!best || v > best.v || (v === best.v && up > best.up)) best = { f: f, v: v, up: up };
  }
  if (!best) return null;
  const info = { name: best.f.getName(), v: best.v, updated: new Date(best.up).toISOString(), size: best.f.getSize() };
  if (meta) return info;
  txsAppend_(ss, cfg, u, 'pdf', doc, k, info.name);
  return Object.assign(info, { b64: Utilities.base64Encode(best.f.getBlob().getBytes()) });
}

function lpchLogout(token) {
  if (!token) return true;
  lpchDrop_(token);
  try { lpchCall_({ action: 'logout', token: String(token) }); } catch (e) { /* ปล่อยให้หมดอายุเอง */ }
  return true;
}
function lpchDrop_(token) {
  CacheService.getScriptCache().remove('lpch_' + token);
  CacheService.getScriptCache().remove('lpchOk_' + token);
  if (REQ_.cache) delete REQ_.cache['lpch_' + token];
}

/**
 * รันจากหน้าแก้ไขสคริปต์ (เลือก checkSetup แล้วกดเรียกใช้): ตรวจทุกอย่างที่หน้าเว็บต้องใช้ และขออนุญาตสิทธิ์ที่ยังขาด
 * ดูผลที่ "บันทึกการทำงาน" แล้ว Deploy → จัดการการทำให้ใช้งานได้ → แก้ไข → เวอร์ชันใหม่ ให้ URL เดิมใช้โค้ดนี้
 */
// ฟังก์ชันของไฟล์นี้ที่ถูกไฟล์ .gs อื่นในโปรเจกต์ประกาศทับ (เช่นโค้ดรุ่นเก่าที่ยังค้างอยู่) ไฟล์ที่โหลดทีหลังชนะ
function oldCode_() {
  return [['doGet', doGet, 'page_('], ['getData', getData, 'API_LEVEL'], ['saveRecord', saveRecord, 'requireEdit_'],
    ['addCases', addCases, 'requireEdit_'], ['openApp', openApp, 'page_(']]
    .filter(x => typeof x[1] !== 'function' || String(x[1]).indexOf(x[2]) < 0).map(x => x[0]);
}

function checkSetup(e) {
  ownerRun_(e);   // API 140: ข้อมูลการติดตั้ง (ชื่อ / ลิงก์ชีต · จำนวนเคส) เฉพาะเจ้าของ
  const out = ['Code.gs รุ่น ' + CODE_VERSION + ' (API ' + API_LEVEL + ')'];
  const dup = oldCode_();
  out.push(dup.length
    ? '✗ มีไฟล์ .gs อื่นในโปรเจกต์ที่มี ' + dup.join(', ') + ' ของโค้ดเก่า ทับโค้ดใหม่อยู่: ลบไฟล์ .gs อื่นให้เหลือ Code.gs ไฟล์เดียว'
    : '✓ ไม่มีโค้ดเก่าค้างในไฟล์อื่น');
  const url = pageUrl_();
  if (!url) out.push('• หน้าเว็บ: ใช้ไฟล์ index ในโปรเจกต์ (PAGE_URL = -)');
  else {
    const p = page_(true);
    const v = (/const PAGE_VERSION = '([^']+)'/.exec(p.html) || [])[1] || 'ไม่ทราบ';
    out.push(p.source === 'github' ? '✓ หน้าเว็บ: โหลดจาก GitHub ได้ รุ่น ' + v
      : '✗ หน้าเว็บ: โหลดจาก GitHub ไม่ได้ (' + p.why + ') ' + (p.source === 'file' ? 'ใช้ไฟล์ index ในโปรเจกต์ รุ่น ' + v : 'และไม่มีไฟล์ index'));
  }
  out.push(setupLpch());
  try {
    const ss = ss_();
    const from = { bound: 'ชีตที่ผูกสคริปต์', property: 'Script property SHEET_ID' }[sheetSource_()] || 'ไม่ทราบ';
    out.push('✓ ชีตเก็บข้อมูล: ' + ss.getName() + ' (' + from + ') · เคส ' + readTable_(ss, 'cases').length + ' รายการ');
    out.push('  ' + ss.getUrl());
  } catch (e) { out.push('✗ ชีตเก็บข้อมูล: ' + e.message); }
  out.push('ขั้นต่อไป: Deploy → จัดการการทำให้ใช้งานได้ → แก้ไข (ดินสอ) → เวอร์ชัน: เวอร์ชันใหม่ → ทำให้ใช้งานได้');
  out.push('(อย่ากด "การทำให้ใช้งานได้รายการใหม่" เพราะจะได้ URL ใหม่ ลิงก์เดิมและปุ่มใน LPCH ยังเปิดรุ่นเก่า)');
  out.push('ตรวจลิงก์: เปิด …/exec?ping=1 ต้องเห็น "codeVersion": "' + CODE_VERSION + '" ถ้าเห็นหน้าระบบแทน แปลว่าลิงก์นั้นยังเป็นรุ่นเก่า');
  out.push('ถ้าลิงก์ที่ใช้อยู่ไม่อยู่ในรายการ "จัดการการทำให้ใช้งานได้" ของโปรเจกต์นี้ แปลว่าลิงก์นั้นมาจากโปรเจกต์ Apps Script อื่น');
  out.forEach(l => Logger.log(l));
  return out.join('\n');
}

// รันจากหน้าแก้ไขสคริปต์: ตั้ง LPCH_URL แล้ว เชื่อมต่อได้ และ LPCH รองรับการใช้บัญชีร่วมกันหรือยัง
function setupLpch(e) {
  ownerRun_(e);   // API 140
  const url = lpchUrl_();
  let msg;
  if (!url) msg = '✗ ปิดการเชื่อม LPCH อยู่ (LPCH_URL = -) ใช้บัญชี Google อย่างเดียว';
  else if (!/^https:\/\/script\.google\.com\/(a\/[^\/]+\/)?macros\/s\/[\w-]+\/(exec|dev)$/.test(url)) msg = '✗ LPCH_URL ต้องเป็น https://script.google.com/macros/s/…/exec (ตอนนี้: ' + url + ')';
  else {
    try { lpchCall_({ action: 'ssoRedeem', ticket: 'check' }); msg = '✓ เชื่อมต่อ LPCH RO Workspace ได้'; } catch (e) {
      msg = /หมดอายุ|ถูกใช้ไปแล้ว/.test(e.message) ? '✓ เชื่อมต่อ LPCH RO Workspace ได้ และรองรับการใช้บัญชีร่วมกันแล้ว'
        : /ไม่รู้จักคำสั่ง/.test(e.message) ? '✗ LPCH RO Workspace ยังเป็น Code.gs เวอร์ชันเก่า: วาง Code.gs ใหม่แล้ว Deploy → New version'
        : '✗ ' + e.message;
    }
  }
  Logger.log('LPCH_URL = ' + (url || '(ปิด)'));
  Logger.log(msg);
  Logger.log('Deploy: Execute as "Me" · Who has access "Anyone" · บันทึกได้เฉพาะ ' + LPCH_EDIT_ROLES.join(', ') + ' คนอื่นดูได้อย่างเดียว');
  return 'LPCH: ' + msg;
}

/* ---------- แอดมิน ---------- */

function adminList_(cfg) {
  return ((cfg && cfg.admins) || []).map(x => String(x).toLowerCase().trim()).filter(Boolean);
}

// เจ้าของไฟล์เป็นแอดมินเสมอ และเพิ่มอีเมลแอดมินได้ใน Config (admins)
// ถ้ายังไม่มีรายชื่อแอดมินและหาเจ้าของไฟล์ไม่ได้ (เช่นไฟล์ใน Shared drive) ทุกคนแก้ได้จนกว่าจะตั้งแอดมิน
function adminInfo_(ss, cfg) {
  let me = '', owner = '';
  try { me = String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) { /* ไม่ทราบอีเมล */ }
  // เจ้าของไฟล์: ถาม Drive ช้า (ทุกคำขอ ทุกการบันทึก) = จำไว้ 6 ชั่วโมง
  try {
    const key = 'ssOwner_' + ss.getId(), hit = reqCacheGet_(key);
    if (hit !== null && hit !== undefined) owner = hit === '-' ? '' : hit;
    else { const o = ss.getOwner(); owner = o ? String(o.getEmail() || '').toLowerCase() : ''; reqCachePut_(key, owner || '-', 21600); }
  } catch (e) { /* ไม่ทราบเจ้าของ */ }
  const admins = adminList_(cfg);
  const isAdmin = (!!me && (me === owner || admins.indexOf(me) >= 0)) || (!admins.length && !owner);
  return { me: me, owner: owner, isAdmin: isAdmin };
}

function requireAdmin_(ss) {
  const info = adminInfo_(ss, readConfig_(ss));
  if (!info.isAdmin) throw new Error('แก้การตั้งค่าได้เฉพาะแอดมิน' + (info.me ? ' (' + info.me + ' ไม่ใช่แอดมิน)' : ''));
}

/* ---------- ตัวช่วย ---------- */

// ส่ง cfg มาด้วยเมื่อต้องการคอลัมน์ของหัวข้อเพิ่มเติม (แท็บ Cases)
function tableDef_(table, cfg) {
  const def = TABLES[table];
  if (!def) throw new Error('ไม่รู้จักตาราง ' + table);
  if (table !== 'cases' || !cfg) return def;
  return { sheet: def.sheet, fields: def.fields.concat(extraFields_(cfg)) };
}

// หัวข้อเพิ่มเติมในฟอร์มแจกเคส (config.fields) → [คีย์ x_<id>, ชื่อคอลัมน์] ชื่อคอลัมน์คือชื่อหัวข้อตอนสร้าง
// ข้ามชื่อที่ซ้ำกับคอลัมน์ของระบบหรือซ้ำกันเอง กันอ่านเขียนผิดคอลัมน์
function extraFields_(cfg) {
  const taken = {};
  TABLES.cases.fields.forEach(f => { taken[f[1].toLowerCase()] = true; });
  return (Array.isArray(cfg && cfg.fields) ? cfg.fields : [])
    .filter(f => f && /^[\w-]{1,40}$/.test(String(f.id || '')))
    .map(f => ['x_' + f.id, String(f.col || f.label || '').trim()])
    .filter(f => {
      const k = f[1].toLowerCase();
      if (!k || taken[k]) return false;
      taken[k] = true;
      return true;
    });
}

function tableSheet_(ss, table, cfg) {
  const def = tableDef_(table, cfg);
  markDirty_(table);   // เปิดชีตเพื่อบันทึก: หน้าเว็บโหลดตารางนี้ใหม่
  let sh = sheet_(ss, def.sheet);
  if (!sh) {
    sh = ss.insertSheet(def.sheet);
    sh.setFrozenRows(1);
  }
  let header = headerOf_(sh), changed = false;
  if (table === 'cases' && header.some(h => RENAMED_COLS[h] && header.indexOf(RENAMED_COLS[h]) < 0)) {
    header = header.map(h => (RENAMED_COLS[h] && header.indexOf(RENAMED_COLS[h]) < 0 ? RENAMED_COLS[h] : h));
    sh.getRange(1, 1, 1, header.length).setValues([header]);
    changed = true;
  }
  const missing = def.fields.map(f => f[1]).filter(h => header.indexOf(h) < 0);
  if (missing.length) { sh.getRange(1, header.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold'); changed = true; }
  if (changed && LOCKED_) reqMap_('head').set(sh, header.concat(missing));   // หัวคอลัมน์ที่เพิ่งเขียน (ไม่ต้องอ่านซ้ำ)
  return sh;
}

function headerOf_(sh) {
  const m = LOCKED_ ? reqMap_('head') : null;
  if (m && m.has(sh)) return m.get(sh).slice();
  const n = sh.getLastColumn();
  const h = n ? sh.getRange(1, 1, 1, n).getValues()[0].map(v => String(v).trim()) : [];
  if (m) m.set(sh, h);
  return h.slice();
}

function readTable_(ss, table, cfg) {
  const def = tableDef_(table, cfg);
  const sh = sheet_(ss, def.sheet);
  if (!sh || sh.getLastRow() < 2) return [];
  const tz = tz_(ss);
  const values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const cv = rowConv_(def, values.shift().map(v => String(v).trim()), tz);
  if (cv.cols[0] < 0) return [];
  return values.filter(r => String(r[cv.cols[0]]).trim() !== '').map(cv.conv);
}
// แถวเดียวของตาราง (แถวที่เพิ่งเขียน) แบบเดียวกับ readTable_ แต่อ่านแค่แถวนั้น
function rowAt_(ss, table, cfg, sh, header, row) {
  const cv = rowConv_(tableDef_(table, cfg), header, tz_(ss));
  return cv.conv(sh.getRange(row, 1, 1, Math.max(1, header.length)).getValues()[0]);
}
// แถวในชีต → { คีย์: ข้อความ } ตามคอลัมน์ของตาราง (หัวคอลัมน์ชื่อเก่าใน RENAMED_COLS ก็อ่านได้)
function rowConv_(def, header, tz) {
  const oldName = {};
  Object.keys(RENAMED_COLS).forEach(k => { oldName[RENAMED_COLS[k]] = k; });
  const cols = def.fields.map(f => (header.indexOf(f[1]) >= 0 || !oldName[f[1]] ? header.indexOf(f[1]) : header.indexOf(oldName[f[1]])));
  return { cols: cols, conv: r => { const o = {}; def.fields.forEach((f, i) => { o[f[0]] = cols[i] < 0 ? '' : cellText_(r[cols[i]], tz); }); return o; } };
}

function findRow_(sh, col, id) {
  const last = sh.getLastRow();
  if (col < 1 || last < 2 || !id) return 0;
  const ids = sh.getRange(2, col, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}

// เขียนเฉพาะคอลัมน์ของระบบ เป็นข้อความล้วน ไม่ทับคอลัมน์ที่ผู้ใช้เพิ่มเอง
// old = ค่าของแถวนั้นที่ผู้เรียกอ่านไว้แล้ว (อาร์เรย์) · null = แถวใหม่ · ไม่ส่ง = อ่านเอง (แบบเดิม)
// คืนค่าของแถวหลังเขียน (อาร์เรย์ตามหัวคอลัมน์) ใช้แทนการอ่านแถวกลับมา
function writeFields_(sh, row, header, fields, rec, old) {
  const cells = fields
    .map(f => ({ col: header.indexOf(f[1]) + 1, value: f[1] === REV_HEAD ? new Date().toISOString() : safeText_(rec[f[0]]) }))   // API 89: เวลาแก้ = ตอนเขียนเสมอ (แถวใหม่เดิมได้ค่าว่าง → หน้าเว็บ / สำเนาในแคชต้องอ่านทั้งตาราง)
    .filter(c => c.col > 0);
  const was = auditWrite_(sh, row, header, cells, old);
  const rv = header.indexOf(REV_HEAD);   // Cases / Logs: เวลาแก้ล่าสุดของแถว (ส่งเฉพาะแถวที่เปลี่ยน)
  if (rv >= 0 && !cells.some(c => c.col === rv + 1)) cells.push({ col: rv + 1, value: new Date().toISOString() });
  cells.sort((a, b) => a.col - b.col);
  let run = [];
  const flush = () => {
    if (!run.length) return;
    sh.getRange(row, run[0].col, 1, run.length).setNumberFormat('@').setValues([run.map(c => c.value)]);
    run = [];
  };
  cells.forEach(c => {
    if (run.length && c.col !== run[run.length - 1].col + 1) flush();
    run.push(c);
  });
  flush();
  const merged = (was || []).slice();
  while (merged.length < header.length) merged.push('');
  cells.forEach(c => { merged[c.col - 1] = c.value; });
  return merged;
}
// แถวตาม id ของตาราง อ่านครั้งเดียว: { sh, header, row (0 = ไม่มี), vals (ค่าดิบของแถว), cv, cur (แบบ readTable_) } · ใช้ระหว่างถือล็อก
function openRow_(ss, table, cfg, id) {
  const pre = table === 'cases' && REQ_.rows && id ? REQ_.rows.at[String(id)] : null;   // casesDo อ่านไว้แล้ว
  if (pre && pre.vals) { const R = REQ_.rows; return { sh: R.sh, header: R.header, row: pre.row, vals: pre.vals, cv: R.cv, cur: R.cv.conv(pre.vals), pre: pre }; }
  const sh = tableSheet_(ss, table, cfg), header = headerOf_(sh);
  const row = id ? findRow_(sh, header.indexOf('id') + 1, id) : 0;
  const vals = row ? sh.getRange(row, 1, 1, Math.max(1, header.length)).getValues()[0] : null;
  const cv = rowConv_(tableDef_(table, cfg), header, tz_(ss));
  return { sh: sh, header: header, row: row, vals: vals, cv: cv, cur: vals ? cv.conv(vals) : null };
}
// แถวของหลาย id: อ่านคอลัมน์ id ครั้งเดียว แล้วอ่านเฉพาะแถวที่ต้องการ (อยู่ใกล้กัน = ช่วงเดียว) · pick(id) = ต้องการแถวนี้
// คืน { sh, header, cv, last, at: { id: { row, vals } } } · ใช้ระหว่างถือล็อก
function openRows_(ss, table, cfg, pick) {
  const sh = tableSheet_(ss, table, cfg), header = headerOf_(sh), idCol = header.indexOf('id') + 1, last = sh.getLastRow();
  const ids = last > 1 && idCol > 0 ? sh.getRange(2, idCol, last - 1, 1).getValues() : [];
  const at = {}, rows = [];
  ids.forEach((r, i) => { const v = String(r[0]); if (v !== '' && !at[v] && pick(v)) { at[v] = { row: i + 2 }; rows.push(i + 2); } });
  if (rows.length) {
    const w = Math.max(1, header.length), lo = Math.min.apply(null, rows), hi = Math.max.apply(null, rows);
    if (hi - lo + 1 <= Math.max(60, rows.length * 4)) { const block = sh.getRange(lo, 1, hi - lo + 1, w).getValues(); Object.keys(at).forEach(k => { at[k].vals = block[at[k].row - lo]; }); }
    else Object.keys(at).forEach(k => { at[k].vals = sh.getRange(at[k].row, 1, 1, w).getValues()[0]; });
  }
  return { sh: sh, header: header, last: last, at: at, cv: rowConv_(tableDef_(table, cfg), header, tz_(ss)) };
}
// เขียนช่องใน set ของแถวที่เปิดไว้ (แถวใหม่ = ต่อท้าย) แล้วคืนรายการหลังเขียน (ไม่อ่านชีตซ้ำ)
function saveRow_(x, fields, set) {
  const at = x.row || x.sh.getLastRow() + 1;
  return x.cv.conv(writeFields_(x.sh, at, x.header, fields.filter(f => f[0] in set), set, x.row ? x.vals : null));
}

// known = id ทั้งหมดของตารางที่ผู้เรียกอ่านไว้แล้วภายใต้ล็อก (ไม่ต้องอ่านคอลัมน์ id ซ้ำ)
function appendNew_(ss, table, records, known) {
  const def = tableDef_(table);
  const sh = tableSheet_(ss, table);
  const header = headerOf_(sh);
  const idCol = header.indexOf('id') + 1;
  const have = {}, last = sh.getLastRow();
  if (known) known.forEach(id => { have[String(id)] = true; });
  else if (last > 1) sh.getRange(2, idCol, last - 1, 1).getValues().forEach(r => { have[String(r[0])] = true; });
  const fresh = records.filter(r => !have[r.id]);
  if (!fresh.length) return 0;
  fresh.forEach(rec => auditAdd_(table, rec, def.fields));
  const stamp = new Date().toISOString();
  const rows = fresh.map(rec => header.map(h => {
    const f = def.fields.find(x => x[1] === h);
    return h === REV_HEAD ? stamp : !f ? '' : f[0] === 'rev' ? stamp : safeText_(rec[f[0]]);   // API 89: แถวใหม่มีเวลาแก้ (หน้าเว็บ / สำเนาในแคชได้เฉพาะแถวที่เพิ่ม ไม่ต้องอ่านทั้งตาราง)
  }));
  sh.getRange(last + 1, 1, rows.length, header.length).setNumberFormat('@').setValues(rows);
  return fresh.length;
}

// ชีต Config อ่านครั้งเดียวต่อคำขอ (ตรวจสิทธิ์แล้วบันทึก = เดิมอ่าน 2–3 ครั้ง) · คืนสำเนาใหม่ทุกครั้ง · writeConfig_ ล้าง
let CFG_MEMO_ = null;
function readConfig_(ss) {
  if (!CFG_MEMO_ || CFG_MEMO_.ss !== ss) {
    const sh = sheet_(ss, CONFIG_SHEET);
    let rows = [];
    if (sh && typeof sh.getDataRange === 'function') rows = sh.getDataRange().getValues().slice(1);   // ทั้งชีต Config ในรอบเดียว (ไม่ต้องนับแถวก่อน)
    else if (sh) { const last = sh.getLastRow(); rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, 2).getValues(); }
    CFG_MEMO_ = { ss: ss, rows: rows };
  }
  if (!CFG_MEMO_.rows.length) return null;
  const out = {};
  CFG_MEMO_.rows.forEach(r => {
    if (!r[0]) return;
    try { out[r[0]] = JSON.parse(r[1]); } catch (e) { /* ข้ามค่าที่อ่านไม่ได้ */ }
  });
  return out;
}

function writeConfig_(ss, config) {
  CFG_MEMO_ = null;
  const sh = sheet_(ss, CONFIG_SHEET) || ss.insertSheet(CONFIG_SHEET);
  const rows = Object.keys(config).map(k => [k, JSON.stringify(config[k])]);
  sh.clearContents();
  sh.getRange(1, 1, 1, 2).setValues([['key', 'value (JSON)']]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, 2).setNumberFormat('@').setValues(rows);
}

function cellText_(v, tz) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v) ? '' : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : '';
  const s = String(v).trim();
  return s.charAt(0) === "'" && s.charAt(1) === '=' ? s.slice(1) : s;
}

// กันข้อความที่ขึ้นต้นด้วย = ไม่ให้กลายเป็นสูตร
function safeText_(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return s.charAt(0) === '=' ? "'" + s : s;
}

// เขียนชีตทีละคน (ล็อกเดียวทั้งสคริปต์ ทุกผู้ใช้ใช้ร่วมกัน) รอคิวได้ไม่เกิน 20 วินาที
// flush ก่อนปล่อยล็อก ให้คนถัดไปอ่านข้อมูลที่เพิ่งเขียนเสมอ (เช่น แจกเคสพร้อมกันจะไม่ได้คนเดียวกัน)
let LOCKED_ = false;
/* ---------- ประวัติการบันทึก (API 73 · แท็บ AuditLog) ----------
 * ทุกการบันทึกผ่าน writeFields_ / appendNew_ / delRow_ = หนึ่งแถว: เวลา ผู้บันทึก ตาราง id HN การทำ (เพิ่ม / แก้ / ลบ) ฟังก์ชัน รายละเอียด (หัวคอลัมน์: [ค่าเดิม, ค่าใหม่])
 * เขียนรวมตอนปล่อยล็อก (นอกล็อก = เขียนทันที) · อ่านผ่าน auditRecent (ทั้งแถบ) / auditFor (รายการ) ตามสิทธิ์ดูแถบนั้น
 */
const AUDIT_SHEET = 'AuditLog';
const AUDIT_HEAD = ['เวลา', 'โดย', 'บัญชี', 'ตาราง', 'id', 'HN', 'การทำ', 'ฟังก์ชัน', 'รายละเอียด'];
const AUDIT_SKIP = ['แก้ไขล่าสุด (ระบบ)', 'Updated', 'Created'];
let AUDIT_U_ = null, AUDIT_BUF_ = [];
const auditCut_ = v => { const s = String(v == null ? '' : v); return s.length > 600 ? s.slice(0, 600) + '…' : s; };
// ตารางของชีต (ชื่อแท็บ → คีย์ใน TABLES)
function auditTable_(name) {
  for (const k in TABLES) if (TABLES[k] && TABLES[k].sheet === name) return k;
  return name;
}
// ฟังก์ชันที่ผู้ใช้เรียก (ชื่อแรกใน stack ที่ไม่ลงท้ายด้วย _) เช่น fractionCase, apptSave
function auditFn_() {
  try {
    const st = String(new Error().stack || '').split('\n');
    for (const l of st) { const m = l.match(/at ([A-Za-z0-9]+) \(/); if (m && !/_$/.test(m[1]) && m[1] !== 'Error') return m[1]; }
  } catch (e) { /* ไม่มี stack */ }
  return '';
}
function audit_(table, id, hn, act, what) {
  if (table === AUDIT_SHEET) return;
  const u = AUDIT_U_ || {};
  // ระหว่างถือล็อก: หาแถวสุดท้ายของ AuditLog ก่อนเขียนข้อมูล (อ่านหลังเขียน = ชีตต้องบันทึกค้างก่อน 1 รอบ) · เขียนรวมกับข้อมูลตอนปล่อยล็อก
  if (LOCKED_ && !REQ_.auditAt) { try { const sh = sheet_(ss_(), AUDIT_SHEET); if (sh) REQ_.auditAt = { sh: sh, last: sh.getLastRow() }; } catch (e) { /* หาตอนเขียนแทน */ } }
  AUDIT_BUF_.push([new Date().toISOString(), String(u.name || u.username || u.me || ''), String(u.username || u.me || ''), table, String(id || ''), String(hn || ''), act, auditFn_(), auditCut_(JSON.stringify(what || {})).slice(0, 4000)]);
  if (!LOCKED_) auditFlush_();
}
function auditFlush_() {
  if (!AUDIT_BUF_.length) return;
  const rows = AUDIT_BUF_, at = REQ_.auditAt;
  AUDIT_BUF_ = [];
  REQ_.auditAt = null;
  try {
    const ss = ss_();
    let sh = at ? at.sh : sheet_(ss, AUDIT_SHEET);
    if (!sh) { sh = ss.insertSheet(AUDIT_SHEET); sh.getRange(1, 1, 1, AUDIT_HEAD.length).setValues([AUDIT_HEAD]).setFontWeight('bold'); sh.setFrozenRows(1); }
    sh.getRange((at ? at.last : sh.getLastRow()) + 1, 1, rows.length, AUDIT_HEAD.length).setNumberFormat('@').setValues(rows);
  } catch (e) { console.log('auditFlush_ ' + e); }
  alertDeletes_(rows);   // ประวัติเขียนไม่ได้ ไม่ทำให้การบันทึกล้ม
}
// แก้ / เพิ่มแถว: เทียบค่าเดิมทีละคอลัมน์ที่เขียน (แถวใหม่ = ค่าที่ไม่ว่าง)
function auditWrite_(sh, row, header, cells, known) {
  // known: อาร์เรย์ = ค่าของแถวเดิมที่อ่านไว้แล้ว · null = แถวใหม่ · ไม่ส่ง = อ่านเอง · คืนค่าของแถวเดิม (null = แถวใหม่)
  let isNew = known === null, old = Array.isArray(known) ? known : [];
  if (known === undefined) {
    try { isNew = row > sh.getLastRow(); old = isNew ? [] : sh.getRange(row, 1, 1, Math.max(1, header.length)).getValues()[0]; } catch (e) { console.log('auditWrite_ read ' + e); }
  }
  try {
    const name = sheetName_(sh);
    if (name === AUDIT_SHEET) return isNew ? null : old;
    const what = {};
    cells.forEach(c => {
      const h = header[c.col - 1];
      if (!h || h === 'id' || AUDIT_SKIP.indexOf(h) >= 0) return;
      const was = isNew ? '' : String(old[c.col - 1] == null ? '' : old[c.col - 1]);
      if (old[c.col - 1] instanceof Date) return;   // วันที่ในชีต (เขียนเป็นข้อความเหมือนเดิม) ไม่นับเป็นการเปลี่ยน
      if (was === c.value) return;
      what[h] = isNew ? auditCut_(c.value) : [auditCut_(was), auditCut_(c.value)];
    });
    const idc = header.indexOf('id'), hnc = header.indexOf('HN'), val = i => { const c = cells.filter(x => x.col === i + 1)[0]; return c ? c.value : i >= 0 && !isNew ? old[i] : ''; };
    if (Object.keys(what).length) audit_(auditTable_(name), val(idc), val(hnc), isNew ? 'add' : 'edit', what);
  } catch (e) { console.log('auditWrite_ ' + e); }
  return isNew ? null : old;
}
function auditAdd_(table, rec, fields) {
  const what = {};
  fields.forEach(f => { if (AUDIT_SKIP.indexOf(f[1]) < 0 && f[0] !== 'id' && rec[f[0]] != null && String(rec[f[0]]) !== '') what[f[1]] = auditCut_(rec[f[0]]); });
  audit_(table, rec.id, rec.hn, 'add', what);
}
// ลบแถว: เก็บค่าที่มีของแถวนั้นไว้ในประวัติ แล้วลบ
function delRow_(sh, row, head, vals) {
  try {
    const header = head || headerOf_(sh), v = vals || sh.getRange(row, 1, 1, Math.max(1, header.length)).getValues()[0], what = {};
    header.forEach((h, i) => { if (h && AUDIT_SKIP.indexOf(h) < 0 && h !== 'id' && String(v[i] == null ? '' : v[i]) !== '') what[h] = auditCut_(v[i] instanceof Date ? Utilities.formatDate(v[i], tz_(ss_()), 'yyyy-MM-dd') : v[i]); });
    audit_(auditTable_(sheetName_(sh)), v[header.indexOf('id')], v[header.indexOf('HN')], 'del', what);
    try { trashAdd_(sh, header, v); } catch (e) { console.log('trashAdd_ ' + e); }   // API 93: ถังขยะ
  } catch (e) { console.log('delRow_ ' + e); }
  sh.deleteRow(row);
}
/* ---------- API 93: ถังขยะ ----------
 * รายการที่ผู้ใช้กดลบ (ฟังก์ชันใน TRASH_FNS) เก็บทั้งแถว (ทุกคอลัมน์ ไม่ตัดข้อความ) ในชีต Trash ก่อนลบ · เก็บ 90 วัน (ล้างทุกคืนตอนสำรองข้อมูล)
 * กู้คืน = ใส่แถวกลับชีตเดิม รหัสเดิม (ไม่ต้องใส่ PIN · ต้องบันทึกในแถบนั้นได้) · ลบถาวร = แอดมิน · การลบอัตโนมัติของระบบ (ย้ายเคส แก้แผน sync) ไม่เข้าถังขยะ */
const TRASH_SHEET = 'Trash';
const TRASH_HEAD = ['tid', 'ลบเมื่อ', 'ลบโดย', 'บัญชี', 'ตาราง', 'ชีต', 'id', 'HN', 'สรุป', 'ฟังก์ชัน', 'ข้อมูล 1', 'ข้อมูล 2', 'ข้อมูล 3', 'ข้อมูล 4'];
const TRASH_DAYS = 90, TRASH_CHUNK = 45000;
// ฟังก์ชันที่ผู้ใช้กดลบ → สิทธิ์ที่ใช้กู้คืน (null = ตามตาราง: เคส กิจกรรม วันลา กิจกรรมแผนก)
const TRASH_FNS = { deleteRecord: null, courseRemove: 'course', ctRemove: 'ctsim', vacRemove: 'vac', regRemove: 'reg', apptRemove: 'appt', visitRemove: 'visit', dqRemove: 'dq', dqLeaveRemove: 'dqLeave' };
const TRASH_EDIT = { dqLeave: ['dq', 'rojobs'] };
const trashViews_ = (fn, table) => { const k = TRASH_FNS[fn] || table; return TRASH_EDIT[k] || EDIT_VIEWS[k] || []; };
function trashVal_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v)) return '';
    return Utilities.formatDate(v, tz, Utilities.formatDate(v, tz, 'HH:mm:ss') === '00:00:00' ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm:ss');
  }
  return v == null ? '' : v;
}
function trashSum_(header, vals) {
  const out = [];
  header.forEach((h, i) => {
    const t = String(vals[i] == null ? '' : vals[i]).trim();
    if (!h || h === 'id' || h === 'HN' || AUDIT_SKIP.indexOf(h) >= 0 || !t || /^[\[{]/.test(t) || t.length > 60 || out.length >= 6) return;
    out.push(h + ': ' + t);
  });
  return out.join(' · ').slice(0, 400);
}
function trashAdd_(sh, header, v) {
  const fn = auditFn_();
  if (!(fn in TRASH_FNS)) return;
  const ss = ss_(), tz = tz_(ss), vals = header.map((h, i) => trashVal_(v[i], tz)), id = String(vals[header.indexOf('id')] || '');
  if (!id) return;
  const json = JSON.stringify({ h: header, v: vals }), parts = [];
  for (let i = 0; i < json.length; i += TRASH_CHUNK) parts.push(json.slice(i, i + TRASH_CHUNK));
  if (parts.length > 4) { console.log('trashAdd_ ข้อมูลยาวเกิน ' + json.length); return; }   // ยังมีในประวัติการบันทึก
  const u = AUDIT_U_ || {}, hi = header.indexOf('HN'), name = sheetName_(sh);
  let t = sheet_(ss, TRASH_SHEET);
  if (!t) { t = ss.insertSheet(TRASH_SHEET); t.getRange(1, 1, 1, TRASH_HEAD.length).setValues([TRASH_HEAD]); t.setFrozenRows(1); }
  const row = ['T' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), new Date().toISOString(), String(u.name || u.username || u.me || ''), String(u.username || u.me || ''), auditTable_(name), name, id,
    hi >= 0 ? String(vals[hi]) : '', trashSum_(header, vals), fn, parts[0] || '', parts[1] || '', parts[2] || '', parts[3] || ''];
  t.getRange(t.getLastRow() + 1, 1, 1, row.length).setNumberFormat('@').setValues([row]);
}
// รายการในถังขยะ (ใหม่ก่อน · 90 วัน · สูงสุด 500) ของตารางในแถบที่ผู้ใช้เห็น · view = เฉพาะแถบนั้น · คืน { rows, days, admin }
function trashList(view, token) {
  const ss = ss_(), cfg = readConfig_(ss) || {}, u = who_(token, ss, cfg), all = u.via === 'google' || !!u.isAdmin;
  const tables = {};
  (view ? [String(view)] : Object.keys(AUDIT_VIEWS)).forEach(v => { if (AUDIT_VIEWS[v] && v !== 'pchart' && (all || userAccess_(cfg, v, u))) AUDIT_VIEWS[v].forEach(t => { tables[t] = 1; }); });   // API 139: Patient chart ดูอย่างเดียว ไม่มีถังขยะ
  if (view && !Object.keys(tables).length) throw new Error('ดูถังขยะของแถบนี้ไม่ได้');
  const sh = sheet_(ss, TRASH_SHEET), last = sh ? sh.getLastRow() : 0;
  if (last < 2) return { rows: [], days: TRASH_DAYS, admin: all };
  const vals = sh.getRange(2, 1, last - 1, 10).getValues(), from = new Date(Date.now() - TRASH_DAYS * 864e5).toISOString(), ok = {}, out = [];
  const can = (fn, table) => { const k = fn + '|' + table; if (!(k in ok)) ok[k] = u.via === 'google' || trashViews_(fn, table).some(v => userAccess_(cfg, v, u) === 'edit'); return ok[k]; };
  for (let i = vals.length - 1; i >= 0 && out.length < 500; i--) {
    const r = vals[i], at = String(r[1]), table = String(r[4]);
    if (!tables[table] || at < from) continue;
    out.push({ tid: String(r[0]), at: at, by: String(r[2]), user: String(r[3]), table: table, id: String(r[6]), hn: String(r[7]), sum: String(r[8]), fn: String(r[9]), canRestore: can(String(r[9]), table) });
  }
  return { rows: out, days: TRASH_DAYS, admin: all };
}
// กู้คืน: ใส่แถวกลับชีตเดิม รหัสเดิม (คอลัมน์ตามหัวตารางปัจจุบัน) · มีรหัสนี้อยู่แล้ว / HN ลงทะเบียนใหม่แล้ว = กู้ไม่ได้ · คืน { table, id, hn }
function trashRestore(tid, token) {
  const ss = ss_();
  return withLock_(() => {
    const t = sheet_(ss, TRASH_SHEET), row = t ? findRow_(t, 1, String(tid || '')) : 0;
    if (!row) throw new Error('ไม่พบรายการนี้ในถังขยะ (อาจกู้คืนหรือลบถาวรไปแล้ว)');
    const r = t.getRange(row, 1, 1, TRASH_HEAD.length).getValues()[0], table = String(r[4]), fn = String(r[9]), id = String(r[6]);
    requireEdit_(token, trashViews_(fn, table));
    let data;
    try { data = JSON.parse([r[10], r[11], r[12], r[13]].map(x => String(x == null ? '' : x)).join('')); } catch (e) { throw new Error('ข้อมูลในถังขยะเสียหาย กู้คืนไม่ได้'); }
    const sh = tableSheet_(ss, table), header = headerOf_(sh), at = {};
    (data.h || []).forEach((h, i) => { if (h) at[h] = (data.v || [])[i]; });
    if (findRow_(sh, header.indexOf('id') + 1, id)) throw new Error('มีรายการนี้อยู่แล้ว (กู้คืนไปแล้ว) ไม่ต้องกู้ซ้ำ');
    if (table === 'reg') {
      const hc = header.indexOf('HN') + 1, hn = String(at.HN || '');
      if (hc && hn && findRow_(sh, hc, hn)) throw new Error('HN ' + hn + ' ลงทะเบียนใหม่แล้ว กู้คืนไม่ได้ (แก้ไขรายการที่มีอยู่แทน)');
    }
    const stamp = new Date().toISOString(), vals = header.map(h => (h === REV_HEAD ? stamp : h in at ? safeText_(at[h]) : ''));
    sh.getRange(sh.getLastRow() + 1, 1, 1, header.length).setNumberFormat('@').setValues([vals]);
    t.deleteRow(row);
    audit_(table, id, String(r[7]), 'restore', { 'กู้คืนจากถังขยะ': 'ลบเมื่อ ' + String(r[1]).slice(0, 16).replace('T', ' ') + (r[2] ? ' โดย ' + String(r[2]) : '') });
    return { table: table, id: id, hn: String(r[7]) };
  });
}
// ลบถาวร (แอดมิน)
function trashPurge(tid, token) {
  const ss = ss_(), u = who_(token, ss, readConfig_(ss) || {});
  if (u.via !== 'google' && !u.isAdmin) throw new Error('ลบถาวรได้เฉพาะแอดมิน');
  return withLock_(() => {
    const t = sheet_(ss, TRASH_SHEET), row = t ? findRow_(t, 1, String(tid || '')) : 0;
    if (!row) return false;
    const r = t.getRange(row, 1, 1, 10).getValues()[0];
    t.deleteRow(row);
    audit_(String(r[4]), String(r[6]), String(r[7]), 'purge', { 'ลบถาวรจากถังขยะ': String(r[8]).slice(0, 200) });
    return true;
  });
}
// ล้างรายการเกิน 90 วัน (แถวเก่าอยู่บน) · ทุกคืนตอนสำรองข้อมูล
function trashPrune_(ss) {
  const t = sheet_(ss, TRASH_SHEET), last = t ? t.getLastRow() : 0;
  if (last < 2) return 0;
  const from = new Date(Date.now() - TRASH_DAYS * 864e5).toISOString(), at = t.getRange(2, 2, last - 1, 1).getValues().map(x => String(x[0]));
  let k = 0;
  while (k < at.length && at[k] < from) k++;
  if (!k) return 0;
  if (typeof t.deleteRows === 'function') t.deleteRows(2, k); else for (let i = k; i >= 1; i--) t.deleteRow(i + 1);
  return k;
}
// ตารางที่ดูประวัติได้ในแต่ละแถบ (ต้องดูแถบนั้นได้)
const AUDIT_VIEWS = { pchart: ['reg', 'dq', 'appt', 'ctsim', 'cases', 'bq', 'rtd', 'see', 'visit', 'ncall', 'notify', 'txspub', 'txo'],   // API 139: Patient chart (ตาม HN)
  evaluate: ['cases', 'txo'], contour: ['ctsim', 'txo'], nurse: ['appt', 'dq', 'rtd', 'see', 'visit', 'ncall'],   // API 86 · 88: ตารางพบแพทย์
  deptcal: ['events', 'leaves', 'dqLeave'], reg: ['reg'], dq: ['dq', 'dqLeave', 'dqDuty'], mpleave: ['leaves'], rojobs: ['dqLeave', 'roJobs'], consult: ['dq', 'appt', 'rtd', 'visit'], appt: ['appt'], bq: ['bq'], work: ['cases'], pend: ['cases'], queue: ['cases', 'leaves'],
  chartchk: ['cck'],   // API 145
  course: ['cases', 'duty', 'see'], ctsim: ['ctsim', 'vac', 'appt'], dash: ['cases'], logs: ['logs'], p4p: ['logs'], jobs: ['jobs', 'vac'], settings: ['config'] };
function auditTablesFor_(view, token) {
  const ss = ss_(), cfg = readConfig_(ss) || {}, u = who_(token, ss, cfg);
  if (!AUDIT_VIEWS[view]) throw new Error('แถบนี้ไม่มีประวัติการบันทึก');
  if (u.via !== 'google' && !userAccess_(cfg, view, u)) throw new Error('ดูประวัติของแถบนี้ไม่ได้');
  return { ss: ss, tables: AUDIT_VIEWS[view] };
}
const auditRow_ = (r, i) => ({ row: i, at: String(r[0]), by: String(r[1]), user: String(r[2]), table: String(r[3]), id: String(r[4]), hn: String(r[5]), act: String(r[6]), fn: String(r[7]), what: (() => { try { return JSON.parse(String(r[8] || '{}')); } catch (e) { return {}; } })() });
// ประวัติล่าสุดของแถบ (ใหม่ก่อน) · q = คำค้น (HN ผู้บันทึก รายละเอียด) · before = แถวที่อ่านถึงแล้ว (โหลดเพิ่ม) · คืน { rows, before, more }
function auditRecent(view, q, before, token) {
  const a = auditTablesFor_(view, token), sh = sheet_(a.ss, AUDIT_SHEET);
  if (!sh || sh.getLastRow() < 2) return { rows: [], before: 0, more: false };
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean), out = [];
  let end = Math.min(sh.getLastRow(), +before > 1 ? +before - 1 : sh.getLastRow());
  while (end >= 2 && out.length < 150) {
    const start = Math.max(2, end - 1999), vals = sh.getRange(start, 1, end - start + 1, AUDIT_HEAD.length).getValues();
    for (let i = vals.length - 1; i >= 0 && out.length < 150; i--) {
      const r = vals[i];
      if (a.tables.indexOf(String(r[3])) < 0) continue;
      if (words.length) { const t = (r[1] + ' ' + r[2] + ' ' + r[5] + ' ' + r[8]).toLowerCase(); if (!words.every(w => t.indexOf(w) >= 0)) continue; }
      out.push(auditRow_(r, start + i));
    }
    end = start - 1;
    if (!words.length && out.length) break;   // ไม่ค้นหา: ทีละ 2,000 แถว
  }
  const last = out.length ? out[out.length - 1].row : end + 1;
  return { rows: out, before: last, more: last > 2 };
}
// API 128 (24 พ.ย.): ประวัติการบันทึกของแถบ / แถบย่อย · opt = { q (ค้นหา), before (แถวก่อนหน้า · โหลดเพิ่ม), from / to (วันที่ตามเวลาของชีต · ว่าง = ทั้งหมด), tables (ตารางของแถบย่อย ⊂ ตารางของแถบ) }
// แถวใน AuditLog เรียงตามเวลา: อ่านจากท้ายทีละ 2,000 แถว · เจอแถวที่เก่ากว่า from = หยุด · ไม่เกิน 150 รายการ / 40,000 แถวต่อครั้ง (กดโหลดเพิ่มต่อได้)
function auditRange(view, opt, token) {
  opt = opt && typeof opt === 'object' ? opt : {};
  const a = auditTablesFor_(view, token), sh = sheet_(a.ss, AUDIT_SHEET);
  const want = Array.isArray(opt.tables) && opt.tables.length ? a.tables.filter(t => opt.tables.indexOf(t) >= 0) : a.tables;
  const isD = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')), from = isD(opt.from) ? String(opt.from) : '', to = isD(opt.to) ? String(opt.to) : '';
  if (!sh || sh.getLastRow() < 2 || !want.length) return { rows: [], before: 0, more: false };
  const tz = tz_(a.ss), dayOf = v => { const d = v instanceof Date ? v : new Date(String(v)); return isNaN(d) ? '' : Utilities.formatDate(d, tz, 'yyyy-MM-dd'); };
  const words = String(opt.q || '').toLowerCase().split(/\s+/).filter(Boolean), out = [];
  let end = Math.min(sh.getLastRow(), +opt.before > 1 ? +opt.before - 1 : sh.getLastRow()), done = false, scanned = 0;
  while (end >= 2 && out.length < 150 && !done && scanned < 40000) {
    const start = Math.max(2, end - 1999), vals = sh.getRange(start, 1, end - start + 1, AUDIT_HEAD.length).getValues();
    let i = vals.length - 1;
    for (; i >= 0 && out.length < 150; i--) {
      const r = vals[i], d = from || to ? dayOf(r[0]) : '';
      if (from && d && d < from) { done = true; break; }
      if (to && d && d > to) continue;
      if (want.indexOf(String(r[3])) < 0) continue;
      if (words.length) { const t = (r[1] + ' ' + r[2] + ' ' + r[5] + ' ' + r[8]).toLowerCase(); if (!words.every(w => t.indexOf(w) >= 0)) continue; }
      out.push(auditRow_(r, start + i));
    }
    scanned += vals.length;
    end = start + i;   // แถวถัดไปที่ยังไม่ได้ดู (i = −1 = อ่านหมดช่วงนี้แล้ว)
    if (!words.length && !from && !to && out.length) break;   // ไม่กรอง: ทีละ 2,000 แถวเหมือนเดิม
  }
  const last = out.length ? out[out.length - 1].row : end + 1;
  return { rows: out, before: last, more: !done && last > 2 };
}
// ประวัติของรายการ (id ไม่เกิน 30) ใหม่ก่อน
function auditFor(ids, view, token) {
  const a = auditTablesFor_(view, token), sh = sheet_(a.ss, AUDIT_SHEET);
  ids = (Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean).slice(0, 30);
  if (!sh || sh.getLastRow() < 2 || !ids.length) return [];
  const n = sh.getLastRow() - 1, col = sh.getRange(2, 5, n, 1), rows = {};
  if (typeof col.createTextFinder === 'function') ids.forEach(id => col.createTextFinder(id).matchEntireCell(true).findAll().forEach(c => { rows[c.getRow()] = true; }));
  else col.getValues().forEach((v, i) => { if (ids.indexOf(String(v[0])) >= 0) rows[i + 2] = true; });
  return Object.keys(rows).map(Number).sort((x, y) => y - x).slice(0, 300)
    .map(r => auditRow_(sh.getRange(r, 1, 1, AUDIT_HEAD.length).getValues()[0], r)).filter(x => a.tables.indexOf(x.table) >= 0);
}
// API 139 (25 พ.ย.): Patient chart → ประวัติการบันทึกของผู้ป่วยหนึ่งคน (HN) จากทุกตารางของผู้ป่วย · ใหม่ก่อน ไม่เกิน 300 รายการ
// สิทธิ์ = เปิด Patient chart ได้ (ตั้งค่า → แถบเมนู → Patient chart) · ไม่ส่งค่า QA (Dose check / F0 / Delta4 / SRS MapCheck: ค่า หมายเหตุ ทั้งแผนแรกและแผนอื่น)
const PC_QA_ = /^(Dose check|F0|Delta4|SRS MapCheck) (ค่า|หมายเหตุ)$/;
const pcQaJson_ = v => String(v == null ? '' : v).replace(/"(mu|d0|d4|mc)(Val|Note)":"(?:[^"\\]|\\.)*",?/g, '').replace(/,(\s*[}\]])/g, '$1');
function pcNoQa_(what) {
  const out = {};
  Object.keys(what || {}).forEach(k => {
    if (PC_QA_.test(k)) return;
    const v = what[k];
    out[k] = k === 'ขั้นตอนของ boost' ? (Array.isArray(v) ? v.map(pcQaJson_) : pcQaJson_(v)) : v;
  });
  return out;
}
function auditHn(hn, token) {
  const a = auditTablesFor_('pchart', token), sh = sheet_(a.ss, AUDIT_SHEET);
  const u0 = AUDIT_U_ || {}, tabs = a.tables.concat(u0.isAdmin || u0.via === 'google' ? ['pcview'] : []);   // API 140: แอดมินเห็นการเปิดดู chart ด้วย
  const k = String(hn == null ? '' : hn).trim();
  if (!k || k.length > 20 || !/\d/.test(k)) throw new Error('HN ไม่ถูกต้อง');
  if (!sh || sh.getLastRow() < 2) return { rows: [], more: false };
  const n = sh.getLastRow() - 1, col = sh.getRange(2, 6, n, 1), rows = {};
  if (typeof col.createTextFinder === 'function') col.createTextFinder(k).matchEntireCell(true).findAll().forEach(c => { rows[c.getRow()] = true; });
  else col.getValues().forEach((v, i) => { if (String(v[0]).trim() === k) rows[i + 2] = true; });
  const all = Object.keys(rows).map(Number).sort((x, y) => y - x);
  const out = all.slice(0, 300).map(r => auditRow_(sh.getRange(r, 1, 1, AUDIT_HEAD.length).getValues()[0], r))
    .filter(x => tabs.indexOf(x.table) >= 0).map(x => { x.what = pcNoQa_(x.what); return x; });
  return { rows: out, more: all.length > 300 };
}
// API 140 (25 พ.ย.): เปิด Patient chart = บันทึกการเปิดดู (ตาราง pcview ใน AuditLog · ผู้ใช้ + HN · คนเดิม HN เดิมภายใน 10 นาที = ไม่บันทึกซ้ำ)
// ตามหลักบันทึกการเข้าถึงข้อมูลสุขภาพ (ISO 27799 / PDPA) · แอดมินเห็นในแท็บประวัติการบันทึกของ chart · ผู้ใช้อื่นไม่เห็น
function pcSeen(hn, token) {
  auditTablesFor_('pchart', token);   // ต้องเปิด chart ได้
  const k = String(hn == null ? '' : hn).trim();
  if (!k || k.length > 20 || !/\d/.test(k)) throw new Error('HN ไม่ถูกต้อง');
  const u = AUDIT_U_ || {}, c = CacheService.getScriptCache(), key = 'pcs_' + String(u.username || u.me || u.name || '').slice(0, 80) + '_' + k;
  if (c.get(key)) return { ok: true, dup: true };
  c.put(key, '1', 600);
  audit_('pcview', k, k, 'view', {});
  return { ok: true };
}
function withLock_(fn) {
  if (LOCKED_) return fn();   // ถือล็อกอยู่แล้วในคำขอนี้
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('มีคนกำลังบันทึกข้อมูลอยู่ รอสักครู่แล้วลองใหม่');
  LOCKED_ = true;
  REQ_.head = null;   // หัวคอลัมน์: อ่านใหม่หนึ่งครั้งหลังได้ล็อก
  REQ_.auditAt = null;
  try {
    return fn();
  } finally {
    LOCKED_ = false;
    try { auditFlush_(); SpreadsheetApp.flush(); saveDirty_(); } finally { lock.releaseLock(); }
  }
}

/* ---------- ชีตเก็บข้อมูล ---------- */

// ชีตที่ผูกสคริปต์ → ชีตใน Script property SHEET_ID → สร้างชีตใหม่ครั้งแรกแล้วจำ ID ไว้ใน SHEET_ID
let SS_ = null;
function ss_() {
  if (SS_) return SS_;
  if (PRACTICE_) return (SS_ = practiceSs_());   // API 95: โหมดฝึกใช้
  const bound = SpreadsheetApp.getActive();
  if (bound) return (SS_ = bound);
  const id = sheetIdProp_();
  if (id) return (SS_ = openSheet_(id));
  // สร้างภายใต้ล็อก กันสองคนเปิดครั้งแรกพร้อมกันแล้วได้ชีตคนละไฟล์
  return (SS_ = withLock_(() => {
    const again = sheetIdProp_(true);
    if (again) return openSheet_(again);
    const ss = SpreadsheetApp.create(APP_TITLE + ' (ข้อมูล)');
    ss.setSpreadsheetTimeZone('Asia/Bangkok');
    const first = ss.getSheets()[0];
    first.setName(TABLES.cases.sheet);
    first.setFrozenRows(1);
    propSave_('SHEET_ID', ss.getId());
    return ss;
  }));
}

// ID จาก Script property SHEET_ID (ใส่ได้ทั้ง ID และลิงก์ของชีต) ไม่ได้ตั้ง = ''
function sheetIdProp_(fresh) {
  const raw = String((fresh ? PropertiesService.getScriptProperties().getProperty('SHEET_ID') : propRead_('SHEET_ID')) || '').trim();
  if (!raw) return '';
  const m = /\/d\/([\w-]{20,})/.exec(raw) || /^([\w-]{20,})$/.exec(raw);
  if (!m) throw new Error('Script property SHEET_ID ต้องเป็น ID หรือลิงก์ของ Google Sheet (ตอนนี้: ' + raw + ')');
  return m[1];
}

function openSheet_(id) {
  try { return SpreadsheetApp.openById(id); } catch (e) {
    throw new Error('เปิดชีตใน Script property SHEET_ID ไม่ได้ (' + e.message + ') ตรวจ ID และบัญชีที่ Deploy ต้องแก้ไขชีตนั้นได้');
  }
}

// ใช้ชีตจากไหน (ไม่สร้างชีต) bound | property | none (none = จะสร้างใหม่เมื่อใช้งานครั้งแรก)
function sheetSource_() {
  try {
    if (SpreadsheetApp.getActive()) return 'bound';
    return sheetIdProp_() ? 'property' : 'none';
  } catch (e) { return 'error'; }
}

/* ---------- API 95 (19 พ.ย.): โหมดฝึกใช้ ----------
 * หน้าเว็บในโหมดฝึกเรียกทุกฟังก์ชันผ่าน practiceCall → ss_() = ไฟล์ข้อมูลฝึก (Google Sheet แยก · Script property PRACTICE_SHEET_ID)
 * ไฟล์ฝึกสร้างเองครั้งแรกใน Drive ของบัญชีที่ Deploy · ชีต Config คัดลอกจากระบบจริง (ห้อง แพทย์ สิทธิ์ ฟอร์ม ลิมิต) · แก้ตั้งค่าในโหมดฝึก = แก้ในไฟล์ฝึก
 * รุ่นตาราง / สำเนาตารางในแคช / สถานะที่เก็บถาวร ใช้ชื่อแยก (pk_) · ไม่ส่งอีเมล · ฟังก์ชันที่เชื่อมระบบภายนอก สำรองข้อมูล ตั้ง PIN ใช้ไม่ได้
 * ไฟล์จริงไม่ถูกเปิดเพื่อเขียนเลย (ยกเว้นอ่านชีต Config ตอนสร้าง / ล้างไฟล์ฝึก และตรวจแอดมินตอนล้าง) */
let PRACTICE_ = false;
const PRACTICE_PROP = 'PRACTICE_SHEET_ID', PRACTICE_AT = 'PRACTICE_AT';
// API 96: แอดมินเปิด / ปิดโหมดฝึกใช้ (Script property PRACTICE_ON = '1' · ไม่ได้ตั้ง = ปิด) · ปิด = ทุกการเรียกในโหมดฝึกถูกปฏิเสธ (หน้าเว็บกลับระบบจริง · ไม่ส่งต่อไปบันทึกในระบบจริง)
const PRACTICE_ON = 'PRACTICE_ON', PRACTICE_OFF_MSG = 'PRACTICE_OFF|แอดมินปิดโหมดฝึกใช้อยู่ · ตอนนี้กลับเป็นระบบจริงแล้ว (สิ่งที่เพิ่งกดในโหมดฝึกไม่ได้บันทึก)';
const practiceOn_ = () => String(propRead_(PRACTICE_ON) || '') === '1';
const PRACTICE_NO = ['doGet', 'onOpen', 'openApp', 'practiceCall', 'importLegacy', 'txsPdf', 'bqImportCheck', 'bqImport', 'vacImportCheck', 'vacImport',
  'regDriveCheck', 'regDrivePull', 'regDriveTick', 'tdfxList', 'tdfxSave', 'tdfxRecheck', 'tdfxSavePdf', 'tdfxWithdraw', 'tdfxCheck', 'tdfCheck', 'tdfPull',
  'hdrGet', 'hdrAdd', 'brachyCheck', 'brachyPull', 'brachyTick', 'spqCheck', 'spqPull', 'setPin', 'setupLpch', 'snapWarm', 'snapTick',
  'backupDaily', 'backupInstall', 'backupStatus', 'backupSave', 'backupNow', 'sbkState', 'sbkCreate', 'sbkUpdate', 'sbkDelete', 'sbkSetNext', 'sbkCheck'];
const PRACTICE_MSG = 'ใช้ในโหมดฝึกใช้ไม่ได้ (เชื่อมระบบภายนอก / สำรองข้อมูล / ตั้งรหัส PIN) · ออกจากโหมดฝึกใช้แล้วทำในระบบจริง';
function practiceCall(fn, args) {
  fn = String(fn || '');
  const f = /^[a-z][A-Za-z0-9]{1,60}$/.test(fn) && PRACTICE_NO.indexOf(fn) < 0 ? globalThis[fn] : null;
  if (typeof f !== 'function') throw new Error(PRACTICE_MSG + ' · ' + fn);
  if (fn !== 'practiceSet' && !practiceOn_()) throw new Error(PRACTICE_OFF_MSG);
  PRACTICE_ = true;
  SS_ = null;
  CFG_MEMO_ = null;
  return f.apply(null, Array.isArray(args) ? args.slice(0, 20) : []);
}
// ไฟล์ของระบบจริง (ไม่ใช่โหมดฝึก) · ใช้อ่าน Config / ตรวจแอดมิน
function realSs_() {
  const keep = PRACTICE_, s0 = SS_;
  PRACTICE_ = false;
  SS_ = null;
  try { return ss_(); } finally { PRACTICE_ = keep; SS_ = s0; }
}
const realIds_ = () => {
  const ids = [];
  try { const b = SpreadsheetApp.getActive(); if (b) ids.push(b.getId()); } catch (e) { /* ไม่ได้ผูกชีต */ }
  try { const p = sheetIdProp_(); if (p) ids.push(p); } catch (e) { /* ไม่ได้ตั้ง */ }
  return ids;
};
function practiceSs_() {
  const id = String(propRead_(PRACTICE_PROP) || '');
  if (id && realIds_().indexOf(id) < 0) { try { return SpreadsheetApp.openById(id); } catch (e) { /* ถูกลบ = สร้างใหม่ */ } }
  // API 97: สร้างไฟล์ (หลายวินาที) นอกล็อกบันทึก · สองคนเปิดพร้อมกันครั้งแรก = ใช้ไฟล์ของคนที่ตั้งค่าก่อน อีกไฟล์ไปถังขยะ
  const made = practiceMake_(true);
  return withLock_(() => {
    const again = String(PropertiesService.getScriptProperties().getProperty(PRACTICE_PROP) || '');
    if (again && again !== id && again !== made.getId() && realIds_().indexOf(again) < 0) {
      try { const other = SpreadsheetApp.openById(again); try { DriveApp.getFileById(made.getId()).setTrashed(true); } catch (e) { /* ทิ้งไว้ */ } return other; } catch (e) { /* ใช้ไฟล์ที่สร้าง */ }
    }
    propSave_(PRACTICE_PROP, made.getId());
    propSave_(PRACTICE_AT, new Date().toISOString());
    return made;
  });
}
// ไฟล์ฝึกใหม่: Config จากระบบจริง · ไม่มีข้อมูลผู้ป่วย (หน้าเว็บส่งผู้ป่วยตัวอย่างมาใส่ด้วย practiceReset)
function practiceMake_(hold) {
  const real = realSs_(), ss = SpreadsheetApp.create('ฝึกใช้ (ข้อมูลทดลอง ไม่ใช่ข้อมูลจริง) — ' + real.getName());
  try { ss.setSpreadsheetTimeZone(real.getSpreadsheetTimeZone()); } catch (e) { /* ใช้เขตเวลาเริ่มต้น */ }
  const first = ss.getSheets()[0], cfg = real.getSheetByName(CONFIG_SHEET);
  if (cfg) cfg.copyTo(ss).setName(CONFIG_SHEET);
  if (first && first.getName() !== CONFIG_SHEET) first.setName(TABLES.cases.sheet);
  if (hold) return ss;   // ผู้เรียกตั้ง property เอง (ในล็อก)
  propSave_(PRACTICE_PROP, ss.getId());
  propSave_(PRACTICE_AT, new Date().toISOString());
  return ss;
}
// ตารางที่ผู้ป่วยตัวอย่างใส่ได้ · HN ต้องขึ้นต้น 999 (ผู้ป่วยสมมติ) · ตารางละไม่เกิน 500 แถว
const PRACTICE_SEED = ['cases', 'logs', 'leaves', 'appt', 'duty', 'reg', 'bq', 'spq', 'dq', 'dqLeave'];
const PRACTICE_CORE = ['cases', 'reg', 'appt', 'dq', 'bq', 'ctsim'];
function practiceSeed_(ss, seed) {
  const out = {};
  if (!seed || typeof seed !== 'object') return out;
  const now = new Date().toISOString();
  PRACTICE_SEED.forEach(t => {
    if (!TABLES[t] || !Array.isArray(seed[t])) return;
    const rows = seed[t].filter(r => r && typeof r === 'object' && r.id && (!r.hn || /^999\d{6}$/.test(String(r.hn)))).slice(0, 500);
    if (!rows.length) return;
    const sh = tableSheet_(ss, t), header = headerOf_(sh), def = tableDef_(t), by = {};
    def.fields.forEach(f => { by[f[1]] = f[0]; });
    const vals = rows.map(r => header.map(h => (h === REV_HEAD ? now : h in by ? safeText_(r[by[h]]) : '')));
    sh.getRange(Math.max(2, sh.getLastRow() + 1), 1, vals.length, header.length).setNumberFormat('@').setValues(vals);
    out[t] = vals.length;
  });
  return out;
}
// แอดมิน (ตามการตั้งค่าของระบบจริง): เปิด / ปิดโหมดฝึกใช้ของทุกคน · ข้อมูลฝึกเก็บไว้ (เปิดอีกครั้งใช้ต่อได้) · บันทึกในประวัติของระบบจริง
function practiceSet(on, token) {
  PRACTICE_ = false;
  SS_ = null;
  CFG_MEMO_ = null;
  const real = ss_(), u = who_(token, real, readConfig_(real) || {});
  if (u.via !== 'google' && !u.isAdmin) throw new Error('เปิด / ปิดโหมดฝึกใช้ได้เฉพาะแอดมิน');
  on = on === true;
  return withLock_(() => {
    if (practiceOn_() !== on) {
      propSave_(PRACTICE_ON, on ? '1' : '');
      audit_('config', '', '', 'edit', { 'โหมดฝึกใช้': on ? 'เปิด' : 'ปิด' });
    }
    return { on: on };
  });
}
const practiceEmpty_ = ss => PRACTICE_CORE.every(t => { const sh = sheet_(ss, TABLES[t].sheet); return !sh || sh.getLastRow() < 2; });
// ล้างข้อมูลฝึกเริ่มใหม่ (แอดมินของระบบจริง): ไฟล์ฝึกใหม่ + Config ล่าสุดจากระบบจริง + ผู้ป่วยตัวอย่าง · ไฟล์ฝึกเดิมไปถังขยะของ Drive
// ไฟล์ฝึกยังว่าง (ยังไม่มีผู้ป่วย) = ใครก็ใส่ผู้ป่วยตัวอย่างได้ (ครั้งแรกที่เปิดโหมดฝึก)
function practiceReset(seed, fresh, token) {
  PRACTICE_ = false;   // แอดมิน = ตามการตั้งค่าของระบบจริง (ไม่ใช่ Config ในไฟล์ฝึกที่แก้ได้)
  SS_ = null;
  CFG_MEMO_ = null;
  const real = ss_(), u = who_(token, real, readConfig_(real) || {}), admin = u.via === 'google' || !!u.isAdmin;
  PRACTICE_ = true;
  SS_ = null;
  CFG_MEMO_ = null;
  if (fresh === true) {   // API 97: ไฟล์ใหม่ + ผู้ป่วยตัวอย่าง เตรียมนอกล็อกบันทึก (ยังไม่มีใครใช้ไฟล์นี้) · ล็อกเฉพาะตอนสลับไฟล์
    if (!admin) throw new Error('ล้างข้อมูลฝึกได้เฉพาะแอดมิน');
    const ss = practiceMake_(true);
    SS_ = ss;
    const seeded = practiceSeed_(ss, seed);
    SpreadsheetApp.flush();
    return withLock_(() => {
      const old = String(PropertiesService.getScriptProperties().getProperty(PRACTICE_PROP) || '');
      propSave_(PRACTICE_PROP, ss.getId());
      propSave_(PRACTICE_AT, new Date().toISOString());
      if (old && old !== ss.getId() && realIds_().indexOf(old) < 0) { try { DriveApp.getFileById(old).setTrashed(true); } catch (e) { /* ลบไม่ได้: ไม่เป็นไร */ } }
      Object.keys(TABLES).forEach(t => markDirty_(t));   // รุ่นตารางใหม่ทั้งหมด (สำเนาในแคชของไฟล์เดิมใช้ไม่ได้)
      return { fresh: true, seeded: seeded };
    });
  }
  const ss = ss_();   // ไฟล์ฝึกยังไม่มี = สร้างนอกล็อก
  return withLock_(() => {
    if (!practiceEmpty_(ss)) return { fresh: false, seeded: {}, skipped: true };   // มีข้อมูลฝึกอยู่แล้ว (คนอื่นใส่ไปก่อน)
    return { fresh: false, seeded: practiceSeed_(ss, seed) };
  });
}

/* ---------- สำรองข้อมูล (API 77) · แจ้งเตือนทางอีเมล ---------- */
// สำรองทั้งไฟล์ชีตทุกคืน (ทริกเกอร์ backupDaily) ไปที่โฟลเดอร์ใน Drive ของเจ้าของ · เก็บรายวัน keepDays วัน + ฉบับแรกของแต่ละเดือน keepMonths เดือน (เก่ากว่านั้นย้ายไปถังขยะ)
// ส่งไฟล์ .xlsx ทางอีเมลถึงเจ้าของ (บัญชีที่รัน Apps Script) เท่านั้น ตาม every (day | week = วันจันทร์ | month = วันที่ 1 | off) · ค่าต่าง ๆ เก็บใน Script properties
// แจ้งเตือนเจ้าของ (alerts): สำรองไม่สำเร็จ · รหัส PIN ถูกล็อก · ลบข้อมูลจำนวนมาก · ครั้งแรกเจ้าของต้องกด Run ฟังก์ชัน backupInstall ในหน้า Apps Script เพื่ออนุญาต Drive / Gmail / ทริกเกอร์
const BACKUP_CFG = 'BACKUP_CFG', BACKUP_STATE = 'BACKUP_STATE', BACKUP_FOLDER = 'BACKUP_FOLDER', BACKUP_PREFIX = 'backup ';
const BACKUP_MAIL_MAX = 20 * 1024 * 1024;   // ไฟล์ใหญ่กว่านี้ส่งลิงก์แทนแนบไฟล์ (อีเมลแนบได้ไม่เกิน 25 MB)
const DEL_ALERT_ONCE = 10, DEL_ALERT_DAY = 30;   // ลบในคำขอเดียว ≥ 10 รายการ · หรือคนเดียวลบรวมในวันเดียว ≥ 30 รายการ = แจ้งเตือน
const BACKUP_DEF = { hour: 2, keepDays: 30, keepMonths: 12, every: 'day', alerts: true };
function backupCfg_(v) {
  let c = v;
  if (c === undefined) { try { c = JSON.parse(PropertiesService.getScriptProperties().getProperty(BACKUP_CFG) || '{}'); } catch (e) { c = {}; } }
  c = c && typeof c === 'object' ? c : {};
  const num = (x, lo, hi, d) => (x === '' || x == null || !isFinite(+x) ? d : Math.min(hi, Math.max(lo, Math.floor(+x))));
  return { hour: num(c.hour, 0, 23, BACKUP_DEF.hour), keepDays: num(c.keepDays, 3, 90, BACKUP_DEF.keepDays), keepMonths: num(c.keepMonths, 0, 36, BACKUP_DEF.keepMonths),
    every: ['day', 'week', 'month', 'off'].indexOf(c.every) >= 0 ? c.every : BACKUP_DEF.every, alerts: c.alerts === undefined ? BACKUP_DEF.alerts : !!c.alerts };
}
// ผู้รับอีเมล = เจ้าของ: บัญชีที่รัน Apps Script (ทริกเกอร์ / เว็บแอปที่รันในนามเจ้าของ) · หาไม่ได้ = เจ้าของไฟล์ชีต
function backupTo_() {
  let e = '';
  try { e = String(Session.getEffectiveUser().getEmail() || ''); } catch (x) { e = ''; }
  if (!e) { try { const o = ss_().getOwner(); e = o ? String(o.getEmail() || '') : ''; } catch (x) { e = ''; } }
  return e.trim().toLowerCase();
}
function backupState_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(BACKUP_STATE) || '{}') || {}; } catch (e) { return {}; } }
function backupSetState_(o) { const st = Object.assign(backupState_(), o); PropertiesService.getScriptProperties().setProperty(BACKUP_STATE, JSON.stringify(st)); return st; }
function backupAdmin_(token) {
  const u = who_(token);
  if (u.via !== 'google' && !u.isAdmin) throw new Error('ตั้งค่าสำรองข้อมูลได้เฉพาะแอดมิน');
  return u;
}
// โฟลเดอร์สำรอง (สร้างครั้งแรก · ไม่แชร์ให้ใคร)
function backupFolder_() {
  const p = PropertiesService.getScriptProperties(), id = p.getProperty(BACKUP_FOLDER);
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* ถูกลบ = สร้างใหม่ */ } }
  const f = DriveApp.createFolder('สำรองข้อมูล ' + appTitle_());
  p.setProperty(BACKUP_FOLDER, f.getId());
  return f;
}
// สำเนาทั้งไฟล์ → ย้ายฉบับเก่าไปถังขยะ → ส่งอีเมล (ถ้าถึงรอบหรือสั่ง) · คืนสถานะ
function backupRun_(why, mailNow) {
  const ss = ss_(), tz = tz_(ss), now = new Date(), stamp = Utilities.formatDate(now, tz, 'yyyy-MM-dd HHmm');
  let st;
  try {
    SpreadsheetApp.flush();
    const folder = backupFolder_(), file = DriveApp.getFileById(ss.getId()).makeCopy(BACKUP_PREFIX + stamp + ' · ' + ss.getName(), folder);
    const cfg = backupCfg_(), size = backupPrune_(folder, cfg, now, tz);
    st = backupSetState_({ at: now.toISOString(), ok: true, err: '', why: why, file: file.getId(), url: file.getUrl(), name: file.getName(), folder: folder.getUrl(), kept: size.kept, trashed: size.trashed });
    const day = Utilities.formatDate(now, tz, 'u'), date = Utilities.formatDate(now, tz, 'd');
    const due = cfg.every === 'day' || (cfg.every === 'week' && day === '1') || (cfg.every === 'month' && date === '1');
    const to = backupTo_();
    if (to && (mailNow === true || (mailNow !== false && due))) st = backupMail_(file, to, now, tz);
  } catch (e) {
    st = backupSetState_({ at: now.toISOString(), ok: false, err: String(e && e.message || e), why: why });
    alert_('backup', 'สำรองข้อมูลไม่สำเร็จ', 'สำรองข้อมูลเมื่อ ' + Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm') + ' ไม่สำเร็จ\nสาเหตุ: ' + st.err + '\n\nเปิดหน้าเว็บ → ตั้งค่า → สำรองข้อมูล เพื่อดูสถานะ หรือกด สำรองตอนนี้');
  }
  return st;
}
// เก็บ: ทุกฉบับใน keepDays วันล่าสุด + ฉบับแรกของแต่ละเดือนใน keepMonths เดือนล่าสุด · ที่เหลือย้ายไปถังขยะ (กู้คืนได้ 30 วัน)
function backupPrune_(folder, cfg, now, tz) {
  const list = [], it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next(), m = String(f.getName()).match(/^backup (\d{4}-\d{2}-\d{2}) (\d{4})/);
    if (m) list.push({ f: f, d: m[1], k: m[1] + m[2] });
  }
  list.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  const today = Utilities.formatDate(now, tz, 'yyyy-MM-dd'), dayMs = 864e5, from = Utilities.formatDate(new Date(now.getTime() - (cfg.keepDays - 1) * dayMs), tz, 'yyyy-MM-dd');
  const ym = today.slice(0, 7), y = +ym.slice(0, 4), mo = +ym.slice(5, 7), first = {};
  const monthOk = d => { const n = (y - +d.slice(0, 4)) * 12 + (mo - +d.slice(5, 7)); return n >= 0 && n < cfg.keepMonths; };
  let kept = 0, trashed = 0;
  list.forEach(x => {
    const m = x.d.slice(0, 7), isFirst = !first[m];
    first[m] = true;
    if (x.d >= from || (isFirst && monthOk(x.d))) { kept++; return; }
    try { x.f.setTrashed(true); trashed++; } catch (e) { console.log('backupPrune_ ' + e); }
  });
  return { kept: kept, trashed: trashed };
}
// ส่งไฟล์ .xlsx ของฉบับที่สำรองถึงเจ้าของ (ใหญ่เกิน = ส่งลิงก์ไฟล์ใน Drive)
function backupMail_(file, to, now, tz) {
  const when = Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm'), title = appTitle_();
  try {
    // API 140: ส่งลิงก์ไฟล์สำรองใน Google Drive (เปิดได้เฉพาะบัญชีที่มีสิทธิ์ในไฟล์) แทนแนบไฟล์ · อีเมลไม่มีข้อมูลผู้ป่วย
    const body = 'สำรองข้อมูล ' + title + ' เมื่อ ' + when + '\nเปิดไฟล์สำรอง (Google Drive · เปิดได้เฉพาะบัญชีที่มีสิทธิ์ในไฟล์): ' + file.getUrl()
      + '\n\nไฟล์สำรองมีข้อมูลผู้ป่วย อย่าแชร์ไฟล์หรือโฟลเดอร์ให้ผู้อื่น และอย่าดาวน์โหลดเก็บในเครื่องส่วนตัว (พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล)';
    MailApp.sendEmail({ to: to, subject: 'สำรองข้อมูล ' + title + ' · ' + when, body: body, name: title });
    return backupSetState_({ mailAt: now.toISOString(), mailTo: to, mailErr: '', mailSize: 0, mailLink: true });
  } catch (e) {
    const st = backupSetState_({ mailAt: now.toISOString(), mailErr: String(e && e.message || e) });
    alert_('backupmail', 'ส่งไฟล์สำรองทางอีเมลไม่สำเร็จ', 'สำรองข้อมูลใน Drive แล้ว แต่ส่งอีเมลไม่สำเร็จ: ' + st.mailErr);
    return st;
  }
}
// ทริกเกอร์สำรองทุกวันตามเวลาที่ตั้ง (ลบของเดิมแล้วสร้างใหม่) · คืน true เมื่อมีทริกเกอร์
function backupTrigger_(cfg) {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'backupDaily').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('backupDaily').timeBased().everyDays(1).atHour(cfg.hour).inTimezone(tz_(ss_())).create();
  try { snapTrigger_(); } catch (e) { console.log('snapTrigger_ ' + e); }   // API 89: อุ่นแคช (ตั้งไม่ได้ = ไม่กระทบการสำรอง)
  return true;
}
// API 89: อุ่นสำเนาตารางในแคชทุกชั่วโมง (06–20 น.) · ผู้ใช้ที่เข้าระบบ / โหลดข้อมูลไม่ต้องรออ่านชีตเต็ม · ตั้งพร้อมสำรองข้อมูลอัตโนมัติ
function snapTrigger_() {
  const ts = ScriptApp.getProjectTriggers();
  if (ts.some(t => t.getHandlerFunction() === 'snapWarm')) return false;
  ScriptApp.newTrigger('snapWarm').timeBased().everyHours(1).create();
  return true;
}
function snapWarm(e) {
  ownerRun_(e);   // API 140
  try { ntfDueRun_(); } catch (x) { console.log('snapWarm ntfDueRun_ ' + x); }   // API 150: สำรองของตัวตั้งเวลา ntfDue
  const ss = ss_(), h = +Utilities.formatDate(new Date(), tz_(ss), 'H');
  if (h < 6 || h > 20) return 'night';
  const config = readConfig_(ss), user = { via: 'google', isAdmin: true, name: 'snapWarm', username: '', role: '' };
  REQ_.snapAge = 40 * 60000;   // สำเนาที่อายุเกิน 40 นาที = อ่านชีตใหม่ (ผู้ใช้ใช้ได้ถึง 1 ชั่วโมง จึงไม่เจอสำเนาเก่า)
  const out = tablesFor_(ss, config, user, guestNeeds_(user, config), { pack: 1 });
  return JSON.stringify(out.src || {});
}
// ทริกเกอร์รายวัน (เรียกจากหน้าเว็บได้ด้วย จึงไม่ทำซ้ำถ้าสำรองอัตโนมัติไปแล้วภายใน 12 ชั่วโมง)
function backupDaily(e) {
  ownerRun_(e);   // API 140: หน้าเว็บสั่งสำรองเองไม่ได้ (แอดมินใช้ปุ่ม สำรองตอนนี้ ในตั้งค่า)
  try { regArchive_(ss_(), readConfig_(ss_()) || {}, false); } catch (e) { console.log('backupDaily regArchive_ ' + e); }   // API 89: ย้ายผู้ป่วยเก่าตอนกลางคืน
  try { trashPrune_(ss_()); } catch (e) { console.log('backupDaily trashPrune_ ' + e); }   // API 93: ถังขยะเกิน 90 วัน
  const last = backupState_();
  if (last.why === 'auto' && last.ok && Date.now() - Date.parse(last.at) < 12 * 36e5) return 'skip';
  backupRun_('auto');
  return 'ok';
}
// ครั้งแรก: เจ้าของกด Run ฟังก์ชันนี้ในหน้า Apps Script เพื่ออนุญาต Drive / Gmail / ทริกเกอร์ · ตั้งทริกเกอร์และสำรองหนึ่งครั้ง (ไม่ส่งอีเมล · ไม่เกินทุก 10 นาที)
function backupInstall(e) {
  ownerRun_(e);   // API 140
  const cache = CacheService.getScriptCache();
  if (cache.get('backupInstall')) return 'ทำไปแล้วเมื่อสักครู่';
  cache.put('backupInstall', '1', 600);
  const cfg = backupCfg_();
  backupTrigger_(cfg);
  const st = backupRun_('install', false);
  return st.ok ? 'ตั้งสำรองอัตโนมัติทุกวัน ' + cfg.hour + ':00 น. แล้ว · สำรองครั้งแรก: ' + st.url : 'สำรองไม่สำเร็จ: ' + st.err;
}
// หน้าตั้งค่า (แอดมิน)
function backupStatus(token) {
  backupAdmin_(token);
  let trigger = null, auth = true;
  try { trigger = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'backupDaily'); } catch (e) { auth = false; }
  if (trigger) { try { snapTrigger_(); } catch (e) { /* ครั้งหน้า */ } }   // API 89: ระบบที่ตั้งสำรองไว้ก่อน = ตั้งอุ่นแคชให้เมื่อแอดมินเปิดหน้าตั้งค่า
  return { cfg: backupCfg_(), state: backupState_(), trigger: trigger, auth: auth, to: backupTo_() };
}
function backupSave(cfg, token) {
  backupAdmin_(token);
  const c = backupCfg_(cfg);
  PropertiesService.getScriptProperties().setProperty(BACKUP_CFG, JSON.stringify(c));
  try { backupTrigger_(c); } catch (e) { throw new Error('บันทึกแล้ว แต่ตั้งสำรองอัตโนมัติไม่ได้ · เจ้าของต้องเปิด Apps Script แล้วกด Run ฟังก์ชัน backupInstall หนึ่งครั้งเพื่ออนุญาต (' + (e && e.message || e) + ')'); }
  return backupStatus(token);
}
function backupNow(mail, token) {
  backupAdmin_(token);
  const cache = CacheService.getScriptCache();
  if (cache.get('backupNow')) throw new Error('เพิ่งสำรองไปเมื่อไม่ถึง 1 นาทีที่แล้ว');
  cache.put('backupNow', '1', 60);
  backupRun_('manual', mail === true);
  return backupStatus(token);
}
// แจ้งเตือนทางอีเมลถึงเจ้าของ (เรื่องเดียวกันไม่เกินชั่วโมงละครั้ง) · ส่งไม่ได้ไม่ทำให้งานหลักล้ม
function alert_(kind, subject, text) {
  if (PRACTICE_) return false;   // API 95: โหมดฝึกใช้ไม่ส่งอีเมล
  try {
    const cfg = backupCfg_(), to = backupTo_();
    if (!cfg.alerts || !to) return false;
    const cache = CacheService.getScriptCache(), key = 'alert_' + String(kind).slice(0, 200);
    if (cache.get(key)) return false;
    cache.put(key, '1', 3600);
    const title = appTitle_();
    MailApp.sendEmail({ to: to, subject: '[แจ้งเตือน] ' + title + ' · ' + subject, body: text + '\n\nปิดการแจ้งเตือนได้ที่ หน้าเว็บ → ตั้งค่า → สำรองข้อมูล', name: title });
    return true;
  } catch (e) { console.log('alert_ ' + e); return false; }
}
// ลบข้อมูลจำนวนมาก (นับจากประวัติการบันทึกของคำขอนี้)
function alertDeletes_(rows) {
  if (PRACTICE_) return;
  const del = rows.filter(r => r[6] === 'del');
  if (!del.length) return;
  const who = String(del[0][1] || del[0][2] || 'ไม่ทราบชื่อ'), acct = String(del[0][2] || who), cache = CacheService.getScriptCache();
  const dk = 'delday_' + acct + '_' + String(del[0][0]).slice(0, 10), n = +(cache.get(dk) || 0) + del.length;
  cache.put(dk, String(n), 86400);
  if (del.length >= DEL_ALERT_ONCE || (n >= DEL_ALERT_DAY && n - del.length < DEL_ALERT_DAY)) {
    const tables = {};
    del.forEach(r => { tables[r[3]] = (tables[r[3]] || 0) + 1; });
    alert_('del_' + acct, 'ลบข้อมูลจำนวนมาก', who + ' (' + acct + ') ลบ ' + del.length + ' รายการในครั้งเดียว · วันนี้รวม ' + n + ' รายการ\nตาราง: ' + Object.keys(tables).map(k => k + ' ' + tables[k]).join(', ') + '\n\nดูรายละเอียดที่ชีต ' + AUDIT_SHEET + ' หรือ ประวัติการบันทึก ในแต่ละแถบ · กู้คืนจากไฟล์สำรองได้');
  }
}
