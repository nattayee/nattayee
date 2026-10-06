/*
 * Google Apps Script bridge. When the page runs as an Apps Script web app (google.script.run exists
 * and there is no claude.ai viewer), it provides the same claude.use('mcp') interface the page uses
 * in claude.ai, backed by the server functions in WebApp.gs:
 *   download_file_content → apiExportXlsx(fileId)
 *   create_file           → apiAppendReport(csvText, token)   (writes straight to the Log tab)
 * It also shows who is signed in: the Google account signed in right now (hidden sign-in frame), a
 * "Sign in with Google" button when that cannot be read, or a typed Gmail when sign-in is not set up.
 * Errors come back as {code: 'tool_error', message} so the page's existing messages apply.
 */
(function () {
  'use strict';
  if (window.claude || !(window.google && google.script && google.script.run)) return;

  function call(fn) {
    var args = [].slice.call(arguments, 1);
    return new Promise(function (resolve, reject) {
      var run = google.script.run
        .withSuccessHandler(function (payload) { resolve({ payload: payload }); })
        .withFailureHandler(function (err) { reject({ code: 'tool_error', message: (err && err.message) || String(err) }); });
      run[fn].apply(run, args);
    });
  }

  // Login token from the sign-in deployment (?login=1): arrives once in the page, then kept in this browser
  var TOKEN_KEY = 'trs398-login-v1';
  var token = '';
  try {
    if (window.TRS398_LOGIN_TOKEN) localStorage.setItem(TOKEN_KEY, window.TRS398_LOGIN_TOKEN);
    token = localStorage.getItem(TOKEN_KEY) || '';
  } catch (e) { token = window.TRS398_LOGIN_TOKEN || ''; }
  if (window.TRS398_LOGIN_TOKEN) {   // drop ?t=… from the address bar
    try { google.script.history.replace(null, {}); } catch (e) { /* older runtimes */ }
  }
  function forgetToken() { token = ''; try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* storage unavailable */ } }
  function saveToken(t) { token = t; try { localStorage.setItem(TOKEN_KEY, t); } catch (e) { /* storage unavailable */ } }

  var mcp = {
    callTool: function (server, tool, input) {
      if (tool === 'download_file_content') return call('apiExportXlsx', input && input.fileId);
      if (tool === 'create_file') return call('apiAppendReport', input && input.textContent, token);
      return Promise.reject({ code: 'bad_request', message: tool });
    }
  };

  window.claude = { use: function (name) { return Promise.resolve(name === 'mcp' ? mcp : null); } };
  window.TRS398_HOST = 'apps-script';

  // Recorder's Gmail. Deployed "Execute as: Me", Google tells the script the visitor's Gmail only for the
  // owner, so everyone else types it once (kept in this browser) and the report records it.
  var RECORDER_KEY = 'trs398-recorder-v1';
  var EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
  function askRecorder() {
    var box = document.getElementById('recorderBox'), inp = document.getElementById('recorderEmail');
    if (!box || !inp) return;
    try { inp.value = localStorage.getItem(RECORDER_KEY) || ''; } catch (e) { /* storage unavailable */ }
    box.hidden = false;
    function apply() {
      var v = inp.value.trim().toLowerCase(), ok = EMAIL_RE.test(v);
      window.TRS398_USER = ok ? v : '';
      inp.classList.toggle('is-filled', ok);
      inp.classList.toggle('is-empty', !ok);
      if (ok) { try { localStorage.setItem(RECORDER_KEY, v); } catch (e) { /* storage unavailable */ } }
    }
    inp.addEventListener('input', apply);
    apply();
  }

  function el(id) { return document.getElementById(id); }
  var owned = false;   // footer line added once

  // Sign-in state on the page: who is signed in, the sign-in button, or the typed recorder box
  function applyInfo(info, checking) {
    if (!info) return;
    var badge = el('userBadge'), who = el('userEmail'), lead = badge && badge.querySelector('span'), login = el('loginBtn');
    if (!info.viaToken && token) forgetToken();   // expired or from an old secret
    if (login && info.loginUrl) login.href = info.loginHref || info.loginUrl + '?login=1&back=' + encodeURIComponent(info.appUrl || '');
    if (checking) {   // asking Google for the account signed in right now
      window.TRS398_USER = null;
      if (badge && who && lead) { lead.textContent = 'กำลังตรวจสอบบัญชี Google…'; who.textContent = ''; badge.hidden = false; }
      if (login) login.hidden = true;
    } else {
      window.TRS398_USER = info.account || '';
      if (badge && who && lead) { lead.textContent = 'เข้าสู่ระบบเป็น'; who.textContent = info.account || ''; badge.hidden = !info.account; }
      if (login) login.hidden = !!info.account || !info.loginUrl;
      if (!info.account && !info.loginUrl) askRecorder();   // sign-in not set up yet: the recorder types their Gmail
    }
    var note = el('setupNote');
    if (note) {
      var miss = info.setupMissing || [];
      note.hidden = !miss.length;
      note.textContent = miss.length ? 'ผู้ใช้อื่นยังเข้าสู่ระบบอัตโนมัติไม่ได้: ตั้งค่า ' + miss.join(', ') + ' ใน Project Settings → Script properties' : '';
    }
    var logUrl = el('logUrl'), link = el('logLink');
    if (logUrl && info.logUrl && logUrl.value !== info.logUrl) {
      logUrl.value = info.logUrl;
      logUrl.dispatchEvent(new Event('change', { bubbles: true }));   // the page saves it and updates the link
    }
    if (link && info.logUrl) link.href = info.logUrl;
    var foot = document.querySelector('footer');
    if (foot && !owned) {
      owned = true;
      var p = document.createElement('p');
      p.appendChild(document.createTextNode('ข้อมูลหลักและ Log เป็นของ '));
      var b = document.createElement('strong');
      b.setAttribute('translate', 'no');
      b.textContent = info.owner || '';
      p.appendChild(b);
      foot.insertBefore(p, foot.firstChild);
    }
  }

  function showError(err) {
    window.TRS398_USER = '';
    var badge = el('userBadge'), who = el('userEmail');
    if (badge && who) {
      who.textContent = (err && err.message) || String(err);
      var lead = badge.querySelector('span'); if (lead) lead.hidden = true;   // show only the reason
      badge.hidden = false; badge.classList.add('err');
    }
    var foot = document.querySelector('footer');
    if (!foot) return;
    var p = document.createElement('p');
    p.style.color = 'var(--bad)';
    p.textContent = (err && err.message) || String(err);
    foot.insertBefore(p, foot.firstChild);
  }

  function info(tok, then) {
    google.script.run.withSuccessHandler(then).withFailureHandler(showError).apiInfo(tok, location.origin);
  }

  // The sign-in deployment in a hidden frame answers with a token for the Google account signed in now.
  // No answer (first use needs the user's approval, or the browser blocks Google in frames): the button.
  function autoLogin(src, last) {
    var done = false, frame = document.createElement('iframe');
    frame.src = src;
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
    function finish() { done = true; window.removeEventListener('message', onMessage); if (frame.parentNode) frame.parentNode.removeChild(frame); }
    function onMessage(ev) {
      var d = ev.data;
      if (done || !/\.googleusercontent\.com$/.test(ev.origin) || !d || d.trs398 !== 'login' || !d.token) return;
      finish();
      saveToken(d.token);   // checked by the server like any other token
      info(token, function (i) { applyInfo(i); });
    }
    window.addEventListener('message', onMessage);
    document.body.appendChild(frame);
    setTimeout(function () { if (!done) { finish(); applyInfo(last); } }, 12000);
  }

  window.TRS398_USER = null;   // null = not known yet; reports are not sent until the recorder is known
  info(token, function (i) {
    if (i && i.autoLoginSrc) { applyInfo(i, true); autoLogin(i.autoLoginSrc, i); }
    else applyInfo(i);
  });
})();
