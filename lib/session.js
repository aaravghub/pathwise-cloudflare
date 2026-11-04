// Sealed sign-in sessions: the Genesis login is encrypted with SESSION_SECRET (a Cloudflare secret),
// so the browser can stay signed in across reloads without ever holding the password in readable form.
// Rotating SESSION_SECRET signs everyone out.
const DAYS = 30;
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const keyFor = async secret => crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', enc.encode(secret)), 'AES-GCM', false, ['encrypt', 'decrypt']);

export async function seal(env, user, pass) {
  if (!env?.SESSION_SECRET) return '';   // not configured: sign-in still works, it just won't survive a reload
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = enc.encode(JSON.stringify({ u: user, p: pass, exp: Date.now() + DAYS * 864e5 }));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFor(env.SESSION_SECRET), body));
  const out = new Uint8Array(iv.length + ct.length); out.set(iv); out.set(ct, iv.length);
  return b64(out);
}

// Returns {user, pass} from either plain credentials or a sealed session; empty strings when neither is valid.
export async function credentials(env, body) {
  if (typeof body?.user === 'string' && typeof body?.pass === 'string') return { user: body.user, pass: body.pass };
  if (typeof body?.session !== 'string' || !env?.SESSION_SECRET || body.session.length > 4096) return { user: '', pass: '' };
  try {
    const raw = unb64(body.session);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, await keyFor(env.SESSION_SECRET), raw.slice(12));
    const { u, p, exp } = JSON.parse(dec.decode(plain));
    return exp > Date.now() && typeof u === 'string' && typeof p === 'string' ? { user: u, pass: p } : { user: '', pass: '' };
  } catch { return { user: '', pass: '' }; }   // tampered, wrong secret or malformed: treat as signed out
}
