/*
 * ระบบสมาชิก: สมัครสมาชิก → (admin อนุมัติ) → เข้าสู่ระบบ
 *
 * Backend:
 *  - auth.apiUrl ใน data.js = URL ของ Google Apps Script web app (ดู apps-script/Code.gs)
 *  - ถ้าเว้นว่าง จะใช้ "โหมดทดลอง" ที่จำลอง backend ไว้ใน localStorage ของเบราว์เซอร์นี้
 */
(function () {
  "use strict";

  var S = window.SITE;
  var CFG = S.auth || {};
  var TOKEN_KEY = "lpch-ro-token";
  var ROLES = [["RO", "แพทย์รังสีรักษา (RO)"], ["MP", "นักฟิสิกส์การแพทย์ (MP)"], ["RTT", "นักรังสีการแพทย์ (RTT)"],
    ["Nurse", "พยาบาล (Nurse)"], ["Other", "อื่นๆ"]];
  var remote = !!CFG.apiUrl;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function store(key, val) {
    try { if (val == null) localStorage.removeItem(key); else localStorage.setItem(key, val); } catch (e) { /* ignore */ }
  }
  function load(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }

  /* ---------------- Backend: Google Apps Script ---------------- */

  function remoteCall(req) {
    // text/plain keeps this a "simple" CORS request, which Apps Script web apps accept.
    return fetch(CFG.apiUrl, { method: "POST", body: JSON.stringify(req), redirect: "follow" })
      .then(function (r) {
        if (!r.ok) throw new Error("เซิร์ฟเวอร์ตอบกลับผิดพลาด (" + r.status + ")");
        return r.json();
      }, function () {
        throw new Error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบอินเทอร์เน็ต หรือการ Deploy ของ Apps Script");
      });
  }

  /* ---------------- Backend: local demo (mirrors Code.gs) ---------------- */

  var LocalBackend = (function () {
    var KEY = "lpch-ro-demo-auth";

    function db() {
      try { var d = JSON.parse(load(KEY)); if (d && d.users) return d; } catch (e) { /* ignore */ }
      return { users: [], sessions: [] };
    }
    function save(d) { store(KEY, JSON.stringify(d)); }

    // Demo only — the real backend hashes with salted, iterated SHA-256 on the server.
    function hash(pw, salt) {
      var s = salt + ":" + pw, h1 = 0x811c9dc5, h2 = 5381;
      for (var r = 0; r < 50; r++) {
        for (var i = 0; i < s.length; i++) {
          h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0;
          h2 = ((h2 << 5) + h2 + s.charCodeAt(i)) >>> 0;
        }
        s = h1.toString(36) + h2.toString(36) + salt;
      }
      return h1.toString(36) + h2.toString(36);
    }

    function uuid() { return Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }

    function pub(u) {
      return { username: u.username, fullName: u.fullName, role: u.role, phone: u.phone, email: u.email,
        status: u.status, isAdmin: u.isAdmin, createdAt: u.createdAt, lastLogin: u.lastLogin };
    }

    function fail(msg) { throw new Error(msg); }

    function find(d, username) { return d.users.filter(function (u) { return u.username === username; })[0]; }

    function session(d, username) {
      var token = uuid();
      d.sessions.push({ token: token, username: username, expiresAt: Date.now() + 7 * 864e5 });
      return token;
    }

    function requireUser(d, token) {
      var s = d.sessions.filter(function (x) { return x.token === token && x.expiresAt > Date.now(); })[0];
      var u = s && find(d, s.username);
      if (!u || u.status !== "active") fail("session_expired");
      return u;
    }

    function requireAdmin(d, token) {
      var u = requireUser(d, token);
      if (!u.isAdmin) fail("ต้องเป็นผู้ดูแลระบบ");
      return u;
    }

    var actions = {
      register: function (d, r) {
        var username = String(r.username || "").trim().toLowerCase();
        if (!/^[a-z0-9._-]{3,30}$/.test(username)) fail("ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ ตัวเลข หรือ . _ - ความยาว 3–30 ตัวอักษร");
        if (!r.password || r.password.length < 8) fail("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
        if (!String(r.fullName || "").trim()) fail("กรุณากรอกชื่อ-นามสกุล");
        if (!ROLES.some(function (x) { return x[0] === r.role; })) fail("กรุณาเลือกตำแหน่ง");
        if (find(d, username)) fail("ชื่อผู้ใช้นี้ถูกใช้แล้ว");
        var first = d.users.length === 0;
        var salt = uuid();
        var u = { username: username, fullName: r.fullName.trim(), role: r.role, phone: (r.phone || "").trim(),
          email: (r.email || "").trim(), salt: salt, hash: hash(r.password, salt),
          status: first ? "active" : "pending", isAdmin: first, createdAt: Date.now(), lastLogin: null };
        d.users.push(u);
        if (u.status === "pending") return { status: "pending", message: "สมัครสมาชิกสำเร็จ กรุณารอผู้ดูแลระบบอนุมัติก่อนเข้าใช้งาน" };
        return { status: "active", token: session(d, username), user: pub(u) };
      },
      login: function (d, r) {
        var u = find(d, String(r.username || "").trim().toLowerCase());
        if (!u || hash(r.password || "", u.salt) !== u.hash) fail("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
        if (u.status === "pending") fail("บัญชีของคุณรอการอนุมัติจากผู้ดูแลระบบ");
        if (u.status !== "active") fail("บัญชีของคุณถูกระงับการใช้งาน");
        u.lastLogin = Date.now();
        return { token: session(d, u.username), user: pub(u) };
      },
      me: function (d, r) { return { user: pub(requireUser(d, r.token)) }; },
      logout: function (d, r) {
        d.sessions = d.sessions.filter(function (s) { return s.token !== r.token; });
        return {};
      },
      changePassword: function (d, r) {
        var u = requireUser(d, r.token);
        if (hash(r.oldPassword || "", u.salt) !== u.hash) fail("รหัสผ่านเดิมไม่ถูกต้อง");
        if (!r.newPassword || r.newPassword.length < 8) fail("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
        u.salt = uuid();
        u.hash = hash(r.newPassword, u.salt);
        return { message: "เปลี่ยนรหัสผ่านเรียบร้อย" };
      },
      listUsers: function (d, r) { requireAdmin(d, r.token); return { users: d.users.map(pub) }; },
      updateUser: function (d, r) {
        var admin = requireAdmin(d, r.token);
        var u = find(d, r.username);
        if (!u) fail("ไม่พบผู้ใช้");
        if (u === admin && (r.isAdmin === false || (r.status && r.status !== "active"))) fail("ไม่สามารถยกเลิกสิทธิ์หรือระงับบัญชีของตัวเองได้");
        if (r.status) {
          u.status = r.status;
          if (r.status !== "active") d.sessions = d.sessions.filter(function (s) { return s.username !== u.username; });
        }
        if (typeof r.isAdmin === "boolean") u.isAdmin = r.isAdmin;
        if (r.role) u.role = r.role;
        return { user: pub(u) };
      },
      deleteUser: function (d, r) {
        var admin = requireAdmin(d, r.token);
        var u = find(d, r.username);
        if (!u) fail("ไม่พบผู้ใช้");
        if (u === admin) fail("ไม่สามารถลบบัญชีของตัวเองได้");
        d.users = d.users.filter(function (x) { return x !== u; });
        d.sessions = d.sessions.filter(function (s) { return s.username !== u.username; });
        return {};
      },
    };

    return function (req) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          var d = db();
          try {
            var out = actions[req.action](d, req);
            save(d);
            out.ok = true;
            resolve(out);
          } catch (e) {
            resolve({ ok: false, error: e.message });
          }
        }, 150);
      });
    };
  })();

  /* ---------------- API ---------------- */

  var token = load(TOKEN_KEY);
  var user = null;
  var listeners = [];

  function call(action, data) {
    var req = Object.assign({ action: action, token: token }, data || {});
    return (remote ? remoteCall(req) : LocalBackend(req)).then(function (res) {
      if (!res.ok) {
        if (res.error === "session_expired") { setSession(null, null); throw new Error("กรุณาเข้าสู่ระบบใหม่"); }
        throw new Error(res.error || "เกิดข้อผิดพลาด");
      }
      return res;
    });
  }

  function setSession(t, u) {
    token = t;
    user = u;
    store(TOKEN_KEY, t);
    listeners.forEach(function (cb) { cb(user); });
  }

  /* ---------------- Login / register screen ---------------- */

  function roleOptions(selected) {
    return '<option value="">— เลือกตำแหน่ง —</option>' + ROLES.map(function (r) {
      return '<option value="' + r[0] + '"' + (r[0] === selected ? " selected" : "") + ">" + esc(r[1]) + "</option>";
    }).join("");
  }

  function renderAuthScreen(el, tab, flash) {
    el.innerHTML =
      '<div class="gate-card">' +
        '<img class="gate-logo" src="' + esc(S.brand.logo) + '" width="72" height="72" alt="">' +
        '<h2 id="gateTitle">' + esc(S.brand.name) + " <span>" + esc(S.brand.accent) + "</span></h2>" +
        '<div class="gate-org">' + esc(S.brand.org) + "</div>" +
        '<div class="auth-tabs" role="tablist">' +
          '<button type="button" role="tab" data-tab="login" class="' + (tab === "login" ? "active" : "") + '">เข้าสู่ระบบ</button>' +
          '<button type="button" role="tab" data-tab="register" class="' + (tab === "register" ? "active" : "") + '">สมัครสมาชิก</button>' +
        "</div>" +
        (flash ? '<div class="auth-msg ' + flash.type + '">' + esc(flash.text) + "</div>" : "") +
        (tab === "login" ? loginForm() : registerForm()) +
        '<p class="gate-note">ระบบจะจำการเข้าสู่ระบบไว้ 7 วัน</p>' +
        (remote ? "" : '<p class="auth-demo">ℹ️ โหมดทดลอง — ข้อมูลสมาชิกเก็บในเบราว์เซอร์นี้เท่านั้น ตั้งค่า <code>auth.apiUrl</code> ใน data.js เพื่อเชื่อม Google Sheets</p>') +
      "</div>";

    el.querySelectorAll("[data-tab]").forEach(function (b) {
      b.addEventListener("click", function () { renderAuthScreen(el, b.getAttribute("data-tab")); });
    });

    var form = el.querySelector("form");
    var err = el.querySelector(".auth-error");
    var btn = form.querySelector("button[type=submit]");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = form.elements;
      err.hidden = true;

      if (tab === "register" && f.password.value !== f.confirm.value) {
        err.textContent = "รหัสผ่านทั้งสองช่องไม่ตรงกัน";
        err.hidden = false;
        return;
      }
      btn.disabled = true;
      btn.textContent = "กำลังดำเนินการ…";

      var p = tab === "login"
        ? call("login", { username: f.username.value, password: f.password.value })
        : call("register", {
            username: f.username.value, password: f.password.value, fullName: f.fullName.value,
            role: f.role.value, phone: f.phone.value, email: f.email.value,
          });

      p.then(function (res) {
        if (res.token) { setSession(res.token, res.user); return; }
        renderAuthScreen(el, "login", { type: "ok", text: res.message });
      }).catch(function (ex) {
        err.textContent = ex.message;
        err.hidden = false;
        btn.disabled = false;
        btn.textContent = tab === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก";
      });
    });

    var first = form.querySelector("input");
    if (first) first.focus();
  }

  function field(label, input) { return '<label class="auth-field"><span>' + label + "</span>" + input + "</label>"; }

  function loginForm() {
    return '<form class="auth-form" novalidate>' +
      field("ชื่อผู้ใช้ (Username)", '<input name="username" autocomplete="username" required>') +
      field("รหัสผ่าน", '<input name="password" type="password" autocomplete="current-password" required>') +
      '<p class="auth-error" role="alert" hidden></p>' +
      '<button type="submit" class="auth-submit">เข้าสู่ระบบ</button>' +
      '<p class="auth-hint">ยังไม่มีบัญชี? <button type="button" class="link-btn" data-tab="register">สมัครสมาชิก</button></p>' +
      "</form>";
  }

  function registerForm() {
    return '<form class="auth-form" novalidate>' +
      field("ชื่อ-นามสกุล *", '<input name="fullName" autocomplete="name" required>') +
      field("ตำแหน่ง *", '<select name="role" required>' + roleOptions() + "</select>") +
      field("ชื่อผู้ใช้ (Username) *", '<input name="username" autocomplete="username" placeholder="ภาษาอังกฤษ/ตัวเลข 3–30 ตัว" required>') +
      '<div class="auth-row">' +
        field("รหัสผ่าน *", '<input name="password" type="password" autocomplete="new-password" placeholder="อย่างน้อย 8 ตัว" required>') +
        field("ยืนยันรหัสผ่าน *", '<input name="confirm" type="password" autocomplete="new-password" required>') +
      "</div>" +
      '<div class="auth-row">' +
        field("เบอร์โทร / เบอร์ภายใน", '<input name="phone" type="tel" autocomplete="tel">') +
        field("อีเมล", '<input name="email" type="email" autocomplete="email">') +
      "</div>" +
      '<p class="auth-error" role="alert" hidden></p>' +
      '<button type="submit" class="auth-submit">สมัครสมาชิก</button>' +
      '<p class="auth-hint">' + (CFG.requireApproval === false ? "" : "หลังสมัคร ผู้ดูแลระบบต้องอนุมัติก่อนจึงจะเข้าใช้งานได้ · ") +
        'มีบัญชีแล้ว? <button type="button" class="link-btn" data-tab="login">เข้าสู่ระบบ</button></p>' +
      "</form>";
  }

  /* ---------------- Admin: member management ---------------- */

  var STATUS = { active: ["ใช้งาน", "ok"], pending: ["รออนุมัติ", "warn"], disabled: ["ระงับ", "off"] };

  function fmtDate(ms) {
    return ms ? new Date(ms).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
  }

  function mountAdmin(el) {
    var users = [];
    var filter = "pending";

    function load() {
      el.innerHTML = '<p class="muted">กำลังโหลด…</p>';
      call("listUsers").then(function (res) { users = res.users; render(); })
        .catch(function (e) { el.innerHTML = '<p class="auth-error">' + esc(e.message) + "</p>"; });
    }

    function render(msg) {
      var counts = { all: users.length, pending: 0, active: 0, disabled: 0 };
      users.forEach(function (u) { counts[u.status] = (counts[u.status] || 0) + 1; });
      if (filter === "pending" && !counts.pending) filter = "all";
      var list = users.filter(function (u) { return filter === "all" || u.status === filter; });

      el.innerHTML =
        '<div class="toolbar">' + [["pending", "รออนุมัติ"], ["active", "ใช้งาน"], ["disabled", "ระงับ"], ["all", "ทั้งหมด"]].map(function (f) {
          return '<button class="chip' + (filter === f[0] ? " active" : "") + '" data-filter="' + f[0] + '">' + f[1] + " (" + (counts[f[0]] || 0) + ")</button>";
        }).join("") + "</div>" +
        (msg ? '<div class="note">' + esc(msg) + "</div>" : "") +
        '<div class="table-wrap card flush"><table class="users"><thead><tr>' +
        "<th>ชื่อ-นามสกุล</th><th>Username</th><th>ตำแหน่ง</th><th>ติดต่อ</th><th>สถานะ</th><th>สมัครเมื่อ / เข้าล่าสุด</th><th></th></tr></thead><tbody>" +
        (list.length ? list.map(function (u) {
          var st = STATUS[u.status] || [u.status, ""];
          var self = user && u.username === user.username;
          var acts = [];
          if (u.status !== "active") acts.push('<button class="chip active" data-act="approve">' + (u.status === "pending" ? "อนุมัติ" : "เปิดใช้งาน") + "</button>");
          if (u.status === "active" && !self) acts.push('<button class="chip" data-act="disable">ระงับ</button>');
          if (!self) acts.push('<button class="chip" data-act="admin">' + (u.isAdmin ? "ยกเลิก admin" : "ตั้งเป็น admin") + "</button>");
          if (!self) acts.push('<button class="chip danger" data-act="delete">ลบ</button>');
          return '<tr data-user="' + esc(u.username) + '">' +
            "<td><strong>" + esc(u.fullName) + "</strong>" + (u.isAdmin ? ' <span class="badge">admin</span>' : "") + "</td>" +
            "<td>" + esc(u.username) + "</td>" +
            '<td><select data-act="role" aria-label="ตำแหน่ง">' + ROLES.map(function (r) {
              return '<option value="' + r[0] + '"' + (r[0] === u.role ? " selected" : "") + ">" + r[0] + "</option>";
            }).join("") + "</select></td>" +
            '<td class="small">' + esc(u.phone || "") + (u.email ? "<br>" + esc(u.email) : "") + "</td>" +
            '<td><span class="status ' + st[1] + '">' + st[0] + "</span></td>" +
            '<td class="small">' + fmtDate(u.createdAt) + "<br>" + fmtDate(u.lastLogin) + "</td>" +
            '<td><div class="actions">' + acts.join("") + "</div></td></tr>";
        }).join("") : '<tr><td colspan="7" class="muted">ไม่มีรายการ</td></tr>') +
        "</tbody></table></div>";
    }

    function update(username, data, okMsg) {
      call("updateUser", Object.assign({ username: username }, data)).then(function (res) {
        users = users.map(function (u) { return u.username === username ? res.user : u; });
        render(okMsg);
      }).catch(function (e) { render("⚠️ " + e.message); });
    }

    el.addEventListener("click", function (e) {
      var f = e.target.getAttribute("data-filter");
      if (f) { filter = f; render(); return; }
      var act = e.target.getAttribute("data-act");
      var tr = e.target.closest("tr[data-user]");
      if (!act || !tr || act === "role") return;
      var username = tr.getAttribute("data-user");
      var u = users.filter(function (x) { return x.username === username; })[0];
      if (act === "approve") update(username, { status: "active" }, "เปิดใช้งานบัญชี " + u.fullName + " แล้ว");
      if (act === "disable") update(username, { status: "disabled" }, "ระงับบัญชี " + u.fullName + " แล้ว");
      if (act === "admin") update(username, { isAdmin: !u.isAdmin }, "อัปเดตสิทธิ์ของ " + u.fullName + " แล้ว");
      if (act === "delete" && confirm("ลบบัญชี " + u.fullName + " ?")) {
        call("deleteUser", { username: username }).then(function () {
          users = users.filter(function (x) { return x.username !== username; });
          render("ลบบัญชี " + u.fullName + " แล้ว");
        }).catch(function (e2) { render("⚠️ " + e2.message); });
      }
    });

    el.addEventListener("change", function (e) {
      if (e.target.getAttribute("data-act") !== "role") return;
      var username = e.target.closest("tr").getAttribute("data-user");
      update(username, { role: e.target.value }, "เปลี่ยนตำแหน่งเรียบร้อย");
    });

    load();
  }

  /* ---------------- Account: profile + change password ---------------- */

  function mountAccount(el) {
    var roleName = (ROLES.filter(function (r) { return r[0] === user.role; })[0] || [0, user.role])[1];
    el.innerHTML =
      '<div class="grid wide">' +
        '<div class="card"><h3>👤 ข้อมูลสมาชิก</h3><table class="specs"><tbody>' +
          "<tr><th>ชื่อ-นามสกุล</th><td>" + esc(user.fullName) + "</td></tr>" +
          "<tr><th>Username</th><td>" + esc(user.username) + "</td></tr>" +
          "<tr><th>ตำแหน่ง</th><td>" + esc(roleName) + (user.isAdmin ? ' <span class="badge">admin</span>' : "") + "</td></tr>" +
          "<tr><th>เบอร์โทร</th><td>" + esc(user.phone || "—") + "</td></tr>" +
          "<tr><th>อีเมล</th><td>" + esc(user.email || "—") + "</td></tr>" +
        "</tbody></table></div>" +
        '<div class="card"><h3>🔑 เปลี่ยนรหัสผ่าน</h3><form class="auth-form" novalidate>' +
          field("รหัสผ่านเดิม", '<input name="oldPassword" type="password" autocomplete="current-password" required>') +
          field("รหัสผ่านใหม่", '<input name="newPassword" type="password" autocomplete="new-password" placeholder="อย่างน้อย 8 ตัว" required>') +
          field("ยืนยันรหัสผ่านใหม่", '<input name="confirm" type="password" autocomplete="new-password" required>') +
          '<p class="auth-error" role="alert" hidden></p><p class="auth-msg ok" hidden></p>' +
          '<button type="submit" class="auth-submit">บันทึก</button>' +
        "</form></div>" +
      "</div>";

    var form = el.querySelector("form");
    var err = form.querySelector(".auth-error");
    var ok = form.querySelector(".auth-msg");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = form.elements;
      err.hidden = ok.hidden = true;
      if (f.newPassword.value !== f.confirm.value) { err.textContent = "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน"; err.hidden = false; return; }
      call("changePassword", { oldPassword: f.oldPassword.value, newPassword: f.newPassword.value }).then(function (res) {
        form.reset();
        ok.textContent = res.message;
        ok.hidden = false;
      }).catch(function (ex) { err.textContent = ex.message; err.hidden = false; });
    });
  }

  /* ---------------- Public API ---------------- */

  window.Auth = {
    remote: remote,
    get user() { return user; },
    onChange: function (cb) { listeners.push(cb); },
    // Resolves with the signed-in user, or null if a login is needed.
    init: function () {
      if (!token) return Promise.resolve(null);
      return call("me").then(function (res) { user = res.user; return user; })
        .catch(function () { setSession(null, null); return null; });
    },
    showLogin: function (el) { renderAuthScreen(el, "login"); },
    logout: function () {
      var t = token;
      setSession(null, null);
      if (t) call("logout", { token: t }).catch(function () { /* already signed out locally */ });
    },
    mountAdmin: mountAdmin,
    mountAccount: mountAccount,
    roleName: function (code) { return (ROLES.filter(function (r) { return r[0] === code; })[0] || [0, code])[1]; },
  };
})();
