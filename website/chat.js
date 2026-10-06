/*
 * ประกาศ / ข่าวสาร แบบช่องแชท
 *  - แนบรูปได้ (ปุ่มแนบ, วาง Ctrl+V, ลากไฟล์มาวาง)
 *  - ระบุผู้รับ (ทุกคน / RO / MP / RTT / Nurse) และส่งต่อให้กลุ่มอื่นได้
 *  - สถานะแสดงว่าส่งถึงใคร ใครส่งต่อ และใครอ่านแล้ว
 *
 * Backend:
 *  - "local"    เก็บใน localStorage ของเบราว์เซอร์นี้ (โหมดทดลอง ไม่แชร์ข้ามเครื่อง)
 *  - "firebase" Cloud Firestore แบบ realtime — ทุกคนเห็นข้อความเดียวกัน (ตั้งค่าใน data.js → chat.firebase)
 */
(function () {
  "use strict";

  var S = window.SITE;
  var C = S.chat || {};
  var ROLES = C.roles || ["RO", "MP", "RTT", "Nurse"];
  var MAX_IMAGES = C.maxImages || 4;
  var ME_KEY = "lpch-ro-chat-me";
  var useFirebase = !!(C.firebase && C.firebase.projectId);

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

  // Firestore-safe map key for one reader.
  function readerKey(p) { return (p.role || "x").replace(/\W/g, "") + "_" + hash(p.name.trim().toLowerCase()); }

  function samePerson(a, b) { return a && b && a.name.trim().toLowerCase() === b.name.trim().toLowerCase() && a.role === b.role; }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function fmtTime(ms) {
    var d = new Date(ms), now = new Date();
    var t = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === now.toDateString()) return "วันนี้ " + t;
    return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) + " " + t;
  }

  function roleLabel(r) { return r === "ALL" ? "ทุกคน" : r; }

  function loadMe() {
    try { var m = JSON.parse(localStorage.getItem(ME_KEY)); if (m && m.name) return m; } catch (e) { /* ignore */ }
    return null;
  }

  function saveMe(m) { try { localStorage.setItem(ME_KEY, JSON.stringify(m)); } catch (e) { /* ignore */ } }

  // Is this message addressed to person p (directly, to everyone, or forwarded to their role)?
  function isForMe(m, p) { return !!p && (m.to.indexOf("ALL") !== -1 || m.to.indexOf(p.role) !== -1); }

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
      fn(m);
      write(list);
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
        return mutate(id, function (m) { m.reads[readerKey(p)] = { name: p.name, role: p.role, at: Date.now() }; });
      },
      forward: function (id, entry) {
        return mutate(id, function (m) {
          entry.to.forEach(function (r) { if (m.to.indexOf(r) === -1) m.to.push(r); });
          m.forwards.push(entry);
        });
      },
      remove: function (id) {
        write(read().filter(function (x) { return x.id !== id; }));
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
              m.to = m.to || ["ALL"]; m.forwards = m.forwards || []; m.reads = m.reads || {}; m.images = m.images || [];
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
          u["reads." + readerKey(p)] = { name: p.name, role: p.role, at: Date.now() };
          return col.doc(id).update(u);
        });
      },
      forward: function (id, entry) {
        return ready.then(function (col) {
          return col.doc(id).update({
            to: FV().arrayUnion.apply(null, entry.to),
            forwards: FV().arrayUnion(entry),
          });
        });
      },
      remove: function (id) { return ready.then(function (col) { return col.doc(id).delete(); }); },
    };
  }

  var store = useFirebase ? FirebaseStore() : LocalStore();

  /* ---------------- UI ---------------- */

  function mount(root) {
    var me = loadMe();
    var messages = [];
    var filter = "all";
    var pending = []; // data URLs waiting to be sent
    var recipients = ["ALL"];
    var openReads = {};   // message id -> reader list expanded
    var forwardOpen = null;
    var marked = {};      // ids already marked read this session
    var firstRender = true;

    root.innerHTML =
      '<div class="chat card">' +
        '<div class="chat-head">' +
          '<h3>📣 ประกาศ / ข่าวสาร <span class="chat-unread" id="chatUnread" hidden></span></h3>' +
          '<div class="chat-filters" role="tablist">' +
            '<button class="chip active" data-filter="all">ทั้งหมด</button>' +
            '<button class="chip" data-filter="mine">ส่งถึงฉัน</button>' +
            '<button class="chip" data-filter="sent">ที่ฉันส่ง</button>' +
          "</div>" +
        "</div>" +
        (store.label ? '<div class="chat-mode">ℹ️ ' + esc(store.label) + "</div>" : "") +
        '<div class="chat-feed" id="chatFeed" aria-live="polite"><p class="chat-empty">กำลังโหลด…</p></div>' +
        '<form class="chat-compose" id="chatForm" autocomplete="off">' +
          '<div class="chat-me">' +
            '<label>ผู้ส่ง <input id="chatName" type="text" placeholder="ชื่อของคุณ" maxlength="40" required></label>' +
            '<label>ตำแหน่ง <select id="chatRole">' + ROLES.concat(["Admin"]).map(function (r) {
              return '<option value="' + esc(r) + '">' + esc(r) + "</option>";
            }).join("") + "</select></label>" +
          "</div>" +
          '<div class="chat-to"><span>ส่งถึง:</span>' + ["ALL"].concat(ROLES).map(function (r) {
            return '<button type="button" class="chip' + (r === "ALL" ? " active" : "") + '" data-to="' + esc(r) + '">' + esc(roleLabel(r)) + "</button>";
          }).join("") + "</div>" +
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
    var nameIn = root.querySelector("#chatName");
    var roleIn = root.querySelector("#chatRole");
    var textIn = root.querySelector("#chatText");
    var fileIn = root.querySelector("#chatFile");
    var previews = root.querySelector("#chatPreviews");
    var errEl = root.querySelector("#chatError");
    var sendBtn = root.querySelector("#chatSend");
    var lightbox = root.querySelector("#lightbox");

    if (me) { nameIn.value = me.name; roleIn.value = me.role; }

    function showError(msg) { errEl.textContent = msg || ""; errEl.hidden = !msg; }

    function updateMe() {
      var n = nameIn.value.trim();
      var next = n ? { name: n, role: roleIn.value } : null;
      if (next ? samePerson(next, me) : !me) return;
      me = next;
      if (me) saveMe(me);
      render();
    }
    nameIn.addEventListener("change", updateMe);
    roleIn.addEventListener("change", updateMe);

    /* filters */
    root.querySelectorAll("[data-filter]").forEach(function (b) {
      b.addEventListener("click", function () {
        root.querySelectorAll("[data-filter]").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        filter = b.getAttribute("data-filter");
        firstRender = true;
        render();
      });
    });

    /* recipients */
    var toBtns = root.querySelectorAll("[data-to]");
    toBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        var r = b.getAttribute("data-to");
        if (r === "ALL") recipients = ["ALL"];
        else {
          recipients = recipients.filter(function (x) { return x !== "ALL"; });
          var i = recipients.indexOf(r);
          if (i === -1) recipients.push(r); else recipients.splice(i, 1);
          if (!recipients.length) recipients = ["ALL"];
        }
        toBtns.forEach(function (x) { x.classList.toggle("active", recipients.indexOf(x.getAttribute("data-to")) !== -1); });
      });
    });

    /* attachments */
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

    /* send */
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      updateMe();
      var text = textIn.value.trim();
      if (!me) { showError("กรุณาใส่ชื่อผู้ส่ง"); nameIn.focus(); return; }
      if (!text && !pending.length) { showError("พิมพ์ข้อความหรือแนบรูปก่อนส่ง"); textIn.focus(); return; }
      if (useFirebase && pending.join("").length > 900000) {
        showError("รูปแนบรวมกันใหญ่เกินไป (จำกัดประมาณ 900 KB ต่อข้อความ) — ลดจำนวนรูป");
        return;
      }
      showError("");
      sendBtn.disabled = true;
      var reads = {};
      reads[readerKey(me)] = { name: me.name, role: me.role, at: Date.now() }; // the author has read it
      store.add({
        author: { name: me.name, role: me.role },
        text: text,
        images: pending.slice(),
        to: recipients.slice(),
        forwards: [],
        reads: reads,
        createdAt: Date.now(),
      }).then(function () {
        textIn.value = "";
        pending = [];
        renderPreviews();
        stickToBottom = true;
      }).catch(function (err) {
        showError("ส่งไม่สำเร็จ: " + err.message);
      }).then(function () { sendBtn.disabled = false; });
    });

    /* feed actions (event delegation) */
    feed.addEventListener("click", function (e) {
      var t = e.target.closest("[data-act]");
      if (!t) {
        var img = e.target.closest(".chat-images img");
        if (img) { lightbox.querySelector("img").src = img.src; lightbox.hidden = false; }
        return;
      }
      var id = t.getAttribute("data-id");
      var act = t.getAttribute("data-act");
      if (act === "reads") { openReads[id] = !openReads[id]; render(); }
      else if (act === "fwd") { forwardOpen = forwardOpen === id ? null : id; render(); }
      else if (act === "fwd-send") {
        if (!me) { showError("กรุณาใส่ชื่อผู้ส่งก่อนส่งต่อ"); nameIn.focus(); return; }
        var box = t.closest(".chat-forward");
        var to = Array.prototype.map.call(box.querySelectorAll("input:checked"), function (c) { return c.value; });
        if (!to.length) return;
        forwardOpen = null;
        store.forward(id, { by: { name: me.name, role: me.role }, to: to, at: Date.now() })
          .catch(function (err) { showError("ส่งต่อไม่สำเร็จ: " + err.message); });
      } else if (act === "del") {
        if (confirm("ลบข้อความนี้?")) store.remove(id).catch(function (err) { showError("ลบไม่สำเร็จ: " + err.message); });
      }
    });

    lightbox.addEventListener("click", function () { lightbox.hidden = true; });

    /* read receipts: mark a message read once it is actually on screen */
    var observer = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting || !me || document.hidden) return;
        var id = en.target.getAttribute("data-msg");
        var m = messages.filter(function (x) { return x.id === id; })[0];
        if (!m || marked[id] || m.reads[readerKey(me)] || !isForMe(m, me)) return;
        marked[id] = true;
        store.markRead(id, me).catch(function () { delete marked[id]; });
      });
    }, { root: feed, threshold: 0.6 }) : null;

    var stickToBottom = true;
    feed.addEventListener("scroll", function () {
      stickToBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40;
    });

    function statusHtml(m) {
      var readers = Object.keys(m.reads).map(function (k) { return m.reads[k]; })
        .filter(function (r) { return !samePerson(r, m.author); })
        .sort(function (a, b) { return a.at - b.at; });

      // A recipient group is "read" once anyone in that role has read it.
      var chips = m.to.map(function (r) {
        var done = r === "ALL" ? readers.length > 0 : readers.some(function (x) { return x.role === r; });
        return '<span class="to-chip' + (done ? " done" : "") + '" title="' + (done ? "มีผู้อ่านแล้ว" : "ยังไม่มีผู้อ่าน") + '">' +
          (done ? "✓✓ " : "✓ ") + esc(roleLabel(r)) + "</span>";
      }).join("");

      var fwd = m.forwards.map(function (f) {
        return '<div class="chat-fwd-line">↪ ' + esc(f.by.name) + " (" + esc(f.by.role) + ") ส่งต่อให้ " +
          esc(f.to.map(roleLabel).join(", ")) + " · " + fmtTime(f.at) + "</div>";
      }).join("");

      var readToggle = '<button type="button" class="link-btn" data-act="reads" data-id="' + esc(m.id) + '">' +
        (readers.length ? "👁 อ่านแล้ว " + readers.length + " คน" : "👁 ยังไม่มีผู้อ่าน") + "</button>";

      var readList = openReads[m.id] && readers.length
        ? '<ul class="chat-readers">' + readers.map(function (r) {
            return "<li>" + esc(r.name) + ' <span class="badge">' + esc(r.role) + "</span> · " + fmtTime(r.at) + "</li>";
          }).join("") + "</ul>"
        : "";

      return '<div class="chat-status"><span class="to-label">ส่งถึง</span>' + chips + readToggle + "</div>" + fwd + readList;
    }

    function forwardHtml(m) {
      if (forwardOpen !== m.id) return "";
      var choices = ["ALL"].concat(ROLES).filter(function (r) { return m.to.indexOf(r) === -1; });
      if (!choices.length) return '<div class="chat-forward">ส่งถึงทุกกลุ่มแล้ว</div>';
      return '<div class="chat-forward"><span>ส่งต่อให้:</span>' + choices.map(function (r) {
        return '<label><input type="checkbox" value="' + esc(r) + '"> ' + esc(roleLabel(r)) + "</label>";
      }).join("") + '<button type="button" class="chip active" data-act="fwd-send" data-id="' + esc(m.id) + '">ส่งต่อ</button></div>';
    }

    function render() {
      var list = messages.filter(function (m) {
        if (filter === "mine") return isForMe(m, me) && !samePerson(m.author, me);
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
        var images = m.images.length
          ? '<div class="chat-images n' + Math.min(m.images.length, 4) + '">' + m.images.map(function (src, i) {
              return '<img src="' + esc(src) + '" alt="รูปแนบ ' + (i + 1) + '" loading="lazy">';
            }).join("") + "</div>"
          : "";
        var unreadMine = me && isForMe(m, me) && !mine && !m.reads[readerKey(me)];
        var html = '<article class="chat-msg' + (mine ? " mine" : "") + (unreadMine ? " unread" : "") + '" data-msg="' + esc(m.id) + '">' +
          '<header><strong>' + esc(m.author.name) + '</strong> <span class="badge">' + esc(m.author.role) + "</span>" +
          '<time>' + fmtTime(m.createdAt) + "</time></header>" +
          (m.text ? '<div class="chat-text">' + linkify(m.text) + "</div>" : "") + images +
          statusHtml(m) +
          '<div class="chat-actions">' +
            '<button type="button" class="link-btn" data-act="fwd" data-id="' + esc(m.id) + '">↪ ส่งต่อ</button>' +
            (mine ? '<button type="button" class="link-btn danger" data-act="del" data-id="' + esc(m.id) + '">ลบ</button>' : "") +
          "</div>" + forwardHtml(m) +
          "</article>";
        return { id: m.id, html: html };
      }));

      if (firstRender || stickToBottom) feed.scrollTop = feed.scrollHeight;
      else feed.scrollTop = prevTop;
      firstRender = false;

      if (observer) feed.querySelectorAll("[data-msg]").forEach(function (el) { observer.observe(el); });
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

    var unsubscribe = store.subscribe(function (list) {
      messages = list;
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
