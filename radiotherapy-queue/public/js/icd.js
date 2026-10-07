// รายการรหัสสำหรับการนัดผู้ป่วยรังสีรักษา
// - ICD-10 (WHO; รหัสกลุ่มเนื้องอกตรงกับ ICD-10-TM) — การวินิจฉัย
// - ICD-9-CM Volume 3 หมวด 92.2x–92.4x — หัตถการรังสีรักษา
// แต่ละรายการ: [รหัส, ชื่อภาษาอังกฤษ, คำค้นภาษาไทย (ไม่บังคับ)]

export const NAME_PREFIXES = [
  { id: 'นาย', sex: 'ชาย' },
  { id: 'นาง', sex: 'หญิง' },
  { id: 'นางสาว', sex: 'หญิง' },
  { id: 'ด.ช.', sex: 'ชาย' },
  { id: 'ด.ญ.', sex: 'หญิง' },
  { id: 'พระภิกษุ', sex: 'ชาย' },
];

// ชื่อเต็มสำหรับแสดงผล: คำนำหน้าสั้นติดกับชื่อ (นายสมชาย) คำนำหน้ายาวเว้นวรรค (พระภิกษุ สมชาย)
export function composeName(prefix, firstName, lastName) {
  const p = (prefix || '').trim();
  const f = (firstName || '').trim();
  const l = (lastName || '').trim();
  const glue = !p || ['นาย', 'นาง', 'นางสาว', 'ด.ช.', 'ด.ญ.'].includes(p) ? '' : ' ';
  return `${p}${glue}${f}${l ? ` ${l}` : ''}`.trim();
}

export const ICD10 = [
  // ---- ศีรษะและลำคอ ----
  ['C00.9', 'Malignant neoplasm of lip, unspecified', 'มะเร็งริมฝีปาก'],
  ['C01', 'Malignant neoplasm of base of tongue', 'มะเร็งโคนลิ้น'],
  ['C02.0', 'Malignant neoplasm of dorsal surface of tongue', 'มะเร็งลิ้น'],
  ['C02.1', 'Malignant neoplasm of border of tongue', 'มะเร็งลิ้น'],
  ['C02.2', 'Malignant neoplasm of ventral surface of tongue', 'มะเร็งลิ้น'],
  ['C02.9', 'Malignant neoplasm of tongue, unspecified', 'มะเร็งลิ้น'],
  ['C03.9', 'Malignant neoplasm of gum, unspecified', 'มะเร็งเหงือก'],
  ['C04.9', 'Malignant neoplasm of floor of mouth, unspecified', 'มะเร็งพื้นปาก'],
  ['C05.0', 'Malignant neoplasm of hard palate', 'มะเร็งเพดานแข็ง'],
  ['C05.1', 'Malignant neoplasm of soft palate', 'มะเร็งเพดานอ่อน'],
  ['C06.0', 'Malignant neoplasm of cheek mucosa', 'มะเร็งกระพุ้งแก้ม'],
  ['C06.9', 'Malignant neoplasm of mouth, unspecified', 'มะเร็งช่องปาก'],
  ['C07', 'Malignant neoplasm of parotid gland', 'มะเร็งต่อมน้ำลายพาโรติด'],
  ['C08.0', 'Malignant neoplasm of submandibular gland', 'มะเร็งต่อมน้ำลายใต้ขากรรไกร'],
  ['C09.9', 'Malignant neoplasm of tonsil, unspecified', 'มะเร็งต่อมทอนซิล'],
  ['C10.9', 'Malignant neoplasm of oropharynx, unspecified', 'มะเร็งคอหอยส่วนปาก'],
  ['C11.0', 'Malignant neoplasm of superior wall of nasopharynx', 'มะเร็งโพรงหลังจมูก'],
  ['C11.1', 'Malignant neoplasm of posterior wall of nasopharynx', 'มะเร็งโพรงหลังจมูก'],
  ['C11.2', 'Malignant neoplasm of lateral wall of nasopharynx', 'มะเร็งโพรงหลังจมูก'],
  ['C11.3', 'Malignant neoplasm of anterior wall of nasopharynx', 'มะเร็งโพรงหลังจมูก'],
  ['C11.8', 'Malignant neoplasm of overlapping lesion of nasopharynx', 'มะเร็งโพรงหลังจมูก'],
  ['C11.9', 'Malignant neoplasm of nasopharynx, unspecified', 'มะเร็งโพรงหลังจมูก NPC'],
  ['C12', 'Malignant neoplasm of piriform sinus', 'มะเร็งคอหอยส่วนล่าง'],
  ['C13.9', 'Malignant neoplasm of hypopharynx, unspecified', 'มะเร็งคอหอยส่วนล่าง'],
  ['C14.0', 'Malignant neoplasm of pharynx, unspecified', 'มะเร็งคอหอย'],
  ['C30.0', 'Malignant neoplasm of nasal cavity', 'มะเร็งโพรงจมูก'],
  ['C31.0', 'Malignant neoplasm of maxillary sinus', 'มะเร็งไซนัส'],
  ['C31.9', 'Malignant neoplasm of accessory sinus, unspecified', 'มะเร็งไซนัส'],
  ['C32.0', 'Malignant neoplasm of glottis', 'มะเร็งกล่องเสียง'],
  ['C32.1', 'Malignant neoplasm of supraglottis', 'มะเร็งกล่องเสียง'],
  ['C32.2', 'Malignant neoplasm of subglottis', 'มะเร็งกล่องเสียง'],
  ['C32.9', 'Malignant neoplasm of larynx, unspecified', 'มะเร็งกล่องเสียง'],
  ['C73', 'Malignant neoplasm of thyroid gland', 'มะเร็งต่อมไทรอยด์'],
  ['C76.0', 'Malignant neoplasm of head, face and neck', 'มะเร็งศีรษะและลำคอ'],

  // ---- ทางเดินอาหาร ----
  ['C15.0', 'Malignant neoplasm of cervical part of oesophagus', 'มะเร็งหลอดอาหาร'],
  ['C15.1', 'Malignant neoplasm of thoracic part of oesophagus', 'มะเร็งหลอดอาหาร'],
  ['C15.2', 'Malignant neoplasm of abdominal part of oesophagus', 'มะเร็งหลอดอาหาร'],
  ['C15.3', 'Malignant neoplasm of upper third of oesophagus', 'มะเร็งหลอดอาหาร'],
  ['C15.4', 'Malignant neoplasm of middle third of oesophagus', 'มะเร็งหลอดอาหาร'],
  ['C15.5', 'Malignant neoplasm of lower third of oesophagus', 'มะเร็งหลอดอาหาร'],
  ['C15.9', 'Malignant neoplasm of oesophagus, unspecified', 'มะเร็งหลอดอาหาร'],
  ['C16.9', 'Malignant neoplasm of stomach, unspecified', 'มะเร็งกระเพาะอาหาร'],
  ['C17.9', 'Malignant neoplasm of small intestine, unspecified', 'มะเร็งลำไส้เล็ก'],
  ['C18.9', 'Malignant neoplasm of colon, unspecified', 'มะเร็งลำไส้ใหญ่'],
  ['C19', 'Malignant neoplasm of rectosigmoid junction', 'มะเร็งลำไส้ใหญ่ส่วนซิกมอยด์'],
  ['C20', 'Malignant neoplasm of rectum', 'มะเร็งลำไส้ตรง ทวารหนัก'],
  ['C21.0', 'Malignant neoplasm of anus, unspecified', 'มะเร็งทวารหนัก'],
  ['C21.1', 'Malignant neoplasm of anal canal', 'มะเร็งช่องทวารหนัก'],
  ['C22.0', 'Liver cell carcinoma', 'มะเร็งตับ HCC'],
  ['C22.1', 'Intrahepatic bile duct carcinoma', 'มะเร็งท่อน้ำดีในตับ'],
  ['C23', 'Malignant neoplasm of gallbladder', 'มะเร็งถุงน้ำดี'],
  ['C24.0', 'Malignant neoplasm of extrahepatic bile duct', 'มะเร็งท่อน้ำดี'],
  ['C25.9', 'Malignant neoplasm of pancreas, unspecified', 'มะเร็งตับอ่อน'],

  // ---- ทรวงอก ----
  ['C33', 'Malignant neoplasm of trachea', 'มะเร็งหลอดลมใหญ่'],
  ['C34.0', 'Malignant neoplasm of main bronchus', 'มะเร็งปอด'],
  ['C34.1', 'Malignant neoplasm of upper lobe, bronchus or lung', 'มะเร็งปอด'],
  ['C34.2', 'Malignant neoplasm of middle lobe, bronchus or lung', 'มะเร็งปอด'],
  ['C34.3', 'Malignant neoplasm of lower lobe, bronchus or lung', 'มะเร็งปอด'],
  ['C34.8', 'Malignant neoplasm of overlapping lesion of bronchus and lung', 'มะเร็งปอด'],
  ['C34.9', 'Malignant neoplasm of bronchus or lung, unspecified', 'มะเร็งปอด'],
  ['C37', 'Malignant neoplasm of thymus', 'มะเร็งต่อมไทมัส'],
  ['C38.1', 'Malignant neoplasm of anterior mediastinum', 'มะเร็งช่องกลางทรวงอก'],
  ['C45.0', 'Mesothelioma of pleura', 'มะเร็งเยื่อหุ้มปอด'],

  // ---- เต้านม ----
  ['C50.0', 'Malignant neoplasm of nipple and areola', 'มะเร็งเต้านม'],
  ['C50.1', 'Malignant neoplasm of central portion of breast', 'มะเร็งเต้านม'],
  ['C50.2', 'Malignant neoplasm of upper-inner quadrant of breast', 'มะเร็งเต้านม'],
  ['C50.3', 'Malignant neoplasm of lower-inner quadrant of breast', 'มะเร็งเต้านม'],
  ['C50.4', 'Malignant neoplasm of upper-outer quadrant of breast', 'มะเร็งเต้านม'],
  ['C50.5', 'Malignant neoplasm of lower-outer quadrant of breast', 'มะเร็งเต้านม'],
  ['C50.6', 'Malignant neoplasm of axillary tail of breast', 'มะเร็งเต้านม'],
  ['C50.8', 'Malignant neoplasm of overlapping lesion of breast', 'มะเร็งเต้านม'],
  ['C50.9', 'Malignant neoplasm of breast, unspecified', 'มะเร็งเต้านม'],
  ['D05.0', 'Lobular carcinoma in situ of breast', 'มะเร็งเต้านมระยะก่อนลุกลาม LCIS'],
  ['D05.1', 'Intraductal carcinoma in situ of breast', 'มะเร็งเต้านมระยะก่อนลุกลาม DCIS'],

  // ---- นรีเวช ----
  ['C51.9', 'Malignant neoplasm of vulva, unspecified', 'มะเร็งปากช่องคลอด'],
  ['C52', 'Malignant neoplasm of vagina', 'มะเร็งช่องคลอด'],
  ['C53.0', 'Malignant neoplasm of endocervix', 'มะเร็งปากมดลูก'],
  ['C53.1', 'Malignant neoplasm of exocervix', 'มะเร็งปากมดลูก'],
  ['C53.8', 'Malignant neoplasm of overlapping lesion of cervix uteri', 'มะเร็งปากมดลูก'],
  ['C53.9', 'Malignant neoplasm of cervix uteri, unspecified', 'มะเร็งปากมดลูก'],
  ['C54.1', 'Malignant neoplasm of endometrium', 'มะเร็งเยื่อบุโพรงมดลูก'],
  ['C54.9', 'Malignant neoplasm of corpus uteri, unspecified', 'มะเร็งตัวมดลูก'],
  ['C55', 'Malignant neoplasm of uterus, part unspecified', 'มะเร็งมดลูก'],
  ['C56', 'Malignant neoplasm of ovary', 'มะเร็งรังไข่'],
  ['C58', 'Malignant neoplasm of placenta', 'มะเร็งรก'],
  ['D06.9', 'Carcinoma in situ of cervix, unspecified', 'มะเร็งปากมดลูกระยะก่อนลุกลาม'],

  // ---- ทางเดินปัสสาวะและอวัยวะสืบพันธุ์ชาย ----
  ['C60.9', 'Malignant neoplasm of penis, unspecified', 'มะเร็งองคชาต'],
  ['C61', 'Malignant neoplasm of prostate', 'มะเร็งต่อมลูกหมาก'],
  ['C62.9', 'Malignant neoplasm of testis, unspecified', 'มะเร็งอัณฑะ'],
  ['C64', 'Malignant neoplasm of kidney, except renal pelvis', 'มะเร็งไต'],
  ['C65', 'Malignant neoplasm of renal pelvis', 'มะเร็งกรวยไต'],
  ['C66', 'Malignant neoplasm of ureter', 'มะเร็งท่อไต'],
  ['C67.9', 'Malignant neoplasm of bladder, unspecified', 'มะเร็งกระเพาะปัสสาวะ'],

  // ---- ระบบประสาท ตา ต่อมไร้ท่อ ----
  ['C69.2', 'Malignant neoplasm of retina', 'มะเร็งจอประสาทตา'],
  ['C69.6', 'Malignant neoplasm of orbit', 'มะเร็งเบ้าตา'],
  ['C70.0', 'Malignant neoplasm of cerebral meninges', 'มะเร็งเยื่อหุ้มสมอง'],
  ['C71.0', 'Malignant neoplasm of cerebrum, except lobes and ventricles', 'มะเร็งสมอง'],
  ['C71.1', 'Malignant neoplasm of frontal lobe', 'มะเร็งสมอง'],
  ['C71.2', 'Malignant neoplasm of temporal lobe', 'มะเร็งสมอง'],
  ['C71.3', 'Malignant neoplasm of parietal lobe', 'มะเร็งสมอง'],
  ['C71.4', 'Malignant neoplasm of occipital lobe', 'มะเร็งสมอง'],
  ['C71.5', 'Malignant neoplasm of cerebral ventricle', 'มะเร็งสมอง'],
  ['C71.6', 'Malignant neoplasm of cerebellum', 'มะเร็งสมองน้อย'],
  ['C71.7', 'Malignant neoplasm of brain stem', 'มะเร็งก้านสมอง'],
  ['C71.8', 'Malignant neoplasm of overlapping lesion of brain', 'มะเร็งสมอง'],
  ['C71.9', 'Malignant neoplasm of brain, unspecified', 'มะเร็งสมอง'],
  ['C72.0', 'Malignant neoplasm of spinal cord', 'มะเร็งไขสันหลัง'],
  ['C74.9', 'Malignant neoplasm of adrenal gland, unspecified', 'มะเร็งต่อมหมวกไต'],
  ['C75.1', 'Malignant neoplasm of pituitary gland', 'มะเร็งต่อมใต้สมอง'],

  // ---- กระดูก ผิวหนัง เนื้อเยื่ออ่อน ----
  ['C40.9', 'Malignant neoplasm of bone and articular cartilage of limb, unspecified', 'มะเร็งกระดูก'],
  ['C41.9', 'Malignant neoplasm of bone and articular cartilage, unspecified', 'มะเร็งกระดูก'],
  ['C43.9', 'Malignant melanoma of skin, unspecified', 'มะเร็งผิวหนังเมลาโนมา'],
  ['C44.3', 'Other malignant neoplasm of skin of other and unspecified parts of face', 'มะเร็งผิวหนังใบหน้า'],
  ['C44.9', 'Malignant neoplasm of skin, unspecified', 'มะเร็งผิวหนัง'],
  ['C46.0', 'Kaposi sarcoma of skin', 'คาโปซีซาร์โคมา'],
  ['C49.9', 'Malignant neoplasm of connective and soft tissue, unspecified', 'มะเร็งเนื้อเยื่ออ่อน ซาร์โคมา'],

  // ---- มะเร็งแพร่กระจาย ----
  ['C77.0', 'Secondary malignant neoplasm of lymph nodes of head, face and neck', 'มะเร็งแพร่กระจายต่อมน้ำเหลืองที่คอ'],
  ['C77.1', 'Secondary malignant neoplasm of intrathoracic lymph nodes', 'มะเร็งแพร่กระจายต่อมน้ำเหลือง'],
  ['C77.2', 'Secondary malignant neoplasm of intra-abdominal lymph nodes', 'มะเร็งแพร่กระจายต่อมน้ำเหลือง'],
  ['C77.3', 'Secondary malignant neoplasm of axillary and upper limb lymph nodes', 'มะเร็งแพร่กระจายต่อมน้ำเหลืองรักแร้'],
  ['C77.4', 'Secondary malignant neoplasm of inguinal and lower limb lymph nodes', 'มะเร็งแพร่กระจายต่อมน้ำเหลืองขาหนีบ'],
  ['C77.5', 'Secondary malignant neoplasm of intrapelvic lymph nodes', 'มะเร็งแพร่กระจายต่อมน้ำเหลือง'],
  ['C77.9', 'Secondary malignant neoplasm of lymph node, unspecified', 'มะเร็งแพร่กระจายต่อมน้ำเหลือง'],
  ['C78.0', 'Secondary malignant neoplasm of lung', 'มะเร็งแพร่กระจายไปปอด'],
  ['C78.1', 'Secondary malignant neoplasm of mediastinum', 'มะเร็งแพร่กระจาย'],
  ['C78.7', 'Secondary malignant neoplasm of liver and intrahepatic bile duct', 'มะเร็งแพร่กระจายไปตับ'],
  ['C79.2', 'Secondary malignant neoplasm of skin', 'มะเร็งแพร่กระจายไปผิวหนัง'],
  ['C79.3', 'Secondary malignant neoplasm of brain and cerebral meninges', 'มะเร็งแพร่กระจายไปสมอง'],
  ['C79.4', 'Secondary malignant neoplasm of other and unspecified parts of nervous system', 'มะเร็งแพร่กระจายไปไขสันหลัง'],
  ['C79.5', 'Secondary malignant neoplasm of bone and bone marrow', 'มะเร็งแพร่กระจายไปกระดูก'],
  ['C79.7', 'Secondary malignant neoplasm of adrenal gland', 'มะเร็งแพร่กระจายไปต่อมหมวกไต'],
  ['C79.8', 'Secondary malignant neoplasm of other specified sites', 'มะเร็งแพร่กระจาย'],
  ['C80.0', 'Malignant neoplasm, primary site unknown, so stated', 'มะเร็งไม่ทราบตำแหน่งต้นกำเนิด'],
  ['C80.9', 'Malignant neoplasm, primary site unspecified', 'มะเร็งไม่ระบุตำแหน่ง'],

  // ---- มะเร็งระบบเลือดและต่อมน้ำเหลือง ----
  ['C81.9', 'Hodgkin lymphoma, unspecified', 'มะเร็งต่อมน้ำเหลืองฮอดจ์กิน'],
  ['C82.9', 'Follicular lymphoma, unspecified', 'มะเร็งต่อมน้ำเหลือง'],
  ['C83.3', 'Diffuse large B-cell lymphoma', 'มะเร็งต่อมน้ำเหลือง DLBCL'],
  ['C84.9', 'Mature T/NK-cell lymphoma, unspecified', 'มะเร็งต่อมน้ำเหลือง'],
  ['C85.9', 'Non-Hodgkin lymphoma, unspecified', 'มะเร็งต่อมน้ำเหลืองนอนฮอดจ์กิน'],
  ['C86.0', 'Extranodal NK/T-cell lymphoma, nasal type', 'มะเร็งต่อมน้ำเหลือง NK/T'],
  ['C90.0', 'Multiple myeloma', 'มะเร็งไขกระดูก มัยอีโลมา'],
  ['C90.2', 'Extramedullary plasmacytoma', 'พลาสมาไซโตมา'],
  ['C90.3', 'Solitary plasmacytoma', 'พลาสมาไซโตมา'],
  ['C91.0', 'Acute lymphoblastic leukaemia', 'มะเร็งเม็ดเลือดขาว ALL'],
  ['C92.0', 'Acute myeloblastic leukaemia', 'มะเร็งเม็ดเลือดขาว AML'],
  ['C95.9', 'Leukaemia, unspecified', 'มะเร็งเม็ดเลือดขาว'],

  // ---- เนื้องอกไม่ร้าย / ไม่ทราบพฤติกรรม และโรคอื่นที่ฉายรังสี ----
  ['D32.0', 'Benign neoplasm of cerebral meninges', 'เนื้องอกเยื่อหุ้มสมอง meningioma'],
  ['D32.1', 'Benign neoplasm of spinal meninges', 'เนื้องอกเยื่อหุ้มไขสันหลัง'],
  ['D33.3', 'Benign neoplasm of cranial nerves', 'เนื้องอกเส้นประสาทสมอง acoustic neuroma'],
  ['D35.2', 'Benign neoplasm of pituitary gland', 'เนื้องอกต่อมใต้สมอง'],
  ['D35.3', 'Benign neoplasm of craniopharyngeal duct', 'เนื้องอก craniopharyngioma'],
  ['D43.2', 'Neoplasm of uncertain or unknown behaviour of brain, unspecified', 'เนื้องอกสมอง'],
  ['Q28.2', 'Arteriovenous malformation of cerebral vessels', 'หลอดเลือดสมองผิดปกติ AVM'],
  ['G50.0', 'Trigeminal neuralgia', 'ปวดเส้นประสาทใบหน้า'],
  ['L91.0', 'Hypertrophic scar', 'แผลเป็นนูน คีลอยด์ keloid'],
  ['Z51.0', 'Radiotherapy session', 'มารับการฉายรังสี'],
];

export const ICD9_RT = [
  ['92.21', 'Superficial radiation'],
  ['92.22', 'Orthovoltage radiation'],
  ['92.23', 'Radioisotopic teleradiotherapy'],
  ['92.24', 'Teleradiotherapy using photons'],
  ['92.25', 'Teleradiotherapy using electrons'],
  ['92.26', 'Teleradiotherapy of other particulate radiation'],
  ['92.27', 'Implantation or insertion of radioactive elements'],
  ['92.28', 'Injection or instillation of radioisotopes'],
  ['92.29', 'Other radiotherapeutic procedure'],
  ['92.30', 'Stereotactic radiosurgery, not otherwise specified'],
  ['92.31', 'Single source photon radiosurgery'],
  ['92.32', 'Multi-source photon radiosurgery'],
  ['92.33', 'Particulate radiosurgery'],
  ['92.39', 'Stereotactic radiosurgery, not elsewhere classified'],
  ['92.41', 'Intra-operative electron radiation therapy'],
];

// รหัสหัตถการที่เลือกให้อัตโนมัติตามเทคนิคการฉาย (แก้ไขได้ในฟอร์ม)
export const ICD9_BY_TECHNIQUE = {
  '2D': '92.24', '3DCRT': '92.24', IMRT: '92.24', VMAT: '92.24', TBI: '92.24',
  ELECTRON: '92.25', SRS: '92.31', SRT: '92.31', SBRT: '92.31',
};

// ตำแหน่งที่ฉายที่ใช้บ่อย — เลือกได้หลายตำแหน่ง และพิมพ์ตำแหน่งอื่นเพิ่มเองได้
// เก็บเป็นข้อความเดียวคั่นด้วย ", " (เช่น "Breast (Lt), Supraclavicular (Lt)")
export const TREATMENT_SITES = [
  'Whole brain', 'Brain (partial)', 'Head and neck', 'Nasopharynx', 'Oral cavity', 'Larynx', 'Neck nodes', 'Thyroid bed',
  'Esophagus', 'Lung', 'Mediastinum', 'Breast (Lt)', 'Breast (Rt)', 'Chest wall (Lt)', 'Chest wall (Rt)',
  'Supraclavicular (Lt)', 'Supraclavicular (Rt)', 'Axilla (Lt)', 'Axilla (Rt)', 'Internal mammary nodes',
  'Abdomen', 'Liver', 'Pancreas', 'Stomach', 'Whole pelvis', 'Para-aortic', 'Inguinal nodes', 'Cervix', 'Vaginal cuff',
  'Prostate', 'Prostate bed', 'Seminal vesicles', 'Rectum', 'Bladder', 'C-spine', 'T-spine', 'L-spine', 'Sacrum',
  'Pelvic bone', 'Femur', 'Rib', 'Bone (palliative)', 'Skin', 'Whole body (TBI)',
];

export const SITE_SEP = ', ';

export function parseSites(text) {
  return String(text || '')
    .split(/\s*,\s*/)
    .map((x) => x.trim())
    .filter((x, i, arr) => x && arr.indexOf(x) === i);
}

// ค้นหา ICD-10 จากรหัส ชื่อภาษาอังกฤษ หรือคำภาษาไทย
export function searchIcd10(query, limit = 30) {
  const q = query.trim().toLowerCase();
  if (!q) return ICD10.slice(0, limit);
  const words = q.split(/\s+/);
  const scored = [];
  for (const row of ICD10) {
    const [code, en, th = ''] = row;
    const hay = `${code} ${en} ${th}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) continue;
    const c = code.toLowerCase();
    scored.push([c === q ? 0 : c.startsWith(q) ? 1 : 2, row]);
  }
  return scored
    .sort((a, b) => a[0] - b[0])
    .slice(0, limit)
    .map((x) => x[1]);
}

export function icd10Label(code) {
  const row = ICD10.find((r) => r[0] === code);
  return row ? `${row[0]} ${row[1]}` : code;
}
