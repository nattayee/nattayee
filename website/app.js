(function () {
  "use strict";

  var S = window.SITE;
  var Auth = window.Auth;
  var app = document.getElementById("app");
  var userMenu = document.getElementById("userMenu");
  var authScreen = document.getElementById("authScreen");

  // Member pages (not in the top menu).
  S.pages.account = { title: "บัญชีของฉัน", lead: "ข้อมูลสมาชิกและการเปลี่ยนรหัสผ่าน", widgets: ["account"] };
  S.pages.inbox = { title: "ข้อความส่วนตัว", bare: true, widgets: ["inbox"] };
  S.pages.admin = { title: "จัดการสมาชิก", lead: "อนุมัติผู้สมัคร ระงับบัญชี และกำหนดสิทธิ์ผู้ดูแลระบบ", widgets: ["admin"], adminOnly: true };
  S.pages["status-settings"] = { title: "ตั้งค่าสถานะ", lead: "ตัวเลือกสถานะ (อยู่ ลา ประชุม …) และรายชื่อเครื่องและห้องที่สมาชิกเลือกได้", widgets: ["statusSettings"], adminOnly: true };
  S.pages.menus = { title: "จัดการเมนู", lead: "เพิ่ม แก้ไข เรียงลำดับ และซ่อนเมนูย่อยในแต่ละหัวข้อ", widgets: ["menus"], adminOnly: true };
  var navEl = document.getElementById("nav");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function isExternal(url) { return /^https?:/i.test(url); }

  // A link whose url is "#" or empty is a placeholder waiting for a real Drive/Docs URL.
  function link(label, url, sso) {
    if (!url || url === "#") return '<span class="placeholder">' + esc(label) + "</span>";
    return '<a href="' + esc(url) + '"' + (isExternal(url) ? ' target="_blank" rel="noopener"' : "") +
      (sso ? ' data-sso="' + esc(url) + '"' : "") + ">" + esc(label) + "</a>";
  }

  function section(title, lead, body) {
    return '<section class="section">' + (title ? "<h2>" + esc(title) + "</h2>" : "") +
      (lead ? '<p class="lead">' + esc(lead) + "</p>" : "") + body + "</section>";
  }

  // Find the nav entry (and its parent) for a page key.
  function findNav(page) {
    for (var i = 0; i < S.nav.length; i++) {
      var n = S.nav[i];
      if (n.page === page) return { item: n, parent: null };
      var kids = n.children || [];
      for (var j = 0; j < kids.length; j++) if (kids[j].page === page) return { item: kids[j], parent: n };
    }
    return null;
  }

  /* ---------------- Navigation ---------------- */

  function renderNav() {
    navEl.innerHTML = S.nav.map(function (n, i) {
      if (!n.children) return '<a class="nav-link" href="#/' + esc(n.page) + '" data-page="' + esc(n.page) + '">' + esc(n.label) + "</a>";
      var sub = n.children.map(function (c) {
        return '<a href="#/' + esc(c.page) + '" data-page="' + esc(c.page) + '">' + esc(c.label) + "</a>";
      }).join("");
      return '<div class="nav-item has-sub" data-page="' + esc(n.page) + '">' +
        '<a class="nav-link" href="#/' + esc(n.page) + '" data-page="' + esc(n.page) + '">' + esc(n.label) + "</a>" +
        '<button class="sub-toggle" aria-label="เปิดเมนูย่อย ' + esc(n.label) + '" aria-expanded="false" aria-controls="sub' + i + '">' +
        '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>' +
        '<div class="submenu" id="sub' + i + '">' + sub + "</div></div>";
    }).join("");

    navEl.querySelectorAll(".sub-toggle").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var item = btn.parentElement;
        var open = !item.classList.contains("open");
        closeSubmenus();
        item.classList.toggle("open", open);
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    });
  }

  function closeSubmenus() {
    navEl.querySelectorAll(".has-sub").forEach(function (i) {
      i.classList.remove("open");
      i.querySelector(".sub-toggle").setAttribute("aria-expanded", "false");
    });
  }

  /* ---------------- Widgets ---------------- */

  var widgets = {

    account: function () { return '<section class="section" id="accountRoot"></section>'; },

    admin: function () { return '<section class="section" id="adminRoot"></section>'; },

    menus: function () { return '<section class="section" id="menusRoot"></section>'; },

    team: function () { return '<section class="section team-wrap" id="teamRoot" aria-label="สถานะทีม"></section>'; },

    statusSettings: function () { return '<section class="section" id="statusSettingsRoot"></section>'; },

    inbox: function () { return '<section class="section" id="inboxRoot"></section>'; },

    announcements: function () {
      return '<section class="section" id="chatRoot"></section>';
    },

    quicklinks: function () {
      var tiles = S.quickLinks.map(function (q) {
        return '<a class="card tile" href="' + esc(q.url) + '"' + (isExternal(q.url) ? ' target="_blank" rel="noopener"' : "") +
          (q.sso ? ' data-sso="' + esc(q.url) + '"' : "") + ">" +
          '<span class="tile-icon" aria-hidden="true">' + esc(q.icon || "") + "</span>" +
          "<div><strong>" + esc(q.label) + "</strong><span>" + esc(q.desc || "") + "</span></div></a>";
      }).join("");
      // admins edit these buttons on the "จัดการเมนู" page (menus.js)
      var manage = Auth.user && Auth.user.isAdmin && window.Menus ? '<div class="menu-adminbar"><a class="chip" href="#/menus">⚙️ จัดการปุ่ม Workspace</a></div>' : "";
      return section("Workspace", "เลือกส่วนงาน", manage + '<div class="grid">' + tiles + "</div>");
    },

    subpages: function (page) {
      var nav = findNav(page);
      var kids = (nav && nav.item.children) || [];
      var tiles = kids.map(function (c) {
        var p = S.pages[c.page] || {};
        return '<a class="card tile" href="#/' + esc(c.page) + '"><div><strong>' + esc(c.label) + "</strong>" +
          "<span>" + esc(p.lead || "") + "</span></div></a>";
      }).join("");
      return section("", "", '<div class="grid">' + tiles + "</div>");
    },

    constraints: function () {
      var regions = ["ทั้งหมด"].concat(S.constraints.map(function (c) { return c.region; })
        .filter(function (r, i, a) { return a.indexOf(r) === i; }));
      var chips = regions.map(function (r, i) {
        return '<button class="chip' + (i === 0 ? " active" : "") + '" data-region="' + esc(r) + '">' + esc(r) + "</button>";
      }).join("");
      return section("Dose constraints", "ค่าจำกัดปริมาณรังสีของอวัยวะสำคัญ (Organs at risk)",
        '<div class="toolbar">' + chips +
        '<input class="search" id="organSearch" type="search" placeholder="ค้นหาอวัยวะ…" aria-label="ค้นหาอวัยวะ"></div>' +
        '<div class="table-wrap card flush"><table><thead><tr><th>Region</th><th>Organ at risk</th><th>Constraint</th><th>Endpoint</th></tr></thead>' +
        '<tbody id="constraintRows"></tbody></table></div>' +
        '<div class="note">ค่าอ้างอิงจาก QUANTEC (Int J Radiat Oncol Biol Phys 2010; 76(3) Suppl) สำหรับ conventional fractionation 1.8–2 Gy/fx ' +
        "ไม่ใช้กับ SBRT/SRS — โปรดยึดตาม protocol ของหน่วยงานและดุลยพินิจของแพทย์เป็นหลัก</div>");
    },

    calculators: function () {
      var abOptions = [
        ["10", "10 — Tumor / acute-reacting tissue"],
        ["3", "3 — Late-reacting tissue"],
        ["2", "2 — CNS / spinal cord"],
        ["1.5", "1.5 — Prostate"],
        ["custom", "กำหนดเอง…"],
      ].map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + "</option>"; }).join("");

      var bed =
        '<div class="card"><h3>🧮 BED / EQD2 Calculator</h3>' +
        '<div class="form-row"><label for="bedD">Dose per fraction, d (Gy)</label><input id="bedD" type="number" min="0" step="0.01" value="2"></div>' +
        '<div class="form-row"><label for="bedN">Number of fractions, n</label><input id="bedN" type="number" min="1" step="1" value="35"></div>' +
        '<div class="form-row"><label for="bedAB">α/β (Gy)</label><select id="bedAB">' + abOptions + "</select></div>" +
        '<div class="form-row" id="bedABCustomRow" hidden><label for="bedABCustom">α/β กำหนดเอง (Gy)</label><input id="bedABCustom" type="number" min="0.1" step="0.1" value="4"></div>' +
        '<div class="results"><div class="result"><small>Total dose</small><b id="outTD">–</b></div>' +
        '<div class="result"><small>BED</small><b id="outBED">–</b></div>' +
        '<div class="result"><small>EQD2</small><b id="outEQD2">–</b></div></div>' +
        '<p class="formula">BED = n·d·(1 + d / (α/β)) &nbsp;·&nbsp; EQD2 = BED / (1 + 2 / (α/β))</p></div>';

      var conv =
        '<div class="card"><h3>🔁 Fractionation converter</h3>' +
        '<p class="muted" style="margin-top:0">หาจำนวน fraction ที่ให้ EQD2 เท่ากับเป้าหมาย เมื่อเปลี่ยนขนาดต่อ fraction</p>' +
        '<div class="form-row"><label for="cvTarget">Target EQD2 (Gy)</label><input id="cvTarget" type="number" min="0" step="0.1" value="60"></div>' +
        '<div class="form-row"><label for="cvD">New dose per fraction (Gy)</label><input id="cvD" type="number" min="0" step="0.01" value="2.75"></div>' +
        '<div class="form-row"><label for="cvAB">α/β (Gy)</label><input id="cvAB" type="number" min="0.1" step="0.1" value="10"></div>' +
        '<div class="results"><div class="result"><small>Fractions (exact)</small><b id="cvN">–</b></div>' +
        '<div class="result"><small>Rounded n</small><b id="cvNR">–</b></div>' +
        '<div class="result"><small>Total dose</small><b id="cvTD">–</b></div></div>' +
        '<p class="formula">n = EQD2·(1 + 2/(α/β)) / [d·(1 + d/(α/β))] — ไม่ได้คิดผลของเวลา (time factor / repopulation)</p></div>';

      return section("เครื่องมือคำนวณ", "Linear-quadratic model สำหรับการเปรียบเทียบ fractionation schedule",
        '<div class="grid wide">' + bed + conv + "</div>" +
        '<div class="note">ผลการคำนวณใช้เพื่อประกอบการตัดสินใจเท่านั้น โปรดตรวจสอบซ้ำก่อนนำไปใช้ทางคลินิก</div>');
    },
  };

  /* ---------------- Page rendering ---------------- */

  function renderPage(key) {
    var p = S.pages[key];
    var nav = findNav(key);
    var html = "";

    if (key !== "home" && !p.bare) {
      var crumbs = '<a href="#/home">Home</a>' +
        (nav && nav.parent ? ' <span>›</span> <a href="#/' + esc(nav.parent.page) + '">' + esc(nav.parent.label) + "</a>" : "") +
        " <span>›</span> " + esc(p.title);
      html += '<nav class="breadcrumb" aria-label="breadcrumb">' + crumbs + "</nav>" +
        '<header class="page-head"><h2>' + esc(p.title) + "</h2>" + (p.lead ? '<p class="lead">' + esc(p.lead) + "</p>" : "") + "</header>";
      if (window.Menus) html += window.Menus.adminBar(key);
    }

    if (p.specs) {
      html += section("ข้อมูลเครื่อง", "", '<div class="card flush"><table class="specs"><tbody>' +
        p.specs.map(function (r) { return "<tr><th>" + esc(r[0]) + "</th><td>" + esc(r[1]) + "</td></tr>"; }).join("") +
        "</tbody></table></div>");
    }

    // Web apps used every day (e.g. TRS-398 Output Calibration): big card with an "open" button, new tab
    if (p.apps) {
      html += section("", "", '<div class="grid wide">' + p.apps.map(function (a) {
        return '<a class="card app-card" href="' + esc(a.url) + '"' + (isExternal(a.url) ? ' target="_blank" rel="noopener"' : "") +
          (a.sso ? ' data-sso="' + esc(a.url) + '"' : "") + ">" +
          '<span class="app-icon" aria-hidden="true">' + (a.icon || "🔗") + "</span>" +
          '<div class="app-body"><strong>' + esc(a.label) + "</strong>" +
          (a.desc ? "<span>" + esc(a.desc) + "</span>" : "") +
          (a.note ? '<small>' + esc(a.note) + "</small>" : "") + "</div>" +
          '<span class="app-open">เปิดแอป ↗</span></a>';
      }).join("") + "</div>");
    }

    if (p.groups) {
      html += section("", "", '<div class="grid">' + p.groups.map(function (g) {
        return '<div class="card"><h3>' + (g.icon ? g.icon + " " : "") + esc(g.title) + '</h3><ul class="link-list">' +
          g.items.map(function (i) {
            return "<li>" + link(i.label, i.url, i.sso) + (i.type ? '<span class="badge">' + esc(i.type) + "</span>" : "") + "</li>";
          }).join("") + "</ul></div>";
      }).join("") + "</div>");
    }

    (p.widgets || []).forEach(function (w) { html += widgets[w](key); });
    // A page with a sidebar (Home: สถานะทีม) gets two columns on wide screens; the sidebar goes below on phones.
    if (p.sidebar && widgets[p.sidebar]) html = '<div class="with-side"><div class="main-col">' + html + '</div><aside class="side-col">' + widgets[p.sidebar](key) + "</aside></div>";
    return html;
  }

  /* ---------------- Interactive widgets ---------------- */

  function initConstraints() {
    var tbody = document.getElementById("constraintRows");
    if (!tbody) return;
    var search = document.getElementById("organSearch");
    var region = "ทั้งหมด";

    function render() {
      var q = search.value.trim().toLowerCase();
      var rows = S.constraints.filter(function (c) {
        return (region === "ทั้งหมด" || c.region === region) &&
          (!q || (c.organ + " " + c.endpoint).toLowerCase().indexOf(q) !== -1);
      });
      tbody.innerHTML = rows.length
        ? rows.map(function (c) {
            return "<tr><td>" + esc(c.region) + "</td><td><strong>" + esc(c.organ) + "</strong></td><td>" +
              esc(c.constraint) + "</td><td>" + esc(c.endpoint) + "</td></tr>";
          }).join("")
        : '<tr><td colspan="4" class="muted">ไม่พบข้อมูล</td></tr>';
    }

    document.querySelectorAll(".chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        document.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        region = chip.getAttribute("data-region");
        render();
      });
    });
    search.addEventListener("input", render);
    render();
  }

  function fmt(x) {
    return isFinite(x) ? (Math.round(x * 100) / 100).toString() : "–";
  }

  function initCalculators() {
    var d = document.getElementById("bedD");
    if (!d) return;
    var n = document.getElementById("bedN");
    var ab = document.getElementById("bedAB");
    var abCustomRow = document.getElementById("bedABCustomRow");
    var abCustom = document.getElementById("bedABCustom");

    function calcBED() {
      abCustomRow.hidden = ab.value !== "custom";
      var dv = parseFloat(d.value), nv = parseFloat(n.value);
      var abv = parseFloat(ab.value === "custom" ? abCustom.value : ab.value);
      var ok = dv > 0 && nv > 0 && abv > 0;
      var td = nv * dv;
      var bed = td * (1 + dv / abv);
      var eqd2 = bed / (1 + 2 / abv);
      document.getElementById("outTD").textContent = ok ? fmt(td) + " Gy" : "–";
      document.getElementById("outBED").textContent = ok ? fmt(bed) + " Gy" : "–";
      document.getElementById("outEQD2").textContent = ok ? fmt(eqd2) + " Gy" : "–";
    }
    [d, n, ab, abCustom].forEach(function (el) { el.addEventListener("input", calcBED); });
    calcBED();

    var t = document.getElementById("cvTarget");
    var cd = document.getElementById("cvD");
    var cab = document.getElementById("cvAB");

    function calcConv() {
      var tv = parseFloat(t.value), dv = parseFloat(cd.value), abv = parseFloat(cab.value);
      var ok = tv > 0 && dv > 0 && abv > 0;
      var nExact = (tv * (1 + 2 / abv)) / (dv * (1 + dv / abv));
      var nRound = Math.max(1, Math.round(nExact));
      document.getElementById("cvN").textContent = ok ? fmt(nExact) : "–";
      document.getElementById("cvNR").textContent = ok ? nRound + " fx" : "–";
      document.getElementById("cvTD").textContent = ok ? fmt(nRound * dv) + " Gy" : "–";
    }
    [t, cd, cab].forEach(function (el) { el.addEventListener("input", calcConv); });
    calcConv();
  }

  /* ---------------- Router ---------------- */

  var unmountChat = null;
  var unmountInbox = null;

  var unmountTeam = null;
  function unmountWidgets() {
    if (unmountTeam) { unmountTeam(); unmountTeam = null; }
    if (unmountChat) { unmountChat(); unmountChat = null; }
    if (unmountInbox) { unmountInbox(); unmountInbox = null; }
  }

  /*
   * Apps that sign in with this site's account (sso: true in data.js, e.g. TRS-398): the link carries a
   * one-use ticket (?sso=…, from ssoTicket in Code.gs) fetched ahead of time, so a click opens the app in a
   * new tab straight away (no pop-up blocker) and the app knows who it is. A ticket lasts 2 minutes, so it
   * is renewed while the page stays open and right after each click.
   */
  var ssoTimer = null;
  function initSso() {
    clearTimeout(ssoTimer);
    var links = app.querySelectorAll("a[data-sso]");
    if (!links.length || !Auth.remote) return;
    Auth.call("ssoTicket").then(function (r) {
      links.forEach(function (a) {
        var base = a.getAttribute("data-sso");
        a.href = base + (base.indexOf("?") === -1 ? "?" : "&") + "sso=" + encodeURIComponent(r.ticket);
      });
      ssoTimer = setTimeout(initSso, Math.max(30, (r.expiresIn || 120) - 30) * 1000);
    }, function () { /* Code.gs without ssoTicket: plain link, the app asks for a sign-in itself */ });
  }
  app.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("a[data-sso]")) setTimeout(initSso, 300);   // that ticket is used now
  });

  var renderedPage = null;
  function route() {
    if (!Auth.user) return;
    var page = (location.hash.replace(/^#\/?/, "") || "home").split("?")[0];
    if (!S.pages[page] || (S.pages[page].adminOnly && !Auth.user.isAdmin)) page = "home";

    unmountWidgets();
    app.innerHTML = renderPage(page);
    initConstraints();
    initCalculators();
    initSso();
    var chatRoot = document.getElementById("chatRoot");
    if (chatRoot && window.Chat) unmountChat = window.Chat.mount(chatRoot);
    var inboxRoot = document.getElementById("inboxRoot");
    if (inboxRoot && window.DM) {
      // #/inbox?u=<username> opens that conversation directly
      var m = /[?&]u=([^&]+)/.exec(location.hash);
      unmountInbox = window.DM.mount(inboxRoot, m ? decodeURIComponent(m[1]) : null);
    }
    document.getElementById("inboxLink").classList.toggle("active", page === "inbox");
    // Chat pages fill the screen like a chat app (compact header on phones, no footer).
    document.body.classList.toggle("chat-page", page === "chat" || page === "inbox");
    fitChat();
    var accountRoot = document.getElementById("accountRoot");
    if (accountRoot) Auth.mountAccount(accountRoot);
    var adminRoot = document.getElementById("adminRoot");
    if (adminRoot) Auth.mountAdmin(adminRoot);
    var teamRoot = document.getElementById("teamRoot");
    if (teamRoot && window.Status) unmountTeam = window.Status.mountTeam(teamRoot);
    var stSet = document.getElementById("statusSettingsRoot");
    if (stSet && window.Status) window.Status.mountSettings(stSet);
    var menusRoot = document.getElementById("menusRoot");
    if (menusRoot && window.Menus) {
      // #/menus?add=<heading> opens the editor for a new sub-menu, ?edit=<page> for an existing one
      var add = /[?&]add=([^&]+)/.exec(location.hash), edit = /[?&]edit=([^&]+)/.exec(location.hash);
      window.Menus.mount(menusRoot, { add: add && decodeURIComponent(add[1]), edit: edit && decodeURIComponent(edit[1]) });
    }
    renderedPage = page;


    // Highlight the top-level item that owns this page.
    var nav = findNav(page);
    var top = nav ? (nav.parent || nav.item).page : "home";
    navEl.querySelectorAll(".nav-link").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-page") === top);
    });
    navEl.querySelectorAll(".submenu a").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-page") === page);
    });

    var cur = nav ? nav.item.label : S.pages[page].title;
    document.getElementById("menuCurrent").textContent = cur;

    closeSubmenus();
    closeUserMenu();
    navEl.classList.remove("open");
    document.getElementById("menuToggle").setAttribute("aria-expanded", "false");

    document.title = page === "home" ? S.title : S.pages[page].title + " · " + S.title;
    window.scrollTo(0, 0);
  }

  /* ---------------- Signed-in user ---------------- */

  function renderUserMenu() {
    var u = Auth.user;
    var badge = document.getElementById("userBadge");
    badge.hidden = !u;
    if (!u) { userMenu.innerHTML = ""; return; }
    document.getElementById("userName").textContent = u.fullName + " (" + u.role + ")";
    // First letter for the avatar, skipping Thai leading vowels (เ แ โ ใ ไ).
    var initial = (u.fullName || u.username).trim().replace(/^[\u0e40-\u0e44]/, "").charAt(0);
    userMenu.innerHTML =
      '<button class="user-btn" id="userBtn" aria-haspopup="true" aria-expanded="false" aria-controls="userDrop">' +
        '<span class="avatar" aria-hidden="true">' + esc(initial) + "</span>" +
        '<span class="user-name">' + esc(u.fullName) + "</span></button>" +
      '<div class="user-drop" id="userDrop" hidden>' +
        '<div class="user-info"><strong>' + esc(u.fullName) + "</strong><span>" + esc(Auth.roleName(u.role)) +
          (u.isAdmin ? " · admin" : "") + "</span></div>" +
        '<a href="#/inbox">✉️ ข้อความส่วนตัว</a>' +
        '<a href="#/account">👤 บัญชีของฉัน</a>' +
        (window.Status ? '<button type="button" id="statusBtn">📍 ตั้งสถานะของฉัน</button>' : "") +
        (u.isAdmin ? '<a href="#/admin">👥 จัดการสมาชิก</a><a href="#/menus">🧭 จัดการเมนู</a><a href="#/status-settings">🏷️ ตั้งค่าสถานะ</a>' : "") +
        (window.Notifier ? window.Notifier.menuHtml() : "") +
        '<button type="button" id="logoutBtn">🚪 ออกจากระบบ</button>' +
      "</div>";
    var btn = document.getElementById("userBtn");
    var drop = document.getElementById("userDrop");
    if (window.Notifier) window.Notifier.bindMenu(drop);
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      drop.hidden = !drop.hidden;
      // Keep the menu inside the screen (on phones the button is not at the right edge).
      drop.style.left = drop.style.right = "";
      if (!drop.hidden) {
        var r = drop.getBoundingClientRect(), gap = 12;
        if (r.right > window.innerWidth - gap) { drop.style.right = "auto"; drop.style.left = (drop.offsetLeft - (r.right - (window.innerWidth - gap))) + "px"; }
        else if (r.left < gap) { drop.style.right = "auto"; drop.style.left = (drop.offsetLeft + (gap - r.left)) + "px"; }
      }
      btn.setAttribute("aria-expanded", drop.hidden ? "false" : "true");
    });
    drop.addEventListener("click", function () { drop.hidden = true; });
    document.getElementById("logoutBtn").addEventListener("click", function () { Auth.logout(); });
    var stBtn = document.getElementById("statusBtn");
    if (stBtn) stBtn.addEventListener("click", function () { window.Status.openEditor(); });
    if (window.Status) window.Status.renderPill();
  }

  function closeUserMenu() {
    var drop = document.getElementById("userDrop");
    if (drop) drop.hidden = true;
  }

  // Show the site for a signed-in member, or the login / sign-up screen.
  function applyAuth(user) {
    document.body.classList.toggle("locked", !user);
    renderUserMenu();
    if (user) {
      authScreen.innerHTML = "";
      // Accounts created before email was required are asked to add one (needed to reset a password).
      if (!user.email && location.hash !== "#/account") location.hash = "#/account";
      route();
      if (window.Status) window.Status.load().catch(function () { /* the pill says "ตั้งสถานะ" until it loads */ });
      // Sub-menus added by admins (Menus sheet): once loaded, draw the page again so a custom page opened by
      // link, or a heading's list of sub-menus, shows them (chat pages keep running as they are).
      if (window.Menus) window.Menus.load().then(function () {
        if (Auth.user && ["chat", "inbox", "menus"].indexOf(renderedPage) === -1) route();
      });
      // Pop-ups for new announcements and private messages (also keeps the unread badges current).
      if (window.Notifier) window.Notifier.start();
    } else {
      unmountWidgets();
      if (window.Notifier) window.Notifier.stop();
      app.innerHTML = "";
      Auth.showLogin(authScreen);
    }
  }

  var titleEl = document.getElementById("siteTitle");
  titleEl.textContent = S.brand.name + " ";
  titleEl.appendChild(document.createElement("span")).textContent = S.brand.accent;
  document.getElementById("siteOrg").textContent = S.brand.org;
  document.getElementById("footerOrg").textContent = S.organization;

  // Theme switch (auto / light / dark), stored per browser by the snippet in index.html.
  document.querySelectorAll('input[name="theme"]').forEach(function (r) {
    r.checked = r.value === window.LPCHTheme.get();
    r.addEventListener("change", function () { window.LPCHTheme.set(r.value); });
  });

  renderNav();
  if (window.Menus) window.Menus.onChange(function () {
    renderNav();
    // keep the active item highlighted after the menu is drawn again
    var page = renderedPage || "home", nav = findNav(page), top = nav ? (nav.parent || nav.item).page : "home";
    navEl.querySelectorAll(".nav-link").forEach(function (a) { a.classList.toggle("active", a.getAttribute("data-page") === top); });
  });

  document.getElementById("menuToggle").addEventListener("click", function () {
    var open = navEl.classList.toggle("open");
    this.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.addEventListener("click", function (e) {
    if (!navEl.contains(e.target)) closeSubmenus();
    if (!userMenu.contains(e.target)) closeUserMenu();
  });
  window.addEventListener("resize", closeUserMenu);
  window.addEventListener("resize", fitChat);

  // Size the chat panel to the rest of the screen below the header and menu bar.
  function fitChat() {
    var el = app.querySelector(".chat, .dm");
    if (!el) return;
    var top = el.getBoundingClientRect().top + window.scrollY;
    var h = (window.visualViewport ? window.visualViewport.height : window.innerHeight) - top - 10;
    el.style.height = Math.max(420, Math.round(h)) + "px";
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeSubmenus(); closeUserMenu(); }
  });

  window.addEventListener("hashchange", route);
  Auth.onChange(applyAuth);
  Auth.init().then(applyAuth);
})();
