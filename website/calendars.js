/*
 * ปฏิทินในหน้าแรก — ฝังปฏิทิน/เว็บแอป (เช่น เว็บแอป Apps Script นัดคิว) ไว้ใต้ Workspace มีแท็บให้เลือกเมื่อมีหลายปฏิทิน
 * - แต่ละแท็บโหลดครั้งแรกเมื่อเปิดดู แล้วเก็บไว้ (สลับแท็บไม่ต้องโหลดใหม่) · จำแท็บล่าสุดไว้ในเบราว์เซอร์
 * - ปุ่ม "เปิดในแท็บใหม่ ↗" เสมอ (เผื่อแอปนั้นไม่อนุญาตให้ฝัง หรือต้องล็อกอิน Google)
 * - ผู้ดูแลระบบแก้รายการได้ (⚙️): ชื่อแท็บ ลิงก์ ความสูง และเข้าสู่ระบบอัตโนมัติด้วยบัญชีนี้ (เฉพาะเว็บแอป Apps Script ที่รองรับ ?sso=)
 * เก็บบนเซิร์ฟเวอร์ (Code.gs: calendarsGet / calendarsSave → ชีต Config แถว "calendars"); โหมดทดลองเก็บในเบราว์เซอร์
 */
(function () {
  "use strict";

  var LOCAL_KEY = "lpch-ro-calendars", TAB_KEY = "lpch-ro-calendar-tab";
  var APPS_SCRIPT_RE = /^https:\/\/script\.google\.com\/(a\/[^\/]+\/)?macros\/s\/[\w-]+\/(exec|dev)$/;
  var DEFAULTS = [
    { id: "cal-1", label: "ปฏิทิน 1", url: "https://script.google.com/macros/s/AKfycbxupxMpE1FN85EA-ppw27LP-KZFEol3nYVwYZAA0Per9Gcw3hTFB8xB9dK4r9F4cEe5VA/exec", height: 720, sso: false },
    { id: "cal-2", label: "ปฏิทิน 2", url: "https://script.google.com/macros/s/AKfycbyUG8L4u-hF0Qzpvs4Q4EeMK4UogcN_aNS-nGrmhbr3EIlTnK3Uw5ialWzcTLj6vI7CiA/exec", height: 720, sso: false }
  ];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function isAdmin() { return !!(window.Auth && window.Auth.user && window.Auth.user.isAdmin); }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  function call(action, data) {
    if (window.Auth.remote) return window.Auth.call(action, data);
    return new Promise(function (resolve) { setTimeout(resolve, 60); }).then(function () {
      if (action === "calendarsGet") {
        var v = null;
        try { v = JSON.parse(read(LOCAL_KEY)); } catch (e) { v = null; }
        return { calendars: Array.isArray(v) ? v : JSON.parse(JSON.stringify(DEFAULTS)) };
      }
      write(LOCAL_KEY, JSON.stringify(data.calendars));
      return { calendars: data.calendars, message: "บันทึกปฏิทินแล้ว" };
    });
  }

  function mount(root) {
    var cals = [], current = read(TAB_KEY) || "", editing = null, frames = {};

    function frameFor(c) {
      // one iframe per calendar, created the first time its tab is opened
      if (frames[c.id] && frames[c.id].url === c.url && frames[c.id].sso === c.sso) return frames[c.id].el;
      var f = document.createElement("iframe");
      f.className = "cal-frame";
      f.title = c.label;
      f.setAttribute("loading", "lazy");
      f.setAttribute("allow", "clipboard-write");
      f.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
      frames[c.id] = { el: f, url: c.url, sso: c.sso };
      if (c.sso && window.Auth.remote) {
        // the app signs this member in with a one-use ticket (like TRS-398 and Linac QA)
        window.Auth.call("ssoTicket").then(function (r) { f.src = c.url + (c.url.indexOf("?") === -1 ? "?" : "&") + "sso=" + encodeURIComponent(r.ticket); },
          function () { f.src = c.url; });
      } else {
        f.src = c.url;
      }
      return f;
    }

    // Parts: top (title, tabs, bar) is redrawn; stage keeps the iframes so a tab switch does not reload them.
    root.innerHTML = '<div class="cal-top"></div><div class="cal-stage card flush" hidden></div><p class="cal-hint" hidden></p><div class="cal-edit"></div>';
    var top = root.querySelector(".cal-top"), stage = root.querySelector(".cal-stage"), hint = root.querySelector(".cal-hint"), editBox = root.querySelector(".cal-edit");
    hint.textContent = 'ถ้าปฏิทินไม่แสดง ให้กด "เปิดในแท็บใหม่"' +
      (isAdmin() ? ' · ผู้ดูแลระบบ: เว็บแอปนั้นต้องอนุญาตให้ฝัง (HtmlService …setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)) และ Deploy แบบ Who has access: Anyone' : "");

    function render() {
      editBox.innerHTML = "";
      if (editing) { renderEditor(); return; }
      var c = cals.filter(function (x) { return x.id === current; })[0] || cals[0];
      if (c) current = c.id;
      top.innerHTML =
        '<div class="cal-head"><h2>ปฏิทิน</h2>' +
          (isAdmin() ? '<button type="button" class="chip" data-cal-edit>⚙️ ตั้งค่าปฏิทิน</button>' : "") + "</div>" +
        (cals.length > 1 ? '<div class="cal-tabs" role="tablist">' + cals.map(function (x) {
          return '<button type="button" role="tab" class="cal-tab' + (x.id === current ? " active" : "") + '" aria-selected="' + (x.id === current) + '" data-cal="' + esc(x.id) + '">' + esc(x.label) + "</button>";
        }).join("") + "</div>" : "") +
        (c ? '<div class="cal-bar"><strong>' + esc(c.label) + '</strong><a class="chip" href="' + esc(c.url) + '" target="_blank" rel="noopener">เปิดในแท็บใหม่ ↗</a></div>'
          : '<p class="muted">ยังไม่มีปฏิทิน' + (isAdmin() ? ' — กด "⚙️ ตั้งค่าปฏิทิน" เพื่อเพิ่ม' : "") + "</p>");
      stage.hidden = hint.hidden = !c;
      if (!c) return;
      var f = frameFor(c);
      f.style.height = "min(" + c.height + "px, 80vh)";
      if (f.parentNode !== stage) stage.appendChild(f);
      Array.prototype.forEach.call(stage.children, function (x) { x.hidden = x !== f; });
    }

    function renderEditor(msg, bad) {
      top.innerHTML = ""; stage.hidden = hint.hidden = true;
      editBox.innerHTML =
        '<div class="cal-head"><h2>ตั้งค่าปฏิทิน</h2></div>' +
        '<div class="card cal-editor">' +
          '<p class="muted">แต่ละรายการเป็น 1 แท็บ เรียงตามลำดับนี้ · ใส่ลิงก์เว็บแอป (…/exec) หรือลิงก์ embed ของ Google Calendar</p>' +
          (msg ? '<p class="menus-msg' + (bad ? " bad" : "") + '">' + esc(msg) + "</p>" : "") +
          '<ul class="cal-rows">' + editing.map(function (c, i) {
            return '<li class="cal-row" data-i="' + i + '">' +
              '<input data-k="label" maxlength="40" value="' + esc(c.label) + '" placeholder="ชื่อแท็บ เช่น นัดคิวใส่แร่" aria-label="ชื่อแท็บ ' + (i + 1) + '">' +
              '<input data-k="url" maxlength="1000" inputmode="url" value="' + esc(c.url) + '" placeholder="https://script.google.com/macros/s/…/exec" aria-label="ลิงก์ ' + (i + 1) + '">' +
              '<label class="cal-h">สูง <input data-k="height" type="number" min="300" max="1600" step="20" value="' + esc(c.height) + '" aria-label="ความสูง ' + (i + 1) + '"> px</label>' +
              '<label class="menu-check"><input type="checkbox" data-k="sso"' + (c.sso ? " checked" : "") + "> เข้าสู่ระบบอัตโนมัติด้วยบัญชีนี้ (เฉพาะเว็บแอป Apps Script ที่รองรับ)</label>" +
              '<span class="menu-acts">' +
                '<button type="button" class="chip" data-mv="' + i + '" data-d="-1"' + (i === 0 ? " disabled" : "") + ' aria-label="เลื่อนขึ้น">↑</button>' +
                '<button type="button" class="chip" data-mv="' + i + '" data-d="1"' + (i === editing.length - 1 ? " disabled" : "") + ' aria-label="เลื่อนลง">↓</button>' +
                '<button type="button" class="chip danger" data-rm="' + i + '" aria-label="ลบ">✕</button></span></li>';
          }).join("") + "</ul>" +
          '<button type="button" class="chip" data-add' + (editing.length >= 10 ? " disabled" : "") + ">＋ เพิ่มปฏิทิน</button>" +
          '<div class="menu-buttons"><button type="button" class="auth-submit" data-save>บันทึก</button><button type="button" class="chip" data-cancel>ยกเลิก</button></div>' +
        "</div>";
    }

    function readEditor() {
      root.querySelectorAll(".cal-row").forEach(function (li) {
        var c = editing[+li.getAttribute("data-i")];
        li.querySelectorAll("[data-k]").forEach(function (el) {
          var k = el.getAttribute("data-k");
          c[k] = el.type === "checkbox" ? el.checked : k === "height" ? Number(el.value) || 720 : el.value.trim();
        });
      });
    }

    root.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("button");
      if (!b || b.disabled) return;
      if (b.hasAttribute("data-cal")) { current = b.getAttribute("data-cal"); write(TAB_KEY, current); render(); return; }
      if (b.hasAttribute("data-cal-edit")) { editing = JSON.parse(JSON.stringify(cals)); renderEditor(); return; }
      if (!editing) return;
      readEditor();
      if (b.hasAttribute("data-add")) { editing.push({ id: "", label: "", url: "", height: 720, sso: false }); renderEditor(); root.querySelector(".cal-row:last-child input").focus(); }
      else if (b.hasAttribute("data-mv")) { var i = +b.getAttribute("data-mv"), x = editing.splice(i, 1)[0]; editing.splice(i + +b.getAttribute("data-d"), 0, x); renderEditor(); }
      else if (b.hasAttribute("data-rm")) { editing.splice(+b.getAttribute("data-rm"), 1); renderEditor(); }
      else if (b.hasAttribute("data-cancel")) { editing = null; render(); }
      else if (b.hasAttribute("data-save")) {
        var list = editing.filter(function (c) { return c.label || c.url; }), bad = null;
        list.some(function (c) {
          if (!c.label) bad = "ปฏิทินทุกรายการต้องมีชื่อ";
          else if (!/^https:\/\/\S+$/i.test(c.url)) bad = 'ลิงก์ของ "' + c.label + '" ต้องขึ้นต้นด้วย https://';
          else if (c.sso && !APPS_SCRIPT_RE.test(c.url)) bad = '"' + c.label + '": เข้าสู่ระบบอัตโนมัติได้เฉพาะเว็บแอป Apps Script (https://script.google.com/macros/s/…/exec)';
          return !!bad;
        });
        if (bad) { renderEditor(bad, true); return; }
        b.disabled = true;
        call("calendarsSave", { calendars: list }).then(function (r) {
          cals = r.calendars; editing = null; frames = {}; stage.innerHTML = ""; render();
        }, function (x) { renderEditor(x.message, true); });
      }
    });

    top.innerHTML = '<div class="cal-head"><h2>ปฏิทิน</h2></div><p class="muted">กำลังโหลดปฏิทิน…</p>';
    call("calendarsGet").then(function (r) { cals = r.calendars || []; render(); },
      function (e) { top.innerHTML = '<div class="cal-head"><h2>ปฏิทิน</h2></div><p class="auth-error">' + esc(e.message) + "</p>"; });
  }

  window.Calendars = { mount: mount };
})();
