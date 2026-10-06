/*
 * ข้อความส่วนตัว (Inbox) — ส่งข้อความตัวต่อตัวระหว่างสมาชิก แนบรูปได้ ตอบกลับ และกด ✓ ถูก / ✗ ผิด
 * เห็นเฉพาะผู้ส่งและผู้รับ (เซิร์ฟเวอร์ Code.gs ตรวจสิทธิ์ทุกคำขอ) แยกจากแชทประกาศหน้าหลัก
 *
 * Backend: Code.gs (dmList, dmThread, dmSend, dmRead, dmReact, dmDelete, dmImage) เมื่อเปิดผ่าน Apps Script
 * หรือใส่ auth.apiUrl, ไม่เช่นนั้นใช้โหมดทดลองที่เก็บในเบราว์เซอร์นี้
 */
(function () {
  "use strict";

  var S = window.SITE;
  var C = S.chat || {};
  var MAX_IMAGES = C.maxImages || 4;
  var POLL_MS = (C.pollSeconds || 15) * 1000;
  var BADGE_MS = 30000;
  var ROLE_GROUPS = (C.roles || ["RO", "MP", "RTT", "Nurse"]).concat(["Other"]);
  var REACT = { ok: { icon: "✓", label: "ถูก" }, no: { icon: "✗", label: "ผิด" } };
  var BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function linkify(text) {
    return esc(text).replace(/https?:\/\/[^\s<]+/g, function (u) { return '<a href="' + u + '" target="_blank" rel="noopener">' + u + "</a>"; });
  }
  function snippet(text, n) {
    var t = String(text || "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n) + "…" : t;
  }
  function fmtTime(ms) {
    var d = new Date(ms), now = new Date();
    var t = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === now.toDateString()) return t;
    return d.toLocaleDateString("th-TH", { day: "numeric", month: "short" }) + " " + t;
  }
  function fmtFull(ms) {
    var d = new Date(ms);
    return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) + " " +
      d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  function initial(name) { return String(name || "?").trim().replace(/^[เ-ไ]/, "").charAt(0) || "?"; }
  function me() { var u = window.Auth && window.Auth.user; return u ? { username: u.username, name: u.fullName, role: u.role } : null; }
  function key(p) { return "u_" + String(p.username).replace(/\W/g, "_"); }

  function compress(file, maxSide, quality) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        var c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        var ctx = c.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("อ่านไฟล์รูปไม่ได้")); };
      img.src = url;
    });
  }

  /* ---------------- demo backend (mirrors the dm* actions in Code.gs) ---------------- */

  var LocalDM = (function () {
    var KEY = "lpch-ro-dm-v1";
    function all() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
    function save(list) {
      try { localStorage.setItem(KEY, JSON.stringify(list)); }
      catch (e) { throw new Error("พื้นที่เก็บข้อมูลในเบราว์เซอร์เต็ม (โหมดทดลอง) — ลองลดจำนวนรูป"); }
    }
    function convo(a, b) { return [a, b].sort().join("|"); }
    function mine(list, u) { return list.filter(function (m) { return m.from.username === u || m.to.username === u; }); }
    function people() {
      return window.Auth.directory().then(function (list) {
        var out = {};
        list.forEach(function (u) { out[u.username] = { username: u.username, name: u.fullName, role: u.role, active: true }; });
        return out;
      });
    }
    function need() { var m = me(); if (!m) throw new Error("กรุณาเข้าสู่ระบบใหม่"); return m; }
    function find(list, id) { return list.filter(function (m) { return m.id === id; })[0]; }

    var actions = {
      dmList: function () {
        var u = need();
        return people().then(function (dir) {
          var convos = {}, unread = 0;
          mine(all(), u.username).forEach(function (m) {
            var p = m.from.username === u.username ? m.to : m.from;
            var c = convos[p.username] || (convos[p.username] = { partner: dir[p.username] || p, last: null, unread: 0 });
            if (!c.last || m.createdAt > c.last.createdAt) c.last = { text: snippet(m.text, 80) || (m.images.length ? "(รูปภาพ)" : ""), createdAt: m.createdAt, fromMe: m.from.username === u.username };
            if (m.to.username === u.username && !m.readAt) { c.unread++; unread++; }
          });
          var list = Object.keys(convos).map(function (k) { return convos[k]; });
          list.sort(function (a, b) { return b.last.createdAt - a.last.createdAt; });
          return { conversations: list, unread: unread };
        });
      },
      dmThread: function (r) {
        var u = need();
        return people().then(function (dir) {
          var k = convo(u.username, r["with"]);
          var partner = dir[r["with"]] || mine(all(), u.username).map(function (m) { return m.from.username === r["with"] ? m.from : m.to.username === r["with"] ? m.to : null; }).filter(Boolean)[0];
          if (!partner) throw new Error("ไม่พบสมาชิก");
          var msgs = all().filter(function (m) { return convo(m.from.username, m.to.username) === k; });
          msgs.sort(function (a, b) { return a.createdAt - b.createdAt; });
          return { partner: partner, messages: msgs };
        });
      },
      dmSend: function (r) {
        var u = need();
        return people().then(function (dir) {
          var to = dir[r.to];
          if (!to) throw new Error("ไม่พบผู้รับ หรือบัญชีผู้รับยังไม่เปิดใช้งาน");
          if (to.username === u.username) throw new Error("ส่งข้อความถึงตัวเองไม่ได้");
          var list = all();
          var msg = { id: "dm" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), from: u,
            to: { username: to.username, name: to.name, role: to.role }, text: String(r.text || "").trim(),
            images: r.images || [], createdAt: Date.now(), readAt: null, reactions: {}, reactionLog: [] };
          var orig = r.replyTo && find(list, r.replyTo);
          if (orig) msg.replyTo = { id: orig.id, name: orig.from.name, text: snippet(orig.text, 120) || "(รูปภาพ)" };
          list.push(msg);
          save(list);
          return { message: msg };
        });
      },
      dmRead: function (r) {
        var u = need(), list = all(), n = 0;
        list.forEach(function (m) {
          if (m.from.username === r["with"] && m.to.username === u.username && !m.readAt) { m.readAt = Date.now(); n++; }
        });
        if (n) save(list);
        return { count: n };
      },
      dmReact: function (r) {
        var u = need(), list = all(), m = find(list, r.id);
        if (!m || (m.from.username !== u.username && m.to.username !== u.username)) throw new Error("ไม่พบข้อความ");
        if (m.to.username !== u.username) throw new Error("กด ✓/✗ ได้เฉพาะผู้รับข้อความนี้");
        var cur = m.reactions[key(u)];
        if (!cur || cur.type !== r.type) {
          var rec = { username: u.username, name: u.name, role: u.role, at: Date.now(), type: r.type };
          m.reactions[key(u)] = rec;
          m.reactionLog.push(rec);
          save(list);
        }
        return { message: m };
      },
      dmDelete: function (r) {
        var u = need(), list = all(), m = find(list, r.id);
        if (m && m.from.username !== u.username) throw new Error("ลบได้เฉพาะข้อความที่คุณส่ง");
        save(list.filter(function (x) { return x.id !== r.id; }));
        return { deleted: r.id };
      },
    };

    return function (action, data) {
      return new Promise(function (resolve) { setTimeout(resolve, 60); })
        .then(function () { return actions[action](data || {}); });
    };
  })();

  function api(action, data) {
    return window.Auth.remote ? window.Auth.call(action, data) : LocalDM(action, data);
  }

  /* Private images ("dm:<fileId>") are fetched per message and cached for the session. */
  var imageCache = {};
  function hydrate(rootEl) {
    rootEl.querySelectorAll("img[data-dm-img]").forEach(function (img) {
      var fileId = img.getAttribute("data-dm-img"), id = img.getAttribute("data-msg-id");
      if (!imageCache[fileId]) imageCache[fileId] = api("dmImage", { id: id, fileId: fileId }).then(function (r) { return r.dataUrl; });
      imageCache[fileId].then(function (src) { img.src = src; img.classList.remove("loading"); }, function () {
        delete imageCache[fileId];
        img.alt = "โหลดรูปไม่สำเร็จ";
        img.classList.remove("loading");
      });
    });
  }

  /* ---------------- unread badge in the header ---------------- */

  var badgeTimer = null;
  function refreshBadge() {
    var el = document.getElementById("dmBadge");
    if (!el || !me()) return Promise.resolve();
    return api("dmList").then(function (r) {
      el.textContent = r.unread > 99 ? "99+" : String(r.unread);
      el.hidden = !r.unread;
    }, function () { /* try again on the next tick */ });
  }
  function startBadge() {
    stopBadge();
    refreshBadge();
    badgeTimer = setInterval(function () { if (!document.hidden) refreshBadge(); }, BADGE_MS);
  }
  function stopBadge() {
    if (badgeTimer) clearInterval(badgeTimer);
    badgeTimer = null;
    var el = document.getElementById("dmBadge");
    if (el) el.hidden = true;
  }

  /* ---------------- page ---------------- */

  function mount(root, startWith) {
    var self = me();
    var convos = [], people = [], current = null, partner = null, thread = [];
    var pending = [], replyTo = null, pickerOpen = false, openLog = {}, lastThreadJson = "", lastListJson = "";
    var alive = true, timer = null;

    root.innerHTML =
      '<div class="dm card" id="dmApp">' +
        '<aside class="dm-side">' +
          '<div class="dm-side-head"><h3>✉️ กล่องข้อความ</h3>' +
            '<button type="button" class="chip active" id="dmNew">+ ข้อความใหม่</button></div>' +
          '<div class="dm-picker" id="dmPicker" hidden>' +
            '<input type="search" id="dmSearch" placeholder="ค้นหาชื่อสมาชิก…" aria-label="ค้นหาชื่อสมาชิก">' +
            '<div id="dmPeople"></div>' +
          "</div>" +
          '<div class="dm-convos" id="dmConvos" role="list"><p class="dm-empty">กำลังโหลด…</p></div>' +
        "</aside>" +
        '<section class="dm-main" id="dmMain">' +
          '<div class="dm-placeholder" id="dmPlaceholder"><p>🔒 ข้อความส่วนตัว — เห็นเฉพาะคุณกับผู้รับ</p>' +
            '<p class="muted">เลือกบทสนทนาทางซ้าย หรือกด “+ ข้อความใหม่” เพื่อเริ่มส่งถึงสมาชิก</p></div>' +
          '<div class="dm-conv" id="dmConv" hidden>' +
            '<header class="dm-conv-head"><button type="button" class="dm-back" id="dmBack" aria-label="กลับไปรายการ">‹</button>' +
              '<span class="dm-avatar" id="dmAvatar"></span><div><strong id="dmName"></strong> <span class="badge" id="dmRole"></span>' +
              '<div class="dm-private">🔒 ส่วนตัว · เห็นเฉพาะ 2 คน</div></div></header>' +
            '<div class="chat-feed dm-feed" id="dmFeed" aria-live="polite"></div>' +
            '<form class="chat-compose" id="dmForm" autocomplete="off">' +
              '<div class="chat-replying" id="dmReplying" hidden></div>' +
              '<div class="chat-previews" id="dmPreviews"></div>' +
              '<div class="chat-input-row">' +
                '<label class="chat-attach" title="แนบรูป" aria-label="แนบรูป">📎<input id="dmFile" type="file" accept="image/*" multiple hidden></label>' +
                '<textarea id="dmText" rows="2" placeholder="พิมพ์ข้อความส่วนตัว… (Ctrl+Enter เพื่อส่ง)"></textarea>' +
                '<button class="chat-send" type="submit" id="dmSend">ส่ง</button>' +
              "</div>" +
              '<p class="chat-error" id="dmError" hidden></p>' +
            "</form>" +
          "</div>" +
        "</section>" +
      "</div>" +
      '<div class="lightbox" id="dmLightbox" hidden><img alt=""></div>';

    var $ = function (id) { return root.querySelector("#" + id); };
    var app = $("dmApp"), feed = $("dmFeed"), errEl = $("dmError"), textIn = $("dmText"), lightbox = $("dmLightbox");

    function showError(msg) { errEl.textContent = msg || ""; errEl.hidden = !msg; }

    /* ---- conversation list ---- */

    function renderList() {
      var json = JSON.stringify(convos) + current;
      if (json === lastListJson) return;
      lastListJson = json;
      var el = $("dmConvos");
      if (!convos.length) {
        el.innerHTML = '<p class="dm-empty">ยังไม่มีข้อความ<br>กด “+ ข้อความใหม่” เพื่อเริ่มสนทนา</p>';
        return;
      }
      el.innerHTML = convos.map(function (c) {
        var p = c.partner;
        return '<button type="button" role="listitem" class="dm-convo' + (p.username === current ? " active" : "") + (c.unread ? " has-unread" : "") +
          '" data-open="' + esc(p.username) + '"><span class="dm-avatar">' + esc(initial(p.name)) + "</span>" +
          '<span class="dm-convo-body"><span class="dm-convo-top"><strong>' + esc(p.name) + '</strong> <span class="badge">' + esc(p.role) + "</span>" +
          '<time>' + fmtTime(c.last.createdAt) + "</time></span>" +
          '<span class="dm-snippet">' + (c.last.fromMe ? "คุณ: " : "") + esc(c.last.text) + "</span></span>" +
          (c.unread ? '<span class="dm-unread">' + c.unread + "</span>" : "") + "</button>";
      }).join("");
    }

    function loadList() {
      return api("dmList").then(function (r) {
        if (!alive) return;
        convos = r.conversations;
        renderList();
        var badge = document.getElementById("dmBadge");
        if (badge) { badge.textContent = String(r.unread); badge.hidden = !r.unread; }
      });
    }

    /* ---- new-message picker (members grouped by profession) ---- */

    function renderPeople() {
      var q = $("dmSearch").value.trim().toLowerCase();
      var html = ROLE_GROUPS.map(function (r) {
        var inRole = people.filter(function (p) { return p.role === r && (!q || (p.name + " " + p.username).toLowerCase().indexOf(q) !== -1); });
        if (!inRole.length) return "";
        return '<div class="dm-group"><h4>' + esc(r === "Other" ? "อื่นๆ" : r) + "</h4>" + inRole.map(function (p) {
          return '<button type="button" class="dm-person" data-open="' + esc(p.username) + '"><span class="dm-avatar sm">' + esc(initial(p.name)) + "</span>" + esc(p.name) + "</button>";
        }).join("") + "</div>";
      }).join("");
      $("dmPeople").innerHTML = html || '<p class="dm-empty">' + (people.length ? "ไม่พบชื่อที่ค้นหา" : "ยังไม่มีสมาชิกคนอื่นในระบบ") + "</p>";
    }

    $("dmNew").addEventListener("click", function () {
      pickerOpen = !pickerOpen;
      $("dmPicker").hidden = !pickerOpen;
      $("dmNew").textContent = pickerOpen ? "✕ ปิด" : "+ ข้อความใหม่";
      if (pickerOpen) { renderPeople(); $("dmSearch").focus(); }
    });
    $("dmSearch").addEventListener("input", renderPeople);

    window.Auth.directory().then(function (list) {
      people = list.filter(function (u) { return u.username !== self.username; })
        .map(function (u) { return { username: u.username, name: u.fullName, role: u.role }; });
      if (pickerOpen) renderPeople();
    }).catch(function () { /* picker stays empty */ });

    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-open]");
      if (b) {
        pickerOpen = false;
        $("dmPicker").hidden = true;
        $("dmNew").textContent = "+ ข้อความใหม่";
        open(b.getAttribute("data-open"));
      }
    });

    /* ---- one conversation ---- */

    function open(username) {
      current = username;
      partner = null;
      thread = [];
      lastThreadJson = "";
      replyTo = null;
      pending = [];
      openLog = {};
      renderReply();
      renderPreviews();
      showError("");
      feed.innerHTML = '<p class="chat-empty">กำลังโหลด…</p>';
      $("dmPlaceholder").hidden = true;
      $("dmConv").hidden = false;
      app.classList.add("show-conv");
      renderList();
      loadThread(true).then(function () { textIn.focus(); });
    }

    function loadThread(first) {
      if (!current) return Promise.resolve();
      var who = current;
      return api("dmThread", { "with": who }).then(function (r) {
        if (!alive || who !== current) return;
        partner = r.partner;
        $("dmAvatar").textContent = initial(partner.name);
        $("dmName").textContent = partner.name;
        $("dmRole").textContent = partner.role;
        thread = r.messages;
        renderThread(first);
        var unread = thread.some(function (m) { return m.to.username === self.username && !m.readAt; });
        if (unread && !document.hidden) {
          api("dmRead", { "with": who }).then(loadList, function () { /* next poll retries */ });
        }
      }).catch(function (e) { if (who === current) feed.innerHTML = '<p class="chat-empty">' + esc(e.message) + "</p>"; });
    }

    function renderThread(scrollToEnd) {
      var json = JSON.stringify(thread) + JSON.stringify(openLog);
      if (json === lastThreadJson && !scrollToEnd) return;
      lastThreadJson = json;
      var nearEnd = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60;
      var prevTop = feed.scrollTop;

      feed.innerHTML = thread.length ? thread.map(function (m) {
        var mine = m.from.username === self.username;
        var images = m.images.length ? '<div class="chat-images n' + Math.min(m.images.length, 4) + '">' + m.images.map(function (src, i) {
          var priv = /^dm:/.test(src);
          return '<img src="' + esc(priv ? BLANK : src) + '"' + (priv ? ' class="loading" data-dm-img="' + esc(src.slice(3)) + '" data-msg-id="' + esc(m.id) + '"' : "") +
            ' alt="รูปแนบ ' + (i + 1) + '" loading="lazy">';
        }).join("") + "</div>" : "";
        var reacts = Object.keys(m.reactions).map(function (k) { return m.reactions[k]; });
        var myR = m.reactions[key(self)];
        var status = mine ? '<span class="dm-status' + (m.readAt ? " read" : "") + '">' + (m.readAt ? "✓✓ อ่านแล้ว " + fmtTime(m.readAt) : "✓ ส่งแล้ว") + "</span>" : "";
        var log = openLog[m.id] ? '<ul class="dm-log">' +
          '<li>ส่งเมื่อ <time>' + fmtFull(m.createdAt) + "</time></li>" +
          (m.readAt ? "<li>👁 " + esc(m.to.name) + " อ่านเมื่อ <time>" + fmtFull(m.readAt) + "</time></li>" : "<li>👁 ยังไม่ได้อ่าน</li>") +
          m.reactionLog.map(function (r) {
            return '<li><span class="react-tag ' + r.type + '">' + REACT[r.type].icon + " " + REACT[r.type].label + "</span> " + esc(r.name) + " · <time>" + fmtFull(r.at) + "</time></li>";
          }).join("") + "</ul>" : "";
        return '<article class="chat-msg' + (mine ? " mine" : "") + '" data-msg="' + esc(m.id) + '">' +
          '<header><strong>' + esc(mine ? "คุณ" : m.from.name) + '</strong><time title="' + fmtFull(m.createdAt) + '">' + fmtTime(m.createdAt) + "</time></header>" +
          (m.replyTo ? '<button type="button" class="chat-quote" data-act="jump" data-id="' + esc(m.replyTo.id) + '">↩ <strong>' + esc(m.replyTo.name) + "</strong> " + esc(m.replyTo.text) + "</button>" : "") +
          (m.text ? '<div class="chat-text">' + linkify(m.text) + "</div>" : "") + images +
          '<div class="chat-actions">' +
            ["ok", "no"].map(function (t) {
              var on = myR && myR.type === t;
              var n = reacts.filter(function (r) { return r.type === t; }).length;
              return '<button type="button" class="react-btn ' + t + (on ? " on" : "") + '" data-act="' + t + '" data-id="' + esc(m.id) + '"' +
                (mine ? ' disabled title="ผู้รับเท่านั้นที่กด ✓/✗ ได้"' : "") + ' aria-pressed="' + !!on + '">' +
                REACT[t].icon + " " + REACT[t].label + (n ? " <b>" + n + "</b>" : "") + "</button>";
            }).join("") +
            '<button type="button" class="link-btn" data-act="reply" data-id="' + esc(m.id) + '">↩ ตอบกลับ</button>' +
            (mine ? '<button type="button" class="link-btn danger" data-act="del" data-id="' + esc(m.id) + '">ลบ</button>' : "") +
            '<button type="button" class="link-btn log-toggle" data-act="log" data-id="' + esc(m.id) + '">' + (status || "รายละเอียด") + (openLog[m.id] ? " ▴" : " ▾") + "</button>" +
          "</div>" +
          (reacts.length ? '<ul class="react-list">' + reacts.map(function (r) {
            return '<li><span class="react-tag ' + r.type + '">' + REACT[r.type].icon + " " + REACT[r.type].label + "</span> " +
              esc(r.name) + " <time>" + fmtFull(r.at) + "</time></li>";
          }).join("") + "</ul>" : "") +
          log + "</article>";
      }).join("") : '<p class="chat-empty">ยังไม่มีข้อความ — เริ่มพิมพ์ด้านล่างเพื่อส่งถึง ' + esc(partner ? partner.name : "") + "</p>";

      feed.scrollTop = scrollToEnd || nearEnd ? feed.scrollHeight : prevTop;
      hydrate(feed);
      var dead = partner && partner.active === false;
      $("dmSend").disabled = dead;
      textIn.disabled = dead;
      textIn.placeholder = dead ? "บัญชีนี้ไม่ได้ใช้งานแล้ว ส่งข้อความไม่ได้" : "พิมพ์ข้อความส่วนตัว… (Ctrl+Enter เพื่อส่ง)";
    }

    $("dmBack").addEventListener("click", function () {
      app.classList.remove("show-conv");
      current = null;
      $("dmConv").hidden = true;
      $("dmPlaceholder").hidden = false;
      renderList();
    });

    /* ---- message actions ---- */

    function find(id) { return thread.filter(function (m) { return m.id === id; })[0]; }
    function upsert(m) {
      var i = thread.map(function (x) { return x.id; }).indexOf(m.id);
      if (i === -1) thread.push(m); else thread[i] = m;
    }

    feed.addEventListener("click", function (e) {
      var img = e.target.closest(".chat-images img");
      if (img && !e.target.closest("[data-act]")) { lightbox.querySelector("img").src = img.src; lightbox.hidden = false; return; }
      var t = e.target.closest("[data-act]");
      if (!t) return;
      var id = t.getAttribute("data-id"), act = t.getAttribute("data-act"), m = find(id);
      if (act === "log") { openLog[id] = !openLog[id]; renderThread(); }
      else if (act === "reply" && m) {
        replyTo = { id: m.id, name: m.from.name, text: snippet(m.text, 120) || "(รูปภาพ)" };
        renderReply();
        textIn.focus();
      } else if (act === "jump") {
        var el = feed.querySelector('[data-msg="' + id + '"]');
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.remove("flash");
        void el.offsetWidth;
        el.classList.add("flash");
      } else if ((act === "ok" || act === "no") && m) {
        if (m.to.username !== self.username) { showError("กด ✓/✗ ได้เฉพาะผู้รับข้อความนี้"); return; }
        var cur = m.reactions[key(self)];
        if (cur && cur.type === act) return;
        api("dmReact", { id: id, type: act }).then(function (r) { upsert(r.message); renderThread(); }, function (err) { showError(err.message); });
      } else if (act === "del") {
        t.textContent = "ยืนยันลบ?";
        t.setAttribute("data-act", "del-yes");
      } else if (act === "del-yes") {
        api("dmDelete", { id: id }).then(function () {
          thread = thread.filter(function (x) { return x.id !== id; });
          renderThread();
          loadList();
        }, function (err) { showError(err.message); });
      }
    });
    lightbox.addEventListener("click", function () { lightbox.hidden = true; });

    /* ---- compose ---- */

    function renderReply() {
      var el = $("dmReplying");
      el.hidden = !replyTo;
      if (replyTo) {
        el.innerHTML = '<span class="reply-bar">↩ ตอบกลับ <strong>' + esc(replyTo.name) + "</strong>: " + esc(replyTo.text) + "</span>" +
          '<button type="button" class="link-btn" id="dmReplyCancel">✕ ยกเลิก</button>';
      }
    }
    $("dmReplying").addEventListener("click", function (e) {
      if (e.target.id === "dmReplyCancel") { replyTo = null; renderReply(); }
    });

    function renderPreviews() {
      $("dmPreviews").innerHTML = pending.map(function (src, i) {
        return '<div class="chat-thumb"><img src="' + src + '" alt="รูปแนบ ' + (i + 1) + '"><button type="button" data-rm="' + i + '" aria-label="ลบรูป">×</button></div>';
      }).join("");
    }
    $("dmPreviews").addEventListener("click", function (e) {
      var i = e.target.getAttribute("data-rm");
      if (i !== null) { pending.splice(+i, 1); renderPreviews(); }
    });

    function addFiles(files) {
      var imgs = Array.prototype.filter.call(files, function (f) { return /^image\//.test(f.type); });
      if (!imgs.length) return;
      var room = MAX_IMAGES - pending.length;
      showError(imgs.length > room ? "แนบรูปได้สูงสุด " + MAX_IMAGES + " รูปต่อข้อความ" : "");
      var size = window.Auth.remote ? [1280, 0.75] : [1024, 0.7];
      Promise.all(imgs.slice(0, Math.max(0, room)).map(function (f) { return compress(f, size[0], size[1]); }))
        .then(function (urls) { pending = pending.concat(urls); renderPreviews(); })
        .catch(function (e) { showError(e.message); });
    }
    $("dmFile").addEventListener("change", function () { addFiles(this.files); this.value = ""; });
    textIn.addEventListener("paste", function (e) {
      var files = e.clipboardData && e.clipboardData.files;
      if (files && files.length) { e.preventDefault(); addFiles(files); }
    });
    var form = $("dmForm");
    form.addEventListener("dragover", function (e) { e.preventDefault(); form.classList.add("drag"); });
    form.addEventListener("dragleave", function () { form.classList.remove("drag"); });
    form.addEventListener("drop", function (e) { e.preventDefault(); form.classList.remove("drag"); addFiles(e.dataTransfer.files); });
    textIn.addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) form.requestSubmit(); });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = textIn.value.trim();
      if (!current) return;
      if (!text && !pending.length) { showError("พิมพ์ข้อความหรือแนบรูปก่อนส่ง"); return; }
      showError("");
      var btn = $("dmSend");
      btn.disabled = true;
      api("dmSend", { to: current, text: text, images: pending.slice(), replyTo: replyTo ? replyTo.id : null }).then(function (r) {
        textIn.value = "";
        pending = [];
        replyTo = null;
        renderPreviews();
        renderReply();
        upsert(r.message);
        renderThread(true);
        loadList();
      }).catch(function (err) { showError("ส่งไม่สำเร็จ: " + err.message); })
        .then(function () { btn.disabled = false; });
    });

    /* ---- polling ---- */

    function tick() { if (!document.hidden) { loadList().catch(function () {}); loadThread(false); } }
    timer = setInterval(tick, POLL_MS);
    function onVisible() { if (!document.hidden) tick(); }
    document.addEventListener("visibilitychange", onVisible);

    loadList().then(function () {
      if (startWith) open(startWith);
    }, function (e) { $("dmConvos").innerHTML = '<p class="dm-empty">' + esc(e.message) + "</p>"; });

    return function unmount() {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }

  window.DM = { mount: mount, startBadge: startBadge, stopBadge: stopBadge, refreshBadge: refreshBadge };
})();
