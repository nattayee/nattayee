/*
 * Google Apps Script bridge. When the page runs as an Apps Script web app (google.script.run exists
 * and there is no claude.ai viewer), it provides the same claude.use('mcp') interface the page uses
 * in claude.ai, backed by the server functions in WebApp.gs:
 *   download_file_content → apiExportXlsx(fileId, token)
 *   create_file           → apiAppendReport(csvText, token)   (writes straight to the Log tab)
 * Errors come back as {code: 'tool_error', message} so the page's existing messages apply.
 *
 * Sign-in gate: the app stays covered until the person is signed in with Google (nattayee directly, everyone
 * else through the sign-in deployment). A sign-in is remembered for 7 days in this browser (the token's own
 * expiry); after that the gate asks again. Calls to the server wait until the sign-in is confirmed.
 */
(function () {
  'use strict';
  if (window.claude || !(window.google && google.script && google.script.run)) return;

  function el(id) { return document.getElementById(id); }

  // ---- Token from the sign-in deployment (?login=1): arrives once in the page, then kept in this browser
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
  // The email inside a token (its first part is base64 "email|expiry"); the server checks the signature
  function tokenEmail(t) {
    try { return decodeURIComponent(escape(atob(String(t).split('.')[0].replace(/-/g, '+').replace(/_/g, '/')))).split('|')[0]; }
    catch (e) { return ''; }
  }

  // ---- Server calls, held until the sign-in is confirmed
  var markSignedIn;
  var signedIn = new Promise(function (resolve) { markSignedIn = resolve; });
  function call(fn) {
    var args = [].slice.call(arguments, 1);
    return signedIn.then(function () {
      return new Promise(function (resolve, reject) {
        var run = google.script.run
          .withSuccessHandler(function (payload) { resolve({ payload: payload }); })
          .withFailureHandler(function (err) { reject({ code: 'tool_error', message: (err && err.message) || String(err) }); });
        run[fn].apply(run, args.concat([token]));
      });
    });
  }
  var mcp = {
    callTool: function (server, tool, input) {
      if (tool === 'download_file_content') return call('apiExportXlsx', input && input.fileId);
      if (tool === 'create_file') return call('apiAppendReport', input && input.textContent);
      return Promise.reject({ code: 'bad_request', message: tool });
    }
  };
  window.claude = { use: function (name) { return Promise.resolve(name === 'mcp' ? mcp : null); } };
  window.TRS398_HOST = 'apps-script';
  window.TRS398_USER = null;   // null = not known yet; reports are not sent until the recorder is known

  // ---- Gate
  function gate(state, text, href) {
    var g = el('gate');
    if (!g) return;
    var msg = el('gateMsg'), btn = el('gateLogin'), wait = el('gateWait');
    if (state === 'open') {
      g.hidden = true;
      document.documentElement.classList.remove('gated');
      return;
    }
    g.hidden = false;
    document.documentElement.classList.add('gated');
    var logo = el('gateLogo'), brand = document.querySelector('.brand-logo');
    if (logo && !logo.src && brand) logo.src = brand.src;
    if (wait) wait.hidden = state !== 'checking';
    if (msg) { msg.textContent = text || ''; msg.className = 'gate-msg' + (state === 'error' ? ' err' : ''); }
    if (btn) { btn.hidden = !(state === 'login' && href); if (href) btn.href = href; }
  }
  gate('checking', 'กำลังตรวจสอบบัญชี Google…');

  var owned = false;   // footer line added once
  function enter(info) {
    window.TRS398_USER = info.account;
    var badge = el('userBadge'), who = el('userEmail');
    if (badge && who) { who.textContent = info.account; badge.hidden = false; badge.classList.remove('err'); }
    var note = el('setupNote'), miss = info.setupMissing || [];
    if (note) {
      note.hidden = !miss.length;
      note.textContent = miss.length ? 'ผู้ใช้อื่นยังเข้าสู่ระบบไม่ได้: ตั้งค่า ' + miss.join(', ') + ' ใน Project Settings → Script properties' : '';
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
    gate('open');
    markSignedIn();
  }

  function askLogin(info) {
    window.TRS398_USER = '';
    if (info && info.loginHref) gate('login', 'กรุณาเข้าสู่ระบบด้วยบัญชี Gmail ก่อนใช้งาน', info.loginHref);
    else gate('error', 'ยังเข้าสู่ระบบไม่ได้ เพราะผู้ดูแลยังไม่ได้ตั้งค่า LOGIN_URL แจ้ง ' + ((info && info.owner) || 'ผู้ดูแล'));
  }

  function info(tok, then) {
    google.script.run.withSuccessHandler(then).withFailureHandler(function (err) {
      window.TRS398_USER = '';
      gate('error', (err && err.message) || String(err));
    }).apiInfo(tok, location.origin);
  }

  // The sign-in deployment in a hidden frame answers with a token for the Google account signed in now.
  // onToken(t) gets it; onNone() when nothing comes (first use needs approval, or the browser blocks it).
  function autoLogin(src, onToken, onNone) {
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
      onToken(d.token);
    }
    window.addEventListener('message', onMessage);
    document.body.appendChild(frame);
    setTimeout(function () { if (!done) { finish(); onNone(); } }, 12000);
  }

  info(token, function (i) {
    if (!i) { askLogin(null); return; }
    if (!i.viaToken && token) forgetToken();   // expired (7 days) or from an old secret
    if (i.account) {
      enter(i);
      // Still signed in: if the browser's Google account has changed since, follow it (a new 7-day sign-in)
      if (i.viaToken && i.autoLoginSrc) {
        autoLogin(i.autoLoginSrc, function (t) {
          if (tokenEmail(t).toLowerCase() !== String(i.account).toLowerCase()) {
            saveToken(t);
            info(token, function (j) { if (j && j.account) enter(j); });
          }
        }, function () {});
      }
      return;
    }
    if (i.autoLoginSrc) {   // signed in to Google already and approved before: no click needed
      autoLogin(i.autoLoginSrc, function (t) {
        saveToken(t);
        info(token, function (j) { if (j && j.account) enter(j); else askLogin(j); });
      }, function () { askLogin(i); });
      return;
    }
    askLogin(i);
  });
})();
