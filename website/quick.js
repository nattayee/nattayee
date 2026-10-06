/*
 * ข้อความด่วน (Quick chat) — ปุ่มข้อความสำเร็จรูปเหนือช่องพิมพ์ ทั้งแชทประกาศและข้อความส่วนตัว
 * แต่ละคนตั้งข้อความของตัวเองได้สูงสุด 5 ข้อความ (ปุ่ม ⚙ บนแถบ หรือหน้า "บัญชีของฉัน")
 * เก็บบนเซิร์ฟเวอร์ (Code.gs: quickGet / quickSave → ชีต Settings) จึงใช้ได้ทุกเครื่อง; โหมดทดลองเก็บในเบราว์เซอร์
 * แตะปุ่มแล้วข้อความจะใส่ลงช่องพิมพ์ (แก้ไขได้ก่อนกดส่ง)
 */
(function () {
  "use strict";

  var MAX = 5, MAX_LEN = 100;
  var DEFAULTS = ["รับทราบครับ/ค่ะ", "ขอบคุณครับ/ค่ะ", "กำลังดำเนินการ", "เรียบร้อยแล้ว", "ขอรายละเอียดเพิ่มเติม"];
  var cache = null, cacheUser = null, pending = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function user() { return window.Auth && window.Auth.user; }
  function localKey() { return "lpch-ro-quick-" + (user() ? user().username : ""); }

  function load() {
    var u = user();
    if (!u) return Promise.resolve(DEFAULTS.slice());
    if (cache && cacheUser === u.username) return Promise.resolve(cache.slice());
    if (pending) return pending;
    var p = window.Auth.remote
      ? window.Auth.call("quickGet").then(function (r) { return r.items; })
      : Promise.resolve((function () {
          try { var v = JSON.parse(localStorage.getItem(localKey())); if (Array.isArray(v)) return v; } catch (e) { /* ignore */ }
          return DEFAULTS.slice();
        })());
    pending = p.then(function (items) {
      cache = items.slice(0, MAX);
      cacheUser = u.username;
      pending = null;
      return cache.slice();
    }, function (e) { pending = null; throw e; });
    return pending;
  }

  function clean(items) {
    return items.map(function (t) { return String(t || "").replace(/\s+/g, " ").trim(); }).filter(Boolean);
  }

  function save(items) {
    items = clean(items);
    if (items.length > MAX) return Promise.reject(new Error("ตั้งข้อความด่วนได้สูงสุด " + MAX + " ข้อความ"));
    if (items.some(function (t) { return t.length > MAX_LEN; })) return Promise.reject(new Error("ข้อความด่วนยาวได้ไม่เกิน " + MAX_LEN + " ตัวอักษร"));
    var p = window.Auth.remote
      ? window.Auth.call("quickSave", { items: items }).then(function (r) { return r.items; })
      : Promise.resolve((function () { localStorage.setItem(localKey(), JSON.stringify(items)); return items; })());
    return p.then(function (saved) {
      cache = saved.slice();
      cacheUser = user() && user().username;
      window.dispatchEvent(new CustomEvent("lpch:quick-changed"));
      return saved;
    });
  }

  /** Five text boxes to edit the list; used in the chat pop-over and on the account page. */
  function editorHtml(items, withCancel) {
    var rows = [];
    for (var i = 0; i < MAX; i++) {
      rows.push('<label class="quick-field"><span>' + (i + 1) + '</span><input type="text" maxlength="' + MAX_LEN + '" value="' +
        esc(items[i] || "") + '" placeholder="ข้อความด่วน ' + (i + 1) + ' (เว้นว่างได้)" aria-label="ข้อความด่วน ' + (i + 1) + '"></label>');
    }
    return '<div class="quick-fields">' + rows.join("") + "</div>" +
      '<p class="quick-msg" role="status" hidden></p>' +
      '<div class="quick-buttons">' +
        '<button type="button" class="quick-save">บันทึก</button>' +
        '<button type="button" class="quick-default">ใช้ค่าเริ่มต้น</button>' +
        (withCancel ? '<button type="button" class="quick-cancel">ปิด</button>' : "") +
      "</div>";
  }

  function wireEditor(el, onDone) {
    var msg = el.querySelector(".quick-msg");
    function say(text, bad) { msg.textContent = text; msg.hidden = !text; msg.classList.toggle("bad", !!bad); }
    el.querySelector(".quick-save").addEventListener("click", function () {
      var vals = Array.prototype.map.call(el.querySelectorAll(".quick-field input"), function (i) { return i.value; });
      save(vals).then(function (saved) {
        say("บันทึกแล้ว (" + saved.length + " ข้อความ)");
        if (onDone) onDone(saved);
      }, function (e) { say(e.message, true); });
    });
    el.querySelector(".quick-default").addEventListener("click", function () {
      el.querySelectorAll(".quick-field input").forEach(function (inp, i) { inp.value = DEFAULTS[i] || ""; });
      say("กด “บันทึก” เพื่อใช้ค่าเริ่มต้น");
    });
    var cancel = el.querySelector(".quick-cancel");
    if (cancel) cancel.addEventListener("click", function () { if (onDone) onDone(null); });
  }

  /**
   * Quick-chat bar above a message box: one chip per saved message (tap = put it in the box) and ⚙ to edit.
   * Returns an unmount function.
   */
  function mountBar(slot, textarea) {
    var editing = false;

    function insert(text) {
      var cur = textarea.value.trim();
      textarea.value = cur ? cur + " " + text : text;
      textarea.dispatchEvent(new Event("input", { bubbles: true })); // lets the box grow
      textarea.focus();
      try { textarea.setSelectionRange(textarea.value.length, textarea.value.length); } catch (e) { /* ignore */ }
    }

    function render(items) {
      slot.innerHTML =
        '<div class="quick-row" role="toolbar" aria-label="ข้อความด่วน">' +
          '<span class="quick-label" aria-hidden="true">⚡</span>' +
          items.map(function (t, i) { return '<button type="button" class="quick-chip" data-q="' + i + '" title="ใส่ข้อความนี้ในช่องพิมพ์">' + esc(t) + "</button>"; }).join("") +
          (items.length ? "" : '<span class="quick-empty">ยังไม่มีข้อความด่วน</span>') +
          '<button type="button" class="quick-edit" aria-expanded="' + editing + '" title="ตั้งค่าข้อความด่วน (สูงสุด ' + MAX + ' ข้อความ)" aria-label="ตั้งค่าข้อความด่วน">⚙</button>' +
        "</div>" +
        (editing ? '<div class="quick-pop">' + '<p class="quick-title">ข้อความด่วนของฉัน (สูงสุด ' + MAX + " ข้อความ)</p>" + editorHtml(items, true) + "</div>" : "");
      slot.querySelectorAll(".quick-chip").forEach(function (b) {
        b.addEventListener("click", function () { insert(items[+b.getAttribute("data-q")]); });
      });
      slot.querySelector(".quick-edit").addEventListener("click", function () { editing = !editing; render(items); });
      var pop = slot.querySelector(".quick-pop");
      if (pop) wireEditor(pop, function (saved) {
        editing = false;
        render(saved || items);
      });
    }

    function refresh() { load().then(render, function () { render(DEFAULTS.slice()); }); }
    window.addEventListener("lpch:quick-changed", refresh);
    refresh();
    return function () { window.removeEventListener("lpch:quick-changed", refresh); };
  }

  /** The editor as a card on the account page. */
  function mountSettings(el) {
    el.innerHTML = '<p class="muted">กำลังโหลด…</p>';
    load().then(function (items) {
      el.innerHTML = '<p class="quick-help">ปุ่มข้อความสำเร็จรูปเหนือช่องพิมพ์ในแชทและข้อความส่วนตัว — แตะเพื่อใส่ข้อความ แล้วกดส่ง</p>' + editorHtml(items, false);
      wireEditor(el);
    }, function (e) { el.innerHTML = '<p class="auth-error">' + esc(e.message) + "</p>"; });
  }

  // A different member signing in on this browser starts with their own list.
  if (window.Auth) window.Auth.onChange(function () { cache = null; cacheUser = null; });

  window.QuickChat = { load: load, save: save, mountBar: mountBar, mountSettings: mountSettings, MAX: MAX, DEFAULTS: DEFAULTS };
})();
