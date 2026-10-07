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

// copy-code.html: one box per Apps Script file with a copy button, for pasting into the Apps Script editor.
const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const files = [
  { name: "Code.gs", as: "ไฟล์ Code (มีอยู่แล้ว) วางทับทั้งหมด", file: "Code.gs" },
  { name: "Index", as: "กด + → HTML → ตั้งชื่อ Index", file: "Index.html" },
  { name: "Tdf", as: "กด + → HTML → ตั้งชื่อ Tdf", file: "Tdf.html" },
];
const boxes = files.map((f, i) => {
  const text = fs.readFileSync(path.join(out, f.file), "utf8");
  const lines = text.split("\n").length;
  return `  <section class="box">
    <div class="box-head">
      <div><span class="step">${i + 1}</span><b>${f.name}</b><span class="as">${f.as}</span></div>
      <button type="button" class="copy" data-target="code${i}">คัดลอก</button>
    </div>
    <textarea id="code${i}" readonly spellcheck="false" aria-label="โค้ด ${f.name}">${escapeHtml(text)}</textarea>
    <div class="meta">${lines.toLocaleString("en-US")} บรรทัด · ${(Buffer.byteLength(text) / 1024).toFixed(1)} KB</div>
  </section>`;
}).join("\n");

const copyPage = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>TDF Apps Script Code</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&family=IBM+Plex+Sans+Thai:wght@400;600;700&display=swap">
<style>
:root {
  --bg: #EEF1F6; --surface: #FFFFFF; --code-bg: #F6F8FB; --ink: #152033; --ink-2: #4B5A70; --muted: #6E7C90; --line: #D6DDE8;
  --accent: #2747B0; --accent-ink: #2747B0; --on-accent: #FFFFFF; --good: #1E7A4C;
  --font-body: "IBM Plex Sans Thai", "Noto Sans Thai", "Leelawadee UI", Tahoma, system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --bg: #10151F; --surface: #171E2A; --code-bg: #121822; --ink: #E7ECF4; --ink-2: #B3BECF; --muted: #8592A6; --line: #2B3546;
    --accent: #6A86EE; --accent-ink: #9DB0FF; --on-accent: #0E1424; --good: #5CC08A; color-scheme: dark; }
}
:root[data-theme="dark"] { --bg: #10151F; --surface: #171E2A; --code-bg: #121822; --ink: #E7ECF4; --ink-2: #B3BECF; --muted: #8592A6; --line: #2B3546;
  --accent: #6A86EE; --accent-ink: #9DB0FF; --on-accent: #0E1424; --good: #5CC08A; color-scheme: dark; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 400 15px/1.55 var(--font-body); padding: 0 16px; padding-block: 24px 48px; }
.wrap { max-width: 900px; margin: 0 auto; display: grid; gap: 16px; }
h1 { margin: 0; font-size: 1.4rem; text-wrap: balance; }
h1 span { color: var(--accent-ink); }
.intro { margin: 0; color: var(--ink-2); }
ol { margin: 0; padding-left: 20px; color: var(--ink-2); font-size: .9rem; }
.box { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px; display: grid; gap: 10px; min-width: 0; }
.box-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; }
.box-head > div { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; min-width: 0; }
.step { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--accent); color: var(--on-accent); font-size: .78rem; font-weight: 600; }
.box-head b { font-family: var(--font-mono); font-weight: 400; font-size: 1rem; }
.as { font-size: .82rem; color: var(--muted); }
.copy { appearance: none; border: 0; border-radius: 8px; background: var(--accent); color: var(--on-accent); font: 600 .9rem var(--font-body); padding: 8px 18px; cursor: pointer; min-width: 112px; }
.copy.done { background: var(--good); }
.copy:focus-visible, textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
textarea { width: 100%; height: 190px; resize: vertical; background: var(--code-bg); color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; font: 400 12px/1.5 var(--font-mono); white-space: pre; overflow: auto; }
.meta { font-size: .75rem; color: var(--muted); }
</style>
</head>
<body>
<main class="wrap">
  <h1><span>TDF</span> Dose Calculator · โค้ด Apps Script</h1>
  <p class="intro">กดปุ่มคัดลอกทีละกล่อง แล้ววางในโปรเจกต์ Apps Script ตามชื่อไฟล์</p>
  <ol>
    <li>script.google.com → New project</li>
    <li>คัดลอกทั้ง 3 กล่องไปวางตามชื่อ (ชื่อไฟล์ HTML ไม่ต้องพิมพ์ .html)</li>
    <li>Deploy → New deployment → Web app · Execute as: Me · Who has access: Anyone</li>
  </ol>
${boxes}
</main>
<script>
document.querySelectorAll(".copy").forEach(function (btn) {
  btn.addEventListener("click", function () {
    var area = document.getElementById(btn.dataset.target);
    var done = function () {
      btn.textContent = "คัดลอกแล้ว ✓";
      btn.classList.add("done");
      setTimeout(function () { btn.textContent = "คัดลอก"; btn.classList.remove("done"); }, 2000);
    };
    var fallback = function () {
      area.focus();
      area.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { /* not supported */ }
      if (ok) done(); else btn.textContent = "กด Ctrl+C / ⌘C";
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(area.value).then(done, fallback);
    else fallback();
  });
});
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(dir, "copy-code.html"), copyPage);
console.log("Wrote copy-code.html");
