(function () {
  "use strict";

  var S = window.SITE;
  var app = document.getElementById("app");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // A link whose url is "#" or empty is a placeholder waiting for a real Drive/Docs URL.
  function link(label, url) {
    if (!url || url === "#") return '<span class="placeholder">' + esc(label) + "</span>";
    var external = /^https?:/i.test(url);
    return '<a href="' + esc(url) + '"' + (external ? ' target="_blank" rel="noopener"' : "") + ">" + esc(label) + "</a>";
  }

  function section(title, lead, body) {
    return '<section class="section"><h2>' + esc(title) + "</h2>" +
      (lead ? '<p class="lead">' + esc(lead) + "</p>" : "") + body + "</section>";
  }

  function formatDate(iso) {
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return esc(iso);
    return d.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
  }

  /* ---------------- Pages ---------------- */

  var pages = {
    home: function () {
      var tiles = S.quickLinks.map(function (q) {
        var href = q.url && q.url !== "#" ? q.url : "javascript:void(0)";
        var external = /^https?:/i.test(q.url);
        return '<a class="card tile" href="' + esc(href) + '"' + (external ? ' target="_blank" rel="noopener"' : "") + ">" +
          '<span class="tile-icon" aria-hidden="true">' + q.icon + "</span>" +
          "<div><strong>" + esc(q.label) + "</strong><span>" + esc(q.desc) + "</span></div></a>";
      }).join("");

      var news = S.announcements.map(function (a) {
        return '<div class="news-item"><time datetime="' + esc(a.date) + '">' + formatDate(a.date) + "</time>" +
          "<h4>" + esc(a.title) + "</h4><p>" + esc(a.body) + "</p></div>";
      }).join("");

      return '<div class="intro section">' +
        '<div><h2 style="color:var(--primary);margin-top:0">' + esc(S.organization) + "</h2>" +
        '<p style="font-size:1.1rem">' + esc(S.description) + "</p></div>" +
        '<div class="card"><h3>📣 ประกาศ / ข่าวสาร</h3>' + news + "</div></div>" +
        section("ลิงก์ด่วน", "เครื่องมือและเอกสารที่ใช้บ่อย", '<div class="grid">' + tiles + "</div>");
    },

    protocols: function () {
      var cards = S.protocols.map(function (p) {
        return '<div class="card"><h3>' + p.icon + " " + esc(p.site) + '</h3><ul class="link-list">' +
          p.items.map(function (i) { return "<li>" + link(i.label, i.url) + "</li>"; }).join("") +
          "</ul></div>";
      }).join("");
      return section("Treatment protocols", "แนวทางการรักษาแยกตามตำแหน่งโรค", '<div class="grid">' + cards + "</div>");
    },

    constraints: function () {
      var regions = ["ทั้งหมด"].concat(S.constraints.map(function (c) { return c.region; })
        .filter(function (r, i, a) { return a.indexOf(r) === i; }));

      var chips = regions.map(function (r, i) {
        return '<button class="chip' + (i === 0 ? " active" : "") + '" data-region="' + esc(r) + '">' + esc(r) + "</button>";
      }).join("");

      var html = '<div class="toolbar">' + chips +
        '<input class="search" id="organSearch" type="search" placeholder="ค้นหาอวัยวะ…" aria-label="ค้นหาอวัยวะ"></div>' +
        '<div class="table-wrap card" style="padding:0"><table><thead><tr><th>Region</th><th>Organ at risk</th><th>Constraint</th><th>Endpoint</th></tr></thead>' +
        '<tbody id="constraintRows"></tbody></table></div>' +
        '<div class="note">ค่าอ้างอิงจาก QUANTEC (Int J Radiat Oncol Biol Phys 2010; 76(3) Suppl) สำหรับ conventional fractionation 1.8–2 Gy/fx ' +
        "ไม่ใช้กับ SBRT/SRS — โปรดยึดตาม protocol ของหน่วยงานและดุลยพินิจของแพทย์เป็นหลัก</div>";

      return section("Dose constraints", "ค่าจำกัดปริมาณรังสีของอวัยวะสำคัญ (Organs at risk)", html);
    },

    tools: function () {
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
        '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">' + bed + conv + "</div>" +
        '<div class="note">ผลการคำนวณใช้เพื่อประกอบการตัดสินใจเท่านั้น โปรดตรวจสอบซ้ำก่อนนำไปใช้ทางคลินิก</div>');
    },

    documents: function () {
      var cards = S.documents.map(function (g) {
        return '<div class="card"><h3>' + esc(g.group) + '</h3><ul class="link-list">' +
          g.items.map(function (i) {
            return "<li>" + link(i.label, i.url) + '<span class="badge">' + esc(i.type) + "</span></li>";
          }).join("") + "</ul></div>";
      }).join("");
      return section("เอกสารและแบบฟอร์ม", "แบบฟอร์ม เอกสารยินยอม QA และ SOP ของหน่วยงาน", '<div class="grid">' + cards + "</div>");
    },

    schedule: function () {
      var cal = S.schedule.calendarEmbedUrl
        ? '<iframe class="calendar-frame card" src="' + esc(S.schedule.calendarEmbedUrl) + '" title="Calendar"></iframe>'
        : '<div class="card muted">ยังไม่ได้เชื่อม Google Calendar — ใส่ลิงก์ embed ที่ <code>schedule.calendarEmbedUrl</code> ใน <code>data.js</code></div>';

      var rows = S.schedule.items.map(function (i) {
        return "<tr><td>" + esc(i.day) + "</td><td>" + esc(i.time) + "</td><td>" + esc(i.title) + "</td></tr>";
      }).join("");

      return section("ตารางงานประจำสัปดาห์", "กิจกรรมวิชาการและงานประจำของหน่วย",
        '<div class="table-wrap card" style="padding:0"><table><thead><tr><th>วัน</th><th>เวลา</th><th>กิจกรรม</th></tr></thead><tbody>' +
        rows + "</tbody></table></div>") +
        section("ปฏิทิน / ตารางเวร", "", cal);
    },

    contact: function () {
      var cards = S.contacts.map(function (c) {
        return '<div class="card contact-card"><h3>' + esc(c.role) + "</h3>" +
          "<p>👤 " + esc(c.name) + "</p>" +
          (c.phone ? "<p>📞 " + esc(c.phone) + "</p>" : "") +
          (c.email ? '<p>✉️ <a href="mailto:' + esc(c.email) + '">' + esc(c.email) + "</a></p>" : "") +
          "</div>";
      }).join("");
      return section("ติดต่อ", "ผู้รับผิดชอบและช่องทางติดต่อภายในหน่วย", '<div class="grid">' + cards + "</div>");
    },
  };

  /* ---------------- Page behaviour ---------------- */

  function initConstraints() {
    var tbody = document.getElementById("constraintRows");
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

  function initTools() {
    var d = document.getElementById("bedD");
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

  var after = { constraints: initConstraints, tools: initTools };

  /* ---------------- Router ---------------- */

  function route() {
    var page = (location.hash.replace(/^#\/?/, "") || "home").split("?")[0];
    if (!pages[page]) page = "home";

    app.innerHTML = pages[page]();
    if (after[page]) after[page]();

    document.getElementById("banner").classList.toggle("compact", page !== "home");
    document.querySelectorAll(".nav a").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-page") === page);
    });

    var nav = document.getElementById("nav");
    nav.classList.remove("open");
    document.getElementById("menuToggle").setAttribute("aria-expanded", "false");

    var label = document.querySelector('.nav a[data-page="' + page + '"]');
    document.title = page === "home" ? S.title : label.textContent + " · " + S.title;
    window.scrollTo(0, 0);
  }

  document.getElementById("bannerTitle").textContent = S.title;
  document.getElementById("bannerSubtitle").textContent = S.subtitle;
  document.getElementById("footerOrg").textContent = S.organization;

  document.getElementById("menuToggle").addEventListener("click", function () {
    var nav = document.getElementById("nav");
    var open = nav.classList.toggle("open");
    this.setAttribute("aria-expanded", open ? "true" : "false");
  });

  window.addEventListener("hashchange", route);
  route();
})();
