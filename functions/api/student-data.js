import { createHash } from 'node:crypto';
import { Genesis } from '../../lib/genesis.js';

const headers = { 'Cache-Control': 'no-store' };
const json = (data, status = 200) => Response.json(data, { status, headers });

async function identity(user, pass) {
  if (typeof user !== 'string' || typeof pass !== 'string' || !user.trim() || !pass) {
    const e = new Error('Sign in to Genesis again to access your saved Pathwise data.');
    e.status = 401; throw e;
  }
  const g = new Genesis();
  g.accountKey = createHash('sha256').update(user.trim().toLowerCase()).digest('hex').slice(0, 24);
  await g.login(user.trim(), pass);
  return g.accountKey;
}
const allowed = new Set([
  'notes','done','myClubs','schoolCourses','targets','goal','w','day','clock','tourDone',
  'customColleges','collegeStatus','clubStatus','personalEvents','show','name','grade','school',
  'q','st','cw','wi','markingPeriod'
]);
function pickState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Invalid data.');
  const result = {};
  for (const key of allowed) if (Object.hasOwn(state, key)) result[key] = state[key];
  if (JSON.stringify(result).length > 100_000) throw new Error('Your saved Pathwise data is too large.');
  return result;
}
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'Pathwise database is not connected yet. Wait for the latest deployment.' }, 503);
  try {
    const body = await request.json();
    const accountKey = await identity(body.user, body.pass);
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS student_data (account_key TEXT PRIMARY KEY, data_json TEXT NOT NULL, updated_at TEXT NOT NULL)').run();
    if (body.action === 'load') {
      const row = await env.DB.prepare('SELECT data_json, updated_at FROM student_data WHERE account_key = ?').bind(accountKey).first();
      return json({ data: row ? JSON.parse(row.data_json) : null, updatedAt: row?.updated_at || null });
    }
    if (body.action === 'save') {
      const data = pickState(body.data);
      const updatedAt = new Date().toISOString();
      await env.DB.prepare('INSERT INTO student_data (account_key, data_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(account_key) DO UPDATE SET data_json=excluded.data_json, updated_at=excluded.updated_at')
        .bind(accountKey, JSON.stringify(data), updatedAt).run();
      return json({ ok: true, updatedAt });
    }
    return json({ error: 'Unsupported action.' }, 400);
  } catch (e) {
    const msg = String(e?.message || 'Could not access saved Pathwise data.');
    const status = e.status || (/rejected the login|could not find a student id|SSO|MFA/i.test(msg) ? 401 : 500);
    return json({ error: status === 500 ? 'Could not save or load Pathwise data. Try again later.' : msg }, status);
  }
}
export async function onRequest({ request }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST', ...headers } });
}
