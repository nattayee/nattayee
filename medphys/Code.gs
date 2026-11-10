/**
 * Treatment Planning Management (ระบบกระจายงานฟิสิกส์การแพทย์) — ส่วนหลังบ้าน (Google Apps Script)
 * กลุ่มงานรังสีรักษา โรงพยาบาลมะเร็งลำปาง
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

const APP_TITLE = 'Treatment Planning Management';   // ชื่อเริ่มต้น · แอดมินเปลี่ยนได้ที่ ตั้งค่า (Config appName)
// URL /exec ของ LPCH RO Workspace (เปลี่ยนได้ที่ Script property LPCH_URL · ใส่ - เพื่อปิดและใช้บัญชี Google อย่างเดียว)
const LPCH_URL = 'https://script.google.com/macros/s/AKfycbwBVKgsqip8pavg0H-ibZFcR-9petxW12W3A8eNkO5CI8swiRIk347QMh42JryQJ_k/exec';
const LPCH_EDIT_ROLES = ['MP'];   // ตำแหน่งใน LPCH ที่บันทึกได้ทุกแถบตั้งต้น (แอดมินปรับรายแถบได้ที่ ตั้งค่า → แถบเมนู)
const LPCH_ROLES = ['RO', 'MP', 'RTT', 'Nurse', 'Other', 'Register', 'Refer'];   // ตำแหน่งใน LPCH RO Workspace (ดึงเพิ่มได้จากรายชื่อสมาชิก)
// คอลัมน์ Admin ใน ตั้งค่า → แถบเมนู (API 66): แอดมินใช้สิทธิ์รายแถบของคอลัมน์นี้แทนตำแหน่งของตัวเอง · ยังไม่ตั้ง = เท่า MP
const ADMIN_ROLE = 'Admin';
const navRole_ = u => (u && u.isAdmin && u.via !== 'google' ? ADMIN_ROLE : (u && u.role) || '');
const LPCH_CHECK_SECONDS = 300;
// หน้าเว็บ (index.html) โหลดจาก GitHub อัตโนมัติ จึงได้หน้าเว็บรุ่นล่าสุดเสมอ ไม่ต้องวางไฟล์ index ใหม่ทุกครั้ง
// เปลี่ยนได้ที่ Script property PAGE_URL · ใส่ - เพื่อใช้ไฟล์ index ในโปรเจกต์ · เปิด …/exec?refresh=1 เพื่อโหลดรุ่นล่าสุดทันที
// โหลดไม่ได้ (หรือไฟล์ไม่ครบ) จะใช้ไฟล์ index ในโปรเจกต์แทน
const PAGE_URL = 'https://raw.githubusercontent.com/nattayee/nattayee/refs/heads/claude/vigilant-bardeen-py5nxb/medphys/index.html';
const PAGE_CACHE_SECONDS = 600;
// รุ่นของไฟล์นี้ (แสดงที่บรรทัดล่างสุดของหน้าเว็บ) และรุ่นของ API ที่หน้าเว็บใช้ตรวจว่า Code.gs ใหม่พอหรือไม่
const CODE_VERSION = '2026-11-10.5';
const API_LEVEL = 66;
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
    fields: [['id', 'id'], ['mp', 'MP'], ['from', 'ตั้งแต่'], ['to', 'ถึง'], ['note', 'Note'], ['created', 'Created'], ['updated', 'Updated']],
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
  ],
};
// วันลาของแพทย์ (API 62): ลาไม่เสียคิวแจกงานแพทย์ (คนอื่นรับแทน แล้วคืนคิวเมื่อกลับมา) · เขียนผ่าน dqLeaveSave / dqLeaveRemove เท่านั้น
TABLES.dqLeave = {
  sheet: 'DocLeaves',
  fields: [['id', 'id'], ['doc', 'แพทย์'], ['from', 'ตั้งแต่'], ['to', 'ถึง'], ['note', 'Note'], ['by', 'บันทึกโดย'], ['created', 'Created'], ['updated', 'Updated']],
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
    try { vars.MEDPHYS_LPCH_TOKEN = String(lpchFinish_(lpchCall_({ action: 'ssoRedeem', ticket: String(p.sso) })).token); } catch (err) {
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
  return Object.assign(out, {
    regDrive: need.reg ? regDriveStatus_() : null,
    regArch: need.reg ? regArchStatus_() : null,
    spqSync: config && config.appt && config.appt.spq && (config.appt.spq.on || user.isAdmin) ? spqStatus_() : null,
    brachy: config && config.brachySync && (config.brachySync.on || user.isAdmin) ? brachyStatus_() : null,
    tdf: config && config.tdfSync && (config.tdfSync.on || user.isAdmin) ? extStatus_('tdf') : null,
    config: config,
    cfgReqs: user.isAdmin || (user.sub && user.sub.length) ? cfgReqs_(ss, config || {}, user) : [],
    sheetUrl: ss.getUrl(),
  });
}

/* ---------- ข้อมูลตารางที่ส่งให้หน้าเว็บ: รุ่นของตาราง · แถวที่เปลี่ยน · แบบย่อ (API 61) ---------- */
// รุ่นของแต่ละตาราง (Script property tableVer) เปลี่ยนทุกครั้งที่บันทึกตารางนั้น (tableSheet_ ระหว่างล็อก · เก็บตอนปล่อยล็อก)
// หน้าเว็บที่มีข้อมูลรุ่นเดียวกันอยู่แล้วไม่ต้องอ่านและส่งซ้ำ (รีเฟรชทุก 1 นาทีเบาลงมาก) · หน้าเว็บขอทั้งหมดใหม่ทุก 1 ชั่วโมง และตอนเปิดหน้าเว็บ (กันแก้ในชีตโดยตรง)
const TABLE_VER_PROP = 'tableVer';
const DELTA_TABLES = ['cases', 'logs', 'dq', 'reg'];   // ตารางใหญ่: ส่งเฉพาะแถวที่แก้ (คอลัมน์ rev)
const DELTA_MAX = 500;                    // แถวที่แก้เกินนี้ = ส่งทั้งตาราง
const DELTA_MARGIN_MS = 5 * 60000;        // ส่งแถวที่แก้ก่อนครั้งก่อนเผื่อไว้ (บันทึกที่ค้างระหว่างอ่าน)
// ข้อมูลที่ส่ง → ตารางที่ใช้ · windowed = ช่วงวันที่ขึ้นกับวันนี้ (วันใหม่ = รุ่นใหม่)
const OUT_TABLES = { cases: ['cases'], logs: ['logs'], leaves: ['leaves'], duty: ['duty'], ctsim: ['ctsim'], appt: ['appt'], reg: ['reg'], bq: ['bq', 'cases'], jobs: ['jobs'], vac: ['vac'], spq: ['spq'], dq: ['dq'], dqLeave: ['dqLeave'], dqDuty: ['dqDuty'] };
const OUT_WINDOWED = ['duty', 'ctsim', 'appt', 'bq', 'jobs'];
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
// fresh = อ่านค่าล่าสุดจริง (ระหว่างล็อก ก่อนเขียน)
function tableVers_(fresh) { try { return JSON.parse((fresh ? PropertiesService.getScriptProperties().getProperty(TABLE_VER_PROP) : propRead_(TABLE_VER_PROP)) || '{}') || {}; } catch (e) { return {}; } }
function saveDirty_() {
  if (!DIRTY_) return;
  const d = DIRTY_;
  DIRTY_ = null;
  try {
    const v = tableVers_(true), stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    Object.keys(d).forEach(t => { v[t] = stamp; });
    propSave_(TABLE_VER_PROP, JSON.stringify(v));
  } catch (e) { /* เก็บรุ่นไม่ได้: หน้าเว็บได้ข้อมูลใหม่ตอนขอทั้งหมดรอบถัดไป */ }
}
// แถวเป็นอาร์เรย์ตามคอลัมน์ (ไม่ซ้ำชื่อคีย์ทุกแถว · ตัดช่องว่างท้ายแถว) { c: คีย์, r: แถว }
function pack_(rows) {
  const keys = {}, c = [];
  rows.forEach(o => { Object.keys(o).forEach(k => { if (!keys[k]) { keys[k] = 1; c.push(k); } }); });
  return { c: c, r: rows.map(o => { const r = c.map(k => (o[k] == null ? '' : o[k])); while (r.length && r[r.length - 1] === '') r.pop(); return r; }) };
}
const idsHash_ = ids => strHash_(ids.slice().sort().join('|'));
function tablesFor_(ss, config, user, need, have) {
  const vers = tableVers_();
  let init = false;
  Object.keys(OUT_TABLES).forEach(k => OUT_TABLES[k].forEach(t => { if (!vers[t]) { vers[t] = 'i' + Date.now().toString(36); init = true; } }));
  if (init) { try { propSave_(TABLE_VER_PROP, JSON.stringify(vers)); } catch (e) { /* ครั้งหน้า */ } }
  // ห้องฉายของนัดใส่แร่ (rtRoom) มาจาก Cases: หน้าเว็บที่ได้ Cases คำนวณเอง (API 61) · ไม่ได้ Cases = เซิร์ฟเวอร์ใส่ให้ (รุ่นของ bq ขึ้นกับ Cases ด้วย)
  const bqRoom = !(have && need.cases), deps = k => (k === 'bq' && !bqRoom ? ['bq'] : OUT_TABLES[k]);
  const td = today_(ss), verOf = k => deps(k).map(t => vers[t]).join('.') + (OUT_WINDOWED.indexOf(k) >= 0 ? '@' + td : '');
  const hv = have && have.v && typeof have.v === 'object' ? have.v : {}, ht = have && have.t && typeof have.t === 'object' ? have.t : {}, pk = !!(have && have.pack);
  const out = { ver: {}, now: new Date().toISOString(), same: [], delta: {}, advanceCleared: 0 };
  let cases = null;
  const read = {
    cases: () => (cases = readTable_(ss, 'cases', config)), logs: () => readTable_(ss, 'logs'), leaves: () => readTable_(ss, 'leaves'), duty: () => recentDuty_(ss), ctsim: () => recentCt_(ss),
    appt: () => recentAppt_(ss), reg: () => regRows_(ss), bq: () => recentBq_(ss, config, cases, !bqRoom), jobs: () => jobsFor_(ss, user, config), vac: () => readTable_(ss, 'vac'), spq: () => readTable_(ss, 'spq'),
    dq: () => readTable_(ss, 'dq'), dqLeave: () => readTable_(ss, 'dqLeave'), dqDuty: () => readTable_(ss, 'dqDuty'),
  };
  const want = { cases: need.cases, logs: need.logs, leaves: need.leaves, duty: need.duty, ctsim: need.ctsim, appt: need.appt, reg: need.reg, bq: need.bq, jobs: need.jobs, vac: need.vac, spq: need.appt || need.ctsim || need.cases, dq: need.dq, dqLeave: need.dqLeave, dqDuty: need.dqLeave };
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
    const rows = read[k]();
    if (k === 'cases') out.advanceCleared += clearAdvance_(ss, config, rows);
    out[k] = pk ? pack_(rows) : rows;
  });
  return out;
}
// แถวที่แก้หลังเวลา since: อ่านคอลัมน์ id และ rev ก่อน แล้วอ่านเฉพาะแถวที่เปลี่ยน (เป็นช่วงต่อกัน) · ค่าตรวจรหัสทั้งตาราง (หน้าเว็บเทียบ: ไม่ตรง = มีแถวถูกลบ)
// ยังไม่มีคอลัมน์ rev / แก้เกิน DELTA_MAX แถว = null (ส่งทั้งตาราง)
function readDelta_(ss, table, cfg, since) {
  const def = tableDef_(table, cfg), sh = ss.getSheetByName(def.sheet);
  if (!sh) return null;
  const n = sh.getLastRow() - 1;
  if (n < 1) return { rows: [], hash: idsHash_([]), n: 0 };
  const header = headerOf_(sh), rc = header.indexOf(REV_HEAD), cv = rowConv_(def, header, ss.getSpreadsheetTimeZone());
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
const NAV_LIKE = { reg: 'appt', bq: 'appt', appt: 'ctsim', jobs: 'course', dq: 'reg' };   // แถบใหม่ที่การตั้งค่าเดิมยังไม่มี: ลงทะเบียน นัดคิวใส่แร่ = สิทธิ์เท่าแถบลงนัด · ลงนัด = เท่าแถบ CT-SIM · RTT/RA Jobs = เท่าแถบห้องฉาย
// แถบลงนัดใช้เคสและรายการ CT-SIM นับจำนวนในปฏิทิน (วันนัด CT · Start RT) · ตารางวันฉาย (ห้องฉาย) แสดงนัดที่ยังไม่ลง CT-SIM
// แถบ RTT/RA Jobs ใช้เคส รายการ CT-SIM และผู้ปฏิบัติงานประจำวันคำนวณงานห้องฉาย/CT · ภาระงาน (jobs) ส่งเฉพาะของตัวเอง (แอดมินได้ทุกคน) · นัด (ลงนัด) = Vac-Lok ที่จองไว้
// แถบลงทะเบียนแสดงนัดของผู้ป่วย · แถบลงนัดและนัดคิวใส่แร่ดึงข้อมูลผู้ป่วยที่ลงทะเบียน · ตารางวันฉาย (ห้องฉาย) ใช้วันนัดใส่แร่เป็นสถานะ HDR อัตโนมัติ · แดชบอร์ดสรุป Brachytherapy จากนัดใส่แร่
const GUEST_TABLES = { cases: ['work', 'pend', 'queue', 'course', 'dash', 'p4p', 'appt', 'jobs'], logs: ['work', 'pend', 'logs', 'p4p'], leaves: ['work', 'queue'], duty: ['course', 'ctsim', 'jobs'],
  ctsim: ['ctsim', 'work', 'appt', 'jobs'], appt: ['appt', 'ctsim', 'course', 'reg', 'jobs', 'dq'], jobs: ['jobs'], reg: ['reg', 'appt', 'bq', 'dq'], bq: ['bq', 'course', 'dash'], vac: ['jobs', 'ctsim'],
  dq: ['dq', 'appt'], dqLeave: ['dq'] };   // แจกงานแพทย์: แถบลงนัดแสดงผู้ป่วยที่รอลงนัดแยกตามแพทย์
function guestNeeds_(user, config) {
  const out = {};
  const seen = Object.keys(GUEST_TABLES).reduce((a, t) => a.concat(GUEST_TABLES[t]), []).filter(v => user.via === 'google' || navAccess_(config, v, navRole_(user)));
  Object.keys(GUEST_TABLES).forEach(t => { out[t] = GUEST_TABLES[t].some(v => seen.indexOf(v) >= 0); });
  return out;
}

/**
 * สิทธิ์ของตำแหน่ง (role ใน LPCH) ต่อแถบ: 'edit' = บันทึก/แก้ไขได้ · 'view' = ดูอย่างเดียว · '' = มองไม่เห็น
 * ตั้งที่ ตั้งค่า → แถบเมนู (config.nav[i].access[role]) · ตำแหน่งที่ยังไม่ได้ตั้ง: MP บันทึกได้ทุกแถบที่ "แสดง"
 * ตำแหน่งอื่นดูได้ถ้าติ๊ก "ตำแหน่งอื่น" (แบบเดิม) · แถบใหม่ที่การตั้งค่าเดิมยังไม่มี ทำตามแถบก่อนหน้า (NAV_PREV) หรือแถบที่ระบุ (NAV_LIKE) เหมือนหน้าเว็บ
 */
function navAccess_(config, view, role) {
  const nav = config && Array.isArray(config.nav) ? config.nav : [];
  const find = v => nav.filter(x => x && x.view === v)[0];
  let x = find(view);
  if (!x && NAV_LIKE[view]) return navAccess_(config, NAV_LIKE[view], role);
  if (!x) { let p = null; for (let v = view; !p && NAV_PREV[v]; v = NAV_PREV[v]) p = find(NAV_PREV[v]); x = { on: true, guest: p ? p.guest !== false : true }; }
  const acc = x.access && typeof x.access === 'object' ? x.access : null;
  if (acc && Object.prototype.hasOwnProperty.call(acc, role)) return acc[role] === 'edit' || acc[role] === 'view' ? acc[role] : '';
  if (role === ADMIN_ROLE) return navAccess_(config, view, 'MP');   // ยังไม่ได้ตั้งคอลัมน์ Admin = เท่า MP
  if (x.on === false) return '';
  return LPCH_EDIT_ROLES.indexOf(role) >= 0 ? 'edit' : x.guest !== false ? 'view' : '';
}
// แถบที่ใช้แต่ละตาราง (สิทธิ์บันทึก = บันทึกได้อย่างน้อยหนึ่งแถบในนี้)
const EDIT_VIEWS = { cases: ['work', 'pend', 'queue'], logs: ['logs', 'work', 'pend'], leaves: ['work', 'queue'], course: ['course'], ctsim: ['ctsim'], appt: ['appt'], jobs: ['jobs'], reg: ['reg'], bq: ['bq'], vac: ['jobs', 'ctsim'], dq: ['dq'] };

// ตารางที่เขียนผ่านฟังก์ชันของตัวเองเท่านั้น (ตรวจ PIN และสถานะการลง/แจก) ไม่ผ่าน saveRecord / deleteRecord
const OWN_WRITERS = ['ctsim', 'duty', 'appt', 'jobs', 'reg', 'bq', 'vac', 'spq', 'regArch', 'dq', 'dqLeave', 'dqDuty'];
function saveRecord(table, rec, token) {
  if (OWN_WRITERS.indexOf(table) >= 0) throw new Error('ตาราง ' + table + ' บันทึกผ่านแถบของตัวเองเท่านั้น');
  requireEdit_(token, EDIT_VIEWS[table]);
  tableDef_(table);
  if (!rec || !rec.id) throw new Error('ไม่มีรหัสรายการ');
  return withLock_(() => {
    const ss = ss_();
    const cfg = table === 'cases' ? readConfig_(ss) : null;   // หัวข้อเพิ่มเติมที่แอดมินตั้ง เป็นคอลัมน์ของ Cases
    const sh = tableSheet_(ss, table, cfg);
    const header = headerOf_(sh);
    const found = findRow_(sh, header.indexOf('id') + 1, rec.id);
    let fields = tableDef_(table, cfg).fields;
    // เคสที่มีอยู่แล้ว: ช่องของปุ่มบันทึกขั้นตอนเติมได้เฉพาะช่องที่ยังว่าง ไม่เขียนทับหรือลบ (คนอื่นอาจเพิ่งกด)
    // แก้หรือล้างได้ทาง stampCase เท่านั้น
    if (found && table === 'cases') {
      const cur = sh.getRange(found, 1, 1, header.length).getValues()[0];
      fields = fields.filter(f => {
        if (STAMP_FIELDS.indexOf(f[0]) < 0) return true;
        const col = header.indexOf(f[1]);
        return (col < 0 || String(cur[col] == null ? '' : cur[col]).trim() === '') && String(rec[f[0]] == null ? '' : rec[f[0]]).trim() !== '';
      });
    }
    // หน้าเว็บรุ่นเก่าไม่ส่งช่อง src: ไม่ล้างที่มาของรายการที่ดึงจากระบบนัด
    if (table === 'logs' && rec.src === undefined) fields = fields.filter(f => f[0] !== 'src');
    writeFields_(sh, found || sh.getLastRow() + 1, header, fields, rec);
    return rec;
  });
}

/**
 * แจกเคสใหม่ภายใต้ล็อก ผู้ใช้หลายคนกดพร้อมกันก็ไม่ได้คนซ้ำ
 * รับได้หลายเคส (หลายเทคนิคของผู้ป่วยคนเดียว) เคสแรกเลือก MP ตามคิวของเทคนิคนั้น
 * how = 'follow' ให้ MP คนเดียวกับเคสแรก (คิวไม่ขยับ หักคิวเมื่อวนมาถึง) · how = 'manual' ใช้ MP ที่เลือกมา
 */
function addCases(recs, token) {
  const u = requireEdit_(token, ['work']);
  if (!Array.isArray(recs) || !recs.length) throw new Error('ไม่มีเคสที่จะแจก');
  return withLock_(() => {
    const ss = ss_();
    const cfg = readConfig_(ss) || {};
    const staff = Array.isArray(cfg.staff) && cfg.staff.length ? cfg.staff : DEFAULT_STAFF.map(code => ({ code: code, active: true }));
    const leaves = readTable_(ss, 'leaves');
    const cases = readTable_(ss, 'cases');
    const today = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    const out = [];
    recs.forEach(rec => {
      if (!rec || !rec.cat) throw new Error('เลือกเทคนิคก่อนแจกเคส');
      const cat = (cfg.cats || []).filter(c => c.id === rec.cat)[0];
      const byDay = cat ? cat.rotate === 'day' || cat.rotate === false : DAY_ROTATE_CATS.indexOf(rec.cat) >= 0;
      const date = rec.in || today;
      if (rec.how === 'manual') {
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
    out.forEach(rec => writeFields_(sh, sh.getLastRow() + 1, header, fields, rec));
    // แจกจากรายการของแถบ CT-SIM (ctFrom = id ของรายการนั้น): บันทึกว่าแจกแล้วเป็นเคสไหน ใครแจก
    const ctFrom = String((recs[0] && recs[0].ctFrom) || '').trim();
    if (ctFrom) {
      const cs = tableSheet_(ss, 'ctsim'), ch = headerOf_(cs), row = findRow_(cs, ch.indexOf('id') + 1, ctFrom);
      const set = { took: out.map(r => r.id).join(', '), tookBy: String(u.name || u.username || u.me || ''), tookAt: Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm') };
      if (row) writeFields_(cs, row, ch, TABLES.ctsim.fields.filter(f => f[0] in set), set);
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
    const sh = tableSheet_(ss_(), table);
    const row = findRow_(sh, headerOf_(sh).indexOf('id') + 1, id);
    if (row) sh.deleteRow(row);
    return !!row;
  });
}

// หน้าแก้ไขเคส: บันทึกหรือลบต้องยืนยันด้วยรหัส PIN ของคนที่เข้าสู่ระบบ (เหมือนปุ่มบันทึกขั้นตอน)
function editCase(rec, pin, token) {
  pinChange_(requireEdit_(token, EDIT_VIEWS.cases), pin, rowExists_('cases', rec && rec.id));
  return saveRecord('cases', rec, token);
}

function removeCase(id, pin, token) {
  pinChange_(requireEdit_(token, EDIT_VIEWS.cases), pin, true);
  return deleteRecord('cases', id, token);
}

// หน้าแก้ไขกิจกรรม (RC งานวิชาการ ฯลฯ): บันทึกการแก้ไขหรือลบต้องยืนยันด้วยรหัส PIN เหมือนหน้าแก้ไขเคส
function editLog(rec, pin, token) {
  pinChange_(requireEdit_(token, EDIT_VIEWS.logs), pin, rowExists_('logs', rec && rec.id));
  return saveRecord('logs', rec, token);
}

function removeLog(id, pin, token) {
  pinChange_(requireEdit_(token, EDIT_VIEWS.logs), pin, true);
  return deleteRecord('logs', id, token);
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
    writeConfig_(ss_(), config || {});
    try { CacheService.getScriptCache().remove('appName'); } catch (e) { /* แคชใช้ไม่ได้: ชื่อแท็บเปลี่ยนภายใน 6 ชั่วโมง */ }
    return true;
  });
}

/* ---------- แอดมินรอง: แก้การตั้งค่าบางหมวด ทุกการแก้เป็นคำขอ มีผลเมื่อแอดมินหลักอนุมัติ ---------- */
// หมวดในหน้าตั้งค่า → คีย์ของ Config (ตรงกับ CFG_TABS ในหน้าเว็บ) · คีย์ที่ไม่อยู่ในหมวดใด (admins, subAdmins ฯลฯ) = แอดมินหลักเท่านั้น
const CFG_TABS = {
  team: ['staff', 'doctors', 'crew'],
  case: ['queue', 'skips', 'manualFrom', 'rate', 'p4pGroup', 'cats', 'types', 'aims', 'techniques', 'freqs', 'areas', 'rooms', 'fields', 'required', 'defaults', 'icdExtra', 'qa', 'qaSee', 'caseView'],
  p4p: ['positions', 'guarantee', 'acts', 'carry', 'brachySync', 'tdfSync'],
  room: ['ptags', 'mobility', 'igrt', 'qColors', 'queues', 'fxTypes', 'moveReplan', 'cpTreat', 'fxSeen', 'fxAdj', 'fxgHead', 'fxgParts', 'quota', 'dayMax', 'dutyRoles', 'ptForm'],
  tabs: ['reg', 'dq', 'appt', 'order', 'bq', 'ct', 'jobs', 'vac'],
  sys: ['pin', 'holidays', 'appName', 'appSub', 'logo', 'nav', 'roles', 'boxes'],
};
const CFG_REQ_MAX = 49000;   // ตัวอักษรต่อช่อง (ชีตรับได้ 50,000)
const CFG_REQ_DAYS = 30;     // คำขอที่ตัดสินแล้วแสดงย้อนหลัง

// หมวดที่แอดมินรองคนนี้แก้ได้ (config.subAdmins [{ user: ชื่อผู้ใช้หรืออีเมล RO Workspace, tabs }])
function subTabs_(cfg, p) {
  const list = cfg && Array.isArray(cfg.subAdmins) ? cfg.subAdmins : [];
  const me = [String(p.username || '').toLowerCase(), String(p.email || '').toLowerCase()].filter(Boolean);
  const x = list.filter(s => s && me.indexOf(String(s.user || '').trim().toLowerCase()) >= 0)[0];
  return x && Array.isArray(x.tabs) ? x.tabs.map(String).filter((t, i, a) => CFG_TABS[t] && a.indexOf(t) === i) : [];
}
function cfgTabOf_(key) {
  for (const t in CFG_TABS) if (CFG_TABS[t].indexOf(key) >= 0) return t;
  return '';
}
// คีย์ที่แก้นอกหมวดที่ได้รับสิทธิ์ · renames (แก้ชื่อตัวเลือก) ดูทีละรายการตามหมวดของรายการนั้น
function cfgReqBad_(cfg, changes, tabs) {
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
  if (!tabs.length) throw new Error('แก้การตั้งค่าได้เฉพาะแอดมิน' + (u.name ? ' (' + u.name + ' ไม่ใช่แอดมินหรือแอดมินรอง)' : ''));
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
  const tz = ss.getSpreadsheetTimeZone();
  const found = parseLegacy_(name => {
    const sh = ss.getSheetByName(name);
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
    old.map(c => findRow_(sh, idCol, c.id)).filter(r => r > 0).sort((a, b) => b - a).forEach(r => sh.deleteRow(r));
    return old.length;
  });
}

/* ---------- ปุ่มบันทึกขั้นตอนของเคส (Finish, Evaluate, Dose check, F0, Delta4, SRS MapCheck, Plan complete) ---------- */

const STEP_NAMES = { fin: 'Finish', eval: 'Evaluate', mu: 'Dose check', d0: 'F0', d4: 'Delta4', mc: 'SRS MapCheck', pc: 'Plan complete' };
const STEP_VALUES = ['mu', 'd0', 'd4', 'mc'];   // ต้องกรอกค่า
const STAMP_FIELDS = ['fin', 'finBy', 'eval', 'evalBy', 'mu', 'muBy', 'muVal', 'd0', 'd0By', 'd0Val', 'd4', 'd4By', 'd4Val', 'mc', 'mcBy', 'mcVal', 'pc', 'pcBy', 'muNote', 'd0Note', 'd4Note', 'mcNote',
  'rt', 'rtDate', 'rtAt', 'rtBy', 'rtNote', 'fxlog', 'ptags', 'rmove', 'bsteps', 'mqt', 'fxadd', 'replan'];
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
  const parsed = stampVals_(steps), keys = parsed.keys, vals = parsed.vals, notes = parsed.notes, c0 = caseOf_(id);
  pinChange_(u, pin, !c0 || keys.some(k => vals[k] === null || has_(c0[k])));
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss);
    const sh = tableSheet_(ss, 'cases', cfg), header = headerOf_(sh);
    const row = findRow_(sh, header.indexOf('id') + 1, id);
    if (!row) throw new Error('ไม่พบเคสนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const now = stampTime_(at, ss.getSpreadsheetTimeZone());
    const name = String(u.name || u.username || u.me || '');
    const finCol = header.indexOf('Finish') + 1;
    const set = {};
    keys.forEach(step => {
      const clear = vals[step] === null, at = clear ? '' : now, by = clear ? '' : name;
      set[step] = at;
      set[step + 'By'] = by;
      if (STEP_VALUES.indexOf(step) >= 0) set[step + 'Val'] = clear ? '' : vals[step];
      if (STEP_VALUES.indexOf(step) >= 0 && (clear || step in notes)) set[step + 'Note'] = clear ? '' : notes[step];
      if (step === 'eval' && !clear && finCol > 0 && !String(sh.getRange(row, finCol).getValue()).trim()) { set.fin = at; set.finBy = by; }
    });
    writeFields_(sh, row, header, TABLES.cases.fields.filter(f => f[0] in set), set);
    return readTable_(ss, 'cases', cfg).filter(c => c.id === id)[0];
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
  const c0 = caseOf_(id);
  let b0 = {};
  try { b0 = (JSON.parse(String((c0 && c0.bsteps) || '{}')) || {})[sid] || {}; } catch (e) { b0 = {}; }
  pinChange_(u, pin, !c0 || keys.some(k => vals[k] === null || has_(b0[k])));
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss);
    const sh = tableSheet_(ss, 'cases', cfg), header = headerOf_(sh);
    const row = findRow_(sh, header.indexOf('id') + 1, id);
    if (!row) throw new Error('ไม่พบเคสนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const col = header.indexOf('ขั้นตอนของ boost');
    let all = {};
    try { all = col < 0 ? {} : JSON.parse(String(sh.getRange(row, col + 1).getValue() || '{}')); } catch (e) { all = {}; }
    if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
    const cur = all[sid] && typeof all[sid] === 'object' ? all[sid] : {};
    const now = stampTime_(at, ss.getSpreadsheetTimeZone()), name = String(u.name || u.username || u.me || '');
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
    const set = { bsteps: Object.keys(all).length ? JSON.stringify(all) : '' };
    writeFields_(sh, row, header, TABLES.cases.fields.filter(f => f[0] in set), set);
    return readTable_(ss, 'cases', cfg).filter(c => c.id === id)[0];
  });
}

// วันนี้ตามเขตเวลาของชีต (yyyy-MM-dd)
function today_(ss) { return Utilities.formatDate(new Date(), (ss || ss_()).getSpreadsheetTimeZone(), 'yyyy-MM-dd'); }
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
  const c0 = caseOf_(id);
  pinChange_(u, pin, !status || !c0 || has_(c0.rt));
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss);
    const sh = tableSheet_(ss, 'cases', cfg), header = headerOf_(sh);
    const row = findRow_(sh, header.indexOf('id') + 1, id);
    if (!row) throw new Error('ไม่พบเคสนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const now = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
    const set = status
      ? { rt: status, rtDate: date, rtAt: now, rtBy: String(u.name || u.username || u.me || ''), rtNote: note }
      : { rt: '', rtDate: '', rtAt: '', rtBy: '', rtNote: '' };
    writeFields_(sh, row, header, TABLES.cases.fields.filter(f => f[0] in set), set);
    return readTable_(ss, 'cases', cfg).filter(c => c.id === id)[0];
  });
}

/**
 * แถบ Complete: สถานะของ fraction รายวัน ยืนยันด้วยรหัส PIN · หนึ่งรายการต่อวันต่อเคส (บันทึกวันเดิมซ้ำ = แทนที่)
 * ev = { type, label, act, back, reason, note } · act: skip = ไม่ได้ฉายตั้งแต่วันนั้นถึงก่อนวันกลับมาฉาย (back ว่าง = จนกว่าจะกลับมา) fraction เลื่อนออกไป
 * treat = ฉายตามปกติ บันทึกไว้เฉย ๆ · given = ฉายแล้ว (บันทึกล่วงหน้าไม่ได้) · off = Off RT หยุดฉายตั้งแต่วันนั้น (มีได้รายการเดียว)
 * ev = null ล้างรายการของวันนั้น · คืนเคสหลังบันทึก
 */
const FX_ACTS = ['skip', 'treat', 'off', 'given'];
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
    if (lane && rec.act !== 'given') throw new Error('บันทึกแยกบริเวณได้เฉพาะ ฉายแล้ว (สถานะอื่นใช้กับทุกบริเวณ)');
    if (lane) rec.lane = lane;
    if (!rec.type || !rec.label) throw new Error('เลือกสถานะ');
    if (FX_ACTS.indexOf(rec.act) < 0) throw new Error('สถานะนี้ไม่ถูกต้อง');
    if (rec.act !== 'skip') rec.back = '';
    if (rec.back && (!isDate(rec.back) || rec.back <= date)) throw new Error('วันกลับมาฉายต้องหลังวันที่ ' + date);
  }
  const same = x => x && String(x.date).slice(0, 10) === date && (!lane || String(x.lane || '') === lane);
  pinChange_(u, pin, !ev || jsonList_((caseOf_(id) || {}).fxlog).some(same));
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss);
    if (rec && FX_NOW_ACTS.indexOf(rec.act) >= 0 && date > today_(ss)) throw new Error('ยังไม่ถึงวันที่ ' + date + ' บันทึก' + (rec.act === 'given' ? 'ฉายแล้ว' : ' ' + rec.label + ' ') + 'ล่วงหน้าไม่ได้');
    const sh = tableSheet_(ss, 'cases', cfg), header = headerOf_(sh);
    const row = findRow_(sh, header.indexOf('id') + 1, id);
    if (!row) throw new Error('ไม่พบเคสนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const col = header.indexOf('สถานะ fraction');
    let list = [];
    try { list = col < 0 ? [] : JSON.parse(String(sh.getRange(row, col + 1).getValue() || '[]')); } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    list = list.filter(x => x && !same(x));   // ทั้งผู้ป่วย = ทุกรายการของวันนั้น (รวมแถวย่อย) · แถวย่อย = เฉพาะแถวนั้น
    if (rec) {
      const inside = list.filter(x => !x.lane && x.act === 'skip' && x.date < date && (!x.back || date < x.back))[0];
      if (inside) throw new Error('วันที่ ' + date + ' อยู่ในช่วง ' + inside.label + ' ตั้งแต่ ' + inside.date + ' แก้ที่รายการนั้นแทน');
      if (rec.act === 'off') list = list.filter(x => x.act !== 'off');
      rec.by = String(u.name || u.username || u.me || '');
      rec.at = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
      list.push(rec);
    }
    list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const set = { fxlog: list.length ? JSON.stringify(list) : '' };
    writeFields_(sh, row, header, TABLES.cases.fields.filter(f => f[0] in set), set);
    return readTable_(ss, 'cases', cfg).filter(c => c.id === id)[0];
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
  pinChange_(u, pin, !mv || jsonList_((caseOf_(id) || {}).rmove).some(x => x && String(x.date).slice(0, 10) === date));
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss);
    const sh = tableSheet_(ss, 'cases', cfg), header = headerOf_(sh);
    const row = findRow_(sh, header.indexOf('id') + 1, id);
    if (!row) throw new Error('ไม่พบเคสนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const col = header.indexOf('ย้ายห้อง');
    let list = [];
    try { list = col < 0 ? [] : JSON.parse(String(sh.getRange(row, col + 1).getValue() || '[]')); } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    list = list.filter(x => x && x.date !== date);
    if (rec) {
      rec.by = String(u.name || u.username || u.me || '');
      rec.at = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
      list.push(rec);
    }
    list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const set = { rmove: list.length ? JSON.stringify(list) : '' };
    writeFields_(sh, row, header, TABLES.cases.fields.filter(f => f[0] in set), set);
    return readTable_(ss, 'cases', cfg).filter(c => c.id === id)[0];
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
  pinChange_(u, pin, has_((caseOf_(id) || {}).ptags));
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss);
    const sh = tableSheet_(ss, 'cases', cfg), header = headerOf_(sh);
    const row = findRow_(sh, header.indexOf('id') + 1, id);
    if (!row) throw new Error('ไม่พบเคสนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const set = { ptags: text };
    writeFields_(sh, row, header, TABLES.cases.fields.filter(f => f[0] in set), set);
    return readTable_(ss, 'cases', cfg).filter(c => c.id === id)[0];
  });
}

/**
 * งานวางแผนใหม่ให้ MP คนเดิม (บันทึก Re-CT, ย้ายห้อง ฯลฯ ในตารางวันฉาย) ยืนยันด้วยรหัส PIN
 * เคสใหม่คัดลอกข้อมูลผู้ป่วยและเทคนิคจากเคสเดิม · prescription = fraction ที่เหลือ (หน้าเว็บคำนวณ) · In = วันนี้ · ขั้นตอนเริ่มใหม่ทั้งหมด
 * หนึ่งงานต่อเคสเดิมต่อวัน (บันทึกซ้ำ = แก้สาเหตุ วันเริ่มฉาย ห้อง) · rp = null: ลบงานของวันนั้นถ้ายังไม่เริ่ม (ยังไม่มีขั้นตอนที่บันทึก)
 * rp = { kind, label, reason, room, sim, ct, dpf, fx, area, sites: [...], mp } · mp ว่าง = MP ของเคสเดิม (บันทึกซ้ำ = คนที่รับงานอยู่) · ระบุ = ส่งให้คนนั้น
 */
function replanCase(id, date, rp, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.course);
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
    const rows = readTable_(ss, 'cases', cfg), parent = rows.filter(c => c.id === id)[0];
    if (!parent) throw new Error('ไม่พบเคสนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    if (rec && rec.mp) {
      const staff = Array.isArray(cfg && cfg.staff) && cfg.staff.length ? cfg.staff : DEFAULT_STAFF.map(code => ({ code: code }));
      if (!staff.some(x => String(x.code).toUpperCase() === rec.mp)) throw new Error('ไม่พบรหัสนักฟิสิกส์ ' + rec.mp);
    }
    const metaOf = c => { try { const m = JSON.parse(c.replan || 'null'); return m && typeof m === 'object' ? m : null; } catch (e) { return null; } };
    const old = rows.filter(c => { const m = metaOf(c); return m && m.of === id && m.date === date; })[0];
    if (!rec) {
      if (!old) return { id: '', removed: false };
      if (['fin', 'eval', 'mu', 'd0', 'd4', 'mc', 'pc'].some(k => String(old[k] || ''))) return { id: old.id, removed: false, started: true };
      const row = findRow_(sh, header.indexOf('id') + 1, old.id);
      if (row) sh.deleteRow(row);
      return { id: old.id, removed: true };
    }
    const meta = JSON.stringify({ of: id, date: date, kind: rec.kind, label: rec.label, reason: rec.reason });
    if (old) {   // แก้: สาเหตุ วันเริ่มฉาย ห้อง (prescription และขั้นตอนที่ MP ทำไปแล้วคงไว้)
      const set = { replan: meta, sim: rec.sim, room: rec.room || old.room };
      if (rec.mp) set.mp = rec.mp;
      writeFields_(sh, findRow_(sh, header.indexOf('id') + 1, old.id), header, fields.filter(f => f[0] in set), set);
      return readTable_(ss, 'cases', cfg).filter(c => c.id === old.id)[0];
    }
    const out = {};
    fields.forEach(f => { out[f[0]] = parent[f[0]]; });
    STAMP_FIELDS.forEach(k => { out[k] = ''; });
    Object.assign(out, {
      id: Utilities.getUuid(), how: 'replan', batch: '', note: '', replan: meta, mp: rec.mp || parent.mp,
      in: Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd'), created: new Date().toISOString(), updated: '',
      sim: rec.sim, ct: rec.ct || parent.ct, room: rec.room || parent.room, dpf: rec.dpf || parent.dpf, fx: rec.fx, rx: '', area: rec.area || parent.area, sites: rec.sites,
    });
    writeFields_(sh, sh.getLastRow() + 1, header, fields, out);
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
  pinChange_(u, pin, !add || jsonList_((caseOf_(id) || {}).fxadd).some(x => x && String(x.date).slice(0, 10) === date));
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss);
    const sh = tableSheet_(ss, 'cases', cfg), header = headerOf_(sh);
    const row = findRow_(sh, header.indexOf('id') + 1, id);
    if (!row) throw new Error('ไม่พบเคสนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const col = header.indexOf('เพิ่ม fraction');
    let list = [];
    try { list = col < 0 ? [] : JSON.parse(String(sh.getRange(row, col + 1).getValue() || '[]')); } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    list = list.filter(x => x && x.date !== date);
    if (rec) {
      rec.by = String(u.name || u.username || u.me || '');
      rec.at = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
      list.push(rec);
    }
    list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const set = { fxadd: list.length ? JSON.stringify(list) : '' };
    writeFields_(sh, row, header, TABLES.cases.fields.filter(f => f[0] in set), set);
    return readTable_(ss, 'cases', cfg).filter(c => c.id === id)[0];
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
  pinChange_(u, pin, has_((caseOf_(id) || {}).mqt));
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss);
    const sh = tableSheet_(ss, 'cases', cfg), header = headerOf_(sh);
    const row = findRow_(sh, header.indexOf('id') + 1, id);
    if (!row) throw new Error('ไม่พบเคสนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const set = { mqt: text };
    writeFields_(sh, row, header, TABLES.cases.fields.filter(f => f[0] in set), set);
    return readTable_(ss, 'cases', cfg).filter(c => c.id === id)[0];
  });
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
  pinChange_(u, pin, rowExists_('cases', rec.id));
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss);
    const sh = tableSheet_(ss, 'cases', cfg), header = headerOf_(sh), fields = tableDef_('cases', cfg).fields;
    const id = cut(rec.id, 80), row = id ? findRow_(sh, header.indexOf('id') + 1, id) : 0;
    const planned = !!row && String(sh.getRange(row, header.indexOf('วิธีแจก') + 1).getValue()).trim() !== 'direct';
    const set = {};
    DIRECT_FIELDS.concat(fields.map(f => f[0]).filter(k => /^x_/.test(k))).forEach(k => { set[k] = cut(rec[k], k === 'sites' ? 5000 : k === 'dx' || k === 'note' ? 2000 : 200); });
    if (planned) delete set.cat;   // เคสที่แจกงาน: หมวดเป็นส่วนของ MP (แต้มและคิว)
    set.sim = sim;
    const now = new Date().toISOString();
    if (row) set.updated = now;
    else Object.assign(set, { id: id || Utilities.getUuid(), how: 'direct', mp: '', in: Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd'), created: now, updated: '' });
    writeFields_(sh, row || sh.getLastRow() + 1, header, fields.filter(f => f[0] in set), set);
    const want = row ? id : set.id;
    return readTable_(ss, 'cases', cfg).filter(c => c.id === want)[0];
  });
}

// ลบผู้ป่วยที่เพิ่มในแถบห้องฉาย (เฉพาะ how = 'direct') ยืนยันด้วยรหัส PIN · คืน true เมื่อลบแล้ว
function courseRemove(id, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.course);
  pinChange_(u, pin, true);
  return withLock_(() => {
    const ss = ss_(), sh = tableSheet_(ss, 'cases', readConfig_(ss)), header = headerOf_(sh);
    const row = findRow_(sh, header.indexOf('id') + 1, id);
    if (!row) return false;
    if (String(sh.getRange(row, header.indexOf('วิธีแจก') + 1).getValue()).trim() !== 'direct') throw new Error('ลบได้เฉพาะผู้ป่วยที่เพิ่มในแถบห้องฉาย');
    sh.deleteRow(row);
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
  pinChange_(u, pin, readTable_(ss_(), 'duty').some(x => String(x.date) === date && recs.some(r => r.room === x.room)));
  return withLock_(() => {
    const ss = ss_(), sh = tableSheet_(ss, 'duty'), header = headerOf_(sh), idCol = header.indexOf('id') + 1;
    const at = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm'), by = String(u.name || u.username || u.me || '');
    recs.forEach(r => {
      const id = date + '|' + r.room, row = findRow_(sh, idCol, id);
      if (!r.rtt.length && !r.ra.length && !r.qc.length) { if (row) sh.deleteRow(row); return; }
      writeFields_(sh, row || sh.getLastRow() + 1, header, TABLES.duty.fields, { id: id, date: date, room: r.room, rtt: r.rtt.join(', '), ra: r.ra.join(', '), qc: r.qc.join(', '), by: by, at: at });
    });
    return readTable_(ss, 'duty').filter(x => x.date === date);
  });
}

// ผู้ปฏิบัติงานที่ส่งให้หน้าเว็บ: ตั้งแต่ 1 ปีก่อน (ตารางย้อนหลังเกินนั้นไม่ค่อยได้ดู)
function recentDuty_(ss) {
  const from = Utilities.formatDate(new Date(Date.now() - 366 * 864e5), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
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
  pinChange_(u, pin, rowExists_('ctsim', rec.id));
  return withLock_(() => {
    const ss = ss_(), sh = tableSheet_(ss, 'ctsim'), header = headerOf_(sh);
    const id = cut(rec.id, 80), row = id ? findRow_(sh, header.indexOf('id') + 1, id) : 0;
    const set = {};
    CT_FIELDS.forEach(k => { set[k] = cut(rec[k], k === 'extra' ? 4000 : k === 'note' || k === 'dx' ? 2000 : 200); });
    set.send = set.send ? 'yes' : '';
    const now = new Date().toISOString();
    if (row) set.updated = now;
    else Object.assign(set, { id: id || Utilities.getUuid(), by: String(u.name || u.username || u.me || ''), created: now, updated: '' });
    writeFields_(sh, row || sh.getLastRow() + 1, header, TABLES.ctsim.fields.filter(f => f[0] in set), set);
    const want = row ? id : set.id;
    // ลงจากนัดในแถบลงนัด (apptFrom = id ของนัด เฉพาะรายการใหม่): บันทึกว่านัดนี้ลง CT-SIM แล้ว ใครลง
    const from = row ? '' : cut(rec.apptFrom, 80);
    if (from) {
      const as = tableSheet_(ss, 'appt'), ah = headerOf_(as), ar = findRow_(as, ah.indexOf('id') + 1, from);
      const mark = { took: set.id, tookBy: set.by, tookAt: Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm') };
      if (ar) writeFields_(as, ar, ah, TABLES.appt.fields.filter(f => f[0] in mark), mark);
    }
    const out = readTable_(ss, 'ctsim').filter(x => x.id === want)[0];
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
    const ss = ss_(), sh = tableSheet_(ss, 'ctsim'), row = findRow_(sh, headerOf_(sh).indexOf('id') + 1, id);
    if (row) sh.deleteRow(row);
    if (row && id) vacUnlink_(ss, id);
    if (row && id) {
      const as = ss.getSheetByName(TABLES.appt.sheet);
      if (as) markDirty_('appt');
      if (as) {
        const ah = headerOf_(as), clear = { took: '', tookBy: '', tookAt: '' };
        readTable_(ss, 'appt').filter(a => a.took === id).forEach(a => {
          const ar = findRow_(as, ah.indexOf('id') + 1, a.id);
          if (ar) writeFields_(as, ar, ah, TABLES.appt.fields.filter(f => f[0] in clear), clear);
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
    const ss = ss_(), sh = tableSheet_(ss, 'ctsim'), header = headerOf_(sh), row = findRow_(sh, header.indexOf('id') + 1, id);
    if (!row) throw new Error('ไม่พบรายการนี้ใน CT-SIM (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const took = String(sh.getRange(row, header.indexOf('แจกเคสแล้ว (id)') + 1).getValue() || '').trim();
    const gone = !mark && took && took !== 'skip' && (() => { const ids = readTable_(ss, 'cases').map(c => c.id); return took.split(',').every(x => ids.indexOf(x.trim()) < 0); })();
    if (mark ? took : took !== 'skip' && !gone) throw new Error(took === 'skip' ? 'รายการนี้ตั้งไม่ต้องแจกไว้แล้ว' : took ? 'รายการนี้แจกเคสไปแล้ว' : 'รายการนี้ยังรอแจกเคสอยู่');
    const set = mark ? { took: 'skip', tookBy: String(u.name || u.username || u.me || ''), tookAt: Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm') } : { took: '', tookBy: '', tookAt: '' };
    writeFields_(sh, row, header, TABLES.ctsim.fields.filter(f => f[0] in set), set);
    return readTable_(ss, 'ctsim').filter(x => x.id === id)[0];
  });
}

// รายการ CT-SIM ที่ส่งให้หน้าเว็บ: ตั้งแต่ 13 เดือนก่อน (ส่งออก Excel รายเดือนย้อนหลังได้ 1 ปี)
function recentCt_(ss) {
  const from = Utilities.formatDate(new Date(Date.now() - 400 * 864e5), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  return readTable_(ss, 'ctsim').filter(x => String(x.date) >= from);
}

/**
 * แถบนัดคิวใส่แร่: ลงนัดหนึ่งคอร์ส (หลาย Fraction · หนึ่งแถวต่อหนึ่ง Fx) ยืนยันด้วยรหัส PIN (ตั้งค่า → รหัส PIN: นัดคิวใส่แร่)
 * p = { hn, name, doc, tech, note, rtt, dates: [วันที่ของ Fx 1, 2, …] } · ต้องมี HN ชื่อ-สกุล รูปแบบการใส่ · 1–30 Fx · คืนนัดทั้งคอร์ส
 * จำนวนเคสต่อวันและ HN ซ้ำวันเดียวกัน หน้าเว็บเตือนก่อนลงนัด (ลงต่อได้เหมือนระบบนัดคิวใส่แร่เดิม)
 */
const BQ_BOOKED = 'นัดแล้ว';
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
// ลงชื่อ MP / RC ได้เฉพาะผู้ใช้ตำแหน่ง MP (ตำแหน่งใน LPCH RO Workspace) · บัญชี Google (ไม่ได้เชื่อม LPCH / เปิดจากชีต) ไม่มีตำแหน่ง = ได้
// ลงชื่อ MP / RC ได้: บัญชี Google ของเจ้าของชีต หรือผู้ใช้ตำแหน่ง MP / RTT ใน LPCH (API 50: RTT บันทึกแทนได้)
function bqCanSign_(u) {
  const r = String((u && u.role) || '').toUpperCase();
  return !!u && (u.via === 'google' || r === 'MP' || r === 'RTT');
}
// เขียนหลายแถวต่อท้ายชีตในครั้งเดียว (ข้อความล้วน)
function bqAppend_(sh, header, recs) {
  if (!recs.length) return;
  const cols = header.map(h => TABLES.bq.fields.filter(f => f[1] === h)[0]);
  sh.getRange(sh.getLastRow() + 1, 1, recs.length, header.length).setNumberFormat('@')
    .setValues(recs.map(rec => cols.map(f => (f ? safeText_(rec[f[0]]) : ''))));
}
function bqCreate(p, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.bq);
  p = p && typeof p === 'object' ? p : {};
  const hn = bqCut_(p.hn, 40), name = bqCut_(p.name, 200), tech = bqCut_(p.tech, 100);
  const dates = (Array.isArray(p.dates) ? p.dates : []).map(d => bqCut_(d, 10));
  if (!hn) throw new Error('กรอก HN');
  if (!name) throw new Error('กรอกชื่อ-สกุลผู้ป่วย');
  if (!tech) throw new Error('เลือกรูปแบบการใส่');
  if (!dates.length || dates.length > 30) throw new Error('จำนวน Fraction ต้องอยู่ระหว่าง 1–30');
  if (dates.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d))) throw new Error('วันนัดไม่ถูกต้อง');

  const course = 'BT' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  withLock_(() => {
    const ss = ss_(), sh = tableSheet_(ss, 'bq'), now = new Date().toISOString(), sorted = dates.slice().sort();
    bqAppend_(sh, headerOf_(sh), sorted.map((d, i) => ({ id: Utilities.getUuid(), course: course, date: d, hn: hn, name: name, doc: bqCut_(p.doc, 200), tech: tech,
      fx: String(i + 1), total: String(sorted.length), note: bqCut_(p.note, 2000), status: BQ_BOOKED, rtt: bqCut_(p.rtt, 100), mp: '', rc: '', hist: '', src: '', by: bqWho_(u), created: now, editedBy: '', updated: '' })));
  });
  bqStats_();
  return readTable_(ss_(), 'bq').filter(x => x.course === course);
}

// แก้นัดหนึ่ง Fx: วันที่ แพทย์ รูปแบบการใส่ หมายเหตุ สถานะ (นัดแล้ว / มาตามนัด / ยกเลิก) RTT MP RC (RTT ลงได้ทุกคนที่บันทึกแถบนี้ได้) · เก็บประวัติ (ใคร เมื่อไร อะไรเปลี่ยน) · คืนนัดหลังแก้
function bqEdit(id, ch, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.bq);
  ch = ch && typeof ch === 'object' ? ch : {};
  const set = {};
  BQ_EDIT.forEach(k => { if (k in ch) set[k] = bqCut_(ch[k], k === 'note' ? 2000 : 200); });
  if ('date' in set && !/^\d{4}-\d{2}-\d{2}$/.test(set.date)) throw new Error('วันที่นัดไม่ถูกต้อง');
  if ('status' in set && [BQ_BOOKED, BRACHY_ST_DONE, BQ_NOSHOW, BRACHY_ST_CANCEL].indexOf(set.status) < 0) throw new Error('สถานะไม่ถูกต้อง');
  if ('tech' in set && !set.tech) throw new Error('เลือกรูปแบบการใส่');
  if ('us' in set && ['', 'US'].indexOf(set.us) < 0) throw new Error('Ultrasound ไม่ถูกต้อง');
  const cfg = readConfig_(ss_()) || {};
  const cur0 = readTable_(ss_(), 'bq').filter(x => x.id === id)[0] || {};
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
  const rec = withLock_(() => {
    const ss = ss_(), sh = tableSheet_(ss, 'bq'), header = headerOf_(sh), row = findRow_(sh, header.indexOf('id') + 1, id);
    if (!row) throw new Error('ไม่พบนัดนี้ (อาจถูกเปลี่ยนไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const cur = readTable_(ss, 'bq').filter(x => x.id === id)[0];
    const diff = Object.keys(set).filter(k => String(cur[k] || '') !== set[k]);
    if (!diff.length) return cur;
    if ((diff.indexOf('mp') >= 0 || diff.indexOf('rc') >= 0) && !bqCanSign_(u, cfg)) throw new Error('ลงชื่อ MP / RC ได้เฉพาะผู้ใช้ตำแหน่ง MP หรือ RTT');
    const mp = 'mp' in set ? set.mp : cur.mp, rc = 'rc' in set ? set.rc : cur.rc;
    if (rc && rc === mp) throw new Error('RC ต้องไม่ใช่คนเดียวกับ MP');
    const out = { updated: new Date().toISOString(), editedBy: bqWho_(u), hist: bqHist_(cur.hist, u, diff.map(k => ({ f: k, from: String(cur[k] || ''), to: set[k] }))) };
    diff.forEach(k => { out[k] = set[k]; });
    writeFields_(sh, row, header, TABLES.bq.fields.filter(f => f[0] in out), out);
    return readTable_(ss, 'bq').filter(x => x.id === id)[0];
  });
  bqStats_();
  return rec;
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
  if (k !== 'rtt' && !bqCanSign_(u, cfg)) throw new Error('ลงชื่อ MP / RC ได้เฉพาะผู้ใช้ตำแหน่ง MP หรือ RTT');
  const all0 = readTable_(ss_(), 'bq');
  pinChange_(u, pin, ids.some(id => { const x = all0.filter(r => r.id === id)[0]; return x && has_(x[k]) && String(x[k]) !== v; }));
  const out = withLock_(() => {
    const ss = ss_(), sh = tableSheet_(ss, 'bq'), header = headerOf_(sh), all = readTable_(ss, 'bq'), recs = [];
    ids.forEach(id => {
      const cur = all.filter(x => x.id === id)[0];
      if (!cur || cur.status === BRACHY_ST_CANCEL || cur.status === BQ_NOSHOW) return;
      if (v && ((k === 'rc' && cur.mp === v) || (k === 'mp' && cur.rc === v))) return;
      if (String(cur[k] || '') === v) { recs.push(cur); return; }
      const row = findRow_(sh, header.indexOf('id') + 1, id);
      if (!row) return;
      const set = { updated: new Date().toISOString(), editedBy: bqWho_(u), hist: bqHist_(cur.hist, u, [{ f: k, from: String(cur[k] || ''), to: v }]) };
      set[k] = v;
      writeFields_(sh, row, header, TABLES.bq.fields.filter(f => f[0] in set), set);
      recs.push(Object.assign({}, cur, set));
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
  list.push({ at: Utilities.formatDate(new Date(), ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm'), by: bqWho_(u), ch: ch });
  return JSON.stringify(list.slice(-40));
}
// ยกเลิกนัด: scope 'course' = ทุก Fx ที่ยังนัดอยู่ของคอร์สนี้ · อื่น ๆ = เฉพาะ Fx นี้ · คืน { changed, ids }
function bqCancel(id, scope, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.bq);
  pinChange_(u, pin, true);
  const res = withLock_(() => {
    const ss = ss_(), sh = tableSheet_(ss, 'bq'), header = headerOf_(sh), all = readTable_(ss, 'bq'), tg = all.filter(x => x.id === id)[0];
    if (!tg) throw new Error('ไม่พบนัดนี้ (อาจถูกเปลี่ยนไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const pick = scope === 'course' ? all.filter(x => x.course && x.course === tg.course && x.status === BQ_BOOKED) : [tg].filter(x => x.status !== BRACHY_ST_CANCEL);
    const now = new Date().toISOString(), ids = [];
    pick.forEach(x => {
      const row = findRow_(sh, header.indexOf('id') + 1, x.id);
      if (!row) return;
      const out = { status: BRACHY_ST_CANCEL, updated: now, editedBy: bqWho_(u), hist: bqHist_(x.hist, u, [{ f: 'status', from: x.status, to: BRACHY_ST_CANCEL }]) };
      writeFields_(sh, row, header, TABLES.bq.fields.filter(f => f[0] in out), out);
      ids.push(x.id);
    });
    return { changed: ids.length, ids: ids };
  });
  bqStats_();
  return res;
}
// นัดที่ส่งให้หน้าเว็บ: ตั้งแต่ 13 เดือนก่อน (รวมนัดล่วงหน้าทั้งหมด)
function recentBq_(ss, cfg, cases, noRoom) {
  const from = Utilities.formatDate(new Date(Date.now() - 400 * 864e5), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
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
  const sh = book.getSheetByName(tab.name), tz = book.getSpreadsheetTimeZone(), last = sh.getLastRow();
  const values = last > 1 ? sh.getRange(1, 1, last, sh.getLastColumn()).getValues() : [];
  const header = (values.shift() || []).map(v => String(v).trim()), at = k => (map[k] ? header.indexOf(map[k]) : -1);
  const docKey = v => String(v || '').replace(/^(นพ\.|พญ\.|นาย|นางสาว|นาง|ดร\.)/, '').replace(/\s+/g, '').toLowerCase();
  const docs = (Array.isArray(cfg.doctors) ? cfg.doctors : []).filter(x => x && x.code);
  const docOf = v => { const t = String(v || '').trim(), hit = t && docs.filter(x => String(x.code).toUpperCase() === t.toUpperCase() || (x.name && docKey(x.name) === docKey(t)))[0]; return hit ? String(hit.code).toUpperCase() : t; };
  const staffOf = brachyStaff_(cfg), unknownDoc = {}, unknownStaff = {};
  const stOf = v => (/ยกเลิก|cancel/i.test(v) ? BRACHY_ST_CANCEL : /ไม่มา|no.?show/i.test(v) ? BQ_NOSHOW : /มาตามนัด|มาแล้ว|done|complete/i.test(v) ? BRACHY_ST_DONE : BQ_BOOKED);
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
  pinChange_(u, pin, rowExists_('vac', rec.id));
  return withLock_(() => {
    const ss = ss_(), sh = tableSheet_(ss, 'vac'), header = headerOf_(sh);
    const id = cut(rec.id, 80), row = id ? findRow_(sh, header.indexOf('id') + 1, id) : 0;
    const set = {};
    VAC_FIELDS.forEach(k => { set[k] = cut(rec[k], k === 'note' ? 1000 : k === 'name' ? 200 : 80); });
    if (row) set.updated = vacNow_();
    else Object.assign(set, { id: id || Utilities.getUuid(), src: 'manual', by: String(u.name || u.username || u.me || ''), created: vacNow_(), updated: '' });
    writeFields_(sh, row || sh.getLastRow() + 1, header, TABLES.vac.fields.filter(f => f[0] in set), set);
    const want = row ? id : set.id;
    return readTable_(ss, 'vac').filter(x => x.id === want)[0];
  });
}
function vacRemove(id, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.vac);
  pinChange_(u, pin, true);
  return withLock_(() => {
    const sh = tableSheet_(ss_(), 'vac'), row = findRow_(sh, headerOf_(sh).indexOf('id') + 1, id);
    if (row) sh.deleteRow(row);
    return !!row;
  });
}
// ฟอร์ม CT-SIM เลือก Vac-Lok (เรียกใน lock ของ ctSave): แถวที่ผูกกับรายการนี้ หรือแถวที่นำเข้า (เลขและ HN เดียวกัน ยังไม่ผูก) · ไม่มี = เพิ่มใหม่
function vacLink_(ss, ct, no, u) {
  const sh = tableSheet_(ss, 'vac'), header = headerOf_(sh), rows = readTable_(ss, 'vac'), idCol = header.indexOf('id') + 1;
  const cur = rows.filter(x => x.ctId === ct.id)[0];
  if (!no) { if (cur) { const r = findRow_(sh, idCol, cur.id); if (r) sh.deleteRow(r); } return; }
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
  const sh = ss.getSheetByName(TABLES.vac.sheet);
  if (!sh) return;
  markDirty_('vac');
  const header = headerOf_(sh), idCol = header.indexOf('id') + 1;
  readTable_(ss, 'vac').filter(x => x.ctId === ctId).forEach(x => {
    const r = findRow_(sh, idCol, x.id);
    if (!r) return;
    if (x.src === 'ctsim') sh.deleteRow(r);
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
  const book = extBook_(s, 'Vac-Lok'), tz = book.getSpreadsheetTimeZone(), rooms = Array.isArray(cfg.rooms) ? cfg.rooms : [];
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
const regName_ = r => (r.title + (/[A-Za-z]/.test(r.title) ? ' ' : '') + r.name).trim();
// ผู้ป่วยที่ลงทะเบียน · แถวที่บันทึกด้วยรุ่น 2026-10-30.1 (คอลัมน์ ชื่อ และ สกุล) ใช้สองคอลัมน์นั้นเป็นชื่อ-สกุล
function regRows_(ss) { return regFixNames_(ss, readTable_(ss, 'reg')); }
// ชื่อว่าง (ชีตรุ่นเก่าที่แยกชื่อ/สกุล) = ต่อจากคอลัมน์ชื่อ สกุล
function regFixNames_(ss, rows) {
  const sh = ss.getSheetByName(TABLES.reg.sheet);
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
    const sh = head('hn') ? ss.getSheetByName(def.sheet) : null;
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
function regDriveTidy_(ss, cfg, seen) {
  const sh = ss.getSheetByName(TABLES.reg.sheet), out = { removed: 0, docs: 0, gone: [] };
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
  return withLock_(() => {
    let st = load();
    if (!due(st)) return out(st);   // อีกคนเพิ่งดึงระหว่างรอล็อก
    // เปลี่ยนโฟลเดอร์ คอลัมน์ หรือตัวกรอง = อ่านทุกไฟล์ใหม่ (แถวที่เคยไม่ตรงตัวกรองอาจตรงแล้ว)
    const now = new Date().toISOString(), sig = JSON.stringify([d.url, d.map || {}, d.filter || {}]), all = force || st.sig !== sig, seen = all ? {} : st.files || {};
    try {
      const files = regDriveFiles_(regDriveFolder_(d.url)), seenHn = hnSeen_(ss), tidy = regDriveTidy_(ss, cfg, seenHn), have = {}, add = [], errs = [];
      if (!files.length) errs.push('ไม่พบไฟล์ .xlsx / .xls / .csv / Google ชีต ในโฟลเดอร์' + (files.others.length ? ' (มีแต่ไฟล์ที่อ่านไม่ได้: ' + files.others.slice(0, 5).join(', ') + ')' : ''));
      else if (files.others.length) errs.push('ไฟล์ชนิดที่อ่านไม่ได้ (ข้าม): ' + files.others.slice(0, 5).join(', ') + (files.others.length > 5 ? ' …' : '') + ' · บันทึกเป็น .xlsx หรือ Google ชีต');
      Object.keys(seenHn).forEach(k => { have[k] = seenHn[k].t; });
      const arch = regArchHns_(ss), back = {};   // HN ในที่เก็บถาวร (ยังไม่อยู่ในแถบลงทะเบียน) = ย้ายกลับ
      tidy.gone.forEach(k => { have[k] = 'other'; });   // เพิ่งลบออกจากแถบลงทะเบียน: ยังมีในแถบอื่น
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
        got.recs.forEach(r => {
          const k = hnLoose_(r.hn);
          if (have[k] && have[k] !== 'reg' && have[k] !== 'drive' && arch[k]) { back[k] = 1; have[k] = 'reg'; return; }
          if (have[k]) { skipped++; if (have[k] !== 'reg' && have[k] !== 'drive') inSys++; return; }   // HN มีในระบบแล้ว (inSys = ในแถบอื่น ยังไม่ได้ลงทะเบียน)
          have[k] = 'drive';
          add.push(Object.assign(r, { id: Utilities.getUuid(), by: ('Google Drive · ' + f.getName()).slice(0, 120), created: now, updated: '' }));
        });
        seen[id] = mod;
      });
      if (add.length) appendNew_(ss, 'reg', add);
      const restored = Object.keys(back).length ? regMoveBack_(ss, r => back[hnLoose_(r.hn)]).length : 0;
      const keep = {};   // จำเฉพาะไฟล์ที่ยังอยู่ในโฟลเดอร์ (ล่าสุด 100 ไฟล์ · Script property เก็บได้ราว 9 KB)
      files.slice(0, 100).forEach(f => { if (seen[f.getId()]) keep[f.getId()] = seen[f.getId()]; });
      st = { at: now, by: by, added: add.length, skipped: skipped, inSys: inSys, removed: tidy.removed, docFix: tidy.docs, filtered: filtered, read: read, rows: rows, restored: restored, nFiles: files.length, files: keep, sig: sig, err: errs.join(' · ').slice(0, 400) };
    } catch (e) {
      st = { at: now, by: by, added: 0, skipped: 0, filtered: 0, read: 0, nFiles: 0, files: st.files || {}, sig: st.sig, err: String(e.message || e).slice(0, 400) };
    }
    propSave_(REG_DRIVE_PROP, JSON.stringify(st));
    return out(st);
  });
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
  const sh = ss.getSheetByName(TABLES.regArch.sheet);
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
  const v = sh.getRange(row, 1, 1, header.length).getValues()[0], r = rowConv_(TABLES.reg, header, ss.getSpreadsheetTimeZone()).conv(v);
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
function regArchStatus_() { try { return JSON.parse(propRead_(REG_ARCH_PROP) || 'null'); } catch (e) { return null; } }
// HN → วันล่าสุดที่มีรายการในแถบอื่น (yyyy-MM-dd · วันที่ของรายการ / Start RT / วันทำ CT / Created)
function hnLatest_(ss) {
  const out = {}, skip = ['reg', 'regArch', 'spq'];
  Object.keys(TABLES).filter(t => skip.indexOf(t) < 0).forEach(t => {
    const def = TABLES[t], head = k => (def.fields.filter(x => x[0] === k)[0] || [])[1];
    if (!head('hn')) return;
    const sh = ss.getSheetByName(def.sheet);
    if (!sh || sh.getLastRow() < 2) return;
    const hdr = headerOf_(sh), n = sh.getLastRow() - 1, tz = ss.getSpreadsheetTimeZone();
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
function regArchHns_(ss) { const sh = ss.getSheetByName(TABLES.regArch.sheet), o = {}; if (!sh || sh.getLastRow() < 2) return o; const c = headerOf_(sh).indexOf('HN'); if (c < 0) return o; sh.getRange(2, c + 1, sh.getLastRow() - 1, 1).getValues().forEach(r => { const k = hnLoose_(r[0]); if (k) o[k] = true; }); return o; }
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
  const src = ss.getSheetByName(TABLES[from].sheet), tz = ss.getSpreadsheetTimeZone();
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
  if (!force) {   // เปิดหน้าเว็บ: ไม่รอคนที่กำลังบันทึก
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(500)) return last;
    lock.releaseLock();
  }
  try {
    withLock_(() => {
      const sh = ss.getSheetByName(TABLES.reg.sheet);
      if (sh && sh.getLastRow() > 1) {
        const tz = ss.getSpreadsheetTimeZone(), latest = hnLatest_(ss);
        const cutY = years ? Utilities.formatDate(new Date(Date.now() - years * 365.25 * 864e5), tz, 'yyyy-MM-dd') : '';
        const cutM = months ? Utilities.formatDate(new Date(Date.now() - months * 30.44 * 864e5), tz, 'yyyy-MM-dd') : '';
        res.moved = regMoveRows_(ss, 'reg', 'regArch', r => {
          const at = [String(r.created).slice(0, 10), String(r.updated).slice(0, 10)].filter(v => /^\d{4}-\d{2}-\d{2}$/.test(v)).sort().pop();   // ลงทะเบียน / แก้ / ย้ายกลับ ล่าสุด
          const k = hnLoose_(r.hn), used = !!(k && latest[k]);
          if (!at || !String(r.name).trim()) return false;   // ชื่อว่าง (ชีตรุ่นเก่าที่แยกชื่อ/สกุล) ไม่ย้าย
          if (cutY && at < cutY && !(used && latest[k] >= cutY)) return true;
          if (cutM && at < cutM && !used && String(r.by).indexOf('Google Drive') === 0) { res.drive++; return true; }   // ดึงจาก Drive แล้วไม่เคยใช้
          return false;
        }, { 'ย้ายเข้าที่เก็บเมื่อ': res.at }).length;
      }
      const ah = ss.getSheetByName(TABLES.regArch.sheet);
      res.total = ah ? Math.max(0, ah.getLastRow() - 1) : 0;
    });
  } catch (e) { res.error = String(e.message || e).slice(0, 200); }
  try { propSave_(REG_ARCH_PROP, JSON.stringify(res)); } catch (e) { /* ครั้งหน้า */ }
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
    const ss = ss_(), ah = ss.getSheetByName(TABLES.regArch.sheet);
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
    if (row) sh.deleteRow(row);
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
  const u = requireEdit_(token, EDIT_VIEWS.appt);
  rec = rec && typeof rec === 'object' ? rec : {};
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
  pinChange_(u, pin, rowExists_('appt', rec.id));
  return withLock_(() => {
    const ss = ss_(), sh = tableSheet_(ss, 'appt'), header = headerOf_(sh);
    const id = cut(rec.id, 80), row = id ? findRow_(sh, header.indexOf('id') + 1, id) : 0;
    const set = {};
    APPT_FIELDS.forEach(k => { set[k] = cut(rec[k], k === 'order' ? 20000 : k === 'note' || k === 'dx' ? 2000 : 200); });
    const now = new Date().toISOString();
    if (row) set.updated = now;
    else Object.assign(set, { id: id || Utilities.getUuid(), by: String(u.name || u.username || u.me || ''), created: now, updated: '' });
    writeFields_(sh, row || sh.getLastRow() + 1, header, TABLES.appt.fields.filter(f => f[0] in set), set);
    const want = row ? id : set.id;
    return readTable_(ss, 'appt').filter(x => x.id === want)[0];
  });
}

// ลบนัดในแถบลงนัด ยืนยันด้วยรหัส PIN (รายการ CT-SIM ที่ลงจากนัดนี้แล้วไม่ถูกลบ) · คืน true เมื่อลบแล้ว
function apptRemove(id, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.appt);
  pinChange_(u, pin, true);
  return withLock_(() => {
    const sh = tableSheet_(ss_(), 'appt'), row = findRow_(sh, headerOf_(sh).indexOf('id') + 1, id);
    if (row) sh.deleteRow(row);
    return !!row;
  });
}

// แถบ CT-SIM (หรือลงนัด): นัดที่ผู้ป่วยไม่มาทำ CT · mark = 'skip' (เฉพาะที่ยังรอลง CT-SIM) หรือ '' (คืนกลับเป็นรอ) · คืนรายการ
function apptMark(id, mark, token) {
  const u = requireEdit_(token, EDIT_VIEWS.ctsim.concat(EDIT_VIEWS.appt));
  mark = mark === 'skip' ? 'skip' : '';
  return withLock_(() => {
    const ss = ss_(), sh = tableSheet_(ss, 'appt'), header = headerOf_(sh), row = findRow_(sh, header.indexOf('id') + 1, id);
    if (!row) throw new Error('ไม่พบนัดนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const took = String(sh.getRange(row, header.indexOf('ลง CT-SIM แล้ว (id)') + 1).getValue() || '').trim();
    if (mark ? took : took !== 'skip') throw new Error(took === 'skip' ? 'นัดนี้ตั้งว่าไม่มาทำ CT ไว้แล้ว' : took ? 'นัดนี้ลง CT-SIM ไปแล้ว' : 'นัดนี้ยังรอลง CT-SIM อยู่');
    const set = mark ? { took: 'skip', tookBy: String(u.name || u.username || u.me || ''), tookAt: Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm') } : { took: '', tookBy: '', tookAt: '' };
    writeFields_(sh, row, header, TABLES.appt.fields.filter(f => f[0] in set), set);
    return readTable_(ss, 'appt').filter(x => x.id === id)[0];
  });
}

// นัดที่ส่งให้หน้าเว็บ: วันนัด CT ตั้งแต่ 13 เดือนก่อน (รวมนัดล่วงหน้าทั้งหมด)
function recentAppt_(ss) {
  const from = Utilities.formatDate(new Date(Date.now() - 400 * 864e5), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
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
const dqNow_ = () => new Date().toISOString();

/**
 * แจกงานแพทย์ภายใต้ล็อก (ผู้ใช้หลายคนกดพร้อมกันก็ไม่ได้คนซ้ำ) · recs = [{ id?, hn, name, how: auto | manual, doc (เลือกเอง), note }]
 * auto = แพทย์ตามคิว (dqPick_) วันที่แจก = วันนี้ · คืนรายการที่บันทึก
 */
function dqAdd(recs, token) {
  const u = requireEdit_(token, EDIT_VIEWS.dq);
  if (!Array.isArray(recs) || !recs.length) throw new Error('ไม่มีผู้ป่วยที่จะแจก');
  if (recs.length > 50) throw new Error('แจกได้ครั้งละไม่เกิน 50 คน');
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss) || {}, q = dqCfg_(cfg), all = dqDocs_(cfg), day = today_(ss);
    const rows = readTable_(ss, 'dq'), leaves = readTable_(ss, 'dqLeave'), by = String(u.name || u.username || u.me || ''), t0 = Date.now(), out = [];
    let duty = null;
    recs.forEach((r, i) => {
      r = r && typeof r === 'object' ? r : {};
      const hn = dqCut_(r.hn, 40), how = r.how === 'manual' || r.how === 'emer' ? r.how : 'auto';
      if (!hn) throw new Error('กรอก HN');
      let doc = how === 'auto' ? '' : dqCut_(r.doc, 10).toUpperCase();
      if (how === 'emer' && !doc) { doc = dqS1_(q, duty || (duty = readTable_(ss, 'dqDuty')), day); if (!doc) throw new Error('ยังไม่ได้กำหนดแพทย์เวร S1 ของวันนี้ (ปุ่ม เวร S1 ในแถบ) · หรือเลือกแพทย์เอง'); }
      if (how !== 'auto' && all.indexOf(doc) < 0) throw new Error('ไม่พบรหัสแพทย์ ' + doc);
      if (how === 'auto') doc = dqPick_({ docs: q.docs, leaves: leaves, rows: rows, skips: q.skips, pointer: q.pointer, payback: q.payback, days: q.days, bonus: q.bonus, date: day });
      if (!doc) throw new Error(q.docs.length ? 'ไม่มีแพทย์ที่รับเคสได้วันนี้ (ลาหรือวันที่ไม่แจกทุกคน)' : 'ยังไม่มีแพทย์ในคิว (ตั้งค่า → แจกงานแพทย์)');
      const rec = { id: dqCut_(r.id, 80) || Utilities.getUuid(), hn: hn, name: dqCut_(r.name, 200), doc: doc, how: how, date: day, st: '', note: dqCut_(r.note, 500), by: by, created: new Date(t0 + i).toISOString(), updated: '' };
      rows.push(rec);
      out.push(rec);
    });
    appendNew_(ss, 'dq', out);
    return out;
  });
}
// แก้รายการ (PIN): HN ชื่อ Note · st = skip (ไม่ต้องลงนัด) | '' (รอลงนัด) · เปลี่ยนแพทย์ = เลือกเอง (คิวเดิมยังเป็นของคนที่ถึงคิว คนใหม่ถูกข้ามเมื่อคิววนมาถึง)
function dqEdit(id, ch, pin, token) {
  const u = requireEdit_(token, EDIT_VIEWS.dq);
  ch = ch && typeof ch === 'object' ? ch : {};
  pinChange_(u, pin, true);
  return withLock_(() => {
    const ss = ss_(), cfg = readConfig_(ss) || {}, sh = tableSheet_(ss, 'dq'), header = headerOf_(sh), row = findRow_(sh, header.indexOf('id') + 1, id);
    if (!row) throw new Error('ไม่พบรายการนี้ (อาจถูกลบไปแล้ว) โหลดหน้าใหม่แล้วลองอีกครั้ง');
    const cur = rowConv_(TABLES.dq, header, ss.getSpreadsheetTimeZone()).conv(sh.getRange(row, 1, 1, header.length).getValues()[0]), set = {};
    if ('hn' in ch) { set.hn = dqCut_(ch.hn, 40); if (!set.hn) throw new Error('กรอก HN'); }
    if ('name' in ch) set.name = dqCut_(ch.name, 200);
    if ('note' in ch) set.note = dqCut_(ch.note, 500);
    if ('st' in ch) set.st = ch.st === 'skip' ? 'skip' : '';
    if ('doc' in ch) {
      const d = dqCut_(ch.doc, 10).toUpperCase();
      if (dqDocs_(cfg).indexOf(d) < 0) throw new Error('ไม่พบรหัสแพทย์ ' + d);
      if (d !== cur.doc) { set.doc = d; if (cur.how !== 'import') set.how = 'manual'; }   // ดึงจากรายงาน: ยังไม่นับในคิว
    }
    set.updated = dqNow_();
    writeFields_(sh, row, header, TABLES.dq.fields.filter(f => f[0] in set), set);
    return Object.assign(cur, set);
  });
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
    const tz = ss.getSpreadsheetTimeZone(), cv = rowConv_(TABLES.dq, header, tz), n = sh.getLastRow() - 1;
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
      if (!doc) { if (row) sh.deleteRow(row); return; }
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
    if (row) sh.deleteRow(row);
    return !!row;
  });
}
// วันลาแพทย์: ผู้ที่บันทึกในแถบแจกงานแพทย์ได้ (ทุกแพทย์) หรือแพทย์ของตัวเอง (บัญชีที่เชื่อมใน ตั้งค่า → แพทย์ และเห็นแถบนี้)
function dqLeaveUser_(token, doc) {
  const ss = ss_(), cfg = readConfig_(ss) || {}, u = who_(token, ss, cfg);
  if (u.via === 'google' || navAccess_(cfg, 'dq', navRole_(u)) === 'edit') return u;
  if (doc && navAccess_(cfg, 'dq', navRole_(u)) && dqSelf_(u, cfg) === doc) return u;
  throw new Error('ลงวันลาแพทย์ได้เฉพาะผู้ที่บันทึกในแถบแจกงานแพทย์ได้ หรือแพทย์ลงของตัวเอง (บัญชีที่เชื่อมใน ตั้งค่า → แพทย์)');
}
function dqLeaveSave(rec, token) {
  rec = rec && typeof rec === 'object' ? rec : {};
  const doc = dqCut_(rec.doc, 10).toUpperCase(), from = dqCut_(rec.from, 10), to = dqCut_(rec.to, 10) || from, isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const u = dqLeaveUser_(token, doc);
  if (!isDate(from) || !isDate(to)) throw new Error('วันที่ลาไม่ถูกต้อง');
  if (to < from) throw new Error('วันสิ้นสุดต้องไม่ก่อนวันเริ่มลา');
  return withLock_(() => {
    const ss = ss_();
    if (dqDocs_(readConfig_(ss) || {}).indexOf(doc) < 0) throw new Error('ไม่พบรหัสแพทย์ ' + doc);
    const r = { id: dqCut_(rec.id, 80) || Utilities.getUuid(), doc: doc, from: from, to: to, note: dqCut_(rec.note, 300), by: String(u.name || u.username || u.me || ''), created: dqNow_(), updated: '' };
    appendNew_(ss, 'dqLeave', [r]);
    return r;
  });
}
function dqLeaveRemove(id, pin, token) {
  const cur = readTable_(ss_(), 'dqLeave').filter(x => x.id === String(id))[0];
  if (!cur) return false;
  pinChange_(dqLeaveUser_(token, cur.doc), pin, true);
  return withLock_(() => {
    const sh = tableSheet_(ss_(), 'dqLeave'), row = findRow_(sh, headerOf_(sh).indexOf('id') + 1, id);
    if (row) sh.deleteRow(row);
    return !!row;
  });
}
/*
 * คิวแจกงานแพทย์ (โค้ดชุดเดียวกับ dqPick ใน index.html · ใช้แค่ HN และชื่อ)
 * o = { docs: รหัสแพทย์ตามลำดับคิว, leaves: [{ doc, from, to }], rows: [{ doc, how, date, created }] (แจกแล้ว),
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
  const away = (c, d) => !!d && (offDay(c, d) || (o.leaves || []).some(l => l.doc === c && l.from <= d && d <= (l.to || l.from)));
  const lim = Math.max(0, Math.floor(+o.payback) || 0);
  const copy = s => ({ pos: s.pos, credit: Object.assign({}, s.credit), owe: s.owe.slice(), paid: Object.assign({}, s.paid) });
  // หนึ่งเคสวันที่ d (แก้ s): { code, owner: เจ้าของคิว, kind: own | cover (รับแทนคนลา) | repay (คืนคิว), skipped: ข้ามเพราะหักคิว } · ไม่มีใครรับได้ = null
  const walk = (s, d) => {
    let limit = n;
    Object.keys(s.credit).forEach(k => { limit += n * Math.max(0, s.credit[k] || 0); });
    const skipped = [];
    for (let k = 0; k < limit; k++) {
      const at = s.pos + k, x = docs[at % n], r = Math.floor(at / n);
      if (s.credit[x] > 0) { s.credit[x]--; skipped.push(x); continue; }
      if (away(x, d)) {
        // คนรับแทน: แพทย์ที่ไม่ลาที่ติดค้างน้อยที่สุด (รับแทนอยู่ + รอหักคิว) ถัดจากคนลาตามลำดับ (ไม่ให้คนเดียวรับแทนทั้งหมด)
        let y = '', best = 0;
        for (let j = 1; j < n; j++) {
          const c = docs[(at + j) % n];
          if (away(c, d)) continue;
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
        if (e.by === x && idx(e.to) >= 0 && !away(e.to, d) && (!lim || !pd || pd.r !== r || pd.n < lim)) w = j;
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
    if (c.how === 'import' || c.how === 'emer') { log.push({ row: c, kind: c.how }); return; }   // ดึงจากรายงาน HIS · Emergency (แพทย์เวร S1): ไม่นับในคิว
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
const nameKey_ = v => String(v == null ? '' : v).trim().replace(/^(นางสาว|นาง|นาย|น\.ส\.|ดร\.|นพ\.|พญ\.)/, '').replace(/\s+/g, '').toLowerCase();
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
  pinChange_(u, pin, rowExists_('jobs', nameKey_(who) + '|' + ym));
  return withLock_(() => {
    const ss = ss_(), sh = tableSheet_(ss, 'jobs'), header = headerOf_(sh), id = nameKey_(who) + '|' + ym;
    const row = findRow_(sh, header.indexOf('id') + 1, id);
    const old = row ? readTable_(ss, 'jobs').filter(x => x.id === id)[0] : null;
    const set = { id: id, ym: ym, who: who, user: own ? String(u.username || '') : (old && old.user) || cut(rec.user, 80), kind: kind, prof: prof, cells: cells, leaves: leaves,
      by: String(u.name || u.username || u.me || ''), updated: new Date().toISOString() };
    writeFields_(sh, row || sh.getLastRow() + 1, header, TABLES.jobs.fields, set);
    return readTable_(ss, 'jobs').filter(x => x.id === id)[0];
  });
}
// ภาระงานที่ส่งให้หน้าเว็บ: 13 เดือนล่าสุด · ของตัวเอง (ชื่อตรงกับบัญชี LPCH) · แอดมินและบัญชี Google ได้ทุกคน
function jobsFor_(ss, user, cfg) {
  const d = new Date(Date.now() - 400 * 864e5), from = Utilities.formatDate(d, ss.getSpreadsheetTimeZone(), 'yyyy-MM');
  const all = readTable_(ss, 'jobs').filter(x => String(x.id).split('|')[1] >= from);
  if (user.via === 'google' || user.isAdmin) return all;
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
  const sh = book.getSheetByName(tab.name), tz = book.getSpreadsheetTimeZone();
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
    if (st === BRACHY_ST_CANCEL || st === BQ_NOSHOW || (s.count === 'done' && st !== BRACHY_ST_DONE)) return;   // ยกเลิก / ไม่มา ไม่นับ
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
      drop.forEach(r => sh.deleteRow(r));
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
function brachyTick() {
  const ss = ss_(), cfg = readConfig_(ss) || {};
  Object.keys(EXT).forEach(k => { if (cfg[EXT[k].cfg] && cfg[EXT[k].cfg].on) extSync_(ss, cfg, k, 'ตั้งเวลา'); });
  if (cfg.reg && cfg.reg.drive && cfg.reg.drive.on) regDriveSync_(ss, cfg, false, 'ตั้งเวลา');   // ผู้ป่วยจากโฟลเดอร์ Google Drive (ตามรอบที่ตั้ง)
  if (cfg.appt && cfg.appt.spq && cfg.appt.spq.on && cfg.appt.spq.url) spqSync_(ss, cfg, 'ตั้งเวลา');   // นัดจากระบบนัดคิวเทคนิคพิเศษ
  try { regArchive_(ss, cfg, false); } catch (e) { /* ครั้งหน้า */ }   // ผู้ป่วยเก่า → ที่เก็บถาวร (วันละครั้ง)
}
// ตัวตั้งเวลาเฉพาะการดึงผู้ป่วยจากโฟลเดอร์ Google Drive (ไม่ได้ตั้ง brachyTick ไว้) · Triggers → Add Trigger → regDriveTick → Time-driven
function regDriveTick() {
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
  const sh = book.getSheetByName(tab.name), tz = book.getSpreadsheetTimeZone(), last = sh.getLastRow(), width = sh.getLastColumn();
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
    if (sig !== prev.sig || !ss.getSheetByName(TABLES.spq.sheet)) {
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
  const sh = book.getSheetByName(tab.name), tz = book.getSpreadsheetTimeZone();
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
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(pinKey_(u)) || 'null'); } catch (e) { return null; }
}

// ทุกแถบ ทุกงาน: บันทึกใหม่ไม่ต้องใส่ PIN · แก้ไขหรือลบของที่บันทึกไว้แล้วต้องใส่ PIN ของคนที่เข้าสู่ระบบ (กติกาเดียวกับ pinFresh ในหน้าเว็บ)
// PIN ว่างแต่ต้องใส่ = PINNEED| ให้หน้าเว็บเปิดช่อง PIN · ยังไม่ได้ตั้ง PIN = PIN| (ตั้งรหัสใหม่)
function pinChange_(u, pin, change) {
  if (!change) return;
  if (String(pin == null ? '' : pin) === '' && pinRecord_(u)) throw new Error('PINNEED|การแก้ไขหรือลบต้องใส่รหัส PIN');
  checkPin_(u, pin);
}
const caseOf_ = id => (id ? readTable_(ss_(), 'cases', readConfig_(ss_())).filter(c => c.id === id)[0] || null : null);
// มีรายการ id นี้ไหม: อ่านเฉพาะคอลัมน์ id (เดิมอ่านทั้งตาราง · แถบลงทะเบียน 2 หมื่นแถว = หลายวินาที)
const rowExists_ = (table, id) => {
  if (!id) return false;
  const sh = ss_().getSheetByName(tableDef_(table).sheet);
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
  const cache = CacheService.getScriptCache(), key = 'pintry_' + pinKey_(u);
  const tries = +(cache.get(key) || 0);
  if (tries >= PIN_TRIES) throw new Error('ใส่รหัส PIN ผิด ' + PIN_TRIES + ' ครั้ง รอ 5 นาทีแล้วลองใหม่');
  if (!/^\d{4}$/.test(String(pin == null ? '' : pin)) || pinHash_(rec.s, String(pin)) !== rec.h) {
    cache.put(key, String(tries + 1), PIN_LOCK_SECONDS);
    const left = PIN_TRIES - tries - 1;
    throw new Error('รหัส PIN ไม่ถูกต้อง' + (left > 0 ? ' (ใส่ได้อีก ' + left + ' ครั้ง)' : ' รอ 5 นาทีแล้วลองใหม่'));
  }
  cache.remove(key);
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
  PropertiesService.getScriptProperties().setProperty(pinKey_(u), JSON.stringify({ s: salt, h: pinHash_(salt, pin), at: new Date().toISOString() }));
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
  ss = ss || ss_();
  cfg = cfg || readConfig_(ss) || {};
  const g = adminInfo_(ss, cfg);
  const google = { via: 'google', name: g.me, username: '', role: '', me: g.me, owner: g.owner, canEdit: true, isAdmin: g.isAdmin, lpchAdmin: false };
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
      const isAdmin = p.canEdit && (p.lpchAdmin || listed);
      const anyEdit = Object.keys(EDIT_VIEWS).reduce((a, t) => a.concat(EDIT_VIEWS[t]), []).some(v => navAccess_(cfg, v, isAdmin ? ADMIN_ROLE : p.role) === 'edit');
      return { via: 'lpch', name: p.name, username: p.username, role: p.role, me: p.email, owner: g.owner,
        canEdit: anyEdit, isAdmin: isAdmin, lpchAdmin: p.lpchAdmin, sub: isAdmin ? [] : subTabs_(cfg, p) };
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
  if (!list.some(v => navAccess_(cfg, v, navRole_(u)) === 'edit')) {
    throw new Error('ตำแหน่ง ' + (u.isAdmin ? 'Admin (แอดมิน)' : u.role || '-') + ' บันทึกในแถบนี้ไม่ได้ (บัญชี ' + u.username + ' ดูได้อย่างเดียว) · แอดมินเปิดสิทธิ์ได้ที่ ตั้งค่า → แถบเมนู');
  }
  return u;
}

// แอดมิน: ดึงสมาชิกที่ใช้งานอยู่และตำแหน่งจาก LPCH RO Workspace (คำสั่ง directory) ใช้ตั้งสิทธิ์รายแถบ และเชื่อมบัญชีของนักฟิสิกส์ / แพทย์ ในตั้งค่า
// ส่งอีเมลด้วยถ้า LPCH ส่งมา · ไม่เก็บรายชื่อไว้ที่นี่
function lpchMembers(token) {
  const u = who_(token);
  if (!u.isAdmin) throw new Error('ดูรายชื่อสมาชิกได้เฉพาะแอดมิน');
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
  try { v = PropertiesService.getScriptProperties().getProperty('LPCH_URL'); } catch (e) { v = null; }
  v = String(v == null || v === '' ? LPCH_URL : v).trim();
  return v === '-' ? '' : v;
}

// เรียก API ของ LPCH RO Workspace (doPost) หนึ่งครั้ง โยนข้อความผิดพลาดของ LPCH ต่อ
function lpchCall_(req) {
  const url = lpchUrl_();
  if (!url) throw new Error('ยังไม่ได้เชื่อมกับ LPCH RO Workspace (ตั้ง Script property LPCH_URL)');
  const res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(req), muteHttpExceptions: true });
  const body = String(res.getContentText('UTF-8') || '');
  let out = null;
  try { out = JSON.parse(body); } catch (e) { out = null; }
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
  const cache = CacheService.getScriptCache(), key = 'lpch_' + token;
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  let p;
  try { p = lpchProfile_(lpchCall_({ action: 'me', token: token }).user); } catch (e) {
    if (e.message !== 'session_expired') throw e;   // LPCH ติดต่อไม่ได้: แจ้งตามจริง ไม่ออกจากระบบ
    p = { error: 'การเข้าสู่ระบบด้วยบัญชี LPCH หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' };
  }
  cache.put(key, JSON.stringify(p), LPCH_CHECK_SECONDS);
  return p;
}

// ผลการเข้าสู่ระบบของ LPCH ({token, user}) → {token, ...สมาชิก}
function lpchFinish_(out) {
  const p = lpchProfile_(out.user);
  if (p.error) throw new Error(p.error);
  CacheService.getScriptCache().put('lpch_' + out.token, JSON.stringify(p), LPCH_CHECK_SECONDS);
  return Object.assign({ token: out.token }, p);
}

// ช่องเข้าสู่ระบบในหน้าเว็บ: ชื่อผู้ใช้ (หรืออีเมล) และรหัสผ่านตรวจที่ LPCH ไม่เก็บที่นี่
function lpchLogin(username, password) {
  return lpchFinish_(lpchCall_({ action: 'login', username: String(username || ''), password: String(password || '') }));
}

function lpchLogout(token) {
  if (!token) return true;
  CacheService.getScriptCache().remove('lpch_' + token);
  try { lpchCall_({ action: 'logout', token: String(token) }); } catch (e) { /* ปล่อยให้หมดอายุเอง */ }
  return true;
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

function checkSetup() {
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
function setupLpch() {
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
    const cache = CacheService.getScriptCache(), key = 'ssOwner_' + ss.getId(), hit = cache.get(key);
    if (hit !== null && hit !== undefined) owner = hit === '-' ? '' : hit;
    else { const o = ss.getOwner(); owner = o ? String(o.getEmail() || '').toLowerCase() : ''; cache.put(key, owner || '-', 21600); }
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
  let sh = ss.getSheetByName(def.sheet);
  if (!sh) {
    sh = ss.insertSheet(def.sheet);
    sh.setFrozenRows(1);
  }
  let header = headerOf_(sh);
  if (table === 'cases' && header.some(h => RENAMED_COLS[h] && header.indexOf(RENAMED_COLS[h]) < 0)) {
    header = header.map(h => (RENAMED_COLS[h] && header.indexOf(RENAMED_COLS[h]) < 0 ? RENAMED_COLS[h] : h));
    sh.getRange(1, 1, 1, header.length).setValues([header]);
  }
  const missing = def.fields.map(f => f[1]).filter(h => header.indexOf(h) < 0);
  if (missing.length) sh.getRange(1, header.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
  return sh;
}

function headerOf_(sh) {
  const n = sh.getLastColumn();
  return n ? sh.getRange(1, 1, 1, n).getValues()[0].map(v => String(v).trim()) : [];
}

function readTable_(ss, table, cfg) {
  const def = tableDef_(table, cfg);
  const sh = ss.getSheetByName(def.sheet);
  if (!sh || sh.getLastRow() < 2) return [];
  const tz = ss.getSpreadsheetTimeZone();
  const values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const cv = rowConv_(def, values.shift().map(v => String(v).trim()), tz);
  if (cv.cols[0] < 0) return [];
  return values.filter(r => String(r[cv.cols[0]]).trim() !== '').map(cv.conv);
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
function writeFields_(sh, row, header, fields, rec) {
  const cells = fields
    .map(f => ({ col: header.indexOf(f[1]) + 1, value: safeText_(rec[f[0]]) }))
    .filter(c => c.col > 0);
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
}

function appendNew_(ss, table, records) {
  const def = tableDef_(table);
  const sh = tableSheet_(ss, table);
  const header = headerOf_(sh);
  const idCol = header.indexOf('id') + 1;
  const have = {};
  if (sh.getLastRow() > 1) sh.getRange(2, idCol, sh.getLastRow() - 1, 1).getValues().forEach(r => { have[String(r[0])] = true; });
  const fresh = records.filter(r => !have[r.id]);
  if (!fresh.length) return 0;
  const stamp = new Date().toISOString();
  const rows = fresh.map(rec => header.map(h => {
    const f = def.fields.find(x => x[1] === h);
    return !f ? '' : f[0] === 'rev' ? stamp : safeText_(rec[f[0]]);
  }));
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, header.length).setNumberFormat('@').setValues(rows);
  return fresh.length;
}

// ชีต Config อ่านครั้งเดียวต่อคำขอ (ตรวจสิทธิ์แล้วบันทึก = เดิมอ่าน 2–3 ครั้ง) · คืนสำเนาใหม่ทุกครั้ง · writeConfig_ ล้าง
let CFG_MEMO_ = null;
function readConfig_(ss) {
  if (!CFG_MEMO_ || CFG_MEMO_.ss !== ss) {
    const sh = ss.getSheetByName(CONFIG_SHEET);
    CFG_MEMO_ = { ss: ss, rows: !sh || sh.getLastRow() < 2 ? [] : sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues() };
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
  const sh = ss.getSheetByName(CONFIG_SHEET) || ss.insertSheet(CONFIG_SHEET);
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
function withLock_(fn) {
  if (LOCKED_) return fn();   // ถือล็อกอยู่แล้วในคำขอนี้
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('มีคนกำลังบันทึกข้อมูลอยู่ รอสักครู่แล้วลองใหม่');
  LOCKED_ = true;
  try {
    return fn();
  } finally {
    LOCKED_ = false;
    try { SpreadsheetApp.flush(); saveDirty_(); } finally { lock.releaseLock(); }
  }
}

/* ---------- ชีตเก็บข้อมูล ---------- */

// ชีตที่ผูกสคริปต์ → ชีตใน Script property SHEET_ID → สร้างชีตใหม่ครั้งแรกแล้วจำ ID ไว้ใน SHEET_ID
let SS_ = null;
function ss_() {
  if (SS_) return SS_;
  const bound = SpreadsheetApp.getActive();
  if (bound) return (SS_ = bound);
  const id = sheetIdProp_();
  if (id) return (SS_ = openSheet_(id));
  // สร้างภายใต้ล็อก กันสองคนเปิดครั้งแรกพร้อมกันแล้วได้ชีตคนละไฟล์
  return (SS_ = withLock_(() => {
    const again = sheetIdProp_();
    if (again) return openSheet_(again);
    const ss = SpreadsheetApp.create(APP_TITLE + ' (ข้อมูล)');
    ss.setSpreadsheetTimeZone('Asia/Bangkok');
    const first = ss.getSheets()[0];
    first.setName(TABLES.cases.sheet);
    first.setFrozenRows(1);
    PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
    return ss;
  }));
}

// ID จาก Script property SHEET_ID (ใส่ได้ทั้ง ID และลิงก์ของชีต) ไม่ได้ตั้ง = ''
function sheetIdProp_() {
  const raw = String(PropertiesService.getScriptProperties().getProperty('SHEET_ID') || '').trim();
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
