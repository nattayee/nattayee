/*
 * ออกจากระบบอัตโนมัติเมื่อไม่ได้ใช้งาน
 * - การใช้งาน = คลิก แตะ พิมพ์ เลื่อนหน้า หรือขยับเมาส์ในเว็บนี้ · เวลาล่าสุดเก็บในเบราว์เซอร์ ทุกแท็บของเว็บนี้ใช้ร่วมกัน
 * - เหลือ 1 นาที: แถบเตือนพร้อมปุ่ม "ใช้งานต่อ" · ครบเวลา: ออกจากระบบ (ลบ session ที่เซิร์ฟเวอร์ด้วย) พร้อมบอกเหตุผล
 * - เปิดเว็บใหม่หลังเกินเวลา (เช่นปิดแท็บทิ้งไว้ข้ามวัน): ออกจากระบบทันที (auth.js ถาม Idle.stale ตอนเริ่ม)
 * - เวลาตั้งที่หน้า "ตั้งค่าระบบ" (admin หลัก · Code.gs securityGet / securitySave) และส่งมากับการเช็กข้อความใหม่ทุก ~20 วินาที
 */
(function () {
  "use strict";

  var KEY = "lpch-ro-active", WARN_MS = 60000, CHECK_MS = 5000, WRITE_MS = 5000;
  var CHOICES = [0, 5, 10, 15, 30, 60, 120, 240, 480];   // same as IDLE_CHOICES in Code.gs
  var minutes = 0, mem = 0, written = 0, warnEl = null, warnTimer = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function label(m) { return !m ? "ปิด" : m % 60 === 0 ? (m / 60) + " ชั่วโมง" : m + " นาที"; }
  function signedIn() { return !!(window.Auth && window.Auth.user); }

  // last activity: this tab's memory or what another tab wrote, whichever is newer
  function last() {
    var v = 0;
    try { v = Number(localStorage.getItem(KEY)) || 0; } catch (e) { v = 0; }
    return Math.max(v, mem);
  }
  function touch(force) {
    var t = Date.now();
    mem = t;
    if (force || t - written >= WRITE_MS) {
      written = t;
      try { localStorage.setItem(KEY, String(t)); } catch (e) { /* private mode: this tab only */ }
    }
    if (warnEl) hide();
  }

  /** Was the last activity in this browser longer ago than m minutes? (No record yet = no.) */
  function stale(m) { var l = last(); return !!m && !!l && Date.now() - l >= m * 60000; }

  function check() {
    if (!signedIn() || !minutes) { hide(); return; }
    var left = minutes * 60000 - (Date.now() - last());
    if (left <= 0) { expire(); return; }
    if (left <= WARN_MS) show(left); else hide();
  }

  function expire() {
    hide();
    window.Auth.logout("ออกจากระบบอัตโนมัติ เพราะไม่ได้ใช้งานเกิน " + label(minutes) + " — กรุณาเข้าสู่ระบบอีกครั้ง");
  }

  function show(left) {
    if (!warnEl) {
      warnEl = document.createElement("div");
      warnEl.className = "idle-warn";
      warnEl.setAttribute("role", "alertdialog");
      warnEl.setAttribute("aria-live", "assertive");
      warnEl.innerHTML = '<span class="idle-text"></span><button type="button" class="auth-submit idle-stay">ใช้งานต่อ</button>';
      warnEl.querySelector(".idle-stay").addEventListener("click", function () { touch(true); });
      document.body.appendChild(warnEl);
      warnTimer = setInterval(check, 1000);
    }
    warnEl.querySelector(".idle-text").textContent = "⏱️ ไม่ได้ใช้งานมาสักพัก — จะออกจากระบบใน " + Math.max(1, Math.ceil(left / 1000)) + " วินาที";
  }
  function hide() {
    if (warnTimer) { clearInterval(warnTimer); warnTimer = null; }
    if (warnEl) { warnEl.remove(); warnEl = null; }
  }

  ["pointerdown", "keydown", "wheel", "touchstart", "mousemove", "scroll"].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      // inside the warning only its button counts: removing the banner on the way to it would let the tap fall
      // through to whatever is underneath
      if (warnEl && e.target && warnEl.contains(e.target)) return;
      if (signedIn()) touch(false);
    }, { capture: true, passive: true });
  });
  document.addEventListener("visibilitychange", check);   // back from sleep / another tab: check at once
  window.addEventListener("storage", function (e) { if (e.key === KEY) check(); });
  setInterval(check, CHECK_MS);

  /* ---------------- หน้า "ตั้งค่าระบบ" (admin หลัก) ---------------- */

  function mountSettings(root) {
    var current = window.Auth.idleMinutes();

    function render(msg, bad) {
      root.innerHTML =
        '<div class="card sys-card">' +
          "<h3>⏱️ ออกจากระบบอัตโนมัติเมื่อไม่ได้ใช้งาน</h3>" +
          '<p class="muted">ถ้าไม่ได้คลิก แตะ พิมพ์ เลื่อนหน้า หรือขยับเมาส์ในเว็บนี้ตามเวลาที่ตั้ง ระบบจะออกจากระบบให้ ' +
            "(เตือนก่อน 1 นาที) กันคนอื่นใช้บัญชีต่อจากเครื่องที่เปิดทิ้งไว้ · ใช้กับสมาชิกทุกคน มีผลภายในไม่ถึงนาที</p>" +
          '<div class="sys-choices" role="radiogroup" aria-label="เวลาที่ไม่ได้ใช้งาน">' + CHOICES.map(function (m) {
            return '<label class="sys-choice"><input type="radio" name="idleMinutes" value="' + m + '"' + (m === current ? " checked" : "") + "><span>" + label(m) + "</span></label>";
          }).join("") + "</div>" +
          '<p class="muted sys-note">แอปที่เปิดจากเว็บนี้ (TRS-398, Linac QA, ระบบกระจายงาน) มีการเข้าสู่ระบบของตัวเอง ไม่อยู่ในการตั้งค่านี้</p>' +
          '<p class="menus-msg' + (bad ? " bad" : "") + '" role="status"' + (msg ? "" : " hidden") + ">" + esc(msg || "") + "</p>" +
          '<div class="menu-buttons"><button type="button" class="auth-submit" data-save>บันทึก</button></div>' +
        "</div>";
    }

    root.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-save]");
      if (!b || b.disabled) return;
      var picked = root.querySelector('input[name="idleMinutes"]:checked');
      var m = picked ? Number(picked.value) : current;
      b.disabled = true;
      window.Auth.call("securitySave", { idleMinutes: m }).then(function (res) {
        current = res.idleMinutes;
        window.Auth.setIdleMinutes(current);
        render(res.message);
      }, function (err) { render(err.message, true); });
    });

    render();
  }

  window.Idle = {
    /** minutes: 0 = off. Starts or stops the countdown for the signed-in member. */
    configure: function (m) { minutes = CHOICES.indexOf(Number(m)) !== -1 ? Number(m) : 0; check(); },
    minutes: function () { return minutes; },
    touch: function () { touch(true); },
    stale: stale,
    label: label,
    mountSettings: mountSettings,
  };
})();
