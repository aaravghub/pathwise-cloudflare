import { createHash } from 'node:crypto';
import { Genesis, pull } from '../../lib/genesis.js';

export async function onRequestPost({ request }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { user, pass } = body || {};
    if (typeof user !== 'string' || typeof pass !== 'string' || !user.trim() || !pass) return Response.json({ error: 'Username and password required' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    const g = new Genesis();
    g.accountKey = createHash('sha256').update(user.trim().toLowerCase()).digest('hex').slice(0, 24);
    await g.login(user.trim(), pass);
    return Response.json(await pull(g), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const message = String(e?.message || 'Could not sign in to Genesis');
    const status = /rejected the login|could not find a student id|SSO|MFA/i.test(message) ? 401 : 502;
    return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
export async function onRequest({ request }) { if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } }); }
