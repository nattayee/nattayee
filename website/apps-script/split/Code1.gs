// Code1.gs — ส่วนที่ 1/10 ของ LPCH RO Workspace (วางทุกไฟล์ Code1–Code10 ให้ครบ)

/**
 * LPCH RO Workspace — Google Apps Script web app (Code.gs)
 *
 * โปรเจกต์ Apps Script ต้องการไฟล์นี้ไฟล์เดียว (Code.gs)
 * หน้าเว็บ (Index.html) โหลดจาก GitHub อัตโนมัติ (PAGE_URL) จึงได้หน้าเว็บเวอร์ชันล่าสุดโดยไม่ต้องวางใหม่
 * ถ้าต้องการใช้ไฟล์ในโปรเจกต์แทน: กด + → HTML → ตั้งชื่อ "Index" แล้ววางเนื้อหา Index.html (จะใช้ไฟล์นั้นก่อน)
 *
 * วิธีติดตั้ง:
 *   1. สร้าง Google Sheet ใหม่ → Extensions → Apps Script
 *   2. วางโค้ดนี้แทนโค้ดเดิมทั้งหมด → Save (ตรวจว่าบรรทัดสุดท้ายของไฟล์ถูกวางมาครบ)
 *   3. เลือกฟังก์ชัน setup แล้วกด Run หนึ่งครั้ง (อนุญาตสิทธิ์ Sheets + Drive + เชื่อมต่อภายนอก)
 *   4. Deploy → New deployment → Web app
 *        Execute as: Me   |   Who has access: Anyone
 *   5. เปิด Web app URL (.../exec) แล้วสมัครบัญชีแรก (จะได้เป็น admin)
 *
 * ข้อมูลเก็บใน Google Sheet นี้: Users, Sessions, Messages, ChatLog
 * รูปที่แนบในแชทเก็บในโฟลเดอร์ Drive "LPCH RO Workspace Images" (ไม่แชร์สาธารณะ)
 *
 * เว็บแบบ static (GitHub Pages ฯลฯ) ใช้เซิร์ฟเวอร์นี้ได้เช่นกัน: ใส่ URL /exec ที่ auth.apiUrl ใน data.js
 */

var REQUIRE_APPROVAL = true;   // ผู้สมัครใหม่ต้องรอ admin อนุมัติ
var SESSION_DAYS = 7;
var ROLES = ['RO', 'MP', 'RTT', 'Nurse', 'Other'];
var CHAT_ROLES = ['RO', 'MP', 'RTT', 'Nurse'];
var MAX_FAILED_LOGINS = 5;     // ต่อ 15 นาที
var RESET_MINUTES = 15;        // อายุรหัสรีเซ็ตรหัสผ่านที่ส่งทางอีเมล
var RESET_MAX_TRIES = 5;       // ใส่รหัสรีเซ็ตผิดได้กี่ครั้ง
var RESET_REQUESTS = 3;        // ขอรหัสได้กี่ครั้งต่อ 15 นาที ต่อบัญชี
var EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
var HASH_ROUNDS = 200;
var TIME_ZONE = 'Asia/Bangkok';
var CHAT_LIMIT = 200;          // จำนวนข้อความล่าสุดที่ส่งให้หน้าเว็บ
var MAX_IMAGES = 4;
var MAX_IMAGE_CHARS = 1500000; // ~1.1 MB ต่อรูป (หลังย่อขนาดในเบราว์เซอร์แล้ว)
var TITLE = 'LPCH RO Workspace';
var IMAGE_FOLDER = 'LPCH RO Workspace Images';
// หน้าเว็บที่สร้างจาก website/ (build_apps_script.py) — โหลดจาก GitHub และ cache ไว้ 10 นาที
var PAGE_URL = 'https://raw.githubusercontent.com/nattayee/nattayee/refs/heads/claude/lpch-ro-workspace-website-96j4r6/website/apps-script/Index.html';
var PAGE_CACHE_SECONDS = 600;

var USER_HEADERS = ['username', 'fullName', 'role', 'phone', 'email', 'salt', 'hash', 'status', 'isAdmin', 'createdAt', 'lastLogin'];
var SESSION_HEADERS = ['token', 'username', 'expiresAt'];
var MESSAGE_HEADERS = ['id', 'createdAt', 'author', 'json'];
var LOG_HEADERS = ['วันที่เวลา', 'การกระทำ', 'ผู้กระทำ', 'ตำแหน่ง', 'Username', 'รายละเอียด', 'Message ID', 'ข้อความ'];

// Actions that only read data and can skip the script lock.
var READ_ONLY = { me: 1, directory: 1, listUsers: 1, chatList: 1, chatImage: 1 };

/* ---------------- Entry points ---------------- */

function doGet() {
  return HtmlService.createHtmlOutput(page_())
    .setTitle(TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/**
 * The page: an "Index" (or "index") HTML file in this project if it is complete, otherwise the copy on GitHub.
 * A file pasted only in part (no closing </html>) is ignored, so a truncated paste cannot break the site.
 */
function page_() {
  var names = ['Index', 'index'];
  for (var i = 0; i < names.length; i++) {
    try {
      var html = HtmlService.createHtmlOutputFromFile(names[i]).getContent();
      if (/<\/html>\s*$/i.test(html)) return html;
    } catch (e) { /* no such file */ }
  }
  return loadPage_();
}

// ----- จบ Code1.gs (ถ้าไม่เห็นบรรทัดนี้ แสดงว่าวางไฟล์นี้มาไม่ครบ) -----
