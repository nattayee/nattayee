/*
 * ประกาศ / ข่าวสาร แบบช่องแชท
 *  - แนบรูปได้ (ปุ่มแนบ, วาง Ctrl+V, ลากไฟล์มาวาง)
 *  - ส่งถึงทุกคน / ตามวิชาชีพ (RO / MP / RTT / Nurse) / รายบุคคล และส่งต่อได้
 *  - ปุ่ม ✓ ถูก / ✗ ผิด และ ↩ ตอบกลับ ที่ข้อความ — บันทึกผู้กด วันที่ เวลา
 *  - สถานะแสดงว่าส่งถึงใคร ใครส่งต่อ ใครอ่านแล้ว และดาวน์โหลดบันทึกทั้งหมดเป็น CSV
 *
 * Backend (เลือกอัตโนมัติตามลำดับ):
 *  - "firebase" Cloud Firestore แบบ realtime (ตั้งค่าใน data.js → chat.firebase)
 *  - "sheet"    Google Sheets ผ่าน Apps Script (Code.gs) — เมื่อเปิดเว็บใน Apps Script หรือใส่ auth.apiUrl
 *               ผู้ส่ง/ผู้อ่าน/ผู้กดถูกบันทึกจาก session ฝั่งเซิร์ฟเวอร์ รูปเก็บใน Google Drive
 *  - "local"    เก็บใน localStorage ของเบราว์เซอร์นี้ (โหมดทดลอง ไม่แชร์ข้ามเครื่อง)
 *
 * ผู้รับ (message.to): "ALL" = ทุกคน, "RO"/"MP"/... = ทั้งวิชาชีพ, "u:<username>" = รายบุคคล
 */
(function () {
  "use strict";

  var S = window.SITE;
  var C = S.chat || {};
  var ROLES = C.roles || ["RO", "MP", "RTT", "Nurse"];
  var ROLE_GROUPS = ROLES.concat(["Other"]);
  var MAX_IMAGES = C.maxImages || 4;
  var useFirebase = !!(C.firebase && C.firebase.projectId);
  var REACT = { ok: { icon: "✓", label: "ถูก" }, no: { icon: "✗", label: "ผิด" } };

  /* ---------------- helpers ---------------- */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function linkify(text) {
    return esc(text).replace(/https?:\/\/[^\s<]+/g, function (u) {
      return '<a href="' + u + '" target="_blank" rel="noopener">' + u + "</a>";
    });
  }

  function hash(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  // Firestore-safe map key for a username (no dots, which would split a field path).
  function nameKey(username) { return String(username).replace(/\W/g, "_"); }

  // Firestore-safe map key for one person.
  function readerKey(p) {
    return p.username ? "u_" + nameKey(p.username) : (p.role || "x").replace(/\W/g, "") + "_" + hash(p.name.trim().toLowerCase());
  }

  function samePerson(a, b) {
    if (!a || !b) return false;
    if (a.username && b.username) return a.username === b.username;
    return a.name.trim().toLowerCase() === b.name.trim().toLowerCase() && a.role === b.role;
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function fmtTime(ms) {
    var d = new Date(ms), now = new Date();
    var t = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === now.toDateString()) return "วันนี้ " + t;
    return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) + " " + t;
  }

  // Full date and time for records: "6 ต.ค. 2569 09:47:12"
  function fmtFull(ms) {
    var d = new Date(ms);
    return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) + " " +
      d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function person(p) { return { username: p.username || "", name: p.name, role: p.role }; }
  function stamp(p, extra) {
    var o = person(p);
    o.at = Date.now();
    for (var k in extra) o[k] = extra[k];
    return o;
  }

  function snippet(text, n) {
    var t = String(text || "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n) + "…" : t;
  }

  // The signed-in member (from auth.js) is the chat identity.
  function currentMe() {
    var u = window.Auth && window.Auth.user;
    return u ? { username: u.username, name: u.fullName, role: u.role } : null;
  }

  // Only admins may delete messages.
  function isAdmin() { return !!(window.Auth && window.Auth.user && window.Auth.user.isAdmin); }

  // ✓/✗ may be pressed only by someone the message was sent to, never by its sender.
  function mayReact(m, p) { return !!p && isForMe(m, p) && !samePerson(m.author, p); }

  // Is this message addressed to person p (everyone, their profession, or them personally)?
  function isForMe(m, p) {
    return !!p && (m.to.indexOf("ALL") !== -1 || m.to.indexOf(p.role) !== -1 ||
      (!!p.username && m.to.indexOf("u:" + p.username) !== -1));
  }

  function targetLabel(m, t) {
    if (t === "ALL") return "ทุกคน";
    if (t.indexOf("u:") === 0) return m.toNames[nameKey(t.slice(2))] || t.slice(2);
    return t;
  }

  function normalize(m) {
    m.to = m.to || ["ALL"];
    m.forwards = m.forwards || [];
    m.reads = m.reads || {};
    m.images = m.images || [];
    m.toNames = m.toNames || {};
    m.reactions = m.reactions || {};
    m.reactionLog = m.reactionLog || [];
    return m;
  }

  // Resize + JPEG-compress an image file to a data URL.
  function compress(file, maxSide, quality) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
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

  /* ---------------- storage: local (demo) ---------------- */

  function LocalStore() {
    var KEY = "lpch-ro-chat-v1";
    var subs = [];

    function read() {
      try {
        var raw = localStorage.getItem(KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) { /* ignore */ }
      // First run: seed with the announcements from data.js.
      return (S.announcements || []).map(function (a, i) {
        return {
          id: "seed" + i,
          author: { name: a.from || "ผู้ดูแลเว็บไซต์", role: a.role || "Admin" },
          text: (a.title ? a.title + "\n" : "") + (a.body || ""),
          images: [], to: a.to || ["ALL"], forwards: [], reads: {},
          createdAt: new Date(a.date + "T08:00:00").getTime() || Date.now(),
        };
      });
    }

    function write(list) {
      try {
        localStorage.setItem(KEY, JSON.stringify(list));
      } catch (e) {
        throw new Error("พื้นที่เก็บข้อมูลในเบราว์เซอร์เต็ม (โหมดทดลอง) — ลองลดจำนวนรูปหรือลบข้อความเก่า");
      }
      notify();
    }

    function notify() {
      var list = read().sort(function (a, b) { return a.createdAt - b.createdAt; });
      subs.forEach(function (cb) { cb(list); });
    }

    function mutate(id, fn) {
      var list = read();
      var m = list.filter(function (x) { return x.id === id; })[0];
      if (!m) return Promise.resolve();
      fn(normalize(m));
      try { write(list); } catch (e) { return Promise.reject(e); }
      return Promise.resolve();
    }

    window.addEventListener("storage", function (e) { if (e.key === KEY) notify(); });

    return {
      label: "โหมดทดลอง — ข้อความเก็บไว้ในเบราว์เซอร์นี้เท่านั้น ตั้งค่า Firebase ใน data.js เพื่อให้ทุกคนเห็นร่วมกัน",
      imageSize: [1024, 0.7],
      subscribe: function (cb) {
        subs.push(cb);
        setTimeout(notify, 0);
        return function () { subs = subs.filter(function (s) { return s !== cb; }); };
      },
      add: function (msg) {
        var list = read();
        msg.id = uid();
        list.push(msg);
        try { write(list); } catch (e) { return Promise.reject(e); }
        return Promise.resolve();
      },
      markRead: function (id, p) {
        return mutate(id, function (m) { m.reads[readerKey(p)] = stamp(p); });
      },
      forward: function (id, entry, names) {
        return mutate(id, function (m) {
          entry.to.forEach(function (r) { if (m.to.indexOf(r) === -1) m.to.push(r); });
          for (var k in names) m.toNames[k] = names[k];
          m.forwards.push(entry);
        });
      },
      react: function (id, p, type) {
        var target = read().filter(function (x) { return x.id === id; })[0];
        if (target && !mayReact(normalize(target), p)) return Promise.reject(new Error("กด ✓/✗ ได้เฉพาะผู้ที่ได้รับข้อความนี้"));
        return mutate(id, function (m) {
          var rec = stamp(p, { type: type });
          m.reactions[readerKey(p)] = rec;
          m.reactionLog.push(rec);
        });
      },
      remove: function (id) {
        if (!isAdmin()) return Promise.reject(new Error("ลบข้อความได้เฉพาะผู้ดูแลระบบ (admin)"));
        try { write(read().filter(function (x) { return x.id !== id; })); } catch (e) { return Promise.reject(e); }
        return Promise.resolve();
      },
    };
  }

  /* ---------------- storage: Firebase Firestore ---------------- */

  var FB_VER = "10.12.2";

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error("โหลด " + src + " ไม่สำเร็จ")); };
      document.head.appendChild(s);
    });
  }

  function FirebaseStore() {
    var base = "https://www.gstatic.com/firebasejs/" + FB_VER + "/";
    var ready = loadScript(base + "firebase-app-compat.js")
      .then(function () { return loadScript(base + "firebase-firestore-compat.js"); })
      .then(function () {
        var app = firebase.apps.length ? firebase.app() : firebase.initializeApp(C.firebase);
        return app.firestore().collection(C.collection || "announcements");
      });
    var FV = function () { return firebase.firestore.FieldValue; };

    return {
      label: "",
      // Firestore documents are capped at 1 MiB, so images are kept smaller than in local mode.
      imageSize: [1024, 0.65],
      subscribe: function (cb, onError) {
        var unsub = null, cancelled = false;
        ready.then(function (col) {
          if (cancelled) return;
          unsub = col.orderBy("createdAt", "desc").limit(C.limit || 200).onSnapshot(function (snap) {
            var list = [];
            snap.forEach(function (d) {
              var m = d.data();
              m.id = d.id;
              list.push(m);
            });
            cb(list.reverse());
          }, onError);
        }).catch(onError);
        return function () { cancelled = true; if (unsub) unsub(); };
      },
      add: function (msg) { return ready.then(function (col) { return col.add(msg); }); },
      markRead: function (id, p) {
        return ready.then(function (col) {
          var u = {};
          u["reads." + readerKey(p)] = stamp(p);
          return col.doc(id).update(u);
        });
      },
      forward: function (id, entry, names) {
        return ready.then(function (col) {
          var u = { to: FV().arrayUnion.apply(null, entry.to), forwards: FV().arrayUnion(entry) };
          for (var k in names) u["toNames." + k] = names[k];
          return col.doc(id).update(u);
        });
      },
      react: function (id, p, type) {
        return ready.then(function (col) {
          var rec = stamp(p, { type: type });
          var u = { reactionLog: FV().arrayUnion(rec) };
          u["reactions." + readerKey(p)] = rec;
          return col.doc(id).update(u);
        });
      },
      remove: function (id) { return ready.then(function (col) { return col.doc(id).delete(); }); },
    };
  }

  /* ---------------- storage: Google Sheets via Apps Script ---------------- */

  var POLL_MS = (C.pollSeconds || 15) * 1000;

  function SheetStore() {
    var call = window.Auth.call;
    var subs = [], list = [], timer = null;

    function emit() {
      var copy = list.slice();
      subs.forEach(function (cb) { cb(copy); });
    }
    function upsert(m) {
      var i = list.map(function (x) { return x.id; }).indexOf(m.id);
      if (i === -1) list.push(m); else list[i] = m;
      list.sort(function (a, b) { return a.createdAt - b.createdAt; });
      emit();
    }
    function refresh() {
      return call("chatList").then(function (r) { list = r.messages; emit(); });
    }
    function onVisible() { if (!document.hidden) refresh().catch(function () { /* next poll retries */ }); }

    return {
      label: "",
      imageSize: [1280, 0.75],
      subscribe: function (cb, onError) {
        subs.push(cb);
        refresh().catch(onError);
        if (!timer) {
          timer = setInterval(function () { if (!document.hidden) refresh().catch(function () { /* retry next tick */ }); }, POLL_MS);
          document.addEventListener("visibilitychange", onVisible);
        }
        return function () {
          subs = subs.filter(function (s) { return s !== cb; });
          if (!subs.length) {
            clearInterval(timer);
            timer = null;
            document.removeEventListener("visibilitychange", onVisible);
          }
        };
      },
      // The server takes the sender, readers and presses from the session, not from these arguments.
      add: function (msg) {
        return call("chatAdd", { text: msg.text, images: msg.images, to: msg.to, replyTo: msg.replyTo ? { id: msg.replyTo.id } : null })
          .then(function (r) { upsert(r.message); });
      },
      markRead: function (id) { return call("chatRead", { id: id }).then(function (r) { upsert(r.message); }); },
      forward: function (id, entry) { return call("chatForward", { id: id, to: entry.to }).then(function (r) { upsert(r.message); }); },
      react: function (id, p, type) { return call("chatReact", { id: id, type: type }).then(function (r) { upsert(r.message); }); },
      remove: function (id) {
        return call("chatDelete", { id: id }).then(function () {
          list = list.filter(function (m) { return m.id !== id; });
          emit();
        });
      },
      image: function (fileId) { return call("chatImage", { fileId: fileId }).then(function (r) { return r.dataUrl; }); },
    };
  }

  var store = useFirebase ? FirebaseStore() : window.Auth && window.Auth.remote ? SheetStore() : LocalStore();

  /* Images stored on the server ("drive:<id>") are fetched once and cached for the session. */
  var BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  var imageCache = {};
  function imageSrc(ref) { return /^drive:/.test(ref) ? BLANK : ref; }
  function hydrateImages(rootEl) {
    if (!store.image) return;
    rootEl.querySelectorAll("img[data-img]").forEach(function (img) {
      var id = img.getAttribute("data-img");
      if (!imageCache[id]) imageCache[id] = store.image(id);
      imageCache[id].then(function (src) { img.src = src; img.classList.remove("loading"); }, function () {
        delete imageCache[id];
        img.alt = "โหลดรูปไม่สำเร็จ";
        img.classList.remove("loading");
      });
    });
  }

  /* ---------------- CSV log ---------------- */

  // One row per action (send, reply, read, ✓/✗, forward) with who and when, for record keeping.
  function exportCsv(messages) {
    var rows = [];
    messages.forEach(function (m) {
      var base = { id: m.id, author: m.author.name + " (" + m.author.role + ")", text: snippet(m.text, 80) || "(รูปภาพ)",
        to: m.to.map(function (t) { return targetLabel(m, t); }).join(", ") };
      function add(at, action, p, detail) {
        rows.push({ t: at, cells: [fmtFull(at), action, p.name, p.role, p.username || "", detail || "", base.author, base.to, base.text, base.id] });
      }
      add(m.createdAt, m.replyTo ? "ตอบกลับ" : "ส่งข้อความ", m.author,
        m.replyTo ? "ตอบ " + m.replyTo.name + ": " + m.replyTo.text : "");
      m.forwards.forEach(function (f) {
        add(f.at, "ส่งต่อ", f.by, "ให้ " + f.to.map(function (t) { return targetLabel(m, t); }).join(", "));
      });
      Object.keys(m.reads).forEach(function (k) {
        var r = m.reads[k];
        if (!samePerson(r, m.author)) add(r.at, "อ่าน", r);
      });
      var log = m.reactionLog.length ? m.reactionLog : Object.keys(m.reactions).map(function (k) { return m.reactions[k]; });
      log.forEach(function (r) { add(r.at, REACT[r.type].icon + " " + REACT[r.type].label, r); });
    });
    rows.sort(function (a, b) { return a.t - b.t; });

    var head = ["วันที่เวลา", "การกระทำ", "ผู้กระทำ", "ตำแหน่ง", "Username", "รายละเอียด", "ผู้ส่งข้อความ", "ส่งถึง", "ข้อความ", "Message ID"];
    var csv = [head].concat(rows.map(function (r) { return r.cells; })).map(function (r) {
      return r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(",");
    }).join("\r\n");
    var blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }); // BOM so Excel reads Thai
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "lpch-ro-chat-log-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  /* ---------------- UI ---------------- */

  function mount(root) {
    var me = currentMe();
    var messages = [];
    var people = [];       // other active members, for individual recipients
    var names = {};        // nameKey(username) -> "ชื่อ (ตำแหน่ง)"
    var filter = "all";
    var pending = [];      // data URLs waiting to be sent
    var recipients = ["ALL"];
    var replyTo = null;    // message being replied to
    var pickerOpen = false;
    var openLog = {};      // message id -> details (reads + ✓/✗) expanded
    var forwardOpen = null;
    var marked = {};       // ids already marked read this session
    var firstRender = true;

    root.innerHTML =
      '<div class="chat card">' +
        '<div class="chat-head">' +
          '<h3>📣 ประกาศ / ข่าวสาร <span class="chat-unread" id="chatUnread" hidden></span></h3>' +
          '<div class="chat-filters" role="tablist">' +
            '<button class="chip active" data-filter="all">ทั้งหมด</button>' +
            '<button class="chip" data-filter="mine">ส่งถึงฉัน</button>' +
            '<button class="chip" data-filter="sent">ที่ฉันส่ง</button>' +
            '<button class="chip" id="chatCsv" title="ดาวน์โหลดบันทึกการส่ง อ่าน ตอบกลับ และการกด ✓/✗">⬇ บันทึก CSV</button>' +
          "</div>" +
        "</div>" +
        (store.label ? '<div class="chat-mode">ℹ️ ' + esc(store.label) + "</div>" : "") +
        '<div class="chat-feed" id="chatFeed" aria-live="polite"><p class="chat-empty">กำลังโหลด…</p></div>' +
        '<form class="chat-compose" id="chatForm" autocomplete="off">' +
          (me ? '<div class="chat-me">ส่งในนาม <strong>' + esc(me.name) + '</strong> <span class="badge">' + esc(me.role) + "</span></div>" : "") +
          '<div class="chat-replying" id="chatReplying" hidden></div>' +
          '<div class="chat-to" id="chatTo"></div>' +
          '<div class="chat-picker" id="chatPicker" hidden></div>' +
          '<div class="chat-previews" id="chatPreviews"></div>' +
          '<div class="chat-input-row">' +
            '<label class="chat-attach" title="แนบรูป" aria-label="แนบรูป">📎<input id="chatFile" type="file" accept="image/*" multiple hidden></label>' +
            '<textarea id="chatText" rows="2" placeholder="พิมพ์ประกาศ… (วางรูปด้วย Ctrl+V หรือลากไฟล์มาวางได้)"></textarea>' +
            '<button class="chat-send" type="submit" id="chatSend">ส่ง</button>' +
          "</div>" +
          '<p class="chat-error" id="chatError" hidden></p>' +
        "</form>" +
      "</div>" +
      '<div class="lightbox" id="lightbox" hidden><img alt=""></div>';

    var feed = root.querySelector("#chatFeed");
    var form = root.querySelector("#chatForm");
    var textIn = root.querySelector("#chatText");
    var fileIn = root.querySelector("#chatFile");
    var previews = root.querySelector("#chatPreviews");
    var errEl = root.querySelector("#chatError");
    var sendBtn = root.querySelector("#chatSend");
    var lightbox = root.querySelector("#lightbox");
    var toEl = root.querySelector("#chatTo");
    var pickerEl = root.querySelector("#chatPicker");
    var replyEl = root.querySelector("#chatReplying");

    function showError(msg) { errEl.textContent = msg || ""; errEl.hidden = !msg; }

    /* ---- member directory (for individual recipients) ---- */

    function remember(p) { if (p && p.username) names[nameKey(p.username)] = p.name + " (" + p.role + ")"; }

    if (window.Auth && window.Auth.directory) {
      window.Auth.directory().then(function (list) {
        people = list.map(function (u) { return { username: u.username, name: u.fullName, role: u.role }; })
          .filter(function (p) { return !samePerson(p, me); });
        people.forEach(remember);
        renderTo();
        renderPicker();
        if (forwardOpen) render();
      }).catch(function () { /* individual recipients stay unavailable */ });
    }

    /* ---- recipients ---- */

    function toggleTarget(t, list) {
      if (t === "ALL") return ["ALL"];
      list = list.filter(function (x) { return x !== "ALL"; });
      var i = list.indexOf(t);
      if (i === -1) list.push(t); else list.splice(i, 1);
      return list.length ? list : ["ALL"];
    }

    function renderTo() {
      var picked = recipients.filter(function (t) { return t.indexOf("u:") === 0; });
      toEl.innerHTML = "<span>ส่งถึง:</span>" +
        ["ALL"].concat(ROLES).map(function (r) {
          return '<button type="button" class="chip' + (recipients.indexOf(r) !== -1 ? " active" : "") + '" data-to="' + esc(r) + '">' +
            esc(r === "ALL" ? "ทุกคน" : r) + "</button>";
        }).join("") +
        '<button type="button" class="chip' + (pickerOpen ? " active" : "") + '" id="pickerToggle" aria-expanded="' + pickerOpen + '"' +
          (people.length ? "" : ' disabled title="ยังไม่มีสมาชิกคนอื่น"') + '>👤 รายบุคคล ▾</button>' +
        picked.map(function (t) {
          return '<span class="person-chip">' + esc(names[nameKey(t.slice(2))] || t.slice(2)) +
            '<button type="button" data-unpick="' + esc(t) + '" aria-label="เอาออก">×</button></span>';
        }).join("");
    }

    // Checkbox list of members grouped by profession; usable for composing and forwarding.
    function peopleChecklist(selected, exclude) {
      var groups = ROLE_GROUPS.map(function (r) {
        var inRole = people.filter(function (p) { return p.role === r && (!exclude || exclude.indexOf("u:" + p.username) === -1); });
        if (!inRole.length) return "";
        return '<fieldset><legend>' + esc(r === "Other" ? "อื่นๆ" : r) + "</legend>" + inRole.map(function (p) {
          var v = "u:" + p.username;
          return '<label><input type="checkbox" value="' + esc(v) + '"' + (selected.indexOf(v) !== -1 ? " checked" : "") + "> " + esc(p.name) + "</label>";
        }).join("") + "</fieldset>";
      }).join("");
      return groups || '<p class="muted">ยังไม่มีสมาชิกคนอื่นในระบบ</p>';
    }

    function renderPicker() {
      pickerEl.hidden = !pickerOpen;
      if (pickerOpen) pickerEl.innerHTML = '<p class="picker-hint">เลือกผู้รับรายบุคคล แยกตามวิชาชีพ</p>' + peopleChecklist(recipients);
    }

    toEl.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      if (b.id === "pickerToggle") { pickerOpen = !pickerOpen; renderTo(); renderPicker(); return; }
      var t = b.getAttribute("data-to") || b.getAttribute("data-unpick");
      if (!t) return;
      recipients = toggleTarget(t, recipients);
      renderTo();
      renderPicker();
    });

    pickerEl.addEventListener("change", function (e) {
      if (e.target.type !== "checkbox") return;
      recipients = toggleTarget(e.target.value, recipients);
      renderTo();
    });

    /* ---- reply ---- */

    function startReply(m) {
      replyTo = { id: m.id, name: m.author.name, role: m.author.role, username: m.author.username || "",
        text: snippet(m.text, 120) || (m.images.length ? "(รูปภาพ " + m.images.length + " รูป)" : "") };
      remember(m.author);
      // A reply goes back to the sender by default (personally if they are a member).
      if (!samePerson(m.author, me)) recipients = m.author.username ? ["u:" + m.author.username] : [m.author.role];
      renderReply();
      renderTo();
      renderPicker();
      textIn.focus();
    }

    function renderReply() {
      replyEl.hidden = !replyTo;
      if (!replyTo) return;
      replyEl.innerHTML = '<span class="reply-bar">↩ ตอบกลับ <strong>' + esc(replyTo.name) + "</strong>: " + esc(replyTo.text) + "</span>" +
        '<button type="button" class="link-btn" id="replyCancel" aria-label="ยกเลิกการตอบกลับ">✕ ยกเลิก</button>';
    }

    replyEl.addEventListener("click", function (e) {
      if (e.target.id !== "replyCancel") return;
      replyTo = null;
      recipients = ["ALL"];
      renderReply();
      renderTo();
      renderPicker();
    });

    /* ---- filters, CSV ---- */

    root.querySelectorAll("[data-filter]").forEach(function (b) {
      b.addEventListener("click", function () {
        root.querySelectorAll("[data-filter]").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        filter = b.getAttribute("data-filter");
        firstRender = true;
        render();
      });
    });

    root.querySelector("#chatCsv").addEventListener("click", function () { exportCsv(messages); });

    /* ---- attachments ---- */

    function renderPreviews() {
      previews.innerHTML = pending.map(function (src, i) {
        return '<div class="chat-thumb"><img src="' + src + '" alt="รูปแนบ ' + (i + 1) + '">' +
          '<button type="button" data-rm="' + i + '" aria-label="ลบรูป">×</button></div>';
      }).join("");
    }
    previews.addEventListener("click", function (e) {
      var i = e.target.getAttribute("data-rm");
      if (i !== null) { pending.splice(+i, 1); renderPreviews(); }
    });

    function addFiles(files) {
      var imgs = Array.prototype.filter.call(files, function (f) { return /^image\//.test(f.type); });
      if (!imgs.length) return;
      var room = MAX_IMAGES - pending.length;
      if (imgs.length > room) showError("แนบรูปได้สูงสุด " + MAX_IMAGES + " รูปต่อข้อความ");
      else showError("");
      Promise.all(imgs.slice(0, Math.max(0, room)).map(function (f) {
        return compress(f, store.imageSize[0], store.imageSize[1]);
      })).then(function (urls) {
        pending = pending.concat(urls);
        renderPreviews();
      }).catch(function (e) { showError(e.message); });
    }

    fileIn.addEventListener("change", function () { addFiles(fileIn.files); fileIn.value = ""; });
    textIn.addEventListener("paste", function (e) {
      var files = e.clipboardData && e.clipboardData.files;
      if (files && files.length) { e.preventDefault(); addFiles(files); }
    });
    form.addEventListener("dragover", function (e) { e.preventDefault(); form.classList.add("drag"); });
    form.addEventListener("dragleave", function () { form.classList.remove("drag"); });
    form.addEventListener("drop", function (e) {
      e.preventDefault();
      form.classList.remove("drag");
      addFiles(e.dataTransfer.files);
    });

    textIn.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) form.requestSubmit();
    });

    function namesFor(targets) {
      var out = {};
      targets.forEach(function (t) {
        if (t.indexOf("u:") === 0) {
          var k = nameKey(t.slice(2));
          if (names[k]) out[k] = names[k];
        }
      });
      return out;
    }

    /* ---- send ---- */

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = textIn.value.trim();
      if (!me) { showError("กรุณาเข้าสู่ระบบก่อนส่งข้อความ"); return; }
      if (!text && !pending.length) { showError("พิมพ์ข้อความหรือแนบรูปก่อนส่ง"); textIn.focus(); return; }
      if (useFirebase && pending.join("").length > 900000) {
        showError("รูปแนบรวมกันใหญ่เกินไป (จำกัดประมาณ 900 KB ต่อข้อความ) — ลดจำนวนรูป");
        return;
      }
      showError("");
      sendBtn.disabled = true;
      var reads = {};
      reads[readerKey(me)] = stamp(me); // the author has read it
      var msg = {
        author: person(me),
        text: text,
        images: pending.slice(),
        to: recipients.slice(),
        toNames: namesFor(recipients),
        forwards: [],
        reads: reads,
        reactions: {},
        reactionLog: [],
        createdAt: Date.now(),
      };
      if (replyTo) msg.replyTo = replyTo;
      store.add(msg).then(function () {
        textIn.value = "";
        pending = [];
        replyTo = null;
        recipients = ["ALL"];
        pickerOpen = false;
        renderPreviews();
        renderReply();
        renderTo();
        renderPicker();
        stickToBottom = true;
      }).catch(function (err) {
        showError("ส่งไม่สำเร็จ: " + err.message);
      }).then(function () { sendBtn.disabled = false; });
    });

    /* ---- feed actions (event delegation) ---- */

    function find(id) { return messages.filter(function (x) { return x.id === id; })[0]; }

    feed.addEventListener("click", function (e) {
      var t = e.target.closest("[data-act]");
      if (!t) {
        var img = e.target.closest(".chat-images img");
        if (img) { lightbox.querySelector("img").src = img.src; lightbox.hidden = false; }
        return;
      }
      var id = t.getAttribute("data-id");
      var act = t.getAttribute("data-act");
      var m = find(id);

      if (act === "log") { openLog[id] = !openLog[id]; render(); }
      else if (act === "fwd") { forwardOpen = forwardOpen === id ? null : id; render(); }
      else if (act === "reply") { if (m) startReply(m); }
      else if (act === "jump") {
        var el = feed.querySelector('[data-msg="' + id + '"]');
        if (!el) { showError("ไม่พบข้อความต้นฉบับ (อาจถูกลบหรือถูกกรองออก)"); return; }
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.remove("flash");
        void el.offsetWidth; // restart the animation
        el.classList.add("flash");
      }
      else if (act === "ok" || act === "no") {
        if (!me) { showError("กรุณาเข้าสู่ระบบก่อน"); return; }
        if (!m || !mayReact(m, me)) { showError("กด ✓/✗ ได้เฉพาะผู้ที่ได้รับข้อความนี้"); return; }
        var cur = m.reactions[readerKey(me)];
        if (cur && cur.type === act) return; // already recorded
        store.react(id, me, act).catch(function (err) { showError("บันทึกไม่สำเร็จ: " + err.message); });
      }
      else if (act === "fwd-send") {
        if (!me) { showError("กรุณาเข้าสู่ระบบก่อนส่งต่อ"); return; }
        var box = t.closest(".chat-forward");
        var to = Array.prototype.map.call(box.querySelectorAll("input:checked"), function (c) { return c.value; });
        if (!to.length) return;
        forwardOpen = null;
        store.forward(id, { by: person(me), to: to, at: Date.now() }, namesFor(to))
          .catch(function (err) { showError("ส่งต่อไม่สำเร็จ: " + err.message); });
      } else if (act === "del") {
        if (!isAdmin()) { showError("ลบข้อความได้เฉพาะผู้ดูแลระบบ (admin)"); return; }
        if (confirm("ลบข้อความนี้? (การลบจะถูกบันทึกไว้)")) store.remove(id).catch(function (err) { showError("ลบไม่สำเร็จ: " + err.message); });
      }
    });

    lightbox.addEventListener("click", function () { lightbox.hidden = true; });

    /* read receipts: mark a message read once it is actually on screen */
    var observer = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting || !me || document.hidden) return;
        var id = en.target.getAttribute("data-msg");
        var m = find(id);
        if (!m || marked[id] || m.reads[readerKey(me)] || !isForMe(m, me)) return;
        marked[id] = true;
        store.markRead(id, me).catch(function () { delete marked[id]; });
      });
    }, { root: feed, threshold: 0.6 }) : null;

    var stickToBottom = true;
    feed.addEventListener("scroll", function () {
      stickToBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40;
    });

    /* ---- message markup ---- */

    function readersOf(m) {
      return Object.keys(m.reads).map(function (k) { return m.reads[k]; })
        .filter(function (r) { return !samePerson(r, m.author); })
        .sort(function (a, b) { return a.at - b.at; });
    }

    function statusHtml(m, readers) {
      // Groups are "read" once anyone in them has read it; individuals once that person has.
      var chips = m.to.map(function (t) {
        var done = t === "ALL" ? readers.length > 0
          : t.indexOf("u:") === 0 ? !!m.reads["u_" + nameKey(t.slice(2))]
          : readers.some(function (x) { return x.role === t; });
        return '<span class="to-chip' + (done ? " done" : "") + (t.indexOf("u:") === 0 ? " person" : "") +
          '" title="' + (done ? "อ่านแล้ว" : "ยังไม่ได้อ่าน") + '">' + (done ? "✓✓ " : "✓ ") + esc(targetLabel(m, t)) + "</span>";
      }).join("");

      var fwd = m.forwards.map(function (f) {
        return '<div class="chat-fwd-line">↪ ' + esc(f.by.name) + " (" + esc(f.by.role) + ") ส่งต่อให้ " +
          esc(f.to.map(function (t) { return targetLabel(m, t); }).join(", ")) + " · " + fmtTime(f.at) + "</div>";
      }).join("");

      return '<div class="chat-status"><span class="to-label">ส่งถึง</span>' + chips + "</div>" + fwd;
    }

    function reactHtml(m, readers) {
      var all = Object.keys(m.reactions).map(function (k) { return m.reactions[k]; });
      var mineR = me && m.reactions[readerKey(me)];
      var replies = messages.filter(function (x) { return x.replyTo && x.replyTo.id === m.id; }).length;

      var can = mayReact(m, me);
      var why = byMe(m) ? "ผู้ส่งกด ✓/✗ ข้อความของตัวเองไม่ได้" : "กด ✓/✗ ได้เฉพาะผู้ที่ได้รับข้อความนี้";
      var btns = ["ok", "no"].map(function (type) {
        var n = all.filter(function (r) { return r.type === type; }).length;
        var on = mineR && mineR.type === type;
        return '<button type="button" class="react-btn ' + type + (on ? " on" : "") + '" data-act="' + type + '" data-id="' + esc(m.id) + '"' +
          (can ? "" : " disabled") + ' aria-pressed="' + !!on + '" title="' +
          (!can ? why : on ? "คุณกด " + REACT[type].label + " เมื่อ " + fmtFull(mineR.at) : "กด " + REACT[type].label) + '">' +
          REACT[type].icon + " " + REACT[type].label + (n ? " <b>" + n + "</b>" : "") + "</button>";
      }).join("");

      var summary = (readers.length ? "👁 อ่าน " + readers.length : "👁 ยังไม่มีผู้อ่าน") + (all.length ? " · กด " + all.length : "");

      return '<div class="chat-actions">' + btns +
        '<button type="button" class="link-btn" data-act="reply" data-id="' + esc(m.id) + '">↩ ตอบกลับ' + (replies ? " (" + replies + ")" : "") + "</button>" +
        '<button type="button" class="link-btn" data-act="fwd" data-id="' + esc(m.id) + '">↪ ส่งต่อ</button>' +
        (isAdmin() ? '<button type="button" class="link-btn danger" data-act="del" data-id="' + esc(m.id) + '" title="ลบข้อความ (เฉพาะ admin)">ลบ</button>' : "") +
        '<button type="button" class="link-btn log-toggle" data-act="log" data-id="' + esc(m.id) + '" aria-expanded="' + !!openLog[m.id] + '">' +
          summary + (openLog[m.id] ? " ▴" : " ▾") + "</button>" +
        "</div>" + reactListHtml(all);
    }

    // Always-visible record of who pressed ✓/✗ (their current answer) with date and time.
    function reactListHtml(all) {
      if (!all.length) return "";
      return '<ul class="react-list">' + all.slice().sort(function (a, b) { return a.at - b.at; }).map(function (r) {
        return '<li><span class="react-tag ' + r.type + '">' + REACT[r.type].icon + " " + REACT[r.type].label + "</span> " +
          esc(r.name) + ' <span class="badge">' + esc(r.role) + '</span> <time>' + fmtFull(r.at) + "</time></li>";
      }).join("") + "</ul>";
    }

    // Who pressed ✓/✗ (with history of changes) and who read it, each with date and time.
    function logHtml(m, readers) {
      if (!openLog[m.id]) return "";
      var log = m.reactionLog.length ? m.reactionLog.slice() : Object.keys(m.reactions).map(function (k) { return m.reactions[k]; });
      log.sort(function (a, b) { return a.at - b.at; });
      var current = {};
      Object.keys(m.reactions).forEach(function (k) { current[k] = m.reactions[k]; });

      var reactRows = log.map(function (r) {
        var cur = current[readerKey(r)];
        var superseded = cur && (cur.at !== r.at || cur.type !== r.type);
        return '<li class="' + (superseded ? "old" : "") + '"><span class="react-tag ' + r.type + '">' + REACT[r.type].icon + " " + REACT[r.type].label + "</span> " +
          esc(r.name) + ' <span class="badge">' + esc(r.role) + "</span> · <time>" + fmtFull(r.at) + "</time>" +
          (superseded ? ' <em>(เปลี่ยนภายหลัง)</em>' : "") + "</li>";
      }).join("");

      var readRows = readers.map(function (r) {
        return "<li>👁 " + esc(r.name) + ' <span class="badge">' + esc(r.role) + "</span> · <time>" + fmtFull(r.at) + "</time></li>";
      }).join("");

      return '<div class="chat-log">' +
        '<div><h4>การกด ✓ / ✗</h4>' + (reactRows ? "<ul>" + reactRows + "</ul>" : '<p class="muted">ยังไม่มีผู้กด</p>') + "</div>" +
        '<div><h4>ผู้อ่าน</h4>' + (readRows ? "<ul>" + readRows + "</ul>" : '<p class="muted">ยังไม่มีผู้อ่าน</p>') + "</div>" +
        "</div>";
    }

    function forwardHtml(m) {
      if (forwardOpen !== m.id) return "";
      var roles = ["ALL"].concat(ROLES).filter(function (r) { return m.to.indexOf(r) === -1; });
      return '<div class="chat-forward"><div class="fwd-roles"><span>ส่งต่อให้:</span>' + roles.map(function (r) {
        return '<label><input type="checkbox" value="' + esc(r) + '"> ' + esc(r === "ALL" ? "ทุกคน" : r) + "</label>";
      }).join("") + "</div>" +
        (people.length ? '<div class="chat-picker inline">' + peopleChecklist([], m.to) + "</div>" : "") +
        '<button type="button" class="chip active" data-act="fwd-send" data-id="' + esc(m.id) + '">ส่งต่อ</button></div>';
    }

    function quoteHtml(m) {
      if (!m.replyTo) return "";
      return '<button type="button" class="chat-quote" data-act="jump" data-id="' + esc(m.replyTo.id) + '" title="ไปที่ข้อความต้นฉบับ">' +
        "↩ <strong>" + esc(m.replyTo.name) + "</strong> " + esc(m.replyTo.text) + "</button>";
    }

    function render() {
      var list = messages.filter(function (m) {
        if (filter === "mine") return isForMe(m, me) && !byMe(m);
        if (filter === "sent") return byMe(m);
        return true;
      });

      var unread = me ? messages.filter(function (m) {
        return isForMe(m, me) && !byMe(m) && !m.reads[readerKey(me)];
      }).length : 0;
      var badge = root.querySelector("#chatUnread");
      badge.hidden = !unread;
      badge.textContent = "ยังไม่อ่าน " + unread;

      var prevTop = feed.scrollTop;
      if (observer) observer.disconnect();

      patchFeed(list.map(function (m) {
        var mine = byMe(m);
        var readers = readersOf(m);
        var images = m.images.length
          ? '<div class="chat-images n' + Math.min(m.images.length, 4) + '">' + m.images.map(function (src, i) {
              var drive = /^drive:/.test(src);
              return '<img src="' + esc(imageSrc(src)) + '"' + (drive ? ' data-img="' + esc(src.slice(6)) + '" class="loading"' : "") +
                ' alt="รูปแนบ ' + (i + 1) + '" loading="lazy">';
            }).join("") + "</div>"
          : "";
        var unreadMine = me && isForMe(m, me) && !mine && !m.reads[readerKey(me)];
        var html = '<article class="chat-msg' + (mine ? " mine" : "") + (unreadMine ? " unread" : "") + '" data-msg="' + esc(m.id) + '">' +
          '<header><strong>' + esc(m.author.name) + '</strong> <span class="badge">' + esc(m.author.role) + "</span>" +
          '<time title="' + fmtFull(m.createdAt) + '">' + fmtTime(m.createdAt) + "</time></header>" +
          quoteHtml(m) +
          (m.text ? '<div class="chat-text">' + linkify(m.text) + "</div>" : "") + images +
          statusHtml(m, readers) +
          reactHtml(m, readers) +
          logHtml(m, readers) +
          forwardHtml(m) +
          "</article>";
        return { id: m.id, html: html };
      }));

      if (firstRender || stickToBottom) feed.scrollTop = feed.scrollHeight;
      else feed.scrollTop = prevTop;
      firstRender = false;

      if (observer) feed.querySelectorAll("[data-msg]").forEach(function (el) { observer.observe(el); });
      hydrateImages(feed);
    }

    function byMe(m) { return samePerson(m.author, me); }

    // Replace only the messages whose markup changed, so a click in progress on an
    // unchanged message (e.g. while a read receipt arrives) is not lost.
    var htmlCache = {};
    function patchFeed(items) {
      var empty = feed.querySelector(".chat-empty");
      if (!items.length) {
        feed.innerHTML = '<p class="chat-empty">ยังไม่มีข้อความ</p>';
        htmlCache = {};
        return;
      }
      if (empty) empty.remove();

      var existing = {};
      feed.querySelectorAll("[data-msg]").forEach(function (el) { existing[el.getAttribute("data-msg")] = el; });
      var tpl = document.createElement("template");
      var next = {};
      var prev = null;

      items.forEach(function (it) {
        var el = existing[it.id];
        if (!el || htmlCache[it.id] !== it.html) {
          tpl.innerHTML = it.html;
          var fresh = tpl.content.firstChild;
          if (el) feed.replaceChild(fresh, el);
          el = fresh;
        }
        var want = prev ? prev.nextSibling : feed.firstChild;
        if (want !== el) feed.insertBefore(el, want);
        next[it.id] = it.html;
        delete existing[it.id];
        prev = el;
      });

      Object.keys(existing).forEach(function (id) { existing[id].remove(); });
      htmlCache = next;
    }

    renderTo();

    var unsubscribe = store.subscribe(function (list) {
      messages = list.map(normalize);
      render();
    }, function (err) {
      feed.innerHTML = '<p class="chat-empty">เชื่อมต่อฐานข้อมูลไม่สำเร็จ: ' + esc(err.message) + "</p>";
    });

    function onVisible() { if (!document.hidden) render(); }
    document.addEventListener("visibilitychange", onVisible);

    return function unmount() {
      unsubscribe();
      if (observer) observer.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }

  window.Chat = { mount: mount };
})();
