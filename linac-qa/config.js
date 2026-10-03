/*
 * ตั้งค่าการส่งข้อมูล
 * - ปล่อยว่าง: เก็บข้อมูลในเบราว์เซอร์ (localStorage) เท่านั้น
 * - ใส่ URL ของ Google Apps Script Web App (ดู apps-script/Code.gs):
 *   ข้อมูลจะถูกส่งเข้า Google Sheet ด้วย พร้อมเก็บสำเนาไว้ในเครื่อง
 */
window.QA_CONFIG = {
  GOOGLE_SCRIPT_URL: ''
};
