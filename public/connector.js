/** Pathwise Vercel connector.
 * Credentials are held in page memory only and sent over HTTPS for each sync.
 * Vercel functions do not keep a reliable process/session alive between requests.
 */
(() => {
  'use strict';
  let credentials = null;
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
  function showLoginLoading() {
    let overlay = document.getElementById('pw-login-loading');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'pw-login-loading';
      overlay.setAttribute('role', 'status');
      overlay.setAttribute('aria-live', 'polite');
      overlay.innerHTML = `<div class="pw-load-orbit"><span></span><span></span><span></span><div class="pw-load-mark">P</div></div><div class="pw-load-eyebrow">PATHWISE CONNECT</div><h1>Getting your school day ready</h1><p class="pw-load-copy">Connecting securely to Genesis and gathering your grades and schedule.</p><div class="pw-load-track"><i></i></div><div class="pw-load-status"><span class="pw-load-dot"></span><span id="pw-load-status-text">Connecting to Genesis…</span></div><div class="pw-load-foot">This can take a little while. Keep this tab open.</div>`;
      const style = document.createElement('style');
      style.id = 'pw-login-loading-style';
      style.textContent = `#pw-login-loading{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;padding:28px;text-align:center;color:#edf7f0;background:radial-gradient(ellipse at 50% 38%,rgba(28,113,78,.38),transparent 38%),radial-gradient(ellipse at 15% 85%,rgba(34,94,68,.18),transparent 42%),#08120e;font-family:'Plus Jakarta Sans',system-ui,sans-serif;animation:pw-load-in .35s ease both}#pw-login-loading:before,#pw-login-loading:after{content:"";position:absolute;width: min(78vw,680px);aspect-ratio:1;border:1px solid rgba(132,220,173,.09);border-radius:50%;pointer-events:none;animation:pw-load-ring 18s linear infinite}#pw-login-loading:after{width:min(58vw,500px);animation-direction:reverse;border-style:dashed}#pw-login-loading>*{position:relative;z-index:1}#pw-login-loading .pw-load-orbit{width:116px;height:116px;position:relative;display:grid;place-items:center;margin-bottom:32px}#pw-login-loading .pw-load-orbit:before,#pw-login-loading .pw-load-orbit:after{content:"";position:absolute;inset:0;border-radius:32px;border:1px solid rgba(126,230,174,.42);animation:pw-load-pulse 2.2s ease-in-out infinite}#pw-login-loading .pw-load-orbit:after{inset:-11px;border-color:rgba(126,230,174,.17);animation-delay:.5s}#pw-login-loading .pw-load-orbit span{position:absolute;width:8px;height:8px;border-radius:50%;background:#8ff0b9;box-shadow:0 0 18px #69d99c;animation:pw-load-orbit 3.4s linear infinite}#pw-login-loading .pw-load-orbit span:nth-child(2){animation-delay:-1.1s}#pw-login-loading .pw-load-orbit span:nth-child(3){animation-delay:-2.2s}#pw-login-loading .pw-load-mark{width:76px;height:76px;display:grid;place-items:center;border-radius:24px;background:linear-gradient(145deg,#1d8c61,#10513a);border:1px solid rgba(207,255,226,.36);box-shadow:0 12px 55px rgba(34,190,119,.2);font-size:38px;font-weight:800;letter-spacing:-3px;animation:pw-load-float 3s ease-in-out infinite}#pw-login-loading .pw-load-eyebrow{font-size:11px;letter-spacing:3px;font-weight:800;color:#8fe6b4;margin-bottom:14px}#pw-login-loading h1{font-size:clamp(29px,5vw,48px);line-height:1.1;letter-spacing:-1.6px;max-width:660px;margin:0;font-weight:800}#pw-login-loading .pw-load-copy{max-width:440px;color:#afc8b9;font-size:15px;line-height:1.7;margin:18px 0 30px}#pw-login-loading .pw-load-track{width:min(340px,82vw);height:5px;border-radius:9px;background:rgba(219,255,232,.12);overflow:hidden}#pw-login-loading .pw-load-track i{display:block;width:38%;height:100%;border-radius:9px;background:linear-gradient(90deg,#3fcf88,#b4ffd0,#3fcf88);background-size:200% 100%;animation:pw-load-progress 1.7s ease-in-out infinite}#pw-login-loading .pw-load-status{display:flex;align-items:center;gap:9px;margin-top:18px;font-size:13px;font-weight:700;color:#d7f3e2}#pw-login-loading .pw-load-dot{width:7px;height:7px;border-radius:50%;background:#72e8a4;box-shadow:0 0 12px #72e8a4;animation:pw-load-blink 1.3s ease-in-out infinite}#pw-login-loading .pw-load-foot{margin-top:42px;font-size:12px;color:#769283;letter-spacing:.2px}@keyframes pw-load-in{from{opacity:0}to{opacity:1}}@keyframes pw-load-ring{to{transform:rotate(360deg)}}@keyframes pw-load-pulse{0%,100%{transform:scale(.96);opacity:.45}50%{transform:scale(1.05);opacity:1}}@keyframes pw-load-orbit{from{transform:rotate(0deg) translateX(58px) rotate(0deg)}to{transform:rotate(360deg) translateX(58px) rotate(-360deg)}}@keyframes pw-load-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}@keyframes pw-load-progress{0%{transform:translateX(-110%);background-position:0% 50%}100%{transform:translateX(280%);background-position:100% 50%}}@keyframes pw-load-blink{0%,100%{opacity:.45}50%{opacity:1}}@media(prefers-reduced-motion:reduce){#pw-login-loading *,#pw-login-loading:before,#pw-login-loading:after{animation:none!important}}`;
      document.head.appendChild(style);
      document.body.appendChild(overlay);
    }
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    const b = document.querySelector('button[data-act="login"]');
    if (b) b.disabled = true;
  }
  function hideLoginLoading() {
    const overlay = document.getElementById('pw-login-loading');
    if (overlay) overlay.remove();
    document.body.style.overflow = '';
    const b = document.querySelector('button[data-act="login"]');
    if (b) b.disabled = false;
  }
  const toast = (msg, ms = 7000) => {
    let t = document.getElementById('pw-toast');
    if (!t) { t = document.createElement('div'); t.id = 'pw-toast'; t.setAttribute('role', 'status');
      t.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;max-width:520px;margin:0 auto;background:var(--acc);color:var(--accink);padding:12px 16px;border-radius:14px;font-weight:700;font-size:14px;white-space:pre-line;z-index:50;box-shadow:0 6px 24px rgba(0,0,0,.25)';
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
    save(); render(); addSyncBtn();
    if (window.pathwiseMaybeTour) setTimeout(window.pathwiseMaybeTour, 250);
  }
  async function syncFromGenesis({ manual = false } = {}) {
    if (!credentials) throw new Error('Sign in again to sync.');
    const d = await post('/api/sync', credentials), nextFingerprint = gradeFingerprint(d);
    const changed = !!lastFingerprint && nextFingerprint !== lastFingerprint;
    adopt(d); lastFingerprint = nextFingerprint;
    if (changed) notifyChanged();
    if (manual) toast(d.scheduleWarning ? 'Sync finished. Schedule warning: ' + d.scheduleWarning : 'Grades and schedule synced with Genesis.');
    return d;
  }  function addSyncBtn() {
    if (document.getElementById('pw-sync') || !S.auth) return;
    const so = document.getElementById('so'); if (!so) return;
    const b = document.createElement('button'); b.className = 'btn'; b.id = 'pw-sync'; b.textContent = 'Sync now';
    b.onclick = async () => {
      if (!credentials) { toast('Sign in again to sync.'); return; }
      b.disabled = true; b.textContent = 'Syncing…';
      try { await syncFromGenesis({ manual:true }); }
      catch (e) { toast('Sync failed: ' + e.message); if (e.status === 401) { credentials = null; b.remove(); toast('Genesis sign-in expired or was rejected. Sign in again before syncing.'); } }
      b.disabled = false; if (document.getElementById('pw-sync')) b.textContent = 'Sync now';
    };
    so.before(b, ' ');
  }
  async function attemptLogin() {
    const u = document.getElementById('gu'), p = document.getElementById('gp');
    const user = u && u.value.trim(), pass = p && p.value;
    if (!user || !pass) { note('Enter your Genesis username and password.'); (user ? p : u)?.focus(); return; }
    showLoginLoading();
    const status = document.getElementById('pw-load-status-text');
    try {
      if (status) status.textContent = 'Connecting to Genesis…';
      const d = await post('/api/login', { user, pass });
      if (status) status.textContent = 'Organizing your grades and schedule…';
      credentials = { user, pass }; lastFingerprint = gradeFingerprint(d); p.value = ''; adopt(d);
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
      if (e.status === 401) { credentials = null; lastFingerprint = ''; const b=document.getElementById('pw-sync'); if(b)b.remove(); toast('Automatic sync paused. Sign in to Genesis again.'); }
      else console.warn('[Pathwise] Automatic sync failed:', e.message);
    }
  }, 10 * 60 * 1000);
  document.addEventListener('click', e => {
    if (!e.target.closest('button[data-act="logout"]')) return;
    credentials = null; lastFingerprint = '';
    const sync = document.getElementById('pw-sync'); if (sync) sync.remove();
  }, true);
})();
