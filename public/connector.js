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
  document.addEventListener('click', async e => {
    const b = e.target.closest('button[data-act="login"]'); if (!b) return;
    e.stopImmediatePropagation(); e.preventDefault();
    const u = document.getElementById('gu'), p = document.getElementById('gp');
    const user = u && u.value.trim(), pass = p && p.value;
    if (!user || !pass) return note('Enter your Genesis username and password.');
    b.disabled = true; note('Signing in and retrieving grades… this may take a little while.');
    try {
      const d = await post('/api/login', { user, pass });
      credentials = { user, pass }; lastFingerprint = gradeFingerprint(d); p.value = ''; adopt(d);
      note('');
      toast(d.scheduleWarning ? 'Genesis connected, but schedule needs attention: ' + d.scheduleWarning : 'Connected. Grades will auto-sync every 10 minutes while this tab stays open.');
    } catch (err) { if (err.debug) console.error('Pathwise gradebook parser diagnostics:', err.debug); note(err.message + (err.debug ? ' (debug details are in your browser console)' : '')); if (p) p.value = ''; credentials = null; lastFingerprint = ''; }
    b.disabled = false;
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
