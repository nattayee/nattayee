/**
 * Google Apps Script รับข้อมูลจากเว็บ Linac QA แล้วบันทึกลง Google Sheet
 *
 * วิธีติดตั้ง
 * 1. สร้าง Google Sheet ใหม่ > Extensions > Apps Script
 * 2. วางโค้ดนี้ทับ Code.gs แล้วกด Save
 * 3. Deploy > New deployment > Web app
 *      Execute as: Me, Who has access: Anyone
 * 4. คัดลอก Web app URL ไปใส่ใน config.js (GOOGLE_SCRIPT_URL)
 */
const SHEET_NAME = 'Responses';

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

    let headers = sheet.getLastColumn() > 0
      ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      : [];
    const missing = Object.keys(data).filter(k => headers.indexOf(k) === -1);
    if (missing.length) {
      headers = headers.concat(missing);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    sheet.appendRow(headers.map(h => (h in data ? data[h] : '')));

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
