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
    ["RA", "Radiation Assistant (RA)"], ["Nurse", "พยาบาล (Nurse)"], ["NA", "Nurse Aids (NA)"], ["Other", "อื่นๆ"]];
  // Admin rights (same keys as ADMIN_PERMS in Code.gs). admin หลัก has all of them; admin หลัก picks them for each admin รอง.
  var PERMS = [
    ["users", "จัดการสมาชิก", "อนุมัติ ระงับ ลบ และเปลี่ยนตำแหน่งสมาชิกทั่วไป"],
    ["delete", "ลบข้อความ", "ลบข้อความในแชทประกาศและข้อความส่วนตัว"],
    ["menus", "จัดการเมนู", "เพิ่ม แก้ไข เรียงลำดับเมนูและปุ่ม Workspace"],
    ["status", "ตั้งค่าสถานะ", "ตัวเลือกสถานะ รายชื่อเครื่องและห้อง"],
  ];
  function permLabel(k) { return (PERMS.filter(function (p) { return p[0] === k; })[0] || [k, k])[1]; }
  function levelOf(u) { return !u ? "" : u.isAdmin ? "main" : (u.adminLevel === "sub" && (u.perms || []).length ? "sub" : ""); }
  function levelBadge(u) {
    var l = levelOf(u);
    return l === "main" ? ' <span class="badge">admin หลัก</span>' : l === "sub" ? ' <span class="badge sub">admin รอง</span>' : "";
  }
  // Inside a Google Apps Script web app the page talks to Code.gs through google.script.run.
  var gas = !!(window.google && google.script && google.script.run);
  var remote = gas || !!CFG.apiUrl;

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

  function gasCall(req) {
    return new Promise(function (resolve, reject) {
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(function (e) { reject(new Error((e && e.message) || "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้")); })
        .api(req);
    });
  }

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

    function permsOf(u) {
      return u.isAdmin ? PERMS.map(function (p) { return p[0]; })
        : PERMS.map(function (p) { return p[0]; }).filter(function (k) { return (u.adminPerms || []).indexOf(k) !== -1; });
    }
    function pub(u) {
      return { username: u.username, fullName: u.fullName, role: u.role, phone: u.phone, email: u.email,
        status: u.status, isAdmin: u.isAdmin, adminLevel: u.isAdmin ? "main" : permsOf(u).length ? "sub" : "", perms: permsOf(u),
        createdAt: u.createdAt, lastLogin: u.lastLogin };
    }

    function fail(msg) { throw new Error(msg); }

    function find(d, username) { return d.users.filter(function (u) { return u.username === username; })[0]; }

    function session(d, username, r, via) {
      var token = uuid();
      d.sessions.push({ token: token, username: username, expiresAt: Date.now() + 7 * 864e5,
        createdAt: Date.now(), ua: String((r && r.ua) || "").slice(0, 300), via: via });
      return token;
    }
    function sid(token) { var h = 0x811c9dc5, h2 = 5381; for (var i = 0; i < token.length; i++) { h = Math.imul(h ^ token.charCodeAt(i), 16777619) >>> 0; h2 = ((h2 << 5) + h2 + token.charCodeAt(i)) >>> 0; }
      return ("0000000" + h.toString(16)).slice(-8) + ("0000000" + h2.toString(16)).slice(-8); }

    function requireUser(d, token) {
      var s = d.sessions.filter(function (x) { return x.token === token && x.expiresAt > Date.now(); })[0];
      var u = s && find(d, s.username);
      if (!u || u.status !== "active") fail("session_expired");
      s.lastSeen = Date.now();
      return u;
    }

    function requireAdmin(d, token) {
      var u = requireUser(d, token);
      if (!u.isAdmin) fail("ทำได้เฉพาะ admin หลัก");
      return u;
    }
    function requirePerm(d, token, perm) {
      var u = requireUser(d, token);
      if (permsOf(u).indexOf(perm) === -1) fail("ไม่มีสิทธิ์" + permLabel(perm) + " (admin หลักเป็นผู้กำหนดสิทธิ์ของ admin รอง)");
      return u;
    }
    function guardMember(admin, u) {
      if (!admin.isAdmin && (u.isAdmin || permsOf(u).length)) fail("บัญชี admin จัดการได้เฉพาะ admin หลัก");
    }

    var EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
    function normEmail(v) {
      var e = String(v || "").trim().toLowerCase();
      if (!e) fail("กรุณากรอกอีเมล (ใช้รับรหัสเมื่อลืมรหัสผ่าน)");
      if (e.length > 100 || !EMAIL_RE.test(e)) fail("รูปแบบอีเมลไม่ถูกต้อง");
      return e;
    }
    function emailTaken(d, email, except) {
      return d.users.some(function (u) { return u.username !== except && (u.email || "").toLowerCase() === email; });
    }
    function byLogin(d, login) {
      return login.indexOf("@") === -1 ? find(d, login)
        : d.users.filter(function (u) { return (u.email || "").toLowerCase() === login; })[0];
    }

    var actions = {
      register: function (d, r) {
        var username = String(r.username || "").trim().toLowerCase();
        if (!/^[a-z0-9._-]{3,30}$/.test(username)) fail("ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ ตัวเลข หรือ . _ - ความยาว 3–30 ตัวอักษร");
        if (!r.password || r.password.length < 8) fail("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
        if (!String(r.fullName || "").trim()) fail("กรุณากรอกชื่อ-นามสกุล");
        if (!ROLES.some(function (x) { return x[0] === r.role; })) fail("กรุณาเลือกตำแหน่ง");
        if (find(d, username)) fail("ชื่อผู้ใช้นี้ถูกใช้แล้ว");
        var email = normEmail(r.email);
        if (emailTaken(d, email)) fail("อีเมลนี้ถูกใช้สมัครแล้ว");
        var first = d.users.length === 0;
        var salt = uuid();
        var u = { username: username, fullName: r.fullName.trim(), role: r.role, phone: (r.phone || "").trim(),
          email: email, salt: salt, hash: hash(r.password, salt),
          status: first ? "active" : "pending", isAdmin: first, createdAt: Date.now(), lastLogin: null };
        d.users.push(u);
        if (u.status === "pending") return { status: "pending", message: "สมัครสมาชิกสำเร็จ กรุณารอผู้ดูแลระบบอนุมัติก่อนเข้าใช้งาน" };
        return { status: "active", token: session(d, username, r, "register"), user: pub(u) };
      },
      login: function (d, r) {
        var u = byLogin(d, String(r.username || "").trim().toLowerCase());
        if (!u || hash(r.password || "", u.salt) !== u.hash) fail("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
        if (u.status === "pending") fail("บัญชีของคุณรอการอนุมัติจากผู้ดูแลระบบ");
        if (u.status !== "active") fail("บัญชีของคุณถูกระงับการใช้งาน");
        u.lastLogin = Date.now();
        return { token: session(d, u.username, r, "login"), user: pub(u) };
      },
      me: function (d, r) { return { user: pub(requireUser(d, r.token)) }; },
      logout: function (d, r) {
        d.sessions = d.sessions.filter(function (s) { return s.token !== r.token; });
        return {};
      },
      sessionList: function (d, r) {
        var u = requireUser(d, r.token);
        return { sessions: d.sessions.filter(function (s) { return s.username === u.username && s.expiresAt > Date.now(); }).map(function (s) {
          return { id: sid(s.token), current: s.token === r.token, ua: s.ua || "", via: s.via || "", app: "",
            createdAt: s.createdAt || null, expiresAt: s.expiresAt, lastSeen: s.lastSeen || null };
        }).sort(function (a, b) { return (b.current - a.current) || ((b.lastSeen || b.createdAt || 0) - (a.lastSeen || a.createdAt || 0)); }) };
      },
      sessionRevoke: function (d, r) {
        var u = requireUser(d, r.token), count = 0, self = false;
        d.sessions = d.sessions.filter(function (s) {
          if (s.username !== u.username || (r.others === true ? s.token === r.token : sid(s.token) !== r.id)) return true;
          if (s.token === r.token) self = true;
          count++;
          return false;
        });
        if (r.others !== true && !count) fail("การเข้าสู่ระบบนี้ออกจากระบบไปแล้ว");
        return { count: count, self: self, message: self ? "ออกจากระบบเครื่องนี้แล้ว" : r.others === true ? "ออกจากระบบเครื่องอื่น " + count + " รายการแล้ว" : "ออกจากระบบเครื่องนั้นแล้ว" };
      },
      changePassword: function (d, r) {
        var u = requireUser(d, r.token);
        if (hash(r.oldPassword || "", u.salt) !== u.hash) fail("รหัสผ่านเดิมไม่ถูกต้อง");
        if (!r.newPassword || r.newPassword.length < 8) fail("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
        u.salt = uuid();
        u.hash = hash(r.newPassword, u.salt);
        return { message: "เปลี่ยนรหัสผ่านเรียบร้อย" };
      },
      updateProfile: function (d, r) {
        var u = requireUser(d, r.token);
        var email = normEmail(r.email);
        if (emailTaken(d, email, u.username)) fail("อีเมลนี้ถูกใช้กับบัญชีอื่นแล้ว");
        if (r.fullName !== undefined) {
          var fullName = String(r.fullName || "").replace(/\s+/g, " ").trim();
          if (!fullName) fail("กรุณากรอกชื่อ-นามสกุล");
          if (fullName.length > 80) fail("ชื่อยาวเกินไป");
          u.fullName = fullName;
        }
        u.email = email;
        u.phone = String(r.phone || "").trim().slice(0, 40);
        return { user: pub(u), message: "บันทึกข้อมูลเรียบร้อย" };
      },
      // Demo mode cannot send email, so the code is returned and shown on screen instead.
      forgotPassword: function (d, r) {
        var login = String(r.login || "").trim().toLowerCase();
        if (!login) fail("กรุณากรอกชื่อผู้ใช้หรืออีเมล");
        var u = byLogin(d, login), demoCode = "";
        d.resets = d.resets || {};
        if (u && u.email && u.status !== "disabled") {
          demoCode = ("00000" + Math.floor(Math.random() * 1e6)).slice(-6);
          d.resets[u.username] = { hash: hash(demoCode, u.username), tries: 0, expires: Date.now() + 15 * 60000 };
        }
        return { demoCode: demoCode, message: "ถ้าข้อมูลตรงกับบัญชีในระบบ ระบบได้ส่งรหัส 6 หลักไปที่อีเมลที่ลงทะเบียนไว้แล้ว (หมดอายุใน 15 นาที)" };
      },
      resetPassword: function (d, r) {
        var u = byLogin(d, String(r.login || "").trim().toLowerCase());
        var entry = u && d.resets && d.resets[u.username];
        if (!entry || entry.expires < Date.now()) fail("รหัสหมดอายุหรือไม่ถูกต้อง กรุณาขอรหัสใหม่");
        if (hash(String(r.code || "").replace(/\s/g, ""), u.username) !== entry.hash) {
          entry.tries++;
          if (entry.tries >= 5) delete d.resets[u.username];
          save(d);
          fail(entry.tries >= 5 ? "ใส่รหัสผิดหลายครั้ง กรุณาขอรหัสใหม่" : "รหัสไม่ถูกต้อง");
        }
        if (!r.newPassword || r.newPassword.length < 8) fail("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
        u.salt = uuid();
        u.hash = hash(r.newPassword, u.salt);
        delete d.resets[u.username];
        d.sessions = d.sessions.filter(function (x) { return x.username !== u.username; });
        return { username: u.username, message: "ตั้งรหัสผ่านใหม่เรียบร้อย กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่" };
      },
      directory: function (d, r) {
        requireUser(d, r.token);
        return { users: d.users.filter(function (u) { return u.status === "active"; }).map(function (u) {
          return { username: u.username, fullName: u.fullName, role: u.role };
        }) };
      },
      listUsers: function (d, r) { requirePerm(d, r.token, "users"); return { users: d.users.map(pub) }; },
      updateUser: function (d, r) {
        var admin = requirePerm(d, r.token, "users");
        var u = find(d, r.username);
        if (!u) fail("ไม่พบผู้ใช้");
        if (u === admin && (r.isAdmin === false || (r.status && r.status !== "active"))) fail("ไม่สามารถยกเลิกสิทธิ์หรือระงับบัญชีของตัวเองได้");
        guardMember(admin, u);
        if (typeof r.isAdmin === "boolean" && !admin.isAdmin) fail("ตั้งหรือยกเลิก admin ได้เฉพาะ admin หลัก");
        if (r.status) {
          u.status = r.status;
          if (r.status !== "active") d.sessions = d.sessions.filter(function (s) { return s.username !== u.username; });
        }
        if (typeof r.isAdmin === "boolean") { u.isAdmin = r.isAdmin; u.adminPerms = []; }
        if (r.role) u.role = r.role;
        return { user: pub(u) };
      },
      setAdmin: function (d, r) {
        var admin = requireAdmin(d, r.token);
        var u = find(d, r.username);
        if (!u) fail("ไม่พบผู้ใช้");
        if (u === admin) fail("ไม่สามารถเปลี่ยนสิทธิ์ admin ของตัวเองได้");
        if (["main", "sub", "none"].indexOf(r.level) === -1) fail("ระดับ admin ไม่ถูกต้อง");
        var perms = PERMS.map(function (p) { return p[0]; }).filter(function (k) { return (r.perms || []).indexOf(k) !== -1; });
        if (r.level === "sub" && !perms.length) fail("เลือกสิทธิ์ของ admin รองอย่างน้อย 1 อย่าง");
        if (r.level !== "none" && u.status !== "active") fail("ตั้งเป็น admin ได้เฉพาะบัญชีที่ใช้งานอยู่");
        u.isAdmin = r.level === "main";
        u.adminPerms = r.level === "sub" ? perms : [];
        return { user: pub(u), message: u.fullName + ": " + (r.level === "main" ? "admin หลัก" : r.level === "sub" ? "admin รอง (" + perms.map(permLabel).join(", ") + ")" : "ไม่ใช่ admin") };
      },
      deleteUser: function (d, r) {
        var admin = requirePerm(d, r.token, "users");
        var u = find(d, r.username);
        if (!u) fail("ไม่พบผู้ใช้");
        if (u === admin) fail("ไม่สามารถลบบัญชีของตัวเองได้");
        guardMember(admin, u);
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
  var profileListeners = [];   // name / email / phone saved on บัญชีของฉัน

  // Sign-ins record the browser they came from (บัญชีของฉัน › อุปกรณ์ที่เข้าสู่ระบบ)
  var UA_ACTIONS = { login: 1, register: 1, ssoTicket: 1 };
  function call(action, data) {
    var req = Object.assign({ action: action, token: token }, data || {});
    if (UA_ACTIONS[action]) req.ua = String(navigator.userAgent || "").slice(0, 300);
    return (gas ? gasCall(req) : remote ? remoteCall(req) : LocalBackend(req)).then(function (res) {
      if (!res.ok) {
        if (res.error === "session_expired") { setSession(null, null); throw new Error("กรุณาเข้าสู่ระบบใหม่"); }
        // The page (from GitHub) is newer than the Code.gs deployed: say what the admin has to do.
        if (/^ไม่รู้จักคำสั่ง /.test(res.error || "")) {
          var e = new Error("ฟังก์ชันนี้ยังใช้ไม่ได้ เพราะเซิร์ฟเวอร์ยังเป็น Code.gs เวอร์ชันเก่า (ไม่มีคำสั่ง " + action + ") — ผู้ดูแลระบบ: วาง Code.gs ล่าสุดแล้ว Deploy → Manage deployments → ✏️ Edit → Version: New version");
          e.oldServer = true;
          throw e;
        }
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

  var EMAIL_OK = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
  var SUBMIT_LABEL = { login: "เข้าสู่ระบบ", register: "สมัครสมาชิก", forgot: "ส่งรหัสไปที่อีเมล", reset: "ตั้งรหัสผ่านใหม่" };

  // tab: login | register | forgot (ask for a code) | reset (enter code + new password)
  function renderAuthScreen(el, tab, flash, state) {
    state = state || {};
    var forms = { login: loginForm, register: registerForm, forgot: forgotForm, reset: resetForm };
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
        forms[tab](state) +
        '<p class="gate-note">ระบบจะจำการเข้าสู่ระบบไว้ 7 วัน</p>' +
        (remote ? "" : '<p class="auth-demo">ℹ️ โหมดทดลอง — ข้อมูลสมาชิกเก็บในเบราว์เซอร์นี้เท่านั้น ตั้งค่า <code>auth.apiUrl</code> ใน data.js เพื่อเชื่อม Google Sheets</p>') +
      "</div>";

    el.querySelectorAll("[data-tab]").forEach(function (b) {
      b.addEventListener("click", function () {
        var f = el.querySelector("form");
        var typed = f && f.elements.username ? f.elements.username.value : f && f.elements.login ? f.elements.login.value : "";
        renderAuthScreen(el, b.getAttribute("data-tab"), null, { login: typed });
      });
    });

    var form = el.querySelector("form");
    var err = el.querySelector(".auth-error");
    var btn = form.querySelector("button[type=submit]");
    function showErr(msg) { err.textContent = msg; err.hidden = false; }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = form.elements;
      err.hidden = true;

      if (tab === "register") {
        if (!EMAIL_OK.test(f.email.value.trim())) return showErr("กรุณากรอกอีเมลให้ถูกต้อง (ใช้รับรหัสเมื่อลืมรหัสผ่าน)");
        if (f.password.value !== f.confirm.value) return showErr("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
      }
      if (tab === "reset" && f.newPassword.value !== f.confirm.value) return showErr("รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน");
      btn.disabled = true;
      btn.textContent = "กำลังดำเนินการ…";

      var p = tab === "login" ? call("login", { username: f.username.value, password: f.password.value })
        : tab === "register" ? call("register", {
            username: f.username.value, password: f.password.value, fullName: f.fullName.value,
            role: f.role.value, phone: f.phone.value, email: f.email.value,
          })
        : tab === "forgot" ? call("forgotPassword", { login: f.login.value })
        : call("resetPassword", { login: f.login.value, code: f.code.value, newPassword: f.newPassword.value });

      p.then(function (res) {
        if (res.token) { setSession(res.token, res.user); return; }
        if (tab === "forgot") {
          var text = res.message + (res.demoCode ? " — โหมดทดลองส่งอีเมลไม่ได้ รหัสของคุณคือ " + res.demoCode : "");
          renderAuthScreen(el, "reset", { type: "ok", text: text }, { login: f.login.value.trim() });
        } else if (tab === "reset") {
          renderAuthScreen(el, "login", { type: "ok", text: res.message }, { login: res.username });
        } else {
          renderAuthScreen(el, "login", { type: "ok", text: res.message });
        }
      }).catch(function (ex) {
        showErr(ex.message);
        btn.disabled = false;
        btn.textContent = SUBMIT_LABEL[tab];
      });
    });

    var first = form.querySelector("input:not([value]), input[value='']") || form.querySelector("input");
    if (first) first.focus();
  }

  function field(label, input, hint) {
    return '<label class="auth-field"><span>' + label + "</span>" + input + (hint ? '<small class="auth-help">' + hint + "</small>" : "") + "</label>";
  }

  function loginForm(state) {
    return '<form class="auth-form" novalidate>' +
      field("ชื่อผู้ใช้ หรืออีเมล", '<input name="username" autocomplete="username" value="' + esc(state.login || "") + '" required>') +
      field("รหัสผ่าน", '<input name="password" type="password" autocomplete="current-password" required>') +
      '<p class="auth-error" role="alert" hidden></p>' +
      '<button type="submit" class="auth-submit">เข้าสู่ระบบ</button>' +
      '<p class="auth-hint"><button type="button" class="link-btn" data-tab="forgot">ลืมรหัสผ่าน?</button> · ' +
        'ยังไม่มีบัญชี? <button type="button" class="link-btn" data-tab="register">สมัครสมาชิก</button></p>' +
      "</form>";
  }

  function registerForm() {
    return '<form class="auth-form" novalidate>' +
      field("ชื่อ-นามสกุล *", '<input name="fullName" autocomplete="name" required>') +
      field("ตำแหน่ง *", '<select name="role" required>' + roleOptions() + "</select>") +
      field("ชื่อผู้ใช้ (Username) *", '<input name="username" autocomplete="username" placeholder="ภาษาอังกฤษ/ตัวเลข 3–30 ตัว" required>') +
      field("อีเมล *", '<input name="email" type="email" autocomplete="email" placeholder="name@example.com" required>',
        "ใช้รับรหัสยืนยันเมื่อลืมรหัสผ่าน — 1 อีเมลต่อ 1 บัญชี") +
      '<div class="auth-row">' +
        field("รหัสผ่าน *", '<input name="password" type="password" autocomplete="new-password" placeholder="อย่างน้อย 8 ตัว" required>') +
        field("ยืนยันรหัสผ่าน *", '<input name="confirm" type="password" autocomplete="new-password" required>') +
      "</div>" +
      field("เบอร์โทร / เบอร์ภายใน", '<input name="phone" type="tel" autocomplete="tel">') +
      '<p class="auth-error" role="alert" hidden></p>' +
      '<button type="submit" class="auth-submit">สมัครสมาชิก</button>' +
      '<p class="auth-hint">' + (CFG.requireApproval === false ? "" : "หลังสมัคร ผู้ดูแลระบบต้องอนุมัติก่อนจึงจะเข้าใช้งานได้ · ") +
        'มีบัญชีแล้ว? <button type="button" class="link-btn" data-tab="login">เข้าสู่ระบบ</button></p>' +
      "</form>";
  }

  function forgotForm(state) {
    return '<form class="auth-form" novalidate>' +
      '<p class="auth-step">ลืมรหัสผ่าน — ขั้นที่ 1/2</p>' +
      field("ชื่อผู้ใช้หรืออีเมลที่ใช้สมัคร", '<input name="login" autocomplete="username" value="' + esc(state.login || "") + '" required>',
        "ระบบจะส่งรหัสยืนยัน 6 หลักไปที่อีเมลของบัญชี") +
      '<p class="auth-error" role="alert" hidden></p>' +
      '<button type="submit" class="auth-submit">ส่งรหัสไปที่อีเมล</button>' +
      '<p class="auth-hint"><button type="button" class="link-btn" data-tab="reset">มีรหัสแล้ว</button> · ' +
        '<button type="button" class="link-btn" data-tab="login">กลับไปเข้าสู่ระบบ</button></p>' +
      "</form>";
  }

  function resetForm(state) {
    return '<form class="auth-form" novalidate>' +
      '<p class="auth-step">ลืมรหัสผ่าน — ขั้นที่ 2/2</p>' +
      field("ชื่อผู้ใช้หรืออีเมล", '<input name="login" autocomplete="username" value="' + esc(state.login || "") + '" required>') +
      field("รหัสยืนยัน 6 หลักจากอีเมล", '<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" class="code-input" required>') +
      '<div class="auth-row">' +
        field("รหัสผ่านใหม่", '<input name="newPassword" type="password" autocomplete="new-password" placeholder="อย่างน้อย 8 ตัว" required>') +
        field("ยืนยันรหัสผ่านใหม่", '<input name="confirm" type="password" autocomplete="new-password" required>') +
      "</div>" +
      '<p class="auth-error" role="alert" hidden></p>' +
      '<button type="submit" class="auth-submit">ตั้งรหัสผ่านใหม่</button>' +
      '<p class="auth-hint"><button type="button" class="link-btn" data-tab="forgot">ขอรหัสใหม่</button> · ' +
        '<button type="button" class="link-btn" data-tab="login">กลับไปเข้าสู่ระบบ</button></p>' +
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
    var editing = null;                   // username whose admin rights are open (admin หลัก only)
    var main = !!(user && user.isAdmin);  // admin หลัก; otherwise an admin รอง with the "จัดการสมาชิก" right

    function load() {
      el.innerHTML = '<p class="muted">กำลังโหลด…</p>';
      call("listUsers").then(function (res) { users = res.users; render(); })
        .catch(function (e) { el.innerHTML = '<p class="auth-error">' + esc(e.message) + "</p>"; });
    }

    // admin หลัก manages every account; admin รอง only ordinary members (the server checks the same)
    function manageable(u) { return main || !levelOf(u); }

    function permEditor(u) {
      var l = levelOf(u) || "none", mine = l === "sub" ? (u.perms || []) : [], name = "lvl-" + u.username;
      return '<tr class="perm-row"><td colspan="7"><div class="perm-editor" data-for="' + esc(u.username) + '">' +
        "<h4>🛡️ สิทธิ์ admin ของ " + esc(u.fullName) + "</h4>" +
        '<div class="perm-levels" role="radiogroup" aria-label="ระดับ admin">' +
          [["none", "ไม่ใช่ admin", "สมาชิกทั่วไป"], ["sub", "admin รอง", "ทำได้เฉพาะสิทธิ์ที่เลือก"], ["main", "admin หลัก", "ทำได้ทุกอย่าง รวมถึงตั้ง admin"]].map(function (o) {
            return '<label class="perm-level"><input type="radio" name="' + esc(name) + '" value="' + o[0] + '"' + (l === o[0] ? " checked" : "") + ">" +
              "<span><strong>" + o[1] + "</strong><small>" + o[2] + "</small></span></label>";
          }).join("") + "</div>" +
        '<fieldset class="perm-list"' + (l === "sub" ? "" : " disabled") + "><legend>สิทธิ์ของ admin รอง</legend>" +
          PERMS.map(function (p) {
            return '<label class="perm-check"><input type="checkbox" value="' + p[0] + '"' + (mine.indexOf(p[0]) !== -1 ? " checked" : "") + ">" +
              "<span><strong>" + esc(p[1]) + "</strong><small>" + esc(p[2]) + "</small></span></label>";
          }).join("") + "</fieldset>" +
        (u.status !== "active" ? '<p class="perm-warn">บัญชีนี้ยังไม่ได้ใช้งาน (รออนุมัติหรือถูกระงับ) จึงตั้งเป็น admin ไม่ได้</p>' : "") +
        '<div class="menu-buttons"><button type="button" class="auth-submit" data-perm="save">บันทึกสิทธิ์</button>' +
          '<button type="button" class="chip" data-perm="cancel">ยกเลิก</button></div>' +
      "</div></td></tr>";
    }

    function render(msg) {
      var counts = { all: users.length, pending: 0, active: 0, disabled: 0, admin: 0 };
      users.forEach(function (u) { counts[u.status] = (counts[u.status] || 0) + 1; if (levelOf(u)) counts.admin++; });
      if (filter === "pending" && !counts.pending) filter = "all";
      var list = users.filter(function (u) { return filter === "all" || (filter === "admin" ? !!levelOf(u) : u.status === filter); });

      el.innerHTML =
        '<div class="toolbar">' + [["pending", "รออนุมัติ"], ["active", "ใช้งาน"], ["disabled", "ระงับ"], ["admin", "admin"], ["all", "ทั้งหมด"]].map(function (f) {
          return '<button class="chip' + (filter === f[0] ? " active" : "") + '" data-filter="' + f[0] + '">' + f[1] + " (" + (counts[f[0]] || 0) + ")</button>";
        }).join("") + "</div>" +
        (main ? '<p class="admin-help">กด <strong>🛡️ สิทธิ์ admin</strong> เพื่อตั้งเป็น admin หลัก (ทำได้ทุกอย่าง) หรือ admin รอง (เลือกสิทธิ์เอง)</p>'
          : '<p class="admin-help">คุณเป็น <strong>admin รอง</strong>: จัดการได้เฉพาะสมาชิกทั่วไป บัญชี admin จัดการได้เฉพาะ admin หลัก</p>') +
        (msg ? '<div class="note">' + esc(msg) + "</div>" : "") +
        '<div class="table-wrap stack-wrap card flush"><table class="users stack"><thead><tr>' +
        "<th>ชื่อ-นามสกุล</th><th>Username</th><th>ตำแหน่ง</th><th>ติดต่อ</th><th>สถานะ</th><th>สมัครเมื่อ / เข้าล่าสุด</th><th></th></tr></thead><tbody>" +
        (list.length ? list.map(function (u) {
          var st = STATUS[u.status] || [u.status, ""];
          var self = user && u.username === user.username;
          var can = !self && manageable(u);
          var acts = [];
          if (can && u.status !== "active") acts.push('<button class="chip active" data-act="approve">' + (u.status === "pending" ? "อนุมัติ" : "เปิดใช้งาน") + "</button>");
          if (can && u.status === "active") acts.push('<button class="chip" data-act="disable">ระงับ</button>');
          if (main && !self) acts.push('<button class="chip' + (editing === u.username ? " active" : "") + '" data-act="perm" aria-expanded="' + (editing === u.username) + '">🛡️ สิทธิ์ admin</button>');
          if (can) acts.push('<button class="chip danger" data-act="delete">ลบ</button>');
          var tags = levelOf(u) === "sub" ? '<div class="perm-tags">' + u.perms.map(function (k) { return "<span>" + esc(permLabel(k)) + "</span>"; }).join("") + "</div>" : "";
          return '<tr data-user="' + esc(u.username) + '">' +
            '<td class="cell-name"><strong>' + esc(u.fullName) + "</strong>" + levelBadge(u) + tags + "</td>" +
            '<td data-label="Username">' + esc(u.username) + "</td>" +
            '<td data-label="ตำแหน่ง"><select data-act="role" aria-label="ตำแหน่ง"' + (manageable(u) ? "" : " disabled") + ">" + ROLES.map(function (r) {
              return '<option value="' + r[0] + '"' + (r[0] === u.role ? " selected" : "") + ">" + r[0] + "</option>";
            }).join("") + "</select></td>" +
            '<td class="small" data-label="ติดต่อ">' + (esc(u.phone || "") + (u.email ? "<br>" + esc(u.email) : "") || "—") + "</td>" +
            '<td data-label="สถานะ"><span class="status ' + st[1] + '">' + st[0] + "</span></td>" +
            '<td class="small" data-label="สมัคร / เข้าล่าสุด">' + fmtDate(u.createdAt) + "<br>" + fmtDate(u.lastLogin) + "</td>" +
            '<td class="cell-actions"><div class="actions">' + acts.join("") + "</div></td></tr>" +
            (editing === u.username ? permEditor(u) : "");
        }).join("") : '<tr><td colspan="7" class="muted">ไม่มีรายการ</td></tr>') +
        "</tbody></table></div>";
    }

    function replaceUser(u) { users = users.map(function (x) { return x.username === u.username ? u : x; }); }

    function update(username, data, okMsg) {
      call("updateUser", Object.assign({ username: username }, data)).then(function (res) {
        replaceUser(res.user);
        render(okMsg);
      }).catch(function (e) { render("⚠️ " + e.message); });
    }

    el.addEventListener("click", function (e) {
      var f = e.target.getAttribute("data-filter");
      if (f) { filter = f; editing = null; render(); return; }
      var pb = e.target.closest && e.target.closest("[data-perm]");
      if (pb) {
        var box = pb.closest(".perm-editor"), who = box.getAttribute("data-for");
        if (pb.getAttribute("data-perm") === "cancel") { editing = null; render(); return; }
        var level = (box.querySelector('input[type=radio]:checked') || {}).value || "none";
        var perms = [].map.call(box.querySelectorAll(".perm-list input:checked"), function (c) { return c.value; });
        pb.disabled = true;
        call("setAdmin", { username: who, level: level, perms: level === "sub" ? perms : [] }).then(function (res) {
          replaceUser(res.user);
          editing = null;
          render(res.message);
        }).catch(function (ex) { pb.disabled = false; render("⚠️ " + ex.message); });
        return;
      }
      var act = e.target.getAttribute("data-act");
      var tr = e.target.closest("tr[data-user]");
      if (!act || !tr || act === "role") return;
      var username = tr.getAttribute("data-user");
      var u = users.filter(function (x) { return x.username === username; })[0];
      if (act === "approve") update(username, { status: "active" }, "เปิดใช้งานบัญชี " + u.fullName + " แล้ว");
      if (act === "disable") update(username, { status: "disabled" }, "ระงับบัญชี " + u.fullName + " แล้ว");
      if (act === "perm") { editing = editing === username ? null : username; render(); }
      if (act === "delete" && confirm("ลบบัญชี " + u.fullName + " ?")) {
        call("deleteUser", { username: username }).then(function () {
          users = users.filter(function (x) { return x.username !== username; });
          render("ลบบัญชี " + u.fullName + " แล้ว");
        }).catch(function (e2) { render("⚠️ " + e2.message); });
      }
    });

    el.addEventListener("change", function (e) {
      if (e.target.type === "radio" && e.target.closest(".perm-editor")) {
        // the list of rights only applies to admin รอง
        e.target.closest(".perm-editor").querySelector(".perm-list").disabled = e.target.value !== "sub";
        return;
      }
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
      (user.email ? "" : '<div class="note">⚠️ บัญชีของคุณยังไม่มีอีเมล กรุณาเพิ่มอีเมลเพื่อใช้รับรหัสเมื่อลืมรหัสผ่าน</div>') +
      '<div class="grid wide">' +
        '<div class="card"><h3>👤 ข้อมูลสมาชิก</h3><table class="specs"><tbody>' +
          "<tr><th>Username</th><td>" + esc(user.username) + "</td></tr>" +
          "<tr><th>ตำแหน่ง</th><td>" + esc(roleName) + levelBadge(user) + "</td></tr>" +
          (levelOf(user) === "sub" ? "<tr><th>สิทธิ์ admin รอง</th><td>" + esc(user.perms.map(permLabel).join(", ")) + "</td></tr>" : "") +
        "</tbody></table>" +
        '<form class="auth-form profile-form" novalidate>' +
          field("ชื่อ-นามสกุล *", '<input name="fullName" autocomplete="name" maxlength="80" value="' + esc(user.fullName || "") + '" required>',
            "ชื่อที่ทุกคนเห็นในแชท ข้อความ และสถานะทีม") +
          field("อีเมล *", '<input name="email" type="email" autocomplete="email" value="' + esc(user.email || "") + '" required>',
            "ใช้รับรหัสยืนยันเมื่อลืมรหัสผ่าน") +
          field("เบอร์โทร / เบอร์ภายใน", '<input name="phone" type="tel" autocomplete="tel" value="' + esc(user.phone || "") + '">') +
          '<p class="auth-error" role="alert" hidden></p><p class="auth-msg ok" hidden></p>' +
          '<button type="submit" class="auth-submit">บันทึกข้อมูล</button>' +
        "</form></div>" +
        '<div class="card"><h3>⚡ ข้อความด่วน (Quick chat)</h3><div class="quick-settings" id="quickSettings"></div></div>' +
        '<div class="card"><h3>🔑 เปลี่ยนรหัสผ่าน</h3><form class="auth-form password-form" novalidate>' +
          field("รหัสผ่านเดิม", '<input name="oldPassword" type="password" autocomplete="current-password" required>') +
          field("รหัสผ่านใหม่", '<input name="newPassword" type="password" autocomplete="new-password" placeholder="อย่างน้อย 8 ตัว" required>') +
          field("ยืนยันรหัสผ่านใหม่", '<input name="confirm" type="password" autocomplete="new-password" required>') +
          '<p class="auth-error" role="alert" hidden></p><p class="auth-msg ok" hidden></p>' +
          '<button type="submit" class="auth-submit">บันทึก</button>' +
        "</form></div>" +
      "</div>" +
      '<div class="card sess-card" id="sessionsCard"></div>';

    function wire(form, run) {
      var err = form.querySelector(".auth-error");
      var ok = form.querySelector(".auth-msg");
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        err.hidden = ok.hidden = true;
        var bad = run.check(form.elements);
        if (bad) { err.textContent = bad; err.hidden = false; return; }
        run.send(form.elements).then(function (res) {
          ok.textContent = res.message;
          ok.hidden = false;
          if (run.done) run.done(res);
        }).catch(function (ex) { err.textContent = ex.message; err.hidden = false; });
      });
    }

    wire(el.querySelector(".profile-form"), {
      check: function (f) {
        if (!f.fullName.value.trim()) return "กรุณากรอกชื่อ-นามสกุล";
        return EMAIL_OK.test(f.email.value.trim()) ? "" : "รูปแบบอีเมลไม่ถูกต้อง";
      },
      send: function (f) { return call("updateProfile", { fullName: f.fullName.value, email: f.email.value, phone: f.phone.value }); },
      done: function (res) {
        user = res.user;
        el.querySelector('.profile-form [name="fullName"]').value = user.fullName;
        var warn = el.querySelector(".note");
        if (warn && user.email) warn.remove();
        // the header and user menu show the new name straight away (this page is not drawn again)
        profileListeners.forEach(function (cb) { cb(user); });
      },
    });

    if (window.QuickChat) window.QuickChat.mountSettings(el.querySelector("#quickSettings"));

    wire(el.querySelector(".password-form"), {
      check: function (f) { return f.newPassword.value !== f.confirm.value ? "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน" : ""; },
      send: function (f) { return call("changePassword", { oldPassword: f.oldPassword.value, newPassword: f.newPassword.value }); },
      done: function () { el.querySelector(".password-form").reset(); },
    });

    mountSessions(el.querySelector("#sessionsCard"));
  }

  /* ---------------- Account: where this account is signed in ---------------- */

  // "Chrome · Windows" and an icon from a browser's user agent
  function deviceOf(ua) {
    ua = String(ua || "");
    var os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows"
      : /CrOS/.test(ua) ? "ChromeOS" : /Macintosh|Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
    var br = /\bLine\//.test(ua) ? "LINE" : /FBAN|FBAV/.test(ua) ? "Facebook" : /SamsungBrowser/.test(ua) ? "Samsung Internet"
      : /Edg(A|iOS)?\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\/|FxiOS/.test(ua) ? "Firefox"
      : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
    var phone = /iPhone|Android.*Mobile|Windows Phone/.test(ua), tablet = /iPad|Android/.test(ua) && !phone;
    return { name: [br, os].filter(Boolean).join(" · "), icon: phone ? "📱" : tablet ? "📲" : "💻" };
  }

  function seenText(ms) {
    var m = Math.round((Date.now() - ms) / 60000);
    if (m < 3) return "🟢 ใช้งานอยู่ตอนนี้";
    if (m < 60) return "ใช้งานล่าสุด " + m + " นาทีที่แล้ว";
    return "ใช้งานล่าสุด " + Math.round(m / 60) + " ชั่วโมงที่แล้ว";
  }

  function mountSessions(box) {
    var list = [], msg = null;

    function row(s) {
      var d = deviceOf(s.ua), title, icon = d.icon, sub = [];
      if (s.via === "sso") { title = s.app || "แอปที่เชื่อมกับบัญชีนี้"; icon = "🔗"; if (d.name) sub.push("เปิดจากเว็บนี้บน " + d.name); }
      else if (s.via === "app") { title = "แอปที่เชื่อมกับบัญชีนี้"; icon = "🔗"; sub.push("เข้าสู่ระบบด้วยรหัสผ่านในแอป (TRS-398, Linac QA …)"); }
      else { title = d.name || "อุปกรณ์ไม่ทราบชนิด"; if (!s.ua) icon = "❔"; }
      if (!s.ua && !s.via) sub.push("เข้าสู่ระบบก่อนที่ระบบจะบันทึกอุปกรณ์");
      var times = [];
      if (s.lastSeen) times.push(seenText(s.lastSeen));
      if (s.createdAt) times.push("เข้าสู่ระบบ " + fmtDate(s.createdAt));
      times.push("หมดอายุ " + fmtDate(s.expiresAt));
      return '<li class="sess-row' + (s.current ? " current" : "") + '">' +
        '<span class="sess-icon" aria-hidden="true">' + icon + "</span>" +
        '<div class="sess-body"><div class="sess-title"><strong>' + esc(title) + "</strong>" + (s.current ? ' <span class="badge">เครื่องนี้</span>' : "") + "</div>" +
          sub.map(function (x) { return '<div class="sess-sub">' + esc(x) + "</div>"; }).join("") +
          '<div class="sess-sub">' + esc(times.join(" · ")) + "</div></div>" +
        '<button type="button" class="chip danger" data-sess-out="' + esc(s.id) + '"' + (s.current ? " data-current" : "") + ">" +
          (s.current ? "ออกจากระบบเครื่องนี้" : "ออกจากระบบ") + "</button></li>";
    }

    function render() {
      var others = list.filter(function (s) { return !s.current; }).length;
      box.innerHTML =
        '<div class="sess-head"><h3>💻 อุปกรณ์ที่เข้าสู่ระบบ</h3><button type="button" class="chip" data-sess-reload>↻ รีเฟรช</button></div>' +
        '<p class="sess-lead">เครื่องและแอปที่บัญชีนี้เข้าสู่ระบบอยู่ (แต่ละรายการอยู่ได้ 7 วันนับจากเข้าสู่ระบบ) · ไม่รู้จักเครื่องไหน กด "ออกจากระบบ" แล้วเปลี่ยนรหัสผ่าน</p>' +
        (msg ? (msg.bad ? '<p class="auth-error">' : '<p class="auth-msg ok">') + esc(msg.text) + "</p>" : "") +
        (list ? '<ul class="sess-list">' + list.map(row).join("") + "</ul>" : "") +
        (others ? '<div class="sess-foot"><button type="button" class="chip danger" data-sess-others>ออกจากระบบเครื่องอื่นทั้งหมด (' + others + ")</button></div>" : "") +
        '<p class="sess-note">แอปที่เปิดจากเว็บนี้ (เช่น TRS-398, Linac QA) นับเป็นการเข้าสู่ระบบ 1 รายการ · หลังกดออกจากระบบ แอปเหล่านั้นอาจยังใช้ต่อได้อีกไม่เกิน 5 นาที</p>';
    }

    function load(m) {
      msg = m || null;
      return call("sessionList").then(function (r) { list = r.sessions || []; render(); },
        function (e) { list = null; msg = { text: e.message, bad: true }; render(); });
    }

    box.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("button");
      if (!b || b.disabled) return;
      if (b.hasAttribute("data-sess-reload")) { b.disabled = true; load(); return; }
      var req = null, ask = "";
      if (b.hasAttribute("data-sess-others")) { req = { others: true }; ask = "ออกจากระบบเครื่องอื่นทั้งหมด (ยกเว้นเครื่องนี้) ?"; }
      else if (b.hasAttribute("data-sess-out")) {
        req = { id: b.getAttribute("data-sess-out") };
        if (b.hasAttribute("data-current")) ask = "ออกจากระบบเครื่องนี้ ?";
      }
      if (!req || (ask && !confirm(ask))) return;
      b.disabled = true;
      b.textContent = "กำลังออกจากระบบ…";
      call("sessionRevoke", req).then(function (r) {
        if (r.self) { setSession(null, null); return; }   // this device: back to the sign-in screen
        load({ text: r.message });
      }, function (ex) { load({ text: ex.message, bad: true }); });
    });

    box.innerHTML = '<div class="sess-head"><h3>💻 อุปกรณ์ที่เข้าสู่ระบบ</h3></div><p class="muted">กำลังโหลด…</p>';
    load();
  }

  /* ---------------- Public API ---------------- */

  window.Auth = {
    remote: remote,
    // Raw API call with the session token (used by the chat when it is stored on the server).
    call: call,
    get user() { return user; },
    // May the signed-in member use this admin right? admin หลัก: every right; admin รอง: the ones admin หลัก gave.
    // No right named = admin หลัก only. (A Code.gs from before admin รอง sends no perms: isAdmin decides, as before.)
    can: function (perm) {
      if (!user) return false;
      if (user.isAdmin) return true;
      return !!perm && levelOf(user) === "sub" && user.perms.indexOf(perm) !== -1;
    },
    // "main" (admin หลัก) | "sub" (admin รอง) | ""
    adminLevel: function () { return levelOf(user); },
    onChange: function (cb) { listeners.push(cb); },
    onProfile: function (cb) { profileListeners.push(cb); },
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
    // Active members (username, fullName, role) for picking individual chat recipients.
    directory: function () { return call("directory").then(function (res) { return res.users; }); },
    mountAdmin: mountAdmin,
    mountAccount: mountAccount,
    roleName: function (code) { return (ROLES.filter(function (r) { return r[0] === code; })[0] || [0, code])[1]; },
  };
})();
