/*
 * Thai ⇄ English switch.
 * The page is written in Thai. In English mode every Thai text node and the placeholder / title /
 * aria-label attributes are translated from DICT, including text the app renders later (a
 * MutationObserver follows the DOM). Switching back restores the original Thai.
 * Exact matches are tried first; otherwise known Thai fragments inside the text are replaced,
 * longest first, which covers messages built from fragments plus numbers.
 * Anything inside translate="no" (names, file names, user data) is left alone.
 */
(function (root) {
  'use strict';

  var KEY = 'trs398-lang-v1';
  var TH = /[฀-๿]/;

  var DICT = {
    // ---- Header, tabs, menus ----
    'คำนวณ absorbed dose to water ที่ระดับลึกอ้างอิง และ output (cGy/MU) ที่ z': 'Calculates absorbed dose to water at the reference depth and output (cGy/MU) at z',
    'ของเครื่องเร่งอนุภาค ตามโปรโตคอล IAEA TRS-398 ใช้ข้อมูลหัววัด เครื่องวัดประจุ และตาราง k': 'for linear accelerators per IAEA TRS-398, using chamber, electrometer and k',
    'จาก': 'from',
    'อัตโนมัติ': 'Auto',
    'กลางวัน': 'Light',
    'กลางคืน': 'Dark',
    'อัตโนมัติ (ตามอุปกรณ์)': 'Auto (follow device)',
    'โหมดสี': 'Colour mode',
    'โลโก้โรงพยาบาลมะเร็งลำปาง': 'Lampang Cancer Hospital logo',
    'ภาษา': 'Language',
    'คำนวณ': 'Calculator',
    'Dashboard ย้อนหลัง': 'History dashboard',
    'มุมมอง': 'View',
    'ไปยังหัวข้อ': 'Go to section',
    'แหล่งข้อมูล': 'Data source',
    'ปัจจัยสอบเทียบ': 'Calibration factors',
    'ค่าที่อ่านได้': 'Readings',
    'และเกณฑ์': 'and criteria',
    'ผลลัพธ์และรายงาน': 'Results and report',

    // ---- Notice ----
    'ข้อมูลเครื่อง หัววัด และ k': 'Machine, chamber and k',
    'มาจาก Sheet ส่วน': 'data come from the Sheet; the ',
    'ค่าที่อ่านได้เป็นตัวอย่าง': 'readings are examples',
    'แทนที่ด้วยค่าวัดจริง': '— replace them with real measurements',
    'ตัวอย่าง 6 MV': 'Example 6 MV',
    'ตัวอย่าง 9 MeV': 'Example 9 MeV',
    'ล้างค่าการวัด': 'Clear readings',
    ': ข้อมูลเครื่องและหัววัดมาจาก Sheet ส่วน': ': machine and chamber data come from the Sheet; the ',
    'ล้างค่าการวัดแล้ว ข้อมูลเครื่อง หัววัด และเกณฑ์ยังคงอยู่': 'Readings cleared. Machine, chamber and criteria are kept.',
    'โหลดข้อมูลล่าสุดที่กรอกไว้ในเบราว์เซอร์นี้': 'Loaded the last values entered in this browser',

    // ---- Data source ----
    'แหล่งข้อมูลหลัก': 'Master data',
    'ดึงข้อมูลจาก Sheet': 'Fetch from Sheet',
    'เลือกไฟล์ .xlsx': 'Choose .xlsx file',
    'สำเนาในแอป': 'Built-in copy',
    'ลิงก์ Google Sheet': 'Google Sheet link',
    'เชื่อมกับ Sheet': 'Linked to Sheet',
    'จากไฟล์ .xlsx': 'From .xlsx file',
    'กำลังดึงข้อมูล': 'Fetching',
    'ดึงข้อมูลไม่สำเร็จ': 'Fetch failed',
    'ข้อมูลจาก Sheet ครั้งล่าสุด': 'Last Sheet data',
    '(บันทึกในแอป)': '(built into the app)',
    'เชื่อมต่อ': 'Reconnect',
    'ใหม่ที่ claude.ai Settings → Connectors แล้วกดดึงข้อมูลอีกครั้ง': 'in claude.ai Settings → Connectors, then fetch again',
    'เพิ่ม': 'Add',
    'ที่ claude.ai Settings → Connectors เพื่อดึงข้อมูลจาก Sheet โดยตรง': 'in claude.ai Settings → Connectors to read the Sheet directly',
    'เลือกบัญชี': 'Choose the',
    'ที่จะใช้ในหน้าต่างที่ claude.ai แสดง': 'account to use in the claude.ai prompt',
    'หน้านี้ไม่ได้รับอนุญาตให้ใช้': 'This page is not allowed to use',
    'เปิดได้ที่เมนู Permissions ของหน้านี้': '— turn it on in this page\'s Permissions menu',
    'นโยบายขององค์กรไม่อนุญาตให้หน้านี้อ่าน': 'Your organisation\'s policy does not allow this page to read',
    'Google Drive ตอบกลับว่า:': 'Google Drive replied:',
    'อ่านไฟล์ไม่ได้': 'Cannot read the file',
    'ตรวจสอบลิงก์และสิทธิ์การเข้าถึง Sheet': '— check the link and Sheet access',
    'ไม่ตอบสนองชั่วคราว ลองกดดึงข้อมูลอีกครั้ง': 'is not responding right now; try fetching again',
    'อ่านโครงสร้าง Sheet ไม่ได้:': 'Cannot read the Sheet layout:',
    'ดึงข้อมูลไม่สำเร็จ (': 'Fetch failed (',
    'ลิงก์ Google Sheet ไม่ถูกต้อง': 'The Google Sheet link is not valid',
    'โหลดตัวอ่านไฟล์ Excel ไม่ได้ ใช้สำเนาในแอปแทน': 'Could not load the Excel reader; using the built-in copy',
    'การดึงข้อมูลจาก Sheet โดยตรงใช้ได้เมื่อเปิดหน้านี้ใน claude.ai (ผ่าน Google Drive connector) ที่นี่ใช้ปุ่ม "เลือกไฟล์ .xlsx" แทน': 'Reading the Sheet directly works when this page is opened in claude.ai (through the Google Drive connector). Here, use "Choose .xlsx file" instead.',
    'กำลังอ่าน Sheet ผ่าน Google Drive…': 'Reading the Sheet through Google Drive…',
    'อัปเดต': 'updated',
    '· ใช้สำเนาในแอปอยู่': '· using the built-in copy',
    '· ใช้ข้อมูลชุดล่าสุดอยู่': '· using the last data set',
    'โหลดตัวอ่านไฟล์ Excel ไม่ได้ (ต้องต่ออินเทอร์เน็ตเพื่อโหลด SheetJS)': 'Could not load the Excel reader (an internet connection is needed for SheetJS)',
    '(ไฟล์ .xlsx)': '(.xlsx file)',
    '· โหลดเมื่อ': '· loaded',
    'อ่านไฟล์ไม่ได้:': 'Cannot read the file:',
    'ต้องเป็นไฟล์ TG398 LPCH ที่มี sheet "0. List" และ "1. kQ,Q0 table"': 'It must be a TG398 LPCH file with the sheets "0. List" and "1. kQ,Q0 table"',
    'ไม่พบ sheet "': 'Sheet not found: "',
    'ไม่พบรายชื่อเครื่องใน "': 'No machines listed in "',
    'ไม่พบตาราง kQ ของ photon': 'Photon kQ table not found',
    'ผลลัพธ์จาก Google Drive ไม่มีเนื้อไฟล์': 'The Google Drive result has no file content',

    // ---- Equipment ----
    'เครื่องและอุปกรณ์': 'Equipment',
    'จาก Sheet "0. List"': 'from Sheet "0. List"',
    'เครื่องเร่งอนุภาค': 'Accelerator',
    'พลังงาน': 'Energy',
    'หัววัด': 'Chamber',
    'เครื่องวัดประจุ': 'Electrometer',
    'วันที่วัด': 'Measurement date',
    'ชนิด QA': 'QA type',
    'เลือกชนิด QA': 'Choose QA type',
    'หลังซ่อม': 'After repair',
    'นักฟิสิกส์': 'Physicist',
    '(เลือกได้หลายคน)': '(choose one or more)',
    'อื่นๆ (กรอกเอง)': 'Other (type in)',
    'หมายเหตุ': 'Remarks',
    'รุ่นและ S/N หัววัด': 'Chamber model and S/N',
    'รุ่นและ S/N': 'Model and S/N',
    'ชื่อ-นามสกุล คั่นด้วยจุลภาคถ้ามีหลายคน': 'Full name; separate several names with commas',
    'เช่น ปรับ output หลังเปลี่ยน magnetron, ใช้ phantom ชุดสำรอง': 'e.g. output adjusted after magnetron change, backup phantom used',
    'Photon อื่นๆ (กรอกเอง)': 'Other photon (type in)',
    'Electron อื่นๆ (กรอกเอง)': 'Other electron (type in)',
    'ค่าจาก Sheet สำหรับ': 'Sheet values for',
    'ช่องว่างใน Sheet:': 'Blank in the Sheet:',
    'กรุณากรอกเอง': '— please enter it',
    'พลังงานที่กรอกเอง: ใส่ค่าคุณภาพลำรังสี TMR/PDD และ N_D,w เอง': 'Typed-in energy: enter beam quality, TMR/PDD and N_D,w yourself',
    'รุ่นและ S/N เครื่องวัดประจุ': 'electrometer model and S/N',
    'นักฟิสิกส์ (อย่างน้อย 1 คน)': 'physicist (at least one)',
    'ชื่อนักฟิสิกส์ (อื่นๆ)': 'physicist name (other)',
    'กรอกหัวข้อ "เครื่องและอุปกรณ์" ให้ครบก่อน:': 'Complete the "Equipment" section first:',
    'กรอกให้ครบ (เครื่องและอุปกรณ์):': 'Still needed (Equipment):',

    // ---- Beam quality ----
    'คุณภาพลำรังสี': 'Beam quality',
    'การจัดวาง (setup)': 'Setup',
    'การจัดวาง': 'Setup',
    'ดัชนีคุณภาพลำรังสี': 'Beam quality index',
    'M ที่ระดับลึก 10 g/cm² (nC)': 'M at 10 g/cm² depth (nC)',
    'M ที่ระดับลึก 20 g/cm² (nC)': 'M at 20 g/cm² depth (nC)',
    'ค่า': 'Value',
    'ระดับลึกอ้างอิง z': 'Reference depth z',
    'จำนวน MU ต่อการวัด': 'MU per measurement',
    'TPR20,10 จาก M20/M10': 'TPR20,10 from M20/M10',
    'TPR20,10 (ใส่ค่า)': 'TPR20,10 (enter value)',
    'PDD20,10 (อัตราส่วน)': 'PDD20,10 (ratio)',
    '10 g/cm² สำหรับ photon': '10 g/cm² for photons',

    // ---- Calibration factors ----
    'ปัจจัยการสอบเทียบ': 'Calibration factors',
    '1.000 เมื่อสอบเทียบหัววัดกับเครื่องวัดเป็นชุดเดียวกัน': '1.000 when the chamber and electrometer were calibrated together',
    'ใช้กับ electron ที่ cross-calibrate (Kcross ใน Sheet)': 'For cross-calibrated electron beams (Kcross in the Sheet)',
    '1.000 สำหรับลำรังสีที่มี flattening filter': '1.000 for flattened beams',
    'คำนวณจากตาราง k_Q ตามคุณภาพลำรังสี': 'Interpolate k_Q from the table by beam quality',
    'สอบเทียบในลำรังสีนี้ (k_Q = 1)': 'Calibrated in this beam (k_Q = 1)',
    'ใส่ค่าเอง': 'Enter manually',
    'ตาราง k': 'k',
    'ของหัววัด': 'table for the chamber',
    'ตารางของคุณ: หนึ่งแถวต่อบรรทัด "': 'Your table: one row per line "',
    'ที่ใช้': 'in use',
    'วางตารางเอง': 'Paste my own table',
    'จากใบรับรองหัววัด (Co-60)': 'From the chamber certificate (Co-60)',
    'Sheet: N_D,w ของ PP chamber แยกตามพลังงาน electron': 'Sheet: PP chamber N_D,w per electron energy',
    'Q0 = Q (N_D,w สอบเทียบในลำรังสีพลังงานนี้)': 'Q0 = Q (N_D,w calibrated in this beam energy)',
    'ค่าที่กรอกเอง': 'entered manually',

    // ---- Environment ----
    'สภาพแวดล้อม': 'Environment',
    'อ้างอิง 20 °C, 1013.25 mbar': 'reference 20 °C, 1013.25 mbar',
    'อุณหภูมิ (°C)': 'Temperature (°C)',
    'ความดัน': 'Pressure',
    'หน่วยความดัน': 'Pressure unit',

    // ---- Readings ----
    'ค่าที่อ่านได้ที่ z': 'Readings at z',
    'คั่นแต่ละค่าด้วยช่องว่างหรือจุลภาค': 'separate values with spaces or commas',
    'Polarity ที่ใช้ (+V': 'Routine polarity (+V',
    'ที่ polarity ที่ใช้และแรงดัน V': 'at routine polarity and voltage V',
    'คำนวณ k': 'Calculate k',
    'ที่ polarity ตรงข้าม (−V': 'at opposite polarity (−V',
    '|) / 2M ใช้ค่าสัมบูรณ์': '|) / 2M using absolute values',
    'ชนิดลำรังสีสำหรับ k': 'Beam type for k',
    'ที่แรงดัน V': 'at voltage V',

    // ---- After adjust ----
    'หลังปรับเครื่อง': 'After adjustment',
    'ปรับ output แล้ววัดซ้ำ': 'Output adjusted and re-measured',
    'ความดัน (': 'Pressure (',
    'หลังปรับ (+V': 'after adjustment (+V',
    'วัดเฉพาะ polarity ที่ใช้ ส่วน k': 'Measure the routine polarity only; k',
    'และ TMR/PDD ใช้ค่าจากก่อนปรับ เหมือนใน Sheet': 'and TMR/PDD are taken from the before measurement, as in the Sheet',

    // ---- zmax & criteria ----
    'แปลงไปยัง z': 'Transfer to z',
    'และเกณฑ์ยอมรับ': 'and acceptance criteria',
    'ใช้แสดงในรายงาน': 'Shown in the report',
    'Output ที่คาดหวัง (cGy/MU)': 'Expected output (cGy/MU)',
    'ระดับเฝ้าระวัง (± %)': 'Watch level (± %)',
    'เกณฑ์ยอมรับ (± %)': 'Tolerance (± %)',
    'TMR ที่ 10 g/cm², 10×10 cm² (Sheet: TMR zref)': 'TMR at 10 g/cm², 10×10 cm² (Sheet: TMR zref)',
    'PDD ที่ 10 g/cm², SSD 100 cm, 10×10 cm²': 'PDD at 10 g/cm², SSD 100 cm, 10×10 cm²',
    'PDD ที่ z_ref เป็น % (Sheet: PDD × 100)': 'PDD at z_ref in % (Sheet: PDD × 100)',

    // ---- Result panel ----
    'Output ที่ z': 'Output at z',
    'ผลการวัด': 'Result',
    'ก่อนปรับ': 'Before adjustment',
    'หลังปรับ': 'After adjustment',
    'รอข้อมูล': 'Waiting for data',
    'ข้อมูลไม่ครบ': 'Incomplete data',
    'ผ่าน แต่เกินระดับเฝ้าระวัง': 'Pass, beyond watch level',
    'เกินเกณฑ์ยอมรับ': 'Out of tolerance',
    'ผ่าน': 'Pass',
    'กรอกข้อมูลให้ครบเพื่อคำนวณ': 'Complete the inputs to calculate',
    'ปัจจัยแก้ไขและผลคำนวณ': 'Correction factors and results',
    '1.0000 (ไม่ใช้)': '1.0000 (not used)',
    '(แก้ไขแล้ว)': '(corrected)',
    'ข้อควรตรวจสอบ': 'Check these',
    'ที่': 'at',

    // ---- Report card ----
    'บันทึกรายงาน': 'Save report',
    'ส่งรายงานไปที่ Sheet': 'Send report to Sheet',
    'คัดลอกรายงาน': 'Copy report',
    'เปิด TRS-398 Output Log': 'Open TRS-398 Output Log',
    'ปลายทางของรายงาน': 'Report destination',
    'Folder ID ของโฟลเดอร์ Inbox': 'Inbox folder ID',
    'ลิงก์ Log Sheet': 'Log Sheet link',
    'รายงานแบบข้อความ': 'Plain-text report',
    'เลือกข้อความแล้ว กด Ctrl/⌘+C เพื่อคัดลอก': 'Text selected — press Ctrl/⌘+C to copy',
    'คัดลอกรายงานแล้ว': 'Report copied',
    'ผลการคำนวณยังไม่ครบ แก้รายการใน "ข้อควรตรวจสอบ" ก่อนส่ง': 'The calculation is incomplete — fix the items under "Check these" first',
    'ผลหลังปรับยังไม่ครบ กรอกให้ครบหรือยกเลิกการติ๊ก "ปรับ output แล้ววัดซ้ำ"': 'The after-adjustment result is incomplete — complete it or untick "Output adjusted and re-measured"',
    'การส่งไปที่ Sheet ใช้ได้เมื่อเปิดหน้านี้ใน claude.ai ที่เชื่อม Google Drive ไว้ ตอนนี้ใช้ "คัดลอกรายงาน" แทนได้': 'Sending to the Sheet works when this page is opened in claude.ai with Google Drive connected. Use "Copy report" for now.',
    'ใส่ Folder ID ของโฟลเดอร์ Inbox ใน "ปลายทางของรายงาน"': 'Enter the Inbox folder ID under "Report destination"',
    'ยืนยันส่งซ้ำ': 'Confirm resend',
    'รายงานนี้ส่งไปแล้ว (': 'This report was already sent (',
    ') กด "ยืนยันส่งซ้ำ" ถ้าต้องการบันทึกอีกแถว': ') — press "Confirm resend" to log another row',
    'กำลังส่ง': 'Sending',
    'บัญชี Google ที่ใช้ดึงข้อมูลและบันทึกรายงาน:': 'Google account used to read data and save reports:',
    'ข้อมูลหลักและ Log เป็นของ': 'Master data and Log belong to',
    'เข้าสู่ระบบเป็น': 'Signed in as',
    'บันทึกลงแท็บ Log แล้ว:': 'Saved to the Log tab:',
    'ล้างค่าการวัดแล้ว พร้อมวัดครั้งถัดไป': 'Readings cleared, ready for the next measurement',
    'รายงานนี้มีอยู่ใน Log แล้ว:': 'This report is already in the Log:',
    'เปิด Log Sheet': 'Open Log Sheet',
    'ส่งแล้ว:': 'Sent:',
    'ดูไฟล์รายงาน': 'View report file',
    'จะเข้าแท็บ Log ภายใน 5 นาที (หรือเมนู TRS-398 → นำเข้ารายงานตอนนี้ ใน Log Sheet)': 'It reaches the Log tab within 5 minutes (or use TRS-398 → Import reports now in the Log Sheet)',
    '· ตรวจในโฟลเดอร์ Inbox ก่อนกดส่งอีกครั้ง เพราะไฟล์อาจถูกสร้างไปแล้ว': '· check the Inbox folder before sending again — the file may already exist',

    // ---- Calculation messages (trs398.js) ----
    'ต้องระบุ R50 หรือ I50 ที่มากกว่า 0': 'Enter an R50 or I50 greater than 0',
    'R50 < 4 g/cm²: TRS-398 กำหนดให้ใช้หัววัดแบบ plane-parallel ตรวจสอบรุ่นหัววัดที่ใช้': 'R50 < 4 g/cm²: TRS-398 requires a plane-parallel chamber — check the chamber in use',
    'ต้องมีค่าที่อ่านได้ที่ระดับลึก 10 และ 20 g/cm² เพื่อหา TPR20,10': 'Readings at 10 and 20 g/cm² are needed for TPR20,10',
    'TPR20,10 อยู่นอกช่วงที่ TRS-398 ครอบคลุม (0.50–0.84)': 'TPR20,10 is outside the TRS-398 range (0.50–0.84)',
    'ตาราง k_Q ต้องมีอย่างน้อย 2 แถว': 'The k_Q table needs at least 2 rows',
    'อยู่นอกช่วงของตาราง k_Q ที่ใส่ไว้': 'is outside the range of the k_Q table',
    'ค่า k_Q,Q0 ไม่ถูกต้อง': 'k_Q,Q0 is not valid',
    'ต้องมีค่าที่อ่านได้อย่างน้อย 1 ค่าที่ polarity และแรงดันปกติ': 'At least one reading at routine polarity and voltage is needed',
    'ค่าที่อ่านซ้ำกระจายเกิน 0.1% (CV': 'Repeat readings spread more than 0.1% (CV',
    '%) ตรวจสอบความเสถียรของการวัด': '%) — check measurement stability',
    'อุณหภูมิผิดปกติ ตรวจสอบหน่วย (°C)': 'Unusual temperature — check the unit (°C)',
    'ความดันผิดปกติ ตรวจสอบหน่วยที่เลือก': 'Unusual pressure — check the selected unit',
    'k_pol ต่างจาก 1 เกิน 0.3% ตรวจสอบหัววัดหรือการต่อสาย': 'k_pol differs from 1 by more than 0.3% — check the chamber or cabling',
    'ต้องมีค่าที่อ่านได้ที่ polarity ตรงข้ามเพื่อคำนวณ k_pol': 'Readings at the opposite polarity are needed for k_pol',
    'V2 ต้องน้อยกว่า V1': 'V2 must be lower than V1',
    'อยู่นอกช่วงตาราง 4.VII (2.0–5.0)': 'is outside Table 4.VII (2.0–5.0)',
    'ไม่ตรงกับแถวในตาราง 4.VII ใช้การประมาณค่าเชิงเส้นของสัมประสิทธิ์': 'does not match a row of Table 4.VII; coefficients are linearly interpolated',
    'k_s > 1.05: TRS-398 แนะนำให้ใช้หัววัดอื่น': 'k_s > 1.05: TRS-398 recommends another chamber',
    'k_s < 1: ตรวจสอบค่าที่อ่านที่แรงดัน V2 (ควรน้อยกว่าที่ V1)': 'k_s < 1: check the V2 readings (they should be lower than at V1)',
    'ต้องมีค่าที่อ่านได้ที่แรงดัน V2 และค่า V1, V2 เพื่อคำนวณ k_s': 'Readings at V2 and both V1, V2 are needed for k_s',
    'ต้องระบุ N_D,w,Q0': 'Enter N_D,w,Q0',
    'N_D,w ต้องเป็นหน่วย cGy/nC (เช่น 5.307) ไม่ใช่ Gy/C': 'N_D,w must be in cGy/nC (e.g. 5.307), not Gy/C',
    'ต้องระบุจำนวน MU': 'Enter the MU',
    'TMR(z_ref) ต้องอยู่ระหว่าง 0 ถึง 1': 'TMR(z_ref) must be between 0 and 1',
    'PDD(z_ref) ต้องอยู่ระหว่าง 0 ถึง 100%': 'PDD(z_ref) must be between 0 and 100%',
    'หลังปรับ: ต้องมีค่าที่อ่านได้อย่างน้อย 1 ค่า': 'After adjustment: at least one reading is needed',
    'หลังปรับ: ค่าที่อ่านซ้ำกระจายเกิน 0.1% (CV': 'After adjustment: repeat readings spread more than 0.1% (CV',
    'หลังปรับ: ต้องระบุอุณหภูมิและความดัน': 'After adjustment: enter temperature and pressure',
    'ต้องคำนวณผลก่อนปรับให้ได้ก่อน': 'The before-adjustment result must be complete first',

    // ---- Dashboard ----
    'เครื่อง': 'Machine',
    'ทุกเครื่อง': 'All machines',
    'ทุกพลังงาน': 'All energies',
    'ทุกชนิด': 'All types',
    'ช่วงเวลา': 'Period',
    '3 เดือนล่าสุด': 'Last 3 months',
    '6 เดือนล่าสุด': 'Last 6 months',
    '12 เดือนล่าสุด': 'Last 12 months',
    'ทั้งหมด': 'All time',
    'ยังไม่ได้โหลด': 'Not loaded yet',
    'รีเฟรชจาก Log Sheet': 'Refresh from Log Sheet',
    'เลือกไฟล์ Log .xlsx': 'Choose Log .xlsx file',
    'กำลังแสดง': 'Showing',
    'ข้อมูลตัวอย่าง': 'example data',
    'ไม่ใช่ผลการวัดจริง': '— not real measurements',
    'กลับไปที่ข้อมูลจริง': 'Back to real data',
    'ยังไม่มีรายงานใน Log': 'No reports in the Log yet',
    'รายงานที่กด "ส่งรายงานไปที่ Sheet" จะแสดงที่นี่ ทั้งที่เข้า Log แล้วและที่รอนำเข้า': 'Reports sent with "Send report to Sheet" appear here, both imported and waiting for import',
    'ดูข้อมูลตัวอย่าง': 'View example data',
    'แนวโน้ม %Diff (ก่อนปรับ) ตามวันที่วัด': '%Diff trend (before adjustment) by measurement date',
    'รายการการวัด': 'Measurements',
    'ผล': 'Result',
    'แหล่ง': 'Source',
    'ทุกแหล่ง': 'All sources',
    'จำนวนการวัด': 'Measurements',
    'ไม่มีข้อมูลในช่วงนี้': 'No data in this period',
    'ค่าล่าสุด': 'Latest',
    '· หลังปรับ': '· after adjustment',
    '%Diff เฉลี่ย (ก่อนปรับ)': 'Mean %Diff (before adjustment)',
    '% · ช่วง': '% · range',
    'ถึง': 'to',
    '✓ ผ่าน': '✓ Pass',
    '! เฝ้าระวัง': '! Watch',
    '✕ เกินเกณฑ์': '✕ Out of tolerance',
    'ผลก่อนปรับ': 'Result before adjustment',
    'ปรับเครื่อง': 'Adjustments:',
    'ครั้ง': '',
    'ไม่มีข้อมูลตามตัวกรองนี้': 'No data for these filters',
    'แนวโน้ม %Diff ของ output ตามวันที่วัด เส้นละหนึ่งพลังงาน': 'Output %Diff trend by measurement date, one line per energy',
    '% เกณฑ์ยอมรับ': '% tolerance',
    'เลือกเครื่องเพื่อดูเส้นแนวโน้มแยกตามพลังงาน (รวมทุกเครื่องมีเกิน 8 เส้น)': 'Choose a machine to see trend lines by energy (all machines together exceed 8 lines)',
    'ไม่แสดง': 'Hidden:',
    'เส้น เลือกพลังงานเพื่อดู': 'lines — choose an energy to see them',
    '→ หลังปรับ': '→ after adjustment',
    'รอนำเข้า': 'Waiting for import',
    'ตัวอย่าง': 'Example',
    'รายการ ·': 'rows ·',
    'รายการ': 'rows',
    'PASS (เกินระดับเฝ้าระวัง)': 'PASS (beyond watch level)',
    'เชื่อมต่อ Google Drive ใหม่ที่ claude.ai Settings → Connectors': 'Reconnect Google Drive in claude.ai Settings → Connectors',
    'เพิ่ม Google Drive ที่ claude.ai Settings → Connectors': 'Add Google Drive in claude.ai Settings → Connectors',
    'หน้านี้ยังไม่ได้รับอนุญาตให้อ่าน Google Drive': 'This page is not yet allowed to read Google Drive',
    'อ่าน Log Sheet ไม่ได้:': 'Cannot read the Log Sheet:',
    'ตรวจสอบลิงก์และสิทธิ์': '— check the link and access',
    'Google Drive ไม่ตอบสนองชั่วคราว ลองรีเฟรช': 'Google Drive is not responding right now; try refreshing',
    'ดึง Log ไม่สำเร็จ': 'Could not read the Log',
    'ใส่ลิงก์ Log Sheet ใน "ปลายทางของรายงาน"': 'Enter the Log Sheet link under "Report destination"',
    'อ่าน Log Sheet ได้เมื่อเปิดใน claude.ai · ใช้ปุ่มเลือกไฟล์ .xlsx ได้': 'The Log Sheet can be read when opened in claude.ai · or choose an .xlsx file',
    'กำลังอ่าน Log Sheet…': 'Reading the Log Sheet…',
    'โหลดตัวอ่านไฟล์ Excel ไม่ได้': 'Could not load the Excel reader',
    'ไม่พบแท็บ Log': 'Log tab not found',
    'แถวแรกของแท็บ Log ไม่มีหัวคอลัมน์ "Report ID"': 'The first row of the Log tab has no "Report ID" header',

    // ---- Calculation history ----
    'ประวัติการคำนวณ': 'Calculation history',
    'ผลที่คำนวณครบทุกครั้งถูกเก็บไว้ในเบราว์เซอร์นี้อัตโนมัติ ทั้งที่ส่งและยังไม่ส่งไปที่ Sheet แตะรายการเพื่อดูค่าทั้งหมดหรือโหลดกลับไปคำนวณต่อ': 'Every complete calculation is saved in this browser automatically, whether or not it was sent to the Sheet. Tap an entry to see all values or open it in the calculator again.',
    'ค้นหา': 'Search',
    'พลังงาน, นักฟิสิกส์, วันที่, หมายเหตุ': 'Energy, physicist, date, note',
    'ล้างประวัติในเบราว์เซอร์นี้': 'Clear this browser\'s history',
    'ยืนยันล้าง (Log Sheet ไม่ถูกลบ)': 'Confirm clear (the Log Sheet is kept)',
    'ยังไม่มีประวัติการคำนวณ': 'No calculations yet',
    'เมื่อกรอกค่าจนคำนวณ Output ได้ ผลจะถูกบันทึกไว้ที่นี่': 'Once the inputs are complete enough to calculate the output, the result is saved here',
    'คำนวณเมื่อ': 'Calculated',
    'สถานะ': 'Status',
    'ส่งแล้ว': 'Sent',
    'ยังไม่ส่ง': 'Not sent',
    'ไม่พบรายการที่ตรงกับตัวกรอง': 'No entries match the filter',
    'แสดงผลที่คำนวณครบในเบราว์เซอร์นี้ (บันทึกอัตโนมัติ ทั้งที่ส่งและยังไม่ส่ง) รวมกับรายงานทั้งหมดใน Log Sheet แตะรายการเพื่อดูค่าทั้งหมดหรือโหลดกลับไปคำนวณต่อ': 'Shows the complete calculations made in this browser (saved automatically, sent or not) together with every report in the Log Sheet. Tap an entry to see all values or open it in the calculator again.',
    'ยังไม่ได้โหลด Log Sheet': 'Log Sheet not loaded yet',
    'แหล่ง': 'Source',
    'คำนวณในเบราว์เซอร์นี้': 'Calculated in this browser',
    'อยู่ใน Log Sheet': 'In the Log Sheet',
    'เมื่อกรอกค่าจนคำนวณ Output ได้ ผลจะถูกบันทึกไว้ที่นี่ รายงานใน Log Sheet จะแสดงเมื่ออ่าน Log ได้': 'Once the inputs are complete enough to calculate the output, the result is saved here. Reports in the Log Sheet appear once the Log can be read.',
    'รายงานจาก Log Sheet · ค่า TPR/R50 ที่บันทึกไว้จะถูกใช้แทน M20/M10': 'Report from the Log Sheet · the recorded TPR/R50 is used instead of M20/M10',
    'โหลดค่าจากรายงานใน Log แล้ว (': 'Loaded from the Log report (',
    'ชนิดลำรังสี': 'Beam type',
    'ดัชนีคุณภาพ': 'Quality index',
    'ที่มาของ k_Q': 'k_Q source',
    'หน่วย P': 'P unit',
    'หมายเหตุผู้วัด': 'Measurement remark',
    'ผู้บันทึก (Gmail)': 'Recorded by (Gmail)',
    'เข้าสู่ระบบด้วย Google': 'Sign in with Google',
    'กำลังตรวจสอบบัญชี Google…': 'Checking your Google account…',
    'ยังเข้าสู่ระบบไม่ได้ (ผู้ดูแลยังไม่ได้ตั้งค่า LOGIN_URL)': 'Cannot sign in yet (the admin has not set LOGIN_URL)',
    'ยังเข้าสู่ระบบไม่ได้ ดูข้อความที่มุมขวาบนของหน้า': 'Not signed in — see the message at the top right of the page',
    'ยังเข้าสู่ระบบไม่ได้ เพราะผู้ดูแลยังไม่ได้ตั้งค่า LOGIN_URL แจ้ง': 'Cannot sign in yet because the admin has not set LOGIN_URL; contact',
    'ผู้ใช้อื่นยังเข้าสู่ระบบอัตโนมัติไม่ได้: ตั้งค่า': 'Other accounts cannot sign in automatically yet: set',
    'ใน Project Settings → Script properties': 'in Project Settings → Script properties',
    'กดปุ่ม "เข้าสู่ระบบด้วย Google" ที่ด้านบนของหน้าก่อนส่งรายงาน': 'Press "Sign in with Google" at the top of the page before sending',
    'กรุณากดปุ่ม "เข้าสู่ระบบด้วย Google" ที่ด้านบนของหน้าก่อนส่งรายงาน': 'Press "Sign in with Google" at the top of the page before sending',
    'กำลังเชื่อมต่อกับ Google ลองอีกครั้งในอีกสักครู่': 'Connecting to Google — try again in a moment',
    'ตาราง k_Q': 'k_Q table',
    'สอบเทียบในลำรังสีนี้ (1)': 'Calibrated in this beam (1)',
    'โหลดค่ากลับไปที่หน้าคำนวณ': 'Open in calculator',
    'ลบรายการนี้': 'Delete this entry',
    'โหลดค่าจากประวัติการคำนวณแล้ว (': 'Loaded from calculation history (',
    ') แก้ไขแล้วคำนวณต่อหรือส่งรายงานได้': '). Edit and recalculate, or send the report.',

    // ---- Footer ----
    'อ้างอิง: IAEA TRS-398 (2000) และ Rev.1 (2024). k': 'Reference: IAEA TRS-398 (2000) and Rev.1 (2024). k',
    '(SAD 100, 10×10 cm²) หรือ 1.2661·PDD': '(SAD 100, 10×10 cm²) or 1.2661·PDD',
    'จากตาราง 4.VII; k': 'from Table 4.VII; k',
    'ประมาณค่าเชิงเส้นระหว่างสองจุดของตาราง (เหมือน FORECAST ใน Sheet)': 'linearly interpolated between two table points (like FORECAST in the Sheet)',
    'เครื่องมือนี้ช่วยคำนวณเท่านั้น ผลการวัดทางคลินิกควรได้รับการทวนสอบอิสระโดยนักฟิสิกส์การแพทย์อีกท่าน': 'This tool only assists with the calculation. Clinical results should be independently checked by a second medical physicist.'
  };

  // Short words translated only when they are the whole text (as fragments they would break longer sentences)
  var EXACT = { 'ใช่': 'Yes', 'ไม่': 'No', 'กรอกเอง': 'Entered' };

  var KEYS = Object.keys(DICT).sort(function (a, b) { return b.length - a.length; });
  var ATTRS = ['placeholder', 'title', 'aria-label'];

  var lang = 'th';
  var textOrig = new Map();   // text node → original Thai
  var ownWrites = new WeakMap(); // text node → value we wrote, so our own edits are not re-read as app text
  var attrOrig = [];          // [element, attribute, original]
  var listeners = [];
  var observer = null;

  function read() { try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'th'; } catch (e) { return 'th'; } }
  function save(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* storage unavailable */ } }

  function translate(s) {
    var t = s.trim();
    if (!t || !TH.test(t)) return s;
    if (Object.prototype.hasOwnProperty.call(DICT, t)) return s.replace(t, DICT[t]);
    if (Object.prototype.hasOwnProperty.call(EXACT, t)) return s.replace(t, EXACT[t]);
    var out = s;
    for (var i = 0; i < KEYS.length && TH.test(out); i++) {
      if (out.indexOf(KEYS[i]) >= 0) out = out.split(KEYS[i]).join(DICT[KEYS[i]]);
    }
    return out.replace(/ {2,}/g, ' ');
  }

  function skipped(el) { return !el || !!el.closest('[translate="no"], script, style, textarea, title'); }

  function doText(n) {
    if (skipped(n.parentElement)) return;
    var v = n.nodeValue;
    if (!TH.test(v)) return;
    var tr = translate(v);
    if (tr !== v) { if (!textOrig.has(n)) textOrig.set(n, v); ownWrites.set(n, tr); n.nodeValue = tr; }
  }
  function doAttrs(el) {
    if (!el || el.closest('[translate="no"]')) return;   // textarea placeholders are translated too
    ATTRS.forEach(function (a) {
      var v = el.getAttribute(a);
      if (!v || !TH.test(v)) return;
      var t = v.trim();
      if (Object.prototype.hasOwnProperty.call(DICT, t)) { attrOrig.push([el, a, v]); el.setAttribute(a, DICT[t]); }   // exact matches only: titles can hold user notes
    });
  }
  function walk(rootNode) {
    if (rootNode.nodeType === 3) { doText(rootNode); return; }
    if (rootNode.nodeType !== 1) return;
    doAttrs(rootNode);
    var w = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    var n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.type === 'characterData') {
          // the app rewrote a text node: remember its new Thai text, then translate it
          if (ownWrites.get(m.target) === m.target.nodeValue) return;
          if (TH.test(m.target.nodeValue)) { textOrig.delete(m.target); doText(m.target); }
        } else if (m.type === 'attributes') {
          doAttrs(m.target);
        } else {
          m.addedNodes.forEach(walk);
        }
      });
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  function stopObserver() { if (observer) { observer.disconnect(); observer = null; } }

  function restore() {
    textOrig.forEach(function (orig, n) { if (n.isConnected) n.nodeValue = orig; });
    textOrig.clear();
    attrOrig.forEach(function (x) { if (x[0].isConnected) x[0].setAttribute(x[1], x[2]); });
    attrOrig = [];
  }

  function apply(next) {
    lang = next;
    document.documentElement.setAttribute('lang', lang);
    // Options without a value would change value when their text is translated: pin them first
    [].forEach.call(document.querySelectorAll('option:not([value])'), function (o) { o.setAttribute('value', o.textContent); });
    if (lang === 'en') { walk(document.body); startObserver(); }
    else { stopObserver(); restore(); }
    listeners.forEach(function (fn) { try { fn(lang); } catch (e) { /* keep others running */ } });
  }

  root.I18N = {
    get: function () { return lang; },
    locale: function () { return lang === 'en' ? 'en-GB' : 'th-TH'; },
    set: function (v) { save(v); apply(v === 'en' ? 'en' : 'th'); },
    init: function () { apply(read()); },
    onChange: function (fn) { listeners.push(fn); },
    t: translate
  };
})(typeof self !== 'undefined' ? self : this);
