/*
 * LPCH RO Workspace — ข้อมูลเนื้อหาทั้งหมดของเว็บไซต์
 *
 * แก้ไขไฟล์นี้ไฟล์เดียวเพื่อเปลี่ยนข้อความ ลิงก์ เอกสาร และผู้ติดต่อ
 * ลิงก์ที่เป็น "#" คือ placeholder — ให้แทนที่ด้วยลิงก์ Google Drive / Docs / Forms จริง
 */
window.SITE = {
  title: "LPCH RO Workspace",
  subtitle: "Radiation Oncology Workspace",
  organization: "หน่วยรังสีรักษา (Radiation Oncology)",
  description:
    "พื้นที่ทำงานกลางสำหรับแพทย์ นักฟิสิกส์การแพทย์ นักรังสีการแพทย์ และพยาบาล " +
    "รวบรวมแนวทางการรักษา เอกสาร แบบฟอร์ม และเครื่องมือที่ใช้งานประจำวันไว้ในที่เดียว",

  announcements: [
    {
      date: "2026-10-01",
      title: "ยินดีต้อนรับสู่ LPCH RO Workspace",
      body: "เว็บไซต์นี้รวบรวมลิงก์และเครื่องมือที่ใช้บ่อยในหน่วยรังสีรักษา หากต้องการเพิ่มหรือแก้ไขเนื้อหา โปรดติดต่อผู้ดูแลเว็บไซต์",
    },
    {
      date: "2026-09-15",
      title: "อัปเดตแนวทาง Dose constraints",
      body: "เพิ่มตารางค่า dose constraints ของอวัยวะสำคัญ (อ้างอิง QUANTEC) สำหรับการรักษาแบบ conventional fractionation",
    },
  ],

  quickLinks: [
    { icon: "📋", label: "RT Request Form", desc: "ใบส่งปรึกษา / สั่งการรักษา", url: "#" },
    { icon: "🗓️", label: "ตารางเวรแพทย์", desc: "On-call & clinic schedule", url: "#/schedule" },
    { icon: "🧮", label: "BED / EQD2", desc: "เครื่องคำนวณขนาดรังสี", url: "#/tools" },
    { icon: "🛡️", label: "Dose constraints", desc: "ค่าจำกัดปริมาณรังสีอวัยวะ", url: "#/constraints" },
    { icon: "📚", label: "Treatment protocols", desc: "แนวทางการรักษาแยกตามโรค", url: "#/protocols" },
    { icon: "📁", label: "เอกสาร & แบบฟอร์ม", desc: "Consent, QA, SOP", url: "#/documents" },
  ],

  protocols: [
    {
      site: "Head & Neck",
      icon: "🗣️",
      items: [
        { label: "Nasopharyngeal carcinoma (NPC)", url: "#" },
        { label: "Oral cavity / Oropharynx", url: "#" },
        { label: "Larynx / Hypopharynx", url: "#" },
        { label: "Contouring atlas (H&N)", url: "#" },
      ],
    },
    {
      site: "Breast",
      icon: "🎗️",
      items: [
        { label: "Whole breast / Post-mastectomy RT", url: "#" },
        { label: "Hypofractionation 40 Gy / 15 fx", url: "#" },
        { label: "Regional nodal irradiation", url: "#" },
      ],
    },
    {
      site: "Gynecology",
      icon: "🌸",
      items: [
        { label: "Cervical cancer: EBRT + Brachytherapy", url: "#" },
        { label: "Endometrial cancer", url: "#" },
        { label: "Brachytherapy (HDR) workflow", url: "#" },
      ],
    },
    {
      site: "Thorax",
      icon: "🫁",
      items: [
        { label: "NSCLC: definitive chemoRT", url: "#" },
        { label: "SBRT lung", url: "#" },
        { label: "Esophageal cancer", url: "#" },
      ],
    },
    {
      site: "GI & GU",
      icon: "🩺",
      items: [
        { label: "Rectal cancer: short-course / long-course", url: "#" },
        { label: "Prostate cancer", url: "#" },
        { label: "Bladder cancer", url: "#" },
      ],
    },
    {
      site: "CNS & Palliative",
      icon: "🧠",
      items: [
        { label: "Glioma / Brain metastases", url: "#" },
        { label: "Bone metastases (8 Gy / 1 fx, 20 Gy / 5 fx)", url: "#" },
        { label: "Spinal cord compression", url: "#" },
      ],
    },
  ],

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

  documents: [
    {
      group: "แบบฟอร์ม (Forms)",
      items: [
        { label: "ใบส่งปรึกษารังสีรักษา (RT consult)", type: "Form", url: "#" },
        { label: "ใบสั่งการรักษา (RT prescription)", type: "Doc", url: "#" },
        { label: "Simulation request", type: "Form", url: "#" },
        { label: "Incident / near-miss report", type: "Form", url: "#" },
      ],
    },
    {
      group: "Consent & Patient education",
      items: [
        { label: "หนังสือยินยอมรับการฉายรังสี", type: "PDF", url: "#" },
        { label: "หนังสือยินยอมใส่แร่ (Brachytherapy)", type: "PDF", url: "#" },
        { label: "คู่มือผู้ป่วยระหว่างฉายรังสี", type: "PDF", url: "#" },
      ],
    },
    {
      group: "Physics & QA",
      items: [
        { label: "Daily / Monthly machine QA log", type: "Sheet", url: "#" },
        { label: "Patient-specific QA (IMRT/VMAT)", type: "Sheet", url: "#" },
        { label: "Plan check list", type: "Doc", url: "#" },
      ],
    },
    {
      group: "SOP & Guidelines",
      items: [
        { label: "SOP: CT simulation", type: "Doc", url: "#" },
        { label: "SOP: Treatment delivery & IGRT", type: "Doc", url: "#" },
        { label: "Peer review / Chart round", type: "Doc", url: "#" },
      ],
    },
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
    { role: "แพทย์รังสีรักษา (Radiation oncologist)", name: "—", phone: "ต่อ —", email: "" },
    { role: "นักฟิสิกส์การแพทย์ (Medical physicist)", name: "—", phone: "ต่อ —", email: "" },
    { role: "นักรังสีการแพทย์ (RTT)", name: "—", phone: "ต่อ —", email: "" },
    { role: "พยาบาลรังสีรักษา", name: "—", phone: "ต่อ —", email: "" },
    { role: "ผู้ดูแลเว็บไซต์", name: "—", phone: "", email: "" },
  ],
};
