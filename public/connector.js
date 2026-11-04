/** Pathwise Cloudflare connector. Credentials remain in page memory only. */
(() => {
  'use strict';
  let credentials = null;
  // A sealed session from /api/login keeps you signed in across reloads; the password itself is never stored.
  const SESSION_KEY = 'pathwise:session';
  const dropSession = () => { credentials = null; try { localStorage.removeItem(SESSION_KEY); } catch (_) {} };
  let lastFingerprint = '';
  const j = async (p, o) => {
    const r = await fetch(p, o);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || 'Request failed (' + r.status + ')'); e.status = r.status; e.debug = d.debug; throw e; }
    return d;
  };
  const post = (p, b) => j(p, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(b || {})
  });
  const note = msg => {
    let n = document.getElementById('pw-msg');
    const row = document.querySelector('button[data-act="login"]')?.parentElement;
    if (!n && row) { n = document.createElement('p'); n.id = 'pw-msg'; n.className = 'mu'; n.setAttribute('role', 'alert'); row.after(n); }
    if (n) n.textContent = msg;
  };
  let loadScene = null;
  function showLoginLoading() {
    let overlay = document.getElementById('pw-login-loading');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'pw-login-loading';
      overlay.setAttribute('role', 'status');
      overlay.setAttribute('aria-live', 'polite');
      overlay.innerHTML = '<div id="pw-load-scene"></div><div class="pw-load-panel"><h1>Getting your school day ready</h1><p>Signing in to Genesis and collecting your grades and schedule. Keep this tab open.</p><div class="pw-load-status"><i aria-hidden="true"></i><span id="pw-load-status-text">Connecting to Genesis…</span></div></div>';
      document.body.appendChild(overlay);
      const el = document.getElementById('pw-load-scene');
      loadScene = import('./ladder.js')
        .then(m => m.mountLadder(el, { dark: document.documentElement.dataset.theme === 'dark', labels: ['Schedule', 'Grades', 'GPA', 'Notes', 'Next steps'] }))
        .catch(() => null);
    }
    document.body.style.overflow = 'hidden';
    const b = document.querySelector('button[data-act="login"]');
    if (b) b.disabled = true;
  }
  function hideLoginLoading() {
    const overlay = document.getElementById('pw-login-loading');
    if (overlay) overlay.remove();
    if (loadScene) { loadScene.then(h => h && h.destroy()); loadScene = null; }
    document.body.style.overflow = '';
    const b = document.querySelector('button[data-act="login"]');
    if (b) b.disabled = false;
  }
  const toast = (msg, ms = 7000) => {
    let t = document.getElementById('pw-toast');
    if (!t) { t = document.createElement('div'); t.id = 'pw-toast'; t.setAttribute('role', 'status');
      document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => (t.hidden = true), ms);
  };
  function gradeFingerprint(d) {
    const list = xs => (xs || []).map(k => ({ n:k.n, g:k.g, cats:(k.cats || []).map(c => ({ n:c.n, items:(c.items || []).filter(i => !i.h).map(i => [i.n,i.s,i.m]) })) }));
    return JSON.stringify({ courses:list(d.courses), markingPeriods:Object.fromEntries(Object.entries(d.markingPeriods || {}).map(([mp,c])=>[mp,list(c)])) });
  }
  function notifyChanged() {
    if (localStorage.getItem('pathwise:alerts') !== '1' || !('Notification' in window) || Notification.permission !== 'granted') return;
    const n = new Notification('Pathwise: grades changed', { body:'Genesis has new or updated grade information. Open Pathwise to review it.' });
    n.onclick = () => { window.focus(); n.close(); };
  }
  const PERSONAL_KEYS = ['notes','done','myClubs','schoolCourses','targets','goal','w','day','clock','tourDone','customColleges','collegeStatus','clubStatus','personalEvents','show','q','st','cw','wi','markingPeriod'];
  let cloudReady = false, suppressCloudSave = false, cloudTimer = 0, cloudSaveBusy = false, cloudSaveAgain = false;
  const personalSnapshot = () => {
    const data = {};
    for (const key of PERSONAL_KEYS) if (typeof S !== 'undefined' && Object.prototype.hasOwnProperty.call(S, key)) data[key] = S[key];
    data.theme = localStorage.getItem('pathwise:theme') || 'light';
    data.accent = localStorage.getItem('pathwise:accent') || '';
    return data;
  };
  function applyPersonalData(data) {
    if (!data || typeof data !== 'object') return;
    suppressCloudSave = true;
    for (const key of PERSONAL_KEYS) if (Object.prototype.hasOwnProperty.call(data, key)) S[key] = data[key];
    if (typeof data.theme === 'string' && ['light','dark'].includes(data.theme)) {
      localStorage.setItem('pathwise:theme', data.theme);
      document.documentElement.dataset.theme = data.theme;
    }
    if (typeof data.accent === 'string' && /^#[0-9a-f]{6}$/i.test(data.accent)) {
      localStorage.setItem('pathwise:accent', data.accent);
      if (typeof applyAccent === 'function') applyAccent(data.accent, false);
    }
    suppressCloudSave = false;
  }
  async function savePersonalData() {
    if (!credentials || !S.auth || !cloudReady || suppressCloudSave) return;
    if (cloudSaveBusy) { cloudSaveAgain = true; return; }
    cloudSaveBusy = true;
    try {
      await post('/api/student-data', { ...credentials, action: 'save', data: personalSnapshot() });
    } catch (e) {
      console.warn('[Pathwise] Could not sync personal data:', e.message);
      toast('Your changes are saved on this device, but cloud sync failed. ' + e.message, 9000);
    } finally {
      cloudSaveBusy = false;
      if (cloudSaveAgain) { cloudSaveAgain = false; savePersonalData(); }
    }
  }
  function schedulePersonalSave() {
    if (!cloudReady || suppressCloudSave || !credentials || !S.auth) return;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(savePersonalData, 900);
  }
  window.addEventListener('pathwise:state-saved', schedulePersonalSave);
  async function loadPersonalData() {
    if (!credentials) return null;
    const result = await post('/api/student-data', { ...credentials, action: 'load' });
    return result.data || null;
  }
  function adopt(d) {
    const identityChanged = !d.accountKey || !S.accountKey || S.accountKey !== d.accountKey;
    if (identityChanged) {
      S.notes = { goals:'', free:'', hw:[], join:[] }; S.done=[]; S.myClubs=[]; S.schoolCourses=[]; S.targets=[];
      S.goal='eng'; S.w={AP:1,Honors:0.5,CP:0}; S.day='A'; S.clock=''; S.tourDone=0;
    }
    const old = new Map(identityChanged ? [] : (S.courses || []).map(k => [k.n,k]));
    const hydrate = incoming => (incoming || []).map(raw => {
      const k = structuredClone(raw), o = old.get(k.n); k.target = o && Number.isFinite(+o.target) ? +o.target : 90;
      if (o) (k.cats || []).forEach(c => { const oc=(o.cats||[]).find(x=>x.n===c.n); if(oc) c.items.push(...oc.items.filter(i=>i.h)); });
      return k;
    });
    const previouslySelectedMp = !identityChanged ? S.markingPeriod : '';
    const savedPeriods = !identityChanged ? (S.markingPeriods || {}) : {};
    S.markingPeriods = { ...savedPeriods };
    Object.entries(d.markingPeriods || {}).forEach(([mp,courses]) => { S.markingPeriods[mp]=hydrate(courses); });
    S.markingPeriod = previouslySelectedMp && S.markingPeriods[previouslySelectedMp] ? previouslySelectedMp : (d.markingPeriod || previouslySelectedMp || 'MP1');
    S.courses = S.markingPeriods[S.markingPeriod] || hydrate(d.courses || []);
    if (S.markingPeriods[S.markingPeriod]) S.markingPeriods[S.markingPeriod] = S.courses;
    S.schedule = Array.isArray(d.schedule) ? d.schedule : []; S.school='sb'; S.demo=0; S.auth=1; S.open=null;
    if (d.accountKey) S.accountKey=d.accountKey;
    if (d.name) S.name=d.name; else if (identityChanged) S.name='Genesis Student';
    if (Number(d.grade)>=9 && Number(d.grade)<=12) S.grade=Number(d.grade); else if (identityChanged) S.grade=0;
    save(); render();
    if (window.pathwiseMaybeTour) setTimeout(window.pathwiseMaybeTour, 250);
  }
  async function syncFromGenesis({ manual = false } = {}) {
    if (!credentials) throw new Error('Sign in again to sync.');
    const d = await post('/api/sync', credentials), nextFingerprint = gradeFingerprint(d);
    const changed = !!lastFingerprint && nextFingerprint !== lastFingerprint;
    const personalBefore = cloudReady ? personalSnapshot() : null;
    adopt(d);
    if (personalBefore) applyPersonalData(personalBefore);
    lastFingerprint = nextFingerprint;
    localStorage.setItem('pathwise:lastSync', String(Date.now())); syncUI();
    if (changed) notifyChanged();
    if (manual) toast(d.scheduleWarning ? 'Sync finished. Schedule warning: ' + d.scheduleWarning : 'Grades and schedule synced with Genesis.');
    return d;
  }  // The sync button lives in the header markup and stays visible whenever someone is signed in.
  // Without credentials in memory (demo, page reload, expired session) it offers sign-in instead of vanishing.
  let syncBusy = false;
  const syncTime = () => { const t = +localStorage.getItem('pathwise:lastSync'); return t ? new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''; };
  function syncUI() {
    const b = document.getElementById('pw-sync'), when = document.getElementById('pw-sync-when');
    if (!b || typeof S === 'undefined') return;
    b.hidden = !S.auth;
    if (when) when.textContent = S.auth && credentials && syncTime() ? 'Synced ' + syncTime() : '';
    if (syncBusy) return;
    b.classList.toggle('idle', !credentials);
    b.querySelector('.sync-t').textContent = credentials ? 'Sync now' : 'Sign in to sync';
    b.title = credentials ? 'Pull the latest grades and schedule from Genesis' : 'Sign in with Genesis to sync live grades';
  }
  window.pathwiseSyncUI = syncUI;
  document.addEventListener('click', async e => {
    const b = e.target.closest('#pw-sync'); if (!b || syncBusy) return;
    if (!credentials) { dropSession(); S.auth = 0; save(); render(); document.getElementById('gu')?.focus(); return; }
    syncBusy = true; b.disabled = true; b.classList.add('busy'); b.querySelector('.sync-t').textContent = 'Syncing…';
    try { await syncFromGenesis({ manual: true }); }
    catch (err) {
      if (err.status === 401) { dropSession(); toast('Genesis sign-in expired or was rejected. Sign in again to sync.'); }
      else toast('Sync failed: ' + err.message);
    }
    syncBusy = false; b.disabled = false; b.classList.remove('busy'); syncUI();
  });
  async function attemptLogin() {
    const u = document.getElementById('gu'), p = document.getElementById('gp');
    const user = u && u.value.trim(), pass = p && p.value;
    if (!user || !pass) { note('Enter your Genesis username and password.'); (user ? p : u)?.focus(); return; }
    showLoginLoading();
    const status = document.getElementById('pw-load-status-text');
    try {
      if (status) status.textContent = 'Connecting to Genesis…';
      const d = await post('/api/login', { user, pass });
      if (status) status.textContent = 'Loading your saved Pathwise notes and homework…';
      credentials = d.session ? { session: d.session } : { user, pass }; delete d.session;
      if (credentials.session) localStorage.setItem(SESSION_KEY, credentials.session); else localStorage.removeItem(SESSION_KEY);
      localStorage.setItem('pathwise:lastSync', String(Date.now())); cloudReady = false; lastFingerprint = gradeFingerprint(d); p.value = '';
      let savedPersonal = null, personalLoaded = false;
      try { savedPersonal = await loadPersonalData(); personalLoaded = true; }
      catch (cloudError) { console.warn('[Pathwise] Personal-data load failed:', cloudError.message); }
      adopt(d);
      if (savedPersonal) applyPersonalData(savedPersonal);
      cloudReady = personalLoaded;
      if (cloudReady) {
        save();
        if (!savedPersonal) schedulePersonalSave();
      } else {
        toast('Grades and schedule loaded, but saved notes/homework could not be loaded. Your cloud data was not overwritten. Reload and sign in again to retry.', 10000);
      }
      hideLoginLoading();
      note('');
      toast(d.scheduleWarning ? 'Genesis connected, but schedule needs attention: ' + d.scheduleWarning : 'Connected. Grades will auto-sync every 10 minutes while this tab stays open.');
    } catch (err) {
      hideLoginLoading();
      if (err.debug) console.error('Pathwise gradebook parser diagnostics:', err.debug);
      note(err.message + (err.debug ? ' (debug details are in your browser console)' : ''));
      if (p) p.value = ''; credentials = null; lastFingerprint = '';
    }
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('button[data-act="login"]'); if (!b) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (b.disabled) return;
    attemptLogin();
  }, true);
  document.addEventListener('submit', e => {
    if (e.target?.id !== 'genesis-login-form') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!document.querySelector('button[data-act="login"]')?.disabled) attemptLogin();
  }, true);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const target = e.target;
    if (!target || !['gu','gp'].includes(target.id)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!document.querySelector('button[data-act="login"]')?.disabled) attemptLogin();
  }, true);
  setInterval(async () => {
    // The timer exists only while this page is open. Never poll if signed out.
    if (!credentials || !S.auth) return;
    try { await syncFromGenesis(); }
    catch (e) {
      if (e.status === 401) { dropSession(); lastFingerprint = ''; syncUI(); toast('Automatic sync paused. Sign in to Genesis again.'); }
      else console.warn('[Pathwise] Automatic sync failed:', e.message);
    }
  }, 10 * 60 * 1000);
  document.addEventListener('click', e => {
    if (!e.target.closest('button[data-act="logout"]')) return;
    dropSession(); lastFingerprint = ''; cloudReady = false; clearTimeout(cloudTimer);
  }, true);
  // After a reload: pick the saved session back up, restore cloud notes, then refresh grades in the background.
  (async () => {
    const saved = localStorage.getItem(SESSION_KEY);
    if (!saved || typeof S === 'undefined' || !S.auth || S.demo) return;
    credentials = { session: saved }; syncUI();
    try { const data = await loadPersonalData(); if (data) applyPersonalData(data); cloudReady = true; save(); render(); }
    catch (e) { if (e.status === 401) { dropSession(); syncUI(); toast('Your saved sign-in expired. Sign in to Genesis again to sync.'); return; } }
    try { await syncFromGenesis(); } catch (e) { if (e.status === 401) { dropSession(); syncUI(); } }
  })();
  syncUI();
})();
