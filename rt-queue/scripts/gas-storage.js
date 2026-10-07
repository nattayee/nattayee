
  // Google Apps Script: Code.gs functions via google.script.run, signed in with LPCH RO Workspace.
  // Inserted into apps-script/Index.html by scripts/build.js.
  const TOKEN_KEY = 'rtq-workspace-token';
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
    token = t;
    try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  }

  // Shows the sign-in dialog; resolves with the user once the Workspace accepts the password.
  let pendingSignIn = null;
  function signIn(message) {
    if (!pendingSignIn) {
      pendingSignIn = new Promise((resolve) => {
        $('loginForm').onsubmit = async (e) => {
          e.preventDefault();
          const login = $('l-user').value.trim(), password = $('l-pass').value;
          if (!login || !password) { $('loginError').textContent = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'; return; }
          $('loginBtn').disabled = true;
          $('loginError').textContent = '';
          try {
            const res = await gs('login', login, password);
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
      if (err.message !== 'session_expired') throw err;
      saveToken('');
      signIn('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง').then(afterSignIn);
      throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบแล้วลองอีกครั้ง');
    }
  }

  $('logoutBtn').addEventListener('click', async () => {
    const old = token;
    saveToken('');
    gs('logout', old).catch(() => { /* the session is dropped locally either way */ });
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
    // Opened from LPCH RO Workspace with ?sso=<ticket>: exchange it for a session, then drop it from the URL.
    const params = await new Promise((resolve) => {
      try { google.script.url.getLocation((loc) => resolve((loc && loc.parameter) || {})); } catch { resolve({}); }
    });
    let message = '';
    if (params.sso) {
      try {
        const res = await gs('ssoLogin', params.sso);
        saveToken(res.token);
      } catch (err) {
        message = err.message;
      }
      try { google.script.history.replace(null, {}, ''); } catch { /* not available */ }
    }
    for (;;) {
      if (!token) await signIn(message);
      try {
        const data = await gs('getInitData', token);
        return { ...data, mode: 'บันทึกใน Google Sheets', csv: false };
      } catch (err) {
        if (err.message !== 'session_expired') throw err;
        saveToken('');
        message = 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง';
      }
    }
  }
