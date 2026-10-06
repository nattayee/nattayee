/*
 * Google Apps Script bridge. When the page runs as an Apps Script web app (google.script.run exists
 * and there is no claude.ai viewer), it provides the same claude.use('mcp') interface the page uses
 * in claude.ai, backed by the server functions in WebApp.gs:
 *   download_file_content → apiExportXlsx(fileId)
 *   create_file           → apiAppendReport(csvText)   (writes straight to the Log tab)
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

  // Login token from the Login app (TRS-398 Login): arrives once in the page, then kept in this browser
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

  // Log link/field point at the shared Log
  window.TRS398_USER = null;   // null = not known yet; reports are not sent until the recorder is known
  google.script.run
    .withSuccessHandler(function (info) {
      if (!info) return;
      window.TRS398_USER = info.account || '';
      var badge = document.getElementById('userBadge'), who = document.getElementById('userEmail');
      var login = document.getElementById('loginBtn'), logout = document.getElementById('logoutBtn');
      if (badge && who) { who.textContent = info.account || ''; badge.hidden = !info.account; }
      if (!info.viaToken && token) forgetToken();   // expired or from an old secret
      if (logout) {
        logout.hidden = !info.viaToken;
        logout.onclick = function () {
          forgetToken();
          window.TRS398_USER = '';
          badge.hidden = true; logout.hidden = true;
          if (login && info.loginUrl) login.hidden = false;
        };
      }
      if (login && info.loginUrl) login.href = info.loginUrl + '?back=' + encodeURIComponent(info.appUrl || '');
      if (!info.account) {
        if (login && info.loginUrl) login.hidden = false;   // "Sign in with Google" through the Login app
        else askRecorder();                                 // not set up yet: the recorder types their Gmail
      }
      var logUrl = document.getElementById('logUrl'), link = document.getElementById('logLink');
      if (logUrl && info.logUrl) {
        logUrl.value = info.logUrl;
        logUrl.dispatchEvent(new Event('change', { bubbles: true }));   // the page saves it and updates the link
      }
      if (link && info.logUrl) link.href = info.logUrl;
      var foot = document.querySelector('footer');
      if (foot) {
        var p = document.createElement('p');
        p.appendChild(document.createTextNode('ข้อมูลหลักและ Log เป็นของ '));
        var b = document.createElement('strong');
        b.setAttribute('translate', 'no');
        b.textContent = info.owner || '';
        p.appendChild(b);
        foot.insertBefore(p, foot.firstChild);
      }
    })
    .withFailureHandler(function (err) {
      window.TRS398_USER = '';
      var badge = document.getElementById('userBadge'), who = document.getElementById('userEmail');
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
    })
    .apiInfo(token);
})();
