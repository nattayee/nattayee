/*
 * สถานะของสมาชิก — แต่ละคนตั้งสถานะของตัวเอง (อยู่ / ลา / ประชุม / …) พร้อมสถานที่ (เครื่อง) และข้อความสั้น ๆ
 * - ปุ่มสถานะของฉันอยู่ที่หัวเว็บ (ข้าง "เข้าสู่ระบบเป็น …") และในเมนูผู้ใช้
 * - หน้า Home มีแถบขวา "สถานะทีม" แบบรายชื่อเพื่อนใน Facebook: จุดเขียว = เปิดเว็บอยู่, กดชื่อเพื่อส่งข้อความส่วนตัว
 * - ผู้ดูแลระบบเพิ่ม/ลบ/เรียงตัวเลือกสถานะและสถานที่ได้ที่หน้า "ตั้งค่าสถานะ" (#/status-settings)
 * เก็บบนเซิร์ฟเวอร์ (Code.gs: statusList / statusSet / statusConfigSave → ชีต Status และ Config); โหมดทดลองเก็บในเบราว์เซอร์
 */
(function () {
  "use strict";

  var LOCAL_KEY = "lpch-ro-status";
  var REFRESH_SECONDS = 60;
  var COLORS = [["green", "เขียว"], ["blue", "ฟ้า"], ["orange", "ส้ม"], ["red", "แดง"], ["purple", "ม่วง"], ["gray", "เทา"]];
  var DEFAULTS = {
    statuses: [
      { id: "in", label: "อยู่", icon: "🟢", color: "green" },
      { id: "meeting", label: "ประชุม", icon: "🗓️", color: "orange" },
      { id: "leave", label: "ลา", icon: "🏖️", color: "red" }
    ],
    // type "machine" = เครื่อง, "room" = ห้อง (listed apart in the dialog and on the settings page)
    locations: [
      { id: "linac-1", label: "Linac 1", type: "machine" }, { id: "linac-2", label: "Linac 2", type: "machine" },
      { id: "ct-sim", label: "CT Simulator", type: "machine" }, { id: "hdr", label: "HDR Brachytherapy", type: "machine" },
      { id: "opd", label: "ห้องตรวจ OPD", type: "room" }, { id: "tps", label: "ห้องวางแผนการรักษา", type: "room" },
      { id: "meeting-room", label: "ห้องประชุม", type: "room" }, { id: "office", label: "สำนักงาน", type: "room" }
    ]
  };

  var data = { config: JSON.parse(JSON.stringify(DEFAULTS)), people: [] };
  var loaded = false, pending = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function me() { return window.Auth && window.Auth.user; }
  function initial(name) { return String(name || "?").trim().replace(/^[เ-ไ]/, "").charAt(0) || "?"; }
  function ago(t) {
    if (!t) return "";
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return "เมื่อสักครู่";
    if (s < 3600) return Math.floor(s / 60) + " นาทีที่แล้ว";
    if (s < 86400) return Math.floor(s / 3600) + " ชม. ที่แล้ว";
    return new Date(t).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
  }
  function statusOf(id) { return data.config.statuses.filter(function (x) { return x.id === id; })[0] || null; }
  function locationOf(id) { return data.config.locations.filter(function (x) { return x.id === id; })[0] || null; }
  function isRoom(l) { return l.type === "room"; }   // older settings have no type: machines
  function mine() {
    var u = me();
    return u ? data.people.filter(function (p) { return p.username === u.username; })[0] || null : null;
  }

  /* ---------------- storage (server, or this browser in demo mode) ---------------- */

  function local() {
    try { var v = JSON.parse(localStorage.getItem(LOCAL_KEY)); if (v && v.config) return v; } catch (e) { /* ignore */ }
    return { config: JSON.parse(JSON.stringify(DEFAULTS)), people: {} };
  }
  function saveLocal(v) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(v)); } catch (e) { /* ignore */ } }

  var demo = {
    statusList: function () {
      var v = local();
      return window.Auth.directory().then(function (users) {
        return { config: v.config, people: users.map(function (u) {
          var p = v.people[u.username] || {};
          var self = me() && me().username === u.username;
          return { username: u.username, fullName: u.fullName, role: u.role, status: p.status || "", location: p.location || "",
            note: p.note || "", updatedAt: p.updatedAt || null, online: !!self, lastSeen: self ? Date.now() : null };
        }) };
      });
    },
    statusSet: function (r) {
      var v = local();
      v.people[me().username] = { status: r.status, location: r.location, note: r.note, updatedAt: Date.now() };
      saveLocal(v);
      return { message: "อัปเดตสถานะแล้ว" };
    },
    statusConfigSave: function (r) {
      var v = local();
      v.config = { statuses: r.statuses, locations: r.locations };
      saveLocal(v);
      return { config: v.config, message: "บันทึกตัวเลือกสถานะและสถานที่แล้ว" };
    }
  };

  function call(action, payload) {
    if (window.Auth.remote) return window.Auth.call(action, payload);
    return new Promise(function (resolve) { setTimeout(resolve, 60); }).then(function () {
      return demo[action](JSON.parse(JSON.stringify(payload || {})));
    });
  }

  function load() {
    if (pending) return pending;
    pending = call("statusList").then(function (r) {
      data = { config: r.config || data.config, people: r.people || [] };
      loaded = true;
      pending = null;
      window.dispatchEvent(new CustomEvent("lpch:status"));
      return data;
    }, function (e) { pending = null; throw e; });
    return pending;
  }

  /* ---------------- badge pieces ---------------- */

  function badge(p) {
    var st = statusOf(p.status), loc = locationOf(p.location);
    if (!st && !loc) return '<span class="st-badge st-none">ยังไม่ระบุสถานะ</span>';
    return (st ? '<span class="st-badge st-' + esc(st.color) + '">' + (st.icon ? esc(st.icon) + " " : "") + esc(st.label) + "</span>" : "") +
      (loc ? '<span class="st-loc">📍 ' + esc(loc.label) + "</span>" : "");
  }

  /** The "my status" pill in the header. */
  function renderPill() {
    var host = document.getElementById("myStatus");
    if (!host) return;
    var u = me();
    host.hidden = !u;
    if (!u) return;
    var p = mine() || {}, st = statusOf(p.status), loc = locationOf(p.location);
    host.className = "status-pill" + (st ? " st-" + st.color : "");
    host.innerHTML = st || loc
      ? (st ? (st.icon ? esc(st.icon) + " " : "") + esc(st.label) : "") + (loc ? (st ? " · " : "📍 ") + esc(loc.label) : "")
      : "＋ ตั้งสถานะ";
    host.title = "ตั้งสถานะของฉัน";
  }

  /* ---------------- "my status" dialog ---------------- */

  function openEditor() {
    var u = me();
    if (!u) return;
    var old = document.getElementById("statusDialog");
    if (old) old.remove();
    var cur = mine() || {}, pick = { status: cur.status || "", location: cur.location || "" };
    var wrap = document.createElement("div");
    wrap.className = "st-dialog-wrap";
    wrap.id = "statusDialog";
    function draw() {
      wrap.innerHTML =
        '<div class="st-dialog card" role="dialog" aria-modal="true" aria-labelledby="stTitle">' +
          '<h3 id="stTitle">สถานะของฉัน</h3>' +
          '<div class="st-field"><span>สถานะ</span><div class="st-choices">' +
            data.config.statuses.map(function (s) {
              return '<button type="button" class="st-choice st-' + esc(s.color) + (pick.status === s.id ? " on" : "") + '" data-s="' + esc(s.id) + '" aria-pressed="' + (pick.status === s.id) + '">' +
                (s.icon ? esc(s.icon) + " " : "") + esc(s.label) + "</button>";
            }).join("") +
            '<button type="button" class="st-choice st-gray' + (!pick.status ? " on" : "") + '" data-s="" aria-pressed="' + !pick.status + '">ไม่ระบุ</button>' +
          "</div></div>" +
          '<label class="st-field"><span>สถานที่ (เครื่อง / ห้อง)' +
            (me().isAdmin ? ' <a class="st-edit-list" href="#/status-settings" data-close>⚙️ แก้ไขรายการ</a>' : "") +
            '</span><select id="stLoc"><option value="">— ไม่ระบุ —</option>' +
            [["เครื่อง", data.config.locations.filter(function (l) { return !isRoom(l); })], ["ห้อง", data.config.locations.filter(isRoom)]]
              .filter(function (g) { return g[1].length; }).map(function (g) {
                return '<optgroup label="' + g[0] + '">' + g[1].map(function (l) {
                  return '<option value="' + esc(l.id) + '"' + (pick.location === l.id ? " selected" : "") + ">" + esc(l.label) + "</option>";
                }).join("") + "</optgroup>";
              }).join("") + "</select></label>" +
          '<label class="st-field"><span>ข้อความสั้น ๆ (ไม่บังคับ)</span><input id="stNote" maxlength="80" placeholder="เช่น กลับ 13:00, ติดต่อทางไลน์" value="' + esc(pick.note != null ? pick.note : cur.note || "") + '"></label>' +
          '<p class="auth-error" id="stErr" role="alert" hidden></p>' +
          '<div class="st-buttons"><button type="button" class="auth-submit" id="stSave">บันทึก</button>' +
            '<button type="button" class="chip" id="stClear">ล้างสถานะ</button>' +
            '<button type="button" class="chip" id="stCancel">ยกเลิก</button></div>' +
        "</div>";
      wrap.querySelectorAll(".st-choice").forEach(function (b) {
        b.addEventListener("click", function () {
          pick.location = wrap.querySelector("#stLoc").value;
          pick.note = wrap.querySelector("#stNote").value;
          pick.status = b.getAttribute("data-s");
          draw();
        });
      });
      wrap.querySelector("#stCancel").addEventListener("click", close);
      var edit = wrap.querySelector("[data-close]");
      if (edit) edit.addEventListener("click", close);
      wrap.querySelector("#stClear").addEventListener("click", function () { save({ status: "", location: "", note: "" }); });
      wrap.querySelector("#stSave").addEventListener("click", function () {
        save({ status: pick.status, location: wrap.querySelector("#stLoc").value, note: wrap.querySelector("#stNote").value.trim() });
      });
    }
    function save(v) {
      var btn = wrap.querySelector("#stSave"), err = wrap.querySelector("#stErr");
      btn.disabled = true;
      call("statusSet", v).then(function () {
        var p = mine();
        if (p) { p.status = v.status; p.location = v.location; p.note = v.note; p.updatedAt = Date.now(); }
        window.dispatchEvent(new CustomEvent("lpch:status"));
        close();
        load().catch(function () { /* the next refresh will try again */ });
      }, function (e) { btn.disabled = false; err.textContent = e.message; err.hidden = false; });
    }
    function close() { wrap.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    wrap.addEventListener("click", function (e) { if (e.target === wrap) close(); });
    document.addEventListener("keydown", onKey);
    draw();
    document.body.appendChild(wrap);
    var first = wrap.querySelector(".st-choice.on") || wrap.querySelector(".st-choice");
    if (first) first.focus();
  }

  /* ---------------- "สถานะทีม" sidebar on the Home page ---------------- */

  function mountTeam(root) {
    var filter = "", query = "", timer = null;

    function person(p) {
      var u = me(), self = u && p.username === u.username;
      var inner = '<span class="st-ava" aria-hidden="true">' + esc(initial(p.fullName || p.username)) +
          (p.online ? '<i class="st-dot" title="ออนไลน์"></i>' : "") + "</span>" +
        '<span class="st-who"><span class="st-name">' + esc(p.fullName || p.username) + (self ? ' <small>(ฉัน)</small>' : "") +
          ' <small class="st-role">' + esc(p.role) + "</small></span>" +
          '<span class="st-line">' + badge(p) + "</span>" +
          (p.note ? '<span class="st-note">' + esc(p.note) + "</span>" : "") +
          (p.updatedAt && (p.status || p.location) ? '<span class="st-time">อัปเดต ' + esc(ago(p.updatedAt)) + "</span>" : "") +
        "</span>";
      return self
        ? '<li><button type="button" class="st-person self" data-me>' + inner + "</button></li>"
        : '<li><a class="st-person" href="#/inbox?u=' + encodeURIComponent(p.username) + '" title="ส่งข้อความถึง ' + esc(p.fullName) + '">' + inner + "</a></li>";
    }

    function render() {
      var u = me();
      var list = data.people.slice().sort(function (a, b) {
        var sa = u && a.username === u.username ? -1 : 0, sb = u && b.username === u.username ? -1 : 0;
        return sa - sb || (b.online ? 1 : 0) - (a.online ? 1 : 0) || String(a.fullName).localeCompare(String(b.fullName), "th");
      });
      var online = data.people.filter(function (p) { return p.online; }).length;
      var shown = list.filter(function (p) {
        if (filter === "_none" && (statusOf(p.status))) return false;
        if (filter && filter !== "_none" && p.status !== filter) return false;
        if (query && (p.fullName + " " + p.username + " " + p.role + " " + ((locationOf(p.location) || {}).label || "") + " " + (p.note || "")).toLowerCase().indexOf(query) === -1) return false;
        return true;
      });
      var counts = {};
      data.people.forEach(function (p) { var k = statusOf(p.status) ? p.status : "_none"; counts[k] = (counts[k] || 0) + 1; });
      var chips = '<button type="button" class="chip' + (!filter ? " active" : "") + '" data-f="">ทั้งหมด ' + data.people.length + "</button>" +
        data.config.statuses.map(function (s) {
          return '<button type="button" class="chip' + (filter === s.id ? " active" : "") + '" data-f="' + esc(s.id) + '">' + (s.icon ? esc(s.icon) + " " : "") + esc(s.label) + " " + (counts[s.id] || 0) + "</button>";
        }).join("") +
        (counts._none ? '<button type="button" class="chip' + (filter === "_none" ? " active" : "") + '" data-f="_none">ไม่ระบุ ' + counts._none + "</button>" : "");
      root.innerHTML =
        '<div class="team card">' +
          '<div class="team-head"><h2>สถานะทีม</h2><span class="team-online"><i class="st-dot"></i> ออนไลน์ ' + online + "</span>" +
            (u && u.isAdmin ? '<a class="team-gear" href="#/status-settings" title="ตั้งค่าตัวเลือกสถานะและสถานที่" aria-label="ตั้งค่าสถานะ">⚙️</a>' : "") + "</div>" +
          '<button type="button" class="team-mine" data-me>✏️ ตั้งสถานะของฉัน</button>' +
          '<div class="team-chips">' + chips + "</div>" +
          '<input class="team-search" type="search" placeholder="ค้นหาชื่อ ตำแหน่ง หรือสถานที่…" aria-label="ค้นหาในสถานะทีม" value="' + esc(query) + '">' +
          (loaded ? (shown.length ? '<ul class="team-list">' + shown.map(person).join("") + "</ul>" : '<p class="muted team-empty">ไม่พบรายชื่อ</p>')
            : loadError ? '<p class="auth-error team-empty">' + esc(loadError) + "</p>" : '<p class="muted team-empty">กำลังโหลด…</p>') +
        "</div>";
      var search = root.querySelector(".team-search");
      search.addEventListener("input", function () {
        query = search.value.trim().toLowerCase();
        var pos = search.selectionStart;
        render();
        var s2 = root.querySelector(".team-search");
        s2.focus();
        try { s2.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
      });
    }

    root.addEventListener("click", function (e) {
      var t = e.target.closest && e.target.closest("[data-f], [data-me]");
      if (!t) return;
      if (t.hasAttribute("data-me")) { openEditor(); return; }
      filter = t.getAttribute("data-f");
      render();
    });
    var loadError = "";
    function refresh() {
      load().then(function () { if (loadError) { loadError = ""; render(); } },
        function (e) { if (!loaded) { loadError = e.message; render(); } });   // after a first list, keep showing it
    }
    window.addEventListener("lpch:status", render);
    render();
    refresh();
    timer = setInterval(refresh, REFRESH_SECONDS * 1000);
    return function () { clearInterval(timer); window.removeEventListener("lpch:status", render); };
  }

  /* ---------------- "ตั้งค่าสถานะ" page (admins) ---------------- */

  function mountSettings(root) {
    var cfg = null, busy = false;

    // working copy: statuses, and the locations split into machines and rooms
    function split(c) {
      return { statuses: JSON.parse(JSON.stringify(c.statuses)),
        machine: c.locations.filter(function (l) { return !isRoom(l); }).map(function (l) { return { id: l.id, label: l.label }; }),
        room: c.locations.filter(isRoom).map(function (l) { return { id: l.id, label: l.label }; }) };
    }
    function listOf(kind) { return kind === "st" ? cfg.statuses : cfg[kind]; }

    function row(kind, x, i, n) {
      var move = '<button type="button" class="chip" data-mv="' + kind + '" data-i="' + i + '" data-d="-1"' + (i === 0 ? " disabled" : "") + ' aria-label="เลื่อนขึ้น">↑</button>' +
        '<button type="button" class="chip" data-mv="' + kind + '" data-i="' + i + '" data-d="1"' + (i === n - 1 ? " disabled" : "") + ' aria-label="เลื่อนลง">↓</button>' +
        '<button type="button" class="chip danger" data-rm="' + kind + '" data-i="' + i + '" aria-label="ลบ">✕</button>';
      if (kind !== "st") {
        return '<li class="st-set-row loc" data-row="' + kind + '" data-i="' + i + '"><input data-k="label" maxlength="40" value="' + esc(x.label) + '" placeholder="' +
          (kind === "room" ? "เช่น ห้องตรวจ OPD, ห้องพักแพทย์" : "เช่น Linac 3, CT Simulator") + '" aria-label="ชื่อ' + (kind === "room" ? "ห้อง " : "เครื่อง ") + (i + 1) + '">' +
          '<span class="menu-acts">' + move + "</span></li>";
      }
      return '<li class="st-set-row" data-row="st" data-i="' + i + '">' +
        '<input data-k="icon" maxlength="8" value="' + esc(x.icon) + '" placeholder="🟢" aria-label="ไอคอน ' + (i + 1) + '" class="st-icon-in">' +
        '<input data-k="label" maxlength="30" value="' + esc(x.label) + '" placeholder="เช่น ออกหน่วย, อบรม" aria-label="ชื่อสถานะ ' + (i + 1) + '">' +
        '<select data-k="color" aria-label="สี ' + (i + 1) + '">' + COLORS.map(function (c) {
          return '<option value="' + c[0] + '"' + (x.color === c[0] ? " selected" : "") + ">" + c[1] + "</option>";
        }).join("") + "</select>" +
        '<div class="st-set-foot"><span class="st-badge st-' + esc(x.color) + ' st-preview">' + (x.icon ? esc(x.icon) + " " : "") + esc(x.label || "ตัวอย่าง") + "</span>" +
        '<span class="menu-acts">' + move + "</span></div></li>";
    }

    function read() {
      root.querySelectorAll("[data-row]").forEach(function (li) {
        var x = listOf(li.getAttribute("data-row"))[+li.getAttribute("data-i")];
        li.querySelectorAll("[data-k]").forEach(function (el) { x[el.getAttribute("data-k")] = el.value; });
      });
    }

    function render(msg, bad) {
      root.innerHTML =
        '<p class="menus-msg' + (bad ? " bad" : "") + '" role="status"' + (msg ? "" : " hidden") + ">" + esc(msg || "") + "</p>" +
        '<div class="grid wide">' +
          '<div class="card"><h3>ตัวเลือกสถานะ</h3><p class="muted">สมาชิกเลือกได้ 1 สถานะ เช่น อยู่ ลา ประชุม</p><ul class="st-set-list">' +
            cfg.statuses.map(function (x, i) { return row("st", x, i, cfg.statuses.length); }).join("") + "</ul>" +
            '<button type="button" class="chip" data-add="st"' + (cfg.statuses.length >= 20 ? " disabled" : "") + ">＋ เพิ่มสถานะ</button></div>" +
          [["machine", "เครื่อง", "เครื่องฉายรังสีและอุปกรณ์ เช่น Linac, CT Simulator"], ["room", "ห้อง", "เช่น ห้องตรวจ OPD, ห้องวางแผนการรักษา, ห้องประชุม"]].map(function (k) {
            var list = cfg[k[0]], full = cfg.machine.length + cfg.room.length >= 60;
            return '<div class="card"><h3>' + k[1] + '</h3><p class="muted">' + k[2] + '</p><ul class="st-set-list">' +
              list.map(function (x, i) { return row(k[0], x, i, list.length); }).join("") + "</ul>" +
              '<button type="button" class="chip" data-add="' + k[0] + '"' + (full ? " disabled" : "") + ">＋ เพิ่ม" + k[1] + "</button></div>";
          }).join("") +
        "</div>" +
        '<div class="menu-buttons st-save-row"><button type="button" class="auth-submit" id="stCfgSave">บันทึก</button>' +
          '<button type="button" class="chip" id="stCfgDefault">ใช้ค่าเริ่มต้น</button>' +
          '<span class="muted">ลบตัวเลือกที่มีคนเลือกอยู่ สถานะของคนนั้นจะกลายเป็น "ไม่ระบุ"</span></div>';
    }

    function preview(e) {
      var li = e.target.closest && e.target.closest('[data-row="st"]');
      if (!li) return;
      var icon = li.querySelector('[data-k="icon"]').value, label = li.querySelector('[data-k="label"]').value, color = li.querySelector('[data-k="color"]').value;
      var pv = li.querySelector(".st-preview");
      pv.className = "st-badge st-" + color + " st-preview";
      pv.textContent = (icon ? icon + " " : "") + (label || "ตัวอย่าง");
    }
    root.addEventListener("input", preview);
    root.addEventListener("change", preview);
    root.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("button");
      if (!b || busy || b.disabled || !cfg) return;
      read();
      var kind = b.getAttribute("data-add") || b.getAttribute("data-mv") || b.getAttribute("data-rm");
      var list = kind ? listOf(kind) : null;
      if (b.hasAttribute("data-add")) {
        list.push(kind === "st" ? { id: "", label: "", icon: "", color: "blue" } : { id: "", label: "" });
        render();
        var rows = root.querySelectorAll('[data-row="' + kind + '"]');
        rows[rows.length - 1].querySelector('[data-k="label"]').focus();
      } else if (b.hasAttribute("data-mv")) {
        var i = +b.getAttribute("data-i"), j = i + +b.getAttribute("data-d"), x = list.splice(i, 1)[0];
        list.splice(j, 0, x);
        render();
      } else if (b.hasAttribute("data-rm")) {
        list.splice(+b.getAttribute("data-i"), 1);
        render();
      } else if (b.id === "stCfgDefault") {
        cfg = split(DEFAULTS);
        render('กด "บันทึก" เพื่อใช้ค่าเริ่มต้น');
      } else if (b.id === "stCfgSave") {
        var st = cfg.statuses.filter(function (x) { return x.label.trim(); });
        if (!st.length) { render("ต้องมีสถานะอย่างน้อย 1 รายการ", true); return; }
        busy = true;
        b.disabled = true;
        var locs = ["machine", "room"].reduce(function (all, k) {
          return all.concat(cfg[k].filter(function (x) { return x.label.trim(); }).map(function (x) { return { id: x.id, label: x.label, type: k }; }));
        }, []);
        call("statusConfigSave", { statuses: st, locations: locs }).then(function (r) {
          busy = false;
          cfg = split(r.config);
          data.config = r.config;
          window.dispatchEvent(new CustomEvent("lpch:status"));
          render(r.message || "บันทึกแล้ว");
        }, function (x) { busy = false; render(x.message, true); });
      }
    });

    root.innerHTML = '<p class="muted">กำลังโหลด…</p>';
    load().then(function () { cfg = split(data.config); render(); },
      function (e) { root.innerHTML = '<p class="auth-error">' + esc(e.message) + "</p>"; });
  }

  var pill = document.getElementById("myStatus");
  if (pill) pill.addEventListener("click", openEditor);
  window.addEventListener("lpch:status", renderPill);
  if (window.Auth) window.Auth.onChange(function (u) {
    data.people = []; loaded = false;
    if (u) load().catch(function () { /* shown as "ตั้งสถานะ" until it loads */ });
    renderPill();
  });

  window.Status = { load: load, openEditor: openEditor, renderPill: renderPill, mountTeam: mountTeam, mountSettings: mountSettings, badge: badge };
})();
