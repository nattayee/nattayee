// Generates the Google Apps Script version of the calculator from index.html + tdf.js.
// The Apps Script page adds a sign-in screen that uses LPCH RO Workspace accounts (see apps-script/Code.gs).
// Run: node tdf-calculator/build-apps-script.js
const fs = require("fs");
const path = require("path");

const dir = __dirname;
const out = path.join(dir, "apps-script");
fs.mkdirSync(out, { recursive: true });

let html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
const js = fs.readFileSync(path.join(dir, "tdf.js"), "utf8");

function replaceOnce(src, from, to) {
  if (!src.includes(from)) throw new Error("index.html no longer contains: " + from);
  return src.replace(from, to);
}

// HtmlService sets the viewport and title from Code.gs; tdf.js comes in through include().
html = replaceOnce(html, '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n', "");
html = replaceOnce(html, '<script src="tdf.js"></script>', "<?!= include('Tdf'); ?>");

html = replaceOnce(
  html,
  "</style>",
  `/* sign-in (Apps Script build) */
body.locked .wrap { display: none; }
.auth { min-height: 100vh; display: grid; place-items: center; padding-block: 24px; }
.auth-card { width: 100%; max-width: 400px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 26px 22px; display: grid; gap: 14px; }
.auth-card h1 { font-size: 1.5rem; font-weight: 700; }
.auth-card h1 span { color: var(--accent-ink); }
.auth-card p { margin: 0; color: var(--ink-2); font-size: .9rem; }
.auth-card form { display: grid; gap: 12px; }
.auth-card input { font-family: var(--font-body); }
.auth-card input[type="password"] { width: 100%; font-size: .95rem; color: var(--ink); background: var(--surface-2); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
.btn-primary { appearance: none; border: 0; border-radius: 8px; padding: 11px 16px; background: var(--accent); color: var(--surface); font: 600 1rem var(--font-body); cursor: pointer; }
.btn-primary:disabled { opacity: .6; cursor: progress; }
.auth-msg { font-size: .85rem; margin: 0; }
.auth-msg.err { color: var(--crit); }
.auth-msg.info { color: var(--ink-2); }
.auth-links { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 12px; font-size: .82rem; }
.auth-links a { color: var(--accent-ink); }
.session { display: flex; align-items: center; gap: 10px; font-size: .85rem; color: var(--ink-2); }
.session b { color: var(--ink); font-weight: 600; }
.session .role { font-size: .72rem; font-weight: 600; letter-spacing: .04em; border: 1px solid var(--line); border-radius: 999px; padding: 1px 8px; }
</style>`
);

html = replaceOnce(
  html,
  '<body>\n<div class="wrap">',
  `<body class="locked">
<div class="auth" id="auth">
  <main class="auth-card">
    <h1><span>TDF</span> Dose Calculator</h1>
    <p>เข้าสู่ระบบด้วยบัญชี LPCH RO Workspace</p>
    <p class="auth-msg info" id="authBusy">กำลังตรวจสอบการเข้าสู่ระบบ…</p>
    <form id="authForm" hidden autocomplete="on">
      <div class="field"><label for="authUser">ชื่อผู้ใช้หรืออีเมล</label><input id="authUser" type="text" autocomplete="username" required></div>
      <div class="field"><label for="authPass">รหัสผ่าน</label><input id="authPass" type="password" autocomplete="current-password" required></div>
      <p class="auth-msg" id="authMsg" role="alert"></p>
      <button class="btn-primary" id="authSubmit" type="submit">เข้าสู่ระบบ</button>
    </form>
    <div class="auth-links">
      <a href="<?= workspaceUrl ?>" target="_top">ไปที่ LPCH RO Workspace</a>
      <a href="<?= workspaceUrl ?>" target="_top">สมัครสมาชิก / ลืมรหัสผ่าน</a>
    </div>
  </main>
</div>
<div class="wrap">`
);

html = replaceOnce(
  html,
  '    <div class="ref-box">',
  `    <div class="session">
      <span><b id="whoName"></b> <span class="role" id="whoRole"></span></span>
      <button type="button" class="btn" id="logoutBtn">ออกจากระบบ</button>
    </div>
    <div class="ref-box">`
);

// The page runs in a sandboxed iframe: the outer URL's ?sso= / ?tab= only reach it through google.script.url,
// and the saved Workspace token lives in this app's own localStorage.
html = replaceOnce(
  html,
  "</body>",
  `<script>
(function () {
  "use strict";
  var KEY = "tdf-workspace-token";
  var $ = function (id) { return document.getElementById(id); };
  var gas = window.google && google.script && google.script.run;
  var token = "";

  function save(t) { try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ } }
  function saved() { try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; } }
  function call(fn, args, ok, fail) {
    var r = google.script.run.withSuccessHandler(ok).withFailureHandler(function (e) { fail(e && e.message ? e.message : String(e)); });
    r[fn].apply(r, args);
  }

  function showForm(message, kind) {
    document.body.classList.add("locked");
    $("auth").hidden = false;
    $("authBusy").hidden = true;
    $("authForm").hidden = false;
    $("authSubmit").disabled = false;
    $("authMsg").textContent = message || "";
    $("authMsg").className = "auth-msg " + (kind || "err");
    ($("authUser").value ? $("authPass") : $("authUser")).focus();
  }

  function signedIn(res) {
    token = res.token;
    save(token);
    $("whoName").textContent = res.user.name;
    $("whoRole").textContent = res.user.role;
    $("whoRole").hidden = !res.user.role;
    $("authPass").value = "";
    $("auth").hidden = true;
    document.body.classList.remove("locked");
    window.dispatchEvent(new Event("resize")); // draw charts that were laid out while hidden
  }

  function trySaved(previousError) {
    var t = saved();
    if (!t) return showForm(previousError);
    call("tdfMe", [t], signedIn, function (err) { save(""); showForm(previousError || err); });
  }

  $("authForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!gas) return showForm("เข้าสู่ระบบได้เมื่อเปิดผ่าน Apps Script web app");
    $("authSubmit").disabled = true;
    $("authMsg").textContent = "กำลังเข้าสู่ระบบ…";
    $("authMsg").className = "auth-msg info";
    call("tdfLogin", [$("authUser").value.trim(), $("authPass").value], signedIn, function (err) { showForm(err); });
  });

  $("logoutBtn").addEventListener("click", function () {
    $("logoutBtn").disabled = true;
    var done = function () { $("logoutBtn").disabled = false; token = ""; save(""); showForm("ออกจากระบบแล้ว", "info"); };
    if (gas) call("tdfLogout", [token], done, done); else done();
  });

  if (!gas) return showForm("");
  google.script.url.getLocation(function (loc) {
    var p = loc.parameter || {};
    var tab = p.tab || loc.hash;
    var btn = tab && $("tab-" + tab);
    if (btn) btn.click();
    if (p.sso) {
      // a ticket works once: drop it from the address bar so a reload or a shared link does not reuse it
      google.script.history.replace(null, p.tab ? { tab: p.tab } : {}, "");
      call("tdfSso", [p.sso], signedIn, function (err) { trySaved(err); });
    } else {
      trySaved("");
    }
  });
})();
</script>
</body>`
);

const header = "<!-- Generated by build-apps-script.js from index.html — edit the source, then rebuild. -->\n";
fs.writeFileSync(path.join(out, "Index.html"), header + html);
fs.writeFileSync(path.join(out, "Tdf.html"), header + "<script>\n" + js + "</script>\n");
console.log("Wrote apps-script/Index.html and apps-script/Tdf.html");
