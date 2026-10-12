/*
 * ปฏิทินห้องฉายในหน้าแรก — ฝังแถบแดชบอร์ดของระบบกระจายงานฟิสิกส์การแพทย์ (MEDPHYS_APP ใน data.js) แบบ …/exec?embed=cal
 * - เปิดกรอบโดยไม่แนบบัตรผ่านก่อน ระบบนั้นใช้การเข้าสู่ระบบที่เก็บไว้ในเบราว์เซอร์ ถ้าไม่มี (หรือเป็นของคนอื่น) จะส่งข้อความ
 *   "login" มา จึงขอบัตรผ่าน (ssoTicket) แล้วเปิดกรอบใหม่พร้อม ?sso=… — ไม่สร้างการเข้าสู่ระบบใหม่ทุกครั้งที่เปิดหน้าแรก
 * - ความสูงของกรอบตามเนื้อหา (ข้อความ "height") · ตำแหน่งที่แอดมินแดชบอร์ดไม่ได้เปิดให้ดู (ข้อความ "denied") ซ่อนทั้งส่วน
 * - โหมดสีตามเว็บนี้ เปลี่ยนโหมดสีแล้วโหลดกรอบใหม่
 * - ไม่มีข้อความจากกรอบภายใน 20 วินาที (เช่น Code.gs ของแดชบอร์ดยังเป็นรุ่นที่ห้ามฝัง) แสดงคำแนะนำใต้กรอบ
 */
(function () {
  "use strict";

  var MIN_H = 240, MAX_H = 2400, FIRST_H = 640, HINT_MS = 20000, MAX_SSO = 2;

  function theme() {
    var t = document.documentElement.getAttribute("data-theme");
    if (t === "light" || t === "dark") return t;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function mount(root) {
    var app = window.MEDPHYS_APP, box = root.querySelector(".dcal-box"), hint = root.querySelector(".dcal-hint");
    if (!app || !box) return function () {};
    var user = (window.Auth && Auth.user && Auth.user.username) || "";
    var shown = theme(), heard = false, ssoCount = 0, hintTimer = null, alive = true;

    var frame = document.createElement("iframe");
    frame.className = "dcal-frame";
    frame.title = "ปฏิทินห้องฉาย";
    frame.style.height = FIRST_H + "px";
    box.appendChild(frame);

    function load(ticket) {
      heard = false;
      hint.hidden = true;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(function () {
        if (heard || !alive) return;
        hint.textContent = 'ปฏิทินไม่ขึ้น? กด "เปิดแดชบอร์ด ↗" เพื่อดูในแท็บใหม่' +
          (Auth.user && Auth.user.isAdmin ? " · ผู้ดูแลระบบ: วาง Code.gs ของระบบกระจายงานฟิสิกส์การแพทย์รุ่นใหม่ (2026-10-12.8 ขึ้นไป) แล้ว Deploy → Manage deployments → Edit → New version" : "");
        hint.hidden = false;
      }, HINT_MS);
      var q = "embed=cal&theme=" + shown + "&u=" + encodeURIComponent(user) + (ticket ? "&sso=" + encodeURIComponent(ticket) : "");
      frame.src = app.url + (app.url.indexOf("?") === -1 ? "?" : "&") + q;
    }

    // Apps Script pages sit several frames deep: accept a message only if it comes from inside our frame.
    function fromFrame(w) {
      for (var i = 0; w && i < 8; i++) {
        if (w === frame.contentWindow) return true;
        var p;
        try { p = w.parent; } catch (e) { return false; }
        if (!p || p === w) return false;
        w = p;
      }
      return false;
    }

    function onMessage(e) {
      var d = e.data;
      if (!d || typeof d !== "object" || d.source !== "medphys-cal" || !fromFrame(e.source)) return;
      heard = true;
      hint.hidden = true;
      if (d.type === "height") {
        var h = Math.max(MIN_H, Math.min(MAX_H, Math.round(+d.height || 0)));
        frame.style.height = h + "px";
      } else if (d.type === "login") {
        // not signed in there (or signed in as someone else): reopen with a one-use ticket for this member
        if (!Auth.remote || ssoCount >= MAX_SSO) return;
        ssoCount++;
        Auth.call("ssoTicket").then(function (r) { if (alive) load(r.ticket); }, function () { /* old Code.gs: the frame shows its own sign-in */ });
      } else if (d.type === "denied") {
        root.hidden = true;   // the dashboard admins have not opened this tab to this member's role
      }
    }
    window.addEventListener("message", onMessage);

    function retheme() {
      var t = theme();
      if (t === shown) return;
      shown = t;
      load();
    }
    var mo = window.MutationObserver ? new MutationObserver(retheme) : null;
    if (mo) mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    if (mq && mq.addEventListener) mq.addEventListener("change", retheme);

    load();

    return function unmount() {
      alive = false;
      clearTimeout(hintTimer);
      window.removeEventListener("message", onMessage);
      if (mo) mo.disconnect();
      if (mq && mq.removeEventListener) mq.removeEventListener("change", retheme);
    };
  }

  window.DashCal = { mount: mount };
})();
