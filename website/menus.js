/*
 * เมนูที่ผู้ดูแลระบบจัดการเองจากหน้าเว็บ (หน้า "จัดการเมนู" #/menus)
 * - เพิ่มเมนูย่อยใต้หัวข้อหลัก (Machines, RTT, Nurse, RO, MP, Guideline) พร้อมเนื้อหาของหน้านั้น:
 *   คำอธิบาย การ์ดแอป (ปุ่ม "เปิดแอป ↗") และรายการลิงก์ — แก้ไขและลบได้
 * - เปลี่ยนชื่อและเลื่อนลำดับได้ทุกเมนู ทั้งหัวข้อหลัก เมนูย่อยเดิมของเว็บ และเมนูที่เพิ่มเอง; ซ่อน/แสดงเมนูย่อยเดิมได้
 * เก็บบนเซิร์ฟเวอร์ (Code.gs: menuList / menuSave / menuDelete / menuBuiltin / menuOrder → ชีต Menus)
 * ทุกคนเห็นเมนูเดียวกัน; โหมดทดลองเก็บในเบราว์เซอร์นี้
 */
(function () {
  "use strict";

  var S = window.SITE;
  var LOCAL_KEY = "lpch-ro-menus";
  var LINK_TYPES = ["Link", "Doc", "Sheet", "PDF", "Form", "Folder", "Slides", "Web app", "Video"];
  var APPS_SCRIPT_RE = /^https:\/\/script\.google\.com\/(a\/[^\/]+\/)?macros\/s\/[\w-]+\/(exec|dev)$/;
  var FIXED = ["home", "chat"];   // first in the menu bar; not renamed or moved here

  // The site's own menu and pages, kept so the admins' changes can be applied again from scratch.
  var baseNav = JSON.parse(JSON.stringify(S.nav));
  var baseWidgets = {}, baseTitles = {};
  Object.keys(S.pages).forEach(function (k) { baseWidgets[k] = S.pages[k].widgets; baseTitles[k] = S.pages[k].title; });
  var baseTiles = (S.quickLinks || []).map(function (q) { return q.label; });   // Home tiles follow renamed headings

  var items = [];          // from the server: custom menus, changes to the site's own menus, and orders
  var customKeys = [];     // page keys added by the last apply()
  var listeners = [];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function isAdmin() { return !!(window.Auth && window.Auth.user && window.Auth.user.isAdmin); }

  // Rows from the server (or demo storage) by kind. Old rows had no "kind".
  function kindOf(m) { return m.kind || (String(m.id).indexOf("order:") === 0 ? "order" : m.builtin ? "builtin" : "custom"); }
  function customs() { return items.filter(function (m) { return kindOf(m) === "custom"; }); }
  function builtinFix(key) { return items.filter(function (m) { return kindOf(m) === "builtin" && m.id === key; })[0] || null; }
  function orderOf(parent) {
    var o = items.filter(function (m) { return kindOf(m) === "order" && m.id === "order:" + parent; })[0];
    return o ? o.order || [] : null;
  }

  // Sort entries by a saved order (keys in it first, in that order); the rest keep their place after them.
  function byOrder(list, order) {
    if (!order) return list;
    var pos = {};
    order.forEach(function (k, i) { pos[k] = i; });
    return list.map(function (e, i) { return { e: e, i: i }; }).sort(function (a, b) {
      var pa = a.e.key in pos ? pos[a.e.key] : 1e4 + a.i, pb = b.e.key in pos ? pos[b.e.key] : 1e4 + b.i;
      return pa - pb;
    }).map(function (x) { return x.e; });
  }

  /** Main headings that can hold sub-menus, in the admins' order and with their names: [{key, label, orig}]. */
  function headings() {
    return byOrder(baseNav.filter(function (n) { return FIXED.indexOf(n.page) === -1; }).map(function (n) {
      var fix = builtinFix(n.page);
      return { key: n.page, orig: n.label, label: fix && fix.title || n.label, renamed: !!(fix && fix.title) };
    }), orderOf("_top"));
  }
  /** Kept for callers that list headings as nav items. */
  function sections() { return headings().map(function (h) { return { page: h.key, label: h.label }; }); }

  /** Everything under one heading, hidden ones included: [{key, label, orig, builtin, hidden, custom}]. */
  function entries(parent) {
    var base = baseNav.filter(function (n) { return n.page === parent; })[0];
    var own = ((base && base.children) || []).map(function (c) {
      var fix = builtinFix(c.page);
      return { key: c.page, orig: c.label, label: fix && fix.title || c.label, renamed: !!(fix && fix.title), builtin: true, hidden: !!(fix && fix.hidden) };
    });
    var added = customs().filter(function (m) { return m.parent === parent; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); })
      .map(function (m) { return { key: m.id, label: m.title, custom: m }; });
    return byOrder(own.concat(added), orderOf(parent));
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
      m.kind = "custom";
      var next = list.filter(function (x) { return kindOf(x) === "custom" && x.parent === m.parent; })
        .reduce(function (n, x) { return Math.max(n, x.order || 0); }, 0) + 1;
      if (!old) { m.id = m.parent + "/m" + Math.random().toString(16).slice(2, 10); m.order = next; list.push(m); }
      else { m.order = old.parent === m.parent ? old.order : next; list[list.indexOf(old)] = m; }
      saveLocal(list);
      return { item: m, message: 'บันทึกเมนู "' + m.title + '" แล้ว' };
    },
    menuDelete: function (r) { saveLocal(local().filter(function (x) { return x.id !== r.id; })); return { message: "ลบเมนูแล้ว" }; },
    menuBuiltin: function (r) {
      var title = String(r.title || "").trim(), hidden = !!r.hidden && r.id.indexOf("/") > 0;
      var list = local().filter(function (x) { return !(kindOf(x) === "builtin" && x.id === r.id); });
      if (title || hidden) list.push({ id: r.id, kind: "builtin", builtin: true, title: title, hidden: hidden });
      saveLocal(list);
      return { message: hidden ? "ซ่อนเมนูแล้ว" : title ? 'เปลี่ยนชื่อเป็น "' + title + '" แล้ว' : "ใช้ชื่อเดิมและแสดงเมนูแล้ว" };
    },
    menuOrder: function (r) {
      var id = "order:" + r.parent, list = local().filter(function (x) { return x.id !== id; });
      list.push({ id: id, kind: "order", parent: r.parent, order: r.order });
      saveLocal(list);
      return { message: "บันทึกลำดับแล้ว" };
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

  /* ---------------- applying the admins' menus to SITE.nav / SITE.pages ---------------- */

  function apply(list) {
    items = list || [];
    customKeys.forEach(function (k) { delete S.pages[k]; });
    customKeys = [];
    Object.keys(baseWidgets).forEach(function (k) {
      if (S.pages[k]) { S.pages[k].widgets = baseWidgets[k]; S.pages[k].title = baseTitles[k]; }
    });

    customs().forEach(function (m) {
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

    var nav = baseNav.filter(function (n) { return FIXED.indexOf(n.page) !== -1; }).map(function (n) { return JSON.parse(JSON.stringify(n)); });
    headings().forEach(function (h) {
      var n = JSON.parse(JSON.stringify(baseNav.filter(function (x) { return x.page === h.key; })[0]));
      n.label = h.label;
      if (h.renamed && S.pages[h.key]) S.pages[h.key].title = h.label;
      (S.quickLinks || []).forEach(function (q, i) { if (q.url === "#/" + h.key) q.label = h.renamed ? h.label : baseTiles[i]; });
      var kids = entries(h.key).filter(function (e) { return !e.hidden && (!e.custom || S.pages[e.key]); });
      kids.forEach(function (e) { if (e.renamed && S.pages[e.key]) S.pages[e.key].title = e.label; });
      if (kids.length) {
        n.children = kids.map(function (e) { return { label: e.label, page: e.key, custom: !!e.custom }; });
        // a heading with sub-menus lists them on its own page too
        var p = S.pages[h.key], w = (p && p.widgets) || [];
        if (p && w.indexOf("subpages") === -1) p.widgets = ["subpages"].concat(w);
      } else {
        delete n.children;
      }
      nav.push(n);
    });

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
    var isSection = headings().some(function (h) { return h.key === key; });
    if (!isSection && !p.custom) return "";
    return '<div class="menu-adminbar">' +
      (isSection ? '<a class="chip" href="#/menus?add=' + encodeURIComponent(key) + '">＋ เพิ่มเมนูย่อยใน ' + esc(p.title || key) + "</a>" : "") +
      (p.custom ? '<a class="chip" href="#/menus?edit=' + encodeURIComponent(key) + '">✏️ แก้ไขเมนูนี้</a>' : "") +
      '<a class="chip" href="#/menus">⚙️ จัดการเมนู</a></div>';
  }

  /* ---------------- the "จัดการเมนู" page ---------------- */

  function mount(root, opts) {
    opts = opts || {};
    var editing = null;    // the custom menu in the editor (a copy), or null
    var renaming = null;   // key of the site's own menu being renamed in its row
    var busy = false;

    function moveButtons(parent, key, i, n) {
      return '<button type="button" class="chip" data-move="' + esc(key) + '" data-parent="' + esc(parent) + '" data-dir="-1"' + (i === 0 ? " disabled" : "") + ' aria-label="เลื่อนขึ้น">↑</button>' +
        '<button type="button" class="chip" data-move="' + esc(key) + '" data-parent="' + esc(parent) + '" data-dir="1"' + (i === n - 1 ? " disabled" : "") + ' aria-label="เลื่อนลง">↓</button>';
    }

    // Row for a heading or one of the site's own sub-menus: rename in place, move, hide.
    function ownRow(parent, e, i, n, canHide) {
      if (renaming === e.key) {
        return '<li class="menu-row renaming"><form class="menu-rename" data-key="' + esc(e.key) + '">' +
          '<input maxlength="60" value="' + esc(e.label) + '" aria-label="ชื่อใหม่ของ ' + esc(e.orig) + '" placeholder="' + esc(e.orig) + '">' +
          '<button type="submit" class="chip primary">บันทึก</button>' +
          (e.renamed ? '<button type="button" class="chip" data-reset="' + esc(e.key) + '">คืนชื่อเดิม (' + esc(e.orig) + ")</button>" : "") +
          '<button type="button" class="chip" data-rename-cancel>ยกเลิก</button></form></li>';
      }
      return '<li class="menu-row' + (e.hidden ? " is-hidden" : "") + '"><span class="menu-name">' + esc(e.label) + "</span>" +
        '<span class="menu-tag">เมนูเดิม' + (e.renamed ? " · ชื่อเดิม " + esc(e.orig) : "") + (e.hidden ? " · ซ่อนอยู่" : "") + "</span>" +
        '<span class="menu-acts">' + moveButtons(parent, e.key, i, n) +
          '<button type="button" class="chip" data-rename="' + esc(e.key) + '">✏️ เปลี่ยนชื่อ</button>' +
          (canHide ? '<button type="button" class="chip" data-hide="' + esc(e.key) + '" data-to="' + (e.hidden ? "0" : "1") + '">' + (e.hidden ? "👁 แสดง" : "🙈 ซ่อน") + "</button>" : "") +
        "</span></li>";
    }

    function customRow(parent, e, i, n) {
      var m = e.custom;
      return '<li class="menu-row"><a class="menu-name" href="#/' + esc(m.id) + '">' + esc((m.icon ? m.icon + " " : "") + m.title) + "</a>" +
        '<span class="menu-tag custom">เพิ่มเอง · ' + ((m.apps || []).length + (m.links || []).length) + " ลิงก์</span>" +
        '<span class="menu-acts">' + moveButtons(parent, m.id, i, n) +
          '<button type="button" class="chip" data-edit="' + esc(m.id) + '">✏️ แก้ไข</button>' +
          '<button type="button" class="chip danger" data-del="' + esc(m.id) + '">🗑 ลบ</button>' +
        "</span></li>";
    }

    function render() {
      var html = '<p class="menus-help">เปลี่ยนชื่อและเลื่อนลำดับได้ทุกเมนู · เพิ่มเมนูย่อยใต้หัวข้อหลักได้ทุกหัวข้อ ' +
        '(แต่ละเมนูเป็นหน้าใหม่ที่มีคำอธิบาย การ์ดแอป และรายการลิงก์) · เมนูย่อยเดิมของเว็บซ่อนได้ · ทุกคนเห็นเมนูเดียวกันทันทีที่บันทึก</p>' +
        '<p class="menus-msg" role="status" hidden></p>';
      if (editing) html += editorHtml();
      var heads = headings();
      html += '<div class="card menu-section menu-top"><div class="menu-head"><h3>หัวข้อหลัก (แถบเมนูด้านบน)</h3></div>' +
        '<p class="muted menu-note">Home และ แชท อยู่หน้าสุดเสมอ</p><ul class="menu-list">' +
        heads.map(function (h, i) { return ownRow("_top", h, i, heads.length, false); }).join("") + "</ul></div>";
      html += heads.map(function (h) {
        var list = entries(h.key);
        var rows = list.map(function (e, i) { return e.custom ? customRow(h.key, e, i, list.length) : ownRow(h.key, e, i, list.length, true); }).join("");
        return '<div class="card menu-section"><div class="menu-head"><h3>' + esc(h.label) + "</h3>" +
          '<button type="button" class="chip primary" data-add="' + esc(h.key) + '">＋ เพิ่มเมนูย่อย</button></div>' +
          (rows ? '<ul class="menu-list">' + rows + "</ul>" : '<p class="muted">ยังไม่มีเมนูย่อย</p>') + "</div>";
      }).join("");
      root.innerHTML = html;
      if (editing) wireEditor();
      var rn = root.querySelector(".menu-rename");
      if (rn) {
        var input = rn.querySelector("input");
        input.focus(); input.select();
        rn.addEventListener("submit", function (ev) {
          ev.preventDefault();
          var key = rn.getAttribute("data-key"), fix = builtinFix(key);
          var e = findEntry(key), title = input.value.replace(/\s+/g, " ").trim();
          renaming = null;
          // the original name (or nothing) means "no new name"
          act(call("menuBuiltin", { id: key, title: title === (e && e.orig) ? "" : title, hidden: !!(fix && fix.hidden) }));
        });
      }
    }

    function findEntry(key) {
      var all = headings();
      headings().forEach(function (h) { all = all.concat(entries(h.key)); });
      return all.filter(function (e) { return e.key === key; })[0] || null;
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
      if (!b || busy || b.disabled || b.type === "submit") return;
      var id;
      if ((id = b.getAttribute("data-add")) !== null) startEdit({ parent: id, title: "", lead: "", icon: "", apps: [], links: [blankLink()] });
      else if ((id = b.getAttribute("data-edit")) !== null) startEdit(customs().filter(function (m) { return m.id === id; })[0]);
      else if ((id = b.getAttribute("data-move")) !== null) {
        var parent = b.getAttribute("data-parent");
        var keys = (parent === "_top" ? headings() : entries(parent)).map(function (e) { return e.key; });
        var i = keys.indexOf(id), j = i + (+b.getAttribute("data-dir") < 0 ? -1 : 1);
        if (i < 0 || j < 0 || j >= keys.length) return;
        keys.splice(i, 1); keys.splice(j, 0, id);
        act(call("menuOrder", { parent: parent, order: keys }), "เลื่อนลำดับแล้ว");
      }
      else if ((id = b.getAttribute("data-rename")) !== null) { renaming = id; render(); }
      else if (b.hasAttribute("data-rename-cancel")) { renaming = null; render(); }
      else if ((id = b.getAttribute("data-reset")) !== null) {
        var f = builtinFix(id);
        renaming = null;
        act(call("menuBuiltin", { id: id, title: "", hidden: !!(f && f.hidden) }));
      }
      else if ((id = b.getAttribute("data-hide")) !== null) {
        var fx = builtinFix(id);
        act(call("menuBuiltin", { id: id, title: fx && fx.title || "", hidden: b.getAttribute("data-to") === "1" }));
      }
      else if ((id = b.getAttribute("data-del")) !== null) {
        var m = customs().filter(function (x) { return x.id === id; })[0];
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
      else if (opts.edit) startEdit(customs().filter(function (m) { return m.id === opts.edit; })[0]);
      else render();
    });
  }

  window.Menus = { load: load, apply: apply, onChange: onChange, adminBar: adminBar, mount: mount, sections: sections };
})();
