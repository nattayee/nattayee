
  // Google Apps Script: Code.gs functions via google.script.run, signed in with LPCH RO Workspace
  // (same flow as TRS-398 / Linac QA). Inserted into apps-script/Index.html by scripts/build.js.
  // The LPCH session token is kept in this browser and sent with every call; Code.gs checks it with LPCH.
  // It arrives from LPCH ("เข้าสู่ระบบอัตโนมัติ", ?sso=… exchanged by doGet) or from the sign-in dialog.
  const TOKEN_KEY = 'rt-queue:lpch';
  const gs = (fn, ...args) => new Promise((resolve, reject) => {
    const runner = google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler((err) => reject(new Error((err && err.message || String(err)).replace(/^(Error|Exception):\s*/, ''))));
    // google.script.run only has the functions of the deployed Code.gs
    if (typeof runner[fn] !== 'function') {
      reject(new Error(`Code.gs ในโปรเจกต์ Apps Script ยังเป็นเวอร์ชันเก่า (ไม่มีฟังก์ชัน ${fn}) — ผู้ดูแลระบบ: วาง Code.gs ใหม่, Run setup แล้ว Deploy เวอร์ชันใหม่`));
      return;
    }
    runner[fn](...args);
  });

  let token = '';
  try { token = localStorage.getItem(TOKEN_KEY) || ''; } catch { /* storage blocked: sign in each visit */ }
  function saveToken(t) {
    token = t || '';
    try { if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  }
  let ssoError = window.RTQ_LPCH_ERROR || '';
  if (window.RTQ_LPCH_TOKEN) saveToken(window.RTQ_LPCH_TOKEN);
  if (window.RTQ_LPCH_TOKEN || window.RTQ_LPCH_ERROR) {   // drop ?sso=… from the address bar
    try { google.script.history.replace(null, {}, ''); } catch { /* not available */ }
  }
  // Code.gs reports a missing/expired/refused sign-in as "session_expired: <reason>".
  const expiredReason = (err) => /^session_expired/.test(err.message)
    ? (err.message.replace(/^session_expired:?\s*/, '') || 'การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง') : null;

  // Shows the sign-in dialog; resolves with the user once the Workspace accepts the password.
  let pendingSignIn = null;
  function signIn(message) {
    if (!pendingSignIn) {
      pendingSignIn = new Promise((resolve) => {
        $('loginForm').onsubmit = async (e) => {
          e.preventDefault();
          const login = $('l-user').value.trim(), password = $('l-pass').value;
          if (!login || !password) { $('loginError').textContent = 'กรุณากรอกชื่อผู้ใช้ (หรืออีเมล) และรหัสผ่าน'; return; }
          $('loginBtn').disabled = true;
          $('loginError').textContent = '';
          try {
            const res = await gs('lpchLogin', login, password);
            saveToken(res.token);
            $('l-pass').value = '';
            $('loginDlg').close();
            pendingSignIn = null;
            resolve(res.user);
          } catch (err) {
            $('loginError').textContent = err.message;
          } finally {
            $('loginBtn').disabled = false;
          }
        };
      });
    }
    $('loginError').textContent = message || '';
    if (!$('loginDlg').open) $('loginDlg').showModal();
    ($('l-user').value ? $('l-pass') : $('l-user')).focus();
    return pendingSignIn;
  }
  $('loginDlg').addEventListener('cancel', (e) => e.preventDefault());

  async function afterSignIn(user) {
    setUser(user);
    try { await reload(); } catch (err) { toast(err.message); }
  }

  // Calls a Code.gs function with the session token; an expired session asks to sign in again.
  async function call(fn, ...args) {
    try {
      return await gs(fn, token, ...args);
    } catch (err) {
      const why = expiredReason(err);
      if (why === null) throw err;
      saveToken('');
      signIn(why).then(afterSignIn);
      throw new Error('ต้องเข้าสู่ระบบใหม่ก่อน แล้วลองอีกครั้ง');
    }
  }

  $('logoutBtn').addEventListener('click', async () => {
    const old = token;
    saveToken('');
    gs('lpchLogout', old).catch(() => { /* the session is dropped locally either way */ });
    setUser(null);
    state.bookings = [];
    render();
    afterSignIn(await signIn());
  });

  const store = {
    list: () => call('listBookings'),
    create: (b) => call('createBooking', b),
    update: (id, b) => call('updateBooking', id, b),
    remove: (id) => call('deleteBooking', id),
  };

  async function initStore() {
    let message = ssoError;
    ssoError = '';
    for (;;) {
      if (!token) await signIn(message);
      try {
        const data = await gs('getInitData', token);
        return { ...data, mode: 'บันทึกใน Google Sheets', csv: false };
      } catch (err) {
        const why = expiredReason(err);
        if (why === null) throw err;
        saveToken('');
        message = why;
      }
    }
  }
  