/*
 * LPCH RO Workspace — ข้อมูลเนื้อหาทั้งหมดของเว็บไซต์
 *
 * แก้ไขไฟล์นี้ไฟล์เดียวเพื่อเปลี่ยนเมนู ข้อความ ลิงก์ เอกสาร และผู้ติดต่อ
 * ลิงก์ที่เป็น "#" คือ placeholder — ให้แทนที่ด้วยลิงก์ Google Drive / Docs / Forms จริง
 *
 * โครงสร้าง:
 *   nav   — เมนูด้านบน (เรียงตามลำดับ) แต่ละเมนูอ้างถึง key ใน pages; ถ้ามี children จะเป็น dropdown
 *   pages — เนื้อหาแต่ละหน้า: apps = การ์ดเว็บแอป (ปุ่มเปิด), groups = กล่องรายการลิงก์, widgets = ส่วนพิเศษ
 *           (widgets ที่มี: "calculators", "constraints", "schedule", "contacts", "announcements", "quicklinks")
 */
/*
 * เว็บแอป Apps Script อื่นที่ใช้บัญชีเว็บนี้ (sso: true = ลิงก์แนบบัตรผ่าน ssoTicket ใน Code.gs แอปจึงเข้าสู่ระบบให้อัตโนมัติ)
 *   TRS398_APP — หน้า MP › Dosimetry      LINAC_QA_APP — หน้า MP › Machine QA
 */
var TRS398_APP = {
  icon: "📏",
  label: "TRS-398 Output Calibration",
  desc: "คำนวณ absorbed dose to water และ output ของ photon / electron beam ตาม IAEA TRS-398 พร้อมบันทึกผลการวัด",
  note: "เปิดในแท็บใหม่ · เข้าสู่ระบบให้อัตโนมัติด้วยบัญชี LPCH RO Workspace",
  sso: true,
  url: "https://script.google.com/macros/s/AKfycbx76ApGTgQZAnF67ehNR_VN8USNmuA7u9Pt6y_vNZx9Yqt7LFMontdDNXq_YypUIjLD/exec",
};

var LINAC_QA_APP = {
  icon: "⚙️",
  label: "Linac QA",
  desc: "แบบบันทึก Machine QA ของเครื่องเร่งอนุภาค (Daily / Monthly / Annual) บันทึกผลลง Google Sheet พร้อม Dashboard ย้อนหลังและกราฟแนวโน้ม",
  note: "เปิดในแท็บใหม่ · เข้าสู่ระบบให้อัตโนมัติด้วยบัญชี LPCH RO Workspace",
  sso: true,
  url: "https://script.google.com/macros/s/AKfycbzbr7zos77u_DMBvXs-JLKsYiCdLXwuzTL0dQugLDLtVGUq47xYPESaWSeakd8k2WWO/exec",
};

window.SITE = {
  title: "LPCH RO Workspace",
  // หัวเว็บ: ชื่อสองส่วน (ส่วนหลังเป็นสีน้ำเงิน) + ชื่อโรงพยาบาล + โลโก้ (ตามแบบ TRS-398 Output Calibration)
  brand: {
    name: "LPCH",
    accent: "RO Workspace",
    org: "Lampang Cancer Hospital",
    logo: "assets/lpch-emblem.png",
  },
  organization: "หน่วยรังสีรักษา โรงพยาบาลมะเร็งลำปาง",
  tagline: "พื้นที่ทำงานกลาง: ข้อมูลเครื่อง แนวทางการรักษา เอกสาร แบบฟอร์ม เครื่องมือคำนวณ และประกาศข่าวสาร",
  description:
    "พื้นที่ทำงานกลางสำหรับแพทย์รังสีรักษา นักฟิสิกส์การแพทย์ นักรังสีการแพทย์ และพยาบาล " +
    "รวบรวมข้อมูลเครื่องฉายรังสี แนวทางการรักษา เอกสาร แบบฟอร์ม และเครื่องมือที่ใช้งานประจำวันไว้ในที่เดียว",

  nav: [
    { label: "Home", page: "home" },
    { label: "💬 แชท", page: "chat" },
    {
      label: "Machines",
      page: "machines",
      children: [
        { label: "Linac 1", page: "machines/linac-1" },
        { label: "Linac 2", page: "machines/linac-2" },
        { label: "CT Simulator", page: "machines/ct-sim" },
        { label: "HDR Brachytherapy", page: "machines/hdr" },
      ],
    },
    { label: "RTT", page: "rtt" },
    { label: "Nurse", page: "nurse" },
    { label: "RO", page: "ro" },
    {
      label: "MP",
      page: "mp",
      children: [
        { label: "Machine QA", page: "mp/qa" },
        { label: "Dosimetry", page: "mp/dosimetry" },
        { label: "Treatment Planning", page: "mp/planning" },
        { label: "Patient-specific QA", page: "mp/psqa" },
        { label: "Radiation Safety", page: "mp/safety" },
      ],
    },
    { label: "Guideline", page: "guideline" },
  ],

  /*
   * ระบบสมาชิก (ต้องสมัครและเข้าสู่ระบบก่อนใช้งานเว็บไซต์)
   * apiUrl = Web app URL ของ Google Apps Script (โค้ดอยู่ที่ apps-script/Code.gs) เช่น
   *   "https://script.google.com/macros/s/XXXXXXXX/exec"
   * ถ้าเว้นว่าง จะเป็น "โหมดทดลอง" — ข้อมูลสมาชิกเก็บในเบราว์เซอร์นี้เท่านั้น
   */
  auth: {
    apiUrl: "",
  },

  /*
   * ช่องแชทประกาศ / ข่าวสาร (หน้า Home)
   * ถ้าไม่ได้ใส่ firebase.projectId จะทำงานใน "โหมดทดลอง" — ข้อความเก็บในเบราว์เซอร์ของแต่ละเครื่องเท่านั้น
   * ใส่ค่า config จาก Firebase console → Project settings → Your apps → Web app เพื่อให้ทุกคนเห็นข้อความร่วมกัน
   * (วิธีตั้งค่าและ Firestore rules ดูใน README.md)
   */
  chat: {
    roles: ["RO", "MP", "RTT", "Nurse"],
    maxImages: 4,
    pollSeconds: 15,    // หน้าแชท/ข้อความส่วนตัวดึงข้อความใหม่ทุกกี่วินาที
    notifySeconds: 20,  // pop up แจ้งเตือนข้อความใหม่ ตรวจทุกกี่วินาที (ทุกหน้า)
    collection: "announcements",
    firebase: {
      apiKey: "",
      authDomain: "",
      projectId: "",
      appId: "",
    },
  },

  // ข้อความเริ่มต้นของโหมดทดลอง
  announcements: [
    {
      date: "2026-10-01",
      from: "ผู้ดูแลเว็บไซต์",
      role: "Admin",
      to: ["ALL"],
      title: "ยินดีต้อนรับสู่ LPCH RO Workspace",
      body: "เว็บไซต์นี้รวบรวมลิงก์และเครื่องมือที่ใช้บ่อยในหน่วยรังสีรักษา หากต้องการเพิ่มหรือแก้ไขเนื้อหา โปรดติดต่อผู้ดูแลเว็บไซต์",
    },
    {
      date: "2026-09-15",
      from: "ผู้ดูแลเว็บไซต์",
      role: "Admin",
      to: ["RO", "MP"],
      title: "อัปเดต Guideline: Dose constraints",
      body: "เพิ่มตารางค่า dose constraints ของอวัยวะสำคัญ (อ้างอิง QUANTEC) สำหรับการรักษาแบบ conventional fractionation",
    },
  ],

  quickLinks: [
    { icon: "💬", label: "แชทประกาศ", desc: "ประกาศและข่าวสารของหน่วย", url: "#/chat" },
    { icon: "✉️", label: "ข้อความส่วนตัว", desc: "ส่งข้อความถึงสมาชิกแบบตัวต่อตัว", url: "#/inbox" },
    { icon: "⚙️", label: "Machines", desc: "ข้อมูลเครื่อง สถานะ และ QA", url: "#/machines" },
    { icon: "🧑‍⚕️", label: "RTT", desc: "งานนักรังสีการแพทย์", url: "#/rtt" },
    { icon: "💉", label: "Nurse", desc: "งานพยาบาลรังสีรักษา", url: "#/nurse" },
    { icon: "🩺", label: "RO", desc: "แพทย์รังสีรักษา & เครื่องคำนวณ", url: "#/ro" },
    { icon: "📐", label: "MP", desc: "ฟิสิกส์การแพทย์", url: "#/mp" },
    { icon: "📚", label: "Guideline", desc: "Protocols & dose constraints", url: "#/guideline" },
  ],

  pages: {
    home: {
      widgets: ["intro", "quicklinks", "contacts"],
    },

    // แชทประกาศ: แท็บแยก เต็มจอแบบแอปแชท (bare = ไม่มีหัวข้อหน้า/breadcrumb)
    chat: {
      title: "แชทประกาศ",
      bare: true,
      widgets: ["announcements"],
    },

    /* ---------------- Machines ---------------- */
    machines: {
      title: "Machines",
      lead: "เครื่องฉายรังสีและอุปกรณ์ในหน่วยรังสีรักษา",
      widgets: ["subpages"],
    },
    "machines/linac-1": {
      title: "Linac 1",
      lead: "Linear accelerator — ข้อมูลเครื่อง คู่มือ และบันทึก QA",
      specs: [
        ["Model", "—"],
        ["Photon energies", "—"],
        ["Electron energies", "—"],
        ["MLC", "—"],
        ["IGRT", "—"],
        ["Techniques", "3D-CRT / IMRT / VMAT"],
      ],
      groups: [
        { title: "Daily operation", icon: "📋", items: [
          { label: "Morning check / Warm-up checklist", type: "Doc", url: "#" },
          { label: "Daily QA log", type: "Sheet", url: "#" },
          { label: "Downtime / Fault report", type: "Form", url: "#" },
        ] },
        { title: "Manuals", icon: "📘", items: [
          { label: "User manual", type: "PDF", url: "#" },
          { label: "Emergency procedure", type: "PDF", url: "#" },
        ] },
      ],
    },
    "machines/linac-2": {
      title: "Linac 2",
      lead: "Linear accelerator — ข้อมูลเครื่อง คู่มือ และบันทึก QA",
      specs: [
        ["Model", "—"],
        ["Photon energies", "—"],
        ["Electron energies", "—"],
        ["MLC", "—"],
        ["IGRT", "—"],
        ["Techniques", "3D-CRT / IMRT / VMAT"],
      ],
      groups: [
        { title: "Daily operation", icon: "📋", items: [
          { label: "Morning check / Warm-up checklist", type: "Doc", url: "#" },
          { label: "Daily QA log", type: "Sheet", url: "#" },
          { label: "Downtime / Fault report", type: "Form", url: "#" },
        ] },
        { title: "Manuals", icon: "📘", items: [
          { label: "User manual", type: "PDF", url: "#" },
          { label: "Emergency procedure", type: "PDF", url: "#" },
        ] },
      ],
    },
    "machines/ct-sim": {
      title: "CT Simulator",
      lead: "CT simulation — protocol การสแกนและการจัดท่าผู้ป่วย",
      specs: [
        ["Model", "—"],
        ["Bore size", "—"],
        ["Laser system", "—"],
        ["4D-CT", "—"],
      ],
      groups: [
        { title: "Scan protocols", icon: "🖥️", items: [
          { label: "Head & Neck", type: "Doc", url: "#" },
          { label: "Thorax / Breast", type: "Doc", url: "#" },
          { label: "Abdomen / Pelvis", type: "Doc", url: "#" },
        ] },
        { title: "Immobilization", icon: "🧷", items: [
          { label: "Thermoplastic mask", type: "Doc", url: "#" },
          { label: "Breast board / Vac-lok", type: "Doc", url: "#" },
        ] },
      ],
    },
    "machines/hdr": {
      title: "HDR Brachytherapy",
      lead: "High dose rate afterloader — workflow และการเปลี่ยนแหล่งกำเนิดรังสี",
      specs: [
        ["Afterloader", "—"],
        ["Source", "Ir-192"],
        ["Source exchange", "—"],
        ["Applicators", "Tandem & ovoid / ring / cylinder"],
      ],
      groups: [
        { title: "Procedure", icon: "🩻", items: [
          { label: "HDR workflow", type: "Doc", url: "#" },
          { label: "Applicator commissioning", type: "Doc", url: "#" },
          { label: "Emergency (stuck source) procedure", type: "PDF", url: "#" },
        ] },
        { title: "QA", icon: "✅", items: [
          { label: "Daily HDR QA", type: "Sheet", url: "#" },
          { label: "Source calibration", type: "Sheet", url: "#" },
        ] },
      ],
    },

    /* ---------------- Roles ---------------- */
    rtt: {
      title: "RTT",
      lead: "นักรังสีการแพทย์ (Radiation Therapy Technologist)",
      groups: [
        { title: "SOP", icon: "📋", items: [
          { label: "SOP: CT simulation", type: "Doc", url: "#" },
          { label: "SOP: Treatment delivery", type: "Doc", url: "#" },
          { label: "SOP: IGRT (CBCT / kV-kV)", type: "Doc", url: "#" },
          { label: "Patient identification & time-out", type: "Doc", url: "#" },
        ] },
        { title: "ตารางงาน", icon: "🗓️", items: [
          { label: "ตารางฉายรังสีประจำวัน", type: "Sheet", url: "#" },
          { label: "ตารางเวร RTT", type: "Sheet", url: "#" },
          { label: "ตารางนัด CT simulation", type: "Sheet", url: "#" },
        ] },
        { title: "แบบฟอร์ม", icon: "📝", items: [
          { label: "Setup note / Treatment record", type: "Form", url: "#" },
          { label: "Incident / near-miss report", type: "Form", url: "#" },
        ] },
      ],
    },
    nurse: {
      title: "Nurse",
      lead: "พยาบาลรังสีรักษา — การดูแลผู้ป่วยระหว่างและหลังการฉายรังสี",
      groups: [
        { title: "Patient education", icon: "📖", items: [
          { label: "คู่มือผู้ป่วยระหว่างฉายรังสี", type: "PDF", url: "#" },
          { label: "การดูแลผิวหนังบริเวณที่ฉายรังสี", type: "PDF", url: "#" },
          { label: "การดูแลช่องปาก (Head & Neck)", type: "PDF", url: "#" },
          { label: "คำแนะนำก่อน-หลังใส่แร่", type: "PDF", url: "#" },
        ] },
        { title: "Consent", icon: "✍️", items: [
          { label: "หนังสือยินยอมรับการฉายรังสี", type: "PDF", url: "#" },
          { label: "หนังสือยินยอมใส่แร่ (Brachytherapy)", type: "PDF", url: "#" },
        ] },
        { title: "Side-effect management", icon: "🩹", items: [
          { label: "Radiation dermatitis", type: "Doc", url: "#" },
          { label: "Oral mucositis", type: "Doc", url: "#" },
          { label: "Weekly on-treatment assessment", type: "Form", url: "#" },
        ] },
      ],
    },
    ro: {
      title: "RO",
      lead: "แพทย์รังสีรักษา (Radiation Oncologist)",
      groups: [
        { title: "Request & Prescription", icon: "📋", items: [
          { label: "ใบส่งปรึกษารังสีรักษา (RT consult)", type: "Form", url: "#" },
          { label: "Simulation request", type: "Form", url: "#" },
          { label: "RT prescription", type: "Doc", url: "#" },
        ] },
        { title: "Academic", icon: "🎓", items: [
          { label: "Chart round / Peer review", type: "Doc", url: "#" },
          { label: "Tumor board", type: "Doc", url: "#" },
          { label: "Journal club", type: "Doc", url: "#" },
        ] },
      ],
      widgets: ["calculators", "schedule"],
    },

    /* ---------------- MP ---------------- */
    mp: {
      title: "MP",
      lead: "นักฟิสิกส์การแพทย์ (Medical Physicist)",
      widgets: ["subpages"],
    },
    "mp/qa": {
      title: "Machine QA",
      lead: "การควบคุมคุณภาพเครื่องฉายรังสี (อ้างอิง AAPM TG-142)",
      apps: [LINAC_QA_APP],
    },
    "mp/dosimetry": {
      title: "Dosimetry",
      lead: "การวัดปริมาณรังสีและสอบเทียบ output ของเครื่องฉายรังสี (IAEA TRS-398)",
      // apps = เว็บแอปที่ใช้งานประจำ แสดงเป็นการ์ดใหญ่พร้อมปุ่มเปิด (เปิดในแท็บใหม่)
      apps: [TRS398_APP],
    },
    "mp/planning": {
      title: "Treatment Planning",
      lead: "การวางแผนการรักษาและการตรวจสอบแผน",
      groups: [
        { title: "Planning", icon: "🗺️", items: [
          { label: "Planning guideline (3D / IMRT / VMAT)", type: "Doc", url: "#" },
          { label: "Plan naming & structure convention", type: "Doc", url: "#" },
          { label: "Plan check list", type: "Doc", url: "#" },
        ] },
        { title: "TPS", icon: "💻", items: [
          { label: "TPS commissioning report", type: "PDF", url: "#" },
          { label: "Beam data", type: "Sheet", url: "#" },
        ] },
      ],
    },
    "mp/psqa": {
      title: "Patient-specific QA",
      lead: "การตรวจสอบแผนการรักษาก่อนฉายจริง (IMRT/VMAT)",
      groups: [
        { title: "PSQA", icon: "🎯", items: [
          { label: "PSQA log", type: "Sheet", url: "#" },
          { label: "Gamma criteria & action level", type: "Doc", url: "#" },
          { label: "Independent MU check", type: "Sheet", url: "#" },
        ] },
      ],
    },
    "mp/safety": {
      title: "Radiation Safety",
      lead: "ความปลอดภัยทางรังสี",
      groups: [
        { title: "Radiation protection", icon: "☢️", items: [
          { label: "Personal dosimeter record", type: "Sheet", url: "#" },
          { label: "Area survey", type: "Sheet", url: "#" },
          { label: "Radiation emergency plan", type: "PDF", url: "#" },
        ] },
      ],
    },

    /* ---------------- Guideline ---------------- */
    guideline: {
      title: "Guideline",
      lead: "แนวทางการรักษาแยกตามตำแหน่งโรค และค่าจำกัดปริมาณรังสีอวัยวะ",
      groups: [
        { title: "Head & Neck", icon: "🗣️", items: [
          { label: "Nasopharyngeal carcinoma (NPC)", url: "#" },
          { label: "Oral cavity / Oropharynx", url: "#" },
          { label: "Larynx / Hypopharynx", url: "#" },
          { label: "Contouring atlas (H&N)", url: "#" },
        ] },
        { title: "Breast", icon: "🎗️", items: [
          { label: "Whole breast / Post-mastectomy RT", url: "#" },
          { label: "Hypofractionation 40 Gy / 15 fx", url: "#" },
          { label: "Regional nodal irradiation", url: "#" },
        ] },
        { title: "Gynecology", icon: "🌸", items: [
          { label: "Cervical cancer: EBRT + Brachytherapy", url: "#" },
          { label: "Endometrial cancer", url: "#" },
        ] },
        { title: "Thorax", icon: "🫁", items: [
          { label: "NSCLC: definitive chemoRT", url: "#" },
          { label: "SBRT lung", url: "#" },
          { label: "Esophageal cancer", url: "#" },
        ] },
        { title: "GI & GU", icon: "🩺", items: [
          { label: "Rectal cancer: short-course / long-course", url: "#" },
          { label: "Prostate cancer", url: "#" },
          { label: "Bladder cancer", url: "#" },
        ] },
        { title: "CNS & Palliative", icon: "🧠", items: [
          { label: "Glioma / Brain metastases", url: "#" },
          { label: "Bone metastases (8 Gy / 1 fx, 20 Gy / 5 fx)", url: "#" },
          { label: "Spinal cord compression", url: "#" },
        ] },
      ],
      widgets: ["constraints"],
    },
  },

  // ค่าอ้างอิงจาก QUANTEC (Int J Radiat Oncol Biol Phys 2010) สำหรับ conventional fractionation (1.8–2 Gy/fx)
  constraints: [
    { region: "CNS", organ: "Spinal cord", constraint: "Dmax < 45–50 Gy", endpoint: "Myelopathy" },
    { region: "CNS", organ: "Brainstem", constraint: "Dmax < 54 Gy", endpoint: "Neuropathy / necrosis" },
    { region: "CNS", organ: "Optic nerve / Chiasm", constraint: "Dmax < 55 Gy", endpoint: "Optic neuropathy" },
    { region: "Head & Neck", organ: "Parotid (bilateral)", constraint: "Mean < 25 Gy", endpoint: "Xerostomia (<25% function)" },
    { region: "Head & Neck", organ: "Parotid (unilateral)", constraint: "Mean < 20 Gy", endpoint: "Xerostomia" },
    { region: "Head & Neck", organ: "Cochlea", constraint: "Mean ≤ 45 Gy", endpoint: "Sensorineural hearing loss" },
    { region: "Head & Neck", organ: "Larynx", constraint: "Mean < 44 Gy", endpoint: "Edema" },
    { region: "Thorax", organ: "Lung (total − GTV)", constraint: "V20 ≤ 30–35%, Mean ≤ 20 Gy", endpoint: "Pneumonitis" },
    { region: "Thorax", organ: "Heart (pericardium)", constraint: "V25 < 10%", endpoint: "Long-term cardiac mortality" },
    { region: "Thorax", organ: "Esophagus", constraint: "Mean < 34 Gy", endpoint: "Esophagitis ≥ G3" },
    { region: "Abdomen", organ: "Liver (normal)", constraint: "Mean < 30–32 Gy", endpoint: "RILD" },
    { region: "Abdomen", organ: "Kidneys (bilateral)", constraint: "Mean < 15–18 Gy, V20 < 32%", endpoint: "Renal dysfunction" },
    { region: "Abdomen", organ: "Small bowel (loops)", constraint: "V15 < 120 cc", endpoint: "Acute toxicity ≥ G3" },
    { region: "Abdomen", organ: "Small bowel (peritoneal cavity)", constraint: "V45 < 195 cc", endpoint: "Acute toxicity ≥ G3" },
    { region: "Pelvis", organ: "Rectum", constraint: "V50 < 50%, V60 < 35%, V65 < 25%, V70 < 20%, V75 < 15%", endpoint: "Late rectal toxicity ≥ G2" },
    { region: "Pelvis", organ: "Bladder", constraint: "V65 ≤ 50%, V70 ≤ 35%, V75 ≤ 25%, V80 ≤ 15%", endpoint: "Late toxicity ≥ G3" },
    { region: "Pelvis", organ: "Femoral heads", constraint: "V50 < 5%", endpoint: "Necrosis (RTOG)" },
  ],

  schedule: {
    // ใส่ลิงก์ embed ของ Google Calendar (Settings → Integrate calendar → Embed code → src)
    calendarEmbedUrl: "",
    items: [
      { day: "จันทร์", time: "08:00–09:00", title: "Chart round / Peer review" },
      { day: "อังคาร", time: "13:00–16:00", title: "Brachytherapy" },
      { day: "พุธ", time: "08:00–09:00", title: "Tumor board (Head & Neck)" },
      { day: "พฤหัสบดี", time: "13:00–14:00", title: "Physics–Physician plan review" },
      { day: "ศุกร์", time: "08:00–09:00", title: "Journal club / Topic review" },
    ],
  },

  contacts: [
    { role: "แพทย์รังสีรักษา (RO)", name: "—", phone: "ต่อ —", email: "" },
    { role: "นักฟิสิกส์การแพทย์ (MP)", name: "—", phone: "ต่อ —", email: "" },
    { role: "นักรังสีการแพทย์ (RTT)", name: "—", phone: "ต่อ —", email: "" },
    { role: "พยาบาลรังสีรักษา (Nurse)", name: "—", phone: "ต่อ —", email: "" },
  ],
};
