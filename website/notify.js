/*
 * Pop-up แจ้งเตือนเมื่อมีข้อความส่งถึงผู้ใช้ — ทั้งแชทประกาศ (ส่งถึงทุกคน / วิชาชีพ / รายบุคคล / ส่งต่อมา)
 * และข้อความส่วนตัว ทำงานทุกหน้าหลังเข้าสู่ระบบ
 *
 *  - ถามเซิร์ฟเวอร์ (Code.gs: notify) ทุก chat.notifySeconds วินาที (ค่าเริ่มต้น 20)
 *  - แสดง pop up มุมขวาล่าง + เสียงเตือนสั้นๆ (ปิดได้ที่เมนูผู้ใช้) + ตัวเลขบนแท็บเมื่อดูหน้าอื่นอยู่
 *  - ไม่เด้งซ้ำถ้ากำลังดูข้อความนั้นอยู่ (แชทประกาศที่หน้า Home / บทสนทนาที่เปิดอยู่ใน Inbox)
 *  - แจ้งเตือนของระบบ (Notification API) เมื่อผู้ใช้อนุญาตและแท็บไม่ได้เปิดอยู่
 */
(function () {
  "use strict";

  var S = window.SITE;
  var C = S.chat || {};
  var POLL_MS = (C.notifySeconds || 20) * 1000;
  var TOAST_MS = 20000;
  var MAX_TOASTS = 4;
  var SOUND_KEY = "lpch-ro-notify-sound";
  var TITLE_RE = /^\(\d+\) ข้อความใหม่ · /;

  var timer = null, since = null, unseen = 0, audio = null, box = null, running = false;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtTime(ms) { return new Date(ms).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }); }
  function user() { return window.Auth && window.Auth.user; }
  function soundOn() { try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch (e) { return true; } }
  function setSound(on) { try { localStorage.setItem(SOUND_KEY, on ? "on" : "off"); } catch (e) { /* ignore */ } }
  function currentPage() { return (location.hash.replace(/^#\/?/, "") || "home").split("?")[0]; }

  /* ---------------- data ---------------- */

  // Demo mode: the same answer as Code.gs notify, computed from this browser's stores.
  function localNotify(sinceMs) {
    var u = user(), key = "u_" + String(u.username).replace(/\W/g, "_");
    var read = function (k) { try { return JSON.parse(localStorage.getItem(k)) || []; } catch (e) { return []; } };
    var forMe = function (to) { return to.indexOf("ALL") !== -1 || to.indexOf(u.role) !== -1 || to.indexOf("u:" + u.username) !== -1; };
    var snip = function (t) { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > 140 ? t.slice(0, 140) + "…" : t; };
    var chat = [], dm = [], chatUnread = 0, dmUnread = 0;
    read("lpch-ro-chat-v1").forEach(function (m) {
      var to = m.to || [], reads = m.reads || {}, fwds = m.forwards || [];
      if ((m.author && m.author.username === u.username) || !forMe(to) || reads[key]) return;
      chatUnread++;
      var fwd = fwds.filter(function (f) { return f.at > sinceMs && forMe(f.to); }).pop();
      if (m.createdAt > sinceMs || fwd) {
        chat.push({ id: m.id, from: m.author, text: snip(m.text), images: (m.images || []).length,
          personal: to.indexOf("u:" + u.username) !== -1, forwardedBy: fwd ? fwd.by : null, createdAt: fwd ? fwd.at : m.createdAt });
      }
    });
    read("lpch-ro-dm-v1").forEach(function (m) {
      if (m.to.username !== u.username || m.readAt) return;
      dmUnread++;
      if (m.createdAt > sinceMs) dm.push({ id: m.id, from: m.from, text: snip(m.text), images: (m.images || []).length, createdAt: m.createdAt });
    });
    return Promise.resolve({ now: Date.now(), chat: chat, chatUnread: chatUnread, dm: dm, dmUnread: dmUnread });
  }

  function fetchNew(sinceMs) {
    return window.Auth.remote ? window.Auth.call("notify", { since: sinceMs }) : localNotify(sinceMs);
  }

  /* ---------------- pop-ups ---------------- */

  function container() {
    if (!box || !document.body.contains(box)) {
      box = document.createElement("div");
      box.className = "toasts";
      box.setAttribute("aria-live", "polite");
      box.setAttribute("aria-label", "การแจ้งเตือน");
      document.body.appendChild(box);
    }
    return box;
  }

  function close(t) {
    if (!t.parentNode) return;
    t.classList.add("leaving");
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 200);
  }

  /** opts: { kind: "chat"|"dm"|"info", title, text, meta, action: { label, run } } */
  function toast(opts) {
    var c = container();
    var t = document.createElement("div");
    t.className = "toast toast-" + opts.kind;
    t.setAttribute("role", opts.kind === "info" ? "status" : "alert");
    t.innerHTML =
      '<div class="toast-icon" aria-hidden="true">' + (opts.kind === "dm" ? "✉️" : opts.kind === "chat" ? "📣" : "🔔") + "</div>" +
      '<div class="toast-body"><strong>' + esc(opts.title) + "</strong>" +
        (opts.text ? '<p>' + esc(opts.text) + "</p>" : "") +
        (opts.meta ? '<small>' + esc(opts.meta) + "</small>" : "") +
        '<div class="toast-actions">' +
          (opts.action ? '<button type="button" class="toast-open">' + esc(opts.action.label) + "</button>" : "") +
          '<button type="button" class="toast-close">ปิด</button>' +
        "</div></div>" +
      '<button type="button" class="toast-x" aria-label="ปิดการแจ้งเตือน">×</button>';
    c.insertBefore(t, c.firstChild);
    while (c.children.length > MAX_TOASTS) close(c.lastChild);

    var hide = setTimeout(function () { close(t); }, TOAST_MS);
    t.addEventListener("mouseenter", function () { clearTimeout(hide); });
    t.addEventListener("mouseleave", function () { hide = setTimeout(function () { close(t); }, TOAST_MS / 2); });
    t.querySelector(".toast-x").addEventListener("click", function () { close(t); });
    t.querySelector(".toast-close").addEventListener("click", function () { close(t); });
    if (opts.action) {
      t.querySelector(".toast-open").addEventListener("click", function () { close(t); opts.action.run(); });
    }
    return t;
  }

  function chime() {
    if (!soundOn()) return;
    try {
      var A = window.AudioContext || window.webkitAudioContext;
      if (!A) return;
      audio = audio || new A();
      if (audio.state === "suspended") audio.resume();
      var t0 = audio.currentTime;
      [880, 1318.5].forEach(function (f, i) {
        var o = audio.createOscillator(), g = audio.createGain(), t = t0 + i * 0.13;
        o.type = "sine";
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        o.connect(g);
        g.connect(audio.destination);
        o.start(t);
        o.stop(t + 0.36);
      });
    } catch (e) { /* sound is optional */ }
  }

  // Browsers only let a page start audio after a click, so create the audio context on the first one.
  document.addEventListener("click", function unlock() {
    try { var A = window.AudioContext || window.webkitAudioContext; if (A && !audio) audio = new A(); } catch (e) { /* ignore */ }
    document.removeEventListener("click", unlock);
  });

  function systemNotify(title, body) {
    try {
      if (document.hidden && "Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body: body, tag: "lpch-ro-workspace" });
      }
    } catch (e) { /* not available in this frame */ }
  }

  function openChat(id) {
    window.__lpchFocusMessage = id;
    if (currentPage() === "home") window.dispatchEvent(new CustomEvent("lpch:focus-message", { detail: id }));
    else location.hash = "#/home";
  }
  function openDm(username) { location.hash = "#/inbox?u=" + encodeURIComponent(username); }

  function who(p) { return p ? p.name + (p.role ? " (" + p.role + ")" : "") : ""; }
  function body(n) { return n.text || (n.images ? "📷 รูปภาพ " + n.images + " รูป" : ""); }

  /* ---------------- badges and tab title ---------------- */

  function setBadges(r) {
    var dmBadge = document.getElementById("dmBadge");
    if (dmBadge) { dmBadge.textContent = r.dmUnread > 99 ? "99+" : String(r.dmUnread); dmBadge.hidden = !r.dmUnread; }
    var home = document.querySelector('.nav-link[data-page="home"]');
    if (home) {
      var b = home.querySelector(".nav-count");
      if (!b) { b = document.createElement("span"); b.className = "nav-count"; home.appendChild(b); }
      b.textContent = r.chatUnread > 99 ? "99+" : String(r.chatUnread);
      b.hidden = !r.chatUnread;
      b.title = "ประกาศที่ยังไม่อ่าน";
    }
  }

  function bumpTitle(n) {
    if (!document.hidden || !n) return;
    unseen += n;
    document.title = "(" + unseen + ") ข้อความใหม่ · " + document.title.replace(TITLE_RE, "");
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) return;
    unseen = 0;
    document.title = document.title.replace(TITLE_RE, "");
    if (running) poll();
  });

  /* ---------------- polling ---------------- */

  function poll() {
    var u = user();
    if (!u) return;
    var first = since === null;
    // First call only asks for the unread totals (Number.MAX_SAFE_INTEGER = nothing is "new" yet).
    fetchNew(first ? Number.MAX_SAFE_INTEGER : since).then(function (r) {
      if (!running || !user() || user().username !== u.username) return;
      since = r.now;
      setBadges(r);

      if (first) {
        var flag = "lpch-ro-notified-" + u.username;
        var told = false;
        try { told = sessionStorage.getItem(flag) === "1"; sessionStorage.setItem(flag, "1"); } catch (e) { /* ignore */ }
        if (!told && (r.chatUnread || r.dmUnread)) {
          var parts = [];
          if (r.chatUnread) parts.push("ประกาศ " + r.chatUnread + " ข้อความ");
          if (r.dmUnread) parts.push("ข้อความส่วนตัว " + r.dmUnread + " ข้อความ");
          toast({ kind: "info", title: "คุณมีข้อความที่ยังไม่อ่าน", text: parts.join(" · "),
            action: r.dmUnread && !r.chatUnread ? { label: "เปิดข้อความส่วนตัว", run: function () { location.hash = "#/inbox"; } }
              : { label: "ไปที่ประกาศ", run: function () { location.hash = "#/home"; } } });
        }
        return;
      }

      var page = currentPage(), visible = !document.hidden;
      var openPartner = window.DM && window.DM.currentPartner ? window.DM.currentPartner() : null;
      var shown = 0;

      r.chat.forEach(function (n) {
        if (visible && page === "home") return; // the feed on Home already shows it
        var title = n.forwardedBy ? who(n.forwardedBy) + " ส่งต่อประกาศถึงคุณ"
          : n.personal ? "ประกาศถึงคุณจาก " + who(n.from) : "ประกาศใหม่จาก " + who(n.from);
        toast({ kind: "chat", title: title, text: body(n), meta: "แชทประกาศ · " + fmtTime(n.createdAt),
          action: { label: "เปิดดู", run: function () { openChat(n.id); } } });
        systemNotify(title, body(n));
        shown++;
      });

      r.dm.forEach(function (n) {
        if (visible && page === "inbox" && openPartner === n.from.username) return; // conversation is open
        var title = "ข้อความส่วนตัวจาก " + who(n.from);
        toast({ kind: "dm", title: title, text: body(n), meta: "🔒 ส่วนตัว · " + fmtTime(n.createdAt),
          action: { label: "เปิดดู", run: function () { openDm(n.from.username); } } });
        systemNotify(title, body(n));
        shown++;
      });

      if (shown) { chime(); bumpTitle(shown); }
    }).catch(function () { /* try again on the next tick */ });
  }

  function start() {
    stop();
    running = true;
    since = null;
    poll();
    timer = setInterval(function () { poll(); }, POLL_MS);
  }

  function stop() {
    running = false;
    if (timer) clearInterval(timer);
    timer = null;
    since = null;
    unseen = 0;
    document.title = document.title.replace(TITLE_RE, "");
    if (box) box.innerHTML = "";
  }

  /** Items for the user menu: sound on/off and the browser's own notifications. */
  function menuHtml() {
    var sys = "Notification" in window ? Notification.permission : "unsupported";
    return '<button type="button" id="notifySound">' + (soundOn() ? "🔔 เสียงแจ้งเตือน: เปิด" : "🔕 เสียงแจ้งเตือน: ปิด") + "</button>" +
      (sys === "default" ? '<button type="button" id="notifySystem">📲 เปิดการแจ้งเตือนบนเครื่อง</button>' : "");
  }

  function bindMenu(root) {
    var s = root.querySelector("#notifySound");
    if (s) s.addEventListener("click", function () {
      setSound(!soundOn());
      s.textContent = soundOn() ? "🔔 เสียงแจ้งเตือน: เปิด" : "🔕 เสียงแจ้งเตือน: ปิด";
      if (soundOn()) chime();
    });
    var n = root.querySelector("#notifySystem");
    if (n) n.addEventListener("click", function () {
      try {
        Notification.requestPermission().then(function (p) {
          toast({ kind: "info", title: p === "granted" ? "เปิดการแจ้งเตือนบนเครื่องแล้ว" : "เบราว์เซอร์ไม่อนุญาตการแจ้งเตือน",
            text: p === "granted" ? "จะแจ้งเตือนเมื่อมีข้อความใหม่ขณะเปิดหน้าอื่นอยู่" : "ยังแสดง pop up ในหน้าเว็บได้ตามปกติ" });
        });
      } catch (e) {
        toast({ kind: "info", title: "เบราว์เซอร์ไม่อนุญาตการแจ้งเตือน", text: "ยังแสดง pop up ในหน้าเว็บได้ตามปกติ" });
      }
    });
  }

  window.Notifier = { start: start, stop: stop, poll: poll, toast: toast, menuHtml: menuHtml, bindMenu: bindMenu };
})();
