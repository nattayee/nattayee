/*
 * ตั้งค่าตำแหน่ง (หน้า #/roles-settings) — admin หลัก หรือ admin รองที่มีสิทธิ์ "จัดการตำแหน่ง"
 * - เพิ่ม แก้ชื่อที่แสดง เรียงลำดับ และเลือกว่าตำแหน่งไหนเป็นกลุ่ม "ส่งถึง" ในแชท
 * - รหัสตำแหน่งตั้งได้ตอนเพิ่มเท่านั้น (เป็นค่าที่เก็บในบัญชีสมาชิก) · ลบได้เฉพาะตำแหน่งที่ไม่มีสมาชิก · MP ลบไม่ได้
 * รายการเดียวนี้ใช้ทุกที่: หน้าสมัครสมาชิก, จัดการสมาชิก, บัญชีของฉัน, กลุ่มในแชท และตัวเลือกคน
 * เก็บบนเซิร์ฟเวอร์ (Code.gs: rolesGet / rolesSave → ชีต Config แถว "roles"); โหมดทดลองเก็บในเบราว์เซอร์
 */
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var MAX = 30;

  function mountSettings(root) {
    var list = [], counts = {}, fixed = [];   // working copy · members per code · codes that stay

    function fromServer() {
      list = window.Auth.roles().map(function (r) { return { code: r.code, label: r.label, chat: !!r.chat, saved: true }; });
      counts = window.Auth.roleCounts() || {};
      fixed = window.Auth.fixedRoles || [];
    }

    function row(r, i, n) {
      var c = counts[r.code] || 0, locked = fixed.indexOf(r.code) !== -1;
      var why = locked ? "ตำแหน่ง " + r.code + " ลบไม่ได้: แอปที่เชื่อม (TRS-398, Linac QA, ระบบกระจายงาน) ใช้ตัดสินสิทธิ์บันทึกข้อมูล"
        : c ? "มีสมาชิก " + c + " คน — เปลี่ยนตำแหน่งของสมาชิกที่หน้าจัดการสมาชิกก่อนจึงจะลบได้" : "";
      return '<li class="role-row" data-i="' + i + '">' +
        '<div class="role-code">' + (r.saved ? "<strong>" + esc(r.code) + "</strong>"
          : '<input data-k="code" maxlength="20" value="' + esc(r.code) + '" placeholder="รหัส เช่น PN" aria-label="รหัสตำแหน่งใหม่">') + "</div>" +
        '<input data-k="label" maxlength="60" value="' + esc(r.label) + '" placeholder="ชื่อที่แสดง เช่น ผู้ช่วยพยาบาล (PN)" aria-label="ชื่อที่แสดงของ ' + esc(r.code || "ตำแหน่งใหม่") + '">' +
        '<label class="menu-check role-chat"><input type="checkbox" data-k="chat"' + (r.chat ? " checked" : "") + "> กลุ่มในแชท</label>" +
        '<span class="role-count' + (c ? "" : " none") + '">' + (r.saved ? (c ? c + " คน" : "ยังไม่มีสมาชิก") : "ใหม่") + (locked ? " · 🔒" : "") + "</span>" +
        '<span class="menu-acts">' +
          '<button type="button" class="chip" data-mv="' + i + '" data-d="-1"' + (i === 0 ? " disabled" : "") + ' aria-label="เลื่อนขึ้น">↑</button>' +
          '<button type="button" class="chip" data-mv="' + i + '" data-d="1"' + (i === n - 1 ? " disabled" : "") + ' aria-label="เลื่อนลง">↓</button>' +
          '<button type="button" class="chip danger" data-rm="' + i + '"' + (why ? ' disabled title="' + esc(why) + '"' : "") + ' aria-label="ลบ ' + esc(r.code || "ตำแหน่งใหม่") + '">✕</button>' +
        "</span></li>";
    }

    function render(msg, bad) {
      root.innerHTML =
        '<p class="menus-msg' + (bad ? " bad" : "") + '" role="status"' + (msg ? "" : " hidden") + ">" + esc(msg || "") + "</p>" +
        '<div class="card roles-card">' +
          '<p class="muted">' +
            "<strong>รหัส</strong> เก็บในบัญชีสมาชิกและเป็นชื่อปุ่มกลุ่มในแชท ตั้งได้ตอนเพิ่มเท่านั้น · " +
            "<strong>ชื่อที่แสดง</strong> ใช้ในหน้าสมัครสมาชิกและบัญชีของฉัน · " +
            "ติ๊ก <strong>กลุ่มในแชท</strong> ถ้าต้องการส่งข้อความถึงทั้งตำแหน่งได้ · ลบได้เฉพาะตำแหน่งที่ไม่มีสมาชิก</p>" +
          '<ul class="roles-list">' + list.map(function (r, i) { return row(r, i, list.length); }).join("") + "</ul>" +
          '<button type="button" class="chip" data-add' + (list.length >= MAX ? " disabled" : "") + ">＋ เพิ่มตำแหน่ง</button>" +
        "</div>" +
        '<div class="menu-buttons st-save-row"><button type="button" class="auth-submit" data-save>บันทึก</button>' +
          '<button type="button" class="chip" data-reset>ยกเลิกการแก้ไข</button>' +
          '<span class="muted">ลำดับในรายการ = ลำดับในหน้าสมัครสมาชิก ช่องตำแหน่ง และปุ่มกลุ่มในแชท</span></div>';
    }

    function read() {
      root.querySelectorAll(".role-row").forEach(function (li) {
        var r = list[+li.getAttribute("data-i")];
        li.querySelectorAll("[data-k]").forEach(function (el) {
          var k = el.getAttribute("data-k");
          r[k] = el.type === "checkbox" ? el.checked : el.value.replace(/\s+/g, " ").trim();
        });
      });
    }

    root.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("button");
      if (!b || b.disabled) return;
      if (b.hasAttribute("data-reset")) { fromServer(); render(); return; }
      read();
      if (b.hasAttribute("data-add")) {
        list.push({ code: "", label: "", chat: true, saved: false });
        render();
        var inputs = root.querySelectorAll('.role-row:last-child [data-k="code"]');
        if (inputs.length) inputs[0].focus();
      } else if (b.hasAttribute("data-mv")) {
        var i = +b.getAttribute("data-mv"), x = list.splice(i, 1)[0];
        list.splice(i + +b.getAttribute("data-d"), 0, x);
        render();
      } else if (b.hasAttribute("data-rm")) {
        list.splice(+b.getAttribute("data-rm"), 1);
        render();
      } else if (b.hasAttribute("data-save")) {
        // the new rows: a code each, none twice (the server checks the same and more)
        var seen = {}, bad = null;
        list.some(function (r) {
          var k = r.code.toLowerCase();
          if (!r.code) bad = "ตำแหน่งใหม่ต้องมีรหัส";
          else if (seen[k]) bad = 'รหัสตำแหน่ง "' + r.code + '" ซ้ำกัน';
          seen[k] = true;
          return !!bad;
        });
        if (bad) { render(bad, true); return; }
        b.disabled = true;
        b.textContent = "กำลังบันทึก…";
        window.Auth.call("rolesSave", { roles: list.map(function (r) { return { code: r.code, label: r.label || r.code, chat: r.chat }; }) })
          .then(function (res) {
            window.Auth.setRoles(res.roles, res.counts);
            fromServer();
            render(res.message);
          }, function (err) { render(err.message, true); });
      }
    });

    root.innerHTML = '<p class="muted">กำลังโหลด…</p>';
    // fresh list and member counts (another admin may have changed them)
    window.Auth.loadRoles().then(function () { fromServer(); render(); });
  }

  window.Roles = { mountSettings: mountSettings };
})();
