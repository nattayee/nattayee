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

  function call(fn, arg) {
    return new Promise(function (resolve, reject) {
      google.script.run
        .withSuccessHandler(function (payload) { resolve({ payload: payload }); })
        .withFailureHandler(function (err) { reject({ code: 'tool_error', message: (err && err.message) || String(err) }); })[fn](arg);
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

  // Show the Google account the web app runs as, and point the Log link/field at that account's Log
  google.script.run
    .withSuccessHandler(function (info) {
      if (!info) return;
      var logUrl = document.getElementById('logUrl'), link = document.getElementById('logLink');
      if (logUrl && info.logUrl) {
        logUrl.value = info.logUrl;
        logUrl.dispatchEvent(new Event('change', { bubbles: true }));   // the page saves it and updates the link
      }
      if (link && info.logUrl) link.href = info.logUrl;
      var foot = document.querySelector('footer');
      if (foot) {
        var p = document.createElement('p');
        p.appendChild(document.createTextNode('บัญชี Google ที่ใช้ดึงข้อมูลและบันทึกรายงาน: '));
        var b = document.createElement('strong');
        b.setAttribute('translate', 'no');
        b.textContent = info.account || '';
        p.appendChild(b);
        foot.insertBefore(p, foot.firstChild);
      }
    })
    .withFailureHandler(function (err) {
      var foot = document.querySelector('footer');
      if (!foot) return;
      var p = document.createElement('p');
      p.style.color = 'var(--bad)';
      p.textContent = (err && err.message) || String(err);
      foot.insertBefore(p, foot.firstChild);
    })
    .apiInfo();
})();
