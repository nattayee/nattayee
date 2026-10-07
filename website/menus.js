/*
 * เมนูย่อยที่ผู้ดูแลระบบเพิ่มเองจากหน้าเว็บ (หน้า "จัดการเมนู" #/menus)
 * - เพิ่มเมนูย่อยใต้หัวข้อหลัก (Machines, RTT, Nurse, RO, MP, Guideline) พร้อมเนื้อหาของหน้านั้น:
 *   คำอธิบาย การ์ดแอป (ปุ่ม "เปิดแอป ↗") และรายการลิงก์
 * - แก้ไข ลบ เลื่อนลำดับ และซ่อน/แสดงเมนูย่อยเดิมของเว็บ
 * เก็บบนเซิร์ฟเวอร์ (Code.gs: menuList / menuSave / menuDelete / menuMove / menuHide → ชีต Menus)
 * ทุกคนเห็นเมนูเดียวกัน; โหมดทดลองเก็บในเบราว์เซอร์นี้
 */
(function () {
  "use strict";

  var S = window.SITE;
  var LOCAL_KEY = "lpch-ro-menus";
  var LINK_TYPES = ["Link", "Doc", "Sheet", "PDF", "Form", "Folder", "Slides", "Web app", "Video"];
  var APPS_SCRIPT_RE = /^https:\/\/script\.google\.com\/(a\/[^\/]+\/)?macros\/s\/[\w-]+\/(exec|dev)$/;

  // The site's own menu and pages, kept so custom menus can be applied again from scratch.
  var baseNav = JSON.parse(JSON.stringify(S.nav));
  var baseWidgets = {};
  Object.keys(S.pages).forEach(function (k) { baseWidgets[k] = S.pages[k].widgets; });

  var items = [];          // from the server: custom menus and hidden built-in ones
  var customKeys = [];     // page keys added by the last apply()
  var listeners = [];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function isAdmin() { return !!(window.Auth && window.Auth.user && window.Auth.user.isAdmin); }

  /** Top-level headings that can hold sub-menus. */
  function sections() {
    return baseNav.filter(function (n) { return n.page !== "home" && n.page !== "chat"; });
  }

  /* ---------------- storage (server, or this browser in demo mode) ---------------- */

  function local() {
    try { var v = JSON.parse(localStorage.getItem(LOCAL_KEY)); if (Array.isArray(v)) return v; } catch (e) { /* ignore */ }
    return [];
  }
  function saveLocal(list) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ } }

  // Demo mode mirrors the server actions so the page behaves the same.
  var demo = {
    menuList: function () { return { items: local() }; },
    menuSave: function (r) {
      var list = local(), m = r.item, old = m.id && list.filter(function (x) { return x.id === m.id; })[0];
      if (!old) {
        m.id = m.parent + "/m" + Math.random().toString(16).slice(2, 10);
        m.order = list.filter(function (x) { return x.parent === m.parent; }).reduce(function (n, x) { return Math.max(n, x.order || 0); }, 0) + 1;
        list.push(m);
      } else {
        if (old.parent !== m.parent) m.order = list.filter(function (x) { return x.parent === m.parent; }).length + 1;
        else m.order = old.order;
        list[list.indexOf(old)] = m;
      }
      saveLocal(list);
      return { item: m, message: 'บันทึกเมนู "' + m.title + '" แล้ว' };
    },
    menuDelete: function (r) { saveLocal(local().filter(function (x) { return x.id !== r.id; })); return { message: "ลบเมนูแล้ว" }; },
    menuMove: function (r) {
      var list = local(), me = list.filter(function (x) { return x.id === r.id; })[0];
      var sibs = list.filter(function (x) { return !x.builtin && x.parent === me.parent; }).sort(function (a, b) { return a.order - b.order; });
      var i = sibs.indexOf(me), j = i + (r.dir < 0 ? -1 : 1);
      if (j >= 0 && j < sibs.length) { sibs.splice(i, 1); sibs.splice(j, 0, me); sibs.forEach(function (x, k) { x.order = k + 1; }); }
      saveLocal(list);
      return {};
    },
    menuHide: function (r) {
      var list = local().filter(function (x) { return !(x.builtin && x.id === r.id); });
      if (r.hidden) list.push({ id: r.id, builtin: true, hidden: true });
      saveLocal(list);
      return {};
    }
  };

  function call(action, data) {
    if (window.Auth.remote) return window.Auth.call(action, data);
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        try { resolve(demo[action](JSON.parse(JSON.stringify(data || {})))); } catch (e) { reject(e); }
      }, 80);
    });
  }

  /* ---------------- applying custom menus to SITE.nav / SITE.pages ---------------- */

  function apply(list) {
    items = list || [];
    customKeys.forEach(function (k) { delete S.pages[k]; });
    customKeys = [];
    Object.keys(baseWidgets).forEach(function (k) { if (S.pages[k]) S.pages[k].widgets = baseWidgets[k]; });
    var nav = JSON.parse(JSON.stringify(baseNav));

    var hidden = {};
    items.forEach(function (m) { if (m.builtin && m.hidden) hidden[m.id] = true; });
    nav.forEach(function (n) {
      if (n.children) n.children = n.children.filter(function (c) { return !hidden[c.page]; });
    });

    items.filter(function (m) { return !m.builtin; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); })
      .forEach(function (m) {
        var parent = nav.filter(function (n) { return n.page === m.parent; })[0];
        if (!parent) return;   // its heading no longer exists
        (parent.children = parent.children || []).push({ label: m.title, page: m.id, custom: true });
        S.pages[m.id] = {
          title: m.title,
          lead: m.lead,
          custom: true,
          apps: (m.apps || []).length ? m.apps.map(function (a) {
            return { icon: a.icon || m.icon || "🔗", label: a.label, desc: a.desc, url: a.url, sso: !!a.sso,
              note: "เปิดในแท็บใหม่" + (a.sso ? " · เข้าสู่ระบบให้อัตโนมัติด้วยบัญชี LPCH RO Workspace" : "") };
          }) : undefined,
          groups: (m.links || []).length ? [{ title: m.title, icon: m.icon || "🔗", items: m.links }] : undefined
        };
        customKeys.push(m.id);
      });

    // A heading that now has sub-menus lists them on its own page too.
    nav.forEach(function (n) {
      var p = S.pages[n.page];
      if (!p || !n.children || !n.children.length) return;
      var w = p.widgets || [];
      if (w.indexOf("subpages") === -1) p.widgets = ["subpages"].concat(w);
    });
    nav.forEach(function (n) { if (n.children && !n.children.length) delete n.children; });

    S.nav.length = 0;
    nav.forEach(function (n) { S.nav.push(n); });
    listeners.forEach(function (cb) { cb(); });
  }

  function load() {
    return call("menuList").then(function (r) { apply(r.items || []); }, function () { apply([]); });
  }

  function onChange(cb) { listeners.push(cb); }

  /* ---------------- admin bits on ordinary pages ---------------- */

  /** A small bar for admins: on a heading page add a sub-menu, on a custom page edit it. */
  function adminBar(key) {
    if (!isAdmin()) return "";
    var p = S.pages[key] || {};
    var isSection = sections().some(function (n) { return n.page === key; });
    if (!isSection && !p.custom) return "";
    return '<div class="menu-adminbar">' +
      (isSection ? '<a class="chip" href="#/menus?add=' + encodeURIComponent(key) + '">＋ เพิ่มเมนูย่อยใน ' + esc(p.title || key) + "</a>" : "") +
      (p.custom ? '<a class="chip" href="#/menus?edit=' + encodeURIComponent(key) + '">✏️ แก้ไขเมนูนี้</a>' : "") +
      '<a class="chip" href="#/menus">⚙️ จัดการเมนู</a></div>';
  }

  /* ---------------- the "จัดการเมนู" page ---------------- */

  function mount(root, opts) {
    opts = opts || {};
    var editing = null;   // the menu in the editor (a copy), or null
    var busy = false;

    function sectionLabel(key) {
      var n = baseNav.filter(function (x) { return x.page === key; })[0];
      return n ? n.label : key;
    }

    function render() {
      var hidden = {};
      items.forEach(function (m) { if (m.builtin && m.hidden) hidden[m.id] = true; });
      var html = '<p class="menus-help">เพิ่มเมนูย่อยใต้หัวข้อหลักได้ทุกหัวข้อ แต่ละเมนูเป็นหน้าใหม่ที่มีคำอธิบาย การ์ดแอป และรายการลิงก์ ' +
        'ทุกคนจะเห็นเมนูเดียวกันทันทีที่บันทึก · เมนูเดิมของเว็บซ่อนได้แต่แก้ไขไม่ได้</p>' +
        '<p class="menus-msg" role="status" hidden></p>';
      if (editing) html += editorHtml();
      html += sections().map(function (n) {
        var builtin = (n.children || []).map(function (c) {
          var h = !!hidden[c.page];
          return '<li class="menu-row' + (h ? " is-hidden" : "") + '"><span class="menu-name">' + esc(c.label) + "</span>" +
            '<span class="menu-tag">เมนูเดิม' + (h ? " · ซ่อนอยู่" : "") + "</span>" +
            '<span class="menu-acts"><button type="button" class="chip" data-hide="' + esc(c.page) + '" data-to="' + (h ? "0" : "1") + '">' +
            (h ? "👁 แสดง" : "🙈 ซ่อน") + "</button></span></li>";
        }).join("");
        var mine = items.filter(function (m) { return !m.builtin && m.parent === n.page; })
          .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        var custom = mine.map(function (m, i) {
          return '<li class="menu-row"><a class="menu-name" href="#/' + esc(m.id) + '">' + esc((m.icon ? m.icon + " " : "") + m.title) + "</a>" +
            '<span class="menu-tag custom">เพิ่มเอง · ' + ((m.apps || []).length + (m.links || []).length) + " ลิงก์</span>" +
            '<span class="menu-acts">' +
              '<button type="button" class="chip" data-move="' + esc(m.id) + '" data-dir="-1"' + (i === 0 ? " disabled" : "") + ' aria-label="เลื่อนขึ้น">↑</button>' +
              '<button type="button" class="chip" data-move="' + esc(m.id) + '" data-dir="1"' + (i === mine.length - 1 ? " disabled" : "") + ' aria-label="เลื่อนลง">↓</button>' +
              '<button type="button" class="chip" data-edit="' + esc(m.id) + '">✏️ แก้ไข</button>' +
              '<button type="button" class="chip danger" data-del="' + esc(m.id) + '">🗑 ลบ</button>' +
            "</span></li>";
        }).join("");
        return '<div class="card menu-section"><div class="menu-head"><h3>' + esc(n.label) + "</h3>" +
          '<button type="button" class="chip primary" data-add="' + esc(n.page) + '">＋ เพิ่มเมนูย่อย</button></div>' +
          (builtin || custom ? '<ul class="menu-list">' + builtin + custom + "</ul>" : '<p class="muted">ยังไม่มีเมนูย่อย</p>') + "</div>";
      }).join("");
      root.innerHTML = html;
      if (editing) wireEditor();
    }

    function say(text, bad) {
      var el = root.querySelector(".menus-msg");
      if (!el) return;
      el.textContent = text || ""; el.hidden = !text; el.classList.toggle("bad", !!bad);
    }

    /* ---- editor ---- */

    function blankLink() { return { label: "", url: "", type: "Link", sso: false }; }
    function blankApp() { return { icon: "", label: "", desc: "", url: "", sso: false }; }

    function editorHtml() {
      var m = editing;
      var opts = sections().map(function (n) {
        return '<option value="' + esc(n.page) + '"' + (n.page === m.parent ? " selected" : "") + ">" + esc(n.label) + "</option>";
      }).join("");
      var apps = m.apps.map(function (a, i) {
        return '<div class="menu-sub" data-app="' + i + '">' +
          '<div class="menu-grid">' +
            field("ชื่อแอป", '<input data-f="label" maxlength="80" value="' + esc(a.label) + '" placeholder="เช่น Linac QA">') +
            field("ไอคอน", '<input data-f="icon" maxlength="8" value="' + esc(a.icon) + '" placeholder="⚙️">', "narrow") +
          "</div>" +
          field("คำอธิบาย", '<input data-f="desc" maxlength="200" value="' + esc(a.desc) + '">') +
          field("ลิงก์ (URL)", '<input data-f="url" maxlength="1000" value="' + esc(a.url === "#" ? "" : a.url) + '" placeholder="https://…" inputmode="url">') +
          '<label class="menu-check"><input type="checkbox" data-f="sso"' + (a.sso ? " checked" : "") + "> เข้าสู่ระบบให้อัตโนมัติด้วยบัญชี LPCH (เฉพาะเว็บแอป Apps Script ที่เชื่อมไว้แล้ว เช่น TRS-398, Linac QA)</label>" +
          '<button type="button" class="chip danger" data-rm-app="' + i + '">ลบการ์ดนี้</button></div>';
      }).join("");
      var links = m.links.map(function (l, i) {
        var types = LINK_TYPES.map(function (t) { return '<option' + (t === l.type ? " selected" : "") + ">" + esc(t) + "</option>"; }).join("");
        return '<div class="menu-link" data-link="' + i + '">' +
          '<input data-f="label" maxlength="100" value="' + esc(l.label) + '" placeholder="ชื่อลิงก์" aria-label="ชื่อลิงก์ ' + (i + 1) + '">' +
          '<input data-f="url" maxlength="1000" value="' + esc(l.url === "#" ? "" : l.url) + '" placeholder="https://… (เว้นว่าง = รอใส่ลิงก์)" inputmode="url" aria-label="ลิงก์ ' + (i + 1) + '">' +
          '<select data-f="type" aria-label="ประเภท ' + (i + 1) + '">' + types + "</select>" +
          '<button type="button" class="chip danger" data-rm-link="' + i + '" aria-label="ลบลิงก์ ' + (i + 1) + '">✕</button></div>';
      }).join("");
      return '<form class="card menu-editor" novalidate>' +
        "<h3>" + (m.id ? "แก้ไขเมนู" : "เพิ่มเมนูย่อย") + "</h3>" +
        '<div class="menu-grid">' +
          field("อยู่ใต้หัวข้อ", '<select data-m="parent">' + opts + "</select>") +
          field("ไอคอน (ไม่บังคับ)", '<input data-m="icon" maxlength="8" value="' + esc(m.icon) + '" placeholder="📁">', "narrow") +
        "</div>" +
        field("ชื่อเมนู *", '<input data-m="title" maxlength="60" value="' + esc(m.title) + '" required placeholder="เช่น CT Simulator QA">') +
        field("คำอธิบายใต้ชื่อหน้า", '<input data-m="lead" maxlength="200" value="' + esc(m.lead) + '">') +
        '<fieldset><legend>การ์ดแอป (ปุ่ม "เปิดแอป ↗" ขนาดใหญ่)</legend>' + (apps || '<p class="muted">ไม่มี</p>') +
          '<button type="button" class="chip" data-add-app' + (m.apps.length >= 5 ? " disabled" : "") + ">＋ เพิ่มการ์ดแอป</button></fieldset>" +
        '<fieldset><legend>รายการลิงก์</legend>' + (links || '<p class="muted">ไม่มี</p>') +
          '<button type="button" class="chip" data-add-link' + (m.links.length >= 40 ? " disabled" : "") + ">＋ เพิ่มลิงก์</button></fieldset>" +
        '<p class="auth-error menu-err" role="alert" hidden></p>' +
        '<div class="menu-buttons"><button type="submit" class="auth-submit">บันทึก</button>' +
          '<button type="button" class="chip" data-cancel>ยกเลิก</button>' +
          (m.id ? '<a class="chip" href="#/' + esc(m.id) + '">ดูหน้านี้</a>' : "") + "</div>" +
      "</form>";
    }

    function field(label, input, cls) {
      return '<label class="menu-field' + (cls ? " " + cls : "") + '"><span>' + label + "</span>" + input + "</label>";
    }

    // Copy what is typed back into `editing` (before re-rendering or saving).
    function readEditor() {
      var f = root.querySelector(".menu-editor");
      if (!f || !editing) return;
      ["parent", "icon", "title", "lead"].forEach(function (k) {
        var el = f.querySelector('[data-m="' + k + '"]');
        if (el) editing[k] = el.value;
      });
      f.querySelectorAll("[data-app]").forEach(function (row) {
        var a = editing.apps[+row.getAttribute("data-app")];
        row.querySelectorAll("[data-f]").forEach(function (el) { a[el.getAttribute("data-f")] = el.type === "checkbox" ? el.checked : el.value; });
      });
      f.querySelectorAll("[data-link]").forEach(function (row) {
        var l = editing.links[+row.getAttribute("data-link")];
        row.querySelectorAll("[data-f]").forEach(function (el) { l[el.getAttribute("data-f")] = el.value; });
      });
    }

    function validate(m) {
      if (!m.title.trim()) return "กรุณาใส่ชื่อเมนู";
      var bad = null;
      m.apps.concat(m.links).some(function (x) {
        var u = String(x.url || "").trim();
        if (!x.label.trim() && !u) return false;   // empty row: dropped
        if (!x.label.trim()) { bad = "ทุกการ์ดและลิงก์ต้องมีชื่อ"; return true; }
        if (u && u !== "#" && !/^https?:\/\/\S+$/i.test(u)) { bad = 'ลิงก์ของ "' + x.label + '" ต้องขึ้นต้นด้วย https://'; return true; }
        if (x.sso && !APPS_SCRIPT_RE.test(u)) { bad = '"' + x.label + '": เข้าสู่ระบบอัตโนมัติได้เฉพาะลิงก์เว็บแอป Apps Script (https://script.google.com/macros/s/…/exec)'; return true; }
        return false;
      });
      return bad;
    }

    function wireEditor() {
      var f = root.querySelector(".menu-editor");
      var err = f.querySelector(".menu-err");
      f.querySelector("[data-add-app]").addEventListener("click", function () { readEditor(); editing.apps.push(blankApp()); render(); });
      f.querySelector("[data-add-link]").addEventListener("click", function () {
        readEditor(); editing.links.push(blankLink()); render();
        var rows = root.querySelectorAll(".menu-link");
        if (rows.length) rows[rows.length - 1].querySelector("input").focus();
      });
      f.querySelectorAll("[data-rm-app]").forEach(function (b) {
        b.addEventListener("click", function () { readEditor(); editing.apps.splice(+b.getAttribute("data-rm-app"), 1); render(); });
      });
      f.querySelectorAll("[data-rm-link]").forEach(function (b) {
        b.addEventListener("click", function () { readEditor(); editing.links.splice(+b.getAttribute("data-rm-link"), 1); render(); });
      });
      f.querySelector("[data-cancel]").addEventListener("click", function () { editing = null; render(); });
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        if (busy) return;
        readEditor();
        var problem = validate(editing);
        if (problem) { err.textContent = problem; err.hidden = false; return; }
        busy = true;
        f.querySelector(".auth-submit").disabled = true;
        var item = {
          id: editing.id || "", parent: editing.parent, title: editing.title.trim(), lead: editing.lead.trim(), icon: editing.icon.trim(),
          apps: editing.apps, links: editing.links
        };
        call("menuSave", { item: item }).then(function (r) {
          busy = false;
          editing = null;
          return load().then(function () { render(); say(r.message || "บันทึกแล้ว"); });
        }, function (x) {
          busy = false;
          f.querySelector(".auth-submit").disabled = false;
          err.textContent = x.message; err.hidden = false;
        });
      });
      var first = f.querySelector('[data-m="title"]');
      if (first && !editing.id) first.focus();
    }

    function startEdit(m) {
      editing = m ? JSON.parse(JSON.stringify(m)) : null;
      if (editing) {
        editing.apps = (editing.apps || []).map(function (a) { return Object.assign(blankApp(), a); });
        editing.links = (editing.links || []).map(function (l) { return Object.assign(blankLink(), l); });
        ["title", "lead", "icon"].forEach(function (k) { editing[k] = editing[k] || ""; });
      }
      render();
      var ed = root.querySelector(".menu-editor");
      if (ed && ed.scrollIntoView) ed.scrollIntoView({ block: "start" });
    }

    function act(promise, done) {
      busy = true;
      promise.then(function (r) {
        busy = false;
        return load().then(function () { render(); if (done || (r && r.message)) say(done || r.message); });
      }, function (x) { busy = false; say(x.message, true); });
    }

    root.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("button");
      if (!b || busy || b.disabled) return;
      var id;
      if ((id = b.getAttribute("data-add")) !== null) startEdit({ parent: id, title: "", lead: "", icon: "", apps: [], links: [blankLink()] });
      else if ((id = b.getAttribute("data-edit")) !== null) startEdit(items.filter(function (m) { return m.id === id; })[0]);
      else if ((id = b.getAttribute("data-move")) !== null) act(call("menuMove", { id: id, dir: +b.getAttribute("data-dir") }));
      else if ((id = b.getAttribute("data-hide")) !== null) act(call("menuHide", { id: id, hidden: b.getAttribute("data-to") === "1" }));
      else if ((id = b.getAttribute("data-del")) !== null) {
        var m = items.filter(function (x) { return x.id === id; })[0];
        if (b.getAttribute("data-sure") !== "1") {   // two-step delete, no browser dialog (blocked in Apps Script)
          b.setAttribute("data-sure", "1");
          b.textContent = "ยืนยันลบ?";
          setTimeout(function () { if (b.isConnected) { b.removeAttribute("data-sure"); b.textContent = "🗑 ลบ"; } }, 4000);
          return;
        }
        if (editing && editing.id === id) editing = null;
        act(call("menuDelete", { id: id }), 'ลบเมนู "' + (m ? m.title : "") + '" แล้ว');
      }
    });

    root.innerHTML = '<p class="muted">กำลังโหลด…</p>';
    load().then(function () {
      if (opts.add) startEdit({ parent: opts.add, title: "", lead: "", icon: "", apps: [], links: [blankLink()] });
      else if (opts.edit) startEdit(items.filter(function (m) { return m.id === opts.edit; })[0]);
      else render();
    });
  }

  window.Menus = { load: load, apply: apply, onChange: onChange, adminBar: adminBar, mount: mount, sections: sections };
})();
