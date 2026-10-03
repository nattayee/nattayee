/*
 * โครงสร้างแบบฟอร์ม Linac QA
 * แก้ไขไฟล์นี้ไฟล์เดียวเพื่อเพิ่ม/ลบ/แก้คำถามให้ตรงกับ Google Form ต้นฉบับ
 *
 * ชนิดคำถาม (type):
 *   text      ข้อความสั้น
 *   textarea  ข้อความยาว
 *   date      วันที่
 *   time      เวลา
 *   number    ตัวเลข (ไม่มีเกณฑ์)
 *   select    dropdown           -> options: [...]
 *   radio     เลือกได้ 1 ข้อ        -> options: [...]
 *   checkbox  เลือกได้หลายข้อ       -> options: [...]
 *   passfail  ผ่าน / ไม่ผ่าน / ไม่ได้ทดสอบ
 *   tolerance ค่าที่วัดได้ เทียบกับ baseline -> ตัดสินผ่าน/ไม่ผ่านอัตโนมัติ
 *             baseline: ค่าอ้างอิง, tol: เกณฑ์ยอมรับ, mode: 'abs' (หน่วยเดียวกับค่า) หรือ 'pct' (% จาก baseline)
 *
 * required: true = ต้องกรอก
 */
window.QA_FORM = {
  title: 'Linac Daily QA',
  subtitle: 'แบบบันทึกการตรวจสอบคุณภาพเครื่องเร่งอนุภาคประจำวัน (อ้างอิง AAPM TG-142)',
  sections: [
    {
      id: 'general',
      title: 'ข้อมูลทั่วไป',
      questions: [
        { id: 'date', label: 'วันที่ตรวจ', type: 'date', required: true },
        { id: 'time', label: 'เวลา', type: 'time' },
        { id: 'machine', label: 'เครื่อง', type: 'select', required: true,
          options: ['Linac 1', 'Linac 2', 'Linac 3'] },
        { id: 'physicist', label: 'ผู้ตรวจ (นักฟิสิกส์การแพทย์ / นักรังสีการแพทย์)', type: 'text', required: true },
        { id: 'temperature', label: 'อุณหภูมิห้อง (°C)', type: 'number', step: '0.1' },
        { id: 'pressure', label: 'ความดันบรรยากาศ (hPa)', type: 'number', step: '0.1' }
      ]
    },
    {
      id: 'safety',
      title: 'Safety',
      questions: [
        { id: 'door_interlock', label: 'Door interlock (beam off)', type: 'passfail', required: true },
        { id: 'door_closing', label: 'Door closing safety', type: 'passfail', required: true },
        { id: 'av_monitor', label: 'Audiovisual monitor(s)', type: 'passfail', required: true },
        { id: 'beam_on_indicator', label: 'Beam-on indicator', type: 'passfail', required: true },
        { id: 'radiation_monitor', label: 'Radiation area monitor', type: 'passfail', required: true },
        { id: 'emergency_off', label: 'Emergency off / Key switch', type: 'passfail' },
        { id: 'collision_interlock', label: 'Collision interlock (Stereotactic / couch)', type: 'passfail' }
      ]
    },
    {
      id: 'mechanical',
      title: 'Mechanical',
      questions: [
        { id: 'laser', label: 'Laser localization (mm)', type: 'tolerance', baseline: 0, tol: 2, mode: 'abs', unit: 'mm', required: true },
        { id: 'odi', label: 'Optical distance indicator (ODI) @ isocenter (mm)', type: 'tolerance', baseline: 0, tol: 2, mode: 'abs', unit: 'mm', required: true },
        { id: 'jaw_10x10', label: 'Collimator size indicator 10×10 cm² (mm)', type: 'tolerance', baseline: 0, tol: 2, mode: 'abs', unit: 'mm', required: true },
        { id: 'jaw_20x20', label: 'Collimator size indicator 20×20 cm² (mm)', type: 'tolerance', baseline: 0, tol: 2, mode: 'abs', unit: 'mm' }
      ]
    },
    {
      id: 'dosimetry',
      title: 'Dosimetry — Output constancy',
      description: 'กรอกค่าที่อ่านได้จากอุปกรณ์ (เช่น Daily QA device) ระบบจะคำนวณ % ความต่างจาก baseline ให้อัตโนมัติ (เกณฑ์ ±3%)',
      questions: [
        { id: 'out_6x', label: '6 MV', type: 'tolerance', baseline: 100, tol: 3, mode: 'pct', required: true },
        { id: 'out_10x', label: '10 MV', type: 'tolerance', baseline: 100, tol: 3, mode: 'pct' },
        { id: 'out_6fff', label: '6 MV FFF', type: 'tolerance', baseline: 100, tol: 3, mode: 'pct' },
        { id: 'out_10fff', label: '10 MV FFF', type: 'tolerance', baseline: 100, tol: 3, mode: 'pct' },
        { id: 'out_6e', label: '6 MeV', type: 'tolerance', baseline: 100, tol: 3, mode: 'pct' },
        { id: 'out_9e', label: '9 MeV', type: 'tolerance', baseline: 100, tol: 3, mode: 'pct' },
        { id: 'out_12e', label: '12 MeV', type: 'tolerance', baseline: 100, tol: 3, mode: 'pct' },
        { id: 'out_16e', label: '16 MeV', type: 'tolerance', baseline: 100, tol: 3, mode: 'pct' }
      ]
    },
    {
      id: 'imaging',
      title: 'Imaging (IGRT)',
      questions: [
        { id: 'kv_mv_collision', label: 'kV / MV imaging collision interlocks', type: 'passfail' },
        { id: 'img_positioning', label: 'Positioning / repositioning (mm)', type: 'tolerance', baseline: 0, tol: 2, mode: 'abs', unit: 'mm' },
        { id: 'img_coincidence', label: 'Imaging & treatment coordinate coincidence (mm)', type: 'tolerance', baseline: 0, tol: 2, mode: 'abs', unit: 'mm' },
        { id: 'imaging_modes', label: 'โหมดที่ทดสอบ', type: 'checkbox',
          options: ['kV 2D', 'MV EPID', 'CBCT', 'Surface guided (SGRT)'] }
      ]
    },
    {
      id: 'summary',
      title: 'สรุป',
      questions: [
        { id: 'machine_status', label: 'สถานะเครื่อง', type: 'radio', required: true,
          options: ['พร้อมใช้งานรักษา', 'ใช้งานได้แบบมีเงื่อนไข', 'งดใช้งาน / แจ้งซ่อม'] },
        { id: 'remarks', label: 'หมายเหตุ / การแก้ไข', type: 'textarea' }
      ]
    }
  ]
};
